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

- [x] **Decouple agent config files from init — setup workflow handles {AGENT}.ARC.md**

    Common agents (Claude, Codex, Gemini, Copilot, Cursor, Windsurf, Warp) retain pre-built
    files installed via `tools includes X` conditions in `init-recipe.json`. For agents
    without pre-built files, the setup workflow creates from template.

    - Created `template-agent.md` in `.arc/reference/templates/` with placeholder names and
      links relative to `system/agent/` destination
    - Added agent config file check to `01_verify-and-configure.md` in both Path 1 (Fresh
      Install) and Path 2 (Join Existing) — checks for `{AGENT}.ARC.md`, creates from
      template if missing
    - Registered `template-agent.md` in `strategy-file-classification.md` inventory
    - Added template + 15 other missing files (READMEs, arc-setup skill) to `init-recipe.json`
      discovered during cross-check (same oversight class as the workflow audit)

- [x] **Broader tool support — agent files for Amp, Cline, OpenCode, Antigravity, Augment**

    Assessed via external research: all five are harnesses wrapping known models, not unique
    agents. Antigravity runs Gemini (reads `GEMINI.md`), Amp is a multi-model router (reads
    `AGENTS.md`), Cline/OpenCode are model-agnostic (identify as configured backend),
    Augment is a proprietary Claude+O1 blend with no agent config mechanism. None need
    pre-built `{AGENT}.ARC.md` files — they either identify as the underlying model or use
    cross-tool standards that map to existing ARC files. The generic `template-agent.md`
    handles any edge case.

- [x] **Rename AGENTS.ARC/PROJECT → AGENT-BRIEFING.ARC/PROJECT**

    Renamed 4 files and updated references across ~37 files in both `.arc/` and
    `.arc-internal/` layers. Resolved naming collision with emerging `AGENTS.md` cross-tool
    standard — briefing files are universal orientation entrypoints, not model-specific
    config. Fixed cascading table alignment issues (MD060) in file classification strategy,
    notes, and analysis docs. Post-rename grep confirmed zero stale references.

- [x] **Audit init-recipe.json for missing workflow files**

    Added 16 missing workflow files to unconditional `include_files`. All are core
    methodology — evaluated planning branch workflows for `pm.mode` conditionality but
    they're tied to branch protection mode, not PM mode. Also reorganized the file list
    by directory for maintainability (was ad-hoc insertion order). Cross-verified: every
    recipe entry exists on disk, every workflow file on disk appears in the recipe.

---
