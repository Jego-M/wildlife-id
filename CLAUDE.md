Wildlife ID — Project Memory
A cross-platform desktop app (Electron + Python FastAPI backend) that identifies animal species from photos using BioCLIP. MIT-licensed open source.
Full project context lives in the docs/ folder — read these for any non-trivial change:

@docs/requirements.md — what the app does
@docs/strategy.md — phasing, risks, and execution plan
@docs/architecture.md — concrete contracts, lifecycles, and code skeletons
@docs/design-system.md — design tokens, fonts, layout, component anatomy
docs/design/ — original Claude Design handoff (HTML + JSX). Reference for visuals, never imported by the build.

Update the documents whenever a big change happens.

Stack

Renderer: React + TypeScript, Vite, hand-authored SCSS modules (no Tailwind, no shadcn, no CSS-in-JS)
Main: Electron + Node.js, better-sqlite3.
Backend: Python 3.11 + FastAPI + open_clip + BioCLIP
Build: electron-builder + PyInstaller (--onedir)

Scope split between human and Claude
The frontend is being hand-authored by the human by translating a design source into SCSS and TSX. This is the most important rule in this file:

Do not modify files in src/renderer/**/*.scss or the layout/markup of src/renderer/**/*.tsx unless explicitly asked.
You may add IPC calls, hooks, types, state, and non-visual logic to existing renderer components when asked, but keep the visual structure and class names intact.
You should propose, but not apply, changes to renderer styling. Show a diff in chat first.

The backend, main process, build pipeline, CI workflows, scripts, and tests are fair game.
Conventions

TypeScript strict mode. No any — prefer unknown with a type guard.
All cross-process types live in src/shared/types.ts. The renderer must never import from src/main/ or src/backend/ directly — only through window.api (defined in src/main/preload.ts).
IPC: every handler is async, every payload is typed. Adding an IPC method is a four-step rule: types → preload → handler → caller.
SCSS: one .module.scss file per component, BEM-style class names. Keep selectors flat — no deep nesting beyond two levels. Use the design tokens from docs/design-system.md (colors as CSS custom properties, fonts: Inter / Fraunces / JetBrains Mono).
Logging: electron-log in main, stdlib logging in Python. Never console.log in committed code.
Python: black-formatted, ruff-linted, type-hinted. pytest for tests.
Commits: conventional commit prefixes (feat:, fix:, docs:, chore:, refactor:, test:).

Critical files
If a change touches any of these, re-read docs/architecture.md first:

src/shared/types.ts — cross-boundary types
src/main/ipc-handlers.ts — renderer-facing API surface
src/main/backend-launcher.ts — Python spawn / port file / health check
src/backend/predictor.py — BioCLIP loading and inference

Commands
npm run dev              # start Vite, tsc --watch (main), and dev Python backend
npm run build            # full production build (renderer, main, backend)
npm run test             # vitest + pytest
npm run lint             # eslint + ruff
npm run typecheck        # tsc --noEmit + mypy
npm run dist             # electron-builder, produces installer for current platform
Out of scope for v1
See docs/requirements.md Section 12. Do not add features outside that list without an issue and a green light from the maintainer first. Common requests to deflect:

Batch processing, cloud sync, map view, camera capture, CSV export
Plants, fungi, geographic filtering, automatic animal detection
Mobile app, hosted inference (planned but separate from v1)

Working style

For non-trivial changes, propose a plan first. Don't refactor opportunistically.
Prefer small, reviewable diffs over sweeping rewrites.
When in doubt about visual design, ask — don't guess.
Don't waste words on unnessecary talk, keep thing short and terse.
