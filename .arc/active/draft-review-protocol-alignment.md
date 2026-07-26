# Draft: review-protocol-alignment

- **Origin:** [internal] — `USER-INBOX § Errand`, "Align hosted-review configuration with the right-sized ARC
  protocol", captured at the first post-right-sizing integration diagnosis on PR #354; joined by the review-gate
  CLI request-body capture (errand `gate-tier-right-sizing`, PR #355) and the `adversarial-review` `withstood`
  capture.
- **Purpose:** Close the gap `review-gate-right-sizing` left between the _lean_ hosted-review protocol it shipped
  and the _surfaces that still describe the controller-era one_ — so provider selection is authoritative, provider
  capability is declared only where it is proven, and the rules that already govern review are reachable from the
  point where the decision is made.

- **State:** not formalization-ready — 2026-07-26, decomposed, then reopened by adversarial pass one. Pre-PRD.
- **Class:** `Heavy` (derivation and scale both fire; compose rather than invent).

---

## Problem / Motivation

`review-gate-right-sizing` removed the resident controller, the GitHub App path, provider qualification, and the
guidance-evidence admission machinery. What it did not do is reconcile every surface that the removed machinery
used to own. The residue is not cosmetic: on PR #354 it produced a **misdiagnosis that bypassed configured
policy**, and the diagnosis run surfaced three further gaps that share one root — _the protocol asserts things about
providers that nothing establishes or checks._

Four distinct failures, from one integration:

1. **A skip was read as an attempt.** `.coderabbit.yaml` gated automatic review on a label that no longer existed,
   so every PR emitted a successful `review skipped` status. That was misread as a failed CodeRabbit attempt and
   led to a direct `@codex review`, bypassing the configured `coderabbit-pr, codex-pr, delegated-agent` preference.
   _(The configuration half shipped separately as errand `coderabbit-manual-only`, which pinned every automatic
   path off explicitly; the status now reads `Review skipped: automatic reviews are disabled`, an accurate report
   of the configured policy rather than a symptom of a broken one. The protocol half was assumed to be this WU's,
   but the typed fallback rule turns out to be already enforced — the driver was simply never consulted. See
   concern 1, where this failure resolves into the missing operator override rather than a missing fallback
   rule.)_ Nothing mechanical reads that status as review evidence: `main`'s required checks are `merge-ok` and
   `arc-cleared`, so a green skip cannot satisfy branch protection. What remains is entirely reader-side — an
   attempt belief formed from a surface that was never the authority.
2. **Capability is advertised without being established.** The policy driver advertises `coderabbit-cli` for
   `chunked` frontline scope, but the frontline run request carries only target, resolution, and timeout, and the
   execution adapter always emits a whole-target `--base-commit` command. No partition, closure chunk, seam scope,
   or aggregation contract ever reaches the provider. The advertised capability is unbacked.
3. **Failure destroys its own evidence.** Two CodeRabbit CLI attempts on a 10,867-line target returned typed
   `execution-timeout` with no findings and no partial result. The diagnostic that would explain why — the saved
   provider prompts — lived only inside the ephemeral detached worktree, which cleanup removed. Investigating cost
   a second costly review rather than a log read. _(The fix is `review-checkout-lifecycle`'s; the failure is
   recorded here because it is a third of the evidence establishing the root shape below.)_
4. **The operator has no typed way to choose.** After the CLI timeouts, hosted Codex was chosen deliberately
   because it handles large diffs better. The driver still selects `coderabbit-pr` first and exposes no one-run
   source override, so a legitimate preference had to be expressed by going around the driver.

Underneath all four is the same shape, and it is worth naming because it is also the WU's design constraint:
**the protocol's authority claims outrun its evidence.** A configured preference that can be bypassed by going
around the driver is not authoritative; a capability declared in policy but absent from the request contract is not
a capability; a typed failure outcome with no retained diagnostic is not actionable.

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

Eight concerns, in rough dependency order. The first three are the hosted-protocol core; concerns 4 and 5 are
adjacent surfaces that arrived through their own captures; concerns 6 and 7 surfaced during grooming; concern 8
was surfaced by concern 2's capability edit, kept here for the half that shares concern 2's substrate and stubbed
away for the half that does not. All eight are properties of the review protocol's content — the shared subject
that survived the decomposition.

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

**The attempt-ordering collision, and how promotion survives it.** The driver refines the attempt history to an
ordered unique subsequence of the configured sources. That invariant holds for free today because selection always
walks the configured order, and it is load-bearing — it is one of the four sites that make the fallback rule
enforced rather than merely stated. A promoting override breaks it directly, and does so on the motivating case:
the configured order is `coderabbit-pr, codex-pr, delegated-agent`, so promoting the fallback `codex-pr` and then
falling through to `coderabbit-pr` yields an attempt chain that runs backwards through the configured order and
fails validation mid-pass.

**Resolved — the invariant is validated against the pass's _effective_ order, not the configured one.** The
override yields an effective source order for its pass; the refinement checks the attempt chain against that. The
invariant's meaning survives unchanged — the chain walks the preference order forward with no repeats — and only
the definition of "the preference order" becomes override-aware. It adds no statefulness: the driver is stateless,
the caller re-sends the whole request on every call, and the attempt chain is per-pass, so the override's one-pass
lifetime and the chain's lifetime already coincide. The permutation belongs at the resolution layer, where the
configured sources are in scope — the same layer this concern already establishes as the enforcement locus.

Two consequences worth adopting deliberately rather than inheriting:

- **A promoted source that falls through is not re-eligible later in the same chain.** Subsequence semantics admit
  no repeats. This is the same discipline the configured order already enforces, applied to the effective one.
- **Expressing promotion as a skip is not equivalent, and is worse here.** Skipping `coderabbit-pr` to reach
  `codex-pr` leaves a rate-limited `codex-pr` with nothing to fall back to within the pass — strictly less capable
  than the status quo the override exists to improve on.

**Settled sub-decisions.**

- **An override never consumes a pass.** Selection does not consume; the resulting attempt's outcome does. This
  matches every existing selection-time resolution state, which reports no consumed pass.
- **Lifetime is one pass, bound to exact target and lane, and never sticky.** It binds the way the ceiling
  override binds to its exhausted pass count, so it cannot silently carry across heads or passes. **One pass means
  the whole fallback chain, not one call:** the override must ride every call in that pass, since dropping it
  mid-chain re-validates an effective-order history against the configured order and turns a legal attempt list
  into a parse error.
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

**Decision — remove `chunked` from `coderabbit-cli`, and grant `frontline` to `delegated-agent`.** These are one
decision, not two: the removal alone would leave chunked review with no frontline home at all. The rationale for
the removal is not that the carrier failed — it demonstrably completed every exact scope — but that it is the only
candidate carrier requiring a purpose-built projection to be scoped at all, while being slower and blind to
untracked files. It is the most expensive capability to back and the least valuable once backed. The grant makes
"chunked review runs through a Claude or Codex subagent carrier" true rather than aspirational.

**Why the pairing is forced.** `coderabbit-cli` is the only source in the capability table declaring the frontline
lane at all — not merely the only one this repository configures. `delegated-agent` carries both scopes but is
`lanes: ["standard"]`. So removing `chunked` without the grant does not narrow chunked frontline review; it
removes it, with no configuration that restores it, and a chunked frontline request then resolves `unavailable` /
`stop` rather than skipping. The lane's existing `skipped` state fires only on an inactive or empty lane, so
scope-ineligibility never reaches it.

**Enabling work — the local path must become lane-aware.** The grant is not a capability-table token edit.
`delegated-agent` dispatches to `local-prepare`, which carries no lane and decides whether to run from
`projectStandardReviewObligation(...)` — the standard obligation — while the frontline lane's semantics live in
the routing decision's separate `frontlineAction` field. A frontline run routed through the local path today would
consult the wrong field. Both fields already exist on one decision object, so the work is bounded: thread the lane
through, consult the matching field, and accept a frontline obligation where requirement and admission
construction currently assume the standard one. This substrate is shared with concern 8 rather than additive to
it — any extensible registry admitting a frontline-capable local source needs the same lane-awareness.

**Named consequence — scope-ineligibility should skip, not stop.** Independent of the pairing above, a lane whose
every configured source is ineligible for the selected _scope_ currently resolves `unavailable` / `stop`, which
the integration workflow dispatches as a halt. For the obligation-bearing standard lane that is correct. For the
advisory frontline lane it should route to the lane's existing skip arm carrying the typed
`source-scope-ineligible` diagnostic — declined and legible, rather than halting integration or pretending a
review occurred.

**Named restoration condition.** This is a capability removal, not a judgment that the carrier is unfit.
`chunk-scope-binding` restores it on demonstrating three things: projection construction and transport through the
request contract, chunked latency acceptable across a full partition, and defined handling for untracked files.

**Cost accepted — evaluator diversity.** CodeRabbit is a genuinely independent evaluator whose failure modes
differ from a Claude or Codex subagent's, so narrowing chunked review to the primary's own model family carries a
mild self-review-adjacent risk. The diversity is retained at whole-target frontline, where it works today; only
per-chunk diversity is given up. Concern 8's registry work is the durable answer — a project that wants an
independent chunked evaluator should be able to supply one rather than depend on which providers ARC happens to
ship knowledge of.

**What stays this WU's work, and what does not.** Removing the unbacked advertisement is squarely this WU's thesis
— authority claims outrunning evidence — and is small. Building the partition transport is **not** this WU's:
`review-chunking` explicitly deferred automated construction and transport of chunk scopes, per-chunk scope
identities, and receipts to `chunk-scope-binding`, which is `planned` and unblocked.

### 3. The guidance surface

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

**Decision — trim to the contract floor rather than delete or regenerate.** The criterion is _keep only what a
provider cannot know_. Cut the finding requirements and five of the six rubric dimensions: instructing a
specialized code reviewer to check correctness, boundary cases, or to cite a stable locus is its product, not
information, and at `path: "**/*"` that cost is paid on every file. Cut the `Rubric:` / `sha256:` line, which has
no live consumer and is now demonstrably not a drift check. Four things survive:

1. **Exact-scope binding** — the complete requested change set, not a sample or only the latest fix; bind to the
   exact requested target.
2. **The clean-result floor** — unavailable, partial, ambiguous, or failed review is never clean.
3. **The evaluator boundary** — do not accept author conclusions.
4. **Repository contract coherence** — the one dimension that is not the provider's product. A generic reviewer
   cannot know this repository carries a two-copy package-source / project-instance sync discipline, a
   self-hosting `npx arc` invocation rule, or an adopter-facing versus internal-dev audience boundary. It survives
   by the criterion rather than as an exception to it, and it is rewritten out of dimension register into the same
   register as the other three — naming the actual contracts, since an abstract pointer to "repository-specific
   instructions" carries about as little as the dimensions being cut.

**The kept repository line stays untyped, deliberately.** It is the one survivor with no typed home: no method
declares the `review-augmentation` frontmatter that would route a project dimension into the projection, and
minting one to maintain a single line would re-instate the generator this trim deletes. `.coderabbit.yaml` and
`AGENTS.md` are this repository's own configuration rather than shipped artifacts, so repository-specific content
is exactly what belongs in a repo-local static block and exactly what should not be pressed into a shipped typed
contract.

At four items the **parity check resolves without restoring a generator**: a string-equality assertion between the
two carriers plus the typed coverage and clean-rule fields. **Its coverage is partial by construction and must be
stated as such** — string equality covers all four kept items across the two copies, while the typed fields back
only items 1 and 2; item 4 has no typed source to check against. A check that reads as total when it is not is the
defect this concern exists to remove.

Independent support for the trim arrived from `review-chunking`, which routed a field lesson to this exact seam:
guidance and code-evaluation criteria must be presented as separable, so that guidance is not applied as a spec the
code must satisfy. Dense generic guidance injected at every path is precisely that failure mode.

**Sequencing — the trim runs first.** No measurement gates it: the capability question was answered by
`review-chunking`'s prior measurement, so what remains is the single narrower observation in § Unknowns rather than
a three-arm experiment.

### 4. Request-body legibility

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
caller then invents. The second half therefore needs routing exposed as output, not better documentation of an
input. Left unaddressed, the workflow instructs an agent to invoke a verb whose request can only be fabricated, and
a fabricated routing verdict is indistinguishable in the record from a routed one: the same provenance collapse
concern 1 designs against, arriving through the CLI surface instead of the attempt history.

**Both halves stay in this WU, and the second is smaller than it reads.** Established against source: the routing
reducer and the obligation-projection builder both already exist, are exported, and are already reached from
shipped verbs — `arc review frontline resolve` runs the reducer and emits `routing.facts` and `routing.decision` in
its envelope, and `arc review local prepare` runs both the reducer and the projection builder internally. The gap
is narrower than "no producer exists": **no verb emits the obligation projection itself.** The frontline envelope
carries three of its four semantic fields — obligation, reasons, retrigger — and stops short of the rubric identity
and count, which is precisely why the CLI-surface test fabricates a digest rather than a whole projection. The
projection's remaining inputs are routing facts — content kind, review risk, change determinacy, ownership, surface
authority, assurance, activity — every one of which an agent following the workflow legitimately judges. The
standard lane is missing an emit step over functions already written and already invoked — the second pattern
again, plumbing rather than design.

Splitting the halves across work units is the one option to avoid: shipping the flag alone documents the shape of a
verdict that still has no producer, which makes confident fabrication easier than it is today.

### 5. The `adversarial-review` `withstood` field — settled shape

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

### 6. Convergence semantics and severity provenance

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
material finding buys exactly one verification pass, bounded by the same cap. **The cap bounds the effect, and at
`Light` erases it** — a cap of 1 means the loop exits at the cap after pass one whatever convergence says, so a
material finding buys nothing there and the stated defect persists unchanged. At every `Class` the last fix inside
the cap also stays unexamined, which is the final-fold residual the method already names and the post-settle
coherence re-read already answers.

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
label of the same name. Most decisively, `blocker` is overloaded — the severity enum, the work-unit impediment
field carried by over a hundred live meta files, and the gate's own merge-readiness impediments (`GateBlocker`,
`GateVerdict.blockers`, with codes like draft, merge-conflict, and CI state), which are unrelated to finding
severity. After the rename each sense is unambiguous. The review resolution state that stops is spelled `blocked`
and is untouched by a `blocker` sweep. The sweep is bounded and mechanical across the code and a handful of
methodology files, with two hazards: the meta impediment field and the gate impediment type are both different
concepts and must never be caught by a blind replace. **Sequence it first**, because the provenance work above
edits the same schema.

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

### 7. Stop discipline and spend opt-in

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

One concrete asymmetry follows, and a second candidate does not survive source:

- **There is no autonomy-guidance asymmetry.** The errand workflow states three times that a confident bounded
  call proceeds without a permission stop; the integration workflow states it twice. Two of the three are
  near-verbatim parallels — base-drift reconcile, and review applicability, where integration's own step reads "a
  confident bounded choice proceeds without asking permission and is retained for the final gate." The third
  licenses an auto-merge-lane upgrade, and integration has no auto-merge lane: every integration is reviewed by
  construction. So the count difference is a lane that does not exist there, not a missing rule. Recorded because
  the earlier reading — that integration, the long autonomous stretch, carried less of the discipline — was the
  motivating evidence for part of this concern, and it does not survive source.
- **The verification fire-point stops at every `Class`.** The adversarial fire-point scales its _posture_ by
  `Class` — recommend at `Novel`, neutral offer otherwise — but the offer awaits a call regardless. At `Light`,
  that is a permission turn to ask about a pass the posture already declines to recommend.

**Spend is opt-in for code review and ungated for adversarial review.** Both review lanes ship with empty source
lists, so an adopter incurs no automatic review spend until a source is named; the pass ceilings bind only once a
lane exists. The adversarial method has **no configuration surface at all**, across **four** standalone offer
fire-points — the three planning stages and verification. Integration is not a fifth: it declares the method in
frontmatter but carries no fire-point callout and no signature block, reaching the mechanism only as the carrier
behind the frontline and standard lanes, which the empty source lists already gate. An adopter who does not want
subagent spend can only decline, at every fire point, indefinitely — four permission turns that return nothing.

**Reopened, then re-resolved — the earlier `Class`-threshold key was on the wrong mechanism.** A key gating
`adversarial-review` contradicts the method's own identity contract, which states that **the caller owns launch
policy** and that the mechanism never weakens the caller's obligation or replaces its interlock. `adversarial-review`
is a carrier, not an activity: it runs a supplied rubric from fresh context and is explicitly "not itself a rubric."
Its own context-provisioning table already lists frontline review and standard review as fire-points alongside the
planning ones, so the lanes are among its callers. Putting spend policy on the carrier would gate unrelated
activities through one knob and constrain a mechanism built to be reused.

**Resolved: gate the activity, not the mechanism.** Each review activity carries its own evaluator key, the way the
lanes already carry source lists. `adversarial-review` gets no configuration surface at all.

```yaml
# Evaluator for planning-stage design audits (draft-design, create-spec, generate-tasks).
# Subagent carriers only: hosted and CLI providers review diffs and cannot audit a design
# document. `none` disables the audit; the stage-completion check is unaffected.
review.planning_audit: none        # none (default) | delegated-agent
review.verification_audit: none    # same domain
```

Four review activities, one uniform place to look. The value is singular where the lane keys are plural, so
"one evaluator, no fallback" reads off the shape rather than a comment — planning audits spawn a fresh subagent per
pass at the primary's own capability and never fall through to a second source.

**The domain is derived, not documented.** Valid values are the registered sources whose execution contract is the
subagent carrier — a query over the same adapter capability declarations concern 8 relocates. Naming a hosted
provider is then a validation error with a typed diagnostic rather than a runtime surprise, and the domain stays
correct as adapters change. The constraint is structural because the limitation is: at draft-design time there is no
diff and no pull request, only a document, so only a carrier that accepts arbitrary files plus a rubric can serve.
`delegated-agent` names the **carrier**, not the gate lane — the gate's local lane and a planning audit both use that
carrier under different contracts, which is the same mechanism-versus-rubric split the method already draws.

**What each knob owns after the change:** the `*_sources` and `*_audit` keys decide whether an activity runs and
which evaluator serves it; `Class` keeps only recommendation posture and pass cap, no longer doubling as an on/off
switch; and the stage-completion stop is untouched, because it is an input channel rather than a spend decision. An
adopter with `planning_audit: none` is still asked whether the stage is done — they simply are not offered a pass.
That is what removes the four permission turns that returned nothing, using the mechanism the lanes already use.

**One key per activity family, not per stage.** The adopter decision is a single posture question — spend subagent
passes attacking planning artifacts, or not — rather than three. If granularity is ever wanted the natural cut is
_early versus finalization_ (draft-design attacks an unsettled design where findings are cheapest to act on;
create-spec and generate-tasks attack progressively crystallized artifacts, and create-spec's rubric substantially
overlaps draft-design's), not per-stage. That arrives additively as a scope qualifier beside the evaluator key,
since evaluator and scope are orthogonal — so splitting later is cheaper than un-splitting.

**Disabled ships as the default for consent, not because the practice is marginal.** It matches the empty source
lists — ARC ships with no automatic spend and each project opts in — and discoverability is a documentation concern
that does not outweigh consistency with the lanes. The field experience is the opposite of marginal: adopting these
passes changed issue-catching from _during or after code review_ to _before implementation_, which is where a design
defect is cheapest to fix. Recorded explicitly because a reader meeting a disabled default could otherwise infer the
practice earns little.

**Aggregate spend is real, and deliberately so.** Pass caps bind per fire-point, not per work unit, so a `Heavy` work
unit traversing all four fire-points has a ceiling of eight passes with nothing bounding the total. `Light` loops
often converge in one, but `Heavy` and especially `Novel` routinely reach their caps — that is what the cap values
were chosen for, not a pathology. This is a cleaner statement of the gap the rejected review-budget ledger was
reaching for, and it is recorded **against** rebuilding that ledger: the spend buys design defects caught before
implementation. Anyone revisiting aggregate review cost should start from that return, not from the ceiling alone.

**Which stops survive streamlining — the signal's location decides, not the stage's name.** The surviving
verification asymmetry argues for removing a stop, and applied uniformly that argument reaches every
`adversarial-review` fire-point, including the three planning stages. It must not, and the reason is derivable
rather than a carve-out:

> **A stop is required wherever the completion signal is not fully observable in the artifact.**

- **Verification and integration triggers are artifact-observable.** The task list's phases are complete and the
  verification phase is the literal next item; the review lanes fire at a determined position in the integration
  cascade. Everything establishing "is it time" is on disk, so an agent reading the artifact holds exactly what the
  developer holds. The stop adds no information, which is what makes it ceremony — and what makes autofire correct
  once a project has opted in. Declining costs little in any case: the adversarial pass **augments** the self-verify
  and never replaces it, so the floor beneath an autofired pass is the full criteria validation that runs either
  way. The planning stages have no such floor. _(The integration half of this arm is pending re-derivation: there
  is no standalone adversarial fire-point at integration to autofire, so what the rule governs there — the lane
  carrier, or nothing — depends on the key's scope, which is open. See § Unknowns.)_
- **Planning-stage boundaries are not.** Whether a draft is done depends on intent the developer has not yet
  uttered, which no artifact carries and no readiness read can reach — `assess-draft-readiness` reads the artifact,
  not the person. Here the stop **is** the input channel rather than a permission turn, so it holds even when a
  project has opted in and the `Class` threshold is met.

This revises the verification asymmetry's remedy without withdrawing the finding: the stop to remove is the one
whose trigger is observable, not merely the one that fires at every `Class`.

**Live evidence from this WU's own grooming.** The concern that later became `integration-boundary-accuracy` existed
only in the developer's head at the moment the draft otherwise read as complete. Every artifact-based readiness
signal would have returned ready, an autofired planning pass would have run against a draft about to grow by roughly
a third, and its findings would have been obsolete on arrival.

**Shape — a convergence check, not an authorization form.** What is approved is that _the stage is complete_; the
pass firing is a consequence of that agreement rather than a second decision. So the surface is one conversational
question — this stage looks done, is there anything to raise before it is attacked — and never an enumeration of
pass counts, rubrics, and evaluator conditions. That enumerating shape is precisely the interlock-rendering defect
`integration-boundary-accuracy` owns, arriving at a different fire-point; adopting it here would trade one
over-rendered interlock for three.

**Boundary with `judgment-authority-model`.** That work unit owns the authority model: which rules yield to
demonstrated judgment, who may override, and how an override is disclosed. This concern is narrower and is exactly
this work unit's stated purpose — whether the shipped workflow carries the discipline its own spec defined. Fixing
the carriage does not settle the authority question, and settling the authority question would not have carried
the rule.

### 8. Provider capabilities belong with their adapters

**Surfaced by concern 2's capability edit; the same thesis one level up.** The source id schema is an open slug
pattern accepting any well-formed identifier, and the policy machinery is genuinely provider-neutral: lanes,
scopes, pull-request dependence, and dispatch action are abstract axes, the source lists are ordered
configuration, and the diagnostics name no provider. The hosted execution layer is already adapter-array-driven,
dispatching by adapter id against an injected set, and each adapter already carries a self-description constant
beside its implementation.

**One thing is closed, and it is the wrong one.** The capability table — lanes, scopes, pull-request dependence,
dispatch action — is a module-private constant carrying four hardcoded entries, unexported, with no registration
surface. It is the single place where a fact about someone else's product lives in core rather than beside the
adapter that implements it. Everything else in the path was already built the way it should be.

**The boundary that decides what is a leak.** `delegated-agent` is ARC's own subagent carrier, so its lanes and
scopes are ARC's business and belong in core. `coderabbit-cli`, `coderabbit-pr`, and `codex-pr` are third-party
providers; their capabilities are observations about external products and belong with their adapters. Both kinds
currently sit in the same closed constant.

**Decision — relocate, and stop there.** Move the four fields onto each adapter's existing registration constant
and have the driver read a composed capability set. This is a relocation into a pattern that already exists, not a
new extension surface. Designing how a project _supplies_ an adapter is deliberately not this WU's — it is stubbed
as `review-adapter-extensibility` (`provisional`), because adapters are necessarily code and the question carries
a real trust boundary that deserves its own treatment.

**Forward compatibility, on one condition.** The relocation is shaped so the stub's work is additive rather than a
rewrite: a validated registration contract published through the shipped schema bundle; the driver consuming an
injected capability set rather than importing a constant; one named composition seam that assembles the run's set;
the dispatch action's runtime enum exposed alongside its derived type; and `unknown-source` retained as the
fail-safe for an unregistered source.

> **The test each measure must pass: it would be right even if the stub never ships.**

All five do — schema validation is hygiene, injection improves testability, a named seam is clarity, the runtime
enum is a missing validator for a contract that is currently only compile-time, and the fail-safe already exists.
Anything that only makes sense _because_ a loader might arrive belongs to the loader. This test is recorded
because "forward compatible with a design that does not exist yet" is otherwise an invitation to speculative
scaffolding.

**A second consumer, which is why the relocation earns its keep twice.** Concern 7's audit-evaluator keys draw their
valid domain from these same declarations — the registered sources whose execution contract is the subagent carrier.
That makes "a hosted provider cannot audit a design document" a validation result rather than a comment, and it keeps
the domain correct as adapters change. Neither concern needs machinery the other does not already land.

**The dispatch action stays closed, and that is the point.** It is not a free-form verb but the tag for which
execution contract an adapter satisfies — pull-request-comment provider, local CLI carrier, or ARC's own subagent
carrier. It is already derived from the resolve envelope's own type rather than duplicated, so core cannot drift a
fourth without changing the envelope contract. A supplied adapter implements one of the three interfaces and
inherits its action; a fourth would be a framework change, not a project extension. This is what keeps workflows
from dispatching actions unknown at authoring time, and it is why the stub does not need to reopen it.

## Alternatives

- **Restore the deleted admission machinery** to re-establish carrier authority. Rejected — right-sizing removed it
  deliberately as disproportionate, and the local carrier now injects a runtime-owned rubric/guidance binding
  rather than asking an evaluator to transcribe evidence-grade identities. One proportionate parity check is the
  replacement, not a re-instatement. _(Scoped precisely: this holds on the **local** path only. The hosted
  adapters and the CodeRabbit CLI provider inject no guidance at all, which is what makes the static carriers
  load-bearing rather than redundant — see concern 3.)_
- **Infer the chunking answer from the PR #354 timeouts.** Rejected explicitly by the originating capture, and
  still correct: two timeouts on one oversized target with confounded guidance cost establish nothing about
  capability. The answer came instead from `review-chunking`'s prior controlled measurement.
- **Run a fresh three-arm A/B to settle the chunk carrier contract.** Rejected as redundant — the capability
  question it was designed to answer was already measured, and re-running it would spend costly reviews to
  reproduce a recorded result.
- **Keep `chunked` advertised for `coderabbit-cli` and build its projection transport here.** Rejected — the
  transport is `chunk-scope-binding`'s by explicit prior deferral, and absorbing it would widen a WU already
  flagged for sizing risk.
- **Document the request shapes in prose** (concern 4) where the workflows already reference the verbs. Cheaper and
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
- **Delete the guidance blocks outright** (concern 3). Rejected — they are the only channel carrying ARC's
  exact-scope and clean-result contract to a hosted reviewer, which is the half a provider genuinely cannot infer.
- **Regenerate both static copies from the typed projection** (concern 3). Rejected — that restores the generator
  right-sizing deliberately deleted, to maintain roughly four lines of content.
- **Split the adjacent surfaces (4–5) into their own work units.** Rejected: both are small once settled — concern
  5's shape resolved to three wording edits rather than a protocol, and concern 4's second half resolved to
  plumbing over functions that already exist. Concern 5 carries an independent-ship escape hatch; concern 4's two
  halves must ship together, per that concern. Distinct from the decomposition that did fire, which cut on subject
  orthogonality rather than size.
- **Answer disproportionate review spend with a durable multidimensional review-budget ledger** — logical passes,
  evaluator invocations, and token or payload budget, accumulated across a work unit's whole integration lineage
  and inherited by each new head. Proposed from a sibling work unit's integration, where four review waves and
  eighteen evaluator invocations ran without an effective bound. **Rejected as disproportionate to its own
  evidence.** Roughly three quarters of the measured raw cost came from implementation workers inheriting full
  conversation history, which is a spawn default rather than an accounting failure; and the caps that should have
  bounded the rest already exist and are already wired to an approval interlock — they went unenforced because the
  request that reaches them cannot be composed, not because they were absent or too coarse. Building an accounting
  mechanism first would elaborately measure a cost that mostly evaporates once the spawn default and the
  composability gap are fixed. The proportionate response is concern 4's derivability half, concern 6's
  convergence definition, and a bounded spawn context — none of which is new machinery.

## Unknowns and Assumptions

- **The one measurement still worth running** is narrow: whether a trimmed-guidance whole-target review still times
  out at the ~10.8k-line scale that failed on PR #354. This is a single observation after concern 3's trim, not an
  experiment, and it is no longer on any concern's critical path.
- **The parity-check shape is now settled enough to specify** — a string-equality assertion between the two static
  carriers plus the typed coverage and clean-rule fields. What remains open is only whether it lands as a unit test
  or a pre-commit contract check.
- **Resolved — the digest-drift assumption.** The published digest was recomputed independently and matches the
  typed contract exactly, so it has not drifted. The finding is that this proves nothing: the digest does not cover
  the rendered guidance prose, and did not detect the six-versus-five dimension drift that is actually present.

### Reopened by adversarial pass one — design, not detail

Five decisions returned to drafting on 2026-07-26. Each has two or more materially different builds, so the draft
is **not formalization-ready** until they settle. Three have since settled: concern 1's attempt-ordering collision
(the invariant validates against the pass's effective order), concern 2's frontline consequence (the capability
removal is paired with a `frontline` grant to `delegated-agent`, and scope-ineligibility routes to the frontline
lane's skip arm), and concern 7's spend gate (below). **Two remain — concern 4's flag-versus-bundle question and
concern 6's wholeness.** Concern 8 arrived later and is settled on entry: a relocation plus five
forward-compatibility measures, with adapter supply stubbed as `review-adapter-extensibility`.

**Concern 7's spend-gate decision reopened and re-resolved during the same session** — the `Class`-threshold key sat
on `adversarial-review`, contradicting the method's "the caller owns launch policy" contract. It is now an
activity-level evaluator key per concern 7; the earlier open question of what the `Class` key gated dissolves with
the key itself.

- **Open — schema-emitting flag versus the shipped schema bundle.** The kernel registry already generates and
  ships a JSON Schema bundle carrying `standard-review-obligation-projection` and the review envelopes; only one
  review _request_ schema is registered in it. Registering the missing request shapes and pointing the workflows
  at the bundle is a materially cheaper alternative the § Alternatives set never weighed, and it re-prices
  concern 4's accepted "widens the WU" note.
- **Open — whether concern 6 stays whole.** The two lanes order triage and the driver call oppositely: the hosted
  lane triages before feeding the driver, so a confirmed severity exists at that call; the local and frontline
  lanes are triggered _into_ triage by the driver's own findings state, so the field is necessarily absent and the
  minors-only arm cannot fire. Closing that needs either a second driver call after triage — which re-enters an
  arm that already consumed a pass — or moving triage ahead of the driver call, a workflow change the recorded
  "one field and one branch" blast radius excludes.

### Detail — closeable at spec time

- **Open — the confirmed-severity maximum's computation.** Concern 6 carries the confirmed severity on the attempt
  record the driver already receives. How that maximum is computed across a chunk series, and whether the frontline
  lane needs the same field on its own attempt path, are execution detail rather than direction.
- **Open — the producing surface's CLI shape.** Concern 4's derivability half is settled as in-scope plumbing over
  existing functions; what remains is whether it lands as a new verb or as `arc review resolve` accepting routing
  facts alongside the projection it takes today.
- **Open — whether the enforced fallback rule already has test coverage.** Concern 1 established the rule as current
  behavior at four sites by reading source. Whether existing tests prove it, or a characterization test is owed, was
  not established.
- **Open — chunked latency at partition scale.** `review-chunking` measured a materially higher per-invocation
  latency for the CodeRabbit carrier on single chunks, but never across a full partition. That measurement belongs
  to `chunk-scope-binding` as part of its restoration condition, not here.
- **Sizing — settled by the decomposition.** Concern 2 shed the partition-transport work to its rightful owner and
  became a capability removal, taking the largest unbounded item out of the WU. The two remaining oversize signals
  then left as their own work units: the ephemeral-checkout lifecycle to `review-checkout-lifecycle`, and the
  integration boundary's procedural shape to `integration-boundary-accuracy`. What remains is eight concerns sharing
  one subject — the review protocol's content — which is the coherence the cohort-fit read was testing for. Concern 8
  arrived after that read; it stubbed its own open-ended half away as `review-adapter-extensibility` rather than
  absorbing it, so the cohort-fit re-read weighs a bounded relocation, not a new extension surface.
- **Resolved — `ci-defer-heavy` placement.** Settled to a repository-local review-event workflow and shipped as
  errand `ci-defer-heavy-automation` (below).

## Composition / Coordination

- **`judgment-authority-model` — coordination, not a hard dependency.** Four judgment-layer concerns from the
  originating capture are _informed by_ that WU's model rather than blocked on it: the post-fix
  review-applicability rule being too coarse (it bound an agent to a second complete hosted pass over 10,904 lines
  after a two-line reviewer-identified fix); the missing proposal-time `Post-fix review: carry-forward | targeted |
  focused | complete` field; the two-stop author-response cycle where one approval should carry disposition +
  bounded fix + verification + persistence + post-fix plan; and the determinism-versus-judgment posture that ARC
  should make judgment auditable rather than bind it to a predictably disproportionate operation because a broad
  category matched. **Hold these in a later phase** so concerns 1–4 — the hosted-protocol core plus the CLI
  surface — are not gated on a `Novel` upstream. No `Depends On` edge is recorded.
    - **Its authority-legibility face reproduced during this WU's own errand.** `run-errand`'s reviewed-lane
      instructs the agent to
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
- **`review-adapter-extensibility` — stubbed out of this WU, no edge.** Concern 8 relocates provider capabilities
  onto their adapters and stops there; how a project _supplies_ an adapter — the loading mechanism, the trust
  boundary around loading project code into the evidence-producing path, and registration-contract versioning —
  is that stub's (`provisional`). This WU is complete without it and delivers most of the value alone: after the
  relocation a project can already correct a provider fact ARC got wrong by editing the adapter beside it. The
  stub's draft records the substrate this WU leaves it; if concern 8 ships differently, that record is what needs
  re-reading, not re-deriving.
- **`chunk-scope-binding` — now load-bearing, still no hard edge.** It owns the partition transport this WU
  declines, and it owns the restoration condition for `coderabbit-cli`'s chunked capability. It is `planned` with
  `Depends On: review-chunking — landed`, so it is unblocked. This WU should leave it a clean handoff on the removed
  capability — why it was removed and the three things restoring it requires. The worktree registration-isolation
  pattern it should also adopt now lives with `review-checkout-lifecycle`.
- **`review-checkout-lifecycle` — extracted sibling, no edge.** It owns the ephemeral review checkout's diagnostics
  preservation and registration isolation. Nothing here depends on it and it depends on nothing here; the two touch
  different files.
- **`integration-boundary-accuracy` — extracted sibling, one coordination seam.** It owns the integration boundary's
  procedural surfaces — the interlock extraction, the lifecycle verb rename, and the transition fire point. Concern 7
  edits `integrate-work-unit.md` at the review-applicability step while that work unit rewrites the final merge step.
  Different regions, so neither blocks the other — but if both run concurrently, sequence the edits rather than
  merging them blind.
- **`review-chunking` — the evidence source, shipped.** Its `analysis-review-chunking.md` carries the three carrier
  shadows, the exact scopes, and the latency and untracked-file caveats. Read it rather than re-deriving the
  carrier question. Its advisory packet is SHA-bound and is not review coverage for anything.
- **`unit-scoped-review`** — relocates the approval gate to the WU boundary, which changes what the
  author-response cycle above is collapsing. Coordinate framing; do not pre-empt.

### Carried input — `ci-defer-heavy` automation (shipped as an errand)

Raised during this WU's grooming, settled in the same session, and **shipped** as errand `ci-defer-heavy-automation`
(PR #361). **Never this WU's work and never a stub** — the mechanism below is one small repository-local workflow
file with no design left to derive, which is errand-shaped. The evaluation is retained because it records why the
mechanism took the shape it did, not because anything here is still pending.

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

Medium-to-large, after the decomposition. Concern 2 collapsed from an experiment-gated open design to a capability
removal plus a handoff note, and concern 3's shape settled rather than staying deferred behind that experiment.

The bulk of what remains is the concern 6 severity rename — mechanical but wide, touching the review-gate source and
a handful of method files — plus the operator override on the policy driver, which is real code following an
existing shape. Concerns 3 and 5 are small once specified; concern 2 is no longer among them — its capability pairing
carries the local path's lane-awareness work. Concern 8 is a bounded relocation into an existing pattern, with the
open-ended half stubbed away. Across the eight, the work spans configuration, policy contracts, adapter execution,
CLI surface, method prose, and workflow prose. Nothing carries an unrun measurement on its critical path.

## Continuity

- **State:** **not formalization-ready** — returned to drafting by adversarial pass one on 2026-07-26. The scope,
  the framing, and concerns 3 and 5 hold; five decisions across concerns 1, 2, 4, 6, and 7 reopened as design
  rather than detail, two of them at blocker weight where the recorded design collided with shipped driver
  behavior. Both blockers and concern 7's spend gate have since settled; **two reopened decisions remain** —
  concern 4's flag-versus-bundle question and concern 6's wholeness. Concern 8 was added after — provider
  capabilities relocating onto their adapters, surfaced by concern 2's capability edit and settled on entry, with
  adapter supply stubbed as `review-adapter-extensibility` (`provisional`) rather than designed here.
  See § Unknowns → Reopened by adversarial pass one. The eight concerns still share one subject: the
  review protocol's content, under two patterns — authority claims outrunning evidence, and correct rules
  unreachable at the decision point.
- **Resolved:** the problem framing and its two patterns — authority claims outrunning evidence, and correct rules
  unreachable at the decision point; the eight-concern
  scope; concern 1's corrected diagnosis (the typed fallback rule is already enforced; the driver was never
  consulted), the non-enforceability of driver-only selection, the operator override modelled on the existing
  ceiling override, the provenance separation that prevents laundering, its three sub-decisions — no pass
  consumption, one-pass target-and-lane binding, unfloored skip — and the effective-order resolution of the
  attempt-ordering collision, with the override riding the whole fallback chain; concern 2's carrier question,
  answered as ARC-side curated orchestration and re-cut to a capability removal **paired with a `frontline` grant
  to `delegated-agent`**, with a named restoration condition, an accepted evaluator-diversity cost, the
  lane-awareness work the grant requires, and scope-ineligibility routed to the frontline lane's skip arm rather
  than a stop; concern 3's trim-to-contract-floor decision, its four-item keep list retaining the
  repository-contract line untyped, the parity check's partial-by-construction coverage, its three drift findings,
  and the trim-first sequencing; concern 4 resolved to a schema-emitting flag, split into its discoverability and
  derivability halves, with both halves kept in this WU and the derivability half established as plumbing over
  functions that already exist; concern 5 resolved to three
  wording edits with its rejected shapes recorded; concern 6's separation of the exit gate from the convergence
  signal, convergence measured on what a pass surfaced, severity provenance anchored to triage rather than the
  provider label, one shared definition across both loops, the recommend-but-never-proceed boundary for judgment
  at the cap, and the `blocker` → `critical` rename sequenced first; concern 7's finding that the stop discipline
  is correct but archived, the spend gate re-resolved from a `Class` threshold on the mechanism to activity-level
  evaluator keys with a subagent-carrier-derived domain (disabled by default for consent, not marginal value), the
  knob-ownership split, one key per activity family rather than per stage, the aggregate-cap observation recorded
  against rebuilding the review-budget ledger, the autonomy-asymmetry finding withdrawn as unsupported, and the
  observable-signal rule that decides which stops survive streamlining — planning-stage passes always converge with
  the developer first, with the rule's integration arm pending re-derivation; the
  review-budget ledger rejected with its reasoning; coordination-not-dependency with `judgment-authority-model`;
  the handoff contract with `chunk-scope-binding`; the spawn-context guard routed to
  `execution-delegation-doctrine`; the `ci-defer-heavy` mechanism, shipped as an errand; the extraction of the
  ephemeral-checkout lifecycle to `review-checkout-lifecycle` and the integration boundary's procedural shape to
  `integration-boundary-accuracy`; concern 8's relocation of provider capabilities onto their adapters, its five
  forward-compatibility measures and the would-be-right-anyway test that bounds them, the dispatch action staying
  closed by construction, and the stubbing of adapter supply as `review-adapter-extensibility`; `Class: Heavy`.
- **Open — design (gates formalization):** two of the five decisions reopened by adversarial pass one — concern 4's
  schema-emitting flag versus the shipped bundle, and whether concern 6 stays whole given the cross-lane triage
  ordering. Both are enumerated in § Unknowns → Reopened by adversarial pass one. The other three settled in
  session: concern 1's attempt ordering, concern 2's frontline pairing, and concern 7's spend gate.
- **Open — detail (closeable at spec time):** how a confirmed severity maximum is computed across a chunk series,
  and whether the frontline lane needs the same attempt field; the emit surface for concern 4's obligation
  projection — a new verb, an addition to the frontline envelope that already carries the decision, or routing
  facts accepted by `arc review resolve`; whether existing test coverage already proves the enforced fallback
  rule, or a test is owed; the single trimmed-guidance timeout observation; and whether the parity check lands as
  a unit test or a pre-commit contract check.
- **Next:** settle the two remaining reopened decisions — concern 4's flag-versus-bundle question and concern 6's
  wholeness — then re-run `assess-draft-readiness`. Re-run `assess-cohort-fit` and `classify-work-unit` as well:
  both were executed against the seven-concern post-decomposition scope, and concern 8 arrived after, weighed
  against the two work units this WU has already spawned plus the `review-adapter-extensibility` stub. The
  post-extraction coherence re-read has been performed end-to-end and its findings folded. Adversarial pass one is
  spent; one pass remains under the `Heavy` cap, and it belongs after the two decisions settle, not before.

---
