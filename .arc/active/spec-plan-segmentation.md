# Spec (`detailed` · `RFC`): plan-segmentation

- **Origin:** [internal]

- **Purpose:** Give task planning a decidable way to order a work unit's plan so implementation yields exercisable
  end-to-end capability as it lands, and a discriminator for when that ordering is the wrong choice — closing the
  feedback gap between spec-time design settlement and terminal verification.

---

## Introduction / Context

ARC is spec-directed: design is settled up front and implementation realizes it. That holds, and this design does
not weaken it. It leaves one class of error uncaught for the entire length of a work unit.

Four things can be wrong, and three of them already have a catcher. The **world** not matching assumptions is caught
by a pre-spec spike. The **implementation** not matching the design is caught by the per-leaf task interlock. The
**assembled whole** not satisfying intent is caught by work-unit verification, terminally. But a **design that is
internally wrong, or whose parts do not compose**, is caught by nothing. Every input can validate and every leaf can
be faithfully implemented, and the assembled result can still be the wrong thing — surfacing at verification, at
review, or after integration, when re-steering costs the most. Composition cannot be tested before there are parts to
compose, so no amount of planning rigor closes it.

Task generation already gestures at the remedy without directing it. Its phase-design guidance carries _"Order phases
to minimize dependencies and enable incremental delivery"_ and _"Each phase should produce testable, verifiable
progress"_ — but with no discriminator, no named alternative, and no exit criterion, so the guidance is aspirational
rather than decidable. The adjacent rule in the same procedure, _"group test and implementation together by module or
concern"_, is a horizontal instinct with mechanical teeth. In practice the layered plan wins.

The failure is on the record at pattern level, not as an isolated case. `review-architecture` planned as 8 phases and
~111 leaf tasks, reached integration at 307 files, and surfaced its design problems at review. The same shape —
solid spec, verification finding implementation gaps sourced to task-list coverage — recurred across the recent
execution era. Its sharpest instance decomposed a phase horizontally across refresh planning, suffix proof, top
absorption, native routing, recovery, handlers, and workflow prose: every primitive and local contract tested green,
yet no task owned the complete external-refresh adoption or the typed native-fallback transition, and those gaps
survived repeated adversarial passes. Two shapes recur — **unwired production callers** (modules built but
unreachable) and **surface-level statement without the next-layer-deep realization** a detailed spec normally
supplies.

This work unit is therefore evidence-motivated rather than capability-motivated. `decomposition-doctrine` owns the
sizing half of that postmortem — whether the work should have been several work units. This design owns the
orthogonal half: given the work unit it is, in what order should its plan land so that being wrong is discovered
early and cheaply.

## Goals

- A plan boundary can close on **demonstrable end-to-end capability** rather than a completed layer, and states which
  it closes on.
- The choice between vertical and layered ordering is **decidable from stated evidence**, not left to instinct — and
  the doctrine reads as a genuine three-way choice, never a bias toward vertical.
- A composition-risk plan's coverage of the spec's mandatory lifecycle behavior is **checkable at authoring time**,
  so a plan that builds modules without wiring their production callsites is rejected before execution starts.
- The segmentation contract's structural half is **read by machinery, not by a checklist** — the staged gate that
  already certifies every task list, and the delivery inventory that already types verification tasks — while its
  judgment half stays a checklist obligation.
- The task-generation procedure's live rules stop **contradicting** the doctrine — specifically test grouping.
- The typed delivery model **expresses** the verification family the doctrine names, rather than admitting one of
  its members by accident.

## Non-Goals

_Frozen at activation; changes after that append: `Amended YYYY-MM-DD — <delta> — <prompt>`_

- **The concern → work-unit cut.** `decomposition-doctrine` owns whether a concern should be several work units; the
  residual-risk axis is offered to it as input, claiming no authority over that test.
- **The chunk → base landability boundary.** The shipped delivery model owns review and merge topology. This design
  contributes segment boundaries as an input to delivery authoring.
- **The segment ↔ chunk refinement invariant.** Whether chunk boundaries must refine segment boundaries touches the
  delivery record. The shipped delivery work deferred member resegmentation to `review-orchestration-right-sizing`;
  the call stays there.
- **A typed segmentation record.** No new artifact, schema, plan record, or persisted segment identity. Segments are
  recorded in task-list prose and identified by the phases they span. The segmentation scan (D6) is a read over that
  prose, not a record.
- **Mechanizing the judgment obligations.** Lifecycle-row coverage (D7) and stub identification (D8) require reading
  the spec and the code; they stay Finalize checklist entries evaluated by the authoring session. Only the
  structural half of the contract is scanned (D9).
- **Growth of the delivery model beyond scope closure and segment production.** The delivery model already types
  verification by scope. This design closes the scope set and produces the `segment` member; it does not add
  segment identity to the delivery schema, make delivery plans segment-aware, or alter member partitioning.
- **Where a failed exit criterion's corrective work lands.** The verifier is defined as an evidence sink (D5);
  the corrective loop's shape is `plan-amendment`'s, and the evidence this design routes to it is recorded there.
- **Enforcing earliness mechanically.** Ordering to retire dominant residual risk earliest is the discriminator's
  stated doctrine and an eval concern; nothing checks earliness.
- **The `docs/` task-list reference.** Single-copy and frozen pending its own overhaul.

## Proposed Design

### D1 — Segment as the unit; mode attaches to the segment

A task plan is an **ordered sequence of segments**. A segment is a contiguous run of the plan — one phase or several
— that closes on one stated kind of progress. A **mode** names which kind.

Modes attach to segments, never to work units. A plan that builds substrate and then slices over it is expressible
directly instead of being forced into a whole-work-unit label, so **mixed plans are the general case and single-mode
plans the degenerate one**. The doctrine therefore never reads as binary.

Segments carry **no identifiers**. Phases identify them: a multi-phase segment declares its span in its opening
phase, the criterion lands on its closing phase, and a stub's retiring owner names a phase. This adds zero
enumeration beside the phases, task numbers, and delivery members a task list already carries.

### D2 — The discriminator: locus of residual risk after planning closes

| Residual risk lies in                                           | Mode              | The segment closes on                              |
| --------------------------------------------------------------- | ----------------- | -------------------------------------------------- |
| **Composition** — do the parts assemble into intended behavior? | **`slice`**       | a thin end-to-end capability that can be exercised |
| **Substrate contract** — is the shared thing underneath right?  | **`layer`**       | a complete, settled layer                          |
| **Mechanics at scale** — does this transformation work N times? | **`replication`** | the enumerated surface exhausted, batch-verified   |

Modes are named by **what the boundary closes on**. `vertical` and `horizontal` remain descriptive adjectives in
prose — a `slice` segment is the vertical mode — and are not the recorded vocabulary. Stack-adjacent names are
excluded: three distinct "stack" senses already live in the corpus.

**`pilot-then-replicate` is a composition, not a fourth mode.** The mechanics-at-scale row is answered by a thin
pilot segment — mode `slice`, closing on one proven instance, where the slice definition still holds and only the
risk being retired differs — followed by a `replication` segment. Risk loci and modes both number three but are not
forced 1:1. This preserves one-boundary-one-criterion rather than admitting a mode with an interior checkpoint.

**The axis is deliberately not design determinacy.** A fully determinate design can carry high mechanical risk — a
settled migration applied across a large surface — and determinacy would push exactly that case toward layered
ordering when a pilot is plainly correct. Residual-risk locus resolves all three loci without special-casing.

### D3 — `resolve-plan-segmentation`, a procedure inlined at the existing entry read

The discriminator lands **inline in the task-generation workflow**, as a named procedure at the stage's existing
scale-axis read, beside the `resolve-planning-depth` and `classify-work-unit` calls that read already drives.
Segmentation asks a different question of the same evidence, making it a **third output of one read**. No second
entry read is introduced, and the stage keeps re-deriving rather than inheriting — the same feed-forward immunity
that governs planning depth.

**Authored method-shaped, placed inline.** The procedure carries a signature line —
`resolve-plan-segmentation(scale-axis read, spec lifecycle statements) → ordered segments with modes; ordering
doctrine` — with named inputs and a stated outcome, so it lifts into a method with no rewording. It is not minted
as a method now: it has one consumer, and the knowledge-evolution discipline extracts shared guidance on fan-in,
not before. The private-method cell that `composable-workflows` designs for single-owner procedures is the shape it
lifts into, at that work unit's cut of the task-generation workflow into a procedure library — or earlier, if
`plan-amendment` fires it to re-segment a revision phase. Either event is the extraction trigger; the content does
not change.

Its trigger is anchored to the **operation** (authoring phase structure and exit criteria) rather than to the
workflow, so ad-hoc invocation is covered and no new always-loaded surface appears.

**The read is universal, not `Class`-scaled.** As a third output of an existing read, a `Class` gate would save
nothing, and a `Light` work unit's read returns one segment with an evident mode. The read is always recorded
(D4); a single-segment plan is the contract's simplest case, not an exemption from it.

**Ordering doctrine, carried by the procedure:** order segments to retire the dominant residual risk earliest — the
first `slice` lands as early as the substrate allows. Nothing enforces this; it is doctrine plus eval coverage.

### D4 — The recorded surface: two phase-preamble lines

Segmentation is recorded on the task-list surface the stage already authors, never carried as stage state.

- The segment's **opening phase** carries `_Mode:_`, with its span when the segment is multi-phase.
- The segment's **closing phase** carries `_Exit criterion:_`.
- A single-phase segment carries both.

**Preamble position.** The landed preamble order is any `**Delivery member:**` pointer, then the required
`_Purpose:_`, then the optional `_Design decisions:_` block. The two new lines sit **between `_Purpose:_` and
`_Design decisions:_`**, `_Mode:_` first — the structural claims about the boundary stay together and ahead of
rationale prose. `_Purpose:_` remains mandatory beside them.

**Line grammar.** `_Mode:_` carries the mode token backticked immediately after the label, an optional span
`through Phase N` when the segment is multi-phase, and the standard gloss (its closes-on kind from D2's table) after
an em dash: `` _Mode:_ `slice` through Phase 3 — closes on exercisable end-to-end capability. `` The token set is
closed (`slice` / `layer` / `replication`) so the scan (D6) parses it; the gloss is prose and is not parsed.
`_Exit criterion:_` carries the specific criterion as prose.

Both are preamble prose inside the existing task-list grammar. Two cases are distinct:

- An **unsegmented** list — no `_Mode:_` line and no segment-suffixed task anywhere — is one authored before the
  contract. It is not subject to it (D6's scan is presence-triggered), which is what keeps every existing task list
  valid.
- A **single-segment** plan authored under the contract records `_Mode:_` and `_Exit criterion:_` like any other
  (on its one opening and closing phase), and owes no separate segment verifier: the terminal task subsumes it
  (D5). Recording the read is never optional once it has been made.

### D5 — The verification family and its marker

Verification is already distributed across two boundaries; segmentation adds a third and names the set. Two rows
are ordinary tasks marked by a **trailing role suffix**, the shape the shipped member verifier already uses and the
delivery inventory already matches; the third is the terminal phase itself:

| Boundary      | Form                                                         | Fired by                                         |
| ------------- | ------------------------------------------------------------ | ------------------------------------------------ |
| **segment**   | `{Closing title} — validate exit criterion at segment scope` | an ordinary closing task, gated by the interlock |
| **member**    | `{Closing title} — validate criteria at member scope`        | `validate-criteria` at member scope (shipped)    |
| **work unit** | the terminal `Verification` phase's single task              | the terminal verification workflow               |

A segment's exit criterion is proven at **execution time** by an ordinary closing task carrying the segment suffix.
The existing task interlock gates it with no new machinery. The suffix is exact and code-matched (D6), as the member
suffix is.

**Heading grammar.** The suffix sits **outside the bold**, after the title, as the terminal task's workflow pointer
already does — the bold is the actionable title per the formatting strategy's own rule, and the suffix is a role
annotation:

```markdown
### `[ ]` **X.Y {Closing title}** — validate exit criterion at segment scope
```

This is the shape the inventory matches (the regex tests the line's end) and every shipped member verifier uses; the
strategy's and template's member examples carry the suffix inside the bold, which the inventory does not match, and
are corrected in the same edit (D13).

**Position.** The segment verifier is the **last parent in the segment's closing phase that does not carry the
member suffix**, and is bound to that phase's `_Exit criterion:_` line by that position. Where no member boundary
coincides, it is simply the closing phase's last parent.

**The terminal task is untouched.** Its title carries the `verify-work-unit.md` workflow pointer, which is
load-bearing, and the inventory types it positionally, so no retitle is needed to bring it into the family. The
family is uniform where code reads it (the two suffix rows) and positional where code already is.

**`slice` and `replication` segments close with a segment verifier; `layer` segments need none** — a `layer`
criterion closes on settledness its own test tasks already prove, so a separate scenario task would be ceremony.
The scan requires the verifier for `slice` and `replication` and does not police a `layer` segment that carries one.

**The terminal verification phase is the family's work-unit member.** It carries no `_Mode:_` and no
`_Exit criterion:_`, and on a single-segment plan its task subsumes the segment verifier — the scan does not require
one when exactly one segment is declared. No segment verifier may land in the terminal phase (D12).

**A verifier is an evidence sink.** Its completion is the ordinary `_Outcome:_` — the scenario executed and its
result — never a criteria report, and it never hosts corrective work. The archived delivery task list is the
evidence: 187 revision subtasks accumulated under its verifiers because they were where gaps were detected, and
three verifier tasks came to hold most of the file while the implementation tasks whose behavior changed stayed
tidy and misdescribed the work. Where a failed exit criterion's correction lands is `plan-amendment`'s call; this
design routes that evidence to it and states only the sink property here.

**Exit criteria do not project into Success Criteria rows.** Success Criteria are already partitioned by delivery
member, bound by exact heading-path locus; a second partition over the same section would compete with it, or would
presume the refinement invariant this design explicitly does not own. Exit criteria rest on closing-task evidence —
precisely what member-scope criteria validation consumes. What _does_ project into Success Criteria is the lifecycle
coverage of D7, which is outcome-level and belongs there.

Where a member boundary coincides with a segment boundary, the **segment verifier precedes the member verifier as
an adjacent parent task, and the member close-out consumes its evidence.** The delivery coverage rules already
require the member verifier to be the final assignable task in its range, so this is the only legal order — and
the position rule above is stated so that the scan (D6) accepts exactly this shape.

### D6 — Segment scope in the delivery model, and the segmentation scan

The delivery task inventory already classifies every parent as `implementation` or `verification` with a scope,
keeps exactly one `work-unit`-scope verifier terminal and unassigned, and admits `member`-scope verifiers into the
contiguous exactly-once partition. Two gaps remain, and this design closes them:

- **The scope is open.** The schema accepts any non-empty scope string. Close it to `segment` / `member` /
  `work-unit`.
- **`segment` scope is never produced.** The inventory detects member scope by the trailing member suffix and
  work-unit scope by position; everything else types as `implementation`, so a segment verifier authored today is
  mistyped. Match the segment suffix beside the member suffix and produce `{ kind: "verification", scope: "segment" }`.
  Segment verifiers are member-assignable and partition exactly as member verifiers already do.

**The segmentation scan.** A pure module over the structural scanner's events — the scanner already emits every
preamble line as content between a phase event and its first parent — reads `_Mode:_`, `_Exit criterion:_`, and
`_Retired by:_` lines and returns the plan's segments plus diagnostics. It is **presence-triggered**: a task list
with no `_Mode:_` line and no segment-suffixed parent is unsegmented and produces no diagnostics; either presence
opts the list into the contract, so an undeclared segment verifier is refused rather than silently typed.
Diagnostics are precomposed and closed:

- `phase-outside-segment` — a phase belongs to no declared segment;
- `mode-unknown` / `span-invalid` — a `_Mode:_` token outside the closed set, or a span naming a missing or
  earlier phase;
- `segment-missing-exit-criterion` — a segment whose closing phase carries no `_Exit criterion:_`;
- `segment-verifier-missing` — a `slice` or `replication` segment whose closing phase's last non-member-suffixed
  parent does not carry the segment suffix (D5's position rule); not raised when the plan declares exactly one
  segment, whose verifier the terminal task subsumes;
- `segment-verifier-orphan` — a segment-suffixed parent anywhere other than that position;
- `segment-overlap` / `mode-duplicate` / `exit-criterion-orphan` — a phase inside a declared span carrying its
  own `_Mode:_`; a phase carrying more than one `_Mode:_` or `_Exit criterion:_` line; an `_Exit criterion:_` on a
  phase that closes no segment;
- `terminal-phase-segmented` — the terminal `Verification` phase carries `_Mode:_` or `_Exit criterion:_`;
- `segment-verifier-terminal` — a segment-suffixed task after the terminal heading;
- `retiring-phase-missing` — a `_Retired by:_` bullet naming a phase that does not exist.

**Fire sites.** The task-descriptor validator runs at two sites, and the scan registers at both as a sibling
validator: the **staged Markdown gate**, which certifies index bytes at pre-commit, and the **worktree descriptor
lint**, which `lint:md` composes and CI runs. Registering at one site only would let a host-side or unverified
commit pass CI with a broken segmentation, which is the false-green the two-site design exists to refuse. The scan
inherits the descriptor validator's **path selection** — task lists plus the canonical fixture, with archived
work excluded — so no completed list or spec prose is scanned, and a `_Mode:_` example inside the template's fenced
block cannot trigger it (the structural scanner skips fences). No new verb, no new hook, and no wall-clock cost
beyond a single-file scan. The module joins the staged gate's runtime-implementation path list. The task-generation
Finalize checklist runs the worktree lint before the interlock (D9).

The canonical plan digest is unaffected: role and scope already participate in it, and closing the scope set changes
no existing value.

### D7 — Lifecycle-row coverage for composition-risk plans

The vertical exit criterion has concrete content, not merely a form. On a **composition-risk plan** — one carrying
at least one `slice` segment — inventory each **mandatory lifecycle row the spec states**, and assign every row to
one `slice` segment or parent task that **wires its production callsite** and **proves it with an executable
scenario**.

The rows derive from the spec's own lifecycle statements. The motivating case's inventory — initial durable state
through caller and fresh authority, mutation boundary, reservation and crash-retry behavior, typed next action — is
a **worked exemplar, not a normative taxonomy**; a documentation or interface work unit derives different rows.

A primitive, schema arm, or workflow paragraph **cannot close the obligation by itself**. Exit criteria cover every
mandatory spec lifecycle, not merely representative outcomes.

**Division of labor:** draft and spec authoring name the invariants, capabilities, and transitions; task generation
owns turning them into vertically closed implementation-and-verification slices.

**Lifecycle rows project into Success Criteria.** Unlike a segment's exit criterion (D5), a lifecycle row is an
outcome-level claim about the work unit, so it belongs in the Success Criteria section where the verify-time walk
binds it by heading-path locus. This is what gives the composed reader its verify-time leg: the criterion the walk
binds is the lifecycle row, and the segment verifier's executed scenario is the source-grounded evidence its report
carries.

**Rows are authored before any boundary report is recorded.** `validate-criteria` binds a criterion by heading path
plus ordinal and treats an insertion or reorder that displaces a recorded ordinal as unresolved, never transferable
evidence. The archived delivery task list appended four criteria after its terminal report, in two separate
events, and revalidated after each. So the lifecycle rows land at task generation, and any row added later appends
to the end of its group.

### D8 — Scaffolding disposition: the retiring-owner clause

A slice front-loads integration work and usually requires scaffolding for layers it does not yet fully build. Every
**stub a slice creates names its retiring phase** — the phase whose exit criterion includes replacing or removing it
— recorded as a `_Retired by:_ Phase N` detail bullet beneath the stub's task, never at root. A plan is not
Finalize-complete while a stub names no retiring phase. Which tasks are stubs is judgment; that a named retiring
phase exists is scanned (D6).

**The bullet is a protected post-completion surface.** Completion ordinarily replaces a task's description bullets
with `_Outcome:_`; `_Retired by:_` survives that pruning, because the interval in which it matters — the stub is
live in code, its retiring phase has not run — begins exactly when the creating task completes. The rule that
prunes fires in the task-loop workflow's completion-notes discipline, which today names `_Goal:_` as the only
protected surface; the protection lands **there**, beside `_Goal:_`, and the formatting strategy's post-completion
shape mirrors it. Stating it in the strategy alone would leave the fire-point contradicting it.

This is parallel in shape to the spike-disposition contract owned elsewhere (a default plus an explicit contract to
deviate), and deliberately not coupled to it: spike code is throwaway unless stabilized; slice scaffolding is kept
until its named retiring segment.

### D9 — Finalize obligations: one scanned, two judged

The task-generation Finalize checklist gains three entries.

1. **Segmentation diagnostics are clean** — run `npm run -s lint:md:descriptors` before the interlock; the verb
   takes no path and scans the tracked and untracked corpus, so it sees the saved, not-yet-staged task list. It
   covers the structural contract: every phase in a declared segment, opening and closing lines present, `slice`
   and `replication` segments closed by a segment verifier in position, the terminal phase bare, retiring-phase
   targets resolving. The staged gate re-certifies the same contract at the ceremony commit.
2. On a composition-risk plan, every mandatory lifecycle row is assigned to a `slice` per D7.
3. Every stub names a retiring phase per D8.

### D10 — Mode-sensitive test grouping

The live rule _"group test and implementation together by module or concern"_ is correct within a `layer` segment
and fights a `slice`, where the natural grouping is by behavior path. **The rule takes the mode as an input** rather
than standing as a blanket instruction.

A coupled refinement: **batching as the fail-first-preserving form.** One minimal implementation often satisfies
several coupled behavior tests, making later red steps unreachable; where behaviors share one indivisible
implementation, batching can be the sequence in which every test genuinely fails first.

**Split by fire-point, cross-referenced and never restated:**

- **Planning-time half** — mode-sensitive grouping and cycle-boundary declaration — lands in the task-generation
  workflow **and** in the test-first method, whose own copy of the grouping rule takes the same mode input so the
  two cannot diverge.
- **Execution-time half** — the manufactured-red rule widened to incidentally satisfied behaviors, plus
  reconstruct-and-revert evidence at completion — lands in the testing-standards method's shipped **default**, the
  declared execution-time owner of the fail-first invariants. This project's own `extend` override already carries
  the narrower reconstruct-pre-fix instance; it is re-read to point at the widened default rather than restate it.

The grouping rule is copied in five places, and every copy takes the mode input in the same edit so no blanket copy
survives: the task-generation workflow's phase-design principle, its content-fill "Test-first grouping" paragraph,
and its Finalize entry; the formatting strategy's § Test-First Task Structure core rule (the definition of record
the workflow points at) and its § Subtasks "group by concern" gloss. The test-first method's copy is D10's own.

### D11 — Vocabulary

`segment` is a new load-bearing term and earns **one** brief-vocabulary entry, nesting `slice`, `layer`, and
`replication` the way the `Chunk` entry nests `deliverable` and `stack`. The definition of record is the task-list
formatting strategy; the brief entry exists because `segment` also surfaces as a code-visible scope in the delivery
plan record and inventory schema, which an agent can meet without a task list open. The entry states the boundaries
against the adjacent terms:

- **`spike`** — planning-time, throwaway, de-risks _inputs_. Runs before a design exists and therefore cannot
  falsify a spec. A slice runs against a settled design and can.
- **`chunk`** — a review boundary; **`deliverable`** — a chunk with an independent merge boundary.
- **delivery member** — a partition of tasks for delivery. A segment is a task-plan boundary and is never a
  member; the shipped delivery record's own "resegmentation" vocabulary names member re-partitioning and is
  internal to that record.

### D12 — Compatibility contract with the shipped parsers

Verified against the parsers rather than assumed. These are constraints the design preserves, not aspirations:

- **The terminal phase title is exactly `Verification`.** The delivery task inventory refuses otherwise. Neither the
  terminal phase heading nor the terminal task title changes.
- **Exactly one parent task follows the terminal phase heading.** A segment verifier must never land in the terminal
  phase; the scan refuses it universally, where the inventory refused it only under a delivery plan.
- **Preamble labels stay in the preamble.** The root peer-descriptor label set is closed in code (`Goal`, `Context`,
  `Rationale`, `Approach`, `Shape`, `Note`). `_Mode:_` and `_Exit criterion:_` are preamble labels the descriptor
  validator never reaches; they are read by the segmentation scan alone, and cannot migrate to root-descriptor
  position without a change to that closed set.
- **Every parent before the terminal phase carries exactly one non-empty `_Goal:_`**, segment verifiers included —
  the inventory requires it of every pre-terminal parent.
- **The segment suffix mirrors the member suffix.** Both are exact trailing role suffixes matched by the inventory,
  and the member's coverage rules (final assignable task in its range) are untouched.
- **`_Retired by:_` is a detail bullet, never a root peer descriptor.** The descriptor validator closes a root
  descriptor cluster at the first unknown root label, so the bullet is placed beneath the stub's task where the
  validator does not read it; it is deliberately outside the closed root set.
- Phase headings, parent-task headings, and subtask bullets are untouched. `_Mode:_`, `_Exit criterion:_`, and a
  stub's `_Retired by:_` bullet scan as inert content everywhere except the segmentation scan; the cursor, tallies,
  and compaction seed derive from the same structural scanner and gain no new exposure.

### D13 — Ship surface

Each framework edit lands in the package source and the project copy together:

- the task-generation workflow — the inlined `resolve-plan-segmentation` procedure at the entry read, the ordering
  line rewritten to take the mode read as input, the three grouping-rule copies D10 enumerates, the three new
  Finalize entries, and two existing Finalize entries rewritten (the test-first grouping line takes the mode input;
  the preamble-order line admits `_Mode:_` and `_Exit criterion:_` in their position);
- the task-loop workflow and its shipped template — the completion-notes discipline names `_Retired by:_` beside
  `_Goal:_` as a protected post-completion surface (D8);
- the test-first method (grouping rule takes the mode input) and the testing-standards default, per D10's split;
- the task-list formatting strategy — phase preamble admitting `_Mode:_` and `_Exit criterion:_` in their position,
  the segment-verifier heading beside the member one with **both examples corrected to carry the suffix outside
  the bold**, the verifier-as-evidence-sink rule, the two grouping-rule copies D10 enumerates taking the mode
  input, and the stub `_Retired by:_` bullet as a protected post-completion surface;
- the task-list template — the same preamble and verifier shapes, member example corrected likewise;
- the brief vocabulary — D11's single entry.

Code, in the CLI package:

- `lib/task-list/segmentation.ts` (new) — the scan and its diagnostics;
- `lib/markdown/indexed-lint.ts` and `lib/markdown/descriptor-worktree.ts` — register the scan beside the descriptor
  validator at both fire sites; `lib/markdown/staged-gate.ts` — the runtime-implementation path list gains the new
  module;
- `lib/delivery/task-inventory.ts` — segment-suffix match producing `segment` scope;
- `lib/delivery/schema.ts` — the closed scope enum;
- unit tests for the scan and the inventory change, and the staged-gate tests for the new diagnostic family.

## Alternatives & Rationale

- **Bias task generation toward vertical phases outright.** Rejected. The corpus already carries an undirected
  version of this and it demonstrably does not fire. A bias without a discriminator is either ignored or misapplied,
  and substrate-first work is genuinely better layered.
- **Key the discriminator on design determinacy.** Rejected. It mis-advises determinate-but-mechanically-unproven
  work, which is exactly where a pilot is cheapest and most valuable. Residual-risk locus supersedes it.
- **Name the concept "tracer bullets."** Rejected as the headline term. The corpus already used
  "tracer-bullet syndrome" as the name of a _pathology_ — spike code calcifying into production — inverting the
  source meaning, since tracer code is explicitly lean-but-complete and kept. Adopting it positively would leave the
  term carrying opposite valence in two surfaces. That naming is corrected to **spike calcification**; the term
  stays available as descriptive prose but anchors nothing here.
- **Call slice work "impl spikes."** Rejected on attestation grounds. A spike runs before a design exists and cannot
  falsify a spec; a slice runs against a settled one and can. The boundary is deliberately _not_ "slice code is kept
  while spike code is thrown away" — slice scaffolding is slice-side code that is not kept, and its disposition is
  D8, settled separately from the vocabulary split.
- **Have pre-spec spikes build reusable scaffolding that implementation inherits.** Rejected, and it inverts the
  efficiency: a spike built for reuse has already stopped being throwaway, which is the precise drift the spike
  disposition lifecycle exists to prevent. The real relationship is informational — spike _findings_ tell task
  generation where composition risk lives.
- **Keep `pilot-then-replicate` a primitive mode with a staged criterion.** Rejected. It would be the only mode with
  an interior checkpoint, breaking the one-boundary-one-criterion shape the criterion-as-task reader depends on.
- **Collapse `replication` into `layer`.** Rejected. A `layer` segment closes on a settled layer; a `replication`
  segment closes on an exhausted enumeration. Conflating them re-blurs the exact boundary an exit criterion exists
  to state.
- **Own the work-unit-level vertical/horizontal read too.** Rejected as scope; that boundary is already settled
  between the decomposition and delivery work units.
- **Project every exit criterion into a Success Criteria row** (D5). Rejected. It would give the verify-time walk a
  locus to bind, but Success Criteria are already member-partitioned by exact heading path, so it costs either a
  second competing partition or a presumption that segments refine members — the refinement invariant this design
  does not own. Lifecycle-row projection (D7) delivers the verify-time visibility that actually matters.
- **Mark the segment verifier with a leading `Verification:` prefix** (D5). Rejected. The shipped member verifier
  is a trailing suffix that code already matches; a leading marker would make the family lexically non-uniform
  exactly where code reads it, and would cost a second detector instead of a sibling pattern.
- **Retitle the terminal task into the family** (D5). Rejected. Its title carries the workflow pointer, the
  inventory already types it positionally, and uniformity is not needed where nothing reads the title.
- **Keep the structural checks agent-evaluated** (D9). Rejected. Five of the six original obligations are
  deterministic scans over lines the structural scanner already parses, and the procedure-evolution discipline is
  that what the CLI can compute, the CLI computes. The checklist-only regime is also the weakest correctness layer
  on the record: a task-list checklist entry contradicted by the template went unnoticed across many work units.
  The staged gate is a fire site with no new verb and no wall-clock cost, and a precomposed diagnostic is better
  ergonomics than a hand scan. The two judgment obligations stay on the checklist.
- **Mint the discriminator as a method now** (D3). Rejected. It has one consumer; the only method cell today is
  public and corpus-audited, which is the cell the fan-in rule protects; and the private cell it belongs in is
  `composable-workflows`' to ship. Authoring it method-shaped inline costs nothing at extraction.
- **Give the segment verifier a criteria report** (D5). Rejected. There is no locus to bind, and the archived
  delivery task list recorded 57 full criteria reports — one member's slice sixteen times — for what a closing
  task's `_Outcome:_` says in a paragraph.

**External prior art, with its limits stated.** Walking skeleton, tracer bullet, and steel thread are one idiom
under three names — thin, real, kept, end-to-end first — targeting exactly this composition risk; walking skeleton
is the anchor citation, "steel thread" having contested notability. The acceptance-test-per-slice discipline (an
executable end-to-end test reads each increment's done-ness, not structural assertions) is the strongest sourced
form of the executable exit criterion. SPIDR's published discriminator and the recognized substrate and migration
idioms — enabler work, layer-first, canary, expand–contract — externally validate the three-mode taxonomy,
`pilot-then-replicate` included. For `replication`: large-scale-change discipline is the institutional precedent for
prove-once-then-mass-apply, and Parallel Change the staged-composition one, but **no surveyed source names the
segment-level mode or its completion criterion** — `replication` and "enumerated surface exhausted, batch-verified"
are coined into a real terminological gap, as is slice-scaffolding disposition. Rule of Three and
Spike-and-Stabilize are commonly mis-cited analogues of the wrong shape and are not prior art here.

**Grounding limits.** `review-architecture` is the one corpus case with a real task plan whose ordering can be read,
and it classifies as `slice`, matching its own postmortem. The recurrence evidence pays the re-grounding debt at
**pattern level**. What remains thin is **mode-classification practice**: no second corpus task plan has been
classified against the three modes, only the failure they answer.

## Cross-cutting Considerations

**Sequencing and dependency.** None hard. The delivery model this design extends has shipped; the base branch is
current with it, and the conventions D13 edits are stable.

**Delivery-plan candidate.** This work unit stays one concern with two independently reviewable surfaces carrying
different residual risks. The code (D6: the scan, the closed scope, segment production) is the substrate: its
residual risk is the **substrate contract** — are the diagnostic family and the scope taxonomy right — and it closes
on a settled, tested module. The doctrine (D1–D5, D7–D11) rides on top: its residual risk is **composition** — does
a segmented plan actually author, and does the gate reject an incomplete one — and it closes on exercisable
end-to-end capability. By this spec's own discriminator that is `layer` → `slice`, which is also the delivery
order, since the doctrine's Finalize entry names diagnostics the gate must already emit. Recorded as a candidate on
this evidence and resolved at task generation; nothing is published or bound here.

**Self-hosting bootstrap.** This work unit's own plan record binds at task generation under the current inventory,
which types its `slice` segment verifier as `implementation`; the drift check runs only at compose, so nothing
refuses the stale role once the substrate member lands. The sequence is therefore: bind under current typing, then
re-author the plan (`arc delivery plan abandon` and recreate from current inputs) after the substrate member lands
and before the doctrine member's verifier closes, so the exercising instance the success criteria name carries
`segment` typing in its record.

**Composable-workflows seam.** The inlined procedure is the shape that work unit's private-method cell extracts;
recorded in D3 with its two extraction triggers. No `lane` or fragment vocabulary is introduced here.

**Ergonomics constraint.** Every mechanization — the scan, the Finalize entries, the D6 classification — keeps
routine-session ergonomics first-class, primarily the agent's: surfaces present themselves at point of use as
precomposed diagnostics, never require code-diving or schema archaeology to discover how to proceed, and never tax
task-generation wall clock. Mechanization earns its place by _improving_ routine operations.

**Cost honesty.** Vertical segmentation is not free and the doctrine must price it, or it reads as a free win and
gets over-applied. A slice front-loads integration work and usually requires scaffolding (D8). Naming the three
modes side by side exists partly to make the cost of choosing vertical visible next to its alternatives.

**Testing.** The scan is a pure module with unit coverage over the diagnostic family, including the unsegmented
and single-segment cases; the inventory and schema changes extend existing coverage; the staged-gate tests gain the new
validator. The doctrine elements are judgment prose in a workflow, and edits to task-generation judgment prose want
**eval coverage** — carried as a line item, owned by the eval-harness work unit.

**Audience boundary.** Every edited framework surface is adopter-facing and ships. Prose states what is, carries no
transitional framing, and forward-points at no internal roadmap item.

**Migration and rollout.** No adopter-visible migration: the scan is presence-triggered, so a task list with no
`_Mode:_` line and no segment-suffixed task is unsegmented and produces no diagnostics; the Finalize entries apply
to newly authored plans. Closing the scope enum changes no existing value, because only `member` and `work-unit` were ever
produced.

**Coordination routed at planning close.** `plan-amendment` receives the verifier-as-evidence-sink property and the
archived delivery task list's evidence on revision anchoring and report replay (three captures already routed);
`review-orchestration-right-sizing` receives the vocabulary boundary between `segment` and member resegmentation;
`synthesis-modality`, `knowledge-architecture`, and `task-list-conventions` receive the captures the draft names.

## Success Criteria

- The task-generation workflow carries `resolve-plan-segmentation` inline at its existing entry read, authored
  method-shaped, with the three modes, the residual-risk discriminator, and the ordering doctrine; its ordering line
  takes the mode read as input; its Finalize checklist carries the three D9 entries.
- This work unit's own task list is the first composition-risk plan authored under the contract: it carries
  `_Mode:_` and `_Exit criterion:_` in their preamble position, has every mandatory lifecycle row assigned to a
  `slice`, and closes each `slice` and `replication` segment with a segment-suffixed verifier whose completion is
  an `_Outcome:_`.
- Both the staged Markdown gate and the worktree descriptor lint emit the D6 diagnostic family for a task list
  carrying `_Mode:_` lines — a missing segment, criterion, verifier, or retiring-phase target, an overlapping or
  duplicated declaration, an orphaned verifier, or a segmented terminal phase fails — and emit nothing for a task
  list with no `_Mode:_` line.
- The delivery task inventory produces `segment` scope from the segment suffix, the scope set is closed to the three
  values, exactly one `work-unit`-scope verifier remains terminal and unassigned, and `segment`-scope verifiers
  partition as `member`-scope ones do.
- A task list carrying the full segmented shape parses without refusal through the structural scanner, the task
  cursor, the tallies, the compaction seed, and the delivery task inventory, with the segment verifier typed
  `verification` / `segment` and every other parent typed as before.
- `layer` segments carry an exit criterion and no required verifier; the terminal verification phase carries
  neither mode nor criterion.
- On this work unit's task list, each mandatory lifecycle row appears as a Success Criteria entry authored before
  any boundary report, while segment exit criteria appear only as phase preamble and closing-task evidence.
- The test-grouping rule takes the mode as input in both the task-generation workflow and the test-first method;
  the widened manufactured-red rule and reconstruct-and-revert evidence land in testing-standards; neither restates
  the other.
- The brief carries one `Segment` entry nesting the three modes and stating the boundaries against `spike`,
  `chunk`, `deliverable`, and delivery member; the task-list formatting strategy carries the definition of record.
- Every edited framework surface's shipped content is identical in the package source and the project copy —
  `.default` sections for methods carrying a project override, and the template pairing for the task-generation
  workflow.
- All quality gates pass (tests, linting, type checking).
- Ready for integration.

## Open Questions

- **Whether the three modes survive contact.** Pattern-level recurrence evidence and external prior art both back
  the taxonomy, but no second corpus task plan has been classified against it, and work units whose residual risk is
  genuinely split within one segment are untested. Resolved by use, not before starting.
- **Whether "phase" survives as the segment substrate.** Segments are defined over phases. If a future structural
  model displaces phase as the unit, segmentation needs re-anchoring. No such change is in flight.

---
