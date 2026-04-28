#!/usr/bin/env bash
# Validate markdown link targets in staged files.
# Location: .arc/system/scripts/validate-links.sh
#
# Usage:
#   .arc/system/scripts/validate-links.sh file1.md file2.md ...
#
# Checks each markdown file for:
# - Inline links     [text](target)    — target resolves to an existing file
# - Reference defs   [ref]: target     — target resolves to an existing file
# - Reference usages [text][ref]       — ref has a matching definition in this file
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
# - Absolute paths (starting with /) are used as-is
#
# Non-markdown files passed as args are skipped silently.
# Missing source files are skipped silently (covers deletions during staging).
#
# Exit codes: 0 = all links resolve, 1 = broken or undefined reference found.

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

# Strip anchor fragment from a target. "file.md#anchor" -> "file.md".
strip_anchor() {
    echo "${1%%#*}"
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
    ' "$1"
}

# Validate that a resolved target exists.
# Args: source_file source_dir target
validate_target() {
    local source_file="$1"
    local source_dir="$2"
    local target="$3"

    # Trim a trailing title (markdown allows `path "title"` in definitions).
    target="${target%% *}"

    [ -z "$target" ] && return 0
    is_external "$target" && return 0

    # Anchor-only link — self-reference, no file to check.
    case "$target" in \#*) return 0 ;; esac

    local file_part
    file_part=$(strip_anchor "$target")
    [ -z "$file_part" ] && return 0

    local resolved
    case "$file_part" in
        /*) resolved="$file_part" ;;
        *)  resolved="${source_dir}/${file_part}" ;;
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
    [ -f "$source_file" ] || return 0
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
        */reference/archive/*|reference/archive/*) return 0 ;;
    esac

    local source_dir
    source_dir=$(dirname "$source_file")

    local sanitized
    sanitized=$(sanitize "$source_file")

    # Reference definitions: "[key]: value" at start of line.
    local defs
    defs=$(echo "$sanitized" | grep -E '^\[[^]]+\]:[[:space:]]*[^[:space:]]' || true)

    # Validate each reference definition's target.
    while IFS= read -r line; do
        [ -z "$line" ] && continue
        local value
        value=$(echo "$line" | sed -nE 's/^\[[^]]+\]:[[:space:]]*(.+)$/\1/p')
        [ -n "$value" ] && validate_target "$source_file" "$source_dir" "$value"
    done < <(echo "$defs")

    # Validate inline link targets: [text](target).
    while IFS= read -r match; do
        [ -z "$match" ] && continue
        local target
        target=$(echo "$match" | sed -E 's/.*\(([^)]+)\)$/\1/')
        validate_target "$source_file" "$source_dir" "$target"
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
if [ $# -eq 0 ]; then
    exit 0
fi

for file in "$@"; do
    validate_file "$file"
done

if [ "$errors" -gt 0 ]; then
    exit 1
fi
exit 0
