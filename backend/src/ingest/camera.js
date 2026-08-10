import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import { spawnFrameGrabber, splitJpegFrames } from '../lib/ffmpeg.js';
import { resolveStreamUrl } from '../lib/ytdlp.js';
import { analyzeFrames } from '../lib/vision.js';
import { insertEvent, threatRank } from '../db.js';
import { config } from '../config.js';

const RESTART_BACKOFF_MS = [2000, 5000, 15000, 30000, 60000];

/**
 * Owns a single camera's live ingestion: spawns/restarts ffmpeg, runs
 * motion detection on the raw grayscale stream, keeps a rolling buffer of
 * recent JPEG frames, and triggers Claude vision analysis on motion or on
 * a heartbeat cadence.
 */
export class CameraWorker extends EventEmitter {
  constructor(camera, { semaphore }) {
    super();
    this.camera = camera;
    this.semaphore = semaphore;

    this.proc = null;
    this.stopped = true;
    this.restartAttempt = 0;

    this.prevMotionFrame = null;
    this.motionBuf = Buffer.alloc(0);
    this.mjpegBuffer = Buffer.alloc(0);

    this.frameRing = []; // [{ buf, ts }]
    this.latestFrame = null;
    this.latestFrameAt = null;

    this.lastAnalysisAt = 0;
    this.lastMotionScore = 0;
    this.analyzing = false;

    this.status = 'starting';
    this.lastError = null;
  }

  async start() {
    this.stopped = false;
    this.restartAttempt = 0;
    await this._spawn();
  }

  async _spawn() {
    if (this.stopped) return;

    let source = this.camera.source;
    try {
      if (this.camera.kind === 'youtube') {
        source = await resolveStreamUrl(source);
      }
    } catch (err) {
      this.status = 'error';
      this.lastError = `stream resolve failed: ${err.message}`;
      this._scheduleRestart();
      return;
    }

    const opts = {
      fps: this.camera.fps || config.ingest.fps,
      frameWidth: this.camera.frameWidth || config.ingest.frameWidth,
      jpegQuality: config.ingest.jpegQuality,
      motionWidth: config.ingest.motionWidth,
      motionHeight: config.ingest.motionHeight,
    };

    let proc;
    try {
      proc = spawnFrameGrabber(source, this.camera.kind, opts);
    } catch (err) {
      this.status = 'error';
      this.lastError = `ffmpeg spawn failed: ${err.message}`;
      this._scheduleRestart();
      return;
    }

    this.proc = proc;
    this.status = 'running';
    this.lastError = null;
    this.motionBuf = Buffer.alloc(0);
    this.mjpegBuffer = Buffer.alloc(0);

    const motionFrameSize = config.ingest.motionWidth * config.ingest.motionHeight;

    proc.stdio[3].on('data', (chunk) => {
      this.motionBuf = Buffer.concat([this.motionBuf, chunk]);
      while (this.motionBuf.length >= motionFrameSize) {
        const frame = Buffer.from(this.motionBuf.subarray(0, motionFrameSize));
        this.motionBuf = Buffer.from(this.motionBuf.subarray(motionFrameSize));
        this._onMotionFrame(frame);
      }
    });

    proc.stdio[4].on('data', (chunk) => {
      this.mjpegBuffer = Buffer.concat([this.mjpegBuffer, chunk]);
      const { frames, remainder } = splitJpegFrames(this.mjpegBuffer);
      this.mjpegBuffer = remainder;
      for (const frame of frames) this._onJpegFrame(frame);
    });

    proc.stderr?.on('data', () => {}); // ffmpeg logs to stderr; discarded (see status/lastError for exit diagnostics)

    proc.on('exit', (code, signal) => {
      if (this.proc !== proc) return; // stale process, already superseded
      this.proc = null;
      if (this.stopped) {
        this.status = 'stopped';
        return;
      }
      this.status = 'error';
      this.lastError = `ffmpeg exited (code=${code}, signal=${signal})`;
      this._scheduleRestart();
    });

    proc.on('error', (err) => {
      this.lastError = err.message;
    });
  }

  _scheduleRestart() {
    if (this.stopped) return;
    const delay = RESTART_BACKOFF_MS[Math.min(this.restartAttempt, RESTART_BACKOFF_MS.length - 1)];
    this.restartAttempt += 1;
    setTimeout(() => {
      if (!this.stopped) this._spawn();
    }, delay);
  }

  _onJpegFrame(frame) {
    this.latestFrame = frame;
    this.latestFrameAt = new Date().toISOString();
    this.frameRing.push({ buf: frame, ts: this.latestFrameAt });
    const max = Math.max(1, this.camera.framesPerAnalysis || config.ingest.framesPerAnalysis);
    while (this.frameRing.length > max) this.frameRing.shift();
  }

  _onMotionFrame(gray) {
    if (this.prevMotionFrame) {
      let sum = 0;
      for (let i = 0; i < gray.length; i++) {
        sum += Math.abs(gray[i] - this.prevMotionFrame[i]);
      }
      this.lastMotionScore = sum / gray.length / 255;
    }
    this.prevMotionFrame = gray;

    if (this.analyzing) return;

    const now = Date.now();
    const threshold = this.camera.motionThreshold ?? config.ingest.motionThreshold;
    const cooldownMs = this.camera.cooldownMs ?? config.ingest.cooldownMs;
    const heartbeatMs = this.camera.heartbeatMs ?? config.ingest.heartbeatMs;

    const motionTriggered = this.lastMotionScore >= threshold;
    const cooldownElapsed = now - this.lastAnalysisAt >= cooldownMs;
    const heartbeatDue = now - this.lastAnalysisAt >= heartbeatMs;

    if (motionTriggered && cooldownElapsed) {
      this._triggerAnalysis('motion');
    } else if (heartbeatDue) {
      this._triggerAnalysis('heartbeat');
    }
  }

  async _triggerAnalysis(kind) {
    if (this.frameRing.length === 0) return;
    this.analyzing = true;
    this.lastAnalysisAt = Date.now();
    const frames = this.frameRing.map((f) => f.buf);
    const motionScoreAtTrigger = this.lastMotionScore;

    const release = await this.semaphore.acquire();
    try {
      const result = await analyzeFrames({ camera: this.camera, frames, kind });
      const event = {
        id: randomUUID(),
        cameraId: this.camera.id,
        createdAt: new Date().toISOString(),
        kind,
        threatLevel: result.threatLevel,
        summary: result.summary,
        scene: result.scene,
        peopleCount: result.peopleCount,
        vehiclesCount: result.vehiclesCount,
        detections: result.detections,
        alerts: result.alerts,
        tags: result.tags,
        recommendedAction: result.recommendedAction,
        motionScore: motionScoreAtTrigger,
        framePaths: [],
        model: result.model,
        usage: result.usage,
        error: result.error,
      };
      insertEvent(event);
      this.emit('event', event);

      if (threatRank(result.threatLevel) >= threatRank(this.camera.alertMinLevel)) {
        this.emit('alert', event);
      }
    } catch (err) {
      this.lastError = err.message;
    } finally {
      release();
      this.analyzing = false;
    }
  }

  snapshot() {
    return this.latestFrame ? { buffer: this.latestFrame, at: this.latestFrameAt } : null;
  }

  statusInfo() {
    return {
      status: this.status,
      lastError: this.lastError,
      lastMotionScore: this.lastMotionScore,
      lastAnalysisAt: this.lastAnalysisAt ? new Date(this.lastAnalysisAt).toISOString() : null,
      hasSnapshot: !!this.latestFrame,
    };
  }

  async stop() {
    this.stopped = true;
    if (this.proc) {
      this.proc.kill('SIGTERM');
    }
    this.status = 'stopped';
  }
}
