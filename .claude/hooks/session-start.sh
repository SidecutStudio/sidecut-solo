#!/bin/bash
# Cloud sessions start from a fresh clone: install dependencies so checks and tests run.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"
npm ci >&2
