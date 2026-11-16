#!/usr/bin/env bash
# Convenience wrapper: ./lp.sh <command> [args...]  (same as npm run lp -- ...)
set -euo pipefail
cd "$(dirname "$0")"
exec npx tsx src/index.ts "$@"
