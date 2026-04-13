# Working: Modes Gap Resolution

**Purpose:** Tracks unresolved gaps surfaced in the pre-PRD audit (2026-04-10) for
`plan-arc-modes.md`. Findings drain into the plan doc as they resolve; this file shrinks
accordingly. When the last finding drains, this file is deleted.

**Decision history** for resolved findings lives in `plan-arc-modes.md` § Resolved Decisions
(compressed decision records) and the corresponding section bodies (full evaluation trails).
Commit-level history is available via `git log .arc/backlog/feature/plan-arc-modes.md`.
Session-scoped context lives in `user/{identity}/SESSION-NOTES.md`.

---

## Status legend

- 🔴 **Open** — no position yet
- 🟡 **In-discussion** — user thoughts captured, analysis pending
- 🟢 **Resolved** — decision landed, awaiting migration into plan doc. Removed from this file
  once migrated.
- ⚪ **Parked** — out of scope for pre-PRD, revisit later (not blocking formalization)

---

## Sequencing

Findings are ordered by number for traceability, but should be worked in the tier order below.
Tier determines what unblocks what.

**Tier 1 — gates most downstream:** Drained. #1 (Lite PRD) and #8 (recipe architecture)
resolved and migrated 2026-04-10.

**Tier 2 — drained:** #3 (Ship step), #13 (Integrate × non-complete states), #16 (Full → Lite
downgrade), #7 (Guardrail firing mechanism — rejected categorically), #19 (Mode fit
communication — scope lifted pre-PRD) all resolved and migrated. Scope composition from #16:
`pm.mode` → `pm.layer` and `team.mode` → `team.enabled` key renames absorbed into ARCd Rebrand
WU. See [`plan-arc-modes.md`][plan-doc] § Resolved Decisions rows for specific landing points.

**Tier 3 — detail once Tier 1 lands:**

- **#2, #4, #5, #6** — All gate on #1 (now resolved and migrated).
- *#9 (Conditional prompts orchestration) and #10 (Lite `arc-config.yml` reduction mechanism)
  resolved and migrated 2026-04-10. See [`plan-arc-modes.md`][plan-doc] § Prompt Orchestration
  and Recipe Authority, § Lite Config Template Mechanism.*
- *#12, R6 (OQ15 initial-setup workflows) resolved and migrated 2026-04-13. See
  [`plan-arc-modes.md`][plan-doc] § Lite Initial Setup.*

**Tier 4 — validation + inventory:**

- *#11 (install_config precision) resolved and migrated 2026-04-13. See [`plan-arc-modes.md`][plan-doc]
  § Configuration Identity (Consumer read paths block).*
- *A1 (hooks-already-local claim) confirmed via full githooks + arc-lib.sh read 2026-04-13. No plan
  doc edit required; claim upgraded from unvalidated to verified. Co-verified with Finding #11.*
- *A4 (template `arc:if` mechanism) fully subsumed by Findings #4/#5/#10/#12/R6 2026-04-13. No plan
  doc edit required; plan already exercises the template render layer extensively.*
- *R4 (consolidated deliverables inventory) resolved and migrated 2026-04-13. See
  [`plan-arc-modes.md`][plan-doc] § Consolidated Deliverables Inventory. ~56 deliverables across
  10 domains. ADR grouping commitment absorbed as sub-resolution (two ADRs, not four).*
- **Formal strategy audit pass** — promoted at Finding #12/R6 resolution on 3-of-4 drift-check hit
  rate. Single comprehensive sweep of all 10 framework strategies for Full-coupled in-doc surfaces
  before closing pre-PRD. **Sole remaining pre-PRD item.** Deferred to next session per user
  direction on 2026-04-13.

**Parking lot (revisit when touched, not blocking formalization):** Lite + external PM (plan
OQ10), waiting-for taxonomy finalization (OQ12), long-pause staleness threshold (OQ13),
`/arc-status` drift detection threshold (OQ14).

---

## Masked Design Decisions

### Finding 2 — Lite task list template · ✅

**Resolution** (2026-04-11): Lite task list uses the **same format as Full**, with four surgical
trims only: header `Status:` values restrict to `{Pending | In Progress | Complete}` (`Integrated`
and `Paused` drop — both ride on Full-only concepts); `PRD:` path is `.arc/active/prd.md` (singular);
verification phase task points to a new Lite-only `verify-work.md` workflow (parallel-named to
Full's `verify-work-unit.md`, two dedicated files over one unified-with-`arc:if`); atomic companion
file retained in Lite, named `atomic-tasks.md` (paralleling `tasks.md`, with "tasks" filling the
`{wu-name}` slot of Full's `atomic-{wu-name}.md` convention). Phases required in Lite, minimum two
(work + verification), multi-phase normal — "single-phase default" rejected because it would force
retroactive phase addition on graduation, violating "graduation is relocation, not content rewrite".

**Strategy classification correction absorbed:** `strategy-task-list-formatting` reclassified
applies-as-is → needs-variant (corrects Finding #6's 2026-04-11 migration). Four `arc:if`-gated
surfaces: Verification Phase example pointer, Atomic Companion File archival sub-rule, Atomic
Companion File "all work unit types" phrasing, Status values `Paused` and `Integrated`. Naming
convention (Full `atomic-{wu-name}.md` vs Lite `atomic-tasks.md`) handled via mode-aware prose,
no gate.

**Finding #5 interaction:** This resolution revises Finding #5's 2026-04-10 cut list. Atomic
companion references stay in Lite's process-task-loop variant. Remaining cuts: incidental routing
to backlog, coherent-unit protocol's WU-lifecycle framing.

**Migrated to plan doc:** New § The Lite Task List subsection under § Mode 1: ARC Lite, between
§ The Lite PRD and § Graduation / Downgrade Paths. § What Changes "Task list structure" bullet
updated. § Strategy Applicability Mapping rationale cell and Finding #2/#5 follow-ons updated.
§ Enforced Sequence § Ship step "Protocol location" deferral resolved. Feedforward "Lite ship step
deliverable" resolved. Cascades bullet updated. OQ4 marked resolved. Four new Resolved Decisions
rows (phases, verify workflow, atomic naming, strategy reclassification correction).

---

### Finding 4 — Lite session-init + session-handoff · ✅

**Original:** Plan hedges "simplified Lite variants... likely separate template files" — no
commitment.

**User position (2026-04-10):** Depends on what's cut elsewhere — "anything cut from full that's
normally loaded at init or a step in handoff." Parked until Finding #1 resolves.

**Resolution** (2026-04-11):

**Mechanism: single-file-with-`arc:if`**, not two-file variant. `session-init.md` and
`session-handoff.md` rename to `session-init.template.md` and `session-handoff.template.md` in
the package source. Inline `<!-- arc:if install.type == full -->` blocks gate Full-only content,
rendered at install time via the same pipeline as `arc-config.template.yml` and `template-prd.md`.
Adopters see clean `session-init.md` / `session-handoff.md` with only their mode's content — no
runtime gate evaluation, no filename suffixes, no semantic rename.

Initial lean (per prior handoff) was variant per the 5+ density threshold. Discussion flipped
the lean when the "variant vs. conditional" framing was unpacked into three distinct mechanisms:
**Mechanism A** recipe-gated distinct-name files (like `verify-work.md` / `verify-work-unit.md`),
**Mechanism B** template-gated single file with `arc:if` (like `arc-config.template.yml` /
`template-prd.md`), **Mechanism C** runtime in-prose conditionals in installed content (like
`create-prd`). My first-cut reasoning about agent cognitive load applied only to Mechanism C
(which the agent reads and evaluates at runtime). Mechanism B strips gates at install time, so
the installed file is clean. That eliminated the main argument against a unified source and
preserved the "universal parts stay single-source-of-truth" advantage. Mechanism B is also
consistent with existing framework precedent — Approach 1 for `arc-config.yml` was explicitly
rejected at plan-doc L1082-1088 for the same duplication reasoning that applies to session-init.

**Four gated surfaces in `session-init.template.md`:**

1. Step 2 Item 8 WORK-STATUS field enumeration — Lite drops `Task List` field entirely
2. Step 2 Item 10 task list path resolution — Lite uses fixed `.arc/active/tasks.md`
3. Step 5 work-unit-discovery subsection — replaced with narrower Lite discovery (check
   `prd.md` / `plan-*.md`)
4. Contributor role branch + team-mode trust hierarchy example — drop entirely in Lite
   (single-dev by construction)

**`session-handoff.template.md` has no block-level mode gates.** The handoff operation is
mechanically identical across modes — pre-update verification, SESSION-NOTES structure,
persistent-context criterion, markdown lint, git notes save, conditional WORK-STATUS commit,
confirm summary all apply uniformly. Only the WORK-STATUS field set differs, and that's
handled via the field-set decision below.

**WORK-STATUS field set — Lite tracks five fields**: `Branch`, `Next Task`, `Last Completed`,
`Blockers`, `Next Action`. Drops `Task List` (path fixed, nothing to track). `Branch` retained
as lightweight informational — Lite users may branch without ARC enforcing it. Full retains
`Task List` (multi-WU pipeline).

**`Following Task List` field removed from both Lite AND Full uniformly.** Scope-expansion
folded into Finding #4 after the Yes/No flag's redundancy surfaced during Lite WORK-STATUS
design. Reasoning applies symmetrically — the field is redundant with Next Task + Next Action
in both modes (off-task-list detour, on-task-list prep, and mid-task resume all readable from
the relationship between those two fields' content). Uniform simplification, not mode-gated.

**Discovery gate parity.** Lite's Step 5 gates on "skip if Next Action is concrete AND tasks.md
exists with incomplete tasks," parallel to Full's "skip if task list is active." Sessions with
clear resume targets skip discovery regardless of mode. When discovery fires in Lite, it checks
for `prd.md` / `plan-*.md` in `.arc/active/` — no ROADMAP, no backlog, no category-path lookup.

**`strategy-session-operations` reclassification.** applies-as-is → **needs-variant**. Two
in-doc tables embed Full-only surface references: State-Conditional Promotion trigger
(`Following Task List: Yes` — becomes universal after FTL removal, no per-row gating) and
Method Classification by Trigger row for pre-merge-review / review-triage (Full:
`integrate-work-unit`; Lite: `verify-work.md` ship step — dual-value entry). Mechanism:
mode-aware prose + dual-value rows, NOT `.template.md` rename (strategy is on-demand reference
content; templating scope doesn't expand to reference tier for two-row edits). This is the
**second instance** of the Finding #6 classification-by-concept-not-by-content drift pattern
— first was Finding #2's `strategy-task-list-formatting` correction. **Strategy count
corrects to 4 applies-as-is / 4 needs-variant / 2 excluded** (Finding #2's 5/3/2 → Finding #4's
4/4/2).

**Plan doc drift fixes:**

- L1474 § What Stays Identical — "Session lifecycle: Session init and handoff, WORK-STATUS,
  SESSION-NOTES" overstated. Reframed to "Session lifecycle concepts: T1/T2 loading model,
  trust hierarchy, freshness check, git-notes portability, handoff ceremony structure. Shape
  differs in narrow surfaces..." with pointer to § Lite Session Management.
- L1515-1516 § What Changes — WORK-STATUS hedge firmed up. Five fields enumerated, FTL
  cross-mode removal noted.
- L1527-1529 § What Changes — session init/handoff hedge firmed up. Mechanism B committed.
- L1695-1697 § Cascades — forward-pointer updated to point to new § Lite Session Management,
  carry-forward on discovery content unchanged.

**Migrated to plan doc:** Yes — new § Lite Session Management subsection (~185 lines) between
§ The Lite Task List and § Graduation / Downgrade Paths, parallel structure to § The Lite PRD
and § The Lite Task List. Strategy Applicability Mapping table row for
`strategy-session-operations` flipped applies-as-is → needs-variant with dual-table rationale.
Finding #6 follow-on bullet for Finding #4 updated. Five new Resolved Decisions rows
(mechanism, WORK-STATUS field set, FTL removal, Step 5 gate, strategy reclassification).
OQ5 marked resolved.

---

### Finding 5 — Lite process-task-loop · ✅

**Original:** Variant-vs-conditional hedged in plan.

**First-cut decision (2026-04-10):** **Variant over conditional, committed.** Process-task-loop is a
core agent operating doc referenced constantly during task execution — noise in that document is
expensive. Cuts should be minimal: only remove "wrong info" (references to ARC docs or processes
that don't exist in Lite).

**Cut list narrowed (2026-04-11, Finding #2 interaction):** Atomic companion files retained in Lite
as `atomic-tasks.md`; the earlier "atomic companion files" entry in the cut list was premised on
atomic being Full-only. Narrowed cut list: incidental work routing to backlog, coherent-unit
protocol's WU-lifecycle framing.

**Resolution (2026-04-13, Finding #4 mechanism taxonomy application):** **Mechanism flipped
A → B.** Single-file-with-`arc:if` via the existing `3_process-task-loop.template.md` in the package
source. The file already exists as a template in `packages/arc-framework/arc/system/workflows/arc/`
(with pre-existing `team.mode` and `pm.mode` `arc:if` gates); Finding #5's implementation adds an
orthogonal `install.type` axis without rename, mechanism change, or new render code.

**Key reasoning — reversal of 2026-04-10 decision:** The original "noise in core operating doc"
argument applied to Mechanism C (runtime in-prose conditionals preserved in installed content),
not Mechanism B (install-time stripping via `renderConditionals()`). Under B, the adopter's installed
`3_process-task-loop.md` contains zero `arc:if` markers regardless of mode — runtime cognitive load
is zero. Two-file variant rejected: process-task-loop overlap is ~85-90% universal across 295 source
lines (higher than Finding #4's session-init at ~60%), so duplication cost and silent-divergence
risk are *more* severe, not less. Same rejection reasoning as arc-config Approach 1 and Finding #4.

**Key reasoning — mechanism-class awareness (Finding #4 generalization):** When arguing about how
the agent reads a file ("noise in core operating doc"), verify whether the file is runtime-read
(Mechanism C) or install-time-processed (Mechanism B). Finding #4 established this pattern;
Finding #5 is the second consecutive confirmation. Both findings' first-cut proposals implicitly
assumed Mechanism C and argued against conditionals on runtime-cost grounds; both reversed to
Mechanism B once the install-time-processed distinction was made explicit.

**Cut list (final, four gated surfaces):**

1. **Branch/task list coupling bullet** (L36-41 of package source). Full's text (stacked PRs, team
   sub-branches, archival, `rotate-branch` intermediate merges) replaced in Lite with one-sentence
   "single task list on project branch until ship."
2. **Verification Phase pointer** (L198). Full `work-unit-lifecycle/verify-work-unit.md` → Lite
   `verify-work.md` (downstream from Finding #2).
3. **Next Step section** (L200-205). Full-only. Lite's verification phase is terminal — the ship
   step happens inside `verify-work.md`.
4. **Incidental Work Management section** (L207-264). Multi-gate within:
    - Quick Decision Guide two-way gate (Full's incidental-task-list-vs-atomic tree / Lite's
      atomic-or-phase-insertion routing — "atomic → `atomic-tasks.md`; multi-step → new phase or
      insertion into existing `tasks.md`").
    - Where to Capture Atomic Tasks Full-only (Lite collapses to single destination `atomic-tasks.md`
      because `pm.layer: none` excludes `strategy-planning-module` → no `ATOMIC-INBOX.md`).
    - Atomic Task Completion protocol **universal** (not gated; applies to `atomic-{name}.md` in Full
      and `atomic-tasks.md` in Lite).
    - Complete Workflow pointer Full-only (`manage-incidental-work.md` doesn't exist in Lite).

**Retained universally (~85-90% of file):** Purpose, method dependencies, one-task-at-a-time,
test-first execution, issue triage, completion protocol (Tier 1 gates, task marking, pre-report
checklist, mandatory stop, implied permission, deferred review), coherent unit completion protocol
(Tier 2 gates, parent task marking), commit guide integration, WORK-STATUS update at commit time,
atomicity check, Verification Phase section heading/intro, Atomic Task Completion protocol, Task
List Maintenance section, existing `team.mode` / `pm.mode` `arc:if` blocks (compose orthogonally
with `install.type`).

**Drift-check result: `strategy-quality-gates` stays applies-as-is (clean).** Targeted re-audit
per Finding #2 / Finding #4 pattern surfaced no in-doc classification tables, no Full-coupled
example blocks, no references to `verify-work-unit` / `integrate-work-unit` / archival / shift /
team coordination / backlog. The `### Phase 3` / `### Phase N: Testing & Quality Gates` example
blocks are generic task-list skeletons (both modes have phases per Finding #2). "Coherent unit
completion" mentions are about parent-task completion within a task list (valid in Lite).
Cross-references to `process-task-loop`, `2_generate-tasks`, `DEV-RULES.PROJECT`, `QUICK-REFERENCE`
resolve in both modes. **Concept-not-content drift pattern did NOT hit three-of-three** — two
consecutive hits (Finding #2 `strategy-task-list-formatting`, Finding #4 `strategy-session-operations`)
but not this one. Per Finding #4's threshold criterion, no formal Finding #6 audit pass needed
before Tier 4. Strategy count stays **4 applies-as-is / 4 needs-variant / 2 excluded**.

**Migrated to plan doc:** New § Lite Process-Task-Loop subsection (~180 lines) between § Lite
Session Management and § Graduation / Downgrade Paths, parallel structure to § Lite Session
Management. Drift fixes: L1477 § What Stays Identical "Process-task-loop" bullet reframed (was
overstated identity); L1344-1346 § Conditional Content Architecture density threshold bullet
updated (variant-vs-conditional framing collapsed into install-time-vs-runtime gating); L1614-1622
§ The Lite PRD workflow shape inverse reference reframed (process-task-loop no longer "splits into
variants"); L1844-1852 § Atomic Companion Finding #5 interaction paragraph updated with final
cut list and forward-pointer. L339-347 Feedforward recipe bucket assignments cleaned (process-task-loop
drops from install.type buckets); L419-424 Feedforward Process-task-loop variant contents bullet
marked resolved; L3478-3489 § Strategy Applicability Mapping Finding #5 follow-on updated with
mechanism flip note and drift-check result. OQ6 marked resolved. Three new Resolved Decisions rows:
mechanism, gated surfaces, `strategy-quality-gates` drift-check.

---

### Finding 6 — Strategy applicability mapping for Lite · ✅

**Resolution** (2026-04-11): All 10 framework strategies classified. 6 applies-as-is
(adr-methodology, configurability-architecture, file-classification, quality-gates,
session-operations, ~~task-list-formatting~~); 2 needs-variant via inline
`<!-- arc:if install.type == full -->` blocks (work-organization retains Branch Protection
Modes as universal git convention; work-planning retains Discovery Checklist, PRD Readiness,
and PRD Conventions); 2 excluded (team-coordination forced solo in Lite; planning-module
excluded by composition via `pm.layer` gate). Mechanism for needs-variant: same render
pipeline as `arc-config.template.yml`, `.template.md` rename so `needsRendering()` picks them
up. Upgrades plan doc's prior "pure Excluded" label on `work-organization` to needs-variant.
Unblocks Findings #2, #4, #5.

**Correction absorbed (2026-04-11, Finding #2):** `strategy-task-list-formatting` reclassified
applies-as-is → needs-variant. The original classification was based on "core format is
universal" reasoning without auditing the strategy's example blocks and Status value rules.
Finding #2's Lite task list spec design surfaced four Full-coupled surfaces requiring
`arc:if` gating (Verification Phase example pointer, Atomic Companion File archival sub-rule,
Atomic Companion File "all work unit types" phrasing, Status values `Paused` and `Integrated`).
Corrected count: **5 applies-as-is / 3 needs-variant / 2 excluded**. Plan doc rationale cell
and Resolved Decisions row updated in place during Finding #2 migration.

**Migrated to plan doc:** § Strategy Applicability Mapping (under § Content Audit). Resolved
Decisions table adds three rows: "Strategy applicability mapping (Finding #6)",
"work-organization scope refinement", "team-coordination Lite treatment". OQ7 marked resolved.
Upstream recipe-bucket pending references (plan doc § Installation Type Recipe Mechanism)
updated to point at the new subsection.

---

### Finding 11 — `install_config` precision · ✅

**Original:** Plan's "stored in the manifest's `install_config` (like `pm.mode` is now)" is
imprecise. `InstallConfig` exists in `types.ts` with `project_name`, `pm_mode`, `tools`,
`team_mode` — but `pm_mode` is *also* a config key in `arc-config.yml`, and the two are kept in
sync. Lite's install_type: does it live only in the manifest, only in `arc-config.yml`, or both?
If only manifest, how do tools not invoking the CLI (hooks, session-init workflow) read it?

**Resolution (2026-04-13):** **Subsumed by Findings #8/#9/#10/#12 with one residual prose insertion.**
Storage, plumbing, legacy migration, and naming questions were all resolved across the recipe-authority
finding sequence. Plan § Configuration Identity L100-108 commits manifest-only storage
(`install_config.install_type`); § Installation Type Recipe Mechanism L397-406 specifies
`buildConfigMap()` flattening (`install_type → install.type`) as the in-memory plumbing parallel to
existing `pm_mode → pm.mode` handling; L385/L401 specify legacy manifest migration
(`install_type: "full"` default); L396-399 locks the naming convention (`install.type` dotted form as
config-map key, `install_type` snake as manifest field). Final naming coordination with ARCd Rebrand
WU remains a verify-during-implementation item.

**The consumer-enumeration question (hooks, workflows, agents read paths)** was answered implicitly
across findings but not in a single explicit paragraph. Migration adds a new "Consumer read paths"
prose block at the end of § Configuration Identity's resolved bullets, explicitly walking through all
four consumer categories: CLI reads manifest directly; hooks do not need `install.type` directly and
branch on other config keys with `arc_config_get`'s fallback handling missing sections cleanly;
workflows/agents do not read `install.type` at runtime because template render at install time
resolves mode-specific content (Mechanism B for session-lifecycle/process-task-loop, Mechanism A for
initial-setup); recipe condition evaluation happens in-memory at CLI time via `buildConfigMap()`.
Manifest-only storage is sufficient because the non-CLI consumers see `install.type` effects via
already-resolved config keys and pre-rendered file content rather than a direct read surface.

**Verification basis:** Full read of `.arc/system/githooks/pre-commit` (343 lines),
`.arc/system/githooks/commit-msg` (401 lines), and `.arc/system/scripts/arc-lib.sh` (78 lines, exposes
`arc_config_get` via grep/cut/sed on `.arc/system/arc-config.yml`). Hook behavior branches on
`branch.protection`, `team.mode`, `pm.mode`, `hooks.*` — none of which requires `install.type` visibility.
Missing sections in Lite's rendered `arc-config.yml` (PM/team blocks stripped) default to
Lite-appropriate values via `arc_config_get`'s second-argument fallback. Co-verified with A1.

**Migrated to plan doc:** ✅ "Consumer read paths" block inserted in § Configuration Identity (between
the three resolved bullets and the "Still open" subsection) 2026-04-13.

---

### Finding 12 — Initial-setup workflows (OQ15) · ✅

**Resolution (2026-04-13):** **Mechanism A** — purpose-built distinct files per mode. Full's
two-file pipeline (`01_verify-and-configure.md` + `02_define-project.md`) moves out of Finding #8's
implicit unconditional baseline into the `install.type == full` recipe bucket. Lite gets one
purpose-built file `01_setup-lite.md` under the `install.type == lite` bucket, collapsing 01's
and 02's Lite-relevant scopes into ~100-130 lines (Step 1 Verify Install, Step 2 Populate
Session-Loaded Docs, Step 3 Optional META-PRD, Step 4 Light Customization Awareness). Four gated
surfaces become zero gated surfaces in the Lite file because the file is purpose-built, not a
trimmed-down Full.

**First-cut lean → flip.** Initial lean (session opening) was Mechanism B (install-time stripped
template with inline `arc:if`), following Finding #4 and Finding #5 precedents and leveraging
the overlap-ratio heuristic from Finding #5 (higher overlap favors B more strongly). User
pushback reframed the question: "what does Lite actually NEED from these vs. don't" — the
ceremony-preservation framing of Mechanism B assumed the content was universal-enough to be
worth mirroring. Strip analysis surfaced that Lite retains only ~20-25% of 01 and ~45-55% of 02
— combined ~35-40% overlap. Below Finding #4's ~60% and well below Finding #5's ~85-90%. At this
overlap ratio, the heuristic **inverts**: B produces ugly files (60-75% content wrapped in
whole-section `arc:if` blocks, hard to read, hard to maintain), and A is structurally honest
about the different intent. Finding #2's precedent (`verify-work.md` / `verify-work-unit.md` —
two files under different recipe buckets when the Lite variant is genuinely different, not a
trimmed Full) applies directly.

**Opt-in Lite META-PRD absorbed as sub-decision.** User surfaced a second insight: the strip
analysis zeroed out META-PRD and TECHNICAL-OVERVIEW in Lite (Finding #8 L411 + "TECHNICAL-OVERVIEW
is orphaned without META-PRD"), but solo devs who want a high-level project doc otherwise create
ad-hoc notes files outside ARC's scaffolding. Offering an ARC-native opt-in surface that
graduation recognizes prevents that pattern without forcing ceremony on users who don't want it.
New `META-PRD.lite.template.md` combines product direction and technical overview content in a
single Lite-scoped ~80-120 line template. Opt-in via agent-led Step 3 in `01_setup-lite.md`
(rejected: install-time prompt — user doesn't know yet whether they want it; CLI flag — zero
discoverability). Not in any recipe bucket; opt-in installation is a separate CLI operation that
appends to the manifest. Lightly reopens Finding #8 L411 commitment: default Lite install still
has no META-PRD; opt-in path available. Graduation content migration via CLI + `switch-mode.md`
workflow split (Shape γ); CLI handles mechanical operations, agent handles judgment calls on
content reshape between Lite's combined shape and Full's two-file shape.

**`strategy-configurability-architecture` drift-check — 3-of-4 hit, audit promoted.** Targeted
drift-check surfaced two drift points: L87 Convention inventory Document hierarchy row
("META-PRD → PRD → tasks" as universal) — in-scope for #12/R6, fold-in as dual-value row;
L104 Context footer row ("Context: tasks-*.md (Task X.Y)" as tracked-mode specific) — out of
scope, deferred to future Local/Tracked axis work. Classification holds at applies-as-is
(single-row rewording, not a reclassification). Strategy count stays **4 / 4 / 2**. Drift-check
pattern across four targeted checks: #2 hit, #4 hit, #5 clean, #12 hit — 3-of-4 = ~75% hit
rate, above the 2-of-3 threshold from Finding #4's resolution criterion. **Promoted to formal
strategy audit pass in Tier 4** — single comprehensive sweep of all 10 framework strategies
before closing pre-PRD. Cheap insurance against missed surfaces that no single finding's
drift-check covers.

**Full FTL drift fold-in.** `01_verify-and-configure.md` L38 Verify Session State example block
still shows `**Following Task List**: No` — residual drift from Finding #4's uniform FTL
removal. Remove the line as part of Finding #12/R6's Full-side cleanup. Same block cut entirely
from Lite's `01_setup-lite.md`, so fix applies to Full only.

**Local/Tracked axis deferred.** OQ15's original phrasing covers both Lite/Full and Tracked/Local.
Finding #12/R6 scopes to `install.type` axis only — Local-axis content impact (exclusion
mechanism verification, backing store setup, Path 2 inapplicability, portability redirect) plus
the Local-axis config key naming/mechanism itself are deferred to future Local-axis work.
Working doc gate note (line 44) listed only #8 as a gate; this scoping matches.

**Session arc:** re-read Finding #12 + plan doc § Installation Type Recipe Mechanism §
Feedforward + § Strategy Applicability Mapping → code-read-first on `01_verify-and-configure.md`
(live + package source both plain `.md`, no template infrastructure) and `02_define-project.md`
(live plain, package source already `02_define-project.template.md` with three `pm.mode` gates)
→ initial lean Mechanism B following Finding #5 precedent + gate enumeration → **user pushback
on content-is-universal assumption** → section-by-section strip analysis revealed ~35-40%
combined overlap → mechanism flipped B → A based on overlap-ratio inversion and structural
distinction → user proposed optional Lite META-PRD combining product + technical content with
graduation content migration → absorbed as Finding #12/R6 sub-decision → drift-check on
`strategy-configurability-architecture` surfaced two drift points (L87 in-scope fold-in;
L104 deferred) → drift-check hit rate 3-of-4 prompted Tier 4 audit-pass promotion → consolidated
scope: #12/R6 folds in mechanism decision + opt-in META-PRD + drift fixes + audit promotion +
FTL drift fold-in → direct-to-plan-doc migration at ~240-line scale (eleventh consecutive
pre-PRD finding this way).

**Migrated to plan doc:** ✅ 2026-04-13. New § Lite Initial Setup subsection (~240 lines) between
§ Lite Process-Task-Loop and § Graduation / Downgrade Paths, parallel structure to § Lite
Session Management and § Lite Process-Task-Loop. Plus: § Installation Type Recipe Mechanism
§ Feedforward entry added for initial-setup workflows, META-PRD bucket assignment reframed to
note Lite opt-in variant. § The Lite PRD § SQ1 softened to "not installed by default; opt-in
available." § Strategy Applicability Mapping `strategy-configurability-architecture` row updated
with L87 drift fix note. § Follow-on implications expanded with Finding #12/R6 paragraph.
§ Graduation / Downgrade Paths gains META-PRD content migration paragraph. § Open Questions OQ15
marked resolved with scope note. Six new Resolved Decisions rows. Working doc Finding 12 →
✅ Resolved (this entry).

---

### Finding 14 — Shift-with-activation coordination · 🟢

**Original:** Workflow Shape says shift "hands off to activate-work-unit" — in-process invocation
or user-triggered? Atomicity? Half-state on failure?

**Insight (2026-04-10):** Shift has nowhere to go in Lite (single task list, no second WU). So
**shift lifecycle is Full-only**. The mode-awareness of the shift workflow is a trivial "skip
entirely in Lite" gate, not a mode-conditional workflow body. Simpler than initially framed.

**User position (2026-04-10):** Agreed shift doesn't apply in Lite. On the activate coordination
question specifically: leans toward workflow prompting the user after pause rather than
auto-handing-off to activate. "Hard to say without seeing how the skill/workflow ends up
finalizing."

**Outstanding analysis:**

- In-process invocation vs user-triggered for shift-with-activation:
    - **Auto-handoff:** shift executes pause, then internally invokes `activate-work-unit`
      against the target. Single atomic operation from user's POV. Failure mid-activation leaves
      half-state (paused but not activated).
    - **Prompt-after-pause:** shift executes pause, reports success, then prompts user "Next:
      activate {target}? (Y/n)". Two explicit steps. Clean failure boundary. Slightly chattier
      UX but avoids half-state.
    - User's lean is toward prompt-after-pause. Matches ARC's general "mandatory stops between
      operations" principle.
- If prompt-after-pause: does `/arc-shift feature-y` become a two-step conversation, or does it
  run both steps in sequence with an implicit stop between? Prefer the latter — user says "shift
  to feature-y" and the workflow walks both steps with one confirmation.
- Document in `shift-work-unit.md` as the authoritative transition protocol.

**Resolution (partial):** Shift lifecycle is Full-only; Lite skips it entirely. Remaining
question is coordination mechanism (auto-handoff vs prompt-after-pause) — user leans
prompt-after-pause; needs final commitment.

**Migrated to plan doc:** *pending*

---

### Finding 15 — Finding C (pause pointer fields) formalization · 🟢

**Original:** Plan says "independent doc sweep, not shift-blocking" — ambiguous whether in-scope
for modes WU.

**User decision (2026-04-10):** **In scope for modes WU.** "Not sure why this would be deferred,
that's just tech debt otherwise."

**Outstanding analysis:**

- Identify the four pointer fields: `Interrupts:` / `Paused:` / `Paused To:` / `Spawned:` — locate
  them in the current workflows/templates and confirm scope of the formalization sweep.
- Document the canonical form of each pointer field (syntax, when set, when cleared, where used).
- Update any workflow/strategy docs that reference them informally.

**Resolution:** In scope for modes WU. Proceed with formalization sweep as part of modes
implementation. Not shift-blocking but not deferred.

**Migrated to plan doc:** *pending*

---

### Finding 17 — Backing store sync protocol · 🟢

**Original:** "Auto-populated from `.arc/` on each handoff" stated; mechanism and firing policy
unspecified.

**User position (2026-04-10):** Once per session (handoff) is likely right. Can be more frequent
only if it's very fast, seamless, invisible to user. Lean: handoff only unless a concrete edge
case demands otherwise.

**Proposed shape (pending confirmation):** Backing store sync fires at session-handoff as the
canonical firing point. Mechanism needs selection.

**Outstanding analysis:**

- Mechanism candidates:
    - **`git add -A` + commit inside bare repo** — needs a working directory; awkward for a bare
      repo. Would need a non-bare `~/.arc-state/{project-id}/` working clone.
    - **`rsync --delete`** — fast, portable, but loses git history semantics (backing store
      becomes snapshots not commits).
    - **`git bundle`** — periodic bundle file generation; portable across machines for the
      opt-in remote sync but not a live-updated store.
    - **Non-bare clone + commit on each handoff** — `~/.arc-state/{project-id}/` is a normal git
      repo; on handoff, CLI copies `.arc/` contents, commits with an auto-generated message.
      Keeps full git history, supports remote push. Likely cleanest.
- Sync scope: does it copy the entire `.arc/`, or selective (exclude `reference/`, `system/`
  templates since they're framework-shipped)? Likely entire `.arc/` for simplicity — storage is
  cheap, partial sync is fragile.
- Failure handling: if backing store write fails, does handoff proceed or refuse?
- Additional firing points beyond handoff: should shift transitions also sync? Probably yes if
  sync is fast; parks a WU to durable storage before rotating focus.
- Resolving edge cases: crash between handoffs loses work; do we care?

**Resolution (partial):** Handoff is the primary firing point. Mechanism selection and edge-case
handling still open. Revisit during detail design.

**Migrated to plan doc:** *pending*

---

### Finding 18 — Project ID for zero-commit repos · 🟡

**Original:** Plan: "remote URL primary, first-commit hash fallback." Doesn't cover zero-commit
repos with no remote — exactly the Lite+Local "try ARC in five minutes" scenario.

**User position (2026-04-10):** Whatever's most seamless. No user prompting — "shouldn't be
something they have to think about."

**Outstanding analysis:**

- Third fallback candidates (all must be seamless):
    - **Directory path hash** — hash absolute path of the working tree. Stable across `arc`
      invocations in the same directory, but changes if the user `mv`s the directory.
    - **Generated UUID stored in `.arc/system/.internal/project-id`** — created on first
      `arc init --local`, read on subsequent runs. Survives moves. Lost on re-clone (but that's
      expected, and for zero-commit repos there's no clone to speak of).
    - **Composite** — try directory-path hash first; if `.arc/` doesn't exist at that hash's
      location when re-accessed, fall back to UUID. Complex.
- Graduation handling: what happens when the repo later gets a remote or a first commit? Does
  the project ID transition to the new primary mechanism, or stay on the fallback?
- Precedent: does any existing ARC CLI code store similar project-local identifiers?

**Resolution:** *pending*

**Migrated to plan doc:** *pending*

---

## Unvalidated Assumptions

### A1 — "Hooks (already local in nature)" in Local Unchanged list · ✅

**Finding:** Plan's Local mode Unchanged list says "Hooks (already local in nature)." Directly
contradicted by `analysis-conditional-content-architecture.md` § Local Mode: "Commit hooks — May
be absent or drastically simplified (no task list co-staging if `.arc/` isn't tracked). 3-5
shell conditionals or a mode-aware hook installation."

**Resolution (2026-04-13):** **Plan's claim is correct; analysis-file projection was wrong.** Full
read of `.arc/system/githooks/pre-commit` (343 lines), `.arc/system/githooks/commit-msg` (401 lines),
and `.arc/system/scripts/arc-lib.sh` (78 lines) confirms zero tracked-mode assumptions in hook logic.

**Read surfaces used by hooks (enumerated):**

- `.arc/system/arc-config.yml` via `arc_config_get()` (grep/cut/sed on a local file) — path-based,
  works identically under Local mode since `.arc/` stays in the working tree per Local mode design
- `git config arc.role` — local git config, not tracked state
- `git symbolic-ref --short HEAD` — branch name (local git)
- `git diff --cached --name-only` / `git show ":$file"` — staged index contents (operates on whatever
  git sees)
- `.arc/active/*/tasks-*.md` glob and `.arc/active/WORK-STATUS.md` path check — filesystem operations
  on local paths

**Local mode behavior:** Under `.git/info/exclude` exclusion of `.arc/`, staged-file scans
(`git diff --cached --name-only`) silently return empty for `.arc/*` paths because those files are
never staged in the first place. CHECK 7 (modified task lists staged), CHECK 8 (task numbering format),
CHECK 10 (WORK-STATUS co-staging), and CHECK 6 (contributor protected paths) degrade to vacuous no-ops
— silently correct behavior, not incorrect. CHECK 1 (branch protection via `branch.protection`),
CHECK 9 (meta-project refs in production code, which explicitly grep-excludes `^\.arc/`), and all
`commit-msg` checks (format, context footer, subject length, body length) operate identically
regardless of mode. Setup dependency `git config core.hooksPath .arc/system/githooks` is itself a
local git config, not tracked.

**Contradicted projection:** The analysis-file's "3-5 shell conditionals or mode-aware hook
installation" projection assumed the hooks would need Local-mode-specific branching. They do not.
The hooks need nothing — the graceful degradation of staged-file scans to vacuous no-ops under
untracked `.arc/` provides correct behavior with zero code changes. Plan doc L2753-2756 already
states this under Local Mode § Technical Approach; no additional plan-doc edit required beyond the
eventual phrasing sweep if Local Mode's Unchanged list wants an explicit "verified 2026-04-13"
provenance note.

**Co-verified with Finding #11** (same full-read pass covered arc-lib.sh's `arc_config_get` fallback
semantics, which are load-bearing for Lite's stripped-config degradation).

**Migrated to plan doc:** Not required. Plan doc wording is already accurate. Claim upgraded from
unvalidated to verified.

---

### A4 — Template `arc:if` mechanism not discussed · ✅

**Finding:** `analysis-conditional-content-architecture.md` projects "+4-8 template `arc:if`
blocks for Lite" but the plan doesn't discuss template-render conditionals at all. Either the
plan implicitly assumes template-variant files only (in which case the analysis's projection is
off), or the plan should acknowledge the template-render layer.

**Resolution (2026-04-13):** **Fully subsumed by Findings #4, #5, #10, and #12/R6.** The plan-doc
migration of those four findings not only acknowledges the template-render layer — it centers it as
the primary mechanism for content-level mode differentiation (Mechanism B) with explicit code-path
walkthroughs and composition analysis.

**Template pipeline references in the plan doc** (grep-verified 2026-04-13):

- **`needsRendering()`** at L1033, L1140, L1922, L2124, L2291, L2550, L3941 — confirmed as the
  `.template.*` extension-matching gate in `lib/classification.ts`.
- **`renderConditionals()`** at 13+ sites including L1019, L1039-1060 (direct read of
  `lib/template/render.ts`), L1129-1141 (composition order
  `renderConfigOverrides(renderConditionals(renderTokens(...)))`), L1731, L2125, L2171, L2292, L2551.
- **`toOutputPath()`** at L1035, L2126, L2551 — confirmed as the `.template` segment stripper.
- **Operator set and behavior verified** (`==`, `!=`, HTML-comment directives, YAML-safe blank-line
  collapse) at L1039-1060.

**Mechanism applications across findings:**

- **Finding #4** (session-lifecycle) chose Mechanism B — `.template.md` rename for `session-init.md`
  and `session-handoff.md`, 4 inline `arc:if` blocks in session-init.
- **Finding #5** (process-task-loop) chose Mechanism B — `3_process-task-loop.template.md` already on
  the template pipeline via pre-existing `team.mode`/`pm.mode` gates; Finding #5 adds `install.type`
  axis gates at 4 regions, composing orthogonally.
- **Finding #10** (arc-config.yml) chose Mechanism B — rename to `arc-config.template.yml`, 2
  contiguous `arc:if` blocks gating `pm.mode` and `team.mode` sections.
- **Finding #12/R6** (initial-setup) chose Mechanism A (purpose-built files in recipe buckets) based
  on overlap-ratio inversion at ~35-40% retention. Mechanism A composes orthogonally with Mechanism B
  — recipe buckets determine whole-file installation, template render determines within-file content
  gating; both mechanisms coexist without conflict.

**Three-way composition verified** at plan L2299-2300: `pm.mode` gates (pre-existing) + `team.mode`
gates (pre-existing) + `install.type` gates (new) compose on the same file in
`3_process-task-loop.template.md` without conflict or new code paths.

**Projected block count:** Analysis file's "+4-8 blocks" projection was conservatively low. Current
count across Findings #4/#5/#10 is ~10-11 blocks with multi-gate nesting — within the right order of
magnitude; upside variance came from Finding #5's process-task-loop having higher Lite/Full overlap
than the original analysis expected. Zero render-pipeline code changes required across all four
mechanism applications.

**Migrated to plan doc:** Not required. Plan doc already acknowledges and exercises the template
render layer extensively. Assumption upgraded from unvalidated to verified via code and plan
cross-reference.

---

## Scope Boundaries

### B1 — Content Audit sizing · 🔴

**Finding:** Plan § Content Audit says "audit all framework domains" — no file count, no
person-day estimate, no done definition. Combined with the separate phrasing sweep (also
unsized), these are two large content-touching passes on the tail of the WU. The plan's own
scope boundary note already anticipates scope escape.

**Outstanding analysis:**

- Rough file-count inventory: walk `.arc/reference/`, `.arc/system/workflows/`,
  `.arc/reference/constitution/` — estimate how many files each pass touches.
- Heuristic sizing per file (minutes of work) — small (trivial update), medium (moderate
  rewrite), large (significant restructure).
- Produce a rough estimate — multiply into a time budget. Frame as "implementation phase X of
  modes WU" with a realistic ceiling.
- Decide: are these two passes one phase or two? Can phrasing sweep follow audit without a
  hard separator?

**Resolution:** *pending*

**Migrated to plan doc:** *pending*

---

### B2 — Finding C pointer formalization boundary · 🟢

**Resolved by Finding 15.** In scope for modes WU.

---

### B3 — Full → Lite downgrade scope · 🟢

**Resolved by Finding 16, migrated 2026-04-11.** See [`plan-arc-modes.md`][plan-doc]
§ Graduation / Downgrade Paths. Supported via `arc mode switch --to lite` + advisory
workflow; descope guard retained but analysis did not surface material complexity.

---

### B4 — Absent consolidated deliverable inventory · ✅

**Finding:** Scanning the plan I count ~18–20 discrete deliverables (scope template, Lite/Local
config templates, two new workflows, two new skills, Lite session-init variant, Lite
process-task-loop variant, status header updates to lifecycle workflows, status vocab update to
task-list-formatting strategy, manifest schema extension, recipe schema extension, backing store
mechanism, re-clone detection, forbidden-combinations validation, content audit, phrasing sweep,
etc.). No consolidated list exists.

**Resolution (2026-04-13):** **Migrated to plan doc as new § Consolidated Deliverables Inventory.**
Final item count is **~56 deliverables**, meaningfully higher than B4's original ~18-20 estimate.
The gap is because Tier 1-3 resolution (especially Findings #8/#9/#10 recipe-authority mechanisms
and Finding #6 strategy applicability mapping) decomposed mechanism decisions into per-file,
per-surface work items that didn't appear in the original scan. Framework content files (workflow
`.template.md` renames, strategy classifications, skill surfaces, CLI command structures) that were
single line-items in B4's estimate became multi-item entries with explicit mechanism citations.

**Grouping:** 10 domains instead of B4's proposed 6 — CLI and schema, workflows (new), workflows
(modified), templates, config, strategies, skills, shift lifecycle, cross-cutting, ADRs, content
sweep. Adopted this structure because it surfaces implementation structure (which team/task
categories own which deliverables) rather than mode-ownership. B4's "Lite / Local / Shift /
Cross-cutting / CLI+manifest / Content sweep" structure would group by which mode introduces the
work, but that mode ownership is already captured per-item in the cross-references. The
implementation-structure grouping is more useful for PRD task generation.

**Sizing:** Intentionally out of scope for R4 per B4's own scope boundary. Content audit and
phrasing sweep sizing remain owned by Finding B1 above (unresolved, Tier 4 close-out item).

**ADR grouping decision absorbed as sub-resolution.** During R4 migration, decided pre-PRD on the
ADR grouping question that plan doc had been hedging ("likely combined … PRD decides based on
writing economy"). Committed to **two ADRs, not four**: ADR 1 umbrella covering Findings #8/#9/#10
mechanism siblings (with Findings #12/R6, #4, #5 as applied examples documented inline), ADR 2
separate for shift lifecycle. Motivation: committing pre-PRD avoids a second PRD-time design pass
and lets the PRD task structure pin down cleanly (two ADR tasks, not four). Plan doc Resolved
Decisions table updated accordingly — new "ADR grouping for modes WU deliverables" row added,
L4400 "ADR authoring for Framing C" and L4410 "ADR authoring for Lite config template mechanism"
updated to point at the committed grouping, L4357 "ADR authoring for integrate × shift states"
drift fix (previously cross-referenced Findings #8/#9/#10 which was semantic drift — shift
lifecycle is separate from recipe-authority).

**New reasoning pattern surfaced — first occurrence, watch for second:** *"lift a PRD-deferred
design question back into pre-PRD when an adjacent work item's migration makes the cost of
leaving it deferred higher than the cost of resolving it now."* In this case: R4 inventory
migration surfaced four ADR deliverables, and resolving the grouping question during inventory
authoring was trivial (one decision pass) while leaving it to PRD time would have forced the PRD
to rewrite the inventory's ADR section. Similar patterns may exist in Tier 4 (formal strategy
audit pass — may surface drift questions that fold into the audit rather than deferring).

**Migrated to plan doc:** ✅ New § Consolidated Deliverables Inventory inserted between § Content
Audit and § Resolved Decisions 2026-04-13. Resolved Decisions table updated with the committed ADR
grouping row and R4 migration row.

---

## Structural Recommendations

(These are the "Next" recommendations from the original synthesis. They feed directly into
making the plan formalization-ready.)

### R1 — Resolve recipe architecture · 🟡

Same as Finding #8. Tracking there.

### R2 — Fix unvalidated claims · 🟡

Same as A1, A2, A3. Tracking there.

### R3 — Sketch Lite concrete surface · 🟡

Addresses Findings #1, #2, #3, #4, #5, #6. Tracking as those individual findings.

### R4 — Consolidated deliverables inventory · 🟡

Same as B4. Tracking there.

### R5 — Walk missing shift scenarios · 🟡

**Finding:** Two missing scenarios: integrate-work-unit on a paused/waiting-for WU (Finding #13,
resolved and migrated 2026-04-10), and shift-with-activation end-to-end (Finding #14, tracked).

**Resolution:** Finding #13 resolved (see [`plan-arc-modes.md`][plan-doc] § Integration
Interaction with Shift States). Finding #14 still tracked.

### R6 — Resolve OQ15 (initial-setup workflows) · 🟡

Same as Finding #12. Tracking there.

### R7 — Backing store sync protocol paragraph · 🟡

Same as Finding #17. Tracking there.

### R8 — Zero-commit Local init · 🟡

Same as Finding #18. Tracking there.

---

[plan-doc]: plan-arc-modes.md
