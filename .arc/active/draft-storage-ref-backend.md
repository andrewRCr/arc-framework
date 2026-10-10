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

### `[ ]` **Decide which store integration suites survive the cutover, and size what survives for CI**

- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-10-09).

- _Shapes:_ § Scope — the conformance suite that runs once per backend — and `storage-cutover`'s deletion pass,
  which takes the retirement list.

- _Observation:_ `storage-contract` (#810) added 59 integration test files costing about 131 s of every full CI run;
  the integration job rose from about 354 s to about 495 s. The largest are `store-in-repo-conformance.test.ts` (942
  tests, 34 s), `store-tracked-history.test.ts` (16 s), `store-lifecycle-consumers-differential.test.ts` (12 s), and
  `store-lifecycle-storage.test.ts` (6 s), then smaller `store-notes-*`, `store-transient*`, and `store-sync-*`
  suites. Several target the interim in-repo backend by name. A per-file comparison against a pre-#810 run shows
  pre-existing files unchanged, so the lifecycle rescan did not inflate them.

- _Question:_ which suites retire with the in-repo backend at the cutover, which survive as backend-agnostic contract
  conformance, and whether a conformance suite that runs once per backend should be sized for CI — a representative
  subset per backend, or a cheaper tier where a case needs no Git process. The retirement list goes to
  `storage-cutover`'s deletion pass; `storage-ref-backend`, whose backend the conformance suite runs a second time,
  sizes what survives.

- _Why it matters:_ integration is the largest share of a full CI run. The figures above were measured on the
  self-hosted runner pool since retired; CI now runs on GitHub-hosted runners, so re-measure there and size for
  wall time rather than a fixed runner pool.

- _Captured during:_ the 2026-10-05 discussion of CI cost on fixed runner capacity.

### `[ ]` **Convert existing buffer sections and pending owner-adoption holds at import**

- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-10-09).

- _Shapes:_ `spec-storage-contract.md` D14's one-time move, which `storage-ref-backend` imports and `storage-cutover`
  runs.

- _Observation:_ the move lists no conversion of a draft's `## Inbound Buffer — Pending Integration` entries into its
  inbound list, so readiness that reads an empty list as drained would pass a draft over its stranded entries. Nor
  does it convert a pending owner-adoption `_Hold` capture into its target's inbound list: D11 retires owner adoption,
  and the move only stamps each inbox entry's `_Id:_`, so such an entry would rest in the inbox with its home known.
  `inbound-routing-method` also leaves some entries in place before the flip, rewritten to name another person's
  started work unit (`spec-inbound-routing-method.md` D5, D8's pre-flip gap); the first re-triage after the flip
  routes them.

- _Approach:_ the import converts both (`storage-ref-backend`); `storage-cutover`, which runs the move, confirms none
  is left behind.

- _Captured during:_ `inbound-routing-method` draft close, 2026-10-07.

---
