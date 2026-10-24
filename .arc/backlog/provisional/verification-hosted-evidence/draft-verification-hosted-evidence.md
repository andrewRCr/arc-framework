# Draft: Verification Hosted Evidence

- **Origin:** [internal] — minted at the 2026-10-24 housekeep drain from a `USER-INBOX § Work Unit` capture made
  during triage of `storage-ref-backend`'s process lessons (2026-10-22).
- **Purpose:** Let work-unit verification attest on hosted CI evidence at the exact verified head, before standard
  review and the integration pull request, in any project and on any CI provider.
- **State:** provisional stub. Concern and design questions recorded; nothing is settled.

---

## Problem / Motivation

Verification attests on the local merge gate, which reports `test:e2e`, `test:portability`, and
`test:portability:macos` as "not selected (CI-only check requires --ci)". Feature-branch pushes run no CI, so the
first hosted run lands at the integration pull request, after attestation and standard review settle. Merge safety
holds — the `main-protection` ruleset requires `ci-ok` on the pull-request head and integration waits for it — but a
hosted-only failure there moves the Candidate and reopens verification and review.

`storage-ref-backend`'s hand-dispatched run after its base merge caught a batch reader race (about 1 in 40 local runs)
that every local tier had passed.

## Interim rule

PR #1091 (2026-10-22) added a project-only rule to `DEV-RULES.PROJECT` § Quality Gates: dispatch CI at the pushed
verified head once the merge gate passes, attest only on a passing run whose `headSha` is that head, record its run id
in the verification commit body, and dispatch again after any later code change. This work unit canonizes or replaces
it.

## Design Questions

- **Every project.** A shipped rule needs a provider-neutral notion of hosted evidence at an exact head, a way for ARC
  to observe it, and an answer for a project without CI. ARC's checks reader (`arc review checks await`) reads a pull
  request's checks, and verification has no pull request yet.
- **Dispatch or publish earlier.** The common idiom is a draft pull request opened early, so CI runs on every push.
  That moves the publication boundary (`strategy-integration`) and changes when hosted review and pull-request events
  fire.
- **Paying twice.** `record-verified-tree` runs only on pull-request runs, so a dispatched pass does not let the
  pull-request run go light. Tree-identity evidence would; compare `review-orchestration-right-sizing`'s "Let
  identical-tree host CI evidence discharge the local post-reconcile check".
- **What voids it.** Verification fixes, base reconciles, and ceremony commits each move the head. The CI
  classifier's tested-tree notion is a candidate answer.

## Adjacent

`delivery-rebuild-continuity`'s held "Schedule required CI for every exact stacked-member head" covers stacked
members; this work unit is the singleton case.

## Commitment Boundary

This remains provisional until the publication-boundary question is answered: whether hosted evidence before
attestation comes from a dispatched run or from publishing earlier.
