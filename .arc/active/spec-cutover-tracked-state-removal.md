# Spec (`detailed` · `RFC`): Cutover Tracked-State Removal

- **Origin:** [internal] — the `storage-cutover` cut (2026-11-03)

- **Purpose:** Remove every ARC surface that reads as live but does nothing once planning and operational state leave
  the branch. That means every command, option, hook check, configuration key, CI step, and shipped file a user, a
  project's CI, or `arc --help` would take as working, together with the one-time import and the cutover window's
  tooling and leftovers. It also corrects the one machine-local rule the new layout makes wrong.

---

## Introduction / Context

ARC is moving operational and planning state out of tracked branch files and Git notes into same-repository
`refs/arc/*` behind one storage contract (ADR-035), with a gitignored projection at the familiar `.arc/` paths as the
working copy. The seam work built each store path dark behind a store capability, `capabilities.stateOffBranch`
(`StoreCapabilitiesSchema`, `lib/store/read.ts`), and left the in-repo path beside it. The repository's own state
crosses over in one window: the window's tooling quiesces it, a one-time import copies it into the ref store, and the
flip change switches the backend.

**Prerequisite: the flip.** This change builds on the flip change (`cutover-flip`) as an expected contract, available
once that change has landed on `main`. From its landing:

- `createStore` (`lib/store/create.ts`) builds the ref backend, so every store a command opens reports
  `stateOffBranch` true;
- the projected roots (`.arc/active/`, `.arc/backlog/`, `.arc/completed/`, `.arc/user/`) and the Candidate,
  integration-boundary, and transition records under `.arc/system/.internal/` are untracked, and `ROADMAP.md` is no
  longer stored, so no commit carries a planning artifact;
- every shipped workflow is rewritten onto the store, including the steps that armed the planning auto-merge lane;
- help text that the new backend makes false on commands that keep working is rewritten, base drift names
  integrations from the store's completed records, the store archive records `PR URL` and `Completed`, and delivery's
  rename source refuses when its transitions folder is missing at the ref;
- the cohort kind's write check (`checkCohortDocument`, `lib/store/kinds/cohort/check.ts`) carries
  `cohort.member-sections`: a hand edit, a write by write-back or `arc save`, refuses when the cohort record's
  `## Members` names a slug that is not the current name of a member of the cohort, live or completed, through
  `reportOrphanCohortMemberSections`, and a verb's write passes;
- Git notes are retired.

Before the flip lands, `createStore` builds the in-repo implementation alone, so none of this holds yet. This
change's inventory is therefore measured against the flip's implementation and again once the flip has landed
(§ 2.11).

**What the flip leaves.** Some of what the flip makes dead still shows. A verb refuses on every input, an option is
accepted and ignored, a hook check passes vacuously, a CI classifier has nothing to classify, a configuration key
selects nothing, and a shipped merge-gate recipe is built around a planning lane that can no longer fire. Each tells
a user, an installed project's CI, or an agent reading `arc --help` that something works when it does not. The rest
of what the flip leaves dormant is internal: code no production store reaches, which misleads no one and is removed
separately (§ Non-Goals).

## Goals

1. **No refusal-only or inert command surface.** On a store-backed checkout, no registered verb or option refuses on
   every input or acts on nothing, whether or not `arc --help` or the shipped verb index lists it, outside the
   surfaces another change removes (§ Non-Goals).
2. **No check over tracked ARC state.** The pre-commit hook, in both copies, carries no check whose input is a tracked
   ARC state path and no ROADMAP remedy block, and the configuration schema carries no key that only such a check
   read.
3. **No planning lane.** CI classifies no planning lane, the lane-attestation workflow is gone, the review gate's
   planning-only routing is gone, and this repository's CODEOWNERS carries no auto-merge block.
4. **No merge-gate recipe.** No project installs the merge-gate recipe, and nothing installed names it.
5. **No one-time cutover machinery.** The import transform and `arc store migrate --import` are gone (§ 2.7), the
   window's tooling is gone apart from the seal on `arc user load` (§ 2.8), and the window's leftovers on disk and in
   refs, other than the review gate's local records (§ Non-Goals), are removed from each of the repository owner's
   clones that holds them (D5).
6. **No dangling reference.** Nothing that remains names a removed command, option, check, key, or file, except the
   records this change exempts (§ 1) and the documentation site (§ Non-Goals).
7. **No machine-local rule the new layout makes wrong.** A `.internal/` folder in the person's scratch space is not
   machine-local, and a personal key that names one, at any depth, is refused rather than published (§ 2.9).

## Non-Goals

_Editable in place until activation, then frozen; changes after that append: `Amended YYYY-MM-DD — <delta> — <prompt>`_

- **Dormant internal machinery.** The in-repo store implementation (`lib/store/in-repo/`), the capability's false
  arms, the seam members' in-repo arms, the branch-tree readers, lifecycle classification and exclusion, and the
  write-context guard (`lib/git/write-context.ts`) stay. They are removed in a separate change,
  `cutover-in-repo-removal`, which lands after this one. Code a dormant arm also reaches stays under § 1's rule,
  among it `runResume`, `runUserClose`, and the ROADMAP render arms.
- **The old decomposition machine** and every module it reaches, directly or through what it calls, stay; a separate
  change, `cutover-decompose-removal`, deletes each with its last caller. That includes the repository arm's handling
  of the `arc decompose` options this change removes: the renderer's `--advance-base` argv
  (`lib/work-unit/decompose-command-renderer.ts`), the mode keys (`lib/work-unit/decompose-command-routing.ts`), and
  the shared input schema's fields and their option mapping (`handlers/decompose.ts`).
- **Notes-specific sync**, the sync-state ref, the notes configuration keys, the suites that target notes, and the
  notes-era `arc user` verbs, `arc user inbox-list` among them, stay; `cutover-notes-removal` removes them.
- **Strategy and ADR rewrites** stay with `cutover-documentation`, among them retiring
  `strategy-work-organization.md` § Auto-Merge Lane and moving the draft-lock model it holds. This change removes only
  that section's mentions of the merge-gate recipe and its link definition (§ 2.4).
- **The `Context:` footer grammar** and its state-only commit kinds (`lib/commit-check/artifact-resolver.ts`,
  `lib/commit-check/policy.ts`) keep their current behavior.
- **The review gate's local records** under `.git/arc/review-gate/` stay untouched. Which files nothing reads is exact
  only once the import and the in-repo arms are gone, so `cutover-in-repo-removal` removes them.
- **`verify-integrity.sh`'s § 7 Meta-file shape** stays, in both copies. It reads the projected meta files on disk,
  where a hand edit no `arc` command has taken in yet (write-back runs at each command's entry,
  `lib/store/projection/command-hooks.ts`), or one write-back refused and left at its path
  (`decideWriteBackRefusal`, `lib/store/projection/write-refusal.ts`), can still lack its metadata H1 or the closing
  `---` after it.
- **The documentation site** under `docs/` is not edited, including `docs/customization/configuration.md`'s rows for
  the two retired hook keys.
- **What the flip itself changes** (§ Introduction) is not redone here: the help text it rewrites, the workflow
  rewrite, the ROADMAP template's install entries, `verify-integrity.sh`'s ROADMAP presence test, the base-drift
  resolver, and the delivery rename source's refusal. Moving delivery's rename source onto store reads is not this
  change's either.
- **`archive.cadence`** stays, with both supported arms (D3).
- **`arc merge lock`**, the draft-pull-request hold, stays.
- **`lint:md:descriptors`** stays: it still lints the task-list template, and only its task-list path selector goes
  dead.

## Proposed Design

### 1. The boundary rule

This change removes each **exposed surface** the flip makes refusal-only, inert, or vacuous: a command or option
registration, a hook block, a configuration key, a CI step, a check in a shipped script, an entry in this
repository's CODEOWNERS or `.gitattributes`, or a shipped file. It also removes the one-time cutover machinery once
the window has run (§ 2.7, § 2.8), and corrects the one machine-local rule the new layout makes wrong (§ 2.9). With
a surface goes the code reachable only through it. Code that a dormant capability arm also reaches stays for the
dormant machinery's removal (§ Non-Goals), even when this change removes its last live caller.

Removing a surface also removes every reference to it that remains when this change lands: links, remedy and help
strings, examples, test assertions, and prose mentions, in the repository's tracked files outside the documentation
site (`docs/`), among them source, tests, the shipped `arc/` tree, this repository's `.arc/` and `.github/`, and the
root `scripts/`. Exempt from this:

- point-in-time records: an ADR's Context and other invariant sections, dated analyses, completed work units'
  records, and the package changelog, D7's entry among it;
- tests that assert a removed surface is absent, such as a check that a command is no longer registered;
- the dormant code § Non-Goals keeps, and the old decomposition machine, whose references leave with them;
- doctrine another change rewrites (§ Non-Goals), where this change removes only the reference and leaves the
  rewrite, so no landing order binds the two.

Each inventory in § 2 states its rule with its known members as examples. The members were found by a census of every
registered command path against the flip's end state (2026-11-10); § 2.11 makes the census complete.

### 2. The inventory

#### 2.1 Verbs and options that only refuse or act on nothing

A registered verb or option goes when, from the flip, its store arm refuses on every input, or accepts the input and
writes or reads nothing it governs. Known members:

- **`arc park`** (`handlers/lifecycle.ts`), with `runPark` (`lib/work-unit/verbs/park-resume.ts`) and
  `lib/work-unit/pointer-record.ts`, which only `runPark` uses. Its store arm refuses; `arc pause` and `arc resume`
  replace it. `runResume` stays (§ Non-Goals).
- **`arc resume --here`**, which refuses toward `arc materialize --here` on every input
  (`lib/work-unit/verbs/pause-handover.ts`).
- **`arc user open`** (`handleUserOpen`, `handlers/user.ts`), which refuses `unsupported` from the flip, and **`arc
  user close`** (`handleUserClose`, `handlers/user.ts`), which has no store arm: it removes
  `.arc/user/<identity>/<name>/` for any valid name, so from the flip it finds no per-work-unit workspace to remove,
  the window having removed them, and given `scratch` it deletes the person's scratch space. `runUserClose`
  (`commands/user/close.ts`) stays, since teardown's in-repo arm reaches it for a unit torn down as abandoned.
  `runUserOpen` (`commands/user/open.ts`) stays while the lifecycle executor's workspace side effect or
  the worktree scaffold's in-repo arm reaches it at the flip's landing, and otherwise goes with `arc user open`.
- **`arc user inbox-mark-execute-bound`** (`handlers/user.ts`), which `arc errand queue set` replaces, and the
  title-keyed inbox operands, which refuse from the flip: `arc user inbox-remove`'s title forms
  (`handlers/user-inbox-remove-store.ts`), and `--inbox-title-file`, `--inbox-entry-file`, and a title given to
  `--from-inbox` on `arc errand open` and `arc errand link` (`lib/inbox-entry-operand.ts`). `matchInboxEntryTitle`
  stays; the notes-sync removal keeps it among its survivors.
- **The write-context classifiers:** `arc plan check` (`handlers/plan.ts`) and `arc housekeep check`
  (`handlers/housekeep.ts`), with their command groups and options, which answer `proceed` on every input from the
  flip, since store writes do not depend on the checkout. Their shipped callers go with them where the flip's
  workflow rewrite leaves them: `draft-design.md`'s preflight and the quick-reference line for `arc plan check`, and
  `drain-inbox.md`'s precondition for `arc housekeep check`. The guard they classify against stays (§ Non-Goals).
- **`arc decompose --advance-base`, and `--finish` given a map,** which the store arm refuses on every input
  (`handlers/decompose-store.ts`): their `cli.ts` registrations, the store arm's refusals, and the mention of
  `--advance-base` in the shared input schema's error message (`handlers/decompose.ts`).
- **Options the store arm ignores:**
    - `arc activate --task`, which its help calls required though the store arm ignores it and writes only
      `Next Action` (`runStoreActivate`, `lib/work-unit/verbs/activate-deactivate-store.ts`), with the shipped lines
      that tell agents to pass it: `activate-work-unit.md`'s first-task input and command, and the quick-reference
      template's `arc activate` line;
    - `arc publish --last-completed`, which the store arm never reads, since it derives no retired task field
      (`runStorePublish`, `lib/work-unit/verbs/publish-store.ts`);
    - `arc teardown --force`, which the store teardown never reads: `runStoreTeardown`
      (`lib/work-unit/verbs/teardown-store.ts`) takes the mode from the selected end's rule, and a force flag grants no
      discard authority;
    - `--local` and `--no-fetch` on `arc active in-flight`, and the same pair on `arc errand check`, whose store arm
      reads them only to suppress an unreachable-remote warning its overlap check never raises; the store path fetches
      nothing (`lib/git/in-flight-store.ts`), so there is no network read to skip.

  `arc archive --pr-url` and `--completed` stay: from the flip the store archive writes both fields, `--completed`
  defaulting to the ship day.

#### 2.2 The lifecycle hook checks

Every pre-commit hook check whose input is a tracked ARC state path goes, in both copies of the hook (the package's
`arc/system/.internal/githooks/pre-commit` and this repository's `.arc/` copy), with the scripts only it runs and the
configuration keys only it reads. From the flip each passes vacuously: the hook's checks read staged paths
(`git diff --cached --name-only --diff-filter=ACMR`), unstaged modifications (the task-list staging warning,
`git diff --name-only --diff-filter=M`), or unmerged entries (the ROADMAP remedy), and all three sets hold only tracked
paths, so nothing under an ignored projected root reaches a check. Known members, by hook check ID:

- `CHECK[meta-file-shape]`, with `scripts/validate-meta-spec.ts`;
- `CHECK[cohort-consistency]`, with `scripts/validate-cohort-consistency.ts`;
- `CHECK[roadmap-regeneration-assert]`, with `scripts/assert-roadmap-regenerated.ts` and the parts of
  `lib/status/roadmap-regeneration-assert.ts` only it uses (`renderRoadmapFromIndexViewResult` stays for the in-repo
  rename and the executor's ROADMAP effect, which import it);
- `CHECK[roadmap-regeneration-trigger]`, the ROADMAP render-field warning;
- `CHECK[foreign-write-advisory]`, with `scripts/check-foreign-writes.ts`, which already returns on the capability;
- `CHECK[contributor-protected-files]`, with `hooks.contributor_protected_paths`;
- `CHECK[task-list-staging]`;
- `CHECK[task-numbering]`, with `hooks.task_numbering`.

Both keys leave the configuration schema (`lib/config/schema.ts`) and its validator (`commands/config/validate.ts`).
`hooks.contributor_protected_paths` defaults to `active/|backlog/`, which names only projected roots, and the
warning's text speaks of the task lists, work status, and backlog items kept there; a project that pointed the key at
tracked paths loses that warning, and D7's notice names the key.

No result was assurance: the meta, cohort, and task-list rules run as record-kind write checks at every store write
(`meta.field-block` and `meta.stage` in `lib/store/kinds/meta/`, `cohort.purpose` and `cohort.parent` in
`lib/store/kinds/cohort/rules.ts`, and `task-list.segmentation` in `lib/store/kinds/task-list/shape-rules.ts`). The
segmentation check refuses the numeric third segment `CHECK[task-numbering]` looked for, which the scanner's
`ParentTaskIdSchema` marks malformed, and the hook's pattern no longer matches today's backticked task markers. The
cohort check's orphan member-section rule moves to the cohort kind at the flip as `cohort.member-sections`
(`checkCohortDocument`, `lib/store/kinds/cohort/check.ts`), which refuses a hand edit whose `## Members` names a slug
that is not the current name of a member of the cohort, live or completed, through `reportOrphanCohortMemberSections`
(`lib/store/kinds/cohort/member-section-report.ts`); that function stays, with its unit test, when the hook's script
goes.

#### 2.3 The CI planning classifier and the review gate's planning routing

Everything that exists only to classify a change as planning-only by its tracked paths goes. From the flip every diff
holds a non-planning path, so the classifier answers `reviewed`, which grants nothing, and `main`'s ruleset requires
only `ci-ok`, not the lane attestation's `arc-lane` status. Known members:

- `isPlanningArtifactPath` and `classifyPlanningLane` (`lib/change-facts.ts`, whose rest survives); removing the first
  edits the surviving `isIntegrationTargetPath`;
- `scripts/classify-change.sh`'s `lane` and `planning-lane` commands, and `ci.yml`'s lane wiring; the script's other
  commands (`classify`, `tree-hash`, `decide`, `portability`, `integration`, `duplicate-push`) stay;
- `.github/workflows/arc-lane-attestation.yml` with what only it runs, among it the live-pair check
  `confirm-live-change-pair.sh` (`system/.internal/scripts/`, both copies) with its `init-recipe.json` entry, manifest
  entries, scripts README entry, and tests;
- `arc review planning-lane` (`handlers/review.ts`);
- the planning-grooming command (`scripts/review-gate/policy/planning-grooming-command.ts` and
  `scripts/review-gate/core/planning-grooming-command-schema.ts`), with its registrations and mentions, among them
  `handlers/review-request-schema.ts`, `scripts/review-gate/core/register-review-schemas.ts`,
  `review-command-envelope-registry.ts`, `review-command-mode.ts`, `runtime/project-identity-remedy.ts`,
  `command-input-infrastructure-policies.ts`, `cli.ts`, and `lib/cli-help-content.ts`;
- the planning lane's routing input (D11): `planning-grooming` leaves `SurfaceAuthoritySchema`
  (`scripts/review-gate/policy/routing-schema.ts`), and with it the auto-eligible arm of `reduceReviewRoutingBase`
  (`scripts/review-gate/policy/routing.ts`), the only producer of the `auto-eligible-planning` reason, and
  `LocalReviewRoutingInputSchema`'s refusal of a `planning-grooming` surface authority, whose remedy names the removed
  command. `auto-eligible-planning` stays in `CoreRoutingReasonSchema`, with its entry in
  `scripts/review-gate/policy/routing-reason-facts.ts`, as a reason stored review requirements carry;
- this repository's CODEOWNERS auto-merge block (`.github/CODEOWNERS`, "Auto-merge lane: per-WU / per-cohort planning
  artifacts (UNOWNED)"), which matches nothing once planning artifacts are untracked, with the file's header comment,
  which describes the auto-merge lane, rewritten to describe the ownership that remains.

The lane-attestation workflow goes in the same change as `arc review planning-lane`, with
`review-gate-workflows.test.ts`'s assertions on it. Among the references that remain,
`.arc/reference/strategies/project/strategy-review-projection.md` describes the attestation workflow's
`review-projection/` skip as live and lists its guard among the retirement steps, and `TECHNICAL-OVERVIEW.md`
§ 3 Infrastructure's merge-gating entry describes the `lane` output, the CODEOWNERS reviewed lane, and planning pull
requests auto-merging.

#### 2.4 The merge-gate recipe, whole (D10)

The recipe goes in both copies (the package's `arc/` and this repository's `.arc/`): its README and CODEOWNERS
template under `reference/templates/arc/merge-gate/` and `system/workflows/arc/supplemental/setup-merge-gate.md`, with
their `init-recipe.json` entries and whatever onboarding offer of the recipe the flip's rewrite leaves. With them goes
every installer, manifest, and test entry that names a recipe file, among them their entries in this repository's
`.arc/system/.internal/manifest.json`, which `arc health` reports missing once a file is gone, and
`review-gate-workflows.test.ts`'s assertions that the recipe ships. The references that remain go too, among them
§ Auto-Merge Lane's mentions of the recipe in `strategy-work-organization.md` and its link definition, the recipe's
entry in `reference/templates/arc/README.md`, the links in `draft-design.md`'s "Ship instead of pause" and in
`initial-setup/01_verify-and-configure.md` where the flip's rewrite leaves them, and the coupling audit's path entry
(`lib/coupling-audit/surface-classifier.ts`). The shipped recipe calls `arc review planning-lane` in a project's CI
classify job, so the command (§ 2.3) and the recipe go together, with D7's notice.

#### 2.5 The ROADMAP's remaining visible paths (D6)

The ROADMAP conflict remedy and every surface that installs or invokes it go in one change:

- `arc hook-remedy-roadmap-conflict` (`scripts/remedy-roadmap-conflict.ts`,
  `lib/status/roadmap-conflict-auto-remedy.ts`);
- `arc base merge --regenerate-roadmap`, with base merge's remedy application (`conflictRemedy` in `handlers/base.ts`,
  `scripts/base/merge.ts`, and `scripts/base/merge-composition.ts`), the remedy library's other importer;
- the pre-commit hook's remedy block in `CHECK[merge-conflict-markers]`, both copies;
- the merge driver that `arc init`, `arc join`, and `arc update` install (`ROADMAP_MERGE_DRIVER_COMMAND`,
  `lib/setup.ts`) with its attribute writer, and this repository's `.gitattributes` line
  `.arc/backlog/ROADMAP.md merge=arc-roadmap`;
- `arc status --project --staged` and its `--write`, which refuse on every input from the flip
  (`handlers/status/views.ts`);
- the hooks `README.md`'s remedy text, both copies.

The references that remain go with them, among them the regenerable-arm note in `integrate-work-unit.md`, the rerender
command in `strategy-concurrent-work.md`, and the markdown contract's ROADMAP remedy (`lib/markdown/contracts.ts`). The
dormant `reconcile-regenerable` next action and the `--regenerate-roadmap` argument its dormant arms still emit
(`scripts/integration/checkpoint.ts`, `scripts/integration/errand-merge.ts`) stay for the dormant machinery's removal.

#### 2.6 Shipped scripts

A check in a shipped script goes when, from the flip, it refuses on every input, acts on nothing, or passes
vacuously; the census (§ 2.11) finds any. None is known: the flip removes `verify-integrity.sh`'s ROADMAP presence
test, and the script's § 7 Meta-file shape stays (§ Non-Goals).

#### 2.7 The import

`arc store migrate --import` and the import transform (`lib/store/ref/import/`) go once the window has run, with the
two constants `lib/store/ref/migrate-layout-build.ts` imports from it, whose exclusion of the import's transient refs
goes with the transform, and the import transform's test files. The import serves this repository alone: other
projects install fresh, and the one other project on ARC, CineXplorer, is migrated by hand. A project still to migrate
would run the import from a pre-flip build, as the window does, since the import reads tracked records through the
in-repo store (`lib/store/ref/import/source.ts`), so removing it from later builds takes nothing from such a project.
The import keeps two capability-false arms live, `readRepositoryIdentity` (through `lib/store/ref/import/entry.ts`)
and `readRepositoryCandidateSupersessionChain` (through `import/review.ts`); they stay for the dormant machinery's
removal.

#### 2.8 The window's tooling

What the window's tooling change (`cutover-window-tooling`) lands on `main` ahead of the window goes after the window,
since nothing runs it again. That change is an expected contract, available once it has landed; its specification
sets the exact set, and the census (§ 2.11) takes it from the merged source. Its known members are the quiesce check
with its record and hold under `refs/arc-window/`, its recompute after the import, and its last read of `origin/main`'s
tip; the abort's restore; the worktree lock step; and Stage 1, the rehearsal of the window's mechanics on full copies
of the repository, with its copy driver, accounting case, and chain comparison. The chain comparison reads Candidate
chains through `readRepositoryCandidateSupersessionChain`'s in-repo arm, so it goes here, before the dormant
machinery's removal. The sealing guard's reach to `arc user load` (`runUserLoad`), which the window's tooling adds,
is not one-time: it refuses every load until the notes commands are deleted (§ Non-Goals), so it stays.

#### 2.9 The machine-local pattern for `.internal/` (D4)

`MACHINE_LOCAL_PATHS` (`lib/store/registry.ts`) narrows to the identity root's `.internal/`, dropping
`<identity>/*/.internal/**`. `malformedKeyProblem` (`lib/store/ref/path-admission.ts`) keeps refusing a personal key
that names a `.internal` folder, and its check widens from the key's first two segments to every segment, so
`scratch/a/.internal/x` is refused as `scratch/.internal/x` is. The import already keeps a personal path with
`.internal` at any depth off the store (`lib/store/ref/import/personal-disk.ts`). The refusal names the remedy: keep
private files outside the repository, since `.internal/` at the identity root is ARC's. The check also runs when a
stored key is read or decoded (`checkRefKey`, `storedKeyProblem`), so a personal record saved under a deeper
`.internal/` folder between the flip and this change would become unreadable, at its tip and in every comparison
over its history: the census at the flip's landing and this change's verification confirm that no personal ref holds
such a key, at its tip or in its history, and one found is a design question routed back to this specification. A
checkout still on a build from before this change can store such a key until it merges base; no ARC writer places a
`.internal` folder below the identity root's own, so that gap is accepted.

#### 2.10 The window's leftovers on disk and in refs (D5)

A step run by hand at this change's verification, with the repository's owner present and no shipped code, removes
the window's leftovers on each of the owner's clones that holds them. It runs only after the window has
imported the artifacts of the delivery work held at planning (`delivery-rebuild-continuity`), which the window reads
from that work's planning branch:

- the six local residue refs, as of 2026-11-10: `refs/arc/recovery/delivery-state/ea-terminal-841ddb632-rev54`,
  `refs/arc/bootstrap/delivery-native-stack-composition/pre-member7-adoption`, the three refs under
  `refs/arc/delivery-candidates/d2f24ab2-f5b2-4702-a545-3356082fa379/` (`companion-conservation`,
  `external-dependency-authoring`, and `refusal-contract-and-floor`), and `refs/arc/user/andrew/errands-remote`; the
  `delivery-candidates` namespace stays live in code (`residue-reaping.ts`, `git-materialization.ts`);
- any hold under `refs/arc-window/` the quiesce check leaves once the window completes;
- leftover machine-local `STATUS.USER.md` files, whose only remover in code is the user-surface migration the dormant
  machinery's removal deletes;
- the local `merge.arc-roadmap.*` configuration the merge driver's installer wrote, which `arc init`, `arc join`, and
  `arc update` write in any clone until this change removes the installer (§ 2.5). The configuration is the clone's,
  shared by all its worktrees, so an install or update run later from a worktree still on a build from before this
  change writes it again. That is accepted: the driver serves only `.arc/backlog/ROADMAP.md`
  (`ROADMAP_MERGE_ATTRIBUTE`), which the flip removes from the tree, so from the flip no merge reaches it. A project
  installed from a build between the flip and this change keeps the configuration and its attribute line for the same
  reason, and D7's notice names the driver's retirement.

#### 2.11 The census

The inventory is measured three times. Before the task list is generated, the census runs against the flip's
implementation while it is under way, at its branch head, and the task list is built from it. Once the flip has
landed, implementation begins by re-running the census against the flip as merged and amending the task list in
place: a new member a rule here covers joins that rule's tasks, and a member that has gone leaves them. On this
change's merged head it runs a last time, as a success criterion. The census walks every registered command path and
option, every hook check, every configuration key, every CI workflow step, every check in the shipped scripts, this
repository's CODEOWNERS and `.gitattributes` entries, every `init-recipe.json` entry, and what the window's tooling
landed (§ 2.8) against the flip's end state, and places each refusal-only, inert, or vacuous surface it finds under
§ 2's rules or in another change's share (§ Non-Goals). A member it finds that no rule here covers is a design
question, routed back to this specification. Its run at the flip's landing also confirms that no personal ref holds a
key with a `.internal` segment, at its tip or in its history (§ 2.9), and that `cohort.member-sections` refuses a hand
edit naming an orphan member section (§ 2.2); a finding otherwise is a design question routed back to this
specification.

### 3. Ordering within the change

- **The ROADMAP remedy lands as one change** (D6), since the hook's block falls back to
  `arc hook-remedy-roadmap-conflict` through `run_arc_cli` when the tree has no remedy script. The other hook checks
  removed here carry no such hazard: each runs inline, skips with a notice when its script is missing, or swallows
  the failure.
- **The lane-attestation workflow and `arc review planning-lane`** go together, with their test assertions.
- **The recipe and `arc review planning-lane`** go together (§ 2.4). Each recipe file leaves with its install-claim
  entry where one exists, and its remaining links leave in the same change, since CI's link audit (`lint:arc:links`)
  fails on a dangling one.
- **Removing `isPlanningArtifactPath` edits `isIntegrationTargetPath`** in the same change.
- **This change lands before the in-repo implementation's removal,** since `runStoreMigrate` (`lib/store/create.ts`)
  builds the import's source through `createStore`, and the import and the window's tooling reach the in-repo arms.
- **It builds after the flip lands** and needs no store-read move of its own first: the flip moves base drift onto
  the store and guards delivery's rename source.
- **It lands before the product-renames sweep starts,** which waits on it: the rename of ARC's user-visible terms
  (work unit to design unit, among others) across CLI verbs, output and help, file names, documentation, and shipped
  prose.

### 4. Settled decisions

Settled 2026-11-10 unless marked otherwise. D1 and D9, which placed and named the internal collapse, are recorded with
that change; D8, the stop rule for this specification's planning review, governs the review rather than the design.

- **D2. The boundary and this change's size.** `assess-boundary-fit` returned a cut-map: this change keeps what reads
  as live (§ 1), and the internal collapse is a separate change (Owner, 2026-11-10; split by hand at this
  specification's entry rather than at the flip's landing, since a hand split runs none of the unrehearsed
  decomposition procedure). This change stays one above the project's mark of about 10,000 changed lines by the
  Owner's explicit decision. Estimated on 2026-11-10 against `9c63a803ae`, it holds about 6,500–8,000 source lines,
  12,000–15,000 test lines from read-only census sweeps, and the merge-gate recipe's 384 shipped lines; the window's
  tooling, measured once landed (`2217aef746`), adds about 13,400 lines, about 5,700 of them source and 7,600 tests:
  about 32,000–37,000 changed lines in all, re-measured with the census (§ 2.11). Most of the excess is pure deletion
  of self-contained subsystems: the import transform with its tests, about 9,000 lines, and the window's tooling,
  about 13,400. It stays whole for the reason the Owner accepted for keeping the notes-sync and old-decomposition
  deletions whole: another branch and review would not shrink the subsystem a reviewer must check. Moving the import to
  the collapse would also leave `arc store migrate --import` visible until then. _ADR:_ `none`, temporary: the split
  holds until both changes land.
- **D3. `archive.cadence` stays.** `spec-seam-locus.md` A26 reads both arms, and the flip keeps integrate's dispatch.
  Retiring the key at the flip is rejected; only its in-repo-only readers go, with the dormant machinery. The store
  path's `wrong-cadence` refusal (`scripts/review-gate/readiness-store.ts`) stays. _ADR:_ `none`, tactical; its record
  is A26.
- **D4. The `.internal/` pattern** (§ 2.9). Agents keep private files outside the repository and `.internal/` at the
  identity root is ARC's, so nothing needs a private folder inside `scratch/`. On a public state remote, though, a
  file placed in a `.internal/` folder in `scratch/` expecting privacy would be published for good, at any depth: ARC
  treats `.internal/` as machine-local (the identity root's, and before the flip each workspace's), and the import
  keeps one off the store at any depth. Other dot-named folders carry no such meaning, and the store keeps them as
  scratch. So the key check fails closed at every segment. That is a documented exception to the storage contract's
  rule that anything goes in `scratch/` (`spec-storage-contract.md` D5), and the refusal names its remedy. _ADR:_
  `none`, tactical; it refines a rule recorded in a specification, not an ADR.
- **D5. The residue refs are local only.** `origin` holds only `refs/arc/user/andrew/errands`, which is live until the
  import deletes it there and locally, so the removal is the hand-run step of § 2.10, run on each of the owner's clones
  that holds them; no other project holds them. The held delivery work's spike branch,
  `spike/delivery-rebuild-continuity-model`, is not removed here; it goes when that work unit archives. _ADR:_ `none`,
  a one-time cleanup.
- **D6. The ROADMAP remedy lands as one change** (§ 2.5). The hook's block runs the remedy on every commit under
  `arc-in-git`, not only on a ROADMAP conflict, and falls back to the CLI command when the tree has no remedy script,
  so a hook left calling a CLI without the command would fail every commit. No live caller reaches that fallback: this
  repository's `.husky/pre-commit` runs each branch's own tracked hook, which finds the remedy script in the same tree;
  CineXplorer's legacy hooks (`.githooks/`) call neither the command nor `arc`; and no other project carries the
  shipped hook before the public release. The flag's case is the same: on `main` after the flip nothing produces a
  regenerable conflict, since each pre-flip branch takes ROADMAP's deletion when it merges. _ADR:_ `none`, a landing
  order.
- **D7. The notice.** An entry in the package changelog (`packages/arc-framework/changelog/versions.json`) names
  among its breaking changes the retired merge-gate recipe, the removed commands and options, the retired
  configuration keys, the retired ROADMAP merge driver, and the hook change, with no compatibility alias, per the
  pre-public-release posture. It is keyed by the version the package's `package.json` names when this change lands.
  `arc update` shows only entries keyed after a project's installed version, up to and including the version it moves
  to (`filterChangelogRange`), so the first release that ships this change re-keys the entry if it publishes a
  different version, a prerelease among them. _ADR:_ `none`, a release-note convention.
- **D10. The merge-gate recipe retires whole** (Owner, at the draft's design review). Its README, CODEOWNERS
  template, and `setup-merge-gate.md` serve only the planning auto-merge lane, which has nothing to classify once
  planning state is untracked, and nothing in ARC depends on what it installs. `arc merge lock` stays. _ADR:_ covered
  by ADR-035, under which the classifiers that exist only because state rides code history can be deleted; the
  recipe is the planning lane's, so retiring it carries the lane's retirement through rather than changing what
  ADR-021 decided. ADR-021's passages on its lighter merge gate and its recipe consequence are amended or superseded
  in the strategy and ADR rewrite.
- **D11. The planning lane's routing input leaves; its stored reason stays** (§ 2.3). `planning-grooming` exists only
  as the input a caller asserts for the planning lane, and no stored record carries it, so it leaves
  `SurfaceAuthoritySchema` in place, with no alias, under the pre-public-release posture; every schema that embeds
  the enum changes with it, among them `ReviewRoutingFactsSchema`. `auto-eligible-planning` is different: it is
  stored evidence. A project routing promotion (`applyProjectPromotion`, `scripts/review-gate/policy/routing.ts`) can
  lift the exempt planning decision to a `recommended` obligation while keeping its reasons, and a stored
  standard-review requirement (`ReviewRequirementV2Schema`, `scripts/review-gate/core/gate-contract-v2-schema.ts`)
  then carries the reason inside the content its `requirementId` digests. This repository holds one such requirement,
  the hosted review of pull request #932 (2026-10-13), in `.git/arc/review-gate/operations/`, which the import's review
  mapping indexes into the store (`lib/store/kinds/review/mapping-sources.ts`). Removing the value would leave that
  evidence unparseable, and content-addressed evidence cannot be regenerated, so the value stays in
  `CoreRoutingReasonSchema` with nothing left to emit it. _ADR:_ `none`, obvious from code once the lane is gone.

Every removal in § 2 is covered by ADR-035, whose decision moves state off the branch and leaves these surfaces
nothing to act on. The planning lane's note-level passages in ADR-021, ADR-029, and ADR-031 are superseded or amended
in the strategy and ADR rewrite.

## Alternatives & Rationale

- **The boundary** (D2):
    - _Split by what reads as live_ — chosen. The release gate for public visibility requires removing what a user,
      CI, the shipped recipe, or `--help` exposes; internal machinery can wait without misleading anyone.
    - _One change for the whole collapse, planned in segments_ — rejected. About 37,000–75,000 changed lines would land
      between the flip and the product-renames sweep, and no recorded reason holds it whole above the mark.
    - _Delete only what the compiler forces_ — rejected. It leaves dormant arms with no owner and the deletion shares
      of the storage-coupling register open.
- **Moving the import to the collapse** — rejected (D2): `arc store migrate --import` would stay visible and
  callable until the collapse lands.
- **A slim merge-gate recipe** keeping the `ci-ok` roll-up and review on every path — rejected (D10): that is general
  GitHub practice, not ARC's.
- **Retiring `archive.cadence`** — rejected (D3): A26 reads both arms and the flip keeps integrate's dispatch.
- **Dropping the key check with the pattern** (D4) — rejected: a public state remote would publish a file placed in
  `scratch/.internal/` for good.
- **Refusing only `scratch/.internal/`** (D4) — rejected: a deeper `.internal/` folder carries the same expectation of
  privacy, and the import already keeps one off the store.
- **Keeping `planning-grooming` as an unused input value** (D11) — rejected: it would let a caller assert a lane that
  no longer exists in every strict-current schema that embeds it, and no stored record needs it.
- **Removing `auto-eligible-planning` too** (D11) — rejected: stored review requirements carry it inside digested
  content, so removing it would break the evidence they record, and rewriting them would change their identities.
- **Removing the ROADMAP remedy in two steps**, the command after every branch's hook refreshes — rejected (D6): no
  live caller reaches the hook's fallback, so the staged order buys nothing.

## Cross-cutting Considerations

- **Compatibility and notice.** ARC is pre-public-release, so removed project-owned contracts change in place with no
  alias or migration reader. A shipped recipe change still carries D7's changelog entry. Projects that installed the
  merge-gate recipe run `arc review planning-lane` in their CI classify job; after this change that command is gone,
  so the notice names the recipe's retirement and the job to drop.
- **Hooks.** Projects refresh the shipped hook through `arc update`. This repository's `.husky/pre-commit` runs each
  branch's own tracked hook, so a branch cut before this change keeps its own hook and remedy script until it merges
  base (D6).
- **Security.** D4 widens the fail-closed key check at the publication boundary of a public state remote to every
  segment of a personal key. Removing the CODEOWNERS unowned block changes no merge requirement: `main`'s ruleset
  requires the `ci-ok` check and no code-owner review.
- **Testing.** Tests that exercise a removed surface go with it, among them `classify-change.test.ts`'s lane cases,
  `confirm-live-change-pair.test.ts`, the import transform's tests, and `review-gate-workflows.test.ts`'s lane and
  recipe assertions. Tests of surviving behavior that assert a removed surface's text or option change with it. The
  widened key check gains a case for a `.internal` folder below a personal key's second segment. The
  integration content tier runs before the push, since this change edits shipped ARC Markdown the integration tests
  read, and the link audit (`lint:arc:links`) must pass.
- **Rollout.** The change builds after the flip lands, and lands before the in-repo implementation's removal and the
  product-renames sweep (§ 3). The hand-run step of § 2.10 runs at verification.

## Success Criteria

On this change's merged head:

1. The census (§ 2.11), redone on the merged head, finds no surface of the classes it walks that refuses on every
   input, acts on nothing, or passes vacuously on a store-backed checkout, outside the shares § Non-Goals names.
2. The pre-commit hook, in both copies, carries no check whose input is a tracked ARC state path and no ROADMAP remedy
   block; the CLI registers no `arc review planning-lane`, `arc review planning-grooming`,
   `arc hook-remedy-roadmap-conflict`, `arc plan`, `arc housekeep`, or `arc park`, listed or hidden, and no
   `arc store migrate --import`; nothing of the window's tooling remains in source or the shipped scripts but the
   sealing guard's reach to `arc user load`; and these rules the removed checks carried survive in their homes: the
   task-list record kind's segmentation check (`task-list.segmentation`) still refuses a numeric third task segment,
   `cohort.member-sections` still refuses a hand edit whose `## Members` names a slug that is not the current name of
   a member of its cohort, and `lint:md:descriptors` still lints the task-list template.
3. `ci.yml` classifies no lane, `scripts/classify-change.sh` has no `lane` or `planning-lane` command,
   `lib/change-facts.ts` exports no planning classifier, `arc-lane-attestation.yml` is gone, and this repository's
   CODEOWNERS carries no auto-merge block and no description of one.
4. `init-recipe.json` installs no merge-gate file and no script only the lane attestation ran; nothing it installs
   names a removed command, option, check, or key; and the configuration schema has no
   `hooks.contributor_protected_paths` or `hooks.task_numbering`.
5. `SurfaceAuthoritySchema` has no `planning-grooming`, no routing path produces `auto-eligible-planning`, and every
   review record in this repository's store, the requirement for pull request #932 among them, parses under the
   changed schemas.
6. `MACHINE_LOCAL_PATHS` holds the identity root's `.internal/` and no `<identity>/*/.internal/**`, and a personal
   key with a `.internal` segment at any depth, `scratch/.internal/x` and `scratch/a/.internal/x` among them, is
   refused with the remedy named, and no personal ref holds such a key, at its tip or in its history.
7. The build, both type checks, the unit and integration tiers, and the link audit pass, and a search of the
   repository's tracked files outside `docs/` finds a removed command, option, key, exported symbol, or file path only
   in D7's changelog entry, in the point-in-time records § 1 exempts, in tests that assert a removed surface is
   absent, in the dormant code § Non-Goals keeps, and in the old decomposition machine.
8. The six residue refs, any `refs/arc-window/` hold, leftover `STATUS.USER.md` files, and the local
   `merge.arc-roadmap.*` configuration are gone from each of the owner's clones that held them when § 2.10's step has
   run.

## Open Questions

None in the design. The census (§ 2.11) sets the members of each rule in § 2, including the conditional ones: the
classifiers' shipped callers and the recipe's onboarding offer where the flip's rewrite leaves them (§ 2.1, § 2.4),
`runUserOpen` (§ 2.1), and the window's tooling (§ 2.8). Its run at the flip's landing confirms or amends them, and
confirms that no personal ref holds a key with a `.internal` segment (§ 2.9) and that `cohort.member-sections` refuses
a hand edit naming an orphan member section (§ 2.2).

## Amendments

[none]

---
