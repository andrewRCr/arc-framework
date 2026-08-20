# Draft: delivery-native-stack-composition — first-class native stack topology

- **Commitment:** Cohort member (`chunked-delivery`). A deliberate amendment to the v1 goals/non-goals shipped by
  `delivery-stack-topology` — not a cosmetic fix set. The v1 self-delivery completed on the v1 path; this member
  redesigns the topology that path exposed as wrong.
- **Purpose:** Make the provider stack chain itself — including its top code-bearing member — the delivery topology,
  delegate restack/refresh mechanics to the stack provider, and keep ARC's authority at plan intent, review and
  interlock gates, and exact-result validation at the landing instant.
- **Position:** Consolidates four 2026-08-13/14 field captures from the v1 self-delivery (terminal attachment
  resolution, first-class stack branches, projection refresh, native landing routing) into one coherent follow-up.
  Composes with the landed `integration-boundary-accuracy` contracts (dependency discharged 2026-08-20): the
  `arc attest` / `arc publish` lifecycle verbs and the typed `arc integrate checkpoint` → interlock →
  `arc integrate merge` spine. Reconciled against the shipped spec at this WU's first planning session.
- **Boundary fit (2026-08-20 entry read):** stays one WU + delivery-plan candidate. The facets (comparator, refresh,
  native routing, terminal/locus) hang off one design spine; the predecessor's stacked delivery and a comparable
  surface span warrant slice-aware authoring. Topology awareness only — nothing published or bound.

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

1. **First-class top member — the originating WU branch.** Eliminate the retained control branch and the separate
   terminal request. A WU begins ordinary — one branch, one worktree, artifacts in place — and adopts stacking as a
   transition: members are cut below the originating branch, which retargets onto the highest member and remains
   both the WU's branch and the stack's top. "Top" is never a moving designation (new members are always carved
   from beneath it), the WU locus is untouched — sessions resume as today, and non-stacked WUs are unaffected —
   and the top member's PR is the ordinary terminal work-unit integration vehicle: repository-materialized
   completion and archive contribution append where they already do, and the terminal ceremony is the ordinary
   `arc integrate checkpoint` → interlock → `arc integrate merge` flow. One locus addition only: a checkout of a
   member branch resolves its owning WU through the delivery state's existing reverse-lookup contract — a narrow
   fallback in the locus read, never a new roster authority. Lifecycle artifacts riding the top branch is a
   tracked-tier detail, not a load-bearing contract (`strategy-storage-evolution.md` keeps WU identity decoupled
   from branch identity; the materialized tiers carry no artifacts on any branch).
2. **Bottom-up, non-blocking landing — windowed, gated incrementally.** A member lands when it independently
   satisfies review and checks; ARC keeps its per-member review admission and interlock authority but drops
   whole-stack serialization. The protected base is never frozen for a delivery. Landing is **windowed**: members
   gate incrementally during execution (member-boundary verification, point 7) while merges run in one
   post-publish window, bottom-up — the considered land-as-you-go alternative and the evidence trigger that would
   reopen that fork are recorded in this WU's ADR (see § Posture record). Lifecycle mapping follows the shipped
   boundary unchanged: whole-WU attestation (`arc attest`, over the top branch's union tree, composing the
   member-boundary evidence and the seam pass) precedes `arc publish` at the publication-step head, where the
   push arm becomes push-members / register-stack / open-PRs bottom-up; `Integrating` spans the landing window;
   the top member's merge is the terminal instant.
3. **Provider-delegated reconciliation — demand-driven, window-scoped.** ARC detects append-only target drift and
   emits the exact planned suffix plus safety and review-invalidation consequences; the stack provider or operator
   refreshes branches and requests; ARC reobserves the complete chain and adopts only when the projection exactly
   matches the plan. The refresh arm fires on a refused landing (genuine conflict, native stale-suffix requirement,
   host up-to-date policy) or explicit operator choice, never on base movement alone; append-only external drift
   that blocks nothing is disclosed, not acted on. Interruption recovers to exact partial adoption by riding the
   existing one-active-operation state — refresh is a guarded operation, not a second protocol family.
   Execution-time base movement precedes materialization and is ordinary WU base-merge territory; member-boundary
   verification evidence then follows the ordinary after-base-merge re-run rules. Conflicts, rewritten targets,
   and ambiguous provider movement refuse.
4. **Structural contribution identity — reapply-and-compare-trees.** The tree-equality fast path stays. The
   byte-identical aggregate-patch fallback is replaced by one structural arbiter, the Gerrit trivial-rebase test:
   a single in-core three-way merge per member (merge base = old predecessor, ours = new predecessor, theirs = old
   member head; `git merge-tree --write-tree`), its result tree compared to the provider's new member tree. Equal
   trees → carried forward mechanically, review standing preserved, context drift absorbed. A merge conflict
   during reapply → the contribution genuinely interacts with the base movement — refuse to attended resolution
   (the failure mode is the detector). Unequal without conflict → the provider's result diverges from clean
   mechanical application — refuse with the exact divergent paths. Stable patch identity
   ([`git patch-id --stable`][git-patch-id]) is rejected as arbiter: it hashes context lines, so it false-refuses
   exactly the adjacent-edit case a busy trunk makes common — the v1 failure mode with different bytes — and a
   pre-filter role buys nothing over the in-core merge while doubling the refusal vocabulary. Tree comparison
   ignores commit metadata, so the native "Rebase stack" producing unsigned commits cannot perturb equivalence.
   Carry-forward evidence is ephemeral operation output — per member: verdict (`tree-equality` /
   `mechanical-reapply` / refusal class), old and new heads, and for refusals the exact conflicted or divergent
   paths — surfaced at adoption and recorded only as the state's updated current coordinates; no durable proof
   ledger. Exact-head pinning remains only at the merge instant.
5. **Native landing as the routed path.** Reobserve native registration before selecting the singleton arm; a linked
   stack routes through the native observe / select / prepare / submit / status lifecycle. The ordinary merge
   endpoint is the shipped `arc integrate checkpoint` → interlock → `arc integrate merge` spine (exact-head pin,
   in-verb lock release, bounded checks await, merge-method revalidation); the native arm extends that spine — the
   host adapter preserves a typed `native-stack-required` refusal from its merge attempt, uses the
   [asynchronous stack-merge API][gh-stack-merge-api], and returns the complete settled suffix; every
   provider-retargeted member reconciles by structural equivalence before its new head is admitted to review.
   Merge-method validation must become stack-aware: `arc review merge-method resolve` reads repository-level
   allowances while the platform holds intermediate members to merge commits (only the top member is free); the
   disclosed host-evidence residuals (branch-scoped rules unread, absent-vs-unconfigured required checks) are
   external couplings, not this WU's scope. Native linkage stays provider-observed, never canonical plan authority.
6. **Bookkeeping posture.** Member and operation state stays ephemeral and version-checked; facts re-derive fresh
   from plan, Git, and host authorities at each operation. The cohort's no-second-ledger non-goals carry forward
   unchanged; this member adds no durable record family.
7. **Member-boundary verification (pulled forward — ship whole).** If a target's breadth already forced a review
   and delivery split, one whole-target verification pass is compromised for the same reason — field evidence:
   `integration-boundary-accuracy`'s four verify → adversarial-gap → remediate cycles, each opened by a clean
   primary self-verify. With task order following member order, the working tree at member k's completion
   boundary _is_ member k's cumulative tree, so no early branch materialization is needed: the task plan gains a
   closing verification task per member (criteria slice + bounded member diff + reachability over the cumulative
   tree, reusing the whole-WU verification walk at member scope), evidence lands as ordinary task completion, and
   the whole-WU closeout pass narrows to cross-member seams and union coherence. MVP as procedure over existing
   structures — no new record family, no typed verification store; the instrument upgrades (falsification
   obligation, criteria-authoring constraints, the reachability lint) stay with their own captures and refine
   this seam without reshaping it.

## Ceremony budget — pre-commitment

- The protected base is never frozen for a delivery, at any stage.
- Non-interference, both directions: a registered delivery imposes zero coordination cost on work outside it —
  external landings to the base proceed with no awareness of the delivery — and external base movement never
  obligates an immediate refresh; the delivery absorbs drift on demand, at its own landing boundaries.
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
- **Strict up-to-date branch protection multiplies refresh demand.** A repository requiring branches up to date
  with the base turns each external landing during the window into a required refresh of the remaining suffix —
  demand-driven still, but frequent on a busy trunk, and the same tax any stack pays under that policy anywhere.
  Host-owned: the remedies are repository policy choices (relax strict up-to-date, or a merge queue — excluded for
  stacks per the constraint above); ARC keeps each forced refresh at the provider baseline — one delegated restack
  plus reobserve-adopt — and adds nothing on top.

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

- Contribution-proof comparator: `packages/arc-framework/src/lib/delivery/contribution-proof.ts` /
  `git-contribution-proof.ts` — replace the byte-aggregate fallback (its `git diff --binary --full-index` patch
  bytes embed predecessor-dependent blob ids: the mechanical-rebase false-refusal mechanism, named in one flag)
  with the merge-tree arbiter; keep the tree-equality fast path and endpoint pinning. `git merge-tree
  --write-tree` sets a Git ≥ 2.38 floor for the delivery feature — disclose and refuse below it, never degrade.
  Distinct from the plan-semantics fingerprinting in `fingerprint.ts` — the two concepts must not conflate.
- Terminal attachment: the archival-refusal defect is fixed (PR #511, 2026-08-20 — attachment binds an explicit
  lifecycle-complete work-unit identity, with a typed no-op for ordinary delivery). The remaining seam is the
  amendment's own: retire the attach machinery together with the disconnected terminal request it serves, rather
  than leaving a working mechanism whose subject this design removes.
- Terminal-workflow guard tests: `delivery-terminal-workflow.test.ts`'s whole-file digest pin is already removed (it
  froze a shared workflow document and its reconstruction literal had gone stale); the twelve retained structural
  assertions over the terminal-attachment block will fail by name when this design removes the disconnected terminal
  request — the intended signal. Retire or rewrite them deliberately as part of the amendment; any replacement guard
  is structural assertions over the specific contract (presence, uniqueness, ordering relative to merge confirmation
  and close), never a digest over a shared document.
- Suffix reconciliation: the native reconciler models only the single next-member retarget; native landing rewrites
  the entire remaining suffix, so full-suffix observation and structural reconciliation must be part of the landing
  result.
- Completed-record retirement: after the first live integration (2026-08-20), `.git/arc/delivery/` still held two
  canonical plan records and one bound state record for shipped, unoccupied work units — the store exposes
  publish/enumerate/read/reverse-lookup only, so global member reverse lookup keeps treating historical heads as live
  delivery-member authority and a reopened same-slug WU rediscovers the old plan. Settle the retention contract with
  the ephemeral-bookkeeping posture: one idempotent, version-checked retirement path after terminal adoption and
  ordinary WU closeout (covering a completed bound plan/state pair and an orphan plan with no state), or move
  completed records out of the live enumeration and reverse-lookup namespaces; refuse while an operation, member ref,
  or unsettled terminal remains.
- Delivery residue reaping: the v1 self-delivery left six candidate refs and six delivery-gate worktrees with no
  cleanup driver (hand-reaped 2026-08-15); whatever replaces the disposable-projection model owns reaping its own
  refs and checkouts, or names their cleanup driver.
- Frontline review of delivery members (`stale-target` recomposition refusal) is owned by an independent errand
  capture — coordinate, do not duplicate; that fix should land before this WU dogfoods its own delivery.

## Posture record and scope pulls (2026-08-20)

- **ADR — a WU deliverable.** The delivery-and-review posture is canonical, not WU-local: agentic review is the
  primary review lane, with human review complementing it — as a separate lane where teams run one, or as
  triage/authority over agent-review dispositions — and landing is windowed: incremental gating during execution,
  merges deferred to the post-publish window. Record the considered land-as-you-go alternative (the industry norm)
  and the named reasons for the narrow divergence: amendment freedom until the window (a landed member refuses
  re-description, converting routine plan amendment into public fix-forward), agent-reviewer latency in minutes
  removing the pipelining payoff that motivates early landing, restack-triggered re-review churn across open
  member PRs, and the native stack machinery's current maturity (no auto-merge for stacked PRs, async merge with
  a residual race). Record the reopening trigger: field use showing late-batched hosted review producing rework
  that boundary-time landing would have prevented. One ADR or two (posture / landing decision) resolves against
  `strategy-adr-methodology.md` at authoring.
- **Strategy touch — a WU deliverable.** Fold the posture into the appropriate adopter-facing strategy; resolve
  the exact home at spec time with the `init-recipe.json` both-directions check (standing WORKING-MEMORY
  constraint) before placing content.
- **Per-deliverable verification ownership** moves here (retargeted from `delivery-review-cardinality` at the
  2026-08-20 housekeep drain): the member-boundary verification substrate is load-bearing for this topology and
  ships with it. The falsification-obligation and criteria-authoring instrument upgrades stay with their own
  captures, and the reachability lint rides its own errand capture — each refines the member boundary without
  reshaping it.

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

- `integration-boundary-accuracy` — landed dependency, reconciled 2026-08-20: this design composes with the shipped
  `arc attest` / `arc publish` verbs and checkpoint/merge spine, and consumes its typed substrate rather than
  minting parallel reads — `arc review change-request resolve` (member PR resolution / reverse lookup),
  `arc review status`, `arc base merge`, `arc review merge-method resolve`, and the provider-neutral bounded wait
  for any stack-merge-API await (its natural third instantiation).
- `delivery-review-cardinality` — narrowed 2026-08-20: retains its review-request-cardinality charter; the
  per-deliverable verification concern retargeted to this WU (see § Posture record and scope pulls).
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

- Whether registration should use the raw Stacks API only, given `gh stack link` porcelain performs mutations beyond
  the presentation-only carve-out.
- How a carried hosted-review reservation (`arc publish`'s deferred hosted-first standard obligation) reads across
  several member pull requests — per member, top-only, or delivery-scoped.
- Where member criteria slices live and how they render — the delivery plan's member-coverage table, the task
  list's boundary tasks, or both with one authority.

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
