# Metadata: Seam Locus, Session-Init, and Personal Surfaces

| **State** | **Owner** | **Branch** | **Class** | **Priority** |
| --------- | --------- | ---------- | --------- | ------------ |
| `Shipped` | `andrew`  | [none]     | `Heavy`   | `P1`         |

- **Cohort:** `state-storage/storage-seam`
- **Depends On:** [none]

- **Origin:** [internal] — the `storage-seam` cut (2026-10-09)
- **Design:** `spec-seam-locus.md`
- **Task List:** `tasks-seam-locus.md`
- **Review Rubric:** [none]
- **Candidate:** `sha256:d61a10c3c30c005ff703925ed2ea75406ffec2f048522aa6cfe7db7d5c8d0b4b`

- **Current Workflow:** [none]
- **Last Completed:** Task 8.1 — Complete verification
- **Next Task:** [none]
- **Blockers:** [none]

- **Next Action:** —

- **PR URL:** <https://github.com/andrewRCr/arc-framework/pull/1042>
- **Completed:** 2026-10-18

## Release Notes Entry

Session initialization supplies typed actions and clearer checkout cleanup guidance, preserving existing storage
behavior.

### Added

- Rebuilt session status sections expose registered schemas and typed actions, including the checkout where an action
  must run.

### Changed

- Checkout cleanup guidance distinguishes missing folders, locks, and unavailable observations. Removable work units
  include an explicit teardown command; other missing registrations include removal guidance by path.
- Rename recovery recommends the doubled-force worktree move command so an existing lock can remain intact.
- Inbox adoption help describes captures consistently across storage implementations.

## Completion Notes

Locus, in-flight derivation, session initialization, and personal state operations now compose through the Store
contract. The capability-gated implementation derives checkout roles from markers and stored subjects, retains paused
and branchless work in the in-flight set, and carries incomplete observations through action eligibility. Personal
surfaces share an entry grammar, managed field writers, and version-bound routing with receipts and survivors. Errand
acquisition, queues, promotion, handoff, scratch reconciliation, identity setup, and named-history repair use the same
selected authority. Terminal lineage and generation checks preserve ownership when a primary record has retired;
entry moves bind both primary records, and checkout claims serialize their final scan with marker publication.

The default implementation remains in-repo. Its existing behavior is preserved apart from the explicitly admitted
session schemas, typed actions, cleanup guidance, dormant wire admissions, settings, and command registrations in
`spec-seam-locus.md`. The ref backend, projection, storage activation, and workflow rewrite are outside this delivery.
Storage-projection retains ownership of adding checkout-aware artifact paths and its marker-cache invalidation hook;
the current helper remains flat. These boundaries avoid presenting the prepared off-branch operations as active
default behavior.

All 25 success criteria and Task 8.1 are recorded complete in `tasks-seam-locus.md` following the approved verification
closure. The complete standard review produced ten material findings; the approved repairs received a fresh independent
check across the full correction range, with no material findings and 635 passing tests in 74 files. The Owner accepted
that review stopping point. The final forced local merge gate passed all 19 applicable checks; three CI-only checks
were not selected locally. Destructive-path evidence distinguishes actual CLI-generated handler inputs with real Git
from built-CLI pre-activation refusals. Successful execution of the full release matrix through the flipped built CLI
with the production backend remains unexecuted here and is assigned to storage-cutover's release rehearsal. Reference
Store evidence does not certify that future backend or its external remote effects.

---
