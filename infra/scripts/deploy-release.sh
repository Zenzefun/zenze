#!/usr/bin/env bash
# Atomic Zenze.fun release on the VPS.
# Usage: deploy-release.sh /tmp/zenze-output.tgz
set -euo pipefail

TAR="${1:?usage: deploy-release.sh /path/to/zenze-output.tgz}"
APP=/opt/zenze-fun
ID="$(date -u +%Y%m%dT%H%M%SZ)"
REL="$APP/releases/$ID"
STATIC="$APP/static/assets"
KEEP=5

test -f "$TAR"
mkdir -p "$APP/releases" "$STATIC" "$REL"
tar -xzf "$TAR" -C "$REL"
test -f "$REL/.output/server/index.mjs"
test -d "$REL/.output/public/assets"
python3 -c "import json; d=json.load(open('$REL/.output/nitro.json')); assert d.get('preset')=='node-server', d.get('preset')"

seed_assets() {
  local src="$1"
  if [[ -d "$src" ]]; then
    # -n: never clobber a content-addressed hash
    cp -n "$src"/* "$STATIC/" 2>/dev/null || true
  fi
}

# Union of hashed assets so a stale tab never 404s a still-valid hash.
seed_assets "$APP/.output/public/assets"
if [[ -L "$APP/.output" ]]; then
  seed_assets "$(readlink -f "$APP/.output")/public/assets"
fi
for bak in "$APP"/.output.bak.*/public/assets; do
  seed_assets "$bak"
done
for rel_assets in "$APP"/releases/*/.output/public/assets; do
  seed_assets "$rel_assets"
done
seed_assets "$REL/.output/public/assets"

# nginx workers run as www-data. The app dir stays unreadable (711) so they
# can only traverse into the hashed asset pool — never .env or releases.
chmod 711 "$APP"
chmod 700 "$APP/releases" 2>/dev/null || true
chmod 600 "$APP/.env" 2>/dev/null || true
chmod 755 "$APP/static" "$STATIC"
find "$STATIC" -type f -exec chmod 644 {} +
find "$STATIC" -type d -exec chmod 755 {} +

# Convert a real .output directory into a release, then atomically symlink.
if [[ -d "$APP/.output" && ! -L "$APP/.output" ]]; then
  mkdir -p "$APP/releases/pre-atomic"
  mv "$APP/.output" "$APP/releases/pre-atomic/.output"
  seed_assets "$APP/releases/pre-atomic/.output/public/assets"
fi
ln -sfn "$REL/.output" "$APP/.output"
test -f "$APP/.output/server/index.mjs"
test -L "$APP/.output"

# Duplicate leftover trees from old mv-based deploys (~40MB each of full server output).
rm -rf "$APP"/.output.bak.*

# Keep the last $KEEP dated releases. pre-atomic snapshot is kept until it ages out
# of this glob (it does not match [0-9]*).
mapfile -t old < <(ls -1d "$APP/releases/"[0-9]* 2>/dev/null | sort -r | tail -n +$((KEEP + 1)))
if ((${#old[@]})); then
  rm -rf "${old[@]}"
fi

python3 - <<'PY'
from pathlib import Path
static = Path("/opt/zenze-fun/static/assets")
n = sum(1 for f in static.iterdir() if f.is_file()) if static.is_dir() else 0
print(f"static_assets={n}")
PY

cd "$APP"
# PM2 --update-env reads this shell, not the file. Without this, the process
# keeps an old relayer key and every bridge mint reverts.
set -a
# shellcheck disable=SC1091
. "$APP/.env"
set +a
pm2 restart zenze-web --update-env

echo "RELEASE_OK $ID"
ls -ld "$APP/.output"
readlink -f "$APP/.output" || true
ls -ld "$STATIC" | cat
