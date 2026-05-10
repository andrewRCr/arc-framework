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

### `[x]` **3.1 `arc release status` extension (R10)**

- _Goal:_ Single-source posture surface — opt-in flag, interlock states, harnesses + modes,
  active value layers, resolved routing per class. JSON envelope at `schemaVersion: 2`;
  human-readable mode renders new fields after existing interlock block.

    - `[x]` **3.1.a Envelope schema bump + harnesses projection**
        - Bumped `arc release status --json` to `schemaVersion: 2`, reads the per-identity setup
          marker, projects harness entries with mode/install timestamp, and annotates bypass-mode
          entries as having no harness gate to bypass.

    - `[x]` **3.1.b `activeValueLayers` derivation**
        - Added active-value-layer derivation for opt-out, default-prompt, bypass-only, and mixed-mode
          posture, including the mixed-mode `(... only)` harness attribution.

    - `[x]` **3.1.c Routing rendering**
        - Added flat `releaseRouting` to the JSON envelope and a human-readable `release_routing`
          block, both sourced from the existing routing primitive rather than duplicating authorization
          logic.

    - `[x]` **3.1.d Human-readable rendering**
        - Extended human mode after the interlock block with harness posture, active value layers, and
          routing lines; current opt-out state renders `harnesses: []`, `active_value_layers: none`,
          and raw routing.

- _Outcome:_ `arc release status` now serves as the single posture surface for wrapper opt-in,
  harness setup state, active value layers, and route-class decisions while preserving JSON stdout purity.

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

### `[x]` **4.1 Author `setup-release-wrapper.md` (R1, R3, R8)**

- _Goal:_ Workflow file delivers the six-element contract, the three-tier mode-detection ladder,
  per-harness reference notes for Claude Code and Codex CLI, agent-adaptive framing for other
  harnesses, mode-conditioned trust-model acknowledgment, mandatory behavioral-test verify
  protocol, state-recording protocol, and rollback protocol — applicable when the agent drives
  release-wrapper setup, either standalone (user invokes `arc release setup install`) or as a
  step within `01_verify-and-configure.md` (R2).

    - `[x]` **4.1.a Frontmatter + scaffolding**
        - Frontmatter set (`purpose`, `audience: collaborative`); no method dependencies declared.
        - Section structure: When to use → Process (contract + tiers + install/skip + verify +
          record) → Per-Harness Reference Notes → Agent-Adaptive Path → Trust-Model
          Acknowledgment → State-Recording Protocol → Rollback Protocol → Next Step.

    - `[x]` **4.1.b Six contract elements (R1)**
        - Six elements rendered as Process subsections: canonical command shape, prefix-match
          semantics, scope, mode awareness, side effects, verification expectations. Each
          carries one paragraph + concrete example.

    - `[x]` **4.1.c Three-tier mode-detection ladder (R3)**
        - Tier 1/2/3 ladder integrated into Process Step 1. Tier 1 surfaces detection cleanly;
          Tier 2 offers the three investigation choices (docs / config-path / user-direct);
          Tier 3 carries the exact user-prompt text per PRD R3.

    - `[x]` **4.1.d Per-harness reference notes (Claude Code, Codex CLI)**
        - Claude Code: mode detection via `permissions.defaultMode`; JSON allowlist patterns;
          install target `.claude/settings.json` (project-scoped preferred).
        - Codex CLI: mode detection via `approval_policy` with in-session detection caveat
          (added from external-research pass); kwargs-form Starlark patterns; install target
          `~/.codex/rules/default.rules`; matcher boundary with reliable-vs-fall-through
          examples drawn from `research-codex-prefix-rule-matcher.md`.

    - `[x]` **4.1.e Agent-adaptive path framing**
        - Universal-route framing landed (not fallback for unknown harnesses). opencode caveat
          block included with both upstream issue references (sst/opencode#6676,
          sst/opencode#15507) and the documented limitation.

    - `[x]` **4.1.f Mode-conditioned trust-model acknowledgment**
        - Both mode framings landed in a dedicated § Trust-Model Acknowledgment section —
          default-prompt (trust-shift) and bypass (audit-only). Process Step 2 references the
          section; rejection path documented inline (no state written, no rollback required).

    - `[x]` **4.1.g Behavioral-test verify protocol (R8)**
        - Default-prompt: mandatory `arc release commit --version` invocation through the
          harness (not nested CLI subprocess); pass/fail loop described. Bypass: behavioral
          test skipped; verify on agent-report + user confirmation. Failure path loops back
          to install rather than recording opt-in.

    - `[x]` **4.1.h State-recording + rollback protocol**
        - State-recording section covers marker-file schema (v1), opt-in flag mechanics,
          four-way idempotency (re-verify / update markers / add harness / exit), and
          multi-harness partial-success handling. Rollback section covers conservative cleanup
          (canonical pattern match), last-harness opt-out flip, and clean-slate marker
          preservation.

- _Outcome:_ Shipped `setup-release-wrapper.md` at both `.arc/system/workflows/arc/supplemental/`
  and the package-source twin. External-research pass on Codex tightened the mode-detection
  section (concrete `approval_policy` values) and surfaced an upstream defect in
  `print-patterns --harness codex` (positional vs kwargs form), which spun out as an atomic fix
  landed at `33928b2a`. Empirical codex-cli verification still pending at R13.

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

### `[x]` **5.1 Canonical rule in DEV-RULES.ARC § Commit Discipline (R12.2)**

- _Goal:_ DEV-RULES.ARC § Commit Discipline gains a new sub-section
  `Interlock release-wrapper routing` (with `[configurable]` marker) carrying the rule, the
  three-class table, the `raw` fallback (probe-failure, missing-class, unrecognized-value arms),
  and the destructive-flag carve-out — self-contained without external lookup.

- _Outcome:_ Landed as peer sub-bullet `Workflow class-tag routing` under § Commit Control,
  sibling to the existing `Release-wrapper invocation` bullet (~14 lines, ~250 tokens) — not
  the originally-specced standalone H3 (~40 lines, ~600 tokens). Method shape evaluated and
  rejected: adopter override semantics ill-fit a runtime-resolved value; per-workflow re-load
  worse than constitutional once-per-session for default-disabled adopters. PRD R12.2 amended
  to reflect placement; rationale and forward-compat signals captured in
  `notes-release-wrappers-ergonomics.md` § Routing-Rule Placement Decision. Downstream:
  5.2 references the rule by section/bullet name (no `arc.methods` declaration); 5.3 unchanged
  (workflows still carry class tags as textual triggers).

### `[x]` **5.2 arc-commit skill amendment (R12.3)**

- _Goal:_ arc-commit skill Step 4 references the canonical rule with class tag `taskCommit`,
  consolidating task-work routing without per-workflow class tags at task-commit sites.

- _Outcome:_ Step 4 Simple-path commit clause amended in all four locations — canonical
  (`.arc/system/skills/arc-commit/SKILL.md`), package source
  (`packages/arc-framework/arc/system/skills/arc-commit/SKILL.md`), and this laptop's
  hand-synced harness copies (`.claude/skills/arc-commit/SKILL.md`,
  `.codex/skills/arc-commit/SKILL.md`). Desktop machine's gitignored harness copies are
  stale until next desktop session — captured as a Persistent Context entry in
  SESSION-NOTES.md for cross-machine continuity.

### `[x]` **5.3 Workflow class-tag integration (R12.4–R12.9)**

- _Goal:_ Each routing-relevant fire site across 10 workflow files is class-tagged with verb
  elided per PRD R12 workflow-author guidance. Destructive-flag invocations remain literal (no
  class tag, no shape change). Behavior under default config is unchanged — all routing resolves
  to `raw`.

- _Outcome:_ Settled syntax shape on first edit site (5.3.b session-handoff): commit fire
  sites use directive line ending `(`<className>`):` followed by `text` codeblock with
  message body (verb elided — `git commit -m "..."` literal removed); push fire sites use
  inline prose with `(`<className>`)` at the directive plus backticked args (verb elided —
  `git push` literal removed). Pattern applied uniformly across all 9 file edits
  (5.3.b–5.3.j); 5.3.a confirmed zero-edit (process-task-loop delegates to arc-commit skill
  at L209). Synced to package source for the 8 workflows with
  `packages/arc-framework/arc/system/workflows/` counterparts; project-only workflow (5.3.j)
  edited in `.arc/` only. All destructive-flag invocations preserved literal as spec'd. Tier
  2 markdown lint clean across 241 files.

    - `[x]` **5.3.a `process-task-loop.md` zero-edit confirmation (R12.4)**
        - Verify task-work commit routing flows through arc-commit skill (R12.3) without per-
          site class tag in the workflow body.
        - Audit trail only; mark `[x]` after manual inspection.

    - `[x]` **5.3.b `session-handoff.md` (R12.5)**
        - Handoff ceremony commit (L130, `chore(status): handoff`) → `workflowCommit` +
          `text` codeblock with message body.
        - No push fire site: handoff push is delegated to `arc sync` (orchestrator at
          L389-413), which PRD R12 carves out from routing scope.

    - `[x]` **5.3.c `activate-work-unit.md` (R12.6)**
        - Activation commit (L197) → `workflowCommit` + `text` codeblock with message body.
        - Activation push (L214) → `workflowPush` + inline prose.
        - PRD-creation commit (L59) → `workflowCommit` + `text` codeblock with message body.

    - `[x]` **5.3.d `activate-planning-branch.md` (R12.7)**
        - Planning-branch activation push (L137) → `workflowPush` + inline prose.
        - Destructive `git push origin --delete` (L56, L76) and rename push-then-delete pattern
          (L75-76) — no class tag; literal preserved.
        - _Note:_ L75 push (`--set-upstream origin {new}`) is non-destructive on its own; stays
          literal as part of the rename idiom paired with L76's destructive delete. Splitting
          would break the prose-flow coupling.

    - `[x]` **5.3.e `integrate-work-unit.md` (R12.8)**
        - Two ceremony pushes (L290 with `-u`, L335 bare) → `workflowPush` + inline prose.

    - `[x]` **5.3.f `archive-work-unit.md` (R12.8)**
        - Archive ceremony commit (L227) → `workflowCommit` + `text` codeblock.
        - Destructive delete-push (L115) — no class tag; literal preserved.

    - `[x]` **5.3.g `deactivate-work-unit.md` (R12.8)**
        - Deactivation commits (L133, L177) → `workflowCommit` + `text` codeblock each.
        - Deactivation pushes (L142, L186) → `workflowPush` + inline prose.
        - Destructive delete-push (L82) — no class tag; literal preserved.

    - `[x]` **5.3.h `rotate-branch.md` (R12.8)**
        - Non-destructive pushes (L37 with `-u`, L65 bare) → `workflowPush` + inline prose.
        - Destructive `git push --force-with-lease` (L93) and `git push origin --delete` (L72) —
          no class tag; literal preserved.

    - `[x]` **5.3.i `integrate-planning-branch.md` (R12.8)**
        - Ceremony commits (L89 graduation, L109 shelving, L116 retire) → `workflowCommit` +
          `text` codeblock each.
        - Ceremony push (L124) → `workflowPush` + inline prose.
        - Destructive delete-push (L159) — no class tag; literal preserved.

    - `[x]` **5.3.j `project/address-pr-review.md` (R12.9)**
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
