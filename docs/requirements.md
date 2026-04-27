# Wildlife ID — Requirements & Architecture (v4)

A cross-platform desktop application that lets anyone upload a photo of an animal and find out what species it is, powered by the open-source BioCLIP model. All inference runs locally after a one-time model download.

> **Changes from v3:** Project re-licensed as open source (MIT). GitHub distribution consolidated to a single public repository. Project structure updated for OSS conventions (LICENSE, CONTRIBUTING.md, issue templates). Section 13 rewritten. EULA removed. All other sections unchanged.

---

## 1. Goals

- **Target user:** Casual wildlife enthusiasts — no scientific background required
- **Core value:** One-click species identification from a phone or camera photo, with a personal collection to save and annotate findings
- **Distribution:** Single installer per platform (Windows, macOS, Linux), published on GitHub Releases. Model weights download on first launch.
- **License:** MIT. Hosted as a single public repository on GitHub.

---

## 2. Functional Requirements

### 2.1 First-Launch Flow

| # | Requirement |
|---|---|
| FR-00a | On first launch, the user sees a welcome screen and chooses a model: **Fast** (BioCLIP v1, ~600 MB, ~1–2 s/image) or **Accurate** (BioCLIP 2, ~1.7 GB, ~3–6 s/image). Fast is pre-selected as the default. |
| FR-00b | The chosen model downloads with a visible progress bar. The UI is disabled until the download succeeds and the backend reports healthy. |
| FR-00c | The user can change their model later in Settings. Switching triggers a download of the other model if it isn't already cached. |

### 2.2 Identify Tab

| # | Requirement |
|---|---|
| FR-01 | User can upload an image via drag-and-drop or a file picker (JPEG, PNG, WEBP, TIFF) |
| FR-02 | After upload, the user is **always** shown a crop step: the full image with a draggable/resizable crop rectangle, pre-set to the full image. User can adjust or tap "Identify" to use as-is. |
| FR-03 | App displays a loading indicator while inference is running |
| FR-04 | App displays the top predicted species: scientific name, common name (where available), and a confidence score |
| FR-05 | App displays the top 3 candidate species so the user can pick a different one if the top match is wrong |
| FR-06 | App displays a low-confidence warning if the top match falls below a configurable threshold (e.g. cosine similarity < 0.2) suggesting the user try a tighter crop |
| FR-07 | User can save the result (with the cropped image) to their Collection with one click |
| FR-08 | The result view shows top-level taxonomy chips (Kingdom, Class, Family) and the species' IUCN Red List conservation status when available. These come from the species vocabulary built into the backend — no internet required. |

### 2.3 Collection Tab

| # | Requirement |
|---|---|
| FR-09 | Displays all previously saved detections as a scrollable grid of cards (thumbnail + species name) |
| FR-10 | User can open a detail view for any saved entry |
| FR-11 | In the detail view, the user can add or edit: **Date observed**, **Location** (free text), **Comments** (free text) |
| FR-12 | User can delete an entry from their collection |
| FR-13 | User can filter/search the collection by species name or common name |
| FR-14 | Collection data persists between app sessions (local SQLite database) |
| FR-15 | Cropped thumbnail images are stored locally alongside the database |

### 2.4 Settings Tab

| # | Requirement |
|---|---|
| FR-16 | User can switch between Fast (BioCLIP v1) and Accurate (BioCLIP 2) models. Current model is shown clearly. |
| FR-17 | User can see the app version, model version, and an "Open Source Licenses" screen listing all bundled open-source dependencies and their license texts (including the project's own MIT license) |
| FR-18 | User can open the folder where the database and images are stored (useful for backup) |

### 2.5 General

| # | Requirement |
|---|---|
| FR-19 | App works fully offline after first-launch model download |
| FR-20 | App is usable without any configuration or command-line interaction |

---

## 3. Non-Functional Requirements

| # | Requirement |
|---|---|
| NFR-01 | Runs on Windows 10+, macOS 12+, and mainstream Linux distros (Ubuntu 22.04+) |
| NFR-02 | Single installer per platform — no Node.js, Python, or other runtimes need to be pre-installed |
| NFR-03 | Minimum 8 GB RAM. On a modern CPU-only laptop, BioCLIP v1 inference completes within 5 seconds per image; BioCLIP 2 within 15 seconds |
| NFR-04 | NVIDIA CUDA GPU acceleration used automatically when available. Apple Silicon MPS and AMD ROCm are best-effort — may fall back to CPU. |
| NFR-05 | App startup time under 5 seconds on a modern machine (after first launch) |
| NFR-06 | Collection supports at least 10,000 entries without performance degradation |
| NFR-07 | Installer size per platform ≤ 400 MB. Model weights download separately on first launch. |

---

## 4. Architecture Overview

```
┌───────────────────────────────────────────────────────────┐
│        Electron App (Chromium renderer + Node main)       │
│                                                           │
│  ┌──────────────────────────────────────────────────┐    │
│  │        React + TypeScript (Vite) UI              │    │
│  │                                                  │    │
│  │  ┌──────────┐  ┌───────────┐  ┌──────────────┐  │    │
│  │  │ Identify │  │ Collection│  │ Settings     │  │    │
│  │  │ (upload, │  │ (grid,    │  │ (model       │  │    │
│  │  │  crop,   │  │  detail,  │  │  picker,     │  │    │
│  │  │  result) │  │  notes)   │  │  app info)   │  │    │
│  │  └──────────┘  └───────────┘  └──────────────┘  │    │
│  └──────────────────────────────────────────────────┘    │
│                         │ IPC                             │
│  ┌──────────────────────▼───────────────────────────┐    │
│  │       Electron main process (Node.js)            │    │
│  │   - spawns & supervises Python backend           │    │
│  │   - better-sqlite3 (collection CRUD)             │    │
│  │   - file I/O (image store, model cache)          │    │
│  └──────────────────────┬───────────────────────────┘    │
└─────────────────────────┼─────────────────────────────────┘
                          │ HTTP (localhost, dynamic port)
                 ┌────────▼─────────────┐
                 │  Python Backend      │
                 │  (FastAPI)           │
                 │                      │
                 │  GET  /health        │
                 │  GET  /models        │
                 │  POST /select_model  │
                 │  POST /predict       │
                 │                      │
                 │  BioCLIP via         │
                 │  open_clip + PyTorch │
                 └──────────────────────┘
```

### Component Responsibilities

| Component | Technology | Responsibility |
|---|---|---|
| **Renderer (UI)** | React + TypeScript, Vite, hand-authored SCSS modules | All user interaction, display, navigation, crop tool |
| **Main process** | Electron + Node.js | Window management, spawning Python, IPC bridge to renderer, database, filesystem |
| **Database layer** | `better-sqlite3` | Synchronous SQLite CRUD for the collection |
| **Python Backend** | FastAPI + open_clip + BioCLIP | Runs inference, serves predictions, manages model switching |
| **Image Store** | Local filesystem (under `app.getPath('userData')`) | Stores cropped images for saved sightings |
| **Species Embeddings** | Pre-computed `.npz` file shipped with backend | Text embeddings for the species vocabulary, computed once at build time |

---

## 5. Python Backend API

The backend is a lightweight FastAPI server bundled with the app. The Electron main process spawns it on app launch and terminates it on quit. The backend binds to `127.0.0.1` on a **dynamically chosen free port**, written to a small file (`backend.port` in the userData directory) that the Electron main process reads on startup — avoiding any risk of conflicts with other apps.

### Endpoints

#### `GET /health`
Returns `200 OK` when the backend is ready and a model is loaded.
```json
{ "status": "ok", "active_model": "bioclip-v1" }
```

#### `GET /models`
Returns available models and which is active.
```json
{
  "active": "bioclip-v1",
  "available": [
    { "id": "bioclip-v1", "name": "Fast", "size_mb": 600, "downloaded": true },
    { "id": "bioclip-v2", "name": "Accurate", "size_mb": 1700, "downloaded": false }
  ]
}
```

#### `POST /select_model`
Switches active model. Downloads weights if not already cached. Streams progress via Server-Sent Events.
```
{ "model_id": "bioclip-v2" }
```

#### `POST /predict`
Accepts a multipart image upload (already cropped by the UI).

**Request**
```
Content-Type: multipart/form-data
Fields:
  - image: <file>        (already cropped to user's selection)
  - top_k: 3             (optional, default 3)
```

**Response**
```json
{
  "model_used": "bioclip-v1",
  "predictions": [
    {
      "scientific_name": "Vulpes vulpes",
      "common_name": "Red Fox",
      "taxonomy": ["Animalia","Chordata","Mammalia","Carnivora","Canidae","Vulpes","Vulpes vulpes"],
      "iucn_status": "Least Concern",
      "confidence": 0.87
    },
    {
      "scientific_name": "Vulpes lagopus",
      "common_name": "Arctic Fox",
      "taxonomy": ["Animalia","Chordata","Mammalia","Carnivora","Canidae","Vulpes","Vulpes lagopus"],
      "iucn_status": "Least Concern",
      "confidence": 0.06
    },
    {
      "scientific_name": "Canis latrans",
      "common_name": "Coyote",
      "taxonomy": ["Animalia","Chordata","Mammalia","Carnivora","Canidae","Canis","Canis latrans"],
      "iucn_status": "Least Concern",
      "confidence": 0.03
    }
  ]
}
```

`iucn_status` is nullable — not every species in the vocabulary has an IUCN assessment. When present, values are the standard Red List categories: `"Least Concern"`, `"Near Threatened"`, `"Vulnerable"`, `"Endangered"`, `"Critically Endangered"`, `"Extinct in the Wild"`, `"Extinct"`, `"Data Deficient"`, `"Not Evaluated"`.

Confidence is the softmax of cosine similarities over the species vocabulary. The UI surfaces a low-confidence warning if the top value is below ~0.2 (tunable).

---

## 6. Species Vocabulary

BioCLIP is a zero-shot classifier: it doesn't have a fixed output class list. The backend ships with a pre-computed species vocabulary (scientific names + common names + taxonomy) and their BioCLIP text embeddings. At inference time, the backend:

1. Encodes the cropped image via BioCLIP's image encoder (~1–5 s)
2. Computes cosine similarity against every species embedding (fast: matrix multiply)
3. Returns top-k matches

For v1, the vocabulary covers **animals only** — interpreted broadly to include all metazoans except plants and fungi. Concretely: mammals, birds, reptiles, amphibians, fish, insects, arachnids, other common arthropods, mollusks, and other invertebrates — roughly 30,000–50,000 species drawn from the iNaturalist taxonomy. This keeps the embeddings file small (~100–150 MB) and focuses on what casual users actually photograph. Plants and fungi are a natural v2 expansion.

Each species entry in the vocabulary carries: scientific name, common name(s), full taxonomy, and IUCN Red List conservation status (where the species has been assessed). The IUCN status is folded in at build time from a cached snapshot of the IUCN Red List API — no runtime network calls.

The embeddings are generated once during the build process (not at user runtime) and shipped inside the backend binary. The build script and the source taxonomy list are part of the open-source repo so any contributor can reproduce or extend the vocabulary.

---

## 7. Data Model (SQLite)

```sql
CREATE TABLE Sightings (
    Id             INTEGER PRIMARY KEY AUTOINCREMENT,
    ScientificName TEXT NOT NULL,
    CommonName     TEXT,
    Confidence     REAL NOT NULL,
    ImagePath      TEXT NOT NULL,       -- path to cropped image on disk
    ModelUsed      TEXT NOT NULL,       -- "bioclip-v1" or "bioclip-v2"
    DateObserved   TEXT,                -- user-entered, free text
    Location       TEXT,                -- user-entered, free text
    Comments       TEXT,                -- user-entered, free text
    CreatedAt      TEXT NOT NULL        -- ISO 8601 timestamp
);

CREATE INDEX idx_sightings_scientific_name ON Sightings(ScientificName);
CREATE INDEX idx_sightings_common_name     ON Sightings(CommonName);
```

Accessed via `better-sqlite3` in the Electron main process. The renderer calls into the database via IPC — never directly.

---

## 8. Project Structure

```
wildlife-id/
├── .github/
│   ├── ISSUE_TEMPLATE/
│   │   ├── bug_report.md
│   │   └── feature_request.md
│   ├── workflows/
│   │   ├── ci.yml                      # tests + lint on every PR
│   │   └── release.yml                 # builds + attaches installers on tagged releases
│   └── PULL_REQUEST_TEMPLATE.md
│
├── src/
│   ├── main/                           # Electron main process (Node.js + TS)
│   │   ├── index.ts                    # app entry, window creation
│   │   ├── backend-launcher.ts         # spawns/supervises Python, reads port file
│   │   ├── database.ts                 # better-sqlite3 wrapper
│   │   ├── ipc-handlers.ts             # renderer ↔ main bridge
│   │   └── preload.ts                  # secure contextBridge API
│   │
│   ├── renderer/                       # React + TypeScript UI (Vite)
│   │   ├── main.tsx                    # React entry
│   │   ├── App.tsx
│   │   ├── pages/
│   │   │   ├── Welcome.tsx             # first-launch, model picker
│   │   │   ├── Identify.tsx            # upload + crop + result
│   │   │   ├── Crop.tsx                # always-shown crop step
│   │   │   ├── Collection.tsx
│   │   │   └── Settings.tsx
│   │   ├── components/
│   │   │   ├── CropTool.tsx
│   │   │   ├── SpeciesCard.tsx
│   │   │   └── ...
│   │   ├── lib/
│   │   │   ├── api.ts                  # typed wrapper around preload API
│   │   │   └── types.ts
│   │   └── styles/
│   │
│   └── backend/                        # Python FastAPI project
│       ├── main.py                     # FastAPI app, endpoints
│       ├── predictor.py                # BioCLIP wrapper (open_clip)
│       ├── embeddings/
│       │   └── species_embeddings.npz  # pre-computed, ~100–150 MB
│       ├── scripts/
│       │   └── build_embeddings.py     # reproducibly regenerates the embeddings
│       └── requirements.txt
│
├── build/
│   ├── build_backend.sh                # PyInstaller --onedir
│   ├── electron-builder.yml            # installer configuration
│   └── generate_third_party_licenses.sh # produces THIRD_PARTY_LICENSES.txt
│
├── docs/
│   ├── requirements.md                 # this document
│   ├── strategy.md                     # roadmap and execution plan
│   ├── architecture.md                 # technical contracts deep-dive
│   ├── design-system.md                # tokens, fonts, layout patterns
│   └── design/                         # original Claude Design handoff source
│       ├── README.md
│       ├── Wildlife ID.html
│       └── *.jsx                       # reference only, never imported by build
│
├── assets/
│   └── icon.png
│
├── LICENSE                             # full MIT license text
├── CONTRIBUTING.md                     # dev setup, code style, PR process
├── CODE_OF_CONDUCT.md                  # Contributor Covenant
├── CHANGELOG.md
├── README.md
├── package.json
├── vite.config.ts
└── tsconfig.json
```

---

## 9. Build & Distribution

### Python Backend

PyInstaller in `--onedir` mode (not `--onefile` — onefile cold-starts are slow because everything unpacks on every launch):

```bash
pyinstaller --onedir --name wildlife_backend main.py \
  --add-data "embeddings/species_embeddings.npz:embeddings"
```

The resulting directory (binary + shared libs) is placed inside the Electron app's `resources/` folder so it ships together. **Model weights are NOT bundled** — they download on first launch.

### Electron Frontend

Build with **electron-builder**, which produces a native installer per platform from a single config file:

```bash
npm run build           # Vite builds renderer, tsc compiles main process
npm run dist -- --win   # produces .exe installer
npm run dist -- --mac   # produces .dmg
npm run dist -- --linux # produces .AppImage
```

`electron-builder` automatically bundles the Node runtime, Chromium, and the compiled app code. The Python backend directory is included via the `extraResources` key in `electron-builder.yml`.

### Third-Party License Bundling

Even though the project itself is MIT, the bundled dependencies retain their own licenses, and the redistributed binary must ship those texts. Automated via two tools:

```bash
npx license-checker --production --json > npm_licenses.json
pip-licenses --format=json > python_licenses.json
# Merge + format into THIRD_PARTY_LICENSES.txt, prepended with the project's own LICENSE.
```

The resulting file is bundled with the app and rendered in the Settings → Open Source Licenses screen (FR-17).

### Unsigned Distribution

This project ships unsigned binaries to keep the project free of paid developer programs. Users will encounter the following on first launch, which must be clearly documented in the README and on the download page:

- **macOS:** Gatekeeper will block the app with "cannot be opened because the developer cannot be verified" (or "app is damaged" on stricter configurations). Users bypass this by right-clicking the app → Open → Open, or via `xattr -d com.apple.quarantine /Applications/WildlifeId.app` in Terminal. This only needs to be done once.
- **Windows:** SmartScreen will show a blue "Windows protected your PC" screen. Users click "More info" → "Run anyway." May also need "Unblock" in the .exe file properties.
- **Linux:** No warning; users just `chmod +x` the AppImage and run it.

Accept this as a known rough edge and document it plainly. If the project gains traction and the warnings become an adoption blocker, code signing can be funded via GitHub Sponsors and added later without any architectural changes.

### GitHub Distribution

Single public repository under the MIT license: **`wildlife-id`**. All source code, build scripts, CI workflows, documentation, and releases live in one place — no separate "releases-only" repo.

On every tagged release (e.g., `v0.3.0`), a GitHub Actions workflow:

1. Builds installers for all three platforms in parallel (Windows runner, macOS runner, Linux runner)
2. Generates `THIRD_PARTY_LICENSES.txt`
3. Computes SHA-256 checksums for each installer
4. Attaches the installers, licenses file, and checksums to the GitHub Release for that tag

The repo's `README.md` is the user-facing landing page: download links to the latest release, screenshots, install instructions, the "here's how to bypass Gatekeeper / SmartScreen" notes, and a contribution invitation.

Standard open-source repo files:

- `LICENSE` — full MIT text
- `CONTRIBUTING.md` — dev environment setup, code style, PR process
- `CODE_OF_CONDUCT.md` — Contributor Covenant 2.1
- `.github/ISSUE_TEMPLATE/` — bug report and feature request templates
- `.github/workflows/` — CI for builds, tests, and releases
- `CHANGELOG.md` — maintained per release

Checksums matter especially given the unsigned-binary caveat: a user who wants to verify a download was not tampered with should be able to run a single command and compare the output.

---

## 10. First-Launch Experience

1. App opens and shows a welcome screen with a short description of what the app does and a link to the project's GitHub repo
2. User is presented with the model picker: **Fast** (default) or **Accurate**, with size and speed trade-offs shown
3. Electron main process spawns the bundled Python binary, which picks a free port and writes it to `backend.port`
4. Main process polls `GET /health` every 500 ms (with a spinner in the renderer)
5. Backend downloads the selected BioCLIP weights from Hugging Face with a progress bar (~600 MB or ~1.7 GB)
6. Once healthy, the Identify tab becomes active
7. On subsequent launches, weights are cached locally and startup is under 5 seconds

---

## 11. Future Architecture (Mobile + Server Tier)

The v1 desktop app is designed so that the inference backend can be lifted into a hosted service with minimal changes. This unlocks a mobile app that shares no model code with the desktop version but shares the same API shape.

```
┌──────────────────────┐            ┌──────────────────────┐
│  Desktop App (v1)    │            │  Mobile App (v2)     │
│  Electron + React    │            │  React Native        │
│                      │            │                      │
│  Local Python        │            │  No local model      │
│  backend             │            │                      │
│                      │            │                      │
└──────────┬───────────┘            └──────────┬───────────┘
           │                                    │
           │  localhost                         │  HTTPS
           │                                    │
           ▼                                    ▼
┌──────────────────────┐            ┌──────────────────────┐
│  FastAPI backend     │            │  Hosted FastAPI      │
│  (bundled, offline)  │  ◄────────►│  backend (same code) │
│                      │   shared    │                      │
│                      │   code      │  + auth middleware   │
│                      │             │  + rate limiting     │
│                      │             │  + usage tracking    │
└──────────────────────┘            └──────────┬───────────┘
                                                │
                                      ┌─────────▼──────────┐
                                      │  Billing / auth    │
                                      │  (Stripe + simple  │
                                      │   user DB)         │
                                      └────────────────────┘
```

**Key design choices that make this future possible:**

- **Same FastAPI service runs in both contexts.** Local deployment for the desktop app, containerized deployment (e.g., Fly.io, Railway, or a GPU VM) for the hosted service. Only the auth/rate-limit middleware differs.
- **API contract is stable.** The `/predict` endpoint used by the desktop app is exactly what the mobile app will call — just with an `Authorization: Bearer <token>` header added in the hosted case.
- **Free vs. paid tier on mobile.** Free users get a daily quota of predictions; paid subscribers get unlimited. Enforced via auth middleware and a usage counter keyed on user ID.
- **Mobile app is a separate codebase.** React Native with its own UI and auth flow. It does *not* share code with the Electron renderer — but developers familiar with React translate easily.

This tier isn't being built in v1, but nothing in v1 should make it harder to add later.

---

## 12. Out of Scope (v1)

- Batch processing of multiple images
- User accounts or cloud sync
- Map view for sighting locations
- Camera/webcam live capture
- Export to CSV or iNaturalist
- Mobile app (planned — see Future Architecture)
- Hosted inference server (planned — see Future Architecture)
- **Geographic filtering (geofencing)** — BioCLIP doesn't ship with this; add in v2 using GBIF occurrence data or a country→species lookup table
- **Automatic animal detection and cropping** — out-of-the-box behaviour relies on the user's crop. v2 could add MegaDetector (~280 MB) as an optional preprocessor for wide shots where the animal is small
- **Plants and fungi** — v1 covers animals only to keep the species vocabulary focused. v2 can expand by re-running the embedding build with a broader taxonomy
- **History tab and Field guide tab** — visible as placeholders in the design handoff. The v1 sidebar shows only Identify, Collection, and Settings. History (chronological log distinct from the Collection's manual saves) and Field guide (offline browsable taxonomy reference) are v2 features — do not render disabled menu entries for them in v1, just omit them.

---

## 13. License

This project is **open source** under the **MIT License**.

- Full source code is hosted publicly on GitHub
- Installers are distributed for free from the project's GitHub Releases page
- Anyone is free to use, modify, fork, and redistribute the code under the MIT terms
- All bundled open-source dependencies retain their original licenses, displayed in Settings → Open Source Licenses (FR-17). The project's own MIT license is also included.

### Dependency License Compatibility

All planned dependencies are compatible with MIT redistribution:

| Dependency | License | MIT-compatible |
|---|---|---|
| BioCLIP | MIT | ✅ |
| PyTorch | BSD-3-Clause | ✅ |
| open_clip | MIT | ✅ |
| FastAPI | MIT | ✅ |
| Electron | MIT | ✅ |
| React | MIT | ✅ |
| better-sqlite3 | MIT | ✅ |
| Vite | MIT | ✅ |

When adding new dependencies, prefer permissive licenses (MIT, BSD, Apache-2.0). GPL/AGPL dependencies are best avoided since they would force the entire project to inherit copyleft terms — incompatible with the goal of unrestricted reuse.

### Future Sustainability Paths

Open source doesn't preclude monetization — the architecture leaves several options open without relicensing the core app:

- **Hosted inference tier** (Section 11): a paid SaaS that runs the same FastAPI backend. The desktop app remains free; the hosted service generates revenue. This is the most common pattern for sustainable OSS.
- **GitHub Sponsors** for direct community funding
- **Optional premium plugins** distributed separately under different licenses (e.g., a paid integration with a commercial wildlife database)
- **Code signing donations**: once warranted, sponsors can fund Apple/Microsoft developer accounts to remove the unsigned-binary friction (Section 9)

None of these require relicensing the core app or any architectural rework.
