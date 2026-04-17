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
printf "  ${GREEN}modified${RESET}  src/services/search.service.ts\n"
sleep 0.2
printf "  ${GREEN}modified${RESET}  src/services/__tests__/search.service.test.ts\n"
sleep 0.2
printf "  ${GREEN}modified${RESET}  .arc/active/feature/${PROJECT_TASK_LIST}\n"
sleep 0.5

printf "\n"
agent_text "  All changes serve one concern — genre filter implementation."
agent_text "  No split needed. Loading commit format guidance..."
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
printf "  ${BOLD}${WHITE}feat(catalog): add genre filter to book search endpoint${RESET}\n"
sleep 0.3
printf "\n"
printf "  ${DIM}- Validates genre param against known genres before querying${RESET}\n"
sleep 0.2
printf "  ${DIM}- Adds parameterized WHERE clause to catalog query builder${RESET}\n"
sleep 0.2
printf "  ${DIM}- Test coverage: valid genres, empty results, case sensitivity${RESET}\n"
sleep 0.5

printf "\n"
printf "  ${DIM}${GRAY}Context: ${PROJECT_TASK_LIST} (Task 2.3)${RESET}\n"
sleep 0.8

# --- Phase 4: State sync + commit ---
printf "\n"
agent_text "  Active status file updated — Next Task advanced to 2.4."
agent_text "  Staged alongside task list changes."
sleep 0.6

tool_use "git add src/services/search.service.ts ..."
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
printf "  ${GREEN}✓${RESET} ${DIM}a91f4e2${RESET} feat(catalog): add genre filter to book search endpoint\n"
sleep 0.5

# --- Phase 5: Close ---
closing_prompt 5
