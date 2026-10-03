# Draft: Artifact Editor Handoff

- **Origin:** [internal] — minted at the 2026-09-30 housekeep drain from a `USER-INBOX` capture, "Let `arc view` open
  an artifact in the person's editor", made during storage-program discussion in the `delivery-rebuild-continuity`
  worktree (2026-09-24). Re-triaged from an Errand: the editor mode crosses the design floor despite its small CLI
  surface.
- **Purpose:** Bridge ARC's semantic artifact resolution into a person's editor, so opening an ARC artifact for
  reading or editing does not require knowing where ARC keeps it.
- **Planning posture:** `P3`; `Class` settles at planning.

---

## Problem / Motivation

`arc view` renders through glow or bat into a pager, which reads long documents poorly: no outline, no jump to a
heading, no search-and-return. `arc view <kind> --path` (PR #741) prints the resolved absolute path, so
`zed $(arc view inbox --path)` already opens the right file without knowing where ARC keeps it. An editor mode —
resolving the editor as Git does, `$VISUAL` before `$EDITOR` — would do that in one step.

The editor-ergonomics spike is complete (`spike-editor-ergonomics.md`, storage-program runway step 6, personal). It
assigns path and editor handoff the role of bridging ARC's semantic artifact resolution into a person's editor;
direct editor access remains the requirement, while `arc view` and `status-hud` keep their separate roles.

## Open design

- Editor selection and invocation, including `--no-input` behavior.
- What `tasks --current` means for a handoff — `--path --current` is refused today.
- The future projected path contract: after the storage cutover the working copy is a projection, so the handoff
  must name the projected path the editor should open.

## Boundaries

Distinct from `status-hud`'s status projections and from `arc-view-completed-targets`' archive lookup.

## Files

`packages/arc-framework/src/cli.ts`, `src/handlers/view.ts`, `src/commands/view/run.ts`, `src/lib/view/types.ts`;
current-task navigation also touches `src/lib/view/format.ts`.
