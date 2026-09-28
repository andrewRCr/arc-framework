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
