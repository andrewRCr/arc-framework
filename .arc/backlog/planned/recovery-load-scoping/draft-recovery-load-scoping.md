# Draft: recovery-load-scoping

- **Origin:** [internal] — surfaced 2026-07-23 in a `--plan` grooming session, from field observation that
  post-compaction recovery in an integration session loaded the full universal load set, the WU's task list, spec,
  and notes companion, plus every method declared by `verify-work-unit` and `integrate-work-unit` — when the work
  actually remaining was: await a delegated adversarial pass, disposition its findings, merge.
- **Purpose:** Post-compaction recovery reads a **lifecycle-shaped** load set when the need is **position-shaped**.
  Make the read a deterministic function of where the session actually is, by separating a manifest entry's
  **disposition** (read it, or know it exists) and its **depth** (how much of it) from its **membership** — two
  axes the shipped schema already keeps apart from a third. Recovery is the forcing case; the mechanism is
  general, and standing it up here supplies `composable-workflows` a working instance of range-addressed loading
  against one of its open questions.

---

## Problem / Motivation

Recovery rehydrates from a manifest the CLI projects (`resolveLoadSetManifest`). For an `integration` session that
manifest is: six universal entries, the meta, `SESSION-NOTES`, `WORKING-MEMORY`, `integrate-work-unit.md`, and the
cohort doc when present. Measured against the current corpus, the observed cost stratified into three tiers:

| Tier                                               | What authorized it                             | Cost                      |
| -------------------------------------------------- | ---------------------------------------------- | ------------------------- |
| The manifest itself                                | `resolveLoadSetManifest`                       | ~17k words (**~23k tok**) |
| Declared-method fan-out (8 methods + 4 extensions) | `DEV-RULES.ARC` § Method and extension loading | **~8k tok**               |
| Artifact tail — spec, full task list, `notes-*`    | nothing authorized it; nothing forbade it      | **~30–60k tok**           |

**Tiers 2 and 3 are closed.** The projection emits no task list for `integration` sessions and no spec or notes
companion in any branch; those reads came from the workflow body and from an unbounded reconstruct-my-context
impulse. The `recovery-read-contract` errand (2026-07-23) bounded the recovery read to its manifest and corrected
the `ready`-verdict phrasing that read as clearance to resume. This WU does not revisit that ground.

**Tier 1 is what remains, and it is blunt by construction.** `sessionType` is a three-value enum derived from the
meta's `**State:**`. It cannot distinguish opening a PR from awaiting review findings from composing the archive,
so at the moment the field report describes it carries no information. Every integration resume gets an identical
read regardless of how much of the lifecycle is behind it.

The recoverable share is bounded and worth stating up front, because it sets the bar the design must be
proportionate to. Constraints and live state are undemotable by `loadset-composition`'s rule — `DEV-RULES.ARC`
(4,243 words), `WORKING-MEMORY` (3,209), `DEV-RULES.PROJECT` (1,654), meta plus `SESSION-NOTES` (~1,400). What
remains addressable is roughly **2,400 words of demotable universals** (both briefs, `STRATEGY-INDEX`, the
`QUICK-REFERENCE` residual, the cohort doc) plus **1,400–1,800 words of the 4,068-word lifecycle workflow** when
read at position: **~22–25% of the manifest, ~4–5k tokens.** Modest per event; the operation recurs several times
per session, every session, which is where it earns its keep.

The workflow share pays asymmetrically across positions, and the originating report sits at the weak end:
`awaiting-review` is early in Phase 1 and still needs most of the file (~15%), while `mergeable` skips Phase 1
(~35%), `merged-needs-archival` skips most of it (~60%), and opening a PR skips Phase 2 (~57%). Size the work
against the average, not against the motivating anecdote.

This is a different question from what earns always-loaded status. `loadset-composition` owns that, applied at
init for both consumers. This WU asks what only exists at recovery: **given that a harness summary survived and
the session is resuming mid-workflow, which manifest members must be read, and how much of each?**

## The governing constraint — scoping is computed, never judged

`recovery-hardening` records that Claude-family models routinely rationalize past recovery, and that the failure
is dispositional: a concrete task plus a rich summary create a _feeling_ of sufficiency. Its conclusion is that
"more/better prose is demonstrably not the lever."

A WU whose thesis is _read less at recovery_ is in direct tension with that. If the **agent** decides what to
skip, the rationalizer gets exactly the lever `recovery-hardening` exists to remove. Hence the invariant every
design here must satisfy:

> **Every scoping decision is CLI-computed and carried in the manifest. The agent reads what it is handed and
> makes no judgment about what to omit.**

This is the cohort determinism corollary applied at a new fire point, and it is already ratified in unintegrated
code: `session-locus-model` rewrites recovery's resume dispatch to key on a typed `recoveryFrame` and states that
"branch prefixes, active-meta fields, and the harness summary never select recovery mode." That WU settled _which
frame_; this one settles _how much of it_.

## The three-axis model

The organizing idea, and the reason this composes with work that has not landed yet. A `LoadSetEntry` is
`{path, readMode}` — two fields, because they answer two different questions. Naming the third makes the
decomposition explicit:

| Axis            | Question                            | Owned by                                                     |
| --------------- | ----------------------------------- | ------------------------------------------------------------ |
| **membership**  | which paths appear at all           | the projection today; `composable-workflows` fragments later |
| **disposition** | is this read, or merely known about | this WU                                                      |
| **depth**       | how much of the path is read        | this WU, extending the shipped `readMode`                    |

The axes are orthogonal, so refinements on one do not displace the others. When fragments arrive, they refine
membership — the compiler selects `arms/review-iteration.md` rather than the monolith — and a range read still
slices _within_ that fragment when the resume sits at its tail. Finer grain on top, not a competing mechanism.

The precedent is shipped and stable: `partial-strategic` slices a task list into header, current phase preamble,
and current task section. A task list is a single file that could equally have been decomposed into per-phase
files; ARC chose range-slicing and it has held.

## Target direction

Not settled implementation — recorded so the spec starts from the composed shape.

### D1 — position-parameterized disposition

`LoadSetEntry` gains an optional disposition (`load` | `aware`). Recovery reads the `load` set and renders the
`aware` set as a pointer list, so the agent knows an artifact exists and loads it at its step trigger.

**Disposition resolves from lifecycle position, not from which consumer is asking.** There is no
`mode: init | recover` parameter and no recovery-specific policy branch; init is simply the position "session
start," where everything resolves to `load`. This preserves the invariant `composable-workflows` D3 depends on —
"the projection resolves membership from shared policy, never a consumer-specific hardcoded list … recovery
remains a policy _consumer_" — so a later lift into the agenda compiler stays a fork-free shift. It also means
there is no init/recover parity break to record: the parity test asserts one policy evaluated at two positions.

### D2 — position keying

The oracles exist and are already computed; no new durable state is minted.

- `workUnitState.value.inFlight.workUnits[].state` — `awaiting-review` / `mergeable` / `blocked` /
  `merged-needs-archival` / `stale`. Integration sub-state, emitted every probe and consumed today only for an
  advisory orientation line.
- `taskCursor` — already the execution-session position anchor.
- `session-locus-model`'s `recoveryFrame` — selects the workflow and base set.

Frame selects the workflow; sub-state and cursor scope the read within it.

### D3 — `partial-progressive`: reading a workflow at its position

A fourth `ReadMode` that reads a document from its resumed position forward, plus whatever preamble the procedure
needs to execute correctly. Structurally the sibling of `partial-strategic`, applied to a second document family.

**The anchor is a triple** — id, title, line hint — resolved by graduated lookup, mirroring
`partial-strategic`'s shipped contract: start at the line hint, fall back to id, then title fragment. The line
number is never authority; it tolerates staleness by design.

The id is a **heading slug** — the sanctioned zero-marker stable reference (`composable-workflows` D2: "heading
slugs remain the zero-marker fallback"), reserving the `· #name` marker for extension fire-points as today's
point-scanner contract requires. `integrate-work-unit` already carries clean `## Phase 1` / `## Phase 2` headings.

This inherits a fragility task lists do not have. A task list's id (`5.3`) is a semantic identifier independent of
prose; a heading slug is _derived from_ prose, so rewording a heading changes the identifier. Two mitigations,
both cheap: the graduated lookup absorbs a reworded title, and a **point-scanner check that every anchor the
mapping references resolves to a real heading** turns a silent runtime truncation into a commit-time error with a
self-sufficient message. That check is a hook rule over a data table, not a declaration schema — it retargets
trivially when structural anchors land.

**Position → anchor mapping lives CLI-side**, for the two workflows that need it (`integrate-work-unit`,
`process-task-loop`). Declaring it in workflow frontmatter instead is the evident generalization and is
deliberately not taken here — see § Scope boundaries.

**The anchor is derived fresh at recovery and never seeded.** Everything the compaction seed carries exists to be
compared, so seeding a position would acquire a comparison and therefore a stop reason. Deriving fresh means
there is no baseline to disagree with: no fifteenth stop kind, no calibration impact on `recovery-hardening`.

Safety comes from a read-forward design plus conservative resolution. An anchor that resolves **too early** reads
more than needed — today's behavior exactly; one that resolves **too late** truncates procedure the resume needs.
So ambiguity anchors earlier, and the mandatory preamble is never truncated. The mechanism degrades to the status
quo rather than to something worse, which is what makes a non-gating anchor defensible: a gate would protect
against a failure the design already fails safe on.

This populates a slot `composable-workflows` has already reserved rather than building beside it: its D3 step
vocabulary defines `read` as taking "path/id, **read-mode**, parallel-group, on-fail," and its open questions
list "the remaining per-step arg schemas (`read` beyond the shipped read-modes…)" as residual.

### Scope boundaries

Two lines this WU does not cross, recorded so a drift across them is legible as a stop-and-hand-back rather than
a judgment call:

1. **Range addressing only, never fragment extraction.** If the work starts wanting the `slug → artifact`
   resolver, per-arm files, index hubs, or the `system/workflows/` directory reshape, it has crossed into
   `composable-workflows` D2 and stops.
2. **No frontmatter section-declaration, and no `strategy-workflow-authoring` edit.** Declaring anchors and gate
   expressions in workflow frontmatter is the evident generalization, and `composable-workflows` D1 names exactly
   that intention ("conditional declaration … arm- or `sessionType`-gated entries") while asserting it "settles
   the whole declaration family's schema." The distinction against the read-mode call above is blast radius: a
   read-mode is an **enum** CW expects to grow — additive, low-coupling — whereas the declaration family is a
   **schema** CW expects to unify, so a differently-shaped section key becomes the second convention D1 exists to
   prevent, kept for compatibility rather than because it is right. Migration cost is trivial; precedent
   lock-in is not. The same reasoning covers the strategy doc: it is D1's declared landing surface, and the
   point-scanner error is a better author guardrail than a paragraph read months before the breakage.
3. **The general declared-method eager-load rule stays untouched.** The measured fan-out is corpus-wide
   (`create-spec` pulls 8,036 words of method against a 2,659-word body; `draft-design` 7,486 against 2,197;
   the corpus is 17,121 words across 25 files), and correcting it means converting a frontmatter declaration from
   a preload list into validated fire-site triggers — `composable-workflows` L4, routed there with the
   `point-scanner.ts` CHECK 16 extension-marker precedent as the mechanism. The shipped recovery override is
   recovery-scoped and stays that way.

## Source-grounded design constraints

Settled from `load-set/audit.ts` and `load-set/types.ts` at grooming, not assumed. The comparator inspects
`entry.path` (membership, via `groupByPath`), `readMode.kind` (plus `heading` for `partial-section`), positional
path substitution, and `manifestVersion` — and nothing else on the entry.

1. **Disposition, not omission.** Scoping by _omitting_ entries fires `membership.added` / `.removed` on every
   position change between seed emission and audit — a guaranteed false-stop generator against a stop condition
   that is already too sensitive. Scoping by _disposition_ is invisible to the comparator. The field is what
   preserves the drift invariant, not ergonomics.
2. **Disposition must be a new field, never a `ReadMode` kind.** `readModeEqual` is compared. Expressing
   awareness as a read mode would make a position change between seed and fresh manifest emit `readModeChanges`
   → `load-set-drift` → stop.
3. **`partial-progressive` must keep position out of the mode.** A naive design encoding the resumed position
   _inside_ the read mode would make every position change between seed emission and audit emit
   `readModeChanges` → `load-set-drift` → stop, manufacturing the false stops the feature exists to avoid paying
   for. The precedent resolves it: `readModeEqual` compares only `kind` except for `partial-section`'s `heading`,
   which is why `partial-strategic` already varies its slice freely — the slice is not in the mode, it is
   resolved separately from `taskCursor`. So `partial-progressive` is a bare `{kind}` and its anchor rides its own
   report surface. Residual, and the real design question: **where that anchor lives, and whether it gates.**
   `taskCursor` gates (`task-cursor-mismatch` is an unconditional stop); a workflow-position anchor almost
   certainly should not, since a new gating stop reason is precisely what `recovery-hardening`'s calibration
   problem does not need.
4. **The migration risk lives in `manifestVersion`.** It is `z.literal(1)` and a mismatch alone sets `diverged`,
   so a version bump means every pre-upgrade seed diverges against every post-upgrade manifest — a guaranteed
   `load-set-drift` stop on the first compaction after upgrade. Either stay additive at v1, or bump and treat
   version skew as an expected non-stopping condition.

A compat detail the schema pair forces: `LoadSetEntrySchema` is `strictObject` (rejects unknown keys) while
`LoadSetEntryReaderSchema` is `object` (**strips** them). If disposition rides the seed, the reader schema extends
in the same change or the field silently vanishes on the recovery path.

Because the fresh manifest is canonical for context loading and the seed's copy is only the audit baseline,
position drift between emission and recovery resolves correctly for _loading_: fresh dispositions govern and stale
ones are ignored. Constraint 3 is about the _audit_, which is a separate path.

## Dogfood contract with `composable-workflows`

`composable-workflows` names `session-recover` as its second agenda consumer and anticipates factoring
`session-recover`'s inline `partial-strategic` contract into a shared source at its D3 rewire. This WU builds on
that declared seam.

Its open question — "fragment granularity + directory layout — per-arm files vs. anchored sections loaded by
range" — frames the two as alternatives. For the coarse purpose (load only the applicable arm) either works, so
the framing is reasonable; the three-axis model above argues they are different layers, and a shipped
range-addressing instance is the evidence that settles which reading is right.

**Three evidence artifacts, not one.** (a) A shipped range-addressing instance for D2's granularity question.
(b) **A second, independent consumer for the stable-anchor system** — D2 currently justifies anchors on
cross-file-citation hygiene alone; runtime range addressing is an unrelated consumer, and it adds a requirement
citation does not imply: an anchor must delimit a _span_ (this anchor to the next), not merely mark a point.
Recorded lean, from this grooming: the `§ SectionName` convention D2 already calls "likely lowest-friction",
paired with authoring guardrails rather than convention alone. (c) The concrete shape a section-declaration would
have taken, for D1 — derived from the CLI-side mapping this WU ships instead.

**Guard against the wrong conclusion.** If range addressing works well, the tempting inference is that fragments
are unnecessary. That would be a misreading, and this WU's evidence explicitly does not support it. Fragments
carry value ranges cannot supply: authoring isolation, a per-file structural budget CI can check, and the
recursive contract shape (signature, gate, bounded body) that `composable-workflows` D1 makes the substrate of its
whole discipline. Ranges reduce what a session reads; fragments govern how procedure is _written_. Evidence
produced here bears on **granularity and addressing**, and on nothing else.

## Alternatives

- **Trim the manifest instead (rejected — different WU).** `loadset-composition` owns always-loaded membership.
  Its demotion rule ("demote to an explicit trigger, never implicit awareness; never demote a constraint") is the
  parent principle this WU applies at a second fire point, not a substitute for it.
- **Prose-only bounding (adopted, shipped as its own errand).** Closed tiers 2 and 3 for zero code. Insufficient
  alone: it cannot reshape the manifest, which is what remains.
- **Disposition only, no depth axis (rejected).** Recovers ~14% and leaves the lifecycle workflow — the single
  largest non-constraint member — read whole at every position. It would ship a fix that does not address the
  originating report.
- **Let the agent scope its own recovery read (rejected on principle).** Cheapest to build; hands the documented
  rationalizer the exact lever. Violates the governing constraint.
- **Wait for `composable-workflows` (rejected).** It is Large, design-heavy, staged, and gates the cohort. Waiting
  forgoes a recurring 24–28% indefinitely and forfeits the chance to settle one of its open questions with a
  working instance rather than deliberation.

## Unknowns and Assumptions

- **[OPEN] Where does a workflow's mandatory preamble end?** Now the load-bearing residual, since the read-forward
  safety argument rests on it. A position-addressed read still needs whatever the procedure requires
  unconditionally — interlocks, authority boundaries, output discipline. `composable-workflows` D3 asserts
  interlocks and stops stay in the core unconditionally because they are constraints; the analogue here is a
  per-workflow always-read prefix the range read never truncates. Needs a concrete rule, not a judgment call.
- **[OPEN] Which entries earn `aware`, and how position maps to disposition.** The briefs, `STRATEGY-INDEX`, the
  `QUICK-REFERENCE` residual, and the cohort doc are the candidates — the last already sits in
  `loadset-composition`'s inbound buffer. The criterion is that WU's recognition-reliability rule; the seam is
  whether one policy read at two positions genuinely covers both fire points.
- **[OPEN] Does the position → anchor mapping hold up for `process-task-loop`?** Its resident-loop shape has no
  once-through position the way `integrate-work-unit`'s phases do, and `composable-workflows` caps loops at D1+D2
  by design ("loops don't compile agendas"). The depth axis may apply to only one of the two workflows.
- **[ASSUMPTION] `workUnitState` sub-state is stable enough to key policy on.** Computed for an advisory line
  today; keying disposition on it promotes it to a correctness surface. Its degradation modes need a read — this
  session's probe carried a `Mergeable-sharpening tier degraded to presence` warning when the PR source was
  unavailable.
- **[ASSUMPTION] The disposition split survives `session-locus-model`'s wrapping.** That WU leaves
  `projection.ts` untouched but calls it through `baseLoadSet()` / `appendRecoveryWorkflow()` and caches the
  result as `derived.loadSet` on a locus row. The single-policy-point property appears preserved; confirm against
  the integrated branch rather than the diff.

## Coordination

- **`composable-workflows`** — the dogfood relationship above, plus the two scope boundaries. Consumes this WU's
  range-addressing evidence at its D2 granularity question and its read-mode residual at D3. Receives the general
  methods-eager-load concern routed at this grooming.
- **`session-locus-model`** — hard sequencing constraint and a validating precedent. The projection and read-mode
  work is SLM-independent; anything touching `recover/audit.ts` waits for SLM to integrate, since it rewrites that
  file and adds a `verdict.locusHint` comparison. Its typed frame is D2's upper axis.
- **`recovery-hardening`** — supplies the governing constraint, and owns the stop-sensitivity calibration captured
  at this grooming. No scope overlap: that WU makes recovery unskippable, this one makes it cheaper. Both fail if
  scoping becomes agent-judged. Constraint 3 is the point where this WU could actively harm that one.
- **`loadset-composition`** — shares the projection as a policy point and supplies the `aware` criterion. Whoever
  lands first establishes the position parameter; the other extends.

## Sequencing

Two independently landable groups. The projection, disposition field, and read-mode work has no SLM dependency and
can proceed on mainline. The comparator-adjacent work and D2's frame axis wait for SLM, which itself waits on
`review-chunking` and owes a rename-compatibility increment.

## Scope Estimate

**Medium.** `Class: Heavy` — resolved on the **scale** axis: a correct plan must be grounded against the
post-`session-locus-model` shape of `recover/audit.ts` and `locus-context.ts`, across the projection, load-set
types, seed schema, envelope registry, and both workflow consumers with their package mirrors, plus
`composable-workflows`' contract where the read-mode and anchoring conventions must land compatibly. Derivation
fires only weakly — the direction composes from existing patterns (`partial-strategic`, the shipped `loadSet`) and
an already-ratified determinism precedent.

- **Depends On:** none hard. Sequencing constraint on `session-locus-model` for the comparator-adjacent leg only.
- **Out of scope:** recovery stop-sensitivity calibration (`recovery-hardening`); the general declared-method
  eager-load rule, fragment extraction, and the workflow directory reshape (`composable-workflows`); always-loaded
  membership (`loadset-composition`); the harness hook payloads.

## Continuity

- **Readiness:** `maturing` — scope, direction, and the anchor mechanism are settled; the three-axis model, the
  governing constraint, the three scope boundaries, and four source-grounded comparator constraints are resolved.
  Open items are detail-design, not fundamentals.
- **Resolved:** disposition-over-omission and disposition-outside-`readMode` (both from source);
  `partial-progressive` as a bare `{kind}` with its anchor held separately, per `partial-strategic`'s precedent;
  the anchor as an id/title/line-hint triple on heading slugs, derived fresh and never seeded, non-gating, made
  safe by read-forward plus conservative resolution and guarded by a point-scanner resolves-check; CLI-side
  mapping over frontmatter declaration, on enum-versus-schema blast radius; the migration risk located in
  `manifestVersion`; scoping-is-computed as the governing constraint; position-parameterized policy rather than a
  consumer mode, preserving the fork-free-lift invariant; range addressing composes with fragments as a distinct
  axis; standalone homing with four named seams; `Class: Heavy` on scale.
- **Open:** the mandatory-preamble boundary (load-bearing — the read-forward safety argument rests on it);
  whether the depth axis applies to `process-task-loop` at all; `aware` membership policy and its init seam;
  `workUnitState` degradation behavior under policy load.
- **Next:** settle the mandatory-preamble rule, then the `aware` membership policy against
  `loadset-composition`'s demotion rule. Both are detail-design against a settled frame; the WU is close to
  formalization-ready and its remaining gaps are `needs-detail` plus one stateable-success-signal gap.
