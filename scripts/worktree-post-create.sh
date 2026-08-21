#!/bin/bash
# Self-hosting post-create provisioning for ARC-created linked worktrees.
#
# Fresh worktrees lack node_modules and the gitignored CLI dist bundle. The
# first install lays down workspace dependencies, the build creates
# packages/arc-framework/dist/cli.js, and the second install refreshes workspace
# bin links after the bin target exists.
#
# The runtime-only build is enough here: nothing in provisioning reads the type
# declarations the full build spends most of its time emitting.

set -euo pipefail

npm install
npm run build:fast
npm install
