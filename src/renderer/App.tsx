import { MemoryRouter, Routes, Route, Navigate } from "react-router-dom";
import Welcome from "./pages/Welcome";
import Identify from "./pages/Identify";
import Collection from "./pages/Collection";
import Settings from "./pages/Settings";

export default function App() {
  return (
    <MemoryRouter initialEntries={["/welcome"]}>
      <Routes>
        <Route path="/welcome" element={<Welcome />} />
        <Route path="/identify" element={<Identify />} />
        <Route path="/collection" element={<Collection />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/welcome" replace />} />
      </Routes>
    </MemoryRouter>
  );
}
