# Draft: review-signal-convergence

- **Origin:** [internal]
- **Cohort:** `review-protocol-alignment`
- **Purpose:** Make review coverage claims, severity vocabulary, and pass convergence derive from validated evidence
  rather than labels or caller assertions.

---

## Advisory Coverage Semantics

The defect is in consumption, not production. Demonstrated 2026-07-24: three false claims rode through two independent
fresh-context passes under `withstood` and were relayed on the strength of that label, then refuted in full against
source. The reviewer reported honestly — each cited fact was true while each inference drawn from it was false. What
went wrong is that the primary read _"no findings here"_ as _"this is cleared."_ Nothing licensed that reading, and
nothing forbade it, because **the field's meaning is stated nowhere**: the schema gives it one freeform line while
`findings` carries five structured sub-fields, the prompt template never mentions it, and it participates in no
severity, disposition, or convergence machinery.

The field is kept. Absence of findings is ambiguous three ways — examined and held up, not examined, or examined the
wrong thing — and only the reviewer can collapse that ambiguity. It is also structurally un-fakeable in the way that
matters: over-claiming coverage buys the reviewer nothing, unlike findings. And adversarial review deliberately leaves
the reviewer's attention unconstrained so it finds what the primary did not think to ask about, so coverage cannot be
specified up front and must be reported back. `withstood` is the return channel for the unwritten part of the
assignment.

Three edits to `adversarial-review.md` and its prompt template — no new mechanism:

1. **State the semantic.** Attention reported, not correctness asserted — "I examined this and have nothing to report,"
   never "there is nothing wrong here." Advisory signal, never authority.
2. **Bound it to decision-relevant coverage.** Report where absence-of-finding is itself informative; exhaustive
   enumeration of every region touched reads as diligence while conveying nothing.
3. **One primary-side line on the risk gradient.** Entries asserting **externally verifiable** facts (a claim about
   code, behavior, or a diff) are worth spot-checking before relaying; entries of internal judgment about the artifact
   are unverifiable in principle and need no check. The gradient runs by claim type, not by fire-point — which means
   `verify-work-unit` carries more risk than the planning stages, since its passes re-validate success criteria against
   a diff.

## Convergence and Severity Provenance

**D6.1 — Rename `blocker` → `critical`.** `ReviewSeveritySchema` (`src/scripts/review-gate/core/review-primitives.ts`)
becomes `["critical", "major", "minor"]`.

**The justification is vocabulary correctness, and that is sufficient on its own.** The enum is a magnitude scale —
`critical > major > minor` orders by how material a finding is. `blocker` names an _outcome_ instead, so it is the
wrong kind of word for the slot, and the scale reads in two registers at once. Compounding it, `blocker` carries four
distinct senses across this corpus: this severity, the work-unit impediment field, the gate's merge-readiness
impediments, and a spec-template "settle-before-starting" sense.

That is a direct violation of `strategy-procedure-evolution.md` Principle 7 — a term doing technical work is defined
once and used exactly, and never locally drifted. Correcting a controlled vocabulary is its own warrant; it does not
need an efficacy trace to a separate goal, which is why § Goals now names it. The rename belongs to this work unit
because `D6.3` edits the same schema and `D6` owns the severity model — splitting it would mean two passes over
`review-primitives.ts` and a rename coordinated across a live branch.

**The sweep is sense-discriminating, not a replace.** The code half is bounded by the type checker: the work-unit
impediment field (`src/lib/active/meta-schema.ts`, `meta-reader.ts`, `src/lib/work-unit/lifecycle-transitions.ts`,
`lifecycle-executor.ts`) and the gate's merge-readiness impediments (`GateBlocker`, `GateVerdict.blockers`) are
separate types, so a rename of `ReviewSeveritySchema` cannot silently reach them.

The prose half has no type checker and is where the real risk sits, so the non-severity occurrences are enumerated
rather than characterized. **Every one of these means something other than review severity and must survive
untouched:**

- **Workflows** — `session-init.md`, `session-init.contributor.md`, `session-handoff.md`, `generate-tasks.md`,
  `drain-inbox.md` (the work-unit impediment sense).
- **Reference** — `AGENT-BRIEF.ARC.md`, `strategy-session-operations.md`.
- **Templates** — `template-spec-detailed-rfc.md`, `template-spec-outline.md` (a fourth sense: a
  "settle-before-starting" blocker).
- **Adopter-facing `docs/`** — `getting-started.md`, `the-framework.md`, `work-planning.md`,
  `reference/work-organization.md`. This surface is outside the two-copy preamble's reach and outside anything the
  package-sync test sees, so it is the likeliest omission.

**Two files carry both senses and cannot be swept per-file** — `task-audit.md` (generic at one locus, the severity
enum at three) and `review-response.md` (generic at one, severity at another). These require per-occurrence
discrimination, and the verification method is a post-sweep grep asserting the enumerated loci above are unchanged.

The review resolution state spelled `blocked` is a distinct token and is untouched. **Sequence this first**, because
`D6.3` edits the same schema.

**Version treatment is a pre-public-release baseline rewrite.** This project has no public release, external users, or
retained production records to migrate. The rename therefore changes the active strict-current contract in place:
registered versions, wire `schemaVersion` fields, semantics versions, and canonical-digest domains do not advance; no
`blocker` compatibility alias or migration reader is added. Existing development-only review records containing the
old token are disposable and are cleared or regenerated.

The sweep still follows the complete acceptance graph rather than the four most obvious durable records. It covers
every registered root that reaches `ReviewSeveritySchema`, the hosted-await finding schema's independent severity
enum, fixtures, generated schema artifacts, adapters, and methodology prose. Tests prove `critical` is accepted,
severity-position `blocker` is rejected, and the non-severity senses enumerated above remain unchanged.

**D6.2 — Separate the exit gate from convergence.** `adversarial-review.md` § Exit gate currently collapses two rules
into one sentence, and because disposition empties the backlog, fixing everything converges immediately — so the change
most likely to introduce a defect, a fix to a material finding, is the one a fresh pass never examines. State them
separately; both must hold:

- **Exit gate — completeness.** No confirmed finding above `minor` may remain undisposed when the loop closes. A
  property of the disposition backlog.
- **Convergence — signal.** A pass converges when it surfaced no triage-confirmed finding above `minor`. A property of
  what the pass _produced_, independent of what was then done about it.

They disagree productively: a fixed material finding satisfies the gate while withholding convergence, and an undisposed
minor converges while holding the gate open.

**The cap-exit path is not a third rule.** Reaching the pass cap with live material findings stops the loop and surfaces
them at the stage interlock. That is an **exit the gate admits**, not a disposition — `disposition` is a closed
three-value vocabulary (fix, carry forward, drop) that the method holds orthogonal to severity, and surfacing is none of
the three. The method is explicit that capped findings remain unresolved; the gate governs loop closure, and a capped
exit closes the loop with the findings live and handed to the user. Stating this matters because the two rules are now
written separately, and a reader applying both to a capped exit would otherwise find them in conflict. Cost tracks
risk — a clean artifact still converges in one pass, while a material finding buys exactly one verification pass,
bounded by the same cap. **The cap bounds the effect and at `Light`
erases it** (a cap of 1 exits after pass one whatever convergence says); at every `Class` the last fix inside the cap
also stays unexamined, which is the final-fold residual the method already names and the post-settle coherence re-read
already answers. One definition governs both the adversarial-review loop and the review gate's lanes.

**Judgment admitted at exactly one point.** The default is deterministic — did the last pass surface a triage-confirmed
finding above `minor`? Layered on top, the agent may judge that a `minor` carries strong enough signal to warrant
another look and **recommends** it, citing the signal. At the cap with live material findings, the agent states whether
the evidence warrants continuing rather than stopping silently. **The agent may recommend past the cap; it may never
proceed past it.**

**D6.3 — Route verified severity to the driver.** Every hosted finding already carries two severities: the adapter
normalizes the provider's label into `NormalizedReviewFindingSchema`, and the primary's verified severity is recorded
separately on `DispositionReportItemSchema` alongside `sourceVerification` and mandatory `verificationRefs`, with a
refinement forcing rejection of anything source does not support. Both are already typed. What is missing is that **the
driver cannot see it**: `ReviewAttemptSchema` records a source and an outcome with no severity, so continue-or-stop is
decided against "findings happened."

The external command does **not** accept a caller-computed severity scalar. That value is duplicated,
control-bearing derived state: a stale, mistyped, or provider-sourced value is schema-valid but can falsely converge
after a material finding or buy an unnecessary pass after a minor one. The caller is not treated as hostile; the
boundary simply refuses to make it restate a fact already present in a stronger typed record.

`ReviewAttemptSchema` instead gains conditionally required, ordered-unique `reviewOperationIds`. A findings-bearing
attempt echoes a non-empty list of the exact operation ids returned by the producing review verbs; other outcomes omit
the field. The command boundary loads those operations' durable `ApprovedDispositionRecordSchema` records through
`ApprovedDispositionRecordStore`. The caller names observed operations but neither supplies their approved records nor
restates any derived severity.

The approved set inside that record is necessary but not sufficient on its own. It binds target, policy, rubric, and
approval, but not the review result it dispositions; a same-target set from another pass or an incomplete subset could
otherwise drive false convergence. Reuse the existing record layer rather than minting a parallel proof:

- Local and frontline records retain `respond-command.ts`'s exact comparison against their durable receipt or outcome
  before append.
- `ApprovedDispositionSourceSchema` gains a hosted variant. The hosted await path derives a canonical
  `hostedResultId` over the exact request handle and complete normalized finding result; hosted triage compares the
  approved set one-for-one with that result before appending an approved disposition record whose `operationId` is the
  result id and whose source carries the hosted result binding.
- Every lane therefore hands the driver the same source-bound record type. No new approval vocabulary or detached
  finding-summary record is introduced.

When present, the command boundary derives the current v2 target id from repository state rather than asking the caller
for a digest, loads every named disposition record plus its producing durable receipt, outcome, or hosted-result
binding, and requires:

- every operation id to resolve to exactly one durable approved disposition record;
- every record's `operationId` and source reference to resolve back to that same producing result;
- every producing result to be a findings result for the attempt's source and current exact target;
- the producing boundary's exact-source comparison to cover every finding in that result; and
- the records combined for one logical pass to agree on policy and rubric identity.

For a referenced attempt, `outcome: "findings"` is therefore checked against durable result state rather than trusted
as an independent caller assertion. A disposition record cannot be detached from its own producing result or attached
to an attempt whose declared source, target, or outcome disagrees with that result.

It then derives:

```text
confirmedFindingCount
maxConfirmedSeverity: ReviewSeverity | null
```

The policy reducer receives that normalized summary internally; neither field is accepted from external JSON. The
confirmed subset is the items with `sourceVerification: "verified"` whose disposition is not `reject`, and the maximum
is computed only across that subset.

The qualifier is not pedantry. `DispositionReportItemSchema` carries a mandatory `severity` on **every** item
regardless of verification outcome, and its refinement forces `disposition: "reject"` when source does not support a
finding without zeroing that severity. A maximum over the whole set would therefore report `major` for a pass whose
findings were all refuted at triage, forcing another pass for a pass that confirmed nothing — the exact inversion of
`D6.2`'s rule and of this unit's stated saving.

**All-refuted is an explicit case, not a default.** Referencing a source-bound record whose non-empty approved set has
an empty confirmed subset derives `confirmedFindingCount: 0` and `maxConfirmedSeverity: null`, which resolves
`pass-complete`. The non-empty operation binding distinguishes a pass where triage positively established that nothing
survived from an invalid unbound findings assertion, without overloading `minor` to mean "none."

For a chunked scope the summary spans the whole series, since the series is one logical pass. The terminal resolve call
— the one whose last attempt has `chunkSeriesComplete: true` — carries the review operation ids for every chunk in the
series. **Intermediate chunk calls carry the current chunk's operation id, not the accumulated series**, because they
resolve `chunk-pending` and never make a convergence decision; the current binding still proves the findings assertion
and feeds the response rule in `D6.4`. The distinction is mechanical from the attempt's series flag rather than caller
intent. The derived summary is lane-agnostic — under `D6.4` every lane references its durable approved records when a
findings-bearing pass closes.

`resolveReviewPolicy`'s findings arm consults the derived summary: when `lastAttempt.outcome === "findings"` and
`maxConfirmedSeverity` is `null` or `minor`, resolve `pass-complete` / `none` instead of `findings` / `respond`. Today
any finding forces another pass; afterwards an all-refuted or minors-only pass converges. A confirmed `major` or
`critical` finding withholds convergence and buys the bounded verification pass.

Keying convergence off the provider's label would put control flow under an unaudited external opinion; accepting a
detached caller scalar would discard the exact-target and approval bindings the disposition records already provide;
keying it off nothing at all is what happens today.

**D6.4 — Uniform lane order: triage and source-bind, then the driver call, then response.** The lanes currently order
triage and the driver call oppositely. In `integrate-work-unit.md`, the hosted findings arm settles _before_ feeding a
`findings` attempt to the driver, while the Step 3 lane dispatch (`findings / respond`) feeds the attempt first and is
dispatched into triage by the driver's own state. As currently ordered the new disposition input delivers nothing on
either lane: where approved dispositions exist (hosted), the response cycle has already run by the time the driver sees
the attempt; where the saving would land (frontline and local), triage has not yet produced the source-bound record.
The behavior and the data sit on opposite lanes.

The seam that fixes it already exists: `review-triage` and `review-response` are separate methods with a stated
handoff. Triage verifies each finding against source, classifies severity, and obtains approval _before any
finding-driven mutation_. Its terminal binding step validates the complete approved set against the durable or hosted
result and appends the approved disposition record from `D6.3`; this is evidence persistence, not performance of the
disposition. The driver consumes that record, then response performs the approved set.

For local and frontline lanes, refactor the exact-source validation and record append currently nested in
`respond-command.ts` into that pre-driver binding step while retaining its existing schemas and store. Record
preparation may project the response far enough to derive any `fixAuthorization`; the authorization is stored on the
prepared record, while the workflow holds the projected next action and performs it only after the driver result. The
hosted lane adds the equivalent record preparation between triage and thread settlement. No lane fabricates a record
from the approved set alone.

The reorder edits `integrate-work-unit.md`'s Step 3 lane dispatch and its Step 4 hosted findings arm, and settles two
things the reorder itself creates. The hosted lane moves too: settlement is response, so it follows the driver call
rather than preceding it.

**What triggers triage, once the driver no longer does.** Today the driver's `findings` / `respond` state is the only
signal that findings exist on the frontline and local lanes — moving triage ahead of the driver call removes that
trigger. The producing verb becomes the trigger instead: a non-empty finding set returned by `arc review frontline
run -`, `arc review local attest -`, or `arc review reduce -` enters triage directly. The workflow dispatch states
this, because nothing else would.

**What `respond` means afterwards.** `nextAction: "respond"` currently means "triage then respond." After the reorder,
triage and source binding have already run, so it means response-only. That is a semantic narrowing of a typed envelope
state rather than a prose change, and the dispatch line says so explicitly.

**What happens to approved dispositions on every arm reachable after triage.** Moving triage ahead of the driver means
an approved disposition set can be outstanding when _any_ driver state returns, so the rule is stated over the arms
rather than for the one that motivated it: **no arm completes or suspends a lane while an approved disposition set is
unperformed.** The four reachable arms, each enumerated because asserting "the rest are fine" is the failure this spec
has already made:

- `findings / respond` — response runs, as before; `respond` now means response-only per above.
- `pass-complete / none` — the case `D6.3` creates. The Step 3 dispatch currently maps it to "the lane is complete at
  this boundary," which would discard the approved set, including `fix` dispositions on minor findings. The dispatch
  distinguishes `pass-complete` with an outstanding set (run response, then complete) from `pass-complete` with none
  (complete directly).
- `chunk-pending / continue-chunks` — **live for the standard lane's chunked scope**, which survives `D2.1` because
  `delegated-agent` carries both scopes and this repository configures it. The dispatch currently continues the series
  with no response step, so each chunk's approved dispositions would accumulate unperformed. Response runs per chunk
  before the series continues.
- `approval-required / obtain-ceiling-override` — rarer, and it suspends rather than completes; the outstanding set is
  performed before the ceiling question is put to the user, so approval is never sought over unapplied work.

Convergence, suspension, and ceiling exhaustion all end the _review_ loop; none of them discards approved work.

Every findings-bearing pass-closing driver call then derives its confirmed-finding summary from the approved records,
one convergence semantic is mechanically enforced rather than agentically honored on two lanes out of three, and the
all-refuted and minors-only arms deliver their saving everywhere instead of nowhere.

---
