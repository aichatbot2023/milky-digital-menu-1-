import { useState } from "react";
import type { AgeGroup, ChildProfile } from "../types";
import { AGE_LABELS } from "../types";
import { ageLabel, t } from "../lib/i18n";

interface Props {
  profiles: ChildProfile[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onChange: (profiles: ChildProfile[]) => void;
}

export function ChildProfiles({ profiles, selectedId, onSelect, onChange }: Props) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [age, setAge] = useState<AgeGroup>("6-12m");

  const addProfile = () => {
    if (!name.trim()) return;
    const profile: ChildProfile = {
      id: `child-${Date.now()}`,
      name: name.trim(),
      age,
    };
    const next = [...profiles, profile];
    onChange(next);
    onSelect(profile.id);
    setName("");
    setAdding(false);
  };

  const removeProfile = (id: string) => {
    onChange(profiles.filter((p) => p.id !== id));
    if (selectedId === id) onSelect(null);
  };

  return (
    <div className="profiles">
      <h3>{t("profiles.title")}</h3>
      <p className="muted">{t("profiles.hint")}</p>
      <div className="profile-chips">
        {profiles.map((p) => (
          <button
            key={p.id}
            className={`chip${p.id === selectedId ? " chip-active" : ""}`}
            onClick={() => onSelect(p.id === selectedId ? null : p.id)}
          >
            {p.name} · {ageLabel(p.age)}
            <span
              className="chip-x"
              onClick={(e) => {
                e.stopPropagation();
                removeProfile(p.id);
              }}
            >
              ×
            </span>
          </button>
        ))}
        {!adding && (
          <button className="chip chip-add" onClick={() => setAdding(true)}>
            {t("profiles.add")}
          </button>
        )}
      </div>
      {adding && (
        <div className="profile-form">
          <input
            placeholder={t("profiles.name")}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <select value={age} onChange={(e) => setAge(e.target.value as AgeGroup)}>
            {(Object.keys(AGE_LABELS) as AgeGroup[]).map((a) => (
              <option key={a} value={a}>
                {ageLabel(a)}
              </option>
            ))}
          </select>
          <div className="profile-form-actions">
            <button className="btn btn-primary" onClick={addProfile}>
              {t("profiles.save")}
            </button>
            <button className="btn btn-outline" onClick={() => setAdding(false)}>
              {t("profiles.cancel")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
