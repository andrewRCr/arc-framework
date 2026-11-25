#!/usr/bin/env bash

set -euo pipefail

for tool in actionlint shellcheck; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    echo "$tool is required for workflow linting. Install it on the system PATH and retry npm run lint:workflows." >&2
    exit 127
  fi
done

exec actionlint -shellcheck="$(command -v shellcheck)" "$@"
