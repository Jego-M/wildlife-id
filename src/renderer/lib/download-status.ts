// A singleton store of the in-flight model download. Subscribes to
// `models:download-progress` once for the renderer's lifetime so that
// progress survives Settings (or any other consumer) unmounting and
// remounting — the download itself runs in the main process and keeps
// going regardless of which view is open.
import { useSyncExternalStore } from "react";
import type { ModelDownloadProgress, ModelId } from "../../shared/types";

export type ActiveDownload = {
  modelId: ModelId;
  progress: ModelDownloadProgress;
} | null;

let state: ActiveDownload = null;
const listeners = new Set<() => void>();

function notify(): void {
  for (const l of listeners) l();
}

let installed = false;
function ensureInstalled(): void {
  if (installed) return;
  installed = true;
  window.api.models.onDownloadProgress((p) => {
    state = { modelId: p.model_id as ModelId, progress: p };
    notify();
    // Hold the terminal status briefly so any "Finishing…" UI can render,
    // then clear so the row falls back to its installed/switch state.
    if (p.status === "ready" || p.status === "error") {
      const snapshot = p;
      setTimeout(() => {
        if (state && state.progress === snapshot) {
          state = null;
          notify();
        }
      }, 500);
    }
  });
}

export function useActiveDownload(): ActiveDownload {
  ensureInstalled();
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => state,
    () => state,
  );
}
