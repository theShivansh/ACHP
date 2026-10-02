#!/usr/bin/env bash
# Honesty checks (09 §5). The logic is in honesty-check.mjs so it runs the same everywhere.
exec node "$(dirname "$0")/honesty-check.mjs" "$@"
