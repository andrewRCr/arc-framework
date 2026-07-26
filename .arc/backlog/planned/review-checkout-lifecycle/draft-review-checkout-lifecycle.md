# Draft: review-checkout-lifecycle

- **Origin:** [internal] — extracted from `draft-review-protocol-alignment.md` (concern 3) at its 2026-07-26
  formalization-readiness read, where the concern proved orthogonal to that work unit's protocol-content subject.
- **Purpose:** Make a failed review leave usable evidence behind, and stop ephemeral review checkouts from
  registering themselves in the primary repository — two defects of one lifecycle, the ephemeral checkout the
  frontline review path materializes and tears down.

- **State:** maturing — inherited settled at extraction. Pre-PRD.
- **Class:** `Heavy` (a real design was authored before extraction; scale is moderate).

---

## Problem / Motivation

Two CodeRabbit CLI attempts on a 10,867-line target returned typed `execution-timeout` with no findings and no
partial result. The diagnostic that would explain why — the saved provider prompts — lived only inside the
ephemeral detached worktree, which cleanup removed. Investigating cost a second costly review rather than a log
read. **A typed failure outcome with no retained diagnostic is not actionable.**

### Two independent losses, not one

The originating capture described a single "evidence destroyed" failure. The adapter and its host actually lose the
evidence twice, by unrelated mechanisms, and the fixes are separable:

1. **In-process — output is discarded before disk is ever involved.** On the abort path the frontline execution
   adapter returns a `timed-out` outcome without ever assigning its process result, so whatever the provider had
   already written to stdout and stderr is dropped. The non-abort error path is worse: it synthesizes empty stdout
   and stderr rather than preserving what was read. Even with the checkout retained, a timeout would still surface
   no partial output.
2. **On-disk — teardown removes the provider's own artifacts.** The frontline materialization host creates a
   temporary root, adds a detached worktree inside it, and releases by removing the worktree and then recursively
   deleting the root. The provider runs with that checkout as its working directory, so its saved prompts and
   working state die with the root.

Fixing only the second would not have explained the originating incident. Both are in scope.

### The second defect — registration leakage

The same lifecycle carries a defect that is independently annoying: every ephemeral review checkout is registered in
the repository's common git directory, so it appears in `git worktree list` from every worktree until released. A
parallel review cycle leaves several temporary chunk checkouts visible alongside real work units, and a leaked one
lingers indefinitely.

## Resolved design decisions

- **Trigger — failure-only by default, with an explicit opt-in for always.** Preserve on outcomes where the
  provider actually executed and did not succeed: timeout, failure, and malformed-result parses. Exclude outcomes
  where nothing ran (unsupported capability, unbound source) — there is no execution to explain. Green runs produce
  artifacts nobody reads, so always-on only consumes disk; the opt-in covers deliberate comparative investigation,
  where the successful baseline is the point and is known to be wanted in advance.
- **Destination — a per-repository state root outside the repository, keyed by target and pass.** Resolve under the
  user's local state directory as `review-diagnostics/{repositoryId}/{headSha}/{pass}`. The repository identity is
  already resolved during materialization, so no new identity concept is introduced. Keying by head **and pass** is
  what makes two attempts on one target distinguishable — precisely the originating case, where two timeouts were
  indistinguishable after the fact. Never under the repository, and never under any path reachable by notes sync.
- **Retention — age-based, with a generous default.** The use case is investigating an incident discovered days
  later, which count-based retention serves poorly once a busy period evicts the interesting run. Age bounds disk
  adequately at this volume. Reap it through the existing session-init sweep surfaces rather than silently, so a
  growing diagnostics root is visible rather than mysterious.
- **Ownership — capture in the adapter, preservation in the host.** The adapter owns the process handles, so
  threading partial stdout and stderr into the timed-out outcome is its responsibility; that half needs no directory
  changes at all. The host owns the directory lifecycle, so preservation hooks into its release path.
  **Implementation constraint:** the release path's recursive delete currently sits in a `finally`, which is what
  guarantees teardown today. Preservation must run before that guarantee and must be failure-tolerant — a preserve
  that throws must never prevent cleanup, or a failed review leaks a worktree and reproduces the clutter problem.
  Add to the cleanup guarantee; do not weaken it.
- **Trust boundary — the destination decision carries it, on security grounds rather than tidiness.** Preserved
  prompts embed source. The system temporary directory is world-readable on most systems, so simply retaining the
  temporary root would make source-bearing artifacts readable by any local user for the whole retention window. A
  state directory under the user's own home can be owner-only. Preserved diagnostics are therefore **local-only:
  never synced, never committed, never written to a repository path.**

### Worktree registration isolation

The registration namespace is the fixable part. Materializing review checkouts inside a **throwaway local clone**
rather than the primary repository moves the registration into the clone's own git directory, where it is invisible
to the primary, and collapses cleanup to a single recursive delete with no worktree records to orphan. A local clone
hardlinks the object store, so it is fast and cheap; and unlike an alternates-based clone, hardlinked objects stay
valid even if the source repacks, so the usual correctness hazard of clone-based isolation does not apply.

Three supporting observations, recorded so they are not re-derived:

- **Checkout count is a parallelism choice, not a requirement.** The observed chunk checkouts all sat at one head
  with scope carried separately, so sequential review needs exactly one. Concurrency should be a deliberate knob
  rather than an emergent default.
- **The existing sweep cannot see them.** Session-init already classifies stale worktrees and stamped husks as
  removable, blocked, or externally managed — but an unstamped detached checkout under the temporary directory falls
  through as externally managed at best. The problem is not that these exist; it is that they are invisible to the
  reaper that already exists. Stamping review checkouts with their owning work unit and cycle would let that
  machinery own them.
- **Dirty review scratch is indistinguishable from unsaved work, so cleanup escalates to the human.** Observed at a
  sibling work unit's integration: four chunk checkouts survived the merge, and the closing report surfaced them to
  the developer with a note that removal would require force-discarding staged and untracked content. That was the
  right call on the evidence available — but the content was entirely review projection of work that had just
  merged, so nothing was at risk and the developer had no decision to make. Neither the sweep nor the agent can tell
  reproducible scratch from a real worktree's unsaved work, so real-worktree caution applies to both. The clone
  isolation above dissolves this rather than needing a rule: a throwaway clone's contents are reproducible by
  construction, so its removal is unconditional and never becomes a question the developer has to answer.

## Alternatives

- **Retain the ephemeral temporary root instead of exporting diagnostics.** Rejected on security grounds rather than
  tidiness — the system temporary directory is world-readable on most systems, so retention would expose
  source-bearing provider prompts to any local user for the whole retention window.
- **Preserve on every outcome (always-on default).** Rejected — green runs produce artifacts nobody reads, so the
  default only consumes disk. Retained as an explicit opt-in for comparative investigation.
- **Count-based retention.** Rejected — the use case is investigating an incident discovered days later, and a busy
  period evicts the interesting run before anyone looks for it.
- **Fix only the on-disk loss.** Rejected — it would not have explained the originating incident, because the
  in-process abort path discards provider output before disk is ever involved.
- **Alternates-based clone isolation.** Rejected in favour of a hardlinking local clone, whose objects stay valid
  even if the source repacks.
- **A rule teaching the sweep to distinguish review scratch from real unsaved work.** Rejected as unnecessary once
  checkouts materialize inside a throwaway clone — reproducibility by construction removes the judgment rather than
  codifying it.

## Unknowns and Assumptions

- **Open — the retention default's concrete value.** Cheap to revisit once real diagnostics volume is observed; the
  age-based shape is settled, the number is not.
- **Assumption — stamping is the right sweep integration.** Stamping review checkouts with their owning work unit
  and cycle would let the existing reaper own them, but the clone isolation may make that redundant for the frontline
  path. Settle which surfaces still need stamping once the clone boundary is specified.

## Composition / Coordination

- **`chunk-scope-binding` — should adopt the registration-isolation pattern.** It owns the chunk-projection
  machinery, where a parallel review cycle registers several temporary checkouts in the primary repository. This work
  unit settles the pattern and applies it to the frontline ephemeral checkout; applying it to chunk projections
  belongs there. No dependency edge in either direction — the pattern is legible from this draft.
- **`review-protocol-alignment` — the extraction source, sibling.** It retains the review protocol's content
  concerns; nothing here depends on them and nothing there depends on this. The two touch different files.

## Scope Estimate

Medium. Two adapter and host loci plus a state-root resolver and retention reaping wired into the existing sweep
surfaces. No unrun measurement sits on the critical path; every design decision above is settled.
