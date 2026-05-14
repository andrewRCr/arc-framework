# Task List: Work Organization Reform

- **PRD:** `prd-work-organization-reform.md`
- **Branch(es):** `technical/plan-work-organization-reform`
- **Base Branch:** `main`

- **Purpose:** Rebuild ARC's WU lifecycle foundation around single-branch-per-WU, sweep-as-you-go integration,
  Conventional Branch alignment, meta-file evolution, and aligned commit conventions — delivering per-worktree isolation
  as the precondition for the parallelism trio.

---

## **Phase 1:** Constitutional foundation

_Purpose:_ Ship the ADR + constitution edits that gate convention work in P2-P6. Vocabulary codification,
capture-routing constitutionalization, atomic-tier infra-edit smell flag.

_Design decisions:_ Branch / archival / capture conventions deliberately route to strategy docs (P2), not DEV-RULES.ARC
— strategies carry the convention surface; rules carry discipline. Vocabulary edit lands in `AGENT-BRIEF.ARC.md` §
Vocabulary (existing section; orientation layer) rather than DEV-RULES.ARC, per R23's permissive `OR` clause. See
`notes-work-organization-reform.md` § Work-unit-as-wrapper for the split rationale.

### `[x]` **1.1 Author companion ADR for WOR constitutional shift**

- _Goal:_ The constitutional shift lands as a single ADR (parallel scale to ADR-016) — single-branch-per-WU, CB
  alignment + planning-PR retirement, meta-file rename + field codification, and commit-convention reform + CB-CC
  alignment rationale captured for future readers.

    **Strategies:** `strategy-adr-methodology.md`

    - `[x]` **1.1.a Determine ADR number and create file from `template-adr.md`**
        - `adr-019-work-unit-lifecycle-reform.md` created. Title:
          "Reform Work Unit Lifecycle Around Single-Branch Model and Aligned Conventions" — umbrella framing rather
          than enumerating all four surfaces in the title (filename short for scannability; title carries the
          conceptual unifier; surfaces enumerated in § Decision body per 1.1.b).

    - `[x]` **1.1.b Document the four constitutional surfaces with decision rationale**
        - § Decision opens with constitutional surface 1 (single-branch-per-WU model + boundary-workflow
          restructure + `[PLAN]:` PR-prefix retirement); surface 2 (CB core-6 alignment + `plan/<name>` planning
          branch + intentional CB-CC divergence on `test`/`revert`); surface 3 (`status-*` → `meta-*` rename +
          5-field codification + archive-phase consolidation + per-worktree isolation invariant); surface 4
          (CC type set tightened to 8 + `arc` scope denylist + `docs` discipline + `Context:` footer chain
          extension). Vocabulary distinction (R23) and capture-routing constitutionalization (R24) follow as
          companion codifications; cascading rules (sweep-as-you-go, ROADMAP, PROJECT-STATUS retirement,
          forward-only migration, Release Notes Entry, atomic-tier smell flag) close the Decision section.

    - `[x]` **1.1.c Capture alternatives considered**
        - § Context closes with six alternatives-rejected entries: the three load-bearing structural rejections
          (meta file in `backlog/` during planning; meta file gitignored; two-branch with delayed planning-merge)
          plus three companion rejections covered by WOR's other surfaces (no-prefix execution branches; maintain
          legacy prefixes + tighten CC independently; keep `status-{name}.md` + rely on `**Integration:**`
          field). Final entry frames the "rename work unit entirely" rejection as resolved by the wrapper/character
          vocabulary split rather than retained as standalone rejection — forward-pointer to § Decision rather
          than full duplication.

### `[x]` **1.2 Extend `AGENT-BRIEF.ARC.md` § Vocabulary (WU-as-wrapper + atomic-as-character)**

- _Goal:_ `AGENT-BRIEF.ARC.md` § Vocabulary makes the wrapper-vs-character split first-class — work unit is the wrapper
  noun (any bounded chunk with branch/status/PR; invariant across tiers); atomic is the work character (single-bounded,
  indivisible, no internal stages; applies to items, tasks, WUs). Inboxes distinguish by character, not by wrapper
  presence.

- _Outcome:_ Work unit reframed as wrapper noun with structural cardinality ("one branch, a status file, and
  one PR") and tier invariance; legacy "multi-branch patterns (stacked PRs, team mode)" caveat dropped (WOR
  R1-R5 + R10 foreclose on it). Atomic rewritten as character descriptor with scale enumeration (items /
  tasks / WUs) and inbox-routing-by-character note. Atomic entry repositioned directly below Work unit to make
  the wrapper/character pairing visually adjacent. Filename token references (`status-{name}.md`,
  `atomic-{name}.md`) retained pre-WOR pending Phase 4.1 + 6.3 migrations. Worktree dimension deliberately
  omitted until Worktree Foundation ships and agents gain worktree-aware tooling. Brevity-tuned for
  every-session load (~85 words across both bullets vs. ~130 in initial draft). Both package source and
  `.arc/` instance copies updated; copies verified identical. DEV-RULES.ARC unchanged (references the terms
  but doesn't redefine them, per task scope).

### `[x]` **1.3 Constitutionalize capture-routing in DEV-RULES.ARC § Leave it cleaner**

- _Goal:_ DEV-RULES.ARC § Leave it cleaner table reflects the new four-surface capture model + the ceremony-only-write
  discipline for shared inboxes — the routing rule becomes constitutional, with `DEV-RULES.PROJECT.md § Capture Routing`
  collapsing to a thin redirect.

    - `[x]` **1.3.a Update destinations in the routing table for the four-surface model**
        - Restructured into a capture-only 5-row table on review: rows answer "where do I write this NOW?" with
          one cell per scenario; project-shared destinations (`backlog/ATOMIC-INBOX.md`,
          `backlog/BACKLOG-INBOX.md`, per-WU subdirs) no longer appear as capture rows because they aren't
          capture surfaces off-ceremony. They surface in the drain rule (see 1.3.b). USER-INBOX § Atomic / §
          Backlog are the only "for later, personal" destinations; "for later (other modes)" preserves the
          DEV-RULES.PROJECT redirect path. Earlier draft had a 7-row personal/shared grid that conflated
          capture-time and storage-time semantics — collapsed on review to match operational reality (an agent
          off-ceremony has exactly these surfaces available).

    - `[x]` **1.3.b Add ceremony-only-write rule for shared inboxes (R20 — discipline portion)**
        - Folded into a single "Drain at ceremonies, not capture." paragraph below the capture table. Positive
          framing (where things drain TO) subsumes the negative one (shared inboxes read-only outside
          ceremonies) as a single rule. Names the three ceremony events (activation absorption, integration
          drain, planning-kickoff promotion), the drain destinations (`backlog/ATOMIC-INBOX.md`,
          `backlog/BACKLOG-INBOX.md`, per-WU subdir graduation), and the read-only-by-convention constraint
          outside ceremonies. Intentional forward reference to the shared files (not on disk until Task 6.3
          migration) per the task's note — rule lands constitutionally here, activates structurally when 6.3
          lands.

    - `[x]` **1.3.c Verify `DEV-RULES.PROJECT.md § Capture Routing` redirect remains aligned**
        - Confirmed: DEV-RULES.PROJECT § Capture Routing is a 4-line redirect to `DEV-RULES.ARC § Leave it
          cleaner` (link target unchanged since the H3 anchor stayed `### Leave it cleaner`). R24 stub overrides
          clause not added — left as-is per the "otherwise leave as-is" path; adopters can add a
          project-specific overrides clause when they actually need one.

    - `[x]` **1.3.d Update `manage-incidental-work` prose pointer in § Leave it cleaner**
        - Pointer dropped entirely (option 1 from spec). Initially rewrote with transitional framing ("full
          retirement under Agile WU Lifecycle"), but on review that wording leaked an internal-WU/planning name
          into adopter-facing constitution and violated the framework's own "Write for the reader, not the
          author" rule from DEV-RULES.ARC § Documentation Boundaries. Dropping the inline use orphans the
          `[manage-incidental]:` ref definition (MD053), so it also retires here — small bleed of 6.7.i's
          manage-incidental sweep into Phase 1 scope; net win on constitutional surface clarity. Capture-routing
          escalation isn't load-bearing on the workflow specifically; "present to user" is sufficient guidance —
          the workflow remains discoverable via `system/workflows/` browse or strategy-index when needed.

- _Outcome:_ Constitutional routing rule now lives in DEV-RULES.ARC § Leave it cleaner as a 5-row capture table
  plus a single "Drain at ceremonies, not capture" rule. Restructure (on review) consolidated two prose paragraphs
  into one drain rule and collapsed a 7-row personal/shared grid to 5 rows by removing storage surfaces from
  capture-context — capture answers "where now?", drain answers "where ultimately?". manage-incidental-work
  pointer + ref definition dropped (advances 6.7.i bleed). DEV-RULES.PROJECT § Capture Routing's 4-line
  redirect remains aligned. Both `.arc/` and package source DEV-RULES.ARC copies updated identically.

### `[x]` **1.4 Add atomic-tier infra-edit smell flag to DEV-RULES.ARC**

- _Goal:_ A documentation-only smell flag in DEV-RULES.ARC § Task Execution (Task granularity neighborhood) flags
  atomic-tier work touching load-bearing infra (`.arc/system/`, `.arc/reference/strategies/`, `arc-config.yml`) as
  warranting quick-tier at minimum — multi-commit coordination, deliberate sequencing.

- _Note:_ Companion-note destination is contingent on Agile WU Lifecycle (AWL) work. At execution, check whether AWL's
  tier-scaling guidance has landed in `strategy-work-organization.md` or another doc. If AWL hasn't landed yet, defer
  the companion note rather than seed tier-scaling content in WOR scope.
    - Atomic-tier items routed to ATOMIC-INBOX surfaces still apply the flag at drain time, not at capture.
    - Companion note in `strategy-work-organization.md` (or wherever tier scaling ultimately lands per AWL)
      cross-references the constitutional flag.

- _Outcome:_ New `### Atomic-tier infra-edit smell flag` subsection added to DEV-RULES.ARC § Task Execution
  between `### Task granularity` and `### Quality gate failure`. Four-line rule: atomic-tier work shouldn't
  touch load-bearing infra (named paths enumerated); such edits warrant quick-tier; ATOMIC-INBOX captures
  that touch infra get reclassified at drain time rather than completed in place. Tier vocabulary
  (atomic / quick / standard) is already defined in `AGENT-BRIEF.ARC.md` § Vocabulary (landed Task 1.2), so
  no in-section glossary needed. Companion note in `strategy-work-organization.md` deferred per task spec —
  AWL hasn't landed (still in backlog), so tier-scaling content stays out of WOR scope. Both `.arc/` and
  package source copies updated identically.

## **Phase 2:** Strategy and convention codification

_Purpose:_ Codify single-branch-per-WU, CB-CC alignment, archival + sweep-as-you-go, per-worktree isolation invariant,
ROADMAP rendered-view algorithm, capture pipeline, convention inventory, file-classification + task-list-formatting
alignments, instance-file orientation absorption, and constitutional method + hook propagation (commit-format `docs`
discipline + footer-convention).

_Design decisions:_ Capture-pipeline content (R19-R22) lands in `strategy-planning-module.md` since it covers backlog
organization + routing (arc-in-git PM mode territory). Per-worktree isolation invariant (R15) lives in
`strategy-work-organization.md`. Cross-references bridge. Method + hook propagation (Task 2.13, hoisted from original
Phase 6) lands in Phase 2 because its execution must precede Phase 3 lifecycle workflow restructures (which emit the new
parenthetical patterns); phase order reflects execution order.

### `[x]` **2.1 `strategy-work-organization.md` § Branching — single-branch-per-WU + CB-CC alignment**

- _Goal:_ `strategy-work-organization.md` § Branching codifies the CB core-6 type set, the `plan/<name>` rotation
  pattern, the single-branch-per-WU model, and the CB-CC alignment rationale (intentional divergence on `test` /
  `revert`) — all subsequent boundary-workflow rewrites reference this section.

    - `[x]` **2.1.a CB core-6 type set enumeration**
        - Scope reframed (2026-05-14): type-set enumeration relocates from strategy to the new `branch-format` method
          (Task 2.1.e below). Strategy § Branching now describes mechanism only — every WU branch carries a type
          prefix; the type set lives in the method as adopter-overridable content. Default set landed in the method:
          `feat | fix | chore | refactor | hotfix` (5 types per PRD R1 amendment).

    - `[x]` **2.1.b `plan/<name>` rotation pattern**
        - New § Planning branches: `plan/<name>` codifies the planning-life-phase prefix plus the 3-step rotation
          (`git branch -m` → `git push origin <new>` → `git push origin --delete <old>`); frames the rotation as the
          branch-side companion to the meta-file `State: Planning → Active` transition.

    - `[x]` **2.1.c Single-branch-per-WU model**
        - New § Single branch per work unit codifies one-branch-from-inception-through-integration; WU artifacts
          (`meta-*`, `plan-*`, `prd-*`, `tasks-*`, companions) live in `active/` on the WU's branch throughout the
          lifecycle; main carries no in-flight WU artifacts. Forward-points to § Per-Worktree Isolation for the
          invariant this enables. Pre-WOR two-branch model narrative removed per audience discipline (adopter-facing
          doc states what is, not what was).

    - `[x]` **2.1.d CB-CC alignment rationale + intentional divergence**
        - Scope reframed (2026-05-14): original task language ("intentional divergence on test / revert") was built on
          incorrect research about the Conventional Branch spec — the actual CB recommended set is
          `feature|feat | bugfix|fix | chore | hotfix | release`, not the assumed `core-6` containing `docs/perf`. Per
          PRD R28 amendment, CB-relationship framing now lives in the `branch-format` method preamble (honest
          inspired-by-not-aligned-with framing with substantive divergence enumerated). Strategy § Branching no longer
          carries a CB-CC alignment subsection; instead a brief note on `branch-format` and `commit-format` method
          composition (independent axes) replaces it.

    - `[x]` **2.1.e Create `branch-format` method (PRD R1 amendment)**
        - New file `system/methods/branch-format.md` (both `.arc/` and package source). Parallel structure to
          `commit-format.md`: frontmatter (name, description, related, override-active); H2 override / default split;
          default content carries the 5-type set, per-type semantic, planning-prefix mechanics, branch-name conventions,
          CB-relationship framing, override mechanism guidance. External link to canonical CB spec
          (<https://conventional-branch.github.io/>). Scope absorbed into WOR mid-execution after verification surfaced
          the gap in the original PRD.

- _Outcome:_ § Branching landed as a thin top-level section (mechanism-only) between § Work Unit State and
  § Incidental Work Model. New `branch-format` method file carries the type-set codification and adopter-override
  mechanism. PRD R1 + R28 amended to correct the incorrect CB-alignment framing and capture the release-lifecycle gap
  surfaced during execution. Both strategy-doc copies updated; both method-file copies created identically. Cross-doc
  audit (PRD amendment + method file + strategy rewrite + WU notes Pressure Point capture) keeps the constitutional
  story consistent.

### `[x]` **2.2 `strategy-work-organization.md` § Per-Worktree Isolation invariant**

- _Goal:_ A new Per-Worktree Isolation section in `strategy-work-organization.md` states the invariant — each worktree's
  `active/` contains only its own WU's meta file, because no other branch's meta file is reachable from main — and
  explains why it's load-bearing for the parallelism trio.

- _Outcome:_ New top-level § Per-Worktree Isolation placed between § Branching and § Incidental Work Model, with three
  parts: invariant statement (rooted in single-branch-per-WU + no main-side residency); § Concurrency under worktrees
  (cross-WU coordination via meta-file fields, not filesystem co-residency); § Acceptance test (mechanical test
  description). TOC updated; both copies edited identically. Audience corrections applied 2026-05-14 to remove internal
  WU naming ("parallelism trio", "Worktree Foundation") from adopter-facing prose per DEV-RULES.PROJECT § Audience
  Boundaries.

### `[x]` **2.3 `strategy-work-organization.md` § Archival — sweep-as-you-go + archive shape + tier-boundary note**

- _Goal:_ `strategy-work-organization.md` § Archival codifies sweep-as-you-go as default integration shape with the new
  archive path (`archive/<dated>/{wu-name}/`); states tier-aware sweep ceremony as AWL scope; locks forward-only
  migration; documents the backward-compat tooling contract for downstream consumers.

    - `[x]` **2.3.a Sweep-as-you-go default codification**
        - New § Archival § Sweep-as-you-go default enumerates the three `archive.cadence` values (`with-integration`
          default; `deferred`; `manual`) with semantics each, plus the multi-commit structure of integration PRs under
          `with-integration` (code → completion content → sweep commits). Workflow forward-pointer preserved.

    - `[x]` **2.3.b New archive shape (`archive/<dated>/{wu-name}/`; drop `{category}/`)**
        - New § Archival § Archive directory shape carries the path tree; cross-references the backlog's symmetric
          per-WU subdir convention. Existing `### Archive` subsection under § Directory Structure removed (it described
          the pre-WOR `{quarter}/{category}/{NN}_{name}/` layout); § Directory Structure now flows from § Active Work
          straight to § Alignment.

    - `[x]` **2.3.c Tier-boundary note (forward-pointer to AWL / CWC)**
        - Scope reframed (2026-05-14): adopter-facing strategy doesn't name internal future WUs by ID. New § Archival
          § Tier and async-merge accommodations describes the current default (tier-uniform, sync-merge) and notes
          tier-specific and async-merge variants as "reserved for codification in adjacent strategy work" without
          identifying which downstream WU owns them.

    - `[x]` **2.3.d Forward-only migration discipline**
        - Scope reframed (2026-05-14): subsection content described THIS PROJECT's own migration from pre-WOR to
          post-WOR archive shape, which is a project-internal concern (adopters install post-change with no legacy
          archive to migrate). Per DEV-RULES.PROJECT § Audience Boundaries, content removed from adopter-facing
          strategy; substantive migration mapping already lives in `notes-work-organization-reform.md` § Migration
          Mapping Reference where it belongs.

    - `[x]` **2.3.e Backward-compat tooling contract**
        - Scope reframed (2026-05-14): subsection content was a contract on THIS PROJECT's own future tooling about
          handling its own legacy archive shape — also a project-internal concern. Per DEV-RULES.PROJECT § Audience
          Boundaries, content removed from adopter-facing strategy. Substantive content (legacy-vs-new shape detail)
          remains accessible in WU notes for downstream tooling-WU consumption.

- _Outcome:_ New top-level § Archival landed between § Per-Worktree Isolation and § Incidental Work Model. Pre-WOR
  `### Archive` subsection removed from § Directory Structure (its content described the retired
  `{quarter}/{category}/{NN}_{name}/` layout). Audience corrections applied 2026-05-14: § Forward-only migration and
  § Backward-compat tooling contract subsections removed entirely from adopter-facing strategy (project-internal
  migration concerns; content lives in WU notes); § Tier and async-merge accommodations rewritten to drop internal WU
  naming. TOC updated; both copies edited identically.

### `[x]` **2.4 `strategy-work-organization.md` § ROADMAP rendered-view (algorithm + regeneration fire-points)**

- _Goal:_ `strategy-work-organization.md` § ROADMAP codifies meta-file-as-source-of-truth + the render algorithm +
  ceremony-coupled regeneration fire-points + interim hand-maintenance discipline (pre-CLI).

    - `[x]` **2.4.a Source-of-truth shift**
        - New § ROADMAP § Source of truth enumerates the canonical meta-file fields ROADMAP renders from
          (`**State:**`, `**Owner:**`, `**Depends On:**`, `**Cohort:**`, title) and describes the header convention
          (`Generated from meta files — re-render at ceremony boundaries` + last-rendered commit reference). Audience
          correction 2026-05-14: dropped "until `arc roadmap render` ships" transitional framing; strategy describes
          the algorithm regardless of execution path (hand, script, or future CLI).

    - `[x]` **2.4.b Render algorithm (6 steps)**
        - New § ROADMAP § Render algorithm numbers all six steps (walk → parse → topological sort → tier grouping →
          markdown render → provisional footer). Tier definitions inlined (In Flight covers `Active | Integrating`;
          Foundation, Tier 2+, Independent Tracks defined by dependency shape) so the algorithm is self-contained.

    - `[x]` **2.4.c Regeneration fire-points**
        - New § ROADMAP § Regeneration fire-points enumerates all four triggers (graduation, activation, integration,
          dep-field edit) as a bullet list with per-trigger semantics. Notes the ceremony-workflow integration
          (regenerate-ROADMAP step rides each ceremony commit so ROADMAP stays consistent at every published
          ceremony boundary).

    - `[x]` **2.4.d Interim hand-maintenance discipline (pre-CLI)**
        - Scope reframed (2026-05-14): "Interim (pre-CLI)" framing was project-internal — pegs the strategy doc to
          this project's tooling timeline, which adopters don't share. Per DEV-RULES.PROJECT § Audience Boundaries,
          subsection removed from adopter-facing strategy. The render algorithm and regeneration fire-points (2.4.b,
          2.4.c) are tooling-agnostic; adopters use whatever execution path they have (hand, script, future CLI).
          Hand-maintenance discipline guidance for THIS project's own tooling lives in WU notes.

- _Outcome:_ New top-level § ROADMAP landed between § Archival and § Incidental Work Model. Three subsections
  (Source of truth, Render algorithm, Regeneration fire-points) cover sub-elements 2.4.a–c; 2.4.d's interim
  hand-maintenance content removed from adopter-facing strategy per audience discipline (the algorithm itself is
  tooling-agnostic; "interim until X ships" framing is project-internal). TOC updated; both copies edited identically.

### `[x]` **2.5 `strategy-planning-module.md` capture pipeline reform**

- _Goal:_ `strategy-planning-module.md` codifies the four-surface capture model (per-user USER-INBOX, project-shared
  ATOMIC-INBOX + BACKLOG-INBOX, per-WU subdirs under `backlog/{planned,provisional}/`), ceremony-only writes to shared
  inboxes (operational restatement of DEV-RULES.ARC's constitutional rule), state-dir graduation semantics, and the
  cohort wrapper subdir convention (backlog-only, codified-cohorts only).
    - `[x]` **2.5.a Four-surface model description**
        - New § What It Installs table replaces the pre-WOR bucket-file shape (`BACKLOG-FEATURE.md` /
          `BACKLOG-TECHNICAL.md`). Surfaces enumerated by ownership × work character: per-user `USER-INBOX.md` with
          `## Atomic` / `## Backlog` sections; project-shared `backlog/ATOMIC-INBOX.md` and `backlog/BACKLOG-INBOX.md`;
          per-WU subdirs `backlog/{planned,provisional}/<wu-name>/` carrying `meta-<name>.md` (always) plus
          `plan-<name>.md` and other companions when present. ROADMAP listed separately as a generated view rather than
          a capture surface, with cross-ref to `strategy-work-organization.md § ROADMAP` for the algorithm.

    - `[x]` **2.5.b Ceremony-only writes operational restatement**
        - New § Ceremony-Only Writes to Shared Inboxes enumerates the three fire-points (activation absorption /
          integration drain / planning-kickoff promotion). "Absorbed entries deleted, not marked" stated as rule with
          rationale (commit history = audit trail; no strikethrough / `[absorbed]` tags / status markers). One-sentence
          rationale on write-isolation vs write-immediacy retained; no project-internal worktree-trio framing.
        - _Note resolved:_ Pre-task verification of current per-user `user/{identity}/ATOMIC-INBOX.md` shows transient
          "mark `[x]` then remove" behavior — not persistent strikethrough or `[absorbed]` tags. R20's "deleted, not
          marked" rule governs **shared** inboxes (`backlog/ATOMIC-INBOX.md` / `BACKLOG-INBOX.md`), which don't yet
          exist as artifacts. The rule is therefore purely net-new convention for surfaces being created in Phase 6.3,
          not a behavioral shift on existing surfaces — no additional migration-treatment scope beyond the file
          creates/renames already in 6.3.

    - `[x]` **2.5.c State-dir graduation semantics**
        - New § State-Dir Graduation describes `backlog/provisional/<wu-name>/` → `backlog/planned/<wu-name>/` as a
          `git mv` co-committed with the regenerated ROADMAP. Trigger framed as the maintainer commitment; ROADMAP
          regen as the observable effect (derived-surface framing preserved). `**State:**` invariant across graduation
          (Planning stays; commitment lives in dir location). R37 reference dropped per DEV-RULES.ARC § Documentation
          Boundaries; cross-ref to `strategy-work-organization.md § Work Unit State` covers the State enum.

    - `[x]` **2.5.d Cohort wrapper subdir convention**
        - New § Cohort Wrapper Subdirs codifies `backlog/{state}/<cohort>/<wu-name>/` with three constraints
          (backlog-only, codified-cohorts only, state-uniform). Internal WU naming ("parallelism-trio") dropped per
          DEV-RULES.PROJECT § Audience Boundaries — example replaced with generic "formally tracked groups of WUs
          intended to ship together" framing. Cross-ref to `**Cohort:**` field on the meta file.

- _Outcome:_ Strategy doc fully restructured to post-WOR shape — five new sections (Four-surface table, Ceremony-only
  writes, State-dir graduation, Cohort wrapper subdirs) folded between the existing intent-routing sections and the
  scaling/fit sections. Bucket-file references (`BACKLOG-FEATURE` / `BACKLOG-TECHNICAL`) retired from install table.
  R-ID references kept out of body prose; cross-links to `strategy-work-organization.md § ROADMAP` / § Work Unit State
  carry the structural references. Both copies (`.arc/` + package source) byte-identical. Tier 1 markdown lint clean
  (0 errors across 246 files).

### `[ ]` **2.6 `strategy-configurability-architecture.md` — inventory + extension naming + reserved names**

- _Goal:_ `strategy-configurability-architecture.md` carries (a) the planning-checkpoint review convention-inventory
  entry per the `review.pre_merge` precedent, (b) the extension fire-point naming convention codification, and (c) the
  reserved-for-future extension names registry.
    - `[ ]` **2.6.a Convention inventory entry: planning-checkpoint review**
        - "Planning checkpoint review | P2/P4 | No checkpoint stop | Config setting + Extension." Mirrors
          `review.pre_merge` shape.

    - `[ ]` **2.6.b Extension fire-point naming convention**
        - Pattern: `{pre|post}-{lifecycle-event-name}` where event-name is the next concrete workflow step or git
          operation; event-names must reflect the actual local fire-point, not an upstream UI-level event; frequency
          must be wireable to match the name's semantic (if `pre-commit-review`, then every commit pathway).
        - _Note:_ The `{pre|post}-{event}` pattern reflects current practice — `.arc/system/extensions/` already ships
          both families (`pre-*` and `post-*`, e.g., `post-task-completion`, `post-work-unit-archive`). R55 codifies
          existing convention, not new extensibility framing.

    - `[ ]` **2.6.c Reserved-for-future names registry**
        - Document `pre-push-review` as reserved (ships as no-default no-op file); future entries listed here keep the
          namespace coherent.

    - `[ ]` **2.6.d Family enumeration table**
        - Table mirroring PRD R56: extension → fire-point → wired-into → default. Adopters reading the strategy doc see
          the full family in one place.

### `[ ]` **2.7 `strategy-work-organization.md` § Spec-Flow Invariants**

- _Goal:_ A new § Spec-Flow Invariants section in `strategy-work-organization.md` codifies the three invariants WOR
  lands (`meta-*` always exists; task list structure invariant; parseable spec exists in some form before tasks) and the
  two scaling axes governing optionality above them (mode: Lite/Full + `pm.mode`; tier: atomic/quick/standard per AWL).
  Explicitly defers the spec-flow contract (which spec form applies per mode × tier; `plan-*` required vs optional;
  verification model under tier collapse) to arc-plan Conductor + AWL. Establishes the interface those downstream WUs
  consume.

- _Context:_ This section is the load-bearing anchor for the WOR scope-expansion items (PRD R22a / R22b / R22c). Without
  it, AWL and conductor have no codified anchor to land their contract on top of; with it, they pick up the invariants
  and fill in the policy.

- _Placement:_ Section ordering decided at execution. Candidate placements within `strategy-work-organization.md`: after
  § Work Unit State (sibling-level meta-concern), after § Planning Module (planning-pipeline-adjacent), or new top-level
  section before § Team Coordination.
    - `[ ]` **2.7.a Three invariants codification**
        - `meta-*` always exists across entire WU lifecycle (PRD R22a) — created at WU stub creation; persists through
          state transitions; single source of truth for state / owner / dependencies / cohort / spec pointer.
        - Task list structural invariance — phase headings, leaf task format, completion markers, Success Criteria
          section. Tier-aware ceremony (atomic / quick / standard scaling) is AWL scope; the structural shape stays
          uniform.
        - A parseable spec exists in some form before task-list generation — form varies by mode × tier; existence does
          not.

    - `[ ]` **2.7.b Two scaling axes (mode + tier)**
        - **Mode axis** — Lite vs Full ARC; `pm.mode: arc-in-git` vs `none`. Different artifact sets per mode. Section
          lists known modes with status (Full + arc-in-git shipping; others per `plan-arc-modes.md`; conceptual
          `pm.layer` collapse framing landed in PRD R12, with the actual value-set change shipping in
          `plan-arc-modes.md` scope).
        - **Tier axis** — atomic / quick / standard per AWL's current lean (`technical/plan-agile-wu-lifecycle.md`).
          Each tier carries different artifact requirements; strategy section flags the axis but routes the per-tier
          contract to AWL rather than codifying tier shapes itself (AWL's per-tier design may still iterate before its
          own PRD lands).

    - `[ ]` **2.7.c Spec-flow contract deferral (explicit)**
        - State that the optionality contract (which spec form applies under which mode × tier combination) lives in
          arc-plan Conductor + AWL — NOT WOR. WOR ships invariants + scaling hooks; downstream WUs land the policy.
        - Forward-pointer to `feature/plan-arc-plan-conductor.md` and `technical/plan-agile-wu-lifecycle.md`.

    - `[ ]` **2.7.d Escape-hatch guardrail framing**
        - Note that tier classification (AWL) carries the discipline mechanism — one-way promotion (atomic → quick →
          standard easy; demotion hard); explicit `--tier atomic` opt-in (default `quick`); conductor's
          escalation-suggestion behavior on novelty cues; tier-invariant disciplines (process-task-loop, quality gates,
          commit discipline). WOR preserves the structural cuts; AWL + conductor enforce policy.

### `[ ]` **2.8 `strategy-work-organization.md` § Incidental Work Model + § Work Categories transitional retirement**

- _Goal:_ The two existing top-level sections in `strategy-work-organization.md` that frame the incidental WU model and
  the category-based WU classification (`feature/` / `technical/` / `incidental/`) reshape under WOR's R49a transitional
  framing — substrate retires here; full content retirement awaits Worktree Foundation (shift lifecycle) + Agile WU
  Lifecycle (workflow + conceptual retirement).

- _Context:_ Existing § Incidental Work Model documents `incidental/<name>` branch model, `active/incidental/` category
  dir, status-file pointer fields (`Interrupts:` / `Paused At:` / `Paused To:`), and routes to
  `manage-incidental-work.md`. All four are retired by WOR's R1 + R3 + R8-R14 + R58 + R15. § Work Categories describes
  the prefix-based classification (planned vs reactive) that R1's CB core-6 alignment retires entirely. Both sections
  become structurally orphaned under WOR but the workflow they reference (`manage-incidental-work.md`) still exists
  pending AWL retirement.

- _Approach:_ Transitional forward-pointer reshape, not deletion. Each section collapses to a short paragraph naming
  what WOR retired (with R49a as the citation) and what's pending (forward-pointers to WF for shift state + AWL for
  workflow retirement). Full section deletion rides AWL's incidental retirement sweep.

    **Strategies:** none (this is a strategy doc edit)

    - `[ ]` **2.8.a § Incidental Work Model reshape**
        - Replace section body with: brief framing of the WU pattern's historical role; explicit list of substrate
          retired under WOR (branch prefix + category dir + pointer fields); forward-pointer to
          `manage-incidental-work.md` for the transitional interrupt workflow (note: workflow's substrate is gone but
          workflow itself remains pending WF/AWL); citation to PRD R49a; pointer to
          `technical/plan-worktree-foundation.md` for shift-state replacement + `technical/plan-agile-wu-lifecycle.md`
          for full retirement.

    - `[ ]` **2.8.b § Work Categories reshape**
        - Replace section body with brief framing that prefix-based categorization retires under R1's CB core-6
          alignment; forward-pointer to the new § Branching section (Task 2.1 — CB core-6 type set, `plan/<name>`
          rotation, single-branch-per-WU); citation to PRD R49a for the historical context.

    - `[ ]` **2.8.c Reference-link cleanup**
        - Audit reference-style link definitions at file end for `[manage-incidental]:` and similar. Retain links
          pointing to surviving workflows; surface any orphan link definitions for retirement under 6.7.i's
          cross-reference sweep.

    - _Note:_ Coordinates with Task 2.1's _Context_ ("Existing file has § Branching as a subsection under § Incidental
      Work Model... Elevate § Branching to top-level, reshaping incidental-specific content into a child subsection").
      2.1 owns the § Branching elevation; 2.8 owns the parent § Incidental Work Model + § Work Categories reshape.
      Execute in coordination (likely same session) to avoid mid-edit structural inconsistency.

### `[ ]` **2.9 `strategy-work-organization.md` § WU Artifact Headers (chain-model convention)**

- _Goal:_ A new § WU Artifact Headers section in `strategy-work-organization.md` codifies the cross-file header
  convention per PRD R58a — chain-of-authority model where each non-meta WU artifact carries its immediate-upstream
  pointer; meta-\* carries the full chain as canonical authority. Documents the principle, the per-file field set,
  drift-cost rationale, and the deliberate `Spec` generalizability across tier × mode variants.

- _Context:_ Cross-file header conventions previously lived implicitly across `template-*` files with no centralized
  articulation. WOR is the moment to codify since meta-\*'s shape (R58) becomes the anchor for the whole chain. Strategy
  section makes the principle adopter-readable.

- _Placement:_ After § Branching (Task 2.1) and § Per-Worktree Isolation (Task 2.2) — sits in the structural-conventions
  cluster. Decide final ordering at execution.
    - `[ ]` **2.9.a Principle: chain-of-authority direction**
        - State the chain: `Origin → Spec → Task List → PR URL`. Each artifact downstream of its predecessor; downstream
          artifacts carry the immediate-upstream pointer; meta-\* carries the full chain.

    - `[ ]` **2.9.b Per-file header field table**
        - Table mirroring PRD R58a: file → header field(s) → substantive opening. Five rows (meta / plan / prd / tasks /
          notes). atomic-\* omitted (retires under WF per the WF plan scope).

    - `[ ]` **2.9.c Bounded-duplication + drift-cost rationale**
        - Explain why principled redundancy (`Origin` on meta/plan/prd; `Spec` on meta/tasks) is acceptable: each
          non-meta carries exactly one 1-hop pointer; values are structurally immutable (Origin set at WU creation;
          tasks-\* Spec fixed at task-list creation); meta retains authority as the only artifact carrying the full
          chain.

    - `[ ]` **2.9.d `Spec` field generalizability (deliberate forward-compat)**
        - Document the `Spec` field's deliberate generalizability: today's standard tier uses PRD as the spec; future
          tier variants per AWL (atomic / quick / standard) or future modes per arc-plan Conductor / Lite mode may use
          lighter-templated spec artifacts (compact PRD, scope-section variant, external-tracker-referenced spec, etc.).
          Field name `Spec:` is generalizable — does not lock to "PRD." Forward-pointers to AWL + arc-plan-conductor +
          arc-modes plans for the downstream contract.

    - `[ ]` **2.9.e Retired-duplication rationale**
        - Brief note: `**Purpose:**` field on `tasks-*` retires (was PRD-Purpose mirror; not a 1-hop pointer;
          substantive-content drift surface). PRD remains canonical for purpose statement; tasks-\* readers reach it via
          the `Spec:` pointer.

### `[ ]` **2.10 `strategy-file-classification.md` — `meta-*` file class + retired prefixes + retired work-categories**

- _Goal:_ `strategy-file-classification.md` reflects WOR's file-taxonomy shifts — `meta-*` file class introduced (per-WU
  pointer; replaces `status-*`); `completion-*` file class retired (folds into meta-file archive-phase sections per
  R14); `feature/` and `technical/` work-category labels retired per R1's CB core-6 alignment.

- _Context (from grep, 2026-05-14):_ Existing file has three substantive WOR-affected touch points:
    - Line ~90 — table entry defining `completion-` as a file-class with example `completion-api-modernization.md`.
      Retire the row (file class folds into meta archive-phase sections per R14).
    - Line ~100 — prose listing `prd-`, `tasks-`, `completion-`, `notes-` as work-unit-artifact file classes sharing a
      slug. Update list: add `meta-`, drop `completion-`.
    - Line ~170 — "Work categories (`feature/`, `technical/`, ...)" prose. Reshape to new CB core-6 categories (`feat/`,
      `fix/`, `chore/`, `docs/`, `refactor/`, `perf/`, plus `plan/` for planning state) per R1 + R2.

    **Strategies:** none (this is a strategy doc edit)

    - `[ ]` **2.10.a Add `meta-` file class entry**
        - Insert new row in the file-class table: `meta-` | per-WU pointer (metadata + state + archive-phase sections) |
          Agent | `meta-api-modernization.md`. Position adjacent to `prd-` / `tasks-` rows for visual grouping with
          other WU-artifact classes.

    - `[ ]` **2.10.b Retire `completion-` file class entry**
        - Remove the `completion-` row. Brief note: completion content folds into meta-file archive-phase sections
          (`## Release Notes Entry`, `## Completion Notes`) under R14.

    - `[ ]` **2.10.c Update WU-artifact prose listing**
        - Update the line that enumerates `prd-`, `tasks-`, `completion-`, `notes-` as shared-slug work-unit artifacts:
          add `meta-`, `plan-`, `atomic-` (the complete WU artifact set under WOR); drop `completion-`.

    - `[ ]` **2.10.d Update work-categories prose**
        - Replace `feature/`, `technical/`, `incidental/` enumeration with CB core-6 (`feat/`, `fix/`, `chore/`,
          `docs/`, `refactor/`, `perf/`) plus `plan/` for planning state. Cross-reference
          `strategy-work-organization.md` § Branching (Task 2.1) for the canonical convention; this doc carries the
          file-classification implications.

    - `[ ]` **2.10.e Sync to packages/**

    - `[ ]` **2.10.f Codify one-shot template uniqueness principle (R63)**
        - Add new content (placement at execution — likely a new subsection under § File Taxonomy or adjacent) to
          `strategy-file-classification.md`: "Files instantiated once per project at CLI init / join time (driven by
          `packages/arc-framework/src/lib/classification.ts`'s render list) do not get a parallel
          `reference/templates/template-*.md` entry — the package-source `.template` is canonical."
        - Enumerate governed files: META-PRD / PROJECT-PRD, TECHNICAL-OVERVIEW, PROJECT-STATUS (retiring per R40),
          ROADMAP, BACKLOG-FEATURE / BACKLOG-TECHNICAL (consolidating into BACKLOG-INBOX per R50; principle carries to
          the successor), AGENT-BRIEF.PROJECT, QUICK-REFERENCE. Note the `classification.ts` render list as the
          canonical source.
        - Cross-reference: agent-facing `template-*.md` in `reference/templates/` (PRDs, plans, tasks, meta files,
          completion docs, ADRs, etc.) are a different mechanism — created repeatedly during work by agents /
          workflows, bracket-placeholder convention; this principle does not apply.
        - Optional adopter-customized starter templates (`template-dev-rules.md`, `template-contributing.md`) are a
          third category — present in `reference/templates/` but not in the CLI render list; copied or referenced by
          adopters as starting points for optional files. Distinguish in the strategy text.

### `[ ]` **2.11 `strategy-task-list-formatting.md` — `tasks-*` header convention update**

- _Goal:_ `strategy-task-list-formatting.md` reflects R58a's chain-model header convention for `tasks-*` files — header
  reduces to `**Spec:**` only; `**PRD:**` field name retires (renamed to `Spec` for vocabulary alignment with `meta-*`);
  `**Branch(es):**`, `**Base Branch:**`, `**Purpose:**` retire from `tasks-*` header per R58 + R58a.

- _Context (from grep, 2026-05-14):_ Existing file has two substantive WOR-affected touch points:
    - Line ~14 — "planned feature/technical work" prose framing. Update to CB core-6 framing per R1 (cross-reference
      `strategy-work-organization.md` § Branching).
    - Lines ~68-69 — explicit list of `tasks-*` header field labels (`**PRD:**`, `**Branch(es):**`, `**Purpose:**`).
      Update to reflect R58a's chain-model: `tasks-*` carries `**Spec:**` only; atomic file `**Purpose:**`,
      `**Ordering:**` retain (`atomic-*` convention unchanged in WOR).

    **Strategies:** none (this is a strategy doc edit)

    - `[ ]` **2.11.a Update "planned feature/technical work" prose**
        - Drop category labels; reference `strategy-work-organization.md` § Branching for the CB core-6 + `plan/`
          rotation convention. Categorization stays in work-organization, not here.

    - `[ ]` **2.11.b Update `tasks-*` header field list**
        - Replace `**PRD:**`, `**Branch(es):**`, `**Purpose:**` enumeration with `**Spec:**` only (single header field
          per R58a). Atomic-\* `**Purpose:**` / `**Ordering:**` line unchanged.
        - Brief forward-pointer to `strategy-work-organization.md` § WU Artifact Headers (Task 2.9) for the chain-model
          rationale.

    - `[ ]` **2.11.c Audit § Bold (header preamble) and § File-header metadata rules**
        - Verify rule statements continue to hold under the slimmer header — bold field-label convention stays; the
          field-set just contracts. Spot-fix any examples that show the retired fields.

    - `[ ]` **2.11.d Sync to packages/**

### `[ ]` **2.12 Author instance-file orientation content into strategy docs (R59 precondition)**

- _Goal:_ `strategy-session-operations.md` gains SESSION-NOTES orientation content (purpose, lifecycle, portability,
  writing-guide pointer); `strategy-planning-module.md` gains inbox-family orientation content (USER-INBOX,
  BACKLOG-INBOX, `backlog/ATOMIC-INBOX.md` purposes + lifecycles + write-discipline). Lands before R59 strips preambles
  from instance files in Phase 6.8 — otherwise orientation goes from "in-file" to "nowhere" until a future WU.

- _Context:_ Confirmed via grep (2026-05-14) that the two strategy docs currently carry no orientation content for the
  affected instance files. R59 references these strategies as the authoritative orientation home, but the content
  doesn't exist yet. Task 6.8.d's punt ("not WOR scope to author new strategy content") accepts the gap; this task
  closes it instead. Single-session work, low scope expansion; ships clean instead of carrying an orientation hole
  through to the next docs sweep.

    **Strategies:** none (this is a strategy doc edit)

    - `[ ]` **2.12.a SESSION-NOTES orientation in `strategy-session-operations.md`**
        - Add a § SESSION-NOTES (or similarly-titled) subsection. Content scope: purpose (personal session context
          companion to `meta-*`); lifecycle (created at handoff; consumed at session-init; deleted between WUs);
          portability (git notes attach `user/{identity}/` across machines per existing operations); writing-guide
          pointer (forward to `session-handoff.md` for detailed content guidance). Draft from the existing SESSION-NOTES
          preamble blockquote content — the strategy absorbs what the file's "About this file" block currently carries.

    - `[ ]` **2.12.b Inbox orientation in `strategy-planning-module.md`**
        - Add a § Inbox Family (or similarly-titled) subsection. Content scope per inbox:
            - `user/{identity}/USER-INBOX.md` — per-user gitignored capture (Atomic / Backlog sections; drain at
              activation absorption / integration drain)
            - `backlog/BACKLOG-INBOX.md` — project-shared multi-step entries (ceremony-only writes per R20)
            - `backlog/ATOMIC-INBOX.md` — project-shared atomic-character entries (ceremony-only writes)
        - Write-discipline summary (cross-reference DEV-RULES.ARC § Leave it cleaner for the constitutional
          ceremony-only-write rule landed in Task 1.3.b).

    - `[ ]` **2.12.c Verify orientation coverage is sufficient**
        - Spot-check the authored content against the SESSION-NOTES / inbox preambles being retired in 6.8. Anything the
          preamble carried that the strategy doesn't subsume yet, fold in. Goal: zero net orientation loss across the
          R59 transition.

    - `[ ]` **2.12.d Sync to packages/**

### `[ ]` **2.13 Commit-format method + footer-convention propagation (R27, R29a)**

- _Goal:_ `commit-format.md` method carries the `docs` discipline principle (R27); `commit-context-format.md` method
  renames to `commit-footer.md` with full body rewrite per R29a (chain naming, standalone anchor, parenthetical matrix
  updates, discreteness test); hook regex + error examples align with the new matrix; smoke tests lock the matrix. The
  `status-` → `meta-` filename-token portion of the regex stays at `status-` here and flips at Task 6.2.i atomically
  with the in-flight file rename (6.2.a).

- _Sequencing-critical:_ Must land before Phase 3 lifecycle workflow restructures (3.3-3.5, 3.11) which emit the new
  parenthetical patterns. Otherwise commits referencing the new patterns fail hook validation. **This task was hoisted
  out of original Phase 6 (was 6.2)** to bring its position in line with its execution-order constraint — Phase 2's
  natural end is the right home for constitutional method + hook propagation that gates downstream workflow
  restructures.

    **Strategies:** `strategy-package-project-sync.md`

    - `[ ]` **2.13.a Codify `docs` discipline in `commit-format.md`** (R27)
        - Principle paragraph + four type-definition lines (feat / fix / refactor / docs) + rule of thumb. ~8-10 lines
          added; method's token budget respected.
        - Sync to packages/.

    - `[ ]` **2.13.b Rename `commit-context-format.md` → `commit-footer.md`**
        - `git mv .arc/system/methods/commit-context-format.md .arc/system/methods/commit-footer.md`.
        - Update method frontmatter `name:` field to `commit-footer`.
        - Sync to `packages/arc-framework/arc/system/methods/`.
        - _Note:_ Config key `commit.context_footer` retained (slot identity decoupled from filename) — no
          `arc-config.yml` changes needed.

    - `[ ]` **2.13.c Rewrite `commit-footer.md` method body per R29a**
        - Chain naming in preamble: footer names the deepest spec-shaped artifact under edit along the WU chain (Origin
          → Spec → Tasks → Atomic); falls back to `standalone` when no active WU.
        - Discreteness test for `(incidental during X)` vs `standalone` codified as a single binary check ("active
          WU?").
        - Standalone anchor section replaces prior `{category} (no associated task list)` patterns; parenthetical vocab
          `maintenance | planning | documentation | refactor`. Note off-WU `(planning)` semantic (queue-shaping; ROADMAP
          / BACKLOG-INBOX edits) vs file-pointer `(planning)` (spec iteration).
        - Meta-\* section: rename heading "Status-file references" → "Meta-file references"; add `(maintenance)` and
          `(deactivation)` parentheticals; drop `(planning)`. Filename-token example bodies stay at `status-` here; flip
          at 6.2.i.
        - Tighten `(incidental - discovered during X)` → `(incidental during X)`.
        - Drop `content` from off-WU category list.
        - Sync to packages/.

    - `[ ]` **2.13.d Update `system/githooks/commit-msg` regex + error examples (non-filename portion)**
        - tasks-\* parenthetical regex: `(incidental - discovered during .+)` → `(incidental during .+)`.
        - meta-\* (still `status-` filename token here; flips at 6.2.i) parenthetical regex: add `deactivation` and
          (separately) `maintenance` to the alternation; drop `planning` (was accepted previously).
        - New standalone-anchor regex: `^Context: standalone \((maintenance|planning|documentation|refactor)\)$`.
        - Retires the prior off-WU regex:
          `^Context: (planning|documentation|maintenance|refactor|content) \((atomic / )?no associated task list\)$`.
        - Error-message example list updates to reflect the new matrix (lines 161-183 in current hook).
        - Sync to packages/.

    - `[ ]` **2.13.e Update inbound references to renamed method**
        - `system/methods/README.md`: method-list entry rename `commit-context-format` → `commit-footer`.
        - `system/workflows/arc/supplemental/prepare-commits.md`: frontmatter `arc.methods: - commit-context-format` →
          `commit-footer`; body refs `[arc-methods-ccf]` link target updates (rename file + rename anchor if
          conventional).
        - `arc-commit` skill (`SKILL.md` Read-path reference).
        - `reference/constitution/DEV-RULES.ARC.md`: reference link `[arc-methods-ccf]` updates target (or rename
          anchor + target).
        - Sync packages/ copies.
        - _Note:_ `docs/**` references deferred to docs-content sweep (captured in `plan-docs-content-sweep.md`).

    - `[ ]` **2.13.f Footer-convention smoke tests (positive + negative cases)**
        - Positive cases (one per matrix cell from R29a): `tasks-*` with all parentheticals; `plan-*` / `prd-*` with
          `(planning)` / `(code review)`; `meta-*` with all ceremonies plus `(maintenance)` plus `(incidental during X)`
          plus `(deactivation)`; standalone with all 4 categories; `atomic-*`; contribution.
        - Negative cases: `(content)` parenthetical (retired); `(maintenance)` on `plan-*`; `(planning)` on `meta-*`;
          off-WU patterns using old `(no associated task list)` shape; `(incidental - discovered during X)` form (now
          retired phrasing).
        - Test fixture location: TBD at execution — extends 6.1.d's hook smoke-test pattern (shell loop) or adds a
          vitest integration test under `packages/arc-framework/__tests__/integration/`.
        - _Note:_ This locks regex-vs-method drift. Re-run on every regex/method edit going forward.

## **Phase 3:** Boundary workflow restructure + ceremony fire-points

_Purpose:_ Restructure activate / integrate / archive workflows for single-branch-per-WU; wire PROJECT-PRD alignment,
ROADMAP regeneration, capture-pipeline ceremony writes (absorption / drain / promotion), config keys, and the new
extension point.

_Design decisions:_ Capture-pipeline ceremony writes (R20, R21) fold into each affected workflow rather than a
horizontal cross-cutting parent — workflow-level units stay coherent. R53 inline-fold audits stay one parent with five
subtasks per § Inline-folds scope discipline. `integrate-work-unit.md` owns composition (R14, R30, R31) regardless of
cadence; `archive-work-unit.md` owns archival mechanics (state flip + sweep + ROADMAP regen) as a cadence-invariant
single source of truth — DRY across cadences. Cadence dispatch lives in integrate (3.4.g), not archive. Within-phase
ordering: 3.7 (config keys) ideally lands before 3.3 / 3.5 runtime verification — workflow text can forward-reference,
but runtime checks of `review.planning_checkpoint` halt and `archive.cadence` dispatch need both present.

### `[ ]` **3.1 Retire `integrate-planning-branch.md`**

- _Goal:_ `integrate-planning-branch.md` is deleted; the workflow no longer exists in the ARC surface —
  single-branch-per-WU eliminates the separate planning-PR concept entirely. Cross-reference updates ride the migration
  sweep (6.7).
    - `git rm .arc/system/workflows/arc/work-unit-lifecycle/planning/integrate-planning-branch.md` plus the `packages/`
      counterpart.

### `[ ]` **3.2 Rename `activate-planning-branch.md` → `init-work-unit.md` (WU + meta-file creation)**

- _Goal:_ `init-work-unit.md` (renamed from `activate-planning-branch.md`) creates a WU on a `plan/<name>` branch with a
  meta file populated from `template-meta.md` — initial `**State:** Planning`, `**Owner:**` auto-populated from
  `arc.identity` via template placeholder, other fields defaulted per template.

    **Strategies:** `strategy-work-organization.md`

    - `[ ]` **3.2.a Rename file + sync to packages/**
        - `git mv .arc/system/workflows/arc/work-unit-lifecycle/planning/activate-planning-branch.md .arc/system/workflows/arc/work-unit-lifecycle/planning/init-work-unit.md`
          plus packages/ counterpart.

    - `[ ]` **3.2.b Responsibility shift: WU + meta-file creation**
        - Steps: create `plan/<name>` branch; create `meta-{name}.md` in `active/` from `template-meta`; fill
          placeholders (`[arc.identity]` → identity value); commit. Plan-doc creation is a subsequent step (existing
          workflow logic; preserve).

    - `[ ]` **3.2.c Wire `template-meta.md` reference (created in 4.1)**
        - Reference template path is stable; body draft works without 4.1 complete. If 4.1 lands in a parallel session,
          no rework needed here.

### `[ ]` **3.3 Restructure `activate-work-unit.md` (state-flip + branch rename + absorption-write + ROADMAP regen)**

- _Goal:_ `activate-work-unit.md` transitions a WU from Planning to Active via in-place state-flip + branch rename +
  absorption-write + ROADMAP regen + supplementary PROJECT-PRD alignment check — no new branch creation, no directory
  move.

    - _Approach:_ Three-step branch rename routing per § Technical Considerations — raw local rename (`git branch -m`),
      class-tagged push (`workflowPush`), raw destructive delete (`git push --delete`). Pre-condition gate at top
      verifies running on `plan/<name>` before any step fires.

    **Strategies:** `strategy-work-organization.md`

    - `[ ]` **3.3.a Pre-condition check + `[!NOTE]` redirect block**
        - Verify on `plan/<name>` branch with `**State:** Planning`; if WU doesn't exist (no `plan/<name>`, no
          `meta-{name}.md`), `[!NOTE]` block at top redirects to `init-work-unit.md`.

    - `[ ]` **3.3.b Pre-execution-graduation extension fire (R47)**
        - Extension defined in 3.8; this step is the fire-point reference. Halt-on-fail with surface-for-user; user can
          fix-and-retry or explicit-invoke bypass.

    - `[ ]` **3.3.c `review.planning_checkpoint` halt (R46)**
        - When `required`: workflow halts here, awaits explicit approval. When `disabled`: no halt. Per R47, independent
          of extension fire — extension runs first; if it passes, config decides.

    - `[ ]` **3.3.d PROJECT-PRD + TECHNICAL-OVERVIEW supplementary checks (R34, R60 — conditional)**
        - Two sub-bullets within existing review step.
        - **PROJECT-PRD check (R34):** Fires only when PROJECT-PRD edited since PRD approved. Soft check; rarely blocks.
        - **TECHNICAL-OVERVIEW check (R60):** Fires only when TECHNICAL-OVERVIEW edited since PRD approved AND PRD
          touches technical surfaces (tech stack, architecture, runtime, dependencies, infrastructure). Soft check;
          rarely blocks. Independent of PROJECT-PRD check — scope distinction is the trigger.

    - `[ ]` **3.3.e State-flip + plan-doc removal**
        - Edit meta file: `**State:** Planning` → `**State:** Active`. `git rm plan-{name}.md` if present (graduated
          content is in PRD by now).

    - `[ ]` **3.3.f Branch rename: 3-step routing (R2)**
        - Step 1 (raw): `git branch -m plan/<name> <type>/<name>`.
        - Step 2 (`workflowPush`): `git push -u origin <type>/<name>` — class-tagged for release-wrapper routing per
          DEV-RULES.ARC § Workflow class-tag routing.
        - Step 3 (raw): `git push origin --delete plan/<name>` — destructive flag stays literal; wrapper refuses
          `--delete` by design.

    - `[ ]` **3.3.g Absorption write (R20, R21)**
        - If activation absorbs queued inbox entries (USER-INBOX or shared inboxes) into the WU's task list or planning
          surface, finalize absorption commits here. Deletion from inbox rides the absorbing commit; routing recorded in
          commit message.

    - `[ ]` **3.3.h Regenerate ROADMAP (R39)**
        - Hand-maintain (interim, pre-CLI) per algorithm in 2.4. Commit ROADMAP update separately or ride the state-flip
          commit per atomicity discipline.
        - _Note:_ Atomicity (DEV-RULES.ARC § Atomicity, "one logical change per commit") treats state-flip and ROADMAP
          regen as distinct logical changes. Default recommendation: separate commit. Riding the state-flip commit is
          acceptable only if the ROADMAP edit is trivial (e.g., single tier-line move).

### `[ ]` **3.4 Restructure `integrate-work-unit.md` (sweep + composition + Release Notes Entry + ROADMAP regen)**

- _Goal:_ `integrate-work-unit.md` ships the single merge-to-main moment under default
  `archive.cadence: with-integration` — code commits + completion-content commits (Release Notes Entry + Completion
  Notes composed into meta file's archive-phase sections) + sweep commits (meta file moves to
  `archive/<dated>/{wu-name}/`) — all in one multi-commit PR.

    - _Approach:_ Three-commit structure per § Technical Considerations — code → completion content → sweep. Reviewers
      focus per-commit. Under `archive.cadence: deferred`, completion + sweep defer to `archive-work-unit.md`; this
      workflow's behavior conditions on cadence.

    **Strategies:** `strategy-work-organization.md`

    - `[ ]` **3.4.a Pre-conditions + State transition (Active → Integrating)**
        - Verify on WU branch; verify `**State:** Active`; flip to `**State:** Integrating` (R31 fire-point under
          with-integration).

    - `[ ]` **3.4.b Release Notes Entry composition (R14, R30)**
        - Compose user-facing entry into meta file's archive-phase section. Categories: Added | Changed | Removed |
          Fixed | Infrastructure | Deprecated | Security (Keep a Changelog 7-category set). One-paragraph summary;
          optional Breaking Changes callout.

    - `[ ]` **3.4.c Completion Notes composition (R14)**
        - Narrative summary into meta file's Completion Notes section.

    - `[ ]` **3.4.d PROJECT-PRD + TECHNICAL-OVERVIEW final flag checks (R34, R60 — sub-bullets)**
        - Two sub-bullets within existing review step. Both soft; rarely block if 1_create-prd's checks passed. Surface
          any conflicts discovered during execution.
        - **PROJECT-PRD:** Always evaluated at this step.
        - **TECHNICAL-OVERVIEW:** Fires only when PRD touched technical surfaces.

    - `[ ]` **3.4.e Commit completion content**
        - Class-tagged `workflowCommit` if release-wrappers active; carries Release Notes Entry + Completion Notes
          additions.

    - `[ ]` **3.4.f Drain-write (R20, R21)**
        - If integration drains any shared inbox entries (entries that were absorbed into this WU's scope and need final
          deletion from the shared inbox), finalize deletions here. Rides with the completion-content commit or as
          separate commit per atomicity.

    - `[ ]` **3.4.g Cadence dispatch — invoke `archive-work-unit.md` inline under `with-integration`**
        - Read `archive.cadence` from `arc-config.yml`.
        - `with-integration` (default): invoke `archive-work-unit.md` inline at this point. archive-work-unit handles
          state flip `Integrating → Shipped`, sweep commits, and ROADMAP regen per its cadence-invariant body (3.5).
          Returns; resume here with PR creation.
        - `deferred` | `manual`: skip inline invocation; surface a note at workflow exit that archive runs separately
          post-merge per user invocation.

    - `[ ]` **3.4.h Pre-pr-review extension fire (R56) — before PR creation push**
        - Pre-PR-creation fire-point. Extension defined in 3.8 (renamed from current `pre-merge-review` to
          `pre-pr-review` for honest naming per R55). The current extension carries CodeRabbit invocation logic which
          carries forward under the new name; the wiring location in `integrate-work-unit.md` updates from old
          `pre-merge-review` reference to `pre-pr-review`. Halt-on-fail surfaces actionable message; user can fix and
          retry or explicit-invoke bypass.

    - `[ ]` **3.4.i PR creation + workflow-interlock**
        - Single PR (no `[PLAN]:` prefix retired per R6). Multi-commit structure preserved for per-commit review.

    - `[ ]` **3.4.j Pre-merge-review extension fire (R56)**
        - Post-review-response, pre-merge fire-point. Extension defined in 3.8; this step is the fire-point reference.
          Sits between `review-response` (plan-review-method-family scope) and the actual merge action; halt-on-fail
          surfaces actionable message. Default-inactive extension; this wiring is structural even when extension is off.

### `[ ]` **3.5 Restructure `archive-work-unit.md` (single source of truth for archival mechanics; cadence-invariant body)**

- _Goal:_ `archive-work-unit.md` carries the archival mechanics — state flip `Integrating → Shipped`, sweep commits,
  ROADMAP regen, post-Shipped errata convention. Invariant body regardless of invocation context: invoked inline from
  `integrate-work-unit.md` under `with-integration` cadence (via 3.4.g), or standalone post-merge under `deferred` /
  `manual`.

- _Approach:_ DRY — composition stays in integrate per R31; archive owns archival mechanics. Cadence dispatch lives in
  integrate (3.4.g), not here. The workflow's pre-condition gate verifies state is already `Integrating`; composition
  must have happened upstream.

    **Strategies:** `strategy-work-organization.md`

    - `[ ]` **3.5.a Pre-condition check (state `Integrating`)**
        - Verify meta file shows `**State:** Integrating`. Halt with surface if not — upstream composition (in
          `integrate-work-unit.md`) is the prerequisite.

    - `[ ]` **3.5.b State flip `Integrating → Shipped`**
        - Edit meta file: `**State:** Integrating` → `**State:** Shipped`. Single direction; always.

    - `[ ]` **3.5.c Sweep commits (R5, R17, R41)**
        - `git mv .arc/active/<cat>/meta-{name}.md .arc/archive/<dated>/{name}/meta-{name}.md`. Companion files
          (`tasks-*`, `atomic-*`, `notes-*`, etc.) move alongside.

    - `[ ]` **3.5.d Regenerate ROADMAP (R39)**
        - Archive transition is a regen fire-point. Hand-maintain (interim, pre-CLI) per algorithm in 2.4.

    - `[ ]` **3.5.e Post-Shipped errata convention note (R32)**
        - Workflow body documents the convention: Release Notes Entry edits after `Shipped` are errata only; git history
          is the lock (matches keep-a-changelog norms); no mechanical enforcement.

### `[ ]` **3.6 Wire PROJECT-PRD alignment check + promotion-write into `1_create-prd.md`**

- _Goal:_ `1_create-prd.md` adds an explicit PROJECT-PRD alignment check step with halt-and-ask conditions (cite
  specific principle by number when passing) + finalizes promotion writes when a BACKLOG-INBOX entry promotes to a draft
  `plan-*` doc.
    - `[ ]` **3.6.a New step: `## Step N: PROJECT-PRD alignment check`**
        - Explicit step with halt-and-ask conditions enumerated. Triggers: PRD scope appears to conflict with a
          PROJECT-PRD principle; PRD introduces an anti-goal; PRD touches load-bearing axes the PROJECT-PRD pins.

    - `[ ]` **3.6.b Cite-principle-by-number requirement on pass**
        - Step concludes by citing the specific principle the PRD aligns with (e.g., "checked against principle 3 —
          passes"). Not just "checked, passed" (per `notes-work-organization-reform.md` § PROJECT-PRD live-vs-stale
          tension).

    - `[ ]` **3.6.c Promotion write (R20, R21)**
        - When a BACKLOG-INBOX entry promotes to a `plan-*` doc, delete the inbox entry in the same commit as the
          `plan-*` creation. Routing record lives in the deletion commit message.

    - `[ ]` **3.6.d New step: `## Step N+1: TECHNICAL-OVERVIEW alignment check` (R60)**
        - Explicit conditional step sibling to PROJECT-PRD alignment — fires only when PRD touches technical surfaces
          (tech stack, architecture, runtime, dependencies, infrastructure). Halt-and-ask conditions: drift detected
          (PRD introduces tech not in TECHNICAL-OVERVIEW); TECHNICAL-OVERVIEW edited since PRD approved. Independent of
          PROJECT-PRD check — scope distinction is the trigger (PROJECT-PRD covers mission / principles / anti-goals;
          TECHNICAL-OVERVIEW covers technical surfaces).

    - `[ ]` **3.6.e Cite-section-by-name requirement on pass (TECHNICAL-OVERVIEW)**
        - Step concludes by citing the specific TECHNICAL-OVERVIEW section the PRD aligns with (e.g., "checked against
          § 2 Architecture Components — passes"). Parallel to 3.6.b for PROJECT-PRD; section-name citation rather than
          numbered-principle citation reflects TECHNICAL-OVERVIEW's section-based structure.

### `[ ]` **3.7 Add `archive.cadence` + `review.planning_checkpoint` to `arc-config.yml`**

- _Goal:_ `arc-config.yml` carries `archive.cadence` (default `with-integration`) and `review.planning_checkpoint`
  (default `disabled`) — schema additions ride both copies (`packages/arc-framework/arc/system/arc-config.yml` +
  `.arc/system/arc-config.yml`) per package-project sync discipline.

    **Strategies:** `strategy-package-project-sync.md`

    - `[ ]` **3.7.a Add keys to package source**
        - Edit `packages/arc-framework/arc/system/arc-config.yml` — add `archive.cadence` (values: `with-integration` |
          `deferred` | `manual`; default `with-integration`) and `review.planning_checkpoint` (values: `disabled` |
          `required`; default `disabled`).

    - `[ ]` **3.7.b Sync to project instance**
        - Edit `.arc/system/arc-config.yml` to match. Pre-commit hook will flag if a Configurable file is staged
          byte-identical to package source after diverging — verify project instance retains any project-specific
          overrides.

    - `[ ]` **3.7.c CLI-side schema validation (if applicable)**
        - If `packages/arc-framework/src/lib/config/` carries a schema validator, add the two keys. No-op if validation
          is freeform / yaml-pass-through.

### `[ ]` **3.8 Extension fire-point family — 5 files (renames + new) + description/contract pass**

- _Goal:_ Five-extension fire-point family ships in `.arc/system/extensions/` (and packages/ counterparts) per R56 —
  three renames + two new files — each with audited description / contract / "Use for" framing per R57. Default-inactive
  across the family; `pre-push-review` and new `pre-merge-review` ship as `[No extension configured]` no-default shells.

    - _Approach:_ Per-extension subtask handles file rename or creation + frontmatter + Workflow/Fires/Contract block +
      `.actions` section + description/contract pass + packages/ sync. The `.actions` section retains existing content
      where extensions have it (current `pre-merge-review.md` carries CodeRabbit invocation logic; that moves with the
      file under its new name).

    **Strategies:** `strategy-package-project-sync.md`, `strategy-configurability-architecture.md`

    - `[ ]` **3.8.a `pre-activation` — new file (was proposed as `pre-execution-graduation`)**
        - Mirror existing extension shape: frontmatter (`name: pre-activation` / `description` / `active: false`);
          top-of-body block (Workflow: `activate-work-unit.md`; Fires: step 1's pre-condition gate passed — running on
          `plan/<name>`, `**State:** Planning`, PRD + tasks-\* present, before state-flip + branch rename); Contract
          documenting sequential execution, halt-on-fail, independent gating from `review.planning_checkpoint` per R47;
          `## pre-activation.actions` with `[No extension configured]` placeholder.

    - `[ ]` **3.8.b `pre-commit-review` — rename from `pre-stage-review` + description/contract audit**
        - `git mv pre-stage-review.md pre-commit-review.md` in both copies. Update frontmatter `name:`. Update
          top-of-body block: Workflow becomes "`arc-commit` skill + `prepare-commits.md`" (wiring extended; see 3.10);
          Fires becomes "After staging, before commit creation"; description/Contract revises to clarify
          extension-vs-git-hook decision boundary (extensions carry agent procedures + `workflow-interlock` stops; hooks
          carry scriptable checks). Existing `.actions` content retained.

    - `[ ]` **3.8.c `pre-pr-review` — rename from current `pre-merge-review` + description/contract audit**
        - `git mv pre-merge-review.md pre-pr-review.md` in both copies. Update frontmatter `name:`. Update Fires:
          "pre-PR-creation push at `integrate-work-unit.md`" (was "before push and PR creation" — same fire-point, more
          accurate naming). `.actions` content (CodeRabbit invocation) retained verbatim.

    - `[ ]` **3.8.d `pre-push-review` — new file (no default `.actions`)**
        - Frontmatter (`name: pre-push-review` / `description` / `active: false`); top-of-body block (Workflow: push
          wrapper / `arc release push` / `arc sync`; Fires: "Any push routed through the push wrapper"; Contract
          documents per-push frequency, halt-on-fail behavior, and the "reserved-for-future" framing — extension shipped
          to complete the family namespace). `## pre-push-review.actions` with `[No extension configured]`.

    - `[ ]` **3.8.e `pre-merge-review` — new file at post-review-response fire-point (no default)**
        - Frontmatter (`name: pre-merge-review` / `description` / `active: false`). Note: name freed by 3.8.c's rename
          of current `pre-merge-review` → `pre-pr-review`. Top-of-body block (Workflow: `integrate-work-unit.md`; Fires:
          "After `review-response` processing, before merge action"; Contract clarifies 3-extension family at
          integrate-work-unit: `pre-pr-review` → `review-response` (plan-review-method-family scope) →
          `pre-merge-review`; documents reserved-pending-final-state-check use cases). `## pre-merge-review.actions`
          with `[No extension configured]`.

    - `[ ]` **3.8.f Description/contract pass (R57) — all five files**
        - Audit each file's description, Contract block, and any "Use for" framing for alignment with WOR family
          conventions; clarify decision boundaries between extensions and adjacent mechanisms (especially
          `pre-commit-review` vs git pre-commit hook). Spot-check that frequency language matches actual wiring.

    - `[ ]` **3.8.g Sync all to packages/**
        - Mirror every file to `packages/arc-framework/arc/system/extensions/`. Verify the pre-commit hook's
          two-copy-divergence check doesn't false-positive.

### `[ ]` **3.9 Inline-fold R53 audits across touched workflows**

- _Goal:_ R53's five inline-fold audits ride this WU's workflow touches — class-tag routing, workflow-interlock
  markers, `arc sync` / `arc release push` auto-set-upstream, `integrate-work-unit` post-PR-create handoff guidance,
  and `session-init` / `session-handoff` lifecycle Next Action pointer contract — apply at the touch, not as separate
  sweeps.

    - _Note:_ The broader sweeps across untouched workflows stay with their respective inbox entries' future WUs. This
      task verifies the audits land on workflows touched by 3.1-3.8 only.

    - `[ ]` **3.9.a Commit/push class-tag routing audit on touched fire-sites**
        - Verify every commit / push site in touched workflows uses correct class-tag syntax (`taskCommit` /
          `workflowCommit` / `workflowPush`) or raw `git` per DEV-RULES.ARC § Workflow class-tag routing.

    - `[ ]` **3.9.b Workflow-interlock marker audit**
        - Verify touched workflows use `> [!IMPORTANT]` `workflow-interlock:` markers consistently at stop points;
          surface anti-patterns (mid-step stops, ambiguous wait-for-direction phrasing).

    - `[ ]` **3.9.c `arc sync` / `arc release push` auto-set-upstream behavior change**
        - Substantive code change riding the workflow trim: `pushability` matrix `blocked-no-upstream` cell resolves to
          `upstream-init` when `pushInterlock` permits. Update CLI behavior + tests in
          `packages/arc-framework/src/lib/`; verify call sites in touched workflows.
        - _Note:_ Verify the `pushability` matrix exists in `packages/arc-framework/src/lib/` before implementation. If
          absent (matrix is a new abstraction), task scope expands to matrix design; surface for re-scoping before
          starting.

    - `[ ]` **3.9.d `integrate-work-unit` post-PR-create handoff guidance refresh**
        - Update handoff guidance language to be skip-threshold-aware (no auto-handoff suggestion when remaining work
          below threshold).

    - `[ ]` **3.9.e Lifecycle Next Action pointer contract preservation in `session-init` / `session-handoff`**
        - Verify Next Action field preserves ARC lifecycle workflow prefix at handoff; project-specific detail routes to
          SESSION-NOTES, not the status field. Touched workflows don't break this contract.

### `[ ]` **3.10 Wire `pre-commit-review` into `arc-commit` skill**

- _Goal:_ The `arc-commit` skill — canonical commit entry-point — invokes `pre-commit-review` extension before commit
  creation, alongside existing `prepare-commits.md` workflow wiring. Every-commit-fires naming (R55-R56) honored by
  every-commit-pathway wiring per R57's accountability.

    - _Note:_ This is the substantive functional addition behind the `pre-stage-review` → `pre-commit-review` rename in
      3.8.b. Without arc-commit wiring, the new name would still mislead. Audit the skill's commit-creation step; insert
      the extension fire-point check before `git commit` is invoked.

    - _Note:_ Behavioral change to the canonical commit pathway — recommend integration test in
      `packages/arc-framework/__tests__/integration/` asserting `arc-commit` invokes the extension's `.actions` when
      `active: true` and halts on fail. See `strategy-testing-methodology.md` for tier placement.

    - `[ ]` **3.10.a Audit `arc-commit/SKILL.md` for the commit-creation step**
        - Locate the step that runs `git commit`; identify the right insertion point for extension fire-point check
          (after staging confirmation, before commit invocation).

    - `[ ]` **3.10.b Add extension fire-point reference**
        - Insert language: "If `pre-commit-review` extension is `active: true`, run its `.actions` before commit.
          Halt-on-fail surfaces actionable message; user can fix and retry or explicit-invoke bypass."

    - `[ ]` **3.10.c Verify `prepare-commits.md` wiring remains intact**
        - Extension fire-point in `prepare-commits.md` carries forward under the renamed extension (3.8.b updates the
          reference). 3.10 doesn't change prepare-commits; just confirms the rename didn't break the existing fire-point
          reference.

### `[ ]` **3.11 Lifecycle workflow alignment (deactivate restructure + clean update + rotate-branch retirement)**

- _Goal:_ Three additional WU-lifecycle workflows align with WOR conventions per R52a: `deactivate-work-unit.md`
  restructured for single-branch model with new case matrix; `clean-work-unit.md` updated for 4-state enum + meta-\*
  shape + redirected completion handoff; `rotate-branch.md` retired (multi-branch premise eliminated by
  single-branch-per-WU per R1, R2, R4).

- _Approach:_ Three subtasks per workflow. Sequence: deactivate restructure first (defines new case matrix that
  downstream tasks can reference); clean update second (depends on 3.4.b/3.4.c composition handoff being defined);
  rotate retirement last (mechanical `git rm` + cross-ref sweep).

- _Note:_ `verify-work-unit.md` requires only the `status-` → `meta-` filename-token update — folds into Task 6.2.i's
  propagation, not addressed here.

    **Strategies:** `strategy-package-project-sync.md`

    - `[ ]` **3.11.a Restructure `deactivate-work-unit.md` (single-branch model)**
        - _Premise change:_ Activation under WOR doesn't move artifacts (in-place rename); there's no separate impl
          branch to delete. Existing Case A/B/C/D matrix breaks under single-branch-per-WU.
        - _New case matrix:_
            - **Case A** — Active WU, no work executed, not merged → state flip Active → Planning plus branch rename
              `<type>/<name>` → `plan/<name>` (inverse of activation). Meta file edits: State + Branch field. PR closed
              if open.
            - **Case A-delete variant** — Active WU, no work executed, not merged, user wants full WU deletion (not
              return to Planning) → branch deletion plus meta file removal plus backlog/active artifact cleanup per
              `pm.mode`.
            - **Case B** — Active WU, some work executed, not merged → routes to `arc-shift` (worktree-foundation;
              future). Until then: complete via integrate-work-unit OR abandon via clean-work-unit.
            - **Case C** — Active WU, no work executed, merged to base → reversal PR (state-flip plus branch-rename
              inverse, committed via PR). Rare.
            - **Case D** — Active WU, some work executed, merged → integrate or clean.
        - Footer convention: `Context: meta-{name}.md (deactivation)` per R29a (S9). Replaces invalid
          `Context: tasks-{name}.md (deactivation)` (pre-existing bug; current hook regex rejects).
        - `manage-incidental-work.md` references retain as transitional forward-pointers per R49a (workflow itself
          retains pending AWL; substrate retired).
        - Sync to packages/.

    - `[ ]` **3.11.b Update `clean-work-unit.md` (4-state alignment + meta-file shape + redirected handoff)**
        - `status-{name}.md` → `meta-{name}.md` throughout (Step 1, Step 6, etc.).
        - `**State:** Complete` references → `**State:** Integrating` per R9 4-state mapping (Step 1 status metadata
          update; Step 6 cross-references update).
        - Remove retired-field references: `Interrupts:`, `Paused:`, `Paused To:`, `Spawned:` (Step 1
          pointer-directionality block; Step 7 grep patterns).
        - Update tasks-\* "standard structure" header list (Step 3 Mode 2): header is `**Spec:**` only per R58a chain
          model.
        - Redirect completion-doc creation handoff (Step 7 context check + closing prose): instead of pointing at
          `completion-{name}.md` creation in integrate-work-unit, point at meta file's archive-phase composition (Tasks
          3.4.b Release Notes Entry + 3.4.c Completion Notes).
        - Verify Mode 2 archival prep flow still hangs together post-rewrite — particularly the interaction with 3.4 /
          3.5's restructured composition + sweep flow.
        - Sync to packages/.

    - `[ ]` **3.11.c Retire `rotate-branch.md`**
        - `git rm .arc/system/workflows/arc/work-unit-lifecycle/rotate-branch.md` +
          `packages/arc-framework/arc/system/workflows/arc/work-unit-lifecycle/rotate-branch.md`.
        - Inbound-reference sweep: grep for `rotate-branch` across `.arc/`, `packages/arc-framework/arc/`; retire each
          reference (or redirect if any context still applies — none expected under single-branch-per-WU).
        - _Note:_ R51 lists `rotate-branch.md` in the doc-retirement set; R52's cross-ref sweep may already cover the
          inbound-reference sweep. Coordinate at execution to avoid duplicate work.

## **Phase 4:** Template evolution + PROJECT-PRD content rewrite

_Purpose:_ Encode the new meta-file shape, PROJECT-PRD template, and rewrite PROJECT-PRD content as a dogfooding pass
that surfaces shape ambiguities feeding back into `template-project-prd.md` v1.1.

_Design decisions:_ PROJECT-PRD update-trigger discipline (R36) lives in `template-project-prd.md` itself — the template
carries the update-discipline rule alongside the shape it codifies, keeping shape + lifecycle co-located.

### `[ ]` **4.1 Create `template-meta.md` (replaces `template-status.md`) — H1 + grouped fields + content H2s**

- _Goal:_ `template-meta.md` replaces `template-status.md` with the R58 shape — `# Metadata: {name}` H1;
  blank-line-grouped field blocks under H1 (no `## Work Unit Metadata` H2 wrapper); content H2s
  (`## Release Notes Entry`, `## Completion Notes`) added at Active → Integrating transition; post-Shipped errata
  convention note included.
    - _Shape:_ See R58 in PRD for the full template skeleton. Five field groups (identity / reference / coordination /
      task pointers / directive) + post-integration block + content H2s appearing only after state transition.

    **Strategies:** `strategy-package-project-sync.md`

    - `[ ]` **4.1.a Rename + sync template file**
        - `git mv .arc/reference/templates/template-status.md .arc/reference/templates/template-meta.md` plus packages/
          counterpart.

    - `[ ]` **4.1.b Restructure to `# Metadata:` H1 + blank-line-grouped field blocks (no internal H2)**
        - H1: `# Metadata: {wu-name}`. No `## Work Unit Metadata` wrapper — fields live directly under H1 in
          blank-line-separated blocks. Field groups per R58: identity / reference / coordination / task pointers /
          directive / post-integration.
        - **Field syntax:** bullet form (`- **Field:** value`) matching the established cross-artifact convention
          (`tasks-*`, `plan-*`, `prd-*` all use bullet form per Tasks 4.5.b / 4.6 / 4.7). Visually consistent in raw
          markdown; greppable. Blank lines between field groups produce the visual grouping under R58's layout.

    - `[ ]` **4.1.c Codify life-phase fields (within H1 body)**
        - `**State:**` value-set: `Planning | Active | Integrating | Shipped` (4 values per PRD R9; strict state
          machine; commitment level lives in dir, not State). `**Integration:**` retired (folds into State as the
          `Integrating` value). State transitions fire at workflow ceremonies (`init-work-unit` creates Planning;
          `activate-work-unit` flips Planning → Active; `integrate-work-unit` flips Active → Integrating; archive
          ceremony flips Integrating → Shipped). Branch creation and branch rename do not fire State transitions —
          they're internal to Planning state until `activate-work-unit` fires.
        - `**Owner:**` singular; `[arc.identity]` placeholder substituted at meta-file creation.
        - `**Branch:**` (single value per single-branch-per-WU).
        - _Note:_ Verify existing `template-status.md`'s placeholder convention before authoring; stay consistent across
          templates and with the substitution logic in 3.2.b's `init-work-unit.md`.
        - `**Origin:**` default `[Internal]`; orthogonal to Spec; external tracker URLs land here. Ordered before `Spec`
          in the Reference group to reflect chain direction (`Origin → Spec → Task List → PR URL`) per R58a.
        - `**Spec:**` ARC-owned spec artifact pointer; **deliberately generalizable** — points at whatever the spec
          artifact is for the WU's tier × mode combination. Today's standard tier: PRD. Future tier variants per AWL
          (atomic / quick / standard) or future modes per arc-plan Conductor / Lite mode may use lighter-templated spec
          artifacts (compact PRD, scope-section variant, etc.). Field name does not lock to "PRD." See PRD R58a § Spec
          field generalizability.
        - `**Depends On:**` bare WU-name list; default `[none]`; renders into ROADMAP tier grouping.
        - `**Cohort:**` single name string; default `[none]`; source of truth for cohort membership (sibling list
          derived).
        - Active-state pointers preserved: `**Task List:**`, `**Last Completed:**`, `**Next Task:**`, `**Blockers:**`,
          `**Next Action:**`.

    - `[ ]` **4.1.d Codify post-integration metadata fields + content H2s**
        - Post-integration block within `# Metadata:` H1 body (added at integration ceremony): `**PR URL:**` (link to
          integration PR), `**Completed:**` (date stamp).
        - Content H2s (added at Active → Integrating transition; absent during life-phase): `## Release Notes Entry`
          (one-paragraph user-facing summary + categorized lines per 7-category Keep a Changelog set: Added / Changed /
          Removed / Fixed / Infrastructure / Deprecated / Security; optional Breaking Changes callout).
        - `## Completion Notes` (narrative summary of what shipped).
        - _Note:_ How to represent content H2s in the template (absent during life-phase, present after transition):
          HTML-commented examples, inline placeholder text, or pure prose description? Decide at execution — prefer the
          form least likely to mislead readers about whether the section is "present today."

    - `[ ]` **4.1.e Post-Shipped errata convention note (R32)**
        - Template includes a brief note: Release Notes Entry edits after `Shipped` are errata only; git history is the
          lock; no mechanical enforcement (matches keep-a-changelog norms).

    - `[ ]` **4.1.f Update `session-init.md` partial-read anchor (retirement)**
        - The `^## Work Unit Metadata` partial-read anchor in `session-init.md` step 3 item 7 retires; meta file becomes
          a full-read target. Update workflow body to reflect: full-read OK given small file size; archive-phase content
          gated by H2 boundary (read only when present).

    - `[ ]` **4.1.g Retire `template-completion-doc.md`**
        - Bundled with 6.6 doc retirements; flag here that completion-doc content folded into archive-phase content H2s
          of `template-meta.md`.

    - `[ ]` **4.1.h Retired-from-prior-shape field acknowledgment (in template comments)**
        - Template includes inline comment block (or surfaces in the template's intro) explicitly enumerating fields
          retired from prior `template-status.md` per PRD R58: `Branch(es)` plural form (use `Branch:` singular);
          `Base Branch:` (always `main` under single-branch-per-WU; project-level config concern);
          `Sibling Work Unit(s):` (cohort is SoT per R13; siblings derived); `Integration:` (folds into State per R9);
          `Interrupts:` / `Paused At:` / `Paused To:` (incidental WU model substrate retirement per R49a).
        - Template includes inline note enumerating fields deliberately NOT added: `Worktree:` (per-machine + derivable
          via R44 roster + WF location-template); `Tier:` (reserved for AWL); `Created:` / state-transition dates
          (derivable from git log; metrics-flavor).
        - Form: HTML comment block or template intro paragraph — chosen at execution to avoid template-body clutter.
          Goal is forward-reader clarity, not rule restatement.

### `[ ]` **4.2 Evolve `META-PRD.template.md` content shape (PROJECT-PRD shape codification)**

- _Goal:_ `META-PRD.template.md` (package source) evolves in-place to ship the PROJECT-PRD shape — Mission (1-3
  sentences) + numbered principles (5-7, quotable as nouns) + anti-goals + problem statement + design tradeoffs —
  plus the update-trigger discipline (R36) embedded alongside the shape. Per R63 (one-shot template uniqueness), the
  `.template` file is the canonical template surface; no parallel `template-project-prd.md` is created in
  `reference/templates/`. File renames to `PROJECT-PRD.template.md` at Task 4.3.h (rides with the rendered-file rename).

    **Strategies:** `strategy-package-project-sync.md`

    - _Path:_ Edit `packages/arc-framework/arc/reference/META-PRD.template.md` directly (single canonical copy in
      package source). The rendered output in `.arc/reference/META-PRD.md` is updated separately at Task 4.3 (content
      rewrite / dogfooding pass).

    - `[ ]` **4.2.a Mission section template**
        - 1-3 sentences; states the project's purpose at the highest level.

    - `[ ]` **4.2.b Numbered principles template**
        - 5-7 numbered principles; quotable as nouns (principle 3, principle 5). Each principle is a short proposition
          with one-paragraph rationale.

    - `[ ]` **4.2.c Anti-goals section template**
        - What the project explicitly will not do; bounded list.

    - `[ ]` **4.2.d Problem statement template**
        - What problem the project solves; framed in user / context terms.

    - `[ ]` **4.2.e Design tradeoffs template**
        - Major calls and their consequences; informs principle interpretation.

    - `[ ]` **4.2.f Update-trigger discipline embedded in template (R36)**
        - Block describing when PROJECT-PRD updates fire: organic (PR-time clarification when conflict surfaces) +
          event-driven (major release, scope shift, governance change). Not cadence-driven.

    - `[ ]` **4.2.g One-shot-template comment block (R63)**
        - Brief comment block at top of template noting: "This file is rendered once at `arc init` / `arc join` time
          (per `classification.ts`); evolution happens in this `.template` file. Per R63, there is no parallel
          `reference/templates/template-project-prd.md`."

### `[ ]` **4.3 Rewrite `PROJECT-PRD.md` content per new shape**

- _Goal:_ `.arc/reference/PROJECT-PRD.md` content rewritten per the new `template-project-prd` shape — Mission + 5-7
  numbered principles + anti-goals + problem statement + design tradeoffs — as the dogfooding pass that surfaces
  template ambiguities (template v1.1 revisions ride the same phase if needed).

    - _Context:_ Existing `.arc/reference/PROJECT-PRD.md` (162 lines: § 1 Purpose through § 6 Technical Requirements) is
      the source material; preserve content the new shape genuinely subsumes; surface content that doesn't fit as scope
      question. Per PRD § Open Questions, template revisions feed back into 4.2.

    - _Note:_ Current PROJECT-PRD has no "principles" section and no "design tradeoffs" section. Distillation work for
      4.3.c / 4.3.f pulls from § 1 Philosophical basis + § 2 Core Features + this WU's
      `notes-work-organization-reform.md` design-decisions section + relevant ADRs. Expect one iteration cycle with 4.2
      per 4.3.g if shape ambiguities surface.

    - _Note:_ This task includes the `META-PRD.md` → `PROJECT-PRD.md` file rename per R35 (resolves the `meta-*`
      file-class collision). Content rewrite + filename rename ride the same logical change — `git mv` the file as part
      of the rewrite commit. Package source counterpart `META-PRD.template.md` → `PROJECT-PRD.template.md` rename rides
      the same task. Inbound references in workflows / strategies / methods / hooks sweep via Task 6.7 cross-reference
      sweep (new subtask 6.7.k added in this amendment pass); CLI hardcoded reference in
      `packages/arc-framework/src/lib/classification.ts` updates via Task 5.4 (CLI propagation).

    - `[ ]` **4.3.a Read existing PROJECT-PRD; inventory content vs new-shape coverage**
        - Map existing sections to new-shape slots. Surface gaps (content with no home) before drafting.

    - `[ ]` **4.3.b Draft Mission**
        - 1-3 sentences; from existing top-level framing.

    - `[ ]` **4.3.c Draft 5-7 numbered principles**
        - Distill existing principles / values into quotable-as-noun shape. Preserve principle ordering where existing
          order is load-bearing.

    - `[ ]` **4.3.d Draft anti-goals**
        - From existing scope-bound language; explicit "won't do" framing.

    - `[ ]` **4.3.e Draft problem statement**
        - User-context framing; what ARC exists to solve.

    - `[ ]` **4.3.f Draft design tradeoffs**
        - Major calls + consequences; document the load-bearing ones.

    - `[ ]` **4.3.g Feed template ambiguities back to `template-project-prd.md` v1.1**
        - If shape ambiguities surface during draft, revise 4.2's template before declaring rewrite complete.

    - `[ ]` **4.3.h File rename: `META-PRD.md` → `PROJECT-PRD.md` (both copies)**
        - `git mv .arc/reference/META-PRD.md .arc/reference/PROJECT-PRD.md` after content rewrite (rename rides the
          rewrite commit per same-logical-change discipline).
        - `git mv packages/arc-framework/arc/reference/META-PRD.template.md packages/arc-framework/arc/reference/PROJECT-PRD.template.md`.
        - Verify pre-commit hook reports clean across both copies.
        - _Note:_ Inbound references (workflows, strategies, methods, hooks, briefs, configs) sweep via Task 6.7
          cross-reference sweep (new subtask added in this WU's amendment pass; see 6.7.k below). CLI hardcoded
          reference in `packages/arc-framework/src/lib/classification.ts` updates via Task 5.4 (CLI propagation).

### `[ ]` **4.4 Codify PROJECT-PRD update triggers**

- _Goal:_ Update-trigger discipline (R36) is durably codified in `template-project-prd.md` (per 4.2.f) and
  cross-referenced from `strategy-work-organization.md` § PROJECT-PRD (or wherever PROJECT-PRD operations end up
  surfaced in strategy docs).

    - _Note:_ R36 functionally lands inside 4.2.f; this parent confirms cross-reference + closes the update-trigger
      loop. May reduce to a verification step if 4.2.f fully covers.

### `[ ]` **4.5 Reframe `template-plan.md` (drop "optional, delete post-PRD")**

- _Goal:_ `template-plan.md` framing retires the "Using this template is not required ... Delete this file after the PRD
  is written and stable" preamble and replaces it with framing that's coherent under `pm.mode: arc-in-git` and
  forward-compat with the spec-flow contract arc-plan Conductor + AWL will land. Plan-\* described as the pre-PRD
  synthesis artifact for substantive shaping work; under arc-in-git the file moves from `backlog/{state}/<wu-name>/` →
  `active/<category>/` at activation (not deleted post-PRD); applicability scales with mode and tier per downstream WUs.

    **Strategies:** `strategy-package-project-sync.md`

    - `[ ]` **4.5.a Edit package source (authoritative copy)**
        - Per package-project sync discipline, `template-plan.md` is a Framework file — edit
          `packages/arc-framework/arc/reference/templates/template-plan.md` first.
        - Drop "Using this template is not required ... Delete this file after the PRD is written and stable." Replace
          with framing aligned to PRD R22c: "`plan-*` is the pre-PRD synthesis artifact for substantive shaping work.
          Under `pm.mode: arc-in-git`, this file moves with the WU through the lifecycle (backlog → active → archived
          alongside the meta file). Applicability — when `plan-*` is required vs optional — scales with mode (Lite/Full;
          arc-in-git/none) and WU tier (atomic / quick / standard); see `strategy-work-organization.md` § Spec-Flow
          Invariants (Task 2.7) plus `feature/plan-arc-plan-conductor.md` and `technical/plan-agile-wu-lifecycle.md` for
          the full contract."

    - `[ ]` **4.5.b Adopt chain-model header per R58a**
        - Header reduces to `**Origin:**` field (default `[Internal]`; external tracker URLs land here; matches the
          corresponding meta-\* `Origin:` value at WU creation).
        - Substantive opening immediately below: `**Purpose:**` carrying the plan's own thesis (pre-PRD synthesis
          statement). Optional reference to Origin from within Purpose prose.
        - **Field syntax:** bullet form (`- **Origin:** ...` / `- **Purpose:** ...`) matching the established
          cross-artifact convention (`tasks-*`, `plan-*` backlog instances already use bullet form). Visually consistent
          in raw markdown; greppable.
        - Retired from prior `plan-*` convention: heavy header fields (`**State:**`, `**Created:**`, and similar) that
          duplicate `meta-*` content under R22a — meta is canonical SoT for state/owner/dates; plan-\* keeps only its
          1-hop upstream pointer per R58a.

    - `[ ]` **4.5.c Verify body sections remain useful**
        - Existing sections (Problem / Motivation, Alternatives, Unknowns and Assumptions, Scope Estimate) stay as
          optional starting structure. Section guidance text inside each section retained — those describe what to
          capture, not whether the file is required.

    - `[ ]` **4.5.d Sync into `.arc/` instance copy**
        - Sync the package-source edit to `.arc/reference/templates/template-plan.md` via the canonical sync mechanism
          (not `cp` — that path violates package-project sync discipline by overwriting any project-specific divergence
          silently).
        - Verify pre-commit hook reports clean across both copies.

### `[ ]` **4.6 Reshape `template-tasks.md` (chain-model header + retire incidental framing)**

- _Goal:_ `template-tasks.md` adopts the chain-model header per R58a (header reduces to `**Spec:**` only; `**PRD:**`
  field name renames to `**Spec:**` for vocabulary alignment with meta-\*; `**Purpose:**` retires as drift-surface
  mirror of PRD; `**Branch(es):**` and `**Base Branch:**` retire per R58); incidental-WU framing retires
  (workflow-pattern preamble, branch-name examples, escalation pointers) per R49a; the `manage-incidental-work.md`
  pointer transitions to forward-pointer language pending AWL retirement.

- _Touch points (from grep, 2026-05-13):_
    - Lines 4-5 — preamble framing references both `feature`/`technical` (planned) and `manage-incidental-work.md`
      (reactive). Reshape to generic WU framing.
    - Header block (lines 27-34, Feature/Technical variant) — header field set reshapes per R58a chain model: rename
      `**PRD:**` → `**Spec:**`; drop `**Branch(es):**`, `**Base Branch:**`, and `**Purpose:**`. Final shape: just
      `**Spec:**` at top, then `---` separator, then phases.
    - Line 86 — pointer to `manage-incidental-work.md § Coordinated Pause/Resume`. Drop or forward-pointer.
    - Lines 79-133 — Incidental Header Variant section. Under R49a, incidental WU model substrate retires; the variant
      becomes orphaned. Either drop the entire Incidental variant (substrate gone) or reshape to forward-pointer noting
      AWL retirement timing. Default: drop, with a brief forward-pointer line if needed.
    - Line 156 — pointer "For multi-step work outside the WU's concern, see `manage-incidental-work.md`." Drop or
      forward-pointer.
    - Line 176 — `[manage-incidental]:` reference-link definition. Audit and retire if no surviving references in body.
    - `[arc-config]:` reference-link — survives only if `Base Branch:` field survives; since the field retires under
      R58, this reference-link likely retires too. Verify at execution.

    **Strategies:** `strategy-package-project-sync.md`

    - `[ ]` **4.6.a Edit package source (authoritative copy)**
        - Per package-project sync discipline, `template-tasks.md` is a Framework file — edit
          `packages/arc-framework/arc/reference/templates/template-tasks.md` first.
        - Apply all touch-point edits per the list above. Header reduces to `**Spec:**` only.
        - Retired field acknowledgment in template comments (parallel to 4.1.h's meta-template treatment): brief note
          enumerating fields retired from prior tasks-\* header shape per R58 + R58a — `Branch(es)`, `Base Branch`,
          `Purpose` (was PRD-mirror), `PRD` (renamed to `Spec` for vocabulary alignment).

    - `[ ]` **4.6.b Sync into `.arc/` instance copy**
        - Sync via canonical mechanism (not `cp`).
        - Verify pre-commit hook reports clean across both copies.

### `[ ]` **4.7 Reshape `template-prd.md` (chain-model header + retire pre-activation comment-block)**

- _Goal:_ `template-prd.md` adopts the chain-model header per R58a — adds `**Origin:**` header field (default
  `[Internal]`); preserves `**Purpose:**` as substantive opening below Origin (the document's thesis); retires the
  existing "Optional: pre-activation lifecycle metadata for backlog stubs" HTML-comment block (`**State:**` +
  `**Related Work:**`) since meta-\* covers pre-activation state under R22a.

- _Touch points (from `template-prd.md`, 2026-05-13):_
    - Line 1 — H1 `# PRD: [Work Name]`. Unchanged.
    - Lines 3-6 — existing `**Purpose:**` field with guidance. Move down one position (Origin goes first per R58a chain
      direction); guidance text retained.
    - Lines 8-19 — "Optional: Add pre-activation lifecycle metadata for backlog stubs" HTML comment block (`**State:**`,
      `**Related Work:**`). **Retire entirely** — meta-\* exists at WU stub creation per R22a and carries State +
      Depends-on (which subsumes Related Work semantically). The comment-block was a pre-WOR workaround for backlog
      stubs without meta.
    - New: add `**Origin:**` field as first header field after H1 (default `[Internal]`; external tracker URLs land
      here; matches meta-\* `Origin:` at WU creation).

    **Strategies:** `strategy-package-project-sync.md`

    - `[ ]` **4.7.a Edit package source (authoritative copy)**
        - Per package-project sync discipline, `template-prd.md` is a Framework file — edit
          `packages/arc-framework/arc/reference/templates/template-prd.md` first.
        - Insert `**Origin:**` header field after H1; move `**Purpose:**` below Origin.
        - **Field syntax:** convert both fields from current loose-paragraph form (`**Purpose:**` on its own line
          followed by blank line) to bullet form (`- **Origin:** ...` / `- **Purpose:** ...`). Aligns PRD with
          cross-artifact bullet convention (`tasks-*`, `plan-*`, `meta-*` all use bullets); reads consistently in raw
          markdown; greppable.
        - Retire the "Optional: pre-activation lifecycle metadata" HTML-comment block entirely.
        - Add brief retired-field acknowledgment in template comments per parallel pattern in 4.1.h / 4.6.a — note that
          pre-activation `**State:**` + `**Related Work:**` retire; meta-\* covers under R22a.

    - `[ ]` **4.7.b Sync into `.arc/` instance copy**
        - Sync via canonical mechanism (not `cp`).
        - Verify pre-commit hook reports clean across both copies.

    - _Note:_ Composition with 4.3 (PROJECT-PRD content rewrite per new shape). 4.3 doesn't touch `template-prd.md`; 4.7
      doesn't touch `PROJECT-PRD.md` content. The PROJECT-PRD shape lives in `META-PRD.template.md` / `PROJECT-PRD.template.md`
      (Task 4.2; renames at 4.3.h) per R63 — distinct from `template-prd.md` (this task), which is the agent-facing
      per-WU PRD template.

### `[ ]` **4.8 Evolve `TECHNICAL-OVERVIEW.template.md` content shape (R60 template component)**

- _Goal:_ `TECHNICAL-OVERVIEW.template.md` (package source) evolves in-place per R60 — existing architecture /
  components / critical-path sections retained; new section added carrying update-trigger discipline (organic: PR-time
  clarification when conflict surfaces; event-driven: tech-stack changes, major refactors, dependency upgrades, infra
  shifts; not cadence-driven). Per R63, no parallel `reference/templates/template-technical-overview.md` is created —
  the `.template` file is the canonical template surface.

    **Strategies:** `strategy-package-project-sync.md`

    - _Path:_ Edit `packages/arc-framework/arc/reference/TECHNICAL-OVERVIEW.template.md` directly. Rendered output in
      `.arc/reference/TECHNICAL-OVERVIEW.md` updates separately at Task 4.9 (dogfooding rewrite).

    - `[ ]` **4.8.a Audit existing template sections**
        - Read current `TECHNICAL-OVERVIEW.template.md`. Confirm what stays (architecture overview + per-component
          sections with framework / language / libraries / code-style / directory-structure fields); identify any
          orientation gaps the new shape should fill.

    - `[ ]` **4.8.b Add update-trigger discipline section**
        - Block describing when TECHNICAL-OVERVIEW updates fire: organic (PR-time clarification when conflict surfaces)
          plus event-driven (tech-stack changes, major refactors, dependency upgrades, infra shifts). Not
          cadence-driven. Parallel to 4.2.f for PROJECT-PRD.

    - `[ ]` **4.8.c One-shot-template comment block (R63)**
        - Brief comment block at top of template noting: "This file is rendered once at `arc init` / `arc join` time
          (per `classification.ts`); evolution happens in this `.template` file. Per R63, there is no parallel
          `reference/templates/template-technical-overview.md`." Parallel to 4.2.g.

### `[ ]` **4.9 Rewrite `TECHNICAL-OVERVIEW.md` content per new shape (R61 dogfooding pass)**

- _Goal:_ `.arc/reference/TECHNICAL-OVERVIEW.md` content rewritten per the evolved `TECHNICAL-OVERVIEW.template.md`
  shape — existing architecture / components content preserved or refreshed for accuracy; new update-trigger discipline
  section added. Dogfooding pass parallel to Task 4.3 for PROJECT-PRD.

    - _Context:_ Existing `.arc/reference/TECHNICAL-OVERVIEW.md` is the source material; verify content is still
      accurate at execution time (ARC framework type, CLI package, dependencies, dev environment, etc.) and refresh as
      needed. No filename rename (TECHNICAL-OVERVIEW name is already correct); inbound references unchanged.

    - `[ ]` **4.9.a Read existing TECHNICAL-OVERVIEW; verify accuracy vs. current state**
        - Audit each component section against current reality. Flag drift (e.g., outdated dependency versions, missing
          new components such as recent CLI additions).

    - `[ ]` **4.9.b Refresh component sections as needed**
        - Update any drifted content. Preserve sections that are still accurate.

    - `[ ]` **4.9.c Add update-trigger discipline section**
        - New section per 4.8.b's template addition. Block describing when TECHNICAL-OVERVIEW updates fire.

    - `[ ]` **4.9.d Feed template ambiguities back to `TECHNICAL-OVERVIEW.template.md` v1.1**
        - If shape ambiguities surface during the rewrite, revise 4.8's template before declaring rewrite complete.
          Parallel to 4.3.g for PROJECT-PRD.

## **Phase 5:** Roster cascade + push wrapper wiring + CLI seeding update + CLI propagation

_Purpose:_ TypeScript code changes — test-covered roster library function, `pre-push-review` extension fire-point wiring
into the push wrapper, CLI init/join preamble strip for instance-file slimming, and CLI propagation for the foundational
conventions WOR shifts (State value-set, filename prefix, flat `active/`, branch-pattern fallback, PROJECT-PRD hardcoded
references).

_Known impact areas (test breakage expected):_ WOR's foundational shifts ripple into CLI code that encodes the prior
conventions. Quality gates flag the breakage; budget for it rather than treat as surprise. Five zones:

1. **Probe envelope code** (`packages/arc-framework/src/lib/session-init/`, `commands/active/`) — `sessionType`
   inference, State value-set, branch-pattern fallback (`{category}/plan-{name}` → `plan/{name}`). HIGH.
2. **Active-file resolution** (`lib/active/status-reader.ts`) — `status-` → `meta-` filename prefix.
   `ActiveScanShape = "subdir" | "flat"` plumbing already exists; State enum needs codification. HIGH.
3. **Branch-prefix recognition** (`lib/classification.ts`, `commands/active/types.ts`) — CB core-6 + `plan/`. MEDIUM.
4. **Hook regex** (`system/githooks/commit-msg`) — covered by 6.1 + 2.13; cross-effect on integration tests. MEDIUM.
5. **Config schema** (additive: `archive.cadence`, `review.planning_checkpoint`) — covered by 3.7.c; LOW-MEDIUM.

~28 test files reference `status-` / `feature/` / `technical/` patterns (confirmed via grep at audit time, 2026-05-14).
Don't enumerate every test; expect cascading failures during Phase 5 that resolve as 5.4's code updates land.

### `[ ]` **5.1 Implement `worktree-roster.ts` library function with test-first coverage**

- _Goal:_ `packages/arc-framework/src/lib/git/worktree-roster.ts` exports a function returning a list of
  `{worktreePath, branch, identity?, metaFilePath, state, cohort?}` tuples from `git worktree list` + per-worktree
  meta-file resolution — synchronous worktree-list read; async per-worktree meta-file resolution; empty list returned
  when no worktrees or no meta files surface (clean degradation).

- _Note:_ `git/worktree-sync.ts` may already parse `git worktree list` output. Audit for an existing utility before
  re-implementing — reuse if available; factor if it covers ~90% of need.

- _Note:_ State value-set (`Planning | Active | Integrating | Shipped`) is codified in 4.1.c (`template-meta.md`) per
  PRD R9. Import from a shared schema if one exists (`frontmatter/` or `manifest/` modules are likely homes); otherwise
  hardcode with a comment pointing at the codifying template. Avoid silent enum duplication.

    **Strategies:** `strategy-testing-methodology.md`

    Build `test-first` (one behavior at a time):
    - Returns empty list when only the main worktree exists with no `meta-*.md` in `active/`.
    - Returns single tuple with `state` and `cohort` populated when one worktree has a meta file.
    - Returns multi-element list with one tuple per worktree when several worktrees have meta files.
    - Resolves `identity` from meta file's `**Owner:**` field (verbatim string; no normalization).
    - Resolves `state` from `**State:**` field (validates against the codified value-set; surfaces unknown values as
      `unknown` rather than throwing).
    - Resolves `cohort` from `**Cohort:**` field; `[none]` maps to `undefined` in the tuple (not the string `"[none]"`).
    - Tolerates missing meta file (worktree exists, no `meta-*.md` in its `active/`) — returns a tuple with
      `metaFilePath` undefined and other meta-derived fields absent.
    - Tolerates malformed meta file (parse error) — surfaces a warning, returns a degraded tuple rather than throwing.
    - Detached-HEAD worktrees skip cleanly (no branch → no meta-file resolution attempt).

### `[ ]` **5.2 Wire `pre-push-review` extension fire-point into push wrapper**

- _Goal:_ The push wrapper (`packages/arc-framework/src/lib/release/...`) invokes `pre-push-review` extension before
  executing any push routed through the wrapper — `arc release push` / `arc sync` push pathways inherit the fire-point
  automatically. Default-inactive extension (per 3.8.d); this wiring is structural even when extension is off.

    **Strategies:** `strategy-testing-methodology.md`

    - `[ ]` **5.2.a Identify insertion point for the extension fire**
        - Push execution flows through `pushWorktreeBranch` in `packages/arc-framework/src/lib/git/push-worktree.ts`
          (thin shell-exec wrapper). Called from two handler sites:
          `packages/arc-framework/src/handlers/release/push-cli.ts` (`arc release push`) and
          `packages/arc-framework/src/handlers/sync.ts` (`arc sync`).
        - Design choice: insert the fire (a) inside `pushWorktreeBranch` — single-site; all callers inherit
          automatically; mixes shell-exec wrapper with extension-fire concern; or (b) in both handler call sites before
          invoking the wrapper, ideally via a shared pre-push helper — separation-of-concerns; wrapper stays pure
          shell-exec. Default recommend (b); decide at execution.

    - `[ ]` **5.2.b Extension fire-point check**
        - Read `.arc/system/extensions/pre-push-review.md` frontmatter; if `active: true`, surface `.actions` to the
          agent before push proceeds. Default `active: false` short-circuits with no overhead.
        - _Note:_ "Surface `.actions` to the agent" needs to match how existing `pre-*` extensions surface today —
          likely via `sync-output.ts` or stdout. Inspect a working extension consumer (e.g., wherever
          `pre-stage-review`/`pre-merge-review` are wired) for the established pattern; stay consistent.

    - `[ ]` **5.2.c Unit + integration test coverage**
        - Vitest tests: extension inactive → push proceeds without surfacing; extension active with empty actions → push
          proceeds with no-op fire; extension active with actions → actions surface; extension malformed → push proceeds
          with degraded warning (don't block push on extension parse error).
        - _Note:_ Add a fifth case — extension file absent entirely (fresh install, file deleted). Expected: push
          proceeds with no fire (treated equivalent to `active: false`); never error.

### `[ ]` **5.3 Update CLI init/join code to strip instance-file preamble injection**

- _Goal:_ CLI init/join code in `packages/arc-framework/src/lib/` no longer injects preamble blocks when seeding
  SESSION-NOTES, USER-INBOX, BACKLOG-INBOX, or `backlog/ATOMIC-INBOX.md` — files seed as content-only per R59. Existing
  instance files in this repo migrated separately in 6.8.

    **Strategies:** `strategy-testing-methodology.md`, `strategy-package-project-sync.md`

    - `[ ]` **5.3.a Locate preamble injection sites**
        - Grep `packages/arc-framework/src/lib/` for the "About this file" / Lifecycle / Portability / Writing-guide
          preamble strings; identify seeding functions for each affected file.

    - `[ ]` **5.3.b Strip preamble from seed templates**
        - Update each seeding function to inject only the content scaffolding (e.g., for SESSION-NOTES:
          `## Handoff Metadata`, `## Uncommitted Work`, `## Remaining Work...`, `## Additional Context`,
          `## Persistent Context` H2s with empty bodies; no preamble blockquote).

    - `[ ]` **5.3.c Verify CLI tests still pass**
        - Existing CLI tests likely assert on seed output shape — update expected output where needed; add new test
          asserting no preamble in seeded files.

### `[ ]` **5.4 CLI propagation — State value-set + active-file resolution + branch-pattern + PROJECT-PRD ref**

- _Goal:_ CLI code encodes WOR's foundational convention shifts — State value-set codified as
  `Planning | Active | Integrating | Shipped` per R9 (replacing the prior `Planning | In Progress | Complete | ...`
  set); active-file resolution finds `meta-*.md` instead of `status-*.md` and recognizes flat `active/` structure as the
  WOR-shipped default; branch-pattern recognition aligns with CB core-6 + `plan/<name>` rotation; `classification.ts`
  hardcoded `META-PRD.template.md` filename updates to `PROJECT-PRD.template.md` per R35.

- _Approach:_ Test-first per `strategy-testing-methodology.md`. Sequence subtasks so foundational shifts (State enum
  codification, filename prefix) land before consumer call-sites; existing tests update incrementally as call-sites
  flip. Many tests will need fixture updates rather than logic changes — fixtures that hand-author `status-foo.md` with
  `**State:** In Progress` migrate mechanically to `meta-foo.md` with `**State:** Active`.

    **Strategies:** `strategy-testing-methodology.md`

    - `[ ]` **5.4.a Codify State value-set in shared schema**
        - Locate existing State enum (if present in `frontmatter/`, `manifest/`, or `types.ts`). If absent (currently
          freeform string), introduce a typed enum
          `type WorkUnitState = "Planning" | "Active" | "Integrating" | "Shipped"`.
        - Export from a shared location so probe code, status-reader, session-init logic, and tests all import from one
          place. Avoid silent string duplication.

    - `[ ]` **5.4.b Update probe envelope sessionType inference**
        - `packages/arc-framework/src/lib/session-init/` (and any related modules): rewrite the `sessionType` inference
          logic to map new State values: `Planning` → `planning`; `Active` → `execution`; `Integrating` → `integration`;
          `Shipped` → `null` (no active session).
        - Update branch-pattern fallback: from `{category}/plan-{name}` to `plan/{name}` per R2. Branch types in the
          fallback recognize the CB core-6 set.
        - Vitest unit tests cover each new mapping case + branch-fallback case.

    - `[ ]` **5.4.c Update active-file resolution for `meta-*` filename**
        - `lib/active/status-reader.ts` + consumers: change file-glob pattern from `status-*.md` to `meta-*.md`. The
          `ActiveScanShape = "subdir" | "flat"` plumbing already supports flat `active/` per WOR — verify "flat" becomes
          the default when project is configured for single-branch-per-WU.
        - Companion-file resolution (`notes-`, `atomic-`) shifts paths in tandem (companions live alongside meta file
          under WOR's flat `active/`).
        - Vitest unit tests cover `meta-*` resolution + missing-meta-file degradation +
          multiple-candidate disambiguation (under new layout).

    - `[ ]` **5.4.d Branch-prefix recognition update**
        - `lib/classification.ts` work-category recognition: retire `feature/`, `technical/`, `incidental/` prefix
          recognition; add CB core-6 (`feat/`, `fix/`, `chore/`, `docs/`, `refactor/`, `perf/`) plus `plan/`
          planning-state prefix.
        - `commands/active/types.ts`: any `ActiveLayout` or category-type definitions adopt the new convention. If
          `ActiveLayout` had values like `feature` / `technical`, retire those values; if the layout was purely
          structural ("subdir" vs "flat" as in `ActiveScanShape`), no value-shape change needed.
        - Vitest unit tests cover each CB core-6 prefix + `plan/` rotation recognition.

    - `[ ]` **5.4.e `classification.ts` hardcoded filename update (META-PRD → PROJECT-PRD)**
        - `packages/arc-framework/src/lib/classification.ts` references `META-PRD.template.md` in the
          file-classification logic (and possibly in inline doc comments). Update to `PROJECT-PRD.template.md` per R35.
        - Sync any related test fixtures.

    - `[ ]` **5.4.f Bulk test-fixture migration (one commit per logical fixture group)**
        - Fixtures hand-authoring `status-foo.md` migrate to `meta-foo.md`; State values update per the codified
          value-set. Expect changes across ~28 test files (audit estimate).
        - Pattern-batch fixture edits: a vitest run failing on `status-` filename references gets the fixture renamed; a
          failure on `**State:** In Progress` gets the State value updated. Don't enumerate per file in advance — fix
          the failing test, commit, move on.
        - Verify entire test suite passes (`npm test`) before declaring 5.4 complete.

## **Phase 6:** Migration and cross-reference sweep

_Purpose:_ Apply WOR conventions forward — hook regex, in-flight meta-file migration, capture pipeline file restructure,
backlog reorganization, leaked-status cleanup, doc retirements, and cross-reference sweep.

_Design decisions:_ Migration ordering: 6.1 (commit-msg hook regex) → 6.2-6.5 (mechanical file migrations) → 6.6 (doc
retirements) → 6.7 (cross-reference sweep) → 6.8 (instance-file slim). Migration commit shape is atomic-per-op per ARC
commit discipline — each rename / backfill / retirement gets its own commit unless tightly coupled. Cross-reference
sweep runs after retirements so all retired surfaces have already been removed when grepping. **Note:** the
commit-format method + footer-convention propagation that originally lived at 6.2 hoisted to Task 2.13 to align phase
order with execution order (must precede Phase 3 lifecycle workflow restructures).

### `[ ]` **6.1 Update `system/githooks/commit-msg` (type-set tightening + `arc` scope refusal)**

- _Goal:_ `system/githooks/commit-msg` enforces tuned 8-type set
  (`feat | fix | chore | docs | refactor | test | perf | revert`) and refuses `arc` as scope while preserving the bash
  `arc_config_get` pattern (no migration to commitlint); changes ride both copies (.arc/ + packages/).

    **Strategies:** `strategy-package-project-sync.md`

    - `[ ]` **6.1.a Type-enum regex tightening**
        - Update regex: `^(feat|fix|chore|docs|refactor|test|perf|revert)\([a-z][a-z0-9-]*\): .+`. Drops `style`,
          `content`, `build`, `ci`, `config` from prior regex.

    - `[ ]` **6.1.b Scope denylist (`arc`)**
        - Post-match check on captured scope: reject when matches `^arc$`. Initial denylist member only; expands
          organically as new catch-all patterns surface in PR review.

    - `[ ]` **6.1.c Sync to packages/**
        - Edit `packages/arc-framework/arc/system/githooks/commit-msg` to match.

    - `[ ]` **6.1.d Hook smoke test**
        - Attempt commits with retired type (`style:`) and `arc` scope; verify rejection. Attempt valid commit; verify
          pass.

### `[ ]` **6.2 Migrate in-flight WU meta files (`status-*` → `meta-*` + field backfill + State recodification)**

- _Goal:_ In-flight WU `status-*.md` files rename to `meta-*.md`; State recodified per mapping table; Owner backfilled
  from `arc.identity`; Origin defaulted to `[Internal]` (external URLs migrated from prior Spec where applicable);
  Depends On initialized to `[none]` (manual extraction for known dependencies); Cohort initialized to `[none]` or
  cohort name for known sibling sets.

    - _Approach:_ One commit per WU migration to keep blast radius bounded — each WU's rename + field edits land
      atomically per ARC commit discipline. Mapping table per `notes-work-organization-reform.md` § Migration Mapping
      Reference.

    - _Note:_ At execution, discover all in-flight `status-*.md` files first; in practice this WU's own
      `status-work-organization-reform.md` is the sole in-flight status file (verified at task generation time). "Each
      WU's rename" is defensive language for the broader contract — most invocations migrate a single file.

    - `[ ]` **6.2.a Per-WU rename: `git mv status-{name}.md meta-{name}.md`**
        - Plus any `archive/` references on the same branch (none expected during this WU; verify).

    - `[ ]` **6.2.a' Meta-file shape restructure (H1 + grouped blocks per R58)**
        - **Atomicity coupling:** Rides the same commit as 6.2.a (rename + shape restructure are one logical change —
          renaming without restructuring leaves a `meta-*.md` file in the pre-WOR shape, which is incoherent).
        - H1 line: `# Status: {name}` → `# Metadata: {name}` per R58.
        - Remove internal `## Work Unit Metadata` H2 wrapper; fields live directly under H1 in blank-line-grouped field
          blocks (identity / reference / coordination / task pointers / directive groups per R58's field-block layout).
        - Field syntax stays bullet form (`- **Field:** value`) matching the established cross-artifact convention; the
          change is the H2-wrapper retirement, not field syntax.
        - Field-set updates (Owner / Origin / Depends On / Cohort additions; retired-field removals) land in subsequent
          subtasks (6.2.b-g); shape restructure here is the H1 + H2 structural shift.

    - `[ ]` **6.2.b State recodification per mapping table**
        - Under the 4-state enum (`Planning | Active | Integrating | Shipped` per PRD R9), commitment level lives in
          dir, not State; on-branch-planning shares the `Planning` State with backlog-planning. Mapping for in-flight
          meta files:
        - `Planning` → `Planning` (preserved; covers both backlog-Planning and on-branch-Planning; dir location
          distinguishes).
        - `Draft` (old) → `Planning` + meta routes to `backlog/provisional/<wu>/` (if such a file is in scope; in
          practice all in-flight WUs at WOR activation are on branches in `active/`, so this row is defensive).
        - `In Progress` → `Active`.
        - `Active` → `Active`.
        - `Complete` + `**Integration:** Merged` → `Shipped`.
        - `Complete` + `**Integration:** (PR open)` → `Integrating`.
        - `**Integration:**` field retires (folds into State as the `Integrating` value).

    - `[ ]` **6.2.c Backfill `**Origin:**`(default`[Internal]`; migrate external URLs from Spec)**

    - `[ ]` **6.2.d Backfill `**Owner:**`from`arc.identity`**

    - `[ ]` **6.2.e Initialize `**Depends On:** [none]` (manual extraction for known dependencies)**

    - `[ ]` **6.2.f Initialize `**Cohort:** [none]` (or cohort name for known sibling sets)**
        - Parallelism trio members (Worktree Foundation, Agile WU Lifecycle, Concurrent Work Conventions) tagged
          `parallelism-trio`. ARCd Rebrand consumes WOR conventions but is a separate WU — defaults to `[none]` or its
          own cohort per planning context. Interlock-release-wrappers cluster tagged `interlock-release-wrappers`.
          Others default `[none]`.

    - `[ ]` **6.2.g Retired-field migration on in-flight meta files (per R58 + R49a)**
        - `**Branch(es):**` plural form → rename to `**Branch:**` singular (drop plural form); retain value as-is.
        - `**Base Branch:**` → remove field entirely; invariant `main` under single-branch-per-WU.
        - `**Sibling Work Unit(s):**` → remove field; cohort is SoT per R13 (sibling list derived); migrate any
          meaningful sibling content into `**Cohort:**` if not already captured.
        - `**Integration:**` → remove field; folds into `**State:**` per R9 4-state enum.
        - `**Interrupts:**` / `**Paused At:**` / `**Paused To:**` → remove fields per R49a (incidental WU model
          substrate retirement).
        - _Note:_ In practice this WU's own `meta-work-organization-reform.md` is the sole in-flight meta file at
          migration time. Defensive language for the broader contract.

    - `[ ]` **6.2.h Cross-file header migration on in-flight non-meta WU artifacts (per R58a)**
        - `tasks-*` headers: rename `**PRD:**` → `**Spec:**` (vocabulary alignment); drop `**Branch(es):**`,
          `**Base Branch:**`, `**Purpose:**` fields. Final header: just `**Spec:**`.
        - `plan-*` headers: ensure `**Origin:**` field present (default `[Internal]`; matches corresponding `meta-*`
          `Origin:` value); drop heavy header fields (`**State:**`, `**Created:**`, etc.) that duplicate meta-\* content
          under R22a; retain `**Purpose:**` as substantive opening below Origin.
        - `prd-*` headers: ensure `**Origin:**` field present (default `[Internal]`); retain `**Purpose:**` as
          substantive opening below Origin; retire any pre-activation comment-block (`**State:**`, `**Related Work:**`)
          that the prior template included for backlog stubs (meta-\* covers under R22a).
        - In-flight scope: this WU's own `tasks-work-organization-reform.md` + `prd-work-organization-reform.md` (no
          `plan-*` since WOR's plan retired pre-PRD per R51). Other in-flight WUs (if any at migration time) follow the
          same pattern.

    - `[ ]` **6.2.i Footer-convention status→meta filename-token propagation (couples atomically with 6.2.a)**
        - **Atomicity coupling:** This subtask MUST land in the same commit as 6.2.a (the file rename) per ARC commit
          discipline — otherwise the hook regex (still expecting `status-` when the file has been renamed) rejects valid
          `Context: meta-{name}.md (handoff)` commits, OR commits referencing `Context: status-{name}.md` warn on
          file-not-found.
        - Hook regex update: `^Context: status-[a-zA-Z0-9-]+\.md` → `^Context: meta-[a-zA-Z0-9-]+\.md` on the
          meta-anchor regex (line ~283 in current `system/githooks/commit-msg`); also update the file-existence loop to
          check for `meta-*.md` instead of `status-*.md`.
        - Hook error-message example list: `Context: status-X.md (handoff)` examples (lines 174-178) →
          `Context: meta-X.md (handoff)`.
        - Method body filename-token examples: section heading "Status-file references" already renamed to "Meta-file
          references" at 6.2.c; update example filenames `status-` → `meta-` throughout the section body (the
          section-heading rename happened at 6.2.c, but example filenames stayed at `status-` until this atomic-coupling
          moment).
        - Sync to `packages/arc-framework/arc/system/githooks/commit-msg` + the renamed method.
        - Smoke test: re-run 6.2.f's smoke suite; verify positive cases now use `meta-` shape and negative cases include
          old `status-` prefix as a rejected pattern.

### `[ ]` **6.3 Migrate capture pipeline files**

- _Goal:_ Capture pipeline files restructure to the four-surface model — `user/{id}/ATOMIC-INBOX.md` renames to
  `USER-INBOX.md` (content under `## Atomic`; `## Backlog` initially empty); `BACKLOG-FEATURE.md` +
  `BACKLOG-TECHNICAL.md` merge to `backlog/BACKLOG-INBOX.md` with entries reclassified during merge; new empty
  `backlog/ATOMIC-INBOX.md` created.
    - `[ ]` **6.3.a Per-user ATOMIC-INBOX → USER-INBOX rename**
        - `git mv .arc/user/{andrew}/ATOMIC-INBOX.md .arc/user/{andrew}/USER-INBOX.md`. Restructure content under
          `## Atomic` section; add empty `## Backlog` section.

    - `[ ]` **6.3.b Merge BACKLOG-FEATURE + BACKLOG-TECHNICAL → BACKLOG-INBOX**
        - Create `backlog/BACKLOG-INBOX.md`; migrate entries from both source files; reclassify per shape (some entries
          may route to `backlog/ATOMIC-INBOX.md`; some may promote directly to draft `plan-*` docs if matured). Delete
          source files.
        - _Note:_ Reclassification is interactive — establish routing policy upfront (criteria for BACKLOG-INBOX vs
          ATOMIC-INBOX vs plan-\* promotion), then confirm per borderline entry. Record routing decisions in the
          migration commit message.

    - `[ ]` **6.3.c Create new empty `backlog/ATOMIC-INBOX.md`**
        - Project-shared atomic surface; populates organically post-WOR.

### `[ ]` **6.4 Migrate `backlog/feature/` + `backlog/technical/` to `backlog/{planned,provisional}/<wu-name>/` per-WU subdirs**

- _Goal:_ Existing `backlog/feature/` and `backlog/technical/` contents migrate to per-WU subdirs under
  `backlog/{planned,provisional}/<wu-name>/` per ROADMAP-inclusion test (on ROADMAP → `planned/`; not on ROADMAP →
  `provisional/`). Cohort wrapper subdir applied for codified sibling sets (`backlog/{commitment}/<cohort>/<wu-name>/`).
  Each migrated WU gets a `meta-<wu-name>.md` stub generated alongside its plan-doc (interactive backfill: `Origin` /
  `Owner` / `Depends On` / `Cohort`; all backlog WUs land `State: Planning` regardless of commitment dir — commitment
  level lives in dir, not State, per PRD R9 + R21). Two backlog-stage PRDs (`prd-arcd-rebrand.md`,
  `prd-arcd-docs-site.md`) demote to plan-docs with content reshape; the docs-site WU renames to `docs-site-refresh`.

    - _Approach:_ Interactive — routing, cohort assignment, PRD demotion, and meta-file metadata can't be fully derived
      from existing state. Inventory → user-confirmed routing per borderline plan → user-confirmed cohort assignment →
      PRD demotion + docs-site rename → user-confirmed per-WU metadata backfill → file moves into per-WU subdirs →
      meta-file generation → cross-reference updates → backlog-root verification.

    - _Output:_ Pre-WOR `backlog/feature/plan-foo.md` + `backlog/technical/plan-bar.md` become
      `backlog/{planned,provisional}/foo/{meta-foo.md, plan-foo.md}` + analogous for `bar`, with cohort-grouped sets
      wrapped at `backlog/{commitment}/<cohort>/<wu-name>/`. Backlog root ends with exactly `planned/` +
      `provisional/` + `ATOMIC-INBOX.md` + `BACKLOG-INBOX.md` + `ROADMAP.md` — no other files or dirs at root, no
      `feature/`, `technical/`, or `plans/` remnants.

    - _Note:_ Backlog-stage PRDs are anomalous in the new model. PRDs are activation-coupled artifacts created via
      `1_create-prd.md` at WU activation, not authored in backlog. Today's two (`prd-arcd-rebrand.md`,
      `prd-arcd-docs-site.md`) are historical anomalies that demote to plan-docs at migration. Convention codification
      (strategy-doc capture of "PRDs are activation-coupled, not backlog-stage") is out of WOR direct scope; flagged in
      `notes-work-organization-reform.md` § Backlog-stage PRDs are anomalous for downstream capture (likely arc-plan
      Conductor PRD scope).

    - `[ ]` **6.4.a Inventory existing `backlog/feature/` + `backlog/technical/` contents**
        - List all WU artifacts. Companion types to inventory: `plan-*.md`, `prd-*.md`, `notes-*.md`, `tasks-*.md`,
          `atomic-*.md`, `research-*.md`, `analysis-*.md`. Verify the enumeration against actual `backlog/feature/` and
          `backlog/technical/` contents before routing.
        - Flag the two backlog-stage PRDs (`prd-arcd-rebrand.md`, `prd-arcd-docs-site.md`) for demotion + the docs-site
          PRD for WU rename to `docs-site-refresh`.
        - Output: a routing worksheet (per-WU rows: name / current path / companions / ROADMAP-inclusion /
          cohort-candidate / target path / demote-PRD-flag / rename-flag).

    - `[ ]` **6.4.b Per-WU routing decisions + PRD demotion + WU rename (interactive)**
        - **Routing rule:** on ROADMAP → `planned/`; not on ROADMAP → `provisional/`. Borderline plans (arc-rebrand,
          arc-backend, other not-yet-sequenced items) require explicit user confirmation before routing.
        - **Cohort assignment:** per known sibling set (parallelism-trio cohort consolidates under
          `planned/parallelism-trio/<wu-name>/`, etc.) — user confirms each known sibling set; standalone WUs sit
          directly at `backlog/{commitment}/<wu-name>/`. Each plan-doc + companions constitute one WU subdir; cohort
          wrapping applies only when sibling-set codification is explicit.
        - **PRD demotion:** `prd-arcd-rebrand.md` → `plan-arcd-rebrand.md` (file rename + content reshape from PRD
          commitment-language to plan-doc exploratory framing; retain the substantive content; soften "settled
          requirements" framing). `prd-arcd-docs-site.md` → `plan-docs-site-refresh.md` (rename + reshape AND WU-level
          rename `arcd-docs-site` → `docs-site-refresh`).
        - **WU-level rename ripple:** any current ROADMAP entry for `arcd-docs-site` updates to `docs-site-refresh`;
          in-doc cross-references update; commit captures the rename.
        - **Resulting placement** (for the two flagged WUs):
            - `backlog/provisional/arcd-rebrand/{meta-arcd-rebrand.md, plan-arcd-rebrand.md}` — rebrand is no longer
              committed; routes to provisional
            - `backlog/planned/docs-site-refresh/{meta-docs-site-refresh.md, plan-docs-site-refresh.md}` — docs-site
              work remains committed; routes to planned
            - Not a cohort — two standalone WUs despite the historical filename pairing

    - `[ ]` **6.4.c Per-WU metadata backfill (interactive — Origin / Owner / Depends On / Cohort)**
        - For each plan, user confirms the meta-file field values before file moves fire. Defaults applied
          automatically: `Owner: [arc.identity]`, `Origin: [Internal]` (unless external tracker reference present in
          plan body), `Depends On: [none]` (unless plan body carries explicit upstream WU names), `Cohort: [none]`
          (unless 6.4.b assigned to a named cohort).
        - **State value uniform:** all backlog WUs land `State: Planning` regardless of which commitment dir
          (`provisional/` or `planned/`) they route to. Under the 4-state enum (PRD R9), commitment level lives in dir
          location, not in State; `Planning` covers all pre-activation phases. State transitions only fire at workflow
          ceremonies, not at backlog graduation.
        - User reviews defaults per-WU; corrects values where the inference is wrong; confirms before 6.4.d moves files.

    - `[ ]` **6.4.d File moves into per-WU subdirs + meta-file generation**
        - For each WU: create the target subdir (`backlog/{commitment}/<wu-name>/` or
          `backlog/{commitment}/<cohort>/<wu-name>/`); `git mv` the plan-doc + companions (including any post-demotion
          `plan-*.md` from 6.4.b's PRD demotions) into the subdir; generate `meta-<wu-name>.md` from `template-meta.md`
          (created in 4.1) with the backfilled fields from 6.4.c + `State: Planning`.
        - _Note:_ This subtask depends on Task 4.1 (`template-meta.md` must exist). Sequence 6.4.d after 4.1 lands, or
          run a draft 6.4.d against the template shape from PRD R58 and reconcile with 4.1 at execution time.
        - Verify each subdir contains at minimum `meta-<wu-name>.md` post-move.

    - `[ ]` **6.4.e Cross-reference update in moved docs**
        - Plan-doc internal references (e.g., `[next-plan]: ../other-plan.md`) update to new paths accounting for the
          extra subdir level. Verified by markdown-lint passing post-move.

    - `[ ]` **6.4.f Backlog-root structure verification**
        - Verify `backlog/` root post-migration contains exactly the 5 expected entries: `planned/`, `provisional/`,
          `ATOMIC-INBOX.md`, `BACKLOG-INBOX.md`, `ROADMAP.md`. No `feature/`, `technical/`, or `plans/` dirs remain; no
          stray files at root. Top-down acceptance check that complements 6.4.d's per-WU verification.

### `[ ]` **6.5 Clean up leaked Planning-state `status-*.md` files on `main`'s `active/`**

- _Goal:_ Any leaked Planning-state `status-*.md` files on `main`'s `active/` are removed — completes the per-worktree
  isolation invariant precondition (Success Criterion #2).
    - Inspection from a fresh worktree branched off main: `active/` should be empty (or hold only inventory
      placeholders). Any leaks → `git rm` in a dedicated cleanup commit.

### `[ ]` **6.6 Retire deprecated docs (`PROJECT-STATUS.md` + three others)**

- _Goal:_ Four deprecated docs retire — `PROJECT-STATUS.md` (function decomposes per R40 mapping; non-carried content
  logged in deletion commit message), two planning artifacts retire after content absorption, and
  `template-completion-doc.md` folds into the new meta-file archive-phase sections.

- _Note:_ PRD R51 currently lists two research files for retirement (`research-commit-convention-reform.md` and
  `research-worktree-tool-convergence.md`). The former doesn't exist (findings already absorbed pre-WOR); the latter
  exists and is retained until Worktree Foundation lands. PRD R51 needs symmetric correction at WOR integration — remove
  both research files from the retirement list.
    - `[ ]` **6.6.a Retire `.arc/reference/PROJECT-STATUS.md` (R40)**
        - Completed-work history → already in (or will be in) per-WU Release Notes Entry sections. Project direction →
          PROJECT-PRD. Done-vs-left → directory query. Content not directly carried forward is logged in the deletion
          commit message.

    - `[ ]` **6.6.b Retire `plan-roadmap-evolution.md` (R51)**
        - Tiered-horizons direction superseded by R37-R39 rendered-view shape.

    - `[ ]` **6.6.c Retire `plan-completion-status-consolidation.md` (R51)**
        - Absorbed into WOR R14, R30-R32.

    - `[ ]` **6.6.d Retire `template-completion-doc.md` (R51)**
        - Folded into `template-meta.md` archive-phase sections (4.1).

### `[ ]` **6.7 Cross-reference sweep**

- _Goal:_ Cross-reference sweep across all surfaces (workflows, strategies, rules, briefs, templates) for retired
  patterns; each match updated or retired; sweep verified by post-sweep grep returning no orphans (Success Criterion
  #12).

    - _Approach:_ Pattern-per-subtask. Grep with file-glob restricted to documentation surfaces; update matches inline;
      verify by re-grep returning empty. Patterns from `notes-work-organization-reform.md` § Cross-reference sweep
      targets.

    - `[ ]` **6.7.a Branch-prefix patterns (`feature/`, `technical/`)**

    - `[ ]` **6.7.b PR-prefix pattern (`[PLAN]:`)**

    - `[ ]` **6.7.c Retired workflow refs (`integrate-planning-branch`, `activate-planning-branch`)**

    - `[ ]` **6.7.d Retired file-prefix patterns (`status-*.md`, `completion-*.md`)**

    - `[ ]` **6.7.e Retired template/strategy/plan refs (`template-completion-doc`, `PROJECT-STATUS`,
      `plan-roadmap-evolution`, `plan-completion-status-consolidation`)**

    - `[ ]` **6.7.f Lazy scope-tag example (`docs(arc):` in method examples, etc.)**

    - `[ ]` **6.7.g Extension renames (`pre-execution-graduation`, `pre-stage-review`, and old `pre-merge-review` for
      its pre-PR-creation semantic)**
        - Distinguish carefully from the new `pre-merge-review` at the post-review-response fire-point (must NOT be
          retired). Old `pre-merge-review` references update to `pre-pr-review`.

    - `[ ]` **6.7.h Retired meta-file field references (per R58 + R49a) — retire entirely**
        - Grep patterns: `**Branch(es):**`, `**Base Branch:**`, `**Sibling Work Unit(s):**`, `**Integration:**`,
          `**Interrupts:**`, `**Paused At:**`, `**Paused To:**`.
        - Touch points already addressed by upstream tasks: in-flight meta-file migration (6.2.g); template-tasks header
          (4.6); template-prd header (4.7); template-meta retirement acknowledgment (4.1.h). 6.7.h sweeps remaining doc
          surface: strategy docs (esp. `strategy-work-organization.md` § Optional Pointer Fields if it survives 2.8's
          reshape), workflows (`process-task-loop.md`, `session-init.md`, `session-handoff.md`,
          `integrate-work-unit.md`, `archive-work-unit.md`, `activate-work-unit.md`, `deactivate-work-unit.md`,
          `clean-work-unit.md`), templates (other than the ones already touched), briefs, rules.
        - Reference-link cleanup: `[arc-config]:` definitions in templates that exist solely to support a now-retired
          `Base Branch:` reference — audit and retire if no surviving references.
        - **Action:** retire references entirely (distinct from 6.7.i's forward-pointer action). Pause-pointer fields
          (`Interrupts:` / `Paused At:` / `Paused To:`) overlap with 6.7.i conceptually but the field-level references
          retire here per R49a's substrate-retirement framing — the workflow-level references stay forward-pointed under
          6.7.i.

    - `[ ]` **6.7.i Incidental WU model substrate refs (`incidental/`, `manage-incidental-work`) — forward-pointer**
        - **Action differs from other 6.7 patterns:** these references update to transitional forward-pointer language,
          not retire (per PRD R49a + R52). `manage-incidental-work.md` workflow continues to exist pending AWL
          retirement; references should acknowledge the transitional state.
        - Grep patterns: `incidental/`, `manage-incidental-work`, `[manage-incidental]:`, `Incidental Work Model`,
          `Interrupts:`, `Paused At:`, `Paused To:`.
        - Touch points already addressed by upstream tasks: DEV-RULES.ARC § Leave it cleaner (1.3.d),
          `strategy-work-organization.md` § Incidental Work Model + § Work Categories (2.8), `template-tasks.md` (4.6),
          `deactivate-work-unit.md` (3.11.a — keeps refs as transitional forward-pointers per R49a; verify alignment, no
          duplicate sweep work). 6.7.i sweeps the remaining surface: workflows (`session-handoff.md`,
          `prepare-commits.md`, `process-task-loop.md`, `integrate-work-unit.md`, `archive-work-unit.md`,
          `activate-work-unit.md`), `commit-footer.md` method (renamed at 6.2.b), strategy docs
          (`strategy-file-classification.md`, `strategy-task-list-formatting.md`, `strategy-quality-gates.md`,
          `strategy-interlock-release-wrappers.md`).
        - Reference-link cleanup: `[manage-incidental]:` definitions remaining after upstream tasks retire if no body
          references survive.
        - **Exclusion:** `system/githooks/commit-msg` references to `(incidental - discovered during ...)` Context
          modifier describe commits' _discovery context_, not the WU _incidental_ category — preserve as-is unless
          explicit re-scope decision flags them.

    - `[ ]` **6.7.j Post-sweep verification grep — returns empty for all retired patterns**
        - **Exception:** 6.7.i patterns retain references (transitional forward-pointer language); verify those
          references use the forward-pointer framing per R49a rather than the old incidental-WU-model framing.
          Post-sweep grep on the incidental patterns returns matches but each match should be a forward-pointer to
          WF/AWL, not an active reference to the retired substrate.

    - `[ ]` **6.7.k META-PRD → PROJECT-PRD references (per R35 rename)**
        - Grep patterns: `META-PRD`, `META-PRD.md`, `template-meta-prd`, `META-PRD.template.md`.
        - Update each reference to `PROJECT-PRD` / `PROJECT-PRD.md` / `template-project-prd` / `PROJECT-PRD.template.md`
          respectively. Surface: README files, workflows (`1_create-prd.md`, `01_verify-and-configure.md`,
          `02_define-project.md`, `maintain-project-docs.md`), strategies (`strategy-file-classification.md`,
          `strategy-configurability-architecture.md`), briefs (`AGENT-BRIEF.PROJECT.template.md`), hooks
          (`system/githooks/pre-commit`), configs (`system/arc-config.yml`). Touch points already addressed by upstream
          tasks: file rename (4.3.h), CLI hardcoded reference (5.4). 6.7.k sweeps remaining doc surface.
        - Reference-link definitions (e.g., `[meta-prd]:`) in any doc that uses them — rename link reference name and
          target together.
        - _Note:_ `manifest.json` + `pristine.json` regenerate via `arc update`; no manual edit needed.

    - `[ ]` **6.7.l Archive → completed path sweep (per R62)**
        - Grep patterns: `reference/archive`, `\.arc/reference/archive`, `[archive]:` reference-link definitions,
          hardcoded archive paths in workflows / strategies / hooks / scripts / CLI code.
        - Update to `completed/` / `\.arc/completed/` as appropriate. Surface: workflows (`archive-work-unit.md`,
          `integrate-work-unit.md`, `verify-work-unit.md`, `clean-work-unit.md`, others), strategies
          (`strategy-work-organization.md`, `strategy-file-classification.md`), hooks (`system/githooks/pre-commit`),
          scripts (`system/scripts/validate-links.sh`), CLI code (`packages/arc-framework/src/` — path resolution /
          classification touch points).
        - **Exclusion:** content INSIDE `completed/` (formerly `archive/`) — historical archived documents retain their
          original paths in their own bodies; sweep targets only references TO the directory, not references WITHIN it.
        - **Sequencing:** Task 6.9.a (`git mv`) must complete before this subtask fires (directory must exist at new
          path); 6.9.b verifies after this completes. R41 / R42 textual references in the PRD itself update at PRD
          amendment time (already landed in this folded-in pass), not in this sweep.

    - `[ ]` **6.7.m Supplemental collapse path sweep (per R62)**
        - Grep patterns: `reference/research`, `reference/analysis`, `\.arc/reference/research`,
          `\.arc/reference/analysis`, `[research]:` and `[analysis]:` reference-link definitions, hardcoded research /
          analysis paths in strategies / templates / backlog plans.
        - Update to `reference/supplemental/research/` and `reference/supplemental/analysis/` respectively. Surface:
          strategies (`strategy-work-organization.md`, `strategy-work-planning.md`, `strategy-package-project-sync.md`,
          others as discovered), templates (`template-completion-doc.md` — retiring per R51, but sweep cleanly before
          retirement), backlog plans (`plan-arc-modes.md`, `plan-docs-content-sweep.md`, `plan-wu5-public-release.md`,
          `plan-post-release-methodology.md`), ADRs (`adr-012` and any others), READMEs.
        - **Exclusion:** content INSIDE `supplemental/` — research / analysis documents retain their original paths in
          their own bodies; sweep targets only inbound references.
        - **Sequencing:** Task 6.10.b / 6.10.c (`git mv`) must complete before this subtask fires; 6.10.e verifies after
          this completes.

### `[ ]` **6.8 Slim instance-file preambles (SESSION-NOTES + USER-INBOX + BACKLOG-INBOX + backlog/ATOMIC-INBOX)**

- _Goal:_ Existing instance files in this repo strip preamble blocks ("About this file" / Lifecycle / Portability /
  Writing-guide) per R59 — files become content-only, matching meta-file convention. Authoritative orientation lives in
  strategy docs + workflows. CLI seeding update (5.3) prevents new instances from regrowing preamble.

    - _Note:_ This migration runs after 5.3 (CLI strip) and 6.3 (capture pipeline rename — USER-INBOX from
      ATOMIC-INBOX); otherwise the migration target file may not exist yet.

    - `[ ]` **6.8.a Slim `user/{identity}/SESSION-NOTES.md`**
        - Remove preamble blockquote ("About this file" / Lifecycle / Portability / Writing guide). Retain content H2s
          (`## Handoff Metadata`, `## Uncommitted Work`, etc.). Slim audit: file starts with `# Session Notes` H1
          immediately followed by content H2s.

    - `[ ]` **6.8.b Slim `user/{identity}/USER-INBOX.md` (post-6.3 rename)**
        - Remove any preamble injected from prior ATOMIC-INBOX file. Retain `## Atomic` and `## Backlog` content H2s.

    - `[ ]` **6.8.c Audit workflow seeding for preamble strings (`session-handoff.md`)**
        - Grep workflows for embedded preamble strings (the "About this file" blockquote pattern, the "Writing guide"
          pointer). Update workflow bodies to omit preamble injection when seeding SESSION-NOTES / USER-INBOX.
          Cross-check against 5.3's CLI changes for consistency.

    - `[ ]` **6.8.d Verify orientation coverage in authoritative docs**
        - Spot-check `strategy-session-operations.md` for SESSION-NOTES orientation content (purpose, lifecycle,
          portability, writing guide); spot-check `strategy-planning-module.md` for inbox orientation content. If gaps
          exist, route to inbox for follow-up (not WOR scope to author new strategy content; this verifies existing
          coverage is sufficient).

### `[ ]` **6.9 Archive directory promotion: `reference/archive/` → `.arc/completed/` (R62)**

- _Goal:_ Promote `.arc/reference/archive/` to top-level `.arc/completed/` per R62. Pipeline visibility: `backlog/`
  → `active/` → `completed/` becomes evident at directory-tree level (symmetric with existing `active/` and `backlog/`).

    - _Approach:_ `git mv .arc/reference/archive .arc/completed` — directory rename + promotion in one operation.
      Historical content (`archive/2026-q*/{category}/`) moves alongside, preserving R42's read-only categorical layout
      intact (paths become `completed/2026-q*/{category}/`).

    - _Sequencing:_ 6.9.a runs before 6.7.l (the inbound-reference sweep needs the directory to exist at its new path
      to verify against). 6.9.b verifies after 6.7.l completes.

    - `[ ]` **6.9.a Execute directory move**
        - `git mv .arc/reference/archive .arc/completed`.
        - Verify directory now exists at `.arc/completed/` with all historical content intact (currently three dated
          subdirs: `2025-q4/`, `2026-q1/`, `2026-q2/`).

    - `[ ]` **6.9.b Verify inbound references swept (post-6.7.l)**
        - After 6.7.l completes, grep across the documentation surface for `reference/archive`,
          `\.arc/reference/archive` — should return empty (excluding the WOR PRD / task list / status file themselves,
          which legitimately discuss the rename).

    - `[ ]` **6.9.c Update hooks / scripts if needed**
        - Verify `system/githooks/pre-commit`, `system/scripts/validate-links.sh`, and any other tooling don't carry
          stale `reference/archive/` references. `manifest.json` + `pristine.json` regenerate via `arc update`; manual
          edits unnecessary except for hook scripts.

### `[ ]` **6.10 Supplemental collapse: `reference/research/` + `reference/analysis/` → `reference/supplemental/` (R62)**

- _Goal:_ Collapse `reference/research/` and `reference/analysis/` under `reference/supplemental/{research,analysis}/`
  per R62. Mental model alignment with `system/workflows/arc/supplemental/`. Nested subdirectories preserved (research
  vs. analysis remain categorically distinguishable).

    - _Approach:_ Create `reference/supplemental/` parent dir; `git mv` research and analysis under it.

    - _Sequencing:_ 6.10.a-c run before 6.7.m (the inbound-reference sweep). 6.10.e verifies after 6.7.m completes.

    - `[ ]` **6.10.a Create `reference/supplemental/` parent**
        - `mkdir .arc/reference/supplemental` (and `packages/arc-framework/arc/reference/supplemental/` if any package
          source content lives there; verify at execution — current state is `.arc/`-only since research / analysis
          aren't in the package render list).

    - `[ ]` **6.10.b Execute research directory move**
        - `git mv .arc/reference/research .arc/reference/supplemental/research`.

    - `[ ]` **6.10.c Execute analysis directory move**
        - `git mv .arc/reference/analysis .arc/reference/supplemental/analysis`.

    - `[ ]` **6.10.d Author `supplemental/README.md` (optional)**
        - Brief README explaining the parent directory's role: "Non-load-bearing reference material — research and
          analysis artifacts that informed strategies and ADRs but aren't read at session-init or workflow-fire.
          Distinct from `adr/` / `constitution/` / `strategies/` / `templates/` (load-bearing)." Optional; can be
          deferred if existing per-subdir READMEs (`research/README.md`, `analysis/README.md`) carry sufficient framing.

    - `[ ]` **6.10.e Verify inbound references swept (post-6.7.m)**
        - After 6.7.m completes, grep across the documentation surface for `reference/research`, `reference/analysis`,
          `\.arc/reference/research`, `\.arc/reference/analysis` — should return empty (excluding the WOR PRD / task
          list / status file themselves).

### `[ ]` **6.11 Create `plan-arc-in-git-as-default.md` (R64)**

- _Goal:_ Create the exploratory `plan-*` doc capturing the "arc-in-git as default; modes scale around it" thesis per
  R64. Lands in `backlog/feature/` (legacy layout); graduates to `backlog/provisional/arc-in-git-as-default/` once Task
  6.4 completes the backlog restructure.

    - _Context:_ Captures a strategic deliberation surfaced during WOR scope discussion. Not committed work — explicit
      "exploratory" state in header. Implementation scope is conditional on thesis acceptance.

    - _Companion read at execution:_ Skim `plan-arc-modes.md` (header / TOC, not full body) to ground the implication
      inventory and confirm the doc reshapes (rather than duplicates) plan-arc-modes content.

    - `[ ]` **6.11.a Author file at `backlog/feature/plan-arc-in-git-as-default.md`**
        - Header carries explicit exploratory framing: "**State:** Exploratory / Not yet committed — thesis-stage, not
          work-stage. This plan describes a deliberation to evaluate, not work to execute. Implementation sections are
          conditional on thesis acceptance."

    - `[ ]` **6.11.b Author Thesis section**
        - Single paragraph stating the thesis: arc-in-git as default; modes scale rather than swap shapes. ARC remains
          agnostic / generalizable rather than competing with external trackers; backlog can complement Jira / Linear
          rather than replace or be replaced by them.

    - `[ ]` **6.11.c Author Rationale section**
        - Research findings on out-of-band team coordination (teams resolve concurrency via Slack / meetings, not
          tooling); smaller WUs + ceremony-boundary updates as the actual decoupling mechanism for backlog drift; ARC's
          "scale up / down rather than swap shapes" framing. Reference WOR's own reshape of capture surfaces (R20's
          ceremony-only writes) as substrate for this thesis.

    - `[ ]` **6.11.d Author Implication Inventory section**
        - Per-mode implications:
            - `pm.mode: external` — semantic shift from "no backlog" to "backlog complements external tracker"
            - `pm.mode: none` — semantic shift; what survives, what doesn't
            - `pm.mode: lite` — interaction with the question; whether Lite keeps a minimal backlog or remains
              backlog-free
            - `strategy-planning-module` — reshape implications (currently scoped to arc-in-git specifically)
            - `plan-arc-modes` — consume / restructure implications (its mode framing may change)
            - `plan-arc-backend` — interaction with the thesis (backend may be less necessary if the concurrency
              problem is reframed)

    - `[ ]` **6.11.e Author Decision Gate section**
        - Explicit gates: what deciding requires (e.g., evaluation of `plan-arc-modes`' current direction; verification
          that smaller WU pattern holds in practice; team-coordination research validation; concrete adopter feedback).
        - Frame: "this decision is not made by this plan; this plan organizes the inputs needed to make it."

    - `[ ]` **6.11.f Author Cross-References section**
        - Backlog plan-\* docs touched if thesis accepted: `plan-arc-modes` (independent consumer); `plan-arc-backend`
          (related); WOR (compatible with thesis but doesn't depend on it). Forward-link to ROADMAP / BACKLOG-INBOX as
          relevant.

    - `[ ]` **6.11.g ROADMAP / BACKLOG-INBOX entry decision**
        - Exploratory state should NOT appear in ROADMAP (which renders committed work per R37). Default: skip both
          ROADMAP and BACKLOG-INBOX inclusion — the file's exploratory header carries its own state signal. Revisit if
          the thesis matures and warrants pipeline tracking.

## **Phase 7:** Verification

_Purpose:_ Tier-3 quality gates, success-criteria walkthrough, per-worktree isolation acceptance test, integration
readiness assessment.

### `[ ]` **7.1 Complete verification** — load and follow [`verify-work-unit.md`][verify-work-unit]

- _Goal:_ All Success Criteria below resolve to `[x]` or `[~]` (with annotations); Tier-3 quality gates pass
  (`npm run -s lint:md`, `npm run lint:ts`, `npm run typecheck`, `npm test`, `npm run build`); per-worktree isolation
  acceptance test passes; ready-for-integration flag set.
    - `[ ]` **7.1.a Per-worktree isolation acceptance test (explicit)**
        - From the WU branch, spawn a test worktree against `main`: `git worktree add /tmp/wor-isolation-test main`.
        - In the new worktree, assert `.arc/active/` is empty (or contains only inventory placeholders like
          `README.md`). Expected: no leaked `status-*.md` / `meta-*.md` files; main carries no in-flight WU artifacts
          per Success Criterion #1.
        - Clean up: `git worktree remove /tmp/wor-isolation-test`.
        - Failure here means migration sweep (6.5) missed leaked files OR integration of WOR itself shipped its own meta
          file to main. Diagnose before passing.

---

## Success Criteria

- `[ ]` `main` carries no in-flight WU artifacts — `.arc/active/` on `main` empty (or holds only inventory placeholders)
- `[ ]` Per-worktree isolation acceptance test passes — worktree branched from `main` contains only its own WU's
  `meta-*.md` in `active/`
- `[ ]` No `[PLAN]:` PR pattern remains — new WUs ship a single PR at integration
- `[ ]` All in-flight WU meta files use the new shape — `# Metadata:` H1 + blank-line-grouped field blocks;
  `**Owner:**`, `**Depends On:**`, `**Origin:**`, `**Cohort:**` fields present; codified `**State:**` value-set; no
  internal `## Work Unit Metadata` H2 wrapper
- `[ ]` Completion-doc consolidation complete — `template-completion-doc.md` deleted; new archives use meta-file
  archive-phase content H2s (`## Release Notes Entry` + `## Completion Notes`)
- `[ ]` `PROJECT-STATUS.md` retired — file deleted; function distributed across PROJECT-PRD + Release Notes Entries +
  directory queries
- `[ ]` PROJECT-PRD content reflects new shape — Mission + numbered principles + anti-goals + problem + design tradeoffs
- `[ ]` ROADMAP.md regenerates deterministically from meta-file state per documented algorithm — header carries
  generated-by marker + last-rendered commit hash
- `[ ]` Instance files carry no preamble — SESSION-NOTES, USER-INBOX, BACKLOG-INBOX, `backlog/ATOMIC-INBOX.md` read
  content-only; orientation lives in strategy docs + workflows
- `[ ]` `system/githooks/commit-msg` enforces tuned 8-type set
  (`feat | fix | chore | docs | refactor | test | perf | revert`)
- `[ ]` Hook refuses `arc` as scope — verified by attempt + rejection
- `[ ]` CB-CC alignment documented in `strategy-work-organization.md` § branching with the cognitive-load rationale +
  intentional divergence on `test` / `revert`
- `[ ]` Five-extension fire-point family ships with honest fire-point names per the codified convention
  (`pre-activation`, `pre-commit-review`, `pre-pr-review`, `pre-push-review`, `pre-merge-review`); naming convention
  documented in `strategy-configurability-architecture.md`
- `[ ]` `pre-commit-review` wired into both `arc-commit` skill and `prepare-commits.md` workflow
- `[ ]` `pre-push-review` wired into push wrapper (`arc release push` / `arc sync` push pathway)
- `[ ]` New `pre-merge-review` wired into `integrate-work-unit.md` at the post-review-response fire-point (sits between
  `review-response` and merge action)
- `[ ]` Extension descriptions/contracts pass complete — every touched extension file's description, Contract block, and
  "Use for" framing audited and aligned with WOR family conventions; decision boundaries between extensions and adjacent
  mechanisms (e.g., `pre-commit-review` vs git pre-commit hook) clarified
- `[ ]` No broken cross-references after migration sweep — grep returns no orphans across workflows / strategies / rules
  / briefs / templates
- `[ ]` Roster cascade function ships in `packages/arc-framework/src/lib/git/` with Vitest unit + integration coverage;
  documented tuple shape returned
- `[ ]` CLI init/join strips instance-file preamble injection — package source updated; seeded files in this repo
  migrated; lint passes
- `[ ]` Companion ADR landed in `.arc/reference/adr/` — records constitutional shift; parallel scale to ADR-016
- `[ ]` § Spec-Flow Invariants section landed in `strategy-work-organization.md` — codifies the three invariants
  (`meta-*` always exists; task list structure invariant; parseable spec exists in some form before tasks) and the two
  scaling axes (mode + tier); spec-flow optionality contract explicitly deferred to arc-plan Conductor + AWL
- `[ ]` `template-plan.md` framing reframed — "optional, delete post-PRD" retired; new framing describes `plan-*` as
  pre-PRD synthesis artifact whose applicability scales with mode and tier
- `[ ]` Backlog migration complete — `backlog/feature/` and `backlog/technical/` retired; per-WU subdirs under
  `backlog/{planned,provisional}/<wu-name>/` carry meta + plan + companions; backlog root contains exactly `planned/`,
  `provisional/`, `ATOMIC-INBOX.md`, `BACKLOG-INBOX.md`, `ROADMAP.md`
- `[ ]` Backlog-stage PRDs demoted — `prd-arcd-rebrand.md` and `prd-arcd-docs-site.md` renamed to `plan-*`; content
  reshaped from PRD commitment-language to plan-doc framing; docs-site WU additionally renamed `arcd-docs-site` →
  `docs-site-refresh`; routing per commitment (rebrand → provisional; docs-site-refresh → planned)
- `[ ]` `commit-context-format` method renamed to `commit-footer` — file renamed in both copies; inbound references
  updated (hook comment, prepare-commits frontmatter, arc-commit skill, DEV-RULES.ARC reference link, methods/README);
  config key `commit.context_footer` retained
- `[ ]` Hook regex accepts the new parenthetical matrix per R29a — smoke tests cover positive cases (one per matrix
  cell) and negative cases (known-invalid patterns: `status-` prefix; `(content)`; `(maintenance)` on `plan-*`;
  `(planning)` on `meta-*`; old `(no associated task list)` shape); method documentation aligns with hook regex (no
  drift)
- `[ ]` `**Cohort:**` field default value is `[none]` — not `[standalone]`; CLI tuple resolution treats `[none]` as
  undefined cohort
- `[ ]` Lifecycle workflow alignment complete — `deactivate-work-unit.md` restructured for single-branch model with new
  case matrix; `clean-work-unit.md` updated for 4-state enum + meta-\* file shape + redirected completion handoff to
  integrate-work-unit composition; `rotate-branch.md` retired
- `[ ]` `META-PRD` → `PROJECT-PRD` rename complete per R35 — file renamed in both copies (`.arc/reference/META-PRD.md` →
  `PROJECT-PRD.md`; package source template `META-PRD.template.md` → `PROJECT-PRD.template.md`); content rewritten per
  the new template shape; CLI `classification.ts` hardcoded reference updated (Task 5.4.e); cross-reference sweep clean
  (Task 6.7.k)
- `[ ]` Orientation-content precondition satisfied per R59a — `strategy-session-operations.md` and
  `strategy-planning-module.md` carry the SESSION-NOTES / inbox-family orientation content before instance-file
  preambles are stripped in Phase 6.8; zero net orientation loss across the R59 transition
- `[ ]` `strategy-file-classification.md` updated — `meta-` file class introduced; `completion-` retired (folds into
  meta archive-phase sections per R14); CB core-6 + `plan/` work-category prose reshape per R1
- `[ ]` `strategy-task-list-formatting.md` updated — tasks-\* header reduces to `**Spec:**` only per R58a; retired field
  labels (`**PRD:**`, `**Branch(es):**`, `**Purpose:**`) removed from header conventions
- `[ ]` Phase 2 method/hook propagation lands before Phase 3 — commit-format `docs` discipline + `commit-context-format`
  → `commit-footer` rename + hook regex matrix + smoke tests (Task 2.13) execute before Phase 3 lifecycle workflow
  restructures emit the new parenthetical patterns
- `[ ]` TECHNICAL-OVERVIEW content reflects new shape per R61 — existing architecture / components / critical-path
  sections preserved or refreshed; new update-trigger discipline section added; v1.1 template revisions ride the same
  Phase 4 work if shape ambiguities surface
- `[ ]` TECHNICAL-OVERVIEW ceremony fire-points wired per R60 — `1_create-prd.md` carries the alignment check when PRDs
  touch technical surfaces; `activate-work-unit.md` and `integrate-work-unit.md` carry supplementary checks
- `[ ]` Reference directory restructure complete per R62 — `.arc/completed/` present (promoted from `reference/archive/`
  with historical content intact); `.arc/reference/supplemental/{research,analysis}/` present (collapsed from sibling
  directories); inbound-reference sweep clean
- `[ ]` One-shot template uniqueness principle codified per R63 — `strategy-file-classification.md` carries the
  principle + enumerated governed files; no `template-project-prd.md` or `template-technical-overview.md` created in
  `reference/templates/`
- `[ ]` `plan-arc-in-git-as-default.md` created per R64 — exploratory `plan-*` doc in `backlog/feature/` (graduates to
  `backlog/provisional/<wu-name>/` once Task 6.4 completes); header explicitly marks exploratory state; Thesis +
  Rationale + Implication Inventory + Decision Gate + Cross-References sections present
- `[ ]` All quality gates pass (`npm run -s lint:md`, `npm run lint:ts`, `npm run typecheck`, `npm test`,
  `npm run build`)
- `[ ]` Ready for integration

---

[verify-work-unit]: ../../system/workflows/arc/work-unit-lifecycle/verify-work-unit.md
