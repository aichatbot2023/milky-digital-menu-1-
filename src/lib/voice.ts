/**
 * Glas na uređaju (po uzoru na NVIDIA nemotron-voice-agent pipeline):
 * ASR (prepoznavanje govora) i TTS (izgovaranje) rade U TELEFONU preko
 * Web Speech API-ja — besplatno, bez servera. "Mozak" je safenest-chat
 * funkcija (Nemotron lanac); ako ona nije dostupna, odgovara lokalna
 * baza znanja (offlineAssistantAnswer) — asistent NIKAD ne ćuti.
 */

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
  return (
    voices.find((v) => v.lang.toLowerCase().startsWith("sr")) ??
    voices.find((v) => v.lang.toLowerCase().startsWith("hr")) ??
    voices.find((v) => v.lang.toLowerCase().startsWith("bs")) ??
    null
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
    u.lang = "sr-RS";
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
