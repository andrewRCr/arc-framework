# Draft: Git Read Reuse

- **Origin:** [internal] — minted at the 2026-10-30 housekeep drain from a `USER-INBOX § Work Unit` capture (the
  review-fix continue speed Errand, 2026-10-29) and a retained `§ Errand` capture of the same concern (the
  review-status timeout repair, 2026-10-19).
- **Purpose:** Stop delivery and review commands from re-running identical Git queries within one invocation.
- **State:** provisional stub. Concern and evidence recorded; nothing is settled. The first step is to profile
  again after `seam-delivery-review` and the storage cutover land, since both rewrite many of these readers.

---

## Problem / Motivation

### Delivery's review-fix continue

- _Observation:_ profiling `delivery-position`'s E2E case "drives a registered review correction through superseded
  verification to hosted review" (2026-10-29): each `arc delivery review-fix continue` call starts about 300 child
  processes, nearly all Git, and spawning and waiting on them is about two thirds of the call's time. 70% of them
  repeat an identical earlier call (same arguments, same directory) within that call, from many separate readers.
  About half are queries on immutable objects (`rev-parse <sha>^{tree}`, `rev-parse --verify <sha>`,
  `rev-list --parents -n 1 <sha>`, `merge-base`, `cat-file`); the rest re-read mutable state (`ls-remote`,
  `fetch`, the `gh api` pull request reads, `HEAD`, `for-each-ref`). Resolving the Git common directory once per
  state publisher (`b04dc82ed`) removed the largest single repeat, a quarter of the spawns, and took the case from
  about 19 s to 16 s on m2-mini.

### Hosted review applicability

- _Observation:_ The review-status lifecycle case launches about 7,750 Git processes. A focused trace found 3,506
  exact commit/tree reads covering only 47 unique commands. Historical applicability carry replays contribution
  proofs and verifies the same coordinates repeatedly; this is a production cost beyond the fixture cleanup.

- _Evidence:_ Identity-local investigation `review-status-base-movement-timeout-2026-10-19` retains both Git
  traces, original failure and retry logs, final full-tier results, and the increment proposal. Source loci:
  `git-review-contribution-applicability.ts`, `git-contribution-proof.ts`, `hosted-applicability-context.ts`, and
  `mechanical-review-applicability-carry.ts`.

## Direction

- _Approach:_ a design: remember immutable object queries for one command invocation at the Git execution seam,
  keeping only successful answers since an object can appear after a fetch, and decide for each repeated mutable
  read whether it is a deliberate freshness check. `seam-delivery-review` and the storage cutover rewrite many of
  these readers, so profile again after they land before designing; the per-call spawn log and CPU profile method
  is in the Errand's scratch notes, `~/dev/scratch/review-fix-prof/`.

- _Approach (hosted applicability):_ If the cost remains, consider reuse of
  immutable object reads within one observation, preserving fresh endpoint/ref reads, repository boundaries,
  failure recovery, and independent observations. Avoid a process-wide cache or stored-record change.

## Neighbors

- `store-operation-git-access` and `store-cross-call-sharing` share answers inside the ref store's own Git calls,
  through an operation scope. This work unit covers the reads delivery and review code makes through the Git
  execution seam (`lib/git/exec`); a reader the cutover moves onto the store leaves this scope.

---
