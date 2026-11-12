# Draft: Errand Autonomous Advance

**Cohort:** `approval-flow-refinement`

**Purpose:** Define an explicit, per-Errand standing grant that lets an agent carry one determinate Errand through
execution, commits, publication, review, finding response, and integration preparation without repeated Owner
attention, while preserving hard break-outs for changed intent and the exact-head integration interlock.

- **State:** Draft — provisional direction, not a settled contract.
- **Created:** 2026-09-21
- **Origin:** Dogfooding an Errand under explicit standing direction to complete it autonomously, use hosted Codex
  for standard review, exercise judgment over findings, and continue through shipping.

**Naming note.** `errand-autonomous-advance` is provisional. “Autonomous” names the operator experience but can
overstate the authority: the baseline capability stops at the final exact-head integration interlock. Settle a name
that distinguishes advance authority from merge authority before specification.

---

## Problem / Motivation

An Errand is already ARC's one-session, self-evident work shape. It has no planning phase and ordinarily carries no
unsettled design, yet its execution and integration tail still asks for repeated attention at every approval surface:
the review-increment gate, finding disposition and mutation approval, review-fix persistence, pass-ceiling override,
and final integration authorization.

That cadence is appropriate by default. It is needlessly synchronous after the Owner has explicitly delegated the
bounded judgments inside one determinate Errand and asked to be interrupted only when its premise fails. The current
workflow cannot represent that direction, so it re-asks even when the answer is already within the grant.

The originating experiment made the distinction concrete:

- the Owner supplied one conversational grant over the exact Errand, selected hosted Codex for standard review,
  skipped frontline, delegated finding judgment, and authorized continued advance;
- hosted review required four completed passes — three finding-bearing passes followed by a clean pass — with
  separate finding-disposition approval stops during the loop;
- those stops exposed useful evidence, but most did not carry a new Owner decision; and
- the final merge still needed an exact-head authorization. A prospective instruction over a head that did not yet
  exist could not safely substitute for that boundary under the current integration invariant.

The desired outcome is **just enough friction where a decision remains**: an explicit opt-in can make the complete
Errand tail asynchronous up to the final merge request, while an emergent design fork, material scope expansion,
ambiguous finding, unexpected failure, or exhausted review budget immediately returns attention to the Owner.

## Why This Is Its Own Work Unit

This is not a wider deferred-review range. Work-unit deferred review changes the boundary of task-list review; an
Errand has no task axis to widen. The new capability delegates a bounded set of judgments across several existing
boundaries, including review finding disposition and adapter-owned channel settlement.

It is also wider than release-wrapper routing. `interlock-release-refinement` owns when approved commit and push
fires may execute and already anticipates one Errand approval releasing a routine tail. This work unit owns the
Errand-level grant that can supply that provenance and can additionally cover review orchestration and integration
preparation. Merge execution remains outside the baseline grant.

## Provisional Direction

### One explicit grant over one exact Errand claim

Offer an opt-in mode only after an ordinary Errand identity exists. The grant binds to the exact Errand claim — at
minimum its slug and claim ID — plus the stated concern and any explicit routing choices. It is never the default,
never inferred from permissive commit/push settings, and never inherited by a replacement claim.

The initial capability should have one baseline ceiling:

> Advance this exact Errand autonomously through its final integration preparation; pause only on a break-out trigger
> or at the exact-head integration interlock.

Conversational invocation remains the ergonomic entry, but the durable authority must become a typed record rather
than a phrase the next session reconstructs. The CLI should return precomputed continuation or stop states; workflow
prose dispatches on them instead of re-evaluating the grant and its invalidation predicates.

### Authority included by the baseline grant

Within the Errand's existing concern and policy-selected review obligation, the grant may authorize:

- execute the change, run required gates, and make atomic commits as increments become complete;
- push, open or reuse the change request, and perform ordinary lock and publication ceremonies;
- request configured local or hosted review up to the existing pass ceiling;
- verify every finding against source, compose the complete disposition set, and apply dispositions that stay within
  the Errand's concern;
- apply, verify, commit, and push approved-by-grant review fixes, then re-enter review on the new target;
- execute adapter-produced reply-and-resolve settlement for those source-verified dispositions;
- perform typed, reversible integration preparation and a typed base reconcile when existing evidence selects it;
  and
- compose the exact final merge request and surface a terminal decision/deviation report.

The grant does not weaken the review finding mutation guard. It supplies the Owner approval that guard currently
obtains set by set, bounded by the grant's scope. Doing that requires an explicit evolution of both the mutation
guard and the review-increment gate: preserve exact-set approval as the default, and add a bounded policy-authorized
arm whose authority derives from a witnessed Owner grant, the complete source-bound finding set, and a permitted
disposition policy. An agent-written `approved-by-grant` assertion cannot establish approval by itself.

Source verification remains the primary agent's non-delegable judgment, the complete disposition record remains
mandatory, and anything outside the grant stops before mutation. The CLI can verify structural coordinates and
policy bounds; it cannot prove that a semantic fix stays inside an informally stated concern. That classification
remains primary-agent judgment under the break-out contract, never a property inferred from a typed continuation.

### Break-out triggers

The mode is useful only if its stop conditions are sharper than “ask at every gate.” At minimum, invalidate or
suspend the grant and surface the decision when any of these occurs:

- an emergent design question, contradiction with the stated concern, or meaningful scope expansion;
- a review finding that is unverifiable, ambiguous, conflicts with the intended design, or requires work outside the
  Errand boundary;
- a non-mechanical quality/check failure, uncertain external mutation, conflict, or other failure without a typed
  same-concern remedy;
- a change in Errand claim, concern, ownership, change-request identity, or another authority coordinate the grant
  declares stable;
- a repository, target-ref, provider, disclosure-scope, approved policy/version, or spend-envelope change that
  expands the grant, even when review applicability can classify the movement;
- unexpected head or base movement that the existing applicability/reconcile contracts cannot classify;
- an unavailable or ambiguous review source when source choice affects cost or coverage;
- review convergence recommends another paid pass at or beyond the configured ceiling; or
- continuation requires Owner acceptance of residual risk, decline of a review obligation, or another assurance
  judgment the grant did not explicitly reserve; or
- a destructive or irreversible external action not named by the grant.

Deterministic same-concern corrections retain the existing quality-gate rule: repair, re-run, record the correction,
and continue. A hard break does not silently re-arm. After the Owner resolves it, the continuation must say whether
the same grant resumes, narrows, or ends.

### Review spend and convergence

The grant records the review-spend envelope and policy version the Owner approved. A later configuration change
cannot silently enlarge it. The opt-in grant authorizes ordinary passes within that envelope; it does not mint extra
spend. When review-signal convergence recommends one more pass at the boundary, pause with the exact one-pass
consequence and recommendation. Exact approval may extend that one pass and then return the Errand to autonomous
advance.

Do not introduce a second “autonomous ceiling” in the first design. It would duplicate the existing budget axis and
make two numbers answer one question. Reconsider a per-grant additional-pass allowance only if repeated use shows the
single exact override is itself material friction and can remain explicit about cost.

Owner acceptance of residual review risk remains a normal convergence terminus, not a failed or second-class route.
Consume the durable terminus and lineage/pass-accounting contracts from the review-protocol work; do not recreate
them in an Errand-only controller. Ordinary controller-established convergence may advance unattended. Manufacturing
an Owner-accepted terminus from the standing grant may not: accepting residual risk after seeing the review result is
its own attended decision unless a future constitutional contract expressly establishes otherwise.

### Merge authority is a separate boundary

The baseline mode always stops on the exact final merge request. Commit, push, review orchestration, finding
settlement, and integration preparation may proceed only because the Owner grant names those bounded action families;
publication, review spend, and external replies are not assumed reversible. Merge is separately reserved authority
over an as-yet-unknown exact head and remains the integration interlock's decision.

A future merge-inclusive lever requires a separately authorized constitutional amendment, not an implied upper
setting or unresolved implementation option inside this work unit. Such an amendment would have to settle whether a
human can authorize a sufficiently constrained merge policy in advance despite the current exact-head invariant.
Do not implement prospective merge authority here by treating general “ship it” language as approval.

### Durable provenance without storage coupling

Model the grant as a versioned, storage-agnostic operational record. Markdown, JSON, or another local file may be its
current projection, but no workflow may infer authority from a branch name, checkout path, or the record's physical
location. Writes are version-checked and the claim identity stays independent of any one repository branch.

The record should survive ordinary authorized head movement, compaction, and session re-entry. An approved review
fix or routine commit changes the subject digest but not the concern or claim; binding the grant to one head would
repeat the same category error as treating a durable verdict as a per-digest artifact. Exact-head review evidence
and merge authority remain exact; the wider grant is claim- and scope-bound.

Every action taken under the grant should retain auditable provenance: grant identity, action kind, exact target when
one exists, and the typed continuation that admitted it. The store must remain complete under the git-backed local
and shared tiers; no service-only authority record.

Before every resumed action, re-read the current grant generation and revocation state. Continuations and external
effects must be replay-safe: bind each action or operation identity to the grant generation while leaving the grant
reusable across distinct admitted actions. Concurrent or repeated calls either prove the exact action already landed
or refuse, never spend another review pass, post another reply, resolve another thread, or repeat another mutation
on the strength of the same grant event.

### Operator-facing closeout

Completion should surface one compact report:

- increments and commits made under the grant;
- review sources, passes, dispositions, fixes, and convergence terminus;
- any deterministic corrections or soft deviations resolved without attention;
- any permission or workflow stalls encountered; and
- the exact final merge request awaiting authorization.

This is not a substitute for the durable records. It makes the delegated judgments legible at the next human gate
and provides evidence for tightening the protocol after dogfooding.

## Composition / Ownership

- **`commit-increments`** — consume its review/commit boundary vocabulary and atomic-per-increment history.
- **`interlock-release-refinement`** — consume release-wrapper routing, trust-grant inputs, and approval provenance
  for commit/push fires; do not absorb its wrapper mechanics.
- **`unit-scoped-review`** — reuse the break-out matrix, deviation-report discipline, and explicit opt-in posture;
  do not import its task-scope enum or orchestration design into an Errand.
- **`lifecycle-advancement-provenance`** — reuse retained-direction, re-entry, and invalidation semantics. Extend the
  boundary deliberately where this grant includes review disposition and configured review spend.
- **`review-signal-convergence`**, **`review-activity-contracts`**, **`review-request-contracts`**, and
  **`review-source-authority`** — consume convergence, cumulative pass evidence, typed request derivation, source
  selection, and durable Owner-acceptance contracts. This work unit orchestrates those surfaces; it does not own
  their evidence models. Define an explicit producer/consumer handshake: this work unit produces the witnessed
  grant envelope; the review protocol derives an exact disposition authorization from that envelope plus the
  complete source-bound set and policy. Planning may proceed independently, but implementation must await or co-land
  that authorization boundary.
- **`composable-workflows`** — define typed parameters and continuations that its future agenda/compiler can compose.
  Avoid adding prose-encoded conditionals or a second agent-interpreted workflow language.

## Explicitly Separate Friction

The originating experiment exposed three adjacent defects that retain their existing homes:

- awkward explicit-source routing and the discoverable-schema/runtime-validator mismatch belong to
  `review-request-contracts`;
- the clean-worktree ordering and unclear `verifiedFix` continuation belong to `review-activity-contracts`; and
- automatic recovery from a stale self-hosted ARC build is a small standalone Errand captured separately.

None is a prerequisite for defining the grant. Each should improve the path without becoming part of its authority
model.

## Design Questions

- What is the smallest typed grant schema that binds claim, concern, included action families, review-spend budget,
  activation, revocation, and invalidation without duplicating downstream state?
- Which finding dispositions are safely policy-bound in advance, and which always imply a design or scope decision?
- Does a hard break suspend the grant for one decision or retire it and require a fresh grant generation?
- Where does the record live today, and which storage interface makes that location an implementation detail?
- Should a per-developer setting merely enable or recommend the offer, while every Errand still requires an explicit
  per-claim grant? Avoid a project/config axis unless runtime behavior truly needs it.
- Which existing CLI driver should own the next-action projection, and how does it avoid duplicating review and
  integration controllers?
- What future constitutional venue, if any, should consider merge-inclusive autonomy? It is not an implementation
  option in this work unit while the exact-head integration invariant stands.

## Scope Boundary

In scope: explicit activation, typed provenance, included action families, break-outs, review-spend interaction,
finding-disposition delegation, re-entry, invalidation, audit/closeout, and composition with existing review and
release controllers.

Out of scope: default autonomy; weaker quality or review obligations; silent design/scope expansion; provider-specific
hacks; prospective merge authority; subagent execution doctrine; reimplementation of review convergence,
applicability, or request schemas; and storage-path-specific workflow logic.

## Provenance

Drafted from the `prepublication-frontline-action-command` Errand dogfood (PR #664) and the follow-up analysis of
which stops carried a new decision versus repeated an already-scoped direction.

---
