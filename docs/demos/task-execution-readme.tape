# README variant: Task execution (condensed)
# Run: vhs task-execution-readme.tape
# Output: ../img/task-execution-readme.gif

Require gum

Output ../img/task-execution-readme.gif

# --- Terminal settings (smaller for README embedding) ---
Set Shell bash
Set FontSize 15
Set FontFamily "JetBrains Mono"
Set Width 1000
Set Height 450
Set Padding 20
Set Margin 30
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

Hide
Type "clear && exec ./task-execution-readme.sh"
Enter
Sleep 100ms
Show

Sleep 20s
