# ARC Clearance Activation Record

This record captures the self-hosting activation of the optional `arc-cleared` exact-head merge guard after its
implementation reached `main`.

## Activation Baseline

- Repository: `andrewRCr/arc-framework`
- Default branch: `main`
- Activation base: `ca6689a51ed201c4aced86be6b51b8ecc74a5cff`
- Required contexts before activation: `merge-ok`
- Required contexts after activation: `merge-ok`, `arc-cleared`

The self-hosting workflow intentionally differs from the packaged installation template. Planning changes are
classified and stamped by the trusted `ci.yml` on the default branch, while reviewed-head unlocks run through
`arc-clearance.yml` and build the trusted default-branch source. Both writers publish the same exact-SHA commit
status.

The `arc-clearance` environment is secretless, has no required reviewers, uses custom deployment policies, and
permits only the `main` branch. No open pull request existed when the required context was added.

## Live Matrix Protocol

The activation run uses two controlled pull requests:

1. A planning-only artifact proves that trusted base code classifies the change as planning and publishes
   `arc-cleared` without an unlock.
2. This reviewed activation record proves that a reviewed head begins without `arc-cleared`, an explicit unlock
   clears only that exact SHA, and a later push produces a new locked SHA.

Every result is read back from canonical pull-request, commit-status, workflow-run, and branch-protection state.
Disposable planning content is closed unmerged and deleted after the matrix completes.

---
