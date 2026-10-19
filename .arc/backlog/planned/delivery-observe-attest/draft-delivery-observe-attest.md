# Draft: Delivery Observe and Attest

- **Origin:** [internal] — the `state-storage` re-cut (2026-09-28); one of the storage program's follow-ons.
- **Purpose:** Re-scope stacked delivery toward observe-and-attest once operational state is off the code branch.
  ARC stops moving refs whose meaning it does not own. A mutation engine — Git, a provider CLI, a stacking tool, or
  an agent — creates, restacks, and pushes member branches. ARC observes the result and attests it, binding evidence
  to exact heads and admitting it through a gate, or refuses it with a typed verdict and a remedy naming the
  operation that would clear it.
- **Planning posture:** `P1`; `Class` settles at planning. Runs after `storage-cutover`; `storage-contract` tags it
  core or deferred.

---

## Scope

- **What ARC keeps** (build-versus-compose analysis § 9.2): the plan — member boundaries as a declared cut over one
  work unit's tasks and history — observation of member heads, predecessor relations, and pull-request state;
  structural verification; the evidence ledger; the gates; and typed remedies.
- **What goes** (§ 9.3): lifecycle exclusion, member reconstruction, the constructor's interior, absorption and
  adoption merges into the top, rematerialization, the private candidate namespace, and conflict workspaces are
  deleted with the substrate. The guarded-operation protocol, refresh planning, and the correction controller shrink.
  Convenience verbs become optional drivers that delegate to a configured engine and then observe.
- **The piece most worth building** (§ 9.5): evidence carried across a rewrite by contribution rather than commit
  identity, so a provider restack does not become a re-review storm.

## Preconditions

- **State off the code branch** — `storage-cutover`. Members must be real commits on real branches, and the
  work-unit branch stops carrying lifecycle artifacts.
- **History policy** — members must be rewritable by tools, and the full inversion needs a lease-guarded rewrite of
  the top before integration. That is the history-policy follow-on (`history.policy: rewrite-with-lease`), not yet
  stubbed; add the edge when it is.
- **Tracked-tier projection retirement** (`strategy-storage-evolution.md` § Contract Design Touchpoints): replace the
  filtered member-ref projection with ordinary interior-ref members, register the complete stack including the top,
  and permit native restacking end to end. Keep the delivery-typed terminal-authorization arm and member-boundary
  verification, which do not depend on storage.

## Storage-coupling register items

Two rows in `cohort-state-storage.md`'s register are this work unit's:

- **Stacked delivery's terminal top.** The work-unit branch carries lifecycle artifacts, stays outside provider
  mutation, and absorbs predecessor movement append-only (`refresh.ts:94`). It dissolves once state is off the
  branch and the history policy allows a lease-guarded rewrite.
- **Review projections.** Each program work unit may project its review chunks as stacked draft pull requests beside
  its single-branch landing (`cohort-state-storage.md` § Soft coordination). They retire when stacked delivery
  returns, which is this work unit's to deliver.

## Coordination

- **`delivery-rebuild-continuity`** — held at Planning. After the cutover its D4 and D6 are re-scoped, and D1–D3,
  D8, and D9 are expected to survive (storage analysis § 9.2). Decide at planning whether it folds in here.
- **`delivery-correction-convergence`** — paused behind the cutover. The correction controller it builds on shrinks
  here to "fix, restack with any tool, re-observe, re-scope review by applicability".

## Reading inputs

- `analysis-stacked-delivery-build-vs-compose.md` § 9 (the inversion) and § 10 (the options; option 3 was
  selected).
- `analysis-storage-substrate-direction.md` § 9.2 (the delivery dispositions).

---

## Inbound Buffer — Pending Integration

> _Routed-in concerns pending integration at this work unit's first planning iteration. Integrate — or_
> _consciously reject — each one._

### `[ ]` **Assess whether delivery's private per-member namespaces want a shared lifecycle contract**

- _Routed from:_ `USER-INBOX § Work Unit`, drained at the `state-storage` re-cut (2026-09-28).

- _Observation:_ delivery holds two private per-member ref namespaces with different lifecycle contracts.
  `refs/arc/delivery-candidates/{planId}/{chunkKey}` is created only for correction authoring, always paired with a
  detached gate worktree, enumerated from the plan, and refused as `candidate-gate-mismatch` unless both halves sit at
  the same head — a refusal that blocks closeout. `refs/arc/delivery-refresh-candidates/{planId}/{chunkKey}` is
  ref-only, enumerated from the namespace itself, deleted individually, and swept by both the reaper and the GitHub
  refresh host, the latter indiscriminately by `planId` with an empty `deliverableId`. The ref mechanics are already
  shared — `rewriteExactLocalRef` and `deleteExactLocalRef` take a per-kind validity predicate. What is not shared is
  who may mint in a namespace, who sweeps it, at which boundary, and what refusal it produces.

- _Approach:_ an open question, not a settled DRY finding. The gate-paired versus ref-only difference may be
  legitimate specialization — editing in place needs a worktree, a computed head does not. Assess whether the
  lifecycle layer wants one contract before assuming the namespaces should converge; any extraction has to re-derive
  the closeout blocking semantics, whose failure mode is a plan that cannot close out.

- _Scope:_ six files, roughly ten thousand source lines with about thirty-five hundred lines of directly coupled test,
  inside delivery's larger test surface. Work-unit sized, on machinery no in-flight work unit otherwise touches.

- _Captured during:_ `delivery-rebuild-continuity` draft-design re-entry, 2026-09-21. The reconstruction design
  considered becoming a third consumer and deliberately did not, so the question stands on the two existing instances
  rather than on that work unit's needs.

### `[ ]` **Collapse the duplicated delivery top-absorption into one implementation**

- _Routed from:_ `USER-INBOX § Work Unit`, drained at the `state-storage` re-cut (2026-09-28).

- _Observation:_ the refreshed-predecessor absorption is written twice, byte-identically. `chain-absorption.ts`
  builds a merged tree with `merge-tree --write-tree` and commits it with `commit-tree <tree> -p <top> -p
  <predecessor>` under `Absorb refreshed delivery predecessor`, then leases the ref under `delivery predecessor
  absorption`; the GitHub refresh adapter emits the same two commands under the same two messages inline. Only the
  library copy carries the guard refusing a `refs/heads/delivery/` top, so the two differ on an authority-relevant
  point rather than only on location.

- _Approach:_ the composition seam already exists — four modules declare an injected `absorbTop`, wired at three
  handler sites to the library primitive, and the adapter is the single bypasser. The blocker is that guard: the
  adapter's subject is a published member ref, exactly what the library refuses. Lifting it to callers means each
  caller vouches for its own ref, which is an authority-boundary decision rather than a mechanical move, and is what
  makes this spec-worthy rather than an errand.

- _Scope:_ the top is constructed at **three** sites across two modules, not the two an earlier framing named —
  `chain-adoption.ts` (adoption, reached by the rematerialization route) plus `chain-absorption.ts` twice (contained
  and refreshed movement). Scope any extraction across all three, and decide deliberately whether adoption belongs
  with absorption or stays separate; only the latter two are the exact duplicate.

- _Files:_ `chain-absorption.ts`, `chain-adoption.ts`, `scripts/delivery/hosts/github-refresh.ts`, plus the
  `absorbTop` declarations in `native-landing.ts`, `provider-refresh-execution.ts`, and `suffix-reconciliation.ts`.

- _Captured during:_ `delivery-rebuild-continuity` draft-design consolidation, 2026-09-21. It entered that work unit
  as a deliverable on the premise that the chain constructor needed the construct/publish split; the constructor's
  route reaches `adoptTop` instead and its member construction reaches neither module, so the premise did not hold
  and the concern routed out. Both duplicate call sites sit on the provider-refresh path, which that work unit's
  scope boundary disclaims.

### `[ ]` **Separate binding a delivery candidate coordinate from resetting it to the public member**

- _Routed from:_ `USER-INBOX § Work Unit`, drained at the `state-storage` re-cut (2026-09-28).

- _Observation:_ `arc delivery authoring rematerialize` is the typed writer for the private candidate/gate pair,
  but it pins what it binds to the current published member — it refuses `authoring-rematerialize-public-moved` unless
  `requestedHead`/`requestedTree` equal the observed public coordinates. So the verb conflates two operations: "bind
  this pair to an exact coordinate" and "reset this pair to the public member." Only the second is expressible today,
  which is why any caller holding a legitimate non-public coordinate — a mechanically rebuilt member, for instance —
  cannot use the verb even though the library primitive beneath it (`prepareDeliveryReviewFixCandidateGate` over
  `createDeliveryReviewFixCandidatePair`) is entirely coordinate-agnostic.

- _Approach:_ likely either relax the public-coordinate guard into a caller-supplied expectation, or split the
  reset-to-public case out as its own verb over the shared primitive. Which one is a design call: the guard is
  load-bearing for the review-fix route it was written for, so widening it must not weaken that route's
  authority check.

- _Observation (infra smell):_ this touches typed delivery authoring verbs and their authority schema
  (`ReviewFixAuthoringAuthoritySchema` carries `route: "provider-refresh"`), so it wants the reviewed lane and a
  blast-radius read. Related but distinct from the captured chain-absorption de-duplication.

- _Files:_ `packages/arc-framework/src/handlers/delivery-execution.ts` (the `authoring-rematerialize` arm and its
  schema), `packages/arc-framework/src/lib/delivery/review-fix-candidate-gate.ts` (the route-agnostic primitives).

- _Captured during:_ `delivery-rebuild-continuity` planning — adversarial review traced the member constructor's
  output to this writer and found the verb could not accept it.

### `[ ]` **Decide where a stacked delivery's design reaches review, and how its members treat D18's review copy**

- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-10-19).
- _Shapes:_ Scope: how a stacked delivery presents its design and treats D18 export in members and cleanup

- _Observation:_ both rows say to retain or rehome D18's candidate-tail deletion arm so the cleanup cannot reopen
  review, while "export addition and re-export remain reviewable". `seam-delivery-review` found that cannot hold:
  `classifyPathTreatment` classifies by path alone, so the one arm D18 keeps for the export path at `.arc/specs/<slug>/`
  makes the add, the re-export, and the delete evidence-neutral alike, and a reviewable add would let the delete change
  the subject, since the copy is never in base and its delete drops out of the base-relative diff. The copy reaches
  review on the pull request, and a work unit's own spec on the branch is already evidence-neutral today
  (`notes-seam-delivery-review.md` § Corrections across rows).

  A stacked delivery meets the copy a second way, in these modules' own lifecycle-contribution path group
  (`CurrentDeliveryLifecycleContributionPathSource.resolve`), which holds the work unit's artifacts, ROADMAP, and the
  Candidate and boundary records today. Three readers take it, each only under a delivery plan:
    - `classifyDeliveryTerminalDelta`, through `classifyGitDeliveryTerminalDelta` and `lib/delivery/repository-entry.ts`
      — a candidate-tail delete outside the group reads as non-lifecycle content;
    - `revalidateDeliveryLifecycleContribution`, from `lib/delivery/eligibility.ts`, `handlers/delivery-execution.ts`,
      and the review gate's pre-publication composition — it holds every group path to the protected base in each
      member, so in the group no member could carry the copy;
    - `compareNormalizedDeliveryTree`, through `compareGitNormalizedDeliveryTrees` (`lib/delivery/git-eligibility.ts`)
      and `lib/delivery/chain-containment.ts` — it reports a group path the base lacks as invented.

  No code knows the export path yet, and `seam-delivery-review`'s export adds nothing to the group, so the question is
  open: where a stacked delivery's design reaches review, given D18's "design artifacts reach review only through the
  export", and how its members, the group, and the candidate-tail delete treat the copy. Today a delivery's own design
  artifacts are already held to base in every member, so the question predates the export. Delivery stays paused until
  the follow-ons re-scope it. `storage-cutover` removes the group with its six consumers under register key 27, keeping
  only the `classifyPathTreatment` arm; if this answer lands first, the cutover carries its treatment through that
  removal.

- _Approach:_ settle the question when re-scoping delivery, before a stacked delivery runs after the flip, and read the
  two rows' Becomes with the copy evidence-neutral in `classifyPathTreatment` in every direction.

- _Captured during:_ `seam-delivery-review` draft-design, after adversarial pass 3's fix-check rounds, 2026-10-15.

---
