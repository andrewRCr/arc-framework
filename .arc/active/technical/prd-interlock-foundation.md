# PRD: Interlock Foundation

**Purpose:** Establish ARC's interlock-model constitutional foundation — vocabulary, configuration axis,
planning-session active surface, structured task-completion prompt, rollback protocol — so downstream
auto-mode behaviors (sibling WU) and consumer plans build on a stable frame.

---

## Introduction

ARC's session-operational concerns — task review, commits, push, status-file updates, handoff, integration —
were each designed against immediate problems. They don't compose into a shared model, and the resulting
incoherences surface as design friction: the `user.sync_push: always` notes-vs-worktree gap, per-task
status-file commit churn, the lack of a planning-session active surface, and the absence of a coherent
task-completion UX that works regardless of autonomy mode.

[ADR-016][adr-016] establishes the interlock model that resolves the framing gap: a linear autonomy stack
(task → commit → push → integrate) with invariant endpoints (task-interlock and integration-interlock are
human-only) and configurable middle interlocks (commit and push), plus handoff as an orthogonal human-invoked
ceremony. The ADR currently uses pre-rename "gate" vocabulary; this WU renames it as a Phase 1 deliverable.

This work unit lands the **constitutional foundation** — the framing, the configuration surface, the
planning-session active surface, the structured task-completion prompt as base ARC behavior, and the rollback
protocol — without yet implementing auto-commit or auto-push behavior. Auto-modes ship in the sibling WU
(`session-operational-flow`); they consume the frame this WU establishes.

**Why now:** five downstream plans ([plan-user-sync-ux][plan-sync], [plan-quality-gate-hooks][plan-hooks],
[plan-worktree-foundation][plan-wf], [plan-concurrent-work-conventions][plan-cwc],
[plan-agile-wu-lifecycle][plan-awl]) are blocked on the frame — without it they design against unstable
ground and risk fixes that don't compose. Self-host's own session-operational flow suffers per-commit
status churn today. Worktree-foundation and concurrent-work-conventions both target shipping in the next
quarter; both consume this frame.

## Goals

1. Land ADR-016's interlock model as ARC's constitutional frame for session-operational flow (vocabulary
   rename + DEV-RULES amendments).
2. Eliminate status-file timing churn — status updates fire only at handoff commits and workflow-ceremony
   commits, never at task-completion code commits.
3. Establish the structured task-completion prompt (`Proceed to Task X.Y?` / `Commit and proceed to Task
   X.Y?`) as base ARC behavior — manual mode benefits regardless of autonomy configuration.
4. Provide the planning-session active surface — status file at planning activation, `**Spec:**` and
   `**Sibling Work Unit(s):**` fields, `State: Planning` value, sessionType inference from State, and
   idempotent ensure-status-file fallback at WU activation for paths that bypass planning-branch ceremony.
5. Ship the configuration surface — `session.autonomy` axis with per-developer override, composite handoff
   probe, handoff-interior toggle config-key pattern documented for downstream consumers.
6. Document the rollback protocol — session-local, manual-confirmation, dev-rule-based — with no skill or
   log file infrastructure in v1.
7. Unblock downstream consumer plans to commit to designs against a stable frame.

## Use Cases or System Scenarios

**Scenario 1: Manual-mode task completion (default; no behavioral drift acceptable).**
Today: agent reports completion; user iterates ad-hoc with whatever phrasing they choose.
After: agent reports completion and ends the message with `Proceed to Task X.Y?`. User responds `y` to
advance, or anything else to iterate. Single-keystroke advance for the dominant case; iteration handling
unchanged.

**Scenario 2: Status-file no longer touched per task.**
Today: every task-completion commit bundles status-file rotation — atomicity violation, per-commit churn.
After: task-completion commits stay code-only. Status-rotation lands at the next session-handoff commit
or workflow-ceremony commit. Reviewers see code commits focused on code; status commits focused on
pointer state.

**Scenario 3: Planning-session resolves at session-init.**
Today: planning sessions resolve as `active.resolution: "none"`; project pointer lives only in gitignored
SESSION-NOTES; orientation can't surface planning context cleanly.
After: `activate-planning-branch.md` creates a status file at planning activation with
`State: Planning`, optional `**Spec:**` pointing at the plan-doc, and optional `**Sibling Work Unit(s):**`
when known. `integrate-planning-branch.md` disposes of the file on integration (graduated → convert State;
shelved → remove). Probe sessionType inference reads `State: Planning` as primary signal; orientation
surfaces planning context. For paths that bypass planning-branch ceremony (partial protection or other
entry routes), `activate-work-unit.md` Step 4 acts as the safety net — idempotent ensure-status-file
behavior creates the file at WU activation if absent.

**Scenario 4: Handoff workflow restructured around composite probe.**
Today: handoff workflow performs ad-hoc checks across multiple commands.
After: single `arc status --session-handoff --json` returns the full envelope (dirty state, worktree sync,
notes sync, autonomy mode, handoff-interior toggle values, active extensions). Workflow consumes the
envelope; per-action checklist consults each toggle's mode and acts.

**Scenario 5: Push ordering at handoff.**
When both worktree-push and notes-push fire at handoff, worktree-push lands first. Notes attach to commits
that must already exist on origin — reverse ordering produces the `user.sync_push: always` incoherence the
sync-UX plan exists to fix. The invariant is documented and enforced by workflow ordering, not config.

**Scenario 6: Migration during this WU.**
Two existing in-flight status files in the self-host repo are edited in-place during Phase 1 — no protocol,
no auto-migration logic. The repo has zero adopters; mass-migration infrastructure is unwarranted.

## Requirements

### P0 — Required for completion

**Constitutional frame:**

1. ADR-016 vocabulary cascade — file rename and body rewrite happen as pre-WU prep alongside this PRD's
   commit (the bolster + rename is treated as a single coherent operation done while context is fresh).
   Phase 1's residual work is cascading the new interlock vocabulary (`task-interlock`, `commit-interlock`,
   `push-interlock`, `integration-interlock`) to all incoming `.arc/` references — DEV-RULES.ARC, strategy
   docs, plan-doc cross-references not yet updated, and any workflow prose that references the old "gate"
   framing.
2. DEV-RULES.ARC gains a new top-level § Autonomy Stack section covering: the four interlocks, the
   configurable-default reframing of commit control (downgraded from non-negotiable principle), structured
   task-completion prompt format (base behavior), and rollback protocol (subsection).
3. DEV-RULES.ARC § Commit Discipline updated — "Work status accuracy" provision superseded by the
   status-file timing rule; cross-reference to § Autonomy Stack added.
4. DEV-RULES.ARC § Session Management updated — status-file timing split, handoff-as-orthogonal framing,
   parallel-session concurrency model framing.
5. Cascade prose updates to [strategy-team-coordination][strategy-team] (per-commit status-advance language),
   [strategy-session-operations][strategy-session] (timing split, handoff-interior toggle pattern,
   probe-extension contract for consumer plans), and [strategy-configurability-architecture][strategy-config]
   (add `session.autonomy` to convention inventory under operational-discipline tier; brief note on the
   handoff-interior toggle pattern in the Configuration section).

**Status-file timing rule:**

6. `3_process-task-loop.md` updated — task-completion no longer touches the status file.
7. `session-handoff.md` restructured — status update lands at the handoff commit; per-action checklist
   consumes the composite handoff probe.
8. Lifecycle workflows (activate-work-unit, integrate-work-unit, sweep, deactivate, PRD generation,
   planning-lifecycle ops) bundle status updates into their own ceremony commits.

**Planning-session active surface:**

9. `template-status.md` adds `**Spec:**` field — polymorphic pointer accepting `.md` filename, URL, or
   empty — and `**Sibling Work Unit(s):**` field — comma-separated list of `prd-{name}.md` references to
   tightly-coupled WUs (same logical whole, split for sizing or sequencing). Both optional. Lives on the
   status file rather than the PRD because the status file is the unified WU pointer artifact (read at
   every session-init via Active Work, persisting into archive under
   [plan-completion-status-consolidation][plan-csc]).
10. `template-status.md` adds `State: Planning` value to the State enum (other enum values introduced in
    sibling WU; `In Progress` retained as today's default for non-planning WUs).
11. `activate-planning-branch.md` creates a status file at planning activation
    (State: Planning, optional Spec, optional Sibling Work Unit(s), no Task List).
12. `activate-work-unit.md` Step 4 becomes idempotent ensure-status-file — if a status file already exists
    from planning, transition it (State: Planning → In Progress, fill Task List, etc.); if absent, create
    from template. Acts as the universal safety net for paths that bypass planning-branch ceremony.
    Forward-compat foundation for the [arc-plan conductor][plan-conductor] reframe, which adds a third
    converging entry route (arc-plan invocation creates the status file when absent).
13. `integrate-planning-branch.md` handles status-file disposition on integration — graduated path converts
    State and retains the file; shelved path removes the file.
14. Plan-doc location during planning (arc-in-git only) — `activate-planning-branch.md` does
    `git mv backlog/{category}/plan-{name}.md → active/{category}/`; `integrate-planning-branch.md`
    disposes per outcome (graduated → `git rm`; shelved → `git mv` back to backlog). Other pm.modes leave
    plan-doc location user-managed.
15. Probe sessionType inference reads `State: Planning` as primary signal, with branch-pattern fallback
    retained for orphan cases.
16. Status-file creation contract documented in [strategy-session-operations][strategy-session]: routes
    converge on the same template with idempotent semantics (planning-branch ceremony / activate-work-unit
    fallback today; arc-plan conductor invocation in the future). Cross-referenced from
    [plan-arc-plan-conductor][plan-conductor] as the foundation it consumes.

**Configuration surface:**

17. `arc-config.yml` adds `session.autonomy: manual-commit | auto-commit | auto-push` (default
    `manual-commit`). Per-developer override via `git config arc.autonomy <value>` (mirrors the
    `user.sync_push` / `arc.syncPush` pattern).
18. CLI schema validation — `session.autonomy` value is one of the enum options or absent (default applies).
19. Session-init probe (`arc status --session-init --json`) extends `config.value.settings` to surface
    `session.autonomy` (alongside existing keys). Init-time consumers (load-set adaptation in sibling WU)
    read the value from there.
20. New CLI mode: `arc status --session-handoff --json`. Composite probe returning the handoff envelope
    (dirty state, worktree sync, notes sync, autonomy, handoff-interior toggle values, active extensions
    filtered to handoff fire points, resolved active status file). Reuses existing field-resolver
    machinery from session-init.

**Structured task-completion prompt (base behavior):**

21. `3_process-task-loop.md` task-completion step appends a structured prompt:
    - Default (manual-commit): `Proceed to Task X.Y?`
    - Auto-commit configured: `Commit and proceed to Task X.Y?`
    - Boundary-aware variants: `Proceed to Phase N+1, Task N+1.1?` at phase end; `Proceed to handoff?` at
      WU end.
    - User responses: any short affirmative as first word of the response (`y`/`yes`/`yeah`) advances; any
      other response falls to manual handling. Redirect syntax preserved: `y, also <X>` / `y; <redirect>`.
22. DEV-RULES.ARC § Autonomy Stack documents the prompt format as base ARC behavior (not auto-commit
    exclusive).

**Handoff-interior toggle pattern:**

23. Strategy-session-operations documents the pattern: handoff-interior actions get config keys under their
    primary domain (`user.sync_push`, future `worktree.sync_push`, future `handoff.<action>`). Standard
    value enum: `auto / prompt / manual` (or context-appropriate boolean variant). No new infrastructure;
    consumers add keys following the documented pattern.
24. **Push ordering invariant.** When both worktree-push and notes-push fire during handoff, worktree-push
    MUST land before notes-push. Documented in DEV-RULES.ARC § Autonomy Stack and enforced by the
    handoff workflow's per-action checklist ordering. Not a config; not optional.

**Reversibility / rollback protocol:**

25. DEV-RULES.ARC § Autonomy Stack subsection — protocol paragraph: when the user signals regret over an
    auto-cascade (sibling WU territory; the rule lives here for completeness), agent reads recent git log
    and conversation context, identifies cascade boundary, presents undo plan (commits to reset, push
    retraction status if applicable), awaits explicit user confirmation before destructive operations.
    Session-local scope. No skill, no log file in v1.

**Validation and migration:**

26. Pre-commit hook validates `**Spec:**` field shape — value matches `.md` filename, URL, or empty. Block
    commits on mismatch. Tier-aware validation (e.g., "atomic tier forbids non-empty") deferred to
    [plan-agile-wu-lifecycle][plan-awl].
27. The two existing in-flight status files in the self-host repo are migrated in-place during Phase 1.
    No protocol, no auto-migration code.

**Tests:**

28. Workflow updates verified via self-host dogfooding plus structural CHECK additions where applicable.
    CLI changes (`session.autonomy` reading, schema validation, composite handoff probe) verified via
    vitest unit tests. Pre-commit hook addition (Spec field validation) verified via shell test.

### P1 — Should-have, defer if scope tight

- **a. Probe-extension contract documentation** in strategy-session-operations — concrete pattern for how
  consumer plans (sync UX, etc.) extend the handoff probe envelope without restructuring it. Could ship
  as a notes-* file alongside this PRD if the strategy-doc edit gets crowded.
- **b. Quality-gate-failure structured-prompt variant** — `Quality gates failed: <details>. Investigate?
  (y / iterate)`. Keeps prompt rhythm consistent with task-completion. If task-list time reveals
  complexity, defer to sibling WU.

### P2 — Nice-to-have

- **a. Verbose vs. terse autonomy enum.** `manual-commit | auto-commit | auto-push` is verbose but
  self-documenting. Shorter forms (`manual | commit | push`) considered if dogfooding reveals a clear win.
  Default to verbose for v1.

## Non-Goals

The following are explicitly out of scope for this WU. They live in the sibling WU
(`session-operational-flow`) or in upstream/sibling consumer plans:

- **Auto-commit behavior implementation.** Sibling WU. This WU establishes the configuration axis
  and the prompt format; the sibling WU implements what `auto-commit` actually does when configured.
- **Auto-push behavior implementation.** Sibling WU. Push timing semantics (auto-at-handoff only; never
  per-commit) are documented; the actual push-firing logic is sibling-WU work.
- **Handoff-interior toggle enumeration beyond what exists today.** This WU documents the pattern and
  ships the composite probe; consumer plans (sync UX, hooks, etc.) add their specific toggles.
- **Worktree-push and notes-push pairing implementation.** [plan-user-sync-ux][plan-sync] consumes the
  composite probe + push ordering invariant established here.
- **Quality-gate hook placement at autonomy junctions.** [plan-quality-gate-hooks][plan-hooks] — separate
  concern; the hooks plan owns its tier-vocabulary decision independently.
- **Multi-worktree mechanics.** [plan-worktree-foundation][plan-wf] consumes the parallel-session framing
  and (later) the metadata-state foundation.
- **Concurrent-session conventions consuming configurable autonomy.** [plan-concurrent-work-conventions][plan-cwc].
- **Tier-aware sweep ceremony, full State + Integration field enum, archive cadence config.** Sibling WU
  Phase 7 + [plan-agile-wu-lifecycle][plan-awl].
- **Branch-gone resolution under auto modes.** Per ADR-016, this stays manual under all autonomy levels.
- **`/arc-rollback` skill.** Deferred. The dev-rule covers v1; promote to skill in a future WU if
  dogfooding shows demand.
- **Cascade log file or cascade-tracking infrastructure.** Not built. Agent context + conventional
  commit footers + git log cover the rollback use case for v1.
- **Canonical token grammar for `approved`.** Replaced by the structured-prompt pattern. The approval
  signal is anchored by the agent's prompt, not parsed by a global regex.
- **arc-plan conductor reframe.** [plan-arc-plan-conductor][plan-conductor]. This WU lands the
  status-file plumbing the conductor builds on (template additions including `**Sibling Work Unit(s):**`,
  lifecycle disposition, activate-work-unit ensure-status-file fallback); the conductor's depth selection,
  downstream orchestration (planning-branch invocation, worktree spawn coordination), and tier-aware
  behavior are the conductor WU's scope.

## Technical Considerations

**ADR-016 amendment mechanics.** ADR-016 was just landed and has no implementation work since; rename in
place is safe per the design-decision ratification — no supersession or amendment ceremony needed. File
rename, body rewrite, and design-rationale bolster (vocabulary precedent, status-file timing tradeoff,
push-timing reasoning, structured-prompt anchoring) execute as pre-WU prep alongside this PRD's commit
while context is fresh. Phase 1's residual ADR work is the vocabulary cascade across incoming references.

**Every-session-loaded context cost.** DEV-RULES.ARC is loaded by every agent at session-init; bytes there
have a cumulative context-budget cost across all sessions, all agents, all adopters. The new § Autonomy
Stack section must be written for operational sufficiency only — enough that an agent navigates downstream
workflows without re-deriving decisions, but no rationale, precedent, or tradeoff analysis. Decision
rationale that doesn't shape in-session behavior lives in ADR-016 (load-on-demand reference), strategy
docs (load-on-demand for codified domains), or the docs site (load-free for in-repo agents). This scopes
Phase 1 drafting tightness across all DEV-RULES amendments and the new section.

**Rationale-extraction during Phase 1 drafting.** When DEV-RULES drafting produces text that crosses the
operational-sufficiency line (rationale, examples, precedent), apply the existing extraction convention
documented in [`notes-docs-content-sweep.md`][notes-sweep] § Source-Side Placeholder Convention — extract
the rationale prose into a `notes-docs-content-sweep.md` entry with proper source/line citation, leave a
`[TODO-docs-site]` placeholder at the extraction site, preserve markdown-lint cleanliness via the stub
definition. Standard pattern; no new infrastructure.

**arc-config.yml flat-key constraint.** Existing parsing (githooks, line-based shell matching) requires
flat keys with dotted grouping. `session.autonomy` follows the existing pattern. The handoff-interior
toggle "framework" honors the constraint — toggles are flat keys under their primary domain
(`user.sync_push`, future `worktree.sync_push`, etc.), not a nested `handoff.actions` map.

**Composite probe machinery reuse.** The session-init probe is implemented as a composite of named
field-resolvers. The session-handoff probe reuses these — `--session-handoff` is a new mode passing a
different field-set to the same composite logic. Not net-new infrastructure; structural extension of an
existing pattern.

**Handoff push-ordering invariant.** Documented in DEV-RULES.ARC and enforced by workflow ordering. No
automated cross-action ordering test feasible without a live remote — verified via dogfooding during
Phase 3 + sibling WU validation.

**Strategy-doc cascade scope.** Minimal in this WU — only the language that becomes inconsistent with the
new rules (per-commit status-advance prose in strategy-team-coordination; timing split + handoff-interior
pattern in strategy-session-operations). Comprehensive cascade is sibling WU Phase 7.

**DEV-RULES.ARC § Autonomy Stack as a new top-level section.** Chosen over amending § Commit Discipline +
§ Session Management because the interlock model is conceptually distinct from both — both inherit from
it. Burying the model inside existing sections would fragment it. The new section consolidates the
four-interlock model, autonomy axis, structured-prompt format, and rollback protocol; cross-references
land in the existing sections.

**Pre-commit hook for `**Spec:**` validation.** Extends existing pre-commit infrastructure with a new
shape-check (regex against `.md` filename or URL or empty). Tier-aware semantics deferred — the minimal
shape-check prevents drift between this WU's introduction of the field and downstream tier semantics.

**Bootstrap consideration.** This WU introduces the planning-session active-surface mechanics for future
planning sessions. WU-A's own planning session uses the pre-existing flow (no planning-active-surface).
That's expected; the bootstrap doesn't create a circular dependency.

**Status file as unified WU pointer artifact.** The `**Sibling Work Unit(s):**` field lives on the status
file (req #9) rather than the PRD because the status file is the unified pointer artifact across the WU
lifecycle: read at every session-init via `## Active Work` for orientation; persisting into archive under
[plan-completion-status-consolidation][plan-csc] as the WU's terminal record. The PRD template is not
extended with sibling-WU metadata; this keeps requirements artifacts focused on requirements and pointer
artifacts focused on pointer state.

**Activate-work-unit Step 4 idempotent transition.** Small extension of the current step: precondition
check + transition path when the status file already exists (from planning-branch ceremony or future
arc-plan conductor invocation), creation path when absent. Existing creation logic stays. The transition
path clears planning-state fields (Spec narrows or reformats per WU type) and populates execution-state
fields (Task List, Next Task, Last Completed: "Work unit activated").

## Success Criteria

- All quality gates pass at WU completion: markdown lint (zero violations), TypeScript typecheck (zero
  errors), test suite (all pass), build (succeeds).
- Self-host's own session-operational flow exercises the new behavior:
    - Manual mode preserves current behavior exactly (no behavioral drift acceptable for existing users).
    - Status-file timing rule observable: task-completion commits don't touch status files; handoff and
      ceremony commits do.
    - Planning-session active surface visible: status file present at planning activation; sessionType
      inference works without branch-pattern fallback in the dominant case.
    - Structured task-completion prompts appear at every task close in manual mode.
    - Composite handoff probe returns the expected envelope.
    - Push-ordering invariant holds: in handoffs that fire both, worktree push lands before notes push.
- Downstream consumer plans confirm the frame supports their scope without structural reshape — verified
  by reading each plan's "Relationship" section against this PRD's deliverables before WU-A integration.
- ADR-016 reads consistently after rename — no remaining "gate" references where "interlock" is meant.
- Validation window: at least three self-host sessions exercising the new frame between WU-A integration
  and WU-B activation. Concrete count revisited at task-list time.

## Open Questions

**Resolve during work:**

- **Validation window length.** Three sessions is a soft target; final count decided at task-list-generation
  time when the dogfooding plan is concrete.
- **Probe envelope final shape.** Provisional shape documented in Technical Considerations; tested against
  handoff workflow consumption during Phase 3 implementation. Adjustments expected.
- **Quality-gate-failure prompt phrasing (P1.b).** Final wording during Phase 3 if the variant ships in
  this WU; deferred to sibling WU otherwise.
- **`session.autonomy` enum verbosity (P2.a).** Verbose form (`manual-commit | auto-commit | auto-push`)
  is the default. Switch to terse form considered if dogfooding surfaces clear UX wins; otherwise
  verbose ships.

---

[adr-016]: ../../reference/adr/adr-016-configurable-autonomy-interlocks-for-session-operations.md
[strategy-team]: ../../reference/strategies/arc/strategy-team-coordination.md
[strategy-session]: ../../reference/strategies/arc/strategy-session-operations.md
[strategy-config]: ../../reference/strategies/arc/strategy-configurability-architecture.md
[plan-sync]: ../../backlog/technical/plan-user-sync-ux.md
[plan-hooks]: ../../backlog/technical/plan-quality-gate-hooks.md
[plan-wf]: ../../backlog/technical/plan-worktree-foundation.md
[plan-cwc]: ../../backlog/feature/plan-concurrent-work-conventions.md
[plan-awl]: ../../backlog/technical/plan-agile-wu-lifecycle.md
[plan-csc]: ../../backlog/technical/plan-completion-status-consolidation.md
[plan-conductor]: ../../backlog/feature/plan-arc-plan-conductor.md
[notes-sweep]: ../../backlog/technical/notes-docs-content-sweep.md
