# Draft: Cutover Decompose Removal

- **Origin:** [internal] — the `storage-cutover` cut (2026-11-03); carved from that work unit's draft.
- **Purpose:** Remove the old decomposition machine, which `arc decompose` no longer runs once it runs on the store from
  the flip.
- **Planning posture:** `P1`, a Gate B Should. It is planned to implementation-ready before `cutover-flip` lands. If it
  has not landed by the start of the product-renames sweep, it waits until after the deadline, and its
  `naming-conventions` edge is dropped then, at the Owner's call (`cohort-storage-cutover.md`).

---

## Planning state

- **Readiness:** rough (carved from `storage-cutover`'s draft at its cut, 2026-11-03).
- **Resolved at the cut** (Owner, 2026-11-03; `cohort-storage-cutover.md`):
    - this member's scope and items, below, and its Gate B placement;
    - it stays whole although it crosses the size mark of about 10,000 changed lines: it is a pure deletion of one
      self-contained subsystem.
- **Open:**
    - the inventory, measured against the base the flip lands on.
- **Next:** draft-design, from the scope and items below. Implementation waits on `cutover-flip`.

The inbound items keep the numbers they had in `storage-cutover`'s buffer, shown in their headings. An
item cited here that this draft does not hold is in another member's draft under the same number.

---

## Scope

Measured on 2026-11-03 in `packages/arc-framework/src/`, before tests: 37 `decompose-v3` and `git-decompose-*`
modules in `lib/work-unit/`, about 14,100 lines, and the repository-backed arm of `handlers/decompose.ts`. The store
version in `lib/decompose/` survives with `handlers/decompose-store.ts` and the two old modules it imports,
`decompose-content.ts` and `decompose-command-renderer.ts`.

- **#25's deletion set,** which this draft holds: every module the store version does not import, with
  `decompose-candidate.ts`'s callers in teardown (`verbs/teardown.ts`) and in-flight derivation
  (`in-flight-derivation.ts`). `cutover-flip` takes #25's representative rehearsal cut and workflow end state.
- **What `cutover-in-repo-removal` leaves for it:** each module the old machine still imports, deleted with
  its last caller: the transition-record cluster, `transition-overlay.ts`, `artifactMatcher` and
  `pruneEmptyBacklogSource`, `resolveProjectReadinessViewInput`, and the `ProtectionMode` type where nothing else
  uses them (`cohort-storage-cutover.md` § Coordination).

---

## Unknowns and Assumptions

None on unlanded members.

---

## Inbound Buffer — Pending Integration

> _Routed-in concerns pending integration at this work unit's first planning iteration. Integrate — or_
> _consciously reject — each one._

### `[ ]` **25. Take `seam-decomposition`'s deletion set, rehearsal cut, and workflow end state**

- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-10-19).
- _Shapes:_ Decomposition deletion set, workflow end state, and representative cut in rehearsal

- _Observation:_ `seam-decomposition` rebuilds `arc decompose` store-native from the flip and changes nothing before it
  beyond a capability branch in `handleDecompose`. Three things land here. The deletion pass gains today's decomposition
  machine: every module the store version does not import, with `decompose-candidate.ts`'s callers in teardown and
  in-flight derivation. The rehearsal is the store version's first run on the ref backend, and, run as a representative
  cut on a copy, the evidence `decompose-core-hardening` and `decompose-transform-integrity` close on, with neither
  closeout criterion amended. The flip rewrite takes `draft-seam-decomposition.md` § The workflow's end state: an
  additive batch replacing dispatch, authoring, one distribution approval, and the terminal batch as the landing, with
  today's separate finish-preview stop gone.

- _Captured during:_ `seam-decomposition` draft-design close, 2026-10-16.

---
