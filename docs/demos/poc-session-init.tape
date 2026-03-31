# Proof-of-concept: ARC session initialization demo
# The shell script handles ALL visible output (fake prompt, typing, agent response).
# VHS just runs the script and captures the result.
#
# Run: vhs poc-session-init.tape
# Output: ../img/poc-session-init.gif

Require gum

Output ../img/poc-session-init.gif

# --- Terminal settings ---
Set Shell bash
Set FontSize 16
Set FontFamily "JetBrains Mono"
Set Width 1000
Set Height 650
Set Padding 20
Set Margin 40
Set MarginFill "#0d1117"
Set BorderRadius 10
Set WindowBar Colorful
Set WindowBarSize 40
Set TypingSpeed 0
Set Theme {
    "name": "ARC Demo",
    "black": "#1a1b26",
    "red": "#f7768e",
    "green": "#9ece6a",
    "yellow": "#e0af68",
    "blue": "#7aa2f7",
    "magenta": "#bb9af7",
    "cyan": "#7dcfff",
    "white": "#c0caf5",
    "brightBlack": "#565f89",
    "brightRed": "#f7768e",
    "brightGreen": "#9ece6a",
    "brightYellow": "#e0af68",
    "brightBlue": "#7aa2f7",
    "brightMagenta": "#bb9af7",
    "brightCyan": "#7dcfff",
    "brightWhite": "#c0caf5",
    "foreground": "#c0caf5",
    "background": "#1a1b26",
    "selectionBackground": "#33467c",
    "cursorColor": "#c0caf5"
}

# --- Launch the script hidden, then show output ---
# The script has a brief initial sleep, so we Show before it starts drawing.
# exec replaces the shell so no prompt appears after the script finishes.
Hide
Type "clear && exec ./poc-session-init.sh"
Enter
Sleep 100ms
Show

# Wait for script to complete (includes internal 5s hold at end)
Sleep 16s

Screenshot ../img/poc-session-init-final.png
