# Task List: testing-guidance-apparatus

- **Design:** `spec-testing-guidance-apparatus.md`

---

## **Phase 1:** `override-mode` method-contract capability

_Purpose:_ Add the `override-mode: replace | extend` disposition to the method contract — the enabling
mechanism the content partition needs, since an additive (`extend`) override is impossible under today's
replace-only semantics without duplicating the default into the override. Lands first so the `testing-standards`
method (Phase 2) can declare `override-mode: extend`.

_Design decisions:_ The field is optional, absent ⇒ `replace`; only `method.ts` enum validation ships here
(every frontmatter consumer already tolerates an unknown key, verified at spec time); the symmetric
present-everywhere treatment and its package-neutrality gate are deferred to a sibling work unit. (Satisfies S6.)

### `[x]` **1.1 Add optional `override-mode` enum validation to `method.ts`**

- _Goal:_ The method-frontmatter parser accepts an optional `override-mode` of `replace` or `extend`, surfaces
  it on the parsed result, and errors on any out-of-enum value.

- _Outcome:_ Mirrored the optional `related?` field in `method.ts` — `"override-mode"?: "replace" | "extend"`
  on `MethodFrontmatter`, a presence-guarded enum check, and conditional assignment. Absent stays `undefined`
  (no defaulting); the absent ⇒ `replace` semantics live in the contract/docs, not the parser. Four cases added
  to `method.test.ts`.

### `[x]` **1.2 Document the `override-mode` contract across the alignment sites**

- _Goal:_ A reader learns that `extend` exists, what it does, and that absent means `replace`, consistently
  everywhere method-override semantics are described.

    - `[x]` **1.2.a Extend the methods README "How overrides work" paragraph** (both copies)
        - Added a paragraph stating both dispositions: `replace` (the default; absent ⇒ this) stands alone;
          `extend` applies `.default` first, then appends the override.

    - `[x]` **1.2.b Align `DEV-RULES.ARC` § Method and extension loading** (both copies)
        - Added the disposition + absent ⇒ `replace` default to the agent-compliance rule.

    - `[x]` **1.2.c Align `strategy-configurability-architecture` § Method Overrides** (both copies)
        - Reworked § Mechanism to describe `extend` alongside the replace-only model.

    - `[x]` **1.2.d Align `strategy-session-operations` § Method and Extension Loading** (both copies)
        - Added `override-mode` to the method schema block and a field-semantics bullet.

## **Phase 2:** `testing-standards` execution-time method

_Purpose:_ Author the new execution-loaded method (both copies) that gives the operational testing standard a
home which loads exactly when — and only when — a session writes tests, without shipping project-specific
standards to adopters as content. The universal default ships agnostic-but-opinionated; the `.arc/` copy adds the
stack-specific instantiation via `override-mode: extend`.

_Design decisions:_ Self-gating contract (inert on doc-only / no-test tasks); the two originating-defect
antidotes appear verbatim in the universal default; package source omits `override-mode` (neutral by omission),
the `.arc/` copy declares `extend`. (Satisfies S2, S7, S11.)

### `[x]` **2.1 Author the `testing-standards` method (both copies)**

- _Goal:_ A `testing-standards.md` method exists in both copies — a self-gating contract, the universal-default
  rule set as `.default`, and (in the `.arc/` copy only) the project partition as an `extend` override.

    - `[x]` **2.1.a Write the contract + universal `.default`** (both copies, identical body)
        - Self-gating contract + the eight-line universal set (the two verbatim antidotes — spy-args and
          boundary-fidelity — lead). `related: [test-first]` declared in both copies.

    - `[x]` **2.1.b Populate the `.arc/` copy's `extend` override** with the project partition
        - `.arc/` copy declares `override-mode: extend` + `override-active: true` with the stack-specific body
          (boundary list, Vitest mock mechanics, DI/`IOContext`, the net-new CLI handler-seam +
          destructive-verb real-CLI-E2E discipline, fixtures). Package source stays neutral — empty `.override`,
          `override-active: false`, no `override-mode`.

    - `[x]` **2.1.c Register `testing-standards` in the methods README** (both copies)
        - Index entry added; symmetric `testing-standards` ↔ `test-first` rows added to the Method Dependencies
          table.

- _Outcome:_ The method exists but is not yet referenced by any workflow's `arc.methods` — the trigger audit
  (`lint:arc:triggers`, CI-only) flags it until Task 3.1 wires it into `process-task-loop` frontmatter. Expected
  transient from the author-then-wire phase split; pre-commit does not run the audit.

## **Phase 3:** Two-gate loop wiring & `test-first` resplit

_Purpose:_ Wire `testing-standards` into the execution loop with two per-task gates — closing the gap that let
the originating defect through (the only test-aware checkpoint keyed on the marker, which test-after tasks don't
carry) — and resplit `test-first` along the planning/execution seam so each method does one job at one time.

_Design decisions:_ `process-task-loop` edits land in both the `.arc/` plain copy and the package
`.template.md` variant; `test-first` drops from `process-task-loop` frontmatter and stays declared in
`generate-tasks` only. (Satisfies S2, S3.)

### `[x]` **3.1 Wire the two per-task gates into `process-task-loop`** (both copies)

- _Goal:_ The loop body carries two test gates — the marker-keyed sequencing/RGR gate repointed to
  `testing-standards`, and a new test-touch-keyed discipline gate that fires on every test-touching task
  regardless of marker.

- _Outcome:_ Marker-keyed "Test-first execution" bullet repointed to `testing-standards`; new "Testing
  discipline" gate added (fires before implementing on any test-touching task, marker or not); frontmatter
  `arc.methods` swapped `test-first` → `testing-standards`; `[arc-methods-tf]` link ref replaced with
  `[arc-methods-ts]`; the strategy-consult pointer folded into the new gate. Both copies edited (the package
  `.template.md` keeps its `team.mode` conditionals). Resolves the Phase 2 trigger-audit transient —
  `lint:arc:triggers` now green.

### `[x]` **3.2 Resplit the `test-first` method along the planning/execution seam** (both copies)

- _Goal:_ `test-first` carries only the planning-time decision tree under a sharpened, explicitly-agnostic
  contract; the red-green-refactor execution discipline is gone (now owned by `testing-standards`).

- _Outcome:_ Removed the RGR / execution-discipline paragraph; kept the decision tree and sharpened the contract
  to an explicit agnostic invariant (the test-first lean stays in `.default`). Re-homed the preamble
  Workflow/When from `process-task-loop` to `generate-tasks` (its sole remaining consumer) and added the
  reciprocal `related: [testing-standards]`. `test-first` confirmed declared in `generate-tasks` frontmatter
  only; trigger audit green.

## **Phase 4:** Strategy recharter, marker convention & rules pointer

_Purpose:_ Realign the surrounding documentation so the apparatus is non-overlapping — the strategy becomes the
canonical deep-dive ceding operational rules by reference, the task-list marker is reframed as method-gated and
keyword-decoupled, and the project rules pointer stays thin (not refattened with the load this work is moving
off of).

_Design decisions:_ No duplicated decision tree or RGR loop survives across method and strategy; the marker
stays a single backticked `test-first` token. (Satisfies S4, S5, S10.)

### `[x]` **4.1 Recharter `strategy-testing-methodology`** (single copy — project strategy)

- _Goal:_ The strategy reads as the canonical deep-dive — rationale, the tier-map, worked examples — and cedes
  the operational rules to the methods by reference rather than restating them.

- _Outcome:_ Reframed the intro to a deep-dive that cedes operational rules to `test-first` / `testing-standards`
  by reference. Recast the normative TDD decision tree into illustrative "Test-First Decisions in This Codebase"
  worked examples; dropped the rote red-green-refactor loop (its "why vertical" rationale folded into Philosophy,
  mechanics referenced). Slimmed § Mocking Rules to rationale (boundary fidelity, design-for-testability,
  mock-bleed → order-dependent failures), with the concrete boundary list + Vitest mechanics ceded to the
  method; retained "small interfaces, deep implementations" (received table-stakes). Dropped the Key Principles
  Summary (duplicated method defaults). Kept Test Tiers / Test Naming / Quality Gates verbatim. Added
  reference-style links to the two methods + `process-task-loop`.

### `[x]` **4.2 Reframe the test-first marker convention** (both copies of each surface)

- _Goal:_ The marker is documented as a method-gated sequencing-decision record and a stable approach keyword
  decoupled from the method name, with the red-green-refactor gloss removed.

- _Outcome:_ Reframed `strategy-task-list-formatting` § Test-First Task Structure (both copies): the marker now
  records the sequencing decision made at task generation (presence = tests-first, absence = baseline), is a
  stable keyword decoupled from the method name, and its absence ≠ no testing discipline (the execution
  test-touch gate still applies). Removed "the marker signals red-green-refactor discipline" and the RGR
  cross-reference. `template-tasks` needed no edit — it carries no marker-convention text, only a pointer to the
  strategy (the planning-time "both surfaces" framing was slightly stale; verified against the file). §
  Verification Phase left untouched per its separate captured errand.

### `[ ]` **4.3 Keep `DEV-RULES.PROJECT` § Testing a thin pointer** (single copy)

- _Goal:_ The project testing rule stays a thin, always-loaded pointer to the testing method(s) and strategy —
  not fattened with operational content.

- _Approach:_ Add a pointer to the new `testing-standards` method alongside the existing strategy pointer; add
  no operational rules to the rules doc itself.

## **Phase 5:** Verification

### `[ ]` **5.1 Complete verification** — load and follow [`verify-work-unit.md`][verify-work-unit]

---

## Success Criteria

- `[ ]` A `testing-standards` method exists in both copies, declared in `process-task-loop` frontmatter,
  self-gating (inert on no-test tasks), with a universal default and an `extend` project override matching the
  S11 partition.
- `[ ]` `process-task-loop`'s body carries two per-task gates: the marker-keyed RGR gate (repointed to
  `testing-standards`) and a new test-touch-keyed discipline gate that fires on every test-touching task
  regardless of marker.
- `[ ]` `test-first` no longer appears in `process-task-loop` frontmatter; its decision tree is declared in
  `generate-tasks` only; the RGR discipline now lives in `testing-standards`.
- `[ ]` The method contract supports an optional `override-mode: replace | extend` (absent ⇒ `replace`),
  validated by `method.ts` (out-of-enum values error) with a unit test, and documented in the methods README
  and aligned in `DEV-RULES.ARC`, `strategy-configurability-architecture`, and `strategy-session-operations`.
- `[ ]` `testing-standards`'s `.arc/` copy declares `override-mode: extend`; package source omits the field.
- `[ ]` `strategy-testing-methodology` no longer restates the TDD decision tree or the RGR loop; it references
  the operational rules in the methods and retains the deep-dive (rationale, tier-map, worked examples,
  relocated table-stakes).
- `[ ]` `DEV-RULES.PROJECT` § Testing remains a thin pointer to the method and strategy (not fattened).
- `[ ]` The marker convention in `strategy-task-list-formatting` § Test-First Task Structure and
  `template-tasks` is reframed as method-gated and keyword-decoupled from the method name, with the RGR gloss
  removed; the marker is a single backticked `test-first` token.
- `[ ]` No duplicated TDD decision tree or RGR loop remains across the method and strategy; the partition is
  non-overlapping (decision tree → `generate-tasks` method; tier definitions → strategy; tier commands →
  `quality-gate-commands`).
- `[ ]` The two originating-defect antidotes — "don't assert on spy / call args as the outcome" and "keep mocked
  boundaries faithful" — appear verbatim in the universal default.
- `[ ]` All quality gates pass (tests, linting, type checking).
- `[ ]` Ready for integration.

[verify-work-unit]: ../system/workflows/arc/work-unit-lifecycle/verify-work-unit.md
