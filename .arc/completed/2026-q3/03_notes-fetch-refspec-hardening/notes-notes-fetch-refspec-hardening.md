# Notes: notes-fetch-refspec-hardening

## Reproduction & verification recipe

The clobber, reproduced deterministically — the basis for the invariant test:

1. `arc user save` — local canonical `refs/notes/arc/user/<id>` advances; note present on HEAD.
2. While that save is unpushed, trigger a fetch that **downloads the notes ref** — e.g. `arc user status` (its
   internal `git fetch origin +<notes-ref>:refs/arc-sync-temp/<id>`), a bare `git fetch origin`, `git pull`, or
   `git fetch --prune origin`.
3. Observe the clobber: the configured `+refs/notes/arc/user/*:refs/notes/arc/user/*` refspec rides along and
   force-resets canonical to remote. `git reflog show refs/notes/arc/user/<id>` shows `fetch origin … forced-update`
   immediately after the save's `notes add`; the just-saved note is gone from HEAD (under `--prune`, the ref is
   deleted outright).
4. Control that proves the vector: `git fetch --refmap= …` (ignore configured refspecs) preserves canonical.

Post-fix, the same sequence must leave canonical **unchanged** (refspec absent). One-time repo cleanup (per
clone; `remote.origin.fetch` is shared across a clone's worktrees, so once per clone fixes all its worktrees):
`git config --unset --fixed-value remote.origin.fetch '+refs/notes/arc/user/*:refs/notes/arc/user/*'`.

## Implementation loci (verified against `main` this session; line hints approximate)

- **Install site** — `lib/setup.ts:97` (`configureNotesRefspec(io.exec)` inside `runPostInitSetup`).
- **`configureNotesRefspec`** — `lib/git/exec.ts:233` (touches only `remote.origin.fetch`); barrel re-export at
  `lib/git/index.ts:13`.
- **Dead assertion** — `lib/git/pushability.ts`: `NOTES_REFSPEC` const (~:140); `detectNotesRefspec` (~:344),
  whose condition always resolves `auto-fixed` (never gates — `isRefusalCondition` counts only
  `block` / `caller-resolvable`) and which re-installs inline (`configureNotesRefspec` at ~:355 — the hidden
  second install site). Stale `missing-notes-refspec` reference in `handlers/release/push.ts:16` (doc comment).
- **Genuine notes-ref temp fetches (add `--refmap=`)** — `commands/user/sync-status.ts:1407`
  (`boundedNotesRefFetch`, `+<notesRef>:<temp>`), `commands/user/push-fetch.ts:255` (reconcile,
  `incomingFetchRefspec(refs/notes/…)`), `lib/user-sync/branch-bounded-notes-export.ts:141`.
- **Not vectors of this bug** — `lib/user-sync/sync-state-ref.ts:130` (`refs/arc/user/<id>/sync-state`) and
  `lib/errand/merge.ts:142` (`refs/arc/user/<id>/errands`) fetch under `refs/arc/**`, which no configured
  wildcard matches. (`--refmap=` on them would be uniform temp-fetch hygiene only — out of scope here.)
- **Canonical-target fetch (correctly excluded from `--refmap=`)** — `runUserFetch`
  (`commands/user/push-fetch.ts:152-155`); its explicit `<notesRef>:<notesRef>` refspec governs its own
  (non-)force semantics and is not overridden by a stray configured `+` refspec.
- **Multi-identity path (confirms no capability lost)** — `arc user fetch|pull --identity <dev>` →
  `handleUserFetch` / `handleUserPull` → `runUserFetch` with an explicit refspec; `arc user status --all` →
  `listRemoteUserIdentities` (`git ls-remote`, no fetch). This is the documented person-to-person handoff path
  (`strategy-team-coordination.md` § Person-to-Person handoff), independent of the configured wildcard.
