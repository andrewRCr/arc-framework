# Draft: Workspace-Aware Focused Tool Paths

- **Origin:** `USER-INBOX § Errand`, reclassified at the 2026-07-21 housekeep drain after repeated focused-test and
  lint retries across `cli-command-inputs` and `markdown-formatting`.
- **Purpose:** Make focused test and lint paths passed from repository-root scripts resolve predictably across the
  npm workspace boundary.

---

## Inbound Buffer — Pending Integration

> _Routed-in concerns pending holistic integration into the body at this WU's next planning iteration_
> _(`drain-inbox § 5`); each carries its origin. Integrate — or consciously reject — at iteration._

### `[ ]` **Make targeted Markdown lint invocations stay targeted**

- _Routed from:_ `USER-INBOX § Errand`, housekeep drain (2026-07-23); captured during
  `solution-proportionality` task generation.
- _Concern:_ `npx markdownlint-cli2 <file>` still applies the repository configuration's broad glob and linted
  633 files; the literal one-file form requires the non-obvious `--no-globs :<file>` shape.
- _Fold-in:_ include Markdown in the focused-tool path contract. Provide a repository-root command whose explicit
  paths stay literal while the full-suite command retains broad coverage.

### `[ ]` **Make targeted unit-test paths unambiguous from the repository root**

- _Routed from:_ `USER-INBOX § Errand`, housekeep drain (2026-07-23); captured during
  `review-gate-right-sizing` Task 1.1.
- _Concern:_ `npm run test:unit -- packages/arc-framework/__tests__/...` forwards the repository-relative operand
  unchanged into the package workspace, where Vitest reports no matches until the caller retries with
  `__tests__/...`.
- _Fold-in:_ normalize repository-relative targets at the root boundary or expose a focused-test verb whose
  operands are consistently repository-relative; align scripts, tests, and developer guidance.

---

## Problem / Motivation

Root npm scripts delegate to `packages/arc-framework`, but focused Vitest and ESLint paths written relative to the
repository root are forwarded unchanged and interpreted from the workspace directory. Valid-looking commands then
report no matching tests or files, despite project guidance that commands run from the repository root.

## Candidate Direction

Normalize focused paths at the root delegation boundary or provide dedicated root-level helpers with an explicit
path contract. Cover both repository-relative and workspace-relative invocation shapes and align developer guidance
with the chosen behavior.

The mechanism choice remains open because changing generic argument forwarding has a different compatibility
surface from adding explicit focused-tool helpers. The work also shares both package manifests with active CLI and
Markdown work units, so sequence after those edits settle.

## Scope Estimate

Small–Medium developer-tooling change across root/workspace scripts, focused tests, and guidance. Provisional until
the compatibility boundary is chosen.

---
