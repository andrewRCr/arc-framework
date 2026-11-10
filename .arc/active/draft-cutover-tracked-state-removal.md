# Draft: Cutover Tracked-State Removal

- **Origin:** [internal] — the `storage-cutover` cut (2026-11-03); carved from that work unit's draft.
- **Purpose:** Remove what the flip leaves looking live but dead of ARC's tracked-state machinery — every command,
  check, configuration key, CI step, and shipped file that a user, a project's CI, or `arc --help` would take as
  working — and hold, until the flip lands, the internal collapse that follows it: the in-repo store, every dormant
  pre-flip arm, the branch-tree readers, and lifecycle classification.
- **Planning posture:** `P1`, a Gate B Must. It is planned to implementation-ready before `cutover-flip` lands, and
  lands between the flip and the start of the product-renames sweep (`cohort-storage-cutover.md`), before the
  collapse unit (§ The per-check sort). Whether it must build before the other follow-ons turns on `cutover-flip`'s
  answer on base drift and the delivery rename source (§ Unknowns and Assumptions): taken here, they are moves onto
  store reads before deletion, as the cut placed this unit first; taken by the flip, nothing in it needs to build
  first.

---

## Planning state

- **Readiness:** formalization-ready. The scope is known, split, and derived from a census of the CLI against the
  flip's end state; the Owner's pass has disposed every inbound entry (§ Inbound dispositions), and every decision is
  settled. What stays open under Open waits on another unit's answer, with this draft's placement stated either way.
- **Resolved at the cut** (Owner, 2026-11-03; `cohort-storage-cutover.md`): this member's items and its Gate B
  placement; it leaves in place every module the old decomposition machine imports (§ What the old decomposition
  machine still imports).
- **Resolved in draft-design** (Owner, 2026-11-10):
    - **Boundary: split by what reads as live** (`assess-boundary-fit`: cut-map, its transform deferred). This work
      unit keeps what a user, a project's CI, the shipped recipe, or `arc --help` exposes, with the flip's visible
      leftovers and the cleanup the window leaves (§ Scope). A second work unit takes the internal collapse (§ The
      collapse share). The basis is § The size: the unit as cut measured about four to seven and a half times the
      project's mark of about 10,000 changed lines, and the siblings' reason for staying whole above it, a pure
      deletion of one self-contained subsystem, does not fit a collapse across about 276 source files.
    - **The cut lands at the flip's landing,** where a decomposition is one store write. Before the flip a cut runs
      `RELEASE-GATES` § Decomposition until the cutover, and extracting part of a work unit has never been
      rehearsed. Until then the collapse share stays a marked section of this draft.
    - #3 goes to `cutover-flip` (Owner, 2026-11-05; inbound entry "Drop #3 from this unit"), which answers the
      earlier open question on the `.internal/` records.
    - **Design review, pass 1:** the boundary rule (§ Scope), the census behind the inventory, D6 extended to
      `arc base merge --regenerate-roadmap`, and D10. The return to an earlier planning stage the pass offered was
      declined: its two masked decisions are settled here, and the census is inventory rather than design.
    - **Design review, pass 2:** the `Context:` footer's state-only commit kinds are `ghost-mode`'s, as the register's
      footer-grammar row records (§ Scope boundary).
- **Decided** (Owner, 2026-11-10): D1–D10 (§ Decisions), D6 on the check it named and D9 at the draft's close.
- **Open:**
    - `cutover-flip`'s answers on its test surface, base drift, and the delivery rename source, and on what its spec
      takes of the items this draft names as its if it declines: the interim `personal/session-context` kind and the
      help text it makes stale (§ Unknowns and Assumptions).
    - What `cutover-flip`'s rewrite and spec leave, which sets parts of § Scope: the write-context classifiers'
      shipped callers, the merge-gate recipe's onboarding offer and links, the executor's workspace side effect and
      the worktree scaffold's in-repo arm, which keep `runUserOpen` or let it go with `arc user open`, and whether
      the store archive should record the `PR URL` and `Completed` fields that `arc archive --pr-url` and
      `--completed` set today and the store arm drops (asked 2026-11-10).
    - What `cutover-window-tooling`'s spec builds, which sets § Scope's item on the window's tooling and its size.
    - The record against ADR-021's lighter merge gate and its recipe consequence that ADR-035 retires them (D10), the
      recipe half with or after this unit's landing, routed to `cutover-documentation` on 2026-11-10 and pending until
      its draft holds it. That draft's buffer holds the rest of the hand-off: retiring § Auto-Merge Lane and moving the
      draft-lock model it holds.
    - The collapse unit's own: whether `git-retirement-authorization-context.ts`'s Git logic serves `arc teardown
      --branch` on the store path, and whether any store index yields a `parked` entry (§ The collapse share).
- **Next:** create-spec. Implementation waits on `cutover-flip`.

The inbound items keep the numbers they had in `storage-cutover`'s buffer, shown in their headings. An
item cited here that this draft does not hold is in another member's draft under the same number.

---

## Problem

`cutover-flip` switches `createStore` (`lib/store/create.ts`) from the in-repo implementation to the ref backend, so
every store a command opens reports `capabilities.stateOffBranch` true. The seam members built each store path dark
behind that capability and left the in-repo path beside it, so the flip leaves a large body of code no production
store reaches. Some of it shows: verbs and options that now only refuse or act on nothing, hook checks that pass
vacuously, a CI classifier with nothing to classify, configuration keys that select nothing, and a shipped merge-gate
recipe built around a planning lane that can no longer fire. That part reads as live and misleads, which is why this
unit is a Gate B Must. The rest is internal: 657 capability branch sites in 276 source files.

### The size

Measured on 2026-11-10 against `origin/main` at `9c63a803ae`. Module sizes are `wc -l` counts; capability-arm and
test figures are census estimates from read-only subagent sweeps, re-measured at the flip's landing.

| Share                         | Source lines   | Test lines     |
| ----------------------------- | -------------- | -------------- |
| The unit as cut on 2026-11-03 | ~20,000–25,000 | ~17,000–50,000 |
| This unit's share (§ Scope)   | ~6,500–8,000   | ~12,000–15,000 |
| The collapse share            | ~14,000–18,000 | ~5,000–35,000  |

- Capability-arm counts are upper bounds. A false arm also runs when no store is passed (the `store?.` reads), when an
  optional parameter defaults to false, when `runPostInitSetup` (`lib/setup.ts`) finds no identity, and on the import
  path, whose source `runStoreMigrate` builds through `createStore`.
- The collapse share's test lines turn on `cutover-flip`'s answer on how its tests stay green (§ Unknowns and
  Assumptions): 146 test files, about 35,000 lines, target the in-repo implementation, 85 of them through
  `createStore`.
- This unit's share is still about twice the mark before the window's tooling. Most of the excess is the import
  transform and its 43 test files, a pure deletion of one self-contained subsystem (D2). The window's tooling
  (§ Scope), not yet built, adds about 2,000–4,000 changed lines until `cutover-window-tooling`'s spec measures it.
- The design review's census added about 500 source lines to this unit's share (the write-context classifiers, `arc
  user close`, and the inert options), and its boundary rule moved about as many to the collapse share (`runResume`,
  the ROADMAP rendering, `archive.cadence`'s readers, and `arc view`'s pre-flip arm), so the estimate stands. D10 adds
  the merge-gate recipe's 384 shipped lines.

---

## Scope

Each item reads as live after the flip, is cleanup the window leaves, or is a rule the flip's layout makes wrong
(D4).

**The boundary rule** (design review, 2026-11-10). This unit removes each exposed surface — a command or option
registration, a hook block, a configuration key, a CI step, a shipped file — with the code reachable only through
it. Code a dormant arm also reaches stays, named in § The collapse share, which deletes it with that arm. Removing a
surface also removes every reference to it that remains when this unit lands — links, remedy and help strings,
examples, prose mentions — in source, the shipped `arc/` tree, and this repository's `.arc/`, its copies of the
shipped files and its own project doctrine. Point-in-time records keep theirs: an ADR's Context and other invariant
sections, dated analyses, completed work units, and changelog history. So do the dormant code § The collapse share
names and the old decomposition machine `cutover-decompose-removal` deletes, whose references leave with them. Where
a reference sits in doctrine another member rewrites, this unit removes only the reference and leaves the rewrite, so
no landing order binds it to that member. The inventory below comes from a census of every registered command path
against the flip's end state (2026-11-10), redone at the flip's landing.

- **Verbs and options that only refuse or act on nothing after the flip:**
    - `arc park` (`handlers/lifecycle.ts:987`) with `runPark` (`lib/work-unit/verbs/park-resume.ts`) and
      `lib/work-unit/pointer-record.ts`, which only `runPark` uses; `arc pause` and `arc resume` replace it at the
      flip. `runResume` stays for `arc resume`'s and `arc start`'s in-repo arms.
    - `arc resume --here`, which refuses toward `arc materialize --here` on every input
      (`lib/work-unit/verbs/pause-handover.ts`).
    - `arc user open` (`handleUserOpen`, `handlers/user.ts`), which refuses `unsupported` from the flip, and `arc user
      close` (`handleUserClose`, `handlers/user.ts`), which removes a per-work-unit workspace the window has already
      removed. `runUserClose` stays for the collapse share, which teardown's in-repo arm reaches for a unit torn down
      as abandoned; `runUserOpen` stays while the executor's workspace side effect or the worktree scaffold's in-repo
      arm reaches it, and otherwise goes here with `arc user open`.
    - `arc user inbox-mark-execute-bound` (`handlers/user.ts:506`), which `arc errand queue set` replaces, and the
      title-keyed inbox operands, which refuse from the flip: `arc user inbox-remove`'s title forms
      (`handlers/user-inbox-remove-store.ts`), and `--inbox-title-file`, `--inbox-entry-file`, and a title given to
      `--from-inbox` on `arc errand open` and `arc errand link` (`lib/inbox-entry-operand.ts`).
      `matchInboxEntryTitle` stays among `cutover-notes-removal`'s survivors.
    - The write-context classifiers (the register's row "State writes routed by where they can be committed"):
      `arc plan check` (`handlers/plan.ts`) and `arc housekeep check` (`handlers/housekeep.ts`), with their groups and
      options, which answer `proceed` on every input from the flip. Their shipped callers go with them, unless
      `cutover-flip`'s rewrite takes them first: `draft-design.md`'s preflight and the quick-reference line for
      `arc plan check`, and `drain-inbox.md`'s precondition for `arc housekeep check`. The guard itself
      (`lib/git/write-context.ts`) is the collapse share's.
    - `arc decompose`'s `--advance-base`, and `--finish` given a map, which the store arm refuses on every input
      (`handlers/decompose-store.ts`): their `cli.ts` registrations, the store arm's refusals, and the mention of
      `--advance-base` in the shared input schema's error message (`handlers/decompose.ts`). The schema's fields, the
      mode keys (`lib/work-unit/decompose-command-routing.ts`), and the renderer's argv
      (`lib/work-unit/decompose-command-renderer.ts`) serve the repository arm and stay for
      `cutover-decompose-removal`.
    - Options the store arm ignores or cannot honor: `arc activate --task`, which its help calls required though the
      store arm writes only `Next Action` (`runStoreActivate`, `lib/work-unit/verbs/activate-deactivate-store.ts`),
      with the shipped lines that tell agents to pass it (`activate-work-unit.md`'s first-task input and command, and
      the quick-reference template's `arc activate` line); `arc publish --last-completed`, `arc teardown --force`,
      `--local` / `--no-fetch` on `arc active in-flight`, and the same pair on `arc errand check`, whose store arm
      reads it only to suppress an unreachable-remote warning its overlap check never raises; the store path fetches
      nothing (`lib/git/in-flight-store.ts`), so there is no network read to skip. `arc archive --pr-url` and
      `--completed` go too unless `cutover-flip` answers that the store archive should record them (Open), in which
      case the store arm honoring them is the flip's. The spec confirms each against its store arm.
- **The lifecycle hook checks** (#1's share): `validate-meta-spec`, `validate-cohort-consistency`,
  `assert-roadmap-regenerated` (`scripts/assert-roadmap-regenerated.ts`, with the parts of
  `lib/status/roadmap-regeneration-assert.ts` only it uses), `check-foreign-writes` (which already returns on the
  capability, `scripts/check-foreign-writes.ts:241`), and the pre-commit hook's state-path checks in both copies — the
  contributor-protected paths, task-list staging, the ROADMAP render-field warning, and `CHECK[task-numbering]` —
  with `hooks.contributor_protected_paths` and `hooks.task_numbering` (`lib/config/schema.ts`,
  `commands/config/validate.ts`). The task-list kind already carries the numbering rule: its `task-list.segmentation`
  check refuses a numeric third segment, which the scanner's `ParentTaskIdSchema` marks malformed, and the hook's
  pattern no longer matches today's backticked task markers. `lint:md:descriptors` stays.
- **The CI planning classifier:** `isPlanningArtifactPath` and `classifyPlanningLane` (`lib/change-facts.ts`, whose rest
  survives; removing the first edits `isIntegrationTargetPath`), `classify-change.sh`'s `lane` and `planning-lane`
  paths, `ci.yml`'s lane wiring, `arc-lane-attestation.yml` with what only it runs, among it the live-pair check
  `confirm-live-change-pair.sh` (`system/.internal/scripts/`, both copies) with its `init-recipe.json`, manifest,
  scripts README, and test entries, `arc review planning-lane` (`handlers/review.ts`), and the planning-grooming command
  (`scripts/review-gate/policy/planning-grooming-command.ts`, with its registrations and mentions across 15 source
  files, among them `handlers/review-request-schema.ts`, `scripts/review-gate/core/register-review-schemas.ts`,
  `review-command-envelope-registry.ts`, `review-command-mode.ts`, `runtime/project-identity-remedy.ts`,
  `command-input-infrastructure-policies.ts`, and `lib/cli-help-content.ts`). The surviving `arc review local prepare`
  refuses a `planning-grooming` surface authority with a remedy naming the removed command
  (`scripts/review-gate/policy/routing-schema.ts`), which is rewritten. Whether `planning-grooming` stays in
  `SurfaceAuthoritySchema` and `auto-eligible-planning` in `CoreRoutingReasonSchema`, or each leaves, is the spec's;
  leaving changes every strict-current schema that embeds either enum, at any depth. `policy/routing.ts`'s
  `auto-eligible-planning` arm and `policy/routing-reason-facts.ts` follow the answer. Also this repository's CODEOWNERS
  auto-merge block (`.github/CODEOWNERS`, "Auto-merge lane: per-WU / per-cohort planning artifacts (UNOWNED)"), which
  matches nothing once planning artifacts are untracked; `planning-lane-relief` retires with them. `cutover-flip` takes
  the workflow and setup prose that arms the lane. Among the references that remain, this repository's project strategy
  `.arc/reference/strategies/project/strategy-review-projection.md` describes the attestation workflow's
  `review-projection/` skip as live and lists its guard among the retirement steps.
- **The merge-gate recipe, whole** (D10): the README and CODEOWNERS template under
  `reference/templates/arc/merge-gate/` and `system/workflows/arc/supplemental/setup-merge-gate.md`, both copies (the
  package's `arc/` and this repository's `.arc/`), their `init-recipe.json` entries, and whatever onboarding offer of
  it `cutover-flip`'s rewrite leaves, with a notice (D7). With them go every installer, manifest, and test entry
  that names the recipe's files, among them their entries in this repository's `.arc/system/.internal/manifest.json`,
  which `arc health` reports missing once a file is gone, and `review-gate-workflows.test.ts`'s assertions that the
  recipe ships. The references that remain go too: § Auto-Merge Lane's three mentions of the recipe in
  `strategy-work-organization.md` and its link definition, the recipe's entry in `reference/templates/arc/README.md`,
  the links in `draft-design.md`'s "Ship instead of pause" and in `01_verify-and-configure.md` if the flip's rewrite
  leaves them, and the coupling audit's path entry (`lib/coupling-audit/surface-classifier.ts`). The section's
  retirement and the draft-lock model's move are `cutover-documentation`'s. `arc merge lock` stays.
- **The ROADMAP's remaining visible paths** (#26's share; D6): `arc hook-remedy-roadmap-conflict`
  (`scripts/remedy-roadmap-conflict.ts`, `lib/status/roadmap-conflict-auto-remedy.ts`); `arc base merge
  --regenerate-roadmap` with base merge's remedy application (`conflictRemedy` in `handlers/base.ts`,
  `scripts/base/merge.ts`, and `scripts/base/merge-composition.ts`), the library's other importer; the merge driver
  `arc init`, `arc join`, and `arc update` install (`ROADMAP_MERGE_DRIVER_COMMAND`, `lib/setup.ts`) with its attribute
  writer and this repository's `.gitattributes` line `.arc/backlog/ROADMAP.md merge=arc-roadmap`; `arc status
  --project --staged` and its `--write`, which refuse on every input from the flip (`handlers/status/views.ts`); and
  the hooks `README.md`'s remedy text in both copies. The references that remain go with them: the regenerable-arm
  note in `integrate-work-unit.md`, the rerender command in `strategy-concurrent-work.md`, and the markdown
  contract's ROADMAP remedy (`lib/markdown/contracts.ts`).
- **Help text the flip makes stale, if `cutover-flip` declines it** (§ Unknowns and Assumptions): the descriptions
  and option text of commands that keep working, rewritten to describe their store arms.
- **Shipped scripts:** `verify-integrity.sh`'s § 7 Meta-file shape, both copies, goes: it walks projected meta files
  whose records the meta kind's write check has already validated at every write and save. `cutover-flip` removes
  only the script's ROADMAP presence test.
- **`arc store migrate --import` and the import transform** (#10's share; `lib/store/ref/import/`), after the window,
  with the two constants `lib/store/ref/migrate-layout-build.ts` imports from it, whose exclusion of the import's
  transient refs goes with the transform. The import keeps two capability-false arms live (`readRepositoryIdentity`
  through `lib/store/ref/import/entry.ts`, and `readRepositoryCandidateSupersessionChain` through
  `import/review.ts`); the collapse share deletes them after.
- **The window's tooling,** after the window, with the import, since nothing runs it again: what
  `cutover-window-tooling` builds and lands on `main` ahead of the window (split from `cutover-flip`, Owner,
  2026-11-10), among it the quiesce check with its record, its recompute after the import, and its last read of
  `origin/main`'s tip; the abort's restore; the worktree lock step; and Stage 1's copy driver, accounting case, and
  chain comparison. The chain comparison reads Candidate chains through `readRepositoryCandidateSupersessionChain`'s
  in-repo arm, which the collapse share deletes after, so it goes here first. That unit's spec sets the exact set
  (Open).
- **#20's machine-local pattern** (D4).
- **What the window leaves on disk and in refs,** removed by D5's Owner-present step, with no shipped code, on each of
  the Owner's clones that predates the flip: the residue refs (D5); any hold under `refs/arc-window/` the quiesce
  check leaves once the window completes; the inert `.git/arc/review-gate/` folders (#35), about 26 MB of shipped
  work units' review facts, working state, retired snapshots, and older outcomes the import's review mapping leaves
  behind, whose left-behind report stays the record of what was dropped, while the machine-local hosted-request owner
  index (`identity/`), in use after the flip, stays for its retention capture; leftover machine-local
  `STATUS.USER.md` files, whose only remover in code is the user-surface migration the collapse share deletes; and
  the local `merge.arc-roadmap.*` configuration the merge driver's installer wrote.

### The moves that remain

Most of what the cut called moving start, teardown, `lib/delivery/`, and pre-publication onto store reads is already in
place behind the capability: `handleStart` hands a store start to `handleStoreStart` (`handlers/start.ts:182`);
teardown's retirement driver reaches `git-retirement-authorization-context.ts` only on the in-repo path; delivery's
and pre-publication's lifecycle-path reads are guarded. What remains:

- **Base drift's completed-meta resolver** (`createCompletedMetaResolver`, `lib/base-drift/current-adapters.ts`),
  wrong after the flip for a squash or rebase project; offered to `cutover-flip` (§ Unknowns and Assumptions).
- **Delivery's rename source** (`GitDeliveryRenameTransitionSource`, `lib/delivery/plan-resolution.ts`), which reads
  transition records from the branch tree and reads empty once the flip untracks them; offered to `cutover-flip`.
- **Mixed modules, split before deletion** (collapse share): `remote-ref-reader.ts` is mostly generic remote Git.
  The ref backend imports `classifyRemoteFailure`, `PASSIVE_REMOTE_INTERACTION`, and `DEFAULT_NETWORK_TIMEOUT_MS`;
  `fetchRefsBounded` serves in-flight derivation and `readLiveRemoteHeads` the notes publication proof, so each follows
  its caller; only the meta-at-ref readers (`readMetaAtRef`, `listMetaPathsAtRef`) are branch-tree readers.
  `completed-index.ts`'s types are imported by the store's own reader (`lib/store/lifecycle-completed.ts`);
  `IDENTITY_STATUS_FILENAME` (`lib/user-surfaces.ts`) is imported by the projection and the ref backend;
  `git-retirement-authorization-context.ts`, whose only importer is `teardown-retirement-driver.ts`, carries Git logic
  a census found `arc teardown --branch` reaching on every path, an open question for the collapse unit's spec.
  `branchToWorkUnitSlug` already lives in `lib/work-unit/work-unit-slug.ts`.
- **The spec review copy's arm** in `classifyPathTreatment` survives `path-treatment.ts`'s removal (inbound entry on
  `seam-delivery-review`'s retired arms).

### The per-check sort

From `storage-cutover`'s draft (2026-11-03): every lifecycle hook check and every part of the CI
planning classifier follows the flip.

- No check fails once tracked state is gone:
    - The pre-commit hook's checks read staged paths (`git diff --cached --name-only --diff-filter=ACMR`), except the
      task-list staging warning, which reads unstaged modifications (`git diff --name-only --diff-filter=M`), and the
      ROADMAP remedy, which reads unmerged entries. All three sets hold only tracked paths, so nothing under an
      ignored projected root reaches a check.
    - `validate-meta-spec`, `validate-cohort-consistency`, `assert-roadmap-regenerated`, the ROADMAP render-field
      warning, the contributor-protected-path warning, the task-list modification warning, and `CHECK[task-numbering]`
      pass vacuously.
    - `check-foreign-writes` already returns on the store's `stateOffBranch` capability.
- Nothing relies on a result as assurance:
    - The meta, cohort, and task-list rules run as record-kind write checks: `meta.field-block` and `meta.stage` in
      `lib/store/kinds/meta/`, `cohort.purpose` and `cohort.parent` in `lib/store/kinds/cohort/rules.ts`, and
      `task-list.segmentation` in `lib/store/kinds/task-list/shape-rules.ts`, which also refuses the numeric third
      segment `CHECK[task-numbering]` looked for.
    - `main`'s ruleset requires only `ci-ok`, not the lane attestation's `arc-lane` status.
    - The classifier answers `reviewed` for any diff that holds a non-planning path, which is every diff once state is
      untracked. That is the answer that grants nothing.
- `lint:md:descriptors` stays: it still lints the task-list template, and only its task-list path selector goes dead.
- **Ordering hazards:**
    - `arc hook-remedy-roadmap-conflict`'s hook fallback is the one check that errors when its target is missing; the
      others skip with a notice (the `-f` guards) or swallow the failure (`|| true`). D6 settles its landing: no live
      caller reaches the fallback, so the command, its hook block, and `arc base merge --regenerate-roadmap`, the
      remedy library's other importer, go in one change.
    - The lane-attestation workflow goes in the same change as `arc review planning-lane`, with
      `review-gate-workflows.test.ts`'s assertions on it.
    - The shipped merge-gate recipe calls `arc review planning-lane` in a project's CI classify job, so the command
      goes with the recipe (D10) and a notice (D7). Once `adopter-install-authority`'s claims table lands, every file
      under the package's `arc/` needs a claim, so each recipe file leaves with its claim. The recipe's remaining
      links go in the same change, since CI's link audit (`lint:arc:links`) fails on a dangling one.
    - `lib/status/roadmap-regeneration-assert.ts`'s rendering (`renderRoadmapFromIndexViewResult`) stays for #26's
      in-repo arms, the in-repo rename and the executor's ROADMAP effect, which import it; the hook script and the
      parts only it uses go here.
    - Removing `isPlanningArtifactPath` edits the surviving `isIntegrationTargetPath` in `change-facts.ts`.
    - The in-repo implementation cannot go before the import transform: `runStoreMigrate` (`lib/store/create.ts`)
      builds the import's source through `createStore`. This unit's share therefore lands before the collapse share.

---

## The collapse share — cut out at the flip's landing

Held here until the cut; `cutover-in-repo-removal` (D9) takes it whole.

- **The in-repo implementation** (`lib/store/in-repo/`, 32 files, 2,782 lines), with the three flip pieces bound to it:
  the environment override in `createStore` and the flip build's unimported-repository refusal, both the flip's to
  build, and the sealing guard already on `main` (`refuseWriteIfStoreImported`, `lib/store/store-imported.ts`, with
  `handlers/pre-cutover-seal.ts`; PR #1287). Its callers are every importer of those two modules: among them the
  in-repo backend, the Errand identity and merge paths, the refusal codes (`lib/store/refusal.ts`,
  `lib/errand/result-common.ts`), the seals in `arc sync` (`handlers/sync.ts`) and in `arc errand`'s handlers
  (`handlers/errand.ts`), and the notes writers, which go with notes sync if `cutover-notes-removal` lands first. With
  it go the architecture-test predicates that name `lib/store/in-repo/` (`storeViolations`,
  `eslint/architecture-imports.ts`) and the CI lane that runs both backends.
- **Every dormant capability arm:** about 217 sites in 113 files under `lib/` and 440 sites in 163 files under
  `handlers/`, `commands/`, and `scripts/`, with the modules only they reach (census estimates, upper bounds), and
  then the capability itself (`StoreCapabilitiesSchema`, `lib/store/read.ts`; `usesOffBranchState`,
  `lib/store/lifecycle-write.ts`) and its carriers, once nothing produces false. Among them are the pre-flip-only
  refusals the census found (`arc pause`, `arc handover`, `arc task close` and `defer`, `arc save`, `arc editor`,
  `arc status --conflicts`, and the dormant store-command arms).
- **The dormant code this unit's removals leave** (the boundary rule, § Scope):
    - `runResume` (`lib/work-unit/verbs/park-resume.ts`), with `arc resume`'s and `arc start`'s in-repo arms;
    - `renderRoadmapFromIndexViewResult` (`lib/status/roadmap-regeneration-assert.ts`), with the in-repo rename's
      ROADMAP regeneration (`commands/rename.ts`) and the executor's ROADMAP effect
      (`lib/work-unit/executor-context-status.ts`);
    - the `reconcile-regenerable` next action and the `--regenerate-roadmap` argument its dormant arms still emit
      (`scripts/integration/checkpoint.ts`, `scripts/integration/errand-merge.ts`), with the regenerable path class;
    - `runUserClose` (`commands/user/close.ts`), which teardown's in-repo arm reaches for a unit torn down as abandoned
      (`handleTeardown`, `handlers/lifecycle.ts`);
    - the executor's workspace side effect and the worktree scaffold's in-repo arm (its workspace open and
      session-notes seed), with `runUserOpen` (`commands/user/open.ts`), which they reach, unless `cutover-flip`
      removes the two with the workspace; `runUserOpen` then goes with `arc user open` (§ Scope);
    - `arc start`'s store-side resume refusal (`handlers/start-store.ts`) with `resolveStartDispatch`'s `resume` arm,
      once it is confirmed that no store index yields a `parked` entry: the import turns parked work into a pause
      (`lib/store/ref/import/parked-source.ts`);
    - `arc view`'s pre-flip arm (the register's `arc view` row): its checkout-or-ref read and its `--path` /
      `--editor` refusal;
    - `archive.cadence`'s in-repo-only readers (#24; D3).
- **#1's internal share,** after the mixed-module splits in § The moves that remain:
    - the branch-tree readers, except what the old decomposition machine reaches (§ What the old decomposition
      machine still imports): `lib/status/project-view-ref.ts`, the Git retirement-authorization and transition-record
      readers, the ref-reading parts of `in-flight-derivation.ts`, `remote-ref-reader.ts`'s meta-at-ref readers,
      `completed-index.ts` (`*FromRef`), the session-init sweeps' base-archive reads, base drift's read of
      `.arc/completed/` from base history (`lib/base-drift/current-adapters.ts`) unless `cutover-flip` takes it, and
      `scripts/review-gate/hosts/local/git-tree-fs.ts`;
    - lifecycle classification and exclusion: `evidence-applicability/path-treatment.ts`,
      `delivery/lifecycle-contribution.ts` with its Git variant, and the evidence-neutral and regenerable arms, once
      their surviving importers move off them (`candidate-evidence.ts`, `git/base-overlap.ts`, and the seven
      `lifecycle-contribution` importers: `git-lifecycle-contribution`, `entry-inspection`, `chain-containment`,
      `repository-entry`, `git-eligibility`, `handlers/delivery-execution.ts`, and `pre-publication-composition`).
      The spec review copy's arm stays (§ The moves that remain). How the `lifecycle-contribution.ts` path group
      treats the copy in a stacked delivery is an open question with `delivery-observe-attest`; if its answer lands
      first, carry it through the group's removal.
- **The in-repo arms the seam members left,** and each register row's internal deletion share, among them:
    - #4: lineage's `rename` kind and its parser, and `Next Task`, `Last Completed`, and `Blockers` in the meta's parsed
      schema, with their writers and every pre-flip arm that writes them;
    - H2: the user-surface rooting (`lib/user-surfaces.ts`, which `lib/store/in-repo/personal-paths.ts` imports) and
      its migration (`lib/user-surface-migration.ts`), after `IDENTITY_STATUS_FILENAME` moves;
    - `DERIVED_VIEWS` (`lib/store/registry.ts`) and #26's in-repo arms;
    - `seam-delivery-review`'s retired arms (`spec-seam-delivery-review.md` § 12.6, § 14.3), among them the frontline
      skip marker's kind and names and the per-clone repository ID record (`identity/repository-identity.json`), which
      the review gate stops reading once it takes the project ID; and the held Candidate staging-recovery arm
      (`appendCandidateResponse`, `stageCandidateResponse`);
    - the write-context guard (`lib/git/write-context.ts`, the register's row), whose `ProtectionMode` type stays for
      `cutover-decompose-removal`;
    - the interim `personal/session-context` kind (`KIND_MECHANISMS`, `interim: true`, `lib/store/registry.ts`),
      unless `cutover-flip` removes it with the per-work-unit workspace;
    - `arc active status`'s and the review gate's local live context's reads of `.arc/active/`
      (`readActiveMetaCandidates`; `commands/active/status.ts`, `scripts/review-gate/hosts/local/live-context.ts`),
      which no seam change reroutes (`spec-seam-locus.md`), moved onto the store or kept over the projection;
    - `git-decomposition-object-readers.ts`, which `spec-seam-decomposition.md` says is not decomposition's.
- **The suites that target the in-repo implementation** (#10's share): a store suite that runs the shared conformance
  suite or tests a consumer through the contract survives, while one that targets the in-repo implementation by name
  retires with it, the list taken from the ref backend's implementation.
- **Its own derivation:** the rule for when an arm is deletable, grounded per producer of a false capability; the
  test surface, once `cutover-flip` says how its tests stay green; whether `git-retirement-authorization-context.ts`'s
  Git logic serves `arc teardown --branch` on the store path; and the order against `cutover-decompose-removal`
  for the v3 decomposition schema and plan, which leave with or after lifecycle's in-repo graduation
  (`spec-seam-decomposition.md`).

### What the old decomposition machine still imports

The collapse share leaves in place every module the old machine reaches, directly or through what it calls, and moves
their other callers onto store reads. Among them:

- the transition-record cluster: `isGitTransitionOriginOccupied` (`git-transition-record-enumeration.ts`),
  `createInRepoTerminalTransitionRecordWriter` (`terminal-transition-record-writer.ts`), and
  `transition-record-store.ts`;
- `transition-overlay.ts`;
- `artifactMatcher` and `pruneEmptyBacklogSource` (`mutators/relocate-artifacts.ts`);
- `resolveProjectReadinessViewInput` and its file-view types (`lib/status/project-view.ts`), with `deriveInFlight`
  (`lib/git/in-flight-derivation.ts`) and the readers it reaches, `remote-ref-reader.ts`'s meta-at-ref readers among
  them, which the old machine reaches through that function's local-refs path
  (`lib/work-unit/git-decompose-v3-repository-plan.ts`);
- the `ProtectionMode` type (`lib/git/write-context.ts`).

`cutover-decompose-removal` deletes each with its last caller, so the two land in either order. The cluster,
`transition-overlay.ts`, and `relocate-artifacts.ts` import nothing the collapse share deletes.

---

## Alternatives

The boundary, 2026-11-10:

- **Split by what reads as live:** chosen (Planning state).
- **Stay one unit, planned in segments:** rejected. About 37,000–75,000 changed lines would land in the Gate B window,
  and no recorded reason holds it whole above the mark.
- **Delete only what the compiler forces:** rejected. It leaves dormant arms with no owner and the register rows'
  deletion shares open.

---

## Decisions

Settled with the Owner on 2026-11-10 unless marked otherwise.

- **D1. The collapse unit's Gate B placement:** a Should, with the in-repo implementation first in its order so it
  can be pulled forward (Owner, through the PM). Gate B's Musts are what a user, CI, the recipe, or `--help` exposes;
  internal machinery is a Should, as `cutover-decompose-removal` was placed. `RELEASE-GATES` records it: the Must line
  no longer names the in-repo store, the Should paragraph adds the collapse unit, and Stage 3's Boundary records the
  split. Its name and its timing against the rename sweep are D9's.
- **D2. This unit's size:** held whole at two to nearly three times the mark. The excess is the import transform and
  its tests, a pure deletion of one subsystem, the reason the Owner accepted for the two sibling members; moving the
  import to the collapse unit would leave `arc store migrate --import` visible until then. The window's tooling
  (§ Scope) adds about 2,000–4,000 changed lines, a fifth of the flip's change by `RELEASE-GATES`' reading, until its
  spec measures it; it is here as cleanup the window leaves, which nothing runs again. The PM re-reads the January
  calendar at this draft's close: this unit's source share, about 6,500–8,000 lines before the tooling, is below the
  map's 9,000–10,000 source lines, but with its tests and the tooling it comes to about 20,500–27,000 changed lines.
- **D3. `archive.cadence`:** the key stays, since `spec-seam-locus.md` A26 reads both arms and `cutover-flip` keeps
  integrate's dispatch. Only its in-repo-only readers go, dormant arms the collapse share takes: the census places
  them at `scripts/integration/checkpoint-composition.ts:456-480` and `:804`, `merge-composition.ts:341-347`, and
  readiness's in-repo cadence dispatch (`scripts/review-gate/readiness.ts:846-864`, whose `wrong-cadence` facts are
  raised at `:469` and `:770`). The store path's `wrong-cadence` refusal (`readiness-store.ts`) stays. #24's
  retirement of the key is rejected.
- **D4. #20:** narrow `MACHINE_LOCAL_PATHS` (`lib/store/registry.ts`) to the identity root's `.internal/`, dropping
  `<identity>/*/.internal/**`, but keep `malformedKeyProblem` (`lib/store/ref/path-admission.ts`) refusing a
  `.internal` segment in a personal key (the PM's refinement). Agents keep private files outside the repository and
  `.internal/` at the identity root is ARC's, so nothing needs a private folder inside `scratch/`; but on a public
  state remote a file placed in `scratch/.internal/` expecting privacy would be published for good, so the key check
  fails closed. That is a documented exception to storage-contract D5's "anything goes" in `scratch/`, and the refusal
  names its remedy.
- **D5. The residue refs:** local only, since `origin` holds only `refs/arc/user/andrew/errands`, which is live. An
  Owner-present step at this unit's verification, after the window has imported the held delivery work unit's
  artifacts, deletes the six local refs: `refs/arc/recovery/delivery-state/*`, `refs/arc/bootstrap/*`, the three
  `refs/arc/delivery-candidates/d2f24ab2-…`, and `refs/arc/user/andrew/errands-remote`. The `delivery-candidates`
  namespace stays live in code (`residue-reaping.ts`, `git-materialization.ts`). The
  `spike/delivery-rebuild-continuity-model` branch goes when that work unit archives, as the register has it. The
  same step removes the window's other machine-local leftovers on each of the Owner's clones that predates the flip
  (§ Scope), since no other project holds them: CineXplorer is installed fresh.
- **D6. The ROADMAP conflict remedy's landing:** one change takes the command, its script and library, `arc base
  merge --regenerate-roadmap` with base merge's remedy application (the library's other importer; extended at the
  design review), the hook block in both copies, the merge driver with its attribute writer and this repository's
  `.gitattributes` line, and the hooks `README.md` text. The hook's block runs the remedy on every commit
  under `arc-in-git`, not only on a ROADMAP conflict, and falls back to `arc hook-remedy-roadmap-conflict` through
  `run_arc_cli` when the tree has no remedy script, so a hook left calling a CLI without the command would fail every
  commit. No live caller reaches that fallback: this repository's `.husky/pre-commit` runs each branch's own tracked
  hook, which finds the remedy script in the same tree; CineXplorer's legacy hooks (`.githooks/`) call neither the
  command nor `arc`; and no other project carries the shipped hook before the public release. The flag's case is the
  same: on `main` after the flip nothing produces a regenerable conflict, since each pre-flip branch takes ROADMAP's
  deletion when it merges, running its own build (`cutover-flip`'s draft, § Tracked state the import does not
  claim); its dormant emitters stay for the collapse share. The removal's changelog entry (D7) names the hook change
  for projects that refresh through `arc update`.
- **D7. The recipe notice:** a changelog entry naming the retired merge-gate recipe (D10), the removed commands and
  options, and the hook change, with no compatibility alias, per the pre-public-release posture.
- **D8. The review stop rule:** stop when a pass's findings include no critical or major one that survives
  verification, and return to the Owner after three independent passes either way.
- **D9. The collapse unit's name and timing** (Owner, 2026-11-10, at the draft's close): `cutover-in-repo-removal`,
  named for the in-repo implementation it removes first; and the timing rule `cutover-decompose-removal` carries as a
  Gate B Should: planned once cut at the flip's landing, it lands before the rename sweep's start if it can, and
  otherwise waits until after the deadline, any `naming-conventions` edge dropped then at the Owner's call.
- **D10. The merge-gate recipe** (Owner, 2026-11-10, at the design review): retired whole. Its README, CODEOWNERS
  template, and `setup-merge-gate.md` serve only the planning auto-merge lane, which has nothing to classify once
  planning state is untracked, and nothing in ARC depends on what it installs. The rejected alternative, a slim recipe
  keeping the `ci-ok` roll-up and review on every path, would be general GitHub practice rather than ARC's. `arc
  merge lock`, the draft-PR hold, stays; its doctrine sits inside `strategy-work-organization.md` § Auto-Merge Lane,
  so `cutover-documentation` moves it when it retires that section.

---

## Success signal

Once this unit lands, on its merged head:

- no verb or option in `arc --help` or the shipped verb index refuses on every input, or acts on nothing, on a
  store-backed checkout: the census, redone on the merged head, finds none outside other members' shares;
- the pre-commit hook, both copies, carries no check over tracked ARC state paths and no remedy block, and
  `arc review planning-lane`, `arc review planning-grooming`, `arc hook-remedy-roadmap-conflict`, `arc plan`,
  `arc housekeep check`, and `arc store migrate --import` are gone from the CLI, and nothing of the window's tooling
  remains in source or the shipped scripts;
- `ci.yml` classifies no lane, `arc-lane-attestation.yml` is gone, and this repository's CODEOWNERS carries no
  auto-merge block;
- `init-recipe.json` installs no merge-gate file and no script only the lane attestation ran, nothing it installs
  names a removed command, option, check, or key, and the configuration schema has no
  `hooks.contributor_protected_paths` or `hooks.task_numbering`;
- the build is green, the link audit passes, and a search of `src/`, the shipped `arc/` tree, this repository's
  `.arc/`, and `.github/` finds a removed command, option, key, or file path only in the changelog entry, in the
  point-in-time records the boundary rule exempts, in the dormant code § The collapse share names, and in the old
  decomposition machine `cutover-decompose-removal` deletes;
- any help text this unit rewrote, for help the flip declined, describes its command's store arm;
- the six residue refs and the window's other leftovers are gone from the Owner's clones that predate the flip, and
  `.git/arc/review-gate/` holds only what the store still reads.

---

## ADR dispositions

- **The boundary split, its rule, and the cut's timing:** `none`, temporary. They are planning-boundary decisions,
  recorded in `RELEASE-GATES` and the cohort record, that hold until both units land; they decide nothing about the
  system.
- **Every removal in § Scope:** covered by ADR-035, whose decision moves state off the branch and leaves these surfaces
  nothing to act on. The planning lane's note-level passages in ADR-021, ADR-029, and ADR-031 are superseded or
  amended by `cutover-documentation` at its pass, by the ADR methodology's tiers (the register's ADR row).
- **D2, D5, D6, D7, D8:** `none`. Each is a tactical or temporary choice: a work unit's size, a one-time cleanup, a
  landing order, a release-note convention, and a review stop rule.
- **D3:** `none`, tactical. It declines a removal and keeps shipped behavior whose record is
  `spec-seam-locus.md` A26.
- **D1 and D9:** `none`, temporary. Planning placement and naming, whose record is `RELEASE-GATES`.
- **D4:** `none`, tactical. It refines a rule that lives in a spec, `spec-storage-contract.md` D5, not in an ADR, so
  its record is this unit's spec beside the exception it makes there.
- **D10:** covered by ADR-035, under which the classifiers that exist only because state rides code history can be
  deleted. The lane's classifier is one, and the recipe is that lane's, so retiring it carries the lane's retirement
  through rather than changing what ADR-021 decided. ADR-021's lighter merge gate, one of its Decision's operational
  conventions, and its recipe consequence are among the passages the register's ADR row gives
  `cutover-documentation`, which records them at its pass by the ADR methodology's tiers, as ADR-021's dated note for
  ADR-037 did. The lane's record is true from the flip's landing; the recipe consequence's only once this unit removes
  the recipe, so `cutover-documentation` records that half with or after this unit's landing. It is pending until
  that member's draft holds the hand-off (Planning state, Open).
- **The moves, if `cutover-flip` declines them** (base drift onto the store's archive, the rename source onto
  `lookup`): covered by ADR-035.

---

## Unknowns and Assumptions

- **`cutover-flip`'s test surface** (asked 2026-11-10): how the test files that build an in-repo store through
  `createStore` stay green once it builds the ref store. The answer sets the collapse share's test lines.
- **Base drift and the delivery rename source** (offered to `cutover-flip`, 2026-11-10). If the flip declines them,
  they become this unit's moves: base drift's resolver reads the store's archive instead of `.arc/completed/`, and the
  rename source reads former slugs through `lookup`.
- **H2** holds against `spec-projection-worktrees.md` § 12.8 (approved) and its task 2.5, which removes the store
  teardown's merge and guards the other callers before the flip. That task keeps `IDENTITY_STATUS_FILENAME` in
  `lib/user-surfaces.ts`, so the constant moves before the file goes.
- **The window's pieces:** the sealing guard has been on `main` since PR #1287. The quiesce check and the rest of the
  window's tooling are `cutover-window-tooling`'s, split from `cutover-flip` on 2026-11-10 (PR #1316); the override
  and the refusal exist only in `cutover-flip`'s draft. Their placement here assumes those units' shapes, and
  `cutover-window-tooling`'s spec sets what § Scope's item on the window's tooling holds.
- **What `cutover-flip`'s spec takes** of the items this draft names as its if the flip declines them: the interim
  `personal/session-context` kind (§ The collapse share) and the help text the flip makes stale on commands that
  keep working, which its rule for what would mislead places at the flip beside the status help it already takes:
  `arc start`'s description, `-y`, and `--new`; `arc resume`; `arc materialize`; `arc rename`; `arc view --for` and
  its after-help; `arc view`'s `session-notes` kind; `arc wu reconcile --apply`; `arc errand next`, `link`, and
  `close`; and `arc decompose`'s option text, which describes the repository arm. Help text it declines is this
  unit's to rewrite (§ Scope).
- **The import has no use after the window** (`cohort-state-storage.md` § Import scope: CineXplorer is installed fresh
  and migrated by hand). If its migration comes to use the import, the transform stays until that has run.
- **The inventory** is re-measured against the base the flip lands on, and again at its landing (PM brief).

---

## Scope boundary (Won't Do)

- Notes-specific sync, the sync-state ref, and the suites that target notes: `cutover-notes-removal`, the notes-era
  `arc user` verbs and `arc user inbox-list` among them.
- The old decomposition machine and the modules it reaches (§ What the old decomposition machine still imports):
  `cutover-decompose-removal`, with the repository arm's handling of the `arc decompose` options this unit removes
  (the renderer's `--advance-base` argv, the mode key, and the schema field and its option mapping).
- Strategy and ADR rewrites: `cutover-documentation`, among them retiring § Auto-Merge Lane and moving the draft-lock
  model it holds (D10); this unit removes only the section's mentions of the recipe and its link definition.
- The `Context:` footer grammar and its state-only commit kinds (`lib/commit-check/artifact-resolver.ts`,
  `lib/commit-check/policy.ts`): `ghost-mode`, which owns the footer policy by the register's footer-grammar row and
  keeps footers as they are until the store's task capture exists.
- The documentation site under `docs/`: `docs-content-sweep` (`RELEASE-GATES`), among it
  `docs/customization/configuration.md`'s rows for `hooks.task_numbering` and `hooks.contributor_protected_paths`.
- Anything true at the flip's landing, which is the flip's by its rule: among them the ROADMAP template's install
  entries, `verify-integrity.sh`'s presence test, the workflow rewrite, and help text that would mislead.
- The collapse share, once cut.

---

## Inbound dispositions

The Owner's planning pass, 2026-11-10.

| Entry                                                                                                    | Outcome             | Fold location, or reason                                                                                                                                                                                                                                                                               |
| -------------------------------------------------------------------------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| #1. Delete the code `cli-substrate-complete-migration` carves out                                        | fold, split         | Hook checks and CI classifier: § Scope. Branch-tree readers and lifecycle classification: § The collapse share. Notes sync: `cutover-notes-removal`'s share, held in its draft. The spec-reconcile residual is dismissed: that shipped spec defers to the register, whose rows name `storage-cutover`. |
| #3. Retire the live transition-record test when lineage moves to the store                               | dismiss             | `cutover-flip` takes it with the `.internal/` untrack (Owner, 2026-11-05).                                                                                                                                                                                                                             |
| #4. Drop lineage's `rename` and the meta's retired session fields                                        | fold                | § The collapse share, the in-repo arms.                                                                                                                                                                                                                                                                |
| #10. Delete the import's transform, the suites that target retired substrates, and the sync-state ref    | fold, split         | Import transform: § Scope. In-repo suites: § The collapse share. Sync-state ref and notes suites: `cutover-notes-removal`'s share, held in its draft.                                                                                                                                                  |
| #20. Decide whether `scratch/.internal/` is machine-local or the person's own                            | fold                | D4.                                                                                                                                                                                                                                                                                                    |
| #24. Retire `archive.cadence` at the flip, with its readers                                              | fold, split; reject | Reader pruning: D3 and § The collapse share. The key's retirement is rejected: `spec-seam-locus.md` A26 reads both arms, and `cutover-flip` keeps integrate's dispatch.                                                                                                                                |
| #35. Remove the review gate's inert local folders                                                        | fold                | § Scope, what the window leaves.                                                                                                                                                                                                                                                                       |
| H2. Remove the user-surface rooting and its migration                                                    | fold                | § The collapse share; the leftover `STATUS.USER.md` files: § Scope.                                                                                                                                                                                                                                    |
| Delete the pre-flip guard, the quiesce check, the in-repo override and the unimported-repository refusal | fold, split         | Quiesce check: § Scope. Guard, override, and refusal: § The collapse share, bound to the in-repo implementation.                                                                                                                                                                                       |
| Drop #3 from this unit                                                                                   | fold                | Planning state.                                                                                                                                                                                                                                                                                        |
| Remove `seam-delivery-review`'s retired review-gate arms, and keep the review copy's classification arm  | fold                | Retired arms and the `delivery-observe-attest` check: § The collapse share. Review-copy arm: § The moves that remain.                                                                                                                                                                                  |
| Remove the CODEOWNERS auto-merge block and its shipped template                                          | fold                | § Scope, the CI planning classifier; D10.                                                                                                                                                                                                                                                              |
| Remove `verify-integrity.sh`'s meta-shape check                                                          | fold                | § Scope, shipped scripts.                                                                                                                                                                                                                                                                              |
| Keep `archive.cadence` past the flip                                                                     | fold                | D3.                                                                                                                                                                                                                                                                                                    |

---
