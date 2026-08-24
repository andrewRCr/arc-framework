# Notes: delivery-native-stack-composition

**Contents:** comparator/fingerprint distinction · applicability notions · Success Criterion 18 re-cut · member
checkout and recovery authority · authored partitions and adversarial attention · first adversarial pass amendments
· second adversarial pass amendments · guard-test digest history · consumed `integration-boundary-accuracy`
substrate

## Comparator vs plan-semantics fingerprinting

The contribution-proof comparator (`contribution-proof.ts` / `git-contribution-proof.ts`) and the plan-semantics
fingerprinting in `fingerprint.ts` are distinct concepts and must not conflate: the comparator proves content
equivalence of a carried member across predecessor movement; the fingerprint identifies plan-member semantics
across revisions. The arbiter swap replaces the former's fallback only — `fingerprint.ts` is untouched.

## Applicability: contribution equivalence versus path carry-forward

The review gate already owns an applicability notion. `applicability.ts`'s `classifyReviewApplicability` derives a
**path-based** proof — reviewed paths intersected with the change set's delta paths, yielding `carry` or
`incremental` — registered in the kernel registry under its own canonical domain. The projection this work unit
adds is a different notion wearing the same word: it decides whether head movement changed the **contribution**,
arbitrated over commits and trees, and it is what preserves a review across a mechanical restack. The path proof
cannot express that case, because a rebased commit touches exactly the same paths. Neither replaces the other and
neither should absorb the other's identity — the new projection takes its own name at its own surface.

## Success Criterion 18 — why it was re-cut

The criterion originally read "this work unit's own delivery is executed on this topology, and the run's ceremony is
measured against the pre-commitment budget with any overrun named." Both halves failed as acceptance evidence. The
measurement half named no metric, no instrument, and no consumer for the number, against a design whose own
non-goals exclude new observation records. The dogfooding half is unverifiable at every boundary the task plan owns,
because the evidence only arrives after the landing window closes. The replacement operationalizes the same Goal 8
from the built delivery path — decision count, absence of manual recut and synthetic reconciliation, and the
named-guard rule — which the task list's cross-member seam group already carried.

## Member checkouts and recovery authority

Delivery-member and gate checkouts are operation-local Git inputs, not ARC work-unit loci. The agent remains in the
originating checkout, whose ordinary session state and compaction-recovery seed remain authoritative. Review-gate
reads may resolve a member head back to its owning work unit through the delivery reverse lookup, but that lookup
does not install lifecycle artifacts, construct a second roster row, or lend the originating checkout's load set to
another checkout. This keeps delivery addressability separate from session identity and avoids adding recovery
machinery for a locus ARC never enters.

## Authored partitions and adversarial attention

A large whole-target adversarial pass may reuse stable boundaries the work already authored — delivery members,
review chunks, criteria groups, or an equivalent partition — to keep each reviewer's attention bounded. The advisory
shape is deliberately coarser than member count: at most two or three contract-closed groups, followed by a fresh
reviewer responsible for cross-group seams and aggregate union coverage. The composite remains one logical pass and
keeps the complete rubric.

This is a lightweight carrier in the central adversarial method, not a second chunking protocol. It does not satisfy
`review-chunking`, infer partitions, fan out 1:1 by member, persist state, add a CLI verb, or create another
interlock. The stronger bounded chunk-series carrier continues to own satisfying review chunking.

## First adversarial pass amendments

The first fresh-context whole-suite pass found ten source-verifiable gaps. The accepted forward amendments keep each
remedy inside existing substrate except for the one host mutation surface the terminal topology demonstrably needs:

- predecessor movement always invokes mechanical reapply; tree equality shortcuts only an unchanged predecessor;
- publication pushes refs, opens requests bottom-up, then optionally registers using the resulting request IDs;
- every shared change-request resolver caller supplies its own acceptable-base set to the pure classifier;
- review-only member ownership lookup does not create a member-checkout session or recovery locus;
- the criteria grammar distinguishes valid root criteria, silently inert two- or three-space indentation,
  four-or-more-space refusal, and root task-ID-like checkbox refusal;
- physical teardown retains exact member bindings until terminal proof, review settlement, and final retirement;
- gate checkout cleanup derives an exact ARC-owned path and validates path, ref or head, detached state, and
  cleanliness rather than discovering ownership by HEAD coincidence;
- ARC-issued provider mutations reserve before the call, while external refresh results are observed, proved, and
  version-check adopted without a fictitious reservation for unknowable heads;
- review applicability discovers older attempts through a bounded query over the existing lane-progress records,
  not a new ledger or index; and
- the highest-member branch deletion is the ordinary host-retarget trigger; only a failed automatic outcome exposes
  explicit `retarget` or `reopen-and-retarget` remedies, each followed by fresh observation.

## Second adversarial pass amendments

The second whole-suite pass found five source-verifiable gaps. Their accepted amendments close contracts already
promised by the design without adding a ledger, record family, provider abstraction, or another review authority:

- the acceptance language preserves the existing path-based applicability proof and prohibits only a duplicate
  contribution-equivalence projection or arbiter;
- terminal publication receives one distinct caller-authored ordinary title/body, validates it with the member
  presentations before mutation, and treats it as an operation input rather than persisted delivery state;
- content-neutral top adoption uses a dedicated in-core containment classification, because the shipped eligibility
  comparator establishes exact normalized equality rather than contribution containment;
- contribution applicability has a closed exact-coordinate result consumed by both request admission and discharge,
  with an explicit residual-delta Owner selection versioned onto the existing lane-progress attempt for replay; and
- candidate-ref cleanup authority comes from the ARC-reserved namespace, exact plan/member identity, and expected
  head, not historical creation provenance that the recordless cleanup design cannot establish.

## Member 6 lifecycle audit amendment

The bounded D5/D6 audit after repeated Member 6 adversarial passes found one shared planning failure rather than an
open-ended defect tail: Phase 6 had been sliced horizontally by primitive and surface, so no task or executable
scenario owned the complete refresh-adoption or semantic native-fallback transition. Local service, schema, handler,
and workflow assertions could all pass while production composition remained absent.

The forward correction keeps the provider/operator refresh external and unreserved, removes the fictitious
ARC-issued provider mutation, and reuses `rewrite/provider-adoption` only after exact observed heads exist to own
ARC's top absorption, publication, and final suffix-plus-top CAS. It also state-binds native selection and keeps
`native-stack-required` distinct from the `native-stale-suffix` refresh trigger. Member 6 closeout now requires
executable vertical lifecycle scenarios, including interruption boundaries, rather than accepting isolated
primitive and workflow-string coverage.

## Guard-test digest history

`delivery-terminal-workflow.test.ts` once pinned a whole-file sha256 over the workflow document. It was removed
because it froze a shared document (any unrelated edit broke the pin) and its reconstruction literal had gone
stale. That failure is the rationale behind the replacement-guard rule: structural assertions over the specific
contract (presence, uniqueness, ordering), never a digest over a shared document.

## Consumed `integration-boundary-accuracy` substrate

The design consumes the landed typed substrate rather than minting parallel reads: `arc review change-request
resolve` (member pull-request resolution / reverse lookup), `arc review status`, `arc base merge`,
`arc review merge-method resolve`, and the provider-neutral bounded wait — a stack-merge-API await is that wait's
natural third instantiation.
