# Wildlife ID — Strategy

Companion to `wildlife-id-requirements-v4.md`. Where the requirements describe *what* the app does, this doc describes *how* to get there: the order of work, where the risk lives, and how to run the project as an open-source effort.

---

## 1. Positioning

**One sentence:** Wildlife ID is an offline desktop app that turns a phone snapshot into a species name in seconds, with a personal collection to keep track of what you've seen.

**Why this exists.** iNaturalist requires an account, an internet connection, and a community workflow. Wildlife ID is a single-purpose tool: drop in a photo, get a name, optionally save it. No login, no upload, no waiting on humans. BioCLIP is now good enough that this is genuinely useful for a casual audience.

**Why open source.** Three things change when this is MIT instead of closed-source:

1. **Trust.** Casual users rarely audit code, but reviewers, journalists, and downstream maintainers do. Open source is the credible answer to "is this app secretly uploading my photos?" — anyone can verify.
2. **Contributions.** The species vocabulary, common name translations, and platform-specific bug fixes scale much better with outside help than with one developer.
3. **Distribution leverage.** Linux package maintainers, conservation orgs, and educators are far more likely to recommend an MIT-licensed tool than a closed one with an EULA.

Trade-off accepted: there is no licensing moat. The sustainability story is the hosted tier (Section 11 of the requirements), not the desktop app itself.

---

## 2. Phasing

Six phases. Each one ends in something demonstrable.

### Phase 0 — Foundations *(week 1–2)*
**Goal:** the three processes talk to each other end-to-end with a placeholder model.

- Repo created, MIT `LICENSE` and skeleton `README.md` in place
- `package.json` with Electron + Vite + React + TypeScript wired up
- Empty Python FastAPI server that responds to `/health`, packaged with a placeholder `predict()` returning a hardcoded species
- Electron main process spawns the Python binary, reads `backend.port`, polls `/health`, opens a window
- Renderer fetches `/health` through a typed IPC bridge and displays "Backend: ok"
- CI: lint + typecheck on every PR (no builds yet)

**Demo:** a window opens that reads "Wildlife ID — backend reports healthy."

This phase has no ML in it on purpose. The plumbing is its own discipline and finishing it first means every subsequent phase has somewhere to render and test.

### Phase 1 — Inference MVP *(week 3–5)*
**Goal:** end-to-end identification with the Fast model.

- Python: `predictor.py` loads BioCLIP v1 via `open_clip` and produces image embeddings
- Build script: `build_embeddings.py` consumes a taxonomy CSV (start with ~5,000 common North American + European species — keeps iteration fast) and produces `species_embeddings.npz`
- `/predict` endpoint accepts a multipart upload, returns top-3
- Renderer Identify tab: file picker → crop step → "Identifying…" spinner → result card with top-3
- First-launch flow: model picker (Fast preselected), download progress, disabled UI during download
- No collection yet; no model switching yet

**Demo:** drag a fox photo onto the app, see "Vulpes vulpes (Red Fox), 87%."

Vocabulary expansion to the full ~30k–50k species comes at the end of this phase, once the pipeline is proven.

### Phase 2 — Persistence *(week 6–7)*
**Goal:** the Collection tab works.

- `better-sqlite3` wired into the Electron main process
- IPC handlers for `sightings.create`, `sightings.list`, `sightings.update`, `sightings.delete`, `sightings.search`
- Cropped images saved under `userData/images/<uuid>.jpg`
- Collection grid view, detail view with editable date/location/comments, delete, search
- Migration framework in place from day one, even if the schema doesn't change yet — retrofitting migrations is painful

**Demo:** identify ten species over a session, restart the app, all of them are still there.

### Phase 3 — Polish *(week 8–9)*
**Goal:** the app stops feeling like a prototype.

- Settings tab: model switcher with download progress, app info, Open Source Licenses screen, "open data folder" button
- Result panel: taxonomy chips (Kingdom / Class / Family) and IUCN conservation status driven by the species vocabulary
- Low-confidence warning UI
- Empty states, error states, network failure handling for the model download
- Accessibility pass: keyboard navigation, focus rings, screen reader labels
- Visual polish to match the Figma/design source

**Demo:** a non-developer can use the app for fifteen minutes without getting confused or hitting a dead-end screen.

### Phase 4 — Distribution *(week 10–11)*
**Goal:** anyone can download and run a release.

- `electron-builder.yml` configured for Win/Mac/Linux
- PyInstaller `--onedir` build script tested on all three platforms
- GitHub Actions matrix workflow on tagged releases (Win runner, Mac runner, Linux runner)
- `THIRD_PARTY_LICENSES.txt` generation script
- SHA-256 checksum generation
- README rewritten as a user-facing landing page with download links, screenshots, and the "bypass Gatekeeper / SmartScreen" note
- v0.1.0 cut

**Demo:** send a friend a link to the GitHub Releases page and they install and run it without help.

### Phase 5 — Community & Iteration *(ongoing)*
**Goal:** the project survives and improves without being a one-person treadmill.

- Public announcement (Hacker News, r/wildlife, r/programming, naturalist forums)
- Triage rotation: bug reports tagged within 48 hours, even if not fixed
- `CONTRIBUTING.md` refined as real PRs come in
- A small triaged backlog of "good first issue" tickets
- Roadmap published in `docs/strategy.md` so contributors know what's wanted vs. out of scope

The temptation in Phase 5 is to chase every feature request. The discipline is to keep the v1 scope tight and route everything else to v2 (mobile + hosted tier).

---

## 3. Risks (and what to do about them)

Listed roughly in order of how likely they are to hurt the timeline.

### R1 — Bundle size blows past 400 MB
PyTorch + open_clip + the Python runtime alone are heavy. PyInstaller-bundled distributions of similar apps run 300–500 MB before any model weights.

**Mitigation:**
- Verify bundle size in Phase 0 with a stub Python app, not Phase 4 when it's too late to react
- If over budget, consider `torch` CPU-only wheels (much smaller than CUDA-enabled), and exclude unused PyTorch submodules
- Worst case: relax NFR-07 to ≤ 600 MB and document why

### R2 — BioCLIP v1 vs v2 have different interfaces
Switching models in Settings assumes both load through the same code path. If v2 needs different preprocessing or has different embedding dimensionality, the embeddings file becomes model-specific.

**Mitigation:**
- Build embeddings *per model* — `species_embeddings_v1.npz` and `species_embeddings_v2.npz` — from the start. Don't try to share one file.
- Verify both models load via `open_clip` with the same API in Phase 1, before building UI around model switching.

### R3 — macOS Gatekeeper friction kills first-time conversion
The `xattr` workaround is a real adoption tax. A fraction of users will give up at the "app is damaged" dialog.

**Mitigation:**
- Document the workaround prominently in the README, with a screenshot of exactly what to click
- Keep an open issue tracking signed-build sponsorship — a path for someone to fund it
- Accept the loss for now; revisit if downloads plateau

### R4 — Cross-platform testing without three machines
A solo developer typically only has one or two of Windows/macOS/Linux. Bugs that only surface on the platform you don't own will ship.

**Mitigation:**
- GitHub Actions runners cover the build path. Make the CI matrix robust early.
- For runtime testing, free-tier services like BrowserStack are not ideal but workable; alternately, Phase 4 can include a "beta tester" call to people on each platform before v0.1.0.
- Lean on the issue tracker — early users on missing platforms become unpaid QA.

### R5 — Species vocabulary curation is bigger than expected
Pulling 30k–50k species from iNaturalist is the easy part. Curating common names, translating them, and handling synonyms is endless.

**Mitigation:**
- Ship v0.1.0 with scientific names always, common names where iNaturalist provides them, and skip the rest
- Make the vocabulary CSV a contributor-friendly file so common-name PRs are easy to accept
- Treat translation as a Phase 5+ concern — don't block v1 on it

### R6 — Solo maintainer burnout
Open source attracts demands. Even a small project gets feature requests, "is this dead?" comments, and entitled bug reports.

**Mitigation:**
- Publish a clear scope document (this file). When something is out of scope, link to it instead of explaining.
- Set explicit response-time expectations in `README.md` ("I respond to issues within ~7 days") rather than implying real-time availability.
- Use GitHub Discussions for feature requests — keeps the issue tracker focused on bugs.

---

## 4. Open-source operating model

### Versioning
Semantic versioning (`MAJOR.MINOR.PATCH`). v0.x while the schema and IPC contract are still moving; v1.0.0 once the data model is committed to.

### Branching
- `main` is always releasable
- Feature work in topic branches, merged via PR
- No long-lived develop branch — keeps the model simple

### Releases
Tag a commit on `main` (e.g., `v0.2.0`). The `release.yml` workflow builds installers and creates the GitHub Release automatically. Drafts are not used; tags are not pushed until the maintainer is ready to ship.

### Conventional commits
Use a light version: `feat:`, `fix:`, `docs:`, `chore:`, `refactor:` prefixes. Helpful for the changelog and easy to enforce with a commit-msg hook, but not worth a strict CI gate that blocks contributors.

### Issue triage
Three labels worth using from day one:
- `good first issue` — small, well-scoped, no architectural decisions required
- `help wanted` — known to be needed, larger than `good first issue`, maintainer welcomes outside ownership
- `out of scope` — closed with a link to this doc and an apology for not being a fit

### CI gates
PRs must pass:
1. Lint (eslint, ruff)
2. Typecheck (tsc, mypy)
3. Unit tests (vitest, pytest)

Build CI runs on `main` after merge to catch platform-specific build breakage. Keeping it off PRs (where possible) means contributors get fast feedback.

### Documentation that pays off
In rough order of return-on-effort:

1. `README.md` — the only doc most users read. Download link, screenshot, three-line install.
2. `CONTRIBUTING.md` — five-minute path from `git clone` to a running dev build. If this takes longer than five minutes, the contributor pool shrinks dramatically.
3. `docs/architecture.md` — the companion architecture doc, referenced from PRs touching cross-cutting concerns.
4. Code comments — only where the *why* isn't obvious from the *what*.

---

## 5. Decisions to commit to now

A few choices that are easy to defer but get expensive to revisit:

| Decision | Choice | Why |
|---|---|---|
| UI library | **None — hand-authored SCSS modules** | User is hand-writing components from a design source. No Tailwind, no shadcn, no CSS-in-JS. |
| State management | **React Context + custom hooks** | Redux is overkill for this app's surface area |
| Build tool (renderer) | **Vite** | Already in v3 architecture; fast HMR |
| Build tool (main) | **`tsc` directly** (not Vite) | Main process has no bundle benefit from Vite; tsc is simpler |
| Test runner (TS) | **Vitest** | Compatible with Vite, good DX |
| Test runner (Python) | **pytest** | Standard |
| Linter (TS) | **ESLint + Prettier** | Industry default |
| Linter (Python) | **ruff + black** | Fastest of the modern options |
| Logging | **electron-log** in main, **stdlib logging** in Python, both writing to `userData/logs/` | Single log location per platform |
| Telemetry | **None.** Local-only. | Open-source app for a privacy-sensitive use case. Don't phone home. |

The "no telemetry" choice is worth being explicit about. It costs visibility into how many people use the app, but it's the right answer for the positioning ("verifiable that we don't upload your photos"). If usage signals become important later, an opt-in mechanism with crystal-clear consent is the only acceptable path.

---

## 6. What to build first, concretely

If you're sitting down at the keyboard right now:

1. `git init`, `npm init`, MIT `LICENSE` file (template from <https://choosealicense.com/licenses/mit/>), placeholder `README.md`
2. `npm install --save-dev electron vite typescript @types/node electron-builder`
3. `mkdir src/main src/renderer src/backend` and set up the three skeletons
4. The `backend-launcher.ts` and `backend.port` handshake — this is the single most failure-prone piece of the architecture and deserves to be the first thing that works
5. The `/health` round-trip from renderer through IPC to Python and back

Once those five steps work, every subsequent feature is incremental. The hard architectural surface is the spawn-and-port-discovery dance; once it's solved, ML and UI are both well-trodden ground.

The architecture doc (next file) goes deeper on the IPC contract, the spawn lifecycle, and the directory layout for caches and stores — read that before writing the launcher.
