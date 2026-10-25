# Task List: Lifecycle Slug Selection

- **Design:** `spec-lifecycle-slug-selection.md`

---

## **Phase 1:** The lookup over the reference backend

_Purpose:_ Settle the lookup rules every later phase reads, over the reference backend: cohorts ranked beside work
items, a completed tie resolved to its latest archived work unit, branch links ranked live-first, and a tie's tier named
on its refusal, with every reader that requires a work unit naming a cohort it refuses.

_Mode:_ `layer` — closes on the reference backend's slug and `ref` arms ranking every holder as the lookup's rules
state.

_Exit criterion:_ Over the reference backend, a cohort-held slug resolves to the cohort's document and each reader that
requires a work unit refuses it as a cohort; a completed tie that includes a work unit resolves to its latest archived
work unit, above a completed Errand, while a live tie, a completed tie that includes a cohort, and one of Errands alone
refuse `ambiguous-match` naming their tier; a reused slug's branch resolves to its live holder; and the in-repo
implementation's lookup tests pass unchanged.

_Design decisions:_ The claim arm's UID match (§ 1.4) lands in Phase 4 with the readers that send the UID; landing it
here would resolve every store-arm work-unit claim to nothing. The ref backend's edits and the new conformance
assertions land in Phase 8 (§ 10.2); until then the reference backend's tests pin each rule. Phase 4 changes one
existing assertion, the work-unit claim's, to send the UID (4.3.d).

### `[x]` **1.1 Rank cohort documents beside work items, and name a cohort where a work unit is required — § 1.1**

- _Goal:_ A slug a cohort holds resolves through the slug arm to the cohort's document, ranked in the same four tiers as
  a work item's primaries, and each reader that requires a work unit refuses it as a cohort rather than misreporting it
  as an Errand.

    - `[x]` **1.1.a The reference backend's slug ranking**

        - The slug arm admits cohort documents in the same live/current-name tiers as work-item primaries; commit and
          branch lookup retain their work-item-only predicate. Ranking tests cover cohort aliases, completed holders,
          current-name precedence, and a mixed live clash.

    - `[x]` **1.1.b Readers that require a work unit name a cohort**

        - Work-unit reads, start, decomposition homes, and inbox work-item lists name cohorts in their refusals and
          preserve Errand handling; focused reader tests cover their refusals and successful work-unit continuations.

### `[x]` **1.2 Resolve a completed tie that includes a work unit to its latest archived work unit — § 1.2**

- _Goal:_ A reused slug stays resolvable once its later holder completes: a completed tie that includes a work unit
  resolves to its latest archived work unit, a work unit outranking an Errand, while a completed tie that includes a
  cohort, or holds only Errands, keeps refusing.

- _Outcome:_ Completed ties containing work units select the latest archive through one placement comparator shared
  with status. Cohort and Errand-only ties remain ambiguous; lookup and view tests cover multiple generations and
  former names, including third-generation creation through production write rules.

### `[x]` **1.3 Rank the `ref` arm live-first — § 1.3**

- _Goal:_ A branch that two holders of a reused slug both link resolves to the live holder, and each session-start
  reader that looks a branch up reads that holder and offers no branch cleanup while a live work unit links it.

    - `[x]` **1.3.a The `ref` arm's ranking**

        - Branch links rank live primaries first and share the completed work-unit tie-break with slug lookup. Tests
          cover live reuse, live ambiguity, latest completed work units, and completed Errand-only ties.

    - `[x]` **1.3.b The session-start branch readers**

        - Missing-worktree and orphan tests pin reused branches to their live holder, with no teardown offer and the
          orphan advisory's existing merged-branch requirement intact.

### `[x]` **1.4 Name a tie's tier on `ambiguous-match` — § 1.5**

- _Goal:_ An `ambiguous-match` refusal from the slug or `ref` arm states whether its candidates are live or completed
  and, from the slug arm, whether the slug is their current or a former name, so a reader tells a completed tie from a
  live clash without the operand.

    - `[x]` **1.4.a The refusal field**

        - Ambiguous-match refusals accept optional strict tie facts: live/completed liveness and optional
          current/former name kind. Envelope tests retain unranked refusals and reject malformed tie facts.

    - `[x]` **1.4.b Setting it**

        - Reference slug and branch lookup retain their computed rank for ambiguity facts. Tests pin all slug tiers,
          live/completed branch ties, and unranked claim, commit, and lineage ambiguity without changing refusal text.

## **Phase 2:** One standing selection, and verbs on the lookup's record

_Purpose:_ Give lifecycle one standing-holder selection, serving the view's index, status, and every slug-keyed map the
store arms build, and make each verb act on, and re-read, the record the lookup returns.

_Mode:_ `slice` — closes on every lifecycle verb's store arm acting on a reused slug's live holder.

_Exit criterion:_ Over the reference backend, with a completed and a live holder of one slug, `arc activate` of the live
holder succeeds where it now rejects "is not a Planning work unit held in active placement", a former slug typed as the
operand acts on its live holder, and the other store-arm verbs that take an operand act on the live holder's entry;
status's output-pinning tests pass unchanged but for the selection's source, and `store-project-standing.test.ts`'s
warning assertions move to status's rendering with today's text.

_Exit amendment (A1):_ The current-name `wu reconcile` reuse scenario closes in 4.3.c after UID checkout claims;
2.8 retains its former-name scenario with a marker naming the live holder's unique current name.

_Design decisions:_ The word and paired-spec checks take a tie as an answer (2.2) before the view's index drops a
clashed slug (2.3), so no tie newly blocks an unrelated activation. The store-arm dependency reconcile reads the index
until Phase 3 resolves edges through the lookup, so no test reconciles a `Depends On` edge on a clashed slug before
then. The work-unit claim matches by slug until 4.3, so this phase's fixtures hold no work-unit marker for a reused
slug, and a verb run without an operand under reuse is tested in 4.3. Where reuse alone already reaches the live holder,
its test is a regression pin that passes before the change; each re-read's failing test runs over the clash double
(2.1.a).

### `[x]` **2.1 Move the standing selection into `lib/store/` with its clash facts and the former-name tie — § 2.1**

- _Goal:_ One selection in `lib/store/` returns only what it establishes, the standing entries, each clash as its slug,
  its kind, and each live holder's `RecordReference`, and the fail-closed names, and status renders its `slug-clash`
  warning from those facts with today's text.

    - `[x]` **2.1.a The selection**

        - `lifecycle-standing.ts` groups every current and former name and returns standing entries, typed current-name
          clashes and former-name ties, and fail-closed diagnostic names. The shared clash double projects complete
          inventory observations and supports a clash introduced after a verb's first lookup without changing writes.

    - `[x]` **2.1.b Status renders the clash facts**

        - Status renders current-name clash facts with the existing UID, owner, location, and repair text; former-name
          ties render no warning. Both status consumers use the store selection, and standing, records, dependencies,
          and combined-input tests retain their output.

### `[x]` **2.2 Take `ambiguous-match` as an answer in the word and paired-spec checks — § 4.2**

- _Goal:_ No tie the lookup refuses, whatever its holders' types, blocks an unrelated work unit's activation, reconcile,
  publish, or rename through a word or a paired spec's filename found in that work unit's records.

    - `[x]` **2.2.a The word check**

        - Artifact prose skips ambiguous lookup results without inventing renames; other lookup refusals propagate.
          Completed-Errand tie fixtures cover reconcile, activation, Candidate-backed publication, and recovery from a
          distinct namespace failure.

    - `[x]` **2.2.b The paired-spec owner check**

        - A tied name counts as a paired work-unit owner only when its candidates include metadata. Tests cover
          work-unit clashes, Errand-only ties, unchanged reconcile content, and rename alongside a backlog record's
          clashed paired reference.

### `[x]` **2.3 Build the view's index from the standing entries — § 2.2**

- _Goal:_ Every consumer that asks the view's index by slug inherits the one selection, while the view's `listing` and
  `entries` keep every holder, each identified by its reference, and the view refuses only where the listing does.

- _Outcome:_ Lifecycle views expose the shared standing selection and build their slug index from it; status consumes
  that same result. Tests cover reversed reuse listings, retained clash identities, malformed live holders, and
  retargeting former-name dependency and artifact references to their live holder.

### `[x]` **2.4 Count every holder in cohort membership — § 2.3**

- _Goal:_ A cohort's membership counts each holder rather than the one standing for a slug, so archiving the last other
  open member of a cohort that holds two clashed live members proposes no closeout `checkCohortOpenMembers` refuses, and
  the cohort consistency check sees each holder in its own cohort.

    - `[x]` **2.4.a Archive's cohort closeout**

        - Both archive preparation and post-publication closeout use every lifecycle entry keyed by owner identity,
          marking only the selected reference complete. A clashed cohort's other member archives without closing the
          group; existing final-member and nested closeout cases retain their behavior.

    - `[x]` **2.4.b The cohort consistency check**

        - Store-backed validation derives member sets directly from all lifecycle entries, including completed ones.
          Tests retain each clashed or reused holder in its own cohort without orphan member diagnostics.

### `[x]` **2.5 Take the standing holder in completed evidence and the lifecycle snapshot — § 2.4**

- _Goal:_ A slug with a live holder contributes no completed evidence, and each holder of a reused slug reads its
  artifacts at its own projected path.

    - `[x]` **2.5.a Completed evidence**

        - Completed evidence selects canonical archived holders and suppresses every live current/former name and
          name-bearing live diagnostic. Unavailable live inventory withholds authority even without completed records;
          Candidate and husk-consumer tests retain no completed authority for a reused live slug.

    - `[x]` **2.5.b The lifecycle snapshot**

        - Snapshot reads match the exact projected artifact path across all entries and require one holder, retaining
          saved-version reads. Tests read archived/live metadata and companions independently and reject a clashed path;
          the existing Git snapshot integration cases retain their behavior.

### `[x]` **2.6 Find each verb's entry by the subject's reference — § 3.1**

- _Goal:_ Every lifecycle verb's store arm acts on the record `readWorkUnit` returns, finding its view entry by that
  record's reference (`sameReference`, `lib/store/identity.ts`) and resolving its position, guards, and finalization
  under the subject's current name, so a former slug typed as the operand acts on its live holder.

    - `[x]` **2.6.a The store executor**

        - The executor selects its primary before transition lookup and uses its current name for position, guards,
          and side effects. Inventory agreement and finalization match references; prepared primaries reread by
          reference with version checks and reject unrelated operands. Reuse, aliases with occupancy, clashes,
          mid-verb preparation, and inconsistent finalization tuples have regression coverage.

    - `[x]` **2.6.b Activation**

        - Activation matches its subject entry and excludes its primary from peers by reference. Tests activate a
          live Planning namesake from base and retain a completed namesake's branch link as a collision.

    - `[x]` **2.6.c Abandon**

        - Abandon's handler and verb match the selected primary's reference in the lifecycle view. A handler regression
          removes the live branchless Planning holder while preserving its completed namesake.

    - `[x]` **2.6.d Start's already-started check and graduation**

        - Start retains the lookup's reference beside its current name for the already-started check, and graduation
          matches that reference in the view. Handler integration cases graduate a live backlog namesake and direct an
          active Planning namesake to materialize while leaving completed records unchanged.

    - `[x]` **2.6.e Materialize**

        - Materialize matches its candidate to the selected metadata reference. Its reuse regression keeps both
          generations unchanged and claims the live holder; a narrow first-listed selection reconstruction fails it.

### `[x]` **2.7 Re-acquire a selected record by its reference — § 3.2**

- _Goal:_ A record already selected is read again by its reference, never ranked again by its name, so a held subject's
  group, its pause state, and its reconcile context are its own under reuse and under a clash formed during the verb,
  and one backlog clash no longer blocks every rename.

    - `[x]` **2.7.a `acquireLifecycleRecords` takes the owner's reference**

        - Whole-group acquisition lists by the supplied owner and names that reference when metadata is absent,
          preserving completeness and additional-record reads. Rename, reconcile, decomposition, and shared fixtures
          pass selected references. Tests cover unrelated and mid-verb clashes, missing-primary recovery, and exact
          live-group isolation under reuse, including a failing first-listed acquisition reconstruction.

    - `[x]` **2.7.b The reconcile context's subject**

        - Reconcile operations carry an optional selected reference through the store ceremony into group acquisition;
          activation, publication, and the reconcile handler supply their primary's reference. Context and ceremony
          tests retain a selected group through a mid-verb clash; activation and publication reconcile only the live
          namesake's records, with first-listed selection reconstructions proving both regressions.

    - `[x]` **2.7.c Decomposition's acquisitions**

        - Origin, conservation, discard, revision, terminal, and home acquisitions use their selected references.
          Origin and authenticated-member regressions survive mid-verb clashes; an additive cut on a reused origin
          preserves the completed group's metadata and draft. Narrow name-reread and first-listed reconstructions
          fail those cases before restoration.

    - `[x]` **2.7.d The pause check's basis**

        - Advancing pause and delivery checks use selected metadata. Publication target resolution retains that record;
          explicit operands carry its reference into publish/reopen, while ambient verbs retain initial name admission.
          The executor passes its selected primary into production withdrawal preparation, which rereads by reference.
          A pause after reconcile preparation fails the version guard. Tests cover clashed subjects, retained completed
          pauses, exact logical-branch withdrawal, and handler publication with real Candidate evidence.

    - `[x]` **2.7.e The re-reads after a reconcile, and the reconcile handler's subject**

        - Activation and publication reread the initially selected primary by reference after reconcile; the reconcile
          handler reads its checkout-selected reference directly. Tests retain those subjects through mid-verb clashes,
          reconcile a reused former operand without altering its completed namesake, and preserve ambient publication's
          initial clash refusal and untouched publication boundary.

### `[x]` **2.R Realign checkout-owned reconciliation verification — A1**

- _Goal:_ Apply A1's verification ordering: keep the former-name `wu reconcile` scenario in 2.8 and verify its
  current-name reuse scenario in 4.3.c after UID checkout claims are available, preserving the required end behavior.

- _Outcome:_ The registered-CLI former-name scenario selects the renamed live holder and preserves completed
  metadata and notes. Current-name coverage is assigned to 4.3.c with a UID-bound checkout; the segment's effective
  exit criterion retains every final behavior requirement.

### `[x]` **2.8 A reused slug's verbs end to end** — validate exit criterion at segment scope

- _Goal:_ The segment's exit criterion holds end to end: every store-arm lifecycle verb that takes an operand acts on a
  reused slug's live holder over the reference backend.

    - _Amended in:_ 2.R (A1)

- _Outcome:_ Registered Commander dispatch exercises every operand verb in the effective segment scope against
  the reference store in real Git repositories, through current and former names, preserving the completed holder's
  metadata and artifacts. Publication carries producer-generated Candidate evidence, withdrawal observes the logical
  request, and decomposition executes a preflight-derived cut. Status's output pins remain unchanged.

## **Phase 3:** Clash refusals and dependency edges

_Purpose:_ Make a clash refuse with each holder as a typed reference and its repair, wherever a verb first meets it, and
resolve each name a dependency edge meets once through the lookup, holding, never discharging, an edge that a tie or a
cohort or Errand leaves unsettled.

_Mode:_ `slice` — closes on a clash refused with its holders and repair, and its edges held, end to end.

_Exit criterion:_ Over the clash double, a verb naming the clashed slug refuses `ambiguous-match` with both holders as
typed references, in its text and in `--json` where it takes it, with the preferred move for their types, wherever it
first meets the tie; an edge naming the slug is held with both holders and the dependent activates, as does an unrelated
work unit whose records mention the slug, and an unrelated work unit abandons while an Integrating work unit's held edge
names it; the last other open member of a cohort holding both archives; and over the reference backend an edge naming a
reused slug classifies against the live holder, one on a completed work unit's former name is discharged with no
self-dependency where the dependent has taken that work unit's current name, and one on a cohort's slug with no lineage
disposition is held while its dependent activates.

_Design decisions:_ The lifecycle refusal carries the store refusal whole in `--json`, as publish, the reconcile, and
`arc status <slug>` already do, and one pure repair builder in `lib/store/` serves the text renderer, the held entries,
and paused work. The reconcile's resolution takes the store arm's lookup out of the disposition query; the in-repo
contexts keep today's index path. A clash met in a checkout without an operand is exercised in 4.3.c, where the
checkout's claim first selects one holder. Clash tests run over the clash double (2.1.a), and a tie of a work unit and a
cohort over the reference backend directly.

### `[x]` **3.1 Carry the store refusal on the lifecycle refusal, and build its repair — § 4.1**

- _Goal:_ A lifecycle verb that meets a clash refuses with each live holder as a typed `RecordReference` and the repair
  for its tie's kind, in its text refusal and in `--json` where the verb takes it.

    - `[x]` **3.1.a The repair**

        - Added the pure `clashRepair` builder, selecting cohort rename, Errand close, or either work-unit rename
          by record kind. Former ties name current names; completed ties list UIDs without a lifecycle move. Only a
          concrete Errand close supplies its action argv; the other cases use `arc status --json`.

    - `[x]` **3.1.b The shared preamble and its schema**

        - The lifecycle refusal schema carries optional complete store evidence. Shared target admission and
          `publicationRecordTarget` forward it to `refuseWithRemedy`, whose JSON envelope keeps candidate references
          and tie facts and uses the derived repair. Existing spine remedies retain their schema and behavior.

    - `[x]` **3.1.c The shared text renderer**

        - The shared renderer prints each holder's record kind, current name, and UID, selecting the ranked repair
          while retaining the original remedy without ranking facts. Registered CLI cases cover collaboration and
          former ties, then retry successfully after cohort rename or Errand close, including completed lookups.

### `[x]` **3.2 Pass the refusal whole from every site that meets the clash first — § 4.1**

- _Goal:_ Wherever a verb first meets the clash, the refusal reaches the shared renderer whole, with its candidates and
  tier, rather than as text.

    - `[x]` **3.2.a Verbs that read their own subject**

        - Registered CLI pins cover pause, handover, resume, and set-class with complete typed holder repairs.
          Reopen rejects an already-clashed subject before host contact and leaves both records unchanged; the
          existing mid-verb case retains the admitted reference through withdrawal.

    - `[x]` **3.2.b Materialize and start**

        - Materialize and start use the shared renderer with complete refusals. Graduation retains refusal evidence
          in its result and report, including rejected transitions. Former-name resolution checks the selected
          holder's current name before dispatch while retaining the first selected reference.

    - `[x]` **3.2.c Teardown's retirement read**

        - `StoreRefusalError` carries original evidence through retirement's subject, lineage lookup, and lineage
          read failures. Teardown preserves it in its rejected result and shared rendering; the session sweep retains
          the previous diagnostic message, including recovery guidance.

    - `[x]` **3.2.d The reconcile handler's operand check**

        - Reconcile operand conflicts carry their original store refusal into JSON and shared text rendering.
          Current-name and omitted operands keep the checkout-owned selection path; a clashed different operand
          leaves every holder and the caller unchanged. The current primary's read refusal also remains structured.

### `[x]` **3.3 Resolve each name an edge meets once, and decide by the resolved record — § 5.1, § 5.2**

- _Goal:_ The store arm's reconcile decides each `Depends On` edge from one lookup resolution of each name it meets, and
  from then on by the resolved record's reference, discharging only an Integrating or completed work unit and never
  moving an edge onto a name that does not resolve back to its work unit.

    - `[x]` **3.3.a The resolution**

        - Added the memoized identity resolver to the reconcile context and planner input. UID targets use the complete
          view's entry or retain their exact lineage identity; store retarget and replacement dispositions carry their
          target references, while the shared in-repo projection stays unchanged.

    - `[x]` **3.3.b The held list**

        - Added typed held-edge diagnostics to dependency components and the strict session schema. A shared finding
          predicate keeps held-only plans pending at prepare and store apply.

    - `[x]` **3.3.c The rows**

        - Added the store row planner with exact identity classification, guarded current-name follows, and recursive
          UID-bearing lineage replacements. A held target retains the whole original edge; any conflict refuses the
          rewrite. The in-repo planner retains its index path.

### `[x]` **3.4 Read the lineage for a name the lookup leaves to it — § 5.3**

- _Goal:_ A name the lookup resolves to a cohort, an Errand, a tie among them alone, or nothing, or a UID target with no
  entry, takes the lineage disposition under it, and absent one, a cohort or Errand holds the edge rather than rejecting
  the dependent's activation.

- _Outcome:_ The store disposition query reads lineage alone, including retired former names and exact UID targets.
  Absent lineage holds cohort and Errand edges without rejecting activation. The reference fixture retains cohort
  aliases through checked rename writes, and former-primary lookup assertions now exercise the resolver.

### `[x]` **3.5 Hold a tie's edge, surface it, and let abandon read it — § 4.2, § 4.3, § 5.2**

- _Goal:_ An edge a tie leaves unsettled stays in `Depends On`, unsatisfied, never discharged, and blocks no ceremony
  and no unrelated abandon, while session start and `arc wu reconcile` show it with its holders and repair.

    - `[x]` **3.5.a The tie row**

        - Work-unit ties hold before lineage in every tier. UID-bearing replacement targets also check their current
          name before substitution, retaining the original edge on a clash. Held edges permit activation and attested
          publication without being discharged.

    - `[x]` **3.5.b Surfacing it**

        - Session prompts name held edges and offer inspection. Human reconcile output prints every held edge with its
          typed holders and repair through the shared candidate renderer; JSON retains the complete held list.

    - `[x]` **3.5.c Abandon's impact plan**

        - Impact planning matches an ambiguous dependency's candidate owners by identity, listing matching Integrating
          dependents and passing over unrelated ties. Other operational failures still refuse before mutation and retain
          a successful retry after repair.

### `[x]` **3.6 Offer a paused clashed item its repair alone — § 2.4**

- _Goal:_ A paused item whose slug the selection reports as a clash offers the clash repair alone, never a command that
  would refuse, whatever the other holder's pause state or placement.

- _Outcome:_ Paused work reads complete standing clash facts across live placements and offers the shared repair
  alone, bypassing holder selection and normal lifecycle/review actions while preserving marks. Unavailable clash
  evidence keeps the slot unavailable until repaired.

### `[x]` **3.7 A clash end to end** — validate exit criterion at segment scope

- _Goal:_ The segment's exit criterion holds end to end: a clash refuses with its holders and repair at whichever site
  meets it first, and the edges naming it are held while their dependents activate.

- _Outcome:_ Registered CLI scenarios preserve typed clash refusals across supported readers, including decomposition's
  native envelope. Held and incidental references permit activation and publication; unrelated abandonment succeeds,
  reused/former names classify by generation, and archiving another member keeps clashed cohort members open.

## **Phase 4:** Checkout claims and holder matching by UID

_Purpose:_ Record the owner's UID on a work-unit marker and its derived row, send it with every work-unit claim, and
match holders and roster rows by it, so the archived holder's checkout neither blocks nor stands in for the live
holder's.

_Mode:_ `layer` — closes on every store-arm work-unit claim, holder match, and row match keyed by the owner's UID.

_Exit criterion:_ Over the reference backend, a reused slug's claims resolve the live and the archived holder each by
its own UID, and a claim without one resolves to nothing; every marker writer that holds the record writes its UID, and
both creation paths stamp it after their batch; holder matching, the duplicate-marker guard, and the row readers match
by UID; every store-arm fixture that means a bound marker carries the UID; and the in-repo arm's tests pass unchanged.

_Design decisions:_ The claim's `uid` arrives optional, and the reference backend matches it where present, until every
reader sends it and every fixture carries it; 4.3.e then drops the slug fallback (§ 1.4). Holder matching takes one
discriminated request, an owner's UID and names or a creation's slug, so a caller holding a record never falls to
creation's semantics. From 4.3.e until Phase 6 binds or refuses it, a marker without a UID reads as a missing record;
the store arm is dark until the flip, so nothing reaches that window. The reconcile handler's marker fallback and
unclosed task commits (§ 3.2) re-read by the UID claim here.

### `[x]` **4.1 Record the owner's UID on the marker subject and the derived row — § 7.1**

- _Goal:_ A work-unit marker's subject and the derived checkout row reduced from it carry the owner's UID where one is
  bound, optional in both, and every reader of the marker's fields accepts the new key.

    - `[x]` **4.1.a The marker subject**

        - Live and dormant work-unit subjects carry an optional validated UUID, and ownership decoding preserves its
          typed value. Husk subjects use a separate validator forbidding UID bindings; dormant subjects retain exact
          key validation and both spawn provenance values.

    - `[x]` **4.1.b The derived row**

        - Both marker projections preserve a bound UID through the role candidate and shared derived schema, which
          validates UUIDs in rows, active subjects, and primary availability. Registered locus and session readers
          retain bound UIDs and omit absent ones; in-repo row coverage remains unchanged.

### `[x]` **4.2 Write the UID from every marker writer, and stamp a creation's marker after its batch — § 7.2**

- _Goal:_ Every marker a writer holding the record writes carries the owner's UID, and each creation, which claims
  before its record exists, stamps the UID the store minted onto exactly the marker generation it wrote.

    - `[x]` **4.2.a Writers that hold the record**

        - Store graduation and materialization carry an exact owner request on their spawn operation and write its UID
          for anchored and spawned claims. Promotion carries the record UID through checkout selection and its receipt
          into either marker conversion, including interrupted recovery. Rename preserves a bound UID under the new
          placement name; tracked in-repo writers continue to omit it.

    - `[x]` **4.2.b A creation's stamp**

        - Operational scaffolding returns the owner minted by its final batch. Spawned and cold creation stamp that UID
          onto their exact marker generation outside rollback; a changed generation or filesystem refusal preserves the
          committed record and checkout and reports `arc materialize <slug> --here`. Pre-batch failures retain their
          existing rollback behavior.

### `[x]` **4.3 Send the marker's UID with every work-unit claim, and match it in the reference backend — § 1.4, § 7.1**

- _Goal:_ Every store-arm reader resolves a checkout's work unit by the marker's UID, so a reused slug's claims resolve
  the live and the archived holder each by its own UID, and a work-unit claim without one resolves to nothing.

    - `[x]` **4.3.a The claim and the reference backend's match**

        - Work-unit claims accept an optional validated UUID. The reference backend resolves it to that metadata owner,
          live or completed, independently of the supplied slug; claims without it retain slug matching during reader
          migration. The in-repo lookup remains unchanged and ignores the UID.

    - `[x]` **4.3.b The readers send the UID**

        - Marker claim readers use a shared constructor preserving operational UIDs and retaining slug-only in-repo
          claims. Current work, occupancy, lifecycle evidence, exclusivity messages, roster, cleanup, and overlap read
          the bound generation; missing primaries read lineage by that UID. Unclosed task commits resolve an exact
          claim using the entering frame's UID.

    - `[x]` **4.3.c The re-reads through the claim, and a clash without an operand**

        - Reconcile's marker fallback and session probe retain exact owner references. UID-backed clash fixtures prove
          no-operand refusals and per-holder reconciliation. A1's current-name apply, the retained former-operand case,
          and current task/planning mutations preserve completed namesakes and their artifacts, including pause state.

    - `[x]` **4.3.d The fixture sweep**

        - Bound fixture markers, derived subjects, and conformance claims carry seeded owner UUIDs; creation residues
          and husks retain their intended unbound subjects. Removed-owner and clash cases pin exact generations, and
          recovery projects UUID-bearing rows into its existing smaller frame.

    - `[x]` **4.3.e No slug fallback**

        - Work-unit claims without a UUID resolve to `not-found` over the reference backend; a creation resolves only
          after its arriving owner's UUID is stamped. Unbound rows remain unresolved, while completed-owner recovery
          stays exact beside namesakes. Candidate evidence carries its seeded owner; in-repo claims remain unchanged.

### `[x]` **4.4 Match holders by UID through `LocusPorts` — § 7.3, § 2.4**

- _Goal:_ Marker exclusivity and holder lookup match a record-holding caller's request by the owner's UID and a
  creation's by its slug against unbound markers alone, so a bound checkout of the archived holder neither blocks the
  slug's reuse nor is taken for the live holder's, and each listed entry finds its own checkout.

    - `[x]` **4.4.a The request**

        - Holder ports take the discriminated owner/creation request and return tagged held/none results. Owner UUIDs
          select bound markers; creation selects only unbound names. Both honor checkout exclusions, duplicate UUIDs
          refuse, incomplete operational owners refuse, and the legacy name scan stays confined to tracked records.
          Callers and fixture ports adopt the same contract together.

    - `[x]` **4.4.b Callers that hold a record pass the owner request**

        - Graduation, promotion, materialize, rename, abandon, retirement admission, sharing reports, start checks,
          and teardown pass their selected owner's UUID. Named release resolves the live owner first, then checks
          unbound creation residue when no bound live holder exists. Creation paths pass creation requests; real
          checkout reuse cases preserve the archived owner's marker and records through live-owner operations.

    - `[x]` **4.4.c Listed entries find their own checkouts**

        - In-flight entries carry UUIDs and locate their own holders and rows. Paused work, materialization offers,
          and status use the selected record's owner request; held candidates use reference keys, and overlap
          self-exclusion uses the caller's UUID. Reused and clashed names retain independent checkout locations.

### `[x]` **4.5 Match derived roster rows by UID — § 7.3**

- _Goal:_ Every reader that matches a derived row to a work unit it selected elsewhere matches by the row's UID, never
  its name, so a bound checkout or husk of the archived holder neither puts the live holder's checkout in conflict nor
  stands in for it.

    - `[x]` **4.5.a The duplicate-marker guard**

        - Bound marker rows group by UUID; unbound rows group separately by name. Archived and live holders of one
          name retain independent rows, while duplicate UUIDs refuse even under different display names and duplicate
          unbound names still refuse. Registered locus output retains the live checkout's resolved Planning context.

    - `[x]` **4.5.b The row readers**

        - Branch ownership, orphan candidates, status position, and promotion recovery match their selected owner's
          UUID. The in-flight row match introduced with holder requests is covered through registered CLI output;
          status preserves the live Planning position beside an archived integration checkout, and promotion retries
          select their own converted holder. Tracked-state and transient identity matching retain their existing arms.

## **Phase 5:** Creation

_Purpose:_ Admit a slug no live record holds, within the store's write rules, through one admission check at every
creating path and at Errand promotion, and settle the edges naming it in the batch that creates the record.

_Mode:_ `slice` — closes on a completed work unit's slug reused through every creating path.

_Exit criterion:_ Over the reference backend, `arc stub`, `arc start <name> --new` spawned and `--here`, the nameless
cold start, decomposition's work-item names, and Errand promotion admit a slug whose holders are all completed work
units under it as their current name, a third generation included, or a completed work unit and a completed Errand, with
a bound checkout of the archived holder lingering; they refuse a live holder's slug, a completed Errand's or cohort's
slug, and a completed holder's former slug, each with its remedy and before any write; a new cohort refuses a completed
work unit's slug; and a stub's edge naming the slug settles in the creating batch, while an in-flight dependent's edge
refuses through `work-item.slug-edges` with its remedy.

### `[x]` **5.1 Build the admission check in `lib/store/` — § 6.1**

- _Goal:_ One check in `lib/store/` answers whether a work item may take a slug — free, held by a live record, or
  refused — admitting only what the write rules `work-item.former-slug` and `work-item.slug-edges` admit, and refusing
  whatever it cannot read.

- _Outcome:_ `checkCreationAdmission` classifies ranked lookup and record reads as free, held, or refused, retaining
  holder references, current/former-name facts, tie evidence, and refusal causes. Conflicts precede writing-owner
  exemptions; the renderer names holder types and UUIDs, limits waiting advice to live current names, and preserves
  actionable lookup/read repairs without offering lifecycle clash repairs.

### `[ ]` **5.2 Admit through the check at every creating path — § 6.2, § 6.5**

- _Goal:_ Every path that creates a work item, and Errand promotion, runs the one check and refuses with § 6.5's remedy
  before any write, so each admits a completed work unit's slug and refuses a live, Errand, cohort, or former-name
  holder's; rename and `arc errand open` keep their own admission.

    - `[x]` **5.2.a `arc stub`**

        - Creation selection checks admission and supplies position `null` before guards, side effects, or writes.
          Stub refusals print creation's holder identities and remedies, while failed store writes retain their own
          repair text. Reuse creates an independent backlog owner and preserves the archived bound checkout;
          surviving in-flight dependency edges still refuse with their reconciliation remedy.

    - `[x]` **5.2.b `arc start <name> --new` and the cold start**

        - Explicit creation checks the typed name before alias resolution; cold start checks its final named or derived
          name before writing a marker. Both use shared admission and holder remedies, preserving unique live-work-unit
          pointers without selecting from a tie. Cold-start rollback retains the original store refusal and repair;
          graduation alone still resolves former names to their current owner.

    - `[ ]` **5.2.c Decomposition's work-item names and Errand promotion**

        - `checkNamespaceName` (`lib/decompose/check-names.ts`) runs the check for a work-item name, with the retained
          members' owners as its writing owners (`admitDecomposeRevision`, `lib/decompose/revision-admission.ts`, builds
          the list it matches by `sameReference` today). It now refuses a completed Errand or cohort holder it admits
          today, and its refusal keeps decomposition's map-locus remedy (`nameCollision`).
        - `replace` (`lib/errand/promote-store.ts`) runs the check on promotion's target name before any write, with the
          Errand's owner as its writing owner: `--name` defaults to the Errand's own slug (`handlers/errand.ts`), whose
          lookup returns the Errand's `work-item/record` while promotion writes a `work-item/meta`. Today it relies on
          the store's write checks alone. Its refusal of an existing local target branch (`localBranchExists`) stays.
        - `nameCollisionGuard` (`lib/work-unit/lifecycle-guards.ts`), the transition table, and the in-repo arm are
          unchanged.
        - Build `test-first` (one behavior at a time):
            - decomposition names a new member on a completed work unit's slug, a reused one included, and refuses a
              completed Errand's slug and a completed cohort's, inverting `check-names.test.ts`'s case admitting a
              completed cohort
            - a decomposition revision keeps a retained live member's name
            - promotion onto a completed work unit's slug succeeds, a default-named promotion still promotes, and
              promotion onto a live holder's slug refuses before any write

### `[ ]` **5.3 Refuse a completed holder's slug to a new cohort — § 6.3**

- _Goal:_ A new cohort takes only a slug nothing resolves through, so it never inherits a completed work unit's edges.

    - Decomposition's new-cohort names (`checkNamespaceName`) refuse whenever the slug lookup returns a record or
      refuses other than `not-found`, so a completed work unit's slug and a completed Errand's, which they admit today,
      refuse; a name a cohort document holds stays refused.
    - Build `test-first` (one behavior at a time):
        - a decomposition naming a new cohort on a completed work unit's slug, or on a completed Errand's, refuses with
          the remedy to choose another name

### `[ ]` **5.4 Settle the edges naming a reused slug in the creating batch — § 6.4**

- _Goal:_ A batch that gives a work item a slug an edge names for a prior holder first settles each such edge in the
  stubs it may write, so a reuse never leaves a stub's edge reading the new holder, while an in-flight dependent's edge
  still refuses for its owner to settle.

    - One settler in `lib/store/` takes the store, the slug, and the writing owner, and returns its writes with
      observations of the records it read (`RecordObservation`), which the batch binds (`batchLifecycleWrites`). It acts
      only where `work-item.slug-edges` counts an edge: where the rule's prior-target resolution (`priorTarget`,
      `lib/store/kinds/work-item/slug-edges.ts`, which reads a `WriteCheckInput` today and is exported as a function of
      a lookup view and the slug, its caller in `checkSlugEdges` adapting) finds a prior target other than the writing
      owner. An edge naming a slug no record has held names the new record and stays, and the settler leaves each
      writing owner's own records to its caller.
    - A stub is a work-unit meta in backlog placement and Planning, with no conflicts and no cut map
      (`work-item/cut-map`), as decomposition's settlement plan reads it (`slug-settlement.ts`) plus the phase, since a
      parked record sits in backlog placement too. Each stub's edge naming the slug takes the disposition
      decomposition's resolver gives: an edge on shipped work discharges, and one on a retired origin takes its lineage
      disposition.
    - That resolver's target walk (`resolveDecomposeRetiredEdge`, `lib/decompose/retired-edge.ts`, with
      `readDecomposeRetiredLineage`, `retired-lineage.ts`) moves into `lib/store/` returning `StoreResult`, its
      disposition typed by a store-side type that decomposition's settlement type
      (`DecomposeSlugSettlement["disposition"]`) then reuses, and so does the slot replacement (`replaceDependencySlot`,
      `lib/decompose/dependency-slot.ts`); `lib/decompose/` wraps them in `DecomposeResult`, its behavior unchanged.
      Decomposition keeps its own settler (`decomposeSlugSettlementWrites`, `lib/decompose/slug-settler.ts`).
    - An edge the settler cannot settle, on a conflicted or cut-mapped stub or through lineage it cannot resolve, stays
      for the rule to refuse. An in-flight dependent's `Depends On`, or a paused one's `waits-on`, refuses through
      `work-item.slug-edges` (`checkSlugEdges`) with its remedy.
    - Each batch keeps the create first, since 4.2.b reads the created owner from the batch's result order.
      `runStoreStub` passes the settler's writes as `storeTransition.additionalWrites` and its observations as
      `storeTransition.observations`; `scaffoldIntoWorktree`'s store arm (`lib/git/worktree-scaffold.ts`) adds them to
      its create batch for `--new` and the cold start alike, importing only from `lib/store/`, which its suppression
      floors require; and `replace` adds them to promotion's batch.
    - Build `test-first` (one behavior at a time):
        - creating onto a completed holder's slug discharges a stub's edge naming it in the same batch, through
          `arc stub`, `arc start <name> --new`, and promotion
        - an edge on a retired origin's slug takes its lineage disposition in the batch
        - a stub's edge naming a slug no record has held stays
        - a conflicted stub's edge, and one whose lineage does not resolve, refuse the creation through
          `work-item.slug-edges`
        - an in-flight dependent's edge naming the slug refuses the creation through `work-item.slug-edges`, printing
          its remedy through `arc start <name> --new` and promotion, and a paused dependent's `waits-on` edge does too
        - a refused batch writes neither the record nor the settled edges
        - decomposition's settlement tests pass unchanged over the moved resolver

### `[ ]` **5.5 Reuse end to end** — validate exit criterion at segment scope

- _Goal:_ The segment's exit criterion holds end to end: every creating path reuses a completed work unit's slug within
  the write rules and refuses the rest with its remedy.

    - Over the reference backend, with a bound checkout of the archived holder lingering, create through `arc stub`,
      `arc start <name> --new` spawned and `--here`, the nameless cold start, decomposition, and Errand promotion onto a
      completed work unit's slug and a third generation; attempt each refused case; and create onto a slug a stub's edge
      names and one an in-flight dependent's edge names.
    - Request `arc check segment` after the scenario checks.
    - _Note:_ promotion's fixture leaves no local `feat/<slug>` branch of the archived holder, since `replace` refuses
      an existing target branch on its own.

## **Phase 6:** Unbound markers and their exits

_Purpose:_ Treat a work-unit marker with no UID as unbound, refused by every reader that acts on its checkout and
reported by readers that only list, with exits that bind or release it, and print the unnamed release form at every exit
that locates a checkout.

_Mode:_ `slice` — closes on an unbound marker refused, then bound or released, end to end.

_Exit criterion:_ Over the reference backend, a marker written before the flip and one left by a creation interrupted
before its create batch commits each refuse the readers that act on their claim, naming the slug's holders and the
exits; `arc release commit` and `arc release push` refuse with the exits, and `arc active status` and
`arc user reconcile-references` warn; `arc materialize <slug> --here` binds a marker to its live holder, a creation's
interrupted after its batch commits included, the cold start's rerun admits its own leftover, and `arc locus release`
frees either, each then succeeding; `arc locus release <slug>` frees the one unbound marker naming a slug unless
materialize admits the slug's live holder, and refuses where it does; and a crashed creation of a reused slug is
released, then rerun.

### `[ ]` **6.1 Report an unbound holder, and refuse it where a reader acts on the claim — § 7.3, § 7.4**

- _Goal:_ A work-unit marker without a UID is unbound: holder matching reports it rather than passing over it, and every
  reader that acts on its checkout refuses it, naming the slug's holders by UID and the exits its marker and slug
  select, where today it takes the not-found path that advises `arc locus release`.

    - `[ ]` **6.1.a The classifier**

        - `classifyUnboundMarker` (`lib/locus/unbound-marker.ts`) takes the store, the marker, and an optional identity,
          and returns the marker's slug, its holders, the exit that applies, the exits as actions bound to the marker's
          checkout (`SessionActionSchema`'s `checkout`, `lib/session-init/actions.ts`), and the reason that names them.
        - Its holders are every work-unit meta under the slug as its current name, live and completed, from the listing
          marker occupancy reads (`readWorkUnitOccupancy`, `lib/locus/marker-occupancy.ts`), and the record the slug's
          lookup returns or the candidates it ties, each by its UID. An incomplete listing reads as unreadable, as
          there.
        - **A live holder materialize admits** (`ownedInFlight`, which moves beside the classifier from
          `materialize-store.ts`): `arc materialize <name> --here` from that checkout, under the holder's current name
          where the marker names a former slug, or `arc locus release` where the checkout is not that holder's. Without
          an identity, the bind exit names the holder's owner. **An anchored marker (`spawnedByArc: false`) whose slug
          neither the slug lookup nor the lineage arm finds:** the cold start's rerun (`arc start <name> --new --here`)
          or `arc locus release`. **Otherwise** `arc locus release` alone: a spawned marker, one whose slug has a
          completed holder or a retired origin, one whose live holder materialize does not admit, and one whose slug's
          lookup refuses.
        - Build `test-first` (one behavior at a time):
            - a marker written before the flip whose slug has a live owned holder names both holders of a reused slug
              and offers `arc materialize <slug> --here` and `arc locus release`, and without an identity names the
              holder's owner on the bind exit
            - a marker naming a live holder's former slug offers materialize under the holder's current name
            - a cold start's anchored leftover with no record or lineage offers the rerun and `arc locus release`
            - a spawned unbound marker, one whose slug has a retired origin, and one whose slug's lookup refuses
              `ambiguous-match` offer `arc locus release` alone
            - an incomplete work-unit listing reads as unreadable

    - `[ ]` **6.1.b Holder matching**

        - `findHoldingCheckout`'s result (4.4.a) gains `{ kind: "unbound"; path; exits }` for a marker without a UID
          naming the owner request's current or a former name, and `checkMarkerExclusivity`'s refusal carries the same
          case. Callers that act on the holder refuse on it, naming its exits, as the scan refuses a marker whose
          ownership it cannot read (`readMarkerHolder`, `lib/locus/lifecycle-ports.ts`): exclusivity, rename, abandon,
          decomposition's retirement check, the sharing report, teardown (`holdingCheckout`, `teardown-store.ts`), and
          `arc locus release <slug>` (6.4). Where a bound match and an unbound holder are both found, each refuses
          naming both.
        - Callers that only list or report show the work unit as held at its bound checkout or, with none, at the
          unbound one, carrying the unbound marker's exits: materialize's candidates, start's already-started check,
          paused work, the in-flight projection, and materializable work units.
        - The sharing report gates handover alone: pause writes first and reports afterwards (`pause-handover.ts`), so a
          paused work unit's unbound holder reports its work as unobservable, naming the exits.
        - _Note:_ `createLocusPorts` takes 4.4's changes, this task's, and 6.5's; keep the classifier in its own module
          so the function stays within its limit.
        - Build `test-first` (one behavior at a time):
            - rename of a work unit with an unbound checkout naming its slug refuses naming the exits, and succeeds once
              `arc materialize <slug> --here` binds that checkout
            - an owner request that finds the holder's bound checkout and an unbound marker naming its slug refuses
              naming both
            - start's already-started check and paused work show the work unit held at the unbound checkout, with the
              exits
            - pausing a work unit with an unbound checkout pauses it and reports its work as unobservable, naming the
              exits

    - `[ ]` **6.1.c Marker occupancy and the cleanup sweep**

        - Marker occupancy (`inspectCheckoutMarker`, `lib/locus/marker-occupancy.ts`) and the stale-worktree selection
          (`selectCheckout`, `lib/session-init/store-worktree-selection.ts`) classify a marker without a UID through
          6.1.a before its claim lookup. Occupancy reports it as its own unbound occupancy carrying the classification;
          the sweep reports it as a release report whose actions are the classifier's exits, rather than as the warning
          `selectCheckout`'s other refusals become. `readWorkUnitOccupancy` keeps its listing and hands classification
          to the classifier, within its limit.
        - `missingRecord` stays for a bound marker whose claim and lineage find nothing, with today's release admission
          (`releaseAuthority`, `lib/locus/release.ts`) and no rerun. This replaces the by-name residue test for an
          unbound marker, which a reused slug defeats.
        - `terminal-occupancy-admission.test.ts`'s three cases withholding release for an abandoned, a decomposed, and a
          renamed origin invert, since such an unbound marker takes release alone (4.3.d keeps it without a UID), and
          `stale-worktree-store.test.ts`'s no-record report cases take the unbound report.
        - Build `test-first` (one behavior at a time):
            - marker occupancy refuses an unbound marker of a reused slug naming both holders and the exits, and a bound
              marker whose record and lineage are gone keeps today's release exit
            - the cleanup sweep reports an unbound marker with its exits bound to its checkout, and the checkout is free
              once the exit runs

    - `[ ]` **6.1.d The derived roster's work-unit evidence**

        - The work-unit evidence reduction (`readStoreWorkUnitEvidence`, `lib/locus/store-work-unit-evidence.ts`)
          recognizes a marker without a UID before its claim read (`readClaimedWorkUnit`) and returns a distinct
          diagnostic carrying the classifier's exits. The derived reader (`readDerivedLocusRoster`,
          `lib/locus/derived-reader.ts`) attaches them as actions bound to the checkout, in place of the
          `work-unit-record-missing` code and its `noRecordMarkerExit` advice, which for a live holder's marker would
          advise releasing a live work unit's checkout or a rerun Phase 5 refuses. `cleanupAuthorityRow`
          (`store-worktree-selection.ts`) admits that diagnostic as it admits `work-unit-record-missing` today, and the
          roster's claim read (`runStoreRoster`, `lib/git/worktree-roster.ts`) warns naming the exits.
        - _Note:_ `readDerivedLocusRoster` is over the function-length limit and in the suppression record; extract its
          residue block rather than growing it.
        - Build `test-first` (one behavior at a time):
            - `arc locus --json` reports a live holder's unbound marker with the bind and release exits, not the
              spawn-residue advice
            - the cleanup sweep admits that row, and the roster warns naming the exits

### `[ ]` **6.2 Give the current-work-unit resolver an unbound state, and refuse or warn at its callers — § 7.4**

- _Goal:_ The current-work-unit resolver reports an unbound marker as its own state, every caller acting on the
  checkout's one current work unit refuses it naming the exits, and readers that only report warn, so no verb acts on an
  unbound checkout and the exits print wherever a person meets it.

    - `[ ]` **6.2.a The resolver**

        - `readClaimedCurrentWorkUnit` (`lib/store/current-work-unit-marker.ts`) returns a tagged result, and
          `resolveCurrentWorkUnit` (`lib/store/current-work-unit.ts`) reports an unbound marker as
          `{ status: "unbound"; candidates: []; warnings; unbound }`, carrying 6.1.a's classification. The state is
          built in the marker reader or `resolution`, not in `resolveCurrentWorkUnit`, which the suppression record
          holds for complexity. The in-repo cold start's occupancy refusal (`coldStartOccupancyRefusal`,
          `commands/start.ts`) never meets it and type-checks over it through `candidates: []`.
        - Build `test-first` (one behavior at a time):
            - an unbound checkout resolves to the unbound state naming its slug's holders and exits

    - `[ ]` **6.2.b The callers that refuse**

        - A lifecycle verb run without an operand (`resolveCurrentWuSlug`, `resolvePublicationTarget`, and the store-arm
          target of `arc set-stage`, `arc finalize`, and `arc repoint-design` in `handleSetStage`,
          `handleFinalizeStage`, and `handleRepointDesign`, `handlers/lifecycle.ts`; `target`,
          `handlers/lifecycle-collaboration.ts`), `arc wu reconcile` (`handleStoreReconcile`, whose `storeReconcileSlug`
          then never reads an unbound marker's name), the task commands (`handlers/task.ts`), `arc handoff write`
          (`lib/handoff/write.ts`), `arc set-class` without a name (`lib/work-unit/verbs/set-class.ts`), the ambient
          `arc view` (`resolveStoreAmbientViewTarget`, `handlers/view-store.ts`), and the planning base sync
          (`handlers/base-sync-planning.ts`) refuse the unbound state naming the exits.
        - `resolveCurrentWuSlug` returns the slug or the unbound refusal, and `resolveVerbTargetOrReport` refuses with
          its reason, and under `--json` its exits as the remedy, in place of the verb-candidate list it prints for an
          unresolved checkout. The other callers render the classification's reason. The base sync consults the resolver
          on a detached HEAD alone, where the unbound state joins its existing refusal condition.
        - _Note:_ `handlers/lifecycle.ts` is over the file-length gate and in the suppression record; `handleSetStage`,
          `handleFinalizeStage`, and `handleRepointDesign` repeat one target block, which a shared helper replaces so
          the file's net length holds.
        - _Note:_ `feat/storage-ref-backend` edits `lib/handoff/write.ts`; re-check that branch before editing.
        - Build `test-first` (one behavior at a time):
            - `arc set-stage`, a task command, and `arc handoff write` in an unbound checkout each refuse naming the
              exits, and succeed once `arc materialize <slug> --here` binds it
            - `arc wu reconcile` without an operand in an unbound checkout refuses rather than reconciling by the
              marker's name, and finds no current work unit once `arc locus release` frees it

    - `[ ]` **6.2.c The shared work-unit resolution and its importers**

        - `resolveActiveWu` (`lib/release/wu-resolution.ts`) maps the unbound state to its `ambiguous` result with a
          hint naming the exits, so `arc release commit` and `arc release push` refuse with the hint, delivery refuses
          with `active-work-unit-unresolved` (`resolveDeliveryContext`, `handlers/delivery.ts`), and the notes sync's
          work-unit name (`resolveCurrentWuName`, `lib/user-sync/current-wu.ts`) falls back to the branch's slug. Its
          other importers, review, planning, delivery's entry and transfer, the sync audit, and pre-publication
          composition among them, take an unbound checkout as ambiguous, as they take a resolver warning today.
        - _Note:_ the release wrappers, delivery, and the notes sync inject no store, so `wu-resolution-store.test.ts`
          pins the mapping over the reference backend, and the consumers' own ambiguous-result tests cover their
          policies.
        - Build `test-first` (one behavior at a time):
            - `arc release commit` and `arc release push` in an unbound checkout refuse naming the exits, and succeed
              once the checkout is bound
            - delivery refuses with its generic refusal, and the notes sync uses the branch's slug

    - `[ ]` **6.2.d The readers that report**

        - The active-meta candidate read behind `arc active status` (`readHeldCandidates`, `lib/active/meta-reader.ts`)
          and the advisory notes reconcile's current-work-unit read (`resolveReconcileCurrentWorkUnit`,
          `handlers/user.ts`) take the unbound state as a warning naming the exits, the latter then running with no
          current work unit. `arc user reconcile-references` warns in human mode alone: its `--json` envelope
          (`UserReferenceReconcileSessionObjectSchema`, `lib/user-reference-reconcile-schema.ts`) carries no warnings
          and stays unchanged, and the exits print from `arc active status` and every verb that refuses. The local
          review gate's live context (`readLocalReviewLiveContext`, `scripts/review-gate/hosts/local/live-context.ts`)
          drops the warning, finds no work unit, and refuses `vehicle-unresolved`, as for an unresolved checkout today.
        - _Note:_ `handlers/user.ts` is over the file-length gate and in the suppression record; the warning spans
          `handleUserReconcileReferences` and `emitUserReferenceResult`, each kept within its limits.
        - Build `test-first` (one behavior at a time):
            - `arc active status` and `arc user reconcile-references` in an unbound checkout run with a warning naming
              the exits
            - the local review gate refuses `vehicle-unresolved`, and resolves once the checkout is bound

### `[ ]` **6.3 Bind an unbound marker through `arc materialize --here` and the cold start's rerun — § 7.4**

- _Goal:_ The two exits that bind admit an unbound marker: materialize stamps it onto the live holder the person names,
  and the cold start's rerun takes back its own leftover, each then succeeding.

    - `[ ]` **6.3.a `arc materialize <slug> --here`**

        - The occupancy guard (`readStoreOccupancy`, `lib/work-unit/lifecycle-guards.ts`), which start, resume, and
          materialize share, takes its subject's primary from an optional `primary` on its context (`GuardContext`,
          `lifecycle-executor.ts`): `validateStoreGuards` sets it from the primary it selects, as it gives
          `makePauseGuard` that primary, and `materializationOccupancy` (`materialize-store.ts`) sets it with a
          materialize-only `admitUnbound`. Given a primary, the guard matches a bound marker, and the checkout's current
          work unit, by that primary's UID rather than by name; with none, a creation's, no bound marker is its own. It
          admits an unbound marker naming the slug, and the resolver's unbound state, only on materialize's call and
          only where that record is `ownedInFlight`; start and resume refuse both. The admission moves into a helper
          within the guard's limit.
        - The spawn op (`ReconcileWorkUnitWorktreeOp`) gains a materialize-only `bind: { expected }`, the unbound
          marker's generation, which the guard's admission returns from the occupancy read it makes
          (`inspectCheckoutMarker`) and `runStoreMaterialize` passes into the op. The in-place leg
          (`reconcileWorkUnitWorktree`) resolves its checkout before its exclusivity check and passes it as
          `checkoutPath`. With `bind`, it stamps the marker by its generation (`writeAnchoredMarker` with `expected`),
          adding the UID and keeping the marker's other fields, `spawnedByArc` among them; without it, the leg refuses
          an existing marker or writes a fresh one setting `spawnedByArc: false`, as today, so graduation `--here` keeps
          refusing (`lifecycle-default-locus-ports.test.ts`). `listStoreMaterializable` passes the same `checkoutPath`
          to `findWorkUnitHoldingCheckout`.
        - _Note:_ `reconcileWorkUnitWorktreeUnlocked` is over the function-length limit and in the suppression record;
          extract the stamp into a helper.
        - Build `test-first` (one behavior at a time):
            - materialize `--here` binds a marker written before the flip to its live holder, keeping `spawnedByArc`,
              and the checkout's verbs then act on that holder
            - it binds one while another owned work unit's checkout is unbound too
            - it refuses an unbound marker whose live holder it does not admit, naming the release exit, and the release
              then frees the checkout
            - a creation interrupted after its create batch commits, before its stamp, binds through it and then
              resolves
            - `arc start <slug> --here` of the live holder in a bound checkout of the archived holder refuses at the
              occupancy guard, which matches the marker by UID

    - `[ ]` **6.3.b The cold start's rerun**

        - `runStoreColdStart` checks the resolver first and admits an anchored unbound marker whose slug neither the
          slug lookup nor the lineage arm finds, 6.1.a's rerun exit, replacing it at its observed generation under any
          name, as `start-cold-store.test.ts` pins today. Today's admission (`missingRecord`) reads the work-unit claim
          and misses an Errand's, a cohort's, or a former slug, and it no longer admits a bound marker whose claim and
          lineage find nothing, which reruns no creation and keeps release alone (6.1.c).
        - Build `test-first` (one behavior at a time):
            - a cold start interrupted after its marker write, before its create batch commits, reruns in the same
              checkout and succeeds
            - a leftover whose slug an Errand, a cohort, or a former slug holds refuses the rerun and offers release,
              and a cold start under another name succeeds once release frees it
            - a bound marker whose record and lineage are gone refuses the rerun and offers release

### `[ ]` **6.4 Release in the order the slug's lookup fixes — § 7.3, § 7.4**

- _Goal:_ `arc locus release` frees any unbound marker from its own checkout, and `arc locus release <slug>` acts on the
  live holder's checkout or, where no binding recovers it, on the one unbound marker naming the slug, so a completed
  holder's stamped checkout and a crashed reuse's unbound marker never both match.

    - `runLocusRelease` (`lib/locus/release.ts`) resolves the slug through the lookup first. Where it returns a live
      holder, release passes that holder's owner request (6.1.b); an unbound holder of the slug refuses where
      materialize admits that holder for the invoking identity (`ownedInFlight`), since binding recovers it, and is
      otherwise released as below. Where the lookup refuses other than `not-found`, release refuses with it and names
      the unnamed form. Otherwise, for a completed holder or nothing, it matches only the unbound markers naming the
      slug and releases the one it matches from wherever it runs, refusing on several and naming each. A selector
      function carries the order, keeping `releaseAuthority` within its limit.
    - `releaseAuthority` admits an unbound marker, the unnamed form in the checkout it runs from and the named form
      where the order above matches it. A completed holder's stamped checkout is released from inside it by a
      non-owner's unnamed form; its owner is sent to teardown, as today.
    - Build `test-first` (one behavior at a time):
        - `arc locus release` frees an unbound marker from its own checkout, and the next creation of the slug succeeds
        - `arc locus release <slug>` frees the one unbound marker of a slug with no live holder from another checkout
        - with a completed holder's bound checkout lingering and a crashed reuse's unbound marker present,
          `arc locus release <slug>` frees only the unbound marker
        - it refuses where the slug's live holder that materialize admits has an unbound checkout, naming the unnamed
          form, and acts on that holder's checkout once materialize binds it; it frees a backlog stub's unbound marker,
          as `lifecycle-default-locus-ports.test.ts` pins
        - it refuses where the slug's lookup refuses `ambiguous-match`, naming the unnamed form
        - it refuses on two unbound markers naming the slug, naming each, and frees the remaining one by name once the
          unnamed form frees the other

### `[ ]` **6.5 Print the unnamed release form at every exit that locates a checkout — § 7.5**

- _Goal:_ An exit that locates a checkout prints the unnamed release form, run in that checkout, rather than a slug that
  may resolve to another holder.

    - The marker exits (`workUnitMarkerExit` and `noRecordMarkerExit`, `marker-occupancy.ts`), whose `arc pause <slug>`
      stays named; the stale-worktree sweep's release action (`release`, `store-worktree-selection.ts`), which gains the
      `checkout` its argv runs in, since the unnamed form acts on the checkout it runs from; the derived row's
      spawn-residue action (`lib/locus/derived-reader.ts`); and the exclusivity refusal a crashed creation's retry
      prints (`refusal`, `createLocusPorts`, `lifecycle-ports.ts`), for an owner and a creation request alike.
    - The tests that pin the named form change: `start-cold-store.test.ts`, `lifecycle-default-locus-ports.test.ts`,
      `lifecycle-marker-occupancy.test.ts`, `stale-worktree-store.test.ts`, `derived-store-evidence.test.ts`,
      `materialize-store.test.ts`, and `spawn-rollback-ownership.test.ts`.
    - Build `test-first` (one behavior at a time):
        - each of the four exits prints `arc locus release` naming the checkout to run it in, and no slug, and the
          sweep's action carries that checkout

### `[ ]` **6.6 Unbound markers end to end** — validate exit criterion at segment scope

- _Goal:_ The segment's exit criterion holds end to end: an unbound marker refuses where it is acted on, warns where it
  is reported, and each exit binds or releases it and then succeeds.

    - Over the reference backend, write a marker without a UID as one written before the flip would be, and interrupt
      one creation before its create batch commits and one after; run the acting readers, `arc release commit` and
      `arc release push`, `arc active status`, and `arc user reconcile-references` in each; then bind with
      `arc materialize <slug> --here`, rerun the cold start, release with `arc locus release` and
      `arc locus release <slug>`, and release and rerun a crashed creation of a reused slug, confirming each
      continuation succeeds.
    - Request `arc check segment` after the scenario checks.
    - _Note:_ from Phase 4 until this phase, a marker without a UID resolves as not found and owner requests pass over
      it; no flip lands between them.

## **Phase 7:** An ended holder's cleanup

_Purpose:_ Find an ended holder by its UID at every cleanup exit and in teardown, report a work-unit husk for a manual
decision, and keep teardown off any checkout, branch, or remote the retiring holder no longer owns or cannot prove.

_Mode:_ `slice` — closes on the archived holder of a reused slug torn down with the live holder untouched.

_Exit criterion:_ Over the reference backend, with a live holder and a bound checkout of the archived holder of one
slug, session start offers the archived checkout's teardown by UID and no branch cleanup while the live holder links the
branch; `arc teardown <uid>` tears that checkout down and leaves the live holder's checkout, local branch, and remote in
place; a work-unit husk reports a manual decision at every exit, with no command naming its slug;
`arc teardown --branch` still removes a branch husk; an abandoned holder's teardown still reaps its own branches;
`arc teardown <uid>` resolves a retired origin through its lineage; and under `discard` teardown keeps and reports a
remote whose advertised tip its local branch does not contain.

_Design decisions:_ Session start's teardown offers and husk rendering live in the shipped session-init template, so its
edits land in package source and sync to `.arc/`.

### `[ ]` **7.1 Resolve each cleanup exit's ended holder by UID — § 8.1**

- _Goal:_ Each exit that holds an ended holder's checkout or branch resolves the holder by its UID, a checkout's through
  the claim arm and a branch's through the `ref` arm, and reads retirement evidence by that reference, so no exit
  reaches the live namesake or offers a command naming a slug that resolves to it.

    - `[ ]` **7.1.a Retirement evidence by reference**

        - `readStoreRetirementEvidence` (`lib/work-unit/store-retirement-evidence.ts`) takes the subject's reference
          rather than its name, and reads a retired origin's lineage through the `lineage` arm by its UID
          (`LookupInputSchema`'s `origin`).
        - `TeardownParams` (`lib/work-unit/verbs/teardown.ts`) takes a typed subject in place of `name`,
          `{ kind: "slug"; slug }` or `{ kind: "owner"; owner }`, which `runStoreTeardown` resolves through one helper
          before the evidence read: the helper owns the slug lookup and a retired origin's lineage lookup by name,
          throwing 3.2.c's `StoreRefusalError` on their refusals, and takes an owner as given. The in-repo
          `runTeardown`, whose callers all pass a slug subject, reads its slug in a one-line edit, and `teardown.ts`'s
          other edits are type-only.
        - _Note:_ 3.2.c, this task, and 7.4.b each edit `readStoreRetirementEvidence`, which is near the complexity
          limit; extract its lineage read.
        - Build `test-first` (one behavior at a time):
            - with a live and an archived holder of one slug, evidence read by the archived holder's reference reads it
              ended
            - a retired origin's evidence reads through its lineage by UID

    - `[ ]` **7.1.b The session-start exits**

        - The stale-worktree sweep (`selectStoreWorktreeCleanup`, `store-worktree-selection.ts`, whose `ended` entries
          gain the holder's owner in place of its name), the missing-worktree check (`readStoreMissingFolderActions`,
          `lib/session-init/missing-worktree-store.ts`), the orphan advisory (`orphan-store-candidates.ts`, rendered in
          `orphan-branch-sweep.ts`), and the retirement sweep (`hasAbandonment`, `store-retirement-sweep.ts`) resolve
          their holder by UID, the retirement sweep reading its evidence by the owner subject (7.1.a). Each offer names
          its holder through one helper (`teardownOperand`, beside `readStoreRetirementEvidence`): by slug only where
          the slug is not UUID-shaped and its lookup returns exactly that holder, and by UID otherwise, a refused lookup
          included. A UUID-shaped display name, classified as the command's operand in 7.4.a, always yields the holder's
          own UID; 7.1.c and 7.1.d use the helper too. For a store-arm ended checkout, branched or detached, the sweep's
          report (`inspectBranchedRemoval`, `stale-worktree-sweep.ts`, shared with the in-repo arm) carries that
          operand's teardown as `teardown` (`{ argv, text }`, the retirement report's shape,
          `stale-worktree-sweep-schema.ts`), and its teardown action takes the same operand in place of the marker's
          `wuName`; the orphan advisory's shipped report carries its teardown as `teardown` too
          (`orphan-branch-sweep.ts`). The in-repo arm's reports carry no `teardown` and keep their actions as today.
        - Branch-gone recovery's teardown offer (`inferBranchGoneRecovery`, `lib/session-init/recommended-action.ts`,
          from `CascadeCandidate.workUnitName`, `branch-gone-recovery.ts`) holds no store, so it names the derived row's
          UID where the row carries one, and its name otherwise, as an in-repo row carries none.
        - `session-init.template.md` offers a stale-worktree or orphan report's `teardown` where it carries one, the
          command the CLI composes, and otherwise composes `git worktree remove {worktreePath}` or
          `arc teardown {shippedWorkUnit}` from the report's fields as today, so the in-repo arm's offers are unchanged;
          it gains a rule for the store arm's ended `detached` report.
        - _Note:_ `runStaleWorktreeSweep` is over the function-length and complexity limits and in the suppression
          record, so carry the operand through a helper; `readStoreMissingFolderActions`, `readOrphanStoreCandidates`,
          `selectStoreWorktreeCleanup`, and `buildWorktreeCandidate` sit at or near the complexity limit.
        - Build `test-first` (one behavior at a time):
            - with a live holder and a bound checkout of the archived holder, the stale-worktree sweep offers the
              archived checkout's teardown by UID, branched or detached, and never lists the live holder's checkout
            - with the archived holder's branch, which the live holder does not link, and no checkout of it, the orphan
              advisory names the archived holder's UID in its teardown offer, and with that checkout registered but its
              folder missing, so does the missing-worktree check
            - branch-gone recovery offers teardown by the archived holder's UID, and by an in-repo row's name
            - with a live namesake beside an abandoned holder's bound checkout, the retirement sweep offers the
              abandoned holder's teardown by UID
            - an ended holder whose non-UUID-shaped slug resolves to it is offered by slug, as today
            - an ended holder whose slug's lookup refuses is offered by UID
            - an ended holder whose UUID-shaped display name differs from its UID is offered by its own UID, even
              where that name's slug lookup resolves to it
            - the in-repo arm's stale-worktree and orphan reports carry no `teardown` and keep today's actions

    - `[ ]` **7.1.c Locus release's ended remedy**

        - `releaseAuthority`'s ended remedy (`lib/locus/release.ts`) names the holder its occupancy resolved by the
          marker's UID (4.3.b) through 7.1.b's helper.
        - Build `test-first` (one behavior at a time):
            - release from a bound checkout of the archived holder names the archived holder's teardown by UID

    - `[ ]` **7.1.d Marker occupancy's teardown remedies**

        - `readWorkUnitOccupancy` and `workUnitMarkerExit` (`marker-occupancy.ts`, which materialize's refusal reuses,
          `materialize-store.ts`) name the holder through 7.1.b's helper in their teardown remedies, for a retained
          lineage, a completed holder, and an Integrating one.
        - Build `test-first` (one behavior at a time):
            - from a bound checkout of the archived holder beside a live namesake, the occupancy refusal names
              `arc teardown <uid>` for it; from a checkout of a retired origin whose lineage is retained and whose slug
              another holder took, it names the origin's UID; and an Integrating holder's checkout, whose slug resolves
              to it, keeps the slug

### `[ ]` **7.2 Report every work-unit husk for a manual decision — § 8.1**

- _Goal:_ From the flip every work-unit husk, which predates the flip and carries in-repo evidence the store teardown
  never admits, reports a manual decision with no teardown command at every exit, reads as retired rather than holding
  its slug, and is never counted in flight.

- _Note:_ session start's rendering lives in the shipped `session-init.template.md`
  (`packages/arc-framework/arc/system/workflows/arc/session-lifecycle/`); edit it in package source in the
  shipped-content register, load `strategy-workflow-authoring.md` before editing, and sync the `.arc/` copy.

    - `[ ]` **7.2.a The stamp**

        - `decodeWorktreeHuskStamp` (`lib/git/worktree-marker.ts`) takes an arm option, in-repo by default. In the store
          arm every work-unit husk's stamp, a `legacy` one included, reads `manual-only` with a pre-flip reason that the
          closed reason set gains, in `DecodedWorktreeHuskStamp`, `HuskCleanupDecision` (`lib/git/worktree-cleanup.ts`),
          and the sweep report's decision union (`stale-worktree-sweep.ts`). The sweep passes the store arm from its
          store's capability (`stateOffBranch`), and the current-husk advisory (`deriveCurrentHuskAdvisory`, reached
          from `handlers/status.ts`) passes it likewise; marker occupancy reads the husk without the decoder (7.2.c).
        - The store teardown's `--husk` replay (`selectStoreRetirementHusk`, `lib/work-unit/store-retirement-husk.ts`)
          keeps the default decode. It admits only a stamp whose evidence matches the selected store version
          (`huskEvidenceMatches`), which no shipped path writes, so it refuses every pre-flip husk as today, and
          `retirement-store.test.ts`'s replay cases pass unchanged.
        - The published schemas carrying the reason sets (`CurrentHuskAdvisorySchema`,
          `lib/session-init/current-husk-advisory.ts`; `HuskCleanupDecisionSchema`, `stale-worktree-sweep-schema.ts`),
          which `lib/session-envelope/registry.ts` and `commands/status/schema.ts` import, change in place.
        - Build `test-first` (one behavior at a time):
            - a work-unit husk stamped `shipped` or with `git-transition` evidence reads `manual-only` with the pre-flip
              reason in the store arm, and as today in the in-repo arm
            - the store teardown's `--husk` replay still tears down a husk whose evidence matches, and refuses one
              carrying in-repo evidence

    - `[ ]` **7.2.b The derived row and the roster**

        - The work-unit reduction (`readStoreCheckout`, `lib/locus/derived-evidence.ts`) keeps the husk fact before
          `projectMarker` drops it and returns before the claim with terminal evidence of the shape it reads for a work
          unit with only lineage (`readRemovedWorkUnit`, `store-work-unit-evidence.ts`), built without a lineage read,
          so the row is `retired` with a subject carrying no UID and no context. The store roster marks a husk's entry
          `retired` (`runStoreRoster`), so it is never in flight (`isInFlightWorkUnitRosterEntry`).
        - In the store arm the duplicate-marker guard (`guardDuplicateMarkerClaims`, `lib/locus/derived-reader.ts`)
          passes over a `retired` row without a UID, which only a husk's row is there, so a husk never groups with
          another row of its slug (4.5.a); the in-repo arm's grouping is unchanged.
        - `cleanupAuthorityRow` (`store-worktree-selection.ts`) already admits a `retired` row with no diagnostics, and
          session guidance already names its path alone (`renderDerivedCleanup`, `lib/locus/session-guidance.ts`); tests
          pin both.
        - _Note:_ `projectMarker` holds the file's suppressed complexity, so the husk check goes in `readStoreCheckout`;
          `runStoreRoster`'s per-entry callback is near the complexity limit.
        - Build `test-first` (one behavior at a time):
            - a work-unit husk's row is `retired` with no UID and no context, and the duplicate-marker guard and the row
              readers never match it to a holder
            - two husks of one slug, and a husk beside an unbound marker of its slug, each stay `retired`, with no locus
              conflict
            - the store roster marks it `retired` and counts it out of flight

    - `[ ]` **7.2.c The exits**

        - `inspectCheckoutMarker` (`marker-occupancy.ts`), the stale-worktree sweep's husk report (`inspectHuskRemoval`
          and `withHuskActions`, `stale-worktree-sweep.ts`), and the current-husk advisory
          (`resolveCurrentHuskAdvisory`) report the husk for a manual decision with no teardown command, whatever its
          slug resolves to. The sweep pairs the stamp with a `blocked` decision carrying the same reason, as it pairs an
          `evidence-mismatch` stamp today, and the template's primary-checkout sweep section maps the reason as manual
          cleanup. The template's current-husk section, which already renders a manual-only reason with no command, is
          unchanged, and marker occupancy's branch-husk arm prints `arc teardown --branch <ref>`, the form the command
          takes, where it prints `arc teardown <branch>` today, which the slug operand rejects.
        - `lifecycle-marker-occupancy.test.ts`'s husk case, which expects `arc teardown old`, takes the manual decision.
        - _Note:_ `inspectHuskRemoval` sits at the complexity limit; extract the store arm's decision.
        - Build `test-first` (one behavior at a time):
            - the current-husk advisory in a work-unit husk's own checkout reports a manual decision with the pre-flip
              reason and no command
            - the primary checkout's sweep reports the husk `blocked` with the manual reason and no command naming its
              slug
            - marker occupancy in a branch husk's checkout names `arc teardown --branch <ref>`
            - `arc teardown --branch` still removes a branch husk

### `[ ]` **7.3 Pass the retired primary's reference into teardown — § 8.2**

- _Goal:_ Abandon and decomposition tear down the record they retired, never a namesake, and their retries name its UID.

    - Abandon's and decomposition's teardown steps (`runStoreTeardown`, from `lib/work-unit/verbs/abandon-store.ts` and
      `lib/decompose/retirement.ts`) pass the retired primary's owner as 7.1.a's subject, whose lineage the `lineage`
      arm finds by UID, and their retry commands name that UID.
    - The tests pinning the retry `["arc", "teardown", "demo"]` take the UID: `retirement-store.test.ts`,
      `abandon-store.test.ts`, `decompose/retirement.test.ts`, and `retirement-scenario.test.ts`.
    - Build `test-first` (one behavior at a time):
        - abandoning a reused slug's live holder tears down its own checkout and reaps its own branches, leaving the
          completed holder's evidence unread
        - a failed teardown step's retry names the retired holder's UID

### `[ ]` **7.4 Take `arc teardown <slug|uid>`, and find its checkout by UID — § 8.3, § 8.4**

- _Goal:_ `arc teardown` selects an exact owner by UID or a slug through the lookup, and finds its subject's checkout by
  the evidence owner's UID, so a teardown by UID never takes the live holder's checkout for its subject's.

    - `[ ]` **7.4.a The operand**

        - The operand (`TeardownCommandInputSchema` and its registration in `lifecycleCommandInputRegistrations`,
          `handlers/lifecycle.ts`; `.command("teardown [name]")`, `cli.ts`; and its help, `cli-help-summaries.ts`)
          admits a UUID, upper case included, beside a slug, and keeps its `name` key, so the registration's
          `operand.name` and the repository inventory's derivation from `cli.ts` stay aligned.
        - The handler uses the same UUID classification as 7.1.b's offer helper and parses a UUID-shaped operand into
          7.1.a's owner subject through a store-level UID scan of the work-item listing, extracted from the inbox's
          (`primaryByUid`, `lib/inbox/lists.ts`), which the inbox then calls: it lowercases the operand, returns the
          primary carrying the UID with its record kind, or none, refuses `ambiguous-match` where several carry it, as
          the inbox's does today, and refuses an incomplete listing, leaving each caller its own type rule. Where no
          primary carries the UID, teardown asks the `lineage` arm, and it refuses an Errand's UID and a UID neither
          finds. Any other operand is the slug subject. A UUID-shaped slug, which `SlugSchema` admits, so selects by
          UID, and its holder stays reachable by its own UID. The in-repo arm takes every operand as a slug.
        - _Note:_ `handleTeardown` holds `handlers/lifecycle.ts`'s suppressed function length and one of its suppressed
          complexities; parse the operand in a helper.
        - _Note:_ `feat/storage-ref-backend` edits `cli.ts` and `cli-help-summaries.ts`; re-check that branch before
          editing them.
        - Build `test-first` (one behavior at a time):
            - `arc teardown <uid>` of an archived holder selects it while a live holder holds its slug
            - regression pin: `arc teardown <uid>` of a retired origin resolves through its lineage, since a UUID passes
              `SlugSchema` and reaches the lineage arm today
            - an Errand's UID, an unknown UID, and an incomplete listing refuse
            - an upper-case UID selects its holder, and the inbox's UID selector still refuses several matches
              `ambiguous-match`
            - `arc teardown <slug>` resolves through the lookup as today
            - the generated teardown offer for an ended holder whose UUID-shaped name differs from its UID selects
              that holder, leaving a second record whose UID equals the display name unchanged

    - `[ ]` **7.4.b The checkout and the retries**

        - Teardown's holder lookup takes the evidence owner's UID from 4.4.b. Its selection check
          (`readTeardownSelection`, a `TeardownContext` field bound in `executor-context.ts`,
          `store-teardown-context.ts`, and `handlers/lifecycle.ts`, whose logic, `classifyTeardownSelection` and
          `subjectsEqual` in `lib/work-unit/teardown-selection.ts`, compares work-unit subjects by name today) matches
          that UID, which `TeardownSelectionRequest.subject` carries. `holdingCheckout`'s own scan (`resolveLegacy`,
          `lib/work-unit/verbs/teardown-store.ts`), serving only where no locus ports are bound, matches by UID from the
          flip. An unbound holder refuses with its exits (6.1.b).
        - When teardown ran by UID, every retry it names carries the UID: its retry remedy (`teardownRetryRemedy`), the
          lineage repair text (`store-retirement-evidence.ts`), and the `--husk` replay's retry
          (`store-retirement-husk.ts`).
        - _Note:_ this task's and 7.5's destructive tests run in `retirement-store.test.ts`, over real Git with a bare
          origin, extended to seed both holders and, in the cases these tasks add, to bind the real `createLocusPorts`,
          selection reader, and teardown driver, which it stubs today; its existing cases keep their stubs. Until
          7.5.a's gate, `prepareCreatedBranch` returns any clean checkout on a linked branch to base, so this task's
          fixture keeps the live holder's checkout off the archived holder's linked branch.
        - _Note:_ `lib/work-unit/verbs/teardown.ts` is over the file-length gate and in the suppression record; keep
          each edit inside its existing functions' limits.
        - Build `test-first` (one behavior at a time):
            - with a bound checkout of each holder of a reused slug, `arc teardown <uid>` of the archived holder removes
              its checkout alone
            - the selection check refuses a checkout whose marker carries another holder's UID
            - teardown by UID with an unbound checkout naming the slug refuses naming the exits
            - a retry after a failed teardown by UID names the UID

### `[ ]` **7.5 Touch only a branch the retiring holder owns, and delete a remote only at a held tip — § 8.5, § 8.6**

- _Goal:_ Teardown never returns a live holder's checkout to base, deletes its local branch, or deletes its push: it
  keeps and reports a branch another live holder owns or the lookup cannot prove, and a remote whose advertised tip its
  local branch does not contain.

    - `[ ]` **7.5.a The branch gate**

        - A gate runs before the retiring link's `prepareCreatedBranch` (`reapRetirementLinks`, `teardown-store.ts`)
          and, for every other created link, in `reapAdditionalBranch` before `reapZeroDeltaBranch`. It looks the branch
          up through the `ref` arm by the link's `repository` and `ref` exactly. It proceeds where the lookup finds no
          record, as for an abandoned or decomposed holder whose links moved to its lineage (`retiredBranches`), or
          returns the subject or a completed holder. Where the lookup returns a live holder other than the subject, or
          refuses, it keeps the checkout, the local branch, and the remote and reports each, naming the holder by UID; a
          link so kept never counts as the blocked cleanup that fails the teardown.
        - An adopted link a live holder links drops its owner-cleanup advice (`reportAdopted`), which would advise
          deleting that holder's branch.
        - Build `test-first` (one behavior at a time):
            - tearing down the archived holder of a reused slug leaves the live holder's checkout on its branch, the
              local branch, and the remote, and reports each kept naming the live holder
            - a zero-delta additional branch a live holder links is kept and reported while the teardown completes
            - a branch two live holders of distinct names link is kept and reported, built over the reference backend,
              which checks a branch's uniqueness only at activation (`branchLinkedElsewhere`)
            - a branch the lookup resolves to a completed holder other than the subject proceeds and is reaped
            - an adopted link a live holder links reports no owner-cleanup advice
            - an abandoned holder's teardown still reaps its own branches

    - `[ ]` **7.5.b The remote's tip**

        - Under `discard`, teardown deletes the remote branch only when the advertised tip is contained in this
          machine's local branch for the retiring holder (`generation.localHead`, `selectRetiringLinks`), and otherwise
          keeps it and reports it, as `landed` keeps a remote whose commits have not landed (`reapRetiringRemote`). A
          kept remote keeps its tracking ref, and an advertised tip whose object this machine lacks counts as not
          contained (`isContainedIn`).
        - `retirement-store.test.ts`'s tracking variants, which assert `remoteBranchDeleted: true` under `discard`,
          change where the local branch lacks the tip.
        - Build `test-first` (one behavior at a time):
            - under `discard`, a remote whose advertised tip the local branch contains is deleted
            - a remote whose advertised tip the local branch does not contain, or on a machine without the local branch,
              is kept and reported with its tracking ref

### `[ ]` **7.6 An ended holder's cleanup end to end** — validate exit criterion at segment scope

- _Goal:_ The segment's exit criterion holds end to end: the archived holder of a reused slug is torn down by UID with
  the live holder's checkout, branch, and remote untouched, and every work-unit husk reports a manual decision.

    - Over the reference backend, with a live holder and a bound checkout of the archived holder of one slug, run
      session start's sweeps, confirming the offers the template renders name the archived holder's UID, and
      `arc teardown <uid>` of the archived holder; place a work-unit husk and run session start in the primary checkout
      and in the husk's own; tear down a branch husk with `arc teardown --branch`, an abandoned holder, and a retired
      origin by UID; and run a `discard` teardown against a remote whose tip the local branch lacks.
    - Request `arc check segment` after the scenario checks.

## **Phase 8:** The ref backend's lookup

_Purpose:_ Bring the lookup's rules to the ref backend once it lands on `main`, and pin every rule for every store-arm
backend in the lookup conformance suite.

_Mode:_ `layer` — closes on the lookup's rules holding over both store-arm backends.

_Exit criterion:_ The lookup conformance suite's assertions for a cohort-held slug, the completed tie-break and the ties
it leaves refusing, the ranked `ref` arm and its live tie, the UID-matched work-unit claim, and the completed tie's
facts pass over the reference backend and the ref backend; each backend's own tests pin a live slug-arm tie's facts and
the cohort ranking the shared fixture cannot build; and the ref backend's lookup tests pass, with the cases this phase
changes rewritten.

_Design decisions:_ The phase starts once the ref backend has landed on `main` and this branch has merged it (§ 10.2),
an ordering the spec records rather than a dependency edge.

### `[ ]` **8.1 Break a completed tie, and set the tie's facts, in the ref backend's slug arm — § 1.2, § 1.5**

- _Goal:_ The ref backend's slug lookup resolves a completed tie that includes a work unit to its latest archived work
  unit, as the reference backend does, and names a tie's tier on its refusal, while its name-only reference binding
  keeps refusing a completed tie.

- _Context:_ the ref backend lands on `main` with the expected contracts the spec states (§ 11): its slug ranking
  (`rankNameTrees` under `preferredNameTrees`, `lib/store/ref/lookup-primary.ts`) already tiers work-item and cohort
  trees, each archived lookup tree carries its folder's placement (`RefLookupTree.archived`, `lib/store/ref/lookup.ts`),
  and the backend already orders one owner's archived folders (`latestArchivedFolders`, `archive-read.ts`). A contract
  that differs when it lands routes to a spec amendment before this phase proceeds.

    - The slug lookup's candidates (`slugCandidates`, `lib/store/ref/lookup.ts`) break a completed tie as 1.2 states,
      through one helper in the ref backend that reads each archived tree's folder placement with 1.2's comparator and
      that 8.2.a's `ref` arm shares. `preferredNameTrees` and `rankNameTrees` are unchanged, so name-only reference
      binding (`resolveCapturedReference`, `reference-resolution.ts`), which serves read, write binding, write views,
      and changes, still refuses a completed tie, as `store-ref-name-resolution.test.ts` pins.
    - `slugCandidates` reads the tie's facts from the tier's trees, its liveness from `liveRef` and its name from each
      tree's metadata, and `lookupCapturedRefTrees` sets them as the refusal's `tie` (1.4.a); its other caller
      (`write-views.ts`) is unchanged.
    - With both backends breaking the tie, status's dependency resolution never meets a completed tie of work units, and
      its branch for one (`resolveName`'s `ambiguous-match` case, `lib/status/store-project-dependencies.ts`) is
      removed.
    - `store-ref-lookup-ended.test.ts`'s cases naming two completed holders of one slug, under the current and a former
      name, take the latest archived holder; its refusing pins move to a completed tie that includes a cohort and to one
      of Errands alone.
    - Build `test-first` (one behavior at a time):
        - over the ref backend, two and three completed generations of one slug resolve to the latest archived work
          unit, under the current or a former name, and a completed work unit outranks a completed Errand
        - a completed tie that includes a cohort, one of Errands alone, and a live tie refuse with their tier
        - a name-only read of a completed tie still refuses
        - the claim, commit, and lineage arms' `ambiguous-match` carries no `tie`

### `[ ]` **8.2 Rank the ref backend's `ref` arm, and match its work-unit claims by UID — § 1.3, § 1.4, § 1.5**

- _Goal:_ The ref backend resolves a reused slug's branch to its live holder and each work-unit claim to the owner with
  its UID, live or archived, and nothing without one.

    - `[ ]` **8.2.a The `ref` arm**

        - `lookupCandidates` (`lib/store/ref/lookup.ts`) ranks the primaries linking a branch as 1.3 states, breaking a
          completed tie through 8.1's helper, and sets the tie's liveness. Its `ref` case moves into its own function,
          keeping `lookupCandidates` within its limit.
        - That function is conclusive for the skipped-ref refusal (`lookupSkippedRefusal`) only on a live match, as the
          slug arm is, so an unreadable work or cohort ref beside a completed linker refuses `skipped` rather than
          resolving the completed holder, where any match is conclusive today.
        - Build `test-first` (one behavior at a time):
            - over the ref backend, a branch linked by a completed and a live holder resolves to the live holder, and
              one linked by two live holders refuses with its tier
            - an unreadable work ref beside a completed holder linking the branch refuses `skipped`

    - `[ ]` **8.2.b The claim arm**

        - `claimLookupCandidates` (`lib/store/ref/lookup-claims.ts`) matches a work-unit claim by its UID alone,
          ignoring its slug, as 4.3.a's reference backend does, to the one owner with that UID, archived owners included
          (`readLookupTrees`, `lookup-trees.ts`), and resolves one without a UID to `not-found`. It compares the name
          before the kind today.
        - `store-ref-lookup-claims.test.ts`'s case resolving a work-unit claim by slug sends the seeded owner's UID. A
          claim without a UID resolves to `not-found` before the skipped-ref check, so
          `store-ref-broken-lookup.test.ts`'s claim, which sends none, carries an unknown UID and still refuses
          `namespace-corrupt`.
        - Build `test-first` (one behavior at a time):
            - over the ref backend, a reused slug's claims resolve the live and the archived holder each by its own UID,
              and a claim carrying a holder's UID beside another slug resolves to that holder
            - a claim without a UID resolves to `not-found`

### `[ ]` **8.3 Pin the lookup's rules in the conformance suite — § 1, § 10.2**

- _Goal:_ Every store-arm backend the shared suite registers is held to the lookup's rules, so no backend can drift from
  them unnoticed.

    - `suite-lookup.ts` (`__tests__/helpers/store/`) gains the assertions public writes can build on both backends: a
      slug a cohort holds resolving to the cohort's document, the completed tie-break over reuse, three generations
      included, under the current and a former name, a completed work unit above a completed Errand, the completed ties
      it leaves refusing (one that includes a cohort, and Errands alone), the ranked `ref` arm and its live tie with
      that tie's facts, built from two live holders of distinct names linking one branch, the UID-matched work-unit
      claim and a claim without a UID, and the completed tie's facts on both arms. `checkout-work-unit-claim` already
      sends the owner's UID (4.3.d). The in-repo registration, whose slug lookup resolves only a work unit's meta
      (`lookupSlug`, `lib/store/in-repo/lookup.ts`) and where a slug has one holder, declares them skipped
      (`familyExclusions.assertions`).
    - A live slug-arm tie's facts and the cohort ranking under a former name stay in each backend's own tests, under a
      named exclusion: the reference backend admits a live slug clash only across types and records no cohort former
      name through writes, and the ref backend refuses every live slug clash at a write (`checkLiveNamespace`). They are
      `reference-lookup-ranking.test.ts`'s planted cases and the ref backend's planted owners (`plantOwner`,
      `store-ref-lookup.test.ts`).
    - Build `test-first` (one behavior at a time):
        - each shared assertion passes over the reference backend and the ref backend, and the in-repo registration
          reports them skipped
        - each backend's own tests pin a live slug-arm tie's facts and a cohort holding a slug as a former name

## **Phase 9:** Verification

### `[ ]` **9.1 Complete verification** — load and follow `verify-work-unit.md`

---

## Success Criteria

Each holds over the reference backend, and over the ref backend from Phase 8.

- `[ ]` With a completed and a live holder of one slug, every store-arm lifecycle verb acts on the live holder:
  `arc activate` succeeds where it rejects "is not a Planning work unit held in active placement" today, and a former
  slug typed as the operand acts on its live holder.

- `[ ]` The dependency reconcile resolves each name an edge meets once and decides by reference: an edge naming a reused
  slug classifies against the live holder and is not discharged; an edge on a completed work unit's former name is
  discharged with no self-dependency where the dependent has taken that work unit's current name; an edge on a live work
  unit's former name takes its current name only where that name's lookup returns the same work unit, and is held
  otherwise; and a decomposed origin's replacement target carrying a UID resolves to that work unit under its current
  name.

- `[ ]` `arc stub`, `arc start <name> --new` spawned and `--here`, the nameless cold start, decomposition's work-item
  names, and Errand promotion admit a slug whose holders are all completed work units under it as their current name, a
  third generation included, or a completed work unit and a completed Errand; and refuse a live holder's slug, a
  completed Errand's or cohort's slug, and a completed holder's former slug, each with its remedy; a new cohort refuses
  a completed work unit's slug.

- `[ ]` Creating onto a completed holder's slug settles a stub's edge naming it in the same batch, and an in-flight
  dependent's edge refuses through `work-item.slug-edges` with its remedy.

- `[ ]` A cohort-held slug resolves to the cohort, and each reader that requires a work unit reports it as a cohort; a
  completed tie that includes a work unit resolves to its latest archived work unit, above a completed Errand, while a
  live tie and a completed tie that includes a cohort or holds only Errands refuse, each naming its tier; the `ref` arm
  resolves a reused slug's branch to its live holder; a work-unit claim resolves each holder by its own UID and nothing
  without one; and the lookup conformance suite pins each rule its shared fixture can build for both store-arm backends,
  each backend's own tests pinning the rest.

- `[ ]` Lifecycle's view, status, and every slug-keyed map the store arms build take the standing holder: completed
  evidence omits a slug with a live holder, so the free primary gains no Candidate authority over it and a husk stamped
  for it reports no completed work unit; the lifecycle snapshot reads each holder's artifacts at its own path; paused
  work offers the clash repair alone for a paused holder of a clashed slug, review-due ones included, whatever the other
  holder's state; and the cohort consistency check counts each holder of a clash in its own cohort.

- `[ ]` With a bound checkout or a husk of the archived holder on the same machine, session start resolves the live
  holder's checkout through its UID-bearing claim and its branch through the ranked `ref` arm, offers no branch cleanup
  while a live work unit links the branch, leaves the live holder's checkout resolved past the duplicate-marker guard,
  and the in-flight projection, status's slug position, and branch ownership each read the live holder's checkout alone.

- `[ ]` A bound checkout of the archived holder still reads ended, session start offers its teardown by UID, and it
  tears down through its UID, leaving the live holder's checkout, local branch, and remote branch in place; a work-unit
  husk reports a manual decision at every exit, session start's primary-checkout sweep and its own checkout included,
  offers no command naming its slug, and never reads as holding it; `arc teardown --branch` still removes a branch husk;
  an abandoned holder's teardown still reaps its own branches; `arc teardown <uid>` resolves a retired origin through
  its lineage; and under `discard` teardown keeps and reports a remote whose advertised tip its local branch does not
  contain.

- `[ ]` With two live holders of one slug, a verb naming the slug, or run without one in either holder's checkout,
  refuses `ambiguous-match` carrying both holders as typed references in its text refusal and in `--json` where the verb
  takes it, whichever site meets the clash first, naming the preferred move for their types; a reconcile in either
  holder's checkout, without an operand or naming its holder's current name, runs.

- `[ ]` With two live holders of one slug, an edge naming it is held unsatisfied with both holders, never discharged, a
  tie between an Integrating work unit and a cohort or Errand included, as is, under its own name, an edge a follow or a
  lineage disposition would move onto the slug; a dependent naming it and an unrelated work unit both activate; the last
  other open member of a cohort holding both archives; and status reports the `slug-clash` warning as today.

- `[ ]` With two live holders that each hold a slug only as a former name, a verb naming it refuses with each holder's
  current name as the repair, and a work unit whose records mention the slug and a dependent whose edge names it both
  activate, the edge held with a diagnostic.

- `[ ]` A work unit whose records mention a tied slug, as a word or in a paired spec's filename, activates, reconciles,
  and publishes, whether the tie is a clash, a live tie among Errands or cohorts, or a completed tie the lookup leaves
  refusing; a rename runs while another record mentions a clashed slug's paired spec; and an unrelated work unit
  abandons while an Integrating work unit's held edge names a tied slug.

- `[ ]` After the preferred repair, the slug never ties again and no work unit keeps it as a former name, both holders
  completed included: a work unit and a cohort clashed, once the cohort is renamed; a work unit and an Errand clashed,
  once the Errand is closed.

- `[ ]` An edge on a name the lookup resolves to a cohort, under its current or a former name, or to a tie among cohorts
  and Errands alone, is held unsatisfied, never discharged, and its dependent activates, unless a retired origin's
  lineage under that name settles it first as a drop or a replace; one the lookup ties between a cohort and a work unit
  is held with the clash diagnostic, and its dependent activates.

- `[ ]` A work-unit marker without a UID, written before the flip or left by a creation interrupted between its claim
  and its stamp, refuses the readers that act on its claim and acting holder matching, naming each holder of its slug
  and the exits its marker and slug select; `arc release commit` and `arc release push` refuse with the exits, delivery
  and the local review gate refuse with their generic refusal, and the notes sync uses the branch's slug;
  `arc active status` and `arc user reconcile-references` run with a warning naming the exits, the latter with no
  current work unit; and listing readers show its work unit as held there.

- `[ ]` `arc materialize <slug> --here` binds an unbound marker to a live holder materialize admits, even while another
  owned work unit's checkout is unbound too; the cold start's rerun admits an anchored one whose slug has no record or
  lineage; `arc locus release` from its checkout frees any; and each then succeeds. `arc locus release <slug>` frees the
  one unbound marker naming a slug from any checkout unless materialize admits the slug's live holder, and refuses,
  naming the unnamed form, where it does or where the slug's lookup refuses. A creation's leftover blocks its retry
  until one of them runs, and each exit that locates a checkout prints `arc locus release` to run in that checkout
  rather than a slug.

- `[ ]` Status's output-pinning tests and the in-repo arm's tests pass unchanged but for the selection's import path,
  the standing test's warning assertions, which move to status's rendering, and the status handler fixtures that carry
  the owner's UID.

- `[ ]` All quality gates pass (tests, linting, type checking)

- `[ ]` Ready for integration

- `[ ]` After UID claims are available, `arc wu reconcile <slug> --apply` from the live holder's bound checkout acts
  on that holder and preserves the completed holder's records and artifacts. The earlier operand-verification
  segment covers its former-name case with a unique current-name marker; the UID-claim segment closes current-name
  coverage (A1).
