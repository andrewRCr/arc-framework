# Draft: session-retitle — stage-keyed conversation titles at session-init + set-stage

- **Origin:** [internal] — re-triaged errand → planned stub at the 2026-07-18 housekeep drain (the fire-point,
  config-default, and package-sync surface crosses the derivation floor); captured during `session-locus-model`
  draft-design grooming (stage-signal discussion), 2026-07-18.
- **Purpose:** Automate the proven-manual practice of renaming harness conversations to the WU's current lifecycle
  stage — an inactive-by-default, opt-in extension with two fire points, so external session tooling that keys off
  titles tracks parallel WUs without hand-renaming.

---

## Problem / Motivation

Manually renaming harness conversations to the WU's current lifecycle stage (via the CC / Codex rename commands)
has proven load-bearing for tracking parallel WUs — external session tooling keys off conversation titles. Nothing
automates it today; an ARC extension can, inactive by default and opt-in for exactly this use case.

## Proposed shape

One extension, two fire points:

- session-init's existing `post-context-load` — set the title on every boot; a fresh conversation starts untitled
  even when the stage hasn't moved.
- a new post-set-stage fire point at the ceremony sites — update the title on in-session stage transitions.

Action phrased harness-capability-conditional: rename programmatically where the harness supports it, otherwise
surface the suggested title for the user to apply. Default title = the stage value alone — worktree naming already
carries the WU name, and 1-WU-per-worktree means stage-only titles don't collide — with a configurable template as
a candidate for setups where that doesn't hold. Keys off `Current Workflow` today; upgrades for free when
`wu-lifecycle-state-model` re-vocabularies stages (its stage-signal inbound-buffer entry is the paired capture).

## Unknowns and Assumptions

- **Claude Code mechanics:** the Agent SDK `renameSession(sessionId, title)` / `rename_session()` is the
  documented agent-invocable path (user-typed `/rename` is not); the wrinkle is in-session session-ID discovery
  (hooks receive it — confirm the in-session recovery route).
- **Codex mechanics:** a rename command exists user-side; find the programmatic equivalent or confirm the
  degrade-to-suggest path.

## Scope Estimate

Small (hours-days), but the surface is infra-flavored: shipped workflow files (fire-point markers,
point-scanner-validated) + extension file + config default + package sync — reviewed-lane, two-copy discipline.

Dependencies: none hard. Coordinate with `wu-lifecycle-state-model` (stage vocabulary) and `session-locus-model`
(stage homes in the meta, never in machine-local locus state).
