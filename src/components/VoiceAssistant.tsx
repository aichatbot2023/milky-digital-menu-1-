import { useEffect, useRef, useState } from "react";
import type { AgeGroup, Hazard, RoomType } from "../types";
import {
  askAssistant,
  listenOnce,
  primeTts,
  speak,
  speechInputSupported,
  stopSpeaking,
} from "../lib/voice";
import { offlineAssistantAnswer } from "../lib/hazardKnowledge";

interface Props {
  roomType: RoomType;
  ageGroup: AgeGroup;
  hazards: Hazard[];
}

// Glasovni asistent: 🎤 → pitanje glasom (ili tekstom) → Nemotron → odgovor + TTS
export function VoiceAssistant({ roomType, ageGroup, hazards }: Props) {
  const [open, setOpen] = useState(false);
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [textInput, setTextInput] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stopRef = useRef<(() => void) | null>(null);

  useEffect(() => () => stopSpeaking(), []);

  const ask = async (question: string) => {
    const q = question.trim();
    if (!q || busy) return;
    setBusy(true);
    setError(null);
    setAnswer(null);
    try {
      const a = await askAssistant({
        question: q,
        roomType,
        ageGroup,
        hazards: hazards.map((h) => ({ label: h.label, severity: h.severity })),
      });
      setAnswer(a);
      speak(a);
    } catch {
      // Cloud "mozak" nedostupan → odgovor iz lokalne baze znanja.
      // Dugme asistenta uvek daje odgovor, i bez interneta.
      const a = offlineAssistantAnswer(q, hazards);
      setAnswer(a);
      speak(a);
    } finally {
      setBusy(false);
    }
  };

  const toggleMic = async () => {
    if (listening) {
      stopRef.current?.();
      return;
    }
    stopSpeaking();
    setTranscript("");
    setError(null);
    setListening(true);
    const { promise, stop } = listenOnce(setTranscript);
    stopRef.current = stop;
    const text = await promise;
    setListening(false);
    stopRef.current = null;
    if (text) {
      setTranscript(text);
      await ask(text);
    } else {
      setError(
        "Nisam čuo pitanje — proverite dozvolu za mikrofon ili upišite pitanje ispod.",
      );
    }
  };

  if (!open) {
    return (
      <button
        className="btn btn-primary va-fab"
        onClick={() => {
          primeTts(); // iOS: otključaj TTS na korisnički dodir
          setOpen(true);
        }}
      >
        🎤 Pitaj asistenta
      </button>
    );
  }

  return (
    <div className="va-panel">
      <div className="va-head">
        <strong>🎤 Glasovni asistent</strong>
        <button
          className="va-close"
          onClick={() => {
            stopSpeaking();
            stopRef.current?.();
            setOpen(false);
          }}
        >
          ×
        </button>
      </div>
      <p className="muted">
        Pitajte bilo šta o bezbednosti — npr. „Zašto je šporet opasan?" ili
        „Kako da obezbedim terasu?"
      </p>

      {speechInputSupported ? (
        <button
          className={`btn ${listening ? "btn-outline" : "btn-primary"}`}
          onClick={toggleMic}
          disabled={busy}
        >
          {listening ? "⏹ Zaustavi (slušam…)" : "🎤 Govori"}
        </button>
      ) : (
        <p className="muted">
          Glasovni unos nije podržan u ovom pregledaču — upišite pitanje, a
          odgovor ću izgovoriti naglas. 🔊
        </p>
      )}

      <div className="va-textrow">
        <input
          placeholder="…ili upišite pitanje"
          value={textInput}
          onChange={(e) => setTextInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              ask(textInput);
              setTextInput("");
            }
          }}
        />
        <button
          className="btn btn-outline"
          disabled={busy || !textInput.trim()}
          onClick={() => {
            ask(textInput);
            setTextInput("");
          }}
        >
          Pošalji
        </button>
      </div>

      {transcript && <p className="va-transcript">„{transcript}"</p>}
      {busy && <p className="muted">Razmišljam…</p>}
      {error && <p className="warn">{error}</p>}
      {answer && (
        <div className="va-answer">
          <p>{answer}</p>
          <button className="btn btn-ghost" onClick={() => speak(answer)}>
            🔊 Ponovi
          </button>
        </div>
      )}
    </div>
  );
}
