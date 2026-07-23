# Spec (`detailed` · `RFC`): review-gate-right-sizing

- **Origin:** [internal] — surfaced at `review-surface-binding`'s create-spec Gate 1, when a proportionality read
  showed the design splitting into tiers whose justification could not be settled from inside that work unit.

- **Purpose:** Settle the review-gate program at its target state and execute it: build the deterministic
  integration loop and a thin merge guard, delete the shadow machinery the target does not need, retire the three
  planned gate work units, and re-cut the backlog. Deletion is a legitimate outcome for any part of the program,
  including shipped surface.

---

## Introduction / Context

The review-gate program grew across four shipped work units (`reviewed-lane-review-gate`,
`review-gate-reconcile-composition`, `review-gate-enforcement-cutover`, `review-architecture`) and three sequenced
successors (`review-gate-enforcement-qualification`, `-promotion`, `review-gate-github-adapter`) without its
proportionality ever assessed as a whole. Each unit was justified against its own charter; none was justified
against the question _does the program need to exist at this size_.

The concern became concrete at `review-surface-binding`'s (RSB) create-spec Gate 1, where that unit's design split
into three tiers: a Tier 1 that earns its keep today (CLI verbs replacing unexecutable prose, a detached exact-head
checkout, typed results, method activation actually read, a dead-code prune); a Tier 2 whose value is entirely
contingent on a downstream consumer (the evidence model — receipt and guidance-evidence pair, disposition records,
identity/generation rigor); and a Tier 3 that exists only because Tier 2 makes review a durable multi-step
operation (freshness windows, resume, partial-publication recovery, sweeps, generation compare-and-swap). The
intended Tier-2 consumers were the three gate work units — themselves unassessed — so the bet could not be
evaluated from either end.

**Restated charter (from origin intent, not from the built machinery):** reduce integration-process friction for
both human and agent; make integration reliable and deterministic where possible; automate the mechanical part.
**Structural merge enforcement — machine authority over the merge button — was not the origin goal.** It entered
as the solution escalated across the sequence and was never separately justified against the charter.

Remediation of already-shipped overdesign has no owner, and owner-carries-it breaks precisely when the overdesign
spans a program: no single work-unit owner can settle a target state five units share. The repository has an
established consumer test for deleting built machinery — machinery with no consumer and no named downstream claim
is deleted with its tests, recoverable from history (the shipped `review-architecture` prune; RSB's specced
prune-at-consumption). This unit applies that reasoning at program scale.

### Inventory this design is priced against (verified 2026-07-22)

The subsystem is `packages/arc-framework/src/scripts/review-gate/` — ~165 source modules across
`core/ hosts/ policy/ providers/ runtime/` plus ten top-level `run-*.ts` launchers, with a comparable test
surface. Reachability splits into three tiers:

- **Adopter-shipped and invoked (~19 modules).** Exactly one CLI verb — `arc review frontline resolve` — reaching
  frontline resolution and routing policy, the registered CodeRabbit frontline source, and core record/schema
  modules. The only review surface an adopter can execute; invoked from `integrate-work-unit.md` and
  `run-errand.md`.
- **Self-hosting-only, CI-invoked in shadow (~85 modules).** Five checked-in `.github/workflows/review-gate*.yml`
  workflows plus eight root `review-gate:*` npm scripts wire the ten `run-*.ts` entry points (controller
  reconcile, attest, await, next-action / perform-action, head-mutability, token qualification, bounded repair).
  They execute on live PR events but **gate nothing**: the sole required review context is legacy CI, and
  WORKING-MEMORY instructs sessions to ignore the controller's projection. Two weeks to 2026-07-22: 200+
  wakeup-relay runs, 12 controller runs, zero attest / qualify / repair runs. The finding is that the tier
  executes and serves nothing, not that it costs too much. Both hosted adapters (`coderabbit-pr`, `codex-pr`) sit
  here on equal footing — `policy/self-hosting/` declares both `mode: partial`, the router registers only
  `enabled`, so neither is reachable today. Inert in shadow, and the salvage base for the hosted arm.
- **Dormant everywhere (~50 `core/` modules plus most of `hosts/local/`).** Receipts / ledger, guidance evidence,
  reduction / projection, operation state, generation compare-and-swap, freshness, reentry / wakeup, local stores,
  local carrier and attestation. No CLI verb, hook, npm script, or CI workflow reaches them. This tier is **RSB's
  prune-at-consumption territory, not this cut's** (§ Coordination seam).

**Prose over-reach.** Workflow prose instructs behavior against `ReviewOperationStateStore`, review receipts, gate
reduction, generation, and review-suspension records — none reachable from any command. Verified loci:
`integrate-work-unit.md` and `run-errand.md` (**RSB owns these** — its D16); the project-local
`coordinate-pr-review.md`, which also invokes `review-gate:next-action` / `:perform-action` / `:await`, three npm
scripts this cut deletes; and the two `.arc/` extensions `post-pr-open.md` / `pre-merge.md` that reach it. This WU
owns the latter three (§ Prose and documentation reconciliation).

**Recorded failure evidence (what a guard must actually prevent):** PR #287 merged a reviewed, CI-green
pre-composition head before the lifecycle tail existed (an operator sequencing slip; repaired by PR #288).
CodeRabbit demonstrated a bot approval satisfying a generic required-approval count without substantive review. No
other concrete incident is recorded in the program's artifacts.

## Goals

1. **One session, one procedure.** A session loads `integrate-work-unit.md` and runs the integration choreography
   end-to-end. The agent never asks whether to run a review, which provider to use, or whether a pass is
   authorized — configuration and typed contract decide, with agent judgment inside those bounds.
2. **Human involvement is exactly the judgment moments.** The human's judgment concerns are two — triaging findings
   (fixes/changes) and approving the release that clears the head for merge — and at convergence they **coincide in
   one structured gate** (the release approval rides the final disposition turn, not a separate stop); exceeding a
   pass ceiling is a third, by exception. Everything else is deterministic.
3. **A thin merge guard that structurally prevents the recorded operator failure.** No merge lands without a
   deliberate unlock, and every new push re-locks — so an early-merge (PR #287) and a bot approval satisfying a
   generic required-approval count are both structurally blocked, at zero standing infrastructure cost.
4. **Delete what the target does not need.** The shadow tier that gates nothing, the GitHub App / controller /
   wakeup-relay machinery, and the evidence-grade rigor whose only consumer this decision removes are deleted with
   their tests; the three gate WUs retire.
5. **Ship it working here (dogfood).** Frontline review active in this repository, hosted choreography exercised on
   a real PR, merge guard armed on `main` — a live end-to-end pass, not a paper design.
6. **Preserve forward compatibility as seams, not machinery.** Keep the contracts and extension points that let a
   higher rung attach later; defer operational machinery until its consuming lane (auto-merge evidence,
   multi-maintainer enforcement, an adopter product) is real.

## Non-Goals

This work unit does not own, and deliberately declines:

- **Structural machine authority over the merge button beyond the thin lock** (the declined rung 4 — the full
  typed evidence gate: exact-target receipts, provider qualification, hosted enforcement, merge authority). Its
  provider-trust-proof rigor exists to remove the human disposition moment from the trust chain, and that moment is
  precisely what this loop keeps.
- **The evidence-grade persistence tier as downstream satisfying evidence** — the receipt + guidance-evidence pair
  consumed as proof, generation compare-and-swap, freshness/resume as evidence machinery. This is RSB's tier; this
  WU removes its _consumer_ (see § Coordination seam) and hands RSB the consequence, but does not itself reshape
  RSB's spec.
- **RSB's D14 consume-set, the _local/frontline_ rewrite of `integrate-work-unit.md` / `run-errand.md` (its D16),
  and its `core/` / `hosts/local/` prune-at-consumption calls.** The subsystem is partitioned. Those two workflow
  files are a **shared surface**: RSB owns the local/frontline rewrite and the `invalid-input` rename; this WU adds
  the hosted-choreography + merge-guard wiring to the same files (E1), merge-order-coordinated — not a claim to the
  whole file.
- **Per-change-class merge rungs beyond the existing auto-merge lane**, and **auto-merge widening beyond trivial
  path-pure lanes** — someday/maybe, deliberately unfactored.
- **A GitHub App, webhook, or resident controller / worker** — the shape the deletion removes; not rebuilt in
  smaller form.
- **The `merge-ok` / `ci-ok` required-context rename** — that is `merge-gate-naming`'s call; this WU coordinates
  its own context name with it but does not execute the rename.

## Proposed Design

The charter made operational: deterministic CLI choreography (rung 2 of the ladder below) with an attested-release
commit status as the merge guard (a thin rung 3). Configurable throughout; deterministic wherever judgment adds
nothing.

**The ladder** (each rung must justify itself against the rung below, not against nothing):

1. Ad hoc subagent review — no persistence, no contract, no evidence. Works; costs nothing.
2. CLI-based review — a registered provider run against a defined change set, with typed results.
3. A required check asserting review occurred — cheap enforcement without an evidence model.
4. The full typed evidence gate — exact-target receipts, qualification, hosted enforcement, merge authority.

**Verdict: rung 2 plus a thin rung-3 guard.** Rung 4 is declined on the authority-anchor analysis below.

**Authority anchor.** The disposition moment — the human triaging findings with agent recommendations — is the
trust anchor of this loop. Provider output is advisory input to that human gate; convergence is asserted by the
human-held approval upstream of the lock, never re-proven host-side. This is what makes the rung-4 provider-trust
rigor purposeless here.

### A. The target operating loop (rung 2)

**A1 — Hosted-choreography verbs.** Extend `arc review` with the small typed verbs the hosted lane needs —
request, await, and thread-settlement (defer/reject replies and resolves) — JSON-in / JSON-out, following the
shipped `arc review` envelope contract (versioned request, one strict command-specific envelope,
`state -> nextAction` pairs). These are **re-homed from the useful shadow-runtime modules** rather than rewritten
where salvage is cheaper (§ D). The CLI owns validation, identity, persistence; the agent owns the judgmental loop.
No resident orchestrator.

**A2 — Hosted review fires by policy, not by ask.** Whether a hosted review runs (in addition to or instead of
frontline) is ARC-determined by configuration. Provider selection follows a configured preference order, and on an
`unavailable` outcome (the already-typed `rate-limited | transient-unavailable` result) the driver falls over to
the next configured provider automatically — no ask, no stall. **Both hosted adapters survive** the cut and re-home
behind these verbs. Two independent facts justify keeping both: each adapter is independently **config-selectable**
(so neither is dormant-with-no-consumer under the deletion test), and rate-limiting is a **real recurring
condition** — it clusters during busy parallel periods (errands and WU integrations overlapping), exactly when
losing hosted coverage or stopping to ask would bite hardest. Auto-failover is a fallback loop over the
already-typed `unavailable` outcome, not new availability-detection machinery, so it preserves deterministic
coverage (Goal 1) without babysitting (A6) at small marginal cost — its consuming lane is real, which is what
Goal 6 asks before building operational machinery.

**A3 — Triage / disposition protocol.** When findings exist, the agent presents each with the reviewer's severity,
the agent's re-grade under ARC's `review-triage` criteria (the configured materiality bar governs; the reviewer's
own weighting stays visible), and a recommended disposition. The same turn carries the agent's follow-up-pass
recommendation — absent an objection, the agent proceeds on it without a further stop (**opt-out, not opt-in**).
Approved fixes commit atomically under the disposition approval; the next stop is the next triaged report. A fix
produces a new head and therefore a new review target — nothing carries across a fix (consistent with RSB's D9).

**Disposition-report format (this loop's review surface only).** The report and the gates below use one consistent,
scannable, structurally-**marked** format so the operator recognizes them at a glance; the exact rendering (marker
glyph, layout) is iterated at build, the information elements are fixed. Per finding: the reviewer's severity, the
agent's `review-triage` re-grade, the source locus, and — **on its own discrete labeled line, never folded into the
finding's prose** — the agent's recommended disposition (its lean). Per gate (the disposition approval and the
convergence/clearance gate, A4/B3): an explicit line enumerating what approving authorizes, closing with an
open-ended `Approve (or redirect)?`. This restyles only this review loop's surface; it does not touch ARC's other
approval gates.

**A4 — Convergence is proposed, not asked.** Convergence is weak-signal — only minor / nitpick findings remaining,
the same materiality bar as the `adversarial-review` exit gate. The agent recognizes it and proposes it **inside the
final disposition turn as one structured gate**, never a separate stop — and the gate is explicit about its
consequence: approving applies the last fixes, ends review (no further pass), and fires the unlock that clears the
merge gate on this head. Because the merge-clearance is surfaced on the gate (not buried in a "no more passes"
remark), a single open-ended `Approve (or redirect)?` is an informed authorization — the same implied-approval-scope
principle by which a task gate's one approval covers work and commit; an informal "ok" to an unstructured surface
does **not** authorize the unlock. Redirecting (adjust a disposition, question a finding, call another pass) is
always available at the same gate.

**A5 — Pass ceilings.** Configurable caps on frontline and hosted cycles so passes cannot spiral; exceeding a
ceiling requires explicit user approval (the third, by-exception, human moment). Agent judgment operates inside the
ceiling. Config shape and defaults in § C1.

**A6 — Bounded await, no relay babysitting.** While a requested hosted review is pending (commonly 5–12 minutes),
the agent uses a CLI await verb that **blocks server-side** rather than an agent-side poll loop that burns a turn
per poll. The verb takes a bounded per-invocation timeout and **exits resumable**: harness command ceilings fall
inside the stated wait range, so an unbounded block is not portable, and re-invoking a bounded wait is not the
token-burning loop this rule excludes.

**A7 — PR opening is contract-satisfaction, not a fresh authorization.** When the loop exits and the deterministic
conditions are green, the PR opens. No separate ask.

### B. The merge guard — attested-release status (thin rung 3)

GitHub primitives carry most of it. **The lock is what is structural; convergence is asserted by the human-held
approval upstream of it.**

**B1 — Born-locked required commit-status context.** Branch protection requires a second context beside the CI
rollup — **ARC's methodology merge gate**, one required context alongside the CI rollup and CODEOWNERS, **named for
its assertion (ARC clears this head for merge), not its current sub-criteria** (working name `arc-cleared`; final
name per § Open Questions). The context does **not** attest review content — convergence is asserted by the
human-held approval upstream, never re-proven host-side; it attests that ARC's merge preconditions for this head
hold. Naming the assertion rather than the criteria keeps the name stable as those criteria evolve (the reviewed
lane currently gates on a deliberate human unlock plus lifecycle-readiness, B4; if lifecycle artifacts later move
to a backing store the check mechanism changes but the assertion does not) and consistent across the context's
**two posters** — the reviewed-lane unlock and the planning-lane stamp — only one of which concerns review, which
is why a `review-*` name would contradict half its own design. The context is a **commit status**, not a check
run — the same per-SHA Statuses-API mechanism the unlock uses. A required status context that has never been
posted blocks merge natively ("Expected — waiting"), so every new head is **born locked at zero CI cost**, and
per-SHA statuses **re-lock automatically on every push** — exact-head discipline with no receipts, ledger, or
compare-and-swap. The commit-status choice is load-bearing: a status context simply is-or-isn't posted for a SHA,
sidestepping the skipped-vs-never-reported check-run ambiguity the shipped merge-gate doctrine warns about.

**B2 — Planning-lane exemption (required, not optional).** A required context applies to every PR on the branch,
while the unlock fires only from a review-disposition fire-site a planning-only PR never reaches. Left unhandled,
the second context would strand every planning-lane PR at "Expected — waiting" and kill the shipped auto-merge
lane. So an **always-running CI step** posts `arc-cleared` green on the planning lane and posts nothing on the
reviewed lane — **never a conditionally-skipped check-run job**, whose skip semantics this repo has recorded
contradictory readings of. Born-locked, planning-exempt, and unlocked are one status context written by two
authorized posters.

- **Lane decision derives from the base-branch classifier, not the PR head.** The stamp step evaluates the base
  checkout's classifier against the PR's changed paths, so a PR cannot reclassify its own paths planning-only by
  editing the classifier script — the same discipline the unlock workflow applies by treating PR-head files as
  data (B4). The residual `.github/`-edit surface (a `pull_request` event runs the PR's copy of `ci.yml`, so a
  `.github/` edit could rewrite the stamp step to self-stamp) is an **ambient GitHub property the shipped CI
  rollup already shares**, not a hole this guard introduces, and is accepted under the accident-not-adversary
  threat model: a `.github/` edit is a reviewed-lane change on its CODEOWNERS surface, never an auto-stamped
  planning-lane one. The dependency is real and recorded rather than silent.

**B3 — The unlock verb.** A small CLI verb (working name `arc review unlock`; § Open Questions) fired at its
sanctioned fire-site after the release is approved at the structured convergence gate (A4). **That gate approval is
the authorization**; the agent then mechanically invokes the verb, holding its own credential and never
self-authorizing — the user can always fire directly. It dispatches a **pinned workflow** (`repository_dispatch`,
the existing repair-workflow mechanism) that validates deterministic conditions and stamps success on the exact
head.

**B4 — Readiness check: one CLI definition, two callers.** The validation dial settles at (i) authenticated
deliberate dispatch + (ii) ARC lifecycle-readiness (composition and completion artifacts present on the PR tree —
the PR #287 protection). Readiness gets **exactly one definition**: a CLI readiness check that the unlock verb
pre-flights and the pinned workflow re-runs. The workflow **never encodes its own artifact list** — a second
definition resident in YAML would drift from the lifecycle contract and either false-block or quietly stop
guarding. **The workflow checks out the PR head as data and runs the _pinned_ CLI against those files**, never the
head's own build. The reviewed-lane poster is fully head-code-free (`repository_dispatch`, not `pull_request`, so
its own YAML is base-pinned); the shared discipline is **no head-supplied _decision input_**, which is what lets
the reviewed lane carry higher evidence authority than the advisory frontline path without a PR weakening the
check that gates it. Re-proving convergence host-side — (iii) — is declined: the disposition approval sits upstream
of the trigger, and tamper-resistance against the operator is a settled non-goal.

**B5 — Trust-boundary reuse.** The pattern being reused is the shipped `review-gate-repair.yml` repair workflow's
trust boundary: pinned `checkout` at the workflow SHA, `persist-credentials: false`, and the status write isolated
behind a separate environment-gated job. Whether the unlock becomes _structural_ (a deployment environment with
required reviewers gating the dispatch — the pattern the repair workflow already uses) rather than merely
procedural is a build-time call, not asserted here.

**B6 — No GitHub App.** The pinned workflow's own token posts the status. The App identity, key lifecycle, wakeup
relay, controller reconcile loop, and check-run projection machinery are all unnecessary for this shape.
**Footprint:** one pinned unlock workflow (a second checkout of the PR head as data lifts it modestly past the
repair workflow's ~50 lines), two small CLI surfaces (the unlock verb and the readiness check both it and the
workflow call), an always-running planning-lane stamp step in CI, and one branch-protection edit. Opt-in by simply
not requiring the context.

**B7 — Setup home.** A supplemental setup workflow — sibling of `setup-merge-gate.md`, same idempotent
GitHub-flavored shape — offered from `01_verify-and-configure.md` § Optional (the established pattern for guided
opt-in host configuration). Build self-hosting-first with clean seams (config-driven identities, no hardcoded
repository assumptions); defer any packaged setup / doctor surface to a small someday/maybe stub minted at re-cut
if a real adopter exists.

### C. Configuration and activation

**C1 — Config surface.** New `review.*` axes, consistent with the existing `review.frontline_source`:

- **Hosted provider order** (`review.hosted_providers`) — an ordered list of registered hosted sources, preferred
  first; the driver falls over along it on an `unavailable` outcome (A2). **Empty by default** — hosted review is
  opt-in; both adapters ship dormant. Proposed self-hosting value `[coderabbit-pr, codex-pr]`.
- **Pass ceilings** — separate frontline and hosted caps. Proposed defaults: frontline 2, hosted 2 (exceeding
  requires explicit approval, A5). Exact values are tunable (§ Open Questions).

No new storage or PM-artifact configuration axis is added — these are operational review-behavior settings.

**C2 — Activation flip (dogfood).** Enabling the `frontline-review` method in this repository is owned by the
**method-file `override-active` flag in the project instance**, not the config axis: `.arc/system/methods/
frontline-review.md` is `active: false` (package default — opt-in, off for adopters) with `override-active: false`;
the flip sets `override-active: true` in the `.arc/` copy only (package default stays `false` under two-copy
discipline). The config axis `review.frontline_source: coderabbit-cli` already binds the source. Verify
`arc review frontline resolve` returns a live `ready`/attempt result on the next integration. This absorbs the
`USER-INBOX` capture "Enable the `frontline-review` method in the self-hosting repo"; the adopted capture drops
from the inbox at completion per the drain's back-pointer rule.

**C3 — Opt-in layering and graceful degradation.** The loop ships opt-in and degrades to nothing for an install
that configured no review. Three independent layers, each off/absent by default:

- **Frontline** — the `frontline-review` method is `active: false` by default (on here only via the C2 dogfood).
  Off → `frontline resolve` returns `skipped`.
- **Hosted** — requires ≥1 source in `review.hosted_providers` (empty by default). None → no hosted request; both
  adapters ship dormant.
- **Merge guard** — the `arc-cleared` context, unlock workflow, and protection edit are installed only by the
  opt-in setup (B7). Default install → no `arc-cleared` requirement; merges gate exactly as today.

The inline segment is **obligation-gated, not unconditional** (E3): it resolves the obligation and follows the typed
`nextAction`; an `exempt` / `skipped` / no-configured-lane result reaches end-of-chain and the whole segment
no-ops, so a default install integrates exactly as it does today — no dead actions that fire or stall. The one
composition dependency — that an unconfigured adopter's obligation default is `exempt`, not an unsatisfiable
`required` — is RSB's obligation model, carried as a coordination confirm (§ D4). `01_verify-and-configure.md`
§ Optional surfaces the guard setup (B7) and the review config so an adopter opts into exactly the lanes they want,
or none.

### D. The re-cut — deletion, retirement, and the coordination seam

Deletion legitimacy throughout rests on the established consumer test: machinery with no consumer and no named
downstream claim is deleted with its tests, recoverable from history.

**D1 — Deletion set (this WU's side of the seam).**

- The five `review-gate*.yml` CI workflows (`review-gate.yml`, `-attest.yml`, `-qualify.yml`, `-wakeup.yml`;
  `-repair.yml`'s pinned-dispatch pattern **survives as the unlock workflow's template** before its own removal).
- The eight `review-gate:*` npm scripts.
- The ten top-level `run-*.ts` launchers, and `runtime/operations.ts` (the closed launcher inventory over them —
  RSB's keep-as-contract fifth, deletable here once the launchers are gone, no downstream-WU claim).
- `runtime/` **less `runtime/local-attestation.ts` and the re-entry cluster** (both RSB's — see the seam).
- `hosts/github/**` (including `hosts/github/api/`).
- `policy/self-hosting/**` (nine modules, including `policy/self-hosting/routing.ts` — RSB raises it as an open
  question, not a claim; cut here, confirmed with RSB at spec grounding).
- The hosted provider surfaces on this WU's side: `providers/codex/**`, `providers/coderabbit/`'s PR
  trigger / observation path (`github-trigger.ts`, `github-observation.ts`, `locators.ts`) plus its non-frontline
  `adapter.ts` / `config.ts` / `frontline-plain.ts`, and the top-level `providers/router.ts` — as a
  **salvage / residue split** (D2), not a flat delete: the hosted arm is _re-homed_ (A1/A2) out of these modules;
  only the strictly-dead residue is deleted.
- The App / controller / check-run-projection machinery, with tests.

`providers/coderabbit/config.ts` (RSB keep-as-contract, owned by the qualification WU) and
`runtime/qualification-activation.ts` (owned by qualification, consumed by promotion) sit on **this** WU's side and
become deletable here once those claims are gone (D3). `core/contract-version-dispatch.ts` and
`core/forward-evidence-eligibility.ts` (RSB keep-as-contract, claimed by the github-adapter WU) sit on **RSB's**
side — this cut removes their only claim, so they become deletable, but the disposition is RSB's; handed over as a
consequence, not reached across the seam.

**D2 — Salvage-before-residue sequencing.** The shadow tier splits into a **salvage set** (the hosted-choreography
modules re-homed behind A1/A2 verbs) and a **strictly-dead residue**. The salvage set moves out behind its verbs
first; the residue is deleted after — so the choreography never builds on modules already gone, and the deletion
never races a re-home. Order inversion is therefore the normal path for salvaged modules and says nothing. This is
the coupling that keeps build-and-cut one WU (§ cohort fit): the sanctioned fallback split is
choreography-build vs. guard-plus-deletion, and it **fires only on _surface destabilization_** — the salvage /
residue line failing to hold still across passes — not on diff size.

**D3 — The three gate WUs retire outright**, through the sanctioned retirement flow (pre-commit treats a
disappearing lifecycle-meta slug as a retirement needing a finalized receipt). Harvest before deletion:

- **Qualification** (`review-gate-enforcement-qualification`): the lifecycle-readiness requirement → the unlock
  workflow's validation tier (B4-ii); the attestation-first decision rule → absorbed by this decision's authority
  anchor; the obligation-projection trigger seam (`exempt / recommended / required` consumed as the hosted-review
  trigger policy) → A2; the `integration/review-gate/` test-layout evaluation → resolves largely by deletion, fold
  the remainder into the rip-out; the wakeup-relay billing concern → moot (relay deleted).
- **Promotion** (`review-gate-enforcement-promotion`): no surviving scope; the add-before-remove
  protection-mutation discipline harvests as setup-workflow guidance (B7).
- **GitHub adapter** (`review-gate-github-adapter`): the null-reply-relation fix (direct replies) → live, thread
  settlement is in A1's scope, harvest here; the deletion-tombstone wake-up-burst-collapse fix → moot on the same
  test that moots the billing concern (scoped to the deleted wakeup-relay concurrency shape); its generic form
  (deleted-comment observation under the polling await verb) survives, stated at build time if the choreography
  needs it. The product charter dissolves per § Cross-cutting (Productization); at most a small provisional
  "review-guard setup kit" stub minted at re-cut if a placeholder is wanted.

**Retiring the gate WUs strips downstream claims from RSB's keep-as-contract five** — this is the retirement's real
cross-WU consequence, and it is a _hand-off_, not a reach: four claimants (qualification owns `config.ts` and
`qualification-activation.ts`; promotion consumes `qualification-activation.ts`; github-adapter claims the two
`core/` modules) retire here; RSB re-evaluates its two `core/` modules under the consumer test once the claim is
gone.

**D4 — Coordination seam (module ownership).** RSB's spec is readable from its sibling worktree, so the seam is
grounded against RSB's actual D14 classification, not inferred. **The seam is the authority** — where a scope list
elsewhere could be read against it, the seam wins. It partitions the subsystem completely. Confirmed against RSB's
spec: the contested top-level `policy/` directory (20 modules) partitions exactly as **11 live-closure + 7
RSB-consume + 2 boundary**, with no remainder.

| Partition                                                                     | Modules                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Owner / disposition                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Live `arc review frontline resolve` closure — untouchable by both WUs**     | 19 by transitive import from `handlers/review.ts`: 11 top-level `policy/` (`assurance-schema`, `frontline-command`, `frontline-outcome`, `frontline-resolution`, `frontline-semantic`, `frontline-source`, `independent-analysis-projection-schema`, `independent-analysis-schema`, `project-promotion-schema`, `routing-schema`, `routing`), 5 `core/` record/schema modules, `hosts/local/frontline-source-preferences.ts`, `providers/coderabbit/frontline-execution.ts` + `frontline-agent.ts` | Neither WU touches. `-schema` siblings of cut names stay live — schema-dormancy is not a directory property.                                                                                                                                                                                                                                                                                                                                 |
| **RSB's D14 consume-set**                                                     | `core/` + `hosts/local/` + **7 top-level `policy/`**: `activity`, `assurance`, `independent-analysis-projection`, `frontline-operation`, `frontline-carrier`, `frontline-response`, `frontline-follow-up`; plus `runtime/local-attestation.ts` (RSB's attest path, D12)                                                                                                                                                                                                                            | **RSB wires into production — this WU does not touch it.**                                                                                                                                                                                                                                                                                                                                                                                   |
| **This WU's shadow tier**                                                     | `runtime/` (less `local-attestation.ts` and the re-entry cluster), `hosts/github/**`, `policy/self-hosting/**`, the hosted PR surfaces (D1), the ten `run-*.ts`, the CI workflows, the npm scripts                                                                                                                                                                                                                                                                                                 | This WU cuts / re-homes (D1, D2).                                                                                                                                                                                                                                                                                                                                                                                                            |
| **RSB's atomic re-entry retirement — carved out of this WU's `runtime/` cut** | `runtime/review-reentry.ts`, `runtime/review-reentry-fallback.ts`, `runtime/review-wakeup-capability.ts` — dormant, producing `core/review-reentry-schema.ts`; RSB retires them atomically with that schema's registration, the four `core/ports.ts` wakeup interfaces, and `reconstructReviewSuspensionState`                                                                                                                                                                                     | **RSB's** — this WU deleting the three runtime modules alone would strand a producerless registered schema and dead ports on RSB's side. Stays out of this cut, exactly as `local-attestation.ts` does.                                                                                                                                                                                                                                      |
| **The two genuine boundary modules — flagged, joint-confirm with RSB**        | `policy/independent-analysis.ts` and `policy/independent-analysis-guidance.ts` — the two outside both the live closure and RSB's D14 consume-list                                                                                                                                                                                                                                                                                                                                                  | Both are shadow-reachable only through modules this cut deletes, so they orphan here — **except** RSB's D7 consumes `IndependentAnalysisProjectAugmentation`, which `independent-analysis-guidance.ts` defines. Whether that makes the guidance module RSB's is the per-module consumer-test call RSB's grounding owns. **Carried as spec-time-confirm items, confirmed jointly with RSB — not deleted out from under a possible consumer.** |

`providers/coderabbit/frontline-plain.ts` appears on both this cut's residue and RSB's D14 retire list (a
standalone dead compatibility fallback) — no conflict, both dispositions are deletion; whichever branch lands first
removes it and the other finds it gone.

**Append-only discipline across both branches; merge order settled at integration, not assumed.** Two surfaces are
**shared** with RSB and merge-order-coordinated: `integrate-work-unit.md` / `run-errand.md` (RSB's local/frontline
D16 rewrite + this WU's hosted-lane + guard wiring, E1) and TECHNICAL-OVERVIEW § 2 (E2). Coordinate merge order so
both settle coherently. **Obligation-default confirm:** confirm with RSB that an unconfigured adopter's review
obligation defaults to `exempt` / opt-in, not an unsatisfiable `required` — an inline loop that resolved `required`
with no configured lane would block a default install (§ C3).

### E. Prose and documentation reconciliation

**E1 — Workflow-prose reconciliation.** The review loop becomes ARC-owned and inline (Goal 1), so the project-level
coordinator is retired, not updated:

- **Delete `coordinate-pr-review.md`** — its entire body coordinates the deleted controller
  (`review-gate:next-action` / `:perform-action` / `:await`, `review-suspension` records, `ReviewWakeupCapability`,
  the wakeup workflow), and its findings/closure/settlement function is generically covered by the A1–A7 loop. It
  predates the dormant gate and is superseded; the prose over-reach at this locus resolves by deletion, not rewrite.
- **Edit the two extensions, keep the seams.** `post-pr-open.md` / `pre-merge.md` are generic lifecycle fire-points
  (`active: false`); remove only their now-dangling "invoke `coordinate-pr-review.md`" action, leaving each a
  reserved seam (fire-point marker and future-actions placeholder intact). The `· #post-pr-open` / `· #pre-merge`
  markers in `integrate-work-unit.md` / `run-errand.md` stay.
- **Wire the hosted choreography + `arc review unlock` inline** in `integrate-work-unit.md` (and `run-errand.md`),
  where Goal 1 puts the loop. This makes those two files a **shared surface with RSB**: RSB's D16 owns the
  local/frontline rewrite (both copies) plus the `invalid-input` rename; this WU adds the hosted-lane + guard
  wiring. Append-only, merge-order-coordinated — the same discipline as the TECHNICAL-OVERVIEW § 2 surface (E2), not
  two branches racing the same paragraphs. Author the wiring per E3.

`verify-work-unit.md`, `decompose-work-unit.md`, and the session templates carry none of it and are out of scope.

**E2 — TECHNICAL-OVERVIEW reconciliation (shared surface with RSB).** § 2 `### Self-Hosting Review Gate` narrates
the GitHub App, launchers, qualification launcher, controller, and check-run projection this cut deletes, and § 3
Infrastructure's merge-gating paragraph describes the enforcement landscape. Rewrite § 2 to describe the
post-cut state (deterministic CLI loop + thin merge guard; no App / controller), preserving the standing statement
that no host-side context is treated as merge authority beyond the deliberate lock. **This overlaps RSB's D15**,
which also edits § 2 (correcting the "outside the tsup entry graph" inaccuracy and describing the shipped CLI
surface, currently framed against a "still-repository-only hosted controller"). Merge order governs: whichever
lands second reconciles so the section neither reintroduces the deleted controller nor describes a boundary against
a machine that no longer exists. Both files are two-copy where they ship; edits originate in
`packages/arc-framework/arc/` and project into `.arc/` (the `integrate-work-unit.md` / `run-errand.md` copies are
the shared surface, E1; `coordinate-pr-review.md` is project-local, does not ship, and is deleted, not projected).

**E3 — Wiring discipline: a thin typed-dispatch driver (forward-compat).** Author the inline review segment to
invoke a verb, follow the returned `state -> nextAction` slot, and invoke the next — **all branching (obligation,
config, provider selection, guard-applicability) lives in the CLI's typed returns, never as prose conditionals.**
Graceful degradation (§ C3) is then a typed return, not a prose config-check: an unconfigured lane returns
`skipped` / `exempt` / `none` and the driver reaches end-of-chain. Judgment stays as minimal prose at exactly two
points — the triage/disposition presentation (A3) and the convergence/unlock authorization gate (A4/B3). This keeps
the shipped workflow free of agent-interpreted control-flow growth and forward-compatible with the
compiled-procedure direction (`strategy-procedure-evolution`: dispatch on precomputed slots, verbs over mechanics):
when engine-owned control flow lands, this segment compiles cleanly rather than needing a rewrite — seam
preservation, not a dependency on that model shipping (Goal 6).

## Alternatives & Rationale

**Rung 4 (the full typed evidence gate), declined — the authority-anchor argument.** The shipped rung-4 direction
anchored trust in _proven hosted-provider evidence_ (qualification matrices, evidence-grade receipts, generation
rigor) so a required check could be satisfied with no human in the trust chain — which is why hosted-reviewer
output was being promoted toward merge authority. Retaining the human disposition moment as the anchor makes
provider output advisory input to a human gate, so the provider-trust-proof rigor loses its purpose and the merge
guard only needs to assert that the choreography reached its terminal state at this exact head. Rung 4 buys
tamper-resistance against the operator — a settled non-goal (accident, not adversary, is the threat model) — at the
cost of a durable evidence authority, provider qualification machinery, and hosted enforcement. Declined.

**Check run rejected for the guard context, commit status chosen.** A required status context is-or-isn't posted
for a SHA; a check run carries skipped-vs-never-reported ambiguity the shipped merge-gate doctrine has recorded
contradictory readings of. The commit status also gives born-locked-at-zero-cost and automatic per-push re-lock
without any receipts/ledger/CAS.

**Folding the `arc-cleared` assertion into the CI rollup context, rejected.** It would put two meanings and two
writers on one context, let a post-unlock CI re-run silently re-lock a cleared head, and redefine a primitive that
ships to projects as the auto-merge lane's CI rollup. A separate `arc-cleared` context keeps each context honest.

**Conditionally-skipped check-run for the planning lane, rejected for an always-running stamp step.** Skip
semantics are exactly what this repo has read contradictorily; an always-running step that posts-green-or-posts-
nothing has no skip ambiguity.

**A GitHub App / resident controller, rejected.** The shipped machinery ran 200+ wakeup-relay and 12 controller
runs in two weeks while gating nothing. The pinned-workflow-own-token pattern (proven by the shipped repair
workflow) posts the status with none of the App identity, key lifecycle, wakeup relay, or reconcile loop.

**Splitting build from cut into two WUs, rejected (stays one WU).** `assess-cohort-fit` returned **stays one WU**
at draft-design and again at spec close: the deletion boundary is _defined by_ what the choreography keeps (the
hosted arm re-homes out of the shadow runtime), so build and cut are the same modules on shared files — splitting
them puts one WU's deletions under another's construction. Retirement, prose closure, and the dogfood pass each
fall below WU-warrant alone. Diff weight does not reopen this: LOC is a heads-up, not a trigger, and deletion LOC
is its weakest form (review surface is reference-and-test checking, not per-line judgment). The sanctioned fallback
split is choreography-build vs. guard-plus-deletion, fired by surface destabilization, not size (§ D2).

**A durable fix-carry ledger across a fix, rejected (already RSB's rejection, inherited).** A fix produces a new
head and therefore a new target; nothing carries across (A3). This trades one extra evaluator pass per fixed head
for the absence of a durable fix ledger and its interrupt surface.

## Cross-cutting Considerations

**Trust boundaries.** The merge lock is the one structural control: nothing is mergeable until the unlock fires,
and an approval count cannot fire it — so operator early-merge (PR #287) and a bot approval satisfying a generic
required-approval count are both structurally blocked. An agent inferring "CI is green, so merge" is held
_procedurally_: the agent invokes the unlock verb and holds its credential, so discipline and the fire-site, not
the lock, keep it from self-authorizing. The reviewed-lane poster is head-code-free (`repository_dispatch`); the
planning-lane stamp hardens its classifier input against PR-head reclassification; the residual `.github/`-edit
surface is the ambient GitHub property the CI rollup already shares, accepted under accident-not-adversary.

**Security.** No new secret-bearing surface; the guard removes the GitHub App and its key lifecycle. The pinned
workflow reuses the repair workflow's boundary: pinned checkout at the workflow SHA, `persist-credentials: false`,
status write behind an environment-gated job. The PR head is checked out **as data** and read by the pinned CLI,
never executed.

**Performance / cost.** The deletion removes ~15 no-op billable CI minutes/day (the wakeup-relay + controller
runs). The guard adds one always-running planning-lane stamp step (cheap) and one unlock workflow that runs only
on deliberate dispatch. Net CI cost falls.

**Testing.** The choreography verbs get contract tests over their `state -> nextAction` pairs (following the
shipped `arc review` envelope test pattern) and the re-homed provider paths keep their behavior tests. The merge
guard gets: readiness-check unit tests (the single CLI definition), a born-locked / re-lock-on-push assertion, a
planning-lane-exempt vs reviewed-lane-locked assertion, and a PR-head-as-data (no head-code-execution) assertion.
Deletion review is reference-and-test checking: after the cut, a reachability re-walk from every production entry
point shows no dangling import into deleted modules, and the deleted tests are gone with their subjects.

**Migration and rollout.** The branch-protection edit that adds the required `arc-cleared` context is the one
breaking host-config change — sequence it around the arming PR (born-locked applies the moment the context is
required, so the arming PR itself must be cleared, or the context added post-merge; the setup workflow B7 encodes
the add-before-remove discipline harvested from the promotion WU). No adopter is affected until they run the opt-in
setup. Deleted CI workflows and npm scripts stop running the moment the cut merges.

**User-facing impact.** Adopters gain the hosted-choreography verbs and an opt-in merge guard (a workflow template,
a protection edit, and a page of docs), all off by default: frontline is opt-in, hosted needs a configured provider,
the guard needs the setup (§ C3). A default install's integration is unchanged — the inline loop no-ops when no
lane is configured, and `01_verify-and-configure.md` § Optional surfaces the choices. Nothing is represented as
autonomous host-side merge authority; the human disposition moment and the human-held unlock remain the trust chain.
The review controller / App narrative leaves TECHNICAL-OVERVIEW because the machinery leaves the repository.

**Audience boundaries.** This spec and the WU notes are internal-dev-facing. The artifacts this WU _produces_ —
the choreography verbs' help text, the setup workflow, the TECHNICAL-OVERVIEW edit, the two shipped extensions —
are adopter-facing: state what is, no transitional framing, no forward-pointers to internal roadmap. The guard's
required-context name coordinates with `merge-gate-naming` and must reference only currently-shipped context names
until that stub settles.

## Success Criteria

Acceptance is a **live end-to-end pass in this repository**, not a paper design:

1. A single session loads `integrate-work-unit.md` and drives a real PR through the loop — frontline review active,
   at least one hosted review requested and awaited via the bounded await verb, findings triaged through the
   disposition protocol, convergence proposed — without ever asking whether to review, which provider, or whether a
   pass is authorized.
2. The merge guard is armed on `main`: a fresh head is born locked (a required `arc-cleared`-shaped context
   shows "Expected — waiting" with no post), a new push re-locks automatically, a planning-lane PR is stamped green
   by the always-running CI step and auto-merges, and a reviewed-lane PR merges only after the unlock verb fires on
   its exact head.
3. The unlock's readiness definition exists in exactly one place (the CLI check), pre-flighted by the unlock verb
   and re-run by the pinned workflow against the PR head **as data** (no head-supplied build or decision input);
   the workflow encodes no artifact list of its own.
4. The five `review-gate*.yml` workflows, the eight `review-gate:*` npm scripts, the ten `run-*.ts` launchers,
   `runtime/operations.ts`, `hosts/github/**`, `policy/self-hosting/**`, the App / controller / check-run
   machinery, and the hosted-PR residue are deleted with their tests. A reachability re-walk from every production
   entry point shows no import into a deleted module and no dangling `review-gate:*` reference in surviving prose.
5. Both hosted provider adapters remain live behind the choreography verbs; the availability fallback selects the
   second provider when the first is unavailable.
6. The three gate WUs (`review-gate-enforcement-qualification`, `-promotion`, `review-gate-github-adapter`) are
   retired through the sanctioned retirement flow with finalized receipts; their harvested seams land where § D3
   assigns them; RSB is handed the two `core/` keep-as-contract modules as a consequence.
7. The seam holds: no module in RSB's D14 consume-set, its re-entry retire cluster, or the live frontline closure
   is touched by this cut; the two boundary `policy/` modules are dispositioned only after joint confirmation with
   RSB.
8. `coordinate-pr-review.md` is deleted; `post-pr-open.md` / `pre-merge.md` keep their fire-point seams with the
   coordinator-invoking action removed. A grep for the deleted `review-gate:*` scripts across surviving project
   prose returns nothing (the `ReviewOperationStateStore` symbol lives only in `integrate-work-unit.md` /
   `run-errand.md` and clears via RSB's D16, not here). `integrate-work-unit.md` / `run-errand.md` carry this WU's
   inline hosted-lane + guard wiring as a shared surface with RSB, authored as a thin typed-dispatch driver (E3).
9. TECHNICAL-OVERVIEW § 2 describes the post-cut state with no residual App / controller narrative, reconciled
   with RSB's D15 edit; no added behavior is represented as autonomous host-side enforcement.
10. `frontline-review` is active in this repository via `override-active: true` in the `.arc/` method instance
    (package default unchanged), and the adopted `USER-INBOX` capture drops at completion.
11. **Configurable/opt-in for any install.** A default ARC install (frontline off, no hosted providers, guard not
    set up) completes a WU integration end-to-end with the inline review segment cleanly skipped — proving the loop
    ships opt-in and gracefully degrading, not merely working for this repo.

## Open Questions

Resolved during the work, not deferred as design debt:

- **Guard naming reconciliation** — the status context (`arc-cleared`) and the unlock verb (`arc review unlock`)
  are settled. The context is named for its **assertion** (ARC clears this head for merge), not `review-*`: it
  attests ARC's merge preconditions, not review content, and one of its two posters is the non-review planning-lane
  stamp, so a `review-*` name would contradict half its own design. The verb is `unlock`, not `release`, to avoid
  overloading the shipped `arc release` wrapper's sense of the word, and stays under `arc review` (the flow-specific
  trigger) rather than a new `arc merge` / `arc merge-guard` namespace. What remains for build time is reconciling
  the context name with the provisional `merge-gate-naming` stub (which owns the sibling CI-rollup context and whose
  own `merge-ok` → `ci-ok` call is unsettled); reference only currently-shipped context names until that stub
  settles.
- **Per-module salvage-vs-rewrite calls for the hosted choreography** — which shadow-runtime modules re-home behind
  the A1/A2 verbs vs. die as residue. Implementation latitude behind the settled verb contracts (mirrors RSB's
  internal-module-boundary latitude), resolved at build grounding; only the salvage/residue _line_ is a design
  fact (D2), the per-module placement is not.
- **Pass-ceiling default values and the provider-preference-order config key shape** (§ C1) — proposed defaults
  frontline 2 / hosted 2 and `[coderabbit-pr, codex-pr]`; confirm the exact key names and values at build time
  against the existing `review.*` config conventions.
- **The generic deleted-comment-observation form** under the polling await verb (harvested from the github-adapter
  WU, D3) — include only if the choreography's thread-settlement path needs it; otherwise it dies with the relay.
- **`policy/self-hosting/routing.ts` disposition** — cut here by the seam, but RSB raised it as an open question
  rather than a claim; confirm at grounding alongside the two boundary modules.
