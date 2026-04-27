#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
BACKEND_DIR="$REPO_ROOT/src/backend"
OUT_DIR="$REPO_ROOT/dist/backend"

echo "Building Python backend with PyInstaller..."

cd "$BACKEND_DIR"

pyinstaller \
  --onedir \
  --name wildlife_backend \
  --distpath "$OUT_DIR" \
  --workpath "$REPO_ROOT/build/.pyinstaller_work" \
  --specpath "$REPO_ROOT/build/.pyinstaller_specs" \
  --noconfirm \
  --add-data "embeddings/species_embeddings.npz:embeddings" \
  main.py

echo "Backend built → $OUT_DIR/wildlife_backend"
