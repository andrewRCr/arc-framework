# Docs Demo GIFs

Animated terminal demos for the ARC docs site, produced with [VHS](https://github.com/charmbracelet/vhs) +
[gum](https://github.com/charmbracelet/gum) (Charm ecosystem).

## How It Works

Each demo is a **tape + script pair**:

- **`.tape` file** — VHS configuration (theme, dimensions, chrome) and execution sequence
- **`.sh` file** — Shell script that produces all visible output (fake prompt, simulated typing, agent response)

The script handles the entire visible experience — no real shell prompt appears. VHS runs the script in a hidden
setup phase and captures the output as a GIF.

**To render a demo:**

```bash
cd docs/demos
vhs <name>.tape
# Output goes to docs/img/<name>.gif
```

## Dependencies

- **VHS** — terminal recording (`brew install vhs`)
- **gum** — styled terminal output (`brew install gum`)
- **ffmpeg** — video encoding (installed as VHS dependency)
- **JetBrains Mono** — font (install to `~/.local/share/fonts/`)

## Visual Language

### Terminal Chrome

| Setting       | Value               | Notes                               |
|---------------|---------------------|-------------------------------------|
| Background    | `#0d1117`           | Outer margin — darker than terminal |
| Terminal      | `#1a1b26`           | Tokyo Night dark                    |
| Margin        | 40px                | Creates floating window effect      |
| Border radius | 10px                | Rounded corners                     |
| Window bar    | Colorful            | macOS-style traffic light dots      |
| Font          | JetBrains Mono 16px | Standard dev tool monospace         |
| Width         | 1000px              | Landscape format for docs embedding |
| Height        | 650px               | Fits ~18 lines of content           |

### Color Roles

| Role                  | Color        | Code         | Usage                                      |
|-----------------------|--------------|--------------|--------------------------------------------|
| Prompt                | Bold white   | `\033[1;97m` | `>` character                              |
| Slash command (typed) | Default fg   | —            | While typing, before "enter"               |
| Slash command (sent)  | Yellow       | `\033[33m`   | After "enter" — skill recognition feedback |
| Tool use indicator    | Dim gray     | `\033[2;90m` | `▸ Read .arc/...` lines                    |
| Agent text            | Cyan         | `\033[36m`   | Conversational output, closing prompt      |
| Headings/labels       | Bold white   | `\033[1;97m` | Section headings, field labels             |
| Status/success        | Green        | `\033[32m`   | `clean`, checkmarks                        |
| Dim annotations       | Bright black | `\033[90m`   | Commit hashes, line numbers                |

### Cursor Behavior

- **Visible** during user input (typing phase)
- **Hidden** during agent output (`\033[?25l`)
- **Visible** again at closing prompt (`\033[?25h`)

### Content Principles

- **Tool-agnostic** — generic agentic CLI patterns, not mimicking any specific tool
- **Slash command invocation** — `/skill-name` format, universal across agent platforms
- **Scripted typing** — `type_text()` function with per-character delay for realistic input
- **Chunked output** — agent response appears in timed sections, not all at once
- **No real shell** — entire visible experience produced by the script via printf + ANSI codes

## CI Forward-Compatibility

Tapes are structured for future GitHub Actions integration:

- `Require gum` at the top of each tape (fails fast if dependency missing)
- Relative output paths (`../img/<name>.gif`)
- Self-contained scripts (no dependency on repo runtime state)
- Deterministic output (same tape always produces same result)

## Directory Layout

```text
docs/
├── demos/          ← Tapes + scripts (this directory)
│   ├── <name>.tape
│   └── <name>.sh
└── img/            ← Generated GIF output
    └── <name>.gif
```

---

Generated GIFs are committed to `docs/img/`. Tapes and scripts are the source of truth — re-render
with `vhs <name>.tape` after any changes.
