#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
OUT_DIR="$REPO_ROOT/dist/backend"
SPEC_FILE="$SCRIPT_DIR/wildlife_backend.spec"

# A dedicated build venv with CPU-only torch. Keeping this separate from .venv
# means devs can have CUDA torch locally for fast inference while shipped
# binaries stay slim (no CUDA libs, no nvidia/* packages).
BUILD_VENV="$REPO_ROOT/.venv-build"
BUILD_PYTHON="$BUILD_VENV/bin/python"

if [[ ! -x "$BUILD_PYTHON" ]]; then
  echo "Creating build venv at $BUILD_VENV..."
  python3 -m venv "$BUILD_VENV"
fi

# CUDA torch in the build venv would (a) balloon the bundle by ~1.5 GB and
# (b) break at runtime once the spec strips nvidia/* libs. Detect it and
# reinstall as CPU-only if needed.
TORCH_VARIANT="$("$BUILD_PYTHON" -c "import torch, sys; sys.stdout.write('cuda' if '+cu' in torch.__version__ else 'cpu')" 2>/dev/null || echo "missing")"

if [[ "$TORCH_VARIANT" != "cpu" ]]; then
  echo "Installing build dependencies into $BUILD_VENV (CPU-only torch)..."
  "$BUILD_PYTHON" -m pip install --quiet --upgrade pip
  # CPU-only torch: ~250 MB vs ~1.5 GB CUDA build, and no libcudart dep.
  "$BUILD_PYTHON" -m pip install --quiet \
    torch torchvision --index-url https://download.pytorch.org/whl/cpu
  "$BUILD_PYTHON" -m pip install --quiet -r "$REPO_ROOT/src/backend/requirements.txt"
  "$BUILD_PYTHON" -m pip install --quiet pyinstaller
fi

echo "Building Python backend with PyInstaller..."

"$BUILD_PYTHON" -m PyInstaller \
  "$SPEC_FILE" \
  --distpath "$OUT_DIR" \
  --workpath "$REPO_ROOT/build/.pyinstaller_work" \
  --noconfirm

echo "Backend built → $OUT_DIR/wildlife_backend"
