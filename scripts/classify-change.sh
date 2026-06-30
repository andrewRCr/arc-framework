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

# --- Canonical code surface ----------------------------------------------------
#
# The single definition of "what, if changed, could change a build / lint /
# typecheck / test outcome." Both the classify decision and (later) the
# code-tree hash read from this set, so there is no second glob list to drift.
#
# Markdown / JSON under the shipped fixture trees counts as CODE, not docs: the
# init / save-load / active-format suites read packages/arc-framework/{arc,
# templates}/** and init-recipe.json as fixtures, so a change there can break a
# test despite being "just markdown."

# Code surface (test-affecting). `*` matches across `/` in these match contexts,
# so a trailing `/*` covers a whole subtree.
readonly CODE_SURFACE_GLOBS=(
  "packages/arc-framework/src/*"
  "packages/arc-framework/__tests__/*"
  "packages/arc-framework/arc/*"
  "packages/arc-framework/templates/*"
  "packages/arc-framework/package.json"
  "packages/arc-framework/tsconfig*.json"
  "packages/arc-framework/tsup.config.ts"
  "packages/arc-framework/vitest.config.ts"
  "packages/arc-framework/eslint.config.js"
  "packages/arc-framework/init-recipe.json"
  "package.json"
  "package-lock.json"
  "scripts/*.sh"
  ".github/workflows/ci.yml"
)

# Genuine docs (light-safe). Root-level markdown (README / CONTRIBUTING / AGENTS
# / CLAUDE / …) is handled separately, since a leading-`*` glob would also match
# nested markdown that the code surface claims.
readonly GENUINE_DOCS_GLOBS=(
  ".arc/*"
  "docs/*"
  "mkdocs.yml"
)

# True when $1 matches any glob in the remaining args (glob match, not literal).
_matches_any() {
  local path="$1"
  shift
  local glob
  for glob in "$@"; do
    # shellcheck disable=SC2053  # RHS is an intentional glob, not a literal.
    [[ "${path}" == ${glob} ]] && return 0
  done
  return 1
}

# True (exit 0) when the path belongs to the code surface; false (exit 1) when it
# is genuine docs. Anything matching neither set is code — the fail-safe the whole
# design leans on (an unclassified path must never silently skip the heavy suite).
is_code_surface_path() {
  local path="$1"
  if _matches_any "${path}" "${CODE_SURFACE_GLOBS[@]}"; then
    return 0
  fi
  if _matches_any "${path}" "${GENUINE_DOCS_GLOBS[@]}"; then
    return 1
  fi
  # Root-level markdown only (no path separator) is genuine docs.
  case "${path}" in
    */*) ;;
    *.md) return 1 ;;
  esac
  return 0
}

usage() {
  cat >&2 <<'EOF'
Usage: classify-change.sh <command> [args...]

Commands:
  classify <file>...   Classify a changed-file set as code (heavy) or docs (light)
  tree-hash <ref>      Compute the code-tree hash at a git ref
EOF
}

# classify <file>... — print `light` when every changed file is genuine docs,
# `heavy` otherwise. Empty input is `heavy` (fail-safe: an unknown change set
# must run the full suite).
cmd_classify() {
  if [[ "$#" -eq 0 ]]; then
    echo "heavy"
    return 0
  fi
  local file
  for file in "$@"; do
    if is_code_surface_path "${file}"; then
      echo "heavy"
      return 0
    fi
  done
  echo "light"
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
