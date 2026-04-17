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

# --- Phase 3: Verify status file, write session notes, sync ---
agent_text "  Active status file is current — updated with last commit."
sleep 0.4

tool_use "Write .arc/user/andrew/SESSION-NOTES.md"
sleep 0.3

tool_use "arc sync"
sleep 0.3

printf "  ${GREEN}✓${RESET} ${DIM}Session state saved and pushed. Notes attached to b03d7f1.${RESET}\n"
sleep 0.6

# --- Phase 4: Handoff confirmation (matches real ARC format — last thing shown) ---
printf "\n"
heading "ARC session handoff complete"
printf " · ${CYAN}${PROJECT_BRANCH}${RESET} · ${GREEN}clean${RESET}\n"
sleep 1.0

printf "\n"
heading "Session summary:"
printf "\n"
sleep 0.4

printf "\n"
printf "  - Task 2.3: Genre filter on catalog query ${DIM}(a91f4e2)${RESET}\n"
sleep 0.3
printf "  - Task 2.4: Author full-text search ${DIM}(b03d7f1)${RESET}\n"
sleep 0.3
printf "    Extended to include editors and translators per review feedback\n"
sleep 0.5

printf "\n"
heading "Next session:"
printf " Task 2.5 — Add combined filter sorting and pagination\n"
sleep 0.4
printf "  Implement multi-field sort and offset pagination on filtered results\n"
sleep 0.8

# --- Phase 5: Close ---
closing_prompt 5
