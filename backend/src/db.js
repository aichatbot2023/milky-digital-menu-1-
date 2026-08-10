import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { config } from './config.js';

fs.mkdirSync(path.dirname(config.storage.dbPath), { recursive: true });
fs.mkdirSync(config.storage.mediaDir, { recursive: true });

export const db = new Database(config.storage.dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS cameras (
  id                  TEXT PRIMARY KEY,
  name                TEXT NOT NULL,
  source              TEXT NOT NULL,
  kind                TEXT NOT NULL,
  location            TEXT,
  enabled             INTEGER NOT NULL DEFAULT 1,
  fps                 REAL    NOT NULL DEFAULT 1,
  frame_width         INTEGER NOT NULL DEFAULT 768,
  motion_threshold    REAL    NOT NULL DEFAULT 0.012,
  cooldown_ms         INTEGER NOT NULL DEFAULT 15000,
  heartbeat_ms        INTEGER NOT NULL DEFAULT 300000,
  frames_per_analysis INTEGER NOT NULL DEFAULT 3,
  watch_prompt        TEXT,
  alert_min_level     TEXT    NOT NULL DEFAULT 'low',
  record              INTEGER NOT NULL DEFAULT 0,
  created_at          TEXT    NOT NULL,
  updated_at          TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS events (
  id                 TEXT PRIMARY KEY,
  camera_id          TEXT,
  created_at         TEXT NOT NULL,
  kind               TEXT NOT NULL,
  threat_level       TEXT,
  summary            TEXT,
  scene              TEXT,
  people_count       INTEGER,
  vehicles_count     INTEGER,
  detections         TEXT,
  alerts             TEXT,
  tags               TEXT,
  recommended_action TEXT,
  motion_score       REAL,
  frame_paths        TEXT,
  model              TEXT,
  usage              TEXT,
  error              TEXT,
  FOREIGN KEY (camera_id) REFERENCES cameras(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_events_created_at ON events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_camera     ON events(camera_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_threat     ON events(threat_level, created_at DESC);

CREATE TABLE IF NOT EXISTS recordings (
  id         TEXT PRIMARY KEY,
  camera_id  TEXT NOT NULL,
  path       TEXT NOT NULL,
  started_at TEXT NOT NULL,
  ended_at   TEXT,
  bytes      INTEGER,
  FOREIGN KEY (camera_id) REFERENCES cameras(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_recordings_camera ON recordings(camera_id, started_at DESC);
`);

export const THREAT_LEVELS = ['none', 'low', 'medium', 'high', 'critical'];

export function threatRank(level) {
  const i = THREAT_LEVELS.indexOf(String(level || '').toLowerCase());
  return i === -1 ? 0 : i;
}

function parseJson(value, fallback) {
  if (value === null || value === undefined) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

export function rowToCamera(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    source: row.source,
    kind: row.kind,
    location: row.location,
    enabled: !!row.enabled,
    fps: row.fps,
    frameWidth: row.frame_width,
    motionThreshold: row.motion_threshold,
    cooldownMs: row.cooldown_ms,
    heartbeatMs: row.heartbeat_ms,
    framesPerAnalysis: row.frames_per_analysis,
    watchPrompt: row.watch_prompt,
    alertMinLevel: row.alert_min_level,
    record: !!row.record,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function rowToEvent(row) {
  if (!row) return null;
  return {
    id: row.id,
    cameraId: row.camera_id,
    createdAt: row.created_at,
    kind: row.kind,
    threatLevel: row.threat_level,
    summary: row.summary,
    scene: row.scene,
    peopleCount: row.people_count,
    vehiclesCount: row.vehicles_count,
    detections: parseJson(row.detections, []),
    alerts: parseJson(row.alerts, []),
    tags: parseJson(row.tags, []),
    recommendedAction: row.recommended_action,
    motionScore: row.motion_score,
    framePaths: parseJson(row.frame_paths, []),
    model: row.model,
    usage: parseJson(row.usage, null),
    error: row.error,
  };
}

const insertEventStmt = db.prepare(`
  INSERT INTO events (
    id, camera_id, created_at, kind, threat_level, summary, scene,
    people_count, vehicles_count, detections, alerts, tags,
    recommended_action, motion_score, frame_paths, model, usage, error
  ) VALUES (
    @id, @camera_id, @created_at, @kind, @threat_level, @summary, @scene,
    @people_count, @vehicles_count, @detections, @alerts, @tags,
    @recommended_action, @motion_score, @frame_paths, @model, @usage, @error
  )
`);

export function insertEvent(event) {
  insertEventStmt.run({
    id: event.id,
    camera_id: event.cameraId ?? null,
    created_at: event.createdAt,
    kind: event.kind,
    threat_level: event.threatLevel ?? null,
    summary: event.summary ?? null,
    scene: event.scene ?? null,
    people_count: event.peopleCount ?? null,
    vehicles_count: event.vehiclesCount ?? null,
    detections: JSON.stringify(event.detections ?? []),
    alerts: JSON.stringify(event.alerts ?? []),
    tags: JSON.stringify(event.tags ?? []),
    recommended_action: event.recommendedAction ?? null,
    motion_score: event.motionScore ?? null,
    frame_paths: JSON.stringify(event.framePaths ?? []),
    model: event.model ?? null,
    usage: event.usage ? JSON.stringify(event.usage) : null,
    error: event.error ?? null,
  });
  return event;
}
