#!/bin/sh
# Shared shell library for ARC scripts and hooks.
# Location: .arc/system/scripts/arc-lib.sh
#
# Source this file — do not execute directly.
# All callers must run from the repository root.
#
# Usage from hooks:   . "$(dirname "$0")/../scripts/arc-lib.sh"
# Usage from scripts: . "$(dirname "$0")/arc-lib.sh"

# Guard against direct execution
if [ "$(basename "$0")" = "arc-lib.sh" ]; then
    echo "Error: arc-lib.sh is a library — source it, don't execute it." >&2
    echo "  Usage: . path/to/arc-lib.sh" >&2
    exit 1
fi

# ============================================================================
# Colors
# ============================================================================

ARC_RED='\033[0;31m'
ARC_YELLOW='\033[1;33m'
ARC_GREEN='\033[0;32m'
ARC_NC='\033[0m'

# ============================================================================
# Configuration
# ============================================================================

# Default config file path (relative to repo root).
ARC_CONFIG_FILE="${ARC_CONFIG_FILE:-.arc/system/arc-config.yml}"

# arc_config_get <key> <default>
#
# Read a value from arc-config.yml using line-based shell matching.
# Falls back to <default> if the config file is missing or the key is not found.
# Empty values in the config file are treated as absent (returns default).
arc_config_get() {
    local key="$1"
    local default="$2"

    if [ ! -f "$ARC_CONFIG_FILE" ]; then
        echo "$default"
        return
    fi

    local value
    value=$(grep -E "^${key}:" "$ARC_CONFIG_FILE" 2>/dev/null | head -1 | cut -d: -f2- | sed 's/^[[:space:]]*//' | sed 's/[[:space:]]*$//')

    if [ -z "$value" ]; then
        echo "$default"
    else
        echo "$value"
    fi
}

# arc_config_keys
#
# List all uncommented key names present in the config file.
# Output: one key per line (e.g., "branch.base", "commit.format").
arc_config_keys() {
    if [ ! -f "$ARC_CONFIG_FILE" ]; then
        return
    fi

    grep -E '^[a-z][a-z0-9_.]+:' "$ARC_CONFIG_FILE" 2>/dev/null | cut -d: -f1
}
