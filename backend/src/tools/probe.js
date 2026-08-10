#!/usr/bin/env node
import { probeSource } from '../lib/ffmpeg.js';
import { resolveStreamUrl } from '../lib/ytdlp.js';

async function main() {
  const [source, kind] = process.argv.slice(2);
  if (!source) {
    console.error('Usage: node src/tools/probe.js <source> [kind]');
    console.error('  kind: rtsp | http | youtube | file (default: inferred, only "youtube" changes behavior)');
    process.exit(1);
  }

  try {
    const resolved = kind === 'youtube' ? await resolveStreamUrl(source) : source;
    if (resolved !== source) console.log(`resolved stream URL: ${resolved}`);

    const info = await probeSource(resolved);
    const videoStream = (info.streams || []).find((s) => s.codec_type === 'video');
    const audioStream = (info.streams || []).find((s) => s.codec_type === 'audio');

    console.log(JSON.stringify({
      format: info.format?.format_name,
      duration: info.format?.duration,
      video: videoStream && {
        codec: videoStream.codec_name,
        width: videoStream.width,
        height: videoStream.height,
        fps: videoStream.avg_frame_rate,
      },
      audio: audioStream && { codec: audioStream.codec_name },
    }, null, 2));
  } catch (err) {
    console.error('probe failed:', err.message);
    process.exit(1);
  }
}

main();
