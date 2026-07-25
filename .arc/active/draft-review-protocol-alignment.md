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

## Scope

Eight concerns, in rough dependency order. The first four are the hosted-protocol core; the last four are adjacent
surfaces that arrived through their own captures and are confirmed in scope.

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
severities today and nothing reconciles them. The triage method contracts the primary to verify each finding
against source and record its severity; the gate parses severity from provider text at an adapter boundary. The
typed record — the only surface a control decision can read — holds the **provider's** label, while the verified
judgment sits in prose no mechanism can see. Keying convergence off the provider's label would let an
over-labelling reviewer inflate the loop and an under-labelling one end it early: control flow driven by an
unaudited external opinion, which is this WU's root defect expressed on the severity axis. Convergence keys on the
triage-confirmed severity, which requires that verdict to reach the typed record.

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

**Scope note.** The wording and the shared definition are cheap. Landing triage-confirmed severity in the typed
record is the one part with real code cost, and the gate's exit becoming materiality-based is a genuine behavior
change — today any finding forces a response cycle, where a pass carrying only minors could converge. Size those
two against the response path before committing to them inside this WU.

### 8. Stop discipline and spend opt-in

Two halves of one question: what the integration stretch does without asking, and who decided that it may.

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

**Boundary with `judgment-authority-model`.** That work unit owns the authority model: which rules yield to
demonstrated judgment, who may override, and how an override is disclosed. This concern is narrower and is exactly
this work unit's stated purpose — whether the shipped workflow carries the discipline its own spec defined. Fixing
the carriage does not settle the authority question, and settling the authority question would not have carried
the rule.

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

Medium-to-large (several days). Reduced from the prior estimate: concern 2 collapsed from an experiment-gated open
design to a capability removal plus a handoff note, and concern 4's shape is now settled rather than deferred
behind that experiment. What remains spans configuration, policy contracts, adapter execution, CLI surface, and
method prose — wide, but no longer carrying an unrun measurement on its critical path.

## Continuity

- **State:** maturing, at the formalization-readiness boundary. Every core concern is now settled to the decision
  level, and the two fundamentals that once gated the WU — the carrier question and the selection-authority
  shape — are both answered. What remains open is detail and policy defaults rather than direction.
- **Resolved:** the problem framing and its single root (authority claims outrunning evidence); the six-concern
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
  is correct but archived, the two autonomy asymmetries, and the `Class`-threshold spend gate defaulting to
  disabled; the second pattern named in the problem framing — correct rules unreachable at the decision point;
  the review-budget ledger rejected with its
  reasoning; coordination-not-dependency with `judgment-authority-model`;
  the two-front handoff contract with `chunk-scope-binding`; the spawn-context guard routed to
  `execution-delegation-doctrine`; the `ci-defer-heavy` mechanism and its routing out to
  an errand; `Class: Heavy`.
- **Open:** the size of landing triage-confirmed severity in the typed record, and whether the gate's
  materiality-based exit belongs in this WU — both to be assessed against the response path; whether existing test
  coverage already proves the enforced fallback rule, or a test is owed; the single
  trimmed-guidance timeout observation; whether the parity check lands as a unit test or a pre-commit contract
  check; the retention default's concrete value once real diagnostics volume is observed.
- **Next:** size concern 7's two code-bearing parts against `arc review respond` — whether the triage verdict can
  ride the existing disposition set, and what the gate's exit change costs. That result decides whether concern 7
  stays whole in this WU or sheds its gate half. Then run the formalization-readiness assessment: direction is
  settled across all seven concerns, and the remaining question is whether the open items are detail-design a spec
  can absorb.

---
