# Task List: plan-segmentation

- **Design:** `spec-plan-segmentation.md`

---

<!-- arc:delivery-plan:start -->
## Delivery Plan

- **Plan Revision:** `1`
- **Plan Digest:** `sha256:b4e97e96337889eba2e0203d003a84d2a4ae60cf98acef7958e181012ac1b61e`
- **Projection:** `stack-to-main`
- **Landability:** All members are `independently-landable`.

### Members

| #   | Member                 | Chunk key                |
| --- | ---------------------- | ------------------------ |
| 1   | Segmentation substrate | `segmentation-substrate` |
| 2   | Segmentation doctrine  | `segmentation-doctrine`  |

#### Member coverage

| #   | Tasks                                                                              | Design elements                                                                  |
| --- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| 1   | `1.1`, `1.2`, `1.3`, `2.1`, `2.2`, `3.1`, `3.2`, `3.3`                             | `rfc:D6`                                                                         |
| 2   | `4.1`, `4.2`, `4.3`, `5.1`, `5.2`, `5.3`, `6.1`, `6.2`, `6.3`, `6.4`, `6.5`, `6.6` | `rfc:D1`, `rfc:D10`, `rfc:D11`, `rfc:D2`, `rfc:D3`, `rfc:D4`, `rfc:D7`, `rfc:D8` |

### Named seams

| #   | Seam                                      | Members | Owner | Design elements                          |
| --- | ----------------------------------------- | ------- | ----- | ---------------------------------------- |
| 1   | Authored segmentation to gate enforcement | 1, 2    | 2     | `rfc:D12`, `rfc:D13`, `rfc:D5`, `rfc:D9` |

#### Acceptance

- **1. Authored segmentation to gate enforcement:** The authored preamble and verifier grammar is accepted by both lint
  fire sites, and its verifier retains segment scope through delivery inventory without changing canonical task
  coverage.
<!-- arc:delivery-plan:end -->

## **Phase 1:** Segmentation scan module

**Delivery member:** 1 — `segmentation-substrate`

_Purpose:_ the pure read over structural-scanner output that turns preamble prose and parent headings into
segments and a closed diagnostic family — the substrate every later obligation names.

_Mode:_ `layer` through Phase 3 — closes on a complete, settled layer.

_Design decisions:_ the scan is a pure module over `scanTaskListStructure` events and the raw lines those events
index — the same seam `scanTaskDescriptorExtents` and the delivery task inventory already consume. It opens no
file. The terminal phase is identified by position, the last phase in document order, because the inventory
already refuses a last phase not titled `Verification` and segmentation adds no second judgment. Tasks group by
module and concern here because the segment is a `layer`; the behavior-path grouping a `slice` wants would cut
across the diagnostic family for no gain.

### `[x]` **1.1 Segment model and preamble-line resolution — D4, D6, D8, D12**

- _Goal:_ a task list's phase preambles and stub bullets resolve into an ordered list of segments carrying mode,
  span, and closing phase, plus the retiring-phase references its tasks make — and a list with neither a preamble
  `_Mode:_` line nor a segment-suffixed parent resolves to no segments and no diagnostics, so every list authored
  before the contract stays outside it.

- _Outcome:_ `segmentation.ts` now resolves single- and multi-phase segment records, closing criteria, retiring-phase
  references, and exact verifier suffixes from structural events and raw parent headings. Compatibility lists remain
  outside the contract, misplaced or fenced declarations stay inert, and malformed structure returns no partial data.

### `[x]` **1.2 Declaration diagnostics — D6**

- _Goal:_ every malformed or incomplete segment declaration surfaces as its own precomposed diagnostic naming the
  offending line, and a well-formed declaration surfaces nothing.

- _Outcome:_ the scan now emits the closed, source-located declaration diagnostic family for phase coverage,
  duplicate identities and labels, malformed or unknown modes, invalid spans, missing or orphaned exit criteria,
  overlap, and unresolved retiring phases. Findings retain fixed `path:line:` messages in document order.

### `[x]` **1.3 Verifier-position and terminal-phase diagnostics — D5, D6, D12**

- _Goal:_ the segment verifier's position is enforced where the doctrine requires one and left alone where it does
  not, so an authored plan cannot claim a closed segment it never proves.

- _Outcome:_ verifier validation now binds a segment suffix to the closing phase's last non-member parent, requires
  it for multi-segment `slice` and `replication` plans, permits it for `layer`, and accepts a following member
  verifier. Orphaned and terminal verifiers and terminal segmentation declarations receive distinct diagnostics.

## **Phase 2:** Gate fire sites

**Delivery member:** 1 — `segmentation-substrate`

_Purpose:_ register the scan beside the descriptor validator at both sites that already certify task lists, so a
host-side or unverified commit cannot pass CI with a broken segmentation.

_Design decisions:_ the scan is a sibling validator at each site, not a new verb, hook, or path selector. Both
sites keep `selectTaskDescriptorPaths` as their single selector, so archived work stays excluded and the canonical
template fixture stays included without a second selection rule to keep in step.

### `[x]` **2.1 Worktree descriptor lint fire site — D6, D9**

- _Goal:_ `npm run -s lint:md:descriptors` reports segmentation findings alongside descriptor-spacing findings over
  the same selected paths and exits non-zero on either, so an author sees both from one run.

- _Outcome:_ the worktree descriptor lint now runs segmentation beside spacing validation over the shared selected
  documents, returns their common path/line/message shape, and sorts the combined stream deterministically. The
  public command fails on segmentation findings while legacy and excluded task lists remain unaffected.

### `[x]` **2.2 Staged indexed-certification fire site — D6, D9**

- _Goal:_ the pre-commit staged gate certifies index bytes for segmentation too, and a change to the scan itself
  retriggers certification rather than passing on stale evidence.

    - `[x]` **2.2.a Add the scan module to the runtime-implementation path list**
        - Added `segmentation.ts` immediately after the structural scanner, so a scan-only staged change triggers
          certification and participates in the worktree/index implementation-alignment guard.

- _Outcome:_ indexed certification now runs segmentation over staged task-list blobs beside descriptor validation,
  retaining its verdict when worktree bytes differ. The runtime path registration makes scan changes invalidate
  stale certification evidence.

## **Phase 3:** Verification scope closure and `segment` production

**Delivery member:** 1 — `segmentation-substrate`

_Purpose:_ the delivery model stops admitting a verification scope by accident and starts producing the one the
doctrine names.

_Exit criterion:_ the scan and the typed scope are settled and tested — the diagnostic family is complete over
fixtures, both fire sites carry it, `segment` scope is produced from the suffix and partitions as `member` does,
and no consumer of the doctrine exists yet; Phase 4 authors the first one.

### `[ ]` **3.1 Close the verification-scope set — D6**

- _Goal:_ a verification role accepts only `segment`, `member`, or `work-unit`, so an unrecognized scope is refused
  at the schema boundary instead of flowing into a canonical record.

- _Note:_ only `member` and `work-unit` were ever produced, so closing the set changes no existing value and the
  canonical plan digest is unaffected. Pre-public-release posture applies — no compatibility reader, no migration.

- _Note:_ the role shape is shared with the authoring parent schema, so the closure tightens caller-supplied input
  at plan creation as well as canonical records.

    Build `test-first` (one behavior at a time):

    - each of the three values validates
    - any other non-empty scope is refused
    - a work-unit verification role still requires a null semantic digest, and every other role still requires one

### `[ ]` **3.2 Produce `segment` scope from the trailing suffix — D5, D6**

- _Goal:_ a parent whose title ends in the segment role suffix types as a `segment`-scope verification task, stays
  member-assignable, and partitions through the coverage rules exactly as a `member`-scope verifier does.

- _Approach:_ the inventory consumes `hasSegmentVerifierSuffix` and `hasMemberVerifierSuffix` from task 1.1 rather
  than carrying its own copies — one definition, two readers, so the two role suffixes cannot drift apart.

- _Note:_ the coverage rules need no change. Both member-boundary checks key on a `member`-scope role, so a
  segment verifier falls through them as an ordinary assignable task — counted, assigned to exactly one member,
  inside the contiguous partition. That is also what makes segment-then-member the only legal adjacent order: a
  member's verifier must be the final assignable task in its range.

    Build `test-first` (one behavior at a time):

    - the segment suffix produces a verification role at segment scope
    - the member suffix and terminal positional typing are unchanged
    - a suffix inside the bold title does not match
    - a segment verifier carries a semantic digest and is assignable
    - a segment verifier immediately preceding a member verifier leaves the member's final-assignable-task rule intact

    - `[ ]` **3.2.a Guard the coverage rules against a broadened verification predicate**
        - the conclusion above holds only while both member-boundary checks stay keyed on `member` scope. An
          edit broadening either to any verification role would begin rejecting segment verifiers with no other
          signal, so cover a member range whose final assignable task is its member verifier, immediately
          preceded by a segment verifier

### `[ ]` **3.3 Substrate contract close-out — D7** — validate criteria at member scope

- _Goal:_ Member 1's grouped criteria are walked at its boundary and the resulting evidence recorded, so terminal
  verification dispositions this member from a report rather than re-deriving it.

## **Phase 4:** The discriminator at the task-generation entry read

**Delivery member:** 2 — `segmentation-doctrine`

_Purpose:_ segmentation becomes a third output of the read that already drives planning depth and work-unit class,
and the stage gains the grammar for recording it.

_Mode:_ `slice` through Phase 6 — closes on exercisable end-to-end capability.

_Design decisions:_ every edit in this phase lands in the package source template first and mirrors to the project
copy; both copies are byte-identical today and resolve no conditionals, so the mirror is the same patch and the
framework-sync drift check is the proof. Prose is adopter-facing — it states what is, names no in-flight work, and
carries no transitional framing. The stage's obligations land here and the definitions of record land in Phase 5,
so the doctrine is briefly incoherent between them; that is why both phases are one delivery member and land
together, not a resequencing to fix.

### `[ ]` **4.1 Inline the segmentation procedure at the scale-axis read — D1, D2, D3**

- _Goal:_ the stage's existing entry read yields a third output — an ordered sequence of segments with modes —
  from a named, method-shaped procedure, and the phase-ordering guidance consumes that output instead of gesturing
  at incremental delivery.

- _Shape:_ a procedure with a signature line naming its inputs and outcome, the three modes and what each closes
  on, the residual-risk discriminator, the pilot-then-replicate composition, and the ordering doctrine. Authored
  method-shaped and placed inline: it has one consumer today, and the signature is what makes extraction free
  later. The read is universal — a light work unit's read returns one segment with an evident mode.

- _Approach:_ the body is its own named section between the entry read and the resolved-level paths, invoked from
  the read — the shape the stage already uses to separate its execution driver from the procedures that driver
  invokes. The entry read gains the call, not the content.

    - `[ ]` **4.1.a Author the procedure at the entry read**

    - `[ ]` **4.1.b Rewrite the phase-ordering principle to take the resolved segments as input**
        - the ordering principle and the phase-shape guidance task 4.2 edits are adjacent bullets in the same
          subsection

### `[ ]` **4.2 Phase-preamble grammar for the recorded surface — D4**

- _Goal:_ an author following the stage knows exactly where the two lines go and what they may say, so the
  recorded surface is reproducible without reading the scan.

- _Context:_ the landed preamble order is any delivery-member pointer, then the required purpose line, then these
  two, then any design-decisions block. The mode line carries a backticked token from the closed set, an optional
  span, and a prose gloss after an em dash; the exit criterion is prose. Only the token and span are parsed.

- _Approach:_ the two lines belong to the structural skeleton, written in the pass that decomposes phases — they
  are claims about the boundaries being decided there, not content filled in later. Say so where the skeleton
  shape is specified, or a multi-pass author defers them and the Finalize scan meets a plan whose boundaries were
  never declared at the point they were chosen.

- _Note:_ preamble entries separate with a blank line — adjacent label lines render as one flowing paragraph.
  The grammar, the definition of record, and the template all state the same spacing.

    - `[ ]` **4.2.a State the grammar and position in the phase-shape guidance**

    - `[ ]` **4.2.b Rewrite the Finalize preamble-order entry to admit both lines in position**

### `[ ]` **4.3 The three Finalize obligations — D7, D8, D9**

- _Goal:_ the stage will not close on a plan whose structural segmentation is broken, whose lifecycle rows are
  unassigned, or whose stubs name no retiring phase — one obligation scanned, two judged.

- _Rationale:_ the structural half runs the descriptor lint before the interlock, so the author sees precomposed
  diagnostics over the saved file rather than hand-checking a checklist. The two judgment obligations need the
  spec and the code read, so they stay author-evaluated.

- _Shape:_ every existing checklist entry asserts a property of the file, so each new entry states its property
  and carries the verb in its body rather than reading as a bare instruction.

    - `[ ]` **4.3.a Segmentation diagnostics are clean before the interlock**

    - `[ ]` **4.3.b Every mandatory lifecycle row is assigned on a composition-risk plan**

    - `[ ]` **4.3.c Every stub names a retiring phase**

## **Phase 5:** Recorded-surface definitions of record

**Delivery member:** 2 — `segmentation-doctrine`

_Purpose:_ the formatting strategy, the template, and the brief carry the grammar, the verification family, and
the vocabulary an author or agent meets without the task-generation stage open.

### `[ ]` **5.1 Phase-preamble grammar and the verification family — D1, D4, D5, D8**

- _Goal:_ the formatting strategy is the definition of record for segments — the preamble grammar and spacing, the
  three modes, the segment verifier's heading and position, and the evidence-sink rule — so the stage can point at
  it rather than restate it.

- _Approach:_ the verification family reads as one section: segment, member, and work-unit boundaries side by
  side, with the two suffix-marked rows sharing the same trailing-suffix shape. The strategy's own member example
  carries the suffix inside the bold, which is not the shape the inventory matches, and is corrected here.

- _Shape:_ the modes, the preamble grammar, and the verifier's position are one concern and belong in a section
  of their own, between the format-elements reference and the test-first structure, with the phase-preamble and
  verification-phase sections pointing into it. The document opens with a numbered contents list that no check
  validates, so a new section that misses it drifts silently.

- _Note:_ a verifier's completion is an ordinary outcome — the scenario executed and its result. It is not a
  criteria report and never hosts corrective work.

- _Note:_ the preamble's soft line cap predates the two structural lines and is already tight against them —
  Phases 1 and 4 of this list measure thirteen preamble lines against a cap of about twelve. The reconciliation
  below is what keeps every segmented plan from quietly violating a shipped convention.

    - `[ ]` **5.1.a Admit both preamble lines, with their position and spacing**
        - reconcile the preamble's soft line cap in the same edit: the delivery-member pointer and the two
          structural lines do not count toward it. The cap exists to keep rationale prose out of a preamble, and
          these lines are structure

    - `[ ]` **5.1.b Add the segment verifier beside the member one, and correct the member example**

    - `[ ]` **5.1.c State the evidence-sink rule and the segment definition of record**
        - add the new section to the contents list in the same edit

### `[ ]` **5.2 Template preamble and verifier shapes — D4, D5, D12**

- _Goal:_ the shipped skeleton shows the segmented shape an author copies from, so the template and the strategy
  cannot drift into contradicting each other.

- _Note:_ the template is itself a scanned path, but its task-list example lives inside a fenced block that the
  structural scanner skips — so nothing validates these examples. Check them against the strategy by hand.

### `[ ]` **5.3 Segment vocabulary entry in the agent brief — D11**

- _Goal:_ an agent that meets `segment` as a code-visible scope in a delivery record can resolve the term without
  a task list open, and cannot confuse it with a spike, a chunk, a deliverable, or a delivery member.

- _Shape:_ one entry nesting the three modes, the way the chunk entry nests deliverable and stack. Boundaries
  stated: a spike runs before a design exists and cannot falsify it; a chunk is a review boundary; a deliverable
  is a chunk with an independent merge boundary; a segment is a task-plan boundary and never a delivery member.

## **Phase 6:** Execution-time surfaces and the self-hosting exercise

**Delivery member:** 2 — `segmentation-doctrine`

_Purpose:_ the rules that fire during execution — stub disposition and fail-first grouping — land at their
fire-points and reach the projects those fire-points serve, and the whole contract is exercised against this work
unit's own plan.

_Exit criterion:_ this work unit's own task list is authored under the contract and exercised end to end — the
shipped segmentation procedure is followed on it, the descriptor lint and the staged gate report it clean, a
deliberately broken copy is refused with the precomposed diagnostic, and its re-authored delivery plan record
types the segment verifier as a segment-scope verification task.

### `[ ]` **6.1 The retiring-phase bullet as a protected post-completion surface — D8**

- _Goal:_ a stub's retiring-phase bullet survives task completion at either depth it can sit — neither replaced
  when a parent's children collapse into an outcome, nor rewritten when a subtask's bullets shift in place —
  because the interval in which it matters begins exactly when the creating task completes.

- _Rationale:_ the rule that prunes a completed task's body fires in the task-loop workflow, which today names the
  goal line as its only protected surface. Stating the protection only in the formatting strategy would leave the
  fire-point contradicting it, so it lands at the fire-point and the strategy's post-completion shape mirrors it.

- _Note:_ the bullet is a detail bullet beneath the stub's task, never a root descriptor — the root label set is
  closed in code and closes the cluster at the first unknown label.

    - `[ ]` **6.1.a Name it beside the goal line in the completion-notes discipline**

    - `[ ]` **6.1.b Mirror it in the post-completion shape**

### `[ ]` **6.2 Install the testing-standards method — D10, D13**

- _Goal:_ the execution-time owner of the fail-first invariants reaches the projects whose installed workflow
  already declares it, so the fire-point split below lands where its rationale says it does.

- _Context:_ three installed surfaces reference the method and none of them installs it — the task-loop workflow
  declares it in frontmatter, carries a link definition to it, and twice tells the executing agent to load it; the
  test-first method links it as its counterpart; the method index tables it. The corpus trigger audit cannot see
  the gap, because it reads a project instance where the file is present.

- _Approach:_ install it as a per-file configurable method, the classification every other method carrying an
  override slot already uses — installing it as a framework file would put a project's own override at odds with
  the drift check. Configurable files sit outside that check either way, so the two copies stay hand-synced under
  the same rule as the test-first method beside it.

    - `[ ]` **6.2.a Add the method to the install set and the configurable classification**

    - `[ ]` **6.2.b Reconcile the recipe-derived installed-file inventory**
        - record the project instance's manifest entry, then reconcile the package-sync strategy's complete
          installed Configurable list and counts to the resulting manifest: 101 Framework, 43 Configurable, 4
          Scaffolded, 148 total
        - scope is the installed inventory only; package-source files with no recipe disposition remain outside the
          manifest and outside this task

    - `[ ]` **6.2.c Reconcile every explicit test inventory to the resulting recipe**
        - add `testing-standards` to the complete method lists in `init.test.ts`, `init.e2e.test.ts`, and
          `update.test.ts`; also add the already-installed `validate-criteria` entry missing from the E2E list, and
          retain the direct manifest assertion that every listed method is Configurable

### `[ ]` **6.3 Mode-sensitive grouping and the widened fail-first rules — D2, D10**

- _Goal:_ no blanket copy of the test-grouping rule survives anywhere — every copy takes the segment's mode as
  input — and the execution-time fail-first discipline covers behaviors an implementation satisfies incidentally.

- _Rationale:_ grouping by module or concern is right inside a `layer` and fights a `slice`, where the natural
  grouping is by behavior path. A copy left blanket would keep advising the layered shape at exactly the boundary
  the doctrine exists to change, so all six copies move in one edit.

- _Approach:_ split by fire-point and cross-reference rather than restate. The planning-time half is grouping and
  cycle-boundary declaration; the execution-time half is the manufactured-red rule widened to incidentally
  satisfied behaviors, plus reconstruct-and-revert evidence at completion. The existing project override carries a
  narrower instance of that rule and is re-read to point at the widened default instead of repeating it.

    - `[ ]` **6.3.a The three task-generation copies take the mode input**
        - the phase-design principle, the content-fill grouping paragraph, and the Finalize entry

    - `[ ]` **6.3.b The two formatting-strategy copies take the mode input**
        - the test-first core rule and the group-by-concern gloss under subtasks

    - `[ ]` **6.3.c The test-first method's copy takes the mode input**
        - both method surfaces are configurable, so each copy takes the same targeted edit and neither is ever
          copied over the other — a blind copy wipes a project's overrides, and the pre-commit check that catches
          it fires only after the working tree is already touched
        - including the batching case: where several coupled behaviors share one indivisible implementation,
          batching can be the sequence in which every test genuinely fails first

    - `[ ]` **6.3.d The execution-time half lands in the testing-standards default**
        - widen the manufactured-red rule to incidentally satisfied behaviors and add reconstruct-and-revert
          evidence at completion; re-read the project override to point at it

### `[ ]` **6.4 Re-author the unbound delivery plan under segment typing — D5, D6, D13**

- _Goal:_ the exercising instance carries segment typing in an accepted successor canonical record, rather than
  the implementation role its planning-time record necessarily carried.

- _Context:_ this plan composes at task generation under the inventory as it stands, which types its segment
  verifier as implementation. By this task, Member 1's tasks are closed and the rebuilt bundle contains the new
  typing, but candidate eligibility has not materialized or bound delivery state. The window closes when this
  member's verifier closes.

- _Approach:_ before creating authoring state, invoke the read-only `delivery entry inspect` surface with
  `{"entryMode":"execution"}` and require `not-applicable` / `continue-work-unit` plus the guidance that says the
  canonical delivery is not yet bound. Any other route stops before composition. Then recreate the authoring map
  from current spec and task inputs and compose the accepted unbound successor revision. Never patch the
  machine-owned snapshot, create delivery state, or publish stale authoring state.

- _Note:_ the abandon verb removes an outstanding authoring map and is inert once composition has consumed one —
  it succeeds, changes nothing, and leaves the stale role in place. The stage's own instruction to abandon and
  recreate addresses drift while authoring, before composition, which is a different moment.

- _Note:_ the delivery verbs run from the built bundle, not from source, so this needs a rebuild first. A stale
  bundle refuses rather than mistyping — the entry point compares a content hash of its bundled inputs against
  the stamp written at build time — so an unexplained refusal here means the build, not the record.

### `[ ]` **6.5 Exercise the segmented contract end to end — D7, D9, D12** — validate exit criterion at segment scope

- _Goal:_ the executable scenario for this phase's exit criterion — a real segmented plan authored through the
  shipped procedure, scanned clean at both fire sites, refused when broken, and typed correctly in its record.

- _Approach:_ exercise both production paths, not a fixture: run the worktree descriptor lint over this repository;
  use a disposable `GIT_INDEX_FILE` seeded from `HEAD` to stage a selected clean task-list copy and then each broken
  variant, proving indexed certification actually triggers and returns the expected verdicts without touching the
  real index; confirm each precomposed message; then read the segment verifier's role out of the re-authored plan
  record.

- _Shape:_ drive refusal against a temporary task list placed where the selector genuinely reaches it, never by
  breaking the live one. The worktree path sees the untracked copy; the indexed path sees bytes staged only in the
  disposable index. Remove the temporary list and index before the phase closes, and verify the real index is
  unchanged.

    - `[ ]` **6.5.a Lock the full-shape consumer chain**
        - pass one segmented compatibility fixture through `scanTaskListStructure`, `scanTaskListSegmentation`,
          `analyzeTaskList` (cursor plus tallies), and `buildDeliveryTaskInventory`; feed that derived cursor through
          `emitCompactionSeed` and assert it is preserved

- _Note:_ this list creates no stubs — the substrate tasks close first, so the doctrine segment needs no
  scaffolding. The retiring-phase diagnostic is proven by fixture in Phase 1, not by self-exercise. Record that,
  rather than manufacturing a stub to demonstrate it.

### `[ ]` **6.6 Doctrine contract close-out — D7** — validate criteria at member scope

- _Goal:_ Member 2's grouped criteria are walked at its boundary and the resulting evidence recorded, consuming
  the segment verifier's outcome as its source-grounded evidence.

## **Phase 7:** Verification

_Purpose:_ terminal work-unit verification.

### `[ ]` **7.1 Complete verification — D1–D13** — load and follow `verify-work-unit.md`

---

## Success Criteria

### Member 1 — `segmentation-substrate`

- `[ ]` Both the staged Markdown gate and the worktree descriptor lint emit the segmentation diagnostic family —
  malformed task-list structure fails universally; for structurally valid input carrying a preamble line beginning
  `_Mode:_` or a segment-suffixed task, a missing segment, criterion, verifier, or retiring-phase target, an
  overlapping, duplicated, or malformed declaration, an orphaned verifier, or a segmented terminal phase fails; a
  valid unsegmented list emits nothing.
- `[ ]` The delivery task inventory produces `segment` scope from the segment suffix, the scope set is closed to
  the three values, exactly one `work-unit`-scope verifier remains terminal and unassigned, and `segment`-scope
  verifiers partition as `member`-scope ones do.
- `[ ]` A `layer` segment carrying an exit criterion and no verifier passes; a terminal verification phase carrying
  a mode or criterion fails.

### Member 2 — `segmentation-doctrine`

- `[ ]` The task-generation workflow carries `resolve-plan-segmentation` inline at its existing entry read,
  authored method-shaped, with the three modes, the residual-risk discriminator, and the ordering doctrine; its
  ordering line takes the mode read as input; its Finalize checklist carries the three new entries.
- `[ ]` This work unit's own task list is the first composition-risk plan authored under the contract: it carries
  `_Mode:_` and `_Exit criterion:_` in their preamble position, has every mandatory lifecycle row assigned to a
  `slice`, and closes each `slice` segment with a segment-suffixed verifier whose completion is an `_Outcome:_`.
- `[ ]` A task list carrying the full segmented shape parses without refusal through the structural and segmentation
  scans, task cursor and tallies, and delivery task inventory, with the segment verifier typed `verification` /
  `segment`, every other parent typed as before, and the derived cursor preserved through compaction-seed emission.
- `[ ]` Each mandatory lifecycle row appears as a Success Criteria entry authored before any boundary report, while
  segment exit criteria appear only as phase preamble and closing-task evidence.
- `[ ]` A stub's `_Retired in:_` bullet is named as a protected post-completion surface at the completion-notes
  fire-point and mirrored in the formatting strategy's post-completion shape.
- `[ ]` The test-grouping rule takes the mode as input in both the task-generation workflow and the test-first
  method; the widened manufactured-red rule and reconstruct-and-revert evidence land in testing-standards; neither
  restates the other.
- `[ ]` The testing-standards method installs as a configurable file, so the workflow frontmatter, link
  definitions, and method index that already declare it resolve in an installed project rather than dangling.
- `[ ]` The brief carries one `Segment` entry nesting the three modes and stating the boundaries against `spike`,
  `chunk`, `deliverable`, and delivery member; the task-list formatting strategy carries the definition of record.

### Cross-member seams

- `[ ]` Every edited framework surface's shipped content is identical in the package source and the project copy —
  `.default` sections for methods carrying a project override, and the template pairing for the task-generation and
  task-loop workflows.
- `[ ]` All quality gates pass (tests, linting, type checking).
- `[ ]` Ready for integration.
