import { useEffect, useRef, useState } from "react";
import { capturePhoto } from "../lib/camera";
import { t } from "../lib/i18n";

interface Props {
  hint: string;
  onCapture: (dataUrl: string) => void;
  onClose: () => void;
}

/**
 * Ekran snimanja: pun kadar, jedan elegantan okvir za nišanjenje i jedno
 * okruglo dugme. Bez ijednog drugog elementa — korisnik ima tačno jednu
 * odluku. Ako kamera nije dostupna (dozvola, desktop), pada na izbor
 * fotografije iz galerije.
 */
export function CameraCapture({ hint, onCapture, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 } },
          audio: false,
        });
        if (!alive) {
          stream.getTracks().forEach((tr) => tr.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        setReady(true);
      } catch {
        if (alive) setFailed(true);
      }
    })();
    return () => {
      alive = false;
      streamRef.current?.getTracks().forEach((tr) => tr.stop());
    };
  }, []);

  const shoot = () => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    const c = document.createElement("canvas");
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(v, 0, 0);
    setFlash(true);
    if (navigator.vibrate) navigator.vibrate(20);
    setTimeout(() => onCapture(c.toDataURL("image/jpeg", 0.92)), 120);
  };

  const fromGallery = async () => {
    const photo = await capturePhoto();
    if (photo) onCapture(photo);
  };

  return (
    <div className="cam">
      <video ref={videoRef} className="cam-video" playsInline muted autoPlay />
      {flash && <div className="cam-flash" />}

      <button className="cam-close" onClick={onClose} aria-label={t("back")}>
        ←
      </button>

      <div className="cam-frame">
        <span className="cf tl" />
        <span className="cf tr" />
        <span className="cf bl" />
        <span className="cf br" />
      </div>

      <p className="cam-hint">{failed ? t("cam.noAccess") : hint}</p>

      <div className="cam-bar">
        <button className="cam-gallery" onClick={fromGallery} aria-label={t("cam.gallery")}>
          🖼️
        </button>
        <button
          className="cam-shutter"
          onClick={failed ? fromGallery : shoot}
          disabled={!ready && !failed}
          aria-label={t("cam.shoot")}
        >
          <span />
        </button>
        <span className="cam-spacer" />
      </div>
    </div>
  );
}
