import { Router } from 'express';
import { db, rowToEvent } from '../db.js';

const router = Router();

router.get('/', (req, res) => {
  const { cameraId, threatLevel, since, limit } = req.query;
  const clauses = [];
  const params = {};

  if (cameraId) {
    clauses.push('camera_id = @cameraId');
    params.cameraId = cameraId;
  }
  if (threatLevel) {
    clauses.push('threat_level = @threatLevel');
    params.threatLevel = threatLevel;
  }
  if (since) {
    clauses.push('created_at >= @since');
    params.since = since;
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const lim = Math.max(1, Math.min(Number(limit) || 100, 500));

  const rows = db.prepare(`SELECT * FROM events ${where} ORDER BY created_at DESC LIMIT ${lim}`).all(params);
  res.json({ events: rows.map(rowToEvent) });
});

router.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM events WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'event not found' });
  res.json({ event: rowToEvent(row) });
});

export default router;
