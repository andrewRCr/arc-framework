#!/bin/sh
# Verify ARC installation integrity — config, files, references, hooks, session state.
# Location: .arc/system/scripts/verify-integrity.sh
#
# Run from repository root:
#   .arc/system/scripts/verify-integrity.sh
#
# Output: one line per check with ERROR/WARN/INFO prefix.
# Exit codes: 0 = all pass, 1 = warnings only, 2 = errors present.

set -e

# Source shared library
. "$(dirname "$0")/arc-lib.sh"

# ============================================================================
# Counters and helpers
# ============================================================================

errors=0
warnings=0
info=0

pass() {
    echo "PASS  $1"
}

warn() {
    warnings=$((warnings + 1))
    echo "WARN  $1"
}

error() {
    errors=$((errors + 1))
    echo "ERROR $1"
}

info() {
    info=$((info + 1))
    echo "INFO  $1"
}

# ARC root directory (relative to repo root)
ARC_DIR="${ARC_DIR:-.arc}"

# ============================================================================
# 1. Config validation
# ============================================================================

echo "--- Config Validation ---"

config_script="$ARC_DIR/system/scripts/validate-config.sh"
if [ -f "$config_script" ] && [ -x "$config_script" ]; then
    # Capture output and exit code
    config_exit=0
    config_output=$(ARC_CONFIG_FILE="$ARC_DIR/system/arc-config.yml" "$config_script" 2>&1) || config_exit=$?

    # Relay output (skip the Summary line — we produce our own)
    echo "$config_output" | grep -v '^Summary:' | grep -v '^$'

    if [ "$config_exit" -eq 2 ]; then
        error "Config validation found errors"
    elif [ "$config_exit" -eq 1 ]; then
        warn "Config validation found warnings"
    else
        pass "Config validation clean"
    fi
else
    warn "validate-config.sh not found or not executable"
fi

echo ""

# ============================================================================
# 2. File structure — core files exist
# ============================================================================

echo "--- File Structure ---"

check_file() {
    local path="$1"
    local description="$2"

    if [ -f "$path" ]; then
        pass "$description: $path"
    else
        error "$description missing: $path"
    fi
}

# Core files that must exist in every ARC installation
check_file "$ARC_DIR/system/agent/AGENT-BRIEFING.ARC.md" "Agent briefing (ARC)"
check_file "$ARC_DIR/system/agent/AGENT-BRIEFING.PROJECT.md" "Agent briefing (project)"
check_file "$ARC_DIR/reference/constitution/DEV-RULES.ARC.md" "Dev rules (ARC)"
check_file "$ARC_DIR/reference/constitution/DEV-RULES.PROJECT.md" "Dev rules (project)"
check_file "$ARC_DIR/reference/QUICK-REFERENCE.md" "Quick reference"
check_file "$ARC_DIR/active/WORK-STATUS.md" "Work status"
check_file "$ARC_DIR/system/arc-config.yml" "Config file"
check_file "$ARC_DIR/system/workflows/arc-methods.md" "Methods file"
check_file "$ARC_DIR/system/workflows/arc-extensions.md" "Extensions file"

# Strategy index
check_file "$ARC_DIR/reference/strategies/STRATEGY-INDEX.md" "Strategy index"

# Workflows
check_file "$ARC_DIR/system/workflows/arc/session-lifecycle/session-init.md" "Session init workflow"
check_file "$ARC_DIR/system/workflows/arc/3_process-task-loop.md" "Process task loop"

# Scripts
check_file "$ARC_DIR/system/scripts/arc-lib.sh" "Shared library"
check_file "$ARC_DIR/system/scripts/validate-config.sh" "Config validator"

# PM-mode-dependent files
pm_mode=$(ARC_CONFIG_FILE="$ARC_DIR/system/arc-config.yml" arc_config_get "pm.mode" "none")
if [ "$pm_mode" = "arc-in-git" ]; then
    check_file "$ARC_DIR/backlog/ROADMAP.md" "Roadmap (arc-in-git)"
fi

echo ""

# ============================================================================
# 3. Hook status
# ============================================================================

echo "--- Hook Status ---"

hooks_dir="$ARC_DIR/system/githooks"
hooks_pre_commit=$(ARC_CONFIG_FILE="$ARC_DIR/system/arc-config.yml" arc_config_get "hooks.pre_commit" "enabled")
hooks_commit_msg=$(ARC_CONFIG_FILE="$ARC_DIR/system/arc-config.yml" arc_config_get "hooks.commit_msg" "enabled")

check_hook() {
    local hook_name="$1"
    local hook_enabled="$2"
    local hook_path="$hooks_dir/$hook_name"

    if [ "$hook_enabled" = "disabled" ]; then
        info "$hook_name hook disabled in config"
        return
    fi

    if [ ! -f "$hook_path" ]; then
        error "$hook_name hook file missing: $hook_path"
        return
    fi

    if [ ! -x "$hook_path" ]; then
        warn "$hook_name hook exists but is not executable: $hook_path"
        return
    fi

    pass "$hook_name hook: exists and executable"
}

check_hook "pre-commit" "$hooks_pre_commit"
check_hook "commit-msg" "$hooks_commit_msg"

# Check that core.hooksPath points to the right directory
configured_hooks_path=$(git config core.hooksPath 2>/dev/null || echo "")
if [ -z "$configured_hooks_path" ]; then
    warn "git core.hooksPath not set (hooks may not run)"
elif [ "$configured_hooks_path" = "$hooks_dir" ] || [ "$configured_hooks_path" = "$hooks_dir/" ]; then
    pass "core.hooksPath: $configured_hooks_path"
else
    warn "core.hooksPath is '$configured_hooks_path' (expected: $hooks_dir)"
fi

echo ""

# ============================================================================
# 4. Strategy index consistency
# ============================================================================

echo "--- Strategy Index ---"

strategy_index="$ARC_DIR/reference/strategies/STRATEGY-INDEX.md"
strategy_dir="$ARC_DIR/reference/strategies/arc"

if [ -f "$strategy_index" ] && [ -d "$strategy_dir" ]; then
    # Extract strategy filenames referenced in the index
    # Pattern: `arc/strategy-*.md` in backtick code spans
    indexed_files=$(grep -oE 'arc/strategy-[a-z0-9-]+\.md' "$strategy_index" 2>/dev/null | sort -u)

    # Check indexed entries exist as files
    for entry in $indexed_files; do
        entry_path="$ARC_DIR/reference/strategies/$entry"
        if [ ! -f "$entry_path" ]; then
            error "Strategy indexed but file missing: $entry"
        fi
    done

    # Check files exist that aren't indexed
    for file in "$strategy_dir"/strategy-*.md; do
        [ -f "$file" ] || continue
        basename=$(basename "$file")
        if ! echo "$indexed_files" | grep -q "$basename"; then
            warn "Strategy file exists but not indexed: arc/$basename"
        fi
    done

    pass "Strategy index consistency checked"
else
    if [ ! -f "$strategy_index" ]; then
        error "Strategy index missing"
    fi
    if [ ! -d "$strategy_dir" ]; then
        warn "Strategy directory missing: $strategy_dir"
    fi
fi

echo ""

# ============================================================================
# 5. Reference integrity — reference-style links in key documents
# ============================================================================

echo "--- Reference Integrity ---"

check_refs_in_file() {
    local file="$1"
    local file_dir
    file_dir=$(dirname "$file")

    [ -f "$file" ] || return 0

    # Extract reference-style link definitions: [name]: path
    # Skip URLs (http://, https://) and anchors (#)
    local refs
    refs=$(grep -E '^\[.+\]: [^#h]' "$file" 2>/dev/null || true)

    [ -z "$refs" ] && return 0

    echo "$refs" | while IFS= read -r line; do
        # Extract the path (after ]: and before any anchor #)
        target=$(echo "$line" | sed -E 's/^\[.+\]: //' | sed 's/#.*//' | sed 's/[[:space:]]*$//')

        # Skip empty targets
        [ -z "$target" ] && continue

        # Resolve relative to the file's directory
        resolved="$file_dir/$target"

        if [ ! -f "$resolved" ]; then
            ref_name=$(echo "$line" | sed -E 's/^\[(.+)\]:.*/\1/')
            # Print directly — can't increment parent counters from subshell
            echo "ERROR Broken link [$ref_name] in $(basename "$file"): $target"
        fi
    done
}

# Check key documents for broken reference-style links.
# Capture output to count errors (while loop runs in subshell).
ref_found_errors=false
for ref_file in \
    "$ARC_DIR/system/agent/AGENT-BRIEFING.ARC.md" \
    "$ARC_DIR/system/agent/AGENT-BRIEFING.PROJECT.md" \
    "$ARC_DIR/reference/constitution/DEV-RULES.ARC.md" \
    "$ARC_DIR/reference/constitution/DEV-RULES.PROJECT.md" \
    "$ARC_DIR/system/workflows/arc-methods.md" \
    "$ARC_DIR/system/workflows/arc-extensions.md" \
    "$ARC_DIR/reference/strategies/STRATEGY-INDEX.md"; do
    output=$(check_refs_in_file "$ref_file")
    if [ -n "$output" ]; then
        echo "$output"
        ref_count=$(echo "$output" | grep -c '^ERROR' || true)
        errors=$((errors + ref_count))
        ref_found_errors=true
    fi
done

if [ "$ref_found_errors" = false ]; then
    pass "Reference integrity checked"
fi

echo ""

# ============================================================================
# 6. Session state
# ============================================================================

echo "--- Session State ---"

work_status="$ARC_DIR/active/WORK-STATUS.md"

if [ -f "$work_status" ]; then
    # Check task list path if specified
    task_list_line=$(grep -E '^\*\*Task List\*\*' "$work_status" 2>/dev/null | head -1)
    if [ -n "$task_list_line" ]; then
        task_list_path=$(echo "$task_list_line" | sed -E 's/.*`([^`]+)`.*/\1/' | sed 's/^[[:space:]]*//')

        if echo "$task_list_path" | grep -q '\[none\]'; then
            info "No active task list"
        elif [ -n "$task_list_path" ] && [ "$task_list_path" != "$task_list_line" ]; then
            if [ -f "$task_list_path" ]; then
                pass "Task list exists: $task_list_path"

                # Check next task reference resolves
                next_task_line=$(grep -E '^\*\*Next Task\*\*' "$work_status" 2>/dev/null | head -1)
                if [ -n "$next_task_line" ]; then
                    # Extract task number (e.g., "Task 3.5")
                    task_num=$(echo "$next_task_line" | grep -oE 'Task [0-9]+\.[0-9]+' | head -1)
                    if [ -n "$task_num" ]; then
                        # Extract just the number part for searching
                        num_part=$(echo "$task_num" | sed 's/Task //')
                        if grep -q "$num_part" "$task_list_path" 2>/dev/null; then
                            pass "Next task reference resolves: $task_num"
                        else
                            warn "Next task reference may be stale: $task_num not found in task list"
                        fi
                    fi
                fi
            else
                error "Task list path in WORK-STATUS.md does not exist: $task_list_path"
            fi
        fi
    fi
else
    error "WORK-STATUS.md missing"
fi

echo ""

# ============================================================================
# 7. Method/extension structure
# ============================================================================

echo "--- Methods & Extensions ---"

methods_file="$ARC_DIR/system/workflows/arc-methods.md"
extensions_file="$ARC_DIR/system/workflows/arc-extensions.md"

check_section() {
    local file="$1"
    local section="$2"
    local file_label
    file_label=$(basename "$file")

    if grep -q "^## $section" "$file" 2>/dev/null; then
        pass "$file_label: ## $section present"
    else
        error "$file_label: ## $section section missing"
    fi
}

if [ -f "$methods_file" ]; then
    # Check for expected method sections
    for method in commit-format commit-context-format issue-triage test-first session-state \
                  pre-merge-review review-triage quality-gate-commands; do
        check_section "$methods_file" "$method"
    done

    # Check each method has .override and .default subsections
    for method in commit-format commit-context-format issue-triage test-first session-state \
                  pre-merge-review review-triage quality-gate-commands; do
        if ! grep -q "^### ${method}.override" "$methods_file" 2>/dev/null; then
            error "arc-methods.md: ### ${method}.override subsection missing"
        fi
        if ! grep -q "^### ${method}.default" "$methods_file" 2>/dev/null; then
            error "arc-methods.md: ### ${method}.default subsection missing"
        fi
    done
fi

if [ -f "$extensions_file" ]; then
    for ext in post-task-quality post-unit-quality post-task-completion post-context-load \
               pre-stage-review pre-merge-review; do
        check_section "$extensions_file" "$ext"
    done
fi

echo ""

# ============================================================================
# 8. Manifest awareness
# ============================================================================

echo "--- Manifest ---"

manifest="$ARC_DIR/.arc-manifest.json"
if [ -f "$manifest" ]; then
    info "Manifest found: $manifest"
    # Future: validate manifest entries match files on disk
else
    info "No manifest file (pre-CLI or fresh install)"
fi

echo ""

# ============================================================================
# Summary
# ============================================================================

echo "==========================================="
if [ "$errors" -gt 0 ]; then
    printf "${ARC_RED}Integrity check: %d errors, %d warnings, %d info${ARC_NC}\n" "$errors" "$warnings" "$info"
elif [ "$warnings" -gt 0 ]; then
    printf "${ARC_YELLOW}Integrity check: 0 errors, %d warnings, %d info${ARC_NC}\n" "$warnings" "$info"
else
    printf "${ARC_GREEN}Integrity check: all clear (%d info)${ARC_NC}\n" "$info"
fi

if [ "$errors" -gt 0 ]; then
    exit 2
elif [ "$warnings" -gt 0 ]; then
    exit 1
else
    exit 0
fi
