import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config.js';

let client = null;
function getClient() {
  if (!config.anthropic.apiKey) return null;
  if (!client) client = new Anthropic({ apiKey: config.anthropic.apiKey });
  return client;
}

const SYSTEM_PROMPT = `You are the AI analyst for OmniMeeting AIVS (AI Video Security), reviewing a short burst of frames captured moments apart from a fixed security camera. Assess the scene for safety and security concerns and report your findings in the requested structured format.

Threat levels:
- none: nothing notable
- low: routine activity worth logging (a person walking by, a parked delivery van)
- medium: activity that warrants attention (someone lingering near an entrance, unusual behavior)
- high: activity that likely requires a human to check in soon (forced entry attempt, someone climbing a fence, a fight)
- critical: an active, ongoing emergency (fire, weapon visible, violent assault, break-in in progress)

Be precise and avoid false alarms — routine activity (mail delivery, residents coming and going, pets, weather, lighting changes, wildlife) should be "none" or "low". Only escalate when the frames actually show something warranting it.`;

const RESULT_SCHEMA = {
  type: 'object',
  properties: {
    threatLevel: { type: 'string', enum: ['none', 'low', 'medium', 'high', 'critical'] },
    summary: { type: 'string', description: 'One or two sentence summary of what is happening' },
    scene: { type: 'string', description: 'Brief description of the scene/location' },
    peopleCount: { type: 'integer' },
    vehiclesCount: { type: 'integer' },
    detections: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          label: { type: 'string' },
          confidence: { type: 'number' },
        },
        required: ['label', 'confidence'],
        additionalProperties: false,
      },
    },
    alerts: { type: 'array', items: { type: 'string' } },
    tags: { type: 'array', items: { type: 'string' } },
    recommendedAction: { type: 'string' },
  },
  required: [
    'threatLevel', 'summary', 'scene', 'peopleCount', 'vehiclesCount',
    'detections', 'alerts', 'tags', 'recommendedAction',
  ],
  additionalProperties: false,
};

function buildUserText(camera, kind) {
  const lines = [
    `Camera: ${camera.name}${camera.location ? ` (${camera.location})` : ''}`,
    `Trigger: ${kind === 'heartbeat' ? 'periodic heartbeat check (no motion trigger)' : 'motion detected'}`,
  ];
  if (camera.watchPrompt) {
    lines.push(`Operator notes for this camera: ${camera.watchPrompt}`);
  }
  lines.push('Frames are attached in chronological order.');
  return lines.join('\n');
}

function unavailableResult(errorCode, message) {
  return {
    threatLevel: null,
    summary: message,
    scene: null,
    peopleCount: null,
    vehiclesCount: null,
    detections: [],
    alerts: [],
    tags: [],
    recommendedAction: null,
    model: null,
    usage: null,
    error: errorCode,
  };
}

/**
 * Sends a burst of JPEG frame buffers to Claude for security analysis.
 * Returns a structured result even on failure (error field explains why),
 * so callers can always persist an event.
 */
export async function analyzeFrames({ camera, frames, kind }) {
  const anthropic = getClient();
  if (!anthropic) {
    return unavailableResult('anthropic_api_key_missing', 'Analysis unavailable (no ANTHROPIC_API_KEY configured).');
  }
  if (!frames || !frames.length) {
    return unavailableResult('no_frames', 'No frames available to analyze.');
  }

  const content = [
    { type: 'text', text: buildUserText(camera, kind) },
    ...frames.map((buf) => ({
      type: 'image',
      source: { type: 'base64', media_type: 'image/jpeg', data: buf.toString('base64') },
    })),
  ];

  const params = {
    model: config.anthropic.model,
    max_tokens: config.anthropic.maxTokens,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content }],
    output_config: {
      effort: config.anthropic.effort,
      format: { type: 'json_schema', schema: RESULT_SCHEMA },
    },
  };
  // Disabling thinking is only accepted at effort <= high; at xhigh/max we
  // let adaptive thinking run (the default) rather than risk a 400.
  if (!['xhigh', 'max'].includes(config.anthropic.effort)) {
    params.thinking = { type: 'disabled' };
  }

  try {
    const resp = await anthropic.messages.create(params);
    const textBlock = resp.content.find((b) => b.type === 'text');
    if (!textBlock) throw new Error('no text block in response');
    const parsed = JSON.parse(textBlock.text);
    return {
      threatLevel: parsed.threatLevel,
      summary: parsed.summary,
      scene: parsed.scene,
      peopleCount: parsed.peopleCount,
      vehiclesCount: parsed.vehiclesCount,
      detections: parsed.detections || [],
      alerts: parsed.alerts || [],
      tags: parsed.tags || [],
      recommendedAction: parsed.recommendedAction,
      model: resp.model,
      usage: resp.usage || null,
      error: null,
    };
  } catch (err) {
    return unavailableResult('analysis_failed', String(err.message || err));
  }
}
