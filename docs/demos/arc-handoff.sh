#!/usr/bin/env bash
# Demo: arc-handoff — session end with state capture
# Shows: state writing, handoff confirmation with session summary, the tracked/personal split
# Placement: how-arc-works.md
source "$(dirname "$0")/common.sh"

# --- Phase 1: User invokes arc-handoff ---
invoke_skill "arc-handoff"

# --- Phase 2: Agent gathers state ---
tool_use "git status"
tool_use "git log --oneline -5"
tool_use "Read .arc/active/feature/${PROJECT_TASK_LIST}"

sleep 0.6

# --- Phase 3: Verify WORK-STATUS, write session notes, sync ---
agent_text "  WORK-STATUS.md is current — updated with last commit."
sleep 0.4

tool_use "Write .arc/user/andrew/SESSION-NOTES.md"
sleep 0.3

tool_use "arc user sync"
sleep 0.3

printf "  ${GREEN}✓${RESET} ${DIM}Session state saved and pushed. Notes attached to b03d7f1.${RESET}\n"
sleep 0.6

# --- Phase 4: Handoff confirmation (matches real ARC format — last thing shown) ---
printf "\n"
heading "ARC session handoff complete"
printf " · ${CYAN}${PROJECT_BRANCH}${RESET} · ${GREEN}clean${RESET}\n"
sleep 1.0

printf "\n"
heading "Session summary:\n"
sleep 0.4

printf "\n"
printf "  - Task 2.3: Recurrence rule validation ${DIM}(a91f4e2)${RESET}\n"
sleep 0.3
printf "  - Task 2.4: Wired recurrence into task completion ${DIM}(b03d7f1)${RESET}\n"
sleep 0.3
printf "    Added label copying per review feedback\n"
sleep 0.5

printf "\n"
heading "Next session:"
printf " Task 2.5 — Add recurrence skip/pause controls\n"
sleep 0.4
printf "  Implement skip and pause mutations on RecurrenceRule\n"
sleep 0.8

# --- Phase 5: Close ---
closing_prompt 5
