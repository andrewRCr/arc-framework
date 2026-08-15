# Draft: delivery-native-stack-composition — first-class native stack topology

- **Commitment:** Cohort member (`chunked-delivery`). A deliberate amendment to the v1 goals/non-goals shipped by
  `delivery-stack-topology` — not a cosmetic fix set. The v1 self-delivery completed on the v1 path; this member
  redesigns the topology that path exposed as wrong.
- **Purpose:** Make the provider stack chain itself — including its top code-bearing member — the delivery topology,
  delegate restack/refresh mechanics to the stack provider, and keep ARC's authority at plan intent, review and
  interlock gates, and exact-result validation at the landing instant.
- **Position:** Consolidates four 2026-08-13/14 field captures from the v1 self-delivery (terminal attachment
  resolution, first-class stack branches, projection refresh, native landing routing) into one coherent follow-up.
  Depends on `integration-boundary-accuracy`: that WU rewrites the integration seam this design composes with
  (`submit`/`propose` verbs, checkpoint/merge lifecycle), so drafting grooms against its settled spec and execution
  waits for its landed contracts.

---

## Problem — field evidence from the v1 self-delivery

The v1 design kept the work-unit branch as a separate authoring/control locus and treated provider stack branches as
disposable projections, with the substantive final member landing through a disconnected terminal PR outside the
native stack. Dogfooding (PRs #498–#502 + terminal #507) exposed the cost:

- **Synthetic ancestry reconciliation.** After the fifth member landed, absorbing `main` into the retained control
  branch produced 14 textual conflicts between equivalent content under two independently authored histories; the
  safe resolution was a content-neutral ancestry merge. A first-class top stack branch would already carry the
  predecessor ancestry.
- **Suffix rematerialization churn.** Every review fix forced suffix recuts; byte-level contribution fingerprints
  then refused mechanically rebased later members whose semantic patches were unchanged, requiring manual
  acknowledgement of members that had not really changed.
- **No refresh path when the base moves.** When `main` advanced mid-delivery, exact position observation became
  unavailable and rematerialization refused the moved base — the stack could not be re-anchored. The operational
  consequence was freezing `main` for the delivery's duration.
- **Native landing unrouted.** PR #498, registered as the bottom of a GitHub native stack, reached the ordinary
  singleton merge path, which failed opaquely; the real provider contract (asynchronous stack-merge API) was found by
  hand, and GitHub's rewrite of the remaining suffix then required manual equivalent-tree adoption per member.
- **Terminal attachment breaks after archival.** `with-integration` archival removes the active meta before the
  documented post-merge `arc delivery terminal attach`, which resolves its owner only via `resolveActiveWu()` —
  the ordinary invocation refused `work-unit-unavailable` and recovery needed a stale pre-archive tree.
- **Ceremony out of proportion.** Start of integration to terminal-member merge consumed over two attended days with
  nothing landing in parallel — versus the industry model where a stack lands in roughly its slowest single member's
  review time.

## External grounding (research synthesis, 2026-08-15)

Three-analyst survey of ghstack, spr, Sapling/ReviewStack, jj tooling, Graphite, GitHub native stacks, Gerrit, and
Meta/Google practice. Convergent findings:

1. **The top of a stack is always an ordinary peer PR.** No mainstream tool maintains a separate accumulating
   integration/control branch; that shape is a named trunk-based-development antipattern
   (["Integration Feature Branching"][integration-feature-branching]). Tools avoid needing one precisely by not
   attaching durable side-records to a stack-wide branch.
2. **Trunk is never frozen.** Reconciliation is tool-owned and cheap: GitHub native auto-retargets remaining members
   when a lower one merges and offers one-command cascading rebase ([`gh stack rebase`][github-stacked-prs-cli] /
   "Rebase stack") for external trunk movement; Graphite restacks on `gt sync`. Only genuine content conflicts stay
   attended.
3. **Landing is bottom-up, incremental, and non-blocking.** Each member lands the moment it is independently ready;
   the rest catch up mechanically. Whole-stack serialized landing appears nowhere.
4. **Change identity across rebases is structural, never byte-level.** Stable identity tokens (Gerrit Change-Id, jj
   change IDs, ghstack trailers, Graphite branch topology) plus structural equivalence: Gerrit reapplies the old
   patch onto the new parent and compares tree IDs (a ["trivial rebase"][gerrit-labels-trivial-rebase] keeps review
   votes); GitLab compares [`git patch-id`][gitlab-approvals-patch-id]; Graphite [has teams
   disable][graphite-github-config] GitHub's stale-approval dismissal and trusts its own mechanical restacks
   outright. Exact-SHA checks are universally reserved for the literal merge instant as a race guard
   (`--match-head-commit`, required checks on exact head) — a posture ARC already holds there.
5. **Bookkeeping is minimal and ephemeral.** No durable per-member proof or re-validation ledgers survive a landing;
   state is re-derived fresh from Git/host at each operation.

One v1 assumption upgrades from conservative to confirmed: GitHub's [current documentation][github-stacked-prs-merge]
states intermediate stack members cannot squash- or rebase-merge (identity tracking breaks); only the top member may.
The v1 notes had held merge-commit-only as unverified ARC policy pending primary-source evidence — that evidence now
exists.

## Design spine

1. **First-class top member.** Eliminate the retained control branch and the separate terminal request. Every
   code-bearing member joins the provider stack; the top stack PR is the ordinary terminal work-unit integration
   vehicle. Repository-materialized completion and archive contribution append to the top member. The owning WU's
   locus decouples from any single orthogonal control branch — either the top member satisfies that role or the WU
   owns several first-class authoring branches without minting per-branch work units or session identities.
2. **Bottom-up, non-blocking landing.** A member lands when it independently satisfies review and checks; ARC keeps
   its per-member review admission and interlock authority but drops whole-stack serialization. The protected base is
   never frozen for a delivery.
3. **Provider-delegated reconciliation.** ARC detects append-only target drift and emits the exact planned suffix
   plus safety and review-invalidation consequences; the stack provider or operator refreshes branches and requests;
   ARC reobserves the complete chain and adopts only when the projection exactly matches the plan. Interruption
   recovers to exact partial adoption. Conflicts, rewritten targets, and ambiguous provider movement refuse.
4. **Structural contribution identity.** The tree-equality fast path stays. The byte-identical aggregate-patch
   fallback is replaced by a structural equivalence check — reapply-and-compare-trees (the Gerrit trivial-rebase
   test) or stable patch identity ([`git patch-id --stable`][git-patch-id]) — so a mechanically rebased member is
   classified and
   reported as carried forward without being caller-selected, while any genuine contribution change still refuses
   closed. Exact-head pinning remains only at the merge instant.
5. **Native landing as the routed path.** Reobserve native registration before selecting the singleton arm; a linked
   stack routes through the native observe / select / prepare / submit / status lifecycle. The host adapter preserves
   a typed `native-stack-required` refusal from the ordinary merge endpoint, uses the
   [asynchronous stack-merge API][gh-stack-merge-api], and returns the complete settled suffix; every
   provider-retargeted member reconciles by structural equivalence
   before its new head is admitted to review. Native linkage stays provider-observed, never canonical plan authority.
6. **Bookkeeping posture.** Member and operation state stays ephemeral and version-checked; facts re-derive fresh
   from plan, Git, and host authorities at each operation. The cohort's no-second-ledger non-goals carry forward
   unchanged; this member adds no durable record family.

## Ceremony budget — pre-commitment

- The protected base is never frozen for a delivery, at any stage.
- Landing an N-member stack costs at most N landing decisions (or one contiguous-prefix decision) plus genuine
  content-conflict resolutions — no manual recuts, no per-member manual suffix adoption, no synthetic reconciliation
  merges.
- Total ceremony must not exceed what a team on Graphite or GitHub native stacks performs for the same topology;
  every ARC-added step must name the chartered failure it guards that the provider baseline does not.

## Hard external constraints

- **Merge-commit-only for intermediate members** — confirmed platform fact (see above); only the top member may
  squash or rebase. Compatible with ARC's merge-commit default; bounds any PR-title/commit-promotion policy to the
  top member.
- **GitHub native stacks are public preview**: subject to change, async merge with a disclosed residual race window
  (no full-set compare-and-set), auto-merge unsupported for stacked PRs, merge-queue support still rolling out,
  server-side "Rebase stack" produces unsigned commits, GHES unconfirmed. The v1 posture — provider-observed, never
  authoritative, with the complete unlinked provider-neutral path retained as default and degrade target — carries
  forward unchanged.
- **Merge-queue coordination is all-or-nothing.** Field-documented failure mode ([LLVM/Graphite][llvm-graphite-queue-rfc]):
  partial queue adoption with stacks causes infinite rebase/CI loops. The existing no-merge-queue exclusion stands;
  any future adoption must be universal, not optional.

## Amendment classification against v1

**Preserved:** the canonical plan/state contracts (`delivery-plan-record`), member review admission through the
delivery-member vehicle, eligibility gating at exact heads, exact-head integration authorization and merge locking,
lifecycle-artifact exclusion for non-final members, the complete unlinked sequential landing path, and the
host-idiomatic trust decision (exact-set validation is an ARC/operator property; the server pins the selected top
head; sequential unlinked landing remains the decline path).

**Removed:** the retained control branch and its projection, the disconnected terminal request, byte-identical
aggregate-patch identity as a refusal bar for mechanically carried members, and the whole-stack serialized landing
posture.

## Known implementation seams

- Contribution-proof fallback: `packages/arc-framework/src/lib/delivery/contribution-proof.ts` /
  `git-contribution-proof.ts` — replace the byte-aggregate comparator; keep tree-equality fast path. Distinct from
  the plan-semantics fingerprinting in `fingerprint.ts` — the two concepts must not conflate.
- Terminal attachment: `arc delivery terminal attach` resolves its owner via `resolveActiveWu()` over `.arc/active`,
  which `with-integration` archival has already emptied — consume an explicit retained identity or resolve the
  shipped archive safely; check the integration workflow's call order so the terminal identity survives exactly
  until attachment.
- Suffix reconciliation: the native reconciler models only the single next-member retarget; native landing rewrites
  the entire remaining suffix, so full-suffix observation and structural reconciliation must be part of the landing
  result.
- Frontline review of delivery members (`stale-target` recomposition refusal) is owned by an independent errand
  capture — coordinate, do not duplicate; that fix should land before this WU dogfoods its own delivery.

## Explicit non-goals

- No ARC-native rebase, restack, conflict-resolution, temporary-base, or provider submission machinery.
- No merge-queue integration.
- No generalized provider framework beyond the narrow operations this topology invokes; GitHub native stacks are the
  reference adapter, other providers sit behind the same capability boundary later.
- No new durable observation, assurance, proof, or audit records (cohort non-goals carry forward).
- No removal of the unlinked provider-neutral landing path or of ordinary WU closeout authority.
- No automatic resolution of genuine content conflicts — that step stays attended by design.
- No change to review, interlock, or integration authority semantics (composition with the landed
  `integration-boundary-accuracy` contracts, not a rewrite of them).

## Coordination

- `integration-boundary-accuracy` — recorded dependency: this design composes with its landed `submit`/`propose`
  verbs and checkpoint/merge lifecycle; reconcile against the shipped contracts at first session, not the pre-ship
  assumption.
- `delivery-review-cardinality` — unchanged; still demand-held on its own activation threshold.
- `review-source-authority` — owns the hosted-lane record-family census; this member adds no new records for that
  census to inherit.
- `decomposition-doctrine` / the `assess-boundary-fit` chassis — unchanged; delivery still owns the checkpoint
  chassis and its delivery arm.
- Errand-lane siblings (frontline delivery-member identity, eligibility-close read-only lock) — independent; the
  frontline fix precedes this WU's self-delivery.

## Disposition: `delivery-integration-target` retired

Retired at this stub's minting (2026-08-15). Its mechanism — accumulate members on a private target whose terminal
merge carries the whole contribution — is the accumulator shape the external survey identifies as the antipattern
this redesign removes, and its own activation threshold was never met (both field deliveries were stacks). This
redesign further shrinks its residual case: structural contribution identity removes the false stack-ineligibility
class, and provider-delegated refresh removes base-movement fragility. If a genuinely stack-ineligible concern ever
materializes, it routes first to decomposition or feature-flagged incremental landing; a private-target projection,
if still wanted then, gets a fresh design against the v2 substrate rather than this draft.

## Open design questions

- The multi-branch WU locus model: how one work unit owns several first-class authoring branches without per-branch
  session identities, and whether the top member fully absorbs the control role or a thinner retained identity is
  needed for attachment and closeout.
- Where repository-materialized completion and archive contribution append on the top member, and how the
  `with-integration` archival order changes so nothing the terminal merge needs is removed early.
- Refresh protocol depth: a minimal pre-landing refresh/adoption arm versus a fully resumable any-boundary protocol
  (compare during design; the capture's field evidence suggests base movement is routine, arguing for the latter).
- The exact structural-equivalence comparator (reapply-and-compare-trees vs. stable patch identity) and the shape of
  mechanical carry-forward evidence in reports.
- Whether registration should use the raw Stacks API only, given `gh stack link` porcelain performs mutations beyond
  the presentation-only carve-out.

---

[github-stacked-prs-merge]: https://docs.github.com/en/pull-requests/how-tos/merge-and-close-pull-requests/merging-stacked-pull-requests
[github-stacked-prs-cli]: https://docs.github.com/en/pull-requests/reference/stacked-prs-cli-commands
[gh-stack-merge-api]: https://github.github.com/gh-stack/reference/merge-api/
[gerrit-labels-trivial-rebase]: https://gerrit-review.googlesource.com/Documentation/config-labels.html
[gitlab-approvals-patch-id]: https://docs.gitlab.com/user/project/merge_requests/approvals/settings/
[git-patch-id]: https://git-scm.com/docs/git-patch-id
[graphite-github-config]: https://graphite.com/docs/github-configuration-guidelines
[llvm-graphite-queue-rfc]: https://discourse.llvm.org/t/rfc-enabling-graphite-merge-queue-to-resolve-infinite-loops-while-merging-stacked-prs/88769
[integration-feature-branching]: https://www.stevesmith.tech/blog/organisation-antipattern-integration-feature-branching/
