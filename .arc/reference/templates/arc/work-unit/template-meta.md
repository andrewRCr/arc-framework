# Metadata: {wu-name}

<!--
  Field semantics. Core fields always present; `[none]` is the empty-value
  marker. Wrap `.md` filenames and URL values in backticks for code-span
  rendering; sentinels like `[none]` stay bare.

  Placeholder conventions used in this template:
    `{wu-name}`      — interpolation token; replaced with the WU name at
                       meta-file creation (init-work-unit.md)
    `{arc.identity}` — config-key reference; init-work-unit.md substitutes
                       the resolved `arc.identity` value
    `—`              — author / workflow fills in (no sentinel default)
    `[none]`         — empty-value sentinel

  Identity:
  - **State** — `Planning` | `Active` | `Integrating` | `Shipped` (strict
    4-state machine). Transitions fire at workflow ceremonies:
    init-work-unit → Planning · activate-work-unit → Active ·
    integrate-work-unit → Integrating · archive ceremony → Shipped. Branch
    operations are internal to Planning state.
  - **Owner** — single `arc.identity` value.
  - **Branch** — branch this WU lives on; single value (single-branch-per-WU).

  Reference (chain-of-authority order: Origin → Design → Task List → PR URL):
  - **Origin** — default `[internal]`; external tracker URL when applicable.
    Orthogonal to Design; the chain head.
  - **Design** — `[none]` | backticked `.md` filename of the upstream design
    artifact (`draft-{name}.md` during planning; `spec-{name}.md` during
    execution). Role-named, not artifact-typed — generalizes across spec-form
    variants and tier × mode combinations. Design-directed: intent is set
    upfront here; the task list decomposes it.

  Coordination:
  - **Depends On** — bare WU-name list; default `[none]`. Renders into
    ROADMAP tier grouping.
  - **Cohort** — single cohort name; default `[none]`. Source of truth for
    cohort membership; sibling list derived.
  - **Priority** — `P1` (top focus) | `P2` (elevated) | `P3` (baseline);
    default `P3`. Human-set attention level for triaging a multi-in-flight
    worklist; the in-flight views render and sort on it. No `P0` — its
    stop-the-world connotation misfits a standing attention scale. A soft
    cap on concurrent P1s is documentation discipline only — never an
    agent-surfaced nag or render-time signal.

  Task pointers:
  - **Task List** — `[none]` during planning; `tasks-{name}.md` filename
    during execution (path derived from this meta file's directory —
    co-located by convention).
  - **Last Completed** — Task ID + title | ceremony marker (e.g.,
    `Work unit activated`) | `[none]` at planning start.
  - **Next Task** — triple-anchor `Task X.Y — title (line ~N)` | `[none]`
    between work units or during planning.
  - **Blockers** — `[none]` | freeform description of what's gating progress.

  Directive:
  - **Next Action** — imperative description of what to do next.

  Appended at integration ceremony (post-integration block within H1 body):
  - **PR URL** — link to integration PR.
  - **Completed** — date stamp (YYYY-MM-DD).

  Appended at Active → Integrating transition (content H2s after the field
  blocks; absent during Planning / Active life-phase):
  - `## Release Notes Entry` — one-paragraph user-facing summary plus
    categorized lines per the 7-category Keep a Changelog set: Added,
    Changed, Removed, Fixed, Infrastructure, Deprecated, Security. Optional
    "Breaking Changes" callout flags lines that break stability contracts.
    Edits after `Shipped` are errata only; git history is the lock; no
    mechanical enforcement (matches Keep a Changelog norms).
  - `## Completion Notes` — narrative summary of what shipped.

  Retired from prior `template-status.md` shape (replaced by positive
  enumeration above):
  - `Branch(es):` plural form — use singular `Branch:` (single-branch-per-WU
    forecloses plural).
  - `Base Branch:` — invariant under single-branch model; project-level
    config concern, not per-WU state.
  - `Sibling Work Unit(s):` — cohort is source of truth; siblings derived.
  - `Integration:` — folds into State as the `Integrating` value.
  - `Interrupts:` / `Paused At:` / `Paused To:` — incidental WU substrate
    retired with the broader incidental-model reform.

  Deliberately not added:
  - `Worktree:` — per-machine; resolved via roster cascade + worktree
    location template. Tracked content shouldn't carry machine-specific
    state.
  - `Tier:` — reserved for Agile WU Lifecycle's Identity-group addition
    alongside `Branch:`.
  - `Created:` / state-transition dates (`Activated:`, etc.) — derivable
    from git log on meta-* edits; metrics-flavor, out of scope here.
  - `Title:` / `Description:` — WU name in H1 covers identification; the
    substantive WU thesis lives in the co-located `draft-*` / `spec-*` per
    the chain-model header convention.
-->

- **State:** —
- **Owner:** {arc.identity}
- **Branch:** —

- **Origin:** [internal]
- **Design:** [none]

- **Depends On:** [none]
- **Cohort:** [none]
- **Priority:** P3

- **Task List:** [none]
- **Last Completed:** [none]
- **Next Task:** [none]
- **Blockers:** [none]

- **Next Action:** —

---

<!--
  Archive-phase sections — materialized after the field block + `---` above at the
  Active → Integrating transition (integrate-work-unit.md Steps 8-9); absent during
  Planning / Active. Fill this skeleton:

  ## Release Notes Entry

  {One-paragraph, user-facing summary of what shipped.}

  **Breaking Changes:** {bullets flagging stability-contract breaks; omit the callout
  entirely when there are none.}

  ### Added
  - {new capabilities or surfaces}
  ### Changed
  - {behavior / convention changes}
  ### Removed
  - {retired surfaces}
  ### Fixed
  - {corrected behavior}
  ### Infrastructure
  - {build / CI / tooling / test-harness}
  ### Deprecated
  - {scheduled-for-removal, still present}
  ### Security
  - {security-relevant changes}

  Omit any category with no entries (Keep a Changelog norm); keep this order.
  Release Notes lines are user-facing: neutral voice, no internal WU names or
  roadmap pointers.

  ## Completion Notes

  {Narrative synthesis — design intent, what actually shipped, key deviations /
  supersessions from plan, verification outcome. Complements, does NOT repeat, the
  task list's verbatim record and git history. Internal-dev audience; WU names and
  cross-references are fine here.}
-->
