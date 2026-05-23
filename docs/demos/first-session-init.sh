#!/usr/bin/env bash
# Demo: First session initialization — new project, no active work
# Shows: arc-resume on a freshly set up project, discovery mode
# Placement: getting-started.md
source "$(dirname "$0")/common.sh"

# --- Phase 1: User invokes arc-resume ---
invoke_skill "arc-resume"

# --- Phase 2: Context loading ---
tool_use "Read .arc/system/agent/AGENT-BRIEFING.ARC.md"
tool_use "Read .arc/system/agent/AGENT-BRIEFING.PROJECT.md"
tool_use "Read .arc/system/rules/DEV-RULES.ARC.md"
tool_use "Read .arc/system/rules/DEV-RULES.PROJECT.md"
tool_use "Read .arc/reference/QUICK-REFERENCE.md"
tool_use "Glob .arc/active/**/status-*.md"

sleep 0.8

# --- Phase 3: Orientation — no active work ---
printf "\n"
heading "ARC session initialized"
printf " · ${CYAN}main${RESET} · ${GREEN}clean${RESET}\n"
sleep 1.0

printf "\n"
heading "Active work state:"
printf "\n"
sleep 0.6

printf "\n"
status_field "Current task:" "None — no active work unit"
status_field "Task list:" "[none]"
sleep 0.6

# --- Phase 4: Discovery mode ---
printf "\n"
heading "Discovery:"
printf "\n"
sleep 0.4

tool_use "Read .arc/backlog/ROADMAP.md"
sleep 0.3

printf "\n"
agent_text "  Checked roadmap — next queued item:"
sleep 0.4
printf "  ${BOLD}${WHITE}Search filters${RESET} — add search and filter capabilities to the catalog API\n"
sleep 0.4
printf "  ${DIM}${GRAY}  Status: plan document exists (.arc/backlog/feature/plan-search-filters.md)${RESET}\n"
sleep 0.6

printf "\n"
heading "Next action:"
printf " Create a PRD from the existing plan, then generate a task list\n"
sleep 0.8

printf "\n"
agent_text "Awaiting direction — proceed to create-prd workflow?"
sleep 0.5

# --- Phase 5: Close ---
closing_prompt 5
