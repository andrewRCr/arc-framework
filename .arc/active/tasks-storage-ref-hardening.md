# Task List: Storage Ref Hardening

- **Design:** `spec-storage-ref-hardening.md`

---

## **Phase 1:** The import review

_Purpose:_ A trial import of this repository's real state and one standard review pass over the import's irreversible
stages and admission rules, before any code changes, so their findings size the rest of the plan.

_Mode:_ `slice` — closes on the import exercised end to end as a trial over this repository's real state, with every
finding it and the review raise given a home.

_Exit criterion:_ A `--trial` import of this repository's real state ran in a disposable copy and returned its report,
and, while the review mapping was unbound, so did one with the copy's review-gate sources set aside; every trial
refusal, blocking notice, review finding, and held-out observation no finding matched is recorded with a disposition: a
reachable code defect as a subtask of 5.9 or folded into the task that already fixes its cause, an unreachable one in
the spec's § Non-Goals by amendment, a correct refusal of this repository's state as a state fault for 5.11, and an
unmapped review source as cleared by the review mapping's binding.

### `[x]` **1.1 Run a trial import of this repository's state in a disposable copy — § 11.1**

- _Goal:_ The import's transform runs over every ref and personal directory this repository holds, and the report it
  returns, blocked or not, is kept as the review's evidence.

- _Outcome:_ Both reports and their blocked status are kept under `~/dev/arc-evidence/storage-ref-hardening/`, in
  `trial-full.json`, `trial-review-sources-set-aside.json`, and `trial-summary.json`. The full trial has 3,010 unmapped
  review sources and one working-memory header fault; the set-aside trial has only that blocking fault. Neither reached
  commit building or gathering refs, and the copy's refs are unchanged.

### `[x]` **1.2 Review the import's landing, publication, cleanup, and admission rules — § 11.1**

- _Goal:_ A non-author evaluator has reviewed the stages that write history and cannot be undone, and the transform's
  admission rules, against the standard rubric with the trial report as evidence, and returned source-grounded
  findings.

- _Outcome:_ One fresh non-author pass applied `standard-review/v1` to the complete named source scope at
  `1df5058cdd` and returned one major resume-authorization finding. Its prompt and verbatim report are kept under
  `~/dev/arc-evidence/storage-ref-hardening/import-review/`. Both blocked trials left build, landing, publication, and
  cleanup covered by source and existing-test inspection only; the pass supplies no attested review.

### `[x]` **1.3 Give every import finding a home in the plan — § 11.1**

- _Goal:_ Every trial refusal, blocking notice, review finding, and held-out observation no finding matched is verified
  against source and dispositioned, so no import finding is deferred to later work: a code defect an import of this
  repository's state can reach is fixed by a subtask of 5.9 or by the task that already fixes its cause, one it cannot
  reach is recorded in the spec's § Non-Goals, a correct refusal of this repository's state is a state fault that 5.11
  repairs, and an unmapped review source waits for the review mapping's binding.

- _Outcome:_ The approved five-item disposition set is recorded in `notes-storage-ref-hardening.md`: F1 is excluded
  by forward Non-Goals amendment; H1 folds into 3.8 with fix-SHA tracking; H2 needs no code change; S1 has an approved
  header-only repair at 5.11; M1 waits for the review mapping's binding. No new implementation task is needed.

### `[x]` **1.4 Confirm the trial ran and every finding has a home** — validate exit criterion at segment scope

- _Goal:_ Each trial's report is on disk beside its copy with its blocked status recorded, the set-aside trial's
  included while the review mapping was unbound, and the approved disposition set accounts for every trial refusal,
  blocking notice, review finding, and held-out observation no finding matched, each now a subtask of 5.9, a fold into
  the task that fixes it, a § Non-Goals amendment, a recorded state fault, or an unmapped review source the mapping's
  binding clears.

- _Outcome:_ Both returned blocked reports, the complete approved disposition record, F1's forward exclusion, S1/M1's
  state-fault homes, H1's fix-SHA trace, and the retained prompt/report hashes satisfy the segment scenario. Neither
  trial exercised commit building or gathering; those stages received the source review recorded in 1.2.

## **Phase 2:** One fault classification

_Purpose:_ The metadata read keeps what is wrong with an object, a `missing` point-read answer is resolved by its
containing tree, and one helper maps each fault to its refusal, diagnostic, and remedy, so every site in Phase 3
moves onto one settled classification.

_Mode:_ `layer` — closes on the settled classification every fault site calls.

_Exit criterion:_ The metadata read, the containing-tree resolution, and the fault helper each have cases for the
§ 1.1 rows they produce and for the historical rule, and capture diagnostics carry their fault internally with the
listing schemas and output unchanged.

### `[x]` **2.1 The metadata read keeps absent, missing, unparseable, and parsed apart — § 1.2**

- _Goal:_ A metadata read tells an absent entry, a missing object, an unparseable object, and parsed metadata apart, so
  a caller classifies the fault instead of receiving one `null` for all of them.

- _Outcome:_ `readRefMetadata` preserves absent entries, missing objects, unparseable objects, and parsed metadata.
  Public Store tests exercise it through listing decoding and UID point reads brought forward from 3.1; missing
  listing metadata gets the restore remedy and resumes after restoration. The tolerant parser stays unchanged.

### `[x]` **2.2 A `missing` point-read answer is resolved by its containing tree — § 1.3**

- _Goal:_ A site that refuses or reports on a `missing` `<tip>:<path>` answer tells an absent entry from an entry
  whose object is absent, with one tree read only after the `missing` answer.

- _Outcome:_ `resolveRefPointObject` resolves missing path answers from one containing-tree read and retains that
  evidence for caller policy. Live point reads and `refRecordAbsence` use it; object loss is recoverable, real path
  absence keeps its own rule, and UID reads pin failed ref-name answers before classifying or retrying them.
  Failed metadata decoding checks tree membership before refusing, so metadata-only trees still hold no records,
  while missing metadata objects remain recoverable faults and successful metadata reads retain their fast path.

### `[x]` **2.3 One fault helper maps a fault to its refusal, diagnostic, and remedy — § 1.1, § 1.4, § 1.6**

- _Goal:_ Every site can turn a § 1.1 fault into its point refusal, listing diagnostic, pull notice condition, or push
  failure condition through one helper, whether it read by `tip:path` or by object ID, with the historical remedy for
  history commits and saved states.

    - `[x]` **2.3.a The fault rows and their remedies**
        - `refObjectFault` maps Missing, Unparseable, No metadata, Misplaced, and Local transport fault to their
          existing reports and remedies. Current and saved read callers exercise the state and placement rows;
          state and history fetch failures use the transport row only after a completed rowless failure confirms
          local tip or ancestor loss. Existing Missing text is preserved, and the legacy missing arm remains.

    - `[x]` **2.3.b `historyRefs` names a history ref only for an item with no live ref**
        - `missingHistoryRefs` derives retained-history routes from current live-ref presence. Saved root and blob
          refusals read current tips only after failure, preserve the saved-state coordinate, and keep project and
          personal refs free of history routes. Graph refusals are lazy builders; current history and archive reads
          reuse their captured tips, while successful reads acquire no additional ref listing.

### `[x]` **2.4 Capture diagnostics carry their fault — § 1.9**

- _Goal:_ A capture diagnostic carries its § 1.1 fault beside its condition and remedy, internally, so every site that
  turns a diagnostic into a refusal or notice takes that fault's row while a listing still shows **Missing** and
  **Unparseable** as `unreadable`.

- _Outcome:_ `CapturedRefDiagnostic` retains the mapper's fault internally and public listings strip it. Archive
  metadata decoding and the first archive lookup/record converters preserve Missing and Unparseable rows; unrelated
  diagnostics retain their own text and policy. Strict public listing schemas remain unchanged.

## **Phase 3:** Every fault site classifies

_Purpose:_ Every site the § 1.4 search finds that refuses, reports, or holds on an object fault moves onto the helper,
batched by store family, so no missing object is reported as unparseable state and no misplaced folder as missing
metadata.

_Mode:_ `replication` — closes when the swept fault-site inventory is exhausted and batch-verified.

_Exit criterion:_ A re-run of the § 1.4 search finds no site that refuses, reports, or holds on an object fault outside
the helper and the inventory's tolerated, unchanged, and invariant sites, and `corruptRef` has no missing-objects arm;
every behavior case Phase 3 lists passes in a `store-ref-*` suite or a unit test.

_Design decisions:_ `notes-storage-ref-hardening.md` § Fault-site inventory — every site, its row, its side, and the
classification calls the sweep settled.

### `[x]` **3.1 Point reads, listings, and lookups — § 1.3, § 1.6, § 1.9**

- _Goal:_ A point read, listing, or owner lookup that meets a missing object refuses recoverably or lists it with the
  restore remedy, and one that meets unparseable or absent metadata keeps its terminal refusal with its side's remedy.

    - `[x]` **3.1.a The shared tip check and record point reads**
        - _Note:_ The full-suite recheck exposed older terminal assertions for unavailable archive trees and cached
          sibling directories. They now assert Missing's recoverable restore route and retain restoration retries.
        - Shared tip admission and unreadable archive quarters use `refObjectFault`; tip metadata retains its decoded
          fault and current/saved repair side. History reuses its current capture when deriving history routes.
          Existing point, claim, and conflict Missing builders share the mapper while retaining their own text;
          native nested-tree restoration resumes both point reads and history.

    - `[x]` **3.1.b Listings**
        - The listing decoders and record diagnostics already use the discriminated reader and fault mapper brought
          forward in Phase 2. Added public current/saved listing assertions for live and archive metadata remedies;
          strict schemas and missing-record restoration remain covered without exposing the capture tag.

    - `[x]` **3.1.c Owner and project lookups**
        - _Note:_ The full-suite recheck exposed an older terminal lookup assertion for a missing root tree. It now
          asserts Missing while the readable metadata-absence case retains its terminal refusal.
        - Owner, lineage, lookup, and project identity readers preserve Missing and current/saved metadata remedies.
          Candidate failures name their fetched commit and remote; targeted refetch restores missing objects before
          designation retry. Archive resolution names non-commit retained histories and unavailable quarter trees as
          Missing; the earlier write-group and archive-view tree guards preserve that classification end to end.

### `[x]` **3.2 Archived folders: placement faults, record keys, and their converters — § 1.5, § 1.6, § 1.9**

- _Goal:_ A misplaced archive folder reports a placement fault with a remedy that names its placement, an archived
  record diagnostic names its archive and full path, and every site that turns an archive diagnostic into a refusal or
  notice takes the diagnostic's fault row.

    - `[x]` **3.2.a The decoder and its keys**
        - _Note:_ The full-suite recheck exposed saved record remedy assertions expecting folder-relative archive
          keys. They now assert the archive ref and full stored path required by § 1.6.
          Final-head qualification also aligns the import comparison harness with those qualified keys, retaining its
          existing content, field and diagnostic-kind comparisons.
        - Placement diagnostics retain their fault row and current/saved remedies; sequence validation stays distinct
          from owner-coordinate mismatches, including a cohort's missing closeout letter. Archived record diagnostics
          qualify both key and remedy with the archive ref and full stored path after decoding, preserving the
          folder-relative matching used by point reads.

    - `[x]` **3.2.b The converters**
        - Archive refusals and notices retain their captured fault row through `refDiagnosticRefusal`; structural
          diagnostics retain their text and terminal refusal. Archive merge bases take saved remedies. Placement
          completion preserves owned current and ancestor faults only when no valid folder supplies placement, and
          its merge, retained-record, and withdrawal callers preserve those diagnostics through repair and retry.
          Criteria-review F3 retains omitted historical root/nested trees from that same batch and reports Missing
          after exhausting readable placement witnesses; a valid alternate witness still supplies placement.

### `[x]` **3.3 Writes and their views — § 1.4, § 1.9**

- _Goal:_ A write or check view that meets a missing object refuses recoverably with the restore remedy, never as
  unparseable state, a version conflict, or an archive-control mismatch, while unparseable or absent metadata keeps its
  terminal refusal.

    - `[x]` **3.3.a The write path**
        - Write metadata keeps absence, loss, and decoding distinct, including record-free refs. Immutable prior reads
          and checked records preserve Missing and current history routes. Quarter/registry guards and staged archive
          metadata use the helper before control admission. History destinations confirm object loss and keep other
          completed Git failures terminal with their original message and remedy.

    - `[x]` **3.3.b The views**
        - Captured metadata retains absence, object loss, and decoding facts through named and UID-qualified reads
          and cohort closeout. Missing objects take the helper; absent and malformed metadata keep current/saved
          remedies. Record-free views keep absence, while missing blobs and empty cohort metadata retain their
          distinct refusals and recover after repair. Saved object-loss refusals retain their snapshot version.

### `[x]` **3.4 History and changes — § 1.6, § 1.9**

- _Goal:_ `history` and `changes` refuse a missing object recoverably, naming a history ref only for an item with no
  live ref, and never let one escape as a raw Git error; unparseable or absent metadata at a history commit or saved
  state keeps the historical remedy.

    - `[x]` **3.4.a The builders and history**
        - Historical capture retains missing metadata independently of record-free evidence. History, change windows,
          and conflict labels use that fact and the helper; missing-object routes follow current tips while coordinate
          gaps keep their routes. Retired-home fallback requires lost blobs restored and offers forward metadata repair;
          its scan still uses an older slug. Retained work/cohort histories reject invalid owner metadata before decoding.

    - `[x]` **3.4.b Changes**
        - Change enumeration retains metadata facts and detects lost lineage-conflict payloads before path decoding.
          Lifecycle walks and retirement ancestry use current-tip repair routes and confirm object loss, preserving
          unrelated Git failures and coordinate gaps. Saved-end metadata keeps historical remedies; named and lineage
          restrictions preserve Missing through exact-object restoration and retry.

### `[x]` **3.5 Pull merges, tip checks, fetch checks, and push exclusion — § 1.7, § 1.9**

- _Goal:_ A pull holds a ref that has a missing object with the restore remedy, a push excludes it with a `refused`
  failure carrying that remedy, and a merge base's unparseable metadata takes the historical remedy while its tips take
  the forward repair.

    - `[x]` **3.5.a Tip checks and push exclusion**
        - Sync tip holds preserve Missing and current-tip forward repairs. Public pulls and pushes retain damaged
          endpoints, admit independent state, and resume after exact-object restoration in both layouts. The unpublished
          batch walk uses the helper for missing ancestry and retains pending refs until membership is readable.

    - `[x]` **3.5.b The merges' side reads**
        - Merge metadata retains absence, object loss, and decoding facts. Base metadata and undecodable records take
          historical repairs; current sides keep forward repairs. Record blobs, graph endpoints, label walks, and paired
          history refreshes use Missing. Empty label revisions stay record-free; empty retained tips require lost
          metadata restored before archive refresh. Exact-object restoration admits the held pulls again.

    - `[x]` **3.5.c Lifecycle holds and fetch checks**
        - Lifecycle and fetch graph holds use Missing reports and keep their captured holds and specific conditions.
          Terminal lineage reads distinguish absent entries from lost blobs by checking the tree after a missing point
          answer; present non-blobs remain Missing. Retained-end object loss uses the same report; repair admits the
          original pull or push.

### `[x]` **3.6 The withdrawal — § 1.3, § 1.9, § 9**

- _Goal:_ A withdrawal that meets a faulty object holds its ref with the notice its fault prescribes, never rejecting
  the pull or push with an untyped exception, and each side's unparseable metadata takes the remedy its snapshot can
  take.

- _Note:_ Task 3.6.a brought forward `decodeConflict`'s fault and repair side from 3.6.c when the preserved-conflict
  regression exposed its legacy restore remedy. The remaining preserved-lineage readers stay in Task 3.6.c.

    - `[x]` **3.6.a The journal's fault and its hold**
        - Journal and preparation reads carry Missing; holds preserve the fault's condition, repair side, and end
          history ref. Faultless origin disagreements keep their condition and restore remedy. Lineage-log failures
          hold only after confirmed object loss; unrelated, canceled, and present-object errors propagate.

    - `[x]` **3.6.b The inverse's metadata**
        - Structural and record metadata reads preserve their faults and snapshot sides. Composed metadata follows
          its entry's object ID; format retention validates restored original metadata even with no surviving format
          rows. Conflict preservation and lineage repair use the same fault-preserving reads.

    - `[x]` **3.6.c Ends and lineage**
        - End evidence retains faults by batch and takes the historical remedy even at the tip, before the published
          folder exemption. Other batches and retirement readers keep their policy. Current lineage and archive
          diagnostics retain their faults and repair routes; decoded origin mismatches keep their restore remedy.

### `[x]` **3.7 A missing local object after a failed fetch is a local transport fault — § 1.6**

- _Goal:_ A fetch that fails because a local ref or worktree `HEAD` has no tip object, or because a later step of the
  fetch reads a missing commit in local history, reports a per-remote `refused` failure naming that ref or commit with
  the restore remedy, not an unreachable remote; a remote that cannot send an object stays an unreachable remote unless
  the clone also lacks a commit the fetch read, which is reported first.

- _Outcome:_ Migration and project-check fetches retain confirmed local loss and the original remote failure through
  the shared classifier. Migration probes the common code repository; designation leaves roles unchanged and clears
  temporary refs. Native tip, ancestor, rewind, and combined-failure cases resume after exact object restoration;
  remote-only and unnamed loss stay unreachable, and canceled fetches skip the check.

- _Note:_ Working-review F3 (A6) corrects § 1.6's descriptive fetch premise using the retained unnamed-blob thin-pack
  witness. The bounded detector and outcome policy stay unchanged; this prose correction needs no new algorithm test.

### `[x]` **3.8 The import's publication journal reports its faults — § 1.4**

- _Goal:_ Source retirement reports a missing or unparseable publication journal as its own condition and remedy, not
  an untyped exception.

- _Outcome:_ Missing and wrong-type journal objects and malformed JSON, schema, or UTF-8 return the import's
  recoverable cleanup refusal with its retained-journal restore route. Origin's transient refs and source keepers
  remain protected; exact journal restoration resumes cleanup without rebuilding the landed work or claims.

### `[x]` **3.9 The readers whose behavior changes, and `corruptRef` without a missing arm — § 1.4, § 1.8**

- _Goal:_ Every reader that branches on a changed code, notice kind, failure code, pull status, or refusal class
  behaves as § 1.8's table states, and no caller can report a missing object through `corruptRef`.

- _Note:_ See `notes-storage-ref-hardening.md` § Fault-site inventory › Readers and `corruptRef`, and
  § Classification calls the sweep settled, for its sites, their rows and sides.

- _Note:_ Task 3.3.b brought forward the saved point-read wrapper's `stateVersion` enrichment when direct Missing
  producers bypassed its legacy conversion. The conversion removal and producer-history preservation remain here.

    - `[x]` **3.9.a The readers that change**
        - _Note:_ Producer-side Missing history routing is included here after snapshot-wrapper preservation exposed
          empty routes from captured views. Section 1.6 requires the rule for every Missing refusal: producers use
          the actual damaged ref and current tips; the snapshot wrapper preserves that route.
        - _Note:_ The fault-site recheck found `unavailableSnapshot` still constructed its Missing listing refusal
          directly. It now uses the shared helper as § 1.4 requires, retaining the same version, history, and remedy.
        - _Note:_ The full-suite recheck exposed an archived-metadata test expecting an item's history route from
          the saved wrapper. It now keeps the archive producer's empty route, as the damaged object is the archive's.
        - Saved reads preserve producer history routes and add only an absent snapshot version; captured conflict
          evidence retains its Missing cause without relabeling structural faults. Follow cleanup preserves Missing
          refusals and the move record. Public-store and unit cases cover the reader table's retries, refusal
          propagation, identity adoption, migration journals, and continuation after object repair.

    - `[x]` **3.9.b `corruptRef` keeps only its unparseable arm**
        - `corruptRef` accepts only an optional `saved` option and reports unparseable metadata; all callers use the
          options shape. Sync placement retains its Missing condition directly through the object-fault helper.

### `[x]` **3.10 Re-run the fault search over the swept inventory** — validate exit criterion at segment scope

- _Goal:_ Phase 3's exit criterion holds: the re-run search finds every fault site on the helper or among the
  inventory's tolerated, unchanged, and invariant sites, and Phase 3's cases pass in the store suites and the unit
  tests.

- _Outcome:_ The fault search maps every object read and report to the helper or the inventory's tolerated,
  structural, coordinate-gap, manifest, and invariant paths; `corruptRef` has no missing-object arm. The full regular
  store and unit scenarios pass after the corrections recorded on Tasks 3.1.a, 3.1.c, 3.2.a, and 3.9.a. Search,
  classification, and run evidence is retained as `task-3.10-*` under
  `~/dev/arc-evidence/storage-ref-hardening/implementation/`.

## **Phase 4:** Listing scope, pull consumption, and transport failures

_Purpose:_ The caller-observable changes later ref-backend work reads: live listings take the owner scope and absence
rule, every pull consumer shows a designation question, and transport failures become typed outcomes.

_Mode:_ `slice` — closes on the fault classes, listing scope, and pull consumption exercised through public store
calls and their consumers.

_Exit criterion:_ Through public store calls, a missing object refuses recoverably with the restore remedy, and each
call succeeds once the object is restored; a history retry pulls only for an item with no live ref; an owner-scoped
listing ignores another owner's unreadable ref; a designation question shows in each consumer and stops the retries; a
transport failure is a per-remote outcome.

### `[x]` **4.1 Live listings take the owner scope and the absence rule — § 2**

- _Goal:_ A live listing narrows records and diagnostics to its owner as an as-of listing does and returns `absent`
  when it finds no records and no diagnostics, so one unreadable unrelated ref no longer blocks every lifecycle write
  through `acquireLifecycleRecords`.

- _Note:_ Lint feedback separated live tip selection and result assembly from `listBoundRecords` to keep it within
  its complexity limit; the write-check fixture's captured owner is constant. Empty live results are classified
  after location filtering, matching § 2's in-repo absence rule while saved and check views retain their own rule.
  Broader feedback also found metadata-only and repaired empty review-listing assertions still expecting live
  `complete`; those expectations now require `absent`, preserving the saved and diagnostic-bearing cases.
  The 4.4 store run found the same old expectation after a location filter emptied a live listing; its fixture now
  distinguishes that live `absent` result from the checked and saved views' retained `complete` results.

- _Outcome:_ Shared captured-ref owner selection now scopes current, saved, and prepared listings before decoding;
  archived folders retain unknown ownership and root diagnostics. Live result assembly classifies empty filtered
  results as `absent`; saved and check views retain kind-scoped absence. Native consumer cases exercise lifecycle
  writes and write checks beside damaged unrelated refs. Evidence: `task-4.1-*` in the implementation evidence directory.

### `[x]` **4.2 Every pull consumer renders a designation question — § 3**

- _Goal:_ A pull that raises a designation question shows it once, with its remedy and command, in every consumer, and
  the history-retry paths stop on it instead of failing with a bare `state-unresolvable`.

    - `[x]` **4.2.a The helper and the retry paths**
        - _Note:_ Test type-check feedback required the designation fixture's choices to retain the native role union.
        - `consumePull` renders and identifies one designation notice, including a separately supplied command,
          without changing proceed policy. History retry uses the selected-store projection and stops on the
          question; saved history puts it in the refusal and join keeps its own presentation, suppressing the notice.
          Evidence: `task-4.2.a-*` in the implementation evidence directory.

    - `[x]` **4.2.b The consumers move onto the helper**
        - _Note:_ Pulled `store-user-pull.ts`'s designation summary onto the helper during 4.2.a after join feedback
          exposed duplicate aggregate and partial-state remedies; § 3 already requires one rendered question.
          Related status feedback then exposed its duplicate command append, removed here as the helper supplies it.
          An initial native import fixture with a declared read source selected the separate layout before the
          question; the corrected native case isolates first designation on an empty origin. Lint feedback extracted
          archive state rendering to keep its publication hold within the complexity limit. Unit feedback supplied
          adoption's fixture clock; architecture lint moved conflict coverage to the public native command, whose
          question notices are captured from standard error. Related archive feedback updated its designation
          assertion to locate the repair once in the shared rendered reason, retaining the archive retry command
          and the other states' remedy-field checks.
        - Exported `projectPull`; import and archive publication stops now use the shared question rendering while
          retaining their own typed failures, read-source exemptions, cleanup policies, and publication retries.
          Consumer cases cover rename, conflict, status, session orientation, and each errand runtime, including
          partial designation results. Evidence: `task-4.2.b-*` in the implementation evidence directory.

### `[x]` **4.3 Transport failures become per-remote outcomes or typed refusals — § 4**

- _Goal:_ No transport-target or effective-transport failure escapes `pull`, `push`, push admission, or follow as a
  raw exception: each becomes a per-remote failed outcome with failure `refused` and the remote-URL repair remedy, or
  a typed refusal where no per-remote outcome exists, and the outcomes and notices already gathered survive.

    - `[x]` **4.3.a Pull and push**
        - _Note:_ Lint feedback moved per-remote pull failure handling into its own helper to keep `pullRemote`
          within its complexity limit, preserving the existing incomplete-fetch, restart, and deadline branches.
          Publisher lint feedback required the same extraction; both callers share the URL-failure mapping.
          Test type-check feedback required explicit initial-version guards before reusing the created leases.
          Criteria-review F2's candidate mapping uses a separate failure handler after lint identified its complexity
          limit; deadline cancellation and candidate cleanup keep their existing policies.
        - Typed URL faults now use the shared local-transport failure mapping. Pulls retain each remote's outcome
          and notices; publication attempts retain their pulls and fail without deadline retries at target and
          admission resolution. Missing-effective-URL guards throw `EffectiveTransportError`, leaving the underlying
          lookups throwing. Evidence: `task-4.3.a-*` in the implementation evidence directory.
          Criteria-review F2 normalizes completed failures only inside transport-resolution boundaries. Pull, push,
          admission, and candidate designation retain typed repairs; canceled, signaled, and unrelated errors propagate.
          Full store feedback aligns completed transport-lookup expectations in configuration, carried-code, import,
          and source-off cases with those typed outcomes, retaining state-preservation and repaired-retry checks.
          Fix-check Round 1 extends that boundary to the carried-code race observer: transport failure keeps the
          independent unreachable/error carried outcome and gathered state results; other errors still propagate.
          Criteria Pass 2 F1 includes the fresh designation/configuration read in comparison-source normalization.
          Native acquisition and accepted-work finalization retain typed results and repair/retry in both layouts.
          Criteria Pass 2 F2 covers the three completeness-configuration consumers: ordinary fetch, candidate
          designation, and migration. A shared internal fetch-refusal carrier preserves notices already gathered.
          Native configuration repair and retry cover both layouts. `resolveFirstDesignation` returns a question
          for an unanswered backing remote without probing; that automatic separate-layout arm is unreachable.

        - _Note:_ Working-code-review F1 covers persistent configuration damage through ordinary keeper cleanup and
          import publication cleanup. Typed transport provenance retains acquisition evidence until exact repair;
          public repair/retry cases preserve earlier outcomes, notices, pending state and import source leases.

    - `[x]` **4.3.b Follow**
        - Resume, cleanup, and candidate judgment convert comparison-witness URL failures through the existing
          migration refusal mapper. Resume and cleanup retain the exact move record and remote state, and all three
          paths continue after URL repair. Existing cleanup object and capacity refusals retain their own remedies.
          Criteria-review F2 includes completed Git lookup failures and preserves completed-work finalization as
          unbound when current transport cannot authorize a comparison write, retaining its observed refs.
          Criteria Pass 2 F1 covers native malformed configuration during resume, candidate judgment, and switched
          cleanup; the recorded move and remote state survive, and exact configuration restoration permits retry.

### `[x]` **4.4 Exercise the caller-observable group through public calls** — validate exit criterion at segment scope

- _Goal:_ Through public store calls and their consumers, the § 1–§ 4 group behaves as Phase 4's exit criterion
  states, and the store suites and the unit tests pass.

- _Outcome:_ Public store and consumer scenarios exercise restoration, history retry routing, owner isolation,
  designation questions, and transport failures. The store gate reached 363 suites and passed all six shards after
  the live filtered-empty expectation correction recorded on 4.1. Scenario, store, and segment evidence is retained
  as `task-4.4-*` in the implementation evidence directory.

## **Phase 5:** The import's fixes

_Purpose:_ The known import defects and every reachable review finding fixed, then checked by a fresh pass, so the
import the cutover runs first lands nothing wrong in this repository's history.

_Mode:_ `slice` — closes on a clean trial import of this repository's real state.

_Exit criterion:_ With the review family's import mapping bound, a `--trial` import of this repository's real state in
a fresh disposable copy returns a report with no refused record, whose every notice is of a kind that does not block:
an Errand origin that changed, a skipped derived capture, the identity-mint notice, a personal link, or an unreadable
annotated commit.

### `[x]` **5.1 A body-less execute-bound capture imports without its mark — § 11.2**

- _Goal:_ An execute-bound capture whose mark is its last line is queued, and its entry stays in the imported inbox
  without the mark, as a capture with a body does.

- _Outcome:_ Pending-entry cleanup accepts a mark at the end of its entry. Native imports retain the stamped,
  body-less capture in the inbox, queue the same identity, and remove the mark in both layouts; existing body-bearing
  captures retain their queue and inbound behavior.

### `[x]` **5.2 Personal links are followed where notes saved through them, and reported — § 11.2**

- _Goal:_ The import follows a link only where the notes snapshot holds a path through it, so the disk and notes copies
  compare as for any file; it skips every other link, and reports each link it follows or skips with a notice that
  does not block.

- _Note:_ A new skip case initially used listing absence for a point read; it now asserts the point-read contract's
  `not-found` refusal. Lint feedback also separated identity-directory acquisition from enumeration and kept link
  detection on `lstat`, since the directory-entry port deliberately exposes only file and directory predicates.
  Test type-check feedback required parsing the cycle listing's owner through its public identity schema.

- _Outcome:_ Enumeration retains logical link paths and physical roots until the selected notes snapshot authorizes
  following them. File, directory, and identity links compare normally; unreadable and unsaved targets and repeated
  real directories are skipped with informational notices. The shared notice carrier joins the report after the
  blocking check, and only the import-source filesystem type gains `realpath`.

### `[x]` **5.3 Unreadable annotated commits sort last with a notice — § 11.2**

- _Goal:_ A person's compacted notes import even when a retained note's annotated commit is unreadable: such commits
  sort last, by object ID, with a notice that does not block.

- _Outcome:_ Compacted snapshots precompute annotation dates, retaining unreadable or dateless commits after readable
  dates and ordering their ties by object ID. Each unavailable date emits an informational notice through the shared
  carrier. Native imports preserve workspace records and verify both the tie-break and readable-date precedence.

### `[x]` **5.4 A lost transient-source delete lease is its own recoverable condition — § 11.2**

- _Goal:_ A lost default-layout transient-source delete lease is reported as itself, recoverably, instead of as a change
  to the import's private gathering refs.

- _Note:_ The new lease assertion needed a nested partial matcher for the remedy's additional text; lint also
  removed the obsolete `projectId` binding after landing context was passed intact to race handling.

- _Outcome:_ Landing retains layout, occupancy, and lost-ref causes. Destination inspection still runs first;
  a lost transient-source delete expectation reports its ref and lease values with a recoverable import retry.
  Layout changes and other lost refs keep the private-gathering notice, while matching destination identities
  continue publication. Native races verify each route and successful repair or publication.

### `[x]` **5.5 A stale publication journal is dropped when no kept tips remain — § 11.2**

- _Goal:_ A rebuild with no transient tips no longer orphans an earlier attempt's import publication journal.

- _Outcome:_ Empty-tip local and remote cleanup reaches the shared journal deleter; a genuine no-op returns before
  its callback or transaction. Stale journals delete under their captured ref lease. The interrupted rebuild clears
  its journal and keepers while preserving origin's source copy, and existing kept-tip cleanup remains intact.
  Criteria-review F5 captures journal and keeper tips together in each stage's existing inventory and carries the
  journal lease into deletion, retaining the empty-path process budget without redundant discovery.

### `[x]` **5.6 A publisher refusal keeps its class through source retirement — § 11.2**

- _Goal:_ A refusal thrown while source retirement verifies the publisher or reads origin reaches the import's report
  with its own class, condition, and remedy, so a terminal refusal is never reported as recoverable `move-unfinished`.

- _Note:_ The initial verification fixture produced no imported claims; a real grooming claim now makes its
  publication journal require the identity ref and reaches publisher verification after the normal push.
  The native held-lock diagnostic reported `reference already exists`; the assertion names its failing ref and repair.
  Broader feedback found two legacy expectations for the cleanup wrapper's condition; they now require the
  producer's native origin-endpoint condition, retaining their lease-preservation and repaired-retry checks.

- _Outcome:_ Publisher-verification and no-publisher origin refusals retain their own codes, classes, conditions,
  and repair instructions through the shared import refusal module, with the import continuation added. Native
  refusal-and-repair cases retain cleanup leases and journals until retry succeeds; origin access retains its remedy.

### `[x]` **5.7 The batch path check runs once per ref — § 11.2**

- _Goal:_ `checkRefBatchPaths` costs time linear in the batch, so an import of every personal document passes it where
  the pairwise check could not, and a batch write's pre-check does too.

- _Note:_ Lint feedback replaced private-helper test imports with public-boundary cases and required explicit
  guards when recovering the original stored paths from a logical collision. The public primary-record fixture
  also carries its required placement.

- _Note:_ Base-merge feedback adapted the branch-added duplicate-mapping case to the existing opaque review
  fixture used by synthetic mappings. Its duplicate-record, content, and listing assertions remain intact.

- _Outcome:_ Batch admission groups original stored paths by ref and unresolved owner, skips identical references,
  and checks each namespace once. Logical collisions name their original stored paths. Public preflight and native
  mapping cases retain the collision and exemption behavior; a real CLI trial checks 20,000 personal paths within
  its invocation limit. The later stored-tree collision check is unchanged.
  Criteria-review F4 moves that unchanged CLI case into a reach-selected store-ref suite, retaining the cost witness
  in the success criterion's required quality-gate carrier.

### `[x]` **5.8 A Git checkout inside personal state is reported, not walked — § 11.2**

- _Goal:_ The import never enters a directory that holds a `.git` entry, under `.arc/user/<identity>/`, the identity
  directory included, or under a followed link's target, and reports it once with a blocking notice whose remedy is to
  move the checkout outside personal state or remove it.

- _Outcome:_ Physical directories, identity roots, and saved linked targets stop at a `.git` entry with one
  blocking move-or-remove notice. Their excluded saved paths do not become missing-materialization notices, while
  ordinary siblings and unsaved link skips retain their behavior. Native cases exercise both Git entry forms and
  successful continuation after moving the checkout or its personal-state entry out, including `git worktree move`.

### `[x]` **5.9 Fix the import review's reachable findings — § 11.1**

- _Goal:_ Every finding 1.3 dispositioned as reachable is fixed, each with a case that fails before its fix.

- _Outcome:_ The approved dispositions required no separate corrective subtask here. H1 landed in Task 3.8 as
  `9e2344e35d909873e62d5a4ce26df05cb8b43ccf`; its native refusal-and-restoration cases and fix SHA are retained, with
  the finding and task recorded in `notes-storage-ref-hardening.md` § Import review fixes.

### `[x]` **5.10 Check the import fixes with a fresh pass — § 11.1**

- _Goal:_ A fresh non-author evaluator confirms that each review finding's fix resolves it without a new reachable
  defect, closing the review's stop rule.

- _Outcome:_ A fresh non-author check of `9e2344e35d909873e62d5a4ce26df05cb8b43ccf` at
  `7065313f24c395455bdcbdfc28d9ee02ca7a5e90` returned no findings under `standard-review/v1`. The complete selected
  source and test change and its current call chains were inspected; the original blocked trials supplied no dynamic
  coverage of that path. The prompt, verbatim report, exact target, and hashes are retained as `fix-check-1.*` under
  `~/dev/arc-evidence/storage-ref-hardening/import-review/`; this working check supplies no attested review.

### `[~]` **5.11 Repair the state faults the trial found — § 11.1**

- _Goal:_ Each state fault 1.3 recorded is cleared by the repair its remedy names, and each repair runs only once it is
  approved, since it changes personal files, branches, or registered checkouts that are the Owner's.

- _Note:_ The live-file check found S1 already cleared: base merge `3b162c7792` inherited the wrapped-title parser
  through `9bfb4db5a0`. The approved physical normalization is superseded; its original proposal remains recorded.
  Documentation feedback reflowed the retained proposal's introduction.

- _Outcome:_ The production registration accepts both the original 16-entry trial file and the current 17-entry file,
  round-tripping each byte-for-byte with all removal triggers. The concurrent memory addition and live file remain
  intact. Validation and exact hashes are retained in `working-memory.task-5.11-validation.json` under the evidence
  directory; no personal-file or canonical-notes write was performed.

### `[x]` **5.12 Rehearse the trial with the review mapping bound — § 11.1**

- _Goal:_ Everything a trial with the review mapping bound raises over this repository's current state has a home and
  every state repair it needs has run, so that once the corrective parents it adds ahead of 5.13 have landed, and any
  fix to the review mapping it records has landed and this unit has merged base, the verifier confirms a clean report
  rather than discovering faults.

**Additional Context:** `notes-storage-ref-hardening.md` § Remaining-task reground after shipped base.

- _Note:_ **Owner, 2026-11-01:** Execution is reordered: run Tasks 6.1 through 7.5 before this task. Once
  `seam-delivery-review` merges and this unit merges base, return to 5.12 and 5.13, then execute Phase 8. This overrides
  the document-order wait above. Stop if a Phase 6 or 7 task depends on the import fixes or the review mapping.

- _Outcome:_ The fresh built-CLI trial with the bound mapping has no refused record or blocking notice. All review
  sources are accounted for; only the five accepted derived-capture skips remain. No new state repair or corrective
  parent is needed. The raw report and source-verified dispositions are recorded in
  `notes-storage-ref-hardening.md` § Bound-mapping trial rehearsal.

### `[x]` **5.13 A trial import of real state returns a clean report** — validate exit criterion at segment scope

- _Goal:_ A fresh disposable copy's `--trial` import returns the report Phase 5's exit criterion states.

- _Outcome:_ A second fresh save and disposable copy, with the bound review mapping and no live review, returns no
  refused record and only the five permitted derived-task-capture skips. Copied refs are unchanged; the mapping,
  legacy-chain diagnostics, and disk-only notes retain 5.12's dispositions. Evidence is recorded in
  `notes-storage-ref-hardening.md` § Clean real-state trial.

## **Phase 6:** Ref transactions, Git ref locks, and the keeper lease

_Purpose:_ The sync deadline never kills a ref transaction it launched, a Git ref lock left behind is reported with a
remedy that can clear it, a push publishes past a ref a stranded tracking lock holds, and no post-flip path waits for
the keeper lease under the layout lock.

_Mode:_ `slice` — closes on concurrent and deadline-bound sync exercised on Linux and in a dispatched Windows
portability pair.

_Exit criterion:_ A transaction held at `prepared` past the deadline commits or fails on Git's own terms and leaves no
lock, on Linux and Windows; both layouts' Windows publishing bursts converge; a push overlapping another checkout's
pull leaves writes and pull merges free of `lock-held` on the layout lock.

### `[x]` **6.1 A launched ref transaction finishes past the sync deadline — § 5.1, § 12**

- _Goal:_ A ref transaction that the deadline did not refuse at launch runs to Git's own end, so the deadline never
  strands a ref lock from a transaction it launched.

- _Note:_ `sync-deadline.ts` and `ref-transaction.ts` carry deadline behavior another unit's change relies on; see
  `notes-storage-ref-hardening.md` § Coordination with `store-operation-git-access`.

- _Note:_ 6.6 feedback correction: the older queued-stdin and acknowledgment deadline fixtures still expected an
  admitted transaction to be canceled. They now exercise cancellable read-back after a native transaction refusal,
  preserving partial-merge notices, accepted receiver state, and retry coverage under 6.1.a's required behavior.

    - `[x]` **6.1.a The uninterruptible option**
        - Native ref updates carry `uninterruptible` through deadline and operation wrappers. An aborted deadline
          refuses admission through the default port; a live signal permits completion past its clock end, while
          an explicit caller signal still cancels the Git transaction. Read-back and version probes stay cancellable.
        - Public `pull` cases cover deadline admission and both repository layouts; the public Git transaction API
          covers caller cancellation, since no Store transaction caller supplies an independent signal today.

    - `[x]` **6.1.b The deadline-kill case**
        - Real `reference-transaction` hooks hold both layouts at `prepared` past signal expiry. Git then commits,
          leaves no native ref lock, and permits a fresh pull. The store suite joins the dispatched portability set.

### `[x]` **6.2 A held Git ref lock refuses `lock-held` at every transaction site — § 5.2, § 5.3, § 8, § 12**

- _Goal:_ Wherever a ref transaction fails because a Git ref lock is held, the caller receives `lock-held` naming the
  lock file and its age, with a remedy that can clear it, except at the designation check's temporary candidate refs,
  where clearing them before a check gives one remote's failed outcome carrying that condition and remedy and removing
  them after it reports nothing; the store never removes the file.

- _Note:_ 6.2.b feedback correction: the listing's new lock-refusal catch raised cognitive complexity above the
  project limit. The bound listing now catches around a separate captured-listing function; public lock and retry
  cases retain the same behavior.

    - `[x]` **6.2.a The transaction wrapper and its lock error**
        - All 26 store transaction sites use `updateStoreRefTransaction`. Shared native lock evidence includes per-ref,
          reftable, and deletion-only packed-ref locks, with age from the complete `lstat` result. Lost races, canceled
          calls, failed read-backs, and unrelated Git failures retain their existing outcomes.

    - `[x]` **6.2.b The `lock-held` mappings and remedies**
        - Writes, pull, push, import, list, and version report the lock path and age with stale-removal or held-retry
          guidance. Accepted receiver updates survive acknowledgment failures; candidate checks preserve per-remote
          failures and suppress post-decision cleanup failures. Native repair cases retain successful continuation.

### `[x]` **6.3 `tracking-update-failed` names the lock it found — § 5.3**

- _Goal:_ A pull notice raised because Git could not update a tracking ref names the lock it found, with its age and
  the stale or held remedy.

- _Outcome:_ Tracking-update notices use the shared native lock evidence, naming the absolute path and age with the
  stale or held remedy. A lock already gone retains the existing condition and remedy; native cases preserve local
  state and apply the incoming state after repair.

### `[x]` **6.4 A stranded tracking lock excludes its ref from the push — § 9**

- _Goal:_ A push meeting a stranded tracking lock publishes the rest and reports the excluded ref's `refused` failure
  with the notice's condition and remedy, instead of retrying to the deadline.

- _Outcome:_ Tracking-update failures seed both the push's blocked set and publication exclusion. Healthy refs publish
  while excluded refs retain the lock notice's condition and remedy, including a pending end whose notice was dropped.
  Native files-format cases cover atomic batch retention and repaired retries, and skip below Git 2.53.0.

### `[x]` **6.5 A lock-failed `!` row counts as applied when its tracking ref holds the fetched tip — § 9**

- _Goal:_ A ref whose tracking ref a sibling's fetch already advanced past the fetched tip raises no
  `tracking-update-failed` notice, so 6.4's exclusion refuses only a ref that cannot publish.

- _Outcome:_ Rejected rows are reclassified only after tracking moves off the old value and proves the fetched update
  applied, including deletion; unchanged tracking preserves ancestor-rewrite refusals. Both layouts exercise public
  Store calls with producer-verified `!` rows that change only the failed row's flag, keeping native OIDs and failure.

### `[x]` **6.6 A zero wait is one attempt, and expiry refuses before the port — § 6.3, § 12**

- _Goal:_ A zero-wait advisory lock request acquires a free lock in one attempt, an expired deadline refuses before
  any lock port call, and no wrapper raises a lock wait.

- _Outcome:_ Free zero-wait locks acquire once and held locks refuse after one attempt; their release keeps the normal
  cleanup budget. Deadline binding refuses before admission on signal or clock expiry and preserves or lowers waits.
  Public Store cases over default ports cover both layouts, unchanged pending state, and successful fresh retries.

### `[x]` **6.7 The comparison scope never waits for the keeper lease under the layout lock — § 6.1, § 6.2, § 12**

- _Goal:_ A push that overlaps another checkout's pull on the same remote never holds the layout lock while waiting
  for that remote's keeper lease, and the keeper lease is the one lock other than the move lock held across a network
  call.

- _Note:_ Base reconciliation preserves the positive-budget backoff and reclamation guards while keeping this
  task's zero-wait attempt. The spent sync deadline still refuses before the port; advancing-clock zero-wait cases
  and expired-port admission cases cover their composition.

- _Note:_ 6.7.a is pulled forward with 6.6: its explicit zero-wait keeper request supplies the public Store path that
  verifies zero is preserved through deadline and operation wrappers over the default lock port. The lease dance
  remains bounded and executes only under both locks.

- _Note:_ 6.7.a feedback correction: a mutable admission marker lets lint distinguish acquisition contention from a
  callback's failure. Callback and cleanup failures propagate without restarting the operation.

    - `[x]` **6.7.a The comparison scope's lease dance**
        - Comparison admission probes the keeper lease once under layout, then releases layout before waiting alone
          and retrying. Both locks cover the operation; sync and deadline-free follow retries retain one total bound.
          Native contention permits sibling writes and pull merges, and an expired follow resumes after repair.

    - `[x]` **6.7.b The span rule where the lease is taken**
        - Keeper and fetch comments name the network span, sync bound, timeout error, and retry remedy.

### `[x]` **6.8 A write that retires a work ref takes the registry lock — § 8**

- _Goal:_ A batch that retires a targeted live work ref holds the registry lock it writes under, so the lock
  invariant holds without serializing ordinary writes on the registry.

- _Outcome:_ Registry prediction includes live work targets whose captured registry tree holds lineage, including
  another owner's resolutions. The locked-tip recheck returns to resolution when an additional registry lock is
  needed. Prediction and retirement share cached tree evidence and Missing classification; ordinary writes stay free.

### `[x]` **6.9 The Windows publishing bursts check their recovery in both layouts — § 5.4**

- _Goal:_ Both layouts' publishing bursts run unskipped on Windows and pass when every clone converges, directly or
  after the stranded lock its refusal names is removed and it pushes again.

- _Note:_ 6.9 feedback selection correction: the integration-only staged diff gave `test:changed` no reachable unit.
  Related feedback now selects the branch range, covering the production changes exercised here; the original
  no-evidence result remains recorded.

- _Outcome:_ Both Windows publishing layouts run without the separate-store skip. After every writer exits, recovery
  observes candidate files, requires each failure to name its stranded lock, removes only those locks, and retries.
  Native cases cover both refusal shapes, a disappeared named lock, preserved unrelated files, and convergence.

### `[x]` **6.10 Exercise deadline-bound and concurrent sync on both platforms** — validate exit criterion at segment scope

- _Goal:_ Phase 6's exit criterion holds: the store suites and the unit tests pass on Linux, and a dispatched
  portability pair passes the deadline-kill case and both layouts' publishing bursts on Windows.

- _Note:_ First store feedback at `411f3c461d` (run `b161b0ce676c4541bb59d23f21bac56d`) failed the first code-choice
  child case in `store-ref-designation-states.test.ts`, terminal false. Its 10-second child limit and 10,694ms case
  duration suggest a timeout, but the retained error does not establish the cause. Segment and unit checks passed;
  hosted qualification had not started. The verifier remained open at the unknown-cause stop boundary.

- _Note:_ The focused diagnostic did not reproduce the failure. The WSL run passed with console capture suppressed;
  corrected raw-stream capture on `m5-air-ac` (run `033ede2b02754842a93595eeb95283da`) observed a normal child exit in
  2,607ms: exit code 0, no signal, not killed, empty stderr. Assertions and timeouts stayed unchanged; temporary
  instrumentation was removed. The passing isolated runs do not establish the original failure's cause.

- _Note:_ Owner accepted carrying this specific unresolved intermittent failure through one full store-check retry,
  with assertions and timeouts unchanged and failure-only child diagnostics retained. A green retry permits normal
  CI and task progression without claiming a fix; recurrence stops with the captured details.

- _Outcome:_ The approved full store retry and segment request passed. Normal CI `41392563220` at
  `b2dc2f14fa203cd543b21c3234669b507482b08e`, dispatched with `run_portability_pair=true` and no diagnostic inputs,
  passed Linux store and unit checks and all Windows/macOS shards. Windows shard 3 ran the prepared-transaction
  deadline cases in both layouts and both layouts' twenty-publisher bursts successfully. The intermittent first-pull
  failure remains unresolved, with its failure-only diagnostics and accepted recurrence stop retained.

## **Phase 7:** History retries, withdrawal placements, push refusals, and decomposition

_Purpose:_ The remaining write, sync, push, and decomposition defects end in typed outcomes.

_Mode:_ `layer` — closes on write retries, withdrawal placements, push exclusion's refusals, quarter provenance, and
decomposition naming settled.

_Exit criterion:_ Each § 7 and § 10 defect, and each § 9 defect Phases 3 and 6 do not fix, has a case that failed
before its fix and passes after it in the store suites.

### `[x]` **7.1 A lost history destination retries within a bound — § 7**

- _Goal:_ An outside writer that moves a history destination once is absorbed by the retry, and one that moves it on
  three consecutive attempts refuses with the repair remedy, however each move is found.

- _Note:_ `write.ts` is shared with another unit's change; see `notes-storage-ref-hardening.md` § Coordination with
  `store-operation-git-access`.

- _Note:_ 7.1 feedback correction: lint rejected the expanded locked loop's complexity. One locked attempt now has a
  separate typed scope from the loop that retries it; the loss counter remains owned by the public write call.

- _Note:_ 7.1 capture-accounting correction: a comparison-free restart could capture a third destination move and
  then publish without another retry. The prepared capture now reports to the counter before publication; later
  observations in that attempt still consume only one loss.

- _Outcome:_ One public write tracks observed destination values, absence included, across admission, transactions,
  and re-resolution. Fresh captures reach the counter before publication; re-detection preserves the streak, ordinary
  losses reset it, and a comparison-free restart resets only when its capture finds no new move. Shared proposal
  preparation identifies exact destinations without duplicating policy. The third losing attempt keeps the repair
  refusal; nonancestor history still refuses immediately. Native cases also cover atomic batches and successful repair.

### `[x]` **7.2 Withdrawal conflict placements read the captured tips — § 9**

- _Goal:_ The withdrawal places its conflicts from the tip sets its operation captured, as every other
  `completeSyncPlacements` caller does, not from a fresh live listing.

- _Note:_ Feedback correction: the historical-placement fixture explicitly accepts its forced quarter rewrite in
  tracking and seen refs too, so no captured incoming tip supplies healthy placement evidence. Its original fault,
  no-publication, preserved-history, and successful-retry assertions remain intact.

- _Outcome:_ The entry inverse threads captured `state`, `held`, and `incoming` tips through every whole-record
  alternative. Native quarter movement leaves conflict placements bound to those snapshots; 7.2.R makes the retained
  conflicts visible through current completed reads.

### `[x]` **7.2.R Refresh surviving completed copies before withdrawal publishes — § 9 (A1)**

- _Goal:_ The final history groups and every surviving eligible completed copy publish the same retained conflicts
  and undone entry changes atomically, preserving independent ends and placements without recreating the withdrawn
  end's folder (A1).

- _Note:_ Approved amendment A2 permits only the existing tree/commit writes for otherwise-unwritten changed
  quarters. Feedback corrections extract unchanged-quarter cleanup to meet complexity 15 and narrow optional
  provenance batch IDs before retaining their witnessed set.

- _Outcome:_ `sync-withdraw-copies.ts` selects surviving completed folders by captured history batch evidence and
  refreshes them from final inverse groups, including conflicts and undone entries. Moved copies join the existing
  locked atomic transaction; unchanged new quarters are omitted and withdrawn folders stay removed. A2's bounded
  publication cost is verified by 7.R; details are in `notes-storage-ref-hardening.md` § A1/A2 implementation evidence.

- _Note:_ Working-review F2 (A5) composes captured original-role coordinates with the existing role planner, preserving
  independent ends and quarters. Cover both role directions/layouts, fallback allocation, ambiguity/collision repair,
  atomicity and A2's process bounds; see the A5/A6 working-review repair notes.

### `[x]` **7.R Verify the bounded cost of completed-copy publication — Performance (A2)**

- _Goal:_ A1's completed-copy repair preserves the existing process budget except the necessary batched tree and
  commit write for each otherwise-unwritten quarter whose composed tree changes, per attempt, while retaining one
  atomic publication and no additional listing or redundant discovery (A2).

- _Outcome:_ Scoped native traces show the existing tree/commit pair only for the otherwise-unwritten moved
  quarter, no added publication work for ordinary copies, and unchanged no-refresh controls. Listing, blob-flush,
  and atomic publication counts remain unchanged; owned acquisitions save one reader and one enumeration. Raw
  before/after evidence and `task-7.R-process-deltas.json` are recorded in the notes.

### `[x]` **7.3 Push exclusion builds a refusal for every excluded ref — § 9**

- _Goal:_ A pending end the pull withholds without an end-pending seed never makes push emit a schema-invalid failed
  publish: exclusion builds a refusal with a condition and remedy for every ref it excludes.

- _Note:_ The planned direct-helper fallback case is covered by a public concurrent-pull interleaving, preserving
  private-module boundaries. Feedback corrections complete the double-end fixture's tracking/keeper and published
  witness restoration, extract pending-reason collection to meet complexity 15, and remove an unused test initializer.

- _Outcome:_ Pending seeds retain the matching live/history notice, then an item-keyed double-end notice, or the
  history-restoration fallback. Every excluded atomic contribution has a nonempty reason and remedy while independent
  state publishes. Public native cases in both layouts exercise all three reason classes and carry out their repairs;
  see `notes-storage-ref-hardening.md` § Push exclusion refusal evidence.

### `[x]` **7.4 Quarter provenance attributes a restored primary — § 9**

- _Goal:_ A reopen or quarter move that restores a removed completed primary in a single-put batch attributes the
  quarter change to the restoring mutation instead of throwing an internal error.

- _Outcome:_ Quarter provenance preserves its existing physical-record priority, then attributes an unmatched
  metadata-only primary removal to the actual restoring put. Both layouts reproduce the internal error for reopen
  and quarter moves and retain mixed-owner attribution; see `notes-storage-ref-hardening.md` § Restored-primary
  quarter provenance evidence.

### `[x]` **7.5 Decomposition names a verbatim companion by its stored name — § 10**

- _Goal:_ Under the ref backend, a decomposed member's meta Design entry and the decompose report name the verbatim
  companion record that actually resolves.

    - _Amended in:_ 7.5.R (A3)

- _Outcome:_ The stored-name correction in `c237427f5b` names native optional companion copies correctly.
  The original Design-success claim is superseded by A3, closed through 7.5.R with conventional Design admission
  retained; see `notes-storage-ref-hardening.md` § A3 — Conventional Design admission and companion reports.

### `[x]` **7.5.R Verify companion reports with conventional Design admission — § 10 (A3)**

- _Goal:_ Optional-copy reports name each verbatim companion's actual stored path in both ref layouts, while
  conventional Design names and new-member Design admission retain their existing behavior (A3).

- _Outcome:_ Native optional-copy reports resolve to the stored record in both layouts. Conventional draft,
  single-spec, and paired-spec scaffolds retain their names; the existing Design-admission property still refuses a
  new member's verbatim Design entry. The retained probe and closure evidence are recorded under A3 in
  `notes-storage-ref-hardening.md`.

### `[x]` **7.R2 Select competing approval roots — § 9.1 (A4)**

- _Goal:_ A competing-root lineage with an eligible explicit choice resumes composed approval reads and native response
  authority without changing approved evidence, while stale choices, selector conflicts, and excluded performed/settled
  branches remain blocked under the recorded policy (A4).

**Additional Context:** `notes-storage-ref-hardening.md` § A4 — Explicit repair of competing approval roots.

    - `[x]` **7.R2.a Reproduce and register the exact repair state**
        - Native producers in independent clones reproduce competing roots. The selector kind, stable key, codec,
          registration, path and machine-record fixtures are integrated; structural/property assertions supplement the
          native behavioral witness. Raw codec JSON and keys derive from canonical producer-bound branch constructors.

    - `[x]` **7.R2.b Select one valid branch across native readers**
        - One loader validates complete branches at the original manifest. Native response snapshots route operation,
          settlement/pass, hosted-result and approval authority through selected facts, retaining immutable-only access,
          orphan detection, missing-producer behavior and original refusal attribution.
          Criteria-review F1 validates every captured selector key and rejects repeated producers before composition,
          naming the actual damaged coordinate for exact restoration without another inventory read.

    - `[x]` **7.R2.c Apply a choice atomically and preserve provenance**
        - Raw preview and locked selector admission bind the complete evidence/result inventory and current policy.
          Selected advances continue without rewriting retained approvals; excluded native authority replay refuses while
          raw exact replay remains available. Valid remote intake retains facts without a spurious local-advance warning.

    - `[x]` **7.R2.d Repair competing selections**
        - Opposite choices produce ordinary whole-record conflicts. The real command restores damaged alternatives at
          their exact coordinates, refuses partial or conflict-only raced bases, and resumes through fresh preview/apply
          without losing any approval or conflict alternative.

    - `[x]` **7.R2.e Exercise the real CLI seam**
        - Built-command file/stdin requests select exact owner generations in both native layouts without usable legacy
          files. Native invocation-bound consumers exercise selected pending-fix continuation, excluded authority refusal,
          late offline effects and consistent reads across live-ref movement. Strict command/schema inventories and
          the existing real-CLI no-input matrix include the new command and request/result roots. Lazy-loading and
          factory boundaries, command help and declared source/build reach cover the explicit CLI adapter.

    - `[x]` **7.R2.f Close the amended boundary**
        - Retained native runs and reconstructed controls cover refusal and executable restoration. Before/after native
          traces cover every amended reader class, ordinary/selected controls, raw advances, approval replay and sync;
          final measurements preserve the stated access and process bounds. Final work-unit criteria remain unmarked.

- _Outcome:_ Explicit root selection resumes eligible native review authority while preserving every approved fact.
  Snapshot validation and complete locked observations refuse stale or unsafe choices; the same command repairs
  selector conflicts. Multiple performed/settled branches retain their explicit policy block. The selector, native
  consumers, command and recovery path land together; detailed corrections and measurements are recorded in
  A4’s implementation and recovery evidence in `notes-storage-ref-hardening.md`.

## **Phase 8:** Verification

### `[ ]` **8.1 Complete verification** — load and follow `verify-work-unit.md`

- _Goal:_ Every success criterion is backed by evidence at the final implementation head, with required checks and
  integration readiness established through the work-unit verification workflow.

**Additional Context:** `notes-storage-ref-hardening.md` § Remaining-task reground after shipped base.

- _Note:_ See `notes-storage-ref-hardening.md` § Verification at the final head and § Review during execution.

- _Note:_ A4 dispositions the approval-root repair and places it in 7.R2 before this task. Verification includes
  criteria 17–19 and fresh final-head evidence; see the additional context above and the A4 notes.

- _Note:_ The approved held-target repair and a fresh-save retry clear both final-trial blockers. The actual CLI's
  clean report is retained; the personal-write hold is released. Normal CI qualifies the implementation head after its
  one approved Windows job retry. See `notes-storage-ref-hardening.md` § Final-head trial and qualification.

- _Note:_ Independent criteria Pass 1 leaves six criteria unmet and integration readiness held. Its five-fix set and
  subsequent independent fix check are approved. A consolidated final trial follows the settled fix/review loop;
  see `notes-storage-ref-hardening.md` § Independent criteria review.

---

## Success Criteria

- `[ ]` Every item in § 1–§ 11 has a case that fails before its fix and passes after it, wherever an input reaches the
  behavior it changes, run by a quality-gate check: a `store-ref-*` suite the store check's reach selects, or a unit
  test the push gate runs. An arm no input reaches, a change only the type checks or the documentation show, and a
  property case that already holds today are exempt where their task names them. Each refusal or failed outcome at a
  material boundary that the spec's Cross-cutting › Testing names also has a case that carries out its remedy and then
  succeeds.

- `[ ]` No refusal, listing diagnostic, or notice gives a missing object a forward-repair or historical-metadata
  remedy, and no point read or write refuses on one as terminal; each § 1.5 placement condition yields a `malformed`
  diagnostic with `rule: "placement"` and its remedy.

- `[ ]` Every site the § 1.4 search finds that refuses, reports, or holds on a missing object classifies it by § 1.1;
  `corruptRef` has no missing-objects arm, and no refusal, diagnostic, or notice for such an object is built outside
  the helper; a saved read of an ended item whose archive tree is unavailable returns `state-unresolvable`; a pull
  still holds such a ref with a `namespace-corrupt` notice; every § 1.8 reader behaves as its table states.

- `[x]` `StoreRefusalSchema`, `ListingDiagnosticSchema`, `PullNoticeSchema`, `PublishFailureSchema`, and the result
  schemas are unchanged.

- `[x]` A live listing scoped to one owner, or to a whole family, returns `absent` when it finds no records and no
  diagnostics, and an unreadable ref of another owner does not appear in an owner-scoped listing.

- `[x]` A pull that raises a designation question shows it in every consumer § 3 lists, and `pullHistoryForRetry` and
  `readStateHistory` stop on it with its remedy.

- `[ ]` No § 4 transport failure escapes as an exception; each yields a per-remote failed outcome or a typed refusal,
  and follow's resume and cleanup return `move-unfinished`.

- `[x]` A ref transaction past `prepare` when the deadline fires commits or fails on Git's own terms and leaves no lock,
  on Linux and in a dispatched Windows portability pair; a held Git ref lock at any § 5.2 site refuses `lock-held`
  naming the lock's path and age, with the stale or held remedy by age, except at the designation check's temporary
  candidate refs, where clearing them before a check gives one remote's failed outcome carrying that condition and
  remedy and removing them after it reports nothing.

- `[x]` The Windows publishing bursts run unskipped in both layouts and pass in a dispatched portability pair, every
  clone converging directly or after the stranded lock its refusal names is removed and it pushes again.

- `[x]` A push that overlaps another checkout's pull on the same remote does not make concurrent writes or pull merges
  refuse `lock-held` on the layout lock, and a zero-wait advisory lock request acquires a free lock in one attempt.

- `[x]` A history destination moved once by an outside writer is absorbed by the retry, and one moved on three
  consecutive attempts refuses with the repair remedy, whether the admission check, the transaction, or a
  re-resolution finds each move.

- `[x]` Every import review finding an import of this repository's state can reach is fixed and any it cannot reach is
  recorded in the spec's § Non-Goals; with the review family's import mapping bound, a `--trial` import of this
  repository's state in a disposable copy returns a report with no refused record and only non-blocking notices.

- `[x]` § 12's four port properties hold for the default ports, each pinned by a test.

- `[x]` All quality gates pass (tests, linting, type checking)

- `[ ]` Ready for integration

- `[x]` After withdrawal, current completed reads expose final history conflicts and undone entry changes; surviving
  folders keep independent ends and placements, withdrawn folders stay removed, and refreshed copies publish
  atomically with the inverse from captured, locked bases (A1, spec criterion 14).

- `[x]` Completed-copy refresh adds only the existing batched tree and commit writes per otherwise-unwritten changed
  quarter per attempt, with no additional listing, redundant discovery, or publication transaction; unchanged
  quarters and unaffected success paths retain their process budget (A2, spec criterion 15).

- `[x]` Decomposition's optional-copy reports name each verbatim companion's actual stored path in both ref layouts;
  conventional draft, single-spec, and paired-spec Design names and new-member Design admission stay unchanged
  (A3, spec criterion 16).

- `[ ]` In both native layouts, independently approved competing roots with an eligible explicit choice can be selected
  and read through the real command, preserving all evidence bytes and normal selected-branch continuation. Stale basis,
  additional/missing roots, orphan selectors, evidence conflicts, and excluded performance/settlement refuse safely;
  opposite selector choices have an executable conflict-resolution path. Native operation reads/snapshots, hosted
  settled-result projection, settlement/pass derivation, and approval-based authorization use only selected authority
  from one snapshot. Selecting pending-fix over an eligible no-fix branch remains unsettled until the selected fix is
  performed; excluded approval cannot grant continuation. Snapshot interleavings never mix outcome, evidence, or
  selector facts from different captures.

- `[x]` A4 adds only the selector record kind/reference vocabulary, new repair command schemas, and the additive native
  response-snapshot capability. Existing Store methods and refusal/result/notice/publish-failure envelope shapes and
  discriminants otherwise remain unchanged. This supersedes criterion 4 only to that extent.

- `[ ]` Response-selection reads obey the per-reader Store-call and access-scope bounds in § 9.1, retaining narrow
  composed outcome access and unchanged immutable-only producer reads. New inventories on formerly raw-key authority
  paths are confined to the stated outcome/evidence listings and targeted selector lookup. Native Git-process deltas are
  measured in both layouts, with no added version capture, duplicate outcome listing, or unrelated-family enumeration;
  A2's exception and all paths outside the explicit response-authority changes retain their process budget.

- `[ ]` Withdrawal restores role-compatible completed coordinates under A5 in both layouts, with unique original
  restoration, absent-original allocation, ambiguity/collision repair and retry, independent ends and quarters,
  atomic publication and unchanged A2 process bounds (spec criterion 20). This supersedes the placement-preservation
  portion of the earlier A1 criterion only when restoring another primary role requires different coordinates.

- `[ ]` The fetch description states the retained unnamed-blob thin-pack residual and bounded detector accurately,
  retaining the existing classification and remedy (A6, spec criterion 21).
