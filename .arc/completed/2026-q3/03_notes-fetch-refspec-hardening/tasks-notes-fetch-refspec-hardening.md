# Task List: Notes-Fetch Refspec Hardening

- **Design:** `spec-notes-fetch-refspec-hardening.md`

---

## **Phase 1:** Remove the force-wildcard notes-fetch refspec

_Purpose:_ Stop `arc setup` — and the dead pushability assertion — from installing the force-wildcard user-notes
fetch refspec, delete the now-orphaned install helper, and harden arc's own explicit notes-ref temp fetches, so a
plain `git fetch` can no longer overwrite or `--prune`-delete an unpushed `arc user save`. Consolidates notes
propagation onto arc's explicit-refspec path.

_Design decisions:_ Option C (remove the refspec and rely on explicit `arc user` fetches) per the spec;
alternatives A (`--refmap=` only) and B (tracking namespace) rejected. `detectNotesRefspec`'s removal is
load-bearing, not cleanup — it re-installs the refspec inline, so leaving it would silently re-add the footgun.
Invariant checks run at **integration tier** against a temp origin + clone (the `integration` / `multi-clone`
harness), not the built binary. Full loci and reproduction recipe in `notes-notes-fetch-refspec-hardening.md`.

### `[x]` **1.1 Stop installing the force-wildcard refspec**

- _Goal:_ An unpushed `arc user save` survives a plain `git fetch`, a `git pull`, and a `git fetch --prune origin`
  — canonical `refs/notes/arc/user/<id>` is unchanged (not force-updated, not deleted) — because no code path
  installs or re-installs the wildcard.
- _Outcome:_ `runPostInitSetup` no longer calls `configureNotesRefspec`, and `runPushabilityStatus` no longer
  detects or auto-fixes a missing notes wildcard. Integration coverage pins that init with an existing origin keeps
  only the branch fetch refspec and that local user-notes saves survive `git fetch`, `git pull`,
  `git fetch --prune origin`, and `arc user status`'s comparison path; unit fixtures no longer mention
  `missing-notes-refspec`.

### `[x]` **1.2 Delete the orphaned `configureNotesRefspec` and its vestigial harness install**

- _Goal:_ With no production caller left, `configureNotesRefspec` and its barrel re-export are gone, and no test
  references the removed helper.
- _Outcome:_ Removed `configureNotesRefspec` from `lib/git/exec.ts`, its barrel export from `lib/git/index.ts`,
  and the vestigial multi-clone harness install. The deleted helper's unit-test block is gone; cross-clone tests
  still pass through explicit `arc user` propagation.

### `[x]` **1.3 Defense-in-depth: `--refmap=` on arc's explicit notes-ref temp fetches**

- _Goal:_ A stray configured refspec can never re-introduce the clobber through arc's own notes-ref temp fetches —
  each ignores configured refspecs.
- _Outcome:_ Added `--refmap=` to `boundedNotesRefFetch`, the reconcile incoming-ref fetch, and the
  branch-bounded notes-export fetch while leaving `runUserFetch`'s canonical-target fetch unchanged. Integration
  coverage now manually reinstalls the wildcard and proves `arc user status` preserves an unpushed local note; the
  reconcile unit tests pin the same fetch shape for non-fast-forward recovery.

### `[x]` **1.4 One-time cleanup of this clone's configured refspec**

- _Goal:_ This repo's `remote.origin.fetch` no longer contains the notes wildcard (branch refspec intact), closing
  the residual per-clone exposure window on the dev machine.
- _Outcome:_ Removed this clone's `+refs/notes/arc/user/*:refs/notes/arc/user/*` fetch refspec with
  `git config --unset --fixed-value`; `+refs/heads/*:refs/remotes/origin/*` remains as the sole
  `remote.origin.fetch` entry.

## **Phase 2:** Verification

### `[x]` **2.1 Complete verification** — load and follow `verify-work-unit.md`

- _Quality gates:_ `npm run lint:md`, `npm run lint:sh`, `npm run typecheck:all`, `npm run lint:ts`,
  `npm run build`, and `npm test` passed.
- _Success criteria:_ Seven criteria met; the optional fresh adversarial verify pass returned no spec-conformance
  findings.

---

## Success Criteria

- `[x]` An unpushed `arc user save` survives a plain `git fetch`, a `git pull`, and a `git fetch --prune origin` —
  canonical `refs/notes/arc/user/<id>` is unchanged across each.

- `[x]` With the refspec absent, `arc user fetch` and `arc user pull` still populate canonical notes.

- `[x]` `arc setup` on a fresh repo writes no notes wildcard into `remote.origin.fetch`; the branch refspec is
  unaffected.

- `[x]` No code references `configureNotesRefspec`, `detectNotesRefspec`, `NOTES_REFSPEC`, or the
  `missing-notes-refspec` condition kind.

- `[x]` After the one-time cleanup, this repo's `remote.origin.fetch` no longer contains the notes wildcard (branch
  refspec intact).

- `[x]` All quality gates pass (tests, linting, type checking).

- `[x]` Ready for integration.
