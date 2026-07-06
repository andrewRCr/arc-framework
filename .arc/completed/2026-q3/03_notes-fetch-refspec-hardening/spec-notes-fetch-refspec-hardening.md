# Spec (`outline`): notes-fetch-refspec-hardening

- **Origin:** [internal] — surfaced during `finalize-parallelism` wave-1 burn-in, when a routine `arc user status`
  silently dropped a just-completed `arc user save`.

- **Purpose:** Remove the auto-installed force-wildcard user-notes fetch refspec so an ordinary `git fetch` can no
  longer silently overwrite (or `--prune`-delete) unpushed local user notes. Consolidate all notes propagation
  onto arc's explicit `arc user` fetch-and-reconcile path.

---

## Problem / Context

`arc setup` installs a **configured** fetch refspec on `origin`:

```
+refs/notes/arc/user/*:refs/notes/arc/user/*
```

Because it is configured (not command-line), git applies it opportunistically whenever a `git fetch origin`
downloads the notes ref — and a bare `git fetch origin` expands all configured refspecs, so it always pulls the
notes ref in. The leading `+` forces the local canonical `refs/notes/arc/user/<id>` ref to whatever is on the
remote. So any fetch running while an `arc user save` is unpushed **force-overwrites that save away**; under
`git fetch --prune origin`, a canonical notes ref absent on the remote is **deleted** outright. The save content
survives on disk (re-savable), but the ref state a push would publish is silently reset.

Root cause is confirmed and deterministically reproduced: after `arc user save` advances the local ref, a fetch
carrying the notes ref (e.g. `arc user status`'s internal temp-ref fetch) force-resets canonical to remote (the
reflog shows `forced-update` right after the save); `git fetch --refmap=` preserves it, proving the configured
refspec is the vector.

**Vectors that clobber** — any fetch that downloads the notes ref: bare `git fetch origin`,
`git fetch --prune origin`, any human `git fetch` / `git pull`, and arc's own notes-temp fetches. A
**branch-argument** fetch (`git fetch origin <base>`, the session-init base-freshen) is exempt — it downloads
only the branch, so the wildcard has no matching source.

**Why now:** burn-in paused two probe worktrees at handoff (which runs `arc user save` then push); an intervening
fetch would eat their handoff notes. The clobber must be gone before the substrate can be trusted for the
concurrent notes flows burn-in exercises.

## Decision(s)

**We will remove the configured refspec entirely and rely on arc's explicit-refspec notes fetches (Option C —
fully explicit).** Source-verified against `main`: nothing relies on a plain fetch to populate canonical notes —
every reader consumes the *local* canonical ref, populated by `arc user save` (local write) or `arc user
fetch/pull` (explicit `+refs/notes/arc/user/<id>:refs/notes/arc/user/<id>`). The multi-identity / team case is
covered *explicitly*, not by the wildcard: `arc user fetch --identity <dev>` (the documented person-to-person
handoff mechanism) plus `arc user status --all` to discover identities — each an explicit command-line refspec
that works with the wildcard gone. The wildcard's only unique behavior was zero-command implicit propagation of
*all* identities' notes on any fetch, which is the clobber footgun itself and is relied on by nothing (the
refspec was early-days convenience bundled with the first `arc user` implementation, carrying no recorded
design rationale). Alternatives rejected: **(A)**
`--refmap=` on arc's temp fetches only — armors arc's own notes fetches but leaves every plain `git fetch` /
`pull` / `--prune` still clobbering; kept only as defense-in-depth *under* C. **(B)** retarget to a tracking namespace —
preserves a fetch-time ride-along that is itself the footgun, at the cost of a namespace to manage, migrate, and
teach the reconcile path to read.

Concrete changes:

1. **Stop installing** — drop the `configureNotesRefspec` call at `lib/setup.ts` install.
2. **Drop the dead assertion** — remove `detectNotesRefspec`, the `missing-notes-refspec` condition kind, and the
   `NOTES_REFSPEC` constant from `lib/git/pushability.ts` (and the now-stale `missing-notes-refspec` reference in
   `handlers/release/push.ts`'s doc comment). It never gated (its condition always resolves `auto-fixed`, never
   refusing) and its only live behavior was a hidden second install — `detectNotesRefspec` calls
   `configureNotesRefspec` inline — so removing it is load-bearing for "stop installing," not cleanup.
3. **Delete `configureNotesRefspec`** (`lib/git/exec.ts`, plus its `lib/git/index.ts` barrel re-export) —
   install-only; once (1) and (2) land, nothing calls it.
4. **Defense-in-depth** — add `--refmap=` to arc's three explicit **notes-ref** temp fetches
   (`commands/user/sync-status.ts` `boundedNotesRefFetch`, `commands/user/push-fetch.ts` reconcile,
   `lib/user-sync/branch-bounded-notes-export.ts`), so a stray configured refspec can never re-introduce the
   clobber. (The other two temp-ref fetches — `lib/user-sync/sync-state-ref.ts`, `lib/errand/merge.ts` — pull
   `refs/arc/user/**`, which no configured wildcard matches, so they are not vectors of this bug; extending
   `--refmap=` to them as uniform temp-fetch hygiene is optional, not required here.)

**No shipped migration.** Pre-public-beta, the population of already-configured repos is this dev repo alone
(`remote.origin.fetch` lives in the shared `.git/config`, so it is common across a clone's worktrees). Dropping
the install means no new repo ever acquires the refspec, so no forward-migration mechanism is warranted (YAGNI).
Existing clones are cleaned **once by hand** —
`git config --unset --fixed-value remote.origin.fetch '+refs/notes/arc/user/*:refs/notes/arc/user/*'` per
machine-clone — as a verification step, not shipped code.

**Alignment.** PROJECT-PRD § Principles — *Operational friction down, judgment friction up*: passes — the change
removes a silent-data-loss footgun, making notes propagation deterministic and trustworthy. TECHNICAL-OVERVIEW
§ 2 Cross-Machine User State: passes — the work stays within the documented git-notes portability layer
(`arc user` push/pull/load over `refs/notes/arc/user/{identity}`), removes an *undocumented* auto-installed
refspec, and adds no new component or dependency.

## Scope boundary (No-gos)

- **No ride-along preservation** — Option B (tracking namespace) is rejected; notes propagate only through
  explicit `arc user` fetches.
- **No shipped migration / uninstall command / auto-heal** — existing clones are cleaned by hand; no `arc update`,
  session-init, or lazy-guard migration path is added.
- **No change to notes content, storage model, or reconcile semantics** — only the fetch-refspec install and the
  defense flags change; `arc user save/fetch/pull/status/sync` behavior is otherwise untouched.
- **No `arc.*` config changes** — the arc-namespaced config keys (identity, role, interlocks) are out of scope;
  their relocation is `config-storage-architecture`'s.

## Consequences & Risks

- **Explicit-only propagation.** After this, a plain `git fetch` / `pull` neither delivers nor destroys canonical
  notes; only `arc user` commands move them. This is the intended consolidation — and already the documented
  reader contract (every reader consumes the local ref).
- **Residual per-clone window until hand-cleanup.** A not-yet-cleaned *separate* clone stays exposed until its
  one-time unset — and by more than the explicit-fetch defense covers: `--refmap=` (change 4) hardens only arc's
  explicit notes-ref fetches, **not** arc's own bare `git fetch --prune origin` (session-init dead-ref-prune,
  work-unit teardown), which still force-update / prune canonical notes on such a clone. The one-time hand-cleanup
  is therefore the real and only complete mitigation — run it promptly on each clone; on a cleaned clone (wildcard
  removed) every vector is gone. Accepted (pre-beta, few clones).
- **Forward-compat.** Corrective toward the storage direction: consolidating onto the single explicit-reconcile
  path aligns with `strategy-storage-evolution` Principle 3 (version-checked writes, never blind-overwrite) — the
  force refspec is exactly the blind-overwrite anti-pattern. Removing an arc-injected value from
  `remote.origin.fetch` is also directionally aligned with `config-storage-architecture` (less arc state in git
  config), though orthogonal to it (a git-native refspec, not an `arc.*` key); and going explicit-fetch-only
  leaves any future notes-backing-store relocation (`arc-backend`) nothing baked into per-clone config to unwind.

## Success Criteria

- An unpushed local `arc user save` survives a plain `git fetch`, a `git pull`, and a `git fetch --prune origin`
  — the canonical `refs/notes/arc/user/<id>` ref is unchanged across each.
- With the refspec absent, `arc user fetch` and `arc user pull` still populate canonical notes.
- `arc setup` on a fresh repo no longer writes the notes wildcard into `remote.origin.fetch`; the branch refspec
  is unaffected.
- No code references `configureNotesRefspec`, `detectNotesRefspec`, `NOTES_REFSPEC`, or the
  `missing-notes-refspec` condition kind; typecheck, tests, and build are green.
- After the one-time cleanup, this repo's `remote.origin.fetch` no longer contains the notes wildcard (branch
  refspec intact).

## Open items

- None settle-before-starting. Test-tier placement for the clobber-invariant checks (integration vs. E2E against
  a temporary repo) is an ordinary task-generation choice, not open design.
