import { ipcMain, app, shell, BrowserWindow } from "electron";
import { readFileSync, mkdirSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import log from "electron-log";
import { getBackendUrl } from "./backend-launcher";
import { getRepo } from "./database";
import type { ModelDownloadProgress, CreateSightingPayload, NewSighting, Sighting } from "../shared/types";

function backendError(channel: string, err: unknown): never {
  log.error(`${channel} failed`, err);
  throw new Error("Could not reach the model backend.");
}

function dbError(channel: string, err: unknown): never {
  log.error(`${channel} failed`, err);
  throw new Error("A database error occurred.");
}

export function registerIpcHandlers(): void {
  // ── Models ──────────────────────────────────────────────────────────────────

  ipcMain.handle("models:list", async () => {
    try {
      const res = await fetch(`${getBackendUrl()}/models`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      backendError("models:list", err);
    }
  });

  ipcMain.handle("models:select", async (_, modelId: string) => {
    try {
      const res = await fetch(`${getBackendUrl()}/select_model`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model_id: modelId }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (err) {
      backendError("models:select", err);
    }
  });

  ipcMain.handle("models:download", async (_, modelId: string) => {
    try {
      const res = await fetch(`${getBackendUrl()}/download_model`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model_id: modelId }),
      });
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data: ")) continue;
          try {
            const progress: ModelDownloadProgress = JSON.parse(trimmed.slice(6));
            win?.webContents.send("models:download-progress", progress);
          } catch {
            // skip malformed lines
          }
        }
      }
    } catch (err) {
      backendError("models:download", err);
    }
  });

  // ── Identify ─────────────────────────────────────────────────────────────────

  ipcMain.handle("identify:predict", async (_, imageBytes: Uint8Array) => {
    try {
      const form = new FormData();
      form.append("image", new Blob([imageBytes]), "image.jpg");
      form.append("top_k", "3");
      const res = await fetch(`${getBackendUrl()}/predict`, {
        method: "POST",
        body: form,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      backendError("identify:predict", err);
    }
  });

  // ── Sightings ─────────────────────────────────────────────────────────────────

  ipcMain.handle("sightings:list", (_, search?: string) => {
    try {
      return getRepo().list(search);
    } catch (err) {
      dbError("sightings:list", err);
    }
  });

  ipcMain.handle("sightings:create", async (_, s: CreateSightingPayload) => {
    try {
      const imagesDir = path.join(app.getPath("userData"), "images");
      mkdirSync(imagesDir, { recursive: true });
      const filename = `${randomUUID()}.jpg`;
      await writeFile(path.join(imagesDir, filename), Buffer.from(s.image_bytes));

      const newSighting: NewSighting = {
        scientific_name: s.scientific_name,
        common_name: s.common_name,
        confidence: s.confidence,
        image_path: filename,
        model_used: s.model_used,
        taxonomy_class: s.taxonomy_class ?? null,
        date_observed: s.date_observed ?? null,
        location: s.location ?? null,
        comments: s.comments ?? null,
      };
      return getRepo().create(newSighting);
    } catch (err) {
      dbError("sightings:create", err);
    }
  });

  ipcMain.handle("sightings:update", (_, id: number, patch: Partial<Sighting>) => {
    try {
      return getRepo().update(id, patch);
    } catch (err) {
      dbError("sightings:update", err);
    }
  });

  ipcMain.handle("sightings:delete", (_, id: number) => {
    try {
      getRepo().delete(id);
    } catch (err) {
      dbError("sightings:delete", err);
    }
  });

  // ── App ───────────────────────────────────────────────────────────────────────

  ipcMain.handle("app:version", () => app.getVersion());

  ipcMain.handle("app:open-data-folder", () => {
    shell.openPath(app.getPath("userData"));
  });

  ipcMain.handle("app:licenses", () => {
    try {
      const licensesPath = app.isPackaged
        ? path.join(process.resourcesPath, "THIRD_PARTY_LICENSES.txt")
        : path.join(app.getAppPath(), "THIRD_PARTY_LICENSES.txt");
      return readFileSync(licensesPath, "utf8");
    } catch {
      return "(License file not found — run the build to generate it)";
    }
  });
}
