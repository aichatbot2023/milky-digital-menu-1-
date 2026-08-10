import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

dotenv.config();

const here = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(here, '..');

function num(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function bool(value, fallback = false) {
  if (value === undefined || value === '') return fallback;
  return /^(1|true|yes|on)$/i.test(String(value));
}

function resolveFromBackend(p, fallback) {
  return path.resolve(backendRoot, p || fallback);
}

export const config = {
  backendRoot,
  port: num(process.env.PORT, 3000),

  auth: {
    jwtSecret: process.env.JWT_SECRET || '',
    apiKey: process.env.API_KEY || '',
    allowAnonymous: bool(process.env.ALLOW_ANONYMOUS, false),
  },

  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY || '',
    model: process.env.AIVS_MODEL || 'claude-opus-5',
    effort: process.env.AIVS_EFFORT || 'medium',
    maxTokens: num(process.env.AIVS_MAX_TOKENS, 2000),
  },

  bin: {
    ffmpeg: process.env.FFMPEG_PATH || 'ffmpeg',
    ffprobe: process.env.FFPROBE_PATH || 'ffprobe',
    ytdlp: process.env.YTDLP_PATH || 'yt-dlp',
  },

  storage: {
    dbPath: resolveFromBackend(process.env.DB_PATH, './milky.db'),
    mediaDir: resolveFromBackend(process.env.MEDIA_DIR, './media'),
  },

  ingest: {
    fps: num(process.env.AIVS_FPS, 1),
    frameWidth: num(process.env.AIVS_FRAME_WIDTH, 768),
    jpegQuality: num(process.env.AIVS_JPEG_QUALITY, 4),
    motionWidth: 64,
    motionHeight: 36,
    motionThreshold: num(process.env.AIVS_MOTION_THRESHOLD, 0.012),
    cooldownMs: num(process.env.AIVS_COOLDOWN_MS, 15000),
    heartbeatMs: num(process.env.AIVS_HEARTBEAT_MS, 300000),
    framesPerAnalysis: num(process.env.AIVS_FRAMES_PER_ANALYSIS, 3),
    maxConcurrentAnalyses: num(process.env.AIVS_MAX_CONCURRENT_ANALYSES, 3),
  },

  ytdlp: {
    cacheMs: num(process.env.YTDLP_CACHE_MS, 30 * 60 * 1000),
  },
};

export function assertRuntimeConfig() {
  const problems = [];
  if (!config.auth.jwtSecret && !config.auth.apiKey && !config.auth.allowAnonymous) {
    problems.push(
      'No JWT_SECRET and no API_KEY configured. Set one of them, or set ALLOW_ANONYMOUS=true for local development.',
    );
  }
  return problems;
}
