#!/usr/bin/env bash
# README variant: Task execution (condensed)
# Thesis: "bounded increments with you in the loop"
# Shows: test-first marker driving behavior, quality gates, report, stop, user feedback
# Drops: issue-triage, extensions (too much for README context)
source "$(dirname "$0")/common.sh"

# --- User gives direction ---
printf "${SHOW_CURSOR}"
prompt_char
type_text "nice, lgtm. for 2.4 — extend the catalog query builder" 0.03
sleep 0.3
printf "${HIDE_CURSOR}\n"
sleep 0.5

# --- Agent reads task, sees test-first marker ---
tool_use "Read .arc/active/feature/${PROJECT_TASK_LIST} (lines 180-220)"
sleep 0.3

heading "Task 2.4"
printf " — Add author search with full-text matching\n"
sleep 0.5

agent_text "  Task has a test-first marker. Following red-green-refactor."
sleep 0.6

# --- Compressed red-green cycle ---
printf "\n"
printf "  ${RED}RED${RESET}${DIM} — test for author search returning full-text matches:${RESET}\n"
sleep 0.2
tool_use "Write src/services/__tests__/catalog-search.test.ts"
printf "  ${RED}✗${RESET} ${DIM}1 failing${RESET}\n"
sleep 0.4

printf "\n"
printf "  ${GREEN}GREEN${RESET}${DIM} — minimal implementation:${RESET}\n"
sleep 0.2
tool_use "Edit src/controllers/books.controller.ts"
tool_use "Edit src/services/search.service.ts"
printf "  ${GREEN}✓${RESET} ${DIM}14 tests passed${RESET}\n"
sleep 0.5

# --- Quality + report ---
printf "\n"
heading "Task 2.4 complete"
printf "\n"
sleep 0.4

printf "\n"
printf "  Added ${BOLD}${WHITE}author${RESET} filter — calls SearchService.matchAuthor()\n"
printf "  with composable query builder.\n"
sleep 0.3
printf "  ${DIM}Quality:${RESET}  ${GREEN}✓${RESET} Lint  ${GREEN}✓${RESET} Tests (14)\n"
sleep 0.5

printf "\n"
agent_text "Awaiting review before proceeding."
sleep 0.8

# --- User feedback ---
printf "\n"
printf "${SHOW_CURSOR}"
prompt_char
type_text "should the author filter also match editors and translators?" 0.03
sleep 0.3
printf "${HIDE_CURSOR}\n"
sleep 0.6

# --- Agent incorporates ---
printf "\n"
agent_text "  Good catch — extending the author match to include those roles."
sleep 0.3

tool_use "Edit src/services/search.service.ts"
tool_use "npm run test:unit"
printf "  ${GREEN}✓${RESET} ${DIM}16 tests passed${RESET}\n"
sleep 0.3

printf "\n"
printf "  ${GREEN}✓${RESET} Author filter now matches editors and translators.\n"
sleep 0.3

printf "\n"
agent_text "Any other feedback, or proceed to Task 2.5?"

# --- Close ---
closing_prompt 4
