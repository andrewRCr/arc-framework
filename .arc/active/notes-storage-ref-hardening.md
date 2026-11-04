# Notes: storage-ref-hardening

Source-grounded decisions and recovery evidence for object faults, transactions, import, withdrawal, and approval-root
selection. Earlier investigations are retained alongside their final dispositions.

## Contents

- **Coordination and design:** [operation scope](#coordination-with-store-operation-git-access),
  [review mapping](#coordination-with-seam-delivery-review), [base reconciliation](#remaining-task-reground-after-shipped-base),
  [downstream consumers](#later-work-that-reads--1-4), [review boundary](#review-during-execution).
- **Transactions and publication:** [deadline and Windows evidence](#evidence-for--5),
  [history retries](#history-destination-retry-evidence), [withdrawal visibility](#a1--withdrawal-conflict-visibility),
  [quarter cost](#a2--required-quarter-publication-cost), [withdrawal implementation](#a1a2-implementation-evidence),
  [push refusals](#push-exclusion-refusal-evidence), [quarter provenance](#restored-primary-quarter-provenance-evidence).
- **Companions and approval:** [companion naming](#decomposition-companion-naming-evidence),
  [Design admission](#a3--conventional-design-admission-and-companion-reports),
  [approval-root selection](#a4--explicit-repair-of-competing-approval-roots).
- **Import and verification:** [bound rehearsal](#bound-mapping-trial-rehearsal), [clean trial](#clean-real-state-trial),
  [final-head obligations](#verification-at-the-final-head), [fault inventory](#fault-site-inventory),
  [import review](#held-out-of-the-import-reviews-first-pass), [state faults](#import-state-faults),
  [review fixes](#import-review-fixes).

## Coordination with `store-operation-git-access`

That work unit gives every public ref-store call one operation scope: a shared `cat-file --batch` reader and
remembered configuration lookups, refreshed at the events that can make them stale. Its spec,
`spec-store-operation-git-access.md`, is the authority on that scope, and the two sessions coordinate directly.

- **Order, not an edge.** The two land in an agreed operating order with no `Depends On` either way (Owner,
  2026-10-30), per `RELEASE-GATES.md`'s Stance. That unit was in verification when this task list finalized
  (2026-10-31), so it lands first, and this unit merges base once it lands and again before landing itself.
- **Port obligations, confirmed by that unit's session** (2026-10-30): its wrapped `execInput` keeps executor options
  unchanged, its wrapped `fs` keeps the full `lstat` result, and its planned wrapped `lock` forwards `waitMs` unchanged,
  zero included, each with a regression case. The spec's § 12 states these as contracts any wrapper keeps.
- **Ports this unit extends.** The type of `importSource.ports.fs` gains `realpath` (Task 5.2), which the default port
  already returns, and `lstat`'s result gains `mtimeMs` (Task 6.2). After merging base, that unit's wrapper carries
  both: it spreads `...context.fs` (`operation-scope.ts`), so `mtimeMs` rides the whole `lstat` result it keeps, and it
  passes `importSource` through unwrapped.
- **Uncached failures.** § 4 keeps the transport and designation lookups throwing on failure, so a caching wrapper
  caches no failure value. That unit's spec owns the property ("A thrown error is never remembered") and its
  regression case; this unit adds none.
- **Shared files.** That unit's diff (`141aa26f99..8d81a14144`) changes 14 files under `src/`. Whichever unit lands
  second merges the other's change in each file both change:
    - `pull.ts` and `push.ts`: its operation-scope refresh at each restart; this unit's local object check (Task 3.7),
      typed transport failures (Task 4.3), and lock mapping (Task 6.2).
    - `write.ts`: its refresh in `executeRefBatch`'s loop; this unit's `refBatchFailure` (Task 6.2),
      `commitLockedRefBatch` (Task 6.8), and loss count (Task 7.1).
    - `backend.ts`: its routing of `refReadOperations` through the operation scope; this unit's `version` lock mapping
      (Task 6.2).
    - `import/transient-publication.ts`: its configuration refresh inside `unpublishedImportClaims`; this unit's journal
      faults there (Task 3.8).
- **Read through, unchanged here.** `batch-read.ts` takes its `readBatchObjects` missing-answer check, which
  § Non-Goals leaves to it; this unit reads through `readRefTrees` and `readBatchObjects` as they are. Its other
  files (`batch-reader.ts`, `context.ts`, `designation.ts`, `effective-transport.ts`, `fetch-completeness.ts`,
  `operation-scope.ts`, `read-operation.ts`, `repository.ts`) this unit leaves unchanged.
- **Deadline behavior it relies on.** `sync-deadline.ts` and `ref-transaction.ts`, which this unit changes (Tasks 6.1
  and 6.6): an expired deadline still refuses the next Git process and the next lock.

## Coordination with `seam-delivery-review`

That work unit binds the review family's import mapping to `arc store migrate` (`reviewMapping: mapReviewRecords` in
`commands/store-migrate.ts` on its branch). Until this branch holds that binding, every review-gate source but
`arc/review-gate/identity/repository-identity.json` blocks the import as unmapped (spec § 11.1).

- **Order, not an edge.** It was in verification when this task list finalized (2026-10-31). Task 5.12's rehearsal and
  Task 5.13's clean trial run once it lands and this unit merges base. Nothing before Task 5.12 waits on it, so no
  `Depends On` edge; if it has not landed when the loop reaches Task 5.12, the loop waits there, since tasks run in
  document order and Phases 6 and 7 follow. If Task 5.12 records a fault in the mapping itself, the loop waits again
  at Task 5.13 until its fix lands and this unit merges base.
- **Until then.** Task 1.1's second trial sets the copy's other review-gate sources aside, and Task 1.3 records the
  unmapped-source notices under § Import state faults as cleared by the binding.

## Remaining-task reground after shipped base

The authorized reconciliation takes base `41963788ec39a67face3054ab4ad9351416a9b1c`, containing the delivery/review
landing `7d5072b1401c791dae7c93e34282e8dd8e3b8c14` (PR #1248), onto pre-merge head
`04d90f6b6073af480642f76aa7bb169b295ffaa8`. The scope is Tasks 5.12, 5.13, and 8.1, their acceptance criteria, and
compatibility with completed tasks. This is the primary author's full `task-audit`, covering grounding and all eight
issue categories; it supplies no independent review or final verification attestation.

### Compatibility findings resolved for the merge

- **Interface contracts / codebase drift — fix before starting, resolved in the composition.** Base's
  `requireWaitBudget` rejected zero to protect a spent store deadline, while § 6.3 requires one zero-wait attempt.
  `bindDeadline` already rejects aborted or exhausted deadlines before calling the lock port. The composition keeps
  that boundary and the approved zero-wait behavior, plus base's positive-budget final attempt, bounded holder reads,
  and reclamation guards. Negative waits still refuse without creating a lock. Zero admits one create despite an
  advancing clock, and a failed create performs no holder read, recovery, or sleep. `createRefLockFactory` retains
  the default positive release budget. Task 6.7 records the correction; its Goal and § 6.3 are unchanged.
- Astra's bounded advice (`lock_merge_advisor`, first consultation for this reconciliation) confirmed that this is
  settled composition rather than a new mode or design decision. Source grounding independently traced
  `bindDeadline`, `withProjectionLock`, `withRepositoryReviewOperationLock`, and `runFrontlineReviewCommand`'s
  positive timeout-plus-margin budget. No new caller was found encoding expiry as an unguarded zero.
- **Test strategy / codebase drift — fix before starting, resolved in the fixture.** The duplicate-mapping case
  added in Task 5.7 emits synthetic review content. Base uses `opaqueReviewImport` for such mapping mechanics, so the
  merged case uses that existing adapter too; genuine command/mapping cases retain production codecs. The duplicate
  write, retained-content, and complete-list assertions are unchanged.
- Mechanical conflicts retain the ref-port split into `default-store-ports`, opaque review fixture setup in push
  exclusion, and a portable Git-directory path plus the required `mtimeMs` fixture field. First-pull process
  diagnostics remain intact and use base's shared `CALL_LIMIT` (30 seconds) from `00e3c1979f`; this separately shipped
  budget change establishes no cause or fix for the accepted historical intermittent failure. Its recurrence stop
  remains in force.

The advancing-clock zero-wait cases failed against incoming base, then passed in the composition. The seven-suite
selection covering advisory locks, version-floor ports, comparison leases, expired/aborted deadline admission,
first-pull designation, push exclusion, and mapped import passed all 110 cases after the fixture correction. Raw
results are `base-merge-zero-wait-red.log`, `base-merge-regression.log`, and
`base-merge-regression-retry.log` under `~/dev/arc-evidence/storage-ref-hardening/implementation/`. The first combined
run passed 109 cases and failed the synthetic mapping fixture; that result is retained rather than reported green.

### Remaining-task findings

- **5.12 / 5.13, dependency and interface contracts — carry as context.** `migratePorts` binds `mapReviewRecords`
  only for the command's own ports. Use the real built CLI with no injected ports for the trial. `mapImportReview`
  inventories the supplied sources, enforces coverage, and blocks an in-flight live review through its report.
  `importTrackedState` still returns `status: "ok"` for a blocked trial: inspect `refused`, `reviewMapping`, and every
  notice. A mapping failure stays a mapping-owned fault under 5.12; it is not silently patched or set aside here.
- **5.12 / 5.13, execution assumptions — carry as context.** The real-state copy must include the primary Git common
  directory, every source ref, and registered-worktree metadata. `readImportPersonalDisk` still reads the registered
  checkouts' personal files live. The task's fresh notes-save approval and no-personal-write interval remain required;
  the earlier hold is not renewed by this merge. No personal file, notes ref, or live state ref was changed here.
  The destination must remain empty; `inspectImportDestination` can otherwise short-circuit a trial of an existing
  landing. The ordinary in-repo backend and disposable copy preserve the approved one-time import boundary.
- **8.1, verification coverage — carry as context.** Run the complete current verification workflow after the clean
  real-state trial. All sixteen specification criteria, including A1–A3, remain subject to final evidence. Repeat
  the fault-site sweep, real-state trial, merge gate, and exact-head normal hosted CI as the existing verification
  note requires. The current CI offers `portability_store_full=true`; combine it with `run_portability_pair=true`
  when qualifying the full Windows/macOS store runs so reach selection cannot omit the required deadline and burst
  cases. This broadens normal coverage; leave diagnostic timing/file filters and per-change narrowing unset.
  Final verification still needs the current inbox listing, aggregate author check, criteria walk, and Candidate
  attestation; source regrounding is not a substitute for them.

Tasks 5.12 and 5.13 have no additional source-grounding or acceptance gap. Current-state preflight then exposed the
verification prerequisite below, so 8.1 is not ready to begin its verification ceremony. No trial or hosted CI was
launched during this audit.

### Approval-root finding and disposition

At the reconciliation audit, `arc user inbox-list --target storage-ref-hardening --json` returned `state: "named"`
with one capture: **Repair a pull-merged second approved-response root** (AGG-F3, captured during the delivery/review
pre-publication pass). This is **fix before starting verification**, not an automatically approved implementation task.

The source supports its material mechanism. `checkEvidenceSuccession` rejects a second first approval for the same
producer/result inside one write view; two clones can each admit a distinct first root before exchanging them.
`observeSyncChecks` reports broken rules as notices without refusing the prepared merge. `orderReviewEvidenceLineage`
then refuses multiple roots with typed `review.evidence.root`, and its remedy explicitly says no command repairs a
pull-merged second root. `checkReviewEvidence` prohibits evidence removal. `createReviewEvidencePort`'s keyed composed
read is affected for that producer, and its aggregate composed listing also fails. Existing unit cases cover the
second-root write refusal and typed damaged-lineage attribution; this audit adds source tracing rather than claiming
a new native two-clone reproduction or a repair.

The current specification settles neither the repair operation nor the authority and retention rules for choosing
between those approvals. The recommended disposition is a bounded design revision before verification, with an
explicitly selected repair and preserved approval provenance; the Owner's planning pass must settle it through
`amend-design` before implementation. This serves the post-flip recovery purpose, but the present tasks contain no
approved repair design. The capture remains in the inbox, no evidence is deleted, and no new task or criterion is
silently approved. The next source-grounded steps 5.12/5.13 remain distinct from this pre-verification disposition.

The subsequent approved A4 planning revision folds this capture into § 9.1 and 7.R2; its recorded policy,
review, and execution order are under § A4 — Explicit repair of competing approval roots. Final verification also
covers its appended criteria 17–19. Task 7.R2 implements that disposition as one atomic change; its implementation and
subsequent clear inbox preflight are recorded in the retained evidence.

### Merge qualification

The append-only merge is `217741578f81169aeb45107ca4f85cd995575a0b`, with both the pre-merge head and exact base as
parents. Normal hooks passed 11 checks. `arc check new-head --from 04d90f6b6073af480642f76aa7bb169b295ffaa8`
passed 12 checks and reused five, including both type checks, the complete unit tier, lint, and contract checks.
The raw report is `base-merge-new-head.log` under the implementation evidence directory. ARC now reports the
prerequisite as shipped. These results qualify the merge; they do not attest the real-state trial, full hosted
portability, or work-unit completion.

## Later work that reads § 1–§ 4

`storage-projection`'s and `cohort-identity-verbs`' ref-backend phases build on the listing scope, the fault classes and
remedies, and the pull-result consumer sweep. They are the work § 13's re-raise watches: if either becomes ready to start
while this unit's remaining work is more than about a week out, re-raise the cut of § 1–§ 4 into its own member.

## Review during execution

`storage-ref-backend` took eight standard passes before its review stopped under a rule fixed in advance. For this
unit: review code reachable from shipped commands first, in its own chunks; group findings by shared cause after the
first pass; and agree a stop rule with the Owner before the second pass.

## Evidence for § 5

The stranded ref lock that § 5 removes is recorded in `notes-storage-ref-backend.md` § A58, from hosted dispatch
`40794816270`: the Windows separate layout's publishing burst refused on a lock the sync deadline stranded. That burst
is the case § 5 unskips.

The default layout's burst failed the same way on Windows in hosted dispatch `41149894984` at `9e4149885`, from
`store-operation-git-access`'s verification (2026-10-31): 13 `tracking-update-failed` notices, then the push
`unreachable` at the deadline. It is the run spec § 5.4 means by a hosted Windows failure of the default-layout burst.

### Hosted Windows tracking notice with successful publication

Project-manager relay, 2026-11-01: normal `projection-substrate` CI run `41374431909`, head
`b72db39947be6aeb9c98618f2d1bdb7ab4185bc8`, Windows shard 1, Git `2.56.0.windows.2`, failed the default-layout
publishing burst. A retained intermediate pull reported `tracking-update-failed` for the personal tracking ref, while
final publication reconciled successfully; the warning-free assertion failed. Evidence:
`~/dev/arc-evidence/projection-substrate/windows-tracking-update-41374431909/README.md` and
`ci-windows-1-failure.log`. The instrumented rerun did not reproduce it, and the original raw fetch streams were not
preserved. The cause remains unknown; no new diagnostic hosted run was launched for this assessment.

Neither Task 6.5 nor Task 6.9 is established as fixing this occurrence:

- Task 6.5 (`e4c582683e`) suppresses a rejected row only when the failed-fetch observation proves its tracking value
  moved off the reported old value and already holds the fetched tip or a descendant, including an applied deletion.
  The original evidence lacks the row and tracking observation needed to establish that condition. Eventual successful
  publication alone does not establish it at the earlier notice's classification.
- Task 6.9 (`411f3c461d`) repairs observed stranded locks named by failed publication outcomes after all writers exit.
  A successful publication retaining a pull notice has no such failure to repair: recovery returns it unchanged, and
  `assertPublished` still rejects its notice. It does not cover this warning-only signature.

This is an unresolved intermittent concern, not a demonstrated cure or a new diagnosis. Task 6.10's required normal
qualification continues; this assessment adds no diagnostic hosted dispatch.

### First-pull child failure during local qualification

Task 6.10's store check at `411f3c461d`, run `b161b0ce676c4541bb59d23f21bac56d`, failed the terminal-false first-code
choice in `store-ref-designation-states.test.ts` on WSL. The other five shards passed. The child has a 10-second
process limit; the case failed after 10,694ms with no retained child-exit or signal details. A timeout is plausible,
but its cause is unestablished. This is independent of the hosted Windows tracking-notice concern above.

An isolated WSL run passed with console diagnostics suppressed. Corrected raw-stream capture on `m5-air-ac`, run
`033ede2b02754842a93595eeb95283da`, then observed exit code 0 in 2,607ms, no signal, no kill, and empty stderr. Neither
passing isolated run explains the original failure. Evidence is retained under
`~/dev/arc-evidence/storage-ref-hardening/implementation/` as `task-6.10-store-history.json`,
`task-6.10-store-full.log`, and `task-6.10-targeted-diagnostic-captured.log`.

The Owner accepted this specific unresolved intermittent failure as an exception to the unknown-cause stop rule:
retain failure-only child exit/signal/kill and output diagnostics, change no assertion or timeout, and retry the full
store check once. A passing check permits normal CI and the remaining tasks; it establishes no fix. A recurrence
stops with the captured details. A controlled native child failure validates the retained diagnostic path without
attributing that controlled cause to the original failure.

The approved full store retry at `b2dc2f14fa203cd543b21c3234669b507482b08e` passed all six shards, and the refreshed
segment request passed. Normal CI `41392563220` at that pushed head then passed with `run_portability_pair=true` and
no diagnostic inputs. Its Linux unit, integration, store, E2E, lint/typecheck, and concurrency checks passed, as did all
six Windows and six macOS portability shards. Windows shard 3 ran all seven transaction-deadline cases and all four
burst cases, including both prepared-hook deadline cases and both twenty-publisher layouts. Evidence is retained as
`task-6.10-store-approved-retry.log`, `task-6.10-segment-current.log`, `task-6.10-ci-current.json`, and the six
`task-6.10-ci-windows-*.log` files beside the original failure. These passing results permit continuation under the
accepted exception; they establish no cause or fix for the original failure.

## History-destination retry evidence

Task 7.1 keeps the counter at the public write call and observes destination values at preparation, admission, and
transaction read-back. An attempt consumes at most one loss even when its read and transaction see different moves.
Exact destinations come from the normal proposal preparation, reused against coherent captured tips only when an
early basis change needs that evidence. Each replay has private groups, quarter plans, and a private blob stage;
normal success paths retain their Git calls. Preparation can invoke registered parsers and identity/label ports, so
this is not a claim of callback-free probing. A speculative refusal or resolution request preserves the basis retry.

The native counterexample for capture accounting used two outside history transaction losses and a second owner's
genuine Store-produced rename. Its companion forced comparison-free re-resolution without changing its record version.
A third history move in the new capture then published without invoking the old counter. The fix observes that
prepared capture before publication, while the attempt's marker prevents later observations consuming another loss.

Fail-first evidence under `~/dev/arc-evidence/storage-ref-hardening/implementation/` includes the one-move,
transaction-bound, admission-bound, resolution-bound, and resolution-capture red logs. The transaction bound's valid
run is `task-7.1-transaction-bound-red-valid.log`; its earlier fixture-parser failure is not evidence of the behavior.
Narrow controls cover re-detection resetting or double-counting, ordinary-race resets, exact destination selection,
multi-destination batches, comparison-free resets, and once-per-attempt accounting. Every control was restored.

`task-7.1-native-regression.log` records the restored implementation's 144 passing native cases across twelve suites,
including all eighteen history cases plus archive, retirement, rename, anchors, reopen, and batch regressions. The
multi-destination case's first setup incorrectly retained single-write provenance in its batch; that input refusal is
not race evidence. Its corrected initial run is `task-7.1-multiple-destinations-initial-valid.log`. Lint's loop-complexity
failure led to the typed attempt extraction recorded on the task; the restored code passes file lint. Hosted evidence
at the final implementation head is still due during verification.

## A1 — Withdrawal conflict visibility

Task 7.2's captured-tip change threads the withdrawal's `state`, `held`, and `incoming` through its entry inverse.
The native case uses an already-completed second owner's production inbound document: an unpublished end creates
it, a later write leaves it present-empty, and a competing published end triggers withdrawal. An independent,
Store-produced quarter tip replaces the live quarter after capture and is restored before normal publication checks.
The old fresh listing retains the end with a placement failure; captured tips let withdrawal complete in both layouts.

The final current-view assertion exposes a separate pre-existing gap. The completed owner's history ref contains the
new whole-record conflict, whose nonempty base and empty current value both carry the captured quarter and sequence.
Its current quarter folder contains the inbound, primary, and metadata only, so the archived point read reports an
empty conflict set. `prepareWithdrawEnd` prepares each journal ref independently: the archive inverse removes folders
for the withdrawn end, while the history inverse appends the new conflict without refreshing that completed copy.

The original production source at `c8f5708e1c`, with no quarter move, reproduces the same omission in both layouts.
The completed-copy correction is separate from the captured-placement change and the later quarter-provenance fix.
The outside-range stop was raised, and the Owner approved extending 7.2 with the atomic refresh before publication.
The original 7.2 Goal stays unchanged; revision 7.2.R carries A1's additional behavior.

The approved correction reuses `refreshArchivedFolder`, as `prepareSyncHistoryQuarters` does, after all inverse groups
are prepared and before collision validation/publication. Refresh only surviving eligible completed folders from
their final history groups, preserving each independent end and placement; do not recreate the withdrawn end's folder.
Every refreshed quarter must remain within the captured, locked, expected-value transaction. The refresh also carries
entry changes undone by the inverse, so a surviving copy cannot retain a removed contribution.

The prepared captured-tip change passes file lint and both source/test type checks. Its native regression remains red
on the omitted current conflict set in both layouts; no Task 7.2 completion or passing native result is claimed.

Evidence is under `~/dev/arc-evidence/storage-ref-hardening/implementation/`: the placement-specific failure is
`task-7.2-captured-placement-red-exposed.log`; the post-change current-view failure is
`task-7.2-captured-placement-green.log`; the retained conflict and omitted quarter paths are in
`task-7.2-conflict-location-diagnostic.log`; and `task-7.2-quarter-conflict-baseline-control.log` reproduces the omission
against the original code without a quarter move. Temporary diagnostics and baseline controls are restored. Earlier
setup refusals from the inbound-held rule and a missing primary-content read are not fail-first evidence.

A1 elaborates Goal 8's withdrawal robustness: § 9 and the original criteria did not require completed-copy consistency,
so the entry gate selects spec-depth rather than incomplete task derivation. No Non-Goal excludes this correction.
The existing refresh and atomic publication mechanisms make the correction determinate; no lifecycle or Class change
is needed. The capture adds the § 9 obligation, spec criterion 14, the appended task criterion, and 7.2.R.

Author checks over A1's footprint traced `prepareWithdrawEnd`, `inverseWithdrawStep`, `preserveInverseConflicts`,
`commitWithdrawal`, `prepareSyncHistoryQuarters`, and `refreshArchivedFolder`. The retained-history and current-read
mismatch is reproduced by the logs above. The new obligation states the desired behavior without requiring these
notes; its criterion distinguishes conflict visibility, entry inversion, placement, and atomic publication. Grounding
of 7.2.R and its immediate neighbors found no import or review-mapping dependency. Forward propagation includes 7.2's
covering regression and Phase 8's final criterion walk; 7.3–7.5 are unaffected. Backward propagation leaves 7.1's retry
outcome and 6.10's deadline/concurrency qualification unchanged: neither attested this completed-copy behavior.
Independent planning review is omitted for this determinate amendment; these checks are author-run evidence.

### A1 publication-cost constraint

The A1 capture is committed at `af08eb88d3`; its increment request passed all 11 selected checks. New native cases
confirm the same current-copy omission for an undone entry contribution, with and without a later quarter move,
in both layouts. `task-7.2-A1-red.log` records four failures for ordinary copies; `task-7.2-A1-moved-red.log` records
the two moved-copy failures. These are native public-store cases, not private-helper substitutions. No completed-copy
implementation had begun at that capture.

The moved copy's quarter is absent from the original journal, so limiting refresh to journal quarters would leave the
approved outcome incomplete. `commitWithdrawEnd` already includes captured state quarters in the watched lock set
when the journal affects another history owner. `commitWithdrawal` can therefore publish an added prepared quarter
with the existing expected-value transaction, but `writeRefTree` and its per-ref `commit-tree` must create that
quarter's new tree and commit. This conflicts with Cross-cutting › Performance's zero-extra-process statement and
7.2.R's matching descriptor. Reusing captured trees, owned metadata, and a shared locked-context lifecycle cache can
avoid a fresh listing and redundant acquisition; it cannot remove required publication writes for a new quarter.
Execution stops at this unsettled cost constraint. The recommended bounded exception permits only the tree/commit
creation needed by newly affected completed quarters; unrelated success paths keep their existing process budget.

The bounded advice from `/root/withdraw_copy_advisor` independently identified the same journal-only coverage gap
and publication-cost conflict. Its eligibility recommendation is to preserve the existing witnessed-batch rule of
`readSyncHistoryQuarters` against captured pre-inverse history, then refresh only still-present folders from final
prepared history. This is advisory evidence, checked against `commitWithdrawEnd`, `commitWithdrawal`, and
`readSyncHistoryQuarters`; no independent review or fix completion is claimed.

### Advisor on the publication-cost exception

The Owner requested a follow-up from `/root/withdraw_copy_advisor` on whether the exception preserves the original
intent of the process prohibition. The advisor recommends a narrow explicit amendment; the literal prohibition still
requires disposition. Its intent reading is an inference from the surrounding record, rather than a recorded waiver:
the hardening Performance examples avoid added ordinary-path diagnosis and discovery, while the completed
`spec-store-operation-git-access.md` preserves exact listings and existing tree/write processes. Its Alternatives ›
Writes rejects batching across refs and reproducing commit identity/date/environment handling for limited savings.
The cost analysis separates acquisition overhead from writes and calls sync captures exact by design.

The advisor's proposed boundary allows only the existing `writeObjectTrees` batched `mktree` and `commitWithdrawal`'s
`commit-tree` for each otherwise-unwritten quarter whose composed tree actually changes, per attempt. Metadata blobs
join `flushRefBlobStage`; all changed refs retain the existing atomic transaction. No extra listing or redundant
discovery is authorized, unaffected paths keep their process budget, and unchanged quarter trees should add no
publication work. The recommendation is to compare native ordinary-copy, moved-copy, and no-refresh controls in both
layouts with temporary process tracing, retaining counts rather than creating a broad benchmark suite.

Primary source checks confirmed the quoted Performance examples, operation-access Non-Goals and Writes alternatives,
`writeObjectTrees`'s one batched tree process per ref, `commitWithdrawal`'s one commit process per prepared ref, and
`flushRefBlobStage`'s shared blob flush. The consultation settles the recommendation, not the Owner's decision or the
implementation's cost proof: captured evidence sufficiency and the unchanged flush/transaction counts still need
verification. No performance exception has been applied, and the Owner's stated lean is not recorded as approval.

## A2 — Required quarter publication cost

The Owner approved the advisor's bounded exception. A2 supersedes the original Cross-cutting › Performance opening,
"Success paths start no extra Git process", only for necessary publication of otherwise-unwritten completed quarters.
A changed quarter may add `writeObjectTrees`'s one `mktree --batch` and `commitWithdrawal`'s one `commit-tree`, per
attempt. Metadata joins `flushRefBlobStage`, and all refs retain the one atomic compare-and-swap publication. No
additional listing or redundant discovery is permitted. Unchanged quarters and unaffected paths retain their budget.
The original 7.2.R Goal and descriptor stay as recorded; its new note points to A2 and 7.R's cost verification.

The amendment is a determinate design correction using the existing writer, with no Class or lifecycle change.
Author spec-review and grounding-only task-audit cover the changed Performance obligation, appended spec criterion 15,
appended task criterion, 7.2.R's note, 7.R, and its immediate neighbors. Source checks of `writeRefTree`,
`writeObjectTrees`, `flushRefBlobStage`, and `commitWithdrawal` establish the stated writer structure; the native
moved-quarter failure establishes why a new ref must join publication. Captured-evidence reuse and exact incremental
counts remain implementation obligations to verify, not claims of a passing result. Reader independence and binding
completeness hold: the Performance text states the exception and its limits without these notes. Forward propagation
adds 7.R and Phase 8's criterion; backward propagation leaves the recorded 6.10 and 7.1 outcomes unchanged. A1's
copy-consistency criterion remains intact. Post-settle coherence found no conflicting exclusion or changed schema.
Independent planning review is omitted at this determinate amendment's depth; all checks here are author-run.

## A1/A2 implementation evidence

`sync-withdraw-copies.ts` captures batch provenance from the operation's existing lifecycle log evidence, keyed by the
captured history tip before the locked inverse. It uses those immutable facts only for the existing witnessed-batch
eligibility rule; locked tree/blob availability still starts fresh. `prepareWithdrawEnd` batches captured quarter trees
and owned metadata into its existing acquisitions, completes every inverse and preserved sibling lineage, then
refreshes surviving eligible copies from final prepared history through `refreshArchivedFolder`. The existing watched
lock set and expected-value transaction already include all captured state quarters. A newly affected quarter joins
`prepared` only if its composed entries differ; removed withdrawn folders are never recreated.

The persistent public-store regression covers undone entry removal with and without a later quarter move, and a
whole-record conflict whose quarter tip temporarily moves after capture, in both layouts. The original fresh-listing
placement failure and pre-existing copy omission have separate red evidence recorded above. The clean focused retry
`task-7.2-placement-feedback-retry.log` passes all seven cases, including the existing placement-fault remedy/retry.

Temporary native process tracing compared the original pending placement fix with the copy repair, using ordinary,
moved, conflict, and no-refresh scenarios in both layouts. The baseline has six expected behavioral failures and two
passing controls; the repair passes all eight. Within each withdrawal, only these process deltas occur:

| Scenario           | `cat-file` | `diff-tree` | `mktree --batch` | `commit-tree` | Listing / blob flush / publication |
| ------------------ | ---------: | ----------: | ---------------: | ------------: | ---------------------------------- |
| Ordinary copy      |         −1 |          −1 |                0 |             0 | unchanged                          |
| Moved copy         |         −1 |          −1 |               +1 |            +1 | unchanged                          |
| Conflict copy      |         −1 |          −1 |                0 |             0 | unchanged                          |
| No-refresh control |          0 |           0 |                0 |             0 | unchanged                          |

`task-7.R-scoped-baseline-trace.log` and `task-7.R-scoped-repair-trace.log` contain the raw records;
`task-7.R-process-deltas.json` records the exact comparison for all eight cases. Each normal withdrawal retains one
ref listing, one staged blob flush, and one publication transaction. The conflict fixture additionally performs two
outside-writer `update-ref` calls, unchanged in both runs. Whole-pull traces also include later merge ancestry checks,
whose counts vary in the baseline itself; the scoped trace isolates the repair and preserves the full counts too.
All source probes, test tracing, and temporary controls were restored before the clean focused run and final checks.

Feedback corrections stay with the owning tasks. File lint first reported complexity 16 in the refresh loop;
`dropUnchangedQuarters` extracts its independent cleanup and the restored source passes file lint. Both type checks
found the same optional provenance `batchId` narrowing; the helper now retains only present batch IDs, as the existing
history-copy selector does. The broader regression first passed 337 of 338 cases: the old historical-placement
fixture still left a healthy tracking tip, which the corrected captured-tip policy can legitimately use. Its native
forced rewrite is now explicitly accepted in tracking and seen refs too, so every captured tip lacks the healthy
witness. Every original fault, no-publication, history-preservation, and successful-retry assertion stays unchanged;
the corrected case passes in the clean focused retry. The final native regression passes all 338 cases in 20 suites
(`task-7.2-withdraw-regression-final.log`); both source and test type checks pass
(`task-7.2-A1-A2-types-final.log`), as does file lint over the five production files and both tests. The first type
request met the complete stale-build refusal; its one prescribed fast build and exact retry were retained separately.
The completion marks 7.2, 7.2.R, and 7.R and closes A1/A2's revalidation entries. Hosted qualification at the final
implementation head remains due in Phase 8; no new hosted run is claimed here.

## Push exclusion refusal evidence

`publishRefAttempt` keeps the notices from its own `pullPushBasis`, then independently calls `capturePushListing`.
`readPushListing` can therefore discover a pending end after another public pull changed the clone's state, without
adding that second pull's notice to the original push. The native case pauses before the push listing acquires the
personal lock, lets a separate public pull discover an archive with missing retained history, then resumes. In both
layouts the original push's own notices remain empty, its personal/work batch is excluded, and the independent inbox
publishes. Original exclusion produced empty condition/remedy fields and failed `PushResultSchema`; the fallback now
names the required history, and restoring it permits a successful push with the personal write preserved.

That public input replaces the planned direct private-helper test without changing the task's Goal. The source scout
`/root/push_seed_reach` supplied advisory reachability evidence; the native run and primary source checks establish
this concrete path. `task-7.3-pending-fallback-red.log` is the two-layout schema failure, and
`task-7.3-pending-fallback-green.log` passes both complete repair scenarios.

The double-end cases use genuine independently published archive batches, a mirror erasure, and an unpublished
completed-companion/personal batch. An independent live movement makes the listing inspect the pending owner whose
retained history lacks the other end's batch. Pull reports `ended-twice` by item UID and suppresses `end-pending`;
`excludeBrokenPushRefs` now carries the item-keyed notice's condition/remedy instead of the generic missing-history
fallback. `task-7.3-ended-reason-red.log` records the exact wrong-reason failure, and
`task-7.3-ended-and-fallback-retry.log` passes all four scenarios through restoration, reopening, ending once, and
publication. The first recovery attempt updated tracking alone and left an incompatible keeper; the corrected native
procedure restores the erased published-quarter witness and accepts the other history into tracking and seen refs
atomically before merging by name. No production remedy or existing refusal assertion was weakened for that setup.

The history-divergence case retains genuine completed history and quarter evidence while its live batch remains
unpublished, then rewrites the remote history to its genuine pre-end ancestor. The rejected rewrite leaves local and
tracking history equal, so `publishRefAttempt`'s early changed-history refusal does not mask exclusion. Pull suppresses
`end-pending` beside `history-diverged`; the original selection still chose the generic missing-history repair.
`task-7.3-diverged-reason-red.log` records that exact two-layout failure. `pendingEndRefusal` now prefers a kept notice
naming the live/history coordinate before matching a double-end notice by family and UID, then uses the fallback.
Its pure selection adds no Git process. Each initial exclusion reason covers its unchanged atomic batch closure.

`task-7.3-reasons-green.log` passes all six native cases through complete repair. The divergence case performs the
notice's lease-bound keep-ours publication and retries successfully; double-end recovery preserves both histories
before reopening and ending once; fallback recovery restores missing history. Every case also observes independent
inbox publication and preservation of its personal batch contribution. The test files import only public storage
surfaces and native fixture helpers; no private module or test facade was introduced. File lint initially found
complexity 18 in the exclusion function and an unused initial test assignment. `pendingEndRefusals` extracts reason
collection and the test now declares its retained tip without the unused initializer; all four files pass file lint.
The broader native regression passes all 119 cases in ten suites (`task-7.3-push-regression.log`), including tracking
failure exclusion, double ends, listing growth, batch-object loss, and ancestry repair. The increment request passes
all 11 selected checks, including both source and test type checks (`task-7.3-increment.log`). Related feedback and
commit checks are retained separately as `task-7.3-related.log` and the ordinary hook records.

## Restored-primary quarter provenance evidence

Task 7.4 uses public production-store writes and native trees in both layouts. A completed primary is removed while
its folder metadata survives, then restored by a single expected-absence put that reopens it or moves its quarter.
The four original cases fail at `quarterCommitReference`'s internal no-mutation error. Their initial setup used a
hand-edit verb that cannot remove a primary; that authority refusal is retained separately and supplies no fail-first
evidence. Lifecycle-authorized archive provenance reaches the intended error without changing the write guards.

Astra's bounded advice (`quarter_provenance_advisor`, first consultation for this task) compared treating retained
metadata as an ordinary record witness with a fallback after the existing selector. The fallback preserves existing
batch attribution: only when no physical candidate matches, select the first actual primary put whose same-owner
folder retains primary metadata. Resolution targets do not become fallback candidates. Existing decoded folders,
UID-aware identity comparison, and primary-role equivalence supply the evidence; no extra Git read or process is added.
Source inspection confirmed those identity and acquisition properties before implementing the advice.

The mixed-owner guard puts the restored owner first and an existing companion owner second. Both layouts keep the
second owner's quarter provenance. A temporary control that counted primary metadata as a physical record selected
the wrong first owner in both cases; the exact fallback source was restored before regression checks. The repaired
six cases and the existing quarter provenance, archive, completed-write, reopen, and provenance suites passed together
(75 cases across six suites). Evidence under `~/dev/arc-evidence/storage-ref-hardening/implementation/`:

- `task-7.4-setup-authority-refusal.log`: initial fixture authority refusal, not the regression witness.
- `task-7.4-restored-primary-red.log`: all four intended internal-error failures, run
  `b84943386cb541ac96203c38d1bc6f16`.
- `task-7.4-priority-baseline.log`: existing attribution passes before the fix in both layouts.
- `task-7.4-priority-control-red.log`: wrong-owner assertions fail under the narrow temporary control, run
  `67befcba9b434fbdbb4b1abb7d7474b6`; its retained pool history confirms command exit 1.
- `task-7.4-restored-primary-green.log` and `task-7.4-quarter-regression.log`: restored source passes all six new cases
  and the broader regression selection.

## Decomposition companion naming evidence

Task 7.5's reachable report defect is reproduced through the production registry and native public store in both
layouts. The origin keeps its normal draft Design and owns a companion keyed `design/notes-origin.md`. Fresh preflight
scans its basename, and a producer-derived map allocates its notes unit to `notes-member-a.md`. The additive write
copies and retitles the real companion successfully, but its report originally names
`design/notes-origin.md-member-a.md`. `copyCoordinates` now calls `companionStoredName`, the specified change, so the
report names `design/notes-origin.md`; the test reads the actual copied record and Git blob at that reported name.

The Design-success claim in § 10 requires disposition before this task closes. `checkMetaDesignEntry`
(`store/kinds/meta/reference-rules.ts`) accepts fresh member Design entries only for its own conventional draft/spec
names or its paired-spec names with canonical `spec-prd` / `spec-rfc` companions. Reserved-path and alias admission
prevent a raw companion key from masquerading as those canonical records. A new verbatim Design entry fails even
with the corrected formatter. `decomposePlanningProfile` (`decompose/source-profile.ts`) independently requires the
origin's conventional design profile. The report correction changes neither contract.

Astra's bounded consultation (`decompose_name_advisor`, first for this task) confirmed the report reproduction and
recommended the specified correction, retaining ordinary Design coverage. It identified a faithful path into the
Design-copy branch: remove an origin's canonical draft while its unchanged Design survives, then seed
`design/draft-origin.md`. Native preflight succeeds, but additive publication refuses the new member's
`meta.design-entry` both before and after the formatter correction. Thus the branch is reachable; successful verbatim
Design publication is blocked by the existing contract. Source inspection and both native layouts confirm that
boundary. The advisor did not authorize a contract or acceptance change.

A3 was approved after the report correction and native boundary evidence were presented. The amendment retains
conventional Design admission and narrows § 10's acceptance claim to the reachable report defect. Task 7.5's original
Goal is preserved with a forward reference to 7.5.R; successful verbatim Design publication is superseded, and the
existing metadata and planning-profile contracts remain in force.

Evidence under `~/dev/arc-evidence/storage-ref-hardening/implementation/`:

- `task-7.5-companion-report-red.log`: both layouts fail on the actual wrong report name, run
  `4bcd5e1f9e9e4313842a3aee16497e08`; its retained pool history confirms command exit 1.
- `task-7.5-reserved-path-setup-refusal.log`, `task-7.5-primary-placement-setup-refusal.log`, and
  `task-7.5-design-setup-refusal.log`: rejected fixture inputs, none supplying target fail-first evidence.
- `task-7.5-design-admission-baseline.log` and `task-7.5-design-admission-probe.ts`: the native Design boundary probe
  before the formatter change. Its temporary test file was removed from the checkout after retaining its exact input.
- `task-7.5-companion-regression.log`: the first corrected-name run reached a native assertion whose string Git port
  strips the final newline. The assertion now uses the byte-preserving raw Git port; expected record bytes are intact.
- `task-7.5-companion-regression-retry.log`: the two report cases, two unchanged Design boundary probes, existing native
  cut admission, and conventional draft/single/paired Design scaffolds pass together (36 cases across four suites).

## A3 — Conventional Design admission and companion reports

Owner approved the proposed A3 row on 2026-11-02. This low-depth design amendment supersedes § 10 ¶1's Design-success
claim and adds criterion 16. The original statement was:

> `copyCoordinates` (`lib/decompose/scaffold-copy.ts:47-48`) derives a verbatim companion's name with
> `companionArtifactName`. The store places the record by `companionStoredName` (`lib/store/companion-name.ts:11-13`).
> The record lands correctly, but the member meta's Design entry (`member-scaffold.ts:64,72-74`) and the decompose
> report name a record that resolves to nothing. Both use `companionStoredName`. Only `arc decompose` under the ref
> backend reaches it.

`copyCoordinates` now supplies the same stored companion name as `expandStoredPath`, and `reportDecomposeAdditive`
returns it. A report-only native regression reaches the actual defect without bypassing admission. The new member's
Design-success branch cannot satisfy `checkMetaDesignEntry` for a verbatim path; the amendment retains that rule and
`decomposePlanningProfile` rather than adding a new Design contract.

The bounded author check covers § 10, criterion 16, Tasks 7.5 and 7.5.R, Phase 7's exit criterion, and the Phase 8
verification note. Reader independence and binding completeness hold: the amended specification states the desired
report name and retained Design limits directly. Grounding traces `copyCoordinates`, `companionStoredName`,
`expandStoredPath`, `reportDecomposeAdditive`, `scaffoldMember`, `checkMetaDesignEntry`, and
`decomposePlanningProfile`, with the native report and Design refusal evidence above. The grounding-only task audit
finds no new prerequisite or unsettled implementation choice; 7.5.R revalidates the committed correction and retained
boundary. This is author evidence. Independent planning review is omitted at low amendment depth under
`planning-review`; no evaluator pass is claimed.

Propagation retains the original Task 7.5 Goal and appends its A3 reference. Phase 7's exit still closes on the
reachable defect's fail-first case; criterion 16 adds the explicit retained-contract acceptance that Phase 8 must
verify. Earlier completed-task evidence is unaffected. No import, mapping, delivery, schema, or process-cost behavior
changes. The final author reread found no remaining contradiction within this footprint.

A3's capture is `ebb67b75a0`. Task 7.5.R re-ran the native report regression, the retained public-store Design probe in
both layouts, and the existing draft, single-spec, and paired-spec scaffold suite: all 14 cases across three suites
passed. The new log is `task-7.5.R-revalidation.log` in the implementation evidence directory. The temporary probe was
removed after the run; its exact source remains `task-7.5-design-admission-probe.ts` beside the logs. Existing
Design admission is a retained property, while the report correction keeps its original native fail-first witness.
Task 7.5 closes on the amended scope through 7.5.R, and criterion 16 remains unchecked for final verification.

## A4 — Explicit repair of competing approval roots

The approval-root capture (AGG-F3, “Repair a pull-merged second approved-response root”) folds into § 9.1 and Task
7.R2. It serves post-flip recovery: independent clones can each approve a root, and sync preserves their competing
facts. It changes the compatibility and process-cost commitments below, so this is a design amendment at medium
scope; the existing Heavy class remains appropriate. No implementation is included in the capture.

### Superseded commitments

Goal 10:

> 10. No refusal code, pull-notice kind, publish-failure kind, or result schema changes.

Cross-cutting › Compatibility:

> - **Compatibility.** ARC is pre-public-release, and the ref backend is reached only through hidden `arc store`
> commands before the flip. No refusal code, notice kind, failure kind, or result schema changes, so callers keep
> compiling and branching as they do. The outcomes that move are listed in § 1.8: a missing object from terminal to
> recoverable, and a local object or transport failure from `unreachable` to `incomplete`.

Cross-cutting › Performance:

> - **Performance (A2).** Success paths start no extra Git process except § 9's completed-copy repair: each
> otherwise-unwritten completed-quarter ref whose composed tree must change may add the existing writer's one `mktree
> --batch` and one `commit-tree` process per attempt. The repair reuses captured evidence, starts no additional listing
> or redundant discovery process, and publishes all affected refs in the withdrawal's existing atomic compare-and-swap
> transaction. Unaffected success paths retain their process budget: - § 1.3 reads a tree only after a `missing` answer;
> - § 1.6's local object check runs only after a completed failure with no porcelain rows; - § 5.2's wrapper `lstat`s
> only after a failed transaction with no lost race; - § 8's registry prediction reads the registry tree only when
> `planRefRetirements` would, and reuses that read. § 6.2 can repeat a lease attempt under contention, bounded by the
> deadline. § 2 narrows live listings and so reads no more than today.

Criterion 4, preserved unchanged until verification dispositions it against A4's narrow replacement:

> 4. `StoreRefusalSchema`, `ListingDiagnosticSchema`, `PullNoticeSchema`, `PublishFailureSchema`, and the result schemas
> are unchanged.

### Decision and execution boundary

Use one stable whole-record selector for the exact owner UID and producer, retaining every approval and its history.
The excluded branch policy is explicit: no node may contain performance or settlement, including empty settlement.
The selected branch may contain either; multiple protected branches remain outside the repair. Late offline facts
invalidate unsafe selection. Preview/apply, stale inventory, selector conflicts, and normal continuation all have
executable recovery coverage. The new command opens refs directly, while ordinary `createStore` remains in-repo.

One shared selection loader serves existing composed reads and the additive native response capability. Native lane,
settlement/pass, hosted-result, and approval-authority consumers receive selected facts from one snapshot. Existing
point outcome access and immutable-only result reads retain their scope; new inventories on raw-key authority paths
are explicit and bounded. Actual native process counts remain implementation evidence, not a planning claim.

Execution order is 5.12 → 5.13 → 7.R2.a–f → 8.1. The selector has no legacy import source, so it does not precede or
change those trials. Subtasks a–f are one coherent implementation increment and atomic commit under the approved
batch authority. Both native layouts and final-head verification remain required; criteria 17–19 are not yet met.

### Planning review and authorization

Pass 1 found one major: disposition-only selection missed native lane reconstruction and settlement consumers.
The approved correction adds the shared native authority reader, complete consumer routing, explicit interface/cost
commitments, and the selected pending-fix versus excluded no-fix scenario. Independent fix check round 1 found no
findings; complete pass 2 also found no findings. Both reviewers reported independent runners with no session files
loaded. The complete findings, actions, prompts, exact artifacts, and reports remain in the personal pass record.

The Owner approved full pass 2 and, if clear, resumption of implementation (2026-11-03). The clear result released
this capture and the agreed remaining execution. The subsequent fresh notes-save/personal-write-hold confirmation and
completed 5.12/5.13 trials are recorded below. Planning results attest neither those trials nor the implementation or
its process cost. The post-settle capture reread compares the authored record with the reviewed proposal.

### Implementation and recovery evidence

Task 7.R2 adds the registered `review/evidence-root-selection` machine record and the direct-ref JSON command
`arc store repair-review-roots`. Its preview inventories raw facts even when ordinary composed reads refuse. Apply
binds the exact owner, immutable result, complete evidence inventory, selector, and every conflict alternative;
locked admission validates the final inventory and resolves only the observed complete conflict set. The selector
retains every approved record and uses ordinary whole-record merging, version observations, and owner-ref admission.

The shared loader preserves the evidence-first composed snapshot and outcome-first native snapshot. Native
`responses` supplies selected authority to operation reconstruction, settlement/pass derivation, hosted results,
conditional authority, performance, approval/successor replay, and settlement continuation. Local/frontline immutable
producer-result reads keep outcome-only access. Raw evidence access continues to expose every branch. The physical
selector path uses `root-selection-` so it cannot collide with the existing evidence path decoder.

The final focused run, `storage-a4-native-closure.log`, passes 91 cases across nine native integration suites and
three unit suites. The broader `storage-a4-native-unit-closure.log` passes 1,698 cases in 150 existing/new unit files.
Both native layouts exercise producer-generated competing approvals, real built CLI preview/apply, exact UID/name
selection, pending-fix continuation, raw evidence retention, opposite-selector conflict resolution, changed evidence,
new/missing roots, missing outcomes, orphan/malformed selectors, canonical fact keys, late offline performance, and
repair followed by normal continuation. Snapshot interleavings cover safe selector movement and an unsafe captured
choice that a later valid choice must not conceal. Actual hosted approvals contain settlement, including empty
settlement: competing protected branches return non-retryable policy-blocked and preserve every fact. No selectable
hosted fixture is invented by stripping its producer's settlement. Multiple performed/settled branches remain outside
this repair.

Narrow reconstruction controls preserve exported interfaces and run to behavioral failures before exact source
restoration. Retained logs cover selected native authority and current-tail replay; missing/malformed producer facts;
selector observations, keys, bindings, removal and new-root admission; excluded performed/settled nodes; complete
snapshot reuse and immutable-only access; stale/new inventory; and partial selector conflict resolution. The final
request-basis control fails eight real-CLI cases when exact basis comparison is disabled: wrong immutable-result
coordinates and omitted selector conflicts otherwise apply. The restored implementation passes those cases in the
final focused run. Registration, parser/path, and generic kind-conformance assertions are structural/property checks,
not independent pre-fix behavioral witnesses. The early conflict-race attempt changed the selector version and was
already refused; it is not an unsafe-acceptance witness. The corrected race keeps selector content/version unchanged
while adding a conflict and fails twice without the complete conflict observation/final-state guard. Compile/import
errors and the early invalid hosted fixture are not counted as fail-first evidence.

### In-range corrections

Known-cause failures were repaired within § 9.1 and the approved 7.R2 range, then rerun:

- **7.R2.a:** Native codec qualification supplies the new selector's canonical JSON/key fixture, deriving its branch
  IDs from the existing producer-bound approval constructors instead of falling back to projected prose content.
- **7.R2.b:** Fault injection follows the new public Store boundary. Malformed-selector listing diagnostics reuse the
  registered path decoder without another capture. Missing-producer performed-fix judgment retains its original
  restore-approved-response stop. Existing reciprocal-edge ordering, missing-outcome classification, context remedies,
  and ordinary successor-admission remedies retain their prior refusal attribution; the nine broader regression
  failures clear without weakening their assertions.
- **7.R2.c:** Selected evidence admission was pulled forward when continuation reached the competing-root write check.
  Sync validates the resulting complete selection without treating retained remote intake as a local excluded advance.
  Preview now shares canonical evidence/outcome key validation with authority readers; four misplaced-key cases fail
  before this correction and resume after exact forward restoration. Preview permits only the existing snapshot-token
  ref to advance while authoritative refs remain unchanged.
- **7.R2.c:** The bounded advisor consultation identified native approval replay as authority-bearing: append success
  feeds settlement/policy continuation. Source inspection confirmed those callers. The publisher now uses one selected
  authority snapshot, reuses its outcome/evidence, rejects excluded or superseded approval replay, and retains exact raw
  physical replay. Six native cases expose the prior acknowledgement; selected replay and normal continuation pass
  after repair. This consultation supplies advice, not independent verification or standard-review attestation.
- **7.R2.d:** Damaged selector alternatives retain their actual conflict-record coordinates for restoration. Apply
  observes the selector's complete conflict set, and the kind check rejects a local final selector with unresolved
  conflicts, covering conflict-only races and alternate direct Store writers. Both recover through fresh preview/apply.
- **7.R2.e:** Broad related feedback identified four stale command/schema inventory assertions. The strict raw-Git
  command list, authored request roots, production schema IDs, and executable no-input matrix now include the new
  command and request/result roots. The real stdin matrix case retains the structured malformed-request refusal;
  its added pipe invocation also updates the matrix's fixed platform counts without changing transport selection.
  The full merge gate also exposed missing lazy-module/factory inventory entries, command help, and CLI artifact
  reach. The explicit adapter is now included in those boundaries, and reach includes the launcher plus its CLI
  source/build closure rather than treating generated bundle bytes as tracked inputs.
- **7.R2.f:** Pure helper extraction meets the existing complexity limits while retaining admission and lineage rules.
  No suppression or test assertion was relaxed.

### Native process measurements

Raw probes, before/after traces, JSON summaries, reconstructed-control logs, and final runs are retained under
`~/dev/arc-evidence/storage-ref-hardening/approval-root-repair/implementation/`. Git Trace2 start events count actual
native child processes within each logical operation, including transport helpers; fixture/build work lies outside
the measurement. Each row uses a fresh Store/family binding. All comparisons ran on the same registered `m4-mini`
runner against baseline `deb116df5d`. Counts include the existing snapshot-retention token where its first acquisition
creates one. These measurements do not qualify hosted Windows behavior.

`storage-a4-process-deltas.json` contains 80 ordinary before/after rows. `storage-a4-process-final.json` contains those
80 ordinary rows plus 38 selected rows. The final source rerun matches every command count and Store-call sequence
from the earlier 118-row measurement. `storage-a4-approval-process-deltas.json` adds 12 initial/replay rows per version
after the native approval correction. Temporary probes and the detached baseline checkout are removed.

| Operation                                   | Native process change or retained count                           |
| ------------------------------------------- | ----------------------------------------------------------------- |
| Composed absence, keyed/aggregate           | +3: one each `cat-file`, `config`, `diff-tree`                    |
| Composed single root, keyed/aggregate       | +5: `cat-file` +1, `config` +2, `diff-tree` +2                    |
| Native owner lane/snapshot                  | +3: `cat-file` +1, `config` +2, `diff-tree` +1, `for-each-ref` −1 |
| Hosted producer result                      | 9 → 12 in either layout; same scoped authority pattern            |
| Immutable local/frontline producer result   | No added process or evidence/selector call                        |
| Raw evidence read / exact replay            | Unchanged: 1 / 8 processes in either layout                       |
| Raw physical performance                    | Unchanged: 11 default / 13 separate                               |
| Ordinary and selected sync                  | Unchanged: 32 default / 34 separate                               |
| Public performance                          | 18 → 23 default / 20 → 25 separate                                |
| Conditional capture                         | 22 → 27 default / 24 → 29 separate                                |
| Selected composed keyed / aggregate         | 11 / 9 processes                                                  |
| Selected native owner lane/snapshot         | 10 processes each                                                 |
| Selected keyed authority / immutable result | 9 / 6 processes                                                   |
| Selected public performance                 | 23 default / 25 separate                                          |
| Local/frontline approval initial            | 24 → 25 default / 26 → 27 separate                                |
| Local/frontline approval replay             | 9 → 14 in either layout                                           |
| Hosted approval initial                     | 27 → 25 default / 29 → 27 separate                                |
| Hosted approval replay                      | 12 → 14 in either layout                                          |

The reader increases stay within A4's explicit response-authority access changes. Keyed native authority uses one
outcome listing, evidence at that manifest, and one targeted selector read; it reuses those facts instead of adding
old raw/result lookups. Owner authority lists O/E/S once each. Composed reads retain evidence-first anchoring and
point outcome scope. Immutable local/frontline reads request O only. Approval publication also retains its existing
project-identity validation. No added version capture, duplicate outcome discovery, or unrelated-family enumeration
appears in these sequences. Admission uses captured write views; the extra selector observation/final-state check
adds no native process to raw advances or sync. A2's completed-quarter exception remains separate.

The amended boundary is revalidated by 7.R2.f's source/test/type/lint and process evidence. Final work-unit criteria
remain unmarked until 8.1, including their exact-head hosted qualification and fresh real-state import trial. The
5.12/5.13 personal-file hold is released; no hold is active during this implementation. The final trial requires a
fresh notes save and coordinated personal-write hold because registered checkouts' personal files are read live.

## Bound-mapping trial rehearsal

Task 5.12 ran the real built CLI at `045aaa8bae` under a confirmed universal personal-write hold. Notes were saved
from all 13 current registered personal directories, then the primary and its full Git common directory were copied
with every ref and the registered-worktree metadata. The ref inventories matched; the copied lock directory alone
was cleared. No review source was set aside and no custom ports replaced the command's bound review mapping.

The report is `task-5.12-20261103T155811Z/trial.json` under `~/dev/arc-evidence/storage-ref-hardening/`, with its
`assessment.json`, snapshot inventories, save results, stderr, and resource measurements. It proposes 327 refs and
refuses no record. Its five notices are the known derived-task-capture skips for `decompose-matrix`,
`errand-enablement`, `errand-lattice`, `work-organization-reform`, and `worktree-foundation`.
`importTaskCaptures` adds these to `skipped`; `importTrackedState` computes its blocking decision before appending
those rows. They are explicitly allowed by the Phase 5 exit criterion, with no repair required.

The bound mapping accounts for 3,214 sources: four mapped and 3,210 explicitly left behind under its legacy/liveness
rules, with no unmapped-source or in-flight notice. The six legacy broken-chain owners remain those accepted at 1.3;
five conditions match byte-for-byte, while `evidence-applicability` names the same missing Candidate with the newer
generic retry wording. `prepareImportCandidateSources` preserves historical bytes through as-found admission. The
506 differing-note rows are all disk-only; there is no content disagreement or snapshot-only row. `comparePersonalFile`
retains such disk content and blocks disagreements separately. Neither diagnostic group introduces a new state repair.

The trial completed in 10m04.88s with peak resident memory 2,305,324 KiB, below its 2.5 GiB in-process ceiling and
6 GiB address-space cap; Node's old-space ceiling was 1,536 MiB. The copy's refs are unchanged. No new corrective
parent, mapping fix, or state mutation is needed. Task 5.13 takes another fresh save and copy; the personal-write
hold remains in force through its reads. Final-head verification repeats the trial after the remaining implementation.

## Clean real-state trial

Task 5.13 repeated the save and copy afresh at `b3cacc9f85`, under the same confirmed personal-write hold. All 13
registered personal directories saved successfully. The actual built CLI ran without replacement ports or set-aside
review sources. Evidence is `task-5.13-20261103T161746Z/` under `~/dev/arc-evidence/storage-ref-hardening/`.

Its report proposes 327 refs, refuses no record, and returns exactly 5.12's five allowed derived-task-capture skips.
All 3,214 review sources are accounted for: four mapped and 3,210 left behind, with the same mapping apart from fresh
import UIDs. The six broken-chain conditions match 5.12 byte-for-byte, and all 506 differing-note rows are the same
disk-only files. The source-verified dispositions above therefore still apply; no corrective parent or state repair
is needed. The fresh trial meets the Phase 5 exit criterion.

The trial completed in 10m03.57s with peak resident memory 2,195,920 KiB, within the same memory limits as 5.12. Its
copied refs are unchanged. Both trial reads are finished and the personal-write hold is released. Final-head
verification still takes a fresh trial after 7.R2's implementation.

## Verification at the final head

SC 3, SC 8's Windows case, SC 9, and SC 12 take their evidence mid-change, and no gate at the final head takes it again:

- Task 3.10 runs § 1.4's search before Task 6.8 adds a `readRefTrees` read.
- Task 5.13's trial runs before Task 6.2's wrapper around the landing, Task 6.6's lock change, and the planned base
  merges.
- Task 6.10's dispatched portability pair runs before Task 7.3 rewrites the push exclusion's refusals that Task 6.9's
  recovery check reads, before Task 7.1 changes the write retry loop, and before the planned base merges. The
  portability pair runs only when dispatched with `run_portability_pair`, or on the weekly schedule.

Verification takes each again at the head it checks and records each result: § 1.4's search over `lib/store/ref/`; a
trial run as Task 5.13 runs it; and the Windows deadline-kill case and both layouts' publishing bursts, from its CI
dispatch at that head made with `-f run_portability_pair=true`, so one run carries them.

### Final-head trial and qualification

At implementation head `6429ca093c`, the forced local merge gate passes all 19 selected checks, including the 404
store suites enabled locally. Normal CI run `41727398335` is dispatched at that pushed head with the full Windows/macOS
store pair and no diagnostic filters; attempt 2 passes with 38 successful jobs after the one approved failed-job retry.
The optional Git-floor jobs and non-dispatch record/status jobs are skipped. The refreshed fault-site search has 351 matches.
Evidence is retained under `verification-6429ca093c/` in `~/dev/arc-evidence/storage-ref-hardening/`.

The final real-state trial, `task-8.1-20261103T215524Z/`, saves all 15 registered personal directories and runs the
actual built CLI in a full disposable copy. It finishes in 10m04.65s at 2,242,956 KiB peak resident memory, proposes
334 refs, refuses no record, and leaves the copied refs unchanged. The personal-write hold is released after completion.
The report is nevertheless blocked: beside the five accepted derived-task-capture skips, it reports a held capture
whose `WU_Target` still names `storage-cutover`, absent from the primary checkout after decomposition.

The capture is **Guard or migrate the hook's source-script delegations that survive the cutover**. Its hook-deletion
scope belongs to the planned `cutover-tracked-state-removal`, whose draft retains the lifecycle hook checks and their
per-check sort. The Owner-approved repair changes only that capture's target to this member, preserving every other
inbox byte. Its before-image and exact patch are retained in `state-repair-held-target-20261103T221341Z/`.

The first repaired-state retry, `task-8.1-20261103T221344Z/`, clears that notice but reports a saved-file disagreement
for `projection-write-back/ADVERSARIAL-PASSES.md`. That checkout's save finishes at 22:13:50Z, before its reported
22:13:55Z write completion; the copied notes and live file differ. Unlike a disk-only row, this disagreement produces
a blocking notice. The attempt completes normally in 8m45.69s with no refused record and unchanged copied refs. An
attempt to stop its process group was rejected by automatic approval review as potentially including unrelated Git
processes; no cancellation was performed. Its report and timing witness are retained. A fresh-save retry runs under
the same continuing personal-write hold.

All 3,232 review sources are accounted for: four mapped and 3,228 explicitly left behind, with no unmapped or in-flight
source. Four earlier mapped sources are now left behind because their Errand is no longer live; four newly mapped
sources belong to the live `authoritative-fetch-budget` and `repeated-fix-check-successor` Errands. The six legacy
broken-chain conditions match 5.13 exactly. All 509 differing-note rows are disk-only; the three new rows introduce no
disagreement. The first report's blocked disposition and bounded comparison are retained together.

The fresh-save trial, `task-8.1-20261103T222331Z/`, clears both blockers. All 15 registered personal directories save;
the copied PWB snapshot matches every saved workspace file, including `ADVERSARIAL-PASSES.md`. The actual CLI finishes
in 9m46.14s at 2,276,164 KiB peak resident memory, proposes 334 refs, refuses no record, and returns exactly 5.13's five
permitted derived-task-capture skips. The copied refs are unchanged. Review mapping and the six broken-chain rows match
the first final-head trial apart from generated owner UIDs, and the 509 disk-only rows match exactly. This is the clean
final-head import witness; the personal-write hold is released, and no further hold is planned.

The first push attempt refuses on the committed-head/private-index Markdown check while this file carries staged
verification cleanup. Preserving that cleanup, checking and pushing the matching committed bytes, then restoring the
exact staged cleanup clears the refusal without bypassing a check. Both push outcomes and the restoration witness are
retained with the qualification evidence.

Normal CI's first attempt reports one failure in Windows shard 5: the unchanged
`advisory-lock-scope.test.ts` reused-process-ID case at line 75. The reclaim predicate returns true while the bounded
acquisition branch returns false. The test discards the actual acquisition error, so expiry of its 100 ms budget is
only a hypothesis. The complete first attempt has only that failure. The Owner-approved unchanged-head retry is job
`126248116082`, attempt 2 of the same run; recurrence stops verification. The original job `126236542438` and
source-checked diagnosis are retained; a retry is not a claimed fix. After the personal hold ends, the unresolved case
is captured separately in `USER-INBOX` as **Diagnose the Windows advisory-lock reclaim-parity test failure**.
The retry passes all eight tests in that file. This establishes intermittency, with no production fix claimed. Job
copies in the later attempt retain earlier successful jobs' original start/end times; only the failed job and its
dependent aggregation execute anew. Windows job `126236542290` passes all seven transaction-deadline cases, including
both layouts at `prepared`; job `126236542338` passes all four unskipped twenty-writer burst cases, including publication
in both layouts. Their full logs and the successful attempt's exact-head qualification are retained together.

### Independent criteria review

Criteria Pass 1 of 2 covers snapshot `d0d083182e3af6d2ddd457bf3434801064064f1a` against
base `41963788ec39a67face3054ab4ad9351416a9b1c`. Twelve bounded contexts cover all 379 changed paths, followed
by a dedicated seam and a fresh whole-target aggregate. The author report and checkbox markings are withheld.
Source verification confirms three major and two minor causes; the two historical-placement reports describe one cause.
No concrete coverage gap remains.

- **F1, major — selector inventory:** `listDispositionRecords` selects the first producer selector before validating
  the entire captured inventory. `readSelectorSnapshot` checks payloads but leaves extra producer keys unchecked;
  native `uniqueSelector` refuses that same inventory. Criterion 19 remains unmet.
- **F2, major — transport resolution:** `remotePullFailure`, `publicationAttemptFailure`, and
  `migrationTransportRefusal` map `EffectiveTransportError` but rethrow completed Git failures from transport lookups.
  Criterion 7 remains unmet; the existing lookup-throwing rule requires typing at the consuming boundary.
- **F3, major — historical placement:** `historicalPlacement` iterates only returned `readRefTrees` entries, losing
  omitted historical trees. Its merge and withdrawal callers then offer metadata repair for object loss.
  Criteria 2 and 3 remain unmet.
- **F4, minor — test carrier:** the distinguishing 20,000-path CLI case runs only in E2E. Criterion 1 requires a
  reach-selected store-ref suite or push-gate unit case; the existing path-admission unit cases do not pin the cost.
- **F5, minor — import process budget:** both empty cleanup branches enter `dropKeptTips`, whose journal guard adds
  a `readSyncRefs` call. `publishImport` runs both stages, adding two Git listings outside the permitted exceptions.
  Criterion 21 remains unmet.

The complete set is approved for five existing-design corrections, required verification, atomic commits, push, and
normal CI, followed by one independent fix check. Criteria Pass 2 requires separate approval. At the reviewed target,
the combined report leaves criteria 1, 2, 3, 7, 19, and 21 unmet and criterion 15's readiness held: 14 met, 7 unresolved.
Task 8.1 stays open, with no Candidate attestation. The prior author report remains intact beside the combined report,
exact target, prompts, returned reports, source verification, and proposed dispositions under `verification-6429ca093c/`.
That reviewed implementation has passing CI and clean trial evidence; the read-only review claims no new runtime run.

The fresh trial and personal-write hold are deferred. One consolidated hold is planned after the fixes and review
loop settle, as late as verification allows before landing. No intermediate implementation head triggers a hold.
A second hold needs a specific later change that materially invalidates the trial's behavioral or input evidence.
The earlier trial remains historical evidence; final-head trial qualification stays outstanding until the consolidated
run. Task 8.1 remains open throughout this deferral, with no criterion superseded or Candidate attested.

#### Carried-code transport observation

`observeRefCarryCommitRace` resolves its target through the same completed-failure boundary as the other transport
consumers. A failed target lookup or missing effective URL returns the existing carried-code `unreachable/error`
outcome with URL repair text. Combined and ordered publication retain their state results; cancellation, signals,
and unrelated errors propagate. Receiver listing and ancestry errors keep their own policies. The resolver performs
the same lookups, with no additional Git discovery or cache invalidation.

The native witness uses a modern client with the current receiver for combined publication and a files-format
Git 2.43 receiver for ordered publication. Both real lookup failures are followed by exact configuration restoration
and successful retry. The permanent separate-layout test explicitly replays the complete captured legacy receiver
rejection at `GitExec`, with its receiver ref and object side effects, while lookup, restoration, and retry use real
Git.

The native fixture version, paired raw runs, captured legacy receipt, source bindings, and contract counterfactuals
are retained in `criteria-pass-1-fixes/round-1-carry-fix/` under the existing `verification-6429ca093c/` evidence root.
Ordinary CI exercises the labelled legacy-response contract. The retained native run records the older receiver's
Git version separately.

#### Second complete criteria review

Criteria Pass 2 of 2 covers head `59e7828a4b37d1e4553b2f8738060ba3140e86f4` against the same base. Twelve bounded
contexts, a dedicated seam, and a fresh aggregate cover all 389 changed paths. Source verification confirms two major
configuration-consumer gaps under criterion 7: `readComparisonSource` reads designation before normalization, and
`refFetchNeedsCompleteness` remains untyped at its consumers. The combined report has 18 met and 3 unresolved criteria:
7, the final-head trial at 12, and readiness at 15. The complete correction set and one later independent fix check
are approved. No additional complete pass is authorized. Evidence is under `verification-59e7828a4b/criteria-pass-2/`.

The first correction includes designation/configuration resolution in `readComparisonSource`'s existing transport
boundary. Acquisition retains typed publication/follow results; finalization remains unbound after completed remote
work when fresh configuration cannot authorize comparison updates. The lower lookup and its lock-sensitive cache
retain their throwing behavior. Native malformed-configuration cases restore exact bytes and retry across publication,
follow judgment, recorded resume, and switched cleanup in both layouts. Cancellation, signals, and unrelated errors
retain their identity. The first native run distinguishes ten previously uncaught failures; the overbroad-catch control
distinguishes all twelve propagation cases. Raw logs and source bindings are under `criteria-pass-2-fixes/` beside the
review evidence.

The second correction normalizes only `refFetchNeedsCompleteness` at its three consumers. `needsCompleteFetch`
turns its typed configuration error into `RefFetchRefusalError`, carrying the existing refusal and notices already
gathered; `remotePullFailure` retains them through the existing result mapping. `RefFetchIncompleteError` extends
that carrier without changing its constructor, failure wording, or incomplete-object policy. Candidate designation
uses its existing failed-check mapping; migration uses `migrationTransportRefusal`. Missing-object checks and
refetches stay outside the new catches. No public schema or Store method changes, new discovery processes, or cache
invalidation are introduced.

Native cases preserve a genuine rewrite notice and an earlier remote failure, local state, candidate registry and
roles, and migration state, then continue after exact configuration restoration. A separate store's unanswered
backing role returns a question in `resolveFirstDesignation`, and `applyCodeSetting` does not validate a read role;
candidate failure/retry coverage therefore uses explicit backing-push designation with a real backing pointer.
The valid baseline distinguishes all seven native configuration failures; earlier unreachable fixture attempts are
retained separately. The advisor's bounded notice-carrier recommendation and all raw counterfactuals remain with
the correction evidence. The consolidated trial and hold stay deferred.

## Fault-site inventory

§ 1.4's search, run at `e334006519` under `lib/store/ref/`, `import/` included. Each site that refuses, reports, or
holds on an object fault, grouped by the Phase 3 task that moves it. Paths are under `lib/store/ref/` unless noted.

- **Missing** means the helper's row: recoverable `state-unresolvable`, the restore-or-fetch remedy, and `historyRefs`
  by § 1.6. **fwd** and **hist** name the remedy an **Unparseable** or **No metadata** object takes: the forward repair
  at a current tip, the historical remedy at a history commit or saved state.
- **Tolerates** keeps its fallback; **unchanged** has no § 1.1 fault or sits outside the flip.
- Fixtures: `removeLooseObject` and `plantMissingRef` (`__tests__/helpers/store/ref-plant.ts`) remove an object or
  plant a ref at an absent one; `plantRef` builds a tree holding any blob.

### Classification calls the sweep settled

- **Archive faults behind `completeSyncPlacements`.** It finds a side's folder in `archivedFolders(...).folders` and
  drops the capture's diagnostics, so a faulty folder makes its callers refuse with the item's own metadata fault.
  When no folder supplies the placement and a diagnostic owned by that item carries a § 1.1 fault, the caller takes
  that diagnostic's row, as `firstOwnedArchiveDiagnostic` does for the history merge. With no owned fault, the caller
  keeps today's refusal. Goal 1 and § 1.9's converter rule settle it.
- **The withdrawal's composed metadata.** `retainSelectedFormats` and `preserveInverseConflicts`
  (`sync-withdraw-inverse.ts`) read the metadata entry of the inverse tree being built. That entry is the current
  tip's, the journal's `before` entry that `restoreOriginalEntry` put back, or a blob this withdrawal wrote. Its side
  follows the entry's object ID: the current tip's takes fwd, and `before`'s takes hist, by § 1.1. A blob the
  withdrawal wrote from validated inputs cannot fault, so that arm stays an internal error. `before`'s entry stands
  only where neither the current tip nor the journal's `after` holds a metadata entry. `preserveInverseConflicts`
  meets neither fault: a conflict exists only once `entryDocument` parsed the current metadata, and the inverse never
  replaces that entry while it exists. It throws the fault rather than a raw error, with no failing-first case.
- **An item's end read at a ref's tip.** `readItemEndCandidates` (`sync-lifecycle-log.ts`) walks the item's log from
  its tip inclusive, so an end commit can be the tip of the ref read. § 1.3 and § 1.9 give an end's faults the
  historical remedy, since a forward commit cannot change the end, and § 1.1 states that an end is read as a history
  commit even at the tip.
- **`retiredHistoryHome`'s side.** Its first scan returns the first revision whose metadata yields a slug, so its
  fallback refuses only when no revision does, the tip included. A forward metadata commit at the tip clears that
  refusal whichever revisions are faulty, so its **Unparseable** and **No metadata** refusal takes fwd, as
  `sync-history.ts` already does for a history ref's own tip. § 1.1 lists it among the sites its rule decides.
- **`historyRefs` needs the clone's current tips.** `unavailableRefHistory` and `missingChangeState` name the history
  ref of any work or cohort ref, and `unavailableHistory` names none. As the helper's **Missing** row, each takes the
  clone's current tips, so it names a history ref only for an item with no live ref (§ 1.6).
- **`missingChangeState` serves two causes.** It reports object faults and coordinate gaps alike. The gaps have no
  § 1.1 fault: no tip for the item, an unindexed batch, no end commit, no older registry tip, unordered or
  unrecorded ends. They keep today's refusal and `historyRefs`.
- **`captureHistoricalNamespaces` hides a missing blob.** In a record-free tree, a present metadata entry whose blob is
  missing is counted `recordFree` today, and its `unavailable` set is never filled when `complete` is set. § 1.2's read
  reports a missing blob as its own fact whether or not the tree holds records, which `retiredHistoryHome`'s fix needs:
  it lands in a new `missing` set, a record-free revision in `recordFree` as well. The history reads, the change window,
  and the pull label walk read metadata for every revision but need none where a revision holds no record, since their
  answer there is no record (`historicalState`, `versionAt`). So they refuse **Missing** only on a `missing` revision
  whose tree holds records, and keep treating a record-free one as record-free; `retiredHistoryHome`'s fallback refuses
  any `missing` revision, since its revision scan skipped a missing blob that may hold the slug.
- **Git failures not confirmed as missing objects.** `checkRefHistoryDestinations` (`write-history.ts`) reports any
  completed `merge-base --is-ancestor` failure through `corruptRef`'s missing arm. It takes **Missing** only when
  `isUnavailableGraphFailure` confirms an absent object, as `readHistoricalGraph` does; any other failure keeps
  today's condition, naming Git's message, and its remedy, built in place once `corruptRef` loses that arm.
  `retirementCommit` (`changes-lifecycle.ts`) calls `syncRefIsAncestor` with no catch. The ends and the lower bound
  were already read (`:178`), but an object missing from the lower bound's ancestry, which the walk never read,
  escapes `changes` as a raw `GitProcessError`; it classifies the same way. That ancestry check is no search
  term; the Purpose reaches it as a raw exception `changes` meets.
- **Record-free write groups.** `readWriteGroups` (`write-build.ts`) gives a record-free tree fresh metadata when its
  metadata is absent or unusable. § 1.9 counts the site as refusing, and a point read of the same tree refuses
  **Missing**, so a present entry whose blob is missing refuses **Missing** here too, rather than replacing facts a
  restore could recover. An absent entry or unparseable metadata still starts fresh metadata, as today; only the
  missing blob changes.
- **Archive output controls.** `copyArchiveEntries` (`write-archive.ts`) reads its own metadata through § 1.2 and
  classifies an object fault before `archiveOutputControlRefusal`. Owner, role, placement, and end-batch mismatches
  carry no § 1.1 fault and keep `record-malformed`. The batch staged that metadata blob itself, so no public input
  reaches the fault arm.
- **Invariants.** Each of these re-reads an object the same operation already validated, or reads one it built, so
  only a concurrent object loss reaches it, and it stays:
    - the raw throws in `readStoredMergeLabel` (`side-labels.ts`), `quarterCommitReference`'s planned-quarter check
      (`quarter-provenance.ts`), `changeCommitMessage` (`changes-graph.ts`), and `anchorRefWriteManifest`
      (`write-manifest.ts`);
    - `originEndBefore`'s ancestry check (`changes-lifecycle.ts`), whose operands come from the history it walked;
    - `readLifecycleLog`'s walk (`sync-lifecycle-evidence.ts`), which pull primes and `changes` walks first through
      `readHistoricalGraph`.

### Point reads, listings, and lookups

- `readBoundRecord` (`read.ts`) and `readUidRefRecord` with `unreadableUidTip` (`read-uid.ts`): a `missing` metadata
  answer resolves by the containing tree: present **Missing**, absent from a tree holding records **No metadata**,
  fwd. `holdsNoRecord` keeps `not-found`; `read-uid.ts`'s tip probe and pinned re-read tolerate.
- `refRecordAbsence` (`record-absence.ts`): a missing tree is **Missing**; its other arms already are.
- `checkRefTip` (`namespace-health.ts`), which history, changes, pull, and push run first: a missing tip or tree is
  **Missing**; its metadata entry **Missing**, **No metadata**, or **Unparseable**, hist when `saved` is set and fwd
  otherwise.
- `readArchivedRecord` (`read.ts`): unavailable quarter trees are **Missing**. `readArchivedFolder` (`read.ts`), the
  record-blob refusal in `read.ts`, `unavailableConflictEvidence` (`conflicts-read.ts`), and `claimPayloadRefusal`
  (`lookup-claims.ts`) already give **Missing** and call the helper. `readOpenConflicts`' structural refusals and its
  raw "Malformed conflict tree" error are unchanged.
- Listings — `listBoundRecords`, `decodeCapturedRef`, `capturedMetadata`, `decodeCapturedEntry`, and
  `decodeArchivedListing` (`read.ts`), and `archivedViewRecords` (`archive-view.ts`): metadata through § 1.2, each
  row an `unreadable` diagnostic with its own remedy, hist on a saved listing. `recordDiagnostic`
  (`content-read.ts`) gives a current listing's unavailable record blob the restore remedy (§ 1.6). `listView`
  (`write-views.ts`) joins its diagnostics' text and is unchanged.
- `readLineageOwners` (`lineage-resolution.ts`) and `readLiveRefOwners` (`live-owners.ts`): a missing tree is
  **Missing**; the metadata entry is looked up in the tree each holds: present **Missing**, absent **No metadata**;
  hist on the saved reads `changes-ends.ts` and `changes-scope.ts` make, fwd otherwise. `readLiveRefOwners`'
  record-free arm tolerates. `unreadableWriteTarget`, `resolveRefWrites`, and `unreadableNewClaim`
  (`write-resolution.ts`) pass its refusal on.
- `decodeLookupCapture` (`lookup-trees.ts`): a missing tip or tree is **Missing**; metadata rows, hist when
  `resolveRefName` reads a saved interval for `changes-scope.ts`. `revalidateLookupAcquisition`
  (`lookup-acquisition.ts`) drops a ref it cannot re-read, a tolerance.
- `projectOwnerFromEntries`, `projectOwnerFromObjects`, and `registryTreeUnavailable` (`project-identity.ts`): a
  missing identity blob, companion tree, or registry tree is **Missing**; no entry and an unparseable identity
  (`record-malformed`) are unchanged. Callers: `read.ts`, `readCapturedRefHistory` (`history.ts`),
  `compareBoundWindows` (`changes.ts`), `changeRestrictionProject` (`changes-scope.ts`), `anchorRefWriteManifest`
  (`write-manifest.ts`), `viewProjectOwner` (`write-views.ts`), `bindProjectMutations`, `projectIdFromTip`, and the
  migration and follow reads § 1.3 lists.
- `checkRefDesignationProject` (`designation-project.ts`): its incoming arm keeps the refusal's condition, led by the
  candidate registry's commit and its remote, so an unavailable tree is identifiable too, and gives a remedy for the
  remote's candidate registry, not the local registry that `projectIdFromTip` keys the read under and that has already
  parsed. For **Missing**, the **Missing** row's remedy: restore the object in this clone, or refetch it with
  `git fetch --refetch <target> refs/arc/project/registry`, with `--git-dir=<store>` where the layout is separate, as
  `refFetchRewriteRemedy` renders its commands, and the target the check's own fetch used (`fetchProjectCheck`'s
  `target`: a backing candidate's `remote.url` where it differs from the configured backing, otherwise what
  `refFetchTarget` resolves), since the clone already holds the candidate's commit and a plain retry fetches nothing,
  and a bare `--refetch` fetches only the remote's configured refspecs, which ARC never sets to name the registry; then
  retry the designation. For **Unparseable**, repair the registry on that remote. Either way, no role was set.
- `resolveArchivedReferences` (`archive-resolution.ts`): unavailable trees are **Missing**. In
  `archivedHistoryBatches`, a history tip that is not a commit (`readHistoryBatchIndex`) and `indexHistoryBatches`'
  default refusal are **Missing**, naming the history ref, since the ended item has no live ref.
  `missingArchivedHistory` is unchanged.

### Archived folders

- `decodeArchiveFolderControls` and `folderPlacement` (`archive-read.ts`): § 1.5's three placement conditions become
  `malformed` with `rule: "placement"`, keyed `${ref}:${root}`, carrying **Misplaced**. `decodeArchiveFolder`'s
  metadata takes § 1.2's read: **Missing**, **Unparseable**, or **No metadata**.
- Archived record keys (`archive-view.ts`, `read.ts`): the key becomes `${ref}:${root}${path}` and the remedy names it.
- **Final qualification (3.2.a).** `import-comparison.ts` matches completed diagnostics by `${home.ref}:${home.path}`,
  preserving the intentionally malformed legacy Candidate fixture. Canonicalized machine content, parsed fields and
  diagnostic kind retain the existing strict comparisons; no missing diagnostic or imported record is ignored.
- Converters of an archive capture's diagnostic, each taking the diagnostic's fault row while a diagnostic with no
  § 1.1 fault keeps its own text:
    - `captureArchivedFolders` and `selectEndedOwners` (`ended-owners.ts`): an empty quarter group and an unavailable
      quarter tree, which `archiveDiagnostic` builds through `corruptRef`'s missing arm, are **Missing**.
    - `readArchivedRecord` (`read.ts`) and `archivedViewRead` (`write-views.ts`, whose unavailable archive tree is
      **Missing**), hist by `state.saved`.
    - `resolveArchivedReferences` (`archive-resolution.ts`) and `appendArchivedLookupTrees` (`lookup-trees.ts`).
    - `collectArchivedParents` (`cohort-coordinates.ts`).
    - `endFolders` (`changes-ends.ts`), hist.
    - `checkArchiveTip` (`sync-tip.ts`), whose unavailable tree is **Missing**, fwd.
    - `incomingArchiveNotices` and `incomingArchiveHolds` (`sync-corrupt.ts`): an unavailable quarter is **Missing**;
      fwd.
    - `mergeArchiveTree` (`sync-archive.ts`): unavailable trees are **Missing**; the base decodes with `saved` set, so
      its diagnostics take hist; `local` and `incoming` take fwd.
    - `readSyncHistoryQuarters` (`sync-history.ts`), through `firstOwnedArchiveDiagnostic`: unavailable quarter trees
      are **Missing**; fwd.
- `completeSyncPlacements` (`sync-placement.ts`): an unreadable quarter tree and `historicalPlacement`'s walk are
  **Missing**. An owned faulty folder reaches its callers as above: `mergeGroupTree` (`sync-tree.ts`) holds the item
  ref with that row; `readSyncRecordPlacement` (`sync-label.ts`) and `conflictValue` (`sync-withdraw-entries.ts`)
  throw `RefSyncLabelError` with it.
- The sibling capture's rethrow (`siblingFolders`) moves with the withdrawal, 3.6.

### Writes and their views

- `readWriteGroups` (`write-build.ts`): a present tip whose tree is missing is **Missing**, naming the history ref for
  a target with no live ref. `capturedGroupMetadata` takes § 1.2's read: missing blob **Missing**, absent entry in a
  tree holding records **No metadata**, bad bytes **Unparseable**, fwd. The record-free fallback as settled above.
- `staleMutation` (`write-current.ts`): a missing prior blob is **Missing**, no longer `version-conflict`.
- `checkRecord` (`write-checks.ts`): already **Missing**; calls the helper. `prepareAnchor` (`write-anchors.ts`)
  tolerates a missing prior blob; `resolvesManifest` reads a saved manifest and is unchanged.
- `readArchiveQuarters` and `copyArchiveEntries` (`write-archive.ts`), `completedQuarterTrees`
  (`write-completed.ts`), and `readReopenQuarters` (`write-reopen.ts`): unavailable quarter trees are **Missing**;
  `copyArchiveEntries`' own metadata as settled above.
- `planRefRetirements` (`write-retirement.ts`): an unavailable registry tree is **Missing**.
- `checkRefHistoryDestinations` (`write-history.ts`): as settled above. `historyDestinationFailure` refuses a
  destination that is not an ancestor, no object fault, and is unchanged here (§ 7 is Phase 7's).
- Unchanged: `refBatchFailure` (`write.ts`) passes refusals on; `appendRefConflicts`, `finalWriteNamespaceRefusal`,
  and `renamedEntryRefusal` refuse path faults.
- Views, fwd for a check view and hist for a saved read, by `state.saved`: `viewRefMetadata` (`view-state.ts`) takes
  § 1.2's read for `lookupViewTrees`, `readView`, and `missingViewMetadata` (`write-views.ts`) and for
  `preparedCohortParents`, `unavailableCohort`, and `collectParent` (`cohort-coordinates.ts`). A missing tree or blob
  is **Missing**, an absent entry **No metadata**, and bad bytes **Unparseable**. Record-free trees keep `not-found`
  or their skip, and a record-free cohort with no metadata keeps today's handling. `readViewRecord` already gives
  **Missing** and calls the helper; `viewOpenConflicts` passes `read.ts`'s refusals on.

### History and changes

- The builders `unavailableRefHistory` (`history-graph.ts`), `unavailableHistory` (`history-snapshots.ts`), and
  `missingChangeState` (`changes-graph.ts`) become the **Missing** row, with `historyRefs` from current tips.
- `readRefHistoryDetails` (`history.ts`): its tip check is 3.1's `checkRefTip`, fwd; its graph walk is **Missing**.
  `readCapturedRefHistory`'s identity read is 3.1's.
- `indexHistoryBatches` (`history-batches.ts`): its default refusal is **Missing**.
- `captureHistoricalNamespaces` (`historical-namespace.ts`): as settled above. `readHistorySnapshots`,
  `historicalState`, and `stateMetadata` (`history-snapshots.ts`): unavailable trees, commits, and blobs are
  **Missing**; **Unparseable** and **No metadata** take hist.
- `retiredHistoryHome` (`retired-history.ts`): graph walks, trees, and blobs are **Missing**, naming the history ref;
  the tip's side as settled above. Its revision scan tolerates; an absent history ref and a history ref with no stored
  UID are unchanged.
- `compareBoundWindows` (`changes.ts`): identity through 3.1, hist; an unavailable saved manifest is unchanged.
- `captureChangeWindow` (`changes-graph.ts`): a non-commit endpoint, a refused walk, and missing trees and revisions are
  **Missing**. `checkWindowTips` passes `saved` to `checkRefTip`, so its rows take hist. `changeNamespaceFacts` refuses
  a **Missing** fact as **Missing** where the revision's tree holds records, keeps a record-free one record-free, and
  refuses a corrupt one with hist.
- `readEndSnapshots`, `lineageEndOwners`, and `captureRestoredOrigins` (`changes-ends.ts`): unavailable trees are
  **Missing**; metadata through § 1.2, hist.
- `changeWindowReferences` (`changes-records.ts`): metadata through § 1.2, hist; a `lineage/conflict-record` entry
  whose blob is missing is **Missing**, not a path that does not decode. `recordWindowStates` reaches
  `historicalState`.
- `resolveChangeRestrictions`, `restrictionOwners`, and `resolveComparedLineageReference` (`changes-scope.ts`): a
  manifest tip this clone lacks is **Missing**, as the unrestricted path already is; **Unparseable** and **No
  metadata** stay terminal with hist. The fallback to the interval's earlier side still fires only on `not-found`.
- `ownerChangeWindow`, `reopenedOriginWindow`, `originEndBefore`, `retirementCommit`, and `lifecycleBatchIndex`
  (`changes-lifecycle.ts`): commit reads and graph walks are **Missing**; the ancestry checks as settled above;
  coordinate gaps keep `missingChangeState`'s semantics, and `unrecordedRetirement` and `unorderedEnds` are
  unchanged.

### Pull merges, tip checks, fetch checks, and push exclusion

- `checkSyncRefTip` (`sync-tip.ts`) reaches 3.1's `checkRefTip`; its missing-family refusal is unchanged.
- `excludeBrokenPushRefs` (`push-exclusion.ts`): each tip check's row rides the `refused` publish failure; its batch
  graph walk is **Missing**.
- `groupSides`, `sideMetadata`, and `metadataAt` (`sync-tree.ts`): a missing tree or blob is **Missing**; **No
  metadata** and **Unparseable** take hist at the base and fwd on `local` and `incoming`. `emptySideMetadata` and the
  control-source read tolerate; a side holding no records whose metadata is absent has no § 1.1 row and keeps its
  refusal; `mergeGroupTree`'s missing-family refusal is unchanged.
- `indexRecords` (`sync-records.ts`): an undecodable record on the base side takes hist, where it takes fwd today.
  `readableSyncReference`: a record object that is not a blob is **Missing**, a wrong-typed one included,
  by § Non-Goals' rule that such an object takes the row of the read that meets it.
- `mergeRefSets` (`sync-merge.ts`): an unavailable graph is **Missing**; `mergeCapturedSyncRef`'s non-commit endpoint
  is **Missing**; `heldMerge` holds with its callee's row.
- `prepareSyncHistoryFastForward` (`sync-history.ts`): an unavailable tree is **Missing**; the history ref's own tip
  metadata takes fwd.
- `captureSyncRecordHistory` and `versionAt` (`sync-label.ts`): graph walks, revisions, and trees are **Missing**; a
  `missing` revision whose tree holds records is **Missing**, and a record-free one stays record-free; corrupt
  namespaces take hist, `RefSyncLabelError`'s default. `readSyncRecordLabel` is unchanged.
- `readCorruptLifecycleBatchRefs` and `hasCompetingHistory` (`sync-corrupt.ts`), `primeLifecycleHolds`
  (`sync-lifecycle-holds.ts`), and `readUnpublishedRefBatches` (`sync-batches.ts`): an unavailable graph is
  **Missing**.
- `incomingLineageHolds` (`sync-corrupt.ts`) and `observeTerminalEndedTwice` (`sync-terminal-ended-twice.ts`):
  `readLineageOwners`' rows, fwd. `observeTerminalEndedTwice` reads the registry tree after a `missing` lineage
  record: present **Missing**, absent skips the owner. `observeOwnerEnds`' unavailable tree is **Missing**.
- `unavailableFetchGraphNotice` (`fetch-graph.ts`), from `checkRefFetchUpdates` and `rejectedFetchNotice`'s ancestry
  check (`fetch-check.ts`), `checkSeenRefFetch` (`fetch-seen.ts`), and `compareFetchedRefTips` (`fetch-graph.ts`): a
  graph missing an object is **Missing**.
- Tolerate: `readLifecycleFolders`, `publishedTerminalLineage`, `observeSyncEndedConflicts`, `publishedLineageRefs`
  (`fetch-seen-ended.ts`), `refMovementFamilies` and `archiveMovementFamilies` (`push-families.ts`), and
  `observeRefCarryCommitRace`.

### The withdrawal

- `UnavailableWithdrawJournal` (`sync-withdraw-journal.ts`) carries the fault its throw names, and `heldWithdrawal`
  (`sync-withdraw-commit.ts`) takes the notice's condition and remedy from it; a throw that names no fault keeps
  today's text with the restore remedy. `commitWithdrawEnd` names the end's history ref for a **Missing** fault.
- Journal reads, each **Missing**: `describeWithdrawJournal`'s graph and `materializeWithdrawJournal`'s trees
  (`sync-withdraw-journal.ts`); `readWithdrawalAncestors`, `readWithdrawalTrees`, and `requireWithdrawalBlobs`, which
  also catches a non-blob (`sync-withdraw-prepare.ts`). `readLineageMessage` (`sync-withdraw-earlier-lineage.ts`)
  catches every completed failure today; it takes **Missing** only where `isUnavailableGraphFailure` confirms one.
- `inverseMetadata` (`sync-withdraw-inverse.ts`), § 9: reads its five inputs through § 1.2 instead of `JSON.parse`;
  **Unparseable** takes hist for `before`, `after`, and the ancestor, and fwd for the current and published sides.
- `withdrawRecordMetadata` (`sync-withdraw-records.ts`) takes the side of the snapshot it reads, passed by
  `entryDocument`, `sameWithdrawRecord`, and `selectedWithdrawFormat`; `entryDocument`'s missing record blob is
  **Missing**; `decodeEntryBytes` (`sync-withdraw-entries.ts`) already splits by side.
- `retainSelectedFormats` and `preserveInverseConflicts` (`sync-withdraw-inverse.ts`): sides as settled above;
  `preserveInverseConflicts`' raw errors for missing or unparseable metadata become the fault's throw, and its
  missing-family check stays an internal error. `repairWithdrawnLineage` (`sync-withdraw-lineage.ts`) reads metadata
  the same way.
- `registryMetadata`, `decodeConflict`, `preserveOwnerLineage`, and `preserveConflicts`
  (`sync-withdraw-preserved-lineage.ts`): an absent object is **Missing**, an undecodable one **Unparseable**, a
  non-empty registry tree with no metadata entry **No metadata**; a decoded record naming another origin keeps its
  condition with the restore remedy. A conflict coordinate `RecordReferenceSchema` rejects is unchanged.
- `entryLabel` (`sync-withdraw-entries.ts`): an unavailable graph is **Missing**.
- `laterSiblingEnds`, `siblingFolders`, `terminalOwner`, and `currentEndCandidates` (`sync-withdraw-sibling-ends.ts`):
  the walk's catch is **Missing**; `siblingFolders` rethrows its diagnostic's fault rather than discarding its remedy;
  `terminalOwner`'s registry tree is **Missing** and its lineage record **Missing** or **Unparseable**. An absent
  history coordinate and an end no candidate witnesses are unchanged.
- `readItemEndCandidates` (`sync-lifecycle-log.ts`), § 1.9: under `kind: "all"` it also returns the commits whose
  metadata blob is missing or undecodable, or whose non-empty tree has no metadata entry, each with its batch.
  `currentEndCandidates` holds on one that carries the folder's end batch, before the published-folder exemption,
  with hist; its re-read gives slugless metadata **Unparseable** with hist. `readItemEndBatches` discards the new
  sets.
- `conflictValue`'s placement fault is 3.2's. Tolerate: `withdrawRecordDefinition`, `inverseArchive`, the earlier
  lineage's `decodeConflict` (`sync-withdraw-lineage.ts`), `withdrawRefTargets` and `describeMovedEnds` through
  `readLifecycleFolders`. Unchanged: `prepareWithdrawEnd`'s empty journal and collision refusals,
  `preserveInverseConflicts`' family check, and `movedEnd`.

### A missing local object after a fetch

- Native execution observation: removing an archive metadata blob before the next transfer can fail thin-pack
  unpacking with `fatal: unresolved deltas left after unpacking` and `fatal: unpack-objects failed`, without naming an
  object ID. `parseFetchPorcelain` and `failedRemotePull` then report a failed, unreachable pull with no notices. The
  completed-failure detector specified below cannot confirm that blob loss through its commit-only walk. This is a
  counterexample to § 1.6's descriptive statement that a missing tree or blob never fails fetch; the detector's bounded
  algorithm remains unchanged. Evidence: `task-3.2.b-history-preflight-outcome.log` under
  `~/dev/arc-evidence/storage-ref-hardening/implementation/`, run `b010798b059a46309afcf4d4ba61b869`. Archive converter
  regressions remove the real object after a successful native fetch and assert transport success before checking the
  held ref, so this earlier failure cannot masquerade as converter coverage.
- One helper, run only after a fetch ends in a completed Git failure with no porcelain rows, checks every ref and
  every worktree's `HEAD` with `cat-file --batch-check`, skipping a `HEAD` listed as the null object ID, a worktree
  on an unborn branch. A missing tip object is a **Local transport fault** naming its ref, `refused` with the restore
  remedy.
- When every tip is present, it takes the object IDs the failure's stderr names, by `isUnavailableGraphFailure`'s match
  (`history-graph.ts`), factored to take that stderr, and confirms them with one local-only commit walk,
  `rev-list --missing=print --all` without `--objects`. A named commit the walk lists as `?<oid>`, such as an ancestor
  the forced-update check read, is a **Local transport fault** naming it, its condition keeping the fetch's stderr. The
  fetch prints "Could not read <oid>" for each missing commit it reads before the transfer, marking recent commits of
  every local ref complete, a code branch's included, and negotiating, and carries on. Two later steps fail it with no
  porcelain rows (Git 2.55.0, ARC's own fetch arguments). Under the `--show-forced-updates` ARC passes, the
  forced-update check exits 128 with "could not parse commit <oid>" when it reads a commit an updated ref's old history
  lacks. When the remote's new history builds on a commit the clone has lost, in any ref (a rewind of that ref, or
  another ref merging it), the connectivity check exits 1 with "fatal: revision walk setup failed" and "did not send all
  necessary objects", with or without that flag. A lost commit in a ref whose history the fetch neither updates from nor
  builds new history on, or under a fetch with nothing new, exits 0; whether one deeper in an updated ref's old history
  is read depends on the setup. A remote that lacks an object it must send exits 128 with "remote: fatal: unable to read
  <oid>"; the walk never lists that object, so the failure keeps `unreachable`, unless the clone also lacks a commit the
  fetch read, which the stderr then names too and which is reported first, whether or not a read of it is what failed
  this fetch; a lost commit in a code branch can be named too, as one was in a branch newer than the store's tracking
  refs (Git 2.55.0). A commit-graph covering the lost commit serves it to both the fetch and the walk, so the fetch
  succeeds and the helper never runs; a test that removes a commit keeps it out of any commit-graph.
- It runs where `pullRemote` (`pull.ts`) meets the state fetch's and the history fetch's failures, gated on the mark
  `parseFetchPorcelain` sets on a rowless outcome from a completed failure; in `runMigrationFetch`
  (`migrate-remote-fetch.ts`, under `fetchMigrationRemote`); and in `runProjectFetch` (`designation-project.ts`, under
  `fetchProjectCheck`). `failedRemotePull` also reports timeouts as `unreachable`, so it takes the failure code from
  its caller.

### The import's publication journal

- `unpublishedImportClaims` (`import/transient-publication.ts`) reads the blob tip of `IMPORT_PUBLICATION_REF`
  (`refs/arc/tmp/migrate/import-required`). A missing blob throws a raw error, and a blob that does not parse escapes
  through `JSON.parse` or the schema; both reach `retireOriginRefs`' caller as an untyped exception. Each returns the
  function's own `{condition, remedy}` pair, as the absent ref already does: missing restores the ref from the retained
  journal; unparseable names the unparseable journal with the same restore.
- Other `import/` reads: `firstPointerTime` tolerates; `committedAt` is § 11.2's; `readRequiredNote`
  (`import/personal-recent-notes.ts`) and `manifestFiles` (`import/personal-notes.ts`) read notes objects, not a state
  ref's, and report an unreadable note for that person, unchanged; `code-captures.ts` skips a code commit's unreadable
  objects, unchanged. `import/lineage.ts` and `import/source.ts` pass an `unreadable` listing on as the import's own
  refusal, unchanged.

### Readers and `corruptRef`

The readers are § 1.8's table. `unavailableSnapshot` (`snapshot-read.ts`) is also a **Missing** producer: its
listing refusal for unavailable tips or root trees names a history ref only for an item with no live ref (§ 1.6).
Once every site above calls the helper, `corruptRef` keeps only its unparseable arm, and no caller passes it a missing
tip or tree.

### Outside the flip, unchanged

Moves between remotes (§ Non-Goals) reach these, and no change in this unit alters what they receive:
`readRemoteCopyReport` (`migrate-cleanup-report.ts`) and `readCopyJournal` (`migrate-copy-journal.ts`) throw on an
unreadable record; `reaches` (`migrate-copy-journal.ts`) and `migrate-remote-copy.ts`'s copy reads tolerate; the
`cat-file` reads in `follow-candidates.ts` serve follow alone; `readMoveRecord` and `readForwardingRecord` are § 1.3's
unchanged readers, and `prepareRefCopy` is § 1.8's.

## Held out of the import review's first pass

Observations from the sweep that touch 1.2's scope. 1.2's first pass gets none of them; 1.3 matches its findings
against them, and a match folds into the task named here.

- `unpublishedImportClaims` throws untyped on a missing or unparseable publication journal, reached through
  `retireOriginRefs` — 3.8.
- `manifestFiles` throws on an unreadable note blob, which `personal.ts` turns into a blocking per-person notice,
  while § 11.2 covers only `committedAt`'s throw. It reads a notes object, not a state ref's, so it has no Phase 3
  row, and 1.3 dispositions it whether or not the review raises it.

### Approved import-review dispositions

The source audit at `1df5058cdd` returned one major finding. Its exact prompt, verbatim report, hashes, and the
source-verified disposition proposal are kept under `~/dev/arc-evidence/storage-ref-hardening/import-review/`.
The complete set was approved on 2026-10-31:

- **F1 — Matching project identity does not establish an import landing:** valid for a native-store caller, but
  unreachable by this repository's controlled, one-time import. The destination is empty, ordinary commands still
  use the in-repo backend, and the cutover quiesces writers. Recorded by forward amendment in
  `spec-storage-ref-hardening.md` § Non-Goals; no code fix here. The library finding is not refuted.
- **H1 — Publication journal errors:** the first held-out observation folds into 3.8, which already covers missing
  and unparseable journals. Record that fix's SHA under § Import review fixes so 5.10 checks it.
- **H2 — Unreadable saved-note blobs:** rejected as a code defect. `appendImportPersonal` catches `manifestFiles`'s
  throw, reports a per-person notice with a notes-restoration remedy, and `entry.ts` blocks before landing. Neither
  trial reported such a blob.
- **S1 — Working-memory headers:** a state fault for 5.11, with the header-only repair approved below.
- **M1 — Unmapped review sources:** a binding prerequisite, recorded below; no repair in this work unit.

Both returned trials are kept beside `import-trial/` under `~/dev/arc-evidence/storage-ref-hardening/`, with their
blocked status in `trial-summary.json`. Each proposes 328 refs and refuses no record. The full trial has 3,010 unmapped
review-source notices, S1, and five informational task-capture skips; the set-aside trial retains S1 and the five
skips. Both also report the same six broken Candidate chains as evidence and 431 disk-only personal rows, with no
disagreements. These informational results need no repair. Neither trial reached commit building or gathering refs;
the copy's refs are unchanged. The earlier memory-ceiling exit is retained as an incomplete attempt, not a returned
trial report.

## Import state faults

- **S1 — Wrapped titles in `andrew`'s `WORKING-MEMORY.md`** — cleared by the inherited parser fix; the physical
  repair is superseded at 5.11.

  _Original approved repair (retained):_ Both trials report a `personal/working-memory` parser fault at line 12: removal
  triggers require a one-line `**Title:**` header. The resolver-backed file is in the primary checkout's
  `.arc/user/andrew/`. Join its 12 wrapped title headers, preserving every word, removal trigger, and body. The proposed
  content parses into 16 entries and round-trips exactly through `writeEntryList`; the patch and original content hash
  are retained as `working-memory.proposed.patch` and `working-memory.proposal.json` beside the trial reports. Re-read
  current content before the repair and preserve concurrent changes. Record the performed repair here at 5.11.

  _Recheck:_ Base merge `3b162c779263ba604f49fd3c156222924b71c1f5` inherited the lossless wrapped-title parser,
  including `9bfb4db5a0fb205dba45392e97ef4d46247db8e8`. The current production registration accepts the original
  trial file as 16 entries and the live file as 17 entries, with byte-exact round trips and every removal trigger.
  The live hash is `13fa3dc7da64cef4e173112d6263e12264c483e8289d3510e7826a2e064d752a`; its concurrent added memory
  is preserved. `working-memory.task-5.11-validation.json` under `~/dev/arc-evidence/storage-ref-hardening/` records
  the exact inputs and checks. No personal-file or canonical-notes write was performed.
- **M1 — Review-family import mapping** — cleared by the shipped binding, with no state repair here. The original
  full trial reported 3,010 distinct `arc/review-gate/` sources without a mapping; setting aside sources other than
  repository identity removed those notices. Tasks 5.12 and 5.13 then ran with every source present and the bound
  mapping, with no unmapped-source or in-flight notice. Their full source accounting is recorded above.

## Import review fixes

Filled as each fix lands, from whichever phase lands it: each commit that fixes an import review finding, by SHA, with
the finding and the task it landed in, a fold into any task and a corrective parent's fix included. 5.10's fix check,
and the `6.R` and `7.R` checks 1.3 adds for a Phase 6 or Phase 7 fold, take these commits as their target; base merges
are not on it.

- **H1 — Publication journal errors:** fixed in `9e2344e35d909873e62d5a4ce26df05cb8b43ccf` (Task 3.8 —
  `tasks-storage-ref-hardening.md`). Missing and malformed publication requirements stop source retirement with the
  retained-journal restore route.

## A5/A6 working-review repairs

Owner, 2026-11-04 — one local working code-review pass covered 392 paths at `e0bf2bdc7f` through twelve chunks, a seam
and a fresh aggregate. Its approved set fixes two major findings and one minor. One independent fix check is authorized
after checks, atomic commits, push and normal CI. Task 8.1 stays open; the consolidated final trial and personal-write
hold remain deferred until the repair/review loop settles. Exact prompts, reports, approval and raw repair evidence are
retained under `~/dev/arc-evidence/storage-ref-hardening/working-code-review-e0bf2bdc7f/pass-1/`.

### F1: preserve transport refusals through cleanup

Fallible ordinary keeper cleanup and import publication cleanup replaced established transport refusals when native Git
configuration damage persisted. `fetchKeptRefPatterns` retains its acquisition basis only on established transport
refusal, excluding `RefFetchIncompleteError`; import publication recognizes the internal `MigrationTransportRefusal`
provenance carried by `migrationTransportRefusal`. Ordinary success, cancellation, signaled/untyped failures and
incomplete-fetch cleanup retain their existing policy. No public envelope changes.

The native baseline fails all four persistent pull/import cases. The shared fault fixture now supports explicit repair
after the public call returns. Pull cases preserve prior outcomes, rewrite notices and pending local state; import cases
preserve source-delete leases, the publication journal and the landed tips. Expanded import controls require original
cancellation/signaled/untyped errors and normal gathering cleanup. A narrow reconstruction that retains gathering refs
for every exception fails all six controls; both reconstructions restore automatically. Native repair/retry cases run in
both layouts. Earlier fixture-only restoration occurred before production cleanup and masked the defect; the disposable
Git probe established the persistence assumption, not a public reproduction.

### A5 / F2: restore role-compatible withdrawal coordinates

The superseded A1 text required `using refreshArchivedFolder to preserve the folder's independent end batch and
completed placement`. That unconditional coordinate promise did not settle primary-role changes or fallback. A5
preserves independent end identity and quarter, retains compatible coordinates, otherwise restores a uniquely captured
original coordinate for the same owner/end/quarter, and uses existing same-quarter allocation only when no original was
captured. Ambiguity, occupied original destinations and collapsed ends hold without partial publication and carry
forward repair/retry. Original criteria and Goals remain; the additive criterion supersedes only the role-dependent
coordinate obligation.

`planWithdrawCopyRoles` composes `planCompletedRoleReplacements` with final inverse groups and original folders from the
materialized journal. All owners plan together on cloned composed maps; reservation placeholders stay private.
`requireWithdrawalBlobs` already acquires the journal blobs, so witness decoding reuses retained acquisitions.
`refreshWithdrawCompletedCopies` supplies explicit planned placements and each folder's own end batch before the
captured, locked atomic publication. Ordinary write/history-sync policies remain unchanged. A lint-only extraction moves
refresh into `refreshPlannedCopies` within the complexity bound without changing its Git calls.

Ten native role/coordinate and recovery cases fail against the original implementation; the two unchanged-role controls
pass. After restoration all twelve pass. Cases cover both role directions/layouts, original sequences below occupied
peers, later-quarter fallback, occupied/ambiguous originals, refusal atomicity and successful forward repair. Final
post-lint scoped traces over `commitWithdrawEnd` show exactly 37 Git processes for both role directions and
unchanged-role controls in both layouts: `log` 8, `for-each-ref` 1, `cat-file` 7, `diff-tree` 4, `merge-base` 5,
`hash-object` 1, `mktree` 5, `commit-tree` 5 and `update-ref` 1. Unchanged-role before/after counts match exactly;
whole-pull ancestry ordering varies outside that scope. Temporary probes are removed and their source is retained with
raw logs and source hashes. No process reduction is claimed; A2's bound is unchanged.

Astra advised that the existing planner supplies the mechanism but does not settle the preservation/fallback policy; the
approved A5 does. Author spec review checks reader independence, binding completeness, coherent criteria and source
grounding across the inverse, planner, journal acquisition and publication. The bounded task audit finds existing
review-fix placement and acceptance cases executable. Proportionality is satisfied by composing the existing planner; no
new segment or Class change is needed. The Owner selected author checks followed by the approved post-CI fix check and
declined a separate medium-depth planning pass. Author checks do not supply independent review.

### A6 / F3: state the observed fetch residual

The superseded § 1.6 premise said `nor does a missing tree or blob under a tip`. The retained native archive-metadata
blob case fails thin-pack unpacking without naming an object ID, leaving the existing unreachable outcome and
connectivity remedy. The description now states that residual and the commit-only detector's actual bounds, matching
`localFetchObjectFailure` and the retained `implementation/task-3.2.b-history-preflight-outcome.log`. The algorithm and
outcome policy are unchanged. The low-depth factual amendment adds an evidence-backed criterion; no new algorithm test
is needed for this prose correction. Author review checks the affected premise, detector, existing notes and raw
witness; final reflow satisfies the Markdown line-width and underwrap rules.

## A7 failed-acquisition precedence

Owner, 2026-11-04 — the approved F1 follow-up extends the narrow post-fetch configuration repair to a rowless completed
fetch failure, including completeness refetch. Four native probes at `76c4005003` fail the public-result assertion in
pull/import, in both layouts, after exact configuration restoration and successful retry are already established.
`fetchKeptRefPatterns` returns the failed outcome without activating its exception-only retention; cleanup masks it.
`fetchRefPatterns` and `localFetchObjectFailure` expose the subsequent capture/diagnostic precedence obligations.

The superseded Non-Goals clause says `reduce Git processes per call, share results across calls, or drop a
readSyncRefs capture inside a sync call`, except withdrawal conflict placements. A7 retains the existing capture
attempt under its keeper lease and permits an unavailable observation only on completed failure after an established
completed acquisition failure. Unknown forwarding information carries ordinary transport advice without asserting
absence; unavailable observations grant no merge, history or source-retirement authority. Completed diagnostic failure
is inconclusive; confirmed local loss keeps priority and the original stderr. Cancellation, signal, spawn, untyped and
incomplete-fetch behavior remain as before. The exception adds no discovery or successful-path Git processes.

The bounded design composes the existing acquisition provenance, private refusal carriers and diagnostic fallback.
Astra's author-side advice is retained with the native probes; it supplies no independent review. The approved path
uses author checks, full verification, one atomic follow-up commit, push and normal CI, then the already authorized
independent fix check. A separate planning pass is declined. Task 8.1 stays open, and the final trial/hold stay deferred.

The original-head reconstruction fails eleven cases at public behavior assertions; the expanded repair passes them.
A deliberately broad fallback reconstruction fails twenty-five controls, including existing deadline behavior, new
non-completed diagnostic failures, retained forwarding advice and the successful-fetch capture guard. Each reconstruction
restores all source files automatically. Native executor counts match before/after in both layouts: 19 for a first
successful pull and 17 for a no-op pull, with identical command inventories. The temporary measurement suite is removed;
its source, before/after logs and source bindings remain with the review evidence.

## Code-review Pass 2 — advisory sync admission

Owner, 2026-11-04 — complete working code-review Pass 2 covers all 399 changed paths at `77f6ec0ed2` through twelve
fresh closure reviewers, a dedicated seam, and a fresh aggregate under all five `standard-review/v1` dimensions. It
returns one major finding: ordinary direct batches derive their writer verb from caller provenance, while four
selector/evidence predicates used that verb to grant advisory sync exemptions. A batch labelled `sync` could omit
complete evidence/outcome observations or introduce another root together with an enlarged selector. The primary
source trace and sibling search confirm one cause across all four predicates.

The approved local correction serves 7.R2.c and the existing § 9.1 contract; no design amendment is needed.
`WriteCheckInput.purpose` carries the internal sync-observation marker, supplied only by `observeSyncChecks`. Local
admission omits it, so every direct batch retains complete-basis and ordinary-root rules regardless of provenance.
The selector check, selected-advance check, new-local-root classification and selected-root succession gate consume
that marker consistently. No Store input, result, refusal or persisted record schema changes, and no I/O is added.

Four new native cases fail before the correction: missing observations and an enlarged new-root inventory, each in
both layouts. The eighteen existing cases pass in that same run. The regression checks refusal, unchanged records,
complete-observation continuation and selected reads; existing remote-intake controls retain warning-free sync. Raw
prompts, reports, target/coverage guards and primary source verification are retained under
`~/dev/arc-evidence/storage-ref-hardening/working-code-review-e0bf2bdc7f/pass-2/`; repair logs are retained beneath
its `repair/` directory.

The approved repair proceeds through focused verification, required gates, one atomic commit, push and normal CI.
One independent fix-check round is separately authorized after CI. Task 8.1 remains open; the consolidated final
trial and personal-write hold remain deferred until the repair/review loop settles.

## Code-review Pass 3 — failure evidence preservation

Owner, 2026-11-04 — the complete working pass covers 401 changed paths at `783e04c885` through twelve fresh chunks,
a dedicated seam and a fresh aggregate. It returns one major and one minor; source verification confirms both. The
approved repair round includes focused verification, required gates, atomic commits, push and normal CI, followed by
independent fix checks until convergence. The intended stop is after converged repairs, without a fourth complete
pass unless new evidence changes that assessment. Task 8.1 stays open; the consolidated final trial and personal-write
hold remain deferred. Exact prompts, reports, source verification and raw repair evidence are retained beneath
`~/dev/arc-evidence/storage-ref-hardening/working-code-review-e0bf2bdc7f/pass-3/`.

### F1: preserve follow judgment's typed refusal

The existing transport-refusal marker now keeps follow judgment's temporary acquisition when configuration damage
persists through its cleanup. Other failure classes keep their propagation and cleanup. Failure-result composition
is extracted after lint identified the judgment function's complexity limit; no public envelope or successful-path
Git process changes. The correction serves 4.3.b and § 4 without a design amendment.

Native cases in both source layouts leave code configuration damaged until the public refusal is observed, retain an
actual acquired forwarding tip and remote state, then repair the file and complete the follow. The original behavior
fails both cases at cleanup's raw Git error. Six cancellation, signal and untyped controls fail a reconstruction that
retains gathering for every error; the scoped correction preserves their original errors, clears the gathering and
permits retry. The eighteen existing transport cases remain controls.

### F2: retain notices across supplemental history failure

The lifecycle producer now reports already gathered lifecycle and shared-merge notices through the existing observer
before supplemental acquisition can fail. A returned failed acquisition emits its own notices before its existing
carrier drops that detail. The pull consumer retains these observations through its existing failure handler and
canonical deduplication. This necessarily changes the previously unchanged `sync-pull-lifecycle.ts`; it serves 4.3.a
and § 4's existing preservation rule without a new public field, discriminant, discovery or successful-path Git call.

The public native fixture combines a malformed archive folder, another item's pending end, an independent committed
personal update, and a supplemental fetch whose real receiver becomes unavailable. The baseline loses the established
lifecycle notice in both layouts. A second case introduces an unavailable tracking-history comparison after lifecycle
discovery; native keeper-basis classification creates a separate history repair notice. Omitting only failed-fetch
notice emission loses that notice while preserving the earlier archive notices. Both cases repair the exact faults,
finish the pending end, repair the malformed archive forward and reach a notice-free pull. Confirmed local object loss
retains its existing priority over the concurrent transport failure.

The first live-metadata fixture was replaced because that fault is read only after supplemental acquisition; it did
not establish the intended earlier notice. Its raw runs remain retained as diagnosis, not fail-first proof. The
corrected archive-hold and acquisition-notice reconstructions distinguish the two actual preservation paths.
