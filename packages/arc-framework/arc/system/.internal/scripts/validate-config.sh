#!/usr/bin/env bash
# Compatibility launcher for ARC configuration validation.

set -e

. "$(dirname "$0")/arc-lib.sh"

exec arc config validate --file "$ARC_CONFIG_FILE"
