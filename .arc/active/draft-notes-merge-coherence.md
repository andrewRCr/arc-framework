# Draft: Notes-Merge Coherence

- **Cohort:** `agile-parallelism/concurrent-work-conventions`
- **Origin:** [internal] — extracted from `async-merge-lifecycle` at create-spec (the `lib/user-sync/` correctness
  work that member originally absorbed under option A). Carved out as its own sibling so the merge-engine
  correctness ships independently — it fixes live defects today, is consumed by a second cohort
  (`cross-machine-sync-coherence`), and is a hard prerequisite of `async-merge-lifecycle`'s finalize notes-sync leg.
- **Purpose:** Make single-machine user-notes merge **coherent** — idempotent removal-tombstone resolution and a
  canonical projection / materialized-manifest builder shared by `arc user load` and sync-status — so a clean tree
  reads clean after sync, removals don't re-synthesize duplicate tombstones, and a HEAD-attached note is
  recognized as current. Built **general**: the projection builder is the primitive `cross-machine-sync-coherence`
  extends, the same build-general-once pattern `merge-safety-mechanism` used for the behind-base primitive.

---

## Problem / Motivation

Two confirmed defects in the user-notes-sync engine make removal-bearing syncs (the exact shape a WU-completion
sync produces — WORKING-MEMORY / `USER-INBOX` entries deleted at completion) misbehave on a single machine:

- A cross-WU removal can leave **duplicate `## Removed:` tombstones** in the raw note, because the
  removal-tombstone synthesis rebuilds prior state tombstone-blind.
- `arc user status` reports **`local unsaved` on a clean post-sync tree**, because it compares on-disk content to
  the *raw* note while disk holds the GC'd projection (tombstones stripped).

Both are benign and self-healing (duplicates GC at the 7-day TTL; the false `local unsaved` clears on
`arc user load`) — WORKING-MEMORY currently carries an interim-posture workaround. But they are a deterministic
break under the removal-bearing sync that rides WU completion, so any workflow wiring a notes-sync step at
completion (`async-merge-lifecycle`'s finalize + unattended-merge legs) ships a broken sync without these fixes
first. Hence the prerequisite relationship — this member lands the engine correctness; `async-merge-lifecycle`
consumes it.

This is a near-term **bridge**: `operational-state-docs` (ADR-022 §4 record/projection model) eventually takes
tombstones out of the rendered file entirely, dissolving both defects at the root, at which point this fix
retires. The forward target is tombstones-as-record-field (the rendered `.md` omits them) — **not** a
`user/{identity}/.internal/` sidecar, which `operational-state-docs` explicitly rejects (the dotfile ⇒
never-synced rule is intentional; break the hidden⇔synced coupling in the record layer, not by bolting an
exception onto the dotfile rule).

---

## Buildables

### Defect (a) — idempotent removal-tombstone resolution

`appendRemovalTombstones` (`lib/user-sync/merge.ts`) rebuilds prior state **tombstone-blind** via `mergeEntries`
over `okEntries` (well-formed entries only, tombstones ignored), then re-synthesizes `## Removed:` markers — so a
second pass re-synthesizes duplicates against the markers the first pass already wrote.

**Fix:** rebuild prior state through the same **tombstone-aware** resolution `mergeCrossWuFile` already uses —
resolve each identity by recency across both entries and live tombstones, suppress resolved-removed identities —
rather than the tombstone-blind `okEntries` path. Re-running becomes a no-op against already-recorded removals.
Extract the shared resolution so `appendRemovalTombstones` and `mergeCrossWuFile` don't duplicate it.

### Defect (b) — projection-aware status via a canonical materialized-manifest builder

`inspectDiskVsLocalSnapshot` (`commands/user/sync-status.ts`) hashes the **raw** note manifest (tombstones
included) and compares it to disk. But disk holds the **projection** — `mergeCrossWuFile` applies
`stripTombstoneSections` before materializing, so the load path stores a tombstone-free hash while the save path
stores a tombstone-bearing one. A clean post-sync tree therefore never matches and reads `local unsaved`.

**Fix:** compare disk to **`projection(note)`**, not the raw note. Lift the tombstone-stripping (today private
inside `merge.ts` as `stripTombstoneSections`) into **one canonical `materialized-manifest` builder** — the
single source of "what the rendered file should contain" — and have **both** `arc user load` and sync-status
build through it, so the save-path hash, the load-path hash, and the status comparison basis are one projection.

**Build it general.** The builder is the primitive `cross-machine-sync-coherence` (CMSC) consumes directly: its
T3 sync-state-aware drift detection needs exactly the projection-aware comparison to distinguish "intentional
retirement at source" from "real local drift," and its in-flight-awareness analysis already dissects the same
`inspectDiskVsLocalSnapshot` / `computeSessionInitLoadNeeded` / `loadNeeded` path this fix rewrites. Author the
builder as a general, exported primitive (subject-parameterized where CMSC will extend it), not a status-local
helper — the same build-general-once contract `merge-safety-mechanism` used for the behind-base primitive.

### Freshness — recognize a HEAD-attached note as current

Post-merge, the latest local note can sit on the archived branch tip one commit behind HEAD, and `arc user sync`
reports "already up to date" even though no note is attached to current HEAD (the `localNoteFreshness.state ===
"ancestor"` case). The **engine** half of the fix lives here: teach the sync / status path to treat
`localNoteFreshness.state === "ancestor"` as **actionable** even when content and remote otherwise compare clean,
so a follow-up save attaches a note to current HEAD. Regression anchor: status reads `current with HEAD` after
the sync.

> The **workflow** half — that `async-merge-lifecycle`'s finalize sequence actually *runs* the save+push so HEAD
> carries a note after the base pull / fast-forward — stays with that member's finalize leg. This member makes
> the engine recognize the condition; the consumer wires the call.

---

## Design Decisions carried into the spec

### One projection, three call sites

The save-path hash, the load-path materialization, and the status comparison basis must all derive from the same
canonical `materialized-manifest` builder. The defect is precisely that they diverge today (save hashes raw, load
hashes projection, status compares against raw). The spec's central invariant: there is exactly one definition of
"the rendered file's content," and every site reads through it.

### Forward-compat: `cross-machine-sync-coherence` extends the builder

CMSC is named a **consumer**, not a re-builder: it extends the projection builder for its cross-machine layer
(local base-ref staleness, partial-push trust, notes-ref coherence) rather than authoring a parallel one. A
write-back rides to CMSC: moving the status comparison basis raw → projection **changes the classifier behavior**
CMSC's defect-1/2 analysis was written against, so CMSC re-grounds its T3 scope once this lands (captured in
`USER-INBOX` for CMSC).

---

## Scope Estimate

**Small-to-medium, single subsystem — `lib/user-sync/` + the two user commands.** Bounded surface, no workflow or
session-init footprint of its own (its only workflow consumer is `async-merge-lifecycle`'s finalize, which lives
in that member). Files: `lib/user-sync/merge.ts` (extract shared tombstone-aware resolution; route
`appendRemovalTombstones` through it), `commands/user/save-load.ts` and `commands/user/sync-status.ts` (build
through the canonical materialized-manifest builder; `ancestor`-actionable freshness), plus the general
projection-builder home. Regression tests: duplicate-tombstone idempotency, post-load cross-WU status,
save→status loop, `ancestor`-freshness → `current with HEAD`. CLI code is single-copy under
`packages/arc-framework/src` (no two-copy mirror for code).

### Dependencies

- **Cohort sibling (consumer):** `async-merge-lifecycle` — its finalize + unattended-merge notes-sync legs
  consume this engine; the dependency runs **the other way** (async-merge-lifecycle `Depends On` this member).
  No dependency *from* this member onto the cohort spine (`concurrent-work-doctrine`) — the correctness work is
  orthogonal to the concurrency doctrine.
- **Cross-cohort consumer:** `cross-machine-sync-coherence` extends the projection builder (build-general
  contract; consumer, not re-builder).
- **Eventual supersession:** `operational-state-docs` (ADR-022 §4 record/projection model) — when it takes
  tombstones out of the rendered file, this bridge retires.
