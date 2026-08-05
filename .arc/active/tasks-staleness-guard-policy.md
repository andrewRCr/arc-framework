# Task List: Staleness-Guard Hard-Fail Policy

- **Design:** `spec-staleness-guard-policy.md`

---

## **Phase 1:** Fast rebuild remedy

_Purpose:_ Land the one-second remedy before the guard starts refusing. Every later increment in this work unit
commits through the `commit-msg` hook, which execs the CLI — so once refusal is unconditional, each of those
commits pays whatever the remedy costs.

_Design decisions:_ The fast build is a second tsup config derived from the base one and selected with
`tsup --config`. Tsup's command line exposes no flag that disables declaration emit, and an environment-variable
script would not run on Windows without a new dependency. Deriving rather than restating the base config is what
keeps the metafile, the content-hash stamp, and the kernel schema artifact from silently dropping out of the fast
path. `notes-staleness-guard-policy.md` records the directions weighed and rejected on the way here.

### `[x]` **1.1 Add the runtime-only build path**

- _Goal:_ One command regenerates every artifact the freshness check and the end-to-end setup read, at a small
  fraction of the full build's cost.

    - `[x]` **1.1.a Derive `tsup.fast.config.ts` from the base config**
        - `tsup.config.ts` now names its options `baseOptions` and default-exports `defineConfig(baseOptions)`;
          the derived config spreads that export and sets `dts: false`. The named export is what makes the
          derivation type-safe — `defineConfig` returns a union that would need a cast to spread.
        - The metafile emit, the output clean, and the success hook that writes the kernel schema artifact and
          the content-hash stamp all inherit by reference rather than restatement.

    - `[x]` **1.1.b Expose `build:fast` at the package and the repository root**
        - The package script is `tsup --config tsup.fast.config.ts`; the root delegates to the workspace the way
          `build` already does.

    - `[x]` **1.1.c Pin the regeneration contract**
        - `__tests__/unit/build-config.test.ts` asserts the derived options keep `metafile` and `clean` on, carry
          the base success hook **by identity** (a restated hook is free to drift), and diverge from the base in
          `dts` alone — the last assertion catches a silently dropped key rather than only the three named ones.
        - Fail-first proven by replacing the derived config with a restated one: all four assertions fail.

    - `[x]` **1.1.d Confirm the first fast run against a stale tree**
        - Against an edited `src/lib/dev-check.ts` the guard read stale; one `npm run build:fast` from the root
          regenerated the bundle, `metafile-esm.json`, `dev-build-stamp.json`, and `schemas/kernel.json`, and the
          verdict returned to fresh.
        - Observed cost on the authoring machine: **1.03s** against the full build's **12.9s**, of which 12.4s is
          the declaration emit. Wall-clock through npm is 3.0s against 13.9s — a ~2s workspace overhead common to
          both, which is why the tsup-internal figures are the honest pair.

- _Outcome:_ The full build's declaration emit is 96% of its cost and produces a 13-byte `dist/cli.d.ts` — the
  measured confirmation that nothing consumes it, and what makes the remedy affordable enough for Phase 2's
  refusal to land on the commit path.

## **Phase 2:** Unconditional refusal against the built bundle

_Purpose:_ Replace the risk taxonomy with a single line — fresh or refused — and confine the guard to the
artifact whose freshness it can actually judge.

_Design decisions:_ The built-bundle test lands in `dev-check.ts` as an exported predicate the dependency factory
consumes, so the verdict function stays pure and that condition is unit-testable without spawning a CLI. The
compaction-seed exemption instead moves to the guard call site as the one condition separating refusal from
proceed, and keeps emitting the existing stale-build sentence, which the compaction hook string-matches to drive
its own repair. A call site inside a module that parses and runs on import is reachable only from outside the
process, so that half is covered end to end rather than by unit.
`notes-staleness-guard-policy.md` records the alternatives to refusal that were weighed and rejected, which is
the ground to re-read before reopening any of this rather than re-deriving it.

### `[x]` **2.1 Confine the guard to the built bundle**

- _Goal:_ Invoking the CLI from source produces no staleness verdict, so the guard never judges a tree against
  itself.

- _Outcome:_ `isBuiltBundleEntry` in `dev-check.ts` is the exported predicate — a `.js` entry whose parent
  directory is named `dist` — and `createDevCheckDeps` gates `resolveInputFiles` on it, so a non-qualifying entry
  yields `skip` through the existing published-install path rather than a second exit. The dev-mode discriminator
  is now two conditions rather than one, and the module docblock says so. Five behaviors driven one at a time;
  the `.ts`-in-`dist` case is what keeps the extension condition from being droppable, and the `.js`-outside-
  `dist` case passed on arrival as a regression guard on the directory condition. `createDevCheckDeps` had no
  tests before this — the file covered the pure verdict function and the two hashing helpers alone.

### `[x]` **2.2 Refuse every command against a stale build**

- _Goal:_ A stale bundle runs nothing but the compaction-seed write, and names a one-second fix.

    - `[x]` **2.2.a Delete the risk taxonomy**
        - `handoff-critical.ts` and its unit test are gone, along with the call site's import. No command is
          classified by risk anywhere in the guard.
        - The prose the taxonomy left behind in `dev-check.ts` is corrected: the docblock's allowlist enumeration
          and its warn-branch sentence, the `newestFile` comment about running before every handoff-critical
          command, and the unit-test header that deferred the branching elsewhere.

    - `[x]` **2.2.b Refuse at the call site, with the seed write as the sole exception**
        - The exemption is one option test — `writeCompactionSeed` — read from the action command's own options,
          not a command-name test. Everything else refuses with exit 1.
        - Both messages name `build:fast`; the exempt path keeps the stale-build sentence verbatim, since the
          compaction hook string-matches on the sentence rather than the remedy clause.

    - `[x]` **2.2.c Re-settle the tests the policy change invalidates**
        - `expectOnlyDevelopmentBuildWarning` became `expectCleanStderr` across seven call sites in the
          config-validate integration test: those cases spawn the CLI from source, where the guard no longer runs
          at all. Proven load-bearing by removing the built-bundle gate — all seven fail on the warn line.
        - The compaction-hook fake that modeled a refusing seed command now models a stale seed command failing
          at its own work, renamed to match. It still covers what it always covered — the hook keys on the
          sentence, not the exit code — without asserting a refusal the CLI can no longer emit.
        - Remaining fakes realigned to `build:fast`.

    - `[x]` **2.2.d Pin refusal and the exemption end to end**
        - `__tests__/e2e/stale-build-guard.e2e.test.ts` copies `dist/` into a scratch layout **inside the package
          directory** — the bundle resolves its external runtime dependencies by walking up from its own path, so
          a copy elsewhere dies on a missing module before the guard runs — drops the stamp and metafile to force
          the mtime fallback, and adds a newer sibling source file.
        - Each case runs from its own initialized ARC project root, since the seed write walks up from the
          working directory and would otherwise overwrite the developer's live recovery seed.
        - Asserts the refusal clause for an ordinary command and its absence, plus a parseable envelope on
          standard output, for the seed invocation — the sentence and the exit code discriminate neither.
        - Fail-first proven by exempting every command: the refusal case fails, the exemption case still passes.

### `[x]` **2.3 Settle the integration tier's build prerequisite**

- _Goal:_ A local integration run states what it needs instead of failing on a refusal it cannot explain.

    - `[x]` **2.3.a Build in the project's setup, or state the prerequisite**
        - Took the build branch: `__tests__/integration/global-setup.ts` mirrors the end-to-end setup's shape —
          same `ARC_E2E_SKIP_BUILD` gate, same post-build artifact check — and invokes `build:fast`. The two
          setup files now impose the same expectation, and the end-to-end docblock records that the variable
          gates both tiers.
        - Chosen over documenting the prerequisite because it closes the failure mode rather than explaining it,
          and continuous integration already sets that variable on the integration job, so the downloaded bundle
          is still used rather than rebuilt.
        - Accepted costs: a tier-named variable now switches two tiers, and a local full-suite run pays one extra
          fast build, since setup runs per project with no sharing between them.
        - Verified against a genuinely stale bundle — the guard refused before setup, the setup rebuilt through
          the fast config, and all 979 integration tests passed; with the variable set, no build runs.

## **Phase 3:** Consumer surfaces

_Purpose:_ Point the surfaces a developer reaches for a working bundle at `build:fast`, and describe the guard as
it then is.

### `[x]` **3.1 Point the compaction repair at the fast script**

- _Goal:_ The compaction seed's repair-and-retry costs a second rather than ten, and still recovers end to end
  against a stale build.

    - `[x]` **3.1.a Retarget the configured repair command at `build:fast`**
        - `.codex/hooks.json`'s `ARC_HOOK_STALE_BUILD_COMMAND` now reads `npm run build:fast`. The packaged Codex
          fragment sets no build command at all — it reads one from the environment — so nothing ships.

    - `[x]` **3.1.b Confirm the repair-and-retry path end to end against a stale build**
        - Drove `pre-compact-seed.mjs` directly against a genuinely stale bundle — a content edit to
          `src/lib/dev-check.ts`, with the guard confirmed refusing first — from an `arc init`-ed project root in a
          scratch directory, harness variable set to `codex-cli`.
        - The seed command had to name the built bundle by absolute path rather than `npx arc`, which resolves
          nothing from an unrelated root, and the repair command carried its own `cd` back to the repository.
        - All four legs held: the seed write proceeded under refusal, the fast build ran (the bundle's mtime
          advanced mid-hook), the retry reported fresh, and a `fallback: false` session-scoped recovery marker
          landed beside the seed under the isolated root. The live recovery seed was untouched.

- _Outcome:_ The retarget lands entirely in a gitignored file, so this record is the only durable evidence that the
  repair command is pointed at the one-second script — and the confirmation above the only check of it.

### `[ ]` **3.2 Rewrite the contributing guide's guard description**

- _Goal:_ The guide describes unconditional refusal — no warn tier, no enumerated command set — and names the
  fast script as the fix.

- _Rationale:_ It currently documents the enumerated commands as the ones that refuse and four quick-reads as
  warning but running, so after the change it is wrong rather than merely incomplete.

- _Note:_ It is the only prose surface describing the guard — the published contributing page does not mention
  it.

### `[ ]` **3.3 Reach the fast script from the repository's other build surfaces**

- _Goal:_ Every path a developer takes to get a working bundle reaches the runtime-only build, so the remedy
  costs what the design assumes wherever it is met.

- _Context:_ Two surfaces beyond the guard and the hook name a build — the quick reference, in its building
  section and again in the self-hosting invocation callout, and the provisioning script that lays down the first
  bundle in a fresh linked worktree. Neither reads the declarations the full build spends most of its time
  emitting.

- _Note:_ The quick-reference edit belongs to the project copy alone. The packaged template carries no building
  section, so nothing ships and no adopter-facing surface changes.

    - `[ ]` **3.3.a Record `build:fast` in the quick reference**
        - The building section carries both scripts and what each is for; the measured-cost table gains a row
          from the pair recorded at Task 1.1. The self-hosting invocation callout, which tells a developer what
          makes the binary usable, names the fast script too — it is the surface refusal is met from.
        - That table's single date governs every row, so leave it alone and let the new row carry its own
          measurement date. Only a materially moved figure for the full build justifies touching the existing
          rows, and then by re-measuring the table rather than re-dating it off two samples.
        - The gate listing keeps naming the full build. That gate is build verification and continuous
          integration runs it, so naming the fast script there would claim a gate it does not satisfy — it emits
          no declarations.

    - `[ ]` **3.3.b Switch linked-worktree provisioning to `build:fast`**
        - Provisioning needs the bundle and the workspace bin link that follows it; neither depends on
          declarations, so the full build's cost buys nothing there.

## **Phase 4:** Verification

### `[ ]` **4.1 Complete verification** — load and follow `verify-work-unit.md`

---

## Success Criteria

- `[ ]` No risk-based classification of commands remains in the guard, and `handoff-critical.ts` and its unit
  test are gone

- `[ ]` A stale build refuses every command reaching the guard, including read-only quick-reads and the
  commit-message validator the repository's own hook execs

- `[ ]` Invoking the CLI from source rather than the built bundle produces no staleness verdict at all

- `[ ]` The compaction-seed write is the sole exception: it proceeds against a stale build and still emits the
  stale-build message

- `[ ]` `build:fast` exists at both the package and the repository root and costs a small fraction of the full
  build — record the observed pair

- `[ ]` Running that script against a stale tree turns the verdict fresh and leaves the output directory carrying
  a regenerated content-hash stamp, metafile, and kernel schema artifact

- `[ ]` A check fails if the fast path stops regenerating the metafile while still writing the stamp

- `[ ]` The refusal message and the repository's hook configuration both name `build:fast`

- `[ ]` The quick reference and linked-worktree provisioning reach `build:fast` rather than the full build, with
  no packaged or adopter-facing surface changed

- `[ ]` The compaction-seed repair-and-retry path still works end to end against a stale build

- `[ ]` `CONTRIBUTING.md` describes the guard as it then is — no warn tier, no enumerated command set

- `[ ]` All quality gates pass (tests, linting, type checking)

- `[ ]` Ready for integration
