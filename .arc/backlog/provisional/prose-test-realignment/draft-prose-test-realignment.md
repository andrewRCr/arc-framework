# Draft: Prose Test Realignment

- **Origin:** `USER-INBOX § Work Unit`, housekeep drain (2026-10-09); captured during `quality-gate-hooks` task
  generation, Pass 3 grounding audit, 2026-10-08.
- **Purpose:** Bring the tests that read ARC's Markdown in line with normal practice: retire wording pins, check prose
  against the CLI, and lint retired terms.

---

## Problem / Motivation

About 190 test files read ARC Markdown from the repository (`packages/arc-framework/arc/**`,
`.arc/system/**`, `.arc/reference/**`) and assert its text, and a single test commonly mixes three kinds of
assertion:

- **The prose names something the CLI owns.** A declared method (`declarations.methods` containing
  `assess-boundary-fit`), a command (`arc delivery compose`), a request field value (`` `coverage: incremental` ``
  in `review-driver-lifecycle.test.ts`). Here the Markdown is an interface to the code, and drift breaks agents.
- **Structure and order.** A heading exists; the review step precedes the publish fallback
  (`prepublication-workflow.test.ts`). Partly a contract (the CLI points at sections, which `lint:arc:section-refs`
  already checks), partly guidance.
- **Guidance wording pinned verbatim.** `softWrappedProse("does not create canonical delivery state")`
  (`generate-tasks-delivery-authoring-contract.test.ts`), `not.toContain("project review coordinator")`. These are
  change-detector tests: they assert hand-written text equals itself, fail on every rewording, and never fail when
  an agent misreads the rule. A helper exists only to keep them alive across rewraps
  (`__tests__/helpers/soft-wrapped-prose.ts`), and no testing standard says what a Markdown-reading test may
  assert, so they keep accruing — often as the proof a review fix landed.

## Normal Practice

For prompts and agent instructions, the behavioral test is an eval plus review; static checks on
prompt text stay structural (template variables, schema, size), and unit-testing prompt wording is not idiomatic.
Banned or retired terms live in one prose-lint term list (Vale's model), not scattered negative assertions.
Machine-consumed prose is checked the way doctests, link checkers, and API-spec drift checks work: one deterministic,
corpus-wide check against the source of truth. The usual reference for the third kind is the Google Testing Blog's
"Change-Detector Tests Considered Harmful" (2015).

## Direction

Assertion by assertion, since one test mixes kinds:

- retire the verbatim wording pins outright;
- replace the hand-pinned CLI literals with one corpus-wide check beside `lint:arc:*`: every `arc` command, flag,
  and field value shipped prose names resolves against the CLI's registered commands and schemas;
- move the retired-term negative assertions into one lint term list;
- decide structure-and-order assertions case by case: keep, as a lint, what a CLI pointer or parser depends on, and
  retire the rest;
- state the rule in `testing-standards` and `strategy-testing-methodology.md` — what a test that reads Markdown may
  assert — so new pins stop accruing.

## Coordination

`workflow-eval-harness` owns the behavioral replacement (whether an agent follows a rule). This work
does not wait on it: the wording pins test no behavior today, so retiring them loses only a weak tripwire against
deleting a rule, which review already covers. The two plans should name each other — rules whose pins retire here are
candidate eval cases there (captured separately for that work unit). `quality-gate-hooks` declares the unit and
integration test checks over the whole tree less planning state, so its declaration needs no change as pins retire;
the CLI-reference checks still read shipped Markdown.

Two `## Errand` captures overlap. "Make the workflow prose pins tolerate a rewrap" invests further in
wording pins; re-triage it against this work at drain rather than running it first. "Run the tests that pin Markdown
when a Markdown-only change touches their text" is absorbed by `quality-gate-hooks` (its test-check inputs).
