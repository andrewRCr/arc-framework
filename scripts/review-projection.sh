#!/usr/bin/env bash
#
# Project one work unit's review chunks as stacked draft pull requests.
#
# A work unit that lands on a single branch can still offer host-visible review one
# chunk at a time. This script rebuilds the branch's committed change set as a stack:
# commit k holds the merge base plus every path of chunks 1..k, so the pull request for
# branch k, opened against branch k-1, shows exactly chunk k. The top commit's tree
# equals the head's everywhere except .arc/active/, which is never projected — a
# projection branch must never read as a work unit.
#
# Projection branches are review surfaces, never merge candidates. Rebuild and publish
# after every change to the work-unit branch; commits below the first changed chunk keep
# their identities, so their pull requests are not disturbed. Close the projection when
# the work unit's own pull request merges.
#
#   build <slug> <chunk-file> [--head <ref>] [--base-ref <ref>]
#       Validate the chunk file against the change set, then print the stack, one line
#       per commit: <k> TAB <sha> TAB <chunk>. Line 0 is the merge base.
#   publish <slug> <chunk-file> [--head <ref>] [--base-ref <ref>] [--remote <name>]
#           [--pr <number>] [--no-pr]
#       Build, then push review-projection/<slug>/<k> for every commit in one leased,
#       atomic push, deleting branches a shorter stack no longer uses. Unless --no-pr,
#       open a draft pull request for each chunk that lacks one and retitle the rest.
#   close <slug> [--remote <name>] [--no-pr]
#       Close the projection's open pull requests (unless --no-pr), then delete every
#       projection branch for <slug>.
#
# Chunk file: a `[name]` line starts a chunk; every other line that is not blank or a
# `#` comment is a git pathspec belonging to the current chunk. Chunks stack in file
# order. Every changed path outside .arc/active/ must match exactly one chunk, and every
# chunk must match at least one changed path.
#
# Defaults: --head HEAD, --base-ref origin/main, --remote origin.

set -euo pipefail

# Exit status for a usage error, after BSD sysexits EX_USAGE.
readonly EX_USAGE=64
# Exit status for an invalid chunk file or chunk coverage, after EX_DATAERR.
readonly EX_DATAERR=65

readonly BRANCH_PREFIX="review-projection"
readonly ACTIVE_PATHS=".arc/active"
readonly ACTIVE_EXCLUDE=":(exclude)${ACTIVE_PATHS}"

HEAD_REF="HEAD"
BASE_REF="origin/main"
REMOTE="origin"
PR_NUMBER=""
OPEN_PRS=1
SLUG=""
CHUNK_FILE=""
CHUNK_NAMES=()
CHUNK_SPECS=()
STACK_SHAS=()
HEAD_SHA=""
BASE_SHA=""
WORK=""

usage() {
  cat >&2 <<'EOF'
Usage: review-projection.sh <command> [options]

  build <slug> <chunk-file> [--head <ref>] [--base-ref <ref>]
  publish <slug> <chunk-file> [--head <ref>] [--base-ref <ref>] [--remote <name>]
          [--pr <number>] [--no-pr]
  close <slug> [--remote <name>] [--no-pr]
EOF
}

fail() {
  printf 'review-projection: %s\n' "$1" >&2
  exit "${2:-1}"
}

usage_error() {
  printf 'review-projection: %s\n' "$1" >&2
  usage
  exit "$EX_USAGE"
}

parse_options() {
  while (($# > 0)); do
    case "$1" in
      --head | --base-ref | --remote | --pr)
        (($# >= 2)) || usage_error "$1 needs a value"
        case "$1" in
          --head) HEAD_REF="$2" ;;
          --base-ref) BASE_REF="$2" ;;
          --remote) REMOTE="$2" ;;
          --pr) PR_NUMBER="$2" ;;
        esac
        shift 2
        ;;
      --no-pr)
        OPEN_PRS=0
        shift
        ;;
      *) usage_error "unknown option: $1" ;;
    esac
  done
  if [[ -n "$PR_NUMBER" && ! "$PR_NUMBER" =~ ^[1-9][0-9]*$ ]]; then
    usage_error "--pr needs a pull-request number"
  fi
}

set_slug() {
  [[ "$1" =~ ^[a-z0-9][a-z0-9._-]*$ ]] || usage_error "invalid slug: $1"
  SLUG="$1"
}

# Read the chunk file into CHUNK_NAMES and CHUNK_SPECS (newline-joined pathspecs).
read_chunk_file() {
  local line name existing current=-1
  [[ -f "$CHUNK_FILE" && -r "$CHUNK_FILE" ]] || usage_error "chunk file not readable: $CHUNK_FILE"
  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line%$'\r'}"
    line="${line#"${line%%[![:space:]]*}"}"
    line="${line%"${line##*[![:space:]]}"}"
    if [[ -z "$line" || "$line" == \#* ]]; then
      continue
    fi
    if [[ "$line" =~ ^\[(.+)\]$ ]]; then
      name="${BASH_REMATCH[1]}"
      for existing in ${CHUNK_NAMES[@]+"${CHUNK_NAMES[@]}"}; do
        if [[ "$existing" == "$name" ]]; then
          fail "chunk '$name' is declared twice" "$EX_DATAERR"
        fi
      done
      CHUNK_NAMES+=("$name")
      CHUNK_SPECS+=("")
      current=$((${#CHUNK_NAMES[@]} - 1))
    else
      ((current >= 0)) || fail "pathspec '$line' appears before any [chunk] header" "$EX_DATAERR"
      CHUNK_SPECS[current]+="${line}"$'\n'
    fi
  done <"$CHUNK_FILE"
  ((${#CHUNK_NAMES[@]} > 0)) || fail "chunk file declares no chunk" "$EX_DATAERR"
}

# Load one chunk's pathspecs into the global SPECS array.
load_specs() {
  local spec
  SPECS=()
  while IFS= read -r spec; do
    if [[ -n "$spec" ]]; then
      SPECS+=("$spec")
    fi
  done <<<"${CHUNK_SPECS[$1]}"
}

resolve_range() {
  local base_tip
  HEAD_SHA=$(git rev-parse --verify --quiet "${HEAD_REF}^{commit}") || fail "head '$HEAD_REF' is not a commit"
  base_tip=$(git rev-parse --verify --quiet "${BASE_REF}^{commit}") || fail "base ref '$BASE_REF' is not a commit"
  BASE_SHA=$(git merge-base "$base_tip" "$HEAD_SHA") || fail "'$BASE_REF' and '$HEAD_REF' share no merge base"
}

changed_names() {
  git -c core.quotePath=false diff --name-only --no-renames "$BASE_SHA" "$HEAD_SHA" -- "$@"
}

# Refuse unless every changed path outside .arc/active/ belongs to exactly one chunk.
check_coverage() {
  local i path chunks problems=0
  changed_names . "$ACTIVE_EXCLUDE" | LC_ALL=C sort >"$WORK/changed"
  : >"$WORK/claims"
  for ((i = 0; i < ${#CHUNK_NAMES[@]}; i++)); do
    load_specs "$i"
    if ((${#SPECS[@]} == 0)); then
      printf "review-projection: chunk '%s' lists no pathspec\n" "${CHUNK_NAMES[i]}" >&2
      problems=$((problems + 1))
      continue
    fi
    changed_names "${SPECS[@]}" "$ACTIVE_EXCLUDE" >"$WORK/chunk"
    if [[ ! -s "$WORK/chunk" ]]; then
      printf "review-projection: chunk '%s' covers no changed path\n" "${CHUNK_NAMES[i]}" >&2
      problems=$((problems + 1))
    fi
    while IFS= read -r path; do
      printf '%s\t%s\n' "$path" "${CHUNK_NAMES[i]}"
    done <"$WORK/chunk" >>"$WORK/claims"
  done
  cut -f1 "$WORK/claims" | LC_ALL=C sort >"$WORK/claimed"
  while IFS= read -r path; do
    chunks=$(P="$path" awk -F'\t' '$1 == ENVIRON["P"] { printf "%s%s", sep, $2; sep = ", " }' "$WORK/claims")
    printf "review-projection: path '%s' is claimed by chunks: %s\n" "$path" "$chunks" >&2
    problems=$((problems + 1))
  done < <(uniq -d "$WORK/claimed")
  while IFS= read -r path; do
    printf "review-projection: path '%s' is not covered by any chunk\n" "$path" >&2
    problems=$((problems + 1))
  done < <(LC_ALL=C comm -23 "$WORK/changed" <(LC_ALL=C sort -u "$WORK/claimed"))
  ((problems == 0)) || fail "$problems chunk-file problem(s); nothing was built" "$EX_DATAERR"
  while IFS= read -r path; do
    printf "review-projection: not projected (under %s/): %s\n" "$ACTIVE_PATHS" "$path" >&2
  done < <(changed_names "$ACTIVE_PATHS")
}

# Turn `git diff --raw -z` records into NUL-terminated `update-index --index-info` lines.
raw_to_index_info() {
  local meta path newmode newsha status
  while IFS= read -r -d '' meta && IFS= read -r -d '' path; do
    read -r _ newmode _ newsha status <<<"${meta#:}"
    if [[ "$status" == D ]]; then
      printf '0 %s\t%s\0' "$newsha" "$path"
    else
      printf '%s %s\t%s\0' "$newmode" "$newsha" "$path"
    fi
  done
}

# Build one commit per chunk on the merge base. Commits carry the base's date, so an
# unchanged chunk rebuilds to the same identity.
build_stack() {
  local i count tree commit parent="$BASE_SHA" date index="$WORK/index"
  count=${#CHUNK_NAMES[@]}
  date=$(git log -1 --format='%ct %cz' "$BASE_SHA")
  GIT_INDEX_FILE="$index" git read-tree "$BASE_SHA"
  STACK_SHAS=("$BASE_SHA")
  for ((i = 0; i < count; i++)); do
    load_specs "$i"
    git diff --raw -z --no-renames --no-abbrev "$BASE_SHA" "$HEAD_SHA" -- "${SPECS[@]}" "$ACTIVE_EXCLUDE" \
      | raw_to_index_info | GIT_INDEX_FILE="$index" git update-index -z --index-info
    tree=$(GIT_INDEX_FILE="$index" git write-tree)
    commit=$(GIT_AUTHOR_DATE="$date" GIT_COMMITTER_DATE="$date" git commit-tree "$tree" -p "$parent" \
      -m "Review projection $((i + 1))/$count for $SLUG: ${CHUNK_NAMES[i]}" \
      -m "Projection only; this commit never merges.")
    STACK_SHAS+=("$commit")
    parent="$commit"
  done
  if ! git diff --quiet "$parent" "$HEAD_SHA" -- . "$ACTIVE_EXCLUDE"; then
    fail "the top projection does not match '$HEAD_REF' outside $ACTIVE_PATHS/; nothing was published"
  fi
}

print_stack() {
  local i
  printf '0\t%s\tbase\n' "$BASE_SHA"
  for ((i = 0; i < ${#CHUNK_NAMES[@]}; i++)); do
    printf '%d\t%s\t%s\n' "$((i + 1))" "${STACK_SHAS[i + 1]}" "${CHUNK_NAMES[i]}"
  done
}

projection_ref() {
  printf 'refs/heads/%s/%s/%s' "$BRANCH_PREFIX" "$SLUG" "$1"
}

list_remote_refs() {
  git ls-remote "$REMOTE" "refs/heads/$BRANCH_PREFIX/$SLUG/*" >"$WORK/remote" \
    || fail "cannot list projection branches on '$REMOTE'"
}

remote_sha() {
  awk -v ref="$1" '$2 == ref { print $1 }' "$WORK/remote"
}

# Push the given refspecs atomically, each leased to the value just observed on the remote.
push_leased() {
  local args=() spec ref
  for spec in "$@"; do
    ref="${spec#*:}"
    args+=("--force-with-lease=$ref:$(remote_sha "$ref")")
  done
  git push --atomic "${args[@]}" "$REMOTE" "$@"
}

pr_body() {
  local k=$1 count=$2
  # shellcheck disable=SC2016 # the backticks are literal Markdown
  printf 'Review projection of chunk %s of %s (`%s`) for `%s`. The diff is that chunk alone: this branch holds the ' \
    "$k" "$count" "${CHUNK_NAMES[k - 1]}" "$SLUG"
  printf 'merge base plus chunks 1..%s, opened against the branch for chunk %s.\n\n' "$k" "$((k - 1))"
  printf 'This pull request never merges. Review here is attention, not ARC review evidence. The work unit lands '
  if [[ -n "$PR_NUMBER" ]]; then
    printf 'through #%s; ' "$PR_NUMBER"
  else
    printf 'through its own pull request; '
  fi
  printf 'this projection is rebuilt after each change and closed when that pull request merges.\n'
}

open_pull_requests() {
  local k count head base title existing
  count=${#CHUNK_NAMES[@]}
  for ((k = 1; k <= count; k++)); do
    head="$BRANCH_PREFIX/$SLUG/$k"
    base="$BRANCH_PREFIX/$SLUG/$((k - 1))"
    title="Review projection $k/$count · $SLUG: ${CHUNK_NAMES[k - 1]}"
    existing=$(gh pr list --head "$head" --state open --json number --jq '.[0].number // empty') \
      || fail "cannot list pull requests for '$head'"
    if [[ -n "$existing" ]]; then
      gh pr edit "$existing" --title "$title" --body "$(pr_body "$k" "$count")" >&2 \
        || fail "cannot retitle #$existing"
    else
      gh pr create --draft --base "$base" --head "$head" --title "$title" --body "$(pr_body "$k" "$count")" >&2 \
        || fail "cannot open a pull request for '$head'"
    fi
  done
}

cmd_build() {
  (($# >= 2)) || usage_error "build needs <slug> <chunk-file>"
  set_slug "$1"
  CHUNK_FILE="$2"
  shift 2
  parse_options "$@"
  read_chunk_file
  resolve_range
  check_coverage
  build_stack
}

cmd_publish() {
  local k ref suffix stale=() specs=()
  cmd_build "$@"
  print_stack
  list_remote_refs
  for ((k = 0; k < ${#STACK_SHAS[@]}; k++)); do
    ref=$(projection_ref "$k")
    if [[ "$(remote_sha "$ref")" != "${STACK_SHAS[k]}" ]]; then
      specs+=("${STACK_SHAS[k]}:$ref")
    fi
  done
  while IFS=$'\t' read -r _ ref; do
    suffix="${ref##*/}"
    if [[ ! "$suffix" =~ ^[0-9]+$ ]] || ((10#$suffix >= ${#STACK_SHAS[@]})); then
      stale+=(":$ref")
    fi
  done <"$WORK/remote"
  if ((${#specs[@]} + ${#stale[@]} > 0)); then
    push_leased ${specs[@]+"${specs[@]}"} ${stale[@]+"${stale[@]}"}
  fi
  if ((OPEN_PRS == 1)); then
    open_pull_requests
  fi
}

cmd_close() {
  local number ref deletions=()
  (($# >= 1)) || usage_error "close needs <slug>"
  set_slug "$1"
  shift
  parse_options "$@"
  if ((OPEN_PRS == 1)); then
    while IFS= read -r number; do
      if [[ -n "$number" ]]; then
        gh pr close "$number" --comment "The work unit's pull request merged; this review projection is closed." >&2 \
          || fail "cannot close #$number"
      fi
    done < <(gh pr list --state open --limit 500 --json number,headRefName \
      --jq ".[] | select(.headRefName | startswith(\"$BRANCH_PREFIX/$SLUG/\")) | .number")
  fi
  list_remote_refs
  while IFS=$'\t' read -r _ ref; do
    deletions+=(":$ref")
  done <"$WORK/remote"
  if ((${#deletions[@]} > 0)); then
    push_leased "${deletions[@]}"
  fi
}

main() {
  if (($# == 0)); then
    usage
    exit "$EX_USAGE"
  fi
  local command="$1"
  shift
  WORK=$(mktemp -d "${TMPDIR:-/tmp}/review-projection.XXXXXX")
  trap 'rm -rf "$WORK"' EXIT
  case "$command" in
    build)
      cmd_build "$@"
      print_stack
      ;;
    publish) cmd_publish "$@" ;;
    close) cmd_close "$@" ;;
    -h | --help)
      usage
      exit 0
      ;;
    *) usage_error "unknown command: $command" ;;
  esac
}

main "$@"
