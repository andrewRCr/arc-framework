# Draft: Package-Project Development Sync

- **Origin:** `USER-INBOX § Errand`, housekeep drain (2026-08-20).
- **Purpose:** Make ARC's package-source to self-hosted-project projection a first-class development operation.

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
