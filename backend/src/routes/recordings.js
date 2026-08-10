import { Router } from 'express';
import { db } from '../db.js';

const router = Router();

function rowToRecording(row) {
  return {
    id: row.id,
    cameraId: row.camera_id,
    path: row.path,
    url: `/media/${row.path}`,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    bytes: row.bytes,
  };
}

router.get('/', (req, res) => {
  const { cameraId, limit } = req.query;
  const lim = Math.max(1, Math.min(Number(limit) || 100, 500));

  const rows = cameraId
    ? db.prepare('SELECT * FROM recordings WHERE camera_id = ? ORDER BY started_at DESC LIMIT ?').all(cameraId, lim)
    : db.prepare('SELECT * FROM recordings ORDER BY started_at DESC LIMIT ?').all(lim);

  res.json({ recordings: rows.map(rowToRecording) });
});

router.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM recordings WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'recording not found' });
  res.json({ recording: rowToRecording(row) });
});

export default router;
