# Draft: CLI Substrate Adoption

**Purpose:** Introduce four foundational libraries (zod, execa, type-fest, neverthrow) to the ARC CLI;
migrate priority validation surfaces to zod schemas (session-init envelope, audit log, post-WOR
meta-file frontmatter, config); fully migrate git invocation through execa; add neverthrow as
available substrate with `Probe<T>` → `Result<T, E>` conversion; adopt type-fest opportunistically.
Lay the typed-validation and ergonomic-error substrate that the parallelism trio and the three
post-trio architecture-remediation plans consume.

- **State:** Draft — pre-PRD exploration captured during exploratory Effect TS evaluation session
  2026-05-17. Two-WU split (substrate / introspection) and post-WOR sequencing settled during
  facilitation; remaining details (priority site enumeration, execa feasibility confirmation, schema
  home convention) carry to PRD time.

- **Created:** 2026-05-17

- **Origin:** Surfaced during a library landscape review motivated by accumulated validation,
  error-handling, and git-invocation surfaces in the CLI outgrowing the original minimal-deps
  rationale. Specific gaps (hand-rolled validation scattered across audit-log, session-init probe
  parsing, and the meta-file frontmatter reader; the custom `gitExec` wrapper having lost ground
  to mature `child_process` alternatives; the session-init `Probe<T>` reinventing
  `Result<T, E>` ergonomics; bespoke type-utility helpers in multiple modules) compound on every
  new feature that touches these substrates — most concretely, the parallelism trio (Worktree
  Foundation specifically). Effect TS was considered as a comprehensive alternative to the
  lib-by-lib approach and deferred (see § Design Decisions); the selected libraries form this WU.

---

## Inbound Buffer — Pending Integration

> *Routed-in concerns pending holistic integration into the body at this WU's next planning iteration*
> *(`drain-inbox § 5`); each carries its origin. Integrate — or consciously reject — at iteration.*

### `[ ]` **Uniform non-interactive handling for agent-invoked prompting commands**

- *Routed from:* `USER-INBOX § Backlog` (`WU_Target: cli-substrate-adoption`), agile-wu-lifecycle cohort
  housekeep drain (2026-06-04). Captured during `agile-wu-lifecycle` graduation (2026-06-03) — `arc user open
  agile-wu-lifecycle` hung on the stale-CWC-subdir confirm; worked around by seeding the user workspace manually.
- *Concern:* `arc user open <name>` hangs the agent when its defensive "stale subdir from prior WU" confirm fires
  — no `--yes` / `--no-input` flag, and the confirm does not auto-skip under non-TTY / agent invocation. Worktree
  Foundation's cold-start path (`arc start --here`) explicitly designed its confirm to auto-skip the agent's
  non-interactive call, but that behavior is not uniform — `arc user open` (and likely other prompting
  subcommands) still block.
- *Proposed:* audit prompting subcommands; establish a uniform non-interactive contract
  (auto-skip-to-safe-default under non-TTY, or an explicit flag) so agent / automation invocation never hangs.
  `arc init --yes` is the established precedent for the flag pattern.

### `[ ]` **Evaluate a real CLI command for workflow-markdown files + clearer "load and follow" skill wording**

- *Routed from:* `USER-INBOX § Backlog` (`WU_Target: TBD` → routed here at drain), housekeep drain (2026-06-08);
  captured at `scalable-authoring-pipeline` session init.
- *Concern:* `arc-session`'s skill body says to "Run" `…/session-init.md`, which reads like a CLI invocation
  target rather than "load and follow this agent workflow." This repo's `npx arc …` bootstrap rule sharpens the
  ambiguity: `npx arc …/session-init.md` is a plausible but invalid interpretation.
- *Proposed:* Evaluate two related questions, either landable alone: (a) rephrase the skill body to "load and
  follow" the markdown workflow, and note that workflow-internal CLI calls use `npx arc …` here; (b) decide
  whether a real ARC CLI command for workflow-markdown files is useful as a validator, inspector, context
  loader, checklist emitter, or eventual workflow runner — the CLI-surface half this WU's substrate is
  positioned to host.
- *Scope:* touches self-hosting skill wording, adopter-facing skill generation, and possible CLI surface area;
  the wording fix is small, the CLI-command question is the substantive / trackable half.

### `[ ]` **Require commitment-level + priority as explicit inputs at stub creation (no silent `provisional`/`P3`)**

- *Routed from:* `USER-INBOX § Backlog`, housekeep drain (2026-06-13); captured during the `arc-plan-conductor`
  decomposition (2026-06-12) — the agent defaulted a new stub to `provisional`; corrected to planned/P2. (That
  decomposition's originating stub is since retired; the concern stands on its own.)
- *Concern:* stub creation silently defaults commitment-level to `provisional` and priority to `P3` when an agent
  scaffolds a stub, but both are the maintainer's explicit call — not maturity, not who minted the stub.
  `drain-inbox § 5` already says "the user decides; never hard-default silently" for commitment-level, but that
  rule isn't mechanically enforced; priority has no equivalent guard at all.
- *Proposed:* make commitment-level (`provisional` | `planned`) **and** priority **required inputs** across the
  stub-creation paths — `arc start` / cold-start, `decompose-work-unit`, drain new-stub scaffolding,
  `init-work-unit` — a mechanical prompt / required-arg rather than agent discretion. The non-TTY half composes
  with the "Uniform non-interactive handling" buffer item above (no silent default under non-TTY either: fail, or
  require an explicit flag). Both axes are one "don't assume the maintainer's commitment / attention level" concern.
- *Home split:* the mechanics (agent-invoked prompting-command contract + required-arg wiring) land here; the
  **mandatory-fields policy** ("commitment + priority are the maintainer's explicit call at every stub-creation
  path") cross-refs `strategy-work-organization` as the contract's authoritative statement. Kept as one capture,
  not split, per the drain.
- *Narrowed (routed from `USER-INBOX § Backlog`, housekeep drain 2026-06-14):* the **required-at-primitive**
  half is no longer this WU's — `lifecycle-transition-core` mints a unified `stub` primitive that every
  create-path (`start` / cold-start, `decompose`, drain new-stub scaffolding, `init`-resume) routes through, and
  puts the no-silent-`provisional`/`P3` contract on that one chokepoint (see its draft § "`stub` creation
  contract"). What stays here is the **generic non-TTY prompting-command substrate** the `stub` primitive rides
  on — the interactive-elicit + fail-or-require-flag-under-non-TTY behavior, shared with the "Uniform
  non-interactive handling" item above. The mandatory-fields policy statement still cross-refs
  `strategy-work-organization`.
- *Scope:* multi-step — the non-TTY prompting substrate plus CLI / workflow surfaces (two-copy).

### `[ ]` **Swap reconcile-branch's hand-rolled remote-delete classification onto structured git errors**

- *Routed from:* `USER-INBOX § Backlog` (`WU_Target: cli-substrate-adoption`), housekeep drain (2026-06-17);
  captured during `lifecycle-transition-core` integration — PR #103 CodeRabbit review (2026-06-16).
- *Concern:* `reconcile-branch.ts`'s `delete` mutator distinguishes a benign remote-delete failure (a never-pushed
  branch — git's "remote ref does not exist") from actionable ones (auth / connectivity / wrong remote) by
  **substring-matching `err.stderr`**. That is the robust shape available against today's bare `execFile`-wrapping
  git seam, but it is locale-fragile and has no structured home in the executor.
- *Proposed:* when this WU lands its execa / neverthrow git layer, replace the stderr-substring match with
  structured `Result` error variants (typed exit-code + error kind), and apply the same posture to any other
  hand-rolled git-error string-matching the executor's mutators picked up in `lifecycle-transition-core`.
- *Status:* the correctness fix (propagate actionable failures) already landed via exit-code / stderr
  classification; this is the follow-up refactor to the structured layer only.

### `[ ]` **Migrate decompose-matrix's hand-rolled cut-map validator onto a zod schema**

- *Routed from:* `USER-INBOX § Work Unit` (`WU_Target: cli-substrate-adoption`), housekeep drain (2026-06-22);
  captured during `decompose-matrix` create-spec (2026-06-21), forward-compat pass against this WU and
  `schema-introspection-layer`.
- *Concern:* `decompose-matrix` ships `arc decompose <origin> --cut-map <file>` with a bespoke boundary
  parser-validator for the cut-map (members, edges, distribution, dispositions), because zod isn't a CLI dep until
  this WU. It is deliberately authored as a migration drop-in: a single parse/validate entry point, co-located
  under `lib/work-unit/`, with a versionable `schemaVersion`-ready top-level shape.
- *Proposed:* fold the validator onto a zod schema in this WU's validation-surface sweep, alongside the existing
  enumerated targets (cold-start spec-input parser, branch-gone cascade union, reconcile-branch error
  classification). Once schematized, `schema-introspection-layer` can publish the cut-map contract via `arc schema`.

---

## Problem / Motivation

The CLI has grown to a point where the original "minimal deps" rationale costs more than it saves.
Four substrate gaps compound on every new feature that touches validation, git invocation, error
ergonomics, or type utilities:

1. **Validation is hand-rolled and scattered.** `audit-log.ts:validateEntry()` is rigorous but
   bespoke; `worktree-sync.ts` parses git output via string matching; the session-init JSON
   envelope is typed in TS but never runtime-validated against its consumer (the agent across a
   process boundary). Each new validation surface is a fresh hand-rolled parser-validator pair.

2. **Git invocation goes through a thin custom wrapper.** `lib/io-context.ts:gitExec` wraps
   `child_process.execFile` directly. Lost ground to mature alternatives: no `AbortSignal`
   support, weaker error messages (stderr not embedded in the thrown error), no killSignal
   control, manual exit-code-to-rejection handling per site.

3. **`Probe<T>` reinvents `Result<T, E>` ergonomics.** The session-init probe slot type is a
   well-shaped hand-rolled `{ok: true, value} | {ok: false, error}`. Composition (`.map`,
   `.mapErr`, `.andThen`) is per-site boilerplate.

4. **Type-utility helpers are scattered or absent.** Bespoke `Promisable`-shaped helpers and
   `SetRequired`-shaped patterns surface in multiple modules; no shared utility surface.

None of these are bugs today. The compounding cost shows up wherever new validation, error
ergonomics, AND cancellable git invocations land at once — a new feature touches all four
substrates simultaneously, multiplying per-site cost. This WU captures the four selected adoptions
as a coherent substrate pass rather than handling each substrate in its own WU.

Under the 2026-05-20 resequence (WF ahead of CSA), WF's hand-rolled
`git worktree list --porcelain` parsers (3 sites), branch-gone cascade evidence discriminated
union, cold-start spec input parser (5 variants), cross-WU note payload validation, and
worktree-aware additions to the session-init envelope become migration targets for this WU's
sweep — sites already shipped that CSA modernizes alongside its other priority surfaces. That's
the typical CSA migration shape (codify a settled shape after it ships), not a design coupling.
Other downstream consumers — Coord Probe, the architecture-remediation cluster, Schema
Introspection Layer — inherit substrate as usual.

These gaps were tractable individually but compound when adjacent. The four selected adoptions
ship coherently here rather than spreading across the consumers.

---

## Scope

### In scope

1. **zod adoption with priority migrations.** Add `zod` as production dep; migrate priority
   surfaces to zod schemas:
    - **Session-init JSON envelope** — agent–CLI process boundary contract; highest value. Schema
      lives in `lib/session-init/schemas.ts` (or equivalent — PRD-time decision on schema-home
      convention); CLI validates on emit; agent / tests validate on consume.
    - **Audit-log entry** — replace hand-rolled `validateEntry()` with zod schema for v1; scaffold
      `z.discriminatedUnion` over `schemaVersion` for future v2.
    - **Post-WOR meta-file frontmatter** — codifies the R58 shape that WOR ships (H1 + grouped
      field blocks). Schema validates round-trip from disk reads.
    - **Configuration file** (`arc-config.yml`) — settings parsing currently hand-rolled around
      `js-yaml`; zod schema validates the parsed object.
    - **Per-site convention:** zod schemas live at I/O boundaries; internal code consumes
      already-parsed strongly-typed values; types are inferred via `z.infer<typeof X>` (no parallel
      hand-written types). Use `parse()` for internal CLI-emit paths (programmer-error-throws);
      `safeParse()` for consume paths where graceful handling matters.
    - **Out of WU-A:** probe-output parsing for individual git commands beyond `git worktree list`,
      scattered string-matching parsers, every config-key validation site. Captured to the
      follow-up "Complete CLI Substrate Migration" WU (placeholder; named at WU-A integration).

2. **execa migration — full sweep.** Add `execa` as production dep; replace `child_process.execFile`
   usage throughout and migrate all callers:
    - Production sites: ~81 (grep baseline; PRD-time enumeration confirms).
    - Test sites: ~28 test files mocking `gitExec` / `execFile` / `stubGitExec`.
    - Pattern: drop `gitExec` if redundant after migration, or retain as a thin pass-through if it
      adds value (DI seam for tests, naming clarity for ARC's specific call shape). PRD-time
      decision.
    - Test mocks update to match execa's interface; `stubGitExec` retires or evolves into an
      execa-shaped equivalent.
    - Gain `AbortSignal` support uniformly — downstream value for any cancellable-operation use
      cases.
    - **Feasibility check at PRD:** spot-check 3–5 representative call sites to confirm 1:1
      mechanical migration. Edge cases that could downgrade to hybrid (wrapper internals + partial
      caller migration with named follow-up): binary stdout handling, large-stdout streaming,
      signal propagation differences, sites depending on `execFile`-specific behavior.

3. **neverthrow availability and `Probe<T>` conversion.** Add `neverthrow` as production dep:
    - Convert `Probe<T>` (the session-init probe slot type, `{ok, value} | {ok, error}`) to
      `Result<T, ProbeError>`. Strongest neverthrow showcase; agent-visible contract via the
      session-init envelope; conversion in WU-A migrates WF's already-shipped probes onto the
      `Result` shape, and downstream code (Coord Probe, the introspection layer in WU-B) builds
      on it directly.
    - Evaluate `AuthorizationDecision` in the release module for conversion. Today it's a bespoke
      discriminated union with per-code refusal payloads (10–15). Fold into
      `Result<void, AuthorizationRefusal>` with the refusal as the error type, or keep bespoke?
      PRD-time decision — argument for conversion is ergonomic consistency; argument against is
      that the bespoke union carries per-code structure (numeric codes, structured payloads)
      that's harder to express through a generic Result.
    - Other call sites: no forced wholesale migration. Opportunistic adoption thereafter; named
      follow-up WU captures the comprehensive sweep.

4. **type-fest addition.** Add `type-fest` as dev dep (zero runtime cost):
    - No bulk migration; absorb naturally as bespoke type helpers are encountered (e.g.,
      `Promisable`, `SetRequired`, `JsonValue`, `Merge`, `PartialDeep`).
    - PRD enumerates the bespoke type-utility sites currently in `lib/types.ts` and equivalents;
      WU-A replaces the obvious wins.

5. **Coordination patches against the three architecture-remediation plans.**
    - Update `plan-lib-layer-type-extraction.md`, `plan-sync-handler-decomposition.md`,
      `plan-user-sync-module-split.md` with cross-references noting WU-A is upstream substrate;
      their scopes inherit zod schemas + Result types.
    - **No scope absorption** — those plans remain independent WUs in the post-trio cluster.

6. **Follow-up WU stub.** Create a thin `plan-cli-substrate-migration-completion.md` (working name)
   in `backlog/technical/` capturing the sites WU-A defers. Comprehensive vision preserved without
   inflating WU-A's scope. Placeholder; elaborated when WU-A nears integration.

### Out of scope

- **Schema-driven CLI introspection layer** (`arc schema list/get`, generated JSON Schemas shipped
  as artifacts, agent-facing contract publication) — see `plan-schema-introspection-layer.md`
  (WU-B). Hard downstream of WU-A.

- **State-machine codification for WU lifecycle.** Separate downstream WU; WU-A's zod schemas for
  State enum + transition events form latent substrate but the machine itself, guard logic, and
  transition dispatch are not in scope. Defer until WOR + trio + AWL ship to avoid codifying
  during churn.

- **Effect TS adoption.** Evaluated and deferred. Revisit triggers in § Pressure Points.

- **Wholesale conversion of every validation site to zod.** Explicit follow-up WU
  (`plan-cli-substrate-migration-completion.md`) completes the sweep post-trio.

- **Wholesale conversion of every Result/Option site to neverthrow.** Opportunistic post-WU-A;
  named in follow-up WU.

- **Type relocation per `plan-lib-layer-type-extraction.md`.** Its own WU; WU-A doesn't fold it in.
  WU-A's `lib/<subsystem>/schemas.ts` convention happens to align with the neutral-`lib/*/types.ts`
  direction, but the type-relocation work itself stays separate.

- **Sync handler / user-sync module restructuring** (`plan-sync-handler-decomposition.md`,
  `plan-user-sync-module-split.md`). Own WUs; WU-A provides substrate they consume.

- **Versioned config-key migration registry.** Captured in BACKLOG-TECHNICAL.md; orthogonal
  concern.

---

## Design Decisions

### Library selection rationale

- **zod over valibot / arktype / @effect/schema.** Wide TS-community familiarity, strongest
  ecosystem signal, well-documented contributor onboarding path. Bundle size (~150KB minified)
  acceptable for an npm-installed CLI; not bundle-constrained like browser code. @effect/schema
  considered and rejected to avoid Effect coupling without Effect adoption. valibot's smaller
  bundle and arktype's TS-native syntax are real but unnecessary advantages here; zod's
  familiarity wins for contributor-onboarding.

- **execa over keeping `child_process`.** Promise-native API; better error messages (command +
  stderr embedded in thrown error); `AbortSignal` support; killSignal control; automatic
  exit-code-to-rejection. Mature, widely used, well-maintained.

- **neverthrow over fp-ts / oxide.ts / building bespoke.** Smallest viable Result/Option library
  (~5KB); well-typed combinators; no commitment to broader functional ecosystem. fp-ts is heavier
  predecessor without payoff for ARC's scale; Effect deferred per separate analysis.

- **type-fest.** TS utility-type collection; zero runtime cost; table-stakes for typed TS
  codebases at ARC's scale.

### Boundary enforcement model

Schemas live at I/O boundaries; internal code consumes already-parsed strongly-typed values:

- **CLI emits envelope:** validate-on-emit (catches CLI bugs immediately at composition site,
  before they leave the process).
- **Agent / test consumes envelope:** validate-on-consume (catches contract drift; useful for the
  cross-process contract specifically).
- **`parse()` for internal CLI-emit paths** (throw on programmer error; we control both sides).
- **`safeParse()` for consume paths** where the consumer wants graceful handling.

This means the session-init envelope schema has two enforcement points (emit + consume) but most
other surfaces have one (emit only, internal consumers trust the type).

### Phased migration with named follow-up WU

Priority sites in WU-A; explicit follow-up WU named on roadmap so the comprehensive vision isn't
lost. Distinguishes urgent-substrate-for-trio from nice-to-have-completeness. The follow-up WU's
existence is a discipline mechanism — pressure to absorb "well, this one too…" into WU-A is
relieved by knowing there's a named destination for it.

**execa is the exception:** full migration in WU-A because it's mechanical and bounded
(~109 sites is large but well-defined; partial migration creates dual-pattern tech debt where
every contributor has to decide which wrapper to use, and every test maintainer has to know which
mocking pattern applies). Hybrid downgrade reserved for the feasibility-failure case only.

### WU-A vs WU-B split

- **WU-A** = internal substrate. Schemas exist; validation happens at boundaries; types are
  stronger. Consumers (other WU code) inherit it transparently.
- **WU-B** = consumer-facing capability. Agents and contributors can introspect the contracts via
  `arc schema` CLI surface; generated JSON Schemas as shipping artifact.

Different value props, different audiences, different stability commitments. The schemas exist as
internal artifacts after WU-A; making them externally introspectable is a feature commitment
(public contract surface, versioning policy, deprecation discipline) that earns its own
elaboration.

### Effect TS deferral

Effect TS was considered as a comprehensive alternative to the lib-by-lib approach. Not
selected: its strongest case (structured concurrency via `Effect.forEach` + `Scope`-based
resource management) does not apply to the agile-parallelism cohort — Worktree Foundation is
methodology + advisory mechanism, not CLI-orchestrated parallel git operations. Existing CLI
patterns (release module's `AuthorizationDecision`, session-init's `Probe<T>`) are already
near-ideal hand-rolled implementations of what Effect would provide at higher cost (learning
curve, bundle size, ecosystem boundary friction).

**Reconsideration triggers** for revisiting Effect adoption:

- A WU lands that requires CLI-side parallel orchestration of cancellable operations across ≥2
  sites where structured concurrency or `Scope`-based resource management would materially
  reduce complexity.
- A WU requires retry-with-backoff schedules across multiple operation types where Effect's
  `Schedule` would replace bespoke per-site retry logic.
- ARC's CLI grows beyond the current scale (~50 source files, ~5–8k LOC) to a point where
  `Layer`-based DI provides meaningful leverage over the current function-DI pattern.

None of these triggers are anticipated in the post-trio sequencing as currently scoped.

### Schema home convention

Provisional: `lib/<subsystem>/schemas.ts` co-located with subsystem code (each subsystem owns its
contracts). Alternative: `lib/schemas/<subsystem>.ts` centralized (single place to introspect what
contracts exist). PRD-time confirms; co-located is recommended for locality of reasoning.

---

## Dependencies and Sequencing

### Upstream

- **Work Organization Reform** (in progress; current WU): Hard dependency. WOR reshapes meta-file
  shape (R58), lifecycle State enum (4-state model), and field model. WU-A writes zod schemas for
  these things; starting before WOR ships means schemas codify a moving target. Wait for WOR
  integration before WU-A activates.
- **Worktree Foundation:** Sequencing antecedent (per 2026-05-20 resequence). WF ships first so
  this WU's sweep targets already-shipped WF sites (parsers, probes, cascade evidence union,
  spec-input parser) — the typical "codify a settled shape after it ships" migration shape, not
  a design coupling. Operationally, WF lands first to unlock parallel-WU work across worktrees;
  this WU then runs as a parallel sibling alongside arc-plan Conductor (post-WF parallel layer).

### Sibling (parallelizable)

- **arc-plan Conductor.** Post-WF parallel candidate. Different file scopes (Conductor touches
  `.arc/system/workflows/` + skills; WU-A touches `packages/arc-framework/src/`). Cognitive-load
  match favors this pair — Conductor reads as design-heavy (canonical entry verb, depth model,
  spec-flow contract); WU-A reads as mechanical (zod schema codification of WOR-settled shapes,
  ~81-site execa sweep, well-defined neverthrow conversion). Design + mechanical pairs cleanly
  for solo execution. Final parallel-vs-sequential call confirms at PRD time.
- **Coord Probe.** Post-WF parallel candidate. Lighter design surface than Conductor (adapter
  contract + mechanical wiring); could also pair with WU-A or with Conductor depending on
  activation timing.

### Downstream

- **Worktree Foundation migration targets:** WF ships first under the resequence; WU-A migrates
  the hand-rolled sites alongside its broader sweep:
    - `git worktree list --porcelain` parser (3 sites: branch-gone cascade, activation-time
      concurrency check, cold-start primitive) → zod parser-don't-validate
    - Branch-gone cascade evidence carriage → zod discriminated union over signal sources
      (worktree list / status files / recently-active branches / coord-probe / fallback)
    - Cold-start spec input parser (5 variants: file pointer / URL / issue link / ARC plan /
      name-plus-description) → zod discriminated union
    - Cross-WU file merge note payloads → zod validation on read
    - Worktree-aware probe slots added to the session-init envelope schema → build-time
      validation of slot additions
    - Git invocations → execa
    - Concurrent push reconcile error handling → execa's typed errors
- **Coord Probe:** Consumes execa for `gh` CLI invocations (GitHub adapter); zod for `gh` output
  parsing if introduced; neverthrow `Result` for the probe's signal-source results.
- **Schema Introspection Layer (WU-B):** Hard dependency. Consumes WU-A's schemas directly;
  WU-B's `arc schema` surface exposes them via CLI.
- **Lib-Layer Type Extraction:** Inherits `lib/<subsystem>/schemas.ts` convention as the new
  schema-home pattern; type re-homing scope shrinks since schemas already live in `lib/`.
- **Sync Handler Decomposition:** Inherits zod schemas for sync-related envelopes; restructure
  scope shrinks (don't reinvent validation when extracting pure-matrix logic).
- **User-Sync Module Split:** Inherits zod schemas for user-sync state; restructure scope shrinks.
- **Follow-up "Complete CLI Substrate Migration" WU** (placeholder
  `plan-cli-substrate-migration-completion.md`): Comprehensive sweep of remaining zod / neverthrow
  migrations. Scoped at WU-A integration; runs after trio + 3 remediation plans.

### Recommended sequencing

```text
WOR (in progress) ──► Worktree Foundation
                       │
                       ├──► WU-A (CLI substrate)    ┐
                       ├──► arc-plan Conductor      ├ post-WF parallel candidates
                       └──► Coord Probe             ┘   (pick pairs by cognitive-load match)
                       │
                       └──► AWL ──► CWC
                                     │
                                     ├──► WU-B (introspection)              ┐
                                     ├──► Lib-Layer Type Extraction         │ post-trio
                                     ├──► Sync Handler Decomposition        │ parallel
                                     ├──► User-Sync Module Split            │ cluster
                                     └──► Complete-Migration follow-up      ┘
```

---

## Pressure Points and Risks

### execa migration scope creep

Sized at ~81 production + ~28 test sites; one missed dependency in the codebase could push the
total higher. Mitigation: PRD-time site enumeration with grep + AST query; explicit cutline for
"in this WU" vs "follow-up." Hybrid downgrade (wrapper internals only + opportunistic caller
migration) is an acceptable fallback if feasibility surfaces edge cases.

### Test-mock pattern churn

Migrating execa changes the shape of test stubs (`stubGitExec` → new helper, or retired entirely).
Risk: 28 test files updated mechanically miss edge cases. Mitigation: Tier 1 + Tier 2 gate runs
catch regressions; PRD-time pilot migration on one representative test file validates the pattern
before scaling to the rest.

### Zod schema-vs-type drift during WU-A

Internal pattern is "schema first, type inferred." Existing TS types exist for all migration
targets. If WU-A introduces zod schemas without removing the pre-existing types, drift opportunity
exists. Mitigation: replace-then-infer discipline at each migration site; optional lint check that
consuming code uses inferred type, not duplicate hand-written one (PRD-time decision on whether to
add the lint rule).

### Bundle size growth

npm-installed CLI; install size impacts new-user friction. Adding zod (~150KB) + execa (~50KB) +
neverthrow (~5KB) + type-fest (~0KB runtime) = ~200KB added. Acceptable; install size already
dominated by Node + tsup-built dist. Document the trade-off in PRD; not a blocker but worth
explicit acknowledgment for adopter-facing release notes.

### Migration depth boundary discipline

"Phased — priority sites" risks scope creep during execution ("well, this one too…"). Mitigation:
PRD enumerates the exact priority site list; out-of-list sites get captured to the follow-up WU's
plan-doc inline rather than absorbed into WU-A. The named follow-up WU is the discipline lever —
without it, every adjacent site looks like part of WU-A.

### Coordination drift across the 3 architecture-remediation plans

WU-A claims to provide substrate the 3 plans consume; those plans may have shifted scope or
already shipped if WU-A integration slips. Mitigation: PRD-time patch to each of the 3 plans
noting the WU-A relationship; revisit at WU-A integration if any of the 3 plans has shifted scope
materially.

### Effect TS reconsideration triggers

If WU-A execution reveals concurrency-heavy code emerging that Effect would handle better, the
deferral may need revisiting. Mitigation: PRD documents reconsideration triggers (see § Design
Decisions). WU-A execution surfaces evidence either way; absence of triggers confirms the
deferral.

### `AuthorizationDecision` conversion is non-trivial

The release-module bespoke discriminated union has per-code structured payloads (numeric codes,
typed refusal details, formatting hooks). Converting to `Result<void, AuthorizationRefusal>` where
`AuthorizationRefusal` is itself a discriminated union may be ergonomic in one place but lose the
per-code structure that makes the current formatRefusal logic clean. PRD-time decision on whether
this conversion belongs in WU-A at all; deferring it to opportunistic post-WU-A is defensible.

---

## Open Questions

### Schema home convention

`lib/<subsystem>/schemas.ts` co-located with subsystem code, or `lib/schemas/<subsystem>.ts`
centralized? Probably co-located (locality of reasoning; each subsystem owns its contracts);
PRD-time confirms.

### Generated JSON Schemas as build artifact in WU-A or WU-B

WU-A could generate JSON Schemas from zod definitions during build and emit them as artifacts
(useful for testing and as a stable intermediate format without exposing them via CLI). WU-B then
adds the CLI surface on top of the artifacts. Question: is the build artifact in WU-A's scope or
WU-B's? Soft boundary; decide at PRD time. Argument for WU-A: it's a natural by-product of having
zod schemas. Argument for WU-B: shipping artifacts is a public-contract commitment, fits the
consumer-facing framing.

### `AuthorizationDecision` → `Result` conversion in or out

See Pressure Points. PRD-time decision; defensible either way.

### Naming for the follow-up migration WU

`plan-cli-substrate-migration-completion.md` is a working name. Placeholder; resolved when the
follow-up WU is drafted.

### Strict-emit-validation default — on or off

"Validate envelope at every emit site in dev/CI; allow opt-out in prod" vs always-on. Cost
question (small per-call overhead) plus operational question. PRD-time decision; recommended
default is always-on (cost is sub-millisecond; catches CLI bugs early).

### `Probe<T>` → `Result<T, E>` conversion in WU-A

Strong argument for inclusion (agent-visible contract via session-init envelope; downstream WUs
inherit `Result` shape; neverthrow earns its keep). Weak counter-argument (it's a substrate move
that ripples through all probe consumers; could split to follow-up). Recommended: include in WU-A.
PRD confirms.

---

## Scope Estimate

**Medium-large.** Multi-week solo-dev WU.

Provisional phases (PRD restructures and sizes):

1. **Library introduction.** Add deps; set up build/typecheck infrastructure; baseline tests
   pass; documentation of "we use these and here's why" added to relevant project strategy doc.
2. **zod — session-init envelope.** Schema declaration; emit-side validation; consume-side
   validation in tests; agent-side documented contract surface.
3. **zod — audit log.** Replace `validateEntry()`; v1 schema as baseline; v2
   discriminated-union scaffold ready for future use.
4. **zod — meta-file frontmatter + config.** Post-WOR shape; replaces hand-rolled parsing.
5. **execa migration — wrapper internals + caller sweep.** Full sweep across ~81 production +
   ~28 test sites; test mocks updated.
6. **neverthrow integration.** `Probe<T>` → `Result<T, E>` conversion; release
   `AuthorizationDecision` evaluation (in or defer per PRD decision).
7. **type-fest opportunistic adoption.** Replace bespoke helpers naturally encountered.
8. **Cross-plan patches.** Update the 3 remediation plans + create follow-up "Complete Migration"
   plan-doc stub in `backlog/technical/`.
9. **Documentation / testing / examples.** Standard closing — strategy doc on the typed-substrate
   pattern, examples in QUICK-REFERENCE, contributor-facing guidance on adding new zod schemas.

Phases 2–4 (zod) potentially parallelize within the phase set. Execa (phase 5) is a single big
sweep that may want its own quality-gate checkpoint. Neverthrow (phase 6) can run alongside
phase 5 if both touch different files. PRD optimizes the phase ordering.

---

## Related Plans

- **`plan-schema-introspection-layer.md`** (WU-B) — Consumer-facing CLI introspection surface
  built on WU-A's schemas. Post-trio parallel cluster.
- **`plan-lib-layer-type-extraction.md`** — Inherits `lib/<subsystem>/schemas.ts` convention from
  WU-A; type re-homing scope shrinks.
- **`plan-sync-handler-decomposition.md`** — Inherits zod schemas for sync envelopes from WU-A.
- **`plan-user-sync-module-split.md`** — Inherits zod schemas for user-sync state from WU-A.
- **`plan-worktree-foundation.md`** — Sequencing antecedent (per 2026-05-20 resequence); WF
  ships first and its hand-rolled sites (worktree list parser, branch-gone cascade evidence,
  cold-start spec input, cross-WU note payloads, envelope additions) become migration targets
  for this WU's sweep.
- **`plan-coord-probe.md`** — Consumes execa for `gh` invocations; potential zod consumer for
  adapter output parsing.
- **`analysis-cli-architecture-solid-dry-audit.md`** — Source audit for the 3 remediation plans;
  cross-referenced at PRD time for any lib-related findings WU-A should absorb (audit was
  structural; WU-A is substrate-level — likely orthogonal but confirm).

---

## Backlog Inbox Absorption (2026-05-19, WOR Task 6.3.b)

*Entry folded from retired `backlog/technical/BACKLOG-TECHNICAL.md` during WOR Task 6.3.b
inbox-drain to the four-surface model. Domain overlap with this plan flagged; integration
into plan body deferred to a focused iteration session.*

### Unify subprocess CLI test helpers (`runArc` + `runCli`)

- **Problem:** Two near-overlapping subprocess helpers exist —
  `__tests__/e2e/helpers.ts:runArc` (PTY-emulated via `script` on Linux, injects
  `NO_COLOR=1`, 30s default timeout, catches errors and maps to result) and
  `__tests__/helpers/run-cli.ts:runCli` (`stdio: "pipe"`, no env injection, 10s default
  timeout, rejects on spawn-error/timeout). Both spawn `node dist/cli.js`; the
  genuinely-different concern is invocation mode (TTY for interactive Clack flows vs.
  pipe for stdout purity contracts). Today, picking the wrong helper at a new test site
  is easy and the failure mode (Clack short-circuits to non-interactive, or PTY output
  contaminates a purity assertion) is confusing. Shared `CLI_PATH` constant + prebuild
  guard already extracted to `__tests__/helpers/cli-spawn.ts` during 2.R.3.c.2 — that
  captured the genuinely-shared duplication. The remaining consolidation is the
  ergonomic / single-import-surface question.
- **Approach:** Collapse to one helper with explicit `mode: "tty" | "pipe"` parameter.
  Reconcile per-mode defaults (timeout, env injection, error handling) as part of the
  API design — current asymmetries are tuned per use case and can't be silently merged.
  Migrate ~80 `runArc` call sites across 10 e2e test files + 6 `runCli` call sites;
  cwd-position mismatch (positional vs. options-object) means every site touches its
  arg list.
- **Notes:** Not blocking — both helpers work today. Benefit is ergonomic and makes the
  TTY-vs-pipe choice explicit at the call site instead of implicit-in-import. Cost is
  real (86 sites + behavioral matrix decisions). Path-independent: doing it later is no
  worse than doing it now. Captured during 2.R.3.c.2 after option B (shared core
  extraction) was selected over option C (full unification) for that task's scope.
- **Effort estimate:** M (helper redesign + 86-site migration + new unit coverage for
  the mode parameter and default-merge behavior)

## Coordination — ADR-022

ADR-022 designates the meta record (this WU's zod meta schema) as the structural source of truth for the
managed operational-state document class. Enumerate full managed-doc schema coverage beyond the current four
surfaces (or hand the remainder to `operational-state-docs`), and resolve the schema-home convention so every
consumer derives from one schema. See `adr-022-managed-operational-state-documents.md` § Coordination.
