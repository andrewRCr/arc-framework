# Draft: Cutover Documentation

- **Origin:** [internal] — the `storage-cutover` cut (2026-11-03); carved from that work unit's draft.
- **Purpose:** Rewrite the documentation the flip leaves describing tracked state: the strategy rewrites the storage
  register names, and the ADR supersessions and amendments.
- **Planning posture:** `P1`, a Gate B Must. It is planned to implementation-ready before `cutover-flip` lands, and
  lands between the flip and the start of the product-renames sweep (`cohort-storage-cutover.md`).

---

## Planning state

- **Readiness:** rough (carved from `storage-cutover`'s draft at its cut, 2026-11-03).
- **Resolved at the cut** (Owner, 2026-11-03; `cohort-storage-cutover.md`):
    - this member's scope and items, below, and its Gate B placement.
- **Open:**
    - the full inventory of shipped prose that still describes tracked state or Git notes.
- **Next:** draft-design, from the scope and items below. Implementation waits on `cutover-flip`.

The inbound items keep the numbers they had in `storage-cutover`'s buffer, shown in their headings. An
item cited here that this draft does not hold is in another member's draft under the same number.

---

## Scope

- **The register's documentation rows:** § Errand Work Class and its work-unit criteria, § Per-Worktree Isolation
  and its acceptance test (H3), the append-only and Git-framed concurrency doctrine, notes prose, the contributor
  tracked-versus-gitignored split, footer vocabulary, `arc join`'s notes message, and the relocatability rule for
  movable artifacts.
- **The ADRs:** ADR-007 Parts 4–6, ADR-012 Parts 1 and 4, ADR-019 Surface 1; note-level passages in ADR-003, 016,
  017, 021, 024, 027, 029, and 031; ADR-027's Errand-record placement and three clauses of ADR-021's 2026-05-31
  amendment, superseded rather than amended; ADR-014 goes with `contributor-path`.
- **The errata convention** (H4) and **the `storage.backing_repository` comment** (#33).

---

## Unknowns and Assumptions

- H3, the § Per-Worktree Isolation rewrite: `projection-worktrees` § 10.5, re-checked when it lands.
- H4, archive errata onto store history: `projection-write-back` § 8.4, re-checked when it lands.

---

## Inbound Buffer — Pending Integration

> _Routed-in concerns pending integration at this work unit's first planning iteration. Integrate — or_
> _consciously reject — each one._

### `[ ]` **33. Say when the shipped `storage.backing_repository` comment takes effect**

- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-10-24).

- _Shapes:_ its documentation pass, which makes the backing pointer live and rewrites adopter-facing text.

- _Observation:_ the shipped config template's Storage section (`packages/arc-framework/arc/system/arc-config.yml`,
  mirrored in `.arc/system/arc-config.yml`) reads "Optional backing repository URL for ARC state. Empty uses no backing
  repository pointer." Nothing reads the key to any effect before the flip: its only reader is `readBackingRepository`
  through `src/commands/store-ports.ts`, and `createStore` still composes the in-repo backend. A project reading the
  template may expect the privacy the backing repository exists for.

- _Approach:_ at the documentation pass, rewrite the comment to say what the key does once live, or keep the key out of
  the template until the flip makes it live.

- _Captured during:_ `storage-ref-backend` pre-publication standard review (finding F19, deferred with the approved
  disposition set), 2026-10-23.

### `[ ]` **H3. Rewrite § Per-Worktree Isolation and its acceptance test**

- _Routed from:_ `spec-projection-worktrees.md` § 10.5, 2026-11-03.

- _Shapes:_ the documentation pass. This is the register row on the doctrine rewrite, which this unit already owns.

- _Observation:_ the invariant becomes "`active/current/` holds only this checkout's work item".
  `projection-worktrees` adds an integration test over the reference backend that holds the new layout, and adds no
  guard on today's flat layout.

- _Approach:_ rewrite `strategy-work-organization.md` § Per-Worktree Isolation and its acceptance test to match, in
  both copies.

### `[ ]` **H4. Move `archive-work-unit`'s errata convention onto the store's history**

- _Routed from:_ `spec-projection-write-back.md` § 8.4, 2026-11-03.

- _Shapes:_ the documentation pass. This is the register row on the errata convention, which this unit already owns.

- _Observation:_ `archive-work-unit.md` § Post-`Shipped` errata convention says "git history is the lock" on a shipped
  Release Notes Entry. From the flip the archived meta is a store record, and its history is the store's.

- _Approach:_ rewrite the convention onto the store's history of the archived meta.

---
