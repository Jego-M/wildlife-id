import { CSSProperties, useState } from "react";

// ── AppGlyph ──────────────────────────────────────────────────────────────────

export function AppGlyph({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="10" stroke="var(--accent-deep)" strokeWidth="1.25" />
      <circle cx="12" cy="12" r="5.5" fill="var(--accent-soft)" stroke="var(--accent-deep)" strokeWidth="1.25" />
      <circle cx="12" cy="12" r="1.6" fill="var(--accent-deep)" />
    </svg>
  );
}

// ── Wordmark ──────────────────────────────────────────────────────────────────

export function Wordmark({ small = false, large = false }: { small?: boolean; large?: boolean }) {
  const size = large ? 28 : small ? 14 : 18;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: large ? 12 : 6, whiteSpace: "nowrap" }}>
      <AppGlyph size={large ? 26 : small ? 14 : 18} />
      <span style={{
        fontFamily: "Fraunces, serif", fontWeight: 500, fontSize: size,
        letterSpacing: large ? "-0.02em" : "-0.005em",
        color: large ? "var(--ink)" : "var(--ink-2)", whiteSpace: "nowrap",
      }}>
        Wildlife&nbsp;
        <span style={{
          fontStyle: "italic", fontWeight: 400, whiteSpace: "nowrap",
          color: large ? "var(--accent-deep)" : "var(--ink-3)",
        }}>
          ID
        </span>
      </span>
    </span>
  );
}

// ── Spinner ───────────────────────────────────────────────────────────────────

export function Spinner() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" style={{ animation: "spin 1s linear infinite" }}>
      <circle cx="6" cy="6" r="4.5" fill="none" stroke="var(--ink-4)" strokeWidth="1.2" opacity="0.3" />
      <path d="M6 1.5A4.5 4.5 0 0 1 10.5 6" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round" fill="none" />
    </svg>
  );
}

// ── PhotoBitmap ───────────────────────────────────────────────────────────────
// Placeholder photo: gradient + noise + organic silhouette.

export interface PhotoLike { id: string; palette: string[]; }

const SILHOUETTES: Record<string, React.ReactNode> = {
  fox:      <path d="M38 62 Q44 38 56 38 Q60 30 64 36 Q70 32 70 40 Q78 44 76 56 Q80 64 72 70 Q60 76 50 74 Q40 76 38 62 Z" />,
  owl:      <ellipse cx="50" cy="55" rx="20" ry="26" />,
  frog:     <path d="M30 60 Q30 40 50 38 Q70 40 70 60 Q70 78 50 80 Q30 78 30 60 Z" />,
  deer:     <path d="M42 72 Q40 52 50 40 Q60 52 58 72 Q54 80 50 82 Q46 80 42 72Z" />,
  hummer:   <path d="M44 58 Q42 44 52 36 Q62 44 60 58 Q58 68 52 70 Q46 68 44 58Z" />,
  lizard:   <path d="M30 60 Q36 44 50 42 Q64 44 70 60 Q66 74 50 76 Q34 74 30 60Z" />,
  coyote:   <path d="M38 66 Q40 46 52 40 Q64 46 64 66 Q62 78 52 80 Q42 78 38 66Z" />,
  jay:      <path d="M44 56 Q44 38 52 34 Q60 38 60 56 Q60 70 52 74 Q44 70 44 56Z" />,
  butterfly:<path d="M26 50 Q34 30 50 36 Q66 30 74 50 Q66 68 50 64 Q34 68 26 50Z" />,
  newt:     <path d="M32 58 Q34 44 50 42 Q66 44 68 58 Q66 72 50 74 Q34 72 32 58Z" />,
  rabbit:   <path d="M40 64 Q40 46 50 40 Q60 46 60 64 Q58 76 50 78 Q42 76 40 64Z" />,
  wood:     <path d="M44 56 Q44 36 50 32 Q56 36 58 56 Q58 72 50 76 Q42 72 44 56Z" />,
  snake:    <path d="M28 56 Q36 38 50 40 Q64 38 72 56 Q66 74 50 76 Q34 74 28 56Z" />,
  bobcat:   <path d="M36 64 Q38 46 50 40 Q62 46 64 64 Q62 78 50 80 Q38 78 36 64Z" />,
  blue:     <path d="M44 58 Q44 40 52 36 Q60 40 60 58 Q60 72 52 76 Q44 72 44 58Z" />,
  slug:     <path d="M34 60 Q36 46 50 44 Q64 46 66 60 Q64 72 50 74 Q36 72 34 60Z" />,
  hawk:     <path d="M38 56 Q40 36 52 32 Q62 36 64 56 Q62 72 52 76 Q42 72 38 56Z" />,
  otter:    <path d="M36 62 Q38 44 50 40 Q62 44 64 62 Q62 76 50 78 Q38 76 36 62Z" />,
};

export function PhotoBitmap({ photo, style }: { photo: PhotoLike; style?: CSSProperties }) {
  const [a, b, c, d] = photo.palette;
  return (
    <div style={{ position: "relative", overflow: "hidden", background: `linear-gradient(160deg, ${b} 0%, ${a} 45%, ${c} 100%)`, ...style }}>
      <svg width="100%" height="100%" style={{ position: "absolute", inset: 0, opacity: 0.4, mixBlendMode: "overlay" as const }}>
        <filter id={`gn-${photo.id}`}>
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves={2} stitchTiles="stitch" />
        </filter>
        <rect width="100%" height="100%" filter={`url(#gn-${photo.id})`} />
      </svg>
      <div style={{ position: "absolute", inset: 0, background: "radial-gradient(120% 80% at 50% 40%, transparent 40%, rgba(0,0,0,0.45) 100%)" }} />
      {SILHOUETTES[photo.id] && (
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" width="100%" height="100%" style={{ position: "absolute", inset: 0 }}>
          <g fill={d} opacity="0.55">{SILHOUETTES[photo.id]}</g>
        </svg>
      )}
    </div>
  );
}

// ── PrimaryButton ─────────────────────────────────────────────────────────────

export function PrimaryButton({
  children, onClick, disabled, style,
}: { children: React.ReactNode; onClick?: () => void; disabled?: boolean; style?: CSSProperties }) {
  const [hover, setHover] = useState(false);
  const [down, setDown] = useState(false);
  return (
    <button
      onClick={disabled ? undefined : onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => { setHover(false); setDown(false); }}
      onMouseDown={() => setDown(true)}
      onMouseUp={() => setDown(false)}
      disabled={disabled}
      style={{
        appearance: "none", border: 0, cursor: disabled ? "not-allowed" : "pointer",
        fontFamily: "inherit", fontSize: 14, fontWeight: 500, letterSpacing: "0.005em",
        color: "#fff", padding: "0 22px", height: 44, borderRadius: 10,
        background: disabled ? "#c8ccc5" : down ? "var(--accent-deep)" : hover ? "#5c7658" : "var(--accent)",
        boxShadow: disabled ? "none" : "0 1px 0 rgba(255,255,255,0.2) inset, 0 -1px 0 rgba(0,0,0,0.12) inset, 0 1px 2px rgba(30,50,30,0.18), 0 6px 16px -6px rgba(80,110,80,0.4)",
        transform: down && !disabled ? "translateY(0.5px)" : "none",
        transition: "background 120ms ease, transform 80ms ease",
        display: "inline-flex", alignItems: "center", gap: 8,
        ...style,
      }}
    >{children}</button>
  );
}

// ── GhostButton ───────────────────────────────────────────────────────────────

export function GhostButton({
  children, onClick, style,
}: { children: React.ReactNode; onClick?: () => void; style?: CSSProperties }) {
  const [hover, setHover] = useState(false);
  return (
    <button onClick={onClick}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        appearance: "none", border: "0.5px solid var(--hair-2)",
        background: hover ? "rgba(0,0,0,0.03)" : "transparent",
        cursor: "pointer", fontFamily: "inherit", fontSize: 14, fontWeight: 500,
        color: "var(--ink-2)", padding: "0 18px", height: 44, borderRadius: 10,
        display: "inline-flex", alignItems: "center", gap: 6,
        ...style,
      }}>{children}</button>
  );
}

// ── StepDots ──────────────────────────────────────────────────────────────────

export function StepDots({ step }: { step: number }) {
  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
      {[0, 1].map(i => (
        <div key={i} style={{
          width: i === step ? 18 : 6, height: 6, borderRadius: 999,
          background: i === step ? "var(--accent)" : "var(--ink-4)",
          opacity: i <= step ? 1 : 0.4,
          transition: "all 300ms cubic-bezier(.3,.7,.4,1)",
        }} />
      ))}
    </div>
  );
}
