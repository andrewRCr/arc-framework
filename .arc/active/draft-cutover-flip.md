# Draft: Cutover Flip

- **Origin:** [internal] — the `storage-cutover` cut (2026-11-03), whose draft this one continues; that draft
  came from the `state-storage` re-cut (2026-09-28).
- **Purpose:** Flip this repository onto the ref store in one rehearsed window, and retire Git notes. The subcohort's
  other members delete what the flip makes dead and rewrite the documentation. The flip has one repository: the import
  serves this repository alone (`cohort-state-storage.md` § Import scope, Owner 2026-10-10), and CineXplorer installs
  fresh once the cutover lands (`RELEASE-GATES.md` § `cinexplorer-adoption`, Owner 2026-10-22; #29).
- **Planning posture:** `P1`, a Gate B Must, in the subcohort `state-storage/storage-cutover`
  (`cohort-storage-cutover.md`).

---

## Planning state

- **Readiness:** not ready since planning review's first independent pass (2026-11-06), which found one critical and
  six major findings, each folded in place with its approved disposition; the folds are under review, and readiness is
  re-checked when the review closes. Before that pass the draft was formalization-ready, re-checked after planning
  review's source-grounding reshaped the window: one `needs-detail` gap, dispositions for the staged-cut refusal and the
  landing rules' retirement, closed in place. The 2026-11-05 readiness check returned not-ready; the Owner's planning
  pass, the consolidation that folded it, and the ADR dispositions (2026-11-06) closed its three gaps: the inbound
  buffer, the success signal, and the dispositions. The 2026-11-06 loop-exit check returned not-ready on two
  `needs-detail` gaps, both closed: the build the window imports from, with the backend switch named, and dispositions
  for #29 and #31. Re-run after those closures, it returned ready.
- **Entry read:** depth `high`; `Class` stays `Heavy`. Derivation fires, since the window runbook, the flip change, and
  the land-at-flip split must be designed. Scale fires too, given a deletion surface spanning several subsystems. The
  design is composed from the landed members' specifications, not invented. Confirmed 2026-11-05 with no material new
  evidence: the boundary stays one work unit, as cut on 2026-11-03. The draft runs about 1,250 lines, so the spec's size
  against the 1,500-line mark is watched at create-spec's entry.
- **Planning limits** (Owner-agreed, 2026-11-03):
    - Draft now what rests on landed work.
    - Write each item resting on an unlanded member against that member's approved specification, as a named
      assumption (§ Unknowns and Assumptions), re-checked when the member lands.
    - Hold the import's part until `storage-ref-hardening`'s trial imports (its Tasks 5.12 and 5.13) report. Lifted
      2026-11-03 (§ The import's part, released).
    - Generate no task list until `projection-worktrees` is in verification, except phases that touch no unlanded
      member.
- **Resolved:**
    - which items build now, which rest on assumptions, and which wait for the import (§ Building before
      `projection-worktrees` lands; § Unknowns and Assumptions);
    - `session-init-agenda` shipped on 2026-11-02, so the session-init rewrite derives from
      `spec-session-init-agenda.md`;
    - the boundary: cut at the flip (Owner, 2026-11-03; `cohort-storage-cutover.md`);
    - the rule that decides what lands at the flip, and the sort under it (Owner, 2026-11-03; § What lands at the flip,
      and what follows);
    - the cut is a retirement into the subcohort `state-storage/storage-cutover` (Owner, 2026-11-03; § The cut);
    - the per-check sort: every lifecycle hook check and the CI planning classifier follow, and only the prose acting
      on two classifier commands goes at the flip (§ What lands at the flip, and what follows);
    - the carve: five members, their items and edges, the size mark, and the follow-ons' Gate B placement (Owner,
      2026-11-03; `cohort-storage-cutover.md`);
    - no separate import rerun before the rehearsal (Owner, 2026-11-05; § The import's part, released);
    - the flip asks nothing of `projection-write-back` or `projection-worktrees` beyond their approved specifications
      (Owner, 2026-11-05; § What the flip needs from the projection members);
    - H4, the errata convention, moves from `cutover-documentation` into the flip's workflow rewrite, since it is
      workflow text (Owner, 2026-11-05; § The workflow rewrite);
    - #9 leaves the set that builds before `projection-worktrees` lands (§ Building before `projection-worktrees`
      lands);
    - the pre-meta archive folders get metas in an Errand before the rehearsal, landed at `68bddbb526` (PR #1286), and
      the rehearsal carries an accounting case for tracked state under the projected roots (Owner, 2026-11-05;
      § Tracked state the import does not claim);
    - #25 and #28 hold against `storage-ref-hardening`'s landed § 10 (§ Named assumptions on unlanded members);
    - the quiesce: the Owner stops every other session, then a check of what ARC can see, the import as the witness for
      personal state, and a guard sealing the pre-flip builds (Owner, 2026-11-05; § The quiesce, and the check that it
      holds); the guard lands as an Errand ahead of the window, landed at `a61e24716a` (PR #1287), and the check is a
      script in this unit's change (Owner, 2026-11-05);
    - the rehearsal: two stages on full copies, stopping at the host boundary, with the first Errand and the first work
      unit landed after the window as canaries (Owner, 2026-11-05; § The rehearsal);
    - the flip untracks the Candidate and transition records under `.arc/system/.internal/`, data only, and takes #3
      from `cutover-tracked-state-removal` (Owner, 2026-11-05; § The flip change);
    - the window's abort and recovery (Owner, 2026-11-05; § Abort and recovery);
    - H5: a save per review increment, at each approval gate's commit (Owner, 2026-11-05; § The workflow rewrite);
    - the old notes ref stays on the importing machine under a namespace that is neither a tag nor pushed, and goes in
      `cutover-notes-removal` (Owner, 2026-11-05; § Notes retirement);
    - the Owner's planning pass over the 29 inbound entries, #3, H4, and the three `USER-INBOX` captures naming this
      unit (Owner, 2026-11-06; § Dispositions), among them: `generate-tasks`' pre-save step names the save, whose
      task-list write check covers task lists from the flip, and the flip un-hides and documents `arc store`;
    - #9's branch leg (Owner, 2026-11-06): the rewired `arc sync` publishes state first, whatever the branch push's
      outcome, and reports each separately, so a slow or failing push gate no longer holds state back. Sync still
      pushes the branch. Sync that publishes state only, with handoff's own branch push, stays with the `USER-INBOX`
      capture "Decide whether a handoff `arc sync` should wait on the push gate…", whose first step is checking the
      readers a resume on another machine meets for a record naming a commit origin lacks (§ The flip change);
    - the consolidation (2026-11-06): every § Dispositions row folded into the body, the inbound buffer and its
      placement map dropped, and the success signal written (§ Success signal);
    - the always-loaded text the flip rewrites includes `DEV-RULES.ARC.md`'s rules that commit state and the rebase
      rule's notes reason (Owner, 2026-11-06; § The workflow rewrite);
    - the ADR dispositions, with two amendments to ADR-035, items 2 and 8, that this unit delivers (Owner, 2026-11-06;
      § ADR dispositions);
    - the flip's own landing: import first, then an Owner-directed merge of the head that untracks its records, with
      no ARC checkpoint (Owner, 2026-11-06; § The order);
    - planning review's source-grounding (2026-11-06), each fold approved with its disposition: `origin` designated as
      the state remote before the import, which retires the Errand identity refs in one run; the check records every
      `refs/arc/*` tip as the abort's restore point, and Stage 1 exercises the abort once after publication; notes
      retirement made local, since `origin` holds no notes refs; `lint:md:descriptors` kept for the task-list template,
      with `generate-tasks`' pre-save step naming the save; the relocatability rule's rewrite moved here from
      `cutover-documentation`; and the hand-offs shipped specifications and the consumer map make to the cutover's
      rewrite, flip change, quiesce, and rehearsal folded in, the consumer map named the rewrite's authoritative list,
      and the Errand branch's UID suffix built at the flip (Owner, 2026-11-06) (§ The window; § The rehearsal; § The
      flip change; § The workflow rewrite);
    - the window's quiesce check, designation, and import run on `main`'s pre-flip build, so the flip change leaves the
      import untouched (Owner, 2026-11-06; § The order, § The flip change);
    - the review stop rule (Owner, 2026-11-06): after the first independent pass's fixes and their fix check, a second
      pass runs only if the first found a critical or major finding; the review stops after the second pass, at the
      cap, whatever it finds, with any remaining material finding folded or deferred by disposition and the residual
      named in the capture commit;
    - planning review's first independent pass (2026-11-06), each fold approved with its disposition: the flip's own
      checkout runs its build with an override selecting the in-repo implementation until the import, and the flip
      build refuses a ref store where state is still tracked and no registry exists; a failure after the merge is
      fixed forward; the window fetches every branch first, each branch takes ROADMAP's deletion and deletes its own
      `.arc/active/` files, and the check records and the abort restores the push's tracking refs, with Stage 1's
      second run re-importing on the aborted copy; verify closes its task at the verification commit and attests
      after it; integrate keeps its cadence dispatch, each arm a store write; the consumer map is the rewrite's floor
      rather than its complete list; and the Errand branch's suffix covers every Errand type (§ The window; § The
      rehearsal; § The flip change; § The workflow rewrite).
- **Open:** none.
- **Next:** planning review: the fix check over the first pass's folds, the second pass, `arc check increment`, and the
  capture commit.

### The cut

`storage-cutover` retired into the subcohort `state-storage/storage-cutover` on 2026-11-03, by the procedure in
`RELEASE-GATES.md` § Decomposition until the cutover. This member continues its draft and carries the Must: the
rehearsal, the window, the flip change, the flip's whole workflow rewrite, and notes retirement. The boundary
decisions, the carve, and the follow-ons' placement are in `cohort-storage-cutover.md`.

The inbound items keep the numbers they had in `storage-cutover`'s buffer, and H1–H5 are the five hand-overs. This
draft has folded its own into the body, each number kept in parentheses where its item lands, and § Dispositions maps
every number to its place. An item cited here that this draft does not hold is in a follow-on member's draft under the
same number.

### Scope notes

- **`WORKING-MEMORY` entries removed when `cutover-flip` lands,** each trigger re-pointed at the cut:
    - the auto-merge lane's `planning` mapping: the flip's rewrite drops the prose that arms on `planning`, which the
      classifier (`classifyPlanningLane`, `lib/change-facts.ts`) stops answering, so the entry has nothing left to
      guard;
    - the Errand-close `nextOffer` resumption;
    - the `role-conflict` fast-forward;
    - the landing bridge's Candidate re-asks;
    - the decomposition procedure until the cutover.
- **`RELEASE-GATES.md`'s landing rules until the program completes** retire when the flip lands, with the two-PR landing
  bridge and `archive.cadence: manual` (the register's row for them, owner `storage-cutover`).

---

## Scope

- **In:** the rehearsal on full copies of this machine's repository (§ The rehearsal), then the window: quiesce,
  import, flip, retire notes (`analysis-storage-substrate-direction.md` § 10.3; § The window). The flip change (§ The
  flip change) and the whole workflow rewrite (§ The workflow rewrite) land at it. Planning-only work units' artifacts
  import from their branch heads, `delivery-rebuild-continuity`'s included; implementation work units land first where
  possible, or park at a task boundary.
- **The register's cutover rows** whose fate the flip realizes (`cohort-state-storage.md` § Storage-coupling
  register).
- **Two amendments to ADR-035,** items 2 and 8 (§ ADR dispositions).
- **Not here:** the deletion passes over what the flip makes dead (§ 10.4) and the documentation pass, which are the
  subcohort's four other members (`cohort-storage-cutover.md`; § What lands at the flip, and what follows).
- **Won't do:**
    - flip CineXplorer, or write any step for a second repository (#29);
    - rehearse on a throwaway hosted repository, since the canaries carry what lies past the host boundary (§ The
      rehearsal);
    - fix before the flip what the flip replaces: the partial-protection planning entry (#31), a throwaway fix.

---

## Success signal

- **Stage 2 is clean at the head that lands.** The dress rehearsal (§ The rehearsal) passes at the flip branch's
  reviewed head, which the merged head differs from only by the commit deleting the tracked state the import took (§ The
  order), re-run after any later change to the flip change, the import, or the rewritten workflows, with the destructive
  CLI matrix (#22) and the partial-protection start (#31) passing beside it.
- **The window completes,** every step in order and none aborted, with the accounting case reporting no tracked file
  under a projected root unexplained, and the chain comparison giving the same chain or the same refusal for every
  Candidate record through both readers (§ The order).
- **No tracked state remains.** Once the flip merges, no tracked file sits under `.arc/active/`, `.arc/backlog/`, or
  `.arc/completed/`, or in `.arc/system/.internal/candidates/` and `.arc/system/.internal/transitions/`.
- **The notes refs are retired.** No notes ref remains on the remote, and the importing machine's old ref survives
  there only, outside `refs/tags/` and unpushed; another machine's local notes ref is that machine's residual (§ Notes
  retirement; § The quiesce, and the check that it holds).
- **Both canaries land:** the first Errand and the first work unit after the window, each through the hosted steps it
  exists to test (§ The rehearsal).

---

## Direction

### What lands at the flip, and what follows

**The rule (Owner, 2026-11-03).**

- **At the flip:** whatever would break or mislead once state leaves the branch.
    - the rehearsal, and the quiesce with a check that it holds;
    - the state remote's designation and the import;
    - the flip change;
    - the whole workflow rewrite, since ARC's process changes once, at the flip;
    - notes retirement;
    - any check that would fail, or pass vacuously, once tracked state is gone. Refined (Owner, 2026-11-03): a check
      goes at the flip when it would fail, or when something after the flip relies on its result as assurance. A
      vacuous pass that nothing reads is inert and follows.
- **Follows:** code the flip only makes inert, and the strategy and ADR documentation. This goes to the follow-on
  members.

**At the flip, in this member:** the rehearsal (§ The rehearsal); the window, its quiesce, designation, import, and
notes retirement (§ The window); the flip change (§ The flip change); and the workflow rewrite (§ The workflow
rewrite).

**Follows, in the follow-on members** (`cohort-storage-cutover.md`). Items this draft routed there travel as
pre-routed `USER-INBOX` captures, since none of those members has a session:

- **`cutover-tracked-state-removal`:** #1's branch-tree readers, lifecycle classification, lifecycle hook checks, and CI
  planning classifier (the per-check sort below); #4; #10's import transform, after the window; #20; #24; #26's in-repo
  arms and `DERIVED_VIEWS`; #35; H2; the residue refs, once the held delivery work unit's artifacts are imported; the
  sealing guard and the quiesce check (captured 2026-11-05), with the in-repo override and the flip build's refusal over
  an unimported repository (added to that capture, 2026-11-06); the auto-merge block in `.github/CODEOWNERS` and the
  shipped merge-gate CODEOWNERS template, and `verify-integrity.sh`'s meta-shape check (captured 2026-11-06); and
  `seam-delivery-review`'s retired review-gate arms, keeping the review copy's classification arm (captured 2026-11-06).
- **`cutover-notes-removal`:** #1's notes-sync machinery, #10's sync-state ref, #17, and the notes configuration keys,
  once the session-init module's deletion leaves them no reader; the old notes ref with the notes residue refs;
  `arc user inbox-list`'s handler and registration; the notes lock's surviving callers moved onto the store's write
  serialization before `notes-lock.ts` goes; and `isCasRejectionError`'s fate reconciled with
  `spec-storage-ref-backend.md` § 11.1 (the last four captured 2026-11-06).
- **`cutover-decompose-removal`:** #25's deletion set.
- **`cutover-documentation`:** #33, H3, the strategy rewrites the register names, among them the strategy sentences
  that end a locus at teardown alone and reassign `Owner` by hand (captured 2026-11-06), and the ADR supersessions and
  amendments. The relocatability rule and ADR-035's two amendments are this unit's (§ The workflow rewrite; § ADR
  dispositions), the rule's move captured for that member (2026-11-06).

**The per-check sort** (2026-11-03): every lifecycle hook check and every part of the CI planning classifier follows.
None fails once tracked state is gone, and nothing relies on its result; only the prose acting on two classifier
commands goes at the flip, in the workflow rewrite. None refuses the flip commit itself, which deletes their inputs:
each reads files a deletion leaves out (`.arc/system/.internal/githooks/pre-commit`), most selecting staged files with
`--diff-filter=ACMR`, the task-list staging check only unstaged modifications, and the ROADMAP remedy unmerged paths,
skipping a commit that is not a merge (`lib/status/roadmap-conflict-auto-remedy.ts`), so a deletion gives none of them
anything to read, and no tracked document outside the state roots, `docs/`, and the tests links into them (checked
2026-11-05). The checks' detail and the deletion's ordering hazards are in `draft-cutover-tracked-state-removal.md`.

### Building before `projection-worktrees` lands

Phases that touch no unlanded member can build in the flip member before `projection-worktrees` lands. They still land
at the flip.

- **Rehearsal:** Stage 1 whole, with its copy driver (§ The rehearsal); for Stage 2, the destructive CLI matrix
  (#22), the partial-protection start (#31), and the harness for `seam-delivery-review`'s cases.
- **Quiesce:** the worktree lock (#19), and the check that the quiesce holds.
- **Flip change:** the in-repo override and the flip build's refusal over an unimported repository, ahead of the
  backend switch, the capture gates onto `arc inbox` (#11), the ROADMAP template's install entries (#26), the
  transition-record test's removal (#3), the `arc store` un-hide and its documentation, `arc init`'s state remote and
  project ID, the Errand branch's UID suffix, and the status help text.
- **Workflow rewrite:** every step from a landed member: #6, #12, #13, #14, #16, #21, #23, #25, and #37, and the
  consumer map's and shipped specifications' hand-offs but `arc save`'s naming.

What waits:

- for `projection-write-back`: #2, #5, #27, H4, H5, the Markdown fix's end-to-end test, and `generate-tasks`' pre-save
  step, since the store's write check covers a hand-edited task list only through write-back and `arc save`;
- for `projection-worktrees`: #9, which rewires `handleSync` (`handlers/sync.ts`) where that member adds its rebuild
  of deleted files ahead of the network steps (`spec-projection-worktrees.md` § 2.4), and #18;
- for `adopter-install-authority`'s specification: #32;
- for `cohort-identity-verbs`: H1.

### The rehearsal

Decided 2026-11-05 (Owner): two stages, each on a full copy of this machine's repository, stopping at the host
boundary, with the first landings after the window as canaries for what lies past it.

**Two stages, because of the dates.** One dress rehearsal could not start until `projection-worktrees` lands and the
flip change builds, which would put every step's first run in December, with the 2027-01-08 fallback close behind. The
window's mechanics need neither, so they run first.

- **Stage 1, the window's mechanics,** from this unit's branch before the flip change exists, once the sealing guard is
  on `main` (landed at `a61e24716a`) and the quiesce check builds. Its build is today's machinery plus the check. It
  fetches every branch from the copy's mirror, then runs the quiesce check (§ The quiesce, and the check that it
  holds), a save from every copied checkout (#34), the copy's mirror designated as its state remote, and a real import,
  publication to that mirror included, then:
    - the sealing guard (`refuseWriteIfStoreImported`) refusing an in-repo write in every copied checkout once the
      import has run;
    - the Errand identity refs gone from the copy and its mirror with the kept tips dropped;
    - the accounting case (§ Tracked state the import does not claim);
    - the chain comparison (#8, below);
    - case 1 below;
    - the import's time and peak memory, under `memcap_gated -m 6G` with its in-process ceiling below that cap.

  The import covers the review gate's machine-local records as well as the tracked ones, since every review record
  reshapes at the flip (#23). Stage 1 runs twice. The first runs on a copy without the pre-meta backfill, reverted there
  since it has landed (`68bddbb526`), so its accounting case reports the twenty folders and shows the case catches the
  omission it exists for, and it ends with an abort, after publication and the checks above and before notes
  retirement; the abort must put back every recorded ref on the copy and its mirror and lift the guard (§ Abort and
  recovery). The second runs on that aborted copy with the backfill restored, so it confirms both the backfill and that
  an aborted repository imports again, and after its import it runs notes retirement (#7). An abort never follows notes
  retirement in the window, which retires notes after the merge, so the abort's record holds no notes ref.
- **Stage 2, the dress rehearsal,** at the flip branch's head once the flip change builds. On a fresh copy it runs the
  whole window in the order § The order sets: Stage 1's steps, on the copy's pre-flip build; the flip's own landing,
  with the commit deleting the tracked state the import took, a merge into the copy's mirror standing in for the host
  merge, and its archive written through the store; and each checkout's steps through its first materialization and the
  checkout carries (#15, #30). The copy's flip checkout runs its own build with the in-repo override until the import,
  and without it after (§ The flip change); before the copy's import it also runs the flip build's refusal of a ref
  store over the copy, with no override set. Then it runs:
    - the parser check (#5, below), which rests on `projection-write-back`;
    - a work unit driven end to end through the rewritten workflows (#2, below);
    - cases 2 to 7 below, and the other store-backed paths;
    - the status and view arms from the flip, the roster read and the slug clash among them, which first run for real
      here (`spec-seam-status-roadmap.md`);
    - the tripwire report's first live figures, from `arc handoff write`'s `maintain()` and the rewired sync's push,
      since the in-repo store reports none (`spec-seam-locus.md` § 9.3);
    - the Markdown fix's end-to-end test over the flipped store (§ The flip change);
    - the representative decomposition cut (#25, #28, below).
- **Alongside Stage 2,** the destructive CLI matrix (#22) and the partial-protection start (#31) run in synthetic
  scratch repositories through the spawned built CLI, as the matrix requires (below).

Each stage records its run under `~/dev/arc-evidence/cutover-flip/` on this machine. A failure is fixed in this unit's
change and its stage re-run. The window opens only after a clean Stage 2, which re-runs at the new head after any later
change to the flip change, the import, or the rewritten workflows.

**Copy safety.** The hardening's trial driver copied the primary with `cp -a`, which left `origin` on the host and the
copy's worktree registrations on the live checkouts; a trial publishes nothing, so neither mattered. A real import would
publish to the host and could reach the live worktrees. Before any `arc` command in a copy, the driver rewrites every
remote to a local bare mirror and repairs each worktree registration to its copied checkout (`git worktree repair`). It
then asserts both, with `storage.backing_repository` naming no other repository and `gh` finding none in the copy. A
copy that fails any of these stops the stage.

**The chain comparison** (#8, #23). The import replays each Candidate record's versions from the plain path log today's
chain reader walks (`readImportCandidateVersions`, `lib/store/ref/import/candidate.ts`; the reader,
`readRepositoryCandidateSupersessionChain`, `lib/store/kinds/review/candidate/history.ts`), since the in-repo `history`
follows renames and drops a version a merge commit introduced. Today's reader refuses six records:
`evidence-applicability` at a broken chain link (`resolveCandidateSupersessionAncestors`), and five that fail today's
Candidate schema before any chain walk (`readCandidateRecordVersioned`). The import carries all six unchanged
(`inspectCandidateChain`, `lib/store/ref/import/review.ts`). `storage-ref-backend`'s tests compare the two readers over
a fixture (`spec-storage-ref-backend.md` § 14.7); only the rehearsal can compare every record in this repository. It
reads every Candidate record's chain through the store's `history` and through today's reader, and requires the same
chain or the same refusal for each. It also tests a fact new at the flip: a Candidate's supersession is then its
singleton record's `history`, a live work unit's replayed versions arriving mapped, their transitions whole, and those
of a work unit no longer live, archived, abandoned, or cut, arriving as found; a work unit merged but not yet archived
is live (`spec-storage-ref-backend.md` § 10.8).

**The parser check** (#5). The projection's write-back is an ordinary contract `write`, so a kind whose parser slot is
empty (`createKindRegistry`, `lib/store/registry.ts`) writes unvalidated. Merge does not need the parser, so nothing
fails visibly, but the commit-time content checks retire at the cutover, and the parser replaces them (the register
row "Lifecycle hook checks": "Removed at cutover, except content rules that move into a record-family parser"). The
write path registers through `PRODUCTION_REGISTRATIONS`, and the check slot, not the parser, refuses edits to verb-owned
fields. The check lists every kind with a writable projected path and refuses the flip while a kind with structured
content has an empty parser slot. The free-prose kinds need none (§ What the flip needs from the projection members).
Entry shapes need no check: every entry kind now declares its grammar (`ENTRY_CONFIGS`,
`lib/store/kinds/entry-configs.ts`), `work-item/description`, `work-item/inbound`, and `personal/errand-queue` among
them, so entry merge (`mergeEntryText`, `lib/store/concurrency/entry-merge.ts`) has a grammar for every hand edit.

**The end-to-end work unit** (#2). `arc save`, write-back, the close verb closing tasks and capturing their commits, and
the import's footer-derived task captures (`importTaskCaptures`) all first run for real at the flip, so only the
rehearsal exercises them through the rewritten workflows before it. The run takes one work unit, started branchless,
with activation creating its branch at base's tip (`spec-storage-contract.md` D17), through draft capture, create-spec
with an ADR companion, a task closed through the close verb, handoff, and pre-publication with the review copy, through
`arc publish`, its pre-publication review on the local source. Integration's candidate tail lies past the host boundary,
with the work-unit canary.

**The checkout carries** (#15, #30). Before the flip no in-place arm writes a checkout marker: the cold start,
`arc start --here`'s graduation, `arc materialize --here`, in-place resume, and promotion on the primary all leave none
(`spec-seam-locus.md` § 2.7), and the import leaves the marker out as machine-local (`spec-storage-ref-backend.md`
§ 10.8). From the flip, locus derivation reads only the marker and the store, so every checkout claimed in place before
the flip holds its work unit with no marker. Session start then offers `arc materialize <slug> --here` for a marker-less
checkout that has out a branch an owned in-flight work unit links, and a work unit no checkout holds, one cold-started
on base under partial protection among them, takes the ordinary materialize offer. Separately, from the flip a work-unit
checkout claim carries and matches its owner's UID, with no slug fallback, and no marker written before the flip carries
one, so every spawned pre-flip checkout's claim refuses until it is bound (`spec-lifecycle-slug-selection.md` § 7). Such
a marker is unbound rather than re-stamped (§ 7.4; Owner, 2026-10-23): claim readers and holder matching refuse it,
naming the exits its marker and slug select, `arc materialize <slug> --here` for a live holder materialize admits, the
cold start's rerun for an anchored leftover whose slug has no record, and `arc locus release`. Stage 2 carries a
pre-flip `arc start --here` checkout on a work branch under full protection to an anchored marker after the import, and
binds a spawned pre-flip checkout (that specification's § 9). The cold start on base under partial protection runs
beside the partial-protection start (#31) in the synthetic repositories, since this repository runs full protection.

**The representative decomposition cut** (#25, #28). `seam-decomposition` rebuilds `arc decompose` store-native from the
flip; what lands before it, its flags, schema, and batch writers among them, runs dark behind a capability branch in
`handleDecompose` (`spec-seam-decomposition.md` § 1.4), so the rehearsal is the store version's first run on the ref
backend. Run as a representative cut on a copy, it is the evidence `decompose-core-hardening` and
`decompose-transform-integrity` close on, each against its unchanged closeout criterion, core-hardening's being "a
representative real cut" showing the shipped members' properties "without post-transition repair"
(`cohort-decompose-core-hardening.md` § Closeout criteria), which the subcohort admits as evidence (its § Soft
coordination). Today's machine has not given one. `decompose-scaling`'s retirement (Owner, 2026-10-16) has run, with its
two scanner costs recorded out of scope, so neither cohort holds another open member. The cut copies a verbatim-keyed
companion and gives each member a conventional Design (§ Named assumptions on unlanded members). It also carries the
caveat `cohort-decompose-transform-integrity.md` leaves to this rehearsal (its 2026-10-16 retirement amendment): the cut
records its execute half's time, and if that exceeds common command timeouts, the rehearsal interrupts one apply and
retries it, where a repeated `--finish` on a landed cut reports it landed rather than refusing
(`spec-seam-decomposition.md` § 8.7).

**The destructive CLI matrix** (#22). `seam-locus`'s verification proved dormant destructive success and repaired
continuation through registered CLI-generated handler inputs, the reference Store, and real Git, and its built-CLI
scenarios prove pre-flip refusals; the production executable selects the in-repo backend, so successful execution
through the actual flipped built CLI is unproven. Every group in `notes-seam-locus.md` § Destructive-path verification
and flip release checks runs in scratch repositories through a spawned built CLI selecting the real flipped backend and
production ports, before the flip releases: cold and named start with the default lifecycle ports; graduate,
materialize, rename, and teardown; locus release, anchored and spawned; inbox and route insertion, move, and carry; the
Errand queue and queue set; full and partial open with link; Errand leave and rematerialize; abandon and failed-open
rollback; close and removal by ID and version; promotion; personal reconcile and scratch; handoff write from file and
stdin; identity add, init, and join; and session-init, handoff status, recovery, and Candidate orientation, with the
orphan-branch sweep's store-backed outcome among session-init's (`orphanWorkLanded`,
`lib/session-init/orphan-branch-sweep.ts`; the notes' A25). Each covers success, each material refusal, and successful
continuation after repair, retaining command results and the observable record, UID, marker, checkout, code-ref, and
personal byte outcomes. Handler or provider success discharges none of it; evidence from today's handlers stays labeled
apart from the built-CLI runs, and the table's templates locate existing scenarios rather than assert a flipped-backend
pass.

**The partial-protection start** (#31). Under `branch.protection: partial`, `arc plan check --name <slug>` refuses a
started work unit's own `plan/<slug>` branch with `redirect` / `work-unit-branch`: `classifyPlanningEntry`
(`lib/git/write-context.ts`) computes
`protection === "partial" ? writeContext.verdict === "proceed" : onPlanningBranch`, so under partial only the base
branch is committable, and `draft-design`'s own redirect leg leads back to the same redirect. This repository runs full
protection; partial is the default a new install gets. No fix runs before the flip, since from it store writes do not
depend on the checkout (the register row "State writes routed by where they can be committed"). The synthetic run starts
a work unit under partial protection and drafts on its branch.

**The store-backed paths.** `seam-delivery-review`'s review stopped after five complete passes without converging,
with most of pass 5's majors in code that runs only from the flip or in the import. The Owner accepted that residual,
so the rehearsal exercises those paths (the PM brief, § What the rehearsal needs first). Each pass's disposition
records settle all 123 of its findings: fixed with a failing-then-passing test, rejected with a reason, or deferred
and since landed (pass 1's F5, as `ea8dd53321`). The rehearsal therefore runs paths, not known defects. The seven
cases:

1. the import refuses a review boundary filed under another work unit's owner (Stage 1);
2. a pending local review's recovery command carries its operation reference and runs, with the hosted half at the
   canary;
3. lifecycle composition works with no projected directory;
4. the next-pass budget counts a superseded terminal producer once;
5. a consumed additional-pass grant stays consumed across native projection;
6. reopen and readiness publish with the Candidate version;
7. specification export refuses or contains a linked destination.

The end-to-end work unit also deliberately takes the other paths the passes name:

- a re-entry carrying the Owner's judgments after a scope refusal, a self-review retry among them;
- a native re-entry from an imported saved replay grant, where the copy's import carries one;
- a reopen followed by session-init;
- a work unit started under an archived unit's slug;
- an earlier member's readiness once the representative cut closes its cohort.

The finding-by-finding grouping is at `~/dev/arc-evidence/cutover-flip/seam-delivery-review-paths.md`.

**Past the host boundary, the canaries** (Owner, 2026-11-05). The copies have no host, so no pull request, hosted
review, CI, or Candidate tail runs in either stage. Publication and its readiness still run in Stage 2, since
`arc publish` is a store write before the pull request opens (`prepare-work-unit.md`). Three groups of paths run only
past the boundary:

- the integration checkpoint and its landing write;
- hosted review's approval and settlement;
- native delivery's hosted member admission.

A throwaway hosted repository would rehearse its own CI and reviewer setup more than the flip, and each of these paths'
fixes carries a test at the host seam. Instead, the first Errand and the first work unit to land after the window are
canaries. Each lands with the Owner present, and nothing else lands until it has. A small Errand goes first, through
hosted review, settlement, and the Errand merge, which lands through `arc errand merge` rather than the integration
checkpoint. The work-unit canary is whichever work unit is ready first, `cutover-documentation`, mostly prose, preferred
when it is; it goes through the pull request, hosted review, the integration checkpoint, and landing. Native delivery's
hosted admission has no landing to run it until delivery resumes, so its first real run falls to
`delivery-rebuild-continuity`.

Because each canary lands through the step it tests, a native checkpoint or landing step that refuses there also
refuses the landing of its own fix. The exit is an Owner-directed merge of that fix in the host's interface, with every
independent check run first (`DEV-RULES.PROJECT.md` § Self-Hosting Defects).

### The window

#### The order

The window runs as ordered steps; the spec sets the exact steps and their abort points from the import's stages (§ Abort
and recovery), and each step from what its commands change, the refs, files, and configuration, so the check's record,
the abort's restore, and each checkout's steps cover all of it. The importing checkout runs the quiesce check, the state
remote's designation, and the import on `main`'s pre-flip build, as both rehearsal stages do (Owner, 2026-11-06). Until
the import, the flip's own checkout runs its build under the in-repo override, and no other checkout runs the flip's
build until the flip has merged (§ The flip change).

- **Ahead of the window:**
    - the sealing guard and the pre-meta backfill, both on `main` before the rehearsal (§ The quiesce, and the check
      that it holds; § Tracked state the import does not claim);
    - implementation work units landed where possible, or parked at a task boundary;
    - the pre-import tidy, worked from the import's trial run, since on a public repository the import publishes this
      repository's personal state for good (#7);
    - every machine's notes brought to the importing machine by `git bundle` or a fetch between machines, since the
      remote notes refs are deleted and the import refuses a notes file that differs from its disk copy (#7);
    - review finished on every machine but the importing one, since the review gate's repository ID is minted per
      clone and only the importing clone's facts are read (#7);
    - the flip itself finished up to its merge on the in-repo implementation, its checkout under the override, at one
      head: its review settled, its verification done, and CI passing there. Its own `.arc/active/` files and Candidate
      record stay at its branch tip, where the import reads a live work unit's records (`spec-storage-ref-backend.md`
      § 10.8), since `main` tracks none of them.
- **The quiesce** (§ The quiesce, and the check that it holds): every other session handed off and stopped (#2); every
  review attempt in flight on the importing machine finished (#23); ended holders' checkouts and work-unit husks torn
  down (#30); every unlocked marked worktree locked (#19); every branch fetched from `origin`, since the import picks
  each live work unit's copy across branches and fetched refs and the cutover fetches every branch first
  (`spec-storage-ref-backend.md` § 10.8); the check; and a save from every checkout (#34).
- **`origin` designated as the state remote:** `arc store remote origin push`, which sets `remote.origin.arc-state`
  (`readRefDesignation`, `lib/store/ref/designation.ts`). The import then lands in the code repository's own
  `refs/arc/*` and publishes to `origin`, ADR-035 item 2's default, with this repository's personal state published
  beside its project state (`cohort-state-storage.md`'s register, Owner 2026-10-10). Undesignated, it would build a
  separate store directory and publish nothing (`writeRefRepository`, `lib/store/ref/repository.ts`;
  `spec-storage-ref-backend.md` § 10.11).
- **The import,** its publication included. The import converts every draft's inbound buffer and every held capture into
  inbound lists, so the window confirms none is left behind (#7). The same run retires the transient-identity refs: it
  deletes `refs/arc/user/<id>/errands` as it lands, keeping the tip it re-homed under
  `refs/arc/tmp/migrate/import/kept/`, and once its push succeeds deletes `origin`'s copy, leased on that tip, and drops
  the kept tips (`publishImport`, `lib/store/ref/import/finish.ts`; `retireImportRemote`,
  `lib/store/ref/import/transient-cleanup.ts`). Running it again only finishes a run that stopped part-way
  (`spec-storage-ref-backend.md` § 10.11). The accounting case and the chain comparison run over it as in the rehearsal.
  The check then recomputes what it recorded, and any change stops the window before the flip change.
- **The flip lands** (below): one commit on its branch deletes the tracked state the import took, its own records, the
  shared roots' files, and the `.internal/` records, all of which its in-repo lifecycle reads under the override until
  the import, and the Owner merges that exact head in the host's interface. Its archive is then written through the
  store from its build (`arc archive`). No landing-commit link is written, since no checkpoint binds the merge
  (`spec-seam-delivery-review.md` A39), and its completed frame derives from the archive or from the merge's patch
  identity (`spec-seam-locus.md` § 2.1).
- **Each checkout,** in turn:
    - deletes its own copy of a Candidate or boundary record that differs from `main`'s, and its own `.arc/active/`
      files, from disk as well as the index, and commits the deletion, since a merge refuses an index that differs from
      `HEAD` (§ Tracked state the import does not claim);
    - merges `main`, taking ROADMAP's deletion with `git rm` where its branch modified `.arc/backlog/ROADMAP.md`, and
      rebuilds. A staged deletion leaves the ROADMAP conflict remedy inert, since it re-renders only an unmerged or an
      added or modified ROADMAP (`assessRoadmapConflictAutoRemedy`, `lib/status/roadmap-conflict-auto-remedy.ts`),
      while an unresolved one would have the remedy render the file and stage it back under a projected root;
    - removes its pre-flip workspace folder, which the import has folded into the meta's session context and
      `scratch/`;
    - takes its first materialization;
    - has its pre-flip marker bound or released, or, claimed in place, is carried to an anchored marker (§ The
      rehearsal, the checkout carries; #15, #30).
- **Notes retire last** (§ Notes retirement).

**The flip's own landing** (Owner, 2026-11-06): import first, then an Owner-directed merge. The flip branch's build
selects the ref store, so before the import it runs under the in-repo override, and after it the sealing guard refuses
the in-repo implementation's writes, so neither today's integration checkpoint nor its landing write and archive can run
for the flip once its records are imported. The store's checkpoint is a canary path no rehearsal reaches (§ The
rehearsal), so it stays off the flip's own landing. The flip therefore finishes everything before its merge on the
in-repo implementation ahead of the window. After the import has read its records, its checkout drops the override and
one commit deletes them from its branch, so the merged head differs from the head reviewed and verified only by deleted
state files. The Owner authorizes that exact head, every independent check run there first, and merges it in the host's
interface; no ARC checkpoint runs. The flip's post-merge records are the first lifecycle writes the store takes past the
host boundary. Merging after the import keeps the abort rule as it stands: until the merge, an abort leaves `main`
untouched (§ Abort and recovery). Merging first, through today's checkpoint, was the alternative: it would put the
merge, which cannot simply be undone, ahead of an import not yet shown to hold, and turn an import's abort into a revert
of the flip on `main`.

#### The quiesce, and the check that it holds

Decided 2026-11-05 (Owner): check, then import at once, with the import's own comparisons as the witness, plus a guard
that seals the pre-flip builds.

**The sessions.** Nothing may break across the flip (`spec-storage-contract.md` D15), and a session still holding
pre-flip workflow text in context would follow steps the rewrite removed, so the quiesce reaches live sessions, not only
in-flight work units (#2). ARC sees no harness session, so the Owner stops every other session, in every harness, after
each has handed off, and each resumes on the rewritten text; no message round asks them to stop. A pass loop open across
the flip keeps its earlier passes in the scratch file the import moves its workspace's other files to; its session
supplies them as prior findings by hand and carries the pass count and any pending approval forward
(`spec-storage-contract.md` D14). What ARC can see, it checks.

**What the window does before the check:**

- finishes every review attempt in flight on the importing machine, beside the review already finished on every other
  machine, since an attempt's state in flight is not mapped and the import refuses one (#23);
- tears down ended holders' checkouts and work-unit husks, since neither takes a teardown after the flip: a work-unit
  husk's in-repo evidence never passes the store teardown's husk selection (`huskEvidenceMatches`,
  `lib/work-unit/store-retirement-husk.ts`; #30);
- runs `git worktree lock --reason` with the value `PROJECTION_LOCK_REASON` holds (`lib/git/worktree-removal.ts`),
  read from the built constant, on each linked checkout whose marker names a work unit or an Errand and that carries no
  lock, leaving anchored and unmarked worktrees unlocked. The projection locks each work-item checkout ARC spawns but
  runs no backfill (`spec-projection-substrate.md` § 12.7), and a worktree left unlocked at the flip is exposed to a
  plain `git worktree remove`, which deletes its gitignored projection without persisting its edits (#19);
- fetches every branch from `origin`, so the check compares each checkout's branch with its upstream as `origin` holds
  it and the import picks each live work unit's latest pushed copy (`spec-storage-ref-backend.md` § 10.8).

**The check,** run from the importing checkout immediately before the import, refuses with each failing checkout
named:

- the primary and every checkout whose marker names a work unit or an Errand is clean and its branch matches its
  upstream, so each in-flight implementation unit sits at a task boundary, landed or paused; ARC's machinery checkouts,
  which carry no such marker (`spec-projection-worktrees.md` § 2.5), are torn down or named;
- every linked checkout whose marker names a work unit or an Errand holds the projection's lock;
- no ended holder or work-unit husk remains to tear down;
- no decomposition cut today's machine has staged remains unlanded and uncleaned, since the store version reads no
  candidate branch or staged checkout (`spec-seam-decomposition.md` § 18, "Migration and rollout");
- every checkout's `HEAD` descends from `a61e24716a`, the sealing guard's merge on `main` (PR #1287), and its build
  carries the guard below.

**Then every checkout saves its personal state, and the import runs** (#34). The import blocks on every personal file
whose disk copy differs from its saved notes copy, naming the remedy `arc user save` and `arc user load`
(`lib/store/ref/import/personal.ts`). Live sessions edit those files continuously, the identity-global ones such as
`USER-INBOX.md` and each live work unit's `SESSION-NOTES.md`, so a save taken early goes stale before the import runs;
the save is one step with the quiesce, immediately before the import.

**The import is the witness for personal state:** it refuses a notes file whose disk copy differs from its saved copy,
an attempt in flight in the review gate, and an unmapped review source, so a write that slipped past the stop refuses
the import rather than vanishing. The hardening's trials ran this sequence in trial form, a save from every registered
checkout and then the import, clean four times.

**What the check records.** Each worktree's `HEAD` and a digest of its personal files, which the window computes again
after the import, any change stopping it before the flip change. An Errand write needs no comparison of its own: the
import's landing leases each transient-identity ref on the tip it read, so one that advanced refuses the landing
(`landImportRefs`, `lib/store/ref/import/land.ts`), and from then on the sealing guard refuses the Errand writers
(`transactTransientIdentities`, `lib/errand/identity-transaction.ts`, which writes them through `writeTreeCommit`,
`lib/errand/ref-tree.ts`). The check also records every `refs/arc/*` tip, local and on `origin`, and holds each under
`refs/arc-window/`, fetching `origin`'s there: the abort's restore point (§ Abort and recovery). Today those refs hold
the Errand identity refs, delivery's candidate, recovery, and bootstrap refs, and the notes sync state, none a store ref
(`isStateRef`, `lib/store/ref/manifest.ts`). The hold matters after publication, when the import has deleted the Errand
identity refs on both sides and dropped the tips it kept, and a deleted ref's commits are otherwise prunable; neither
the import, which reads `refs/arc/`, nor a push reads `refs/arc-window/`. The check records the push's tracking refs,
`refs/arc-remotes/origin/*`, beside them, empty today: an accepted push writes one per published ref outside
`refs/arc/` (`acknowledgePushRefs`, `lib/store/ref/push-tracking.ts`), and the next push leases on them
(`readPushListing`, `lib/store/ref/push-listing.ts`).

**The sealing guard** closes the one silent loss. Each checkout runs its own build, so a checkout that has not merged
the flip would keep writing tracked state and Git notes after the import. Its personal writes would vanish, since the
import retires notes. The guard landed on `main` as an Errand, at `a61e24716a` (PR #1287): once
`refs/arc/project/registry` exists, the in-repo implementation, every notes writer, and the Errand identity transaction
and its push reconcile refuse their writes with a recoverable store-imported refusal naming the remedy, merge base and
rebuild, while reads stay open (`refuseWriteIfStoreImported`, `lib/store/store-imported.ts`). No such ref exists before
the import, and every worktree on a machine shares one ref namespace, so the guard fires in every checkout the moment
the primary imports. Writers that bypass the store do not consult it, lifecycle's transition records
(`writeTransitionRecord`, through `terminalTransitionWriter` in `handlers/lifecycle.ts`) and the decomposition
operation's writes among them, so the quiesce, which stops every session first, is what covers those. It landed ahead
of the rehearsal, not only the window, so the rehearsal's copy carries it and
exercises the moment it exists for; it could not ride this unit's single landing (Owner, 2026-11-05). A clone on another
machine sees the ref only through ARC's state fetch, so other machines stay a residual the window's own steps cover
(#7). The guard is dead once the in-repo implementation goes, so `cutover-tracked-state-removal` deletes it with that
implementation.

**Where the check lives** (Owner, 2026-11-05): a script in this unit's change, reviewed and tested with it and exercised
by the rehearsal, since it gates an irreversible step; `cutover-tracked-state-removal` deletes it with the in-repo
implementation.

#### Abort and recovery

Decided 2026-11-05 (Owner); the restore point added at planning review (2026-11-06). Two of the window's steps cannot
simply be undone: the import's push publishes `refs/arc/*` to a public origin, and the flip merges to `main`. The
sealing guard adds a hazard: once `refs/arc/project/registry` exists, a pre-flip build refuses its store, notes, and
Errand writes, so a failed import with no usable store behind it would leave every checkout on the machine unable to
make them.

- **Ordered steps, each with an abort rule.** Any refusal, mismatch, or failed check stops the window at that step.
- **An abort restores what the check recorded** (§ The quiesce, and the check that it holds), locally and, once the
  import has published, on `origin`: each `refs/arc/*` ref the record holds goes back to its recorded tip, and every
  other `refs/arc/*` ref is deleted, as is every `refs/arc-remotes/origin/*` tracking ref the record does not hold. It
  also removes any separate store directory (`<commonDir>/arc/store`) and unsets `remote.origin.arc-state`. The
  registry ref is gone with the rest, which lifts the guard, while refs the import never touched, such as delivery's
  candidate refs and the notes sync state, come back unchanged rather than being deleted. Stage 1 exercises it once,
  after publication, and imports again on the aborted copy (§ The rehearsal).
- **After publication,** the pre-import tidy still matters, since anything pushed may already have been copied.
- **After the merge, fix forward** (Owner, 2026-11-06). A failed step past the merge, the flip's own archive, a
  checkout's merge and rebuild, its first materialization, its marker's carry, or notes retirement, stops the window
  there; nothing is reverted, and the store writes made after the merge stand. Its fix lands as the canaries' does: an
  Owner-directed merge in the host's interface, every independent check run first (`DEV-RULES.PROJECT.md` § Self-Hosting
  Defects; § The rehearsal). Reverting the merge and restoring the record was the alternative; it would lose those
  writes and unwind every checkout that had already merged and rebuilt.
- **Notes retire last,** after the flip has merged and the first materialization has succeeded. Until then each
  person's notes stay where the import read them, unchanged, for comparison with the imported records and for
  re-deriving one the import got wrong; they are the import's source, not a path back.

#### Notes retirement

Notes retire at the import: the import reads each person's notes and deletes no notes ref (`lib/store/ref/import/` reads
`refs/notes/arc/user/` alone), the sealing guard then refuses every notes writer, and the flip's build has none.
`origin` holds no notes refs, deleted 2026-10-06 (`cohort-state-storage.md`'s register), so the window's last step is
local: the importing machine moves its notes ref under a namespace that is neither a tag nor pushed, so
`git push --tags` cannot publish every past personal note (Owner, 2026-11-05; #7). The old ref goes with the notes
residue refs in `cutover-notes-removal`, by capture (2026-11-06). This settles analysis § 10.3's "keep the old ref as an
archive tag", and ADR-035 item 8 is amended to match (§ ADR dispositions).

### The flip change

The code that must change at the flip, beside the import and the workflow rewrite.

- **The backend switch.** `createStore` (`lib/store/create.ts`), today the in-repo implementation alone, builds the ref
  backend, so every store a command opens reports `stateOffBranch`. This is the flip; the rest of this section follows
  from it. The import stays as it is: `runStoreMigrate` builds the import's source through `createStore`, so on a flip
  build that source would be the ref store itself, and no flip build imports (§ The order).
  `cutover-tracked-state-removal` deletes the import's transform after the window (#10).
- **The flip's own checkout, and an unimported repository** (Owner, 2026-11-06). Once the switch is committed, every
  ARC command in the flip's checkout runs the flip build, its pre-commit hook included (`node_modules/.bin/arc`,
  `.arc/system/.internal/githooks/pre-commit`). Against a repository not yet imported, that build would open an empty
  ref store: its reads would find no work unit, and its first write would create `<commonDir>/arc/store`, shared by
  every worktree on the machine (`writeRefRepository`, `lib/store/ref/repository.ts`). A lifecycle write's lineage
  record lives under the registry ref (the `lineage` family, `lib/store/registry.ts`), so it would create the ref that
  seals every pre-flip checkout (`storeImported`, `lib/store/store-imported.ts`), and a stray store makes the import
  refuse as occupied or as a layout mismatch (`landImportRefs`, `lib/store/ref/import/land.ts`). Two pieces close
  this:
    - an override, read from the environment, under which `createStore` builds the in-repo implementation. Until the
      import, the flip's checkout sets it in the environment of every command it runs, `git` included, since a hook
      inherits the environment of the `git` process that runs it, and this repository's pre-commit hook builds a store
      (`validate-cohort-consistency.ts`, and `arc check pre-commit`); a check that runs the checkout's code elsewhere
      carries it too. The flip's own lifecycle then runs on the in-repo implementation up to the import (§ The order).
      The capability stays a fixed property of the store a command builds;
    - the flip build refuses to open a ref store in a repository whose tree still tracks ARC state and which holds no
      registry ref, the sealing guard's mirror, with a recoverable refusal naming the remedy: import from the pre-flip
      build, or set the override. A command run without the override then refuses rather than creating a store.

  Both go with the in-repo implementation in `cutover-tracked-state-removal`. Choosing the backend by whether the
  registry exists was the alternative: a clone made after the flip holds no registry until it pulls, so it would fall
  silently to the in-repo implementation, and the capability, a synchronous property today (`lazyStore`,
  `lib/store/create.ts`), would turn on a repository read in every command that builds a store.
- **`arc sync` onto the store's `pull` and `push`** (#9). `storage-ref-backend` renamed the contract's `sync()` to
  `push({ carry? })` and added `pull()`, while `arc sync` keeps its name and runs both, pulling then pushing
  (`spec-storage-ref-backend.md` § 2.1, § 6.1). The flip points `handleSync` (`handlers/sync.ts`) at `pull` then `push`,
  reporting the push's figures through the tripwire report (`spec-seam-locus.md` § 9.3), and drops the notes leg's call;
  the notes machinery itself goes in `cutover-notes-removal` (#1). State publishes first, whatever the branch push's
  outcome, and each is reported separately (Owner, 2026-11-06); ADR-035 item 2 is amended to match (§ ADR dispositions).
  The legs pair today because notes are keyed to commits: `NOTES_BLOCK_WORKTREE_STATES` (`handlers/sync.ts`) holds the
  notes leg back on those worktree states, and `runPairedPush` (`commands/user/paired-push.ts`) skips notes when the
  branch push fails. The flip deletes that reason, so the state leg goes first and stands alone. Under the rules shipped
  for the flip, a task capture may already name an unpushed commit: task close checks local reachability only
  (`explicitCommits`, `lib/work-unit/verbs/task-close.ts`), the import derives captures from local tips
  (`importTaskCaptures`, `lib/store/ref/import/code-captures.ts`), and a capture's copy key (`computeCopyKeys`,
  `lib/git/copy-key.ts`) survives a rebase that leaves the patch text unchanged, so the cut changes no reader. Sync
  still pushes the branch; sync that publishes state only, with handoff's own branch push, stays with the `USER-INBOX`
  capture named under Resolved.
- **The capture gates onto `arc inbox`** (#11). `create-spec`'s owner's pass, `activate-work-unit`'s pre-condition gate,
  and the start of `verify-work-unit` dispatch on `arc user inbox-list --target <slug>` (`handlers/user-inbox-list.ts`,
  `lib/user-sync/inbox-target.ts`), which lists the personal-inbox captures whose `WU_Target` line names a work unit,
  held or not. From the flip `arc inbox <list>`, for `personal`, `project`, or a work item's slug, replaces it:
  `--target <slug>` keeps the `clear` / `named` / `refused` result with each row's ID and version, and
  `arc inbox <slug>` lists a work unit's inbound list with its pending count and oldest age (`spec-seam-locus.md`
  § 7.1). Its dormant arm is `DormantStoreCommand`'s `inbox` (`commands/store-command-support.ts`). The three gates move
  onto it. Since `spec-storage-contract.md` D11 routes captures straight into a work unit's inbound list and retires
  owner adoption, each gate also reads the work unit's pending inbound count, which session-init orientation already
  carries. The inbox writer and the `user inbox` mutations survive; `arc user inbox-list` is inert from the flip, and
  its removal goes to `cutover-notes-removal` (`spec-seam-locus.md` § 1.5).
- **No tracked or installed file in a projected root** (#18, #26, #32). From the flip `.arc/active/`, `.arc/backlog/`,
  and `.arc/completed/` are projected roots. Today they hold tracked files the import turns into records, and the
  installer writes three files there (`init-recipe.json`'s `pm.mode == arc-in-git` arm). `completed/README.md` is a
  Configurable file that `arc update` reinstalls; no record claims it, so it stays unadopted and every checkout removal
  refuses over it until it is deleted. `backlog/ROADMAP.md` and `backlog/ATOMIC-INBOX.md` come from Scaffolded
  templates. ATOMIC-INBOX is installed at the path the projection writes the project inbox to, so an install there
  writes over a projected file; ROADMAP is installed at the layout's `project-document` address
  (`lib/layout/projection.ts`), which no record claims and the projection never adopts, so an install there writes a
  file into a projected root that is never a stored or projected file (the register's ROADMAP row). The flip:
    - untracks the shared roots' files once their records are imported;
    - deletes the ROADMAP and ATOMIC-INBOX templates and `completed/README.md` outright, with their `init-recipe.json`,
      `SCAFFOLDED_FILES` and `CONFIGURABLE_FILES` (`lib/classification.ts`), and `manifest.json` entries, rather than
      relocating them within `arc/`, moving anything kept for another purpose outside `arc/`. The tests that read them
      change with them, among them `integration/store-project-inbox.test.ts`, `integration/init.test.ts`,
      `unit/init.test.ts`, `unit/manifest/plan.test.ts`, `unit/lib/store/kinds/entry-reference.test.ts`,
      `e2e/init.e2e.test.ts`, and `e2e/reconfigure.e2e.test.ts`, as does `strategy-file-classification.md`'s example of
      a template's suffix stripped at install. `integration/scripts/verify-integrity.test.ts`'s clean fresh install
      changes with the presence test's removal below. `adopter-install-authority` implements the day the flip lands,
      against the post-flip shape: it replaces `include_files`, `SCAFFOLDED_FILES`, and `CONFIGURABLE_FILES` with one
      claims table in `init-recipe.json`, and every file under the package's `arc/` must then carry a claim, with no
      not-installed list, so a template the flip kept under `arc/` but stopped installing would fail its coverage check
      (`spec-adopter-install-authority.md` § 1.3, § 2, and § 4, on its planning branch). The recipe's structure stays as
      it is for that rebuild;
    - removes `verify-integrity.sh`'s presence test for `ROADMAP.md`, in both copies. This is the first step of
      `seam-status-roadmap`'s two-step ROADMAP removal: each piece acts once no ROADMAP file exists, the installer
      writing the template into a projected root, `arc health` reporting the manifest entry missing, and the presence
      test failing (`spec-seam-status-roadmap.md` § 9.4). Status's and `arc view`'s store versions are built dark
      before the flip. The second step, the in-repo arms, `DERIVED_VIEWS`, and the remaining ROADMAP paths, follows in
      `cutover-tracked-state-removal`, and the layout's `project-document` address stays past it for the projection's
      rule that never adopts a file left from before the flip. Removing `arc hook-remedy-roadmap-conflict` waits on
      every live branch's refreshed pre-commit hook (`cohort-storage-cutover.md`).
- **The `.internal/` records untracked** (#3; Owner, 2026-11-05). The flip extends the untrack beyond the projected
  roots to the Candidate, integration-boundary, and transition records under `.arc/system/.internal/` (`candidates/`,
  which holds a work unit's `<slug>.boundary.json` beside its Candidate record, and `transitions/`). Nothing breaks if
  they stay, since none of the three kinds is projected (`review/candidate`, `review/integration-boundary`, and
  `lineage/transition` in `KIND_MECHANISMS`, `lib/store/registry.ts`), but they would mislead: stale copies of
  authority-bearing records in every checkout while the store moves on. And a missed in-repo reader then fails on the
  missing folder, which Stage 2 surfaces, rather than reading plausible stale state and passing. Only the data goes; the
  in-repo code that reads and writes it stays for `cutover-tracked-state-removal`. `live-transition-records.test.ts` and
  its ARC contract tier selection (`lib/local-vitest-runner.ts` and its unit test) go here, since the test fails on the
  missing folder.
- **`arc store` un-hidden and documented.** It is registered hidden until the flip
  (`program.command("store", { hidden: true })`, `cli.ts`), and `spec-storage-ref-backend.md`'s expected contract for
  the cutover un-hides and documents it (§ Cross-cutting Considerations, "Migration and rollout"). Its documentation
  joins QUICK-REFERENCE's verb index (§ The workflow rewrite).
- **`arc init`'s state remote and project ID** (`spec-storage-ref-backend.md` § 9.2, § 9.8). From the flip `arc init`
  sets `push` on the code remote at creation, where one exists, and mints the project ID into the registry's
  create-only identity record, pulling first and adopting an ID it finds where a remote is already designated. Both are
  expected contracts wired with `arc init` at the flip; today `commands/init.ts` does neither, and a fresh install after
  the flip, CineXplorer's among them, needs both. This repository takes its ID from the import.
- **The Errand branch's UID suffix** (Owner, 2026-11-06). From the flip `arc errand open` names the Errand's branch
  `<type>/<slug>-<suffix>`, its type one of `ERRAND_BRANCH_TYPES` (`lib/errand/branch-type.ts`) and the suffix eight
  characters from the Errand's UID, and records its branch link with that ref, as the storage-coupling register's fate
  for the Errand identity refs and `spec-storage-ref-backend.md` § 13.3 hand to the flip's rewrite of the Errand verbs.
  Today `lib/errand/open.ts` and `lib/session-init/errand-branch-cut.ts` build `<type>/<slug>`, and
  `spec-seam-locus.md` § 8.2's link names it. The exact-match checks change with the builders: the identity record's
  branch validation (`lib/errand/identity-record.ts`) and resume's recorded-branch check (`lib/errand/open.ts`). The
  import's created-branch test (`lib/store/ref/import/code-links.ts`) reads only names from before the flip and stays.
  The suffix keeps two same-slug Errands from different clones off one remote branch, and that register row closes
  with it.
- **The status help text** (`spec-seam-status-roadmap.md` § 2.4, § 12). The status flags' help text in `cli.ts` and the
  `status` help notes in `lib/cli-help-content.ts` describe today's arms until the flip, which rewrites them for the
  arms from the flip.
- **The flip's Markdown notice** (#27; `spec-projected-markdown-checks.md` § 1.4 and § 7.3). It tells a project how
  its Markdown checks change: one listing through Git or reading the index stops seeing state, while one globbing from
  disk keeps reading the shared roots, which the projection excludes only through `.git/info/exclude`, conflict-marker
  files included, and a fixer among them rewrites projected files that write-back persists as hand edits. It tells the
  project to hand each Markdown tool exactly the paths it should read, Git's list for tracked files and the selection
  through a `selection` check for state, and that link-target existence over state leaves the shipped hook, kept by
  declaring `validate-links.sh` as a `selection` check.
- **The Markdown fix's end-to-end test** (`__tests__/e2e/markdown-fix.e2e.test.ts`, driving `lint:md:fix` through
  `src/scripts/fix-markdown.ts`). It relies on an empty selection from the Markdown checks' one reader,
  `readProjectedSelection` (`lib/checks/projected-selection.ts`), which `projection-write-back` connects (§ Named
  assumptions on unlanded members). Once connected, a script that runs no `arc` start reads the capability of the store
  `createStore` builds: over the in-repo implementation it returns an empty list and runs no subprocess, but over a
  store answering true it runs `npx arc selection --json`, and every failure, a refusal or a stale build among them,
  maps to `unavailable`, as the connected body on `projection-write-back`'s branch reads the capability before running
  the command. Once the flip makes the fixture's store answer true, the test, run with no projection and no start, would
  see the fixer refuse with `markdown.selection-unavailable` (`resolveMarkdownFixCorpus`, `lib/markdown/fix-plan.ts`)
  rather than read an empty selection. Stage 2 runs it over the flipped store, and the flip either seeds a projection
  for its fixture or changes its expectations to what the connected reader reports there.

### The workflow rewrite

ARC's process changes once, at the flip (`storage-contract`, Owner 2026-09-30), so the flip rewrites every affected
workflow step, and the always-loaded process text agents act on, from the consumer map's end states
(`notes-storage-contract.md`), each step checked against `strategy-procedure-evolution.md`. The register's row
"Workflow steps commit state with `git`" moves here, and its fate sets the shape: a commit step that carried only state
becomes `arc save` or goes, the ROADMAP hand-render steps and their refresh commits go, a ceremony that also changes
tracked files keeps a commit step for them, and the task loop closes through the close verb. The consumer map's rows
are the floor of the site list, its workflow, skill, method, script, and setup rows among them, whichever member owns
the row, since each seam left its text change to this rewrite (`spec-seam-locus.md` § Non-Goals;
`spec-seam-delivery-review.md` § 14.2). They are not the whole of it: the map leaves verify's text to "the documentation
pass", which the whole rewrite at the flip supersedes (Owner, 2026-11-03), and it misses method and lifecycle steps the
flip makes false. The spec takes the complete list from a sweep of the shipped workflow, method, skill, and rule text
against what the flip changes: tasks closing after their commit, store writes in place of state commits, branchless
planning, and passes recorded in the store. The items below are what a decision, an inbound item, or a shipped
specification's hand-off to the cutover adds to the map, or where the map leaves the change implicit (planning review,
2026-11-06).

- **The save cadence** (H5; Owner, 2026-11-05). `arc save` clears each projected file's changed mark, except on a file
  still holding an edit the store lacks, so until a workflow saves per increment, `--changed` spans everything since
  the last save; both projection specifications leave the cadence to this rewrite (`spec-projection-write-back.md`
  § 11.7, `spec-projection-worktrees.md` § 11.7). A state-only commit step becomes a save per review increment, at each
  approval gate's commit, so the selection a ceremony checks matches the increment.
- **Ceremony check requests and the relocatability rule** (#27; `spec-projected-markdown-checks.md` § 1.4). Before the
  flip, every ceremony that commits or saves only state requests `arc check increment` over the state it authored,
  before its approval stop for what it writes before the stop, and before its commit or save for text written after it
  or where it has none, keeping its existing lint step; handoff names a failure in work it leaves unfinished in its
  notes rather than stopping to ask. The rewrite that turns a state-only commit step into `arc save` keeps each request
  and lint step before the save. The relocatability rule in `DEV-RULES.ARC.md` § `.arc/` artifact references is
  rewritten onto the movable set: from the flip every work-item and cohort record is movable, its path varying by
  lifecycle and by checkout (`active/current/`, `active/in-flight/<slug>/`, `completed/`), while personal records and
  the project inbox keep one path (§ 2.1). ARC's link rules, a write check at write-back and `arc save`, follow it. The
  rule's rewrite moves here from `cutover-documentation`, whose scope listed it, since it is always-loaded text the flip
  makes false (planning review, 2026-11-06).
- **The task loop** (#12, #21). From the flip `arc task close` closes tasks after the commit and captures their commits
  (D16), and `arc release commit --close` runs it at the commit fire site under the approval that covers work and commit
  (`spec-seam-lifecycle.md` § 9; Owner, 2026-10-12). Today the loop marks `[x]` before the commit, runs the quality
  request over that completion edit, and removes the `[x]` and the completion note on red. The rewritten loop writes no
  `[x]`, so a red segment request removes the completion note alone, and the pre-report checklist's "Task marked [x]"
  line goes, the verb's result standing as the record; the completion note stays the agent's hand edit before the gate;
  deferred review closes its range in one call; and a hand `[~]` becomes `arc task defer` (§ 9.5), deactivate's
  partial-scope `[~]` among them (`deactivate-work-unit.md`, its Case B). Delivery's correction
  acknowledgment, which closes the task mid-protocol and then resumes, is reordered around the close. No extension step
  reorders: `retire-extension-points` removed `post-task-completion` outright. The loop's Crash Recovery reads state and
  workflow continuity from the store's version, changes, and history, keeping its `HEAD`, recent-commit, index, and
  working-tree probes and its mismatch handling (consumer map).
- **Pause and resume** (#13). From the flip `arc pause` and `arc resume` replace `arc park`: a pause is a record on the
  work item, not a move, and the checkout stays unless released (`arc locus release`); the pointer record, park from
  Planning's landing, and the parked position retire (`spec-seam-lifecycle.md` § 8.1, § 8.9; Owner, 2026-10-12). The
  two workflows shrink to the verbs.
- **The lifecycle verbs** (#6, #16):
    - every step that hand-edits `Class` moves onto `arc set-class`, or a shipped `--class` flag where one covers it;
      none covers activate's Step 3, init's post-init ratchet, a new work unit's resolution, init's Errand-promotion
      step 6, or draft-design's capture, while `arc promote --class` covers promote's Step 2 (`cli.ts`;
      `spec-seam-record-kinds.md` § 5.4; `spec-seam-lifecycle.md` § 10). `resolve-planning-depth`'s rule deferring a
      ratcheted `Class` to the stage's planning-ceremony commit becomes the stage's `arc set-class` at its save;
    - the steps that hand-edit `Branch`, deactivate's Case C and init's re-run, move onto verbs;
    - the cohort template's "convenience pointer" note on `Parent` is rewritten, since `Parent` becomes the cohort's
      stored nesting;
    - where the rewrite takes `inbound-routing-method`'s from-the-flip binding for the `route-discovered-work` method,
      the `_Routed from:_` line's date moves to `_Created:_`;
    - `Owner` turns verb-owned, so the person-to-person handoff's hand edit in `session-handoff.md` moves to
      `arc handover`, and `init-work-unit.md`'s step preserving the stub's `Owner` goes, since starting a stub records
      the starter (`spec-seam-lifecycle.md` § 8.5);
    - activation's result names the old name's remote deletion as a typed action only for a branch link recorded
      `created` (`spec-seam-lifecycle.md` § 5.1, § 6.1), so `activate-work-unit.md` Step 4 runs the actions the result
      names rather than its raw `git push origin --delete`; deactivation keeps the work branch, so
      `deactivate-work-unit.md` Step 3's remote delete goes (§ 8.8).
- **The identity verbs** (H1). `cohort-identity-verbs` adds `arc cohort close`, `arc cohort remove`, and
  `arc rename <slug|uid>` for work units and cohorts, and UID operands for `arc errand close` and `arc errand abandon`
  (`spec-cohort-identity-verbs.md` § User-facing impact). Before the flip, `arc cohort close` and `arc cohort remove`
  refuse `unsupported` through `runDormantStoreCommand` (`commands/store-command-support.ts`), naming today's route:
  edits to the tracked cohort files, and archive's sidecar sweep (its § 10). From the flip write-back cannot rename a
  cohort, since each edited file persists as its own write. Every workflow step that renames, closes, or removes a
  cohort by hand edit, or resolves a clash by hand, moves onto the verbs; that specification leaves every workflow
  change to the flip (§ Non-Goals, "Workflow text").
- **Delivery and review** (#23; `spec-seam-delivery-review.md` § 12.6 and § 14.2):
    - `integrate-work-unit.md`, `prepare-work-unit.md`, and `verify-work-unit.md` drop their record-commit and
      keep-staged steps, since from the flip delivery makes no record-only commits and its next actions name no
      `commit-*` step (§ 14.3). Attest's commit step, and the one after a fix's response, stay for the review copy
      alone, which `arc attest` writes and `arc review respond` re-exports when a fix amends the spec
      (`exportCandidateResponseDesign`, `scripts/review-gate/runtime/respond-command.ts`), as
      `spec-storage-contract.md` D15 keeps a commit step for any ceremony that changes tracked files (§ 12.5).
      `deliver-stack.md`'s step committing a returned `commit-selection` goes likewise (§ 14.2);
    - `verify-work-unit.md` saves the verification task's edits, which from the flip are projected records, closes the
      task with `arc task close`, which closes a task that produced no commit (`spec-seam-lifecycle.md` § 9.2), or with
      `arc release commit --close` where verification changed tracked files, and then runs `arc attest` over that
      head, its review copy riding attest's commit step. Today it marks the task `[x]` by hand and attests the staged
      subject before the verification commit, and attest refuses a task list that is still open (`no-open-task`), so
      with tasks closing after their commit the order turns round and the staged-subject wording goes (consumer map);
    - archival becomes a store write in both cadences, so the archive commit and its push go, while
      `integrate-work-unit.md`'s step-8 dispatch keeps both arms: under `with-integration` integrate archives before
      the merge and the landing writes the landing-commit link, and under `manual` archival follows the merge
      (`spec-seam-locus.md` § 2.1, A26). Under `manual`, integrate still hands archival to `archive-work-unit.md`'s
      standalone route after the merge, whose archive becomes a store write; only that route's archive commit and its
      push go. Integrate's `arc user close` backstop goes too (consumer map). A26, shipped after the consumer map,
      corrects the map's integrate row, which removes the step-8 dispatch, and its configuration row, which retires
      `archive.cadence`: the key keeps selecting the arm;
    - the pass record moves onto `arc review adversarial record` rather than an append to `ADVERSARIAL-PASSES.md`:
      `planning-review.md` § Findings and pass record, and the adversarial-review method's § Pass record;
    - review reports, chunk reports, aggregate results, and evaluator reports among them, go to the work unit's scratch
      folder rather than its workspace, so archive's sweep loses nothing, and the adversarial-review method's § Kept
      prompts and reports, which keeps them in the workspace until archive sweeps it, names the scratch folder;
    - the step that opens a work unit's pull request (`gh pr create`, `integrate-work-unit.md`) becomes a verb that
      writes the work item's change-request link, its repository the project ID; today no verb writes that link, and
      archive records the pull request only as the meta's `PR URL`;
    - a candidate-tail step deletes D18's review copy at `.arc/specs/<slug>/` through that member's export function,
      which `arc attest` (the add) and `arc review respond` (the re-export, when a fix amends the spec) call from the
      flip; candidate-tail is a workflow step, so the delete needs a step of its own. D18's re-export "as an ordinary
      reviewed fix" reads through that specification's forward amendment (§ 13, item 5): the copy is evidence-neutral in
      every direction, so the re-export rides its fix's review without entering the subject. The arm that keeps the
      delete from reopening review stays in lifecycle classification (`classifyPathTreatment`), as D18 states, since
      subject construction cannot carry it: the copy is never in base, so its delete leaves no path in the base-relative
      diff. Its correction against the consumer map is in `notes-seam-delivery-review.md` § Corrections across rows, and
      keeping it through the deletion pass is `cutover-tracked-state-removal`'s, with `delivery-observe-attest`'s open
      question on the copy in a stacked delivery.
- **The decomposition workflow** (#25). `decompose-work-unit.md` takes `seam-decomposition`'s end state: an additive
  batch replacing dispatch, authoring, one distribution approval, and the terminal batch as the landing, with today's
  separate finish-preview stop gone (`spec-seam-decomposition.md` § 16).
- **Session-init** (#37). `session-init-agenda` compiles every surface the cutover retires in one module
  (`spec-session-init-agenda.md` § 7): the notes load (§ 7.1, `commands/agenda/notes.ts`) and the in-place materialize
  before the flip (§ 7.2, `commands/agenda/legacy-materialize.ts`). The rewrite deletes that module, moves the
  compiler's freshness anchor to the store state version, and then rewrites what § 7.3 names, since session notes come
  from the meta's session context after the flip: the spine's SESSION-NOTES authority boundary, which covers its
  thought-state lines and the Blockers line it withholds auto-proceed on; `assess-start-readiness`'s check that the
  seeded mini-handoff landed, which then reads the spawned work unit's session context; the compiler's SESSION-NOTES
  field reader (§ 4.9); the `git log` render for an absent SESSION-NOTES (§ 4.3), which then fires on an empty session
  context; and `discover-next-work`'s `.arc/backlog/` and `.arc/active/` reads, since discovery then reads the
  projected backlog or a list verb. `session-init.contributor.md` is gone with the contributor layout, so no
  contributor variant is left to rewrite.
- **The personal surfaces and routing** (`spec-seam-locus.md` § 16, the cutover's share):
    - session-init dispatches each slot's `actions`, the shared remedy shape every condition wanting a repair carries
      (§ 4.3). § 12.4's swap of the orphan branch's prose `git branch -d` for the sweep's published action shipped
      with `session-init-agenda` (`spec-session-init-agenda.md` § 6.3; `withOrphanActions`,
      `lib/session-init/orphan-branch-sweep.ts`), so it leaves the rewrite;
    - hold-and-route's binding and hand-off sites move onto `arc route` (§ 7.9): `route-discovered-work`'s binding
      section, `arc-inbox`'s route-now step, `arc-errand`'s route shape, and `run-errand.md`'s route-only Errand
      (`spec-inbound-routing-method.md` D8, its rewrite sites), with `drain-inbox.md`'s grooming change and owner
      adoption;
    - activation's workspace step goes, since `arc user open` (`handlers/user.ts`) refuses `unsupported` from the flip,
      naming the meta's session context (§ 2.8);
    - handoff's `SESSION-NOTES` write becomes `arc handoff write` (§ 9.1), and every step naming `arc user save` names
      `arc save` (`spec-projection-write-back.md` § 18);
    - `session-handoff.md`'s sync section loses its paired push, its notes legs, and the notes-drift surface; its
      `Commit at Handoff` anchor becomes the store's state version, and its `git show <hash>:<meta>` restate reads
      `history` (consumer map);
    - the new settings are documented in the shipped configuration template (§ 14).
- **The inbox and the Errand queue** (`spec-storage-contract.md` D11; `spec-seam-locus.md` § 7.6, § 7.7, § 14):
    - each step that removes a routed capture by its title, `arc user inbox-remove` in `create-spec.md`,
      `activate-work-unit.md`, `verify-work-unit.md`, and `drain-inbox.md`, removes it by `--id` and
      `--expected-version`;
    - `drain-inbox.md`'s execute-bound marks become `arc errand queue set`, and `--from-inbox` takes
      `<personal|project>:<id>` in `drain-inbox.md`, `run-errand.md`, and the `arc-errand` skill, each refusing a title;
    - `run-errand.md` takes an Errand's goal from its entry's description, an Errand's start takes the entry off the
      queue and its abandon returns it, and the next offer is the head of the person's Errand queue rather than the
      next execute-bound sibling in file order; the task loop's Atomic Task Completion follows D11's full Errand close
      and partial removal by ID and version (consumer map);
    - `assess-draft-readiness`' third criterion reads the work unit's inbound list, empty meaning drained, rather than a
      buffer section the import has emptied, so readiness never passes a draft over stranded entries
      (`spec-inbound-routing-method.md`).
- **Branchless planning and grooming from any checkout** (`spec-storage-contract.md` D13, D17; `spec-seam-lifecycle.md`
  § 6.3). From the flip a work unit plans with no `plan/` branch, and a stub is groomed or the inbox drained from any
  checkout, so the prose for planning and grooming branches goes: `draft-design.md`'s grooming-branch redirect and
  groom-and-stop's commit-and-push pause; `create-spec.md`'s planning branch; the `plan/` steps of
  `activate-work-unit.md` and `deactivate-work-unit.md`, deactivate's Step 5 among them; `init-work-unit.md`'s
  base-parity and write-context preconditions, and its steps that name the `plan/` branch's purpose, push it, and seed
  SESSION-NOTES; the `branch-format` method's `plan/` prefix, whose `[invariant]` ties it to `State: Planning` and
  session-init's branch-pattern fallback; `drain-inbox.md`'s grooming branch and pull request; and the `arc-housekeep`
  skill's write-context precondition. Removing the draft becomes a record delete at create-spec and
  stays inside the verb at activation, since `git rm` fails on an untracked projected file (consumer map).
- **Other skill, method, and setup text** (consumer map): the `arc-commit` skill's meta-file rule; the `commit-format`
  method's ceremony-commit wording; `initial-setup/01_verify-and-configure.md`'s `user.notes_push` text; the
  `arc-task-review` skill's comparison of a task list against Git, which reads its prior version through `history`;
  and the `arc-inbox` skill's USER-INBOX rooting text.
- **The errata convention** (H4; Owner, 2026-11-05). `archive-work-unit.md` § Post-`Shipped` errata convention says
  "git history is the lock", which misleads once a shipped meta is a stored record: a correction becomes a write to the
  completed item, and its history is the store's history of the archived meta (`spec-projection-write-back.md` § 8.4).
- **The planning-lane prose.** `run-errand.md`, `drain-inbox.md`, `setup-merge-gate.md`, `draft-design.md`'s "Ship
  instead of pause", and `initial-setup/01_verify-and-configure.md`'s planning auto-merge lane steps arm auto-merge on
  `arc review planning-lane`, or claim the routing exemption through `arc review planning-grooming resolve`, as does the
  planning-grooming lane selection in `route-discovered-work`. Both commands answer `reviewed` or `not-eligible` once
  state is untracked (`classifyPlanningLane`, `lib/change-facts.ts`, where an empty planning set answers `reviewed`;
  `ineligible`, `scripts/review-gate/policy/planning-grooming-command.ts`), so the steps would never fire again, and the
  rewrite drops them.
- **`generate-tasks`' pre-save step.** § Finalize the task list's "run the project's task-list validator", over
  "tracked and untracked files", names the save, whose task-list write check covers a task list from the flip
  (`checkTaskListSegmentation` and `checkTaskListDescriptor`, `lib/store/kinds/task-list/shape-rules.ts`; Owner,
  2026-11-06). The validator today is `lint:md:descriptors`, which lists through Git with untracked files included
  (`runWorktreeTaskDescriptorLint`, `lib/markdown/descriptor-worktree.ts`, through `enumerateTrackedMarkdownPaths`'s
  `git ls-files --cached --others --exclude-standard`), so it checks a new task list before the flip, and from the
  flip `.git/info/exclude` hides every projected task list from it. The check stays for the task-list template it also
  lints, which the commit gate's staged check covers too, and only its task-list selector goes dead, as
  `draft-cutover-tracked-state-removal.md` § The per-check sort has it (planning review, 2026-11-06).
- **The always-loaded text:** every sentence in `AGENT-BRIEF.ARC.md`, `DEV-RULES.ARC.md`, and QUICK-REFERENCE's verb
  index that the flip makes false (Owner, 2026-11-06), each edited in the package source and synced to `.arc/`:
    - `AGENT-BRIEF.ARC.md`'s Locus definition (#14), in the package source and synced to `.arc/reference/briefs/`. A
      WU-owned locus "is exclusive from spawn, materialization, or explicit `--here` entry through exact teardown";
      from the flip `arc locus release` also ends that role, releasing a paused work unit's checkout for its owner or a
      checkout whose work unit another identity owns, and for an anchored checkout only the marker
      (`spec-seam-locus.md` § 5; Owner, 2026-10-12). The sentence becomes "through exact teardown or release", and
      `resume-work-unit.md`'s sibling sentence follows. The definition's role "derived from its marker, tracked
      lifecycle, transient identity, and Git topology" derives from the marker and the store (`spec-seam-locus.md`
      § 2.1);
    - `AGENT-BRIEF.ARC.md` § How ARC Works, which names the state files as `meta-{name}.md` (tracked, `active/`) and
      `SESSION-NOTES.md` (gitignored); from the flip the meta is a stored record and session notes are its session
      context (`spec-seam-locus.md` § 2.8);
    - `DEV-RULES.ARC.md` § Commit Discipline's task-list accuracy, which marks the parent `[x]` and stages the task
      list with the commit, and its meta-file timing and meta-file commit shape, which commit a meta edit with its
      ceremony or alone as `chore(arc):`; from the flip the close verb closes tasks and the meta is saved. § Atomicity's
      "commit shared documentation (task list updates) last" follows them;
    - `DEV-RULES.ARC.md` § Handoff's "SESSION-NOTES.md (gitignored) is written only at handoff", and § Write for the
      reader's "author's workflow continuity, which belongs in the active WU's `meta-{name}.md` and SESSION-NOTES";
    - `DEV-RULES.ARC.md` § Review-Increment Invariant, reworded to say that after the flip a persist is a save, not a
      commit under the invariant, with the gates staying on lifecycle transitions, stage advances, task closes, and code
      commits, and no further (`spec-storage-contract.md` D15, "Approval"); its bounded exception's archive composition
      and readiness regeneration, which from the flip are store writes or go with the ROADMAP's hand render, follow;
    - `DEV-RULES.ARC.md` § `.arc/` artifact references' relocatability rule (above);
    - `DEV-RULES.ARC.md`'s rebase scope, whose reason, that rewriting published commits orphans the SHA-keyed Git
      notes, stops holding once notes retire. The flip drops that reason and keeps the invariant; relaxing it under
      `history.policy` is `history-policy`'s, which depends on this unit (the register row "The append-only rebase
      invariant", owner `storage-cutover`);
    - QUICK-REFERENCE's verb index, which calls itself the full index: it gains the verbs that start at the flip, among
      them `arc handover`, `arc task close` and `arc task defer`, `arc save`, `arc locus release`, `arc inbox`, and
      `arc materialize`, and `arc pause` replaces `arc park` (`spec-seam-lifecycle.md` § 19); `arc store` joins it; its
      `arc start` line's `plan/<name>` goes, since work units started from the flip plan with no branch (§ 6.3); and
      the notes verbs and `arc sync`'s direction semantics change with the rewired sync (§ The flip change).

### ADR dispositions

Every decision this draft settles, against `strategy-adr-methodology.md` § When to Write an ADR (2026-11-06). An open
question takes its disposition when it settles.

**This unit delivers two amendments to ADR-035** (Owner, 2026-11-06), each a dated amendment in its § Amending This
Document, as the 2026-09-29 amendments refined items 2, 4, 7, and 10. `strategy-adr-methodology.md` sends a change to
the Decision section to supersession; these stay amendments because each refines a mechanism inside an item, as the
2026-09-29 amendment refined item 2's push mechanics, while the decision itself, state in `refs/arc/*` with notes
retired through a one-time import, stands:

- **Item 8:** the old notes ref is kept on the importing machine under a namespace that is neither a tag nor pushed,
  rather than as an archive tag, since `git push --tags` would publish every past personal note from a public
  repository, and `cutover-notes-removal` deletes it with the notes residue refs (§ Notes retirement).
- **Item 2:** `arc sync` publishes state first and alone, whatever its branch push's outcome, and reports each
  separately, rather than carrying state in the branch's `--atomic` push, so a slow or failing push gate no longer holds
  state back; a task capture may already name an unpushed commit, so no reader changes (§ The flip change).

**Covered by an ADR already on the base branch:**

- the whole workflow rewrite landing once, at the flip, and the quiesce, import, and flip window, rehearsed first:
  ADR-035 ("a single cutover per repository", "a quiesce → import → flip window, rehearsed first");
- designating `origin` as the state remote: ADR-035 item 2's same-repository default, with this repository's personal
  state published beside its project state (Owner, 2026-10-10);
- untracking the `.internal/` Candidate, integration-boundary, and transition records, and leaving no tracked or
  installed file in a projected root, the three templates' deletion and the ROADMAP template's removal among it: ADR-035
  item 3 (no tracked operational-state tier remains; ROADMAP and status surfaces are derived, never stored) and item 6
  (the projection at the familiar paths);
- `generate-tasks`' pre-save step naming the save, whose task-list write check covers task lists from the flip:
  ADR-035 § Consequences ("ARC's own checks over work-unit artifacts run where state is written");
- a save per review increment: ADR-035 item 6, whose firing points include increment close;
- `arc sync` rewired onto `pull` and `push`, and notes retiring through the import, last in the window: ADR-035 items 2
  and 8, as amended above;
- the rebase rule kept past the flip, its notes reason dropped: ADR-025, whose invariant gives way only to ADR-035 item
  9's configurable history policy, which `history-policy` builds.

**`none`, temporary:** one-time window machinery, done or deleted once the window closes. The rehearsal's two stages,
copy safety, chain comparison, accounting case, abort exercise, and canaries; the quiesce, its check and the refs it
records for the abort, and the sealing guard; the window's order, the flip's own landing by an Owner-directed merge, and
its abort and recovery, fixing forward after the merge; no separate import rerun, A4's selection kept out of the
window, and the pre-flip build the window imports from; the in-repo override and the flip build's refusal over an
unimported repository, both deleted with the in-repo implementation; and the pre-meta backfill.

**`none`, not this unit's decision:** the flip applies text a shipped or approved specification settled, whose own
disposition stands. The task loop, pause and resume, the lifecycle and identity verbs, the delivery and review steps,
the decomposition end state, and the session-init module's deletion; the capture gates onto `arc inbox`, the Locus
definition, `arc store`'s un-hiding, and the Markdown notice; the personal surfaces and routing onto `arc route`,
`arc handoff write`, and `arc save`; the invariant's reword (`spec-storage-contract.md` D15), branchless planning's and
the inbox verbs' text, `arc init`'s state remote and project ID, the Errand branch's UID suffix, which the register's
fate settled, and the status help text; the quiesce check's refusal of an unlanded staged cut
(`spec-seam-decomposition.md` § 18); `RELEASE-GATES.md`'s landing rules retiring, which the register's row settled; the
errata convention's content (`spec-projection-write-back.md` § 8.4); the ceremony check requests and the relocatability
rule's movable set (`spec-projected-markdown-checks.md` § 1.4); the other always-loaded edits, each following a decision
above or a specification it names; and the planning-lane prose, dropped as a consequence of untracked state.

**`none`, meeting none of the five criteria:** planning structure and tactical choices. The cut and the carve, the rule
for what lands at the flip and the per-check sort, the items moved between members (#3, H4, and the relocatability
rule), and the flip asking nothing of the projection members beyond their specifications; `lint:md:descriptors` kept for
the task-list template; the flip's one repository (#29); no fix before the flip for the partial-protection planning
entry (#31); and the Markdown fix's end-to-end test.

---

## Unknowns and Assumptions

### Named assumptions on unlanded members

Each assumption is written against the named specification section and re-checked when that member lands.

- #2, the end-to-end workflow rewrite and quiesce: `projection-write-back`, for `arc save` and write-back's first
  real run (§ 18).
- #5, each hand-editable kind's parser and entry shape: `projection-write-back` § 7.6 and § 18.
- #18, no tracked or installed file in a projected root: `projection-write-back` § 9, `projection-worktrees` § 12.2
  and § 18.
- #27, the movable set, the ceremony check requests, and the notice: `projection-write-back` § 7.6, for link rules in
  each kind's check, and § 11.7.
- The Markdown fix's end-to-end test: `projection-write-back`'s Task 2.12 (`tasks-projection-write-back.md`) connects
  `readProjectedSelection`, which today returns an empty list unconditionally (`lib/checks/projected-selection.ts`). The
  test's break at the flip rests on that member's connected body, which reads the capability of the store a command
  builds before a script runs `arc selection`, returning an empty list over the in-repo implementation, as its § 11.7
  states.
- `generate-tasks`' pre-save step: write-back and `arc save` call each kind's registered write check
  (`spec-projected-markdown-checks.md` § 1.4, available with the projection).
- #25 and #28, the decomposition rehearsal cut: `storage-ref-hardening` § 10, for copied-companion naming. Re-checked
  against it as landed (2026-11-04, #1271) and holding: `copyCoordinates` (`lib/decompose/scaffold-copy.ts`) names each
  copied companion with `companionStoredName` (`lib/store/companion-name.ts`), and the additive report returns that
  stored name (`reportDecomposeAdditive`). Its A3 keeps Design admission to a member's own conventional draft, spec,
  or paired-spec names (`checkMetaDesignEntry`), so the representative cut copies a verbatim-keyed companion, as the
  hardening's native case does with a nested notes companion, and gives each member a conventional Design, never a
  verbatim one.
- #32, removing the projected-root install entries: `spec-adopter-install-authority.md` § 1.3, § 2, and § 4, on its
  planning branch.
- H1, the identity verbs' workflow changes: `cohort-identity-verbs` § Non-Goals ("Workflow text") and § 10.
- H4, the errata convention onto the archived meta's store history: `projection-write-back` § 8.4.
- H5, how often the save anchor moves: `projection-write-back` § 11.7, `projection-worktrees` § 11.7.

Item #32's member depends on this one, so its assumption constrains this unit downstream rather than gating it.
Item #19 rests on `spec-projection-substrate.md` § 12.7, which has landed.

### What the flip needs from the projection members

Nothing beyond their approved specifications (Owner, 2026-11-05), so no ask reaches either member's spec or task list.
Each item was read against the section it rests on:

- **#2:** write-back § 2.4 builds `arc save`, worktrees § 2.2 and § 2.5 build the fan-out and materialization, and both
  members' § 1.5 name the live rehearsal as this unit's. No CLI process runs over either backend before the flip,
  since `createStore` (`lib/store/create.ts`) builds the in-repo implementation alone, so the rehearsal runs the flip
  change's own build.
- **#5:** write-back § 7.6 leaves the catch to the rehearsal. Every entry kind now declares its grammar
  (`ENTRY_CONFIGS`, `lib/store/kinds/entry-configs.ts`), which resolves the entry-shape half. The projected kinds with a
  ref family and no parser in `PRODUCTION_REGISTRATIONS` are the free-prose ones — `work-item/notes`,
  `personal/document`, and the interim `personal/session-context` — and `personal/errand-queue` has a parser but no
  check. The rehearsal's check therefore requires a parser of each kind with structured content, not of every writable
  kind, narrower than write-back § 7.6 and § 18's "every hand-editable projected kind has its parser"; the divergence
  goes to that member's session to reconcile in its verification (2026-11-06).
- **#18:** both members' § 18 state the flip's duty, and `init-recipe.json` installs exactly three files into projected
  roots: the ROADMAP and ATOMIC-INBOX templates and `completed/README.md`. The gap in § Tracked state the import does
  not claim is the flip's own.
- **#27, and the pre-save step:** write-back § 11.7's selection holds `active/current/`'s task list, read through
  `readProjectedSelection`; the store's write check covers a task list at write-back and `arc save` (§ The workflow
  rewrite).
- **H1:** `spec-cohort-identity-verbs.md` § Non-Goals ("Workflow text") and § 10 leave every workflow change to the
  flip.
- **H2 and H3:** worktrees § 12.8 keeps the user-surface rooting and its migration as in-repo arms, inert from the flip;
  worktrees § 10.5's isolation test runs over the reference backend and guards no pre-flip layout.
- **H5:** write-back § 11.7 clears the changed mark at `arc save` and leaves the cadence to the flip.

### Tracked state the import does not claim

The import reads the in-repo store's records (`lib/store/ref/import/`). That store discovers work items by their meta
files (`collectHeldMetaSources`, `lib/store/in-repo/meta.ts`) and companions beside a meta by the `<word>-<slug>.md`
pattern (`companionNames`, `lib/store/in-repo/paths.ts`, through `artifactMatcher`). A tracked file under a projected
root that no record claims is never imported, and no trial reports it, since an omission refuses nothing. By that code
path, three groups went unclaimed:

- twenty pre-meta work-unit folders — 2025-q4's `01` to `04`, 2026-q1's `01` to `07`, and 2026-q2's `01` to `09` — each
  holding a task list, with a PRD and completion, notes, or atomic files in most, but no meta;
- `completed/2026-q1/completed-atomic-2026-q1.md`, at a quarter folder's top level;
- `completed/README.md`, an installed file the flip deletes (§ The flip change).

Closed cohorts' folders (`<n>a_cohort-<slug>/`) are claimed: the import recovers their archive coordinate
(`cohort-source.ts`). Untracking `completed/` at the flip would have left the first two groups in Git history only.

**They got metas before the rehearsal** (Owner, 2026-11-05), in an Errand landed at `68bddbb526` (PR #1286), so the
rehearsal's import claims them, rather than moving out to a tracked folder beyond the projected roots. One archive keeps
every shipped work unit, and nothing else in the repository reads a second location. The backfill was mechanical:

- one meta per folder in the shape of the earliest archived metas, its values taken from the folder's own files or Git
  history and `—` or `[none]` where neither says, its `Origin` line naming it a reconstruction and any field it
  inferred, with `Design: [none]`, since a meta's design names only its own `draft-` or `spec-` file
  (`checkMetaDesignEntry`, `lib/store/kinds/meta/reference-rules.ts`); each `prd-<slug>.md` imports beside it as a
  companion;
- `tasks-incidental-terminology-refactoring.md` renamed to `tasks-terminology-refactoring.md`;
- `completed-atomic-2026-q1.md` split by its own `Branch:` lines into `atomic-structural-readiness-pass.md` and
  `atomic-structural-validation.md`, in those two work units' folders.

Today's task-list parser accepts all twenty task lists, and no slug clashes with another work unit. The rehearsal adds
an accounting case: it tallies every tracked file under a projected root as imported, deliberately left, or reported,
which catches this class of omission rather than these instances.

Two window steps follow from the same rule. After the import, a pre-flip file left at a projected path is withheld at
its checkout's first materialization, and the persist step refuses over it (`spec-projection-worktrees.md` § 2.5,
§ 12.2):

- each in-flight branch tracks its own `.arc/active/` files, which the flip commit on `main` does not delete, so each
  branch deletes its own after the import, from disk as well as the index, since a copy left on disk is the withheld
  file;
- each checkout's pre-flip workspace folder under `.arc/user/<id>/<slug>/` maps to no record
  (`spec-projection-write-back.md` § 9), so it goes once the import has folded its session notes into the meta and
  moved the rest into `scratch/`.

Two more follow from the flip commit's deletions, each a modify/delete conflict at a branch's next merge of `main`. A
branch whose Candidate or boundary record differs from `main`'s meets the untracked `.internal/` records (§ The flip
change), so it deletes its own copy after the import, beside its `.arc/active/` files, and commits both before it
merges, since a merge refuses an index that differs from `HEAD`. A branch that modified
`.arc/backlog/ROADMAP.md`, as this branch and several planning branches have, takes ROADMAP's deletion when it merges,
so the conflict remedy never renders it back (§ The order).

### The import's part, released

The hold on the import's part lifted when `storage-ref-hardening`'s trial imports (its Tasks 5.12 and 5.13) came back
clean on 2026-11-03. No separate import rerun over current `main` runs before the rehearsal (Owner, 2026-11-05): the
hardening's real-state trials took its place, the last at its final head `6343d32b6c` (`task-8.1-20261105T000620Z`).
Each saved every registered checkout first, bound the review mapping, refused no record, and accounted for every review
source (`notes-storage-ref-hardening.md` § Verification at the final head). A trial places no store and publishes
nothing (`importTrackedState`, `lib/store/ref/import/entry.ts`, reads the repository rather than writing one), so the
build and publication stages first run in the rehearsal's own import, at its head.

The hardening's amendment A4 (its spec § 9.1, notes § A4) adds an explicit selection between competing approval roots
for post-flip recovery when two clones each approve one, with a new selector kind and a preview-and-apply repair
command. None of it enters the window: the import's legacy inputs carry no selector source, so it writes no selector
(`mappingTerminusPassCount` consumes them as they are, the hardening's spec § 9.1); finishing review on every machine
but the importing one (§ The order) leaves no competing root at the window; and the repair is post-flip recovery.

## Dispositions

The Owner's planning pass (2026-11-06) over the inbound entries this draft held, the two moved in from follow-on
members, the three `USER-INBOX` captures naming this unit, one gap the pass found, and one the consolidation found.
Every `fold` is woven into the body at the location named. Each capture is a pre-routed `USER-INBOX` capture for the
named member, which has no session.

| Entry                                                                   | Outcome                   | Fold location                                                                                                                                                                                                    | Reason or route                                                                                                                                                                                |
| ----------------------------------------------------------------------- | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #2                                                                      | fold                      | § The rehearsal, the end-to-end work unit; § The quiesce, the sessions                                                                                                                                           | —                                                                                                                                                                                              |
| #5                                                                      | fold; dismiss entry shape | § The rehearsal, the parser check, for each kind with structured content                                                                                                                                         | Entry shape resolved: `ENTRY_CONFIGS` declares `work-item/description`, `work-item/inbound`, and `personal/errand-queue`                                                                       |
| #6                                                                      | fold; dismiss two parts   | § The workflow rewrite, the lifecycle verbs: Class steps onto `arc set-class` or `--class`, `Branch` edits onto verbs, the cohort template's "convenience pointer" note, `_Routed from:_`'s date to `_Created:_` | `hooks.task_numbering` is held by `draft-cutover-tracked-state-removal.md`'s retired keys; an Integrating unit already takes no route (`route-discovered-work` § Target lifecycle)             |
| #7                                                                      | fold                      | § The order: tidy, notes bundles, reviews finished elsewhere, no buffer or held capture left at import, Errand refs retired by the import; § Notes retirement                                                    | —                                                                                                                                                                                              |
| #8                                                                      | fold                      | § The rehearsal, the chain comparison                                                                                                                                                                            | —                                                                                                                                                                                              |
| #9                                                                      | fold                      | § The flip change, `arc sync`, after `projection-worktrees`: `handleSync` onto `pull` then `push`, dropping the notes leg's call                                                                                 | State publishes first, whatever the branch push's outcome, each reported separately (Owner, 2026-11-06); notes machinery: `cutover-notes-removal`                                              |
| #11                                                                     | fold; capture             | § The flip change, the capture gates onto `arc inbox`                                                                                                                                                            | The inbox writer and `user inbox` mutations survive; `arc user inbox-list` is replaced, its removal captured for `cutover-notes-removal`                                                       |
| #12                                                                     | fold                      | § The workflow rewrite, the task loop: `arc task close` and `arc release commit --close`, `[~]` through `arc task defer`, delivery's acknowledgment reordered                                                    | —                                                                                                                                                                                              |
| #13                                                                     | fold                      | § The workflow rewrite, pause and resume; the always-loaded text, QUICK-REFERENCE's verb index                                                                                                                   | —                                                                                                                                                                                              |
| #14                                                                     | fold; capture             | § The workflow rewrite, the always-loaded text: `AGENT-BRIEF.ARC.md`'s Locus definition; `resume-work-unit.md`'s sibling sentence                                                                                | `strategy-work-organization.md`'s sentence follows with the strategies, captured for `cutover-documentation`                                                                                   |
| #15                                                                     | fold                      | § The rehearsal, the checkout carries; § The order, after the import; in-place resume and promotion on the primary (`spec-seam-locus.md` § 2.7)                                                                  | —                                                                                                                                                                                              |
| #16                                                                     | fold; capture; dismiss    | § The workflow rewrite, the lifecycle verbs: `arc set-class`, `arc handover`, activation's Step 5, deactivation's Step 3                                                                                         | `strategy-team-coordination.md`'s passages captured for `cutover-documentation`; the `handleBaseSync` serialization ended when `seam-lifecycle` shipped                                        |
| #18                                                                     | fold                      | § The flip change, no tracked or installed file in a projected root                                                                                                                                              | —                                                                                                                                                                                              |
| #19                                                                     | fold                      | § The quiesce, the worktree lock                                                                                                                                                                                 | Drain note obsolete: `PROJECTION_LOCK_REASON` is in `lib/git/worktree-removal.ts`                                                                                                              |
| #21                                                                     | fold                      | § The workflow rewrite, the task loop, with no extension step to reorder                                                                                                                                         | `post-task-completion` is gone from the shipped workflows                                                                                                                                      |
| #22                                                                     | fold                      | § The rehearsal, the destructive CLI matrix, alongside Stage 2                                                                                                                                                   | —                                                                                                                                                                                              |
| #23                                                                     | fold; capture; dismiss    | § The workflow rewrite, delivery and review; § The rehearsal, the chain comparison and Stage 1's import; § The quiesce, attempts in flight                                                                       | Deletion share captured for `cutover-tracked-state-removal`, with `delivery-observe-attest`'s treatment; `.git/arc/review-gate/operations/` is its #35                                         |
| #26                                                                     | fold                      | § The flip change, the ROADMAP template and its entries, `verify-integrity.sh`'s presence test                                                                                                                   | In-repo arms: `cutover-tracked-state-removal` (`cohort-storage-cutover.md`)                                                                                                                    |
| #27                                                                     | fold                      | § The workflow rewrite, the relocatability rule and ceremony requests kept before each save; § The flip change, the notice                                                                                       | —                                                                                                                                                                                              |
| #28                                                                     | fold                      | § The rehearsal, the representative decomposition cut; both cohorts close on its evidence                                                                                                                        | The stub retirement ran: `decompose-scaling` no longer exists                                                                                                                                  |
| #29                                                                     | fold                      | Purpose line; § Scope, Won't do                                                                                                                                                                                  | No other step is written for a second repository                                                                                                                                               |
| #30                                                                     | fold                      | § The order and § The quiesce, teardown before and bind or release after the import; § The rehearsal, the checkout carries                                                                                       | —                                                                                                                                                                                              |
| #31                                                                     | fold                      | § The rehearsal, the partial-protection start, alongside Stage 2                                                                                                                                                 | Still live: `classifyPlanningEntry` (`lib/git/write-context.ts`)                                                                                                                               |
| #32                                                                     | fold                      | § The flip change, the three templates deleted with their entries                                                                                                                                                | —                                                                                                                                                                                              |
| #34                                                                     | fold                      | § The quiesce, the save before the import; § The rehearsal, Stage 1                                                                                                                                              | —                                                                                                                                                                                              |
| #36                                                                     | fold                      | The body cites the member specifications                                                                                                                                                                         | —                                                                                                                                                                                              |
| #37                                                                     | fold                      | § The workflow rewrite, session-init: delete the cutover module, then `spec-session-init-agenda.md` § 7.3's reads                                                                                                | —                                                                                                                                                                                              |
| H1                                                                      | fold                      | § The workflow rewrite, the identity verbs                                                                                                                                                                       | —                                                                                                                                                                                              |
| H5                                                                      | fold                      | § The workflow rewrite, the save cadence: a save per review increment                                                                                                                                            | —                                                                                                                                                                                              |
| #3                                                                      | fold                      | § The flip change, the `.internal/` records untracked                                                                                                                                                            | Its entry stays in `draft-cutover-tracked-state-removal.md` until the move capture drains                                                                                                      |
| H4                                                                      | fold                      | § The workflow rewrite, the errata convention                                                                                                                                                                    | Its entry stays in `draft-cutover-documentation.md` until the move capture drains                                                                                                              |
| Capture: lift the hold on the import                                    | dismiss two parts; fold   | § The import's part, released: A4's selector                                                                                                                                                                     | Hold lifted 2026-11-03; no rerun (Owner, 2026-11-05). A4: no legacy source, so the import writes no selector; #7 leaves no competing root at the window; the repair is post-flip recovery      |
| Capture: the Markdown fix's end-to-end test                             | fold                      | § The flip change, the end-to-end test; § The rehearsal, Stage 2; § Named assumptions on unlanded members                                                                                                        | —                                                                                                                                                                                              |
| Capture: the segmentation check's path                                  | fold                      | § The workflow rewrite, `generate-tasks`' pre-save step names the save, and `lint:md:descriptors` stays for the template                                                                                         | Owner, 2026-11-06; the capture's premise, that the check misses an untracked list, did not hold at planning review; the held Errand naming the task-list validator is removed unrun            |
| Found at the pass: un-hide `arc store`                                  | fold                      | § The flip change, `arc store` un-hidden and documented; § The workflow rewrite, QUICK-REFERENCE's verb index                                                                                                    | `spec-storage-ref-backend.md`'s expected contract for the cutover; no member held it                                                                                                           |
| Found at the consolidation: `DEV-RULES.ARC.md`'s state-committing rules | fold                      | § The workflow rewrite, the always-loaded text: task-list accuracy, meta-file timing and commit shape, § Atomicity, § Handoff, the rebase rule's notes reason                                                    | Owner, 2026-11-06; the rebase rule's relaxation stays with `history-policy`                                                                                                                    |
| Found at planning review: the relocatability rule                       | fold                      | § The workflow rewrite, ceremony check requests and the relocatability rule                                                                                                                                      | Always-loaded text the flip makes false (Owner, 2026-11-06); its move from `draft-cutover-documentation.md` is captured for that member                                                        |
| Found at planning review: the expected-contract sweep                   | fold                      | § The workflow rewrite; § The flip change, `arc init`, the Errand branch's suffix, and the status help text; § The quiesce; § The rehearsal, Stage 2                                                             | Hand-offs the consumer map and shipped specifications make to the cutover; the suffix (Owner, 2026-11-06); four parts captured for `cutover-tracked-state-removal` and `cutover-notes-removal` |

---
