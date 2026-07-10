# Notes: notes-export-state-coherence

Reference material for task generation and execution, migrated from the retired draft.

## File-by-file change mapping

- `packages/arc-framework/src/lib/user-sync/branch-bounded-notes-export.ts` — A: join at the
  `supersedesLocal === false` arm of `adoptPushedTipIntoLocalRef`, with the no-op guard and the
  compaction-boundary pruned-pair exclusion.
- `packages/arc-framework/src/lib/user-sync/note-set-relation.ts` — B: new standalone pure classifier
  (five relations; manifest + pruned-pair exclusions applied to the entry sets it receives).
- `packages/arc-framework/src/commands/user/sync-status.ts` — B: diverged-arm inspection reads both trees,
  spine mapping, `deriveRemoteStatus` / headline / cause threading, render text.
- `packages/arc-framework/src/handlers/user-sync.ts` — guidance fix: `handleConflict` select drops the
  impossible pull option; `decideSyncAction` reads the relation.
- `packages/arc-framework/src/lib/session-init/recommended-action.ts` — guidance fix (`always` degrades to
  surface on `conflict`) + clean-arm informational surface for `remote-subset`.
- `packages/arc-framework/src/commands/user/push-fetch.ts` — refusal-message truthfulness.
- `.arc/reference/strategies/project/strategy-user-notes-concurrency.md` — CAS-Guarded invariant sentence
  covers the ancestry-resolvable join.
- `.arc/system/workflows/arc/session-lifecycle/session-init.md` + package mirror — clean-arm collapse note
  gains the `remote-subset` case; zero-contested guidance wording.
- Integration / session-init / user-sync tests alongside.

## Implementation notes

- **Listing fallback:** if `git ls-tree -r <sha>` with notes-fanout path flattening proves awkward anywhere,
  the alternative is fetching the remote notes ref to a `refs/notes/`-prefixed temp ref so `git notes list`
  DWIM-resolves correctly. The chosen mechanism must be exercised by the end-to-end mislisting regression
  either way — the temp ref at `refs/arc-sync-temp/…` lists empty under `git notes --ref` (verified live).
- **Live mixed-uncontested fixture material:** the 2026-07-09 observed topology (609 remote-only / 31
  local-only / 0 contested; remote carrying a ~10,800-commit bulk history from burn-in scratch clones) is a
  realistic shape for the end-to-end mixed-uncontested regression — including the fixed-path compaction
  manifest present on one side only.
