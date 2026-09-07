# Draft: Decomposition Conservation and Authoring Hardening

- **Origin:** [internal] — routed from `USER-INBOX § Work Unit`, housekeep drain (2026-07-30); captured during the
  `chunked-delivery` cohort cut. Widened at the 2026-08-11 residuals consolidation: absorbed the surviving scope
  of the retired `decompose-finalization-diagnostics` and `decompose-authoring-expressiveness` members.
  Re-synthesized 2026-09-07 against the shipped six-mode transform (extraction landed 2026-08-22, after this
  draft's last content pass) and the refreshed cohort contracts; adversarial pass one folded the same day.
- **Purpose:** Make a retirement cut provable and expressible end to end: conservation covers every origin artifact
  whose content retirement removes, the authored cut map can state dependency intent the author already knows, and
  every refusal names its failed invariant, its differing evidence, and the one command that advances from it.

---

## Continuity

- **Readiness state:** formalization-ready. Every settle-able decision below is settled; what remains is spec-time
  enumeration.
- **Resolved this pass:** the retirement-only conservation boundary, held against extraction by a source-kind-keyed
  scan plus a decode rule; the collapse of the disposal-record alternative into companion inventory; companion
  inventory landing in this work unit behind the refusal baseline, presence-driven, with task lists scanned at
  phase granularity and a provisional-notes scaffold giving companion units a member destination; the locator
  half of the cut-map arm retired; the external-edge mechanism resolved against a completed-slug set lifted from
  the tree the repository plan already reads, refusing unknown slugs only; the refusal arm's mechanism (adopt the
  existing spine remedy contract, mapped at the command boundary, with a refusal envelope on stdout); scoped
  repository gating removed to its owner; boundary-fit, Class, and proportionality reads recorded below.
- **Adversarial pass one (2026-09-07):** one blocker, three majors, three minors, all confirmed against source and
  folded: extraction leak of the widened scan, task-list unit granularity, external-edge lifecycle source and
  shipped-target semantics, companion destination artifact, refusal-floor fate, remedy composition point and
  preflight channel, presence-driven task-list scanning.
- **Adversarial pass two (2026-09-07):** three majors, four minors, all confirmed against source and folded: the
  completed tier lifted from the repository-plan tree instead of the preflight snapshot; the extraction invariant
  held to the letter for Active origins by keying the scan on source kind, with a recorded amendment and accepted
  residual for started-Planning origins; the retained prefill declined; the notes scaffold's title precondition
  and remedy; external-edge canonical form and origin targets; the remedy field's type replacement and the stdout
  channel; in-flight maps across the cutover. Pass cap reached; the folds below are re-attacked at create-spec's
  own adversarial fire-point.
- **Open:** nothing design-bearing. Spec-time detail: the enumerated set of comparison refusals that carry
  differing evidence.
- **Next:** the capture interlock; on approval the draft crosses into create-spec.

## Verified transform surface (2026-09-07)

Facts read from the shipped code at the planning branch head, with base `main` one integration ahead and no
transform changes in that delta. Every arm below is framed against these, not against the cohort prose.

- **Six modes.** Retirement: `--preflight`, `--execute <map>`, `--advance-base <map>`. Extraction: `--extract <map>`,
  `--finish <map>`, and `--apply <authority>` valid only with finish. Execute is retirement's sole terminal
  mutation; advance-base recomposes the same completed map, conservation included, against a descendant base.
- **Artifact group inventory.** Preflight collects every `<prefix>-<slug>.md` in the origin's directory at the
  pinned source head. The whole inventory enters the retirement delta as deletions. A present task list is
  inventoried whether or not the meta points at it; the pointer is checked only when set.
- **One scan set, computed before the shape exists.** Units are scanned only from the artifacts the meta's `Design`
  pointer names: the draft, the single spec, or the paired spec. The task list and any `notes-*` companion are
  never scanned. The same scan feeds the starter map for both retirement and extraction, and both execute modes
  revalidate through it; the map's `shape` is authored afterwards. Conservation validates that every scanned unit
  is allocated exactly once and that every allocation names a compatible destination; deletion of an unscanned
  group member is not refused.
- **Scanner granularity.** The content scanner makes every heading from H2 through H6 its own unit, with ancestry
  and occurrence in the locator. A task list therefore yields one unit per task plus phase stubs and
  success-criteria sections. An H2-only boundary mode exists in the scanner and is unexposed.
- **Two planning profiles.** A draft profile refuses a pointed task list, and members enter draft-design. A spec
  profile admits one, and members enter generate-tasks. When any allocation targets a member's tasks artifact, the
  transform scaffolds that member a provisional task list as a whole retitled copy of the origin's; the member
  meta records no task list, and the member's own generate-tasks pass may retain, rewrite, or discard it. No
  scaffold exists for a notes artifact: conservation admits a `notes-<member>` target, but the planner then
  refuses with a projection failure because the file is absent, and that refusal carries no remedy.
- **Distribution is operator-owned.** The transform scaffolds each new member's design artifact as a retitled copy
  of the origin's, stages topology, dependency edits, the ROADMAP render, and the transition record, and stops. The
  operator then authors every reported destination by hand before the single distribution interlock. Allocations
  are plan-time ownership declarations: they change no destination bytes, and nothing after authoring proves an
  allocated unit's content reached its destination. Extraction's finish is the one place a transferred unit is
  authenticated at its destination.
- **Extraction thins whatever carries units.** The origin survives the additive leg; finish thins every path that
  carries a machine source unit, removing each unit not marked retained, by byte range. Companions are untouched
  today only because the shared scan excludes them.
- **Locators.** Kinds are preamble, section, and whole-file. A target locator must resolve against the destination's
  planned post-scaffold bytes. For a new member that is the origin's artifact retitled, so a section locator
  resolves exactly when the heading exists in the origin.
- **Edge endpoints and the two tree readers.** Internal edges and replacement targets must name dependency-capable
  destinations declared in the map: new members and existing-home work units. A work unit outside the cut that is
  not a destination cannot be named. Two readers are in play. The preflight snapshot lists only active, planned,
  and provisional metas, once per local branch with one git spawn per blob, and derives the incoming-edge set
  over every meta it finds; that set sits inside the preflight identity, and lifecycle resolution deliberately
  treats a completed dependent's edge as immutable. The repository plan reads the entire pinned tree with no
  pathspec, completed tier included, and then filters the live work-unit list conservation reads down to the same
  three tiers; the completed metas are in memory and dropped. So a shipped slug is indistinguishable from an
  unknown one at conservation time. An outgoing disposition already re-homes a prerequisite onto a member with no
  lifecycle check, and dependency resolution elsewhere reads an edge to a shipped unit as landed. Dependency
  edits land through the shared meta mutator's identifier-list slot.
- **Starter maps are author-slot only.** Every authoring value in the starter is an explicit placeholder; the
  parser enforces it, the workflow edits only those slots, and the core spec's success criteria name it. The
  machine half is facts the CLI computed; the authoring half is decisions the human made.
- **Refusals.** Roughly three hundred refusal sites and about one hundred thirty distinct code literals across the
  decompose modules, nearly all in pure modules returning bare codes. Remedy text exists only on ten execute and
  extract refusals at the command boundary; preflight, finish, and advance-base print a reason alone, and the core
  spec fixes preflight's stdout to the starter map with refusals emitting no JSON. The integration spine already
  defines a shared remedy contract: an invariant sentence, verbatim text, and an executable argv.
- **Transition record.** A thirty-line module writing origin, kind, successors, and authored incoming-edge
  dispositions. It is history, never authorization; a field is admitted only when git cannot reconstruct it and a
  live consumer reads it after the transition.
- **Cohort-consistency hook.** Reasons over the staged path set by design. Its two known defects, graduated members
  read as orphans and presence checked only on touch, are routed to `operational-state-docs`.

## Conservation boundary

### Problem / Motivation

Retirement is the only lane where proof and deletion share one operation. The proof covers the units scanned from
the design pointer; the deletion covers the whole artifact group. A `notes-*` companion, and any present task list,
sit in the deletion set and outside the proof. Nothing scaffolds notes content into a member, a task list is carried
only when an author remembers to target the tasks artifact, and no refusal names the gap.

The first real cut carried assurance and seam-algebra content in a notes companion. The cut assigned that content
to a member, but the transform deleted the file while reporting complete conservation; the content survived only
because the operator folded it into the cohort doc by hand. History makes recovery possible, yet no diagnostic says
recovery is needed.

This boundary carries the cohort's safety role: with transaction verification retired, conservation is the only
remaining net under a content-preserving split. The invariant to hold is that retirement may delete no content the
proof neither covered nor explicitly disposed.

**The boundary is the artifact group,** in the agent brief's sense: the meta plus every present spec, draft, tasks,
and notes companion. That statement is storage-agnostic. The three-tree retirement delta is its tracked-tier
binding, and the transform already assumes one tree at one pinned ref; this work unit adds no new tracked-tier
assumption and does not remove that one.

### Alternatives

- **Refuse on uncovered retirement content (baseline).** Any nonempty group member outside the scanned set blocks
  execute and advance-base with a typed refusal naming the path, carrying the spine remedy contract. Cheapest safe
  default; the operator folds companion content into a scanned artifact, or drops it deliberately, before
  retrying. This is the floor and lands first. Once inventory lands every Markdown member is scanned, so the floor
  survives as the invariant assertion over inventory minus scanned, kept with its test rather than retired; its
  refusal is observable in a shipped build only before inventory ships.
- **Inventory companions (full path).** Every Markdown member of the group present in the inventory is scanned with
  the existing content scanner, presence-driven rather than pointer-driven, and its units take the existing
  target and drop dispositions exactly as design units do. Class-based: no per-family switch and no configuration
  axis, per the storage check-doc's one-knob rule. The existing dispositions are the explicit disposal, so no new
  disposition kind is needed. The meta is a record, not content, and stays out. Three particulars settle the
  composition:
    - **Task lists scan at phase granularity.** The scanner's existing H2-only boundary mode is selected for
      `tasks-*` artifacts inside the one scan function every consumer calls, so scan, resolve, thinning, and
      finish stay consistent with no call-site change. Phases are the units; their locators carry empty
      ancestry, which no consumer reads. Per-task units were the alternative: no scanner change, but dozens of
      allocations for an ordinary list. A present task list under a draft profile is content like any companion
      and scans the same way.
    - **Companion units get a member destination.** A provisional-notes scaffold mirrors the task one: when any
      allocation targets a member's notes artifact, the transform scaffolds that member a whole retitled copy of
      the origin's notes companion, and the operator prunes it. Without it, the motivating case has no admissible
      destination and the planner refuses with no remedy. The scaffold also restores the presence guarantee the
      declined byte proof below relies on. It mirrors the task scaffold exactly, including the precondition that
      the source file opens with a title line; a notes companion without one refuses with a remedy naming that
      fix, rather than recreating the no-remedy gap the scaffold closes.
    - **The scan is keyed on source kind.** Preflight already knows an `active-origin` source can only extract, so
      under an Active origin companions are never scanned and never become source units. Under a
      `started-planning` or `backlog-stub` origin they are scanned as above.
    - **The provisional model is unchanged.** The whole-copy task scaffold, the member's retain-or-rewrite freedom
      at generate-tasks, and the pointer rule stand. What changes is that the grounding work in a task list is
      covered by the proof instead of carried only when an author remembers to target the tasks artifact.
- **Explicit disposal in the transition record.** Retired this pass. The record's admission test rejects it: a
  disposal attestation is consumed at execute time as authorization, and the record is defined as history. Its
  intent survives as the drop disposition under companion inventory, where authored decisions already live.
- **Post-authoring byte proof.** Considered and not proposed: authenticating each allocated unit at its destination
  after the operator authors it, the way extraction's finish does. Every unit's content is present in the tree at
  scaffold time, design units through the retitled design copy and companion units through the provisional
  scaffolds above, the destructive step and the authored members land in one reviewed commit, and git history
  retains the origin. No concrete failure of hand distribution has been observed. Under the cohort's
  hardening-admission boundary this is "more robust", not a blocking gap. Revisit on evidence.

### Holding the boundary against extraction

The scan set is shared and fixed before the shape is authored, so widening it widens extraction's starter map, and
finish would thin every non-retained companion unit. That would break the extraction spec's invariant that the
origin's task list is never a source unit, and the reasons behind that invariant still hold: an Active origin's
task list is its live execution surface, finish re-authenticates source bytes at apply time so a live list would
trip reauthoring on nearly every finish, and extracted members must own design scope, which tasks are not.

**Two rules, one per source kind.** Under an `active-origin` source, the scan skips companions, so the invariant
holds to the letter exactly where its reasons live: a live task list is never a source unit, never identity-bound,
and never a reauthoring trigger at finish. Under a `started-planning` source the shape is not yet known, so
companions are scanned, and a **decode rule** applies: under the extraction shape a companion unit accepts only
the `retained-origin` disposition, and any other disposition on one is a typed decode mismatch. Thinning then never
touches companion bytes. Allocation exactness is kept: the author fills each companion allocation, a small set
under phase granularity.

**Recorded amendment and accepted residual.** The extraction spec's sentence that the origin's task list is never a
source unit narrows, by forward amendment, to Active origins. For a started-Planning origin under extraction,
companions are retained-only source units, and a structural change to one of them between extract and finish, a
phase added, renamed, or removed, requires reauthoring against a fresh preflight. A Planning-state task list has no
live cursor, so that churn is low, and the reauthoring path already exists.

- **Alternative, declined: prefill `retained-origin` in the starter map** for the extraction-only source kind.
  Starter maps are author-slot only by contract, so this widens the starter schema, amends the core spec's
  success criteria, and writes a decision into the human's half of the map. Its use case also evaporates: under
  an Active origin there are no companion slots to fill, and the remaining started-Planning case is a few typed
  lines the decode rule already guards. Revisit if a second consumer wants CLI-suggested dispositions.
- **Alternative, declined: a starter-map tag** marking retirement-only units. Declared per-unit state that
  duplicates what artifact role already says, against the knowledge check-doc's derive-not-declare rule.
- **Alternative, recorded as direction: shape as a preflight input.** A shape-specific starter map would keep
  companions out of extraction's sight entirely. It reopens the core's split between the fixed machine envelope
  and the authored shape, a core contract change outside hardening, and buys nothing over the two rules above
  until a second consumer wants shape-aware preflight.

### Direction

Both land in this work unit: refusal as the fail-safe floor, delivered first, and companion inventory as the full
path behind it, so the floor's remedy names a real authoring path rather than a paste step. Extraction's bytes
are held unchanged: an Active origin's starter map never lists companions, and a started-Planning origin's lists
them as units the author marks retained. The current manual workaround, folding companion content into the
design artifact, is migration evidence, not the permanent contract.

## Authored cut-map expressiveness

_Absorbed from `decompose-authoring-expressiveness`; the meta-edit half retired with the sealed projection. The
two remaining gaps were re-examined against the shipped code this pass; one survives, one dissolves._

**Locator half — retired.** The drafted gap assumed the transform places conserved content and that a fresh
scaffold offers nowhere to place it. Neither holds: the scaffold is the origin's artifact retitled, and placement is
the operator's hand-authoring step. A locator encoding new destination structure would record intent the transform
never acts on. The cut map declares ownership; structure is authored at the destination. No schema change.

- **Alternative, declined:** re-charter the half as transform-owned placement, thinning each member's retitled copy
  to its allocated units and placing them by locator. That is a new mechanism over operator-owned distribution and
  a scope change under the hardening-admission boundary, admissible only by design amendment. The proportionality
  read below found no chartered goal that requires it while distribution stays operator-owned.

**External-edge half — survives, mechanism rewritten.** A member cannot declare a dependency on a work unit outside
the cut unless that work unit is also a destination. The minimal alternative, a hand edit to the staged member meta
before commit, fails the exact transform-delta proof that advance-base relies on, so the map must carry it.
Approach:

- add authored external edges from a new member, or an existing-home work unit, to a target named by slug;
- lift a completed-slug set from the pinned tree the repository plan already reads in full, and pass it to
  conservation as its own input, distinct from the live work-unit list and from the incoming-edge set. The
  preflight snapshot, its pathspec, and the preflight identity stay untouched, so completed dependents never enter
  the incoming-edge set that lifecycle resolution treats as immutable, and advance-base recomposes from the same
  tree it already reads;
- resolve each target against the live list plus that set at conservation time, refusing only a slug found in
  neither; a shipped target is admitted as a landed edge, matching how dependency resolution and the
  outgoing-disposition path already treat one, and a target that ships between execute and advance-base leaves
  the map valid;
- keep one representation per fact: an external edge whose target is already a declared destination refuses,
  because internal edges and outgoing dispositions already carry that edge. The retiring origin refuses as a
  target; under extraction the surviving origin is admitted;
- write the edge through the existing meta mutator's identifier-list slot, so it lifts to managed records unchanged
  and renders in the staged ROADMAP through the existing seam;
- keep internal-edge and incoming-disposition validation as it is, never overloading their proof to imply an
  external edge was created by the cut.

Two earlier leans were withdrawn under review. Refusing a shipped target needed the completed tier for the one
purpose of refusing, contradicted the transform's own outgoing path, and opened the advance-base race above.
Widening the preflight snapshot's pathspec targeted the wrong reader: it would have pulled completed dependents
into the incoming-edge set and the preflight identity, and multiplied per-branch git spawns, while the tree
conservation actually needs was already read.

## Refusal remedies

_Absorbed from `decompose-finalization-diagnostics`; its hidden-locus gap retired with the finalize mode._

- **One remedy contract across all six modes.** Adopt the integration spine's remedy shape for every decompose
  refusal: the failed invariant in the operator's terms, verbatim corrective text, and the corrective command as
  argv. Preflight, finish, and advance-base gain remedies; execute and extract converge on the shared shape. The
  argv is the re-attempt or the corrective verb, never a verb that pretends to author missing work. The workflow
  already dispatches on the returned status and remedy and stays at that.
- **Composed at the command boundary.** Remedies map from the stable refusal codes where the command renders its
  result, the spine's own pattern; the pure modules keep returning bare codes. Threading the remedy through every
  pure result type was the alternative and is an order of magnitude more surface for no consumer.
- **A refusal envelope on stdout.** A refusing invocation emits one typed refusal envelope on stdout carrying
  status, code, locus, and remedy, so a consumer can dispatch it; preflight's stdout is the machine channel the
  workflow already captures. This amends the core spec's preflight wording, which fixes stdout to the starter map
  and refusals to no JSON: a refusal envelope is not a partial starter map, and the amendment is recorded forward
  rather than by rewriting that text.
- **The remedy field changes type.** Execute and extract already emit a result with a remedy string; convergence
  replaces that string with the spine object. Pre-release posture applies: no alias, no dual field, and the
  workflow's dispatch on status and remedy is unchanged in shape.
- **Differing evidence on comparison refusals.** Refusals that compare an expected and an actual head, path, or
  digest carry both sides as typed fields. Refusals that report a single locus stay as they are. Codes remain
  stable and machine-readable; this is additive.
- **No reference document.** Command awareness rides the emitted remedy, per the knowledge check-doc. No refusal
  code catalog is authored.
- **Typed dispatch is a consumer, not this scope.** Executing an emitted argv as a compiled step belongs to
  `composable-workflows`; this work unit only emits the shape it will consume.

**Scoped repository gating — removed from this work unit.** The cohort-consistency hook already reasons over the
staged path set, and its known defects are owned by `operational-state-docs`, routed to its planned
`corpus-conformance-gate` member. A concrete case of the transform blocked on a defect it did not introduce routes
there as a capture.

## Boundary fit, Class, and proportionality

- **`assess-boundary-fit`: stays one WU + delivery-plan candidate.** The three arms share the transform's execute
  and preflight surface and one refusal contract; the conservation refusal is the first consumer of the remedy
  shape. The cohort consolidated them into one member deliberately, resolving refusal-text duplication between the
  former members. Delivery candidate, unbound: the remedy contract with the conservation refusal baseline first,
  companion inventory with its decode rule and scaffolds second, external edges third.
- **`classify-work-unit`: `Heavy`, confirmed.** Derivation fires on the conservation policy and the external-edge
  semantics; scale fires on the refusal surface. Nothing is invented; every mechanism composes existing primitives,
  so not `Novel`.
- **`assess-design-proportionality`: one `revise` at entry, applied; re-run at loop exit over the folded design.**
  The locator half was `speculative-capability` against operator-owned distribution and is retired above. Every
  surviving mechanism traces: the refusal baseline to the data-loss consequence; companion inventory to the same
  invariant by composition of the existing scanner and dispositions; the H2-only selection to an existing scanner
  mode; the notes scaffold to the existing task-scaffold pattern and the presence guarantee; the source-kind scan
  and decode rule to the extraction spec's invariant, chosen over a declared tag and over a starter prefill; the
  completed-slug set to a tree already read, under the pinned-ref contract the cohort forbids weakening; external
  edges to the exact transform-delta constraint; and the remedy contract to the missing-remedy defect by
  composition of an existing schema. Rigor concentrates on the deletion path; advisory refusals get lighter
  treatment.

## Unknowns and Assumptions

- Which comparison refusals carry differing evidence; the set is enumerated at spec time from the refusal sites.
- Assumed: the scanner's heading-unit model applies unchanged to `notes-*` Markdown. Companions follow no
  structural template, so a companion with no headings yields a single preamble unit; a task list's header above
  its first phase is likewise one preamble unit under the H2-only mode.
- Assumed: the H2-only branch, unexercised today, behaves under test as its code reads; its setext-H2 handling is
  shared with the full mode.

## Accepted consequences

- A map authored before inventory or the H2-only mode ships is reauthored against a fresh preflight after the
  upgrade: unit identities change under the widened scan, and a task-list target locator naming a task heading
  no longer resolves. A map and its advance-base run on one CLI version.
- Under a started-Planning origin taking the extraction shape, a structural change to a companion between extract
  and finish requires reauthoring, as recorded above.

## Success signals

- Before inventory ships, a retirement whose origin carries a nonempty companion outside the scanned set refuses at
  execute and advance-base, naming the path and the corrective command; after, the same check stands as an
  invariant assertion with a test.
- Under companion inventory, every notes unit and every task-list phase present in the origin's inventory appears
  in the starter map and must be allocated or dropped before execute accepts the map; a notes unit targeted at a
  member lands in a scaffolded provisional notes artifact.
- An Active origin's starter map lists no companion units. Under a started-Planning origin taking the extraction
  shape, a companion unit carrying any disposition other than retained is a typed decode mismatch, and finish
  leaves companion bytes unchanged.
- A notes companion without a title line refuses at plan time with a remedy naming the fix.
- A completed map can declare an external dependency edge; the scaffolded member meta carries it and the staged
  ROADMAP renders it; a slug found in neither the live list nor the completed set refuses, a shipped target is
  admitted as a landed edge, and a target that is already a declared destination refuses.
- Every refusal from all six modes carries an invariant, verbatim text, and an argv; a refusing invocation emits
  one typed envelope on stdout; comparison refusals carry both sides of the comparison.

## Scope boundary (Won't Do)

- Extraction thinning of companion content. An Active origin's companions are never scanned; a started-Planning
  origin's are retained-only under the extraction shape; the origin survives and finish already authenticates
  transfers.
- Prefilled starter-map dispositions of any kind; starter maps stay author-slot only.
- Transition-record schema changes of any kind.
- Cohort-consistency validator fixes and any corpus-wide gate, owned by `operational-state-docs`.
- Transform-owned content placement into members, unless re-chartered by amendment.
- Shape as a preflight input; recorded as direction, not built.
- Task-plan ordering doctrine, owned by `plan-segmentation`. Decomposition carries task-list content as
  provisional phases; a member's own generate-tasks pass re-segments whatever it keeps.
- ROADMAP projection or render changes beyond the existing seam; `roadmap-tooling` owns the render standard.
- Typed dispatch of emitted remedies, owned by `composable-workflows`.
- Performance and concurrency bounding, owned by `decompose-scaling`.
- When and at what maturity a cut is valid, owned by `decomposition-doctrine`.
- Any new configuration axis, including a per-family conserve switch.

## Scope Estimate

Medium–Large, unchanged. The conservation arm did not shrink and gained three small compositions, the H2-only
selection, the notes scaffold, and the source-kind scan, plus the decode rule; the cut-map arm shrank to its
external-edge half and gained the completed-slug set; the refusal arm composes one existing schema at the command
boundary rather than through the pure modules. Recalibrate at spec close per the cohort's hardening-admission
boundary.
