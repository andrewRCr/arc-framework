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

### `[ ]` **1.1 Add the runtime-only build path**

- _Goal:_ One command regenerates every artifact the freshness check and the end-to-end setup read, at a small
  fraction of the full build's cost.

- _Context:_ The full build spends most of its wall clock on a declaration emit nothing consumes — the package
  declares no `types`, `main`, or `exports` entry, and the CLI loads only the bundle.

    - `[ ]` **1.1.a Derive `tsup.fast.config.ts` from the base config**
        - It imports `tsup.config.ts` and overrides declaration emit alone.
        - Everything else inherits unchanged: the metafile emit, the output clean, and the success hook that
          writes the kernel schema artifact and the content-hash stamp.
        - The output clean drops any declarations a prior full build left, since tsup protects them only while
          declaration emit is on. Nothing in the repository reads them.

    - `[ ]` **1.1.b Expose `build:fast` at the package and the repository root**
        - The package script runs tsup against the derived config; the root script delegates to the workspace the
          way `build` already does.
        - The root is where development invocation happens, so a package-only script would leave the remedy
          unreachable from where it is needed.

    - `[ ]` **1.1.c Pin the regeneration contract**
        - Assert the derived config still emits the metafile, still cleans, and still carries the base success
          hook — the three properties that make the stamp describe the bundle actually built.
        - Without a regenerated metafile the stamp is computed over an outdated input graph, so a newly bundled
          source file is invisible to both sides of the comparison and edits to it read fresh.

    - `[ ]` **1.1.d Confirm the first fast run against a stale tree**
        - The run leaves the bundle, the esbuild metafile, the content-hash stamp, and the kernel schema
          artifact behind, and turns the freshness verdict fresh.
        - Record the observed cost against the full build — the pair the affordability argument rests on, and
          what the quick reference later carries.
        - The contract assertion above proves the config's shape; this proves the path actually emits, which is
          what the refusal in the next phase depends on.

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

### `[ ]` **2.1 Confine the guard to the built bundle**

- _Goal:_ Invoking the CLI from source produces no staleness verdict, so the guard never judges a tree against
  itself.

- _Rationale:_ The dev-mode discriminator is `src/` adjacency, which holds for the built bundle and is false when
  the entry is the TypeScript source — there the check reads `src/` as its own output directory, finds no stamp,
  and falls back to comparing source mtimes against the entry point. That verdict is stale by construction, and
  unconditional refusal would turn it into a hard failure on every unrelated source edit.

- _Shape:_ The entry qualifies when it is a `.js` file whose parent directory is named `dist`. Both conditions
  are false for the source entry, and neither depends on the bundle's filename, which the build config owns.

- _Note:_ The first four behaviors below test the predicate directly; the fifth tests the dependency factory,
  which carries no tests today — the existing unit file covers the pure verdict function and the two hashing
  helpers alone.

    - The module docblock names `src/` adjacency from the built bundle as the dev-mode discriminator. That
      sentence describes what this task replaces, so it is corrected here.

    - Build `test-first` (one behavior at a time):
        - A `.js` entry whose parent directory is named `dist` qualifies
        - A `.ts` entry under `src/` does not qualify
        - A `.ts` entry whose parent directory is named `dist` does not qualify — without this case, dropping
          the extension condition passes every other one
        - A `.js` entry outside any `dist` directory does not qualify
        - A non-qualifying entry makes the factory yield skip, and a qualifying entry with no adjacent `src/`
          still does — the published-install path stays independent of the new condition

### `[ ]` **2.2 Refuse every command against a stale build**

- _Goal:_ A stale bundle runs nothing but the compaction-seed write, and names a one-second fix.

    - `[ ]` **2.2.a Delete the risk taxonomy**
        - Remove `handoff-critical.ts` and its unit test, and drop the call site's import of it.
        - Bring the taxonomy's remaining descriptions to what the module then does — the docblock's allowlist
          enumeration and its warn-branch sentence, the helper doc comment further down that speaks of running
          before every handoff-critical command, and the unit-test header saying the branching is exercised
          elsewhere. The docblock's discriminator sentence belongs to the task above. Otherwise the
          classification survives in prose inside the one file the change centres on.
        - The import and its only branch cannot be removed separately, so this lands as one compiling change
          with the call-site rewrite below rather than as a step that stands alone.
        - No command is classified by risk anywhere in the guard afterwards.

    - `[ ]` **2.2.b Refuse at the call site, with the seed write as the sole exception**
        - The exemption is the seed option test relocated unchanged: a seed produced by stale logic is
          revalidated when recovery reads it, and beats no seed. The option is declared on `status` alone, so it
          needs no command-name test and stays one condition rather than a classification.
        - Both messages name `build:fast`. The exempt path keeps the existing stale-build sentence the compaction
          hook matches on; only its remedy clause changes, and the hook keys on the sentence, not the clause.
        - Naming the full build in either message would silently make the remedy ten times more expensive.

    - `[ ]` **2.2.c Re-settle the tests the policy change invalidates**
        - The config-validate integration test tolerates a warn line in stderr; those cases spawn the CLI from
          source and stop seeing the guard entirely, so the tolerance becomes an assertion of clean stderr.
        - One compaction-hook fake models the seed command refusing, which the exemption makes impossible, while
          its sibling case already covers the shape the seed path actually produces. Keep it for what it does
          cover — the hook cannot assume the seed command's exit code — and rewrite the fake and its name around
          that failure rather than around a refusal the CLI can no longer emit.
        - Realign the remaining fakes with the messages that then exist.

    - `[ ]` **2.2.d Pin refusal and the exemption end to end**
        - The call site is unreachable from a unit test — `cli.ts` parses and runs on import, which is why the
          taxonomy was a separate module at all. Holding the exemption at the call site is the design, so the
          coverage moves out rather than the code.
        - Assemble a throwaway package layout — the built bundle copied into a scratch `dist`, a sibling `src`
          holding a newer dummy source file, no stamp — so the mtime fallback reports stale without touching the
          real output directory or racing a parallel run.
        - Put that layout inside the package directory, not the system temp directory. The bundle leaves its
          runtime dependencies external, and the loader resolves them by walking up from the bundle's own path,
          so a copy anywhere else dies on a missing module before the guard runs at all.
        - Give the fixture its own project root and run from it. The seed write resolves its destination by
          walking up from the working directory, so an unconstrained one overwrites the developer's live
          recovery seed.
        - Both branches embed the same stale-build sentence, and an ordinary command exits non-zero in a bare
          fixture for reasons of its own — so neither the sentence nor the exit code discriminates. Assert the
          refusal clause itself for an ordinary command, and for the seed invocation assert that the clause is
          absent and its envelope reaches standard output.

### `[ ]` **2.3 Settle the integration tier's build prerequisite**

- _Goal:_ A local integration run states what it needs instead of failing on a refusal it cannot explain.

- _Context:_ Two integration tests spawn the built bundle through the shared CLI helper. That test project has no
  build step of its own — only the end-to-end project builds — so a stale bundle turns their exit-code and
  stderr assertions into refusals. Continuous integration is unaffected: it downloads a freshly built bundle,
  stamp included.

- _Note:_ This lands in the same phase as the refusal. The phase's own quality-gate run would otherwise pass only
  because the executor had just rebuilt — the exact reliance this task removes.

    - `[ ]` **2.3.a Build in the project's setup, or state the prerequisite**
        - Done when the integration project either builds before its run or documents the requirement, and both
          affected files impose the same expectation. At least one of them already imposes it today.
        - The build branch mirrors the end-to-end project's setup shape, which honors the skip-build variable
          continuous integration already sets on the integration job. A hand-rolled build ignores it and makes
          that job rebuild instead of using the bundle it downloaded.
        - That branch also invokes `build:fast`, turns a variable named for one tier into a switch over two,
          and costs a second build on a local full-suite run, since setup runs per project with no sharing
          between them. The documentation branch carries none of that and no gate coverage either.

## **Phase 3:** Consumer surfaces

_Purpose:_ Point the surfaces a developer reaches for a working bundle at `build:fast`, and describe the guard as
it then is.

### `[ ]` **3.1 Point the compaction repair at the fast script**

- _Goal:_ The compaction seed's repair-and-retry costs a second rather than ten, and still recovers end to end
  against a stale build.

- _Context:_ The repair command is configured in this repository's own hook file. The shipped hook reads it from
  the environment and disables the retry when it is unset, so nothing that ships changes.

- _Note:_ Nothing tests that hook file, so the retarget lands unpinned and the confirmation below is the only
  check that the wiring is right.

    - `[ ]` **3.1.a Retarget the configured repair command at `build:fast`**

    - `[ ]` **3.1.b Confirm the repair-and-retry path end to end against a stale build**
        - A compaction event can't be forced on demand, so drive the seed script directly with the harness and
          repair-command environment variables set, against a genuinely stale tree — the shape the hook's own
          tests use with fakes, run here against the real script and the real CLI.
        - Run it against an isolated project root. The script takes the working directory as its own, and both
          the seed and the recovery marker land under that root's user directory — from the repository root
          this overwrites the live recovery seed and mints a marker the session's own hooks will act on for a
          week.
        - The script spawns the repair in that same working directory, so give the repair command an explicit
          directory of its own; otherwise it has no manifest to resolve and the leg under test never runs.
        - The seed write proceeds, the repair runs, the retry reports fresh, and a non-fallback recovery marker
          lands.

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
