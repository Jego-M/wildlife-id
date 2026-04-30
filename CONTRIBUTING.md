# Contributing to Wildlife ID

## Dev environment setup

**Prerequisites:** Node.js 20+, Python 3.12, git.

```bash
git clone https://github.com/your-org/wildlife-id
cd wildlife-id
npm install
```

Create a Python virtualenv and install backend dependencies:

```bash
python3 -m venv .venv
.venv/bin/pip install -r src/backend/requirements.txt
```

Install PyTorch separately with the right backend for your machine:

```bash
# NVIDIA GPU (recommended if available):
.venv/bin/pip install torch torchvision --index-url https://download.pytorch.org/whl/cu121

# CPU-only (smaller download, ~2× slower inference):
.venv/bin/pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu

# macOS (Apple Silicon MPS included automatically):
.venv/bin/pip install torch torchvision
```

Start the dev server:

```bash
npm run dev
```

This starts Vite (renderer), `tsc --watch` (main process), and the Python backend directly from source. The dev backend is not PyInstaller-bundled — it runs straight from `.venv`, so iteration is fast.

---

## Building installers

Production builds require all three pieces to be built in order, then packaged.

### 1. Python backend

```bash
npm run build:backend
```

This runs `build/build_backend.sh`, which:

1. Creates `.venv-build/` if it doesn't exist (separate from your dev `.venv`)
2. Installs **CPU-only torch** + `requirements.txt` + PyInstaller into it on first run
3. Detects if `.venv-build/` somehow ended up with a CUDA torch build and reinstalls CPU-only if so
4. Runs PyInstaller using `build/wildlife_backend.spec` — a maintained spec file checked into the repo

**Why a separate `.venv-build/` with CPU-only torch?**
Your dev `.venv` likely has CUDA torch (`torch+cu121`) for fast local inference. If you bundle that with PyInstaller, two bad things happen: the bundle balloons to ~1.6 GB and the binary crashes at startup with `OSError: libcudart.so.12: cannot open shared object file` on any machine without CUDA. CPU-only torch is ~250 MB, has no CUDA dependency, and the resulting bundle just works everywhere. Shipped binaries still run inference at ~1–2 s/image on a modern CPU.

To force a clean rebuild of the build venv: `rm -rf .venv-build`.

**What the spec does** that PyInstaller's auto-generated spec does not:
- Adds `src/backend/` to `pathex` so local modules (`predictor`, `vocab`, `display`) are found
- Calls `collect_all("open_clip")` to include the BPE tokenizer vocab and model config JSONs
- Adds hidden imports for `uvicorn`'s HTTP/WebSocket protocol handlers (loaded at runtime via `importlib`)

Output: `dist/backend/wildlife_backend/` (~810 MB unpacked, of which ~630 MB is CPU torch).

### 2. Renderer and main process

```bash
npm run build
```

Runs `vite build` (renderer → `dist/renderer/`) and `tsc` (main process → `dist/main/`).

### 3. Package with electron-builder

```bash
# Linux (AppImage + .deb):
npm run dist -- --linux

# macOS:
npm run dist -- --mac

# Windows:
npm run dist -- --win
```

`npm run dist` calls `npm run build` internally, so steps 2 and 3 can be merged if you've already built the backend. Config lives in `build/electron-builder.yml`.

Output lands in `dist/installers/`.

### All-in-one (Linux)

```bash
npm run build:backend && npm run dist -- --linux
```

---

## Typical installer sizes (Linux)

| Format | Approx size |
|--------|-------------|
| AppImage | ~370 MB |
| .deb | ~250 MB |

The bulk is CPU torch (~630 MB unpacked, ~200 MB compressed). That's the floor for PyTorch inference on all hardware without a CUDA dependency.

---

## Code style

- **TypeScript:** strict mode, no `any`. Run `npm run typecheck` before pushing.
- **Python:** black-formatted, ruff-linted. Run `npm run lint:backend`.
- **CSS:** SCSS modules per component, BEM class names, design tokens from `docs/design-system.md`. No Tailwind, no shadcn.
- **Commits:** conventional prefixes — `feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `test:`.

Full lint + typecheck:

```bash
npm run lint && npm run typecheck
```

Tests:

```bash
npm run test          # vitest (TypeScript)
npm run test:backend  # pytest (Python)
```

---

## Adding a new IPC method

Four-step rule — touch all four or the types and implementation will diverge:

1. Add types to `src/shared/types.ts`
2. Add the method to `src/main/preload.ts`
3. Add the handler in `src/main/ipc-handlers.ts`
4. Call it from the renderer via `window.api`

## Frontend changes

The renderer markup and SCSS are hand-authored from a design source in `docs/design/`. Do not modify `src/renderer/**/*.scss` or the layout/markup of `src/renderer/**/*.tsx` without checking with the maintainer first. Logic, hooks, state, and IPC calls in renderer components are fair game.
