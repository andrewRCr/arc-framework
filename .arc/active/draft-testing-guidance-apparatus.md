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
task writes or modifies tests, apply…_") so it is inert on doc-only / no-test tasks:

- **Universal default** (ships to adopters; genuinely uncontroversial): test through public interfaces; mock at
  boundaries / never mock internals; design for testability; red-green-refactor vertical slices; meaningful
  assertions over coverage targets.
- **Project override** (our specifics; the "bitten in practice" bucket): vitest mock mechanics (`resetAllMocks`
  discipline, hoisted `vi.fn()`), `execFile`/`fs` injection, the `IOContext` pattern, the CLI handler-seam and
  destructive-verb discipline.

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
**drops** the duplicated TDD decision tree + RGR loop. Minimizing literal duplication minimizes drift; the
planned `knowledge-lint` then only polices the thin reference seam (making strategy=deep-dive / method=operational
a feature, not a hazard).

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
architecture` § Method Overrides, and `strategy-session-operations` § Method and Extension Loading. The one code
touch to verify is that the existing `override-active` consumers (CI audit / docs-gen / authoring tooling) do not
choke on the new field. _(Coordination routed to `customization-arch-realign` — new compose axis for its
principled model — and `composable-workflows` — design it machine-resolvable for resolve-then-load.)_

### S7 — Agnosticism principles the apparatus codifies

The general answer to "make these methods properly agnostic and general":

1. **Contract is agnostic; default is opinionated-but-overridable.** The contract states the invariant; the
   default states ARC's recommended answer; the override substitutes or extends.
2. **Name methods by the _question_, not ARC's _answer_** (where the answer is a contested choice) — e.g.
   `test-sequencing` (question) over `test-first` (one answer).
3. **Additive override (`extend`)** — add project rules without discarding the universal baseline (S6).
4. **Self-gating contracts** — an always-loaded method stays inert when irrelevant (S2).

### S8 — Class Light; rename deferred

The cleanest application of principle S7.2 renames `test-first` → `test-sequencing`/`test-timing`, but that
touches every method-reference site across both copies and is the swing factor between Light and Heavy. **Keep
the `test-first` name in this WU**; achieve agnostic _behavior_ via the override model + a sharpened
explicitly-agnostic contract (default leans TDD, overridable). The rename is a deferred follow-up. This keeps the
WU **Light**.

### S9 — Enforcement half routed out (defense-in-depth, secondary)

The originating capture's mechanical-guard idea (E2E-coverage requirement for destructive verbs; a lint flagging
integration tests that assert on core call-args instead of CLI-seam outcomes) is **secondary** to making the
standard actually-read, and is a separate concern. _(Routed to `quality-gate-hooks`.)_

## Open Questions

### O1 — The structural task-list marker _(primary open design question)_

`test-first`'s RGR content moving to `testing-standards` reopens what the task-list marker should be. Today it is
`` Build `test-first` (one behavior at a time): ``. Axes, not yet decided:

- **Approach-descriptor** (English "build these test-first") — no method coupling, survives renames, but does not
  actively remind that governing method guidance exists.
- **Method-referencing** ("follow the methods here") — explicit; the "don't couple" reflex applies to _opinionated_
  names, not necessarily a _stable, generic_ one, so coupling to a stable `testing-standards` may be a feature
  (human orientation + agent trigger).
- **Generic "governed work" marker** — means "this increment has governing methods; consult them," decoupled from
  any one name.

Interacts with O2 (rename) and S6 (a marker a future resolver can _parse_ argues for structured coupling, not
English prose). Resolve at spec time.

### O2 — Rename `test-first` → agnostic name

Deferred per S8 (recommended). Confirm: defer (keep Light) vs. do-now (accept Heavy). If deferred, decide the
owning follow-up (its own WU, fold into a naming pass, or `composable-workflows`).

### O3 — `override-mode` ride vs. split

Lean is **ride as this WU's first task** (motivated + consumed here). Verify minimality during implementation: if
the `override-active` CI/docs-gen consumers turn out to need real code work, reconsider splitting a tiny
`method-override-modes` mechanism WU (the "first wiring smuggles in foundational infra" guard).

### O4 — The exact universal/override line

Which specific rules are genuinely universal (default, ships) vs. project (override) — especially across the
mocking + design-for-testability content. Draw the line at spec time (e.g. "mock at boundaries / never mock
internals" universal; "`resetAllMocks` mechanics" project).

### O5 — Priority

Scaffolded `P3`; the recurring cost ("keeps biting") may warrant `P2`. Owner's call.

### O6 — `test-first` consolidation (long-horizon)

Whether the decision method and `testing-standards` eventually merge into one testing method with two contracts.
Deferred — kept separate this WU to preserve `test-first`'s single responsibility and avoid the marker blast
radius.

## Scope & Coordination

Light WU; bounded but multi-surface, **two copies** (`packages/arc-framework/arc/**` source + `.arc/**` instance)
for every framework-file edit:

- New `testing-standards` method (both copies); declare in `process-task-loop` frontmatter.
- `test-first` resplit: method content (RGR out, contract sharpened); `generate-tasks` / `process-task-loop`
  frontmatter + body.
- `strategy-testing-methodology` recharter.
- `override-mode` capability: method frontmatter + methods README + 3 deeper-model docs + `override-active`
  consumer check.
- Marker convention: `strategy-task-list-formatting` § Test-First Task Structure + `template-tasks` — _pending
  O1_.
- DEV-RULES.PROJECT § Testing pointer touch-up.

**Coordination (non-gating; notes already routed):** `customization-arch-realign` (override-mode axis),
`composable-workflows` (machine-resolvable resolution), `rules-restructure` (testing-as-method), `quality-gate-
hooks` (enforcement half). No blocking dependencies.

**Scope estimate:** Medium (days-week).
