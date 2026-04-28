# Testing Methodology Strategy

Testing approach for `@arc-framework/cli` — a TypeScript CLI that manages ARC framework
installation, updates, and session portability. This strategy codifies when and how to write
tests, informed by the project's characteristics: pure-function core libraries, CLI commands
with filesystem and git side effects, and a three-tier test structure.

## Philosophy: Pragmatic TDD

Test-first for core logic, test-after for glue code and CLI wiring.

- **Test behavior through public interfaces** — tests verify what a module does, not how it
  does it internally. A test that breaks when you refactor without changing behavior was testing
  implementation, not behavior.
- **Vertical slices, not horizontal** — write one test, make it pass, repeat. Never write all
  tests first then all implementation. Each test responds to what the previous cycle revealed.
- **Test our logic, not our dependencies** — don't test Commander's argument parsing, clack's
  prompt rendering, or git's merge algorithm. Test our code that uses them.
- **Meaningful assertions over coverage targets** — focus on critical paths and complex logic.
  No hard coverage percentage. A well-tested `render.ts` matters more than 80% line coverage
  across boilerplate.

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

## TDD Decision Tree

### Requires test-first (write tests BEFORE implementation)

- **Core libraries** — render, hash, manifest, recipe, merge wrapper, identity resolution
- **Data transformations** — any function that takes input and produces transformed output
- **Validation logic** — manifest schema validation, recipe parsing, config validation
- **Business rules** — file classification, mode-conditional behavior, conflict detection

These modules have clear inputs and outputs, no visual or interactive ambiguity, and bugs
propagate silently. TDD catches design issues early and produces better interfaces.

### Test-after acceptable

- **CLI command wiring** — Commander subcommand registration, option parsing
- **Interactive prompts** — clack/prompts flow (test the logic the prompts feed into, not the
  prompt rendering itself)
- **Console output formatting** — post-init messaging, status display, diff formatting
- **Glue code** — thin orchestration that calls tested modules in sequence

### No tests needed

- **Type declarations** — `types.ts` is validated by the compiler
- **Configuration files** — `tsconfig.json`, `tsup.config.ts`, `vitest.config.ts`
- **Re-exports and barrel files**

## The Red-Green-Refactor Loop

For test-first work, follow the vertical slice pattern:

```text
1. RED:    Write ONE test for ONE behavior → test fails
2. GREEN:  Write minimal code to make it pass → test passes
3. REPEAT: Next behavior → RED → GREEN → ...
4. REFACTOR: After a coherent set passes, clean up — tests must still pass
```

**Rules during the loop:**

- One test at a time — don't batch tests
- Only enough code to pass the current test — don't anticipate future tests
- Never refactor while RED — get to GREEN first, then refactor
- Run tests after each refactor step

**Why vertical, not horizontal:** Tests written in bulk test *imagined* behavior. Tests written
one at a time test *actual* behavior, because you just wrote the code and know exactly what
matters. Horizontal slicing (all tests → all code) produces tests coupled to API shape rather
than observable outcomes.

## Mocking Rules

### Mock at system boundaries only

- **Child processes** — `git` commands via `execFile` (in unit tests; integration/e2e use real
  git)
- **Filesystem** — `fs` operations (in unit tests; integration/e2e use temp directories)
- **Time** — if any logic depends on timestamps
- **Network** — npm registry checks (version comparison)

### Never mock

- **Internal modules** — don't mock `render.ts` when testing `init.ts`. Use the real module.
  If that's hard, the interface needs redesign, not more mocks.
- **Your own classes or utilities** — if you control it, test through it
- **Data structures** — don't mock a manifest object; create a real one

### Design for testability

- **Accept dependencies, don't create them** — pass `execFile` or fs functions in rather than
  importing directly. This makes unit testing possible without mocking module internals.
- **Return results, don't produce side effects** — prefer functions that return a value over
  functions that mutate state. When side effects are necessary (writing files), separate the
  computation from the I/O.
- **Small interfaces, deep implementations** — fewer public methods means fewer tests needed
  and a more stable API surface. Hide complexity behind simple interfaces.
- **Bundle dependencies as they grow** — individual injectable parameters are clear and explicit
  for 2-3 dependencies. When a function needs 4+, group related dependencies into a typed
  context object (e.g., `IOContext` with `fs` and `git` fields). This keeps signatures readable
  without sacrificing testability — tests construct a partial context with only the mocks they
  need.

### Vitest mock mechanics

- **Hoist every `vi.fn()` to an external `const`.** Never inline `vi.fn()` inside a `vi.mock(...)`
  factory return — the factory returns arrow-function forwarders to externally-declared mocks
  instead. Without this, a test can't reset the mock's state because it holds no reference.
- **Use `vi.resetAllMocks()` in `beforeEach`, not `vi.clearAllMocks()`.** `clearAllMocks` wipes
  call history but preserves `.mockResolvedValue` / `.mockImplementation` across tests, silently
  leaking state. `resetAllMocks` clears both call state and runtime overrides.
- **Re-establish per-test overrides after reset.** `vi.resetAllMocks()` restores `vi.fn(impl)` to
  its original implementation rather than losing construction-time defaults. Re-apply any per-test
  behavior in `beforeEach` — preferably via a single `resetMockDefaults()` helper at the top of the
  file.

Why this matters: mock bleed across tests produces order-dependent failures that are hard to
diagnose and easy to paper over with ad-hoc resets. The uniform rule eliminates the footgun
class entirely.

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

## Key Principles Summary

1. **Test behavior, not implementation** — assert on what callers observe, not internal
   mechanics
2. **One test, one behavior** — each test verifies one logical assertion
3. **Tests are documentation** — test descriptions should read as a specification of what the
   module does
4. **Fast feedback** — unit tests in milliseconds, full suite under 30 seconds
5. **Isolated tests** — no test depends on another test's state or execution order
6. **Mock boundaries, not internals** — mock git and filesystem at system edges; use real
   modules for everything you control

---

[quick-ref]: ../../QUICK-REFERENCE.md
