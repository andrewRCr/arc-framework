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

### `[ ]` **1.2 Delete the orphaned `configureNotesRefspec` and its vestigial harness install**

- _Goal:_ With no production caller left, `configureNotesRefspec` and its barrel re-export are gone, and no test
  references the removed helper.
- _Context:_ Once 1.1 lands, the only remaining references are the `lib/git/index.ts` re-export and the
  `multi-clone` harness, which calls `configureNotesRefspec` to install the wildcard on every test clone. That
  install is **vestigial**: the multi-clone tests already propagate notes via explicit `runUserPull`, and their two
  plain `git fetch origin` calls are branch fetches (asserting `origin/main`) the wildcard never touched. So the
  deletion needs no test-body migration — only the dangling harness call + import come out.

    - Delete `configureNotesRefspec` from `lib/git/exec.ts` and its re-export from `lib/git/index.ts`.

    - Drop the `configureNotesRefspec` call and its import in `__tests__/helpers/multi-clone.ts`; leave the branch
      fetches and the `runUserPull`-based notes propagation untouched.

    - Remove the deleted symbol from unit tests: the `configureNotesRefspec` describe block and its import in
      `__tests__/unit/git/git.test.ts`.

### `[ ]` **1.3 Defense-in-depth: `--refmap=` on arc's explicit notes-ref temp fetches**

- _Goal:_ A stray configured refspec can never re-introduce the clobber through arc's own notes-ref temp fetches —
  each ignores configured refspecs.
- _Note:_ `runUserFetch`'s canonical-target fetch is deliberately excluded — its explicit `<ref>:<ref>` refspec
  governs its own (non-)force semantics. The two `refs/arc/user/**` temp fetches are not vectors of this bug (no
  configured wildcard matches) and stay out of scope.

    - Add `--refmap=` to the three notes-ref temp fetches: `boundedNotesRefFetch`
      (`commands/user/sync-status.ts`), the reconcile fetch in `reconcileAndRepush` (`commands/user/push-fetch.ts`),
      and the export fetch in `lib/user-sync/branch-bounded-notes-export.ts`.

    - Test the defense (integration): with a `+refs/notes/arc/user/*` wildcard deliberately reinstalled in a temp
      clone, an unpushed `arc user save` survives arc's notes-ref temp fetch (an `arc user status` /
      `boundedNotesRefFetch` run) — canonical `refs/notes/arc/user/<id>` unchanged — proving `--refmap=`
      neutralizes a stray configured refspec.

### `[ ]` **1.4 One-time cleanup of this clone's configured refspec**

- _Goal:_ This repo's `remote.origin.fetch` no longer contains the notes wildcard (branch refspec intact), closing
  the residual per-clone exposure window on the dev machine.
- _Note:_ A one-time manual git-config step, not shipped code — no migration ships (YAGNI per the spec).
  `remote.origin.fetch` is shared across a clone's worktrees, so one unset fixes all of this clone's worktrees.

    - Run `git config --unset --fixed-value remote.origin.fetch '+refs/notes/arc/user/*:refs/notes/arc/user/*'` on
      this clone; confirm the branch refspec (`+refs/heads/*:refs/remotes/origin/*`) remains.

## **Phase 2:** Verification

### `[ ]` **2.1 Complete verification** — load and follow `verify-work-unit.md`

---

## Success Criteria

- `[ ]` An unpushed `arc user save` survives a plain `git fetch`, a `git pull`, and a `git fetch --prune origin` —
  canonical `refs/notes/arc/user/<id>` is unchanged across each.

- `[ ]` With the refspec absent, `arc user fetch` and `arc user pull` still populate canonical notes.

- `[ ]` `arc setup` on a fresh repo writes no notes wildcard into `remote.origin.fetch`; the branch refspec is
  unaffected.

- `[ ]` No code references `configureNotesRefspec`, `detectNotesRefspec`, `NOTES_REFSPEC`, or the
  `missing-notes-refspec` condition kind.

- `[ ]` After the one-time cleanup, this repo's `remote.origin.fetch` no longer contains the notes wildcard (branch
  refspec intact).

- `[ ]` All quality gates pass (tests, linting, type checking).

- `[ ]` Ready for integration.
