#!/bin/bash
# Project-specific pre-commit check: package-project sync direction + integrity.
# Called from .husky/pre-commit AFTER the ARC pre-commit hook.
#
# This check is dev-only — it only applies to the ARC framework repo where
# packages/arc-framework/arc/ (authoritative source) and .arc/ (project instance)
# coexist. It does NOT ship to adopters via the ARC hook system.
#
# Two checks per staged .arc/ file (per manifest classification):
# 1. Framework files staged without package counterpart → warning (wrong direction)
# 2. Configurable files byte-identical to package source → error (blind cp).
#    Configurable files diverge by design; identical content means project
#    overrides were silently overwritten (e.g., by `cp pkg/<f> .arc/<f>`).

# Source shared library for colors
. .arc/system/scripts/arc-lib.sh
RED="$ARC_RED"
YELLOW="$ARC_YELLOW"
NC="$ARC_NC"

manifest_file=".arc/system/.internal/manifest.json"
pkg_arc="packages/arc-framework/arc"

# Skip if manifest or package directory doesn't exist
if [ ! -f "$manifest_file" ] || [ ! -d "$pkg_arc" ]; then
    exit 0
fi

staged_arc_files=$(git diff --cached --name-only --diff-filter=ACMR | \
    grep -E '^\.arc/(README\.md|reference/|system/)' | \
    grep -v '\.arc/system/\.internal/' || true)

if [ -z "$staged_arc_files" ]; then
    exit 0
fi

unsynced_framework=""
clobbered_configurable=""
while IFS= read -r arc_file; do
    [ -z "$arc_file" ] && continue
    # Get .arc/-relative path for manifest lookup
    rel_path="${arc_file#.arc/}"
    # Check classification in manifest (simple grep — one entry per file)
    classification=$(grep -A1 "\"${rel_path}\"" "$manifest_file" 2>/dev/null | \
        grep '"classification"' | sed 's/.*: *"\(.*\)".*/\1/' || true)
    case "$classification" in
        Framework)
            # Check if the package counterpart is also staged.
            # Template files render from .template.md (package) to .md (.arc/),
            # so check both the direct path and the .template.md variant.
            pkg_file="$pkg_arc/$rel_path"
            pkg_template="${pkg_file%.md}.template.md"
            pkg_staged=$(git diff --cached --name-only | grep -F -e "$pkg_file" -e "$pkg_template" || true)
            if [ -z "$pkg_staged" ]; then
                unsynced_framework="${unsynced_framework}${arc_file}\n"
            fi
            ;;
        Configurable)
            # Configurable files diverge by design when project overrides exist.
            # Flag only when THIS commit makes the .arc/ copy byte-identical to
            # the package source — i.e., overrides existed at HEAD but are gone
            # in the staged version. Files already identical at HEAD are
            # legitimate (project inherits the template default, no overrides
            # to clobber).
            pkg_file="$pkg_arc/$rel_path"
            if [ -f "$pkg_file" ]; then
                staged_content=$(git show ":$arc_file" 2>/dev/null || true)
                head_content=$(git show "HEAD:$arc_file" 2>/dev/null || true)
                pkg_content=$(cat "$pkg_file")
                if [ -n "$staged_content" ] \
                    && [ "$staged_content" = "$pkg_content" ] \
                    && [ "$head_content" != "$pkg_content" ]; then
                    clobbered_configurable="${clobbered_configurable}${arc_file}\n"
                fi
            fi
            ;;
    esac
done <<< "$staged_arc_files"

# Configurable blind-sync — hard error. Surfaced first so it's visible above
# any Framework warning when both fire on the same commit.
if [ -n "$clobbered_configurable" ]; then
    echo -e "${RED}Error: Configurable file(s) in .arc/ identical to package source:${NC}"
    echo -e "$clobbered_configurable" | sed '/^$/d' | sed 's/^/   /'
    echo "   Configurable files diverge by design — package source carries template"
    echo "   defaults; .arc/ instance carries this project's overrides."
    echo "   Byte-identical content means a 'cp' (or equivalent) overwrote those overrides."
    echo ""
    echo "   Recover: restore the .arc/ copy with project values via targeted edits."
    echo "   See reference/strategies/project/strategy-package-project-sync.md"
fi

if [ -n "$unsynced_framework" ]; then
    echo -e "${YELLOW}Warning: Framework file(s) edited in .arc/ without package counterpart:${NC}"
    echo -e "$unsynced_framework" | sed '/^$/d' | sed 's/^/   /'
    echo "   Framework files are authoritative in packages/arc-framework/arc/"
    echo "   Edit the package source and sync to .arc/, or stage both copies"
fi

# Exit non-zero only on Configurable blind-sync. Framework warning is advisory.
if [ -n "$clobbered_configurable" ]; then
    exit 1
fi
exit 0
