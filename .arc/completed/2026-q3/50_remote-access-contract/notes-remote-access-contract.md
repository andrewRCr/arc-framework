# Notes: remote-access-contract

## Verified implementation loci

- `packages/arc-framework/src/lib/git/remote-ref-reader.ts` is the existing bounded `ls-remote` family to extend.
- `packages/arc-framework/src/lib/git/worktree-sync.ts` owns the fetch-backed worktree relation and deleted-upstream
  classification.
- `packages/arc-framework/src/lib/git/base-distance.ts` owns the temporary `refs/arc/base-drift/<token>` lifecycle;
  `packages/arc-framework/src/lib/git/base-branch-sync.ts` owns the passive base fetch and the missing-local-base
  degraded path; `packages/arc-framework/src/lib/git/base-sync.ts` is the guarded explicit action that can create a
  missing local base.
- `packages/arc-framework/src/lib/user-reference-reconcile.ts` and the status composition remove the unbounded
  session-init base refresh from user-reference authority.
- `packages/arc-framework/src/lib/git/recent-remote-branches.ts`,
  `packages/arc-framework/src/lib/session-init/branch-gone-recovery.ts`, and
  `packages/arc-framework/src/lib/session-init/branch-gone-cascade.ts` own the recency-backed recovery tier and its
  automatic-singleton behavior.
- `packages/arc-framework/src/lib/session-init/work-unit-state.ts` currently collapses a failed behind-base read to
  `false`; `packages/arc-framework/src/lib/session-init/in-flight-work-unit-sweep.ts` carries the public boolean and
  completion-tail state.
- `packages/arc-framework/src/commands/active/in-flight.ts`,
  `packages/arc-framework/src/lib/git/in-flight-derivation.ts`, and
  `packages/arc-framework/src/lib/session-init/materializable-work-units.ts` own live expansion and the session-init
  candidate projection. The current active command reports unreachable live reads successfully, while the finalized
  contract makes that a typed non-zero failure.
- `packages/arc-framework/src/commands/status/run.ts` is the staged session-init compositor. The handler layer wires
  real Git dependencies and CLI rendering around it.
- `packages/arc-framework/src/lib/git/exec.ts` currently limits `GitExecInput` options to `cwd`, while
  `packages/arc-framework/src/lib/git/process-executor.ts` inherits Git's lazy-fetch behavior. The passive contract
  therefore needs an explicit local-only object-access option on both executor seams.
- `packages/arc-framework/src/lib/io-context.ts` bypasses those text executors for byte-preserving `ls-tree`,
  `ls-files`, and `cat-file` reads. `RawGitExec`, `createRawGitExec()`, and `readGitBlobBytes()` need the same
  opt-in policy, with status-side passive callers selecting it and explicit lifecycle callers retaining the default.
- `packages/arc-framework/src/lib/user-sync/notes-publication-proof.ts` already treats shallow history as unable to
  disprove reachability; the code-repository analyzers need the same completeness principle without changing that
  excluded user-notes path.

## Incident evidence

- With network access enabled and the shared linked-worktree `.git` protected read-only, a bounded `ls-remote`
  succeeded while probe-path fetches and temporary-ref writes failed. An unrestricted rerun of the same probe
  returned real state, isolating local metadata permission as the decisive variable.
- With network access denied, `ls-remote` failed at reachability instead. The public failure taxonomy keeps this
  distinct from reachable-but-unmaterialized OIDs.
- In a `--filter=blob:none` promisor clone, querying a newly advertised missing commit through
  `git cat-file --batch-check` launched an implicit `fetch`, wrote a promisor pack, and ran Git maintenance. With
  `GIT_NO_LAZY_FETCH=1`, the same query returned `missing` without changing the object database.
- In a depth-one clone, a local tip and its newly fetched remote descendant were both present as commit objects but
  both marked as shallow roots. `git rev-list --left-right --count` reported `1 1`, while a full-history clone
  correctly reported `0 1`; object presence alone cannot establish an exact graph relation.
- Upstream Git versions before 2.45 do not initialize the client-side lazy-fetch guard from
  `GIT_NO_LAZY_FETCH`; the local Git 2.43 build used for the reproduction carries a downstream backport. Upstream
  Git 2.45 supplies both the global `--no-lazy-fetch` option and environment guard, so the package floor must rise
  to 2.45 rather than treating the local backport as portable evidence.
- Commit availability does not prove descendant availability in a blobless or treeless partial clone. A passive
  status path can enter `readGitBlobBytes()` with the commit present and still trigger an implicit fetch for its
  tree or blob unless the byte-preserving seam also selects local-only access.

## Delivery execution runbook

The canonical delivery plan is `24854ac5-0f6c-41d5-beed-e6e3085bec24`, revision 1, digest
`sha256:863350b54637a8ea609924520205dd715b62a90e7b69975a36fa723ee508775d`. Its six semantic member boundaries
remain unchanged. The local projection currently resolves to these exact heads:

1. `deliver/remote-access-contract-1-substrate-analyzers` — `2b018fb5d`
2. `deliver/remote-access-contract-2-materialization-consumers` — `2bfe9946d`
3. `deliver/remote-access-contract-3-cleanup-recovery` — `5d3c9fc0d`
4. `deliver/remote-access-contract-4-discovery-expansion` — `497bfbcfd`
5. `deliver/remote-access-contract-5-composition-rollout` — `c72321b1a`
6. `deliver/remote-access-contract-6-hermetic-lifecycle-tail` — `d5e551915`

Publish all six refs, but open pull requests through a rolling two-member window because draft creation starts the
self-hosted CI matrix and runner capacity is sparse. The first open member targets `main`; the second temporarily
targets the first member's branch so review and CI see only its own slice. After the first lands, retarget the second
to `main`, rerun required CI on the new base, and open the next member against the second. Repeat with at most two
open or manually reviewed members at once.

Current publication state (2026-08-07):

- Member 1 is draft PR [#473](https://github.com/andrewRCr/arc-framework/pull/473), targeting `main` at exact head
  `2b018fb5d`.
- Member 2 is draft PR [#474](https://github.com/andrewRCr/arc-framework/pull/474), temporarily targeting Member 1 at
  exact head `2bfe9946d`.
- Members 3–6 are pushed but have no pull requests. No manual CodeRabbit review has been requested.

The repository's full pull-request CI matrix currently triggers only for a `main` base. A stacked second member
therefore receives lane attestation while it is stacked, then starts the full matrix when retargeted to `main`.
The rolling window consumes one full self-hosted CI matrix at a time unless that host-side trigger changes.

CodeRabbit hosted review is manual-trigger only and never starts for more than the two-member window. Per explicit
maintainer direction, this delivery does not invoke ARC's review architecture; the draft-state merge lock and the
ordinary explicit merge authorization remain in force. A finding is fixed in its owning member and reconciled into
successors before they become merge candidates. If a finding changes a member contract rather than its
implementation, pause publication, revise unopened cuts, and publish a new canonical delivery-plan revision before
continuing.

Member 5 must be verified to wire supplied base evidence into every status-handler consumer, because Members 3 and 4
land evidence-qualified analyzers whose callers still omit it. Until that wiring exists, branch-gone recovery and the
stale-worktree sweep resolve through the compatibility path: the retirement sweep falls back to `origin/<base>` and
can still emit an actionable teardown from a tracking-ref read, and the unproven recovery arm is unreachable. That is
the pre-existing behavior under migration rather than a regression, so the intermediate cuts publish it knowingly —
but the contract's central guarantee only holds once Member 5 supplies the evidence at both call sites. Confirm both
before treating Member 5 as complete.

Member 6 carries the attended lifecycle tail only after its real pull-request URL exists and its review is settled.
At that point, derive the completed-artifact ordinal from live `main`, archive the control branch's final meta, spec,
tasks, and notes together, regenerate ROADMAP, rerun the documentation lifecycle gates, and append the archival
commit to Member 6. Never reserve the ordinal or write placeholder PR/completion facts in advance.

---
