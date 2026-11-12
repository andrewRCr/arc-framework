# Draft: Projection Base Retention

- **Origin:** [internal] — minted at the 2026-11-10 housekeep drain from a `USER-INBOX` capture made during
  `projection-write-back`'s task generation (2026-11-03), at the re-entry that settled the base of a file other than
  Markdown.
- **Purpose:** Make the stampless field schedule keep the version a save started from for a file other than Markdown,
  so write-back merges each save from its true base.
- **State:** provisional stub. Concern recorded with candidate changes; none is settled.

---

## Problem / Motivation

Four parts of `projection-substrate`'s shipped field schedule for a file other than Markdown discard or misplace the
version a save started from, so no write-back rule over the index fields can recover it. `projection-write-back`'s
Spike 8 model, kept outside the repository, separated each as a residual:

1. `sweepAsideFolder` (`lib/store/projection/sweep.ts`) links back the oldest of an absent path's aside copies,
   walking records in record order, so a newer copy holding a later save is not the one restored.
2. `plan` (`lib/store/projection/swap.ts`) writes the replacement in progress as `{ replaces: original.base, copy }`
   unconditionally. After a replacement stopped before its link, the next one records the entry's base, never laid at
   the path, as the version it replaces, overwriting the record of the version the path holds.
3. `finalizeAsideCopy` (`lib/store/projection/stampless.ts`) clears the replacement record on inode identity, so a
   buffer that reloads mid-swap and saves in place keeps the linked inode, and the replaced version that was its base
   is dropped.
4. `putBack` (`lib/store/projection/aside-copies.ts`) returns an aside copy whose edit was held, clashed, or refused to
   its path keeping the path's `entry.base`. The base the copy's name carried, its save's true base, is recorded
   nowhere, and the path's next take-in merges that save from the wrong base where the path's candidates agree. The
   model treats a hold as final and did not cover this case, so it needs its own run.

`spec-projection-substrate.md` § 3.3, § 3.7, § 5.2 and § 5.4 define the schedule; `spec-projection-write-back.md`
§ 17 item 12 and `notes-projection-write-back.md` § The base of a file other than Markdown record these as residuals.

## Approach

Each needs a change to the schedule itself. For (2), carrying the older record forward where the moving file still
equals it was modelled and rejected: a person who reloads and returns the file to the replaced version exactly then
has the carried record displace the true base in an ordinary flow (the model's `final4-carry` run). The sweep's order
for (1), keeping the record past an in-place save for (3), and carrying the copy's base through the put-back for (4)
look direct, but each should be re-run through the model before it is settled.

## Sequencing

Both owners have shipped, and `projection-worktrees` excludes the engine, so no unit in flight holds this. The capture
assumed no production caller reads these fields before write-back binds the take-in port; that port is bound
(PR #1305), so the residuals bite once projection is live, from the flip.
