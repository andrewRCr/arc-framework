# Draft: Adopter Install Authority

- **State:** Provisional — captured for deliberate design before commitment.
- **Origin:** [internal] — corpus review found shipped ARC files absent from the installation recipe with no failing
  check.
- **Purpose:** Replace or guard the hand-maintained adopter install inventory so every shipped file has an explicit,
  mechanically verified installation disposition.

---

## Inbound Buffer — Pending Integration

> _Routed-in concerns pending holistic integration into the body at this WU's next planning iteration_
> _(`drain-inbox § 5`); each carries its origin. Integrate — or consciously reject — at iteration._

### `[ ]` **Give every shipped-but-uninstalled file a recipe disposition**

- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-09-16).

- `WU_Target: TBD`

- _Observation:_ the install set is a hand-maintained list, and roughly a dozen workflow and method files sit in
  the package source without a recipe disposition, so they reach no project. The failure is silent in both
  directions: a file can be present in both copies, listed in an index, referenced by installed content, and
  still install nowhere, because every check that would notice runs against a project instance where the file is
  present.

- _Scope:_ the population, not the first instance. The testing-standards method was one case — three installed
  surfaces declared or linked it while nothing installed it — and it is owned by `plan-segmentation`, which
  installs it as a configurable file. This entry is the remaining set and the general defect behind it.

- _Approach:_ derive the install set rather than hand-listing it, or land a check that fails when installed
  content references a path carrying no recipe disposition. A dangling reference from installed content is the
  sharpest available signal and is mechanically detectable.

- _Captured during:_ `plan-segmentation` task generation — grounding the fire-point split against its actual ship
  surface, 2026-09-07.

### `[ ]` **Derive the shipped-file list so the recipe cannot omit a shippable file**

- _Routed from:_ `self-hosting-manifest-freshness`'s inbound buffer, 2026-10-23, split from "Backstop shipped-file
  inventory drift (recipe / manifest omissions)" (housekeep drain, 2026-06-08; captured at
  `scalable-authoring-pipeline` PR #67 review cycle). Its self-host manifest half stays there.

- _Shapes:_ § Design Direction (derive the install set, or a fail-closed coverage check); § Scope, detecting package
  files with no installation disposition.

- _Concern:_ PR #67 found new package-source authoring surfaces (`draft-design`, planning-depth methods,
  `spec-review`, `pre-spec-finalization-review`) missing from `init-recipe.json`, so fresh installs shipped broken
  references. The recurrence guard proposed there compares package-source shippable files with `init-recipe.json`,
  with an explicit allowlist for intentionally unshipped files. The stronger fix it weighed derives the shipped-file
  list by glob over package source, with an explicit unship allowlist, so the recipe cannot drift at all.

### `[ ]` **Design inputs: established packaging idiom, cutover compatibility, and the install rehearsal's evidence**

- _Routed from:_ Owner direction, 2026-10-23, at the triage of install rehearsal run `2026-10-23T083226`.

- _Shapes:_ § Design Direction; § Constraints.

- _Prior art first:_ follow established packaging idiom wherever one fits, and record any divergence with its reason.
  Candidates to verify before choosing:
    - fail-closed coverage: rpmbuild's "Installed (but unpackaged) file(s) found" stop, and debhelper's
      `dh_missing --fail-missing`;
    - inclusion by glob with explicit excludes: npm's `files` with `npm pack --dry-run`, Cargo's `include` and
      `exclude` with `cargo package --list`, and Python's `check-manifest`;
    - conditional files: Copier's skipping of file names that render empty, and its `_exclude` patterns;
    - install, then update with a three-way merge: `copier update`, and cruft for cookiecutter;
    - testing the installed result rather than the source: site generators that fail a build on broken output links,
      and pack-and-install smoke tests.

- _Cutover compatibility:_ the framework core this inventories is not storage state, and no storage-coupling register
  row covers it. `storage-cutover`'s flip edits the same `init-recipe.json`, `lib/classification.ts`, and
  `manifest.json` entries to stop installing into the projected roots (`active/`, `backlog/`, `completed/`): the
  ROADMAP and ATOMIC-INBOX templates and `completed/README.md`. Model "never install into a projected root" as a
  disposition rule that change can switch on, or leave those entries as they are, and route the result to
  `storage-cutover` at draft close.

- _Forward compatibility:_ `framework-core-from-package`, which runs after the cutover, materializes the framework
  core from the pinned package, so the dispositions this work unit derives become the set it materializes.

- _Evidence (rehearsal run `2026-10-23T083226`):_ a fresh install's first commit failed the link check on 28 links to
  10 files the package ships but the recipe never installs. `strategy-team-coordination.md` installs only in team
  mode, while unconditionally installed strategies and `session-init` and `session-handoff` link to it. The internal
  skill copies omit `arc-errand`, `arc-housekeep`, and `arc-inbox`, which `.claude/skills/` installs.

- _Related:_ `package-project-development-sync` holds "Give the renderer a path for a project copy that must precede
  its recipe entry"; a derived install set would remove the refusal that entry describes.

---

## Problem

`init-recipe.json` is the effective authority for what reaches an installed project, but its file inventory is
hand-maintained independently of the package tree. A file can exist in `packages/arc-framework/arc/`, remain
byte-identical to the self-hosting copy, appear in an index, and still reach no project. The generated manifest then
repeats the omission, making the drift self-consistent instead of detectable.

The observed gap included workflow and method files such as `drain-inbox.md`, `setup-release-wrapper.md`, lifecycle
transition workflows, `in-flight-scope-check.md`, `assess-parallel-fit.md`, `branch-format.md`, and
`testing-standards.md`. The exact inventory must be re-derived at implementation time; the recorded count is evidence
of the failure mode, not a durable expected total.

`CANONICAL_SKILLS` is a second hand-maintained list on the same authority seam and should be evaluated with the recipe
rather than allowed to drift through a parallel mechanism.

## Design Direction

Prefer deriving the install set from package contents plus explicit conditional-install rules. If full derivation is
not yet coherent, add a fail-closed coverage check requiring every shipped file to declare one recipe disposition.
The check must distinguish intentionally empty or conditional surfaces from accidental omissions and must prove the
fresh-install result, not merely source-tree parity.

## Scope

- Establish the authoritative source for unconditional, PM-mode, team-mode, and intentionally excluded files.
- Detect package files with no installation disposition and recipe entries with no package source.
- Cover fresh install, update, manifest generation, and self-hosting/package projection boundaries.
- Evaluate whether skill generation belongs to the same derived inventory or needs a separately verified authority.

## Constraints

- `init-recipe.json` remains the current shipping authority until a replacement lands.
- Presence in the package tree alone is not evidence that a file should install unconditionally.
- Project-specific and scaffolded/configurable surfaces must retain their existing ownership and merge semantics.
- Do not solve self-hosting manifest freshness here; this concern is the adopter-facing installation half.
