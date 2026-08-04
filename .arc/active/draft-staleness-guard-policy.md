# Draft: Dev-Build Staleness-Guard Hard-Fail Policy

- **Origin:** [internal] — routed from `USER-INBOX` at the work-routing-discipline housekeep drain (2026-06-01);
  the asymmetry was surfaced in that work unit's pre-PR review. Two later captures (2026-07-13, 2026-08-04) routed
  in and are folded into the body below.
- **Purpose:** Replace the guard's per-command hard-fail taxonomy with unconditional refusal and a one-second
  remedy, so a stale `dist/cli.js` can never silently execute a state-mutating command — and so the guard stops
  requiring a hand-maintained classification that must be extended every time a command is added.

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

**The enumeration is also already incomplete against a fresh build.** The guard names seventeen command paths; the
CLI exposes roughly ninety leaf commands. Durable-state mutators currently outside the set include `integrate`,
`archive`, `teardown`, `decompose`, `materialize`, `init`, `join`, `stub`, `set-stage`, `finalize`,
`repoint-design`, `park`, `resume`, `promote`, `demote`, and `rename`, plus `user load` / `pull` and
`locus attach` / `resolve`. So the drift is not merely a risk carried by stale bundles — the current bundle is
under-inclusive today, and closing that by hand would mean auditing the whole command surface and re-auditing it
forever.

Two properties of the surrounding system decide what to do about it:

- **Detection no longer false-positives.** The build writes a content hash of the bundle's real input graph to
  `dist/dev-build-stamp.json`, and the check treats matching hashes as fresh. Timestamp churn from a checkout or
  rebase no longer reads as stale, so a strict policy no longer fires spuriously. The hash covers first-party
  `src/**/*.ts` inputs only — a bundled-dependency bump or a build-config edit is outside its scope. That
  limitation is pre-existing and unchanged here, but it bounds what "detects exactly" claims: exact against
  spurious staleness, not against every way the bundle can drift from its inputs.
- **The remedy is cheap.** A runtime-only rebuild measures ~1.0s wall clock (~250ms of bundling). A full build is
  ~9.8s, of which ~8.8s is the `.d.ts` emit that the running CLI never loads.

Cheap detection plus a one-second remedy means a strict policy costs almost nothing to comply with. That is what
makes wholesale refusal affordable, and it is the fact the design turns on.

## Direction

Delete the taxonomy. The guard becomes: **detect, refuse if stale, and make the remedy one cheap command.**

1. **Remove `isHandoffCritical` and its tests.** The warn-and-proceed tier goes with it — that tier is the
   fail-open mode responsible for the original incident. Every invocation is either fresh or refused.
2. **Refuse on stale for every command**, with one named exception: the compaction-seed write still proceeds,
   because a seed produced by stale logic is revalidated when recovery reads it and is strictly better than no
   seed. The exception already exists as a single option test at the guard call site and stays exactly there.
3. **The exception keeps emitting the stale-build message.** The shipped `pre-compact-seed` harness hook
   string-matches that message to trigger its own repair-and-retry, so the text is a consumed contract rather than
   incidental output. Preserving it keeps the hook's existing self-repair working unchanged.
4. **Add a fast runtime-only build script**, exposed at the repository root as well as in the package, since all
   development invocation runs from the root.
5. **The refusal message names that fast script.** See below — this is a requirement, not wording.

### Why refuse rather than rebuild

Rebuilding on invoke is the ergonomically nicer behavior, and it is what comparable tools do. It is rejected here
because of one structural fact: **`arc` would be rebuilding `arc`.**

The freshness check lives inside the bundle whose freshness is in question. Code inside `dist/cli.js` cannot
rebuild and then run the new code — by the time it executes, the stale module graph is already resolved, and
nothing in-process can replace it. Transparent rebuild therefore requires moving the entry point out of the bundle
into a separate launcher, and that move is where the cost sits: the launcher needs its own copy of the freshness
logic (a second implementation of a hash contract, whose drift produces exactly the silent false-fresh this work
exists to eliminate), a package `bin` change that leaves every not-yet-reinstalled checkout running with no guard
at all, and a concurrent-publication mechanism for the rebuild's outputs.

That is also the distinction the prior-art survey obscures. The tools that transparently rebuild — `make`,
`cargo run`, `go run` — are each an outer runner _distinct from_ the artifact they rebuild. Their trusted core
already exists. Here it would have to be built, and the whole cost of the rebuild direction is the cost of
building it.

Two further properties favor refusal on its own terms:

- **Refusal is legible.** A refusal is a visible event with a stated reason. A silent rebuild is silent when it
  works and equally silent when it misbehaves — and its failure modes end in running stale code, which is the
  condition being guarded against.
- **The friction is one second.** The case for absorbing the launcher's cost was that unbounded refusal would
  invite the guard being worked around. At a one-second remedy that argument is weak; it was originally weighed
  against a believed ~27s remedy.

### Operator guidance is part of the design

The refusal is only cheap if the message says how to fix it in one second. Two things carry that and are therefore
design requirements rather than implementation detail:

- The fast build script must exist **at the repository root**, not only in the package — the root is where all
  development invocation happens.
- The refusal message must name **that** script. The message today names the full build, so shipping the refusal
  without rewording it would silently make the remedy ~9.8s and revive the friction argument the design just
  dismissed.

The `pre-compact-seed` hook's repair command should move to the same fast script for the same reason.

## Alternatives

- **Affirm the mutator-only line** _(original Option 2 — rejected)_. Keep warn-and-proceed for advisory
  classifiers and document the asymmetry as deliberate. Rejected: it preserves a fail-open default, and the
  under-inclusiveness above means the line is not actually being held even for self-evident mutators.
- **Promote feeds-later-state classifiers** _(original Option 1 — rejected)_. Add `housekeep check` / `errand
  check` and any advisory whose output drives a later mutating decision. Rejected: it makes the enumeration larger
  and its boundary vaguer without changing the property that lets it drift.
- **Invert to a safe-list** _(rejected)_. Enumerate the read-only surface and refuse everything else. This fixes
  the failure _direction_ — a forgotten entry becomes a loud refusal rather than silent execution — and the safe
  set is intrinsically lower-churn than the dangerous one. Rejected anyway: it requires auditing ~90 commands up
  front and maintaining the result forever, where refusing wholesale requires no audit at all. Worth recording
  that if a safe-list is ever revisited, its defensible axis is **provably side-effect-free** (the `make -q` /
  `migrate --check` / `terraform validate` category), never "this write is low-risk" — the latter is the shape no
  surveyed tool uses.
- **Launcher plus rebuild-on-invoke** _(rejected — revisit trigger recorded)_. Move the entry point above the
  bundle so a stale invocation rebuilds transparently instead of refusing. It is the nicer daily experience and it
  would additionally make `npx arc` work on a fresh clone before any build. Rejected on cost and risk: it requires
  settling where the launcher's freshness logic lives, how the rebuild's outputs publish atomically, how the `bin`
  transition avoids a fail-open window across existing checkouts, and where the compaction-seed exception sits once
  refusal moves out of the bundle — four open design questions, against a one-second remedy it would be saving.
  **Revisit if** the guard is observed being worked around in practice, which is the premise the direction rested
  on and which remains unobserved. Note that the cross-process publication half of that design overlaps
  `e2e-build-coordination`, which already owns that boundary.
- **In-process re-exec, no launcher** _(rejected)_. Keep the check in the bundle and spawn a replacement process
  after rebuilding. Its only advantage is leaving the package `bin` field untouched; it costs argv/stdio/exit-code/
  signal handling and a recursion guard, and it leaves the self-reference in place rather than escaping it.

### Prior art

The classification approach has no precedent worth inheriting. Across build systems (`make`, Bazel, Gradle,
Ninja), transparent-rebuild runners (`cargo run`, `go run`, `sbt`, `dotnet run`), and drift guards (Rails and
Django migration checks, `npm ci`, `yarn --immutable`, Cargo `--locked`, Go `-mod=readonly`, Terraform state and
saved-plan checks, Alembic), no surveyed tool classifies per-operation safety against a staleness condition at
runtime. The distinctions that do exist — `npm ci` versus `npm install`, `go build` versus `go mod tidy` — are
coarse, fixed at design time, and attached to a command's declared purpose rather than to a risk judgment.

The axis those tools use is whether the tool can fully remedy the staleness itself without external side effects:
build systems and runners rebuild; migration, lockfile, and state-version guards refuse because their remedy
touches state that is external and hard to reverse. Rebuilding a gitignored bundle from committed source sits in
the first category — but every tool in that category is an outer runner distinct from the artifact it rebuilds
(§ Why refuse rather than rebuild). The precedent supports transparent rebuild where a trusted outer core already
exists; it does not price building one.

Two contrasts are worth keeping. Rails hard-fails on pending migrations but only inside request-serving
middleware, while Django warns and starts anyway — two frameworks reaching opposite wholesale defaults on an
identical problem, which is a caution against treating either default as obviously correct. And Python's move
from timestamp-based to hash-based `.pyc` invalidation [[pep552]][pep552] was made for precisely the reason the
content-hash stamp was added here.

This survey is corroborative rather than load-bearing: it came from an external research pass that ran without a
verification stage, and the rejections above each stand on the drift argument independently. Re-check any specific
claim before a spec leans on it.

## Proportionality

The design is now its own proportionality baseline: it is a net deletion plus one script and one message, and
every heavier mechanism previously under consideration has been removed.

An earlier candidate carried a cross-process rebuild lock and an auto-rebuild escape-hatch environment variable;
`assess-design-proportionality` returned `revise` on both, as `disproportionate-rigor` and `speculative-capability`
respectively. Both are moot under this direction — the rebuild path they attached to is gone. The adversarial pass
that followed resolved the remaining increment the same way, in favor of the baseline.

## Unknowns and Assumptions

- **The guard-erosion premise is the revisit trigger, not an open question.** The case for transparent rebuild
  rested on the claim that unbounded refusal during CLI work would lead to the guard being bypassed. That is a
  prediction and remains unobserved. It does not block this direction; it is the condition under which the
  launcher alternative is reconsidered.
- **The entry point does not move**, so two things that would otherwise need protecting are unaffected by
  construction: adopters (the package ships no `src/`, so the check short-circuits on an installed copy) and the
  test helpers (they spawn `dist/cli.js` at its fixed path and continue to).
- **Detection scope is bounded** as recorded in § Problem — the stamp hashes first-party `src/**/*.ts` only.
  Widening it is a separate concern, out of scope here.

## Discharged

- **Content-hash the dev-build guard's bundle inputs** _(routed 2026-07-13; landed 2026-07-23)_. The build writes
  `dist/dev-build-stamp.json` (`schemaVersion: 1`) hashing the metafile-selected source inputs; the check treats
  content as authoritative when both hashes are present and falls back to timestamp comparison when the stamp is
  missing or malformed — including the conservative fallback the capture asked for. No design work remains; the
  concern is recorded here because its outcome is load-bearing for this direction.

## Scope

Small. One file and its test deleted; the guard call site simplified to refuse-or-except; a fast build script added
at the package and root levels; the refusal message reworded; the seed hook's repair command repointed at the fast
script. `CONTRIBUTING.md` documents the enumerated critical set and the warn tier by name and needs rewriting to
match. One work unit, one PR. `Class` is `Light`.

Nothing in this work unit touches how build outputs publish. Cross-process build coordination — concurrent
builders, atomic publication of `dist/` — belongs to `e2e-build-coordination`, which already owns that boundary.

Evaluate in the dev-build and release-tooling domain, not as a work-routing fix. Distinct from
`self-hosting-manifest-freshness` (install-state manifest hashes rather than dev-build freshness) and from
`release-lifecycle` (release-model aggregation).

## Next

Formalize. `Class` is recorded as `Light` and still reads that way — the derivation is done, and the
implementation surface is one file removed, one branch simplified, one script added, and text updates.

Three items the spec must carry rather than leave to implementation, because each is load-bearing and each looks
like a detail:

- The refusal message must name the fast build script, and that script must exist at the repository root.
- The compaction-seed exception must keep emitting the stale-build message, because the `pre-compact-seed` hook
  string-matches it to drive its own repair-and-retry.
- `CONTRIBUTING.md`'s description of the guard must be rewritten, not merely trimmed — it documents the warn tier
  and the enumerated command set as current behavior.

---

[pep552]: https://peps.python.org/pep-0552/
