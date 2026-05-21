#!/usr/bin/env bash

set -euo pipefail

# npm prepends node_modules/.bin to PATH, which can shadow a working system
# binary with a wrapper package that tries to download ShellCheck releases.
# ARC expects system-installed shellcheck on developer machines, so prefer a
# non-node_modules PATH entry here.
filtered_path=""
OLD_IFS=${IFS}
IFS=":"
for entry in ${PATH}; do
  if [[ "${entry}" == *"/node_modules/.bin" ]]; then
    continue
  fi
  if [[ -z "${filtered_path}" ]]; then
    filtered_path="${entry}"
  else
    filtered_path="${filtered_path}:${entry}"
  fi
done
IFS=${OLD_IFS}

if [[ -z "${filtered_path}" ]]; then
  echo "shellcheck not found: PATH only contained node_modules/.bin entries" >&2
  exit 127
fi

if ! PATH="${filtered_path}" command -v shellcheck >/dev/null 2>&1; then
  echo "shellcheck not found on system PATH. Install system shellcheck and retry." >&2
  exit 127
fi

PATH="${filtered_path}" exec shellcheck -x --source-path=SCRIPTDIR "$@"
