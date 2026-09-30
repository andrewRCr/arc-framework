# Review: Storage Contract

> _Advisory adversarial-pass evidence for `draft-storage-contract.md` — one entry per pass, appended by the session
> that ran it. Each entry names the draft version it reviewed; the refinements it prompted are the draft's changes from
> that version to the next. It creates no review-gate record: no lane progress, Candidate, or receipt._

---

## Pass 1 of 3 — 2026-09-30

- **Artifact:** `draft-storage-contract.md`, content `sha256:ad33a13f95b1d6f84c0a06ee12c17a32ceea79c3d7420110d89ce6fa7378542c`
  over `aa25675f4`, uncommitted. After the folds: `sha256:9157733b770e90cfb2971b4665d4cbc0f05b770de57e8ad2dd263618e79122a7`.
- **Fire-point:** `draft-design`'s readiness boundary, recommended at `Novel`.
- **Rubric:** `assess-draft-readiness` (the divergence test, the success signal, the inbound buffer),
  `assess-design-proportionality`, and `design-audit`, with the draft's claims checked against the source they cite.
- **Evaluator:** one fresh whole-target reviewer, no partition; orientation `AGENT-BRIEF.ARC` and
  `AGENT-BRIEF.PROJECT`; key files pointer-listed.
- **Result:** nine findings — six major, three minor — each verified against source. Not converged.
- **Stop reason:** continuing; the second pass is recommended and awaits its own approval.

### Findings and dispositions

The complete set was approved as one decision (2026-09-30); each is fixed in place unless marked.

1. **Major — the store-wide version bound too broadly.** C1's version covered every record, and the listing rule made
   a listing's whole version the mutation basis, while `scripts/integration/merge.ts` compares `lifecycleVersion`
   whole, so any capture or Errand write would have invalidated integration. _Fixed:_ C1's freshness requirement —
   callers bind the records they attested and their code head, never the store-wide version; the listing's mutation
   basis checks each written record; a conformance case proves an unrelated write changes no bound check. The in-repo
   version drops the personal-files digest.
2. **Major — in-repo reads omitted other branches' records.** Today's lifecycle index composes the tree with the
   in-flight oracle over local and remote refs (`composed-lifecycle-index.ts`, `remote-ref-reader.ts`), and the
   consumer map said other machines' work "becomes visible" only with the ref backend. _Fixed:_ § What this work unit
   lands reads them through today's oracle, read-only and live, outside the version; the consumer map's ordering
   line is corrected.
3. **Major — seam-built behaviors that need state off the checkout's branch had no timing.** Branchless planning over
   the in-repo backend would commit onto no branch; direct inbound routing, ID-keyed removal, and grooming from any
   checkout had the same gap. _Fixed_ by the Owner's choice among three options (flip timing, build after the flip,
   an edge on the ref backend): they take effect at the flip, keyed on one capability the contract reports, with
   today's behavior until then; the Purpose line, C4, C6, and C12 say so. Entry IDs are stamped by the in-repo inbox
   writer instead, so ID-keyed removal works before the flip.
4. **Major — in-repo `sync` was unspecified.** Notes push and the Errand push report `conflict` and `blocked`, which
   C1's set lacks (`commands/user/push-fetch.ts`, `lib/errand/merge.ts`). _Fixed:_ contract `sync` covers personal
   files and Errand refs and reports those two until the ref backend takes each family; `arc sync` keeps pairing the
   branch push with the notes push until the flip (`handlers/sync.ts`).
5. **Major — refusals with no class.** A batch spanning substrates, a read outside the version, and a commit hook
   refusing a verb's commit. _Fixed:_ C1's in-repo-only `unsupported` and `commit-refused`; the rollback restores a
   verb's own bytes but only unstages an `arc save` of hand edits. The index-lock citation now distinguishes park
   landing's hand-built lock (`park-planning-landing.ts`).
6. **Major — migrate would drop conflict records, routing receipts, and format versions.** None was a family or a
   kind. _Fixed:_ C2 stores them with the families, so migrate and the suite carry them.
7. **Minor — the in-repo backend does produce version conflicts** (`candidate-record-store.ts`). _Fixed:_ the suite
   and success-signal wording — version conflicts on every backend, stale bases where the store is shared across
   checkouts. The success signal's second amendment of the day.
8. **Minor — format skew already occurs** when one checkout's build reads another's records. _Fixed:_ C2's rationale;
   in-repo, an unparseable record is an unreadable entry with a diagnostic.
9. **Minor — where the state remote's designation lives is not held by its owner.**
   `draft-config-storage-architecture.md` holds only the `.local/` tier. _Carried forward:_ a `USER-INBOX` capture
   targeting `config-storage-architecture`.

### Withstood (spot-checked)

The reviewer found no finding in the inbound buffer (none present); the proportionality of the reference backend,
the concurrency library, the separate store layout, and the three tripwire deferrals; the cited code facts (delivery's
port vocabulary, the lifecycle port, the Errand snapshot outcomes, the classifier rule, the outcome counts, the call-site
counts); ADR-035's amendments; the analysis figures; and the four follow-on drafts. Spot-checked: the port vocabulary
(`lib/delivery/ports.ts:28-40`) and the Errand push outcomes.

### Next-pass decision

Pass 2 approved by the Owner (2026-09-30), after every approved response was complete; launched the same day,
which consumed the approval.

---

## Pass 2 of 3 — 2026-09-30

- **Artifact:** `draft-storage-contract.md`, content `sha256:9157733b770e90cfb2971b4665d4cbc0f05b770de57e8ad2dd263618e79122a7`,
  and `notes-storage-contract.md` as committed at `aa25675f4`
  (`sha256:b8c31a89f7f8cb72b5248693ca09aec7f9eace1184d1acfd98b68cd9b3e7a4b6`), both over `aa25675f4`. After the folds:
  the draft `sha256:b05df8a34150529cdf4b8e36508136f189456735f05770b8e97265363a1373bc`, the notes
  `sha256:a9f185d6db8a7de9a7b9b1624894d6b027f0b6e1ce3a0cc282015b76bcf63918`.
- **Fire-point, rubric, and evaluator:** as pass 1, with pass 1's findings and fixes supplied as prior findings and
  this file withheld from the reviewer.
- **Result:** ten findings — five major, five minor — each verified against source; one sub-claim was overstated, since
  `arc start` commits today (`handlers/start.ts`). Not converged.
- **Stop reason:** continuing; the third and last pass under the cap is approved.

### Findings and dispositions

The complete set was approved as one decision (2026-09-30), with the Owner's choice of fork on findings 4 and 5; each
is fixed in place unless marked.

1. **Major — the inventory reversed C1's freshness rule.** Seven consumer rows had callers compare a store version
   whole (`candidate-record-store.ts`, `submission-boundary-store.ts`, the checkpoint modules, `merge.ts`,
   `local-prepare-composition.ts`). _Fixed:_ each row binds its records' versions and code head; C1 adds that the
   in-repo lifecycle port keeps HEAD as its version, so call sites work until the seam's delivery member moves the
   checkpoint and `merge.ts` onto the binding before the flip.
2. **Major — no precedence when a record is both in the tree and on another branch.** The composed index withholds the
   writable path when the two disagree (`composed-lifecycle-index.ts`). _Fixed:_ reads and lists return today's
   selected copy; a write checks the tree copy and refuses `version-conflict` where they disagree; a record with no
   tree copy is read-only.
3. **Major — `checkout-not-writable` was misdefined.** Today's guard relocates any write from a non-base branch and
   refuses detached and base-less checkouts (`lib/git/write-context.ts`), while two inventory rows dropped it and the
   register's committability row says writes do not depend on the checkout. _Fixed:_ C1 defines the class as today's
   guard over the base-bound families, firing at the verb, with the protected base caught at `arc plan check` and
   `arc save`; it stays until the flip, and the two rows say so. _Carried forward:_ the register rows' timing joins
   the pending cohort-document capture in `USER-INBOX`.
4. **Major — no commit authority for verbs that commit themselves.** Under the default `manual` interlock the release
   wrapper refuses a commit, and review writers, drain decisions, and discharges have no gate in front of them.
5. **Major — no index isolation.** `captureGitIndexState` copies the whole index, so a verb's commit would sweep in
   staged code (`lib/git/exec.ts`).
   _Fixed, 4 and 5 together,_ by the Owner's choice between keeping verbs committing themselves — which needs an
   authority rule, a separate index, and rollback, all for a backend that retires — and having the save step commit.
   The save step commits: verbs stage as today, and `arc save` commits only the staged records and the prose its
   step names, behind today's commit interlock, through C1's new `persist`. This revises the readiness gap's "a write
   is durable and versioned when it returns", which pass 1's finding 5 and the two-commits cost also traced to; the
   register's workflow-steps row already names a persist step that commits as today. It simplifies `commit-refused`
   to leaving the writes staged, and removes the two-commits cost and the Open item on bundled ceremonies.
6. **Minor — capability conditionals against the strategy's Principle 6.** _Fixed:_ the branch lives in CLI verbs,
   never workflow prose, and `storage-cutover`'s deletion pass removes the arms for today's behavior.
7. **Minor — per-family retirement against one cutover.** _Fixed:_ one flip for every family (ADR-035); the in-repo
   sync extras retire at the flip.
8. **Minor — the evidence-neutral citation was wrong.** Other work units' state files are not neutral
   (`path-treatment.ts`); base-overlap analysis finds them disjoint (`lib/git/base-distance.ts`). _Fixed:_ C1's
   citation, noting that a shared state file such as a cohort document is overlap today.
9. **Minor — stale bases scoped by the wrong property.** _Fixed:_ stale bases on every backend that merges concurrent
   writes. The success signal's third amendment of the day, which also drops the second's self-commit clause.
10. **Minor — the notes export's local refusals were unmapped.** _Fixed:_ in-repo `sync` reports them as they are
    until the flip, `failed` maps by cause, and C1 cites the paired push's notes result for its two variants.

### Withstood (spot-checked)

The reviewer found no finding in the index-lock loci, delivery's failure vocabulary and lifecycle port shape, the
outcome counts, the call-site and importer counts, ADR-035's amendments, what the follow-on drafts hold, readiness
criteria 2 and 3, or the freshness rule itself against `strategy-integration.md`. Spot-checked: the index-lock loci
(`atomic-graduation.ts`, `discharge-dep-edges.ts`, `park-planning-landing.ts`) and the notes and Errand push outcomes.

### Next-pass decision

Pass 3 approved by the Owner (2026-09-30) in the disposition-report turn, the last under the cap; usable once every
approved response was complete, and launched the same day after they were, which consumed the approval.

---

## Pass 3 of 3 — 2026-09-30

- **Artifact:** the draft `sha256:b05df8a34150529cdf4b8e36508136f189456735f05770b8e97265363a1373bc` and the notes
  `sha256:a9f185d6db8a7de9a7b9b1624894d6b027f0b6e1ce3a0cc282015b76bcf63918`, uncommitted over `aa25675f4`. After the
  folds: the draft `sha256:e2ff2936e0bf4becf13999b1f2402d9e6daf5d65403164e0780e70bdf6b04915`, the notes
  `sha256:3f46595c7f772f4f12479f02e79f00a5edf3f6b3880bcf0306bbdec7b642e1fc`.
- **Fire-point, rubric, and evaluator:** as pass 2, with pass 2's findings and fixes as prior findings.
- **Result:** twelve findings — six major, six minor — each verified against source; the `git commit --only` finding
  was reproduced in a scratch repository. Not converged.
- **Stop reason:** `cap-exhausted`. The Owner then named one over-cap pass (below).

### Findings and dispositions

The complete set was approved as one decision (2026-09-30), with the Owner's choice of fork on finding 2; each is fixed
in place.

1. **Major — `checkout-not-writable` refused more than today's guard does.** The guard runs only at `arc plan check`,
   the drain's entry, and park (`lib/git/write-context.ts` callers), never at `arc stub`; under full protection
   grooming, the drain, and decomposition write base-bound files off base on purpose, and the pre-commit hook refuses
   commits on base, so pass 2's definition deadlocked them. _Fixed:_ the class fires where today's refusals fire, never
   per write, and `arc save` refuses on the protected base; grooming, drain, and decomposition branches stay valid
   until the flip.
2. **Major — `arc save`'s commit authority under `manual` was unsettled,** and so was the close verb's and the
   message's source (`lib/release/interlock-validation.ts`; `handlers/start.ts` commits raw). _Fixed_ by the Owner's
   choice between reusing the release wrapper's check and committing in every mode behind the ceremony's gate: `arc
   save` and the close verb commit only where the wrapper would, and elsewhere hand the commit back to raw `git`, whose
   harness prompt stays the approval; the step supplies the message until the flip.
3. **Major — no work unit built `arc save`.** _Fixed_ with finding 6.
4. **Major — `git commit --only` committed working-tree bytes, and the staged Markdown gate certified the real index.**
   ARC's executor strips `GIT_INDEX_FILE` for a `cwd` call (`lib/git/process-executor.ts`). _Fixed:_ `arc save` refuses
   while anything outside the state families is staged, then makes an ordinary commit of the index.
5. **Major — the verification commit carries the Candidate record with code** (`verify-work-unit.md`). _Fixed:_ a
   record that attests code rides the code commit it attests until the flip, as the task list does.
6. **Major — after the flip, the meta fields ceremonies edit by hand had no verb** (`session-handoff.md`; the only
   field verbs are `set-stage` and `repoint-design`). _Fixed with 3,_ a scope addition approved as such: `arc save` and
   one meta field verb land here as shared seam pieces, and the handoff inventory row says so.
7. **Minor — "stale base" was undefined.** _Fixed:_ C1 defines it as a merged write, never a failure, and a
   single-writer surface's older expected version as `version-conflict`.
8. **Minor — a record selected from another branch refused `version-conflict`, whose re-read remedy loops.**
   _Fixed:_ it refuses `checkout-not-writable`, as abandon and rename refuse without write authority today.
9. **Minor — `persist` named both C1's operation and the projection's write-back.** _Fixed:_ C1's operation is
   `flush`.
10. **Minor — the draft said the register row gives flip timing; it does not.** _Fixed:_ it cites the pending
    amendment.
11. **Minor — hand-written captures carry no `_Id:_` before the flip.** _Fixed:_ the in-repo inbox writer stamps
    missing IDs, and `inbox-remove` falls back to the title.
12. **Minor — the capability branch contradicts C1's first decision, and its list was incomplete;** plus two wording
    residues. _Fixed:_ a named interim exception retiring at cutover, the full list of branching verbs, and the
    wording. Also folded: in-repo the version advances at every commit on the branch, not only at `arc save`.

### Withstood (spot-checked)

The reviewer found no finding in pass 2's fixes for record precedence, the base-overlap citation, and the sync
outcomes; the lifecycle port's interim shape; the batch-staging citations; the other code claims and counts; what the
follow-on drafts hold; and readiness criterion 3. Spot-checked: the composed index's writable path and the four
notes-export refusal reasons.

### Next-pass decision

Pass 4, over the cap, approved by the Owner (2026-09-30) in the disposition-report turn: one whole-artifact read
with its attack focused on the in-repo write and save path and C1's in-repo classes; usable once every approved
response was complete, and launched the same day after they were, which consumed the approval.

---

## Pass 4 (over the cap) — 2026-09-30

- **Artifact:** the draft `sha256:e2ff2936e0bf4becf13999b1f2402d9e6daf5d65403164e0780e70bdf6b04915` and the notes
  `sha256:3f46595c7f772f4f12479f02e79f00a5edf3f6b3880bcf0306bbdec7b642e1fc`, uncommitted over `aa25675f4`. After the
  folds: the draft `sha256:1ae7fbffe1cb8c7473c20fe70d07db459b8bc571582a4d533eb5c4e8dce81acc`; the notes unchanged.
- **Fire-point, rubric, and evaluator:** as pass 3, with pass 3's findings and fixes as prior findings, and the
  Owner's scope: a whole-artifact read concentrating on the in-repo write and save path.
- **Result:** eight findings — four major, four minor — each verified against source. Three majors correct pass 3's
  approved folds (the refusal set, the gate's grounding, ID stamping), and one widens its scope addition. Not
  converged.
- **Stop reason:** continuing over the cap; the Owner named one further pass (below).

### Findings and dispositions

The complete set was approved as one decision (2026-09-30), with the Owner's choice of fork on finding 1; each is fixed
in place, and finding 6 is routed.

1. **Major — `arc save` refused the ROADMAP every lifecycle verb stages.** The executor's render side effect fires on
   every edge and stages ROADMAP (`lib/work-unit/side-effects/readiness-regen.ts`, `lifecycle-transitions.ts`), as
   `arc start` and park landing do, while C2 counts ROADMAP as no family. _Fixed:_ `arc save` commits ROADMAP while it
   is stored; by the Owner's choice between the flip and an earlier removal by the seam, ROADMAP stays stored and
   verb-staged until the flip, its rendering joins the verbs that branch on the flip capability, and the ordering
   bullet takes the timing.
2. **Major — the cited check was not the `workflowCommit` predicate, and the `manual` outcome was unsettled.**
   `checkInterlock` authorizes a commit under either releasing interlock and never reads the opt-in; the class predicate
   is `resolveReleaseRouting` (`lib/release/routing.ts`). _Fixed,_ correcting pass 3's grounding within the Owner's
   choice: `arc save` and the close verb take their route from the release routing, commit through `arc release
   commit`'s own path with its refusals and audit entry, and elsewhere succeed with a `handed-back` result that never
   calls `flush`; the protected base refuses before staging.
3. **Major — archive-phase meta sections and several hand-edited fields had no path to the store**
   (`integrate-work-unit.md` Steps 5–6, `promote-work-unit.md`, `session-handoff.md`, `init-work-unit.md`). _Fixed,_
   amending pass 3's scope addition forward: the one field verb also sets a named section's body, for every field and
   section a ceremony edits by hand, which the spec inventories.
4. **Major — stamping an `_Id:_` on every unstamped entry changed the source digest an Errand binds** (`unboundDigest`
   in `lib/user-sync/inbox-writer.ts`; `lib/errand/identity-record.ts`, `lib/errand/link.ts`). _Fixed,_ reverting pass
   3's stamping: until the flip the writer stays title- and digest-keyed, and `inbox-remove` keys by ID from the flip.
5. **Minor — the close verb's captures before the flip were unplaced.** _Fixed:_ captures start at the flip.
6. **Minor — nothing owned the remap of captures at the catch-up with base** (`draft-history-policy.md`). _Routed_ as
   a `USER-INBOX § Work Unit` capture for `history-policy`; C5 names the owner.
7. **Minor — the success signal did not cover `arc save` or the field verb.** _Fixed:_ the signal gains both, an
   amendment to Owner-decided text approved as such.
8. **Minor — two wording residues on the save path.** _Fixed:_ the version's "until `arc save`" and the `arc user
   save` overlap.

### Withstood (spot-checked)

The reviewer found no finding in `checkout-not-writable`'s firing points, the batch mechanics and their citations, the
commit ownership of `arc start` and `arc attest`, the ordinary commit of the index against the staged gate, the sync
claims, the failure vocabulary, and the named interim exception with its list. Spot-checked: the archive index is a
directory scan rather than a tracked file, so ROADMAP is the only derived view a verb stages.

### Next-pass decision

Pass 5, over the cap, approved by the Owner (2026-09-30) in the disposition-report turn: attacking only the passages
this pass's folds repaired; usable once every approved response was complete, and launched the same day after they
were, which consumed the approval.

## Pass 5 (over the cap) — 2026-09-30

- **Artifact:** the draft `sha256:1ae7fbffe1cb8c7473c20fe70d07db459b8bc571582a4d533eb5c4e8dce81acc` and the notes
  `sha256:3f46595c7f772f4f12479f02e79f00a5edf3f6b3880bcf0306bbdec7b642e1fc`, uncommitted over `aa25675f4`. After the
  reframe: the draft `sha256:d5381773252fdbdc960881fd483e1148250d15b445c19b69b1edb066adb0c200` and the notes
  `sha256:d1e323ef47515d80ee010bd873e9e9d484fb2f79b2716f85e3aa10ec3cfcfa14`.
- **Fire-point, rubric, and evaluator:** as pass 4, with pass 4's findings and fixes as prior findings, and the
  Owner's scope: a whole-artifact read, reporting only against the passages pass 4's folds repaired and their
  conflicts with the rest of the artifact or its sources.
- **Result:** twelve findings — five major, seven minor — each verified against source. Four majors land on pass 4's
  folds or the save path under them. Not converged: five, six, four, and five majors across passes 2 to 5, all in the
  in-repo write and save path.
- **Stop reason:** the Owner stepped back on the signal that was not weakening (2026-09-30). Two commitments together
  had turned one design decision into an unbounded list. "The flip changes no workflow text", with an in-repo
  implementation faithful to today, made the pre-flip `arc save` reproduce every commit ARC makes, and each pass found
  the next one; "the meta and task list reach the store only through verbs" made every hand edit need a verb. The
  Owner reframed both: the in-repo implementation mirrors today, commits included, and never commits; the process
  changes once, at the flip, whose workflow rewrite `storage-cutover` carries, checked against
  `strategy-procedure-evolution.md`; write-back covers the owner's meta and task list behind their family parsers; and
  the final shape wins over today's, with nothing breaking along the way (C13).
- **Supersedes:** the `arc save` folds of passes 2 to 4 — the pre-flip `arc save` with its refusal set, gate, and
  `handed-back` route; C1's `flush` and `commit-refused`; and pass 4's widened field verb, which retires. Pass 4's
  success-signal amendment is reverted with them. Pass 4's other folds stand: ROADMAP stored until the flip, no
  `_Id:_` stamping before it, captures from the flip, and the `history-policy` route.

### Findings and dispositions

The Owner approved the reframe as this pass's response (2026-09-30), and the draft and notes are rewritten to it. The
complete per-finding set below was then approved as one decision (2026-09-30), with the inventory keeping its workflow
rows under the partition whose verbs they call and noting that their text changes once, at the flip.

1. **Major — `arc save` refused tracked paths that are not state, which ceremony commits carry** — an ADR companion
   and research files (`create-spec.md`), and the export's commits (C10) — and after the flip no commit remained for
   them. _Dissolved:_ there is no pre-flip `arc save`; every ceremony keeps today's commit until the flip, and the
   flip's rewrite keeps a commit step for a ceremony that also changes tracked files, the ADR companion, research
   files, and the review copy among them.
2. **Major — the close verb's hand-back route left the capture trigger and the task loop's call order unsettled.**
   _Dissolved:_ the verb never makes the commit; it captures `HEAD` or named commits after the commit, and a missed
   capture is listed in orientation (C5).
3. **Major — the verbs that branch on the flip omitted most ROADMAP writers and the workflows' hand-render steps** —
   decomposition, retirement, rename, park landing, `arc base merge --regenerate-roadmap`, and seven workflows'
   refresh commits. _Fixed:_ the bullet states the rule, every verb whose behavior the flip changes, with every code
   path that writes, renders, or checks the stored ROADMAP — the inventory's rows under register row 18, now marked on
   each — and the flip's workflow rewrite drops the hand-render steps and their refresh commits. The five unrowed
   consumers join the inventory, which reaches 307 rows.
4. **Major — the import's ID stamping at the flip broke every open Errand's origin-entry digest** (`unboundDigest` in
   `lib/user-sync/inbox-writer.ts`; `lib/errand/identity-record.ts`, `lib/errand/link.ts`). _Fixed:_ the digest leaves
   the `_Id:_` line out, as it leaves out the execute-bound mark and the retain envelope — a seam change before the
   flip.
5. **Major — after the flip no verb persisted a task list written outside a close** (`generate-tasks.md`,
   `amend-design.md`). _Dissolved:_ write-back covers the owner's meta and task list, their parsers refusing a change
   to a field only a verb may set (C6), and `arc save` writes back at once.
6. **Minor — sentences said `arc save` always called `flush`, and the lists of commits ARC makes omitted some**
   (`arc rename`'s own, the verification commit). _Dissolved_ with `flush`; the in-repo implementation's bullet names
   every commit that stays.
7. **Minor — the inbox writer's wording implied a create path it lacks, against § Continuity.** _Fixed:_ it stamps no
   `_Id:_` before the flip.
8. **Minor — how the drain calls `inbox-remove` across the flip was unsettled** (`drain-inbox.md`). _Fixed:_ the
   drain's step passes the ID from the flip, in the flip's rewrite.
9. **Minor — `flush`'s failure set and its place on the wrapper route were unstated.** _Dissolved_ with `flush`.
10. **Minor — `arc save` took its route from settings alone, so off-workflow state commits skipped the harness
    prompt.** _Dissolved:_ before the flip there is no `arc save`, and after it a persist is a save, not a commit.
11. **Minor — the `history-policy` remap handoff had no record outside C5.** _Routed:_ the draft's routed list names
    it, beside pass 4's `USER-INBOX § Work Unit` capture.
12. **Minor — two wording contradictions beside repaired passages** (`checkout-not-writable`'s scope; what binds
    personal files). _Fixed:_ it fires where today's refusals fire, never as a check of the checkout on every write,
    and also on a write to a record whose selected copy lives on another branch; nothing binds personal files to the
    store-wide version.

### Withstood (spot-checked)

The reviewer found no finding in the gate's routing against `resolveReleaseRouting` and its protected-base refusal,
the field verb's grounding in the ceremonies' hand edits, the `checkout-not-writable` loci, `inbox-remove`'s title and
digest match, captures starting at the flip, the success signal, and § Continuity's pass counts. The gate, the field
verb, and the signal's `arc save` clause no longer exist after the reframe; the rest stand.

### Next-pass decision

Pass 6, over the cap, approved by the Owner (2026-09-30) in the disposition turn: attacking only the reframed passages,
as the test of whether the diagnosis holds; every approved response was already complete, so it was usable at once and
launched the same day, which consumed the approval.

## Pass 6 (over the cap) — 2026-09-30

- **Artifact:** the draft `sha256:d5381773252fdbdc960881fd483e1148250d15b445c19b69b1edb066adb0c200` and the notes
  `sha256:d1e323ef47515d80ee010bd873e9e9d484fb2f79b2716f85e3aa10ec3cfcfa14`, uncommitted over `aa25675f4`. After the
  folds: the draft `sha256:1679ad51939a0033e294535869678d17e3cd09b1b138584d1cf7e9c30a5fb701` and the notes
  `sha256:ce5980bd7788f4b6537b235b0e3e65d8d82168f2528437f81205fa0594a9d4c7`.
- **Fire-point, rubric, and evaluator:** as pass 5, with the reframe and pass 5's findings and dispositions as prior
  findings, and the Owner's scope: a whole-artifact read, reporting only against the reframed passages and their
  conflicts with the rest of the artifact, the inventory, or the source.
- **Result:** six findings — three major, three minor — each verified against source. None falls in the save path's
  class that ran through passes 2 to 5; the reviewer judged the reframe a sound, proportionate direction with gaps of
  detail.
- **Review of the reframe:** at the Owner's request the reframe also had a separate design review (2026-09-30). It
  judged the reframe right on this pass's evidence, since it replaced an enumeration with a rule and removed mechanism
  rather than adding it, and named what the folds below take up: the flip concentrates first use of `arc save`,
  write-back, the close verb, and the workflow rewrite, so `storage-cutover`'s rehearsal and quiesce must carry it; the
  import's footer derivation belongs in `storage-ref-backend`'s import scope; and the two new decisions need their edges
  written.
- **Stop reason:** Owner-directed stop after this pass's folds (2026-09-30): the diagnosis held, and the post-settle
  coherence re-read and create-spec take the draft from here.

### Findings and dispositions

The complete set was approved as one decision (2026-09-30), with the Owner's choices on findings 3 and 4.

1. **Major — the drain's `inbox-remove` carried no version it read**, so C4's drain check did not exist: the removal
   recomputes the digest under its lock (`commands/user/inbox-mutation.ts`), and the drain passes a title
   (`drain-inbox.md`). _Fixed:_ from the flip the drain reads each entry's `_Id:_` and version through a listing
   verb composed over the writer's entry inspection, and `inbox-remove` removes only that version, over the
   digest-qualified path Errand close uses today, leaving an entry edited since and reporting it; before the flip it
   removes by title, as today.
2. **Major — the inventory end states the flip's rewrite works from dropped the commit steps it keeps** (the
   create-spec, prepare, and integrate rows). _Fixed:_ those rows keep a commit step for the ADR companion and research
   moves, the review copy's add, and its delete in the candidate tail.
3. **Major — the missed-capture orientation had no defined commit set or anchor, and C1's attribution claim
   contradicted the `from-branch.ts` row.** _Fixed,_ with the Owner's choice of deriving captures at the import over
   keeping footer attribution for old commits: the import derives captures for commits before the flip from their
   `Context:` footers; orientation lists, while a work unit has open tasks, its non-merge commits since the last
   capture and none before the import's version; the row follows C1; routed to `storage-ref-backend` as a capture.
4. **Minor — "closes a set of tasks" conflicted with the capture-only readings.** _Fixed,_ with the Owner's choice of
   the verb owning completion over capture-only: the close verb marks the tasks and their computed parents complete
   after the commit; write-back refuses a hand tick; a task that made no commit closes with an empty capture set; and
   the task loop's tick step moves onto the verb at the flip.
5. **Minor — the ROADMAP enumeration was still incomplete against source.** _Fixed:_ seven rows join — five pure
   decomposition modules, the remedy's input-policy registration, and `handlers/housekeep.ts` — row 18 marks three
   more, and the inventory reaches 314 rows.
6. **Minor — five wording residues.** _Fixed:_ the in-repo implementation makes no commit on the checkout's branch,
   an Errand-ref write versioning as it lands; no verb gains a commit; the notes-backed surfaces persist as notes saves
   until the flip; C12's reason; and the commit-requiring next actions named in full.

From the review of the reframe, _routed_ as a `USER-INBOX § Work Unit` capture for `storage-cutover`: its
rehearsal drives a work unit end to end through the rewritten workflows, and quiesce reaches every live session.

### Withstood (spot-checked)

The reviewer found no finding in the fifth pass's inventory additions and counts, the list of commits that stay, the
digest's `_Id:_` exclusion, the batch claims, `checkout-not-writable`'s firing sites, the pending amendments'
routing, the capability flag's proportionality, or readiness criteria 2 and 3. Spot-checked after the folds: the
partitions sum to 314, and 209 rows read the store.

### Next-pass decision

None: the Owner stopped the loop after this pass (2026-09-30). The post-settle coherence re-read ran before capture,
and its edits are the draft's and the notes' changes from the versions above to the captured ones.
