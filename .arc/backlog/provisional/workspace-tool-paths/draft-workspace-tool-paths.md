# Draft: Workspace-Aware Focused Tool Paths

- **Origin:** `USER-INBOX § Errand`, reclassified at the 2026-07-21 housekeep drain after repeated focused-test and
  lint retries across `cli-command-inputs` and `markdown-formatting`.
- **Purpose:** Make focused test and lint paths passed from repository-root scripts resolve predictably across the
  npm workspace boundary.

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
