#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
OUT="$REPO_ROOT/THIRD_PARTY_LICENSES.txt"

cd "$REPO_ROOT"

{
  echo "Wildlife ID — Third-Party Licenses"
  echo "==================================="
  echo
  echo "Wildlife ID is open source under the MIT License (full text below)."
  echo
  echo "This file lists the licenses of the open-source npm dependencies bundled"
  echo "with the desktop app. Python dependencies are bundled into the backend"
  echo "executable (resources/backend/) and retain their own licenses, included"
  echo "with the bundled wheels."
  echo
  echo "==================================="
  echo "Wildlife ID (MIT)"
  echo "==================================="
  echo
  cat LICENSE
  echo
  echo "==================================="
  echo "Bundled npm dependencies"
  echo "==================================="
  echo
  if ! npx --yes license-checker --production --csv 2>/dev/null \
      | awk -F'","' 'NR>1 {gsub(/^"|"$/,"",$1); gsub(/^"|"$/,"",$2); printf "%s — %s\n", $1, $2}'; then
    echo "(license-checker did not run — refer to package-lock.json for the full dependency list)"
  fi
} > "$OUT"

echo "Wrote $OUT"
