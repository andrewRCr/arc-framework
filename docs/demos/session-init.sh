#!/usr/bin/env bash
# Demo: Session initialization — mid-project, active task
# Shows: arc-resume loading context, orientation with active work state
# Placement: how-arc-works.md
source "$(dirname "$0")/common.sh"

# --- Phase 1: User invokes arc-resume ---
invoke_skill "arc-resume"

# --- Phase 2: Context loading (batch 1 — core documents) ---
tool_use "Read .arc/system/agent/AGENT-BRIEFING.ARC.md"
tool_use "Read .arc/system/agent/AGENT-BRIEFING.PROJECT.md"
tool_use "Read .arc/reference/constitution/DEV-RULES.ARC.md"
tool_use "Read .arc/reference/constitution/DEV-RULES.PROJECT.md"
tool_use "Read .arc/reference/QUICK-REFERENCE.md"
tool_use "Glob .arc/active/**/status-*.md"
tool_use "Read .arc/active/feature/status-search-filters.md"

sleep 0.2

# Batch 2 — session-specific context
tool_use "Read .arc/user/andrew/SESSION-NOTES.md"
tool_use "Read .arc/active/feature/${PROJECT_TASK_LIST} (lines 180-230)"
sleep 0.5

# Conditional procedural load — active task work triggers this
agent_text "  Active task work in status file — loading task execution workflow."
sleep 0.4
tool_use "Read .arc/system/workflows/arc/3_process-task-loop.md"

# Pause — agent processing
sleep 1.0

# --- Phase 3: Orientation summary ---
printf "\n"
heading "ARC session initialized"
printf " · ${CYAN}${PROJECT_BRANCH}${RESET} · ${GREEN}clean${RESET}\n"
sleep 1.2

printf "\n"
heading "Active work state:"
printf "\n"
sleep 0.6

printf "\n"
status_field "Last completed:" "Task 2.3 — Add genre filter to catalog query ${DIM}(committed a91f4e2)${RESET}"
status_field "Current task:"   "${BOLD}Task 2.4${RESET} — Add author search with full-text matching ${DIM}(line ~195)${RESET}"
status_field "Blockers:"       "None"
sleep 0.8

printf "\n"
heading "Next action:"
printf " Check catalog query builder approach noted in session notes,\n"
printf "  then implement author search filter for Task 2.4\n"
sleep 1.0

printf "\n"
agent_text "Awaiting direction — proceed to Next Action?"
sleep 0.5

# --- Phase 4: Close ---
closing_prompt 5
