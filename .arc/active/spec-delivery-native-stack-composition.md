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
7. **Verification and adversarial attention meet the same boundary review does.** A target broad enough to require
   a delivery split gets per-member verification rather than one compromised whole-target pass, and an advisory
   whole-target adversarial pass may reuse a stable authored delivery or review partition to bound reviewer
   attention without becoming one pass per member.
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
- **Amended 2026-08-22 — exact-bound applicability carry enters scope after terminal-reconcile design audit.** The
  preceding exclusion no longer covers carrying Candidate verification applicability across base movement when D4
  mechanically proves the contribution unchanged, or when the applicable authority makes an exact-bound selection
  over an inconclusive residual. It still excludes a new lineage or proof record family, autonomous semantic
  inference, and any carry whose heads or evidence changed. The prompt was the supported-path finding that ordinary
  overlapping base movement would otherwise re-spend verification solely because its file blobs moved.
- **Amended 2026-08-22 — replayable Candidate transitions enter scope after implementation grounding.** The narrow
  applicability selection must remain replayable when an approved review response follows it, so the existing
  Candidate record's ordered response lineage becomes an ordered transition union of approved review responses and
  exact-bound applicability selections. This is not a new record family or generalized decision ledger: the
  transition stores only the authority-bearing facts needed to reduce the current Candidate, while mechanical proof,
  rationale, paths, retries, and superseded attempts remain absent. The prompt was the concrete supported sequence in
  which replacing one current binding would remove the bridge needed to replay a later response.
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
  the top's tree exactly, guarded by a dedicated pure containment classifier rather than the eligibility
  comparator's equality result. The classifier takes the exact common pre-adoption base, top head and tree, and
  highest-member head and tree; it reapplies the highest member onto the top through D4's in-core merge machinery.
  `contained` requires a clean result whose tree equals the pre-merge top tree. Conflict, a changed result tree, or
  unavailable evidence refuses with the exact paths or typed unavailable reason. The successful ancestry commit
  then records both parents with the already-proved top tree; the classifier writes no state. An ordinary content
  merge is the wrong instrument at adoption: merging equivalent content under independently authored histories is
  the v1 fourteen-conflict mechanism. **Absorption** (D5.2) is the genuine content merge, reserved for the case
  where the chain carries content the top lacks.
- **D1.3 Append-only invariant.** The rejected construction — rewriting the work-unit branch to a residual-only
  unique range — would force-push a pushed session branch, violating the append-only contract and orphaning
  SHA-keyed user notes. It is excluded by construction, not by discipline.
- **D1.4 Fixed designation.** "Top" is never a moving designation. A later member is carved from beneath the top
  and ancestry-merged the same way.
- **D1.5 Locus.** The originating checkout remains the work unit's sole session and compaction-recovery locus;
  sessions resume there as today, and non-stacked work units are unaffected. Member and gate checkouts are bounded
  operation inputs, not independent ARC sessions: they carry no work-unit lifecycle artifacts, mint no second
  roster authority, and never borrow or fabricate the originating checkout's load set. Delivery-member ownership
  resolves only at the exact review-gate read sites D11.1 names.
- **D1.6 Terminal binding.** The terminal member binds at publish exactly like any other member — `ref`,
  `changeRequest`, and `coordinates` are populated when its pull request opens. This replaces the current
  materialization rule, where the terminal is deliberately left unbound
  (`packages/arc-framework/src/lib/delivery/materialization.ts` derives `ref: null` and `requestBaseRef: null` for
  the final index) and only binds post-merge. The terminal's `ref` is the originating branch, not a
  delivery-namespace ref: its coordinates already resolve from the snapshot's top slot rather than the member
  list, which is why D4.5a's `direct-delivery-ref` guard keeps discriminating exactly the case it was written for.
  Binding it also removes the null-ref condition that today excludes the terminal from the publish arm's
  presentation and request loops, so the terminal's ordinary-template presentation (D1.7) becomes a routing
  obligation of that arm rather than an implicit consequence.
- **D1.7 Terminal presentation.** The top pull request uses the ordinary work-unit pull-request template and the
  ordinary Conventional-Commits title, which `template-pull-request.md` already prescribes for the terminal member.
  Publication therefore accepts one strict caller-authored `terminalPresentation` containing the ordinary `title`
  and `body`, separate from the non-terminal member-presentation array. The calling integration workflow authors
  it through the existing ordinary template; delivery validates the complete presentation set before any ref push
  or host mutation and only transports the supplied terminal form. The member presentation composer stays scoped
  to non-terminal members. On retry, an already-open request at the exact expected head and base is adopted without
  rewriting its title or body; `terminalPresentation` is consumed only when the terminal request is missing and is
  never persisted as delivery state. Stack affiliation is conveyed structurally: the top's base ref is the highest
  member's branch, so the host displays the chain relationship and the residual delta directly — a signal v1's
  disconnected terminal request could not offer. No delivery-specific title convention is introduced, and none is
  this work unit's to introduce: `pull-request-surface-policy` owns pull-request title policy, including whether a
  readable work-unit slug belongs in ordinary and stacked titles. This design consumes whatever that work unit
  settles; it does not pre-empt it.
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
  the publication-step head. The publish push arm becomes push-members / open-pull-requests bottom-up / optionally
  register-stack, because registration consumes the provider-assigned change-request IDs and cannot precede their
  creation. Registration covers the non-terminal members per D6.3, the terminal request opens in the same arm per
  D1.6, and declining registration makes no registration call per D6.10. `Integrating` spans the landing window;
  the top member's merge is the terminal instant.
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
  member whose contribution actually changed re-walks, and a contribution-equivalent carried member re-verifies
  nothing. Tier 1 gates re-run per the existing after-fix rule. The tail is typed-verb work — it composes through the
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
  it retires with D3.7's machinery; the arm's residual check is new composition, not inherited behavior. Physical
  teardown removes a landed member's refs but retains its exact ref, change-request, and coordinate bindings in
  active delivery state through this terminal read; final retirement (D9.3), not per-member teardown, ends their
  lifetime.
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
- **D3.4 Top retarget: delete, reobserve, then repair only on failure.** The host retargets a dependent pull
  request to the merged request's base only when the merged head branch is deleted — and the deleting actor is ARC
  itself. After the highest non-terminal member lands, teardown retains its delivery-state bindings but deletes
  its remote branch as the retarget trigger, then immediately reobserves the top request. An automatic retarget to
  the protected base completes with no host mutation from ARC. An observed open request on the wrong base yields
  the narrow retarget remedy; an observed `closed-unmerged` request yields reopen-and-retarget. Those are
  failure-only mutations behind the existing explicit remedy invocation, followed by another observation; no
  proactive retarget step enters the ordinary path. Which repository settings produce the automatic outcome stays
  the scheduled empirical question; the design covers both answers rather than betting on one. The terminal arm
  refuses fail-closed until the top is freshly observed open against the protected base. Retargeting a pull
  request's base rewrites no ref, so D1.3's append-only contract is untouched.
- **D3.5 Unchanged guarantees.** Exact-head pinning, the integration interlock, and the refusal posture are
  unchanged.
- **D3.6 Window-time drift.** Drift absorbed by the top's predecessor merges is fail-closed at the same seam.
  Drift overlapping the residual's own paths re-fires member-scope verification for the terminal slice — the
  residual is the terminal member's scope under D7 — never whole-work-unit re-verification. Drift outside those
  paths reconciles as ordinary absorbed base movement.
- **D3.7 Retirement.** The absorption and terminal-attachment machinery retires with the disconnected terminal
  request it serves: `packages/arc-framework/src/lib/delivery/terminal.ts` in full, its `delivery terminal prepare`
  / `attach` verbs, and **both** workflow call sites — `deliver-stack.md`'s terminal-handoff section (which invokes
  `prepare`) and `integrate-work-unit.md`'s post-merge attachment step (which invokes `attach`). Two guard tests
  are in scope: `delivery-terminal-workflow.test.ts` pins package/project parity plus the attachment block's
  placement over `integrate-work-unit.md`, and `delivery-workflow.test.ts` pins parity over `deliver-stack.md`
  together with a `delivery terminal prepare` invocation the re-authored handoff removes. Each retires its
  terminal-machinery assertions and keeps its parity assertion, so both copies of each workflow change together.
  The archival-refusal defect the machinery carried is already fixed; it is removed because its subject no longer
  exists, not because it is broken.
- **D3.8 Conditional terminal reconcile — amended 2026-08-22 after implementation exposed an unreachable D3.6
  branch.** Delivery drift classification composes _ahead of_ the generic reconcile-safety predicate; it does not
  weaken that predicate or claim ordinary substantive drift is safe. The classifier and safety facts form this
  ordered decision table:

    - Terminal records, current Candidate, or typed overlap unavailable → stop
      `drift-classification-unavailable`; do not attempt a host mergeability read.
    - Any predecessor-path overlap, including overlap that also touches the residual → stop
      `predecessor-overlap`; predecessor refusal has priority.
    - Residual overlap, with every substantive drift path inside the exact residual-overlap set → return
      `reconcile-base-then-verify-terminal-member` only when the checkpoint base OID exists, integration evidence
      is complete, overlap is available, and the host reports mergeable.
    - Any substantive drift path outside the exact residual-overlap set → apply ordinary generic safety and stop
      `unsafe-reconcile`.
    - Regenerable-only or no substantive overlap, disjoint from the predecessor and residual → apply ordinary
      generic safety; return `reconcile-base` only with a base OID, complete integration evidence, available
      overlap, and a mergeable host.
    - Host conflict or unavailable host evidence → stop `unsafe-reconcile` regardless of path class.

  Conditional safety authorizes only the append-only branch reconcile, not terminal integration. The checkpoint
  binds the immutable base OID, the Candidate's recognized head, and the exact terminal-member verification scope
  in the typed result. The workflow first invokes
  `arc base merge --expected-base {baseOid} --expected-head {candidateHead}`. The merge verb reobserves both
  immediately before mutation: `base-moved` or `head-moved` returns `rerun-checkpoint`; only the exact pair may
  proceed. Conflict or operational failure stops.

  A merged or already-clean result follows the ordinary post-base-merge tail — Tier 1 gates, exact-target
  recomposition, review-applicability settlement and any required review, and work-unit reconcile — before the
  D3.6 validation fires. `validate-criteria` then walks the exact terminal-member diff and cumulative tree of the
  settled **post-reconcile Candidate**, carrying the classified residual-overlap paths as attention input rather
  than treating the pre-merge tree as evidence. The report is bound to that resulting head. An unresolved report
  stops; any criteria fix or other head movement invalidates it. A resolved report reruns the checkpoint instead of
  carrying prior safety forward, so the next checkpoint rederives base, Candidate, delivery, review, and host facts
  before terminal authorization. No virtual merge tree, temporary checkout, or proof record is introduced.

  This is an intentional shared-substrate scope delta: the existing base-merge input becomes a base-plus-head
  compare-and-set for delivery and ordinary reconcile callers. It implements D3.5's already-promised exact-head
  pinning rather than adding authority, a new interlock, or a delivery-only merge path. Generic reconcile safety
  stays conservative and delivery semantics stay in the checkpoint-level composition.
- **D3.9 Rerunnable terminal reconcile — amended 2026-08-22 after design audit rejected D3.8's recovery cost.**
  This amendment supersedes D3.6's terminal-slice-only promise and D3.8's post-merge terminal-member validation
  tail. The ordered overlap classifier and base-plus-head compare-and-set remain: predecessor overlap and
  unclassified substantive drift refuse, while exact residual overlap and ordinary disjoint or regenerable drift
  may enter the guarded base merge when their respective safety predicates pass. The residual branch no longer
  carries a verification scope or a special continuation. Every merged or already-clean result runs the ordinary
  post-base-merge tail and then reruns the checkpoint.

  That rerun composes only from durable facts already owned by the Candidate and delivery records:

    - If the fresh merge base changed the Candidate subject, the existing `candidate-unexplained-delta` refusal
      explains that the prior Candidate cannot carry. Its remedy is ordinary whole-work-unit verification followed
      by `arc attest {name} --new-root`, not terminal-member-only validation or a new lineage-admission rule. The
      resulting Candidate, push, review settlement, and checkpoint rerun use the existing lifecycle.
    - If the Candidate is current but the delivery terminal coordinates still name the pre-reconcile head, the
      delivery arm returns `terminal-rebind-required / reconcile-delivery-state`. `arc delivery reconcile` then
      reobserves the coherent plan and versioned state, the current Candidate head, and the exact top request at
      that head; with no active operation and no other binding change, it version-updates only the terminal
      coordinates and returns `rerun-checkpoint`. An already-rebound retry returns the same continuation.
    - Missing, moved, conflicting, or ambiguous facts stop with an informative refusal. They never synthesize a
      retry selector from prose or adopt a different head.

  The state rebind is an idempotent state-only reconciliation, not an external mutation. The ordinary integration
  workflow owns the branch merge and push; delivery neither replays them nor reserves a second operation for them.
  If execution stops anywhere, the next checkpoint sees either the Candidate-currentness refusal or the exact
  publication-head versus terminal-coordinate mismatch and returns the same next action. No terminal-reconcile
  operation kind, owner, retry policy, recovery record, or autonomous replay path is introduced.

  This is an intentional scope reduction: residual overlap may now cost whole-work-unit verification instead of the
  terminal-only optimization D3.6 promised. It preserves the complete safe route and exact-head authority while
  avoiding new Candidate-lineage semantics and recovery machinery for a rare optimization path.
- **D3.10 Judgment-bounded Candidate applicability — amended 2026-08-22 after ordinary team base movement made
  D3.9's whole-work-unit default disproportionate.** This amendment supersedes only D3.9's rule that every changed
  Candidate subject pays whole-work-unit verification. The base-plus-head compare-and-set, ordinary post-merge
  automated checks, informative checkpoint rerun, and idempotent terminal-coordinate rebind remain. Path overlap is
  attention input, not itself a semantic-change verdict.

  The exact compare-and-set classifies ancestry before mutation. If the expected base is already an ancestor of the
  expected Candidate head, the result is already clean and creates no commit. If the Candidate head is an ancestor
  of the base, the result is `head-contained-by-base / rerun-checkpoint` and creates no commit: that topology is a
  stale or already-integrated checkpoint, not base absorption. Only a pair with neither endpoint ancestral to the
  other enters the merge arm. That arm invokes `git merge --no-ff --no-edit <exact-base>` and accepts the result only
  when its first parent is the exact prior Candidate head and its second parent is the exact base; conflict,
  operational failure, or any other parent shape stops. `--no-ff` is therefore limited to proven divergence, where
  Git already requires a merge commit. The guarded parent shape lets an interrupted rerun rederive the exact
  pre-merge endpoints without persisting a proof or recovery record.

  After a guarded merge and the ordinary new-head checks, one Git-backed producer supplies strict structural facts to
  the asynchronous effective-target projection below; the pure durable-baseline reducer performs no Git I/O. The
  producer binds D4's endpoints without durable proof state: `before.member` is the durable baseline target,
  `after.member` is the freshly observed Candidate head, `after.predecessor` is the freshly observed configured base,
  and `before.predecessor` is the sole merge base of the baseline head and current base. A missing or non-unique merge
  base is unavailable evidence. The guarded merge's exact parent pair separately proves the immediate base-absorption
  event, while the baseline-to-current comparison permits any number of mechanically equivalent base carries to be
  rederived after interruption. Workflow prose evaluates none of those facts; it dispatches only on the effective
  projection's closed result:

    - Equal Candidate subject digests retain the existing operational-only head advance; no new behavior fires.
    - A changed subject digest runs D4's arbiter over the exact old and new base/head coordinates. `tree-equality`
      or `mechanical-reapply` with an empty residual returns `applicable` and carries verification applicability to
      the current head automatically. The machine established the fact; no attended acknowledgement or durable
      proof is added.
    - Any non-mechanical result with a non-empty bounded path set returns `decision-required`, whether D4 reports
      clean divergence or interaction. It carries the exact prior/current base and head, structural verdict,
      bounded path set, and canonical projection and residual digests. Clean application proves mechanics, not
      semantic coverage, so the classifier never originates `changed` from divergence alone.
    - Exact endpoint movement or a transient snapshot race returns `rerun-checkpoint` without mutation. Git
      operational failure or malformed evidence returns `classification-failed / stop`; an unavailable D4
      capability returns `classification-unsupported / upgrade`; and missing, empty, or otherwise unbounded evidence
      returns `classification-unavailable / stop`. None is presented as an authority choice.

  `decision-required` offers exactly `covered`, `targeted-check`, or `changed`. The CLI precomposes the exact-bound
  offer and recommendation text; the workflow presents it without recreating the decision table. The executing agent
  may analyze the evidence and recommend a route; formal selection resolves through the existing Rule Authority and
  configured review/verification contracts. The agent may mechanically record an operator's explicit selection but
  cannot originate the applicability choice for its own work. `covered` recognizes the exact current target;
  `targeted-check` recognizes it only after the selected bounded verification evidence exists; `changed` enters the
  ordinary Candidate change route.

  `arc candidate applicability resolve <name> <input>` is the only write seam. It rederives the current projection,
  requires the exact Candidate-record version, and atomically replaces the one current applicability binding on the
  existing Candidate record. The binding carries only the Candidate identity, prior and current target coordinates,
  projection and residual digests, selecting actor and choice, plus the targeted evidence reference when applicable.
  A `targeted-check` selection is written only in the same compare-and-set that carries its completed evidence; there
  is no pending-selection or recovery state. The record remains storage-agnostic and the command writes through the
  existing versioned Candidate store — no `.arc/` path, tracked-file assumption, or storage mode enters the domain
  contract.

  The binding stores no rationale, proof transcript, retry state, or generalized decision history. Any head, subject,
  projection, residual, or record-version change makes it inapplicable and returns to fresh classification. An exact
  replay is idempotent. Interruption before the write simply re-presents the same exact facts; machine-proved
  applicability is rederived and never persisted.

  Candidate currentness has two composable layers. A canonical pure durable-baseline reducer reads only the
  attestation, approved responses, and current applicability binding. `covered` and evidenced `targeted-check`
  advance that baseline; `changed` records the ordinary change route without recognizing the new target. Above it,
  one asynchronous effective-target projection combines that baseline with freshly observed Git coordinates and
  D4. Machine-proved equivalence recognizes the exact current head only in this projection and is rederived on every
  read; an authority binding may durably advance the same target. Status, review, publication-boundary, response,
  lifecycle, and checkpoint consumers all use the effective projection rather than independently interpreting the
  record tail. The durable reducer remains pure and storage-neutral, while the effective projection owns Git I/O;
  neither stores mechanical proof state.

  Applicability settlement does not carry a review or publication verdict: the ordinary review/pre-publication
  procedure must independently settle the effective recognized subject and refresh its durable boundary before
  checkpoint composition can proceed.

  The projection is shared substrate, not a terminal exception: D8.6's review-applicability consumer and Candidate
  currentness consume the same D4 structural facts and exact-binding discipline without collapsing their distinct
  authorities. This intentionally reverses the attestation-lineage non-goal above at the narrowest compatible seam.
  It serves Goal 8 and `PROJECT-PRD.md`'s "Operational friction down, judgment friction up" principle: deterministic
  equivalence costs no attention, while irreducible semantics stay with the applicable authority.

- **D3.10a Replayable Candidate transition lineage — amended 2026-08-22 after implementation grounding exposed a
  continuity break in D3.10's replaceable binding.** Replacing a single A→B applicability binding after an approved
  B→C review response removes the bridge the strict Candidate reducer needs to replay that response. The Candidate
  record therefore carries one ordered, strictly discriminated `review-response | applicability-selection`
  transition sequence in place of its response-only sequence and D3.10's replaceable current binding. This is the
  minimum lineage already required to derive the Candidate's current target, not a separate audit surface.

  An applicability-selection transition carries exactly the fields D3.10 authorizes: Candidate identity, prior and
  current targets, projection and residual digests, selecting actor, `covered | targeted-check | changed`, and the
  completed targeted-evidence reference only for `targeted-check`. `covered` and evidenced `targeted-check` advance
  the durable target; `changed` records the selected ordinary-change route without advancing it. Exact replay of an
  identical tail transition is a no-op; a different tail, stale record version, or changed bound input refuses. The
  sequence stores no mechanical proof, path set, rationale, storage mode, retry state, pending selection, or
  superseded attempt.

  An approved review-response transition remains independently authoritative for the exact old target its existing
  review and verification evidence binds. It may re-anchor the reducer at that old target before advancing to its
  new target when the preceding carry was machine-proved and therefore intentionally ephemeral. This exception is
  limited to the existing approved-response authority: it does not let an applicability selection skip durable
  continuity, does not turn a response into mechanical proof, and does not weaken response evidence validation.
  Candidate lineage attestations remain evidence over recognized subjects and never advance the target themselves.

  The pure durable-baseline reducer folds the root and ordered transitions under those rules. The asynchronous
  effective projection then rederives any further machine carry from Git and D4 exactly as D3.10 specifies. Every
  existing Candidate consumer moves to that shared reducer/projection before this amendment is complete; no
  response-tail or raw current-subject shortcut remains. Pre-public-release compatibility applies, so the record
  changes in place with no response alias or migration reader.

### D4 — Structural contribution identity: reapply and compare trees

The tree-equality fast path stays only when the predecessor is unchanged. Once the predecessor moves, identical
member trees do not establish identical contribution: the member may now cancel or omit predecessor content. Every
predecessor-moved comparison therefore runs the structural arbiter below, even when the old and new member trees
match. The byte-identical aggregate-patch fallback is replaced by that one arbiter — the Gerrit trivial-rebase test.

- **D4.1 The arbiter.** When the predecessor changed, run one in-core three-way merge per member — merge base = old
  predecessor, ours = new predecessor, theirs = old member head, via
  `git merge-tree --write-tree --merge-base=<old-predecessor>` — and compare its result tree to the provider's new
  member tree. Only unchanged-predecessor plus equal-member-tree takes the no-merge `tree-equality` shortcut.
- **D4.2 Verdicts.** An unchanged predecessor plus equal member tree → carried on `tree-equality`. A moved
  predecessor whose reapply tree equals the provider result → carried on `mechanical-reapply`, review standing
  preserved, context drift absorbed. A merge conflict during reapply → the contribution genuinely interacts with
  the base movement; refuse to attended resolution, since the failure mode is itself the detector. Unequal without
  conflict → the provider's result diverges from clean mechanical application; refuse with the exact divergent
  paths. Equal old and new member trees never bypass this reapply when the predecessor moved.
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
  and review-invalidation consequences. The stack provider or the operator may refresh the registered non-terminal
  suffix outside ARC; ARC neither authorizes nor pretends to pre-reserve that externally assigned result. It
  reobserves the complete chain and adopts it through a version-checked write only when the projection exactly
  matches the plan under D4. A provider mutation ARC itself invokes is the separate reserved arm D5.4 names.
- **D5.2 The top is never provider-restacked.** It absorbs predecessor movement by another append-only predecessor
  merge — the same base-merge doctrine pushed branches already follow. This is D1.2's **absorption** form: a
  genuine content merge, because a restacked chain carries base content the top lacks, with conflicts staying
  attended. The content-neutral adoption form is never used here — it would silently drop that base content and
  fail late at D3.2's residual check instead of early at the merge.
- **D5.3 Firing conditions.** The refresh arm fires on a refused landing (genuine conflict, native stale-suffix
  requirement, host up-to-date policy) or explicit operator choice — never on base movement alone. Append-only
  external drift that blocks nothing is disclosed, not acted on.
- **D5.4 Interruption safety.** ARC-issued provider mutations reserve the existing one-active operation before the
  host call, reobserve, and reconcile under that reservation. Externally initiated provider/operator refresh has
  no ARC mutation reservation because its assigned heads are unknowable beforehand; ARC performs only bounded
  post-mutation observation, D4 equivalence classification, and version-checked adoption. A crash before that
  adoption leaves external facts to reobserve rather than a fictitious requested snapshot to recover. Neither arm
  adds an operation kind, protocol family, or durable proof record.
- **D5.5 Execution-time movement.** Base movement before materialization is ordinary work-unit base-merge
  territory; member-boundary verification evidence then follows the ordinary after-base-merge re-run rules.
- **D5.6 Refusals.** Conflicts, rewritten targets, and ambiguous provider movement refuse.
- **D5.7 External-only provider refresh and reserved ARC adoption — amended 2026-08-23 after the Member 6
  lifecycle audit.** This amendment supersedes D5.1's final sentence and D5.4's ARC-issued provider-mutation arm.
  The reference adapter exposes no provider refresh mutation, the non-goals exclude provider submission machinery,
  and ARC does not invoke or pre-reserve the provider's work. The provider or operator performs the exact planned
  suffix refresh externally; until ARC has freshly observed and structurally proved that complete result, no ARC
  operation exists.

  Once those assigned heads are known, ARC reserves `rewrite/provider-adoption` for its own post-observation
  settlement only. The reservation binds the old suffix snapshot and the exact freshly observed requested suffix,
  then owns a second exact observation and proof, the terminal top's genuine append-only content merge, lease
  publication of that top, and one final version-checked state write that installs the target, complete suffix, and
  terminal coordinates while clearing the reservation. The terminal top remains outside provider authority. A
  crash before reservation leaves only external facts to reobserve; a crash after reservation reruns
  `delivery-refresh-adopt`, which idempotently recognizes the exact local merge and remote publication. No
  suffix-only state may publish before top settlement, and no new operation kind, provider capability, or durable
  proof record is introduced.

### D6 — Native registration and landing

- **D6.1 Routing.** Reobserve native registration before selecting the singleton arm. A linked stack routes through
  the native observe / select / prepare / submit / status lifecycle.
- **D6.2 Merge endpoint.** The ordinary endpoint is the shipped `arc integrate checkpoint` → interlock →
  `arc integrate merge` spine, with exact-head pin, in-verb lock release, bounded checks await, and merge-method
  revalidation. The native arm extends that spine: the host adapter **mints** a typed `native-stack-required`
  refusal from its merge attempt — today a stacked-member rejection collapses into an opaque `unavailable`, and the
  native merge submission union (`malformed | unavailable | unsupported`) widens to carry the new arm beside its
  existing `unsupported` reason, the same closed-union work D4.5 names for `landing.ts` — uses the
  [asynchronous stack-merge API][gh-stack-merge-api], and
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
- **D6.11 Semantic stacked refusal routing — amended 2026-08-23 after the Member 6 lifecycle audit.**
  `native-stack-required` and `native-stale-suffix` name different facts. The former is minted when the ordinary
  merge endpoint discovers that its exact open request requires the native stack lifecycle; it says no landing was
  applied and does not authorize refresh. ARC freshly proves the reserved request and delivery snapshot remain
  exact, clears that sequential reservation in one version-checked write, and returns the executable
  `delivery-native-land-select` transition. That selector derives the complete remaining non-terminal chain from
  canonical plan/state before fresh host observation; caller-authored member coordinates never select or downgrade
  an arm. `native-stale-suffix` remains a D5.3 refresh trigger after an actual stale-suffix refusal. Ambiguous
  no-effect evidence or a competing state write retains the reservation and stops.

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
    - `strategy-task-list-formatting.md` § Phase Preamble, which requires `_Purpose:_` as the opening line and
      must admit a `**Delivery member:**` pointer ahead of it, so a member-pinned phase names its member where
      the reader already is;
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
      condition);
    - the methods README's dependency table — the `validate-criteria` row, since the method fires
      `adversarial-review` (D7.6).
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
      silently never loads. Both fire points are verified by hand, not assumed. The fire-point form is the YAML
      callsite block; the `· #name` marker is reserved for extensions and is not used for methods.
    - **The adversarial companion travels with the walk.** The verification workflow's success-criteria boundary
      carries two halves: the primary-led walk, and an advisory fresh-context pass over the same criteria with
      the implementer's markings withheld. Extracting only the walk would move the half that comes back clean —
      the field evidence above is four cycles each _opened by a clean primary self-verify_ — and would leave
      member-scope criteria with less adversarial coverage than they have today, since D7.2 also narrows the
      closeout pass to seams and union. The method therefore carries both, under **one posture at both scopes**
      so scope stays a parameter rather than a branch. It declares `adversarial-review` itself and loads it on
      acceptance; consuming workflows declare `validate-criteria` alone and never its dependencies. The offer
      remains offered, never required, so no attended stop is added: a member closing task is already a
      task-interlock stop and the offer rides it.
    - **Authored partitions may scale whole-target adversarial attention.** The central `adversarial-review` method
      gains one lightweight advisory carrier for a large target whose delivery plan, review chunks, criteria
      groups, or other authored boundaries already provide a stable partition. It may assign at most two or three
      contract-closed groups to fresh reviewers, followed by one fresh seam-and-aggregate reviewer over the union.
      Every group retains the complete rubric for its scope, the aggregate verifies complete union coverage and
      cross-group seams, and the composite remains one logical pass. This is an attention aid, not the satisfying
      `review-chunking` carrier: it neither satisfies nor weakens that method's closure, seam, or aggregate
      obligations. It creates no automatic partitioner, 1:1 member fan-out, durable state, CLI surface, new
      interlock, or workflow-specific branch; when no stable authored partition exists, ordinary whole-target
      review remains the path. The method's invocation contract admits that one logical pass may use a composite
      carrier, while Novel `partition-map` semantics remain reserved for disjoint responsibility and are not
      overloaded by this attention-isolation mode.
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
  at each discharge read** (the consult D11.4 names), including bindings retained after physical member teardown
  until terminal proof and review settlement complete. They are never copied into a second target list or walked
  by a mutating pointer — facts re-derive per D9.1. The discharge projection gains an iterate-and-conjoin mode over those
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
    - **Closed producer-consumer contract.** A typed contribution-applicability projection is consulted before any
      re-review request and at the discharge read. Its closed result is `applicable`, `decision-required`, or
      `review-required`. Every arm binds the repository, change request, vehicle, lane, source, prior attempt, prior
      head, and current head. `applicable` additionally names a machine-proved basis and empty residual;
      `decision-required` carries the exact bounded residual plus its digest; `review-required` carries the typed
      proof failure or an Owner's explicit selection to review. Base movement and equivalent reviewed contribution
      are separate fields rather than inferred from the verdict. Equivalence proved by D4's arbiter is the only
      automatic preservation route. A residual produces `decision-required` before provider capacity is spent and
      may become applicable only through an explicit `covered` Owner selection; `review-required` admits the normal
      request path. The Owner selection binds actor, time, projection digest, residual digest, and the exact prior
      and current heads as a version-checked applicability binding on the existing lane-progress attempt. This is
      an extension of the existing record, not another record family. Retries replay that binding rather than
      asking again. The discharge read consumes the same projection and binding: `applicable` may qualify the prior
      settled or safely-unavailable attempt, while `decision-required` and `review-required` never discharge it.
      Comparison and classification live in typed CLI verbs and workflows dispatch on the typed result — no
      Git-diff inference in prose, and no agent is asked to claim that arbitrary changes are semantically
      equivalent.
    - **Earlier-attempt discovery reuses lane progress.** Applicability may need an attempt whose head predates the
      current request head. The read side therefore performs one bounded enumeration over existing lane-progress
      records, filtered by repository, change request, vehicle, lane, and source, then applies the projection to
      those candidates. The enumeration itself is read-only query capability over the record that already carries
      those coordinates. The only new write on this path is the explicit Owner selection above, versioned onto that
      same record; there is no new ledger, index, or record family.
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
    - **Scope discipline.** Owning this contribution-applicability projection does not make delivery the owner of
      review architecture or replace the existing path-based `carry | incremental` proof. It owns whether head
      movement leaves an existing review's contribution applicable. Obligation, findings, clearance, path
      applicability, and lane precedence are untouched.
- **D8.7 Judgment authority stays outside the classifier.** D4 and the contribution-applicability projection
  establish exact coordinates, mechanical equivalence, and bounded residual facts. They do not decide whether an
  inconclusive residual is semantically covered; clean divergence and interaction both require that judgment when
  their bounded residual is non-empty. The executing agent may explain and recommend from those facts;
  the formal selection remains with the authority already governing the affected review or verification surface.
  ARC records only that actor's exact-bound choice on the existing consumer record and respects it until any bound
  input changes. It adds neither a reasoning ledger nor a policy engine that attempts to mechanize semantic
  judgment. Endpoint movement returns a fresh-checkpoint rerun; malformed or failed Git evidence stops; unsupported
  capability stops for upgrade; and missing or unbounded evidence stops as unavailable. None is presented as a
  judgment call. Typed CLI results and precomposed text carry the facts and offer; workflow prose only dispatches.

### D9 — Bookkeeping: ephemeral state and completed-record retirement

- **D9.1 Posture unchanged.** Member and operation state stays ephemeral and version-checked; facts re-derive fresh
  from plan, Git, and host authorities at each operation. Physical teardown removes refs and checkouts, but keeps
  the exact member ref, change-request, and coordinate bindings in active state through terminal proof and review
  settlement. D9.3's final retirement clears those bindings with the plan/state pair. This design adds no durable
  record family.
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
  retirement's refusal conditions are reaping's postconditions, so the two run as one tail. Retirement is also the
  sole state transition that discards the retained member bindings D9.1 preserves after physical teardown.
- **D9.4 Residue reaping — this design is the replacement, so it names the driver.** The v1 self-delivery left six
  candidate refs and six delivery-gate worktrees with no cleanup driver, hand-reaped once. That deferral is not
  restated here: v2 retains an authoring stage that materializes candidate refs and gate checkouts (D4.5a turns on
  the same fact), so reaping them is in scope. Today publication pushes `<sha>:refs/heads/delivery/…` directly and
  creates no local branch, so the shipped remote-only teardown leaves no delivery-namespace ref behind — the v1
  residue was the authoring candidate branches and gate worktrees themselves. Under D1.1's first-class member
  branches the local side becomes real, so teardown reaps both sides plus the authoring candidate refs and ARC-owned
  gate checkouts. The deterministic authoring-candidate namespace is reserved to ARC; cleanup authority derives
  from that namespace plus the exact plan/member identity and expected candidate head, not unrecorded historical
  creation provenance. A candidate ref outside the namespace or at a different head is left intact and surfaced.
  Gate checkouts use deterministic ARC-owned paths derived from existing plan and member identity. Cleanup validates
  the exact path, expected candidate ref or head, detached state, and a clean worktree before removal; it never
  discovers ownership by HEAD coincidence and adds no checkout or ref-ownership registry. D9.3's refusal reads
  "member ref" as either side, so retirement cannot complete over unreaped local residue even though the historical
  coordinate binding stays readable until that retirement succeeds.
- **D9.5 Executable recovery transitions — amended 2026-08-22 after multi-member teardown recovery exposed a
  guidance-only continuation.** Reconciliation may advertise `retryable` only when the persisted transition plus
  its typed result make the next action executable without agent memory, provider ordering, or prose inference.
  The active reservation is the authority for the operation kind, ID, owning transition, retry policy, affected
  member identities, exact before and requested snapshots, plan digest, and any mutation authorization or host
  effect; a retry transition never destroys the only durable selector or payload for the action it returns.
  Position remains the selector for ordinary forward progress, not a universal recovery selector.

    - **Applied** → retain until the owning transition establishes every mandatory postcondition and typed
      continuation, then adopt and clear in one version-checked write. Return that continuation; read ordinary
      position only when no post-mutation observation remains owed.
    - **Not applied; owner deliberately restarts from a fresh selector** → clear as an explicit cancellation in one
      version-checked write. Name the exact preparation or observation action and its reservation-derived selector;
      never reuse an attended authorization.
    - **Not applied; owner resumes the same authorized effect** → preserve. Name the exact owning action, which
      consumes the reservation and revalidates it immediately before mutation.
    - **Ambiguous or unavailable** → preserve and stop for explicit reconciliation; no competing operation may
      start.
    - **Result or transition persistence fails** → leave the prior reservation authoritative; stop and reconcile
      again.

  Each existing operation kind closes its exact-not-applied branch as follows; the typed action names below are
  dispatch results, not workflow guidance:

    - **`materialize` / publication** — preserve. `publish` re-enters the owning publication service. The exact
      requested target or member ref/head comes from the reservation; the service re-runs candidate and lifecycle
      gates before resuming only that matching step.
    - **`publish` / publication** — preserve. `publish` resumes only the matching persisted host effect and
      requested snapshot. The owning publication input freshly re-supplies caller-authored presentation after its
      gates; title/body remain unpersisted per D1.7.
    - **`rewrite` / review-fix rematerialization** — preserve. `rematerialize` resumes from a reservation that
      records this owner and the complete selected-member authorization. Requested heads/trees plus D9.4's
      deterministic plan/member candidate identity select the source; lifecycle and contribution facts rederive
      fresh.
    - **`rewrite` / provider-observed adoption** — clear as cancellation. `native-observe` reobserves provider state
      and selects any new adoption from fresh facts; ARC never retries provider rewrite mechanics.
    - **`land` / sequential** — clear as cancellation. `land-prepare` receives the reservation's exact affected
      member, reobserves position and readiness, and fires a new integration interlock.
    - **`land` / native** — clear only after the persisted provider effect is authoritatively terminal and exactly
      none of the selected members landed. `native-observe` restarts observe / select / prepare and fires a new
      integration interlock. Pending, partial, or ambiguous effects retain and stop.
    - **`teardown`** — preserve. `teardown-member` receives the reservation's exact affected member and resumes
      deletion only after fresh position, ref, and request validation.
    - **`top-remedy`** — preserve. `top-remedy` consumes the exact persisted action/effect and revalidates the
      trigger ref and request before retrying it.

  Teardown is the load-bearing cardinality case: clearing and returning `read-position` is invalid because a
  two-member stack happens to reselect that member while a stack with three or more members selects the next
  unlanded member instead. Tests cover every row and stack cardinality where selection can differ, including
  interrupted first-member teardown in a stack of at least three members. Session initialization may project the
  reservation kind, owner, and ID, but always routes execution through reconciliation rather than inferring an
  affected member from that reduced view.

  Teardown also has an owner-specific applied continuation. After an exact applied deletion of a non-highest
  member, reconciliation may adopt, clear, and read position. After deletion of the highest non-terminal member,
  the reservation remains authoritative while reconciliation freshly observes the exact retained top request.
  Only an exact observation completes the same version-checked transition that clears the reservation and returns
  `terminal-checkpoint`, `retarget`, or `reopen-and-retarget`; unavailable or mismatched top evidence retains and
  stops. Re-entering ordinary position or relying on an idempotent second teardown to discover the owed observation
  is not a valid recovery continuation. Tests interrupt both before deletion and after deletion but before top
  observation, covering non-highest progress plus each highest-member typed result.

  This is an intentional recovery-branch scope delta admitted by the cohort's hardening boundary for a concrete
  supported-path correctness failure. It extends the existing ephemeral active-operation union with closed owner,
  retry-policy, and operation-authorization fields; those fields retire with the operation and record intent, not
  observed provider facts, review verdicts, or proof. It adds no operation kind, durable record family, second
  pending-retry state machine, provider abstraction, or autonomous repair for partial or ambiguous effects.
- **D9.6 Informative rerun recovery — amended 2026-08-22 after proportionality review rejected D9.5's general
  recovery matrix.** This amendment supersedes D9.5's blanket owner, retry-policy, and per-owner transition
  machinery while retaining its concrete teardown-cardinality finding. An interrupted operation re-enters through
  ordinary command invocation: reconciliation reobserves the persisted reservation and external state, then returns
  an informative typed result naming the same command or existing preparation action to rerun. ARC does not replay
  the command autonomously and does not create a recovery workflow.

  Existing reservation fields remain the authority: operation kind and ID, affected members, exact before and
  requested snapshots, bound plan digest, and the persisted host effect where one exists. Only the two overloaded
  kinds gain a narrow discriminator: `rewrite` distinguishes review-fix rematerialization from provider-observed
  adoption, and `land` distinguishes sequential from native landing. The discriminator selects the ordinary rerun
  entry point; it is not an owner registry or retry policy. Every other operation derives its rerun from its unique
  kind and existing payload.

  The reducer follows three consequence-scaled rules. Exact not-applied recovery has one small closed routing table
  derived from the ordinary verbs, not a persisted owner or policy registry:

    - Exact not-applied `publish` preserves its matching reservation because the ordinary publication service already
      consumes and revalidates that exact effect. Exact not-applied `teardown` also preserves: the ordinary teardown
      verb gains the narrow ability to consume its exact affected-member reservation, preventing stack position from
      selecting a different member after interruption.
    - Exact not-applied `materialize`, either `rewrite` mode, sequential `land`, authoritatively terminal
      none-landed native `land`, and `top-remedy` clear the exact reservation in a version-checked cancellation before
      returning their ordinary preparation or invocation action. The typed result includes a minimal exact selector
      over fields already authoritative in state — plan and operation identity, affected members, the narrow mode,
      and any existing effect identity needed by that action — plus precomposed rerun text. This selector identifies
      the reservation subject; it is not a persisted copy of the downstream command request. The ordinary action
      reobserves and prepares every remaining input, and any attended authorization is obtained again. A fresh command
      is never returned while a reservation it cannot consume remains active.
    - Exact applied state adopts and clears only after any immediately owed owner-specific observation is complete.
      The highest-member teardown therefore retains its existing reservation through fresh top-request observation
      and returns `terminal-checkpoint`, `retarget`, or `reopen-and-retarget`; other applied operations clear once
      their existing postcondition is established.
    - Ambiguous, unavailable, partial, pending, or persistence-failed state retains the reservation and returns an
      informative stop. Rerunning after the external fact settles repeats the same observation idempotently.

  The executable rerun union is exact: `materialize` and `publish` return `delivery-publish`; review-fix `rewrite`
  returns `delivery-rematerialize`; provider-adoption `rewrite` returns `delivery-native-observe`; sequential `land`
  returns `delivery-land-prepare`; authoritatively terminal none-landed native `land` returns
  `delivery-native-land-select`; `teardown` returns `delivery-teardown`; and `top-remedy` returns
  `delivery-top-remedy`. Stop results carry no executable action. Applied results that have already crossed their
  effect boundary return the existing typed domain continuation after adoption rather than masquerading as reruns.
  The CLI schema, reducer, handler, and workflow share this closed union.

  This is the cohort robustness floor, not a general replay engine: enough persisted intent to identify the in-scope
  operation, ergonomic messages, idempotent reobservation, and exact state writes. Every next action is a closed CLI
  discriminator with CLI-precomposed text; workflow prose infers no selector or recovery policy. No retry-policy
  field, blanket owner field, recovery record family, autonomous replay, or promise to repair every provider failure
  is added.

  **Amended 2026-08-23 after the Member 6 lifecycle audit:** provider-adoption `rewrite` is a preserved
  post-observation settlement reservation and reruns `delivery-refresh-adopt`, not the presentation-only
  `delivery-native-observe`. Its ordinary verb consumes the exact requested suffix, completes terminal-top
  absorption and publication, and only then clears in the final state write. The generic exact-not-applied rewrite
  cancellation rule does not apply to this specialized preserved arm.

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
  materialize / publish sections around D1 and D2.2, its landing-loop teardown step around D3.4's sequencing
  (after the highest non-terminal landing, retain its binding, delete its branch as the host retarget trigger, and
  reobserve before offering a failure-only repair), and its member-review section
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
- **D10.4 Guard tests.** Two guards pin the workflows D3.7 changes: `delivery-terminal-workflow.test.ts`, whose
  eleven assertions are anchored on the terminal-attachment block, and `delivery-workflow.test.ts`, which pins a
  `delivery terminal prepare` invocation in `deliver-stack.md`'s handoff. Removing that machinery reddens both —
  the intended signal — though not every assertion goes red, since the ordering comparisons still hold against a
  missing anchor. Author each replacement from the surviving contract rather than by deleting whatever failed:
  structural assertions over the specific contract (presence, uniqueness, ordering relative to merge confirmation
  and close), never a digest over a shared document.

### D11 — Delivery-aware review-gate resolution

Two failures share one cause: ARC's review-gate substrate cannot name a delivery member as a review subject, and
cannot resolve a change request whose base is a member branch. Both are ARC-internal bookkeeping. Nothing changes
provider-side — a member pull request is an ordinary pull request, reviewed like any other.

- **D11.1 Member → work unit resolves through the delivery reverse lookup.** Branch-to-work-unit resolution today
  returns `null` for any `delivery/`-prefixed branch, which blocks review status on a member head. The delivery
  state's reverse lookup supplies the answer **only at the review-gate read sites** that need a review subject.
  The shared branch-to-slug
  helper is not widened: its delivery guard is load-bearing for the roster and cleanup consumers that key off a
  non-null slug (teardown's reap filter, the orphan-branch sweep), and the lookup is head-keyed in both selector
  arms while the helper is a pure synchronous branch-name read. A narrow fallback at the reads that need it,
  never a new roster, session, or recovery authority — the same boundary D1.5 draws. The originating work-unit
  checkout remains the sole ARC session and compaction-recovery locus; member and gate checkouts are operation
  inputs only and cannot supply, borrow, or fabricate a WU load set. **Never a branch-name prefix test:** written as a
  prefix test it rots at convergence, where work-unit identity decouples from branch identity; written as a
  reverse lookup it survives intact. The rule governs _resolving ownership_; prefix tests that **exclude**
  delivery refs from the work-unit roster are a different operation and are untouched.
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
  other consumer refusing, which is a special case to maintain forever. The shared classifier remains pure: each
  caller derives and supplies its acceptable-base set from its own subject and context. The complete caller matrix
  is `handlers/review.ts`, `review-gate/policy/pre-publication-composition.ts`,
  `review-gate/status-composition.ts`, `integration/checkpoint-composition.ts`, and
  `integration/merge-composition.ts`; every one must wire the delivery-member base when its resolved subject permits
  it, rather than relying on a terminal-only exception.
- **D11.4 Discharge consults the delivery's member targets** rather than only the current branch's single open
  request — the input D3.2's fourth check requires, and the derivation seam D8.1 builds on: targets derive from
  every retained bound member at read time, including members whose physical refs were already reaped, never from
  a copied target list.
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
  no attended step. The top's base is repaired only when branch deletion fails to produce the expected host
  retarget; the ordinary path adds observation, not another host mutation (D3.4).
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
holds merge execution. D3.4's retarget is the one new host mutation surface: it appears only as a typed remedy after
branch deletion and fresh observation show the host did not retarget automatically, requires explicit invocation,
touches a pull request's base rather than any ref, and is followed by another observation before proceeding.

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
sized-to-grow aesthetics. The same Self-Check covers D7.6's method extraction: two fire points force it under the
same _Extract on fan-in_ principle, its declaration follows _Generalize the methods mechanism; declare at point of
use_ (each artifact declares only what its own body consumes), and moving the adversarial companion into the
method satisfies _Anchor triggers to operations, not workflows_ — criteria validation is the operation, and both
boundaries are sites of it. Checked against `strategy-procedure-evolution` § Self-Check for the workflow-prose
surfaces (D2.4, D7.5, D10.3) — passes under _If the CLI can compute it, the CLI computes it_ and _Verbs over
mechanics_: comparison, classification, and remedy selection stay in typed verbs; prose dispatches on returned
results and implements no loop (D10.3); the member-scope walk enters as a method parameter rather than a prose
branch (D7.6); and D6.10's consequence disclosure precomposes CLI-side per its § Emitted text principle. Two residuals are
named rather than claimed clean. Principle 5's instrument does not exist — `workflow-eval-harness` is unstarted —
so no judgment-layer prose in this design can be eval-gated; this is the corpus-wide state, not a property of this
change. And `validate-criteria`'s adversarial offer is not precomposed CLI-side, unlike D6.10's disclosure: it is
computable in principle from the plan's member task ranges and the task cursor, but that is new mechanism this
design does not charter. Checked
for forward compatibility against `draft-composable-workflows`: the `validate-criteria` shape — declaration plus
marked fire-point — matches its validated-fire-site direction, D7.6's rejection of a sibling workflow is its
fragment-substrate argument applied, and `deliver-stack` keeps the CLI-owned loop posture its loop rule requires —
no dependency on the agenda compiler is taken. D10.3's re-authored review prose in both workflows stays
dispatch-shaped for the same reason — member cardinality lives in the typed result rather than a prose arm — so both
documents stay at the fragment-extractable level its loop-workflow cap assumes.

Checked against `strategy-pm-composition-evolution` § Self-Check — it fires on two grounds, external identity
mapping and provider-specific failure states, and passes with no seam to route. The host alone stays authoritative
for pull-request state; delivery state binds references to it and reobserves before and after each mutation rather
than mirroring verdicts, so no second mutable copy exists. ARC work-unit identity is never derived from a change
request: the reverse lookup maps a member ref to its owning work unit through delivery state (D11.1), and residue
reaping keys on plan identity rather than branch shape (D9.4). The complete unlinked path, plus a declined
registration that makes zero host calls, is the standalone answer (D6.4, D6.10); provider dispatch and verdicts stay
in typed verbs behind provider-neutral prose (D10.3); and the failure surface is explicit rather than collapsed
(D6.2's typed refusal, D5.6, D9.3). No PM field, tracker binding, lifecycle synchronization, or configuration axis is
added.

## Success Criteria

1. No retained control branch and no disconnected terminal pull request exist in any delivery path. The top member
   is the work unit's own branch, its pull request is the terminal integration vehicle, and it presents with the
   ordinary work-unit template and title. Publication validates a distinct caller-authored terminal title/body with
   the complete member presentation set before mutation, and retrying an already-open exact request does not
   rewrite that presentation. Content-neutral ancestry adoption proceeds only when a dedicated in-core containment
   classification proves that reapplying the highest member leaves the top tree unchanged.
2. The terminal ceremony runs through the ordinary `arc integrate checkpoint` → interlock → `arc integrate merge`
   flow, with the delivery arm composing its claim from the attestation record, exact bound member heads, and the
   residual comparison (D3.1–D3.2).
3. After the highest non-terminal member lands, its delivery binding remains available while its remote branch is
   deleted as the host retarget trigger and the top is reobserved. Automatic retarget to the protected base proceeds
   without another mutation; an open request on the wrong base yields `retarget`, and `closed-unmerged` yields
   `reopen-and-retarget`. Either remedy requires explicit invocation and another observation, and the terminal arm
   refuses until the top is freshly observed open against the protected base (D3.4). A top whose base is a member
   branch during the landing window does not refuse (D3.3).
4. When a predecessor moves, the member is mechanically reapplied even if its before/after member trees are equal;
   only an unchanged predecessor plus equal member tree takes the tree-equality shortcut. An equivalent provider
   result carries without attended acknowledgement, a genuine reapply conflict refuses with the conflicted paths
   named, and a conflict-free divergence refuses with the divergent paths named (D4.1, D4.2, D4.5).
5. `merge-tree --merge-base` capability is established through the existing probe and reuses the existing typed
   unsupported-refusal. No new version floor, disclosure path, or degrade path exists in the change set (D4.4).
6. The aggregate-patch envelope and the linearity precondition are absent from the code base (D4.6).
7. A delivery completes while the protected base receives unrelated external landings throughout, with no freeze
   and no refresh obligated by base movement alone. When the provider or operator externally refreshes the exact
   registered suffix after a real trigger, ARC invokes no provider mutation: it freshly observes and structurally
   proves every changed member, reserves only its own post-observation settlement, genuinely content-merges the
   refreshed predecessor into the excluded terminal top, lease-publishes that top, and admits the target, suffix,
   and terminal coordinates together in one final version-checked write. Conflict, provider movement, interruption
   after top publication, and state collision remain retryable or attended without suffix-only adoption
   (Goal 3, D5.2, D5.3, D5.7).
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
    groups from recorded boundary evidence rather than re-deriving them. `validate-criteria` carries the
    adversarial companion at both scopes under one posture, offered rather than required (D7.6). Every surface
    D7.5 names carries the change in both copies, `validate-criteria` is reachable from both declared
    fire-points, and plan validation refuses member task ranges that interleave or depart from member order
    (D7.1). The central adversarial method may use a stable authored partition for two or three contract-closed
    group reviews plus a fresh seam-and-aggregate review, preserving one complete logical pass without 1:1 member
    fan-out or satisfying the stronger `review-chunking` carrier (D7.6).
11. A carried hosted-review reservation resumes on every member pull request at its exact head, and the work-unit
    obligation reports discharged only when every member review has cleared — verified at the terminal boundary as
    the conjunction over every retained binding, including members whose physical refs have already been reaped,
    never satisfied by the top's own residual review (D8.1, D8.2, D3.2, D9.1).
12. Landing an N-member stack spends N member reviews plus review of genuinely uncovered deltas. A member whose
    contribution is proved unchanged under a predecessor rewrite is not re-reviewed, and a review preserved across
    a fallback-source discharge survives append-only head movement of the top (D8.6). One equivalence arbiter
    serves both the delivery and ordinary base-merge cases; earlier attempts are found through a bounded read of
    existing lane-progress records. The contribution-applicability result is closed, exact-coordinate bound, and
    consumed identically by request admission and discharge; a residual requires a replayable explicit Owner
    selection on the existing lane-progress attempt. The distinct path-based applicability proof remains intact,
    and no duplicate contribution-equivalence projection or new record family exists.
13. A delivery member branch resolves to its owning work unit through the delivery reverse lookup — not a branch
    prefix test — so `arc review status` and the hosted request path address a member; and the terminal spine
    resolves the top's change request while its base is a member branch, rather than refusing `base-mismatch`
    (D11.1–D11.4). Every shared-resolution caller supplies its acceptable-base set. Member and gate checkouts remain
    operation inputs outside the WU session and recovery locus; the originating checkout alone owns compaction
    recovery and its load set (D1.5, D11.1).
14. Opting into native registration surfaces its review-invalidation consequence at the decision point, and
    declining it is a supported route that makes no host calls (D6.10).
15. After terminal adoption and closeout, the delivery store holds no plan or state record for the completed work
    unit, and the retirement operation refuses while an operation, member ref, or unsettled terminal remains.
    Physical teardown retains the exact member bindings until that retirement; gate-checkout reaping validates a
    deterministic ARC-owned path, expected candidate ref or head, detached state, and cleanliness without a new
    registry or HEAD-coincidence discovery. Authoring-candidate refs are reaped only under the ARC-reserved namespace
    at the exact plan/member identity and expected head; mismatches remain intact and surface (D9.1, D9.3, D9.4).
16. `strategy-integration.md` exists in the package source, is listed in `init-recipe.json` `include_files`, is
    synced to the project copy, and is reachable from `STRATEGY-INDEX.md` in both copies (D10.1).
17. One ADR records the delivery-and-review posture, its considered alternative, and both reopening triggers
    (D10.2).
18. Landing an N-member stack requires at most N landing decisions — or one contiguous-prefix decision — plus
    genuine content-conflict resolutions, with no manual recut, no per-member manual suffix adoption, and no
    synthetic ancestry-reconciliation merge on any path; every ARC-added step in the delivery path names the
    chartered failure it guards that a team on provider-native stacks does not already guard (Goal 8).
19. Every recovery result is an executable typed transition over durable state. Exact applied results adopt and
    clear only after their owner-specific postconditions and typed continuation are established; ambiguous,
    unavailable, partial, pending, or persistence-failed results retain the reservation and stop. Exact not-applied
    results follow D9.5's closed operation-owner matrix, either cancelling into the exact fresh selector without
    reused authorization or retaining and resuming the same authorized effect. The matrix is covered across every
    operation owner. Interrupted teardown resumes the affected member identically across stack cardinalities, and
    applied highest-member deletion completes the owed top observation before clearing, without a guidance-only or
    position-coincidence path (D9.5).
20. Terminal drift classification reaches substantive residual overlap without weakening generic reconcile safety:
    predecessor overlap and unclassified substantive paths refuse, exact residual overlap enters conditional
    terminal-member verification only with complete evidence and a mergeable host, and disjoint drift retains the
    ordinary generic safety result. An exact-base-plus-head reconcile runs before terminal-member validation; the
    validation walks the settled post-reconcile Candidate after its ordinary gate, recomposition, review, and
    reconcile tail. Unresolved verification stops, while resolved verification reruns checkpoint so neither
    Candidate nor base movement can reuse stale safety (D3.6, D3.8).
21. Criterion 20's terminal-member-only continuation is superseded. A guarded residual or ordinary base reconcile
    finishes through informative, rerunnable checkpoint results over existing durable facts: changed Candidate
    content requires ordinary whole-work-unit verification and a new Candidate root; a current Candidate with stale
    terminal coordinates requires only an idempotent, version-checked delivery-state rebind before checkpoint rerun.
    Neither path introduces new lineage authority, a terminal-reconcile reservation, or autonomous replay. Every
    ambiguity stops, while exact already-applied state converges by rerunning the same command (D3.9).
22. Criterion 21's whole-work-unit default is superseded. Every guarded base merge compares both base and Candidate
    heads and classifies ancestry before mutation: contained topology creates no commit, while only proven divergence
    uses `--no-ff` and must produce the exact prior-head/base parent pair. Exact new-head checks then rerun and one
    typed producer/consumer seam classifies Candidate applicability from D4's structural facts. Mechanical
    equivalence carries automatically; every non-mechanical bounded residual returns `decision-required` for an
    exact-bound `covered`, `targeted-check`, or `changed` selection by the applicable authority. Endpoint movement
    reruns the checkpoint, while failed, malformed, unsupported, unavailable, or unbounded evidence stops through
    its typed class rather than becoming a judgment call. Only an authority selection persists through the existing
    versioned Candidate store, becomes stale when any bound input changes, and adds no proof ledger, storage mode,
    semantic classifier, or recovery operation. A pure durable-baseline reducer and one asynchronous Git-backed
    effective-target projection give every Candidate consumer the same recognized target, while review/publication
    settlement remains independent. A current Candidate with stale terminal coordinates still converges through
    D3.9's idempotent rebind (D3.10, D8.7).
23. Criterion 19's general operation-owner matrix is superseded. Interrupted operations reobserve the existing
    reservation and return a typed ordinary action, its minimal exact reservation-subject selector, and
    CLI-precomposed rerun text; only overloaded `rewrite` and `land` arms add a narrow mode discriminator. The
    ordinary action rederives every non-selector input rather than persisting a downstream command request. Exact
    not-applied `publish` and `teardown` preserve a reservation their ordinary verbs consume; the other kinds/modes
    version-clear before returning fresh preparation or invocation through the closed
    `delivery-publish | delivery-rematerialize | delivery-refresh-adopt |
    delivery-land-prepare | delivery-native-land-select | delivery-teardown | delivery-top-remedy` rerun union.
    Exact applied results clear after their already-owed observation, while ambiguous or incomplete results retain
    and stop. Highest-member teardown remains reserved through fresh top observation across stack cardinalities. No
    owner or retry-policy field, recovery record family, autonomous replay, or provider-general recovery engine is
    introduced (D9.6).
24. Criterion 22's replaceable applicability binding is superseded. The Candidate record carries one ordered,
    strictly discriminated transition sequence containing approved review responses and exact-bound applicability
    selections. Covered and evidenced targeted selections advance the durable target, changed does not, and an exact
    replay does not duplicate the tail. An approved response may re-anchor only at its independently reviewed exact
    old target before advancing, preserving replay after an intentionally ephemeral machine carry; a later
    applicability selection remains reducible from the response's new target. Mechanical proof and generalized
    decision history remain absent, every Candidate consumer uses the shared reducer/effective projection, and the
    unpublished response-only record changes in place without an alias or migration reader (D3.10a).

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
