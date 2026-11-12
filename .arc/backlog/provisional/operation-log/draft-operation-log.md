# Draft: Operation Log

- **Origin:** [internal] — minted at the 2026-09-30 housekeep drain from a `USER-INBOX` capture made during
  `storage-contract` draft-design, on a question about operational event logging (2026-09-30).
- **Purpose:** Keep a machine-local log of ARC operations once ARC is public, for a recent-operations view and for
  bug reports.
- **State:** provisional stub with a tripwire: public release, or a second concrete consumer before it.

---

## Problem / Motivation

ARC verbs are compound — one lifecycle transition touches files, commits, worktrees, and sync — and when one stops
partway, its output is the only record, gone after the session or a compaction. Two user-facing uses would earn a
local log:

- a recent-operations view (verbs, outcomes, refusals with their remedies);
- a file to attach to a bug report, as npm, `gh`, and pip provide.

Neither is worth building before public release, when the maintainer is the only reporter. ARC's own diagnostics —
tripwire trends, session-init timings — would be a second consumer, not the reason to build it.

## Approach

Generalize the release audit log (`lib/release/audit-log.ts`): append-only JSONL with a schema, message payloads
redacted at write time, and a failed log write never masking the command's success. Add rotation, and weigh the
common Git directory as its home so every worktree shares one log. It stays machine-local and off every shared store,
which the storage contract's local-only path set already provides; state changes are the store's history, not this
log's.
