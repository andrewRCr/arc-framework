# Atomic Tasks — CLI Implementation

**Purpose:** Tracking of indivisible one-off tasks you elect to do in parallel to the
planned work — discovered during execution, not required for the work unit's success
criteria. Flat checkbox list, no numbering hierarchy.

> Multi-step work required for the WU belongs in the task list as a new phase.
> For multi-step work outside the WU's concern, see `manage-incidental-work.md`.

---

- [x] **Standalone atomic companion file convention and capture surface boundary refinement**

    Replace the inline `## Atomic Tasks` section in task lists with a standalone
    `atomic-{name}.md` companion file. Refine the three-surface boundary model (task list /
    atomic companion / ATOMIC-INBOX) from domain-relatedness to lifecycle intent: "will I do
    this during this WU?" vs. "is this for later?"

    **Methodology docs (~10 files):**

    - `strategy-task-list-formatting.md` — remove inline section template, document companion
      file convention (always created alongside task list, `atomic-{name}.md` naming, flat
      checkbox structure, archive if populated / delete if empty at integration)
    - `DEV-RULES.ARC.md` — update leave-it-cleaner routing table destination from "Active task
      list → Atomic Tasks section" to companion file reference
    - `strategy-backlog-organization.md` — reframe ATOMIC-INBOX justification around lifecycle
      properties (gitignored, branch-agnostic, persistent across WUs), not domain; refine
      boundary guidance to lifecycle-intent model
    - `process-task-loop.md` — update atomic task routing reference
    - `integrate-work-unit.md` — add companion file handling (archive if populated, delete if
      empty; conditional check: grep for `- \[` checkbox pattern)
    - `activate-work-unit.md` — include companion file in activation move
    - `verify-work-unit.md` — verification step references companion file
    - `strategy-file-classification.md` — add `atomic-{name}.md` file type entry
    - `arc-methods.md` § commit-context-format — add `Context: atomic-{name}.md` as valid
      pattern (replaces `(atomic)` suffix on task list reference)
    - ATOMIC-INBOX template (`src/templates/user/ATOMIC-INBOX.md`) — refine guidance text to
      lifecycle framing

    **Code / hook:**

    - Commit-msg hook — accept `Context: atomic-{name}.md` pattern

    **CLI task amendments:**

    - Task 7.4 — `arc log --atomic` grep pattern to also match `Context: atomic-` filename
    - Task 7.9 — test coverage for both patterns

    **Design decisions:**

    - Core/External mode: unresolved items at integration default to "ask the user"
    - Incidental task lists: included (full work units, get companion files)

- [ ] **Decouple agent config files from init — setup workflow handles {AGENT}.ARC.md**

    Agent config files (CLAUDE.ARC.md, CODEX.ARC.md, etc.) are unpopulated templates at init
    time. The setup workflow is a better place to create them: the agent is running, knows its
    own identity/model, and can populate with real content. Decoupling also solves the
    tool-vs-model problem (Cursor with Claude, Augment with GPT, etc.).

    - Remove `tools includes X` → agent file conditions from `init-recipe.json`
    - Add a step to the initial-setup workflow for agent-specific config file creation from
      a template (agent self-scaffolds based on its identity)
    - Create `template-agent.md` in `.arc/reference/templates/` (on-demand template, not
      init-rendered — uses `template-*` prefix per file classification convention)
    - Existing agent files (CLAUDE.ARC.md, CODEX.ARC.md, etc.) remain as pre-built options
      that the setup workflow can use instead of the generic template

- [ ] **Broader tool support — agent files for Amp, Cline, OpenCode, Antigravity, Augment**

    New tools added to the init prompt (Task 3.6.b) for skill generation. Follow-up: create
    agent config files and assess whether these tools need tool-specific guidance beyond what
    the generic template provides. Depends on the setup workflow decoupling above.

- [ ] **Audit init-recipe.json for missing workflow files**

    16 workflow files in `.arc/system/workflows/` are not listed in `init-recipe.json`
    `include_files` — adopters running `arc init` would not receive them. All files predate
    the recipe creation, so this is likely an oversight during task list authoring, not
    intentional omission. Evaluate before bulk-adding: a few may be conditional on config
    (e.g., planning branch workflows on `pm.mode`, initial-setup `01_`/`02_` are always
    needed). Missing files include session-handoff, session-loop, all supplemental workflows
    (prepare-commits, manage-incidental-work, integrate-external-content,
    maintain-project-docs), all work-unit-lifecycle workflows (activate, integrate, verify,
    archive, clean, rotate-branch, planning/\*), initial-setup `01_`/`02_`, and
    `project/README.md`.

- [x] **Strengthen session boundary guidance in DEV-RULES.ARC**

    DEV-RULES.ARC § Context quality: add explicit recognition that design-to-implementation
    transitions are natural session boundaries, not just context pressure. Long sessions that
    span analysis and implementation risk the same degradation that context limits cause —
    guidance loaded early gets deprioritized. Reference the session management strategy's
    evidence base. Strengthening existing position, not adding enforcement.

- [x] **Optimize session-init execution performance**

    Changes to execution patterns in `session-init.md` only — no reduction in loaded content.

    - **Parallel file reads**: Batch documents with no ordering dependencies into parallel
      reads. Most init docs are independent. Only hard dependency: WORK-STATUS before task
      list. Target: two batches instead of ~10 sequential reads.
    - **Reduce non-user-facing reporting**: Override scanning, extension status, non-default
      config, and freshness details are agent-internal — surface only on mismatch/problem.
    - **Gate freshness checks**: If SESSION-NOTES `Commit at Handoff` hash == HEAD, skip gap
      analysis. Only run when hashes diverge. Conservative gate — missing hash always checks.
    - **Batch config/methods scan**: Read `arc-config.yml` and scan `arc-methods.md` in one
      parallel batch. Defaults (common case) produce a single internal note, no user output.

---
