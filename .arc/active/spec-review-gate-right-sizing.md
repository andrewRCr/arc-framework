# Spec (`detailed` · `RFC`): review-gate-right-sizing

- **Origin:** [internal] — surfaced at `review-surface-binding`'s create-spec Gate 1, when a proportionality read
  showed the design splitting into tiers whose justification could not be settled from inside that work unit.

- **Purpose:** Settle the review-gate program at its target state and execute it: build a mechanically deterministic
  integration loop that preserves bounded agent judgment, add a thin merge guard, delete the shadow machinery the
  target does not need, retire the three planned gate work units, and re-cut the backlog. Deletion is a legitimate
  outcome for any part of the program, including shipped surface.

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
   end-to-end. The agent never asks whether to run a configured review, which configured source to try, or whether
   an in-ceiling pass is authorized. Typed contracts decide mechanics and expose facts; the operating agent applies
   bounded engineering judgment to applicability, interaction risk, and review strength without stopping when the
   call is clear, and discloses the call as the loop advances.
2. **Human stops track authority, not every judgment.** The human's authority concerns are applying finding-driven
   fixes or durable deferrals and approving the exact-head release (unlock plus integration); when no earlier
   mutation or commitment needs approval, final dispositions and release **coincide in one structured final
   integration gate**. Exceeding an explicit pass ceiling is a third stop, by exception. Ordinary agent judgments
   do not create permission turns: escalate material uncertainty, new authority, or a policy boundary; otherwise
   act on the recommendation and keep it visible.
3. **A thin merge guard that structurally prevents the recorded operator failure when armed.** No guarded reviewed
   merge lands without a deliberate unlock, and every new push re-locks — so an early-merge (PR #287) and a bot
   approval satisfying a generic required-approval count are both structurally blocked, at zero standing
   infrastructure cost.
4. **Delete what the target does not need.** The shadow tier that gates nothing, the GitHub App / controller /
   wakeup-relay machinery, and the evidence-grade rigor whose only consumer this decision removes are deleted with
   their tests; the three gate WUs retire.
5. **Dogfood every pre-merge-reachable path and make activation executable.** Frontline review is active in this
   repository and standard review through a hosted-PR source is exercised on a real PR carrying this WU's code.
   The merge guard is
   contract- and fixture-proven here, while its exact default-branch activation runs immediately after merge as a
   controlled Errand over disposable planning- and reviewed-lane PRs — never by waiting on organic WU traffic.
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
- **RSB's D14 consume-set, the _standard-review/local/frontline_ rewrite of `integrate-work-unit.md` /
  `run-errand.md` (its D16), and its `core/` / `hosts/local/` prune-at-consumption calls, outside A1's narrow
  result-normalization correction.** The subsystem is partitioned. Those two workflow files are a **shared
  surface**: RSB owns the landed standard-review/local/frontline rewrite and the `invalid-input` rename; this WU
  adds the hosted-PR choreography + merge-guard wiring and removes redundant evaluator transcription from the
  local result boundary, without reopening RSB's wider consume-set.
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
2. CLI-based review — a registered source run against a defined change set, with typed results.
3. A required check asserting review occurred — cheap enforcement without an evidence model.
4. The full typed evidence gate — exact-target receipts, qualification, hosted enforcement, merge authority.

**Verdict: rung 2 plus a thin rung-3 guard.** Rung 4 is declined on the authority-anchor analysis below.

**Authority anchor.** The disposition moment — the human triaging findings with agent recommendations — is the
trust anchor of this loop. Provider output is advisory input to that human gate; convergence is asserted by the
human-held approval upstream of the lock, never re-proven host-side. This is what makes the rung-4 provider-trust
rigor purposeless here.

### A. The target operating loop (rung 2)

**A1 — Hosted-PR effect verbs.** Extend `arc review` with a pure transition driver, `arc review resolve`, and the
small typed effect verbs a hosted-PR standard source needs: `arc review hosted request`, `arc review hosted await`,
and `arc review hosted settle` (thread-backed defer/reject replies and resolution). Await distinguishes
thread-backed findings, which carry reply-and-resolve settlement coordinates, from review-body nitpick and
outside-diff findings, whose settlement is explicitly not applicable. Review-body findings enter the same human
disposition gate but never cause a reply, resolution, or compensating summary comment for any disposition. Every
verb is JSON-in / JSON-out and follows the shipped `arc review` envelope contract (versioned request, one strict
command-specific envelope, `state -> nextAction` pairs). The hosted implementation lives under
`src/scripts/review-gate/hosted/`, separate
from the evidence-grade interfaces being deleted. A request result carries a self-contained handle bound to the
repository, pull request, exact head, provider, and durable host artifact; that GitHub artifact is the resumable
persistence boundary, with no local ledger or operation store. The CLI owns validation, identity, host mutation,
and transition resolution; the agent owns the judgmental loop. No resident orchestrator.

Review-result normalization follows the same ownership boundary. Immutable repository, target/tree, source,
rubric, and guidance bindings already known to the runtime are injected by the adapter/runtime into the normalized
result; an evaluator authors only evaluator-owned content such as completion status, coverage, findings, and run
identity. An adapter that still accepts a supplied binding must require exact equality and reject a mismatch, but
the ordinary path never asks an evaluator to transcribe a machine-owned digest. This removes retry churn without
weakening exact-target validation and is the one narrow downstream correction to RSB's landed local boundary.

**A2 — Review sources fire by policy, not by ask.** Frontline and standard review are independent roles.
Frontline remains the optional early pass: method activation makes it eligible, and the existing routing facts
resolve whether it skips or attempts. Standard review is the ordinary obligation-settling stream. Its
`standardReview` obligation is change-shaped; the driver selects exactly one configured standard source to
complete each pass, whether `delegated-agent` or hosted PR. Configured source lists are ordered eligibility and
fallback, never fan-out.

For either role, a completed `clean` / `findings` result stops source selection. On the confirmed-safe
`unavailable` pair (`rate-limited | transient-unavailable`), the driver falls through to the next configured source
without consuming the pass — no ask, no stall. A partial, ambiguous, malformed, stale-target, or terminal failure
does not fall through. For hosted PR, read-side network and retry-exhaustion failures normalize to
`transient-unavailable`; an observation timeout remains resumable pending. A request-side transport failure or
timeout is ambiguous unless the adapter proves that no effect occurred, so it stops rather than replaying or
falling through and risking a duplicate review.

**Both hosted-PR adapters survive** the cut and re-home behind these verbs. A small built-in registry owns each
provider ID, request command, and immutable bot/App identity; configuration selects IDs and order rather than
duplicating identity data. Two independent facts justify keeping both: each adapter is independently
**config-selectable** (so neither is dormant-with-no-consumer under the deletion test), and rate-limiting is a
**real recurring condition** — it clusters during busy parallel periods (errands and WU integrations overlapping),
exactly when losing standard-review coverage or stopping to ask would bite hardest. Auto-failover is a small
normalized outcome rule, so it preserves deterministic coverage (Goal 1) without babysitting (A6) at small
marginal cost — its consuming lane is real, which is what Goal 6 asks before building operational machinery.

**A3 — Triage / disposition and review-applicability protocol.** When findings exist, the agent presents each with
the reviewer's severity, the agent's re-grade under ARC's `review-triage` criteria (the configured materiality bar
governs; the reviewer's own weighting stays visible), and a recommended disposition. The same turn carries the
agent's follow-up recommendation — absent an objection, the agent proceeds on it without a separate pass-selection
stop (**opt-out, not opt-in**). Finding-driven fixes and durable deferrals still require approval before mutation or
commitment and land atomically. A complete record-only set that needs no mutation, external action, or durable
commitment remains proposed and may ride to the combined final gate rather than forcing a pre-candidate permission
turn.

A changed head is always a new exact target for status, unlock, and merge authorization, but not every target
movement automatically discards all prior review coverage. After a finding-driven fix, candidate-tail composition,
composition correction, or base reconcile, the operating agent inspects the exact delta and chooses the
proportionate follow-up: carry the prior complete review with targeted verification, run a focused supplemental
check, or repeat the applicable complete review role. This is an engineering applicability judgment, not a
machine-eligibility proof. Blocker/major fixes, behavioral or authority changes, contract movement, material scope
expansion, interacting edits, and genuine uncertainty lean toward complete review; narrow deterministic
record-only corrections and mechanical lifecycle products lean toward targeted verification. These are judgment
signals, not a checklist whose satisfaction must be proven.

The agent states the selected strength and its basis while advancing, but does not stop merely to ask permission for
that selection. A carried pass remains a truthful record of the exact target it reviewed; the applicability
judgment explains why its coverage still applies after the disclosed delta and never rewrites that historical
binding. No fix-carry ledger, eligibility schema, interaction oracle, or persistent review state is introduced.

A supplemental review may be user-directed, project-directed, or selected by the operating agent when observed risk
warrants focused attention and existing harness permissions and budgets allow it. Agent-selected supplementation is
disclosed as it runs and creates no authorization stop by default; new authority, material cost, or genuine scope
uncertainty is surfaced. Supplemental output enters the same triage and convergence loop, never replaces or settles
`standardReview` unless that invocation ran the standard-review contract, and introduces no registry, scheduler, or
configuration axis here.

**Disposition-report format (this loop's review surface only).** The report and the gates below use one consistent,
scannable, structurally-**marked** format so the operator recognizes them at a glance; the exact rendering (marker
glyph, layout) is iterated at build, the information elements are fixed. Per finding: the reviewer's severity, the
agent's `review-triage` re-grade, the source locus, and — **on its own discrete labeled line, never folded into the
finding's prose** — the agent's recommended disposition (its lean). Per gate (the disposition approval and the
combined convergence/release integration gate, A4/B3): an explicit line enumerating what approving authorizes,
closing with an open-ended `Approve (or redirect)?`. This restyles only this review loop's surface; it does not
touch ARC's other approval gates.

**Public PR review record.** A reviewed WU or reviewed Errand publishes one concise `## Review` section in the PR
body after final settlement. It is reader-facing disclosure, not evidence, attestation, or merge authority:

```markdown
## Review

- **Local:** CodeRabbit CLI (1 pass); Claude Opus 4.8 (2 passes)
- **Hosted PR:** Codex (1 review; see timeline)
- **Triage:** @andrewRCr — 3 addressed · 1 deferred · 0 unresolved
```

`Local` aggregates CLI and delegated-agent reviews that do not have a native PR review record; `Hosted PR`
aggregates reviews visible in the PR timeline. This is a record-location distinction, not a timing distinction, so
the summary carries no pre-/post-PR qualifiers. Tools use their product identity; delegated reviewers use the
exposed model identity. Both source lines remain present when any review ran, with `None` for an empty category; if
no review ran because the configured review segment no-opped, omit the section.

Triage counts distinct material findings across the PR's completed review passes by their final approved
disposition, not fixes or raw comments: `addressed`, `declined`, `deferred`, and `unresolved`, omitting zero-valued
categories except the integration-readiness signal `0 unresolved`. A cycle with no material finding reads
`no material findings`. The `@handle` is the GitHub identity of the person who approved the final disposition set
— normally the authenticated developer, but never inferred from PR authorship when another person supplied that
approval. The final integration gate previews this record; after approval and the unchanged exact-head mechanical
checks, the workflow updates the PR body immediately before merge. A later head mutation makes the record stale
and requires replacement after re-convergence. The workflow composes the counts from the review outputs and
dispositions it already handled. When A3 carries complete review coverage across a later narrow delta, append a
concise `Coverage` line naming the targeted verification and delta character so the final-head record never implies
that a full pass ran where it did not. Omit it when every reported pass ran on the final head. This is disclosure
from the live loop, not a receipt, fix-carry ledger, model registry, new state/schema, or `arc-cleared` validation.

**A4 — Convergence is proposed, not asked.** Convergence is weak-signal — only minor / nitpick findings remaining,
the same materiality bar as the `adversarial-review` exit gate. Before candidate assembly, that condition permits
the existing candidate tail when every mutation/commitment-bearing disposition is approved; a no-action
record-only set may remain proposed for the combined final gate. Either path grants no prospective clearance over
the not-yet-known candidate head. Composition, archive/readiness products, their push, and any base reconcile
produce a new exact target. Apply A3's review-applicability judgment to each movement rather than mechanically
rerunning every role: carry with targeted verification when the delta is confidently non-interacting, and re-run
focused or complete review when its substance warrants it.

On the final, base-clean candidate head, the agent proposes convergence **inside the final disposition turn as the
existing integration interlock**, never as an earlier or additional stop. The marked gate surfaces the exact head,
candidate-tail diff, every carried-review applicability judgment and targeted verification, PR state, merge method,
lifecycle readiness, and clean base-drift result, and states its full consequence: approving applies the last
dispositions, performs any approved channel settlement, ends review, fires the exact-head unlock when available,
and authorizes integration only after the resulting required status and the ordinary exact-head mechanical
rechecks succeed unchanged. The unlock/status wait adds no second human stop; failure, drift, or mutation
invalidates the approval and returns through A3's applicability decision or the interlock as the existing lifecycle
contract requires. A single open-ended `Approve (or redirect)?` is therefore informed integration authorization,
while an informal "ok" outside the structured surface authorizes neither unlock nor merge. Redirecting (adjust a
disposition, question an applicability call, request another pass, or request a composition correction) remains
available at the same gate.

**A5 — Pass ceilings.** Configurable positive-integer caps on frontline and standard-review cycles keep passes from
spiraling. Exhaustion is a driver-level `approval-required` state, not a provider outcome; exceeding a ceiling
requires explicit user approval (the third, by-exception, human moment). Approval returns to the next
`arc review resolve` call as a one-pass override bound to the repository, pull request, exact head, lane, exhausted
pass count, and next pass number. It authorizes only that next pass. Repeating the identical pure resolve call
before the pass advances is idempotent; reusing the override after the bound pass starts or state advances is stale
and fails. No approval ledger or raised persistent ceiling is introduced. Agent judgment operates inside the
ceiling. Config shape and defaults in § C1.

**A6 — Bounded await, no relay babysitting.** While a requested hosted review is pending (commonly 5–12 minutes),
the agent uses a CLI await verb that **blocks server-side** rather than an agent-side poll loop that burns a turn
per poll. The verb takes a bounded per-invocation timeout and **exits resumable**: harness command ceilings fall
inside the stated wait range, so an unbounded block is not portable, and re-invoking a bounded wait is not the
token-burning loop this rule excludes. Where the harness can make progress beside that wait, the session may use
the latency to draft Completion/Release Notes and plan candidate cleanup locally, refreshing the draft after any
review fix. This is speculative preparation only: it creates no required state or new mechanism, and no composition
commit, push, archive move, readiness regeneration, or destructive cleanup occurs before `review-settled`.

**A7 — PR opening is contract-satisfaction, not a fresh authorization.** When the pre-PR
frontline/delegated-agent segment exits and its deterministic conditions are green, the PR opens. No separate ask.
The opened change request then supplies the coordinates hosted-PR standard sources require; the review driver does
not absorb PR creation into a new state machine.

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

- **Lane decision derives from the base-branch classifier, not the PR head.** The stamp step runs the canonical
  `change-facts.ts` classifier from a separate checkout at the PR base SHA, through the existing
  `scripts/classify-change.sh` boundary. It classifies Git's raw base-to-head change record rather than a path-only
  projection, so both rename/copy endpoints and type/mode changes participate; an empty, unreadable, ambiguous, or
  cross-repository change fails to the reviewed lane. The planning projection includes the existing movable
  artifact families plus `research-*`, `analysis-*`, and `spec-*`, and treats the exact generated
  `.arc/backlog/ROADMAP.md` path as planning rather than forcing every readiness-regeneration commit onto the
  reviewed lane. A PR therefore cannot reclassify its own change as planning-only by editing the classifier. Fork
  PRs remain reviewed and receive no planning stamp because the `pull_request` token cannot be relied on for status
  writes. The residual `.github/`-edit surface (a
  `pull_request` event runs the PR's copy of `ci.yml`, so a `.github/` edit could rewrite the stamp step to
  self-stamp) is an **ambient GitHub property the shipped CI rollup already shares**, not a hole this guard
  introduces, and is accepted under the accident-not-adversary threat model: a `.github/` edit is a reviewed-lane
  change on its CODEOWNERS surface, never an auto-stamped planning-lane one. The dependency is real and recorded
  rather than silent.

**B3 — The unlock verb.** `arc review unlock`, fired at its sanctioned fire-site after the final candidate head is
reviewed and its release is approved at the structured convergence/integration gate (A4). **That gate approval is
the authorization**; the agent then mechanically invokes the verb, holding its own credential and never
self-authorizing — the user can always fire directly. The verb reads the canonical default branch to determine
whether the pinned `.github/workflows/arc-clearance.yml` action is installed: present selects the
`arc-clearance` `repository_dispatch`; absent returns a typed no-unlock result; unreadable or ambiguous stops.
Workflow presence governs action availability, not enforcement truth. The final integration check remains
authoritative for whether `arc-cleared` is actually required and green, so partial setup fails safely without a
branch-protection config axis or privileged protection-inspection requirement. The workflow validates deterministic
conditions and stamps success on the exact head.

**B4 — Readiness check: one narrow CLI definition, two callers.** The validation dial settles at (i)
authenticated deliberate dispatch + (ii) vehicle-specific ARC lifecycle-readiness. Readiness gets **exactly one
definition**: a CLI check over a closed request union that the unlock verb pre-flights and the pinned workflow
re-runs:

- `work-unit { slug, archiveCadence }` first binds that slug to the guarded PR: the live PR head branch must encode
  the same work-unit slug, the requested SHA must remain its exact head, and under `with-integration` the archived
  meta's `PR URL` must name that repository and PR. It then validates the exact products already required by the
  integration workflow. Under `with-integration`, the PR tree must carry the WU as `Shipped` in `completed/`, with
  Completion Notes, any present Release Notes well-formed, the archive/cohort closeout, and a coherent
  project-readiness view. Under `manual`, it must carry the WU as `Integrating` in `active/`, with its declared
  branch matching the PR head, Completion Notes, and any present Release Notes well-formed; archive and
  readiness-view products remain post-merge. Whether reader/operator-visible scope warrants Release Notes remains
  the integration workflow's human composition judgment, not a fact the deterministic guard re-infers.
- `errand { slug }` validates the strict Errand slug/branch/PR/head identity and is explicitly exempt from WU
  composition products, matching the shipped Errand integration contract.

The checker is deliberately not a generalized readiness engine. It reuses the existing meta/lifecycle parsers and
project-readiness render/compare primitives, but reads only the required files and fails closed rather than using
the lifecycle/status indexes whose normal user-facing contract skips malformed or unreadable inputs. Each required
path must resolve inside the supplied root to one regular, non-symlink file; missing, duplicate, malformed,
wrong-cadence, non-regular, symlinked, or out-of-root inputs block. The workflow **never encodes its own artifact
list** — a second definition resident in YAML would drift from the lifecycle contract and either false-block or
quietly stop guarding. **The workflow checks out the PR head as data and runs the _pinned_ CLI against those
files**, never the head's own build. The reviewed-lane poster is fully head-code-free (`repository_dispatch`, not
`pull_request`, so its own YAML is base-pinned); the shared discipline is **no head-supplied decision code or
policy**, which is what lets the reviewed lane carry higher evidence authority than the advisory frontline path
without a PR weakening the check that gates it. Re-proving convergence host-side — (iii) — is declined: the
disposition approval sits upstream of the trigger, and tamper-resistance against the operator is a settled
non-goal.

**B5 — Trust-boundary reuse.** The pattern being reused is the shipped `review-gate-repair.yml` repair workflow's
trust boundary: pinned `checkout` at the workflow SHA, `persist-credentials: false`, and the status write isolated
behind a separate job using the secretless `arc-clearance` environment. Setup provisions or verifies that
environment with a default-branch deployment policy and no required reviewer: the structured convergence gate
already owns the human authorization, so a second human stop would add ceremony rather than authority. Writer
isolation remains least-privilege containment, not a second authorization system.

**B6 — No GitHub App.** The pinned workflow's own token posts the status. The App identity, key lifecycle, wakeup
relay, controller reconcile loop, and check-run projection machinery are all unnecessary for this shape.
**Footprint:** `.github/workflows/arc-clearance.yml` (a second checkout of the PR head as data lifts it modestly
past the repair workflow's ~50 lines), two small CLI surfaces (the unlock verb and the readiness check both it and
the workflow call), one exact-ref extension to the existing canonical lane classifier, an always-running
planning-lane stamp step in CI, one packaged drop-in workflow template, and one branch-protection edit. Opt-in by
simply not requiring the context.

**B7 — Setup home.** `setup-arc-clearance.md`, a supplemental setup workflow sibling of `setup-merge-gate.md`
with the same idempotent GitHub-flavored shape, is offered from `01_verify-and-configure.md` § Optional (the
established pattern for guided opt-in host configuration). It installs or reconciles a packaged
`arc-clearance.yml` template on the default branch, then provisions/verifies the fixed workflow event, environment
policy, and `arc-cleared` context. The installed template runs the exact `@arc-framework/cli` version recorded by
the project's framework manifest; setup requires that version to match the executing CLI before rendering the
package spec. This repository's pre-release dogfood workflow instead builds the trusted default-branch source, but
both acquisition forms share the same parsed workflow and readiness/status contract fixtures. Protocol identities
are fixed rather than new configuration axes; no App, custom action framework, or doctor subsystem is added.

### C. Configuration and activation

**C1 — Config surface.** Four flat `review.*` axes:

- **Frontline source order** (`review.frontline_sources`) — a comma-separated ordered string of registered
  frontline source IDs, with the developer-level `arc.frontlineSources` list overriding the project list. Empty by
  default; method activation and routing still decide whether an eligible list is attempted.
- **Standard source order** (`review.standard_sources`) — a comma-separated ordered string of registered standard
  source IDs. `delegated-agent`, `coderabbit-pr`, and `codex-pr` are independent eligible carriers for the same
  role; the first capable source is selected, and later sources are safe fallbacks, never additional passes.
  **Empty by default** — standard review is opt-in. The self-hosting value is
  `coderabbit-pr,codex-pr,delegated-agent`.
- **Pass ceilings** — `review.frontline_max_passes` and `review.standard_max_passes`, each a positive safe integer
  with default `2` (exceeding requires explicit approval, A5).

The clean pre-GA rename replaces `review.frontline_source` / `arc.frontlineSource` directly; neither was present in
the latest published package, so no alias, dual read, deprecation, or migration is added. Supplemental review
remains explicit and open-ended rather than acquiring a configuration axis. No new storage or PM-artifact
configuration axis is added — these are operational review-behavior settings.

**C2 — Activation flip (dogfood).** Enabling the `frontline-review` method in this repository is owned by the
method file's `active` contract in the project instance, not the config axis: the package source remains
`active: false` (opt-in, off for adopters), while the `.arc/` copy sets `active: true`. Both retain
`override-active: false` because the project defines no override body. The config axis
`review.frontline_sources: coderabbit-cli` binds the preferred source. Verify the
frontline resolution and standard review through a hosted-PR source live against a real fixture PR carrying this
branch before merge; the exact `main` guard activation remains the post-merge Errand from Goal 5. This absorbs the
`USER-INBOX` capture "Enable the `frontline-review` method in the self-hosting repo"; the adopted capture drops
from the inbox at completion per the drain's back-pointer rule.

**C3 — Opt-in layering and graceful degradation.** The loop ships opt-in and degrades to nothing for an install
that configured no review. Three independent layers, each off/absent by default:

- **Frontline** — the `frontline-review` method is `active: false` by default (on here only via the C2 dogfood),
  and `review.frontline_sources` is empty. Inactive or empty → `frontline resolve` returns `skipped`.
- **Standard review** — requires at least one source in `review.standard_sources` (empty by default). None → the
  driver no-ops even when the change-shaped `standardReview` obligation is non-exempt; hosted adapters and
  `delegated-agent` remain dormant.
- **Merge guard** — the `arc-cleared` context, unlock workflow, and protection edit are installed only by the
  opt-in setup (B7). Default install → no `arc-cleared` requirement; merges gate exactly as today.

The inline segment is **obligation- and source-gated, not unconditional** (E3): `arc review resolve` consumes RSB's
change-shaped `standardReview` projection rather than recomputing policy from configuration, then owns the opt-out
and follows `nextAction`. An empty `review.standard_sources` list reaches end-of-chain and the whole standard
segment no-ops regardless of the obligation, so a default install integrates exactly as it does today — no dead
actions that fire or stall. A nonempty list with no source able to satisfy the requested target returns explicitly
`unavailable`; configuration never demotes the obligation. Frontline is orthogonal to that predicate. Every source
is advisory and human-disposition-anchored: the obligation settles through completed review plus approved
dispositions/convergence, never through evidence-grade provider proof. `01_verify-and-configure.md` § Optional
surfaces the guard setup (B7) and review config so a project opts into exactly the roles and sources it wants, or
none.

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
- `policy/self-hosting/**` (nine modules, including `policy/self-hosting/routing.ts` — assigned to this cut because
  RSB raises it as an open question, not a claim; recheck the landed import graph before deletion).
- The hosted provider surfaces on this WU's side: `providers/codex/**`, `providers/coderabbit/`'s PR
  trigger / observation path (`github-trigger.ts`, `github-observation.ts`, `locators.ts`) plus its non-frontline
  `adapter.ts` / `config.ts` / `frontline-plain.ts`, and the top-level `providers/router.ts`. Provider observation
  parsers and request/locator behavior re-home behind A1/A2's lean contract; evidence qualification, receipt
  binding, guidance-evidence, and controller routing die as residue.
- The App / controller / check-run-projection machinery, with tests.

`providers/coderabbit/config.ts` (RSB keep-as-contract, owned by the qualification WU) and
`runtime/qualification-activation.ts` (owned by qualification, consumed by promotion) sit on **this** WU's side and
become deletable here once those claims are gone (D3). `core/contract-version-dispatch.ts` and
`core/forward-evidence-eligibility.ts` (RSB keep-as-contract, claimed by the github-adapter WU) sit on **RSB's**
side — this cut removes their only claim, so they become deletable, but the disposition is RSB's; handed over as a
consequence, not reached across the seam.

**D2 — Salvage-before-residue sequencing.** The shadow tier splits by behavior, not by whole module. Re-home the
provider observation parsers and request/locator behavior; bounded deadline, backoff, and head-staleness behavior
from `runtime/await.ts`; the developer-authenticated `gh` process boundary from `runtime/gh-action-port.ts`; and
direct reply, canonical confirmation, and thread resolution from `runtime/settlement-runtime.ts` plus
`hosts/github/settlement.ts`. Do not re-home `hosts/github/await-observation.ts` (aggregate check-run state),
`hosts/github/change-request.ts` (change facts rather than settlement), the receipt-backed portions of
`runtime/finding-settlement.ts`, `core/provider-fallback.ts`, or `providers/router.ts`. The new hosted adapters and
registry are intentionally smaller than `ReviewProviderAdapter`: request, observe, normalize, and built-in identity
metadata only. Salvage moves first and residue deletes after, so the choreography never builds on modules already
gone. This coupling keeps build-and-cut one WU (§ cohort fit); the sanctioned fallback split fires only on surface
destabilization, not diff size.

**D3 — The three gate WUs retire outright.** Harvest before deletion:

- **Qualification** (`review-gate-enforcement-qualification`): the lifecycle-readiness requirement → the unlock
  workflow's validation tier (B4-ii); the attestation-first decision rule → absorbed by this decision's authority
  anchor; the obligation-projection trigger seam (`exempt / recommended / required` consumed as standard-review
  trigger policy) → A2; the `integration/review-gate/` test-layout evaluation → resolves largely by deletion,
  fold the remainder into the rip-out; the wakeup-relay billing concern → moot (relay deleted).
- **Promotion** (`review-gate-enforcement-promotion`): no surviving scope; the add-before-remove
  protection-mutation discipline harvests as setup-workflow guidance (B7).
- **GitHub adapter** (`review-gate-github-adapter`): the null-reply-relation fix (direct replies) → live, thread
  settlement is in A1's scope, harvest here; missing or deleted comment state is one explicit settlement outcome,
  without retaining relay-specific deleted-comment polling. The deletion-tombstone wake-up-burst-collapse fix and
  its polling form are moot on the same test that moots the billing concern: both are scoped to the deleted wakeup-
  relay concurrency shape. The product charter dissolves per § Cross-cutting (Productization); at most a small
  provisional "review-guard setup kit" stub is minted at re-cut if a placeholder is wanted.

**Retiring the gate WUs strips downstream claims from RSB's keep-as-contract five** — this is the retirement's real
cross-WU consequence, and it is a _hand-off_, not a reach: four claimants (qualification owns `config.ts` and
`qualification-activation.ts`; promotion consumes `qualification-activation.ts`; github-adapter claims the two
`core/` modules) retire here; RSB re-evaluates its two `core/` modules under the consumer test once the claim is
gone.

The three targets are branchless `planned` stubs, so their sanctioned retirement is the direct `arc abandon`
transition, not decomposition: preflight the closed three-slug impact batch, obtain explicit destructive
authorization, then abandon downstream-first so no surviving dependent temporarily points at a removed
prerequisite. Each transition atomically records its finalized direct-retirement receipt or rolls back. The
abandoned slug then resolves `nonexistent`; the receipt is the durable authority. Remove the three now-ownerless
identity-global inbox captures that target the retired WUs, while preserving the separately captured post-merge
activation Errand.

**Architectural record.** This target state replaces ADR-028's accepted decision to compose merge truth under a
dedicated App-owned evidence gate. Execution writes the next available ADR for the human-anchored CLI loop plus
thin deliberate lock, updates ADR-028's status to `Superseded by ADR-…`, and leaves its body and existing amendments
intact as history. An append-only amendment is insufficient because the authority model itself changes.

**D4 — Coordination seam (module ownership).** RSB's spec and finalized task list are readable from its sibling
worktree, so the seam is grounded against RSB's actual D14 classification, its implementation Tasks 1.1–1.3 and
7.1–7.5, and the joint obligation/source-model settlement, not inferred.
**The seam is the authority** — where a scope list elsewhere could be read against it, the seam wins. It
partitions the subsystem completely. The contested top-level `policy/` directory (20 modules) partitions exactly
as **11 live-closure + 7 RSB-consume + 2 RSB standard-review boundary**, with no remainder.

| Partition                                                                          | Modules                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Owner / disposition                                                                                                                                                                                                                                                                                                                                                 |
| ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Live `arc review frontline resolve` closure — RSB-owned coordinated first edit** | 19 by transitive import from `handlers/review.ts`: 11 top-level `policy/` (`assurance-schema`, `frontline-command`, `frontline-outcome`, `frontline-resolution`, `frontline-semantic`, `frontline-source`, `standard-review-projection-schema`, `standard-review-schema`, `project-promotion-schema`, `routing-schema`, `routing`), 5 `core/` record/schema modules, `hosts/local/frontline-source-preferences.ts`, `providers/coderabbit/frontline-execution.ts` + `frontline-agent.ts` | RSB Tasks 1.1–1.3 perform the clean pre-GA rename (`independent-analysis` → `standard-review`) across the obligation field and schemas and make the frontline resolver accept an ordered source list. This WU consumes that landed contract and otherwise leaves the closure untouched. `-schema` siblings stay live — schema dormancy is not a directory property. |
| **RSB's D14 consume-set**                                                          | `core/` + `hosts/local/` + **7 top-level `policy/`**: `activity`, `assurance`, `standard-review-projection`, `frontline-operation`, `frontline-carrier`, `frontline-response`, `frontline-follow-up`; plus `runtime/local-attestation.ts` (RSB's attest path, D12)                                                                                                                                                                                                                       | **RSB wires into production.** This WU preserves the set except for A1's narrow result-normalization correction that removes evaluator transcription of runtime-owned bindings. The local command/channel namespace remains `local`; its configured standard-source identity is `delegated-agent`.                                                                  |
| **This WU's shadow tier**                                                          | `runtime/` (less `local-attestation.ts` and the re-entry cluster), `hosts/github/**`, `policy/self-hosting/**`, the hosted PR surfaces (D1), the ten `run-*.ts`, the CI workflows, the npm scripts                                                                                                                                                                                                                                                                                       | This WU cuts / re-homes (D1, D2).                                                                                                                                                                                                                                                                                                                                   |
| **RSB's atomic re-entry retirement — carved out of this WU's `runtime/` cut**      | `runtime/review-reentry.ts`, `runtime/review-reentry-fallback.ts`, `runtime/review-wakeup-capability.ts`, `providers/coderabbit/frontline-plain.ts`, `core/contract-version-dispatch.ts`, `core/forward-evidence-eligibility.ts`, and `core/review-reentry-schema.ts`; RSB also removes the schema registration, four wakeup ports, and orphaned reconstruction symbols                                                                                                                  | **RSB Task 7.1.** This WU preserves the landed absence and never recreates any member of the retire-set.                                                                                                                                                                                                                                                            |
| **RSB's standard-review boundary modules — joint disposition confirmed**           | `policy/standard-review.ts` and `policy/standard-review-guidance.ts` — the renamed pair outside the live closure and original D14 consume-list                                                                                                                                                                                                                                                                                                                                           | **RSB Task 7.2 keeps both.** Its standard-review policy consumes the guidance augmentation type, so the consumer test keeps the pair together. This WU neither deletes nor edits them.                                                                                                                                                                              |

`providers/coderabbit/frontline-plain.ts` appears on both this cut's residue and RSB's D14 retire list (a
standalone dead compatibility fallback) — no conflict, both dispositions are deletion; whichever branch lands first
removes it and the other finds it gone.

**Append-only discipline across both branches; RSB integrates first.** Three surfaces are coordinated: the live
closure's rename plus ordered-frontline resolver (RSB Tasks 1.1–1.3); `integrate-work-unit.md` / `run-errand.md`
(RSB Task 7.5's standard-review/local/frontline rewrite + this WU's hosted-PR + guard wiring, E1); and the
project-owned `.arc/reference/TECHNICAL-OVERVIEW.md` § 2 (RSB Task 7.4 + this WU's E2). Tasks 1.1–1.3 are RSB's first
implementation increment on its branch, but the WU remains one branch merged to `main` once: absent an explicit
decomposition, RGRS waits for RSB's full integration rather than consuming a partial delivery. This WU may advance
non-overlapping hosted/guard work in parallel, but reconciles with RSB-landed `main` before its review-policy driver
or shared workflow consumers begin; it never recreates the renamed obligation or plural frontline resolver. This
sequencing is task-scoped, not a hard WU `Depends On`. RSB's owned re-entry retirement stays an ownership boundary,
not a survival requirement: preserve its state as found and never restore a cluster RSB has removed.

**Obligation/default and trust-boundary confirm.** RSB keeps `standardReview` change-shaped; the driver owns source
selection and opt-out. No configured standard source returns a clean no-op regardless of that obligation. A
non-empty source list that cannot satisfy the target returns `unavailable`. Frontline stays independent. The
`delegated-agent` receipt is durable but advisory, not evidence-grade; an exact pass remains bound to the target it
reviewed, while A3's disclosed applicability judgment determines whether later narrow target movement needs
targeted verification or a new complete pass.

**Selected-scope seam with `review-chunking`.** `arc review resolve` accepts the caller's selected review scope
(`whole-target` or `chunked`) before ordered source resolution; omission preserves today's whole-target behavior.
Chunked mode admits only local curated-scope carriers, while whole-target mode retains ordinary configured
eligibility and provider-specific capability checks. Generic project thresholds remain advisory policy rather than
provider truth. A complete chunk series consumes one logical frontline or standard-review pass, never one pass per
chunk, and any exact-target movement invalidates the prior selection. `review-chunking` owns threshold configuration,
exact-target measurement, advisory rendering, and the typed `arc review chunking resolve` preflight. This WU owns
automatic lifecycle consumption: `integrate-work-unit.md` and `run-errand.md` invoke that preflight once per new
canonical target before review-source resolution, reuse target-level facts while the target is unchanged, select
whole-target or chunked separately for each review-role invocation, and re-run the preflight after target movement.
The review driver owns the selected-scope input, capability filtering, fallback, and pass accounting.

### E. Prose and documentation reconciliation

**E1 — Workflow-prose reconciliation.** The review loop becomes ARC-owned and inline (Goal 1), so the project-level
coordinator is retired, not updated:

- **Delete `coordinate-pr-review.md`** — its entire body coordinates the deleted controller
  (`review-gate:next-action` / `:perform-action` / `:await`, `review-suspension` records, `ReviewWakeupCapability`,
  the wakeup workflow), and its findings/closure/settlement function is generically covered by the A1–A7 loop. It
  predates the dormant gate and is superseded; the prose over-reach at this locus resolves by deletion, not rewrite.
- **Edit the project extension configuration, keep the seams.** The packaged `post-pr-open.md` / `pre-merge.md`
  defaults are already empty reserved fire-points (`active: false`). Remove the now-dangling
  "invoke `coordinate-pr-review.md`" actions and link definitions from the configurable `.arc/` instances only,
  retaining their future-actions placeholders. The `· #post-pr-open` / `· #pre-merge` markers in
  `integrate-work-unit.md` / `run-errand.md` stay.
- **Wire the standard-review driver's hosted-PR actions + `arc review unlock` inline** in
  `integrate-work-unit.md` (and `run-errand.md`), where Goal 1 puts the loop. This makes those two files a
  **shared surface with RSB**: RSB Task 7.5 (D16) owns the standard-review/local/frontline rewrite (both copies)
  plus the `invalid-input` rename; this WU adds hosted-PR source dispatch + guard wiring. Append-only and RSB-first — the
  same discipline as the project-owned TECHNICAL-OVERVIEW § 2 surface (E2), not two branches racing the same
  paragraphs. Author the wiring per E3.

`verify-work-unit.md`, `decompose-work-unit.md`, and the session templates carry none of it and are out of scope.

**E2 — TECHNICAL-OVERVIEW reconciliation (shared surface with RSB).** The self-hosting
`.arc/reference/TECHNICAL-OVERVIEW.md` is `Scaffolded`: it rendered once from the generic package template and is
project-owned thereafter. Its § 2 `### Self-Hosting Review Gate` narrates the GitHub App, launchers, qualification
launcher, controller, and check-run projection this cut deletes, and § 3 Infrastructure's merge-gating paragraph
describes the enforcement landscape. Rewrite those sections in the project instance to describe the post-cut state
(deterministic CLI loop + thin merge guard; no App / controller), preserving the standing statement that no
host-side context is treated as merge authority beyond the deliberate lock. **This overlaps RSB Task 7.4 (D15)**, which
also edits the same project-owned § 2 (correcting the "outside the tsup entry graph" inaccuracy and describing the
shipped CLI surface, currently framed against a "still-repository-only hosted controller"). Merge order governs:
whichever branch lands second reconciles so the section neither reintroduces the deleted controller nor describes
a boundary against a machine that no longer exists. Leave
`packages/arc-framework/arc/reference/TECHNICAL-OVERVIEW.template.md` generic and unchanged; Framework projection
does not apply to Scaffolded content. The `integrate-work-unit.md` / `run-errand.md` copies remain the shipped
two-copy shared surface (E1); `coordinate-pr-review.md` is project-local and is deleted, not projected.

**E3 — Wiring discipline: a thin typed-dispatch driver (forward-compat).** Author the inline review segment to
invoke a verb, follow the returned `state -> nextAction` slot, and invoke the next — **all branching (obligation,
config, provider selection, unlock availability) lives in the CLI's typed returns, never as prose conditionals.**
Graceful degradation (§ C3) is then a typed return, not a prose config-check: an empty standard-source list returns
the clean no-op terminal; a configured list with no eligible source returns `unavailable`. Typed returns own
mechanical state; they do not displace operating judgment. The workflow calls for agent judgment where facts alone
cannot decide proportional review strength, applicability across a delta, interaction risk, or useful supplemental
attention. Confident bounded calls advance without a permission stop and remain visible in the report/final gate;
material uncertainty or new authority surfaces. Supplemental review enters the same triage/convergence loop but is
neither automatically scheduled by a new controller nor treated as standard-review satisfaction unless it ran the
standard-review contract. This keeps the shipped workflow free of agent-interpreted mechanical control-flow growth
and forward-compatible with the compiled-procedure direction (`strategy-procedure-evolution`: dispatch on
precomputed slots, verbs over mechanics) without pretending judgment can or should compile into a transition
table — seam preservation, not a dependency on that model shipping (Goal 6).

The driver composes at existing lifecycle boundaries rather than absorbing them: frontline and a
`delegated-agent` standard source may run before PR creation; the opened PR enables hosted-PR standard sources;
preliminary settlement permits candidate assembly; and the candidate push plus any head-changing base reconcile
re-enters review before final convergence. `standardReview` stays change-shaped for WUs and Errands alike, while
the driver owns the empty-source opt-out. The downstream auto/reviewed merge lane remains orthogonal: the auto lane
skips `arc review unlock` because its trusted CI poster supplies `arc-cleared`; the reviewed lane invokes the
unlock verb at the combined final gate, and an absent default-branch clearance workflow returns the typed
no-unlock terminal. Required-check settlement at the integration boundary, not workflow-file presence, remains
the enforcement authority. On a reviewed Errand that combined gate occupies the existing integration interlock
rather than preceding it as another stop.

Before requesting a hosted-PR source for a target already behind its base, the lifecycle reads the existing typed
base-drift result. Substantive overlap produces a non-gating recommendation to reconcile before spending the hosted
review; clean or regenerable-only drift stays silent. The operating agent may reconcile early when the overlap is
clear and reviewing first would predictably waste a pass, then recompose the target and continue without a
permission turn. A conflict, material interaction, or uncertain product decision stops for resolution. This early
judgment never replaces the final candidate boundary's authoritative drift read, exact-head applicability
assessment, or append-only discipline.

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
The immediate post-merge activation Errand is rollout of the already-shipped guard, not a second build/cut WU: it
adds no design or product surface and exists only because GitHub resolves `repository_dispatch` from the default
branch.

**A durable fix-carry ledger across a fix, still rejected; blanket re-review is not its necessary alternative.**
RSB rejected a second durable authority with fix-phase verbs and mid-fix crash recovery. That rejection stands.
The earlier design treated “persist an evidence-grade carry chain” and “repeat a complete pass after every changed
byte” as the only choices, overlooking the ordinary rung-2 alternative: the operating agent assesses the exact
delta, discloses the applicability call, and selects targeted or complete follow-up. A3 adopts that judgmental path
without reviving a ledger or claiming that an old exact-target result was emitted for a new head.

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
status write behind the secretless `arc-clearance` environment. The PR head is checked out **as data** and read
only through contained regular-file inputs by the pinned CLI, never executed.

**Performance / cost.** The deletion removes ~15 no-op billable CI minutes/day (the wakeup-relay + controller
runs). The guard adds one always-running planning-lane stamp step (cheap) and one unlock workflow that runs only
on deliberate dispatch. Net CI cost falls.

**Testing.** The choreography verbs get contract tests over their `state -> nextAction` pairs (following the
shipped `arc review` envelope test pattern) plus a durable public-CLI integration test independent of the retiring
launcher inventory; the re-homed provider paths keep their behavior tests. The merge
guard gets: readiness-check unit tests (the single CLI definition), a born-locked / re-lock-on-push assertion, a
planning-lane-exempt vs reviewed-lane-locked assertion, raw-diff rename/copy/type/mode and fork/cross-repository
cases, and PR-head-as-data assertions covering symlink/non-regular/out-of-root rejection and no head-code
execution. Setup coverage proves the packaged template installs with an exact manifest-matched CLI version and
shares the self-hosting workflow's trust/status contract. Workflow/template fixtures cover local-only, hosted-only,
mixed, clean, disposition-bearing, and no-review PR records, including exact reviewer identity, human triage
attribution, review-cycle accounting, runtime-owned result bindings, and refresh after a head change. Workflow
fixtures cover the judgment boundary rather than attempting to automate it: narrow fix, lifecycle-tail, and safe
reconcile examples permit disclosed targeted verification without a permission stop; behavioral, authority, and
uncertain-interaction examples call for complete review; no fixture turns those signals into an eligibility oracle.
Deletion review is reference-and-test checking: after the cut, a reachability re-walk from every production entry
point shows no dangling import into deleted modules, and the deleted tests are gone with their subjects.

**Migration and rollout.** The branch-protection edit that adds the required `arc-cleared` context is the one
breaking host-config change. Do not arm it on this WU's PR: the pinned `repository_dispatch` workflow does not
exist on the default branch until this WU merges. The immediate post-merge activation Errand runs the setup
workflow, then proves planning stamping, born-lock, push-relock, and exact-head unlock with controlled disposable
PRs before closing. No adopter is affected until they run the opt-in setup. Deleted CI workflows and npm scripts
stop running the moment the cut merges.

**User-facing impact.** Projects gain the hosted-PR effect verbs and an opt-in merge guard (a workflow template,
a protection edit, and a page of docs), all off by default: frontline and standard-source lists are empty, and the
guard needs setup (§ C3). A default install's integration is unchanged — the inline loop no-ops when no standard
source is configured, and `01_verify-and-configure.md` § Optional surfaces the choices. Nothing is represented as
autonomous host-side merge authority; the human disposition moment and the human-held unlock remain the trust
chain. Reviewed PRs gain a concise public review record that distinguishes local from hosted-PR activity, names
the actual tools/models and human triage approver, and summarizes final finding dispositions without exposing ARC
role vocabulary. The review controller / App narrative leaves TECHNICAL-OVERVIEW because the machinery leaves the
repository.

**Audience boundaries.** This spec, the WU notes, and the self-hosting TECHNICAL-OVERVIEW edit are
internal-dev-facing. The choreography verbs' help text, setup workflow, lifecycle workflow edits, and two shipped
extensions are adopter-facing: state what is, no transitional framing, no forward-pointers to internal roadmap.
The generic TECHNICAL-OVERVIEW package template remains unchanged. The guard's required-context name coordinates
with `merge-gate-naming` and must reference only currently-shipped context names until that stub settles.

## Success Criteria

Acceptance combines a **live pre-merge standard-review pass through a hosted-PR source** with fixture-backed guard
proof; exact default-branch guard activation is the durably-routed immediate post-merge Errand described in Goal 5:

1. A single session drives a real fixture PR carrying this WU's code through the configured review loop — frontline
   review active, at least one hosted-PR standard source requested and awaited via the bounded await verb, findings
   triaged through the disposition protocol, candidate preparation overlapped with review latency where useful, and
   the final base-clean candidate covered by complete review or a disclosed applicability judgment plus targeted
   verification before the combined convergence/unlock/integration gate is proposed — without asking whether to
   review, which source to try next, whether an in-ceiling pass is authorized, or whether a confident bounded
   follow-up-strength judgment may proceed.
2. The merge guard is ready to arm: contract and fixture coverage proves born-lock, push-relock, planning-lane
   stamping, and exact-head unlock through the two authorized posters. The exact `main` activation and live
   planning-/reviewed-lane matrix are captured for the immediate post-merge Errand, not claimed from a branch where
   the pinned workflow cannot yet exist on the default branch. Unlock availability derives from that canonical
   workflow; final PR required-check settlement remains the enforcement truth.
3. The unlock's readiness definition exists in exactly one place (the CLI check), pre-flighted by the unlock verb
   and re-run by the pinned workflow against the PR head **as data** (no head-supplied build, decision code, or
   policy); the workflow encodes no artifact list of its own. WU readiness binds the slug and archived PR URL or
   active branch to the guarded PR, validates Release Notes when present, and leaves their applicability judgment
   in the integration workflow.
4. The five `review-gate*.yml` workflows, the eight `review-gate:*` npm scripts, the ten `run-*.ts` launchers,
   `runtime/operations.ts`, `hosts/github/**`, `policy/self-hosting/**`, the App / controller / check-run
   machinery, and the hosted-PR residue are deleted with their tests. A reachability re-walk from every production
   entry point shows no import into a deleted module and no dangling `review-gate:*` reference in surviving prose.
5. `delegated-agent` and both hosted-PR adapters remain independently selectable standard sources, while each pass
   invokes exactly one. Ordered fallback selects the next source only after `rate-limited` or
   `transient-unavailable`, consumes no pass for that attempt, and never replays an ambiguous or partially effected
   request; frontline remains independent of standard-source selection and opt-out. Normalized local results inject
   runtime-owned target/source/rubric bindings rather than requiring evaluator transcription, while any accepted
   supplied binding is still exact-match validated.
6. The three gate WUs (`review-gate-enforcement-qualification`, `-promotion`, `review-gate-github-adapter`) are
   abandoned through the direct planned-stub transition with finalized receipts; their harvested seams land where
   § D3 assigns them; RSB is handed the two `core/` keep-as-contract modules as a consequence.
7. The seam holds: RSB's coordinated rename + ordered-frontline increment lands first; this WU consumes the
   `standardReview` and plural-source contracts without independently editing the live closure, D14 consume-set,
   re-entry retire cluster, or RSB-owned standard-review boundary modules.
8. `coordinate-pr-review.md` is deleted; `post-pr-open.md` / `pre-merge.md` keep their fire-point seams with the
   coordinator-invoking action removed. A grep for the deleted `review-gate:*` scripts across surviving project
   prose returns nothing (the `ReviewOperationStateStore` symbol lives only in `integrate-work-unit.md` /
   `run-errand.md` and clears via RSB's D16, not here). `integrate-work-unit.md` / `run-errand.md` carry this WU's
   inline hosted-PR standard-source + guard wiring as a shared surface with RSB, authored as a thin typed-dispatch
   driver (E3).
9. TECHNICAL-OVERVIEW § 2 describes the post-cut state with no residual App / controller narrative, reconciled
   with RSB's D15 edit; no added behavior is represented as autonomous host-side enforcement.
10. `frontline-review` is active in this repository via `active: true` in the `.arc/` method instance
    (`override-active: false`, package default unchanged), and the adopted `USER-INBOX` capture drops at completion.
11. **Configurable/opt-in for any install.** A default ARC install (no frontline sources, no standard sources,
    guard not set up) completes a WU integration end-to-end with the standard-review segment cleanly skipped even
    when `standardReview` is non-exempt — proving the driver-owned opt-out and graceful degradation.
12. Every reviewed WU and reviewed Errand PR publishes a final `## Review` record before merge: local and hosted-PR
    activity are separately attributed by product/model and pass count, while the approving GitHub identity and
    final material-finding dispositions make human triage visible. Any review carried across a later narrow delta
    is disclosed with its targeted verification so the record does not imply a final-head full pass. Empty review
    segments add no section, and the record remains disclosure rather than clearance evidence.
13. ADR-028 is superseded by a new accepted ADR that records the replacement authority model; its historical body
    and amendments remain intact.

## Open Questions

Resolved during the work, not deferred as design debt:

- **Guard naming reconciliation** — the status context (`arc-cleared`) and the unlock verb (`arc review unlock`)
  are settled. The context is named for its **assertion** (ARC clears this head for merge), not `review-*`: it
  attests ARC's merge preconditions, not review content, and one of its two posters is the non-review planning-lane
  stamp, so a `review-*` name would contradict half its own design. The verb is `unlock`, not `release`, to avoid
  overloading the shipped `arc release` wrapper's sense of the word, and stays under `arc review` (the flow-specific
  trigger) rather than a new `arc merge` / `arc merge-guard` namespace. The fixed supporting identities are
  `.github/workflows/arc-clearance.yml`, dispatch type and secretless environment `arc-clearance`, and
  `setup-arc-clearance.md`. What remains for build time is reconciling the context name with the provisional
  `merge-gate-naming` stub (which owns the sibling CI-rollup context and whose own `merge-ok` → `ci-ok` call is
  unsettled); reference only currently-shipped context names until that stub settles.
- **Review roles, sources, and obligation default** — settled jointly with RSB: frontline is an independent
  policy-qualified early role; standard review is one obligation-settling stream with one ordered source per pass;
  supplemental review is explicit and additive; convergence is the terminal state. RSB keeps `standardReview`
  change-shaped and owns the delegated-agent/local contract, while this WU's driver owns source selection and the
  empty-standard-list no-op. RSB lands the clean rename and plural frontline resolver first.
- **`policy/self-hosting/routing.ts` disposition** — cut here by the seam, but RSB raised it as an open question
  rather than a claim; confirm against the landed import graph before deletion. The two standard-review boundary
  modules are already confirmed as RSB-owned.
