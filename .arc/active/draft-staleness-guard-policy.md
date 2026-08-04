# Draft: Dev-Build Staleness-Guard Hard-Fail Policy

- **Origin:** [internal] — routed from `USER-INBOX` at the work-routing-discipline housekeep drain (2026-06-01);
  the asymmetry was surfaced in that work unit's pre-PR review. Two later captures (2026-07-13, 2026-08-04) routed
  in and are folded into the body below.
- **Purpose:** Replace the guard's per-command hard-fail taxonomy with a fail-safe default and on-demand rebuild,
  so a stale `dist/cli.js` can never silently execute a state-mutating command — and so the guard stops requiring
  a hand-maintained classification that must be extended every time a command is added.

- **Readiness state:** formalization-ready — direction and mechanisms settled; residual risks recorded, not open.

---

## Problem / Motivation

The dev-mode guard refuses to run against a stale `dist/cli.js` for an enumerated set of commands and warns for
everything else. The enumeration lives in `isHandoffCritical`, which ships **inside the bundle whose freshness is
in question**. A stale bundle therefore applies a stale policy to itself: it can correctly detect that its inputs
changed and still decide to proceed, because its own notion of "critical" predates a command that has since become
state-mutating.

That is not hypothetical. The observed failure had a stale bundle treat `errand open` as warn-only and mint an
unverifiable session anchor. The response was to add the missing entries, and the same response has now happened
twice — lifecycle mutations in July, then the tracked-state remedy days later. Each fix restores correctness for
the commands someone remembered; none of them changes the property that makes the next gap inevitable.

**The enumeration is also already incomplete against a fresh build.** The guard names roughly fifteen command
paths; the CLI exposes roughly ninety. Durable-state mutators currently outside the set include `integrate`,
`archive`, `teardown`, `decompose`, `materialize`, `init`, `join`, `stub`, `set-stage`, `finalize`,
`repoint-design`, `park`, `resume`, `promote`, `demote`, and `rename`, plus `user load` / `pull` and
`locus attach` / `resolve`. So the drift is not merely a risk carried by stale bundles — the current bundle is
under-inclusive today, and closing that by hand would mean auditing the whole command surface and re-auditing it
forever.

Two properties of the surrounding system decide what to do about it:

- **Detection is already exact.** The build writes a content hash of the bundle's real input graph to
  `dist/dev-build-stamp.json`, and the check treats matching hashes as fresh. Timestamp churn from a checkout or
  rebase no longer reads as stale, so a strict policy no longer fires spuriously.
- **The remedy is cheap.** A runtime-only rebuild measures ~1.3s wall clock (349ms of bundling). The 27s figure
  for a full build is entirely the `.d.ts` emit, which the running CLI never loads.

Cheap, exact, and fully self-remediable is the profile under which every comparable tool stops classifying and
starts either rebuilding or refusing wholesale.

## Direction

Delete the taxonomy. The guard becomes: **detect exactly, rebuild if stale, refuse if the rebuild fails.**

1. **Remove `isHandoffCritical` and its tests.** The warn-and-proceed tier goes with it — that tier is the
   fail-open mode responsible for the original incident, and under rebuild-on-invoke there is nowhere for it to
   live. Every invocation is either fresh or refused.
2. **Move the entry point up one level.** A small, dependency-free, unbundled launcher becomes the package `bin`
   target. It checks freshness, rebuilds when stale, and only then dynamically imports the bundle.
3. **Rebuild by spawning the runtime-only build into a unique temporary output directory**, then publish by
   renaming its outputs into place. Directory cleaning stays disabled on this path, so no window exists in which
   the bundle is absent.
4. **Refuse when the rebuild fails**, with one named exception: the compaction-seed write still proceeds, because
   a seed produced by stale logic is revalidated when recovery reads it and is strictly better than no seed. This
   is a single exception on one failure branch, not a classification.
5. **Add a fast build script** for the runtime-only path, so the manual remedy is ~1.3s rather than ~27s.

### Why the launcher, specifically

The re-exec that an in-bundle guard would need is not incidental complexity — it is forced. `dist/cli.js` is
itself the entry point, so by the time any code inside it runs, the stale module graph is fully loaded; nothing
in-process can repair that, only replace it. Moving the entry up one level dissolves the constraint: the launcher
imports the bundle _after_ rebuilding, and the loader reads the fresh bytes. No spawn of the CLI, no argv
reconstruction, no stdio inheritance, no exit-code propagation, no recursion guard.

It also puts the freshness decision outside the artifact being judged. This is the trusting-trust problem in
miniature, and the standard escape is a minimal trusted core that does not derive from the thing it validates
[[thompson]][thompson]. The launcher qualifies as long as two properties hold: it stays out of the bundle, and its
verdict depends only on signals independent of the bundle's own claims — which the existing source-hash-versus-stamp
comparison already satisfies.

Secondary benefit: `npx arc` currently cannot run at all on a fresh clone before a build. The launcher would just
build.

### Publication — the stamp is the commit record

Without a lock, two invocations can rebuild concurrently, so publication has to be safe on its own. It is, because
the freshness check never hashes the bundle: it compares a live hash of the source inputs against the hash recorded
in `dev-build-stamp.json`. The stamp is what makes a build _visible_ as fresh, which makes it the commit record —
the same write-the-data-then-flip-the-pointer shape as a git ref update after its objects land, a write-ahead log's
commit record, or CPython's temp-then-rename `.pyc` write.

So the outputs do not need to land atomically as a set. One ordering rule carries the whole design:

> Build into a unique temporary directory, rename each output into place, and **rename the stamp last.**

Nothing is ever written at `dist/cli.js` — only renamed onto it — so a partial bundle cannot be observed there. A
reader checking before the stamp lands sees the old hash, judges stale, and rebuilds: redundant but safe. A reader
checking after sees the new hash, and the bundle it names is already complete. A reader mid-import keeps its open
descriptor on the previous inode while a new open gets the complete new file. Unique temporary directories keep
concurrent builders from colliding, and because the build is deterministic, last-rename-wins publishes identical
bytes.

**Accepted residual.** Two concurrent builders whose source changes between them can interleave renames so the
bundle comes from the later build while the stamp comes from the earlier one. If the source is then reverted, the
check reports fresh against a bundle built from different source. It requires concurrent rebuilds, a mid-build
source edit, and a revert; it self-corrects at the next source change; and the outcome — running a complete bundle
built from adjacent source — is milder than the warn-and-proceed behavior being removed. A single-writer lock
eliminates it, and content-addressed bundle filenames eliminate it differently (see § Alternatives); neither is
justified by a race that has not been observed. Revisit if it is.

**Prerequisite.** `tsup.config.ts` currently hardcodes the output directory inside its `onSuccess` hook, so an
overridden output directory would place the bundle in the temporary directory while the stamp and kernel schema
artifact still landed in `dist/` — precisely the split this design depends on avoiding. The bundler's
function form of `defineConfig` receives the CLI-derived overrides, including the output directory; the fix is to
derive `onSuccess`'s paths from those rather than from a literal.

## Alternatives

- **Affirm the mutator-only line** _(original Option 2 — rejected)_. Keep warn-and-proceed for advisory
  classifiers and document the asymmetry as deliberate. Rejected: it preserves a fail-open default, and the
  under-inclusiveness above means the line is not actually being held even for self-evident mutators.
- **Promote feeds-later-state classifiers** _(original Option 1 — rejected)_. Add `housekeep check` / `errand
  check` and any advisory whose output drives a later mutating decision. Rejected: it makes the enumeration larger
  and its boundary vaguer without changing the property that lets it drift.
- **Invert to a safe-list** _(rejected)_. Enumerate the read-only surface and refuse everything else. This fixes
  the failure _direction_ — a forgotten entry becomes a loud refusal rather than silent execution — and the safe
  set is intrinsically lower-churn than the dangerous one. Rejected anyway: it still requires auditing ~90
  commands up front and maintaining the result forever, and rebuild-on-invoke deletes that work rather than
  reusing it. Worth recording that if rebuild-on-invoke is ever backed out, the defensible axis for a safe-list is
  **provably side-effect-free** (the `make -q` / `migrate --check` / `terraform validate` category), never
  "this write is low-risk" — the latter is the shape no surveyed tool uses.
- **In-process re-exec, no launcher** _(rejected)_. Keep the check in the bundle and spawn a replacement process
  after rebuilding. Its only advantage is leaving the package `bin` field untouched; it costs argv/stdio/exit-code/
  signal handling and a recursion guard, and it leaves the self-reference in place rather than escaping it.
- **Refuse-only, no rebuild** _(not rejected — the fallback, and the proportionality baseline)_. Delete the
  taxonomy, refuse whenever stale, keep the check in the existing hook. This satisfies the safety goal completely,
  composes entirely with substrate that already exists, and is a net deletion. It is rejected as the _end state_
  only because unbounded refusal during CLI work invites the guard being worked around, which is the failure mode
  a safety guard can least afford. That argument is a prediction rather than an observation, and is the weakest
  link in the case for the heavier design — see § Unknowns and Assumptions.

On the narrower question of how a rebuild publishes its output:

- **Lock plus in-place write** _(rejected)_. A single-writer lock does not by itself make an in-place write safe,
  because a reader can still catch the bundle mid-write; the lock would have to cover the read side too, making it
  a cross-process reader/writer lock. That is the shape proposed for the analogous cache-clean race in
  `golang/go#31948` [[go31948]][go31948], and it is strictly more machinery than temp-and-rename, with stale-lock
  recovery on top.
- **Content-addressed bundle filenames** _(rejected, worth revisiting)_. Write `cli.<hash>.js` and have the stamp
  name the current one; publication becomes a single rename of one small file, and the interleaving residual above
  disappears entirely. Rejected because it breaks the fixed-path contract the test helpers rely on when they spawn
  the bundle directly, and because retired bundles would need collecting. The option to revisit if the residual is
  ever observed.
- **Import from the temporary directory directly** _(rejected)_. Would remove the rebuilding process's own
  exposure entirely, but the dev-check dependencies derive the package directory from the running bundle's
  location, so importing from a temporary path breaks that derivation.

### Prior art

The classification approach has no precedent worth inheriting. Across build systems (`make`, Bazel, Gradle,
Ninja), transparent-rebuild runners (`cargo run`, `go run`, `sbt`, `dotnet run`), and drift guards (Rails and
Django migration checks, `npm ci`, `yarn --immutable`, Cargo `--locked`, Go `-mod=readonly`, Terraform state and
saved-plan checks, Alembic), no surveyed tool classifies per-operation safety against a staleness condition at
runtime. The distinctions that do exist — `npm ci` versus `npm install`, `go build` versus `go mod tidy` — are
coarse, fixed at design time, and attached to a command's declared purpose rather than to a risk judgment.

The axis those tools actually use is whether the tool can fully remedy the staleness itself without external side
effects: build systems and runners rebuild; migration, lockfile, and state-version guards refuse because their
remedy touches state that is external and hard to reverse. Rebuilding a gitignored bundle from committed source
sits unambiguously in the first category.

Two contrasts are worth keeping. Rails hard-fails on pending migrations but only inside request-serving
middleware, while Django warns and starts anyway — two frameworks reaching opposite wholesale defaults on an
identical problem, which is a caution against treating either default as obviously correct. And Python's move
from timestamp-based to hash-based `.pyc` invalidation [[pep552]][pep552] was made for precisely the reason the
content-hash stamp was added here.

## Proportionality

Running `assess-design-proportionality` over the candidate returned **`revise`** with two findings, both applied
above:

- **`disproportionate-rigor` — the cross-process rebuild lock.** A lock guards a retryable, advisory path
  (redundant CPU), while the destructive path is already fully closed by refusing. Its lifecycle cost is not
  commensurate: stale-lock recovery, timeout tuning, liveness heuristics, and a cross-platform primitive choice
  that is genuinely contested on WSL and network paths. Removed from the candidate. The concurrency question
  reduces to atomic publication (§ Publication), and the worst case without a lock is a few wasted seconds of CPU.
- **`speculative-capability` — the auto-rebuild escape-hatch environment variable.** The precedent for one is
  real: tools that do work on invoke (Homebrew's auto-update, git's `gc --auto`) generate latency backlash and
  need an opt-out. But no concrete requirement for it exists here yet — whether `arc` runs in CI or unattended
  automation is unestablished. Deferred until a real call site needs it, rather than prepaid.

The baseline the method measures against is refuse-only, recorded as an alternative above. Every mechanism beyond
it buys ergonomics rather than safety, which is why the lock and the escape hatch could not justify their cost and
why the remaining increment rests on the guard-erosion argument named below.

## Unknowns and Assumptions

- **Whether changing the `bin` target requires a reinstall in existing worktrees.** Direct tracing shows
  `node_modules/.bin/arc` materialized as a symlink generated at install time, which implies a reinstall sweep
  across worktrees. Research indicates `npm exec` may instead resolve the current manifest's `bin` at invocation
  time for in-project use, which would make the transition free here and confine the concern to published-package
  consumers. These disagree; verify directly once the launcher exists rather than assuming either.
- **The guard-erosion premise is unvalidated.** The case for rebuilding rather than refusing rests on the claim
  that unbounded refusal during CLI work would lead to the guard being bypassed. That is a prediction. If it
  proves wrong, refuse-only is strictly simpler and the launcher is unnecessary.
- **Assumed: adopters are unaffected.** The package ships no `src/`, so the check short-circuits before doing
  anything on an installed copy. The launcher would still sit on every adopter invocation, so it must stay
  trivial, dependency-free, and excluded from the bundle — otherwise it acquires the staleness problem it exists
  to solve.
- **Assumed: test helpers keep bypassing the launcher.** They spawn the bundle directly and must continue to, so
  that a rebuild never perturbs the artifact under test.
- **Two operational wrinkles, both minor.** A process killed mid-build leaves its temporary output directory
  behind — gitignored litter, swept on a later run or simply ignored. And renaming can fail with a permissions
  error on Windows when antivirus or the search indexer holds a transient handle on the target, a documented pain
  in the npm ecosystem; it is only reachable for anyone running outside WSL.

## Discharged

- **Content-hash the dev-build guard's bundle inputs** _(routed 2026-07-13; landed 2026-07-23)_. The build writes
  `dist/dev-build-stamp.json` (`schemaVersion: 1`) hashing the metafile-selected source inputs; the check treats
  content as authoritative when both hashes are present and falls back to timestamp comparison when the stamp is
  missing or malformed — including the conservative fallback the capture asked for. No design work remains; the
  concern is recorded here because its outcome is load-bearing for this direction.

## Scope

Small — one file deleted, one small file added, localized changes to the build config, the package manifest, and
the guard call site, plus tests. One work unit, one PR; the safety change and the rebuild path are two phases of
one design, not two designs.

Evaluate in the dev-build and release-tooling domain, not as a work-routing fix. Distinct from
`self-hosting-manifest-freshness` (install-state manifest hashes rather than dev-build freshness) and from
`release-lifecycle` (release-model aggregation).

## Next

Formalize. `Class` is recorded as `Light` and still reads that way — the derivation is done, and the
implementation surface is one file removed, one small file added, and localized edits to the build config,
manifest, and guard call site.

Two items the spec must carry rather than leave to implementation: the rename ordering that makes the stamp the
commit record, and the `onSuccess` output-directory prerequisite that ordering depends on.

---

[thompson]: https://www.cl.cam.ac.uk/teaching/2324/R209/Reflections-Trusting-Trust.pdf
[pep552]: https://peps.python.org/pep-0552/
[go31948]: https://github.com/golang/go/issues/31948
