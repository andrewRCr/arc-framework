# Draft: review-protocol-alignment

- **Origin:** [internal] — `USER-INBOX § Errand`, "Align hosted-review configuration with the right-sized ARC
  protocol", captured at the first post-right-sizing integration diagnosis on PR #354; joined by the review-gate
  CLI request-body capture (errand `gate-tier-right-sizing`, PR #355) and the `adversarial-review` `withstood`
  capture.
- **Purpose:** Close the gap `review-gate-right-sizing` left between the _lean_ hosted-review protocol it shipped
  and the _surfaces that still describe the controller-era one_ — so provider selection is authoritative, provider
  capability is declared only where it is proven, and the evidence a failed review leaves behind survives the run
  that produced it.

- **State:** maturing — 2026-07-26 grooming session, third pass. Pre-PRD.
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
   _(The configuration half shipped separately as errand `coderabbit-manual-only`. The protocol half was assumed to
   be this WU's, but the typed fallback rule turns out to be already enforced — the driver was simply never
   consulted. See concern 1, where this failure resolves into the missing operator override rather than a missing
   fallback rule.)_ **The misleading surface itself is not fixed and recurs**: a pull request opened during this
   WU's own grooming carried a green, passing `CodeRabbit` status reading `Review skipped: automatic reviews are
   disabled`. Disabling automatic review removed the stale-label cause; a skip still reports success, so the
   artifact that produced the original misdiagnosis is still on every pull request.
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

### The second pattern — correct rules, unreachable at the decision point

Grooming surfaced a distinct shape often enough to name it separately, because it changes what a fix has to
accomplish. In each case the governing rule is present, correct, and well designed; what fails is that it cannot be
reached from where the decision is actually made.

| Rule                 | Its state                                   | Why it does not bite                               |
| -------------------- | ------------------------------------------- | -------------------------------------------------- |
| Review pass ceilings | implemented, wired to an approval interlock | the request that reaches them cannot be composed   |
| Triage severity      | contracted to be verified against source    | the verdict lands in prose no mechanism reads      |
| Review obligation    | typed and routed                            | no verb exposes the router's output                |
| Stop discipline      | stated precisely, with worked principles    | stated only in a shipped work unit's archived spec |

None of these is a missing rule, so none is fixed by writing a better one. Each is fixed by making an existing rule
reachable — a producing verb, a field in the typed record, a statement carried into the workflow the agent loads.
That distinction decides the size of every concern below: where the rule already exists, the work is plumbing, not
design, and proposals that add governing machinery are answering a question that was already answered.

### The third pattern — procedural surfaces that misdescribe themselves

The last concern arrived from different evidence and does not reduce to either pattern above, which is worth
stating plainly rather than filing it under a root it does not share. Its evidence is a live integration report
rather than the PR #354 diagnosis, and its defect is neither an unbacked claim nor an unreachable rule: **the
integration boundary's own procedural surfaces describe themselves inaccurately.** The interlock renders what it
verified instead of what the approver decides; the lifecycle verb names its phase's content instead of the
scheduling act it performs; the state transition fires two steps before the state's documented meaning begins. In
each case the surface is truthful about the system and misleading about itself.

This pattern is also the reason the work unit now spans two subjects. The first two patterns are both properties of
the **review protocol's content**; this one is a property of the **integration workflow's procedural shape**, and
nothing in a fix to one reaches the other. That asymmetry is recorded as the decomposition signal in § Unknowns
rather than resolved here.

## Scope

Nine concerns, in rough dependency order. The first four are the hosted-protocol core; the next four are adjacent
surfaces that arrived through their own captures and are confirmed in scope. The ninth arrived last, from a live
integration report, and stands apart: it is the only one reaching the integration workflow's own procedural
shape — its interlock surface, its lifecycle verb, and its state transition — rather than the review protocol's
content.

### 1. Selection authority (the core)

**The typed fallback rule is already enforced; the operator override is the buildable gap.** Establishing this
against source changes what this concern is for, so it is recorded before the design.

The rule that fallback occurs only on the typed safe outcomes — rate-limited and transient-unavailable — is
current behavior at four sites: the safe-unavailable predicate itself, the request refinement rejecting any
attempt history that falls through on any other outcome, the resolution arm that blocks and stops on a
non-fall-through last attempt, and the source selection that admits only safely-attempted sources before reporting
safe-fallback exhaustion. One precision: the refinement lives on the driver-facing request shape, which carries the
configured sources it needs; the CLI-facing command shape does not carry it. Enforcement therefore sits at the
resolution layer rather than at the command boundary — the right layer, but worth stating exactly rather than
claiming the boundary gates it.

**The corrected diagnosis.** PR #354's bypass did not occur because the driver permitted fallback on a misread
skip. **The driver was never consulted** — the request went straight to the provider as a pull-request comment.
That distinction matters because it disqualifies the obvious requirement: "hosted providers are selected only by
the driver" is **not a code-enforceable property**. The provider interface is a comment anyone can write, and no
schema prevents one being written. Codifying it would assert a guarantee the system cannot hold, which is this
WU's own thesis turned on itself. The achievable form is to make the in-band path complete enough that leaving it
is never necessary — which is exactly the override below. **The missing override is the cause of the bypass, not a
separate concern.**

**Design — mirror the existing ceiling override.** The driver already carries a typed, target-bound, validated
override with enumerated rejection reasons and a dedicated invalid-override resolution state. The operator
selection input follows that shape rather than inventing one: exact-target and lane binding, a selection naming a
source and whether it is preferred or skipped, and a **basis** discriminating operator preference from
operator-observed unavailability. Rejection reasons mirror the existing enum — target mismatch, lane mismatch,
unknown source, ineligible source, and source already attempted.

The basis field is load-bearing rather than descriptive. A **preference** merely reorders, leaving the deselected
source eligible on later passes. An **operator-observed-unavailable** claim is an assertion about the world, and
must be recorded as operator-attested rather than merged into adapter-observed outcomes.

**The structural constraint that prevents fabrication.** The attempt history records what was _observed_; an
override declares what is _intended_. They must never share a field. An override that selects a source directly
never touches the attempt history and therefore cannot manufacture a safe outcome nobody observed. The failure
mode to design against is not a malformed override but a **laundered** one — an operator assertion entering the
attempt history indistinguishably, after which no audit can separate "the provider was rate-limited" from "someone
asserted the provider was rate-limited." Keeping provenance structurally separate is the whole mechanism.

This is the forgeable-self-report shape `judgment-authority-model` records as its central unknown, appearing here
in a form that _does_ have a clean answer, because provenance can be separated by construction rather than
attested. This WU settles the instance; that WU generalizes the shape.

**Settled sub-decisions.**

- **An override never consumes a pass.** Selection does not consume; the resulting attempt's outcome does. This
  matches every existing selection-time resolution state, which reports no consumed pass.
- **Lifetime is one pass, bound to exact target and lane, and never sticky.** It binds the way the ceiling
  override binds to its exhausted pass count, so it cannot silently carry across heads or passes.
- **Skip is unfloored** — an operator may deselect every configured source. The result is an unavailable state
  that stops rather than passes, so it cannot manufacture approval; and requiring some provider to run regardless
  would be exactly the disproportionate rule `judgment-authority-model` exists to correct. A stop is a legible
  outcome; a forced run is ceremony.

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
- **Dirty review scratch is indistinguishable from unsaved work, so cleanup escalates to the human.** Observed at
  a sibling work unit's integration: four chunk checkouts survived the merge, and the closing report surfaced them
  to the developer with a note that removal would require force-discarding staged and untracked content. That was
  the right call on the evidence available — but the content was entirely review projection of the work that had
  just merged, so nothing was at risk and the developer had no decision to make. Neither the sweep nor the agent
  can tell reproducible scratch from a real worktree's unsaved work, so real-worktree caution applies to both. The
  clone isolation above dissolves this rather than needing a rule: a throwaway clone's contents are reproducible by
  construction, so its removal is unconditional and never becomes a question the developer has to answer.

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

**The concern splits in two, and the flag closes only one half.** Establishing both against source during an errand
run of `run-errand`:

- **Discoverability** — the caller can compose the request from facts it legitimately holds, but cannot find the
  shape. `arc review unlock` is this: it wants a tree root, a `{repository, pullRequest, headSha}` target, and a
  vehicle, all of which the caller has; locating that shape took five schema modules. The schema-emitting flag
  fixes this case completely.
- **Derivability** — the caller cannot legitimately produce a required field at all. `arc review resolve` is this:
  its request carries a **routed obligation projection** — obligation, reasons, retrigger — and the only producer
  is internal runtime code reached through a different verb. There is no path for a caller following the workflow
  to obtain one. The project's own CLI-surface test hand-authors the block with a fabricated digest, which is the
  tell: if the test cannot route it, no caller can.

A schema flag makes a derivability failure **easier to get wrong**, because it documents the shape of a verdict the
caller then invents. The second half therefore needs a producing verb — routing exposed as output — not better
documentation of an input. Left unaddressed, the workflow instructs an agent to invoke a verb whose request can
only be fabricated, and a fabricated routing verdict is indistinguishable in the record from a routed one: the same
provenance collapse concern 1 designs against, arriving through the CLI surface instead of the attempt history.

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

### 7. Convergence semantics and severity provenance

**Convergence is currently defined as an empty backlog, not a weakening signal.** The exit gate reads: a pass
converges when it surfaces no _open_ primary-confirmed finding above `minor`, and it states explicitly that a
finding the primary has fixed, dropped, or carried forward "does not force another pass by itself." Because
disposition empties the backlog, fixing everything converges immediately — so **the change most likely to
introduce a defect, a fix to a material finding, is the one a fresh pass never examines.** In practice most loops
exit after one pass and the reviewer has to supply the missing lens by hand.

Two distinct rules are collapsed into one sentence:

- **Exit gate — completeness.** No confirmed finding above `minor` may remain undisposed when the loop closes. A
  property of the disposition backlog.
- **Convergence — signal.** Another pass is worth running while fresh looks keep surfacing material findings. A
  property of what the pass _produced_, independent of what was then done about it.

**Resolved: convergence is measured on what the pass surfaced.** A pass converges when it surfaced no
triage-confirmed finding above `minor`. Fixing a material finding does not make the pass that found it a
converging pass; it means the next pass has something new to examine. The exit gate stays, stated separately. Both
must hold, and they disagree productively — a fixed material finding satisfies the gate while withholding
convergence, and an undisposed minor converges while holding the gate open.

Cost tracks risk under this reading rather than being flat: a clean artifact still converges in one pass, while a
material finding buys exactly one verification pass, bounded by the same cap.

**Severity provenance — the signal must come from ARC's own classification.** Every hosted finding carries two
severities. The adapter normalizes the provider's label into the finding record; the primary's verified severity is
recorded separately in the disposition report item, alongside a source-verification verdict and mandatory
verification references, with a refinement forcing rejection of anything source does not support. **Both are
already typed** — the verified verdict is not trapped in prose.

What is missing is narrower and more tractable: **the driver cannot see it.** Its resolution input records each
attempt as a source and an outcome — `clean`, `findings`, and the failure kinds — with no severity at all. So the
decision to continue or stop is made against "findings happened," never against how material they were, while the
verified verdict sits one artifact away in the approved disposition set. Keying convergence off the provider's
label would put control flow under an unaudited external opinion; keying it off nothing at all is what happens
today. This is the second pattern once more, in its most tractable form: the rule is right, the data exists, and it
is simply not routed to the decision.

**Shared, not duplicated.** One definition of convergence governs both the adversarial-review loop and the review
gate's lanes. It matters more at the gate, where the loop is costlier and the severity provenance gap actually
exists — the adversarial-review method already anchors to primary-confirmed severity.

**Judgment admitted at exactly one point.** The default is deterministic and needs no judgment: did the last pass
surface a triage-confirmed finding above `minor`? Layered on top, the agent may judge that a `minor` nonetheless
carries strong enough signal to warrant another look — and **recommends** it, citing the signal. At the cap with
live material findings, the agent states whether the evidence warrants continuing rather than stopping silently.
**The agent may recommend past the cap; it may never proceed past it.** Judgment is admitted where it adds
information and structurally barred where it would erode the bound.

**Severity vocabulary — rename `blocker` to `critical`.** `blocker` names an outcome where the scale wants a
magnitude; `critical > major > minor` reads in one register. It also removes a translation hop from the provider
label of the same name. Most decisively, `blocker` is overloaded three ways — the severity, the work-unit
impediment field carried by over a hundred live meta files, and a review resolution state named for stopping.
After the rename each sense is unambiguous. The sweep is bounded and mechanical across the code and a handful of
methodology files, with one hazard: the impediment field is a different concept and must never be caught by a
blind replace. **Sequence it first**, because the provenance work above edits the same schema.

**Sized against the response path — the concern stays whole.** The two parts that looked code-bearing are smaller
than the framing assumed, because the schema work is already done:

- **No new record is needed.** The triage-confirmed severity already exists, typed, on the disposition report item.
  The earlier reading that it had to be landed in the typed record was wrong.
- **The change is one field and one branch.** Carry the confirmed severity — the maximum across the approved
  disposition set — on the attempt record the driver already receives, then let the findings arm consult it: a pass
  whose confirmed findings top out at `minor` resolves as a completed pass rather than requiring another response
  cycle. Additive and optional on the schema, so an attempt that omits it keeps today's behavior.
- **The behavior change is real and bounded.** Today any finding forces a response cycle; afterwards a
  minors-only pass can converge. That is the intended effect rather than a side effect, and it is confined to one
  arm of one function.

Remaining unknowns are execution detail rather than design: how the maximum is computed across a chunk series, and
whether the frontline lane needs the same field on its own attempt path. Neither reopens the direction.

### 8. Stop discipline and spend opt-in

Three parts of one question: what the integration stretch does without asking, who decided that it may, and which
stops are load-bearing enough that streamlining must not reach them.

**The choreography already matches its design intent; the rule that says so is unreachable.** The shipped
right-sizing spec states the target plainly — human stops track authority rather than every judgment, final
dispositions and release coincide in one structured gate when nothing earlier needs approval, exceeding a pass
ceiling is a third stop by exception, and ordinary agent judgments do not create permission turns. Counting the
integration workflow's own stop-class callouts confirms the shape: one stop before merge, plus the conditional
finding-driven and ceiling stops. But that spec is a completed work unit's archived artifact, so the agent running
integration never loads it. The discipline exists and is correct; nothing states it where the decision is made.
This is the second pattern above, in its clearest form.

Two concrete asymmetries follow:

- **The lighter vehicle carries more autonomy guidance than the heavier one.** The errand workflow states four
  times that a confident bounded call proceeds without a permission stop, including at review applicability and
  supplemental review. The integration workflow states it twice, and its own review-applicability step instructs
  the agent to make and disclose the judgment without saying it proceeds. Integration is the long autonomous
  stretch the design intended to protect, and it is the one carrying less of the rule.
- **The verification fire-point stops at every `Class`.** The adversarial fire-point scales its _posture_ by
  `Class` — recommend at `Novel`, neutral offer otherwise — but the offer awaits a call regardless. At `Light`,
  that is a permission turn to ask about a pass the posture already declines to recommend.

**Spend is opt-in for code review and ungated for adversarial review.** Both review lanes ship with empty source
lists, so an adopter incurs no automatic review spend until a source is named; the pass ceilings bind only once a
lane exists. The adversarial method has **no configuration surface at all**, across five fire points — three
planning stages, verification, and integration. An adopter who does not want subagent spend can only decline, at
every fire point, indefinitely. Combined with the asymmetry above, that adopter pays five permission turns and
receives nothing for them.

**Resolved: a `Class`-threshold configuration key, defaulting to disabled.** Gate the fire-points on a minimum
`Class` rather than a boolean, so the setting reuses the axis the method already scales on instead of minting a
new concept, and a project can ask for offers at `Novel` only. Disabled is the shipped default, matching the empty
source lists — **ARC ships with no automatic spend and each project opts in**. Discoverability is a documentation
concern and does not outweigh consistency with the lanes.

**Which stops survive streamlining — the signal's location decides, not the stage's name.** The two asymmetries
above both argue for removing stops, and applied uniformly that argument reaches every `adversarial-review`
fire-point, including the three planning stages. It must not, and the reason is derivable rather than a carve-out:

> **A stop is required wherever the completion signal is not fully observable in the artifact.**

- **Verification and integration triggers are artifact-observable.** The task list's phases are complete and the
  verification phase is the literal next item; the review lanes fire at a determined position in the integration
  cascade. Everything establishing "is it time" is on disk, so an agent reading the artifact holds exactly what the
  developer holds. The stop adds no information, which is what makes it ceremony — and what makes autofire correct
  once a project has opted in. Declining costs little in any case: the adversarial pass **augments** the self-verify
  and never replaces it, so the floor beneath an autofired pass is the full criteria validation that runs either
  way. The planning stages have no such floor.
- **Planning-stage boundaries are not.** Whether a draft is done depends on intent the developer has not yet
  uttered, which no artifact carries and no readiness read can reach — `assess-draft-readiness` reads the artifact,
  not the person. Here the stop **is** the input channel rather than a permission turn, so it holds even when a
  project has opted in and the `Class` threshold is met.

This revises the verification asymmetry's remedy without withdrawing the finding: the stop to remove is the one
whose trigger is observable, not merely the one that fires at every `Class`.

**Live evidence from this WU's own grooming.** Concern 9 existed only in the developer's head at the moment the
draft otherwise read as complete. Every artifact-based readiness signal would have returned ready, an autofired
planning pass would have run against a draft about to grow by roughly a third, and its findings would have been
obsolete on arrival.

**Shape — a convergence check, not an authorization form.** What is approved is that _the stage is complete_; the
pass firing is a consequence of that agreement rather than a second decision. So the surface is one conversational
question — this stage looks done, is there anything to raise before it is attacked — and never an enumeration of
pass counts, rubrics, and evaluator conditions. That enumerating shape is precisely concern 9's Defect B arriving
at a different fire-point, and adopting it here would trade one over-rendered interlock for three.

**Boundary with `judgment-authority-model`.** That work unit owns the authority model: which rules yield to
demonstrated judgment, who may override, and how an override is disclosed. This concern is narrower and is exactly
this work unit's stated purpose — whether the shipped workflow carries the discipline its own spec defined. Fixing
the carriage does not settle the authority question, and settling the authority question would not have carried
the rule.

### 9. Integration-boundary procedural accuracy

**One root, three surfaces: the integration boundary's procedural surfaces misdescribe what they do.** The
interlock renders everything it verified rather than what the approver decides; the lifecycle verb names a phase's
content rather than the scheduling act it performs; and the state transition fires two steps before the state's own
documented meaning begins. Each was found independently, and they are one concern because the fixes interlock —
the verb rename is a precondition for naming the interlock's new verbs, and the fire-point correction is what makes
the rename true.

This is also the only concern reaching the integration workflow's procedural shape rather than the review
protocol's content, which is the decomposition signal recorded in § Unknowns.

#### 9a. The interlock surface

**The observed instance.** A sibling work unit's final integration interlock rendered a nine-part wall: approved
head, complete candidate-tail diff, lifecycle state, base-drift reading, pull-request status and requirements,
merge method, review convergence history, a proposed `## Review` record, and a closing paragraph informing the
approver that any head movement invalidates the approval being requested. **None of it was the agent improvising.**
The `integration-interlock` callout prescribes that surface list verbatim, the surrounding step adds "surface this
exact diff, not excerpts alone," and the `Coverage` line came from the pull-request template. The agent complied
exactly.

Three defects are conflated there, and they want different fixes — which is why they resolve together rather than
as three captures.

**Defect A — determinism encoded as prose.** The final integration step runs roughly 125 lines of sequencing:
read drift, validate the returned object's typed fields, refresh, compare the object identifier, merge, rerun
gates, recompose, push, re-run checks, resolve lifecycle state, compose the change-request handle, invoke
readiness, fire the pre-merge seam, retain the head identifier, compose the diff, compose the review record, stop,
apply dispositions, recompose, compare against the approved head, re-read status, invoke unlock, follow its typed
action, re-read checks, replace the summary, read drift once more, merge. Every branch is machine-decidable over
typed output from verbs this project owns. `strategy-procedure-evolution` Principle 1 names this exact
anti-pattern — code wearing prose, unexecutable and uncheckable where it sits — and illustrates it with a
_one-line_ condition. This is that anti-pattern at 125-line scale, in the workflow carrying the corpus's highest
imperative density.

The clearest tell is self-validation: the step instructs the agent to confirm that the drift verb returned a
well-formed object with the required typed fields. We wrote that verb. If it can emit a malformed envelope that is
a defect in the verb, and asking the agent to re-check its own tool's contract violates both Principle 1 and
Principle 4 in a single paragraph.

**This is not the load-cost disease, and the distinction decides the remedy.** Nothing here is carried-and-skipped:
the workflow loads only when integrating, and every line applies when it does. The cost is execution fidelity under
a stochastic interpreter, paid only by the sessions that run it — and it _worsens_ with accretion, because prose
constraints do not compose. Each added imperative dilutes the attention available to the others, so a 125-line
prose program is less reliable than a five-line verb call. The accretion defeated the goal it was added for. The
remedy is therefore relocation, not relaxation: loosening the constraints would trade a fidelity problem for a
correctness one.

**Defect B — the interlock renders everything it verified.** Nine things must be _established_; the approver's
decision turns on perhaps three — what is merging, where review landed, and anything not clean. There is no notion
anywhere in the step of _checked and clean therefore silent_. The precedent already exists in this project:
session initialization states "only mention gaps in orientation if they exist" and carries an explicit
never-include list covering clean freshness and passed environment checks. The integration interlock holds the
exact inverse posture, and nothing records that as a decision.

**Defect C — the approval-invalidation narration, and the `Coverage` leak.** The exact-head pin is sound and stays:
it is a compare-and-swap guarding a real failure mode, an agent helpfully pushing a fix in the window between
approval and merge. What is wrong is telling the approver that their approval is conditional. The pin constrains
the _agent_, not the human, and any change in that window would have come from the human anyway. Keep the
mechanism, delete the explanation, and let the invalidation path speak only when it actually fires.

The `Coverage` field is the same defect in the public surface. It is prescribed in three places — the integration
step, the pull-request template's optional-sections guidance, and the errand workflow — and it renders as prose
like "targeted verification carried prior complete coverage across the archive-only candidate tail." That is four
load-bearing internal terms addressed to a reader with no model for any of them, which
`DEV-RULES.ARC § Commit and PR surface language` already prohibits: pull-request prose reads as the operation
performed, legible without ARC-specific knowledge. `Local` and `Hosted PR` and `Triage` survive that test — they
tell a reader who reviewed and what happened to findings. `Coverage` is audit metadata whose only interested reader
already approved it. **Resolved: cut it from the pull-request record at all three loci and route the audit content
to Completion Notes**, which are internal and already exist.

**Resolved — the deliverable is two verbs around one human stop.** The cut falls where the human does:

- **`arc integrate checkpoint <name> --json`** absorbs the pre-stop sequence — the authoritative drift read and its
  validation, the reconcile decision, lifecycle and cadence resolution, and the readiness envelope. It returns one
  typed verdict: `ready` carrying the approved head, candidate-tail diff reference, requirement and status
  summary, merge method, and the composed review record; `reconcile` carrying the drift verdict; or `blocked`
  carrying a typed reason.
- **`arc integrate merge <name> --approved-head <sha> --json`** absorbs the post-approval sequence — head
  recomposition and comparison against the approved value, status re-read, unlock dispatch and clearance await,
  check re-read, review-summary replacement, the final drift read, and the pinned merge. It fails closed on any
  mismatch and returns `merged`, `invalidated` with a typed reason, or `blocked`.

The approval binds to the head identifier as a token the second verb validates. That is what makes Defect C
structural rather than instructional: the invalidation rule stops being a paragraph the agent must remember and
narrate, and becomes a precondition the verb enforces. The agent no longer explains the pin because it no longer
carries it.

**What stays prose is the judgment**, and naming it is half the deliverable: review applicability, disposition
decisions, whether an early reconcile is worth the pass, and the recommendation accompanying the interlock. Those
are judgment leaves with no machine-decidable form. The invariants that survive as prose are the bias-guarding
ones — clearance never carries, advisory receipts are not merge authority, the interlock is the sole merge
authority — though they are currently restated six or seven times across the phase, which is itself a
prose-substrate tell that the author did not trust the substrate. Once the verbs enforce the sequence, one
statement each is enough.

**Surface discipline lands as precomposed text, not as an instruction.** Per `strategy-procedure-evolution`
Principle 6, the checkpoint envelope carries the interlock's rendered surface already composed and already
exception-filtered — clean signals collapsed to a line, unclean ones expanded. This is deliberately not a prose
rule telling the agent to be brief: a template in markdown is untestable, and the same template in code is a unit
test away. It also makes Defect B mechanically enforced rather than re-litigated at each site.

#### 9b. The lifecycle verb names the wrong axis

**`arc integrate` reads as the merge because it is named for its phase's content rather than for the act it
performs.** Its own help string already disclaims the reading — "marks phase entry, not the merge" — which is a
name requiring a disclaimer.

The lifecycle `State` is the **scheduling axis**, a contract `project-state-integrity` states explicitly and
`wu-lifecycle-state-model` owns. Read that way, the transition family has one invariant: **each verb names a
scheduling act.** `activate` schedules into implementation, `park` and `resume` deschedule and reschedule,
`materialize` schedules onto this machine, `abandon` and `archive` are terminal scheduling acts. `integrate` alone
names what happens _during_ the phase its act schedules into. It is the only member on the wrong axis, which is
why it is the only member whose name misleads.

**Resolved: rename to `arc submit`.** It names the scheduling act, matches the family's form, and carries no merge
reading. The objection that it does not itself open the pull request dissolves on the same axis argument that
diagnoses the defect: `activate` does not implement anything either. Both name the act of scheduling work into a
phase; the phase's work then happens. The rename also frees `integrate` as a namespace, which is what makes 9a's
`arc integrate checkpoint` and `arc integrate merge` honest rather than nested beneath a command that disclaims
being the merge — a benefit, not the justification.

**The state keeps its name.** `**State:** Integrating` is unchanged. Renaming it would re-key an existing meaning,
which the axis contract prohibits, and the wide sweep buys little once the command stops competing for the word.
The result is a three-way split where one word currently does three jobs: `arc submit` is the transition,
`Integrating` is the phase, and `integrate-work-unit` plus the `arc integrate` namespace are the phase's procedure.

#### 9c. The transition fires before the state it claims to cover

**The workflow contradicts itself, and its own prose is the witness.** Step 1 states that "the `Integrating` state
covers PR open through review-response" — and fires the transition at Step 1. The pull request opens at **Step 3**,
with the local self-review preflight between them. A work unit is therefore `Integrating` through a window in which
nothing is public and no reviewer outside the author's machine can see it.

Verification is not the misplaced part, which is worth recording so it is not re-derived: the task list's
verification phase runs Tier 3 gates, success criteria, and the adversarial pass entirely under `**State:**
Active`, and only then does `arc finalize verify` write the handoff pointer. The transition already sits after
verification. What it sits before is publication.

**Resolved: move the fire point to the pull-request-open boundary**, so the state begins when its documented
meaning begins. This mints no state and re-keys nothing, and it is what makes `arc submit` accurate rather than
approximately right — at Step 3 the work genuinely goes from private to public, which is precisely what submitting
means.

**Forward-compatible with `wu-lifecycle-state-model` by construction.** Shrinking `Integrating` to the public phase
carves out exactly the private-but-implementation-complete window a `Candidate` state would later occupy, so the
two compose rather than collide. `submit` also keeps its meaning under that model, because it names the public
transition either way. The private-side transition — `propose`, entering verification and local review — is
deliberately **not** proposed here: it requires a state to transition into, and that state is not ours to mint.

#### The control — `verify-work-unit` is clean, and that is evidence

The sibling workflow in the same lifecycle phase shows none of this. It is short, runs three steps with no
branching over typed output, calls one verb, and its imperatives are bias-guarding rather than procedural —
"criterion text is immutable; never rewrite a criterion to match what was built." There is no prose program in it
because it has no deterministic sequencing to encode.

That makes it a natural control, and it narrows the diagnosis: the defect tracks the presence of machine-decidable
branching, not a workflow's importance, ceremony, or lifecycle position. A remedy aimed at "lifecycle workflows are
over-specified" would be aimed at the wrong property. Its two real issues are already owned elsewhere — the
`Next Action` string-prefix coupling routed to `wu-lifecycle-state-model`, and the unconditional adversarial stop
at every `Class`, which is concern 8's second asymmetry. **Not in scope, deliberately.**

#### Boundaries

**Boundary with `composable-workflows` — integration-only, by an explicit rule.** That work unit's adoption ladder
partitions the corpus, and its scope estimate records a graduation trigger reading "before any at-scale touch of
the inline-gated lifecycle workflows" — which is precisely this workflow. The rule that keeps this concern clear
of it: **remove determinism, do not restructure the remainder.** Extraction shrinks the surface that work unit
later converts and therefore helps it; reshaping — signature-led contracts, fragment extraction, spine budgets —
would pre-empt its deliverable. The operative test at specification time is whether a proposed change would look
different depending on whether that work unit's authoring pattern had landed. If yes, it is theirs.

Nothing here invents a mechanism that work unit owns. Its fragment model already names the taxonomy cell this
lands in — a fixed public method implemented at the code tier, with the lifecycle relocation mutators and the thin
post-merge teardown as its recorded instances. This adds a second instance on the workflow where the payoff is
largest, and returns evidence rather than claiming territory.

**Boundary with `judgment-authority-model`.** Its discriminator sorts _prohibitions_ by what they guard against.
This concern is about _prescriptions_ — sequencing, not permission — so the discriminator does not reach it. The
evidence is in that work unit's own corpus sweep, which audited this workflow and rated it least affected because
its twenty-plus prohibitions are all bias-guarding and survive unchanged. That reading is correct and it is
exactly why the sweep could not see this: the defect is not any single prohibition but the 125 lines between them.
Defect C's framing half is genuinely that work unit's face (c) — authority located, capability or standing
miscommunicated — and this concern's fix for it is the narrow enactment, not the model.

**Boundary with `wu-lifecycle-state-model` — it owns the vocabulary; this owns one command name.** That work unit
owns the `State` values and carries `project-state-integrity`'s contract to mint none and re-key none. Everything
here respects it: 9b renames a CLI command, not a state, and 9c moves when an existing transition fires, not what
it means. The `Candidate` state and the `propose` transition are that work unit's, and a capture routed at this
grooming records why — verification-passed is an attested artifact-axis signal projected only into a free-text
meta field, which is its own core reform's shape at the other end of the lifecycle. **No `Depends On` edge**: this
concern is correct under today's model and stays correct under theirs.

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
- **Codify "hosted providers are selected only by the driver" as a requirement** (concern 1). Rejected — the
  provider interface is a pull-request comment that anyone can write, so no schema or check can enforce it.
  Asserting it would create exactly the unbacked authority claim this WU exists to remove. The achievable form is
  completeness of the in-band path.
- **Express an operator preference by recording a safe-unavailable attempt** (concern 1). Rejected — this is the
  laundering failure the design exists to prevent: an operator assertion entering the observed-attempt history
  destroys the provenance distinction permanently, and would make the audit trail unable to separate an observed
  provider outcome from an asserted one.
- **Delete the guidance blocks outright** (concern 4). Rejected — they are the only channel carrying ARC's
  exact-scope and clean-result contract to a hosted reviewer, which is the half a provider genuinely cannot infer.
- **Regenerate both static copies from the typed projection** (concern 4). Rejected — that restores the generator
  right-sizing deliberately deleted, to maintain roughly four lines of content.
- **Split the adjacent surfaces (5–6) into their own work units.** Rejected for now: both are small once settled,
  and concern 6's shape resolved to three wording edits rather than a protocol. Each carries an independent-ship
  escape hatch instead.
- **Answer disproportionate review spend with a durable multidimensional review-budget ledger** — logical passes,
  evaluator invocations, and token or payload budget, accumulated across a work unit's whole integration lineage
  and inherited by each new head. Proposed from a sibling work unit's integration, where four review waves and
  eighteen evaluator invocations ran without an effective bound. **Rejected as disproportionate to its own
  evidence.** Roughly three quarters of the measured raw cost came from implementation workers inheriting full
  conversation history, which is a spawn default rather than an accounting failure; and the caps that should have
  bounded the rest already exist and are already wired to an approval interlock — they went unenforced because the
  request that reaches them cannot be composed, not because they were absent or too coarse. Building an accounting
  mechanism first would elaborately measure a cost that mostly evaporates once the spawn default and the
  composability gap are fixed. The proportionate response is concern 5's derivability half, concern 7's
  convergence definition, and a bounded spawn context — none of which is new machinery.
- **Relax the integration step's constraints rather than relocate them** (concern 9) — the intuitive reading of an
  over-specified procedure. **Rejected**: the sequencing is deterministic, so loosening it trades a fidelity
  problem for a correctness one. The constraints are not wrong; they are in the wrong substrate.
- **Trim the interlock's rendered surface in prose** (concern 9) — instruct the agent to summarize when everything
  is clean. Rejected as the same defect one level up: a rendering rule written in markdown is untestable and
  re-litigated at every site, where the precomposed-envelope form is a unit test away and enforces itself.
- **Generalize concern 9 to every workflow interlock.** Rejected — `composable-workflows` owns the corpus-wide
  authoring pattern and records a graduation trigger covering exactly this class of workflow. Fixing one site in a
  way that generalizes locally would mint the competing convention its adoption ladder exists to prevent. The
  integration workflow is taken as a single dogfooded instance instead, under the remove-determinism boundary.
- **Wait for `composable-workflows` before touching the integration workflow at all** (concern 9). Rejected — it is
  `planned` inside a cohort, staged large, and carries six unintegrated buffer items, so waiting defers the fix
  indefinitely. Extraction is also the one change that is safe ahead of it: it shrinks what that work unit later
  converts rather than pre-empting the shape of the conversion.
- **Keep `Coverage` in the pull-request record but reword it for a general reader** (concern 9). Rejected — the
  wording is not what fails. The field reports on the review process rather than on the change, so no phrasing
  makes it relevant to the audience the surface addresses; the internal reader it does serve is served by
  Completion Notes.
- **Rename the lifecycle command to a compound — `enter-integration` / `begin-integrating`** (concern 9b).
  Rejected — no sibling transition verb is compound, and putting the phase noun back into the command re-couples
  the act to the phase, which is the defect. A compound is the right shape only when no domain verb fits the act;
  here one does. `activate` is not `enter-active`.
- **Noun-ify the command to `arc integration`** (concern 9b). Rejected — it fixes the misread but breaks the
  family's verb form, and standing alone it does not say what it does to the state. It also fails to free the word,
  so the new merge verbs would still nest beneath a phase-entry command.
- **Fold verification and integration under one generic name such as `finalization`** (concern 9b). Rejected on
  two independent grounds: `arc finalize` already exists as a planning-ceremony verb — including `arc finalize
  verify`, the command that closes verification — and collapsing two phases under one name would re-key existing
  `State` meanings, which the axis contract prohibits.
- **Rename `**State:** Integrating` alongside the command** (concern 9b). Rejected — it re-keys an existing
  meaning against the axis contract, spans every meta file plus the resolver, session type, and cadence checks, and
  buys little once the command stops competing for the word.
- **Also mint the private-side `propose` transition and a `Candidate` state** (concern 9c). Rejected as
  out-of-owner rather than wrong — the framing is sound and was routed to `wu-lifecycle-state-model`, which owns
  the vocabulary and is fenced by the same contract that permits the command rename.
- **Extend concern 9 to `verify-work-unit`** as the other integration-phase workflow. Rejected on inspection: it
  has no deterministic sequencing to relocate, its imperatives are bias-guarding, and its two real issues are
  already owned by `wu-lifecycle-state-model` and concern 8. It is retained as the diagnostic control instead.

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
- **Sizing — reduced by concern 2, then materially widened by concern 9.** Concern 2 shed the partition-transport
  work to its rightful owner and became a capability removal, taking the largest unbounded item out of the WU.
  Concern 9 puts comparable weight back and changes the WU's character: it is the only concern reaching the
  integration workflow's procedural shape rather than the review protocol's content, and the only one whose
  deliverable is two new lifecycle verbs. **This is now the decomposition signal**, and it is cleaner than the one
  the cohort-fit read was waiting on — concerns 1 through 8 share a subject and concern 9 does not. Run the read
  once concerns 1 and 3 are specified, expecting it to fire.
- **Open — how much of the integration step survives extraction** (concern 9). The judgment leaves are named, and
  the bias-guarding invariants are known to survive, but the residual line count is not established until the verb
  boundaries are specified. It decides whether the concern also earns a prose-economy pass over what remains or
  leaves that to the corpus-wide sweep. Not a direction question.
- **Open — where the pre-merge seam sits relative to the merge verb** (concern 9). The seam currently fires inside
  the sequence the verb would absorb, and an extension is a project-authored surface the verb cannot execute
  blindly. The likely shape is that the checkpoint verb returns before the seam and the merge verb resumes after
  it, leaving the fire-point in the workflow where the agent can honor its declared contract. To be settled against
  the extension contract, not assumed.
- **Open — the rename's deprecation posture** (concern 9b). Whether `arc integrate` survives as an alias for a
  window or the rename lands clean. Self-hosting makes this project the only caller, but the command ships in the
  published package, so the question is an adopter-compatibility one rather than an internal one.
- **Assumption — the review record's remaining fields are worth keeping.** Cutting `Coverage` is settled; `Local`,
  `Hosted PR`, and `Triage` are retained on the reading that a reader wants to know who reviewed and what became of
  the findings. That has not been tested against anyone outside this project, and the whole section is optional
  today, so the retention is a judgment rather than a validated requirement.
- **Resolved — `ci-defer-heavy` placement.** Settled to a repository-local review-event workflow and routed out of
  this WU as an errand (below).

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
    - **Its face (c) reproduced during this WU's own errand.** `run-errand`'s reviewed-lane instructs the agent to
      "leave the pull request open for owner review," which reads as withholding the authority to perform a merge
      the developer has just authorized at the integration interlock. That WU already records the developer's
      intent — approval is theirs, the button-press is not withheld — so the line is a live instance of a
      procedural statement written to locate authority being read as removing capability. Evidence that the face is
      real and recurring, not an argument for fixing the wording here.
- **`execution-delegation-doctrine` — owns the spawn-context guard.** Implementation and review workers inheriting
  full conversation history accounted for most of the raw cost measured at a sibling work unit's integration.
  Bounding what a spawned worker receives — the exact target, owned loci, governing documents, normalized findings,
  and required gates rather than the whole authoring conversation — belongs there, alongside the per-harness
  activation machinery that WORKING-MEMORY already records as its scope. It is also the one place in this cluster
  where prose alone is insufficient: a harness whose spawn primitive carries no instructions cannot be constrained
  by a method the spawned process never reads.
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
- **`composable-workflows` — adjacent owner, bounded by an explicit rule rather than an edge.** It owns the
  corpus-wide authoring pattern and the load-cost mechanism; concern 9 owns one integration-specific enactment of
  `strategy-procedure-evolution` Principle 1. The boundary is stated in the concern and reduces to
  remove-determinism-do-not-restructure. No `Depends On` edge in either direction: this concern does not need its
  pattern, and it does not need this concern's verbs.
    - **A framing note was routed to it via `USER-INBOX` at capture time rather than folded here.** Its problem
      statement frames the procedural-prose disease solely as always-read cost, which would rate this instance
      healthy — nothing is carried-and-skipped, and the cost is fidelity paid by firing sessions. Its structural
      budget open question inherits the same blind spot by being framed in line and token terms. Routed rather
      than written into its draft, per the standing rule against editing a sibling's planning artifacts.
    - **Its taxonomy already covers the remedy**, so this is dogfood rather than invention: a fixed public method
      implemented at the code tier is a cell it named, with the lifecycle relocation mutators and thin post-merge
      teardown as recorded instances. Concern 9 supplies a second instance and returns the evidence.
- **`wu-lifecycle-state-model` — owns the vocabulary concern 9 operates under, with no edge in either direction.**
  It holds the `State` values and `project-state-integrity`'s contract to mint none and re-key none; concern 9
  renames a command and moves an existing transition's fire point, respecting both. Two things were routed to it at
  this grooming rather than designed here: the `Candidate` state with its `propose` transition, and the finding
  that motivates them — verification-passed is an attested artifact-axis signal recorded only as a string prefix in
  the meta's free-text `Next Action`, which the session-init probe then pattern-matches. That is its own core
  reform's shape at the far end of the lifecycle, so the reform lands one projection primitive with two instances
  rather than solving readiness and rediscovering the shape later.
    - **The composition is checked, not assumed.** Moving the transition to the publication boundary carves out
      precisely the private-but-implementation-complete window a `Candidate` state would occupy, and `submit` names
      the public transition under either model. Concern 9 is therefore correct today and stays correct after that
      reform lands.

### Carried input — `ci-defer-heavy` automation (settled; routed to an errand)

Raised during this WU's grooming and settled in the same session. **Not this WU's work and not a stub** — the
mechanism below is one small repository-local workflow file with no design left to derive, which is errand-shaped.
Recorded here so the errand is a straight implementation rather than a re-derivation.

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

**Settled mechanism — a repository-local workflow keyed on review events, not an agent-layer procedure.** The
label toggles on the change-request-submitted and approved review events the host already emits: a
changes-requested review adds the label, an approving review removes it. The sequence is exactly the endorsed
shape — the pull request opens and runs heavy once for early discovery, the fix loop runs deferred, approval
removes the label so the full suite runs once before merge.

Two alternatives were considered and rejected:

- **New extension seams wired into the review lifecycle.** No declared seam fires at the right moment: the
  pre-open and post-open seams both precede review, the per-push seam cannot distinguish a first push from a fix
  push without inspecting state, and the pre-merge seam sits after review-response processing, where removing the
  label starts a run that merge authorization's exact-head recheck then treats as unsettled. Serving this would
  mean minting two new fire points in shipped Framework workflows — permanent framework surface with
  forward-compatibility obligations — for one repository's CI cost. The deeper objection is that the trigger is
  not a lifecycle moment at all: it is a host review event, which the agent layer would be reconstructing rather
  than owning.
- **A standing rule in the project development rules.** This relocates the remembering from the developer to the
  agent rather than removing it, cannot fire when no agent is present at the moment a reviewer responds, and
  spends always-loaded context on a conditional optimization.

**Why this is safe to set and forget: every failure mode is fail-safe.** Wrongly applying the label makes the
rollup status fail, which blocks the merge; wrongly removing it runs the full suite. No defect in the mechanism
can let an unverified head merge. That property, not the minutes saved, is what makes the automation
proportionate — and it is also why the agent layer is the wrong home, since the mechanism needs no judgment.

Three edges to handle in the errand:

- **A clean hosted Codex pass may not be an approving review.** Its clean signal is an issue comment rather than a
  review state, so removal keyed only on approval would not fire for it. Removing on any approving review is
  sufficient, because the developer's own approval always precedes merge and is the authoritative gate.
- **CodeRabbit appears to approve once all conversations are resolved**, even where it was not the requested
  reviewer. That is convenient here — thread resolution is a good proxy for the fix loop ending — and its failure
  mode only forfeits savings: resolving threads early un-defers early, degrading to undeferred behavior rather
  than to an unsafe one.
- **Concurrent reviewers** could approve while another has outstanding change requests. Not this project's normal
  operation, and the early un-defer it would cause is fail-safe.

## Scope Estimate

Large, revised upward. The prior medium-to-large read held for concerns 1 through 8: concern 2
collapsed from an experiment-gated open design to a capability removal plus a handoff note, and concern 4's shape
settled rather than staying deferred behind that experiment. Concern 9 changes the total — two new lifecycle verbs
absorbing the integration workflow's final phase, the prose extraction that follows, and a three-locus cut to the
pull-request record. It is the only concern whose deliverable is new CLI surface rather than a correction to
existing surface.

Concern 9's own weight grew again once the verb rename and the fire-point correction joined it: the rename touches
the CLI surface, the workflows and skills that invoke it, and the published package's compatibility posture.

Across all nine the work spans configuration, policy contracts, adapter execution, CLI surface, lifecycle verbs,
workflow prose, and method prose. Nothing carries an unrun measurement on its critical path. The size is now a
decomposition question rather than a risk — see the sizing entry above.

## Continuity

- **State:** maturing, at the formalization-readiness boundary. Every concern is settled to the decision level, and
  the two fundamentals that once gated the WU — the carrier question and the selection-authority shape — are both
  answered. What remains open is detail and policy defaults rather than direction. Concern 9 arrived after that
  boundary was first reached and does not reopen it, but it does change the WU's character: eight concerns correct
  the review protocol's content, and the ninth corrects the integration workflow's procedural shape. The framing
  now names three patterns rather than one root, which is the honest description of what the scope became.
- **Resolved:** the problem framing and its three patterns — authority claims outrunning evidence, correct rules
  unreachable at the decision point, and procedural surfaces that misdescribe themselves; the nine-concern
  scope; concern 1's corrected diagnosis (the typed fallback rule is already enforced; the driver was never
  consulted), the non-enforceability of driver-only selection, the operator override modelled on the existing
  ceiling override, the provenance separation that prevents laundering, and its three sub-decisions — no pass
  consumption, one-pass target-and-lane binding, unfloored skip; concern 2's carrier question, answered as
  ARC-side curated orchestration and re-cut to a capability removal with a named restoration condition and an
  accepted evaluator-diversity cost; the standard-lane-only
  consequence of that removal; concern 3's two-loss decomposition and all five of its design decisions — trigger,
  destination, retention, ownership split, and trust boundary — plus the worktree registration-isolation pattern
  and its two supporting observations; concern 4's trim-to-contract-floor decision, its three drift findings, and
  the inverted sequencing (trim first); concern 5 resolved to a schema-emitting flag, and split into its
  discoverability and derivability halves; concern 6 resolved to three
  wording edits with its rejected shapes recorded; concern 7's separation of the exit gate from the convergence
  signal, convergence measured on what a pass surfaced, severity provenance anchored to triage rather than the
  provider label, one shared definition across both loops, the recommend-but-never-proceed boundary for judgment
  at the cap, and the `blocker` → `critical` rename sequenced first; concern 8's finding that the stop discipline
  is correct but archived, the two autonomy asymmetries, the `Class`-threshold spend gate defaulting to
  disabled, and the observable-signal rule that decides which stops survive streamlining — verification and
  integration autofire once opted in, planning-stage passes always converge with the developer first;
  concern 9's single root across three surfaces, its three-defect decomposition of the interlock, the
  two-verb deliverable with the approved head as the binding token, the judgment leaves named as what stays prose,
  the precomposed-envelope form for surface discipline, the `Coverage` cut at three loci, the
  remove-determinism-do-not-restructure boundary that keeps it clear of `composable-workflows`, the scheduling-axis
  diagnosis of the misnamed lifecycle verb and its rename to `arc submit` with the state left unchanged, the
  fire-point correction to the publication boundary with its forward-compat check against a later `Candidate`
  state, and `verify-work-unit` established as the diagnostic control that narrows the defect to machine-decidable
  branching; the review-budget ledger rejected with its
  reasoning; coordination-not-dependency with `judgment-authority-model`;
  the two-front handoff contract with `chunk-scope-binding`; the spawn-context guard routed to
  `execution-delegation-doctrine`; the `ci-defer-heavy` mechanism and its routing out to
  an errand; `Class: Heavy`.
- **Open:** how a confirmed severity maximum is computed across a chunk series, and whether the frontline lane
  needs the same attempt field; whether existing test
  coverage already proves the enforced fallback rule, or a test is owed; the single
  trimmed-guidance timeout observation; whether the parity check lands as a unit test or a pre-commit contract
  check; the retention default's concrete value once real diagnostics volume is observed; concern 9's residual
  prose volume after extraction, where the pre-merge seam sits relative to the merge verb, and the rename's
  deprecation posture for the published package.
- **Next:** run the formalization-readiness assessment, then the decomposition read the sizing entry now expects to
  fire. Every concern is settled to the decision level. Three cautions for the session that takes it up: concerns 7,
  8, and 9 all landed **after** this pass's consolidation, so re-read the whole draft for coherence before treating
  it as a single input; `Class` was resolved when the scope was six provider-protocol concerns, so re-run
  `classify-work-unit` now that it also spans a typed-schema rename, convergence semantics, workflow autonomy
  discipline, and two new lifecycle verbs; and run `assess-cohort-fit` in the same pass rather than deferring it —
  concern 9 does not share a subject with concerns 1 through 8, which is the cut the earlier reads were waiting for
  the design to make real.

---
