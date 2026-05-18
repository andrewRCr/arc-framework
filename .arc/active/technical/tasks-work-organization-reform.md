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
          clause not added — left as-is per the "otherwise leave as-is" path; projects can add a
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
          prefix; the type set lives in the method as overridable content. Default set landed in the method:
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
  § Incidental Work Model. New `branch-format` method file carries the type-set codification and override
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
          post-WOR archive shape, which is a project-internal concern (projects install post-change with no legacy
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
          this project's tooling timeline, which projects don't share. Per DEV-RULES.PROJECT § Audience Boundaries,
          subsection removed from adopter-facing strategy. The render algorithm and regeneration fire-points (2.4.b,
          2.4.c) are tooling-agnostic; projects use whatever execution path they have (hand, script, future CLI).
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

### `[x]` **2.6 `strategy-configurability-architecture.md` — inventory + extension naming + reserved names**

- _Goal:_ `strategy-configurability-architecture.md` carries (a) the planning-checkpoint review convention-inventory
  entry per the `review.pre_merge` precedent, (b) the extension fire-point naming convention codification, and (c) the
  reserved-for-future extension names registry.
    - `[x]` **2.6.a Convention inventory entry: planning-checkpoint review**
        - New row added to "Operational discipline conventions" table immediately after the `Pre-merge aggregate review`
          row: `Planning checkpoint review | P2 / P4 | No checkpoint stop | Config setting + Extension`. Verbatim per
          the R48 spec text (path column kept terse — the keynamed form `Config setting — \`review.planning_checkpoint\``
          overflowed the existing column width and didn't match the R48 example shape; the `review.planning_checkpoint`
          key naming lands in the Runtime settings list when Task 3.7 adds the YAML key).

    - `[x]` **2.6.b Extension fire-point naming convention**
        - New § Naming convention subsection placed between § Mechanism and § References in workflows. Codifies the
          three rules: `{pre|post}-{event}` pattern; event-name reflects local fire-point not upstream UI event (with
          `pre-pr-review` vs `pre-merge-review` as worked examples); frequency must match name's semantic (named
          `pre-commit-review` must fire at every commit pathway). Audience-discipline pass: no R-ID references; no
          "codifies existing convention" framing per audience boundaries.

    - `[x]` **2.6.c Reserved-for-future names registry**
        - New § Reserved names subsection placed after § Fire-point family. Names both currently-reserved entries
          (`pre-push-review` and `pre-merge-review`) per R56's "no default `.actions`" markings; describes the
          namespace-reservation intent so new reserved names land here as the family grows.

    - `[x]` **2.6.d Family enumeration table**
        - New § Fire-point family subsection placed between § Naming convention and § Reserved names. Five-row table
          mirroring R56: `pre-activation` / `pre-commit-review` / `pre-pr-review` / `pre-push-review` /
          `pre-merge-review` with fire-point, wired-into, and default columns. Trailing paragraph notes the "inactive
          by default" baseline and the "no default `.actions`" qualifier for the two reserved entries.

- _Outcome:_ Strategy doc gains four pieces of content covering the extension family contract: one new inventory row
  (Planning checkpoint review) and three new § Extension Points subsections (Naming convention → Fire-point family →
  Reserved names) inserted in front of the existing § References in workflows / § Preset vs. custom sections.
  Adopter-facing audience discipline preserved (no R-IDs in body; no transitional framing; no internal WU naming).
  Both copies byte-identical. Tier 1 markdown lint clean; `lint:arc:triggers` audit still passes.

### `[x]` **2.7 `strategy-work-organization.md` § Spec-Flow Invariants**

- _Goal:_ A new § Spec-Flow Invariants section in `strategy-work-organization.md` codifies the three invariants WOR
  lands (`meta-*` always exists; task list structure invariant; parseable spec exists in some form before tasks) and the
  two scaling axes governing optionality above them (mode: Lite/Full + `pm.mode`; tier: atomic/quick/standard per AWL).
  Explicitly defers the spec-flow contract (which spec form applies per mode × tier; `plan-*` required vs optional;
  verification model under tier collapse) to arc-plan Conductor + AWL. Establishes the interface those downstream WUs
  consume.

    - `[x]` **2.7.a Three invariants codification**
        - Landed as ordered list under § Spec-Flow Invariants > Invariants subsection. Meta-* identity-artifact framing
          (R22a) carries the persistence claim; task list structural invariance enumerates the fixed shape (phase
          headings, leaf format, completion markers, Success Criteria); spec-existence-before-task-generation decouples
          form from existence.

    - `[x]` **2.7.b Two scaling axes (mode + tier)**
        - Mode axis described via the shipping `pm.mode` value set {`arc-in-git`, `external`, `none`} — Lite/Full ARC
          naming kept internal until `plan-arc-modes.md` ships (audience-boundary judgment, see _Outcome_). Tier axis
          named as atomic/quick/standard without per-tier-shape codification (routed to AWL).

    - `[x]` **2.7.c Spec-flow contract deferral (explicit)**
        - Deferred-contract subsection states the per-mode × per-tier policy lives downstream of this strategy.
          Forward-pointers to internal WU plans (`plan-arc-plan-conductor.md`, `plan-agile-wu-lifecycle.md`)
          deliberately omitted from adopter-facing strategy per audience-boundary rule; phrased as "surfaces that
          orchestrate per-mode and per-tier policy" instead.

    - `[x]` **2.7.d Escape-hatch guardrail framing**
        - Three guardrails codified under § Escape-hatch guardrails: tier is one-way (promotion easy, demotion
          deliberate); atomic-tier requires explicit choice (not default); tier-invariant disciplines
          (process-task-loop, quality gates, commit discipline) apply uniformly across tiers. Concrete `--tier atomic`
          flag mechanic dropped in favor of intent-level phrasing (flag mechanic is AWL implementation detail).

- _Outcome:_ § Spec-Flow Invariants landed in `strategy-work-organization.md` between § Work Unit State and § Branching
  (TOC updated; both copies in sync). Codifies three invariants (meta-* persistence, task list structural invariance,
  spec existence before task generation), two scaling axes (mode × tier), and explicit deferral of per-axis policy.
  Adopter-safe phrasing throughout: no internal WU plan forward-pointers, no Lite/Full mode naming, no transitional
  framing. Reverse-pointers added to `plan-arc-plan-conductor.md` (§ Strategy and constitution) and
  `plan-agile-wu-lifecycle.md` (Scope item 10) so those WUs replace the abstract phrasing in § Deferred contract +
  § Escape-hatch guardrails with concrete references when they land. Scaffold for R22a/b/c established.

### `[x]` **2.8 `strategy-work-organization.md` § Incidental Work Model + § Work Categories transitional retirement**

- _Goal:_ The two existing top-level sections in `strategy-work-organization.md` that frame the incidental WU model and
  the category-based WU classification (`feature/` / `technical/` / `incidental/`) reshape under WOR's R49a transitional
  framing — substrate retires here; full content retirement awaits Worktree Foundation (shift lifecycle) + Agile WU
  Lifecycle (workflow + conceptual retirement).

    - `[x]` **2.8.a § Incidental Work Model reshape**
        - Body rewrote to describe current incidental-work handling: thin pointer to DEV-RULES.ARC § Leave it cleaner
          for routing across quick fixes / atomic tasks / interrupts requiring their own WU, plus
          `manage-incidental-work.md` for the mid-execution interrupt protocol with inline-on-current-branch framing
          (placeholder for shift-state mechanics pending WF — see _Outcome_).

    - `[x]` **2.8.b § Work Categories reshape**
        - Body rewrote to describe current categorization: work units identified by branch type prefix from the
          `branch-format` method's type set. Forward-pointer to § Branching + the method. 3 prior subsections
          (Feature/Technical/Incidental) removed.

    - `[x]` **2.8.c Reference-link cleanup**
        - Removed `[config-arch]:` orphan (sole prior use was in the prior § Incidental Work Model § Merge Strategy
          content). Added `[dev-rules-arc]:` for § Decision Rules and § Incidental Work Model forward-pointers. Other
          links retain valid uses.

    - `[x]` **2.8.d § Decision Rules reshape** (scope expansion 2026-05-14)
        - Folded in during pre-implementation audit — section's prior content (3-category decision tree) had its
          substrate removed by 2.8.b. Body rewrote to describe current branch-type selection per `branch-format`
          method's per-type semantic guidance; pointer to DEV-RULES.ARC § Leave it cleaner for routing rules.

- _Outcome:_ Three sections rewrote to describe current state (no historical framing) — § Work Categories (branch-type
  identification via `branch-format` method); § Decision Rules (branch-type selection per method's semantic guidance);
  § Incidental Work Model (thin pointer to DEV-RULES.ARC § Leave it cleaner + `manage-incidental-work.md` for
  interrupt protocol). Reference-link block: removed `[config-arch]:` orphan; added `[dev-rules-arc]:`. Both copies in
  sync. Audience correction mid-execution 2026-05-14: initial drafts carried "retires under..." / "substrate retired:"
  framing violating DEV-RULES.PROJECT § Audience Boundaries + DEV-RULES.ARC § Write for the reader; rewrote per Task
  2.3's established precedent. Reverse-pointer added to `plan-worktree-foundation.md` Scope item 7 for shift-state
  replacement of the inline-on-current-branch framing; AWL Scope item 9 covers full retirement.

### `[x]` **2.9 `strategy-work-organization.md` § WU Artifact Headers (chain-model convention)**

- _Goal:_ A new § WU Artifact Headers section in `strategy-work-organization.md` codifies the cross-file header
  convention per PRD R58a — chain-of-authority model where each non-meta WU artifact carries its immediate-upstream
  pointer; meta-\* carries the full chain as canonical authority. Documents the principle, the per-file field set,
  drift-cost rationale, and the deliberate `Spec` generalizability across tier × mode variants.

    - `[x]` **2.9.a Principle: chain-of-authority direction**
        - § Chain of authority subsection states `Origin → Spec → Task List → PR URL`. Each artifact is downstream of
          its predecessor; downstream artifacts name only the immediate upstream; `meta-*` is the sole full-chain
          carrier. Section intro paragraph defines each chain link (Origin / Spec / Task List / PR URL) inline so
          downstream subsections can reference the vocabulary without re-defining it.

    - `[x]` **2.9.b Per-file header field table**
        - § Per-file header fields subsection carries the 5-row table mirroring PRD R58a (meta / plan / prd / tasks /
          notes), three columns (File / Header field(s) / Substantive opening). `meta-*` row enumerates the full chain
          explicitly (`Origin`, `Spec`, `Task List`, plus `PR URL` after integration) rather than citing R58 by ID
          (audience-boundary: PRD R-IDs don't appear in adopter-facing prose). `atomic-*` omitted per scope.

    - `[x]` **2.9.c Bounded-duplication + drift-cost rationale**
        - § Bounded duplication and drift cost subsection explains why principled redundancy is safe: `Origin` on
          meta/plan/prd and `Spec` on meta/tasks are structurally immutable post-set (Origin at WU creation; tasks-\*
          Spec at task-list creation; meta's Spec transitions exactly once at activation). Meta-authority and
          self-describing-in-isolation principles articulated as paired consequences of the convention.

    - `[x]` **2.9.d `Spec` field generalizability (deliberate forward-compat)**
        - § `Spec` field generalizability subsection establishes that `**Spec:**` names whichever artifact is the
          upstream spec — default pipeline pairs WUs with a PRD, but the field name does not lock to "PRD." Examples
          (compact PRDs, scope-section variants, external-tracker-referenced specs) describe shape variants in
          generic adopter-readable terms — no forward-pointers to internal WU plan names (AWL / arc-plan Conductor /
          Lite / arc-modes) per DEV-RULES.PROJECT § Audience Boundaries. Original task instruction's "forward-pointers
          to AWL + arc-plan-conductor + arc-modes plans for the downstream contract" reframed accordingly mid-execution.

    - `[x]` **2.9.e Retired-duplication rationale**
        - § Purpose statement lives on the spec subsection reframes positively (vs. PRD R58a's "Retired duplications"
          framing): WU purpose lives once on the spec artifact (PRD by default); duplicating it on `tasks-*` would carry
          a prose field rather than a 1-hop pointer, a substantially larger drift surface than the immutable pointer
          values above. `tasks-*` readers reach the purpose via `**Spec:**`. Audience-boundary correction: avoids
          "retires" historical framing per DEV-RULES.PROJECT § Audience Boundaries — describes what IS, not what WAS.

- _Outcome:_ New top-level § WU Artifact Headers placed between § Per-Worktree Isolation and § Archival, completing the
  structural-conventions cluster (Branching → Per-Worktree Isolation → WU Artifact Headers). Section carries five H3
  subsections (Chain of authority / Per-file header fields / Bounded duplication and drift cost / `Spec` field
  generalizability / Purpose statement lives on the spec). TOC updated. Both copies byte-identical; Tier 1 markdown
  lint clean across 246 files. Audience-boundary discipline applied throughout — three corrections vs. PRD R58a's
  internal-PRD vocabulary: (1) `meta-*` row enumerates fields rather than citing R58 by ID; (2) 2.9.d generalizability
  framed in generic terms without forward-pointers to AWL / arc-plan-conductor / arc-modes WU plan names; (3) 2.9.e
  reframed from "Retired duplications" to "Purpose statement lives on the spec" (state-what-IS framing).

### `[x]` **2.10 `strategy-file-classification.md` — `meta-*` file class + retired prefixes + retired work-categories**

- _Goal:_ `strategy-file-classification.md` reflects WOR's file-taxonomy shifts — `meta-*` file class introduced (per-WU
  pointer; replaces `status-*`); `completion-*` file class retired (folds into meta-file archive-phase sections per
  R14); `feature/` and `technical/` work-category labels retired per R1's CB core-6 alignment.

    - `[x]` **2.10.a Add `meta-` file class entry**
        - Prefix-patterns table gained a new `meta-` row: `meta-` | Work-unit pointer | Agent |
          `meta-api-modernization.md`. Positioned at the top of the WU-artifact cluster (above `prd-` / `tasks-`),
          reflecting meta's role as the chain-of-authority anchor per Task 2.9's codification. Table column-divider
          widths normalized to match the trimmed row content.

    - `[x]` **2.10.b Retire `completion-` file class entry**
        - `completion-` row removed from the prefix-patterns table. No explicit "retired" note in the doc body —
          adopter-facing convention is to describe what IS, not what WAS (per DEV-RULES.PROJECT § Audience Boundaries).
          Completion content folds into meta-file archive-phase sections downstream (R14); strategy doesn't carry the
          retirement framing.

    - `[x]` **2.10.c Update WU-artifact prose listing**
        - WU-artifact prose listing updated: `meta-`, `plan-`, `prd-`, `tasks-`, `notes-`, `atomic-` (complete current
          WU-artifact set). Example expanded to show three artifacts sharing a slug (`meta-authentication.md`,
          `prd-authentication.md`, `tasks-authentication.md`) for clearer demonstration.

    - `[x]` **2.10.d Update work-categories prose**
        - § Directory naming rewrote from the obsolete "work categories consistent across active/, backlog/, archive/"
          framing to the WOR convention: WU directories are slug-named; branch-type prefixes from the `branch-format`
          method namespace branches, not directories. Cross-references to `strategy-work-organization.md` § Directory
          Structure and § Branching for the canonical convention. Default type set listed matches landed
          `branch-format` method (`feat`, `fix`, `chore`, `refactor`, `hotfix`; plus `plan/` for planning-phase) — not
          the task instruction's stale "CB core-6" enumeration (corrected per Task 2.1.a outcome).

    - `[x]` **2.10.e Sync to packages/**
        - Identical edits applied to `packages/arc-framework/arc/reference/strategies/arc/strategy-file-classification.md`.
          Two copies verified byte-identical via diff.

    - `[x]` **2.10.f Codify one-shot template uniqueness principle (R63)**
        - New § One-shot template uniqueness subsection landed under § Naming Conventions, between § Template suffix
          `.template.md` and § Workflow numbering (template-handling cluster). Four parts: (1) principle statement (no
          parallel `template-*.md` entry for one-shot rendered files); (2) governed-files enumeration (META-PRD,
          TECHNICAL-OVERVIEW, PROJECT-STATUS, ROADMAP, BACKLOG-FEATURE, BACKLOG-TECHNICAL, AGENT-BRIEF.PROJECT,
          QUICK-REFERENCE — current set, no "retiring per..." parentheticals); (3) distinction from agent-facing
          `template-*.md` (bracket-placeholder convention; principle does not extend); (4) optional starter templates
          (`template-dev-rules.md`, `template-contributing.md` — third category, not init-rendered).
        - Audience-boundary corrections vs. PRD R63 vocabulary: (a) didn't name the CLI source path
          (`packages/arc-framework/src/lib/classification.ts`) — replaced with "CLI's init / join render pipeline is
          the canonical inventory" (source-tree paths are internal-dev perspective; adopter strategy describes
          mechanism, not implementation); (b) governed-files list omits "(retiring per R40)" / "(consolidating into
          BACKLOG-INBOX per R50)" parentheticals — current state only; (c) starter-templates subsection avoided
          "adopter-customized" / "by adopters" framing → "Projects copy or reference them" (per user direction
          mid-execution: "adopter" is framework-author perspective; the reader IS the "adopter").

- _Outcome:_ `strategy-file-classification.md` realigned to WOR file taxonomy: `meta-` row added at top of WU-artifact
  cluster, `completion-` row retired, WU-artifact prose listing updated, § Directory naming rewritten from
  obsolete-work-categories framing to slug-named WU directories + branch-type-prefix-as-namespace model, new
  § One-shot template uniqueness subsection codifying R63. Reference-link block gained `[branch-format-method]:`. Both
  copies in sync; Tier 1 markdown lint clean across 246 files. Audience-boundary discipline applied throughout — six
  corrections / non-leaks vs. internal-PRD vocabulary (PRD R-IDs avoided; CLI source path replaced with mechanism
  description; "retiring per X" parentheticals dropped from governed-files list; "adopter-customized" framing replaced
  with neutral "Projects" actor; "by adopters" replaced with "Projects copy or reference them"; default branch-type
  set corrected to the landed 5-type set vs. task instruction's stale "CB core-6" enumeration). Three additional
  pre-commit corrections from user review of staged content: (a) `strategy-` row's "Created By" cell changed from
  `Framework` to `Framework / user` — the prefix covers both ARC framework strategies (shipped via `strategies/arc/`)
  and project-specific strategies in `strategies/project/`; (b) `template-` row's "Created By" cell changed from
  `Framework` to `Framework / user` symmetrically — projects can author their own `template-*.md` files too,
  framework just ships a canonical set; (c) `working-*` row + entire § Working docs (optional) subsection retired —
  stale leftover from an earlier dev experiment with no actual files in the repo and no other surface references (full
  audit confirmed pre-removal). `Created By` column widened from 12 to 18 chars between pipes to fit
  `Framework / user`. Folded in mid-execution: same audience-vocabulary cleanup applied to
  `strategy-work-organization.md` (lines 39, 48 — Task 2.1 leftover phrases "adopter-override mechanism" → "override
  mechanism"; "supports adopter override of the set" → "supports overriding the set"). Remaining adopter-facing
  surfaces with "adopter" mentions captured for sweep at Task 6.7.n.

### `[x]` **2.11 `strategy-task-list-formatting.md` — `tasks-*` header convention update**

- _Goal:_ `strategy-task-list-formatting.md` reflects R58a's chain-model header convention for `tasks-*` files — header
  reduces to `**Spec:**` only; `**PRD:**` field name retires (renamed to `Spec` for vocabulary alignment with `meta-*`);
  `**Branch(es):**`, `**Base Branch:**`, `**Purpose:**` retire from `tasks-*` header per R58 + R58a.

    - `[x]` **2.11.a Update "planned feature/technical work" prose**
        - Dropped `(feature, technical, incidental)` parenthetical from the strategy's opening framing and the
          `feature/technical` qualifier from the `2_generate-tasks.md` referenced-by entry. Strategy is now
          work-type-agnostic; categorization framing remains in `strategy-work-organization.md` (§ Branching for
          the type set, § WU Artifact Headers for the chain-model).

    - `[x]` **2.11.b Update `tasks-*` header field list**
        - Renamed the `**Feature/Technical**` variant subsection to `**Planned**` and collapsed its field list to
          a single `**Spec:**` bullet (filename only) with forward-pointer to `strategy-work-organization.md`
          § WU Artifact Headers. Dropped `Branch(es)`, `Base Branch`, `Purpose`, and the PRD-reference bullet.
          Updated the Incidental variant's `## Context` description to drop the comparative reference to the
          no-longer-existing Feature/Technical `Purpose` field. Pruned `[arc-config]` and `[work-org-task-branches]`
          link refs (no remaining in-text uses); added `[work-org-wu-headers]`.

    - `[x]` **2.11.c Audit § Bold (header preamble) and § File-header metadata rules**
        - § Bold and Italic Conventions example now shows `task list **Spec:**; atomic file **Purpose:**,
          **Ordering:**` (retired `**PRD:**` / `**Branch(es):**` / `**Purpose:**` removed). § Blank-Line Discipline
          § file-header metadata parenthetical examples updated to current field names (Origin, Spec, Task List,
          Branch, State); descriptive-prose example (Purpose, Context) unchanged. Doc-type list reframed to
          `meta-*` / `plan-*` / `prd-*` (post-WOR taxonomy) in place of "task list, completion doc". Structural
          rules (key/value-vs-prose shape distinction, blank-line treatment) unchanged.

    - `[x]` **2.11.d Sync to packages/**
        - Both copies (`.arc/` + `packages/arc-framework/arc/`) edited in parallel during execution; final `diff`
          confirms byte-identical.

- _Outcome:_ `strategy-task-list-formatting.md` codifies the chain-model `tasks-*` header (single `**Spec:**` field)
  across all touch points — `Planned` variant subsection, file-header field-label convention example, and the
  metadata-block blank-line rule. Link-reference block pruned to match (retired `[arc-config]` and
  `[work-org-task-branches]`; added `[work-org-wu-headers]`). Atomic-`*` `**Purpose:**` / `**Ordering:**` line
  unchanged. Both copies in sync.

### `[x]` **2.12 Author instance-file orientation content into strategy docs (R59 precondition)**

- _Goal:_ `strategy-session-operations.md` gains SESSION-NOTES orientation content (purpose, lifecycle, portability,
  writing-guide pointer); `strategy-planning-module.md` gains inbox-family orientation content (USER-INBOX,
  BACKLOG-INBOX, `backlog/ATOMIC-INBOX.md` purposes + lifecycles + write-discipline). Lands before R59 strips preambles
  from instance files in Phase 6.8 — otherwise orientation goes from "in-file" to "nowhere" until a future WU.

    - `[x]` **2.12.a SESSION-NOTES orientation in `strategy-session-operations.md`**
        - New `## SESSION-NOTES` H2 section inserted between § Status-File Timing and
          § Handoff-Interior Toggle Pattern, with matching TOC entry. Covers purpose (personal session
          context companion to `status-{name}.md`; WHAT vs HOW-it's-going split), lifecycle (created at
          handoff / consumed at init / deleted between WUs), portability (forward-pointer to existing
          § Session State Portability for the git-notes mechanism), and writing-guide pointer to the
          session-handoff workflow.

    - `[x]` **2.12.b Inbox orientation in `strategy-planning-module.md`**
        - New `## Inbox Family` H2 section inserted between § What It Installs and § How Work Flows Through,
          with matching TOC entry. Three per-inbox subsections (`USER-INBOX.md`, `backlog/ATOMIC-INBOX.md`,
          `backlog/BACKLOG-INBOX.md`) each carrying purpose + lifecycle + writes-policy, plus a
          § Write-discipline summary cross-referencing DEV-RULES.ARC § Leave it cleaner for the
          ceremony-only-write rule. ATOMIC-INBOX subsection absorbs `arc log --atomic` browse pointer
          from the retiring inbox preamble.

    - `[x]` **2.12.c Verify orientation coverage is sufficient**
        - Cross-checked authored content against the SESSION-NOTES preamble blockquote and the
          `user/andrew/ATOMIC-INBOX.md` preamble (the personal-atomic-inbox file mapping to post-WOR
          USER-INBOX § Atomic). Coverage: purpose, lifecycle, portability, writing-guide pointer
          (SESSION-NOTES); personal-vs-companion lifecycle distinction, ceremony-only-write rule, browse
          command, ceremony-triage protocol (inboxes). One deliberate omission: P5 (Context Preservation)
          principle-by-number reference dropped from SESSION-NOTES coverage — internal-dev vocabulary,
          not adopter-facing scaffolding. Zero net orientation loss across the R59 transition.

    - `[x]` **2.12.d Sync to packages/**
        - Both copies edited in parallel during execution; final `diff` confirms byte-identical for both
          strategy files.

- _Outcome:_ Two adopter-facing strategy docs now carry the orientation content that R59 will strip from
  instance-file preambles in Phase 6.8 — `strategy-session-operations.md` § SESSION-NOTES anchors the
  status-file companion; `strategy-planning-module.md` § Inbox Family anchors the three inboxes. R59
  precondition cleared without a downstream orientation hole.

### `[x]` **2.13 Commit-format method + footer-convention propagation (R27, R29a)**

- _Goal:_ `commit-format.md` method carries the `docs` discipline principle (R27); `commit-context-format.md` method
  renames to `commit-footer.md` with full body rewrite per R29a (chain naming, standalone anchor, parenthetical matrix
  updates, discreteness test); hook regex + error examples align with the new matrix; smoke tests lock the matrix. The
  `status-` → `meta-` filename-token portion of the regex stays at `status-` here and flips at Task 6.2.i atomically
  with the in-flight file rename (6.2.a).

    - `[x]` **2.13.a Codify `docs` discipline in `commit-format.md`** (R27)
        - "Type selection" block landed between **Types:** and **Scope:** — principle line + four
          type-definition bullets + rule of thumb. R27's "adopter onboarding" example softened to
          "onboarding guides" on review (method file ships; `adopter` vocabulary reserved for
          internal-dev surfaces). Both copies byte-identical; Tier 1 lint clean.

    - `[x]` **2.13.b Rename `commit-context-format.md` → `commit-footer.md`**
        - File renamed via `git mv` in both copies; frontmatter `name:` field updated to
          `commit-footer`. Structural identity anchors that follow `name:` also updated (H1
          `# Method: commit-footer`; H2 section headers `## commit-footer.override` /
          `## commit-footer.default`) — spec gap surfaced via the package-source neutrality
          pre-commit hook, which validates name↔section-header coupling. Body prose still
          references the old name; full body rewrite per R29a in 2.13.c.
        - Config key `commit.context_footer` retained — slot identity decoupled from filename, no
          `arc-config.yml` change needed.

    - `[x]` **2.13.c Rewrite `commit-footer.md` method body per R29a**
        - Body rewrite landed: chain-naming preamble (`meta-` → `plan`/`prd` → `tasks-` → `atomic-`,
          falling to `standalone`); discreteness test (single "active WU?" binary); standalone anchor
          section replacing the `(no associated task list)` patterns with `(maintenance|planning|
          documentation|refactor)`; off-WU `(planning)` vs file-pointer `(planning)` distinction
          codified; meta-\* heading rename (filename-token stays `status-` until 6.2.i);
          `(maintenance)` + `(deactivation)` added, `(planning)` dropped; phrasing tightened to
          `(incidental during X)`; `content` removed from off-WU vocabulary. Description-field
          frontmatter line refreshed to summarize chain-naming + standalone.
        - Both copies byte-identical; Tier 1 lint clean.

    - `[x]` **2.13.d Update `system/githooks/commit-msg` regex + error examples (non-filename portion)**
        - tasks-\* incidental regex tightened to `(incidental during .+)`. meta-\* (filename token kept
          at `status-`, flips at 6.2.i) parenthetical regex updated: dropped `planning`, added
          `deactivation` + `maintenance`, tightened incidental phrasing. New standalone-anchor regex
          `^Context: standalone \((maintenance|planning|documentation|refactor)\)$` replaces the
          retired off-WU regex `^Context: (planning|documentation|maintenance|refactor|content)
          \((atomic / )?no associated task list\)$`.
        - Error-message example lists (both primary "Missing 'Context:'" guidance and secondary
          "Invalid Context: format" guidance) updated to reflect the new matrix: tightened
          incidental phrasing throughout; status-\* examples drop `(planning)`, add `(deactivation)`
          / `(maintenance)`; off-WU examples replaced with the four `standalone (...)` patterns;
          off-WU vocabulary list drops `content`. Contributor-pattern doc reference updated from
          `commit-context-format.md` to `commit-footer.md` (tactical fold from 2.13.e since the
          hook was already under edit).
        - Bash syntax valid; shellcheck clean (pre-existing SC1091 info on sourced lib unchanged).
          Both copies byte-identical.

    - `[x]` **2.13.e Update inbound references to renamed method**
        - Adopter-facing sweep landed (canonical + package-source mirror in lockstep):
          `methods/README.md` (index + dependency table); `prepare-commits.md` (frontmatter +
          body refs + link target); `arc-commit/SKILL.md` (Read-path); `DEV-RULES.ARC.md` (body
          ref + link target); `commit-format.md` (`related:` field + body inline links — off-spec
          scope gap surfaced in 2.13.b survey); `integrate-work-unit.md` (body + link target);
          `01_verify-and-configure.md` (body); `03_configure-external-integration.md`
          (package-only — body + section heading); `strategy-session-operations.md` (dependency
          table); `strategy-configurability-architecture.md` (body); `strategy-package-project-sync.md`
          (internal-dev file-path list).
        - CLI inventory updated for the rename: `src/lib/classification.ts` file-list, the shipped
          `init-recipe.json` file-list, and four test files (`__tests__/integration/init.test.ts`,
          `update.test.ts`, `__tests__/e2e/init.e2e.test.ts`, `__tests__/unit/frontmatter/method.test.ts`)
          — surfaced via Tier 2 gate. dist/ rebuilt to absorb the change.
        - Harness-local skills (`.claude/`, `.codex/` — gitignored) hand-synced per CLAUDE.md
          drift convention. Anchor labels (`arc-methods-ccf`) kept stable; only target URLs flipped —
          avoids cascading anchor renames across every reference-link block.
        - **Deferred:** ADRs (013, 014, 019), `analysis-cross-cutting-dependencies.md`, and
          `.arc/system/.internal/manifest.json` retain historical `commit-context-format` mentions —
          internal-dev / descriptive infrastructure where the historical record stays accurate as-of
          decision. `docs/**` deferred per original spec to docs-content sweep
          (`plan-docs-content-sweep.md`).
        - Tier 1 lint clean across all touched files; Tier 2 gates clean (typecheck, full markdown
          lint, vitest 1776/1776 + e2e 56/56).

    - `[x]` **2.13.f Footer-convention smoke tests (positive + negative cases)**
        - New vitest integration test landed at
          `packages/arc-framework/__tests__/integration/commit-msg-footer.test.ts`. 27 positive
          cases (one per R29a matrix cell: tasks-\* with all parentheticals; plan-\* / prd-\* with
          `(planning)` / `(code review)`; meta-\* with all ceremonies plus `(maintenance)`,
          `(deactivation)`, and `(incidental during X)`; standalone with all 4 categories;
          atomic-\*; contribution). 7 negative cases (retired patterns: `(content)`, retired
          incidental phrasing, `(maintenance)` on plan-\*, `(planning)` on meta-\*, old off-WU
          `(no associated task list)` shapes, `standalone (content)`). All 34 cases pass.
        - Test invokes hook via `bash` rather than direct exec (hook file mode is `100644` in git
          — husky-style invocation is the project convention). Hook reads `arc-config.yml` via
          `arc-lib.sh`, so test sets `cwd: REPO_ROOT` for spawned process.
        - Re-run any time regex or method body changes: `npx vitest run __tests__/integration/commit-msg-footer.test.ts`.

- _Outcome:_ R27 docs-discipline + R29a footer-convention reform landed end-to-end: `commit-format.md`
  Type-selection block; `commit-footer.md` renamed + body rewritten (chain naming, discreteness test,
  standalone anchor, meta-\* heading, tightened phrasing, `content` dropped); `commit-msg` hook regex +
  error-example matrix refresh; 10+ inbound references swept (canonical + package-source mirror);
  CLI source (`classification.ts` + `init-recipe.json`) updated for the rename. New 34-case smoke-test
  file (`commit-msg-footer.test.ts`) locks regex-vs-method drift. Off-spec scope folded mid-execution:
  H1/H2 structural anchors (2.13.b), `commit-format.md`'s `related:` field (2.13.e), CLI source +
  recipe + 4 test files (2.13.f gate). Filename-token kept at `status-` per R29a; flips at 6.2.i.
  Tier 2 gates clean: typecheck, full markdown lint (246 files), vitest 1776/1776 + e2e 56/56.

### `[x]` **2.14 `strategy-work-organization.md` § Planning Branch Workflow retirement**

- _Goal:_ § Planning Branch Workflow codifies the two-branch model (separate planning branch → PR →
  `activate-work-unit` creates distinct implementation branch). Under WOR's single-branch-per-WU +
  `plan/<name>` rotation, this section is wholly stale. Section either retires entirely (remove heading, update
  TOC, audit anchor refs from elsewhere) or collapses to a thin pointer to § Branching > § Planning branches.
  Default lean: collapse matches 2.8's shape.

    - `[x]` **2.14.a Reshape decision + body rewrite**
        - Chose full retirement over collapse-to-pointer — § Branching > § Planning branches already documents
          the `plan/<name>` rotation as the single-branch model's planning life-phase; a separate pointer
          section adds no value. Removed heading + body + TOC entry.

    - `[x]` **2.14.b Anchor-reference audit**
        - External: `activate-planning-branch.md` references `#branch-protection-modes` only (not this section);
          fine. Internal: 2 dead `#planning-branch-workflow` refs remained inside § Branch Protection Modes
          (lines 390, 402) — both inside content 2.16 will retire entirely. Left in place pending 2.16.

    - `[x]` **2.14.c Both copies + lint**
        - Applied identically to `.arc/` instance + package source. Reference-link block cleaned: removed 4
          orphans (`[generate-tasks]`, `[create-prd]`, `[activate-planning-branch]`, `[integrate-planning-branch]`).
          Tier 1 lint clean.

- _Outcome:_ § Planning Branch Workflow fully retired from `strategy-work-organization.md` — heading, body, and
  TOC entry removed; 4 orphan reference-link defs cleaned (`[generate-tasks]`, `[create-prd]`,
  `[activate-planning-branch]`, `[integrate-planning-branch]`). Single-branch-per-WU's planning life-phase model
  lives in § Branching > § Planning branches as the sole adopter-facing codification. Two dead intra-doc anchor
  refs to `#planning-branch-workflow` (inside § Branch Protection Modes) tactically retired in this commit
  (sentence-level removal); surrounding subsection content retires fully in 2.16. Both strategy-doc copies in sync.

### `[x]` **2.15 `strategy-work-organization.md` § Directory Structure reshape**

- _Goal:_ § Directory Structure body rewrites to reflect current flat `active/<wu-name>/` layout (no category
  subdirs per R3) and new archive shape (`archive/<dated>/<wu-name>/` per 2.3.b). Existing body shows retired
  `feature/` / `technical/` / `incidental/` subdirs and old `{quarter}/{category}/{NN}_{name}/` archive paths.

    - `[x]` **2.15.a § Active Work code-block rewrite**
        - Replaced 3-category code-block with flat layout: `active/<wu-name>/` carrying `meta-<name>.md` (always),
          `prd-<name>.md` / `tasks-<name>.md` (when WU has them), and `notes-<name>.md` / `atomic-<name>.md` /
          `completion-<name>.md` (optional). Added note that `plan-<name>.md` is the pre-PRD synthesis artifact
          deleted at PRD creation per `1_create-prd.md`; never appears in `active/` (per amended R22c).

    - `[x]` **2.15.b § Alignment subsection rewrite**
        - Replaced Planned/Incidental split with single-branch alignment example: `feat/<name>` →
          `active/<name>/` → `completed/<dated>/<name>/`. Forward-compat with R62 promotion (Task 6.9 will
          execute the actual `reference/archive/` → `.arc/completed/` directory move).

    - `[x]` **2.15.c Both copies + lint**
        - Applied identically to `.arc/` instance + package source. Tier 1 lint clean.

    - `[x]` **2.15.d § Archival > Archive directory shape sync (scope expansion)**
        - Mirrored the path + content updates from 2.15 into the adjacent § Archival > Archive directory shape
          subsection (5-line code-block): path `reference/archive/<dated>/` → `completed/<dated>/`; dropped
          `plan-*.md` from listing per amended R22c. Other archive-path refs in § Archival (sweep semantics) +
          § ROADMAP wait for Task 6.7.l's full doc-surface sweep.

- _Outcome:_ § Directory Structure rewrote to forward-compat WOR state — flat `active/<wu-name>/` layout, single-
  branch alignment, `completed/<dated>/<wu-name>/` archive path (per R62, ahead of Task 6.9's actual directory
  move). Plan-* presence note added per amended R22c (deleted at PRD creation; never in active/). § Archival's
  Archive directory shape subsection mirrored to stay consistent with § Directory Structure. Both strategy-doc
  copies in sync. Other archive-path refs (sweep prose, ROADMAP render note) deferred to Task 6.7.l's doc sweep.

### `[x]` **2.16 `strategy-work-organization.md` § Branch Protection Modes reshape**

- _Goal:_ § Branch Protection Modes aligns to single-branch-per-WU. Protection modes themselves (`partial` /
  `full` config values) stay — those are real settings. Framing around "planning branches for delivering
  artifacts and implementation branches" retires; § Fully Protected > Lifecycle transitions (batch) subsection
  retires (tied entirely to the two-branch lifecycle).

- _Context:_ Distinct from 2.14's § Planning Branch Workflow retirement — this section's protection-mode
  framework persists; only the surrounding two-branch-model framing retires.

    - `[x]` **2.16.a Mode summary verification**
        - Mode Summary table retained as-is. Cells describe current state correctly: planned work requires
          branches under both modes; partial allows atomic/backlog direct commits + documented exceptions; full
          requires branches for everything.

    - `[x]` **2.16.b Framing rewrite around single-branch model**
        - § Partially Protected lead rewritten — "Planned work units require a branch from inception
          (single-branch-per-WU per § Branching)"; dropped "(feature, technical)" category reference and the
          "both planning branches and implementation branches" two-branch framing. Dropped redundant
          "**Planning branches:** Required for planned work" line. Documented exceptions list: kept Framework
          maintenance; replaced "Solo planning artifacts" (stale under single-branch model — planning artifacts
          live on the WU's `plan/<name>` branch) with "Off-work-unit maintenance commits".

    - `[x]` **2.16.c Batch transitions subsection retirement**
        - § Fully Protected > Lifecycle transitions (batching) subsection removed entirely. Single-branch
          model eliminates the batch-branch pattern (no separate planning PR, so no need to batch archival
          with planning).

    - `[x]` **2.16.d Both copies + lint**
        - Applied identically to `.arc/` instance + package source. Tier 1 lint clean. No orphan reference-link
          defs introduced.

    - `[x]` **2.16.e § Branches without work units retirement** (scope per session direction)
        - § Fully Protected > Branches without work units subsection removed entirely per user direction. The
          concept's definition under WOR is genuinely uncertain pending AWL's tier model; cleaner to recodify
          later when shape is known than to predict the pre-WOR definition.

- _Outcome:_ § Branch Protection Modes aligned to single-branch-per-WU model. Mode Summary table retained;
  § Partially Protected reframed (single-branch lead + revised documented exceptions); § Fully Protected
  trimmed to its essential statement. Two subsections retired entirely: § Lifecycle transitions (batching)
  (tied to two-branch lifecycle); § Branches without work units (stale concept; AWL recodifies later). Both
  strategy-doc copies in sync; lint clean.

### `[x]` **2.17 Codify user/ workspace directory reform in strategies (R65)**

- _Goal:_ Strategy docs reflect WOR's R65 user/ directory structural reform — per-WU subdir for WU-scoped content +
  cross-WU flat root, with WORKING-MEMORY.md extracted from SESSION-NOTES's prior `## Persistent Context` section. Lands
  before Phase 6.3's paired downstream landings — workflow consumer alignment (Task 6.3.e) and in-flight migration
  (Task 6.3.d) — so both have a codified target shape to consume.

    - `[x]` **2.17.a Update `strategy-session-operations.md` § SESSION-NOTES for per-WU subdir location**
        - § SESSION-NOTES path framing updated to `user/{identity}/<wu-name>/SESSION-NOTES.md` with per-WU subdir
          lifecycle (created at activation, removed at integration). Companion-to-project-pointer framing spans both
          roles — maintainer `status-{name}.md` in `active/{category}/` and contributor `meta-{name}.md` in the per-WU
          workspace subdir.

    - `[x]` **2.17.b Add § Working Memory section to `strategy-session-operations.md`**
        - New `## Working Memory` H2 codifies WORKING-MEMORY.md: workspace-root location, per-entry `_Remove when:_`
          trigger shape, eviction-triggered review at handoff. Three-personal-surface contrast block distinguishes it
          from SESSION-NOTES (per-WU snapshot) and USER-INBOX (capture surface). Matching TOC entry added.

    - `[x]` **2.17.c Add § User Workspace Directory section to `strategy-session-operations.md`**
        - New `## User Workspace Directory` H2 codifies the per-WU subdir + cross-WU flat root layout via concrete
          tree (`<wu-name>/SESSION-NOTES.md`, optional `meta-<wu-name>.md`, root `USER-INBOX.md` /
          `WORKING-MEMORY.md`, per-machine `.internal/`) and a path-class invariant statement. Matching TOC entry
          added.

    - `[x]` **2.17.d Update `strategy-planning-module.md` § USER-INBOX subsection for WORKING-MEMORY split**
        - § USER-INBOX gains a closing sibling-pointer paragraph routing cross-WU persistent-context readers to
          `strategy-session-operations.md` § Working Memory. Lightweight pointer; full coverage stays in
          session-operations.

    - `[x]` **2.17.e Sync to packages/**
        - Both copies edited in parallel during execution; final `diff` confirms byte-identical for both strategy
          files.

- _Outcome:_ R65 layout codified across both adopter-facing strategies. `strategy-session-operations.md` gains three
  contiguous sections — § User Workspace Directory (path-class layout) → § SESSION-NOTES (per-WU subdir location) →
  § Working Memory (cross-WU persistent context); `strategy-planning-module.md` § USER-INBOX routes cross-WU
  persistent-context readers to the workspace-layout doc. Both copies sync byte-identical. Phase 2 closes; Phase 6.3
  session-lifecycle workflow alignment (Task 6.3.e) and in-flight migration (Task 6.3.d) now have a codified target
  shape to consume.

## **Phase 3:** Boundary workflow restructure + ceremony fire-points

_Purpose:_ Restructure boundary workflows (`init-work-unit` / `activate-work-unit` / `integrate-work-unit` /
`archive-work-unit`) for single-branch-per-WU; wire PROJECT-PRD alignment, ROADMAP regeneration, capture-pipeline
ceremony writes (absorption / drain / promotion), config keys, and the new extension point. Workflow restructure
scope is full body rewrite where the new model invalidates prior shape, not just file rename + step touch-up —
init-work-unit and activate-work-unit are the renamed cases; both carry stale two-branch-model framing retired
under WOR.

_Design decisions:_ Capture-pipeline ceremony writes (R20, R21) fold into each affected workflow rather than a
horizontal cross-cutting parent — workflow-level units stay coherent. R53 inline-fold audits stay one parent with five
subtasks per § Inline-folds scope discipline. `integrate-work-unit.md` owns composition (R14, R30, R31) regardless of
cadence; `archive-work-unit.md` owns archival mechanics (state flip + sweep + ROADMAP regen) as a cadence-invariant
single source of truth — DRY across cadences. Cadence dispatch lives in integrate (3.4.g), not archive. Within-phase
ordering: 3.7 (config keys) ideally lands before 3.3 / 3.5 runtime verification — workflow text can forward-reference,
but runtime checks of `review.planning_checkpoint` halt and `archive.cadence` dispatch need both present.

### `[x]` **3.1 Retire `integrate-planning-branch.md`**

- _Goal:_ `integrate-planning-branch.md` is deleted; the workflow no longer exists in the ARC surface —
  single-branch-per-WU eliminates the separate planning-PR concept entirely. Cross-reference updates ride the migration
  sweep (6.7).
    - Deleted from `.arc/system/workflows/arc/work-unit-lifecycle/planning/` and
      `packages/arc-framework/arc/system/workflows/arc/work-unit-lifecycle/planning/`.

### `[x]` **3.2 Rename `activate-planning-branch.md` → `init-work-unit.md` (WU + meta-file creation)**

- _Goal:_ `init-work-unit.md` (renamed from `activate-planning-branch.md`) creates a WU on a `plan/<name>` branch with a
  meta file populated from `template-meta.md` — initial `**State:** Planning`, `**Owner:**` auto-populated from
  `arc.identity` via template placeholder, other fields defaulted per template.

    **Strategies:** `strategy-work-organization.md`

    - `[x]` **3.2.a Rename file + sync to packages/**
        - Renamed both copies via `git mv` (`.arc/` + `packages/arc-framework/arc/`); content unchanged
          (pure rename detected by git as `R`). Body restructure deferred to 3.2.b.

    - `[x]` **3.2.b Responsibility shift: WU + meta-file creation**
        - Full workflow body rewrite. Steps reduced 7 → 6: status-file create replaced with meta-file create
          from `template-meta.md` (R10 placeholder substitution); two-branch shape retired (Step 2 + Step 7
          batch arm with `integrate-planning-branch` ref); `plan/<name>` per R2; backlog source per R19; push
          de-optionalized; naming + plan-doc-lifecycle deferred to method/strategy; lifecycle as ASCII diagram.

    - `[x]` **3.2.c Wire `template-meta.md` reference (created in 4.1)**
        - Named in workflow body as plain backticked `template-meta.md`. Markdown-link form deferred to
          Task 4.1 — broken-link hook blocks forward-compat link targets, so wiring lands when target exists.

- _Outcome:_ Workflow body rewritten end-to-end — broader than the original 3.2.b sketch (which covered
  only the positive meta-file contract). New model: two-branch shape retired, meta from `template-meta.md`
  per R58 + R10 placeholder, `plan/<name>` per R2, backlog source per R19, push de-optionalized. Revision
  pass defers naming to `branch-format` (CB framing dropped — `plan/` is ARC's, not CB's), trims
  duplications of strategy / DEV-RULES content, and replaces "What comes after" prose with an ASCII
  lifecycle diagram. Cross-cutting: `branch-format` method codifies planning-prefix invariance; PRD R12
  `[Internal]` → `[internal]` for sentinel alignment.

### `[x]` **3.3 Restructure `activate-work-unit.md` (state-flip + branch rename + absorption-write + ROADMAP regen)**

- _Goal:_ `activate-work-unit.md` transitions a WU from Planning to Active via in-place state-flip + branch rename +
  absorption-write + ROADMAP regen + supplementary PROJECT-PRD alignment check — no new branch creation, no directory
  move.

    **Strategies:** `strategy-work-organization.md`

    - `[x]` **3.3.a Pre-condition check + `[!NOTE]` redirect block**
        - Step 1 verifies the activation context — running on a `plan/<name>` branch, `active/meta-{name}.md` shows
          `**State:** Planning`, PRD + tasks-* present. Top-of-doc `[!NOTE]` block redirects to `init-work-unit.md`
          when no WU exists on the current branch (no `plan/<name>`, no `meta-{name}.md`).

    - `[x]` **3.3.b `pre-activation` extension fire (R47)**
        - Step 2 is the fire-point reference; extension file lands in 3.8.a. Halt-on-fail with surface-for-user;
          user fix-and-retries or explicit-invoke bypasses. Extension named `pre-activation` per R47/R56 (renamed
          from originally proposed `pre-execution-graduation`); workflow forward-references by name only — no
          markdown link until 3.8.a creates the file (broken-link hook would block).

    - `[~]` **3.3.c ~~`review.planning_checkpoint` halt (R46)~~ — Deferred**
        - Subtask removed mid-execution. R46's design surfaced a deeper smell in ARC's customization architecture
          (config-as-method-toggle pattern with no method behind it). Whether a planning-checkpoint mechanism
          re-emerges is deferred to `plan-customization-architecture.md`. The `pre-activation` extension (3.3.b)
          stands on its own as the activation-time hook; teams wanting a halt today author a `workflow-interlock`
          in the extension's `.actions`.

    - `[x]` **3.3.d PROJECT-PRD + TECHNICAL-OVERVIEW supplementary checks (R34, R60 — conditional)**
        - Step 3 carries two sub-sections within the review step.
        - **PROJECT-PRD:** Fires only when PROJECT-PRD edited since PRD approved. Soft check; rarely blocks.
        - **TECHNICAL-OVERVIEW:** Fires only when TECHNICAL-OVERVIEW edited since PRD approved AND PRD touches
          technical surfaces (tech stack, architecture, runtime, dependencies, infrastructure). Soft check;
          rarely blocks. Independent of PROJECT-PRD — scope distinction is the trigger.

    - `[x]` **3.3.e State-flip + plan-doc removal**
        - Step 4 edits `active/meta-{name}.md` (`**State:** Planning` → `**State:** Active`) and `git rm`s any
          residual `active/plan-{name}.md` as a safety-catch (plan-doc should already be absent — deleted at PRD
          creation). Both edits bundle into the activation `workflowCommit` with a template message body.

    - `[x]` **3.3.f Branch rename: 3-step routing (R2)**
        - Step 5 carries the 3-step shape with class-tag annotations inline: `git branch -m plan/{name} {type}/{name}`
          (raw), `git push -u origin {type}/{name}` (`workflowPush`), `git push origin --delete plan/{name}` (raw —
          destructive flag stays literal; wrapper refuses `--delete` by design). Cross-ref to `branch-format` method
          and Work Organization Strategy § Branching.

    - `[x]` **3.3.g Absorption write (R20, R21)**
        - Step 6 (`arc-in-git` only) documents absorption of queued entries from `user/{identity}/USER-INBOX.md`
          (`## Atomic` / `## Backlog`) or shared `backlog/ATOMIC-INBOX.md` / `backlog/BACKLOG-INBOX.md` into this
          WU's task list / atomic companion. Source-entry deletions land as a `workflowCommit` ceremony write;
          routing recorded in commit message. Absorbing-artifact edits typically landed during planning.

    - `[x]` **3.3.h Regenerate ROADMAP (R39)**
        - Step 7 (`arc-in-git` only) hand-maintains ROADMAP per algorithm in Work Organization Strategy § ROADMAP
          — updates the WU's tier placement for its new `Active` state. Default: dedicated `chore(arc):` commit
          (`workflowCommit`). May ride the activation commit only when the edit is trivial (single tier-line move)
          per DEV-RULES.ARC § Atomicity.

- _Outcome:_ Workflow body rewritten end-to-end for single-branch-per-WU: 8 sequential steps from pre-condition gate
  through `post-work-unit-activate` (preserved from prior shape), replacing the prior backlog-to-active rotation +
  new-branch-creation flow. Mode detection inlined per-step (Steps 6-7 gate on `pm.mode`) rather than as a workflow
  preamble. Frontmatter declares `pre-activation` (forward-reference; file lands at 3.8.a) and preserves
  `post-work-unit-activate` (not retired by WOR). Active-dir paths use the flat `active/{file}` shape matching
  init-work-unit.md (per-WU subdir confirmed out-of-scope by user — per-worktree isolation makes it redundant in
  `active/`; subdirs apply only in `backlog/`, `archive/`, and `user/{identity}/`). Original 3.3.c
  (`review.planning_checkpoint` halt) deferred mid-execution after architectural review surfaced
  config-as-method-toggle smell; resolution moved to `plan-customization-architecture.md`.

### `[x]` **3.4 Restructure `integrate-work-unit.md` (PR-open + review iteration + post-approval composition + sweep)**

- _Goal:_ `integrate-work-unit.md` ships the single merge-to-main moment under default
  `archive.cadence: with-integration`. Two timing phases inside one PR: code commits at PR open, then
  post-review-approval the completion-content commit (Release Notes Entry + Completion Notes composed into the meta
  file's archive-phase sections, reflecting final reviewed scope) + sweep commit (meta file moves to
  `archive/<dated>/{wu-name}/`) + ROADMAP regen commit land as the final push before merge.

    **Strategies:** `strategy-work-organization.md`

    - `[x]` **3.4.a Pre-conditions + State transition (Active → Integrating)**
        - Step 1: pre-conditions list (WU branch per `branch-format`; meta `**State:** Active`) + edit flipping
          State to `Integrating` + `workflowCommit` class-tagged commit with `chore(meta):` subject and template
          message body. Inline option-(1) routing cue at this first class-tag fire site (per atomic-inbox line 285).
          Subject + shape cross-ref'd to DEV-RULES.ARC § Commit Discipline (meta-file commit shape — forward-compat
          from legacy `chore(status):` per new Task 6.7.p sweep).

    - `[x]` **3.4.b Pre-pr-review extension fire (R56) — before PR creation push**
        - Step 2 (`Pre-PR review · #pre-pr-review`), gated by `review.pre_merge`: invokes the `diff-review` method
          (with `review-triage` + `(code review)` footer) AND the `pre-pr-review` extension as a two-substep step.
          Preserves the pre-WOR method+extension dual-fire pattern at the pre-PR moment; the extension is
          forward-referenced by name (file lands at 3.8.c — broken-link hook would block a markdown link today).

    - `[x]` **3.4.c PR creation**
        - Step 3: `git push -u origin {type}/{name}` (`workflowPush`) + `gh pr create`. Single PR per R6, no `[PLAN]:`
          prefix. PR body sourced from `template-pull-request.md`; the no-post-merge-continuity rule cross-ref's to
          DEV-RULES.ARC § Write for the reader, not the author.

    - `[x]` **3.4.d Review iteration**
        - Step 4: documents the review-response cycle — `review-triage` method for findings, `(code review)` footer
          per the `commit-footer` method, Tier 1 gates per fix commit. State stays `Integrating`; composition + sweep
          do not fire here.

    - `[x]` **3.4.e Pre-merge-review extension fire (R56) — post-review-response gate**
        - Step 5 (`Fire pre-merge-review extension · #pre-merge-review`): the new post-review-response fire-point.
          Extension forward-referenced by name (new file lands at 3.8.e). Default-inactive — structural no-op when
          extension absent; halt-on-fail when present.

    - `[x]` **3.4.f Workflow-interlock: "proceed to archive ceremony"**
        - Step 6: `> [!IMPORTANT]` `workflow-interlock:` callout. Surfaces review-settled state (open threads
          resolved, required approvals received, checks green); asks whether to begin composing the final-form
          Release Notes Entry + Completion Notes.

    - `[x]` **3.4.g PROJECT-PRD + TECHNICAL-OVERVIEW final alignment checks (R34, R60 — sub-bullets)**
        - Step 7: H4 subheads `#### PROJECT-PRD` (always evaluated) and `#### TECHNICAL-OVERVIEW` (PRD-touched-
          technical-surfaces only — independent of PROJECT-PRD; scope distinction is the trigger). Both soft; cross-
          ref to `1_create-prd.md`'s alignment-check family.

    - `[x]` **3.4.h Release Notes Entry composition (R14, R30) — final-form, uncommitted**
        - Step 8: Release Notes Entry into `active/meta-{name}.md`'s archive-phase Release Notes section. Keep a
          Changelog 7-category set (Added | Changed | Removed | Fixed | Infrastructure | Deprecated | Security);
          one-paragraph summary + optional Breaking Changes callout. Edit uncommitted; Step 11's interlock surfaces
          it for review.

    - `[x]` **3.4.i Completion Notes composition (R14) — final-form, uncommitted**
        - Step 9: narrative Completion Notes into the meta file's archive-phase section. Same uncommitted-surfacing
          pattern as Step 8.

    - `[x]` **3.4.j Drain-write (R20, R21) — uncommitted**
        - Step 10 (`arc-in-git` only — `> **Skip**` blockquote for `none` / `external`): final deletion of absorbed
          shared inbox entries. Uncommitted; capture-routing cross-ref'd to DEV-RULES.ARC § Leave it cleaner.

    - `[x]` **3.4.k Workflow-interlock: "review composed content + planned sweep target + ROADMAP delta"**
        - Step 11: `> [!IMPORTANT]` `workflow-interlock:` callout with a numbered surface block — composed Release
          Notes Entry + Completion Notes (Steps 8–9), planned sweep target with full `active → archive` path, ROADMAP
          delta. Gates "proceed to commit + sweep + push".

    - `[x]` **3.4.l Commit completion content**
        - Step 12: `workflowCommit` bundling composition + drain-write edits. Template message body with Release
          Notes Entry / Completion Notes / drain summary; `Context: meta-{name}.md (integration)` footer per the
          `commit-footer` method.

    - `[x]` **3.4.m Cadence dispatch — invoke `archive-work-unit.md` inline under `with-integration`**
        - Step 13: reads `archive.cadence` from `arc-config.yml`. `with-integration` (default) invokes
          `archive-work-unit.md` inline (state flip + sweep + ROADMAP regen handled there per 3.5); `manual` skips
          inline invocation and surfaces a post-merge note. Third value `deferred` not enumerated — retired per
          `notes-work-organization-reform.md` § `archive.cadence: deferred` considered and rejected.

    - `[x]` **3.4.n Final push**
        - Step 14: `workflowPush` covering accumulated commits (sweep + ROADMAP included only under
          `with-integration`; completion content only under `manual`). Integration-interlock callout placed below the
          push command gates merge; `gh pr merge` invocation block cites `merge.strategy` config.

- _Outcome:_ Workflow body rewritten end-to-end for the new integration shape — 14 sequential steps split into
  Phase 1 (open + iterate, code commits only) and Phase 2 (compose + sweep + ship, post-review-approval). Two
  workflow-interlocks bracket the composition middle (Step 6 "proceed to archive ceremony", Step 11 "review
  composed content + sweep + ROADMAP delta"); a third `integration-interlock` callout at Step 14 gates merge.
  State machinery: `Active → Integrating` at Step 1's `workflowCommit` (`chore(meta):` subject — forward-compat
  from `chore(status):` per new Task 6.7.p sweep); `Integrating → Shipped` rides the inline `archive-work-unit.md`
  invocation under `with-integration` (Step 13). Cadence enum trimmed to two values (`with-integration` |
  `manual`); third value `deferred` retired per WOR notes — strategy doc's stale 3-value enumeration scheduled
  for cleanup at new subtask 6.7.o (added this pass). Frontmatter declares `diff-review` / `review-triage` /
  `commit-footer` methods and `pre-pr-review` / `pre-merge-review` extensions (both forward-referenced by name;
  files land at 3.8.c / 3.8.e). Step 4 phrasing kept generic — does not bind to a not-yet-codified
  `review-response` method (forward-compat with plan-review-method-family). Method / template defer discipline:
  workflow body cites methods and templates by reference only; review-triage classifications, commit-footer
  parentheticals, and Release Notes category set live in their authoritative sources (`review-triage.md`,
  `commit-footer.md`, `template-meta.md`'s schema) — `template-meta.md` forward-referenced by name (lands at 4.1).
  Class-tag cue hardening: option (1) inline lookup hint at first fire site (per atomic-inbox line 285) adopted
  in this workflow + retroactively in init-work-unit.md (3.2) and activate-work-unit.md (3.3); broader sweep +
  options (2)/(3)/(4) remain deferred per the atomic-inbox entry. Retired from prior shape: Phase 1-on-child-branch
  / Phase 2-code-review-merge framing, multi-branch / rotate-branch references, completion-doc creation (replaced
  by meta-file archive-phase composition at Steps 8–9), separate status-file Next Action update step (folded into
  Step 1's state flip), pre-merge inbox-triage step (drain-write at Step 10 narrows to absorbed-entry deletion;
  personal inbox triage moves out of the integrate path), "Partially Superseded Work" appendix (deactivate-work-unit
  Case A-delete + clean-work-unit cover the abandonment case). Substantive deviation from subtask list: 3.4.b
  expanded to include both the `diff-review` method and the `pre-pr-review` extension fire (gated by
  `review.pre_merge`) — preserves the pre-WOR method+extension dual-fire at the pre-PR moment; the subtask
  description named only the extension. Two follow-up tasks added to Phase 6.7 (deferred-cadence cleanup at 6.7.o;
  Status→Meta nomenclature sweep at 6.7.p). Retroactive touches to init-work-unit.md (Task 3.2) and
  activate-work-unit.md (Task 3.3) land in 3.4's commit; those tasks' own outcome notes stay as-landed since the
  retroactive edits are tracked under 3.4's scope.

### `[x]` **3.5 Restructure `archive-work-unit.md` (single source of truth for archival mechanics; cadence-invariant body)**

- _Goal:_ `archive-work-unit.md` carries the archival mechanics — state flip `Integrating → Shipped`, sweep commits,
  ROADMAP regen, post-Shipped errata convention. Invariant body regardless of invocation context: invoked inline from
  `integrate-work-unit.md` under `with-integration` cadence (via 3.4.g), or standalone post-merge under `deferred` /
  `manual`.

    **Strategies:** `strategy-work-organization.md`

    - `[x]` **3.5.a Pre-condition check (state `Integrating`)**
        - Step 1 lands as a grep-driven gate on `active/meta-{name}.md` State; halt-with-surface when
          `**State:** Integrating` is absent and names upstream composition in `integrate-work-unit.md` as the
          prerequisite. State flip below is documented as the only transition archive owns.

    - `[x]` **3.5.b State flip `Integrating → Shipped`**
        - Step 2 lands: meta-file edit `**State:** Integrating` → `**State:** Shipped`. Single direction; always.

    - `[x]` **3.5.c Sweep commits (R5, R17, R41)**
        - Step 3 lands: `mkdir -p .arc/archive/{dated}/{name}` then per-file `git mv` of `meta-` + companions
          (`prd-`, `tasks-`, `notes-`, `atomic-`) into the archive subdir. Adopted flat-active path shape
          (`.arc/active/meta-{name}.md`) — no `<cat>/` subdir — matching landed `init-work-unit` /
          `activate-work-unit` / `integrate-work-unit` precedent and work-org strategy § Directory Structure;
          per-worktree isolation invariant cross-referenced inline. `{dated}` follows `YYYY-q*`.

    - `[x]` **3.5.d Regenerate ROADMAP (R39)**
        - Step 4 lands as `arc-in-git`-only with a skip-block for `pm.mode ∈ {none, external}`; hand-maintain per
          strategy § ROADMAP. The shipped WU drops out of ROADMAP naturally — the render algorithm walks
          `active/**` + `backlog/planned/**`, and the Step 3 sweep removes the WU from both.

    - `[x]` **3.5.e Post-Shipped errata convention note (R32)**
        - Trailing `## Post-Shipped errata convention` section lands at the document's tail: Release Notes Entry
          edits after `**State:** Shipped` are errata only; git history is the lock (matches keep-a-changelog
          norms); no mechanical enforcement.

- _Outcome:_ Full workflow body rewrite — broader than the original a/b/c/d/e sketch (which covered only the new
  positive scope). Stale shape retired wholesale: per-`{category}/` archive layout (R41 collapsed to
  `archive/<dated>/<wu-name>/`); `**State:** Complete` + `**Integration:** Merged` gate (R9 collapsed the value set
  to 4); PR-URL recording + child-branch delete steps (now upstream in integrate's composition per R14 retiring
  `completion-{name}.md`); reference-file routing (no R-ID; out of WOR scope); explicit `git rm` of the status
  file (now `git mv`'d as the meta file in the sweep); PROJECT-STATUS update (R40 retires the file entirely);
  `activate-planning-branch` / `integrate-planning-branch` cross-refs (R7 retired both); Full-Protection
  batch-branch setup step (governed by ambient `branch.protection`, not archive). Cadence dispatch retired from
  this body — lives at integrate Step 13 per R31; archive body is invariant across both cadences. New shape: 6
  steps + trailing errata section, aligned with Task 3.4 integrate precedent (`workflowCommit` class-tag routing,
  flat active path, meta-* nomenclature). Cadence enum aligned to 2 values per PRD R16 (with-integration,
  manual); strategy § Archival still lists 3 (`deferred` extra) — flagged for 6.7.o.

### `[x]` **3.6 Wire PROJECT-PRD alignment check + promotion-write into `1_create-prd.md`**

- _Goal:_ `1_create-prd.md` adds an explicit PROJECT-PRD alignment check step with halt-and-ask conditions (cite
  specific principle by number when passing) + finalizes promotion writes when a BACKLOG-INBOX entry promotes to a draft
  `plan-*` doc.

    - `[x]` **3.6.a New step: `## Step N: PROJECT-PRD alignment check`**
        - Step 4 lands as the explicit `## Step 4: PROJECT-PRD alignment check` between Discovery (Step 3) and
          Save (renumbered Step 6). Halt-and-ask conditions enumerated as a three-item bullet list (principle
          conflict, anti-goal introduction, load-bearing-axis touch); orientation framing names PROJECT-PRD as
          the project's vision contract.

    - `[x]` **3.6.b Cite-principle-by-number requirement on pass**
        - Step 4 closer carries the cite-by-number discipline with a worked example ("checked against principle
          3 (Configurability with strong defaults) — passes") and a rationale clause ("Substantive citation
          keeps the alignment check load-bearing rather than ornamental") that codifies the
          live-vs-stale-tension mitigation captured in notes-work-organization-reform.md inline rather than
          cross-referencing an internal-dev surface.

    - `[x]` **3.6.c Promotion write (R20, R21)**
        - Step 6's `**Promotion-write**` sub-bullet lands after the Save location list: direct BACKLOG-INBOX →
          PRD promotions (no intermediate `plan-*` doc) delete the inbox entry in the same commit as PRD save;
          routing record in the deletion commit message; cross-ref to DEV-RULES.ARC § Leave it cleaner.
          Explicit note that intermediate `plan-*` promotions delete the inbox entry at plan-doc creation, not
          here — keeps the ceremony-only write rule grep-discoverable from either path.

    - `[x]` **3.6.d New step: `## Step N+1: TECHNICAL-OVERVIEW alignment check` (R60)**
        - Step 5 lands as the explicit `## Step 5: TECHNICAL-OVERVIEW alignment check (conditional)`. Fire
          trigger codified (PRD touches tech stack, architecture, runtime, dependencies, infrastructure); single
          primary halt condition (drift detected — PRD introduces tech not in TECHNICAL-OVERVIEW). R60's
          companion "edited since PRD approved" condition is explicitly deferred to activate / integrate
          fire-points with cross-references — at create-PRD time the PRD hasn't been approved yet, so the
          condition is N/A here. Independence-from-Step-4 framing preserved per R60's "single PRD may trigger
          both, one, or neither".

    - `[x]` **3.6.e Cite-section-by-name requirement on pass (TECHNICAL-OVERVIEW)**
        - Step 5 closer parallels Step 4's cite discipline: "checked against § 2 Architecture Components —
          passes"; section-name citation reflects TECHNICAL-OVERVIEW's section-based structure. Rationale clause
          omitted (Step 4's clause covers the family-level discipline; redundant to repeat).

- _Outcome:_ Two new explicit alignment-check steps insert between Discovery (Step 3) and Save (now Step 6);
  existing Steps 4 → 6 (Write+Save+promotion-write) and 5 → 7 (Retire Plan Documents). One-pass economy adjacent
  fixes mirror Task 3.4 precedent for first-fire-site forward-compat: META-PRD → PROJECT-PRD on the intro note
  (line 11), `status-{name}.md` → `meta-{name}.md` at Step 7's planning-meta-file sub-step (this workflow's only
  meta-file fire site), and a broken `activate-planning-branch` link replaced with the live `init-work-unit`
  reference (R7 retired the former at Task 3.2 — the 1_create-prd.md cross-ref was stale and pointed at a
  non-existent target; link block reconciled). Pre-flight prose ("Before starting, review the project's META-PRD
  and TECHNICAL-OVERVIEW…") dropped — redundant once the explicit alignment-check steps codify the discipline.
  `{category}/` paths in Steps 1 / 6 / 7 left as pre-WOR; Phase 6 sweep (6.7.l/m) handles the active+backlog
  directory restructure.

### `[~]` **3.7 ~~Add `review.planning_checkpoint` to `arc-config.yml`~~ — Deferred and reverted**

- _Outcome:_ Initially landed at commit `5c19d8d8` (config key + CLI types + status-reader defaults +
  shell validator + tests across both copies). Reverted mid-WOR after architectural review surfaced a
  config-as-method-toggle smell with no method behind the gate — see
  `plan-customization-architecture.md` for the broader reform that determines whether a planning-checkpoint
  mechanism re-emerges (as a method with `active` flag, an extension-only path, or not at all). Forward-edit
  removed the key from `arc-config.yml` (both copies), `validate-config.sh` enum + `known_keys` list (both
  copies), `src/commands/config/types.ts`, `src/lib/config/status-reader.ts` (DEFAULTS + ENUM_VALIDATORS),
  and test fixtures (integration + 6 unit suites + new describe block). Subtasks below preserved for
  history; all originally `[x]` work has been undone.

    **Strategies:** `strategy-package-project-sync.md`

    - `[~]` **3.7.a Add key to package source**
        - Reverted: key removed from `packages/arc-framework/arc/system/arc-config.yml`.

    - `[~]` **3.7.b Sync to project instance**
        - Reverted: key removed from `.arc/system/arc-config.yml`.

    - `[~]` **3.7.c CLI-side schema validation**
        - Reverted: `ConfigSettings` field, `DEFAULTS` + `ENUM_VALIDATORS` entries, `validate-config.sh`
          `validate_enum` + `known_keys` (both copies), and test fixtures all removed.

### `[x]` **3.8 Extension fire-point family — 5 files (renames + new) + description/contract pass**

- _Goal:_ Five-extension fire-point family ships in `.arc/system/extensions/` (and packages/ counterparts) per R56 —
  three renames + two new files — each with audited description / contract / "Use for" framing per R57. Default-inactive
  across the family; `pre-push-review` and new `pre-merge-review` ship as `[No extension configured]` no-default shells.

    **Strategies:** `strategy-package-project-sync.md`, `strategy-configurability-architecture.md`

    - `[x]` **3.8.a `pre-activation` — new file (was proposed as `pre-execution-graduation`)**
        - Both copies created with `[No extension configured]`. Workflow / Fires / Contract land per spec;
          Contract carries halt-on-fail plus fix-and-retry-or-explicit-invoke bypass.

    - `[x]` **3.8.b `pre-commit-review` — rename from `pre-stage-review` + description/contract audit**
        - `git mv` in both copies (rename detected by git as `R`). Frontmatter `name:`, H1, and section heading
          updated. Workflow line names `arc-commit` skill + `prepare-commits.md` (first-fire-site forward-compat —
          `arc-commit` wiring lands at 3.10). Description carries the extension-vs-hook signal at glance-level;
          Contract block carries the boundary detail (agent procedures + `workflow-interlock` stops vs. scriptable
          per-commit hook checks). `.actions` retained as `[No extension configured]`.

    - `[x]` **3.8.c `pre-pr-review` — rename from current `pre-merge-review` + description/contract audit**
        - `git mv` in both copies (rename detected by git as `R`). `.arc/` copy keeps `active: true` + CodeRabbit
          `.actions`; package source keeps `active: false` + placeholder — preserves the Configurable-surface
          divergence. Frontmatter `name:`, H1, description, and section heading updated. Fires line clarified to
          "before the push that opens the PR" (was "before push and PR creation" — same fire-point, more precise).
          `review.pre_merge` config key reference retained — 3.7 reverted, no key rename in this WU.

    - `[x]` **3.8.d `pre-push-review` — new file (no default `.actions`)**
        - Both copies created with `[No extension configured]`. Workflow line names `arc release push` + `arc sync`
          under the push-wrapper umbrella. Contract documents per-push frequency, halt-on-fail, and the
          reserved-for-future / family-namespace-completion framing.

    - `[x]` **3.8.e `pre-merge-review` — new file at post-review-response fire-point (no default)**
        - Both copies created at the freed name (3.8.c vacated it). Contract positions this extension as the
          trailing gate of integrate-work-unit's review-and-merge sequence (`pre-pr-review` → `review-response`
          processing → `pre-merge-review`); reserved-pending-final-state-check use cases enumerated.
          `review-response` framed as processing (planned method family, not yet shipped), not as an extension.

    - `[x]` **3.8.f Description/contract pass (R57) — all five files**
        - Audit pass clean across all five. Description lines carry one-line lifecycle-position signal; Contract
          blocks state halt-on-fail explicitly; frequency language matches wiring (per activation / per commit /
          per PR-creation / per push / per merge). Extension-vs-hook boundary surfaced at the pre-commit-review
          file's description AND contract per task spec.

    - `[x]` **3.8.g Sync all to packages/**
        - Pair diff confirms byte-identical for `pre-activation`, `pre-commit-review`, `pre-merge-review`,
          `pre-push-review`, and `README`; `pre-pr-review` pair carries the expected Configurable-surface delta
          (`active:` + `.actions` content) — pre-commit two-copy-divergence hook won't false-positive (divergent
          before, divergent after). Markdown lint clean (0 errors / 249 files). README updated in both copies:
          Index reordered with 4 new + 1 renamed entry replacing 2 retired; Extension Points table reordered to
          true lifecycle order across all 5 fire-points.

- _Outcome:_ Family lands as a coherent unit — 5 files (2 renames preserving git rename detection, 3 net-new) plus
  README in both copies. Extension-vs-hook decision boundary now explicit at the pre-commit-review surface
  (description AND contract). 3-extension sequence at integrate-work-unit (`pre-pr-review` → `review-response` →
  `pre-merge-review`) documented in the trailing extension's contract. README's Extension Points table reordered
  to true lifecycle order (was loose-grouped). Forward-ref `#anchor` notation in `integrate-work-unit.md` Steps
  2 / 5 now unblocked — both renamed/new files exist on disk, anchors can be restored at author discretion
  (persistent-context entry's removal trigger met).

### `[x]` **3.9 Inline-fold R53 audits across touched workflows**

- _Goal:_ R53's five inline-fold audits ride this WU's workflow touches — class-tag routing, workflow-interlock
  markers, `arc sync` / `arc release push` auto-set-upstream, `integrate-work-unit` post-PR-create handoff guidance,
  and `session-init` / `session-handoff` lifecycle Next Action pointer contract — apply at the touch, not as separate
  sweeps.

    - _Note:_ The broader sweeps across untouched workflows stay with their respective inbox entries' future WUs. This
      task verifies the audits land on workflows touched by 3.1-3.8 only.

    - `[x]` **3.9.a Commit/push class-tag routing audit on touched fire-sites**
        - Surveyed fire-sites across 5 touched workflows (init-work-unit, activate-work-unit, integrate-work-unit,
          archive-work-unit, 1_create-prd). All correct except activate-work-unit Step 8's extension-fire commit
          line — missing class tag where the workflow emits a dedicated commit. Fixed inline in both copies: added
          `workflowCommit` annotation, consistent with Steps 4 / 6 / 7. Review-fix commits in integrate-work-unit
          Steps 1 / 4 stay intentionally raw (default-routing per DEV-RULES.ARC § Workflow class-tag routing).

    - `[x]` **3.9.b Workflow-interlock marker audit**
        - Surveyed interlock markers across 5 touched workflows. All callouts correctly shaped (class +
          stop-when + surface-what + await-direction) except 1_create-prd's terminal "Stop here" line — mixed
          workflow exit with implicit wait-language outside any callout. Fixed inline in both copies: replaced
          with proper `## Next Step` section pointing to 2_generate-tasks, matching activate-work-unit's exit
          pattern.

    - `[x]` **3.9.c Push/notes/upstream UX coherence pass (`arc sync` / `arc release push` + session-init transparency)**
        - Four commits landing six work areas. (1) Pushability matrix: new `caller-resolvable` disposition +
          `isRefusalCondition` helper centralizing the "what causes refusal" predicate across seven consumers
          (`03012ac6`). (2) release-push + sync + paired-push orchestrators auto-resolve no-upstream via argv-`-u` OR
          `pushInterlock != manual`; new sync `push-with-upstream-init` `WorktreeAction` arm + three cell variants
          (`paired-push-with-upstream-init` / `worktree-only-with-upstream-init` /
          `worktree-with-upstream-init+notes-prompt`); `blocked-no-upstream` removed from `REFUSED_SYNC_CELLS`
          (structurally unreachable) (`a290a60e`). (3) Session-init orientation transparency — four new conditional
          sections for `no-upstream` / `detached-head` / `no-remote` / `dirty` — plus sync's `reconcileGuidance`
          rewrite to split-state notes guidance ("Notes saved locally; push deferred. <reason>.") with
          forward-routing actionable hints for all seven NOTES_BLOCK_WORKTREE_STATES cases (`0448a35c`). (4) ADR-017
          amendment recording the `caller-resolvable` disposition addition and refusal-taxonomy update + integration
          test against tmpdir git repo on a fresh no-upstream branch (this commit). Activation latent bug resolved
          — wrapper-routed `workflowPush` on no-upstream branch under `pushInterlock: on-workflow` now succeeds via
          auto-`-u`; previously refused with code 14. Tests: +11 unit (pushability, release/push, sync orchestrator,
          paired-push) + 2 integration (real probe vs. tmpdir git repo). Scope expanded mid-execution per
          pre-implementation audit findings — documented at task rewrite (`65542470`) with rationale. Local-ahead
          notes orientation surface deferred — `UserSessionInitState` spine collapses local-ahead to clean; needs
          deeper spine change, tracked for follow-up.

    - `[~]` **3.9.d ~~`integrate-work-unit` post-PR-create handoff guidance refresh~~ — Superseded**
        - Premise eliminated by Task 3.4's `integrate-work-unit.md` restructure — no post-PR-create handoff
          guidance remains in the workflow body to refresh. Audit verified all 5 touched workflows: activate /
          integrate / archive carry no handoff suggestions at all; `init-work-unit` and `1_create-prd` touch
          Next Action only to set planning-session prompts (consistent with the contract's planning-session
          branch). Workflows correctly defer session-boundary decisions to the user; `session-handoff.md` owns
          the skip-threshold mechanism (lines 108-118) and is user-invoked. Nothing to change.

    - `[x]` **3.9.e Lifecycle Next Action pointer contract preservation in `session-init` / `session-handoff`**
        - Audit verified touched workflows (3.1-3.8) correctly defer Next Action setting to `session-handoff.md`:
          activate / integrate / archive don't set Next Action; `init-work-unit` and `1_create-prd` set planning
          prompts using freeform format consistent with the contract's planning-session branch. Contract text at
          `session-handoff.md:194-198` trimmed to post-WOR shape: dropped `activate-planning-branch` (renamed to
          `init-work-unit` per Task 3.2 — not a lifecycle continuation since init's idempotent reconcile doesn't
          need a step-pointer Next Action) and `rotate` (forward-compat — file retired in Task 3.11.c). Resulting
          list: `(integrate, archive)`. Synced to packages/. `INTEGRATION_WORKFLOW_PREFIX` regex at
          `src/commands/active/status.ts:48` verified unchanged — already covers both remaining workflows.

### `[x]` **3.10 Wire `pre-commit-review` into `arc-commit` skill**

- _Goal:_ The `arc-commit` skill — canonical commit entry-point — invokes `pre-commit-review` extension before commit
  creation, alongside existing `prepare-commits.md` workflow wiring. Every-commit-fires naming (R55-R56) honored by
  every-commit-pathway wiring per R57's accountability.

    - `[x]` **3.10.a Audit `arc-commit/SKILL.md` — verify existing fire-point position**
        - Verified at SKILL.md line 41 — fire-point position (after staging confirmation, before commit invocation)
          remains correct under the renamed `pre-commit-review` semantic. No structural move needed; rename handles
          the semantic clarification.

    - `[x]` **3.10.b Rename `pre-stage-review` → `pre-commit-review` at the fire-point + refresh language**
        - Renamed `pre-stage-review` → `pre-commit-review` at SKILL.md line 41 across all three surfaces:
          `.arc/system/skills/arc-commit/SKILL.md`, `packages/arc-framework/arc/system/skills/arc-commit/SKILL.md`,
          and harness hand-sync to `.claude/skills/arc-commit/SKILL.md`. Refreshed language adds halt-on-fail
          clause; preserved the established active-extensions-list pattern.

    - `[x]` **3.10.c Update `prepare-commits.md` frontmatter to use `pre-commit-review`**
        - Updated prepare-commits.md frontmatter `arc.extensions` list (line 9, both copies) —
          `pre-stage-review` → `pre-commit-review`. 3.8.b leftover closed; body had no other stale refs.

- _Outcome:_ Rename `pre-stage-review` → `pre-commit-review` propagated across the canonical fire-point surfaces
  (arc-commit SKILL.md + prepare-commits.md frontmatter, both copies plus harness hand-sync). Inline-folds during
  the audit pass: (1) generalized SKILL.md's narrow `taskCommit` routing reference to acknowledge arc-commit's
  multi-context invocation envelope (task approval / workflow ceremony / incidental); class is set by the invoker,
  not the skill. (2) Tier 2 surfaced a pre-existing test gap unrelated to 3.10 but blocking task closure: the
  `runSessionInitStatus` shape test at `run.test.ts:578` still listed 9 settings keys but b2d8162d added 2 more
  (`commit.interlock` + `push.interlock`); test updated to expect 11 (1796 → 1796 passing, no test added). The
  b2d8162d atomic outcome's "Tier 2 clean" claim was inaccurate for this test; worth keeping in mind for future
  verification-claim discipline. Approval-provenance verification at the arc-commit fire-point intentionally NOT
  added — Layer 1 hard dependency of the wrapper-routing migration WU per `plan-interlock-release-refinement.md`
  § In-Flight sequencing. Integration-test recommendation deferred — the skill is markdown not runtime; a contract
  test asserting "SKILL.md contains `pre-commit-review` at the right position" is doc-shape testing better suited
  to an extension-wiring catalog test than CLI integration tests. Atomic follow-up captured for manifest.json drift
  (`.arc/system/.internal/manifest.json` still names the old `pre-stage-review.md` file path — 3.8.b leftover,
  build-artifact-tier, not runtime-blocking).

### `[x]` **3.11 Lifecycle workflow alignment (deactivate restructure + clean update + rotate-branch retirement)**

- _Goal:_ Three additional WU-lifecycle workflows align with WOR conventions per R52a: `deactivate-work-unit.md`
  restructured for single-branch model with new case matrix; `clean-work-unit.md` updated for 4-state enum + meta-\*
  shape + redirected completion handoff; `rotate-branch.md` retired (multi-branch premise eliminated by
  single-branch-per-WU per R1, R2, R4).

    **Strategies:** `strategy-package-project-sync.md`

    - `[x]` **3.11.a Restructure `deactivate-work-unit.md` (single-branch model)**
        - Full body rewrite. New case matrix: Case A (return to Planning — state flip + Branch field edit + 3-step
          branch rename inverse of activation) and Case A-delete (abandon entirely — close PR → switch to base →
          branch delete → pm.mode-aware base-branch leftover cleanup) as twin variants under "Steps"; Cases B/C/D
          retained under "When NOT to Deactivate" with current-state language.
        - Case A-delete Step 4 corrected mid-draft: original framing assumed pre-WOR semantics (artifacts persist
          on base after branch deletion); under WOR's single-branch model, branch deletion handles in-flight state,
          so Step 4's residual cleanup concerns base-branch leftovers (arc-in-git backlog source folder, ROADMAP
          entry; external tracker update; none-mode no-op).
        - Footer convention: `Context: meta-{name}.md (deactivation)` per R29a — replaces invalid pre-existing
          `Context: tasks-{name}.md (deactivation)` (hook regex would have rejected anyway).
        - Frontmatter declares `branch-format` method (mirrors activate-work-unit.md). `manage-incidental-work.md`
          cross-ref retained with current-state interrupt-routing language; pause-pointer / `incidental/` substrate
          references dropped per R49a. ROADMAP regen surfaced via cross-ref to Work Organization Strategy § ROADMAP.
        - Sync: byte-identical to `packages/arc-framework/arc/...`.

    - `[x]` **3.11.b Update `clean-work-unit.md` (4-state alignment + meta-file shape + redirected handoff)**
        - Surgical edits across six locations (Step 1 Mode 2 status update; Step 1 "If deleting" prose; Step 1
          pointer-directionality block deleted; Step 3 Mode 2 Step A standard structure; Step 3 Mode 2 Step B
          forward-pointer grep block deleted; Step 3 Mode 2 completion-summary bullet; Step 6 Cross References;
          closing context-check prose).
        - `status-{name}.md` → `meta-{name}.md`; `**State:** Complete` → `**State:** Integrating` throughout.
        - Standard task list header list collapsed to `**Spec:**` only per R58a chain model (was 6 fields including
          PRD/Created/Completed/Branch/Base Branch/Status).
        - Completion-doc creation handoff redirected from `completion-{name}.md` creation in integrate-work-unit
          Phase 1 Step 3 to the meta file's archive-phase composition (Release Notes Entry + Completion Notes) per
          R14 — workflow body cross-refs integrate-work-unit by name without inline step-numbering.
        - Verified no residual pre-WOR refs: `status-`, `State: Complete`, `Phase 1, Step 3`, `Completion Metadata`,
          `completion-{name}` — all cleared.
        - Sync: byte-identical to packages/.

    - `[x]` **3.11.c Retire `rotate-branch.md`**
        - Both copies `git rm`-ed. Live inbound sweep cleared across: `3_process-task-loop.md` (both copies — entire
          "Branch/task list coupling" bullet retired since multi-branch premise eliminated; link defs removed;
          orphaned `[work-org]` def pruned as collateral cleanup), `strategy-workflow-authoring.md` (both copies —
          dropped from `workflowPush` ceremony-push example list), `strategy-package-project-sync.md` (file
          inventory), `init-recipe.json`, `.arc/system/.internal/manifest.json`.
        - Test references substituted to avoid stale workflow-name examples: `session-type.test.ts` +
          `active.test.ts` swapped `rotate-branch Step 2 — open intermediate PR` for `clean-work-unit Step 3 —
          Mode 1 mid-work cleanup`. Test logic preserved (still asserts non-integration lifecycle workflow →
          `sessionType: execution`).
        - Stale refs retained intentionally in non-shipped surfaces: WU's own artifacts (PRD/notes/tasks/status —
          they describe this retirement task), `adr-007`, `analysis-modes-solo-dev-blind-spot-audit.md`,
          `.arc/backlog/**` (internal planning docs), `.arc/reference/archive/**` (historical).

- _Outcome:_ WU-lifecycle workflow surface fully aligned with WOR's single-branch model — Phase 3's lifecycle
  restructure complete (3.2 init / 3.3 activate / 3.4 integrate / 3.5 archive / 3.11.a deactivate / 3.11.b clean /
  3.11.c rotate-branch retired). `verify-work-unit.md` remains the sole lifecycle workflow lagging WOR shape — its
  `status-` → `meta-` filename-token update folds into Task 6.2.i's propagation, not duplicated here. Phase 3
  closes (3.7 deferred, 3.12 superseded by 6.3.e per the earlier restructure commit, all others `[x]`); next phase
  entry is Task 4.1 (`template-meta.md` creation) — which 3.2/3.3's forward-references depend on for the
  markdown-link form (currently named as plain backticked tokens).

### `[~]` **3.12 ~~Update session-lifecycle workflows for R65 user/ directory reform~~** — Superseded by 6.3.e

- Moved to 6.3.e to land paired with 6.3.d migration: workflow consumers and on-disk surfaces must transition together
  to avoid the interim window where init/handoff point at paths not yet present on disk.

### `[x]` **3.13 Local-ahead notes orientation surface (3.9.c deferred follow-up)**

- _Goal:_ Session-init Step 6 surfaces local-ahead notes state informationally, completing the 3.9.c UX coherence
  pass deferral. Pressure-test identified five orientation-transparency cases; four landed at `0448a35c`
  (`no-upstream`, `detached-head`, `no-remote`, `dirty`); this task lands the fifth (notes-channel `local-ahead`).

    **Strategies:** `strategy-package-project-sync.md`

    - `[x]` **3.13.a Expose `refState` on `UserSessionInitStatusResult`**
        - Added optional `refState?: UserSyncRefState` to `UserSessionInitStatusResult` at `types.ts:545-555`,
          adjacent to `state`. TSDoc records the action-dispatch (`state`) vs. raw-topology (`refState`) split
          and the disabled-arm omission contract.

    - `[x]` **3.13.b Populate `refState` from spine in `buildUserSessionInitStatusResult`**
        - Factored a `refStateSpread` local at the head of `buildUserSessionInitStatusResult`; all five spine
          arms include it via spread. Disabled arm naturally omits (spine.refState is null when remote sync is
          off). Unit coverage: refState assertions added to the disabled and same-refs session-init tests, plus
          a new test for the local-ahead clean arm.

    - `[x]` **3.13.c Branch `inferUser` on `refState === "local-ahead"` within `clean`**
        - Split the `clean` arm: `refState === "local-ahead"` returns `surface`; otherwise `skip`. Disabled
          extracted to its own case for parity. Unit coverage: +6 tests in `recommended-action.test.ts` —
          local-ahead → surface, same → skip, policy-invariant surface (`manual` / `prompt` / `always`),
          dirty-tree-invariant surface.

    - `[x]` **3.13.d Add session-init Step 6 conditional surface (both copies)**
        - Step 6 fifth conditional section landed (`user.value.state == "clean"` AND
          `user.value.refState == "local-ahead"`) in both `.arc/` instance and the package source
          `session-init.template.md` (corrected from the task list's pre-impl reference to `session-init.md`).
          The envelope-table user row exceeded MD060 column-alignment tolerance under any inline refState
          addition, so the architectural rationale lives as a new paragraph following the table — reads more
          naturally as a two-layer-model explanation anyway. Both copies stay diff-aligned outside the existing
          `arc:if` blocks.

- _Outcome:_ Five 3.9.c orientation-transparency cases now complete — four worktree cases at `0448a35c`, plus
  the notes-channel local-ahead case this WU. Architecture executed per the option-b2 plan: `refState` surfaced
  as an optional field on `UserSessionInitStatusResult` parallel to `state`, preserving the spine's two-layer
  model (action-dispatch enum + raw topology). Spine enum-expansion explicitly rejected — would have added a
  state value with no corresponding dispatch action. Net: +7 unit tests; one new optional field; no
  consumer-breaking changes (additive only).

## **Phase 4:** Template evolution + PROJECT-PRD content rewrite

_Purpose:_ Encode the new meta-file shape, PROJECT-PRD template, and rewrite PROJECT-PRD content as a dogfooding pass
that surfaces shape ambiguities feeding back into `template-project-prd.md` v1.1.

_Design decisions:_ PROJECT-PRD update-trigger discipline (R36) lives in `template-project-prd.md` itself — the template
carries the update-discipline rule alongside the shape it codifies, keeping shape + lifecycle co-located.

### `[x]` **4.1 Create `template-meta.md` (replaces `template-status.md`) — H1 + grouped fields + content H2s**

- _Goal:_ `template-meta.md` replaces `template-status.md` with the R58 shape — `# Metadata: {name}` H1;
  blank-line-grouped field blocks under H1 (no `## Work Unit Metadata` H2 wrapper); content H2s
  (`## Release Notes Entry`, `## Completion Notes`) added at Active → Integrating transition; post-Shipped errata
  convention note included.

    **Strategies:** `strategy-package-project-sync.md`

    - `[x]` **4.1.a Rename + sync template file**
        - `git mv` in both copies (`.arc/reference/templates/template-meta.md`,
          `packages/arc-framework/arc/reference/templates/template-meta.md`); git detected both as
          proper R-renames.

    - `[x]` **4.1.b Restructure to `# Metadata:` H1 + blank-line-grouped field blocks (no internal H2)**
        - H1 `# Metadata: {wu-name}` with five blank-line-separated field-block groups directly under
          H1 — no `## Work Unit Metadata` wrapper. Bullet field syntax `- **Field:** value` preserved
          for cross-artifact consistency and greppability.

    - `[x]` **4.1.c Codify life-phase fields (within H1 body)**
        - Field set encoded per R58: `State` (4-state machine: Planning | Active | Integrating |
          Shipped; ceremony-driven transitions documented in the field-semantics comment), `Owner`
          (`{arc.identity}` placeholder substituted by init-work-unit.md), `Branch` (single value),
          `Origin` (`[internal]` default, ordered before Spec to reflect chain direction), `Spec`
          (generalizable across tier × mode — field name doesn't lock to "PRD"), `Depends On` /
          `Cohort` (both default `[none]`).
        - Active-state pointers preserved: `Task List`, `Last Completed`, `Next Task`, `Blockers`,
          `Next Action`.
        - Placeholder convention within `template-meta.md` aligned on `{kebab-token}` form — both
          H1 (`{wu-name}` per R58) and Owner default (`{arc.identity}`) use it. Inline migration
          touched 4 files (template-meta + init-work-unit, both copies) plus 2 PRD-prose references
          and one task-list backfill default. Cross-template `[Title Case]` retirement across the
          rest of the `template-*` family captured as an atomic — also covers documenting the
          convention durably (templates/ README or strategy doc).

    - `[x]` **4.1.d Codify post-integration metadata fields + content H2s**
        - Post-integration block (`PR URL`, `Completed`) and content H2s (`## Release Notes Entry`
          per 7-category Keep a Changelog set with optional Breaking Changes callout; `## Completion
          Notes`) described in the field-semantics HTML comment with explicit "appended at ceremony"
          framing. No live template body for these — chose comment-description over inline-example
          form to keep the visible template unambiguous about what's present during life-phase.

    - `[x]` **4.1.e Post-Shipped errata convention note (R32)**
        - Errata-only rule for post-`Shipped` Release Notes Entry edits folded into the Release
          Notes Entry description in the field-semantics comment (git history is the lock; no
          mechanical enforcement; matches Keep a Changelog norms).

    - `[x]` **4.1.f Update `session-init.md` partial-read anchor (retirement)**
        - Item 7 switched from `## Work Unit Metadata` partial-read to full-read. Read-scope
          subsection dropped entirely — it was load-bearing under partial-read (window scope,
          field expectations, exclusions like the "About this file" blockquote) but vestigial
          under full-read: template-meta.md per R58 is canonical for the field set, the file is
          small, and "skip when absent" is meaningless when you read everything. Task reference
          format subsection retained (triple-anchor convention is downstream-consumed by item 9's
          graduated lookup). Mirrored to `session-init.contributor.md`. Both copies (`.arc/` +
          `packages/.template.md`) synced.
        - State enum value (`In Progress` in disambiguation precedence) and broader "status file"
          → "meta file" terminology stay pre-WOR — those migrate at Phase 5 (code state-value
          update) + Phase 6 (workflow-doc terminology sweep), out of 4.1.f's scope.

    - `[x]` **4.1.g Retire `template-completion-doc.md`**
        - Verification-only task. Content fold from `template-completion-doc.md` into
          `template-meta.md`'s archive-phase elements (PR URL, Completed, Release Notes Entry,
          Completion Notes per R14) verified. Eliminated-without-successor content: Started
          (derivable from git log), Verification (quality-gates passing is implicit), Follow-Up
          Work + Routed Reference Files + Incidental Work Completed (routed via inboxes / ROADMAP
          per R49a — incidental substrate retired). Actual `git rm` deferred to Task 6.6.d (Phase
          6 doc-cleanup batch).

    - `[x]` **4.1.h Retired-from-prior-shape field acknowledgment (in template comments)**
        - Retired-fields enumeration (`Branch(es)` plural, `Base Branch`, `Sibling Work Unit(s)`,
          `Integration`, pause-pointer trio) and deliberately-not-added list (`Worktree`, `Tier`,
          `Created` / state-transition dates, `Title` / `Description`) live in the field-semantics
          HTML comment — no template-body clutter. Forward-reader clarity favored over rule
          restatement.

- _Outcome:_ R58 meta-file shape landed — `template-meta.md` replaces `template-status.md` with H1
  `# Metadata: {wu-name}` + blank-line-grouped field-block layout directly under H1 (no H2
  wrapper), strict 4-state State machine, post-integration block + content H2s described in the
  field-semantics comment (appended at ceremony only, no live body — visible template stays
  unambiguous about life-phase). Placeholder convention within the new template unified on
  `{kebab-token}` form (Owner: `[arc.identity]` → `{arc.identity}`); broader `[Title Case]`
  cross-template retirement captured as atomic, also covers documenting the convention durably.
  session-init Item 7 switched to full-read; vestigial Read-scope subsection retired.
  template-completion-doc.md content-fold per R14 verified (4.1.g flag; actual `git rm` deferred
  to 6.6.d). Commits: `7eca897f` (template + R58 shape + convention align), `8eec8d1d`
  (session-init slim).

### `[x]` **4.2 Evolve `META-PRD.template.md` content shape (PROJECT-PRD shape codification)**

- _Goal:_ `META-PRD.template.md` (package source) evolves in-place to ship the PROJECT-PRD shape — Mission (1-3
  sentences) + numbered principles (5-7, quotable as nouns) + anti-goals + problem statement + design tradeoffs —
  plus the update-trigger discipline (R36) embedded alongside the shape. Per R63 (one-shot template uniqueness), the
  `.template` file is the canonical template surface; no parallel `template-project-prd.md` is created in
  `reference/templates/`. File renames to `PROJECT-PRD.template.md` at Task 4.3.h (rides with the rendered-file rename).

    **Strategies:** `strategy-package-project-sync.md`

    - `[x]` **4.2.a Mission section template**
        - Mission section landed as OPTIONAL (not required §1 headline) — relocated to the optional cluster
          after required sections per research finding. HTML comment frames as "longer-form purpose at a higher
          level than Problem" for multi-year/multi-team/stakeholder-heavy projects; skippable for solo/short-
          lived ones. Placeholder `[MISSION_STATEMENT]` slot retained. Required-headline role transferred to
          Problem (now §1 anchor).

    - `[x]` **4.2.b Named principles template**
        - Principles landed under `## Principles` — NAMED identifiers (not numbered) per research, to avoid
          renumbering friction. Default content is a TBD placeholder reflecting "discover, don't invent" framing
          for scaffold-time projects. Two intensities supported by the same template: compact bullet-list
          (`**Name**: one or two sentences`) as default; H3-with-rationale-paragraph as optional elaboration.
          Soft guidance: minimum 1, target 3-5, cap 7-10 without thematic grouping.

    - `[~]` **4.2.c Anti-goals section template**
        - Superseded by design decision: Anti-goals function folded into Scope's `### Out of Scope` subsection per
          PMI convention (research finding — separate Anti-goals section risks junk-drawer effect). Anti-goals
          psychology preserved in Out of Scope guidance prose ("predictable adjacent asks you're saying 'no' to").
          No standalone section under new shape; In Scope / Out of Scope duality at `## Scope` handles boundary
          articulation.

    - `[x]` **4.2.d Problem statement template**
        - Problem section landed under `## Problem` — PROMOTED to first required section (document anchor) per
          research finding (PMI: "the single most important paragraph"). Single `[PROBLEM_STATEMENT]` slot with
          user/context framing. HTML comment allows "TBD — see discovery plan" content for genuinely-unclear-at-
          scaffold cases; warns against vacuous defaults. Old Mission-vs-Problem contrast guidance dropped since
          Mission is now optional (and may not exist).

    - `[x]` **4.2.e Design tradeoffs template**
        - Design Tradeoffs landed as OPTIONAL section, relocated to optional cluster after required sections.
          Slot shape evolved slightly: `**[TRADEOFF_NAME]**: Chose [WHAT_WAS_CHOSEN] over [ALTERNATIVE]. Cost:
          [WHAT_IT_COSTS].` (added explicit "over" for clearer choice framing). HTML comment frames optional
          status ("delete if no significant architectural commitments yet"). Guidance preserves the tie to
          Principle interpretation.

    - `[x]` **4.2.f Update Discipline callout (R36)**
        - R36 Update Discipline landed as `> [!IMPORTANT]` callout near top (after intro, before content sections)
          — NOT a content section per research finding (ARC-level meta about the doc's behavior, not project
          content; doesn't compete as a "fillable section" alongside Problem/Scope/Principles). Two-trigger
          framing (organic PR-conflict + event-driven release/scope/governance) with explicit no-cadence close.
          Visual treatment matches DEV-RULES.ARC's `task-interlock` callout pattern.

    - `[x]` **4.2.g One-shot-template comment block (R63)**
        - HTML comment block landed at file top (above H1) — states lifecycle (rendered once at `arc init` /
          `arc join` per `classification.ts`), shape-edit vs content-edit boundary, sole-canonical-surface fact
          (no parallel `reference/templates/template-project-prd.md`), AND structural conventions declaring the
          Required/Optional/Callout section taxonomy upfront so users see the shape contract before reading
          sections. Adopter-facing wording throughout (no R-IDs, no internal-roadmap references).

    - `[x]` **4.2.h Post-revision sweep — `02_define-project.md` rewire + cross-doc reference scan**
        - Sweep executed after research-driven shape revision (see `research-project-vision-document-genre.md`)
          diverged substantively from the 4.2.a-g first-pass spec. Cross-doc scan identified 4 shape-dependent
          files in scope and 11 naming-only files riding 4.3.h's filename rename sweep.

        - **`02_define-project.md` Step 1** — framing paragraph reframed ("vision/scope/success criteria" →
          "problem/scope/principles"); "Think through" prompts rewritten to new shape (4 questions covering
          Problem framing, Scope in/out, Principles with TBD-acceptable scaffold framing, optional-section
          check). Both copies (`.arc/` instance + package `.template.md` source).

        - **`02_define-project.md` § Maintaining Project Documents META-PRD trigger language** — minimal swap:
          "direction, scope, success criteria" → "documented problem, scope, principles"; example tweaked
          ("deprioritized goal" → "scope boundary redrawn"). Maps old triggers onto new shape's required
          sections. Both copies.

        - **Cross-doc reference scan** — searched ARC workflows / strategies / briefs / constitution for
          references to old META-PRD section names + shape-dependent PROJECT-PRD references. Findings:
          `1_create-prd.md` Step 4/5 + `integrate-work-unit.md` line 135 had shape-dependent language
          requiring sweep (see below); `activate-work-unit.md` verified shape-agnostic (no edit); 11 other
          files are naming-only references that ride 4.3.h.

        - **`1_create-prd.md` Step 4 + Step 5** — condition 3 ("load-bearing axes") dropped per design call
          (a); "numbered principle" → "named principle"; "anti-goal" → "Out of Scope"; citation example
          italicized name format (`principle 3 (Configurability with strong defaults)` → `the
          *Configurability* principle`); Step 5 "PROJECT-PRD covers mission / principles / anti-goals" →
          "problem / scope / principles"; "numbered-principle citation" → "named-principle citation". Both
          copies.

        - **`integrate-work-unit.md` line 135** — `"PROJECT-PRD principles / anti-goals"` →
          `"PROJECT-PRD Principles / Out of Scope"`. Both copies.

        - **Parent 4.2 reconciliation** — 4.2.a/b/d/e/f/g outcomes amended in place to reflect actual landed
          shape; 4.2.b + 4.2.f titles amended ("Numbered principles" → "Named principles"; "Update-trigger
          discipline embedded in template" → "Update Discipline callout"); 4.2.c marked `[~]` superseded for
          the Anti-goals fold into Scope's Out of Scope per PMI convention; parent `_Outcome:_` rewritten to
          reflect post-revision shape; Success Criteria + References documented as net-new optional sections.

        - **4.3 description updates** — parent _Goal:_ rewritten to reflect new shape (Problem + Scope +
          Principles required, Update Discipline callout, optional sections); subtask titles + descriptions
          amended (4.3.b Mission note as optional; 4.3.c "numbered" → "named" with 3-5 target; 4.3.d "Draft
          anti-goals" → "Draft Scope (In/Out)"; 4.3.e Problem-as-anchor framing; 4.3.f Tradeoffs optional
          note; 4.3.g template-name correction). 4.3.h file-rename subtask unchanged.

- _Outcome:_ `META-PRD.template.md` body restructured to new PROJECT-PRD shape via research-driven mid-execution
  revision (see `research-project-vision-document-genre.md`). Final shape: three required content sections
  (`## Problem` as §1 anchor, `## Scope` with `### In Scope` + `### Out of Scope` subsections, `## Principles`
  with named identifiers and TBD-allowed scaffold content) + Update Discipline as `> [!IMPORTANT]` callout near
  top (NOT a content section) + four optional sections in trailing cluster (`## Mission`, `## Design Tradeoffs`,
  `## Success Criteria`, `## References`) + `---` structural close. Top-of-file HTML comment declares
  Required/Optional/Callout taxonomy upfront. Diverged from 4.2.a-g first-pass spec on five axes: Mission demoted
  to optional; Principles named (not numbered) with 3-5 target; Anti-goals folded into Scope's Out of Scope
  subsection per PMI convention; Problem promoted to §1 anchor; Update Discipline relocated to callout. Success
  Criteria + References added as net-new optional sections (captured under 4.2.h scope). Downstream sweep
  (per 4.2.h) covered `02_define-project.md` (Step 1 prompts + framing + maintenance trigger), `1_create-prd.md`
  (Step 4/5 shape-dependent language including condition 3 drop per design call (a)), and `integrate-work-unit.md`
  (alignment check language). H1 + filename stay META-PRD-named until 4.3.h sweeps both. Single canonical copy:
  `packages/arc-framework/arc/reference/META-PRD.template.md`.

### `[x]` **4.3 Rewrite `PROJECT-PRD.md` content per new shape**

- _Goal:_ `.arc/reference/PROJECT-PRD.md` content rewritten per the new PROJECT-PRD shape — Problem (anchor) +
  Scope (In/Out) + Principles (3-5 named) + Update Discipline callout + any warranted optional sections (Mission,
  Design Tradeoffs, Success Criteria, References) — as the dogfooding pass that surfaces template ambiguities
  (template revisions ride the same phase if needed per the feedback loop in 4.3.g).

    - `[x]` **4.3.a Read existing PROJECT-PRD; inventory content vs new-shape coverage**
        - 14 existing META-PRD elements mapped to new-shape slots. Resolved gaps: § 4 User Flow +
          § 6 Technical Requirements retire without successor (content already in `docs/`,
          DEV-RULES.PROJECT, AGENT-BRIEF.PROJECT, DEV-RULES.ARC); § 5 Success Metrics → Success
          Criteria (optional, retained); Quality system demoted from principle to convention level
          (intentional under 5-principle distillation, no content loss — P4 fully covered in
          principles.md + DEV-RULES.PROJECT). Net-new content identified: Principle 3 (Operational
          friction down, judgment friction up), Scope > In Scope distillation, Problem synthesis
          (~150-200 words), Design Tradeoffs framing (broad commitments, not example-driven per
          user direction). Working principle set (5): Co-development; Spec-directed, not
          spec-driven; Operational friction down, judgment friction up; Configurable methodology,
          open ecosystem; Codified improvement.

    - `[x]` **4.3.b Draft Mission (optional)**
        - Drafted Mission (~55 words, 2 sentences). "ARC aims to facilitate human-AI software
          collaboration that produces work genuinely better than either could alone." — humble
          "aims to facilitate" framing; aspirational altitude appropriate to Mission. Second
          sentence captures developer-judgment mechanism (foregrounding value contribution over
          participation state — judgment shaping implementation, not developer-engaged-as-DX) +
          breadth dimensions (project shapes, team sizes, evolving agentic SWE landscape). Full
          text held in chat pending wholesale rewrite at 4.3.h.

    - `[x]` **4.3.c Draft 3-5 named principles**
        - Drafted 5 principles in compact-bullet form: Co-development; Spec-directed, not
          spec-driven; Operational friction down, judgment friction up; Configurable methodology,
          open ecosystem; Designed to evolve. P5 renamed from "Codified improvement" to absorb
          moving-field orientation (three input sources: internal learning, field testing, external
          developments). P2 enhanced during 4.3.f review — "rigorous shared context" + "even
          thorough planning can't foresee" frames in-flight judgment necessity while honoring
          planning rigor (pairs with Problem ¶1's map/territory framing). 11-principle adopter
          contract distilled to 5 project-level identity principles; remainder (P4/P5/P6/P9, parts
          of P8) drops to convention level. Full text held in chat pending wholesale rewrite at
          4.3.h.

    - `[x]` **4.3.d Draft Scope (In/Out)**
        - Drafted Scope section with 5 In Scope items (methodology for execution pair / configurable
          conventions / WU-lifecycle workflows / operationalizing tooling / cross-tool-and-platform
          compatibility) + 5 Out of Scope items (team coordination / throughput optimization /
          autonomous-async-cloud agents in isolation / application code generation / prescribing
          internal tool choices). Out absorbs anti-goals function per task spec — each item is a
          predictable adjacent ask ARC is saying no to. In/Out #5 pair captures open-ecosystem
          stance affirmatively + negatively. Full text held in chat pending wholesale rewrite at
          4.3.h.

    - `[x]` **4.3.e Draft problem statement**
        - Drafted 3-paragraph Problem section (~268 words after 4.3.f-era enhancement). Two failure
          modes (delegation + undisciplined parallelism) sharing the "attention is a bottleneck to
          engineer around" premise; ARC's opposite premise (single-threaded attention as design
          primitive); operationalization preview that maps to Principles. Includes
          bounded-concurrency caveat ("Bounded, deliberate concurrent work has its place") and ¶1
          map/territory enhancement ("minimize human touchpoints by treating the spec as a faithful
          map of the territory") naming delegation's category error explicitly (pairs with P2
          enhancement). Full text held in chat pending wholesale rewrite at 4.3.h.

    - `[x]` **4.3.f Draft design tradeoffs (optional)**
        - Drafted Design Tradeoffs section (~210 words, 4 tradeoffs): Focused attention over
          multi-tracked throughput; Configurability with strong defaults over a fixed shape;
          Co-development primacy over universal agent compatibility; Stable principles, adaptive
          conventions. Template format (`Chose X over Y. Cost: Z.`). Tradeoff #1 renamed from
          "Sequential focus" with inline bounded-concurrency hedge per review concern about
          implying no-parallelism. Per user direction: broad commitments, not example-driven
          specifics. Spawned Problem ¶1 + Principle 2 enhancements during review (see those
          outcomes — map/territory framing + "rigorous shared context"/"even thorough planning"
          additions). Full text held in chat pending wholesale rewrite at 4.3.h.

    - `[x]` **4.3.g Feed template ambiguities back into `META-PRD.template.md`**
        - Template audit complete. One ambiguity surfaced: Success Criteria template showed flat
          bullets only, but dogfooded PROJECT-PRD uses H3-subheading categorization (matches
          existing META-PRD § 5 convention). Template HTML comment enhanced with "Categorized form"
          note — H3 subheadings allowed when criteria fall into distinct domains; default is flat.
          Generic example (correctness / adoption / sustainability) used rather than ARC-specific
          category names per adopter-facing template hygiene. Update Discipline callout text
          captured for 4.3.h instantiation (no project-specific customization needed). Template H1
          rename inconsistency (META-PRD in H1, PROJECT-PRD in body) noted for 4.3.h — bundles with
          `git mv` per same-logical-change.

    - `[x]` **4.3.h File rename: `META-PRD.md` → `PROJECT-PRD.md` (both copies)**
        - Wholesale rewrite executed: PROJECT-PRD.md content assembled from chat-held drafts +
          References + Update Discipline callout. H1 set to "ARC Framework Project-Level PRD
          (PROJECT-PRD)". Template H1 updated to match. Both `git mv` operations executed (RM
          detected by git). Tier 1 lint clean. Inbound reference sweep deferred to Task 6.7;
          CLI hardcoded reference update deferred to Task 5.4.

- _Outcome:_ META-PRD.md rewritten per new PROJECT-PRD shape and renamed to PROJECT-PRD.md
  (template also renamed; template H1 updated to match). 5 principles distilled (Co-development;
  Spec-directed, not spec-driven; Operational friction down, judgment friction up; Configurable
  methodology, open ecosystem; Designed to evolve). Dogfooding spawned one template fix (Success
  Criteria categorization at 4.3.g) + content iterations during drafting (map/territory framing,
  rigorous shared context, friction-inversion explicit naming). Inbound reference sweep + CLI ref
  update deferred to Tasks 6.7 + 5.4.

### `[x]` **4.4 Codify PROJECT-PRD update triggers**

- _Goal:_ Update-trigger discipline (R36) is durably codified in `template-project-prd.md` (per 4.2.f) and
  cross-referenced from `strategy-work-organization.md` § PROJECT-PRD (or wherever PROJECT-PRD operations end up
  surfaced in strategy docs).

- _Outcome:_ Verify-only per task _Note_. R36 callout codified in `PROJECT-PRD.template.md`
  (lines 22-30) per 4.2.f and instantiated in rendered `PROJECT-PRD.md` (lines 12-20) per
  4.3.h. No existing strategy-doc home for PROJECT-PRD operations; callout self-documents at
  point-of-use, and adding a new strategy section was documentation-about-documentation for
  marginal gain. Existing META-PRD references in strategy docs (6 across 3 files) are
  naming-only — sweep rides Task 6.7 (subtask 6.7.k).

### `[x]` **4.5 Clarify `template-plan.md` preamble (drop "optional" hedge; preserve deletion)**

- _Goal:_ `template-plan.md` preamble drops the "optional" hedge while preserving the deletion-at-PRD-creation behavior
  per amended R22c. Plan-\* described as the pre-PRD synthesis artifact for substantive shaping work — ephemeral by
  design, deleted at PRD creation per `1_create-prd.md` (with optional `notes-*.md` graduation of substantive persisting
  content); never persists into execution. Whether `plan-*` is created at all scales with mode and tier downstream of
  WOR; the deletion behavior is invariant.

    **Strategies:** `strategy-package-project-sync.md`

    - `[x]` **4.5.a Edit package source (authoritative copy)**
        - Replaced the "Using this template is not required" hedge with HTML-comment preamble framing plan-\* as
          the pre-PRD synthesis artifact: ephemeral, deleted at PRD creation, `notes-*.md` graduation pathway named
          for substantive persisting content. Package source edited first per Framework-file sync discipline.

    - `[x]` **4.5.b Adopt chain-model header per R58a**
        - Header now reduces to two bullets under H1 as one field group: `- **Origin:** [internal]` and
          `- **Purpose:** —`. Field descriptions live in the HTML-comment preamble; the prior-shape Retired-fields
          enumeration was scoped out (WOR-internal historical concern; adopters have no "prior shape" context).

    - `[x]` **4.5.c Verify body sections remain useful**
        - Body sections (Problem / Motivation, Alternatives, Unknowns and Assumptions, Scope Estimate) preserved
          verbatim including section guidance text. The optional-starting-structure framing moved into the preamble;
          section descriptions describe what to capture, not whether the file is required.

    - `[x]` **4.5.d Sync into `.arc/` instance copy**
        - Applied identical content to `.arc/reference/templates/template-plan.md` via `Write` (not `cp`). `diff`
          confirms byte-identical between copies; `npm run -s lint:md` reports zero errors across both.

- _Outcome:_ `template-plan.md` adopts the chain-model header (Origin + Purpose, bullet form) with
  ephemeral-pre-PRD framing in adopter-safe form. Adopter-facing scrubs vs. task-spec text: "downstream of WOR"
  qualifier dropped from the preamble (WOR-internal); R-IDs (R22a, R58a) dropped from the HTML comment; chain-model
  parenthetical and Retired-fields acknowledgment block both dropped on iteration as meta-framework commentary that
  template users don't need; `[internal]` lowercase used to match shipped `template-meta.md` over task-spec's
  inadvertent `[Internal]`. Body sections + comment block reflowed to ~110-char target (max 113) rather than the
  prior narrow wrap. Forward-compat lens for `plan-arc-plan-conductor.md` (no work pulled in): preamble's
  "scales with mode and tier" leaves room for depth as a later scaling axis; no depth metadata on the plan-doc
  per conductor's "explicit plan metadata is last-resort"; four-section freeform body aligns with conductor
  § Templates preserving current shape for minimum/standard depth.

### `[x]` **4.6 Reshape `template-tasks.md` (chain-model header + retire incidental framing)**

- _Goal:_ `template-tasks.md` adopts the chain-model header per R58a (header reduces to `**Spec:**` only; `**PRD:**`
  field name renames to `**Spec:**` for vocabulary alignment with meta-\*; `**Purpose:**` retires as drift-surface
  mirror of PRD; `**Branch(es):**` and `**Base Branch:**` retire per R58); incidental-WU framing retires
  (workflow-pattern preamble, branch-name examples, escalation pointers) per R49a; surviving
  `manage-incidental-work.md` references rewrite to current-state language describing the workflow's function — no
  "transitional" / "pending" framing in the template.

    **Strategies:** `strategy-package-project-sync.md`

    - `[x]` **4.6.a Edit package source (authoritative copy)**
        - Preamble reshaped to single-variant generic WU framing (drops `feature/technical (planned) or
          manage-incidental-work.md (reactive)` two-variant intro). Header skeleton reduces to one bullet —
          `- **Spec:** \`prd-{name}.md\`` — under H1, then `---` separator, then phases. Incidental Header Variant
          section (lines 79-133 of prior shape) dropped wholesale. Outer H2 retitled from `## Header Variant: Feature
          / Technical` to `## Work Unit Task List` (parallel to `## Atomic Companion File` via shared WU-scoping —
          settled on iteration over "primary" / "phased" / tier-overloading alternatives). Field-explanation
          paragraph rewritten — Branch(es) / Base Branch / Purpose descriptions retire alongside the fields.
          `[arc-config]` and `[manage-incidental]` reference-link defs retired (both unused after the preamble +
          Incidental variant drops; the latter caught by lint).

    - `[x]` **4.6.b Sync into `.arc/` instance copy**
        - Applied identical content to `.arc/reference/templates/template-tasks.md` via `Write`. `diff` confirms
          byte-identical between copies; `npm run -s lint:md` reports zero errors across both.

- _Outcome:_ `template-tasks.md` collapses from two-variant (Feature/Technical + Incidental) to single-shape per
  R49a's incidental-substrate retirement; header adopts chain-model (`**Spec:**` only) per R58/R58a. Prose
  paragraphs reflowed to ~110-char target (max line 114, well under 120 hard cap). Adopter-facing scope call,
  mirroring the 4.5 iteration: the spec called for a "Retired field acknowledgment in template comments parallel
  to 4.1.h's meta-template treatment", but this file is a docs wrapper (skeleton lives in a fenced code block, no
  HTML-comment surface like `template-meta.md` has) and the retired-shape enumeration would land as visible prose
  meta-framework commentary — same lens applied to `template-plan.md`'s parenthetical + Retired-fields block on
  iteration. Inbound references in `2_generate-tasks.md` (lines 80, 318 — "Feature/Technical variant", "header with
  Purpose") and the Phase 6.7 cross-reference sweep are now stale relative to this edit; routes to 6.7 per the
  Phase 6.7 sweep convention (don't fix-in-place here).

### `[x]` **4.7 Reshape `template-prd.md` (chain-model header + retire pre-activation comment-block)**

- _Goal:_ `template-prd.md` adopts the chain-model header per R58a — adds `**Origin:**` header field (default
  `[Internal]`); preserves `**Purpose:**` as substantive opening below Origin (the document's thesis); retires the
  existing "Optional: pre-activation lifecycle metadata for backlog stubs" HTML-comment block (`**State:**` +
  `**Related Work:**`) since meta-\* covers pre-activation state under R22a.

    **Strategies:** `strategy-package-project-sync.md`

    - `[x]` **4.7.a Edit package source (authoritative copy)**
        - Added `- **Origin:** {[internal] default; external tracker URL when applicable.}` as the first header
          field after H1; converted `**Purpose:**` from loose-paragraph to bullet form below Origin (chain-model
          order). Retired the entire "Optional: pre-activation lifecycle metadata for backlog stubs" HTML-comment
          block — `meta-*.md` covers pre-activation state under R22a. Inline `{...}` guidance retained on both
          fields, matching the surrounding inline-guidance convention; body sections reflowed to ~110-char target.

    - `[x]` **4.7.b Sync into `.arc/` instance copy**
        - Applied identical content to `.arc/reference/templates/template-prd.md` via `Write`. `diff` confirms
          byte-identical between copies; `npm run -s lint:md` reports zero errors across both.

- _Outcome:_ `template-prd.md` adopts the chain-model header (Origin + Purpose, bullet form), mirroring the
  shapes now established in `template-meta.md` / `template-plan.md` / `template-tasks.md`. Two judgment calls
  consistent with prior phase-4 iterations: (1) `[internal]` lowercase used over task-spec's `[Internal]` to
  match shipped templates; (2) retired-fields acknowledgment skipped — same audience-boundary lens as 4.5/4.6,
  no new HTML-comment block introduced just to enumerate prior shape. Two iteration edits caught during review:
  (a) dropped the "pairs cleanly with the task list's `**Purpose:**` field for alignment-verification" clause
  from Purpose's inline guidance — Task 4.6 retired that field, leaving the cross-artifact pairing reference
  dead; (b) added "These criteria are validated explicitly at work-unit completion — write them as concrete
  checks, not aspirations." to Success Criteria, since `1_create-prd.md` carries no equivalent framing and
  adopters had no signal of the section's downstream validation role. No inbound-reference fallout —
  `1_create-prd.md` describes the template generically; `activate-work-unit.md` has no orphan refs to the
  retired pre-activation fields (meta-\* takes those under R22a per Phase 3 work).

### `[x]` **4.8 Evolve `TECHNICAL-OVERVIEW.template.md` content shape (R60 template component)**

- _Goal:_ `TECHNICAL-OVERVIEW.template.md` (package source) evolves in-place per R60 — existing architecture /
  components / critical-path sections retained; new section added carrying update-trigger discipline (organic: PR-time
  clarification when conflict surfaces; event-driven: tech-stack changes, major refactors, dependency upgrades, infra
  shifts; not cadence-driven). Per R63, no parallel `reference/templates/template-technical-overview.md` is created —
  the `.template` file is the canonical template surface.

    **Strategies:** `strategy-package-project-sync.md`

    - `[x]` **4.8.a Audit existing template sections**
        - Four numbered sections retained as-is: § 1 Overview (architecture summary); § 2 Architecture Components
          (per-component subsections with Framework / Language / Key Libraries / Code Style / Directory Structure
          fields); § 3 Infrastructure (Dev Environment / Build System / CI/CD / Deployment); § 4 Testing
          Infrastructure (per-component framework / execution / structure / command). Only gaps the new shape fills
          are lifecycle metadata (4.8.c) and update-trigger discipline (4.8.b); section taxonomy itself is sound.

    - `[x]` **4.8.b Add update-trigger discipline section**
        - Landed as `> [!IMPORTANT]` **Update Discipline** callout after the intro paragraph, before § 1 — mirroring
          4.2.f's PROJECT-PRD placement. Two-trigger framing with explicit no-cadence close. Organic trigger
          elaborated with three concrete failure-mode examples (new pattern doesn't fit a component; recorded tooling
          commands don't match reality; directory structure drifted) — broader than 4.2.f's single example given
          TECHNICAL-OVERVIEW's wider drift surface. Event-driven examples track the task spec verbatim (tech-stack
          changes / major refactors / dependency upgrades / infra shifts), each parenthetically scoped.

    - `[x]` **4.8.c One-shot-template comment block (R63)**
        - HTML comment block landed at file top (above H1) — states lifecycle (rendered once at `arc init` /
          `arc join` per `classification.ts`), shape-edit vs content-edit boundary, sole-canonical-surface fact (no
          parallel `reference/templates/template-technical-overview.md`). Skipped the "Structural conventions" inner
          block that 4.2.g included for PROJECT-PRD — TECHNICAL-OVERVIEW's section structure is sequential
          required-only with no Required/Optional/Callout taxonomy to declare upfront. Adopter-facing wording (no
          R-IDs, no internal-roadmap references).

- _Outcome:_ `TECHNICAL-OVERVIEW.template.md` adopts R60 + R63 shape — top-of-file HTML lifecycle comment and Update
  Discipline `> [!IMPORTANT]` callout layered onto existing four-section structure (Overview / Components /
  Infrastructure / Testing). Mirrors 4.2.f/g shape with one deliberate trim (no structural-conventions sub-block in
  R63 comment, since this template has no Required/Optional split to announce) and one expansion (three organic-trigger
  examples vs. one, given the document's broader drift surface). Single canonical copy — no two-copy mirror; rendered
  output rewrite is Task 4.9.

### `[x]` **4.9 Rewrite `TECHNICAL-OVERVIEW.md` content per new shape (R61 dogfooding pass)**

- _Goal:_ `.arc/reference/TECHNICAL-OVERVIEW.md` content rewritten per the evolved `TECHNICAL-OVERVIEW.template.md`
  shape — existing architecture / components content preserved or refreshed for accuracy; new update-trigger discipline
  section added. Dogfooding pass parallel to Task 4.3 for PROJECT-PRD.

    - `[x]` **4.9.a Read existing TECHNICAL-OVERVIEW; verify accuracy vs. current state**
        - Audit surfaced six drift categories: (1) § 1 "11 non-negotiable principles" line conflated
          ARC-methodology principles with this repo's project principles and didn't belong in a technical-overview
          doc regardless of count; (2) § 2 "Constitution — Core project templates: META-PRD, DEV-RULES,
          PROJECT-STATUS, TECHNICAL-OVERVIEW" wrong on placement (only DEV-RULES live in `constitution/`) and on
          name (META-PRD → PROJECT-PRD per Task 4.3.h); (3) CLI command list "init / update / status / diff"
          stale by 9 commands; (4) "Node 18+ target" stale (actual `>=24`); (5) `shellcheck` quality gate absent;
          (6) three substantial capabilities absent — git-notes user portability, release wrappers, `arc sync`
          orchestrator. Also flagged: enumerations of methods, extensions, and commands collectively account for
          most of the drift surface; described-with-SoT-pointer pattern proposed for the refresh.

    - `[x]` **4.9.b Refresh component sections as needed**
        - Full rewrite via `Write` (~70% delta — surgical edits weren't tractable). Operating principle:
          describe-over-enumerate with SoT pointers (`arc --help`, `system/methods/README.md`,
          `system/extensions/README.md`), per pre-rewrite design discussion. § 1 dropped principles bullet
          entirely (project-architecture doc; principles belong in PROJECT-PRD) and replaced with a
          customization-surfaces characterization. § 2 Deployable Template System reshaped into five
          architecturally-distinct concern groups (Constitutional rules / Project-level rendered docs / Reference
          material / System layer / Work surfaces); CLI Package command surface now described as three categories
          (lifecycle / inspection / orchestration) with `arc --help` cited as SoT; Customization Surfaces section
          uses describe-with-representative-examples + README pointers. Two H3 sections added: Cross-Machine User
          State (git-notes layer + `arc user` + `arc sync`) and Release Wrappers (`arc release commit/push` with
          interlock-validation + audit semantics). § 3 added Node Engine line (≥24), shellcheck, and code-linting
          line. Forward-compat post-WOR shape applied to active-workspace framing (meta files, flat `active/`)
          per pre-rewrite agreement.

    - `[x]` **4.9.c Add update-trigger discipline section**
        - `> [!IMPORTANT]` Update Discipline callout landed after intro, before § 1 — same shape and placement as
          the template. Folded into 4.9.b's single Write since the rewrite touched the same region.

    - `[x]` **4.9.d Feed template ambiguities back to `TECHNICAL-OVERVIEW.template.md` v1.1**
        - No structural template revisions warranted. The two structural departures from the template — using
          "Key characteristics:" bullets in § 1 instead of a single `[ARCHITECTURE_OVERVIEW]` placeholder, and
          using concern-based H3s in § 2 instead of the template's per-component Framework/Language/Key
          Libraries/Code Style/Directory Structure field set — reflect ARC's nature as a methodology + CLI
          project (components are _concerns_, not tech-stack-distinct codebases). The template's own
          "Add detail proportional to complexity" guidance already covers this kind of project-flex; codifying
          the alternative shapes would constrain the template more than it would help.
        - Post-approval visual pass surfaced one convention worth codifying: italic-for-frames /
          bold-for-anchors (prevents bold-soup in list-dense sections) plus flat-list chunking (>~8 items
          → 2-4 italic-labeled groups). Added as a "Visual conventions" sub-block to
          `TECHNICAL-OVERVIEW.template.md`'s top HTML comment — parallel structure to PROJECT-PRD's
          "Structural conventions" sub-block but addressing visual hierarchy rather than required/optional
          taxonomy. The convention is project-agnostic (the bold-soup problem is inherent to list-dense
          docs, not ARC-specific); codifying prevents each adopter from rediscovering it independently
          during their own dogfood pass. Rendered `.arc/reference/TECHNICAL-OVERVIEW.md` exemplifies the
          pattern: italic intros at § 1 Key characteristics and § 2 CLI Package (Command surface,
          Architecture); § 3 Infrastructure chunked (12 bullets → 4 groups: Runtime & environment /
          Language & build / Testing & quality tooling / CI & configuration).

- _Outcome:_ `.arc/reference/TECHNICAL-OVERVIEW.md` rewritten with describe-over-enumerate as the operating
  principle — every enumeration in the prior version that drifted (commands, methods, extensions, constitution
  contents) is now a described category citing a live SoT (`arc --help`, README files). Three substantial
  capabilities surfaced that the prior version omitted entirely: git-notes user portability, release wrappers,
  cross-concern sync orchestration. Two design-call corrections beyond pure drift-fix: dropped the principles
  framing (project-architecture doc, not methodology doc) and reshaped active-workspace forward-compat to
  post-WOR (meta files, flat `active/`). Post-approval visual pass surfaced one template convention worth
  codifying — italic-for-frames / bold-for-anchors plus flat-list chunking — added as a "Visual conventions"
  sub-block to `TECHNICAL-OVERVIEW.template.md`'s top HTML comment, with the rendered doc serving as the
  dogfood instance.

## **Phase 5:** Roster cascade + push extension marker wiring + CLI seeding update + CLI propagation

_Purpose:_ TypeScript code changes — test-covered roster library function, `pre-push-review` extension marker placement
across workflows with push fire-points, CLI init/join preamble strip for instance-file slimming, and CLI propagation
for the foundational conventions WOR shifts (State value-set, filename prefix, validator pre-commit hook, PROJECT-PRD
hardcoded references). Branch-pattern fallback in session-init aligns with R2 in this phase; CB core-6 branch-prefix
recognition isn't a CLI-encoded concern (audit confirmed — no enum exists; the status-reader scans subdirs
name-agnostically).

_Compat-bridge discipline:_ Tasks 5.4.a / 5.4.b / 5.4.c / 5.4.c' / 5.4.g ship code that recognizes BOTH legacy and new
shapes during the Phase 5 → Phase 6.2 transition window — strict enforcement of the new shapes would break this WU's
own session-init (status-reader, sessionType inference, validate-status-spec hook) before Phase 6.2 migrates this WU's
artifacts. Each compat shim names its paired cleanup task in 6.2.j-n; the cleanup runs atomically with 6.2's migration
commits so compat code never outlives its purpose. The `5.4.*` → `6.2.*` cross-references are the audit trail —
reviewing Phase 6.2 closes the loop.

_Known impact areas:_ WOR's foundational shifts ripple into CLI code that encodes the prior conventions. Compat shims
keep each leaf-task commit functional; cascading test failures concentrate at 5.4.f's bulk fixture migration, not at
each leaf-task introduction. Touch zones:

1. **Probe envelope code** (`commands/active/status.ts`, `lib/session-init/`) — `sessionType` inference, branch-pattern
   fallback (`{category}/plan-{name}` → `plan/{name}` per R2). HIGH.
2. **Active-file resolution** (`lib/active/status-reader.ts`) — `status-` → `meta-` filename prefix;
   `## Work Unit Metadata` H2 wrapper retirement under R58. `ActiveScanShape = "subdir" | "flat"` plumbing already
   exists; State enum needs codification. HIGH.
3. **Status-spec validator** (`scripts/validate-status-spec.ts`) — pre-commit hook enforcing State value-set and
   file-path pattern; must accept BOTH shapes during the transition window or the 6.2 migration commit can't pass its
   own pre-commit gate. HIGH.
4. **Hook regex** (`system/githooks/commit-msg`) — covered by 6.1 + 2.13; cross-effect on integration tests. MEDIUM.
5. **Config schema** (additive: `archive.cadence`, `review.planning_checkpoint`) — covered by 3.7.c; LOW-MEDIUM.

Test fixture impact: ~28 test files reference `status-` / `feature/` / `technical/` patterns (confirmed via grep at
audit time, 2026-05-14). Compat shims keep most runs green even with stale fixtures; fixture migration concentrates
at 5.4.f.

### `[x]` **5.1 Implement `worktree-roster.ts` library function with test-first coverage**

- _Goal:_ `packages/arc-framework/src/lib/git/worktree-roster.ts` exports a function returning a list of
  `{worktreePath, branch, identity?, metaFilePath, state, cohort?}` tuples from `git worktree list` + per-worktree
  meta-file resolution — synchronous worktree-list read; async per-worktree meta-file resolution; empty list returned
  when no worktrees or no meta files surface (clean degradation).

    **Strategies:** `strategy-testing-methodology.md`

- _Outcome:_ `worktree-roster.ts` ships with 12 vertical-slice unit tests covering the 9 enumerated behaviors
  plus 3 multi-meta resolution cases added at review (branch-field matching with warning on
  no-match / ambiguous-match). Per-worktree resolution parallelized via `Promise.all`. Audit confirmed
  `worktree-sync.ts` is a sync-state probe only — no reusable `git worktree list` parse to factor out. State
  value-set inlined per Note (5.4.a not yet landed) with comment pointing at both `template-meta.md` (4.1.c)
  and the forthcoming `WorkUnitState` import site. Design intent clarified before implementation: meta-less
  worktrees return degraded tuples (consumer-interpreted — admin/main fallback for the WF branch-gone
  cascade); detached-HEAD worktrees excluded entirely (no branch identity to act on). Single-meta-in-active/
  case uses the lone file unconditionally; multi-meta case requires `**Branch:**` match, with warnings on
  no-match (degraded fallback) and on multi-match (alphabetical-first + warn). R44 clean-degradation refined
  to fire only when no worktree's active/ contains any meta files at all (not when metas exist but failed to
  resolve) — so consumers see invariant-violation warnings rather than silent empty results.

### `[x]` **5.2 Wire `pre-push-review` markers into workflows with push fire-points**

- _Goal:_ Workflows that invoke push (raw `git push`, `arc release push`, `arc sync` push leg) carry
  `· #pre-push-review` extension markers at the appropriate fire-point. Marker placement mirrors how other pre-\*
  extensions sit in their workflows — agent picks them up via `lib/extensions/point-scanner.ts` and surfaces `.actions`
  per the established extension contract. Default-inactive extension (per 3.8.d); wiring is structural even when
  extension is off.

- _Note:_ Audit confirmed this is workflow-doc wiring, not CLI code. Extensions today fire via workflow-body
  `· #<name>` markers consumed by the agent — there is no CLI-level extension-surfacing pattern in the codebase
  (verified via grep: no existing CLI module invokes any `pre-*-review` extension). The push wrapper is a CLI
  execution path that doesn't itself surface extensions; the fire-point is the workflow step that authorizes the push,
  not the wrapper that executes it.

    **Strategies:** `strategy-workflow-authoring.md`

    - `[x]` **5.2.a Inventory workflows with push fire-points**
        - Five fire-point sites identified across four workflows (both copies — `.arc/system/workflows/` +
          `packages/arc-framework/arc/system/workflows/` — share identical line numbers):
            - `planning/init-work-unit.md:96` — `workflowPush` admonition (plan-branch first push, Step 5).
            - `activate-work-unit.md:89` — `workflowPush` push in branch-rename bash block (Step 5).
            - `integrate-work-unit.md:79` — `workflowPush` admonition (PR-open push, Step 3).
            - `integrate-work-unit.md:212` — `workflowPush` admonition (final post-completion push, Step 13).
            - `deactivate-work-unit.md:88` — `workflowPush` push in branch-rename bash block (Case B, Step 3).
        - **Spec expected** `session-handoff.md` as a fire-point; in practice it invokes only `arc sync`, which
          per the workflow-authoring strategy's sync exception handles its own internal push without re-routing
          through the wrapper. No marker placed there pending user confirmation of the sync-exception
          interpretation.
        - **Unexpected site** (not in spec's expected list): `deactivate-work-unit.md` carries a real
          `workflowPush` for the plan-rotation push (Case B). Worth wiring; flagging for user confirmation.
        - **Destructive `--delete` pushes excluded:** `activate-work-unit.md:90`, `deactivate-work-unit.md:89`,
          `deactivate-work-unit.md:117`. These are branch cleanups, not work publication — `pre-push-review`'s
          publication-gate semantic doesn't fit.

    - `[x]` **5.2.b Wire `pre-push-review` markers at each fire-point**
        - Six fire-point sites wired across five workflows, both copies (12 file edits). Bullet form
          used at sites with adjacent prose; prose form (no leading dash) used in
          `integrate-work-unit.md` Step 13 to avoid list-context ambiguity with the preceding cadence
          bullets; nested-indented bullet form used in `session-handoff.md` to sit inside the
          `on-handoff/on-workflow` arm before the sync bash block. All six markers discoverable via
          `point-scanner.ts`'s extension-point pattern.
        - `strategy-workflow-authoring.md` § Sync push exception extended (both copies) to clarify
          that the exception is class-tag-routing scope only — extension markers still fire on
          workflow steps that invoke a push including `arc sync`. Captures the design intent that
          drove session-handoff's marker placement.

    - `[x]` **5.2.c Verify markers are discoverable**
        - Existing point-scanner test suite (14 tests) passed unchanged — the regex matches the new
          markers without new fixtures needed. Grep cross-check confirms 12 marker occurrences (6 sites
          × 2 copies), matching expected count. Session-init active state unchanged (`pre-push-review`
          stays default-inactive); structural wiring lands ready for activation.

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

### `[ ]` **5.4 CLI propagation with compat-bridge (State + active-file + branch-pattern + validator + PROJECT-PRD)**

- _Goal:_ CLI code encodes WOR's foundational convention shifts — State value-set codified as
  `Planning | Active | Integrating | Shipped` per R9 (replacing the prior `Planning | In Progress | Complete | ...`
  set); active-file resolution finds BOTH `status-*.md` and `meta-*.md` during transition; section extraction supports
  BOTH `## Work Unit Metadata` H2 wrapper (legacy) and the new H1-bounded shape (R58); session-init's branch-pattern
  fallback aligns with `plan/<name>` rotation per R2; `lib/classification.ts` hardcoded `META-PRD.template.md`
  filename updates to `PROJECT-PRD.template.md` per R35; `scripts/validate-status-spec.ts` pre-commit hook accepts
  both legacy and new file-path patterns / State value-sets.

- _Approach:_ Test-first per `strategy-testing-methodology.md`. Each compat-bridge subtask (5.4.a / 5.4.b / 5.4.c /
  5.4.c' / 5.4.g) ships the compat shim AND explicitly names its paired cleanup task in 6.2.j-n. The cleanup runs
  after 6.2.a/a'/b migrates this WU's in-flight artifacts; once cleanup lands, the new shape is the only recognized
  shape.

    **Strategies:** `strategy-testing-methodology.md`

    - `[ ]` **5.4.a Codify `WorkUnitState` shared type with transitional validator**
        - Locate existing State enum (if present in `frontmatter/`, `manifest/`, or `types.ts`). If absent (currently
          freeform string), introduce a typed enum
          `type WorkUnitState = "Planning" | "Active" | "Integrating" | "Shipped"`.
        - Export from a shared location so probe code, status-reader, session-init logic, and tests all import from
          one place. Avoid silent string duplication.
        - **Contract:** `parseStatusFile` continues to return `state: string | null` (verbatim, no validation). A
          separate validation surface (`validateState(s): WorkUnitState | "unknown"`, or equivalent) handles enum
          narrowing where needed. The validator accepts BOTH legacy values (`In Progress`, `Complete`, `Paused`,
          `Superseded`) and new values during the transition window — strict enforcement would break this WU's own
          state before 6.2.b migrates it. _Cleanup paired with 6.2.j (retire legacy values from the validator)._

    - `[ ]` **5.4.b Update probe envelope sessionType inference with transitional fast-paths**
        - `commands/active/status.ts` `inferSessionType`: ADD fast-path arms for the new four-value State enum
          (`Active → execution`, `Integrating → integration`, `Shipped → null`) alongside the existing
          `Planning → planning`. Retain the existing structural fall-through (Task-List / Next-Action inference) so
          this WU's current `In Progress` state continues routing to `execution` until 6.2.b migrates it. The
          fall-through also serves as defensive forward-compat for unknown State values; cleanup at 6.2.k verifies
          the fast-paths fire (not the fall-through) for codified values post-migration.
        - Update branch-pattern fallback: from `{category}/plan-{name}` to `plan/{name}` per R2. Branch types in the
          fallback recognize the CB core-6 set.
        - Pre-flight at execution: inventory active branches matching the legacy pattern (`git branch --list
          '*/plan-*'`); surface any concurrent planning branches that would lose orphan-recovery detection. None
          expected in this repo at present, but worth confirming before flipping the regex.
        - Vitest unit tests cover each new mapping case + branch-fallback case + retained fall-through arm.

    - `[ ]` **5.4.c Active-file resolution with dual-prefix scan**
        - `lib/active/status-reader.ts` + consumers: extend the file-glob scan to accept BOTH `status-*.md` and
          `meta-*.md` during transition. When both filenames exist for the same stem (e.g., `status-foo.md` and
          `meta-foo.md`), prefer `meta-*.md` — the new shape is canonical once present. Update `FULL_PREFIX` constant
          accordingly, or introduce a tuple of accepted prefixes.
        - `ActiveScanShape = "subdir" | "flat"` plumbing already supports flat `active/` per WOR — verify "flat"
          becomes the default when project is configured for single-branch-per-WU.
        - Companion-file resolution (`notes-`, `atomic-`) is name-stable across WOR; no prefix change needed.
        - Vitest unit tests cover `meta-*` resolution + `status-*` legacy resolution + missing-meta-file degradation +
          dual-presence preference (meta wins). _Cleanup paired with 6.2.l (drop `status-` from accepted prefixes;
          `meta-` only)._

    - `[ ]` **5.4.c' Reader section-extraction fallback for new H1-bounded shape**
        - `lib/active/status-reader.ts` `extractMetadataSection` (line 237): extend to support the new shape where
          the `## Work Unit Metadata` H2 wrapper is retired (per R58, applied at 6.2.a'). Behavior: try
          `## Work Unit Metadata` first; if absent, treat the H1-bounded preamble (from the file's `# ...` H1 line
          through the first `## ...` content H2, or end-of-file when no content H2 exists) as the field-bearing
          region. The bullet-form `extractField` regex (line 251) is already shape-agnostic — only the section
          boundary needs adjustment.
        - Without this fallback, 6.2.a' breaks `extractMetadataSection` (returns null), all fields parse as null,
          sessionType collapses to null, and this WU's session-init treats itself as orphan.
        - Vitest unit tests cover both shapes (H2-wrapped legacy + H1-bounded new) with full field set. _Cleanup
          paired with 6.2.m (drop the legacy H2 path; new shape is the only recognized shape)._

    - `[ ]` **5.4.d CLI touch-point refresh (SCAFFOLDED_FILES paths + doc-comment examples)**
        - **Scope reset (per audit):** The originally-framed "retire `feature/` / `technical/` / `incidental/` prefix
          recognition" task has no matching code site — branch-prefix recognition isn't encoded as an enum anywhere
          in the CLI. The status-reader scans subdirs name-agnostically; session-init's branch-pattern fallback uses
          a generic `^[^/]+\/plan-.+$` regex (updated in 5.4.b). Remaining actual touch points consolidate here.
        - **Touch points:**
            - `lib/classification.ts` SCAFFOLDED_FILES (lines 63-64): update
              `backlog/feature/BACKLOG-FEATURE.template.md` and `backlog/technical/BACKLOG-TECHNICAL.template.md`
              entries to match the BACKLOG-INBOX consolidation in Phase 6.3.b. Confirm template-render generation
              is consistent.
            - `commands/active/types.ts` (line 49): doc-comment example shows `.arc/active/technical/status-foo.md`.
              Refresh to new shape.
            - `lib/release/types.ts`: audit at execution; refresh any category-related strings or enums (none
              expected based on initial grep but verify).
        - Vitest unit tests cover updated SCAFFOLDED_FILES classification.

    - `[ ]` **5.4.e `classification.ts` hardcoded filename update (META-PRD → PROJECT-PRD)**
        - `packages/arc-framework/src/lib/classification.ts` references `META-PRD.template.md` (line 59) in the
          file-classification logic (and possibly in inline doc comments). Update to `PROJECT-PRD.template.md` per
          R35.
        - Sync any related test fixtures.

    - `[ ]` **5.4.f Bulk test-fixture migration (one commit per logical fixture group)**
        - Fixtures hand-authoring `status-foo.md` migrate to `meta-foo.md`; State values update per the codified
          value-set. Expect changes across ~28 test files (audit estimate). Compat shims (5.4.a/b/c/c'/g) keep most
          test runs green even while fixtures lag — failure cascade is bounded, not multiplicative.
        - Pattern-batch fixture edits: a vitest run failing on `status-` filename references gets the fixture
          renamed; a failure on `**State:** In Progress` gets the State value updated. Don't enumerate per file in
          advance — fix the failing test, commit, move on.
        - Verify entire test suite passes (`npm test`) before declaring 5.4 complete.

    - `[ ]` **5.4.g Update `validate-status-spec.ts` pre-commit hook with dual-recognition**
        - `scripts/validate-status-spec.ts` is a pre-commit hook enforcing both file-path classification
          (`STATUS_PATH` regex, line 28) and State value-set (`VALID_STATES`, lines 33-39). Both shapes flip in Phase
          6.2 — without transitional support, the migration commit itself can't pass its own pre-commit gate.
        - **Path pattern:** extend `STATUS_PATH` to recognize BOTH `status-*.md` and `meta-*.md` under
          `.arc/active/{category}/`. Module + symbol naming can stay or rename to `meta-spec` — pick one shape at
          this task and let the cleanup at 6.2.n complete the rename if needed.
        - **State value-set:** extend `VALID_STATES` to accept the union of legacy
          (`Planning, In Progress, Complete, Paused, Superseded`) and new (`Planning, Active, Integrating, Shipped`)
          values during transition. Diagnostic messages should reference the union or both sets while compat is in
          effect.
        - **Integration field:** `VALID_INTEGRATION_STATES` accepts `Merged` paired with `State: Complete`. Under
          the new value-set the `**Integration:**` field retires (folds into State per 6.2.b). Retain the legacy arm
          during transition; cleanup at 6.2.n retires `VALID_INTEGRATION_STATES` and the paired validation entirely.
        - Vitest unit + integration tests cover dual-recognition; fixture updates couple with 5.4.f. _Cleanup paired
          with 6.2.n (retire legacy halves of all three: STATUS_PATH, VALID_STATES, VALID_INTEGRATION_STATES)._

### `[ ]` **5.5 CLI seeding update for R65 user/ workspace layout**

- _Goal:_ CLI init/join + activation code in `packages/arc-framework/src/lib/` creates the R65 user/ directory layout:
  per-WU subdir at WU activation (`user/{identity}/<wu-name>/`) seeded with `SESSION-NOTES.md` inside; cross-WU
  `WORKING-MEMORY.md` at user root seeded at init/join. Composes with Task 5.3's preamble-strip change (the new files
  seed as content-only per R59).

    **Strategies:** `strategy-testing-methodology.md`, `strategy-package-project-sync.md`

    - `[ ]` **5.5.a Locate user/ seeding sites**
        - Grep `packages/arc-framework/src/lib/` for SESSION-NOTES + USER-INBOX seeding paths; identify init-time vs
          activation-time seeding boundaries (init/join code vs activate-work-unit code paths).

    - `[ ]` **5.5.b Activation-time per-WU subdir creation**
        - At WU activation (init-work-unit / activate-work-unit, post-Task 3.2 / 3.3), create
          `user/{identity}/<wu-name>/` subdir and seed `SESSION-NOTES.md` inside (content-only per R59).
          Contributor-role meta file (when applicable) also lands in this subdir per R65a.

    - `[ ]` **5.5.c Init-time WORKING-MEMORY seed**
        - At project init/join, seed empty `user/{identity}/WORKING-MEMORY.md` at user root. Content-only per R59;
          no preamble. Empty structurally; entries accumulate organically as the developer captures them at handoff.

    - `[ ]` **5.5.d Tests**
        - Update CLI tests asserting on seed output shape. Add new tests verifying per-WU subdir creation at
          activation and WORKING-MEMORY.md at init.

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

    - `[ ]` **6.2.j Cleanup: retire legacy State values from validation surface (paired with 5.4.a)**
        - `validateState` (codified in 5.4.a) accepts BOTH legacy values (`In Progress`, `Complete`, `Paused`,
          `Superseded`) and new values during the transition window. Once 6.2.b completes the in-flight meta-file State
          recodification, the legacy values are no longer present in any in-flight artifact — the legacy half is dead.
        - Drop legacy values from the validator's accepted set; assert the new four-value enum
          (`Planning, Active, Integrating, Shipped`) is exhaustive. Diagnostic messages prune accordingly.
        - Tests: drop legacy-state test cases; add a negative test asserting `In Progress` (and other retired values)
          now resolve to `"unknown"`.
        - _Sequencing:_ Runs after 6.2.b (this WU's meta file carries the new State value).

    - `[ ]` **6.2.k Cleanup: verify sessionType fast-paths fire; narrow fall-through doc (paired with 5.4.b)**
        - `commands/active/status.ts` `inferSessionType` (modified in 5.4.b) gained fast-path arms for the new
          four-value State enum alongside the existing `Planning → planning`. The structural fall-through (Task-List /
          Next-Action inference) was retained so this WU's `In Progress` continued routing to `execution` during
          transition.
        - Cleanup work: verify the fast-path arms fire for codified State values post-6.2.b; the fall-through should
          now exercise only on unknown State values (defensive forward-compat + tolerant parsing). Add a clarifying
          doc-comment to the function explaining the fall-through's narrowed role post-WOR. Tests: assert each
          codified value routes through its fast-path arm; assert unknown values resolve via the fall-through (not
          via accidental match elsewhere).
        - _Sequencing:_ Runs after 6.2.b.

    - `[ ]` **6.2.l Cleanup: drop `status-*.md` prefix from active-file scan (paired with 5.4.c)**
        - `lib/active/status-reader.ts` (modified in 5.4.c) accepts BOTH `status-*.md` and `meta-*.md` during
          transition. Once 6.2.a renames this WU's status file to `meta-*.md` and 6.5 cleans up any leaked
          `status-*.md` files on `main`'s `active/`, the legacy prefix is no longer reachable from any in-flight or
          tracked surface.
        - Restore `FULL_PREFIX` (or equivalent constant) to `meta-` only; drop the dual-prefix scan logic and any
          dual-presence preference handling. Tests: remove legacy-prefix test cases.
        - _Sequencing:_ Runs after 6.2.a AND 6.5 (defensive — both surfaces clear before the compat code retires).

    - `[ ]` **6.2.m Cleanup: drop `## Work Unit Metadata` H2 fallback in section extraction (paired with 5.4.c')**
        - `lib/active/status-reader.ts` `extractMetadataSection` (modified in 5.4.c') accepts BOTH the legacy
          H2-wrapped shape and the new H1-bounded shape. Once 6.2.a' restructures this WU's meta file to the new
          shape, the H2 fallback is dead code.
        - Drop the H2-wrapper detection path; require H1-bounded preamble. Tests: remove legacy-shape test cases.
        - _Sequencing:_ Runs after 6.2.a' (this WU's meta file uses the new shape).

    - `[ ]` **6.2.n Cleanup: retire dual-recognition in `validate-status-spec.ts` (paired with 5.4.g)**
        - `scripts/validate-status-spec.ts` (modified in 5.4.g) accepts BOTH file-path patterns and BOTH State
          value-sets during transition. Once 6.2.a + 6.2.b complete the in-flight migration, the legacy halves are
          unreachable from valid in-flight artifacts.
        - **Path pattern:** drop `status-*.md` from the path classifier; rename the regex constant and surrounding
          identifiers to `META_PATH` / `meta-spec` shape (module + exported symbol rename completes here if not
          done at 5.4.g). Sync hook wiring if the entry-point path changes.
        - **State value-set:** trim `VALID_STATES` to the new four-value enum
          (`Planning, Active, Integrating, Shipped`).
        - **Integration field:** retire `VALID_INTEGRATION_STATES` and the `**Integration:** Merged` validation
          entirely — folded into `State: Shipped` / `State: Integrating` per 6.2.b.
        - Tests: drop legacy-state and legacy-path fixtures; assert legacy patterns now produce the expected
          diagnostic.
        - _Sequencing:_ Runs after 6.2.a + 6.2.b.

### `[ ]` **6.3 Migrate capture pipeline files + user/ workspace to R65 layout**

- _Goal:_ Capture pipeline files restructure to the four-surface model — `user/{id}/ATOMIC-INBOX.md` renames to
  `USER-INBOX.md` (content under `## Atomic`; `## Backlog` initially empty); `BACKLOG-FEATURE.md` +
  `BACKLOG-TECHNICAL.md` merge to `backlog/BACKLOG-INBOX.md` with entries reclassified during merge; new empty
  `backlog/ATOMIC-INBOX.md` created. Plus: in-flight WU personal workspace relocates to R65's per-WU subdir layout —
  SESSION-NOTES moves into `<wu-name>/` subdir, `## Persistent Context` extracts to new `WORKING-MEMORY.md` at root.
  Plus: session-lifecycle workflow consumers (`session-handoff.md` + `session-init.md`) align with the new layout —
  paired with the in-flight workspace migration (6.3.d ↔ 6.3.e) so consumers and on-disk surfaces transition together.
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

    - `[ ]` **6.3.d Migrate in-flight WU personal workspace to R65 layout**
        - Relocate `.arc/user/{identity}/SESSION-NOTES.md` into the per-WU subdir:
          `git mv .arc/user/{identity}/SESSION-NOTES.md .arc/user/{identity}/work-organization-reform/SESSION-NOTES.md`
          (create the subdir first). Composes with Tasks 2.17 / 5.5 / 6.3.e — they ship the codified target shape;
          this step lands the migration in this repo. 6.3.e is the immediate-successor pair (workflow consumer
          alignment) — land both in the same session.
        - Extract the `## Persistent Context` section from SESSION-NOTES into new
          `.arc/user/{identity}/WORKING-MEMORY.md` at user root. Each entry retains its `_Remove when:_` trigger;
          SESSION-NOTES's `## Persistent Context` H2 is removed. The new file seeds content-only per R59
          (no preamble).
        - Contributor-role active status file (`.arc/user/{identity}/active/status-*.md`): none in this repo today,
          so the migration step is a no-op here. Convention for future contributor-role migrations:
          `user/{identity}/active/status-<wu-name>.md` → `user/{identity}/<wu-name>/meta-<wu-name>.md` (composes
          with status-\* → meta-\* token rename); retire `user/{identity}/active/` subdir.
        - Verify resulting layout under `.arc/user/{identity}/`: `USER-INBOX.md` (post-6.3.a rename),
          `WORKING-MEMORY.md` (newly extracted), and `work-organization-reform/SESSION-NOTES.md`. Confirm
          `.gitignore` patterns still cover the relocated content (worktree-local + cross-WU files all stay
          gitignored).
        - _Note:_ R65 applies to all in-flight WUs; in this repo only WOR is in flight at migration time, so the
          relocation operates on a single WU subdir. The contract generalizes to multi-WU concurrent worktrees
          under Worktree Foundation.

    - `[ ]` **6.3.e Align session-lifecycle workflows with R65 layout (paired with 6.3.d)**
        - _Origin:_ Relocated from former Task 3.12 to land paired with 6.3.d. Phase-3 placement created an interim
          window where init/handoff pointed at paths not yet present on disk; co-located here, workflow consumers
          and surfaces transition together.
        - _Sequencing:_ Lands immediately after 6.3.d in the same session — no session boundary may intervene
          between the two, because init/handoff fire at session boundaries and would observe a mismatched layout.
        - _Premise:_ Pre-R65, `session-handoff.md` and `session-init.md` operate on a single
          `user/{identity}/SESSION-NOTES.md` with embedded `## Persistent Context` section. Post-R65,
          persistent-context content extracts to a separate cross-WU file at `user/{identity}/WORKING-MEMORY.md`;
          session-volatile content moves to a per-WU subdir at `user/{identity}/<wu-name>/SESSION-NOTES.md`.
        - **`session-handoff.md` write paths:** § What to Update + § Comprehensive Handoff Format updates —
          SESSION-NOTES path references shift to `<wu-name>/SESSION-NOTES.md`; new write step for `WORKING-MEMORY.md`
          as a separate file operation (cross-WU); `## Persistent Context` review logic relocates from "review
          SESSION-NOTES § Persistent Context" to "review `WORKING-MEMORY.md` entries." Template skeleton in workflow
          body strips the `## Persistent Context` H2 from the SESSION-NOTES shape; new template snippet shows
          WORKING-MEMORY.md shape (H3-headed entries with `_Remove when:_` markers). Identity-absent and
          contributor-role variants preserve their existing semantics under the new layout.
        - **`session-init.md` read paths:** Step 3's document load list updates — SESSION-NOTES path shifts to
          `<wu-name>/SESSION-NOTES.md` (item 8); new read step for `WORKING-MEMORY.md`. Persistent-context
          interpretation note (currently embedded in the SESSION-NOTES read step) relocates to the WORKING-MEMORY.md
          read step. SESSION-NOTES load error recovery guidance updates path references.
        - **Sync to packages/:** Apply edits identically across `.arc/system/workflows/arc/session-lifecycle/` and
          `packages/arc-framework/arc/system/workflows/arc/session-lifecycle/`; final `diff` byte-identical.

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
          automatically: `Owner: {arc.identity}`, `Origin: [Internal]` (unless external tracker reference present in
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
        - **Action:** retire references entirely (distinct from 6.7.i's current-state-rewrite action). Pause-pointer
          fields (`Interrupts:` / `Paused At:` / `Paused To:`) overlap with 6.7.i conceptually but the field-level
          references retire here per R49a's substrate-retirement framing — the workflow-level references rewrite to
          current-state language under 6.7.i.

    - `[ ]` **6.7.i Incidental WU model substrate refs (`incidental/`, `manage-incidental-work`) — current-state rewrite**
        - **Action differs from other 6.7 patterns:** surviving references rewrite to current-state language (describe
          what `manage-incidental-work.md` currently does — interrupt routing per DEV-RULES.ARC § Leave it cleaner),
          not retire (per PRD R49a + R52). Substrate-dependent references drop (`incidental/` branch prefix,
          pause-pointer fields); workflow-level references stay with "transitional" / "pending" framing removed.
        - Grep patterns: `incidental/`, `manage-incidental-work`, `[manage-incidental]:`, `Incidental Work Model`,
          `Interrupts:`, `Paused At:`, `Paused To:`.
        - Touch points already addressed by upstream tasks: DEV-RULES.ARC § Leave it cleaner (1.3.d),
          `strategy-work-organization.md` § Incidental Work Model + § Work Categories (2.8), `template-tasks.md` (4.6),
          `deactivate-work-unit.md` (3.11.a — keeps refs in current-state phrasing; verify alignment, no duplicate
          sweep work). 6.7.i sweeps the remaining surface: workflows (`session-handoff.md`,
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
        - **Exception:** 6.7.i patterns retain references in current-state language; verify those references describe
          the workflow's function (interrupt routing) without "transitional" / "pending" framing or internal-roadmap
          citations (WF/AWL). Post-sweep grep on the incidental patterns returns matches but each match should be a
          current-state reference to the surviving workflow, not an active reference to the retired substrate.

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

    - `[ ]` **6.7.n Audience-vocabulary sweep: "adopter" → neutral framing**
        - Replace "adopter" references in adopter-facing surfaces with neutral framing — "projects", "teams", or
          actor-omitted phrasing as context fits. Rationale: "adopter" is framework-author perspective on the reader;
          from the reader's viewpoint they're just running a project, not "adopting" something. Surfaced mid-Task-2.10
          execution; small fold-in handled there for `strategy-file-classification.md` + two leftover phrases in
          `strategy-work-organization.md`. 6.7.n sweeps the remaining surface.
        - Grep pattern: `\badopter\b` (case-insensitive).
        - Surface (adopter-facing only): `strategy-team-coordination.md`,
          `system/workflows/arc/supplemental/setup-release-wrapper.md`, `system/extensions/README.md`,
          `reference/templates/template-workflow.md`, `reference/QUICK-REFERENCE.md`. Touch points already addressed by
          upstream tasks: `strategy-file-classification.md` (Task 2.10.f), `strategy-work-organization.md` (Task 2.10
          mid-execution fold-in: lines 39 + 48 vocabulary cleanup).
        - **Exclusion:** internal-dev-facing surfaces keep "adopter" — `reference/strategies/project/**`,
          `DEV-RULES.PROJECT.md`, ADRs, internal WU notes / plans / PRDs all describe adopters from the framework-author
          lens; that's their audience. Two-copy sync still required for adopter-facing surfaces.
        - Post-sweep verification: grep on adopter-facing surface list returns empty (with the package-source mirror
          checked alongside `.arc/`).

    - `[ ]` **6.7.o `archive.cadence` enum cleanup (`strategy-work-organization.md` § Archival)**
        - `strategy-work-organization.md` § Archival § Sweep-as-you-go default currently enumerates three
          `archive.cadence` values (`with-integration` / `deferred` / `manual`) per Task 2.3's landed content. WOR
          resolved the enum to two values (`with-integration` / `manual`) per `notes-work-organization-reform.md`
          § `archive.cadence: deferred` considered and rejected. Trim the strategy doc's enumeration to match: remove
          the `deferred` bullet; verify no other `deferred` cadence references survive in the strategy body.
        - Sweep target: `.arc/reference/strategies/arc/strategy-work-organization.md` + package-source mirror.
          Companion verification: CLI validator (`validate-config.sh`) already enumerates 2 values — confirm no
          drift; `arc-config.yml` carries no enum (default only) — no change needed.
        - Post-sweep verification: grep on `\bdeferred\b` within `archive.cadence` context returns empty across
          adopter-facing surfaces; retirement rationale survives in internal-dev-facing notes (this WU's notes
          file).

    - `[ ]` **6.7.p Status-file → Meta-file nomenclature sweep (`chore(status):` + prose)**
        - Migrate the `chore(status):` commit subject-scope token to `chore(meta):` and "Status-file ..." prose
          references to "Meta-file ..." across all surfaces. Companion to Task 6.2.a (file rename) and 6.2.i (hook
          regex + commit-footer body filename-token flip) — 6.7.p covers the subject-scope token + prose-nomenclature
          strata that those tasks don't touch. Hook regex change unnecessary: the type-enum regex captures any
          alphanum scope; `meta` clears the 6.1.b denylist (initial denylist member is `arc` only).
        - Grep patterns: `chore\(status\)`, `Status-file timing`, `Status-file commit shape`, `Status edits`,
          `status edit`, `\bstatus-file\b` (case-insensitive on the prose patterns).
        - Touch points:
            - Constitutional: `DEV-RULES.ARC.md` § Commit Discipline (Status-file timing bullet, Status-file commit
              shape bullet, `chore(status):` reference, "Status edits" prose).
            - Methods: `commit-footer.md` (line ~70 `chore(status):` example reference under Meta-file references).
            - Workflows: `1_create-prd.md`, `3_process-task-loop.md`, `prepare-commits.md` (multiple refs),
              `session-handoff.md` (multiple refs).
            - Skill: `arc-commit/SKILL.md`.
            - Strategies: `strategy-session-operations.md`, `strategy-workflow-authoring.md`.
            - Already migrated ahead-of-schedule at boundary workflows (verify no re-sweep needed):
              `integrate-work-unit.md` (Task 3.4), `init-work-unit.md` (Task 3.4 fix-up),
              `activate-work-unit.md` (Task 3.4 fix-up — meta-file prose; subject-scope sample `docs(arc):` is a
              separate concern tied to Task 6.1.b's `arc` scope refusal).
        - **Exclusions:**
            - Historical archive (`completed/<dated>/` post-6.9 / `reference/archive/` pre-6.9): accurate-as-of-decision;
              do not touch.
            - Internal-dev surfaces describing historical decisions (e.g., `adr-016`,
              `research-pr-sizing-and-wu-boundary-estimation.md`) follow the 2.13.e ADR-precedent — historical record
              stays accurate as-of-decision; explicit per-doc judgment at execution.
        - **Sequencing:** Runs after Task 6.2.a (file rename) + 6.2.i (hook regex flip) so the new shape is
          coherent end-to-end before this prose sweep lands.
        - Post-sweep verification: grep on the patterns returns empty across adopter-facing surfaces; internal-dev
          historical surfaces retain original phrasing where the as-of-decision case applies.

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
          that smaller WU pattern holds in practice; team-coordination research validation; concrete user feedback).
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
- `[ ]` `template-plan.md` framing clarified — "optional" hedge in preamble removed (deletion behavior preserved);
  framing describes `plan-*` as pre-PRD synthesis artifact deleted at PRD creation with optional `notes-*.md`
  graduation of substantive persisting content
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
