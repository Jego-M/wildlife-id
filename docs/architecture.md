# Wildlife ID — Architecture

Companion to `wildlife-id-requirements-v4.md` and `wildlife-id-strategy.md`. The requirements describe what the app does at the user level. The strategy describes the order of work. This doc describes the contracts and lifecycles you write code against — the parts where getting it wrong on day one costs the most.

---

## 1. Process model

Three processes, two boundaries.

```
┌────────────────────────┐  ┌────────────────────────┐  ┌────────────────────────┐
│  Renderer (Chromium)   │  │  Main (Node.js)        │  │  Backend (Python)      │
│                        │  │                        │  │                        │
│  - React UI            │  │  - Window mgmt         │  │  - FastAPI server      │
│  - Crop tool           │  │  - Backend supervisor  │  │  - BioCLIP inference   │
│  - No direct fs/db/net │  │  - SQLite              │  │  - Model download      │
│                        │  │  - File I/O            │  │                        │
└──────────┬─────────────┘  └──────────┬─────────────┘  └──────────┬─────────────┘
           │                            │                            │
           │   contextBridge IPC        │   HTTP + child_process     │
           │   (typed, async)           │   (127.0.0.1:<dynport>)    │
           ▼                            ▼                            ▼
       (sandboxed)                (privileged)                  (isolated)
```

**Boundary 1 — Renderer ↔ Main (IPC).** The renderer runs sandboxed with `nodeIntegration: false` and `contextIsolation: true`. The only way it touches the OS is through a small, typed API exposed via `preload.ts`. This is the standard secure Electron pattern; do not relax it.

**Boundary 2 — Main ↔ Backend (HTTP).** The main process supervises the Python backend as a child process and talks to it over HTTP on localhost. The renderer never talks to the backend directly. This isolation makes the eventual hosted-server pivot trivial: only the main process's HTTP client needs to change.

The renderer being two layers away from the model is deliberate. It also means every model interaction passes through the main process, which is where logging, error handling, and (eventually) request-cancellation belong.

---

## 2. The backend launch dance

The single trickiest piece of the architecture. Get this right early.

```
Main process startup                          Backend process
─────────────────────                          ───────────────
1. Compute backendPath, portFilePath
2. Delete stale portFilePath (if exists)
3. spawn(backendPath, ["--port-file", portFilePath])
                                              4. Bind 127.0.0.1:0 (kernel picks port)
                                              5. Read assigned port from socket
                                              6. Atomically write portFilePath
                                                 (write to .tmp, then rename)
                                              7. Start serving HTTP
8. Poll for portFilePath every 100 ms
9. On exists → read port
10. GET http://127.0.0.1:<port>/health
    (retry every 500 ms, max 30 s)
11. On 200 OK → renderer becomes interactive
```

**Why a port file, not stdout parsing?** Stdout parsing seems simpler but breaks under PyInstaller's onedir mode where stdout buffering is unreliable. A file written atomically is platform-portable and easy to debug when something goes wrong.

**Why not a fixed port?** Conflicts with whatever else the user is running (other dev servers, other Electron apps using the same trick). The kernel-assigned port costs nothing.

**Atomic write detail.** On all three platforms, `rename` is atomic. The Python backend should write to `backend.port.tmp`, then rename to `backend.port`. The main process never sees a partial file.

**Failure modes the launcher must handle:**

| Symptom | Likely cause | Action |
|---|---|---|
| Port file never appears (30 s timeout) | Backend crashed at startup | Show error dialog with last 50 lines of backend stderr; offer "Open log folder" |
| Port file appears but `/health` 5xx forever | Model download stuck or weights corrupted | Surface backend's progress events; offer "Reset model cache" |
| Backend dies mid-session | Memory pressure, segfault | Auto-restart once; if it dies again within 60 s, stop and surface the error |

### Skeleton: `backend-launcher.ts`

```typescript
import { spawn, ChildProcess } from "node:child_process";
import { app } from "electron";
import { promises as fs } from "node:fs";
import path from "node:path";

const PORT_FILE = path.join(app.getPath("userData"), "backend.port");
const HEALTH_TIMEOUT_MS = 30_000;
const HEALTH_POLL_MS = 500;
const PORT_FILE_POLL_MS = 100;

let backend: ChildProcess | null = null;
let backendPort: number | null = null;

export async function startBackend(): Promise<number> {
  // 1. Clean up stale port file
  await fs.rm(PORT_FILE, { force: true });

  // 2. Locate bundled binary
  const binary = resolveBackendBinary(); // platform-specific path under resources/

  // 3. Spawn
  backend = spawn(binary, ["--port-file", PORT_FILE], {
    stdio: ["ignore", "pipe", "pipe"],
    detached: false,
  });
  backend.stdout?.on("data", (b) => log.info(`[backend] ${b}`));
  backend.stderr?.on("data", (b) => log.warn(`[backend] ${b}`));
  backend.on("exit", handleBackendExit);

  // 4. Wait for port file
  backendPort = await waitForPortFile(PORT_FILE, HEALTH_TIMEOUT_MS);

  // 5. Wait for /health
  await waitForHealth(backendPort, HEALTH_TIMEOUT_MS);

  return backendPort;
}

export function stopBackend(): void {
  backend?.kill("SIGTERM");
  backend = null;
}

export function getBackendUrl(): string {
  if (!backendPort) throw new Error("Backend not started");
  return `http://127.0.0.1:${backendPort}`;
}
```

The Python side is the mirror image:

```python
# src/backend/main.py (excerpt)
import argparse, socket, os, tempfile
from fastapi import FastAPI
import uvicorn

def pick_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]

def write_port_file(path: str, port: int) -> None:
    tmp = f"{path}.tmp"
    with open(tmp, "w") as f:
        f.write(str(port))
    os.replace(tmp, path)  # atomic

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--port-file", required=True)
    args = parser.parse_args()
    port = pick_port()
    write_port_file(args.port_file, port)
    uvicorn.run(app, host="127.0.0.1", port=port, log_level="info")
```

---

## 3. IPC contract

The renderer cannot import Node modules, the database, or the backend client directly. Everything goes through `preload.ts` via `contextBridge.exposeInMainWorld`. A handful of design rules keep this clean:

1. **Every IPC method is async.** Even synchronous-looking operations like "read app version" should be `Promise`-returning to keep the contract uniform.
2. **No callbacks across the bridge.** Use `Promise<T>` for one-shot calls and a small event emitter pattern for streams (model download progress).
3. **The shape of every payload is a TypeScript type shared between main and renderer** (in `src/shared/types.ts` — a sibling to both).

### Shared types

```typescript
// src/shared/types.ts
export type ModelId = "bioclip-v1" | "bioclip-v2";

export interface Prediction {
  scientific_name: string;
  common_name: string | null;
  taxonomy: string[];
  confidence: number;
}

export interface PredictResponse {
  model_used: ModelId;
  predictions: Prediction[];
}

export interface Sighting {
  id: number;
  scientific_name: string;
  common_name: string | null;
  confidence: number;
  image_path: string;
  model_used: ModelId;
  date_observed: string | null;
  location: string | null;
  comments: string | null;
  created_at: string;
}

export interface ModelDownloadProgress {
  model_id: ModelId;
  bytes_downloaded: number;
  bytes_total: number;
  status: "downloading" | "verifying" | "ready" | "error";
  error?: string;
}
```

### Preload API

```typescript
// src/main/preload.ts
import { contextBridge, ipcRenderer } from "electron";
import type {
  ModelId, PredictResponse, Sighting, ModelDownloadProgress,
} from "../shared/types";

const api = {
  // Model management
  models: {
    list: () => ipcRenderer.invoke("models:list"),
    select: (id: ModelId) => ipcRenderer.invoke("models:select", id),
    onDownloadProgress: (cb: (p: ModelDownloadProgress) => void) => {
      const handler = (_: unknown, p: ModelDownloadProgress) => cb(p);
      ipcRenderer.on("models:download-progress", handler);
      return () => ipcRenderer.off("models:download-progress", handler);
    },
  },

  // Identification
  identify: {
    predict: (imageBytes: Uint8Array): Promise<PredictResponse> =>
      ipcRenderer.invoke("identify:predict", imageBytes),
  },

  // Collection
  sightings: {
    list: (search?: string): Promise<Sighting[]> =>
      ipcRenderer.invoke("sightings:list", search),
    create: (s: Omit<Sighting, "id" | "created_at">): Promise<Sighting> =>
      ipcRenderer.invoke("sightings:create", s),
    update: (id: number, patch: Partial<Sighting>): Promise<Sighting> =>
      ipcRenderer.invoke("sightings:update", id, patch),
    delete: (id: number): Promise<void> =>
      ipcRenderer.invoke("sightings:delete", id),
  },

  // App
  app: {
    version: () => ipcRenderer.invoke("app:version"),
    openDataFolder: () => ipcRenderer.invoke("app:open-data-folder"),
    licenses: () => ipcRenderer.invoke("app:licenses"),
  },
};

contextBridge.exposeInMainWorld("api", api);

export type WildlifeApi = typeof api;
declare global {
  interface Window {
    api: WildlifeApi;
  }
}
```

The renderer imports `WildlifeApi` for type safety and calls `window.api.identify.predict(...)`. Adding a new method is a four-step rule: add to `shared/types.ts`, add to `preload.ts`, add a handler in `ipc-handlers.ts`, call it from the renderer.

---

## 4. Filesystem layout

Everything user-specific lives under `app.getPath("userData")`, which resolves to:

- **Windows:** `%APPDATA%\WildlifeId\`
- **macOS:** `~/Library/Application Support/WildlifeId/`
- **Linux:** `~/.config/WildlifeId/`

Layout inside that folder:

```
WildlifeId/
├── wildlife.db                  # SQLite database
├── wildlife.db-wal              # SQLite WAL (auto-managed)
├── images/
│   ├── 8f2a...c1.jpg            # cropped images, UUID-named
│   └── ...
├── models/
│   ├── bioclip-v1/              # cached model weights + per-model embeddings
│   │   ├── open_clip_pytorch_model.bin
│   │   └── species_embeddings.npz
│   └── bioclip-v2/
│       ├── open_clip_pytorch_model.bin
│       └── species_embeddings.npz
├── vocab/
│   └── species_meta.sqlite      # shared metadata (taxonomy, common names, IUCN)
├── logs/
│   ├── main.log                 # rolling, 5 MB max, electron-log
│   └── backend.log              # rolling, written by Python
├── backend.port                 # ephemeral, written each launch
└── settings.json                # active model, low-confidence threshold, etc.
```

**Why split per-model embeddings from shared metadata.** The `.npz` is a float
matrix produced by *that* model's text encoder — incompatible across models —
and is the file users care about for download size. The `species_meta.sqlite`
is plain text data (taxonomy, common names, IUCN) that's identical regardless
of which model is active, so it lives at a shared path and is downloaded once.
Improving common-name coverage in a future release ships only this small
sqlite, not the multi-hundred-MB embedding files.

The `.npz` stores `embeddings: float16[N, D]` and a parallel `scientific_names:
str[N]` array. Row `i` of the matrix corresponds to `scientific_names[i]`.
On disk the embeddings are float16 (~430 MB for ~414k species); the predictor
casts to float32 at load time so the inference matmul runs at full precision.
At predict time, top-k indices look up scientific names → batched SELECT in
the metadata sqlite for display fields. The per-model file owns the row→name
mapping; the metadata sqlite is an unordered key-value store.

**Why UUIDs for images?** Avoids collisions, avoids encoding species names in paths (which would mojibake for users with non-ASCII filenames), and makes `images/` safe to back up as an opaque blob.

**Why not store images as BLOBs in SQLite?** SQLite handles blobs well, but a separate `images/` folder is easier for users to back up, easier to inspect when debugging, and lets the OS file cache handle hot images. The DB only stores the relative path.

**Settings as JSON, not SQLite.** The settings table would have one row. Not worth it. A small `settings.json` is plenty, and easier for advanced users to edit by hand.

---

## 5. Database access

`better-sqlite3` is synchronous and lives only in the main process. A thin wrapper:

```typescript
// src/main/database.ts (excerpt)
import Database from "better-sqlite3";
import { app } from "electron";
import path from "node:path";

const DB_PATH = path.join(app.getPath("userData"), "wildlife.db");

export class SightingsRepo {
  private db: Database.Database;

  constructor() {
    this.db = new Database(DB_PATH);
    this.db.pragma("journal_mode = WAL");
    this.runMigrations();
  }

  private runMigrations(): void {
    const version = this.db.pragma("user_version", { simple: true }) as number;
    if (version < 1) {
      this.db.exec(MIGRATION_001);
      this.db.pragma("user_version = 1");
    }
    // future migrations: if (version < 2) { ... }
  }

  list(search?: string): Sighting[] { /* ... */ }
  create(s: NewSighting): Sighting { /* ... */ }
  update(id: number, patch: Partial<Sighting>): Sighting { /* ... */ }
  delete(id: number): void { /* ... */ }
}
```

**Migrations from day one.** Use `pragma user_version` as the schema version counter. Even though there's only one migration in v1, the framework being in place means v2 changes don't require retrofitting.

**WAL mode.** Better concurrent read performance and faster writes. The default rollback-journal mode is fine for this app's load, but WAL is one line of code and removes a class of future surprises.

**Prepared statements.** Cache prepared statements as fields of the repo class — `better-sqlite3` makes this idiomatic and ~3x faster than reparsing on every call.

---

## 6. Renderer state

Three pieces of global state:

| State | Scope | Implementation |
|---|---|---|
| Backend status (loading / ready / error) | Whole app | `BackendContext` (React Context) |
| Active model + download progress | Whole app | `ModelContext`, fed by `window.api.models.onDownloadProgress` |
| Current detection result (image, crop, predictions) | Identify tab only | Local `useState` in `Identify.tsx` |

That's it. No Redux, no Zustand, no XState. Two contexts and component-local state cover everything.

**Don't put the collection in a context.** The Collection tab is the only consumer; load it via `useEffect` when that tab mounts and refresh after mutations. A context here would just be a cache that goes stale.

**Routing.** React Router with three routes (`/welcome`, `/identify`, `/collection`, `/settings`). The welcome route is gated by a flag in `settings.json` — once the user has picked a model, it's never shown again unless the user resets.

---

## 7. Error handling philosophy

Three categories of error, three different responses:

1. **Recoverable, user-visible** — model download failed, network hiccup. Show an inline error in the affected UI surface with a Retry button. Do not show a modal dialog.
2. **Unrecoverable, app-level** — backend crashed three times, database corrupt. Show a full-screen error state with a "Open log folder" button and a "Report a bug" link. App is unusable until restart, but it doesn't lie about being usable.
3. **Programming errors** — unexpected exceptions in main process or renderer. Caught by a top-level handler, logged with full stack, surfaced in dev mode as a dialog and in production as a quiet "Something went wrong" toast.

The renderer never sees raw exceptions from the main process. The IPC handler layer normalizes errors:

```typescript
// src/main/ipc-handlers.ts (excerpt)
ipcMain.handle("identify:predict", async (_, imageBytes) => {
  try {
    return await backendClient.predict(imageBytes);
  } catch (err) {
    log.error("predict failed", err);
    if (err instanceof BackendUnavailableError) {
      throw new IpcError("BACKEND_UNAVAILABLE", "The model isn't ready yet.");
    }
    if (err instanceof BackendTimeoutError) {
      throw new IpcError("BACKEND_TIMEOUT", "Identification took too long.");
    }
    throw new IpcError("INTERNAL", "Something went wrong identifying this photo.");
  }
});
```

`IpcError` has a `code` and a user-safe `message`. The renderer checks `code` to decide whether to retry vs. surface to the user.

---

## 8. Build & release pipeline

See `CONTRIBUTING.md` for the full step-by-step walkthrough. Summary here.

### Local dev

```bash
npm install
python3 -m venv .venv && .venv/bin/pip install -r src/backend/requirements.txt
# install torch separately — see CONTRIBUTING.md for the right index URL
npm run dev
```

The dev backend runs directly from `.venv` (not PyInstaller), so Python changes are instant.

### Production build

The backend must be built separately before `dist` — it is not included in `npm run build`.

```bash
npm run build:backend   # PyInstaller via .venv-build — output to dist/backend/
npm run dist -- --linux # builds renderer + main, then packages with electron-builder
```

Platform flags: `--linux`, `--mac`, `--win`. Output lands in `dist/installers/`.

### PyInstaller spec

The PyInstaller configuration lives in `build/wildlife_backend.spec` — a maintained file checked into the repo. **Do not delete it.** The auto-generated spec PyInstaller would produce has empty `hiddenimports` and `datas`, which breaks the build in several ways:

- `open_clip` ships data files (BPE tokenizer vocab, model config JSONs) that PyInstaller's static analysis doesn't collect automatically → fixed with `collect_all("open_clip")`
- `uvicorn` selects its HTTP/WebSocket protocol implementations at runtime via `importlib` → fixed with explicit `hiddenimports`
- Local modules (`predictor`, `vocab`, `display`) need `pathex=[BACKEND_DIR]` to be found during analysis

### Why builds use a separate `.venv-build` with CPU-only torch

PyInstaller bundles whichever Python interpreter runs it, plus all packages visible to that interpreter. If the build venv has the **CUDA build of torch** (`torch+cuXXX`), two bad things happen:

1. The bundle balloons by ~1.5 GB because `torch/lib/` ships CUDA binaries (`libtorch_cuda.so`, etc.) and pip pulls in `nvidia-*` packages totalling another ~2.7 GB.
2. CUDA torch hard-links `libcudart.so.12` at import time. Even on a machine with no GPU, the bundled binary fails to start with `OSError: libcudart.so.12: cannot open shared object file` unless we also bundle the multi-GB `nvidia/` libs.

The CPU-only torch wheel (`torch torchvision --index-url https://download.pytorch.org/whl/cpu`) is ~250 MB, has no `libcudart` dependency, and pulls in zero `nvidia-*` packages. So:

- Devs keep CUDA torch in `.venv` for fast local inference.
- `build/build_backend.sh` maintains a separate `.venv-build` with CPU-only torch and runs PyInstaller from there.
- The first run of `build_backend.sh` creates `.venv-build` and installs CPU torch + `requirements.txt` + PyInstaller. Subsequent runs reuse it.

Resulting installer sizes (Linux): AppImage ~370 MB, .deb ~250 MB. Backend bundle ~810 MB unpacked, of which ~630 MB is CPU torch — the floor for PyTorch inference.

The runtime trade-off is no GPU acceleration in shipped binaries. On a modern CPU, BioCLIP v1 inference completes in ~1–2 s/image — well under the NFR-03 budget. Users who want GPU acceleration can run from source.

### Release CI

`.github/workflows/release.yml` skeleton:

```yaml
name: Release
on:
  push:
    tags: ["v*"]

jobs:
  build:
    strategy:
      fail-fast: false
      matrix:
        os: [ubuntu-latest, macos-latest, windows-latest]
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: "20" }
      - uses: actions/setup-python@v5
        with: { python-version: "3.12" }
      - run: npm ci
      # build_backend.sh creates .venv-build with CPU-only torch on first run.
      - run: npm run build:backend
      - run: npm run dist -- --${{ matrix.os == 'ubuntu-latest' && 'linux' || matrix.os == 'macos-latest' && 'mac' || 'win' }}
      - run: bash build/generate_third_party_licenses.sh
      - name: Compute checksums
        run: cd dist/installers && sha256sum * > SHA256SUMS.txt
        shell: bash
      - uses: actions/upload-artifact@v4
        with:
          name: installers-${{ matrix.os }}
          path: |
            dist/installers/*
            THIRD_PARTY_LICENSES.txt

  release:
    needs: build
    runs-on: ubuntu-latest
    steps:
      - uses: actions/download-artifact@v4
      - uses: softprops/action-gh-release@v2
        with:
          files: |
            installers-*/dist/installers/*
            installers-*/THIRD_PARTY_LICENSES.txt
          draft: false
          prerelease: ${{ contains(github.ref, '-') }}
```

A separate `ci.yml` runs lint, typecheck, and tests on every PR. Installer builds only run on tags.

---

## 9. Testing strategy

Three layers, each cheap to run:

1. **Unit tests (most code).** Vitest for TypeScript, pytest for Python. Pure-function pieces — the predictor wrapper, the SQL repo (against an in-memory SQLite), the crop math — should be 100% covered. UI components don't need unit tests beyond the trivially testable bits.

2. **Integration tests (the boundaries).**
   - A test that spawns a stub Python binary, waits for the port file, and verifies the launcher times out gracefully if the binary never writes one. Catches a whole class of platform-specific spawn bugs.
   - A test that hits a real (small) BioCLIP model on a fixture image and asserts the top prediction is sensible. Skipped in PR CI, run nightly.

3. **End-to-end (manual, occasional).** Playwright with `@playwright/test` driving Electron is possible but heavyweight for a solo project. Manual smoke testing of the three critical paths (first launch, identify, save) before each release is enough early on.

---

## 10. What the four critical files look like

A short cheat sheet of where the most-touched code lives:

| File | What lives here | Touched when |
|---|---|---|
| `src/shared/types.ts` | All cross-boundary types | Adding any feature |
| `src/main/ipc-handlers.ts` | Renderer-facing API | Adding any feature |
| `src/main/backend-launcher.ts` | Spawn / port / health logic | Rarely (once it works) |
| `src/backend/predictor.py` | BioCLIP model loading + inference | Model upgrades, perf work |
| `src/backend/vocab.py` | Embeddings I/O + metadata sqlite store | Schema changes, build-script tweaks |
| `src/backend/sources/` | Vernacular-name source adapters (iNat, GBIF, Wikidata) | Adding a new common-name data source |
| `src/backend/scripts/build_metadata.py` | Multi-source common-name merge into species_meta.sqlite | Improving name coverage between releases |
| `src/backend/scripts/fetch_wikidata.py` | Wikidata SPARQL fetcher (network-only, off the build path) | Refreshing `data/wikidata_vernaculars.json` |

If a PR touches any of these four files, the architecture doc should be re-read by the reviewer. Everything else is local change.

---

## 11. Open questions to resolve early

These aren't blockers but they want answers before Phase 2:

- **Image preprocessing parity** — does the renderer's crop produce exactly what BioCLIP's training pipeline expects (resize, normalize, color space)? Verify with reference images from the BioCLIP repo.
- **Model upgrade path** — when BioCLIP 3 ships, what does the migration look like? Probably: new model ID, new embeddings file, old saved sightings keep their `model_used` column for provenance.
- **IUCN status freshness** — the IUCN Red List API can be polled at build time, but assessments change every few years. Decide on a refresh cadence (probably tied to model releases, not user-facing) and document where the cached snapshot lives in the repo.
- **Threshold tuning for low-confidence warning** — the requirements name 0.2 as a starting point, but the right number depends on the species vocabulary size. Calibrate against a small labeled set during Phase 3.

---

This architecture, the strategy, and the requirements together should be enough to start writing code on Monday. The order to read them is reversed from the order they were written: requirements first (what), strategy second (in what order), architecture last (against which contracts). When in doubt, the requirements doc wins — the other two exist to serve it.
