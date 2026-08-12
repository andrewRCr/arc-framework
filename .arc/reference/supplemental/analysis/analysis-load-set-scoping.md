# Analysis: Load-Set Scoping by Lifecycle Position

## Purpose

Maps what is and is not recoverable from ARC's context load set by scoping it to the session's lifecycle
position, and what the load-set comparator permits any such scoping to do. Produced by a planning
investigation (2026-07-23/24) that examined whether post-compaction recovery could read less by keying the
manifest to where the session actually is.

The investigation retired without shipping a mechanism. Its measurements answered the question negatively
enough to be worth recording: **four of the five universal entries do not vary by lifecycle position, and the
fifth varies on grounds that cannot currently be measured.** That result, and the source-grounded constraints
established along the way, are reference material for `loadset-composition`, `composable-workflows`, and any
future work touching `resolveLoadSetManifest` or the recovery read.

Findings here were verified against source and survived two fresh-context adversarial passes. Where the
investigation's own earlier reasoning proved wrong, this document records the correction rather than the
original claim — several plausible-sounding arguments in that space are false, and re-deriving them costs a
session each.

## How to Use

- Deciding whether a document earns always-loaded status → § The demotion precondition, § Per-position
  candidate audit.
- Changing anything the load-set comparator inspects → § Comparator constraints. These are hard.
- Planning workflow fragmentation or range-addressing → § Why workflow range-addressing needs an authoring
  contract.
- Touching the recovery read path → § Recovery is a second consumer, and it is not init.

## The three axes

A `LoadSetEntry` is `{path, readMode}` — two fields answering two questions. Naming a third makes the
decomposition explicit, and the three have different owners:

| Axis            | Question                            | Status                                                  |
| --------------- | ----------------------------------- | ------------------------------------------------------- |
| **membership**  | which paths appear at all           | the projection today; `loadset-composition` owns policy |
| **disposition** | is this read, or merely known about | investigated and not built — this document              |
| **depth**       | how much of the path is read        | open — `composable-workflows`                           |

Disposition's orthogonality is solid: whether an entry is read at all is independent of any document's
internal structure. Depth's is not. If workflows become bounded fragments with explicit gates, reading from a
position forward collapses toward _reading the applicable fragment_, which is membership, not depth. Whether a
residual depth axis survives fragmentation is an open empirical question.

## Per-position candidate audit

The universal set is **1,837 measured words**: `AGENT-BRIEF.ARC` 827, `STRATEGY-INDEX` 614,
`AGENT-BRIEF.PROJECT` 219, `QUICK-REFERENCE` § Environment 177. Undemotable by mass: `DEV-RULES.ARC` 4,243,
`WORKING-MEMORY` 3,209, `DEV-RULES.PROJECT` 1,749, meta plus `SESSION-NOTES` ~1,400.

Audited per position against the precondition below:

| Entry                   | planning | execution | integration | errand | Basis                                 |
| ----------------------- | -------- | --------- | ----------- | ------ | ------------------------------------- |
| `AGENT-BRIEF.ARC`       | load     | load      | load        | load   | no trigger; 52% constraint            |
| `QUICK-REFERENCE` § Env | load     | load      | load        | load   | no trigger; environmental             |
| cohort doc              | load     | load      | load        | n/a    | no trigger; coordination = constraint |
| `AGENT-BRIEF.PROJECT`   | load     | contested | unbased     | n/a    | partial redundancy; see below         |
| `STRATEGY-INDEX`        | load     | demotable | demotable   | n/a    | reachable, yield unmeasured           |

**The briefs have no trigger anywhere, and cannot honestly be given one.** A search of `.arc/system/**` and
`.arc/reference/strategies/**` found no "when X, load AGENT-BRIEF" — every hit is a subagent orientation
block, a file registry, one-time setup, brief-authoring instructions, another load set, or an
audience-classification list. The only well-formed trigger for orientation content is recognition-shaped
("when you meet an unfamiliar term, load the brief"), which requires the agent to notice it does not know
something. That is implicit awareness in a trigger costume.

**`AGENT-BRIEF.ARC` is 52% constraint.** Vocabulary is 432 of 827 words, and `strategy-procedure-evolution`
Principle 7 names the briefs' vocabulary as the single definitional home for load-bearing terms. Those terms
are dense in exactly what recovery loads — 109 occurrences across `integrate-work-unit`, `process-task-loop`,
and `DEV-RULES.ARC` alone (`interlock` 48, `Errand` 22, `Class` 19, `atomic` 16, `review increment` 4).
Misreading them changes behavior at gates. Disposition is binary per entry, so the correct answer — keep
Vocabulary, drop the rest — is a partial read, i.e. the depth axis. **The largest single candidate is a
content-placement problem, not a disposition one:** the definitional core wants to be its own addressable
unit.

**The cohort doc is constraint, not orientation.** No trigger exists in anything loaded at execution —
`process-task-loop` and `DEV-RULES.PROJECT` reference cohorts zero times, and `QUICK-REFERENCE`'s only two
mentions sit outside the loaded § Environment slice. `AGENT-BRIEF.ARC`'s always-loaded Vocabulary states that
session-init resolves and reads the cohort doc, which a demotion would falsify. Session-init describes its
content as the cross-member sequencing the work must respect. It is also the only candidate whose size is
unbounded and unmeasured.

**`AGENT-BRIEF.PROJECT`'s redundancy is partial, and its carrier is contested.** Its operational content —
repo root, the hybrid `.arc/` + `packages/` layout, the CLI package location, the quality-gate commands — was
duplicated by `QUICK-REFERENCE` § Environment and `DEV-RULES.PROJECT` § Quality Gates when this was measured.

**The gate-command leg no longer holds** (updated 2026-07-29). `judgment-authority-model` demoted that listing out
of `DEV-RULES.PROJECT` into `QUICK-REFERENCE` § Quality Gate Commands, which is **on-demand** — the always-loaded
slice of that file is § Environment & Path Context alone. What stays loaded is the zero-tolerance rule, the two
selection conditions, and four quiet-failing gate behaviors; the enumeration of gate families and their commands is
gone from the loaded set. So the brief's gate content is no longer redundant against anything always-loaded, and
that leg of its demotion basis must be re-derived rather than inherited. The episode is also a worked instance of
this section's own closing instruction: a redundancy basis names a carrier, and carriers move.

Two gaps stand unchanged: the "Development Environment: Cross-platform (Windows/WSL/Linux/Mac)" line appears
nowhere else in the loaded set, and is operational at execution in a CLI that branches on `posix`/`win32`; and
`loadset-composition` proposes demoting `QUICK-REFERENCE`'s environment residual, which is the carrier the
surviving half of this redundancy claims. **The two demotions are mutually exclusive**, now for a narrower reason:
§ Environment is the only always-loaded carrier of the repo-root rule and the hybrid-layout note. Whichever lands
second must re-derive its basis against what actually remains loaded.

**`STRATEGY-INDEX` is reachable but of unmeasured value.** Its trigger — `DEV-RULES.ARC` § Consult strategy
guidance — is always loaded and names the index directly, so a demotion is safe. What is not established is
whether it saves anything. The trigger reads "Before **implementing** work in codified domains," and execution
is exactly that condition, so the read may relocate to the trigger rather than disappear. Measuring this
requires an instrument for judgment-layer adherence that does not exist; `workflow-eval-harness` owns it.

### Unsafe and pointless are different verdicts

A demotion fails for two distinguishable reasons, and collapsing them causes wrong calls:

- **Unsafe** — no trigger exists, or the entry is a constraint. Never demote.
- **Pointless** — the demotion is safe, but the trigger fires about as often as the load would have, so it
  relocates the read rather than removing it. Fixable by scoping the trigger, or by evaluating the position
  where it stops over-firing.

`STRATEGY-INDEX` is the second, not the first. Its defect is an over-firing trigger, which is a property of the
position, not of the entry.

The worked precedent is commit `63d31c796` (2026-07-23), which fixed two instances: it dropped
`process-task-loop`'s per-task Tier-boundaries pointer and rescoped both the quality-gates and
testing-methodology index triggers to the residual question their operational methods do not answer.
**The generalizable rule: where a lean operational surface covers the common case, the deeper surface's
trigger must name the _residual_ question, not the domain.** Both surfaces there named the domain, so they
fired on the 95% the method already served.

## The demotion precondition

A demotion from read-it to know-about-it is safe at position P when **either**:

- **(a) Reachability.** A correctly-scoped trigger for the entry lives in a document that is itself loaded at
  P. Existence is CLI-checkable; correct _scoping_ is an authoring judgment no check can make.
- **(b) Never-needed.** The agent never needs to follow the pointer at P. Two sub-cases, unequal in strength:
    - **Redundancy** — the entry's load-bearing content at P is duplicated by an undemotable entry already
      loaded at P. Verifiable by comparing two documents. Strong.
    - **Irrelevance** — the position's work does not touch the entry at all.

**Clause (b) is what makes orientation content demotable at all** — orientation has no natural fire point, so
it can never satisfy (a).

**A defect to resolve before relying on this.** Irrelevance was drafted as requiring two independent signals:
the position's own workflow does not reference the entry, _and_ the entry's trigger condition excludes the
position. But a trigger-less entry has no trigger condition, so the second signal is unproducible for exactly
the class clause (b) exists to serve. As authored the rule is either vacuous (one signal suffices whenever no
trigger exists, which is every orientation doc) or blocking (no orientation entry can clear it). Anyone
adopting this precondition must settle whether absence-of-trigger satisfies the second signal vacuously, or
replace the two-signal rule with something else.

**Demotion lands in a measured adherence band, and recovery is the worst place to measure.**
`loadset-composition` records: always-present ~100%, explicit trigger 85–95%, indexed / implicit awareness
60–75%, search discovery 20–40%. Mere awareness that an artifact exists _is_ the 60–75% band. Those bands were
measured in ordinary sessions; `recovery-hardening` documents that post-compaction recovery is precisely where
adherence degrades, and `loadset-composition` notes deviation concentrates in loop-style workflows.

## Comparator constraints

Established from `load-set/audit.ts` and `load-set/types.ts`. The comparator inspects `entry.path` (via
`groupByPath`), `readMode.kind` (plus `heading` for `partial-section`, via `readModeEqual`), positional path
substitution (`resolvePathDrifts`), and `manifestVersion` — and nothing else on the entry. `diverged` is set by
any of `manifestVersion | added | removed | readModeChanges | pathDrifts`, and any `diverged` verdict produces
a `load-set-drift` stop.

1. **A scoping marker must never be a `ReadMode` kind.** `readModeEqual` is compared, so expressing
   "known about but not read" as a read mode makes any position change between seed and fresh manifest emit
   `readModeChanges` → `load-set-drift` → stop.
2. **Position must stay out of the read mode.** The shipped precedent: `partial-strategic` varies its slice
   freely because the slice is not in the mode — it is resolved separately from `taskCursor`. Any
   position-sensitive read mode should be a bare `{kind}` with its anchor on its own report surface.
3. **`manifestVersion` is `z.literal(1)` and a mismatch alone sets `diverged`.** A version bump means every
   pre-upgrade seed diverges against every post-upgrade manifest — a guaranteed `load-set-drift` stop on the
   first compaction after upgrade. An optional added field needs no bump; prefer staying additive at v1.
4. **Schema-pair compat.** `LoadSetEntrySchema` is `strictObject` (rejects unknown keys) while
   `LoadSetEntryReaderSchema` is `object` (strips them). Both derive from the shared `LOAD_SET_ENTRY_SHAPE`, so
   a field added to that shape reaches the reader by construction; a field added outside it vanishes silently
   on the read path.

**A false constraint, recorded because it is tempting.** The investigation initially held that scoping by
_omitting_ entries would fire `membership.added`/`.removed` on every position change between seed emission and
audit, making a marker field necessary to preserve the drift invariant. **This is wrong.** The seed is written
by the PreCompact hook (`pre-compact-seed.mjs` runs `arc status --session-init --write-compaction-seed`), so
the window between seed emission and audit _is the compaction event_ — no agent work occurs, and no lifecycle
position advances. With position unchanged the two manifests are identical under omission too; with position
changed, the stop already fires from the lifecycle-workflow membership delta, since the projection pushes a
different workflow entry per position. Omission never adds a stop that a marker field avoids.

The real reason to prefer a marker over omission is domain, not drift: **omission is a membership change, and
membership is `loadset-composition`'s axis.**

## Recovery is a second consumer, and it is not init

`session-init` and `session-recover` both consume the projected manifest, but they are not parity-identical,
and a coordination note in `loadset-composition` currently asserts they are ("recovery and init stay
parity-identical … one policy, two consumers"). Three differences, all verified:

- **Init does not consume the manifest programmatically.** `session-init.md` Step 3 is a hand-written
  enumeration of items 1–11. Changing the projection changes recovery's read and nothing about init's.
  `session-recover.md` does loop the manifest — it loads `report.recover.loadSet.value.entries` as its context
  plan.
- **Init already carries its own read policy in prose.** Its errand-resume arm loads universal context only,
  skipping the active meta, `SESSION-NOTES`, the task list, and the lifecycle workflow. So init/recover read
  parity was already untrue before any scoping change.
- **A transient position is CLI-representable in one envelope and not the other** (post-`session-locus-model`;
  verified on that branch). A transient's governing workflow — `run-errand`, `draft-design`, `drain-inbox` — is
  appended or dispatched, never projected from a session type. `LoadSetSessionType` stays
  `"planning" | "execution" | "integration"`: WU-scoped by design, and the projection needs no transient
  position. In the **recover** envelope the transient is fully CLI-representable — `recoveryFrame` carries
  `kind: "resolved"` plus `workflow`, and `appendRecoveryWorkflow` puts the workflow file into the emitted
  manifest. In the **session-init** envelope it is not: `loadSet` is projected purely from the active-meta
  probe, with no locus-row contribution and no `appendRecoveryWorkflow` equivalent, and transient rows carry
  `derived: null` structurally — a subject meta is projected only for `role.kind === "work-unit"`, the
  partial-transient branch sets `meta: null`, and `derived` is nulled whenever meta is absent. At init the
  transient is identified by the row's `role.kind`, and its owning workflow is selected agent-side by the
  Transient-resume dispatch table.

    **Consequence for a disposition-style policy.** Knowing the position and being able to _key policy on it_
    are different. `appendRecoveryWorkflow` wraps the manifest after `resolveLoadSetManifest` has already run,
    so a policy living inside the projection still sees `sessionType: null` for a parentless transient. Keying
    disposition on transient-ness would require threading it into the projection or applying policy after the
    append — a design choice, not a blocker, but not free either.

**What follows for a position-scoped policy:** the safety claim differs by consumer. At recovery a demotion
says _you read this at init; do not re-read it now_. At init the same demotion says _this session never reads
this at all_. The second is strictly stronger and needs its own basis. A design that lands disposition at
recovery only, then has init become a manifest consumer later, silently upgrades the claim —
`composable-workflows` records the `session-init` Step 3 rewire (replacing the inline enumeration with a loop
over `loadSet` entries) as its own first-consumer deliverable, which is exactly when that happens.

**The governing constraint on any such design.** `recovery-hardening` records that Claude-family models
routinely rationalize past recovery, and that the failure is dispositional — a concrete task plus a rich
summary create a feeling of sufficiency. A design whose thesis is _read less at recovery_ must therefore keep
every scoping decision CLI-computed and carried in the manifest; if the agent decides what to skip, the
rationalizer gets exactly the lever `recovery-hardening` exists to remove. Note that this constraint is
satisfied at the decision point and still leaks through execution: a demoted entry relocates the judgment to
"do I load this later," which remains agent-executed. That residual is ordinary trigger adherence, which the
bands above measure.

## Why workflow range-addressing needs an authoring contract

A grounding pass read `integrate-work-unit.md` (521 lines / 4,068 words) and `process-task-loop.md` (315 /
2,532) against a proposed "read from the resumed position forward" mechanism. Four findings:

1. **Phase 2 back-references Phase 1.** `integrate-work-unit` § 13 — the highest-value resume position —
   carries "Repeat the **Step 3** push extension contract," "the resume path's **PR-merged arm (Step 1)**
   enters here," and "On re-entry, resume the first incomplete candidate-tail step." A read-forward from Step
   13 truncates Step 3's extension contract outright. Not a degradation — a missing procedure.
2. **The re-entry guard is mandatory for every resume, and buried.** Lines 89–131 are a hand-written re-entry
   guard: a resolver-state → "Resume at Step N" table, the fact that tail steps are individually re-runnable,
   and the warning that a merged PR proves only that the merge ran, not that composition ran. Exactly what a
   Phase-2 resume most needs, filed under Phase 1 Step 1. It is also a **second position oracle** — prose,
   agent-resolved, keyed on `gh pr view` plus resolver state — whose four rows do not align 1:1 with
   `workUnitState`'s five sub-state values. Any CLI-side position mapping must reconcile them or inherit a
   disagreement.
3. **The cheap structural rule fails.** "Everything above the first phase heading" is lines 21–41 — 148 words
   of purpose, when-to-use, phase framing, and the isolation invariant. It misses findings 1 and 2 entirely.
   `partial-strategic` does not transfer: a task list's header genuinely is its whole preamble; a workflow's is
   not. The rule that would survive is a per-position **always-read set** plus a point-scanner check that scans
   the read-forward span for backward references and fails when a target is absent from that row's set. Sound,
   and pure retrofit — an analyzer built to recover structure the source could simply have declared.
4. **`process-task-loop` has no positional structure at all.** Its first heading sits at line 17 — zero
   structural preamble — and the document is not positionally ordered: one resident loop followed by
   cross-cutting appendices (`Crash Recovery`, `Incidental Work Management`, `Task List Maintenance`) that a
   read-forward would sweep in by position while they carry nothing positional. The depth axis does not apply
   to it, which narrows any depth deliverable to a single workflow.

**The measurement.** With the always-read floor of 708 words (header 148 + guard 560), plus Step 3's push
contract (406) wherever the backward-reference closure pulls it in:

| Resume position         | Read-forward | + always-read | Total read | Saved           |
| ----------------------- | ------------ | ------------- | ---------- | --------------- |
| `awaiting-review`       | 2,598        | 1,114         | 3,712      | 9% (~480 tok)   |
| `mergeable`             | 2,392        | 1,114         | 3,506      | 14% (~760 tok)  |
| `merged-needs-archival` | 1,535        | 1,114         | 2,649      | 35% (~1.9k tok) |

`awaiting-review` is the position the originating field report sat at — the lowest-yield row.

**Two corrections worth keeping.** Read-forward does _not_ "degrade to the status quo" for a Phase-2 resume:
today the whole file is read, so the guard and the Step 3 contract are seen; read-forward degrades to
status-quo-minus-the-entry-dispatch-and-any-back-referenced-step. And "opening a PR skips Phase 2 (~57%)" is
unreachable under read-forward-to-EOF — you can only skip what is above the position.

**The conclusion, which bears on `composable-workflows`' granularity question.** That WU frames per-arm files
versus anchored sections loaded by range as alternatives. This evidence points against range addressing:
making it safe on a monolith requires the always-read table plus the backward-reference checker, machinery
whose only job is recovering structure the source never declared — most of the way to conceding the document
should have been fragmented. A fragment's signature/gate/body contract turns a back-reference into an explicit
import rather than invisible truncation, and gives the re-entry dispatch a home that is not "Phase 1, Step 1."

Note also that any runtime addressing adds a requirement cross-file citation does not imply: an anchor must
delimit a **span** (this anchor to the next), not merely mark a point.

**The precedent that gets miscited.** `partial-strategic` is cited as proof that range-slicing a monolith
works. Task lists are governed by `strategy-task-list-formatting.md`, `template-tasks.md`, and a pre-save
checklist — that family _was_ constructed to a structural contract, and range addressing works on it because
of that. The shipped precedent is not "ranges work on monoliths"; it is "ranges work when the family was built
for them." Workflow authoring governs frontmatter and prose economy, not addressable structure.

## Related measured surfaces

**Declared-method eager loading is corpus-wide.** `create-spec` pulls 8,036 words of method against a
2,659-word body; `draft-design` 7,486 against 2,197; the methods corpus is 17,121 words across 25 files.
Correcting it means converting a frontmatter declaration from a preload list into validated fire-site triggers
— the `point-scanner.ts` CHECK 16 extension-marker precedent is the mechanism.

**`DEV-RULES` is not worth structuring around lifecycle position.** Of 4,243 words, § Task Execution's
execution-only portion (653 total), § Scaled Process (119), and part of § Documentation Boundaries (549) are
position-bound — call it 20–25%. Three things rule it out: the content is interleaved rather than sectioned
(§ Task Execution mixes execution rules with a planning rule and two universal ones); it is constraint-dense,
and demoting a constraint asserts "this does not apply at this position," a far stronger claim than "this
reference is not needed here"; and the boundary is already settled elsewhere — `rules-restructure` owns a
domain-rules variant for conditional-load rules, with `DEV-RULES` as the canonical universal set. That
mechanism is built and entirely unused: session-init resolves `DEV-RULES.{DOMAIN}.md` files via the probe's
`domainRules` slot and loads them on demand, and zero such files exist. **A rule that proves
position-conditional is evidence it should move to a domain-rules file — a content-placement call — not
evidence that `DEV-RULES` needs a position axis.**

**`workUnitState` sub-state degrades monotonically and fails safe.** From `in-flight-work-unit-sweep.ts` and
`work-unit-state.ts`: the presence tier is network-free and leaves every live-PR fact `false`, so the
classifier's precedence (`merged` → `merged-needs-archival`; failing open PR → `blocked`; approved-and-green →
`mergeable`; else `awaiting-review`) classifies every WU as `awaiting-review` until sharpening upgrades it. A
rejecting PR source returns the original facts plus a soft warning; it never fabricates a later state. Since
`awaiting-review` is the earliest state in the tail, a degraded read makes the session look earlier in the
lifecycle than it is, and earlier means more remains ahead — so degradation yields a **larger** load set, never
a smaller one. Two constraints for anyone keying on it: `stale` is an age overlay on `awaiting-review` and maps
to the same disposition, and `behindBase` is an advisory qualifier rather than a state, so policy must never
key on it.

## Why no mechanism shipped

The investigation reached a settled design — a `disposition` field on `LoadSetEntry`, resolved from lifecycle
position, consumed by `session-recover` — and retired it rather than formalizing it. The reasoning, recorded
so it is not re-derived:

- **The policy table is four-fifths `load`.** Every candidate examined turned out undemotable (constraint,
  or trigger-less orientation) or unmeasurable. What survived was one entry at two positions, on grounds whose
  value cannot currently be measured.
- **The measurement that would settle it does not exist.** Whether `DEV-RULES.ARC` § Consult strategy guidance
  over-fires at execution is the central open question, and answering it needs a judgment-layer adherence
  instrument that `workflow-eval-harness` has not shipped.
- **The dependency runs the wrong way.** `loadset-composition` owns the always-loaded question and is actively
  re-deciding it. Landing a position-scoped mechanism first would have handed that WU a field shaped by a
  precondition analysis authored before its own verdict — and one of the demotions is mutually exclusive with a
  demotion it already proposes.

The framing that survives, and may still be right later: the value of a position axis is the **axis**, not any
position's tally. Today the universal entries do not vary by position at all, so every position that gains a
correct disposition recovers from a baseline of zero. That argument is available to whoever revisits this —
but it should be made on its own terms, not on a yield figure.

---
