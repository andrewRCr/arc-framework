#!/bin/bash
# Run a declared check's command, through this machine's check runner when it has one.
#
# A runner is an executable at $XDG_CONFIG_HOME/arc-framework/check-runner
# (~/.config/arc-framework/check-runner by default). It receives the command and
# its arguments and runs that command against this checkout's working tree,
# for example on another machine. When it obtains a result, it must exit with
# the command's status. It may add a line, such as where the command ran, to the file
# $ARC_CHECK_NOTICE names, where the command may add its own, such as how long
# it waited for the heavy-test slot. Each appends rather than replacing the
# file, so neither erases the other's line; arc check shows those lines beside
# the check's outcome.
# If the runner obtains no check result, it must exit nonzero and append a line
# beginning "not run: " followed by the reason to $ARC_CHECK_NOTICE, when set.
# Put that line within the file's first 4096 bytes. arc check reports "couldn't
# run" with the reason and a retry command, retaining no pass. This marker is
# reserved for unavailable execution, not for a check that completed and failed.
# Without a notice file, report the reason on stderr and exit nonzero.
# Without a runner, the command runs here unchanged, as it does in CI.

set -euo pipefail

runner="${XDG_CONFIG_HOME:-${HOME:-}/.config}/arc-framework/check-runner"
if [ -x "$runner" ]; then
    exec "$runner" "$@"
fi
exec "$@"
