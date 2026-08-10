import { Router } from 'express';
import { config, assertRuntimeConfig } from '../config.js';
import { ingestManager } from '../ingest/manager.js';
import { db } from '../db.js';

const router = Router();

router.get('/', (req, res) => {
  const problems = assertRuntimeConfig();
  const cameraCount = db.prepare('SELECT COUNT(*) as n FROM cameras').get().n;

  res.json({
    ok: problems.length === 0,
    problems,
    anthropicConfigured: !!config.anthropic.apiKey,
    activeCameras: ingestManager.workers.size,
    activeRecorders: ingestManager.recorders.size,
    totalCameras: cameraCount,
    time: new Date().toISOString(),
  });
});

export default router;
