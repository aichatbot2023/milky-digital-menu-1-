import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { config } from '../config.js';
import { resolveStreamUrl } from '../lib/ytdlp.js';
import { db } from '../db.js';

const SEGMENT_SECONDS = 300; // 5-minute recording segments

const insertRecordingStmt = db.prepare(`
  INSERT INTO recordings (id, camera_id, path, started_at, ended_at, bytes)
  VALUES (@id, @camera_id, @path, @started_at, @ended_at, @bytes)
`);

/**
 * Continuously records a camera's source into fixed-length mp4 segments
 * under MEDIA_DIR/<cameraId>/, registering each finished segment in the
 * recordings table. Runs only while camera.record is true.
 */
export class RecordingWorker {
  constructor(camera) {
    this.camera = camera;
    this.stopped = true;
    this.proc = null;
    this.dir = path.join(config.storage.mediaDir, camera.id);
  }

  async start() {
    this.stopped = false;
    fs.mkdirSync(this.dir, { recursive: true });
    this._loop();
  }

  async _loop() {
    while (!this.stopped) {
      try {
        await this._recordSegment();
      } catch (err) {
        if (!this.stopped) {
          console.error(`[recorder:${this.camera.id}] segment failed: ${err.message}`);
          await new Promise((r) => setTimeout(r, 5000));
        }
      }
    }
  }

  async _recordSegment() {
    let source = this.camera.source;
    if (this.camera.kind === 'youtube') {
      source = await resolveStreamUrl(source);
    }

    const startedAt = new Date();
    const filename = `${startedAt.toISOString().replace(/[:.]/g, '-')}.mp4`;
    const outPath = path.join(this.dir, filename);

    const args = ['-nostdin', '-loglevel', 'error', '-y'];
    if (this.camera.kind === 'rtsp') args.push('-rtsp_transport', 'tcp');
    args.push(
      '-i', source,
      '-t', String(SEGMENT_SECONDS),
      '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac',
      '-movflags', '+faststart',
      outPath,
    );

    await new Promise((resolve, reject) => {
      const proc = spawn(config.bin.ffmpeg, args, { stdio: ['ignore', 'ignore', 'pipe'] });
      this.proc = proc;
      proc.on('error', reject);
      proc.on('close', (code) => {
        this.proc = null;
        // Treat "killed by us" (null code, e.g. on stop()) as a clean stop.
        if (code === 0 || code === null) resolve();
        else reject(new Error(`ffmpeg exited ${code}`));
      });
    });

    const endedAt = new Date();
    let bytes = 0;
    try {
      bytes = fs.statSync(outPath).size;
    } catch {
      // file may be missing if the stream failed before writing anything
    }

    if (bytes > 0) {
      insertRecordingStmt.run({
        id: randomUUID(),
        camera_id: this.camera.id,
        path: path.relative(config.storage.mediaDir, outPath),
        started_at: startedAt.toISOString(),
        ended_at: endedAt.toISOString(),
        bytes,
      });
    }
  }

  stop() {
    this.stopped = true;
    if (this.proc) this.proc.kill('SIGTERM');
  }
}
