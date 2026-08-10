# Milky — OmniMeeting AI Video Security (AIVS) + Video Camera Management (VCM)

Node/Express + SQLite backend that ingests live camera feeds (RTSP, HTTP/MJPEG,
or YouTube live streams), runs lightweight motion detection, and sends bursts
of frames to Claude for AI-powered security analysis — threat level, scene
description, detections, and recommended action — stored as queryable events.
Optional continuous recording writes segmented `.mp4` clips per camera.

A minimal built-in dashboard (served at `/`) lists cameras with live
snapshots and a recent-events feed.

## Quick start

```
cd backend
npm install
cp .env.example .env
npm start
```

Then open `http://localhost:3000` for the dashboard, or hit the API directly
(see below). For local development, `.env.example` ships with
`ALLOW_ANONYMOUS=true` so no token is required — set `JWT_SECRET` or
`API_KEY` before exposing this anywhere else.

Set `ANTHROPIC_API_KEY` to enable real vision analysis. Without it, the
ingest pipeline still runs (motion detection, snapshots, recording) but every
analysis event is marked `error: "anthropic_api_key_missing"`.

## Requirements

- Node.js >= 20.11
- `ffmpeg` / `ffprobe` on `PATH` (or set `FFMPEG_PATH` / `FFPROBE_PATH`)
- `yt-dlp` on `PATH` if you plan to ingest YouTube live streams (or set `YTDLP_PATH`)

Run `npm run doctor` to check all of the above plus your `.env` configuration.

## API

All `/api/*` routes except `/api/health` require auth (Bearer token / JWT, or
`x-api-key`, or anonymous if `ALLOW_ANONYMOUS=true`).

| Method | Path | Description |
| --- | --- | --- |
| GET | `/api/health` | Server + config status, no auth required |
| GET | `/api/cameras` | List cameras (with live ingest status) |
| POST | `/api/cameras` | Add a camera (`name`, `source`, `kind` required; `kind`: `rtsp`\|`http`\|`youtube`\|`file`) |
| GET | `/api/cameras/:id` | Get one camera |
| PUT | `/api/cameras/:id` | Update a camera (restarts ingestion) |
| DELETE | `/api/cameras/:id` | Remove a camera and stop ingestion |
| POST | `/api/cameras/:id/probe` | ffprobe the camera's source without starting ingestion |
| GET | `/api/cameras/:id/snapshot` | Latest JPEG frame from the live feed |
| GET | `/api/events` | List AI security events (`cameraId`, `threatLevel`, `since`, `limit` filters) |
| GET | `/api/events/:id` | Get one event |
| GET | `/api/recordings` | List recorded clips (`cameraId`, `limit` filters) |
| GET | `/api/recordings/:id` | Get one recording |
| GET | `/media/*` | Static file serving for recordings |

## How ingestion works

For each enabled camera, `ffmpeg` is spawned once and emits two synchronized
streams: a small grayscale raw-video feed used for frame-diff motion
detection, and an MJPEG feed of full-resolution frames kept in a rolling
buffer. When motion crosses `motionThreshold` (after `cooldownMs` since the
last analysis) — or on a `heartbeatMs` cadence regardless of motion — the
most recent frames are sent to Claude (`AIVS_MODEL`, default `claude-opus-5`)
for structured analysis, and the result is stored as an event. Events at or
above a camera's `alertMinLevel` are treated as alerts.

If `record` is set on a camera, a second `ffmpeg` process writes rolling
5-minute `.mp4` segments to `MEDIA_DIR/<cameraId>/`, each registered as a
`recordings` row.

Per-camera tuning (`fps`, `frameWidth`, `motionThreshold`, `cooldownMs`,
`heartbeatMs`, `framesPerAnalysis`, `watchPrompt`, `alertMinLevel`, `record`)
falls back to the `AIVS_*` defaults in `.env` when omitted.
