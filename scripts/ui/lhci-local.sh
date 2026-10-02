#!/usr/bin/env bash
# Lighthouse CI against a running production server (pnpm -C apps/web build && ACHP_FIXTURES=1 pnpm -C apps/web start -p 3100).
# Uses Playwright's headless Chromium when no Chrome is configured, then prints the medians for PROGRESS.md.
#   bash scripts/ui/lhci-local.sh            # collect + assert
set -u
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT/apps/web"
if [ -z "${CHROME_PATH:-}" ]; then
  shell=$(ls -d "${LOCALAPPDATA:-$HOME/AppData/Local}"/ms-playwright/chromium_headless_shell-*/*/ 2>/dev/null | tail -1)
  [ -z "$shell" ] && shell=$(ls -d "$HOME"/.cache/ms-playwright/chromium_headless_shell-*/*/ 2>/dev/null | tail -1)
  for exe in "$shell/chrome-headless-shell.exe" "$shell/chrome-headless-shell"; do
    if [ -f "$exe" ]; then
      if command -v cygpath >/dev/null; then CHROME_PATH="$(cygpath -w "$exe")"; else CHROME_PATH="$exe"; fi
      export CHROME_PATH
      break
    fi
  done
fi
rm -rf .lighthouseci
npx lhci autorun --config=lighthouserc.cjs
status=$?
node "$ROOT/scripts/ui/lh-summary.mjs"
exit $status
