# Spec (`detailed` · `RFC`): delivery-native-stack-composition

- **Origin:** [internal]

- **Purpose:** Make the provider stack chain itself — including its top code-bearing member — the delivery
  topology, delegate restack and refresh mechanics to the stack provider, and keep ARC's authority at plan intent,
  review and interlock gates, and exact-result validation at the landing instant.

---

## Introduction / Context

ARC's v1 delivery topology shipped in `delivery-stack-topology` and was exercised end to end by its own
self-delivery (PRs #498–#502 plus terminal #507). That run completed, and in completing it established that the
topology is wrong in a way no amount of patching around the edges will fix.

V1 kept the work-unit branch as a separate authoring and control locus, treated provider stack branches as
disposable projections, and landed the substantive final member through a disconnected terminal pull request
outside the native stack. Six costs followed:

- **Synthetic ancestry reconciliation.** After the fifth member landed, absorbing the base into the retained
  control branch produced fourteen textual conflicts between equivalent content under two independently authored
  histories. The safe resolution was a content-neutral ancestry merge — work that exists only because the control
  branch never carried the predecessor ancestry.
- **Suffix rematerialization churn.** Every review fix forced a suffix recut, and byte-level contribution
  fingerprints then refused mechanically rebased later members whose semantic patches were unchanged, requiring
  manual acknowledgement of members that had not really changed.
- **No refresh path when the base moves.** When the base advanced mid-delivery, exact position observation became
  unavailable and rematerialization refused the moved base. The operational consequence was freezing the protected
  base for the delivery's duration.
- **Native landing unrouted.** The bottom member, registered as part of a GitHub native stack, reached the
  ordinary singleton merge path and failed opaquely. The real provider contract — an asynchronous stack-merge API —
  was found by hand, and the provider's rewrite of the remaining suffix then required manual equivalent-tree
  adoption per member.
- **Terminal attachment breaks after archival.** Archival removes the active meta before the documented post-merge
  terminal attach, which resolves its owner only through the active work unit; the ordinary invocation refused and
  recovery needed a stale pre-archive tree.
- **Ceremony out of proportion.** Start of integration to terminal-member merge consumed over two attended days
  with nothing landing in parallel, against an industry baseline where a stack lands in roughly its slowest single
  member's review time.

A three-analyst external survey (ghstack, spr, Sapling/ReviewStack, jj tooling, Graphite, GitHub native stacks,
Gerrit, and Meta/Google practice) found the divergence is not incidental. Five findings converge:

1. **The top of a stack is always an ordinary peer pull request.** No mainstream tool maintains a separate
   accumulating integration or control branch; that shape is a named trunk-based-development antipattern
   ([Integration Feature Branching][integration-feature-branching]). Tools avoid needing one precisely by not
   attaching durable side-records to a stack-wide branch.
2. **Trunk is never frozen.** Reconciliation is tool-owned and cheap: GitHub native auto-retargets remaining
   members when a lower one merges and offers one-command cascading rebase ([stacked-PR CLI][github-stacked-prs-cli]);
   Graphite restacks on sync. Only genuine content conflicts stay attended.
3. **Landing is bottom-up, incremental, and non-blocking.** Each member lands the moment it is independently
   ready; the rest catch up mechanically. Whole-stack serialized landing appears nowhere.
4. **Change identity across rebases is structural, never byte-level.** Gerrit reapplies the old patch onto the new
   parent and compares tree IDs — a [trivial rebase][gerrit-labels-trivial-rebase] keeps review votes; GitLab
   compares [`git patch-id`][gitlab-approvals-patch-id]; Graphite [has teams disable][graphite-github-config]
   GitHub's stale-approval dismissal and trusts its own mechanical restacks. Exact-SHA checks are universally
   reserved for the literal merge instant as a race guard — a posture ARC already holds there.
5. **Bookkeeping is minimal and ephemeral.** No durable per-member proof or re-validation ledger survives a
   landing; state is re-derived fresh from Git and host authorities at each operation.

One v1 assumption also upgrades from conservative to confirmed: GitHub's [current documentation][github-stacked-prs-merge]
states that intermediate stack members cannot be squash- or rebase-merged, because identity tracking breaks; only
the top member may. V1 had held merge-commit-only as unverified ARC policy pending primary-source evidence.

This work unit is therefore a deliberate amendment to the goals and non-goals `delivery-stack-topology` shipped,
not a cosmetic fix set. It consolidates the self-delivery's four field captures — terminal attachment resolution,
first-class stack branches, projection refresh, and native landing routing — into one coherent redesign, and
composes with the landed `integration-boundary-accuracy` contracts rather than reopening them.

The cohort's shared review baseline, non-goals, and hardening-admission boundary live in
`cohort-chunked-delivery.md` and apply unchanged.

## Goals

1. **The provider stack chain is the delivery topology.** Every code-bearing member, including the top, is a
   first-class ref in one ancestral chain. No retained control branch and no disconnected terminal request exist.
2. **The top member is the ordinary terminal work-unit integration vehicle.** Repository-materialized completion
   and archive contribution append where they already do, and the terminal ceremony is the ordinary
   `arc integrate checkpoint` → interlock → `arc integrate merge` flow.
3. **The protected base is never frozen for a delivery, at any stage.** External landings proceed with no awareness
   of an in-flight delivery, and external base movement never obligates an immediate refresh.
4. **Mechanically carried members are carried mechanically.** A member whose contribution is unchanged under a
   predecessor rewrite is admitted without attended acknowledgement, and its hosted review is preserved rather than
   re-spent — through the review-applicability projection this design owns (D8.6).
5. **Restack and refresh mechanics belong to the stack provider.** ARC detects drift, states consequences, adopts
   reobserved results on structural equivalence, and refuses ambiguity — it does not implement rebase machinery.
6. **Native landing is the routed path for a registered stack**, degrading to the complete unlinked
   provider-neutral path rather than failing.
7. **Verification meets the same boundary review does.** A target broad enough to require a delivery split gets
   per-member verification rather than one compromised whole-target pass.
8. **Total ceremony does not exceed the provider baseline.** Every ARC-added step names the chartered failure it
   guards that a team on Graphite or GitHub native stacks does not already guard.

## Non-Goals

_Frozen at activation; changes after that append: `Amended YYYY-MM-DD — <delta> — <prompt>`_

- No ARC-native rebase, restack, conflict-resolution, temporary-base, or provider submission machinery.
- No merge-queue integration. Partial queue adoption with stacks is a field-documented infinite-loop failure mode
  ([LLVM/Graphite][llvm-graphite-queue-rfc]); any future adoption must be universal, not optional.
- No generalized provider framework beyond the narrow operations this topology invokes. GitHub native stacks are
  the reference adapter; other providers sit behind the same capability boundary later.
- No new durable observation, assurance, proof, or audit records. The cohort's no-second-ledger non-goals carry
  forward unchanged.
- No removal of the unlinked provider-neutral landing path or of ordinary work-unit closeout authority.
- No automatic resolution of genuine content conflicts — that step stays attended by design.
- No change to review **obligation, applicability policy, findings, clearance, or lane-precedence** semantics.
  This composes with the landed `integration-boundary-accuracy` contracts rather than rewriting them. Two things
  are deliberately in scope and were widened from the draft's narrower phrasing, pre-activation, with the scope
  owner deciding in plain sight: delivery-member **addressability** — ARC's review-gate substrate cannot name a
  delivery member as a review subject, and D11 makes it able to — and review **applicability** across
  non-substantive head movement, which D8.6 owns. What a review means, when it is owed, and what discharges it are
  untouched; what changes is which subject a review can address, and whether an existing review still covers the
  current content. The draft's phrasing was set against a topology that did not yet include member-addressed
  review and would otherwise forbid substrate this design provably needs.
- No pre-implementation of the storage-evolution substrate: no off-branch artifact materialization, no notes
  re-keying, no session-anchor changes. The projection layer implements as-is on the tracked tier, the top stays
  unregistered under it, and convergence work routes to its owners.
- No structural carry-forward into the attestation lineage. The terminal delivery arm composes existing records;
  extending lineage-continuation semantics is a recorded reopening trigger, not part of this design.
- No aggregate hosted-review surface across members. That remains `delivery-review-cardinality`'s demand-held
  question.

## Proposed Design

### D1 — Topology: the originating branch is the first-class top member

A work unit begins ordinary: one branch, one worktree, artifacts in place. Stacking is adopted as a **transition**,
not a starting shape.

- **D1.1 Member cuts.** Member branches are authored filtered cuts below the originating branch, excluding
  lifecycle artifacts per the existing eligibility contract, published as first-class refs under the existing
  `refs/heads/delivery/{workUnitId}/{chunkKey}` namespace.
- **D1.2 Ancestry adoption.** The originating branch adopts the chain by an **append-only ancestry merge** of the
  highest member's head. This makes the member chain ancestral, so the top's diff against the highest member is
  exactly the residual — the terminal slice plus lifecycle artifacts — while the branch remains both the work
  unit's branch and the stack's top. Two merge semantics share the ancestry-merge name and must not be conflated.
  **Adoption** (here, and D4.5a's re-adoption after a recut) is **content-neutral**: it records ancestry and keeps
  the top's tree exactly, guarded by a subset check through the eligibility comparator's content-comparison
  machinery — the chain's contribution must be contained in the top's content, and a failed check refuses rather
  than merging. An ordinary content merge is the wrong instrument at adoption: merging equivalent content under
  independently authored histories is the v1 fourteen-conflict mechanism. **Absorption** (D5.2) is the genuine
  content merge, reserved for the case where the chain carries content the top lacks.
- **D1.3 Append-only invariant.** The rejected construction — rewriting the work-unit branch to a residual-only
  unique range — would force-push a pushed session branch, violating the append-only contract and orphaning
  SHA-keyed user notes. It is excluded by construction, not by discipline.
- **D1.4 Fixed designation.** "Top" is never a moving designation. A later member is carved from beneath the top
  and ancestry-merged the same way.
- **D1.5 Locus.** The work-unit locus is untouched — sessions resume as today, and non-stacked work units are
  unaffected. One addition only: a checkout of a member branch resolves its owning work unit through the delivery
  state's existing reverse-lookup contract, as a narrow fallback in the locus read, never a new roster authority.
- **D1.6 Terminal binding.** The terminal member binds at publish exactly like any other member — `ref`,
  `changeRequest`, and `coordinates` are populated when its pull request opens. This replaces the current
  materialization rule, where the terminal is deliberately left unbound
  (`packages/arc-framework/src/lib/delivery/materialization.ts` derives `ref: null` and `requestBaseRef: null` for
  the final index) and only binds post-merge.
- **D1.7 Terminal presentation.** The top pull request uses the ordinary work-unit pull-request template and the
  ordinary Conventional-Commits title, which `template-pull-request.md` already prescribes for the terminal member.
  The member presentation composer stays scoped to non-terminal members. Stack affiliation is conveyed
  structurally: the top's base ref is the highest member's branch, so the host displays the chain relationship and
  the residual delta directly — a signal v1's disconnected terminal request could not offer. No delivery-specific
  title convention is introduced, and none is this work unit's to introduce: `pull-request-surface-policy` owns
  pull-request title policy, including whether a readable work-unit slug belongs in ordinary and stacked titles.
  This design consumes whatever that work unit settles; it does not pre-empt it.
- **D1.8 Tracked-tier note.** Lifecycle artifacts riding the top branch is a tracked-tier detail, not a
  load-bearing contract. Work-unit identity stays decoupled from branch identity, and the materialized tiers carry
  no artifacts on any branch.

### D2 — Landing: bottom-up, windowed, gated incrementally

A member lands when it independently satisfies review and checks. ARC keeps per-member review admission and
interlock authority and drops whole-stack serialization.

- **D2.1 Windowed shape.** Members gate incrementally during execution (D7) while merges run in one post-publish
  window, bottom-up. The considered land-as-you-go alternative and its reopening trigger are recorded in the ADR
  (D10.2).
- **D2.2 Lifecycle mapping.** The shipped boundary is unchanged: whole-work-unit attestation (`arc attest`, over
  the top branch's union tree, composing the member-boundary evidence and the seam pass) precedes `arc publish` at
  the publication-step head. The publish push arm becomes push-members / register-stack / open-pull-requests
  bottom-up, with registration covering the non-terminal members per D6.3 and the terminal request opened in the
  same arm per D1.6. `Integrating` spans the landing window; the top member's merge is the terminal instant.
- **D2.3 Non-interference, both directions.** A registered delivery imposes zero coordination cost on work outside
  it, and external base movement never obligates an immediate refresh. The delivery absorbs drift on demand, at its
  own landing boundaries.
- **D2.4 Window-time mutation loop — inherited, extended, no new stops.** The shipped singleton integration flow
  already recomposes over head movement without an added interlock: an approved finding's `fix` settlement applies
  and verifies the change, commits and pushes it, recomposes the current target, and settles against the changed
  fix target — one structured approval covering the disposition set, the fixes, their commit, and the moved-head
  bookkeeping. The delivery window inherits that loop unchanged and extends its mechanical tail with four steps
  riding the same approval: suffix recut and re-adoption (D4.5a); the ancestry re-merge of the new highest head
  (D1.2's adoption form — the recut suffix is re-authored from top content, so the subset guard holds); the
  version-checked state rebind; and member-scope re-verification **scoped by the D4 arbiter's verdicts** — only a
  member whose contribution actually changed re-walks, and a tree-equal carried member re-verifies nothing. Tier 1
  gates re-run per the existing after-fix rule. The tail is typed-verb work — it composes through the
  rematerialization and reconcile services and their returned next actions (D10.3's dispatch-shape constraint),
  never a git-mechanics narration in prose. No step introduces an attended stop beyond the finding-disposition
  approval that triggered it.

### D3 — Terminal integration: a typed delivery arm of the checkpoint spine

The ancestry-merge construction (D1.2) plus merge-commit member landings advance the recomputed merge-base between
the top and the base through each landed member. The shipped currentness projection computes its candidate subject
against a fresh merge-base (`packages/arc-framework/src/lib/work-unit/git-candidate-subject.ts` resolves
`merge-base(head, baseBranch)`), so the top's freshly computed candidate at the terminal instant is the residual,
never the attested union — deterministically, drift or no drift. The union attestation therefore exists once **per
publication candidate** — recomposed mechanically through D2.4's loop when window movement produces a new
candidate, never re-derived by hand — and the terminal checkpoint gains a delivery arm.

The arm extends the shipped spine by composition, exactly as the native merge arm does. It never rewrites
attestation semantics.

- **D3.1 Terminal claim composition.** The arm composes the terminal claim from three existing records rather than
  the single-subject digest equality the singleton path uses: the attestation record, the delivery state's exact
  bound member heads, and a residual derivation composed from those two — the claim is that the attested union
  tree minus the exactly-bound landed members' contributions equals the top's terminal delta, compared as exact
  trees or contributions through the eligibility comparator's content-comparison machinery. The comparison
  referent is derived, never read from the plan: plan members are intent-only records carrying no tree or
  coordinates, and under D1.6 the terminal's content-bearing ref is the top itself, so a naive "compare against
  the plan's terminal member" resolves to intent or to self-reference. The v1 residual proof is that
  self-reference — it passes identical before/after coordinates into the comparator and trivially accepts — and
  it retires with D3.7's machinery; the arm's residual check is new composition, not inherited behavior.
- **D3.2 What it verifies.** Four checks: that the boundary's candidate is the delivery's currently bound
  publication candidate (D2.4's rebind refreshes the binding as the window moves); that every non-terminal member
  landed at its exact bound head; that the terminal residual carries no
  unexplained delta under D3.1's derivation — exact trees or contributions, per the cohort floor; and
  that the work-unit review obligation is discharged as the **conjunction of member reviews** (D8.2), not by the
  top's own review alone. The fourth check is load-bearing: the shipped composition derives its hosted-review
  requirement from exactly one target — the current branch's open change request — and under D1.6 that request is
  the top's, whose diff is the residual only. Left unchanged, the terminal boundary would clear the whole
  work-unit obligation on a review of a sliver. D8.3 excludes this by topology; this check is what excludes it in
  the composition that actually discharges the obligation.
- **D3.3 Base-target expectation.** Under this topology the top's base is legitimately a member branch while
  unlanded non-terminal members remain, and the configured base is required at the terminal instant. The
  enforcement point is **not** the checkpoint composition's own base equality: that check is unreachable, because
  change-request resolution refuses a mismatched base upstream and the composition throws before reaching it
  (D11.3). D11 owns the substrate change; this element owns only the expectation the delivery arm asserts.
- **D3.4 Top retarget: verify plus typed remedy.** The host retargets a dependent pull request to the merged
  request's base only when the merged head branch is deleted — and the deleting actor is ARC itself: the
  per-member teardown that removes a landed member's remote ref runs in the landing loop, so tearing down the
  highest non-terminal member deletes the branch the top's open pull request is based on. Two host outcomes exist
  and both are designed for: the automatic retarget, and the host closing the dependent request instead — the
  remedy set therefore carries reopen-and-retarget alongside retarget, keyed off the change-request resolution's
  `closed-unmerged` reading. Sequencing pre-empts the bad path: the highest non-terminal member's teardown defers
  until the top's base is observed retargeted to the protected base (or runs in the terminal tail), never fired
  blind in the landing loop. Which repository settings produce the automatic retarget stays the scheduled
  empirical question; the design covers both answers rather than betting on one. The arm observes the top's base
  at the terminal boundary and, when it is not the protected base, refuses with a typed refusal carrying the
  applicable guarded remedy. Retargeting a pull request's base rewrites no ref, so D1.3's append-only contract is
  untouched. Remedies are offered, never auto-applied, and the refusal is fail-closed.
- **D3.5 Unchanged guarantees.** Exact-head pinning, the integration interlock, and the refusal posture are
  unchanged.
- **D3.6 Window-time drift.** Drift absorbed by the top's predecessor merges is fail-closed at the same seam.
  Drift overlapping the residual's own paths re-fires member-scope verification for the terminal slice — the
  residual is the terminal member's scope under D7 — never whole-work-unit re-verification. Drift outside those
  paths reconciles as ordinary absorbed base movement.
- **D3.7 Retirement.** The absorption and terminal-attachment machinery retires with the disconnected terminal
  request it serves: `packages/arc-framework/src/lib/delivery/terminal.ts` in full, its `delivery terminal prepare`
  / `attach` verbs, and **both** workflow call sites — `deliver-stack.md`'s terminal-handoff section (which invokes
  `prepare`) and `integrate-work-unit.md`'s post-merge attachment step (which invokes `attach`). The guard test
  pins package/project parity over the attachment block, so both copies of each workflow change together. The
  archival-refusal defect the machinery carried is already fixed; it is removed because its subject no longer
  exists, not because it is broken.

### D4 — Structural contribution identity: reapply and compare trees

The tree-equality fast path stays. The byte-identical aggregate-patch fallback is replaced by one structural
arbiter — the Gerrit trivial-rebase test.

- **D4.1 The arbiter.** A single in-core three-way merge per member — merge base = old predecessor, ours = new
  predecessor, theirs = old member head, via `git merge-tree --write-tree --merge-base=<old-predecessor>` — with
  its result tree compared to the provider's new member tree.
- **D4.2 Verdicts.** Equal trees → carried forward mechanically, review standing preserved, context drift
  absorbed. A merge conflict during reapply → the contribution genuinely interacts with the base movement; refuse
  to attended resolution, since the failure mode is itself the detector. Unequal without conflict → the provider's
  result diverges from clean mechanical application; refuse with the exact divergent paths.
- **D4.3 Explicit merge base is required.** Auto-computed merge bases are wrong after provider rewrites, which is
  why `--merge-base` is not optional here.
- **D4.4 Capability handling composes with existing substrate.** The delivery lib already carries a cached
  `merge-tree --write-tree` capability probe and a typed `merge-tree-write-tree-unsupported` refusal
  (`packages/arc-framework/src/lib/delivery/from-branch.ts`), and the package already declares `engines.git >=2.45`
  — above the 2.40 floor `--merge-base` requires. Extend the existing probe's canary to exercise `--merge-base` and
  reuse the existing typed refusal. No new version floor, disclosure mechanism, or degrade path is authored. Reuse
  here is not a no-op: the probe is module-private and memoized per branch-inspection call rather than shared, and
  `merge-tree-write-tree-unsupported` belongs to `InspectDeliveryBranchRefusal`'s closed union, so the work is
  extracting the probe to a shared seam and widening a second closed union to carry the same reason.
- **D4.5 Result vocabulary.** `DeliveryContributionProofResult` grows to
  `proof: "tree-equality" | "mechanical-reapply"` with refusals carrying a closed reason and the exact conflicted
  or divergent paths. Six call sites currently collapse the result to a boolean and must propagate the path
  evidence into their own typed refusals: `suffix-reconciliation.ts` (three — post-observation reserve, reserved
  reconcile, and explicit rewrite), `suffix-rematerialization.ts` (one, which today flattens every verdict into
  the single reason `unselected-contribution-changed`), `landing.ts` (one), and `handlers/delivery-execution.ts`
  (one, in the `reconcile` verb's land-observation branch — an operator-visible surface that today returns a
  reason-free refusal). `native-landing.ts` declares a `proveContribution` dependency but delegates consumption to
  suffix reconciliation, and `terminal.ts`'s two sites need no update because D3.7 retires that file. One
  vocabulary, no new record family.
    - `landing.ts` needs more than propagation: its port declares its own narrowed
      `{ status: "accepted" } | { status: "refused" }` union, so the verdict is erased at the type boundary before
      the call site and the outer refusal carries no reason field. The richer result stays structurally assignable
      to the narrow port, so this drops silently rather than failing to compile. Widening that port and adding a
      refusal reason is part of the change, not a consequence of it.
- **D4.5a Suffix rematerialization survives, with one open interaction.** The recut path
  (`suffix-rematerialization.ts`, reached by `arc delivery rematerialize`) is the review-fix path and is neither
  retired by D3.7 nor listed in D4.6's retired substrate — it survives, with the top branch replacing the control
  branch as its authoring locus. Its `direct-delivery-ref` guard refuses any snapshot member whose ref is already
  under `refs/heads/delivery/`, which held when snapshots came from disposable candidate refs. That question is
  settled here, consistently with D9.4: v2 retains the authoring-candidate stage — materialization and recut both
  author from candidate refs before publishing into the delivery namespace — and authoring candidates stay
  outside `refs/heads/delivery/`, so the guard keeps discriminating exactly the case it was written for (it
  inspects the authoring candidate refs, not the persisted state refs; D1.1's first-class refs are the published
  members, never the candidates). **Each recut does add a
  further ancestry merge to the top**, and that is determined rather than open: D1.2's invariant is that the top's
  diff against the highest member is exactly the residual, so once a recut re-authors the suffix the top must
  ancestry-merge the new highest head or D3.2's residual check cannot pass. That cost is named in the ceremony
  budget's top-only list.
- **D4.6 Retired substrate.** The versioned aggregate-patch envelope (`encodeDeliveryContributionPatch` /
  `parseDeliveryContributionPatch`) and the `isLinearRange` precondition retire. A three-way reapply does not
  require linear ranges, and retaining the check would refuse a member that legitimately carries a merge.
- **D4.7 Rejected arbiter.** Stable patch identity ([`git patch-id --stable`][git-patch-id]) is rejected: it
  hashes context lines, so it false-refuses exactly the adjacent-edit case a busy trunk makes common — the v1
  failure mode with different bytes — and a pre-filter role buys nothing over the in-core merge while doubling the
  refusal vocabulary. Tree comparison ignores commit metadata, so the host's server-side "Rebase stack" producing
  unsigned commits cannot perturb equivalence.
- **D4.8 Evidence lifetime.** Carry-forward evidence is ephemeral operation output — per member, the verdict, old
  and new heads, and for refusals the exact conflicted or divergent paths — surfaced at adoption and recorded only
  as the state's updated current coordinates. No durable proof ledger. Exact-head pinning remains only at the merge
  instant.

### D5 — Provider-delegated reconciliation: demand-driven, window-scoped

- **D5.1 Division of labor.** ARC detects append-only target drift and emits the exact planned suffix plus safety
  and review-invalidation consequences. The stack provider or the operator refreshes the registered non-terminal
  suffix. ARC reobserves the complete chain and adopts only when the projection exactly matches the plan under D4.
- **D5.2 The top is never provider-restacked.** It absorbs predecessor movement by another append-only predecessor
  merge — the same base-merge doctrine pushed branches already follow. This is D1.2's **absorption** form: a
  genuine content merge, because a restacked chain carries base content the top lacks, with conflicts staying
  attended. The content-neutral adoption form is never used here — it would silently drop that base content and
  fail late at D3.2's residual check instead of early at the merge.
- **D5.3 Firing conditions.** The refresh arm fires on a refused landing (genuine conflict, native stale-suffix
  requirement, host up-to-date policy) or explicit operator choice — never on base movement alone. Append-only
  external drift that blocks nothing is disclosed, not acted on.
- **D5.4 Interruption safety.** Recovery reaches exact partial adoption by riding the existing one-active-operation
  state. Refresh is a guarded operation, not a second protocol family.
- **D5.5 Execution-time movement.** Base movement before materialization is ordinary work-unit base-merge
  territory; member-boundary verification evidence then follows the ordinary after-base-merge re-run rules.
- **D5.6 Refusals.** Conflicts, rewritten targets, and ambiguous provider movement refuse.

### D6 — Native registration and landing

- **D6.1 Routing.** Reobserve native registration before selecting the singleton arm. A linked stack routes through
  the native observe / select / prepare / submit / status lifecycle.
- **D6.2 Merge endpoint.** The ordinary endpoint is the shipped `arc integrate checkpoint` → interlock →
  `arc integrate merge` spine, with exact-head pin, in-verb lock release, bounded checks await, and merge-method
  revalidation. The native arm extends that spine: the host adapter **mints** a typed `native-stack-required`
  refusal from its merge attempt — today a stacked-member rejection collapses into an opaque `unavailable`, and the
  host mutation-result union (`queued | malformed | unavailable`) widens to carry the new arm, the same
  closed-union work D4.5 names for `landing.ts` — uses the [asynchronous stack-merge API][gh-stack-merge-api], and
  returns the complete settled suffix. Every provider-retargeted member reconciles by structural equivalence (D4)
  before its new head is admitted to review.
- **D6.3 Registration scope.** Registration is raw Stacks API only, over the **non-terminal member set**. The top
  chains natively as an ordinary pull request based on the highest member's branch — connected, presenting the
  residual delta — but stays outside the registered stack. No provider-side stack operation (host UI "Rebase
  stack", CLI stack rebase, native suffix rewrites) can touch the session branch: a structural guarantee rather
  than operator discipline. Those instruments stay fully usable over the registered set.
- **D6.3a ARC's own observation predicate is in scope.** The shipped host adapter counts a stack as `registered`
  only when the provider returns exactly as many pull requests as the requested member set, positionally matched.
  A superset listing does not read `partial`: with the chained top present, every requested member still matches
  at its index, only the cardinality check fails, and the empty affected set falls through to `unregistered` —
  which drives the link path to issue a fresh registration attempt and routes landing to the unlinked arm, with no
  `downgrade-required` surfacing anywhere. If the provider reports the chained top pull request as part of the
  stack, the delivery is therefore permanently and silently downgraded — Goal 6 lost without a refusal to see.
  Implementation must therefore settle the
  predicate alongside the registration call: the observation must exclude a dependent unregistered request from
  the comparison. Widening registration scope instead is not an available remedy — the only scope that removes the
  dependent request from the listing is registering the top, which D1.3 excludes by construction and the
  Alternatives section rejects categorically. If the filter is not achievable against the provider's actual
  response shape, the single fallback is the complete unlinked path, which stays correct — a degrade target, not a
  failure. This is a named design obligation, not an implementation detail.
- **D6.4 Registration floor.** Native registration requires at least two registered members, so it applies at three
  or more total members. A two-member delivery has one non-terminal member: the opt-out path routes unlinked, with
  the top chained as an ordinary dependent pull request. This is a stated boundary, not a degraded path — but an
  operator who opts in on a two-member delivery hits a hard stop rather than an unlinked route, and there are
  **two** floors to reclassify, not one. The request schema rejects a sub-two member array at parse time, so the
  CLI refuses before the service guard is reached; the service guard then refuses independently. Reclassifying only
  the service guard leaves the operator's stop exactly where it is. Both must degrade to unlinked, and the floor's
  refusal must be distinguishable from the malformed-member refusal that currently shares its reason code.
- **D6.5 The tax, named.** The top forfeits stack-UI membership and native retarget machinery, relying on the
  guarded retarget of D3.4 at the final landing. This is tracked-tier substrate cost, retired at convergence.
- **D6.6 Porcelain is excluded.** The API's chained-or-`422` precondition is ARC's own fail-closed refusal
  expressed host-side. The `gh stack link` porcelain pushes branch arguments, creates missing pull requests, and
  auto-corrects mismatched bases — silent repair of exactly the topology mismatch ARC must surface — and its error
  layer masks API rejection reasons. The shipped adapter already conforms by calling the raw endpoint. The
  porcelain and the host UI remain legitimate operator-side refresh instruments over the registered set; ARC adopts
  their results through reobservation and structural equivalence, never as registration or authority.
- **D6.7 Full-suffix reconciliation.** The native reconciler currently models only the single next-member retarget.
  Native landing rewrites the entire remaining suffix, so full-suffix observation and structural reconciliation
  become part of the landing result.
- **D6.8 Merge-method validation becomes stack-aware.** `arc review merge-method resolve` reads repository-level
  allowances while the platform holds intermediate members to merge commits; only the top member is free. The
  disclosed host-evidence residuals (branch-scoped rules unread, absent-versus-unconfigured required checks) are
  external couplings, not this work unit's scope.
- **D6.9 Linkage is observed, never canonical.** Native linkage stays provider-observed and is never plan
  authority.
- **D6.10 Registration states its own consequence.** Registration is already operator-opt-in and makes zero host
  calls when declined — concretely, the opt-in is the `optIn` field on the native-link request (no CLI flag or
  config key exists), so the consequence disclosure below lands at the decision point in the workflow prose that
  composes that request — with the disclosure text itself precomposed CLI-side on the native-link surface per the
  `recommended*Text` pattern, rendered by prose, never templated in it.
  Because the native arms rewrite the remaining suffix while the unlinked path only retargets (D8.6), the
  registration decision is where review-invalidation cost is incurred, so it carries that consequence
  at the decision point — the same posture D5.1 already commits to for drift decisions, applied at one more point
  rather than new mechanism. No capability gate: registration is not blocked on anything. What native buys, now
  that D4's arbiter automates the manual equivalent-tree adoption that made v1's native landing expensive, is the
  `linked-atomic` arm's single landing decision for the whole remaining set plus the reviewer-facing stack UI —
  narrower than it looked, and worth stating so the choice is informed. Unlinked remains the zero-churn default,
  with one limit named: it is immune to provider-initiated rewrite, not to rewrite generally, so under strict
  up-to-date branch protection forced refreshes rewrite heads on either arm and D8.6's projection is the only
  answer.

### D7 — Member-boundary verification

If a target's breadth already forced a review and delivery split, one whole-target verification pass is
compromised for the same reason. The field evidence is `integration-boundary-accuracy`'s four
verify → adversarial-gap → remediate cycles, each opened by a clean primary self-verify.

- **D7.1 No early materialization needed.** With task order following member order, the working tree at member k's
  completion boundary _is_ member k's cumulative tree. That premise is enforced, not assumed: plan validation
  refuses a plan whose member task ranges interleave or depart from member order — an authoring-time check
  extending the shipped inventory, which validates assignment but not order today.
- **D7.2 The mechanism.** Each member's task range closes with a validation task that fires `validate-criteria`
  (D7.6) at member scope: the member's criteria slice, its bounded diff, and reachability over the cumulative tree.
  Evidence lands as ordinary task completion. The whole-work-unit closeout pass narrows to cross-member seams and
  union coherence, dispositioning the member groups from that recorded evidence rather than re-deriving them.
- **D7.2a The task shape is constrained by the shipped inventory, not chosen.** The member closing task is an
  **ordinary implementation parent task**, carrying a goal like any other and assigned to its member in the
  coverage table. It cannot be a second verification task: the delivery task inventory requires the final phase to
  be titled `Verification` and refuses `verification-task-ambiguous` on any count other than exactly one parent
  after it (zero included), while coverage treats `verification-task-assigned` as blocking. So the terminal
  contract is untouched — exactly one verification task, terminal, unassigned to any member — and member
  validation adds **no new phases**. Members
  bind per task (`memberTaskIds`), never per phase, so a member spanning several phases simply closes in the last
  one its range reaches.
- **D7.3 Criteria slices are task-list structure with one authority.** The Success Criteria section groups by
  member under plain `###` subheadings, plus one cross-member seam group carrying the standard items. Each member's
  closing task walks its group; the closeout pass walks the seams. Assignment follows "the earliest boundary whose
  validator can see the evidence", with criteria no member boundary can see defaulting to the seam group. A
  single-deliverable work unit has one group, which renders as today's flat list.
    - **Grouping form is constrained by the scanner.** `###` subheadings are safe: the section-heading pattern
      matches `##` followed by whitespace, so a `###` does not terminate the section, and a plain `###` without a
      checkbox is neither a parent task nor a section boundary — structurally inert. **Criteria must stay at root
      indent**, and the failure modes are asymmetric: a checkbox bullet indented four-plus spaces inside the
      section hard-refuses the **whole task list** as malformed (a subtask marker with no open parent), which the
      delivery inventory then refuses wholesale; a two-to-three-space indent parses as inert content and silently
      drops out of the walk; and a root-indent criterion whose text begins with a task-id-like token refuses at
      root level. The grouped-criteria grammar D7.5 writes into the strategy and template states all three.
      Headings group; indentation must not.
- **D7.3a Marking time is unchanged.** Success criteria are still marked only during the verification phase, never
  during implementation. What moves to the member boundary is the **walk** — the bounded diff and reachability
  check over a tree small enough to hold, which is what a whole-target pass compromises — not the mark. A criterion
  is an outcome-level claim about the work unit: a member boundary can gather its evidence but cannot know whether
  a later member regresses it, and terminal marking also lets a criterion superseded by a late design decision take
  `[~]` once, with the whole picture visible. The shipped convention and the archive gate are untouched.
- **D7.4 No second authority.** The delivery plan's coverage table keeps binding tasks and design elements only; it
  never carries criterion content.
- **D7.5 Ship surface.** The Success Criteria section is specified today as a flat list — one verifiable criterion
  per Scope "Will Do" item — so D7.3's grouping, plus the `validate-criteria` extraction, changes these, each in
  both the package source and the project copy:
    - `strategy-task-list-formatting.md` § Success Criteria Section — the flat-list specification;
    - `strategy-work-organization.md`'s task-list invariance clause, which currently declares the Success Criteria
      section's shape fixed and would otherwise forbid the grouping outright;
    - `template-tasks.md` — the Success Criteria block;
    - the task-generation workflow — what it emits, its pre-save format checklist, and authoring the member closing
      tasks alongside the delivery plan it already derives;
    - the work-unit verification workflow — firing `validate-criteria` at work-unit scope, and its opening sentence
      binding the terminal verification task, which must now also admit member-scope fire points without making
      them that task;
    - `process-task-loop.md` — declaring `validate-criteria` so the member closing task's fire-point loads;
    - `clean-work-unit.md`'s section preserve list, which names `Success Criteria` but not member subgroups, while
      its triage step affirmatively enumerates `###` headings as per-heading decision units — member subgroups are
      not merely unlisted but squarely in scope for non-standard-section removal triage;
    - `init-recipe.json` — the new method's `include_files` entry. Without it the method ships nowhere; ten
      workflow and method files are already in exactly that state (an eleventh ships only under a `pm.mode`
      condition).
  **`docs/` is explicitly out of scope.** Its task-list reference documents the flat form and is single-copy, but
  that surface is frozen pending its own deliberate overhaul and is not touched here.
- **D7.6 `validate-criteria` — one method, two fire points.** The walk is extracted from the verification
  workflow into a `validate-criteria` method taking its scope as an input. The work-unit verification workflow
  declares and fires it at work-unit scope; `process-task-loop.md` declares it and the member closing task is its
  fire-point at member scope. Two consequences: a member task never loads a work-unit-scoped workflow to verify one
  slice — the semantics are exact at both fire points — and scope becomes a **parameter rather than a prose
  branch**, so no conditional control flow is added to workflow prose. A sibling `verify-deliverable` workflow is
  rejected: it would duplicate judgment prose that the fragment substrate and agenda compiler exist to eliminate,
  and add a loadable surface with its own recipe and reachability obligations.
    - **Reachability must be hand-verified.** A declared method loads at its fire-point, and the corpus audit
      cannot distinguish a marked fire-point from a missing one — a method a workflow needs but never marks
      silently never loads. Both fire points are verified by hand, not assumed.
- **D7.7 MVP as procedure.** No new record family and no typed verification store. This work unit owns the
  invocation topology — member boundaries, the grouped-criteria shape, and firing cadence — and, because that shape
  is itself a planning-time authoring form, it owns the delivery-member case of that form while
  `planning-iteration-mechanics` owns the general criterion-authoring form. The two must land compatibly rather
  than each defining a Success Criteria grammar; if `planning-iteration-mechanics` reaches the grammar first, this
  work unit consumes it and contributes only the member/seam grouping. Instrument upgrades refine the seam without
  reshaping it and live with their owning work units: `verification-falsification-contract` owns the verification
  instrument's falsification quality, and the criteria-reachability lint has no owner yet — it is captured for
  routing, not assumed to exist.

### D8 — Hosted-review reservation fans out per member

- **D8.1 Fan-out.** A hosted-first standard reservation carried across `arc publish` resumes per member through the
  delivery-member vehicle: each member pull request receives the reserved hosted source's review at its exact head.
  Fan-out is target multiplicity, not concurrency — reviews run bottom-up as members become ready, typically one
  at a time. The substrate change is named, not implied: the reservation record keeps what it carries today — the
  obligation and the ordered sources — while its single pinned target becomes vehicle-typed (a pinned head for the
  singleton case, a delivery marker here). Member targets **derive fresh from the delivery state's bound members
  at each discharge read** (the consult D11.4 names), never stored as a target list and never walked by a mutating
  pointer — facts re-derive per D9.1. The discharge projection gains an iterate-and-conjoin mode over those
  derived targets, each evaluated against its own bound head and span. Per-member **readiness** admission shipped
  with v1 — the delivery-member vehicle and head-keyed member lookup. The hosted-**request** path is rework, named
  at the usual granularity: it carries three current-checkout bindings that each refuse a member request today —
  local-review-target head equality, change-request resolution against the configured base (D11.3's subject), and
  the reservation-admission guard binding the Candidate's head, which is the top, not the member — and its
  vehicle and reservation arms are disjoint (the vehicle arm never reads the carried reservation; the reservation
  arm takes no vehicle). The delivery-member arm therefore composes against the carried reservation, and the
  Candidate-head binding becomes vehicle-typed alongside the target resolution above.
- **D8.2 Discharge.** The work-unit obligation discharges as the conjunction of member reviews — the same reviews
  the delivery's per-member admission already requires. One review system, not two.
- **D8.3 Excluded by construction.** No pull request presents the union delta in a stack, so a top-only resumption
  would review a sliver while claiming the work unit. A member review claims member scope only, and **no clearance
  is derived from any single member review**. Whole-work-unit discharge is derived from the complete set, as the
  conjunction D8.2 defines and D3.2's fourth check verifies — the exclusion is of the sliver, not of the set.
- **D8.4 Seam coverage.** Cross-member seams stay covered by D7's substrate and the chunked local lane's seam
  doctrine where it runs.
- **D8.5 Ordering.** The ordering rule fans out with the reservation: the reserved source may not be leapfrogged by
  a lower-ranked carrier on any member merely because its pull request now exists. Enforcement is per member at
  request time through the existing driver check, made member-aware by D8.1's vehicle-typed target resolution — no
  new mechanism.
- **D8.6 Applicability across non-substantive head movement — owned here.** The fan-out above only holds if a
  member's review survives the head movement this topology causes. Today it does not, and the rule is sharp:
  **rewrite destroys applicability, retarget preserves it.** Discharge reads a settled attempt anywhere in the
  span `rev-list <base>..<approvedHead>`; a rewritten head drops its reviewed commits out of that span, while a
  retargeted pull request keeps its head and stays in span.
    - **Why delivery owns it.** A native landing rewrites the entire remaining suffix, so every landing would void
      the clean reviews of every remaining member — roughly N²/2 hosted passes for an N-member stack, against a
      provider baseline that does not re-review mechanical restacks at all. But the concern is not
      delivery-specific: an ordinary work-unit pull request whose head moved after a clean review because a base
      merge landed separately-reviewed content wastes a metered pass for the same reason. That ordinary case is
      the simpler instance of one projection. This work unit owns it because the decision at its centre — the
      equivalence arbiter — is one delivery holds the evidence for: patch equality false-refuses the mechanically
      rebased commit whose semantic patch is unchanged (D4.7), which is the v1 field failure with different bytes,
      and D4's in-core reapply is the right arbiter and is being built here regardless.
    - **Shape.** A typed projection consulted before any re-review request, mechanically separating base movement,
      equivalent reviewed commits, and the exact uncovered delta. It preserves a review automatically only on
      equivalence proved by D4's arbiter; where a residual delta remains it surfaces that bounded delta for an
      Owner applicability decision before provider capacity is spent. Comparison and classification live in typed
      CLI verbs and workflows dispatch on the typed result — no Git-diff inference in prose, and no agent is asked
      to claim that arbitrary changes are semantically equivalent.
    - **Append-only asymmetry, and where it fails.** The top absorbs predecessor movement by merge (D1.2, D5.2),
      so its reviewed heads stay ancestors and stay in span — a second reason the append-only construction is
      load-bearing beyond D1.3's user-notes contract. This holds for the reservation's **first source only**. The
      discharge loop consults the exact current head when deciding whether an earlier source was safely
      unavailable, so a reservation that discharged through a fallback source after a rate-limited first source
      re-voids on the next append-only merge — even though the fallback's clean attempt remains in span. The top
      moves once per predecessor absorption, so this recurs across the window. The projection covers append-only
      movement for that case, not rewrite alone — and its insertion point is therefore the **discharge read
      itself**, not only the request path: the safely-unavailable determination consults attempts at the exact
      current head alone, so the projection's result must reach that read, keeping an unavailability recorded at a
      prior equivalent or still-in-span head from voiding on movement. A projection gating only re-review requests
      would leave the discharge status re-voiding regardless.
    - **Scope discipline.** Owning this projection does not make delivery the owner of review architecture. It
      owns **applicability** — whether an existing review still covers the current content. Obligation, findings,
      clearance, and lane precedence are untouched.

### D9 — Bookkeeping: ephemeral state and completed-record retirement

- **D9.1 Posture unchanged.** Member and operation state stays ephemeral and version-checked; facts re-derive fresh
  from plan, Git, and host authorities at each operation. This design adds no durable record family.
- **D9.2 Observed residue.** After the first live integration, the delivery store still held two canonical plan
  records and one bound state record for shipped, unoccupied work units. The store exposes publish / enumerate /
  read / reverse-lookup only, so global member reverse lookup keeps treating historical heads as live delivery
  authority, and a reopened same-slug work unit rediscovers the old plan.
- **D9.3 Retirement operation.** One idempotent, version-checked retirement operation, run after terminal adoption
  and ordinary work-unit closeout, deletes the completed bound plan and state pair — plus any orphan plan with no
  state belonging to the same work unit — from the store. No archive namespace: that would be a durable record
  family the non-goals exclude, and pre-release posture clears development state rather than migrating it. The
  operation refuses while an operation, an **unreaped member ref** — local or remote, both counted (D9.4) — or an
  unsettled terminal remains. The verb binds an **explicit work-unit identity** as input, never resolved through
  the active work unit — after archival no active meta exists, and that resolution shape is the exact defect the
  v1 terminal attach shipped. Its fire-point is the teardown/closeout ceremony that owns D9.4's reaping:
  retirement's refusal conditions are reaping's postconditions, so the two run as one tail.
- **D9.4 Residue reaping — this design is the replacement, so it names the driver.** The v1 self-delivery left six
  candidate refs and six delivery-gate worktrees with no cleanup driver, hand-reaped once. That deferral is not
  restated here: v2 retains an authoring stage that materializes candidate refs and gate checkouts (D4.5a turns on
  the same fact), so reaping them is in scope. Today publication pushes `<sha>:refs/heads/delivery/…` directly and
  creates no local branch, so the shipped remote-only teardown leaves no delivery-namespace ref behind — the v1
  residue was the authoring candidate branches and gate worktrees themselves. Under D1.1's first-class member
  branches the local side becomes real, so teardown reaps both sides plus the authoring candidate refs and any
  gate checkouts it created. D9.3's refusal reads
  "member ref" as either side, so retirement cannot complete over unreaped local residue.

### D10 — Doctrine surfaces

- **D10.1 A new integration strategy.** The posture is adopter-facing doctrine with no existing home:
  `strategy-work-organization` owns concern boundaries and vocabulary, and `strategy-concurrent-work` owns running
  several work units at once and merge ordering _between_ them. Neither owns one work unit's journey from a
  verified candidate to landed work on the protected base. Mint `strategy-integration.md` under
  `reference/strategies/arc/` with a deliberately bounded charter:
    - **Owns:** the publication boundary and its attestation; delivery topology and landing posture — members,
      order, and window; review admission at exact heads; the integration interlock and terminal merge; and the
      post-landing closeout hand-back.
    - **Does not own:** which concerns become which work units (`strategy-work-organization`); running several work
      units at once and merge ordering between them (`strategy-concurrent-work`); review obligation, finding, and
      clearance semantics (the review contracts); or quality-gate tiers (`strategy-quality-gates`).
    - **Initial content is the charter plus this work unit's posture only** — deliberately partial, sized to grow
      as the integration architecture settles rather than to be complete now.
    - **Ship mechanics** — all four are required or the file reaches nobody: author at
      `packages/arc-framework/arc/reference/strategies/arc/strategy-integration.md`; add the path to
      `init-recipe.json` `include_files`; sync to `.arc/`; and add a firing-condition entry to `STRATEGY-INDEX.md`
      in both copies.
- **D10.2 One ADR.** The delivery-and-review posture is canonical, not work-unit-local: agentic review is the
  primary review lane, with human review complementing it — as a separate lane where teams run one, or as triage
  and authority over agent-review dispositions — and landing is windowed. One ADR, not two: the windowed-landing
  decision is a consequence of the review-lane posture rather than an independent decision with its own
  alternatives, and splitting them would leave each needing the other's Context. It records:
    - the considered land-as-you-go alternative (the industry norm) and the named reasons for the narrow
      divergence — amendment freedom until the window (a landed member refuses re-description, converting routine
      plan amendment into public fix-forward), agent-reviewer latency in minutes removing the pipelining payoff
      that motivates early landing, restack-triggered re-review churn across open member pull requests, and the
      native stack machinery's current maturity;
    - the reopening trigger: field use showing late-batched hosted review producing rework that boundary-time
      landing would have prevented;
    - the second reopening trigger, for terminal authorization: field evidence that residual-overlap
      re-verification or the delivery-arm composition dominates window ceremony, which would reopen extending
      structural carry-forward into the attestation lineage as a deliberate authority-semantics amendment;
    - the raw-Stacks-API registration decision (D6.6) as a worked instance of the same stance — typed fail-closed
      host surfaces over silently-repairing porcelain — rather than its own record.
- **D10.3 Workflow prose.** `deliver-stack.md` re-authors its terminal-handoff section around D3, its
  materialize / publish sections around D1 and D2.2, its landing-loop teardown step around D3.4's sequencing (the
  highest non-terminal member's teardown defers behind the observed top retarget), and its member-review section
  around D8 — driving the
  carried hosted reservation per member through the delivery-member vehicle and the same typed request / await /
  settle driver; today that section never mentions the reservation. `integrate-work-unit.md` drops the post-merge
  terminal attachment step per D3.7, and its reservation loop — today's only reservation-driving prose, and
  singular — becomes delivery-aware: per-member requests during the window, with the conjunction read at the
  terminal boundary supplied by D11.4's typed discharge, never derived in prose. All new and re-authored prose
  stays dispatch-shaped per the existing posture (the CLI's returned next action selects the member; prose
  implements no loop), and D2.4's mechanical tail composes through the existing rematerialization and reconcile
  services and their returned next actions rather than narrating git mechanics. Both are shipped workflows, so
  each changes in the package source and the project copy together. The task-generation and work-unit-verification
  workflows change under D7.5.
- **D10.4 Guard tests.** The terminal-workflow guard test retains eleven structural assertions over the
  terminal-attachment block; they will fail by name when D3.7 removes the disconnected terminal request — the
  intended signal. Retire or rewrite them deliberately. Any replacement guard is structural assertions over the
  specific contract (presence, uniqueness, ordering relative to merge confirmation and close), never a digest over
  a shared document.

### D11 — Delivery-aware review-gate resolution

Two failures share one cause: ARC's review-gate substrate cannot name a delivery member as a review subject, and
cannot resolve a change request whose base is a member branch. Both are ARC-internal bookkeeping. Nothing changes
provider-side — a member pull request is an ordinary pull request, reviewed like any other.

- **D11.1 Member → work unit resolves through the delivery reverse lookup.** Branch-to-work-unit resolution today
  returns `null` for any `delivery/`-prefixed branch, which blocks review status on a member head. It is replaced
  by the delivery state's reverse lookup — the same narrow fallback D1.5 already introduces, so this composes with
  substrate this design already carries. **Never a branch-name prefix test:** written as a prefix test it rots at
  convergence, where work-unit identity decouples from branch identity; written as a reverse lookup it survives
  intact.
- **D11.2 The hosted request vehicle gains a delivery-member arm.** The scope is named honestly: the request
  vehicle today is a single kind-tagged `errand` schema on an optional field — not yet a union — with
  errand-specific binding validation inline in the request path, so this arm converts the field to a discriminated
  union and extracts that binding per arm. Two sibling vehicle unions already carry `delivery-member` arms (the
  readiness vehicle and the operation-state vehicle), and the head-keyed member admission machinery shipped with
  v1 — the work is aligning the request vehicle with those, not minting a fourth notion. The arm names plan,
  deliverable, and exact head — projection-neutral, so storage evolution does not touch it.
- **D11.3 Change-request resolution becomes delivery-aware.** Resolution filters candidates by base equality and
  returns `base-mismatch` for a member-branch base, and the callers throw before their own base checks execute.
  Since D1.6 makes a member-branch base the top's normal state for the whole landing window, the terminal spine
  cannot resolve the top's request at all today. The fix lands in the shared primitive rather than bypassing it
  for delivery: bypassing would leave review status broken on the top branch throughout the window and leave every
  other consumer refusing, which is a special case to maintain forever.
- **D11.4 Discharge consults the delivery's member targets** rather than only the current branch's single open
  request — the input D3.2's fourth check requires, and the derivation seam D8.1 builds on: targets derive from
  the bound members at read time, never from a stored list.
- **D11.5 Nothing provider-side changes.** The entire change is which subject a review addresses, internally.

### Substrate seam — why full native composition waits

The design composes with the native-stack idiom everywhere except one layer, and the divergence is
substrate-caused, not doctrinal. Two ARC contracts force it:

- **Lifecycle artifacts ride the work unit's code history** (tracked tier, arc-in-git). Task-list updates ride task
  commits and ceremony commits interleave with code, so a member cut from the real history would carry active
  lifecycle content, and landing it would ship a partial work unit's live artifacts to the base — the
  session-perturbation the cohort floor forbids. This is what forces members to be filtered reconstructions rather
  than interior refs, and with them the transition construction, the eligibility filtering, and the ancestry merge.
- **The pushed work-unit branch is append-only** (SHA-keyed user notes, multi-machine sync). Idiomatic stacks
  rewrite branches freely; ARC's session substrate cannot survive a rewrite of the top, which is why the top is
  excluded from provider restack and registration.

The projection layer those contracts require — member filtering and reconstruction, the lifecycle-exclusion
eligibility path, the ancestry-merge transition, registration scoping, and top protection — is **substrate tax,
deliberately separable**. The plan and state schema stay projection-neutral per the cohort contract, so nothing
durable bakes the tracked-tier shape in. Under the storage-evolution endpoint — operational state materializes
without branches carrying it, and work-unit identity and session anchoring decouple from branch and SHA identity —
both causes dissolve: members become interior refs, the full stack registers including the top, provider restack
works end to end, and the projection layer retires.

Two elements are survivors, not tax, and convergence must not dismantle them:

- the delivery-typed terminal authorization (D3), because the merge-base advance that collapses the terminal
  subject is intrinsic to ancestral members landing as merge commits — exactly the interior-ref shape — not a
  tracked-tier artifact; and
- member-boundary verification (D7), which is substrate-independent task and criteria structure.

To keep the retirement a bounded swap, **member materialization is one narrow seam**: the tracked-tier filtering
implements behind a single member-materialization boundary, so convergence replaces the materializer while the
delivery protocol above it stands. The convergence obligation routes to the storage-evolution consumers at
planning close. The surviving contracts — structural identity, registration, landing, refresh, terminal
authorization, member-boundary verification — carry over unchanged.

### Delivery shape — candidate, unbound

The boundary read returns **stays one work unit + delivery-plan candidate**: the facets hang off one design spine,
and the predecessor's stacked delivery plus a comparable surface span warrant slice-aware authoring. Natural member
seams, recorded to inform plan authoring at task generation and **not bound here**:

comparator swap (D4) · topology transition and terminal binding (D1) · terminal integration arm and machinery
retirement (D3) · refresh and native registration scoping (D5, D6) · member-boundary verification (D7) ·
hosted-review fan-out (D8) · doctrine and record retirement (D9, D10).

Nothing is published or bound at spec time. Plan authoring, member count, and order are `generate-tasks` decisions.

## Alternatives & Rationale

**Retain the control branch and patch its failure modes (v1 continued).** Rejected. The synthetic-ancestry
reconciliation, the frozen base, and the disconnected terminal request are all consequences of the accumulator
shape, not independent defects — and the external survey identifies that shape as a named antipattern that
mainstream tools avoid structurally. Patching it means paying the reconciliation cost forever.

**Rewrite the work-unit branch to a residual-only unique range.** This would give the cleanest topology — the top
would be a pure residual with no ancestry merge. Rejected: it force-pushes a pushed session branch, violating the
append-only contract and orphaning SHA-keyed user notes. The ancestry merge buys the same ancestral chain at the
cost of one merge commit per absorption, which is the cheaper trade by a wide margin.

**Register the complete stack including the top.** Rejected for the tracked tier. Registration would expose the
session branch to provider-side stack rewrites (host UI "Rebase stack", CLI stack rebase, native suffix rewrites),
which the append-only contract cannot survive. Excluding the top makes that a structural guarantee rather than
operator discipline. The cost — forfeited stack-UI membership and the guarded retarget of D3.4 — is named, bounded,
and retires at convergence (D6.5).

**Keep byte-identical aggregate-patch identity as a refusal bar.** Rejected: it is the mechanism of the observed v1
failure. Its patch bytes embed predecessor-dependent blob IDs, so a mechanically rebased member with an unchanged
semantic patch produces different bytes and is refused. Every surveyed tool uses structural identity instead.

**Use `git patch-id --stable` as the arbiter.** Rejected (D4.7): it hashes context lines, so it false-refuses
exactly the adjacent-edit case a busy trunk makes common — the same failure with different bytes — and adding it as
a pre-filter buys nothing over the in-core merge while doubling the refusal vocabulary.

**Land as you go (the industry norm).** Rejected for now, with a recorded reopening trigger (D10.2). Three named
reasons: a landed member refuses re-description, converting routine plan amendment into public fix-forward;
agent-reviewer latency in minutes removes the pipelining payoff that motivates early landing; and restacks trigger
re-review churn across open member pull requests. The native machinery's maturity — no auto-merge for stacked
pull requests, async merge with a residual race — reinforces it without being the reason.

**Build a delivery-local bridge that carries review standing across restacks.** Rejected — this was the design's
first answer to the restack-churn problem, and it is the wrong one. The concern is general (any non-substantive
head movement wastes a metered review pass, not only a delivery restack), it already has a chartered owner, and a
delivery-local mechanism would stand a second equivalence notion beside the general concern, and the concern is
demonstrably general: an ordinary work-unit pull request whose head moves after a clean review wastes a metered
pass for exactly the same reason. The resolution is neither a local bridge nor a dependency on another lane —
delivery owns the general projection (D8.6), because the decision at its centre is the equivalence arbiter and
delivery holds the evidence that patch equality is the wrong one. A projection designed around the base-merge case
alone would plausibly have reached for patch equality and served neither consumer.

**Implement ARC-native restack machinery.** Rejected. Providers already do this well, and building it would put
ARC in the rebase-and-conflict-resolution business — squarely against the proportionality trace and the cohort's
non-goals. Delegate, reobserve, adopt on structural equivalence, refuse ambiguity.

**Author a new version floor and disclosure path for `merge-tree --merge-base`.** Rejected as missed composition:
the package already declares `engines.git >=2.45`, and the delivery lib already carries a cached capability probe
and a typed unsupported-refusal for `merge-tree --write-tree`. Extending the existing canary is the whole change
(D4.4).

**Give the top pull request a delivery-specific title convention.** Rejected as unsupported machinery. The
pull-request template already assigns the terminal member the ordinary work-unit form, and the top's base ref being
a member branch conveys stack affiliation structurally — better than any title could, and better than v1's
disconnected request managed (D1.7).

**A private-target accumulator for stack-ineligible concerns (`delivery-integration-target`).** Retired
unimplemented at this work unit's minting. Its mechanism is the accumulator shape this redesign removes, and its
activation threshold was never met — both field deliveries were stacks. This design further shrinks its residual
case: structural contribution identity removes the false stack-ineligibility class, and provider-delegated refresh
removes base-movement fragility. A genuinely stack-ineligible concern routes first to decomposition or
feature-flagged incremental landing; a private-target projection, if still wanted then, gets a fresh design against
this substrate.

## Cross-cutting Considerations

**Amendment classification against v1.**

- _Preserved:_ the canonical plan and state contracts; member review admission through the delivery-member vehicle;
  eligibility gating at exact heads; exact-head integration authorization and merge locking; lifecycle-artifact
  exclusion for non-final members; the complete unlinked sequential landing path; and the host-idiomatic trust
  decision (exact-set validation is an ARC and operator property; the server pins the selected top head; sequential
  unlinked landing remains the decline path).
- _Removed:_ the retained control branch and its projection; the disconnected terminal request; byte-identical
  aggregate-patch identity as a refusal bar for mechanically carried members; and the whole-stack serialized
  landing posture.

**Hard external constraints.**

- **Merge-commit-only for intermediate members** — confirmed platform fact. Only the top member may squash or
  rebase. Compatible with ARC's merge-commit default; bounds any title-or-commit-promotion policy to the top member.
- **GitHub native stacks are public preview** (2026-07-30): subject to change, async merge with a disclosed
  residual race window and no full-set compare-and-set, auto-merge unsupported for stacked pull requests,
  merge-queue support still rolling out, server-side "Rebase stack" producing unsigned commits, and GitHub
  Enterprise Server support unconfirmed. The v1 posture carries forward unchanged: provider-observed, never
  authoritative, with the complete unlinked provider-neutral path retained as default and degrade target.
- **Strict up-to-date branch protection multiplies refresh demand.** A repository requiring branches up to date
  with the base turns each external landing during the window into a required refresh of the remaining suffix —
  demand-driven still, but frequent on a busy trunk, and the same tax any stack pays under that policy anywhere.
  Host-owned: the remedies are repository policy choices (relax strict up-to-date, or a merge queue — excluded per
  the non-goals). ARC keeps each forced refresh at the provider baseline — one delegated restack of the registered
  suffix plus reobserve-and-adopt, plus the top's append-only predecessor merge — and adds nothing beyond them.

**Ceremony budget — pre-commitment.**

- The protected base is never frozen for a delivery, at any stage.
- Non-interference holds in both directions (D2.3).
- Landing an N-member stack costs at most N landing decisions — or one contiguous-prefix decision — plus genuine
  content-conflict resolutions. No manual recuts, no per-member manual suffix adoption, no synthetic reconciliation
  merges. Named top-only costs, complete: append-only predecessor merges to absorb chain movement; one further
  ancestry merge per review-fix recut, since a recut re-authors the suffix and the top must re-adopt the new
  highest head to preserve D1.2's residual invariant (D4.5a); and member-scope re-verification of the terminal
  slice when absorbed drift overlaps the residual's own paths (D3.6). One window-wide cost joins them:
  arbiter-scoped member re-verification after a review-fix recut — only members whose contribution changed re-walk
  (D2.4). The record recomposition itself (re-attestation, rebind) is mechanical and rides the fix approval with
  no attended step.
- Review spend is ceremony too — wall clock, tokens, and provider rate limit. The commitment is that delivery adds
  no re-review of its own: landing an N-member stack costs N member reviews plus review of genuinely uncovered
  deltas, and a member proved unchanged under a predecessor rewrite is not re-reviewed (D8.6). Registration is the
  decision that would otherwise incur the difference, so it carries its own consequence (D6.10).
- Total ceremony must not exceed what a team on Graphite or GitHub native stacks performs for the same topology.

**Coordination.** The review-applicability projection (D8.6) was captured as an Errand from an ordinary
base-merge instance and is absorbed here. Re-reading it as its own capture directed surfaced design that clears
the derivation floor — the arbiter choice, the head-keyed evidence interaction across consumers including the
fallback-source case, and the Owner decision surface for a residual delta — and delivery holds the evidence that
binds the arbiter. The capture is withdrawn rather than left as a dependency edge; its originating base-merge case
is served here as the simpler instance of the same projection.

**Testing.** Structural guard tests replace the retired terminal-attachment assertions (D10.4). The comparator's
three verdicts (D4.2) each need coverage, including the conflict path, which is what distinguishes this arbiter
from its predecessor. Existing delivery integration tests that encode the terminal-unbound invariant (D1.6) are
updated as part of the change, not worked around.

**Migration and compatibility.** Pre-public-release posture applies: unpublished project-owned contracts and
development-only persisted state change in place. No backward-compatibility aliases, migration readers, or data
migrations for the state and plan shapes; development state is cleared or regenerated. D9.3's retirement operation
is the forward mechanism, not a migration.

**Security and trust boundaries.** No authority boundary moves. ARC continues to hold plan intent, review and
interlock gates, and exact-result validation at the landing instant; the provider holds rewrite mechanics; the host
holds merge execution. D3.4's retarget is the one new host mutation, is offered rather than applied, and touches a
pull request's base rather than any ref.

**Alignment checks.** Checked against PROJECT-PRD's _Operational friction down, judgment friction up_ principle —
passes: the design codifies the deterministic edges (detect, reobserve, adopt, refuse) and preserves attended
judgment exactly at conflict resolution, landing authorization, and the integration interlock. Also checked against
_Configurable methodology, open ecosystem_ — passes: the native adapter is opt-in with a complete provider-neutral
default and degrade target. Checked against TECHNICAL-OVERVIEW § 3 Infrastructure — passes: Git and the GitHub
host adapter are already declared runtime dependencies and the Stacks API endpoint is already called by the shipped
adapter, so no new technology is introduced. That section records Git as a primary runtime dependency without a
version floor while `package.json` declares `engines.git >=2.45`; the document is stale on that point and the floor
is confirmed present in the project's technical surface.

Checked against `strategy-knowledge-evolution` § Self-Check (Placement of guidance content) and its _Extract on
fan-in, not aesthetics_ principle for D10.1's minted strategy — passes as a fan-in extraction: the doctrine has no
existing owner (the `strategy-work-organization` and `strategy-concurrent-work` charters exclude it, per D10.1's
boundary), and multiple consumers already exist — the delivery and integration workflow prose, the shipped
`integration-boundary-accuracy` posture, and `delivery-review-cardinality` — so the mint is forced by fan-in, not
sized-to-grow aesthetics. Checked against `strategy-procedure-evolution` § Self-Check for the workflow-prose
surfaces (D2.4, D7.5, D10.3) — passes under _If the CLI can compute it, the CLI computes it_ and _Verbs over
mechanics_: comparison, classification, and remedy selection stay in typed verbs; prose dispatches on returned
results and implements no loop (D10.3); the member-scope walk enters as a method parameter rather than a prose
branch (D7.6); and D6.10's consequence disclosure precomposes CLI-side per its § Emitted text principle. Checked
for forward compatibility against `draft-composable-workflows`: the `validate-criteria` shape — declaration plus
marked fire-point — matches its validated-fire-site direction, D7.6's rejection of a sibling workflow is its
fragment-substrate argument applied, and `deliver-stack` keeps the CLI-owned loop posture its loop rule requires —
no dependency on the agenda compiler is taken.

## Success Criteria

1. No retained control branch and no disconnected terminal pull request exist in any delivery path. The top member
   is the work unit's own branch, its pull request is the terminal integration vehicle, and it presents with the
   ordinary work-unit template and title.
2. The terminal ceremony runs through the ordinary `arc integrate checkpoint` → interlock → `arc integrate merge`
   flow, with the delivery arm composing its claim from the attestation record, exact bound member heads, and the
   residual comparison (D3.1–D3.2).
3. A top pull request whose base is not the protected base at the terminal boundary produces a typed refusal
   carrying the applicable remedy — retarget, or reopen-and-retarget when the host closed the dependent request —
   and the remedy resolves it; the highest non-terminal member's teardown does not fire before the top's base is
   observed retargeted (D3.4). A top whose base is a member branch during the landing window does not refuse
   (D3.3).
4. A member mechanically rebased under a predecessor rewrite, with an unchanged semantic patch, is carried forward
   without attended acknowledgement. A member whose contribution genuinely conflicts under reapply refuses with the
   conflicted paths named, and a member whose provider result diverges without conflict refuses with the divergent
   paths named (D4.2, D4.5).
5. `merge-tree --merge-base` capability is established through the existing probe and reuses the existing typed
   unsupported-refusal. No new version floor, disclosure path, or degrade path exists in the change set (D4.4).
6. The aggregate-patch envelope and the linearity precondition are absent from the code base (D4.6).
7. A delivery completes while the protected base receives unrelated external landings throughout, with no freeze
   and no refresh obligated by base movement alone (Goal 3, D5.3).
8. A native landing that rewrites the entire remaining suffix reconciles every rewritten member by structural
   equivalence before admitting its new head to review (D6.7).
9. Registration covers exactly the non-terminal member set, and ARC's own observation predicate reads that set as
   `registered` rather than `partial` when the top pull request is chained onto it (D6.3, D6.3a). A delivery of two
   total members routes unlinked whether or not the operator opted in — the sub-two member set degrades rather than
   stopping the workflow (D6.4).
10. Each planned member's task range closes with an ordinary implementation task that fires `validate-criteria` at
    member scope over its group in the member-grouped Success Criteria section, adding no phases and leaving the
    single terminal verification task unassigned to any member (D7.2, D7.2a, D7.6). Success criteria remain marked
    only during the verification phase (D7.3a). The closeout pass walks the seam group and dispositions the member
    groups from recorded boundary evidence rather than re-deriving them. Every surface D7.5 names carries the
    change in both copies, `validate-criteria` is reachable from both declared fire-points, and plan validation
    refuses member task ranges that interleave or depart from member order (D7.1).
11. A carried hosted-review reservation resumes on every member pull request at its exact head, and the work-unit
    obligation reports discharged only when every member review has cleared — verified at the terminal boundary as
    the conjunction, never satisfied by the top's own residual review (D8.1, D8.2, D3.2).
12. Landing an N-member stack spends N member reviews plus review of genuinely uncovered deltas. A member whose
    contribution is proved unchanged under a predecessor rewrite is not re-reviewed, and a review preserved across
    a fallback-source discharge survives append-only head movement of the top (D8.6). One equivalence arbiter
    serves both the delivery and ordinary base-merge cases; no second notion exists.
13. A delivery member branch resolves to its owning work unit through the delivery reverse lookup — not a branch
    prefix test — so `arc review status` and the hosted request path address a member; and the terminal spine
    resolves the top's change request while its base is a member branch, rather than refusing `base-mismatch`
    (D11.1–D11.4).
14. Opting into native registration surfaces its review-invalidation consequence at the decision point, and
    declining it is a supported route that makes no host calls (D6.10).
15. After terminal adoption and closeout, the delivery store holds no plan or state record for the completed work
    unit, and the retirement operation refuses while an operation, member ref, or unsettled terminal remains (D9.3).
16. `strategy-integration.md` exists in the package source, is listed in `init-recipe.json` `include_files`, is
    synced to the project copy, and is reachable from `STRATEGY-INDEX.md` in both copies (D10.1).
17. One ADR records the delivery-and-review posture, its considered alternative, and both reopening triggers
    (D10.2).
18. This work unit's own delivery is executed on this topology, and the run's ceremony is measured against the
    pre-commitment budget with any overrun named.

## Open Questions

Empirical questions resolved during the work. Each is an observation against a live provider, not an unsettled
design decision — where a negative answer would change the design, the design element itself names the obligation
and the fallback (D3.4, D6.3a, D6.4).

- **Stacks API preview churn.** Re-verify endpoint and precondition behavior at implementation time. Empirically
  confirm that a successful registration writes no pull-request timeline events; provider-observed purity is
  load-bearing and is currently documented only by inference. Stacks-API OAuth-scope requirements are undocumented
  and need establishing.
- **Registration-scope observations.** Confirm whether the provider reports a dependent unregistered pull request
  as part of the stack — the reading that decides how D6.3a's predicate obligation is discharged — and confirm
  empirically which repository branch-deletion settings produce the host's automatic retarget, which decides how
  often D3.4's remedy actually fires.
- **Conflict-evidence extraction.** `merge-tree --write-tree` signals conflict by exit status and prints conflict
  information; the exact parse that yields D4.5's conflicted-path list, and its distinction from a hard error, is
  established against the installed Git at implementation time.
- **Coordination.** Frontline review of delivery members (the stale-target recomposition refusal) is owned by an
  independent errand capture — coordinate, do not duplicate. That fix should land before this work unit dogfoods
  its own delivery.

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
