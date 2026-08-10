import { spawn } from 'node:child_process';
import { config } from '../config.js';

/**
 * Probes a source (a plain URL, RTSP URL, or resolved direct stream URL)
 * with ffprobe and returns the parsed JSON metadata.
 */
export function probeSource(url) {
  return new Promise((resolve, reject) => {
    const args = ['-v', 'quiet', '-print_format', 'json', '-show_format', '-show_streams', url];
    const proc = spawn(config.bin.ffprobe, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    proc.stdout.on('data', (d) => (out += d));
    proc.stderr.on('data', (d) => (err += d));
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code !== 0) return reject(new Error(err.trim().slice(0, 500) || `ffprobe exited ${code}`));
      try {
        resolve(JSON.parse(out));
      } catch {
        reject(new Error('failed to parse ffprobe output'));
      }
    });
  });
}

const JPEG_SOI = Buffer.from([0xff, 0xd8]);
const JPEG_EOI = Buffer.from([0xff, 0xd9]);

/**
 * Splits a buffer of concatenated MJPEG data into complete JPEG frames.
 * Returns the complete frames found plus the trailing remainder (a
 * possibly-incomplete frame) that should be prepended to the next chunk.
 */
export function splitJpegFrames(buffer) {
  const frames = [];
  let cursor = 0;
  let start = buffer.indexOf(JPEG_SOI, cursor);
  while (start !== -1) {
    const end = buffer.indexOf(JPEG_EOI, start + 2);
    if (end === -1) break;
    frames.push(Buffer.from(buffer.subarray(start, end + 2)));
    cursor = end + 2;
    start = buffer.indexOf(JPEG_SOI, cursor);
  }
  return { frames, remainder: Buffer.from(buffer.subarray(cursor)) };
}

function buildFrameGrabberArgs(source, kind, opts) {
  const { fps, frameWidth, jpegQuality, motionWidth, motionHeight } = opts;
  const args = ['-nostdin', '-loglevel', 'error'];

  if (kind === 'rtsp') {
    args.push('-rtsp_transport', 'tcp');
  }
  if (kind === 'http' || kind === 'youtube') {
    args.push('-reconnect', '1', '-reconnect_streamed', '1', '-reconnect_delay_max', '5');
  }

  args.push('-i', source);

  // Output 1 (pipe:3): small grayscale raw frames for motion detection.
  args.push(
    '-f', 'rawvideo', '-pix_fmt', 'gray',
    '-vf', `fps=${fps},scale=${motionWidth}:${motionHeight}`,
    'pipe:3',
  );

  // Output 2 (pipe:4): full-size MJPEG frames for vision analysis / snapshots.
  args.push(
    '-f', 'image2pipe', '-vcodec', 'mjpeg', '-q:v', String(jpegQuality),
    '-vf', `fps=${fps},scale=${frameWidth}:-2`,
    'pipe:4',
  );

  return args;
}

/**
 * Spawns an ffmpeg process that reads the given source and emits two
 * synchronized streams: fd3 is raw grayscale motion-detection frames,
 * fd4 is an MJPEG stream of full-resolution frames.
 */
export function spawnFrameGrabber(source, kind, opts) {
  const args = buildFrameGrabberArgs(source, kind, opts);
  return spawn(config.bin.ffmpeg, args, {
    stdio: ['ignore', 'ignore', 'pipe', 'pipe', 'pipe'],
  });
}
