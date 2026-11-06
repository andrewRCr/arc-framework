# Draft: Cutover Flip

- **Origin:** [internal] — the `storage-cutover` cut (2026-11-03), whose draft this one continues; that draft
  came from the `state-storage` re-cut (2026-09-28).
- **Purpose:** Flip this repository — and CineXplorer — onto the ref store in one rehearsed window, and retire Git
  notes. The subcohort's other members delete what the flip makes dead and rewrite the documentation.
- **Planning posture:** `P1`, a Gate B Must, in the subcohort `state-storage/storage-cutover`
  (`cohort-storage-cutover.md`).

---

## Planning state

- **Readiness:** maturing (second draft-design iteration, 2026-11-05). The loop-exit readiness check returned
  not-ready on 2026-11-05, with the gaps under Next.
- **Entry read:** depth `high`; `Class` stays `Heavy`. Derivation fires, since the window runbook, the flip change, and
  the land-at-flip split must be designed. Scale fires too, given a deletion surface spanning several subsystems. The
  design is composed from the landed members' specifications, not invented. Confirmed 2026-11-05 with no material new
  evidence: the boundary stays one work unit, as cut on 2026-11-03. The draft runs about 1,130 lines, so the spec's size
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
    - which items are draftable now, which rest on assumptions, and which wait for the import (below);
    - `session-init-agenda` shipped on 2026-11-02, so the session-init rewrite derives from `spec-session-init-agenda.md`;
    - the boundary: cut at the flip (Owner, 2026-11-03; `cohort-storage-cutover.md`);
    - the rule that decides what lands at the flip, and the sort under it (Owner, 2026-11-03; § Direction);
    - the cut is a retirement into the subcohort `state-storage/storage-cutover` (Owner, 2026-11-03; § The cut);
    - the per-check sort: every lifecycle hook check and the CI planning classifier follow, and only the prose acting
      on two classifier commands goes at the flip (§ Direction);
    - the carve: five members, their items and edges, the size mark, and the follow-ons' Gate B placement (Owner,
      2026-11-03; `cohort-storage-cutover.md`);
    - no separate import rerun before the rehearsal (Owner, 2026-11-05; § The import's part, released);
    - the flip asks nothing of `projection-write-back` or `projection-worktrees` beyond their approved specifications
      (Owner, 2026-11-05; § What the flip needs from the projection members);
    - H4, the errata convention, moves from `cutover-documentation` into the flip's workflow rewrite, since it is
      workflow text (Owner, 2026-11-05; § Direction);
    - #9 leaves the set that builds before `projection-worktrees` lands (§ Building before `projection-worktrees`
      lands);
    - the pre-meta archive folders get metas in an Errand before the rehearsal, and the rehearsal carries an accounting
      case for tracked state under the projected roots (Owner, 2026-11-05; § Tracked state the import does not claim);
    - #25 and #28 hold against `storage-ref-hardening`'s landed § 10 (§ Named assumptions on unlanded members);
    - the quiesce: the Owner stops every other session, then a check of what ARC can see, the import as the witness for
      personal state, and a guard sealing the pre-flip builds (Owner, 2026-11-05; § The quiesce, and the check that it
      holds); the guard lands as an Errand ahead of the window, and the check is a script in this unit's change (Owner,
      2026-11-05);
    - the rehearsal: two stages on full copies, stopping at the host boundary, with the first Errand and the first work
      unit landed after the window as canaries (Owner, 2026-11-05; § The rehearsal);
    - the flip untracks the Candidate and transition records under `.arc/system/.internal/`, data only, and takes #3
      from `cutover-tracked-state-removal` (Owner, 2026-11-05; § Direction);
    - the window's abort and recovery (Owner, 2026-11-05; § The window's abort and recovery);
    - H5: a save per review increment, at each approval gate's commit (Owner, 2026-11-05; § Direction);
    - the old notes ref stays on the importing machine under a namespace that is neither a tag nor pushed, and goes in
      `cutover-notes-removal` (Owner, 2026-11-05; § Direction).
- **Open:**
    - a review stop rule, agreed before the second review pass.
- **Next** (the readiness check's gaps, 2026-11-05, in this order):
    - The Owner's planning pass: a dispositions table for the 29 inbound entries below, #3 and H4 as their moves
      arrive, and the three `USER-INBOX` captures naming this unit ("Lift the flip's hold on the import", "Update the
      Markdown fix's end-to-end test", and "Give this repository's task-list segmentation check a path it can see"),
      confirmed by the Owner.
    - Fold every confirmed entry into the body as one consolidation rewrite, settling on the way the smaller open
      points the specifications decide (#11's inbox-list survivor through `seam-locus`'s `arc inbox`, #27's descriptor
      check, #23's `delivery-observe-attest` question).
    - In the same rewrite, a success signal: Stage 2 clean at the head that lands; the window complete with the
      accounting case reporting nothing unexplained and the chain comparison matching; no tracked file under the
      projected roots or in `.internal/candidates/` and `.internal/transitions/`; the notes refs retired; both canaries
      landed.
    - An ADR disposition on every settled decision, most expected to be covered by ADR-035, or `none` for the
      temporary pieces (the guard, the quiesce check, the canaries).
    - Then readiness again, the review stop rule, planning review, `arc check increment`, and the capture commit.

### The cut

`storage-cutover` retired into the subcohort `state-storage/storage-cutover` on 2026-11-03, by the procedure in
`RELEASE-GATES.md` § Decomposition until the cutover. This member continues its draft and carries the Must: the
rehearsal, the window, the flip change, the flip's whole workflow rewrite, and notes retirement. The boundary
decisions, the carve, and the follow-ons' placement are in `cohort-storage-cutover.md`.

The inbound items keep the numbers they had in `storage-cutover`'s buffer, shown in their headings. An item cited
here that this draft does not hold is in a follow-on member's draft under the same number.

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

- **Rehearsal** on a scratch repository first, then the window: quiesce, import, flip, retire notes
  (`analysis-storage-substrate-direction.md` § 10.3). Planning-only work units' artifacts import from their branch
  heads, `delivery-rebuild-continuity`'s included; implementation work units land first where possible, or park at
  a task boundary.
- **The register's cutover rows** whose fate the flip realizes (`cohort-state-storage.md` § Storage-coupling
  register).
- **Not here:** the deletion passes over what the flip makes dead (§ 10.4) and the documentation pass, which are the
  subcohort's four other members (`cohort-storage-cutover.md`).

### Where the inbound items land

The numbers are those in the items' headings, fixed at `storage-cutover`'s cut, and H1–H5 are the five hand-overs.
This map places items in sections only. Each is integrated or rejected at the Owner's planning pass.

- **Rehearsal:** #2, #5, #8, #15, #22, #25, #28, #30, #31, #34, and the rehearsal cases `seam-delivery-review`'s
  review left (the PM brief, § What the rehearsal needs first).
- **The window** (quiesce, import, flip, notes retirement): #7, #19, #23's quiesce and import clauses, #30, #34.
- **The flip change** (code that must change at the flip): #3, #9, #11, #18, #26, #27's notice, #32.
- **The flip's workflow rewrite:** #2, #6, #12, #13, #16, #21, #23, #25, #27, #37, H1, H4, H5.
- **Held by the follow-on members:** #1, #4, #10, #17, #20, #24, #25, #33, #35, H2, and H3, with the shares of
  #1, #10, #25, and #26 that `cohort-storage-cutover.md` names. Two items move to this member (Owner, 2026-11-05),
  each inbound entry staying in its member's draft until the move reaches it: H4 from `cutover-documentation`, for
  the flip's rewrite, and #3 from `cutover-tracked-state-removal`, for the flip change.
- **This draft's own text:** #29 (the Purpose line) and #36 (the citation repoint).

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

**At the flip, in the flip member:**

- **Rehearsal:** #2, #5, #8, #15, #22, #25's representative cut, #28, #30's bind, #31's partial-protection start, #34,
  and `seam-delivery-review`'s rehearsal cases.
- **Window:**
    - before the import: #2's session handoffs, #19's worktree locks, #23's in-flight review attempts finished, #30's
      teardown of ended holders and husks, and #34's save from every checkout;
    - the import itself: #7's tidy, notes bundles, reviews finished on other machines, and second run;
    - after the import: #15's in-place carry, and #30's bind or release of each pre-flip marker.
- **Flip change:**
    - #9 `arc sync` onto `pull` and `push`;
    - #11, the three capture gates onto `arc inbox`, whose dormant arm is `DormantStoreCommand`'s `inbox`
      (`commands/store-command-support.ts`);
    - #18 and #32, untrack the shared roots' files and stop every install into a projected root;
    - #26, the ROADMAP template's install entries and `verify-integrity.sh`'s presence test;
    - #27's Markdown notice.
- **Untrack the tracked state the import consumed,** with the readers that would then fail. This extends #18 beyond
  the projected roots, to the Candidate and transition records under `.arc/system/.internal/` (`candidates/` and
  `transitions/`; Owner, 2026-11-05). Nothing breaks if they stay, since both kinds are never projected
  (`review/candidate` and `lineage/transition` in `KIND_MECHANISMS`, `lib/store/registry.ts`), but they would mislead:
  stale copies of authority-bearing records in every checkout while the store moves on. And a missed in-repo reader
  then fails on the missing folder, which Stage 2 surfaces, rather than reading plausible stale state and passing.
  Only the data goes; the in-repo code that reads and writes it stays for `cutover-tracked-state-removal`. Item #3's
  `live-transition-records.test.ts` and its ARC contract tier selection (`lib/local-vitest-runner.ts` and its unit
  test) go here, since the test fails on the missing folder.
- **The workflow rewrite:**
    - #6, #12, #13, #16, #21, #23's five steps, #25's end state, #27's ceremony requests kept before each save, #37
      (the module deletion and the spine's remaining prose), H1, and H5, whose cadence is a save per review
      increment, at each approval gate's commit, so the selection a ceremony checks matches the increment (Owner,
      2026-11-05);
    - H4, `archive-work-unit.md` § Post-`Shipped` errata convention, whose "git history is the lock" misleads once a
      shipped meta is a stored record: a correction becomes a write to the completed item, and its history is the
      store's history of the archived meta (`spec-projection-write-back.md` § 8.4);
    - the always-loaded process text agents act on, which changes with the workflows: #14's Locus definition in
      `AGENT-BRIEF.ARC.md`, and the QUICK-REFERENCE verb index from #13;
    - the prose that arms auto-merge on `arc review planning-lane`, or claims the routing exemption through
      `arc review planning-grooming resolve`: `run-errand.md`, `drain-inbox.md`, and `setup-merge-gate.md`, with the
      planning-grooming lane selection in `route-discovered-work`. Both commands answer `reviewed` or
      `not-eligible` once state is untracked, so the steps would never fire again.
- **Notes retirement:** #7's notes-ref handling. The old notes ref stays on the importing machine under a namespace
  that is neither a tag nor pushed, so `git push --tags` cannot publish every past personal note, and goes with the
  notes residue refs in `cutover-notes-removal` (Owner, 2026-11-05). This settles analysis § 10.3's "keep the old ref
  as an archive tag" against #7.

**Follows, in the follow-on members** (`cohort-storage-cutover.md`):

- **`cutover-tracked-state-removal`:** #1's branch-tree readers, lifecycle classification, lifecycle hook checks,
  and CI planning classifier (the per-check sort below); #4;
  #10's import transform, after the window's second import run; #20; #24; #26's in-repo arms and `DERIVED_VIEWS`;
  #35; H2; and the residue refs, once the held delivery work unit's artifacts are imported.
- **`cutover-notes-removal`:** #1's notes-sync machinery, #10's sync-state ref, #17, and the notes configuration
  keys, once #37's module deletion leaves them no reader.
- **`cutover-decompose-removal`:** #25's deletion set.
- **`cutover-documentation`:** #33, H3, the strategy rewrites the register names, and the ADR supersessions and
  amendments.

**The per-check sort** (2026-11-03): every lifecycle hook check and every part of the CI planning classifier
follows. None fails once tracked state is gone, and nothing relies on its result; only the prose acting on two
classifier commands goes at the flip, in the workflow rewrite above. None refuses the flip commit itself, which deletes
their inputs: each selects staged files with `--diff-filter=ACMR` (`.arc/system/.internal/githooks/pre-commit`), so a
deletion gives it nothing to read, and no tracked document outside the state roots, `docs/`, and the tests links into
them (checked 2026-11-05). The checks' detail and the deletion's ordering hazards are in
`draft-cutover-tracked-state-removal.md`.

### Building before `projection-worktrees` lands

Phases that touch no unlanded member can build in the flip member before `projection-worktrees` lands. They still land
at the flip.

- **Rehearsal:** Stage 1 whole, with its copy driver (§ The rehearsal); for Stage 2, #22's matrix, #31's
  partial-protection start, and the harness for `seam-delivery-review`'s cases.
- **Quiesce:** #19's lock, and the check that the quiesce holds.
- **Flip change:** #11, #26's install entries, and #3's test removal.
- **Workflow rewrite:** every step from a landed member: #6, #12, #13, #16, #21, #23, #25, #37, and H4.

What waits:

- for `projection-write-back`: #2, #5, #27, and H5;
- for `projection-worktrees`: #9, which rewires `handleSync` (`handlers/sync.ts`) where that member adds its
  rebuild of deleted files ahead of the network steps (`spec-projection-worktrees.md` § 2.4), and #18;
- for `adopter-install-authority`'s specification: #32;
- for `cohort-identity-verbs`: H1.

---

### The quiesce, and the check that it holds

Decided 2026-11-05 (Owner): check, then import at once, with the import's own comparisons as the witness, plus a guard
that seals the pre-flip builds. ARC sees no harness session, so the Owner stops every other session, in every harness,
after each has handed off (#2); no message round asks them to stop. What ARC can see, it checks.

**The check,** run from the importing checkout immediately before the import, refuses with each failing checkout
named:

- the primary and every checkout whose marker names a work unit or an Errand is clean and its branch matches its
  upstream, so each in-flight implementation unit sits at a task boundary, landed or paused; ARC's machinery checkouts,
  which carry no such marker and sit detached by design (`spec-projection-worktrees.md` § 2.5), are torn down or
  named;
- every linked checkout whose marker names a work unit or an Errand holds the projection's lock (#19), the window
  having run `git worktree lock --reason` with `PROJECTION_LOCK_REASON` (`lib/git/worktree-removal.ts`) on each one
  without it;
- no ended holder or work-unit husk remains to tear down (#30);
- every checkout's build carries the sealing guard below.

Then every checkout saves its personal state (#34), and the import runs. **The import is the witness for personal
state:** it refuses a notes file whose disk copy differs from its saved copy, an attempt in flight in the review gate,
and an unmapped review source, so a write that slipped past the stop refuses the import rather than vanishing. The
hardening's trials ran this sequence in trial form, a save from every registered checkout and then the import, clean
four times. The check also records each worktree's `HEAD` and a digest of its personal files; after the import it computes
them again, and any change stops the window before the flip change.

**The sealing guard** closes the one silent loss. Each checkout runs its own build, so a checkout that has not merged
the flip would keep writing tracked state and Git notes after the import. Its personal writes would vanish, since the
import retires notes. A small change lands on `main` ahead of the window: the in-repo implementation, and every notes
write, refuses once `refs/arc/project/registry` exists, naming the remedy (merge base and rebuild). No such ref exists
before the import, and every worktree on a machine shares one ref namespace, so the guard fires in every checkout the
moment the primary imports. It lands ahead of the rehearsal, not only the window, so the rehearsal's copy carries it and
exercises the moment it exists for. A clone on another machine sees the ref only through ARC's state fetch, so other machines
stay a residual the window's own steps cover (#7). The guard is dead once the in-repo implementation goes, so
`cutover-tracked-state-removal` deletes it with that implementation. Since it must be on `main` before the rehearsal,
it cannot ride this unit's single landing: it lands as an Errand built from this section (Owner, 2026-11-05).

**Where the check lives** (Owner, 2026-11-05): a script in this unit's change, reviewed and tested with it and exercised
by the rehearsal, since it gates an irreversible step; `cutover-tracked-state-removal` deletes it with the in-repo
implementation.

### The window's abort and recovery

Decided 2026-11-05 (Owner). Three of the window's steps cannot simply be undone: the import's push publishes
`refs/arc/*` to a public origin, notes retirement deletes the remote notes refs, and the flip merges to `main`. The
sealing guard adds a fourth hazard: once `refs/arc/project/registry` exists locally, every pre-flip build refuses its
writes, so a failed import with no usable store behind it would leave every checkout on the machine unable to write.

- **Ordered steps, each with an abort rule.** The window runs as ordered steps; any refusal, mismatch, or failed check
  stops it at that step.
- **Before publication,** an abort deletes the local `refs/arc/*`, which also lifts the guard, and the repository is
  as it was.
- **After publication,** an abort also deletes the remote refs. The pre-import tidy (#7) exists because anything
  pushed may already have been copied.
- **Notes retire last,** after the flip has merged and the first materialization has succeeded, so the notes stay a
  valid fallback until then.

The spec sets the exact steps and their abort points from the import's stages.

### The rehearsal

Decided 2026-11-05 (Owner): two stages, each on a full copy of this machine's repository, stopping at the host
boundary, with the first landings after the window as canaries for what lies past it.

**Two stages, because of the dates.** One dress rehearsal could not start until `projection-worktrees` lands and the
flip change builds, which would put every step's first run in December, with the 2027-01-08 fallback close behind. The
window's mechanics need neither, so they run first.

- **Stage 1, the window's mechanics,** from this unit's branch before the flip change exists, once the sealing guard is
  on `main` and the quiesce check builds. Its build is today's machinery plus the check. It runs the quiesce check
  (§ The quiesce, and the check that it holds), a save from every copied checkout (#34), and a real import, publication
  included, then:
    - the sealing guard refusing an in-repo write in every copied checkout once the import has run;
    - the import's second run and notes retirement (#7);
    - the accounting case (§ Tracked state the import does not claim);
    - #8's chain comparison;
    - case 1 below;
    - the import's time and peak memory, under `memcap_gated -m 6G` with its in-process ceiling below that cap.

  It runs twice. The first runs on a copy without the pre-meta backfill, reverted there if it has landed, so its
  accounting case reports the twenty folders and shows the case catches the omission it exists for. The second runs
  with the backfill and confirms it.
- **Stage 2, the dress rehearsal,** at the flip branch's head once the flip change builds. On a fresh copy it runs the
  whole window in order: Stage 1's steps, then the flip change merged and rebuilt, each worktree's first
  materialization, #15's and #30's checkout carries, and the per-branch untracks and workspace removals (§ Tracked
  state the import does not claim). Then it runs:
    - #5's parser check, which rests on `projection-write-back`;
    - #2's work unit end to end through the rewritten workflows, through `arc publish`, with its pre-publication review
      on the local source;
    - cases 2 to 7 below, and the other store-backed paths;
    - #28's representative cut (#25).
- **Alongside Stage 2,** #22's matrix and #31's partial-protection start run in synthetic scratch repositories
  through the spawned built CLI, as #22 specifies.

Each stage records its run under `~/dev/arc-evidence/cutover-flip/` on this machine. A failure is fixed in this unit's
change and its stage re-run. The window opens only after a clean Stage 2, which re-runs at the new head after any later
change to the flip change, the import, or the rewritten workflows.

**Copy safety.** The hardening's trial driver copied the primary with `cp -a`, which left `origin` on the host and the
copy's worktree registrations on the live checkouts; a trial publishes nothing, so neither mattered. A real import would
publish to the host and could reach the live worktrees. Before any `arc` command in a copy, the driver rewrites every
remote to a local bare mirror and repairs each worktree registration to its copied checkout (`git worktree repair`). It
then asserts both, with `storage.backing_repository` naming no other repository and `gh` finding none in the copy. A
copy that fails any of these stops the stage.

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

Item #2's run also deliberately takes the other paths the passes name:

- a re-entry carrying the Owner's judgments after a scope refusal, a self-review retry among them;
- a native re-entry from an imported saved replay grant, where the copy's import carries one;
- a reopen followed by session-init;
- a work unit started under an archived unit's slug;
- an earlier member's readiness once #28's cut closes its cohort.

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
- #36, the repoint from `spec-storage-projection.md`: each projection member's § 18.
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

Item #32's member depends on this one, so its assumption constrains this unit downstream rather than gating it. #19 rests
on `spec-projection-substrate.md` § 12.7, which has landed. #23's conditional on `delivery-observe-attest` is an open
question, not an assumption.

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
  projected roots: the ROADMAP and ATOMIC-INBOX templates and `completed/README.md`. The gap below is the flip's own.
- **#27, and the segmentation-check capture:** write-back § 11.7's selection holds `active/current/`'s task list,
  read through `readProjectedSelection`; the descriptor check's form is the flip's choice.
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
path, three groups go unclaimed:

- twenty pre-meta work-unit folders — 2025-q4's `01` to `04`, 2026-q1's `01` to `07`, and 2026-q2's `01` to `09` — each
  holding a PRD, a task list, and completion, notes, or atomic files, but no meta;
- `completed/2026-q1/completed-atomic-2026-q1.md`, at a quarter folder's top level;
- `completed/README.md`, an installed file the flip deletes (#18, #32).

Closed cohorts' folders (`<n>a_cohort-<slug>/`) are claimed: the import recovers their archive coordinate
(`cohort-source.ts`). Untracking `completed/` at the flip would leave the first two groups in Git history only.

**They get metas before the rehearsal** (Owner, 2026-11-05), in an Errand captured in `USER-INBOX § Errand`, so the
rehearsal's import claims them, rather than moving out to a tracked folder beyond the projected roots. One archive keeps
every shipped work unit, and nothing else in the repository reads a second location. The backfill is mechanical:

- one meta per folder in the shape of the earliest archived metas, its values taken from the folder's own files or Git
  history and `—` or `[none]` where neither says, its `Origin` line naming it a reconstruction and any field it
  inferred, with `Design: [none]`, since a meta's design names only its own
  `draft-` or `spec-` file (`checkMetaDesignEntry`, `lib/store/kinds/meta/reference-rules.ts`); each `prd-<slug>.md`
  imports beside it as a companion;
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

A third follows from untracking the `.internal/` records (§ Direction): a branch whose Candidate record differs from
`main`'s would meet the flip's deletion as a modify/delete conflict at its next merge of `main`, so each such branch
deletes its own copy after the import, beside its `.arc/active/` untrack.

### The import's part, released

The hold on the import's part lifted when `storage-ref-hardening`'s trial imports (its Tasks 5.12 and 5.13) came back
clean on 2026-11-03. No separate import rerun over current `main` runs before the rehearsal (Owner, 2026-11-05): the
hardening's real-state trials took its place, the last at its final head `6343d32b6c` (`task-8.1-20261105T000620Z`).
Each saved every registered checkout first, bound the review mapping, refused no record, and accounted for every review
source (`notes-storage-ref-hardening.md` § Verification at the final head). A trial places no store and publishes
nothing, so the build and publication stages first run in the rehearsal's own import, at its head. Items #7, #8, #34,
and #23's import-trial clause draft now.

---

## Inbound Buffer — Pending Integration

> _Routed-in concerns pending integration at this work unit's first planning iteration. Integrate — or_
> _consciously reject — each one._

### `[ ]` **2. Rehearse the flip's workflow rewrite end to end, and quiesce every session holding today's workflow text**

- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: storage-cutover`), housekeep drain (2026-09-30); captured during
  `storage-contract` draft-design, adversarial pass 6 and a review of the reframe (2026-09-30).
- _Observation:_ `storage-contract` decided (Owner, 2026-09-30) that ARC's process changes once, at the flip. The
  flip rewrites each affected workflow step from the consumer map's end states (`notes-storage-contract.md`), each
  rewrite checked against `strategy-procedure-evolution.md`, and the register's workflow-steps row moves to this work
  unit. `arc save`, the projection's write-back, the close verb closing tasks and capturing their commits, and the
  import's footer-derived captures all first run for real there. This draft's rehearsal covers quiesce, import, flip,
  and notes retirement, but not a work unit driven end to end through the rewritten workflows.
- _Observation:_ nothing may break across the flip (`storage-contract` C13). A session still holding pre-flip
  workflow text in context would follow steps the rewrite removed, so quiesce has to reach live sessions, not only
  in-flight work units.
- _Approach:_ Add to the rehearsal a work unit run through the rewritten workflows on the scratch repository — draft
  capture, create-spec with an ADR companion, a task closed through the close verb, handoff, prepublication with the
  review copy, and integration's candidate tail — and add to quiesce that every session hands off before the flip, so
  each resumes on the rewritten text.

### `[ ]` **5. Confirm at the flip rehearsal that every hand-editable projected kind has its parser and entry shape**

- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: storage-cutover`), housekeep drain (2026-10-11).

- _Shapes:_ its rehearsal before the flip, and the register row "Lifecycle hook checks" ("Removed at cutover, except
  content rules that move into a record-family parser").

- _Observation:_ the projection's write-back is an ordinary contract `write`, so a kind whose parser slot is empty
  (`createKindRegistry` in `lib/store/registry.ts`) writes unvalidated, as D5 defines. Merge does not need the parser —
  entry merge takes its shape from the kind's mechanism — so nothing fails visibly. But the commit-time content checks
  retire at the cutover, and the parser is both their replacement and what refuses edits to verb-owned fields. A kind
  the projection makes hand-editable that reaches the flip with an empty slot accepts any hand edit unchecked.

- _Observation:_ entry merge has the same gap one level down. `mergeEntryText` (`lib/store/concurrency/entry-merge.ts`)
  takes the entry grammar and its sections as an argument, from the kind's `entry` config in `KIND_MECHANISMS`. Three
  entry-merge kinds declare none — `work-item/description`, `work-item/inbound`, and `personal/errand-queue` — where
  `personal/inbox`, `project-inbox/inbox`, and `personal/working-memory` do, so a hand edit to one of them has no
  grammar to merge by once it is projected.

- _Approach:_ a rehearsal check that lists every kind with a writable projected path and refuses the flip while any of
  them has an empty parser slot, or, merging by entry, no entry config.

- _Drain note (2026-10-11):_ the check slot, not the record parser, refuses edits to verb-owned fields; the
  write path registers through `PRODUCTION_REGISTRATIONS`.

- _Captured during:_ `storage-projection` draft-design, 2026-10-09; widened to entry shapes at its draft close,
  2026-10-10.

### `[ ]` **6. Take `storage-seam`'s flip-rewrite obligations into the cutover's workflow rewrite**

- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: storage-cutover`), housekeep drain (2026-10-11).

- _Shapes:_ the flip rewrite of workflow steps and the deletion pass.

- _Observation:_ `storage-seam`'s settled decisions leave cutover steps the consumer map's workflow rows do not name:
  § 5.4, § 6.5, and § 8.4 of `spec-seam-record-kinds.md`, and item 9 in `draft-seam-locus.md`. Move every step
  that hand-edits `Class` onto the Class verb, or a shipped `--class` flag where one covers it: none covers activate's
  Step 4, init's post-init ratchet, a new work unit's resolution, init's Errand-promotion step 6, promote's Step 2, or
  draft-design's capture. Move the steps that hand-edit `Branch`, deactivate's Case C and init's re-run, onto verbs.
  Rewrite the cohort template's "convenience pointer" note on `Parent`, which becomes the cohort's stored nesting.
  Retire `hooks.task_numbering` with the task-numbering hook, since the write check reads no configuration. Where the
  rewrite takes `inbound-routing-method`'s from-the-flip binding for the `route-discovered-work` method, the
  `_Routed from:_` line's date moves to `_Created:_`, and an Integrating work unit is no routing target, which amends
  that work unit's D2.

- _Approach:_ fold each into the flip rewrite's step list, checked against `strategy-procedure-evolution.md`.

- _Captured during:_ `storage-seam` draft close, 2026-10-09.

### `[ ]` **7. Carry the import's second run, the pre-import tidy, and every machine's notes and reviews into the window**

- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: storage-cutover`), housekeep drain (2026-10-11).

- _Shapes:_ its § Scope, "Rehearsal on a scratch repository first, then the window: quiesce, import, flip, retire
  notes".

- _Observation:_ `storage-ref-backend`'s import (`draft-storage-ref-backend.md` § Decisions, The migrate verb and the
  import) leaves the window five steps. Run the import again after the first push: that run deletes the
  transient-identity refs from the remote, each leased on the tip the import re-homed, and drops the tips it kept under
  `refs/arc/tmp/migrate/`. Tidy this repository's personal state before the import, worked from the import's trial run,
  since on a public repository the import publishes it for good. Bring every machine's notes to the importing machine
  by `git bundle` or a fetch between machines, since the remote notes refs are deleted and the import refuses a notes
  file that differs from its disk copy. Finish review on every machine but the importing one, since the review gate's
  repository ID is minted per clone and only the importing clone's facts are read. And keep the old notes ref outside
  `refs/tags/`, or drop it, so `git push --tags` cannot publish every past personal note.

- _Approach:_ fold the five into the window's runbook, and confirm at import that no draft's buffer section or held
  capture is left behind, since the import converts both into inbound lists.

- _Captured during:_ `storage-ref-backend` draft close, 2026-10-10.

### `[ ]` **8. Compare every Candidate chain through the store with today's reader in the rehearsal**

- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: storage-cutover`), housekeep drain (2026-10-11).

- _Shapes:_ its § Scope, "Rehearsal on a scratch repository first".

- _Observation:_ the import replays each Candidate record's versions from the plain path log today's chain reader walks
  (`readRepositoryCandidateSupersessionChain`, `lib/work-unit/candidate-record-store.ts`), since the in-repo `history`
  follows renames and drops a version a merge commit introduced. Today's reader refuses six records:
  `evidence-applicability` at a broken chain link (`resolveCandidateSupersessionAncestors`), and five that fail today's
  Candidate schema before any chain walk (`readCandidateRecordVersioned`). The import carries all six unchanged.
  `storage-ref-backend`'s tests compare the two readers over a fixture; only the rehearsal can compare every record in
  this repository.

- _Approach:_ in the rehearsal, read every Candidate record's chain through the store's `history` and through today's
  reader, and require the same chain or the same refusal for each (`draft-storage-ref-backend.md` § Decisions,
  Verification).

- _Captured during:_ `storage-ref-backend` draft close, 2026-10-10.

### `[ ]` **9. Rewire `arc sync` onto the store's `pull` and `push`**

- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: storage-cutover`), housekeep drain (2026-10-11).

- _Shapes:_ its § Scope, the window's flip.

- _Observation:_ `storage-ref-backend` renames the contract's `sync()` to `push({ carry? })` and adds `pull()`, while
  `arc sync` keeps its name and runs both, pulling then pushing (`draft-storage-ref-backend.md` § Decisions, Sync). No
  production code calls the contract's `sync()` yet, so the rename is cheap; rewiring the command is the flip's.

- _Approach:_ at the flip, point `arc sync` at `pull` then `push`, and remove its notes path with the notes machinery.

- _Drain note (2026-10-11):_ overlaps the held entry "Delete the code `cli-substrate-complete-migration` carves
  out" on removing notes-specific sync; integrate them together.

- _Captured during:_ `storage-ref-backend` draft close, 2026-10-10.

### `[ ]` **11. Carry `arc user inbox-list` and the capture exit guards across the flip**

- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: storage-cutover`), housekeep drain (2026-10-13).

- _Shapes:_ § Scope's deletion passes, and the inbound entry "Take `storage-seam`'s flip-rewrite obligations into the
  cutover's workflow rewrite".

- _Observation:_ `arc user inbox-list --target <slug>` (`handlers/user-inbox-list.ts`, `lib/user-sync/inbox-target.ts`)
  lists the personal-inbox captures whose `WU_Target` line names a work unit, held or not. `create-spec`'s owner's
  pass, `activate-work-unit`'s pre-condition gate, and the start of `verify-work-unit` dispatch on it. It reads the
  inbox file under the notes lock and parses the three target-line spellings in use, like the other `arc user inbox-*`
  verbs the cutover replaces.

- _Approach:_ at the flip, re-point its reader onto the store's inbox records, keeping the `clear` / `named` /
  `refused` result and adding the entry ID. D11 routes captures straight into a work unit's inbound list and retires
  owner adoption, so the three guards should then also read the work unit's pending inbound count, which session-init
  orientation already carries. Rename the verb with the other inbox verbs if `naming-conventions` moves them.

- _Update (2026-10-12):_ `seam-locus` renames the verb from the flip: `arc inbox <list>` (`personal`, `project`, or a
  work item's slug) replaces `arc user inbox-list`, and `--target <slug>` keeps the `clear` / `named` / `refused`
  result with each row's ID and version; `arc inbox <slug>` lists a work unit's inbound list with its pending count and
  oldest age (`draft-seam-locus.md` § Locus, "One entry listing, `arc inbox`"). The flip rewrite moves the three gates'
  calls onto it.

- _Captured during:_ the `capture-exit-guards` Errand, 2026-10-11.

- _Drain note:_ the inbound entry "Delete the code `cli-substrate-complete-migration` carves out" and the register's
  notes-specific sync row keep the inbox writer and the `user inbox` mutations as survivors, while
  `spec-seam-locus.md` § 1.5 lists `arc user inbox-list --target` among the arms the deletion pass removes; settle
  which holds.

### `[ ]` **12. Rewrite the task loop's completion around the task close verb**

- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: storage-cutover`), housekeep drain (2026-10-13).

- _Shapes:_ the register row "Workflow steps commit state with `git`" (`cohort-state-storage.md`), whose fate closes
  the task loop through the close verb, and the inbound entry "Rehearse the flip's workflow rewrite end to end, and
  quiesce every session holding today's workflow text".

- _Observation:_ from the flip `arc task close` closes tasks after the commit and captures their commits (D16), and
  `arc release commit --close` runs it at the commit fire site under the approval that covers work and commit
  (`draft-seam-lifecycle.md` § Lifecycle, "The task close verb"; Owner, 2026-10-12). Today the loop marks `[x]` before
  the commit, runs the quality request over that completion edit, and removes the `[x]` on red.

- _Approach:_ the loop writes no `[x]`; the red-path removal and the pre-report checklist's "Task marked [x]" line go,
  the verb's result standing as the record; the completion note stays the agent's hand edit before the gate; deferred
  review closes its range in one call. Two steps reorder: the `post-task-completion` extension, which syncs an external
  tracker and today fires before the gate, fires after the close; and delivery's correction acknowledgment, which
  closes the task mid-protocol and then resumes.

- _Captured during:_ `seam-lifecycle` draft-design close, 2026-10-12.

- _Drain note:_ `spec-seam-lifecycle.md` § 9.5 carries the provider text, including a hand `[~]` becoming `arc task
  defer`.

### `[ ]` **13. Rewrite park and resume as pause and resume**

- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: storage-cutover`), housekeep drain (2026-10-13).

- _Shapes:_ § Scope's documentation pass, and the register row "Workflow steps commit state with `git`"
  (`cohort-state-storage.md`).

- _Observation:_ from the flip `arc pause` and `arc resume` replace `arc park`: a pause is a record on the work item,
  not a move; the checkout stays unless released (`arc locus release`); the pointer record, park from Planning's
  landing, and the parked position retire (`draft-seam-lifecycle.md` § Lifecycle, "Lifecycle moves from the flip";
  Owner, 2026-10-12). The two workflows shrink to the verbs.

- _Captured during:_ `seam-lifecycle` draft-design close, 2026-10-12.

- _Drain note:_ `spec-seam-lifecycle.md` § 19 also names QUICK-REFERENCE's verb index, where `arc pause` replaces `arc
  park`.

### `[ ]` **14. Let the Locus definition end a work unit's locus at release as well as teardown**

- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: storage-cutover`), housekeep drain (2026-10-13).

- _Shapes:_ § Scope's documentation pass, over the rules the register marks rewritten at cutover.

- _Observation:_ the definition says a WU-owned locus "is exclusive from spawn, materialization, or explicit `--here`
  entry through exact teardown". From the flip `arc locus release` also ends that role: it releases a paused work
  unit's checkout for its owner, or a checkout whose work unit another identity owns, and for an anchored checkout
  releases only the marker (`draft-seam-locus.md` § Locus, "Pause, from the flip"; Owner, 2026-10-12). The sentence
  becomes "through exact teardown or release".

- _Files:_ `packages/arc-framework/arc/reference/briefs/AGENT-BRIEF.ARC.md`, synced to `.arc/reference/briefs/`.

- _Captured during:_ `seam-locus` draft-design close, 2026-10-12.

- _Drain note:_ `strategy-work-organization.md` and `resume-work-unit.md` carry sibling sentences that end a locus at
  teardown alone.

### `[ ]` **15. Rehearse the flip's carry of checkouts claimed in place before it**

- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: storage-cutover`), housekeep drain (2026-10-13).

- _Shapes:_ § Scope's rehearsal.

- _Observation:_ before the flip no in-place arm writes a checkout marker — the cold start, `arc start --here`'s
  graduation, and `arc materialize --here` all leave none — and the import leaves the marker out as machine-local. From
  the flip, locus derivation reads only the marker and the store, so every checkout claimed in place before the flip
  holds its work unit with no marker. `seam-locus` designs the carry: session start offers
  `arc materialize <slug> --here` for a marker-less checkout that has out a branch an owned in-flight work unit links,
  and a work unit no checkout holds, one cold-started on base under partial protection among them, takes the ordinary
  materialize offer (`draft-seam-locus.md` § Locus, "Checkouts claimed in place before the flip").

- _Approach:_ the rehearsal runs both: a pre-flip `arc start --here` checkout on a work branch under full protection,
  and a cold start on base under partial protection, each carried to an anchored marker after the import.

- _Captured during:_ `seam-locus` draft-design, fourth adversarial pass, 2026-10-12.

- _Drain note:_ `spec-seam-locus.md` § 2.7 now lists more in-place arms than this entry: in-place resume, and
  promotion on the primary.

### `[ ]` **16. Rewrite the workflow steps the seam's lifecycle verbs replace**

- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: storage-cutover`), housekeep drain (2026-10-13).

- _Shapes:_ the register row "Workflow steps commit state with `git`" (`cohort-state-storage.md`), and the inbound
  entry "Take `storage-seam`'s flip-rewrite obligations into the cutover's workflow rewrite", whose `Class` list this
  entry partly repeats.

- _Observation:_ `draft-seam-lifecycle.md` (Owner, 2026-10-12) adds verbs and results whose workflow text changes only
  at the flip, as the seam changes no workflow text before it:
    - `arc set-class` replaces each step that hand-edits `Class` where no `--class` flag covers it (§ Lifecycle, "The
      Class verb");
    - `Owner` turns verb-owned, so the person-to-person handoff's hand edit (`session-handoff.md`'s handoff note,
      `strategy-team-coordination.md`'s handoff passages) moves to `arc handover`, and `init-work-unit.md`'s step
      preserving the stub's `Owner` goes, since starting a stub records the starter;
    - activation's result names the old name's remote deletion as a typed action only for a branch link recorded
      `created`, so `activate-work-unit.md` Step 5 runs the actions the result names rather than its raw
      `git push origin --delete`; deactivation keeps the work branch, so `deactivate-work-unit.md` Step 3's remote
      delete goes;
    - `arc base sync`'s detached arm lives in `handleBaseSync` (`handlers/base.ts`), whose consumer-map row is this
      work unit's, so the two serialize on that file.

- _Captured during:_ `seam-lifecycle` draft-design close, 2026-10-12.

### `[ ]` **18. Leave no tracked or installed file in a projected root from the flip**

- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: storage-cutover`), housekeep drain (2026-10-15).

- _Shapes:_ § Scope — the flip and its first full materialization; an expected contract in
  `spec-storage-projection.md` § 18.

- _Observation:_ from the flip `.arc/active/`, `.arc/backlog/`, and `.arc/completed/` are projected roots. Today the
  roots hold tracked files the import turns into records, and the installer writes files there
  (`lib/classification.ts`). `completed/README.md` is a Configurable file that `arc update` reinstalls; no record
  claims it, so it stays unadopted and every checkout removal refuses over it until it is deleted.
  `backlog/ROADMAP.md` and `backlog/ATOMIC-INBOX.md` come from Scaffolded templates installed at the paths the
  projection writes the roadmap view and the project inbox to (`lib/layout/projection.ts`), so an install there writes
  over a projected file.

- _Approach:_ at the flip, untrack the shared roots' files once their records are imported, and stop the installer and
  `arc update` writing any file into a projected root (drop or relocate those entries in `lib/classification.ts` and
  `init-recipe.json`).

- _Captured during:_ `storage-projection` generate-tasks, adversarial pass 1 finding F17 (approved disposition),
  2026-10-14.

### `[ ]` **19. Lock every unlocked work-item worktree at the cutover's quiesce**

- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: storage-cutover`), housekeep drain (2026-10-15).

- _Shapes:_ § Scope — the window's quiesce; an expected contract in `spec-storage-projection.md` § 18 and its § 12.7.

- _Drain note:_ `PROJECTION_LOCK_REASON` is not in code yet (2026-10-15); it lands with `storage-projection`.

- _Observation:_ `storage-projection` locks each work-item checkout ARC spawns, with `PROJECTION_LOCK_REASON`, but runs
  no one-off backfill: a worktree spawned before its lock landed takes the lock only when it is next spawned. One left
  unlocked at the flip is exposed to a plain `git worktree remove`, which deletes its gitignored projection without
  persisting its edits.

- _Approach:_ in the quiesce, run `git worktree lock --reason` with the value `PROJECTION_LOCK_REASON` holds, read from
  the built constant, on each linked checkout whose marker names a work unit or an Errand and that carries no lock;
  leave anchored and unmarked worktrees unlocked.

- _Captured during:_ `storage-projection` generate-tasks, adversarial pass 1 finding F22 (approved disposition),
  2026-10-14.

### `[ ]` **21. Drop the retired extension step from the task-close rewrite's reorder**

- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: storage-cutover`), housekeep drain (2026-10-15); split from
  "Reconcile task-close sequencing and the storage reader inventory with retirement".

- _Shapes:_ inbound "Rewrite the task loop's completion around the task close verb".

- _Observation:_ that entry reorders the `post-task-completion` extension to fire after task close, but
  `retire-extension-points` removed the step outright.

- _Approach:_ drop the extinct extension reorder while preserving task-close and delivery acknowledgment behavior. The
  capture's other half, removing extensions from the cohort register's reader census, runs as an Errand.

- _Captured during:_ `retire-extension-points` draft close, 2026-10-13.

### `[ ]` **22. Run the full destructive CLI matrix with the flipped backend before release**

- _Routed from:_ `seam-locus` terminal verification, 2026-10-16.

- _Shapes:_ § Scope's scratch-repository rehearsal and pre-release validation of the actual backend flip.

- _Observation:_ the current production executable selects the in-repo backend. `seam-locus`'s A17 proves dormant
  destructive success and repaired continuation through registered CLI-generated handler inputs, the reference Store,
  and real Git; its built-CLI scenarios prove pre-flip refusals. That split leaves successful execution through the
  actual flipped built CLI unproven. The full 14-group matrix is in `notes-seam-locus.md` § Destructive-path
  verification and flip release checks; the obligation belongs to the work unit that controls the flip.

- _Required check:_ run every group below in scratch repositories through a spawned built CLI selecting the real
  flipped backend and production ports, before releasing the flip. Cover success, each material refusal, and successful
  continuation after repair. Retain command results and observable record, UID, marker, checkout, code-ref, and personal
  byte outcomes. Handler/provider success does not discharge this check. Keep current handler-versus-built-CLI evidence
  labeled separately; the templates locate existing scenarios rather than asserting a live flipped-backend pass.

- _Matrix:_ paths for the templates are under `packages/arc-framework/__tests__/integration/`, unless identified as
  unit/provider coverage in `notes-seam-locus.md`.

    1. cold/named start and default bound lifecycle ports: One Planning Store primary; anchored marker/editor excludes
        only in checkout; HEAD/base unmoved; held/former/Errand name and second marker refuse before writes; repaired
        retry; default ports and rebind preserved. Templates: start-cold-store; lifecycle-default-locus-ports;
        lifecycle-marker-occupancy; executor-context.
    2. graduate/materialize/rename/teardown: Occupied marker refuses before Git; materialize existing
        local/remote/branchless work and --here; rename follows marker holder; completed anchored teardown clears marker
        and retains adopted resources as specified. Templates: lifecycle-default-locus-ports;
        lifecycle-marker-occupancy; materialize-store-cli; materialize-store; corresponding work-unit verb units.
    3. locus release anchored/spawned: Live owned marker refuses until pause; anchored release preserves dirty files and
        record; spawned dirty/unpreserved detached commits refuse; repair then removes only intended
        checkout/registration; fresh marker generation required. Templates: locus-release; session-cli-repair release
        case; unit/locus/release.
    4. inbox + route insertion/move/carry: Listed stable ID/version; atomic source removal/destination insert/both
        receipts; stale version stays; racing edit lists survivor with derived home; failed carry preserves both;
        repaired carry replaces intended owner entry only. Templates: inbox-cli-dispatch; inbox-cli-repair; lib/inbox
        route/mover/survivor/receipt units.
    5. errand queue and queue set: Queue IDs/ranks resolve listed entries; duplicate IDs refuse unchanged Store;
        repaired stdin accepted; ineligible members reported; selected start consumes only chosen queue member.
        Templates: inbox-cli-repair; inbox-cli-dispatch; queue/queue-ranks/offer units.
    6. full/partial open + link: Project queued capture moves into description with date/ID and leaves queue; text
        description minted; link appends actual capture; correct real branch/marker; partial origin binds listed
        version. Templates: inbox-cli-dispatch; R adoption/batch units.
    7. Errand leave and rematerialize: Dirty checkout refusal preserves bytes and record; real preservation permits
        pause and exact checkout removal; missing code ref refuses unchanged; restored code permits the same UID/claim
        and saved HEAD to resume. Templates: errand-preservation-store-cli.
    8. abandon and failed-open rollback: Full abandon returns receipt-selected source; collision names version-bound
        carry repair and leaves data/marker; repaired carry+retry succeeds; partial abandon leaves capture/queue; real
        provisioning failure returns entry; repaired same-slug retry allocates fresh active description and preserves
        failed generation. Templates: inbox-cli-repair; errand-open-rollback-cli.
    9. close and ID/version removal: Partial close removes only observed version after real preservation evidence;
        edited/later capture retained and replay absent; unchanged full close leaves description/later same-ID capture;
        actual changed-code landing stores qualified landingCommit; terminal/merge A20 failed claims repair. Templates:
        inbox-cli-dispatch; inbox-cli-repair; close-store-landing; terminal-authority-store. The last two are
        provider/selector templates, not an existing complete built CLI host flow.
    10. promotion: Same UID role replacement, correct authorized checkout/foreign confirmation, branch cut/recovery and
        exact anchored marker settlement; description/history retained; promoted task-close set includes Errand work.
        Templates: errand-promote-store-cli; promote-store; promote-store-runtime; integration/errand-promote-store;
        integration/unclosed-task-commits. Registered-source success covers the primary checkout and both floors;
        spawned/foreign variants retain runtime/provider coverage.
    11. personal reconcile --apply / scratch: Managed links change through Store and lookup; stale support refuses
        before writes; prose/histories unchanged; occupied scratch preserved, owner repairs destination, alias move
        succeeds without advancing Store version or HEAD. Templates: user-reference-scratch-cli;
        user-reference-reconcile-store; session-cli-repair scratch case.
    12. handoff write file/stdin: Actual computed Store/Git anchors; overwrite exact session context; forged
        anchors/section boundary refusal unchanged state; repaired stdin succeeds; local maintain report only exceeded
        measurements; post-write maintain failure remains diagnostic. Templates: handoff-write-store; session-cli-repair
        handoff case; handoff-tripwires.
    13. identity add/init/join: Selected identity binding before configured identity; pull before read/seed; seed only
        absent records; warn on reuse; explicit decline/cancel preserves configuration/data; repaired/new choice seeds
        only selected person. Templates: identity-setup-store-cli; join-store-cli; identity-setup-store;
        user-personal-store-callers.
    14. session-init / handoff status / recovery / Candidate orientation: Real backend persisted state supplies slots,
        asOf task baseline and restate changes; unavailable state rebuild preserves original Git/same subject; mismatch
        stops; unclosed set and close/resume action appear; exact Store-owned Candidate ignores checkout bytes and
        repairs missing/conflicted state. Templates: completed-subject-matrix; recovery-state-basis/store-evidence;
        restate-store; unclosed-task-frame; recovery-unclosed-task-commits; subject-meta-candidate.

### `[ ]` **23. Take `seam-delivery-review`'s flip-rewrite steps into the cutover's workflow rewrite**

- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-10-19).
- _Shapes:_ Workflow rewrite, review-copy treatment, review import/quiesce, and deletion pass

- _Observation:_ `seam-delivery-review`'s spec (`spec-seam-delivery-review.md` § 12.6 and § 14.2, on
  `plan/seam-delivery-review` until it merges) leaves five workflow-text changes to the flip, which changes workflow
  text once:
    - `integrate-work-unit.md`, `prepare-work-unit.md`, and `verify-work-unit.md` drop their record-commit and
      keep-staged steps, since from the flip delivery makes no record-only commits and its next actions name no
      `commit-*` step (that spec's § 14.3); attest's commit step stays, for the review copy alone, which `arc attest`
      writes and stages, as D15 keeps one for any ceremony that changes tracked files (that spec's § 12.5);
    - the adversarial-review method's fire-points record a pass through that member's one-call verb,
      `arc review adversarial record`, rather than appending to `ADVERSARIAL-PASSES.md`;
    - review reports — chunk reports, aggregate results, evaluator reports — go to the work unit's scratch folder rather
      than its workspace, so archive's sweep loses nothing, and `archive-work-unit.md`'s teardown-ownership sentence and
      `integrate-work-unit.md`'s `arc user close` backstop no longer need to say so;
    - the step that opens a work unit's pull request (`gh pr create`, `integrate-work-unit.md`) becomes a verb that
      writes the work item's change-request link, its repository the project ID; today no verb writes that link and
      archive records the pull request only as the meta's `PR URL`;
    - a candidate-tail step deletes D18's review copy at `.arc/specs/<slug>/` through that member's export function,
      which `arc attest` (the add) and `arc review respond` (the re-export, when a fix amends the spec) call from the
      flip; candidate-tail is a workflow step, so the delete needs a step of its own. That spec amends D18 forward (§
      13, item 5): the copy is evidence-neutral in every direction, so read D18's re-export "as an ordinary reviewed
      fix" through the amendment when writing the step — the re-export rides its fix's review without entering the
      subject. The arm that keeps that delete from reopening review stays in lifecycle classification, as D18 states:
      the work unit's own export path is evidence-neutral in `classifyPathTreatment`, the arm register key 27's row
      keeps, which this capture's target owns. Subject construction cannot carry it: the copy is never in base, so its
      delete leaves no path in the base-relative diff. The arm classifies by path alone, so the add and the re-export
      are evidence-neutral too, against the consumer map's "export addition and re-export remain reviewable" on this
      capture's target's three rows (`lib/evidence-applicability/path-treatment.ts`, `lib/git/base-overlap.ts`,
      `lib/base-drift/current-adapters.ts`); the copy reaches review on the pull request, and a work unit's own spec on
      the branch is evidence-neutral today (`notes-seam-delivery-review.md` § Corrections across rows). Key 27 also
      covers `lib/delivery/lifecycle-contribution.ts`, whose path group the cutover removes after moving its six
      consumers off it. The row closes when the cutover realizes that fate, removing the group and keeping the
      `classifyPathTreatment` arm. How the group treats the copy in a stacked delivery is an open question routed to
      `delivery-observe-attest`, a follow-on item that closes when that work unit's draft holds it
      (`cohort-state-storage.md` § Closeout criteria); if its answer lands first, carry its treatment through the
      group's removal.

  The rehearsal's chain comparison also tests a new fact: from the flip a Candidate's supersession is its singleton
  record's `history`; a live work unit's replayed versions arrive mapped, their transitions whole, and a merged work
  unit's arrive as found. The rehearsal's import trial covers the review gate's machine-local records as well as the
  tracked ones, since every review record reshapes at the flip.

  Two more for the window. The quiesce finishes every review attempt in flight on the importing machine, beside the
  review it already finishes on every other machine (the held entry on the import's five window steps), since an
  attempt's state in flight is not mapped and the import's trial refuses one. And from the flip the review gate keeps
  its working state apart from today's `.git/arc/review-gate/operations/`, so that folder is inert on every clone; the
  deletion pass may remove it, and nothing depends on that. The deletion pass also takes that spec's other retired arms
  (§ 14.3), among them the frontline skip marker's kind and names and the per-clone repository ID record
  (`identity/repository-identity.json`), which the review gate reads by nothing from the flip, taking the project ID.

- _Approach:_ fold each into the flip rewrite's step list, checked against `strategy-procedure-evolution.md`.

- _Captured during:_ `seam-delivery-review` draft-design close, 2026-10-15.

### `[ ]` **26. Take `seam-status-roadmap`'s two-step ROADMAP removal and its in-repo arms**

- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-10-19).
- _Shapes:_ Two-step ROADMAP removal, installer/integrity edits, in-repo arm deletion, and old-hook hazard

- _Observation:_ `seam-status-roadmap` builds status's and `arc view`'s store versions dark and changes nothing before
  the flip but a capability dispatch and three fixes (`draft-seam-status-roadmap.md` § Direction). Its ROADMAP removal
  runs in two steps. The flip change takes the ROADMAP template with its `init-recipe.json`, `SCAFFOLDED_FILES`, and
  `manifest.json` entries, and `verify-integrity.sh`'s presence test in both copies, since each acts once no ROADMAP
  file exists. The deletion pass takes status's and `arc view`'s in-repo arms, `DERIVED_VIEWS`, and the remaining
  ROADMAP paths the draft's § Direction lists, which stay in place and inert from the flip. The layout's
  `project-document` address stays past the pass for `storage-projection`'s never-adopted rule. Removing
  `arc hook-remedy-roadmap-conflict` fails every commit on a branch whose tracked pre-commit hook still calls it, which
  the pass must handle.

- _Captured during:_ `seam-status-roadmap` draft-design close, 2026-10-16.

### `[ ]` **27. Take `projected-markdown-checks`' movable set, its ceremony check requests, and the flip's Markdown notice**

- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-10-19).
- _Shapes:_ Movable-record rule, ceremony check requests, and flip Markdown-tool notice

- _Observation:_ `draft-projected-markdown-checks.md` (§ Direction, § Coordination) hands `storage-cutover` three
  things:

    - **The movable set.** From the flip every work-item and cohort record counts as movable, its path varying by
      lifecycle and by checkout (`active/current/`, `active/in-flight/<slug>/`, `completed/`), while personal records
      under `.arc/user/<id>/` stay put. ARC's link rules, a write check at write-back and `arc save`, follow the
      rewritten relocatability rule.

    - **The ceremony check requests.** Every ceremony that commits or saves only state requests `arc check increment`
      over the state it authored, before its approval stop for what it writes before the stop and before its commit or
      save for text written after it or where it has none, and keeps its existing lint step; handoff names a failure in
      work it leaves unfinished in its notes rather than stopping to ask. These land before the flip; the rewrite that
      turns a state-only commit step into `arc save` keeps each request and lint step before the save.

    - **The flip's notice.** It tells a project how its Markdown checks change: one listing through Git or reading the
      index stops seeing state, while one globbing from disk keeps reading the shared roots, which the projection
      excludes only through `.git/info/exclude`, conflict-marker files included, and a fixer among them rewrites
      projected files that write-back persists as hand edits. It tells the project to hand each Markdown tool exactly
      the paths it should read, Git's list for tracked files and the selection through a `selection` check for state,
      and that link-target existence over state leaves the shipped hook, kept by declaring `validate-links.sh` as a
      `selection` check.

- _Captured during:_ `projected-markdown-checks` draft-design, draft close (2026-10-17).

### `[ ]` **28. Close the two decomposition cohorts on representative rehearsal evidence**

- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-10-19).
- _Shapes:_ Representative decomposition rehearsal evidence and closure of decompose-core-hardening /
  decompose-transform-integrity

- _Observation:_ `decompose-scaling` (planned, never started) retires (Owner, 2026-10-16). Its Git-subprocess costs —
  local-branch discovery, repository-plan hydration, and the execute half — sit in Git machinery that changes nothing
  before the flip and goes in `storage-cutover`'s deletion pass, and a cut's record reads from the flip are
  `seam-decomposition`'s (its R5, flat cost), which answers the stub's one inbound entry, to re-measure against the
  store. Its two scanner costs — locator resolution parsing and canonicalizing every unit per lookup, and the document
  prefix re-encoded at each unit boundary (`resolveV3DecomposeContentLocator`, `byteOffset`, `decompose-content.ts`) —
  carry with the scanner unchanged and unobserved at current scale, and the retirement records them as out of scope, as
  the subcohort's closeout criteria allow. That leaves `decompose-core-hardening` with no open member, and
  `decompose-transform-integrity`, whose direct members have shipped, with only that subcohort. The subcohort closes
  only on "a representative real cut" showing its shipped members' properties "without post-transition repair"
  (`cohort-decompose-core-hardening.md` § Closeout criteria), which today's machine has not given.

- _Historical approach:_ abandon the stub with this rationale. Close both cohorts on `storage-cutover`'s rehearsal, a
  representative cut on a copy, which the subcohort admits as evidence (its § Soft coordination); neither closeout
  criterion is amended.

- _Captured during:_ `seam-decomposition` draft-design close, 2026-10-16.

_Routing boundary (2026-10-19):_ The stub retirement is a separate fresh-session Errand. This entry holds only the
representative rehearsal and both cohorts’ closeout against their unchanged criteria; neither cohort closes before that
evidence.

### `[ ]` **29. Drop CineXplorer from the cutover's purpose: it installs fresh after the flip**

- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-10-24).

- _Shapes:_ the Purpose line, and any step in the body written for a second repository.

- _Observation:_ `draft-storage-cutover.md`'s Purpose line still reads "Flip this repository — and CineXplorer" (the
  2026-09-28 re-cut). The import serves this repository alone (`cohort-state-storage.md` § Import scope, Owner
  2026-10-10), and on 2026-10-22 the Owner chose to install CineXplorer fresh once the cutover lands (`RELEASE-GATES.md`
  § `cinexplorer-adoption`), so the flip has one repository.

- _Approach:_ at the cutover's planning, reword the Purpose and check the draft's body for any other step written for a
  second repository.

- _Captured during:_ the CineXplorer migration timing discussion, 2026-10-22.

### `[ ]` **30. Carry every pre-flip checkout's UID-less work-unit marker across the flip by binding or releasing it**

- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-10-24).

- _Shapes:_ § Scope — the window's flip step, and its rehearsal.

- _Observation:_ from the flip a work-unit checkout claim carries and matches its owner's UID, with no slug fallback
  (`draft-lifecycle-slug-selection.md` D8, Owner 2026-10-22). No marker written before the flip carries one — the
  in-repo store has no UIDs — and the import leaves the checkout marker out as machine-local
  (`spec-storage-ref-backend.md`, "What stays out"). So every spawned pre-flip checkout's claim refuses after the flip
  until it is bound.

- _Approach:_ `lifecycle-slug-selection` makes such a marker unbound rather than building a re-stamp, under the
  pre-public posture (`spec-lifecycle-slug-selection.md` § 7.4, Owner 2026-10-23): claim readers and holder matching
  refuse it, naming the exits its marker and slug select: `arc materialize <slug> --here` for a live holder materialize
  admits, the cold start's rerun for an anchored leftover whose slug has no record, and `arc locus release`. The
  cutover's procedure tears down ended holders' checkouts and work-unit husks before the flip, since neither takes a
  teardown after it (a work-unit husk's in-repo evidence never passes the store teardown's husk selection,
  `huskEvidenceMatches`), and binds or releases each remaining checkout's marker after the import; the rehearsal
  exercises the bind on a spawned pre-flip checkout (`spec-lifecycle-slug-selection.md` § 9).

- _Related:_ neighbors this buffer's "Rehearse the flip's carry of checkouts claimed in place before it", which covers
  checkouts with no marker; this one covers checkouts whose pre-flip marker lacks a UID.

- _Captured during:_ `lifecycle-slug-selection` draft-design, 2026-10-22.

### `[ ]` **31. Admit a started work unit's planning branch at planning entry under partial protection**

- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-10-24).

- _Shapes:_ the storage-coupling register row "State writes routed by where they can be committed" (owner
  `storage-seam`): the write-context guard and `arc plan check`'s committability are deleted at the flip.

- _Observation:_ under `branch.protection: partial`, `arc plan check --name <slug>` refuses a started work unit's own
  `plan/<slug>` branch with `redirect` / `work-unit-branch`. `classifyPlanningEntry` (`lib/git/write-context.ts`)
  computes `protection === "partial" ? writeContext.verdict === "proceed" : onPlanningBranch`, so under partial only the
  base branch is committable. `draft-design`'s own redirect leg ("start now → `arc start <name> --new`, then draft on
  its branch") leads straight back to the same redirect, and the reason's wording describes another work unit's branch.
  arc-framework runs full protection, so self-hosting never takes the partial arm; partial is the default a new install
  gets.

- _Approach:_ no fix before the flip: the mechanism is deleted then, and no partial-protection project runs ARC before
  it except the install rehearsal kit. The cutover's verification, or the kit's rerun against it, should start a work
  unit under partial protection and draft on its branch.

- _Captured during:_ the CineXplorer install rehearsal (`2026-10-23T083226`), `score-badge-low-votes` draft-design.

### `[ ]` **32. Remove the projected-root install entries outright at the flip; the install authority is rebuilt after it**

- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-10-24).

- _Shapes:_ its inbound entry "Leave no tracked or installed file in a projected root from the flip", whose approach is
  to "drop or relocate those entries in `lib/classification.ts` and `init-recipe.json`".

- _Observation:_ `adopter-install-authority` implements the day the flip lands, against the post-flip shape
  (`draft-adopter-install-authority.md` D1, D2, D6). It replaces `include_files`, `SCAFFOLDED_FILES`, and
  `CONFIGURABLE_FILES` with one claims table in `init-recipe.json`, and every file under the package's `arc/` must then
  carry a claim, with no not-installed list: a template the flip keeps under `arc/` but stops installing would fail its
  coverage check. It also drops team mode's conditional install and installs `strategy-planning-module.md`
  unconditionally, which empties `verify-integrity.sh`'s `strategy_expected` cases.

- _Approach:_ at the flip, delete the ROADMAP and ATOMIC-INBOX templates and `completed/README.md` with their recipe,
  classification, and manifest entries rather than relocating them within `arc/`; move anything kept for another purpose
  outside `arc/`. Leave the recipe's structure as it is for the install-authority rebuild.

- _Captured during:_ `adopter-install-authority` draft-design close, 2026-10-23.

### `[ ]` **34. Save personal state from every checkout immediately before the import**

- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-10-31).

- _Shapes:_ the cutover procedure's pre-import steps and its rehearsal.

- _Observation:_ the import blocks on every personal file whose disk copy differs from its saved notes copy ("Personal
  file … differs between notes and disk copies", remedy `arc user save` and `arc user load`). The 2026-10-31 trial over
  `main` found 10: `RELEASE-GATES.md`, `PM-NOTES.md`, `CINEXPLORER-MIGRATION.md`, `USER-INBOX.md`, and `SESSION-NOTES.md`
  or `ADVERSARIAL-PASSES.md` under five live work units. Live sessions edit these continuously, so a save taken early
  goes stale before the import runs.

- _Approach:_ make quiescing the sessions and saving from every registered checkout one step immediately before the
  import, and exercise it in the rehearsal.

- _Captured during:_ the import trial Errand over current `main`, 2026-10-31.

### `[ ]` **36. Repoint `storage-cutover`'s draft from `spec-storage-projection.md` to the projection members' specifications**

- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-10-31).

- _Shapes:_ the two inbound items citing `spec-storage-projection.md`: "Leave no tracked or installed file in a
  projected root from the flip" (its § 18) and "Lock every unlocked work-item worktree at the cutover's quiesce" (its
  § 18 and § 12.7).

- _Observation:_ `storage-projection` was decomposed on 2026-10-31 into `projection-substrate`,
  `projection-write-back`, and `projection-worktrees`, and its specification retired with it. Each member's
  specification keeps the design's section numbers, says in its Section numbers term which member builds each section,
  and states in its own § 18 what it leaves to `storage-cutover`. The worktree lock and § 12.7 are
  `spec-projection-substrate.md`'s, and materialization into the projected roots is `spec-projection-worktrees.md`'s.

- _Approach:_ repoint each citation to the member specification holding the cited content, checking each member's
  `storage-cutover` entry in § 18.

- _Captured during:_ `storage-projection`'s decomposition, distribution approval (2026-10-31).

### `[ ]` **37. Retarget the flip's session-init rewrite at the session-init agenda's spine and its cutover module**

- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-10-31).

- _Shapes:_ the flip's workflow-rewrite step list — the consumer-map end states for `session-init.md` and
  `probe-envelope.md` (`notes-storage-contract.md`).

- _Observation:_ `session-init-agenda` (Gate B Must, in draft-design) lands before the flip (Owner, 2026-10-31):
  `session-init.md` becomes a spine plus CLI-selected arm methods, a dedicated `arc agenda session-init` verb compiles
  the agenda, and `probe-envelope.md` is deleted. The consumer map's end states for `session-init.md` and
  `probe-envelope.md` — removing the notes pull/load dispatch and the notes-lag,
  compaction, partial-push and notes-drift surfaces, moving the freshness anchor to the store state version, reading
  session notes from the meta — describe prose that unit restructures.

- _Approach:_ the agenda compiles every surface the cutover retires in one CLI module, so the flip's rewrite becomes
  deleting that module, plus the freshness and session-notes changes in the compiler, which reads SESSION-NOTES'
  `Session Type` and `Commit at Handoff` itself. Prose still to rewrite at the flip: the spine's SESSION-NOTES authority
  boundary (notes come from the meta's session context, D5) and the `discover-next-work` method's `.arc/backlog/` and
  `.arc/active/` reads (discovery reads the projected backlog or `list`). Re-derive those rewrite steps from
  `draft-session-init-agenda.md` (or its spec) once it settles, not from today's prose. `session-init.contributor.md` is
  deleted by that unit (D14 retires the contributor layout), so the flip has no contributor-variant rewrite left.

- _Captured during:_ `session-init-agenda` draft-design, 2026-10-31.

### `[ ]` **H1. Move the workflows onto `cohort-identity-verbs`' commands at the flip**

- _Routed from:_ `spec-cohort-identity-verbs.md` § Non-Goals ("The flip's workflow rewrite owns every workflow
  change"), 2026-11-03.

- _Shapes:_ the flip's workflow rewrite, beside the entries "Take `storage-seam`'s flip-rewrite obligations into the
  cutover's workflow rewrite" and "Rewrite the workflow steps the seam's lifecycle verbs replace".

- _Observation:_ the unit adds `arc cohort close`, `arc cohort remove`, and `arc rename <slug|uid>` for work units and
  cohorts, and UID operands for `arc errand close` and `arc errand abandon` (its § User-facing impact). Before the flip,
  `arc cohort close` and `arc cohort remove` refuse `unsupported` through `runDormantStoreCommand`
  (`commands/store-command-support.ts`), naming today's route: edits to the tracked cohort files, and archive's sidecar
  sweep (its § 10). From the flip, write-back cannot rename a cohort, since each edited file persists as its own write.

- _Approach:_ fold into the flip rewrite's step list every workflow step that renames, closes, or removes a cohort by
  hand edit, or resolves a clash by hand, each checked against `strategy-procedure-evolution.md`.

### `[ ]` **H5. Decide how often the save anchor moves**

- _Routed from:_ `spec-projection-write-back.md` § 11.7 and `spec-projection-worktrees.md` § 11, 2026-11-03.

- _Shapes:_ the flip's workflow rewrite.

- _Observation:_ `arc save` clears each projected file's changed mark, except on a file still holding an edit the store
  lacks. Until a workflow saves per increment, `--changed` spans everything since the last save. Both specifications
  leave the cadence to this unit's workflow rewrite.

- _Approach:_ settle the cadence when the rewrite turns state-only commit steps into `arc save`. A save per review
  increment is the candidate, so the selection a ceremony checks matches the increment.

---
