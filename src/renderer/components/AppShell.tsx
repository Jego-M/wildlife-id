import { useState } from "react";
import { Wordmark } from "./ui";
import Identify from "../pages/Identify";
import Collection from "../pages/Collection";
import Settings from "../pages/Settings";

type Tab = "identify" | "collection" | "settings";

export default function AppShell() {
  const [tab, setTab] = useState<Tab>("identify");

  return (
    <div style={{ height: "100%", display: "flex", minHeight: 0, background: "var(--bg-app)" }}>
      <AppSidebar tab={tab} setTab={setTab} />
      <div style={{
        flex: 1, display: "flex", flexDirection: "column",
        minWidth: 0, minHeight: 0,
        background: "#fff",
        borderLeft: "0.5px solid var(--hair)",
      }}>
        {tab === "identify"   && <Identify />}
        {tab === "collection" && <Collection />}
        {tab === "settings"   && <Settings />}
      </div>
    </div>
  );
}

function AppSidebar({ tab, setTab }: { tab: Tab; setTab: (t: Tab) => void }) {
  const items: { id: Tab; label: string; icon: string }[] = [
    { id: "identify",   label: "Identify",   icon: "identify" },
    { id: "collection", label: "Collection", icon: "collection" },
  ];
  return (
    <div style={{
      width: 200, flexShrink: 0, padding: "18px 12px 14px",
      display: "flex", flexDirection: "column", gap: 2,
      background: "#fbfaf6",
    }}>
      <div style={{ padding: "4px 10px 14px" }}>
        <Wordmark />
      </div>
      <div style={{
        fontSize: 10, fontWeight: 600, letterSpacing: "0.12em",
        textTransform: "uppercase" as const, color: "var(--ink-4)",
        padding: "8px 10px 4px",
      }}>Workspace</div>
      {items.map(it => (
        <SidebarButton key={it.id} active={tab === it.id} onClick={() => setTab(it.id)}>
          <SidebarIcon name={it.icon} active={tab === it.id} />
          <span>{it.label}</span>
        </SidebarButton>
      ))}
      <div style={{ flex: 1 }} />
      <SidebarButton active={tab === "settings"} onClick={() => setTab("settings")}>
        <SidebarIcon name="settings" active={tab === "settings"} />
        <span>Settings</span>
      </SidebarButton>
    </div>
  );
}

function SidebarButton({
  active, onClick, children,
}: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} style={{
      appearance: "none", border: 0, cursor: "pointer", textAlign: "left",
      display: "flex", alignItems: "center", gap: 10,
      height: 30, padding: "0 10px", borderRadius: 7,
      background: active ? "var(--accent-softer)" : "transparent",
      color: active ? "var(--accent-deep)" : "var(--ink-2)",
      fontFamily: "inherit", fontSize: 13, fontWeight: active ? 500 : 450,
      transition: "background 120ms ease",
    }}>
      {children}
    </button>
  );
}

function SidebarIcon({ name, active }: { name: string; active?: boolean }) {
  const stroke = "currentColor";
  const sw = 1.4;
  const paths: Record<string, React.ReactNode> = {
    identify: <>
      <circle cx="8" cy="8" r="4.5" fill="none" stroke={stroke} strokeWidth={sw} />
      <path d="M11.2 11.2L14 14" stroke={stroke} strokeWidth={sw} strokeLinecap="round" />
    </>,
    collection: <>
      <rect x="2.5" y="3.5" width="11" height="9" rx="1.5" fill="none" stroke={stroke} strokeWidth={sw} />
      <path d="M2.5 7h11M6 3.5v9" stroke={stroke} strokeWidth={sw} />
    </>,
    settings: <>
      <circle cx="8" cy="8" r="2.2" fill="none" stroke={stroke} strokeWidth={sw} />
      <path
        d="M8 2.5v1.5M8 12v1.5M2.5 8h1.5M12 8h1.5M4.2 4.2l1 1M10.8 10.8l1 1M11.8 4.2l-1 1M5.2 10.8l-1 1"
        stroke={stroke} strokeWidth={sw} strokeLinecap="round"
      />
    </>,
  };
  return (
    <span style={{
      width: 18, height: 18, display: "inline-flex", alignItems: "center", justifyContent: "center",
      opacity: active ? 1 : 0.75,
    }}>
      <svg width="16" height="16" viewBox="0 0 16 16">{paths[name]}</svg>
    </span>
  );
}
