# -*- mode: python ; coding: utf-8 -*-
# Maintained spec file — edit this rather than relying on the auto-generated one.
#
# This spec assumes the *build* venv (.venv-build) has CPU-only torch installed.
# build_backend.sh enforces that. With CPU torch:
#   - no nvidia/* packages get pulled in
#   - torch's own libs don't depend on libcudart
# so we don't need to strip CUDA bits out post-hoc, and the bundle "just works".
import os
from PyInstaller.utils.hooks import collect_all

# SPECPATH is the directory containing this file (build/).
BACKEND_DIR = os.path.normpath(os.path.join(SPECPATH, "..", "src", "backend"))

# collect_all picks up open_clip's data files (BPE vocab, model config JSONs)
# and any submodules that PyInstaller's static analysis would miss.
oc_datas, oc_binaries, oc_hiddenimports = collect_all("open_clip")

a = Analysis(
    [os.path.join(BACKEND_DIR, "main.py")],
    # Add the backend dir so local modules (predictor, vocab, display) are found.
    pathex=[BACKEND_DIR],
    binaries=oc_binaries,
    datas=oc_datas,
    hiddenimports=[
        *oc_hiddenimports,
        # uvicorn selects its HTTP / WebSocket implementations at runtime via
        # importlib, so static analysis misses all of them.
        "uvicorn.lifespan.on",
        "uvicorn.lifespan.off",
        "uvicorn.protocols.http.auto",
        "uvicorn.protocols.http.h11_impl",
        "uvicorn.protocols.http.httptools_impl",
        "uvicorn.protocols.websockets.auto",
        "uvicorn.protocols.websockets.websockets_impl",
        "uvicorn.protocols.websockets.websockets_sansio_impl",
        "uvicorn.protocols.websockets.wsproto_impl",
        "uvicorn.logging",
        # python-multipart is imported by FastAPI at runtime
        "multipart",
        "multipart.multipart",
        # Local backend modules (belt-and-suspenders alongside pathex)
        "predictor",
        "vocab",
        "display",
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    # triton is torch.compile() JIT infra — not used in the inference path.
    # CPU torch doesn't depend on it but keep the explicit exclude in case a
    # transitive dep ever pulls it in.
    excludes=["triton"],
    noarchive=False,
    optimize=0,
)

pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="wildlife_backend",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name="wildlife_backend",
)
