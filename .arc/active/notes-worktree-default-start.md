# Notes: worktree-default-start

## Implementation anchors

Concrete code locations the buildables touch (all paths under `packages/arc-framework/src/`):

- **`spawnWorktree` primitive** — `lib/git/worktree-scaffold.ts` (wraps `git worktree add -b`). Ships with no
  CLI caller; the create-new `arc start` handler branch is the first caller.
- **`arc start` handler** — `handlers/start.ts`. Currently rejects bare `arc start <name>` (non-`--here`)
  outright with a pointer to `--here`; the module doc still carries the moot `--tier` flag reference to drop.
  The `--here` cold-start path (use-existing worktree, `createdByArc: false`) already ships.
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

## Downstream ownership (not this WU)

- Retirement-side orphaned-subdir reconcile (`arc user open`/`close` proactive cleanup) — `cross-machine-coherence`
  / `cross-machine-sync-coherence`.
- The `arc user open` non-interactive prompt-hang fix — `cli-substrate-adoption`.
- End-to-end worktree-default verification across concurrent WUs — `finalize-parallelism`.
