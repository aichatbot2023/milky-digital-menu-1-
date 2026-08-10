import { db, rowToCamera } from '../db.js';
import { CameraWorker } from './camera.js';
import { RecordingWorker } from './recorder.js';
import { Semaphore } from '../lib/semaphore.js';
import { config } from '../config.js';

const listEnabledCamerasStmt = db.prepare('SELECT * FROM cameras WHERE enabled = 1');

/** Coordinates all running CameraWorker/RecordingWorker instances. */
class IngestManager {
  constructor() {
    this.workers = new Map(); // cameraId -> CameraWorker
    this.recorders = new Map(); // cameraId -> RecordingWorker
    this.semaphore = new Semaphore(config.ingest.maxConcurrentAnalyses);
  }

  async loadAll() {
    const rows = listEnabledCamerasStmt.all();
    for (const row of rows) {
      await this.start(rowToCamera(row)).catch((err) => {
        console.error(`[ingest] failed to start camera ${row.id}: ${err.message}`);
      });
    }
  }

  async start(camera) {
    await this.stop(camera.id);

    const worker = new CameraWorker(camera, { semaphore: this.semaphore });
    this.workers.set(camera.id, worker);
    await worker.start();

    if (camera.record) {
      const recorder = new RecordingWorker(camera);
      this.recorders.set(camera.id, recorder);
      recorder.start().catch((err) => {
        console.error(`[recorder:${camera.id}] failed to start: ${err.message}`);
      });
    }

    return worker;
  }

  async stop(cameraId) {
    const worker = this.workers.get(cameraId);
    if (worker) {
      await worker.stop();
      this.workers.delete(cameraId);
    }
    const recorder = this.recorders.get(cameraId);
    if (recorder) {
      recorder.stop();
      this.recorders.delete(cameraId);
    }
  }

  get(cameraId) {
    return this.workers.get(cameraId);
  }

  snapshot(cameraId) {
    return this.workers.get(cameraId)?.snapshot() ?? null;
  }

  status(cameraId) {
    return this.workers.get(cameraId)?.statusInfo() ?? { status: 'stopped' };
  }

  async stopAll() {
    await Promise.all([...this.workers.keys()].map((id) => this.stop(id)));
  }
}

export const ingestManager = new IngestManager();
