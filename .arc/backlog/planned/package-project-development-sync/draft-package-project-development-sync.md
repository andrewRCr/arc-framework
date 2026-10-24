# Draft: Package-Project Development Sync

- **Origin:** `USER-INBOX § Errand`, housekeep drain (2026-08-20).
- **Purpose:** Make ARC's package-source to self-hosted-project projection a first-class development operation.

---

## Inbound Buffer — Pending Integration

> _Routed-in concerns pending holistic integration into the body at this WU's next planning iteration_
> _(`drain-inbox § 5`); each carries its origin. Integrate — or consciously reject — at iteration._

### `[ ]` **Give the renderer a path for a project copy that must precede its recipe entry**

- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-09-16).

- `WU_Target: TBD`

- _Observation:_ the pre-commit link check resolves reference definitions per copy, so a new Framework file's
  project copy must exist in the same commit as the first installed content that links to it — routinely several
  phases before its recipe entry lands. `render:framework` refuses exactly that case
  (`markdown.projection-refused: Framework projection requires an explicitly installed Framework source`), so the
  canonical package-to-project projection has no path for the one situation the link rule forces. The fallback is
  a hand `cp` plus a `diff -q` parity check, with nothing enforcing that the copy stays in step until the sync
  test picks it up at registration.

- _Approach:_ decide whether projection should admit an unregistered source under an explicit pre-registration
  mode, or whether deriving the install set removes the category entirely. The refusal is deliberate policy — a
  projected copy nothing installs is the failure the neighbouring entry describes — so this is a fork worth
  settling rather than a flag to add.

- _Scope:_ renderer projection policy and its interaction with the per-copy link rule. Closely related to
  `Give every shipped-but-uninstalled file a recipe disposition`, which covers the silent-drift direction; these
  may well merge at drain, since deriving the install set would answer both.

- _Captured during:_ `plan-amendment` Phase 3 close — the workflow's project copy at Task 3.1, after the same
  friction at Task 2.1, 2026-09-11.

### `[ ]` **Re-check the renderer's pre-registration refusal once glob claims replace the hand-listed recipe**

- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-10-24).

- _Shapes:_ its inbound entry "Give the renderer a path for a project copy that must precede its recipe entry".

- _Observation:_ `adopter-install-authority` replaces the hand-listed recipe with glob claims that carry each file's
  class (`draft-adopter-install-authority.md` D1). A new file under a claimed path is a member the moment it exists, so
  its `.arc/` copy and its self-hosting manifest entry must land in the same change. The self-hosting Markdown authority
  admits a claimed source with no copy only for `render:framework`, which writes a Framework Markdown copy; every other
  class or file type (a Configurable method, a script) keeps a hand-placed copy, and the `framework-sync.test.ts`
  contract check prints the missing manifest entry. So `render:framework`'s refusal of an unregistered Framework source
  (`markdown.projection-refused`) should stop meeting the case the per-copy link rule forces for Framework Markdown, and
  a file outside every claimed glob still needs its claim first, in the same commit.

- _Approach:_ once that unit lands, re-check the entry: dismiss or narrow it for Framework Markdown, and take a new file
  of any class, manifest entry included, as a case the projection core should cover.

- _Captured during:_ `adopter-install-authority` draft-design close, 2026-10-23.

---

## Problem / Motivation

Framework development currently synchronizes authoritative `packages/arc-framework/arc/**` changes into the
self-hosted `.arc/**` installation through paired edits. The local updater already proves the useful projection
core: rendering, recipe classification, Configurable three-way merges, override preservation, manifest refresh,
and pristine-byte refresh. Plain update is too broad because it also regenerates harness skills, rewrites managed
Git surfaces, refreshes installation wiring, and runs unrelated migrations.

Live prepublication work also showed that the current render command cannot project mixed Framework and
Configurable changes as one supported operation.

## Direction

- Add a development-only projection verb or explicit mode, provisionally `arc dev sync`, with preview/check and
  write modes.
- Reuse updater change planning, rendering, classification, three-way merge, executable-mode, manifest, and
  pristine-store machinery.
- Exclude harness-skill generation, `.gitignore` mutation, Git configuration and attributes, and unrelated
  installation migrations.
- Report the exact projected paths, conflicts, retained Configurable files, and manifest/pristine changes.
- Make check mode fail on package/project drift without writing.
- Settle command naming, source-repository detection, uncommitted package-source visibility, atomicity, and the
  relationship to plain `arc update` before implementation.
- Once proven, make the operation authoritative in the project rules and package-project sync strategy, with
  integration coverage for Framework, Configurable, template, manifest, pristine, exclusion, and check behavior.

---
