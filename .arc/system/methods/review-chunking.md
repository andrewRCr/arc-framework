---
name: review-chunking
description: Contract-cohesive bounded scopes for reviewing one exact change set
related:
  - frontline-review
  - standard-review
override-active: false
---

# Method: review-chunking

> - **When:** A caller explicitly selects chunked review, or the derived exact-target changeset-size attention
>   signal recommends considering it
>
> - **Contract:** Partition one exact change set into bounded review scopes without changing its work-unit, branch,
>   pull-request, or merge boundary. Preserve complete local and cross-chunk review through dependency closure,
>   union coverage, and a dedicated seam scope.

## review-chunking.override

[No override configured]

## review-chunking.default

A **chunk** is a bounded, contract-cohesive slice of one exact change set reviewed in one pass. It is a review
boundary only: it does not create another work unit, review increment, task-plan phase, branch, pull request, or
merge unit. A downstream delivery model may define a `deliverable` as a chunk with an independent merge boundary
and a `stack` as a dependency ordering over deliverables; this method neither requires nor implements that topology.

### Verification scale attention

Before a member or work-unit criteria walk and its independent companion, invoke `arc review changeset resolve -`
over the selected verification diff. Use its actual baseline: the member's bounded base or the work unit's merge
base. For a committed subject, supply its exact commit coordinates. For local content, anchor `target.headSha` to
current HEAD and supply `localSubject: index` or `localSubject: worktree` to include the index or staged, unstaged,
and non-ignored untracked content respectively. Use `kind: change-set` for local sizing with the selected bounded
diff base; a snapshot has no published delivery-member binding. Never measure HEAD alone when verifying local edits.

The local mode snapshots through a private index without staging files or moving refs. Retain the returned exact
target and use its snapshot as the reviewed subject; refresh sizing and scope selection when that subject changes.
Any `scopeSelection` must name that returned target, rather than the HEAD used to anchor the snapshot.

Dispatch on the resolver's typed state/action pair:

- `disabled / none`, `below-threshold / continue-review`, or `scope-selected / continue-review` — continue.
- `consider-chunks / select-review-scope` — render `recommendedActionText` and resolve attention before the walk or
  reviewer launches. Apply the boundary contract below and select bounded scopes, or an explicit capable whole-target
  route. Review partitioning preserves the selected criteria and verification rubric.
- `delivery-bound / continue-review` — use the bound member scopes as seeds, assess the selected member or seam's
  attention burden under the boundary contract below, and resolve any uncovered verification scope before launch.
- `evidence-unavailable / continue-review`, command failure, or an unsupported result — preserve the diagnostic and
  resolve the missing measurement or scope evidence before launch; never treat it as below threshold.

This preflight selects attention, creates no review evidence, and leaves the independent companion's offer intact.
Retain its target, state, metrics when supplied, and scope disposition with the criteria report. Reuse an unchanged
exact-subject result; the committed member-close and post-materialization checks retain their own boundaries.

### Boundary contract

A chunk is closed from every in-chunk consumer to each declaration it depends on when that declaration is part of
the change set. Keep the declaration in the same chunk, or annotate it explicitly as external or pre-existing.
Standard-library, third-party, and unchanged repository declarations are external by definition. A boundary that
places a changed consumer inside while leaving its changed declaration outside is malformed.

Keep behavior with the tests that exercise it. A code scope without its changed tests cannot support reliable
verification findings. Apply the same closure principle to prose: keep a changed term, method, heading, or artifact
definition with the changed material that consumes it, or identify the referent as external or pre-existing.

Derive boundaries through **seed → judgment → guard**:

- **Seed:** Start from logical commit structure and the module or directory tree.
- **Judgment:** Merge heavily cross-referencing scopes and split unrelated contracts. Cohesion, not a line or file
  budget, determines validity.
- **Guard:** Check changed consumer-to-declaration edges with type checking and definition/reference navigation for
  code, or explicit reference inspection for prose. Re-run against the current exact target if it moves.

The configured exact-target changeset-size advisory thresholds derive an attention signal only. They can recommend
considering chunks, but never draw boundaries, cap chunk size, or make a numeric budget a validity rule. Explicit
callers may apply this method even when automatic consideration is disabled.

Closure establishes validity; it does not by itself establish that a chunk is bounded enough for one review pass.
After closure and test cohesion hold, inspect the candidate's residual attention burden using its available size,
hunk density, contract breadth, and evaluator capability. A candidate that independently trips an enabled
target-level tripwire should be reconsidered for a contract-respecting split by default; a candidate below the
tripwires may still need one. These facts are pressure signals, not caps.

When a cohesive candidate remains attention-heavy, recursively split it along real subcontracts, preserve complete
union coverage, and assign the new cross-child surface to a local seam. If no honest split preserves closure and
test cohesion, record the candidate as an irreducible large closure and make that limitation explicit to the
review carrier; do not silently treat size alone as proof that the pass is bounded.

### Completeness and the seam

Require `change-set − union(chunks) = empty`. Close or surface every uncovered file or hunk; an unmeasured or
uncovered region is not implicitly small or reviewed.

For an incremental correction pass, the change set is the range from the pass's predecessor head to its current
head. The earlier range back to the complete review is covered by the recorded coverage chain and is not partitioned
again. Re-examine each material finding the correction scope carries at its locus, in the chunk whose scope contains
that locus, or in the seam when no chunk does.

Add a dedicated seam scope whenever boundaries create cross-chunk surface. Review changed contracts at their use
sites and inspect boundary-spanning duplication, abstraction choices, and naming consistency. The seam complements
the local chunks; it does not re-read every chunk body as one diluted whole-target pass.

Recursive chunking forms a hierarchy: local seams reconcile sibling chunks, and a top-level seam reconciles the
domain roots. Higher seams consume the cross-boundary contracts and bounded child summaries they need, not every
descendant body or raw diff wholesale.

### Bounded orchestration and reuse

Within one pass, assign each source responsibility to a chunk and name the cross-boundary questions for seams.
Share neutral scope maps and artifact-neutral orientation; justify overlapping source inspection by a dependency,
criterion, changed contract, or unresolved question. A seam consumes bounded conclusions and evidence pointers,
consulting original source where its question requires it. Do not require every parent to re-read all descendant
reports or file bodies.

Preserve completed coverage of unchanged material within the same exact target, rubric, and pass. Reopen it for a
concrete gap, contradiction, or affected boundary; bookkeeping changes alone do not require another source review.
This reuse does not replace an authorized successor pass, an independent repair check, or a separate review rubric.

Decomposition must reduce the remaining attention burden, including its parents'. If a reviewer cannot complete its
scope, retain its findings and precise gap; change the assignment rather than repeating it unchanged. If further
splitting only grows reconciliation or no bounded assignment can cover the residual, report incomplete coverage,
the unresolved source questions, and a finite continuation proposal before expanding again. Partial work never
becomes a clean result or a met criterion by exhausting effort.

Use the existing reports and coverage facts. Do not make recursive audits of reviewers' attention accounts,
preread/parent-GO handshakes, or a new private controller, schema family, or fixture suite prerequisites to ordinary
review. Propose any genuinely necessary new machinery separately. Validate findings against source and spot-check
no-finding accounts proportionately; do not independently prove every ledger entry.

`frontline-review` and `standard-review` may consume this method only through a carrier capable of curated scopes
and complete aggregation. Partial chunk reports have no standalone review authority. The role-specific methods own
carrier eligibility, evaluator isolation, pass accounting, and their existing authority boundaries.
