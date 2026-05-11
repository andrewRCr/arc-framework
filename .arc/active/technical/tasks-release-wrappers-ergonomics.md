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

### `[x]` **5.4 Permissiveness-ladder fixup for non-routing interlock gates**

- _Goal:_ Workflow text and code that gate behavior on raw interlock values via strict equality
  against the lower-permissiveness tier (`on-task-approval`, `on-sync`) extend to also accept the
  upper tier (`on-workflow`) per the ADR-018 ladder. Closes the regression where setting
  `on-workflow` falls through to default-conservative at sites the routing primitive doesn't
  cover.

- _Outcome:_ Three workflow-side edits in `process-task-loop.md` (5.4.a prompt-prefix selector;
  5.4.b deferred-review safe-accumulation; 5.4.d-found L207 commit-interlock release
  description) — each extended to set notation `∈ {on-task-approval, on-workflow}` or
  equivalent OR-prose. Zero src-side edits required: 5.4.c found push-leg gating via
  `pushInterlock === "manual"` (negative check, already subsumes both tiers); 5.4.d source
  audit surfaced no remaining strict-equality sites needing extension (matches were type
  definitions, defaults, legacy migration, or `notes_push` — different config key). Three
  out-of-scope strategy-doc gaps surfaced by 5.4.d (`strategy-session-operations.md` L504 +
  L510, `strategy-team-coordination.md` L182) routed to 6.3.b / 6.3.c task expansion per
  user direction (strategies are reference material; cross-reference / language-update touches
  belong in Phase 6).

    - `[x]` **5.4.a `process-task-loop.md` prompt-prefix selector**
        - L121 currently fires `Commit and proceed` only under
          `commit_interlock: on-task-approval`.
        - Extend: also under `on-workflow`.

    - `[x]` **5.4.b `process-task-loop.md` deferred-review safe-accumulation**
        - L155 currently safe-accumulates only under `on-task-approval`.
        - Extend: also under `on-workflow`.

    - `[x]` **5.4.c Sync push-leg trigger**
        - Audit `lib/sync/` and any sync-workflow text for strict
          `pushInterlock === "on-sync"` checks gating the push leg.
        - Extend: also accept `on-workflow` per the ladder.
        - _Outcome:_ Zero src-side edits required. `handlers/sync.ts` (no `lib/sync/` dir
          exists; sync logic lives in the handler) gates push-leg behavior on
          `pushInterlock === "manual"` (negative check at L207, L227) — already subsumes both
          `on-sync` and `on-workflow`. The hypothesized strict equality on `"on-sync"` is
          absent; the routing primitive (Task 1.1) handles per-class wrapper-vs-raw separately.

    - `[x]` **5.4.d Audit sweep**
        - Grep `.ts` and `.md` under `packages/arc-framework/src/` and `.arc/system/workflows/`
          for strict equality against `"on-task-approval"`, `"on-sync"`, `"on-handoff"` in
          interlock-value contexts. Extend any missed sites; document findings in completion
          notes.
        - _Outcome:_ Source-side audit clean — strict-equality sites (`routing.ts:52`,
          `interlock-validation.ts:96`) already use OR-shape including `on-workflow`;
          remaining matches are type definitions, defaults, legacy migrations, and
          `notes_push` policy (different config key, no `on-workflow` tier). Workflow-side
          audit found one additional site: `process-task-loop.md` L207 commit-interlock
          release description — extended to also accept `on-workflow`. Out-of-scope strategy
          docs surfaced three gaps routed to 6.3.b / 6.3.c expansion (see those subtasks).

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

### `[x]` **6.1 New strategy doc `strategy-interlock-release-wrappers.md` (R14.1)**

- _Goal:_ Domain strategy doc at `.arc/reference/strategies/arc/strategy-interlock-release-wrappers.md`
  carrying trust-model framing across modes, when-to-use / when-not-to-use guidance, per-harness
  setup notes (reference-implementation), agent-adaptive path framing, and acknowledgment of
  user-level safety-gate hooks as a parallel layer.

    - `[x]` **6.1.a Strategy file scaffold + trust model framing**
        - Top-level structure landed: Overview, Trust Model, When Not to Use This, Per-Harness
          Reference Implementations, Agent-Adaptive Path, Safety-Gate Hooks (Parallel Layer),
          Strategic Awareness.
        - Trust Model carries two-value-layer treatment — unconditional (validation + audit) leads
          as the universal benefit; conditional (harness-prompt bypass) framed as friction
          reduction for default-prompt users.

    - `[x]` **6.1.b Per-mode when-to-use guidance**
        - Default-prompt and bypass-mode framing folded into § Trust Model § Per-Mode Framing
          rather than separate H3s under a When-to-use section. Co-locates mode treatment with
          the value-layer framing it modifies; bypass mode named explicitly.

    - `[x]` **6.1.c Reference-implementation per-harness notes**
        - Claude Code and Codex CLI subsections under § Per-Harness Reference Implementations.
        - Architectural framing only — patterns, paths, mode-detection mechanics, and Codex's
          full supported / fall-through matcher table all defer to `setup-release-wrapper.md`
          § Per-Harness Reference Notes per boundary discipline.

    - `[x]` **6.1.d Agent-adaptive path framing**
        - § Agent-Adaptive Path carries workflow-as-contract framing (universal route; contract
          is the deliverable; reference impls are convenience helpers on top).
        - opencode subsection acknowledges upstream limits ([sst/opencode#6676],
          [sst/opencode#15507]); unconditional layer fires regardless, conditional layer behavior
          gated on upstream resolution.

    - `[x]` **6.1.e Safety-gate hooks parallel-layer note**
        - § Safety-Gate Hooks (Parallel Layer) — strategy-only content (workflow doesn't cover).
        - Comparison table (boundary / coverage / mechanism); composition asserted as
          conflict-free; bypass-mode pairing convention noted.

    - `[x]` **6.1.f Strategic awareness (re-scoped from Troubleshooting)**
        - Section re-scoped per boundary discipline — operational troubleshooting (verify
          failures, fix-on-spot cases) stays in the setup workflow; § Strategic Awareness carries
          known characteristics adopters should anticipate.
        - Four items: trust-model shift acceptance, interlock-setting routing impact,
          multi-developer asymmetric setup, wrapper/interlock implementation-bug class.

- _Outcome:_ New strategy doc (~270 lines) at canonical and package-source locations,
  byte-identical. Boundary discipline applied throughout — strategy carries architecture and
  rationale, setup workflow carries procedure; cross-references are mostly workflow → strategy
  with one strategy → workflow pointer per per-harness / agent-adaptive section. Bundled small
  workflow trim: setup workflow's agent-adaptive intro lost an architectural sentence
  (workflow-as-contract framing) that now lives in the strategy doc, replaced with a pointer.
  No ADR citations in the reader-facing surface — translated to operational framing throughout.
  Neutral framing discipline established: zero "adopter" mentions (that term reads as
  maintainer-voice positioning); subject-shift to system/action where natural, "user" /
  "developer" where actor noun needed. Other strategies carry the term too — sweep routed to
  ATOMIC-INBOX (configurability-architecture 5 mentions, file-classification 4,
  workflow-authoring 1, session-operations 1).

### `[x]` **6.2 Initial-setup section in `01_verify-and-configure.md` (R2)**

- _Goal:_ Lightweight section in the existing initial-setup workflow surfaces release-wrapper
  setup at onboarding — three-way user choice (set up now / defer / never) without gatekeeping
  onboarding completion.

    - `[x]` **6.2.a Section content draft**
        - Section title: `Optional: Set Up Release Wrappers` — verb-leading; matches the file's
          existing `Optional: Verify Installation` pattern (Optional-prefix for non-gating
          informational sections).
        - One-paragraph description defines wrappers in newcomer-friendly terms (working
          definition without prerequisite ARC vocabulary), names the per-mode value
          composition (default-prompt: harness-prompt removal; bypass: validation + audit as
          canonical authorization signal), names the per-developer per-machine opt-in
          trade-off. Pointer to strategy doc for full framing.
        - Three-way choice (Set up now / Defer / Skip entirely) with concrete next-step prose
          per option.

    - `[x]` **6.2.b Path 1 placement (Fresh Install)**
        - Section inserted between `### Customization Beyond Config` and
          `### Optional: Verify Installation`. Description back-references
          `§ Configuration Walkthrough` (Path-1's review-section name) for interlock-value
          continuity.

    - `[x]` **6.2.c Path 2 placement (Join Existing)**
        - Section inserted between `### Configuration Review` and
          `### Optional: Verify Installation`. Body verbatim with Path 1 except the
          back-reference points to `§ Configuration Review` (Path-2's review-section name).

- _Outcome:_ One ~28-line section, verbatim across both paths (no path-specific back-
  reference; the abstracted "settings reviewed during initial configuration" phrasing
  works for both Path 1's "Configuration Walkthrough" and Path 2's "Configuration
  Review"). Friction-story framing leads — harness prompt or custom user-level hook
  prompt becomes redundant once ARC's interlock layer has authorized; wrapper closes
  the gap. Trust-model trade-off named; defer is named as the reasonable default.
  Two pointers (intent-labeled): strategy doc for trust-model + when-to-use; setup
  workflow for the procedure. New `[interlock-strategy]` and `[setup-workflow]` link
  references added to the file's link block. Neutral framing throughout (zero "adopter"
  mentions per the Task 6.1 discipline).

  **Bundled cross-doc fix (third pattern surfacing):** The original framing
  pre-section work assumed two patterns — default-prompt with allowlist install vs.
  bypass with no friction-reduction lever. Drafting the section surfaced a third
  pattern (bypass + custom user-level hook with denylist logic, common in power-user
  postures), where friction reduction arrives automatically because denylist patterns
  target `git commit` / `git push`, not the wrapper subcommands (precedent: `arc sync`
  has worked this way since it landed). To correctly account for this pattern:

    - **Strategy doc:** § Safety-Gate Hooks (Parallel Layer) renamed to § Custom
      User-Level Hooks (Parallel Layer) — "safety-gate" was non-standard coined
      terminology. Section body re-termed throughout. New § Friction reduction across
      layers subsection added articulating the allowlist/denylist asymmetry,
      automatic-passthrough common case, and the broad-pattern edge case (denylist
      refinement as the analogous lever). § Bypass-mode framing in Trust Model and
      § When Not to Use This re-termed for consistency.
    - **Setup workflow:** "safety-hook" mentions in Step 2's bypass-mode acknowledgment
      re-termed to "custom user-level hooks." New "Custom user-level hook awareness"
      block added to Step 3's bypass arm — surfaces that wrapper invocations typically
      pass through denylists silently, no hook update required in the common case;
      points to strategy doc for the full framing.
    - All three files synced to package source.

  **Forward note:** This project hasn't yet run `arc release setup install` against
  itself (Phase 5 just landed the routing primitive; ergonomics WU's setup paths are
  what's being authored). Flag at next-session handoff: run setup against this repo
  before resuming task work to dogfood the new flow.

### `[x]` **6.3 Cross-reference updates (R14.2–R14.5)**

- _Goal:_ Four strategy docs gain cross-references to the new domain strategy and the structured
  routing surface, ensuring discoverability from related-domain entry points.

    - `[x]` **6.3.a `strategy-configurability-architecture.md` (R14.2)**
        - Cross-reference to new domain strategy added (Related Documentation entry +
          release-wrapper opt-in inline pointer + link reference). Bundled 6.R.4.a (new `##
          Personal Configuration via Git Config` H3 + 8-key reference table) and in-file 6.R
          sweep (~12 stale references corrected to `arc.X` per-dev key forms; Config scope
          section renamed; Behavioral defaults table + Configurability path definitions +
          Personal settings callout updated). Both copies in sync; Tier 1 lint clean.

    - `[x]` **6.3.b `strategy-session-operations.md` (R14.3)**
        - R9 marker surfaced as per-machine state in § Session State Portability § Scope
          (`user/{identity}/.internal/` carries release-wrapper marker + audit-log + sync-state +
          pre-load backups; excluded from notes serialization by the dotfile rule; per-machine
          install rationale named); R11 routing-shift orientation deferral noted at the
          wrapper-layer paragraph in § Interlock Model with cross-WU pointer to
          `plan-handoff-optimization.md`. Bundled session-operations portion of 6.R.6.d's sweep
          (~25 stale `session.<X>` / `release.enabled` references corrected to `arc.X` per-dev
          key forms across 13 locations; Per-developer override paragraph in § Handoff-Interior
          Toggle Pattern restructured to acknowledge post-6.R reality — `arc.commitInterlock` and
          `arc.releaseOptedIn` added per pre-existing documentation gap; framing shifted from
          "override" to canonical-per-dev for keys with no yaml counterpart). L504/L510
          permissiveness-ladder gap-fix landed (contributor handoff cadence non-manual set
          extended to `on-workflow`; Deferred-Review × Commit-Interlock Release set notation
          `∈ {on-task-approval, on-workflow}`). New `[interlock-release-wrappers]` link reference
          added. Both copies in sync; Tier 1 lint clean.

    - `[x]` **6.3.c `strategy-team-coordination.md` (R14.4)**
        - **Asymmetric setup is expected** paragraph added to § Interlock-Release Coordination
          calling out per-developer divergence in installed harnesses, opt-in states, and
          per-machine modes — explicitly paralleled to per-developer interlock-setting variation
          (`arc.commitInterlock`, `arc.pushInterlock`, `arc.syncInterlock`); pointer to
          interlock-release-wrappers strategy added with new `[interlock-release-wrappers]` link
          reference. Release-wrapper opt-in paragraph rewritten for post-6.R per-dev-only reality
          (no project-wide opt-in switch; `arc release setup install` writes `arc.releaseOptedIn`;
          dropped stale "yaml-set `release.enabled`" framing). Bundled team-coordination portion
          of 6.R.6.d's sweep (6 stale `session.<X>` / `arc.releaseEnabled` references corrected
          to post-6.R key forms at L182, L187, L193, L200-202, L207). L182 permissiveness-ladder
          gap-fix landed (task-ownership extended to `arc.commitInterlock ∈ {on-task-approval,
          on-workflow}`). Both copies in sync; Tier 1 lint clean.

    - `[x]` **6.3.d `strategy-workflow-authoring.md` (R14.5)**
        - New `### Routing class tags` section added under § Body Conventions covering the
          full author-side declaration shape: class-tag semantics (`taskCommit`,
          `workflowCommit`, `workflowPush`) and when to apply them; verb-elision pattern with
          worked examples (commit body in nested `text` codeblock; push args inline backticked
          prose); destructive-flag exclusion (`--delete`, `--force`, `--force-with-lease` stay
          literal — wrapper refuses by design); `arc sync` push exception. Canonical routing
          rule cross-referenced to DEV-RULES.ARC § Commit Discipline. Bonus stale shorthand
          `session.{commit,push}_interlock` at L86 corrected to `arc.commitInterlock` and
          `arc.pushInterlock` (audit miss; this file's only stale form). Both copies in sync;
          Tier 1 lint clean.

- _Outcome:_ Strategy-doc surface fully aligned with post-6.R per-dev-only architecture across
  the four R14-targeted docs plus the bonus `strategy-interlock-release-wrappers.md`.
  Cross-references to the new domain strategy added (configurability-arch, session-ops,
  team-coordination); routing-class declaration guidance landed (workflow-authoring); R9 marker
  and R11 routing-shift orientation deferral surfaced (session-ops). Bundled the strategy-doc
  portion of 6.R.6.d's sweep and the permissiveness-ladder gap-fixes from Task 5.4.d audit
  (L182/L504/L510). 6.R.6.d's remaining scope shrinks to QUICK-REFERENCE.md and any other
  reference docs grep surfaces.

---

## **Phase 6.R:** Configuration scope refactor — collapse interlocks + release-flag to per-dev only

_Purpose:_ Mid-WU course-correction surfaced during Phase 6 — the dual-scope yaml-plus-git-config
pattern misapplied to autonomy/opt-in keys (interlocks, release flag) creates a discoverability
trap and pushes maintainer preferences onto contributors. Collapse the four affected keys to
per-developer git-config only; rename `release.enabled` → `arc.releaseOptedIn` to eliminate the
"feature switch" misread; add a discoverability surface for all per-dev `arc.*` keys; backfill
docs (PRD, ADR, strategies, briefs) so the architecture reads coherently.

_Design decisions:_ Collapse scope is exactly the four keys whose semantics are personal autonomy
or personal opt-in (`session.*_interlock` ×3, `release.enabled`); `user.notes_push` deferred
(team.mode coupling). Rename `releaseEnabled` → `releaseOptedIn` to capture signifier-not-switch
semantics. Discoverability home is a new section in `strategy-configurability-architecture.md`.
ADR-017 receives an amendment (not supersession) clarifying the scope shift. See
`notes-release-wrappers-ergonomics.md` § Phase 6.R Configuration Scope Refactor for full design
history (research findings, naming options weighed, what was wrong before, why this is right).

### `[ ]` **6.R.1 Design capture — notes file + ADR-017 amendment**

- _Goal:_ Record the design decision in the two persistent surfaces — WU notes for full design
  history (research findings, alternatives weighed, why per-dev-only and why `releaseOptedIn`),
  and ADR-017 receiving an amendment that clarifies the original "adopter opt-in" framing
  implementing per-developer in practice.

    - `[x]` **6.R.1.a Notes file design history (`notes-release-wrappers-ergonomics.md`)**
        - New § Phase 6.R: Configuration Scope Refactor — Design History added; covers
          trigger, external research findings, `release.enabled` semantic walkthrough,
          convergence on per-dev-only for the four keys, `notes_push` deferral rationale,
          naming convergence on `releaseOptedIn`, ADR-017 amendment relationship, plus
          generate-tasks 3-pass process and `X.R` parent-task numbering precedent forward
          notes.
        - Contents H2 ToC updated.

    - `[ ]` **6.R.1.b ADR-017 amendment — per-developer scope clarification**
        - _Note:_ Pass 2 plan for 6.R.4.a called for an ADR-017 amendment link in the strategy
          doc's `arc.notesPush` row; dropped during 6.3.a's bundled execution per
          DEV-RULES.PROJECT § Architecture Documentation (ADRs are internal-only; can't be
          linked from adopter-facing strategy docs). This amendment should still capture the
          `arc.notesPush` deferral context — the strategy doc points at the deferral but
          doesn't elaborate.
        - File: `.arc/reference/adr/adr-017-release-wrapper-trust-model.md` (single copy —
          ADRs are internal-only per DEV-RULES.PROJECT § Architecture Documentation).
        - Add new amendment section after existing Decision (parallel to existing
          `2026-05-01 — Configuration shape refinement` block in ADR-016).
        - Captures: original "adopter opt-in" framing was conceptually right but
          project-level implementation predated WU2's per-developer setup path; the trust
          model lives per-harness/per-machine, so opt-in lives there too; collapsed yaml
          surface and rename to `releaseOptedIn`.
        - Cross-reference notes file for full history.
        - Note: distinct from Phase 7's potential ADR-017 amendment (which is about
          integration-surfaced insights) — both can land as separate amendments.

### `[ ]` **6.R.2 Resolver code — collapse yaml fallback + rename**

- _Goal:_ Drop yaml-fallback in the resolver for the four collapsed keys; rename `releaseEnabled`
  → `releaseOptedIn` across constants, types, internal naming, and consumers — code substrate
  matches the new architecture.

- _Note:_ 6.R.4.b removes the four yaml keys; co-bundle 6.R.4.b's commit with 6.R.2's, or
  ensure 6.R.2 lands first. The transient state where yaml keys are removed but the resolver
  still tries to read them is non-erroring (silently falls back to default) but behaviorally
  inconsistent.

    - `[ ]` **6.R.2.a Resolver substrate — `resolved-settings.ts`**
        - Make `yamlKey` optional in `resolveGitConfigOverride` helper (or split into a
          single-tier sibling if optional gets unwieldy — settle during execution).
        - Update `resolveCommitInterlock` / `resolvePushInterlock` / `resolveSyncInterlock`:
          drop `yamlKey` parameter; precedence becomes `git config arc.* → default`.
        - Rename `RELEASE_ENABLED_GIT_CONFIG_KEY` → `RELEASE_OPTED_IN_GIT_CONFIG_KEY`;
          remove `RELEASE_ENABLED_YAML_KEY`; rename type `ReleaseEnabled` → `ReleaseOptedIn`;
          rename `resolveReleaseEnabled` → `resolveReleaseOptedIn`; drop yaml fallback.
        - Update `ResolvedReleaseModeSettings` interface field `releaseEnabled` →
          `releaseOptedIn`; update `resolveAllSettings` composite — substitution map for the
          four collapsed keys disappears (yaml-side keys are gone), `releaseOptedIn`
          substitution replaces the previous `releaseEnabled` substitution.
        - Update file-header doc comment (the "Five keys with `git config arc.* →
          arc-config.yml → default` precedence" block) to reflect the new shape: four
          single-tier keys + `notesPush` as the sole remaining dual-scope key.

    - `[ ]` **6.R.2.b Consumer updates**
        - `lib/release/routing.ts` — `releaseEnabled` field in `ReleaseRoutingRationale` and
          `ResolveReleaseRoutingOptions` → `releaseOptedIn`; rename in resolver function body.
        - `handlers/release/record.ts` — opt-in / opt-out commands write `arc.releaseOptedIn`
          via the renamed constant; update doc comments and prose-style references.
        - `commands/status/format.ts` — rationale field rename in formatted output.
        - `handlers/status.ts` — `releaseEnabled` field reference in envelope build → rename.
        - `cli.ts` — opt-in / opt-out command help text update (current lines ~261, ~270).
        - Verify `lib/release/audit-log.ts`, `lib/release/interlock-validation.ts` carry no
          references (Pass 1 audit B finding).

    - `[ ]` **6.R.2.c Verification audit — no orphaned yaml-key reads**
        - Grep `packages/arc-framework/src/` for `session.commit_interlock`,
          `session.push_interlock`, `session.sync_interlock`, `release.enabled` outside the
          resolver wrapper.
        - Confirm wrapper is the sole surface; if any direct reads found, route through the
          resolver.
        - Marker file sanity check: confirm `lib/release/setup-marker.ts` doesn't reference
          the flag name (Pass 1 audit E).

### `[ ]` **6.R.3 Test coverage updates**

- _Goal:_ Tests across the affected surface reflect the new resolver shape — dual-scope
  precedence assertions removed for the four collapsed keys, git-config-only resolution covered,
  rename propagated, status/format/config-format test fixtures aligned.

    - `[ ]` **6.R.3.a Resolver tests — `__tests__/unit/config/resolved-settings.test.ts`**
        - Drop dual-scope precedence test cases for the four collapsed keys (e.g., the
          existing "yaml-absence defaultsApplied semantic" test for `releaseEnabled` — that
          semantic disappears after collapse).
        - Update test fixture data: `name: "releaseEnabled"` → `"releaseOptedIn"`,
          `settingsKey: "release.enabled"` → no settingsKey for the four collapsed keys.
        - Rename `releaseEnabled` field references → `releaseOptedIn` throughout assertions
          and mock setups.

    - `[ ]` **6.R.3.b Status reader tests — `__tests__/unit/config/status-reader.test.ts`**
        - Remove yaml-tier read assertions for `release.enabled` — the key no longer exists in
          yaml; the test would fail or become meaningless.
        - Confirm parallel coverage for the three interlock keys gets the same treatment.

    - `[ ]` **6.R.3.c Format tests — `__tests__/unit/status-format.test.ts` + `__tests__/unit/config-format.test.ts`**
        - Drop `release.enabled` keys from fixture settings maps.
        - Rename `releaseEnabled: false` → `releaseOptedIn: false` in rationale fixtures.

    - `[ ]` **6.R.3.d Add git-config-only resolution coverage**
        - For each of the four collapsed keys: assert resolver returns documented default
          when `git config arc.*` absent (no yaml fallback consulted).
        - Assert resolver returns git-config value when set; cover invalid-value warning
          behavior on git-config tier.
        - Confirm `resolveAllSettings` composite still composes correctly with simplified
          per-key resolvers.

### `[ ]` **6.R.4 Discoverability surfaces**

- _Goal:_ Per-developer configuration surface becomes discoverable — strategy doc carries the
  canonical reference table, `arc-config.yml` header points to it.

    - `[x]` **6.R.4.a Strategy doc — `## Personal Configuration via Git Config` section**
        - Bundled into 6.3.a's pass (same-file batch). Section landed inside `## Configuration`
          after Config scope subsection; 8-key reference table covers identity, role, tools,
          three interlocks, notesPush, releaseOptedIn. Both copies in sync.

    - `[ ]` **6.R.4.b `arc-config.yml` — remove four collapsed keys; add top-level pointer**
        - Both copies (`.arc/system/arc-config.yml` +
          `packages/arc-framework/arc/system/arc-config.yml`).
        - Remove the entire `# --- Session Interlocks ---` block (the three interlock keys are
          the section's only entries).
        - Remove `release.enabled` entry; either retire the `# --- Release Wrappers ---` section
          entirely or collapse it to a single-line pointer at the section header.
        - Add top-of-file pointer (after the existing comment header block, before the first
          setting): "Personal preferences (autonomy cadence, release-wrapper opt-in) live in
          git-config local. See `strategy-configurability-architecture.md` § Personal
          Configuration via Git Config for the per-developer key reference."
        - _Note:_ `# --- Release Wrappers ---` section retire vs. one-line pointer is an
          execution-time call; both are reasonable. Lean: retire entirely (cleanest), since
          the strategy-doc reference table is the discoverable surface.

### `[ ]` **6.R.5 Setup workflow + handlers**

- _Goal:_ Setup workflow and CLI surfaces consistently use `releaseOptedIn`; install/uninstall
  records the renamed flag via the renamed constant; marker file schema confirmed unaffected.

    - `[ ]` **6.R.5.a Workflow text — `setup-release-wrapper.md`**
        - Both copies (`.arc/` + `packages/arc-framework/arc/`).
        - Replace `arc.releaseEnabled` references → `arc.releaseOptedIn` throughout.
        - Review § State-Recording Protocol for accuracy under collapsed scope (the protocol
          still describes git-config writes correctly; no behavioral change).
        - Review § Trust-Model Acknowledgment text — no references to the flag name expected,
          but verify.

    - `[ ]` **6.R.5.b Install / uninstall handlers — `record.ts`**
        - Function bodies and call sites now reference `RELEASE_OPTED_IN_GIT_CONFIG_KEY`
          (renamed in 6.R.2.a); confirm no string-literal `arc.releaseEnabled` references
          remain.
        - Update handler-internal doc comments.
        - Multi-harness partial-success and idempotency logic unchanged.

    - `[ ]` **6.R.5.c CLI help text + command summaries**
        - `cli.ts` opt-in / opt-out command summaries (current lines ~261, ~270) — update help
          strings to reference `arc.releaseOptedIn`.
        - Grep CLI surface for any other `arc.releaseEnabled` mentions.

    - `[ ]` **6.R.5.d Marker file schema sanity check**
        - Inspect `lib/release/setup-marker.ts` and the schema documented in
          `setup-release-wrapper.md` § State-Recording Protocol.
        - Confirm marker doesn't embed the flag name (Pass 1 audit E expected outcome — no
          schema change).
        - If a reference does exist (unexpected), update accordingly.

### `[ ]` **6.R.6 Cross-doc sweep**

- _Goal:_ Framework reference and brief documents read coherently with the post-collapse
  architecture — no orphaned references to project-level interlocks or `releaseEnabled`.

- _Note:_ Pass 3 grep enumerated the file list below; sweep subtasks may grow if additional
  references surface during execution. Re-run the grep at execution-start.

    - `[ ]` **6.R.6.a `DEV-RULES.ARC.md` (both copies)**
        - § Commit Discipline references `arc.release.enabled` (current lines ~22, ~44, ~46) →
          `arc.releaseOptedIn`.
        - Workflow class-tag routing rule cites `release.enabled` and the three interlock keys
          (current lines ~55-58) — rename releaseEnabled, scope-rephrase interlocks.
        - Contributor commit release language references `session.commit_interlock` (current
          line ~94) — confirm reads correctly under per-dev-only or rephrase.

    - `[ ]` **6.R.6.b `AGENT-BRIEF.ARC.md` (both copies)**
        - Current line ~22 `arc.release.enabled: true` reference → `arc.releaseOptedIn`.
        - Grep for other commit-interlock references; update for clarity.

    - `[ ]` **6.R.6.c Lifecycle workflows (both copies)**
        - `session-init.md` — references `session.commit_interlock` etc. as config settings;
          envelope description (Step 1 table around current lines ~37) describes
          `releaseRouting.value.rationale.releaseEnabled` field — rename per envelope shape
          change in 6.R.2.b.
        - `session-handoff.md`, `process-task-loop.md`, `activate-work-unit.md`,
          `integrate-work-unit.md` — grep for the renamed key + interlock yaml-key prose;
          update where references describe the value's location (e.g., "from `arc-config.yml`")
          rather than the value itself.

    - `[ ]` **6.R.6.d Other reference docs**
        - _Note:_ `strategy-configurability-architecture.md`, `strategy-session-operations.md`,
          `strategy-team-coordination.md`, `strategy-workflow-authoring.md`, and
          `strategy-interlock-release-wrappers.md` already swept as part of 6.3.a–d's batch
          (which absorbed 6.R.4.a + in-file 6.R cleanup across the strategy-doc surface). Skip
          those files in this sweep; remaining scope as listed below.
        - `QUICK-REFERENCE.md` — `arc.release.enabled` references at current lines ~285,
          ~288–289 (both copies).
        - `strategy-quality-gates.md` and others as grep surfaces.

### `[ ]` **6.R.7 PRD update**

- _Goal:_ PRD reads as if the per-developer-only architecture was planned from the start — no
  dual-scope framing residue, `releaseOptedIn` naming consistent throughout, R-anchor numbering
  preserved.

    - `[ ]` **6.R.7.a Identify rework scope — surface to user before edits land**
        - Grep `prd-release-wrappers-ergonomics.md` for `releaseEnabled`, `release.enabled`,
          `commit_interlock`, `push_interlock`, `sync_interlock`.
        - Classify each occurrence: rename-only (mechanical), scope-rephrase (the surrounding
          framing assumed dual-scope and needs adjustment), or section-rewrite (the larger
          architectural framing needs reworking).
        - Surface the classification to user; settle on rewrite shape before applying.

    - `[ ]` **6.R.7.b Apply rewrites**
        - Mechanical renames first (`releaseEnabled` → `releaseOptedIn` throughout).
        - Scope-rephrase passes — adjust surrounding framing where dual-scope language was
          load-bearing; describe the per-dev-only architecture as if planned.
        - Section rewrites where needed — likely the routing-resolution table, configuration
          discussion, and any "adopter opt-in" / "project flag" framing.
        - Preserve R-anchor numbering immutably (no renumbering — audit-trail discipline).

### `[ ]` **6.R.8 WU-internal cleanup**

- _Goal:_ WU artifacts (this task list, ATOMIC-INBOX) carry no stale references — completed
  prior tasks annotated where renamed/collapsed keys appear; obsolete atomic-inbox entry retired.

    - `[ ]` **6.R.8.a Task list amendment — annotate stale references**
        - Scan completed Phases 1-5 + Phase 6 (6.1, 6.2) in
          `tasks-release-wrappers-ergonomics.md` for `releaseEnabled`, `release.enabled`, the
          three interlock yaml-key names.
        - Where references appear in completed tasks, add `_Note:_` peer descriptors on the
          affected parent calling out the post-6.R rename or scope change (e.g., "Note:
          `releaseEnabled` was renamed to `releaseOptedIn` in 6.R; original wording preserved
          for audit-trail").
        - Don't rewrite original task descriptions or completion notes (audit-trail discipline
          per `strategy-task-list-formatting.md` § Revision Numbering).

    - `[ ]` **6.R.8.b ATOMIC-INBOX entry retirement**
        - File: `.arc/user/andrew/ATOMIC-INBOX.md`.
        - Delete the `### \`[ ]\` **Flip project interlocks to on-workflow + release.enabled to true**`
          entry — the work it described (project-level config flips) is no longer atomic-tier
          or even possible (the keys are gone).
        - Personal-scope per-dev preference setting (`git config arc.commitInterlock on-workflow`
          etc.) doesn't warrant atomic capture; it's normal personal config.

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
