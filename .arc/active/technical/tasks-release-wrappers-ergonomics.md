# Task List: Release Wrappers — Adopter Ergonomics

- **PRD:** `prd-release-wrappers-ergonomics.md`
- **Branch(es):** `technical/release-wrappers-ergonomics`
- **Base Branch:** `main`

- **Purpose:** Adopter onboarding for interlock release wrappers — mode-aware setup workflow,
  CLI orchestration, status integration, structured ADR-018-aware routing, documentation
  surfaces.

---

## **Phase 1:** Foundation — routing primitive, marker storage, description sweep

_Purpose:_ Three primitives the rest of WU2 depends on. The routing primitive (R12.1) lands the
`releaseRouting` slot that workflows and skills consult instead of re-deriving the authorization
rule. The marker storage library (R9) backs all setup CLI commands. The `cli.ts` description sweep
(R15) clears WU1 tech-debt before broader CLI surface changes touch the same file.

_Design decisions:_ Routing primitive lives at
`packages/arc-framework/src/lib/release/routing.ts`; marker storage at
`packages/arc-framework/src/lib/release/setup-marker.ts` (sibling of `audit-log.ts`, same
`.internal/` directory convention). All three subtasks are independent of each other — could
parallelize but listed in dependency-priority order.

### `[ ]` **1.1 Routing primitive (R12.1)**

- _Goal:_ Session-init and session-handoff envelopes carry a fully-resolved `releaseRouting` slot
  that workflows and skills consult without re-deriving the authorization rule.

- _Approach:_ Pure resolver function over resolved interlock values + `releaseEnabled`; mirrors
  `resolveAllSettings` shape. Slot lands at envelope root alongside existing slots.

    - `[ ]` **1.1.a Routing slot schema types**
        - Define `ReleaseRoutingSlot`, `ReleaseRoutingValue`, `ReleaseRoutingRationale` types
          per PRD R12.1.
        - Three classes: `taskCommit`, `workflowCommit`, `workflowPush` ∈ `"wrapper" | "raw"`.
        - `rationale` field carries `releaseEnabled`, `commitInterlock`, `pushInterlock` snapshots.

    - `[ ]` **1.1.b Resolver implementation (`resolveReleaseRouting`)**

        Build `test-first` (one behavior at a time):

        - `releaseEnabled: false` → all classes resolve `raw` regardless of interlock values
        - `releaseEnabled: true` + `commit_interlock: manual` → `taskCommit: raw`,
          `workflowCommit: raw`
        - `releaseEnabled: true` + `commit_interlock: on-task-approval` → `taskCommit: wrapper`,
          `workflowCommit: raw`
        - `releaseEnabled: true` + `commit_interlock: on-workflow` → `taskCommit: wrapper`,
          `workflowCommit: wrapper`
        - `releaseEnabled: true` + `push_interlock: manual` → `workflowPush: raw`
        - `releaseEnabled: true` + `push_interlock: on-handoff` → `workflowPush: raw`
        - `releaseEnabled: true` + `push_interlock: on-workflow` → `workflowPush: wrapper`
        - `rationale` carries inputs verbatim across all combinations
        - Unknown interlock value (forward-compat) → safe-default `raw` for that class

    - `[ ]` **1.1.c Wire into session-init envelope**
        - Resolver runs after `resolveAllSettings`; slot lands at envelope root alongside
          `extensions`, `config`, `active`, etc.
        - Probe-failure fallback: slot omitted on probe failure (consumers handle missing-slot via
          raw-default per canonical rule R12.2).
        - Integration test: full session-init envelope contains expected `releaseRouting` shape
          across at least two config combinations (default-config + full-opt-in).

    - `[ ]` **1.1.d Wire into session-handoff envelope**
        - Same resolution + slot placement as 1.1.c, in the handoff probe shape.
        - Integration test mirrors 1.1.c shape.

### `[ ]` **1.2 Marker storage library (R9)**

- _Goal:_ Per-developer per-machine marker file at `.arc/user/{identity}/.internal/release-setup.json`
  with library API for read / upsert / remove of harness entries; schema-versioned for
  forward-compatibility.

- _Approach:_ Mirror `audit-log.ts` conventions — same `.internal/` directory, same identity-context
  shape, same parent-directory creation pattern.

    - `[ ]` **1.2.a Schema types**
        - `MarkerSchemaV1` envelope; `HarnessEntry` per PRD R9 (`name`, `mode`, `installedAt`).
        - Type guards for runtime validation at read boundaries.

    - `[ ]` **1.2.b Path resolution helpers**
        - `resolveMarkerPath(ctx)`, `ensureMarkerParent(ctx)` mirroring `audit-log.ts` shape.

    - `[ ]` **1.2.c Library API — read / upsert / remove**

        Build `test-first` (one behavior at a time):

        - `readMarker` on missing file → empty default `{schemaVersion: 1, harnesses: []}`
        - `readMarker` on valid file → parsed marker
        - `readMarker` on malformed JSON → typed error, not crash
        - `readMarker` on schema-version mismatch → typed error with version surfaced
        - `upsertHarness` appends new entry (no name collision)
        - `upsertHarness` replaces existing entry (name match, all fields updated)
        - `removeHarness` removes by name; preserves siblings
        - `removeHarness` on already-absent name → no-op success
        - Empty `harnesses` array post-remove preserves `{schemaVersion: 1, harnesses: []}`
          (per PRD R5)
        - `schemaVersion` preserved on every write
        - Missing parent directory created on first write
        - Concurrent-write safety: writes are atomic at the fs level (write-then-rename pattern
          per audit-log precedent)

### `[ ]` **1.3 `cli.ts` description-string accuracy sweep (R15)**

- _Goal:_ Release-subcommand description strings in `cli.ts:226+` reference the actual storage
  shape WU1 shipped — `arc.releaseEnabled` (per-developer git-config key) or `release.enabled`
  (yaml key) per context.

- _Note:_ Doc-comment and Commander `.description()` text only; no code-flow change.

---

## **Phase 2:** Setup CLI commands — `arc release setup` subcommand tree

_Purpose:_ Build the `arc release setup` sub-subcommand tree. Orchestration porcelain that records
state and emits the contract; harness file writes are agent-mediated inside the workflow doc
(Phase 4), not in these commands.

_Design decisions:_ Order runs simplest → most complex within the phase — `print-patterns` and
`verify` are stateless or read-only and pin the patterns the others reference; `install` carries
the bulk (idempotency four-way choice, multi-harness partial-success); `uninstall` mirrors
`install` minus the install logic. R16 (`--json` for install/uninstall) and R17 (`--format=raw`
for print-patterns) fold into their parent commands rather than standing as separate parents.
Sub-subcommands wire as `releaseCmd.command("setup").command("...")`. Handlers live at
`packages/arc-framework/src/handlers/release/setup/`.

**Strategies:** strategy-testing-methodology.md

### `[ ]` **2.1 `arc release setup print-patterns` command (R6, R17)**

- _Goal:_ Paste-ready canonical patterns emitted per harness in native format; abstract
  six-element contract emitted for unknown harnesses; `--format=raw` strips wrapping for tooling
  consumers.

- _Approach:_ Stateless emitter; pure functions over harness-name and format. Reference patterns
  match `notes-release-wrappers-ergonomics.md` § Reference-Implementation Pattern Specifics
  verbatim — that section is the spec.

    - `[ ]` **2.1.a Sub-subcommand wiring + flag handling**
        - `releaseCmd.command("setup")` parent registration.
        - `print-patterns` with `--harness <name>` and `--format <format>` (default
          harness-formatted; `raw` strips wrapping).

    - `[ ]` **2.1.b Per-harness formatters**

        Build `test-first` (one behavior at a time):

        - `--harness claude-code` → JSON snippet for `permissions.allow` array (matches notes spec
          exactly)
        - `--harness codex` → Starlark `prefix_rule()` calls (matches notes spec exactly)
        - No `--harness` → abstract six-element contract (the agent-adaptive translation prompt)
        - Unknown `--harness foo` → falls through to abstract contract with warning to stderr
          surfacing the unknown name
        - `--format=raw` strips harness-specific wrapping; emits only canonical bash-pattern strings

### `[ ]` **2.2 `arc release setup verify` command (R7)**

- _Goal:_ Read-only post-install verification helper. Confirms `arc.releaseEnabled` is recorded;
  under default-prompt mode runs the behavioral test; under bypass mode reports based on opt-in
  state alone. Does NOT gate opt-in (the workflow's verify step holds the safety property per PRD R7).

- _Approach:_ Reads marker (R9) for harness mode; reads git-config for `arc.releaseEnabled`;
  conditionally invokes the behavioral test via subprocess.

    - `[ ]` **2.2.a Sub-subcommand wiring + state reads**
        - `verify` with optional `--harness <name>` flag.
        - Read marker via 1.2 library; read `arc.releaseEnabled` via existing config resolver.

    - `[ ]` **2.2.b Verify behavior**

        Build `test-first` (one behavior at a time):

        - Opt-in absent → reports "not engaged" non-error
        - Opt-in present + harness in default-prompt mode → invokes behavioral test
          (`arc release commit --version` subprocess), reports prompt observed vs. absent
        - Opt-in present + harness in bypass mode → skips behavioral test; reports based on
          opt-in state (per PRD R7)
        - `--harness` flag overrides marker-recorded mode for the test run
        - All-harnesses run (no `--harness`) → iterates marker entries, reports per-harness

### `[ ]` **2.3 `arc release setup install` command (R4, R16)**

- _Goal:_ Orchestration porcelain driving the supplemental setup workflow (R1). Captures
  trust-model acknowledgment, writes harness/mode marker on workflow's verify-pass, records
  `arc.releaseEnabled = true` on user-confirm, handles idempotency four-way and multi-harness
  partial-success per PRD R4.

- _Approach:_ The CLI is the state-management shell; the workflow doc (R1) is the user-facing
  ceremony. Install delegates the harness write to the agent (workflow-mediated); install owns the
  state transitions (marker + git-config flag) at workflow's verify-pass and user-confirm
  signals.

- _Note:_ "Drives the workflow" means surfaces the contract elements the agent reads, accepts
  agent-reported install success, prompts user trust-model acknowledgment, then transitions state.
  Not a literal subprocess invocation of the workflow doc — workflow execution is agent-mediated.

    - `[ ]` **2.3.a State-read shell + idempotency four-way branch**

        Build `test-first` (one behavior at a time):

        - Fresh state (no opt-in, empty marker) → proceeds to single-harness install flow
        - Existing opt-in + non-empty marker → surfaces idempotency prompt with current state
        - Idempotency choice `re-verify` → reruns behavioral tests against current entries;
          refreshes `installedAt` on success
        - Idempotency choice `update markers` → re-detects modes for installed harnesses
        - Idempotency choice `add harness` → install flow only for harnesses not in marker
        - Idempotency choice `exit` → no-op acknowledged

    - `[ ]` **2.3.b Single-harness install flow + trust-model acknowledgment**

        Build `test-first` (one behavior at a time):

        - Mode-detection per PRD R3 three-tier ladder (delegated to workflow doc; CLI surfaces
          tier transitions)
        - Default-prompt mode → trust-shift acknowledgment prompt (text variant from
          `notes-release-wrappers-ergonomics.md` § Trust-Model Acknowledgment Text Variants)
        - Bypass mode → audit-only acknowledgment prompt (same notes section)
        - User accepts → proceeds to harness write (workflow-driven) → behavioral test (when
          default-prompt) → marker upsert → opt-in record
        - User declines → aborts with no state change

    - `[ ]` **2.3.c Multi-harness orchestration + partial-success**

        Build `test-first` (one behavior at a time):

        - Multi-harness install enumerates known reference-implementation harnesses present
        - All-success path → marker entries written for each; opt-in recorded once
        - Partial-failure path → user-choice prompt (record verified only / retry failed / abort)
        - Partial accept → marker entries for verified harnesses only; opt-in recorded
        - Partial retry → re-runs failed harness in isolation; combines outcome
        - Abort → no state change despite partial verifies

    - `[ ]` **2.3.d `--json` mode (R16)**
        - `schemaVersion: 1` envelope; per-harness install results, opt-in state post-op,
          exit code.
        - Behavioral tests' verbose output redirected to stderr; stdout stays JSON-clean.

### `[ ]` **2.4 `arc release setup uninstall` command (R5, R16)**

- _Goal:_ Symmetric removal — agent removes harness-side entries (matched by canonical pattern
  set; conservative on user-curated drift); marker entry removed; opt-out flag recorded via
  WU1's `arc release opt-out` primitive. Idempotent.

- _Approach:_ Mirror install's shell shape; replace install logic with cleanup logic.

    - `[ ]` **2.4.a State-read shell + idempotency**
        - Read marker + opt-in state.
        - No-op success on already-uninstalled state (no marker entries, opt-in already false).

    - `[ ]` **2.4.b Cleanup orchestration**

        Build `test-first` (one behavior at a time):

        - Single-harness uninstall: agent removes canonical patterns from harness file;
          marker entry removed; opt-out recorded
        - Multi-harness uninstall: iterates marker; failures surface user-choice (continue
          partial / retry / abort)
        - Conservative cleanup: agent refuses to touch user-curated entries that drift from
          canonical pattern set (workflow-driven; CLI surfaces the refusal verbatim)
        - Empty `harnesses` array post-uninstall → marker preserved as
          `{schemaVersion: 1, harnesses: []}` per PRD R5

    - `[ ]` **2.4.c `--json` mode (R16)**
        - Same envelope shape as 2.3.d, mirrored for uninstall result fields.

---

## **Phase 3:** Posture surfacing — `arc release status` extension + session-init orientation

_Purpose:_ Make installed setup observable end-to-end. Extends `arc release status` to surface
harnesses, active value layers, AND resolved routing per class (R10). Adds session-init
orientation surface for engaged-state notice (R11).

_Design decisions:_ Sequenced before the setup workflow (Phase 4) so the workflow's verify step
has a complete `arc release status` to reference. Status envelope bumps `schemaVersion 1 → 2`
(additive). Routing slot already computed by Phase 1's primitive (R12.1) — Phase 3 just renders
it. Session-init orientation reads the routing slot + marker to surface mode-aware text per PRD R11.

### `[ ]` **3.1 `arc release status` extension (R10)**

- _Goal:_ Single-source posture surface — opt-in flag, interlock states, harnesses + modes,
  active value layers, resolved routing per class. JSON envelope at `schemaVersion: 2`;
  human-readable mode renders new fields after existing interlock block.

- _Approach:_ Extend existing `runReleaseStatus` in `record.ts`; reuse marker library (1.2) and
  routing primitive (1.1) — no new computation, projection only.

    - `[ ]` **3.1.a Envelope schema bump + harnesses projection**

        Build `test-first` (one behavior at a time):

        - JSON envelope `schemaVersion: 2` (additive bump per PRD R10)
        - Empty marker + opt-in false → `harnesses: []`, `activeValueLayers: "none"`
        - Default-prompt entry + opt-in true → `harnesses[0].mode === "default-prompt"`,
          annotation absent
        - Bypass entry + opt-in true → `harnesses[0].mode === "bypass"`, annotation
          `"no harness gate to bypass"`
        - Mixed-mode entries → both rendered with per-entry annotations

    - `[ ]` **3.1.b `activeValueLayers` derivation**

        Build `test-first` (one behavior at a time):

        - Opt-in false → `"none"` (wrapper still works mechanically; no posture engaged)
        - Default-prompt + opt-in true → `"validation + audit + harness-prompt bypass"`
        - Bypass + opt-in true → `"validation + audit"`
        - Mixed-mode + opt-in true → `"validation + audit + harness-prompt bypass (X only)"` per
          notes example

    - `[ ]` **3.1.c Routing rendering**
        - JSON: `releaseRouting` field at envelope root (mirrors session-init slot shape).
        - Human-readable: `release_routing` block after interlock block — three lines, one per
          class, format `class_name: wrapper|raw`.

    - `[ ]` **3.1.d Human-readable rendering**

        Build `test-first` (one behavior at a time):

        - Default-prompt with allowlist active → output matches notes § Status Surface Examples
          exactly
        - Bypass mode → output matches notes § Status Surface Examples exactly
        - Opt-in not recorded → `harnesses: []`, `active_value_layers: none`, routing all `raw`

### `[ ]` **3.2 Session-init orientation surface (R11)**

- _Goal:_ Session-init orientation includes a one-line note when release wrapper is engaged
  (`release.enabled === true`); mode-aware text per PRD R11. Silent when not engaged.

- _Approach:_ Orientation rendering reads the routing slot's `rationale.releaseEnabled` plus the
  marker (for mode awareness). Doc edit to `session-init.md` Step 6 to surface the line.

    - `[ ]` **3.2.a Marker-aware orientation field on probe envelope**
        - `arc status --session-init --json` envelope adds a marker-summary field (or extends an
          existing slot) so orientation has mode info without re-reading the file from the
          workflow doc.
        - Build `test-first`: empty marker → field absent / null; populated marker → per-harness
          mode summary present.

    - `[ ]` **3.2.b Orientation doc edit + mode-aware text**
        - `session-init.md` Step 6 grows a conditional one-line surface above
          `**Active work state:**` when `release.enabled === true`.
        - Mode-aware text per PRD R11:
            - All-default-prompt → `"Release wrapper engaged — ARC sole authorization layer for
              matching invocations."`
            - All-bypass → `"Release wrapper engaged — validation + audit layer (no harness-prompt
              bypass under bypass mode)."`
            - Mixed-mode → composite line naming which harnesses fall under which layer.

---

## **Phase 4:** Setup workflow doc

_Purpose:_ Author the supplemental workflow doc that drives `arc release setup install` — the
harness-agnostic contract carrier. Single deliverable: a markdown file at
`.arc/system/workflows/arc/supplemental/setup-release-wrapper.md`.

_Design decisions:_ Mode-aware throughout. Trust-model acknowledgment text variants reference
`notes-release-wrappers-ergonomics.md` § Trust-Model Acknowledgment Text Variants — the workflow
adapts those to its voice rather than re-stating them. Per-harness reference notes (Claude Code,
Codex CLI) embedded inline so the agent has the patterns at workflow-read time without re-loading
the strategy doc. Agent-adaptive path framed as a universal route, not a fallback.

### `[ ]` **4.1 Author `setup-release-wrapper.md` (R1, R3, R8)**

- _Goal:_ Workflow file delivers the six-element contract, the three-tier mode-detection ladder,
  per-harness reference notes for Claude Code and Codex CLI, agent-adaptive framing for other
  harnesses, mode-conditioned trust-model acknowledgment, mandatory behavioral-test verify
  protocol, state-recording protocol, and rollback protocol — invokable standalone via
  `arc release setup install` and as a step in `01_verify-and-configure.md` (R2).

- _Approach:_ Build the workflow from the contract outward. The six elements are the spine;
  everything else (tiers, per-harness notes, acknowledgment, verify) hangs off the spine. Frontmatter
  declares the workflow's audience (collaborative — agent-readable but with human review at
  acceptance points).

    - `[ ]` **4.1.a Frontmatter + scaffolding**
        - YAML frontmatter (`purpose`, `audience: collaborative`, no method dependencies).
        - Section skeleton: When to use, Process (six contract elements + tiers + verify), Per-
          harness reference notes, Agent-adaptive framing, Trust-model acknowledgment, State-
          recording protocol, Rollback protocol, Next step pointers.

    - `[ ]` **4.1.b Six contract elements (R1)**
        - Canonical command shape, prefix-match semantics, scope, mode awareness, side effects,
          verification expectations.
        - Each element a sub-section with one paragraph + concrete example.

    - `[ ]` **4.1.c Three-tier mode-detection ladder (R3)**
        - Tier 1 (agent knows) — reference-implementation patterns inline; brief surface text
          format.
        - Tier 2 (agent uncertain but can investigate) — surfacing prose for the three
          investigation choices.
        - Tier 3 (user-direct) — exact prompt text per PRD R3.

    - `[ ]` **4.1.d Per-harness reference notes (Claude Code, Codex CLI)**
        - Inline patterns per `notes-release-wrappers-ergonomics.md` § Reference-Implementation
          Pattern Specifics.
        - Mode-detection notes (where to look in each harness's config).
        - Brief link to `arc release setup print-patterns --harness <name>` for paste-ready
          format.

    - `[ ]` **4.1.e Agent-adaptive path framing**
        - Universal-route framing per PRD R1 — agent translates contract against its harness's
          own conventions; not a fallback for unknown harnesses.
        - opencode-specific caveat block (per notes § Reference-Implementation Pattern Specifics
          → opencode) — bug references, agent-adaptive path with surfacing.

    - `[ ]` **4.1.f Mode-conditioned trust-model acknowledgment**
        - Default-prompt branch — trust-shift framing (drawn from notes § Trust-Model
          Acknowledgment Text Variants).
        - Bypass branch — audit-only framing (same notes section).
        - Each branch culminates in explicit accept prompt; rejection path documents
          `arc release setup install --abort` equivalent.

    - `[ ]` **4.1.g Behavioral-test verify protocol (R8)**
        - Default-prompt mode → mandatory `arc release commit --version` invocation; pass = no
          prompt observed, fail = prompt observed.
        - Bypass mode → behavioral test skipped; verify based on agent-reported install + user
          confirmation alone.
        - Failure path → loop back to remediation, do not record opt-in.

    - `[ ]` **4.1.h State-recording + rollback protocol**
        - State recording: agent calls `arc release setup install` to write opt-in flag + marker
          entry on verify-pass + user-confirm.
        - Rollback: agent calls `arc release setup uninstall` to remove harness entries + marker
          entry + opt-out flag.

---

## **Phase 5:** Routing rule + workflow class-tag integration

_Purpose:_ Land the canonical routing rule, amend the arc-commit skill, and apply class tags
across the 10 ceremony fire sites with verb-elided shapes.

_Design decisions:_ Canonical rule (5.1) lands first — it's referenced by 5.2 and 5.3 downstream.
arc-commit skill (5.2) consolidates task-work routing — eliminates per-workflow class tags at
task-commit sites. Per-workflow class tags (5.3) are mechanical shape-edits; one subtask per
file. Destructive-flag invocations stay literal at every site (no class tag, no shape change) per
PRD R12 workflow-author guidance.

The verb-elision shape is documented in `notes-release-wrappers-ergonomics.md` and PRD R12
workflow-author guidance — for commits, message body in `text` codeblock with no verb prefix; for
pushes, inline prose with class tag and args.

**Strategies:** strategy-task-list-formatting.md (no impact, but workflow markdown follows ARC
conventions throughout).

### `[ ]` **5.1 Canonical rule in DEV-RULES.ARC § Commit Discipline (R12.2)**

- _Goal:_ DEV-RULES.ARC § Commit Discipline gains a new sub-section
  `Interlock release-wrapper routing` (with `[configurable]` marker) carrying the rule, the
  three-class table, the `raw` fallback (including missing-slot fallback for older CLI versions),
  and the destructive-flag carve-out — self-contained without external lookup.

- _Note:_ Section is a sibling of existing § Commit Discipline sub-sections (Commit control,
  Commit format, Atomicity). Lands as a new H3 under § Commit Discipline.

### `[ ]` **5.2 arc-commit skill amendment (R12.3)**

- _Goal:_ arc-commit skill Step 4 references the canonical rule with class tag `taskCommit`,
  consolidating task-work routing without per-workflow class tags at task-commit sites.

- _Approach:_ One added clause in Step 4 — minimal change. No structural rework of the skill
  body.

### `[ ]` **5.3 Workflow class-tag integration (R12.4–R12.9)**

- _Goal:_ Each routing-relevant fire site across 10 workflow files is class-tagged with verb
  elided per PRD R12 workflow-author guidance. Destructive-flag invocations remain literal (no
  class tag, no shape change). Behavior under default config is unchanged — all routing resolves
  to `raw`.

- _Approach:_ Mechanical shape-edit per file. Each subtask handles one file; no
  cross-file dependencies. Could batch via deferred-review at execution time.

    - `[ ]` **5.3.a `process-task-loop.md` zero-edit confirmation (R12.4)**
        - Verify task-work commit routing flows through arc-commit skill (R12.3) without per-
          site class tag in the workflow body.
        - Audit trail only; mark `[x]` after manual inspection.

    - `[ ]` **5.3.b `session-handoff.md` (R12.5)**
        - Handoff push step → `workflowPush` class tag + verb-elided inline prose.

    - `[ ]` **5.3.c `activate-work-unit.md` (R12.6)**
        - Activation commit (L197) → `workflowCommit` + `text` codeblock with message body.
        - Activation push (L214) → `workflowPush` + inline prose.
        - PRD-creation commit (L59) → `workflowCommit` + `text` codeblock with message body.

    - `[ ]` **5.3.d `activate-planning-branch.md` (R12.7)**
        - Planning-branch activation push (L137) → `workflowPush` + inline prose.
        - Destructive `git push origin --delete` (L56, L76) and rename push-then-delete pattern
          (L75-76) — no class tag; literal preserved.

    - `[ ]` **5.3.e `integrate-work-unit.md` (R12.8)**
        - Two ceremony pushes (L290 with `-u`, L335 bare) → `workflowPush` + inline prose.

    - `[ ]` **5.3.f `archive-work-unit.md` (R12.8)**
        - Archive ceremony commit (L227) → `workflowCommit` + `text` codeblock.
        - Destructive delete-push (L115) — no class tag; literal preserved.

    - `[ ]` **5.3.g `deactivate-work-unit.md` (R12.8)**
        - Deactivation commits (L133, L177) → `workflowCommit` + `text` codeblock each.
        - Deactivation pushes (L142, L186) → `workflowPush` + inline prose.
        - Destructive delete-push (L82) — no class tag; literal preserved.

    - `[ ]` **5.3.h `rotate-branch.md` (R12.8)**
        - Non-destructive pushes (L37 with `-u`, L65 bare) → `workflowPush` + inline prose.
        - Destructive `git push --force-with-lease` (L93) and `git push origin --delete` (L72) —
          no class tag; literal preserved.

    - `[ ]` **5.3.i `integrate-planning-branch.md` (R12.8)**
        - Ceremony commits (L89 graduation, L109 shelving, L116 retire) → `workflowCommit` +
          `text` codeblock each.
        - Ceremony push (L124) → `workflowPush` + inline prose.
        - Destructive delete-push (L159) — no class tag; literal preserved.

    - `[ ]` **5.3.j `project/address-pr-review.md` (R12.9)**
        - Ceremony push (L149) → `workflowPush` + inline prose.

---

## **Phase 6:** Documentation + initial-setup integration

_Purpose:_ Write the new domain strategy doc, integrate setup into onboarding, update cross-
references in the four strategy docs that need them.

_Design decisions:_ Strategy doc lands first — initial-setup section (6.2) and cross-references
(6.3) depend on it as the cross-reference target. Initial-setup placement is concrete in PRD R2
(Path 1 between "Customization Beyond Config" and "Optional: Verify Installation"; Path 2 between
"Configuration Review" and "Optional: Verify Installation"). Cross-references are small touches.

### `[ ]` **6.1 New strategy doc `strategy-interlock-release-wrappers.md` (R14.1)**

- _Goal:_ Domain strategy doc at `.arc/reference/strategies/arc/strategy-interlock-release-wrappers.md`
  carrying trust-model framing across modes, when-to-use / when-not-to-use guidance, per-harness
  setup notes (reference-implementation), agent-adaptive path framing, and acknowledgment of
  user-level safety-gate hooks as a parallel layer.

- _Approach:_ Lead with the unconditional layer (validation + audit) as the universal benefit per
  notes § Strategy Doc Framing Notes. Position harness-prompt bypass as additional benefit for
  default-prompt users; name bypass mode explicitly. Acknowledge user-level safety-gate hooks as
  parallel, complementary layer (denylist at OS boundary; wrapper validates ARC-state at CLI
  boundary).

    - `[ ]` **6.1.a Strategy file scaffold + trust model framing**
        - Top-level structure: When to use this, Trust model, When not to use this, Per-harness
          setup, Agent-adaptive path, Safety-gate hooks (parallel layer), Troubleshooting.
        - Trust model section frames unconditional + conditional layers per notes guidance.

    - `[ ]` **6.1.b Per-mode when-to-use guidance**
        - Default-prompt mode subsection.
        - Bypass mode subsection — distinct from default-prompt; primary value prop is
          validation + audit (notes § Strategy Doc Framing Notes).

    - `[ ]` **6.1.c Reference-implementation per-harness notes**
        - Claude Code subsection — pattern, mode detection, paste-ready snippet via
          `arc release setup print-patterns --harness claude-code`.
        - Codex CLI subsection — same shape.

    - `[ ]` **6.1.d Agent-adaptive path framing**
        - Universal-route framing — works for any harness; agent translates contract against its
          own conventions.
        - opencode caveats subsection (per PRD Non-Goals + notes opencode references).

    - `[ ]` **6.1.e Safety-gate hooks parallel-layer note**
        - Per notes § Strategy Doc Framing Notes — denylist at OS boundary, wrapper validates ARC
          state at CLI boundary; layers compose without conflict.

    - `[ ]` **6.1.f Troubleshooting**
        - Wrong-setup scenarios stratified by severity per notes § Adopter Friction Analysis.
        - Each scenario: symptom, mitigation, remediation command.

### `[ ]` **6.2 Initial-setup section in `01_verify-and-configure.md` (R2)**

- _Goal:_ Lightweight section in the existing initial-setup workflow surfaces release-wrapper
  setup at onboarding — three-way user choice (set up now / defer / never) without gatekeeping
  onboarding completion.

- _Approach:_ Section content is minimal per PRD R2 — brief description + three-way choice +
  pointer to `arc release setup install` for the now path. Strictly informational. Section title
  TBD at impl-time (e.g., "Optional: Interlock Release Wrapper Setup" — confirm at write-time per
  PRD § Open Questions).

    - `[ ]` **6.2.a Section content draft**
        - Brief description (one paragraph): what interlock release wrappers are, what
          installation does, the trust-model trade-off in one or two lines.
        - Three-way user choice block.

    - `[ ]` **6.2.b Path 1 placement (Fresh Install)**
        - Insert section between "Customization Beyond Config" and "Optional: Verify
          Installation" per PRD R2.

    - `[ ]` **6.2.c Path 2 placement (Join Existing)**
        - Insert section between "Configuration Review" and "Optional: Verify Installation" per
          PRD R2.
        - Same content as 6.2.b — both paths share the section body verbatim.

### `[ ]` **6.3 Cross-reference updates (R14.2–R14.5)**

- _Goal:_ Four strategy docs gain cross-references to the new domain strategy and the structured
  routing surface, ensuring discoverability from related-domain entry points.

- _Approach:_ Small touches — each strategy doc gets a cross-reference block addition where
  topically relevant. No restructuring of existing content.

    - `[ ]` **6.3.a `strategy-configurability-architecture.md` (R14.2)**
        - Cross-reference to the new domain strategy. Interlock release wrappers as a
          configurability surface (`release.enabled` × interlock values × routing).

    - `[ ]` **6.3.b `strategy-session-operations.md` (R14.3)**
        - Update for session-init orientation surfacing (engaged-state note per R11) and the
          harness/mode marker as part of session-init posture reading.

    - `[ ]` **6.3.c `strategy-team-coordination.md` (R14.4)**
        - Per-developer asymmetric setup acknowledgment — multi-developer repos with diverging
          setup state per developer; document as expected, parallel to existing per-developer
          interlock-setting variation.

    - `[ ]` **6.3.d `strategy-workflow-authoring.md` (R14.5)**
        - Workflow-author guidance for routing-class declaration shape — when to class-tag a fire
          site, the verb-elision pattern (commit message body in `text` codeblock; push args
          inline prose), the destructive-flag exclusion, and the canonical-rule reference.

---

## **Phase 7:** Empirical verification + ADR-017 amendment

_Purpose:_ Run the deferred empirical surface (WU1 success criteria 5/6) using project-scoped
mode override; optionally amend ADR-017 if integration surfaces broader insights worth bundling.

_Design decisions:_ Test tier (integration vs. e2e) determined here per testing-methodology
strategy — leaning e2e since the test exercises the full toolchain (CLI + harness + git). Codex
matcher boundary re-verification pins specific codex-cli version at impl-time. R18 is P2 / nice-
to-have — explicit "skip unless..." gate; can be marked `[~]` Superseded if scope doesn't warrant.

**Strategies:** strategy-testing-methodology.md

### `[ ]` **7.1 Empirical-test surface (R13)**

- _Goal:_ Cross-mode empirical tests verify (a) `arc release commit --version` runs no-prompt
  under installed allowlist with project-scoped default-mode override on a maintainer machine
  with global bypass mode, and (b) Codex matcher boundary still holds (`bash -lc` / `zsh -lc`
  unwrapping; `prefix_rule()` patterns match canonical wrapper invocation).

- _Approach:_ Project-scoped mode override per PRD R13 — fresh test repo with
  `permissions.defaultMode: "default"` written to project-scoped `.claude/settings.json`
  overrides user-scoped bypassPermissions for the test session. Codex equivalent uses project-
  scoped policy override.

    - `[ ]` **7.1.a Test fixture: project-scoped Claude Code mode override**
        - Fresh test repo setup helper; project `.claude/settings.json` with
          `permissions.defaultMode: "default"`.
        - Verifies the override actually takes effect (sanity test before behavioral assertions).

    - `[ ]` **7.1.b Behavioral observation tests**
        - `arc release commit --version` under installed allowlist → no prompt.
        - `arc release commit --version` without allowlist → prompt fires.
        - Both observations under project-scoped override on a globally-bypass maintainer machine.

    - `[ ]` **7.1.c Codex matcher boundary re-verification**
        - Pin codex-cli version at impl-time; document in test header.
        - Confirm `bash -lc` / `zsh -lc` unwrapping still occurs.
        - Confirm `prefix_rule()` patterns match canonical wrapper invocation shape.
        - Confirm fall-through paths (env-prefix, command-substitution, `$'...'`) still prompt.

### `[ ]` **7.2 ADR-017 Tier 2 amendment (R18, P2 optional)**

- _Goal:_ Optional Tier 2 amendment to ADR-017's Consequences capturing the harness-mode dimension
  surfaced during WU1 Phase 7 verification, now formalized in WU2's mode-aware setup.

- _Note:_ Skip unless WU2 integration surfaces broader insights worth bundling. Mark `[~]`
  Superseded with a short rationale if not pursued. P2 status; not gating WU2 ship.

- _Approach:_ Tier 2 dated annotation per ADR methodology — no decision change, no supersession;
  expanded operational rationale.

---

## **Phase 8:** Verification

### `[ ]` **8.1 Complete verification** — load and follow [`verify-work-unit.md`][verify-work-unit]

---

## Success Criteria

### Behavioral

- `[ ]` `arc release setup install` runs end-to-end against Claude Code reference implementation
  (default-prompt mode), records opt-in + marker entry, behavioral test passes (no harness prompt
  for `arc release commit --version`)
- `[ ]` `arc release setup install` runs end-to-end against Codex CLI reference implementation
  (default-prompt mode), with the same outcome
- `[ ]` `arc release setup install` runs end-to-end under bypass mode against Claude Code:
  records opt-in, writes marker entry, skips allowlist write with explanation, surfaces audit-only
  trust framing
- `[ ]` Multi-harness install with simulated failure surfaces user-choice prompt (record partial /
  retry / abort); does not auto-record opt-in without explicit user acceptance of partial coverage
- `[ ]` `arc release setup install` against an existing opt-in surfaces the four-way idempotency
  choice (re-verify / update markers / add harness / exit)
- `[ ]` `arc release setup uninstall` symmetric path: removes harness-side entries (matched by
  canonical pattern set), removes marker entry, records opt-out
- `[ ]` Workflow-integration changes route through the wrapper for task-work commits when
  `commit_interlock ∈ {on-task-approval, on-workflow}` and `release.enabled === true`; route
  through raw git otherwise; verified across the R12.4–R12.9 workflows

### Empirical (deferred from WU1 criteria 5/6)

- `[ ]` Project-scoped mode override produces a default-prompt harness session on a maintainer
  machine with global bypassPermissions enabled; behavioral test (`arc release commit --version`)
  observes no-prompt under installed allowlist; with allowlist removed, harness-prompt fires
- `[ ]` Codex matcher boundary re-verified against then-current codex-cli at WU2 verification:
  `bash -lc` / `zsh -lc` unwrapping still occurs; `prefix_rule()` patterns still match canonical
  wrapper invocation shape; env-prefix / command-substitution / `$'...'` quoted invocations still
  fall through to harness prompt

### Forensic

- `[ ]` `arc release status` accurately surfaces engaged posture across both modes — opt-in flag,
  harness list with modes, active value layers per mode, resolved routing per class
- `[ ]` Marker file is durable across sessions (subsequent `arc release status` reads the
  persisted file correctly)
- `[ ]` Session-init orientation surfaces the engaged-wrapper note when applicable; silent when
  not engaged
- `[ ]` `releaseRouting` envelope slot present at session-init and session-handoff; resolves
  correctly across release.enabled × interlock × class matrix

### Code quality

- `[ ]` Tier 1 quality gates pass: markdown lint zero violations, TypeScript lint zero violations,
  shell lint zero violations, typecheck zero errors, vitest unit/integration/e2e all pass, tsup
  build succeeds
- `[ ]` Tier 2 quality gates pass at WU completion checkpoint per quality-gates strategy
- `[ ]` Tier 3 pre-PR gates pass before merge
- `[ ]` New code in `packages/arc-framework/src/handlers/release/setup/` follows existing handler
  conventions: typed deps injection, testable spawn-stubs for git operations, structured outcome
  types
- `[ ]` All quality gates pass
- `[ ]` Ready for integration

---

[verify-work-unit]: ../../system/workflows/arc/work-unit-lifecycle/verify-work-unit.md
