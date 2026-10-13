# Draft: Retire Extension Points

- **Origin:** [internal] — minted at the 2026-10-13 housekeep drain from the `USER-INBOX` capture "Remove the inactive
  extension mechanism until lifecycle events replace it", made in the discussion after PR #955.
- **Purpose:** Remove ARC's extension mechanism while every extension ships inactive, so agent workflows stop carrying
  fire-point instructions that do nothing until CLI-fired lifecycle events replace them.
- **Planning posture:** `P2`, cohort `configuration`; `Class` estimated `Light` at minting.

---

## Captured concern

### Remove the inactive extension mechanism until lifecycle events replace it

- _Observation:_ all eleven extensions ship inactive with placeholder `.actions`, in both the package and project
  copies, yet every agent workflow carries their declarations and fire-point instructions, and the CLI keeps
  machinery that serves only them. Before the public release they can go without compatibility handling.

- _Scope:_ 19 `arc.extensions` declarations and 19 fire-point lines across 15 shipped files, plus the recovery
  workflow's `post-context-load` step; the `arc extensions` command; the `extensions` probe slot session-init and
  recovery read; the marker check in `point-scanner`, `validate-extension-points`, and the push-site coverage audit
  in `audit-method-triggers`; the extension files, their install-recipe entries, and the class-tag and
  configurability guidance; about 45 test files that reference the mechanism.

- _Approach:_ remove the mechanism whole rather than only its workflow text, so no `active: true` switch is left
  that fires nothing; record the removal and its successor against ADR-003; leave the redesign to its own capture.

- _Captured during:_ Errand `disposition-approval-release` (PR #955) follow-up discussion, 2026-10-13.

## Coupling

- `customization-arch-realign` owns the config-versus-method-versus-extension boundary, and its § Proposed Principle
  keeps extensions as they are. This removal is that decision's separable part, sent ahead; the replacement is that
  work unit's inbound entry "Replace agent-fired extension markers with CLI-fired lifecycle events".
- ADR-003 records the extension-point system; the removal amends it or partly supersedes it.
- Designs that would extend today's mechanism: `composable-workflows` D1's `extensions` declaration family,
  `release-lifecycle`'s proposed `post-integration` fire point, and `session-retitle`'s post-set-stage fire point.

---
