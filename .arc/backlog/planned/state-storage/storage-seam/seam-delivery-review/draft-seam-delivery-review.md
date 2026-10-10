# Draft: Storage Seam

- **Origin:** [internal] — the `state-storage` re-cut (2026-09-28); stage 2 of the storage program.
- **Purpose:** Route every ARC reader and writer of operational and planning state through the storage contract,
  running on its in-repo implementation over today's substrates, so the ref backend later replaces that implementation
  with nothing above the contract changing. The design comes from `storage-contract`'s consumer map and the
  storage-coupling register; this draft settles how that work divides into members, what each owns, and the decisions
  the contract leaves to the seam.

---

## Continuity

- **Readiness:** formalization-ready for the cut, by the readiness check (2026-10-09). The member shape, placement, seam
  setup, and shared decisions are settled, the landed contract is folded in, and every inbound entry is integrated,
  rejected, or re-routed (§ Inbound dispositions); what stays open is each member's own, with its consumers named.
- **Phase 1 — design reads only (2026-10-05).** Read from `feat/storage-contract` at `baa12bf98`, never merged:
  `notes-storage-contract.md` (§ Consumer map, § Seam ordering, § Who builds Part B, § Index-path callers,
  § Implementation pointers) and `spec-storage-contract.md` (D1–D20 and Amendment A1).
- **Phase 2 — the contract landed (PR #810; archive PR #811).** Done 2026-10-09: `main` merged at `b6929d806`; the
  contract's notes and spec diffed from `baa12bf98` to the landed copies, which add Amendments A2–A14, six seam rows,
  and sharper end states on 86 existing rows without moving a row's owner; every decision below that the diff touched is
  revised, and the inbound entries routed here since the draft's consolidation are dispositioned. The path to the cut is
  settled (§ Path to the cut), and so are the decisions members share (§ Shared decisions). The author's grounded review
  ran over the whole draft, its findings folded, and adversarial pass 1 of 2 added a sixth member, record kinds, a write
  check beside each kind's parser, and a Class verb (§ Six members, § Shared decisions items 1 and 11), and its fix
  check gave locus the inbound list and the Errand description and made the write check and prepared writes shared
  decisions 11 and 12. Pass 2 of 2 and its fix check settled what the write check checks — only what a write changes,
  and nothing when state moves between backends — and the fate of held inbound entries when a work unit leaves, and
  routed the flip rewrite's `Class` and `Branch` steps to `storage-cutover` (items 3, 7, 9, and 11). Pass 3, approved
  over the cap, and its fix check's three rounds made `Design` the work item's own filenames, homed the hook's stage and
  field-shape rules in the write check, moved the cohort document's Purpose floor there, settled the edges a batch
  giving a work item a slug must settle and kept a former slug its own work item's, had the field writers stop at the
  last field line, and left how `arc start --from` takes a seed to lifecycle (items 3, 7, and 11, § Record kinds,
  § Lifecycle); the Owner stopped the loop after round 3. The readiness check then named locus as the consumer of
  lifecycle's `--from` item. The draft-close routing captures went out (§ Inbound dispositions), and `main` merged again
  at `3c9a980bd`. Remaining: decompose along § Members — by the interim retirement procedure (`RELEASE-GATES.md`
  § Decomposition until the cutover), after re-running the rehearsal kit, for six members, against the merged base,
  whose decomposition machinery has moved since the rehearsal (`63c6ec9cd` publishes the cut-map contract).
- **Next:** re-run the rehearsal kit against the merged base, then the cut.

**Citing the register.** Row keys are `notes-storage-contract.md` § Register keys, which the consumer map's Register
column uses. The keys are frozen to the register at `f1abf9664`, and rows inserted since put a key's position in the
current table out of step with its number, so match a key by its mechanism. Rows added after the freeze carry no key and
are named here by mechanism.

## Problem / Motivation

`storage-contract` landed one contract over today's three substrates, plus the three pieces every caller shares — the
current-work-unit resolver, the lifecycle index keyed by identity, and the store behind the integration checkpoint's
lifecycle port (its D9) — but rerouted no other caller. Every other reader and writer still reaches tracked files, Git
notes, and the transient-identity ref directly: work-unit state paths built by hand (36 lines in 19 files at
`7ddab4979`, key 13), Git-tree reads of lifecycle state, and stores constructed in place. Until those consumers go
through the contract, the ref backend and the projection cannot replace the in-repo implementation at the flip, and the
register's seam rows stay open. The consumer map gives this work unit 212 of its rows.

## Decisions

### Class, depth, and boundary

- **`Class` stays `Heavy`.** Scale fires: 212 rows across five subsystems. The design composes from the contract's map
  and register rather than inventing — the contract did the inventing — so it is not `Novel`. Planning depth is `high`:
  a multi-session design across two phases.
- **Boundary: cut-map.** The rerouting spans orthogonal subsystems, each independently deliverable and ownable, as the
  cohort's coordination anticipated. The landed map confirmed it: its diff from `baa12bf98` added rows and sharpened
  end states but moved no row between partitions. The cut runs later in Phase 2.

### Six members

Members inherit consumer-map rows rather than redesigning their subsystem, and re-derive line-level detail when they
plan. Counts are seam-owned rows in the landed map; the six rows added since `baa12bf98` each fall in a partition the
member already holds. Record kinds inherits none: it builds the kinds those rows consume.

| Member                                     | Rows | From the map's partitions                                               |
| ------------------------------------------ | ---- | ----------------------------------------------------------------------- |
| Record kinds                               | —    | none of its own; the kinds the other members' rows consume              |
| Lifecycle                                  | 79   | lifecycle and in-flight, less decomposition and in-flight derivation    |
| Decomposition                              | 19   | lifecycle and in-flight: `decompose-work-unit.md` and its modules       |
| Delivery and review records                | 35   | delivery; review and evidence                                           |
| Locus, session-init, and personal surfaces | 63   | locus and session-init; user sync; in-flight derivation from lifecycle  |
| Status and roadmap                         | 16   | status and roadmap                                                      |

- **Record kinds stand apart and ship first.** Lifecycle, decomposition, locus, and delivery all write records whose
  kinds items 1–8 of the shared decisions settle — the meta, task list, lineage, and cohort document — and status reads
  their parsed fields. Program work units land single-branch, so writers built inside lifecycle would hold every other
  member until lifecycle's 79 rows ship. Record kinds builds the kinds' parsers, field schemas, field writers, and write
  checks (§ Shared decisions, item 11); every other member's `Depends On` names it, and its schemas are settled here, so
  it is small and determinate.
- **Two pairs of partitions merge.** Delivery (17 rows) and review (18) name each other under Shared with eight and nine
  times, and their records are one family in the contract's D5, delivery and review records. User sync (14 rows; 26 more
  are removed at cutover) is mostly entanglement with locus, whose rows name it under Shared with 16 times.
- **Decomposition stands alone.** It is a self-contained machine — `decompose-sweep.ts` and the `decompose-v3-*` and
  `git-decompose-v3-*` modules, with their own planner, conservation, topology, and finish logic — with its own
  register row (key 49), whose end state, a cut as one multi-record `batch`, is a design separate from per-verb
  lifecycle writes, and its own downstream re-scope (the `decompose-core-hardening` subcohort).
- **In-flight derivation goes to locus.** The contract's seam ordering has `lib/git/in-flight-derivation.ts` and the
  locus worktree roster and evidence rewritten together, and the session-init slots that expose derivation marks are
  locus's. Lifecycle keeps the transition write path; locus takes what is in flight and where. The rows that move are
  `in-flight-derivation.ts`, `transition-overlay.ts`, `commands/active/in-flight.ts`, `commands/active/roster.ts`,
  `handlers/active.ts`, and `in-flight-scope-check.md`; `composed-lifecycle-index.ts` stays with lifecycle.
- **Rejected:** one member per partition (two thin members over one family, and locus and user sync colliding on 16
  files); decomposition inside lifecycle (a 98-row member bundling a self-contained machine with the verbs); in-flight
  derivation in lifecycle (locus would wait on it before rebuilding its roster and evidence); the kinds inside lifecycle
  (every writing member would wait on its 79 rows), or each built by the first member needing it (ownership spread, and
  two members may build one writer).

### Placement

The members form a subcohort, `state-storage/storage-seam/`, whose `cohort-storage-seam.md` holds the coordination no
member owns (§ Cross-member coordination). `storage-seam` retires at the cut, and the three edges on it re-point:
`storage-cutover`'s to the members, `roadmap-tooling`'s to status and roadmap, and `errand-launchpads`'s, minted on
`main` at `525bcaf9e`, to locus and session-init, as its draft asks. `cohort-state-storage.md` drops its
`### storage-seam` member section, which the consistency check's condition (c) flags once the origin retires
(`lib/active/cohort-consistency.ts`), and names the subcohort in its coordination text instead, as
`cohort-decompose-transform-integrity.md` names `decompose-core-hardening`: the cut rewrites § Coordination's
expectation that the seam decomposes into likely members run in parallel, which the six members, their edge on record
kinds, and the two-at-once design order replace, and § Cross-cohort's line naming `storage-seam` as `roadmap-tooling`'s
dependency. Elsewhere in that document `storage-seam` then names the subcohort: its 35 register rows keep that owner,
each closing when the members whose consumer-map rows carry its key realize its fate. Member slugs are part of the cut
and must read cold in a `Depends On` edge.

### Path to the cut

Decided by the Owner, 2026-10-09.

- **No seam-level spec.** `Design` stays on this draft, so the cut gives members pruned draft copies at `draft-design`
  (`inferPlanningProfile`; `decompose-v3-repository-plan.ts`), and each specs its own slice. A seam spec would have to
  settle every member's open detail across 212 rows, and members re-verify their rows when they plan anyway.
- **Shared decisions first.** Before the cut, this draft settles every decision more than one member consumes (§ Shared
  decisions). Each names the member that owns it, whose pruned draft keeps the decision through its spec, and the cut
  writes into `cohort-storage-seam.md` a pointer to it and the members consuming it, never the design itself, as the
  cohort template requires (`template-cohort.md` § Shared contracts). Members then plan from settled interfaces rather
  than from each other's drafts, and the only design ordering left is status after locus, whose in-flight model status
  renders.
- **Two members in design at once.** At most two members are in drafting or spec creation at a time; when one reaches
  `generate-tasks`, the next starts. Within that, record kinds is in the first pair, since every other member builds on
  it, status follows locus, and the rest is chosen at the cut. This design order is coordination in
  `cohort-storage-seam.md`, never a `Depends On` edge, which clears only when its dependency ships; the one edge among
  members is every other member's on record kinds (§ Six members), and `cohort-state-storage.md` records its design
  overlaps the same way.
- **The safety net.** Anything a member takes from a sibling that the shared decisions left open waits on the provider:
  the consumer drafts once the provider's draft settles it, and its spec is approved only after the provider's spec,
  with a re-read of what it consumes. This is stricter than the parent cohort's design-overlap rule, which holds back
  only implementation until the provider's spec is approved and asks no re-read: approving a consumer's spec against a
  provider spec not yet approved invites rework, and the re-read is cheap.

### Shared decisions

Each item stays open until settled here, before the cut. For a record kind more than one member touches, the pass
settles only the fields that cross a member boundary — each field's name, its value shape, the one verb that writes it,
and who reads it; a field one member alone touches stays with that member's planning. Items 1 and 2 come first, since
the rest hang on them. Already settled by the contract and not reopened: UIDs and aliases (A5, A11), branch links (A3),
the store's operations and versions, `StoreLifecycleStorage`, the layout resolver, identity resolution, and the Errand
record's schema; the meta's `Id` field, which the contract left open, is item 2's. Owners: record kinds holds items 1–8
and 11, locus item 9, and lifecycle items 10 and 12; at the cut each owner's pruned draft keeps its items, and
`cohort-storage-seam.md` points to them with their consumers (§ Path to the cut).

1. **Which verb writes which field** — settled (Owner, 2026-10-09). Four members write metas: lifecycle, through its
   verbs and executor; decomposition, through its cut; locus, through spawn scaffolding, Errand promotion, and
   handoff; and delivery's boundary, through `arc attest` (`handlers/lifecycle-delivery-review.ts`). Status writes
   none, and Candidate applicability (`handleCandidateApplicabilityResolve`) writes no meta. Lifecycle, decomposition,
   and delivery's render (`lib/delivery/task-list-render.ts`) write task lists.
    - **Record kinds owns the meta and task-list kinds:** their parsers, field schemas, and one writer per field, which
      every member's verb uses inside its own batch. Today `arc finalize` writes `Task List` as an identifier
      (`finalize-stage.ts`) and `arc rename` as an identifier list (`rewrite-renamed-meta.ts`), and a rename writes the
      title twice, by the reference sweep's string rule and by `setMetaTitle`.
    - **A field is verb-owned when a hand edit could slip past a gate,** and persist refuses a hand edit to it (D13,
      item 11): `State`, behind lifecycle's ceremonies; `Class`, which review assurance reads
      (`scripts/review-gate/policy/assurance.ts`); `Current Workflow`, which the executor's recovery marker and the
      stage consistency check read; and a task's completion or deferral, behind the task gate, through the close verb
      (D16, item 5). The owner edits the rest from the owning checkout, validated by the parser — `Owner` among them,
      since edit rights already limit it to the owner, so handing a work item over is the owner's own edit.
    - **Three fields leave the meta's writable set at the flip** for the record that already holds them: `Branch` and
      `PR URL` become the branch and change-request links (A3), and `Candidate` is read from the Candidate record's
      `attestation.candidateId`. Delivery then writes no meta: `arc attest`'s stage change goes through the
      `Current Workflow` writer inside its batch.
    - **The owning verbs are lifecycle's:** transitions write `State`; a Class verb writes `Class` at any stage, by
      `classify-work-unit`'s confirm-or-ratchet, as `arc set-stage` sets the stage, beside the shipped flags —
      `arc finalize --class`, `arc promote --class`, and the creating verbs' `arc stub --class`, `arc start --class` at
      graduation, and `arc errand promote --class`; `arc set-stage` and transitions, `Current Workflow`;
      `arc repoint-design` and `arc finalize`, `Design` and `Task List`, with creation seeding `Design`
      (`arc stub --design`, `arc start --from`); and creation, `Owner`, `Priority`, `Origin`, and `Cohort`. Other verbs
      reach a field inside their own batch: decomposition seeds and copies its members' fields and rewrites dependents'
      `Depends On`; dependency discharge rewrites `Depends On`; and rename rewrites `Depends On`, `Design`, and
      `Task List`. Completion Notes and the Release Notes Entry are prose sections the owner writes and delivery reads
      at integration (D18). Whether the owner may edit `Cohort`, whose change moves the work item, is item 3's; the
      progress fields are item 4's.
    - **Creating a meta is one writer, record kinds',** which `arc stub`, spawn scaffolding, decomposition's new
      members, and Errand promotion call. The scaffold keeps writing the marker and the meta's seeded `Next Action`
      (item 4), while its `SESSION-NOTES` seed goes (§ Locus), and promotion's role put is lifecycle's, though its
      runtime, `promote-runtime.ts`, sits in locus's partition of the map.
    - **The other kinds split the same way:** record kinds owns the lineage and cohort document kinds, whose writers
      decomposition's cut and lifecycle's verbs use (items 6 and 7); locus owns the inbound list and the Errand
      description kinds with the entry-field module (item 9), whose writers its routing verb uses; and only lifecycle's
      archive assigns a sequence (item 10). Delivery's `## Delivery Plan` section is item 5's.
    - **Until the flip** today's setters stay as the in-repo arm; each member adopts record kinds' field writers as it
      reroutes, and persist's refusal arrives with the projection (item 11). The flip rewrite moves every workflow step
      that hand-edits `Class` onto the Class verb, or onto a shipped flag where one covers it. None covers activate's
      Step 4, since `arc activate` takes no `--class`; init's post-init ratchet and a new work unit's resolution, since
      `arc start --class` applies only at graduation (`handlers/start.ts`); init's Errand-promotion step 6, which
      resolves a `Class` that `arc errand promote --class` did not supply, once promotion has run; promote's Step 2,
      which ratchets a resolved Class that `arc promote --class` refuses (`lib/work-unit/verbs/promote-demote.ts`); or
      draft-design's capture, since `arc finalize` fires only at create-spec, amend-design, and generate-tasks
      (`lib/work-unit/verbs/finalize-stage.ts`). The steps that hand-edit `Branch` (deactivate's Case C, init's re-run)
      move onto verbs too.
2. **The work-item base** — settled (Owner, 2026-10-09). The contract's base is identity, owner, type, lifecycle
   location, origin, and links (D5), and it already defines identity, links, and placement.
    - **The type is the primary's role, with no type field.** A work unit's primary is stored as `work-item/meta` and an
      Errand's as `work-item/record`; reads return the actual role, history keeps every past role, and promotion is A5's
      role put. A field would store the same fact twice, behind a parser check refusing a mismatch. This answers the
      contract's left-open "name of its type field": there is none. A later type sharing a primary's shape adds the
      field then, defaulted by each kind's parser, which knows its own role (`createKindRegistry`,
      `lib/store/registry.ts`), so no stored record is rewritten. Code and presentation keep "work unit" and "Errand"
      until the heavy type is renamed, a rename decided 2026-10-06 and captured for `naming-conventions`
      (`USER-INBOX § Work Unit`) but not yet in its draft, and "work unit" is never stored: a stored value would outlive
      the rename in immutable history (A4). "errand" survives that rename, so the Errand record's `kind: "errand"`
      (`lib/errand/identity-record.ts`) is harmless.
    - **No `Id` field.** A work item's UID is its key in the store (D2), never meta content: a field would store the
      same fact twice and leave it open to a hand edit. This settles the meta's `Id` field the contract left open (its
      Non-Goals): there is none. The import mints the UIDs (A11), and until the flip the in-repo implementation resolves
      identity from the slug, as D2 has it.
    - **The owner** is the person's identity slug as the contract resolves it (`resolveIdentity`,
      `lib/git/identity.ts`): `arc.identity`, or the slugified Git `user.name` when that is unset — the slug that
      already keys every identity-scoped path and ref — never an email, which would publish addresses into state.
      Creation writes it, and handing a work item over is a write of it alone (D5). Edit rights at persist, the
      in-flight view's `mine` filter, status, and locus read it. An Errand's owner is implied today by its
      identity-scoped ref and becomes a field when Errands move to project scope. A person UID, if ever needed, would
      take names as its aliases, so stored owners resolve unchanged. Identity stability is
      `config-storage-architecture`'s, whose draft holds the routed entry — collisions, one person's slug differing
      between machines, which the `user.name` fallback makes likelier, and that UID — and locus warns of a collision
      where it can see one (§ Locus). A capture corrects that entry's premise, which takes the owner from `arc.identity`
      alone (§ Inbound dispositions).
    - **Lifecycle location** is the contract's placement. Each type's own states — the meta's `State`, the Errand
      record's `state` — refine it and stay that type's; their writers are item 1's.
    - **The origin** is where the work came from: `[internal]` or an issue reference. An Errand's
      `origin: inbox | description` is a different fact, which its description absorbs at the flip.
    - **The description is not a base field:** it is the Errand's companion, kept through promotion (A5).
3. **The meta's cross-member fields** — settled (Owner, 2026-10-09).
    - **References people read and edit keep names; records only verbs write keep UIDs.** The contract has machine
      records reference each other by UID (D2) and names the meta one (D5), but under file-as-record the stored bytes
      are the file people edit, so `Depends On` and `Cohort` keep slugs and resolve through `lookup`. Lineage, review
      records, the Candidate record, and claims keep UIDs. A former slug still resolves, and to its own work item alone:
      creating or renaming a work item refuses a slug any record holds as a former slug. A rename rewrites in its batch
      (item 1) the dependents' edges it may write, those in provisional and planned stubs, which anyone grooms (D13), so
      those files show current names; an in-flight or parked dependent's meta stays with its owner (D13) and keeps the
      former slug, which `lookup` resolves at its owner's reconcile (§ Locus). A completed work unit's slug may be
      reused (D2), and `lookup` then resolves it to the live record, in the in-repo implementation (`lookupSlug`,
      `lib/store/in-repo/lookup.ts`) and D7's reference backend (`preferredSlugRecords`) alike, so an edge that named
      the completed record names the new one. So no batch may change what an edge in a record it cannot write resolves
      to. A batch giving a work item a slug that an edge already names for another record — a completed work unit's, or
      a decomposed or abandoned origin's — by creating a work unit or an Errand, a decomposition cut, or a rename, first
      settles each such edge in the records it may write, provisional and planned stubs and its own: an edge on shipped
      work discharges, and one on a retired origin takes its lineage disposition (item 6). It refuses, naming the work
      units and edges, while an in-flight or parked work unit's meta still holds such an edge, or while one has no
      disposition, as a decomposed origin's dependent the cut did not map has none (`unmapped-dependent`,
      `queryTransitionDisposition`). An owner settles an edge with `arc wu reconcile --apply` from the work unit's
      checkout, after `arc resume` for a parked one, or by editing `Depends On` (item 1) when that reconcile refuses,
      and anyone edits a stub's; or the batch takes another slug. Edges in archived records gate nothing and read as
      written. Every writer that creates or renames a work item takes these rules on. Today `arc start`'s collision
      guard refuses a slug any meta holds, a completed one's included, but admits a retired origin's or a former slug,
      which no meta holds (`hasNameCollision`, `resolveSlugState`), and no creating writer settles the edges. The
      settling touches only the edges naming that slug, judged against the state before the batch, and leaves a
      dependent's other edges as they are, unlike the dependency discharge's planner, which reconciles a dependent's
      whole edge list (`planDependencyReconcile`, `side-effects/discharge-dep-edges.ts`); a rename onto a slug the
      renamed item depends on thus settles that edge rather than making the item depend on itself. An edge names at most
      one live record. Activation still discharges edges to shipped work.
    - **`Depends On`** stays today's backticked slug list. Persist's write check refuses a new or changed edge that
      resolves to nothing or, live record first, to more than one record (item 11), and a reader finding an edge gone
      ambiguous reports it rather than choosing. Status renders the edges, decomposition redistributes them, lifecycle
      discharges them, and in-flight derivation reads them.
    - **`Design`** lists the work item's own artifact filenames; no meta in the repository names another work unit's
      file or a URL, though the pre-commit check admits any `.md` name or URL, two at most (`validateSpec`,
      `validate-meta-spec.ts`), and `arc stub --design` and `arc start --from` store their input as given (`stub.ts`,
      `spec-input-parser.ts`). The parser reads any entry (item 11). The meta's write check admits a new or changed
      entry only when it is the work item's own: its draft or spec name after the batch, `draft-<slug>.md` or
      `spec-<slug>.md` as the layout resolver projects them (`resolveArcPath`, `lib/layout/projection.ts`), written or
      not, since the `design` selector skips an absent one; or the filename of a companion the work item holds, read
      through the view, since a companion may take any name (D13) — in the in-repo implementation a paired spec's
      halves, `spec-prd` and `spec-rfc`, at `spec-<slug>-prd.md` and `spec-<slug>-rfc.md` (D8). It refuses a third
      entry, as the hook does today. So from the flip a URL or another work unit's file is refused, from those verbs
      too, and how `arc start --from` takes a draft or spec seed is lifecycle's (§ Lifecycle). Decomposition's planning
      profile, graduation's planning tuple (`planning-artifact-tuple.ts`), locus's in-flight derivation, which projects
      it into in-flight entries, the purpose read and `arc view design`, the stage consistency check
      (`current-workflow-consistency.ts`), and delivery's coherence check read it; the last accepts one or two entries,
      one of them the task list's own `Design` header (`handlers/delivery.ts`), which item 5 carries.
    - **`Cohort`** is a cohort slug, or `parent/child` one level deep, naming an open cohort, one whose document archive
      has not closed, and a `parent/child` value agrees with the child's `Parent` (items 7 and 11). From the flip the
      owner edits it: the store moves nothing, and the projection re-derives the backlog folder from the field (D5).
      Until then it stays as today, since the in-repo implementation refuses moves. Status groups by it, session-init
      loads its document, archive sweeps it, and decomposition sets it for new members.
    - **Completion Notes and the Release Notes Entry:** the shape rules readiness enforces today
      (`lifecycleArtifactFacts`, `scripts/review-gate/readiness.ts`) — Completion Notes unique and non-empty; at most
      one Release Notes Entry, a summary followed by unique, ordered, supported categories of non-empty items — stay
      readiness's, checked at integration over the stored record with the rule that Completion Notes are required there,
      so an entry written before the flip and integrated after it is still checked. The parser reads the sections as
      they are: eleven archived metas' shipped entries fail those rules today, nine labelling their categories in bold
      rather than with `###` headings and two failing the category rule, and they keep reading unchanged rather than
      being rewritten. Delivery reads the parsed sections (D18).
    - **The progress fields** are item 4's.
4. **Session context** — settled (Owner, 2026-10-09). From the flip it is a prose section of the meta that locus's
   handoff writes, beside a few fields: D5 names the state-version anchor and leaves which of today's handoff fields
   stay open, which this item settles. The contract sent that question to `handoff-optimization`
   (`notes-storage-contract.md` § Who builds Part B), whose draft still holds it open and expects `Commit at Handoff` to
   become the anchor; it is settled here instead, since the seam builds both the meta's schema and the handoff write,
   and a capture tells `handoff-optimization` so at draft close (§ Inbound dispositions). Today handoff writes the
   meta's `Last Completed`, `Next Task`, `Next Action`, and `Blockers`, and `SESSION-NOTES.md`'s `Working On`, optional
   `Session Type`, `Commit at Handoff`, and three prose sections: Uncommitted Work, Remaining Work Before Returning to
   Task List, and Additional Context.
    - **Fields kept:** `State at Handoff`, the contract's anchor, and beside it `Commit at Handoff`, the code-head
      baseline (§ Locus). Handoff restating (`deriveRestateCandidates`, `lib/handoff/restate-candidates.ts`) reads the
      second for the code commits the state version cannot see: the map's handoff row has the state version replace the
      commit, but its restating row keeps code commit evidence, which needs it. `Next Action`, the one directive several
      members write — lifecycle's transitions, graduation, `arc finalize`, and `arc set-stage`, decomposition's seeds,
      `arc attest` through record kinds' writer, locus's spawn scaffold (`worktree-scaffold.ts`) and Errand promotion's
      override (`promote-runtime.ts`), and handoff — which session-init's orientation and `--next` act on. And an
      optional `Session Type`, session-init's planning or execution override (`session-init.template.md`).
    - **Fields retired:** `Next Task`, for the cursor derived from the task list, which recovery already uses alone
      and session-init falls back to, and which carries a task's ID and title once identifiers are stable (item 5);
      verbs stop writing it. A person sees the next task in `Next Action`, which also says when work runs out of
      order, and later in the status HUD (`status-hud`); the meta cannot show the derived cursor, since its file is
      the record. `Last Completed`, derived from the task list's last completed task, as `arc publish` already does.
      `Blockers`, into the prose, since no code reads it. And `Working On`, since the meta is the work unit.
    - **The section** carries what the three prose sections and `Blockers` carry, kept as prose by the parser. It moves
      from a personal file to a record teammates can read, as D5 decided.
    - **Archive** clears the section, both anchors, and `Session Type`, and resets `Next Action` as today.
      `storage-ref-backend`'s import folds each `SESSION-NOTES.md` where its person owns the live work unit: the prose
      sections into the section, `Commit at Handoff` and `Session Type` into fields, and a `Blockers` that is not
      `[none]` into the prose; it drops `Working On`, `Next Task`, and `Last Completed`, and writes no
      `State at Handoff`, so the first handoff after the flip takes restating's existing baseline-unknown fallback.
5. **The task list** — settled (Owner, 2026-10-09).
    - **Its parser is `lib/task-list/`** plus the write-time rules: the scanner (`scanTaskListStructure`), the cursor,
      and segmentation are already a pure library that delivery, locus, lifecycle, and `arc view` import, with no
      storage coupling and so no consumer-map rows of their own. Its one file-backed reader
      (`resolveTaskListCursorFromFile`, `lib/task-list/file-cursor.ts`) reads the task list from disk by path and
      reroutes with its caller, locus's `lib/locus/subject-meta.ts`. It keeps today's markers (`[ ]`, `[x]`, `[~]`) and
      identifiers (`N.M` parents, `N.M.a` subtasks, `ParentTaskIdSchema`), and takes the task-numbering check (§ Record
      kinds).
    - **One cursor:** `resolveTaskListCursor` (`lib/task-list/cursor.ts`) is the next task, the only one now that item 4
      retires the meta's `Next Task`. Locus reads it for session-init, recovery, and the compaction seed; lifecycle for
      `arc reopen`, with `resolveLastCompletedTask` for `arc publish`; delivery for `arc attest`, which also reads
      `resolveLastCompletedTask`, and for entry inspection (`lib/delivery/entry-inspection.ts`) and
      `handlers/delivery-execution.ts`, the latter `delivery-observe-attest`'s; status for `arc view`; and the
      pre-commit stage check (`validate-meta-spec.ts`) until the flip, when the meta's write check takes its rules (item
      11) and the cutover removes the hook (key 28).
    - **Write-check rules against the prior version (item 11):** a completed task keeps its identifier (§ Record kinds)
      and its `_Goal:_`. Delivery binds a digest of each parent task's Goal (`extractTaskGoalInventory`,
      `lib/delivery/task-inventory.ts`), the template calls a Goal protected across completion, and a Goal is
      pre-commitment text, amended forward by `_Retired in:_`; today only prose holds it.
    - **A task leaves open only through the close verb,** completed (`[x]`), as D16 has it, or deferred (`[~]`), which
      this item adds, since a deferral slips past the task gate as a completion would; only completion records task
      captures. Open tasks and future phases stay the owner's to restructure.
    - **The header's `Design`** names one of the meta's `Design` entries, which delivery's coherence check compares
      (`handlers/delivery.ts`).
    - **The delivery plan** stays a section of the task list that delivery's verb owns: only `arc delivery compose`
      writes between the `arc:delivery-plan` markers (`lib/delivery/task-list-render.ts`), and the write check refuses a
      hand edit there (item 11), while the unmarked provisional `## Delivery Plan` used while authoring stays editable.
      Whether the plan leaves the task list for a delivery record is `delivery-observe-attest`'s, with the delivery
      family's kinds.
    - **Lifecycle's own:** verify's Success Criteria checkboxes and the task list's completion notes. Until the flip,
      hand edits and the pre-commit checks stay as today; the write-time rules arrive with the store write path.
6. **The lineage record** — settled (Owner, 2026-10-09). The contract makes it create-only (D3, D8) and keyed by its
   origin's UID in the registry ref (D10), written from the flip by decomposition and abandonment alone (D5). Today's
   record (`TransitionRecordSchema`, `lib/work-unit/transition-record.ts`) holds the origin's slug, a kind, successor
   slugs, and incoming edges, each a dependent replaced by named members or dropped with a reason.
    - **Rename leaves lineage at the flip.** Its readers move to `lookup`'s former slugs: locus's reconcilers
      (§ Locus), delivery's plan resolution (`lib/delivery/plan-resolution.ts`), and a dependent's `retarget`
      disposition (`transition-disposition-query.ts`). Until then rename transitions stay the in-repo arm.
    - **References are UIDs, each with its name at the transition** — the origin's and each successor's — by item 3's
      rule for records only verbs write; the name serves display and reverse lookup of a retired origin's slug.
    - **It carries the whole redistribution:** `incoming`, today's edges, and `outgoing`, each of the origin's own
      prerequisites with the members that take it, which the rehearsal found missing (§ Decomposition). Abandonment
      keeps no successors or edges, and its dependents read an `abandoned` disposition from its kind, as today.
    - **`incoming` instructs the dependents the cut cannot write.** The cut rewrites the dependents it may write —
      provisional and planned stubs, which anyone grooms — while an in-flight or parked dependent's meta stays with its
      owner (D13), who applies its disposition at the work unit's own reconcile (`TransitionDispositionQuery`,
      `side-effects/discharge-dep-edges.ts`), after `arc resume` for a parked one. An in-flight dependent does so today,
      while today's cut rewrites a parked one's meta on base (`transformDependentMutationExclusions`,
      `transform-coordination.ts`).
    - **Record kinds owns the kind and its writer,** which decomposition's cut and lifecycle's abandonment write
      through. Teardown reads it as the retirement receipt, locus's reconcilers for terminal outcomes, `lookup` by
      lineage origin, dependents at their reconcile, and status, so a decomposed origin reads as decomposed rather than
      in flight.
7. **The cohort document** — settled (Owner, 2026-10-09). A prose record owned by its cohort, which carries a UID (D2,
   D10), with one home under `backlog/planned/<cohort>/` until the cohort closes (D13). Record kinds owns the kind
   (`cohort/document`, `lib/store/registry.ts`) and its parser; everything beyond its two parsed fields stays prose.
    - **`Purpose` is required.** The write check refuses a new or changed cohort document whose Purpose is empty or the
      `—` sentinel decomposition's scaffold writes, as the consistency check does today (`hasPurposeFloor`,
      `lib/active/cohort-consistency.ts`), so a cut's batch carries an authored Purpose; the parser reads any value,
      since write-back skips a file its parser rejects (D13, item 8); which bytes the cut composes and which its author
      writes is § Decomposition's.
    - **`Parent` is the cohort's stored nesting, and the path its projection.** The store keys a cohort's document by
      UID (D10) and keeps no path, so the document's own `Parent` line is the one stored statement of where it nests, as
      a member's folder comes from its `Cohort` field (D5). The parser accepts it omitted or `[none]` for a top-level
      cohort, or the backticked parent — the shapes the template and the repository's documents use — and the write
      check (item 11) refuses a parent that names no open cohort, or that would nest past the cap, counting the cohort's
      own subcohorts; a `Parent` change that leaves an open member's `Cohort` disagreeing; and a member's `Cohort` path
      that disagrees with its cohort's `Parent`. No verb re-parents a cohort: decomposition writes `Parent` only into a
      new cohort document (`renderV3IncompleteCohort`, `decompose-v3-topology.ts`), and rename's reference sweep touches
      no `Parent` line (`planRenameReferences`). Until the flip the path is the truth, and record kinds moves
      decomposition's two checks, which compare a document's `Parent` with its path when a cut touches it, onto the
      parsed field: its topology check (`structurallyMatches`, `decompose-v3-topology.ts`) and its destination check
      (`validateCohortDocumentClaim`, `git-decompose-v3-destination-validation.ts`). It moves decomposition's scaffold
      (`renderV3IncompleteCohort`, in the same topology module), which writes a bare parent today, to the backticked
      form. Those changes land with the parser's registration, which first converts the repository's bare-`Parent`
      documents — this cut's own `cohort-storage-seam.md` among them — as the meta kind converts its bullet-form metas
      before its fallback retires (§ Record kinds): a scaffold changed alone fails its own topology check, and no reader
      accepts the bare form. The template's "convenience pointer" note changes in the flip rewrite.
    - **Anyone with write access to the project edits it,** as anyone grooms a backlog stub (D13), through three-way
      line merge (D6). D13 fixes the document's home but not who edits it. Each member's own section under
      `## Members` stays that member's by convention, which is what lets parallel writers merge cleanly; nothing
      enforces it.
    - **Writers:** decomposition's cut creates a top-level or subcohort document, backfills a subcohort's missing parent
      (`planTopology`), and appends its fan-out block to a parent at the nesting cap (`planAtCap`), or a person creates
      one by hand; rename's reference sweep rewrites a renamed member's references and section heading in rename's batch
      (`rewriteCohortMemberHeading`); and archive closes it. **Readers:** locus's frame and session-init's cohort load
      (`resolveActiveCohortDocPath`, `lib/session-init/cohort-doc.ts`), which `arc view cohort` shares; `arc status`,
      through the frame's `cohortDocPath`; decomposition's topology check; and readiness.
    - **Its life.** A `Cohort` value names an open cohort (item 3), and the document keeps its one home while any open
      member names it. Archive closes it when the cohort's last open member archives: it joins that quarter's archive
      ref beside the member, as today's `NNa` and `NNb` sidecars do (`sweepCohortDoc`, `sweepNestedParentDoc`), a nested
      parent once its subcohorts close. Readiness's closeout facts (`cohortCoordinateFacts`,
      `scripts/review-gate/readiness.ts`) read that placement through the store rather than probing the planned path.
    - **The consistency check's three conditions,** whose hook goes at the cutover (key 28): (a), a member's `Cohort`
      matching its folder, goes, since the projection derives the folder from the field; (b), every cohort folder
      holding a document with a Purpose, becomes the write check's rule that a `Cohort` names an open cohort (items 3
      and 11), plus the write check's Purpose floor; and (c), member sections naming only members, becomes a report
      rather than a refusal: a check over the document's member headings, read from its prose (`memberSlugs`,
      `lib/active/cohort-consistency.ts`), and its members' parsed `Cohort` fields, surfaced by status and session-init
      and built by record kinds, so one stale section never blocks another writer's save. That revises the map's end
      state for `lib/active/cohort-consistency.ts`, a consistency check over cohort records and the meta's `Cohort`
      field; `operational-state-docs` keeps only its pre-cutover fix to (c).
    - **Until the flip** the hook checks, the sidecar sweeps, and readiness's path probes stay as today.
8. **Parsed prose fields** — settled (Owner, 2026-10-09). Drafts and specs open with `Origin` and `Purpose` bullets,
   the `brief` spec with no Purpose; a paired spec's halves are companions named `spec-prd` and `spec-rfc`
   (`lib/store/in-repo/paths.ts`); notes and other companions carry no fields.
    - **`Purpose` is the one parsed field** of the draft and spec kinds and of a paired spec's two halves: the field's
      text, a list item or a bare line but never a heading, its wrapped lines joined by single spaces, or none when the
      field is absent. Notes and other companions get no parser, so the contract lists them with content and versions
      but no fields (D5).
    - **These parsers never refuse.** A draft or spec with no Purpose, the `—` placeholder, or a half-written edit
      always persists, since write-back skips a file its parser rejects (D13), which would leave a draft being written
      unsynced. Reading an empty value or `—` as no purpose stays in status's purpose read, as `inbound-routing-method`
      specifies (its D11); the cohort document's Purpose differs because it is the cohort's floor, which its write check
      enforces (item 7). Nothing requires a design's Purpose: a stage that ever needs one checks it in its verb, such as
      `arc finalize`, never in the parser.
    - **Record kinds owns the kinds,** as it owns the work item's other kinds (item 1). The owner writes them by hand
      (D13), decomposition's scaffold copies the origin's draft or spec to each member (`scaffoldSource`,
      `decompose-v3-repository-plan.ts`), and rename's reference sweep rewrites them. Status's purpose read and `design`
      selector read Purpose (§ Status and roadmap), provisional on `inbound-routing-method`; decomposition reads only
      the meta's `Design` for its planning profile (`inferPlanningProfile`).
    - **Left unparsed:** the title line, since a work item's identity is its name and UID (D2), not its heading. Rename
      retitles only an exact self-title on the first top-level heading, `# Draft: <slug>` or a spec's
      `# Spec (<form>): <slug>` (`ARTIFACT_SELF_TITLE_RULES`, `rename-reference-sweep.ts`), skipping any other title,
      and decomposition only a first line holding the origin slug (`retitleScaffold`), each a text edit in its own
      batch; 108 of this repository's 142 backlog and active drafts carry a display title neither touches. Decomposition
      does refuse a scaffold whose first line is not a top-level heading (`scaffold-title-missing`,
      `decompose-v3-repository-plan.ts`), a check that stays in its verb. `Origin`, which repeats the meta's base field
      (item 2) and has no reader. And the spec form, which only title labels carry.
9. **Entry managed fields** — settled (Owner, 2026-10-09), provisional on `inbound-routing-method`. The contract settles
   `_Id:_`, eight hex characters stamped at capture or else at first persist (D6; `stampEntryIds`,
   `lib/store/concurrency/stamp.ts`); the `_Routed:_` line on a surviving entry and the routing receipts; the Errand
   queue that replaces `_Disposition:_ execute-bound`; and `_Hold:_` as the retain escape hatch only (D11).
    - **One grammar for every entry list** — the personal and project inboxes, `WORKING-MEMORY`, a work unit's inbound
      list, and an Errand's description. A managed field is ``- _Name:_ `value` ``, its backticked value marking it
      parsed, as today (`inbox-reminders.ts`), grouped apart from the bare prose descriptors (§ Locus). One module
      defines each field once, and each kind's parser admits the fields it uses. Locus owns the module, the inboxes, the
      drain, the routing verb, and the inbound list and Errand description kinds, whose parsers admit the module's
      fields and whose writers the routing verb uses.
    - **`_Created:_`** (`YYYY-MM-DD`) is the date the entry entered its current list: capture stamps it in an inbox, and
      the routing verb restamps it in an inbound list or an Errand's description, since the capture date has no reader
      once the entry leaves the inbox. The reminder nudge reads it, and so does the back-pressure slot for the oldest
      pending inbound entry's age (§ Locus). From the flip the date leaves today's prose `_Routed from:_` line, which
      keeps naming the origin, with the entry's ID (D11); that amends the line's `routed from <origin>, <date>` shape in
      D11 and in `inbound-routing-method`'s D4, and a capture routes the change to `storage-cutover`, whose flip
      rewrite takes that work unit's from-the-flip binding as its target (§ Locus).
    - **`_Remind:_` and `_Hold:_`** (`true`, or absent) stay personal-inbox fields: capture writes `_Remind:_` and the
      drain `_Hold:_`, and session-init's nudge and routable count read both (`inbox-reminders.ts`, `inbox-state.ts`).
    - **`_WU_Target:_`** is a slug with an optional `(planned)` or `(provisional)` hint, or `TBD`, on Work Unit
      captures. Capture writes it, the drain's gate reads it as its first candidate, and the user-reference reconcile
      rewrites a former slug (`user-reference-reconcile.ts`). It keeps its name: entries drain, so
      `naming-conventions`' rename rewrites only the live ones.
    - **`_Shapes:_`** names the decision or section of its target that the entry shapes, on Work Unit captures and
      inbound entries. Capture or the drain's gate writes it, and the gate and the owner read it. It is parsed from the
      flip and stays a prose descriptor until then.
    - **An executing work unit integrates its inbound entries** as it does any discovery within it (`DEV-RULES.ARC` §
      Route by urgency × isolation): session-init shows the pending count and the back-pressure offer, and the owner
      folds each entry into the task list as a new task or subtask (item 5), or re-routes or dismisses it. Nothing stays
      held when a work unit leaves: the write check refuses moving it to Integrating (`arc publish`, `runPublish`) or to
      the archive, or retiring it by a cut or abandonment while entries remain, naming them (item 11), as planning
      readiness confirms none is held. Before a cut the owner folds each held entry into the origin's draft or spec,
      whichever the cut copies to every member (a spec through `amend-design`), or re-routes or dismisses it; before an
      abandonment, re-routes or dismisses it. The routing verb then treats an Integrating work unit as it treats a
      completed one, as no routing target, so a late concern goes to a follow-on, or the owner reopens the work unit
      (`arc reopen`). That amends `inbound-routing-method`'s D2, where only a completed work unit is no routing target,
      and a capture routes the amendment to `storage-cutover` beside the `_Routed from:_` change. Until the flip,
      hold-and-route stays as today.
10. **The archive sequence** — settled (Owner, 2026-10-09). The contract makes it a label people read, never identity
    (D2): a work unit's order among work units in its quarter's archive ref, assigned under that ref's compare-and-swap,
    which replaces the archive index, and output only — archive names the quarter, and reads and listings return the
    sequence in the placement (D5, D10).
    - **No counter record.** The sequence lives in the archived work item's placement. Lifecycle's archive names only
      the quarter, and status's archive listing (key 06), a derived view status builds rather than reroutes, reads the
      sequence from the placement a listing returns; the shipped-work readers on `completed-index.ts` move to placement
      and `lookup` as their members reroute them — the stale-worktree sweep, retired-subdir detection, the orphan-branch
      sweep, and locus's derived evidence (`lib/locus/derived-evidence.ts`) with locus, and teardown with lifecycle —
      while the user-sync commands and base drift's adapter (`lib/base-drift/current-adapters.ts`) are removed at the
      cutover instead. The registry's record-number counters serve other counters.
    - **Never reassigned:** gaps are allowed, so an archived work item's folder never moves. The format stays
      `ArchiveSequenceSchema`'s (`01` to `09`, then any width). A closed cohort takes no number of its own; its folder
      borrows its final member's, with `a` or `b` (item 7).
    - **Closed Errands** stay as the contract has them: stored in the quarter's archive ref unnumbered, in a folder
      named for the branch, never projected into `completed/` (D13), and read through `arc view <slug>` (§ Status and
      roadmap). A listing of closed Errands orders by the record's close time (`updatedAt`,
      `lib/errand/identity-record.ts`). Pull-request numbers are no ordering key: a work unit has several, a host-less
      repository has none, and they order by opening rather than completion; the pull request is the change-request
      link (A3).
    - **Until the flip** archive keeps taking one past the highest number in its checkout's copy of the quarter
      (`computeArchiveDestination`), which let two parallel archives both take 31 in `2026-q3`. An execute-bound Errand
      (`USER-INBOX § Errand`, "Renumber the duplicate 2026-q3 archive entry and refuse a repeated archive number")
      renumbers `31_wu-rename` and adds a commit and CI check refusing a repeated number within a quarter; the cutover's
      deletion pass removes the check with the scan, since the store's compare-and-swap assignment rules a repeat out.
11. **The write check** — settled (Owner, 2026-10-09). A parser sees only a record's content (`RecordParser`,
    `lib/store/registry.ts`), so it cannot refuse what the items above have persist refuse. A kind with such rules
    registers a write check beside its parser, given the record's reference — its UID and its slug after the batch — the
    prior parsed record, the next one, the writer, and a read-only view of the store, and refusing with the rule it
    breaks. The parser stays content-only and refuses nothing a stored record already holds, so `list` and `read` keep
    returning parsed fields with no prior version to supply. Record kinds adds the check's slot to the registry
    (`createKindRegistry`) and builds its kinds' checks with their parsers, and the Errand record's, which carries only
    item 3's slug rules while the record's schema stays the contract's.
    - **A rule checks what the write changes:** a new record whole; otherwise the fields, sections, and task lines that
      differ from the prior version. A value that predates a rule, or was valid when written and has gone stale since —
      an edge now ambiguous, a dependency retired — keeps reading and is reported by its readers (item 3); it never
      refuses an unrelated write.
    - **Authority rules bind a hand edit:** it may not change a verb-owned field (item 1) — a task's completion or
      deferral among them, which only the close verb makes (item 5) — or edit between the delivery-plan markers (item
      5).
    - **Integrity rules bind every writer:** a new or changed `Depends On` edge resolves to exactly one record, live
      record first, and a batch giving a work item a slug refuses one any record holds as a former slug, and refuses
      while an in-flight or parked work unit's meta holds an edge naming that slug for another record or such an edge
      has no disposition (item 3); a new or changed `Design` entry is the work item's own, two at most (item 3); a new
      or changed cohort document has a Purpose (item 7); a meta write leaving a work unit in flight, the hook's scope
      today (`ACTIVE_META_PATH`), that moves it there or changes its `State`, `Current Workflow`, or `Design` keeps the
      three consistent (`checkCurrentWorkflowConsistency`, `lib/active/current-workflow-consistency.ts`), and one that
      sets `prepare-work-unit`, or changes `Task List` there, needs a task list that resolves and holds no open task,
      read through the view (`validateCurrentWorkflow`, `scripts/validate-meta-spec.ts`; item 5); a new or changed
      `Cohort` names an open cohort and, as `parent/child`, agrees with the child cohort's `Parent` (items 3 and 7); a
      changed cohort `Parent` names an open cohort, nests no deeper than the cap counting the cohort's own subcohorts,
      and leaves every open member's `Cohort` agreeing within the same batch (item 7); a completed task keeps its
      identifier and its `_Goal:_` (item 5); and a meta write moving a work unit to Integrating or to the archive, or a
      lineage record retiring one, refuses while its inbound list holds entries, naming them (item 9).
    - **Shape rules bind every writer too:** a new or changed meta keeps its closed field block (§ Record kinds); and
      over the task lines a write adds or changes, the task list's numbering and descriptor rules (§ Record kinds), a
      diagnostic over the whole plan, such as segmentation, refusing only when the prior version's scan did not report
      it, matched by its `code` and its message less the `path:line` prefix, so a line shift above it changes nothing
      (`TaskListSegmentationDiagnostic`, `lib/task-list/segmentation.ts`). The archived records that predate them read
      unchanged. The meta's Completion Notes and Release Notes Entry rules stay readiness's (item 3).
    - **The writer and the view.** The writer is the batch's caller provenance (`CallerProvenanceSchema`'s `verb`,
      `lib/store/links.ts`), or a hand edit when `storage-projection`'s write-back or `arc save` persists an edited
      file. In a batch the view is the store with the batch's other writes applied, so a cut creating a cohort document
      and the members naming it, or a rename rewriting a slug and its dependents' edges, is checked against the state it
      produces and never refuses itself.
    - **Where it runs.** From the flip every store write runs its kind's check, in the ref backend's write and batch
      path, since each backend validates its own writes today (`lib/store/in-repo/write-admission.ts`), and write-back
      and `arc save` call it with a hand edit as the writer. That amends D13's mechanism, under which each kind's parser
      refuses a change to a field only a verb may set: the refusal moves to the write check beside it, and captures
      route the obligations to `storage-ref-backend` and `storage-projection` at draft close (§ Inbound dispositions).
      Until then hand edits and the pre-commit checks stay as today. Moving state between backends runs no rule: the
      migrate verb (D14), and the one-time import whether that is the verb or a one-off tool, carry records today's
      checks admitted, unchanged, so archived records that predate a rule or name a closed cohort import as they are.
      The held-entries rule reads the inbound list through the view against item 9's settled schema and finds nothing
      until locus registers the inbound kind at the flip, so record kinds builds it with no edge on locus.
12. **Prepared writes** — settled (Owner, 2026-10-09). The writers that reconcile a work unit's artifacts —
    `handleWuReconcile`, activation's and publication's reconcile (`runActivate`, `runPublish`), dependency discharge
    (`dischargeDepEdges`), `currentWuReconcile`'s apply, rename's reference sweep, and decomposition's finish and
    retirement — acquire the whole artifact group, the meta, task list, and prose companions, plus a cohort document
    where the plan selects one, never the meta alone. Each revalidates every prepared input by its exact record version,
    or by `changes` restricted to those inputs, refusing or restarting on a mismatch, then applies every prepared edit
    and removal in one `batch` with expected versions (D3). Freshness binds the versions of the records it covers, or
    restricted changes since its anchor, never the store's whole state version (D2). Lifecycle owns the protocol;
    decomposition and locus follow it for their writers.

Stays with its member: the review family's schemas and the working-state split (delivery and review); personal surfaces,
claims, the inbox listing verb's name, and the growth and contention tripwires' bounds (locus); the close verb's name
and placement, the Class verb's name, and how `arc start --from` takes a seed (lifecycle); ROADMAP and the derived views
(status). Where these touch another member — archive retiring Candidate records, the workspace handing adversarial
passes to review records — the touchpoint is a row in a member, not a schema decision.

### Seam setup, before any member starts

Errands land after the contract and before the members:

- **The file splits.** Four shipped after the contract landed: `handlers/status.ts` (PR #812),
  `lib/work-unit/executor-context.ts` (#818), `handlers/lifecycle.ts` (#826), and `handlers/review.ts` (#827). The
  `scripts/review-gate/readiness.ts` split was dropped: its map row shares it with delivery alone, and delivery and
  review are one member, so no member line runs through it. The map rows members inherit for the four split files still
  name the pre-split paths, and each member re-points them to the new modules when it plans. A split a member later
  needs becomes a review chunk of that member.
- **The import ratchet.** Restrict imports of the raw state helpers — meta parsing, the composed lifecycle index,
  Git-tree reads, the Candidate and transition record stores, the Errand snapshot and transaction, and the inbox writer
  — to `lib/store/`'s in-repo backend, and literal surface names and path fragments (`USER-INBOX`, `ATOMIC-INBOX`,
  `ROADMAP`, `STATUS.USER`, `.arc/active/`, `meta-`) to the layout resolver. Both legs are new rows in the
  architecture-ban table (`eslint.config.js`, composed by `eslint/architecture-config.ts`), beside the module-local
  predicates of `eslint/architecture-imports.ts`, with today's callers recorded in `eslint-suppressions.json` as a
  floor, as the size gate records its own. New bypasses then fail lint, each member shrinks the floor, and "every reader
  and writer through the contract" is the floor at zero. The helper set derives from the consumer map. It adds no stored
  record, and the cohort's pull-forward filter, which governs delivery and review work only, does not apply to it.
- **ADR-022 to Accepted**, whose file-as-record amendment ties its flip to the seam's kickoff, since the seam builds
  the family parsers; it takes the reviewed lane. It carries re-pointing ADR-022's retired
  `cross-machine-sync-coherence` references (§ Risks, § Coordination) to `partial-push-marker`. The same slug elsewhere
  — ADR-027 and several backlog drafts — re-points per reference, to whichever successor owns that dependency.

### Cross-member coordination

Moves into `cohort-storage-seam.md` at the cut.

- **Today's behavior until the flip.** Every member reroutes onto the in-repo implementation with no observable change
  (the contract's Goal 3). Behavior that needs state off the checkout's branch keys on the contract's one capability
  inside CLI verbs, never in workflow prose (D15); workflow text changes once, in `storage-cutover`'s flip rewrite.
  Today's behavior includes the contract's fail-closed observations (A10, A12–A14): an incomplete Git observation never
  stands in for absence, an empty tree, or reconciliation authority, and a rerouted caller keeps that distinction.
- **Prepared writes** are shared decision 12, lifecycle's; decomposition's and locus's reconciling writers follow it.
- **Moves, archive, rename, and links.** The in-repo implementation refuses each `unsupported` (D4, D8). The refusals
  for moves and archive name the verb that serves them until rerouted (`lib/store/in-repo/write-admission.ts`); the link
  refusal names only today's lifecycle or code-link verb, and a UID-carrying rename's points to `lookup` or another
  backend (`tracked-identity.ts`). A rerouted verb therefore keeps today's move, archive, or rename code as its in-repo
  arm, branched on the capability, and writes placement or a new name through the contract only off-branch.
- **Parsers and field schemas.** The member owning a kind registers its parser in the registry's slot
  (`createKindRegistry`), sets the kind's field schema and which verb writes each field (D5), and builds its field
  writers and any write check (§ Shared decisions, item 11); a member whose verbs write another member's kind adopts the
  owner's writers, never registering its own. Record kinds owns the kinds items 1–8 settle (§ Six members), locus the
  inbound list and Errand description (item 9) and the personal surfaces', and delivery and review the review family's.
  The contract already registers the meta parser (`createInRepoContext`, `lib/store/in-repo/context.ts`), which record
  kinds takes over, and the Errand record's schema.
- **The write check** is shared decision 11, record kinds'; every member whose verbs write a checked kind runs through
  it, and `storage-ref-backend` and `storage-projection` call it from the flip.
- **The machine-local set.** `MACHINE_LOCAL_PATHS` (`lib/store/registry.ts`) names the identity's `.internal/` folders
  and, in the common Git directory, `.notes.lock`, `.machine-id`, and `arc/**`. `quality-gate-hooks`' reuse record
  falls outside it: each worktree's own Git directory holds it (`.git/arc-checks/`, `.git/worktrees/<name>/arc-checks/`;
  `spec-quality-gate-hooks.md` D5), and it is never stored, synced, or projected. The first member to edit the registry
  adds a per-worktree Git-directory root with that pattern. Only tests read the set today, so the entry keeps the
  inventory complete for the projection and backends that will enforce it; it fixes no failure.
- **Session-init slots.** Every slot a member rebuilds gets its full schema, the obligation `cli-session-envelope`
  routed to the cohort tail: `WorkUnitStateResult`, `ErrandStateResult`, `UserSessionInitStatusResult`,
  `userReferenceReconcile`, `DerivedLocusFrame`, `currentWuReconcile`, and `StaleWorktreeSweepResult`. Session-init
  reads stay narrow — through the contract, without reshaping the prose conditionals `composable-workflows` will
  replace.
- **Shared files.** A file two members both rewrite names the other under the map's Shared with; beyond the shipped
  splits above, the members serialize on that file.
- **State paths (key 13).** Each member reroutes the hand-built work-unit state paths and work-unit-kind layout-resolver
  calls among its rows: callers ask the contract for a record or its projected path, so `resolveArcPath`
  (`lib/layout/projection.ts`) stays the one layout authority, and the ref backend later replaces the implementation
  beneath it with no caller changing. Each member re-derives its exact sites at planning, with
  `lib/delivery/from-branch.ts`'s basename classifier (lines 555–559 at `7ddab4979`) under lifecycle classification
  rather than counted as a path build. The recount's per-file list seeded the map's key-13 rows, so members start from
  those rows; the register's count stays as dated evidence.
- **Ordering the flip carries (D15).** ROADMAP's removal runs in order: every path that writes, renders, or checks it
  stops on the capability; the flip rewrite drops the hand-render steps; the deletion pass removes those arms, the
  pre-commit assert, the conflict remedy, and the merge driver. The integration checkpoint binds the lifecycle records
  it attested plus the code head, and `merge.ts` compares those, before the flip. The inbox writer's lock moves onto the
  contract's per-surface write serialization before the notes-lock code is deleted.
- **Tests** of rerouted code keep their local doubles; the shared scripted `GitExec` fake and `GitProcessError`
  fixture from `cli-substrate-complete-migration` serve the rewrites.

## Members

### Record kinds

The record kinds every other member writes or reads, built first.

- **What it builds.** The parsers, field schemas, field writers, and write checks (§ Shared decisions, item 11) of the
  kinds items 1–8 settle — the meta, task list, draft and spec with a paired spec's halves, lineage, and cohort document
  — registered in the registry's parser slots (`createKindRegistry`, `lib/store/registry.ts`), with the write check's
  slot beside them, and the Errand record's write check (item 3). It also builds condition (c)'s report over the cohort
  document's member headings and its members' `Cohort` fields (item 7). Notes and other companions get no parser (item
  8). Its decisions are settled here, and every other member's `Depends On` names it. It inherits no map rows, though
  its kinds replace or extend modules some name: those for `meta-reader.ts` and the transition-record store and writer
  in lifecycle's partition, and `descriptor-worktree.ts` in status's, reroute callers and stay with their members. It
  also edits the two modules decomposition's key-49 rows name for its `Parent` checks (`decompose-v3-topology.ts`, which
  holds the scaffold too, and `git-decompose-v3-destination-validation.ts`), moving them onto the parsed field (item 7),
  while those rows stay decomposition's; and `lib/active/cohort-consistency.ts` for the report, whose row stays
  lifecycle's.
- **The meta kind's parser.** It keeps the shipped `identifier-list` value class (`formatValue` and
  `normalizeIdentifierListValue` in `lib/active/meta-reader.ts`), which renders each element backticked and parses the
  list back, under existing tests. Retire the legacy flat-bullet fallback — `parseCoreTable` returns null for a meta
  with no core table, and `parseMetaProjectionRecord` then scans bullets — so table-absent core fields fail loudly: the
  pre-public-release posture adds no compatibility readers, and ADR-022's file-as-record amendment leaves no
  record-to-Markdown import for it to serve. Five archived metas still use the bullet form — `completed/2026-q2/` 10
  through 14, `work-organization-reform`, `worktree-foundation`, `errand-enablement`, `work-routing-discipline`, and
  `in-flight-awareness` — so the same change converts them to the core table first, then retires the fallback (Owner,
  2026-10-09). Never the reverse: the deciding lifecycle inventory refuses when any meta fails to parse
  (`requireCompleteInventory` in `lib/store/lifecycle-storage.ts`, A9), so retiring first would refuse every work unit's
  checkpoint and merge.
- **Content rules leaving the hook checks** land in the family write checks (key 28), each over the lines a write adds
  or changes (§ Shared decisions, item 11): the task-numbering hook and `lint:md`'s descriptor rules skip the archive
  today, and three archived task lists in `completed/2025-q4/` carry numeric third-level identifiers. The pre-commit
  `task-numbering` check moves into the task-list kind's write check, beside its rules that a completed task keeps its
  identifier and its `_Goal:_` (item 5), compared with the record's prior version rather than `HEAD`, while open tasks
  and future phases stay freely restructurable. The identifier rule holds whatever the footer policy (`ghost-mode`):
  task captures are keyed by task ID (D3; `taskCaptures` in `lib/store/links.ts`), so a renumbered completed task would
  orphan its captures. `hooks.task_numbering`, which sets the hook to `error`, `warning`, or `off`, retires with the
  hook at the flip, since the write check reads no configuration. Stored-task validation from `lint:md:descriptors`
  (`selectTaskDescriptorPaths`, `runWorktreeTaskDescriptorLint`) moves in too, its segmentation diagnostics
  (`scanTaskListSegmentation`) spanning the whole plan, so the write check refuses only one the prior version's scan did
  not report, matched without its line (item 11); the shipped task template and tracked non-state task documents keep
  their worktree and index checks. `validate-meta-spec`'s stage rules — for a work unit in flight, the stage consistent
  with `State` and `Design`, and `prepare-work-unit` with a task list that resolves and holds no open task — move into
  the meta's write check (item 11). Its field-shape rules each take a home. The closed field block — an H1 and a later
  standalone `---` delimiter, which the field writers need to anchor a write (`validateMetaFieldBlockShape`), with a
  `State` and a `Design` line and no second `State`, `Design`, or `Cohort` line — becomes a meta write-check shape rule
  over a new or changed meta (item 11), never a parser refusal, which A9 would turn into a refused inventory; the four
  backlog metas that broke it were closed on `main` at `acd6ede9c`. The block may also hold sections — completed metas
  carry the Release Notes Entry and Completion Notes that integration composes above the `---` — so record kinds' field
  writers end the field region at its last field line: today `reconcileMetaFields` (`lib/active/meta-reader.ts`), when
  it backfills a missing field, replaces every line from the first field bullet to the `---`, deleting any section
  between. The two-entry `Design` cap joins item 3's `Design` rule; `State`'s four values are the meta schema's
  (`WorkUnitStateSchema`, `MetaRecordSchema`), and only verbs write `State` (item 1); and the `Cohort` path cap is items
  3 and 7's.
- **The cohort document's parser** lands with decomposition's scaffold and two checks moved onto its parsed `Parent`,
  after converting the bare-`Parent` documents (§ Shared decisions, item 7).

### Lifecycle

The transition write path: everything that creates, moves, retires, or archives a work unit's records.

- **Rows and keys.** The lifecycle executor's write path and `arc start` placement with the `provisional-placement`
  callers (30); the lifecycle verbs under `lib/work-unit/verbs/` and graduation; placement as a record field (12);
  lineage — transition records, retirement authority, and direct retirement (01's transition half, 16); archival and the
  archive index, `completed-index.ts` (06, 15); parking (50); record writes completing through a code commit (45),
  publication's among them (`runPublish`, whose reconcile precedes Candidate authorization and the boundary claim);
  Errand promotion (46); the write-context guard and `arc plan check` (51); `arc rename`'s stub-branch leg (56); and
  ending `STATUS.USER` writes on transitions (53, rendered by status).
- **Rename and promotion keep the work item's identity.** A rename is not terminal: the work item keeps its UID and
  records its former slugs, so `lookup` still resolves an old name, and only decomposition and abandonment write lineage
  (D5). From the flip `arc rename` changes the primary's name and aliases, with the edits the reference sweep prepares
  (`sweepRenameReferences`) in the records it may write — its own, provisional and planned stubs, and the cohort
  document — in one version-checked `batch`, while an in-flight or parked dependent keeps the former slug (§ Shared
  decisions, item 3); today's sweep also rewrites a parked dependent's meta on base
  (`transformDependentMutationExclusions`, `transform-coordination.ts`). Until the flip today's rename transition record
  (`lib/work-unit/transition-record.ts`) stays the in-repo arm. Promotion (46) is A5's write: an expected-version put of
  the Errand's primary to its meta role on the same UID, keeping links, description, placement, aliases, and history,
  with the work branch as a second branch link (A3); the in-repo implementation keeps `promoteOrdinaryErrandAtRuntime`
  (`lib/errand/promote-runtime.ts`) and its commit-required settlement until rerouted. A promoted work item projects
  exactly what a fresh start does: its scratch folder and session start's `lookup` reconcile key on the current record
  set, whatever created the item, and the acceptance tests include a promoted item. Today promotion renames the branch
  and writes the meta (`applyLocalEvidence`) but never calls `runUserOpen`, so a promoted work unit gets no workspace or
  `SESSION-NOTES` seed until handoff writes one; no interim fix is planned.
- **Branchless planning, its write half (D17).** Activation creates the work branch at base's tip in the same
  worktree, recorded as a branch link (A3); catching up with base re-detaches and refuses while the worktree holds
  commits not on base; the `plan/` prefix and branch reaping at abandon, retire, and teardown retire for planning work
  units, with `reconcileBranch`'s plan-branch legs and graduation's plan-branch stamping
  (`prepareValidatedGraduationTransaction`). Until the flip, planning keeps `plan/` branches. Re-derive the `plan/`
  mention count (38 non-test source files at `aae999acb`).
- **Session context into the meta (D5).** Archive's clearing of the meta's session-context section and anchors, whose
  schema is record kinds' (item 4), and removing the workspace's close and rename move and the executor's open arm
  (`userWorkspaceHandler`, `lib/work-unit/executor-context.ts`), which runs `runUserOpen` and seeds `SESSION-NOTES` on
  every move into an active location. Locus removes the spawn's `SESSION-NOTES` seed and `arc user open`, and takes the
  session-start scratch reconcile (Owner, 2026-10-09; § Locus). Until the flip the workspace stays as today.
- **Dependency edges.** Keep the shipped policy (`side-effects/discharge-dep-edges.ts`: `Depends On` is the live gate,
  and activation discharges each edge whose dependency is shipped or integrating, with no mirrored lineage field). What
  remains is the edge list as a field of the meta kind's schema (§ Record kinds). Lifecycle state by slug
  (`arc status <slug>`) and lifecycle-complete cohort membership (`lifecycle-membership.ts`) re-home onto the
  identity-keyed index; the cohort validator's condition (c) becomes record kinds' report (§ Shared decisions, item 7).
- **The Class verb (§ Shared decisions, item 1).** One verb writes `Class` at any stage by `classify-work-unit`'s
  confirm-or-ratchet, as `arc set-stage` writes the stage, beside the shipped `--class` flags. The flip rewrite moves
  onto it each workflow step that hand-edits `Class` where no flag covers it; until then those steps stay as today.
- **Resumable transitions.** A multi-step transition completes, rolls back, or leaves a typed continuation the next
  invocation resumes (`DEV-RULES.PROJECT` § Recovery-complete refusals). On 2026-10-07 `arc start quality-gate-hooks`
  spawned the worktree and staged the graduation, then failed its ceremony commit on a pre-commit check and exited with
  no continuation: `commitAndPushStartCeremony` (`handlers/start.ts`) names a retry only for a failed push, and
  `arc start` has no arm that resumes a failed graduation. From the flip the commit leg is gone and the store-write
  transition carries the property; a pre-flip fix would be throwaway unless failed starts recur.
- **The executor closes the workspace after its record writes.** `runUserClose` (`commands/user/close.ts`) removes the
  workspace when side effects fire, before the meta writes that follow in `lib/work-unit/lifecycle-executor.ts`; a throw
  there returns `finalize-failed` with the workspace already gone. Close after the transition's records instead. The
  in-repo implementation refuses a batch spanning substrates, so the close stays a sequenced step until the flip,
  ordered after the records and idempotent on rerun.
- **Retirement as one ceremony.** From the flip a retirement is a store write that every checkout can read, so teardown
  finds the receipt, abandon stages nothing on a protected base, and ROADMAP is derived. The first live abandon
  (2026-07-24, under full protection) instead hit six seam failures between verbs that each did their own part — the
  receipt unreachable from the target worktree, a cascade staged on the protected base, an over-promised ROADMAP row, a
  second Errand to carry the commit, the remote branch left behind, and a hand-rendered ROADMAP — and took three
  Errands, three PRs, and four manual Git operations. Decomposition's retirement hits the same gap: teardown authorizes
  only shipped, abandon, and park-planning evidence (`RetirementEvidenceRef`, `retirement-authority.ts`), so a
  decomposed origin's checkout and `plan/` branch come down only by hand (rehearsal, 2026-10-05), and the lineage record
  is its evidence from the flip. What survives the flip is ref-set reaping: the terminal operation retires the work
  unit's whole ref set, local and remote-tracking, and a multi-match yields a reap plan, not a refusal, preserving
  anything unmerged or carrying unique content. Generalize the Errand case, the zero-delta branch reap clean abandonment
  has run since PR #683, rather than build a sibling; no other work unit owns it (checked 2026-09-19:
  `graduation-cleanup`, `delivery-native-stack-composition`, and `review-checkout-lifecycle` each cover other refs).
  Stale refs are unmonitored at rest today: the in-flight shadowing advisory (`candidate-shadowed`, from
  `in-flight-derivation.ts`) stops firing at archive, exactly when a `plan/` ref becomes permanent residue. No
  cleanup-residue advisory can name a runnable verb until this reap exists — `operational-advisory-registers` holds that
  an advisory with no available action is not raised — so the reap lands first, and the in-flight artifact advisory,
  which has named its remedy for stale local branches since PR #684, then widens to remote-only residue rather than
  opening a third site.
- **Acceptance case for key 56.** A rename invoked from a checkout holding a transient role contributes to that
  transient, with no branch switch (`withRenameStubBranch`, `lib/work-unit/rename-identity.ts`) and no second change
  request.
- **Open.** Settled before the cut, provisional on `inbound-routing-method` (its D2 test 3 and D4): where an executing
  work unit integrates its inbound entries, with the write check refusing publication while any remain (§ Shared
  decisions, items 9 and 11); the inbound kind's schema is locus's. Code identifiers keep today's names until
  `naming-conventions`' rename. Lifecycle's own: the close verb's name and placement (D16), its task captures carrying
  their repository (A6), the Class verb's name, and how `arc start --from` takes a draft or spec seed from the flip. For
  the seed, lifecycle settles whether the start batch imports its content as the work item's own draft or spec or
  refuses a seed the work item does not already hold, since item 3's write check admits only the work item's own
  `Design` entries, and the stage the start enters at; either way a URL seed is refused, as item 3 refuses a URL entry.
  Locus consumes the answer and waits on lifecycle's draft for it (§ Path to the cut): `--from` takes effect only in
  `arc start --here`'s cold start (`runColdStart`, `commands/start.ts`), which § Locus holds (D17) and whose spawn
  scaffold seeds the stage (`scaffoldIntoWorktree`), while the spawning arm accepts `--from` and drops it
  (`handlers/start.ts`). Today the seed's class, `arc-spec`, the only one that sets `Design`, matches the basename of
  any single-token pointer, a path or a URL (`parseSpecInput`, `spec-input-parser.ts`); the cold start stores it as
  given and enters at `draft-design` (`scaffoldIntoWorktree`), where a spec seed fails the stage check
  (`checkCurrentWorkflowConsistency`), so the pre-commit hook refuses the meta when it is committed; and the cold-start
  step names a spec seed among those it takes (`session-init.template.md`). Whether receipt legibility gets a fix before
  the flip, such as teardown resolving evidence from the base checkout, or waits for the flip; abandons are rare and the
  manual recovery is recorded. For a decomposed origin it waits for the flip (Owner, 2026-10-05).

### Decomposition

- **Key 49.** A cut becomes one multi-record `batch` (D3), and the `chore/decompose-<origin>` staging branch with its
  append-only advance over base retires at the flip. Until then the staging branch stays the in-repo arm: decomposition
  branches stay valid write contexts (D4), and the in-repo implementation retires at the cutover (D8, key 51). Re-scope
  the `decompose-core-hardening` subcohort (`decompose-scaling`) against that end state, and coordinate with
  `decomposition-doctrine`, still in planning. The Git modules become pure planning over supplied snapshots of the meta,
  task list, prose, and any cohort document the plan selects, with adapters that acquire them at pinned versions and
  apply the prepared batch (§ Shared decisions, item 12); code trees and ancestry stay Git facts.
- **Its ROADMAP arms (key 18).** The decomposition modules' ROADMAP handling stops on the capability at the flip, in one
  change: the plan's exclusive `roadmap` mutation role (`decompose-v3-plan.ts`), ROADMAP among the planned
  `expectedPaths` (`decompose-v3-repository-plan.ts`) and base advancement's tolerance for it
  (`git-decompose-transition-base-advancement.ts`), and the `roadmap-missing` and `roadmap-current-render` refusals
  (`git-decompose-v3-destination-validation.ts`). Nothing persisted or in flight binds ROADMAP — it reaches only the
  in-process plan identity — so removing it invalidates no record. The planner, pre-commit assertion, and conflict
  remedy render from different input contracts, and the planner stamps the result base's head
  (`git-decompose-v3-repository-plan.ts`) where the assertion and remedy stamp `HEAD` (`project-view.ts`); both dissolve
  with the stored projection rather than being unified first.
- **Inputs from the decomposition rehearsal (2026-10-05).** A five-member retirement rehearsed in an isolated clone of
  `main` at `5f97ed297` did not complete as `decompose-work-unit.md` writes it. Its Git-machinery defects are held
  unfixed, since the flip deletes that machinery, and the cut runs by a recorded workaround procedure; the rehearsal
  kit is in this work unit's workspace. What the member settles for the store version:
    - **Who owns which bytes.** Base advancement requires every planned path to equal the composed after-state
      (`exactTransitionTree`, `git-decompose-transition-base-advancement.ts`), yet the workflow authors destinations
      over those scaffolds. Say which bytes the batch composes and which the author writes, and whether authoring lands
      in the batch or after it.
    - **The record carries the whole redistribution.** The transition record lists only incoming-edge dispositions
      (`decompose-transition-record.ts` builds its edges from `incomingEdges`), so it cannot reconstruct the origin's
      outgoing prerequisites moving to its members. The lineage record carries both.
    - **Checks to carry if their code survives:** a non-canonical completed map refuses as `completed-map` with a
      reauthor remedy (`decompose-v3-execution-preflight.ts`); and a scaffold is retitled only when its first line holds
      the origin slug (`retitleScaffold`). The topology identity check, which rejects `**Parent:** [none]` on a
      top-level cohort and a backticked parent on a subcohort, shapes the repository's cohort documents use
      (`structurallyMatches`, `decompose-v3-topology.ts`), moves onto the parsed `Parent` with record kinds' cohort
      parser, so both shapes pass (§ Shared decisions, item 7).
    - **The workflow's end state** for the flip's rewrite: the planning profile follows the origin's `Design` pointer,
      not the artifacts present (`inferPlanningProfile`); the finish step serves extraction only; a retirement's commit
      footer has no origin artifact left to name; the frontier reads from `arc status --project` or a slug; where each
      mode runs goes unstated, the cut map's JSON shapes now being published (`arc schema get decompose-cut-map`); and
      under a draft profile the member specification review has nothing to review.
- **Edges:** on record kinds, whose meta, lineage, and cohort writers its cut uses, and which moves its two `Parent`
  checks and scaffold onto the parsed field. Coordinate with status on ROADMAP.

### Delivery and review records

- **Rows and keys.** Candidate records and their retirement and withdrawal (01's Candidate half); the Git-history
  supersession read in `candidate-response-confirmation.ts` and `candidate-record-store.ts`, whose `recordRevision`
  becomes a store version (02); a singleton's own record writes staling its publication boundary (34); review and
  delivery writers completing through a code commit (45); readiness and integration reads of lifecycle state (48); and
  the durable review facts of the register's machine-local row — evidence, outcomes, and termini — becoming stored
  records at project scope, the review gate's repository ID mapping onto the project ID; Candidate applicability
  resolution (`handleCandidateApplicabilityResolve`), whose Git staging and commit-selection continuation stay until the
  flip; mechanical applicability carry's before-and-after Candidate reads (`gitCandidateRecordAtHead`,
  `recordsOwnSelection`), which move to `read` and `history` at bound state versions, with the reader's two other
  importers in the review gate, which no map row names (`earlier-review-applicability.ts`,
  `local-review-coverage-selection.ts`); and the review gate's listing protocols over Errands and claims
  (`hosts/local/live-context.ts`, `runtime/respond-composition.ts`; key 62), keeping D4's refusal to authorize review
  from incomplete evidence.
- **From the contract's Part B.** The Candidate review subject becomes the code in the Git index alone from the cutover
  (D18). `collectGitCandidateSubject` (`lib/work-unit/git-candidate-subject.ts`) selects reviewable entries through
  `classifyPathTreatment`, which the cutover removes once its consumers move off it. This member builds D18's export,
  effective at the flip, since until then specs ride the branch: `storage.track_design_docs`, the copy at
  `.arc/specs/<slug>/` that lifecycle's prepublication and candidate-tail steps add, re-export, and delete, and the
  `merge-ok` guard. It also builds the narrow arm that keeps the delete from reopening review. Nothing has it today —
  `classifyPathTreatment` takes a path alone and has no export case — so it lives in subject construction, which knows
  the paths the subject deletes (`absentPaths`): deleting the copy is evidence-neutral, and adding or re-exporting it
  stays reviewable. Completion Notes and the Release Notes Entry come from the stored meta under every export option,
  never from the export or the pull-request head tree (D18), which settles the register row's "integration-time record
  decision". The delivery family's kinds split with `delivery-observe-attest`. Adversarial-pass records (D5): their
  field schema over the review gate's disposition set, approval, rubric binding, and lineage, and the verbs that write
  and render them and compose a later pass's prior findings, held to the one-call bound — the evaluator's report and one
  disposition per finding in; versions, pass number, and lineage derived; the input schema published. The method's
  fire-points switch to those verbs in the flip rewrite.
- **Candidate retirement.** `candidate-record-store.ts` has no deletion path, and archival leaves each record and its
  `.boundary.json` behind (16 files for 8 archived work units when captured). `subject-meta.ts` resolves the record
  live, and the confirmation read takes it from history. Clearing today's files rides the mechanism, never precedes it,
  since a backfill alone re-accumulates.
- **Withdrawal is a recorded fact.** A withdrawn one-member Candidate was observed being rediscovered from surviving
  topology and treated as publishable (captured 2026-09-07); the code path is not yet traced, and the member traces it
  when it plans. Record withdrawal so nothing revives implicitly; a successor needs a new authorized public boundary,
  with history preserved.
- **Retained review decisions versus withdrawn publication authority.** Native `reopen` returns an Integrating work unit
  to Active but keeps its Candidate and stored public boundary, which attestation's `repairCurrent: true` paths can
  carry again, and the same Active-with-public-boundary state also covers an interrupted publish. Decide what an exact
  Owner review decision retains and what deliberate withdrawal ends; trace both paths through their real continuations
  (the reopen transition in `lib/work-unit/lifecycle-transitions.ts`, the attestation callback in
  `handlers/lifecycle-delivery-review.ts`, `PublicationPendingBoundarySchema`); and make recovery and withdrawal
  explicit without discarding accepted decisions or reviving public authority. Coordinate with
  `review-source-authority`.
- **The singleton wedge (key 34).** Records leave the branch at the flip, so a work unit's own writes stop moving its
  head. Before then, a boundary staled by a reason convergence does not satisfy still lands a shipped singleton with no
  Owner-accepted terminus on `resume-pre-publication`, with no continuation: the checkpoint compares
  `candidateSubjectDigest` in `checkpoint-composition.ts`, its `shipped` arm selects `attestNewRootArgv` in
  `checkpoint.ts`, and `refresh-shipped-delivery` is delivery-only. Recovery
  authority binds typed Candidate and lifecycle records, never whether a meta sits under `active/` or `completed/`.
  Never reintroduce an early checkpoint invocation: PR #634 proved it refuses `unsafe-reconcile` before the push and
  `lifecycle-incomplete` before `with-integration` archival. Evidence: PR #629, merged under explicit Owner
  authorization. `delivery-correction-convergence` keeps stacked-delivery convergence (key 35).
- **Errand frontline skip.** The skip marker (`recordSingletonFrontlineInitialSkip`) is keyed by Candidate ID, so an
  Errand's skip leaves no trace, and a head move before any standard-review attempt reopens the phase. Key the marker's
  subject by vehicle lineage — a new record shape, which the cohort's pull-forward filter keeps out of Errands, so it
  rides this member, as its capture said — record it on an Errand's accepted skip, and in the same change rename "phase"
  to "window", the Owner's name for the one-time opportunity before the change request, everywhere at once:
  `frontline-phase.ts` and `frontlinePhaseClosed`; the `frontline-phase` record kind, its operation-id domain, and its
  published schema ID `frontline-phase-state` with the schema-inventory variant (`core/operation-state-schema.ts`,
  `core/schema-inventory.ts`); the `FrontlinePhase*` schema and type names; the `frontline-phase-closed` diagnostic; and
  the driver's `phase-closed` skip reason. Both changes orphan recorded skips, since a marker's ID derives from the
  domain and its subject, so they land together and reopen an in-flight Candidate's frontline once.
- **The stored `verificationKind: "tier-3"`.** `quality-gate-hooks` retires the Tier 1/2/3 names but leaves this value
  in the review gate's stored integration boundary record (`RunConvergenceVerificationActionSchema`) and in `arc
  attest` (`lib/work-unit/verbs/attest.ts`), since renaming a live record's value now would stop records an older build
  wrote from parsing. Rename it when the records reshape, in both places together, to the merge quality gate's name,
  confirmed against `spec-quality-gate-hooks.md`.
- **Open.** How review working state splits between stored facts and machine-local state (D5). For the review gate's
  own namespaces the landed map settles the split by responsibility: evidence, outcomes, and accepted termini become
  project-scope records, while operations, locks, materializations, and quarantine stay under `.git/arc/review-gate/`,
  the mixed publisher (`RepositoryGitCommonStatePublisher`) splitting accordingly; the spec still lists the split as
  left to Part B. What stays open is those records' field schemas, and raw review evidence outside the gate's
  namespaces: archive sweeps the per-work-unit workspace, taking `review-standard-*` chunk reports, aggregate
  results, and evaluator reports with it — lost for good once, when the notes snapshot predated the review. If they are
  evidence, they become stored records; if scratch, `archive-work-unit.md` says so, its teardown-ownership sentence
  excludes the user subdirectory, and `integrate-work-unit.md`'s `arc user close` is named the idempotent backstop it
  is. Also open: whether the archived-singleton continuation ships before the flip — it arises only under
  `archive.cadence: with-integration` — or key 34 closes at the flip; `WORKING-MEMORY`'s checkpoint entry waits on it.
- **Coordination.** `review-protocol-alignment` designs the Owner-accepted terminus's durable form against the
  contract with this member (key 80). `handlers/review.ts`'s split precedes both this member's store swap and the
  planning-lane deletion. Review-lane contracts — pass accumulation across an approved fix, protocol ordering — stay
  with `review-activity-contracts`.

### Locus, session-init, and personal surfaces

- **Rows and keys.** Locus derivation, `DerivedLocusFrame`, from the marker plus the store (33); in-flight derivation
  and the oracle behind `WorkUnitStateResult` and `ErrandStateResult` (29), with lingering refs demoted to locus hints
  (14); the notes-related probes, `UserSessionInitStatusResult`, and user-reference reconciliation (31); the
  `currentWuReconcile` and `StaleWorktreeSweepResult` slots, and `retiredSubdirs` removed or rewritten over the store
  (32); the worktree roster and the single-meta callers on the locus side (47), with the Candidate mutation owner
  (`resolveCandidateMutationOwner`) resolved from the marker plus stored lifecycle facts; state continuity anchored on
  the state version for handoff restating and recover audit (52), beside a retained code-head baseline, never in place
  of it, since code identity, progress, and preservation still validate against Git (D2, D20); `arc user add`,
  `arc init`, and `arc join` creating an identity's first records only when absent (54); `arc errand check`'s overlap
  through a store query for state targets (55, which no consumer-map row cites yet); the drain side of hold-and-route
  (21); the register's session-init path row — slot paths and load-set entries from the layout resolver, and the
  compaction seed's schema version bump; and the Errand index projection in `lib/errand/record.ts` with the locus
  consumers' listing protocols (key 62's surviving half; the review gate's stay with delivery and review).
  `session-init-performance`'s notes items go with these reads (key 10).
- **An identity already in use (Owner, 2026-10-09).** From the flip, when `arc user add`, `arc init`, or `arc join`
  finds the identity's records already in the store (54), it says so and asks the person to confirm the identity is
  theirs; a run that cannot ask reports it in its result. It warns and never refuses, since a slug cannot tell the same
  person's second machine from a second person who chose the same name, and it misses two people who both set up
  before either syncs. Before the flip this repository keeps notes local, so there is nothing to compare against.
- **Errands and claims list apart.** Project-scope Errands and identity-scoped grooming and housekeeping claims are
  acquired separately, each at a pinned version with absent, unreadable, and complete outcomes and per-entry
  diagnostics (`readTransientIdentitySnapshot`); an Errand-only listing never replaces the claim snapshot, and review
  admission still requires a complete listing with no diagnostics (D4, D5, D10).
- **Former slugs.** From the flip the reconcilers (`current-wu-reconcile.ts`, `user-reference-reconcile.ts`) resolve a
  former slug from the live primary through `lookup` and list lineage only for terminal outcomes, keeping their
  unavailable, ambiguous, and cycle refusals; until then they read today's rename transitions (§ Lifecycle).
- **From the contract's Part B.** Lifecycle anchoring and `arc start --here` (D17). Branchless planning's read half:
  locus derived from the marker and the store, the marker's exclusivity guarding the locus. The session-start scratch
  reconcile and the session-notes path session-init's load set and handoff resolve (D5). Removing the spawn's
  `SESSION-NOTES` seed: `scaffoldIntoWorktree` (`lib/git/worktree-scaffold.ts`) writes the meta, calls `runUserOpen` for
  the workspace and its `SESSION-NOTES` seed, and writes the ownership marker; from the flip the meta and its session
  context are written through the store, the `SESSION-NOTES` seed and `arc user open` go, and the marker stays
  machine-local (Owner, 2026-10-09). `runUserOpen` also runs from `arc user open` (`handlers/user.ts`), which
  `activate-work-unit.md`'s workspace step invokes and the flip rewrite removes, and from the executor's open arm, which
  lifecycle removes (§ Lifecycle).
- **Notes policies retire without successor (D12).** `user.notes_push`, `session.init_pull.notes`, and
  `session.init_load.notes` go with session-init's notes recommendations — their policy branches, the notes and
  combined prompts (`composeNotesPromptText`, `composeCombinedPrompt`), and the retired-subdirectory load dispatch —
  while `session.remote_sync`, the worktree and base recommendations, and slot failure isolation stay.
- **Personal surfaces.** The `USER-INBOX` and `WORKING-MEMORY` entry-list parsers, the inbound list and Errand
  description kinds with the entry-field module (§ Shared decisions, item 9), the drain's removal by `_Id:_` and version
  from the flip (by title until then), and the Errand queue from the flip (D11). Entries key on `_Id:_`, the contract's
  concurrency library's key, rather than the bold title `parseUserInbox` keys on today (`lib/user-sync/parser.ts`) or a
  proposed `_Slug:_` field. Removal stays idempotent: a no-op that reports when the entry is already gone, since several
  backstops may replay it. Managed fields group together, blank-line-separated from the prose descriptors (§ Shared
  decisions, item 9). `arc errand open --from-inbox`; the title-matched removals of `arc errand close` and
  `arc user inbox-remove`, both through `removeCurrentInboxEntry` (`commands/user/inbox-mutation.ts`); and Errand
  promotion's digest-checked removal (`runUserInboxMutation`, `handlers/errand.ts`) repoint onto the ID with the parser,
  and the removals onto the entry's version at its compare-and-swap boundary once the notes lock retires. Under partial
  protection an Errand has no portable record or description, so its origin entry stays in the inbox until close removes
  that exact ID at its observed version, and a partial abandon clears the mark and keeps the entry (D5, D11). The inbox
  capture's schema carries `_Shapes:_`, provisional on `inbound-routing-method`.
- **Hold-and-route's drain side (21).** `inbound-routing-method` moves the buffer section, the owner-adoption hold, and
  the coordination-seam rule into the `route-discovered-work` method's until-the-flip binding section, with route-now
  handing off from `arc-inbox` to `arc-errand` (its D7, D8). The flip rewrites that binding section and the hand-off,
  which spans three sites — `arc-inbox`'s route-now step, `arc-errand`'s route shape, and `run-errand.md`'s route-only
  Errand — with that work unit's from-the-flip binding as the target; provisional on it landing as specified.
- **Inbound back-pressure.** A per-work-unit session-init slot reports the pending inbound count and the oldest entry's
  age, with thresholds that emit a recommended action and a precomposed re-triage offer for the drain; it is built with
  the inbound kind and gets its full schema. `inbound-routing-method` specifies it for the flip, and the counts in its
  spec's § Introduction / Context calibrate the thresholds; provisional on that work unit. It has its own register row.
  Record kinds' held-entries rule reads the same kind through the store (§ Shared decisions, item 11) and finds nothing
  until locus registers it.
- **`WORKING-MEMORY` headers fail loudly.** `lib/user-sync/parser.ts` recognizes an entry header only as one line
  matching `^\*\*.+:\*\*$`, so a header that wraps past the line limit is silently folded into the entry before it; one
  sweep found three of twelve entries dropped that way. The kind's parser recognizes a wrapped header or rejects it
  loudly, with a test covering wrapped and colon-less headers.
- **The compaction seed** stays a read-only projection, produced from the session-init envelope by the same shared
  load-set projection (`resolveLoadSetManifest`), never a bespoke parser. Its task cursor is derived from the task list
  and compared against the seed's baseline. It records the state version beside an explicit code-head baseline, resolves
  its meta path through the layout projection, and bumps `COMPACTION_SEED_SCHEMA_VERSION` for both.
- **The archived-but-not-torn-down frame.** Under `archive.cadence: with-integration` the meta reaches `completed/`
  before merge and teardown, and an interruption there leaves a durable role whose subject is `subject-unresolved`.
  Archival as a store write at or after merge (key 15, lifecycle) removes the interval; this repository runs
  `archive.cadence: manual`, where it does not arise. Locus over the store keeps arbitrary missing or ambiguous subjects
  fail-closed. Verification: archive-before-merge restart, merge-before-teardown, partial teardown, retained-control
  finalization, and missing or ambiguous completed-subject negatives, across reader, session-init, and recovery tests.
- **Lingering refs.** PR #660 made shipped lifecycle authority outrank stale `plan/` and `feat/` refs, keeping them as
  cleanup evidence. In-flight derivation over the store makes a lingering ref a locus hint, never lifecycle authority;
  the ref itself retires with branchless planning and lifecycle's ref-set reap. Verify the dependency-discharge consumer
  reads the store's answer. Nothing yet outranks a decomposed origin's lingering ref: while its remote `plan/` ref
  exists, `arc status` reports it `Planning · active` and the next ROADMAP render lists it In Flight beside its own
  members. Both reach `resolveProjectReadinessComposition`, `arc status` through `resolveComposedLifecycleIndex`, and
  its record merge (`mergeProjectReadinessRecords`, `lib/status/project-view.ts`) lets an in-flight meta win when no
  operational record exists. Over the store it reads as decomposed from its lineage record.
- **Open.** Settled before the cut, provisional on `inbound-routing-method` (its D2 test 3 and D4): the inbound kind's
  schema (§ Shared decisions, item 9). The personal-surface families' field schemas. The inbox listing verb's name
  (D11).

### Status and roadmap

- **Rows and keys.** ROADMAP (18): every path that writes, renders, or checks the stored file stops on the capability,
  and rendering reads the store; `roadmap-tooling` keeps the render standard. `STATUS.USER` rendered on demand, any
  cache machine-local and outside the import (53). The archive listing as a derived view status builds, since nothing
  reads an archive sequence today (06). The register's `arc view` row: it reads through the contract, with paths from
  the layout resolver, and a completed work unit gets its path.
- **Derived views read typed listings.** The contract's `list` returns each record's parsed fields (D1), so renderers —
  `arc view`, the status surfaces, a later status HUD — consume typed fields, never scraped Markdown.
- **The composition also decides.** `resolveProjectReadinessComposition` (`lib/status/project-view.ts`) supplies the
  lifecycle facts that start, rename, lifecycle transformations, abandon, and the integration checkpoint dispatch and
  guard on (`composed-lifecycle-index.ts`, lifecycle's), so those reads go through the store while rendering may read
  the projection. Status and lifecycle coordinate on the file.
- **Purpose and the live view.** `inbound-routing-method` (its D11) adds a derived purpose — the first sentence of the
  `Design` artifact's `**Purpose:**`, a `wu.prose` read — to `arc status <slug>` and the `arc status --project --json`
  facts rows, beside the meta's owner, per-slug state and position, and a horizon advisory; and its design has
  `arc view <kind> --for <slug>` read a started work unit from its registered checkout or its selected ref, refusing
  `--path` and `--editor` without a checkout. Its task list settles four details the reroute keeps, all provisional on
  that work unit landing as specified:
    - **The `design` selector.** `arc view design` picks from the meta's `Design` list — the first listed artifact with
      a `**Purpose:**` field, otherwise the first that exists — rather than naming a stored kind, so it survives the
      flip by mapping each entry to a draft, spec, or companion reference (`work-item/companion` for a layered
      design's halves). `VIEW_KINDS` (`lib/view/types.ts`) therefore derives as the registry's kinds plus that
      selector, never the kinds alone.
    - **The purpose read** applies the same selection and reads an empty field or the template's `—` placeholder as
      no purpose, so it reroutes through the draft, spec, and companion parsers' Purpose field and reads every listed
      artifact's parsed value.
    - **One composition call site.** `arc status <slug>` and `arc view --for` share one local-composition helper
      beside `resolveComposedLifecycleIndex` in `composed-lifecycle-index.ts`, so rerouting the composition through
      the store moves one call for both, and status and lifecycle coordinate on that file as well.
    - **The pre-flip arm is one module** — the started target's location, its `<ref>:<path>` reads, the meta read
      behind the `cohort` view, the unavailable report for an indeterminate slug, and the `--path` / `--editor`
      refusal — deleted whole at the flip with its help text, since the projection gives every artifact a file;
      `arc view`'s rendering of a started work unit reroutes through the store, unchanged in content.
- **`arc view`'s default target** comes from the checkout's marker — a work unit's files, or an Errand's description
  when the claim is an Errand — not from which files exist. From the flip, `arc view <slug>` shows a closed Errand's
  description from its quarter's archive ref, with the record's state.
- **One identity.** `arc status`'s slug query and ROADMAP rendering read only `arc.identity`
  (`readConfiguredIdentity`), where the contract resolves identity as user and Errand commands do (`resolveIdentity`);
  the difference ends when the last of them is rerouted.

## Inbound dispositions

The Inbound Buffer is fully integrated. Each entry's surviving detail now lives in its member section above.

| Entry (abridged)                                                                 | Disposition                                                           |
| -------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Own placement-as-record                                                          | Lifecycle; settled by D5 and key 12                                   |
| Local-ref residue outranking an archived Shipped record                          | Locus; precedence shipped (PR #660), refs demoted to hints (key 14)   |
| Retire activation's remote plan shadow                                           | Lifecycle; branchless planning (D17)                                  |
| Archived-but-not-torn-down terminal frame                                        | Locus, with lifecycle's archival (key 15)                             |
| `abandon` → `teardown` under full protection                                     | Lifecycle; retirement as one ceremony (key 16), ref-set reap survives |
| Direct retirement's clean-index precondition                                     | Re-routed: diagnostic Errand; dissolves at the flip                   |
| Lifecycle-aware link reanchoring                                                 | Rejected: movable artifacts carry no relative links (key 06)          |
| Withdrawn singleton Candidates reviving                                          | Delivery and review (key 01)                                          |
| Raw review evidence surviving the archive sweep                                  | Delivery and review; input to the working-state split                 |
| Branch-carried projections; activation staging; render verb; materialize rows    | Rejected: dissolved by key 18 at the flip                             |
| Merge driver; workflow hand-render audit; merge-boundary regeneration            | Rejected: dissolved by key 18; the flip rewrite drops the steps       |
| Parallel-aware preflight; scoped re-render; post-teardown currency               | Rejected: dissolved by key 18                                         |
| Discoverable regen verb; reproducible check; gated warning; HEAD-pinned stamp    | Rejected: dissolved by key 18; decomposition's arms noted there       |
| Retire Candidate records at archive                                              | Delivery and review (key 01)                                          |
| Singleton record writes staling the publication boundary                         | Delivery and review (key 34)                                          |
| Rebuild the carved code with full session-init schemas                           | Keys 29–33 by member; the full-schema rule is cross-member            |
| Route work-unit state paths through the contract                                 | Cross-member (key 13)                                                 |
| `arc rename` inside an Errand                                                    | Lifecycle; key 56's acceptance case                                   |
| Errand frontline skip, and "window"                                              | Delivery and review; a new record shape, so no Errand                 |
| Reconcile the state-path register count                                          | Cross-member: re-derived per member at planning                       |
| Retire the live transition-record test                                           | Re-routed to `storage-cutover`'s deletion pass                        |
| Flip ADR-022 to Accepted                                                         | Seam setup Errand                                                     |
| Close the workspace after the executor's writes                                  | Lifecycle (key 30)                                                    |
| Records serve renderers                                                          | Status; settled by D1                                                 |
| Compaction seed as a read-only projection                                        | Locus                                                                 |
| `parseMetaRecord`'s flat-bullet fallback                                         | Record kinds; retired once the five bullet-form metas convert         |
| Dependency-edge semantics                                                        | Lifecycle; shipped policy kept, re-homed                              |
| Title-keyed inbox parser                                                         | Locus; superseded by `_Id:_` keying (D11)                             |
| `identifier-list` value class                                                    | Record kinds; shipped, kept by the meta parser                        |
| Resolve lifecycle state by slug                                                  | Lifecycle; shipped, re-homed onto the index                           |
| Lifecycle-complete cohort membership                                             | Lifecycle; condition (c) becomes record kinds' report (item 7)        |
| `WORKING-MEMORY` parser dropping headers                                         | Locus                                                                 |
| Write-path enforcement framing                                                   | Settled: D5 validates at write, key 28 moves content rules            |
| Re-point ADR-022's retired references                                            | Rides the ADR-022 Errand                                              |
| Durable integration-resume directive                                             | Re-routed out: procedure composition, not storage                     |
| Held capture: `arc view` default target                                          | Status                                                                |
| Held capture: import ratchet                                                     | Seam setup Errand                                                     |
| Held capture: retained review decisions versus withdrawn publication authority   | Delivery and review                                                   |
| Resumable lifecycle transitions after a failed ceremony                          | Lifecycle                                                             |
| Completed tasks keep their identifiers                                           | Record kinds; a write-check rule D3's task captures need              |
| `_Shapes:_` in the inbound-entry and inbox-capture schemas                       | Locus's inbound and inbox-capture schemas; provisional                |
| Hold-and-route's rewrite sites                                                   | Locus; register row amended; provisional                              |
| Inbound back-pressure slot                                                       | Locus, with a new register row; provisional                           |
| `arc status` purpose and `arc view`'s live read                                  | Status; provisional                                                   |
| Stored `verificationKind: "tier-3"`                                              | Delivery and review                                                   |
| Store integration suites at the cutover, and their CI size                       | Re-routed: `storage-ref-backend`, retirement list to the cutover      |
| Converting buffer sections and owner-adoption holds at import                    | Re-routed: `storage-ref-backend`, noted for `storage-cutover`         |
| A red push gate as the code leg's failure                                        | Re-routed: `storage-ref-backend`, which builds D12's push loop        |
| The gate reuse record in the machine-local set                                   | Cross-member; the first registry edit adds it                         |
| `arc view`'s `design` selector and the purpose read's selection rule             | Status; two register rows amended; provisional                        |

The last twelve rows arrived after the consolidation, from `inbound-routing-method`'s and `quality-gate-hooks`' draft
closes, `inbound-routing-method`'s task generation, and two later captures, and were dispositioned at Phase 2
(2026-10-09). "Provisional" marks an entry that rests on `inbound-routing-method`, Active since 2026-10-09 against its
approved spec, landing as specified.

**Routed out at draft close,** by capture to each work unit:

- `handoff-optimization`: item 4 settles its entry on which handoff fields the session context keeps, and the anchor is
  `State at Handoff`, with `Commit at Handoff` kept as the code-head baseline.
- `storage-cutover`: the flip rewrite moves every workflow step that hand-edits `Class` onto the Class verb or a shipped
  flag — activate's Step 4; init's post-init ratchet, a new work unit's resolution, and its Errand-promotion step 6;
  promote's Step 2; and draft-design's capture — and the steps that hand-edit `Branch`, deactivate's Case C and init's
  re-run, onto verbs (item 1); it rewrites the cohort template's "convenience pointer" note (item 7); and
  `hooks.task_numbering` retires with the task-numbering hook (§ Record kinds). The consumer map's workflow rows name
  none of these. Where it rewrites the `route-discovered-work` method's binding section to `inbound-routing-method`'s
  from-the-flip binding (§ Locus), the `_Routed from:_` line's date moves to `_Created:_`, and an Integrating work unit
  is no routing target, amending that work unit's D2 (item 9).
- `storage-ref-backend`: item 4's `SESSION-NOTES.md` fold mapping for the import; item 9's `_Routed from:_` line, whose
  date moves to `_Created:_` from the flip, for its buffer conversion; and item 11, its write and batch path running
  each kind's write check with the record's reference, the prior version, the next one, the writer, and the batch's
  view, since each backend validates its own writes today (`lib/store/in-repo/write-admission.ts`), while the import,
  moving state between backends, runs none.
- `storage-projection`: item 11, write-back and `arc save` calling each kind's write check with a hand edit as the
  writer, which replaces D13's parser refusal of a change to a verb-owned field.
- `config-storage-architecture`: item 2's owner is `arc.identity` or, when that is unset, the slugified Git `user.name`
  (`resolveIdentity`), so its routed identity entry's premise, an owner taken from `arc.identity` with Git `user.name`
  no candidate, needs correcting.

**Dropped with the Prior Design section** (`singleton-integration-continuity`'s seed record): its spine — Candidate,
lifecycle position, and integration checkpoint agreeing from publication through archival — is now the delivery and
review member working with lifecycle; its five reproductions map to PR #657 (terminus carry), PR #660 (swept status),
key 15, the raw-evidence question, and a singleton routed through a delivery reader, which stays an ergonomics Errand.
Its split-and-schedule proposal, sequencing, and Owner questions were settled by the re-cut, and its ownership check and
advisory ordering survive in lifecycle's retirement bullet.

**Also dropped as superseded evidence:** the per-entry "Captured during" and "Routed from" provenance (the original
text stays in history at `b966f1a6a`); the state-path recount's file-by-line list, now in the map's key-13 rows; the
reconcile of carve owner names in `cli-substrate-complete-migration`'s spec, done when the register rows landed and
that work unit shipped; the seven-to-eight Candidate-record count against its draft; and the first abandon's receipt
digests, SHAs, and manual command sequence.

## Unknowns and Assumptions

- **The map's classifications were spot-checked, not re-derived**, and six areas were not covered in depth (its § Sweep
  and verification). Members re-verify their rows when they plan, and the counts above are seam-owned rows in the landed
  map.
- **Key 55 has no consumer-map row**, and `lib/git/foreign-artifact-detection.ts` appears only in the state-path
  count; locus derives its rows at planning.
- **The soft coordinations above** are settled firmly only by the cut; every other member's edge on record kinds is
  settled here.
- **Entries marked provisional** rest on `inbound-routing-method`, Active since 2026-10-09 against its approved spec; if
  its design moves before the members plan, they re-read its spec rather than these summaries.

## Scope boundary (Won't Do)

- Build the ref backend, local-only mode, the import, or explicit state fetch (`storage-ref-backend`); the projection,
  `arc save`, write-back, or the worktree lock (`storage-projection`); or the flip, its workflow rewrite, and the
  deletion passes (`storage-cutover`).
- Change any workflow's text before the flip.
- Take the delivery follow-ons (`delivery-observe-attest`, `delivery-correction-convergence`), review-lane contracts
  (`review-activity-contracts`), or the durable Owner terminus (`review-source-authority`,
  `review-protocol-alignment`).
- Reshape session-init's prose conditionals, which `composable-workflows` replaces.

## Constraints

- `storage-contract` and `cli-substrate-complete-migration`, the two prerequisites, have shipped; the contract's
  archive merged before Phase 2 began.
- Nothing else that edits the lifecycle write path runs alongside the seam — `review-checkout-lifecycle` and
  `stub-mint-to-launch` among it (`cohort-state-storage.md` § Cross-cohort).

---
