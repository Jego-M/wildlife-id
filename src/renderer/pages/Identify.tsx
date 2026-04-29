import { useState, useRef, useEffect, useCallback } from "react";
import { PhotoBitmap, Spinner } from "../components/ui";
import { getSetting } from "../lib/settings";
import { useSpeciesInfo } from "../lib/useSpeciesInfo";
import type { Prediction, ModelId } from "../../shared/types";

interface SamplePhoto {
  id: string; name: string; species: string; latin: string;
  confidence: number; palette: string[];
  url: string;
  thumbnail: string;
  attribution: { name: string; url: string };
}

const SAMPLE_PHOTOS: SamplePhoto[] = [
  { id: "fox",  name: "red-fox.png",    species: "Red Fox",          latin: "Vulpes vulpes",      confidence: 0.99, palette: ["#7e5a36","#b88a52","#3b2c1c","#d4b48a"], url: "samples/red-fox.png", thumbnail: "samples/red-fox-thumb.png", attribution: { name: "Zdeněk Macháček", url: "https://unsplash.com/@zmachacek" } },
  { id: "owl",  name: "great-horned-owl.png",  species: "Great Horned Owl", latin: "Bubo virginianus",   confidence: 0.99, palette: ["#5a4a36","#a08866","#2b231a","#c9b48f"], url: "samples/great-horned-owl.png", thumbnail: "samples/great-horned-owl-thumb.png", attribution: { name: "Ryk Naves", url: "https://unsplash.com/@ryk" } },
  { id: "ladybird", name: "seven-spotted-ladybird-beetle.png", species: "Seven-spotted Ladybird Beetle",latin: "Coccinella septempunctata", confidence: 0.99, palette: ["#4d6a3a","#8aa66a","#2d3e22","#cfd9b3"], url: "samples/seven-spotted-ladybird-beetle.png", thumbnail: "samples/seven-spotted-ladybird-beetle-thumb.png", attribution: { name: "Anton Atanasov", url: "https://unsplash.com/@blooddrainer" } },
];

interface Crop { x: number; y: number; w: number; h: number; }
type Stage = "empty" | "crop" | "identifying" | "result";

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

export default function Identify() {
  const [stage, setStage] = useState<Stage>("empty");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<{ name: string; size: number } | null>(null);
  const [imageDims, setImageDims] = useState<{ w: number; h: number } | null>(null);
  const [crop, setCrop] = useState<Crop>({ x: 10, y: 10, w: 80, h: 80 });
  const [predictions, setPredictions] = useState<Prediction[] | null>(null);
  const [modelUsed, setModelUsed] = useState<ModelId | null>(null);
  const [croppedImageUrl, setCroppedImageUrl] = useState<string | null>(null);
  const [croppedBytes, setCroppedBytes] = useState<Uint8Array | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cancelledRef = useRef(false);

  // Play sound when identification completes
  useEffect(() => {
    if (stage !== "result" || !getSetting("sound", false)) return;
    const id = getSetting("soundId", "identify-complete-2");
    const vol = Number(getSetting("soundVolume", "1"));
    const audio = new Audio(`sounds/${id}.mp3`);
    audio.volume = vol;
    audio.play().catch(() => { /* autoplay blocked, ignore */ });
  }, [stage]);

  // Clean up object URL on unmount
  useEffect(() => {
    return () => {
      if (imageUrl) URL.revokeObjectURL(imageUrl);
    };
  }, [imageUrl]);

  const onPickFile = (file: File) => {
    if (!file.type.startsWith("image/")) return;
    if (imageUrl) URL.revokeObjectURL(imageUrl);

    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      setImageUrl(url);
      setImageFile({ name: file.name, size: file.size });
      setImageDims({ w: img.naturalWidth, h: img.naturalHeight });
      setPredictions(null);
      setModelUsed(null);
      setError(null);

      // Default square crop centered on image
      const side = Math.min(img.naturalWidth, img.naturalHeight);
      const cx = img.naturalWidth / 2;
      const cy = img.naturalHeight / 2;
      const halfPct = (side / 2) / img.naturalWidth * 100 * 0.8;
      const halfPctY = (side / 2) / img.naturalHeight * 100 * 0.8;
      const cropW = halfPct * 2;
      const cropH = halfPctY * 2;
      setCrop({
        x: clamp(50 - halfPct, 0, 100 - cropW),
        y: clamp(50 - halfPctY, 0, 100 - cropH),
        w: cropW,
        h: cropH,
      });
      setStage("crop");
    };
    img.src = url;
  };

  const loadSample = useCallback(async (sample: SamplePhoto) => {
    const resp = await fetch(sample.url);
    const blob = await resp.blob();
    const file = new File([blob], sample.name, { type: blob.type });
    onPickFile(file);
  }, []);

  const runIdentify = useCallback(async () => {
    if (!imageUrl || !imageDims) return;
    cancelledRef.current = false;
    setStage("identifying");
    setError(null);

    try {
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("Failed to load image"));
        img.src = imageUrl;
      });

      const sx = Math.round(crop.x / 100 * img.naturalWidth);
      const sy = Math.round(crop.y / 100 * img.naturalHeight);
      const sw = Math.round(crop.w / 100 * img.naturalWidth);
      const sh = Math.round(crop.h / 100 * img.naturalHeight);

      // BioCLIP expects square input; cap at 1024px
      const side = Math.max(sw, sh);
      const outSize = Math.min(side, 1024);
      const canvas = document.createElement("canvas");
      canvas.width = outSize;
      canvas.height = outSize;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, outSize, outSize);

      const blob: Blob = await new Promise(r => canvas.toBlob(b => r(b!), "image/jpeg", 0.92));
      const bytes = new Uint8Array(await blob.arrayBuffer());

      if (cancelledRef.current) return;

      if (croppedImageUrl) URL.revokeObjectURL(croppedImageUrl);
      setCroppedBytes(bytes);
      setCroppedImageUrl(URL.createObjectURL(blob));

      const response = await window.api.identify.predict(bytes);
      if (cancelledRef.current) return;

      setPredictions(response.predictions);
      setModelUsed(response.model_used);
      setStage("result");
    } catch (err) {
      if (cancelledRef.current) return;
      setError(err instanceof Error ? err.message : "Identification failed");
      setStage("result");
    }
  }, [imageUrl, imageDims, crop, croppedImageUrl]);

  const reset = () => {
    cancelledRef.current = true;
    if (imageUrl) URL.revokeObjectURL(imageUrl);
    if (croppedImageUrl) URL.revokeObjectURL(croppedImageUrl);
    setImageUrl(null);
    setImageFile(null);
    setImageDims(null);
    setPredictions(null);
    setModelUsed(null);
    setCroppedImageUrl(null);
    setCroppedBytes(null);
    setError(null);
    setStage("empty");
  };

  const resultTitle = predictions?.[0]?.common_name ?? predictions?.[0]?.display_label ?? predictions?.[0]?.scientific_name ?? "Unknown";

  const handleSave = useCallback(async () => {
    if (!predictions?.[0] || !modelUsed || !croppedBytes) return;
    await window.api.sightings.create({
      scientific_name: predictions[0].scientific_name,
      common_name: predictions[0].common_name ?? predictions[0].display_label,
      confidence: predictions[0].confidence,
      image_bytes: croppedBytes,
      model_used: modelUsed,
      taxonomy_kingdom: predictions[0].taxonomy[0] ?? null,
      taxonomy_phylum: predictions[0].taxonomy[1] ?? null,
      taxonomy_class: predictions[0].taxonomy[2] ?? predictions[0].animal_class ?? null,
      taxonomy_order: predictions[0].taxonomy[3] ?? null,
      taxonomy_family: predictions[0].taxonomy[4] ?? null,
      taxonomy_genus: predictions[0].taxonomy[5] ?? null,
      iucn_status: predictions[0].iucn_status ?? null,
    });
    window.dispatchEvent(new CustomEvent("sighting-saved"));
  }, [predictions, modelUsed, croppedBytes]);

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", minHeight: 0 }}>
      <IdentifyHeader stage={stage} resultTitle={resultTitle} predictions={predictions} onReset={reset} />
      <div style={{ flex: 1, position: "relative", minHeight: 0 }}>
        {stage === "empty" && (
          <DropZone onFile={onPickFile} onLoadSample={loadSample} />
        )}
        {stage === "crop" && imageUrl && imageDims && (
          <CropStage imageUrl={imageUrl} imageFile={imageFile!} imageDims={imageDims}
            crop={crop} setCrop={setCrop}
            onCancel={reset} onIdentify={runIdentify} />
        )}
        {(stage === "identifying" || stage === "result") && (
          <IdentifyStage
            imageUrl={croppedImageUrl ?? imageUrl ?? ""}
            imageName={imageFile?.name ?? ""}
            predictions={predictions} modelUsed={modelUsed}
            error={error} done={stage === "result"} onAnother={reset}
            onSave={handleSave} />
        )}
      </div>
    </div>
  );
}

function IdentifyHeader({ stage, resultTitle, predictions, onReset }: { stage: Stage; resultTitle: string; predictions: Prediction[] | null; onReset: () => void }) {
  const labels: Record<Stage, { eyebrow: string; title: string }> = {
    empty:       { eyebrow: "Identify",    title: "New identification" },
    crop:        { eyebrow: "Step 1 of 2", title: "Adjust the crop" },
    identifying: { eyebrow: "Step 2 of 2", title: "Identifying…" },
    result:      { eyebrow: "Result",      title: resultTitle },
  };
  const l = labels[stage];
  return (
    <div style={{
      padding: "22px 32px 18px", borderBottom: "0.5px solid var(--hair)",
      display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexShrink: 0,
    }}>
      <div>
        <div style={{
          fontSize: 11, fontWeight: 600, letterSpacing: "0.14em",
          textTransform: "uppercase" as const, color: "var(--accent-deep)", marginBottom: 6,
        }}>{l.eyebrow}</div>
        <h1 style={{
          fontFamily: "Fraunces, serif", fontWeight: 500, fontSize: 26,
          letterSpacing: "-0.015em", color: "var(--ink)", margin: 0,
        }}>
          {stage === "result" && predictions?.[0] ? (
            <>
              {l.title}
              <span style={{
                fontStyle: "italic", fontWeight: 400, color: "var(--ink-3)",
                fontSize: 18, marginLeft: 10,
              }}>{predictions[0].scientific_name}</span>
            </>
          ) : l.title}
        </h1>
      </div>
      {stage !== "empty" && (
        <button onClick={onReset} style={{
          appearance: "none", border: "0.5px solid var(--hair-2)", background: "#fff",
          color: "var(--ink-2)", fontFamily: "inherit", fontSize: 12.5,
          padding: "7px 12px", borderRadius: 7, cursor: "pointer",
          display: "inline-flex", alignItems: "center", gap: 6,
        }}>
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
            <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
          Discard
        </button>
      )}
    </div>
  );
}

function DropZone({ onFile, onLoadSample }: { onFile: (f: File) => void; onLoadSample: (s: SamplePhoto) => void }) {
  const [over, setOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) onFile(f);
  };

  return (
    <div style={{
      height: "100%", padding: "28px 32px 32px",
      display: "flex", flexDirection: "column", gap: 24,
    }}>
      <div
        onDragEnter={e => { e.preventDefault(); setOver(true); }}
        onDragOver={e => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        style={{
          flex: 1, position: "relative", borderRadius: 14,
          background: over ? "var(--accent-softer)" : "#fbfaf6",
          border: `1.5px dashed ${over ? "var(--accent)" : "var(--hair-2)"}`,
          transition: "all 180ms ease", cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
          minHeight: 280,
        }}
      >
        <input ref={inputRef} type="file" accept="image/*" style={{ display: "none" }}
          onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); }} />
        <div style={{ textAlign: "center", maxWidth: 420 }}>
          <DropIllustration over={over} />
          <div style={{
            fontFamily: "Fraunces, serif", fontWeight: 500, fontSize: 22,
            letterSpacing: "-0.01em", color: "var(--ink)", marginTop: 18, marginBottom: 6,
          }}>
            {over ? "Drop to begin" : "Drag a photo here"}
          </div>
          <div style={{ fontSize: 13.5, color: "var(--ink-3)", marginBottom: 18 }}>
            {over ? "Release to load this image" : "or click anywhere in this area to browse"}
          </div>
          <div style={{ display: "flex", justifyContent: "center", gap: 10, alignItems: "center" }}>
            <button onClick={e => { e.stopPropagation(); inputRef.current?.click(); }} style={{
              appearance: "none", border: 0, cursor: "pointer",
              background: "var(--accent)", color: "#fff",
              fontFamily: "inherit", fontSize: 13.5, fontWeight: 500,
              padding: "10px 18px", borderRadius: 9,
              boxShadow: "0 1px 0 rgba(255,255,255,0.2) inset, 0 4px 10px -4px rgba(80,110,80,0.5)",
            }}>Choose file…</button>
            <span style={{ fontSize: 12, color: "var(--ink-4)" }}>JPG, PNG, HEIC up to 30 MB</span>
          </div>
        </div>
      </div>

      <div>
        <div style={{
          fontSize: 11, fontWeight: 600, letterSpacing: "0.12em",
          textTransform: "uppercase" as const, color: "var(--ink-3)", marginBottom: 10,
        }}>Or try a sample</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
          {SAMPLE_PHOTOS.map(p => (
            <div key={p.id} onClick={() => onLoadSample(p)} style={{
              border: "0.5px solid var(--hair)", background: "#fff",
              borderRadius: 10, position: "relative",
              display: "flex", alignItems: "center", gap: 12,
              paddingRight: 14, cursor: "pointer",
            }}>
              <div style={{ position: "relative", flexShrink: 0, width: 56, height: 56 }}>
                <img src={p.thumbnail} alt={p.species} style={{ width: 56, height: 56, objectFit: "cover", display: "block", borderRadius: "9px 0 0 9px" }} />
                <AttributionBadge name={p.attribution.name} url={p.attribution.url} />
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{
                  fontFamily: "Fraunces, serif", fontWeight: 500, fontSize: 14.5,
                  color: "var(--ink)", marginBottom: 2,
                }}>{p.species}</div>
                <div style={{
                  fontSize: 11, color: "var(--ink-3)",
                  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                }}>{p.name}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function AttributionBadge({ name, url }: { name: string; url: string }) {
  const [hovered, setHovered] = useState(false);
  return (
    <>
      <button
        onClick={e => { e.stopPropagation(); window.api.app.openExternal(url); }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          position: "absolute", bottom: 3, right: 3,
          width: 15, height: 15, borderRadius: "50%",
          background: "rgba(0,0,0,0.52)", border: "none",
          color: "#fff", fontSize: 8, fontWeight: 700,
          display: "flex", alignItems: "center", justifyContent: "center",
          cursor: "pointer", padding: 0, lineHeight: 1,
        }}
      >©</button>
      {hovered && (
        <div style={{
          position: "absolute", bottom: 20, right: 0,
          background: "rgba(15,20,15,0.88)", color: "#fff",
          fontSize: 10.5, padding: "4px 8px", borderRadius: 5,
          whiteSpace: "nowrap", zIndex: 10, pointerEvents: "none",
        }}>
          Photo by {name}
        </div>
      )}
    </>
  );
}

function DropIllustration({ over }: { over: boolean }) {
  return (
    <div style={{
      width: 64, height: 64, margin: "0 auto", borderRadius: 16,
      background: over ? "var(--accent)" : "var(--accent-softer)",
      color: over ? "#fff" : "var(--accent-deep)",
      display: "flex", alignItems: "center", justifyContent: "center",
      transition: "all 180ms ease",
      transform: over ? "translateY(-2px) scale(1.05)" : "none",
      boxShadow: over ? "0 14px 28px -10px rgba(80,110,80,0.45)" : "0 0 0 0.5px rgba(106,133,102,0.2)",
    }}>
      <svg width="30" height="30" viewBox="0 0 30 30" fill="none">
        <rect x="5" y="6" width="20" height="16" rx="2.5" stroke="currentColor" strokeWidth="1.6" />
        <circle cx="11.5" cy="12" r="1.6" fill="currentColor" />
        <path d="M5 19l5-5 5 5 4-4 6 6" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" fill="none" />
        <path d="M15 24v4M13 26l2 2 2-2" stroke="currentColor" strokeWidth="1.6"
          strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </svg>
    </div>
  );
}

interface DragState { mode: string; startX: number; startY: number; rect: DOMRect; init: Crop; }

function CropStage({ imageUrl, imageFile, imageDims, crop, setCrop, onCancel, onIdentify }: {
  imageUrl: string; imageFile: { name: string; size: number }; imageDims: { w: number; h: number };
  crop: Crop; setCrop: (c: Crop) => void;
  onCancel: () => void; onIdentify: () => void;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const drag = useRef<DragState | null>(null);

  // Lock crop to square: when adjusting width, match height proportionally
  const applySquareConstraint = (c: Crop): Crop => {
    // Convert percentage-space crop to pixel-space, enforce square, convert back
    const pxW = c.w / 100 * imageDims.w;
    const pxH = c.h / 100 * imageDims.h;
    const side = Math.min(pxW, pxH);
    const newWPct = side / imageDims.w * 100;
    const newHPct = side / imageDims.h * 100;
    // Re-center if needed
    return {
      x: c.x + (c.w - newWPct) / 2,
      y: c.y + (c.h - newHPct) / 2,
      w: newWPct,
      h: newHPct,
    };
  };

  const onMouseDown = (mode: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!stageRef.current) return;
    const rect = stageRef.current.getBoundingClientRect();
    drag.current = { mode, startX: e.clientX, startY: e.clientY, rect, init: { ...crop } };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  const onMouseMove = (e: MouseEvent) => {
    if (!drag.current) return;
    const { mode, startX, startY, rect, init } = drag.current;
    const dx = ((e.clientX - startX) / rect.width) * 100;
    const dy = ((e.clientY - startY) / rect.height) * 100;
    const minS = 10;
    let { x, y, w, h } = init;

    if (mode === "move") {
      x = clamp(x + dx, 0, 100 - w);
      y = clamp(y + dy, 0, 100 - h);
    } else {
      // Square constraint: h_pct = w_pct * (imgW / imgH) for same pixel side
      const imageAspect = imageDims.w / imageDims.h;

      if (mode === "se" || mode === "e" || mode === "s") {
        const maxW = 100 - init.x;
        const maxWByH = (100 - init.y) / imageAspect;
        w = clamp(init.w + dx, minS, Math.min(maxW, maxWByH));
        h = w * imageAspect;
      }
      if (mode === "sw" || mode === "w") {
        const maxW = init.x + init.w;
        const maxWByH = (100 - init.y) / imageAspect;
        w = clamp(init.w - dx, minS, Math.min(maxW, maxWByH));
        h = w * imageAspect;
        x = init.x + init.w - w;
      }
      if (mode === "ne") {
        const maxW = 100 - init.x;
        const maxWByH = (init.y + init.h) / imageAspect;
        w = clamp(init.w + dx, minS, Math.min(maxW, maxWByH));
        h = w * imageAspect;
        y = init.y + init.h - h;
      }
      if (mode === "nw" || mode === "n") {
        const maxW = init.x + init.w;
        const maxWByH = (init.y + init.h) / imageAspect;
        w = clamp(init.w - dx, minS, Math.min(maxW, maxWByH));
        h = w * imageAspect;
        x = init.x + init.w - w;
        y = init.y + init.h - h;
      }
    }
    setCrop({ x, y, w, h });
  };

  const onMouseUp = () => {
    drag.current = null;
    window.removeEventListener("mousemove", onMouseMove);
    window.removeEventListener("mouseup", onMouseUp);
  };

  const cropPxW = imageDims ? Math.round(crop.w / 100 * imageDims.w) : 0;
  const cropPxH = imageDims ? Math.round(crop.h / 100 * imageDims.h) : 0;

  return (
    <div style={{ height: "100%", display: "grid", gridTemplateColumns: "1fr 280px", minHeight: 0 }}>
      <div style={{
        padding: "24px 8px 24px 32px", minHeight: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <div ref={stageRef} style={{
          position: "relative", maxHeight: "100%", width: "100%",
          maxWidth: 720, borderRadius: 12, overflow: "hidden",
          boxShadow: "0 10px 24px -10px rgba(20,30,20,0.25), 0 0 0 0.5px rgba(0,0,0,0.1)",
        }}>
          <img src={imageUrl} alt="" draggable={false} style={{
            display: "block", width: "100%", height: "auto",
          }} />
          <div style={{
            position: "absolute", inset: 0, background: "rgba(15,20,15,0.55)",
            clipPath: `polygon(0 0,100% 0,100% 100%,0 100%,0 0,${crop.x}% ${crop.y}%,${crop.x}% ${crop.y+crop.h}%,${crop.x+crop.w}% ${crop.y+crop.h}%,${crop.x+crop.w}% ${crop.y}%,${crop.x}% ${crop.y}%)`,
          }} />
          <div onMouseDown={onMouseDown("move")} style={{
            position: "absolute",
            left: `${crop.x}%`, top: `${crop.y}%`, width: `${crop.w}%`, height: `${crop.h}%`,
            boxShadow: "0 0 0 1.5px #fff, 0 0 0 2.5px rgba(0,0,0,0.25)", cursor: "move",
          }}>
            <svg width="100%" height="100%" style={{ position: "absolute", inset: 0, pointerEvents: "none", opacity: 0.5 }}>
              <line x1="33.33%" y1="0" x2="33.33%" y2="100%" stroke="#fff" strokeWidth="0.5" />
              <line x1="66.66%" y1="0" x2="66.66%" y2="100%" stroke="#fff" strokeWidth="0.5" />
              <line x1="0" y1="33.33%" x2="100%" y2="33.33%" stroke="#fff" strokeWidth="0.5" />
              <line x1="0" y1="66.66%" x2="100%" y2="66.66%" stroke="#fff" strokeWidth="0.5" />
            </svg>
            {(["nw","ne","se","sw"]).map(m => (
              <Handle key={m} mode={m} onMouseDown={onMouseDown(m)} />
            ))}
            <div style={{
              position: "absolute", left: "50%", bottom: -26, transform: "translateX(-50%)",
              fontFamily: "JetBrains Mono, monospace", fontSize: 10.5,
              color: "#fff", background: "rgba(0,0,0,0.7)",
              padding: "2px 7px", borderRadius: 4, whiteSpace: "nowrap", pointerEvents: "none",
            }}>
              {cropPxW} × {cropPxH} px
            </div>
          </div>
        </div>
      </div>

      <div style={{ borderLeft: "0.5px solid var(--hair)", padding: "24px 28px", display: "flex", flexDirection: "column" }}>
        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase" as const, color: "var(--ink-3)", marginBottom: 12 }}>Photo</div>
        <div style={{ fontSize: 13, color: "var(--ink-2)", marginBottom: 4, fontFamily: "JetBrains Mono, monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{imageFile.name}</div>
        <div style={{ fontSize: 11.5, color: "var(--ink-4)", marginBottom: 24 }}>
          {imageDims.w} × {imageDims.h} · {formatFileSize(imageFile.size)}
        </div>

        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase" as const, color: "var(--ink-3)", marginBottom: 10 }}>Crop</div>
        <div style={{
          fontSize: 12.5, color: "var(--ink-2)", marginBottom: 22,
          display: "flex", alignItems: "center", gap: 8,
        }}>
          <div style={{
            width: 28, height: 28, borderRadius: 6, border: "1.5px solid var(--accent)",
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            background: "var(--accent-softer)", flexShrink: 0,
          }}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <rect x="1" y="1" width="10" height="10" rx="0.5" stroke="var(--accent-deep)" strokeWidth="1.2" />
            </svg>
          </div>
          <span>Square (locked) — required by the model</span>
        </div>

        <div style={{
          fontSize: 12, lineHeight: 1.55, color: "var(--ink-3)",
          padding: "12px 14px", background: "var(--accent-softer)",
          borderRadius: 8, border: "0.5px solid rgba(106,133,102,0.18)", marginBottom: 24,
        }}>
          <strong style={{ fontWeight: 600, color: "var(--accent-deep)" }}>Tip:</strong>{" "}
          Tighten the crop around the animal's head and body for better accuracy.
        </div>

        <div style={{ flex: 1 }} />
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onCancel} style={{
            flex: "0 0 auto", appearance: "none", border: "0.5px solid var(--hair-2)",
            background: "transparent", color: "var(--ink-2)", fontFamily: "inherit",
            fontSize: 13, fontWeight: 500, padding: "0 16px", height: 40,
            borderRadius: 9, cursor: "pointer",
          }}>Cancel</button>
          <button onClick={onIdentify} style={{
            flex: 1, appearance: "none", border: 0,
            background: "var(--accent)", color: "#fff",
            fontFamily: "inherit", fontSize: 13.5, fontWeight: 500,
            padding: "0 16px", height: 40, borderRadius: 9, cursor: "pointer",
            display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
            boxShadow: "0 1px 0 rgba(255,255,255,0.2) inset, 0 4px 10px -4px rgba(80,110,80,0.5)",
          }}>
            Identify
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
              <path d="M2 7h10M8 3l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

const HANDLE_POS: Record<string, React.CSSProperties> = {
  nw: { left: -4, top: -4, cursor: "nwse-resize" },
  ne: { right: -4, top: -4, cursor: "nesw-resize" },
  se: { right: -4, bottom: -4, cursor: "nwse-resize" },
  sw: { left: -4, bottom: -4, cursor: "nesw-resize" },
};

function Handle({ mode, onMouseDown }: { mode: string; onMouseDown: (e: React.MouseEvent) => void }) {
  return (
    <div onMouseDown={onMouseDown} style={{
      position: "absolute", width: 10, height: 10, background: "#fff",
      boxShadow: "0 0 0 1px rgba(0,0,0,0.3)", borderRadius: 1, ...HANDLE_POS[mode],
    }} />
  );
}

function IdentifyStage({ imageUrl, imageName, predictions, modelUsed, error, done, onAnother, onSave }: {
  imageUrl: string; imageName: string;
  predictions: Prediction[] | null; modelUsed: ModelId | null;
  error: string | null; done: boolean; onAnother: () => void;
  onSave: () => Promise<void>;
}) {
  return (
    <div style={{ height: "100%", display: "grid", gridTemplateColumns: "1fr 1fr", minHeight: 0 }}>
      <div style={{ position: "relative", overflow: "hidden", background: "#1a1d1a", borderRight: "0.5px solid var(--hair)" }}>
        <CroppedPhoto imageUrl={imageUrl} done={done} imageName={imageName} />
      </div>
      <div style={{ padding: "40px 40px 32px", display: "flex", flexDirection: "column", minHeight: 0, overflow: "auto" }}>
        {!done ? (
          <IdentifyingPanel />
        ) : error ? (
          <ErrorPanel error={error} onAnother={onAnother} />
        ) : (
          <ResultPanel predictions={predictions!} modelUsed={modelUsed!} onAnother={onAnother} onSave={onSave} />
        )}
      </div>
    </div>
  );
}

function CroppedPhoto({ imageUrl, done, imageName }: { imageUrl: string; done: boolean; imageName: string }) {
  return (
    <>
      <img src={imageUrl} alt="" draggable={false} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain" }} />
      {!done && (
        <div style={{ position: "absolute", inset: 0 }}>
          <ScanLine />
        </div>
      )}
      <div style={{
        position: "absolute", left: 16, top: 14,
        fontFamily: "JetBrains Mono, monospace", fontSize: 10.5,
        color: "rgba(255,255,255,0.85)", letterSpacing: "0.04em",
        display: "inline-flex", alignItems: "center", gap: 8,
      }}>
        <span style={{
          width: 6, height: 6, borderRadius: "50%",
          background: done ? "#7eda6e" : "#e8d66a",
          boxShadow: done ? "0 0 6px #7eda6e" : "0 0 6px #e8d66a",
        }} />
        {imageName}
      </div>
    </>
  );
}

function ScanLine() {
  return (
    <div style={{
      position: "absolute", left: 0, right: 0, height: 36,
      background: "linear-gradient(180deg, transparent, rgba(180,220,170,0.55), transparent)",
      borderTop: "1px solid rgba(180,220,170,0.9)",
      animation: "scan 1.6s ease-in-out infinite",
      mixBlendMode: "screen" as const, pointerEvents: "none",
    }} />
  );
}

function IdentifyingPanel() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, height: "100%" }}>
      <div>
        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.14em", textTransform: "uppercase" as const, color: "var(--accent-deep)", marginBottom: 10 }}>Working on‑device</div>
        <div style={{ fontFamily: "Fraunces, serif", fontSize: 28, fontWeight: 500, letterSpacing: "-0.015em", color: "var(--ink)", marginBottom: 6, lineHeight: 1.15 }}>Identifying your photo</div>
        <div style={{ fontSize: 13.5, color: "var(--ink-3)", lineHeight: 1.55 }}>
          The model is comparing the cropped region against the species index.
          This takes a few seconds.
        </div>
      </div>
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <div style={{ fontSize: 13, color: "var(--ink-2)", fontWeight: 500, display: "inline-flex", alignItems: "center", gap: 8 }}>
            <Spinner />Identifying…
          </div>
        </div>
        <div style={{ height: 6, borderRadius: 999, background: "var(--accent-softer)", overflow: "hidden", position: "relative" }}>
          <div style={{
            position: "absolute", top: 0, left: 0, width: "40%", height: "100%",
            background: "linear-gradient(90deg, var(--accent-deep), var(--accent))",
            borderRadius: 999,
            animation: "indeterminate 1.4s ease-in-out infinite",
          }} />
        </div>
      </div>
      <div style={{ flex: 1 }} />
      <div style={{ fontSize: 11.5, color: "var(--ink-4)", display: "flex", alignItems: "center", gap: 6 }}>
        <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
          <rect x="2" y="5" width="8" height="6" rx="1" stroke="currentColor" strokeWidth="1" />
          <path d="M4 5V3.5a2 2 0 0 1 4 0V5" stroke="currentColor" strokeWidth="1" />
        </svg>
        Nothing leaves your computer.
      </div>
    </div>
  );
}

const TAXON_RANKS = ["Kingdom", "Phylum", "Class", "Order", "Family", "Genus", "Species"];

function ResultPanel({ predictions, modelUsed, onAnother, onSave }: {
  predictions: Prediction[]; modelUsed: ModelId; onAnother: () => void;
  onSave: () => Promise<void>;
}) {
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const top = predictions[0];
  const alts = predictions.slice(1);
  const { info: wikiInfo, loading: wikiLoading } = useSpeciesInfo(top.scientific_name);

  const taxonChips: { rank: string; name: string }[] = top.taxonomy.map((name, i) => ({
    rank: TAXON_RANKS[i] ?? `Level ${i + 1}`,
    name,
  }));
  if (top.iucn_status) taxonChips.push({ rank: "Status", name: top.iucn_status });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22, height: "100%" }}>
      <div>
        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.14em", textTransform: "uppercase" as const, color: "var(--accent-deep)", marginBottom: 8, display: "inline-flex", alignItems: "center", gap: 8 }}>
          <svg width="12" height="12" viewBox="0 0 12 12"><circle cx="6" cy="6" r="5" fill="var(--accent)" /><path d="M3.5 6.2l2 2L9 4.5" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" fill="none" /></svg>
          Identified
        </div>
        <div style={{ fontFamily: "Fraunces, serif", fontSize: 34, fontWeight: 500, letterSpacing: "-0.02em", color: "var(--ink)", lineHeight: 1.1, marginBottom: 4 }}>
          {top.common_name ?? top.display_label ?? top.scientific_name}
        </div>
        <div style={{ fontFamily: "Fraunces, serif", fontStyle: "italic", fontSize: 16, color: "var(--ink-3)" }}>{top.scientific_name}</div>
      </div>

      <div>
        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase" as const, color: "var(--ink-3)", marginBottom: 8 }}>Confidence</div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ flex: 1, height: 8, background: "var(--accent-softer)", borderRadius: 999, overflow: "hidden" }}>
            <div style={{ width: `${Math.round(top.confidence * 100)}%`, height: "100%", background: "var(--accent)", borderRadius: 999 }} />
          </div>
          <div style={{ fontFamily: "Fraunces, serif", fontSize: 22, fontWeight: 500, color: "var(--ink)" }}>{Math.round(top.confidence * 100)}%</div>
        </div>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, padding: "12px 14px", background: "#fbfaf6", borderRadius: 8, border: "0.5px solid var(--hair)" }}>
        {taxonChips.map(({ rank, name }) => (
          <div key={rank} style={{ display: "inline-flex", alignItems: "baseline", gap: 6, padding: "2px 4px" }}>
            <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase" as const, color: "var(--ink-4)" }}>{rank}</span>
            <span style={{ fontSize: 12.5, color: "var(--ink-2)", fontWeight: 450 }}>{name}</span>
          </div>
        ))}
      </div>

      {(wikiLoading || wikiInfo) && (
        <div style={{ padding: "14px 16px", background: "#fbfaf6", borderRadius: 8, border: "0.5px solid var(--hair)" }}>
          {wikiLoading ? (
            <div style={{ fontSize: 13, color: "var(--ink-4)", fontStyle: "italic" }}>Loading description…</div>
          ) : (
            <>
              <div style={{ fontSize: 13, color: "var(--ink-2)", lineHeight: 1.55, marginBottom: wikiInfo?.wikipediaUrl ? 10 : 0 }}>{wikiInfo?.extract}</div>
              {wikiInfo?.wikipediaUrl && (
                <button onClick={() => window.api.app.openExternal(wikiInfo.wikipediaUrl)} style={{ appearance: "none", border: 0, background: "none", color: "var(--accent-deep)", fontFamily: "inherit", fontSize: 12, fontWeight: 500, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4, padding: 0 }}>
                  Read more on Wikipedia
                  <svg width="9" height="9" viewBox="0 0 10 10" fill="none"><path d="M3 1.5h5.5V7M8.5 1.5L3 7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </button>
              )}
            </>
          )}
        </div>
      )}

      {alts.length > 0 && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase" as const, color: "var(--ink-3)", marginBottom: 8 }}>Other possibilities</div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            {alts.map((a, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: i < alts.length - 1 ? "0.5px solid var(--hair)" : "none" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, color: "var(--ink-2)", fontWeight: 450 }}>
                    {a.common_name ?? a.display_label ?? a.scientific_name}{" "}
                    <span style={{ fontFamily: "Fraunces, serif", fontStyle: "italic", fontSize: 12, color: "var(--ink-4)" }}>{a.scientific_name}</span>
                  </div>
                </div>
                <div style={{ width: 80, height: 4, background: "var(--accent-softer)", borderRadius: 999, overflow: "hidden" }}>
                  <div style={{ width: `${Math.max(a.confidence / (top.confidence || 1) * 100, 2)}%`, height: "100%", background: "var(--ink-4)", borderRadius: 999 }} />
                </div>
                <div style={{ width: 42, textAlign: "right", fontSize: 12, color: "var(--ink-3)" }}>{(a.confidence * 100).toFixed(1)}%</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ flex: 1 }} />
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={async () => {
          if (saved || saving) return;
          setSaving(true);
          try { await onSave(); setSaved(true); } finally { setSaving(false); }
        }} disabled={saved || saving} style={{
          flex: 1, appearance: "none", border: 0,
          background: saved ? "var(--accent-deep)" : "var(--accent)",
          color: "#fff", fontFamily: "inherit", fontSize: 13.5, fontWeight: 500,
          padding: "0 16px", height: 42, borderRadius: 9, cursor: saved ? "default" : "pointer",
          display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
          boxShadow: "0 1px 0 rgba(255,255,255,0.2) inset, 0 4px 10px -4px rgba(80,110,80,0.5)",
        }}>
          {saved ? (<><svg width="13" height="13" viewBox="0 0 14 14" fill="none"><path d="M3 7.2l3 3 5-5.4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>Saved to collection</>) : saving ? "Saving…" : (<><svg width="13" height="13" viewBox="0 0 14 14" fill="none"><path d="M3 2h8v10l-4-2.5L3 12V2z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" fill="none" /></svg>Save to collection</>)}
        </button>
        <button onClick={onAnother} style={{
          appearance: "none", border: "0.5px solid var(--hair-2)",
          background: "#fff", color: "var(--ink-2)",
          fontFamily: "inherit", fontSize: 13, fontWeight: 500,
          padding: "0 18px", height: 42, borderRadius: 9, cursor: "pointer",
        }}>Identify another</button>
      </div>
    </div>
  );
}

function ErrorPanel({ error, onAnother }: { error: string; onAnother: () => void }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, height: "100%" }}>
      <div>
        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.14em", textTransform: "uppercase" as const, color: "#c0392b", marginBottom: 8 }}>Error</div>
        <div style={{ fontFamily: "Fraunces, serif", fontSize: 24, fontWeight: 500, color: "var(--ink)", marginBottom: 8 }}>Identification failed</div>
        <div style={{ fontSize: 13.5, color: "var(--ink-3)", lineHeight: 1.55 }}>{error}</div>
      </div>
      <div style={{ flex: 1 }} />
      <button onClick={onAnother} style={{
        appearance: "none", border: "0.5px solid var(--hair-2)",
        background: "#fff", color: "var(--ink-2)",
        fontFamily: "inherit", fontSize: 13, fontWeight: 500,
        padding: "0 18px", height: 42, borderRadius: 9, cursor: "pointer",
      }}>Try again</button>
    </div>
  );
}
