# Draft: chunk-scope-binding — the automated per-chunk review-scoping path

- **Origin:** [internal] — re-homed 2026-07-23 from a `review-surface-binding` (RSB) inbox capture. RSB shipped
  its advisory local-review lane **without** the automated per-chunk scoping path and deferred that path; the full
  seam is `review-chunking`'s to own. This is `review-chunking`'s follow-on: the origin authors the chunk-boundary
  doctrine and ships Mode B agent-applied, and this work unit adds the _automated_ ergonomic path on top, once that
  doctrine and RSB's local-review contracts are in place.
- **Purpose:** Give the chunk doctrine an ergonomic, CLI-driven per-chunk local review — a **`chunkScope`
  parameter** on RSB's `arc review local prepare` producing a bounded review-source variant (a curated file/hunk
  subset of one change set) plus an external-symbol **annotation channel** in the reviewer payload — so a per-chunk
  review is driven by tooling rather than hand-assembled by an agent on each run. The parameter is the easy half;
  **the real design is the scope-aware receipt binding below.**
- **Seeded, not groomed.** Charter + boundaries only. Needs a `--plan chunk-scope-binding` pass — **after
  `review-chunking` ships** — before formalization. Do not groom it before then.

---

## Grooming status (continuity)

- **Readiness:** `rough` — charter inherited from the deferral; no design has been authored under this slug. The
  receipt binding below is a named problem, not a settled design.

- **Sequencing (boundary):** starts **after `review-chunking` ships — not in parallel**. It depends on (a)
  `review-chunking`'s chunk-boundary doctrine, and (b) RSB's shipped local-review lane (target-derivation,
  review-source, operation-record, reduction). The formal `Depends On: review-chunking` edge is deferred to the
  grooming pass; recorded here as the binding constraint.

- **The real design — a scope-aware receipt / reduction binding** (grounded against source, 2026-07-23):
    - RSB's `ReviewReceiptV2` is **scope-blind**: it carries `targetId` / `requestId` / `reviewRunId` / `result` /
      `findings`, but no field for _which slice of the target was reviewed_ (no `sourceDigest`, no `chunkScope`) —
      `core/gate-contract-v2-schema.ts`.
    - The local receipt store reads receipts by `targetId` only (`hosts/local/receipt-store.ts`), and reduction
      derives publication / review state across every receipt for that target.
    - Two chunk scopes over one head share `targetId` **and** `requestId` (the request constructor takes no scope);
      distinctness lives only in the reviewed-bytes digest / operation id, which the receipt + reduction layer
      can't key on. So a scoped operation can't be bound to its own receipt — a clean scope could be conflated with
      a findings scope over the same head.
    - **Deliverable:** add a scope- / `reviewRunId`-aware binding at **attest + reduce**, extending RSB's
      target-derivation, review-source, operation-record, and reduction contracts, so per-chunk review results are
      attributed and reduced without cross-scope conflation and the union of chunk scopes provably covers the
      change set.

## Boundaries / non-goals

- **Single-target, multi-_scope_ carving only** — not the cumulative or multi-PR **target** algebra
  (`chunked-delivery`'s). No merge-topology change.
- **No new storage or configuration axis** — a parameter on the existing `local prepare` plus a receipt-field /
  binding extension, not a new store.
- **Frontline chunking is not here.** Chunking the advisory pre-publication (frontline) pass is receipt-free and
  ships with `review-chunking`'s doctrine; this work unit owns only the _obligation-bearing_ local independent
  path, where receipts live.
- **Hosted bounded review is not here** — a hosted PR review is whole-PR by construction; scoping it is a
  merge-topology change (`chunked-delivery`'s).
- **Not a prerequisite for `review-chunking`.** The doctrine + Mode B ship agent-applied without this; this is an
  ergonomics upgrade over a functionally-complete method.

## Coordination

- **`review-surface-binding`** — owns the `arc review local` verbs and the receipt / reduction contracts this
  extends. This builds on RSB's shipped local lane and reworks four of its contracts, so coordinate on the receipt
  identity change.
- **`review-chunking`** — the origin; authors the chunk-boundary doctrine and the `chunk` concept this automates.
- **`chunked-delivery`** — the multi-PR / merge-topology sibling; the target-algebra boundary above fences this
  work unit off from it.

---
