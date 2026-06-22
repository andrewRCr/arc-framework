# Draft: testing-guidance-apparatus

- **Origin:** [internal] — `decompose-matrix` Phase 5 teardown investigation (2026-06-21) surfaced a
  testing-compliance gap; captured to `USER-INBOX`, then reframed in `arc-session` design discussion (2026-06-22)
  from a mechanical-hook ask into a methodology fix.
- **Purpose:** Rationalize the project's testing-guidance apparatus so the operational standard is _actually read_
  at the moment tests are written — by splitting the canonical strategy into thin, execution-loaded operational
  layers with clean, non-overlapping charters, and adding the method-override capability that the split needs.

---

## Problem / Motivation

The project has a solid `strategy-testing-methodology`, but strategies are **canonical and comprehensive by
design**, so they are not eagerly loaded. Task lists sometimes link the strategy, but it is seldom actually read
during implementation. The result is a recurring failure mode — the **#1 testing failure: tests that pass but do
not meaningfully exercise the code** (over-mocking, mocking internals, asserting on implementation rather than
observable behavior).

Concrete trigger: the `decompose@planning` / `park@Planning` self-teardown defect shipped uncaught because the
integration tests called the verb cores with hand-fed inputs the CLI never generates, and there is no E2E tier
driving the destructive verbs through the real CLI — both contraventions of the written standard that nothing
enforced or surfaced at the right moment.

Two structural problems compound it:

1. **No execution-time home for the operational standard.** The standard lives only in a comprehensive strategy
   that loads on no schedule. We want a project-specific operational layer that loads when (and only when) a
   session writes tests — without shipping our standards to adopters as content, and without overlap with
   already-loaded surfaces (`process-task-loop`, DEV-RULES, the test-first method).
2. **The apparatus is internally confused.** `test-first` conflates a _planning-time decision_ (whether tests
   come first/after/none) with an _execution-time discipline_ (red-green-refactor), and `strategy-testing-
   methodology` is roughly 60% recap / overlap (a duplicated TDD decision tree, a duplicated RGR loop, orientation
   that adds little operationally). The genuinely load-bearing content — **mocking discipline and design for
   testability** — is buried in that mass.

## Design Decisions — Settled

Each decision below was worked (with its alternative) in the originating discussion and is treated as settled
input for create-spec; revisable, but not re-litigated without cause.

### S1 — Home is a method, not a domain rule

Testing standards route to an **execution-loaded method**, not a `DOMAIN-RULES.TESTING` domain rule. Domain rules
earn their conditional-load machinery when a domain is genuinely _occasional_ (frontend in a mostly-backend repo);
testing is _near-universal_ (nearly every code-execution session writes tests), so paying for conditional loading
of something almost always relevant is the over-engineered quadrant. The method path (declared in
`process-task-loop` frontmatter) gives "loaded every execution session" today, with `quality-gate-commands` —
a method whose content is wholly project-specific — as the direct precedent. _(Coordination routed to
`rules-restructure`: drop `testing` from its candidate default-domain inventory.)_

### S2 — New `testing-standards` method (execution-time)

A new method, sibling to `test-first`, declared in `process-task-loop` frontmatter, **self-gating** ("_when this
task writes or modifies tests, apply…_") so it is inert on doc-only / no-test tasks. Its content splits into a
shipped universal default and an `extend` project override — the exact partition and the line-drawing rule are
S11:

- **Universal default** (ships to adopters; technology-agnostic): a lean, high-signal set where every line is an
  antidote to the #1 failure. Full set in S11.
- **Project override** (`extend`; our stack-specific instantiation): the concrete boundary list, vitest mock
  mechanics, dependency-injection / `IOContext` pattern, and the net-new CLI handler-seam + destructive-verb
  real-CLI-E2E discipline. Full set in S11.

**Loop wiring (two gates).** `testing-standards` is declared in `process-task-loop` frontmatter (loaded every
execution session), and `process-task-loop`'s body carries **two** per-task gates. Today it has only the first —
that is the gap that let the originating defect through (the only test-aware checkpoint keys on the marker, which
test-after tasks don't carry):

1. **Marker-keyed (sequencing / RGR).** The existing "Test-first execution" bullet repoints from `test-first` to
   `testing-standards`; fires on marker presence, drives the red-green-refactor vertical slices.
2. **Test-touch-keyed (discipline) — new.** Before implementing, _if the task writes or modifies tests_, apply
   `testing-standards`' mocking / assertion discipline. Fires on **every** test-touching task regardless of
   marker, so test-after tasks are covered — the case the current marker-only checkpoint misses.

### S3 — `test-first` resplit along the planning/execution seam

`test-first` currently does two jobs at two times (verified in the wiring): the **decision tree** is consumed at
`generate-tasks` (planning) to structure tasks + place the marker; the **red-green-refactor discipline** is
consumed at `process-task-loop` (execution). Resplit along that seam:

- The **decision tree** stays a planning-time method, declared in `generate-tasks` **only**.
- The **RGR discipline** moves into `testing-standards` (execution).
- `test-first` therefore **drops out of `process-task-loop` frontmatter** — it has no execution-time role left.

### S4 — Strategy recharter (keep, don't delete)

`strategy-testing-methodology` survives as the **canonical deep-dive**: rationale ("why mock bleed produces
order-dependent failures…"), the tier-map, worked examples — the "understand our whole testing approach in one
place" doc. It **cedes the operational rules to the methods by reference** instead of restating them, and
**drops** the duplicated TDD decision tree + RGR loop. It is also the relocation home for content trimmed from
the method as table-stakes (S11). Minimizing literal duplication minimizes drift; the planned `knowledge-lint`
then only polices the thin reference seam (making strategy=deep-dive / method=operational a feature, not a
hazard).

### S5 — DEV-RULES.PROJECT § Testing stays a thin pointer

Do **not** fatten it — moving project testing content into the always-every-session rules doc would reintroduce
exactly the unconditional load we are moving off of. It remains the thin always-loaded pointer to the method +
strategy.

### S6 — Method-override capability: `override-mode: replace | extend`

The "universal default + additive project override" shape (S2) is impossible under today's **replace-only**
override semantics without duplicating the default into the override. Add an override **disposition** flag to the
method contract, completing the code-method analogy:

- `replace` — the override stands alone (no `super()`); current behavior; the default.
- `extend` — the default applies, _then_ the override appends (the `super()`-calling analogue).

Because a method override is **agent-interpreted markdown, not code-merged**, this is primarily a **contract +
frontmatter change**, not a code mechanism: a frontmatter field, a paragraph in the methods README ("How
overrides work"), and alignment in DEV-RULES.ARC § Method and extension loading, `strategy-configurability-
architecture` § Method Overrides, and `strategy-session-operations` § Method and Extension Loading.

**Ride as this WU's first task** (motivated and consumed here — the S11 partition can't exist without `extend`).
The one code touch to verify is that the existing `override-active` consumers (CI audit / docs-gen / authoring
tooling) do not choke on the new field. If that verification turns up real code work rather than a tolerated new
field, split a tiny `method-override-modes` mechanism WU then (the "first wiring smuggles in foundational infra"
guard) — verify-then-decide; default is ride. _(Coordination routed to `customization-arch-realign` — new compose
axis for its principled model — and `composable-workflows` — design it machine-resolvable for resolve-then-load.)_

### S7 — Agnosticism principles the apparatus codifies

The general answer to "make these methods properly agnostic and general":

1. **Contract is agnostic; default is opinionated-but-overridable.** The contract states the invariant; the
   default states ARC's recommended answer; the override substitutes or extends.
2. **Name methods by the _question_, not ARC's _answer_** (where the answer is a contested choice) — e.g.
   `test-sequencing` (question) over `test-first` (one answer).
3. **Additive override (`extend`)** — add project rules without discarding the universal baseline (S6).
4. **Self-gating contracts** — an always-loaded method stays inert when irrelevant (S2).

### S8 — Class Light; rename deferred and routed

The cleanest application of principle S7.2 renames `test-first` → `test-sequencing`/`test-timing`, but that
touches every method-reference site across both copies and is the swing factor between Light and Heavy. **Keep
the `test-first` name in this WU**; achieve agnostic _behavior_ via the override model + a sharpened
explicitly-agnostic contract (default leans TDD, overridable). This keeps the WU **Light**.

The rename is deferred for a sharper reason than scale alone: this WU establishes the **approach-keyword /
method-name decoupling** (S10), and that seam is the prerequisite that lets the rename be a clean mechanical pass
touching **method-name sites only**, leaving the `test-first` approach-keyword markers untouched. Doing the rename
here would edit while the two senses of `test-first` are still entangled — a conflation hazard. **Owning
follow-up: routed to the `naming-conventions` WU** (`doc-conventions` cohort) — a naming + reference-cascade with
no behavioral change, exactly that WU's character — sequenced **after** this WU ships.

### S9 — Enforcement half routed out (defense-in-depth, secondary)

The originating capture's mechanical-guard idea (E2E-coverage requirement for destructive verbs; a lint flagging
integration tests that assert on core call-args instead of CLI-seam outcomes) is **secondary** to making the
standard actually-read, and is a separate concern. _(Routed to `quality-gate-hooks`.)_

### S10 — The task-list marker: sequencing keyword, decoupled, method-gated

The marker is a **sequencing-decision record**, not an execution-discipline signal:

- **Form.** Keep a single, standardized, backticked `test-first` token — scannable in raw markdown, the
  established shape. The exact glyph (backticked token vs. a bold `**Test-first:**` label) is a spec-time
  finalization; the backticked token is the recommended default. A GitHub-callout shape (`[!NOTE]`-style) is
  rejected — it is block-level and would break the inline behavior-list lead-in, and it dilutes the interlock
  admonitions.
- **Semantics.** Presence = "tests-first for this increment"; **absence = baseline** (test-after or no-test,
  disambiguated at execution by the test-touch gate, S2). One marker only — mark the exception, not the
  baseline; no separate "no-test" marker (it would only noise the baseline).
- **Decoupled from the method name.** The token is a **stable approach keyword** (testing vocabulary), not a
  reference to the `test-first` _method file_. The convention states this explicitly, so the eventual rename
  (S8) touches method-name sites only and has **zero marker blast radius**. The RGR gloss is removed — the
  marker no longer "signals red-green-refactor discipline" (RGR moves to `testing-standards`, S2/S3).
- **Gated by the overridable method.** The marker is the _rendering of the sequencing method's decision_ at
  generate-tasks — **not** an unconditional ARC structural feature. A team that overrides the sequencing policy
  (S6) emits different decisions, so an agent following ARC does not stamp test-first markers against a team's
  test-after policy. `strategy-task-list-formatting` § Test-First Task Structure and `template-tasks` reframe the
  marker as method-gated; ARC keeps its opinionated test-first-leaning default (S7.1) — overridable, not
  mandated.
- **Activation reliability lives in the loop, not the marker** — see S2's two-gate wiring.

Rejected: **method-referencing** the marker at `testing-standards` (re-couples the planning/execution seam S3
cut, and is redundant with the self-gating method); a **generic "governed-work" marker** (loses the sequencing
specificity, and serves exactly one method today — YAGNI).

### S11 — The universal/project content partition

**Discriminator: agnostic vs. stack-specific** (not "uncontroversial vs. our specifics" — that conflated two
axes). A rule is universal-default if a pytest/Go project could adopt the line verbatim; it is project-override if
it names a specific tool/API/codebase structure (`vi.fn()`, `execFile`, `IOContext`, the handler-seam). The
universal default is still allowed to be _opinionated_ (S7.1) — leaning TDD is fine; it ships because it's
agnostic and `extend`-overridable, not because it's uncontroversial.

**The line often runs _through_ a rule, not between rules** — principle-universal, instantiation-project. "Mock
at boundaries" (universal) + "our boundaries are `execFile`/`fs`/npm-registry" (project); "group 4+ deps into a
context object" (universal) + "our `IOContext{fs,git}`" (project). `override-mode: extend` (S6) is the mechanism:
default states the principle, override appends the instantiation.

**Universal default — the lean, enriched set** (each line an antidote; old sprawl trimmed):

- Test observable behavior through public interfaces; don't assert on implementation — incl. **don't assert on
  spy/call args as the outcome** (verifies wiring, not behavior).
- **Keep mocked boundaries faithful** — a stub returning what the real dependency never would (incl.
  success-shaped where it would error) passes against a fiction; cover response-dependent behavior at a tier that
  runs the real thing.
- **See it fail first** — a test that's never failed may assert nothing.
- **One behavior at a time; don't batch all tests upfront** (the surviving RGR insight — bulk tests test imagined
  behavior).
- **Mock at boundaries; never mock internals** — if that's hard, the interface is wrong, not the test.
- **Design for testability** — inject dependencies; separate computation from I/O.
- **Cover error and boundary paths**, not just the happy path.
- **Meaningful assertions over coverage targets.**

The first two lines (spy-args + fidelity) are the direct antidotes to the originating git-mock defect, and are
precisely the operational rules the source strategy lacked.

**Project override** (`extend`; stack-specific):

- The concrete boundary list — `execFile`/git, `fs`, npm-registry, time.
- Vitest mock mechanics — `resetAllMocks` over `clearAllMocks`, hoisted `vi.fn()`, per-test re-establishment
  (e.g. a single `resetMockDefaults()` helper).
- Dependency-injection instantiation — `execFile`/`fs` injection, the `IOContext{fs,git}` pattern.
- The **CLI handler-seam + destructive-verb real-CLI-E2E discipline** — net-new content, authored from the
  originating defect (integration must drive verb cores via CLI-generated inputs; destructive verbs require
  real-CLI E2E coverage), not relocated from the strategy.
- Project fixture/file-naming specifics (`__tests__/fixtures/`, mirror-source test paths).

**Trimmed as table-stakes** (don't earn keep in an every-session method): the rote RED/GREEN/REFACTOR diagram
(keep only the one-behavior insight); "small interfaces, deep implementations" (general design, not testing); a
standalone test-naming rule (fold into behavior-not-implementation); "tests are documentation" / "suite < 30s";
"don't unit-test your dependencies" (trim to a clause under mock-at-boundaries). Cut-from-method ≠ deleted —
elaboration relocates to the strategy deep-dive (S4); only universally-known content leaves entirely.

**Not `testing-standards` content at all** (record so create-spec doesn't re-import — keeps the method
non-overlapping):

1. The TDD/sequencing **decision tree** → the `test-first`/sequencing method, consumed at generate-tasks (S3).
2. **Tier definitions + "what lives here"** → the strategy deep-dive (S4); the method carries at most a one-line
   "respect your tier boundaries," never the map.
3. **Tier commands** (`npm run test:unit`) → `quality-gate-commands`.

## Out of Scope (this WU)

A crisp scope boundary for create-spec — each item is settled-as-deferred, not unresolved:

- **The `test-first` → `test-sequencing` rename** — routed to `naming-conventions` (S8); after this WU ships.
- **Mechanical enforcement** (destructive-verb E2E gate, call-args-vs-seam lint) — routed to `quality-gate-hooks`
  (S9).
- **`test-first` ↔ `testing-standards` consolidation** into one method with two contracts — long-horizon; kept
  separate here to preserve single responsibility and avoid the marker blast radius. Best revisited _after_ the
  S8 rename, once both are cleanly question-named.

## Scope & Coordination

Class **Light**; **Priority `P2`** (raised from the scaffolded `P3` — the failure mode is the #1 testing failure,
it has already shipped a live defect, and the WU is cheap to clear). Bounded but multi-surface, **two copies**
(`packages/arc-framework/arc/**` source + `.arc/**` instance) for every framework-file edit:

- New `testing-standards` method (both copies); declare in `process-task-loop` frontmatter; wire the two
  per-task loop gates (repoint the marker-keyed RGR bullet to `testing-standards`; add the new test-touch-keyed
  discipline gate) — S2.
- `test-first` resplit: method content (RGR out, contract sharpened); `generate-tasks` / `process-task-loop`
  frontmatter + body — S3.
- `strategy-testing-methodology` recharter (cede operational rules by reference; drop the duplicated tree + loop;
  absorb the relocated table-stakes elaboration) — S4.
- `override-mode` capability: method frontmatter + methods README + 3 deeper-model docs + `override-active`
  consumer check — S6.
- Marker convention (per S10): `strategy-task-list-formatting` § Test-First Task Structure + `template-tasks` —
  reframe the marker as method-gated (overridable), keyword-decoupled from the method name, RGR gloss removed.
- DEV-RULES.PROJECT § Testing pointer touch-up — S5.

**Coordination (non-gating; notes already routed):** `customization-arch-realign` (override-mode axis),
`composable-workflows` (machine-resolvable resolution), `rules-restructure` (testing-as-method), `quality-gate-
hooks` (enforcement half), `naming-conventions` (the deferred `test-first` rename — S8, routed to its Inbound
Buffer). No blocking dependencies.

**Effort estimate:** Medium (days–week).
