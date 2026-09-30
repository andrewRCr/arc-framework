# Draft: Storage Ref Backend

- **Origin:** [internal] — the `state-storage` re-cut (2026-09-28); stage 2 of the storage program.
- **Purpose:** Build the default backend: operational and planning state in same-repository `refs/arc/*` behind the
  storage contract, with user sync moved onto it as its first consumer, the one-time import of today's tracked state
  and Git notes, and fetch-refspec installation.
- **Planning posture:** `P1`; `Class` settles at planning. Design may run alongside `storage-contract`'s once that
  draft settles ref layout and each shared surface's concurrency mechanism; implementation may start once its spec
  is approved (`cohort-state-storage.md` § Coordination).

---

## Scope

- **The store.** The ref layout and per-surface concurrency mechanisms `storage-contract` settles, built on the
  mechanisms the concurrency spike proved (`analysis-storage-substrate-direction.md` § 6.9): compare-and-swap with
  rebase-and-retry, a machine-local write lock, per-machine push batching at firing points, and a push loop that
  retries lost races and ends on any other refusal with the server's message. Generalized from user sync's and the
  Errand identity refs' existing ref machinery.
- **Requirements the spikes set** (§ 6.10): batched or long-lived Git calls, Windows included; unique stored paths
  across refs; `git maintenance run --auto` at a firing point; rotation to a new ref name; completed work units' refs
  leaving the fetched namespace. Open: a wider delta window where ARC repacks its own store.
- **User sync onto the store,** retiring its Git-notes transport while keeping its verbs, sync state machine, and
  failure taxonomy.
- **The import** of current state, not history (§ 10.3): tracked planning and completed artifacts, Candidate and
  transition records, and notes collapsed to one snapshot with the old ref kept as an archive tag. Under the
  pre-public-release posture it may be a one-off tool for this repository and CineXplorer rather than a shipped
  `arc migrate`; decide here. `storage-cutover` runs it.
- **Fetch-refspec installation** in `arc init` and `arc update`, with one designated state host per repository.

---

## Inbound Buffer — Pending Integration

> _Routed-in concerns pending integration at this work unit's first planning iteration. Integrate — or_
> _consciously reject — each one._

### `[ ]` **Give the Git executor the capabilities the ref backend needs**

- _Routed from:_ `USER-INBOX § Work Unit`, drained at the `state-storage` re-cut (2026-09-28).

- _Observation:_ the ref backend needs compare-and-swap ref updates, leased and atomic pushes, and batched Git calls
  (storage analysis §§ 6.9–6.10 and 11.3: a push loop that retries lost races and ends on hook refusals; about 30 ms per
  `git` call on Windows). The `cli-git-executor` seam (`lib/git/exec.ts`, `process-executor.ts`,
  `process-error.ts`) supports little of that. Snapshot 2026-09-28, regex estimates:
    - compare-and-swap: no seam helper. About 40 inline `update-ref <ref> <new> <old>` calls, with rejections
      classified by message text (`isCasRejectionError`, `lib/user-sync/notes-merge.ts:36`). The executor
      contract left CAS to domain classifiers fed by `gitFailureText()`; its typed `expectedOutcome` covers only
      `absent-remote-ref` and `stale-lease`.
    - push: `--force-with-lease` at 7 production sites; `--atomic` nowhere.
    - batching: `cat-file --batch[-check]` only as one-shot piped payloads (4 sites), plus one bespoke long-lived
      `update-ref --stdin` verify lock outside the seam (`prepareGitRefVerification`, `lib/io-context.ts:452`).
    - stdin variants: `GitExecInput` (string) and `RawGitExec` (bytes) take no `AbortSignal`. Timeouts are
      caller-owned through `boundedFetch` / `boundedGitInvocation`; execa's `timeout` is never set.
    - most CAS and batch precedent sits in Git-notes code the cutover deletes. Errand identity refs are the
      surviving CAS consumer.

- _Approach:_ design these against the ref backend's actual mechanism rather than ahead of it: a typed rejection
  taxonomy separating retryable races (`fetch first`, `non-fast-forward`, `incorrect old value provided`,
  `cannot lock ref`, `TF401028`) from terminal refusals (`pre-receive hook declined`, `VS403702`, `TF402455`);
  `--atomic` code-plus-state pushes; a batch or long-lived process; signals on the stdin variants.
  `cli-substrate-complete-migration` first gives `RawGitExec` a home in the executor module; today it lives in
  `change-facts.ts`, whose planning-lane classifier the cutover deletes.

- _Scope:_ the pending backlog re-cut renames `arc-backend` to `storage-contract`. The Stage 2 ref-backend member
  may be the final home once the contract settles ref layout and each surface's concurrency mechanism.

- _Captured during:_ `cli-substrate-complete-migration` draft-design, 2026-09-28.

### `[ ]` **Derive task captures for pre-flip commits from their footers in the import**

- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: storage-ref-backend`), housekeep drain (2026-09-30); captured
  during `storage-contract` draft-design, adversarial pass 6 (2026-09-30).
- _Observation:_ `storage-contract` decided (Owner, 2026-09-30, C5) that commits from before the flip get their task
  captures from the import. It derives each closed task's captures from the `Context:` footers of the commits that
  carry the task's ID — the derivation reverse lookup and delivery's attribution use today
  (`lib/handoff/restate-candidates.ts`, `lib/delivery/from-branch.ts`) — so from the flip every task's attribution is
  its capture, and no ARC reader parses task state out of commit messages. This draft scopes the import to "current
  state, not history"; the derivation reads commit messages once, at import, and stores only the captures, each a
  SHA with its patch-id.
- _Observation:_ the same import stamps an `_Id:_` on every existing `USER-INBOX` entry (`storage-contract` C4). The
  inbox digest leaves that line out, a seam change before the flip, so open Errands keep their origin bindings.
- _Approach:_ Add both to the import's scope at this work unit's first planning iteration. Where a squash dropped the
  footers, those tasks keep no capture — a residual to name, not a blocker.

---
