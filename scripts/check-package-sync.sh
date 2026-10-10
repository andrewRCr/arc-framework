#!/bin/bash
# Project-specific package-project sync direction and integrity check.
# Supplied paths use ARC_CHECK_BASE and ARC_CHECK_MERGED; no paths select the
# current index changes against HEAD and any pending merge parent.
#
# This check is dev-only — it only applies to the ARC framework repo where
# packages/arc-framework/arc/ (authoritative source) and .arc/ (project instance)
# coexist. It does NOT ship to adopters via the ARC hook system.
#
# Two checks per selected .arc/ file (per manifest classification):
# 1. Framework files selected without package counterpart → warning (wrong direction)
# 2. Configurable files byte-identical to package source → error (blind cp).
#    Configurable files diverge by design; identical content means project
#    overrides were silently overwritten (e.g., by `cp pkg/<f> .arc/<f>`).

# Source shared library for colors
# shellcheck source=../.arc/system/.internal/scripts/arc-lib.sh
. .arc/system/.internal/scripts/arc-lib.sh
RED="$ARC_RED"
YELLOW="$ARC_YELLOW"
NC="$ARC_NC"

manifest_file=".arc/system/.internal/manifest.json"
pkg_arc="packages/arc-framework/arc"

# Skip if manifest or package directory doesn't exist
if [ ! -f "$manifest_file" ] || [ ! -d "$pkg_arc" ]; then
    exit 0
fi

if [ "$#" -gt 0 ]; then
    check_base="${ARC_CHECK_BASE:-}"
    if [ -z "$check_base" ]; then
        echo "Error: ARC_CHECK_BASE is required when package-sync paths are supplied." >&2
        exit 1
    fi
    changed_paths=("$@")
else
    check_base="HEAD"
    changed_paths=()
    while IFS= read -r -d '' changed_path; do
        changed_paths+=("$changed_path")
    done < <(git diff --cached --name-only --diff-filter=ACMR -z)
fi

unsynced_framework=""
clobbered_configurable=""
merged_parents=()
if [ "$#" -gt 0 ]; then
    read -r -a merged_parents <<< "${ARC_CHECK_MERGED:-}"
else
    merge_head=$(git rev-parse -q --verify MERGE_HEAD 2>/dev/null || true)
    if [ -n "$merge_head" ]; then
        merged_parents=("$merge_head")
    fi
fi
for arc_file in "${changed_paths[@]}"; do
    case "$arc_file" in
        .arc/system/.internal/*) continue ;;
        .arc/README.md|.arc/reference/*|.arc/system/*) ;;
        *) continue ;;
    esac
    staged_content=$(git rev-parse -q --verify ":$arc_file" 2>/dev/null || true)
    # A checked blob inherited verbatim from any incoming parent was not authored here.
    for parent in "${merged_parents[@]}"; do
        parent_content=$(git rev-parse -q --verify "$parent:$arc_file" 2>/dev/null || true)
        if [ -n "$staged_content" ] && [ "$staged_content" = "$parent_content" ]; then
            continue 2
        fi
    done
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
            pkg_staged=""
            for changed_path in "${changed_paths[@]}"; do
                if [ "$changed_path" = "$pkg_file" ] || [ "$changed_path" = "$pkg_template" ]; then
                    pkg_staged="$changed_path"
                    break
                fi
            done
            if [ -z "$pkg_staged" ]; then
                unsynced_framework="${unsynced_framework}${arc_file}\n"
            fi
            ;;
        Configurable)
            pkg_file="$pkg_arc/$rel_path"
            pkg_content=$(git rev-parse -q --verify ":$pkg_file" 2>/dev/null || true)
            base_arc=$(git rev-parse -q --verify "$check_base:$arc_file" 2>/dev/null || true)
            base_pkg=$(git rev-parse -q --verify "$check_base:$pkg_file" 2>/dev/null || true)
            if [ -n "$staged_content" ] \
                && [ "$staged_content" = "$pkg_content" ] \
                && [ "$base_arc" != "$base_pkg" ]; then
                # No override remains attributable to the base when an incoming
                # parent's two copies have already converged.
                for parent in "${merged_parents[@]}"; do
                    parent_arc=$(git rev-parse -q --verify "$parent:$arc_file" 2>/dev/null || true)
                    parent_pkg=$(git rev-parse -q --verify "$parent:$pkg_file" 2>/dev/null || true)
                    if [ -n "$parent_arc" ] && [ "$parent_arc" = "$parent_pkg" ]; then
                        continue 2
                    fi
                done
                clobbered_configurable="${clobbered_configurable}${arc_file}\n"
            fi
            ;;
    esac
done

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
