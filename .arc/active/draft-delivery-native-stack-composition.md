# Draft: delivery-native-stack-composition — first-class native stack topology

- **Commitment:** Cohort member — the shared review baseline, non-goals, and hardening-admission boundary live in
  `cohort-chunked-delivery.md`. A deliberate amendment to the v1 goals/non-goals shipped by `delivery-stack-topology` —
  not a cosmetic fix set. The v1 self-delivery completed on the v1 path; this member redesigns the topology that path
  exposed as wrong.
- **Purpose:** Make the provider stack chain itself — including its top code-bearing member — the delivery topology,
  delegate restack/refresh mechanics to the stack provider, and keep ARC's authority at plan intent, review and
  interlock gates, and exact-result validation at the landing instant.
- **Position:** Consolidates the v1 self-delivery's four field captures — terminal attachment resolution, first-class
  stack branches, projection refresh, native landing routing — into one coherent follow-up. Composes with the landed
  `integration-boundary-accuracy` contracts: the `arc attest` / `arc publish` lifecycle verbs and the typed
  `arc integrate checkpoint` → interlock → `arc integrate merge` spine.
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

## External grounding (research synthesis)

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
   transition: member branches are authored filtered cuts below the originating branch (content excludes lifecycle
   artifacts per the existing eligibility contract), published as first-class refs, and the originating branch
   adopts the chain by an **append-only ancestry merge** of the highest member's head — making the member chain
   ancestral, so the top PR's diff against the highest member is exactly the residual (terminal slice plus
   lifecycle artifacts) — while remaining both the WU's branch and the stack's top. The rejected construction —
   rewriting the WU branch to a residual-only unique range — would force-push a pushed session branch, violating
   the append-only contract and orphaning SHA-keyed user notes. "Top" is never a moving designation (a later
   member is carved from beneath it and ancestry-merged the same way), the WU locus is untouched — sessions
   resume as today, and non-stacked WUs are unaffected — and the top member's PR is the ordinary terminal
   work-unit integration vehicle: repository-materialized
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
   push arm becomes push-members / register-stack / open-PRs bottom-up (registration covers the non-terminal
   members — point 5); `Integrating` spans the landing window; the top member's merge is the terminal instant.
   **Terminal authorization is a typed delivery arm of the checkpoint spine.** The ancestry-merge construction
   plus merge-commit member landings advance the recomputed merge-base between the top and the base through each
   landed member, so the top's freshly computed candidate subject at the terminal is the residual, never the
   attested union — deterministically, drift or no drift. The union attestation therefore exists once, at the
   publication head (as above), and the terminal checkpoint gains a delivery arm — extending the shipped spine
   by composition exactly as the native merge arm does, never rewriting attestation semantics: it verifies that
   the boundary's candidate is the delivery's bound publication candidate, that every non-terminal member landed
   at its exact bound head (the delivery state already guards each landing), and that the terminal residual
   carries no unexplained delta against the plan's terminal member — exact trees/contributions, per the cohort
   floor. Exact-head pinning, the interlock, and the refusal posture are unchanged. Window-time drift absorbed
   by the top's predecessor merges is fail-closed at the same seam: drift overlapping the residual's own paths
   re-fires member-scope verification for the terminal slice (the residual is the terminal member's scope under
   point 7), never whole-WU re-verification; drift outside those paths reconciles as ordinary absorbed base
   movement. The reopening trigger for a cheaper carry-forward path is recorded with the ADR (§ Posture record).
3. **Provider-delegated reconciliation — demand-driven, window-scoped.** ARC detects append-only target drift and
   emits the exact planned suffix plus safety and review-invalidation consequences; the stack provider or operator
   refreshes the registered non-terminal suffix — the top is never provider-restacked; it absorbs predecessor
   movement by another append-only predecessor merge, the same base-merge doctrine pushed branches already
   follow; ARC reobserves the complete chain and adopts only when the projection exactly matches the plan. The
   refresh arm fires on a refused landing (genuine conflict, native stale-suffix requirement,
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
   ledger. Exact-head pinning remains only at the merge instant. The same verdict is the delivery-side input to
   review applicability (point 9): ARC's structural admission of a carried member and the preservation of its
   review are one judgment, proved once.
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
   Registration is raw Stacks API only (research-grounded), **over the non-terminal member set**: the top chains
   natively as an ordinary PR based on the highest member branch — connected, presenting the residual delta — but
   stays outside the registered stack, so no provider-side stack operation (UI "Rebase stack", `gh stack rebase`,
   native suffix rewrites) can touch the session branch, a structural guarantee rather than operator discipline,
   and those instruments stay fully usable over the registered set. The tax — the top forfeits stack-UI
   membership and native retarget machinery, relying on ordinary deleted-base retargeting at the final landing —
   is tracked-tier substrate cost (§ Substrate seam). The API's chained-or-`422` precondition is ARC's own
   fail-closed refusal expressed host-side, while the `gh stack link` porcelain pushes branch arguments, creates
   missing PRs, and auto-corrects mismatched PR bases — silent repair of exactly the topology mismatch ARC must
   surface — and its error layer masks API rejection reasons. The shipped adapter already conforms
   (`gh api repos/{repo}/stacks`). The porcelain and the host UI remain legitimate operator-side refresh
   instruments over the registered set; ARC adopts their results through reobservation and structural
   equivalence, never as registration or authority.
6. **Bookkeeping posture.** Member and operation state stays ephemeral and version-checked; facts re-derive fresh
   from plan, Git, and host authorities at each operation. The cohort's no-second-ledger non-goals carry forward
   unchanged; this member adds no durable record family.
7. **Member-boundary verification (owned here — ship whole).** If a target's breadth already forced a review and
   delivery split, one whole-target verification pass is compromised for the same reason — field evidence:
   `integration-boundary-accuracy`'s four verify → adversarial-gap → remediate cycles, each opened by a clean
   primary self-verify. With task order following member order, the working tree at member k's completion boundary
   _is_ member k's cumulative tree, so no early branch materialization is needed.
   **What moves is the walk, not the mark.** The compromised thing at whole-target scale is the bounded diff and
   reachability check over a tree small enough to hold; that runs per member. Success criteria stay marked only in
   the verification phase, as today — a criterion is an outcome-level claim about the whole WU, and a member
   boundary can gather its evidence but cannot know whether a later member regresses it. Terminal marking also lets
   a criterion superseded by a late design decision take `[~]` once, with the whole picture visible. The closeout
   pass walks the seams and dispositions the member groups from recorded boundary evidence rather than re-deriving
   them.
   **The walk is a method, not a second workflow.** `validate-criteria` takes its scope as an input; the WU
   verification workflow declares and fires it at WU scope, and `process-task-loop` declares it with the member
   closing task as its fire-point. So a member task never loads a WU-scoped workflow to verify one slice, and scope
   is a parameter rather than a prose branch — no conditional control flow enters workflow prose. A sibling
   `verify-deliverable` is rejected: duplicated judgment prose is what the fragment substrate exists to remove, and
   it would add a loadable surface with its own recipe and reachability obligations. Both fire-points are
   hand-verified as marked, since a declared method whose fire-point is missing silently never loads.
   **Task shape is constrained, not chosen.** The member closing task is an ordinary implementation parent assigned
   to its member in the coverage table — never a second verification task, because the delivery task inventory
   requires exactly one verification parent under a terminal `Verification` phase and coverage blocks assigning it
   to a member. So **no new phases**, and since members bind per task rather than per phase, a member spanning
   several phases closes in the last one its range reaches.
   **Criteria grouping.** The Success Criteria section groups by member under plain `###` subheadings plus one
   cross-member seam group — assignment follows "the earliest boundary whose validator can see the evidence," with
   criteria no member boundary can see defaulting to the seam group. `###` is safe (it neither terminates the
   section nor parses as a task); criteria must stay at root indent, since a four-space-indented checkbox bullet
   reparses as a subtask. A single-deliverable WU has one group and renders as today's flat list.
   MVP as procedure over existing structures — no new record family, no typed verification store. This WU owns the
   invocation topology; instrument upgrades refine that seam without reshaping it and live with their owning WUs:
   `verification-falsification-contract` owns the verification instrument's falsification quality,
   `planning-iteration-mechanics` owns the general planning-time criterion authoring form (this WU owns only the
   delivery-member case, and the two must land compatibly rather than each defining a grammar), and the
   criteria-reachability lint has no owner yet — captured for routing, not assumed to exist. The delivery plan's
   coverage table keeps binding tasks and design elements only; it never carries criterion content, so no second
   authority arises.
8. **Hosted-review reservation fans out per member.** A hosted-first standard reservation carried across
   `arc publish` resumes per member through the delivery-member vehicle: each member pull request receives the
   reserved hosted source's review at its exact head, and the WU obligation discharges as the conjunction of
   member reviews — the same reviews the delivery's per-member admission already requires, so one review system,
   not two. No PR presents the union delta in a stack, so a top-only resumption would review a sliver while
   claiming the WU — excluded by construction: a member review claims member scope only, and no whole-WU
   clearance is derived from the set. Cross-member seams stay covered by the member-boundary verification
   substrate and the chunked local lane's seam doctrine where it runs; any aggregate hosted review surface
   remains `delivery-review-cardinality`'s demand-held question, not pre-empted here. The ordering rule fans out
   with the reservation: the reserved source may not be leapfrogged by a lower-ranked carrier on any member
   merely because its pull request now exists.
9. **Review applicability across non-substantive head movement — owned here.** ARC's review evidence is
   head-keyed: discharge reads a settled attempt anywhere in the span `rev-list <base>..<approvedHead>`, so a
   rewritten head drops its reviewed commits out of that span and voids a clean review. Retargeting a pull request
   does not — the head is unchanged, so the evidence stays in span. **Rewrite destroys applicability; retarget
   preserves it.** That distinction is the whole concern.
   It bites this topology hardest: a native landing rewrites the entire remaining suffix, so every landing would
   void the clean reviews of every remaining member — roughly N²/2 hosted passes for an N-member stack, against a
   provider baseline that does not re-review mechanical restacks at all (Gerrit preserves votes on a trivial
   rebase; Graphite has teams disable stale-approval dismissal). Paying it would be pure ARC-added ceremony
   guarding no chartered failure. But it is not delivery-specific: the same waste hits an ordinary work-unit pull
   request whose head moved after a clean review because a base merge landed separately-reviewed content. That
   ordinary case is the _simpler_ instance of one projection, not a different problem.
   This work unit therefore **owns the projection**, absorbed here rather than left to a separate lane, because the
   design decision at its centre is one delivery holds the evidence for: **the equivalence arbiter**. Patch
   equality is the wrong choice — `git patch-id` hashes context lines, so it false-refuses exactly the mechanically
   rebased commit whose semantic patch is unchanged, which is the v1 field failure with different bytes. Point 4's
   in-core three-way reapply is the right one, and it is being built here anyway. A projection designed around the
   base-merge case alone would plausibly have reached for patch equality and then served neither consumer.
   **Shape.** A typed projection, consulted before any re-review request, that mechanically separates base
   movement, equivalent reviewed commits, and the exact uncovered delta. It preserves a review automatically only
   when equivalence is proved by point 4's arbiter; where a residual delta remains, it surfaces that bounded delta
   for an Owner applicability decision before provider capacity is spent. Comparison and classification stay in
   typed CLI verbs; workflows dispatch on the typed result rather than embedding Git-diff inference in prose. No
   agent is ever asked to claim that arbitrary changes are semantically equivalent.
   **The append-only asymmetry is real but narrower than it first appears.** The top absorbs predecessor movement
   by merge, so its reviewed heads stay ancestors and stay in span — its review survives head movement, which is a
   second reason the append-only construction is load-bearing. That holds for the reservation's _first_ source.
   It fails for a fallback source: the discharge loop consults the exact current head when deciding whether an
   earlier source was safely unavailable, so a reservation that discharged through a fallback after a rate-limited
   first source re-voids on the next append-only merge, even though the fallback's clean attempt is still in span.
   The top moves once per predecessor absorption, so this recurs through the window. The projection must cover
   append-only movement for that case, not only rewrite.
   **Scope discipline.** Owning this projection does not make delivery the owner of review architecture. It owns
   _applicability_ — whether an existing review still covers the current content. Obligation, findings, clearance,
   and lane precedence are untouched.

## Substrate seam — why full native composition waits

The design above composes with the native-stack idiom everywhere except one layer, and the divergence is
substrate-caused, not doctrinal. Two ARC contracts force it:

- **Lifecycle artifacts ride the WU's code history** (tracked tier, arc-in-git): task-list updates ride task
  commits and ceremony commits interleave with code, so a member cut from the real history would carry
  `.arc/active/` content and landing it would ship a partial WU's live artifacts to the base — the
  session-perturbation the cohort floor forbids. This is what forces members to be filtered reconstructions
  rather than interior refs, and with them the transition construction, the eligibility filtering, and the
  ancestry merge.
- **The pushed WU branch is append-only** (SHA-keyed user notes, multi-machine sync): idiomatic stacks rewrite
  branches freely; ARC's session substrate cannot survive a rewrite of the top, which is why the top is excluded
  from provider restack and registration.

The projection layer those contracts require — member filtering and reconstruction, the lifecycle-exclusion
eligibility path, the ancestry-merge transition, registration scoping, top protection — is **substrate tax,
deliberately separable**: the plan/state schema stays projection-neutral (cohort contract), so nothing durable
bakes the tracked-tier shape in. Under the storage-evolution endpoint (`strategy-storage-evolution.md`:
operational state materializes without branches carrying it; WU identity and session anchoring decouple from
branch/SHA identity), both causes dissolve — members become interior refs, the full stack registers including
the top, provider restack works end to end, and the projection layer retires. Two elements are survivors, not
tax — convergence must not dismantle them: the delivery-typed terminal authorization (the merge-base advance
that collapses the terminal subject is intrinsic to ancestral members landing as merge commits — exactly the
interior-ref shape — not a tracked-tier artifact) and member-boundary verification (substrate-independent task
and criteria structure). And to keep the retirement a bounded swap, member materialization is one narrow seam:
the tracked-tier filtering implements behind a single member-materialization boundary, so convergence replaces
the materializer while the delivery protocol above it stands. That convergence obligation is captured for
routing to the storage-evolution consumers (it drains to their stubs); this design records the seam, and the
surviving contracts — structural identity, registration, landing, refresh, terminal authorization,
member-boundary verification — carry over unchanged.

## Ceremony budget — pre-commitment

- The protected base is never frozen for a delivery, at any stage.
- Non-interference, both directions: a registered delivery imposes zero coordination cost on work outside it —
  external landings to the base proceed with no awareness of the delivery — and external base movement never
  obligates an immediate refresh; the delivery absorbs drift on demand, at its own landing boundaries.
- Landing an N-member stack costs at most N landing decisions (or one contiguous-prefix decision) plus genuine
  content-conflict resolutions — no manual recuts, no per-member manual suffix adoption, no synthetic reconciliation
  merges. Named top-only costs: append-only predecessor merges to absorb chain movement, and member-scope
  re-verification of the terminal slice when absorbed drift overlaps the residual's own paths (point 2).
- Total ceremony must not exceed what a team on Graphite or GitHub native stacks performs for the same topology;
  every ARC-added step must name the chartered failure it guards that the provider baseline does not.
- Review spend is ceremony too — wall clock, tokens, and provider rate limit. A member whose contribution is
  proved unchanged under a predecessor rewrite is not re-reviewed; landing an N-member stack costs N member
  reviews plus review of genuinely uncovered deltas, never a re-review per restack (point 9).

## Hard external constraints

- **Merge-commit-only for intermediate members** — confirmed platform fact (see above); only the top member may
  squash or rebase. Compatible with ARC's merge-commit default; bounds any PR-title/commit-promotion policy to the
  top member.
- **GitHub native stacks are public preview** (2026-07-30): subject to change, async merge with a disclosed residual
  race window (no full-set compare-and-set), auto-merge unsupported for stacked PRs, merge-queue support still
  rolling out, server-side "Rebase stack" produces unsigned commits, GHES unconfirmed. The v1 posture —
  provider-observed, never authoritative, with the complete unlinked provider-neutral path retained as default and
  degrade target — carries forward unchanged.
- **Merge-queue coordination is all-or-nothing.** Field-documented failure mode ([LLVM/Graphite][llvm-graphite-queue-rfc]):
  partial queue adoption with stacks causes infinite rebase/CI loops. The existing no-merge-queue exclusion stands;
  any future adoption must be universal, not optional.
- **Strict up-to-date branch protection multiplies refresh demand.** A repository requiring branches up to date
  with the base turns each external landing during the window into a required refresh of the remaining suffix —
  demand-driven still, but frequent on a busy trunk, and the same tax any stack pays under that policy anywhere.
  Host-owned: the remedies are repository policy choices (relax strict up-to-date, or a merge queue — excluded for
  stacks per the constraint above); ARC keeps each forced refresh at the provider baseline — one delegated restack
  of the registered suffix plus reobserve-adopt, plus the top's append-only predecessor merge — and adds nothing
  beyond them.

## Amendment classification against v1

**Preserved:** the canonical plan/state contracts (`delivery-plan-record`), member review admission through the
delivery-member vehicle, eligibility gating at exact heads, exact-head integration authorization and merge locking,
lifecycle-artifact exclusion for non-final members, the complete unlinked sequential landing path, and the
host-idiomatic trust decision (exact-set validation is an ARC/operator property; the server pins the selected top
head; sequential unlinked landing remains the decline path).

**Removed:** the retained control branch and its projection, the disconnected terminal request, byte-identical
aggregate-patch identity as a refusal bar for mechanically carried members, and the whole-stack serialized landing
posture.

## Posture record — WU deliverables

- **ADR.** The delivery-and-review posture is canonical, not WU-local: agentic review is the primary review lane,
  with human review complementing it — as a separate lane where teams run one, or as triage/authority over
  agent-review dispositions — and landing is windowed: incremental gating during execution, merges deferred to the
  post-publish window. Record the considered land-as-you-go alternative (the industry norm) and the named reasons
  for the narrow divergence: amendment freedom until the window (a landed member refuses re-description, converting
  routine plan amendment into public fix-forward), agent-reviewer latency in minutes removing the pipelining payoff
  that motivates early landing, restack-triggered re-review churn across open member PRs, and the native stack
  machinery's current maturity (no auto-merge for stacked PRs, async merge with a residual race). Record the
  reopening trigger: field use showing late-batched hosted review producing rework that boundary-time landing would
  have prevented — and, for terminal authorization, field evidence that residual-overlap re-verification or the
  delivery-arm composition dominates window ceremony, which would reopen extending structural carry-forward into
  the attestation lineage as a deliberate authority-semantics amendment. The raw-Stacks-API registration
  decision rides as a worked instance of the same stance — typed fail-closed host surfaces over
  silently-repairing porcelain — rather than its own record. One ADR or two
  (posture / landing decision) resolves against `strategy-adr-methodology.md` at authoring.
- **Strategy touch.** Fold the posture into the appropriate adopter-facing strategy; resolve the exact home at spec
  time with the `init-recipe.json` both-directions check (standing WORKING-MEMORY constraint) before placing
  content.

## Known implementation seams

- Contribution-proof comparator: `packages/arc-framework/src/lib/delivery/contribution-proof.ts` /
  `git-contribution-proof.ts` — replace the byte-aggregate fallback (its `git diff --binary --full-index` patch
  bytes embed predecessor-dependent blob ids: the mechanical-rebase false-refusal mechanism, named in one flag)
  with the merge-tree arbiter; keep the tree-equality fast path and endpoint pinning. The arbiter requires the
  explicit-base form — `git merge-tree --write-tree --merge-base=<old-predecessor>` — because auto-computed merge
  bases are wrong after provider rewrites; that option sets a Git ≥ 2.40 floor for the delivery feature —
  disclose and refuse below it, never degrade.
  Distinct from the plan-semantics fingerprinting in `fingerprint.ts` — the two concepts must not conflate.
- Stacks API preview churn: re-verify endpoint and precondition behavior at implementation time; empirically
  confirm a successful registration writes no PR timeline events (provider-observed purity is load-bearing and
  only documented by inference); Stacks-API OAuth-scope requirements are undocumented — establish them at
  implementation. Two verifies from the registration-scope decision: confirm registration tolerates a dependent
  unregistered PR based on the top registered member's branch, and confirm ordinary deleted-base retargeting
  covers the top's final retarget (it depends on the repository's branch-deletion-on-merge behavior).
- Terminal attachment: attachment now binds an explicit lifecycle-complete work-unit identity, with a typed no-op
  for ordinary delivery (the archival-refusal defect is fixed — PR #511). The live seam is the amendment's own:
  retire the attach machinery together with the disconnected terminal request it serves, rather than leaving a
  working mechanism whose subject this design removes.
- Terminal-workflow guard tests: `delivery-terminal-workflow.test.ts` retains eleven structural assertions over the
  terminal-attachment block (its whole-file digest pin is gone — it froze a shared workflow document and its
  reconstruction literal had gone stale); they will fail by name when this design removes the disconnected terminal
  request — the intended signal. Retire or rewrite them deliberately as part of the amendment; any replacement
  guard is structural assertions over the specific contract (presence, uniqueness, ordering relative to merge
  confirmation and close), never a digest over a shared document.
- Suffix reconciliation: the native reconciler models only the single next-member retarget; native landing rewrites
  the entire remaining suffix, so full-suffix observation and structural reconciliation must be part of the landing
  result.
- Completed-record retirement: after the first live integration, `.git/arc/delivery/` still held two canonical plan
  records and one bound state record for shipped, unoccupied work units — the store exposes
  publish/enumerate/read/reverse-lookup only, so global member reverse lookup keeps treating historical heads as live
  delivery-member authority and a reopened same-slug WU rediscovers the old plan. Settled to the removal arm, per
  the ephemeral-bookkeeping posture: one idempotent, version-checked retirement operation after terminal adoption
  and ordinary WU closeout deletes the completed bound plan/state pair (and any orphan plan with no state
  belonging to the same work unit) from the store — no archive namespace, which would be a durable record family
  the non-goals exclude, and pre-release posture clears development state rather than migrating it; refuse while
  an operation, member ref, or unsettled terminal remains.
- Delivery-typed terminal checkpoint arm: the shipped currentness projection recomputes the candidate subject
  against a fresh merge-base (`git-candidate-subject.ts`) and the publication boundary pins the at-publish digest
  (`checkpoint-composition.ts`), so the delivery arm must compose the terminal claim from the attestation record,
  the delivery state's exact bound member heads, and a residual comparison against the plan's terminal member —
  reusing the eligibility comparator's content-comparison machinery — rather than the single-subject digest
  equality the singleton path uses.
- Delivery residue reaping: the v1 self-delivery left six candidate refs and six delivery-gate worktrees with no
  cleanup driver (hand-reaped once); whatever replaces the disposable-projection model owns reaping its own refs
  and checkouts, or names their cleanup driver.
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
- No pre-implementation of the storage-evolution substrate: no off-branch artifact materialization, no notes
  re-keying, no session-anchor changes; the projection layer implements as-is on the tracked tier, the top stays
  unregistered under it, and convergence work routes to its owners (§ Substrate seam).
- No structural carry-forward into the attestation lineage: the terminal delivery arm composes existing records;
  extending lineage-continuation semantics is the ADR's recorded reopening trigger, a deliberate future
  amendment.

## Coordination

- `integration-boundary-accuracy` — landed dependency: this design composes with the shipped `arc attest` /
  `arc publish` verbs and checkpoint/merge spine, and consumes its typed substrate rather than minting parallel
  reads — `arc review change-request resolve` (member PR resolution / reverse lookup), `arc review status`,
  `arc base merge`, `arc review merge-method resolve`, and the provider-neutral bounded wait for any
  stack-merge-API await (its natural third instantiation).
- `delivery-review-cardinality` — retains its review-request-cardinality charter; per-deliverable verification
  ownership lives here (design spine point 7).
- `verification-falsification-contract` / `planning-iteration-mechanics` — instrument neighbors: the former owns
  the verification instrument's falsification quality, the latter the planning-time criterion authoring form; both
  consume this WU's member-scoped invocation topology (criteria slices, boundary cadence, seam closeout) rather
  than re-deriving it, per the boundary recorded in their backlog drafts.
- `review-source-authority` — owns the hosted-lane record-family census; this member adds no new records for that
  census to inherit.
- `decomposition-doctrine` / the `assess-boundary-fit` chassis — unchanged; delivery still owns the checkpoint
  chassis and its delivery arm.
- Errand-lane siblings (frontline delivery-member identity, eligibility-close read-only lock) — independent; the
  frontline fix precedes this WU's self-delivery.
- Review applicability across non-substantive head movement — **absorbed into this work unit** (point 9), not a
  coordination edge. It was captured as an Errand from an ordinary base-merge instance; re-reading it as its own
  capture asked surfaced design that cleared the derivation floor (the arbiter choice, the head-keyed evidence
  interaction across consumers including the fallback-source case, and the Owner decision surface for a residual
  delta). Delivery holds the evidence binding the arbiter, so splitting the design from that evidence risked a
  projection that served neither consumer. The capture is withdrawn; its originating base-merge case is carried
  here as the simpler instance the same projection serves.

## Disposition: `delivery-integration-target` retired

Retired at this stub's minting (2026-08-15). Its mechanism — accumulate members on a private target whose terminal
merge carries the whole contribution — is the accumulator shape the external survey identifies as the antipattern
this redesign removes, and its own activation threshold was never met (both field deliveries were stacks). This
redesign further shrinks its residual case: structural contribution identity removes the false stack-ineligibility
class, and provider-delegated refresh removes base-movement fragility. If a genuinely stack-ineligible concern ever
materializes, it routes first to decomposition or feature-flagged incremental landing; a private-target projection,
if still wanted then, gets a fresh design against the v2 substrate rather than this draft.

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
