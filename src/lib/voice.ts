/**
 * Glas na uređaju (po uzoru na NVIDIA nemotron-voice-agent pipeline):
 * ASR (prepoznavanje govora) i TTS (izgovaranje) rade U TELEFONU preko
 * Web Speech API-ja — besplatno, bez servera. "Mozak" je safenest-chat
 * funkcija (Nemotron lanac); ako ona nije dostupna, odgovara lokalna
 * baza znanja (offlineAssistantAnswer) — asistent NIKAD ne ćuti.
 */

import { languageEnglishName, speechLocale } from "./i18n";

const SR = (globalThis as any).SpeechRecognition ?? (globalThis as any).webkitSpeechRecognition;

export const speechInputSupported = Boolean(SR);
export const speechOutputSupported = "speechSynthesis" in globalThis;

// iOS/Safari: glasovi se učitavaju asinhrono — povuci listu čim stigne
let cachedVoices: SpeechSynthesisVoice[] = [];
if (speechOutputSupported) {
  const refresh = () => {
    try {
      cachedVoices = speechSynthesis.getVoices();
    } catch {
      /* ignoriši */
    }
  };
  refresh();
  try {
    speechSynthesis.addEventListener?.("voiceschanged", refresh);
  } catch {
    /* stariji browseri */
  }
}

function pickVoice(): SpeechSynthesisVoice | null {
  const voices = cachedVoices.length > 0 ? cachedVoices : speechSynthesis.getVoices();
  const loc = speechLocale().toLowerCase();
  const lang2 = loc.slice(0, 2);
  // Tačan lokal → isti jezik → srodni južnoslovenski (za sr)
  return (
    voices.find((v) => v.lang.toLowerCase() === loc) ??
    voices.find((v) => v.lang.toLowerCase().startsWith(lang2)) ??
    (lang2 === "sr"
      ? voices.find((v) => /^(hr|bs)/.test(v.lang.toLowerCase())) ?? null
      : null)
  );
}

/**
 * iOS dozvoljava TTS tek posle korisničkog dodira — pozvati iz onClick
 * handlera (npr. otvaranje asistenta / uključenje zvučnih upozorenja)
 * da bi kasniji automatski izgovori radili.
 */
export function primeTts() {
  if (!speechOutputSupported) return;
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(" ");
    u.volume = 0;
    speechSynthesis.speak(u);
  } catch {
    /* ignoriši */
  }
}

/** Izgovori tekst (srpski glas ako postoji na uređaju). */
export function speak(text: string) {
  if (!speechOutputSupported || !text) return;
  try {
    speechSynthesis.cancel();
    // Safari ume da ostane "paused" posle cancel — probudi ga
    if (speechSynthesis.paused) speechSynthesis.resume();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = speechLocale();
    const voice = pickVoice();
    if (voice) u.voice = voice;
    u.rate = 1.0;
    speechSynthesis.speak(u);
  } catch {
    /* TTS nedostupan — tekst je ionako prikazan na ekranu */
  }
}

export function stopSpeaking() {
  if (speechOutputSupported) {
    try {
      speechSynthesis.cancel();
    } catch {
      /* ignoriši */
    }
  }
}

/** Jednokratno slušanje: vraća transkript ili null (otkazano/greška). */
export function listenOnce(
  onPartial?: (text: string) => void,
): { promise: Promise<string | null>; stop: () => void } {
  if (!SR) return { promise: Promise.resolve(null), stop: () => {} };
  let rec: any;
  try {
    rec = new SR();
  } catch {
    return { promise: Promise.resolve(null), stop: () => {} };
  }
  rec.lang = speechLocale();
  rec.interimResults = true;
  rec.maxAlternatives = 1;

  let final = "";
  const promise = new Promise<string | null>((resolve) => {
    rec.onresult = (e: any) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) final += t;
        else interim += t;
      }
      onPartial?.(final + interim);
    };
    rec.onerror = () => resolve(final.trim() || null);
    rec.onend = () => resolve(final.trim() || null);
    try {
      rec.start();
    } catch {
      resolve(null);
    }
  });
  return {
    promise,
    stop: () => {
      try {
        rec.stop();
      } catch {
        /* već zaustavljen */
      }
    },
  };
}

/**
 * REZERVNI glasovni unos za telefone bez Web Speech podrške (iOS Safari):
 * snimi mikrofon (MediaRecorder) → Groq Whisper transkripcija na serveru.
 */
export function recordAudio(maxMs = 15000): {
  promise: Promise<Blob | null>;
  stop: () => void;
} {
  let stopFn = () => {};
  const promise = (async (): Promise<Blob | null> => {
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      return null;
    }
    const mime = ["audio/mp4", "audio/webm;codecs=opus", "audio/webm", "audio/ogg"].find(
      (m) => (globalThis as any).MediaRecorder?.isTypeSupported?.(m),
    );
    let rec: MediaRecorder;
    try {
      rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    } catch {
      stream.getTracks().forEach((t) => t.stop());
      return null;
    }
    const chunks: BlobPart[] = [];
    rec.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    const done = new Promise<void>((resolve) => {
      rec.onstop = () => resolve();
      rec.onerror = () => resolve();
    });
    rec.start();
    const timer = setTimeout(() => {
      try { rec.stop(); } catch { /* ignoriši */ }
    }, maxMs);
    stopFn = () => {
      clearTimeout(timer);
      try { rec.stop(); } catch { /* ignoriši */ }
    };
    await done;
    stream.getTracks().forEach((t) => t.stop());
    if (chunks.length === 0) return null;
    return new Blob(chunks, { type: rec.mimeType || mime || "audio/webm" });
  })();
  return { promise, stop: () => stopFn() };
}

const TRANSCRIBE_URL =
  (import.meta.env.VITE_TRANSCRIBE_FUNCTION_URL as string | undefined) ??
  "https://equjrxwpxrkchicetyvs.supabase.co/functions/v1/transcribe";

/** Pošalji snimak na Whisper transkripciju; vraća tekst ili null. */
export async function transcribeAudio(blob: Blob): Promise<string | null> {
  try {
    const b64 = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
      r.onerror = () => reject(new Error("read fail"));
      r.readAsDataURL(blob);
    });
    if (!b64) return null;
    const ANON_T =
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVxdWpyeHdweHJrY2hpY2V0eXZzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDk4OTgxNjYsImV4cCI6MjA2NTQ3NDE2Nn0.xU8in9GwHQK5tYXuN4yZG4f9aVXPjy4GhbbmlnHuBo8";
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), 25000);
    try {
      const res = await fetch(TRANSCRIBE_URL, {
        method: "POST",
        signal: abort.signal,
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${ANON_T}`,
          "apikey": ANON_T,
        },
        body: JSON.stringify({
          audio: b64,
          mime: blob.type,
          language: speechLocale().slice(0, 2),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return null;
      return (data.text as string) || null;
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return null;
  }
}

/** Pozovi safenest-chat funkciju (Nemotron lanac) sa kontekstom skena. */
export async function askAssistant(params: {
  question: string;
  roomType?: string;
  ageGroup?: string;
  hazards?: { label: string; severity: string }[];
}): Promise<string> {
  const url =
    (import.meta.env.VITE_CHAT_FUNCTION_URL as string | undefined) ??
    "https://equjrxwpxrkchicetyvs.supabase.co/functions/v1/safenest-chat";
  const ANON =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVxdWpyeHdweHJrY2hpY2V0eXZzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDk4OTgxNjYsImV4cCI6MjA2NTQ3NDE2Nn0.xU8in9GwHQK5tYXuN4yZG4f9aVXPjy4GhbbmlnHuBo8";

  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), 20000);
  try {
    const res = await fetch(url, {
      method: "POST",
      signal: abort.signal,
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${ANON}`,
        "apikey": ANON,
      },
      body: JSON.stringify({ ...params, language: languageEnglishName() }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Greška (${res.status})`);
    return data.answer as string;
  } finally {
    clearTimeout(timer);
  }
}
