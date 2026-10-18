#!/usr/bin/env bash
# Validate Markdown link targets in worktree files or staged source content.
# Location: .arc/system/.internal/scripts/validate-links.sh
#
# Usage:
#   .arc/system/.internal/scripts/validate-links.sh [--staged] file1.md file2.md ...
#   --staged reads repository-relative source operands from the Git index.
#   Without it, source operands read the worktree, including ignored selections.
#
# Checks each markdown file for:
# - Inline links     [text](target)    — target resolves to an existing file
# - Reference defs   [ref]: target     — target resolves to an existing file
# - Reference usages [text][ref]       — ref has a matching definition in this file
# - Movable artifacts — a `<prefix>-<name>.md` file with a lowercase prefix
#   (`meta-`, `draft-`, `notes-`, another companion, or `cohort-`) under
#   `.arc/active/` or `.arc/backlog/` carries no relative link at all, since it
#   relocates between lifecycle directories
#
# Skips:
# - External links (http, https, mailto, ftp, ssh, git)
# - Anchor-only links (#section)
# - Links inside inline code spans (`...`)
# - Links inside fenced code blocks (```...```)
#
# Resolution rules:
# - Relative paths resolve from the source file's directory, not cwd
# - Anchor fragments (file.md#anchor) are stripped before the file-existence check
# - Absolute paths (starting with /) resolve from the repository root
# - Movable artifact targets and ignored ARC targets are refused
#
# Non-markdown files passed as args are skipped silently.
# Missing worktree sources are skipped silently; staged sources need no worktree file.
#
# Exit codes: 0 = all links resolve, 1 = link violation or staged source read failure.

set -eu

errors=0

# Emit a diagnostic to stderr and track failure.
diagnostic() {
    echo "$1" >&2
    errors=$((errors + 1))
}

# Determine if a target is an external link (scheme-prefixed URL).
is_external() {
    case "$1" in
        http://*|https://*|mailto:*|ftp://*|ftps://*|ssh://*|git://*) return 0 ;;
        *) return 1 ;;
    esac
}

# Strip query and fragment suffixes before resolving a target path.
strip_anchor() {
    local path="${1%%#*}"
    printf '%s\n' "${path%%\?*}"
}

# Normalize absolute paths lexically, including paths that do not exist.
normalize_path() {
    printf '%s\n' "$1" | awk '
        {
            count = split($0, parts, "/"); depth = 0
            for (i = 1; i <= count; i++) {
                if (parts[i] == "" || parts[i] == ".") continue
                if (parts[i] == "..") { if (depth > 0) depth--; continue }
                stack[++depth] = parts[i]
            }
            result = ""
            for (i = 1; i <= depth; i++) result = result "/" stack[i]
            print result == "" ? "/" : result
        }
    '
}

# Decode percent bytes once; preserve malformed escapes for existence feedback.
decode_path() {
    local rest="$1" decoded="" byte
    while [[ "$rest" =~ ^([^%]*)%([[:xdigit:]]{2})(.*)$ ]]; do
        decoded+="${BASH_REMATCH[1]}"
        printf -v byte '%b' "\x${BASH_REMATCH[2]}"
        decoded+="$byte"
        rest="${BASH_REMATCH[3]}"
    done
    printf '%s\n' "$decoded$rest"
}

# Recognize movable targets across every lifecycle directory.
is_movable_target() {
    case "$1" in
        .arc/active/*|.arc/backlog/*|.arc/completed/*) ;;
        *) return 1 ;;
    esac
    [[ "$(basename "$1")" =~ ^[a-z]+-.+\.md$ ]]
}

# Sanitize markdown content: drop fenced code blocks, mask inline code spans.
# Link-like text inside backticks is replaced with a placeholder so the
# link-extraction regexes don't match it.
sanitize() {
    awk '
        BEGIN { in_fence = 0 }
        /^```/ { in_fence = !in_fence; next }
        !in_fence {
            while (match($0, /`[^`]*`/)) {
                $0 = substr($0, 1, RSTART - 1) "CODESPAN" substr($0, RSTART + RLENGTH)
            }
            print
        }
    ' "$@"
}

# Determine if a file is a movable artifact: a work unit's or cohort's record
# inside a lifecycle directory, which moves by rename with no content edit.
is_movable() {
    case "/$1" in
        */.arc/active/*|*/.arc/backlog/*) ;;
        *) return 1 ;;
    esac
    [[ "$(basename "$1")" =~ ^[a-z]+-.+\.md$ ]]
}

# Validate that a resolved target exists.
# Args: source_file source_dir target movable
validate_target() {
    local source_file="$1"
    local source_dir="$2"
    local target="$3"
    local movable="$4"

    # Trim a trailing title (markdown allows `path "title"` in definitions).
    target="${target%% *}"

    [ -z "$target" ] && return 0
    is_external "$target" && return 0

    # Anchor-only link — self-reference, no file to check.
    case "$target" in \#*) return 0 ;; esac

    local file_part
    file_part=$(decode_path "$(strip_anchor "$target")")
    [ -z "$file_part" ] && return 0

    # A relative link from a movable artifact breaks on its next relocation.
    if [ "$movable" = 1 ]; then
        case "$file_part" in
            /*) ;;
            *)
                diagnostic "$source_file: relative link in movable artifact -> $target"
                return 0
                ;;
        esac
    fi

    local resolved
    case "$file_part" in
        /*) resolved="${repo_root}/${file_part#/}" ;;
        *)  resolved="${source_dir}/${file_part}" ;;
    esac
    resolved=$(normalize_path "$resolved")

    case "$resolved" in
        "$repo_root"/.arc/*)
            local relative="${resolved#"$repo_root"/}"
            if is_movable_target "$relative"; then
                diagnostic "$source_file: link to movable artifact -> $target"
                return 0
            fi
            if [ "$has_repository" = 1 ]; then
                local ignored_status=0
                git -C "$repo_root" check-ignore -q -- "$relative" || ignored_status=$?
                if [ "$ignored_status" = 0 ]; then
                    diagnostic "$source_file: link to ignored ARC path -> $target"
                    return 0
                elif [ "$ignored_status" != 1 ]; then
                    diagnostic "$source_file: cannot inspect ARC target ignore rules -> $target"
                    return 0
                fi
            fi
            ;;
    esac

    if [ ! -e "$resolved" ]; then
        # Package source convention: rendered output paths (`<file>.md`) may be
        # backed by `<file>.template.md` in `packages/arc-framework/arc/`. Try the
        # templated form before reporting a broken link. See
        # `src/lib/classification.ts` `toOutputPath()` for the rename canonical.
        case "$resolved" in
            *.md)
                if [ -e "${resolved%.md}.template.md" ]; then
                    return 0
                fi
                ;;
        esac
        diagnostic "$source_file: broken link -> $target"
    fi
}

# Validate a single markdown file.
validate_file() {
    local source_file="$1"
    if [ "$staged" = 0 ] && [ ! -f "$source_file" ]; then return 0; fi
    case "$source_file" in *.md) ;; *) return 0 ;; esac

    # Skip template source files. Their links use post-install-relative
    # paths (e.g., `AGENT-BRIEF.ARC.md` from a template, or
    # `[ARCHIVE_PATH]` placeholders) that resolve at install destination,
    # not at storage location. Install-integration tests validate the
    # rendered output.
    local basename
    basename=$(basename "$source_file")
    case "$basename" in
        *.template.md|template-*.md) return 0 ;;
    esac

    # Skip archived content. Archives document prior state at archival
    # time; rewriting links violates "document what is, not what was"
    # (DEV-RULES.ARC § Documentation Boundaries).
    case "$source_file" in
        */completed/*|completed/*) return 0 ;;
    esac

    local source_dir
    local sanitized
    if [ "$staged" = 1 ]; then
        source_dir=$(normalize_path "$repo_root/$(dirname "$source_file")")
        local staged_content
        if ! staged_content=$(git show ":$source_file" 2>/dev/null); then
            diagnostic "$source_file: could not read staged Markdown; restage the file and retry"
            return 0
        fi
        sanitized=$(printf '%s\n' "$staged_content" | sanitize)
    else
        source_dir=$(cd "$(dirname "$source_file")" && pwd -P)
        sanitized=$(sanitize "$source_file")
    fi

    local movable=0
    is_movable "$source_dir/$basename" && movable=1

    # Reference definitions: "[key]: value" at start of line.
    local defs
    defs=$(echo "$sanitized" | grep -E '^\[[^]]+\]:[[:space:]]*[^[:space:]]' || true)

    # Validate each reference definition's target.
    while IFS= read -r line; do
        [ -z "$line" ] && continue
        local value
        value=$(echo "$line" | sed -nE 's/^\[[^]]+\]:[[:space:]]*(.+)$/\1/p')
        [ -n "$value" ] && validate_target "$source_file" "$source_dir" "$value" "$movable"
    done < <(echo "$defs")

    # Validate inline link targets: [text](target).
    while IFS= read -r match; do
        [ -z "$match" ] && continue
        local target
        target=$(echo "$match" | sed -E 's/.*\(([^)]+)\)$/\1/')
        validate_target "$source_file" "$source_dir" "$target" "$movable"
    done < <(echo "$sanitized" | grep -oE '\[[^]]*\]\([^)]+\)' || true)

    # Validate reference usages: [text][ref]. Skip definition lines which start
    # with "[key]:" — the usage regex would otherwise false-match them.
    while IFS= read -r match; do
        [ -z "$match" ] && continue
        local ref
        ref=$(echo "$match" | sed -E 's/.*\[([^]]+)\]$/\1/')
        if ! echo "$defs" | grep -qiE "^\[${ref}\]:"; then
            diagnostic "$source_file: undefined reference -> [$ref]"
        fi
    done < <(echo "$sanitized" | grep -v '^\[[^]]*\]:' | grep -oE '\[[^]]*\]\[[^]]+\]' || true)
}

# Main
staged=0
if [ "${1:-}" = --staged ]; then staged=1; shift; fi
if [ $# -eq 0 ]; then
    exit 0
fi

has_repository=1
repo_root=$(git rev-parse --show-toplevel 2>/dev/null) || { repo_root=$(pwd -P); has_repository=0; }
repo_root=$(cd "$repo_root" && pwd -P)
repo_root=$(normalize_path "$repo_root")

for file in "$@"; do
    validate_file "$file"
done

if [ "$errors" -gt 0 ]; then
    exit 1
fi
exit 0
