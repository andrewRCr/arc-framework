#!/usr/bin/env bash
# Demo: Task execution loop — the co-development rhythm
# Shows: test-first marker driving behavior, issue-triage method consultation,
#        Tier 1 quality gates, configured extension firing, completion protocol,
#        mandatory stop, user feedback loop
# Placement: how-arc-works.md or work-planning.md
source "$(dirname "$0")/common.sh"

# --- Phase 1: Agent reads the task from the task list ---
printf "${HIDE_CURSOR}"
tool_use "Read .arc/active/feature/${PROJECT_TASK_LIST} (lines 180-220)"
sleep 0.4

printf "\n"
heading "Starting Task 2.4"
printf " — Wire recurrence into task completion endpoint\n"
sleep 0.6

# Task has a test-first marker — agent responds to it
agent_text "  Task has a test-first marker. Following red-green-refactor."
sleep 0.8

# --- Phase 2: Agent reads relevant code ---
printf "\n"
tool_use "Read src/controllers/task.controller.ts"
tool_use "Read src/services/recurrence.service.ts"
sleep 0.3

agent_text "  The completion endpoint fires a webhook after status change."
agent_text "  I'll hook recurrence into the same event path."
sleep 0.6

# --- Phase 3: Red-green cycle (compressed — one behavior shown) ---
printf "\n"
printf "  ${RED}RED${RESET}${DIM} — test for completion triggering recurrence:${RESET}\n"
sleep 0.3
tool_use "Write src/services/__tests__/task-completion-recurrence.test.ts"
tool_use "npm run test:unit -- --bail"
printf "  ${RED}✗${RESET} ${DIM}1 failing (expected)${RESET}\n"
sleep 0.5

printf "\n"
printf "  ${GREEN}GREEN${RESET}${DIM} — minimal implementation:${RESET}\n"
sleep 0.3
tool_use "Edit src/controllers/task.controller.ts"
tool_use "Edit src/services/recurrence.service.ts"
tool_use "npm run test:unit"
printf "  ${GREEN}✓${RESET} ${DIM}12 tests passed${RESET}\n"
sleep 0.5

agent_text "  Clean — no refactoring needed. Next behaviors: skip non-recurring,"
agent_text "  preserve recurrence rule on new task."
sleep 0.4

# Remaining behaviors (compressed)
tool_use "Edit src/services/__tests__/task-completion-recurrence.test.ts"
tool_use "Edit src/services/recurrence.service.ts"
tool_use "npm run test:unit"
printf "  ${GREEN}✓${RESET} ${DIM}14 tests passed${RESET}\n"
sleep 0.5

# --- Phase 4: Issue triage — agent finds pre-existing issue ---
printf "\n"
agent_text "  Found a pre-existing issue in task.controller.ts — the webhook"
agent_text "  error handler swallows exceptions silently."
sleep 0.5

tool_use "Read .arc/system/workflows/arc-methods.md § issue-triage"
sleep 0.3

agent_text "  Minor (< 5 min fix). Fixing inline — adding error logging."
sleep 0.4
tool_use "Edit src/controllers/task.controller.ts"
sleep 0.3

# --- Phase 5: Tier 1 quality gates ---
printf "\n"
tool_use "npm run lint:ts"
printf "  ${GREEN}✓${RESET} ${DIM}Lint passed${RESET}\n"
sleep 0.2

tool_use "npm run test:unit"
printf "  ${GREEN}✓${RESET} ${DIM}14 tests passed${RESET}\n"
sleep 0.3

# --- Phase 6: Configured extension fires ---
tool_use "Read .arc/system/workflows/arc-extensions.md § post-task-quality"
sleep 0.2
tool_use "npx snyk test --file=package.json"
printf "  ${GREEN}✓${RESET} ${DIM}No new vulnerabilities${RESET}\n"
sleep 0.4

# --- Phase 7: Mark complete, update task description ---
tool_use "Edit .arc/active/feature/${PROJECT_TASK_LIST} — mark 2.4 [x]"
sleep 0.3

# --- Phase 8: Completion report ---
printf "\n"
heading "Task 2.4 complete\n"
sleep 0.5

printf "\n"
printf "  Added ${BOLD}${WHITE}onComplete${RESET} hook in TaskController — calls\n"
printf "  RecurrenceService.createNext() when a recurring task is completed.\n"
sleep 0.3
printf "  Also fixed silent exception swallowing in webhook error handler.\n"
sleep 0.4

printf "\n"
printf "  ${DIM}Quality:${RESET}  ${GREEN}✓${RESET} Lint  ${GREEN}✓${RESET} Tests (14)  ${GREEN}✓${RESET} Snyk\n"
printf "  ${DIM}Next task:${RESET}  Task 2.5 — Add recurrence skip/pause controls\n"
sleep 0.8

# --- Phase 9: Mandatory stop ---
printf "\n"
agent_text "Awaiting review before proceeding."
sleep 1.0

# --- Phase 10: User feedback ---
printf "\n"
printf "${SHOW_CURSOR}"
prompt_char
type_text "should createNext() also copy labels from the original?" 0.03
sleep 0.3
printf "${HIDE_CURSOR}\n"
sleep 0.8

# --- Phase 11: Agent incorporates feedback ---
printf "\n"
agent_text "  Good catch — adding label copying now."
sleep 0.4

tool_use "Edit src/services/recurrence.service.ts"
tool_use "Edit src/services/__tests__/task-completion-recurrence.test.ts"
sleep 0.2

tool_use "npm run test:unit"
printf "  ${GREEN}✓${RESET} ${DIM}16 tests passed${RESET}\n"
sleep 0.4

printf "\n"
printf "  ${GREEN}✓${RESET} Labels now copied to recurring task. Ready to commit.\n"
sleep 0.5

# --- Phase 12: Close ---
closing_prompt 5
