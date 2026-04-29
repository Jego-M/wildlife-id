import { useState, useEffect, useCallback, CSSProperties } from "react";
import { Wordmark, Spinner, StepDots, PrimaryButton, GhostButton } from "../components/ui";
import type { ModelDownloadProgress, ModelId, ModelsResponse } from "../../shared/types";

function fmtModelSize(bytes: number): string {
  if (bytes < 1_000_000_000) return `${Math.round(bytes / 1_000_000)} MB`;
  return `${parseFloat((bytes / 1_000_000_000).toFixed(2))} GB`;
}

const MODEL_MAP = { fast: "bioclip-v1" as ModelId, accurate: "bioclip-v2" as ModelId };

export default function ModelPicker({
  onBack, onComplete,
}: { onBack: () => void; onComplete: () => void }) {
  const [selected, setSelected] = useState<"fast" | "accurate">("fast");
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState<ModelDownloadProgress | null>(null);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modelsData, setModelsData] = useState<ModelsResponse | null>(null);

  useEffect(() => {
    window.api.models.list().then(setModelsData).catch(() => {});
  }, []);

  useEffect(() => {
    if (!downloading) return;
    const unsubscribe = window.api.models.onDownloadProgress((p) => {
      if (p.model_id !== MODEL_MAP[selected]) return;
      setProgress(p);
      if (p.status === "ready") {
        setDone(true);
        // Persist the user's choice so the backend boots into it on restart.
        window.api.models.select(MODEL_MAP[selected]).catch(() => {
          // Non-fatal — predict will work for the rest of this session.
        });
      }
      if (p.status === "error") {
        setError(p.error ?? "Download failed");
        setDownloading(false);
      }
    });
    return unsubscribe;
  }, [downloading, selected]);

  const startDownload = useCallback(async () => {
    setProgress(null);
    setDone(false);
    setError(null);
    setDownloading(true);
    try {
      await window.api.models.download(MODEL_MAP[selected]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Download failed");
      setDownloading(false);
    }
  }, [selected]);

  const reset = () => { setDownloading(false); setProgress(null); setDone(false); setError(null); };

  const progressPct = progress && progress.bytes_total > 0
    ? Math.min(1, progress.bytes_downloaded / progress.bytes_total)
    : 0;

  const sizeFor = (id: ModelId, fallback: string) => {
    const info = modelsData?.available.find(m => m.id === id);
    return info ? `~${fmtModelSize(info.size_bytes)}` : fallback;
  };
  const bytesFor = (id: ModelId) =>
    modelsData?.available.find(m => m.id === id)?.size_bytes ?? 0;

  return (
    <div style={{
      height: "100%", display: "flex", flexDirection: "column",
      background: "var(--bg-app)", padding: "32px 72px 40px",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <button onClick={onBack} style={{
          appearance: "none", border: 0, background: "transparent",
          cursor: "pointer", color: "var(--ink-3)", fontFamily: "inherit", fontSize: 13,
          display: "inline-flex", alignItems: "center", gap: 6,
          padding: "6px 8px", marginLeft: -8, borderRadius: 6,
        }}>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M8 2L4 6l4 4" stroke="currentColor" strokeWidth="1.5"
              strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Back
        </button>
        <Wordmark />
        <StepDots step={1} />
      </div>

      <div style={{ marginTop: 44, marginBottom: 36, maxWidth: 680 }}>
        <div style={{
          fontSize: 12, fontWeight: 600, letterSpacing: "0.14em",
          textTransform: "uppercase" as const, color: "var(--accent-deep)", marginBottom: 14,
        }}>Step 2 of 2 · Choose a model</div>
        <h2 style={{
          fontFamily: "Fraunces, serif", fontWeight: 400,
          fontSize: 34, lineHeight: 1.12, letterSpacing: "-0.015em",
          color: "var(--ink)", margin: "0 0 10px",
        }}>
          Which AI model would you like to use?
        </h2>
        <p style={{ fontSize: 14.5, lineHeight: 1.55, color: "var(--ink-3)", margin: 0, maxWidth: 560 }}>
          Both run entirely on your device. You can switch anytime.

        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, maxWidth: 880 }}>
        <ModelCard
          id="fast" recommended
          name="Fast"
          subtitle="Best for most laptops"
          stats={[
            { label: "Speed", value: "1–2 sec", sub: "per image" },
            { label: "Size", value: sizeFor("bioclip-v1", "~1.1 GB"), sub: "download" },
            { label: "Hardware", value: "Any modern computer", sub: "" },
          ]}
          totalBytes={bytesFor("bioclip-v1")}
          selected={selected === "fast"}
          disabled={downloading}
          onSelect={() => setSelected("fast")}
          downloading={downloading && selected === "fast"}
          progressPct={progressPct}
          progress={progress}
          done={done}
        />
        <ModelCard
          id="accurate"
          name="Accurate"
          subtitle="Slightly more accurate, a bit slower"
          stats={[
            { label: "Speed", value: "3–6 sec", sub: "per image" },
            { label: "Size", value: sizeFor("bioclip-v2", "~2.4 GB"), sub: "download" },
            { label: "Hardware", value: "16 GB+ RAM recommended", sub: "" },
          ]}
          totalBytes={bytesFor("bioclip-v2")}
          selected={selected === "accurate"}
          disabled={downloading}
          onSelect={() => setSelected("accurate")}
          downloading={downloading && selected === "accurate"}
          progressPct={progressPct}
          progress={progress}
          done={done}
        />
      </div>

      <div style={{ flex: 1 }} />
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 28,
      }}>
        <div style={{ fontSize: 13, color: "var(--ink-3)" }}>
          You can switch models later in Settings.
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {error && (
            <span style={{ fontSize: 13, color: "#c0392b", fontWeight: 500, maxWidth: 260 }}>
              {error}
            </span>
          )}
          {done && (
            <span style={{
              fontSize: 13, color: "var(--accent-deep)", fontWeight: 500,
              display: "inline-flex", alignItems: "center", gap: 6,
            }}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <circle cx="7" cy="7" r="6" fill="var(--accent)" />
                <path d="M4 7.2l2 2 4-4.4" stroke="#fff" strokeWidth="1.6"
                  strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Ready
            </span>
          )}
          {(downloading && !done) && (
            <GhostButton onClick={reset} style={{ height: 40 }}>Cancel</GhostButton>
          )}
          {error && !downloading && (
            <PrimaryButton onClick={startDownload} style={{ minWidth: 200, justifyContent: "center" }}>
              Retry download
            </PrimaryButton>
          )}
          {!error && (
            <PrimaryButton
              onClick={done ? onComplete : startDownload}
              disabled={downloading && !done}
              style={{ minWidth: 200, justifyContent: "center" }}
            >
              {done ? "Open Wildlife ID"
                : downloading ? `Downloading… ${Math.round(progressPct * 100)}%`
                : "Download and continue"}
              {!downloading && !done && (
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M2 7h10M8 3l4 4-4 4" stroke="currentColor" strokeWidth="1.5"
                    strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </PrimaryButton>
          )}
        </div>
      </div>
    </div>
  );
}

interface StatItem { label: string; value: string; sub: string; }
interface ModelCardProps {
  id: string; name: string; subtitle: string; stats: StatItem[];
  selected: boolean; recommended?: boolean; disabled: boolean;
  onSelect: () => void; downloading: boolean; progressPct: number;
  progress: ModelDownloadProgress | null; done: boolean; totalBytes: number;
}

function ModelCard({
  id, name, subtitle, stats, selected, recommended, onSelect, disabled,
  downloading, progressPct, progress, done, totalBytes,
}: ModelCardProps) {
  const dim = disabled && !selected;
  return (
    <div
      role="button"
      onClick={disabled ? undefined : onSelect}
      style={{
        position: "relative", background: "var(--bg-card)",
        borderRadius: 14, padding: "26px 26px 24px",
        cursor: disabled ? "default" : "pointer",
        border: selected ? "1.5px solid var(--accent)" : "0.5px solid var(--hair-2)",
        boxShadow: selected
          ? "0 0 0 4px rgba(106,133,102,0.12), 0 10px 28px -14px rgba(30,60,30,0.25)"
          : "0 1px 0 rgba(255,255,255,0.8) inset, 0 2px 6px -2px rgba(20,30,20,0.08)",
        transition: "all 200ms ease",
        opacity: dim ? 0.5 : 1,
        filter: dim ? "saturate(0.6)" : "none",
        minHeight: 300,
        display: "flex", flexDirection: "column",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 16 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
            <h3 style={{
              fontFamily: "Fraunces, serif", fontWeight: 500, fontSize: 24,
              letterSpacing: "-0.01em", color: "var(--ink)", margin: 0,
            }}>{name}</h3>
            {recommended && (
              <span style={{
                fontSize: 10.5, fontWeight: 600, letterSpacing: "0.08em",
                textTransform: "uppercase" as const, color: "var(--accent-deep)",
                background: "var(--accent-softer)",
                border: "0.5px solid rgba(106,133,102,0.3)",
                padding: "3px 8px", borderRadius: 999,
              }}>Recommended</span>
            )}
          </div>
          <div style={{ fontSize: 13.5, color: "var(--ink-3)" }}>{subtitle}</div>
        </div>
        <SelectionMark selected={selected} />
      </div>

      <div style={{
        display: "grid", gridTemplateColumns: "repeat(3, 1fr)",
        borderTop: "0.5px solid var(--hair)", borderBottom: "0.5px solid var(--hair)",
        padding: "14px 0", margin: "6px 0 18px",
      }}>
        {stats.map((s, i) => (
          <div key={i} style={{
            paddingLeft: i === 0 ? 0 : 14, paddingRight: i === 2 ? 0 : 14,
            borderRight: i < 2 ? "0.5px solid var(--hair)" : "none",
          }}>
            <div style={{
              fontSize: 10, fontWeight: 600, letterSpacing: "0.1em",
              textTransform: "uppercase" as const, color: "var(--ink-4)", marginBottom: 5,
            }}>{s.label}</div>
            <div style={{
              fontFamily: "Fraunces, serif", fontWeight: 500, fontSize: 16,
              color: "var(--ink)", letterSpacing: "-0.005em", lineHeight: 1.2,
            }}>{s.value}</div>
            {s.sub && <div style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 2 }}>{s.sub}</div>}
          </div>
        ))}
      </div>

      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
        {downloading ? (
          <DownloadStatus progressPct={progressPct} progress={progress} done={done} totalBytes={totalBytes} />
        ) : (
          <p style={{ fontSize: 12.5, lineHeight: 1.55, color: "var(--ink-3)", margin: 0 }}>
            {id === "fast"
              ? "A compact, distilled model tuned for everyday use. Handles common birds, mammals, reptiles, and insects with high confidence."
              : "A larger model with finer-grained recognition. Better at subspecies, juveniles, and uncommon visitors. Needs more memory."}
          </p>
        )}
      </div>
    </div>
  );
}

function SelectionMark({ selected }: { selected: boolean }) {
  return (
    <div style={{
      width: 22, height: 22, borderRadius: "50%",
      border: selected ? "0px" : "1.5px solid var(--ink-4)",
      background: selected ? "var(--accent)" : "transparent",
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      flexShrink: 0, transition: "all 180ms ease",
    }}>
      {selected && (
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M3 6.2l2 2 4-4.4" stroke="#fff" strokeWidth="1.8"
            strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </div>
  );
}

function DownloadStatus({
  progressPct, progress, done, totalBytes,
}: { progressPct: number; progress: ModelDownloadProgress | null; done: boolean; totalBytes: number }) {
  const pct = Math.round(progressPct * 100);
  const downloadedBytes = progress?.bytes_downloaded ?? 0;
  const actualTotal = progress && progress.bytes_total > 0 ? progress.bytes_total : totalBytes;
  const downloadedDisplay = fmtModelSize(downloadedBytes);
  const totalDisplay = actualTotal > 0 ? fmtModelSize(actualTotal) : "—";

  return (
    <div>
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8,
      }}>
        <div style={{
          fontSize: 12.5, color: done ? "var(--accent-deep)" : "var(--ink-2)",
          fontWeight: 500, display: "inline-flex", alignItems: "center", gap: 8,
        }}>
          {!done && <Spinner />}
          {done ? "Download complete"
            : progress?.status === "verifying" ? "Verifying model…"
            : "Downloading model…"}
        </div>
        <div style={{
          fontFamily: "JetBrains Mono, monospace", fontSize: 11.5,
          color: "var(--ink-3)",
        }}>
          {downloadedDisplay} / {totalDisplay}
        </div>
      </div>
      <div style={{
        height: 6, borderRadius: 999, background: "var(--accent-softer)",
        overflow: "hidden", position: "relative",
      }}>
        <div style={{
          width: `${pct}%`, height: "100%",
          background: done ? "var(--accent)" : "linear-gradient(90deg, var(--accent-deep), var(--accent))",
          borderRadius: 999, transition: "width 120ms linear",
          position: "relative", overflow: "hidden",
        }}>
          {!done && (
            <div style={{
              position: "absolute", inset: 0,
              background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent)",
              animation: "shimmer 1.4s linear infinite",
            }} />
          )}
        </div>
      </div>
      <div style={{
        display: "flex", justifyContent: "space-between", marginTop: 8,
        fontSize: 11, color: "var(--ink-4)",
      }}>
        <span>{pct}%</span>
        <span>{done ? "Ready to use" : estimateRemaining(progressPct)}</span>
      </div>
    </div>
  );
}

function estimateRemaining(p: number): string {
  if (p < 0.02) return "Starting…";
  if (p >= 1) return "";
  const secs = Math.max(1, Math.round((1 - p) * 12));
  return `About ${secs} sec remaining`;
}
