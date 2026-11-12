# Draft: Verification Hosted Evidence

- **Origin:** [internal] — minted at the 2026-10-24 housekeep drain from a `USER-INBOX § Work Unit` capture made
  during triage of `storage-ref-backend`'s process lessons (2026-10-22).
- **Purpose:** Let work-unit verification attest on hosted CI evidence at the exact verified head, before standard
  review and the integration pull request, in any project and on any CI provider.
- **State:** provisional stub. Concern and design questions recorded; nothing is settled.

---

## Inbound Buffer — Pending Integration

> _Routed-in concerns pending holistic integration into the body at this WU's next planning iteration_
> _(`drain-inbox § 5`); each carries its origin. Integrate — or consciously reject — at iteration._

### `[ ]` **Run hosted CI once when review rounds converge, with targeted local integration tests between rounds**

- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-11-10).

- _Shapes:_ § Interim rule, which this unit canonizes or replaces; the durable selection half is in
  `test-suite-contention-hardening`'s buffer.

- _Observation:_ `cohort-identity-verbs` dispatched a full hosted CI run per review round: 16 on
  `feat/cohort-identity-verbs` from 2026-11-05 to 11-07, the last twelve at a round's "record verified" commit. No
  workflow or method dispatches CI; the trigger reads as the project rule's "Dispatch again after any later code
  change", though attestation needs a passing run only at the head being attested. Two runs failed, both at a
  record-verified head, on regressions the local merge gate missed because it skips the integration and E2E tiers:
  `99dd3ea873`, and `fe80531a81`, where fix `3d536c05d0` broke the inherited `review-local-native-defaults`
  integration test. Per-round CI catches a regression near its cause, but every round waits on a full hosted run while
  review is still finding things.

- _Approach:_ Owner direction (2026-11-07): while review is still running, use local checks and let the rounds settle,
  or target. Between rounds, run the local gates plus the integration and E2E files that exercise each fix's code
  (`npm run test:file -- <file>`), adding the content tier (`arc check run test:integration:content --range`) only
  when a fix changes ARC Markdown those tests read, and have each round's record state the local evidence it rests on.
  Dispatch one full hosted run when the rounds converge, at the head to be recorded verified or published; a failure
  there bisects by round, since each is its own commit. No import graph shows integration tests' reach, so finding
  those files is a search an agent can miss. The durable fix selects the code integration tests by reach in the local
  gate, as `test:store` does, and clarifies the project rule to dispatch at the head being attested rather than after
  each fix; it also meets the `WORKING-MEMORY` entry's removal trigger.

- _Evidence:_ `gh run list --branch feat/cohort-identity-verbs --workflow ci.yml` (16 `workflow_dispatch` runs,
  failures 42382374250 and 42426832861); `integration.CIV`'s report.

- _Captured during:_ `project-manager.ARC`, routing `integration.CIV`'s process report, 2026-11-07, approach revised
  the same day on the Owner's direction (Owner-approved).

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
