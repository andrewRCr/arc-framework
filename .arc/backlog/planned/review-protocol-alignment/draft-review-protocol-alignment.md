# Draft: review-protocol-alignment

- **Origin:** [internal] — `USER-INBOX § Errand`, "Align hosted-review configuration with the right-sized ARC
  protocol", captured at the first post-right-sizing integration diagnosis on PR #354; joined by the review-gate
  CLI request-body capture (errand `gate-tier-right-sizing`, PR #355) and the `adversarial-review` `withstood`
  capture.
- **Purpose:** Close the gap `review-gate-right-sizing` left between the _lean_ hosted-review protocol it shipped
  and the _surfaces that still describe the controller-era one_ — so provider selection is authoritative, provider
  capability is declared only where it is proven, and the evidence a failed review leaves behind survives the run
  that produced it.

- **State:** maturing — 2026-07-25 grooming session. Pre-PRD.
- **Class:** `Heavy` (derivation and scale both fire; compose rather than invent).

---

## Problem / Motivation

`review-gate-right-sizing` removed the resident controller, the GitHub App path, provider qualification, and the
guidance-evidence admission machinery. What it did not do is reconcile every surface that the removed machinery
used to own. The residue is not cosmetic: on PR #354 it produced a **misdiagnosis that bypassed configured
policy**, and the diagnosis run surfaced four further gaps that share one root — _the protocol asserts things about
providers that nothing establishes or checks._

Four distinct failures, from one integration:

1. **A skip was read as an attempt.** `.coderabbit.yaml` gated automatic review on a label that no longer existed,
   so every PR emitted a successful `review skipped` status. That was misread as a failed CodeRabbit attempt and
   led to a direct `@codex review`, bypassing the configured `coderabbit-pr, codex-pr, delegated-agent` preference.
   _(The configuration half of this shipped separately as errand `coderabbit-manual-only`; the protocol half — that
   only a typed `rate-limited` or `transient-unavailable` outcome may advance to the next source — is this WU's.)_
2. **Capability is advertised without being established.** The policy driver advertises `coderabbit-cli` for
   `chunked` frontline scope, but the frontline run request carries only target, resolution, and timeout, and the
   execution adapter always emits a whole-target `--base-commit` command. No partition, closure chunk, seam scope,
   or aggregation contract ever reaches the provider. The advertised capability is unbacked.
3. **Failure destroys its own evidence.** Two CodeRabbit CLI attempts on a 10,867-line target returned typed
   `execution-timeout` with no findings and no partial result. The diagnostic that would explain why — the saved
   provider prompts — lived only inside the ephemeral detached worktree, which cleanup removed. Investigating cost
   a second costly review rather than a log read.
4. **The operator has no typed way to choose.** After the CLI timeouts, hosted Codex was chosen deliberately
   because it handles large diffs better. The driver still selects `coderabbit-pr` first and exposes no one-run
   source override, so a legitimate preference had to be expressed by going around the driver.

Underneath all four is the same shape, and it is worth naming because it is also the WU's design constraint:
**the protocol's authority claims outrun its evidence.** A configured preference that can be bypassed by a
misread status is not authoritative; a capability declared in policy but absent from the request contract is not a
capability; a typed failure outcome with no retained diagnostic is not actionable.

## Scope

Six concerns, in rough dependency order. The first four are the hosted-protocol core; the last two are adjacent
surfaces that arrived through their own captures and are confirmed in scope.

### 1. Selection authority (the core)

Hosted providers are selected only by the driver. An automatic-review skip is never an adapter attempt. Fallback
occurs only on the driver's typed safe outcomes (`rate-limited`, `transient-unavailable`). Add an explicit
operator selection / skip input whose record **distinguishes a preference override from provider
unavailability** — so a deliberate choice is legible as a choice, and no caller ever has to fabricate a
safe-fallback outcome to get the provider it wants.

### 2. The chunk carrier contract (the open one)

Whether CodeRabbit can satisfy ARC's complete-union + seam model is **unresolved, not disproven** — the PR #354
timeouts are not evidence either way, and the draft must not treat them as such. Three candidate outcomes, to be
settled by measurement rather than argument:

- **Provider-native chunking** — CodeRabbit exposes directory scoping; determine whether it composes into complete
  union coverage plus a seam review.
- **ARC-side curated orchestration** — ARC partitions and aggregates; the provider reviews each chunk blind.
- **Whole-target-only** — declare the capability absent and stop advertising `chunked` for `coderabbit-cli`.

Gating this is a **controlled same-target A/B** across current global guidance, minimal project-only guidance, and
no ARC guidance, with prompt and timing diagnostics preserved per run. The current `.coderabbit.yaml` applies dense
generic `standard-review/v1` guidance to `**/*`, so _diff size_ and _instruction cost_ are confounded today and
must be separated before either is blamed for the timeouts.

### 3. Diagnostic durability

Preserve or export provider diagnostics **before** the ephemeral checkout is released on timeout or failure, so an
adapter incident can be investigated without replaying a costly review. This is a precondition for concern 2's
measurement, not merely a nicety — the A/B cannot be read if each run destroys its own instrumentation.

### 4. The guidance surface

The `arc:review-guidance` blocks in `.coderabbit.yaml` and `AGENTS.md` are mixed live/residual. Their behavioral
content is still useful provider-native guidance; the displayed `sha256:` is the rubric-content digest, is not
target-specific, and currently matches the live typed contract. But right-sizing deleted the carrier generator,
the admission check, and the CodeRabbit carrier parity test, leaving two static copies and a
marker-presence-only Codex packaging test — **so nothing updates or validates those copies when the rubric
changes.** Keep concise provider-native instructions covering exact requested scope, the rubric dimensions,
actionable source-grounded findings, and the clean-result floor; remove obsolete managed/evidence cues and
reviewer-facing digest text with no live consumer; and choose **one proportionate parity check** rather than
restoring the deleted evidence-grade admission machinery.

Sequencing constraint: trimming these blocks **changes the A/B's baseline arm**, so concern 2's measurement runs
before concern 4's trim, not after.

### 5. Request-body legibility

`arc review unlock`, `resolve`, `chunking resolve`, `local prepare`, and `hosted request` all take `<file | ->`
with help text reading only "Versioned JSON request file" — no schema, no example, no schema-emitting flag. Both
`run-errand` and `integrate-work-unit` instruct the agent to invoke these verbs with no way to learn what `-`
should contain short of reading Zod definitions, so those workflows are followable only by an agent willing to
source-dive mid-integration. **Confirmed live during this WU's own grooming session**: composing an `unlock`
request required reading the request schema plus two supporting schema modules across three files.

**Settled: a schema-emitting flag, not prose.** The flag scales across the whole verb family and cannot drift from
the schemas, where documentation drifts by construction — and the drift is what reproduces the defect rather than
fixing it. This crosses into code and widens the WU; accepted deliberately.

## Alternatives

- **Restore the deleted admission machinery** to re-establish carrier authority. Rejected — right-sizing removed it
  deliberately as disproportionate, and the lean adapters now inject runtime-owned rubric/guidance bindings rather
  than asking an evaluator to transcribe evidence-grade identities. One proportionate parity check is the
  replacement, not a re-instatement.
- **Infer the chunking answer from the PR #354 timeouts.** Rejected explicitly by the originating capture. Two
  timeouts on one oversized target with confounded guidance cost establish nothing about capability.
- **Document the request shapes in prose** (concern 5) where the workflows already reference the verbs. Cheaper and
  lands where the reader already is — **rejected**: prose drifts from the schemas by construction, and the drift is
  what reproduces the defect rather than fixing it. The schema-emitting flag is chosen instead.
- **Split the adjacent surfaces (5–6) into their own work units.** Rejected for now: both are small once settled,
  and concern 6's shape resolved to three wording edits rather than a protocol. Each carries an independent-ship
  escape hatch instead.

## Unknowns and Assumptions

- **The chunking answer is genuinely unknown** and is gated on measurement that has not been run. This is the WU's
  largest open item and the reason its scope cannot be fully fixed at draft time.
- **The parity-check shape is unsettled** — what "one proportionate check" means concretely for two carriers whose
  copies live in different file formats. Deliberately deferred: the A/B result determines what is even worth
  checking, so settling it now would be guessing.
- **Assumption to validate:** that the `sha256:` digest matching the live contract today is coincidence-free —
  i.e. that it was correct at right-sizing and has not drifted since, rather than having drifted and happened to
  be re-synced.
- **Sizing risk to watch:** six concerns spanning configuration, policy contracts, adapter execution, CLI surface,
  and method prose is wide for one WU. Concerns 5 and 6 each carry an independent-ship escape hatch precisely so
  that the WU can shed weight without redesign if the core runs long. Re-run the cohort-fit read once the chunking
  answer lands and the true shape of concern 2 is known — that is the point where decomposition becomes decidable.

### 6. The `adversarial-review` `withstood` field — settled shape

**The defect is in consumption, not production.** Demonstrated 2026-07-24: three false claims rode through two
independent fresh-context passes under `withstood` and were relayed on the strength of that label, then refuted in
full against source. But the reviewer reported honestly — it looked, and it missed that each cited fact was true
while each inference drawn from it was false. Reviewers miss things; the method is advisory end to end and says so.
What went wrong is that the primary read _"no findings here"_ as _"this is cleared."_ Nothing licensed that
reading — and nothing forbade it, because **the field's meaning is stated nowhere**. The schema gives it one
freeform line while `findings` carries five structured sub-fields; the prompt template never mentions it; and it
participates in no severity, disposition, or convergence machinery.

**`withstood` is signal and should be kept.** Absence of findings is ambiguous three ways — examined and held up,
not examined, or examined the wrong thing — and only the reviewer can collapse that ambiguity. It is also
structurally un-fakeable in the way that matters: over-claiming coverage buys the reviewer nothing, unlike findings,
where a pull toward manufacturing something useful exists and the method explicitly warns against it. The deeper
reason absence cannot substitute: adversarial review deliberately leaves the reviewer's attention unconstrained so
it finds what the primary did not think to ask about, so coverage cannot be specified up front and must be reported
back. `withstood` is the return channel for the unwritten part of the assignment.

Three small edits, no new mechanism:

1. **State the semantic.** Attention reported, not correctness asserted — "I examined this and have nothing to
   report," never "there is nothing wrong here." Advisory signal, never authority.
2. **Bound it to decision-relevant coverage.** Report where absence-of-finding is itself informative; exhaustive
   enumeration of every region touched reads as diligence while conveying nothing, and drifts toward theater.
3. **One primary-side line on the risk gradient.** Entries asserting **externally verifiable** facts (a claim about
   code, behavior, or a diff) are the ones worth spot-checking before relaying; entries of internal judgment about
   the artifact (does the alternatives section cover the real options) are unverifiable in principle and need no
   check. The gradient runs by claim type, not by fire-point — which means `verify-work-unit` carries _more_ risk
   than the planning stages, since its passes re-validate success criteria against a diff and so make external
   claims almost exclusively. Code review, were the method ever pointed there, would be higher still.

**Rejected shapes**, recorded so they are not revisited: _requiring the primary to verify every entry_ (defeats
delegation — `withstood` is by design the larger list); _splitting the schema into citation-checked versus
inference-checked_, or _requiring the reviewer to declare which check it performed_ (both ask an untrusted
evaluator to attest its own rigor — the same forgeable-self-report error that `judgment-authority-model` records as
its central unknown, and disproportionate design for the problem at hand); _scoping the obligation to entries the
primary will relay_ (the observed failure **was** relaying on the strength of the label, so the trigger is
unreliable); and _deleting the field_ (discards real coverage signal to fix a wording gap).

**Escape hatch:** this is three edits to one method file and its prompt template. It rides in this WU comfortably,
but if the provider-protocol work above runs long it can ship independently as an errand without disturbing the
rest.

## Composition / Coordination

- **`judgment-authority-model` — coordination, not a hard dependency.** Four judgment-layer concerns from the
  originating capture are _informed by_ that WU's model rather than blocked on it: the post-fix
  review-applicability rule being too coarse (it bound an agent to a second complete hosted pass over 10,904 lines
  after a two-line reviewer-identified fix); the missing proposal-time `Post-fix review: carry-forward | targeted |
  focused | complete` field; the two-stop author-response cycle where one approval should carry disposition +
  bounded fix + verification + persistence + post-fix plan; and the determinism-versus-judgment posture that ARC
  should make judgment auditable rather than bind it to a predictably disproportionate operation because a broad
  category matched. **Hold these in a later phase** so concerns 1–5 are not gated on a `Novel` upstream. No
  `Depends On` edge is recorded.
- **`review-chunking` / `chunk-scope-binding`** — concern 2's answer bears on both; check their current tips before
  settling the carrier contract rather than re-deriving from an older model.
- **`unit-scoped-review`** — relocates the approval gate to the WU boundary, which changes what the
  author-response cycle above is collapsing. Coordinate framing; do not pre-empt.

### Carried input — `ci-defer-heavy` automation (placement open)

Raised during this WU's grooming, recorded here so it is not lost, **with placement deliberately unsettled** —
it may belong to `self-hosted-ci-qualification`, its own stub, or a later phase here.

The proposal: auto-apply the project-level `ci-defer-heavy` label when a PR opens heavy, and remove it once review
settles, so the heavy CI legs fire exactly once per PR rather than on every intermediate head. Findings from the
grooming evaluation, so they are not re-derived:

- **The benefit needs no automation.** The label is already wired end to end — `ci.yml` handles `labeled` /
  `unlabeled` events and `ci-ok` fails while deferred, so branch protection cannot green a deferred head. Heavy
  legs are **74% of fan-out work** (638s of 867s measured), so manual use during review-fix loops already takes an
  iteration run from ~8m33s to roughly ~2.8 min. Only the automation is unbuilt.
- **Applying is seam-available; removing is not.** `pre-pr-open` is declared by both `run-errand` and
  `integrate-work-unit` and its input carries `baseRef` / `headSha`, and the weight classifier is pure and
  sub-second. But `pre-merge` fires _after_ the final CI re-run, so removing the label there triggers a run the
  workflow has stopped waiting for and leaves the integration interlock surfacing mid-flight checks. Closing that
  needs either a new fire point (procedural substrate — forward-compat-check it) or an explicit await added to a
  shipped Framework workflow.
- **Key on weight, not lane.** A reviewed-lane docs-only PR is already light, so lane is the wrong condition.
- **No extension is active in this repo** (`active: false` across all fourteen), so enabling `pre-pr-open` is a
  first-of-its-kind activation firing on every errand and every integration.
- **Defer-from-open costs early failure discovery**, and a late failure creates a new head, which can force a
  complete re-review — more expensive than the minutes saved. Heavy-once-then-defer is the better shape.

## Scope Estimate

Large (week+). Six concerns across configuration, policy contracts, adapter execution, CLI surface, and method
prose, one of which is gated on an experiment that has not yet run.

## Continuity

- **State:** maturing — scope is known and the open items are detail-design rather than fundamentals, with the one
  exception noted below.
- **Resolved:** the problem framing and its single root (authority claims outrunning evidence); the six-concern
  scope; the measurement-before-trim sequencing between concerns 2 and 4; concern 5 resolved to a schema-emitting
  flag; concern 6 resolved to three wording edits with its rejected shapes recorded; coordination-not-dependency
  with `judgment-authority-model`; `Class: Heavy`.
- **Open:** the chunking answer (gated on the A/B — the one fundamental still open); the parity-check shape
  (deliberately deferred behind the A/B); the digest-drift assumption; `ci-defer-heavy` placement.
- **Next:** design the A/B protocol concretely enough that diagnostic durability (concern 3) can be specified
  against it — concern 3 is a precondition for concern 2's measurement being readable at all, so the two are
  specified together or not at all.

---
