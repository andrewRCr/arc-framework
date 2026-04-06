# .arc — ARC Framework

Development methodology for human-AI collaboration. ARC structures how you and your AI agent
plan, execute, verify, and preserve context across work sessions — expressed as markdown
documents that work with any agent platform.

## Getting Started

After running `arc init`, restart your AI agent to load the new configuration, then:

- Run `/arc-setup` to walk through verification and project definition with your agent
- Or paste: _"Read `.arc/system/agent/AGENT-BRIEFING.ARC.md` for context, then follow
  `.arc/system/workflows/arc/initial-setup/01_verify-and-configure.md`"_

After setup, run `/arc-verify` to confirm everything installed correctly.

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

## Document Audiences

ARC documents serve different audiences — knowing this helps you understand what to read
and what to leave for your agent:

| Audience           | Documents                                                  | Who reads them                                                |
| ------------------ | ---------------------------------------------------------- | ------------------------------------------------------------- |
| **Agent-executed** | Session init/handoff, process-task-loop, commit workflow   | Your agent follows these as procedures. Read when customizing |
| **Collaborative**  | Setup workflows, create-prd, generate-tasks                | You and your agent work through these together                |
| **Shared context** | Constitution, strategies, ADRs, task lists, project status | Both you and your agent — the common project baseline         |
| **Human-facing**   | Repository README, external documentation site             | You, when evaluating or onboarding to the framework           |

**Audience headers in workflows:** All workflow files include an `**Audience:**` line at the
top indicating who drives the process. This makes it clear at a glance whether a workflow is
something your agent runs autonomously, something you work through together, or something
you drive yourself.

When your agent initializes each session, it reads several documents in full — constitution,
development rules, quick reference, current session state. This is by design: agents start
with zero memory and need complete context every time. The reading list looks heavy, but
it's what ensures consistent, well-informed agent behavior session after session.

## Updating ARC

Run `arc update` to bring your `.arc/` files to the latest framework version. Framework
files are replaced with the latest version; Configurable files merge preserving your
customizations.

**File classifications** determine what happens to each file during an update:

| Classification   | Your edits  | During update                          | Examples                                   |
| ---------------- | ----------- | -------------------------------------- | ------------------------------------------ |
| **Framework**    | Overwritten | Wholesale replaced with latest version | Workflows, strategies, hooks, scripts      |
| **Configurable** | Preserved   | Three-way merged with your changes     | `arc-config.yml`, `DEV-RULES.PROJECT.md`   |
| **Scaffolded**   | Preserved   | Skipped entirely — these are yours     | `WORK-STATUS.md`, `ROADMAP.md`, `META-PRD` |

**Before you customize a file**, check whether it's Framework-classified — your changes
will be overwritten on the next update. Files you're expected to customize (`arc-config.yml`,
`DEV-RULES.PROJECT.md`, `AGENT-BRIEFING.PROJECT.md`, strategy files in `project/`) are
Configurable by design. Run `arc status` to see each file's classification.

**After an update**, check the output for conflicts (files where both you and the framework
changed the same content — marked with standard conflict markers) and resolve them before
committing. Skill files are regenerated from canonical sources; customizations to generated
skill files are not preserved.

For the complete file inventory and classification rationale, see the
[File Classification Strategy][file-classification].

---

[file-classification]: reference/strategies/arc/strategy-file-classification.md
