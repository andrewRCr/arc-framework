# .arc — ARC Framework

Development methodology for human-AI collaboration. ARC structures how you and your AI agent
plan, execute, verify, and preserve context across work sessions — expressed as markdown
documents that work with any agent platform.

## Getting Started

After running `arc init`, restart your AI agent and run the `arc-setup` skill to walk through
verification and project definition. See the [Getting Started guide][getting-started] for the
full installation and setup walkthrough.

## Directory Structure

```text
.arc/
├── active/                    # Current work in progress
│   ├── WORK-STATUS.md         # Project state: current task, blockers, next action
│   ├── feature/               # Active feature development
│   ├── technical/             # Active technical/infrastructure work
│   └── incidental/            # Active maintenance and discovered work
├── backlog/                   # Future work pipeline (arc-in-git pm.mode only)
│   ├── ROADMAP.md             # Sequencing strategy for upcoming work
│   ├── feature/               # Feature backlog
│   └── technical/             # Technical backlog
├── reference/                 # Stable, long-lived documentation
│   ├── QUICK-REFERENCE.md     # Environment context and command patterns
│   ├── constitution/          # Foundational documents (META-PRD, rules, architecture)
│   ├── strategies/            # Codified implementation patterns
│   │   ├── arc/               # Framework methodology (ships with ARC)
│   │   └── project/           # Your project-specific patterns
│   ├── adr/                   # Architecture Decision Records
│   ├── analysis/              # Internal investigation and synthesis
│   ├── research/              # External technical research
│   └── archive/               # Completed work (by work type, quarterly as volume grows)
├── user/                      # Personal workspace: per-developer session state and task capture
└── system/                    # Agent-facing operational files
    ├── arc-config.yml         # Project settings (base branch, protection mode)
    ├── agent/                 # AI agent configuration (AGENT-BRIEFING.ARC.md, AGENT-BRIEFING.PROJECT.md, tool-specific)
    ├── skills/                # Canonical skill definitions (arc-setup, arc-resume, arc-commit, arc-handoff)
    ├── githooks/              # Git hook scripts
    └── workflows/             # Development process workflows
        ├── arc/               # ARC framework workflows (setup, session lifecycle, supplemental)
        └── project/           # Project-specific workflows
```

## Learn More

- [Getting Started][getting-started] — installation, setup, and first session
- [How ARC Works][the-framework] — session lifecycle, skills, and task execution
- [Document Audiences][audiences] — who reads what in `.arc/`
- [Updating ARC][updating] — file classifications and update behavior

---

[getting-started]: https://andrewrcr.github.io/arc-framework/getting-started/
[the-framework]: https://andrewrcr.github.io/arc-framework/the-framework/
[audiences]: https://andrewrcr.github.io/arc-framework/the-framework/#document-audiences
[updating]: https://andrewrcr.github.io/arc-framework/reference/updating/
