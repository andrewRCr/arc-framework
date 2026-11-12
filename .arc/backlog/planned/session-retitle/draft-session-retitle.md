# Draft: session-retitle — stage-keyed conversation titles at session-init + set-stage

- **Origin:** [internal] — re-triaged errand → planned stub at the 2026-07-18 housekeep drain (the fire-point,
  config-default, and package-sync surface crosses the derivation floor); captured during `session-locus-model`
  draft-design grooming (stage-signal discussion), 2026-07-18.
- **Purpose:** Automate the proven-manual practice of renaming harness conversations to the WU's current lifecycle
  stage — an inactive-by-default, opt-in extension with two fire points, so external session tooling that keys off
  titles tracks parallel WUs without hand-renaming.

---

## Inbound Buffer — Pending Integration

> _Routed-in concerns pending integration at this work unit's next planning iteration. Integrate — or_
> _consciously reject — each one._

### `[ ]` **Re-scope conversation retitling after extension retirement**

- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: session-retitle`), housekeep drain (2026-10-15).

- _Shapes:_ § Proposed shape; two-fire-point extension design.

- _Observation:_ The proposed opt-in extension depends on post-context-load, a new post-set-stage marker,
  point-scanner validation, and active/.actions storage; retirement removes that substrate.

- _Approach:_ Keep the retitling need, but settle its execution route against supported CLI events or harness
  capabilities before planning implementation. Do not restore extension files or workflow markers.

- _Captured during:_ `retire-extension-points` draft close, 2026-10-13.

### `[ ]` **Report stage labels to the multiplexer as display metadata instead of renaming sessions**

- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: session-retitle`), housekeep drain (2026-10-15).

- _Shapes:_ § Proposed shape — the fire points, the title mechanism, and the default title.

- _Observation:_ The draft's mechanism no longer exists: `retire-extension-points` shipped and removed the extension
  mechanism its two fire points hang on. Renaming has also gained a cost — a harness session's name is now its
  cross-session messaging address (Claude `SendMessage` by name; `codex queue --thread <name>`), so retitling per
  stage moves the address mid-flight. Herdr decouples the two: `herdr pane report-metadata --source arc` sets
  display-only title, state labels, and up to 16 `$name` tokens (TTL at most 24 h), and its sidebar rows render custom
  tokens (`[ui.sidebar.agents] rows`, workspace tokens for space rows; see `herdr --default-config`). The label then
  derives from ARC while the session name stays a stable address.

- _Label semantics (Owner, 2026-10-14):_ `<stage>.<short>` — stage first for sidebar scanning, the short name for use
  outside the sidebar, in conversation and messages. Stage means current or just finished, never next: while the
  session works, show the current stage; while it idles and the next stage has no progress, show the previous stage
  done (`generate-tasks✓.SL` for a WU whose tasks were just finalized, where the derived frame reads
  `process-task-loop`). Combining the multiplexer's idle / working status with the frame's stage and progress yields
  this; neither source does alone. `status-hud`'s per-worktree card wants the same rule.

- _Vocabulary:_ the Owner's practical lifecycle — draft-design, create-spec, generate-tasks, implementation,
  verification, integration (with substages: prepublication, code review, …) — until `wu-lifecycle-state-model`
  supplies the projected vocabulary; verification needs its own projection there (paired capture).

- _Short names:_ hand-maintained today and collision-prone — on 2026-10-14 `seam-locus` and `seam-lifecycle` both read
  `.SL` after an update dropped the `SLC` disambiguation. Consume `naming-conventions`' short-name field (its inbound
  entry: minted at `arc stub` with a collision guard); a personal map serves until it lands.

- _Approach:_ a per-turn harness hook (Claude `Stop`, the Codex equivalent) or a Herdr plugin runs the read-only join
  (`npx arc locus --json` × `herdr agent list`) and reports tokens. Matching by cwd is exact for one session per
  worktree; a session on the primary running an Errand elsewhere needs `recovery-hardening`'s session-to-checkout
  binding. Shares that join with the `agent-session-bridge` capture; the two may merge at grooming.

- _Captured during:_ read-only exploration session on cross-harness agent messaging, 2026-10-14.

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
