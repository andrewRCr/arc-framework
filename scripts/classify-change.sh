#!/usr/bin/env bash
#
# Canonical code-surface classifier for CI run-depth decisions.
#
# Single source of truth for "what counts as code" in this repo. Structured as
# subcommand dispatch so each capability is invocable in isolation by unit tests
# and the live Checks-API lookback stays behind an injectable seam:
#
#   classify <file>...   Decide a changed-file set as code (heavy) or docs (light).
#   tree-hash <ref>      Compute a rebase/squash-stable code-tree identity at a ref.
#
# The pure subcommands (classify, tree-hash) run without network; the Checks-API
# lookback is the one seam that needs a live token. Subcommand bodies are filled
# in by the test-first work that follows this harness.

set -euo pipefail

# Exit status for a usage error (unknown or missing subcommand). Mirrors the
# BSD sysexits EX_USAGE convention so callers can distinguish "you invoked me
# wrong" from a subcommand's own failure.
readonly EX_USAGE=64

usage() {
  cat >&2 <<'EOF'
Usage: classify-change.sh <command> [args...]

Commands:
  classify <file>...   Classify a changed-file set as code (heavy) or docs (light)
  tree-hash <ref>      Compute the code-tree hash at a git ref
EOF
}

cmd_classify() {
  echo "classify: not yet implemented" >&2
  return 1
}

cmd_tree_hash() {
  echo "tree-hash: not yet implemented" >&2
  return 1
}

main() {
  local command="${1:-}"
  case "${command}" in
    classify)
      shift
      cmd_classify "$@"
      ;;
    tree-hash)
      shift
      cmd_tree_hash "$@"
      ;;
    -h | --help)
      usage
      return 0
      ;;
    "")
      usage
      return "${EX_USAGE}"
      ;;
    *)
      echo "Unknown command: ${command}" >&2
      usage
      return "${EX_USAGE}"
      ;;
  esac
}

main "$@"
