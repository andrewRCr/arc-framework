# Draft: Cutover Documentation

- **Origin:** [internal] — the `storage-cutover` cut (2026-11-03); carved from that work unit's draft.
- **Purpose:** After the flip, the documentation outside its workflow rewrite still describes state in tracked files
  and Git notes. This unit rewrites it to the store model, gives that model one shipped home, and records in the ADRs
  what the cutover supersedes.
- **Planning posture:** `P1`, a Gate B Must. It is planned to implementation-ready before `cutover-flip` lands, builds
  after the landing, and lands before the product-renames sweep starts (`cohort-storage-cutover.md`). It is the
  intended second canary.

---

## Planning state

- **Readiness:** formalization-ready on the author's check. The planning reviews returned three parts to shaping, each
  agreed with the Owner: D3 and D4 from a clause comparison, D3's partial-protection rule (both 2026-11-24), and D4's
  closing read (2026-11-25).
- **Depth:** `medium`, and `high` for D3 and D4; `Class` stays `Heavy`, on scale. The weight is the prose surface.
- **Boundary:** stays one WU. One concern over one prose surface, forecast below every size mark.
- **Resolved** (Owner, 2026-11-24 and 2026-11-25): D1–D7, the check-doc's retirement, and every inbound entry's outcome.
- **Open:** none.
- **Next:** the draft's approval, then the spec.

## Problem / Motivation

`cutover-flip` rewrites the workflows, methods, skills, rules, templates, briefs, and help text onto the store, and
leaves the strategies, the ADRs, and other prose to this unit (`spec-cutover-flip.md` § Non-Goals). From its landing
that prose misleads: a reader is told to commit metas, push notes, read a sibling's branch, and hand-render ROADMAP,
none of which works. Three problems follow:

- **False doctrine.** Five strategies carry most of it (`strategy-work-organization.md`,
  `strategy-concurrent-work.md`, `strategy-session-operations.md`, `strategy-planning-module.md`,
  `strategy-team-coordination.md`), with smaller passages elsewhere.
- **No home for the new model.** No shipped strategy says what is stored, where, how it is projected, how it syncs, or
  what a conflict does. Each of the five would have to.
- **Accepted ADRs that decide the old substrate,** and one new behavior, an Errand as a stored work item, that only a
  shipped specification decides.

## Decisions

### D1. Scope is a rule, closed by a search

The scope is every tracked document outside `docs/` that the flip makes false and no sibling owns. The register's list
is a floor and not the boundary. Beside the strategies and ADRs it takes in:

- both copies of each shipped strategy, the affected project strategies, and their `STRATEGY-INDEX.md` entries;
- `TECHNICAL-OVERVIEW.md` § Cross-Machine User State and the root `README.md`, which still describe Git notes;
- `arc join`'s message (`buildPostJoinMessage`, `src/commands/join.ts`), which says where personal context lives, that
  it is stored rather than carried by commits, and that `arc sync` publishes and fetches it, and keeps the sentence
  true for a local-only store;
- the `storage.backing_repository` comment in both copies of `arc-config.yml`, which says what the key does once live:
  it names a separate repository to keep ARC state in, and empty names none; it is read when a destination is chosen
  (`composeRefStorePorts`, `lib/store/selection.ts`), so setting or clearing it moves nothing. It names no command. How
  a clone comes to publish, or moves what it has, is D2's strategy's, which the comment points to;
- the `branch.protection` comment in both copies of `arc-config.yml`, which still says backlog capture may commit to
  the base branch;
- the tests that pin any of this text, in the same change: `evidence-applicability-doctrine.test.ts`,
  `review-fix-release.test.ts`, `locus-methodology-contracts.test.ts`, `pr-lifecycle.test.ts`,
  `review-gate-workflows.test.ts`, `decompose-doctrine-contract.test.ts`, and `unit/join.test.ts`. An assertion moves
  with the text it guards, such as the draft lock's in `review-gate-workflows.test.ts`, and is not dropped.

The line-level inventory is taken late, from the flip's fixed head or from `main` after the landing. It has two parts,
and completion is both with every remaining hit explained:

- the term search of the flip's § 8.1, run over this scope;
- one full read of each in-scope document against the concepts the flip changes, which no term finds: which artifacts
  are tracked, when another person or checkout sees a change, what a branch shows or carries, how concurrent edits
  settle, where a work item's lifecycle and identity are recorded, where a grooming or housekeeping claim on a checkout
  is recorded, who may edit what, what settles a change to them and what checks them, and what an external tool is
  needed for. Two such passages are known: `strategy-planning-module.md` sends teams that need a live,
  branch-independent backlog to an external tracker, and `strategy-task-list-formatting.md` calls `meta-*`, `draft-*`,
  and `spec-*` tracked artifacts.

_ADR disposition:_ `none`; planning structure, meeting none of the five criteria.

### D2. One new shipped strategy holds the store model

`strategy-state-storage.md` is the model's one home, and the others point to it. It covers:

- what is stored and what stays tracked, and why nothing reads state through Git;
- where the store lives: the refs, the backends, the `storage.*` keys, how a clone designates where it publishes, and
  that the default gives clean history and not privacy;
- the projection: `active/current/`, `active/in-flight/<slug>/`, the view settings, `layout.active`, who may edit
  what, and how to find projected files;
- saving, syncing, and what pushes when;
- conflicts: what the file shows, what refuses, and how a resolution settles it;
- losing unsaved work: what `git clean -x` and a plain worktree removal do.

It leaves ceremony steps to the workflows, verb syntax to help text, and record formats to the schemas.

It ships: an `init-recipe.json` entry, the index entry with a directive trigger, its entry in the self-hosting
`.arc/system/.internal/manifest.json`, and the Framework and installed-files totals in
`strategy-package-project-sync.md`, each computed from the recipe at the landing head. `framework-sync.test.ts` checks
the manifest and the installed-files total; nothing checks the Framework total, which that strategy states in its
Framework section and its summary table. It is a `strategy-*` file because that is the live convention, and five
consumers meet `strategy-knowledge-evolution.md` Principle 6 (extract on fan-in). Its index row is one added to an
always-loaded file, and nothing offsets it: the user-notes row stays, narrowed to the notes lock (D5).

_ADR disposition:_ `none`; where the model is documented is a tactical choice, which `strategy-adr-methodology.md`
excludes. ADR-035 stays the authority for the model itself.

### D3. A new ADR decides the Errand as a stored work item

The ADRs that decide the Errand as a transient identity with no lifecycle are superseded in part, and only the storage
contract decides what replaces them: `spec-storage-contract.md` D5, D10, D11, and D13, with its A5 for promotion, as
`spec-seam-locus.md` § 7.5, § 8, and § 15.1 amend them. One short ADR records it, Proposed and then Accepted in this
unit's change, numbered at landing (042 is next free). It makes six statements. Each replaces the clauses named beside
it. D4's table assigns the new ADR no others, and D4's closing read may add to them:

| # | The new ADR decides                                                                                                                                                                                                                                                      | Replaces                                                                                                                                                                                                                                                                                                      |
| - | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 | An Errand and a work unit are two types of one work-item family with one slug namespace, keyed by UID at project scope, with an owner and a lifecycle location.                                                                                                          | 021's "no `State`", and its 2026-06-19 per-person state ref; 027 item 3's record and placement; 033's retained identity ref, for Errands                                                                                                                                                                      |
| 2 | A full-protection Errand's lifecycle is recorded, and closing it archives its record, with the commit it landed as, when it landed one. That record, not a commit footer, is its completion record. Merge status is still read from the pull request.                    | 021's "fully consumed when its commit lands", its tracking by Git history and not the planning layer (Decision, and 2026-05-27's footer), its derived state, and "never enters lifecycle or archival"; 027's opening line and item 2's derived lifecycle; 012 Part 2's commit footer as the completion record |
| 3 | An Errand's description, `errand-<slug>.md`, is an entry's home while the entry is held there. Starting an Errand from an inbox moves the entry there.                                                                                                                   | 021's "no `errand-*` file" and the goal kept in the inbox until completion; 027 item 1's "no durable context machinery" and its pause and resume from the branch; 027 item 3's records-only ref (the record itself still does not project)                                                                    |
| 4 | A person's Errand queue is an ordered list of references, in either protection mode, and claims nothing.                                                                                                                                                                 | 021's "no queue"                                                                                                                                                                                                                                                                                              |
| 5 | Promotion is one write that changes the item's type under one UID. That write settles the record; the branch and the checkout's marker follow it, and recovery reads the store's history.                                                                                | 033's commit before settlement, identity record kept until the inbox settles, and receipt as replay authority                                                                                                                                                                                                 |
| 6 | Under partial protection an Errand keeps no stored record, description, or lifecycle. It is a commit on the base branch, and that commit is its completion record. A start leaves its entry in the inbox, and its close removes that entry at the version the start saw. | the clauses beside 1–3, as they apply to partial protection, and 021's "notes-synced" entry                                                                                                                                                                                                                   |

The new ADR decides both modes, so no clause in the table stands. The clauses beside statements 1–3 are superseded by
those statements for full protection and by 6 for partial; statement 4 holds in both; and statement 5's clauses concern
promotion, which partial protection refuses (`promoteOrdinaryErrand`, `lib/errand/promote.ts`). The code:
`prepareErrandAdoption` (`lib/inbox/errand-adoption.ts`) for 3; `setErrandQueue` and `listErrandQueue`
(`lib/inbox/queue.ts`) for 4; `createStorePromotionSteps` (`lib/errand/promote-store.ts`) and
`settlePromotedOccupancy` (`lib/errand/promote-runtime.ts`) for 5; and `openOrdinaryErrand` (`lib/errand/open.ts`),
`settlePartialErrandAtRuntime` (`lib/errand/partial-settle-runtime.ts`), and `removePartialOrigin`
(`lib/inbox/partial-origin.ts`) for 6.

It lists no other behavior. What an abandon returns and how a promotion is retried are for this unit's spec to state,
from the landed code and the sources above. Closing and abandoning both place the record at `completed`
(`spec-seam-locus.md` § 8, § 8.1; `prepareMutation`, `lib/errand/store-runtime.ts`). Only a close that merged carries a
landing commit (`retirementLinks`, same file): an unchanged-base close, whose branch still equals the local and remote
base, captures none (`resolveCloseChangeRequest`, `lib/errand/close-runtime.ts`; `readCloseLandingCommit`,
`lib/errand/close-store-landing.ts`), so its absence does not mark an abandonment. `spec-storage-contract.md` D10 says
an abandoned Errand joins no archive; the later spec and the code agree with each other, so the ADR follows them.

It leaves untouched the work classes, the record test (ADR-037), and the review path.

_ADR disposition:_ new ADR.

### D4. How each ADR records the change

Four rules, applied to every ADR's Status, Decision, and amendments:

1. **A Decision clause another accepted ADR now decides otherwise** is superseded in part: the Status line names the
   clause and the superseding ADR, as ADR-012's does, and a dated amendment says what to read instead. The text stays
   as written.
2. **A passage that states a mechanism now false, where the decision stands,** takes a dated amendment. It applies to a
   passage that says what to do, or where something is kept. A passage that only names a moved artifact, in a list, an
   example, or a table of conventions, is left alone.
3. **Context, alternatives, consequences as weighed at the time, and planning coordination** are left alone.
4. **A passage whose truth waits on a sibling's landing** belongs to that sibling (D5).

The table is the known rows and not a complete list. It settles which record replaces which clause, from a comparison of
each record's clauses with D1's changed concepts at the flip's `bcb1f2d498` and from the draft's reviews since. A row
names the clause and where its answer is, and an amendment's words are written from the landed code. "New" is the ADR of
D3, with its statement's number.

**A closing read makes the list complete,** as a task of this unit's build, on `main` after the flip lands:

- Two independent readers take every ADR sentence by sentence, ADR-035 included, and judge each against the landed code
  and the shipped specs, by D1's concepts. No ADR is taken as given.
- Each sentence either reader marks gets a row or a stated reason to leave it, kept in this unit's notes.
- A third independent reader compares the rows and reasons with the marks. The read is done when no mark is unaccounted
  for.

A marked sentence that no accepted ADR and none of D3's statements decides comes back to the Owner; D3 gains no
statement on its own. What remains is a sentence no reader marks. One found later is recorded by the same rules.

| ADR      | What changes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Rule | Superseded by                                     |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | ------------------------------------------------- |
| 002      | the 2026-06-29 amendment's "tracked state"                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | 2    | —                                                 |
| 003      | Part 1's configuration sample, where `partial` lets backlog capture commit to the base branch                                                                                                                                                                                                                                                                                                                                                                                                                                            | 2    | —                                                 |
| 007      | Parts 4–6: notes in workflows, their setup, their degradation; the 2026-04-15 amendment's session context "correctly per-developer via SESSION-NOTES and git notes"                                                                                                                                                                                                                                                                                                                                                                      | 1    | ADR-035 items 3 and 8                             |
| 008      | § 7d: the standalone handoff commit                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | 1    | ADR-035 item 3                                    |
| 009      | Part 3's preservation of ADR-008's conditional handoff commit                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | 1    | ADR-035 item 3                                    |
| 009      | `ROADMAP.md` as an installed file                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | 1    | ADR-035 item 3                                    |
| 009      | the reason larger teams need an external tracker, merge friction on shared files across branches                                                                                                                                                                                                                                                                                                                                                                                                                                         | 2    | —                                                 |
| 012      | Part 1's tracked `active/` and freeform personal directory; Part 2's tracked backlog files; Part 4's promotion committed on the branch and transfer through the backlog; the 2026-04-09 amendment's rule that files outside the read contract are the developer's to organize and ARC does not manage them                                                                                                                                                                                                                               | 1    | ADR-035 items 3, 6, and 7 as amended              |
| 012      | Part 2's commit footer as the canonical completion record                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | 1    | New 2 and 6                                       |
| 012      | Part 3's later amendments, which its Status line does not cover: 2026-04-22, the notes channel of 2026-04-25, 2026-05-06, and 2026-07-13. The worktree channel of 2026-04-25 stands                                                                                                                                                                                                                                                                                                                                                      | 1    | ADR-035 items 3 and 8                             |
| 012      | Part 1's identity key naming the notes refs; the 2026-04-09 amendment's `SESSION-NOTES.md`                                                                                                                                                                                                                                                                                                                                                                                                                                               | 2    | —                                                 |
| 016      | status-file updates and the handoff commit; worktree push paired with notes push; the amendment's `user.notes_push` and the cascade from sync to a notes push                                                                                                                                                                                                                                                                                                                                                                            | 1    | ADR-035 items 3, 2 (as amended 2026-11-17), and 8 |
| 016      | handoff's list of interior actions; notes-ref races as a reason to push only at handoff                                                                                                                                                                                                                                                                                                                                                                                                                                                  | 2    | —                                                 |
| 017      | notes push and its pairing with the branch push, the paired sync cells included; `user.notes_push` as dual-scope                                                                                                                                                                                                                                                                                                                                                                                                                         | 2    | —                                                 |
| 018      | its example that ceremony commits use raw `git commit`: lifecycle ceremonies write the store                                                                                                                                                                                                                                                                                                                                                                                                                                             | 2    | —                                                 |
| 019      | Surface 1: one branch from planning, artifacts on the branch, activation as a branch rename, and the sweep into the integration PR; Surface 2: the `plan/` rotation; Surface 3: the isolation sentence, location as a directory, and the meta file as the durable identity; the capture surfaces' tracking and their writes only at lifecycle ceremonies; ROADMAP as a file                                                                                                                                                              | 1    | ADR-035 items 3, 6, 7, and 10 as amended          |
| 019      | the four-surface capture list, which gains a work unit's inbound list and an Errand's description                                                                                                                                                                                                                                                                                                                                                                                                                                        | 2    | —                                                 |
| 019      | the definition of a work unit, with a branch and a pull request: it need not have a branch before activation, and one decomposed or abandoned before then can end with neither                                                                                                                                                                                                                                                                                                                                                           | 1    | ADR-035 items 3 and 10 as amended                 |
| 021      | the Decision that an Errand is "fully consumed when its commit lands", has no `State` or lifecycle, is tracked by Git history and not by the planning layer, `active/` included, and never enters lifecycle or archival; the 2026-05-27 footer tracking; the 2026-05-31 amendment's no queue, no `errand-*` file, goal kept in the inbox until completion as a notes-synced entry, no State field, and state derived from branch and pull request; the 2026-06-19 per-person state ref                                                   | 1    | New 1–4 and 6                                     |
| 021      | its 1:1 relaxation's statement that ADR-019's "one WU = one branch" is unchanged and every work unit has exactly one. That a branch need not belong to a work unit stands                                                                                                                                                                                                                                                                                                                                                                | 1    | ADR-035 item 10 as amended                        |
| 021      | the concurrency oracle's in-flight detection from remote refs and pull requests, and the blind spot `init`'s branch push closed                                                                                                                                                                                                                                                                                                                                                                                                          | 1    | ADR-035 items 6 and 10 as amended                 |
| 021      | the lighter merge gate, its lane half                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | 2    | — (ADR-035 § Consequences)                        |
| 022      | `SESSION-NOTES` as a member, its pointer fields set from Git state included, now a section of the meta; `ROADMAP` / `STATUS.PROJECT` and `STATUS.USER`, never stored                                                                                                                                                                                                                                                                                                                                                                     | 2    | —                                                 |
| 024      | nesting held only in the work unit's `Cohort` path: a subcohort's own `Parent` records it, and its open members' paths must agree; the directory mirroring the `Cohort` path, now a projection of the field; the backlog-scoped guard that enforces the consistency conditions, the path match among them. The conditions on membership stand                                                                                                                                                                                            | 2    | —                                                 |
| 024      | the definition of the work unit as a leaf deliverable with one branch and one pull request, as ADR-019's                                                                                                                                                                                                                                                                                                                                                                                                                                 | 1    | ADR-035 items 3 and 10 as amended                 |
| 025, 035 | the Status note and item 9: append-only gives way once notes retire. It holds until `history.policy` can be configured                                                                                                                                                                                                                                                                                                                                                                                                                   | 2    | —                                                 |
| 035      | item 7's 2026-09-29 amendment: who writes a work unit's files and removes its routed entries, which follows its placement, the checkout rule binding only an active unit's meta and task list (`spec-storage-contract.md` D13; `workUnitRights`, `lib/store/projection/rights.ts`; `mayRemoveEntry`, `lib/inbox/admission.ts`); a slug clash's repair, which follows the holders' types (`clashRepair`, `lib/store/clash-repair.ts`); and "every record's identity", since the UID is the owner's and a person has none (that spec's D2) | 2    | —                                                 |
| 035      | item 10's 2026-09-29 amendment, whose rule describes a spawned start: a unit that enters planning another way may be on a branch already (`occupyStoreGraduation`, `lib/work-unit/atomic-graduation.ts`; `promotionMeta`, `lib/errand/promote-store.ts`; `runStoreDeactivate`, `lib/work-unit/verbs/activate-deactivate-store.ts`)                                                                                                                                                                                                       | 2    | —                                                 |
| 026      | items 2, 3, and 4: the invariant tying meta State, directory, and branch together, the file moves that hold them, and the parked pointer on `main`; item 2's totality and inverse round-trip stand                                                                                                                                                                                                                                                                                                                                       | 1    | ADR-035 items 3 and 6                             |
| 026      | item 1's examples of mechanics (`git mv`, ROADMAP regeneration) and the 2026-06-16 amendment                                                                                                                                                                                                                                                                                                                                                                                                                                             | 2    | —                                                 |
| 027      | the opening's "tracked by git history"; item 2's derived lifecycle under full protection; item 1's "no durable context machinery" and its pause and resume; item 3's placement under a person's ref, its tree of slugs, records-only ref, and user-state sync                                                                                                                                                                                                                                                                            | 1    | New 1–3 and 6                                     |
| 027      | item 3's rejection of a same-slug collision                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | 1    | ADR-035 item 7 as amended                         |
| 031, 029 | "lanes that land unreviewed", with the lane gone                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | 2    | —                                                 |
| 033      | the sources a checkout's role derives from                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | 1    | ADR-035 item 6                                    |
| 033      | promotion's commit before settlement, the identity record kept until the inbox settles (2026-08-05), and the receipt as replay authority once the identity is removed; the identity ref in the retained set, for Errands. The receipt still binds the Errand's slug and claim                                                                                                                                                                                                                                                            | 1    | New 1 and 5                                       |
| 033      | "the synced identity ref carries none"; the 2026-08-05 removal of the primary's marker at promotion, which becomes the work unit's marker; the identity ref in the retained set, for grooming and housekeeping claims, now records in the person's claims ref (the `claims` family of `FAMILY_REGISTRY`, `lib/store/registry.ts`); the retained "complete-basis" transaction, now a version check on each record a write changes (`readBasis` and `prepareMutation`, `lib/errand/store-runtime.ts`)                                      | 2    | —                                                 |

ADR-035 is amended by the flip in items 2 and 8 and here in items 7, 9, and 10. ADR-014, and the clause in ADR-012 that
hands contributors' task lists to it, go with `contributor-path`; ADR-020 is `scalable-core`'s; and footer format is
`ghost-mode`'s. Clauses that only name a moved artifact are left alone by rule 2: seven in ADR-001 and two in ADR-008.
Most of ADR-005, 008, and 009 described retired artifacts before the cutover, which did not make them false.

_ADR disposition:_ amendments to the records the table names, and to any the closing read adds.

### D5. It is meant to land first among the follow-ons

It is meant to be the second canary and to land before the removals, and that is the intent, not a condition:
`spec-cutover-flip.md` § 9.11 takes whichever work unit is ready first, so a removal ready earlier may be the canary.
Its prose holds both before and after them: it describes the store, never the retired machinery or its leftovers. Two
items are true only after a removal and move to the sibling that makes them true:

- **`cutover-tracked-state-removal`:** the record against ADR-021's "recommended recipe" consequence, once the recipe,
  its install entries, and the planning classifier are gone. Its amendment comes before it activates.
- **`cutover-notes-removal`:** cutting `strategy-user-notes-concurrency.md`, with its index entry, to the notes lock's
  disciplines. That unit keeps the lock (its D3), so retiring the strategy waits for whatever replaces the lock. Its
  amendment comes before its generate-tasks.

Each is captured for its sibling, and the Owner intends to approve both amendments at the siblings' gates (2026-11-24).
If one is declined, D5 comes back to the Owner. Neither sibling's removals rest on this unit's order (each spec's § 1:
"no landing order binds the two").

_ADR disposition:_ `none`; temporary.

### D6. The doctrine rewrites

- **§ Per-Worktree Isolation** becomes "`active/current/` holds only this checkout's work item". The acceptance test
  follows `spec-projection-worktrees.md` § 10.5, landed: `active/current/` holds exactly that work item's files plus a
  copy of each cohort document it names, `active/in-flight/` exactly the views the setting selects, and `active/`'s
  top level nothing else. The section says what `layout.active: flat` changes: the checkout's own item lies flat in
  `active/`, and nothing else moves.
- **§ Errand Work Class** gives the full-protection Errand a lifecycle location and a description, by D3.
- **§ Auto-Merge Lane** retires. The draft-state lock's model (`merge.lock: draft`, `arc merge lock`) moves to
  `strategy-integration.md`, beside § Terminal Integration Authority. The heading's links are of two kinds, and the
  recipe that holds most of them ships until `cutover-tracked-state-removal` lands:
    - the lock's, two in `01_verify-and-configure.md`, move to the integration strategy;
    - the lane's are dropped with their sentences rather than kept alive by a retired-section note, which
      adopter-facing text cannot carry: one in `01_verify-and-configure.md`, one in `merge-gate/README.md`, two in
      `setup-merge-gate.md`, in both copies, and the pointer in `TECHNICAL-OVERVIEW.md`. The recipe's own text is left
      for its removal.
- **Planning branches and archival** follow branchless planning and the store's archive operation.
- **ROADMAP** becomes a status view with no file; readiness and ordering doctrine stays.
- **Append-only** keeps its rule and loses its notes rationale, as the flip's `DEV-RULES.ARC.md` does, until
  `history-policy` lands. The rule's text in the rules and strategies changes with that unit. Its draft still gives the
  change to the cutover, in four passages that a `USER-INBOX` capture for it names. When this unit lands, the register's
  append-only row passes to `history-policy` as its owner, with any of those passages that still stand corrected first,
  so that its draft holds the item and the row closes by the register's rule for a follow-on. If that unit has moved
  past its draft by then, the transfer comes to the Owner.
- **Locus and handover** follow the flip's words. `strategy-work-organization.md`'s locus, which ends only at "exact
  teardown", ends there or at `arc locus release`; `strategy-team-coordination.md` § Person-to-Person Task Handoff,
  which hand-edits `Owner`, uses `arc handover`.
- **Post-landing hand-back** (`strategy-integration.md`) drops its first step, which retires a workspace that no
  longer exists, leaving delivery closeout and then teardown.
- **Headings the flip's text points at survive or their pointers move:** `strategy-session-operations.md` § Session
  State Portability, § Remote access boundary, and § USER-INBOX.

_ADR disposition:_ covered by ADR-035, ADR-031 (the lock), and the new ADR (D3).

### D7. The storage check-doc shrinks now and retires after its last users

`strategy-storage-evolution.md` is one of four forward-compatibility check-docs (`PROJECT-PRD.md`,
`STRATEGY-INDEX.md`, and its three siblings name the set). It guided work toward a model that the flip makes real, so
this unit cuts it to what still points forward:

- **Out:** § The Storage Model, § The Contract, Settled, and § Sequencing, whose homes are D2's strategy, ADR-035, and
  the cohort record. Principles 1–3 (the store now enforces them) and 15 (the cohort record holds it).
- **Moved:** Principle 4, that external tools own no work-unit artifact, to `strategy-pm-composition-evolution.md`
  § Interim Boundaries. `external-pm-composition` settles that question, and the rule holds there until it does.
- **Kept, and reworded from what the cutover must undo to what the store is:** the Self-Check, and Principles 5–14,
  which a design can still break: identity apart from branches, backend-agnostic workflows, concurrency as normal, one
  knob, no axis explosion, no required service, no reachability dependence, owner identity, freshness by record, and
  Git as the engine.
- **Numbers stay as they are,** since backlog drafts cite them.
- **Every citation of what it removes or moves is re-pointed here,** found by searching the repository and the store: a
  stored draft's by a save, an Accepted ADR's by D4's rules, and a historical one by naming the file at a commit that
  holds the cited version. Known: `strategy-procedure-evolution.md`, `strategy-knowledge-evolution.md`, and
  `strategy-pm-composition-evolution.md` (Principles 1 to 4); ADR-020 and ADR-025, both historical;
  `framework-core-from-package`, `delivery-observe-attest`, `projection-narrowed-views`, `arc-coordination-service`,
  `external-coord-probe`, and `external-pm-composition`; and `research-local-mode.md`.
- **The pending rename goes:** a file that will retire is not renamed.

**It retires after `history-policy`, `ghost-mode`, and `framework-core-from-package` have each landed or been dropped**
(Owner, 2026-11-24), by an Errand held in `USER-INBOX` until then. Those three still make choices it guards, and no
cohort's close waits for all three, which are standalone. The Errand moves each surviving rule to ADR-035 or D2's
strategy, or drops it. It finds every remaining citation of the file by searching the repository and the store,
re-points or removes each, treats those in Accepted ADRs by D4's rules, and takes the set from four to three where it is
listed. A historical link in an ADR, such as ADR-035's in its Context, is corrected to the file at a commit that holds
the cited version, with the ADR's words unchanged.

_ADR disposition:_ `none`; temporary.

## Alternatives

- **An amendment to ADR-035 in place of D3's ADR.** An amendment there would be reaching over another record's
  Decision, and ADR-027's own rationale routes a change to a Decision to a new ADR.
- **Expanding `strategy-session-operations.md` § Session State Portability in place of D2.** Cheaper by an index row
  and a recipe entry, and the flip's `QUICK-REFERENCE.md` points there already. Most of the content is not about
  sessions, and the file is already over 1,100 lines.
- **Explaining the store in each strategy.** Five copies to keep in step.
- **A complete clause list in this draft, in place of D4's closing read.** It was tried, and each complete review found
  sentences it missed, against a flip that is still moving.
- **One reader at the landing, with nothing compared.** Cheaper, and it leaves out the check on what was marked and not
  recorded, which is where the misses came from.
- **Landing after the removals.** Lets every sentence be final, and gives up the canary while the false doctrine stays
  live.
- **Retiring the check-doc now, or keeping it whole.** Now drops rules the follow-ons still need. Whole leaves two
  homes for one model.
- **Retiring the check-doc at the `state-storage` cohort's close.** The close does not wait for all three follow-ons, so
  it can come while one still uses the file.

## Unknowns and Assumptions

Each assumption is checked again at the flip's final head. The flip was read at `bb54d166ab`, the lane's links at
`ae455fe204`, the ADRs at `bcb1f2d498`, and the code cited by symbol at `4738eea1e3`, D3's at `64c7b65820` and D4's
at `c9410c1318`.

- **The flip's shipped text:** its workflows, rules, help text, and always-loaded text are what its final head holds.
  Phases 1–5 and tasks 6.1–6.3 are closed at `4738eea1e3`; tasks 6.4–6.8 and 6.R, its verification, and its review may
  still change it. The strategies name verbs as that text does.
- **D4's table is a floor.** The closing read decides what else changes, and nothing here rests on the table being
  complete.
- **`projection-team-scale`:** may land either side of the window. Nothing here describes the archive's read-only lay
  or `arc edit` until it has landed.
- **The unnamed risk is drift:** other branches may add old-model prose between the inventory and this unit's landing.
  Both parts of D1's inventory are run again at the head.

## Success signal

- Neither part of D1's inventory, the search or the concept read, leaves an unexplained hit.
- No shipped strategy tells a reader to commit state, read it through Git, push notes, or hand-render a status file.
- Each of the five strategies points to the one home, and a project installed from the recipe receives it.
- Every sentence D4's closing read marks has a row or a stated reason, every row carries its record, and the new ADR is
  Accepted.
- This unit's share of four register rows is done, each recorded against what is still outstanding when this lands: the
  isolation row closes; the append-only row passes to `history-policy`, as D6 says; and the doctrine row and the ADR row
  stay open only for whatever remains of D5's two items and ADR-014.

## Scope boundary (Won't Do)

- `docs/`, left stale for `docs-content-sweep`.
- Workflows, methods, skills, rules, templates, briefs, and help text: the flip's.
- The errata convention and the relocatability rule, both moved to the flip (`spec-cutover-flip.md` § 8.12, and § 8.3
  with § 8.16).
- The register's "criterion 3" rewording: ADR-037 retired the criterion, and no strategy or method still has it.
- Prose a removal makes false by removing its subject: the sibling's. D5's two items are there.
- Footer policy, which is `ghost-mode`'s, and the history policy, which is `history-policy`'s.
- Renaming the check-doc, or the family.

Depends on `cutover-flip`.

## Cohort-record edits

Made after the flip lands, as saves to the stored records, since nothing before the window reads them and a planning
branch's copy of a cohort record may not be the one the import takes:

- `cohort-storage-cutover.md`: `cutover-documentation`'s _Exposes:_ line loses "the errata convention", and the
  register share for the errata convention names the flip. In § Register shares, the doctrine row's notes share names
  `cutover-notes-removal` for `strategy-user-notes-concurrency.md`, and the ADR row's share names
  `cutover-tracked-state-removal` for ADR-021's recipe consequence, each only while that share is outstanding. The
  isolation and append-only rows' documentation shares are marked done. The append-only row passes to `history-policy`,
  and the section's "the Owner cell stays at this cohort for every split" names it as an exception.
- `cohort-state-storage.md`: the errata row's fate names the flip's workflow rewrite, the relocatability row's the
  same, the ADR row gains what D4's table and closing read add, the doctrine row's criterion-3 clause is marked met by
  ADR-037, the append-only row and § ADR anchors say append-only holds until `history.policy` can be configured, that
  row's owner becomes `history-policy`, with the rule's text in the rules and strategies beside its code, and the ADR
  row's ADR-021 clauses and the doctrine row's Errand clause point at the new ADR for what each protection mode does.
  The isolation row closes, and so does the append-only row as D6 says. The doctrine and ADR rows name only what is
  still outstanding.

## Dispositions

The Owner's pass, 2026-11-24. Each entry of the drained buffer:

| Entry                                                | Outcome                              | Location or reason                                |
| ---------------------------------------------------- | ------------------------------------ | ------------------------------------------------- |
| #33: `storage.backing_repository` comment            | fold                                 | D1                                                |
| H3: § Per-Worktree Isolation and its acceptance test | fold                                 | D6                                                |
| H4: errata convention                                | dismiss                              | moved to the flip (`spec-cutover-flip.md` § 8.12) |
| Drop H4                                              | fold                                 | Scope boundary; Cohort-record edits               |
| Stale lifecycle-verb sentences                       | fold                                 | D6                                                |
| Drop the relocatability rule                         | fold                                 | Scope boundary; Cohort-record edits               |
| § Auto-Merge Lane and the draft-lock model           | fold                                 | D6                                                |
| ADR-021, the lane half                               | fold                                 | D4                                                |
| ADR-021, the recipe consequence                      | hold `cutover-tracked-state-removal` | D5; captured in `USER-INBOX`                      |
| § Post-Landing Hand-Back step 1                      | fold                                 | D6                                                |

The `USER-INBOX` capture to cut `strategy-user-notes-concurrency.md` was re-aimed at `cutover-notes-removal`.

---
