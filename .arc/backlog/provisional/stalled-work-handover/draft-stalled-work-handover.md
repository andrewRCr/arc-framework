# Draft: Stalled Work Handover

- **Origin:** [internal] — minted at the 2026-10-13 housekeep drain from two `USER-INBOX` captures grouped as one
  concern, for work units: "Let a maintainer reassign a work unit or Errand whose owner is unavailable" and "Flag
  in-flight work that stalls without being paused".
- **Purpose:** Notice in-flight work units that stall without being paused, and let a maintainer hand one over when
  its owner is unavailable.
- **Planning posture:** provisional, `P3`; `Class` settles at planning. Lands after the storage flip.

---

## Captured concerns

### Let a maintainer reassign a work unit or Errand whose owner is unavailable

- _Observation:_ from the storage flip, handing a work item over is a write of its owner field that only the current
  owner makes (`spec-seam-record-kinds.md` § 4 and § 5.4), and `seam-lifecycle` makes it a verb that refuses while work
  the new owner cannot reach remains. An owner who has left, is on leave, or stopped responding then holds the work
  unit, and nobody else can move it. The contract names the same gap for a stalled Errand: how another person takes
  one over "is left to a separate design" (`spec-storage-contract.md` D11), a named cost.

- _Approach:_ one reassignment for work units and Errands. A maintainer reassigns, recording who did it and why; the
  former owner sees it at their next session start; and work the former owner never shared stays theirs to push, which
  the remedy says. Decide who may reassign, what evidence of unavailability it asks for (none, an age, a pause flagged
  for review), and how it composes with a pause's open-to-takers flag.

- _Captured during:_ `seam-lifecycle` draft-design, 2026-10-12, reviewing pause and handover at team scale.

### Flag in-flight work that stalls without being paused

- _Observation:_ from the storage flip a pause is a record every clone sees, flagged for review once it ages
  (`draft-seam-lifecycle.md` § Lifecycle, "Lifecycle moves from the flip"). A work unit whose owner starts it and stops
  without pausing still reads as live in flight indefinitely, and on a team the others are left asking what happened to
  it. Nothing reads activity on in-flight work today.

- _Approach:_ derive an activity signal for each in-flight work item, such as its last record write and its work
  branch's last push, and flag one quiet past a project-set period in status and the in-flight views, suggesting its
  owner pause it, hand it over, or abandon it. Advisory only, and raised only where its remedy verb exists, as
  `operational-advisory-registers` holds.

- _Captured during:_ `seam-lifecycle` draft-design, 2026-10-12, reviewing pause and handover at team scale.

## Coupling

- The Errand halves of both captures already sit with `shared-inbox-model`, whose inbound entry "Re-base the
  shared-inbox model on the storage contract's inbox and Errand decisions" decides what the in-flight view shows of an
  Errand's last activity and whether a teammate may take over a stalled Errand.
- `spec-seam-lifecycle.md` and `spec-seam-locus.md` both leave reassignment by anyone but the owner out of scope;
  their `arc handover` is the owner's own hand-over.

---
