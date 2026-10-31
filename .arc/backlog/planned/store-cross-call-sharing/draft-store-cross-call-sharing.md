# Draft: Store Cross-Call Sharing

- **Origin:** [internal] — split out of `store-operation-git-access` at its draft-design (2026-10-29), and minted at
  the 2026-10-30 housekeep drain from the `USER-INBOX § Work Unit` capture of that split.
- **Purpose:** Share Git configuration answers and object readers across ref-store calls, beyond the per-call
  operation scope `store-operation-git-access` builds.
- **Commitment:** planned, P2, Heavy estimate: detecting a configuration change between calls is design to author.
  Depends on `store-operation-git-access`.

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

- _Windows:_ A probe on Git 2.56.0.windows.2 (2026-10-30) found that an open `cat-file --batch` reader stopped
  neither a repack's removal of its pack nor a rename of its store directory, and that maintenance a fetch triggers
  runs in the foreground (spec § 4.2). Git's Windows behavior at ARC's floor (2.47) is untested. Maintenance outside
  the backend instance, in another process or another instance in the same one, gets no wait against a scope's
  reader (spec § Cross-cutting Considerations), and a reader kept across calls widens that window.

---
