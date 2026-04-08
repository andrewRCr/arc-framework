#!/bin/bash
# Project-specific pre-commit check: package-project sync direction.
# Called from .husky/pre-commit AFTER the ARC pre-commit hook.
#
# This check is dev-only — it only applies to the ARC framework repo where
# packages/arc-framework/arc/ (authoritative source) and .arc/ (project instance)
# coexist. It does NOT ship to adopters via the ARC hook system.
#
# When .arc/ Framework files are staged without their package source counterpart,
# warns that the edit may be in the wrong copy. Configurable and Scaffolded files
# are expected to be edited in .arc/ directly — no warning for those.

# Source shared library for colors
. .arc/system/scripts/arc-lib.sh
YELLOW="$ARC_YELLOW"
NC="$ARC_NC"

manifest_file=".arc/system/.internal/manifest.json"
pkg_arc="packages/arc-framework/arc"

# Skip if manifest or package directory doesn't exist
if [ ! -f "$manifest_file" ] || [ ! -d "$pkg_arc" ]; then
    exit 0
fi

framework_arc_files=$(git diff --cached --name-only --diff-filter=ACMR | \
    grep -E '^\.arc/(README\.md|reference/|system/)' | \
    grep -v '\.arc/system/\.internal/' || true)

if [ -z "$framework_arc_files" ]; then
    exit 0
fi

unsynced_framework=""
while IFS= read -r arc_file; do
    # Get .arc/-relative path for manifest lookup
    rel_path="${arc_file#.arc/}"
    # Check classification in manifest (simple grep — one entry per file)
    classification=$(grep -A1 "\"${rel_path}\"" "$manifest_file" 2>/dev/null | \
        grep '"classification"' | sed 's/.*: *"\(.*\)".*/\1/' || true)
    if [ "$classification" = "Framework" ]; then
        # Check if the package counterpart is also staged.
        # Template files render from .template.md (package) to .md (.arc/),
        # so check both the direct path and the .template.md variant.
        pkg_file="$pkg_arc/$rel_path"
        pkg_template="${pkg_file%.md}.template.md"
        pkg_staged=$(git diff --cached --name-only | grep -F -e "$pkg_file" -e "$pkg_template" || true)
        if [ -z "$pkg_staged" ]; then
            unsynced_framework="${unsynced_framework}${arc_file}\n"
        fi
    fi
done <<< "$framework_arc_files"

if [ -n "$unsynced_framework" ]; then
    echo -e "${YELLOW}Warning: Framework file(s) edited in .arc/ without package counterpart:${NC}"
    echo -e "$unsynced_framework" | sed '/^$/d' | sed 's/^/   /'
    echo "   Framework files are authoritative in packages/arc-framework/arc/"
    echo "   Edit the package source and sync to .arc/, or stage both copies"
fi
