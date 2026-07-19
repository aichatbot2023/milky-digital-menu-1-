import { useEffect, useRef, useState } from "react";
import type { AgeGroup, Hazard, RoomType } from "../types";
import {
  askAssistant,
  listenOnce,
  primeTts,
  recordAudio,
  speak,
  speechInputSupported,
  stopSpeaking,
  transcribeAudio,
} from "../lib/voice";
import { offlineAssistantAnswer } from "../lib/hazardKnowledge";
import { t } from "../lib/i18n";

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

  const [transcribing, setTranscribing] = useState(false);

  const toggleMic = async () => {
    if (listening) {
      stopRef.current?.();
      return;
    }
    stopSpeaking();
    setTranscript("");
    setError(null);
    setListening(true);

    let text: string | null = null;
    if (speechInputSupported) {
      // Ugrađeno prepoznavanje govora (Chrome/Android)
      const { promise, stop } = listenOnce(setTranscript);
      stopRef.current = stop;
      text = await promise;
      setListening(false);
      stopRef.current = null;
    } else {
      // iOS Safari i ostali bez podrške: snimi zvuk → Whisper na serveru
      const { promise, stop } = recordAudio();
      stopRef.current = stop;
      const blob = await promise;
      setListening(false);
      stopRef.current = null;
      if (blob) {
        setTranscribing(true);
        text = await transcribeAudio(blob);
        setTranscribing(false);
      }
    }

    if (text) {
      setTranscript(text);
      await ask(text);
    } else {
      setError(t("va.noMic"));
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
        {t("va.fab")}
      </button>
    );
  }

  return (
    <div className="va-panel">
      <div className="va-head">
        <strong>{t("va.title")}</strong>
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
      <p className="muted">{t("va.hint")}</p>

      <button
        className={`btn ${listening ? "btn-outline" : "btn-primary"}`}
        onClick={toggleMic}
        disabled={busy || transcribing}
      >
        {listening ? t("va.stop") : t("va.speak")}
      </button>
      {transcribing && <p className="muted">{t("va.transcribing")}</p>}

      <div className="va-textrow">
        <input
          placeholder={t("va.type")}
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
          {t("va.send")}
        </button>
      </div>

      {transcript && <p className="va-transcript">„{transcript}"</p>}
      {busy && <p className="muted">{t("va.thinking")}</p>}
      {error && <p className="warn">{error}</p>}
      {answer && (
        <div className="va-answer">
          <p>{answer}</p>
          <button className="btn btn-ghost" onClick={() => speak(answer)}>
            {t("va.repeat")}
          </button>
        </div>
      )}
    </div>
  );
}
