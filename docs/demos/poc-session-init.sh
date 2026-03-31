#!/usr/bin/env bash
# Proof-of-concept: simulates a generic agentic CLI session initialization
# The entire visible experience is produced by this script — fake prompt,
# simulated typing, and agent output. No real shell prompt appears.

set -euo pipefail

# --- Color palette ---
RESET='\033[0m'
BOLD='\033[1m'
DIM='\033[2m'

WHITE='\033[97m'
GRAY='\033[90m'
CYAN='\033[36m'
GREEN='\033[32m'
YELLOW='\033[33m'

HIDE_CURSOR='\033[?25l'
SHOW_CURSOR='\033[?25h'

# --- Helper functions ---
type_text() {
    local text="$1"
    local delay="${2:-0.04}"
    for ((i=0; i<${#text}; i++)); do
        printf "%s" "${text:$i:1}"
        sleep "$delay"
    done
}

tool_use() {
    printf "${DIM}${GRAY}  ▸ %s${RESET}\n" "$1"
    sleep 0.15
}

separator() {
    printf "${DIM}${GRAY}  %s${RESET}\n" "─────────────────────────────────────────────"
}

# --- Simulated session ---

# Phase 1: User types slash command (cursor visible)
printf "${SHOW_CURSOR}"
printf "${BOLD}${WHITE}>${RESET} "
type_text "/arc-resume" 0.05
sleep 0.4

# Phase 2: "Enter" — rewrite with skill recognition color, hide cursor
printf "\r${BOLD}${WHITE}>${RESET} ${YELLOW}/arc-resume${RESET}"
printf "${HIDE_CURSOR}\n"
sleep 0.5

# Phase 3: Agent output (cursor hidden throughout)
tool_use "Read .arc/system/agent/AGENT-BRIEFING.ARC.md"
tool_use "Read .arc/system/agent/AGENT-BRIEFING.PROJECT.md"
tool_use "Read .arc/reference/constitution/DEV-RULES.ARC.md"
tool_use "Read .arc/reference/constitution/DEV-RULES.PROJECT.md"
tool_use "Read .arc/reference/QUICK-REFERENCE.md"
tool_use "Read .arc/active/WORK-STATUS.md"

sleep 0.2

tool_use "Read .arc/user/andrew/SESSION-NOTES.md"
tool_use "Read .arc/active/feature/tasks-api-auth.md (lines 340-395)"

# Pause — agent is "processing" before producing summary
sleep 1.0

# Orientation summary — chunked so viewer can read each part
printf "\n${BOLD}${WHITE}ARC session initialized${RESET} · ${CYAN}feature/api-auth${RESET} · ${GREEN}clean${RESET}\n"
sleep 1.2

printf "\n${BOLD}${WHITE}Active work state:${RESET}\n"
sleep 0.6

printf "\n  ${DIM}Last completed:${RESET}  Task 3.4 — Add token refresh endpoint ${DIM}(committed 8f2a1c3)${RESET}\n"
sleep 0.5
printf "  ${DIM}Current task:${RESET}    ${BOLD}Task 3.5${RESET} — Rate limiting middleware ${DIM}(line ~355)${RESET}\n"
sleep 0.5
printf "  ${DIM}Blockers:${RESET}        None\n"
sleep 0.8

printf "\n${BOLD}${WHITE}Next action:${RESET} Verify refresh token edge cases from session notes, then proceed to 3.5\n"
sleep 1.0

printf "\n${CYAN}Awaiting direction — proceed to Next Action?${RESET}\n"
sleep 0.5

# Phase 4: Closing prompt — cursor reappears
printf "\n${BOLD}${WHITE}>${RESET} "
printf "${SHOW_CURSOR}"

# Hold for viewer to read final state
sleep 5
