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
├── active/                    # Current WU artifacts (flat — one WU per branch)
│                              # carries meta-*.md, draft-*.md, spec-*.md, tasks-*.md, companions
├── backlog/                   # Future work pipeline (arc-in-git pm.mode only)
│   ├── ROADMAP.md             # Sequencing strategy for upcoming work
│   ├── provisional/<wu>/      # Captured WU stubs, not yet committed-to
│   └── planned/[<cohort>/]<wu>/   # Committed-to WUs, optionally grouped by cohort
├── completed/                 # Completed work (arc-in-git pm.mode only)
├── reference/                 # Stable, long-lived documentation
│   ├── QUICK-REFERENCE.md     # Environment context and command patterns
│   ├── briefs/                # Agent briefings loaded at session-init (ARC, PROJECT, CONTRIBUTOR variants)
│   ├── strategies/            # Codified implementation patterns
│   │   ├── arc/               # Framework methodology (ships with ARC)
│   │   └── project/           # Your project-specific patterns
│   ├── adr/                   # Architecture Decision Records
│   ├── supplemental/         # Supporting investigations and research
│   │   ├── analysis/          # Internal investigation and synthesis
│   │   └── research/          # External technical research
│   └── templates/            # Document and configuration templates
├── user/                      # Personal workspace: per-developer session state and task capture
└── system/                    # Agent-facing operational files
    ├── arc-config.yml         # Project settings (base branch, protection mode)
    ├── rules/                 # Development standards and domain rules
    ├── methods/               # Reusable workflow behavior
    ├── .internal/             # Managed hooks, scripts, and canonical skills
    │   ├── githooks/          # Git hook scripts
    │   ├── harness-hooks/     # Agent harness lifecycle hooks
    │   ├── scripts/           # Shared support scripts
    │   └── skills/            # Canonical skill definitions
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
