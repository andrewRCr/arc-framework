#!/bin/bash
# Run a declared check's command, through this machine's check runner when it has one.
#
# A runner is an executable at $XDG_CONFIG_HOME/arc-framework/check-runner
# (~/.config/arc-framework/check-runner by default). It receives the command and
# its arguments, must run that command against this checkout's working tree, and
# must exit with the command's status, for example by running it on another
# machine. It may write one line, such as where the command ran, to the file
# $ARC_CHECK_NOTICE names; arc check shows that line beside the check's outcome.
# Without a runner, the command runs here unchanged, as it does in CI.

set -euo pipefail

runner="${XDG_CONFIG_HOME:-${HOME:-}/.config}/arc-framework/check-runner"
if [ -x "$runner" ]; then
    exec "$runner" "$@"
fi
exec "$@"
