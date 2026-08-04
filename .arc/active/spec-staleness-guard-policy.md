# Spec (`outline`): Staleness-Guard Hard-Fail Policy

- **Origin:** [internal]

- **Purpose:** Replace the dev-build guard's per-command hard-fail taxonomy with unconditional refusal and a
  one-second remedy, so a stale `dist/cli.js` can never silently execute a state-mutating command — and so the
  guard stops requiring a hand-maintained classification that must be extended every time a command is added.

---

## Problem / Context

The dev-mode guard refuses to run against a stale `dist/cli.js` for an enumerated set of commands and warns for
everything else. The enumeration ships **inside the bundle whose freshness is in question**, so a stale bundle
applies a stale policy to itself: it can correctly detect that its inputs changed and still proceed, because its
own notion of "critical" predates a command that has since become state-mutating.

This has already failed in practice — a stale bundle treated `errand open` as warn-only and minted an
unverifiable session anchor — and the remedy of adding the missing entries has now been applied twice. Each
round restores correctness for the commands someone remembered; none changes the property that makes the next
gap inevitable.

The enumeration is also **under-inclusive against a fresh build today**. It covers seventeen command paths
against roughly ninety leaf commands. Durable-state mutators currently outside it include `integrate`, `archive`,
`teardown`, `decompose`, `materialize`, `init`, `join`, `stub`, `set-stage`, `finalize`, `repoint-design`, `park`,
`resume`, `promote`, `demote`, and `rename`, plus `user load` / `pull` and `locus attach` / `resolve`. Closing
that by hand would mean auditing the whole command surface and re-auditing it forever.

Two properties of the surrounding system make a strict policy affordable now:

- **Detection no longer false-positives — against the built bundle.** The build writes a content hash of the
  bundle's input graph to `dist/dev-build-stamp.json`, and the check treats matching hashes as fresh, so timestamp
  churn from a checkout or rebase no longer reads as stale. Two bounds apply: the hash covers first-party
  `src/**/*.ts` inputs only (§ Scope boundary), and the content path is reached only when the running entry is
  the built bundle. Invoked from source (`tsx src/cli.ts`), the check misreads `src/` as its own output
  directory, finds no stamp there, and falls back to comparing source mtimes against `src/cli.ts` — reporting
  stale whenever any source file is newer than the entry point, which is a false positive by construction.
  Decision 3 closes that.
- **The remedy is cheap.** A runtime-only rebuild measures ~1.0s wall clock. A full build is ~9.8s, of which
  ~8.8s is the `.d.ts` emit that the running CLI never loads.

## Decision(s)

1. **Delete the taxonomy.** Remove `isHandoffCritical` and its unit test. No command is classified by risk
   anywhere in the guard.

2. **Refuse unconditionally on a stale build.** The warn-and-proceed tier is removed; every invocation reaching
   the guard is either fresh or refused. This includes read-only quick-reads (`log`, `health`, `diff`, plain
   `status`) and the `check commit-msg` validator the repository's own commit hook execs — all of which warn and
   run today. We will not carve out a read-only tier: that carve-out is the safe-list this work already rejects,
   and the freshness stamp carries no signal about whether a command is read-only.

3. **The guard fires only against the built bundle.** Its dev-mode discriminator assumes it is running as
   `dist/cli.js` with `src/` adjacent. Invoked from source that assumption is false and the verdict is
   meaningless (§ Problem / Context), so the check will skip when the running entry is not the built bundle —
   source is never stale against itself. This is the same concern the work already owns: without it, Decision 2
   converts a pre-existing false positive into a hard refusal, and the integration tests that spawn
   `tsx src/cli.ts` would fail on every unrelated source edit.

4. **One exception — the compaction-seed write proceeds.** A seed produced by stale logic is revalidated when
   recovery reads it and is strictly better than no seed. The exception exists today as a single option test
   inside `isHandoffCritical`; since Decision 1 deletes that file, it relocates unchanged to the guard call site
   as the one condition distinguishing refuse from proceed. It is not a classification and does not grow.

5. **The exception keeps emitting the stale-build message.** The shipped `pre-compact-seed` harness hook
   string-matches that message to drive its own repair-and-retry, so the text is a consumed contract rather than
   incidental output. Preserving it keeps that self-repair working unchanged.

6. **Add a fast runtime-only build script**, exposed at the repository root as well as in the package. The root
   is where all development invocation happens, and the root already delegates `build` to the workspace by the
   same pattern. It must regenerate everything the check reads, not merely the bundle: the content-hash stamp
   **and the esbuild metafile**, which scopes the hashed input set on both sides — a stale metafile leaves the
   stamp and the live hash agreeing over an outdated input graph, so a newly-bundled source file is invisible to
   both and edits to it read fresh. It must also leave the kernel schema artifact in place, which the e2e setup
   requires as a precondition (a separate obligation from freshness, and the reason a trimmed fast path is
   riskier than it looks).

7. **The refusal message names the fast script.** It names the full build today; shipping the refusal without
   rewording it would silently make the remedy ~9.8s.

8. **The repo-local Codex hook's repair command moves to the fast script**, for the same reason. That command is
   configured in `.codex/hooks.json`, not in the shipped hook — which reads it from the environment and disables
   the retry when unset, as under Claude Code. The edit is repo-local; the shipped hook is untouched.

9. **Refuse rather than rebuild on invoke.** Transparent rebuild is the nicer behavior and is what comparable
   tools do, but it is rejected here on a structural fact: the freshness check lives inside the bundle whose
   freshness is in question, and code inside `dist/cli.js` cannot rebuild and then run the new code — by the time
   it executes, the stale module graph is already resolved. Transparent rebuild therefore requires moving the
   entry point out of the bundle into a launcher, which would need its own copy of the freshness logic (a second
   implementation of a hash contract, whose drift produces exactly the silent false-fresh this work exists to
   eliminate), a package `bin` change leaving every not-yet-reinstalled checkout with no guard at all, and a
   concurrent-publication mechanism. The tools that rebuild transparently — `make`, `cargo run`, `go run` — are
   each an outer runner _distinct from_ the artifact they rebuild; their trusted core already exists, and here it
   would have to be built. Refusal is additionally **legible**: a silent rebuild is silent when it works and
   equally silent when it misbehaves, and its failure modes end in running stale code.

## Scope boundary (No-gos)

- **No launcher, no entry-point move, no `bin` change.** Out per Decision 9. Adopters are unaffected by
  construction — the package ships no `src/`, so the check short-circuits on an installed copy — and the test
  helpers keep spawning `dist/cli.js` at its fixed path. (That path stability is what the no-go buys; it is not a
  claim that test behavior is unchanged, which Decision 2 does affect — see § Open items.)
- **No rebuild-on-invoke**, and no auto-rebuild escape-hatch environment variable (no call site requires one).
- **No cross-process build publication.** Concurrent builders and atomic publication of `dist/` belong to
  `e2e-build-coordination`, which already owns that boundary.
- **No widening of freshness-detection scope.** The stamp hashes first-party `src/**/*.ts` only, so a
  bundled-dependency bump or a build-config edit reads as fresh. Pre-existing, unchanged here, and captured
  separately as its own concern.
- **No read-only warn tier and no safe-list**, per Decision 2. Should a safe-list ever be revisited, its only
  defensible axis is **provably side-effect-free** (the `make -q` / `migrate --check` / `terraform validate`
  category) — never "this write is low-risk," which is the risk-judgment shape this work exists to delete and
  which no surveyed tool uses.
- **No adopter-facing change.** This is self-hosting dev tooling.

## Consequences & Risks

- **Committing against a stale build now fails closed.** The repository's `commit-msg` hook execs
  `arc check commit-msg`, which warns and proceeds today. After Decision 2 it refuses and the hook propagates the
  exit code, so the commit aborts until the build is refreshed. This is the largest daily-behavior change in the
  work — it lands on the most frequent operation, and the sequence that triggers it (edit source, then commit) is
  the common one. It is accepted deliberately: a stale validator can pass a message the fresh one would reject,
  so the refusal is correct rather than merely strict, and the remedy is one second. Declining to except it also
  keeps the exception count at one; a second carve-out is how the deleted taxonomy grew in the first place.
- **Read-only quick-reads now refuse on a stale build.** `log`, `health`, `diff`, and plain `status` warn and run
  today, and `CONTRIBUTING.md` documents them as doing so. **Revisit trigger:** if this or the commit-path change
  proves to be real friction in practice, a read-only tier can be reconsidered — but only against observed
  friction, not in anticipation of it, and only on the axis named in § Scope boundary.
- **The guard-erosion risk is accepted, not eliminated.** The case for transparent rebuild rested on the claim
  that unbounded refusal invites the guard being worked around. That is a prediction and remains unobserved, and
  a one-second remedy makes it weak. **Revisit trigger:** if the guard is observed being bypassed in practice,
  the launcher direction is reconsidered.
- **The remedy's cost is load-bearing.** Decisions 6–8 are what keep refusal cheap. If the fast script is absent
  from the root, or the messages name the full build, the design silently degrades to a ~9.8s remedy and both
  revisit triggers become materially more likely to fire.
- **`CONTRIBUTING.md` needs rewriting, not trimming.** It documents the warn tier and the enumerated command set
  as current behavior, so the description is wrong rather than merely incomplete after this change.
- **Net simplification.** One file and its test are deleted, the guard call site loses a branch, and no
  classification surface remains to maintain.

## Success Criteria

- `isHandoffCritical` and its unit test are removed, and no risk-based classification of commands remains in the
  guard.
- A stale build refuses every command reaching the guard, including read-only quick-reads and `check commit-msg`.
- Invoking the CLI from source rather than the built bundle produces no staleness verdict at all.
- The compaction-seed write is the sole exception: it proceeds against a stale build and still emits the
  stale-build message.
- `build:fast` (or equivalently named runtime-only script) exists at both the package and repository root, and
  costs a small fraction of `build` by excluding the `.d.ts` emit. (Observed on the authoring machine: ~1s
  against ~10s. Absolute seconds vary by environment — `QUICK-REFERENCE` records `build` at 5.7s — so the
  relational claim is the checkable one.)
- Running that script against a stale tree turns the verdict fresh, and leaves `dist/` carrying a regenerated
  content-hash stamp **and** metafile, plus the kernel schema artifact — verified by a check that would fail if
  the metafile went stale while the stamp did not.
- The refusal message names that script rather than the full build, and `.codex/hooks.json` does the same.
- The Codex compaction-seed repair-and-retry path still works end to end against a stale build.
- `CONTRIBUTING.md` describes the guard as it then is — no warn tier, no enumerated command set.
- The full quality-gate suite passes.

## Open items

- **Which existing tests are coupled to the guard's output strings.** The harness-hook unit tests carry fake
  scripts emitting the warn / refusal text, and the config-validate integration test carries a regex tolerating
  the warn line — a tolerance Decision 3 makes removable, since those cases spawn the CLI from source and will
  stop seeing the guard entirely. Mechanical once Decisions 2 and 3 are both in force.

- **Whether the integration tier needs a stated fresh-build precondition.** A second, distinct class that
  Decision 3 does **not** relieve: integration tests spawning the _built_ bundle through the shared CLI helper.
  That vitest project has no build step of its own (only the e2e project does), so under Decision 2 a stale
  `dist/` turns their exit-0 and empty-stderr assertions into refusals. CI is unaffected — it downloads a
  freshly built `dist/`, stamp included — so this is a local-run concern, and at least one of those files
  already imposes the same requirement today. The resolution is a small either-or (add a build to that project's
  setup, or document the prerequisite) that surfaces on the first local run.
