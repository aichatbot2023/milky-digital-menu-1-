/**
 * Izbor vrste ljubimca — ono što je kod dece uzrast.
 *
 * Nije ukras. Ista soba za mačku i za zeca nije ista soba: mački je otvoren
 * prozor najveća opasnost u stanu, a zecu je to kabl pod naponom. Dok se ne
 * zna vrsta, nalaz je prosek koji ne odgovara nijednoj životinji.
 */
import { useState } from "react";
import { getPetKind, setPetKind } from "../lib/domain";
import { PET_KINDS, PET_LABELS_EN, PET_LABELS_SR, type PetKind } from "../lib/petKnowledge";
import { isSr, t } from "../lib/i18n";

const ICON: Record<PetKind, string> = {
  "dog-small": "🐕", "dog-large": "🐕‍🦺", cat: "🐈",
  rabbit: "🐇", bird: "🦜", rodent: "🐹",
};

export function PetPicker({ onChange }: { onChange?: (k: PetKind) => void }) {
  const [kind, setKind] = useState<PetKind>(() => getPetKind());
  const label = (k: PetKind) => (isSr() ? PET_LABELS_SR[k] : PET_LABELS_EN[k]);
  return (
    <div className="room-picker">
      <h3>{t("pet.title")}</h3>
      <p className="muted">{t("pet.hint")}</p>
      <div className="pet-grid">
        {PET_KINDS.map((k) => (
          <button
            key={k}
            className={`pet-chip${k === kind ? " pet-chip-on" : ""}`}
            onClick={() => {
              setPetKind(k);
              setKind(k);
              onChange?.(k);
            }}
          >
            <span className="pet-emoji">{ICON[k]}</span>
            {label(k)}
          </button>
        ))}
      </div>
    </div>
  );
}
