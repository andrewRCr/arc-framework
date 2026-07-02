# Draft: Decoupling Review and Commit Increments

## Inbound Buffer — Pending Integration

> *Routed-in concerns pending holistic integration into the body at this WU's next planning iteration*
> *(`drain-inbox § 5`); each carries its origin. Integrate — or consciously reject — at iteration.*

### `[ ]` **Reconsider the `review increment` term holistically**

- *Routed from:* `USER-INBOX § Backlog` (`WU_Target: commit-increments`), housekeep drain (2026-06-12); captured
  during `merge-safety-mechanism` Task 1.2 after a batch-review proposal surfaced the wording problem.
- *Concern:* `review increment` reads as "an increment of review" and is inaccurate under deferred review, where
  the unit is reviewable but not yet reviewed. The sharper concept is a bounded chunk of work that constitutes a
  reviewable unit. The acute wording symptom is phrasing like "review 4.2 as a single increment?", which can read
  as the agent reviewing rather than implementing one reviewable increment for human review.
- *Proposed:* decide the term alongside the paired `commit increment` vocabulary this WU owns. Options include
  `reviewable increment`, a `review boundary` / `commit boundary` pair, or another term; keep the rename cascade
  whole rather than creating a canonical-but-inconsistent gap. Exclude ADRs as historical record.
- *Scope:* approximately 72 occurrences across roughly 22 files, with two-copy sync for methodology surfaces.
  Coordinate with `naming-conventions` only for any general prose-vocabulary convention it codifies.

### `[ ]` **Let agents shape completion gates when recommending a held commit**

- *Routed from:* `USER-INBOX § Backlog` (`WU_Target: commit-increments`), housekeep drain (2026-06-12); captured
  during `merge-safety-mechanism` Task 1.2 alongside the term concern.
- *Concern:* the completion gate currently derives the literal prompt from `commitInterlock` mode, producing
  contradictions when the agent's own recommendation is to hold the commit, such as "recommend holding this until
  the next task lands. Commit and proceed?". The literal verb fights the intended structured approval gate.
- *Proposed:* separate the invariant from the string: preserve one explicit gate that names the work approval,
  available commit action, and advancement target, while allowing context-fitting wording such as "Approve work;
  hold the commit until X?". The current rules handle a user overriding with `y; hold the commit`; this fills the
  agent-proactive recommendation case already motivating this draft's commit-interlock prompt work.

### `[ ]` **Coordinate vocabulary + decoupling with the new sibling `unit-scoped-review`**

- *Coordination (cross-member, 2026-06-15):* `unit-scoped-review` joined the cohort — it widens the *review*
  increment to whole-WU scope (the limit of a leaf/phase/WU axis) and carries a hard `Depends On` to this WU.
- *Vocabulary:* it introduces "review increment = whole WU." The term reconsideration above must settle jointly
  with it — keep the rename cascade whole; don't land a canonical term here that the WU-scope case then bends.
- *Decoupling:* its per-leaf-commits-*during*-a-WU-batch property IS this WU's deferred-review-releases-commits
  fix at maximal scope. Confirm the fix generalizes to a WU-spanning batch (handoff-clean leaf commits; bundling
  signals still fire within the batch).
- *Provenance:* the parallel approval-provenance-state concept (§ Unknowns) composes with its batch authorization
  (a provenance source with WU scope) and its deviation ledger. See `cohort-approval-flow-refinement.md`.

### `[ ]` **Vocabulary + gate-shaping compose with `execution-delegation-doctrine`**

- *Routed from:* `--plan` grooming session (2026-07-02) that minted `execution-delegation-doctrine`
  (standalone planned stub).
- *Principle anchor:* the "let agents shape completion gates" entry above is a local expression of the doctrine's
  "no gate without a decision" half (a stop must carry a decision; separate the invariant from the literal
  string) — anchor its design rationale there rather than deriving it locally.
- *Vocabulary:* the review-increment term reconsideration should also accommodate the doctrine's graduated-scope
  framing (increment scope as a parameter: leaf / phase / WU) so the rename cascade lands once across all three
  cohort consumers and the doctrine WU.

---

## Problem / Motivation

ARC's task-execution model conflates two distinct boundaries — *where the agent stops to ask*
(review granularity) and *where work crystallizes into history* (commit granularity). Today both
default to the leaf checkbox: one task = one review increment = one commit. The conflation
mostly works, but it produces a real friction under deferred review.

**The visible symptom.** Under `commit_interlock: on-task-approval`, deferred review (a
user-scoped batch like "proceed to 2.R.2.a-d") suspends per-leaf review stops *and* suspends
the commit auto-fire that would normally accompany each task approval. The stated reason: there
is no per-task approval signal during the batch, so there is nothing to fire commits on. The
consequence: changes accumulate uncommitted across the batch, and at return-time review the user
faces a single multi-task diff. When the batched subtasks touch overlapping files, recovering
per-task atomicity at commit time requires hunk-splitting — a last-resort manual operation, not
a regular flow. The user's options today are: accept the entangled commit, hunk-split after the
fact, or avoid deferred review entirely. None of these scale.

**The underlying issue.** The "approval" signal is doing double duty: it is *both* the review
checkpoint *and* the commit trigger under `on-task-approval`. Deferred review legitimately
suspends the review checkpoint (the user pre-authorized the scope and stepped away), but there
is no reason it must also suspend the commit trigger. The user-scoped scope declaration *is* the
approval signal — a stronger one than per-leaf approval, not a weaker one.

**Why it matters for handoff.** Any fix has to preserve handoff coherence. Notes sync needs a
push to be meaningful for cross-machine continuity; push needs commits; the
`plan-coord-probe.md` story breaks if a session ends mid-batch with uncommitted
work and the next machine has no recovery signal. Solutions that defer commits to a parent-level
boundary fail this test — sessions interrupted mid-bundle leave neither a clean review checkpoint
nor a clean commit boundary, with no good cross-machine resume path.

**Why now.** The friction is small per occurrence but systemic — it nudges users away from
deferred review, which is a legitimate and necessary mode of operation. The fix is methodology-
internal and composes cleanly with adjacent work ([plan-interlock-release-wrappers][plan-irw],
`plan-coord-probe.md`). Better to land the conceptual model before more workflows
or methods accrete dependencies on the current conflation.

## Proposed Shape

### Vocabulary

Introduce `commit increment` alongside the existing `review increment`. Both are leaf concepts;
they are *orthogonal axes* describing different boundaries:

- **Review increment** — where the agent stops to ask. Default: every leaf task. Widened by
  deferred review (user-scoped batch suspends per-leaf stops within scope).
- **Commit increment** — where work crystallizes into history. Default: every leaf task.
  Bundling overlay (see below) may merge adjacent leaves into one commit when warranted.

The names parallel each other; the semantics differ. Today's "task = leaf task = review
increment = commit" collapses both axes into one term, which is why the deferred-review rule
ends up reaching across both axes when only one needs adjusting.

### Default

Leaf task = review increment AND commit increment. This matches existing user expectations,
keeps handoff at a clean commit boundary always, and avoids any task-list structural rule that
could collide with cross-machine resume. Hierarchy *does not* imply bundling — sibling subtasks
under a parent are independent commit increments unless an explicit bundle judgment merges them.

### Bundling judgment — signal-triggered

When two adjacent leaves are *genuinely one logical change* (e.g., "add helper" + "use helper"
where the helper is dead code on its own), the agent may recommend deferring the commit boundary
across them. The recommendation is **signal-triggered, not always-evaluated**:

- **File overlap** — the next task touches files just modified in the just-completed task.
- **Sibling subtasks** — the next task shares an immediate parent with the just-completed task.
- **Explicit marker hint** — a rare, opt-in task-list annotation flagging known bundling intent.

When no signal fires, no bundling consideration runs; the commit-interlock prompt is the normal
prompt. When a signal fires, the agent evaluates and surfaces a transparent recommendation:
*"Task X complete. Recommend deferring commit until Task Y — same logical change because
[reason]. Proceed?"* The user can accept or override.

This keeps per-task overhead near zero (signals are mechanical; judgment runs only when there is
something to judge) while preserving the value-add. Bundling is *judgment*, not *structure* —
no formal task-list markers required (the explicit hint is the rare exception, not the norm).

### Method-not-strategy split

Commit-increment guidance lives in a new `system/methods/commit-increment.md` (or similar name —
TBD at PRD). Rationale:

- **Load tier.** Methods are runtime-loadable; strategies are heavy and design-time-consulted.
  This guidance is consulted at every commit-interlock prompt — method tier is the right shape.
- **Configurability.** Methods carry the `.override` mechanic. Projects that want different
  bundling semantics (e.g., always-evaluate, never-bundle, custom signal set) get them without
  forking strategy content.
- **DRY.** `strategy-task-list-formatting` references the method as the source of truth for
  design-time atomicity consultation (generate-tasks, arc-task-audit). One contract, two consumers.

### Deferred-review fix

Under `commit_interlock: on-task-approval`, deferred review *releases commits at leaf
boundaries* during the batch. The user-scoped scope declaration is the approval signal; commits
fire as each leaf completes. Push remains gated independently (`push_interlock` is unchanged).
Bundling signals still fire transparently within the batch — when the agent detects overlap or
sibling structure, it surfaces a deferral recommendation; otherwise it commits at the leaf.

Under `commit_interlock: manual`, current behavior holds — the user wanted explicit per-commit
approval, and deferred review doesn't change that contract.

## Composition

**Handoff.** Sessions always land at a clean leaf-level commit boundary by default. Cross-
machine resume via plan-coord-probe stays clean — no mid-bundle uncommitted state. If a bundling
recommendation is mid-flight when handoff signals arrive, the agent commits at the leaf (the
default) and notes the bundling consideration in SESSION-NOTES for the next session.

**Deferred review composition.** Scope release fires commits at leaf boundaries within the
batch; bundling signals fire transparently when warranted; review at return becomes post-hoc
inspection rather than approval gate; user requests changes via follow-up commits or amend on
the still-unpushed branch.

**Forward compat with [plan-interlock-release-wrappers][plan-irw].** Wrappers enforce interlock
state at the CLI boundary; commit increments are still leaves with judgment-bundling overlay.
The wrapper sees a `commit_interlock` state authorizing release; whether that release is
per-leaf or bundled is upstream of the wrapper's concern. Clean composition.

**Forward compat with `plan-coord-probe.md`.** Cross-machine resume requires that
handoff land at a state the next machine can interpret. Leaf-default commit boundaries preserve
this. The bundling overlay never produces uncommitted-mid-bundle state at handoff.

**Composition with `plan-interlock-release-refinement.md`.** The first-class approval-provenance
state captured under § Unknowns (parallel structural concept) shows up from a different angle in
that plan's wrapper-routing migration — the wrapper's trust-shift becomes "carries approval
provenance to git" regardless of fire site, which lands cleaner when provenance is first-class
state rather than reconstructed per fire. The two concerns can ship independently or fold
together; the routing migration doesn't strictly require provenance-as-state but benefits from
it. Coordinate at PRD time.

## Alternatives

**Hierarchy-as-bundling default (subtasks bundle into parent commit).** Considered and rejected.
The model encoded atomicity in task structure (parent task = one commit; subtasks = pieces),
which would have been efficient at design time. But handoff mid-bundle leaves uncommitted work
with no clean recovery signal — breaks cross-machine resume under plan-coord-probe assumptions.
The leaf-default-with-judgment-bundling shape is handoff-clean by construction.

**Always-evaluate-silently bundling.** The agent silently considers bundling at every task; only
surfaces when bundling is recommended. Considered and rejected — adds a per-task token tax even
when no bundling is warranted, which compounds across long task lists. Signal-triggered design
gets the same value at near-zero overhead.

**Deferred-review-only bundling.** Bundling judgment only runs inside deferred-review batches;
normal per-leaf flow never considers it. Considered and rejected — loses value during normal
flow, where bundling recommendations remain useful (the "add helper / use helper" case is not
specific to deferred review). Signal-triggered evaluation captures the value in both modes
without the per-task tax.

**Explicit task-list bundling markers (formal annotation, e.g., `bundle-with: prev`).**
Considered and rejected as primary mechanism. Brittle (markers go stale as tasks restructure),
heavy (every task author has to think about commit grouping at design time), and miss the
common case where bundling intent emerges only at execution time. The `explicit marker hint`
signal in the proposed shape preserves the option for the rare design-time-known case without
making it the default.

**Pre-dispatch atomicity check at deferred-review invocation.** When the user invokes deferred
review, the agent first analyzes the proposed batch for file-overlap risk and reports a
confidence rating before proceeding. Considered and rejected — adds latency at every deferred-
review invocation; the agent often cannot predict file overlap accurately without doing the
work; gates the user behind a verification step that fails-closed (false positives surface as
"unsafe" warnings that erode trust). The runtime signal-triggered design absorbs this need into
the normal flow without the dispatch-time cost.

**"Allow commits during deferred review, gate pushes only" (status-quo-minus-suspension).**
Effectively this plan's deferred-review fix without the broader vocabulary or method
restructuring. Considered as a minimal-change variant. Rejected as the *only* change because it
fixes the visible symptom but leaves the underlying conflation in place — future work (smart
bundling, design-time atomicity hooks, configurable override) has nowhere to live cleanly.
The vocabulary + method shape is what makes those extensions composable.

## Unknowns and Assumptions

**Open design questions for PRD-time resolution:**

- Method name. `commit-increment`? `commit-bundling`? Something else? Naming should compose
  with existing `commit-format` and `commit-context-format` siblings.
- Signal threshold tuning. Sibling subtasks always trigger evaluation, or only when files
  overlap *and* siblings? Calibration question; can iterate post-launch.
- Override surface for the explicit marker hint. Inline parenthetical in the task line?
  Frontmatter on the task list? CLI annotation? PRD-time decision.
- Does the method extend `commit-format` / `commit-context-format`, or stand alongside them?
  Working assumption: standalone method, light cross-references to the format methods. PRD
  validates.
- Process-task-loop integration point. The bundling check fires at task completion (post-edit,
  pre-commit-interlock-prompt). Exact wording change in the workflow needs spec.
- DEV-RULES.ARC § Task Execution and § Commit Discipline updates. The deferred-review rule
  changes; the leaf-default formalizes; the bundling overlay needs documentation.

**Parallel structural concept — first-class approval-provenance state (captured for evaluation, not adopted):**

Today the agent reconstructs "what approval surface authorized this fire?" at every commit site —
walking back through recent prompts, class-tag context, and interlock-mode config. A structurally
cleaner shape carries approval-provenance as first-class session state:
`currentApprovalProvenance: { source: "task" | "workflow" | "incidental-prompt" | null, scope, timestamp }`.
Approval gates populate it; fire sites consume it. The fire-site decision collapses to "is provenance
fresh and in-scope? fire (route per `releaseOptedIn`) : prompt to establish provenance."

Composes with this plan because:

- The deferred-review fix's "user-scoped scope declaration is the approval signal" framing maps
  cleanly onto provenance state — deferred review *is* a provenance source with a defined scope.
- Bundling signals + commit-interlock release would both read provenance rather than reconstruct it.
- Cross-machine resume via plan-coord-probe gets a clean handoff property (provenance can be
  explicitly null at handoff; next session starts fresh, no inheritance ambiguity).

Not adopted; flagged for PRD-time evaluation. Bigger structural change than the commit-increment
reshape on its own — could ship independently as a separate WU or fold in if scope fits. Origin:
2026-05-16 mid-WOR session, surfaced during interlock-prompt-shape audit.

**Assumptions to validate during PRD:**

- The signal set (file overlap, sibling subtasks, explicit marker hint) covers the common
  bundling cases without false-positive noise. If beta usage shows signals firing too often or
  missing obvious bundling cases, calibration is needed.
- Leaf-default commit boundaries are handoff-clean *in practice* under plan-coord-probe — i.e.,
  the next machine's session-init can resume cleanly when the previous session committed at a
  leaf and pushed. Validate against plan-coord-probe's session-init contract once that lands.
- The interlock-validation library shape from [plan-interlock-release-wrappers][plan-irw] reads
  commit-increment state cleanly without adapter friction. If the wrapper's interlock-state
  contract grows a "bundling-in-flight" axis, that's the wrapper's concern, not this plan's.
- Existing `commit_interlock: on-task-approval` users do not experience the deferred-review
  change as a regression. The change *enables* a previously-blocked use case (atomic commits
  during batched execution); it shouldn't remove any prior functionality.
- The method's `.override` mechanic is sufficient for projects wanting alternative bundling
  semantics. If the override surface needs to be richer than today's inline-content pattern
  (e.g., signal-set customization), the override-mechanic extension proposed in
  `plan-review-method-family.md` (workflow-pointer variant) may be the right composition
  point.

## Scope Estimate

**Small standalone WU.** Methodology-internal change; surface ripples across several files but
each ripple is small. Not atomic because the design decisions warrant a plan doc and PRD.

### File-level scope

- New `system/methods/commit-increment.md` (or chosen name). Both copies (package source +
  project instance) per package-project-sync discipline.
- Update `reference/strategies/arc/strategy-task-list-formatting.md` — reference the new method
  for design-time atomicity consultation.
- Update `system/workflows/arc/3_process-task-loop.md` — bundling check integration at task
  completion; deferred-review rule revision (commits release at leaves; bundling signals still
  fire).
- Update `system/rules/DEV-RULES.ARC.md` — § Task Execution (review increment +
  commit increment vocabulary, deferred-review behavior under each interlock mode) and
  § Commit Discipline (atomicity rule references the new method).
- Update `reference/briefs/AGENT-BRIEF.ARC.md` — vocabulary section adds commit increment;
  deferred-review summary updated.
- Optional: update `arc-task-audit` skill and `2_generate-tasks.md` workflow to consult the
  method for design-time atomicity awareness. May be deferred to a follow-up if the runtime
  signal-triggered shape proves sufficient without design-time hooks.

### Dependencies

- **No upstream blocker.** Concept is independent of in-flight work. Can land any time.
- **Soft sequencing preference.** Land before [plan-interlock-release-wrappers][plan-irw] —
  the wrapper's interlock-validation library is cleaner if the commit-increment vocabulary is
  established. Not strict.
- **Soft sequencing preference.** Land before `plan-coord-probe.md` —
  cross-machine resume contract benefits from the handoff-clean leaf-default being
  established methodology, not retrofit.

### Provenance

Surfaced during exploratory discussion at session-init for the in-flight `user-sync-ux` WU.
The deferred-review-with-overlapping-files atomicity case prompted the original concern; the
orthogonal-axes reframing emerged during collaborative model-shaping; the leaf-default
crystallized after recognizing the handoff coherence constraint that ruled out hierarchy-as-
bundling. Captured as plan doc directly (no inbox graduation step) given the design density of
the conversation.

---

[plan-irw]: ../../../../reference/strategies/arc/strategy-interlock-release-wrappers.md
