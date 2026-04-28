import { useState, CSSProperties } from "react";
import { AppGlyph, Spinner } from "../components/ui";

// ── Section type & nav ────────────────────────────────────────────────────────

type Section = "models" | "general" | "storage" | "about";

const SECTIONS: { id: Section; label: string }[] = [
  { id: "models", label: "AI Models" },
  { id: "general", label: "General" },
  { id: "storage", label: "Storage" },
  { id: "about", label: "About" },
];

export default function Settings() {
  const [section, setSection] = useState<Section>("models");

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", minHeight: 0 }}>
      {/* header */}
      <div style={{ padding: "22px 32px 18px", borderBottom: "0.5px solid var(--hair)", flexShrink: 0 }}>
        <div style={{
          fontSize: 11, fontWeight: 600, letterSpacing: "0.14em", textTransform: "uppercase",
          color: "var(--accent-deep)", marginBottom: 6,
        }}>Preferences</div>
        <h1 style={{
          fontFamily: "Fraunces, serif", fontWeight: 500, fontSize: 26,
          letterSpacing: "-0.015em", color: "var(--ink)", margin: 0,
        }}>Settings</h1>
      </div>

      <div style={{ flex: 1, display: "grid", gridTemplateColumns: "200px 1fr", minHeight: 0 }}>
        {/* sub-nav */}
        <div style={{
          borderRight: "0.5px solid var(--hair)", padding: "18px 14px",
          display: "flex", flexDirection: "column", gap: 2, background: "#fbfaf6",
        }}>
          {SECTIONS.map(s => {
            const active = section === s.id;
            return (
              <button key={s.id} onClick={() => setSection(s.id)} style={{
                appearance: "none", border: 0, cursor: "pointer", textAlign: "left",
                padding: "7px 12px", borderRadius: 7,
                background: active ? "#fff" : "transparent",
                color: active ? "var(--ink)" : "var(--ink-3)",
                fontFamily: "inherit", fontSize: 13, fontWeight: active ? 500 : 450,
                boxShadow: active
                  ? "0 1px 2px rgba(0,0,0,0.06), 0 0 0 0.5px rgba(0,0,0,0.06)"
                  : "none",
              }}>{s.label}</button>
            );
          })}
        </div>

        {/* content */}
        <div style={{ overflow: "auto", minHeight: 0 }}>
          {section === "models" && <ModelsSection />}
          {section === "general" && <GeneralSection />}
          {section === "storage" && <StorageSection />}
          {section === "about" && <AboutSection />}
        </div>
      </div>
    </div>
  );
}

// ── Models section ────────────────────────────────────────────────────────────

function ModelsSection() {
  const active: string = "fast";
  const installed: string[] = ["fast"];

  return (
    <div style={{ padding: "28px 36px 36px", maxWidth: 720 }}>
      <SectionHeader
        title="AI Models"
        subtitle="Choose which on-device model identifies your photos. You can keep both installed and switch at any time."
      />

      <CurrentModelCard active={active} />

      <div style={{ marginTop: 24, display: "flex", flexDirection: "column", gap: 14 }}>
        <ModelRow
          id="fast"
          name="Fast"
          tagline="Best for most laptops"
          description="A compact, distilled model tuned for everyday use. Handles common birds, mammals, reptiles, and insects with high confidence."
          stats={[
            { k: "Speed", v: "1–2 sec / image" },
            { k: "Size", v: "604 MB" },
            { k: "Hardware", v: "Any modern computer" },
            { k: "Version", v: "v3.2 · Mar 2026" },
          ]}
          active={active === "fast"}
          installed={installed.includes("fast")}
        />
        <ModelRow
          id="accurate"
          name="Accurate"
          tagline="Slightly more accurate, a bit slower"
          description="A larger model with finer-grained recognition — better at subspecies, juveniles, and uncommon visitors. Needs more memory."
          stats={[
            { k: "Speed", v: "3–6 sec / image" },
            { k: "Size", v: "1.74 GB" },
            { k: "Hardware", v: "16 GB+ RAM recommended" },
            { k: "Version", v: "v3.2 · Mar 2026" },
          ]}
          active={active === "accurate"}
          installed={installed.includes("accurate")}
        />
      </div>

      {/* privacy notice */}
      <div style={{
        marginTop: 28, padding: "14px 16px", display: "flex", alignItems: "center", gap: 12,
        background: "var(--accent-softer)", borderRadius: 10,
        border: "0.5px solid rgba(106,133,102,0.18)",
      }}>
        <span style={{
          width: 30, height: 30, borderRadius: 8,
          background: "#fff", border: "0.5px solid rgba(106,133,102,0.25)",
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          color: "var(--accent-deep)", flexShrink: 0,
        }}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M7 1.5l1.5 4 4 .4-3 2.7.9 4-3.4-2.1L3.6 12.6l.9-4-3-2.7 4-.4z"
              stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" fill="none" />
          </svg>
        </span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, color: "var(--ink)", fontWeight: 500 }}>
            Both models run entirely on your computer.
          </div>
          <div style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 2 }}>
            No images, results, or metadata are ever sent to a server.
          </div>
        </div>
        <button style={GHOST_BTN}>Check for updates</button>
      </div>
    </div>
  );
}

function CurrentModelCard({ active }: { active: string }) {
  const meta = active === "fast"
    ? { name: "Fast", sub: "604 MB · v3.2", detail: "~1.4 sec per image · 11,420 species" }
    : { name: "Accurate", sub: "1.74 GB · v3.2", detail: "~4.1 sec per image · 11,420 species" };

  return (
    <div style={{
      padding: "18px 20px", borderRadius: 12,
      background: "linear-gradient(180deg, #fff 0%, var(--accent-softer) 180%)",
      border: "0.5px solid rgba(106,133,102,0.25)",
      display: "flex", alignItems: "center", gap: 16,
    }}>
      <div style={{
        width: 48, height: 48, borderRadius: 12, flexShrink: 0,
        background: "#fff", border: "0.5px solid rgba(106,133,102,0.25)",
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        boxShadow: "0 4px 12px -4px rgba(106,133,102,0.3)",
      }}>
        <AppGlyph size={22} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 10.5, fontWeight: 600, letterSpacing: "0.12em",
          textTransform: "uppercase", color: "var(--accent-deep)", marginBottom: 4,
        }}>Currently active</div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
          <span style={{
            fontFamily: "Fraunces, serif", fontWeight: 500, fontSize: 22,
            color: "var(--ink)", letterSpacing: "-0.01em",
          }}>{meta.name}</span>
          <span style={{ fontSize: 12.5, color: "var(--ink-3)" }}>{meta.sub}</span>
        </div>
        <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 2 }}>{meta.detail}</div>
      </div>
      <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          fontSize: 12, fontWeight: 500, color: "var(--accent-deep)",
        }}>
          <span style={{
            width: 8, height: 8, borderRadius: "50%",
            background: "var(--accent)", boxShadow: "0 0 6px var(--accent)",
          }} />
          Loaded in memory
        </span>
      </div>
    </div>
  );
}

interface ModelRowProps {
  id: string;
  name: string;
  tagline: string;
  description: string;
  stats: { k: string; v: string }[];
  active: boolean;
  installed: boolean;
}

function ModelRow({ name, tagline, description, stats, active, installed }: ModelRowProps) {
  return (
    <div style={{
      padding: "18px 20px", borderRadius: 12,
      background: "#fff", border: active ? "1.5px solid var(--accent)" : "0.5px solid var(--hair-2)",
      boxShadow: active
        ? "0 0 0 4px rgba(106,133,102,0.12)"
        : "0 1px 2px rgba(20,30,20,0.04)",
      transition: "all 200ms ease",
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 16 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <span style={{
              fontFamily: "Fraunces, serif", fontWeight: 500, fontSize: 20,
              color: "var(--ink)", letterSpacing: "-0.01em",
            }}>{name}</span>
            {active && (
              <span style={{
                fontSize: 10, fontWeight: 600, letterSpacing: "0.08em",
                textTransform: "uppercase", color: "var(--accent-deep)",
                background: "var(--accent-softer)",
                border: "0.5px solid rgba(106,133,102,0.3)",
                padding: "2px 7px", borderRadius: 999,
              }}>Active</span>
            )}
            {!installed && !active && (
              <span style={{
                fontSize: 10.5, color: "var(--ink-3)",
                background: "#fbfaf6", border: "0.5px solid var(--hair)",
                padding: "2px 7px", borderRadius: 999,
              }}>Not installed</span>
            )}
          </div>
          <div style={{ fontSize: 12.5, color: "var(--ink-3)" }}>{tagline}</div>
        </div>

        <div style={{ flexShrink: 0, display: "flex", gap: 8 }}>
          {active ? (
            <span style={{
              fontSize: 12, color: "var(--accent-deep)", fontWeight: 500,
              display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 12px",
            }}>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <circle cx="6" cy="6" r="5" fill="var(--accent)" />
                <path d="M3.5 6.2l2 2L9 4.5" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              In use
            </span>
          ) : installed ? (
            <>
              <button style={{ ...GHOST_BTN, color: "var(--ink-3)" }}>Remove</button>
              <button style={PRIMARY_BTN}>Switch to {name}</button>
            </>
          ) : (
            <button style={PRIMARY_BTN}>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M6 2v6M3 5l3 3 3-3M2 10h8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Download {name}
            </button>
          )}
        </div>
      </div>

      {/* stats */}
      <div style={{
        marginTop: 14, paddingTop: 14, borderTop: "0.5px solid var(--hair)",
        display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10,
      }}>
        {stats.map((s) => (
          <div key={s.k}>
            <div style={{
              fontSize: 10, fontWeight: 600, letterSpacing: "0.1em",
              textTransform: "uppercase", color: "var(--ink-4)", marginBottom: 4,
            }}>{s.k}</div>
            <div style={{ fontSize: 13, color: "var(--ink-2)", fontWeight: 450 }}>{s.v}</div>
          </div>
        ))}
      </div>

      {/* description */}
      <div style={{ marginTop: 12, fontSize: 12.5, lineHeight: 1.55, color: "var(--ink-3)" }}>
        {description}
      </div>
    </div>
  );
}

// ── General section ───────────────────────────────────────────────────────────

function GeneralSection() {
  const [theme, setTheme] = useState("system");
  const [autoSave, setAutoSave] = useState(true);
  const [showPct, setShowPct] = useState(true);
  const [sound, setSound] = useState(false);
  const [defaultView, setDefaultView] = useState("Grid");

  return (
    <div style={{ padding: "28px 36px 36px", maxWidth: 720 }}>
      <SectionHeader title="General" subtitle="Everyday preferences for the app." />
      <SettingsRow label="Theme" hint="Match your system or pick a side.">
        <SegmentedControl value={theme} options={["Light", "System", "Dark"]} onChange={setTheme} />
      </SettingsRow>
      <SettingsRow label="Auto-save identifications" hint="Add new IDs to your collection without prompting.">
        <Toggle on={autoSave} onChange={setAutoSave} />
      </SettingsRow>
      <SettingsRow label="Show confidence as percentage" hint="Otherwise show as a five-step rating.">
        <Toggle on={showPct} onChange={setShowPct} />
      </SettingsRow>
      <SettingsRow label="Sound on identification" hint="Play a soft chime when a result is ready.">
        <Toggle on={sound} onChange={setSound} />
      </SettingsRow>
      <SettingsRow label="Default view" hint="What you see when opening the Collection.">
        <SegmentedControl value={defaultView} options={["Grid", "List"]} onChange={setDefaultView} />
      </SettingsRow>
    </div>
  );
}

// ── Storage section ───────────────────────────────────────────────────────────

function StorageSection() {
  return (
    <div style={{ padding: "28px 36px 36px", maxWidth: 720 }}>
      <SectionHeader title="Storage" subtitle="Where Wildlife ID keeps its files. Everything stays on your computer." />
      <SettingsRow label="Library location" hint="~/Library/Application Support/Wildlife ID">
        <button style={GHOST_BTN}>Reveal</button>
      </SettingsRow>
      <UsageBar />
      <SettingsRow label="Clear cache" hint="Clears thumbnails and temporary previews (about 38 MB).">
        <button style={GHOST_BTN}>Clear cache</button>
      </SettingsRow>
    </div>
  );
}

function UsageBar() {
  const segs = [
    { label: "Models", pct: 0.46, color: "var(--accent)" },
    { label: "Collection", pct: 0.18, color: "#8a9c84" },
    { label: "Cache", pct: 0.04, color: "#c4cdb8" },
  ];
  return (
    <div style={{
      padding: "16px 18px", borderRadius: 10, background: "#fbfaf6",
      border: "0.5px solid var(--hair)", margin: "4px 0 14px",
    }}>
      <div style={{
        display: "flex", justifyContent: "space-between",
        fontSize: 12, color: "var(--ink-3)", marginBottom: 8,
      }}>
        <span>2.34 GB used</span>
        <span style={{ color: "var(--ink-4)" }}>of 256 GB available</span>
      </div>
      <div style={{
        display: "flex", height: 8, borderRadius: 999,
        overflow: "hidden", background: "var(--hair)",
      }}>
        {segs.map(s => (
          <div key={s.label} style={{ width: `${s.pct * 100}%`, background: s.color }} />
        ))}
      </div>
      <div style={{ display: "flex", gap: 14, marginTop: 10, fontSize: 11.5, color: "var(--ink-3)" }}>
        {segs.map(s => (
          <span key={s.label} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 7, height: 7, borderRadius: 2, background: s.color }} />
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}

// ── About section ─────────────────────────────────────────────────────────────

function AboutSection() {
  return (
    <div style={{ padding: "28px 36px 36px", maxWidth: 560 }}>
      <SectionHeader title="About" subtitle="Made with care for naturalists everywhere." />
      <div style={{
        padding: "18px 20px", borderRadius: 12, background: "#fff",
        border: "0.5px solid var(--hair)",
        display: "flex", alignItems: "center", gap: 16,
      }}>
        <span style={{
          width: 48, height: 48, borderRadius: 12,
          background: "var(--accent-softer)", border: "0.5px solid rgba(106,133,102,0.25)",
          display: "inline-flex", alignItems: "center", justifyContent: "center",
        }}>
          <AppGlyph size={24} />
        </span>
        <div>
          <div style={{ fontFamily: "Fraunces, serif", fontWeight: 500, fontSize: 20, color: "var(--ink)" }}>
            Wildlife <span style={{ fontStyle: "italic", fontWeight: 400, color: "var(--accent-deep)" }}>ID</span>
          </div>
          <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 2 }}>
            Version 1.4.2 · Build 2026.04.21
          </div>
        </div>
      </div>
      <div style={{ marginTop: 18, fontSize: 12.5, lineHeight: 1.6, color: "var(--ink-3)" }}>
        Powered by BioCLIP (MIT). Trained on the TreeOfLife-200M dataset, which incorporates
        iNaturalist research-grade observations.
      </div>
      <div style={{ marginTop: 18, display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button style={GHOST_BTN}>Acknowledgements</button>
        <button style={GHOST_BTN}>Open Source Licenses</button>
        <button style={GHOST_BTN}>Privacy</button>
      </div>
    </div>
  );
}

// ── Shared components ─────────────────────────────────────────────────────────

function SectionHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <h2 style={{
        fontFamily: "Fraunces, serif", fontWeight: 500, fontSize: 22,
        color: "var(--ink)", margin: 0, letterSpacing: "-0.01em",
      }}>{title}</h2>
      <p style={{
        fontSize: 13, color: "var(--ink-3)",
        margin: "6px 0 0", lineHeight: 1.5, maxWidth: 540,
      }}>{subtitle}</p>
    </div>
  );
}

function SettingsRow({ label, hint, children }: {
  label: string; hint?: string; children: React.ReactNode;
}) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 20,
      padding: "14px 0", borderTop: "0.5px solid var(--hair)",
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, color: "var(--ink)", fontWeight: 450 }}>{label}</div>
        {hint && <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 2 }}>{hint}</div>}
      </div>
      <div style={{ flexShrink: 0 }}>{children}</div>
    </div>
  );
}

function SegmentedControl({ value, options, onChange }: {
  value: string; options: string[]; onChange: (v: string) => void;
}) {
  return (
    <div style={{
      display: "flex", padding: 2, background: "#fbfaf6",
      borderRadius: 7, border: "0.5px solid var(--hair)",
    }}>
      {options.map(o => {
        const active = value.toLowerCase() === o.toLowerCase();
        return (
          <button key={o} onClick={() => onChange(o)} style={{
            appearance: "none", border: 0, cursor: "pointer",
            padding: "5px 12px", borderRadius: 5,
            background: active ? "#fff" : "transparent",
            color: active ? "var(--ink)" : "var(--ink-3)",
            fontFamily: "inherit", fontSize: 12, fontWeight: active ? 500 : 450,
            boxShadow: active ? "0 1px 2px rgba(0,0,0,0.06), 0 0 0 0.5px rgba(0,0,0,0.06)" : "none",
          }}>{o}</button>
        );
      })}
    </div>
  );
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!on)} style={{
      appearance: "none", border: 0, cursor: "pointer",
      width: 36, height: 20, borderRadius: 999, padding: 0, position: "relative",
      background: on ? "var(--accent)" : "rgba(0,0,0,0.18)",
      transition: "background 160ms ease",
    }}>
      <span style={{
        position: "absolute", top: 2, left: on ? 18 : 2,
        width: 16, height: 16, borderRadius: "50%", background: "#fff",
        boxShadow: "0 1px 2px rgba(0,0,0,0.25)",
        transition: "left 160ms ease",
      }} />
    </button>
  );
}

// ── Button styles ─────────────────────────────────────────────────────────────

const GHOST_BTN: CSSProperties = {
  appearance: "none",
  border: "0.5px solid var(--hair-2)",
  background: "#fff",
  color: "var(--ink-2)",
  fontFamily: "inherit",
  fontSize: 12.5,
  fontWeight: 500,
  padding: "7px 12px",
  borderRadius: 7,
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
};

const PRIMARY_BTN: CSSProperties = {
  appearance: "none",
  border: 0,
  background: "var(--accent)",
  color: "#fff",
  fontFamily: "inherit",
  fontSize: 12.5,
  fontWeight: 500,
  padding: "7px 14px",
  borderRadius: 7,
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  boxShadow: "0 1px 0 rgba(255,255,255,0.2) inset, 0 4px 10px -4px rgba(80,110,80,0.5)",
};
