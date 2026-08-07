export type IconName =
  | "scan"
  | "history"
  | "tips"
  | "profile"
  | "camera"
  | "video"
  | "bottle"
  | "shield"
  | "search"
  | "mic"
  | "check"
  | "arrow"
  | "list"
  | "grid"
  | "focus"
  | "gallery"
  | "back"
  | "share"
  | "close"
  | "sound-on"
  | "sound-off"
  | "gift"
  | "repeat"
  | "globe"
  | "star"
  | "cart"
  | "chevron-left"
  | "chevron-right";

interface Props {
  name: IconName;
  size?: number;
  className?: string;
  /** Popunjena varijanta (aktivan tab). */
  filled?: boolean;
}

/**
 * Linijske ikonice — jedan dosledan set umesto emoji-ja. Emoji izgleda
 * drugačije na svakom uređaju, ne prima boju brenda i čini interfejs
 * jeftinim; ovo su tanke SVG linije koje nasleđuju currentColor.
 */
const PATHS: Record<IconName, JSX.Element> = {
  scan: (
    <>
      <path d="M3 8V5.5A2.5 2.5 0 0 1 5.5 3H8M16 3h2.5A2.5 2.5 0 0 1 21 5.5V8M21 16v2.5a2.5 2.5 0 0 1-2.5 2.5H16M8 21H5.5A2.5 2.5 0 0 1 3 18.5V16" />
      <circle cx="12" cy="12" r="3.2" />
    </>
  ),
  history: (
    <>
      <path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1" />
      <path d="M3.2 4.5v4.2h4.2" />
      <path d="M12 7.6V12l3 1.8" />
    </>
  ),
  tips: (
    <>
      <path d="M9.2 17.5h5.6M10 20.5h4" />
      <path d="M12 3.5a5.8 5.8 0 0 0-3.4 10.5c.5.4.8 1 .8 1.6h5.2c0-.6.3-1.2.8-1.6A5.8 5.8 0 0 0 12 3.5Z" />
    </>
  ),
  profile: (
    <>
      <circle cx="12" cy="8.2" r="3.7" />
      <path d="M4.8 20.2a7.2 7.2 0 0 1 14.4 0" />
    </>
  ),
  camera: (
    <>
      <path d="M3.5 8.6h3.1l1.5-2.4h7.8l1.5 2.4h3.1v10H3.5Z" />
      <circle cx="12" cy="13.4" r="3.4" />
    </>
  ),
  video: (
    <>
      <rect x="2.8" y="6.6" width="12.4" height="10.8" rx="2.4" />
      <path d="M15.2 12.4 21.2 9v6l-6-3.4Z" />
    </>
  ),
  bottle: (
    <>
      <path d="M10 2.8h4M10.4 5.4h3.2v2.2c0 .7.3 1.3.8 1.8l.6.6c.6.6 1 1.5 1 2.4v6.4a2.4 2.4 0 0 1-2.4 2.4h-3.2a2.4 2.4 0 0 1-2.4-2.4v-6.4c0-.9.4-1.8 1-2.4l.6-.6c.5-.5.8-1.1.8-1.8Z" />
      <path d="M8.6 14.4h6.8" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3 20 6v6.2c0 4.4-3.4 7.9-8 9.3-4.6-1.4-8-4.9-8-9.3V6Z" />
      <path d="m8.8 12 2.2 2.2 4.2-4.4" />
    </>
  ),
  search: (
    <>
      <circle cx="10.8" cy="10.8" r="6.3" />
      <path d="m15.6 15.6 4.4 4.4" />
    </>
  ),
  mic: (
    <>
      <rect x="9.2" y="2.8" width="5.6" height="10.4" rx="2.8" />
      <path d="M5.4 11.4a6.6 6.6 0 0 0 13.2 0M12 18v3.2" />
    </>
  ),
  check: <path d="m4.5 12.5 5 5 10-11" />,
  arrow: <path d="M4.5 12h15m-6-6 6 6-6 6" />,
  list: <path d="M4 6.5h16M4 12h16M4 17.5h16" />,
  grid: (
    <>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.8" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.8" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.8" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.8" />
    </>
  ),
  focus: (
    <>
      <circle cx="12" cy="12" r="8.2" />
      <circle cx="12" cy="12" r="2.6" />
    </>
  ),
  gallery: (
    <>
      <rect x="3.2" y="4.6" width="17.6" height="14.8" rx="2.6" />
      <circle cx="8.4" cy="9.6" r="1.7" />
      <path d="m3.6 17 5-5 4.2 4.2 3-2.6 5 4.4" />
    </>
  ),
  back: <path d="M19 12H5m6-6-6 6 6 6" />,
  share: <path d="M6 18 18 6m-7.5-.5H18v7.5" />,
  close: <path d="m5.5 5.5 13 13m0-13-13 13" />,
  "sound-on": (
    <>
      <path d="M4 9.4h3.4L12.6 5v14l-5.2-4.4H4Z" />
      <path d="M16.4 9.2a4 4 0 0 1 0 5.6M19 6.6a7.6 7.6 0 0 1 0 10.8" />
    </>
  ),
  "sound-off": (
    <>
      <path d="M4 9.4h3.4L12.6 5v14l-5.2-4.4H4Z" />
      <path d="m16.6 9.8 4.4 4.4m0-4.4-4.4 4.4" />
    </>
  ),
  gift: (
    <>
      <rect x="3.4" y="8.6" width="17.2" height="12" rx="2" />
      <path d="M3.4 12.6h17.2M12 8.6v12" />
      <path d="M12 8.6C10.8 5.6 9.4 4 7.9 4a2.3 2.3 0 0 0 0 4.6ZM12 8.6c1.2-3 2.6-4.6 4.1-4.6a2.3 2.3 0 0 1 0 4.6Z" />
    </>
  ),
  repeat: (
    <>
      <path d="M4 9.5A5.5 5.5 0 0 1 9.5 4h9M20 14.5A5.5 5.5 0 0 1 14.5 20h-9" />
      <path d="m15.5 1.5 3 2.5-3 2.5M8.5 17.5l-3 2.5 3 2.5" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="8.4" />
      <path d="M3.6 12h16.8M12 3.6c2.2 2.4 3.3 5.2 3.3 8.4S14.2 18 12 20.4C9.8 18 8.7 15.2 8.7 12S9.8 6 12 3.6Z" />
    </>
  ),
  star: <path d="m12 3.6 2.6 5.4 5.9.8-4.3 4.2 1 5.9-5.2-2.8-5.2 2.8 1-5.9L3.5 9.8l5.9-.8Z" />,
  cart: (
    <>
      <path d="M3 4.5h2.4l2.3 11.2h9.6l2.2-8.2H6.2" />
      <circle cx="9.4" cy="19.4" r="1.5" />
      <circle cx="16.6" cy="19.4" r="1.5" />
    </>
  ),
  "chevron-left": <path d="m14.5 5.5-6.5 6.5 6.5 6.5" />,
  "chevron-right": <path d="m9.5 5.5 6.5 6.5-6.5 6.5" />,
};

export function Icon({ name, size = 22, className = "", filled = false }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={filled ? 2.1 : 1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`icn ${className}`.trim()}
      aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  );
}
