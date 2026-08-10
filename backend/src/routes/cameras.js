import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { db, rowToCamera } from '../db.js';
import { ingestManager } from '../ingest/manager.js';
import { config } from '../config.js';
import { probeSource } from '../lib/ffmpeg.js';
import { resolveStreamUrl } from '../lib/ytdlp.js';

const router = Router();

const VALID_KINDS = ['rtsp', 'http', 'youtube', 'file'];
const VALID_LEVELS = ['none', 'low', 'medium', 'high', 'critical'];

const listStmt = db.prepare('SELECT * FROM cameras ORDER BY created_at DESC');
const getStmt = db.prepare('SELECT * FROM cameras WHERE id = ?');
const insertStmt = db.prepare(`
  INSERT INTO cameras (
    id, name, source, kind, location, enabled, fps, frame_width, motion_threshold,
    cooldown_ms, heartbeat_ms, frames_per_analysis, watch_prompt, alert_min_level,
    record, created_at, updated_at
  ) VALUES (
    @id, @name, @source, @kind, @location, @enabled, @fps, @frame_width, @motion_threshold,
    @cooldown_ms, @heartbeat_ms, @frames_per_analysis, @watch_prompt, @alert_min_level,
    @record, @created_at, @updated_at
  )
`);
const updateStmt = db.prepare(`
  UPDATE cameras SET
    name = @name, source = @source, kind = @kind, location = @location,
    enabled = @enabled, fps = @fps, frame_width = @frame_width, motion_threshold = @motion_threshold,
    cooldown_ms = @cooldown_ms, heartbeat_ms = @heartbeat_ms, frames_per_analysis = @frames_per_analysis,
    watch_prompt = @watch_prompt, alert_min_level = @alert_min_level, record = @record,
    updated_at = @updated_at
  WHERE id = @id
`);
const deleteStmt = db.prepare('DELETE FROM cameras WHERE id = ?');

function toRow(camera, existingRow) {
  const now = new Date().toISOString();
  return {
    id: camera.id,
    name: camera.name,
    source: camera.source,
    kind: camera.kind,
    location: camera.location ?? null,
    enabled: camera.enabled ? 1 : 0,
    fps: camera.fps ?? config.ingest.fps,
    frame_width: camera.frameWidth ?? config.ingest.frameWidth,
    motion_threshold: camera.motionThreshold ?? config.ingest.motionThreshold,
    cooldown_ms: camera.cooldownMs ?? config.ingest.cooldownMs,
    heartbeat_ms: camera.heartbeatMs ?? config.ingest.heartbeatMs,
    frames_per_analysis: camera.framesPerAnalysis ?? config.ingest.framesPerAnalysis,
    watch_prompt: camera.watchPrompt ?? null,
    alert_min_level: camera.alertMinLevel ?? 'low',
    record: camera.record ? 1 : 0,
    created_at: existingRow?.created_at ?? now,
    updated_at: now,
  };
}

router.get('/', (req, res) => {
  const cameras = listStmt.all().map((row) => ({
    ...rowToCamera(row),
    status: ingestManager.status(row.id),
  }));
  res.json({ cameras });
});

router.post('/', async (req, res) => {
  const body = req.body || {};
  if (!body.name || !body.source || !body.kind) {
    return res.status(400).json({ error: 'name, source, and kind are required' });
  }
  if (!VALID_KINDS.includes(body.kind)) {
    return res.status(400).json({ error: `kind must be one of ${VALID_KINDS.join(', ')}` });
  }
  if (body.alertMinLevel && !VALID_LEVELS.includes(body.alertMinLevel)) {
    return res.status(400).json({ error: `alertMinLevel must be one of ${VALID_LEVELS.join(', ')}` });
  }

  const camera = { enabled: true, ...body, id: randomUUID() };
  insertStmt.run(toRow(camera));
  const saved = rowToCamera(getStmt.get(camera.id));

  if (saved.enabled) {
    try {
      await ingestManager.start(saved);
    } catch (err) {
      return res.status(201).json({ camera: saved, warning: `ingestion failed to start: ${err.message}` });
    }
  }
  res.status(201).json({ camera: saved });
});

router.get('/:id', (req, res) => {
  const row = getStmt.get(req.params.id);
  if (!row) return res.status(404).json({ error: 'camera not found' });
  res.json({ camera: { ...rowToCamera(row), status: ingestManager.status(row.id) } });
});

router.put('/:id', async (req, res) => {
  const existingRow = getStmt.get(req.params.id);
  if (!existingRow) return res.status(404).json({ error: 'camera not found' });

  const existing = rowToCamera(existingRow);
  const merged = { ...existing, ...req.body, id: existing.id };
  if (!VALID_KINDS.includes(merged.kind)) {
    return res.status(400).json({ error: `kind must be one of ${VALID_KINDS.join(', ')}` });
  }
  if (merged.alertMinLevel && !VALID_LEVELS.includes(merged.alertMinLevel)) {
    return res.status(400).json({ error: `alertMinLevel must be one of ${VALID_LEVELS.join(', ')}` });
  }

  updateStmt.run(toRow(merged, existingRow));
  const saved = rowToCamera(getStmt.get(existing.id));

  try {
    if (saved.enabled) {
      await ingestManager.start(saved);
    } else {
      await ingestManager.stop(saved.id);
    }
  } catch (err) {
    return res.json({ camera: saved, warning: `ingestion restart failed: ${err.message}` });
  }
  res.json({ camera: saved });
});

router.delete('/:id', async (req, res) => {
  const row = getStmt.get(req.params.id);
  if (!row) return res.status(404).json({ error: 'camera not found' });
  await ingestManager.stop(req.params.id);
  deleteStmt.run(req.params.id);
  res.status(204).end();
});

router.post('/:id/probe', async (req, res) => {
  const row = getStmt.get(req.params.id);
  const source = req.body?.source || row?.source;
  const kind = req.body?.kind || row?.kind;
  if (!source) return res.status(400).json({ error: 'no source to probe' });

  try {
    const resolved = kind === 'youtube' ? await resolveStreamUrl(source) : source;
    const info = await probeSource(resolved);
    const videoStream = (info.streams || []).find((s) => s.codec_type === 'video');
    res.json({
      ok: true,
      probe: {
        format: info.format?.format_name,
        duration: info.format?.duration,
        video: videoStream && {
          codec: videoStream.codec_name,
          width: videoStream.width,
          height: videoStream.height,
          fps: videoStream.avg_frame_rate,
        },
      },
    });
  } catch (err) {
    res.status(502).json({ ok: false, error: err.message });
  }
});

router.get('/:id/snapshot', (req, res) => {
  const snap = ingestManager.snapshot(req.params.id);
  if (!snap) return res.status(404).json({ error: 'no snapshot available (camera may not be ingesting yet)' });
  res.set('Content-Type', 'image/jpeg');
  res.set('Cache-Control', 'no-store');
  res.send(snap.buffer);
});

export default router;
