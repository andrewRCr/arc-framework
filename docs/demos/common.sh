#!/usr/bin/env bash
# Shared helpers for ARC demo scripts.
# Source this from each demo: source "$(dirname "$0")/common.sh"

set -euo pipefail

# --- Color palette (Tokyo Night) ---
RESET='\033[0m'
BOLD='\033[1m'
DIM='\033[2m'

WHITE='\033[97m'
GRAY='\033[90m'
CYAN='\033[36m'
GREEN='\033[32m'
YELLOW='\033[33m'
RED='\033[31m'

HIDE_CURSOR='\033[?25l'
SHOW_CURSOR='\033[?25h'

# --- Shared fake project context ---
# All demos use the same project for cross-demo coherence.
#   Project: a task management API (generic, instantly recognizable)
#   Branch: feature/recurring-tasks
#   Task list: tasks-recurring-tasks.md
#   Current area: adding recurrence support (create, complete-with-repeat, scheduling)
PROJECT_BRANCH="feature/recurring-tasks"
PROJECT_TASK_LIST="tasks-recurring-tasks.md"

# --- Helper functions ---

# Simulate typing with per-character delay
type_text() {
    local text="$1"
    local delay="${2:-0.04}"
    for ((i=0; i<${#text}; i++)); do
        printf "%s" "${text:$i:1}"
        sleep "$delay"
    done
}

# Tool use indicator (dim gray with triangle)
tool_use() {
    printf "${DIM}${GRAY}  ▸ %s${RESET}\n" "$1"
    sleep 0.15
}

# Agent prose output (cyan)
agent_text() {
    printf "${CYAN}%s${RESET}\n" "$1"
    sleep 0.3
}

# Bold white heading/label
heading() {
    printf "${BOLD}${WHITE}%s${RESET}" "$1"
}

# Status field line: dim label + value
status_field() {
    local label="$1"
    local value="$2"
    printf "  ${DIM}%s${RESET}  %s\n" "$label" "$value"
    sleep 0.5
}

# Horizontal separator
separator() {
    printf "${DIM}${GRAY}  %s${RESET}\n" "─────────────────────────────────────────────"
}

# User prompt character
prompt_char() {
    printf "${BOLD}${WHITE}>${RESET} "
}

# Slash command invocation: type, then recolor on "enter"
invoke_skill() {
    local skill="$1"
    printf "${SHOW_CURSOR}"
    prompt_char
    type_text "/$skill" 0.05
    sleep 0.4
    # Rewrite with skill recognition color
    printf "\r"
    prompt_char
    printf "${YELLOW}/%s${RESET}" "$skill"
    printf "${HIDE_CURSOR}\n"
    sleep 0.5
}

# Closing prompt — cursor reappears, hold for viewer
closing_prompt() {
    local hold="${1:-5}"
    printf "\n"
    prompt_char
    printf "${SHOW_CURSOR}"
    sleep "$hold"
}
