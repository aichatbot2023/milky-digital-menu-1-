import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { config, assertRuntimeConfig } from './config.js';
import { authMiddleware } from './middleware/auth.js';
import camerasRouter from './routes/cameras.js';
import eventsRouter from './routes/events.js';
import recordingsRouter from './routes/recordings.js';
import healthRouter from './routes/health.js';
import { ingestManager } from './ingest/manager.js';

const app = express();

app.use(cors());
app.use(express.json({ limit: '2mb' }));

// Recorded clips and any other files under MEDIA_DIR.
app.use('/media', express.static(config.storage.mediaDir));
// Optional lightweight dashboard.
app.use(express.static(path.join(config.backendRoot, 'public')));

app.use('/api/health', healthRouter);
app.use('/api/cameras', authMiddleware, camerasRouter);
app.use('/api/events', authMiddleware, eventsRouter);
app.use('/api/recordings', authMiddleware, recordingsRouter);

app.use((req, res) => res.status(404).json({ error: 'not found' }));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'internal error', message: err.message });
});

const problems = assertRuntimeConfig();
if (problems.length) {
  console.warn(`[config] ${problems.join(' ')}`);
}

app.listen(config.port, () => {
  console.log(`Milky backend (AIVS/VCM) listening on :${config.port}`);
  ingestManager.loadAll().catch((err) => {
    console.error('[ingest] failed to load cameras on startup:', err.message);
  });
});

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

async function shutdown() {
  console.log('Shutting down...');
  await ingestManager.stopAll();
  process.exit(0);
}
