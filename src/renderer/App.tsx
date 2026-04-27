import { useState, useEffect } from "react";
import Welcome from "./pages/Welcome";
import ModelPicker from "./pages/ModelPicker";
import AppShell from "./components/AppShell";

type Screen = "welcome" | "model" | "app" | "loading";

export default function App() {
  const [screen, setScreen] = useState<Screen>("loading");
  const [transitioning, setTransitioning] = useState(false);

  useEffect(() => {
    window.api.models.list().then((res) => {
      const hasModel = res.available.some((m) => m.downloaded);
      setScreen(hasModel ? "app" : "welcome");
    }).catch(() => {
      setScreen("welcome");
    });
  }, []);

  const goTo = (s: Screen) => {
    setTransitioning(true);
    setTimeout(() => {
      setScreen(s);
      requestAnimationFrame(() => setTransitioning(false));
    }, 160);
  };

  if (screen === "loading") {
    return (
      <div style={{
        height: "100%", display: "flex", alignItems: "center", justifyContent: "center",
        background: "var(--bg-app)",
      }}>
        <div style={{ fontSize: 14, color: "var(--ink-3)" }}>Loading…</div>
      </div>
    );
  }

  return (
    <div style={{
      opacity: transitioning ? 0 : 1,
      transform: transitioning ? "translateY(6px)" : "none",
      transition: "opacity 200ms ease, transform 240ms ease",
      height: "100%",
    }}>
      {screen === "welcome" && <Welcome onContinue={() => goTo("model")} />}
      {screen === "model" && (
        <ModelPicker onBack={() => goTo("welcome")} onComplete={() => goTo("app")} />
      )}
      {screen === "app" && <AppShell />}
    </div>
  );
}
