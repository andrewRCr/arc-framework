# Notes: worktree-default-start

## Implementation anchors

Concrete code locations the buildables touch (all paths under `packages/arc-framework/src/`):

- **`spawnWorktree` primitive** — `lib/git/worktree-scaffold.ts` (wraps `git worktree add -b`). The create-new
  `arc start` handler branch is its CLI caller.
- **`arc start` handler** — `handlers/start.ts`. Hosts the create-new dispatch branch (bare `arc start <name>`)
  beside the `--here` cold-start path (use-existing worktree, `createdByArc: false`).
- **Location templating** — `lib/git/worktree-location.ts` (resolves the worktree path from config).
- **Full-protection scaffold guard** — already ships; the spawn path composes with it.
- **`classComposition()` tally** — `lib/status/class-composition.ts`. Feeds the plate-balance advisory line; the
  in-flight oracle data it reads is already gathered at session-init.

## Steering-surface integration points

- The worktree-or-not default mirrors the `run-errand` Launch relocation logic (branch-protection × spawn
  availability) — reuse that decision shape rather than re-deriving it.
- `init-work-unit` already documents both modes (in-place / worktree-creating) but leaves them caller-selected
  with no default; the worktree-creating mode delegates to exactly the spawn entry being wired.
- Cohort-doc discovery: a conditional `cohort-*.md` read in session-init's context-load, fired when the active
  meta carries a `Cohort` value, plus the `AGENT-BRIEF.ARC` awareness note.

## Default-flip authoring locus — caller map

The protection × spawn-availability default lives in `init-work-unit`'s Execution Modes (the WU-creation
mechanism), not a single dispatch site, so every WU-creating caller inherits it by not forcing in-place:

- **WU-creating callers that inherit:** `decompose-work-unit` (mints multiple sibling WUs — the prime
  concurrency case for worktree-default), `graduate-work-unit`, session-init next-work dispatch.
- **`run-errand` is not a caller of this default.** It owns its own errand-locus relocation (protection ×
  spawn-availability via `resolveWriteContext`) — the *shape* this WU mirrors — and reaches `init-work-unit`
  only on the errand→WU *promotion* path (already on a branch; no fresh spawn).
- **Forward-compat (`composable-workflows`):** centralizing the invariant default in the mechanism workflow and
  inheriting it per caller is the resolve-then-load / thin-orchestration direction; re-authoring the policy per
  dispatch site is the duplication that draft cautions against.
- The `--here` cold-start path stays the explicit in-place override.

## Steering surfaces resolve probe-side

Both session-init surfaces compute in the `arc status --session-init` probe and are read by the workflow:

- **Plate-balance (`1.3`):** wire the currently-uncalled `classComposition()` (`lib/status/class-composition.ts`)
  over the probe's in-flight slice; emit the `Novel` / `Heavy` / `Light` tally on the envelope. The workflow
  renders one conditional advisory line when a `Heavy` / `Novel` stream is in flight — awareness-only.
- **Cohort-doc (`1.4`):** the probe already parses the active meta + `Cohort` field; resolve the backing
  `cohort-<leaf>.md` path from that value and emit it. Cohort docs are **not** co-located with the active WU —
  they live under `backlog/` / `completed/` subdirs (e.g. this WU's `cohort-concurrent-work-conventions.md` at
  `.arc/backlog/planned/agile-parallelism/concurrent-work-conventions/`) — so resolution is a path lookup, not
  a co-located read. Degrade cleanly (no path, no error) when no backing doc is found.

## Two-copy (package-project sync) file map

CLI code under `packages/arc-framework/src/**` is single-copy (package is authoritative). The Framework
markdown edits each land in both copies — package source `packages/arc-framework/arc/**` + `.arc/` instance:

- `system/workflows/arc/work-unit-lifecycle/planning/init-work-unit.md` (`1.2`)
- `system/workflows/arc/session-lifecycle/session-init.md` (`1.3.b`, `1.4.b`)
- `reference/briefs/AGENT-BRIEF.ARC.md` (`1.4.b`)

## Downstream ownership (not this WU)

- Retirement-side orphaned-subdir reconcile (`arc user open`/`close` proactive cleanup) — `cross-machine-coherence`
  / `cross-machine-sync-coherence`.
- The `arc user open` non-interactive prompt-hang fix — `cli-substrate-adoption`.
- End-to-end worktree-default verification across concurrent WUs — `finalize-parallelism`.
