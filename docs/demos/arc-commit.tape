# Demo: arc-commit — structured commit with context footer
# Run: vhs arc-commit.tape
# Output: ../img/arc-commit.gif

Require gum

Output ../img/arc-commit-2x.gif

# --- Terminal settings (2x render — downscale to 1000x650 after) ---
Set Shell bash
Set FontSize 32
Set FontFamily "JetBrains Mono"
Set Width 2000
Set Height 1300
Set Padding 40
Set Margin 80
Set MarginFill "#0d1117"
Set BorderRadius 20
Set WindowBar Colorful
Set WindowBarSize 80
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
Type "clear && exec ./arc-commit.sh"
Enter
Sleep 100ms
Show

Sleep 22s
