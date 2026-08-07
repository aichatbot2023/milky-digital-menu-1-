import { t } from "../lib/i18n";
import { Icon, type IconName } from "./Icon";

export type Tab = "scan" | "history" | "tips" | "profile";

interface Props {
  tab: Tab;
  onChange: (tab: Tab) => void;
  /** Broj nerešenih iz memorije — značka na kartici istorije. */
  pending?: number;
}

const ITEMS: { id: Tab; icon: IconName; key: string }[] = [
  { id: "scan", icon: "scan", key: "nav.scan" },
  { id: "history", icon: "history", key: "nav.history" },
  { id: "tips", icon: "tips", key: "nav.tips" },
  { id: "profile", icon: "profile", key: "nav.profile" },
];

/** Donja navigacija — samo četiri taba, ništa više (Apple obrazac). */
export function BottomNav({ tab, onChange, pending = 0 }: Props) {
  return (
    <nav className="bottomnav">
      {ITEMS.map((it) => (
        <button
          key={it.id}
          className={`bn-item${tab === it.id ? " bn-active" : ""}`}
          onClick={() => onChange(it.id)}
        >
          <span className="bn-icon">
            <Icon name={it.icon} size={23} filled={tab === it.id} />
            {it.id === "history" && pending > 0 && <span className="bn-dot">{pending}</span>}
          </span>
          <span className="bn-label">{t(it.key)}</span>
        </button>
      ))}
    </nav>
  );
}
