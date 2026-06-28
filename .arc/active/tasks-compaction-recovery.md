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

    - `[ ]` **1.3.a Wire the projection as an eager `Probe<LoadSetManifest>` slice**
        - Add to the `runSessionInitStatus()` fan-out (cheap, deterministic — depends only on already-resolved
          state); extend `SessionInitProbeResult` with the new slot.

    - `[ ]` **1.3.b Smoke-test the slice on both envelope modes**
        - Assert the `loadSet` slice is present and well-formed on both the `session-init` and `--recover`
          envelopes (wiring parity). Per-`sessionType` membership correctness is 1.2's behavior coverage.

## **Phase 2:** Compaction seed

_Purpose:_ Emit the lean deterministic seed — state pointers + the embedded load-set manifest + a deterministic
uncommitted-file list — to a fixed machine-local path, gitignored and excluded from the git-notes user-sync
projection.

_Design decisions:_ Hand-typed / hand-validated schema (a deliberate `cli-substrate-adoption` migration target,
per the `audit-log.ts:validateEntry()` precedent). `.internal/` placement leans on the user-sync classifier's
never-synced boundary — no new exclusion list. The canonical seed stays invocation-neutral (no `arc` / `npx arc`
field — a dev-only field would be both an audience leak and a mis-set hazard). The embedded `loadSet` is the
recovery-audit baseline, not a re-load shortcut.

### `[ ]` **2.1 Define the `CompactionSeed` schema**

- _Goal:_ A versioned, invocation-neutral seed shape captures everything recovery needs to re-hydrate and audit —
  environment, WU state pointers, the embedded load-set baseline, and the uncommitted-file list.
- _Note:_ The schema + emit/read helpers live in a `src/lib/compaction-seed/` module importing the
  `src/lib/load-set/` types (1.1), so the embedded `LoadSetManifest` is the same type, not a copy.

    - `schemaVersion` (forward-compatible parsing) + `emittedAt` (ISO-8601, audit/debug only, never
      load-bearing).
    - Environment: `repoRoot`, `branch`, `head`, `dirty`.
    - WU state pointers: `activeWorkUnit`, `metaPath`, `sessionType`, `currentWorkflow`, `currentTask`
      (`{ id; title; lineHint }`, null in planning).
    - Recovery baseline: `loadSet` (the embedded `LoadSetManifest` from 1.1) + `uncommittedFiles`.

### `[ ]` **2.2 Implement the seed `--write` emitter**

- _Goal:_ A status-family command writes the current seed on demand, deriving every field deterministically from
  probe state + git, and exits 0.
- _Note:_ Host lean: a `--write`-style option on the `status` command composed with `--session-init` — reuse the
  session-init envelope's resolved state + the `loadSet` slice, add `uncommittedFiles`, serialize to
  `CompactionSeed`, write to the fixed path. Not a new subcommand, and distinct from Phase 3's `--recover` (the
  pre-compaction write vs. the post-compaction re-probe). Exact flag spelling + `--json` composition settle at impl
  (spec § Open Questions). State pointers populate via the existing `meta-reader.ts` / `managed-field.ts`
  extractors (sourced from the markdown records at write time) — no bespoke seed parser, so
  `operational-state-docs` later supersedes one reader, not two.

    - Build `test-first` (one behavior at a time):

        - the emitter projects `loadSet` via the shared projection (1.2), not a bespoke list
        - `uncommittedFiles` derives from `git status --porcelain` with deterministic ordering
        - `currentTask` is null in planning, populated (`id` / `title` / `lineHint`) in execution
        - `head` / `branch` / `dirty` reflect live git state at emit
        - the seed round-trips losslessly (write → read → deep-equal)
        - the write exits 0 unconditionally
        - identity-absent → no seed written (graceful no-op; the seed path is identity-scoped)

### `[ ]` **2.3 Persist to the fixed machine-local path**

- _Goal:_ The seed lands at `.arc/user/{identity}/.internal/compaction-seed.json`, where the gitignore and the
  user-sync classifier guarantee it stays machine- and worktree-local.

    - `[ ]` **2.3.a Write to the identity-resolved `.internal/` path**
        - Create the directory if absent; machine-local, per-worktree by the gitignore boundary (the user tree
          is never checked out into linked worktrees).

    - `[ ]` **2.3.b Confirm sync exclusion with a regression test**
        - Assert the seed path classifies `never-synced` (the `.arc/user/*/` gitignore covers it; the classifier
          marks `.internal/**` never-synced — no manifest entry, no notes projection).

## **Phase 3:** Lean probe mode and recovery audit

_Purpose:_ Provide the two recover-supporting CLI internals — the lean `--recover` probe (kept slices only,
dispatch-only oracles skipped) and the recovery-audit diff (a fresh load-set re-resolved and diffed against the
seed's embedded manifest).

_Design decisions:_ Lean mode reuses the existing envelope orchestrator via conditional spreads — no second
loader. Audit divergence granularity (membership vs. read-mode vs. path drift, and what is stop-worthy vs.
silently tolerated) is tuned against real recovery runs (spec § Open Questions).

### `[ ]` **3.1 Implement the lean `arc status --recover --json` probe mode**

- _Goal:_ A `--recover` flag emits only the slices recovery needs and skips the dispatch-only oracles, producing
  a cheap deterministic re-probe that picks up mid-session HEAD / dirty / branch movement.

    - Kept (state + load-set resolution): `identity`, `worktree`, `dirty`, `active`, `config`, `releaseRouting`,
      `extensions`, the `loadSet` slice, and `cohortDocPath` when present. `domainRules` stays load-on-demand.
    - Skipped (dispatch / sync): `user`, `roster`, `sweep`, `planOrphanSweep`, `retiredSubdirs`, `errandSweep`,
      `errandState`, `workUnitState`, `materializableWorkUnits`, `inFlightComposition`, `inboxState`,
      `partialPushMarker`, `recommendedCombinedPrompt`, `recovery`, and the `baseDistance` / `baseBranchSync`
      sync-advisory channels.

    - Build `test-first` (one behavior at a time):

        - `--recover` emits exactly the kept slices
        - `--recover` omits every skipped oracle (assert each absent)
        - `--recover` resolves the `loadSet` slice via the shared projection
        - flag wiring is correct (`--recover` routes to the lean envelope; conflicts declared as needed)

### `[ ]` **3.2 Implement the recovery-audit diff**

- _Goal:_ `session-recover` can re-resolve a fresh load-set, diff it against the seed's embedded manifest, and
  return a structured divergence verdict signalling that state moved mid-session.
- _Note:_ Divergence granularity — membership vs. read-mode vs. path drift, stop-worthy vs. tolerated — is the
  tuned dimension; the diff exposes each category so the workflow's stop policy can select. Relatedly, whether
  `session-recover` warns on seed-age staleness (`emittedAt` vs. HEAD movement) or relies on the audit diff alone
  is settled here (both are spec § Open Questions, resolved against real runs).

    - Build `test-first` (one behavior at a time):

        - an identical load-set yields no divergence (clean match)
        - a membership change (a doc added or dropped) is flagged
        - a read-mode change on a retained member is flagged
        - a path drift on a retained member is flagged
        - the verdict is a structured diff the workflow can render at its stop

## **Phase 4:** session-recover workflow and arc-recover skill

_Purpose:_ Author the agent-facing recovery surfaces — the lean `session-recover` workflow (re-hydrate, not
re-orient) and the thin `arc-recover` manual-fallback skill.

_Design decisions:_ Recovery ≈ context-load + a cheap probe re-run, bypassing the `session-init` monolith; the
authority-framing prefix dissolves any ambiguous-authority overlap with the harness summary; recovery restores
only the init-time load-set + lifecycle workflow, never on-demand mid-task loads. The skill installs
unconditionally for MVP (per-harness / opt-in gating deferred to `agent-platform-support`).

### `[ ]` **4.1 Author the `session-recover` workflow**

- _Goal:_ A lean recovery workflow re-hydrates exactly the lost procedural layer and resumes the in-flight task,
  never re-running settled `session-init` judgment (entry mode, sync, discovery, orientation).
- _Note:_ Frontmatter mirrors `session-init` — `arc.methods: [session-state]`, `arc.extensions:
  [post-context-load]` (the decomposition re-runs post-context-load); tag the extension fire-point with the
  validated `· #name` marker (point-scanner-checked).

    - Five ordered steps: (1) re-run the probe in lean recover mode; (2) re-resolve the load-set and run the
      recovery audit against the seed's embedded manifest; (3) re-hydrate the state-selected load-set + the
      `sessionType` lifecycle workflow at the most-recent context position; (4) prefix an authority-framing
      line ("the ARC context below is authoritative; disregard any earlier paraphrase"); (5) resume the task.
    - Stop for direction only on a recovery-audit mismatch, missing identity, dirty-state surprise, or a lost
      task pointer — never a routine user prompt.
    - State the on-demand-loads boundary: recovery restores the init-time load-set + lifecycle workflow, not
      mid-task loads (those re-load via their existing triggers).
    - Ship it: author the canonical `session-recover.md`, mirror to the package source
      (`packages/arc-framework/arc/system/workflows/arc/session-lifecycle/`) as a plain `.md` (no project
      placeholders → no `.template.md`), and register the path in `init-recipe.json` (explicit enumeration).

### `[ ]` **4.2 Author the `arc-recover` skill**

- _Goal:_ A portable, user-invocable skill wraps `session-recover` for harnesses without usable hooks (OpenCode)
  or for manual recovery when the user notices compaction.

    - `[ ]` **4.2.a Author `SKILL.md`**
        - Thin wrapper invoking `session-recover`; canonical `.arc/system/.internal/skills/arc-recover/` +
          package mirror.

    - `[ ]` **4.2.b Register in `init-recipe.json`**
        - Install unconditionally for MVP; gating (per-harness / opt-in) is deferred to `agent-platform-support`
          via the routed reciprocal note.

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

- `[ ]` The seed emits to the fixed machine-local path and parses back losslessly (unit-tested round-trip)
- `[ ]` The shared load-set projection resolves the correct ordered load-set + read-modes per `sessionType`
  (planning / execution / integration), identical whether consumed by `session-init` Step 3 or `session-recover`
  (unit-tested)
- `[ ]` `session-recover` re-resolves the load-set, diffs against the seed's embedded manifest, and stops for
  direction on divergence (unit-tested across match and mismatch)
- `[ ]` Lean probe mode emits exactly the kept slices and omits the skipped oracles (verified)
- `[ ]` On Claude Code and Codex, forcing a compaction injects recovery and the agent resumes the in-flight task
  with the procedural floor restored; `clear` routes to full `session-init` instead (manual per-harness e2e)
- `[ ]` `adr-002` carries the append-only amendment (incl. the episodic-vs-procedural rationale); the
  boundary-vs-pressure disambiguation is applied adopter-clean across `strategy-session-operations`
  (§ Auto-Compaction + § Context Monitoring), `DEV-RULES.ARC` § Context quality, and `AGENT-BRIEF.ARC`; no live
  adopter-facing surface still presents session-bounding as the context-preservation correctness mechanism
- `[ ]` The five reciprocal forward-compat notes are present in their sibling buffers; the load-set projection
  resolves membership from shared policy (no recover-specific list); the seed's embedded manifest is produced by
  the same projection
- `[ ]` The pre-compaction seed write exits 0 and never blocks compaction
- `[ ]` All quality gates pass (tests, linting, type checking)
- `[ ]` Ready for integration

---
