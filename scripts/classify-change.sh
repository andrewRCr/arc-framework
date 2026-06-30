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

# --- Heavy verification checks -------------------------------------------------
#
# The check-run display names that together prove a code tree was fully verified.
# The verified-tree lookback skips the heavy suite for a pull request only when
# every one of these concluded `success` for a commit carrying HEAD's exact code
# tree. These strings are the source of truth for the corresponding job `name:`
# fields in .github/workflows/ci.yml — they must stay byte-identical (matrix legs
# include the `(<os>)` suffix the runner appends to the job name). A drift fails
# safe to heavy but silently defeats the skip, so the two surfaces move together.
readonly HEAVY_CHECK_NAMES=(
  "Lint, Typecheck & Unit Tests"
  "Integration & E2E Tests"
  "Portability (concurrency guards) (ubuntu-latest)"
  "Portability (concurrency guards) (macos-latest)"
  "Portability (concurrency guards) (windows-latest)"
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
  classify <file>...        Classify a changed-file set as code (heavy) or docs (light)
  tree-hash <ref>           Compute the code-tree hash at a git ref
  decide <event> <base> <head>
                            Resolve the run weight (light|heavy) and reason for a change
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

# Print a deterministic identity for the code surface at <ref>: enumerate every
# tracked path (`git ls-tree -r`), keep those the canonical set classifies as
# code, and hash the sorted `path<TAB><mode type sha>` lines. Reusing
# is_code_surface_path is the no-drift guarantee — the hashed set is exactly
# what classify calls code. Returns non-zero with no stdout on any failure, so
# callers read it as fail-safe heavy rather than trusting a stale identity.
# Quiet: the CLI wrapper below emits the user-facing diagnostics.
_code_tree_hash() {
  local ref="$1" listing
  if ! listing="$(git ls-tree -r "${ref}" 2>/dev/null)"; then
    return 1
  fi

  # ls-tree -r lines are "<mode> blob <sha>\t<path>"; keep the full tree entry
  # metadata so mode/type-only changes still produce a new code-tree identity.
  local serialized
  serialized="$(
    while IFS=$'\t' read -r meta path; do
      [[ -z "${path}" ]] && continue
      if is_code_surface_path "${path}"; then
        printf '%s\t%s\n' "${path}" "${meta}"
      fi
    done <<<"${listing}" | LC_ALL=C sort
  )"

  printf '%s' "${serialized}" | git hash-object --stdin
}

# tree-hash <ref> — CLI entry for the code-tree hash. Validates the argument and
# maps a compute failure to a diagnostic on stderr plus a non-zero exit.
cmd_tree_hash() {
  local ref="${1:-}"
  if [[ -z "${ref}" ]]; then
    echo "tree-hash: a git ref is required" >&2
    return 1
  fi

  local hash
  if ! hash="$(_code_tree_hash "${ref}")"; then
    echo "tree-hash: cannot read tree at ref '${ref}'" >&2
    return 1
  fi
  printf '%s\n' "${hash}"
}

# Collapse check-run rows to the latest row per check name, emitting normalized
# "<name>\t<conclusion>" lines. Fixture rows may be two-column normalized TSV,
# where later rows win; live rows include timestamp + id tie-breakers.
_latest_check_runs() {
  awk -F '\t' '
    NF >= 2 {
      name = $1
      conclusion = $2
      if (NF >= 4) {
        key = $3 sprintf("%020.0f", $4 + 0)
      } else {
        key = sprintf("%020d", NR)
      }
      if (!(name in latest_key) || key >= latest_key[name]) {
        latest_key[name] = key
        latest_line[name] = name "\t" conclusion
      }
      if (!(name in seen)) {
        seen[name] = 1
        order[++count] = name
      }
    }
    END {
      for (i = 1; i <= count; i++) {
        print latest_line[order[i]]
      }
    }
  '
}

# Fetch the latest check-run results for <sha> as normalized
# "<name>\t<conclusion>" lines. Live, this queries the GitHub Checks API with the
# ambient token; the JSON→tsv extraction runs inside `gh` and is exercised only
# in live CI. Tests inject results by pointing CLASSIFY_CHECK_RUNS_DIR at a
# directory of "<sha>.tsv" fixtures. An absent fixture, an unset repository, or
# any `gh` failure yields no lines — which the matcher below reads as "not
# verified".
_fetch_check_runs() {
  local sha="$1"
  if [[ -n "${CLASSIFY_CHECK_RUNS_DIR:-}" ]]; then
    local fixture="${CLASSIFY_CHECK_RUNS_DIR}/${sha}.tsv"
    [[ -f "${fixture}" ]] && _latest_check_runs <"${fixture}"
    return 0
  fi
  gh api --paginate "repos/${GITHUB_REPOSITORY:-}/commits/${sha}/check-runs" \
    --jq '.check_runs[] | [.name, (.conclusion // ""), (.started_at // .completed_at // .created_at // ""), ((.id // 0) | tostring)] | @tsv' \
    2>/dev/null | _latest_check_runs || true
}

# True (exit 0) when the latest normalized check-run lines
# (<name>\t<conclusion>) carry every heavy check at conclusion `success`. A
# heavy check that is failed, in-progress (empty conclusion), or absent leaves
# its name unmatched, so the set is incomplete and the function reports
# not-passed.
_all_heavy_checks_passed() {
  local runs="$1" name
  for name in "${HEAVY_CHECK_NAMES[@]}"; do
    if ! grep -qxF -- "${name}"$'\t'"success" <<<"${runs}"; then
      return 1
    fi
  done
  return 0
}

# True (exit 0) when any path in the newline-delimited set is on the code
# surface; false (exit 1) when every path is genuine docs. Empty lines are
# skipped, so a trailing newline never reads as a code path.
_set_touches_code() {
  local set="$1" file
  while IFS= read -r file; do
    [[ -z "${file}" ]] && continue
    if is_code_surface_path "${file}"; then
      return 0
    fi
  done <<<"${set}"
  return 1
}

# decide <event> <base> <head> — resolve the run weight ∈ {light, heavy} and the
# reason it was reached ∈ {docs-only, verified, unverified}, the run-vs-skip
# decision the `classify` job emits. Prints `weight=<w>` and `reason=<r>` on
# stdout (consumable as `$GITHUB_OUTPUT` lines) plus a human decision line on
# stderr. <event> is the triggering event name (`pull_request` | `push`);
# <base>/<head> are the change endpoints (a PR's base/head SHAs, or a push's
# before/after).
#
# The decision is fail-safe to heavy: only a resolvable, non-empty change set
# that touches no code surface skips the heavy suite. An empty, unresolvable, or
# ambiguous change set runs heavy — an unknown change must never be mistaken for
# docs-only. The docs-only arm is decided with no Checks-API call; the
# verified-tree lookback for a code-touching pull request is the one live seam,
# layered in separately.
cmd_decide() {
  local event="${1:-}" base="${2:-}" head="${3:-}"
  local weight reason

  # Whole change over base...head. Both endpoints must resolve; an unresolvable
  # endpoint (force-push, missing ref) leaves the set empty for the fail-safe.
  local changed=''
  if [[ -n "${base}" && -n "${head}" ]] \
     && git rev-parse -q --verify "${base}^{commit}" >/dev/null 2>&1 \
     && git rev-parse -q --verify "${head}^{commit}" >/dev/null 2>&1; then
    changed="$(git diff --name-only "${base}...${head}" 2>/dev/null || true)"
  fi

  if [[ -z "${changed}" ]]; then
    # Empty or unresolvable change set → fail-safe heavy.
    weight=heavy
    reason=unverified
  elif ! _set_touches_code "${changed}"; then
    # No code-surface path changed → docs-only, no API call.
    weight=light
    reason=docs-only
  elif [[ "${event}" != "pull_request" ]]; then
    # Code touched on a push: no per-tree verification history to consult (that
    # is the pull request's job), so run heavy for fast feedback.
    weight=heavy
    reason=unverified
  else
    # Code touched on a pull request: skip the heavy suite only when some commit
    # in the PR range carries HEAD's exact code tree AND already has the full
    # heavy check set at `success`. Blob SHAs are rebase/squash-stable, so a
    # docs-only commit layered on verified code still matches the verified
    # commit's tree. Any gap — an unhashable HEAD, no matching tree, an
    # incomplete/failed/in-progress check, or an API miss — leaves the fail-safe
    # heavy default in place.
    weight=heavy
    reason=unverified
    local head_hash
    if head_hash="$(_code_tree_hash "${head}")"; then
      local sha sha_hash runs
      while IFS= read -r sha; do
        [[ -z "${sha}" ]] && continue
        sha_hash="$(_code_tree_hash "${sha}")" || continue
        [[ "${sha_hash}" != "${head_hash}" ]] && continue
        runs="$(_fetch_check_runs "${sha}")"
        if _all_heavy_checks_passed "${runs}"; then
          weight=light
          reason=verified
          break
        fi
      done < <(git rev-list "${base}..${head}" 2>/dev/null || true)
    fi
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
    tree-hash)
      shift
      cmd_tree_hash "$@"
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
