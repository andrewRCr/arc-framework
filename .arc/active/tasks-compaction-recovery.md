# Task List: Compaction Recovery

- **Design:** `spec-compaction-recovery.md`

---

## **Phase 1:** Load-set projection

_Purpose:_ Establish the shared resolve-then-load projection — the additive `loadSet` slice on the probe envelope
encoding `session-init` Step 3's documented per-type loadset policy (the fixed universal set +
`sessionType`-selected state docs + active extensions + cohort doc), never a recover-specific list.
`session-recover` consumes it; `session-init`'s prose-level consumption is deferred to `composable-workflows`
(parity-tested meanwhile).

_Design decisions:_ Built as a minimal proto resolve-then-load — a forward-compat seam `composable-workflows` /
`loadset-composition` later subsumes without a fork. Read-modes are the tagged union mirroring Step 3's three
disciplines (`full` / `partial-section` / `partial-strategic`); array order is read order. See
`notes-compaction-recovery.md` for the substrate-seam rationale.

### `[x]` **1.1 Define load-set manifest types**

- _Goal:_ A versioned, shared type vocabulary expresses an ordered context set with a per-entry read discipline,
  importable by both the probe envelope and the seed schema without redefinition.

- _Outcome:_ Added `src/lib/load-set/types.ts` with `LoadSetManifestVersion`, `ReadMode`, `LoadSetEntry`, and
  `LoadSetManifest`, plus compile-backed unit coverage pinning the import target and all three read disciplines.

### `[x]` **1.2 Implement the shared load-set projection**

- _Goal:_ Given probe-resolved state, the projection deterministically yields the ordered load-set with the
  correct read-mode per entry for every `sessionType`.
- _Outcome:_ Added pure `resolveLoadSetManifest` projection in `src/lib/load-set/projection.ts`, covering
  universal/state-anchored docs, per-`sessionType` lifecycle members, execution task-list partial reads, active
  extension docs, and cohort docs with unit coverage.

### `[ ]` **1.3 Expose `loadSet` as an additive envelope slice**

- _Goal:_ The projection surfaces as an additive slice on the probe envelope, exposed identically to the
  `session-init` and `--recover` envelope modes — one shared resolver, never a forked loader.
- _Note:_ `session-recover` consumes the slice (Phase 4); `session-init` Step 3 keeps its inline enumeration for
  now, parity-tested against the projection, with prose-level consumption deferred to `composable-workflows`
  (routed). This WU wires the slice and proves parity — it does not rewire `session-init`'s prose.

    - `[x]` **1.3.a Wire the projection as an eager `Probe<LoadSetManifest>` slice**
        - Added the `loadSet` slice to `SessionInitProbeResult`, projected from resolved active, extension, and
          cohort state; `ActiveSessionInitResult` now exposes the resolved task-list path so the projection does
          not guess from meta filenames.

    - `[~]` **1.3.b Smoke-test the slice on both envelope modes**
        - Deferred to Task 3.1, which owns introducing the lean `--recover` envelope and its exact kept/omitted
          slice tests; `session-init` wiring is covered by 1.3.a, and recover parity becomes meaningful only once
          the recover mode exists.

## **Phase 2:** Compaction seed

_Purpose:_ Emit the lean deterministic seed — state pointers + the embedded load-set manifest + a deterministic
uncommitted-file list — to a fixed machine-local path, gitignored and excluded from the git-notes user-sync
projection.

_Design decisions:_ Hand-typed / hand-validated schema (a deliberate `cli-substrate-adoption` migration target,
per the `audit-log.ts:validateEntry()` precedent). `.internal/` placement leans on the user-sync classifier's
never-synced boundary — no new exclusion list. The canonical seed stays invocation-neutral (no `arc` / `npx arc`
field — a dev-only field would be both an audience leak and a mis-set hazard). The embedded `loadSet` is the
recovery-audit baseline, not a re-load shortcut.

### `[x]` **2.1 Define the `CompactionSeed` schema**

- _Goal:_ A versioned, invocation-neutral seed shape captures everything recovery needs to re-hydrate and audit —
  environment, WU state pointers, the embedded load-set baseline, and the uncommitted-file list.
- _Outcome:_ Added `src/lib/compaction-seed/schema.ts` with schema-v1 `CompactionSeed` types, shared
  `LoadSetManifest` embedding, runtime validation, JSON parse/stringify helpers, and unit coverage for valid,
  null-pointer, malformed, mismatched, and invalid-shape payloads.

### `[x]` **2.2 Implement the seed `--write` emitter**

- _Goal:_ A status-family command writes the current seed on demand, deriving every field deterministically from
  probe state + git, and exits 0.
- _Outcome:_ Added `src/lib/compaction-seed/emitter.ts` and the `status --session-init
  --write-compaction-seed` flag. The emitter reuses the session-init `loadSet`, derives live HEAD/dirty files from
  git, reads meta pointers through `meta-reader.ts`, writes the identity-scoped seed sidecar without throwing, and
  is covered by unit tests plus a built-CLI E2E smoke.

### `[x]` **2.3 Persist to the fixed machine-local path**

- _Goal:_ The seed lands at `.arc/user/{identity}/.internal/compaction-seed.json`, where the gitignore and the
  user-sync classifier guarantee it stays machine- and worktree-local.

    - `[x]` **2.3.a Write to the identity-resolved `.internal/` path**
        - The emitter resolves `.arc/user/{identity}/.internal/compaction-seed.json` and writes through the
          shared atomic JSON helper, which creates the `.internal/` parent when absent.

    - `[x]` **2.3.b Confirm sync exclusion with a regression test**
        - Added a classifier regression asserting `.internal/compaction-seed.json` resolves to `never-synced`,
          relying on the existing `.internal/**` boundary rather than a seed-specific manifest entry.

## **Phase 3:** Lean probe mode and recovery audit

_Purpose:_ Provide the two recover-supporting CLI internals — the lean `--recover` probe (kept slices only,
dispatch-only oracles skipped) and the recovery-audit diff (a fresh load-set re-resolved and diffed against the
seed's embedded manifest).

_Design decisions:_ Lean mode reuses the existing envelope orchestrator via conditional spreads — no second
loader. Audit divergence granularity (membership vs. read-mode vs. path drift, and what is stop-worthy vs.
silently tolerated) is tuned against real recovery runs (spec § Open Questions).

### `[x]` **3.1 Implement the lean `arc status --recover --json` probe mode**

- _Goal:_ A `--recover` flag emits only the slices recovery needs and skips the dispatch-only oracles, producing
  a cheap deterministic re-probe that picks up mid-session HEAD / dirty / branch movement.
- _Outcome:_ Added the recover-mode status orchestrator, CLI flag, and handler branch. The lean envelope emits the
  recovery state slices plus shared `loadSet` / optional `cohortDocPath`, omits sync and discovery-only surfaces,
  and is covered by orchestrator tests plus built-CLI E2E smoke and conflict coverage.

### `[x]` **3.2 Implement the recovery-audit diff**

- _Goal:_ `session-recover` can re-resolve a fresh load-set, diff it against the seed's embedded manifest, and
  return a structured divergence verdict signalling that state moved mid-session.
- _Outcome:_ Added `auditLoadSetManifest` in `src/lib/load-set/audit.ts`, returning a renderable verdict with
  membership, read-mode, and path-drift categories, with unit coverage for clean match and mixed divergence cases.

## **Phase 4:** session-recover workflow and arc-recover skill

_Purpose:_ Author the agent-facing recovery surfaces — the lean `session-recover` workflow (re-hydrate, not
re-orient) and the thin `arc-recover` manual-fallback skill.

_Design decisions:_ Recovery ≈ context-load + a cheap probe re-run, bypassing the `session-init` monolith; the
authority-framing prefix dissolves any ambiguous-authority overlap with the harness summary; recovery restores
only the init-time load-set + lifecycle workflow, never on-demand mid-task loads. The skill installs
unconditionally for MVP (per-harness / opt-in gating deferred to `agent-platform-support`).

### `[x]` **4.1 Author the `session-recover` workflow**

- _Goal:_ A lean recovery workflow re-hydrates exactly the lost procedural layer and resumes the in-flight task,
  never re-running settled `session-init` judgment (entry mode, sync, discovery, orientation).
- _Outcome:_ Added mirrored `session-recover.md` workflow copies with lean recover probe, seed read, load-set
  audit, dirty/task-pointer stops, fresh load-set rehydration, the `#post-context-load` fire point, and no
  interlock gates or routine prompt.

### `[x]` **4.2 Author the `arc-recover` skill**

- _Goal:_ A portable, user-invocable skill wraps `session-recover` for harnesses without usable hooks (OpenCode)
  or for manual recovery when the user notices compaction.

    - `[x]` **4.2.a Author `SKILL.md`**
        - Added mirrored `arc-recover/SKILL.md` wrappers that dispatch to `session-recover` and distinguish
          manual compaction recovery from normal `arc-session` entry.

    - `[x]` **4.2.b Register in `init-recipe.json`**
        - Registered `arc-recover` in the canonical skill list, recipe include set, lifecycle workflow include set,
          and shipped skill README so init/update install it unconditionally for the MVP.

- _Outcome:_ The manual fallback now ships alongside the workflow: `.arc` gets the canonical skill/workflow
  files, per-tool skill generation includes `arc-recover`, and install/update recipe validation covers the new
  entries.

## **Phase 4.R:** Recovery authority revision

_Purpose:_ Apply the remedial design discovered while reading the new recovery workflow from an agent's
post-compaction perspective: ARC recovery restores the deterministic operating floor, while the harness compaction
summary owns the volatile "what was happening this second" layer.

_Design decisions:_ After compaction, volatile meta fields are soft/stale for resume authority (`Next Task`,
`Next Action`, `Last Completed`, `Current Workflow`, `Blockers`). Use deterministic CLI projections where they
can remove judgment: shared task-list cursor, path-set dirty comparison, and a single `arc recover audit --json`
verdict. Stop only on true uncertainty or contradiction, not as a routine fallback when the harness summary
supplies the live leaf concern.

### `[x]` **4.R.1 Apply the stale-field authority contract**

- _Goal:_ The spec and agent-facing recovery prose clearly separate ARC's deterministic context floor from the
  harness summary's volatile execution-locus summary, and no workflow treats stale meta fields as post-compaction
  resume authority.

    - Update `session-recover.md` (canonical + package mirror) to distrust `Next Task`, `Next Action`,
      `Last Completed`, `Current Workflow`, and `Blockers` for recovery authority.
    - Remove the normal fallback from partial-strategic reads to meta `Next Task`; use deterministic cursor data
      or stop/surface uncertainty.
    - State the stop discipline: surface only true uncertainty or contradiction, not every case where the harness
      summary is the source of the current leaf.

- _Outcome:_ Updated both `session-recover.md` copies to name the harness summary as the volatile current-leaf
  source, demote meta progress fields to soft orientation after compaction, remove the meta `Next Task` fallback
  for strategic reads, and scope the authority-framing line to ARC operating context.

### `[x]` **4.R.2 Implement the shared task-list cursor projection**

- _Goal:_ A reusable parser derives the execution task section and first incomplete executable checkbox from the
  resolved task list, without depending on meta `Next Task`.

    - Parse current task-list grammar: parent H3 markers, subtask markers, terminal `[x]` / `[~]`, and revision
      identifiers such as `4.R.1`.
    - Return a parent-section cursor for strategic partial reads plus a leaf cursor for the first incomplete
      executable checkbox; standalone parent tasks use the same item for both.
    - Unit-test ordinary parent/subtask, standalone parent, revision IDs, completed/deferred skips, and malformed
      / no-open-task cases.

- _Outcome:_ Added `src/lib/task-list/cursor.ts` with a no-throw cursor result union and markdown parser for ARC
  parent/subtask markers, plus unit coverage for nested subtasks, standalone tasks, revision identifiers,
  completed/deferred skips, plain subtask titles, malformed markers, and no-open-task results.

### `[x]` **4.R.3 Expose the cursor in status envelopes and seed emission**

- _Goal:_ `session-init`, recover-mode status, and the compaction seed all consume one cursor projection.

    - Add an optional `taskCursor` slice when `taskListPath` resolves.
    - Use it in `session-init` as a strategic-read line-anchor helper when the meta triple-anchor is absent or
      incomplete; do not turn it into thought-state.
    - Change seed emission to store the task-list-derived cursor instead of parsing meta `Next Task`.

- _Outcome:_ Added optional `taskCursor` probe slots to session-init and recover envelopes, wired handlers through
  the shared task-list cursor parser, and changed compaction seed v1 to store `taskCursor` instead of parsing
  stale meta `Next Task`. Updated schema/emitter/status tests and E2E fixtures to assert cursor projection.

### `[x]` **4.R.4 Add deterministic `arc recover audit --json`**

- _Goal:_ Recovery mismatch checks move out of workflow judgment and into one command that emits a structured
  `ready` / `stop` verdict.

    - Read and validate the identity-scoped compaction seed.
    - Re-run the lean recover probe, audit fresh `loadSet` against the seed, compare dirty file **path sets**, and
      compare fresh task cursor to the seed cursor.
    - Categorize stop reasons for missing identity/seed, malformed seed, load-set drift, dirty-path drift,
      task-cursor mismatch, and workflow-pointer uncertainty.
    - Unit-test clean and mismatched verdicts; add a CLI smoke for JSON output.

- _Outcome:_ Added `arc recover audit --json` with a typed `recover-audit` report and pure `auditRecoveryState`
  verdict helper. The command reads the identity-scoped seed, reruns the lean recover probe, compares load-set,
  dirty path set, and task cursor state, and emits structured ready/stop reasons. Added unit verdict coverage and
  an E2E ready-path smoke through the built CLI.

### `[x]` **4.R.5 Rewrite recovery workflow consumption**

- _Goal:_ `session-recover` consumes `arc recover audit --json`, reads the fresh load-set, and resumes from the
  harness-summary locus with ARC context restored.

    - Replace manual load-set/dirty/task-pointer audit steps with the CLI verdict.
    - Use fresh cursor data for `partial-strategic` reads; stop when a required cursor is absent.
    - Keep the authority-framing line scoped to ARC context, not the harness summary's volatile leaf.

- _Outcome:_ Rewrote both `session-recover.md` copies to begin with `arc recover audit --json`, consume the fresh
  load-set and verified task cursor from the report, and treat planning `Current Workflow` as soft unless the
  harness summary supplies a verifiable stage anchor.

### `[x]` **4.R.6 Forward-compat coordination for cursor/audit ownership**

- _Goal:_ Downstream WUs know what they inherit: the cursor parser's grammar owner, the audit envelope's schema
  owner, and the planning-stage cursor boundary.

    - Route/update notes for `task-list-conventions`, `schema-introspection-layer`,
      `planning-iteration-mechanics`, `operational-state-docs`, and `cli-substrate-adoption`.
    - Preserve the existing `composable-workflows`, `unit-scoped-review`, and `agent-platform-support`
      coordination notes.

- _Outcome:_ Updated the downstream buffers for task-list marker grammar ownership, CSA/schema migration targets,
  OSD read-only projection boundaries, and planning-stage recovery uncertainty. Existing coordination notes remain
  intact.

## **Phase 5:** Per-harness hook adapters

_Purpose:_ Wire the canonical seed/recover commands into per-harness hooks — Leg A (pre-compaction seed write,
read-only, exit 0, never block) and Leg B (post-compaction recovery inject) — with the `compact`-vs-`clear` fork
read directly from harness signals, never inferred.

_Design decisions:_ CC ≈ Codex — one adapter pattern, two config formats (the P8 canonical/adapter split: the
adapter layer is config, not logic). OpenCode is deferred to the portable `arc-recover` fallback. Hook install
is explicit opt-in at verify-and-configure (hooks run local commands and require harness trust) — never
auto-installed. See `notes-compaction-recovery.md` § Harness adapter implementation reference for the per-harness
wiring detail.

### `[ ]` **5.1 Claude Code hook adapter**

- _Goal:_ Claude Code writes the seed before compaction and injects recovery after, distinguishing `compact`
  from `clear` from the harness `source`.

    - `[ ]` **5.1.a Leg A — `PreCompact` seed-write recipe**
        - Runs the seed-write command; read-only; exits 0; never blocks compaction (blocking surfaces the
          context-limit error and fails the request).

    - `[ ]` **5.1.b Leg B — `SessionStart(source=compact)` recovery inject**
        - Injects the recovery instruction to stdout / `additionalContext`; `source: clear` routes to full
          `session-init` instead. Wired in `settings.json` hooks.

### `[ ]` **5.2 Codex CLI hook adapter**

- _Goal:_ Codex fires the same canonical seed/recover commands, differing from Claude Code only in wiring —
  validating the config-not-logic adapter split.

    - Hooks enabled via `config.toml` `[features] hooks = true` + a `hooks.json`.
    - Leg A mirrors Claude Code's `PreCompact` seed-write.
    - Leg B uses `SessionStart(source=compact)` + `additionalContext` (not `PostCompact`); the `compact`-vs-`clear`
      fork reads from `source` + `trigger`.

### `[ ]` **5.3 Opt-in install integration**

- _Goal:_ Hook installation is offered (never forced) during verify-and-configure, gated on explicit user opt-in
  and harness trust.
- _Note:_ Reuse `01_verify-and-configure.md`'s existing trust-acknowledgment flow, but this is a **net-new** kind
  of harness-config write — distinct from its git-hook setup (`core.hooksPath` / husky) and its release-wrapper
  allowlist. No code writes harness `settings.json` / `config.toml` today, so the install is greenfield.

    - `[ ]` **5.3.a Surface the install offer**
        - Per-harness recipe selection at verify-and-configure; never auto-install; honor the trust-model
          acknowledgment the workflow already performs.

    - `[ ]` **5.3.b Wire the chosen recipe on accept**
        - Write the event-hook recipe into the harness config (CC `settings.json`; Codex `config.toml` +
          `hooks.json`) — new manipulation code; idempotent across re-runs (no duplicate hook entries).

## **Phase 6:** Constitutional change and doc cascade

_Purpose:_ Record the stance change across the adopter-facing surfaces — compaction is a recoverable
discontinuity ARC owns recovery for, bounded sessions survive as a scope/review discipline — applying the
boundary-vs-pressure disambiguation uniformly and adopter-clean.

_Design decisions:_ `adr-002` is an append-only amend (Tier-2; no new ADR). Two precision guards hold throughout
the prose: "clean baseline" means a clean _episodic_ baseline (not a lighter load), and the reset comes from the
fresh load after `clear` (not the handoff write itself). Every shipped surface is two-copy package-synced; the
`adr/` amendment is internal-only (no mirror).

### `[ ]` **6.1 Amend `adr-002`**

- _Goal:_ `adr-002` records the evolved stance — compaction is a recoverable discontinuity ARC owns, not a black
  box to disable — without reversing its session-model / agent-compatibility envelope.

    - Append-only amendment (Tier-2, no new ADR), recording: recoverable-discontinuity framing;
      bounded-sessions-as-scope/review-discipline; the long-session-viability consequence; the
      disableability-gone fact (the old "disable where possible" guidance assumed a capability the harnesses no
      longer offer); and the episodic-vs-procedural / mode-relative-residue rationale (the durable _why_ handoff
      survives at boundaries).
    - Internal-dev-facing only — `adr/` does not ship; no package mirror, no adopter-clean constraint.

### `[ ]` **6.2 Rewrite `strategy-session-operations` § Auto-Compaction and revise § Context Monitoring**

- _Goal:_ The strategy presents compaction as a recoverable event with deterministic recovery, and reframes the
  threshold response as boundary-vs-pressure rather than forced handoff.

    - `[ ]` **6.2.a § Auto-Compaction**
        - From "disable auto-compaction" to "compaction is a recoverable event; `clear` re-bootstraps via
          `session-init`, `compact` recovers; install the hook recipe to make recovery deterministic." Include
          the clear-vs-compact user guidance.

    - `[ ]` **6.2.b § Context Monitoring**
        - Threshold response shifts from "user triggers handoff" to the boundary-vs-pressure fork (hand off at a
          natural boundary, else compact and recover); thresholds survive as monitoring guidance, not
          forced-handoff triggers.

### `[ ]` **6.3 Revise `DEV-RULES.ARC` § Context quality and touch `AGENT-BRIEF.ARC` lifecycle line**

- _Goal:_ The constitutional rules keep the natural-boundaries list and handoff recommendation but reframe its
  rationale as judgment and add the pressure carve-out; the lifecycle line names recovery as a third event.

    - `[ ]` **6.3.a `DEV-RULES.ARC` § Context quality / Session Management**
        - Keep the natural-boundaries list + handoff recommendation; reframe its rationale as _judgment_; add the
          pressure carve-out (pressure between boundaries no longer forces an early handoff — compact and
          recover). Apply the two precision guards.

    - `[ ]` **6.3.b `AGENT-BRIEF.ARC` § session lifecycle**
        - Name recovery as the third lifecycle event alongside init and handoff (compaction → recover), so the
          lifecycle line is not handoff-only.

### `[ ]` **6.4 Forward-compat closeout**

- _Goal:_ The forward-compat seams are confirmed intact — the reciprocal notes are present in their sibling
  inbound buffers, and the projection's membership derives from shared policy.

    - Confirm the five reciprocal notes (CW / OSD / CSA / `unit-scoped-review`, already routed; plus the
      `agent-platform-support` `arc-recover`-gating note) are present in their sibling buffers.
    - Verify the load-set projection resolves membership from shared declared-load policy (no recover-specific
      list) and the seed's embedded manifest is produced by that same projection.

## **Phase 7:** Verification

### `[ ]` **7.1 Complete verification** — load and follow `verify-work-unit.md`

- _Note:_ Verification includes the manual per-harness end-to-end recovery protocol — see
  `notes-compaction-recovery.md` § Manual end-to-end recovery protocol (Claude Code + Codex; OpenCode deferred).

---

## Success Criteria

- `[x]` The seed emits to the fixed machine-local path and parses back losslessly (unit-tested round-trip)
- `[x]` The shared load-set projection resolves the correct ordered load-set + read-modes per `sessionType`
  (planning / execution / integration), identical whether consumed by `session-init` Step 3 or `session-recover`
  (unit-tested)
- `[x]` A shared task-list cursor projection derives the execution task section + first incomplete executable
  checkbox, feeds `session-init` strategic-read anchoring, and seeds/audits recovery without claiming thought-state
- `[x]` `arc recover audit --json` re-resolves the load-set and task cursor, compares dirty file path sets against
  the seed, and emits structured `ready` / `stop` verdicts (unit-tested across match and mismatch)
- `[x]` `session-recover` treats `Next Task`, `Next Action`, `Last Completed`, `Current Workflow`, and `Blockers`
  as post-compaction soft orientation only; it resumes from the harness-summary locus unless true uncertainty or
  contradiction requires a stop
- `[x]` Lean probe mode emits exactly the kept slices and omits the skipped oracles (verified)
- `[ ]` On Claude Code and Codex, forcing a compaction injects recovery and the agent resumes the in-flight task
  with the procedural floor restored; `clear` routes to full `session-init` instead (manual per-harness e2e)
- `[ ]` `adr-002` carries the append-only amendment (incl. the episodic-vs-procedural rationale); the
  boundary-vs-pressure disambiguation is applied adopter-clean across `strategy-session-operations`
  (§ Auto-Compaction + § Context Monitoring), `DEV-RULES.ARC` § Context quality, and `AGENT-BRIEF.ARC`; no live
  adopter-facing surface still presents session-bounding as the context-preservation correctness mechanism
- `[x]` The five reciprocal forward-compat notes are present in their sibling buffers; the load-set projection
  resolves membership from shared policy (no recover-specific list); the seed's embedded manifest is produced by
  the same projection
- `[ ]` The pre-compaction seed write exits 0 and never blocks compaction
- `[ ]` All quality gates pass (tests, linting, type checking)
- `[ ]` Ready for integration

---
