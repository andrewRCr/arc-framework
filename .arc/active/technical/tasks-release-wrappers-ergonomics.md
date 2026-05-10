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

### `[x]` **1.1 Routing primitive (R12.1)**

- _Goal:_ Session-init and session-handoff envelopes carry a fully-resolved `releaseRouting` slot
  that workflows and skills consult without re-deriving the authorization rule.

    - `[x]` **1.1.a Routing slot schema types**
        - Added `ReleaseRoute`, `ReleaseRoutingValue`, `ReleaseRoutingRationale`, and
          `ReleaseRoutingSlot` in `lib/release/routing.ts`, then threaded the value type into the
          session-init and session-handoff status envelope contracts.

    - `[x]` **1.1.b Resolver implementation (`resolveReleaseRouting`)**
        - Added a pure resolver that maps `release.enabled`, commit interlock, and push interlock
          into `taskCommit`, `workflowCommit`, and `workflowPush` routes, preserving the input
          rationale and safe-defaulting unknown interlock values to `raw`.

    - `[x]` **1.1.c Lift `resolveAllSettings` to handler scope**
        - `handleStatus` now resolves release-mode settings once for session-init and
          session-handoff, reusing the same snapshot for config output, sync interlock, and
          `releaseRouting`; `runConfigSessionInitStatus` accepts the pre-resolved snapshot while
          preserving its standalone fallback.

    - `[x]` **1.1.d Wire `releaseRouting` slot into session-init envelope**
        - Session-init now emits top-level `releaseRouting` with slot-level failure isolation and
          interactive summary rendering. The config session-init subset also carries
          `session.init_load.notes`, matching the workflow's load-dispatch contract.

    - `[x]` **1.1.e Wire `releaseRouting` slot into session-handoff envelope**
        - Session-handoff now emits the same top-level `releaseRouting` shape from the shared
          resolved-settings snapshot, alongside the existing handoff slots.

- _Outcome:_ Workflows now receive an explicit route decision for task commits, workflow commits,
  and workflow pushes from both session envelopes, with the resolved input rationale attached for
  debugging and future release-status rendering.

### `[x]` **1.2 Marker storage library (R9)**

- _Goal:_ Per-developer per-machine marker file at `.arc/user/{identity}/.internal/release-setup.json`
  with library API for read / upsert / remove of harness entries; schema-versioned for
  forward-compatibility.

    - `[x]` **1.2.a Schema types**
        - Added `MarkerSchemaV1`, `HarnessEntry`, harness mode types, and runtime guards for marker
          validation at read boundaries.

    - `[x]` **1.2.b Path resolution helpers**
        - Added `resolveMarkerPath(ctx)` and idempotent `ensureMarkerParent(ctx)` for the
          `.arc/user/{identity}/.internal/` marker location.

    - `[x]` **1.2.c Library API — read / upsert / remove**
        - Added `readMarker`, `upsertHarness`, and `removeHarness` with empty default reads, typed
          malformed/version/schema errors, atomic JSON writes, replacement by harness name, no-op
          absent removal, sibling preservation, and empty-marker persistence.

- _Outcome:_ `setup-marker.ts` now mirrors the release audit-log storage convention while using the shared
  atomic JSON writer for schema-v1 marker persistence under `.arc/user/{identity}/.internal/`.

### `[x]` **1.3 `cli.ts` description-string accuracy sweep (R15)**

- _Goal:_ Release-subcommand description strings in `cli.ts:256-263` reference the actual storage
  shape WU1 shipped — `arc.releaseEnabled` (per-developer git-config key) or `release.enabled`
  (yaml key) per context.

- _Outcome:_ Updated the opt-in / opt-out Commander help text to name the local git-config key
  `arc.releaseEnabled` with the value written by each command.

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
Handlers live at `packages/arc-framework/src/handlers/release/setup/`.

Sub-subcommand parent registration: Task 2.1.a registers
`const setupCmd = releaseCmd.command("setup")...` once (with parent description text covering
the subcommand tree generally); subsequent subcommands (2.2, 2.3, 2.4) attach via
`setupCmd.command(...)`. This is the first 3-deep subcommand in `cli.ts` — no precedent to copy
from.

Mode/harness input shape: `--harness <name>` is **required** on install (single-harness dispatch
path) and uninstall — single harness per invocation, multi-harness orchestration runs agent-side
via repeated invocation. `--harness <name>` is **optional** on verify (read-only; absent →
all-harnesses iteration). `--mode <default-prompt|bypass>` is required on install's
single-harness dispatch (fresh install or idempotency `add harness`); not used on uninstall or
verify.

**Strategies:** strategy-testing-methodology.md

### `[x]` **2.1 `arc release setup print-patterns` command (R6, R17)**

- _Goal:_ Paste-ready canonical patterns emitted per harness in native format; abstract
  six-element contract emitted for unknown harnesses; `--format=raw` strips wrapping for tooling
  consumers.

    - `[x]` **2.1.a Sub-subcommand wiring + flag handling**
        - Registered the `release setup` parent and `print-patterns` child with `--harness <name>`
          plus `--format <harness|raw>` validation.

    - `[x]` **2.1.b Per-harness formatters**
        - Added Claude Code JSON output, Codex Starlark output, abstract contract fallback, unknown-harness
          warning, and raw canonical command-pattern output.

- _Outcome:_ `arc release setup print-patterns` now provides the canonical allowlist pattern surface
  that setup/install/uninstall workflows can reference without duplicating harness-specific formats.

### `[x]` **2.2 `arc release setup verify` command (R7)**

- _Goal:_ Read-only post-install verification helper. Confirms `arc.releaseEnabled` is recorded;
  reports recorded harness/mode posture; under default-prompt mode prints the direct prompt-
  observation command for the agent workflow to run; under bypass mode reports based on opt-in
  state alone. Does NOT gate opt-in (the workflow's verify step holds the safety property per PRD R7).

    - `[x]` **2.2.a Sub-subcommand wiring + state reads**
        - Registered `release setup verify` with optional `--harness <name>`; the handler resolves
          ARC root, identity, release settings, and marker state before delegating to a pure renderer.

    - `[x]` **2.2.b Verify behavior**
        - Added the read-only posture report: not-engaged non-error, default-prompt direct
          prompt-observation instructions, bypass-mode skip rationale, harness filtering, all-harness
          rendering, and marker-read error surfacing.

- _Outcome:_ PRD R7/R8 and Task 2.2 now match the actual harness boundary: CLI `verify` reports
  setup posture and the direct test command, while prompt observation remains a workflow-mediated
  outer-harness step rather than a nested subprocess.

### `[x]` **2.3 `arc release setup install` command (R4, R16)**

- _Goal:_ Orchestration porcelain driving the supplemental setup workflow (R1). Captures
  trust-model acknowledgment, writes harness/mode marker on workflow's verify-pass, records
  `arc.releaseEnabled = true` on user-confirm, handles idempotency four-way and multi-harness
  partial-success per PRD R4.

    - `[x]` **2.3.a State-read shell + idempotency four-way branch**

        - Added `release setup install` shell routing: fresh state proceeds to the single-harness
          flow, existing installs surface recorded harness state plus the four idempotency choices,
          and `re-verify` / `update markers` route to workflow-mediated follow-up paths rather than
          nested subprocess prompt observation.

    - `[x]` **2.3.b Single-harness install flow + trust-model acknowledgment**

        - Added required-flag validation, mode-conditioned trust acknowledgment, workflow-verification
          confirmation, marker upsert, and opt-in recording for the single-harness install path.
          Declined acknowledgments and unconfirmed workflow verification abort without state changes.

    - `[x]` **2.3.c Marker behavior under agent-side multi-harness orchestration**

        - Kept multi-harness orchestration per-invocation: repeated calls append/upsert marker
          entries through the marker library, preserve siblings, and skip opt-in writes when
          `arc.releaseEnabled` is already recorded. Partial state remains visible through the
          existing-install state report; user-choice coordination stays in the workflow.

    - `[x]` **2.3.d `--json` mode (R16)**
        - Added a `schemaVersion: 1` JSON envelope for install with per-harness results, pre/post
          opt-in state, action result, and exit code. Human progress and error lines route to
          stderr in JSON mode so stdout remains parseable.

- _Outcome:_ `arc release setup install` now owns the state transitions around the workflow-mediated
  ceremony while preserving the harness boundary: trust/verification stay explicit, marker state is
  durable across repeated harness installs, and JSON consumers get a clean envelope.

### `[x]` **2.4 `arc release setup uninstall` command (R5, R16)**

- _Goal:_ Symmetric removal — agent removes harness-side entries (matched by canonical pattern
  set; conservative on user-curated drift); marker entry removed; opt-out flag recorded via
  WU1's `arc release opt-out` primitive. Idempotent.

    - `[x]` **2.4.a State-read shell + idempotency**
        - Added delayed marker-read orchestration for uninstall: required `--harness` validation runs
          before marker state reads, current marker/opt-in posture renders consistently with install, and
          already-absent harness entries return no-op success without cleanup, marker writes, or opt-out.

    - `[x]` **2.4.b Cleanup orchestration**
        - Added workflow-mediated cleanup confirmation using canonical raw patterns sourced through
          `print-patterns`, conservative refusal surfacing, marker removal, last-entry opt-out, sibling
          preservation, and Commander wiring for `arc release setup uninstall`.

    - `[x]` **2.4.c `--json` mode (R16)**
        - Added a `schemaVersion: 1` uninstall envelope with release-enabled before/after state,
          per-harness uninstall results, cleanup action/result fields, and human progress routed to
          stderr in JSON mode so stdout remains parseable.

- _Outcome:_ `arc release setup uninstall` now mirrors install's workflow-mediated boundary: the CLI
  supplies the canonical cleanup contract, records only verified rollback state, preserves sibling harness
  opt-in posture, and gives scripting consumers a parseable uninstall envelope.

---

## **Phase 3:** Posture surfacing — `arc release status` extension

_Purpose:_ Make installed setup observable on demand via `arc release status` — harnesses, active
value layers, AND resolved routing per class (R10).

_Design decisions:_ Sequenced before the setup workflow (Phase 4) so the workflow's verify step
has a complete `arc release status` to reference. Status envelope bumps `schemaVersion 1 → 2`
(additive). Routing slot already computed by Phase 1's primitive (R12.1) — Phase 3 just renders
it.

PRD R11 (session-init orientation surface) deferred to `plan-handoff-optimization.md` —
always-on engaged-state line dropped as configuration-state noise (excluded by orientation
discipline at `session-init.md` Step 6); legitimate routing-shift posture-change surface
absorbed into handoff-opt's `releaseRoutingAtLastHandoff` infrastructure (Approach item 5). No
session-init orientation work in this WU.

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
        - JSON: `releaseRouting` field at envelope root with flat shape —
          `{taskCommit, workflowCommit, workflowPush, rationale}` directly, no `{ok, value}`
          wrapper. Symmetric with the existing `arc release status --json` envelope (where
          `releaseEnabled`, `commitInterlock`, etc. are flat). Differs from session-init's
          `releaseRouting` slot shape (which uses `{ok, value}` per probe-orchestration
          convention); status command computes routing inline from already-resolved settings —
          no probe-failure path to surface.
        - Human-readable: `release_routing` block after interlock block — three lines, one per
          class, format `class_name: wrapper|raw`.

    - `[ ]` **3.1.d Human-readable rendering**

        Build `test-first` (one behavior at a time):

        - Default-prompt with allowlist active → output matches notes § Status Surface Examples
          exactly
        - Bypass mode → output matches notes § Status Surface Examples exactly
        - Opt-in not recorded → `harnesses: []`, `active_value_layers: none`, routing all `raw`

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
  protocol, state-recording protocol, and rollback protocol — applicable when the agent drives
  release-wrapper setup, either standalone (user invokes `arc release setup install`) or as a
  step within `01_verify-and-configure.md` (R2).

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
        - Each branch culminates in explicit accept prompt; rejection path documents how the
          agent backs out of the workflow without recording state — declining the trust-model
          prompt before any `arc release setup install` invocation, or selecting `exit` from
          the four-way idempotency choice. No state to roll back since none was written.

    - `[ ]` **4.1.g Behavioral-test verify protocol (R8)**
        - Default-prompt mode → mandatory `arc release commit --version` invocation; pass = no
          prompt observed, fail = prompt observed.
        - Bypass mode → behavioral test skipped; verify based on agent-reported install + user
          confirmation alone.
        - Failure path → loop back to remediation, do not record opt-in.

    - `[ ]` **4.1.h State-recording + rollback protocol**
        - State recording: agent calls `arc release setup install --harness <name> --mode <mode>`
          to upsert the marker entry on verify-pass + user-confirm. Opt-in flag
          (`arc.releaseEnabled = true`) is written on the first successful install; subsequent
          installs are flag-idempotent.
        - Rollback: agent calls `arc release setup uninstall --harness <name>` per harness to
          remove the marker entry (canonical patterns sourced from `print-patterns`). Opt-out
          flag (`arc.releaseEnabled = false`) flips only when removing the last marker entry;
          uninstalls that leave siblings preserve the engaged state for those siblings.

---

## **Phase 5:** Routing rule + workflow class-tag integration

_Purpose:_ Land the canonical routing rule, amend the arc-commit skill, apply class tags across
the 10 ceremony fire sites with verb-elided shapes, and extend non-routing interlock-value
gates to honor the permissiveness ladder.

_Design decisions:_ Canonical rule (5.1) lands first — it's referenced by 5.2 and 5.3 downstream.
arc-commit skill (5.2) consolidates task-work routing — eliminates per-workflow class tags at
task-commit sites. Per-workflow class tags (5.3) are mechanical shape-edits; one subtask per
file. Destructive-flag invocations stay literal at every site (no class tag, no shape change) per
PRD R12 workflow-author guidance. Permissiveness-ladder fixup (5.4) is independent of routing —
targets non-routing consumer surfaces (prompt shape, deferred-review default, sync push trigger)
that strict-equality-check lower-tier values; without it, `on-workflow` falls through to
default-conservative at these sites.

The verb-elision shape is documented in `notes-release-wrappers-ergonomics.md` and PRD R12
workflow-author guidance — for commits, message body in `text` codeblock with no verb prefix; for
pushes, inline prose with class tag and args.

Class-tag syntax: PRD R12 specifies "backtick-wrapped class tag at the directive line" but
doesn't pin exact placement (tag at end of sentence vs. trailing annotation vs. fence-adjacent).
Implementer settles the syntax shape once on the first fire site (5.3.b or 5.3.c), then applies
consistently across all subsequent sites for visual coherence.

**Strategies:** strategy-task-list-formatting.md (no impact, but workflow markdown follows ARC
conventions throughout).

### `[ ]` **5.1 Canonical rule in DEV-RULES.ARC § Commit Discipline (R12.2)**

- _Goal:_ DEV-RULES.ARC § Commit Discipline gains a new sub-section
  `Interlock release-wrapper routing` (with `[configurable]` marker) carrying the rule, the
  three-class table, the `raw` fallback (probe-failure, missing-class, unrecognized-value arms),
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
        - Handoff ceremony commit (L130, `chore(status): handoff`) → `workflowCommit` +
          `text` codeblock with message body.
        - No push fire site: handoff push is delegated to `arc sync` (orchestrator at
          L389-413), which PRD R12 carves out from routing scope.

    - `[ ]` **5.3.c `activate-work-unit.md` (R12.6)**
        - Activation commit (L197) → `workflowCommit` + `text` codeblock with message body.
        - Activation push (L214) → `workflowPush` + inline prose.
        - PRD-creation commit (L59) → `workflowCommit` + `text` codeblock with message body.

    - `[ ]` **5.3.d `activate-planning-branch.md` (R12.7)**
        - Planning-branch activation push (L137) → `workflowPush` + inline prose.
        - Destructive `git push origin --delete` (L56, L76) and rename push-then-delete pattern
          (L75-76) — no class tag; literal preserved.
        - _Note:_ L75 push (`--set-upstream origin {new}`) is non-destructive on its own; stays
          literal as part of the rename idiom paired with L76's destructive delete. Splitting
          would break the prose-flow coupling.

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

### `[ ]` **5.4 Permissiveness-ladder fixup for non-routing interlock gates**

- _Goal:_ Workflow text and code that gate behavior on raw interlock values via strict equality
  against the lower-permissiveness tier (`on-task-approval`, `on-sync`) extend to also accept the
  upper tier (`on-workflow`) per the ADR-018 ladder. Closes the regression where setting
  `on-workflow` falls through to default-conservative at sites the routing primitive doesn't
  cover.

- _Approach:_ Mechanical OR-extension per site. Pattern reference: `recommended-summary-line.ts`
  already implements the OR-shape for sync_interlock
  (`syncInterlock.value === "on-handoff" || === "on-workflow"`); mirror across remaining sites.
  Routing primitive (Task 1.1) handles the ladder internally — this task targets surfaces upstream
  of routing (prompt shape, deferred-review default, sync push-leg trigger).

    - `[ ]` **5.4.a `process-task-loop.md` prompt-prefix selector**
        - L121 currently fires `Commit and proceed` only under
          `commit_interlock: on-task-approval`.
        - Extend: also under `on-workflow`.

    - `[ ]` **5.4.b `process-task-loop.md` deferred-review safe-accumulation**
        - L155 currently safe-accumulates only under `on-task-approval`.
        - Extend: also under `on-workflow`.

    - `[ ]` **5.4.c Sync push-leg trigger**
        - Audit `lib/sync/` and any sync-workflow text for strict
          `pushInterlock === "on-sync"` checks gating the push leg.
        - Extend: also accept `on-workflow` per the ladder.

    - `[ ]` **5.4.d Audit sweep**
        - Grep `.ts` and `.md` under `packages/arc-framework/src/` and `.arc/system/workflows/`
          for strict equality against `"on-task-approval"`, `"on-sync"`, `"on-handoff"` in
          interlock-value contexts. Extend any missed sites; document findings in completion
          notes.

- _Acceptance:_ With `commit_interlock: on-workflow` (or `push_interlock: on-workflow`), behavior
  at non-routing surfaces is at-least-as-permissive as the lower tier — no autonomy regression
  at flip time.

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

- _Note:_ Strategy ships to adopters via `npx arc update` (packaged from `strategies/arc/`). Per
  DEV-RULES.PROJECT § Architecture Documentation, ADR citations are forbidden in adopter-facing
  surfaces. PRD and notes contain ADR-017 / ADR-018 references — translate to operational framing
  when authoring (e.g., "both wrapper value layers — validation + audit (unconditional) and
  harness-prompt bypass (conditional)" instead of "per ADR-017").

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
        - Update for the harness/mode marker (R9) as a per-developer per-machine state surface.
        - Note R11's deferral of routing-shift orientation surfacing to
          `plan-handoff-optimization.md` so the strategy doc carries the cross-WU reference.

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

_Purpose:_ Run the deferred empirical surface (WU1 success criteria 5/6) live at WU verification;
optionally amend ADR-017 if integration surfaces broader insights worth bundling.

_Design decisions:_ Empirical verification runs **live, in-session** at WU completion — maintainer
performs the steps on their machine, reports observations verbally, outcomes captured in WU
completion notes. No persistent test artifact, no `__tests__/` test surface. Rationale: this is
once-and-done verification per the WU's lifecycle; building automation infrastructure for a single
maintainer-eyes-on test would be over-investment for the cadence. PRD R13's "test surface lives in
`packages/arc-framework/__tests__/`" framing is amended to "live verification + completion-notes
capture" accordingly.

R18 is P2 / nice-to-have — explicit "skip unless..." gate; can be marked `[~]` Superseded if scope
doesn't warrant.

### `[ ]` **7.1 Live empirical verification (R13)**

- _Goal:_ Confirm at WU verification (a) `arc release commit --version` runs no-prompt under
  installed allowlist with project-scoped default-mode override, and (b) Codex matcher boundary
  still holds (`bash -lc` / `zsh -lc` unwrapping; `prefix_rule()` patterns match canonical wrapper
  invocation).

- _Approach:_ Maintainer runs the steps live on their machine, observes outcomes, reports.
  Outcomes recorded in WU completion notes alongside the verification phase. No automated test
  fixture, no `__tests__/` test surface for this requirement.

    - `[ ]` **7.1.a Project-scoped Claude Code mode override**
        - Fresh scratch repo on maintainer machine; project `.claude/settings.json` with
          `permissions.defaultMode: "default"`.
        - Confirm override takes effect (sanity check before behavioral observations).

    - `[ ]` **7.1.b Behavioral observations (Claude Code)**
        - With allowlist installed (canonical patterns from `print-patterns`):
          `arc release commit --version` → expect no harness prompt.
        - Without allowlist: `arc release commit --version` → expect harness prompt fires.
        - Observations recorded in completion notes.

    - `[ ]` **7.1.c Codex matcher boundary re-verification**
        - Note codex-cli version at run time; record in completion notes.
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
