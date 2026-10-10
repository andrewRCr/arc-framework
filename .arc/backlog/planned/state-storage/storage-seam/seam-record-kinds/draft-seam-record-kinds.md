# Draft: Seam Record Kinds

- **Origin:** [internal] — the `storage-seam` cut (2026-10-09); stage 2 of the storage program.
- **Purpose:** Build the record kinds every other seam member writes or reads — the parsers, field schemas, field
  writers, and write checks of the meta, task list, draft and spec, lineage record, and cohort document — and keep the
  shared decisions those kinds carry, so the other members plan against settled interfaces and adopt its writers as they
  reroute.

---

## Continuity

- **Readiness:** maturing. The cut carried this member's section of `storage-seam`'s draft over unchanged, with the
  shared decisions it owns (items 1–8 and 11), from a draft the readiness check found formalization-ready for the cut
  (2026-10-09); what stays open is this member's own detail design.
- **Next:** draft-design, in the first design pair with `seam-lifecycle` (`cohort-storage-seam.md` § Coordination):
  re-verify the modules its kinds replace or extend against the current code, then carry the settled decisions into its
  spec.

**Reading this draft.** `cohort-storage-seam.md` holds the seam's coordination, its scope boundary, and how the
register's keys are cited. A `§ Shared decisions` item lives in its owner's draft: items 1–8 and 11 in
`draft-seam-record-kinds.md`, item 9 in `draft-seam-locus.md`, and items 10 and 12 in `draft-seam-lifecycle.md`.
`§ Record kinds`, `§ Lifecycle`, `§ Decomposition`, `§ Delivery and review records`, `§ Locus`, and
`§ Status and roadmap` name the member sections of `draft-seam-record-kinds.md`, `draft-seam-lifecycle.md`,
`draft-seam-decomposition.md`, `draft-seam-delivery-review.md`, `draft-seam-locus.md`, and
`draft-seam-status-roadmap.md`. `D` and `A` numbers are `spec-storage-contract.md`'s decisions and amendments.

## Decisions

### Shared decisions

This member owns items 1–8 and 11 of the seam's shared decisions, settled before the cut (Owner, 2026-10-09);
`seam-locus` owns item 9 and `seam-lifecycle` items 10 and 12, and `cohort-storage-seam.md` § Shared contracts names
each item's consumers. For a record kind more than one member touches, the decisions settle only the fields that cross a
member boundary — each field's name, its value shape, the one verb that writes it, and who reads it; a field one member
alone touches stays with that member's planning. Items 1 and 2 come first, since the rest hang on them. Already settled
by the contract and not reopened: UIDs and aliases (A5, A11), branch links (A3), the store's operations and versions,
`StoreLifecycleStorage`, the layout resolver, identity resolution, and the Errand record's schema; the meta's `Id`
field, which the contract left open, is item 2's.

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
      alone, routed at `storage-seam`'s draft close.
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
   and a capture tells `handoff-optimization` so at `storage-seam`'s draft close. Today handoff writes the
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

Items 9 and 10 are `seam-locus`'s and `seam-lifecycle`'s.

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
      route the obligations to `storage-ref-backend` and `storage-projection` at `storage-seam`'s draft close.
      Until then hand edits and the pre-commit checks stay as today. Moving state between backends runs no rule: the
      migrate verb (D14), and the one-time import whether that is the verb or a one-off tool, carry records today's
      checks admitted, unchanged, so archived records that predate a rule or name a closed cohort import as they are.
      The held-entries rule reads the inbound list through the view against item 9's settled schema and finds nothing
      until locus registers the inbound kind at the flip, so record kinds builds it with no edge on locus.

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

---
