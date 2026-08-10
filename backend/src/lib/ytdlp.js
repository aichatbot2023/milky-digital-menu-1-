import { spawn } from 'node:child_process';
import { config } from '../config.js';

const cache = new Map(); // source -> { resolved, expiresAt }

function isYoutube(url) {
  return /(^https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\//i.test(url || '');
}

function run(bin, args) {
  return new Promise((resolve, reject) => {
    const proc = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    proc.stdout.on('data', (d) => (out += d));
    proc.stderr.on('data', (d) => (err += d));
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code === 0) resolve(out.trim());
      else reject(new Error(`${bin} exited with ${code}: ${err.trim().slice(0, 500)}`));
    });
  });
}

/**
 * Resolves a camera source to a direct, ffmpeg-readable stream URL.
 * Non-YouTube sources are returned unchanged. Results are cached for
 * config.ytdlp.cacheMs to avoid re-resolving on every ingestion restart.
 */
export async function resolveStreamUrl(source) {
  if (!isYoutube(source)) return source;

  const cached = cache.get(source);
  if (cached && cached.expiresAt > Date.now()) return cached.resolved;

  const out = await run(config.bin.ytdlp, ['-f', 'best[protocol^=http]/best', '-g', source]);
  const resolved = out
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .pop();
  if (!resolved) throw new Error('yt-dlp returned no stream URL');

  cache.set(source, { resolved, expiresAt: Date.now() + config.ytdlp.cacheMs });
  return resolved;
}

export function clearYtdlpCache() {
  cache.clear();
}
