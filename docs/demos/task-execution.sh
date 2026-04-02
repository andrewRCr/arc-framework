#!/usr/bin/env bash
# Demo: Task execution loop — the co-development rhythm
# Shows: test-first marker driving behavior, issue-triage method consultation,
#        Tier 1 quality gates, configured extension firing, completion protocol,
#        mandatory stop, user feedback loop
# Placement: how-arc-works.md or work-planning.md
#
# Structure: 3 visual chapters separated by screen clears.
# Clears create readable "slides" and compress well (identical frames).
source "$(dirname "$0")/common.sh"

# === Chapter 1: User direction + agent reads task ===
# User input stays visible through agent's initial response — shows the
# co-development connection before clearing to the execution phase.
printf "${SHOW_CURSOR}"
prompt_char
type_text "nice, lgtm." 0.03
sleep 0.3
printf "\n"
prompt_char
type_text "ok, for 2.4 — catalog already has a query builder, extend that" 0.03
printf "${HIDE_CURSOR}\n"
sleep 0.6

tool_use "Read .arc/active/feature/${PROJECT_TASK_LIST} (lines 180-220)"
sleep 0.4

printf "\n"
heading "Starting Task 2.4"
printf " — Add author search with full-text matching\n"
sleep 1.2

agent_text "  Task has a test-first marker. Following red-green-refactor."
sleep 1.0

tool_use "Read src/controllers/books.controller.ts"
tool_use "Read src/services/search.service.ts"
sleep 0.3

agent_text "  Agreed — the catalog query builder composes WHERE clauses."
agent_text "  I'll add author full-text matching as another composable filter."
sleep 2.5

# === Chapter 2: Red-green cycle ===
printf "\033[2J\033[H"
sleep 0.3

# Red-green cycle — first behavior (the key visual)
printf "\n"
printf "  ${RED}RED${RESET}${DIM} — test for author search returning full-text matches:${RESET}\n"
sleep 0.8
tool_use "Write src/services/__tests__/catalog-search.test.ts"
tool_use "npm run test:unit -- --bail"
printf "  ${RED}✗${RESET} ${DIM}1 failing (expected)${RESET}\n"
sleep 1.2

printf "\n"
printf "  ${GREEN}GREEN${RESET}${DIM} — minimal implementation:${RESET}\n"
sleep 0.8
tool_use "Edit src/controllers/books.controller.ts"
tool_use "Edit src/services/search.service.ts"
tool_use "npm run test:unit"
printf "  ${GREEN}✓${RESET} ${DIM}12 tests passed${RESET}\n"
sleep 1.2

agent_text "  Clean — no refactoring needed. Continuing with remaining behaviors."
sleep 0.5

# Remaining behaviors (compressed — visual texture, not content)
tool_use "Edit src/services/__tests__/catalog-search.test.ts"
tool_use "Edit src/services/search.service.ts"
tool_use "npm run test:unit"
printf "  ${GREEN}✓${RESET} ${DIM}14 tests passed${RESET}\n"
sleep 0.8

# === Chapter 3: Issue triage + quality gates + completion report ===
printf "\033[2J\033[H"
sleep 0.3

# Issue triage — agent finds pre-existing issue
agent_text "  Found a pre-existing issue in books.controller.ts — query params"
agent_text "  aren't sanitized before passing to the search service."
printf "\n"
agent_text "  Checking ARC issue-triage method for severity guidance."
sleep 0.5

tool_use "Read .arc/system/workflows/arc-methods.md § issue-triage"
sleep 0.3

agent_text "  Minor (< 5 min fix). Fixing inline — adding input sanitization."
sleep 0.6
tool_use "Edit src/controllers/books.controller.ts"
sleep 0.5

# Tier 1 quality gates
printf "\n"
tool_use "npm run lint:ts"
printf "  ${GREEN}✓${RESET} ${DIM}Lint passed${RESET}\n"
sleep 0.2

tool_use "npm run test:unit"
printf "  ${GREEN}✓${RESET} ${DIM}14 tests passed${RESET}\n"
sleep 0.3

# Configured extension fires
tool_use "Read .arc/system/workflows/arc-extensions.md § post-task-quality"
sleep 0.2
tool_use "npx snyk test --file=package.json"
printf "  ${GREEN}✓${RESET} ${DIM}No new vulnerabilities${RESET}\n"
sleep 0.5

# Mark complete + update task description (completion protocol)
tool_use "Edit .arc/active/feature/${PROJECT_TASK_LIST} — mark 2.4 [x], update description"
sleep 0.3

# Completion report
printf "\n"
heading "Task 2.4 complete"
printf "\n"
sleep 0.8

printf "\n"
printf "  Added ${BOLD}${WHITE}author${RESET} filter to BooksController — calls\n"
printf "  SearchService.matchAuthor() with composable query builder.\n"
sleep 0.5
printf "  Also fixed unsanitized query params in catalog controller.\n"
sleep 0.5

printf "\n"
printf "  ${DIM}Quality:${RESET}  ${GREEN}✓${RESET} Lint  ${GREEN}✓${RESET} Tests (14)  ${GREEN}✓${RESET} Snyk\n"
printf "  ${DIM}Next task:${RESET}  Task 2.5 — Add combined filter sorting and pagination\n"
sleep 1.5

# Mandatory stop
printf "\n"
agent_text "Task list updated. Awaiting review before proceeding."
sleep 1.8

# User feedback loop — shows the co-development rhythm continues
printf "\n"
printf "${SHOW_CURSOR}"
prompt_char
type_text "should the author filter also match editors and translators?" 0.03
sleep 0.3
printf "${HIDE_CURSOR}\n"
sleep 1.0

printf "\n"
agent_text "  Good catch — extending the author match to include those roles."
sleep 0.5

tool_use "Edit src/services/search.service.ts"
tool_use "Edit src/services/__tests__/catalog-search.test.ts"
sleep 0.2

tool_use "npm run test:unit"
printf "  ${GREEN}✓${RESET} ${DIM}16 tests passed${RESET}\n"
sleep 0.5

# Update existing completion notes to reflect the feedback-driven change
tool_use "Edit .arc/active/feature/${PROJECT_TASK_LIST} — update 2.4 completion notes"
sleep 0.3

printf "\n"
printf "  ${GREEN}✓${RESET} Author filter now matches editors and translators.\n"
sleep 0.5
agent_text "  Completion notes updated to include the expanded author matching."
sleep 0.8

printf "\n"
agent_text "Any other feedback, or proceed to Task 2.5?"

# --- Close ---
closing_prompt 5
