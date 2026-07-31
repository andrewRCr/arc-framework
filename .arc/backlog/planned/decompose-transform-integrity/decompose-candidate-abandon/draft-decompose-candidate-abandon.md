# Draft: decompose-candidate-abandon

- **Origin:** [internal]

- **Purpose:** Give an operator a sanctioned way to destroy a decomposition candidate they can prove is theirs,
  without first proving the candidate is intact.

---

## The concern

Candidate destruction currently requires the candidate to be **whole**. Every discard path re-derives an expected
candidate shape and compares it against what is on disk, and any deviation — including deviation the decomposition
workflow itself mandates, and including deviation left by an interrupted run of the very command that created the
candidate — is treated as a reason to refuse rather than as the thing to clean up.

The design lead: an abandon path needs only enough identity to be **sure it is deleting the right candidate**.
Claim id, candidate branch, and registered path already pin that. Intactness is the wrong precondition for
destruction.

## Field evidence

One full decomposition run hit four distinct refusals across four candidate states, and discard never succeeded
once. There is currently no evidence that `--discard` works in any state.

| Candidate state                | Refusal                     |
| ------------------------------ | --------------------------- |
| Worktree removed, branch left  | `candidate-cleanup-failed`  |
| After `git worktree prune`     | `candidate-not-exact`       |
| After authoring edits          | `candidate-index-changed`   |
| Pristine, never mutated        | `candidate-path-set-changed`|

The fourth case is the one that reframes the concern. That candidate came from an `--execute` killed by a command
timeout: worktree, branch, and claim created, nothing staged, no receipt, clean working tree — the most
recoverable state available — and discard still refused, on a path-set comparison.

Manual recovery was used all four times, and was safe only because each stranded branch carried no unique commits:

```sh
git worktree remove --force <path>
git branch -D chore/decompose-<origin>
rm .git/arc/transient-claims/<claimId>.json
git worktree prune
```

## Grounded refusal surface

Established against source while planning `decompose-base-mobility`; re-verify before relying on it, but these do
not need re-deriving from scratch.

- Discard refuses a **committed** candidate at three independent layers: the driver's unconditional revalidation
  (which refuses `result-head` as soon as the configured base advances, before any claim is read), the adapter's
  registration-head equality check, and the terminal record itself, which can only ever carry a candidate head
  equal to the prepared base.
- The exactness gate sits in the driver's inspect path, ahead of cleanup. Retirement precedes cleanup, so an
  interrupted teardown always leaves a terminal claim — but the adapter's cleanup re-inspects for exactness
  regardless of that state.
- Exactly one path in the repository destroys a candidate carrying commits beyond its result base: landed local
  cleanup, reached from `arc teardown`. It requires a resolved integration anchor, so it serves only landed
  decompositions.
- Nothing reconciles or garbage-collects a transient-claim record whose registered path no longer exists.

## Relationships

- **`decompose-finalization-scaling`** is probably causal and is worth sequencing alongside this. Measured
  `--execute` cost at minimum cut size exceeds common two-minute command timeouts, and an interrupted execute is
  exactly what manufactures the state discard cannot handle. Neither is comfortably an errand on its own.
- **`decompose-base-mobility`** originally carried this as a goal and dropped it: the defect is independent of base
  movement, and that work unit's restore path produces a _committed_ candidate this surface cannot process at all.

## Open questions

- Does abandon supersede discard, or sit beside it as a separate, less-guarded verb?
- What is the minimum identity proof — is the claim record required, or do branch and path suffice when the claim
  is already gone?
- Should abandon be able to destroy a candidate carrying unique commits, and if so what confirmation does that
  warrant?

---
