# Metadata: {wu-name}

<!--
  Field semantics. The core fields (State, Owner, Branch, Class, Priority)
  render as a single-row table; the remaining fields as ordered bullet groups.
  Value-format convention: enum tokens render Capitalized and backticked
  (`Active`, `Heavy`, `P3`); identifier values — slugs, `.md` filenames,
  branches, URLs — render backticked; bracket sentinels (`[none]`,
  `[internal]`, `[TBD]`) render bare; narrative fields render as plain prose.

  Placeholder conventions used in this template:
    `{wu-name}`      — interpolation token; replaced with the work-unit name at
                       meta-file creation (init-work-unit.md)
    `{arc.identity}` — config-key reference; init-work-unit.md substitutes
                       the resolved `arc.identity` value
    `—`              — author / workflow fills in (no sentinel default)
    `[none]`         — empty-value sentinel

  Core (rendered as the single-row table):
  - **State** — `Planning` | `Active` | `Integrating` | `Shipped` (strict
    4-state machine). Transitions fire at workflow ceremonies:
    init-work-unit → Planning · activate-work-unit → Active ·
    integrate-work-unit → Integrating · archive ceremony → Shipped. Branch
    operations are internal to Planning state.
  - **Owner** — single `arc.identity` value.
  - **Branch** — branch this work unit lives on; single value
    (single-branch-per-work-unit).
  - **Class** — `Light` | `Heavy` | `Novel` | `[TBD]` (default `[TBD]` until
    resolved). The work unit's weight across planning, execution, and review.
    Carries a best-estimate value once the work unit is ready to start, re-tuned
    at each lifecycle surface. Estimate-then-ratchet: a pre-planning estimate is
    freely revisable in either direction, but once a stage has authored design at
    some depth, `Class` never drops below that floor.
  - **Priority** — `P1` (top focus) | `P2` (elevated) | `P3` (baseline);
    default `P3`. Human-set attention level for triaging a multi-in-flight
    worklist; the in-flight views render and sort on it. No `P0` — its
    stop-the-world connotation misfits a standing attention scale. A soft
    cap on concurrent P1s is documentation discipline only — never an
    agent-surfaced nag or render-time signal.

  Cohort:
  - **Cohort** — path value mirroring the on-disk cohort directory: a single
    segment for a top-level cohort, `<cohort>/<subcohort>` for a nested one,
    or `[none]` for a standalone work unit; capped at two segments. Source of
    truth for cohort membership (the sibling list is derived, never stored).
    Dual-placement: also carried in the `draft-*` / `spec-*` header (full
    path) so the spec self-describes its grouping once the work unit activates.
  - **Depends On** — bare work-unit-name list; default `[none]`. Renders into
    the project readiness view's dependency grouping.

  Reference (chain-of-authority order: Origin → Design → Task List → PR URL):
  - **Origin** — default `[internal]`; external tracker URL when applicable.
    Orthogonal to Design; the chain head. External trackers go here, never in
    Design.
  - **Design** — `[none]` | backticked `.md` filename of the upstream design
    artifact: `draft-{name}.md` during Planning, `spec-{name}.md` from Active
    onward. Always an ARC-owned planning artifact (external trackers go in
    Origin). The filename is stable across spec forms — a spec's weight lives
    in its H1 and template, not its filename. Design-directed: intent is set
    upfront here; the task list decomposes it.
  - **Task List** — `[none]` during planning; `tasks-{name}.md` filename
    during execution (path derived from this meta file's directory —
    co-located by convention).

  Progress:
  - **Current Workflow** — `[none]` outside planning; the active
    planning-stage workflow basename during planning (`draft-design` /
    `create-spec` / `generate-tasks`). Code-owned — written only by the
    lifecycle executor at each stage transition, never hand-edited;
    session-init reads it to load the planning sub-stage.
  - **Last Completed** — Task ID + title | ceremony marker (e.g.,
    `Work unit activated`) | `[none]` at planning start.
  - **Next Task** — triple-anchor `Task X.Y — title (line ~N)` | `[none]`
    between work units or during planning.
  - **Blockers** — `[none]` | freeform description of what's gating progress.

  Directive:
  - **Next Action** — within-stage judgment: what to do next *inside* the
    current stage. At a clean stage boundary, the `[begin current workflow]`
    sentinel — the workflow name lives in `Current Workflow`, never duplicated
    here. Distinct from `[none]` (parked). Never names a workflow directly.

  Appended at integration ceremony (post-integration block within H1 body):
  - **PR URL** — link to integration PR.
  - **Completed** — date stamp (YYYY-MM-DD).

  Appended at Active → Integrating transition (content H2s after the field
  blocks; absent during Planning / Active life-phase). Size each section to
  what was produced:
  - `## Release Notes Entry` — one-paragraph user-facing summary plus
    categorized lines per the 7-category Keep a Changelog set: Added,
    Changed, Removed, Fixed, Infrastructure, Deprecated, Security. Optional
    "Breaking Changes" callout flags lines that break stability contracts.
    **Omittable** — omit the whole section when nothing user-facing ships
    (a mechanical or internal-only change); size it to what shipped
    otherwise. Edits after `Shipped` are errata only; git history is the
    lock; no mechanical enforcement (matches Keep a Changelog norms).
  - `## Completion Notes` — narrative summary of what shipped; always
    present, sized to what there is to say.

  Retired from prior `template-status.md` shape (replaced by positive
  enumeration above):
  - `Branch(es):` plural form — use singular `Branch:` (single-branch-per
    -work-unit forecloses plural).
  - `Base Branch:` — invariant under single-branch model; project-level
    config concern, not per-work-unit state.
  - `Sibling Work Unit(s):` — cohort is source of truth; siblings derived.
  - `Integration:` — folds into State as the `Integrating` value.

  Deliberately not added:
  - `Worktree:` — per-machine; resolved via roster cascade + worktree
    location template. Tracked content shouldn't carry machine-specific
    state.
  - `Created:` / state-transition dates (`Activated:`, etc.) — derivable
    from git log on meta-* edits; metrics-flavor, out of scope here.
  - `Title:` / `Description:` — work-unit name in H1 covers identification;
    the substantive thesis lives in the co-located `draft-*` / `spec-*` per
    the chain-model header convention.
-->

| **State** | **Owner**      | **Branch** | **Class** | **Priority** |
| --------- | -------------- | ---------- | --------- | ------------ |
| —         | {arc.identity} | —          | [TBD]     | `P3`         |

- **Cohort:** [none]
- **Depends On:** [none]

- **Origin:** [internal]
- **Design:** [none]
- **Task List:** [none]

- **Current Workflow:** [none]
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

  {One-paragraph, user-facing summary of what shipped. Omit this whole section —
  heading included — when nothing user-facing ships (a mechanical or
  internal-only change).}

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
  Release Notes lines are user-facing: neutral voice, no internal work-unit names or
  roadmap pointers.

  ## Completion Notes

  {Narrative synthesis — design intent, what actually shipped, key deviations /
  supersessions from plan, verification outcome. Sized to what there is to say.
  Complements, does NOT repeat, the task list's verbatim record and git history.
  Internal-dev audience; work-unit names and cross-references are fine here.}
-->
