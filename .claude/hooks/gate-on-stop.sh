#!/usr/bin/env bash
# ACHP Stop-hook gate: when Claude tries to end a turn with uncommitted web changes,
# run a fast typecheck and an anti-slop scan of the changed files. On failure, block the stop
# and hand the reason back to Claude, so it keeps working instead of reporting "done" on red.
set -uo pipefail

INPUT="$(cat || true)"
ROOT="${CLAUDE_PROJECT_DIR:-$(pwd)}"
cd "$ROOT" || exit 0

# Prevent loops: if we're already continuing because of this hook, let Claude stop.
ACTIVE="$(printf '%s' "$INPUT" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.stdout.write(String(JSON.parse(s||"{}").stop_hook_active===true))}catch{process.stdout.write("false")}})')"
[ "$ACTIVE" = "true" ] && exit 0

# Only when apps/web has uncommitted changes.
CHANGED="$(git status --porcelain -- apps/web 2>/dev/null | awk '{print $2}' | grep -E '\.(tsx?|jsx?|css)$' || true)"
[ -z "$CHANGED" ] && exit 0

REASONS=""

# 1) Typecheck (only once the P1 script exists).
if grep -q '"typecheck"' apps/web/package.json 2>/dev/null; then
  TC_OUT="$(timeout 180 pnpm -C apps/web -s typecheck 2>&1)"
  if [ $? -ne 0 ]; then
    REASONS+="Typecheck failed:\n$(printf '%s' "$TC_OUT" | tail -n 25)\n\n"
  fi
fi

# 2) Anti-slop on the changed files.
SLOP_OUT="$(node .claude/hooks/anti-slop-check.mjs $CHANGED 2>&1)"
if [ $? -ne 0 ]; then
  REASONS+="$(printf '%s' "$SLOP_OUT" | head -n 40)\n"
fi

if [ -n "$REASONS" ]; then
  node -e 'const r=process.argv[1];process.stdout.write(JSON.stringify({decision:"block",reason:"Gate not green. Fix these before ending the turn:\n"+r}))' "$(printf "%b" "$REASONS")"
fi
exit 0
