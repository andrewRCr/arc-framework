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

### `[ ]` **Final task-list requirement traceability across spec forms**

- *Routed from:* `USER-INBOX § Backlog`, housekeep drain (2026-06-06); captured during
  `class-model-foundation` task generation.
- *Concern:* `2_generate-tasks.md` codifies R-ID anchors only for the Pass 1 skeleton; the final task-list
  convention is still undefined. A per-phase `_Requirements:_` line mapping parent tasks to requirement ranges
  looks like a useful middle altitude, but the convention needs to decide whether anchors persist at all.
- *Coordination:* `scalable-authoring-pipeline` owns the spec-form family, including the detailed-RFC equivalent
  to numbered PRD requirements. This WU owns the final task-list grammar / persistence rule and should coordinate
  that form-dependent anchor shape rather than hard-code PRD-only R-IDs.

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
