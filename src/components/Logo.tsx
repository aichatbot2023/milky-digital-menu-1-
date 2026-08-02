interface Props {
  size?: number;
  /** Prikaz sa imenom brenda pored znaka. */
  wordmark?: boolean;
  /** Na tamnoj podlozi znak je beo, ime brenda takođe. */
  light?: boolean;
  className?: string;
}

/**
 * Zaštitni znak SafeNest AI — štit sa kućicom, isti kao ikona aplikacije,
 * ali kao SVG: oštar na svakoj veličini, par stotina bajtova, i menja boju
 * prema podlozi. Emoji štit se nikad ne koristi kao logo.
 */
export function Logo({ size = 34, wordmark = false, light = false, className = "" }: Props) {
  const shield = light ? "#ffffff" : "url(#sn-grad)";
  const house = light ? "#0f766e" : "#ffffff";
  return (
    <span className={`logo${wordmark ? " logo-lockup" : ""} ${className}`.trim()}>
      <svg width={size} height={size} viewBox="0 0 48 48" role="img" aria-label="SafeNest AI">
        <defs>
          <linearGradient id="sn-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#14857a" />
            <stop offset="100%" stopColor="#0d5d55" />
          </linearGradient>
        </defs>
        {/* Štit */}
        <path
          d="M24 3.5 L42.5 10.2 V25.5 C42.5 34.6 34.4 41.6 24 45 C13.6 41.6 5.5 34.6 5.5 25.5 V10.2 Z"
          fill={shield}
        />
        {/* Kućica u štitu */}
        <path
          d="M24 15.5 L34.5 24.4 V34.5 H28.6 V27.4 H19.4 V34.5 H13.5 V24.4 Z"
          fill={house}
        />
        {/* Tačka — dete pod krovom */}
        <circle cx="24" cy="21.6" r="2.4" fill="#f43f5e" />
      </svg>
      {wordmark && (
        <span className={`logo-word${light ? " logo-word-light" : ""}`}>
          SafeNest<span className="logo-ai">AI</span>
        </span>
      )}
    </span>
  );
}
