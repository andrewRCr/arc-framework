#!/usr/bin/env bash
#
# Canonical code-surface classifier for CI run-depth decisions.
#
# Single source of truth for "what counts as code" in this repo. Structured as
# subcommand dispatch so each capability is invocable in isolation by unit tests:
#
#   classify <file>...   Decide a changed-file set as code (heavy) or docs (light).
#   classify --stdin0    Same, but read NUL-delimited paths from standard input.
#   lane --stdin0        Decide the legacy path-only scheduling lane.
#   planning-lane <base> <head>
#                       Decide exact-ref ARC planning clearance.
#   tree-hash <ref>      Compute a rebase/squash-stable code-tree identity at a ref.
#
# The pure subcommands (classify, tree-hash) run without network. Whether a
# pull request's tested tree was already verified is looked up by the workflow
# and passed to `decide`; the open-PR lookup behind `duplicate-push` is the one
# seam that needs a live token.

set -euo pipefail

# Exit status for a usage error (unknown or missing subcommand). Mirrors the
# BSD sysexits EX_USAGE convention so callers can distinguish "you invoked me
# wrong" from a subcommand's own failure.
readonly EX_USAGE=64

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
readonly SCRIPT_DIR
readonly CHANGE_FACTS_MODULE="${SCRIPT_DIR}/../packages/arc-framework/src/lib/change-facts.ts"
readonly ARC_PLANNING_CLI="${ARC_PLANNING_CLI:-}"

usage() {
  cat >&2 <<'EOF'
Usage: classify-change.sh <command> [args...]

Commands:
  classify <file>...       Classify paths from argv
  classify --stdin0        Classify NUL-delimited paths from stdin
  lane --stdin0            Classify NUL-delimited paths as auto or reviewed
  planning-lane <base> <head>
                            Classify canonical exact-ref changes as planning or reviewed
  portability --stdin0     Print true when a path can affect the portability suite
  tree-hash <ref>           Compute the code-tree hash at a git ref
  duplicate-push <event> <ref-name> <head-sha>
                            Print true when a push run duplicates an open PR head
  decide <event> <base> <head> [<tested-tree-verified>]
                            Resolve the run weight (light|heavy) and reason for a change
EOF
}

# classify <file>... — print `light` when every changed file is genuine docs,
# `heavy` otherwise. Empty input is `heavy` (fail-safe: an unknown change set
# must run the full suite).
cmd_classify() {
  if [[ "${1:-}" == "--stdin0" ]]; then
    shift
    if [[ "$#" -ne 0 ]]; then
      echo "classify --stdin0: paths must be supplied on standard input" >&2
      return "${EX_USAGE}"
    fi
    node "${CHANGE_FACTS_MODULE}" classify-paths
    return
  fi
  printf '%s\0' "$@" | node "${CHANGE_FACTS_MODULE}" classify-paths
}

# Preserve the legacy path-only scheduling lane without newline parsing.
cmd_lane() {
  if [[ "${1:-}" != "--stdin0" ]] || [[ "$#" -ne 1 ]]; then
    echo "lane: paths must be supplied as NUL-delimited standard input" >&2
    return "${EX_USAGE}"
  fi
  node "${CHANGE_FACTS_MODULE}" lane-paths
}

# planning-lane <base> <head> — run the trusted classifier against explicit
# coordinates in the caller-selected data repository.
cmd_planning_lane() {
  local base="${1:-}" head="${2:-}"
  if [[ -z "${base}" || -z "${head}" || "$#" -ne 2 ]]; then
    echo "planning-lane: base and head refs are required" >&2
    return "${EX_USAGE}"
  fi
  if [[ -n "${ARC_PLANNING_CLI}" ]]; then
    node "${ARC_PLANNING_CLI}" review planning-lane "${base}" "${head}" \
      --repository "${CLASSIFY_REPOSITORY_DIR:-$PWD}"
    return
  fi
  npx arc review planning-lane "${base}" "${head}" \
    --repository "${CLASSIFY_REPOSITORY_DIR:-$PWD}"
}

# portability --stdin0 — print `true` when any changed path belongs to the
# OS-sensitive concurrency surface. Empty input is true: an unknown change set
# must not silently skip the cross-platform check.
cmd_portability() {
  if [[ "${1:-}" != "--stdin0" ]] || [[ "$#" -ne 1 ]]; then
    echo "portability: paths must be supplied as NUL-delimited standard input" >&2
    return "${EX_USAGE}"
  fi
  node "${CHANGE_FACTS_MODULE}" portability-paths
}

# Resolve the event-specific exact change set through the canonical TypeScript
# record. Pull requests compare their merge base to the proposed head; pushes
# compare the supplied before/after commits directly.
_classify_diff_changes() {
  local event="$1" base="$2" head="$3"
  local diff_base="${base}"
  if [[ "${event}" == "pull_request" ]] && [[ -z "${CLASSIFY_RAW_DIFF_FILE:-}" ]]; then
    diff_base="$(git merge-base "${base}" "${head}" 2>/dev/null)" || {
      echo "unknown"
      return 0
    }
  fi
  node "${CHANGE_FACTS_MODULE}" classification "${diff_base}" "${head}" 2>/dev/null || echo "unknown"
}

_code_tree_hash() {
  node "${CHANGE_FACTS_MODULE}" tree-hash "$1" 2>/dev/null
}

cmd_tree_hash() {
  local ref="${1:-}"
  if [[ -z "${ref}" ]] || [[ "$#" -ne 1 ]]; then
    echo "tree-hash: a git ref is required" >&2
    return 1
  fi
  if ! _code_tree_hash "${ref}"; then
    echo "tree-hash: cannot read tree at ref '${ref}'" >&2
    return 1
  fi
}

# Fetch open pull-request heads for <ref-name>/<head-sha> as normalized
# "<head-ref>\t<head-sha>" lines. Live push runs use this to avoid duplicating
# the pull_request run once a PR already owns the same branch head. Any lookup
# miss or API failure yields no lines, which keeps branch CI fail-open.
_fetch_open_pull_heads() {
  local ref_name="$1" head_sha="$2"
  if [[ -n "${CLASSIFY_OPEN_PULLS_DIR:-}" ]]; then
    local fixture="${CLASSIFY_OPEN_PULLS_DIR}/${head_sha}.tsv"
    [[ -f "${fixture}" ]] && cat "${fixture}"
    return 0
  fi

  local repo="${GITHUB_REPOSITORY:-}" owner="${GITHUB_REPOSITORY_OWNER:-}"
  [[ -z "${repo}" || -z "${owner}" ]] && return 0

  gh api --paginate -X GET "repos/${repo}/pulls" \
    -f state=open -f head="${owner}:${ref_name}" \
    --jq '.[] | [.head.ref, .head.sha] | @tsv' 2>/dev/null || true
}

# duplicate-push <event> <ref-name> <head-sha> — print `true` when this is a
# push event for a branch/head already represented by an open PR. This is a cost
# optimization only: uncertainty prints `false` so branch CI still runs.
cmd_duplicate_push() {
  local event="${1:-}" ref_name="${2:-}" head_sha="${3:-}"
  if [[ "${event}" != "push" || -z "${ref_name}" || -z "${head_sha}" ]]; then
    echo "false"
    return 0
  fi

  local heads
  heads="$(_fetch_open_pull_heads "${ref_name}" "${head_sha}")"
  if grep -qxF -- "${ref_name}"$'\t'"${head_sha}" <<<"${heads}"; then
    echo "true"
  else
    echo "false"
  fi
}

# decide <event> <base> <head> [<tested-tree-verified>] — resolve the run weight
# ∈ {light, heavy} and the reason it was reached ∈ {docs-only, verified,
# unverified}, the run-vs-skip decision the `classify` job emits. Prints
# `weight=<w>` and `reason=<r>` on stdout (consumable as `$GITHUB_OUTPUT` lines)
# plus a human decision line on stderr. <event> is the triggering event name
# (`pull_request` | `push`); <base>/<head> are the change endpoints (a PR's
# base/head SHAs, or a push's before/after). <tested-tree-verified> is `true`
# only when an earlier run of the same pull request recorded a full heavy pass
# on the exact code tree this run checks out; the workflow looks that record up.
#
# The decision is fail-safe to heavy: only a resolvable, non-empty change set
# that touches no code surface, or a code-touching pull request whose tested
# tree carries a verified record, skips the heavy suite. An empty, unresolvable,
# or ambiguous change set runs heavy — an unknown change must never be mistaken
# for docs-only — and any value other than `true` leaves a tree unverified.
cmd_decide() {
  local event="${1:-}" base="${2:-}" head="${3:-}" tested_tree_verified="${4:-}"
  local weight reason

  # Whole change over base/head. PRs compare merge-base to head; pushes compare
  # the actual before→after endpoints. Both endpoints must resolve; an
  # unresolvable endpoint leaves the set empty for the fail-safe.
  local classification=unknown
  if [[ -n "${base}" && -n "${head}" ]] \
     && git rev-parse -q --verify "${base}^{commit}" >/dev/null 2>&1 \
     && git rev-parse -q --verify "${head}^{commit}" >/dev/null 2>&1; then
    classification="$(_classify_diff_changes "${event}" "${base}" "${head}")"
  fi

  if [[ "${classification}" == "unknown" ]]; then
    # Empty or unresolvable change set → fail-safe heavy.
    weight=heavy
    reason=unverified
  elif [[ "${classification}" == "light" ]]; then
    # No code-surface path changed → docs-only.
    weight=light
    reason=docs-only
  elif [[ "${event}" != "pull_request" ]]; then
    # Code touched on a push: no per-tree verification history to consult (that
    # is the pull request's job), so run heavy for fast feedback.
    weight=heavy
    reason=unverified
  elif [[ "${tested_tree_verified}" == "true" ]]; then
    # Code touched on a pull request whose run tests a tree an earlier run of
    # this pull request already passed in full. A pull-request run checks out
    # GitHub's merge of the head into the current base, so the record is keyed
    # by that merged tree, not by the head commit: a docs-only commit on
    # verified code still matches, while a base that moved the code does not.
    weight=light
    reason=verified
  else
    weight=heavy
    reason=unverified
  fi

  printf 'decide: event=%s base=%s head=%s -> weight=%s reason=%s\n' \
    "${event}" "${base}" "${head}" "${weight}" "${reason}" >&2
  printf 'weight=%s\n' "${weight}"
  printf 'reason=%s\n' "${reason}"
}

main() {
  local command="${1:-}"
  case "${command}" in
    classify)
      shift
      cmd_classify "$@"
      ;;
    lane)
      shift
      cmd_lane "$@"
      ;;
    planning-lane)
      shift
      cmd_planning_lane "$@"
      ;;
    portability)
      shift
      cmd_portability "$@"
      ;;
    tree-hash)
      shift
      cmd_tree_hash "$@"
      ;;
    duplicate-push)
      shift
      cmd_duplicate_push "$@"
      ;;
    decide)
      shift
      cmd_decide "$@"
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
