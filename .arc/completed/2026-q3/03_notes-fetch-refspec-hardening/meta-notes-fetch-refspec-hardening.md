# Metadata: notes-fetch-refspec-hardening

| **State** | **Owner** | **Branch** | **Class** | **Priority** |
| --------- | --------- | ---------- | --------- | ------------ |
| `Shipped` | `andrew`  | [none]     | `Light`   | `P3`         |

- **Cohort:** [none]
- **Depends On:** [none]

- **Origin:** [internal]
- **Design:** `spec-notes-fetch-refspec-hardening.md`
- **Task List:** `tasks-notes-fetch-refspec-hardening.md`

- **Current Workflow:** [none]
- **Last Completed:** Task 2.1 — Complete verification
- **Next Task:** [none]
- **Blockers:** [none]

- **Next Action:** [none]

- **PR URL:** <https://github.com/andrewRCr/arc-framework/pull/203>
- **Completed:** 2026-07-06

---

## Release Notes Entry

ARC user-state sync no longer installs a force-wildcard git-notes fetch refspec, so ordinary `git fetch`, `git
pull`, and `git fetch --prune origin` operations cannot overwrite unpushed local user notes. User notes continue
to move through explicit `arc user` fetch, pull, push, and sync commands.

### Changed

- User-notes propagation is explicit-only through `arc user` commands; plain git fetches no longer import ARC user
  notes as a side effect.
- Internal notes-ref comparison and reconcile temp fetches now ignore configured fetch refspecs.

### Removed

- `arc init` and `arc join` no longer add `+refs/notes/arc/user/*:refs/notes/arc/user/*` to
  `remote.origin.fetch`.
- The pushability auto-fix for a missing notes fetch wildcard is gone.

### Fixed

- Unpushed local `arc user save` results survive ordinary `git fetch`, `git pull`, and
  `git fetch --prune origin`.

## Completion Notes

notes-fetch-refspec-hardening shipped the explicit-only user-notes propagation path chosen in the spec. The
installed force-wildcard `remote.origin.fetch` refspec was the root cause: any fetch that downloaded
`refs/notes/arc/user/<id>` could force-reset or prune the local canonical notes ref, deleting an unpushed
`arc user save` before it could be pushed. The fix removes both install sites: setup no longer calls
`configureNotesRefspec`, and pushability no longer detects or auto-fixes `missing-notes-refspec`.

The orphaned helper and barrel export were deleted, the vestigial multi-clone harness install was removed, and
the three notes-ref temp fetches that still need remote comparison now pass `--refmap=`. That leaves
`runUserFetch` / `runUserPull` as the canonical explicit propagation path while shielding status comparison,
non-fast-forward notes reconciliation, and branch-bounded notes export from any stale wildcard that remains in an
older clone.

The local clone cleanup also landed: this repository's `remote.origin.fetch` now contains only the branch refspec.
No shipped migration or auto-unset path was added; already-configured pre-beta clones remain a one-time manual
cleanup case, matching the work unit's scope boundary.

Verification covered the full local Tier 3 gate set: markdown lint, shell lint, source and test typecheck,
TypeScript lint, build, and the full Vitest suite all passed. The success criteria were all met, the optional
fresh adversarial verification pass returned no spec-conformance findings, local pre-PR diff review found no
issues, CodeRabbit CLI review returned zero findings, and PR #203 is mergeable with CI green.
