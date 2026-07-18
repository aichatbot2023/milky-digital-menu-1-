/**
 * Glas na uređaju (po uzoru na NVIDIA nemotron-voice-agent pipeline):
 * ASR (prepoznavanje govora) i TTS (izgovaranje) rade U TELEFONU preko
 * Web Speech API-ja — besplatno, bez servera. "Mozak" je safenest-chat
 * funkcija (Nemotron lanac).
 */

const SR = (globalThis as any).SpeechRecognition ?? (globalThis as any).webkitSpeechRecognition;

export const speechInputSupported = Boolean(SR);

/** Jednokratno slušanje: vraća transkript ili null (otkazano/greška). */
export function listenOnce(
  onPartial?: (text: string) => void,
): { promise: Promise<string | null>; stop: () => void } {
  if (!SR) return { promise: Promise.resolve(null), stop: () => {} };
  const rec = new SR();
  rec.lang = "sr-RS";
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
    rec.start();
  });
  return { promise, stop: () => rec.stop() };
}

/** Izgovori tekst (srpski glas ako postoji na uređaju). */
export function speak(text: string) {
  if (!("speechSynthesis" in globalThis)) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "sr-RS";
  const voices = speechSynthesis.getVoices();
  const srVoice =
    voices.find((v) => v.lang.toLowerCase().startsWith("sr")) ??
    voices.find((v) => v.lang.toLowerCase().startsWith("hr")) ??
    null;
  if (srVoice) u.voice = srVoice;
  u.rate = 1.0;
  speechSynthesis.speak(u);
}

export function stopSpeaking() {
  if ("speechSynthesis" in globalThis) speechSynthesis.cancel();
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
      body: JSON.stringify(params),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Greška (${res.status})`);
    return data.answer as string;
  } finally {
    clearTimeout(timer);
  }
}
