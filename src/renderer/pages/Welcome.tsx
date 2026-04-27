import { Wordmark, StepDots, PrimaryButton } from "../components/ui";

export default function Welcome({ onContinue }: { onContinue: () => void }) {
  return (
    <div style={{
      height: "100%", display: "grid", gridTemplateColumns: "1.05fr 1fr",
      background: "var(--bg-app)",
    }}>
      {/* Left: copy */}
      <div style={{
        padding: "72px 72px 48px", display: "flex", flexDirection: "column",
        justifyContent: "space-between",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <Wordmark large />
          <StepDots step={0} />
        </div>

        <div style={{ maxWidth: 460 }}>
          <div style={{
            fontSize: 12, fontWeight: 600, letterSpacing: "0.14em",
            textTransform: "uppercase" as const, color: "var(--accent-deep)", marginBottom: 18,
          }}>Welcome</div>

          <h1 style={{
            fontFamily: "Fraunces, serif", fontWeight: 400,
            fontSize: 44, lineHeight: 1.08, letterSpacing: "-0.02em",
            color: "var(--ink)", margin: "0 0 20px",
          }}>
            Identify wildlife from your photos,<br />
            <span style={{ fontStyle: "italic", color: "var(--accent-deep)" }}>
              right on your computer.
            </span>
          </h1>

          <p style={{
            fontSize: 15.5, lineHeight: 1.6, color: "var(--ink-2)", margin: "0 0 32px", maxWidth: 440,
          }}>
            Drop in a photo of an animal and Wildlife ID names the species using an
            on‑device AI model. Save findings to a personal collection that stays
            yours — it all works offline, and nothing ever leaves your machine.
          </p>

          <div style={{ display: "flex", gap: 28, marginBottom: 40 }}>
            <FeatureChip icon="offline" label="Fully offline" />
            <FeatureChip icon="lock" label="Private by design" />
            <FeatureChip icon="collection" label="Personal collection" />
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <PrimaryButton onClick={onContinue}>
              Get started
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M2 7h10M8 3l4 4-4 4" stroke="currentColor" strokeWidth="1.5"
                  strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </PrimaryButton>
            <span style={{ fontSize: 13, color: "var(--ink-3)" }}>Takes about a minute</span>
          </div>
        </div>

        <div style={{ fontSize: 12, color: "var(--ink-3)" }}>
          Open source under MIT —{" "}
          <a href="#" onClick={e => e.preventDefault()} style={{
            color: "var(--ink-2)", textDecoration: "underline",
            textDecorationColor: "var(--ink-4)", textUnderlineOffset: 3,
          }}>view license</a>
        </div>
      </div>

      {/* Right: decorative art */}
      <WelcomeArt />
    </div>
  );
}

function FeatureChip({ icon, label }: { icon: "offline" | "lock" | "collection"; label: string }) {
  const icons: Record<string, React.ReactNode> = {
    offline: <path d="M2 10c3-3 9-3 12 0M4.5 12.5c2-2 5-2 7 0M7 15l1 1 1-1"
      stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" fill="none" />,
    lock: <>
      <rect x="3.5" y="7.5" width="9" height="7" rx="1.5" stroke="currentColor"
        strokeWidth="1.3" fill="none" />
      <path d="M5.5 7.5V5a2.5 2.5 0 0 1 5 0v2.5" stroke="currentColor" strokeWidth="1.3" fill="none" />
    </>,
    collection: <>
      <rect x="2.5" y="3.5" width="11" height="9" rx="1.5" stroke="currentColor"
        strokeWidth="1.3" fill="none" />
      <path d="M2.5 7h11M6 3.5v9" stroke="currentColor" strokeWidth="1.3" />
    </>,
  };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{
        width: 26, height: 26, borderRadius: 8,
        background: "var(--accent-softer)",
        border: "0.5px solid rgba(106,133,102,0.25)",
        color: "var(--accent-deep)",
        display: "inline-flex", alignItems: "center", justifyContent: "center",
      }}>
        <svg width="16" height="16" viewBox="0 0 16 16">{icons[icon]}</svg>
      </span>
      <span style={{ fontSize: 13, fontWeight: 450, color: "var(--ink-2)" }}>{label}</span>
    </div>
  );
}

function WelcomeArt() {
  return (
    <div style={{
      position: "relative", overflow: "hidden",
      background: "linear-gradient(160deg, #ecece4 0%, #d9dbcd 100%)",
      borderLeft: "0.5px solid var(--hair)",
    }}>
      <svg width="100%" height="100%" style={{ position: "absolute", inset: 0, opacity: 0.35 }}>
        <defs>
          <pattern id="topo" x="0" y="0" width="140" height="140" patternUnits="userSpaceOnUse">
            {[20, 45, 70, 95, 120].map((r, i) => (
              <circle key={i} cx="70" cy="70" r={r} fill="none" stroke="#8a9183" strokeWidth="0.5" />
            ))}
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#topo)" />
      </svg>

      <div style={{
        position: "absolute", left: "8%", top: "14%", width: "72%", height: "58%",
        borderRadius: 12, overflow: "hidden",
        boxShadow: "0 20px 40px -10px rgba(20,30,20,0.35), 0 0 0 0.5px rgba(0,0,0,0.15)",
        background: "repeating-linear-gradient(45deg,#b9b9ad 0 8px,#aeae9f 8px 16px)",
      }}>
        <div style={{
          position: "absolute", inset: 0,
          background: "linear-gradient(180deg, rgba(80,90,70,0.25) 0%, rgba(40,50,35,0.45) 100%)",
        }} />
        <div style={{
          position: "absolute", left: 16, top: 14, display: "flex", alignItems: "center", gap: 8,
          fontFamily: "JetBrains Mono, monospace", fontSize: 10.5,
          color: "rgba(255,255,255,0.85)", letterSpacing: "0.04em",
        }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#e8d66a" }} />
          IMG_4218.jpg · wildlife photo
        </div>
        <div style={{
          position: "absolute", right: 16, bottom: 16,
          fontFamily: "JetBrains Mono, monospace", fontSize: 10,
          color: "rgba(255,255,255,0.7)",
        }}>1024 × 1536 · f/5.6 · 1/320s</div>
      </div>

      <div style={{
        position: "absolute", right: "6%", bottom: "10%", width: 300,
        background: "#fff", borderRadius: 12, padding: "18px 20px",
        boxShadow: "0 20px 50px -20px rgba(20,30,20,0.35), 0 0 0 0.5px rgba(0,0,0,0.06)",
        border: "0.5px solid var(--hair)",
      }}>
        <div style={{
          fontSize: 10.5, fontWeight: 600, letterSpacing: "0.12em",
          textTransform: "uppercase" as const, color: "var(--accent-deep)", marginBottom: 6,
        }}>Identified</div>
        <div style={{
          fontFamily: "Fraunces, serif", fontSize: 22, fontWeight: 500,
          letterSpacing: "-0.01em", color: "var(--ink)", marginBottom: 2,
        }}>Red Fox</div>
        <div style={{
          fontFamily: "Fraunces, serif", fontStyle: "italic", fontSize: 13,
          color: "var(--ink-3)", marginBottom: 14,
        }}>Vulpes vulpes</div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ flex: 1, height: 4, background: "var(--accent-softer)",
            borderRadius: 999, overflow: "hidden" }}>
            <div style={{ width: "94%", height: "100%", background: "var(--accent)" }} />
          </div>
          <span style={{ fontSize: 12, fontWeight: 500, color: "var(--ink-2)" }}>94%</span>
        </div>
        <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 10, display: "flex", gap: 10 }}>
          <span>Mammalia</span>
          <span style={{ color: "var(--ink-4)" }}>·</span>
          <span>Canidae</span>
          <span style={{ color: "var(--ink-4)" }}>·</span>
          <span>Least concern</span>
        </div>
      </div>
    </div>
  );
}
