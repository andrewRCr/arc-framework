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

- **Readiness:** maturing (third draft-design iteration, 2026-11-06). The 2026-11-05 readiness check returned
  not-ready. The Owner's planning pass and the consolidation that folded it (2026-11-06) close two of its gaps, the
  inbound buffer and the success signal; the rest are under Next.
- **Entry read:** depth `high`; `Class` stays `Heavy`. Derivation fires, since the window runbook, the flip change, and
  the land-at-flip split must be designed. Scale fires too, given a deletion surface spanning several subsystems. The
  design is composed from the landed members' specifications, not invented. Confirmed 2026-11-05 with no material new
  evidence: the boundary stays one work unit, as cut on 2026-11-03. The draft runs about 900 lines, so the spec's size
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
      unit (Owner, 2026-11-06; § Dispositions), among them: the task-list descriptor check retires in favor of the
      store's task-list write check, and the flip un-hides and documents `arc store`;
    - #9's branch leg (Owner, 2026-11-06): the rewired `arc sync` publishes state first, whatever the branch push's
      outcome, and reports each separately, so a slow or failing push gate no longer holds state back. Sync still
      pushes the branch. Sync that publishes state only, with handoff's own branch push, stays with the `USER-INBOX`
      capture "Decide whether a handoff `arc sync` should wait on the push gate…", whose first step is checking the
      readers a resume on another machine meets for a record naming a commit origin lacks (§ The flip change);
    - the consolidation (2026-11-06): every § Dispositions row folded into the body, the inbound buffer and its
      placement map dropped, and the success signal written (§ Success signal).
- **Open:**
    - the order of the flip's own landing against the import (§ The order);
    - a review stop rule, agreed before the second review pass.
- **Next:**
    - An ADR disposition on every settled decision, most expected to be covered by ADR-035, or `none` for the
      temporary pieces (the guard, the quiesce check, the canaries).
    - Settle the landing order (Open).
    - Then readiness again, the review stop rule, planning review, `arc check increment`, and the capture commit.

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
      classifier stops answering, so the entry has nothing left to guard;
    - the Errand-close `nextOffer` resumption;
    - the `role-conflict` fast-forward;
    - the landing bridge's Candidate re-asks;
    - the decomposition procedure until the cutover.

---

## Scope

- **In:** the rehearsal on full copies of this machine's repository (§ The rehearsal), then the window: quiesce,
  import, flip, retire notes (`analysis-storage-substrate-direction.md` § 10.3; § The window). The flip change (§ The
  flip change) and the whole workflow rewrite (§ The workflow rewrite) land at it. Planning-only work units' artifacts
  import from their branch heads, `delivery-rebuild-continuity`'s included; implementation work units land first where
  possible, or park at a task boundary.
- **The register's cutover rows** whose fate the flip realizes (`cohort-state-storage.md` § Storage-coupling
  register).
- **Not here:** the deletion passes over what the flip makes dead (§ 10.4) and the documentation pass, which are the
  subcohort's four other members (`cohort-storage-cutover.md`; § What lands at the flip, and what follows).
- **Won't do:**
    - flip CineXplorer, or write any step for a second repository (#29);
    - rehearse on a throwaway hosted repository, since the canaries carry what lies past the host boundary (§ The
      rehearsal);
    - fix before the flip what the flip replaces: the partial-protection planning entry (#31) and the task-list
      descriptor check's listing (§ The flip change), each fix throwaway.

---

## Success signal

- **Stage 2 is clean at the head that lands.** The dress rehearsal (§ The rehearsal) passes at the flip branch's head
  that merges, re-run after any later change to the flip change, the import, or the rewritten workflows, with the
  destructive CLI matrix (#22) and the partial-protection start (#31) passing beside it.
- **The window completes,** every step in order and none aborted, with the accounting case reporting no tracked file
  under a projected root unexplained, and the chain comparison giving the same chain or the same refusal for every
  Candidate record through both readers (§ The order).
- **No tracked state remains.** Once the flip merges, no tracked file sits under `.arc/active/`, `.arc/backlog/`, or
  `.arc/completed/`, or in `.arc/system/.internal/candidates/` and `.arc/system/.internal/transitions/`.
- **The notes refs are retired.** No notes ref remains on the remote, and the old ref survives only on the importing
  machine, outside `refs/tags/` and unpushed (§ Notes retirement).
- **Both canaries land:** the first Errand and the first work unit after the window, each through the hosted steps it
  exists to test (§ The rehearsal).

---

## Direction

### What lands at the flip, and what follows

**The rule (Owner, 2026-11-03).**

- **At the flip:** whatever would break or mislead once state leaves the branch.
    - the rehearsal, and the quiesce with a check that it holds;
    - the import, and its second run;
    - the flip change;
    - the whole workflow rewrite, since ARC's process changes once, at the flip;
    - notes retirement;
    - any check that would fail, or pass vacuously, once tracked state is gone. Refined (Owner, 2026-11-03): a check
      goes at the flip when it would fail, or when something after the flip relies on its result as assurance. A
      vacuous pass that nothing reads is inert and follows.
- **Follows:** code the flip only makes inert, and the strategy and ADR documentation. This goes to the follow-on
  members.

**At the flip, in this member:** the rehearsal (§ The rehearsal); the window, its quiesce, import, second run, and
notes retirement (§ The window); the flip change (§ The flip change); and the workflow rewrite (§ The workflow
rewrite).

**Follows, in the follow-on members** (`cohort-storage-cutover.md`). Items this draft routed there travel as
pre-routed `USER-INBOX` captures, since none of those members has a session:

- **`cutover-tracked-state-removal`:** #1's branch-tree readers, lifecycle classification, lifecycle hook checks,
  and CI planning classifier (the per-check sort below); #4; #10's import transform, after the window's second import
  run; #20; #24; #26's in-repo arms and `DERIVED_VIEWS`; #35; H2; the residue refs, once the held delivery work unit's
  artifacts are imported; the sealing guard and the quiesce check (captured 2026-11-05); and `seam-delivery-review`'s
  retired review-gate arms, keeping the review copy's classification arm (captured 2026-11-06).
- **`cutover-notes-removal`:** #1's notes-sync machinery, #10's sync-state ref, #17, and the notes configuration
  keys, once the session-init module's deletion leaves them no reader; the old notes ref with the notes residue refs;
  and `arc user inbox-list`'s handler and registration (captured 2026-11-06).
- **`cutover-decompose-removal`:** #25's deletion set.
- **`cutover-documentation`:** #33, H3, the strategy rewrites the register names, and the ADR supersessions and
  amendments, among them the strategy sentences that end a locus at teardown alone and reassign `Owner` by hand
  (captured 2026-11-06).

**The per-check sort** (2026-11-03): every lifecycle hook check and every part of the CI planning classifier
follows. None fails once tracked state is gone, and nothing relies on its result; only the prose acting on two
classifier commands goes at the flip, in the workflow rewrite. None refuses the flip commit itself, which deletes their
inputs: each selects staged files with `--diff-filter=ACMR` (`.arc/system/.internal/githooks/pre-commit`), so a
deletion gives it nothing to read, and no tracked document outside the state roots, `docs/`, and the tests links into
them (checked 2026-11-05). The checks' detail and the deletion's ordering hazards are in
`draft-cutover-tracked-state-removal.md`.

### Building before `projection-worktrees` lands

Phases that touch no unlanded member can build in the flip member before `projection-worktrees` lands. They still land
at the flip.

- **Rehearsal:** Stage 1 whole, with its copy driver (§ The rehearsal); for Stage 2, the destructive CLI matrix
  (#22), the partial-protection start (#31), and the harness for `seam-delivery-review`'s cases.
- **Quiesce:** the worktree lock (#19), and the check that the quiesce holds.
- **Flip change:** the capture gates onto `arc inbox` (#11), the ROADMAP template's install entries (#26), the
  transition-record test's removal (#3), and the `arc store` un-hide and its documentation.
- **Workflow rewrite:** every step from a landed member: #6, #12, #13, #14, #16, #21, #23, #25, #37, and H4.

What waits:

- for `projection-write-back`: #2, #5, #27, H5, the Markdown fix's end-to-end test, and the descriptor check's
  retirement with `generate-tasks`' pre-save step, since the store's write check covers a hand-edited task list only
  through write-back and `arc save`;
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
  runs the quiesce check (§ The quiesce, and the check that it holds), a save from every copied checkout (#34), and a
  real import, publication included, then:
    - the sealing guard refusing an in-repo write in every copied checkout once the import has run;
    - the import's second run and notes retirement (#7);
    - the accounting case (§ Tracked state the import does not claim);
    - the chain comparison (#8, below);
    - case 1 below;
    - the import's time and peak memory, under `memcap_gated -m 6G` with its in-process ceiling below that cap.

  The import covers the review gate's machine-local records as well as the tracked ones, since every review record
  reshapes at the flip (#23). Stage 1 runs twice. The first runs on a copy without the pre-meta backfill, reverted there
  since it has landed (`68bddbb526`), so its accounting case reports the twenty folders and shows the case catches the
  omission it exists for. The second runs with the backfill and confirms it.
- **Stage 2, the dress rehearsal,** at the flip branch's head once the flip change builds. On a fresh copy it runs the
  whole window in order: Stage 1's steps, then the flip change merged and rebuilt, each worktree's first
  materialization, the checkout carries (#15, #30), and the per-branch untracks and workspace removals (§ The order).
  Then it runs:
    - the parser check (#5, below), which rests on `projection-write-back`;
    - a work unit driven end to end through the rewritten workflows (#2, below);
    - cases 2 to 7 below, and the other store-backed paths;
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
chain reader walks (`readRepositoryCandidateSupersessionChain`, `lib/work-unit/candidate-record-store.ts`), since the
in-repo `history` follows renames and drops a version a merge commit introduced. Today's reader refuses six records:
`evidence-applicability` at a broken chain link (`resolveCandidateSupersessionAncestors`), and five that fail today's
Candidate schema before any chain walk (`readCandidateRecordVersioned`). The import carries all six unchanged.
`storage-ref-backend`'s tests compare the two readers over a fixture (`spec-storage-ref-backend.md` § 14.7); only the
rehearsal can compare every record in this repository. It reads every Candidate record's chain through the store's
`history` and through today's reader, and requires the same chain or the same refusal for each. It also tests a fact
new at the flip: a Candidate's supersession is then its singleton record's `history`, a live work unit's replayed
versions arriving mapped, their transitions whole, and a merged work unit's arriving as found.

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

**The end-to-end work unit** (#2). `arc save`, write-back, the close verb closing tasks and capturing their commits,
and the import's footer-derived task captures all first run for real at the flip, so only the rehearsal exercises them
through the rewritten workflows before it. The run takes one work unit through draft capture, create-spec with an ADR
companion, a task closed through the close verb, handoff, and pre-publication with the review copy, through
`arc publish`, its pre-publication review on the local source. Integration's candidate tail lies past the host
boundary, with the work-unit canary.

**The checkout carries** (#15, #30). Before the flip no in-place arm writes a checkout marker: the cold start,
`arc start --here`'s graduation, `arc materialize --here`, in-place resume, and promotion on the primary all leave none
(`spec-seam-locus.md` § 2.7), and the import leaves the marker out as machine-local (`spec-storage-ref-backend.md`
§ 10.9). From the flip, locus derivation reads only the marker and the store, so every checkout claimed in place before
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
flip and changes nothing before it beyond a capability branch in `handleDecompose`, so the rehearsal is the store
version's first run on the ref backend. Run as a representative cut on a copy, it is the evidence
`decompose-core-hardening` and `decompose-transform-integrity` close on, each against its unchanged closeout criterion:
"a representative real cut" showing the shipped members' properties "without post-transition repair"
(`cohort-decompose-core-hardening.md` § Closeout criteria), which the subcohort admits as evidence (its § Soft
coordination). Today's machine has not given one. `decompose-scaling`'s retirement (Owner, 2026-10-16) has run, with its
two scanner costs recorded out of scope, so neither cohort holds another open member. The cut copies a verbatim-keyed
companion and gives each member a conventional Design (§ Named assumptions on unlanded members).

**The destructive CLI matrix** (#22). `seam-locus`'s verification proved dormant destructive success and repaired
continuation through registered CLI-generated handler inputs, the reference Store, and real Git, and its built-CLI
scenarios prove pre-flip refusals; the production executable selects the in-repo backend, so successful execution
through the actual flipped built CLI is unproven. Every group in `notes-seam-locus.md` § Destructive-path verification
and flip release checks runs in scratch repositories through a spawned built CLI selecting the real flipped backend and
production ports, before the flip releases: cold and named start with the default lifecycle ports;
graduate, materialize, rename, and teardown; locus release, anchored and spawned; inbox and route insertion, move, and
carry; the Errand queue and queue set; full and partial open with link; Errand leave and rematerialize; abandon and
failed-open rollback; close and removal by ID and version; promotion; personal reconcile and scratch; handoff write
from file and stdin; identity add, init, and join; and session-init, handoff status, recovery, and Candidate
orientation. Each covers success, each material refusal, and successful continuation after repair, retaining command
results and the observable record, UID, marker, checkout, code-ref, and personal byte outcomes. Handler or provider
success discharges none of it; evidence from today's handlers stays labeled apart from the built-CLI runs, and the
table's templates locate existing scenarios rather than assert a flipped-backend pass.

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

The window runs as ordered steps; the spec sets the exact steps and their abort points from the import's stages
(§ Abort and recovery).

- **Ahead of the window:**
    - the sealing guard and the pre-meta backfill, both on `main` before the rehearsal (§ The quiesce, and the check
      that it holds; § Tracked state the import does not claim);
    - implementation work units landed where possible, or parked at a task boundary;
    - the pre-import tidy, worked from the import's trial run, since on a public repository the import publishes this
      repository's personal state for good (#7);
    - every machine's notes brought to the importing machine by `git bundle` or a fetch between machines, since the
      remote notes refs are deleted and the import refuses a notes file that differs from its disk copy (#7);
    - review finished on every machine but the importing one, since the review gate's repository ID is minted per
      clone and only the importing clone's facts are read (#7).
- **The quiesce** (§ The quiesce, and the check that it holds): every other session handed off and stopped (#2); every
  review attempt in flight on the importing machine finished (#23); ended holders' checkouts and work-unit husks torn
  down (#30); every unlocked marked worktree locked (#19); the check; and a save from every checkout (#34).
- **The import,** its publication included. The import converts every draft's inbound buffer and every held capture
  into inbound lists, so the window confirms none is left behind (#7). The accounting case and the chain comparison run
  over it as in the rehearsal. The check then recomputes what it recorded, and any change stops the window before the
  flip change.
- **The import's second run,** after the first push: it deletes the transient-identity refs from the remote, each
  leased on the tip the import re-homed, and drops the tips it kept under `refs/arc/tmp/migrate/` (#7).
- **After the import,** for each checkout and branch:
    - each remaining checkout's pre-flip marker bound or released, and each checkout claimed in place carried to an
      anchored marker (§ The rehearsal, the checkout carries; #15, #30);
    - each in-flight branch untracks its own `.arc/active/` files, and deletes its own copy of a Candidate record that
      differs from `main`'s (§ Tracked state the import does not claim);
    - each checkout's pre-flip workspace folder removed once the import has folded its session notes into the meta and
      moved the rest into `scratch/`.
- **The flip change merges** to `main`; each checkout merges it, rebuilds, and takes its first materialization.
- **Notes retire last** (§ Notes retirement).

**The flip's own landing against the import (open).** The flip branch's build selects the ref store, so before the
import it has no store. After the import, the sealing guard makes every pre-flip build refuse in-repo writes from any
checkout, the primary included, so every window step between the import and the flip's merge runs from the flip's
build or plain Git. How the flip's own landing is ordered against the import is not yet settled.

#### The quiesce, and the check that it holds

Decided 2026-11-05 (Owner): check, then import at once, with the import's own comparisons as the witness, plus a guard
that seals the pre-flip builds.

**The sessions.** Nothing may break across the flip (`storage-contract`'s C13), and a session still holding pre-flip
workflow text in context would follow steps the rewrite removed, so the quiesce reaches live sessions, not only
in-flight work units (#2). ARC sees no harness session, so the Owner stops every other session, in every harness,
after each has handed off, and each resumes on the rewritten text; no message round asks them to stop. What ARC can
see, it checks.

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
  plain `git worktree remove`, which deletes its gitignored projection without persisting its edits (#19).

**The check,** run from the importing checkout immediately before the import, refuses with each failing checkout
named:

- the primary and every checkout whose marker names a work unit or an Errand is clean and its branch matches its
  upstream, so each in-flight implementation unit sits at a task boundary, landed or paused; ARC's machinery checkouts,
  which carry no such marker and sit detached by design (`spec-projection-worktrees.md` § 2.5), are torn down or
  named;
- every linked checkout whose marker names a work unit or an Errand holds the projection's lock;
- no ended holder or work-unit husk remains to tear down;
- every checkout's `HEAD` descends from `a61e24716a`, the sealing guard's merge on `main` (PR #1287), and its build
  carries the guard below.

**Then every checkout saves its personal state, and the import runs** (#34). The import blocks on every personal file
whose disk copy differs from its saved notes copy, naming the remedy `arc user save` and `arc user load`, and the
2026-10-31 trial over `main` found ten: `RELEASE-GATES.md`, `PM-NOTES.md`, `CINEXPLORER-MIGRATION.md`, `USER-INBOX.md`,
and `SESSION-NOTES.md` or `ADVERSARIAL-PASSES.md` under five live work units. Live sessions edit these continuously, so
a save taken early goes stale before the import runs; the save is one step with the quiesce, immediately before the
import.

**The import is the witness for personal state:** it refuses a notes file whose disk copy differs from its saved copy,
an attempt in flight in the review gate, and an unmapped review source, so a write that slipped past the stop refuses
the import rather than vanishing. The hardening's trials ran this sequence in trial form, a save from every registered
checkout and then the import, clean four times. The check also records each worktree's `HEAD`, a digest of its personal
files, and the tips of `refs/arc/user/<id>/errands`; after the import it computes them again, and any change stops the
window before the flip change. Errand verbs write those refs outside the store (`errandStateRef`,
`lib/user-sync/sync-state.ts`), and the import re-homes them (`lib/store/ref/import/transient.ts`), so the `HEAD` and
digest re-check does not see an Errand write. The sealing guard already refuses those writers, so the tips are a second
check, not the only one.

**The sealing guard** closes the one silent loss. Each checkout runs its own build, so a checkout that has not merged
the flip would keep writing tracked state and Git notes after the import. Its personal writes would vanish, since the
import retires notes. The guard landed on `main` as an Errand, at `a61e24716a` (PR #1287): once
`refs/arc/project/registry` exists, the in-repo implementation, every notes writer, and the Errand identity transaction
and its push reconcile refuse their writes with a recoverable store-imported refusal naming the remedy, merge base and
rebuild, while reads stay open (`refuseWriteIfStoreImported`, `lib/store/store-imported.ts`). No such ref exists before
the import, and every worktree on a machine shares one ref namespace, so the guard fires in every checkout the moment
the primary imports. It landed ahead of the rehearsal, not only the window, so the rehearsal's copy carries it and
exercises the moment it exists for; it could not ride this unit's single landing (Owner, 2026-11-05). A clone on another
machine sees the ref only through ARC's state fetch, so other machines stay a residual the window's own steps cover
(#7). The guard is dead once the in-repo implementation goes, so `cutover-tracked-state-removal` deletes it with that
implementation.

**Where the check lives** (Owner, 2026-11-05): a script in this unit's change, reviewed and tested with it and exercised
by the rehearsal, since it gates an irreversible step; `cutover-tracked-state-removal` deletes it with the in-repo
implementation.

#### Abort and recovery

Decided 2026-11-05 (Owner). Three of the window's steps cannot simply be undone: the import's push publishes
`refs/arc/*` to a public origin, notes retirement deletes the remote notes refs, and the flip merges to `main`. The
sealing guard adds a fourth hazard: once `refs/arc/project/registry` exists locally, every pre-flip build refuses its
writes, so a failed import with no usable store behind it would leave every checkout on the machine unable to write.

- **Ordered steps, each with an abort rule.** Any refusal, mismatch, or failed check stops the window at that step.
- **Before publication,** an abort deletes the local `refs/arc/*`, which also lifts the guard, and the repository is
  as it was.
- **After publication,** an abort also deletes the remote refs. The pre-import tidy exists because anything pushed may
  already have been copied.
- **Notes retire last,** after the flip has merged and the first materialization has succeeded, so the notes stay a
  valid fallback until then.

#### Notes retirement

The import retires notes, and the window deletes the remote notes refs last (§ Abort and recovery). The old notes ref
stays on the importing machine under a namespace that is neither a tag nor pushed, so `git push --tags` cannot publish
every past personal note, and goes with the notes residue refs in `cutover-notes-removal` (Owner, 2026-11-05; #7). This
settles analysis § 10.3's "keep the old ref as an archive tag".

### The flip change

The code that must change at the flip, beside the import and the workflow rewrite.

- **`arc sync` onto the store's `pull` and `push`** (#9). `storage-ref-backend` renamed the contract's `sync()` to
  `push({ carry? })` and added `pull()`, while `arc sync` keeps its name and runs both, pulling then pushing
  (`spec-storage-ref-backend.md` § 6.1). The flip points `handleSync` (`handlers/sync.ts`) at `pull` then `push` and
  drops the notes leg's call; the notes machinery itself goes in `cutover-notes-removal` (#1). State publishes first,
  whatever the branch push's outcome, and each is reported separately (Owner, 2026-11-06). The legs pair today because
  notes are keyed to commits: `NOTES_BLOCK_WORKTREE_STATES` (`handlers/sync.ts`) holds the notes leg back on those
  worktree states, and `runPairedPush` (`commands/user/paired-push.ts`) skips notes when the branch push fails. The
  flip deletes that reason, so the state leg goes first and stands alone. Task captures already name unpushed commits
  today, since task close checks local reachability only and a capture's `copyKey` survives a rebase, so the cut
  changes no reader. Sync still pushes the branch; sync that publishes state only, with handoff's own branch push,
  stays with the `USER-INBOX` capture named under Resolved.
- **The capture gates onto `arc inbox`** (#11). `create-spec`'s owner's pass, `activate-work-unit`'s pre-condition
  gate, and the start of `verify-work-unit` dispatch on `arc user inbox-list --target <slug>`
  (`handlers/user-inbox-list.ts`, `lib/user-sync/inbox-target.ts`), which lists the personal-inbox captures whose
  `WU_Target` line names a work unit, held or not, reading the inbox file under the notes lock. From the flip
  `arc inbox <list>`, for `personal`, `project`, or a work item's slug, replaces it: `--target <slug>` keeps the
  `clear` / `named` / `refused` result with each row's ID and version, and `arc inbox <slug>` lists a work unit's
  inbound list with its pending count and oldest age (`spec-seam-locus.md` § 7.1). Its dormant arm is
  `DormantStoreCommand`'s `inbox` (`commands/store-command-support.ts`). The three gates move onto it. Since D11 routes
  captures straight into a work unit's inbound list and retires owner adoption, each gate also reads the work unit's
  pending inbound count, which session-init orientation already carries. The inbox writer and the `user inbox`
  mutations survive; `arc user inbox-list` is inert from the flip, and its removal goes to `cutover-notes-removal`
  (`spec-seam-locus.md` § 1.5).
- **No tracked or installed file in a projected root** (#18, #26, #32). From the flip `.arc/active/`, `.arc/backlog/`,
  and `.arc/completed/` are projected roots. Today they hold tracked files the import turns into records, and the
  installer writes three files there (`lib/classification.ts`). `completed/README.md` is a Configurable file that
  `arc update` reinstalls; no record claims it, so it stays unadopted and every checkout removal refuses over it until
  it is deleted. `backlog/ROADMAP.md` and `backlog/ATOMIC-INBOX.md` come from Scaffolded templates installed at the
  paths the projection writes the roadmap view and the project inbox to (`lib/layout/projection.ts`), so an install
  there writes over a projected file. The flip:
    - untracks the shared roots' files once their records are imported;
    - deletes the ROADMAP and ATOMIC-INBOX templates and `completed/README.md` outright, with their `init-recipe.json`,
      `SCAFFOLDED_FILES` and `CONFIGURABLE_FILES` (`lib/classification.ts`), and `manifest.json` entries, rather than
      relocating them within `arc/`, moving anything kept for another purpose outside `arc/`.
      `adopter-install-authority` implements the day the flip lands, against the post-flip shape: it replaces
      `include_files`, `SCAFFOLDED_FILES`, and `CONFIGURABLE_FILES` with one claims table in `init-recipe.json`, and
      every file under the package's `arc/` must then carry a claim, with no not-installed list, so a template the flip
      kept under `arc/` but stopped installing would fail its coverage check (`draft-adopter-install-authority.md` D1,
      D2, D6). The recipe's structure stays as it is for that rebuild;
    - removes `verify-integrity.sh`'s presence test for `ROADMAP.md`, in both copies. This is the first step of
      `seam-status-roadmap`'s two-step ROADMAP removal: each piece acts once no ROADMAP file exists, the installer
      writing the template into a projected root, `arc health` reporting the manifest entry missing, and the presence
      test failing (`spec-seam-status-roadmap.md` § 9.4). Status's and `arc view`'s store versions are built dark
      before the flip. The second step, the in-repo arms, `DERIVED_VIEWS`, and the remaining ROADMAP paths, follows in
      `cutover-tracked-state-removal`, and the layout's `project-document` address stays past it for the projection's
      rule that never adopts a file left from before the flip. Removing `arc hook-remedy-roadmap-conflict` waits on
      every live branch's refreshed pre-commit hook (`cohort-storage-cutover.md`).
- **The `.internal/` records untracked** (#3; Owner, 2026-11-05). The flip extends the untrack beyond the projected
  roots to the Candidate and transition records under `.arc/system/.internal/` (`candidates/` and `transitions/`).
  Nothing breaks if they stay, since both kinds are never projected (`review/candidate` and `lineage/transition` in
  `KIND_MECHANISMS`, `lib/store/registry.ts`), but they would mislead: stale copies of authority-bearing records in
  every checkout while the store moves on. And a missed in-repo reader then fails on the missing folder, which Stage 2
  surfaces, rather than reading plausible stale state and passing. Only the data goes; the in-repo code that reads and
  writes it stays for `cutover-tracked-state-removal`. `live-transition-records.test.ts` and its ARC contract tier
  selection (`lib/local-vitest-runner.ts` and its unit test) go here, since the test fails on the missing folder.
- **The task-list descriptor check retires** for the store's task-list write check (Owner, 2026-11-06).
  `npm run lint:md:descriptors`, segmentation and descriptor spacing and the second stage of `lint:md`, lists its files
  through Git (`runWorktreeTaskDescriptorLint` calls `enumerateTrackedMarkdownPaths`). A new task list is untracked
  until its ceremony commit, so `generate-tasks`' pre-save step passes while checking nothing, and after the flip every
  task list is stored and none tracked, so the check sees none at all. `projected-markdown-checks` gave `lint:md`,
  `lint:md:underwrap`, and `lint:arc:links` `selection` variants, but `lint:md:file`, which `lint:md:selection` runs,
  never runs the descriptor stage. The store's write check (`checkTaskListSegmentation` and `checkTaskListDescriptor`,
  `lib/store/kinds/task-list/shape-rules.ts`) covers a save, so the flip removes the stage, and the rewritten pre-save
  step names the save (§ The workflow rewrite). Until the flip, a session checks an untracked list by calling
  `scanTaskListSegmentation` and `validateTaskDescriptorSpacing` directly; a pre-flip fix is throwaway.
- **`arc store` un-hidden and documented.** It is registered hidden until the flip
  (`program.command("store", { hidden: true })`, `cli.ts`), and `spec-storage-ref-backend.md`'s expected contract for
  the cutover un-hides and documents it (§ Cross-cutting Considerations, "Migration and rollout"). Its documentation
  joins QUICK-REFERENCE's verb index (§ The workflow rewrite).
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
  maps to `unavailable`. Once the flip makes the fixture's store answer true, the test, run with no projection and no
  start, would see the `selection` checks report that they could not run rather than an empty selection. Stage 2 runs
  it over the flipped store, and the flip either seeds a projection for its fixture or changes its expectations to what
  the connected reader reports there.

### The workflow rewrite

ARC's process changes once, at the flip (`storage-contract`, Owner 2026-09-30), so the flip rewrites every affected
workflow step, and the always-loaded process text agents act on, from the consumer map's end states
(`notes-storage-contract.md`), each step checked against `strategy-procedure-evolution.md`. The register's row
"Workflow steps commit state with `git`" moves here, and its fate sets the shape: a commit step that carried only state
becomes `arc save` or goes, the ROADMAP hand-render steps and their refresh commits go, a ceremony that also changes
tracked files keeps a commit step for them, and the task loop closes through the close verb.

- **The save cadence** (H5; Owner, 2026-11-05). `arc save` clears each projected file's changed mark, except on a file
  still holding an edit the store lacks, so until a workflow saves per increment, `--changed` spans everything since
  the last save; both projection specifications leave the cadence to this rewrite (`spec-projection-write-back.md`
  § 11.7, `spec-projection-worktrees.md` § 11.7). A state-only commit step becomes a save per review increment, at each
  approval gate's commit, so the selection a ceremony checks matches the increment.
- **Ceremony check requests and the relocatability rule** (#27; `spec-projected-markdown-checks.md` § 1.4). Before
  the flip, every ceremony that commits or saves only state requests `arc check increment` over the state it authored,
  before its approval stop for what it writes before the stop, and before its commit or save for text written after it
  or where it has none, keeping its existing lint step; handoff names a failure in work it leaves unfinished in its
  notes rather than stopping to ask. The rewrite that turns a state-only commit step into `arc save` keeps each request
  and lint step before the save. The relocatability rule in `DEV-RULES.ARC.md` § `.arc/` artifact references is
  rewritten onto the movable set: from the flip every work-item and cohort record is movable, its path varying by
  lifecycle and by checkout (`active/current/`, `active/in-flight/<slug>/`, `completed/`), while personal records and
  the project inbox keep one path (§ 2.1). ARC's link rules, a write check at write-back and `arc save`, follow it.
- **The task loop** (#12, #21). From the flip `arc task close` closes tasks after the commit and captures their commits
  (D16), and `arc release commit --close` runs it at the commit fire site under the approval that covers work and
  commit (`spec-seam-lifecycle.md` § 9; Owner, 2026-10-12). Today the loop marks `[x]` before the commit, runs the
  quality request over that completion edit, and removes the `[x]` on red. The rewritten loop writes no `[x]`: the
  red-path removal and the pre-report checklist's "Task marked [x]" line go, the verb's result standing as the record;
  the completion note stays the agent's hand edit before the gate; deferred review closes its range in one call; and a
  hand `[~]` becomes `arc task defer` (§ 9.5). Delivery's correction acknowledgment, which closes the task mid-protocol
  and then resumes, is reordered around the close. No extension step reorders: `retire-extension-points` removed
  `post-task-completion` outright.
- **Pause and resume** (#13). From the flip `arc pause` and `arc resume` replace `arc park`: a pause is a record on the
  work item, not a move, and the checkout stays unless released (`arc locus release`); the pointer record, park from
  Planning's landing, and the parked position retire (`spec-seam-lifecycle.md` § 8.1, § 8.9; Owner, 2026-10-12). The
  two workflows shrink to the verbs.
- **The lifecycle verbs** (#6, #16):
    - every step that hand-edits `Class` moves onto `arc set-class`, or a shipped `--class` flag where one covers it;
      none covers activate's Step 4, init's post-init ratchet, a new work unit's resolution, init's Errand-promotion
      step 6, promote's Step 2, or draft-design's capture (`spec-seam-record-kinds.md` § 5.4, § 6.5, § 8.4;
      `spec-seam-lifecycle.md` § 10);
    - the steps that hand-edit `Branch`, deactivate's Case C and init's re-run, move onto verbs;
    - the cohort template's "convenience pointer" note on `Parent` is rewritten, since `Parent` becomes the cohort's
      stored nesting;
    - where the rewrite takes `inbound-routing-method`'s from-the-flip binding for the `route-discovered-work` method,
      the `_Routed from:_` line's date moves to `_Created:_`;
    - `Owner` turns verb-owned, so the person-to-person handoff's hand edit in `session-handoff.md` moves to
      `arc handover`, and `init-work-unit.md`'s step preserving the stub's `Owner` goes, since starting a stub records
      the starter (`spec-seam-lifecycle.md` § 8.5);
    - activation's result names the old name's remote deletion as a typed action only for a branch link recorded
      `created` (§ 5.1), so `activate-work-unit.md` Step 5 runs the actions the result names rather than its raw
      `git push origin --delete`; deactivation keeps the work branch, so `deactivate-work-unit.md` Step 3's remote
      delete goes (§ 8.8).
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
      `commit-*` step (§ 14.3). Attest's commit step stays, for the review copy alone, which `arc attest` writes and
      stages, as D15 keeps one for any ceremony that changes tracked files (§ 12.5);
    - the adversarial-review method's fire-points record a pass through `arc review adversarial record` rather than
      appending to `ADVERSARIAL-PASSES.md`;
    - review reports, chunk reports, aggregate results, and evaluator reports among them, go to the work unit's scratch
      folder rather than its workspace, so archive's sweep loses nothing, and `archive-work-unit.md`'s
      teardown-ownership sentence and `integrate-work-unit.md`'s `arc user close` backstop no longer need to say so;
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
- **The errata convention** (H4; Owner, 2026-11-05). `archive-work-unit.md` § Post-`Shipped` errata convention says
  "git history is the lock", which misleads once a shipped meta is a stored record: a correction becomes a write to the
  completed item, and its history is the store's history of the archived meta (`spec-projection-write-back.md` § 8.4).
- **The planning-lane prose.** `run-errand.md`, `drain-inbox.md`, and `setup-merge-gate.md` arm auto-merge on
  `arc review planning-lane`, or claim the routing exemption through `arc review planning-grooming resolve`, as does the
  planning-grooming lane selection in `route-discovered-work`. Both commands answer `reviewed` or `not-eligible` once
  state is untracked, so the steps would never fire again, and the rewrite drops them.
- **`generate-tasks`' pre-save step.** § Finalize the task list's "run the project's task-list validator", over
  "tracked and untracked files", names the save, whose task-list write check replaces the descriptor check (§ The flip
  change).
- **The always-loaded text:**
    - `AGENT-BRIEF.ARC.md`'s Locus definition (#14), in the package source and synced to `.arc/reference/briefs/`. A
      WU-owned locus "is exclusive from spawn, materialization, or explicit `--here` entry through exact teardown";
      from the flip `arc locus release` also ends that role, releasing a paused work unit's checkout for its owner or a
      checkout whose work unit another identity owns, and for an anchored checkout only the marker
      (`spec-seam-locus.md` § 5; Owner, 2026-10-12). The sentence becomes "through exact teardown or release", and
      `resume-work-unit.md`'s sibling sentence follows;
    - QUICK-REFERENCE's verb index: `arc pause` replaces `arc park` (`spec-seam-lifecycle.md` § 19), and `arc store`
      joins it.

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
  `readProjectedSelection`, which today returns an empty list unconditionally (`lib/checks/projected-selection.ts`).
- The descriptor check's retirement: write-back and `arc save` call each kind's registered write check
  (`spec-projected-markdown-checks.md` § 1.4, available with the projection).
- #25 and #28, the decomposition rehearsal cut: `storage-ref-hardening` § 10, for copied-companion naming. Re-checked
  against it as landed (2026-11-04, #1271) and holding: `copyCoordinates` (`lib/decompose/scaffold-copy.ts`) names each
  copied companion with `companionStoredName` (`lib/store/companion-name.ts`), and the additive report returns that
  stored name (`reportDecomposeAdditive`). Its A3 keeps Design admission to a member's own conventional draft, spec,
  or paired-spec names (`checkMetaDesignEntry`), so the representative cut copies a verbatim-keyed companion, as the
  hardening's native case does with a nested notes companion, and gives each member a conventional Design, never a
  verbatim one.
- #32, removing the projected-root install entries: `adopter-install-authority` D1, D2, and D6, in its specification
  on its planning branch.
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
  check. The rehearsal's check therefore requires a parser of each kind with structured content, not of every
  writable kind.
- **#18:** both members' § 18 state the flip's duty, and `lib/classification.ts` installs exactly three files into
  projected roots: the ROADMAP and ATOMIC-INBOX templates and `completed/README.md`. The gap in § Tracked state the
  import does not claim is the flip's own.
- **#27, and the descriptor check:** write-back § 11.7's selection holds `active/current/`'s task list, read through
  `readProjectedSelection`; the descriptor check retires for the store's write check (§ The flip change).
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
  holding a PRD, a task list, and completion, notes, or atomic files, but no meta;
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
  branch untracks its own after the import;
- each checkout's pre-flip workspace folder under `.arc/user/<id>/<slug>/` maps to no record
  (`spec-projection-write-back.md` § 9), so it goes once the import has folded its session notes into the meta and
  moved the rest into `scratch/`.

A third follows from untracking the `.internal/` records (§ The flip change): a branch whose Candidate record differs
from `main`'s would meet the flip's deletion as a modify/delete conflict at its next merge of `main`, so each such
branch deletes its own copy after the import, beside its `.arc/active/` untrack.

### The import's part, released

The hold on the import's part lifted when `storage-ref-hardening`'s trial imports (its Tasks 5.12 and 5.13) came back
clean on 2026-11-03. No separate import rerun over current `main` runs before the rehearsal (Owner, 2026-11-05): the
hardening's real-state trials took its place, the last at its final head `6343d32b6c` (`task-8.1-20261105T000620Z`).
Each saved every registered checkout first, bound the review mapping, refused no record, and accounted for every review
source (`notes-storage-ref-hardening.md` § Verification at the final head). A trial places no store and publishes
nothing, so the build and publication stages first run in the rehearsal's own import, at its head.

The hardening's amendment A4 (its spec § 9.1, notes § A4) adds an explicit selection between competing approval roots
for post-flip recovery when two clones each approve one, with a new selector kind and a preview-and-apply repair
command. None of it enters the window: the import has no legacy source, so it writes no selector; finishing review on
every machine but the importing one (§ The order) leaves no competing root at the window; and the repair is post-flip
recovery.

## Dispositions

The Owner's planning pass (2026-11-06) over the inbound entries this draft held, the two moved in from follow-on
members, the three `USER-INBOX` captures naming this unit, and one gap the pass found. Every `fold` is woven into the
body at the location named. Each capture is a pre-routed `USER-INBOX` capture for the named member, which has no
session.

| Entry                                       | Outcome                   | Fold location                                                                                                                                                                                                    | Reason or route                                                                                                                                                                           |
| ------------------------------------------- | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #2                                          | fold                      | § The rehearsal, the end-to-end work unit; § The quiesce, the sessions                                                                                                                                           | —                                                                                                                                                                                         |
| #5                                          | fold; dismiss entry shape | § The rehearsal, the parser check, for each kind with structured content                                                                                                                                         | Entry shape resolved: `ENTRY_CONFIGS` declares `work-item/description`, `work-item/inbound`, and `personal/errand-queue`                                                                  |
| #6                                          | fold; dismiss two parts   | § The workflow rewrite, the lifecycle verbs: Class steps onto `arc set-class` or `--class`, `Branch` edits onto verbs, the cohort template's "convenience pointer" note, `_Routed from:_`'s date to `_Created:_` | `hooks.task_numbering` is held by `draft-cutover-tracked-state-removal.md`'s retired keys; an Integrating unit already takes no route (`route-discovered-work` § Target lifecycle)        |
| #7                                          | fold                      | § The order: tidy, notes bundles, reviews finished elsewhere, no buffer or held capture left at import, second run; § Notes retirement                                                                           | —                                                                                                                                                                                         |
| #8                                          | fold                      | § The rehearsal, the chain comparison                                                                                                                                                                            | —                                                                                                                                                                                         |
| #9                                          | fold                      | § The flip change, `arc sync`, after `projection-worktrees`: `handleSync` onto `pull` then `push`, dropping the notes leg's call                                                                                 | State publishes first, whatever the branch push's outcome, each reported separately (Owner, 2026-11-06); notes machinery: `cutover-notes-removal`                                         |
| #11                                         | fold; capture             | § The flip change, the capture gates onto `arc inbox`                                                                                                                                                            | The inbox writer and `user inbox` mutations survive; `arc user inbox-list` is replaced, its removal captured for `cutover-notes-removal`                                                  |
| #12                                         | fold                      | § The workflow rewrite, the task loop: `arc task close` and `arc release commit --close`, `[~]` through `arc task defer`, delivery's acknowledgment reordered                                                    | —                                                                                                                                                                                         |
| #13                                         | fold                      | § The workflow rewrite, pause and resume; the always-loaded text, QUICK-REFERENCE's verb index                                                                                                                   | —                                                                                                                                                                                         |
| #14                                         | fold; capture             | § The workflow rewrite, the always-loaded text: `AGENT-BRIEF.ARC.md`'s Locus definition; `resume-work-unit.md`'s sibling sentence                                                                                | `strategy-work-organization.md`'s sentence follows with the strategies, captured for `cutover-documentation`                                                                              |
| #15                                         | fold                      | § The rehearsal, the checkout carries; § The order, after the import; in-place resume and promotion on the primary (`spec-seam-locus.md` § 2.7)                                                                  | —                                                                                                                                                                                         |
| #16                                         | fold; capture; dismiss    | § The workflow rewrite, the lifecycle verbs: `arc set-class`, `arc handover`, activation's Step 5, deactivation's Step 3                                                                                         | `strategy-team-coordination.md`'s passages captured for `cutover-documentation`; the `handleBaseSync` serialization ended when `seam-lifecycle` shipped                                   |
| #18                                         | fold                      | § The flip change, no tracked or installed file in a projected root                                                                                                                                              | —                                                                                                                                                                                         |
| #19                                         | fold                      | § The quiesce, the worktree lock                                                                                                                                                                                 | Drain note obsolete: `PROJECTION_LOCK_REASON` is in `lib/git/worktree-removal.ts`                                                                                                         |
| #21                                         | fold                      | § The workflow rewrite, the task loop, with no extension step to reorder                                                                                                                                         | `post-task-completion` is gone from the shipped workflows                                                                                                                                 |
| #22                                         | fold                      | § The rehearsal, the destructive CLI matrix, alongside Stage 2                                                                                                                                                   | —                                                                                                                                                                                         |
| #23                                         | fold; capture; dismiss    | § The workflow rewrite, delivery and review; § The rehearsal, the chain comparison and Stage 1's import; § The quiesce, attempts in flight                                                                       | Deletion share captured for `cutover-tracked-state-removal`, with `delivery-observe-attest`'s treatment; `.git/arc/review-gate/operations/` is its #35                                    |
| #26                                         | fold                      | § The flip change, the ROADMAP template and its entries, `verify-integrity.sh`'s presence test                                                                                                                   | In-repo arms: `cutover-tracked-state-removal` (`cohort-storage-cutover.md`)                                                                                                               |
| #27                                         | fold                      | § The workflow rewrite, the relocatability rule and ceremony requests kept before each save; § The flip change, the notice                                                                                       | —                                                                                                                                                                                         |
| #28                                         | fold                      | § The rehearsal, the representative decomposition cut; both cohorts close on its evidence                                                                                                                        | The stub retirement ran: `decompose-scaling` no longer exists                                                                                                                             |
| #29                                         | fold                      | Purpose line; § Scope, Won't do                                                                                                                                                                                  | No other step is written for a second repository                                                                                                                                          |
| #30                                         | fold                      | § The order and § The quiesce, teardown before and bind or release after the import; § The rehearsal, the checkout carries                                                                                       | —                                                                                                                                                                                         |
| #31                                         | fold                      | § The rehearsal, the partial-protection start, alongside Stage 2                                                                                                                                                 | Still live: `classifyPlanningEntry` (`lib/git/write-context.ts`)                                                                                                                          |
| #32                                         | fold                      | § The flip change, the three templates deleted with their entries                                                                                                                                                | —                                                                                                                                                                                         |
| #34                                         | fold                      | § The quiesce, the save before the import; § The rehearsal, Stage 1                                                                                                                                              | —                                                                                                                                                                                         |
| #36                                         | fold                      | The body cites the member specifications                                                                                                                                                                         | —                                                                                                                                                                                         |
| #37                                         | fold                      | § The workflow rewrite, session-init: delete the cutover module, then `spec-session-init-agenda.md` § 7.3's reads                                                                                                | —                                                                                                                                                                                         |
| H1                                          | fold                      | § The workflow rewrite, the identity verbs                                                                                                                                                                       | —                                                                                                                                                                                         |
| H5                                          | fold                      | § The workflow rewrite, the save cadence: a save per review increment                                                                                                                                            | —                                                                                                                                                                                         |
| #3                                          | fold                      | § The flip change, the `.internal/` records untracked                                                                                                                                                            | Its entry stays in `draft-cutover-tracked-state-removal.md` until the move capture drains                                                                                                 |
| H4                                          | fold                      | § The workflow rewrite, the errata convention                                                                                                                                                                    | Its entry stays in `draft-cutover-documentation.md` until the move capture drains                                                                                                         |
| Capture: lift the hold on the import        | dismiss two parts; fold   | § The import's part, released: A4's selector                                                                                                                                                                     | Hold lifted 2026-11-03; no rerun (Owner, 2026-11-05). A4: no legacy source, so the import writes no selector; #7 leaves no competing root at the window; the repair is post-flip recovery |
| Capture: the Markdown fix's end-to-end test | fold                      | § The flip change, the end-to-end test; § The rehearsal, Stage 2; § Named assumptions on unlanded members                                                                                                        | —                                                                                                                                                                                         |
| Capture: the segmentation check's path      | fold                      | § The flip change, the descriptor check retires for the store's task-list write check; § The workflow rewrite, `generate-tasks`' pre-save step names the save                                                    | Owner, 2026-11-06; the held Errand naming the task-list validator is removed unrun                                                                                                        |
| Found at the pass: un-hide `arc store`      | fold                      | § The flip change, `arc store` un-hidden and documented; § The workflow rewrite, QUICK-REFERENCE's verb index                                                                                                    | `spec-storage-ref-backend.md`'s expected contract for the cutover; no member held it                                                                                                      |

---
