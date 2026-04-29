import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import type { Sighting } from "../../shared/types";
import { useSpeciesInfo } from "../lib/useSpeciesInfo";

const ghostBtn: React.CSSProperties = {
  appearance: "none", border: "0.5px solid var(--hair-2)", background: "#fff",
  color: "var(--ink-2)", fontFamily: "inherit", fontSize: 12.5, fontWeight: 500,
  padding: "7px 12px", borderRadius: 7, cursor: "pointer",
  display: "inline-flex", alignItems: "center", gap: 6,
};
const primaryBtn: React.CSSProperties = {
  appearance: "none", border: 0, background: "var(--accent)", color: "#fff",
  fontFamily: "inherit", fontSize: 12.5, fontWeight: 500,
  padding: "7px 14px", borderRadius: 7, cursor: "pointer",
  display: "inline-flex", alignItems: "center", gap: 6,
  boxShadow: "0 1px 0 rgba(255,255,255,0.2) inset, 0 4px 10px -4px rgba(80,110,80,0.5)",
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return iso;
  }
}

const GROUPS = ["All", "Mammals", "Birds", "Reptiles", "Amphibians", "Insects"] as const;
type Group = (typeof GROUPS)[number];

const CLASS_TO_GROUP: Record<string, Group> = {
  Mammalia: "Mammals",
  Aves: "Birds",
  Reptilia: "Reptiles",
  Amphibia: "Amphibians",
  Insecta: "Insects",
};

export default function Collection() {
  const [sightings, setSightings] = useState<Sighting[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState<Group>("All");
  const [sort, setSort] = useState("recent");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const loadSightings = useCallback(async () => {
    setLoading(true);
    try {
      const data = await window.api.sightings.list();
      setSightings(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadSightings(); }, [loadSightings]);

  useEffect(() => {
    const handler = () => loadSightings();
    window.addEventListener("sighting-saved", handler);
    return () => window.removeEventListener("sighting-saved", handler);
  }, [loadSightings]);

  const filtered = useMemo(() => {
    let r = sightings;
    if (group !== "All") {
      r = r.filter(s => CLASS_TO_GROUP[s.taxonomy_class ?? ""] === group);
    }
    if (query) {
      const q = query.toLowerCase();
      r = r.filter(s =>
        (s.scientific_name + " " + (s.common_name ?? "") + " " + (s.location ?? "")).toLowerCase().includes(q)
      );
    }
    if (sort === "recent") r = [...r].sort((a, b) => b.id - a.id);
    if (sort === "confidence") r = [...r].sort((a, b) => b.confidence - a.confidence);
    if (sort === "species") r = [...r].sort((a, b) =>
      (a.common_name ?? a.scientific_name).localeCompare(b.common_name ?? b.scientific_name)
    );
    return r;
  }, [sightings, group, query, sort]);

  const speciesCount = useMemo(() => new Set(sightings.map(s => s.scientific_name)).size, [sightings]);

  const selected = selectedId !== null ? sightings.find(s => s.id === selectedId) ?? null : null;

  const handleDelete = async (id: number) => {
    await window.api.sightings.delete(id);
    setSelectedId(null);
    loadSightings();
  };

  if (loading) {
    return (
      <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ fontSize: 14, color: "var(--ink-3)" }}>Loading collection…</div>
      </div>
    );
  }

  if (sightings.length === 0) {
    return (
      <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center", maxWidth: 360 }}>
          <div style={{ fontFamily: "Fraunces, serif", fontSize: 22, fontWeight: 500, color: "var(--ink)", marginBottom: 8 }}>No sightings yet</div>
          <div style={{ fontSize: 13.5, color: "var(--ink-3)", lineHeight: 1.6 }}>
            Identify an animal and save it to start your collection.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", minHeight: 0, position: "relative" }}>
      <div style={{ padding: "22px 32px 18px", display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexShrink: 0 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.14em", textTransform: "uppercase" as const, color: "var(--accent-deep)", marginBottom: 6 }}>Your collection</div>
          <h1 style={{ fontFamily: "Fraunces, serif", fontWeight: 500, fontSize: 26, letterSpacing: "-0.015em", color: "var(--ink)", margin: 0 }}>
            {sightings.length} sighting{sightings.length !== 1 ? "s" : ""}
            <span style={{ fontFamily: "Fraunces, serif", fontStyle: "italic", fontWeight: 400, color: "var(--ink-3)", fontSize: 18, marginLeft: 10 }}>
              across {speciesCount} species
            </span>
          </h1>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 32px", borderBottom: "0.5px solid var(--hair)", flexShrink: 0 }}>
        <div style={{ display: "flex", gap: 4, padding: 3, background: "#fbfaf6", borderRadius: 8, border: "0.5px solid var(--hair)" }}>
          {GROUPS.map(g => (
            <button key={g} onClick={() => setGroup(g)} style={{
              appearance: "none", border: 0, cursor: "pointer",
              padding: "5px 11px", borderRadius: 5,
              background: group === g ? "#fff" : "transparent",
              color: group === g ? "var(--ink)" : "var(--ink-3)",
              fontFamily: "inherit", fontSize: 12, fontWeight: group === g ? 500 : 450,
              boxShadow: group === g ? "0 1px 2px rgba(0,0,0,0.08), 0 0 0 0.5px rgba(0,0,0,0.06)" : "none",
            }}>{g}</button>
          ))}
        </div>

        <div style={{ flex: 1, position: "relative", maxWidth: 280 }}>
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none"
            style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }}>
            <circle cx="5.5" cy="5.5" r="4" stroke="var(--ink-4)" strokeWidth="1.4" />
            <path d="M8.5 8.5l3 3" stroke="var(--ink-4)" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
          <input value={query} onChange={e => setQuery(e.target.value)}
            placeholder="Search species or location"
            style={{ width: "100%", appearance: "none", border: "0.5px solid var(--hair-2)", borderRadius: 7, background: "#fff", padding: "7px 10px 7px 30px", fontFamily: "inherit", fontSize: 13, color: "var(--ink)", outline: "none" }} />
        </div>

        <div style={{ flex: 1 }} />

        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--ink-3)" }}>
          <span>Sort</span>
          <select value={sort} onChange={e => setSort(e.target.value)} style={{ appearance: "none", border: "0.5px solid var(--hair-2)", borderRadius: 6, background: "#fff", padding: "5px 22px 5px 8px", fontFamily: "inherit", fontSize: 12, color: "var(--ink-2)", cursor: "pointer" }}>
            <option value="recent">Most recent</option>
            <option value="confidence">Highest confidence</option>
            <option value="species">Species (A–Z)</option>
          </select>
        </div>

        <div style={{ display: "flex", padding: 2, background: "#fbfaf6", borderRadius: 7, border: "0.5px solid var(--hair)" }}>
          <ViewToggle active={view === "grid"} onClick={() => setView("grid")} icon="grid" />
          <ViewToggle active={view === "list"} onClick={() => setView("list")} icon="list" />
        </div>
      </div>

      <div style={{ flex: 1, overflow: "auto", minHeight: 0 }}>
        {filtered.length === 0 ? (
          <EmptyResult onClear={() => { setQuery(""); setGroup("All"); }} />
        ) : view === "grid" ? (
          <GridView items={filtered} onOpen={(s) => setSelectedId(s.id)} />
        ) : (
          <ListView items={filtered} onOpen={(s) => setSelectedId(s.id)} />
        )}
      </div>

      {selected && (
        <DetailDrawer
          item={selected}
          onClose={() => setSelectedId(null)}
          onDelete={handleDelete}
          onUpdated={() => { loadSightings(); }}
        />
      )}
    </div>
  );
}

function ViewToggle({ active, onClick, icon }: { active: boolean; onClick: () => void; icon: "grid"|"list" }) {
  const paths = {
    grid: <><rect x="2" y="2" width="4" height="4" rx="0.5" fill="currentColor" /><rect x="8" y="2" width="4" height="4" rx="0.5" fill="currentColor" /><rect x="2" y="8" width="4" height="4" rx="0.5" fill="currentColor" /><rect x="8" y="8" width="4" height="4" rx="0.5" fill="currentColor" /></>,
    list: <><rect x="2" y="3" width="10" height="1.5" rx="0.5" fill="currentColor" /><rect x="2" y="6.5" width="10" height="1.5" rx="0.5" fill="currentColor" /><rect x="2" y="10" width="10" height="1.5" rx="0.5" fill="currentColor" /></>,
  };
  return (
    <button onClick={onClick} style={{ appearance: "none", border: 0, background: active ? "#fff" : "transparent", color: active ? "var(--ink)" : "var(--ink-4)", width: 26, height: 24, borderRadius: 5, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", boxShadow: active ? "0 1px 2px rgba(0,0,0,0.08), 0 0 0 0.5px rgba(0,0,0,0.06)" : "none" }}>
      <svg width="14" height="14" viewBox="0 0 14 14">{paths[icon]}</svg>
    </button>
  );
}

function GridView({ items, onOpen }: { items: Sighting[]; onOpen: (i: Sighting) => void }) {
  return (
    <div style={{ padding: "22px 32px 32px", display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 16 }}>
      {items.map(it => <GridCard key={it.id} item={it} onClick={() => onOpen(it)} />)}
    </div>
  );
}

function GridCard({ item, onClick }: { item: Sighting; onClick: () => void }) {
  const [hover, setHover] = useState(false);
  const displayName = item.common_name ?? item.scientific_name;
  return (
    <div onClick={onClick} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{ cursor: "pointer", borderRadius: 12, overflow: "hidden", background: "#fff", border: "0.5px solid var(--hair)", boxShadow: hover ? "0 12px 28px -14px rgba(20,30,20,0.25), 0 0 0 0.5px rgba(106,133,102,0.4)" : "0 1px 2px rgba(20,30,20,0.04)", transform: hover ? "translateY(-2px)" : "none", transition: "all 200ms ease", display: "flex", flexDirection: "column" }}>
      <div style={{ position: "relative", aspectRatio: "4/3", background: "#e8e4db" }}>
        <img
          src={`local-image://${item.image_path}`}
          alt={displayName}
          draggable={false}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
        />
      </div>
      <div style={{ padding: "12px 14px 14px" }}>
        <div style={{ fontFamily: "Fraunces, serif", fontWeight: 500, fontSize: 16, color: "var(--ink)", letterSpacing: "-0.005em", lineHeight: 1.2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{displayName}</div>
        <div style={{ fontFamily: "Fraunces, serif", fontStyle: "italic", fontSize: 12, color: "var(--ink-3)", marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.scientific_name}</div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10, fontSize: 11.5, color: "var(--ink-3)" }}>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "70%" }}>{item.location ?? "—"}</span>
          <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10.5, color: "var(--ink-4)", flexShrink: 0 }}>{formatDate(item.date_observed ?? item.created_at).split(",")[0]}</span>
        </div>
      </div>
    </div>
  );
}

function ListView({ items, onOpen }: { items: Sighting[]; onOpen: (i: Sighting) => void }) {
  return (
    <div style={{ padding: "8px 32px 32px" }}>
      <div style={{ display: "grid", gridTemplateColumns: "56px 1.6fr 1fr 1fr 32px", gap: 14, alignItems: "center", padding: "10px 12px", fontSize: 10, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase" as const, color: "var(--ink-4)", borderBottom: "0.5px solid var(--hair)" }}>
        <span /><span>Species</span><span>Location</span><span>Date</span><span />
      </div>
      {items.map(it => {
        const displayName = it.common_name ?? it.scientific_name;
        return (
          <div key={it.id} onClick={() => onOpen(it)}
            onMouseEnter={e => (e.currentTarget.style.background = "var(--accent-softer)")}
            onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
            style={{ display: "grid", gridTemplateColumns: "56px 1.6fr 1fr 1fr 32px", gap: 14, alignItems: "center", padding: "10px 12px", borderRadius: 8, cursor: "pointer", transition: "background 120ms ease", borderBottom: "0.5px solid var(--hair)" }}>
            <div style={{ width: 48, height: 36, borderRadius: 5, overflow: "hidden", background: "#e8e4db" }}>
              <img src={`local-image://${it.image_path}`} alt="" draggable={false}
                style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontFamily: "Fraunces, serif", fontSize: 14.5, fontWeight: 500, color: "var(--ink)", letterSpacing: "-0.005em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{displayName}</div>
              <div style={{ fontFamily: "Fraunces, serif", fontStyle: "italic", fontSize: 11.5, color: "var(--ink-3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.scientific_name}</div>
            </div>
            <span style={{ fontSize: 12.5, color: "var(--ink-2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.location ?? "—"}</span>
            <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11.5, color: "var(--ink-3)" }}>{formatDate(it.date_observed ?? it.created_at)}</span>
            <span style={{ color: "var(--ink-4)", textAlign: "right" }}>
              <svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M4 2l4 4-4 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </span>
          </div>
        );
      })}
    </div>
  );
}

function EmptyResult({ onClear }: { onClear: () => void }) {
  return (
    <div style={{ padding: "80px 32px", textAlign: "center", color: "var(--ink-3)" }}>
      <div style={{ fontFamily: "Fraunces, serif", fontSize: 20, color: "var(--ink-2)", marginBottom: 6 }}>Nothing matches</div>
      <div style={{ fontSize: 13, marginBottom: 16 }}>Try another search or clear the filter.</div>
      <button onClick={onClear} style={ghostBtn}>Clear filters</button>
    </div>
  );
}

function DetailDrawer({ item, onClose, onDelete, onUpdated }: {
  item: Sighting; onClose: () => void;
  onDelete: (id: number) => void; onUpdated: () => void;
}) {
  const displayName = item.common_name ?? item.scientific_name;
  const { info: wikiInfo, loading: wikiLoading } = useSpeciesInfo(item.scientific_name);
  const [fields, setFields] = useState({
    date_observed: item.date_observed ?? "",
    location: item.location ?? "",
    comments: item.comments ?? "",
  });

  // Ref always holds latest field values — avoids stale closure in save
  const fieldsRef = useRef(fields);
  fieldsRef.current = fields;

  const dirtyKeys = useRef<Set<string>>(new Set());
  const closing = useRef(false);

  const markDirty = (key: string) => { dirtyKeys.current.add(key); };

  const saveDirty = async () => {
    const keys = Array.from(dirtyKeys.current);
    if (keys.length === 0) return;
    dirtyKeys.current.clear();
    for (const key of keys) {
      const value = fieldsRef.current[key as keyof typeof fields] || null;
      try {
        await window.api.sightings.update(item.id, { [key]: value });
      } catch { /* best-effort */ }
    }
  };

  const handleClose = async () => {
    closing.current = true;
    await saveDirty();
    onClose();
  };

  return (
    <div style={{ position: "absolute", inset: 0, zIndex: 5, display: "flex", justifyContent: "flex-end" }}>
      <div onClick={handleClose} style={{ position: "absolute", inset: 0, background: "rgba(20,25,20,0.35)", animation: "fadeIn 180ms ease" }} />
      <div style={{ position: "relative", width: 440, height: "100%", background: "#fff", borderLeft: "0.5px solid var(--hair)", display: "flex", flexDirection: "column", boxShadow: "-12px 0 40px -10px rgba(20,30,20,0.2)", animation: "slideIn 240ms cubic-bezier(.3,.7,.4,1)" }}>
        <div style={{ position: "relative", height: 240, flexShrink: 0, background: "#e8e4db" }}>
          <img
            src={`local-image://${item.image_path}`}
            alt={displayName}
            draggable={false}
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
          />
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(0,0,0,0.3) 0%, transparent 40%, rgba(0,0,0,0.6) 100%)" }} />
          <button onClick={handleClose} style={{ position: "absolute", top: 14, right: 14, appearance: "none", border: 0, background: "rgba(20,25,20,0.5)", color: "#fff", width: 30, height: 30, borderRadius: "50%", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
          </button>
          <div style={{ position: "absolute", left: 24, bottom: 18, color: "#fff" }}>
            <div style={{ fontFamily: "Fraunces, serif", fontSize: 28, fontWeight: 500, letterSpacing: "-0.015em", lineHeight: 1.1 }}>{displayName}</div>
            <div style={{ fontFamily: "Fraunces, serif", fontStyle: "italic", fontSize: 14, opacity: 0.85, marginTop: 2 }}>{item.scientific_name}</div>
          </div>
        </div>

        <div style={{ flex: 1, overflow: "auto", padding: "24px 28px" }}>
          <div style={{ marginBottom: 22 }}>
            <div style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase" as const, color: "var(--ink-4)", marginBottom: 6 }}>Confidence</div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ flex: 1, height: 6, background: "var(--accent-softer)", borderRadius: 999, overflow: "hidden" }}>
                <div style={{ width: `${item.confidence * 100}%`, height: "100%", background: "var(--accent)" }} />
              </div>
              <span style={{ fontFamily: "Fraunces, serif", fontSize: 18, fontWeight: 500, color: "var(--ink)" }}>{Math.round(item.confidence * 100)}%</span>
            </div>
          </div>

          {(() => {
            const taxonRanks = ["Kingdom", "Phylum", "Class", "Order", "Family", "Genus"];
            const taxonValues = [
              item.taxonomy_kingdom, item.taxonomy_phylum, item.taxonomy_class,
              item.taxonomy_order, item.taxonomy_family, item.taxonomy_genus,
            ];
            const chips: { rank: string; name: string }[] = [];
            taxonRanks.forEach((rank, i) => {
              if (taxonValues[i]) chips.push({ rank, name: taxonValues[i]! });
            });
            if (item.iucn_status) chips.push({ rank: "Status", name: item.iucn_status });
            if (chips.length === 0) return null;
            return (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, padding: "12px 14px", background: "#fbfaf6", borderRadius: 8, border: "0.5px solid var(--hair)", marginBottom: 22 }}>
                {chips.map(({ rank, name }) => (
                  <div key={rank} style={{ display: "inline-flex", alignItems: "baseline", gap: 6, padding: "2px 4px" }}>
                    <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase" as const, color: "var(--ink-4)" }}>{rank}</span>
                    <span style={{ fontSize: 12.5, color: "var(--ink-2)", fontWeight: 450 }}>{name}</span>
                  </div>
                ))}
              </div>
            );
          })()}

          {(wikiLoading || wikiInfo) && (
            <div style={{ padding: "14px 16px", background: "#fbfaf6", borderRadius: 8, border: "0.5px solid var(--hair)", marginBottom: 22 }}>
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

          <div style={{ marginBottom: 22 }}>
            <div style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase" as const, color: "var(--ink-4)", marginBottom: 4 }}>
              Model used
            </div>
            <div style={{ fontSize: 13, color: "var(--ink-2)" }}>{item.model_used === "bioclip-v1" ? "BioCLIP v1 (Fast)" : "BioCLIP 2 (Accurate)"}</div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18, marginBottom: 22 }}>
            <div>
              <div style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase" as const, color: "var(--ink-4)", marginBottom: 4 }}>Date observed</div>
              <input
                value={fields.date_observed}
                onChange={e => { setFields(f => ({ ...f, date_observed: e.target.value })); markDirty("date_observed"); }}
                onBlur={() => { if (!closing.current) saveDirty(); }}
                placeholder="e.g. Apr 21, 2026"
                style={{ width: "100%", appearance: "none", border: "0.5px solid var(--hair-2)", borderRadius: 6, background: "#fff", padding: "7px 10px", fontFamily: "inherit", fontSize: 13, color: "var(--ink)", outline: "none" }}
              />
            </div>
            <div>
              <div style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase" as const, color: "var(--ink-4)", marginBottom: 4 }}>Location</div>
              <input
                value={fields.location}
                onChange={e => { setFields(f => ({ ...f, location: e.target.value })); markDirty("location"); }}
                onBlur={() => { if (!closing.current) saveDirty(); }}
                placeholder="e.g. Tilden Park"
                style={{ width: "100%", appearance: "none", border: "0.5px solid var(--hair-2)", borderRadius: 6, background: "#fff", padding: "7px 10px", fontFamily: "inherit", fontSize: 13, color: "var(--ink)", outline: "none" }}
              />
            </div>
          </div>

          <div style={{ marginBottom: 22 }}>
            <div style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase" as const, color: "var(--ink-4)", marginBottom: 8 }}>Notes</div>
            <textarea
              value={fields.comments}
              onChange={e => { setFields(f => ({ ...f, comments: e.target.value })); markDirty("comments"); }}
              onBlur={() => { if (!closing.current) saveDirty(); }}
              placeholder="Add observations from this sighting…"
              style={{ width: "100%", appearance: "none", border: "0.5px solid var(--hair-2)", borderRadius: 8, background: "#fbfaf6", padding: "12px 14px", fontFamily: "inherit", fontSize: 13, color: "var(--ink-2)", lineHeight: 1.55, minHeight: 80, resize: "vertical", outline: "none" }}
            />
          </div>
        </div>

        <div style={{ padding: "14px 28px", borderTop: "0.5px solid var(--hair)", display: "flex", gap: 8, flexShrink: 0 }}>
          <button onClick={() => onDelete(item.id)} style={{
            ...ghostBtn, flex: 1, justifyContent: "center", height: 38,
            color: "#c0392b", borderColor: "rgba(192,57,43,0.25)",
          }}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M2 3h8M4 3V2h4v1M3 3l.5 7h5L9 3" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Delete
          </button>
          <button onClick={handleClose} style={{ ...primaryBtn, flex: 1, justifyContent: "center", height: 38 }}>Done</button>
        </div>
      </div>
    </div>
  );
}
