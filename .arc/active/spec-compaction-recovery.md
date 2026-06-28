# Spec (`detailed` · `RFC`): Compaction Recovery

- **Origin:** [internal]

- **Purpose:** Decouple the ARC session from the harness session so ARC's procedural context survives a harness
  compaction. ARC owns a deterministic re-hydration path — a compaction seed, a lean `session-recover`, and
  per-harness hook adapters — making compaction a first-class, expected re-hydration event rather than a black box
  to disable.

---

## Introduction / Context

A harness compaction rewrites the conversation and, in doing so, destroys ARC's **procedural/semantic context** —
the universal constitutional load (briefs, `DEV-RULES`, strategy index), `WORKING-MEMORY`, and the state-selected
context (active meta, `SESSION-NOTES`, the lifecycle workflow for the current `sessionType`, the task-list
subsection, declared methods/extensions). The harness summary preserves *episodic* memory ("what we were doing")
but does not restore this procedural layer, which assumes session-init ran in the current context window.

ARC's standing position (`adr-002`, P5-within-sessions) bypasses the problem by disabling auto-compaction and
bounding sessions. Two shifts make that position both wrong and increasingly inactionable:

- **Disableability is going away.** Auto-compaction has no off switch on Codex CLI (its threshold is clamped) and
  no documented global disable on Claude Code (an older setting is deprecated). The "disable where possible"
  guidance assumed a capability the harnesses no longer offer.
- **Session boundaries are not 1:1.** An ARC session is defined by ARC's own lifecycle — opened by `session-init`,
  closed by `session-handoff` — and should be independent of the harness session, which is bounded by config and
  context-window limits. Nothing forces ARC to ride the harness's opaque compaction.

The mechanism is **load-bearing for Codex** (forced compaction, smaller window — unusable for sustained ARC work
without it) and **insurance for Claude Code** (a large window rarely hit, but the hook is there when it is). It is
a practical pre-parallelism need — more and longer concurrent sessions across harnesses mean more compaction
events to survive — though it does not strictly block parallelism.

## Goals

- ARC's procedural/semantic context is **deterministically re-establishable on demand**, independent of the
  harness summary — given probe-resolved state plus tracked files, even a summary carrying nothing leaves the
  agent able to reconstruct the procedural floor and finish a half-complete task.
- **Compaction is handled, not avoided.** `compact` (auto or manual `/compact`) recovers ARC's operating context;
  `clear` routes to ordinary re-bootstrap (`session-init`). The two boundaries are distinguished from harness
  signals, never inferred.
- **Recovery is lean** — it re-hydrates the lost layer (context-load) plus a cheap probe re-run, and bypasses the
  session-init monolith entirely; it does not redo settled judgment (entry mode, sync, discovery, orientation).
- **Determinism over discretion** at the invocation point — recovery fires from harness hooks, not from the agent
  remembering to act.
- **Forward-compatible by construction** — the load-set declaration and the seed sit on shared substrate seams so
  later substrate work (`composable-workflows`, `operational-state-docs`, `cli-substrate-adoption`,
  `loadset-composition`) absorbs each end without a fork.
- **Constitutional alignment** — record the stance change (`adr-002` amendment + `strategy-session-operations`
  rewrite): compaction is a recoverable discontinuity ARC owns, bounded sessions survive as a scope/review
  discipline.

## Non-Goals

- Inspecting, overriding, or standardizing the harness's compacted summary — it is opaque by design; ARC
  re-hydrates its own layer instead.
- A standardized cross-harness compaction feed-in — adapters bind ARC's contract to a tool; ARC does not
  standardize harness internals (P8).
- Reversing the bounded-session model — it survives as a scope/review discipline, not a compaction workaround.
- Automatic hook installation without explicit opt-in and harness trust.
- Tracking context a session loaded **on demand** mid-task (a strategy read for one task, a method pulled at a
  step) — that content re-loads via its existing triggers on next need; tracking it would require runtime
  instrumentation. Explicit MVP scope boundary.
- A voluntary mid-session reload with no discontinuity (`arc-refresh`) — rejected (see § Alternatives).
- Gating `arc-recover` installation per-harness / opt-in — MVP installs it unconditionally; the gating decision
  is deferred to `agent-platform-support` (it owns init/join harness-tool selection + per-harness skill
  generation). See § Cross-cutting → Forward-compat seams.

## Proposed Design

ARC owns the **recovery path**, not the compaction event. The division of labor: ARC owns
procedural/semantic context (deterministically re-loadable from state); the harness summary owns episodic memory
(the in-flight reasoning of the current task). Four ARC-owned surfaces plus an optional per-harness adapter layer.

### Recovery is re-hydration, not re-orientation

`session-recover` is **not** a re-run of `session-init`. It is decomposed against what compaction actually
invalidates:

| session-init step               | Survives compaction?                                     | Recovery action                        |
|---------------------------------|----------------------------------------------------------|----------------------------------------|
| Probe (state resolution)        | Mostly — but HEAD/dirty/ahead can have moved mid-session | **Re-run** (cheap, deterministic)      |
| Dispatch + sync pulls           | Entry mode already settled; re-pulling mid-work is wrong | **Skip**                               |
| Context load (the load-set)     | **This is what's lost**                                  | **Re-hydrate** — the point             |
| Post-context-load extensions    | Lost with context                                        | Re-run if applicable                   |
| Freshness / next-work discovery | Mid-session we know our own state                        | **Skip**                               |
| Orientation prompt              | Not awaiting direction; mid-task                         | **Skip** (no user prompt)              |
| Mismatch handling               | —                                                        | Lightweight seed-vs-reality check only |

So **recovery ≈ context-load (session-init Step 3) + a cheap probe re-run**, and it bypasses the session-init
monolith — the most bloated each-session artifact. The load-set is the cheap thing to re-emit; the workflow prose
is the expensive thing recovery is glad to skip.

### Surface 1 — Compaction seed (lean, deterministic manifest)

Emitted by an `arc status`-family command with a `--write` mode that stores the latest seed at a fixed
machine-local path: `.arc/user/{identity}/.internal/compaction-seed.json`. It is **gitignored** (the whole user
tree is), **per-worktree by the gitignore boundary** (that tree is never checked out into linked worktrees), and
**excluded from the git-notes user-sync projection** (machine/worktree-local, never travels).

The seed is **state pointers + the embedded load-set manifest + a deterministic uncommitted-file list** — not
prose reasoning (that is the harness summary's job). Concrete hand-typed shape (pre-CSA; a deliberate migration
target for CSA's zod/`Result` sweep):

```typescript
/** Schema version for forward-compatible parsing across seed-format evolution. */
type SeedSchemaVersion = 1;

/** Read discipline mirroring session-init Step 3's three modes. */
type ReadMode =
  | { kind: "full" }
  | { kind: "partial-section"; heading: string }
  | { kind: "partial-strategic" }; // header + current-phase preamble + current-task section

interface LoadSetEntry {
  path: string;       // relative to repoRoot
  readMode: ReadMode;
}

/** The ordered context set; array order = read order. */
interface LoadSetManifest {
  entries: LoadSetEntry[];
}

interface CompactionSeed {
  schemaVersion: SeedSchemaVersion;
  emittedAt: string;               // ISO-8601; audit/debug only, never load-bearing

  // Environment
  repoRoot: string;                // absolute path to the checkout root (the dir containing .arc/)
  branch: string;
  head: string;                    // HEAD sha at emit
  dirty: boolean;

  // Work-unit state pointers
  activeWorkUnit: string | null;   // WU slug, or null between units
  metaPath: string | null;         // relative path to the active meta, or null
  sessionType: "planning" | "execution" | "integration" | null;
  currentWorkflow: string | null;  // current lifecycle / planning-stage pointer
  currentTask: { id: string; title: string; lineHint: number } | null; // null in planning

  // Recovery baseline
  loadSet: LoadSetManifest;        // embedded as the recovery-audit baseline (see below)
  uncommittedFiles: string[];      // git-derived; deterministic; lossy-summary insurance
}
```

The embedded `loadSet` is the **recovery-audit baseline** — `session-recover` re-resolves a fresh load-set and
diffs against it — **not** a re-load shortcut. Explicitly **dropped** from the original draft's seed:
"recent post-handoff decisions" prose (episodic → harness).

**Invocation convention is not seed state.** Whether the recover command is `arc` or `npx arc` is a
harness-bootstrap concern — bare `arc` for adopters always, `npx arc` only in this self-hosting repo — carried by
the harness entry files (`AGENTS.md`) and, post-compaction, embedded in the adapter's injection instruction
(harness-specific, adapter-owned per P8). The canonical seed stays **invocation-neutral**: it ships as a shape, so
a dev-only field in it would be both an audience-boundary leak and a mis-set hazard. Out by design.

### Surface 2 — Load-set emitter (proto resolve-then-load)

The deterministic "given current state, here is the ordered context set with read-modes." The existing
`session-init --json` envelope already resolves most inputs (`sessionType`, `active.path`, `companions`,
`extensions`); the incremental piece is a thin projection mapping that state to the concrete doc list.

Built as a **neutral shared declaration** — not a second load mechanism. Form: an **additive `loadSet` slice on
the existing probe envelope** (one shared projection). Read-modes are the tagged union above, mirroring Step 3's
three disciplines (`full`, `partial-section`, `partial-strategic`); array order is read order. `session-recover`
consumes the slice; `session-init` Step 3 keeps its inline enumeration for the MVP — **parity-tested** against the
projection, with the prose-level rewire to consume it deferred to `composable-workflows` (the most-exercised
workflow is not rewired inside a recovery WU; CW owns that rewire as its core resolve-then-load job).

The projection resolves **membership** from `session-init` Step 3's documented per-type loadset policy — the fixed
universal constitutional set + the `sessionType`-selected state docs (the codebase's existing "per-type loadset",
`active/types.ts`) + the active-extensions slot + the cohort doc — never a recover-specific list, and **not**
`arc.methods` (methods load on-demand per workflow, not at init). So `composable-workflows` / `loadset-composition`
later subsume it without a fork; it reuses existing conventions and never mints a competing loader.

### Surface 3 — `session-recover` workflow

The lean recovery path. In order:

1. **Re-run the probe in lean recover mode** (`arc status --recover --json`; see § Cross-cutting → Lean probe
   mode). Cheap, deterministic; picks up any mid-session HEAD/dirty/branch movement.
2. **Re-resolve the load-set** from the re-run probe and **run the recovery audit** — diff the fresh load-set
   against the seed's embedded manifest. Divergence means state moved mid-session.
3. **Re-hydrate**: read the state-selected load-set (canonical files, not summaries of them) plus the lifecycle
   workflow for the current `sessionType`, landing them at the most-recent context position.
4. **Authority framing**: prefix the re-injected context with a one-line "the ARC context loaded below is
   authoritative; disregard any earlier paraphrase" — dissolving the ambiguous-authority risk of any overlap with
   the harness summary.
5. **Resume** the in-flight task. **Stop for direction** only on a recovery-audit mismatch, missing identity,
   dirty-state surprise, or a lost task pointer — never a routine user prompt.

Recovery restores the deterministic init-time load-set + the lifecycle workflow; it does **not** restore
on-demand mid-task loads (Non-Goals).

### Surface 4 — `arc-recover` skill (manual fallback)

A thin user-invocable wrapper over `session-recover`, for harnesses without usable hooks (OpenCode today) or for
manual recovery when the user notices compaction. Portable and honest — a true fallback, not the primary path.
**MVP installs it unconditionally**; gating its installation per-harness / opt-in is deferred (§ Cross-cutting →
Forward-compat seams) — for hook-path harnesses (CC/Codex) the manual skill is rarely invoked, so an opt-in gate
avoids clogging skill registries with an unused entry.

### Adapter layer — per-harness hooks

Per-harness hook recipes invoking the **same** canonical seed/recover commands. Two legs:

- **Leg A (write seed, pre-compaction)** — a read-only pre-compaction hook writes the seed and exits 0.
- **Leg B (inject recovery, post-compaction)** — a post-compaction session-start hook injects the recovery
  instruction; the deliberate-reset signal routes to full `session-init` instead.

| Harness         | Leg A (seed)                      | Leg B (inject)                                                           | clear vs compact                  | Verdict             |
|-----------------|-----------------------------------|--------------------------------------------------------------------------|-----------------------------------|---------------------|
| **Claude Code** | `PreCompact`                      | `SessionStart(source=compact)` → stdout                                  | `source: clear` vs `compact`      | **Yes — both legs** |
| **Codex CLI**   | `PreCompact`                      | `SessionStart(source=compact)` + `additionalContext` (not `PostCompact`) | `source` + `trigger`              | **Yes — both legs** |
| **OpenCode**    | `experimental.session.compacting` | Fragile — no reliable post-compaction inject                             | `session.created` vs `.compacted` | **Deferred**        |

Claude Code and Codex are essentially the **same hook, two config formats** (CC `settings.json` hooks; Codex
`config.toml` `[features] hooks=true` + `hooks.json`) — the canonical commands are identical; only the wiring file
differs, validating the P8 canonical/adapter split and making the CC+Codex MVP cheap. OpenCode is deferred: its
injection is architecturally different (bake the pointer into the compaction summary), everything is
`experimental.`, and the clean post-compaction inject is unmerged; it gets the portable `arc-recover` fallback.

### The only real fork — `compact` vs `clear`

- **`compact`** (auto *or* manual `/compact`) — "keep working, the window is full / shed bulk." The task
  continues; ARC's operating context must be restored → **`session-recover`**. Manual `/compact` carries the same
  intent as auto-compact, so the two are handled **identically** — no separate coverage.
- **`clear`** — "deliberate reset, fresh start." That is a re-bootstrap → ordinary `session-init` / `arc-session`.
  Recovery must **not** touch it.

The harness `source`/`trigger` fields give this fork directly; ARC never infers it.

### Canonical vs harness-specific (P8)

- **Harness-agnostic (ARC-owned):** seed schema/emitter, the load-set declaration, `session-recover`,
  `arc-recover`, recovery-audit semantics, portable instructions.
- **Harness-specific (adapter-owned):** hook event names, the hook config file, trust prompts, the injection
  mechanism, and whether compaction is detectable/source-distinguishable.

The CC≈Codex finding makes the split unusually clean: the adapter layer is **config, not logic**. ARC defines the
recovery contract once; adapters bind it to a tool.

## Alternatives & Rationale

- **Re-run `session-init` on recovery (rejected).** Redoes settled judgment (entry mode, sync, discovery,
  orientation) wastefully and re-reads the session-init monolith — the most bloated each-session artifact. The
  step-by-step decomposition (§ Proposed Design) shows only context-load is actually lost; everything else either
  survives or is wrong to redo mid-task. Recovery targets exactly the lost layer.

- **`arc-refresh` — voluntary mid-session reload of core T1 (rejected).** Recovery already provides a clean reset
  on an *actual* discontinuity (compaction); a *voluntary* refresh with no discontinuity is redundant and
  reintroduces the ambiguous-authority risk (duplicate instructions at different context positions). The
  mitigation for mid-session drift is to let it compact and recover (or `clear` + re-init). The original "drift
  from long sessions" rationale is also superseded — long sessions are now viable.

- **Heavy seed carrying reasoning prose (rejected for MVP).** The seed-write fires *often* (both MVP harnesses
  have compaction-frequency issues), so a heavy write firing 2× as often is the costly path. Episodic reasoning is
  the harness summary's job; ARC's procedural layer is the deterministic complement. Volatile-reasoning capture is
  deferred — add only if dogfooding shows summaries drop critical decisions.

- **A recover-specific load list (rejected).** The projection resolves membership from shared declared-load
  policy, so `composable-workflows` / `loadset-composition` subsume it without a fork. A bespoke list would fork
  the load mechanism and rot against session-init's.

- **A bespoke seed parser (rejected).** The seed's state-pointer fields are *sourced* from the underlying markdown
  records (meta, `SESSION-NOTES`) at write time via session-init's existing `session-init/managed-field.ts`
  extractors — the JSON seed itself round-trips via ordinary serialize/parse, no markdown parsing on read. So it
  inherits exactly session-init's source-read fragility (no worse), and `operational-state-docs` later supersedes
  *one* reader, not two.

- **OpenCode hook recipe now (deferred).** Fragile injection + all-`experimental.` surfaces; the manual
  `arc-recover` fallback covers it until its `session.start(compact)` hook lands (a watch item).

- **Blocking compaction in the pre-compaction hook (rejected).** Both MVP harnesses *can* block, but blocking
  auto-compaction surfaces the context-limit error and fails the request. Write-and-exit-0 only.

## Cross-cutting Considerations

### Lean probe mode

`session-recover` re-runs the probe in a **recover mode** (`arc status --recover --json`) that emits only the
slices recovery needs and **skips the dispatch-only oracles**:

- **Kept** (state + load-set resolution): `identity`, `worktree` (branch / HEAD / dirty / ahead-behind freshness),
  `dirty`, `active` (resolution / path / `sessionType` / companions), `config`, `releaseRouting` (commit/push
  routing the resumed task needs at its next commit), `extensions`, the new `loadSet` slice, and `cohortDocPath`
  when present (a load-set member).
- **Skipped** (dispatch / sync — entry mode already settled, no sync, no discovery): `user` (notes-sync state —
  recovery never pulls), `roster`, `sweep`,
  `planOrphanSweep`, `retiredSubdirs`, `errandSweep`, `errandState`, `workUnitState`, `materializableWorkUnits`,
  `inFlightComposition`, `inboxState`, `partialPushMarker`, `recommendedCombinedPrompt`, `recovery`, and the
  sync-advisory `baseDistance` / `baseBranchSync` channels. `domainRules` stays load-on-demand.

### Constitutional change + doc cascade

The reframe is a stance change, and the stance is encoded across several **adopter-facing** surfaces, not just
§ Auto-Compaction. Every edit below stays adopter-clean.

**The disambiguation, applied uniformly.** The current surfaces conflate two triggers for resetting context; the
reframe separates them:

- **Boundary-driven reset** (at a mode transition or phase/WU completion) → **handoff** stays the recommendation,
  unchanged. It is a *judgment* call (attention, trackability, a clean next-mode baseline), never a
  context-preservation *correctness* necessity.
- **Pressure-driven reset** (the window fills *between* natural boundaries) → no longer forces an early handoff;
  the session **compacts and recovers**. This replaces the old "bound sessions or lose context" correctness claim.

**Why handoff survives at boundaries (the rationale to record).** Post-recovery, both paths restore the *identical
procedural floor* — the meta is the durable pointer, so recovery and a fresh re-init resolve the same load-set. The
sole delta is **episodic**: handoff + `clear` + re-init delivers a *curated-minimal* episodic baseline, while
compaction carries the harness's *opaque auto-summary* of the prior stretch forward. That residue is
**mode-relative — a liability at a mode transition (the prior mode's reasoning is noise for the next), an asset
within a mode (it is the in-flight task reasoning)**. So handoff earns its keep precisely at boundaries, where the
residue flips from asset to liability. Two precision guards for the prose: "clean baseline" means a clean
*episodic* baseline, not a lighter load (re-init does a full procedural load); and the reset comes from the fresh
load after `clear`, not the handoff write itself (handoff durably *captures*, then you reset). Advisory throughout
— long-session users may let compaction carry them, knowingly trading the clean baseline for continuity.

**Surfaces (all adopter-facing):**

- **Amend `adr-002`** (Tier-2, append-only — confirmed amend-only, no new ADR). It owns the session model +
  context-preservation / agent-compatibility envelope; the decoupling **evolves** that envelope, it does not
  reverse it. Records: compaction is a **recoverable discontinuity** ARC owns recovery for, not a black box to
  disable; bounded sessions remain a scope/review discipline; the **long-session-viability** consequence; the
  **disableability-gone** fact (the old "disable where possible" guidance assumed a capability the harnesses no
  longer offer); and the **episodic-vs-procedural / mode-relative-residue** rationale above (the durable *why*
  handoff survives at boundaries).
- **Rewrite `strategy-session-operations` § Auto-Compaction** — from "disable auto-compaction" to "compaction is a
  recoverable event; `clear` re-bootstraps via `session-init`, `compact` recovers; install the hook recipe to make
  recovery deterministic." Include the **clear-vs-compact** user guidance.
- **Revise `strategy-session-operations` § Context Monitoring** — the threshold response shifts from "the user
  responds by triggering handoff" to the boundary-vs-pressure fork: hand off if at a natural boundary, else let the
  session compact and recover. Thresholds survive as monitoring guidance, not forced-handoff triggers.
- **Revise `DEV-RULES.ARC` § Context quality / Session Management** — keep the natural-boundaries list and the
  handoff recommendation; reframe its rationale as *judgment*, and add the pressure carve-out (pressure between
  boundaries no longer forces an early handoff — compact and recover). Apply the two precision guards above.
- **Touch `AGENT-BRIEF.ARC` § session lifecycle** (minor) — name recovery as the third lifecycle event alongside
  init and handoff (compaction → recover), so the lifecycle line is not handoff-only.
- External docs-site content also states "don't compact" but is **out of scope here** (stale, separate downstream
  overhaul).

### Forward-compat seams

Compaction recovery is a thin, cross-cutting **consumer** of ARC's state + load substrate: downstream of several
substrate WUs, gated behind none. It ships **interim** and is forward-compat'd so each substrate WU absorbs its
end when it lands. A **planning deliverable** of this WU is to route reciprocal notes into each sibling's inbound
buffer (already routed; see § Open Questions for status):

- **`composable-workflows`** — the load-set emitter is a special case of resolve-then-load (probe resolves config;
  workflows load only applicable fragments). Build it as a minimal proto resolve-then-load scoped to the
  session-init/recovery load-set; CW later subsumes it. CW also owns the deferred prose-level rewire of
  `session-init` Step 3 to consume the slice — this WU ships it consumed by `session-recover` only, parity-tested.
- **`operational-state-docs` / `adr-022`** — the seed reads exactly the surfaces OSD formalizes as managed records
  (`meta`, `SESSION-NOTES`, `WORKING-MEMORY`). Frame the seed as a **projection over those records** (sibling to
  `STATUS.*`): interim it projects from markdown via the existing extractors, post-OSD from records, no reshape.
  Pure read / resolve-don't-store — re-derived at compaction, never persisted as authoritative; zero drift risk.
- **`cli-substrate-adoption`** — the seed (and the `loadSet` slice) are agent–CLI envelopes crossing the same
  process boundary CSA hardens. Author them hand-typed and hand-validated where it matters (the
  `audit-log.ts:validateEntry()` precedent); they are deliberate migration targets for CSA's validation-surface
  sweep — exactly its "codify a settled shape after it ships" model, so the zod/`Result` debt is pre-budgeted.
- **`unit-scoped-review` / `cohort-approval-flow-refinement`** — the reframe resolves `unit-scoped-review`'s
  flagged tension in its favor: compaction is now first-class, and `session-recover` is exactly the backstop a
  long orchestrated batch wants.
- **`agent-platform-support`** — owns init/join harness-tool selection and per-harness skill generation. The
  `arc-recover` installation gate (opt-in / per-harness, so hook-path users don't carry an unused skill) lands
  there; this WU ships `arc-recover` by default and routes the reciprocal note. `skill-infrastructure-cleanup` is
  the adjacent home for the skill-inventory-placement facet.

### Trigger reliability

Recovery is only as reliable as its invocation, ranked:

1. **Harness hook path (the only reliable one).** Both legs hook-fired. The `cli-substrate-adoption` lesson —
   "discretionary resolvers go unused" — applies: a recovery depending on the agent *remembering* to act loses to
   the agent's default, so determinism is non-negotiable.
2. **Manual `arc-recover` skill (a true fallback)** — unhooked/untrusted-hook harnesses, or user-noticed
   compaction.
3. **Behavioral tripwire (a backstop, relied on for nothing)** — a retained seed whose first line says "run
   `session-recover`"; under-invoked exactly when needed.

Hook installation stays **explicit / opt-in** (hooks run local commands and require harness trust) — offered
during verify-and-configure, never auto-installed.

### User-facing impact

- Where a harness exposes a configurable auto-compact threshold (Claude Code reportedly does), recovery turns it
  into a usable knob: set a deliberately low threshold and let compact-and-recover carry a long session. **Opt-in,
  not a recommendation.**
- **Side benefit — handoff-commit-noise reduction.** Context-pressure handoffs (each writing the meta + landing a
  `chore(arc): handoff` commit) are frequent; decoupling lets context pressure be absorbed by compact-and-recover
  instead, returning handoff to its natural-boundary role. Opt-in: recovery *enables* the reduction, it does not
  mandate a handoff cadence.
- Token specifics (window sizes, thresholds) are **illustrative only** — they move with model versions; the design
  depends only on "compaction fires below the coherence ceiling," never a number.

### Relationship to the existing model

ARC's **handoff is out-of-context persistence at the session boundary**. The compaction seed is the **mid-session
sibling** — the same structured state, surfaced for a within-session reset. Bounded sessions remain a discipline
for a *different* reason: decoupling fixes procedural-context loss; it does not retire scope/review discipline (the
per-task review-increment interlock is length-independent). Net: long sessions become **viable, not recommended** —
handoff stays the preferred path; recovery is for compaction that can't be avoided.

## Success Criteria

- **Seed round-trip:** the seed emits to the fixed machine-local path and parses back losslessly; unit-tested.
- **Load-set resolution:** the shared projection resolves the correct ordered load-set + read-modes for each
  `sessionType` (planning / execution / integration); unit-tested. `session-recover` consumes it; `session-init`
  Step 3's resolution is parity-tested against it (prose-level consumption deferred to `composable-workflows`).
- **Recovery audit:** `session-recover` re-resolves the load-set, diffs against the seed's embedded manifest, and
  stops for direction on divergence (state moved mid-session); unit-tested across match and mismatch.
- **Lean probe mode** emits exactly the kept slices and omits the skipped oracles (§ Cross-cutting → Lean probe
  mode); verified.
- **End-to-end (manual, per harness):** on Claude Code and Codex, forcing a compaction injects recovery and the
  agent resumes the in-flight task with the procedural floor restored; `clear` routes to full `session-init`
  instead. Protocol lives in `notes-compaction-recovery.md`; validated by maintainer dogfooding (Codex exercises
  it continuously).
- **Constitutional + doc cascade:** `adr-002` carries the append-only amendment (incl. the episodic-vs-procedural
  rationale); the boundary-vs-pressure disambiguation is applied — adopter-clean — across
  `strategy-session-operations` (§ Auto-Compaction + § Context Monitoring), `DEV-RULES.ARC` § Context quality, and
  `AGENT-BRIEF.ARC`'s lifecycle line. No live adopter-facing surface still presents session-bounding / handoff as
  the context-preservation *correctness* mechanism.
- **Forward-compat:** the reciprocal notes (four substrate seams + the `arc-recover`-gating note to
  `agent-platform-support`) are present in the sibling inbound buffers; the load-set projection
  resolves membership from shared policy (no recover-specific list); the seed's embedded manifest is produced by
  the same projection and read via the existing `managed-field.ts` extractors.
- **Never blocks:** the pre-compaction seed write exits 0 and never blocks compaction.

## Open Questions

Genuine implementation detail, resolved during the work — none is a resolve-before-starting blocker:

- **Exact `arc status` subcommand surface for `--write`** — which existing status-family command hosts the seed
  write, and the precise flag spelling, settle at implementation against the command layer.
- **Recovery-audit divergence granularity** — what counts as a stop-worthy diff (membership change vs. read-mode
  change vs. path drift) versus a silently-tolerated one; tuned against real recovery runs.
- **`emittedAt` / staleness handling** — whether `session-recover` warns when the seed is older than the current
  HEAD movement suggests, or relies solely on the audit diff.

The four substrate reciprocal notes (CW / OSD / CSA / `unit-scoped-review`) are **already routed** (not open) —
confirmed at handoff. The fifth — the `arc-recover`-gating note to `agent-platform-support` — is routed at this
create-spec pass.
