#!/usr/bin/env bash
# Report what the CI host is doing: the instance, the guest's load and memory,
# and the state of each runner service inside it.

set -euo pipefail

LIMACTL="${LIMACTL:-/opt/homebrew/bin/limactl}"
INSTANCE="${INSTANCE:-arc-ci}"

echo "== instance =="
"$LIMACTL" list

instance_running() {
    "$LIMACTL" list --format '{{.Name}} {{.Status}}' 2>/dev/null |
        grep -qx "$INSTANCE Running"
}

if ! instance_running; then
    echo
    echo "instance $INSTANCE is not running; no guest readings available"
    exit 0
fi

echo
echo "== guest =="
"$LIMACTL" shell "$INSTANCE" -- uptime
"$LIMACTL" shell "$INSTANCE" -- free -m

echo
echo "== runner services =="
"$LIMACTL" shell "$INSTANCE" -- \
    systemctl list-units 'actions.runner.*' --all --no-pager --no-legend
