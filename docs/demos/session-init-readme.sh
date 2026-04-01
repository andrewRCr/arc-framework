#!/usr/bin/env bash
# README variant: Session initialization (condensed)
# Thesis: "the agent knows where you left off"
# Shorter, self-explanatory without surrounding docs context
source "$(dirname "$0")/common.sh"

# --- Skill invocation ---
invoke_skill "arc-resume"

# --- Condensed context loading (fewer lines — just enough to show the idea) ---
tool_use "Read .arc/system/agent/AGENT-BRIEFING.PROJECT.md"
tool_use "Read .arc/reference/constitution/DEV-RULES.PROJECT.md"
tool_use "Read .arc/active/WORK-STATUS.md"
tool_use "Read .arc/user/andrew/SESSION-NOTES.md"
tool_use "Read .arc/active/feature/${PROJECT_TASK_LIST} (lines 180-230)"

sleep 0.8

# --- Orientation — tight, no section headers ---
printf "\n"
heading "ARC session initialized"
printf " · ${CYAN}${PROJECT_BRANCH}${RESET} · ${GREEN}clean${RESET}\n"
sleep 1.0

printf "\n"
status_field "Last completed:" "Task 2.3 — Add genre filter to catalog query ${DIM}(a91f4e2)${RESET}"
status_field "Current task:"   "${BOLD}Task 2.4${RESET} — Add author search with full-text matching"
status_field "Blockers:"       "None"
sleep 0.6

printf "\n"
heading "Next action:"
printf " Check catalog query builder approach noted in session notes,\n"
printf "  then implement author search filter for Task 2.4\n"
sleep 0.8

printf "\n"
agent_text "Awaiting direction — proceed to Next Action?"

# --- Close ---
closing_prompt 4
