# Testing Methodology Strategy

The canonical deep-dive for testing `@arc-framework/cli` — a TypeScript CLI that manages ARC framework
installation, updates, and session portability. It carries the rationale, the tier map, and worked examples for
this codebase: the place to understand the whole testing approach in one read.

The operational rules live in the methods, not here — planning-time test sequencing in [`test-first`][test-first]
and execution-time discipline (assertions, mocking, isolation) in [`testing-standards`][testing-standards]. This
document references them rather than restating them, so each rule has a single home and this stays the deep-dive.

## Philosophy: Pragmatic TDD

Test-first for core logic, test-after for glue code and CLI wiring.

- **Test behavior through public interfaces** — tests verify what a module does, not how it does it internally.
  A test that breaks when you refactor without changing behavior was testing implementation, not behavior.
- **Vertical slices, not horizontal** — one test, make it pass, repeat, rather than all tests then all code.
  Tests written in bulk test *imagined* behavior; tests written one at a time test *actual* behavior, because you
  just wrote the code and know what matters. Horizontal slicing produces tests coupled to API shape rather than
  observable outcomes. The execution mechanics are codified in [`testing-standards`][testing-standards] and driven
  by the loop in [`process-task-loop`][process-task-loop].
- **Test our logic, not our dependencies** — don't test Commander's argument parsing, clack's prompt rendering,
  or git's merge algorithm. Test our code that uses them.
- **Meaningful assertions over coverage targets** — focus on critical paths and complex logic. No hard coverage
  percentage. A well-tested `render.ts` matters more than 80% line coverage across boilerplate.

## Test Tiers

Three tiers matching the directory structure in `packages/arc-framework/__tests__/`:

### Unit (`__tests__/unit/`)

Pure function and module tests. No filesystem, no child processes, no git repos.

**Characteristics:**

- Fast (milliseconds per test), isolated, run on every change
- Import the module directly, call functions, assert on return values
- Mock only at system boundaries (see [Mocking Rules](#mocking-rules))

**What lives here:**

- Template rendering (token substitution, conditional content processing)
- Hash computation
- Manifest schema validation
- Init recipe parsing
- File classification logic
- Identity resolution logic

### Integration (`__tests__/integration/`)

Module interaction tests. May use the filesystem via temporary directories but no external
services.

**Characteristics:**

- Slower than unit (filesystem I/O), but still seconds not minutes
- Test real module interactions — render + write + hash in sequence
- Use temporary directories (cleaned up after each test)

**What lives here:**

- Init flow: recipe + config → rendered files + pristine + manifest
- Update flow: three-way merge results across file sets
- Status/diff accuracy against real file state
- Manifest read/write round-trips
- Session save/load with real git notes
- Skill generation from canonical definitions

### E2E (`__tests__/e2e/`)

Full CLI invocation in temporary git repos. Exercises the complete user-facing path.

**Characteristics:**

- Slowest tier (real git repos, real CLI invocation via `child_process`)
- Test user-visible outcomes: "I ran `arc init`, what exists on disk?"
- Real git repos with real commits — no mocking git

**What lives here:**

- `arc init` in a fresh repo → verify complete installed state
- Init → modify → `arc update` → verify customizations preserved
- Init → `arc health` / `arc diff` → verify output accuracy
- `arc session save/load/push/pull` round-trips
- Round-trip: init → customize → update → verify

## Test-First Decisions in This Codebase

The [`test-first`][test-first] method carries the general decision; these are worked examples of how it lands for
this project's modules — illustrative, not a normative checklist.

**Written test-first** — clear inputs and outputs, no visual or interactive ambiguity, and bugs propagate
silently, so writing the tests first catches design issues early and produces better interfaces:

- Core libraries — render, hash, manifest, recipe, merge wrapper, identity resolution
- Data transformations — any function that takes input and produces transformed output
- Validation logic — manifest schema validation, recipe parsing, config validation
- Business rules — file classification, mode-conditional behavior, conflict detection

**Written test-after** — thin orchestration or framework-driven surfaces, where the logic worth testing lives in
the tested modules underneath:

- CLI command wiring — Commander subcommand registration, option parsing
- Interactive prompts — clack/prompts flow (test the logic the prompts feed, not the rendering)
- Console output formatting — post-init messaging, status display, diff formatting
- Glue code — thin orchestration that sequences already-tested modules

**Not tested** — validated by the compiler or carrying no logic: type declarations (`types.ts`), configuration
files (`tsconfig.json`, `tsup.config.ts`, `vitest.config.ts`), re-exports and barrel files.

## Mocking Rules

[`testing-standards`][testing-standards] carries the operational specifics — the concrete boundary list and the
Vitest mock mechanics. This section keeps the rationale behind them.

**Mock at system boundaries, never internals.** Mock what crosses out of our code — child processes (`git` via
`execFile`), the filesystem, time, the npm-registry check — and use the real thing for everything we own. Don't
mock internal modules: if testing a module against a real collaborator is hard, the interface needs redesign, not
more mocks. And a stub that returns what the real dependency never would passes against a fiction — keep mocked
boundaries faithful, and cover response-dependent behavior at a tier that runs the real dependency.

**Design for testability** is what makes boundary-only mocking possible:

- **Accept dependencies, don't create them** — pass `execFile` or fs functions in rather than importing them, so
  unit testing needs no module-internal mocking.
- **Return results, don't produce side effects** — prefer functions that return a value; when side effects are
  necessary, separate the computation from the I/O.
- **Small interfaces, deep implementations** — fewer public methods means fewer tests needed and a more stable
  API surface.
- **Bundle dependencies as they grow** — past 3–4 injected parameters, group related ones into a typed context
  object (e.g. `IOContext{fs,git}`), so tests construct a partial context with only the mocks they need.

**Why the mock mechanics matter:** mock bleed across tests produces order-dependent failures that are hard to
diagnose and easy to paper over with ad-hoc resets. The uniform reset discipline codified in the method
eliminates that footgun class — the rationale for keeping tests isolated.

## Test Naming and Organization

### File naming

Mirror the source structure:

```text
src/lib/render.ts         → __tests__/unit/lib/render.test.ts
src/lib/manifest.ts       → __tests__/unit/lib/manifest.test.ts
src/commands/init.ts       → __tests__/integration/commands/init.test.ts
```

### Test descriptions

Describe behavior, not implementation:

```typescript
// GOOD: describes observable behavior
test("renders token that appears multiple times in one file", () => { ... });
test("excludes conditional section when condition is false", () => { ... });
test("returns null when manifest file does not exist", () => { ... });

// BAD: describes implementation details
test("calls replace() for each token", () => { ... });
test("uses regex to find arc:if markers", () => { ... });
test("catches ENOENT error from fs.readFile", () => { ... });
```

### Fixture data

Store reusable test fixtures in `__tests__/fixtures/`. Prefer inline test data for simple
cases — fixtures are for multi-file scenarios (template directories, recipe files) that would
be unwieldy inline.

## Integration with Quality Gates

Testing fits into the tiered quality gate system from DEV-RULES.PROJECT:

- **Tier 1 (per-task):** Run relevant unit tests — `npm run test:unit`
- **Tier 2 (coherent unit):** Full test suite — `npm test`
- **Tier 3 (per-phase / pre-PR):** Full suite + build + typecheck — all gates

See [QUICK-REFERENCE][quick-ref] for the exact commands at each tier.

---

[test-first]: ../../../system/methods/test-first.md
[testing-standards]: ../../../system/methods/testing-standards.md
[process-task-loop]: ../../../system/workflows/arc/process-task-loop.md
[quick-ref]: ../../QUICK-REFERENCE.md
