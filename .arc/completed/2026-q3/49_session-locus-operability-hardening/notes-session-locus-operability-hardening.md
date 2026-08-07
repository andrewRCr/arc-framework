# Notes: session-locus-operability-hardening

## Consumer evidence map

- `src/lib/locus/command-runtime.ts` reconstructs a missing role from registered-worktree, marker, meta, and identity
  facts before minting the record and lease. Preserve the fact collection while removing the persisted join.
- `src/lib/work-unit/teardown-occupancy.ts` already reaches a `clear` decision from marker provenance and git facts;
  retain its marker-generation result and destructive refusal set when record-backed evidence disappears.
- `src/lib/locus/provisioning.ts` calls `establishReadyMarker` only on the spawned path. Primary provisioning needs
  the new marker write and matching rollback coverage.
- Ordinary Errand identities in `src/lib/errand/identity-record.ts` and `src/lib/locus/schema/identity.ts` carry
  `open`, `paused`, and `awaiting-merge`; identity-free partial Errands therefore need the marker's origin binding.
- `projectCheckoutSubjectMeta` is shared by reader and recovery paths, but current call sites supply inconsistent
  active-extension inputs, including hardcoded empty arrays. The derived frame should have one extension-aware
  producer.
- Errand handlers currently hardcode `confirmedNoLiveSession: false`; locus resolution is the reachable CLI path
  that can set it. Move subject-scoped foreign-exit confirmation onto the owning Errand verbs before deleting locus
  mutation commands.
- `src/lib/errand/close-head-lock.ts` is an independent exact `{slug, claimId}` checkout-HEAD protocol. It survives
  record/lease retirement and remains part of close replay coverage.

## Audit watchpoints

- Include stale-worktree and orphan-branch cleanup sweeps even though they sit outside the four primary session
  consumer traces; remove only their lease-derived occupancy veto.
- Replace `src/lib/work-unit/rename-locus.ts` without losing physical move ordering, marker-generation comparison,
  or rollback behavior.
- Treat the identity ref as a shared authority, not sibling-checkout state: malformed or conflicting complete-basis
  input must continue to fail identity mutations closed.
- Verify promotion crash points on both sides of meta commit, inbox settlement, identity removal, and marker
  conversion; the immutable WU-meta receipt is the post-removal exact-generation authority.
