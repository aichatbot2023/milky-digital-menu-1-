/**
 * transcribe — glasovni unos za telefone BEZ Web Speech podrške (iOS Safari).
 * Aplikacija snimi kratak audio (MediaRecorder) i pošalje ga ovde; Groq
 * Whisper (besplatni tier) vraća transkript na jeziku korisnika.
 *
 * Body: { audio: base64, mime: "audio/mp4"|"audio/webm"..., language?: "sr" }
 * Vraća: { text }
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  const key = Deno.env.get('GROQ_API_KEY');
  if (!key) return json({ error: 'Transkripcija nije konfigurisana.' }, 501);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
  const audioB64 = String(body?.audio ?? '');
  const mime = String(body?.mime ?? 'audio/webm').slice(0, 40);
  const language = String(body?.language ?? '').slice(0, 5);
  if (!audioB64) return json({ error: 'Missing audio' }, 400);
  if (audioB64.length > 5_500_000) return json({ error: 'Audio too large' }, 413);

  let bytes: Uint8Array;
  try {
    bytes = Uint8Array.from(atob(audioB64), (c) => c.charCodeAt(0));
  } catch {
    return json({ error: 'Bad base64' }, 400);
  }

  const ext = mime.includes('mp4') ? 'mp4' : mime.includes('ogg') ? 'ogg' : mime.includes('wav') ? 'wav' : 'webm';
  const fd = new FormData();
  fd.append('file', new Blob([bytes], { type: mime }), `audio.${ext}`);
  fd.append('model', 'whisper-large-v3-turbo');
  fd.append('response_format', 'json');
  if (language && language !== 'fil') fd.append('language', language.slice(0, 2));

  const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${key}` },
    body: fd,
  });
  if (!res.ok) {
    console.error('groq stt error', res.status);
    return json({ error: `Transkripcija nije uspela (${res.status})` }, 502);
  }
  const data = await res.json();
  const text = String(data.text ?? '').trim();
  if (!text) return json({ error: 'Nije prepoznat govor' }, 422);
  return json({ text });
});
