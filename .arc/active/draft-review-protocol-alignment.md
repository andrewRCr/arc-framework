# Draft: review-protocol-alignment

- **Origin:** [internal] — `USER-INBOX § Errand`, "Align hosted-review configuration with the right-sized ARC
  protocol", captured at the first post-right-sizing integration diagnosis on PR #354; joined by the review-gate
  CLI request-body capture (errand `gate-tier-right-sizing`, PR #355) and the `adversarial-review` `withstood`
  capture.
- **Purpose:** Close the gap `review-gate-right-sizing` left between the _lean_ hosted-review protocol it shipped
  and the _surfaces that still describe the controller-era one_ — so provider selection is authoritative, provider
  capability is declared only where it is proven, and the evidence a failed review leaves behind survives the run
  that produced it.

- **State:** maturing — 2026-07-25 grooming session, second pass. Pre-PRD.
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

### 2. The chunk carrier contract — answered by prior measurement, re-cut to a capability removal

**The capability question is settled, and was settled before this WU opened.** `review-chunking` did not merely
design the chunking model — it measured a CodeRabbit CLI carrier against curated chunk scopes. Three usable
carrier shadows ran as `coderabbit review --agent --committed --base-commit <sha> -c REVIEW_SCOPE.md` inside a
**disposable git projection** whose synthetic commits reproduced the exact chunk diff at the original repository
paths:

| Shadow            | Exact scope                      | Result                                                     |
| ----------------- | -------------------------------- | ---------------------------------------------------------- |
| S2                | 43 files, 1,862+/402−, 288 hunks | exit zero, `review_completed`, 43 files reviewed, complete |
| E1                | 17 files, 3,780 lines, 37 hunks  | exit zero, complete, no partiality signal                  |
| Installation seam | 7 tracked files                  | completed, zero findings                                   |

Of the draft's three original candidate outcomes, the evidence selects **ARC-side curated orchestration** — ARC
partitions and builds the projection, the provider reviews each chunk blind. Provider-native directory scoping was
never the mechanism, and whole-target-only is disproven. The shipped doctrine agrees: chunked scope is admitted
**only through a curated-scope-capable local carrier**, and hosted review remains whole-PR.

Three caveats came with that result, and together they decide this concern's shape:

- **Latency is materially higher** than the local Codex leaf evaluator — recorded independently on both the S2 and
  E1 shadows. Chunking multiplies invocation count, so a per-invocation penalty compounds across a partition.
- **Untracked files are invisible.** The seam shadow could not include an untracked projection file under
  `--uncommitted`, and is recorded as seven-file advisory evidence rather than eight-file coverage.
- **The shadows were never completeness authority** — explicitly advisory carrier evidence, adjudicated like any
  other findings. One of the four upheld/rejected shadow findings was rejected outright as wrong.

**Decision — remove `chunked` from `coderabbit-cli`'s advertised capability.** Chunked review runs through a
Claude or Codex subagent carrier, full stop. In the capability table this is a one-token edit: `coderabbit-cli`
keeps `whole-target` and loses `chunked`, while `delegated-agent` already carries both. The rationale is not that
the carrier failed — it demonstrably completed every exact scope — but that it is the only candidate carrier
requiring a purpose-built projection to be scoped at all, while being slower and blind to untracked files. It is
the most expensive capability to back and the least valuable once backed.

**Named consequence — chunking becomes standard-lane-only.** `coderabbit-cli` is the sole frontline source, so
removing its chunked eligibility leaves the frontline lane whole-target-only. This degrades gracefully:
`source-scope-ineligible` is already a typed policy diagnostic, and the frontline lane already carries a
`no-source` / `inactive` skip path. It is nonetheless a real narrowing and is recorded here rather than left to be
discovered at the next chunked frontline request.

**Named restoration condition.** This is a capability removal, not a judgment that the carrier is unfit.
`chunk-scope-binding` restores it on demonstrating three things: projection construction and transport through the
request contract, chunked latency acceptable across a full partition, and defined handling for untracked files.

**Cost accepted — evaluator diversity.** CodeRabbit is a genuinely independent evaluator whose failure modes
differ from a Claude or Codex subagent's, so narrowing chunked review to the primary's own model family carries a
mild self-review-adjacent risk. The diversity is retained at whole-target frontline, where it works today; only
per-chunk diversity is given up.

**What stays this WU's work, and what does not.** Removing the unbacked advertisement is squarely this WU's thesis
— authority claims outrunning evidence — and is small. Building the partition transport is **not** this WU's:
`review-chunking` explicitly deferred automated construction and transport of chunk scopes, per-chunk scope
identities, and receipts to `chunk-scope-binding`, which is `planned` and unblocked.

### 3. Diagnostic durability and ephemeral-checkout lifecycle

Preserve or export provider diagnostics **before** the ephemeral checkout is released on timeout or failure, so an
adapter incident can be investigated without replaying a costly review.

This concern previously justified itself as a precondition for concern 2's measurement. That justification no
longer holds — the measurement it was gating had already been run by `review-chunking`. It stands on its own
merits instead, and they are sufficient: PR #354's two typed `execution-timeout` outcomes carried no findings and
no partial result, the only artifact that would have explained them was deleted with the ephemeral worktree, and
diagnosing it cost a second costly review rather than a log read. A typed failure outcome with no retained
diagnostic is not actionable — which is the WU's root defect expressed on the evidence axis.

**Two independent losses, not one.** The originating capture described a single "evidence destroyed" failure. The
adapter and its host actually lose the evidence twice, by unrelated mechanisms, and the fixes are separable:

1. **In-process — output is discarded before disk is ever involved.** On the abort path the frontline execution
   adapter returns a `timed-out` outcome without ever assigning its process result, so whatever the provider had
   already written to stdout and stderr is dropped. The non-abort error path is worse: it synthesizes empty stdout
   and stderr rather than preserving what was read. Even with the checkout retained, a timeout would still surface
   no partial output.
2. **On-disk — teardown removes the provider's own artifacts.** The frontline materialization host creates a
   temporary root, adds a detached worktree inside it, and releases by removing the worktree and then recursively
   deleting the root. The provider runs with that checkout as its working directory, so its saved prompts and
   working state die with the root.

Fixing only the second would not have explained PR #354. Both are in scope.

**Resolved design decisions.**

- **Trigger — failure-only by default, with an explicit opt-in for always.** Preserve on outcomes where the
  provider actually executed and did not succeed: timeout, failure, and malformed-result parses. Exclude outcomes
  where nothing ran (unsupported capability, unbound source) — there is no execution to explain. Green runs
  produce artifacts nobody reads, so always-on only consumes disk; the opt-in covers deliberate comparative
  investigation, where the successful baseline is the point and is known to be wanted in advance.
- **Destination — a per-repository state root outside the repository, keyed by target and pass.** Resolve under
  the user's local state directory as `review-diagnostics/{repositoryId}/{headSha}/{pass}`. The repository
  identity is already resolved during materialization, so no new identity concept is introduced. Keying by head
  **and pass** is what makes two attempts on one target distinguishable — precisely the PR #354 case, where two
  timeouts were indistinguishable after the fact. Never under the repository, and never under any path reachable
  by notes sync.
- **Retention — age-based, with a generous default.** The use case is investigating an incident discovered days
  later, which count-based retention serves poorly once a busy period evicts the interesting run. Age bounds disk
  adequately at this volume. Reap it through the existing session-init sweep surfaces rather than silently, so a
  growing diagnostics root is visible rather than mysterious. The default is cheap to revisit once real volume is
  observed.
- **Ownership — capture in the adapter, preservation in the host.** The adapter owns the process handles, so
  threading partial stdout and stderr into the timed-out outcome is its responsibility; that half needs no
  directory changes at all. The host owns the directory lifecycle, so preservation hooks into its release path.
  **Implementation constraint:** the release path's recursive delete currently sits in a `finally`, which is what
  guarantees teardown today. Preservation must run before that guarantee and must be failure-tolerant — a
  preserve that throws must never prevent cleanup, or a failed review leaks a worktree and reproduces the
  clutter problem below. Add to the cleanup guarantee; do not weaken it.
- **Trust boundary — the destination decision carries it, on security grounds rather than tidiness.** Preserved
  prompts embed source. The system temporary directory is world-readable on most systems, so simply retaining the
  temporary root would make source-bearing artifacts readable by any local user for the whole retention window.
  A state directory under the user's own home can be owner-only. Preserved diagnostics are therefore
  **local-only: never synced, never committed, never written to a repository path.**

**Worktree registration isolation (the fifth decision).** The same lifecycle carries a second defect that is
independently annoying: every ephemeral review checkout is registered in the repository's common git directory, so
it appears in `git worktree list` from every worktree until released. A parallel review cycle currently leaves
several temporary chunk checkouts visible alongside real work units, and a leaked one lingers indefinitely.

The registration namespace is the fixable part. Materializing review checkouts inside a **throwaway local clone**
rather than the primary repository moves the registration into the clone's own git directory, where it is
invisible to the primary, and collapses cleanup to a single recursive delete with no worktree records to orphan.
A local clone hardlinks the object store, so it is fast and cheap; and unlike an alternates-based clone, hardlinked
objects stay valid even if the source repacks, so the usual correctness hazard of clone-based isolation does not
apply.

Two supporting observations, both recorded so they are not re-derived:

- **Checkout count is a parallelism choice, not a requirement.** The observed chunk checkouts all sat at one head
  with scope carried separately, so sequential review needs exactly one. Concurrency should be a deliberate knob
  rather than an emergent default.
- **The existing sweep cannot see them.** Session-init already classifies stale worktrees and stamped husks as
  removable, blocked, or externally managed — but an unstamped detached checkout under the temporary directory
  falls through as externally managed at best. The problem is not that these exist; it is that they are invisible
  to the reaper that already exists. Stamping review checkouts with their owning work unit and cycle would let
  that machinery own them.

This WU settles the pattern and applies it to the frontline ephemeral checkout it already touches. Applying the
same pattern to chunk projections belongs to `chunk-scope-binding`, which owns that machinery.

### 4. The guidance surface

The `arc:review-guidance` blocks in `.coderabbit.yaml` and `AGENTS.md` are mixed live/residual, and the state is
worse than "unvalidated". Established against source during this grooming pass:

- **The hosted adapters inject no guidance whatsoever.** `CodeRabbitHostedAdapter.request` posts exactly
  `@coderabbitai full review` (or `@coderabbitai review`); the Codex adapter posts `@codex review`. The CodeRabbit
  CLI provider likewise injects none. The live typed generator has exactly one consumer — the **local** carrier's
  guidance projection. **The two static blocks are therefore the sole channel by which any ARC rubric reaches a
  hosted reviewer**, which is why they cannot simply be deleted.
- **The two copies are byte-identical** (31 lines each, modulo indentation), so the rubric exists in three places:
  two hand-maintained static copies and one typed projection that regenerates neither.
- **Nothing updates or validates them when the rubric changes.** Right-sizing deleted the carrier generator, the
  admission check, and the CodeRabbit carrier parity test, leaving the two static copies plus a
  marker-presence-only Codex packaging test that asserts the block delimiters exist and nothing about their
  content. Their behavioral content is still useful provider-native guidance; the maintenance path is what was
  removed.
- **They have already drifted from the typed source.** Both static copies carry **six** rubric dimensions; the
  typed baseline contract carries **five**. The sixth — "Repository contract coherence" — exists in no typed
  source, because no method anywhere declares the `review-augmentation` frontmatter that is the only route for a
  project dimension to enter the projection. The projection validator would reject both copies outright.
- **The published digest matches, and proves nothing.** Recomputing the rubric digest independently from the
  baseline preimage reproduces the published `sha256:cea850…` exactly. But the digest is derived from the typed
  contract, which does not cover the rendered dimension prose — so it is **structurally incapable of detecting the
  drift above, and did not**. A reviewer-facing digest that cannot fail is decoration.

**Decision — trim to the contract floor rather than delete or regenerate.** Cut the rubric dimensions and the
finding requirements: instructing a specialized code reviewer to check correctness, boundary cases, or to cite a
stable locus is its product, not information, and at `path: "**/*"` that cost is paid on every file. Cut the
`Rubric:` / `sha256:` line, which has no live consumer and is now demonstrably not a drift check. Keep only what a
provider cannot know: exact-scope binding (the complete requested change set, not a sample or only the latest fix;
bind to the exact requested target), the clean-result floor (unavailable, partial, ambiguous, or failed is never
clean), and the one non-obvious evaluator-boundary line (do not accept author conclusions). Roughly four lines,
not thirty-one.

Of the dimensions being cut, "Repository contract coherence" is the only one that is not generic — repository
instructions, package boundaries, self-hosting contracts. If any single dimension survives the trim, it is that
one; it is also, notably, the one with no typed home.

At four lines the **parity check resolves without restoring a generator**: a string-equality assertion between the
two carriers plus the typed coverage and clean-rule fields. This satisfies the "one proportionate check" commitment
without re-instating the deleted admission machinery.

Independent support for the trim arrived from `review-chunking`, which routed a field lesson to this exact seam:
guidance and code-evaluation criteria must be presented as separable, so that guidance is not applied as a spec the
code must satisfy. Dense generic guidance injected at every path is precisely that failure mode.

**Sequencing — trim first.** The earlier ordering ran concern 2's measurement before this trim, because trimming
changes the measurement's baseline arm. With the capability question already answered by prior measurement, that
constraint is discharged: the trim runs first, and what remains to measure is the single narrower question in
§ Unknowns rather than a three-arm experiment.

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

## Alternatives

- **Restore the deleted admission machinery** to re-establish carrier authority. Rejected — right-sizing removed it
  deliberately as disproportionate, and the local carrier now injects a runtime-owned rubric/guidance binding
  rather than asking an evaluator to transcribe evidence-grade identities. One proportionate parity check is the
  replacement, not a re-instatement. _(Scoped precisely: this holds on the **local** path only. The hosted
  adapters and the CodeRabbit CLI provider inject no guidance at all, which is what makes the static carriers
  load-bearing rather than redundant — see concern 4.)_
- **Infer the chunking answer from the PR #354 timeouts.** Rejected explicitly by the originating capture, and
  still correct: two timeouts on one oversized target with confounded guidance cost establish nothing about
  capability. The answer came instead from `review-chunking`'s prior controlled measurement.
- **Run a fresh three-arm A/B to settle the chunk carrier contract.** Rejected as redundant — the capability
  question it was designed to answer was already measured, and re-running it would spend costly reviews to
  reproduce a recorded result.
- **Keep `chunked` advertised for `coderabbit-cli` and build its projection transport here.** Rejected — the
  transport is `chunk-scope-binding`'s by explicit prior deferral, and absorbing it would widen a WU already
  flagged for sizing risk.
- **Document the request shapes in prose** (concern 5) where the workflows already reference the verbs. Cheaper and
  lands where the reader already is — **rejected**: prose drifts from the schemas by construction, and the drift is
  what reproduces the defect rather than fixing it. The schema-emitting flag is chosen instead.
- **Delete the guidance blocks outright** (concern 4). Rejected — they are the only channel carrying ARC's
  exact-scope and clean-result contract to a hosted reviewer, which is the half a provider genuinely cannot infer.
- **Regenerate both static copies from the typed projection** (concern 4). Rejected — that restores the generator
  right-sizing deliberately deleted, to maintain roughly four lines of content.
- **Split the adjacent surfaces (5–6) into their own work units.** Rejected for now: both are small once settled,
  and concern 6's shape resolved to three wording edits rather than a protocol. Each carries an independent-ship
  escape hatch instead.

## Unknowns and Assumptions

- **The one measurement still worth running** is narrow: whether a trimmed-guidance whole-target review still times
  out at the ~10.8k-line scale that failed on PR #354. This is a single observation after concern 4's trim, not an
  experiment, and it is no longer on any concern's critical path.
- **The parity-check shape is now settled enough to specify** — a string-equality assertion between the two static
  carriers plus the typed coverage and clean-rule fields. What remains open is only whether it lands as a unit test
  or a pre-commit contract check.
- **Resolved — the digest-drift assumption.** The published digest was recomputed independently and matches the
  typed contract exactly, so it has not drifted. The finding is that this proves nothing: the digest does not cover
  the rendered guidance prose, and did not detect the six-versus-five dimension drift that is actually present.
- **Open — chunked latency at partition scale.** `review-chunking` measured a materially higher per-invocation
  latency for the CodeRabbit carrier on single chunks, but never across a full partition. That measurement belongs
  to `chunk-scope-binding` as part of its restoration condition, not here.
- **Sizing — materially reduced, still worth watching.** Concern 2 shed the partition-transport work to its
  rightful owner and became a capability removal, which takes the largest and least-bounded item out of the WU.
  Concerns 5 and 6 keep their independent-ship escape hatches. Re-run the cohort-fit read once concerns 1 and 3 are
  specified, which is now the point where decomposition becomes decidable.
- **`ci-defer-heavy` placement** remains open (below).

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
- **`chunk-scope-binding` — now load-bearing, still no hard edge.** It owns the partition transport this WU
  declines, and it owns the restoration condition for `coderabbit-cli`'s chunked capability. It is `planned` with
  `Depends On: review-chunking — landed`, so it is unblocked. This WU should leave it a clean handoff on two
  fronts: the removed capability — why it was removed and the three things restoring it requires — and the
  worktree registration-isolation pattern settled in concern 3, which chunk projections should adopt so a parallel
  review cycle stops registering temporary checkouts in the primary repository.
- **`review-chunking` — the evidence source, shipped.** Its `analysis-review-chunking.md` carries the three carrier
  shadows, the exact scopes, and the latency and untracked-file caveats. Read it rather than re-deriving the
  carrier question. Its advisory packet is SHA-bound and is not review coverage for anything.
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

Medium-to-large (several days). Reduced from the prior estimate: concern 2 collapsed from an experiment-gated open
design to a capability removal plus a handoff note, and concern 4's shape is now settled rather than deferred
behind that experiment. What remains spans configuration, policy contracts, adapter execution, CLI surface, and
method prose — wide, but no longer carrying an unrun measurement on its critical path.

## Continuity

- **State:** maturing, approaching formalization-ready. The item previously named as the one fundamental still
  open is answered from prior measurement, and concern 3 — the last core concern with substantial design
  surface — is now settled to the decision level. Concern 1 is the remaining unspecified core concern.
- **Resolved:** the problem framing and its single root (authority claims outrunning evidence); the six-concern
  scope; concern 2's carrier question, answered as ARC-side curated orchestration and re-cut to a capability
  removal with a named restoration condition and an accepted evaluator-diversity cost; the standard-lane-only
  consequence of that removal; concern 3's two-loss decomposition and all five of its design decisions — trigger,
  destination, retention, ownership split, and trust boundary — plus the worktree registration-isolation pattern
  and its two supporting observations; concern 4's trim-to-contract-floor decision, its three drift findings, and
  the inverted sequencing (trim first); concern 5 resolved to a schema-emitting flag; concern 6 resolved to three
  wording edits with its rejected shapes recorded; coordination-not-dependency with `judgment-authority-model`;
  the two-front handoff contract with `chunk-scope-binding`; `Class: Heavy`.
- **Open:** concern 1's typed shape; the single trimmed-guidance timeout observation; whether the parity check
  lands as a unit test or a pre-commit contract check; the retention default's concrete value once real
  diagnostics volume is observed; `ci-defer-heavy` placement.
- **Next:** specify concern 1 — the last core concern with real design surface. Its operator selection and skip
  input needs a typed shape settled against the driver's existing outcome vocabulary, and the binding constraint
  is that the shape must not become a second route to fabricating a safe-fallback outcome, which is the defect it
  exists to close. Nothing gates it. Once it lands, the draft is a candidate for the formalization-readiness
  assessment.

---
