#!/usr/bin/env bash
# Demo: arc-commit — structured commit with context footer
# Shows: atomic boundary analysis, conventional commit format, Context footer, state sync
# Placement: how-arc-works.md
source "$(dirname "$0")/common.sh"

# --- Phase 1: User invokes arc-commit ---
invoke_skill "arc-commit"

# --- Phase 2: Agent analyzes changes ---
tool_use "git status"
tool_use "git diff --staged"
tool_use "git log --oneline -5"

sleep 0.8

printf "\n"
heading "Staged changes:"
printf "\n"
sleep 0.4

printf "\n"
printf "  ${GREEN}modified${RESET}  src/services/recurrence.service.ts\n"
sleep 0.2
printf "  ${GREEN}modified${RESET}  src/services/__tests__/recurrence.service.test.ts\n"
sleep 0.2
printf "  ${GREEN}modified${RESET}  .arc/active/feature/${PROJECT_TASK_LIST}\n"
sleep 0.5

printf "\n"
agent_text "  All changes serve one concern — recurrence rule validation."
agent_text "  No split needed."
sleep 0.8

# --- Phase 3: Commit message (references loaded format guidance) ---
printf "\n"
tool_use "Read .arc/system/workflows/arc-methods.md § commit-format"
tool_use "Read .arc/system/workflows/arc-methods.md § commit-context-format"
sleep 0.3

printf "\n"
heading "Proposed commit:"
printf "\n"
sleep 0.4

printf "\n"
printf "  ${BOLD}${WHITE}feat(recurrence): add cron expression and interval validation${RESET}\n"
sleep 0.3
printf "\n"
printf "  ${DIM}- Validates cron expressions via cron-parser before persisting${RESET}\n"
sleep 0.2
printf "  ${DIM}- Rejects intervals shorter than minimum threshold (1 hour)${RESET}\n"
sleep 0.2
printf "  ${DIM}- Test coverage: valid expressions, edge cases, error messages${RESET}\n"
sleep 0.5

printf "\n"
printf "  ${DIM}${GRAY}Context: ${PROJECT_TASK_LIST} (Task 2.3)${RESET}\n"
sleep 0.8

# --- Phase 4: State sync + commit ---
printf "\n"
agent_text "  WORK-STATUS.md updated — Next Task advanced to 2.4."
agent_text "  Staged alongside task list changes."
sleep 0.6

tool_use "git add src/services/recurrence.service.ts ..."
tool_use "git commit"
sleep 0.3

# --- Phase 4b: Hooks fire (deterministic enforcement) ---
printf "  ${DIM}${GRAY}Running pre-commit checks...${RESET}\n"
sleep 0.4
printf "  ${DIM}${GRAY}Pre-commit checks ${GREEN}PASSED${RESET}\n"
sleep 0.3
printf "  ${DIM}${GRAY}Validating commit message...${RESET}\n"
sleep 0.4
printf "  ${DIM}${GRAY}Commit validation ${GREEN}PASSED${RESET}\n"
sleep 0.4

printf "\n"
printf "  ${GREEN}✓${RESET} ${DIM}a91f4e2${RESET} feat(recurrence): add cron expression and interval validation\n"
sleep 0.5

# --- Phase 5: Close ---
closing_prompt 5
