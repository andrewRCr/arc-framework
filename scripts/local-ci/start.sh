#!/usr/bin/env bash
# Bring the CI guest up, and make sure it comes back on its own next time.
#
# Idempotent: safe to run when the guest is already running, and it installs
# the login agent only when that agent is absent.

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
LIMACTL="${LIMACTL:-/opt/homebrew/bin/limactl}"
INSTANCE="${INSTANCE:-arc-ci}"

AGENT_LABEL="com.arc.local-ci"
AGENT_DIR="$HOME/Library/LaunchAgents"
AGENT_PATH="$AGENT_DIR/$AGENT_LABEL.plist"

install_agent() {
    if [ -e "$AGENT_PATH" ]; then
        echo "login agent already installed: $AGENT_PATH"
        return 0
    fi

    mkdir -p "$AGENT_DIR" "$HOME/Library/Logs"

    # The tracked plist carries a placeholder because launchd expands no
    # variables and insists on absolute log paths.
    sed "s|__CI_HOME__|$HOME|g" "$SCRIPT_DIR/$AGENT_LABEL.plist" >"$AGENT_PATH"

    launchctl bootstrap "gui/$(id -u)" "$AGENT_PATH"
    echo "installed login agent: $AGENT_PATH"
}

instance_exists() {
    "$LIMACTL" list --quiet 2>/dev/null | grep -qx "$INSTANCE"
}

instance_running() {
    "$LIMACTL" list --format '{{.Name}} {{.Status}}' 2>/dev/null |
        grep -qx "$INSTANCE Running"
}

if instance_running; then
    echo "instance $INSTANCE is already running"
elif instance_exists; then
    "$LIMACTL" start --tty=false "$INSTANCE"
else
    "$LIMACTL" start --tty=false "$SCRIPT_DIR/$INSTANCE.yaml"
fi

install_agent
