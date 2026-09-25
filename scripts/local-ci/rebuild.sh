#!/usr/bin/env bash
# Replace the CI guest with a fresh one built from the recipe.
#
# This destroys the instance. It is the recovery path for a guest that has
# drifted, not a routine operation, so it requires --yes and refuses outright
# while a job is running inside the guest.

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
LIMACTL="${LIMACTL:-/opt/homebrew/bin/limactl}"
INSTANCE="${INSTANCE:-arc-ci}"

usage() {
    cat >&2 <<USAGE
usage: ${0##*/} --yes

Deletes the "$INSTANCE" instance and recreates it from the recipe. All guest
state is lost. Refuses while a job is in progress.
USAGE
}

confirmed=false
for arg in "$@"; do
    case "$arg" in
    --yes) confirmed=true ;;
    -h | --help)
        usage
        exit 0
        ;;
    *)
        echo "unknown argument: $arg" >&2
        usage
        exit 2
        ;;
    esac
done

if [ "$confirmed" != true ]; then
    echo "refusing: rebuilding destroys the guest; pass --yes to confirm" >&2
    usage
    exit 2
fi

instance_running() {
    "$LIMACTL" list --format '{{.Name}} {{.Status}}' 2>/dev/null |
        grep -qx "$INSTANCE Running"
}

# The bracket keeps pgrep from matching the pattern in its own invoking
# command line, which would report a job whenever this check runs.
job_in_progress() {
    "$LIMACTL" shell "$INSTANCE" -- pgrep -f '[R]unner\.Worker' >/dev/null 2>&1
}

if instance_running && job_in_progress; then
    echo "refusing: a job is in progress inside $INSTANCE" >&2
    exit 1
fi

if instance_running; then
    "$LIMACTL" stop "$INSTANCE"
fi

"$LIMACTL" delete --tty=false "$INSTANCE"
"$LIMACTL" start --tty=false "$SCRIPT_DIR/$INSTANCE.yaml"

echo "rebuild completed: $(date -u '+%Y-%m-%dT%H:%M:%SZ')"
