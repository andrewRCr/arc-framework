# Draft: review-gate-right-sizing

- **Origin:** [internal] — surfaced at `review-surface-binding`'s create-spec Gate 1, when a proportionality read
  showed that design splitting into tiers whose justification could not be settled from inside that work unit.
- **Purpose:** Settle the review-gate program's target state and execute it — build the target integration loop,
  delete the machinery the target does not need, and re-cut the backlog to it. Deletion is a legitimate outcome
  for any part of the program, including shipped surface.
- **Class:** `Heavy` — confirmed at the 2026-07-22 draft-design entry read: a target state had to be authored, and
  the grounding surface spans a shipped 175-module subsystem, four shipped work units, one held sibling, and three
  planned successors. Compose-not-invent: no `Novel` ratchet.

---

## Grooming status (continuity)

> _Updated each planning pass. This is the resume anchor._

- **Readiness:** `maturing`, consolidated 2026-07-22 — the target state, merge-guard shape, and re-cut are settled
  and confirmed in session; this document is the integrated rewrite of that pass. The loop-exit
  `assess-design-proportionality` run returned `revise`, and both corrections are folded: the hosted provider
  adapters survive the cut (the availability fallback needs two live providers), and the merge guard's readiness
  validation composes one CLI-owned check instead of a host-side artifact list. Adversarial pass one then folded
  four further corrections: the module-ownership seam is authoritative and the cut no longer reaches `core/` or
  `hosts/local/`; § Prose over-reach names its verified loci; the merge guard's unlock is stated as a
  human-approval moment; and `hosts/local/` is no longer classified dormant wholesale. Three minor folds
  accompanied them — await-verb bounding, unlock-verb naming, and the live frontline closure. `assess-cohort-fit`
  returned **stays one WU**. Adversarial pass two then returned a blocker and five majors, all folded: the merge
  guard gains an explicit planning-lane exemption (a second required context would otherwise have stranded every
  planning PR and killed the shipped auto-merge lane); the ownership seam now partitions the subsystem completely,
  including top-level `policy/`; `runtime/local-attestation.ts` is excluded from the cut and moves to RSB with
  `review-architecture`'s open criterion 4; the release workflow runs the pinned CLI against PR-head files as
  data rather than executing head-supplied code; the § Prose over-reach repair is carried into the execution
  scope, which had kept the refuted locus list; and the sequencing rule is restated over a salvage / residue split
  instead of a self-contradicting order rule. § Guarded merge now separates structural from procedural protection.
  Adversarial pass three (authorized beyond the `Heavy` cap of 2) then returned two blockers and three majors, all
  folded against RSB's spec read directly from its sibling worktree: the ownership seam is re-grounded on RSB's
  D14 (its consume-set includes seven top-level `policy/` modules a prior pass had wrongly assigned here); the
  merge guard's `review-released` context is a commit status posted by an always-running step whose lane decision
  derives from the base classifier, not a conditionally-skipped check run over PR-head code; RSB's D16 owns the
  two lifecycle-workflow rewrites, leaving this WU the coordinator and extensions its own deletions break; and
  retiring the gate WUs is recorded as stripping downstream claims from RSB's keep-as-contract set. The
  post-settle coherence re-read then closed two residues in the re-grounded seam. Adversarial pass four (a fresh
  read of the never-fresh-reviewed seam and guard folds, verified against RSB's spec directly) confirmed the
  cross-WU grounding holds and returned one major plus two minors, all folded: the re-entry retire cluster
  (`review-reentry`, `-fallback`, `-wakeup-capability`) is carved out of this WU's `runtime/` cut as RSB's atomic
  cross-directory retirement; the merge-guard threat-model claim is narrowed to the classifier script (the
  planning-lane stamp's workflow step is head-controlled on `pull_request`, an ambient GitHub property `merge-ok`
  shares, accepted under the accident-not-adversary model); and the keep-as-contract claimant count is corrected
  for the promotion WU's consumption. Remaining items are spec-time detail (§ Open items), not fundamentals.
- **Next:** capture ceremony — persist `Class: Heavy`, verify / repoint `Design` via `arc repoint-design
  draft-created`, capture commit bundling draft + meta at the workflow-interlock.

## Problem and motivation

The review-gate program grew across four shipped work units and three sequenced successors without its
proportionality ever being assessed as a whole. Each unit was justified against its own charter; none was justified
against the question "does the program need to exist at this size."

The concern became concrete at `review-surface-binding`'s create-spec Gate 1, where that unit's design split into
three tiers: a Tier 1 that earns its keep today (CLI verbs replacing unexecutable prose, a detached exact-head
checkout, typed results, method activation actually read, a dead-code prune), a Tier 2 whose value is entirely
contingent on a downstream consumer (the evidence model — receipt and guidance-evidence pair, disposition records,
identity/generation rigor), and a Tier 3 that exists only because Tier 2 makes review a durable multi-step
operation (freshness windows, resume, partial-publication recovery, sweeps, generation compare-and-swap). The
intended Tier-2 consumers were the three gate work units — themselves unassessed, so the bet could not be evaluated
from either end.

**Restated charter (2026-07-22, from origin intent rather than from the built machinery):** reduce
integration-process friction for both human and agent; make integration reliable and deterministic where possible;
automate the mechanical part. **Structural merge enforcement — machine authority over the merge button — was not
the origin goal.** It entered as the solution escalated across the sequence and was never separately justified
against the charter.

Process lesson, recorded so the re-cut reads "already built" as spent rather than as justification: the program's
designs passed planning with less scrutiny than their weight demanded — attention was split across
early-parallelism concerns — and sunk cost then carried the sequence through several further work units.

**Why this needed its own work unit.** Prevention of future overdesign is owned (`solution-proportionality` ships
`assess-design-proportionality` as a planning-time method — shipped in PR #327; this accounting is its first real
application). Remediation of already-shipped overdesign has no owner, and owner-carries-it breaks precisely when
the overdesign spans a program: no single work-unit owner can settle a target state five units share. The
repository has an established consumer test for deleting built machinery: `review-surface-binding`'s prune pass
classified 23 dormant modules — 14 consume, 5 keep-as-contract, 4 retired with their tests plus a registered
schema and four port interfaces — on the criterion "no consumer and no named downstream claim." That pass is
specced, not yet shipped (RSB is held formalization-ready), so the precedent is the repository's settled
_reasoning_, not a completed deletion; the earlier `review-architecture` prune is the shipped instance of the same
test. This unit applies that reasoning at program scale.

## Target operating loop

The charter made operational — the target state everything below is priced against. Configurable throughout;
deterministic wherever judgment adds nothing:

- **One session, one procedure.** A session loads `integrate-work-unit.md` and runs the choreography end-to-end.
  The agent never asks whether to run a review, which provider to use, or whether a pass is authorized —
  configuration and typed contract decide, with agent judgment inside those bounds.
- **Human involvement is exactly the judgment moments.** The user engages when findings exist and are triaged: the
  agent presents each finding with the reviewer's severity, the agent's re-grade under ARC's `review-triage`
  criteria (the configured materiality bar governs; the reviewer's own weighting stays visible), and a recommended
  disposition. The same turn carries the agent's follow-up-pass recommendation — absent an objection, the agent
  proceeds on it without a further stop (opt-out, not opt-in). Approved fixes commit atomically under the
  disposition approval; the next stop is the next triaged report.
- **Convergence is proposed, not asked.** Convergence is weak-signal — only minor / nitpick findings remaining, the
  same materiality bar as the `adversarial-review` exit gate. The agent recognizes it and proposes it ("weak
  signal, no further pass justified; release after these fixes") inside the disposition turn.
- **Pass ceilings.** Configurable caps on frontline and hosted cycles (sensible defaults) so passes cannot spiral;
  exceeding the ceiling requires explicit user approval. Agent judgment operates inside the ceiling.
- **PR opening is contract-satisfaction, not a fresh authorization** — when the loop exits and the deterministic
  conditions are green, the PR opens.
- **Hosted review fires by policy, not by ask.** Whether a hosted review runs (in addition to or instead of
  frontline) is ARC-determined; provider selection follows configured preference order with availability fallback
  (e.g. CodeRabbit preferred, Codex when rate-limited), automatically. Same triage loop, plus thread-level
  obligations (defer / reject replies and resolves) handled by the agent.
- **No relay babysitting.** While a requested hosted review is pending (commonly 5–12 minutes), the agent watches
  token-efficiently — a CLI await verb that blocks, rather than an agent-side loop that burns a turn per poll —
  and acts the moment results land. The verb takes a bounded per-invocation timeout and exits resumable: harness
  command ceilings fall inside the stated wait range, so an unbounded block is not portable. Re-invoking a bounded
  wait is not the token-burning loop this rule excludes.
- **Guarded merge.** No merge can land without a deliberate unlock, and every new push re-locks. The routine
  human-approval moments are two — fixes / changes, and firing the release that unlocks the merge (exceeding a
  pass ceiling is a third, by exception). Against the recorded failure evidence the protection is uneven, and
  deliberately so: operator early-merge (PR #287) and a bot approval satisfying a generic required-approval count
  are both **structurally** blocked, since nothing is mergeable until the unlock fires and an approval count
  cannot fire it. An agent inferring "CI is green, so merge" is held **procedurally** — the agent invokes the
  unlock verb and holds its credential, so discipline and the fire-site, not the lock, are what keep it from
  self-authorizing. Whether that becomes structural (a deployment environment with required reviewers gating the
  dispatch — the pattern the repair workflow already uses) is a spec-time call, not a claim made here. The lock is
  what is structural; convergence is asserted by the human-held approval upstream of it, never re-proven
  host-side.

**Authority anchor.** The disposition moment — the human triaging findings with agent recommendations — is the
trust anchor of this loop. The shipped rung-4 design anchored trust instead in _proven hosted-provider evidence_
(qualification matrices, evidence-grade receipts, generation rigor) so a required check could be satisfied with no
human in the trust chain — which is why hosted-reviewer output was being promoted toward merge authority. With the
disposition moment retained as the anchor, provider output is advisory input to a human gate, the
provider-trust-proof rigor loses its purpose, and the merge guard only needs to assert that the choreography
reached its terminal state at this exact head.

## Inventory — what exists (verified 2026-07-22)

**Lineage.** Four review WUs have shipped: `reviewed-lane-review-gate`, `review-gate-reconcile-composition`,
`review-gate-enforcement-cutover`, and `review-architecture` (2026-q3 archive positions 08 / 09 / 10 / 30).
`review-surface-binding` is held formalization-ready on its own branch (spec authored, adversarially reviewed
three times, saved uncommitted); the three gate WUs are planned backlog.

**Code.** The subsystem is `packages/arc-framework/src/scripts/review-gate/` — 175 modules, ~26.8k LOC source,
with ~165 test files / ~27.3k LOC (test LOC edges past source). Reachability splits into three tiers:

- **Adopter-shipped and invoked (~19 modules, ~1.9k LOC).** Exactly one CLI verb — `arc review frontline resolve`
  — reaching frontline resolution and routing policy, the registered CodeRabbit frontline source, and five core
  record/schema modules. This is the only review surface an adopter can execute; it is invoked from
  `integrate-work-unit.md` and `run-errand.md`.
- **Self-hosting-only, CI-invoked in shadow (most of `runtime/`, `hosts/github/` + `api/`, `policy/self-hosting/`,
  both provider adapters — roughly 85 modules, ~14k LOC).** A few `runtime/` modules are dormant rather than
  shadow — the re-entry cluster (`review-reentry`, `review-reentry-fallback`, `review-wakeup-capability`) has no
  reachable caller and belongs to the tier below, retired on RSB's D14. Five checked-in
  `.github/workflows/review-gate*.yml`
  workflows plus eight root-`package.json` `review-gate:*` npm scripts wire all ten top-level `run-*.ts` entry
  points (controller reconcile, attest, await, next-action / perform-action, head-mutability, token qualification,
  bounded repair). They execute on live PR events but gate nothing: the sole required check is legacy `merge-ok`,
  and WORKING-MEMORY instructs sessions to ignore the controller's projection. Verified run volume (two weeks to
  2026-07-22): 200+ wakeup-relay runs, 12 controller runs, zero attest / qualify / repair runs — roughly 15 no-op
  billable minutes a day, real but not an economic concern at current volume. The finding is that the tier
  executes and serves nothing, not that it costs too much. Both hosted adapters sit here on equal footing:
  `policy/self-hosting/` declares `coderabbit-pr` and `codex-pr` alike as `mode: partial`, and the router
  registers only `enabled` declarations, so neither is reachable today — inert in shadow rather than dead, and the
  salvage base for the hosted arm.
- **Dormant everywhere (~50 `core/` modules plus most of `hosts/local/`).** Receipts / receipt ledger, guidance
  evidence, reduction / projection, operation state, generation compare-and-swap, freshness, reentry / wakeup, the
  local receipt and operation-state stores, the local carrier and attestation. No CLI verb, hook, npm script, or
  CI workflow reaches them; ~7 schema modules are additionally registered at build time only (schema artifact, no
  runtime behavior). `hosts/local/` is not dormant wholesale — `frontline-source-preferences.ts` is imported by
  `handlers/review.ts` on the live frontline path — so that directory straddles the tiers and dormancy is a
  per-module call there, never a directory-level one.

**Prose over-reach.** Workflow prose instructs behavior against `ReviewOperationStateStore`, review receipts, gate
reduction, generation, and review-suspension records — none reachable from any command. The verified loci:

- `integrate-work-unit.md` and `run-errand.md` — three passages each. Their `packages/arc-framework/arc/` copies
  are byte-identical, so every prose edit owes a package-source counterpart.
- `coordinate-pr-review.md`, the project-local review coordinator — the densest locus, and the only one that also
  invokes `review-gate:next-action`, `review-gate:perform-action`, and `review-gate:await`, three npm scripts the
  cut deletes. It is project-local and does not ship.
- The two `.arc/` extensions that reach it, `post-pr-open.md` and `pre-merge.md`. Their shipped copies carry no
  such reference — a legitimate Configurable-file divergence, so no adopter-facing breakage is in scope here.

`verify-work-unit.md`, `decompose-work-unit.md`, and the session templates carry none of it; the receipts in
`decompose-work-unit.md` are decompose / retirement receipts, a live and unrelated surface. Closing this gap (mint
the verbs or delete the prose) stands at any target.

**The satisfying-evidence seam.** RSB's groomed draft already absorbed one proportionality shrink — twelve verbs
to seven, the durable fix ledger replaced by fix-creates-new-head re-review, anti-tamper a permanent non-goal,
concurrency residue self-healing. Its remaining evidence-grade machinery is chartered by exactly one sentence:
persistence scales with "the authority the evidence carries" — that is, downstream qualification consuming local
attested evidence as satisfying evidence. The target state below removes that consumer.

**What the gate WUs would have added.** Qualification: a live hosted-provider baseline matrix requiring at least
one hosted adapter proven _satisfying_ — while both shipped hosted providers are `partial`, and its own inbound
buffer conceded neither may qualify, proposing the attestation-first fallback (attested human-triaged review as
primary satisfying evidence; hosted providers demoted to advisory finding-sources). Promotion: staged
required-check mutations promoting the App check to sole machine-review authority, with rollback rehearsal and a
final-gated closeout PR. GitHub adapter: a productized install / verify / doctor / upgrade / key-rotation /
uninstall surface, chartered as "reusable ARC delivery is the product goal."

**Recorded failure evidence** (what a guard must actually prevent): PR #287 merged a reviewed, CI-green
pre-composition head before the lifecycle tail existed (an operator sequencing slip; repaired by PR #288).
CodeRabbit demonstrated a bot approval satisfying the generic required-approval count without substantive review.
No other concrete incident is recorded in the program's artifacts.

## The decision

**The ladder.** Every rung must justify itself against the rung below, not against nothing:

1. **Ad hoc subagent review** — no persistence, no contract, no evidence. Works; costs nothing.
2. **CLI-based review** — a registered provider run against a defined change set, with typed results.
3. **A required check asserting review occurred** — cheap enforcement without an evidence model.
4. **The full typed evidence gate** — exact-target receipts, qualification, hosted enforcement, merge authority.

**Verdict: rung 2 plus a thin rung-3 guard.** The target operating loop is deterministic CLI choreography
(rung 2) with an attested-release status as the merge guard (a thin rung 3). Rung 4 is declined on the
authority-anchor analysis: its provider-trust-proof rigor exists to remove the human disposition moment from the
trust chain, and that moment is precisely what the target loop keeps. Per-change-class rungs beyond the existing
auto-merge lane are not needed; auto-merge widening beyond trivial path-pure lanes is someday/maybe and
deliberately unfactored.

**Criteria applied** (recorded so a later session does not re-derive them):

- Does the mechanism reduce operational friction for the **human operator** — fewer interactions, more
  determinism, less manual verification?
- Does it reduce operational friction for the **agent** — less prose procedure to execute by hand, fewer judgment
  calls on unstructured reviewer output?
- What concrete failure does it prevent that the next-simpler rung permits, and how often does that failure
  actually occur here?
- Is exactness concentrated where failure is destructive or irreversible, and lighter where it is retryable or
  advisory?
- Would removing it expose complexity intrinsic to the problem, or only remove complexity the solution invented?
- **Scaling posture.** Price nothing against a permanent-solo assumption: ARC's charter is team-size-agnostic and
  adoption is a stated goal. But forward compatibility means seam preservation, not prepayment — keep the
  contracts and extension points that let a higher rung attach later; defer operational machinery until its
  consuming lane (auto-merge evidence, multi-maintainer enforcement, an adopter-facing product) is real.

### Merge guard — attested-release status

GitHub primitives carry most of it:

- Branch protection requires a second context beside CI's `merge-ok` (working name `review-released`; reconcile
  naming with the provisional `merge-gate-naming` stub at spec time). The context is a **commit status**, not a
  check run — the same per-SHA Statuses-API mechanism the unlock already uses (below). A required status context
  that has never been posted blocks merge natively ("Expected — waiting"), so every new head is born locked at
  zero CI cost, and per-SHA statuses re-lock automatically on every push — exact-head discipline with no receipts,
  ledger, or compare-and-swap. The commit-status choice is load-bearing: it sidesteps the skipped-vs-never-reported
  check-run ambiguity the shipped merge-gate doctrine warns about, because a status context simply is-or-isn't
  posted for a SHA.
- **Planning-lane exemption — required, not optional.** A required context applies to every PR on the branch,
  while the release fires only from a review-disposition fire-site that a planning-only PR never reaches. Left
  unhandled, the second context strands every planning-lane PR at "Expected — waiting" and kills the shipped
  auto-merge lane on the very branch this WU's acceptance criterion arms. So an **always-running** CI step posts
  the `review-released` status green on the planning lane and posts nothing on the reviewed lane — never a
  conditionally-skipped check-run job, whose skip semantics this repo has recorded contradictory readings of. The
  status is posted through the same API the release verb uses, so born-locked, planning-exempt, and released are
  one status context written by two authorized posters, never a check run. The alternative — folding the release
  assertion into `merge-ok` itself — is declined: it puts two meanings and two writers on one context, lets a
  post-release CI re-run silently re-lock a released head, and redefines a primitive that ships to projects as the
  auto-merge lane's CI rollup.
    - _Lane decision derives from the base-branch classifier, not the PR head._ The stamp step evaluates the base
      checkout's classifier against the PR's changed paths, so a PR cannot reclassify its own paths planning-only
      by editing the classifier script — the same discipline the release workflow applies by treating PR-head
      files as data. The narrower, exact claim: no head-supplied _classifier_ decides the lane. What the base
      checkout cannot harden is the stamp _step's own workflow YAML_ — on a `pull_request` event GitHub runs the
      PR's copy of `ci.yml`, so a `.github/` edit could rewrite the step to self-stamp. That is an ambient GitHub
      property the shipped `merge-ok` shares (it too runs the PR's `ci.yml`), not a hole this guard introduces,
      and it is accepted under the accident-not-adversary threat model: a `.github/` edit is a reviewed-lane
      change its CODEOWNERS surface, never an auto-stamped planning-lane one.
    - _Accepted consequence:_ the guard leans on the lane classifier for the planning exemption. Deriving the lane
      from the base classifier keeps a PR from reclassifying its own paths; the residual `.github/`-edit surface
      rests on reviewed-lane visibility, as above. The dependency is real and recorded rather than silent.
- The unlock is a small CLI verb (`arc review release` shape; name pending per § Open items) fired at its
  sanctioned fire-site after disposition approval. **Firing it is one of the loop's two human-approval moments** —
  the agent proposes and invokes, never self-authorizes, and the user can always fire directly. It dispatches a
  pinned workflow
  (`repository_dispatch`, the existing repair-workflow mechanism) that validates deterministic conditions and
  stamps success on the exact head.
- Validation dial, settled at (i)+(ii): (i) authenticated deliberate dispatch; (ii) ARC lifecycle-readiness —
  composition and completion artifacts present on the PR tree (the PR #287 protection). Readiness gets exactly one
  definition: a CLI readiness check that the release verb pre-flights and the pinned workflow re-runs. The
  workflow never encodes its own artifact list — a second definition resident in YAML would drift from the
  lifecycle contract and either false-block or quietly stop guarding. **The workflow checks out the PR head as
  data and runs the _pinned_ CLI against those files**, never the head's own build: the repair workflow's trust
  boundary (pinned `checkout` at the workflow SHA, `persist-credentials: false`, status write isolated behind a
  separate environment-gated job) is the pattern being reused. The reviewed-lane poster is fully head-code-free
  (`repository_dispatch`, not `pull_request`, so its own YAML is base-pinned too); the planning-lane poster
  hardens its classifier input the same way but runs from `pull_request` YAML (above) — the shared discipline is
  no head-supplied _decision input_, and it is
  what lets the reviewed lane carry higher evidence authority than the advisory frontline path without a PR
  weakening the check that gates it.
  Re-proving convergence host-side — (iii) — is declined: the disposition approval sits upstream of the trigger,
  and tamper-resistance against the operator is a settled non-goal. Accident, not adversary, is the threat model.
- No GitHub App: the pinned workflow's own token posts the status (the shipped repair workflow proves the
  pattern). The App identity, key lifecycle, wakeup relay, controller reconcile loop, and check-run projection
  machinery are all unnecessary for this shape. Footprint: one pinned release workflow (a second checkout of the
  PR head as data lifts it past the repair workflow's ~50 lines), two small CLI surfaces (the release verb and the
  readiness check both it and the workflow call), an always-running planning-lane stamp step in CI, and one
  branch-protection edit. Opt-in by simply not requiring the context.
- **Setup home:** a supplemental setup workflow (sibling of `setup-merge-gate.md`, same idempotent
  GitHub-flavored shape) offered from `01_verify-and-configure.md` § Optional — the established pattern for
  guided opt-in host configuration.

### Productization posture

The thin design dissolves most of the adapter productization charter (App lifecycle, key rotation,
selected-repository scoping, uninstall choreography — all App-borne):

- **The choreography core** (typed verbs, provider preference order, ceilings, await, triage / disposition
  protocol) is framework surface — ships in the CLI and workflows to everyone, configurable, dormant when no
  provider is configured. Not a separate product.
- **The merge guard** is a workflow template plus a protection edit plus a page of docs — template-and-setup tier,
  plausibly one `arc` setup verb eventually. Build self-hosting-first with clean seams (config-driven identities,
  no hardcoded repository assumptions); defer any packaged setup / doctor surface to a small someday/maybe stub
  that fires when a real adopter exists.

## Re-cut and execution scope

The target translated into member dispositions, confirmed in session 2026-07-22. Deletion legitimacy throughout
rests on the established consumer test: machinery with no consumer and no named downstream claim is deleted with
its tests, recoverable from history.

**1. This WU is the build-and-cut execution unit.** It executes the target, not merely records it:

- _Cut:_ retire the three `review-gate-*` WUs (item 2); delete the shadow tier — the five `review-gate*.yml` CI
  workflows (the repair workflow's pinned-dispatch pattern survives as the release workflow's template), the
  `review-gate:*` npm scripts, the App / controller / check-run-projection machinery, `runtime/` (less
  `local-attestation.ts` and the re-entry cluster), `hosts/github/**`, and `policy/self-hosting/` — with their
  tests. The seam below governs every module-level exception and the top-level `policy/` split, grounded against
  RSB's D14 consume / keep / retire lists (readable from its sibling worktree); `core/` and `hosts/local/`
  dormancy, and the re-entry retire cluster that spans `runtime/` into `core/`, are RSB's prune-at-consumption
  call.
- _Build:_ the hosted-PR choreography arm (request / await / thread-settlement verbs, re-homed from the useful
  shadow-runtime modules rather than rewritten where salvage is cheaper), both hosted provider adapters re-homed
  behind those verbs — the availability fallback needs two live providers, so neither adapter is a deletion
  candidate — provider preference-order and availability-fallback configuration, pass-ceiling configuration, the
  merge guard (release verb + readiness check + pinned workflow + protection edit + the planning-lane CI stamp),
  the setup workflow above, and the workflow-prose updates this WU owns. **RSB's D16 already owns the
  `integrate-work-unit.md` / `run-errand.md` rewrite** (both copies, plus the `invalid-input` rename — its success
  criterion 11), so this WU does not touch those two files; taking them here would put two branches rewriting the
  same shipped paragraphs. This WU's prose scope is what its **own deletions** break: the project-local
  `coordinate-pr-review.md`, which invokes three `review-gate:*` npm scripts this cut deletes, and the two `.arc/`
  extensions (`post-pr-open.md`, `pre-merge.md`) that reach it. `verify-work-unit.md`, `decompose-work-unit.md`,
  and the session templates carry none of it and are out of scope. Coordinate merge order with RSB so the coordinator
  reconciliation and the workflow rewrite settle coherently.
- _Ship it working here (dogfood):_ absorbs the `USER-INBOX` capture "Enable the `frontline-review` method in the
  self-hosting repo" — flip the project activation override (`review.frontline_source` already binds
  `coderabbit-cli`; confirm whether the method-file `override-active` flag or the config axis owns the flip) and
  verify `arc review frontline resolve` returns `attempt` on the next integration. The WU's acceptance is a live
  end-to-end pass in this repository: frontline active, hosted choreography exercised on a real PR, merge guard
  armed on `main`. The adopted capture drops from the inbox at completion per the drain's back-pointer rule.
- _Class:_ stays `Heavy`. `assess-cohort-fit` ran at draft-design over the realized scope and returned **stays one
  WU**. The deletion and the choreography build are the same modules — the hosted arm is re-homed out of the
  shadow runtime, and the deletion boundary is defined by what the choreography keeps — so splitting them puts one
  WU's deletions under another's construction on shared files. Retirement, prose closure, and the dogfood pass
  each fall below WU-warrant alone. Diff weight does not reopen this: LOC is a heads-up, never the trigger, and
  deletion LOC is its weakest form, since a deletion's review surface is reference-and-test checking rather than
  per-line judgment. The sanctioned fallback split stays choreography-build vs. guard-plus-deletion, triggered by
  surface destabilization rather than size. Sequencing follows from that coupling rather than fighting it: the
  shadow tier splits into a **salvage set** and a **strictly-dead residue**, the salvage set moves out behind its
  verbs first, and the residue is deleted after — so the choreography never builds on modules already gone, and
  the deletion never races a re-home. Order inversion is therefore the normal path for salvaged modules and says
  nothing; the split fires on surface destabilization instead — the salvage / residue line failing to hold still
  across passes, which is what makes a stable cut boundary unavailable. Re-confirm at spec time.

**2. The three gate WUs retire outright** — through the sanctioned retirement flow (pre-commit treats a
disappearing lifecycle-meta slug as a retirement needing a finalized receipt). Harvest before deletion:

- _Qualification:_ the lifecycle-readiness requirement → the release workflow's validation tier (ii); the
  attestation-first decision rule → absorbed by this decision's authority anchor; the obligation-projection
  trigger seam (`exempt / recommended / required` consumed as the choreography's hosted-review trigger policy) →
  this WU's spec; the `integration/review-gate/` test-layout evaluation → resolves largely by deletion, fold the
  remainder into the rip-out; the wakeup-relay billing concern → moot (relay deleted).
- _Promotion:_ no surviving scope; the add-before-remove protection-mutation discipline harvests as
  setup-workflow guidance.
- _GitHub adapter:_ the null-reply-relation fix (direct replies) → live, thread settlement is in the choreography's
  scope, harvest into this WU. The deletion-tombstone wake-up-burst-collapse fix → **moot on the same test that
  moots the billing concern**: it is scoped entirely to the wakeup-relay concurrency shape this cut deletes; only
  its generic form (deleted-comment observation under the polling `await` verb) survives, stated at spec time if
  the choreography needs it. The product charter dissolves per § Productization posture — at most a small
  provisional "review-guard setup kit" stub minted at re-cut if a placeholder is wanted.

**3. `review-surface-binding` resumes in parallel.** Two consequence handoffs. First, the satisfying-evidence
consumer is gone, so its evidence-grade tier (the receipt + guidance-evidence pair as downstream evidence,
generation CAS, freshness / resume as evidence machinery) loses its charter — re-groom the held spec to shed it or
reduce it to the operational persistence the loop itself needs across sessions. Second, this WU retires the
github-adapter WU, which is the sole named claim keeping RSB's D14 `core/contract-version-dispatch.ts` and
`core/forward-evidence-eligibility.ts` as contract; RSB's re-groom should re-evaluate them under the consumer test
now that the claim is gone (they become deletable, but the call is RSB's — they are on its side of the seam). Its
Tier-1 core (the seven verbs, detached exact-head checkout, typed pairs, activation wiring, prose-gap closure,
prune-at-consumption) proceeds unchanged, and its D14 consume-set — including the seven top-level `policy/` modules
and `runtime/local-attestation.ts` — is RSB's to wire, untouched by this cut.
**Unblock condition:** RSB resumes once this draft's capture lands, re-grooming before finalizing.

**Coordination seam — module ownership.** RSB's spec is readable from its sibling worktree on this machine, so
the seam is grounded against RSB's actual D14 classification rather than inferred. **The seam is the authority** —
where a scope list elsewhere could be read against it, the seam wins — so it partitions the subsystem completely,
against RSB's own consume / keep / retire lists rather than against a directory-level guess.

- **The live `arc review frontline resolve` closure is untouchable by both WUs** — nineteen modules by transitive
  import from `handlers/review.ts`, including eleven top-level `policy/` (`assurance-schema`, `frontline-command`,
  `frontline-outcome`, `frontline-resolution`, `frontline-semantic`, `frontline-source`,
  `independent-analysis-projection-schema`, `independent-analysis-schema`, `project-promotion-schema`,
  `routing-schema`, `routing`), five `core/` record/schema modules, `hosts/local/frontline-source-preferences.ts`,
  and `providers/coderabbit/frontline-execution.ts` + `frontline-agent.ts`. `-schema` siblings of cut names stay
  live — schema-dormancy is not a directory property.
- **RSB owns its D14 consume-set — this WU does not touch it.** That set spans `core/` and `hosts/local/` _and_
  seven top-level `policy/` modules RSB wires into production: `activity`, `assurance`, `independent-analysis-projection`,
  `frontline-operation`, `frontline-carrier`, `frontline-response`, `frontline-follow-up` (D14, bound to RSB's
  D2/D4/D7/D9/D11). Assigning these to this WU was a prior error; they are RSB's charter, not this cut's orphans.
  `runtime/local-attestation.ts` is in the same consume-set (RSB's attest path, D12) and likewise stays out of
  this cut.
- **This WU owns the shadow tier:** `runtime/` (less `local-attestation.ts` **and the re-entry cluster below**),
  `hosts/github/**`, `policy/self-hosting/` (including `routing.ts` — RSB raises it as an open question, not a
  claim; cut here, confirmed with RSB at spec time), the hosted provider surfaces (`providers/codex/` entire, plus
  `providers/coderabbit/`'s PR trigger / observation path and the non-frontline `adapter.ts`, `router.ts`,
  `config.ts`, `frontline-plain.ts`), the ten top-level `run-*.ts`, the CI workflows, and the npm scripts.
  `frontline-plain.ts` also appears on RSB's D14 retire list (a standalone dead compatibility fallback) — no
  conflict, both dispositions are deletion; whichever branch lands first removes it and the other finds it gone.
- **The re-entry cluster is RSB's atomic retirement, carved out of this WU's `runtime/` cut.**
  `runtime/review-reentry.ts`, `runtime/review-reentry-fallback.ts`, and `runtime/review-wakeup-capability.ts`
  are on RSB's D14 retire list, and unlike `frontline-plain.ts` they are not standalone: they are dormant (no
  non-test importer, not CI-shadow), they produce `core/review-reentry-schema.ts`, and RSB retires them
  atomically with that schema's registration, the four `core/ports.ts` wakeup interfaces, and
  `reconstructReviewSuspensionState` — all `core/`, RSB's side. This WU deleting the three runtime modules alone
  would strand a producerless registered schema and dead ports on RSB's side, the exact residue the seam exists
  to prevent. So they stay out of this cut, exactly as `local-attestation.ts` does, and retire with RSB's
  cluster.
- **Two `policy/` modules are the genuine boundary — flagged, not assumed.** `independent-analysis.ts` and
  `independent-analysis-guidance.ts` are the two outside both the live closure and RSB's D14 consume-list. Both
  are shadow-reachable only through modules this cut deletes, so they orphan here — except that RSB's D7 consumes
  `IndependentAnalysisProjectAugmentation`, which `independent-analysis-guidance.ts` defines. Whether that makes
  the guidance module RSB's is exactly the per-module consumer-test call RSB's grounding owns; this WU carries
  both as spec-time-confirm items rather than deleting them out from under a possible consumer.

**Retiring the gate WUs strips downstream claims from RSB's keep-as-contract five (item 2's real consequence).**
RSB keeps five modules alive on named downstream claims, and this WU retires every claimant WU behind four of
them (`qualification-activation.ts` is claimed by two — owned by the qualification WU and consumed by the
promotion WU — both retired here; the two `core/` modules by the github-adapter WU). `providers/coderabbit/config.ts`
and `runtime/qualification-activation.ts` sit on **this** WU's side of the seam and become deletable here once
those claims are gone;
`runtime/operations.ts` is the fifth — no downstream-WU claim, an intrinsic inventory over the ten `run-*.ts`, so
it dies with the launchers this cut deletes, also this WU's. `core/contract-version-dispatch.ts` and
`core/forward-evidence-eligibility.ts` (both claimed by the github-adapter WU) sit on **RSB's** side — this cut
removes their only claim, so they become deletable, but the disposition is RSB's; hand it over as a consequence
rather than reaching across the seam. Append-only discipline across both branches; merge order settled at
integration, not assumed.

**Superseded captures:** the three gate WUs' routed proportionality captures are superseded by this unit —
answered once here rather than three times inconsistently. The related WORKING-MEMORY entry ("the whole
review-gate program is under right-sizing review") clears on its own trigger once this WU ships the decision and
the backlog is re-cut.

## Open items (spec-time)

- Which surface owns the `frontline-review` activation flip — the method-file `override-active` flag or the
  config axis from `review-architecture`'s migration.
- Guard naming, both halves: the status context (`review-released` is a working name) and the unlock verb.
  `arc review release` and the shipped `arc release` wrapper group are distinct command paths (no Commander
  conflict), but two unrelated senses of "release" in one CLI is a coherence cost worth resolving, not just the
  context. Reconcile both with the provisional `merge-gate-naming` stub.
- Per-module salvage-vs-rewrite calls for the hosted choreography (which shadow-runtime modules re-home behind
  verbs vs. die) — the module disposition pass belongs to spec grounding.
- Pass-ceiling defaults and the provider preference-order config shape.
- `assess-cohort-fit` re-run over the realized build-and-cut scope (fallback split recorded above).
