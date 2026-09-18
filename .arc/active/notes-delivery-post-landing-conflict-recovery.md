# Notes: delivery-post-landing-conflict-recovery

- [Settle-time dependency sweep](#settle-time-dependency-sweep)
- [Warrants and their anchors](#warrants-and-their-anchors)
- [Inherited corrections and provenance](#inherited-corrections-and-provenance)
- [Recorded exclusions](#recorded-exclusions)
- [Propagation surfaces](#propagation-surfaces)
- [Reader inventory — the full sweep](#reader-inventory--the-full-sweep)
- [Pinned probes — the eight holds](#pinned-probes--the-eight-holds)
- [The overlap and relation vocabulary](#the-overlap-and-relation-vocabulary--inputs-for-its-re-authoring)

---

## Settle-time dependency sweep

Run this on every edit to the spec or to these notes, before the edit is committed. It is a standing procedure
rather than a one-time check, and it lives here because the artifact that used to hold it is retired.

When a settlement retracts or replaces a named object — a variant, a result arm, a type, a reason code, a
function — grep both artifacts for that name and re-read every hit before committing:

```sh
grep -n '<name>' .arc/active/spec-delivery-post-landing-conflict-recovery.md \
  .arc/active/notes-delivery-post-landing-conflict-recovery.md
```

The failure it catches is narrow and recurring: a correction applied to the sentence that stated an error, while
the passages that depend on it keep the retracted reading. Prose review does not find those; the grep does.

Two habits close the same gap from the other side:

- **Never restate a derived count in prose.** An aggregate goes stale the moment the underlying set changes.
  Prefer a per-item statement or a table. Where a count is load-bearing anyway, re-derive it from source rather
  than carrying it forward — every sweep below carries its command for exactly that reason.
- **Re-derive an inherited claim before restating it in a surviving artifact.** A measurement copied from one
  document into another is unverified until its command has been re-run against the current tree.

---

## Warrants and their anchors

### The relation is extraction, not invention

Four sites already read both directions and derive the relation by hand, each under its own return type and
vocabulary, and none names the thing it computes:

| Site                              | Derives it to…                                    |
| --------------------------------- | ------------------------------------------------- |
| `scripts/base/merge.ts`           | decide whether a base merge is needed             |
| `lib/git/in-flight-derivation.ts` | order two candidates                              |
| `commands/user/push-fetch.ts`     | choose fast-forward versus refusal on a notes ref |
| `commands/user/sync-status.ts`    | classify a local ref against its fetched remote   |

Four independent derivations of one relation is the repetition the design ends. **None of them is converted by
this work unit** — they are the warrant for extraction, not the conversion set.

### The `unknown` variant's warrant

A non-test sweep returns nineteen `--is-ancestor` invocation sites across eighteen files, each behind its own
helper, no two agreeing on a return shape. Re-derive with:

```sh
grep -rn 'is-ancestor' packages/arc-framework/src --include=*.ts | grep -v __tests__
```

The command returns twenty lines for nineteen sites — `branch-bounded-notes-export.ts` contributes both an
invocation and its error-reporting args, the same double-count the merge-base inventory below carries.

**Re-measured 2026-09-16; the draft's figure was wrong and is corrected here.** The draft recorded "exactly one
of the nineteen names a third value", which source contradicts. The actual split: **seven** name a third value
(`git-decomposition-object-readers.ts` `"unresolvable"`; `chain-containment.ts` `"unavailable"`;
`git-contribution-proof.ts` `null`; `git-decompose-transition-base-advancement.ts` `boolean | null`;
`abandon-runtime.ts` and `identity-transitions.ts` an error kind; `status-composition.ts` an unavailable
movement), **four** rethrow rather than collapsing, and **eight** collapse an operational failure into "not an
ancestor". Three of the seven are files this design itself cites, so a reader re-deriving would have found the
old figure false.

The conclusion stands on the eight that collapse — enough repetition to warrant a named variant — not on the
retracted figure. That collapse, and not a general tidiness argument, is why `unknown` is a variant rather than a
flag.

### Why applicability alone carries cardinality

Cardinality above one rides as a field on `diverged` and reaches exactly one decision. The reason is structural:
applicability alone consumes the _relation_, where every other reader consumes a _coordinate_. No consumer can take
a base set — reading tree entries needs one ref and rematerialization needs one predecessor — so the coordinate
readers refuse on cardinality rather than carrying it, and there is nowhere else for the field to go.

### Project rules the design leans on

Both are binding project rules, not this design's inventions:

- `DEV-RULES.PROJECT` § Engineering Standards, pre-public-release compatibility posture — settles the cost of
  D3's request-contract rename and D6/D7's contract additions.
- `DEV-RULES.PROJECT` § Engineering Standards, "Recovery-complete refusals" — requires a refusal to distinguish
  terminal failure from a recoverable stop and to report the observed condition. This is what makes D13's
  fourteen per-term reasons proportionate rather than self-justifying.

### The terminal member's gate

`deriveNativeDeliveryRegisteredRemainder` slices the terminal member off the per-head readiness gate, which is why
reading for a delivery-side marker on it finds nothing. `rebindDeliveryTerminalCoordinates` is the rebind verb D8
refers to; its one production call site sits inside `arc delivery reconcile`, so it never runs on a native
landing. Not to be confused with the CLI verb `arc delivery authoring rebind`, which is a different surface.

---

## Inherited corrections and provenance

### What the originating field record got wrong

Recorded so an implementer starting from the origin captures does not inherit these readings:

- **"Three of the four loci are one ambiguity at three verbs."** Four verbs. The fourth is whole-WU verification,
  and it is the one that does not refuse.
- **The fresh-root demand was attributed to the `attest` fallback.** The fallback behaves correctly on the subject
  it is given; the arbitrary ancestor choice upstream is what makes that subject wrong.
- **The post-land capture reads the replay itself as the defect.** The replay's refusal is correct. The narrower
  true defects are the guidance text and the absence of any completing input.
- **The captures frame the terminal loci as needing a recovery route to be invented.** The rebind verb exists, is
  covered, and works. The gap is that the readers refuse without offering it.
- **The posture said "live and currently blocking."** The originating instance was retired operationally before
  this design was authored.

### Refusal strings quoted here are pre-Errand

Determinate diagnostic and argv corrections are in flight across the integration checkpoint, its advisory
register, the drift continuation, and teardown. Every refusal string this design quotes predates them. Design and
implement against the decision each verb reaches, not against its current prose, and re-read the live string
before pinning an assertion to it.

### Provenance

The axis derivation and the failure table each observation traces to live in
`notes-concurrent-integration-characterization.md` — its second matrix and second-matrix probe rows. Read those
rather than its first matrix, whose verdicts cover base movement only and are not coverage of this surface.

### Surfaces this change is expected to touch

Sizing pointer, not a work list — the propagation tables below carry the exact call sites. Native landing and
suffix reconciliation, the delivery execution request and result schemas, contribution and terminal absorption
composition, base overlap and drift analysis, Candidate applicability, integration checkpoint composition, the
exact-base merge continuation, the stack-delivery workflow, and the focused unit, integration, and delivery
terminal integration tests.

---

## Recorded exclusions

Scope decisions this work unit made deliberately. Each is a thing a later reader will otherwise re-propose.

- **`observeTarget`** (`lib/session-init/delivery-position-facts.ts`) derives the relation partially and loses
  `rewound` doing it: it answers `"exact" | "append-only" | null`, so a rewound target, a diverged target, and an
  object Git could not read are one value. It is not a competitor — it wants the relation underneath it and keeps
  its own refinement above — but **this work unit does not convert it**, so its own `"exact"` spelling survives
  alongside the migrated vocabulary.
- **`terminalAuthoringMovement`'s own reads** are not converted. Conversion would add only a reason for a refusal
  that is routed out rather than owed here. It is an admission option, a lease-proof fact, and a durable operation
  field — three things under one name, none of them a movement classification — and the relation sits beneath it.
- **Five silent base picks** outside this work unit's concerns: `identity-transaction.ts`, `from-branch.ts`,
  `github-refresh.ts` (one of its two), `committed-progress.ts`, `hosted-reservation-discharge.ts`.
- **Two decomposition call sites** reached the read-all-then-refuse shape independently under a third spelling of
  the reason code, with no observed failure behind either.
- **An unresolvable ancestry read is not a fifteenth terminal condition.** The forward-only read classifies both
  `not-ancestor` and `unresolvable` as `unknown`, so a merged head that genuinely does not descend from the bound
  one and a merged head whose objects are simply not fetched locally both report `terminal-head-moved` and both
  draw the rebind act — where the second clears by fetching and rerunning instead. Fourteen conditions is the
  design's own sizing and review readiness collapses the same pair under `delivery-member-stale`, so the two
  readers agree rather than one lagging; splitting the pair is a forward amendment, not a gap left behind here.

    _Corrected in 7.R (A5):_ the agreement argument no longer holds, and the exclusion is narrower than it
    reads. Readiness did not merely collapse the pair — it stated the collapse as a finding, asserting that the
    head under review does not descend from the binding on the strength of a read that established nothing.
    That is a claim, not a granularity choice, so A5 splits it there: `delivery-member-relation-unavailable`
    carries the unread direction and names the fetch that clears it. Closeout's fourteen conditions stand
    unchanged, which is what this exclusion is actually about; the two readers now differ, and closing that gap
    remains the forward amendment recorded here — now carried live as the `USER-INBOX` § Errand entry
    "Split the unresolvable ancestry read out of closeout's `terminal-head-moved`", rather than only by this
    bullet, since nothing sweeps a recorded exclusion out of an archived work unit.
- **`git-contribution-proof.ts` and `git-review-contribution-applicability.ts`** are allocated but not converted,
  on the absence of a traced defect. Both already return typed reasons, but that alone does not separate them from
  the converted set: `git-review-contribution-applicability.ts` is the same code shape line for line as
  `git-candidate-applicability.ts`, which the relation's set does convert.

---

## Propagation surfaces

Two independent propagations follow from the shared base resolver. The spec records the decisions; this is the
enumeration a task plan sizes against. Re-derive rather than trusting these lists if the tree has moved.

### `collectGitCandidateTarget` — widened result

Eleven call sites across seven consuming files:

| File                                | Sites            |
| ----------------------------------- | ---------------- |
| `git-candidate-effective-target.ts` | 97, 106          |
| `public-review-continuation-git.ts` | 49, 57           |
| `delivery-execution.ts`             | 3839, 5709, 5729 |
| `candidate.ts`                      | 148              |
| `lifecycle.ts`                      | 2778             |
| `checkpoint-composition.ts`         | 714              |
| `respond-composition.ts`            | 262              |

**Two are injected dependency lambdas rather than direct calls** — `candidate.ts:148` builds `currentTarget` as an
async closure, and `lifecycle.ts:2778` passes `currentTarget: (slug) => collectGitCandidateTarget({…})` into
`runAttest`. The second is the load-bearing one: **attestation gains a refusal it does not have today.** A task
plan that treats the widening as a mechanical type propagation will miss that a ceremony changes behavior.

### `resolveGitCandidateTargetBase` — a separate propagation

Five call sites across four files, not covered by the collector's:

| File                        | Sites    |
| --------------------------- | -------- |
| `status-composition.ts`     | 395, 452 |
| `checkpoint-composition.ts` | 1026     |
| `delivery-execution.ts`     | 5776     |
| `respond-composition.ts`    | 224      |

### Overlap reason split — four layers

`RevisionOverlapResult` → `OverlapEvidence` (`base-drift-types.ts`) → `EvidenceOverlapObservation` →
`EvidenceOverlap` (both `evidence-applicability/schema.ts`). The second layer has no ambiguous and no unrelated
arm, and `analyzeBaseOverlap` folds `unrelated` together with `merge-base-failed`, so `unrelated` must be
**lifted out** there rather than passed through. `status-composition.ts` re-collapses the same pair again on the
review-status path. Editing only the first layer leaves both affected pins observing byte-identical values.

The fourth layer is the normalized verdict space, reached only through `normalizeOverlap` (`compose.ts`) — the
sole conversion into it, though not its sole constructor: the `not-applicable` arm has its own origin on the
three delta causes that read no base. Two reductions receive a base-resolution arm on the
`base-movement` cause: `review-gate/status.ts` and `scripts/integration/errand-merge-composition.ts`. The
integration checkpoint is a third consumer (A4) — not a reduction, but the surface that answers a work unit with
no bound delivery terminal, which neither reduction reaches. Candidate applicability is not a consumer at all —
it refuses an ambiguous base at its own `merge-base --all` read, ahead of any reduction.

Two consumers of the second layer take the same shape and neither is the register alone: `base-drift-register.ts`
and `base-distance.ts`'s movement classifier both test the unavailable status and then dereference a path field.
And `errand-merge-composition.ts` parses second-layer evidence straight into the third layer's schema by shape
coincidence, so the two layers' new arms must carry identical field sets or that parse throws.

### `repository-target.ts`

Maps into `LocalTargetDerivationError`'s existing closed reason set, beside the `no-merge-base` reason it already
carries. No new error family.

---

## Reader inventory — the full sweep

Re-derive with:

```sh
grep -rn '"merge-base"' packages/arc-framework/src --include=*.ts \
  | grep -v __tests__ | grep -v is-ancestor | grep -v independent
```

Sixteen hits at fifteen distinct call sites — one file contributes both an invocation and its error-reporting
args. Seven pick silently (no `--all`).

Five silent picks sit outside this work unit's concerns and are listed for sweep completeness rather than
treatment: `identity-transaction.ts`, `from-branch.ts`, `github-refresh.ts` (one of its two),
`committed-progress.ts`, and `hosted-reservation-discharge.ts`. `github-refresh.ts` also carries an `--all` site.

The two decomposition sites (`git-decompose-v3-repository-plan.ts`, `git-decompose-v3-retirement-delta.ts`)
reached the read-all-then-refuse shape independently under a third spelling of the reason code, with no observed
failure behind either.

The untyped throw at `git-candidate-effective-target.ts` carries "The Candidate target has no sole base
coordinate." — the same string the ledger records as a blocked obligation's `detail`, confirming the surfaced
message is exception text rather than a result.

---

## Pinned probes — the eight holds

Each fails the moment the behavior changes, printing what it was waiting for and the exact replacement. They
retire independently, one per boundary. A fix cannot merge while one is red.

| Probe file                                  | Hold                                                          |
| ------------------------------------------- | ------------------------------------------------------------- |
| `review-readiness-delivery-binding.test.ts` | reports nothing bound when a member's head advanced           |
| `delivery-binding-head-movement.test.ts`    | reports a terminal unsettled when merged past the bound head  |
| `history-shape-ambiguity.test.ts`           | base's own change reported as the contribution                |
| `history-shape-ambiguity.test.ts`           | ambiguous subject digests differently from the unambiguous    |
| `history-shape-ambiguity.test.ts`           | refuses typed rather than choosing one of two bases           |
| `history-shape-ambiguity.test.ts`           | collects a staged subject from one chosen ancestor            |
| `history-shape-ambiguity.test.ts`           | reports the overlap unavailable rather than proving it        |
| `review-status-base-movement.test.ts`       | directs a checkpoint rerun on a base that moved only in shape |

`expectPinnedObservation` returns cleanly while the result still matches `observed`, **throws once it matches
`target`** — "the hold is spent: replace this call with a plain assertion" — and throws again when the result
matches neither shape. It also throws at setup when the two shapes agree. So a hold is green while the defect
stands and red the moment the behavior changes, by whichever of those two routes applies, and there is exactly one
terminal disposition either way: replacement with a plain assertion. Re-pointing a hold at an outcome this work
unit delivers only makes it fire sooner; it does not retire it.

Which route a hold takes depends on whether its declared `target` is the outcome the design produces. The staged
arm, the terminal head movement, and the review-readiness binding reach their targets. The committed-arm subject,
the digest sibling, the drift overlap, and the review status do not: their awaited value never arrives, so they go
red as neither-shape and are replaced in the same change that moves the behavior. The Candidate applicability hold
goes red by neither route — the design keeps its observed refusal — so nothing forces its replacement and it is
retired deliberately.

**Correction, found during Phase 3.** Two of those four cannot take the neither-shape route at all. The
committed-arm subject and the digest sibling each name one field over a two-valued space — `paths` is whichever
half the ancestor pick exposes, `differs` is a boolean — so every result matches one shape or the other, leaving
the spent-hold route as the only red one. The digest sibling has taken it once already with nothing fixed: the two
arms write identical content deliberately, so the digests agree whenever the pick lands on the branch-side
ancestor, and `history-shape-ambiguity.test.ts` records the same varying pick in its own comment on the staged
arm. Both can therefore go red, reported as spent, before the change that moves the behavior arrives. What each
replacement asserts is unaffected; the trigger named above is not.

**Retired during Phase 4.** Two of the rows above are gone, neither on the schedule stated for it. The drift
overlap went red as neither-shape at the moment the middle layer stopped folding, a phase earlier than the route
above predicts, and its assertion is now a plain one in the same probe file. The review status never went red at
all: the design's answer for an ambiguous base is the rerun that hold observed, so it sat in the same position as
the Candidate applicability row and was retired deliberately. Its replacement asserts the base-movement half and
leaves the routed obligation unasserted, so the conversion that changes that string extends the assertion instead
of re-editing it.

A ninth row is owned here and **deliberately unpinned**: `delivery-rebuild-base-movement.test.ts` — "returns the
identical refusal after the operator resolves the conflicted path". It proves the named remedy does not clear the
refusal, which no other test asserts, and the refusal itself is correct.

Two planning probes sit beside the pins rather than among them.
`probe-terminal-waiver-applicability.test.ts` carries two cases whose halves face opposite ways — the adoption
assertions hold behavior this design intends to change, while the applicability and derivation assertions hold
behavior it keeps. Convert the adoption assertions to a pin when the admission route lands; keep the rest as
ordinary regression coverage. `delivery-public-review-continuation-git.test.ts` holds that an operator-absorbed
top that is not an ancestor of the Candidate's recognized target produces no advance proof, with the tree matching
by construction so a mismatch cannot be the cause — ordinary regression coverage.

Outside those planned neither-shape retirements, a probe reporting that the held result no longer describes what
happens and the awaited one has not arrived either has found behavior neither shape names. That is a finding, not
a retirement.

---

## The overlap and relation vocabulary — inputs for its re-authoring

Phases 4 and 5 of the task list were routed back to the design stage rather than patched further. The direction
is settled — one resolver, one relation, and the collapsed distinctions carried through every layer — but the
**vocabulary** is not: each layer's arm set, each reader's disposition, the normalized verdict space, and the
emitted refusal surfaces have to be authored as one coherent design rather than derived layer by layer. What
follows is the source-verified ground that authoring needs, so none of it is re-derived.

### Two fail-open paths, both verified

Each is a place where the natural local edit compiles, passes its listed assertions, and turns a refusal into an
acceptance. They are the reason the vocabulary is authored as a whole.

**The normalized overlap has no safe destination for a new arm.** `EvidenceOverlap` is a closed four-arm union —
`disjoint | overlapping | unknown | not-applicable` — and the base-movement path validates against a three-arm
subset that excludes `not-applicable`. `overlapping` requires at least one substantive path. So a new observation
arm carrying no paths can only normalize to `disjoint` or `unknown`, and `disjoint` reduces to the strongest
accept (`carries`), while `unknown` reduces to `fresh`. **`unknown` is the safe answer**, and any instruction that
forbids it forces the fail-open. The durable fix is new arms on the normalized union itself, which makes every
consumer conversion compiler-forced through the existing exhaustiveness assertions.

**The close-time eligibility reader's only overlap protection is an absence.** `overlapping-ahead` carries no
`chainBase`, and the close-time reader derives a null chain base for exactly the variants that lack one, then
refuses. That null is what refuses a non-empty overlap at close time — there is no other check on that path.
Giving the migrated divergent variant a `chainBase` unconditionally therefore removes the protection unless the
close-time reader gains the same overlap decision the prepare-time one gets. The two readers must be designed
together; a rule written for "the reader" singular leaves the second one accepting.

### Facts the design should not re-derive

- The multi-base branch returns **before** the merge base is assigned and before any changed-path read, so an
  ambiguous result carries no merge base and no overlap. Any arm that assumes one is unreachable in that state.
- An unresolvable ancestry read is a different thing from an unresolved topology: the wrapper establishes the
  pair itself, so a failed read is an unavailable read rather than a classifier variant.
- The relation's own reader has exactly two call sites, both in the eligibility module — prepare-time and
  close-time — and both dereference the chain base off a resolved relation.
- The reservation's authorization snapshot neutralizes coordinates on the landing arm: the result comparison
  substitutes the recorded coordinates into the observation before comparing, so coordinates there are not an
  authorization term. That is why observed coordinates take a dedicated field rather than overloading it.
- An exhaustive consumer sweep over every widened type is already recorded in § Propagation surfaces and
  § Reader inventory. Distinguish failing by type from failing by narration. The drift register and the movement
  classifier each test the unavailable status positively and then dereference a path field, so the compiler flags
  the dereference while saying nothing about the narration — a minimal fix restores compilation and leaves both
  new arms sharing the quiet text. The review precondition mapper is the genuinely silent one, a switch with no
  default arm.

### Coverage already spent, so it is not respent

The task list was audited by five independent fresh-context adversarial passes plus two exhaustive mechanical
audits. The mechanical audits are complete over their classes and need no repeat: every task that changes a type
or schema names both its library and schema locus, and every consumer of every widened type is enumerated. The
adversarial passes found four defects that reached the fail-open or state-corruption class; three of those were
introduced by repairs to earlier findings, all three in this vocabulary's territory. Phases 1-3, 6 and 7 came
through settled and were verified against source repeatedly; their residual is specification detail that surfaces
loudly during implementation.

---

## Amendment reasoning

Keyed by the spec's `## Amendments` log. Only the arms whose reasoning exceeds a line are recorded here; the
superseded text is quoted so the design body can read as the current design without losing what it replaced.

### A1 — the decline's restoration inventory

Superseded, § D9: _"What else differs is the inventory undone: candidate refs and gates there, local member refs
here."_

The sentence reads as a scope decision and was executed as one, but what the settle actually moves falsifies it.
Chain absorption rewrites the local terminal top under a lease of its own, and the suffix the settle records
excludes it by construction — the slice that builds the observed suffix drops its last element. The decline
therefore restores the members, leaves the top standing, and reports that it released. Success Criterion 7
already required "every ref ARC moved by lease", so the criterion and the design disagreed; the criterion is
pre-commitment text and governs. What the settle moves is what the decline undoes.

The same publish carries a second decision this amendment settles: the phase publish replaces the recorded
observation wholesale rather than reconciling it, so a re-run after a terminal wedge can overwrite a head ARC
wrote with one it merely observed. Restructuring the inventory while leaving that replacement unexamined would
leave a decision half-made in the code the amendment is already rewriting.

Implementing it surfaced a third sentence in the same D9 paragraph the change falsifies: _"only a settle that
proceeds to move refs publishes twice."_ The absorbed top's observed head does not exist until the absorb
returns, so it cannot ride the member record, and the final publish is the one that clears the reservation — too
late for either wedge the decline exists for. Its record therefore needs a publish of its own, between the
absorb and the top publication. D9's pinned placement for the member record is untouched; what moves is the
count, which the revision now states per arm. The alternative that preserves the count — absorbing ahead of the
rewrite loop so one publish covers both — reorders the settle's irreversible local operations and contradicts
the "Placement is exact" sentence directly above, which is a larger change than the one it saves.

### A4 — the integration checkpoint as a cause consumer

Superseded, § Propagation surfaces: _"Only two reductions can receive a base-resolution arm, both on the
`base-movement` cause."_

The enumeration is accurate about reductions and wrong about reach. Both reductions answer a work unit that has
a bound delivery terminal. The ordinary work unit has none — and it is exactly the one review status routes to
the checkpoint, which reads a movement classifier that flattens ambiguous, unrelated and unavailable into one
`unknown` and answers with a rerun of itself. Task 4.8 already set out to give that pair a route at both
checkpoint pairs; the arms it authored sit behind a guard that returns before them whenever the terminal records
are unbound, so the route exists and is unreachable on the only vehicle that needs it. Admitting the checkpoint
as a third consumer is what makes 4.8's stated outcome true, rather than new scope.

### A5 — why the absorber remedy is spec-depth and not a task arm

D10 already requires this arm to carry "a typed remedy action the caller dispatches", and names the
terminal-absorption arm explicitly, so the gap is covered by a settled statement. What no statement supplies is
the remedy **vocabulary** for the condition class: every kind `DeliveryTerminalRemedy` carried describes a
delivery-record or host condition, and the absorber refuses on local preconditions — an unchecked-out top, a
moved top, a dirty worktree, an in-progress merge. Those kinds had to be authored rather than selected, which is
what keeps the amendment at spec-depth. The appended criterion makes the property checkable at the next
occurrence.

### A6 — the terminal arm persists before its wedge returns

Superseded, § D6: _"Nothing is persisted on the input side, so nothing can go stale."_

True of the suffix arm, which returns before any state write, and the sentence was derived there. The terminal
arm publishes its phase transition before the wedge returns, which advances the state revision the resolution
pins. An operator who resubmits the byte-identical resolution the disclosure asked for is then refused for a
mismatch on a revision that moved underneath them, with nothing about the conflict set changed. Binding the
resolution to the conflict set it answers, rather than to the revision that carried it, keeps the clearance
check exact while removing the dependence on a value the protocol itself moves.

### A13 — `unrelated` is clearable, just not by the command the checkpoint named

Superseded, § D1: _"`unrelated` | no common ancestor | terminal"_, and the sentence resting on it —
_"`unrelated` is terminal while `unavailable` is recoverable."_

The disposition was never observed against git. Both halves were measured in a throwaway repository before the
amendment was written:

- `git merge --no-ff --no-edit <base>` — the exact command `mergeAppendOnly` runs for `arc base merge` — exits
  128 with `fatal: refusing to merge unrelated histories` and leaves **no** `MERGE_HEAD`. The composition's
  `catch` rethrows anything without a merge in progress, so `arc base merge` does not refuse here; it dies on an
  uncaught error.
- `git merge --allow-unrelated-histories <base>` exits 0, builds a two-parent commit, and leaves the pair with
  exactly one merge base. The pair moves to `resolved`, not to `ambiguous`, so the next read resolves cleanly.

The symmetric claim was measured the same way: a criss-cross carrying two merge bases collapses to one under the
plain merge, so `ambiguous` keeps `reconcile-base` unchanged.

So the design record and the delivered code had already disagreed. `review-gate/status.ts` ships
`git merge --allow-unrelated-histories` as this condition's remedy under this very work unit, while D1 called the
condition terminal. The amendment catches the record up to what shipped rather than introducing a new route.

What "terminal" was protecting is kept. The reason D1 gave was that a terminal condition parked under a
recoverable status is retried forever — and routing `unrelated` to `reconcile-base` is exactly that failure, a
retry of a command that cannot reach it. Naming the hand merge removes the loop without removing the route, which
is what § Success Criteria asks for: a remedy that can clear it, **or** a statement that stops inviting one.

Two costs are accepted rather than hidden. The hand merge carries no head pin — `arc base merge` refuses on an
`--expected-head` mismatch, while `git merge --allow-unrelated-histories <oid>` runs against whatever `HEAD` is,
so the operator's checkout is the only thing binding it. And a branch sharing no history with its base is more
often a wrong base or a wrong clone than a merge waiting to happen, so the refusal detail leads with the observed
condition rather than the command, and the operator is expected to recognize a setup error before running it.

One route was considered and rejected as out of scope: adding `--allow-unrelated-histories` to `mergeAppendOnly`
would make the superseded routing correct and cost nothing here, but it changes what `arc base merge` means for
every caller — a scope expansion for the Owner to weigh separately, not a correction this amendment may absorb.

### A13's propagation sweep, both directions

Bounded to what references the superseded element — D1's `unrelated` disposition — plus the evidence already
recorded for it. Every hit and its disposition:

**Revised in this batch.**

- § Cross-cutting Considerations, _Refusal recoverability_: "`unavailable` is recoverable and `unrelated` is
  terminal" was the sentence resting directly on the superseded row. Marked at the locus.
- `base-overlap.ts`'s `resolveSoleMergeBase` doc comment carried the same disposition as the resolver's own
  statement of what each arm leaves a caller. It reads as clearable-by-hand now; no amendment id, since planning
  ids do not go in code.
- Tasks 4.8 and 4.R3 both record the routing A8 superseded, so both `_Amended in:_` lines name A13 beside it —
  a reader needs the replacement, not only the retraction.

**Unaffected, checked.**

- § D3's `resolver unrelated` row keeps "rebuild from a common lineage — no automated command". A different pair:
  giving a member head and the protected-base tip a common ancestor does not make the member a valid predecessor,
  so the rebuild is the act, and the row already declines to invite a retry.
- Success Criteria 11 and 12 are satisfied rather than contradicted — 11 admits either a clearing remedy or a
  terminal statement, and the hand merge is the first limb.
- The movement observation's `movementCause` comment says both causes are cleared by a merge rather than by
  reading again. Still exactly true; the amendment split which merge, not whether one is called for.
- `base-drift-register.ts`'s degraded text for `unrelated` points at the checkpoint, which is now where the
  operator is handed the join. Correct as it stands.
- Phase 5, 6 and 7 exit criteria reference the ambiguous refusal surface, not this disposition.

**Backward, over evidence already recorded.** Two segment verifiers passed over behavior a later amendment
changed, so each takes the additive line rather than a rewritten outcome: 3.6 certified the decline whose result
contract A11 widened, and 6.8's "carried rather than uncovered" conclusion is the one A10 reopened at three
consumers. A12's settlement-phase refusals are revision-race arms 3.6's wedge scenarios never reach, so its
evidence is untouched.

Nothing reopened a design question, so the sweep exits with no detour.
