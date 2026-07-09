# Draft: Task-List Conventions

- **Origin:** [internal] — three concerns routed from `USER-INBOX` at the work-routing-discipline housekeep
  drain (2026-06-01), each surfaced live during task generation / task-list audits.
- **Purpose:** Resolve a cluster of task-list-formatting + task-generation gaps that share edit surfaces
  (`strategy-task-list-formatting.md`, `template-tasks.md`, `2_generate-tasks.md`, `3_process-task-loop.md`):
  descriptor-block blank-line discipline, requirement-anchor traceability, and the Pass-3 interlock stop language.

---

## Inbound Buffer — Pending Integration

> *Routed-in concerns pending holistic integration into the body at this WU's next planning iteration*
> *(`drain-inbox § 5`); each carries its origin. Integrate — or consciously reject — at iteration.*

### `[ ]` **Forbid non-linear blocked-open leaves in generated task lists**

- *Routed from:* `USER-INBOX § Work Unit` (`WU_Target: task-list-conventions`), housekeep drain (2026-07-07);
  captured during `finalize-parallelism` Task 2.1.d recovery, 2026-07-06.
- *Concern:* FP generated a task-list shape where Task 2.1.c remained an open checkbox even though it depended on
  later Task 2.4.c, while later siblings 2.1.d / 2.1.e were intended to run first. The task cursor has no dependency
  or "skip and return" mechanism; it selects the next open executable checkbox, so session-init / recovery kept
  pointing at the blocked 2.1.c leaf until the list was repaired.
- *Approach:* Codify and guard the topology invariant: open executable checkboxes must be linearly runnable from top
  to bottom. A task that depends on later work must be moved to a later executable leaf, represented as a later
  follow-on, or excluded until generated in the correct position. Evaluate both sides: task-generation/finalization
  checks that reject this shape, and task-cursor diagnostics that fail loud if a future dependency/blocked marker is
  ever standardized.

### `[ ]` **Structural task-list-shape conventions for long-running / observational / absorptive WUs**

- *Routed from:* `USER-INBOX § Work Unit` (`WU_Target: task-list-conventions`), housekeep drain (2026-07-07);
  captured during `finalize-parallelism` generate-tasks (planning close), 2026-07-05.
- *Concern:* FP's generate-tasks surfaced six structural/shape-level task-list convention gaps — distinct from
  micro-formatting scope. They concern how a long-running, observation-driven, absorptive WU is represented in the
  phase/task grammar:
    1. **Verification-as-spine vs. terminal-thin verification phase** — `strategy-task-list-formatting`
       § Verification Phase assumes verification is always a single terminal `verify-work-unit.md` pointer; FP's
       verification is its *spine* (four substantive burn-in wave phases). No convention for substantive interior
       verification phases coexisting with the terminal gate.
    2. **Calendar-gated / externally-gated phases** — leaf = bounded single-session increment doesn't fit a burn-in
       wave (calendar-gated, spans a window, coordinates external sacrificial-workload WUs). No convention for a
       phase gated on external availability rather than prior-phase completion.
    3. **Legitimately-open / absorptive phase vs. authored-once task list** — the Resolution model mandates a
       "resolve discovered seams" phase that accretes tasks mid-execution; the finalize checklist assumes the list is
       complete at finalize; the R-scheme covers post-complete expansion, not a phase *planned* to grow.
    4. **Evidence-gated / conditional task content vs. "no pending, document what is"** — a doctrine-reconciliation
       edit-set and three seam-audit decisions can't state their concrete action upfront. FP interpretation: write
       the Goal as the decision *procedure + recorded outcome*, not the unknown resolution. The "no pending" finalize
       rule may need an explicit carve-out for empirically-gated tasks.
    5. **(minor) Deliverable-is-a-finding / commit rhythm** — many wave leaves' deliverable is a finding recorded in
       notes/checklist, and workload commits land on *other* WUs' branches, so FP's branch sees notes/checklist
       commits (not code) for whole phases; the `_Outcome:_` / "quality gates pass" per-increment framing assumes a
       code-or-doc increment.
    6. **Grounding-audit cadence: group-by-axis batching** — generate-tasks Pass-3 fires a per-phase confirm gate;
       FP surfaced a *middle*: group phases on a common grounding-character axis (code-facing / observational /
       doc-facing) and batch the confirm gate per group (collapsed 7 gates → 3). Worth codifying as a sanctioned
       cadence option alongside per-phase and full-waiver.
- *Prototype (FP, gap 3):* FP adopted a `> [!NOTE]` callout in the open phase's preamble marking it grow-in-place;
  present-while-open, removed-on-close; placed *after* `_Purpose:_`, as the last element before the task space.
  Parser-safe. Open codification question: on marker removal, is a replacement `_Note:_` warranted, or does
  `_Purpose:_` suffice?
- *Discipline note:* FP minted exactly *one* new marker (the open-phase callout); gaps 2 and 4 were handled with
  existing grammar (`_Note:_` / preamble prose + Goal wording), NOT new descriptor fields. Whether standardized
  gating / evidence descriptors *should* exist is a proposal for this WU to weigh.

### `[ ]` **Codify the letter-suffixed inserted-phase task-list convention**

- *Routed from:* `USER-INBOX § Work Unit` (`WU_Target: task-list-conventions`), housekeep drain (2026-07-07);
  captured during `finalize-parallelism` task-list rework, 2026-07-05.
- *Concern:* Inserting a phase without renumbering the tail (FP's `Phase 2.R` / `2.I` / `2.E`, task ids like
  `2.I.1.a`) parses and validates today — cursor id grammar `\d+(?:\.[0-9A-Za-z]+)+`, documented `4.R.1`; the
  `2.R.1.a` commit footer already validated — so it is non-blocking. The insert-without-renumbering convention
  itself is still ad hoc across task lists.
- *Approach:* Bless / generalize it as an official pattern, sibling to the Phase 7 open-phase `[!NOTE]` prototype
  marker this WU already owns.

### `[ ]` **Final task-list requirement traceability across spec forms**

- *Routed from:* `USER-INBOX § Backlog`, housekeep drain (2026-06-06); captured during
  `class-model-foundation` task generation.
- *Concern:* `2_generate-tasks.md` codifies R-ID anchors only for the Pass 1 skeleton; the final task-list
  convention is still undefined. A per-phase `_Requirements:_` line mapping parent tasks to requirement ranges
  looks like a useful middle altitude, but the convention needs to decide whether anchors persist at all.
- *Coordination:* `scalable-authoring-pipeline` owns the spec-form family, including the detailed-RFC equivalent
  to numbered PRD requirements. This WU owns the final task-list grammar / persistence rule and should coordinate
  that form-dependent anchor shape rather than hard-code PRD-only R-IDs.

### `[ ]` **Task-list cursor marker grammar as a CLI contract**

- *Routed from:* `compaction-recovery` Phase 4.R (2026-06-28).
- *Concern:* `arc status --session-init --json`, `arc status --recover --json`, compaction seed emission, and
  `arc recover audit --json` now derive a deterministic `taskCursor` from task-list checkbox markers. The parser
  treats parent headings shaped like `### \`[ ]\` **<id> <title>**` and subtask bullets shaped like
  at least four spaces followed by `- \`[ ]\` **<id> <title>**` (or plain text) as the operational cursor grammar.
- *Coordination:* when this WU formalizes task-list marker/spacing rules, preserve or consciously migrate that
  cursor grammar. If the convention changes, update the shared `task-list/cursor` projection and the recovery
  audit together so agents never infer current leaf state from stale meta fields.

### `[ ]` **Per-phase approval cascade in `2_generate-tasks` audit pass (reconcile with § Scope item 3)**

- *Routed from:* `ATOMIC-INBOX`, shared-inbox sweep (2026-06-02).
- *Concern:* the Step 3.2 audit-pass `workflow-interlock` ("Stop after the audit findings and corrections are
  applied per phase") reads as *apply-then-stop*; the cleaner pattern is *surface findings + proposed
  corrections per phase, await direction before applying,* with approval of one phase's corrections cascading
  to permission for the next phase's audit.
- *Reconcile:* this is the **same Step 3.2 interlock** as § Scope item 3 (*Strengthen `2_generate-tasks` Pass-3
  interlock language*), but proposes a **different mechanism** — an *auto-cascade* (approval rolls one phase
  forward) vs. item 3's *explicit user batch-waiver* ("audit the rest without stopping"). Resolve the tension
  between the two models at iteration rather than codifying both.
- *Scope:* Quick-tier; ~3-line edit in both `2_generate-tasks.md` copies (folds into item 3's edit surface).

### `[ ]` **`_Outcome:_` shape example + blank-line-separator adherence at completion-notes time**

- *Routed from:* `ATOMIC-INBOX`, shared-inbox sweep (2026-06-02); broadened during the sweep from the original
  `_Outcome:_`-only capture.
- *Concern (two facets, one drift zone):* (a) an agent wrote `_Outcome:_` as a 4-space-indented paragraph (no
  leading `-`) instead of a top-level bullet peer to `_Goal:_`, despite reading the prose guidance — the rule
  is verbal, neither `3_process-task-loop.md` § Completion protocol nor `strategy-task-list-formatting.md`
  § Goal/Note Lines shows the literal markdown shape. (b) more generally, the codified blank-line-separator
  conventions don't reliably stick at completion-notes-writing time — the same deep-indent drift zone the
  WORKING-MEMORY wide-wrap note tracks.
- *Proposed:* add a small code-block shape example near the bullet-at-root prose (showing `_Goal:_` →
  description → `_Outcome:_` at the parent column); pair it with the § Scope item 1 descriptor-block blank-line
  work so the loose-list + shape conventions land together. *Watch-and-wait* on the `_Outcome:_` facet (first
  observed occurrence — three instances, one session); the blank-line-adherence facet is the recurring one.
- *Scope:* Quick-tier; doc/example edits in `3_process-task-loop.md` + `strategy-task-list-formatting.md`
  (+ `template-tasks.md`), two-copy.

### `[ ]` **Make task-list `verify-work-unit.md` references filename-only**

- *Routed from:* `USER-INBOX § Atomic`, housekeep drain (2026-06-12); captured during task generation for
  `merge-safety-mechanism`, when the pre-commit link-resolution check flagged the copied template path.
- *Concern:* both copies of `template-tasks.md` ship the `[verify-work-unit]` link with a relative path that is
  correct for neither active nor planned task-list locations. Recent task lists have silently diverged to local
  relative paths, and any relative link from a movable task-list artifact violates the relocation rule because the
  source path changes across lifecycle moves.
- *Proposed:* render the reference as filename-only, backticked `verify-work-unit.md`, and drop the link definition.
  Also make the source-side rule explicit: movable artifacts should not carry outbound relative links even to stable
  docs. This trades link-check validation for relocation safety, matching the existing workflow-reference
  convention.
- *Files / coordination:* `strategy-task-list-formatting.md` § Verification Phase and `template-tasks.md`, both
  two-copy. Coordinate with `quality-gate-hooks`, whose draft already tracks the outbound relative-link enforcement
  catch.

### `[ ]` **Soften the tight-descriptor-cluster rule to match the loose-spacing preference**

- *Routed from:* `USER-INBOX § Work Unit`, housekeep drain (2026-06-25); captured during `partial-push-marker`
  generate-tasks (Finalize formatting pass).
- *Concern:* `strategy-task-list-formatting.md` § Blank-Line Discipline codifies "descriptor clusters stay tight"
  (no blank line between `_Goal:_` and peer descriptors), but it's unenforced (no markdownlint rule) and
  completed-file practice is mixed (`errand-lattice` tight, `release-wrappers-foundation` loose). Maintainer
  preference is the loose form; the codified rule pulls agents to "correct" toward tight, churning files needlessly.
- *Proposed:* soften the strategy text so loose spacing is acceptable (or the explicit default), aligning the
  written convention with actual preference and practice.

---

## Scope (routed captures — iterate into a plan)

### Make the root descriptor block loose

Task-list-formatting gap surfaced re-auditing `worktree-foundation`:

- **Descriptor-block blank lines (decided: loose).** The root descriptor block (`_Goal:_` + peer descriptors +
  any `**Additional Context:**` line) renders tight even when bullets are multi-line, which is hard to parse in
  raw. Desired state: loose-list — a blank line between every descriptor bullet when any is multi-line. The
  strategy doc is ambiguous (§ Goal/Note Lines "block" framing vs. § Blank-Line Discipline loose-list rule);
  resolve in favour of loose and codify in `strategy-task-list-formatting.md` + `template-tasks.md`. Not
  Tier-1-lint caught — a pre-save-checklist convention.
- **Files (all two-copy):** `strategy-task-list-formatting.md`, `template-tasks.md`, and `2_generate-tasks.md`
  formatting checklist text if needed. `worktree-foundation`'s task list is the symptom — reflow / trim it as
  dogfooding when this lands, not before.

### Codify a requirement-anchor field (R-ID traceability), or confirm anchors are Pass-1-only

`2_generate-tasks.md` Pass 1 has parent skeletons "cite R-ID anchors (which PRD requirements each parent
satisfies)," but never codifies whether those anchors persist into the final list or what field carries them.
Generating `tasks-work-routing-discipline.md` exposed the gap — filled it by inventing a non-codified
`_Satisfies:_` descriptor (absent from `strategy-task-list-formatting.md` § Goal/Note Lines' taxonomy), then
removed it. Decide: (a) codify a sanctioned requirement-anchor field in `strategy-task-list-formatting.md` +
`template-tasks.md` + the Pass 4 checklist (traceability genuinely helps the verification phase's
criteria→requirement mapping), or (b) state explicitly that R-anchors are a Pass-1 decomposition device that
does not persist past Pass 2.

### Strengthen `2_generate-tasks.md` Pass 3 interlock language (unconditional stop + sanctioned waiver)

The Step 3.2 `workflow-interlock` ("stop and await direction before editing") is per-phase, but its wording lets
an agent rationalize skipping the stop when a phase's findings are all "carry as context" (no masked decision).
Hit live generating `tasks-work-routing-discipline.md`: honored the stop for Phase 1, then collapsed
audit+surface+edit into single turns for later phases on the reasoning "no decision needs surfacing." The stop is
also the user's pacing/absorption/redirect point (the human can't hold as much in context and needs the beat to
weigh in), not only a decision gate. Two fixes: (1) state the stop is unconditional — fires every
non-verification phase regardless of finding severity; the agent may not collapse 3.2 into 3.3 on a "no decision
needed" judgment; (2) add a sanctioned batch-waiver so the **user** can authorize "audit the rest without
stopping." Possibly generalize in DEV-RULES.ARC: always-stop interlocks are user-waivable only, never
agent-waivable. Touches `2_generate-tasks.md` (+ maybe DEV-RULES.ARC) — two-copy.

---

## Scope Estimate

Small–medium; doc + workflow edits across `strategy-task-list-formatting.md`, `template-tasks.md`,
`2_generate-tasks.md`, and possibly `3_process-task-loop.md` (two-copy sync). Carries one design fork
(requirement-anchor codify-vs-confirm-Pass-1-only) plus descriptor-spacing and interlock-language refinements to
resolve in plan iteration before tasks generate.
