# Task List: Work Organization Reform

- **PRD:** `prd-work-organization-reform.md`
- **Branch(es):** `technical/plan-work-organization-reform`
- **Base Branch:** `main`

- **Purpose:** Rebuild ARC's WU lifecycle foundation around single-branch-per-WU, sweep-as-you-go integration,
  Conventional Branch alignment, meta-file evolution, and aligned commit conventions — delivering per-worktree
  isolation as the precondition for the parallelism trio.

---

## **Phase 1:** Constitutional foundation

_Purpose:_ Ship the ADR + constitution edits that gate convention work in P2-P6. Vocabulary codification,
capture-routing constitutionalization, atomic-tier infra-edit smell flag.

_Design decisions:_ Branch / archival / capture conventions deliberately route to strategy docs (P2), not
DEV-RULES.ARC — strategies carry the convention surface; rules carry discipline. Vocabulary edit lands in
`AGENT-BRIEF.ARC.md` § Vocabulary (existing section; orientation layer) rather than DEV-RULES.ARC, per R23's
permissive `OR` clause. See `notes-work-organization-reform.md` § Work-unit-as-wrapper for the split rationale.

### `[ ]` **1.1 Author companion ADR for WOR constitutional shift**

- _Goal:_ The constitutional shift lands as a single ADR (parallel scale to ADR-016) — single-branch-per-WU,
  CB alignment + planning-PR retirement, meta-file rename + field codification, and commit-convention reform +
  CB-CC alignment rationale captured for future readers.

    **Strategies:** `strategy-adr-methodology.md`

    - `[ ]` **1.1.a Determine ADR number and create file from `template-adr.md`**
        - Next available number per `.arc/reference/adr/` listing — currently `adr-019`.
        - Title pattern parallels ADR-016 (`adr-016-configurable-autonomy-interlocks-for-session-operations.md`):
          something like `adr-019-single-branch-per-wu-and-conventional-branch-alignment.md`.
        - _Note:_ Example title elides meta-file rename + commit-convention reform — illustrative only;
          final title decision belongs to the ADR author, reflecting all four surfaces 1.1.b enumerates.

    - `[ ]` **1.1.b Document the four constitutional surfaces with decision rationale**
        - Single-branch-per-WU (replaces two-PR planning model).
        - CB core-6 alignment (`feat/ | fix/ | chore/ | docs/ | refactor/ | perf/`) plus `plan/<name>` for
          planning state; intentional divergence from CC types `test` and `revert`.
        - Meta-file evolution (`status-*.md` → `meta-*.md`; field codification: State / Owner / Depends On
          / Origin / Cohort; archive-phase sections replacing `completion-*.md`).
        - Commit-convention reform (CC type set tightened to 8; `arc` scope denylist; `docs` discipline).

    - `[ ]` **1.1.c Capture alternatives considered**
        - Reference `notes-work-organization-reform.md` § Design Decisions; condense per ADR conventions
          rather than duplicate. Three load-bearing rejections: meta file in `backlog/` during planning;
          meta file gitignored; two-branch model with delayed planning-merge.

### `[ ]` **1.2 Extend `AGENT-BRIEF.ARC.md` § Vocabulary (WU-as-wrapper + atomic-as-character)**

- _Goal:_ `AGENT-BRIEF.ARC.md` § Vocabulary makes the wrapper-vs-character split first-class — work unit is
  the wrapper noun (any bounded chunk with branch/status/PR; invariant across tiers); atomic is the work
  character (single-bounded, indivisible, no internal stages; applies to items, tasks, WUs). Inboxes
  distinguish by character, not by wrapper presence.

    - Update existing Work unit and Atomic definitions to match R23's wording.
    - DEV-RULES.ARC references existing terms but doesn't redefine them — no DEV-RULES edit needed for this.

### `[ ]` **1.3 Constitutionalize capture-routing in DEV-RULES.ARC § Leave it cleaner**

- _Goal:_ DEV-RULES.ARC § Leave it cleaner table reflects the new four-surface capture model + the
  ceremony-only-write discipline for shared inboxes — the routing rule becomes constitutional, with
  `DEV-RULES.PROJECT.md § Capture Routing` collapsing to a thin redirect.

    - `[ ]` **1.3.a Update destinations in the routing table for the four-surface model**
        - `user/{identity}/ATOMIC-INBOX.md` → `user/{identity}/USER-INBOX.md` (§ Atomic | § Backlog at
          drain time).
        - "Appropriate backlog file" → `backlog/BACKLOG-INBOX.md` for multi-step, or
          `backlog/{planned,provisional}/<wu-name>/` per-WU subdir when matured.
        - Add explicit row for the project-shared atomic surface (`backlog/ATOMIC-INBOX.md`).

    - `[ ]` **1.3.b Add ceremony-only-write rule for shared inboxes (R20 — discipline portion)**
        - Sub-rule: writes to project-shared inboxes (`backlog/ATOMIC-INBOX.md`, `backlog/BACKLOG-INBOX.md`)
          fire only at lifecycle ceremonies (activation absorption, integration drain, planning-kickoff
          promotion). Outside these moments, shared inboxes are read-only by convention.
        - Personal `user/{identity}/USER-INBOX.md` writes anytime (per-user; no concurrency concern).
        - _Note:_ `backlog/ATOMIC-INBOX.md` and `backlog/BACKLOG-INBOX.md` don't exist on disk until
          Phase 6.4 migration. Constitutional rule lands here and activates at 6.4 landing — intentional
          forward reference.

    - `[ ]` **1.3.c Verify `DEV-RULES.PROJECT.md § Capture Routing` redirect remains aligned**
        - Section is already a thin redirect to `DEV-RULES.ARC § Leave it cleaner` (4 lines, no local
          table). Confirm the link target is still correct after 1.3.a's table edits.
        - Per R24 ("Project-specific routing overrides remain in `DEV-RULES.PROJECT.md` if needed"):
          add a stub overrides clause if desired; otherwise leave as-is.

### `[ ]` **1.4 Add atomic-tier infra-edit smell flag to DEV-RULES.ARC**

- _Goal:_ A documentation-only smell flag in DEV-RULES.ARC § Task Execution (Task granularity neighborhood)
  flags atomic-tier work touching load-bearing infra (`.arc/system/`, `.arc/reference/strategies/`,
  `arc-config.yml`) as warranting quick-tier at minimum — multi-commit coordination, deliberate sequencing.

- _Note:_ Companion-note destination is contingent on Agile WU Lifecycle (AWL) work. At execution, check
  whether AWL's tier-scaling guidance has landed in `strategy-work-organization.md` or another doc. If AWL
  hasn't landed yet, defer the companion note rather than seed tier-scaling content in WOR scope.

    - Atomic-tier items routed to ATOMIC-INBOX surfaces still apply the flag at drain time, not at capture.
    - Companion note in `strategy-work-organization.md` (or wherever tier scaling ultimately lands per AWL)
      cross-references the constitutional flag.

## **Phase 2:** Strategy and convention codification

_Purpose:_ Codify single-branch-per-WU, CB-CC alignment, archival + sweep-as-you-go, per-worktree isolation
invariant, ROADMAP rendered-view algorithm, capture pipeline, and convention inventory across strategy docs.

_Design decisions:_ Capture-pipeline content (R19-R22) lands in `strategy-planning-module.md` since it covers
backlog organization + routing (arc-in-git PM mode territory). Per-worktree isolation invariant (R15) lives in
`strategy-work-organization.md`. Cross-references bridge.

### `[ ]` **2.1 `strategy-work-organization.md` § Branching — single-branch-per-WU + CB-CC alignment**

- _Goal:_ `strategy-work-organization.md` § Branching codifies the CB core-6 type set, the `plan/<name>`
  rotation pattern, the single-branch-per-WU model, and the CB-CC alignment rationale (intentional
  divergence on `test` / `revert`) — all subsequent boundary-workflow rewrites reference this section.

- _Context:_ Existing file has § Branching as a subsection under § Incidental Work Model (line ~166).
  The CB core-6 + single-branch-per-WU content is general, not incidental-specific. Elevate § Branching
  to top-level (default), reshaping incidental-specific content into a child subsection. Decide final
  shape at execution.

    - `[ ]` **2.1.a CB core-6 type set enumeration**
        - `feat/ | fix/ | chore/ | docs/ | refactor/ | perf/`; contested types (`test/`, `style/`, `build/`,
          `ci/`) treated as adopter-extension territory, not in ARC's canonical set.

    - `[ ]` **2.1.b `plan/<name>` rotation pattern**
        - Planning branches use `plan/<name>` prefix; rotate to `<type>/<name>` at activation via local
          rename + remote replace (3-step routing in `activate-work-unit.md`).

    - `[ ]` **2.1.c Single-branch-per-WU model**
        - One WU = one branch from planning through integration; merges to main exactly once at integration.
          WU artifacts (`meta-*.md`, `plan-*.md`, `prd-*.md`, `tasks-*.md`, companions) live in `active/` on
          the WU branch through entire lifecycle; main carries no in-flight WU artifacts.

    - `[ ]` **2.1.d CB-CC alignment rationale + intentional divergence**
        - CB core-6 omits `test` and `revert` deliberately per CB spec's cognitive-load rationale (tests not
          branched separately; reverts produce conventional commit shape but not branch shape). Document the
          divergence as intentional, not oversight.

### `[ ]` **2.2 `strategy-work-organization.md` § Per-Worktree Isolation invariant**

- _Goal:_ A new Per-Worktree Isolation section in `strategy-work-organization.md` states the invariant —
  each worktree's `active/` contains only its own WU's meta file, because no other branch's meta file is
  reachable from main — and explains why it's load-bearing for the parallelism trio.

- _Note:_ The acceptance test below is enforceable only after Worktree Foundation WU ships. WOR codifies
  the invariant as precondition for the parallelism trio; strategy section describes the test without
  running it.

    - Brief acceptance-test description: spawn worktree from main, assert `active/` empty except for the
      WU's own meta file.

### `[ ]` **2.3 `strategy-work-organization.md` § Archival — sweep-as-you-go + archive shape + tier-boundary note**

- _Goal:_ `strategy-work-organization.md` § Archival codifies sweep-as-you-go as default integration shape
  with the new archive path (`archive/<dated>/{wu-name}/`); states tier-aware sweep ceremony as AWL scope;
  locks forward-only migration; documents the backward-compat tooling contract for downstream consumers.

- _Context:_ Existing file has § Archive as a subsection under § Directory Structure (line ~367), not a
  top-level § Archival. Elevate to top-level § Archival (default), absorbing the existing subsection
  content; or extend in place if the subsection placement reads more naturally. Decide at execution.

    - `[ ]` **2.3.a Sweep-as-you-go default codification**
        - Default `archive.cadence: with-integration` — integration PR includes sweep commits; meta file
          moves to archive in the same PR. `deferred` and `manual` available for adopters who want them.

    - `[ ]` **2.3.b New archive shape (`archive/<dated>/{wu-name}/`; drop `{category}/`)**
        - Symmetric with backlog's group-dir collapse; temporal grouping (`2026-q*`) retained.

    - `[ ]` **2.3.c Tier-boundary note (forward-pointer to AWL / CWC)**
        - One sentence: tier-aware sweep ceremony (atomic / quick / standard scaling) is AWL scope;
          async-merge accommodation is CWC scope; WOR ships tier-agnostic foundation + sync-merge primary
          flow.

    - `[ ]` **2.3.d Forward-only migration discipline**
        - Historical archive (`archive/2026-q*/{category}/`) is read-only — retains categorical layout,
          `status-*` / `completion-*` filenames, uncodified field values. No retroactive content rewriting.

    - `[ ]` **2.3.e Backward-compat tooling contract**
        - Anything reading the archive (renderer, future CLI, search / audit) must handle both legacy shape
          (`archive/2026-q*/{category}/status-*.md`) and new shape (`archive/<dated>/{wu-name}/meta-*.md`).

### `[ ]` **2.4 `strategy-work-organization.md` § ROADMAP rendered-view (algorithm + regeneration fire-points)**

- _Goal:_ `strategy-work-organization.md` § ROADMAP codifies meta-file-as-source-of-truth + the render
  algorithm + ceremony-coupled regeneration fire-points + interim hand-maintenance discipline (pre-CLI).

    - `[ ]` **2.4.a Source-of-truth shift**
        - ROADMAP.md becomes a generated artifact rendered from `active/**` and `backlog/planned/**`
          meta-files. Source of truth = meta files (`**State:**`, `**Owner:**`, `**Depends On:**`). ROADMAP
          header carries "Generated by `arc roadmap render` — do not edit by hand" note + last-rendered
          commit hash.
        - _Note:_ This describes the end-state header (post-CLI); 2.4.d describes the interim
          hand-maintenance shape. Strategy section must distinguish — current ROADMAP can't truthfully
          carry "do not edit by hand" until `arc roadmap render` ships.

    - `[ ]` **2.4.b Render algorithm (6 steps)**
        - Walk `active/**` and `backlog/planned/**` for `meta-*.md` files (recursive glob handles
          both standalone `<wu-name>/` and cohort-wrapped `<cohort>/<wu-name>/` subdirs); parse
          fields; topologically sort by Depends On; group into tiers (In Flight / Foundation /
          Tier 2+ / Independent Tracks); render markdown per tier; footer pointing to `provisional/`.

    - `[ ]` **2.4.c Regeneration fire-points**
        - WU graduation (`provisional/` → `planned/`); WU activation (`planned/` → `active/`); WU
          integration (`active/` → archive); dep-field edit on any planned / active meta file. Each
          ceremony workflow includes a regenerate-ROADMAP step.

    - `[ ]` **2.4.d Interim hand-maintenance discipline (pre-CLI)**
        - Until `arc roadmap render` ships (deferred to downstream WU), maintain ROADMAP by hand per the
          documented algorithm. Header note explicit about this transitional state.

### `[ ]` **2.5 `strategy-planning-module.md` capture pipeline reform**

- _Goal:_ `strategy-planning-module.md` codifies the four-surface capture model (per-user USER-INBOX,
  project-shared ATOMIC-INBOX + BACKLOG-INBOX, per-WU subdirs under `backlog/{planned,provisional}/`),
  ceremony-only writes to shared inboxes (operational restatement of DEV-RULES.ARC's constitutional
  rule), state-dir graduation semantics, and the cohort wrapper subdir convention (backlog-only,
  codified-cohorts only).

    - `[ ]` **2.5.a Four-surface model description**
        - `user/{identity}/USER-INBOX.md` (per-user, gitignored, notes-synced; § Atomic / § Backlog).
        - `backlog/ATOMIC-INBOX.md` (project-shared, tracked; atomic-character entries).
        - `backlog/BACKLOG-INBOX.md` (project-shared, tracked; multi-step entries).
        - `backlog/{planned,provisional}/<wu-name>/` (per-WU subdirs; carry `meta-<name>.md` always
          plus `plan-<name>.md` and other companions when present).

    - `[ ]` **2.5.b Ceremony-only writes operational restatement**
        - Activation absorption / integration drain / planning-kickoff promotion fire-points; outside
          these, shared inboxes are read-only by convention. Absorbed entries deleted, not marked —
          routing record lives in deletion commit message + absorbing artifact.
        - _Note:_ Verify current `user/{identity}/ATOMIC-INBOX.md` convention before codifying "deleted,
          not marked." If today's behavior marks (strikethrough, `[absorbed]` tag, etc.), the rule is a
          behavioral shift requiring migration treatment in Phase 6.4, not documentation-only.

    - `[ ]` **2.5.c State-dir graduation semantics**
        - `backlog/provisional/<wu-name>/` → `backlog/planned/<wu-name>/` fires when WU added to
          ROADMAP (`git mv` of the WU subdir rides the same commit as the ROADMAP entry);
          symmetric demotion supported.

    - `[ ]` **2.5.d Cohort wrapper subdir convention (backlog-only, codified-cohorts only)**
        - `backlog/{state}/<cohort>/<wu-name>/` for codified sibling sets (e.g., parallelism-trio);
          standalone WUs sit directly at `backlog/{state}/<wu-name>/`. `active/` stays flat
          (cohort membership tracked via `**Cohort:**` field on the meta file). Cohort membership
          is state-uniform (all members in same state-dir).

### `[ ]` **2.6 `strategy-configurability-architecture.md` — inventory + extension naming + reserved names**

- _Goal:_ `strategy-configurability-architecture.md` carries (a) the planning-checkpoint review
  convention-inventory entry per the `review.pre_merge` precedent, (b) the extension fire-point
  naming convention codification, and (c) the reserved-for-future extension names registry.

    - `[ ]` **2.6.a Convention inventory entry: planning-checkpoint review**
        - "Planning checkpoint review | P2/P4 | No checkpoint stop | Config setting + Extension."
          Mirrors `review.pre_merge` shape.

    - `[ ]` **2.6.b Extension fire-point naming convention**
        - Pattern: `{pre|post}-{lifecycle-event-name}` where event-name is the next concrete workflow
          step or git operation; event-names must reflect the actual local fire-point, not an upstream
          UI-level event; frequency must be wireable to match the name's semantic (if
          `pre-commit-review`, then every commit pathway).
        - _Note:_ The `{pre|post}-{event}` pattern reflects current practice — `.arc/system/extensions/`
          already ships both families (`pre-*` and `post-*`, e.g., `post-task-completion`,
          `post-work-unit-archive`). R55 codifies existing convention, not new extensibility framing.

    - `[ ]` **2.6.c Reserved-for-future names registry**
        - Document `pre-push-review` as reserved (ships as no-default no-op file); future entries
          listed here keep the namespace coherent.

    - `[ ]` **2.6.d Family enumeration table**
        - Table mirroring PRD R56: extension → fire-point → wired-into → default. Adopters reading
          the strategy doc see the full family in one place.

### `[ ]` **2.7 `strategy-work-organization.md` § Spec-Flow Invariants**

- _Goal:_ A new § Spec-Flow Invariants section in `strategy-work-organization.md` codifies the
  three invariants WOR lands (`meta-*` always exists; task list structure invariant; parseable
  spec exists in some form before tasks) and the two scaling axes governing optionality above
  them (mode: Lite/Full + `pm.mode`; tier: atomic/quick/standard per AWL). Explicitly defers
  the spec-flow contract (which spec form applies per mode × tier; `plan-*` required vs
  optional; verification model under tier collapse) to arc-plan Conductor + AWL. Establishes
  the interface those downstream WUs consume.

- _Context:_ This section is the load-bearing anchor for the WOR scope-expansion items (PRD
  R22a / R22b / R22c). Without it, AWL and conductor have no codified anchor to land their
  contract on top of; with it, they pick up the invariants and fill in the policy.

- _Placement:_ Section ordering decided at execution. Candidate placements within
  `strategy-work-organization.md`: after § Work Unit State (sibling-level meta-concern), after
  § Planning Module (planning-pipeline-adjacent), or new top-level section before
  § Team Coordination.

    - `[ ]` **2.7.a Three invariants codification**
        - `meta-*` always exists across entire WU lifecycle (PRD R22a) — created at WU stub
          creation; persists through state transitions; single source of truth for state /
          owner / dependencies / cohort / spec pointer.
        - Task list structural invariance — phase headings, leaf task format, completion
          markers, Success Criteria section. Tier-aware ceremony (atomic / quick / standard
          scaling) is AWL scope; the structural shape stays uniform.
        - A parseable spec exists in some form before task-list generation — form varies by
          mode × tier; existence does not.

    - `[ ]` **2.7.b Two scaling axes (mode + tier)**
        - **Mode axis** — Lite vs Full ARC; `pm.mode: arc-in-git` vs `none`. Different artifact
          sets per mode. Section lists known modes with status (Full + arc-in-git shipping;
          others per `plan-arc-modes.md`; conceptual `pm.layer` collapse framing landed in
          PRD R12, with the actual value-set change shipping in `plan-arc-modes.md` scope).
        - **Tier axis** — atomic / quick / standard per AWL's current lean
          (`technical/plan-agile-wu-lifecycle.md`). Each tier carries different artifact
          requirements; strategy section flags the axis but routes the per-tier contract to
          AWL rather than codifying tier shapes itself (AWL's per-tier design may still
          iterate before its own PRD lands).

    - `[ ]` **2.7.c Spec-flow contract deferral (explicit)**
        - State that the optionality contract (which spec form applies under which mode × tier
          combination) lives in arc-plan Conductor + AWL — NOT WOR. WOR ships invariants +
          scaling hooks; downstream WUs land the policy.
        - Forward-pointer to `feature/plan-arc-plan-conductor.md` and
          `technical/plan-agile-wu-lifecycle.md`.

    - `[ ]` **2.7.d Escape-hatch guardrail framing**
        - Note that tier classification (AWL) carries the discipline mechanism — one-way
          promotion (atomic → quick → standard easy; demotion hard); explicit `--tier atomic`
          opt-in (default `quick`); conductor's escalation-suggestion behavior on novelty cues;
          tier-invariant disciplines (process-task-loop, quality gates, commit discipline).
          WOR preserves the structural cuts; AWL + conductor enforce policy.

## **Phase 3:** Boundary workflow restructure + ceremony fire-points

_Purpose:_ Restructure activate / integrate / archive workflows for single-branch-per-WU; wire META-PRD
alignment, ROADMAP regeneration, capture-pipeline ceremony writes (absorption / drain / promotion), config
keys, and the new extension point.

_Design decisions:_ Capture-pipeline ceremony writes (R20, R21) fold into each affected workflow rather than
a horizontal cross-cutting parent — workflow-level units stay coherent. R53 inline-fold audits stay one
parent with five subtasks per § Inline-folds scope discipline. `integrate-work-unit.md` owns composition
(R14, R30, R31) regardless of cadence; `archive-work-unit.md` owns archival mechanics (state flip + sweep +
ROADMAP regen) as a cadence-invariant single source of truth — DRY across cadences. Cadence dispatch lives
in integrate (3.4.g), not archive. Within-phase ordering: 3.7 (config keys) ideally lands before 3.3 / 3.5
runtime verification — workflow text can forward-reference, but runtime checks of `review.planning_checkpoint`
halt and `archive.cadence` dispatch need both present.

### `[ ]` **3.1 Retire `integrate-planning-branch.md`**

- _Goal:_ `integrate-planning-branch.md` is deleted; the workflow no longer exists in the ARC surface —
  single-branch-per-WU eliminates the separate planning-PR concept entirely. Cross-reference updates ride
  the migration sweep (6.8).

    - `git rm .arc/system/workflows/arc/work-unit-lifecycle/planning/integrate-planning-branch.md` plus the
      `packages/` counterpart.

### `[ ]` **3.2 Rename `activate-planning-branch.md` → `init-work-unit.md` (WU + meta-file creation)**

- _Goal:_ `init-work-unit.md` (renamed from `activate-planning-branch.md`) creates a WU on a `plan/<name>`
  branch with a meta file populated from `template-meta.md` — initial `**State:** Planning`, `**Owner:**`
  auto-populated from `arc.identity` via template placeholder, other fields defaulted per template.

    **Strategies:** `strategy-work-organization.md`

    - `[ ]` **3.2.a Rename file + sync to packages/**
        - `git mv .arc/system/workflows/arc/work-unit-lifecycle/planning/activate-planning-branch.md
          .arc/system/workflows/arc/work-unit-lifecycle/planning/init-work-unit.md` plus packages/
          counterpart.

    - `[ ]` **3.2.b Responsibility shift: WU + meta-file creation**
        - Steps: create `plan/<name>` branch; create `meta-{name}.md` in `active/` from `template-meta`;
          fill placeholders (`[arc.identity]` → identity value); commit. Plan-doc creation is a
          subsequent step (existing workflow logic; preserve).

    - `[ ]` **3.2.c Wire `template-meta.md` reference (created in 4.1)**
        - Reference template path is stable; body draft works without 4.1 complete. If 4.1 lands in a
          parallel session, no rework needed here.

### `[ ]` **3.3 Restructure `activate-work-unit.md` (state-flip + branch rename + absorption-write + ROADMAP regen)**

- _Goal:_ `activate-work-unit.md` transitions a WU from Planning to Active via in-place state-flip + branch
  rename + absorption-write + ROADMAP regen + supplementary META-PRD alignment check — no new branch
  creation, no directory move.

    - _Approach:_ Three-step branch rename routing per § Technical Considerations — raw local rename
      (`git branch -m`), class-tagged push (`workflowPush`), raw destructive delete (`git push --delete`).
      Pre-condition gate at top verifies running on `plan/<name>` before any step fires.

    **Strategies:** `strategy-work-organization.md`

    - `[ ]` **3.3.a Pre-condition check + `[!NOTE]` redirect block**
        - Verify on `plan/<name>` branch with `**State:** Planning`; if WU doesn't exist (no `plan/<name>`,
          no `meta-{name}.md`), `[!NOTE]` block at top redirects to `init-work-unit.md`.

    - `[ ]` **3.3.b Pre-execution-graduation extension fire (R47)**
        - Extension defined in 3.8; this step is the fire-point reference. Halt-on-fail with
          surface-for-user; user can fix-and-retry or explicit-invoke bypass.

    - `[ ]` **3.3.c `review.planning_checkpoint` halt (R46)**
        - When `required`: workflow halts here, awaits explicit approval. When `disabled`: no halt.
          Per R47, independent of extension fire — extension runs first; if it passes, config decides.

    - `[ ]` **3.3.d META-PRD supplementary check (R34 — conditional)**
        - Sub-bullet within existing review step; fires only when META-PRD edited since PRD approved.
          Soft check; rarely blocks.

    - `[ ]` **3.3.e State-flip + plan-doc removal**
        - Edit meta file: `**State:** Planning` → `**State:** Active`. `git rm plan-{name}.md` if present
          (graduated content is in PRD by now).

    - `[ ]` **3.3.f Branch rename: 3-step routing (R2)**
        - Step 1 (raw): `git branch -m plan/<name> <type>/<name>`.
        - Step 2 (`workflowPush`): `git push -u origin <type>/<name>` — class-tagged for release-wrapper
          routing per DEV-RULES.ARC § Workflow class-tag routing.
        - Step 3 (raw): `git push origin --delete plan/<name>` — destructive flag stays literal; wrapper
          refuses `--delete` by design.

    - `[ ]` **3.3.g Absorption write (R20, R21)**
        - If activation absorbs queued inbox entries (USER-INBOX or shared inboxes) into the WU's task list
          or planning surface, finalize absorption commits here. Deletion from inbox rides the absorbing
          commit; routing recorded in commit message.

    - `[ ]` **3.3.h Regenerate ROADMAP (R39)**
        - Hand-maintain (interim, pre-CLI) per algorithm in 2.4. Commit ROADMAP update separately or ride
          the state-flip commit per atomicity discipline.
        - _Note:_ Atomicity (DEV-RULES.ARC § Atomicity, "one logical change per commit") treats state-flip
          and ROADMAP regen as distinct logical changes. Default recommendation: separate commit. Riding
          the state-flip commit is acceptable only if the ROADMAP edit is trivial (e.g., single tier-line
          move).

### `[ ]` **3.4 Restructure `integrate-work-unit.md` (sweep + composition + Release Notes Entry + ROADMAP regen)**

- _Goal:_ `integrate-work-unit.md` ships the single merge-to-main moment under default
  `archive.cadence: with-integration` — code commits + completion-content commits (Release Notes Entry +
  Completion Notes composed into meta file's archive-phase sections) + sweep commits (meta file moves to
  `archive/<dated>/{wu-name}/`) — all in one multi-commit PR.

    - _Approach:_ Three-commit structure per § Technical Considerations — code → completion content → sweep.
      Reviewers focus per-commit. Under `archive.cadence: deferred`, completion + sweep defer to
      `archive-work-unit.md`; this workflow's behavior conditions on cadence.

    **Strategies:** `strategy-work-organization.md`

    - `[ ]` **3.4.a Pre-conditions + State transition (Active → Integrating)**
        - Verify on WU branch; verify `**State:** Active`; flip to `**State:** Integrating` (R31
          fire-point under with-integration).

    - `[ ]` **3.4.b Release Notes Entry composition (R14, R30)**
        - Compose user-facing entry into meta file's archive-phase section. Categories: Added | Changed |
          Removed | Fixed | Infrastructure | Deprecated | Security (Keep a Changelog 7-category set).
          One-paragraph summary; optional Breaking Changes callout.

    - `[ ]` **3.4.c Completion Notes composition (R14)**
        - Narrative summary into meta file's Completion Notes section.

    - `[ ]` **3.4.d META-PRD final flag check (R34 — sub-bullet)**
        - Soft check; rarely blocks if 1_create-prd's check passed. Surface any conflicts discovered during
          execution.

    - `[ ]` **3.4.e Commit completion content**
        - Class-tagged `workflowCommit` if release-wrappers active; carries Release Notes Entry +
          Completion Notes additions.

    - `[ ]` **3.4.f Drain-write (R20, R21)**
        - If integration drains any shared inbox entries (entries that were absorbed into this WU's scope
          and need final deletion from the shared inbox), finalize deletions here. Rides with the
          completion-content commit or as separate commit per atomicity.

    - `[ ]` **3.4.g Cadence dispatch — invoke `archive-work-unit.md` inline under `with-integration`**
        - Read `archive.cadence` from `arc-config.yml`.
        - `with-integration` (default): invoke `archive-work-unit.md` inline at this point. archive-work-unit
          handles state flip `Integrating → Shipped`, sweep commits, and ROADMAP regen per its
          cadence-invariant body (3.5). Returns; resume here with PR creation.
        - `deferred` | `manual`: skip inline invocation; surface a note at workflow exit that archive runs
          separately post-merge per user invocation.

    - `[ ]` **3.4.h PR creation + workflow-interlock**
        - Single PR (no `[PLAN]:` prefix retired per R6). Multi-commit structure preserved for per-commit
          review.

    - `[ ]` **3.4.i Pre-merge-review extension fire (R56)**
        - Post-review-response, pre-merge fire-point. Extension defined in 3.8; this step is the
          fire-point reference. Sits between `review-response` (plan-review-method-family scope) and
          the actual merge action; halt-on-fail surfaces actionable message. Default-inactive
          extension; this wiring is structural even when extension is off.

### `[ ]` **3.5 Restructure `archive-work-unit.md` (single source of truth for archival mechanics; cadence-invariant body)**

- _Goal:_ `archive-work-unit.md` carries the archival mechanics — state flip `Integrating → Shipped`, sweep
  commits, ROADMAP regen, post-Shipped errata convention. Invariant body regardless of invocation context:
  invoked inline from `integrate-work-unit.md` under `with-integration` cadence (via 3.4.g), or standalone
  post-merge under `deferred` / `manual`.

- _Approach:_ DRY — composition stays in integrate per R31; archive owns archival mechanics. Cadence
  dispatch lives in integrate (3.4.g), not here. The workflow's pre-condition gate verifies state is already
  `Integrating`; composition must have happened upstream.

    **Strategies:** `strategy-work-organization.md`

    - `[ ]` **3.5.a Pre-condition check (state `Integrating`)**
        - Verify meta file shows `**State:** Integrating`. Halt with surface if not — upstream composition
          (in `integrate-work-unit.md`) is the prerequisite.

    - `[ ]` **3.5.b State flip `Integrating → Shipped`**
        - Edit meta file: `**State:** Integrating` → `**State:** Shipped`. Single direction; always.

    - `[ ]` **3.5.c Sweep commits (R5, R17, R41)**
        - `git mv .arc/active/<cat>/meta-{name}.md .arc/archive/<dated>/{name}/meta-{name}.md`. Companion
          files (`tasks-*`, `atomic-*`, `notes-*`, etc.) move alongside.

    - `[ ]` **3.5.d Regenerate ROADMAP (R39)**
        - Archive transition is a regen fire-point. Hand-maintain (interim, pre-CLI) per algorithm in 2.4.

    - `[ ]` **3.5.e Post-Shipped errata convention note (R32)**
        - Workflow body documents the convention: Release Notes Entry edits after `Shipped` are errata
          only; git history is the lock (matches keep-a-changelog norms); no mechanical enforcement.

### `[ ]` **3.6 Wire META-PRD alignment check + promotion-write into `1_create-prd.md`**

- _Goal:_ `1_create-prd.md` adds an explicit META-PRD alignment check step with halt-and-ask conditions
  (cite specific principle by number when passing) + finalizes promotion writes when a BACKLOG-INBOX entry
  promotes to a draft `plan-*` doc.

    - `[ ]` **3.6.a New step: `## Step N: META-PRD alignment check`**
        - Explicit step with halt-and-ask conditions enumerated. Triggers: PRD scope appears to conflict
          with a META-PRD principle; PRD introduces an anti-goal; PRD touches load-bearing axes the
          META-PRD pins.

    - `[ ]` **3.6.b Cite-principle-by-number requirement on pass**
        - Step concludes by citing the specific principle the PRD aligns with (e.g., "checked against
          principle 3 — passes"). Not just "checked, passed" (per `notes-work-organization-reform.md`
          § META-PRD live-vs-stale tension).

    - `[ ]` **3.6.c Promotion write (R20, R21)**
        - When a BACKLOG-INBOX entry promotes to a `plan-*` doc, delete the inbox entry in the same commit
          as the `plan-*` creation. Routing record lives in the deletion commit message.

### `[ ]` **3.7 Add `archive.cadence` + `review.planning_checkpoint` to `arc-config.yml`**

- _Goal:_ `arc-config.yml` carries `archive.cadence` (default `with-integration`) and
  `review.planning_checkpoint` (default `disabled`) — schema additions ride both copies
  (`packages/arc-framework/arc/system/arc-config.yml` + `.arc/system/arc-config.yml`) per package-project
  sync discipline.

    **Strategies:** `strategy-package-project-sync.md`

    - `[ ]` **3.7.a Add keys to package source**
        - Edit `packages/arc-framework/arc/system/arc-config.yml` — add `archive.cadence` (values:
          `with-integration` | `deferred` | `manual`; default `with-integration`) and
          `review.planning_checkpoint` (values: `disabled` | `required`; default `disabled`).

    - `[ ]` **3.7.b Sync to project instance**
        - Edit `.arc/system/arc-config.yml` to match. Pre-commit hook will flag if a Configurable file is
          staged byte-identical to package source after diverging — verify project instance retains any
          project-specific overrides.

    - `[ ]` **3.7.c CLI-side schema validation (if applicable)**
        - If `packages/arc-framework/src/lib/config/` carries a schema validator, add the two keys.
          No-op if validation is freeform / yaml-pass-through.

### `[ ]` **3.8 Extension fire-point family — 5 files (renames + new) + description/contract pass**

- _Goal:_ Five-extension fire-point family ships in `.arc/system/extensions/` (and packages/
  counterparts) per R56 — three renames + two new files — each with audited description / contract /
  "Use for" framing per R57. Default-inactive across the family; `pre-push-review` and new
  `pre-merge-review` ship as `[No extension configured]` no-default shells.

    - _Approach:_ Per-extension subtask handles file rename or creation + frontmatter +
      Workflow/Fires/Contract block + `.actions` section + description/contract pass + packages/ sync.
      The `.actions` section retains existing content where extensions have it (current
      `pre-merge-review.md` carries CodeRabbit invocation logic; that moves with the file under its
      new name).

    **Strategies:** `strategy-package-project-sync.md`, `strategy-configurability-architecture.md`

    - `[ ]` **3.8.a `pre-activation` — new file (was proposed as `pre-execution-graduation`)**
        - Mirror existing extension shape: frontmatter (`name: pre-activation` / `description` /
          `active: false`); top-of-body block (Workflow: `activate-work-unit.md`; Fires: step 1's
          pre-condition gate passed — running on `plan/<name>`, `**State:** Planning`, PRD + tasks-*
          present, before state-flip + branch rename); Contract documenting sequential execution,
          halt-on-fail, independent gating from `review.planning_checkpoint` per R47;
          `## pre-activation.actions` with `[No extension configured]` placeholder.

    - `[ ]` **3.8.b `pre-commit-review` — rename from `pre-stage-review` + description/contract audit**
        - `git mv pre-stage-review.md pre-commit-review.md` in both copies. Update frontmatter
          `name:`. Update top-of-body block: Workflow becomes "`arc-commit` skill + `prepare-commits.md`"
          (wiring extended; see 3.10); Fires becomes "After staging, before commit creation";
          description/Contract revises to clarify extension-vs-git-hook decision boundary (extensions
          carry agent procedures + `workflow-interlock` stops; hooks carry scriptable checks). Existing
          `.actions` content retained.

    - `[ ]` **3.8.c `pre-pr-review` — rename from current `pre-merge-review` + description/contract audit**
        - `git mv pre-merge-review.md pre-pr-review.md` in both copies. Update frontmatter `name:`.
          Update Fires: "pre-PR-creation push at `integrate-work-unit.md`" (was "before push and PR
          creation" — same fire-point, more accurate naming). `.actions` content (CodeRabbit
          invocation) retained verbatim.

    - `[ ]` **3.8.d `pre-push-review` — new file (no default `.actions`)**
        - Frontmatter (`name: pre-push-review` / `description` / `active: false`); top-of-body block
          (Workflow: push wrapper / `arc release push` / `arc sync`; Fires: "Any push routed through
          the push wrapper"; Contract documents per-push frequency, halt-on-fail behavior, and the
          "reserved-for-future" framing — extension shipped to complete the family namespace).
          `## pre-push-review.actions` with `[No extension configured]`.

    - `[ ]` **3.8.e `pre-merge-review` — new file at post-review-response fire-point (no default)**
        - Frontmatter (`name: pre-merge-review` / `description` / `active: false`). Note: name freed
          by 3.8.c's rename of current `pre-merge-review` → `pre-pr-review`. Top-of-body block
          (Workflow: `integrate-work-unit.md`; Fires: "After `review-response` processing, before
          merge action"; Contract clarifies 3-extension family at integrate-work-unit:
          `pre-pr-review` → `review-response` (plan-review-method-family scope) → `pre-merge-review`;
          documents reserved-pending-final-state-check use cases).
          `## pre-merge-review.actions` with `[No extension configured]`.

    - `[ ]` **3.8.f Description/contract pass (R57) — all five files**
        - Audit each file's description, Contract block, and any "Use for" framing for alignment
          with WOR family conventions; clarify decision boundaries between extensions and adjacent
          mechanisms (especially `pre-commit-review` vs git pre-commit hook). Spot-check that
          frequency language matches actual wiring.

    - `[ ]` **3.8.g Sync all to packages/**
        - Mirror every file to `packages/arc-framework/arc/system/extensions/`. Verify the
          pre-commit hook's two-copy-divergence check doesn't false-positive.

### `[ ]` **3.9 Inline-fold R53 audits across touched workflows**

- _Goal:_ R53's five inline-fold audits ride this WU's workflow touches — class-tag routing, workflow-
  interlock markers, `arc sync` / `arc release push` auto-set-upstream, `integrate-work-unit` post-PR-create
  handoff guidance, and `session-init` / `session-handoff` lifecycle Next Action pointer contract — apply
  at the touch, not as separate sweeps.

    - _Note:_ The broader sweeps across untouched workflows stay with their respective inbox entries'
      future WUs. This task verifies the audits land on workflows touched by 3.1-3.8 only.

    - `[ ]` **3.9.a Commit/push class-tag routing audit on touched fire-sites**
        - Verify every commit / push site in touched workflows uses correct class-tag syntax
          (`taskCommit` / `workflowCommit` / `workflowPush`) or raw `git` per DEV-RULES.ARC § Workflow
          class-tag routing.

    - `[ ]` **3.9.b Workflow-interlock marker audit**
        - Verify touched workflows use `> [!IMPORTANT]` `workflow-interlock:` markers consistently at stop
          points; surface anti-patterns (mid-step stops, ambiguous wait-for-direction phrasing).

    - `[ ]` **3.9.c `arc sync` / `arc release push` auto-set-upstream behavior change**
        - Substantive code change riding the workflow trim: `pushability` matrix `blocked-no-upstream`
          cell resolves to `upstream-init` when `pushInterlock` permits. Update CLI behavior + tests in
          `packages/arc-framework/src/lib/`; verify call sites in touched workflows.
        - _Note:_ Verify the `pushability` matrix exists in `packages/arc-framework/src/lib/` before
          implementation. If absent (matrix is a new abstraction), task scope expands to matrix design;
          surface for re-scoping before starting.

    - `[ ]` **3.9.d `integrate-work-unit` post-PR-create handoff guidance refresh**
        - Update handoff guidance language to be skip-threshold-aware (no auto-handoff suggestion when
          remaining work below threshold).

    - `[ ]` **3.9.e Lifecycle Next Action pointer contract preservation in `session-init` / `session-handoff`**
        - Verify Next Action field preserves ARC lifecycle workflow prefix at handoff; project-specific
          detail routes to SESSION-NOTES, not the status field. Touched workflows don't break this
          contract.

### `[ ]` **3.10 Wire `pre-commit-review` into `arc-commit` skill**

- _Goal:_ The `arc-commit` skill — canonical commit entry-point — invokes `pre-commit-review` extension
  before commit creation, alongside existing `prepare-commits.md` workflow wiring. Every-commit-fires
  naming (R55-R56) honored by every-commit-pathway wiring per R57's accountability.

    - _Note:_ This is the substantive functional addition behind the `pre-stage-review` →
      `pre-commit-review` rename in 3.8.b. Without arc-commit wiring, the new name would still
      mislead. Audit the skill's commit-creation step; insert the extension fire-point check before
      `git commit` is invoked.

    - _Note:_ Behavioral change to the canonical commit pathway — recommend integration test in
      `packages/arc-framework/__tests__/integration/` asserting `arc-commit` invokes the extension's
      `.actions` when `active: true` and halts on fail. See `strategy-testing-methodology.md` for tier
      placement.

    - `[ ]` **3.10.a Audit `arc-commit/SKILL.md` for the commit-creation step**
        - Locate the step that runs `git commit`; identify the right insertion point for extension
          fire-point check (after staging confirmation, before commit invocation).

    - `[ ]` **3.10.b Add extension fire-point reference**
        - Insert language: "If `pre-commit-review` extension is `active: true`, run its `.actions`
          before commit. Halt-on-fail surfaces actionable message; user can fix and retry or
          explicit-invoke bypass."

    - `[ ]` **3.10.c Verify `prepare-commits.md` wiring remains intact**
        - Extension fire-point in `prepare-commits.md` carries forward under the renamed extension
          (3.8.b updates the reference). 3.10 doesn't change prepare-commits; just confirms the
          rename didn't break the existing fire-point reference.

## **Phase 4:** Template evolution + META-PRD content rewrite

_Purpose:_ Encode the new meta-file shape, META-PRD template, and rewrite META-PRD content as a dogfooding
pass that surfaces shape ambiguities feeding back into `template-meta-prd.md` v1.1.

_Design decisions:_ META-PRD update-trigger discipline (R36) lives in `template-meta-prd.md` itself — the
template carries the update-discipline rule alongside the shape it codifies, keeping shape + lifecycle
co-located.

### `[ ]` **4.1 Create `template-meta.md` (replaces `template-status.md`) — H1 + grouped fields + content H2s**

- _Goal:_ `template-meta.md` replaces `template-status.md` with the R58 shape — `# Metadata: {name}` H1;
  blank-line-grouped field blocks under H1 (no `## Work Unit Metadata` H2 wrapper); content H2s
  (`## Release Notes Entry`, `## Completion Notes`) added at Active → Integrating transition;
  post-Shipped errata convention note included.

    - _Shape:_ See R58 in PRD for the full template skeleton. Five field groups (identity / reference /
      coordination / task pointers / directive) + post-integration block + content H2s appearing only
      after state transition.

    **Strategies:** `strategy-package-project-sync.md`

    - `[ ]` **4.1.a Rename + sync template file**
        - `git mv .arc/reference/templates/template-status.md
          .arc/reference/templates/template-meta.md` plus packages/ counterpart.

    - `[ ]` **4.1.b Restructure to `# Metadata:` H1 + blank-line-grouped field blocks (no internal H2)**
        - H1: `# Metadata: {wu-name}`. No `## Work Unit Metadata` wrapper — fields live directly under
          H1 in blank-line-separated blocks. Field groups per R58: identity / reference / coordination
          / task pointers / directive / post-integration.

    - `[ ]` **4.1.c Codify life-phase fields (within H1 body)**
        - `**State:**` value-set: `Planning | Active | Integrating | Shipped` (4 values per
          PRD R9; strict state machine; commitment level lives in dir, not State).
          `**Integration:**` retired (folds into State as the `Integrating` value).
          State transitions fire at workflow ceremonies (`init-work-unit` creates Planning;
          `activate-work-unit` flips Planning → Active; `integrate-work-unit` flips Active →
          Integrating; archive ceremony flips Integrating → Shipped). Branch creation and
          branch rename do not fire State transitions — they're internal to Planning state
          until `activate-work-unit` fires.
        - `**Owner:**` singular; `[arc.identity]` placeholder substituted at meta-file creation.
        - `**Branch:**` (single value per single-branch-per-WU).
        - _Note:_ Verify existing `template-status.md`'s placeholder convention before authoring;
          stay consistent across templates and with the substitution logic in 3.2.b's
          `init-work-unit.md`.
        - `**Spec:**` internal-only (ARC-owned planning artifacts; never external).
        - `**Origin:**` default `[Internal]`; orthogonal to Spec; external tracker URLs land here.
        - `**Depends On:**` bare WU-name list; default `[none]`; renders into ROADMAP tier grouping.
        - `**Cohort:**` single name string; default `[standalone]`; source of truth for cohort
          membership (sibling list derived).
        - Active-state pointers preserved: `**Task List:**`, `**Last Completed:**`, `**Next Task:**`,
          `**Blockers:**`, `**Next Action:**`.

    - `[ ]` **4.1.d Codify post-integration metadata fields + content H2s**
        - Post-integration block within `# Metadata:` H1 body (added at integration ceremony):
          `**PR URL:**` (link to integration PR), `**Completed:**` (date stamp).
        - Content H2s (added at Active → Integrating transition; absent during life-phase):
          `## Release Notes Entry` (one-paragraph user-facing summary + categorized lines per
          7-category Keep a Changelog set: Added / Changed / Removed / Fixed / Infrastructure /
          Deprecated / Security; optional Breaking Changes callout).
        - `## Completion Notes` (narrative summary of what shipped).
        - _Note:_ How to represent content H2s in the template (absent during life-phase, present
          after transition): HTML-commented examples, inline placeholder text, or pure prose
          description? Decide at execution — prefer the form least likely to mislead readers about
          whether the section is "present today."

    - `[ ]` **4.1.e Post-Shipped errata convention note (R32)**
        - Template includes a brief note: Release Notes Entry edits after `Shipped` are errata only;
          git history is the lock; no mechanical enforcement (matches keep-a-changelog norms).

    - `[ ]` **4.1.f Update `session-init.md` partial-read anchor (retirement)**
        - The `^## Work Unit Metadata` partial-read anchor in `session-init.md` step 3 item 7 retires;
          meta file becomes a full-read target. Update workflow body to reflect: full-read OK given
          small file size; archive-phase content gated by H2 boundary (read only when present).

    - `[ ]` **4.1.g Retire `template-completion-doc.md`**
        - Bundled with 6.7 doc retirements; flag here that completion-doc content folded into
          archive-phase content H2s of `template-meta.md`.

### `[ ]` **4.2 Create `template-meta-prd.md`**

- _Goal:_ `template-meta-prd.md` ships the META-PRD shape as a codified template — Mission (1-3 sentences) +
  numbered principles (5-7, quotable as nouns) + anti-goals + problem statement + design tradeoffs — plus
  the update-trigger discipline (R36) embedded alongside the shape.

    **Strategies:** `strategy-package-project-sync.md`

    - `[ ]` **4.2.a Mission section template**
        - 1-3 sentences; states the project's purpose at the highest level.

    - `[ ]` **4.2.b Numbered principles template**
        - 5-7 numbered principles; quotable as nouns (principle 3, principle 5). Each principle is a
          short proposition with one-paragraph rationale.

    - `[ ]` **4.2.c Anti-goals section template**
        - What the project explicitly will not do; bounded list.

    - `[ ]` **4.2.d Problem statement template**
        - What problem the project solves; framed in user / context terms.

    - `[ ]` **4.2.e Design tradeoffs template**
        - Major calls and their consequences; informs principle interpretation.

    - `[ ]` **4.2.f Update-trigger discipline embedded in template (R36)**
        - Block describing when META-PRD updates fire: organic (PR-time clarification when conflict
          surfaces) + event-driven (major release, scope shift, governance change). Not cadence-driven.

    - `[ ]` **4.2.g Sync to packages/**

### `[ ]` **4.3 Rewrite `META-PRD.md` content per new shape**

- _Goal:_ `.arc/reference/META-PRD.md` content rewritten per the new `template-meta-prd` shape — Mission +
  5-7 numbered principles + anti-goals + problem statement + design tradeoffs — as the dogfooding pass
  that surfaces template ambiguities (template v1.1 revisions ride the same phase if needed).

    - _Context:_ Existing `.arc/reference/META-PRD.md` (162 lines: § 1 Purpose through § 6 Technical
      Requirements) is the source material; preserve content the new shape genuinely subsumes; surface
      content that doesn't fit as scope question. Per PRD § Open Questions, template revisions feed back
      into 4.2.

    - _Note:_ PRD R35 carries the same wrong path (`.arc/META-PRD.md`). Correct in the PRD body too
      when WOR integrates — PRDs ship to readers and the typo otherwise persists in shipped content.

    - _Note:_ Current META-PRD has no "principles" section and no "design tradeoffs" section.
      Distillation work for 4.3.c / 4.3.f pulls from § 1 Philosophical basis + § 2 Core Features +
      this WU's `notes-work-organization-reform.md` design-decisions section + relevant ADRs. Expect
      one iteration cycle with 4.2 per 4.3.g if shape ambiguities surface.

    - `[ ]` **4.3.a Read existing META-PRD; inventory content vs new-shape coverage**
        - Map existing sections to new-shape slots. Surface gaps (content with no home) before drafting.

    - `[ ]` **4.3.b Draft Mission**
        - 1-3 sentences; from existing top-level framing.

    - `[ ]` **4.3.c Draft 5-7 numbered principles**
        - Distill existing principles / values into quotable-as-noun shape. Preserve principle ordering
          where existing order is load-bearing.

    - `[ ]` **4.3.d Draft anti-goals**
        - From existing scope-bound language; explicit "won't do" framing.

    - `[ ]` **4.3.e Draft problem statement**
        - User-context framing; what ARC exists to solve.

    - `[ ]` **4.3.f Draft design tradeoffs**
        - Major calls + consequences; document the load-bearing ones.

    - `[ ]` **4.3.g Feed template ambiguities back to `template-meta-prd.md` v1.1**
        - If shape ambiguities surface during draft, revise 4.2's template before declaring rewrite
          complete.

### `[ ]` **4.4 Codify META-PRD update triggers**

- _Goal:_ Update-trigger discipline (R36) is durably codified in `template-meta-prd.md` (per 4.2.f) and
  cross-referenced from `strategy-work-organization.md` § META-PRD (or wherever META-PRD operations end
  up surfaced in strategy docs).

    - _Note:_ R36 functionally lands inside 4.2.f; this parent confirms cross-reference + closes the
      update-trigger loop. May reduce to a verification step if 4.2.f fully covers.

### `[ ]` **4.5 Reframe `template-plan.md` (drop "optional, delete post-PRD")**

- _Goal:_ `template-plan.md` framing retires the "Using this template is not required ... Delete
  this file after the PRD is written and stable" preamble and replaces it with framing that's
  coherent under `pm.mode: arc-in-git` and forward-compat with the spec-flow contract arc-plan
  Conductor + AWL will land. Plan-* described as the pre-PRD synthesis artifact for substantive
  shaping work; under arc-in-git the file moves from `backlog/{state}/<wu-name>/` →
  `active/<category>/` at activation (not deleted post-PRD); applicability scales with mode and
  tier per downstream WUs.

    **Strategies:** `strategy-package-project-sync.md`

    - `[ ]` **4.5.a Edit package source (authoritative copy)**
        - Per package-project sync discipline, `template-plan.md` is a Framework file —
          edit `packages/arc-framework/arc/reference/templates/template-plan.md` first.
        - Drop "Using this template is not required ... Delete this file after the PRD is
          written and stable." Replace with framing aligned to PRD R22c: "`plan-*` is the
          pre-PRD synthesis artifact for substantive shaping work. Under `pm.mode: arc-in-git`,
          this file moves with the WU through the lifecycle (backlog → active → archived
          alongside the meta file). Applicability — when `plan-*` is required vs optional —
          scales with mode (Lite/Full; arc-in-git/none) and WU tier (atomic / quick /
          standard); see `strategy-work-organization.md` § Spec-Flow Invariants (Task 2.7)
          plus `feature/plan-arc-plan-conductor.md` and `technical/plan-agile-wu-lifecycle.md`
          for the full contract."

    - `[ ]` **4.5.b Verify body sections remain useful**
        - Existing sections (Problem / Motivation, Alternatives, Unknowns and Assumptions,
          Scope Estimate) stay as optional starting structure. Section guidance text inside
          each section retained — those describe what to capture, not whether the file is
          required.

    - `[ ]` **4.5.c Sync into `.arc/` instance copy**
        - Sync the package-source edit to `.arc/reference/templates/template-plan.md` via
          the canonical sync mechanism (not `cp` — that path violates package-project sync
          discipline by overwriting any project-specific divergence silently).
        - Verify pre-commit hook reports clean across both copies.

## **Phase 5:** Roster cascade + push wrapper wiring + CLI seeding update

_Purpose:_ TypeScript code changes — test-covered roster library function, `pre-push-review` extension
fire-point wiring into the push wrapper, and CLI init/join preamble strip for instance-file slimming.

### `[ ]` **5.1 Implement `worktree-roster.ts` library function with test-first coverage**

- _Goal:_ `packages/arc-framework/src/lib/git/worktree-roster.ts` exports a function returning a list of
  `{worktreePath, branch, identity?, metaFilePath, state, cohort?}` tuples from `git worktree list` +
  per-worktree meta-file resolution — synchronous worktree-list read; async per-worktree meta-file
  resolution; empty list returned when no worktrees or no meta files surface (clean degradation).

- _Note:_ `git/worktree-sync.ts` may already parse `git worktree list` output. Audit for an existing
  utility before re-implementing — reuse if available; factor if it covers ~90% of need.

- _Note:_ State value-set (`Planning | Active | Integrating | Shipped`) is codified in 4.1.c
  (`template-meta.md`) per PRD R9. Import from a shared schema if one exists (`frontmatter/`
  or `manifest/` modules are likely homes); otherwise hardcode with a comment pointing at the
  codifying template. Avoid silent enum duplication.

    **Strategies:** `strategy-testing-methodology.md`

    Build `test-first` (one behavior at a time):

    - Returns empty list when only the main worktree exists with no `meta-*.md` in `active/`.
    - Returns single tuple with `state` and `cohort` populated when one worktree has a meta file.
    - Returns multi-element list with one tuple per worktree when several worktrees have meta files.
    - Resolves `identity` from meta file's `**Owner:**` field (verbatim string; no normalization).
    - Resolves `state` from `**State:**` field (validates against the codified value-set; surfaces
      unknown values as `unknown` rather than throwing).
    - Resolves `cohort` from `**Cohort:**` field; `[standalone]` maps to `undefined` in the tuple
      (not the string `"[standalone]"`).
    - Tolerates missing meta file (worktree exists, no `meta-*.md` in its `active/`) — returns a tuple
      with `metaFilePath` undefined and other meta-derived fields absent.
    - Tolerates malformed meta file (parse error) — surfaces a warning, returns a degraded tuple
      rather than throwing.
    - Detached-HEAD worktrees skip cleanly (no branch → no meta-file resolution attempt).

### `[ ]` **5.2 Wire `pre-push-review` extension fire-point into push wrapper**

- _Goal:_ The push wrapper (`packages/arc-framework/src/lib/release/...`) invokes `pre-push-review`
  extension before executing any push routed through the wrapper — `arc release push` / `arc sync`
  push pathways inherit the fire-point automatically. Default-inactive extension (per 3.8.d); this
  wiring is structural even when extension is off.

    **Strategies:** `strategy-testing-methodology.md`

    - `[ ]` **5.2.a Identify insertion point for the extension fire**
        - Push execution flows through `pushWorktreeBranch` in
          `packages/arc-framework/src/lib/git/push-worktree.ts` (thin shell-exec wrapper). Called from two
          handler sites: `packages/arc-framework/src/handlers/release/push-cli.ts` (`arc release push`)
          and `packages/arc-framework/src/handlers/sync.ts` (`arc sync`).
        - Design choice: insert the fire (a) inside `pushWorktreeBranch` — single-site; all callers
          inherit automatically; mixes shell-exec wrapper with extension-fire concern; or (b) in both
          handler call sites before invoking the wrapper, ideally via a shared pre-push helper —
          separation-of-concerns; wrapper stays pure shell-exec. Default recommend (b); decide at
          execution.

    - `[ ]` **5.2.b Extension fire-point check**
        - Read `.arc/system/extensions/pre-push-review.md` frontmatter; if `active: true`, surface
          `.actions` to the agent before push proceeds. Default `active: false` short-circuits with no
          overhead.
        - _Note:_ "Surface `.actions` to the agent" needs to match how existing `pre-*` extensions
          surface today — likely via `sync-output.ts` or stdout. Inspect a working extension consumer
          (e.g., wherever `pre-stage-review`/`pre-merge-review` are wired) for the established pattern;
          stay consistent.

    - `[ ]` **5.2.c Unit + integration test coverage**
        - Vitest tests: extension inactive → push proceeds without surfacing; extension active with
          empty actions → push proceeds with no-op fire; extension active with actions → actions
          surface; extension malformed → push proceeds with degraded warning (don't block push on
          extension parse error).
        - _Note:_ Add a fifth case — extension file absent entirely (fresh install, file deleted).
          Expected: push proceeds with no fire (treated equivalent to `active: false`); never error.

### `[ ]` **5.3 Update CLI init/join code to strip instance-file preamble injection**

- _Goal:_ CLI init/join code in `packages/arc-framework/src/lib/` no longer injects preamble blocks
  when seeding SESSION-NOTES, USER-INBOX, BACKLOG-INBOX, or `backlog/ATOMIC-INBOX.md` — files seed
  as content-only per R59. Existing instance files in this repo migrated separately in 6.9.

    **Strategies:** `strategy-testing-methodology.md`, `strategy-package-project-sync.md`

    - `[ ]` **5.3.a Locate preamble injection sites**
        - Grep `packages/arc-framework/src/lib/` for the "About this file" / Lifecycle / Portability /
          Writing-guide preamble strings; identify seeding functions for each affected file.

    - `[ ]` **5.3.b Strip preamble from seed templates**
        - Update each seeding function to inject only the content scaffolding (e.g., for SESSION-NOTES:
          `## Handoff Metadata`, `## Uncommitted Work`, `## Remaining Work...`, `## Additional Context`,
          `## Persistent Context` H2s with empty bodies; no preamble blockquote).

    - `[ ]` **5.3.c Verify CLI tests still pass**
        - Existing CLI tests likely assert on seed output shape — update expected output where needed;
          add new test asserting no preamble in seeded files.

## **Phase 6:** Migration and cross-reference sweep

_Purpose:_ Apply WOR conventions forward — hook regex, in-flight meta-file migration, capture pipeline
file restructure, backlog reorganization, leaked-status cleanup, doc retirements, and cross-reference
sweep.

_Design decisions:_ Migration ordering: 6.1-6.2 (commit-convention enforcement) → 6.3-6.6 (mechanical file
migrations) → 6.7 (doc retirements) → 6.8 (cross-reference sweep). Migration commit shape is atomic-per-op
per ARC commit discipline — each rename / backfill / retirement gets its own commit unless tightly
coupled. Cross-reference sweep last so all retired surfaces have already been removed when grepping.

### `[ ]` **6.1 Update `system/githooks/commit-msg` (type-set tightening + `arc` scope refusal)**

- _Goal:_ `system/githooks/commit-msg` enforces tuned 8-type set (`feat | fix | chore | docs | refactor |
  test | perf | revert`) and refuses `arc` as scope while preserving the bash `arc_config_get` pattern (no
  migration to commitlint); changes ride both copies (.arc/ + packages/).

    **Strategies:** `strategy-package-project-sync.md`

    - `[ ]` **6.1.a Type-enum regex tightening**
        - Update regex: `^(feat|fix|chore|docs|refactor|test|perf|revert)\([a-z][a-z0-9-]*\): .+`. Drops
          `style`, `content`, `build`, `ci`, `config` from prior regex.

    - `[ ]` **6.1.b Scope denylist (`arc`)**
        - Post-match check on captured scope: reject when matches `^arc$`. Initial denylist member only;
          expands organically as new catch-all patterns surface in PR review.

    - `[ ]` **6.1.c Sync to packages/**
        - Edit `packages/arc-framework/arc/system/githooks/commit-msg` to match.

    - `[ ]` **6.1.d Hook smoke test**
        - Attempt commits with retired type (`style:`) and `arc` scope; verify rejection. Attempt valid
          commit; verify pass.

### `[ ]` **6.2 Codify `docs` discipline in `commit-format.md` method**

- _Goal:_ `commit-format.md` method carries the `docs` discipline principle — type chosen by intent (not
  file extension), with concise type-definition lines (feat / fix / refactor / docs) + the rule of thumb.
  No examples (methods stay token-lean per R27).

    - Principle paragraph + four type-definition lines + rule of thumb. ~8-10 lines added; method's
      token budget respected. `commit-context-format.md` and `arc-commit` skill stay out of scope.

### `[ ]` **6.3 Migrate in-flight WU meta files (`status-*` → `meta-*` + field backfill + State recodification)**

- _Goal:_ In-flight WU `status-*.md` files rename to `meta-*.md`; State recodified per mapping table; Owner
  backfilled from `arc.identity`; Origin defaulted to `[Internal]` (external URLs migrated from prior Spec
  where applicable); Depends On initialized to `[none]` (manual extraction for known dependencies); Cohort
  initialized to `[standalone]` or cohort name for known sibling sets.

    - _Approach:_ One commit per WU migration to keep blast radius bounded — each WU's rename + field
      edits land atomically per ARC commit discipline. Mapping table per `notes-work-organization-reform.md`
      § Migration Mapping Reference.

    - _Note:_ At execution, discover all in-flight `status-*.md` files first; in practice this WU's own
      `status-work-organization-reform.md` is the sole in-flight status file (verified at task generation
      time). "Each WU's rename" is defensive language for the broader contract — most invocations migrate
      a single file.

    - `[ ]` **6.3.a Per-WU rename: `git mv status-{name}.md meta-{name}.md`**
        - Plus any `archive/` references on the same branch (none expected during this WU; verify).

    - `[ ]` **6.3.b State recodification per mapping table**
        - Under the 4-state enum (`Planning | Active | Integrating | Shipped` per PRD R9),
          commitment level lives in dir, not State; on-branch-planning shares the `Planning`
          State with backlog-planning. Mapping for in-flight meta files:
        - `Planning` → `Planning` (preserved; covers both backlog-Planning and
          on-branch-Planning; dir location distinguishes).
        - `Draft` (old) → `Planning` + meta routes to `backlog/provisional/<wu>/` (if such
          a file is in scope; in practice all in-flight WUs at WOR activation are on
          branches in `active/`, so this row is defensive).
        - `In Progress` → `Active`.
        - `Active` → `Active`.
        - `Complete` + `**Integration:** Merged` → `Shipped`.
        - `Complete` + `**Integration:** (PR open)` → `Integrating`.
        - `**Integration:**` field retires (folds into State as the `Integrating` value).

    - `[ ]` **6.3.c Backfill `**Origin:**` (default `[Internal]`; migrate external URLs from Spec)**

    - `[ ]` **6.3.d Backfill `**Owner:**` from `arc.identity`**

    - `[ ]` **6.3.e Initialize `**Depends On:** [none]` (manual extraction for known dependencies)**

    - `[ ]` **6.3.f Initialize `**Cohort:** [standalone]` (or cohort name for known sibling sets)**
        - Parallelism trio members (Worktree Foundation, Agile WU Lifecycle, Concurrent Work Conventions)
          tagged `parallelism-trio`. ARCd Rebrand consumes WOR conventions but is a separate WU — defaults
          to `[standalone]` or its own cohort per planning context. Interlock-release-wrappers cluster
          tagged `interlock-release-wrappers`. Others default `[standalone]`.

### `[ ]` **6.4 Migrate capture pipeline files**

- _Goal:_ Capture pipeline files restructure to the four-surface model — `user/{id}/ATOMIC-INBOX.md` renames
  to `USER-INBOX.md` (content under `## Atomic`; `## Backlog` initially empty); `BACKLOG-FEATURE.md` +
  `BACKLOG-TECHNICAL.md` merge to `backlog/BACKLOG-INBOX.md` with entries reclassified during merge; new empty
  `backlog/ATOMIC-INBOX.md` created.

    - `[ ]` **6.4.a Per-user ATOMIC-INBOX → USER-INBOX rename**
        - `git mv .arc/user/{andrew}/ATOMIC-INBOX.md .arc/user/{andrew}/USER-INBOX.md`. Restructure
          content under `## Atomic` section; add empty `## Backlog` section.

    - `[ ]` **6.4.b Merge BACKLOG-FEATURE + BACKLOG-TECHNICAL → BACKLOG-INBOX**
        - Create `backlog/BACKLOG-INBOX.md`; migrate entries from both source files; reclassify per
          shape (some entries may route to `backlog/ATOMIC-INBOX.md`; some may promote directly to
          draft `plan-*` docs if matured). Delete source files.
        - _Note:_ Reclassification is interactive — establish routing policy upfront (criteria for
          BACKLOG-INBOX vs ATOMIC-INBOX vs plan-* promotion), then confirm per borderline entry. Record
          routing decisions in the migration commit message.

    - `[ ]` **6.4.c Create new empty `backlog/ATOMIC-INBOX.md`**
        - Project-shared atomic surface; populates organically post-WOR.

### `[ ]` **6.5 Migrate `backlog/feature/` + `backlog/technical/` to `backlog/{planned,provisional}/<wu-name>/` per-WU subdirs**

- _Goal:_ Existing `backlog/feature/` and `backlog/technical/` contents migrate to per-WU
  subdirs under `backlog/{planned,provisional}/<wu-name>/` per ROADMAP-inclusion test (on
  ROADMAP → `planned/`; not on ROADMAP → `provisional/`). Cohort wrapper subdir applied for
  codified sibling sets (`backlog/{commitment}/<cohort>/<wu-name>/`). Each migrated WU gets
  a `meta-<wu-name>.md` stub generated alongside its plan-doc (interactive backfill: `Origin`
  / `Owner` / `Depends On` / `Cohort`; all backlog WUs land `State: Planning` regardless of
  commitment dir — commitment level lives in dir, not State, per PRD R9 + R21). Two
  backlog-stage PRDs (`prd-arcd-rebrand.md`, `prd-arcd-docs-site.md`) demote to plan-docs
  with content reshape; the docs-site WU renames to `docs-site-refresh`.

    - _Approach:_ Interactive — routing, cohort assignment, PRD demotion, and meta-file
      metadata can't be fully derived from existing state. Inventory → user-confirmed routing
      per borderline plan → user-confirmed cohort assignment → PRD demotion + docs-site rename
      → user-confirmed per-WU metadata backfill → file moves into per-WU subdirs →
      meta-file generation → cross-reference updates → backlog-root verification.

    - _Output:_ Pre-WOR `backlog/feature/plan-foo.md` + `backlog/technical/plan-bar.md` become
      `backlog/{planned,provisional}/foo/{meta-foo.md, plan-foo.md}` + analogous for `bar`,
      with cohort-grouped sets wrapped at `backlog/{commitment}/<cohort>/<wu-name>/`. Backlog
      root ends with exactly `planned/` + `provisional/` + `ATOMIC-INBOX.md` +
      `BACKLOG-INBOX.md` + `ROADMAP.md` — no other files or dirs at root, no `feature/`,
      `technical/`, or `plans/` remnants.

    - _Note:_ Backlog-stage PRDs are anomalous in the new model. PRDs are activation-coupled
      artifacts created via `1_create-prd.md` at WU activation, not authored in backlog.
      Today's two (`prd-arcd-rebrand.md`, `prd-arcd-docs-site.md`) are historical anomalies
      that demote to plan-docs at migration. Convention codification (strategy-doc capture of
      "PRDs are activation-coupled, not backlog-stage") is out of WOR direct scope; flagged
      in `notes-work-organization-reform.md` § Backlog-stage PRDs are anomalous for downstream
      capture (likely arc-plan Conductor PRD scope).

    - `[ ]` **6.5.a Inventory existing `backlog/feature/` + `backlog/technical/` contents**
        - List all WU artifacts. Companion types to inventory: `plan-*.md`, `prd-*.md`,
          `notes-*.md`, `tasks-*.md`, `atomic-*.md`, `research-*.md`, `analysis-*.md`.
          Verify the enumeration against actual `backlog/feature/` and `backlog/technical/`
          contents before routing.
        - Flag the two backlog-stage PRDs (`prd-arcd-rebrand.md`, `prd-arcd-docs-site.md`)
          for demotion + the docs-site PRD for WU rename to `docs-site-refresh`.
        - Output: a routing worksheet (per-WU rows: name / current path / companions /
          ROADMAP-inclusion / cohort-candidate / target path / demote-PRD-flag / rename-flag).

    - `[ ]` **6.5.b Per-WU routing decisions + PRD demotion + WU rename (interactive)**
        - **Routing rule:** on ROADMAP → `planned/`; not on ROADMAP → `provisional/`.
          Borderline plans (arc-rebrand, arc-backend, other not-yet-sequenced items) require
          explicit user confirmation before routing.
        - **Cohort assignment:** per known sibling set (parallelism-trio cohort consolidates
          under `planned/parallelism-trio/<wu-name>/`, etc.) — user confirms each known
          sibling set; standalone WUs sit directly at `backlog/{commitment}/<wu-name>/`.
          Each plan-doc + companions constitute one WU subdir; cohort wrapping applies only
          when sibling-set codification is explicit.
        - **PRD demotion:** `prd-arcd-rebrand.md` → `plan-arcd-rebrand.md` (file rename +
          content reshape from PRD commitment-language to plan-doc exploratory framing;
          retain the substantive content; soften "settled requirements" framing).
          `prd-arcd-docs-site.md` → `plan-docs-site-refresh.md` (rename + reshape AND
          WU-level rename `arcd-docs-site` → `docs-site-refresh`).
        - **WU-level rename ripple:** any current ROADMAP entry for `arcd-docs-site` updates
          to `docs-site-refresh`; in-doc cross-references update; commit captures the rename.
        - **Resulting placement** (for the two flagged WUs):
            - `backlog/provisional/arcd-rebrand/{meta-arcd-rebrand.md, plan-arcd-rebrand.md}`
              — rebrand is no longer committed; routes to provisional
            - `backlog/planned/docs-site-refresh/{meta-docs-site-refresh.md, plan-docs-site-refresh.md}`
              — docs-site work remains committed; routes to planned
            - Not a cohort — two standalone WUs despite the historical filename pairing

    - `[ ]` **6.5.c Per-WU metadata backfill (interactive — Origin / Owner / Depends On / Cohort)**
        - For each plan, user confirms the meta-file field values before file moves fire.
          Defaults applied automatically: `Owner: [arc.identity]`, `Origin: [Internal]`
          (unless external tracker reference present in plan body), `Depends On: [none]`
          (unless plan body carries explicit upstream WU names), `Cohort: [standalone]`
          (unless 6.5.b assigned to a named cohort).
        - **State value uniform:** all backlog WUs land `State: Planning` regardless of
          which commitment dir (`provisional/` or `planned/`) they route to. Under the
          4-state enum (PRD R9), commitment level lives in dir location, not in State;
          `Planning` covers all pre-activation phases. State transitions only fire at
          workflow ceremonies, not at backlog graduation.
        - User reviews defaults per-WU; corrects values where the inference is wrong;
          confirms before 6.5.d moves files.

    - `[ ]` **6.5.d File moves into per-WU subdirs + meta-file generation**
        - For each WU: create the target subdir (`backlog/{commitment}/<wu-name>/` or
          `backlog/{commitment}/<cohort>/<wu-name>/`); `git mv` the plan-doc + companions
          (including any post-demotion `plan-*.md` from 6.5.b's PRD demotions) into the
          subdir; generate `meta-<wu-name>.md` from `template-meta.md` (created in 4.1)
          with the backfilled fields from 6.5.c + `State: Planning`.
        - _Note:_ This subtask depends on Task 4.1 (`template-meta.md` must exist).
          Sequence 6.5.d after 4.1 lands, or run a draft 6.5.d against the template
          shape from PRD R58 and reconcile with 4.1 at execution time.
        - Verify each subdir contains at minimum `meta-<wu-name>.md` post-move.

    - `[ ]` **6.5.e Cross-reference update in moved docs**
        - Plan-doc internal references (e.g., `[next-plan]: ../other-plan.md`) update to
          new paths accounting for the extra subdir level. Verified by markdown-lint passing
          post-move.

    - `[ ]` **6.5.f Backlog-root structure verification**
        - Verify `backlog/` root post-migration contains exactly the 5 expected entries:
          `planned/`, `provisional/`, `ATOMIC-INBOX.md`, `BACKLOG-INBOX.md`, `ROADMAP.md`.
          No `feature/`, `technical/`, or `plans/` dirs remain; no stray files at root.
          Top-down acceptance check that complements 6.5.d's per-WU verification.

### `[ ]` **6.6 Clean up leaked Planning-state `status-*.md` files on `main`'s `active/`**

- _Goal:_ Any leaked Planning-state `status-*.md` files on `main`'s `active/` are removed — completes the
  per-worktree isolation invariant precondition (Success Criterion #2).

    - Inspection from a fresh worktree branched off main: `active/` should be empty (or hold only inventory
      placeholders). Any leaks → `git rm` in a dedicated cleanup commit.

### `[ ]` **6.7 Retire deprecated docs (`PROJECT-STATUS.md` + three others)**

- _Goal:_ Four deprecated docs retire — `PROJECT-STATUS.md` (function decomposes per R40 mapping;
  non-carried content logged in deletion commit message), two planning artifacts retire after content
  absorption, and `template-completion-doc.md` folds into the new meta-file archive-phase sections.

- _Note:_ PRD R51 currently lists two research files for retirement (`research-commit-convention-reform.md`
  and `research-worktree-tool-convergence.md`). The former doesn't exist (findings already absorbed
  pre-WOR); the latter exists and is retained until Worktree Foundation lands. PRD R51 needs symmetric
  correction at WOR integration — remove both research files from the retirement list.

    - `[ ]` **6.7.a Retire `.arc/reference/PROJECT-STATUS.md` (R40)**
        - Completed-work history → already in (or will be in) per-WU Release Notes Entry sections.
          Project direction → META-PRD. Done-vs-left → directory query. Content not directly carried
          forward is logged in the deletion commit message.

    - `[ ]` **6.7.b Retire `plan-roadmap-evolution.md` (R51)**
        - Tiered-horizons direction superseded by R37-R39 rendered-view shape.

    - `[ ]` **6.7.c Retire `plan-completion-status-consolidation.md` (R51)**
        - Absorbed into WOR R14, R30-R32.

    - `[ ]` **6.7.d Retire `template-completion-doc.md` (R51)**
        - Folded into `template-meta.md` archive-phase sections (4.1).

### `[ ]` **6.8 Cross-reference sweep**

- _Goal:_ Cross-reference sweep across all surfaces (workflows, strategies, rules, briefs, templates) for
  retired patterns; each match updated or retired; sweep verified by post-sweep grep returning no orphans
  (Success Criterion #12).

    - _Approach:_ Pattern-per-subtask. Grep with file-glob restricted to documentation surfaces; update
      matches inline; verify by re-grep returning empty. Patterns from `notes-work-organization-reform.md`
      § Cross-reference sweep targets.

    - `[ ]` **6.8.a Branch-prefix patterns (`feature/`, `technical/`)**

    - `[ ]` **6.8.b PR-prefix pattern (`[PLAN]:`)**

    - `[ ]` **6.8.c Retired workflow refs (`integrate-planning-branch`, `activate-planning-branch`)**

    - `[ ]` **6.8.d Retired file-prefix patterns (`status-*.md`, `completion-*.md`)**

    - `[ ]` **6.8.e Retired template/strategy/plan refs (`template-completion-doc`, `PROJECT-STATUS`,
      `plan-roadmap-evolution`, `plan-completion-status-consolidation`)**

    - `[ ]` **6.8.f Lazy scope-tag example (`docs(arc):` in method examples, etc.)**

    - `[ ]` **6.8.g Extension renames (`pre-execution-graduation`, `pre-stage-review`, and old
      `pre-merge-review` for its pre-PR-creation semantic)**
        - Distinguish carefully from the new `pre-merge-review` at the post-review-response fire-point
          (must NOT be retired). Old `pre-merge-review` references update to `pre-pr-review`.

    - `[ ]` **6.8.h Post-sweep verification grep — returns empty for all retired patterns**

### `[ ]` **6.9 Slim instance-file preambles (SESSION-NOTES + USER-INBOX + BACKLOG-INBOX + backlog/ATOMIC-INBOX)**

- _Goal:_ Existing instance files in this repo strip preamble blocks ("About this file" / Lifecycle /
  Portability / Writing-guide) per R59 — files become content-only, matching meta-file convention.
  Authoritative orientation lives in strategy docs + workflows. CLI seeding update (5.3) prevents
  new instances from regrowing preamble.

    - _Note:_ This migration runs after 5.3 (CLI strip) and 6.4 (capture pipeline rename — USER-INBOX
      from ATOMIC-INBOX); otherwise the migration target file may not exist yet.

    - `[ ]` **6.9.a Slim `user/{identity}/SESSION-NOTES.md`**
        - Remove preamble blockquote ("About this file" / Lifecycle / Portability / Writing guide).
          Retain content H2s (`## Handoff Metadata`, `## Uncommitted Work`, etc.). Slim audit:
          file starts with `# Session Notes` H1 immediately followed by content H2s.

    - `[ ]` **6.9.b Slim `user/{identity}/USER-INBOX.md` (post-6.4 rename)**
        - Remove any preamble injected from prior ATOMIC-INBOX file. Retain `## Atomic` and
          `## Backlog` content H2s.

    - `[ ]` **6.9.c Audit workflow seeding for preamble strings (`session-handoff.md`)**
        - Grep workflows for embedded preamble strings (the "About this file" blockquote pattern,
          the "Writing guide" pointer). Update workflow bodies to omit preamble injection when
          seeding SESSION-NOTES / USER-INBOX. Cross-check against 5.3's CLI changes for consistency.

    - `[ ]` **6.9.d Verify orientation coverage in authoritative docs**
        - Spot-check `strategy-session-operations.md` for SESSION-NOTES orientation content
          (purpose, lifecycle, portability, writing guide); spot-check `strategy-planning-module.md`
          for inbox orientation content. If gaps exist, route to inbox for follow-up (not WOR scope to
          author new strategy content; this verifies existing coverage is sufficient).

## **Phase 7:** Verification

_Purpose:_ Tier-3 quality gates, success-criteria walkthrough, per-worktree isolation acceptance test,
integration readiness assessment.

### `[ ]` **7.1 Complete verification** — load and follow [`verify-work-unit.md`][verify-work-unit]

- _Goal:_ All Success Criteria below resolve to `[x]` or `[~]` (with annotations); Tier-3 quality
  gates pass (`npm run -s lint:md`, `npm run lint:ts`, `npm run typecheck`, `npm test`,
  `npm run build`); per-worktree isolation acceptance test (spawn worktree from main; assert
  `active/` contents) passes; ready-for-integration flag set.

---

## Success Criteria

- `[ ]` `main` carries no in-flight WU artifacts — `.arc/active/` on `main` empty (or holds only
  inventory placeholders)
- `[ ]` Per-worktree isolation acceptance test passes — worktree branched from `main` contains
  only its own WU's `meta-*.md` in `active/`
- `[ ]` No `[PLAN]:` PR pattern remains — new WUs ship a single PR at integration
- `[ ]` All in-flight WU meta files use the new shape — `# Metadata:` H1 + blank-line-grouped field
  blocks; `**Owner:**`, `**Depends On:**`, `**Origin:**`, `**Cohort:**` fields present; codified
  `**State:**` value-set; no internal `## Work Unit Metadata` H2 wrapper
- `[ ]` Completion-doc consolidation complete — `template-completion-doc.md` deleted; new archives
  use meta-file archive-phase content H2s (`## Release Notes Entry` + `## Completion Notes`)
- `[ ]` `PROJECT-STATUS.md` retired — file deleted; function distributed across META-PRD +
  Release Notes Entries + directory queries
- `[ ]` META-PRD content reflects new shape — Mission + numbered principles + anti-goals +
  problem + design tradeoffs
- `[ ]` ROADMAP.md regenerates deterministically from meta-file state per documented algorithm —
  header carries generated-by marker + last-rendered commit hash
- `[ ]` Instance files carry no preamble — SESSION-NOTES, USER-INBOX, BACKLOG-INBOX,
  `backlog/ATOMIC-INBOX.md` read content-only; orientation lives in strategy docs + workflows
- `[ ]` `system/githooks/commit-msg` enforces tuned 8-type set (`feat | fix | chore | docs |
  refactor | test | perf | revert`)
- `[ ]` Hook refuses `arc` as scope — verified by attempt + rejection
- `[ ]` CB-CC alignment documented in `strategy-work-organization.md` § branching with the
  cognitive-load rationale + intentional divergence on `test` / `revert`
- `[ ]` Five-extension fire-point family ships with honest fire-point names per the codified
  convention (`pre-activation`, `pre-commit-review`, `pre-pr-review`, `pre-push-review`,
  `pre-merge-review`); naming convention documented in `strategy-configurability-architecture.md`
- `[ ]` `pre-commit-review` wired into both `arc-commit` skill and `prepare-commits.md` workflow
- `[ ]` `pre-push-review` wired into push wrapper (`arc release push` / `arc sync` push pathway)
- `[ ]` New `pre-merge-review` wired into `integrate-work-unit.md` at the post-review-response
  fire-point (sits between `review-response` and merge action)
- `[ ]` Extension descriptions/contracts pass complete — every touched extension file's
  description, Contract block, and "Use for" framing audited and aligned with WOR family
  conventions; decision boundaries between extensions and adjacent mechanisms (e.g.,
  `pre-commit-review` vs git pre-commit hook) clarified
- `[ ]` No broken cross-references after migration sweep — grep returns no orphans across
  workflows / strategies / rules / briefs / templates
- `[ ]` Roster cascade function ships in `packages/arc-framework/src/lib/git/` with Vitest unit +
  integration coverage; documented tuple shape returned
- `[ ]` CLI init/join strips instance-file preamble injection — package source updated; seeded
  files in this repo migrated; lint passes
- `[ ]` Companion ADR landed in `.arc/reference/adr/` — records constitutional shift; parallel
  scale to ADR-016
- `[ ]` § Spec-Flow Invariants section landed in `strategy-work-organization.md` — codifies
  the three invariants (`meta-*` always exists; task list structure invariant; parseable spec
  exists in some form before tasks) and the two scaling axes (mode + tier); spec-flow
  optionality contract explicitly deferred to arc-plan Conductor + AWL
- `[ ]` `template-plan.md` framing reframed — "optional, delete post-PRD" retired; new framing
  describes `plan-*` as pre-PRD synthesis artifact whose applicability scales with mode and tier
- `[ ]` Backlog migration complete — `backlog/feature/` and `backlog/technical/` retired;
  per-WU subdirs under `backlog/{planned,provisional}/<wu-name>/` carry meta + plan + companions;
  backlog root contains exactly `planned/`, `provisional/`, `ATOMIC-INBOX.md`,
  `BACKLOG-INBOX.md`, `ROADMAP.md`
- `[ ]` Backlog-stage PRDs demoted — `prd-arcd-rebrand.md` and `prd-arcd-docs-site.md` renamed
  to `plan-*`; content reshaped from PRD commitment-language to plan-doc framing; docs-site WU
  additionally renamed `arcd-docs-site` → `docs-site-refresh`; routing per commitment
  (rebrand → provisional; docs-site-refresh → planned)
- `[ ]` All quality gates pass (`npm run -s lint:md`, `npm run lint:ts`, `npm run typecheck`,
  `npm test`, `npm run build`)
- `[ ]` Ready for integration

---

[verify-work-unit]: ../../system/workflows/arc/work-unit-lifecycle/verify-work-unit.md
