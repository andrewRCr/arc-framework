# Draft: Compaction Recovery

**Purpose:** Decouple the **ARC session** from the **harness session** so ARC's operating context survives a
harness compaction. ARC owns a deterministic re-hydration path — a compaction seed, a lean `session-recover`
path, and per-harness hook adapters — that re-loads ARC's procedural context after compaction, while the harness
summary carries the episodic "where we were." Compaction becomes a **first-class, expected re-hydration event**,
not a black box to disable.

- **State:** Planning — holistically rewritten 2026-06-28 from the session-decoupling reframe (below); supersedes
  the original 2026-05-21 "emergency bridge" framing.
- **Class:** `Novel` — the *mechanism* composes from existing ARC patterns (session-init load-set, resolve-then-load,
  record projections, hook adapters), but the *model* is invented: ARC-session/harness-session decoupling with
  compaction as a first-class re-hydration boundary, and a procedural/episodic division of labor against an opaque
  summary. Carries an ADR-002 amendment.
- **Readiness:** maturing — scope and direction are settled; open items are detail-design (seed storage path, final
  seed-field list, the deterministic validation harness).
- **Created:** 2026-05-21
- **Origin:** Surfaced 2026-05-21 revisiting ARC's compaction stance; reframed 2026-06-28. The original stance
  (`adr-002`, P5) rejected black-box compaction in favor of explicit handoff and recommended disabling
  auto-compaction. That stance is an artifact of an earlier era — weaker harness compaction, weaker hook surfaces,
  and an earlier mental model that treated the ARC session as ~1:1 with the harness session. All three have moved.

---

## Problem / Motivation

A harness compaction rewrites the conversation, and in doing so **destroys ARC's procedural context** — the
universal constitutional load (briefs, `DEV-RULES`, strategy index), `WORKING-MEMORY`, and the state-selected
context (the active meta, `SESSION-NOTES`, the lifecycle workflow for the current `sessionType`, the task-list
subsection, declared methods/extensions). The harness summary preserves *episodic* memory (roughly "what we were
doing") but does not reliably restore this *procedural/semantic* layer, which assumes session-init ran in the
current context window.

ARC's current position bypasses the problem by disabling compaction and bounding sessions. Two things have made
that position both wrong and increasingly inactionable:

- **Disableability is going away.** Auto-compaction has **no off switch on Codex CLI** (its threshold is clamped)
  and **no documented global disable on Claude Code** (an older setting is deprecated). The "disable where
  possible" guidance assumed a capability the harnesses no longer offer.
- **The session boundaries are not 1:1.** An ARC session is defined by ARC's own lifecycle — opened by
  `session-init`, closed by `session-handoff`, with their probes, signals, and paths — and should be **independent
  of the harness session**, which is bounded by config and context-window limits. ARC already has crisp boundaries
  about what context loads when; nothing forces it to ride the harness's opaque compaction.

**Why now / who it serves.** The mechanism is **load-bearing for Codex** (forced compaction, smaller window —
unusable for sustained ARC work without it) and **insurance for Claude Code** (a large window rarely hit, but the
hook is there when it is). It is a practical pre-parallelism need: more and longer concurrent sessions across
harnesses mean more compaction events to survive. It does **not strictly block** parallelism, but it removes a
real friction from running Codex reliably alongside Claude Code.

## The session-decoupling model (the core idea)

Treat ARC-session context as **idempotently re-establishable on demand**. Compaction is one trigger for
re-establishing it. The division of labor:

- **ARC owns procedural/semantic context** — the constitutional load + the state-selected operating context. This
  is deterministically re-loadable from ARC state (the probe + tracked files), independent of the harness summary.
- **The harness summary owns episodic memory** — the in-flight reasoning of the current task. ARC does not compete
  with it; the harnesses are good at it.

This is why recovery can be lean and mostly deterministic: given the probe-resolved state, the *set of documents to
re-load* is a deterministic function of that state. Even if the harness summary carried **nothing**, ARC's re-load
together with git state and the task pointer would let the agent reconstruct the procedural floor and finish a
half-complete task; richer harness carryover is sugar, not a dependency.

**Two boundaries, two responses (the only real fork):**

- **`compact`** (auto *or* manual `/compact`) — "keep working, the window is full / I shed conversation bulk." The
  task continues; ARC's operating context must be restored → **`session-recover`**. Manual `/compact` carries the
  same intent as auto-compact (shed bulk, not ARC's rules), so the two are handled **identically** — no separate
  coverage.
- **`clear`** — "deliberate reset, fresh start." That is a re-bootstrap, i.e. ordinary `session-init` /
  `arc-session`. Recovery must **not** touch it — doing so would fight the user's intent.

The harness `source`/`trigger` fields give us this fork directly (below), so we never infer it.

## Design

ARC owns the recovery path, not the compaction event. Four ARC-owned surfaces plus an optional per-harness adapter
layer.

### Recovery is re-hydration, not re-orientation

`session-recover` is **not** a re-run of `session-init` — that would redo settled judgment (entry mode, sync,
discovery) wastefully and re-read the session-init monolith. Decomposed against what compaction actually
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

So **recovery ≈ context-load (session-init Step 3) + a cheap probe re-run**, nothing else — and it **bypasses the
session-init monolith** entirely (the most bloated each-session artifact). The load-set is the cheap thing to
re-emit; the workflow prose is the expensive thing we are glad to skip.

**On-demand-load boundary (MVP).** Recovery restores the deterministic init-time load-set + the lifecycle workflow
for the current `sessionType`. It does **not** track context a session loaded *on demand* mid-task (a strategy read
for one task, a method pulled at a step) — that content re-loads via its existing triggers on next need, and
tracking it would require runtime instrumentation. Stated as an explicit scope boundary, not an omission.

### The four ARC-owned surfaces

1. **Compaction seed (a lean, deterministic manifest).** Emitted by an `arc status`-family command with a `--write`
   mode that stores the latest seed at a predictable local path. Under the lean model the seed is **state pointers +
   the load-set manifest + a deterministic uncommitted-file list** — *not* prose reasoning (that is the harness
   summary's job). Working field set:
    - repo root, ARC invocation convention (`arc` vs `npx arc`), branch / HEAD / dirty state;
    - active WU, meta path, `sessionType`, current workflow pointer, current task pointer;
    - the **load-set manifest** (the ordered docs + read-modes to re-load — see below);
    - a git-derived list of uncommitted files (cheap insurance against a lossy summary; deterministic, no agent
      input).
   Explicitly **dropped** from the original draft's seed: "recent post-handoff decisions" prose (episodic → harness).
2. **Load-set emitter (a proto resolve-then-load).** The deterministic "given current state, here is the ordered
   context set with read-modes." The existing `session-init --json` envelope **already** resolves most inputs
   (`sessionType`, `active.path`, `companions`, `extensions`); the incremental piece is a thin projection that maps
   that state to the concrete doc list. Built as a **neutral shared declaration** consumed by both `session-init`
   Step 3 and `session-recover` — *not* a second load mechanism (see § Coordination — composable-workflows).
3. **`session-recover` workflow.** Re-runs the probe, re-loads the state-selected load-set, runs a lightweight
   recovery audit (seed-vs-reality), and resumes; a mismatch / missing identity / dirty-state surprise / lost task
   pointer stops for direction. The re-injected context **re-reads the canonical files** (not a summary of them) and
   lands them at the most-recent context position, with a one-line "the ARC context loaded below is authoritative;
   disregard any earlier paraphrase" framing — dissolving the ambiguous-authority risk of any overlap with what the
   summary already carried.
4. **`arc-recover` skill (the manual fallback).** A thin user-invocable wrapper over `session-recover`, for
   harnesses without usable hooks or for manual recovery when the user notices compaction.

### Harness adapters — the research (2026-06-28)

Per-harness hook recipes invoking the *same* canonical seed/recover commands. The verified picture:

|                                         | **Claude Code**                                                     | **Codex CLI**                                                                              | **OpenCode**                                                                                       |
|-----------------------------------------|---------------------------------------------------------------------|--------------------------------------------------------------------------------------------|----------------------------------------------------------------------------------------------------|
| Hook model                              | `PreCompact` (matcher `manual`/`auto`) + `SessionStart` (`source`)  | **Near-identical** — `PreCompact`/`PostCompact` (`trigger`) + `SessionStart` (`source`)    | Plugin (TS/JS); `experimental.session.compacting` + bus events                                     |
| Leg A — write seed pre-compaction       | Yes (PreCompact runs shell; read-only; can block)                   | Yes (same shape)                                                                           | Yes (`experimental.session.compacting` + shell)                                                    |
| Leg B — inject recovery post-compaction | Yes — `SessionStart(source=compact)` → stdout / `additionalContext` | Yes — `SessionStart(source=compact)` + `additionalContext` (use this, **not** PostCompact) | Fragile — no reliable post-compaction inject; bake the pointer into the compaction summary instead |
| clear vs compact                        | `source: clear` vs `compact`                                        | `source` + `trigger`                                                                       | `session.created` vs `session.compacted`                                                           |
| Auto-compaction disableable             | No documented global disable                                        | No off switch (threshold clamped)                                                          | Configurable threshold (keys under-documented)                                                     |
| Stability                               | Documented, stable                                                  | GA, stable                                                                                 | All compaction hooks `experimental.` — breaking-change risk                                        |
| **Verdict**                             | **Yes — both legs, clean**                                          | **Yes — both legs, clean**                                                                 | **Partial — fragile**                                                                              |

Findings that shape the design:

- **Claude Code and Codex are essentially the same hook.** `PreCompact` writes the seed; `SessionStart(source=compact)`
  injects the recovery pointer; `source=clear` routes to full re-init. This is **one adapter pattern, two config
  formats** (CC `settings.json` hooks vs Codex `config.toml` `[features] hooks=true` + `hooks.json`). The canonical
  commands are identical; only the wiring file differs — making the CC+Codex MVP cheap and strongly validating the
  P8 canonical/adapter split.
- **The two-leg split maps perfectly.** `PreCompact` is read-only on both (writes files, can't inject) — exactly the
  seed-write leg. Injection lands at the post-compaction `SessionStart(compact)` leg.
- **Never block, keep it cheap.** `PreCompact` can block compaction on both — we must not (blocking auto-compaction
  surfaces the context-limit error and fails the request). Write-and-exit-0 only. Both harnesses also have
  compaction-frequency issues, so the seed-write fires *often* — which **validates the lean seed** (a heavy write
  firing 2× as often is the costly path).
- **OpenCode is deferred.** Its injection is architecturally different (bake the pointer into the compaction summary
  via `output.context`, not a separate hook), everything is `experimental.`, and the clean post-compaction-turn
  inject is broken/unmerged (its `session.start(compact)` hook — a watch item — would fix it). OpenCode gets the
  portable `arc-recover` manual fallback like any unhooked harness; no shipped hook recipe until that lands.
- **Token specifics are illustrative only.** Window sizes and thresholds (Codex ~200k/compact-below; CC ~1M) move
  with model versions — the design never depends on a number, only on "compaction fires below the coherence ceiling."

**Side benefit (CC, user preference).** Where a harness exposes a configurable auto-compact threshold (Claude Code
reportedly does), recovery turns it into a usable knob: set a deliberately low threshold and let *compact-and-recover*
carry a long session, rather than relying on session-length discipline. Opt-in, not a recommendation.

## Trigger model

Recovery is only as reliable as its invocation. Ranked, now research-grounded:

1. **Harness hook path (the only reliable one).** PreCompact writes the seed; `SessionStart(source=compact)` injects
   the recovery instruction; `source=clear` routes elsewhere. Both legs must be hook-fired. The cross-cutting lesson
   from `cli-substrate-adoption`'s "discretionary resolvers go unused" finding applies: a recovery that depends on the
   agent *remembering* to act loses to the agent's default, so determinism is non-negotiable here.
2. **Manual `arc-recover` skill (a true fallback).** For unhooked / untrusted-hook harnesses (incl. OpenCode today),
   or when the user notices compaction. Portable and honest, not the primary path.
3. **Behavioral tripwire (a backstop, not a mechanism).** A retained seed whose first line says "run `session-recover`."
   By the discretionary-resolver finding it will be under-invoked exactly when needed — kept as a backstop, relied on
   for nothing.

Hook installation stays **explicit / opt-in** (hooks run local commands and require harness trust); offered during
verify-and-configure, never auto-installed.

## Canonical vs harness-specific (P8)

- **Harness-agnostic (ARC-owned):** seed schema/emitter, the load-set declaration, `session-recover`, `arc-recover`,
  recovery-audit semantics, portable instructions.
- **Harness-specific (adapter-owned):** hook event names, the hook config file, trust prompts, the injection
  mechanism, and whether compaction is detectable/source-distinguishable.

The CC≈Codex finding makes this split unusually clean: the adapter layer is **config, not logic**. ARC defines the
recovery contract once; adapters bind it to a tool.

## Relationship to the existing model

ARC's **handoff is out-of-context persistence at the session boundary** (the structured-notes-outside-the-window
technique). The compaction seed is the **mid-session sibling**: the same structured state, surfaced for a
within-session reset rather than a cross-session one. The reframe recasts it from "emergency bridge" to a
first-class member of the same family — handoff at the session boundary, recovery at the mid-session compaction
boundary.

**Bounded sessions remain a discipline — for a different reason.** Decoupling fixes *procedural-context loss*; it
does **not** retire scope/review discipline. The per-task review-increment interlock is length-independent and
carries that load regardless of session length. What compaction recovery removes is the *correctness* argument
against long sessions; what remains (attention economy, clean mode-transition boundaries, trackability) is
**judgment, not a correctness boundary**. Net: long sessions become **viable, not recommended** — and handoff
stays the preferred path; recovery is for compaction that can't be avoided.

## Considered / rejected

- **`arc-refresh` (voluntary mid-session reload of core T1).** Still rejected, but **re-reasoned** under the
  reframe. The original rationale ("drift is from sessions running too long") is superseded — long sessions are now
  viable. The standing rationale: recovery already provides a clean reset on an *actual discontinuity* (compaction);
  a *voluntary* refresh with no discontinuity is redundant and reintroduces the ambiguous-authority risk (duplicate
  instructions at different context positions). The mitigation for mid-session drift is to let it compact and
  recover (or `clear` + re-init), not a bespoke refresh.

## Constitutional change: ADR-002 amendment + strategy rewrite

The reframe is a stance change, not just a feature.

- **Amend ADR-002** (it owns the session model + the context-preservation / agent-compatibility envelope; the
  decoupling is an evolution of that same envelope, not an orthogonal decision). The amendment: compaction is a
  **recoverable discontinuity** ARC owns the recovery for, not a black box to disable; bounded sessions remain a
  scope/review discipline, not a compaction workaround. Record the **long-session-viability consequence** and the
  **disableability-gone** fact (the old "disable where possible" guidance assumed a capability the harnesses no
  longer offer). Whether the decoupling model earns its *own* ADR is a create-spec / `adr-accept-timing` call.
- **Rewrite `strategy-session-operations § Auto-Compaction`** (adopter-facing — keep it adopter-clean): from "disable
  auto-compaction" to "compaction is a recoverable event; `clear` re-bootstraps via `session-init`, `compact`
  recovers; install the hook recipe to make recovery deterministic." Include the **clear-vs-compact** user guidance.
- External docs-site content also states "don't compact" but is **out of scope here** (stale, separate downstream
  overhaul).

## Validation strategy

A WU whose point is surviving an opaque event can't be fully unit-tested end-to-end.

- **Deterministic parts get tests:** seed emit/parse round-trip, load-set resolution for each `sessionType`, the
  recovery audit (seed-vs-reality).
- **End-to-end is a documented manual protocol** per harness (force a compaction, observe clean recovery) plus
  real dogfooding — the maintainer running Codex exercises it continuously.

## Coordination — forward-compat seams

Compaction recovery is a thin, cross-cutting **consumer** of ARC's state + load substrate: downstream of several
substrate WUs, gated behind none. It ships **interim** (CSA / OSD / CW are not near-term) and is forward-compat'd
so each substrate WU absorbs its end when it lands. A **planning deliverable** of this WU is to **route reciprocal
notes into each sibling's inbound buffer** so each owns its end of the seam.

### Coordination — `composable-workflows` (resolve-then-load)

The load-set emitter is a special case of CW's resolve-then-load thesis (the probe resolves config; workflows load
only applicable fragments). Three layers, currently conflated in `session-init` prose: **policy** (what's in the
set — `loadset-composition`), **declaration** (the state→fragment resolution — the shared seam), **consumers**
(`session-init` Step 3, `session-recover`). Build the emitter as a **minimal proto resolve-then-load** scoped to the
session-init/recovery load-set, **reusing existing declared-load conventions** (`arc.methods` / `arc.extensions` +
probe active-set), never minting a competing loader. CW later subsumes it. Reciprocal note → CW's inbound buffer
(a resolve-then-load consumer is coming; recovery is also a concrete motivating case for CW's "conditional
arm/`sessionType`-gated method declaration" item).

### Coordination — `operational-state-docs` (seed as a projection over records)

The seed reads exactly the surfaces OSD formalizes as managed records (`meta`, `SESSION-NOTES`, `WORKING-MEMORY`).
Frame the seed as a **projection over those records** (sibling to `STATUS.*`): interim it projects from markdown,
post-OSD from records, no reshape. The seed sits on OSD's safe side — pure **read / resolve-don't-store** (re-derived
at compaction, never persisted as authoritative), zero drift risk. **Discipline:** the interim seed reads via the
**existing `session-init/managed-field.ts` extractors** session-init already uses — never a new bespoke parser — so
it inherits exactly session-init's fragility (no worse) and OSD supersedes one reader, not two. Tracks `adr-022`.
Reciprocal note → OSD's inbound buffer.

### Coordination — `cli-substrate-adoption` (typed envelope)

The seed is another agent–CLI envelope crossing the same process boundary CSA hardens. Model it on the session-init
envelope's pattern (zod schema, validate-on-emit + validate-on-consume, `Result`). Shipping before CSA, the seed is
hand-typed and becomes a CSA migration target — *exactly* CSA's "codify a settled shape after it ships" model, so the
debt is pre-budgeted. Reciprocal note → CSA's inbound buffer.

### Coordination — `unit-scoped-review` (tension resolved)

`unit-scoped-review`'s draft flags this WU's old "emergency bridge / disable compaction / `arc-refresh`-rejection"
framing as in tension with its long opt-in batch mode, asking for reconciliation. The reframe **resolves it in
`unit-scoped-review`'s favor** — compaction is now first-class, and `session-recover` is exactly the backstop a long
orchestrated batch wants. Reciprocal note → `unit-scoped-review` + `cohort-approval-flow-refinement`.

## Scope / MVP cutline

- **In:** lean compaction-seed emitter (`--write`), the load-set proto-emitter, the `session-recover` workflow, the
  `arc-recover` skill, and **Claude Code + Codex** hook recipes; the ADR-002 amendment + `strategy-session-operations`
  rewrite.
- **Deferred:** **OpenCode** hook recipe (fragile — manual fallback only; revisit when its `session.start(compact)`
  lands); **volatile-reasoning capture** in the seed (enhancement — add only if dogfooding shows summaries drop
  critical decisions); **record-backed seed** (post-OSD); **CW-substrate fold** (post-CW).

## Out of scope

- Inspecting / overriding the harness's compacted summary (opaque by design; we re-hydrate our own layer instead).
- Standardized cross-harness compaction feed-in (P8 — adapters bind, ARC doesn't standardize the harness internals).
- Reversing the bounded-session model (it survives as a scope/review discipline).
- Automatic hook installation without explicit opt-in and harness trust.

## Resolved (this session)

- Stance: compaction = first-class re-hydration; ARC session decoupled from harness session (ADR-002 amendment +
  strategy rewrite in scope; long-session viability + disableability-gone recorded).
- Lean seed: ARC owns procedural reload, harness owns episodic; seed = deterministic manifest (field set above).
- Recovery = context-load + cheap probe re-run; bypasses the session-init monolith; on-demand loads out of MVP.
- Hooks deterministic both legs; `clear → session-init`, `compact → recover` (auto and manual `/compact` identical);
  `arc-recover` = true fallback; tripwire = backstop.
- Load-set emitter = proto resolve-then-load (neutral shared declaration, reuse declared-load conventions).
- Harness MVP = CC + Codex (one adapter pattern, two config formats); OpenCode deferred.
- Authority mitigation: re-read canonical files, land last, "this is authoritative" framing; never block compaction;
  keep the seed-write cheap.
- `Class = Novel`; stays one WU.

## Open (for create-spec)

- **Seed storage path** — machine-local, gitignored, ephemeral, per-worktree (compaction is per-session/worktree);
  candidate home under a worktree-local `.internal/`. Settle pre-spec.
- **Final seed field list** — confirm the working set above against the load-set manifest's exact shape.
- **Load-set declaration form** — a `--recover-set` view vs an additive envelope slice; exact read-mode encoding.
- **Deterministic validation harness** — round-trip + per-`sessionType` resolution coverage; the manual e2e protocol
  shape per harness.
- **ADR shape** — amend ADR-002 only, or also a dedicated decoupling-model ADR.

## Next

Run `create-spec` (it re-reads the derivation axis with this draft as evidence). Route the four reciprocal
forward-compat notes (CW / OSD / CSA / `unit-scoped-review`) as part of spec/coordination authoring.

## Cross-references

- `adr-002` — session model + context-preservation envelope; the amendment target.
- `strategy-session-operations` § Auto-Compaction — the rewrite target.
- `composable-workflows` — resolve-then-load substrate the emitter forward-compats onto.
- `operational-state-docs` / `adr-022` — managed records the seed projects over.
- `cli-substrate-adoption` — typed-envelope substrate the seed forward-compats onto.
- `loadset-composition` — owns load-set *policy* (membership); tunes the declaration this WU midwifes.
- `unit-scoped-review` / `cohort-approval-flow-refinement` — the resolved-tension coordination.
