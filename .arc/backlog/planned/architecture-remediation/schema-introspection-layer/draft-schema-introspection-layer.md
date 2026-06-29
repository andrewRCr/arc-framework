# Draft: Schema-Driven CLI Introspection Layer

**Purpose:** Build a consumer-facing CLI introspection surface (`arc schema` subcommand tree) on
top of the zod schemas WU-A (`plan-cli-substrate-adoption.md`) introduces. Lets agents,
contributors, and tests discover the canonical contracts ARC's CLI emits and consumes — most
notably the session-init JSON envelope, audit-log entries, meta-file frontmatter, and config
shape — without code-reading. Optional companion: generated JSON Schemas shipped as static
artifacts.

- **State:** Stub — pre-PRD; surfaced 2026-05-17 during exploratory Effect TS evaluation and
  associated CLI substrate planning. Hard upstream dependency on `plan-cli-substrate-adoption.md`
  (WU-A); detailed scope elaborated when WU-A nears integration.

- **Created:** 2026-05-17

- **Origin:** Surfaced alongside `plan-cli-substrate-adoption.md` during a library landscape
  review of the CLI. ARC's CLI emits structured envelopes and reads/writes structured artifacts
  whose shapes are today tribal knowledge — agents discover the session-init envelope shape via
  workflow + brief docs; contributors discover audit-log shape by reading source. Adding zod
  schemas (WU-A) creates the substrate; publishing them via a CLI surface (this WU) makes the
  contracts discoverable and enforceable from outside the CLI process.

---

## Problem / Motivation

The contracts ARC's CLI exposes across process boundaries are currently invisible:

- **Session-init JSON envelope.** Emitted by `arc status --session-init --json`; consumed by
  agents at every session start. Today the shape is documented partially in workflow prose
  (`session-init.md` step 1 enumerates fields); the canonical schema lives in TypeScript types
  that the agent can't read. Agents must trust that the envelope matches their assumptions; CLI
  changes that drift from agent assumptions are detected as silent misbehavior, not contract
  violations.

- **Compaction recovery contracts.** `arc status --session-init --write-compaction-seed --json`
  writes a seed schema, status envelopes can include `taskCursor`, and `arc recover audit --json`
  emits a ready/stop verdict. These are agent-facing contracts for post-compaction recovery and
  should be published once CSA turns their hand-written guards into zod schemas.

- **Audit-log entry shape.** JSONL written by `arc release` operations. `schemaVersion: 1` is
  pinned but the v1 schema lives in source. Future v2 will need discriminated-union dispatch;
  publishing v1's schema today is the substrate for publishing v2's tomorrow.

- **Meta-file frontmatter** (post-WOR shape, R58). Read/written by lifecycle workflows; consumed
  by every session-init read of the active status file. Schema in source.

- **Configuration shape** (`arc-config.yml`). Parsed by every CLI invocation; the legal value set
  for each key is in source.

WU-A introduces zod schemas at these boundaries. Without WU-B, the schemas remain internal —
useful for validation but not as a published contract. WU-B exposes them via CLI so:

- **Agents** can validate their assumptions against the live contract (`arc schema get session-init
  --json` returns JSON Schema the agent can validate received envelopes against).
- **Contributors** can introspect what the CLI exposes without reading source.
- **Tests** (including downstream consumer projects, if any) can validate against the published
  contract rather than against hand-built fixtures.
- **Documentation** can be generated from schemas, eliminating doc-vs-implementation drift.

Hard dependency on WU-A — without zod schemas as substrate, there's nothing to introspect.

---

## Approach

PRD-time elaboration. Provisional shape:

- **CLI subcommand tree** under `arc schema` (naming TBD: `arc schema`, `arc introspect`,
  `arc contracts` — resolves at PRD; `arc schema` is the working assumption).
- **Schema registry** — central module (`lib/schemas/registry.ts` or equivalent) maps schema
  names to their zod definitions. WU-A's schemas register here.
- **JSON Schema generation** via zod's built-in `.toJSONSchema()` (zod 4+) or
  `zod-to-json-schema` lib (zod 3).
- **Versioning** — each schema carries an explicit version; CLI emits version with the schema.
  Discriminated-union dispatch where multiple versions coexist (e.g., audit log v1 / v2).
- **Generated JSON Schemas as shipping artifact** — optionally generate static `.json` files
  during build (e.g., `.arc/system/schemas/*.json`) that ship with the package. Useful for
  test-fixture validation and offline consumers. Decision: in WU-A (substrate) or WU-B (public
  contract) — soft boundary, see WU-A § Open Questions.
- **Agent-facing documentation** in `AGENT-BRIEF.ARC.md` § Key Documents (or new § Contracts)
  pointing at the introspection surface.
- **Recovery schema registration** — include the compaction seed, task-list cursor, status
  envelope `taskCursor` slice, and `recover-audit` verdict/report once CSA owns their zod
  definitions. These schemas are particularly useful after context compaction, when agents need
  deterministic contract checks rather than prose inference.

---

## Scope

### In scope

1. **`arc schema` CLI subcommand tree.**
    - `arc schema list` — enumerate available schemas.
    - `arc schema get <name>` — emit schema in default format (JSON Schema).
    - `arc schema get <name> --json` — emit JSON Schema explicitly.
    - `arc schema get <name> --version <v>` — version selector for multi-version schemas.
    - Naming TBD; provisional.

2. **Schema registry.** Central registration surface; WU-A's schemas register here at module
   load. Each registration carries name, version, schema definition, optional description.

3. **JSON Schema generation pipeline.** zod → JSON Schema conversion; cached per-process; emitted
   on demand.

4. **Versioning model.** Each schema explicitly versioned; CLI consistently emits version
   metadata; multi-version schemas dispatch via discriminated union.

5. **Documentation surface for consumers.** Agent-facing note in `AGENT-BRIEF.ARC.md`;
   contributor-facing strategy or QUICK-REFERENCE entry on the introspection surface.

6. **Optional: generated JSON Schemas as shipping artifact** (decision at PRD; coordinate with
   WU-A's § Open Questions on the same).

### Out of scope

- **Schema migration tooling.** Separate concern; covered by the versioned config-key migration
  registry idea in `BACKLOG-TECHNICAL.md`.

- **Runtime contract enforcement on the consumer side.** Consumer's responsibility (agent / test
  harness validates against published schema using its own tooling).

- **Code generation from schemas.** Out for now; potential future enhancement if adopter demand
  surfaces.

- **Versioning policy / deprecation timeline guarantees.** Pre-1.0 contract surface; PRD-time
  decision on whether to commit to backward-compat across breaking changes vs explicit
  schemaVersion bumps.

- **Schemas beyond WU-A's priority set.** WU-B publishes whatever WU-A defines; expansion to
  every CLI envelope beyond WU-A's priority list rides on the follow-up "Complete CLI Substrate
  Migration" WU.

---

## Sibling Work Units

Post-trio parallel cluster:

- WU-B ∥ Lib-Layer Type Extraction
- WU-B ∥ Sync Handler Decomposition
- WU-B ∥ User-Sync Module Split

No direct dependencies among the four — each operates on independent file scopes. Worktree
infrastructure (delivered by WF earlier in the trio) makes parallel execution practical.

---

## Sequencing

**Post-trio.** Hard upstream dependency on:

- **WU-A** (`plan-cli-substrate-adoption.md`): provides the zod schemas WU-B introspects. WU-A
  ships before the trio; trio ships; WU-B activates as part of the post-trio parallel cluster.
- **Parallelism trio** (WF / Coord Probe / AWL / CWC): WU-B doesn't depend on the trio
  semantically, but the post-trio parallel cluster is the recommended sequencing slot to take
  advantage of worktree infrastructure.

---

## Scope Estimate

**Small-medium.** ~3–5 sessions. Mechanical once WU-A's schemas exist:

- CLI subcommand wiring: ~0.5 session.
- Registry + JSON Schema generation pipeline: ~1 session.
- Versioning model + multi-version dispatch: ~0.5–1 session.
- Documentation surfaces (agent brief, contributor guidance): ~0.5 session.
- Optional shipping artifacts (if in scope): ~0.5–1 session.
- Tests + verification: ~0.5–1 session.

---

## Open Questions

### CLI subcommand naming

`arc schema` / `arc introspect` / `arc contracts` — PRD-time decision. `arc schema` is the
working assumption (shortest, most direct); concerns about overloading the term "schema" (already
overloaded in DB / API contexts) may push toward `contracts`.

### Generated JSON Schemas — WU-A or WU-B

See WU-A § Open Questions. Soft boundary; decide jointly at WU-A's PRD time.

### Pre-1.0 versioning / deprecation commitments

What stability does the introspection surface commit to? Per-schema schemaVersion is the
mechanical lever; PRD decides whether breaking changes within a schemaVersion are allowed
pre-1.0 (recommended: yes, with clear changelog entries) vs after 1.0 (likely no, schemaVersion
bumps required).

### Agent-discovery model

Does the agent invoke `arc schema get session-init --json` at every session-init, or only on
contract-mismatch detection, or never (publishing is documentation-only)? Affects performance
budget and the role of the introspection surface in agent runtime behavior.

---

## Related Plans

- **`plan-cli-substrate-adoption.md`** (WU-A) — Hard upstream dependency. Provides the zod
  schemas WU-B exposes via CLI.
- **`plan-lib-layer-type-extraction.md`**, **`plan-sync-handler-decomposition.md`**,
  **`plan-user-sync-module-split.md`** — Sibling post-trio parallel cluster.

---

## Coordination — ADR-022

The `arc schema` registry exposes the managed operational-state document schemas (ADR-022). Scope which
managed-doc schemas the registry surfaces at launch vs. defer to `operational-state-docs`. See
`adr-022-managed-operational-state-documents.md` § Coordination.
