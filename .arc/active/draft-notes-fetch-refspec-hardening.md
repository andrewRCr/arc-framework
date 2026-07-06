# Draft: notes-fetch-refspec-hardening

- **Origin:** [internal] — surfaced during `finalize-parallelism` wave-1 burn-in, when a routine `arc user status`
  was observed to silently drop a just-completed `arc user save`.
- **Purpose:** Remove the auto-installed force-wildcard user-notes fetch refspec so that an ordinary `git fetch`
  can no longer silently overwrite (or `--prune`-delete) unpushed local user notes. Consolidate all notes
  propagation onto the explicit `arc user` fetch-and-reconcile path — the model the storage direction already
  wants (version-checked writes, never blind-overwrite).

---

## Problem / Motivation

`arc setup` installs a git fetch refspec on `origin`:

```
+refs/notes/arc/user/*:refs/notes/arc/user/*
```

Because this is a **configured** refspec (not a command-line one), git applies it **opportunistically whenever a
`git fetch origin` downloads the notes ref** — and a bare `git fetch origin` expands all configured refspecs, so
it always pulls the notes ref in. The leading `+` makes each application a **forced**
update of the local canonical `refs/notes/arc/user/<id>` ref to whatever is on the remote. So any fetch that
runs while a local `arc user save` is unpushed **force-overwrites that save away**; under `git fetch --prune
origin`, a canonical notes ref absent on the remote is **deleted** outright.

This is data-loss-shaped. The save content survives on disk (re-savable), but the ref state — the thing a
subsequent push would publish — is silently reset to remote.

**Root cause is confirmed and deterministically reproducible:**

- `arc user save` → local canonical ref advances, note present on HEAD.
- `arc user status` (whose internal `git fetch origin +<ref>:refs/arc-sync-temp/<id>` populates a temp ref) →
  the *configured* refspec rides along opportunistically → canonical ref force-reset to remote, note on HEAD
  gone. Reflog shows `fetch origin … forced-update` immediately after the save's `notes add`.
- `git fetch --refmap= …` (ignoring configured refspecs) preserves the canonical ref — proving the configured
  refspec is the vector.

**Blast radius — the vectors that actually clobber.** The opportunistic ride-along fires only on a fetch that
*downloads the notes ref*: bare `git fetch origin`, `git fetch --prune origin` (dead-ref-prune, work-unit
teardown), any human `git fetch` / `git pull`, and arc's own notes-temp fetches (which name the notes ref on the
command line, so the configured wildcard rides along onto canonical). A **branch-argument** fetch is exempt —
`git fetch origin <base>` (the session-init base-freshen) downloads only the branch, so the notes wildcard has no
matching source and canonical is untouched. Still a broad surface across the unqualified fetches — and under
`--prune` a canonical ref absent on the remote is deleted outright.

**Why now:** the burn-in wave paused two probe worktrees at the point of handoff. Handoff runs `arc user save`
then a push; an intervening fetch on that path would eat each probe's handoff notes. The clobber must be fixed
before the substrate can be trusted for the concurrent notes flows the burn-in exists to exercise.

## Alternatives

- **A — `--refmap=` on arc's temp fetches only.** Add `--refmap=` (ignore configured refspecs) to arc's own
  notes-temp fetches. **Rejected as sufficient:** a false floor. It armors ~5 arc call sites but leaves every
  plain `git fetch` / `git pull` / `--prune` (arc's own branch fetches *and* human git) still clobbering. Kept
  only as defense-in-depth *under* Option C.

- **B — Tracking-namespace refspec.** Retarget the configured refspec to a *tracking* namespace
  (`+refs/notes/arc/user/*:refs/notes/arc-remote/user/*`) so plain fetch updates tracking refs, never canonical,
  and arc merges deliberately. Preserves "notes ride along on an ordinary fetch," but adds a tracking namespace
  to manage, migrate, and teach the reconcile path to read — cost paid for a convenience that is itself the
  footgun.

- **C — Fully explicit (chosen).** Stop installing the configured refspec; migrate it out of already-configured
  repos; drop the now-dead "required-refspec" assertion. All notes propagation already flows through arc's
  **explicit** refspec fetches (`arc user fetch/pull` use `+refs/notes/arc/user/<id>:refs/notes/arc/user/<id>`
  directly; status/export/reconcile fetch into temp refs and merge). Keep `--refmap=` on those explicit fetches
  as belt-and-suspenders. Smallest surface, removes the blind-overwrite path entirely, loses no capability.

## Decision (Option C)

Verified against source (main): nothing relies on a plain fetch to populate canonical notes — every reader
consumes the *local* canonical ref, populated by `arc user save` (local write) or `arc user fetch/pull`
(explicit refspec). The `detectNotesRefspec` "required" assertion is a fossil: its condition is always
`disposition: "auto-fixed"`, never gating any push / load / sync / session flow.

Resolved changes:

1. **Stop installing** the refspec — drop the `configureNotesRefspec` call at `lib/setup.ts` install.
2. **Migrate existing repos** — repurpose `configureNotesRefspec` into an idempotent **uninstall** that removes
   the exact `+refs/notes/arc/user/*:refs/notes/arc/user/*` value from `remote.origin.fetch` (leaving the branch
   refspec intact), fired where already-configured repos will hit it (setup/upgrade path; candidate: a
   session-init hygiene step). `remote.origin.fetch` is multivalued and `git config --unset`'s value argument is a
   **regex** — the leading `+` is an invalid pattern, so a naive `--unset <value>` errors and removes nothing. Use
   `git config --unset --fixed-value` (literal match; available since git 2.30, under our `>=2.31` floor) and
   treat exit code 5 (value absent) as the idempotent no-op.
3. **Drop the dead assertion** — remove the `detectNotesRefspec` call, the `missing-notes-refspec` condition
   kind, and the `NOTES_REFSPEC` constant from `lib/git/pushability.ts`. Beyond being a dead gate (its condition
   always resolves `auto-fixed`, never refusing), `detectNotesRefspec` calls `configureNotesRefspec` inline — a
   **second install site** — so its removal is load-bearing for "stop installing," not merely cleanup.
4. **Defense-in-depth** — add `--refmap=` to arc's explicit notes-temp fetches (`commands/user/sync-status.ts`
   `boundedNotesRefFetch`, `commands/user/push-fetch.ts` reconcile fetch, `lib/user-sync/branch-bounded-notes-export.ts`,
   `lib/user-sync/sync-state-ref.ts`, `lib/errand/merge.ts`), so a stray configured refspec can never re-introduce
   the clobber.
5. **Tests** — cover the invariant directly: an unpushed local note survives a plain `git fetch` / `git pull` /
   `git fetch --prune origin`; the migration uninstall is idempotent and leaves the branch refspec intact;
   `arc user fetch/pull` still populate canonical notes with the refspec absent.

## Forward-compatibility (storage direction)

Checked against `strategy-storage-evolution.md` and `draft-arc-backend.md`. No collision — and Option C moves
*toward* the target. Notes are materialized operational state whose sync is "the `arc user` family's shape"
(Holistic Design); C consolidates onto exactly that single explicit-reconcile path by deleting the opportunistic
side-channel. The force refspec is a **blind-overwrite** mutation path — the precise anti-pattern Principle 3
(version-checked writes; git non-fast-forward rejection as the native reconcile form) tells us not to design.
Removing it is corrective, not merely compatible. The one open notes item in the strategy (per-save
history/compaction policy) is orthogonal — untouched. `draft-arc-backend.md` references the notes ref only as an
example of out-of-line-git for clean history; it prescribes no fetch mechanics.

## Unknowns and Assumptions

- **Migration fire-site (only real open detail).** Fresh repos are covered by dropping the install; already-
  configured repos need the uninstall to run somewhere they reliably reach. Candidate: a session-init hygiene
  step (idempotent, cheap). Settle at spec.
- **Assumption (verified):** no code path relies on a plain fetch populating canonical notes — confirmed by a
  full fetcher/reader trace against main.

## Scope Estimate

**Small (hours).** Contained change across `lib/setup.ts`, `lib/git/exec.ts`, `lib/git/pushability.ts`, and the
five explicit-fetch call sites, plus focused tests. No dependencies on other work. Class: **Light** — a bounded
fix composed from existing git patterns, no invention.
