# README variant: Session initialization (condensed)
# Run: vhs session-init-readme.tape
# Output: ../img/session-init-readme.gif

Require gum

Output ../img/session-init-readme-2x.gif

# --- Terminal settings (2x render — downscale to 1000x450 after) ---
Set Shell bash
Set FontSize 30
Set FontFamily "JetBrains Mono"
Set Width 2000
Set Height 900
Set Padding 40
Set Margin 60
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
Type "clear && exec ./session-init-readme.sh"
Enter
Sleep 100ms
Show

Sleep 19s
