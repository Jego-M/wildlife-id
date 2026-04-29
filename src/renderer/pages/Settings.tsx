import { useState, useEffect, useCallback, CSSProperties } from "react";
import { AppGlyph, Spinner } from "../components/ui";
import { getSetting, setSetting } from "../lib/settings";
import type { StorageInfo, ModelId, ModelsResponse, ModelDownloadProgress } from "../../shared/types";

// Models advertise their size in 1000-based units (HF download sizes), so use
// SI MB/GB rather than the 1024-based fmtBytes helper used for disk usage.
function fmtModelSize(bytes: number): string {
  if (bytes < 1_000_000_000) return `${Math.round(bytes / 1_000_000)} MB`;
  return `${(Math.round(bytes / 100_000_000) / 10).toFixed(1)} GB`;
}

// ── Section type & nav ────────────────────────────────────────────────────────

type Section = "models" | "general" | "storage" | "about";

const SECTIONS: { id: Section; label: string }[] = [
  { id: "models", label: "AI Models" },
  { id: "general", label: "Sound" },
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

type RowAction = "switching" | "removing" | "downloading";

function ModelsSection() {
  const [data, setData] = useState<ModelsResponse | null>(null);
  const [busy, setBusy] = useState<ModelId | null>(null);
  const [action, setAction] = useState<RowAction | null>(null);
  const [progress, setProgress] = useState<ModelDownloadProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setData(await window.api.models.list());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load models.");
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // Subscribe to download progress only while a download is in flight.
  useEffect(() => {
    if (action !== "downloading") return;
    const unsubscribe = window.api.models.onDownloadProgress((p) => {
      if (p.model_id !== busy) return;
      setProgress(p);
      if (p.status === "error") {
        setError(p.error ?? "Download failed.");
      }
    });
    return unsubscribe;
  }, [action, busy]);

  const run = useCallback(
    async (id: ModelId, kind: RowAction, op: () => Promise<void>, fallbackMsg: string) => {
      setError(null); setBusy(id); setAction(kind);
      if (kind === "downloading") setProgress(null);
      try {
        await op();
        await refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : fallbackMsg);
      } finally {
        setBusy(null); setAction(null);
        if (kind === "downloading") setProgress(null);
      }
    },
    [refresh],
  );

  const handleSwitch = (id: ModelId) =>
    run(id, "switching", () => window.api.models.select(id), "Could not switch model.");

  const handleDownload = (id: ModelId) =>
    run(id, "downloading", () => window.api.models.download(id), "Could not download model.");

  const handleRemove = (id: ModelId) => {
    if (!window.confirm("Remove this model? Its files will be deleted from disk.")) return;
    return run(id, "removing", () => window.api.models.remove(id), "Could not remove model.");
  };

  // While loading, fall back to the original hardcoded defaults so the layout
  // doesn't flicker. Once the list arrives we show real active/installed state.
  const activeUi: "fast" | "accurate" = data?.active === "bioclip-v2" ? "accurate" : "fast";
  const infoFor = (id: ModelId) => data?.available.find(m => m.id === id);
  const isInstalled = (id: ModelId): boolean =>
    data ? (infoFor(id)?.downloaded ?? false) : id === "bioclip-v1";
  const sizeFor = (id: ModelId, fallback: string): string => {
    const info = infoFor(id);
    return info ? fmtModelSize(info.size_bytes) : fallback;
  };

  const activeModelId: ModelId = activeUi === "accurate" ? "bioclip-v2" : "bioclip-v1";

  return (
    <div style={{ padding: "28px 36px 36px", maxWidth: 720 }}>
      <SectionHeader
        title="AI Models"
        subtitle="Choose which on-device model identifies your photos. You can keep both installed and switch at any time."
      />

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

      <CurrentModelCard active={activeUi} size={sizeFor(activeModelId, "—")} />

      <div style={{ marginTop: 24, display: "flex", flexDirection: "column", gap: 14 }}>
        <ModelRow
          id="fast"
          name="Fast"
          tagline="Best for most laptops"
          description="A compact, distilled model tuned for everyday use. Handles common birds, mammals, reptiles, and insects with high confidence."
          stats={[
            { k: "Speed", v: "1–2 sec / image" },
            { k: "Size", v: sizeFor("bioclip-v1", "604 MB") },
            { k: "Hardware", v: "Any modern computer" },
            { k: "Version", v: "v3.2 · Mar 2026" },
          ]}
          active={activeUi === "fast"}
          installed={isInstalled("bioclip-v1")}
          action={busy === "bioclip-v1" ? action : null}
          progress={busy === "bioclip-v1" ? progress : null}
          disabled={busy !== null}
          onSwitch={() => handleSwitch("bioclip-v1")}
          onDownload={() => handleDownload("bioclip-v1")}
          onRemove={() => handleRemove("bioclip-v1")}
        />
        <ModelRow
          id="accurate"
          name="Accurate"
          tagline="Slightly more accurate, a bit slower"
          description="A larger model with finer-grained recognition — better at subspecies, juveniles, and uncommon visitors. Needs more memory."
          stats={[
            { k: "Speed", v: "3–6 sec / image" },
            { k: "Size", v: sizeFor("bioclip-v2", "1.74 GB") },
            { k: "Hardware", v: "16 GB+ RAM recommended" },
            { k: "Version", v: "v3.2 · Mar 2026" },
          ]}
          active={activeUi === "accurate"}
          installed={isInstalled("bioclip-v2")}
          action={busy === "bioclip-v2" ? action : null}
          progress={busy === "bioclip-v2" ? progress : null}
          disabled={busy !== null}
          onSwitch={() => handleSwitch("bioclip-v2")}
          onDownload={() => handleDownload("bioclip-v2")}
          onRemove={() => handleRemove("bioclip-v2")}
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

function CurrentModelCard({ active, size }: { active: string; size: string }) {
  const meta = active === "fast"
    ? { name: "Fast", sub: `${size} · v3.2`, detail: "~1.4 sec per image · 11,420 species" }
    : { name: "Accurate", sub: `${size} · v3.2`, detail: "~4.1 sec per image · 11,420 species" };

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
  action: RowAction | null;
  progress: ModelDownloadProgress | null;
  disabled?: boolean;
  onSwitch?: () => void;
  onDownload?: () => void;
  onRemove?: () => void;
}

function ModelRow({
  name, tagline, description, stats, active, installed,
  action, progress, disabled, onSwitch, onDownload, onRemove,
}: ModelRowProps) {
  const downloading = action === "downloading";
  const switching = action === "switching";
  const removing = action === "removing";
  const progressPct = progress && progress.bytes_total > 0
    ? Math.min(100, Math.round((progress.bytes_downloaded / progress.bytes_total) * 100))
    : 0;
  const progressLabel =
    progress?.status === "verifying" ? "Verifying…" :
    progress?.status === "ready"     ? "Finishing…" :
    `Downloading… ${progressPct}%`;
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
          ) : downloading ? (
            <span style={{
              fontSize: 12, color: "var(--ink-2)", fontWeight: 500,
              display: "inline-flex", alignItems: "center", gap: 8, padding: "7px 12px",
            }}>
              <Spinner />
              {progressLabel}
            </span>
          ) : installed ? (
            <>
              <button
                style={{ ...GHOST_BTN, color: "var(--ink-3)" }}
                onClick={onRemove}
                disabled={disabled}
              >
                {removing ? "Removing…" : "Remove"}
              </button>
              <button
                style={PRIMARY_BTN}
                onClick={onSwitch}
                disabled={disabled}
              >
                {switching ? "Switching…" : `Switch to ${name}`}
              </button>
            </>
          ) : (
            <button style={PRIMARY_BTN} onClick={onDownload} disabled={disabled}>
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

      {/* description (or download progress) */}
      {downloading ? (
        <div style={{ marginTop: 12 }}>
          <div style={{
            height: 6, borderRadius: 999, background: "var(--accent-softer)",
            overflow: "hidden",
          }}>
            <div style={{
              width: `${progressPct}%`, height: "100%",
              background: "linear-gradient(90deg, var(--accent-deep), var(--accent))",
              borderRadius: 999, transition: "width 120ms linear",
            }} />
          </div>
          <div style={{
            display: "flex", justifyContent: "space-between", marginTop: 6,
            fontSize: 11, color: "var(--ink-4)",
            fontFamily: "JetBrains Mono, monospace", fontVariantNumeric: "tabular-nums",
          }}>
            <span>
              {progress ? fmtModelSize(progress.bytes_downloaded) : "0 MB"}
              {" / "}
              {progress ? fmtModelSize(progress.bytes_total) : "—"}
            </span>
            <span>{progressPct}%</span>
          </div>
        </div>
      ) : (
        <div style={{ marginTop: 12, fontSize: 12.5, lineHeight: 1.55, color: "var(--ink-3)" }}>
          {description}
        </div>
      )}
    </div>
  );
}

function ErrorBanner({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  return (
    <div style={{
      marginBottom: 16, padding: "10px 14px", borderRadius: 8,
      background: "#fde8e6", border: "0.5px solid #e8b6b0", color: "#8b2a1f",
      fontSize: 12.5, display: "flex", alignItems: "center",
      justifyContent: "space-between", gap: 12,
    }}>
      <span>{message}</span>
      <button onClick={onDismiss} aria-label="Dismiss" style={{
        appearance: "none", border: 0, background: "transparent", cursor: "pointer",
        color: "#8b2a1f", fontSize: 18, padding: 0, lineHeight: 1,
      }}>×</button>
    </div>
  );
}

// ── Sound section ───────────────────────────────────────────────────────────

const SOUNDS = [
  { id: "identify-complete-1", label: "Chime" },
  { id: "identify-complete-2", label: "Ding" },
  { id: "identify-complete-3", label: "Pop" },
];

function GeneralSection() {
  const [sound, setSound] = useState(() => getSetting("sound", false));
  const [soundId, setSoundId] = useState(() => getSetting("soundId", SOUNDS[1].id));
  const [volume, setVolume] = useState(() => Number(getSetting("soundVolume", "1")));

  const preview = (id: string) => {
    const audio = new Audio(`sounds/${id}.mp3`);
    audio.volume = volume;
    audio.play().catch(() => {});
  };

  return (
    <div style={{ padding: "28px 36px 36px", maxWidth: 720 }}>
      <SectionHeader title="Sound" subtitle="Audio feedback when an identification finishes." />
      <SettingsRow label="Sound on identification" hint="Play a sound when a result is ready.">
        <Toggle on={sound} onChange={v => { setSound(v); setSetting("sound", v); }} />
      </SettingsRow>
      {sound && (
        <>
          <SettingsRow label="Notification sound" hint="Pick the chime you prefer.">
            <div style={{ display: "flex", gap: 6 }}>
              {SOUNDS.map(s => {
                const active = soundId === s.id;
                return (
                  <button key={s.id} onClick={() => {
                    setSoundId(s.id); setSetting("soundId", s.id); preview(s.id);
                  }} style={{
                    appearance: "none", border: 0, cursor: "pointer",
                    padding: "5px 12px", borderRadius: 5,
                    background: active ? "#fff" : "transparent",
                    color: active ? "var(--ink)" : "var(--ink-3)",
                    fontFamily: "inherit", fontSize: 12, fontWeight: active ? 500 : 450,
                    boxShadow: active ? "0 1px 2px rgba(0,0,0,0.06), 0 0 0 0.5px rgba(0,0,0,0.06)" : "none",
                  }}>{s.label}</button>
                );
              })}
            </div>
          </SettingsRow>
          <SettingsRow label="Volume" hint="Adjust the notification loudness.">
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
                <path d="M2 6h2.5L8 3v10L4.5 10H2a1 1 0 01-1-1V7a1 1 0 011-1z" fill="var(--ink-3)" />
                {volume > 0 && <path d="M10.5 4.5a4 4 0 010 7" stroke="var(--ink-3)" strokeWidth="1.2" strokeLinecap="round" fill="none" />}
                {volume > 0.5 && <path d="M12.5 2.5a7 7 0 010 11" stroke="var(--ink-3)" strokeWidth="1.2" strokeLinecap="round" fill="none" />}
              </svg>
              <input type="range" min={0} max={1} step={0.05} value={volume}
                onChange={e => {
                  const v = Number(e.target.value);
                  setVolume(v);
                  setSetting("soundVolume", String(v));
                }}
                onPointerUp={() => preview(soundId)}
                style={{ width: 100, accentColor: "var(--accent)" }}
              />
              <span style={{
                fontFamily: "JetBrains Mono, monospace", fontSize: 11,
                color: "var(--ink-3)", width: 32, textAlign: "right",
                fontVariantNumeric: "tabular-nums",
              }}>{Math.round(volume * 100)}%</span>
            </div>
          </SettingsRow>
        </>
      )}
    </div>
  );
}

// ── Storage section ───────────────────────────────────────────────────────────

function StorageSection() {
  const [info, setInfo] = useState<StorageInfo | null>(null);

  useEffect(() => {
    window.api.app.storageInfo().then(setInfo);
  }, []);

  const displayPath = info
    ? info.dataPath.replace(/^\/Users\/[^/]+/, "~").replace(/^\/home\/[^/]+/, "~").replace(/^[A-Z]:\\Users\\[^/\\]+/, "~")
    : "Loading…";

  return (
    <div style={{ padding: "28px 36px 36px", maxWidth: 720 }}>
      <SectionHeader title="Storage" subtitle="Where Wildlife ID keeps its files. Everything stays on your computer." />
      <SettingsRow label="Library location" hint={displayPath}>
        <button style={GHOST_BTN} onClick={() => window.api.app.openDataFolder()}>Reveal</button>
      </SettingsRow>
      <UsageBar info={info} />
      <SettingsRow label="Clear logs" hint={info ? `Application logs (${fmtBytes(info.logsBytes)})` : "Application logs"}>
        <button style={GHOST_BTN} onClick={async () => {
          await window.api.app.clearLogs();
          const updated = await window.api.app.storageInfo();
          setInfo(updated);
        }}>Clear logs</button>
      </SettingsRow>
    </div>
  );
}

function UsageBar({ info }: { info: StorageInfo | null }) {
  if (!info) return null;

  const totalUsed = info.modelsBytes + info.collectionBytes + info.logsBytes;
  const segs = [
    { label: "Models", bytes: info.modelsBytes, color: "var(--accent)" },
    { label: "Collection", bytes: info.collectionBytes, color: "#8a9c84" },
    { label: "Logs", bytes: info.logsBytes, color: "#c4cdb8" },
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
        <span>{fmtBytes(totalUsed)} used</span>
        <span style={{ color: "var(--ink-4)" }}>of {fmtBytes(info.diskAvailableBytes + totalUsed)} available</span>
      </div>
      <div style={{
        display: "flex", height: 8, borderRadius: 999,
        overflow: "hidden", background: "var(--hair)",
      }}>
        {segs.map(s => (
          totalUsed > 0 && <div key={s.label} style={{ width: `${(s.bytes / (info.diskAvailableBytes + totalUsed)) * 100}%`, background: s.color }} />
        ))}
      </div>
      <div style={{ display: "flex", gap: 14, marginTop: 10, fontSize: 11.5, color: "var(--ink-3)" }}>
        {segs.map(s => (
          <span key={s.label} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 7, height: 7, borderRadius: 2, background: s.color }} />
            {s.label} ({fmtBytes(s.bytes)})
          </span>
        ))}
      </div>
    </div>
  );
}

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

// ── About section ─────────────────────────────────────────────────────────────

function AboutSection() {
  const [version, setVersion] = useState("…");

  useEffect(() => {
    window.api.app.version().then(setVersion);
  }, []);

  return (
    <div style={{ padding: "28px 36px 36px", maxWidth: 560 }}>
      <SectionHeader title="About" subtitle="Made with care for wildlife enthusiasts everywhere." />
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
            Version {version}
          </div>
        </div>
      </div>
      <div style={{ marginTop: 18, fontSize: 12.5, lineHeight: 1.6, color: "var(--ink-3)" }}>
        Powered by BioCLIP (MIT). Trained on the TreeOfLife-200M dataset, which incorporates
        iNaturalist research-grade observations.
      </div>
      <div style={{ marginTop: 18, display: "flex", gap: 8, flexWrap: "wrap" }}>
        <a
          href="https://github.com/Jego-M/wildlife-id#license"
          target="_blank"
          rel="noopener noreferrer"
          style={{ ...GHOST_BTN, textDecoration: "none" }}
        >
          Open Source Licenses
        </a>
      </div>
      <div style={{
        marginTop: 24, padding: "16px 20px", borderRadius: 10, background: "#fbfaf6",
        border: "0.5px solid var(--hair)",
      }}>
        <div style={{ fontSize: 13, color: "var(--ink-2)", lineHeight: 1.5 }}>
          Enjoying Wildlife ID? Consider buying me a coffee to support development.
        </div>
        <a
          href="https://buymeacoffee.com/jego"
          target="_blank"
          rel="noopener noreferrer"
          style={{ ...PRIMARY_BTN, marginTop: 12, textDecoration: "none" }}
        >
          Support this project
        </a>
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
