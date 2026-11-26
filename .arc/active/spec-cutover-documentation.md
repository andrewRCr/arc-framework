# Spec (`detailed` · `RFC`): Cutover Documentation

- **Origin:** [internal] — the `storage-cutover` cut (2026-11-03)

- **Purpose:** Make the documentation outside the workflows true of the store. Rewrite the strategies that still teach
  tracked state and Git notes, give the store model one shipped home, and record in the ADRs which decisions the
  cutover replaced and what decides in their place.

---

## Introduction / Context

ARC's planning and operational state moves out of tracked branch files and Git notes into same-repository `refs/arc/*`,
behind one storage contract (ADR-035). One change, **the cutover** in this document, makes that store the home of state
in this repository and rewrites its workflows, methods, skills, rules, templates, briefs, and help text to match. It
leaves most of the strategies and the ADRs, and a few other passages, as they are. From its landing that prose misleads.
A reader is told to commit metas, push notes, read a sibling's branch, and hand-render ROADMAP, and none of it works.

Three problems follow.

- **False doctrine.** Five strategies carry most of it: `strategy-work-organization.md`, `strategy-concurrent-work.md`,
  `strategy-session-operations.md`, `strategy-planning-module.md`, and `strategy-team-coordination.md`. Smaller passages
  sit elsewhere.
- **No home for the new model.** No shipped strategy says what is stored, where, how it is projected, how it syncs, or
  what a conflict does, so each of the five would have to.
- **Accepted ADRs that decide the old substrate,** and one new behavior that no ADR decides: an Errand is now a stored
  work item with a lifecycle.

**Prerequisite.** The cutover has landed on `main`. The change that lays the archive read-only is expected to land first
too, and § 2 says what happens if it has not. This design is planned before both. **The landed head** in this document
is `main` where this unit's build starts. A claim marked ‡ depends on what that head holds; § 9 says how each is checked
again.

## Goals

1. No shipped strategy teaches the old substrate, and no in-scope document contradicts the store.
2. One shipped strategy holds the store model, and the five point to it.
3. Every Accepted ADR the cutover contradicts says so, with the record that decides instead.
4. One ADR decides the Errand as a stored work item, in both protection modes.
5. The documentation holds both before and after the later removals of the retired machinery.

## Non-Goals

_Editable in place until activation, then frozen; changes after that append: `Amended YYYY-MM-DD — <delta> — <prompt>`_

- **`docs/`,** which stays stale until a single sweep before 1.0.
- **Workflows, methods, skills, rules, templates, briefs, and help text.** The cutover rewrites them, and they are not
  edited or searched here, with two exceptions: the links and phrases about the auto-merge lane that § 6 names, and one
  sentence of `template-contributing.md` (§ 1). A false passage found in one of these files is routed as discovered
  work. The brief's definition of a work unit stays as it is.
- **The errata convention and the relocatability rule,** which the archive workflow and the documentation-boundary rule
  already state for the store at the landed head.
- **Prose that a later removal makes false by removing its subject.** Two such items are named in § 5.
- **Footer policy, and any history policy** that would let append-only give way. The rules in force keep their text.
- **ADR-014, the clause of ADR-012 that hands contributors' task lists to it, and ADR-020's decisions.** None is amended
  here, beyond re-pointing a citation that § 7 moves.
- **Renaming the storage check-doc, or its family.**
- **Any change to behavior.** The one source edit is the text of a message (§ 1).

## Proposed Design

### 1. Scope is a rule, closed by a search

The scope is every tracked document outside `docs/` that the cutover makes false and that no Non-Goal excludes. It
includes:

- both copies of each shipped strategy, the affected project strategies, and their `STRATEGY-INDEX.md` entries;
- `TECHNICAL-OVERVIEW.md` § Cross-Machine User State and the root `README.md`, which describe Git notes;
- `arc join`'s message where state is kept off the branch (`buildPostJoinMessage`, `src/commands/join.ts`, when
  `stateOffBranch` holds) ‡, which says that `arc sync` synchronizes personal records through the store and that
  session-init reads a work unit's session context from its meta. It will also say where personal context lives, that
  it is stored rather than carried by commits, and that `arc sync` publishes and fetches it only when a state remote is
  designated, since with none the store's push publishes nothing (`lib/store/ref/push.ts`), so it stays true for a
  local-only store. The message where state is kept on the branch describes the Git notes that backend uses, and stays
  while that backend ships;
- the `storage.backing_repository` comment in both copies of `arc-config.yml`. It will say that the key names a separate
  repository to keep ARC state in, that empty names none, and that it is read when a destination is chosen
  (`composeRefStorePorts`, `lib/store/selection.ts`), so setting or clearing it moves nothing. It names no command and
  points to the strategy of § 2 for how a clone publishes or moves what it has;
- the `branch.protection` comment in both copies of `arc-config.yml`, which says backlog capture may commit to the base
  branch;
- the links to § Auto-Merge Lane and the workflow phrases that name the lane (§ 6), in both copies of each file, where
  each remains;
- the sentence of `template-contributing.md`, in both copies, that calls the contributor boundary "ownership of tracked
  state" ‡, which will say "ownership of project state", as the contributor brief does;
- the tests that pin any of this text, changed with it: `evidence-applicability-doctrine.test.ts`,
  `review-fix-release.test.ts`, `locus-methodology-contracts.test.ts`, `pr-lifecycle.test.ts`,
  `review-gate-workflows.test.ts`, `decompose-doctrine-contract.test.ts`, `unit/join.test.ts`, and
  `e2e/join-storage-guidance.e2e.test.ts`. An assertion moves with the text it guards and is not dropped.

**The inventory is taken late,** at the landed head ‡, and again at this unit's final head. It has two parts, and the
scope is complete when every remaining hit in either is explained:

- **A term search** over the scope for the old substrate's names: Git notes and user notes, notes refs, the `arc user`
  verbs, `SESSION-NOTES`, `STATUS.USER` and ROADMAP as files, `plan/` branches, artifacts described as committed or
  tracked, `git mv` archival, the auto-merge lane, and `archive.cadence: manual` as this repository's setting.
- **A concept read,** one full read of each in-scope document for what no term finds: which artifacts are tracked; when
  another person or checkout sees a change; what a branch shows or carries; how concurrent edits settle; where a work
  item's lifecycle and identity are recorded; where a claim on a checkout is recorded; who may edit what, what settles a
  change to it, and what checks it; and what an external tool is needed for. Two passages are known: the planning-module
  strategy sends teams that need a live, branch-independent backlog to an external tracker, and
  `strategy-task-list-formatting.md` calls `meta-*`, `draft-*`, and `spec-*` tracked artifacts.

_ADR disposition:_ `none`; planning structure, meeting none of the five criteria.

### 2. One shipped strategy holds the store model

`strategy-state-storage.md` is the model's only home, and the five strategies point to it. It and every rewritten
passage name verbs as the cutover's shipped text does. It covers:

- what is stored and what stays tracked, and why nothing reads state through Git;
- where the store lives: the refs, the backends, the `storage.*` keys, how a clone designates where it publishes, and
  that the default gives clean history and not privacy;
- the projection: `active/current/`, `active/in-flight/<slug>/`, the view settings, `layout.active`, who may edit what,
  and how to find projected files;
- saving, syncing, and what pushes when;
- conflicts: what the file shows, what refuses, and how a resolution settles it;
- what `git clean -x` and a plain worktree removal do to unsaved work.

Ceremony steps stay in the workflows, verb syntax in help text, and record formats in the schemas. It describes the
store alone and never the retired machinery. It describes the archive as laid read-only and opened one file at a time
with `arc edit` ‡. If the change that does so has not landed when this is built, the archive text comes to the Owner.

It ships: an `init-recipe.json` entry, an index row with a directive trigger, its entry in the self-hosting
`.arc/system/.internal/manifest.json`, which stays tracked because the cutover removes only the Candidate and transition
records from that folder ‡, and the Framework and installed-files totals in `strategy-package-project-sync.md`, each
computed from the recipe at the landing head. The Framework total is stated there twice, in the Framework section and
the summary table. `framework-sync.test.ts` checks the manifest and the installed-files total. Nothing checks the
Framework total, so it is computed by hand and reported.

_ADR disposition:_ `none`; where the model is documented is a tactical choice. ADR-035 remains the authority for the
model.

### 3. A new ADR decides the Errand as a stored work item

One short ADR, numbered at landing (042 is next free), Proposed and then Accepted in this unit's change, makes six
statements. Each replaces the clauses beside it.

| # | The new ADR decides                                                                                                                                                                                                                                                                                                                                                | Replaces                                                                                                                                                                                                                                                                                                      |
| - | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 | An Errand and a work unit are two types of one work-item family with one slug namespace, keyed by UID at project scope, with an owner and a lifecycle location.                                                                                                                                                                                                    | 021's "no `State`", and its 2026-06-19 per-person state ref; 027 item 3's record and placement; 033's retained identity ref, for Errands                                                                                                                                                                      |
| 2 | A full-protection Errand's lifecycle is recorded, and closing it archives its record, with the commit it landed as, when it landed one. That record, not a commit footer, is its completion record. Merge status is still read from the pull request.                                                                                                              | 021's "fully consumed when its commit lands", its tracking by Git history and not the planning layer (Decision, and 2026-05-27's footer), its derived state, and "never enters lifecycle or archival"; 027's opening line and item 2's derived lifecycle; 012 Part 2's commit footer as the completion record |
| 3 | An Errand's description, `errand-<slug>.md`, is an entry's home while the entry is held there. Starting an Errand from an inbox moves the entry there.                                                                                                                                                                                                             | 021's "no `errand-*` file" and the goal kept in the inbox until completion; 027 item 1's "no durable context machinery" and its pause and resume from the branch; 027 item 3's records-only ref (the record itself still does not project)                                                                    |
| 4 | A person's Errand queue is an ordered list of references, in either protection mode, and claims nothing.                                                                                                                                                                                                                                                           | 021's "no queue"                                                                                                                                                                                                                                                                                              |
| 5 | Promotion is one write that changes the item's type under one UID. That write settles the record; the branch and the checkout's marker follow it, and recovery reads the store's history.                                                                                                                                                                          | 033's commit before settlement, identity record kept until the inbox settles, and receipt as replay authority                                                                                                                                                                                                 |
| 6 | Under partial protection an Errand keeps no stored record, description, or lifecycle. It is a commit on the base branch, and that commit is its completion record. A start leaves its entry in the inbox. A close removes that entry at the version the start saw, leaves and reports one edited since, and reports one already gone; an abandon leaves the entry. | the clauses beside 1–3, as they apply to partial protection, and 021's "notes-synced" entry                                                                                                                                                                                                                   |

Statements 1–3 supersede their clauses for full protection and statement 6 for partial. Statement 4 holds in both.
Statement 5's clauses concern promotion, which refuses outside full protection (`promoteOrdinaryErrand`,
`lib/errand/promote.ts`) ‡. Statement 6 is what the partial-protection open and close do (`openOrdinaryErrand`,
`lib/errand/open.ts`; `settlePartialErrandAtRuntime`, `lib/errand/partial-settle-runtime.ts`; `removePartialOrigin`,
`lib/inbox/partial-origin.ts`; `removeInboxEntry`, `lib/inbox/removal.ts`) ‡.

The ADR also states four behaviors, each from the code that does it ‡:

- **Starting from an inbox.** A start in either mode drops the starter's own queue reference to the named entry, if
  there is one. Under full protection it also moves the entry into the description, in one batch; under partial
  protection it leaves the entry in place, and drops the reference in a write of its own once the Errand is open, so a
  refusal there reports an error with the Errand open and the drop not made (`prepareErrandAdoption`,
  `lib/inbox/errand-adoption.ts`; `completePartialQueueDrop`, `handlers/errand-entry-storage.ts`). The queue is set
  whole and listed in rank order (`setErrandQueue`, `listErrandQueue`, `lib/inbox/queue.ts`).
- **Closing and abandoning under full protection** both place the record at `completed` (`prepareMutation`,
  `lib/errand/store-runtime.ts`). A close proves either a merged change request or an unchanged base, and only the first
  records a landing commit (`retirementLinks`, same file; `readCloseLandingCommit`,
  `lib/errand/close-store-landing.ts`). An Errand awaiting merge takes the change-request proof, whether or not its
  branch equals the base; any other takes the unchanged-base proof when its branch equals the local and remote base
  (`resolveCloseChangeRequest`, `lib/errand/close-runtime.ts`). A missing landing commit therefore does not mark an
  abandonment. A close archives the description with the record (`copyArchiveEntries`, `lib/store/ref/write-archive.ts`)
  and leaves the inbox untouched (`runErrandCloseHandler`, `handlers/errand.ts`).
- **Abandoning under full protection returns entries.** Each entry in the description goes back to the list it came
  from, where that is the project inbox or the abandoner's own personal inbox, and otherwise to the abandoner's personal
  inbox. An entry that another open Errand holds stays with it, and an entry whose ID clashes at its destination refuses
  with the repair named (`prepareErrandReturn`, `lib/inbox/errand-return.ts`).
- **Retrying a promotion.** The role write carries the version the promotion read. Rerunning the same promotion finds
  the stored meta, reads the Errand's record and the cut commit from that meta's history, and completes the branch and
  checkout steps. It refuses where the target branch stands at another commit, where the created link is missing, or
  where the caller does not own the Errand (`createStorePromotionSteps`, `lib/errand/promote-store.ts`;
  `settlePromotedOccupancy`, `lib/errand/promote-runtime.ts`).

It leaves untouched the work classes, the record test (ADR-037), and the review path.

_ADR disposition:_ new ADR.

### 4. How each ADR records the change

Four rules apply to every ADR's Status, Decision, and amendments.

1. **A Decision clause that another Accepted ADR now decides otherwise** is superseded in part. The Status line names
   the clause and the superseding ADR, as ADR-012's does, and a dated amendment says what to read instead. The text
   stays as written.
2. **A passage that states a mechanism now false, where the decision stands,** takes a dated amendment. It applies to a
   passage that says what to do or where something is kept. A passage that only names a moved artifact, in a list, an
   example, or a table of conventions, is left alone.
3. **Context, alternatives, consequences as weighed at the time, and planning coordination** are left alone. So is a
   passage about an artifact already retired before the cutover, which the cutover did not make false.
4. **A passage whose truth waits on a later removal** is left for that removal (§ 5).

An amendment's words are written from the landed code. The table below is a floor and settles which record replaces
which clause. "New" is the ADR of § 3, with its statement's number.

| ADR      | What changes                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Rule | Superseded by                                     |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | ------------------------------------------------- |
| 002      | the 2026-06-29 amendment's "tracked state"                                                                                                                                                                                                                                                                                                                                                                                                                                             | 2    | —                                                 |
| 003      | Part 1's configuration sample, where `partial` lets backlog capture commit to the base branch                                                                                                                                                                                                                                                                                                                                                                                          | 2    | —                                                 |
| 007      | Parts 4–6: notes in workflows, their setup, their degradation; the 2026-04-15 amendment's session context "correctly per-developer via SESSION-NOTES and git notes"                                                                                                                                                                                                                                                                                                                    | 1    | ADR-035 items 3 and 8                             |
| 008      | § 7d: the standalone handoff commit                                                                                                                                                                                                                                                                                                                                                                                                                                                    | 1    | ADR-035 item 3                                    |
| 009      | Part 3's preservation of ADR-008's conditional handoff commit; `ROADMAP.md` as an installed file                                                                                                                                                                                                                                                                                                                                                                                       | 1    | ADR-035 item 3                                    |
| 009      | the reason larger teams need an external tracker, merge friction on shared files across branches                                                                                                                                                                                                                                                                                                                                                                                       | 2    | —                                                 |
| 012      | Part 1's tracked `active/` and freeform personal directory; Part 2's tracked backlog files; Part 4's promotion committed on the branch and transfer through the backlog; the 2026-04-09 amendment's rule that files outside the read contract are the developer's to organize and ARC does not manage them                                                                                                                                                                             | 1    | ADR-035 items 3, 6, and 7 as amended              |
| 012      | Part 2's commit footer as the canonical completion record                                                                                                                                                                                                                                                                                                                                                                                                                              | 1    | New 2 and 6                                       |
| 012      | Part 3's later amendments, which its Status line does not cover: 2026-04-22, the notes channel of 2026-04-25, 2026-05-06, and 2026-07-13. The worktree channel of 2026-04-25 stands                                                                                                                                                                                                                                                                                                    | 1    | ADR-035 items 3 and 8                             |
| 012      | Part 1's identity key naming the notes refs; the 2026-04-09 amendment's `SESSION-NOTES.md`                                                                                                                                                                                                                                                                                                                                                                                             | 2    | —                                                 |
| 016      | status-file updates and the handoff commit; worktree push paired with notes push; the amendment's `user.notes_push` and the cascade from sync to a notes push                                                                                                                                                                                                                                                                                                                          | 1    | ADR-035 items 3, 2 (as amended 2026-11-17), and 8 |
| 016      | handoff's list of interior actions; notes-ref races as a reason to push only at handoff                                                                                                                                                                                                                                                                                                                                                                                                | 2    | —                                                 |
| 017      | notes push and its pairing with the branch push, the paired sync cells included; `user.notes_push` as dual-scope                                                                                                                                                                                                                                                                                                                                                                       | 2    | —                                                 |
| 018      | its example that ceremony commits use raw `git commit`: lifecycle ceremonies write the store                                                                                                                                                                                                                                                                                                                                                                                           | 2    | —                                                 |
| 019      | Surface 1: one branch from planning, artifacts on the branch, activation as a branch rename, and the sweep into the integration PR; Surface 2: the `plan/` rotation; Surface 3: the isolation sentence, location as a directory, and the meta file as the durable identity; the capture surfaces' tracking and their writes only at lifecycle ceremonies; ROADMAP as a file                                                                                                            | 1    | ADR-035 items 3, 6, 7, and 10 as amended          |
| 019      | the four-surface capture list, which gains a work unit's inbound list and an Errand's description                                                                                                                                                                                                                                                                                                                                                                                      | 2    | —                                                 |
| 019      | the definition of a work unit, with a branch and a pull request: it need not have a branch before activation, and one decomposed or abandoned before then can end with neither                                                                                                                                                                                                                                                                                                         | 1    | ADR-035 items 3 and 10 as amended                 |
| 021      | the Decision that an Errand is "fully consumed when its commit lands", has no `State` or lifecycle, is tracked by Git history and not by the planning layer, `active/` included, and never enters lifecycle or archival; the 2026-05-27 footer tracking; the 2026-05-31 amendment's no queue, no `errand-*` file, goal kept in the inbox until completion as a notes-synced entry, no State field, and state derived from branch and pull request; the 2026-06-19 per-person state ref | 1    | New 1–4 and 6                                     |
| 021      | its 1:1 relaxation's statement that ADR-019's "one WU = one branch" is unchanged and every work unit has exactly one. That a branch need not belong to a work unit stands                                                                                                                                                                                                                                                                                                              | 1    | ADR-035 item 10 as amended                        |
| 021      | the concurrency oracle's in-flight detection from remote refs and pull requests, and the blind spot `init`'s branch push closed                                                                                                                                                                                                                                                                                                                                                        | 1    | ADR-035 items 6 and 10 as amended                 |
| 021      | the lighter merge gate, its lane half                                                                                                                                                                                                                                                                                                                                                                                                                                                  | 2    | — (ADR-035 § Consequences)                        |
| 022      | `SESSION-NOTES` as a member, its pointer fields set from Git state included, now a section of the meta; `ROADMAP`, `STATUS.PROJECT`, and `STATUS.USER`, never stored                                                                                                                                                                                                                                                                                                                   | 2    | —                                                 |
| 024      | nesting held only in the work unit's `Cohort` path: a subcohort's own `Parent` records it, and its open members' paths must agree; the directory mirroring the `Cohort` path, now a projection of the field; the backlog-scoped guard that enforces the consistency conditions. The conditions on membership stand                                                                                                                                                                     | 2    | —                                                 |
| 024      | the definition of the work unit as a leaf deliverable with one branch and one pull request, as ADR-019's                                                                                                                                                                                                                                                                                                                                                                               | 1    | ADR-035 items 3 and 10 as amended                 |
| 025, 035 | the Status note and item 9: append-only gives way once notes retire. It holds until `history.policy` can be configured                                                                                                                                                                                                                                                                                                                                                                 | 2    | —                                                 |
| 026      | items 2, 3, and 4: the invariant tying meta State, directory, and branch together, the file moves that hold them, and the parked pointer on `main`; item 2's totality and inverse round-trip stand                                                                                                                                                                                                                                                                                     | 1    | ADR-035 items 3 and 6                             |
| 026      | item 1's examples of mechanics (`git mv`, ROADMAP regeneration) and the 2026-06-16 amendment                                                                                                                                                                                                                                                                                                                                                                                           | 2    | —                                                 |
| 027      | the opening's "tracked by git history"; item 2's derived lifecycle under full protection; item 1's "no durable context machinery" and its pause and resume; item 3's placement under a person's ref, its tree of slugs, records-only ref, and user-state sync                                                                                                                                                                                                                          | 1    | New 1–3 and 6                                     |
| 027      | item 3's rejection of a same-slug collision                                                                                                                                                                                                                                                                                                                                                                                                                                            | 1    | ADR-035 item 7 as amended                         |
| 029      | "grooming lane releases before arming auto-merge", with the lane gone                                                                                                                                                                                                                                                                                                                                                                                                                  | 2    | —                                                 |
| 031      | "lanes that land unreviewed", with the lane gone                                                                                                                                                                                                                                                                                                                                                                                                                                       | 2    | —                                                 |
| 033      | the sources a checkout's role derives from                                                                                                                                                                                                                                                                                                                                                                                                                                             | 1    | ADR-035 item 6                                    |
| 033      | promotion's commit before settlement, the identity record kept until the inbox settles (2026-08-05), and the receipt as replay authority once the identity is removed; the identity ref in the retained set, for Errands. The receipt still binds the Errand's slug and claim                                                                                                                                                                                                          | 1    | New 1 and 5                                       |
| 033      | "the synced identity ref carries none"; the 2026-08-05 removal of the primary's marker at promotion, which becomes the work unit's marker; the identity ref in the retained set, for grooming and housekeeping claims, now records in the person's claims ref (`FAMILY_REGISTRY`, `lib/store/registry.ts`); the retained "complete-basis" transaction, now a version check on each record a write changes (`readBasis`, `prepareMutation`, `lib/errand/store-runtime.ts`)              | 2    | —                                                 |
| 035      | item 7's 2026-09-29 amendment: who writes a work unit's files and removes its routed entries, which follows placement, the checkout rule binding only an active unit's meta and task list (`workUnitRights`, `lib/store/projection/rights.ts`; `mayRemoveEntry`, `lib/inbox/admission.ts`); a slug clash's repair, which follows the holders' types (`clashRepair`, `lib/store/clash-repair.ts`); and "every record's identity", since the UID is the owner's and a person has none    | 2    | —                                                 |
| 035      | item 10's 2026-09-29 amendment, whose rule describes a spawned start: a unit that enters planning another way may be on a branch already (`occupyStoreGraduation`, `lib/work-unit/atomic-graduation.ts`; `promotionMeta`, `lib/errand/promote-store.ts`; `runStoreDeactivate`, `lib/work-unit/verbs/activate-deactivate-store.ts`)                                                                                                                                                     | 2    | —                                                 |

**The closing read completes the list,** as a task of the build on the landed head:

- Two independent readers take every ADR sentence by sentence, ADR-035 included, and judge each against the landed code
  and the shipped specifications, by § 1's concepts. No ADR is taken as given. Where the code and a shipped
  specification disagree on something § 3 does not state, it comes to the Owner before an ADR is written from either.
- Each sentence either reader marks gets a row or a stated reason to leave it, kept in this unit's notes.
- A third independent reader compares rows and reasons with the marks. The read is done when no mark is unaccounted for.

A marked sentence that no Accepted ADR and none of § 3's statements decides comes back to the Owner. § 3 gains no
statement on its own. A sentence found false later is recorded by the same rules.

_ADR disposition:_ amendments to the records the table names, and to any the closing read adds. ADR-035 is amended here
in items 7, 9, and 10; the cutover amends items 2 and 8 ‡.

### 5. It can land before or after the removals

The prose describes the store and never the retired machinery, so it holds whichever lands first. Two items become true
only when a later removal lands, and are left to it:

- the record against ADR-021's "recommended recipe" consequence, which waits until the merge-gate recipe, its install
  entries, and the planning classifier are gone;
- cutting `strategy-user-notes-concurrency.md`, with its index row, to the disciplines of the notes lock, which waits
  until notes sync is removed. The lock outlives that removal, so the file does too. Until then the file takes one note
  at its head in this change: notes writes, loads, and publication, a forced push among them, refuse once the store is
  imported (`refuseWriteIfStoreImported`, `lib/store/store-imported.ts`) ‡, and the lock's disciplines still hold.

Each item is held as an inbox capture that names the removal's unit, for the Owner to settle before that unit activates.
Until a removal's plan has taken its item, the records of § 8 do not name it as the item's owner. An item not taken when
this change lands comes back to the Owner.

_ADR disposition:_ `none`; temporary.

### 6. The doctrine rewrites

- **§ Per-Worktree Isolation** becomes "`active/current/` holds only this checkout's work item". The acceptance test is
  the one the integration test "isolates a spawned worktree's current files and exact %s in-flight view"
  (`materialization.test.ts`) holds ‡: spawn a worktree for a work unit from base, and `active/current/` holds exactly
  that work unit's files plus a copy of each cohort document it names, `active/in-flight/` exactly the views the setting
  selects, and `active/`'s top level nothing else. The section says what `layout.active: flat` (`readActiveLayout`,
  `lib/store/checkout-layout.ts`) changes: the checkout's own item and its cohort copies lie flat in `active/`
  (`projectOwnActive`, `lib/layout/projection.ts`) ‡, and the in-flight views and the cohorts' own documents keep their
  places.
- **§ Errand Work Class** gives the full-protection Errand a lifecycle location and a description, by § 3.
- **§ Auto-Merge Lane** retires with its subsections. The draft-state lock's model (`merge.lock: draft`,
  `arc merge lock`) moves to `strategy-integration.md`, beside § Terminal Integration Authority. The links to the
  heading divide ‡, each where its file still exists:
    - the two for the lock in `01_verify-and-configure.md` move to the integration strategy by a reference of their own,
      so they resolve whether or not the recipe has been removed;
    - the lane's are dropped with their sentences, in both copies: one in `01_verify-and-configure.md`, one in
      `merge-gate/README.md`, and two in `setup-merge-gate.md`; and the pointer in `TECHNICAL-OVERVIEW.md`. The recipe's
      own text is left for its removal.

  These workflow phrases name the lane without a link, and lose it in both copies ‡, each where it remains: "for both
  the manual- and auto-merge lanes" in `session-handoff.md` (`session-handoff.template.md` in the package)
  § Same-session finalize pass, and "or this one on the auto-merge lane" in `integrate-work-unit.md` where the
  same-session finalize pass runs. What each sentence requires stays.
- **Planning branches and archival** follow branchless planning and the store's archive operation.
- **ROADMAP** becomes a status view with no file. Readiness and ordering doctrine stays.
- **Append-only** keeps its rule and loses its notes rationale. The rule's text changes only with a history policy. At
  landing, the storage-coupling register's append-only row passes to the `history-policy` work unit as owner, after any
  passage of that unit's draft that still assigns the change elsewhere is corrected; if that unit has moved past its
  draft, the transfer comes to the Owner.
- **Locus and handover** use the cutover's words. A work unit's locus ends at exact teardown or at `arc locus release`.
  `strategy-team-coordination.md` § Person-to-Person Task Handoff is left as the cutover lands it ‡.
- **Post-landing hand-back** in `strategy-integration.md` drops its first step, the retirement of the personal session
  workspace, and keeps delivery closeout and then teardown.
- **Headings the cutover's text points at** survive ‡: `strategy-session-operations.md` § Session State Portability,
  § Remote access boundary, and § USER-INBOX.

_ADR disposition:_ covered by ADR-035, by ADR-031 (the lock), and by the new ADR of § 3.

### 7. The storage check-doc shrinks now and retires later

`strategy-storage-evolution.md` is one of four forward-compatibility check-docs. It guided work toward a model the
cutover makes real, so it is cut to what still points forward.

- **Out:** its sections "The Storage Model", "The Contract, Settled", and "Sequencing", whose homes are the strategy of
  § 2, ADR-035, and the cohort record; Principles 1–3, which the store enforces; and 15, which the cohort record holds.
- **Moved:** Principle 4, that external tools own no work-unit artifact, goes to `strategy-pm-composition-evolution.md`
  § Interim Boundaries and holds there until external PM composition settles the question.
- **Kept, reworded from what the cutover must undo to what the store is:** the Self-Check, and Principles 5–14.
- **Numbers stay,** since drafts cite them.
- **Every citation of what it removes or moves is re-pointed,** found by searching the repository and the store: a
  stored draft's by a save, an Accepted ADR's by § 4's rules, and a historical one by naming the file at a commit that
  holds the cited version. Known ones are the procedure, knowledge, and PM-composition check-docs; ADR-020 and ADR-025;
  the drafts `framework-core-from-package`, `delivery-observe-attest`, `projection-narrowed-views`,
  `arc-coordination-service`, `external-coord-probe`, and `external-pm-composition`; and `research-local-mode.md`.
- **The pending rename goes.** A file that will retire is not renamed: its own notice is removed, and so is the
  direction to rename it in the stored draft `knowledge-architecture`, whose separate question about the document family
  stays.

It retires once the three pieces of open work its kept principles still guide have each landed or been dropped: a
configurable history policy (`history-policy`), running ARC in a repository that cannot hold its files (`ghost-mode`),
and reading ARC's framework files from the installed package (`framework-core-from-package`). An Errand held in
`USER-INBOX` until then retires it. That Errand moves each surviving rule to ADR-035 or the strategy of § 2, or
drops it, re-points or removes every remaining citation, and takes the set from four to three where it is listed. A
historical link in an ADR is corrected to the file at a commit that holds the cited version, and the ADR's words stay.

_ADR disposition:_ `none`; temporary.

### 8. Records written at landing

Saved to the stored records after the cutover lands, and never to a planning branch's copy, which the import may not
take:

- **The cutover cohort's record.** This member's exposed-work line loses "the errata convention", and the errata
  convention's share names the cutover. The doctrine row's notes share names the notes-removal unit for
  `strategy-user-notes-concurrency.md`, and the ADR row's share names the tracked-state-removal unit for ADR-021's
  recipe consequence, each only where that unit's plan has taken it (§ 5) and only while that share is outstanding. The
  isolation and append-only shares are marked done, and the append-only row's move to `history-policy` is named as an
  exception to the rule that the owner cell stays with the cohort.
- **The storage cohort's register.** The errata and relocatability rows' fates name the cutover's workflow rewrite. The
  ADR row gains what § 4 adds. The doctrine row's criterion-3 clause is marked met by ADR-037. The append-only row and
  the ADR anchors say append-only holds until `history.policy` can be configured, and that row's owner becomes
  `history-policy`, which takes the rule's text in the rules and strategies beside its code. The ADR and doctrine rows'
  Errand clauses point at the new ADR for each protection mode. The isolation row closes, and the append-only row as § 6
  says. The doctrine and ADR rows name only what is outstanding. The entries the record's § Shared contracts lacks for
  the storage seam's contract changes, the two about an abandoned Errand among them, are held as an Errand in
  `USER-INBOX`.

_ADR disposition:_ `none`; planning records.

### 9. What is checked again at the landed head

A ‡ claim is checked against the landed head before the build relies on it, and a claim that no longer holds is
corrected by amendment before the text is written:

- § 1: the inventory itself, taken at that head, the sentence of `template-contributing.md`, and `arc join`'s two
  messages.
- § 2: the manifest's tracking, and whether the archive is laid read-only and opened with `arc edit`.
- § 3: the six statements' code and the four behaviors, and the `promoteOrdinaryErrand` refusal.
- § 4: the clause list's answers, whose words are written from the landed code, and the two amendments to ADR-035 that
  the cutover makes; the closing read covers the rest.
- § 5: the refusal the note at the head of the notes strategy states.
- § 6: the isolation test and the flat layout, that the cutover rewrites § Person-to-Person Task Handoff, the lane's
  links and phrases, the headings, and the lock's two links.

_ADR disposition:_ `none`; a temporary check.

## Alternatives & Rationale

- **An amendment to ADR-035 in place of a new ADR.** It would reach over another record's Decision. ADR-027's own
  rationale routes a change to a Decision to a new record.
- **Expanding `strategy-session-operations.md` § Session State Portability in place of § 2.** It saves an index row and
  a recipe entry, and the cutover's `QUICK-REFERENCE.md` points there. Most of the content is not about sessions, and
  the file already exceeds 1,100 lines.
- **Explaining the store in each of five strategies.** Five copies to keep in step.
- **A complete clause list in the plan, in place of the closing read.** It was tried, and each complete review found
  sentences it missed, against code that was still moving.
- **One reader at the landing, with nothing compared.** It leaves out the check on what was marked and not recorded,
  which is where the misses came from.
- **Landing after the removals.** Every sentence could be final, but the false doctrine stays live until then.
- **Retiring the check-doc now, or keeping it whole.** Now drops rules that open work still needs; whole leaves two
  homes for one model.
- **Retiring the check-doc when the state-storage cohort closes.** That close does not wait for all three pieces of open
  work § 7 names, so it can come while one still uses the file.

## Cross-cutting Considerations

### Testing

No behavior changes. The tests § 1 names move with the text they pin, and the ref-backed join's case also asserts that
publishing and fetching both depend on a designated state remote. `framework-sync.test.ts` is updated for the new
installed file. Both type checks run, as `join.ts` changes.

### Migration and rollout

It lands after the cutover on `main`, before the product-renames sweep. By the Owner's decision,
`projection-team-scale`, the change that lays the archive read-only, is the cutover's work-unit canary and lands before
this unit. If that order changes, it comes to the Owner, and § 2 says what happens to the archive text. Other branches
may add old-model prose between the inventory and the landing, so both parts of the inventory run again at this unit's
final head.

### User-facing impact

Projects that install ARC receive one new strategy and rewritten ones. Other text they receive changes too: `arc join`'s
message, two configuration comments, one sentence of `template-contributing.md`, and the links and phrases about the
auto-merge lane that § 6 names.

### Security and privacy

§ 2's strategy states that the default keeps state in the same repository, with clean history and no privacy, so a
public repository's readers are not misled about personal state.

## Success Criteria

1. Neither part of § 1's inventory, the search or the concept read, leaves an unexplained hit at the final head.
2. No shipped strategy tells a reader to commit state, read it through Git, push notes, or hand-render a status file.
3. Each of the five strategies points to `strategy-state-storage.md`, and a project installed from the recipe receives
   it.
4. The new ADR is Accepted with its six statements and four behaviors, and each was checked at the landed head.
5. Every sentence the closing read marks has a row or a stated reason, and every row carries its record.
6. No heading the cutover's shipped text points at is missing, and no in-scope text links to § Auto-Merge Lane. No
   workflow phrase § 6 names still names the lane, the lock's links resolve, `template-contributing.md` reads as § 1
   says, and the notes strategy opens with the note of § 5 while notes sync still ships.
7. `arc join`'s message and both configuration comments read as § 1 says, and the tests § 1 names pass on the new
   text.
8. Both register rows closed by this unit are closed, the isolation row and the append-only row by its transfer, and the
   doctrine and ADR rows name only what is outstanding.
9. The Framework total and the installed-files total match the recipe at the landing head.

## Open Questions

None. What the landed head changes is settled by § 9, and a marked sentence that nothing decides comes to the Owner by
§ 4.

## Amendments

[none]
