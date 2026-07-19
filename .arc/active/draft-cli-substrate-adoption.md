# Draft: CLI Substrate Adoption

**Purpose:** Lay the CLI's typed-validation and ergonomic-error substrate: a Zod schema kernel as the one type
authority ARC's structured surfaces derive from, a `.arc/` layout resolver as the one path authority, four
foundational libraries (zod, execa, neverthrow, type-fest), and migration of the priority validation surfaces.
The kernel is the procedure lane's named schema kernel, the storage substrate chain's head, and the unblock for
`session-locus-model`'s implementation tail.

- **State:** Formalization-ready — 2026-07-18 holistic refresh of the 2026-05-17 draft; two adversarial passes
  run to convergence (pass 1: delivery restructured as a cohort, canonical-JSON premise corrected, executor
  error-contract settled; pass 2: six minors folded, design core withstood). Re-grounded against the current
  codebase (~100k source LOC; the `GitExec` seam; the coupling-audit extracts), the three forward-compat
  check-docs, and a re-verified library landscape. Remaining opens are create-spec/decompose detail.

- **Created:** 2026-05-17 · **Refreshed:** 2026-07-18

- **Origin:** Surfaced during a library landscape review motivated by accumulated validation, error-handling,
  and git-invocation surfaces outgrowing the original minimal-deps rationale. Effect TS was considered as a
  comprehensive alternative and deferred (see § Design Decisions). Role expanded at the 2026-07-17
  storage-substrate grooming (one-schema-kernel doctrine) and the 2026-07-18 coupling-audit close (substrate
  abstraction ownership).

---

## Problem / Motivation

The CLI has grown to ~100k source LOC across ~505 files (with ~130k test LOC) — roughly 15–20× the scale the
original minimal-deps posture was set against — and four substrate gaps now compound on every feature that
touches validation, git invocation, error ergonomics, or path resolution:

1. **Validation is hand-rolled and scattered, with zero runtime dependencies to lean on.** Production deps are
   only `@clack/prompts`, `commander`, `js-yaml`, `semver`, `string-width`. Hand-rolled parser-validator pairs
   span the ~25-slot session-init envelope (typed in TS, never runtime-validated across the agent process
   boundary), `audit-log.ts:validateEntry()`, the frontmatter readers, config parsing, sync-state, the
   decompose cut-map validator, and the compaction-seed / recovery envelopes.

2. **Path literals are scattered with no layout authority.** The coupling-blast-radius audit's mandatory
   substrate extract identifies **15 abstract concrete-path classes** — rank-1 `arc-root` alone fans out across
   388 files; `active-placement` across 243 — requiring one resolver/substrate ownership decision rather than
   independent path-literal migrations. Today only package-relative template resolution (`paths.ts`) and a few
   `constants.ts` segments exist; the `.arc/` layout itself has no owner in code.

3. **Error and result ergonomics are per-site.** `Probe<T>` (the session-init slot type) is a well-shaped
   hand-rolled `{ok, value} | {ok, error}` union whose composition is per-site boilerplate. Git-error
   classification falls back to locale-fragile stderr substring-matching (`reconcile-branch.ts`'s delete
   mutator). Canonical JSON has a centralized trust core (`lib/canonical/` — codepoint-ordered, NFC-normalized,
   digest-pinned; 29 importers) but peripheral surfaces still hand-roll divergent canonicalization (the
   review-gate identity snapshot sorts keys with locale-sensitive `localeCompare`).

4. **Git invocation ergonomics stop at the seam.** The codebase converged on an injectable `GitExec` function
   type (126 consuming files) with the raw `child_process.execFile` binding confined to ~11 files — good
   architecture, but the executor beneath it offers no typed errors, and `AbortSignal`/`cwd` handling is
   hand-maintained.

None of these are bugs today. The compounding cost lands wherever new validation, error ergonomics, and typed
contracts arrive at once — and three system positions now make the gap load-bearing:

- **The procedure lane's schema kernel.** `strategy-procedure-evolution.md` § Target Model names this WU's Zod
  base as the **one schema kernel**: record classes, envelope slots, workflow contracts, the step vocabulary,
  and config axes all derive from it; documentation is generated from it; `schema-introspection-layer` exposes
  it. Doctrine: *structure is typed or it isn't structure; prose is reserved for judgment and communication.*
- **The storage substrate chain's head.** The chain runs `coupling-blast-radius-audit` → this WU →
  `operational-state-docs` (the ADR-022 records layer) → toward `local-mode`. The layout resolver built here is
  the storage-abstraction seam (`strategy-storage-evolution.md` Principle 1) a future materialized `.arc/`
  re-points without touching hundreds of files.
- **The `session-locus-model` unblock.** SLM (P1) finishes create-spec, then holds its implementation tail
  until this WU's kernel exists, so its record schemas aren't churned twice. The kernel is the urgent
  deliverable; it ships first as the delivery stack's head member (see § Delivery structure).

---

## Scope

### In scope

1. **Schema kernel.** A kernel module (working name `lib/kernel/`; final name and home at spec) that is the
   single type authority for shared vocabulary:
    - **Vocabulary primitives:** lifecycle `State`, `Class`, slug/branch shapes, artifact-prefix and
      placement tokens, record-class identities, config-axis primitives.
    - **Authoring model:** Zod schemas are the source of truth; static types derive via `z.infer`. No parallel
      hand-written types, and **no TypeScript compiler API dependency** (see § Design Decisions — TS 7
      insulation).
    - **Registry with versioning discipline:** every kernel-registered schema carries a `schemaVersion` and a
      migration posture from day one (generalizing the cut-map validator's versioned-union pattern — reject v1
      with upgrade guidance, accept v2). This is the mechanical form of the pre-release contract-stability
      bar. `schemaVersion` is registry metadata: it appears on the wire only where a surface's shape already
      carries it (the audit log's `schemaVersion`, sync-state's `version`); wire-frozen surfaces (the
      envelope) stay unversioned on the wire until a deliberate, versioned contract change.
    - **Error taxonomy:** fold the existing `ArcError` code union into kernel vocabulary and extend it with the
      structured git-error kinds the executor upgrade introduces — one error model, not per-module conventions.
    - **Result insulation:** the kernel re-exports `Result` / `ResultAsync` / `ok` / `err` from neverthrow, so
      a later library swap is one import-site change plus a mechanical codemod.
    - **Canonical JSON:** bless the existing trust core (`lib/canonical/` — canonical serialization + digest
      primitives) as the kernel's canonicalization authority and migrate peripheral hand-rolled outliers onto
      it (e.g. the review-gate identity snapshot's locale-sensitive key sort). **No serialization-semantics
      change** — persisted receipts re-verify by byte-exact recomputation, so digest continuity is a hard
      constraint (see § Design Decisions).
    - Subsystem schemas stay co-located (`lib/<subsystem>/schemas.ts`) and **compose kernel primitives instead
      of redeclaring them**, registering into the kernel registry. Single authority for vocabulary, distributed
      authorship for composition.

2. **`.arc/` layout resolver.** One path authority for the `.arc/` structure, executing the audit's mandatory
   substrate extract:
    - **Two-layer split:** layout *tokens* (roots, placement names, artifact prefixes, well-known doc names)
      are kernel vocabulary; path *resolution* (repo root → absolute paths, placement transitions) is a
      resolver service consuming them.
    - **Migration scope:** the 15 abstract path classes (`arc-root`, `active-placement`, `meta-prefix`,
      `planned-placement`, `completed-placement`, `draft-prefix`, `spec-prefix`, `tasks-prefix`,
      `notes-prefix`, `method-root`, `workflow-root`, `roadmap-name`, `session-notes-name`,
      `working-memory-name`, `template-suffix`) — code and test surfaces migrate in this WU; prose/workflow
      surfaces ride their own later movers. A per-class accept/reject pass runs at spec time against the audit
      inventory (evidence: routing ledger packet `substrate-abstraction-input`; corpus retrieval per the audits
      README — the scan corpus is digest-pinned in history, not at the tip).
    - **Tracked-planning git operations:** groom the four-file evidence set (packet
      `tracked-planning-git-operations`) as explicit verb-adoption scope; verify no direct tracked-planning git
      operation survives the boundary.
    - Forward-compat: this resolver is the `strategy-storage-evolution.md` Principle 1 seam — workflows and
      code ask for paths; the storage layer provides them.

3. **zod adoption with priority migrations.** Add `zod` (4.x mainline) as a production dep; migrate priority
   surfaces:
    - **Session-init JSON envelope** — the agent–CLI process-boundary contract; highest value. CLI validates on
      emit; tests validate on consume. **Wire format preserved** (see § Design Decisions).
    - **Audit-log entry** — replace hand-rolled `validateEntry()` with a schema matching the shipped wire
      (`schemaVersion: 2` only — no v1 exists on disk); future revisions use the versioned-union pattern the
      cut-map validator established.
    - **Meta-file frontmatter** — codify the shipped meta shape (H1 + grouped field blocks); validates
      round-trip from disk reads. Per ADR-022, the meta record schema is the structural source of truth for the
      managed operational-state document class — coverage beyond the current surfaces is
      `operational-state-docs`' side of the boundary (see § Coordination).
    - **Configuration file** (`arc-config.yml`) — schema-validate the parsed object. Mechanics only: config
      *axis reform* (e.g. the `pm.mode` packet) belongs to `scalable-core`.
    - **Shipped drop-in targets** (authored awaiting this substrate): the decompose cut-map validator
      (deliberately migration-ready — single entry point, versionable shape), sync-state (dropping the dead
      `priorFileList` field, its validator, write-fn param, and spread sites — backward-compatible, no version
      bump), the compaction-seed + recovery envelopes (`loadSet` / `taskCursor` slices, `arc recover audit`'s
      typed verdict — pre-budgeted debt, one shared shape each, no agent-only variants), the
      `git worktree list --porcelain` parsers, the branch-gone cascade evidence union, the cold-start
      spec-input parser (5 variants), and cross-WU note payload validation.
    - **Per-site convention:** schemas at I/O boundaries; internal code consumes parsed, typed values;
      `parse()` for internal emit paths, `safeParse()` where graceful handling matters.
    - **Generated JSON Schemas as build artifact:** zod 4's native `z.toJSONSchema()` makes artifact generation
      near-free, so this WU emits generated JSON Schemas at build time. The *publication commitment* (CLI
      surface, versioning policy, deprecation discipline) stays with `schema-introspection-layer`.

4. **Executor upgrade (execa 10 behind the seam).** The May framing (~81-site caller sweep) is obsolete — the
   `GitExec` seam already exists. Remaining work:
    - Swap the production executor internals (`io-context.ts` and the ~11 files binding `execFile`) to
      **execa 10.x**; the stdin-fed `GitExecInput` variant migrates alongside.
    - **Upgrade the `GitExec` error contract** to structured, typed error variants (exit code + error kind) —
      the deliberate, designed change that ripples; replace `reconcile-branch.ts`'s stderr substring-matching
      and any sibling hand-rolled git-error string matching with typed variants.
    - Feasibility spot-check covers the ~11 binding files, noting execa 10's breaking changes: the return is a
      plain Promise (Node `ChildProcess` APIs live behind `subprocess.nodeChildProcess`), `execaCommand`
      removed, Node ≥22 required (satisfied). One break lives inside the seam module itself: `exec.ts`'s
      bounded invocations classify timeouts via `err.name === "AbortError"`, which execa signals differently
      (`ExecaError` with `isCanceled`) — absorb it into a typed aborted/timeout error kind rather than letting
      probe degradation silently reclassify as generic error.
    - The contract stays **throw-based** — the upgrade is richer thrown error types, not a `Result`-shaped
      seam (settled; see § Design Decisions).
    - Test mocks are `GitExec`-shaped (functions), so mock churn is minimal by construction.

5. **neverthrow adoption and `Probe<T>` conversion.** Add `neverthrow` as a production dep:
    - Convert `Probe<T>` composition to `Result<T, ProbeError>` / `ResultAsync` pipelines internally — the
      probe sites are async git-read chains, `ResultAsync`'s exact shape.
    - **Emit boundary serializes to the existing `{ok, value} | {ok, error}` wire shape** — see § Design
      Decisions (wire-format stability).
    - Evaluate `AuthorizationDecision` (release module) for conversion at spec time — the bespoke union carries
      per-code structured payloads that a generic `Result` may express worse; deferring it to opportunistic
      post-WU adoption is defensible. No forced wholesale migration elsewhere; the follow-up WU owns the
      comprehensive sweep.

6. **type-fest addition** (v5.x line, dev dep, zero runtime cost). No bulk migration; replace bespoke type
   helpers as encountered; spec enumerates the obvious wins in `lib/types.ts` and equivalents.

7. **Uniform non-interactive contract + boundary input validation.** One "inputs at the boundary" story:
    - Audit prompting subcommands; establish the uniform contract — auto-skip-to-safe-default under non-TTY, or
      an explicit `--yes` / `--no-input` flag — so agent/automation invocation never hangs (`arc user open`'s
      stale-subdir confirm is the motivating failure; `arc start --here` and `arc init --yes` are the shipped
      precedents).
    - **Required-inputs substrate:** the generic interactive-elicit + fail-or-require-flag-under-non-TTY
      behavior that stub-creation paths ride (no silent `provisional`/`P3` defaults). The *policy* — commitment
      and priority are the maintainer's explicit call at every stub-creation path — is stated authoritatively in
      `strategy-work-organization`; the unified `stub` primitive chokepoint is `lifecycle-transition-core`'s
      shipped territory — this WU supplies the substrate beneath it. The residual `promote` asymmetry (no
      verb-level Class input) folds into the same explicit-input pass.
    - Commander arguments and clack-elicited inputs validate against kernel schemas at the boundary.

8. **Coordination patches.** Update the consumer/boundary WUs' planning artifacts with the substrate
   relationship (see § Coordination); mint the follow-up complete-migration WU stub at integration.

### Out of scope

- **Schema introspection surface** (`arc schema list/get`, published contract artifacts) —
  `schema-introspection-layer`, hard downstream. This WU emits build-time JSON Schema artifacts only.
- **WU lifecycle state machine** — `wu-lifecycle-state-model`. The kernel ships the `State` vocabulary; machine
  machinery (typed transition map vs. a library) is WLSM's grooming call.
- **Config axis reform** — `scalable-core` (owns the `pm.mode` schema-reform packet). This WU provides kernel
  mechanics for config primitives only.
- **Markdown parse/render substrate** (remark/unified or otherwise) — the records-canonical direction (ADR-022)
  retires most hand-rolled line parsers by making markdown a rendered projection; any parse/render library
  decision belongs to `operational-state-docs`' projection layer (with `markdown-formatting` on the lint side).
  This WU's contribution: kernel record schemas stay projection-aware (stable field ordering; no state that
  exists only in rendered markdown).
- **Frontmatter mechanism churn** — frontmatter is becoming typed-contract territory under
  `composable-workflows` D1 (generated schemas); this WU migrates the frontmatter surfaces it already owns to
  zod but doesn't swap the extraction mechanism.
- **Workflow-markdown CLI command** — the "real command for workflow files" question (validator / inspector /
  context loader) re-routes to `composable-workflows`, which owns typed workflow contracts; the companion
  skill-wording fix ("load and follow", not "run") is an errand-sized edit, not WU scope.
- **Self-hosting dist integrity** (stale/broken `dist/cli.js` guards, precise rebuild-path reporting) —
  re-routed to `self-hosting-manifest-freshness`, the named owner of that surface (with `quality-gate-hooks`
  adjacent); the recovery-handoff hygiene half (expired `codex-compaction-recovery-seed-*` reaping, the
  global-vs-identity-scoped seed split) re-routes to `recovery-hardening`. Both were non-orthogonal riders
  here; captures route at planning close.
- **Resolver-adoption investigation** (should single-fact resolvers back ceremonies deterministically rather
  than live as remember-to-invoke rules?) — minted as its own stub at planning close rather than riding this
  WU; it is a constitutional/workflow investigation, not substrate code.
- **Wholesale zod / neverthrow conversion of every site** — the follow-up complete-migration WU.
- **Test-helper unification** (`runArc` + `runCli` → one helper with explicit `mode: "tty" | "pipe"`; ~86 call
  sites + per-mode default reconciliation; effort M) — deferred to the follow-up WU. Path-independent; both
  helpers work today; the shared spawn core was already extracted.
- **Effect TS adoption** — deferred; see § Design Decisions for the rewritten rationale and trigger.
- **Property-based round-trip testing** (fast-check over record ↔ projection round-trips) — a natural fit once
  records land; seeds at `operational-state-docs` or via testing-standards, not here.
- **Type relocation / sync-handler / user-sync restructuring** — the `architecture-remediation` cohort's own
  WUs; they inherit this substrate (see § Coordination).

---

## Design Decisions

### Library selections (re-verified 2026-07-18)

- **zod 4.x over valibot / arktype / typebox / @effect/schema.** Zod 4 is mainline and dominant (zod 3
  effectively EOL), ~4–5× faster and roughly half the size of v3 — closing the gaps that used to favor
  challengers — with the widest TS-community familiarity for contributor onboarding. Native `z.toJSONSchema()`
  (draft-07 / 2020-12 / openapi-3.0) replaces the now-unmaintained `zod-to-json-schema` converter for the
  introspection path. Bundle size is a non-issue for a Node CLI. @effect/schema rejected to avoid Effect
  coupling without Effect adoption.

- **execa 10.x over keeping raw `child_process` — and over lighter challengers.** Typed error classes with
  command + stderr embedded, uniform `AbortSignal`/`cwd`/kill handling, streaming conversions. nano-spawn's own
  README recommends execa for apps/CLIs (reserving nano-spawn for size-constrained libraries); tinyexec lacks a
  typed-error class — and structured errors are precisely what the `GitExec` contract upgrade needs. Behind an
  owned seam the executor is an implementation detail, so the lighter libraries were genuinely considered; the
  error-contract requirement decides it.

- **neverthrow over ts-results-es / oxide.ts / fp-ts / bespoke — with a flagged maintenance risk.**
  `ResultAsync` (a thenable `Result` wrapping a Promise) is the exact shape of the async probe pipelines — the
  dominant conversion target; challengers' async stories are helper-grade. Familiarity and install base follow
  the same criterion that picked zod. **Known risk:** no release since v8.2.0 (2025-02) and an unanswered
  maintenance-status issue open since 2026-01. Accepted because the library is feature-complete,
  zero-dependency, and stable; our usage is narrow (internal composition; the wire format stays hand-shaped at
  the boundary); and the kernel re-export confines a future swap to one import site plus a codemod.
  **Reconsideration trigger:** release-silence through a breaking Node/TS change requiring a patch, or an
  explicit unmaintained declaration → migrate to **ts-results-es** (actively maintained; the credible
  fallback). Manually re-check the maintenance issue immediately before execution starts. Going *directly* to
  ts-results-es was considered and rejected: weaker async ergonomics and far smaller adoption are certain
  costs, paid to hedge a contingent risk whose realized cost (a mechanical codemod) is small.

- **type-fest v5.x** (requires TS ≥5.9; satisfied). Still the standard; zero runtime cost.

### Kernel architecture — vocabulary authority, distributed composition

"One schema kernel" does not mean one file of every schema. The kernel owns **shared vocabulary primitives**
(State, Class, slugs, prefix/placement tokens, record identities, config primitives, the error taxonomy) and
the **registry**; subsystem schemas stay co-located with their subsystems and compose kernel primitives. This
reconciles locality of reasoning with the one-type-authority doctrine — single authority for vocabulary,
distributed authorship for composition — and resolves the original schema-home open question.

### TS 7 insulation — Zod as source of truth, no compiler API

The kernel derives static types *from* Zod (`z.infer`), never schemas from TS types via the compiler API.
TS 7.0 (GA 2026-07-08) ships no stable programmatic API; 7.1's (~Oct 2026) is a structurally different
out-of-process model (API-server process, STDIO IPC, query/visitor access) — any 6.0-idiom API coupling is
guaranteed churn. Schema-first has zero compiler-API surface to break, and satisfies one-source-cannot-drift by
construction (validator and type cannot diverge). If extraction from TS source ever proves genuinely necessary,
isolate it behind a thin port designed to the 7.1 shape (async-tolerant, query/batch-shaped, no retained AST
object identity). This rationale stands on the TS 7 facts, not on a claimed community consensus.

### Wire-format stability at the envelope boundary

The session-init envelope's `{ok, value} | {ok, error}` JSON shape is an **agent-facing contract** — the
workflow corpus dispatches on it. The neverthrow conversion changes internal composition only; the emit
boundary serializes to the existing wire shape, which the zod envelope schema then validates. The wire format
changes only by deliberate, versioned decision — never as a library-adoption side effect.

### Boundary enforcement model

Schemas live at I/O boundaries; internal code consumes already-parsed strongly-typed values. CLI validates on
emit (catches bugs at the composition site, before they leave the process); agent-side consumers and tests
validate on consume (catches contract drift across the process boundary). `parse()` for internal emit paths;
`safeParse()` for consume paths wanting graceful handling. The envelope has two enforcement points; most other
surfaces have one.

### Executor: the seam is the architecture; execa is an implementation detail

The `GitExec` injectable seam (126 consumers) is retained as the stable contract. The real migration is the
**error-contract upgrade** — structured typed variants replacing per-site stderr string-matching — designed
deliberately because the contract change is what ripples. The library swap itself is confined to the ~11
binding files.

**Error-contract shape — settled: typed thrown errors, not a `Result`-returning seam.** `GitExec` keeps its
`Promise<ExecResult>` reject-on-failure contract; the upgrade introduces typed error classes (error kind, exit
code, embedded stderr) so catch sites classify structurally instead of string-matching, with ripple confined
to catch sites. Converting the seam itself to `ResultAsync` was considered and rejected — a 126-consumer
ripple contradicting the priority-surface cutline. Where pipelines want `Result` composition, kernel-provided
`fromThrowable`-style adapters wrap the executor at the pipeline edge.

### Phased migration with a named follow-up WU

Priority sites here; a follow-up complete-migration WU minted at integration captures everything deferred. The
named destination is the discipline lever against "well, this one too…" absorption — more important, not less,
at ~100k LOC where a wholesale sweep is not a large task but an impossible one.

### Effect TS deferral — problem shape, not codebase size

Effect's value tracks **problem shape**: it pays off in service-shaped programs — long-running,
concurrency-heavy, resource-scoped, retry-scheduled, deep dependency graphs — and it punishes partial adoption
(the Effect-world/Promise-world boundary means two error models, two DI idioms, every contributor fluent in
both; a partial adoption is permanent dual-pattern debt). ARC's CLI is the opposite shape: short-lived one-shot
processes that read git, parse, and report. The decisive evidence: the codebase grew 15–20× since the original
deferral and generated **no Effect-shaped problems** — no retry schedules, no resource scopes beyond simple
locks, concurrency `Promise.all` handles, and a function-DI idiom proven across 126 files. Size-based triggers
are therefore the wrong instrument and the earlier LOC trigger is retired as a false positive.

**Reconsideration trigger (problem-shaped):** if/when ARC builds a resident, service-shaped component — the
engine-owned-control-flow asymptote recorded in `strategy-procedure-evolution.md` (realistically an MCP
server), or the deferred coordination-service tier — evaluate Effect as *that component's* foundation: a
greenfield choice for the new service-shaped program, not a retrofit of the CLI.

### Canonical JSON — bless the existing trust core; RFC 8785 rejected

`lib/canonical/canonical-json.ts` is already the centralized canonicalizer: deliberate Unicode-codepoint key
ordering plus NFC normalization, `sha256:` content digests, 29 importers — and persisted retirement receipts
re-verify by byte-exact recomputation. RFC 8785 (JCS) was considered and **rejected**: it mandates UTF-16
code-unit key ordering and performs no NFC normalization, so adopting it would change serialized bytes and
silently invalidate every persisted digest. The kernel adopts the existing module's semantics as canonical and
consolidates the peripheral outliers onto it; any future semantics change requires an explicit
digest-versioned migration, never a library swap.

**Recorded acceptance:** migrating an outlier is, for that surface, a semantics change — the review-gate
identity snapshot's derived policy versions and request keys may re-key across the upgrade, and in-flight
ledger reservations re-key with them. Accepted: those keys already churn on policy-content changes by design.
The no-semantics-change constraint protects `lib/canonical`'s own serialization, not the divergent outliers
being corrected onto it.

### Considered and rejected

- **A git library** (simple-git / isomorphic-git): the `GitExec` seam plus zod-validated porcelain parsers is
  strictly better for ARC's shape — exact plumbing control (worktrees, notes refs, fetch-into-ref) that
  isomorphic-git doesn't cover, without an intermediate parsing opinion to fight.
- **CLI framework / prompt churn**: commander and clack remain current best-fit; swap value ≈ zero.
- **`yaml` (comment-preserving) over js-yaml**: the js-yaml surface is three files, mostly reads; revisit only
  if config-write paths grow (`scalable-core` territory).
- **Direct ts-results-es adoption**: see the neverthrow decision above.

---

## Dependencies and Sequencing

### Upstream — satisfied

Both dependency edges are satisfied: `work-organization-reform` shipped (meta shape, 4-state model settled);
`coupling-blast-radius-audit` shipped 2026-07-18 (ranked inventory + the two routed packets this WU owns).

### Position — wave 2, fast-tracked

Per the current execution posture: launched immediately, running beside `session-locus-model`'s spec tail,
`commit-message-ergonomics`, and `markdown-formatting`'s timed launch. Mechanical-heavy rather than
design-heavy — grooming scopes resolver ownership and the kernel; execution runs off the design slot.

### Delivery structure — stack cohort (cohort-fit verdict: decompose)

The cohort-fit check fires affirmative: the pillars are orthogonal subsystems with ownable seams (the shared
seam — kernel vocabulary — is the same one the design already treats as ownable across WU boundaries for its
downstream consumers), and the one-branch/one-PR WU model cannot otherwise deliver the kernel early — a
"phase-1 close" on a monolithic branch is not an integration boundary, so the SLM unblock would silently
become WU-close. Deliver as a dependency-ordered cohort — a single head member plus a fan of
mutually-independent siblings, each its own branch and PR; exact membership, names, and edges settle at the
decompose ceremony via the cut-map. **Timing:** create-spec runs on this WU (the spec is the cohort's shared
design) and its enumeration work finalizes the cut-map; the decompose ceremony fires at spec settle, before
any task generation — task lists are per-member. Working cut (maximum articulation — see the merge note
below):

1. **kernel** (head) — vocabulary, registry, the error-taxonomy base (executor-facing git-error kinds land
   with member 5), Result insulation, and the canonical blessing + kernel export (outlier migrations ride fan
   members). Kept deliberately minimal so the head stays small: **`session-locus-model` unblocks when this
   member ships to the base** — a real integration boundary, not a mid-branch milestone.
2. **envelope** — wire-pinning envelope schema (emit + consume) plus the internal `Probe<T>` → `ResultAsync`
   conversion.
3. **layout resolver** — tokens + resolution service; 15-class code/test migration; tracked-planning verb
   boundary. The largest diff; plausibly the only Heavy member.
4. **validation surfaces** — audit log, meta frontmatter, config, and the shipped drop-ins.
5. **executor** — execa 10 swap, typed git-error contract, structured-error refactors.
6. **boundary inputs** — non-TTY contract, required-inputs substrate, kernel-schema input validation.

Members 2–6 depend on 1 only and are mutually independent — a fan, not a chain — with one soft edge: the
envelope-family slot schemas (shared by the session-init, recover, and compaction-seed envelopes) belong to
member 2, and member 4's envelope drop-ins consume them — reinforcing the envelope + validation-surfaces
merge candidate below. Solo execution likely runs the resolver as the primary thread with the small members
interleaved. Six is the maximum articulation: at
the decompose ceremony each member must independently clear the WU-worthiness floor, and the likely merges
are envelope + validation surfaces (both zod migrations of settled shapes) and possibly the executor into
that member — a 4–5 member landing is plausible. The kernel and the resolver never merge: the kernel's early
ship and the resolver's isolated mega-diff are each the point of the cut. Secondary benefits: reviewable PR
sizes under the current one-PR-per-WU model (`pr-decomposition` is unshipped), and a short base-drift window
per member instead of a multi-week accumulating branch.

### Downstream consumers

- **`session-locus-model`** — record schema, read verb, and lease build on the kernel; its machine-local locus
  records stay storage-agnostic with opaque state strings (its draft's own discipline).
- **`wu-lifecycle-state-model`** — consumes the kernel `State` vocabulary and the placement-reader extract
  against this WU's landed resolver verbs.
- **`operational-state-docs`** — the ADR-022 records keystone; consumes the meta record schema as structural
  source of truth and owns managed-doc schema coverage beyond this WU's surfaces.
- **`schema-introspection-layer`** — hard downstream; publishes the kernel registry via `arc schema` on top of
  the build-time JSON Schema artifacts.
- **`architecture-remediation` cohort** (`lib-layer-type-extraction`, `sync-handler-decomposition`,
  `user-sync-module-split`, `check-id-stabilization`, `ci-cross-platform-hardening`) — inherit
  `lib/<subsystem>/schemas.ts` convention, zod schemas, and `Result` types; restructure scopes shrink.
- **Follow-up complete-migration WU** — comprehensive zod/neverthrow sweep, test-helper unification; scoped at
  integration.

### Coordination

- **ADR-022:** the meta record zod schema is the structural source of truth for the managed
  operational-state-document class. This WU ships the schema for its surfaces; enumerate-or-hand-off of full
  managed-doc coverage resolves at the `operational-state-docs` boundary.
- **`scalable-core`:** owns config axis reform (the `pm.mode` schema-reform packet); this WU provides kernel
  mechanics for config primitives and does not reshape axes.
- **`composable-workflows`:** owns workflow contracts, the step vocabulary (deriving from the kernel), the
  frontmatter-as-contract mechanism, and the re-routed workflow-markdown command question.
- **`lifecycle-transition-core` (shipped):** owns the unified `stub` primitive chokepoint; this WU supplies the
  non-TTY elicit/require-flag substrate beneath it, with the mandatory-fields policy stated in
  `strategy-work-organization`.
- **`self-hosting-manifest-freshness` / `quality-gate-hooks`:** the dist-integrity guards coordinate with both.
- Check-docs run at this refresh: `strategy-procedure-evolution.md` (kernel doctrine — this WU is its named
  mechanism owner), `strategy-storage-evolution.md` (resolver as the Principle 1 seam; record schemas lift
  without reshaping), `strategy-knowledge-evolution.md` (closing docs land in existing surfaces; no new
  unclassified strategy doc — the typed-substrate guidance routes to `strategy-package-project-sync` /
  DEV-RULES.PROJECT or an existing project strategy at spec time).

---

## Pressure Points and Risks

### Scope discipline at ~100k LOC

The priority-surface cutline is the WU's survival mechanism; out-of-list sites route to the follow-up WU's
scope inline, never absorbed. Spec-time enumeration replaces the stale May site counts (the ~81-site execa
figure predates the `GitExec` seam; the real binding surface is ~11 files).

### Kernel over-centralization

The kernel owns vocabulary, not every schema. Guard: a subsystem schema belongs in the kernel only when a
second subsystem consumes it or it names shared vocabulary; otherwise it stays co-located and registered.

### Wire-format regression

The envelope schema must validate the *existing* emitted shape before any internal conversion lands; consume
side tests pin the wire contract. A schema that drifts from the shipped shape fails the migration, not the
workflows.

### neverthrow maintenance

Flagged above; trigger recorded. Re-check the maintenance status immediately before execution starts.

### execa 10 breaking changes

Promise-not-ChildProcess return, removed `execaCommand`, Node ≥22 — the feasibility spot-check enumerates the
~11 binding files against these specifically. Hybrid fallback (wrapper internals only) survives as the escape
hatch if a binding site proves incompatible.

### Resolver migration blast radius

`arc-root` fans out across 388 files (243 for `active-placement`). Mitigation: the audit inventory is the
migration and verification matrix; code/test surfaces migrate mechanically behind the resolver API; prose and
workflow surfaces are explicitly out of this WU's sweep (they ride later movers — verbs-over-mechanics already
points that way).

### Validate-on-emit overhead

zod 4's performance makes per-emit validation sub-millisecond at the envelope's scale; recommended default is
always-on (catches CLI bugs early). Confirm at spec with a measurement rather than an assumption.

### Schema-vs-type drift during migration

The pattern is schema-first with inferred types, but existing hand-written TS types exist for every migration
target; introducing a schema without removing the pre-existing type creates drift opportunity. Mitigation:
replace-then-infer discipline at each migration site; an optional lint check that consumers use the inferred
type (not a surviving hand-written duplicate) is a spec-time decision.

### Install-size growth

zod 4 (roughly half of v3's ~150KB), execa (~50KB), neverthrow (~5KB), and type-fest (zero runtime) add a
modest, acceptable footprint for an npm-installed CLI whose install size is already dominated by Node and the
built dist. Acknowledge explicitly in release notes rather than silently.

### `AuthorizationDecision` conversion is non-trivial

The release-module union carries per-code structured payloads (numeric codes, refusal details, formatting
hooks) that a generic `Result` may express worse. Spec-time decision; deferring to the follow-up WU is
defensible.

### SLM timing pressure

SLM is P1 and paused on the kernel. Mitigation is structural: the kernel is the stack head and ships to the
base first; its scope is deliberately minimal-vocabulary so the head member stays small.

### Coordination drift

The consumer WUs (§ Coordination) may shift scope while this WU executes. Mitigation: coordination patches
land at spec time; re-verify at integration.

---

## Open Questions (spec-time)

- **Kernel module name and home** (`lib/kernel/` vs. alternatives) and registry API shape.
- **Cohort member names and final cut-map** — membership, edges, and member sizing at the decompose ceremony.
- **Resolver API shape** and the per-class accept/reject pass over the 15 path classes (prior: accept nearly
  all — they form one coherent layout model).
- **Exact priority-surface enumeration** with current site counts (grep + AST query at spec).
- **`AuthorizationDecision`** — convert, defer, or keep bespoke.
- **Strict emit-validation default** — recommended always-on; confirm with measurement.
- **`schemaVersion` policy detail** — per-schema postures vs. a registry-wide convention.
- **Non-TTY contract shape** — auto-skip-to-safe-default vs. explicit flag per command class; flag naming
  (`--yes` precedent vs. `--no-input`).

---

## Scope Estimate

**Heavy in aggregate — delivered as a dependency-ordered stack cohort** (§ Delivery structure), not one
multi-week branch. Member-level sizing settles at the decompose ceremony; the layout-resolver member is the
largest and plausibly the only Heavy one. The member map replaces a phase list one-for-one; closing work
(type-fest opportunistic pass, JSON Schema build artifacts, docs in existing surfaces, coordination patches,
the follow-up WU stub) rides the relevant members rather than a dedicated closing phase.

---

## Related Work

- **`session-locus-model`** — P1 consumer paused on the kernel member's ship; locus record schema, read verb,
  lease.
- **`schema-introspection-layer`** — downstream publisher of the kernel registry (`arc schema`).
- **`operational-state-docs`** — ADR-022 records keystone; managed-doc schema coverage boundary; markdown
  projection layer (and any parse/render library decision).
- **`wu-lifecycle-state-model`** — `State` vocabulary consumer; placement-reader extract against landed
  resolver verbs; state-machine machinery is its call.
- **`scalable-core`** — config axis reform owner (`pm.mode` packet).
- **`composable-workflows`** — workflow contracts / step vocabulary deriving from the kernel; frontmatter
  mechanism; workflow-markdown command question (re-routed there at this refresh).
- **`architecture-remediation` cohort** — inherits schemas convention, `Result` types; scopes shrink.
- **`local-mode` / `arc-backend`** — the storage substrate the resolver seam and storage-agnostic record
  schemas compose toward.
- **`coupling-blast-radius-audit` (shipped)** — source of the two owned packets; the scan corpus is
  digest-pinned in history (retrieval documented in the audits README).
