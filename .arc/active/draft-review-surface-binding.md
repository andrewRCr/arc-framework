# Draft: review-surface-binding

- **Origin:** [internal] — surfaced 2026-07-21 during `review-architecture` verification (Task 8.1), when an
  adversarial pass found four typed review contracts shipped with zero production callers.
- **Purpose:** Bind the review contract layer to an invocable agent-facing surface. `review-architecture` delivered
  the routing reducer, gate contract, local receipt authority, and method-activation registry as typed, exhaustively
  tested libraries — and left three of the four without the adapter that lets anything call them. This work unit
  writes those adapters and completes the one success criterion its predecessor could not close.
- **Seeded, not groomed.** The inherited scope below is evidence captured at verification time, not a settled
  design. It needs a `--plan review-surface-binding` pass before formalization.

---

## Grooming status (continuity)

> _Updated each `--plan review-surface-binding` pass. This is the resume anchor._

- **Readiness:** `seeded` — scope is evidenced and bounded; no design authored yet. The open questions below are
  genuine forks, not detail.
- **Resolved:** nothing beyond the inherited scope. `Class` provisionally `Heavy` — derivation is low (the contracts
  are typed and settled) but the surface question (where local review verbs live, how an agent drives them without a
  resident orchestrator) is real design, and the CLI/launcher/workflow blast radius is moderate.

---

## Inherited scope — the four unwired contracts

Each item was confirmed at verification by a zero-non-test-importer check. Loci are exact as of
`review-architecture`'s head.

### 1. Local review channel has no invocable surface — closes the open success criterion

`review-architecture` success criterion 4 states that a project on the `local` channel satisfies
`independent-analysis/v1` with a local pass and an attested exact-head receipt, no hosted provider, and that the
local gate accepts it as satisfying evidence. The reducer does accept a `local-change-set` carrier on
`channel: "local"`, and the storage layer works against a real Git common directory. But
`hosts/local/receipt-store.ts`, `hosts/local/operation-state-store.ts`, `runtime/local-attestation.ts`, and
`core/local-carrier.ts` are each referenced only by their own definition and tests. No CLI verb, launcher entry, or
`review-gate:*` script reaches them, and `SELF_HOSTING_EXECUTABLE_OPERATIONS` gained no entry.

The consequence is that the shipped `coordinate-pr-review.md` names concrete commands for the hosted arm and, for
the local arm, instructs the agent to "submit only a complete clean or findings result to the exact-head attestor"
with no command that does so. Criterion 4 is marked unmet in `tasks-review-architecture.md` and points here.

### 2. WU rubric overlay is declared but never executed

`policy/assurance.ts` resolves a `Review Rubric` meta field into typed `absent | resolved | unavailable` state
through an injected `ReviewRubricAvailabilityPort`. The port has no production implementation and
`resolveWorkUnitReviewAssurance` has no production caller. The source records the deferral directly —
_"Availability seam; method discovery and registry binding stay in its adapter."_ That adapter was never written, so
a declared overlay cannot reach a reviewer. `create-spec` was never given the `Class`-scaled offer its predecessor's
spec described, and no shipped document mentions the field.

### 3. Method activation resolves but nothing consumes it

`lib/method-activation.ts` and `policy/activity.ts` implement the typed registry, effective resolution, and
diagnostics that are now the sole authority for method activation. Both production call sites in
`runtime/composition.ts` instead pass a literal `activity: { selfReview: true, frontlineReview: true }`. Harmless
for gate projection today — the projection reads neither field — but a malformed or missing project `active` value
produces a diagnostic nobody reads.

### 4. Routing-fact derivation is reachable only from the GitHub runtime

`policy/self-hosting/routing.ts` derives review risk, ownership, and surface authority from a change set plus an
exact-ref owner lookup. It is called only from the GitHub reconcile and attest runtimes. The framework CLI verb
`arc review frontline resolve` takes explicit facts by design — correctly, since deriving sensitivity and ownership
needs project policy the framework cannot have — so this is not a framework gap. It is an open question whether
projects should get a supported derivation path, or whether hand-composed facts are the intended steady state.

Verification fixed only the documentation half of this: both workflows previously said to compose "canonical change
facts", which named the wrong record, and every such invocation resolved `changeSetState: unknown` and the maximal
floor.

---

## Inherited design constraints

Carried from `review-architecture`'s settled design. These are boundaries, not preferences.

- **No resident orchestration engine.** Local review closes through one source-neutral
  route → request → launch → normalize → attest → reduce → response seam shared by work units and errands.
- **Separate authorities, shared primitive.** Local receipt evidence and non-evidentiary operation state stay in
  distinct authorities even though both reuse the same bounded-lock / atomic-publish primitive. Do not collapse
  them for convenience.
- **No new storage or configuration axis.** Machine-local continuity uses the existing storage-neutral operation-
  state port and Git-common-directory adapter, so it can later lift into the shared storage abstraction.
- **No generic provider registry.** The role and binding seam are stable; project overrides prove repeated provider
  shapes before ARC standardizes anything.
- **Agent ergonomics, not host guarantee.** Nothing added here becomes merge authority. Only a configured required
  host-side check structurally enforces merge safety, and that remains
  `review-gate-enforcement-promotion`'s to enable.

---

## Open questions

- **Where do local review verbs live?** Options include extending `arc review` with the full local cycle, adding
  `review-gate:*` scripts on the self-hosting side only, or splitting — framework verbs for the neutral cycle,
  project scripts for repository policy. The choice determines whether adopters get the local channel or only this
  repository does.
- **Should routing be a method after all?** The predecessor's spec titled its § 1 "`review-routing` method (new)";
  the implementation landed routing as CLI code and never minted the method, leaving `review-response.md` citing a
  method that does not exist until verification reworded it. If a method is the right home, it also gives the
  routing-facts record a documented surface, which it currently lacks entirely. Coordinate with the
  `method-conventions` capture on signature shape.
- **Does the rubric overlay need `create-spec` integration, or is a meta field enough?** The predecessor's spec
  described a `Class`-scaled offer at spec time. That may be more ceremony than the feature earns.
- **How much of this is one work unit?** The four items share a root cause but not a surface. The local channel
  (item 1) is the load-bearing one and could ship alone.

---

## Unknowns and assumptions

- Assumes the contracts themselves need no revision — verification found them exhaustively correct (a
  27,648-combination totality table, domain-separated identities with golden vectors, fail-closed fact parsing).
  If adapter work surfaces a contract defect, that reopens a shipped design.
- Unknown whether the local channel needs a distinct human-review entry or whether the agent-driven path suffices.
- Unknown how this interacts with `pr-decomposition`'s cumulative carrier, which may want the same launch seam.
