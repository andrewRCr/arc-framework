# Spec (`outline`): testing-guidance-apparatus

- **Origin:** [internal] — surfaced by a `decompose-matrix` teardown investigation that exposed a
  testing-compliance gap; captured to `USER-INBOX`, then reframed in design discussion from a mechanical-hook ask
  into a methodology fix.

- **Purpose:** Rationalize the project's testing-guidance apparatus so the operational standard is _actually read_
  at the moment tests are written — split the canonical strategy into thin, execution-loaded operational layers
  with clean, non-overlapping charters, and add the `extend` method-override capability that split needs.

---

## Problem / Context

The project has a solid `strategy-testing-methodology`, but strategies are **canonical and comprehensive by
design**, so they load on no schedule and are seldom read during implementation — task lists sometimes link the
strategy, but the link is rarely followed. The result is a recurring failure mode, the **#1 testing failure:
tests that pass but do not meaningfully exercise the code** (over-mocking, mocking internals, asserting on
implementation rather than observable behavior).

This is not hypothetical. A self-teardown defect shipped uncaught because the integration tests called the verb
cores with hand-fed inputs the CLI never generates, and no E2E tier drove the destructive verbs through the real
CLI — both contraventions of the written standard that nothing enforced or surfaced at the right moment.

Two structural problems compound it:

1. **No execution-time home for the operational standard.** The standard lives only in a comprehensive strategy
   that loads on no schedule. The project needs an operational layer that loads when (and only when) a session
   writes tests — without shipping project-specific standards to adopters as content, and without overlapping
   surfaces already loaded every execution session (`process-task-loop`, `DEV-RULES`, the `test-first` method).
2. **The apparatus is internally confused.** `test-first` conflates a _planning-time decision_ (whether tests
   come first / after / none) with an _execution-time discipline_ (red-green-refactor), and
   `strategy-testing-methodology` is roughly 60% recap / overlap (a duplicated TDD decision tree, a duplicated
   red-green-refactor loop, low-yield orientation). The genuinely load-bearing content — **mocking discipline and
   design for testability** — is buried in that mass.

## Decision(s)

Each decision was worked with its alternative in the originating design discussion and is settled. The `S#`
anchors are stable references — coordination notes routed to sibling work units (`naming-conventions`,
`quality-gate-hooks`, `customization-arch-realign`, `composable-workflows`, `rules-restructure`) cite them.

### S1 — Testing standards home is an execution-loaded method, not a domain rule

Testing standards route to an **execution-loaded method**, not a `DOMAIN-RULES.TESTING` domain rule. Domain
rules earn their conditional-load machinery when a domain is genuinely _occasional_ (frontend in a
mostly-backend repo); testing is _near-universal_ (nearly every code-execution session writes tests), so paying
for conditional loading of something almost always relevant is the over-engineered quadrant. The method path
(declared in `process-task-loop` frontmatter) gives "loaded every execution session" today, with
`quality-gate-commands` — a method whose content is wholly project-specific — as the direct precedent.
_(Coordination: `rules-restructure` drops `testing` from its candidate default-domain inventory.)_

### S2 — New `testing-standards` method (execution-time), two-gate loop wiring

A new method, sibling to `test-first`, declared in `process-task-loop` frontmatter, **self-gating** ("_when this
task writes or modifies tests, apply…_") so it is inert on doc-only / no-test tasks. Its content splits into a
shipped universal default and an `extend` project override (partition in S11).

`process-task-loop`'s body carries **two** per-task gates. Today it has only the first — the gap that let the
originating defect through (the only test-aware checkpoint keys on the marker, which test-after tasks don't
carry):

1. **Marker-keyed (sequencing / RGR).** The existing "Test-first execution" bullet repoints from `test-first` to
   `testing-standards`; fires on marker presence, drives the red-green-refactor vertical slices.
2. **Test-touch-keyed (discipline) — new.** Before implementing, _if the task writes or modifies tests_, apply
   `testing-standards`' mocking / assertion discipline. Fires on **every** test-touching task regardless of
   marker, so test-after tasks are covered — the case the current marker-only checkpoint misses.

### S3 — Resplit `test-first` along the planning/execution seam

`test-first` currently does two jobs at two times: the **decision tree** is consumed at `generate-tasks`
(planning) to structure tasks and place the marker; the **red-green-refactor discipline** is consumed at
`process-task-loop` (execution). Resplit along that seam:

- The **decision tree** stays a planning-time method, declared in `generate-tasks` **only**.
- The **RGR discipline** moves into `testing-standards` (execution).
- `test-first` therefore **drops out of `process-task-loop` frontmatter** — it has no execution-time role left.

### S4 — Strategy recharter (keep, don't delete)

`strategy-testing-methodology` survives as the **canonical deep-dive**: rationale (why mock bleed produces
order-dependent failures, etc.), the tier-map, and worked examples — the "understand the whole testing approach
in one place" doc. It **cedes the operational rules to the methods by reference** rather than restating them, and
**drops** the duplicated TDD decision tree and RGR loop. It is also the relocation home for content trimmed from
the method as table-stakes (S11). Minimizing literal duplication minimizes drift; a future `knowledge-lint` then
polices only the thin reference seam (making strategy = deep-dive / method = operational a feature, not a
hazard).

### S5 — `DEV-RULES.PROJECT` § Testing stays a thin pointer

Do **not** fatten it. Moving project testing content into the always-every-session rules doc would reintroduce
exactly the unconditional load this work is moving off of. It remains the thin, always-loaded pointer to the
method and strategy.

### S6 — Method-override capability: `override-mode: replace | extend`

The "universal default + additive project override" shape (S2) is impossible under today's **replace-only**
override semantics without duplicating the default into the override. Add an override **disposition** to the
method contract:

- `replace` — the override stands alone (no `super()`); current behavior; the default.
- `extend` — the default applies, _then_ the override appends (the `super()`-calling analogue).

**Shape — minimal, optional, absent ⇒ `replace`.** The field is **optional**: absent means `replace`, so only a
method that wants `extend` carries it. In practice that is `testing-standards`'s `.arc/` override copy
(`override-mode: extend`); package source omits the field and stays neutral by omission, so no package-neutrality
rule change is needed. This deliberately diverges from `override-active`'s present-in-every-copy shape, to hold
blast radius to the one method that needs it — the symmetric, present-everywhere treatment is **intentionally
deferred downstream** (below).

**Consumer check — verified tolerated at spec time (no forced code work).** Every consumer that reads method
frontmatter is permissive or presence-only, so the new field is accepted, not rejected: the schema parser
(`method.ts`) picks known keys and ignores the rest; the CI audit (`verify-integrity.sh`) greps only for
required-key _presence_; the package-neutrality check inspects only `override-active` and the override body; and
the house philosophy is explicit ("extra unknown keys are accepted for forward-compatibility"). This retires S6's
original verify-then-decide hedge: the result is the tolerated-field case, so the work rides here as planned with
no `method-override-modes` mechanism-WU split.

**Ships in this WU** (motivated and consumed here — the S11 partition cannot exist without `extend`):

- the frontmatter field, with the absent ⇒ `replace` semantics above;
- **minimal validation** in `method.ts` — an optional `override-mode?: 'replace' | 'extend'` enum mirroring the
  existing optional `related?` field, erroring on an out-of-enum value, with a unit test. Self-contained: touches
  no other method file and not the neutrality check;
- documentation — a "How overrides work" paragraph in the methods README, and alignment in `DEV-RULES.ARC`
  § Method and extension loading, `strategy-configurability-architecture` § Method Overrides, and
  `strategy-session-operations` § Method and Extension Loading.

**Intentionally deferred → `customization-arch-realign`** (see Scope boundary). The symmetric, principled
treatment — making `override-mode` a present-everywhere field aligned with `override-active`, the
package-neutrality gate barring `extend` from package source, and the which-mechanism decision-tree codification —
rides that WU, which already plans to add a second per-method frontmatter axis (the `active:` flag) and enforce it
in the parser, so the symmetric version lands there at near-zero marginal cost. The concern is already **captured
downstream** in that WU's Inbound Buffer (routed at this WU's planning init, sharpened at create-spec).
_(Further coordination: `composable-workflows` to keep override resolution machine-resolvable for
resolve-then-load.)_

### S7 — Agnosticism principles the apparatus codifies

The general answer to "make these methods properly agnostic and general":

1. **Contract is agnostic; default is opinionated-but-overridable.** The contract states the invariant; the
   default states ARC's recommended answer; the override substitutes or extends.
2. **Name methods by the _question_, not ARC's _answer_** (where the answer is a contested choice) — e.g.
   `test-sequencing` over `test-first`.
3. **Additive override (`extend`)** — add project rules without discarding the universal baseline (S6).
4. **Self-gating contracts** — an always-loaded method stays inert when irrelevant (S2).

### S8 — Class Light; the rename is deferred and routed

The cleanest application of S7.2 renames `test-first` → `test-sequencing` / `test-timing`, but that touches every
method-reference site across both copies and is the swing factor between Light and Heavy. **Keep the `test-first`
name in this WU**; achieve agnostic _behavior_ via the override model plus a sharpened, explicitly-agnostic
contract (default leans TDD, overridable). This keeps the WU **Light**.

The rename is deferred for a sharper reason than scale alone: this WU establishes the **approach-keyword /
method-name decoupling** (S10), and that seam is the prerequisite that lets the rename be a clean mechanical pass
touching **method-name sites only**, leaving the `test-first` approach-keyword markers untouched. Doing the
rename here would edit while the two senses of `test-first` are still entangled — a conflation hazard. **Owning
follow-up: routed to `naming-conventions`** (`doc-conventions` cohort), sequenced **after** this WU ships.

### S9 — Enforcement half routed out (secondary, separate concern)

The originating capture's mechanical-guard idea (an E2E-coverage requirement for destructive verbs; a lint
flagging integration tests that assert on core call-args instead of CLI-seam outcomes) is **secondary** to making
the standard actually-read, and is a separate concern. _(Routed to `quality-gate-hooks`.)_

### S10 — The task-list marker: sequencing keyword, decoupled, method-gated

The marker is a **sequencing-decision record**, not an execution-discipline signal:

- **Form.** A single, standardized, backticked `test-first` token — scannable in raw markdown, the established
  shape. (A bold `**Test-first:**` label was the considered alternative; the backticked token wins for
  consistency with the established shape. A GitHub-callout shape is rejected: it is block-level, would break the
  inline behavior-list lead-in, and dilutes the interlock admonitions.)
- **Semantics.** Presence = "tests-first for this increment"; **absence = baseline** (test-after or no-test,
  disambiguated at execution by the test-touch gate, S2). One marker only — mark the exception, not the baseline;
  no separate "no-test" marker.
- **Decoupled from the method name.** The token is a **stable approach keyword** (testing vocabulary), not a
  reference to the `test-first` _method file_. The convention states this explicitly, so the eventual rename (S8)
  touches method-name sites only and has **zero marker blast radius**. The RGR gloss is removed — the marker no
  longer signals red-green-refactor discipline (RGR moves to `testing-standards`).
- **Gated by the overridable method.** The marker is the _rendering of the sequencing method's decision_ at
  `generate-tasks`, **not** an unconditional ARC structural feature. A team that overrides the sequencing policy
  (S6) emits different decisions, so an agent following ARC does not stamp test-first markers against a team's
  test-after policy. `strategy-task-list-formatting` § Test-First Task Structure and `template-tasks` reframe the
  marker as method-gated; ARC keeps its opinionated test-first-leaning default (S7.1) — overridable, not
  mandated.
- **Activation reliability lives in the loop, not the marker** — see S2's two-gate wiring.

Rejected: **method-referencing** the marker at `testing-standards` (re-couples the planning/execution seam S3
cut, and is redundant with the self-gating method); a **generic "governed-work" marker** (loses sequencing
specificity, and serves exactly one method today — YAGNI).

### S11 — The universal / project content partition

**Discriminator: agnostic vs. stack-specific.** A rule is universal-default if a pytest / Go project could adopt
the line verbatim; it is project-override if it names a specific tool / API / codebase structure (`vi.fn()`,
`execFile`, `IOContext`, the handler-seam). The universal default is still allowed to be _opinionated_ (S7.1) —
leaning TDD is fine; it ships because it is agnostic and `extend`-overridable, not because it is uncontroversial.

**The line often runs _through_ a rule, not between rules** — principle-universal, instantiation-project. "Mock
at boundaries" (universal) + "our boundaries are `execFile` / `fs` / npm-registry" (project); "group 4+ deps into
a context object" (universal) + "our `IOContext{fs,git}`" (project). `override-mode: extend` (S6) is the
mechanism: the default states the principle, the override appends the instantiation.

**Universal default — the lean, enriched set** (each line an antidote to the #1 failure):

- Test observable behavior through public interfaces; don't assert on implementation — including **don't assert
  on spy / call args as the outcome** (that verifies wiring, not behavior).
- **Keep mocked boundaries faithful** — a stub returning what the real dependency never would (including
  success-shaped where it would error) passes against a fiction; cover response-dependent behavior at a tier that
  runs the real thing.
- **See it fail first** — a test that has never failed may assert nothing.
- **One behavior at a time; don't batch all tests upfront** (the surviving RGR insight — bulk tests test imagined
  behavior).
- **Mock at boundaries; never mock internals** — if that is hard, the interface is wrong, not the test.
- **Design for testability** — inject dependencies; separate computation from I/O.
- **Cover error and boundary paths**, not just the happy path.
- **Meaningful assertions over coverage targets.**

The first two lines (spy-args + fidelity) are the direct antidotes to the originating defect, and are precisely
the operational rules the source strategy lacked.

**Project override** (`extend`; stack-specific):

- The concrete boundary list — `execFile` / git, `fs`, npm-registry, time.
- Vitest mock mechanics — `resetAllMocks` over `clearAllMocks`, hoisted `vi.fn()`, per-test re-establishment
  (e.g. a single `resetMockDefaults()` helper).
- Dependency-injection instantiation — `execFile` / `fs` injection, the `IOContext{fs,git}` pattern.
- The **CLI handler-seam + destructive-verb real-CLI-E2E discipline** — net-new content authored from the
  originating defect (integration must drive verb cores via CLI-generated inputs; destructive verbs require
  real-CLI E2E coverage), not relocated from the strategy.
- Project fixture / file-naming specifics (`__tests__/fixtures/`, mirror-source test paths).

**Trimmed as table-stakes** (don't earn keep in an every-session method; elaboration relocates to the strategy
deep-dive per S4, only universally-known content leaves entirely): the rote RED / GREEN / REFACTOR diagram (keep
only the one-behavior insight); "small interfaces, deep implementations" (general design, not testing); a
standalone test-naming rule (fold into behavior-not-implementation); "tests are documentation" / "suite < 30s";
"don't unit-test your dependencies" (trim to a clause under mock-at-boundaries).

**Not `testing-standards` content at all** (recorded so this content is not re-imported — keeps the method
non-overlapping):

1. The TDD / sequencing **decision tree** → the `test-first` / sequencing method, consumed at `generate-tasks`
   (S3).
2. **Tier definitions + "what lives here"** → the strategy deep-dive (S4); the method carries at most a one-line
   "respect your tier boundaries," never the map.
3. **Tier commands** (`npm run test:unit`, etc.) → `quality-gate-commands`.

## Scope boundary (No-gos)

- **The `test-first` → `test-sequencing` rename** — out; routed to `naming-conventions` (S8), sequenced after
  this WU ships. This WU keeps the `test-first` name and achieves agnostic behavior via the override model.
- **Mechanical enforcement** — out; the destructive-verb E2E gate and the call-args-vs-seam lint route to
  `quality-gate-hooks` (S9). This WU makes the standard _read_, not _enforced_.
- **`test-first` ↔ `testing-standards` consolidation** into one method with two contracts — out; long-horizon,
  kept separate here to preserve single responsibility and avoid the marker blast radius. Best revisited _after_
  the S8 rename, once both are cleanly question-named.
- **The symmetric / principled `override-mode` treatment** — out; intentionally deferred to
  `customization-arch-realign` (captured in its Inbound Buffer): a present-everywhere field aligned with
  `override-active`, the package-neutrality gate barring `extend` from package source, and the which-mechanism
  decision-tree codification. This WU ships only the minimal optional field (absent ⇒ `replace`) plus its enum
  validation (S6).
- **A code-merge override mechanism** — out; `override-mode` is a contract + frontmatter + agent-interpreted
  disposition, never a programmatic merge of method content.
- **Changing ARC's default sequencing stance** — out; the shipped default stays test-first-leaning (S7.1, S10),
  now overridable rather than mandated.

## Consequences & Risks

- **Two-copy edits.** Every framework-file touch lands in both `packages/arc-framework/arc/**` (source) and
  `.arc/**` (instance). Accepted cost of the two-copy architecture; package-project sync discipline and the
  sync pre-commit hooks are the mitigation.
- **`override-mode` consumer tolerance — checked at spec time, retired as a risk.** All method-frontmatter
  consumers are permissive or presence-only (S6), so the new optional field is accepted with no forced code work.
  This WU adds only minimal enum validation in `method.ts`; the symmetric treatment and its neutrality gate are
  intentionally deferred to `customization-arch-realign`.
- **Temporary name / intent mismatch.** Keeping the `test-first` name means the method name lags its agnostic
  intent until `naming-conventions` ships. Accepted — the decoupling (S10) makes that later rename clean and
  low-blast-radius, which is worth more than renaming under entanglement now.
- **Drift surface shrinks.** Ceding operational rules to the methods by reference (S4) removes the duplicated
  decision tree and RGR loop, so a future `knowledge-lint` polices only a thin reference seam — a net reduction
  in drift exposure.
- **Coordination is non-gating.** `customization-arch-realign` carries the deferred symmetric `override-mode`
  treatment (in its Inbound Buffer); notes are also routed to `composable-workflows`, `rules-restructure`,
  `quality-gate-hooks`, and `naming-conventions`. No blocking dependencies — this WU ships independently.

## Success Criteria

- A `testing-standards` method exists in both copies, declared in `process-task-loop` frontmatter, self-gating
  (inert on no-test tasks), with a universal default and an `extend` project override matching the S11 partition.
- `process-task-loop`'s body carries two per-task gates: the marker-keyed RGR gate (repointed to
  `testing-standards`) and a new test-touch-keyed discipline gate that fires on every test-touching task
  regardless of marker.
- `test-first` no longer appears in `process-task-loop` frontmatter; its decision tree is declared in
  `generate-tasks` only; the RGR discipline now lives in `testing-standards`.
- The method contract supports an optional `override-mode: replace | extend` (absent ⇒ `replace`), validated by
  `method.ts` (out-of-enum values error) with a unit test, and documented in the methods README and aligned in
  `DEV-RULES.ARC` § Method and extension loading, `strategy-configurability-architecture`, and
  `strategy-session-operations`. `testing-standards`'s `.arc/` copy declares `override-mode: extend`; package
  source omits the field.
- `strategy-testing-methodology` no longer restates the TDD decision tree or the RGR loop; it references the
  operational rules in the methods and retains the deep-dive (rationale, tier-map, worked examples, relocated
  table-stakes).
- `DEV-RULES.PROJECT` § Testing remains a thin pointer to the method and strategy (not fattened).
- The marker convention in `strategy-task-list-formatting` § Test-First Task Structure and `template-tasks` is
  reframed as method-gated and keyword-decoupled from the method name, with the RGR gloss removed; the marker is a
  single backticked `test-first` token.
- No duplicated TDD decision tree or RGR loop remains across the method and strategy; the partition is
  non-overlapping (decision tree → `generate-tasks` method; tier definitions → strategy; tier commands →
  `quality-gate-commands`).
- The two originating-defect antidotes — "don't assert on spy / call args as the outcome" and "keep mocked
  boundaries faithful" — appear verbatim in the universal default.

## Open items

- **Exact relocation targets within `strategy-testing-methodology` (S11).** Where the trimmed table-stakes
  elaboration lands within the recharter — minor placement, resolved during the strategy edit, not a design
  question.
