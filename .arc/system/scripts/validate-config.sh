#!/usr/bin/env bash
# Validate arc-config.yml — enum checking, cross-field dependencies, unknown keys.
# Location: .arc/system/scripts/validate-config.sh
#
# Run from repository root:
#   .arc/system/scripts/validate-config.sh
#
# Output: one line per check with PASS/WARN/ERROR prefix.
# Exit codes: 0 = all pass, 1 = warnings only, 2 = errors present.

set -e

# Source shared library
. "$(dirname "$0")/arc-lib.sh"

# ============================================================================
# Counters
# ============================================================================

errors=0
warnings=0
passes=0

pass() {
    passes=$((passes + 1))
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

# ============================================================================
# Prerequisite: config file exists
# ============================================================================

if [ ! -f "$ARC_CONFIG_FILE" ]; then
    error "Config file not found: $ARC_CONFIG_FILE"
    echo ""
    echo "Summary: 0 passed, 0 warnings, 1 error"
    exit 2
fi

pass "Config file exists: $ARC_CONFIG_FILE"

# ============================================================================
# Enum validation
# ============================================================================
# Each entry: key | valid values (pipe-separated) | default

validate_enum() {
    local key="$1"
    local valid="$2"
    local default="$3"

    local value
    value=$(arc_config_get "$key" "")

    if [ -z "$value" ]; then
        # Key absent or empty — fine, default applies
        pass "$key: [absent, default: $default]"
        return
    fi

    if echo "$valid" | grep -qw "$value"; then
        pass "$key: $value"
    else
        error "$key: '$value' is not valid (expected: $valid)"
    fi
}

# Branch model
# branch.base is freeform (any branch name) — just check presence
bb_value=$(arc_config_get "branch.base" "")
if [ -n "$bb_value" ]; then
    pass "branch.base: $bb_value"
else
    pass "branch.base: [absent, default: main]"
fi

validate_enum "branch.protection" "partial full" "partial"

# Commit discipline
validate_enum "commit.format" "conventional custom any" "conventional"
validate_enum "commit.context_footer" "required recommended custom disabled" "required"

# Hooks
validate_enum "hooks.pre_commit" "enabled disabled" "enabled"
validate_enum "hooks.commit_msg" "enabled disabled" "enabled"
validate_enum "hooks.task_numbering" "error warning off" "error"
# hooks.code_extensions and hooks.test_patterns are free-form regex patterns — no enum validation
# hooks.subject_* are numeric thresholds — no enum validation

# Review
validate_enum "review.pre_merge" "enabled disabled" "enabled"

# Merge
validate_enum "merge.strategy" "merge rebase squash" "merge"

# Platform
validate_enum "platform.type" "github gitlab bitbucket azure-devops" "github"

# Project management
validate_enum "pm.mode" "none arc-in-git external" "none"

# Team
validate_enum "team.mode" "false true" "false"

# Session initialization
validate_enum "session.remote_sync" "enabled disabled" "enabled"
validate_enum "session.init_pull.worktree" "manual prompt" "prompt"
validate_enum "session.init_pull.notes" "manual prompt always" "prompt"

# User directory
validate_enum "user.sync_push" "always prompt manual" "always"

# Archival
validate_enum "archive.cadence" "with-integration manual" "with-integration"

# Session interlocks
validate_enum "session.autonomy" "manual-commit auto-commit auto-push" "manual-commit"

# ============================================================================
# Cross-field dependency checks
# ============================================================================

commit_format=$(arc_config_get "commit.format" "conventional")
custom_pattern=$(arc_config_get "commit.custom_pattern" "")
context_footer=$(arc_config_get "commit.context_footer" "required")
context_pattern=$(arc_config_get "commit.context_pattern" "")

# commit.format: custom requires commit.custom_pattern
if [ "$commit_format" = "custom" ] && [ -z "$custom_pattern" ]; then
    error "commit.format is 'custom' but commit.custom_pattern is empty"
elif [ "$commit_format" = "custom" ] && [ -n "$custom_pattern" ]; then
    pass "commit.custom_pattern is set for custom format"
fi

# commit.custom_pattern set but format is not custom — likely a mistake
if [ "$commit_format" != "custom" ] && [ -n "$custom_pattern" ]; then
    warn "commit.custom_pattern is set but commit.format is '$commit_format' (pattern is ignored)"
fi

# commit.context_footer: custom requires commit.context_pattern
if [ "$context_footer" = "custom" ] && [ -z "$context_pattern" ]; then
    error "commit.context_footer is 'custom' but commit.context_pattern is empty"
elif [ "$context_footer" = "custom" ] && [ -n "$context_pattern" ]; then
    pass "commit.context_pattern is set for custom footer"
fi

# commit.context_pattern set but footer mode is not custom — likely a mistake
if [ "$context_footer" != "custom" ] && [ -n "$context_pattern" ]; then
    warn "commit.context_pattern is set but commit.context_footer is '$context_footer' (pattern is ignored)"
fi

# ============================================================================
# Unknown key detection (typo protection)
# ============================================================================

known_keys="branch.base branch.protection commit.format commit.context_footer commit.custom_pattern commit.context_pattern merge.strategy hooks.pre_commit hooks.commit_msg hooks.task_numbering hooks.skip_extensions hooks.test_patterns hooks.meta_ref_patterns hooks.subject_max_length hooks.subject_warn_length hooks.contributor_protected_paths review.pre_merge platform.type pm.mode team.mode session.remote_sync session.init_pull.worktree session.init_pull.notes session.autonomy user.sync_push archive.cadence"

for key in $(arc_config_keys); do
    found=false
    for known in $known_keys; do
        if [ "$key" = "$known" ]; then
            found=true
            break
        fi
    done
    if [ "$found" = false ]; then
        warn "Unknown key: '$key' (possible typo?)"
    fi
done

# ============================================================================
# Summary
# ============================================================================

echo ""
total=$((passes + warnings + errors))
echo "Summary: $passes passed, $warnings warnings, $errors errors ($total checks)"

if [ "$errors" -gt 0 ]; then
    exit 2
elif [ "$warnings" -gt 0 ]; then
    exit 1
else
    exit 0
fi
