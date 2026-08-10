#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { config, assertRuntimeConfig } from '../config.js';

function checkBinary(name, bin, versionFlag = '-version') {
  return new Promise((resolve) => {
    const proc = spawn(bin, [versionFlag], { stdio: 'ignore' });
    proc.on('error', () => resolve({ name, ok: false, detail: `not found: ${bin}` }));
    proc.on('close', (code) => resolve({ name, ok: code === 0, detail: bin }));
  });
}

async function main() {
  console.log('Milky AIVS/VCM doctor\n');
  const checks = [];

  checks.push(await checkBinary('ffmpeg', config.bin.ffmpeg));
  checks.push(await checkBinary('ffprobe', config.bin.ffprobe));
  checks.push(await checkBinary('yt-dlp', config.bin.ytdlp, '--version'));

  const configProblems = assertRuntimeConfig();
  checks.push({
    name: 'auth config',
    ok: configProblems.length === 0,
    detail: configProblems.join(' ') || 'JWT_SECRET/API_KEY/ALLOW_ANONYMOUS configured',
  });

  checks.push({
    name: 'anthropic api key',
    ok: true,
    warn: !config.anthropic.apiKey,
    detail: config.anthropic.apiKey
      ? `configured (model=${config.anthropic.model}, effort=${config.anthropic.effort})`
      : 'missing — analysis will report "unavailable" for every event',
  });

  try {
    const { db } = await import('../db.js');
    db.prepare('SELECT 1').get();
    checks.push({ name: 'database', ok: true, detail: config.storage.dbPath });
  } catch (err) {
    checks.push({ name: 'database', ok: false, detail: err.message });
  }

  let hardFailure = false;
  for (const check of checks) {
    const icon = check.ok ? (check.warn ? '⚠' : '✓') : '✗';
    console.log(`${icon} ${check.name}: ${check.detail}`);
    if (!check.ok && !check.warn) hardFailure = true;
  }

  console.log(`\n${hardFailure ? 'One or more checks failed.' : 'All checks passed.'}`);
  process.exit(hardFailure ? 1 : 0);
}

main();
