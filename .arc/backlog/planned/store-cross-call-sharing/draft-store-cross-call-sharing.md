# Draft: Store Cross-Call Sharing

- **Origin:** [internal] — split out of `store-operation-git-access` at its draft-design (2026-10-29), and minted at
  the 2026-10-30 housekeep drain from the `USER-INBOX § Work Unit` capture of that split.
- **Purpose:** Share Git configuration answers and object readers across ref-store calls, beyond the per-call
  operation scope `store-operation-git-access` builds.
- **Commitment:** planned, P2, Heavy estimate: detecting a configuration change between calls is design to author.
  Depends on `store-operation-git-access`.

---

## Inbound Buffer — Pending Integration

### `[ ]` **Share one push-URL answer between the comparison witness's two transport lookups**

- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-10-31).

- _Shapes:_ its Approach — how the operation scope keys remembered answers; `spec-store-operation-git-access.md`
  § 7.2 (the remembered-lookup key).

- _Observation:_ under one comparison hold, `readComparisonSource` (through `readRemoteTransports`) and
  `publicationTargetMatches` (through `readNamedTransport`) each run `git remote get-url --push --all`. Remembered
  answers are keyed by lookup function, so the second read starts a process on every push: 281 starts in
  `store-ref-conformance-sync.test.ts`, enough to move that file from 13.4% to 14.4% fewer processes. The second
  prototype shared the answer.

- _Approach:_ derive the named push transport from the shared transport read, or key both by their physical
  invocation, keeping push admission's re-read of transport under the comparison lock.

- _Captured during:_ `store-operation-git-access` verification, 2026-10-31.

### `[ ]` **Reuse a sync-ref capture within a store call where nothing could have moved the refs**

- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-10-31).

- _Shapes:_ its Approach — what the operation scope shares, within and across calls, and the lock rule it serves
  answers under.

- _Observation:_ a 2026-10-31 measurement over the four sync-heavy store files counted 29,713 `readSyncRefs` captures
  (`analysis-test-suite-cost-baseline.md` § Repeated sync-ref captures). 3,718 (13%) repeat an earlier capture in the
  same public call: same patterns and rows, no ref-moving Git command between them, and no ARC lock taken since that is
  still held. Another 4,150 return the same rows after a lock that is still held, so they stay as the locked read. A
  push takes 16.2 captures, 5.2 of them reusable; a pull takes 11.5, 0.8 reusable. The reusable ones repeat at the pull
  lifecycle's `captureMergeRefs` (1,562), push re-listing right after the lifecycle (632) and after the fetch's
  tracking capture (544), and push's listing and layout observation re-reading each other (834). Cross-call reuse adds
  little here: only 163 captures repeat an earlier public call's rows with no ref-moving Git command between. 13,709
  (46%) run outside any public call (migration, follow, cleanup), and 2,696 of those repeat an earlier capture there
  with no ref-moving Git command between; no operation scope covers those flows, and no lock was logged in them.
  Within-call reuse would save about 19 s of those files' 655 s of case time (~3%), estimated from counts at the
  measured per-process cost, not timed.

- _Approach:_ hold the call's sync-ref capture in the operation scope under the same lock rule, and confirm in source
  at each reuse site that the later decision needs no freshness the earlier capture lacks. A single test process
  cannot show a concurrent writer; the compare-and-swap on later writes is what makes a stale capture restart instead
  of writing wrongly. `storage-ref-hardening`'s spec excludes dropping a `readSyncRefs` capture inside a sync call.

- _Captured during:_ the `readSyncRefs` capture-count Errand, 2026-10-31.

### `[ ]` **Measure what sharing saves on hosted Windows, where the store files run 4–12× their Linux time**

- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-10-31).

- _Shapes:_ its Problem / Motivation evidence — where cross-call sharing pays most, and how its saving is measured.

- _Observation:_ the separate-layout conformance files run far slower on hosted Windows than on Linux. Against the
  Linux duration input of run 41226101032, three Windows runs (41168089588, 41226101032, 41230108485) took: sync
  1,280–1,898 s against 155 s (8–12×), records 1,238–1,492 s against 155 s (8–10×), reads 985–1,688 s against 266 s
  (4–6×). macOS ran them in 175–339 s (1–2×). The cause is not measured. These suites spawn Git for most store
  operations, and process creation costs more on Windows, so the per-process count this work unit reduces may weigh
  most there. One conformance file bounds the hosted Windows pair's wall time: about 31–33 min on six shards.

- _Approach:_ when measuring the saving, time a sync-heavy file on hosted Windows (a named-files pair dispatch,
  `portability_files`) or on `desktop-windows` beside Linux, and record a Windows per-process cost beside the Linux
  figure (a 3.2 ms spawn plus about 2 ms of Git at `f663af671`).

- _Captured during:_ the portability split Errand's six-shard measurement (2026-10-31).

---

## Problem / Motivation

- _Observation:_ `store-operation-git-access` gives every public store call one operation scope: a shared object
  reader per bound repository, and the parsed answers of its configuration and remote-transport lookup functions
  remembered within the call (one operation is one public call). Its first prototype (2026-10-29, at `f0606e2db`),
  which shared within a call with no refresh rules, cut the four sync-heavy store files' processes by 22–27%; the
  second (at `10d222dd6`), which implements the spec's refresh rules, by 14–25%. What repeats across calls remains:
  in those four files under the first prototype, `config`, `remote` and `ls-remote --get-url` still made 14,652 of
  89,905 processes (16%) and `cat-file` 4,104 (5%), against roughly 15% of store file time. The store suites now run
  on six shards (`9c3616655`), so that is about 1–1.3 min per store job, where four shards made it 1.5–2 min.
  Evidence: `spec-store-operation-git-access.md` § Prototype evidence and § Alternatives & Rationale (operation
  boundary); raw logs machine-local at `~/dev/scratch/store-op-git-access/runs/proto-origins/`.

## Approach

- _Approach:_ Two shapes to weigh. A backend-instance-owned scope needs no caller change and so reaches the store
  suites; a caller-held scope through a contract handle reaches only callers that adopt it. Either supplies the scope
  through the spec's composition rule (§ 3.3: the coordinator opens a scope only when the context carries none) and
  inherits its maintenance rule (§ 5: a scope yields to maintenance on its instance and never blocks it). Objects and
  listed trees are addressed by object ID and need only the spec's lifetime rules: readers close before a `fetch`,
  `maintenance` or `gc`, at a rename or removal of a store directory, before a nested public call, and at a restart;
  objects keep each site's lock rule, a reader crossing a lock only where the locked work re-checks the tips it builds
  on; and a missing answer through a separate store checks the store directory without a process, repeating the read
  without the reader when the directory is gone (§ 4.8). Tips are already shareable across calls through `version()`
  and `asOf`. Configuration is the real design: notice another process's configuration write between calls (Git
  writes configuration by lockfile rename; includes, conditional includes and environment-supplied configuration
  complicate any check), and keep the spec's lock rule (under a lock, only answers read since the newest held lock
  was taken are served) and its invariant that push admission re-reads designation and transport under the
  comparison lock (§ 7.4). A long-lived reader must also never keep a finished command alive.

- _Windows:_ A probe on Git 2.56.0.windows.2 (2026-10-30) found that an open `cat-file --batch` reader stopped neither a
  repack's removal of its pack nor a rename of its store directory, and that maintenance a fetch triggers runs in the
  foreground (spec § 4.2). Git's Windows behavior at ARC's floor (2.53.0, up from 2.47 by a 2026-10-31 decision) is
  untested. Maintenance outside the backend instance, in another process or another instance in the same one, gets no
  wait against a scope's reader (spec § Cross-cutting Considerations), and a reader kept across calls widens that
  window.

---
