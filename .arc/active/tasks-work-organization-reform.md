# Task List: Work Organization Reform

- **Spec:** `prd-work-organization-reform.md`

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
          re-emerges is deferred to `plan-customization-arch-realign.md`. The `pre-activation` extension (3.3.b)
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
  config-as-method-toggle smell; resolution moved to `plan-customization-arch-realign.md`.

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
  `plan-customization-arch-realign.md` for the broader reform that determines whether a planning-checkpoint
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

_Compat-bridge discipline:_ Tasks 5.4.a / 5.4.b / 5.4.c / 5.4.d / 5.4.h ship code that recognizes BOTH legacy and new
shapes during the Phase 5 → Phase 6.2 transition window — strict enforcement of the new shapes would break this WU's
own session-init (status-reader, sessionType inference, validate-status-spec hook) before Phase 6.2 migrates this WU's
artifacts. Each compat shim names its paired cleanup task in 6.2.j-n; the cleanup runs atomically with 6.2's migration
commits so compat code never outlives its purpose. The `5.4.*` → `6.2.*` cross-references are the audit trail —
reviewing Phase 6.2 closes the loop.

_Known impact areas:_ WOR's foundational shifts ripple into CLI code that encodes the prior conventions. Compat shims
keep each leaf-task commit functional; cascading test failures concentrate at 5.4.g's bulk fixture migration, not at
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
at 5.4.g.

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

### `[x]` **5.3 Update CLI init/join code to strip instance-file preamble injection**

- _Goal:_ CLI init/join code in `packages/arc-framework/src/lib/` no longer injects preamble blocks when seeding
  SESSION-NOTES, USER-INBOX, BACKLOG-INBOX, or `backlog/ATOMIC-INBOX.md` — files seed as content-only per R59. Existing
  instance files in this repo migrated separately in 6.8.

    **Strategies:** `strategy-testing-methodology.md`, `strategy-package-project-sync.md`

    - `[x]` **5.3.a Locate preamble injection sites**
        - Audit: seeding is template-file copy, not in-code injection — zero preamble strings in `src/lib/`.
          Two sites (`src/lib/setup.ts:65-90`, `src/commands/user/add.ts:15-37`) copy
          `templates/user/SESSION-NOTES.md` and (arc-in-git) `templates/user/ATOMIC-INBOX.md` verbatim.
          Scope confirmed: 5.3.b targets SESSION-NOTES only (user/ATOMIC-INBOX retires during 6.3.x
          USER-INBOX consolidation). Inbox-seeding gap (USER-INBOX + project-shared inboxes) filed as
          Task 5.6. R59a precondition verified — orientation already lives in strategies.

    - `[x]` **5.3.b Strip preamble from seed templates**
        - Stripped the 14-line orientation blockquote from
          `packages/arc-framework/templates/user/SESSION-NOTES.md` — file opens H1 → H2
          (`## Handoff Metadata`) with no preamble. No `src/lib/` edits needed (seeding is verbatim
          template copy). user/ATOMIC-INBOX.md template untouched (retires in 6.3.x USER-INBOX
          consolidation per the 5.3.a audit).

    - `[x]` **5.3.c Verify CLI tests still pass**
        - Existing tests are shape-agnostic — `integration/init.test.ts` "matches CLI-internal
          template content" asserts equality (still holds); unit mocks (`unit/init.test.ts:388`,
          `unit/join.test.ts:89`) already use minimal `# Session Notes\n` stubs. Added regression
          test in `integration/init.test.ts` asserting the seeded SESSION-NOTES lacks the four
          preamble label strings.

- _Outcome:_ Audit reframed scope — no in-code preamble injection exists; work landed in
  `packages/arc-framework/templates/user/SESSION-NOTES.md` (14-line blockquote stripped). USER-INBOX,
  BACKLOG-INBOX, and `backlog/ATOMIC-INBOX.md` had no existing CLI seeding paths to strip from —
  gap filed as Task 5.6. user/ATOMIC-INBOX.md retains preamble pending 6.3.x USER-INBOX
  consolidation. Regression test prevents preamble reintroduction at the seeded-file level.

### `[x]` **5.4 CLI propagation with compat-bridge (State + active-file + branch-pattern + validator + PROJECT-PRD)**

- _Goal:_ CLI code encodes WOR's foundational convention shifts — State value-set codified as
  `Planning | Active | Integrating | Shipped` per R9 (replacing the prior `Planning | In Progress | Complete | ...`
  set); active-file resolution finds BOTH `status-*.md` and `meta-*.md` during transition; section extraction supports
  BOTH `## Work Unit Metadata` H2 wrapper (legacy) and the new H1-bounded shape (R58); session-init's branch-pattern
  fallback aligns with `plan/<name>` rotation per R2; `lib/classification.ts` hardcoded `META-PRD.template.md`
  filename updates to `PROJECT-PRD.template.md` per R35; `scripts/validate-status-spec.ts` pre-commit hook accepts
  both legacy and new file-path patterns / State value-sets.

- _Approach:_ Test-first per `strategy-testing-methodology.md`. Each compat-bridge subtask (5.4.a / 5.4.b / 5.4.c /
  5.4.d / 5.4.h) ships the compat shim AND explicitly names its paired cleanup task in 6.2.j-n. The cleanup runs
  after 6.2.a/a'/b migrates this WU's in-flight artifacts; once cleanup lands, the new shape is the only recognized
  shape.

    **Strategies:** `strategy-testing-methodology.md`

    - `[x]` **5.4.a Promote `WorktreeRosterState` to shared canonical `WorkUnitState`**
        - `WorkUnitState` codified union and `validateState(s: string | null): WorkUnitState | "unknown"`
          narrowing helper added to `commands/active/types.ts` alongside `SessionType`. `WorktreeRosterState`
          in `lib/git/worktree-roster.ts` redefined as a type alias of `WorkUnitState | "unknown"`; the
          local `normalizeState` retired and the `parseMetaFields` call site rewired to `validateState`.
          Re-export from `lib/git/index.ts` retained — the alias surfaces unchanged to existing consumers.
        - Legacy → new mapping (transitional, semantic): `In Progress` → `Active`, `Complete` → `Integrating`
          (per PRD R52a), `Paused` → `Active`, `Superseded` → `Shipped`. Anything else (including `null`,
          empty, whitespace-only, case mismatches, parenthetical suffixes like `Paused (date)`) returns
          `"unknown"`. Mapping retires at 6.2.j when this WU's own meta file recodifies.
        - **Contract preserved:** `parseStatusFile` still returns `state: string | null` verbatim; the
          enum-narrowing decision lives at the call site. The runtime cycle introduced by the new import
          (`worktree-roster.ts` → `commands/active/types.js`) is benign — `commands/active/types.ts`'s only
          back-edge to `lib/git/index.js` is `import type { GitExec }` (erased at compile), and
          `validateState` is only invoked lazily inside `parseMetaFields`.
        - 5 vertical-slice unit tests on `validateState` (codified verbatim / legacy mapping / null /
          empty-and-whitespace / unrecognized). Batched per the test-first method's tight-coupling
          clause — single function, single shape, no per-behavior discovery value. Existing
          worktree-roster `"Bogus"` test still passes against the new validator.
        - _Cleanup paired with 6.2.j (retire legacy values from the validator)._

    - `[x]` **5.4.b Update probe envelope sessionType inference with transitional fast-paths**
        - `commands/active/status.ts` `inferSessionType` gained `Integrating → integration` and
          `Shipped → null` fast-path arms above the existing `Planning → planning` check. `Active`, legacy
          values (`In Progress`, `Paused`, `Complete`, `Superseded`), and unknown States continue through
          the existing Task-List / Next-Action structural inference — preserving correct routing for this
          WU's current `In Progress` state until 6.2.b migrates it and serving as defensive forward-compat
          for any future unrecognized State.
        - `PLANNING_BRANCH_PATTERN` flipped from `/^[^/]+\/plan-.+$/` to `/^plan\/.+$/` per R2. CB core-6
          execution branches (`feature/foo`, `technical/foo`) now correctly fall through to `null` at the
          branch-pattern fallback — specificity replaces the prior enumerated-category approach.
        - **Pre-flight:** `git branch -a --list '*/plan-*' '*plan/*'` returned empty on this repo — no
          legacy planning branches to surface, no orphan-recovery regression risk.
        - 7 new vitest unit tests added to `session-type.test.ts` (`Integrating` / `Shipped` fast-paths
          with `[none]` Task-List or integrate-Next-Action signals; Active-falls-through across
          integrate-Next-Action, Start-Task, and null-Task-List; new branch pattern matches `plan/<name>`
          and rejects legacy `<category>/plan-<name>` + CB core-6 prefixes; `plan/` bare and `plan-foo`
          without slash both reject). Three integration fixtures + one e2e fixture updated from
          `technical/plan-foo` to `plan/foo` to reflect the codified branch convention. Function JSDoc
          rewritten to reflect the new precedence; cleanup at 6.2.k verifies fast-paths against codified
          values post-6.2.b migration.

    - `[x]` **5.4.c Active-file resolution with dual-prefix scan + flat-layout auto-detection**
        - `lib/active/status-reader.ts`: `FULL_PREFIX` retired in favor of an `ACCEPTED_PREFIXES =
          ["meta-", "status-"]` tuple; `isStatusFilename` / `extractStem` helpers added; both
          `findFlatLayoutStatusFiles` and `findSubdirLayoutStatusFiles` now accept either prefix.
          Per-directory dedup (`preferMetaPerDirectory`) keeps the `meta-` variant when both prefixes
          share a stem in the same directory; cross-directory same-stem files (distinct WUs) pass
          through untouched.
        - **Scan-shape auto-detection:** `scanShape` is now optional. When unset, `detectScanShape`
          probes the active root for accepted-prefix files at the top level — any match resolves to
          `flat`; otherwise `subdir`. Flat wins under transient both-present states (parallel to the
          existing `lite` detection). Explicit `scanShape` (e.g., contributor flow's `flat`) bypasses
          detection. Maintainer flow at `commands/active/status.ts` already passes `scanShape:
          undefined` for non-contributor — picks up auto-detection without a call-site change.
        - `lib/release/wu-resolution.ts` `parseNameFromFilename` regex flipped from `^status-(.+)\.md$`
          to `^(?:meta|status)-(.+)\.md$`. Companion-file resolution (`notes-`, `atomic-`) is unchanged
          per spec.
        - 10 new vitest tests: dual-prefix acceptance across flat + subdir layouts, per-directory
          `meta-` preference (both flat and subdir variants), cross-directory same-stem no-dedup,
          flat / subdir auto-detection, transient both-present → flat wins, and explicit `subdir`
          override against flat-root decoy. Plus a wu-resolution test asserting `meta-bar.md` parses
          to `name: "bar"`. All 24 prior reader tests + 9 prior wu-resolution tests still green.
        - _Cleanup paired with 6.2.l (drop `status-` from accepted prefixes AND retire the subdir
          scanner entirely; flat + `meta-` only)._

    - `[x]` **5.4.d Reader section-extraction fallback for new H1-bounded shape**
        - `extractMetadataSection` in `lib/active/status-reader.ts` now tries the legacy
          `## Work Unit Metadata` H2 wrapper first; on miss, falls back to the H1-bounded preamble — from
          immediately after the file's first `# ...` H1 through the first content `## ...` H2 (or
          end-of-file when no content H2 exists). Returns `null` only when neither anchor matches. The
          shape-agnostic `extractField` regex underneath is unchanged; prose between the H1 and the
          field bullets is harmless (no field labels match).
        - `parseStatusFile` JSDoc rewritten to name both anchors. Subroutine doc names the legacy /
          fallback split and points at the paired cleanup so the lifecycle is grep-able in code.
        - 5 new vitest tests cover the post-WOR shape (H1 + bullets resolves), the boundary stop at the
          first content `##` heading, the no-anchor-at-all case (all-null), the H1-only-no-fields case
          (all-null), and transition coexistence (legacy H2 wins when both shapes are present in one
          file). One prior test ("returns null when `## Work Unit Metadata` is absent") was inverted by
          the new contract — its fixture was relaxed to remove the H1 so it now tests the
          no-anchor-at-all path; the post-WOR shape case is covered by the new tests instead.
        - _Cleanup paired with 6.2.m (drop the legacy H2 path; H1-bounded becomes the only shape)._

    - `[x]` **5.4.e CLI touch-point audit + doc-comment sweep (verify-only)**
        - **Verify-only confirmations passed:**
            - `lib/classification.ts` SCAFFOLDED_FILES — `backlog/feature/BACKLOG-FEATURE.template.md` and
              `backlog/technical/BACKLOG-TECHNICAL.template.md` entries remain valid for the transition;
              the actual restructure pairs with 6.3.b when the BACKLOG-INBOX template ships.
            - `lib/release/types.ts` — category-related logic is doc-only; the `category?: string` field is
              populated from path parsing, not a hardcoded enum. No behavior depends on the legacy
              `<category>/plan-<name>` prefix shape.
        - **Doc-comment sweep landed in `commands/active/types.ts` and `lib/release/types.ts`:**
            - `ActiveLayout.full` doc rewritten to acknowledge both prefixes and both layouts (post-WOR
              flat-rooted canonical + legacy category subdirs).
            - `StatusFileCandidate.path` and `.filename` example strings updated from
              `status-foo.md` → `meta-foo.md` (canonical post-WOR shape).
            - `StatusFileCandidate.state` example values updated from legacy (`In Progress`,
              `Waiting For Review`) to codified post-WOR (`Active`, `Integrating`); `Paused (2026-04-12)`
              retained as the parenthetical-suffix passthrough illustration.
            - `AuditWorkUnit.category` and `.name` doc examples updated from `status-foo.md` /
              `status-{name}.md` to the `meta-` shape, with the name field's comment acknowledging
              dual-prefix resolution during compat (matches wu-resolution regex).
        - **Scope refinements (vs. originally-framed spec):**
            - `lib/active/status-reader.ts` was listed in the spec's doc-sweep target list, but its
              example strings were already updated as part of 5.4.c's dual-prefix work (the lines
              cited in the spec — 26-27, 48, 55-56, 204 — pre-date my 5.4.c edits). No leftover
              examples to sweep; remaining `status-` narrative references in the module pair with
              the symbol/file rename deferred to 6.2.o.
            - `scripts/validate-status-spec.ts` doc-comment update deferred to 5.4.h. Today the
              validator's `STATUS_PATH` regex matches `status-` only; updating the doc-comment to use
              `meta-` as the primary example would be inaccurate ahead of 5.4.h's code change. The
              doc-update logically rides with that prefix change rather than landing here.
        - No new tests — pure verification + comment edits. Full Tier 1 suite (typecheck / lint:ts /
          tests) green; semantics unchanged.

    - `[~]` **5.4.f `classification.ts` hardcoded filename update (META-PRD → PROJECT-PRD)**
        - Already complete — rename landed in commit `04945526` (`feat(arc): Rewrite PROJECT-PRD per new shape;
          rename from META-PRD`). `classification.ts:59` already references `PROJECT-PRD.template.md`; zero
          `META-PRD` references remain in `packages/arc-framework/src/` or `__tests__/` (audit-confirmed).

    - `[x]` **5.4.g Bulk test-fixture migration (one commit per logical fixture group)**
        - _Outcome:_ ~16 test files migrated across six logical-group commits — formatter pair
          (`active-format` + `status-format`); parser + scan (`active/status-reader` +
          `status/run`); release-resolution (`release/wu-resolution` + `sync-orchestrator`);
          active/status integration (`integration/active` + `integration/status`);
          release-handlers (`handlers/release/{commit,push}` +
          `integration/release-push-upstream-init`); session-init e2e
          (`e2e/session-init.e2e`). Fixtures hand-authoring `status-{stem}.md` flipped to
          `meta-{stem}.md`; State default flipped from `In Progress` to `Active`; mid-suite
          accent values shifted from `Paused` to `Integrating` where the test wanted state
          diversity. Parenthetical-suffix passthrough (`Paused (2026-04-12) — waiting for
          restructure`) preserved verbatim per the docstring example in
          `StatusFileCandidate.state`. Explicit legacy-prefix coverage intentionally retained
          where the test purpose is compat verification: `status-reader.test.ts` legacy-flat-
          scan test (line ~286); `wu-resolution.test.ts` newly-added legacy-prefix compat test
          (parses name from a `status-*.md` filename) + `it.each` state-value matrix exhausting
          both legacy and codified values; `session-type.test.ts` and `commands/active/types.test.ts`
          left whole-cloth (compat matrix / mapping verification). `commit-msg-footer.test.ts`
          left whole-cloth — its `status-` → `meta-` flip is explicitly scheduled at Task 6.2.i
          per the inline comment; `validate-status-spec.test.ts` left whole-cloth — couples with
          5.4.h's dual-recognition refit. Full suite green: 1893 tests across 122 files (was
          1891 — `wu-resolution.test.ts` grew its state-value matrix by two cases).

    - `[x]` **5.4.h Update `validate-status-spec.ts` pre-commit hook with dual-recognition**
        - _Outcome:_ `STATUS_PATH` regex extended to
          `\.arc\/active\/(?:[^/]+\/)?(?:status|meta)-[^/]+\.md$` — optional category segment +
          `status|meta` prefix alternation covers all four combinations (subdir-legacy +
          flat-legacy + subdir-meta + flat-meta). `VALID_STATES` grew to the eight-value union
          (post-WOR canonical: Planning / Active / Integrating / Shipped; legacy retained
          during transition: In Progress / Complete / Paused / Superseded). `EXPECTED_STATE`
          diagnostic rewritten to label both halves so CI failures point at the right shape.
          Integration-field arm untouched: `Integration: Merged` stays valid only when paired
          with legacy `State: Complete`; under the post-WOR `Shipped` terminal state the
          merge-status pairing folds into State (per 6.2.b), so `State: Shipped` +
          `Integration: Merged` raises the "Integration only valid for Complete" diagnostic.
          Module + symbol naming preserved verbatim — rename to `meta-spec` deferred to 6.2.n
          (or whenever the cleanup task lands) per the `status-reader → meta-reader` precedent
          codified in `f98d7b24`. Test suite grew from 23 to 30 tests: classifyPath matrix
          covers four prefix×layout combinations + an expanded other-paths set (template-meta,
          backlog-meta, atomic-foo, flat tasks-foo); State value-set tests split into post-WOR
          canonical + legacy-during-transition sister tests; Shipped+Integration failure case
          and end-to-end pass tests for flat-meta and subdir-status pin the dual-recognition
          shape. Existing fixture path constant + statusFile default state flipped to
          post-WOR canonical (`meta-foo.md`, `State: Active`); legacy-prefix coverage now
          lives in the subdir-status end-to-end test, the State value-set sister-block, and
          the legacy-only failure diagnostics. _Cleanup paired with 6.2.n._

### `[x]` **5.5 Instance-file scaffolding shape (templates + pointer content)**

- _Goal:_ Replace the bloated-preamble pattern across instance-file templates with R59's minimal anchoring-pointer
  shape. Touches: existing `packages/arc-framework/templates/user/SESSION-NOTES.md` (updated to new pointer shape);
  four new templates added — `templates/user/WORKING-MEMORY.md`, `templates/user/USER-INBOX.md`,
  `packages/arc-framework/arc/backlog/ATOMIC-INBOX.template.md`,
  `packages/arc-framework/arc/backlog/BACKLOG-INBOX.template.md`. R59a orientation-content precondition assumed
  met by Phase 2 strategy-doc landings; pointers reference those sections directly.

    **Strategies:** `strategy-package-project-sync.md`, `strategy-session-operations.md`,
    `strategy-planning-module.md`

    - `[x]` **5.5.a Draft per-file pointer content**
        - _Outcome:_ Five pointers drafted per R59 sizing; text materialized into templates by 5.5.c-e.
          Cross-cutting design decision: USER-INBOX exists in all PM modes (R65b) but its current
          orientation home (`strategy-planning-module.md` § Inbox Family) installs only under arc-in-git
          — orientation moves to `strategy-session-operations.md` as a sibling to § SESSION-NOTES /
          § Working Memory. New 5.5.b subtask added for the move; prior 5.5.b/c/d renumbered to c/d/e.
          Shared-inbox write framing softened from "write only at" to "by convention, writes batch at" —
          convention, not prohibition, accommodates base-branch / partial-protection writes.

    - `[x]` **5.5.b Restructure USER-INBOX strategy placement (cross-mode content)**
        - _Outcome:_ USER-INBOX subsection cut from `strategy-planning-module.md` § Inbox Family
          (arc-in-git-only); new `## USER-INBOX` section added to `strategy-session-operations.md` as
          sibling to § SESSION-NOTES / § Working Memory, covering purpose, location, two-section
          structure, PM-mode-conditional drain destinations, and cross-WU scope. § Inbox Family intro
          restructured as bulleted family overview; § Write-discipline summary updated to reflect new
          locations. Both strategy copies in lockstep. Cross-reference sweep clean — no external refs
          to the old USER-INBOX-in-planning-module location.

    - `[x]` **5.5.c Update existing `templates/user/SESSION-NOTES.md` to new pointer shape**
        - _Outcome:_ 1-line R59 pointer inserted between H1 and § Handoff Metadata in
          `packages/arc-framework/templates/user/SESSION-NOTES.md`. File opens: H1 → blockquote pointer
          → existing H2 cascade.

    - `[x]` **5.5.d Add new per-user templates**
        - _Outcome:_ Created `packages/arc-framework/templates/user/WORKING-MEMORY.md` and
          `templates/user/USER-INBOX.md` with R59 pointer blockquotes. WORKING-MEMORY ships content-only
          after the pointer (entries accumulate organically; entry-shape hint as HTML comment).
          USER-INBOX carries empty `## Atomic` / `## Backlog` H2 sections with entry-shape comment hints.

    - `[x]` **5.5.e Add new project-shared backlog templates**
        - _Outcome:_ Created `packages/arc-framework/arc/backlog/ATOMIC-INBOX.template.md` and
          `arc/backlog/BACKLOG-INBOX.template.md` with R59 pointers + entry-shape comment hints.
          Recipe-driven seeding wires in 5.6.d.

### `[x]` **5.6 CLI seeding wiring + per-WU subdir lifecycle helpers + reader migration**

- _Goal:_ Wire the CLI to seed R59's new instance files at the right lifecycle points and implement the per-WU
  subdir lifecycle helpers per R65c. Init-time seeding routes WORKING-MEMORY + USER-INBOX into the per-user
  setup path; backlog inboxes route through the init-recipe. Activation-time seeding moves to a new
  `arc user open <wu-name>` helper (paired with `arc user close <wu-name>` for retirement) following R65c's
  lifecycle contract. Reader-side updates rename the SESSION-NOTES read path from flat root to per-WU subdir
  across the codebase (4+ sites) atomically with the writer changes — avoids a broken-session window.

    **Strategies:** `strategy-testing-methodology.md`, `strategy-package-project-sync.md`

    - `[x]` **5.6.a Implement `arc user open <wu-name>` helper**
        - `commands/user/open.ts` exports `runUserOpen` (ensures `user/{identity}/<wu-name>/`,
          seeds `SESSION-NOTES.md` from `templates/user/SESSION-NOTES.md` when absent; idempotent
          on re-invocation — existing seed preserved) plus three helpers for the handler's
          defensive-prompt loop: `findStaleUserWuSubdirs` (derives non-target subdirs from the
          recursive `io.readDir` output), `listUserWuSubdirContents`, and
          `removeStaleUserWuSubdir`. New options type `UserOpenOptions` co-located in
          `commands/user/types.ts`; re-exports added to `commands/user.ts`.
        - `handleUserOpen` in `handlers/user.ts` runs the defensive prompt per stale subdir
          (`y` removes via `removeStaleUserWuSubdir` then proceeds; `inspect` lists contents via
          `p.note` and re-prompts; cancel aborts with `Open cancelled.`). Wired into `arc user`
          namespace at `cli.ts` as `open <wu-name>`. Identity missing short-circuits before the
          stale-subdir scan, via `resolveUserIdentity`'s `UserFacingError` path.
        - Test split per `strategy-testing-methodology.md`: pure logic test-first at integration
          tier (6 cases — SESSION-NOTES seeding at the computed path, idempotent re-invocation,
          stale-subdir enumeration sorted / empty, contents-listing, recursive removal); handler
          orchestration test-after at unit tier (5 cases — no-stale happy path, defensive prompt
          fires, `inspect` re-prompts with contents, `y` removes-then-opens, identity-missing
          short-circuits before any stale scan or `runUserOpen` call).

    - `[x]` **5.6.b Implement `arc user close <wu-name>` helper**
        - `commands/user/close.ts` exports `runUserClose` — single-purpose recursive `rm` of
          `user/{identity}/<wu-name>/` with `force: true` for clean idempotency on absent
          subdir. Filesystem-only; no git operations involved (the user-dir tree is
          gitignored). New options type `UserCloseOptions` in `commands/user/types.ts`;
          re-exports added to `commands/user.ts`.
        - `handleUserClose` in `handlers/user.ts` resolves identity, short-circuits with a
          clear error when missing, otherwise runs `runUserClose` via the standard spinner
          wrapper. Wired into `arc user` namespace at `cli.ts` as `close <wu-name>`.
        - Test split: pure logic test-first at integration tier (2 cases — path computation
          matches `arc user open` and removal lands, idempotent absent-subdir); handler
          orchestration test-after at unit tier (2 cases — happy path passes resolved
          identity + wuName to `runUserClose`, identity-missing short-circuits).
        - Decided against folding `removeStaleUserWuSubdir` (from 5.6.a) into `runUserClose`
          despite identical filesystem semantics — naming intent differs (stale-prompt
          internal helper vs. user-invoked lifecycle command) and the duplication is two
          lines below the abstraction threshold per project YAGNI conventions. Revisit if a
          third call site emerges.

    - `[x]` **5.6.c Wire init-time seeding for new per-user files**
        - `lib/setup.ts` (`runPostInitSetup`) and `commands/user/add.ts` (`runUserAdd`) now iterate
          the canonical per-user file set (SESSION-NOTES.md, WORKING-MEMORY.md, USER-INBOX.md) and
          seed each from the internal template directory. Both seed unconditionally — per R65b the
          personal-workspace surface is cross-PM-mode; `pm.mode` no longer gates user-directory
          seeding. The legacy `user/ATOMIC-INBOX.md` seed path retired (content migration to
          USER-INBOX `## Atomic` per R50 lands separately at 6.3.x).
        - `pmMode` field dropped from `PostInitSetupOptions`, `UserAddOptions`, and the
          out-of-scope-but-collateral `JoinOptions` (the param had no other consumer in
          `runJoin`). Three CLI call sites updated (`commands/init.ts`, `commands/join.ts`,
          `handlers/user.ts`); `handleJoin` no longer reads `settings["pm.mode"]` since the only
          downstream consumer is gone. `PM_MODE_ARC_IN_GIT` import retired from both setup
          functions.
        - Test sweep: unit fs-mocks in `__tests__/unit/init.test.ts` and `__tests__/unit/join.test.ts`
          register stubs for `WORKING-MEMORY.md` + `USER-INBOX.md`; the previously-asserted
          arc-in-git ATOMIC-INBOX seed path was retired in three test files (`integration/init.test.ts`,
          `integration/user.test.ts`, `e2e/init.e2e.test.ts`, `e2e/user.e2e.test.ts`) and replaced
          with positive assertions for the canonical three-file set plus a negative assertion
          on the retired path. One save-load round-trip test pre-cleaned the user dir so the
          init-seeded files don't inflate its expected `fileCount`.
        - Drift gotcha for posterity: writing the JSDoc literal `.arc/user/*/` in
          `commands/user/add.ts` terminated the JSDoc comment early (`*/` inside a `/** ... */`
          block); rewrote the prose to avoid the sequence.

    - `[x]` **5.6.d Wire init-recipe for project-shared backlog templates**
        - `packages/arc-framework/init-recipe.json` `conditions["pm.mode == arc-in-git"].include_files`
          now lists `backlog/ATOMIC-INBOX.template.md` and `backlog/BACKLOG-INBOX.template.md`
          (added in 5.5.e), sitting alongside the existing `BACKLOG-FEATURE` / `BACKLOG-TECHNICAL`
          / `ROADMAP` / `PROJECT-STATUS` / `strategy-planning-module` entries.
        - E2E coverage extended in `__tests__/e2e/init.e2e.test.ts` (the arc-in-git mode test):
          new `pathExists` assertions verify both backlog inboxes render at
          `.arc/backlog/ATOMIC-INBOX.md` and `.arc/backlog/BACKLOG-INBOX.md`. Reconfigure unit
          tests build their own recipe stubs locally and aren't affected; updating them belongs
          with the broader R50 BACKLOG-INBOX migration sweep.

    - `[x]` **5.6.e Workflow wiring for `arc user open` / `arc user close`**
        - Six edits across three workflows × two copies (.arc/ + packages/arc-framework/arc/) wire
          `arc user open {name}` at `init-work-unit.md` Step 2 (post planning-branch create) and
          `activate-work-unit.md` Step 5 (post branch rename), and `arc user close {name}` at
          `integrate-work-unit.md` Step 13 (post-merge `gh pr merge`). Plain bash codeblocks with brief
          explanatory prose — no class-tag (not commit fire-points), no push-extension marker (not push
          fire-points). Activate's call is idempotent on init's prior invocation, covering paths that
          skipped init. Byte-parity verified between copies post-edit; Tier 1 markdown lint clean across
          the six files.

    - `[x]` **5.6.f Reader-path migration (SESSION-NOTES + contributor-meta path)**
        - SESSION-NOTES read landed as a compat-shim resolver — new module
          `lib/handoff/session-notes-path.ts` exports `resolveSessionNotesPath` which prefers the per-WU
          subdir layout (`user/{identity}/<wu-name>/SESSION-NOTES.md`) per R65a's exactly-one-subdir
          invariant, falling back to the legacy flat path (`user/{identity}/SESSION-NOTES.md`) for
          in-flight WUs whose user-dir pre-dates R65a migration. Path derivation uses `io.readDir` to
          find the lone WU subdir directly — no active-probe coordination needed. Single runtime
          consumer: `handlers/status.ts` `restateCandidates` probe (legacy inline read replaced).
          Subdir-first / flat-fallback handles the 5.6.f → 6.3.d window cleanly; smoke-tested against
          this session's flat layout (handoff probe returns valid restate-candidates with 2 commits
          since handoff hash, no `baseline-unknown` fallback signal).
        - Contributor-meta runtime path kept on legacy `[".arc", "user", identity, "active"]` per the
          task's "path convention only" guidance — creation step + scan-shape reshape defers to
          `plan-contributor-path.md`. Compat comment added at `commands/active/status.ts`
          `resolveReaderOptions` calling out the post-R65a target convention and the deferral.
        - Docstring updates: `lib/handoff/restate-candidates.ts` module doc references new path
          convention + compat helper; `commands/active/types.ts` contributor-flow JSDoc notes the WOR
          compat window + post-R65a target; `lib/release/wu-resolution.ts` contributor scope JSDoc
          mirrors the same pattern. Multi-candidate disambiguation precedence references (types.ts
          lines 99, 126) are algorithm-only and unaffected by path migration.
        - Compat retirement paired with 6.3.d (in-flight WU content migration) — new sub-bullet there
          drops the subdir-first arm of the resolver, leaving only the (now-canonical) subdir read.
        - Tier 1 clean: `npm run typecheck` 0 errors, `npm run lint:ts` 0 errors, `npm run test:unit`
          1563/1563 passing — no regressions from the inline-read replacement.

    - `[x]` **5.6.g Tests**
        - Unit coverage for the 5.6.f resolver lands in new
          `__tests__/unit/handoff/session-notes-path.test.ts` — 7 vertical slices: subdir present
          (returns subdir path), flat-only (returns flat), both present (prefers subdir), multi-subdir
          ambiguous (falls through to flat), neither present (returns null), `readDir` throws (returns
          null gracefully), deeper-nested paths ignored (single-segment subdir convention only). The
          handler-level integration of the resolver was smoke-tested at 5.6.f against this session's
          flat-layout SESSION-NOTES; given the handler is a one-line wrapper over the helper, the
          helper's unit coverage carries the integration story.
        - E2E coverage for the `arc user open`/`close` CLI lifecycle lands in
          `__tests__/e2e/user.e2e.test.ts` as a new `user open / close lifecycle` describe block —
          4 cases: open seeds the subdir with templated SESSION-NOTES; second open is idempotent and
          preserves in-flight edits; close removes the subdir recursively; close is idempotent on an
          absent subdir. The defensive-prompt path (stale subdir from prior WU) involves interactive
          TTY simulation and is left to the integration tests landed at 5.6.a/b (six cases at
          `__tests__/integration/user.test.ts` "user open" / "user close" describe blocks).
        - Integration coverage for the `arc init` file-set layout (WORKING-MEMORY + USER-INBOX at user
          root regardless of mode; backlog inboxes under arc-in-git only) was landed at 5.6.c/d —
          verified via grep against `integration/init.test.ts` ("installs the per-user file set under
          arc-in-git") and `e2e/init.e2e.test.ts` (backlog inboxes render under arc-in-git). No new
          coverage needed here.
        - Multi-candidate disambiguation precedence — algorithm-only at the agent layer (session-init
          item 7 precedence over `candidates`); the CLI returns candidates without applying precedence,
          so no CLI test surface for path migration. Existing `commands/active/types.test.ts` unit
          coverage carries the candidate-shape contract unaffected.
        - Tier 1 clean: `npm run typecheck` 0 errors, `npm run lint:ts` 0 errors, `npm run test:unit`
          1570/1570 passing (7 new), `vitest.e2e.config.ts user.e2e.test.ts` 11/11 passing (4 new).

## **Phase 6:** Migration and cross-reference sweep

_Purpose:_ Apply WOR conventions forward — hook regex, in-flight meta-file migration, capture pipeline file restructure,
backlog reorganization, leaked-status cleanup, doc retirements, and cross-reference sweep.

_Design decisions:_ Migration ordering: 6.1 (commit-msg hook regex) → 6.2-6.5 (mechanical file migrations) → 6.6 (doc
retirements) → 6.7 (cross-reference sweep) → 6.8 (instance-file slim). Migration commit shape is atomic-per-op per ARC
commit discipline — each rename / backfill / retirement gets its own commit unless tightly coupled. Cross-reference
sweep runs after retirements so all retired surfaces have already been removed when grepping. **Note:** the
commit-format method + footer-convention propagation that originally lived at 6.2 hoisted to Task 2.13 to align phase
order with execution order (must precede Phase 3 lifecycle workflow restructures).

### `[x]` **6.1 Tune commit conventions (hook + method + handoff-commit shape)**

- _Goal:_ Three coupled changes ship together — `system/githooks/commit-msg` enforces tuned 8-type set
  (`feat | fix | chore | docs | refactor | test | perf | revert`); `commit-format.md` method codifies the
  three-layer scope convention (locus in subject scope, lifecycle action in footer parenthetical, specific work
  in subject body; `(arc)` reserved for cross-cutting framework + ARC lifecycle ceremony invocations);
  `session-handoff.md` step 3 codifies the handoff-commit subject + body shape (action verb prefix + position
  string in subject; field-delta lines in body). Bash `arc_config_get` pattern preserved (no migration to
  commitlint). Changes ride both copies (.arc/ + packages/).

    **Strategies:** `strategy-package-project-sync.md`

    - `[x]` **6.1.a Type-enum regex tightening + method type-list sync**
        - Hook regex tightened to `^(feat|fix|chore|docs|refactor|test|perf|revert)\([a-z][a-z0-9-]*\): .+`.
          Dropped `style`, `content`, `build`, `ci`, `config` from regex and from the hook's `Types:`
          help-text line.
        - `commit-format.md` § Types: 13-type backticked enumeration replaced with the tuned 8-type set,
          ordered to match the regex.

    - `[x]` **6.1.b Sync hook + method to packages/**
        - Edited package source first (`packages/arc-framework/arc/system/githooks/commit-msg` +
          `packages/arc-framework/arc/system/methods/commit-format.md`), mirrored to `.arc/` — aligns
          with Package-Project Sync's authoritative direction. Both pairs byte-identical post-edit.

    - `[x]` **6.1.c Hook smoke test**
        - 13/13: all 5 retired types (`style`, `content`, `build`, `ci`, `config`) rejected; all 8 tuned
          types accepted with a valid `Context:` footer. Driven via temp commit-msg files against the live
          hook. Scope-rejection regression test omitted per the task's stated retirement.

    - `[x]` **6.1.d Codify three-layer scope convention (commit-format method + DEV-RULES.ARC + PRD R26 reshape)**
        - `commit-format.md` § Scope replaced with a **Three-layer convention** block: subject scope (LOCUS +
          vocabulary list + `(arc)` reservation), subject body (SPECIFIC work + ceremony action verbs), footer
          parenthetical (LIFECYCLE ACTION → `commit-footer.md`). Subsumed the prior **Subject line:** "no task
          IDs" rule into the Subject body bullet.
        - DEV-RULES.ARC § Commit format — unchanged: the existing method pointer suffices, and embedding
          default-specific convention into universal rules would couple them to override-able method content.
          Grep confirmed no residual `(arc)`-as-default prose elsewhere — nothing to remove.
        - PRD R26 reshape: deferred to WOR integration sweep per the task's stated scope split.
        - Both copies synced (package source authoritative). Sequencing vs. 6.7.n preserved.

    - `[x]` **6.1.e Codify handoff-commit subject + body shape (session-handoff.md step 3)**
        - Codified in `session-handoff.md` step 3 (both copies — template + rendered): subject template
          `chore(arc): handoff — <position>` with 6-entry position-string vocabulary; body template with delta
          lines for Last Completed / Next Task plus optional State / Blockers; subject-length guard for long WU
          names. Adjacent step-3 wording aligned to meta-file shape (`<resolved-meta-file-path>`, contributor
          file path, "active meta file"). Step 2's `**Working On:**` markers, line 162's heading, and the
          example markdown block at lines 164+ left for 6.7 cross-reference sweep (wider scope than this task's
          stated boundary). CLI-helper extraction stays tracked downstream in `plan-handoff-optimization.md`.

### `[x]` **6.2 Migrate in-flight WU meta files (`status-*` → `meta-*` + field backfill + State recodification)**

- _Goal:_ In-flight WU `status-*.md` files rename to `meta-*.md`; State recodified per mapping table; Owner backfilled
  from `arc.identity`; Origin defaulted to `[internal]` (external URLs migrated from prior Spec where applicable);
  Depends On initialized to `[none]` (manual extraction for known dependencies); Cohort initialized to `[none]` or
  cohort name for known sibling sets.

    - `[x]` **6.2.a Per-WU rename: `git mv status-{name}.md meta-{name}.md`**
        - Renamed `status-work-organization-reform.md` → `meta-work-organization-reform.md`.
          No `archive/` references on this branch (verified).

    - `[x]` **6.2.a' Meta-file shape restructure (H1 + grouped blocks per R58)**
        - H1 `# Status: Work Organization Reform` → `# Metadata: Work Organization Reform`.
        - `## Work Unit Metadata` H2 wrapper retired; fields now sit directly under H1 in blank-line-grouped
          field blocks per R58 (identity / reference / coordination / task pointers / directive groups).
        - Field bullet syntax (`- **Field:** value`) preserved per the cross-artifact convention.

    - `[x]` **6.2.b State recodification per mapping table**
        - This WU: `In Progress` → `Active` per R9. Other mapping rows didn't apply to this file.

    - `[x]` **6.2.c Backfill `**Origin:**`(default`[internal]`; migrate external URLs from Spec)**
        - `**Origin:** [internal]` backfilled (template-canonical lowercase; task description's `[Internal]`
          was stale relative to the post-template casing). No external Spec URL for this WU.

    - `[x]` **6.2.d Backfill `**Owner:**`from`arc.identity`**
        - `**Owner:** andrew` backfilled from `arc.identity`.

    - `[x]` **6.2.e Initialize `**Depends On:** [none]` (manual extraction for known dependencies)**
        - `**Depends On:** [none]` initialized — WOR has no documented blocking dependencies.

    - `[x]` **6.2.f Initialize `**Cohort:** [none]` (or cohort name for known sibling sets)**
        - `**Cohort:** [none]` — WOR is the foundation for the parallelism-trio cohort, not a member (the trio
          — Worktree Foundation, Agile WU Lifecycle, Concurrent Work Conventions — consumes WOR conventions).

    - `[x]` **6.2.g Retired-field migration on in-flight meta files (per R58 + R49a)**
        - `**Sibling Work Unit(s):**` field dropped (was `[none]`). Other retired fields (`**Base Branch:**`,
          `**Integration:**`, `**Interrupts:**`, `**Paused At:**`, `**Paused To:**`) and the `**Branch(es):**`
          → `**Branch:**` rename not applicable — this WU's pre-migration file already used singular
          `**Branch:**` and didn't carry the other retired fields.

    - `[x]` **6.2.h Cross-file header migration on in-flight non-meta WU artifacts (per R58a)**
        - `tasks-work-organization-reform.md` header rewritten to `**Spec:**` only — dropped `**PRD:**`
          (renamed via vocabulary alignment), `**Branch(es):**`, `**Base Branch:**`, `**Purpose:**`.
        - `prd-work-organization-reform.md` gained `- **Origin:** [internal]` field above the existing
          `**Purpose:**`, which migrated to bullet form to match `template-prd.md`. No pre-activation
          comment-block was present to retire.
        - No `plan-*` to migrate (WOR's plan retired pre-PRD per R51).

    - `[x]` **6.2.i Footer-convention status→meta filename-token propagation (couples atomically with 6.2.a)**
        - Hook (`commit-msg`, both copies): meta-anchor regex `status-` → `meta-`; sed pattern matched; variable
          renames `status_file`/`status_found` → `meta_file`/`meta_found`; error-message label "Status file" →
          "Meta file"; 6 example lines + 2 invalid-format help-text lines + 2 lifecycle-ceremony comments
          swapped `status-` → `meta-`.
        - `commit-footer.md` § Meta-file references (both copies): section-heading filename token + 7 example
          bullets swapped. `chore(status):` literal at one line preserved for 6.1.e codification (commit-subject
          token, not filename token).

    - `[x]` **6.2.j Cleanup: retire legacy State values from validation surface (paired with 5.4.a)**
        - `validateState` (`src/commands/active/types.ts`) switch trimmed to the four-value enum
          (`Planning | Active | Integrating | Shipped`); legacy `In Progress` / `Paused` / `Complete` /
          `Superseded` mapping arms dropped and docstring transition-window language removed. The
          legacy-mapping test case in `types.test.ts` is replaced by a negative test asserting each retired
          value resolves to `"unknown"`.

    - `[x]` **6.2.k Cleanup: verify sessionType fast-paths fire; codify Active fall-through (paired with 5.4.b)**
        - `inferSessionType` docstring (`src/commands/active/status.ts`) reframed: legacy-value enumeration
          (`In Progress`, `Paused`, `Complete`, `Superseded`) dropped from the fall-through arm; added a
          **Design — State carries phase, Next-Action carries activity** note naming the
          Active-as-phase-not-session-type split. Function body unchanged — the fast-path / fall-through
          structure already lands the codified routing (Planning → planning; Integrating → integration;
          Shipped → null; Active and any unrecognized value fall through).
        - Tests (`__tests__/unit/active/session-type.test.ts`, 27 tests pass): dropped the legacy-specific
          "falls through when State is `In Progress`" case (subsumed); renamed the three "non-Planning State
          falls through ..." describe blocks to "non-codified State falls through ..." and replaced their
          `"In Progress"` literals with `"Unknown"` to assert forward-compat for unrecognized State values
          (not accidental match elsewhere). Parenthetical-suffix test (`Paused (2026-04-12)`) reframed to
          "non-codified" framing. Existing codified-State fast-path coverage (Planning / Integrating /
          Shipped) and Active fall-through coverage (Active + integrate-* / Start-Task / null taskList)
          unchanged.

    - `[x]` **6.2.l Cleanup: retire legacy layout + prefix from active-file scan (paired with 5.4.c)**
        - _Outcome:_ Retired legacy `status-` prefix recognition + subdir-layout scanner in
          `lib/active/status-reader.ts`; `ActiveScanShape` type retired entirely (no callers needed to
          distinguish post-cleanup). Single-arm `findStatusFiles` replaces dual-shape detection +
          per-directory `meta-` preference dedup. `wu-resolution.ts` `^meta-` regex tightened, `scanShape`
          option dropped from `ResolveActiveWuOptions`. `commands/active/status.ts` mirrors (import +
          contributor-flow return-shape pruned). Tests: legacy-prefix + scan-shape + dual-presence
          describe blocks retired in unit tests; integration + e2e fixtures migrated from subdir to flat
          layout across 4 files. Release-handler test helpers `writeStatus(root, category, name)` keep
          the category param as `_category` (unused) to minimize call-site churn. Net: 206-line
          reduction across 11 files. 1906 tests pass. 6.2.o (`status-reader` → `meta-reader` symbol/file
          rename) unblocked.

    - `[x]` **6.2.m Cleanup: drop `## Work Unit Metadata` H2 fallback in section extraction (paired with 5.4.d)**
        - `extractMetadataSection` (`src/lib/active/status-reader.ts`) collapsed to a single H1-bounded
          arm — H2-wrapper detection path dropped. Function docstring trimmed to describe only the
          H1-bounded extraction; `parseStatusFile`'s docstring updated to remove the legacy-wrapper
          branch language.
        - Test-fixture migration to H1-only shape across 9 files (parser-dependent suites that wrote
          `# Status: x` / `## Work Unit Metadata` fixtures now write `# Metadata: x` followed directly
          by field bullets): `status-reader.test.ts` (helper + per-test fixtures; legacy-coexistence
          "prefers `## Work Unit Metadata` when both shapes present" test retired; section-boundary
          and missing-marker tests reframed; "H1-bounded fallback" describe renamed to "H1-bounded
          preamble"), `wu-resolution.test.ts`, `handlers/release/commit.test.ts`,
          `handlers/release/push.test.ts`, `integration/active.test.ts`, `integration/status.test.ts`
          (3 fixtures), `integration/release-push-upstream-init.test.ts`, `e2e/session-init.e2e.test.ts`.
          1917/1924 tests pass after rebuild; 7 failures are pre-existing 6.2.i hangover (commit-msg
          footer hook tests still write `status-foo.md` fixtures) and surfaced separately for routing.
        - `validate-status-spec.test.ts` retains `## Work Unit Metadata` fixtures intentionally — its
          script (`scripts/validate-status-spec.ts`) uses its own field-line regex, not
          `extractMetadataSection`; cleanup tracked under 6.2.n.

    - `[x]` **6.2.n Cleanup: retire dual-recognition in `validate-meta-spec.ts` (paired with 5.4.h)**
        - Script + test renamed via `git mv`: `src/scripts/validate-status-spec.ts` → `validate-meta-spec.ts`;
          `__tests__/unit/scripts/validate-status-spec.test.ts` → `validate-meta-spec.test.ts`. Test import
          path updated.
        - **Path pattern:** `STATUS_PATH` regex (with `status|meta` alternation) renamed to `META_PATH`
          and tightened to meta-only (`/^\.arc\/active\/(?:[^/]+\/)?meta-[^/]+\.md$/`); `STATUS_FIELD_LINE`
          renamed to `META_FIELD_LINE`; `PathClassification` discriminant flipped `"status"` → `"meta"`;
          module-level docstring rewritten to drop dual-recognition language.
        - **State value-set:** `VALID_STATES` trimmed to the codified four values (`Planning, Active,
          Integrating, Shipped`); `EXPECTED_STATE` diagnostic message simplified accordingly.
        - **Integration field:** `VALID_INTEGRATION_STATES`, `EXPECTED_INTEGRATION`, and the entire
          Integration-handling arm of `validateLifecycleFields` removed — Integration lines are now
          silently passed through (folded into `State: Shipped` per the WOR state model).
        - **Hook wiring:** both `packages/arc-framework/arc/system/githooks/pre-commit` and
          `.arc/system/githooks/pre-commit` synced byte-identical — CHECK 16 label flipped to
          "Meta-file `**Spec:**` ..."; candidate-grep tightened to meta-only AND broadened to also catch
          flat-layout meta files (`^\.arc/active/([^/]+/)?meta-[^/]+\.md$`) — closing a pre-existing gap
          where flat-layout meta files silently bypassed the validator; script-invocation path retargeted
          to `validate-meta-spec.ts`; shell variable + diagnostic-message renames (`status_spec_*` →
          `meta_spec_*`; "Status-file ..." → "Meta-file ..."). Smoke-tested against
          `meta-work-organization-reform.md` (passes, exit 0).
        - Tests (23 pass): dropped legacy-State acceptance test (now negative — asserts legacy values
          fail with the expected diagnostic); legacy-path classifier coverage flipped to assert
          `status-*.md` is classified `other`; Integration test cases consolidated to a single
          "retired Integration is silently passed through" assertion; the `## Work Unit Metadata` H2
          wrapper noted in 6.2.m as deferred is dropped from the `metaFile` helper (canonical
          `# Metadata: Foo` + field bullets). Adopter-facing doc reference in `PROJECT-STATUS.md`
          carries forward to 6.7's cross-reference sweep.

    - `[x]` **6.2.o Symbol/file rename: `status-reader` → `meta-reader` (paired with 5.4.c + 5.4.d)**
        - Files renamed (`git mv`): `src/lib/active/status-reader.ts` → `meta-reader.ts`;
          `__tests__/unit/active/status-reader.test.ts` → `meta-reader.test.ts`. Symbols renamed:
          `parseStatusFile` → `parseMetaFile`; `ParsedStatusFields` → `ParsedMetaFields`;
          `readActiveStatusCandidates` → `readActiveMetaCandidates`; `StatusFileCandidate`
          (in `commands/active/types.ts`) → `MetaFileCandidate`. `ReaderResult` left generic.
        - Import + JSDoc refresh in callers (`commands/active/status.ts`, `lib/release/wu-resolution.ts`)
          plus incidental sweep: `commands/active.ts` re-export, the `validateState` JSDoc in
          `commands/active/types.ts`, internal helpers in the renamed file
          (`isStatusFilename` / `findStatusFiles` → `isMetaFilename` / `findMetaFiles`), and the
          `statusFileBody` test-fixture builder. `lib/config/status-reader.ts` is a different module
          and stays untouched.

### `[x]` **6.3 Migrate capture pipeline files + user/ workspace to R65 layout**

- _Goal:_ Capture pipeline files restructure to the four-surface model — `user/{id}/ATOMIC-INBOX.md` renames to
  `USER-INBOX.md` (content under `## Atomic`; `## Backlog` initially empty); `BACKLOG-FEATURE.md` +
  `BACKLOG-TECHNICAL.md` merge to `backlog/BACKLOG-INBOX.md` with entries reclassified during merge; new empty
  `backlog/ATOMIC-INBOX.md` created. Plus: in-flight WU personal workspace relocates to R65's per-WU subdir layout —
  SESSION-NOTES moves into `<wu-name>/` subdir, `## Persistent Context` extracts to new `WORKING-MEMORY.md` at root.
  Plus: session-lifecycle workflow consumers (`session-handoff.md` + `session-init.md`) align with the new layout —
  paired with the in-flight workspace migration (6.3.d ↔ 6.3.e) so consumers and on-disk surfaces transition together.

    - `[x]` **6.3.a Per-user ATOMIC-INBOX → USER-INBOX rename**
        - Renamed `.arc/user/andrew/ATOMIC-INBOX.md` → `USER-INBOX.md` via plain `mv` (file is gitignored —
          `git mv` doesn't apply). H1 + preamble replaced with the template-canonical shape from
          `templates/user/USER-INBOX.md`. Existing inbox entries placed under `## Atomic`; empty `## Backlog`
          section added with the template's shape-guidance comments.

    - `[x]` **6.3.b Merge BACKLOG-FEATURE + BACKLOG-TECHNICAL → BACKLOG-INBOX**
        - Created `backlog/BACKLOG-INBOX.md` from `BACKLOG-INBOX.template.md` + dated drain section seeded
          with 8 multi-step entries. Folded 4 entries with clear plan-doc domain overlap into existing plans
          (`plan-docs-content-sweep.md` absorbs Strategy Docs on Docs Site + Post-1.0 Content Ideas;
          `plan-cli-substrate-adoption.md` absorbs Unify subprocess CLI test helpers;
          `plan-arc-plan-conductor.md` absorbs PR-sized boundary estimation). Dropped 3 entries: ARC
          Operating Modes (live `plan-arc-modes.md` already represents it), Automated template instantiation
          testing (WU3 shipped unit + integration + e2e template tests), Related Work Units cross-linking
          convention (subsumed by WOR's `**Cohort:**` R13 + `**Depends On:**` R11 meta-file fields). Routing
          decisions documented per-entry in the commit message. Source files deleted. ATOMIC-INBOX routing
          didn't surface — no entries fit the atomic-character criterion under the agreed policy.
        - Fold-target plan docs received dated "Backlog Inbox Absorption (2026-05-19, WOR Task 6.3.b)"
          sections appended verbatim with absorption metadata; integration into plan body deferred to focused
          iteration sessions per fold-target plan owner's discretion.

    - `[x]` **6.3.c Create new empty `backlog/ATOMIC-INBOX.md`**
        - Created `backlog/ATOMIC-INBOX.md` from harmonized template. Preamble tightened to match
          BACKLOG-INBOX shape (italic single-block; dropped the ceremony-only-writes and multi-writer
          rationale per the convention that those concerns live in `strategy-planning-module.md`, not
          in-file). Template + instance ship the codified shared-inbox shape — H1 + preamble + `## Inbox` H2
          wrapper + entry-shape HTML comment + trailing `---`. Populates organically post-WOR; ships empty.

    - `[x]` **6.3.d Migrate in-flight WU personal workspace to R65 layout**
        - Relocated `.arc/user/andrew/SESSION-NOTES.md` → `.arc/user/andrew/work-organization-reform/SESSION-NOTES.md`
          via plain `mv` (gitignored — `git mv` doesn't apply). Extracted `## Persistent Context` from
          SESSION-NOTES into new `.arc/user/andrew/WORKING-MEMORY.md` at user root (R59 minimal-pointer shape — H1 +
          3-line blockquote per `strategy-session-operations.md` § Working Memory). Five entries transplanted; the
          WOR-execution-transitional entry's "`user/{identity}/` layout lags until 6.3.d" bullet self-resolves with
          this task and was trimmed in-place (closing sentence narrowed from "branch name or `user/{identity}/`
          layout" → "branch name only"). Contributor-meta migration: no-op here (no contributor file present).
        - **Compat-shim retirement (paired with 5.6.f):** Dropped the flat-path fallback arm from
          `resolveSessionNotesPath` (`lib/handoff/session-notes-path.ts`); resolver is now subdir-only. Module
          docstring + `lib/handoff/restate-candidates.ts` docstring updated to drop the compat-window framing. Tests
          trimmed 7 → 5 cases — flat-only and both-present-prefers-subdir cases retired; multi-subdir-ambiguous and
          deeper-nested-paths cases adapted to assert null instead of falling back to flat.
        - **Template family alignment** (completes R65 template-side migration that 5.5.d partially landed):
          `templates/user/WORKING-MEMORY.md` shape finalized — italic R59 preamble, `## Memories` H2 wrapper, post-
          install setup entry seeded (migrated from SESSION-NOTES template per R65 class boundary), `---` trailer.
          `templates/user/SESSION-NOTES.md` — `## Persistent Context` section dropped (its content's canonical home
          is now WORKING-MEMORY per R65), `---` trailer added. Instance files mirror the template shape.

    - `[x]` **6.3.e Align session-lifecycle workflows with R65 layout (paired with 6.3.d)**
        - **`session-handoff.md` write paths:** § What to Update gains a `WORKING-MEMORY.md` bullet alongside the
          updated SESSION-NOTES path (`<wu-name>/` subdir + derivation guidance from `active.value.path`). §
          Comprehensive Handoff Format step 1 reframes from "review `## Persistent Context`" to "review
          `WORKING-MEMORY.md`"; step 5's SESSION-NOTES write path picks up `<wu-name>/` + the between-WUs no-subdir
          fallback. SESSION-NOTES template skeleton in the workflow body drops the `## Persistent Context` H2 (its
          content lives in WORKING-MEMORY now). § Persistent Context guidance reframes from a SESSION-NOTES section
          to "WORKING-MEMORY entries". § Task List Completion archive scenario updated — per-WU SESSION-NOTES subdir
          retires with the WU; WORKING-MEMORY persists across archive.
        - **`session-init.md` read paths:** Identity-absent skip list updated (SESSION-NOTES, WORKING-MEMORY,
          USER-INBOX, git notes; ATOMIC-INBOX reference retired per 6.3.a). Parallelism prescription includes
          WORKING-MEMORY in the item-8 batch. Item 8 rewritten as "Personal session context" wrapping two reads:
          per-WU `<wu-name>/SESSION-NOTES.md` (with `<wu-name>` derivation guidance + skip arm when no WU anchored)
          and cross-WU `WORKING-MEMORY.md` (`_Remove when:_` entries treated as active session constraints). Trust
          hierarchy tier 4 extended to cover both files.
        - **Mirror discipline:** Edits applied to both `packages/arc-framework/arc/system/workflows/arc/
          session-lifecycle/{session-handoff,session-init}.template.md` and `.arc/system/workflows/arc/
          session-lifecycle/{session-handoff,session-init}.md`. Team-mode `arc:if` conditional blocks (stripped in
          `.arc/` per existing project mode) untouched.
        - **Deviation from task spec:** The task description called for "a new template snippet [showing]
          WORKING-MEMORY.md shape (H3-headed entries with `_Remove when:_` markers)" in session-handoff. Did not
          add — WORKING-MEMORY isn't rewritten at handoff (incremental modify only), so the workflow doesn't need
          a fresh-write skeleton the way SESSION-NOTES does. The shape lives in the standalone template
          (`templates/user/WORKING-MEMORY.md`) and the existing instance file already loaded at session-init item
          8; agents reference those when adding/removing entries. Spec's "H3-headed entries" guidance also predated
          5.5.d's bold-paragraph entry shape codification.

### `[x]` **6.4 Migrate `backlog/feature/` + `backlog/technical/` to `backlog/{planned,provisional}/<wu-name>/` per-WU subdirs**

- _Goal:_ Existing `backlog/feature/` and `backlog/technical/` contents migrate to per-WU subdirs under
  `backlog/{planned,provisional}/<wu-name>/` per ROADMAP-inclusion test (on ROADMAP → `planned/`; not on ROADMAP →
  `provisional/`). Cohort wrapper subdir applied for codified sibling sets (`backlog/{commitment}/<cohort>/<wu-name>/`).
  Each migrated WU gets a `meta-<wu-name>.md` stub generated alongside its plan-doc (interactive backfill: `Origin` /
  `Owner` / `Depends On` / `Cohort`; all backlog WUs land `State: Planning` regardless of commitment dir — commitment
  level lives in dir, not State, per PRD R9 + R21). Two backlog-stage PRDs (`prd-arcd-rebrand.md`,
  `prd-arcd-docs-site.md`) demote to plan-docs with content reshape; the docs-site WU renames to `docs-site-refresh`.

- _Outcome:_ 33-WU backlog reorganization landed across 6 subtasks (`a` inventory → `b` routing decisions + 3 WU
  renames + 2 PRD demotions + 7-file cross-ref sweep → `c` per-WU metadata backfill + 4 new cohorts codified →
  `d` file moves + meta generation + 2 retirements pulled forward → `e` cross-ref repair + pre-existing-broken-ref
  fixes → `f` structural verification). Final shape: 6 codified cohorts (3 from `b`, 4 from `c`) wrap 17 WUs;
  9 standalone planned + 5 provisional + 31 migrating ✓; 2 retired inline at `d` (collapse to verification at
  6.6.b/6.6.c). `backlog/` root now contains exactly the 5 expected entries — `planned/`, `provisional/`,
  `ATOMIC-INBOX.md`, `BACKLOG-INBOX.md`, `ROADMAP.md`. Success Criterion #2 (backlog leg of the directory
  partition reform) closed.

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

    - `[x]` **6.4.a Inventory existing `backlog/feature/` + `backlog/technical/` contents**
        - 35 WUs inventoried: 6 in `backlog/feature/` (all plan-docs, no companions); 29 in `backlog/technical/`
          (27 plan-docs + 2 backlog-stage PRDs + 2 `notes-*` companions). Companion-type sweep across the seven
          codified types (`plan-* / prd-* / notes-* / tasks-* / atomic-* / research-* / analysis-*`) confirmed only
          `plan-*`, `prd-*`, and `notes-*` present in backlog — pre-activation state, as expected.
        - Flagged the two backlog-stage PRDs: `prd-arcd-rebrand.md` (demote → `plan-arcd-rebrand.md`; 6.4 spec
          routes `provisional/` despite ROADMAP entry under post-demotion name); `prd-arcd-docs-site.md` (demote →
          `plan-docs-site-refresh.md` paired with WU rename `arcd-docs-site` → `docs-site-refresh`; 6.4 spec routes
          `planned/`).
        - Worksheet committed at `notes-work-organization-reform.md` § Phase 6.4 Backlog Routing Worksheet — per-WU
          rows with all 8 columns (name / location / companions / ROADMAP-inclusion / cohort-candidate / proposed
          target / demote-PRD-flag / rename-flag), plus borderline rows requiring 6.4.b user confirmation
          (arcd-rebrand, arcd-docs-site → docs-site-refresh, arc-backend, architecture-remediation cohort
          codification decision) and ROADMAP ripple notes for 6.4.b. Cohort candidates surfaced: `parallelism-trio`
          (codified — worktree-foundation + agile-wu-lifecycle + concurrent-work-conventions) and
          `architecture-remediation` (provisional candidate — 6.4.b decision).

    - `[x]` **6.4.b Per-WU routing decisions + PRD demotion + WU rename (interactive)**
        - **Routing decisions captured for all 35 backlog WUs** in `notes-work-organization-reform.md` § Phase 6.4
          Backlog Routing Worksheet. Split: **33 migrating** (28 planned — 21 standalone + 7 in cohorts;
          5 provisional), and **2 retiring at 6.6** (`completion-status-consolidation`, `roadmap-evolution` — subsumed
          by WOR per PRD R14/R30-R32 + R37-R39; skip migration to save move-then-delete cycles; 6.6.b/6.6.c collapse
          to verification checkpoints).
        - **Cohort codification:** Two cohorts named at 6.4.b. `agile-parallelism` (renamed from working name
          `parallelism-trio` — captures both deliverable axes vs. structural-only) covers worktree-foundation +
          agile-wu-lifecycle + concurrent-work-conventions. `architecture-remediation` covers
          lib-layer-type-extraction + sync-handler-decomposition + user-sync-module-split + schema-introspection-layer.
          Paths: `backlog/planned/{cohort}/<wu-name>/`. Standalone WUs sit at `backlog/{commitment}/<wu-name>/`.
        - **PRD demotion #1 (arcd-rebrand):** `prd-arcd-rebrand.md` → `plan-arcd-rebrand.md` (git mv + content reshape).
          PRD shape (Requirements P0/P1/P2, Success Criteria) → plan-doc shape (Scope Sketch Layers 1-7, Indicative
          completion signals); stale-section preamble absorbed into Working Direction. Preserved verbatim: three-tier
          brand decision, content-sweep guardrails A-F, technical considerations. 470 → 346 lines (-26%). Routes
          `provisional/arcd-rebrand/` per portfolio-piece reframe (routing override despite ROADMAP entry).
          Notes-arcd-rebrand.md companion updated: PRD-vocabulary references reframed; demotion timeline at file head.
        - **PRD demotion #2 (arcd-docs-site → docs-site-refresh):** `prd-arcd-docs-site.md` →
          `plan-docs-site-refresh.md` (git mv + content reshape + WU rename). PRD Requirements P0/P1/P2 → Scope Sketch
          Layers 1-9; Success Criteria → Indicative completion signals; System Scenarios collapsed into Working
          Direction narrative. Preserved verbatim: Remedy theme adaptation, CF Pages monorepo setup, DNS cutover
          ordering (SSL-before-records-before-traffic), two-copy discipline. 505 → 442 lines (-12%). Routes
          `planned/docs-site-refresh/` (docs site work remains committed; split out from WU5 Public Release scope).
        - **Bonus rename (customization-architecture → customization-arch-realign):** Pure file rename
          (`plan-customization-architecture.md` → `plan-customization-arch-realign.md`); plan body unchanged (H1 already
          read "Customization Architecture Realignment"). Captures action verb; differentiates from
          architecture-introduction WUs.
        - **Cross-reference sweep (7 files):** All in-doc refs to the 3 renamed WUs updated to current filenames;
          ref-shape normalized to backticked-filename-only per DEV-RULES.ARC § Documentation Boundaries (no paths, no
          Markdown links to WU artifacts). Files: `plan-docs-content-sweep.md` (14 refs), `plan-arc-backend.md` (2),
          `plan-arc-modes.md` (1 body + link-def removed + 8 `[ARCd Rebrand][arcd-rebrand]` usages unwrapped),
          `plan-interlock-release-refinement.md` (3 refs + 2 topic-phrase normalizations), WOR own docs (6
          forward-pointers; historical event-description refs preserve old names).
        - **Resulting placement** (codified, executed at 6.4.d):
            - `backlog/provisional/arcd-rebrand/{meta-arcd-rebrand.md, plan-arcd-rebrand.md, notes-arcd-rebrand.md}`
            - `backlog/planned/docs-site-refresh/{meta-docs-site-refresh.md, plan-docs-site-refresh.md}`
            - Not a cohort — two standalone WUs despite the historical filename pairing
        - **Long-tail ripples deferred to Task 6.7 cross-reference sweep:** ROADMAP "parallelism trio" →
          "agile-parallelism" prose (~20 hits); ROADMAP plan-doc filename path updates after 6.4.d's per-WU subdir
          moves; broader audit of pre-rule path-form WU-artifact refs in other plans.

    - `[x]` **6.4.c Per-WU metadata backfill (interactive — Origin / Owner / Depends On / Cohort)**
        - Backfill values locked for 31 migrating WUs: `Owner: andrew`, `Origin: [internal]` uniform (no external
          tracker URLs found — arc-modes' GitHub/AWS citations are research refs, not origin), `State: Planning`
          uniform per PRD R9, `Depends On: [none]` defaulted with 2 chain exceptions captured (see below).
        - **4 new cohorts codified** (6 total post-6.4.c, joining 6.4.b's `agile-parallelism` +
          `architecture-remediation`): `agent-context-optimization` (handoff-opt + instruction-opt),
          `release-readiness` (wu5-public-release + docs-site-refresh + docs-content-sweep + release-lifecycle),
          `cross-machine-coherence` (coord-probe + cross-machine-sync-coherence), `approval-flow-refinement`
          (commit-increments + interlock-release-refinement). Cohort bar re-checked against source codification —
          `strategy-planning-module.md` § Cohort Wrapper Subdirs requires state-uniform + formal codification;
          "coherent value together / parallel-executable" inferred from the two existing examples is **not codified**.
          User's "thematic grouping for forced co-consideration / mental-model surfacing" satisfies the sibling-set
          framing. All four new cohorts meet the codified bar.
        - **2 Depends On chains captured:** instruction-optimization Depends On: handoff-optimization (sequential
          per plan body); docs-content-sweep Depends On: docs-site-refresh (strict architectural sequencing per plan
          body). Other inter-WU sequencing (within cohorts or across release-readiness members) deferred to
          per-WU activation/promotion time — cohort field handles mental-model surfacing.
        - **Count correction:** prior worksheet header (35 total / 33 migrating / 21 standalone) was stale relative
          to actual table contents (33 rows / 31 migrating once RET subtracted). Corrected to ground-truth counts
          throughout `notes-work-organization-reform.md` § Phase 6.4 Backlog Routing Worksheet. Final post-6.4.c:
          17 cohort planned + 9 standalone planned + 5 provisional = 31 migrating.
        - **Phase 6 ordering lean (b) confirmed:** retire `completion-status-consolidation` +
          `roadmap-evolution` inline at 6.4.d (pull-forward from 6.6.b/6.6.c). 6.6.b/6.6.c collapse to
          already-retired verification. 6.4.f stays clean.

    - `[x]` **6.4.d File moves into per-WU subdirs + meta-file generation**
        - 31 migrating WUs moved into per-WU subdirs (`backlog/{commitment}/<wu-name>/` or
          `backlog/{commitment}/<cohort>/<wu-name>/` for cohort members). 2 retire-pending WUs
          (`completion-status-consolidation`, `roadmap-evolution`) retired inline via `git rm` (pulled forward from
          6.6.b/6.6.c per lean (b)). Empty `feature/` parent dir removed; `technical/` dropped automatically after
          its last file moved out.
        - 31 `meta-<wu-name>.md` files generated from `template-meta.md` shape with backfilled fields per 6.4.c:
          State Planning; Owner andrew; Origin [internal]; Branch [none]; Spec points at the co-located plan-doc
          filename; Cohort per worksheet or [none]; Depends On [none] except for the two chains below. H1 titles
          extracted from each plan-doc's existing first-line title.
        - 2 Depends On chains landed in generated meta files: `instruction-optimization` → `handoff-optimization`;
          `docs-content-sweep` → `docs-site-refresh`.
        - Verification: every WU subdir contains its `meta-<wu>.md` (29 with 2 files: meta + plan; 2 with 3 files:
          arcd-rebrand + docs-content-sweep keep their `notes-*` companions). Tier 1 markdown lint clean across
          all 288 files (+29 net: +31 new metas - 2 retired plans).
        - Sequencing alignment: `backlog/` root now contains exactly the 5 entries 6.4.f checks for — `planned/`,
          `provisional/`, `ATOMIC-INBOX.md`, `BACKLOG-INBOX.md`, `ROADMAP.md`. 6.4.f reduces to verification only.

    - `[x]` **6.4.e Cross-reference update in moved docs**
        - 48 internal relative refs fixed across 12 moved docs to account for new subdir depth. Standalone WUs at
          `backlog/{commitment}/<wu>/` gained +1 `../` segment (depth 3 → 4); cohort-wrapped WUs at
          `backlog/planned/<cohort>/<wu>/` gained +2 `../` segments (depth 3 → 5). Both reference defs and inline
          links updated programmatically by regex; verified by markdown-lint + `validate-links.sh` clean.
        - Bundled with 6.4.d commit because the pre-commit `validate-links.sh` check would block 6.4.d's commit
          standalone — the file moves intrinsically break relative refs; the fix is the same commit.
        - **Pre-existing broken-ref surfacing (scope expansion):** the pre-commit link check also surfaced 3
          broken refs that pre-dated WOR's file moves but weren't caught earlier because the affected files
          weren't being committed (the check runs only on staged files):
            - `plan-arc-reinforce.md` → `plan-work-organization-reform.md` (WOR moved to active as PRD;
              `plan-*` no longer exists). Plus 2 sibling refs to `plan-instruction-optimization.md` and
              `plan-worktree-foundation.md` (same-dir refs that broke when arc-reinforce moved out of
              `backlog/technical/`). All 3 converted to backticked filenames per
              DEV-RULES.ARC § `.arc/` artifact references (no Markdown links to movable WU artifacts).
            - `notes-docs-content-sweep.md` → `integrate-planning-branch.md` (workflow retired with WOR's
              single-branch-per-WU model). Ref def removed; one inline usage converted to
              `` `integrate-planning-branch` — workflow retired with WOR's single-branch-per-WU model``.
            - `notes-docs-content-sweep.md` → `clean-work-unit.md` (workflow retired pre-WOR). Ref def
              removed; one inline usage converted to `` `clean-work-unit.md` — workflow retired pre-WOR``.
        - External-tracker URL refs in `plan-arc-modes.md` (vscode-103570, vscode-43505, aws-7369) untouched —
          they resolve externally, not via relative paths.

    - `[x]` **6.4.f Backlog-root structure verification**
        - `backlog/` root verified: exactly 5 entries — `planned/`, `provisional/`, `ATOMIC-INBOX.md`,
          `BACKLOG-INBOX.md`, `ROADMAP.md`. No `feature/`, `technical/`, or `plans/` dirs remain. No stray files
          at root. Top-down acceptance check passes — Success Criterion #2 (the directory partition reform's
          backlog leg) effectively closed.

### `[~]` **6.5 Clean up leaked Planning-state `status-*.md` files on `main`'s `active/`**

- _Outcome:_ Superseded by natural cleanup at WOR integration. Inspection of `origin/main`'s
  `active/` surfaced one leak — `status-work-organization-reform.md`, residue from the pre-WOR
  two-PR activation flow (PR #33 `technical/plan-work-organization-reform`) flagged in the
  WU's Persistent Context. WOR's branch already renamed this file via `git mv` at 6.2.a, so
  the file's removal rides the WOR merge to main as a natural consequence of the rename —
  no dedicated cleanup commit needed. Per-worktree isolation invariant (Success Criterion #2)
  holds the moment WOR integrates. 6.2.l unblocked.
    - Inspection-time finding (preserved for trace): `git ls-tree origin/main -- .arc/active/`
      showed exactly one `status-*.md` file (this WU's own), confirming the leak surface is
      bounded to known pre-WOR activation residue rather than ambient drift across other WUs.
    - Atomic-incidental spawned during inspection (`10fdf4e3`): added a base-branch parity
      check to `init-work-unit.md` Step 1, surfacing the cross-machine staleness pattern
      (local `main` 47 commits behind `origin/main` on this machine) before new-WU branch
      creation rather than at it. Probe-side extension captured in user-scoped ATOMIC-INBOX.

### `[x]` **6.6 Retire deprecated docs (`PROJECT-STATUS.md` + three others)**

- _Goal:_ Four deprecated docs retire — `PROJECT-STATUS.md` (function decomposes per R40 mapping; non-carried content
  logged in deletion commit message), two planning artifacts retire after content absorption, and
  `template-completion-doc.md` folds into the new meta-file archive-phase sections.

- _Note:_ PRD R51 currently lists two research files for retirement (`research-commit-convention-reform.md` and
  `research-worktree-tool-convergence.md`). The former doesn't exist (findings already absorbed pre-WOR); the latter
  exists and is retained until Worktree Foundation lands. PRD R51 needs symmetric correction at WOR integration — remove
  both research files from the retirement list.

    - `[x]` **6.6.a Retire `.arc/reference/PROJECT-STATUS.md` (R40)**
        - File deleted plus the coupled package-source template (`packages/arc-framework/arc/reference/PROJECT-STATUS.template.md`)
          so adopters don't render a retired doc on `arc init`. CLI surface trimmed: `SCAFFOLDED_FILES` entry in
          `src/lib/classification.ts` and the `pm.mode == arc-in-git` include in `init-recipe.json` removed. Test
          coverage updated in lockstep — `e2e/init.e2e.test.ts` (post-init existence assertion), `unit/init.test.ts`
          (`classifyFile` Scaffolded case), `unit/reconfigure.test.ts` (fixture template + condition include + added-set
          assertion across the arc-in-git switch test), `unit/template/recipe.test.ts` (validRecipe helper fixture).
          Content-not-carried-forward (early WUs without archived metas: Foundation, CineXplorer Sync, Dual-Maintenance
          Sync; plus the Project Health Indicators rollup) logged in the deletion commit message per R40.
          Adopter-facing workflow text references (`02_define-project.template.md`, `maintain-project-docs.md`,
          `01_verify-and-configure.md`, `arc-config.yml` comment) carry forward to 6.7's cross-reference sweep.

    - `[x]` **6.6.b Retire `plan-roadmap-evolution.md` (R51)**
        - Verification-only: deletion already landed at commit `37fe1b08` (Task 6.4.d/e backlog
          migration). File absent from `.arc/`.

    - `[x]` **6.6.c Retire `plan-completion-status-consolidation.md` (R51)**
        - Verification-only: deletion already landed at commit `37fe1b08` (Task 6.4.d/e backlog
          migration). File absent from `.arc/`.

    - `[x]` **6.6.d Retire `template-completion-doc.md` (R51)**
        - Both copies deleted (`git rm`): `.arc/reference/templates/template-completion-doc.md` and
          `packages/arc-framework/arc/reference/templates/template-completion-doc.md`. CLI surface
          trimmed: `init-recipe.json` top-level `include_files` entry removed (one line). No code
          or test references existed (template-class files aren't in `SCAFFOLDED_FILES`; no e2e
          asserted post-init existence). Content fold into `template-meta.md` archive-phase
          sections already verified at Task 4.1.g.

### `[x]` **6.7 Cross-reference sweep**

- _Goal:_ Cross-reference sweep across all surfaces (workflows, strategies, rules, briefs, templates) for retired
  patterns; each match updated or retired; sweep verified by post-sweep grep returning no orphans (Success Criterion
  #12).

    - _Approach:_ Pattern-per-subtask. Grep with file-glob restricted to documentation surfaces; update matches inline;
      verify by re-grep returning empty. Patterns from `notes-work-organization-reform.md` § Cross-reference sweep
      targets.

    - `[x]` **6.7.a Branch-prefix patterns (`feature/`, `technical/`)**
        - Branch-prefix references updated to R1 amended core-5 (`feat/`, `fix/`, `chore/`, `refactor/`, `hotfix/`)
          across 4 active files + 3 package mirrors: `strategy-team-coordination.md` (12 hits — all topology
          examples + `Branch(es):` field example + framing line "shared feature or technical branch" → "single
          shared WU branch"; `feature/` → `feat/`, lone `technical/ci-matrix` → `chore/ci-matrix`),
          `session-handoff.md` (2 hits — `**Branch**` field examples `feature/config-parser` and
          `feature/data-pipeline` → `feat/...`), `strategy-storage-evolution.md` (1 hit — anti-pattern example
          `feature/{name}` → `feat/{name}`), `packages/arc-framework/arc/README.md` (fold-in — directory diagram
          updated to flat `active/` + `backlog/{provisional,planned}/[<cohort>/]<wu>/` per R3 + R49). Package
          mirrors stayed byte-identical except `session-handoff.template.md` (template-form divergence by design).
          `review-triage.md` prose-alternation hit rephrased `feature/phase` → `feature or phase` (English
          synonyms-not-prefix; rephrase eliminates the false-positive grep match for 6.7.j cleanliness).
        - **Deferred to other phases** (surfaced by grep but out of 6.7.a scope, all explicitly tracked):
          `manage-incidental-work.md` 3 prose-dichotomy hits (`feature/technical work`, `active/{feature|technical}/...`
          path) → 6.7.i (grep patterns list augmented in this commit to explicitly include `feature/technical` and
          `active/{feature|technical}/`); remaining category-dir path references across ~15 files (~70 hits in
          workflows, strategies, briefs, templates) → new subtask 6.7.o created (R3 + R49 substrate retirement,
          distinct from 6.7.a's literal branch-prefix scope and 6.7.i's incidental-substrate scope). README META-PRD
          parenthetical (line 27) and archive "by work type" framing (line 34) left for 6.7.k (PROJECT-PRD rename)
          and 6.9.b (archive→completed path sweep) respectively.
        - Verification: `lint:md` zero errors on modified set; post-sweep grep in-scope surfaces shows 0
          branch-prefix-pattern references remaining (only the explicitly-deferred non-branch-prefix matches
          remain, all covered by 6.7.i + 6.7.o).

    - `[x]` **6.7.b PR-prefix pattern (`[PLAN]:`)**
        - Verification-only: pattern is already entirely absent from active framework surfaces under sweep scope
          (workflows, methods, strategies, briefs, templates, hooks). Wider grep confirms remaining matches live
          exclusively in internal-dev surfaces — `adr-019-work-unit-lifecycle-reform.md:97` (the WOR ADR
          documenting the retirement), WOR's own PRD (R6 retirement statement at line 170, plus four other
          retirement-context citations), notes/tasks (WU artifacts describing the reform), and one backlog
          plan-doc (`plan-docs-content-sweep.md`) citing the retirement context. All are correct retentions —
          retirement records and reform-context citations describe what was retired and why.
        - No edits required. Sweep scope clean.

    - `[x]` **6.7.c Retired workflow refs (`integrate-planning-branch`, `activate-planning-branch`)**
        - **Mechanical retirements:** `activate-planning-branch` refs updated to `init-work-unit` (per
          ADR-019 rename); `integrate-planning-branch` refs retired entirely (under R5/R6 single
          integration PR via `integrate-work-unit.md`, no separate planning-branch integration step).
          Files touched (with package mirrors): `2_generate-tasks.md` (3 hits — prose ref + 2 ref-link
          defs), `strategy-work-planning.md` (2 hits — prose ref + ref-link def updated to point at
          `init-work-unit.md`), `template-pull-request.md` (2 hits — entire `## Planning PR Variant`
          section retired since it described the now-retired multi-PR planning-branch model under
          R6; + the section-link forward-pointer at line 14 + the `[integrate-planning-branch]`
          ref-link def). `strategy-package-project-sync.md` file list updated (project-only — replaced
          two retired entries with single `init-work-unit.md` entry).
        - **Narrow rewrite of `2_generate-tasks.md`:** § Branch context + § Next Step reframed to
          remove the pre-WOR "directly on base branch" bifurcation. Under WOR's
          single-branch-per-WU model (R1, R2, R4) + strategy-work-organization.md § Branch
          Protection Modes ("Planned work units require a branch from inception"), planned-WU task
          generation always happens on the WU's planning branch (`plan/<name>`). Next-step path
          simplified to `activate-work-unit.md` (state transition + branch rename per R4). The
          atomic-tier / direct-impl init path is not codified under WOR-as-shipped — see
          forward-compat notes below.
        - **Forward-compat notes added to cohort backlog plans** (per zero-pre-WOR-tech-debt
          principle): `plan-arc-plan-conductor.md` § "Relationship to `init-work-unit.md`" extended
          with a `Towards — life-phase-agnostic init` note; `plan-agile-wu-lifecycle.md` §
          "Atomic-the-character vs atomic-the-shape" extended with a `Towards — atomic-tier WU init
          shape` note. Both notes describe WOR's planning-only init shape, point at the open
          question (init accepts life-phase parameter, OR `arc start` is a distinct path, OR
          conductor absorbs both), and credit the surfacing context (WOR Task 6.7.c reframing
          discussion). Worktree-foundation + concurrent-work-conventions: no notes added — they
          don't touch WU init shape directly.
        - **Deferred to other phases / out of scope:** `analysis/` (4 files, 7 hits) + `adr-019` (5
          hits) + WU's own internal docs (`prd-*`, `tasks-*`, `notes-*` for WOR) — historical /
          internal-dev surfaces retain references describing the retirement (2.13.e ADR-precedent;
          accurate-as-of-decision). `pristine.json` (9 hits) — generated/derived state, regenerate
          via CLI when 6.7 sweep complete.
        - Verification: post-sweep grep on active surfaces (workflows, methods, extensions, briefs,
          strategies, constitution, templates, QUICK-REFERENCE + package mirrors) returns 0
          matches; `lint:md` zero errors on modified set.

    - `[x]` **6.7.d Retired file-prefix patterns (`status-*.md`, `completion-*.md`)**
        - Updated `status-*.md` → `meta-*.md` (per R58) across 4 active files + 4 package mirrors:
          `session-init.md` (2 hits — probe-failure fallback prose with `.arc/active/**/status-*.md`
          and `.arc/user/{identity}/active/status-*.md` patterns), `session-handoff.md` (1 hit —
          `status-data-pipeline.md` example filename in handoff example block),
          `strategy-team-coordination.md` (2 hits — `status-auth-refresh.md` /
          `status-ci-matrix.md` in parallel-WU example landed via 6.7.a's prior touch — completed
          here per file-prefix migration), `strategy-workflow-authoring.md` (1 hit — commit footer
          example `Context: status-name.md (handoff)`).
        - **Deferred to other phases:** `completion-{name}.md` artifact references in
          `packages/arc-framework/arc/reference/archive/README.md` (lines 41, 50, 58, 102-106
          describing pre-WOR archive WU shape) — broader structural rewrite needed since the whole
          README is pre-WOR (category subdirs, PROJECT-STATUS refs, incidental category framing).
          Folded into new subtask 6.9.f (rewrite completed/README.md content for post-WOR shape;
          naturally co-located with Phase 6.9's archive→completed directory promotion).
          `strategy-package-project-sync.md:177` `template-completion-doc.md` ref → 6.7.e per
          its stated scope. Internal-dev / historical surfaces (ADR-019, analyses, WOR's own
          docs) retain references describing the retirement per 2.13.e ADR-precedent. The
          prose-noun `status-file` / `Status-file timing` pattern (distinct from the
          file-prefix-with-extension pattern this task sweeps) is 6.7.n's scope (ceremony-commit
          shape + status→meta prose sweep).
        - Verification: post-sweep grep on active surfaces (workflows, methods, extensions,
          briefs, strategies, constitution, templates, QUICK-REFERENCE + package mirrors)
          returns 0 `status-*.md` matches in current-state references (only the deferred
          `completion-*.md` README hits remain, covered by 6.9.f); `lint:md` zero errors.

    - `[x]` **6.7.e Retired template/strategy/plan refs (`template-completion-doc`, `PROJECT-STATUS`,
      `plan-roadmap-evolution`, `plan-completion-status-consolidation`)**
        - PROJECT-STATUS references retired across active surfaces (per R40, file retired at 6.6.a).
          Substantive section retirements: `02_define-project.md` § Step 7 Establish PROJECT-STATUS
          retired entirely (+ template mirror in arc-in-git conditional block) including
          update-trigger bullet, Next Step rest-list mention, and `[project-status]` ref-link def;
          `maintain-project-docs.md` § PROJECT-STATUS.md Changes subsection retired entirely (+
          mirror) plus PROJECT-STATUS lines under META-PRD and TECHNICAL-OVERVIEW Changes.
          List-entry retirements: `strategy-file-classification.md` § Scaffolded examples list
          and § Governed files list (2 hits × 2 copies); `01_verify-and-configure.md` arc-in-git
          review prompt; `strategy-configurability-architecture.md` `pm.mode` files list;
          `arc-config.yml` PM-mode comment (both project + package copies).
        - template-completion-doc references retired (file retired at 6.6.d):
          `strategy-package-project-sync.md` Framework files list line 177 removed.
        - PROJECT-STATUS template-mapping retired: `strategy-package-project-sync.md` line 257
          removed (`PROJECT-STATUS.template.md → PROJECT-STATUS.md` mapping); line 82 "Remaining
          templates" count updated 7 → 6, PROJECT-STATUS removed from the listed names.
        - plan-roadmap-evolution / plan-completion-status-consolidation: no active-surface
          references remained (files already deleted at 6.6.b/6.6.c via commit 37fe1b08; no
          inbound refs surfaced during grep).
        - **Folded in (forced by pre-commit validate-links):** `02_define-project.md` + template
          mirror carried a pre-existing broken `[meta-prd]: ../../../../reference/META-PRD.md`
          ref-link def (target file already renamed locally per R35; broken link surfaced only when
          file was next staged per SESSION-NOTES's pre-existing-broken-refs caveat). Completed the
          full META-PRD → PROJECT-PRD rename within this file (heading, body refs, ref-link label,
          ref-link target) to unblock the commit. 6.7.k task description amended to note this file
          is already handled.
        - **Deferred to other phases / out of scope:** Internal-dev / historical surfaces
          (ADR-019, analyses, research, WOR's own docs) retain references describing the
          retirements per 2.13.e ADR-precedent.
        - Verification: post-sweep grep on active surfaces (excluding pristine.json — generated
          state, regenerate via CLI at end of sweep phase) returns 0 matches for all 4 patterns;
          `lint:md` zero errors.

    - `[x]` **6.7.f Lazy scope-tag example (`docs(arc):` in method examples, etc.)**
        - **Type-laziness, not scope-laziness in practice:** every active-surface hit was `(arc)`
          scope on a lifecycle ceremony commit-subject example — `(arc)` is correctly reserved for
          ceremony per `commit-format.md`, so the lazy element was the `docs` type. Title framing
          inherited from PRD UC4 / `notes-work-organization-reform.md` line 799 cross-ref-sweep
          list, which bundles `docs(arc):` as one lazy token. Fix: `docs` → `chore`; `(arc)` stays.
        - **6 hits across 5 file pairs (10 file edits) — all WU lifecycle ceremony examples:**
          `1_create-prd.md:154` (PRD creation ceremony); `activate-work-unit.md:78`,
          `deactivate-work-unit.md:76,151`, `archive-work-unit.md:75`,
          `integrate-work-unit.md:186`. Package source edited first (authoritative), `.arc/`
          byte-mirrored.
        - **Originally-cited locus already clean:** "in commit-format method examples" from notes
          line 799 was the framing target — already swept at 6.1.d when the method's example block
          was reshaped. No active method-doc hits remained.
        - **Out of scope:** `.arc/backlog/` plan-docs (Activation Audit pattern),
          `.arc/reference/archive/` (historical), WOR's own active artifacts (PRD UC4 describes
          the lazy pattern; meta/notes/tasks cite real ceremony commit shapes).
        - Verification: post-sweep grep across active framework surfaces + package mirror for
          `docs(arc):` and the other `<type>(arc):` non-chore variants (`feat`, `fix`, `refactor`,
          `test`, `perf`) returns 0 matches; `lint:md` zero errors across 285 files; per-file
          `validate-links.sh` clean across all 10 touched files (no pre-existing broken refs
          surfaced).

    - `[x]` **6.7.g Extension renames (`pre-execution-graduation`, `pre-stage-review`, and old `pre-merge-review` for
      its pre-PR-creation semantic)**
        - **`pre-execution-graduation` — 0 active-surface hits.** The proposed name never propagated:
          file shipped under final name `pre-activation` at 3.8.a.
        - **`pre-stage-review` — 1 hit, single-copy.** `strategies/project/strategy-package-project-sync.md`
          Configurable file inventory still listed the pre-rename filename. Inventory refresh folded
          in: list updated to reflect post-WOR extension topology (added `pre-activation.md`,
          `pre-commit-review.md`, `pre-pr-review.md`, `pre-push-review.md`; `pre-merge-review.md`
          retained — filename unchanged, semantic shifted); count `22` → `25`. Internal-dev-only
          file (no package mirror per Audience Boundaries).
        - **`pre-merge-review` per-reference fire-point triage.** Found 20+ hits; semantic-classified
          each against PRD R56 + strategy-configurability-architecture's three-extension sequence
          (`pre-pr-review` → `review-response` → `pre-merge-review`). All retained as NEW-semantic
          (extension file itself, README, configurability-architecture strategy, integrate-work-unit
          workflow, diff-review method, namespace-listing references) except two OLD-semantic hits
          renamed to `pre-pr-review`:
            - `reference/templates/template-pull-request.md:148` — "Success-criteria status and
              pre-merge-review meta-narration" anti-pattern referenced "I reviewed locally before
              pushing" (pre-PR-creation push semantic).
            - `system/skills/arc-task-review/SKILL.md:14` — contrast framing "Not a substitute for
              the integration workflow's pre-merge-review (work-unit scope) or external code review
              tools" indicated the actual diff-review activity, which post-WOR is `pre-pr-review`
              (NEW `pre-merge-review` is the narrower final-state-checks gate).
            - Both edits also added backticks to the extension token per established prose convention
              (`pre-pr-review` vs bare prose).
        - **Out of scope:** `.arc/backlog/` (Activation Audit pattern); `.arc/reference/archive/`
          (historical); WOR's own active artifacts (PRD / notes / meta / tasks describe the renames
          themselves); `pristine.json` / `.internal/manifest.json` (generated state, regenerated via
          CLI per 6.7.c precedent).
        - **Observed pre-existing drift (deferred — out of scope):** strategy-package-project-sync's
          § Summary table count "Configurable | 15" mismatches the actual inventory list size
          (was 22 pre-WOR, now 25). Pre-WOR drift, not WOR-introduced — not folded in.
        - Verification: post-sweep grep returns 0 matches for `pre-execution-graduation` /
          `pre-stage-review` across active framework surfaces + package mirror; remaining
          `pre-merge-review` matches all NEW-semantic; `lint:md` zero errors; per-file
          `validate-links.sh` clean across all 5 touched files; byte-parity confirmed for both
          two-copy file pairs.

    - `[x]` **6.7.h Retired meta-file field references (per R58 + R49a) — retire entirely**
        - **Sweep scope reduced to 1 file pair after audit.** Upstream tasks (6.2.g in-flight
          meta-file migration + 4.6 / 4.7 / 4.1.h template-header retirements) absorbed 4 of 7
          grep patterns (`**Branch(es):**`, `**Base Branch:**`, `**Sibling Work Unit(s):**`,
          `**Integration:**`) — 0 active-surface hits remained on those. Wide-grep matches
          confined to WOR-own (out of scope), backlog (Activation Audit), archive (historical),
          and ADR-019 (per 6.7.e ADR-precedent).
        - **Pause-pointer trio retired in `strategy-work-organization.md` § Optional Pointer Fields.**
          3 table rows removed (`**Interrupts:** {category}/{name}`, `**Paused At:** <task-id>`,
          `**Paused To:** {category}/{name}`); `**Superseded By:**` row preserved (still
          current-state). 1-row table left intact — no restructure, future pointer fields may add.
          Package source first, `.arc/` byte-mirrored.
        - **Pause-pointer tokens in `manage-incidental-work.md` routed to 6.7.i.** Per the task's
          own caveat, workflow-level references rewrite to current-state language under 6.7.i —
          those tokens are inseparable from the procedural steps that use them. 6.7.h workflow
          list already excludes `manage-incidental-work.md`; 6.7.i list includes it.
        - **`[arc-config]:` ref-link def in `template-pull-request.md` preserved.** Surviving body
          reference to `merge.strategy` at line 43 keeps the link live — unrelated to the retired
          `**Base Branch:**` field that originally motivated the audit conditional.
        - **Out of scope:** `manage-incidental-work.md` (→ 6.7.i); `.arc/backlog/` (Activation
          Audit); `.arc/reference/archive/` (historical); WOR's own active artifacts; ADR-019
          (per 6.7.e ADR-precedent).
        - Verification: post-sweep grep across active framework surfaces + package mirror returns
          0 matches for all 7 patterns (`manage-incidental-work.md` excluded as 6.7.i territory);
          `lint:md` zero errors across 285 files; per-file `validate-links.sh` clean for both
          touched files; byte-parity confirmed across the two-copy pair.

    - `[x]` **6.7.i Incidental WU model substrate refs (`incidental/`, `manage-incidental-work`) — current-state rewrite**
        - **Sweep narrowed to 2 surfaces after audit.** 7 of 11 named "remaining surface" files were already
          clean: `session-handoff.md`, `integrate-work-unit.md`, `archive-work-unit.md`,
          `activate-work-unit.md`, `commit-footer.md` (discovery-context `(incidental during ...)` excluded
          per task), and strategies `strategy-file-classification.md`, `strategy-quality-gates.md`,
          `strategy-interlock-release-wrappers.md`. Only `prepare-commits.md` carried substrate-dependent
          content. Audit surfaced an additional in-scope surface not in the task's original list:
          `.arc/README.md`'s directory tree (substrate-dependent `active/feature|technical|incidental/` +
          `backlog/feature|technical/` paths).
        - **`manage-incidental-work.md` itself deferred to AWL/WF per PRD R49a + R52a.** "Conceptual
          retirement and workflow rewrite remain Worktree Foundation + Agile WU Lifecycle scope."
          Pause-pointer field tokens, `feature/technical` prose, and `active/{feature|technical}/` paths
          inside the workflow file stay until AWL completes the substrate migration. The grep patterns'
          overlap with 6.7.h's pause-pointer coverage is defensive — the field-level substrate retired at
          6.7.h's strategy-doc table; remaining hits inside `manage-incidental-work.md` are downstream
          territory.
        - **`prepare-commits.md` line 92 (both copies):** dropped the substrate-dependent parenthetical
          `(feature/, technical/, incidental/)` from the task-list-finding instruction. Under WOR's flat
          `active/` layout the path triple is obsolete; bare `.arc/active/` stands.
        - **`.arc/README.md` directory tree rewritten** to match the package source's WOR-aligned shape:
          `active/` collapsed to flat (drops feature/technical/incidental subdirs); `backlog/` shows
          `provisional/<wu>/` + `planned/[<cohort>/]<wu>/` per-WU subdirs (drops feature/technical
          subdirs). Single copy — the package source's `README.md` was already current.
        - **Already-aligned touch points verified, no edits:** `strategy-work-organization.md` § Incidental
          Work Model + State Enum row (2.8), `template-tasks.md` line 84 (4.6), `process-task-loop.md`
          lines 244/276 (1.3.d), `deactivate-work-unit.md` lines 20-21 (3.11.a),
          `strategy-task-list-formatting.md` (5 hits, all current-state),
          `strategy-package-project-sync.md` line 208 (file-inventory entry — file still exists, valid).
        - **Out of scope:** `manage-incidental-work.md` itself (→ AWL/WF per R49a); internal-dev surfaces
          (`adr-006`, `.arc/reference/analysis/` 4 files) per 6.7.e ADR-precedent; `.arc/backlog/`
          (Activation Audit); archive READMEs (historical); `USER-INBOX.md` (personal); WOR's own active
          artifacts; `commit-msg` hook `(incidental during ...)` Context modifier per task's explicit
          exclusion (discovery-context, not WU-category).
        - Verification: post-sweep grep returns 0 substrate-dependent matches on active framework surfaces
          (`incidental/` path triple — clean; `active/feature/` / `active/technical/` paths — clean across
          README + prepare-commits); `lint:md` zero errors; per-file `validate-links.sh` clean across all
          3 touched files; byte-parity confirmed for the `prepare-commits.md` two-copy pair.

    - `[x]` **6.7.j Post-sweep verification grep — returns empty for all retired patterns**
        - **All 20+ retired patterns from 6.7.a-i return 0 hits on active framework surfaces** (with
          `manage-incidental-work.md` excluded per R49a; 6.7.i Exception-clause refs `manage-incidental-work`,
          `[manage-incidental]:`, `Incidental Work Model` retain current-state matches only — verified unaltered
          from 6.7.i audit). Exclusion regex refined mid-pass: `.arc/reference/research/` is internal-dev
          (matching `analysis/` + `adr/` per 6.7.e ADR-precedent) — 5 false-positive research/ hits dropped
          after exclusion.
        - **3 inline-swept residual gaps — surfaced during verification, all PROJECT-STATUS refs that escaped
          6.7.e's original sweep:**
            - `.arc/reference/TECHNICAL-OVERVIEW.md` line 43 — PROJECT-STATUS removed from rendered-docs list
              (configurable instance only; package template was already current).
            - `packages/arc-framework/arc/backlog/ROADMAP.template.md` + `.arc/backlog/ROADMAP.md` lines 4-5 —
              PROJECT-STATUS sibling-doc sentence retired (template + rendered instance, identical header
              content).
        - **Substantial gap routed to 6.9.b** (folded into that task's description in a separate commit):
          `archive/README.md` (both copies, byte-identical) describes the OLD pre-WOR archive layout (work-
          categorized subdirs, `completion-{name}.md` convention, PROJECT-STATUS refs, substrate triples in
          navigation). Substantive content rewrite beyond directory rename — fits 6.9.b's archive→completed
          scope when 6.9.b fires after 6.9.a's `git mv`.
        - **Out of scope:** internal-dev surfaces (`reference/research/`, `reference/analysis/`,
          `reference/adr/`) per 6.7.e ADR-precedent; backlog WU artifacts (Activation Audit); archive content
          (historical, distinct from `archive/README.md` routed above); `manage-incidental-work.md` itself
          (R49a); `.arc/system/.internal/` generated state; WOR's own active artifacts; commit-msg hook
          `(incidental during ...)` discovery-context modifier.
        - Verification: post-sweep grep clean across all 20+ patterns post-inline-sweep; `lint:md` zero errors;
          per-file `validate-links.sh` clean across 4 touched files; byte-parity confirmed across the ROADMAP
          template + instance pair.

    - `[x]` **6.7.k META-PRD → PROJECT-PRD references (per R35 rename)**
        - _Outcome:_ Sweep landed across the named doc surface (8 markdown files × 2 copies + 2
          internal-dev singles) plus three audit-surfaced expansions folded in as carried scope:
          (1) **test fixtures** — `__tests__/{unit/manifest/apply,unit/health,unit/diff,integration/init}.test.ts`
          carried 18 live `"reference/META-PRD{,.template}.md"` path-string fixtures that 5.4.f's
          audit had reported clean; (2) **pre-commit hook literal-filter rename** — `grep -v 'META-PRD'`
          in `system/githooks/pre-commit` flipped to `PROJECT-PRD` (both copies) so the strict-pattern
          false-positive suppression continues to mask the renamed file's name; (3) **doubly-stale
          path correction** — `AGENT-BRIEF.PROJECT.template.md` comment carried `(reference/constitution/)`
          alongside the old name; both fixed in one edit. `manifest.json` hand-updated (key rename;
          `pristine_hash` dropped to match current Scaffolded shape per `apply.ts:160`). `pristine.json`
          values substring-updated narrowly; broader pristine staleness (legacy `system/agent/` keys,
          flat-WU subdir refs) deferred — out of scope. Tier 1 lint surfaced one pre-existing under-wrap
          on `maintain-project-docs.md` line 20 (126 chars pre-edit; 129 post-rename); wrapped in pair.
          83/83 affected tests pass; markdown lint zero violations.

    - `[x]` **6.7.l Audience-vocabulary sweep: "adopter" → neutral framing**
        - _Outcome:_ 7 hits resolved across 6 adopter-facing surfaces — 5 symmetric (`strategy-team-coordination.md`
          ×2, `setup-release-wrapper.md`, `system/extensions/README.md`, `template-workflow.md`, `template-meta.md`,
          all both-copies byte-identical) plus package-source `STRATEGY-INDEX.md` (ships as-is, `.arc/` is this
          project's internal-dev instance and was already clean). Replacements chose context-appropriate framing:
          actor-omitted for workflow / extension prose ("the question", "project-authored"); "projects" / "teams" for
          actor-specific cases; "stability contracts" for the technical term in `template-meta.md`. **Classification
          correction landed in the task description itself:** `.arc/`-populated Configurable instances
          (`reference/TECHNICAL-OVERVIEW.md`, `reference/QUICK-REFERENCE.md`, `.arc/reference/strategies/STRATEGY-INDEX.md`)
          contain `\badopter\b` hits but are internal-dev — adopters get the package-source `.template.md` (or
          ships-as-is package source for STRATEGY-INDEX), which is clean. Audit also surfaced two surface-list gaps
          (`template-meta.md`, package-source `STRATEGY-INDEX.md`) folded in before the sweep ran.

    - `[x]` **6.7.m `archive.cadence` enum cleanup (`strategy-work-organization.md` § Archival + `arc-config.yml`)**
        - _Outcome:_ Strategy doc's `Sweep-as-you-go default` enum trimmed from 3 bullets to 2 — `deferred` retired
          per `notes-work-organization-reform.md` § `archive.cadence: deferred` considered and rejected. **Audit
          fold-in:** `arc-config.yml` carried a stale-pointer comment block (`` `deferred` is intentionally omitted
          for v1; strategy-session-operations.md documents the rationale and future trigger criteria ``) — but
          `strategy-session-operations.md` had zero `archive.cadence` references, so the pointer led nowhere. Retired
          the entire 2-line comment outright rather than redirecting to internal-dev notes; adopters don't need
          retired-value context. Touch surface (4 files, both copies × 2):
          `.arc/reference/strategies/arc/strategy-work-organization.md` + package-source mirror;
          `.arc/system/arc-config.yml` + package-source mirror. Verified clean: `integrate-work-unit.md` § 12 cadence
          dispatch (2-value enum), `archive-work-unit.md`, `validate-config.sh`, `src/lib/config/status-reader.ts`
          valid-set, `init.test.ts:473` comment-block test. **Intentionally untouched:** `status-reader.test.ts:381`
          uses `archive.cadence: deferred` as the invalid-value fixture (test of rejection path — retired value is
          appropriate); ADR-019 retains its enumeration of the original 3-value enum per 2.13.e ADR-precedent
          (historical record).

    - `[x]` **6.7.n Ceremony-commit shape migration + status→meta prose sweep (Design CLEAN)**
        - _Goal:_ Migrate ceremony-commit subject shapes to the Design CLEAN convention codified in 6.1.d /
          6.1.e; sweep residual `status-` / `status-file` / `status-{name}` prose + filename tokens across
          adopter-facing surfaces; rename `## Status-File …` section headings in `strategy-session-operations.md`
          with anchor-link cascade. Companion to Task 6.2.a (file rename) and 6.2.i (hook regex + commit-footer
          body filename-token flip) — 6.7.n covers the subject-scope shape, prose-nomenclature, and residual
          filename-token strata those tasks don't touch. Hook regex change unnecessary: type-enum regex
          captures any alphanum scope; `(arc)` is the canonical reserved scope under the new convention.
        - _Grep patterns_ (full set): `chore\(status\)`, `chore\(meta\)`, `\bStatus[- ]?[Ff]ile\b`,
          `status-\{name\}`, `Status edits`, `status edit`. Captures ceremony commit shapes, prose
          nomenclature (both `status-file` and `status file` variants), filename-token placeholders, and
          section-heading patterns.
        - _Scope total:_ ~170 unique hits across 20+ adopter-facing surfaces (339 hits counting both
          copies). Atomic-per-op discipline (Phase 6 design) → split into 3 sequenced subtasks:
          n.1 (narrow / high-impact integrate ceremony shape) → n.2 (constitutional + strategy section
          heading migration with anchor cascade) → n.3 (bulk prose + filename-token sweep across remaining
          workflows / briefs / templates / strategies). Each commits independently.
        - _Sequencing prerequisites:_ Runs after 6.1.d (convention codification — the migration target
          shape) AND 6.1.e (handoff template); after 6.2.a (file rename) + 6.2.i (hook regex flip) so the
          end-to-end shape is coherent before this prose+shape sweep lands.
        - **Exclusions** (apply to all 3 subtasks):
            - Historical archive (`completed/<dated>/` post-6.9 / `reference/archive/` pre-6.9):
              accurate-as-of-decision; do not touch.
            - Internal-dev surfaces describing historical decisions (e.g., `adr-016`,
              `research-pr-sizing-and-wu-boundary-estimation.md`) follow the 2.13.e ADR-precedent —
              historical record stays accurate as-of-decision; explicit per-doc judgment at execution.

        - `[x]` **6.7.n.1 Integrate ceremony commit shape — `chore(meta): integrate` → `chore(arc): integrate`**
            - _Outcome:_ 2 flips in `integrate-work-unit.md` (both copies, byte-identical) — workflow
              callout at L52 (`subject chore(meta):` → `subject chore(arc):`) + ceremony commit example
              block at L56 (`chore(meta): integrate {name}` → `chore(arc): integrate {name}`). All five
              WU lifecycle ceremony commits now aligned on `chore(arc): <action> {name}`. Surrounding
              prose "meta-file commit shape" at L53 retained — points at the DEV-RULES.ARC § Commit
              Discipline section that n.2 will rename from "Status-file commit shape".

        - `[x]` **6.7.n.2 Constitutional + strategy section heading migration (anchor-link cascade)**
            - _Outcome:_ ~75 hits resolved across 4 surfaces (both copies, all byte-identical post-sweep):
              `DEV-RULES.ARC.md` full-file sweep (§ Commit Discipline bullet labels + `chore(status):` →
              `chore(arc):` + "Status edits" prose; § Session Management, § Documentation Boundaries,
              § When to Load Additional Guidance — filename-token migration); `commit-footer.md` L70
              example reference; `strategy-session-operations.md` § Status-File Timing + § Status-File
              Creation Contract H2 headings renamed (with TOC anchor cascade — local-only,
              `#status-file-` fragments grep clean post-sweep); `arc-commit/SKILL.md` L20-23 bullets.
              Table-column alignment in `strategy-session-operations.md` (lines 77, 113) re-padded to
              recover MD060 compliance after Status→Meta shortened cell content by 2 chars. § Commit
              Discipline narrative also tightened during the multi-line edit: "When the status edit /
              status alone → dedicated" simplified to "meta-file edit alone → dedicated" — single
              concept instead of two-phrase repetition.

        - `[x]` **6.7.n.3 Bulk prose + filename-token sweep across remaining surfaces**
            - _Outcome:_ Sed-driven sweep across 35 adopter-facing surfaces (17 .arc/ + 17 package source +
              1 project-side workflow with no package mirror). 13-pattern substitution set covered
              `\bStatus[- ]?[Ff]ile\b` variants (caps + mixed + lowercase, hyphenated + spaced),
              `status-{name}` filename tokens, `status-{incidental-name}` (manage-incidental-work),
              `template-status.md` (retired template pointer in manage-incidental-work),
              `chore(status):` workflow examples, and `Status edits / status edit` prose. **Surface
              additions during sweep:** `verify-work-unit.md` (both copies) — `## Step 4 — Pre-align
              Status File for Integration Handoff` H2 surfaced as residual after the bulk sweep (the
              uppercase-F `Status File` title-case pattern wasn't in the initial sed set); folded in
              with a follow-on pattern. **Lint repair:** 13 MD060 table-column-alignment errors caused
              by `Status`→`Meta` shortening cell content by 2 chars; padded affected cells in 7 tables
              (strategy-team-coordination, strategy-work-organization, AGENT-BRIEF.ARC, session-handoff and
              its template, session-init and its template, user/README). **Lifecycle workflows already clean:**
              `activate-work-unit.md`, `archive-work-unit.md`, `deactivate-work-unit.md` — no edits
              (verified by audit). **Intentionally out of scope (TS/code surface):** 4 hits in
              `packages/arc-framework/src/cli.ts`, `__tests__/unit/active/session-type.test.ts`,
              `__tests__/unit/scripts/validate-meta-spec.test.ts`, and
              `src/lib/release/types.ts` (the last is a deliberate backwards-compat-window pointer to
              the legacy filename — KEEP). Code surface deferred to a future task; n.3 stays markdown-
              focused per task scope.

    - `[x]` **6.7.o Category-dir path sweep (`active/{category}/`, `backlog/{...}/`) — R3 + R50 retirement**
        - _Outcome:_ Path-shape sweep across 16 adopter-facing Framework surfaces (both copies, byte-identical
          post-sweep) + 3 project-instance surfaces. **Framework surfaces** (Workflows: `1_create-prd.md`,
          `2_generate-tasks.{md,template.md}`, `session-handoff.{md,template.md}`,
          `initial-setup/01_verify-and-configure.md`; Strategies: `strategy-team-coordination.md`,
          `strategy-session-operations.md`, `strategy-work-planning.md`, `strategy-work-organization.md`;
          Constitution: `DEV-RULES.ARC.md`; Methods: `session-state.md`; Briefs: `AGENT-BRIEF.ARC.md`;
          READMEs: `user/README.md`). Substitutions: `active/{category}/` → `active/` (R3 flat per-branch);
          `backlog/{category}/` → `backlog/{provisional,planned}/<wu-name>/` (R50 per-WU subdirs);
          `backlog/{category}/{prd,tasks}-{{WORK_NAME}}.md` → `backlog/{provisional,planned}/{{WORK_NAME}}/<...>`.
          **Adjacent token cleanup** in `session-handoff.{md,template.md}:66`: Lite-mode legacy `status.md` →
          `meta.md` swept on the same line (final stray status-file token in adopter surfaces post-6.7.n).
          **Table re-padding** for `strategy-team-coordination.md:49` and `AGENT-BRIEF.ARC.md:53` after
          `active/{category}/` shortened cells by 9-11 chars (MD060 compliant). **Project-instance surfaces**:
          `.arc/reference/strategies/project/strategy-package-project-sync.md` template-table refreshed (two
          retired-template entries collapsed to one `BACKLOG-INBOX.template.md` entry); `.arc/backlog/BACKLOG-INBOX.md`
          dangling-pointer cleanup (8 `_Captured during:_` lines stripped of retired-file provenance tail via
          Python regex — WOR Task 6.3.b date retained); `.arc/backlog/ROADMAP.md:103` historical entry rewritten
          to post-WOR vocabulary (`active/{category}/status-{name}.md` → `active/meta-{name}.md`);
          `.arc/user/andrew/USER-INBOX.md:293` cross-reference rewired from retired `backlog/technical/BACKLOG-TECHNICAL.md`
          to merged `backlog/BACKLOG-INBOX.md`. **Structural delete**: `git rm` of
          `packages/arc-framework/arc/backlog/{feature,technical}/BACKLOG-{FEATURE,TECHNICAL}.template.md` plus
          implicit empty-parent-dir removal (paired with 6.3.b + 6.4.d). **Verification**: comprehensive in-scope
          grep returns ZERO hits across both copies (excluding documented exclusions); 10/10 Framework files
          byte-identical between `.arc/` and `packages/arc-framework/arc/`; Tier 1 lint clean; per-file
          `validate-links.sh` clean on all 18 changed surfaces.

### `[x]` **6.8 Slim instance-file preambles (SESSION-NOTES + USER-INBOX + BACKLOG-INBOX + backlog/ATOMIC-INBOX)**

- _Goal:_ Existing instance files in this repo strip preamble blocks ("About this file" / Lifecycle / Portability /
  Writing-guide) per R59 — files become content-only, matching meta-file convention. Authoritative orientation lives in
  strategy docs + workflows. CLI seeding update (5.3) prevents new instances from regrowing preamble.

    - `[x]` **6.8.a Align `user/{identity}/SESSION-NOTES.md` to R59 pointer shape**
        - Inserted R59 1-line pointer between `# Session Notes` H1 and `## Handoff Metadata` in
          `.arc/user/andrew/work-organization-reform/SESSION-NOTES.md`, matching the codified template
          shape at `packages/arc-framework/templates/user/SESSION-NOTES.md` (pointer landed at `cb582bcc`).
          Original premise (strip preamble entirely, H1→H2 direct) superseded by R59's refined shape —
          minimal anchoring pointer over wholesale stripping. Audit: file now opens H1 → 2-line italic
          blockquote pointer → `## Handoff Metadata` H2.

    - `[x]` **6.8.b Slim `user/{identity}/USER-INBOX.md` (post-6.3 rename)**
        - Already aligned during Task 6.3.a USER-INBOX rename + template-italicization pass at
          `e45d39d7`. Live `.arc/user/andrew/USER-INBOX.md` carries the R59 3-line pointer matching
          `packages/arc-framework/templates/user/USER-INBOX.md` byte-for-byte. No further action.

    - `[x]` **6.8.c Audit workflow seeding for preamble strings (`session-handoff.md`)**
        - Subsumed by Task 5.3.a audit: seeding is verbatim template-copy via `lib/setup.ts:77` +
          `commands/user/add.ts:26`, not in-code injection — zero preamble strings in `src/lib/`.
          Workflow bodies don't inject preamble at seed sites. Regression test at
          `__tests__/integration/init.test.ts` (added in `21787ced`) asserts seeded SESSION-NOTES
          lacks the four preamble label strings, preventing reintroduction.

    - `[x]` **6.8.d Verify orientation coverage in authoritative docs**
        - R59a orientation precondition verified 2026-05-14 (per PRD § R59a + note 33). Strategy
          content (`strategy-session-operations.md` § SESSION-NOTES + Working Memory;
          `strategy-planning-module.md` § Inbox Family) landed in Phase 2 before Phase 6's
          instance-file shape migration fired. Pointers across SESSION-NOTES / WORKING-MEMORY /
          USER-INBOX / backlog inbox templates resolve to live sections — no gaps.

- _Outcome:_ R59 shape alignment substantially landed across Phases 2-6 rather than concentrated in 6.8 —
  Goal's "files become content-only" premise superseded by R59's refined shape (minimal 1-3 line anchoring
  pointers per file, codified at `cb582bcc`). Live files in scope all aligned to template shape at session
  end: SESSION-NOTES via 6.8.a here; USER-INBOX via 6.3.a + `e45d39d7`; `backlog/ATOMIC-INBOX.md` via
  `3305105b` / `ce7664ad`; `backlog/BACKLOG-INBOX.md` via `38b1d162` / `78905584`; WORKING-MEMORY via
  `f70e3ee1`. Folded cleanup: deleted dead seed template
  `packages/arc-framework/templates/user/ATOMIC-INBOX.md` (no longer referenced by CLI seeding post-6.3.a
  USER-INBOX rename; integration test at `__tests__/integration/init.test.ts:238` already asserts
  retirement at seed time).

### `[x]` **6.9 Archive directory promotion: `reference/archive/` → `.arc/completed/` (R62)**

- _Goal:_ Promote `.arc/reference/archive/` to top-level `.arc/completed/` per R62. Pipeline visibility: `backlog/`
  → `active/` → `completed/` becomes evident at directory-tree level (symmetric with existing `active/` and `backlog/`).

    - _Approach:_ `git mv .arc/reference/archive .arc/completed` — directory rename + promotion in one operation.
      Historical content moves alongside. R42 amended this WU (see 6.9.e) — historical layout reshaped to R41
      (`completed/<dated>/{NN}_{wu-name}/`) post-promotion; file contents preserved as-is.

    - _Sequencing:_ 6.9.a (rename) → 6.9.b (sweep) → 6.9.c (verify) → 6.9.d (hooks/scripts verify) →
      6.9.e (historical content reshape) → 6.9.f (README rewrite, reflects post-reshape shape).
      6.9.g (recipe gating reclassification) runs after 6.9.a and is independent of the sweep +
      reshape path — distinct mechanical concern (block placement in `init-recipe.json` +
      `classification.ts` layer assignment vs. path-string + dir-shape changes).

    - `[x]` **6.9.a Execute directory move (both copies) + lint-config + validate-links archive-skip updates**
        - Both `git mv` ops landed: `.arc/reference/archive` → `.arc/completed/` (with `2025-q4/`,
          `2026-q1/`, `2026-q2/` historical content intact) and
          `packages/arc-framework/arc/reference/archive` → `packages/arc-framework/arc/completed/`
          (README.md intact). All file moves tracked as renames by git; content preserved.
        - `.markdownlint-cli2.jsonc` `ignores` updated `.arc/reference/archive/**` →
          `.arc/completed/**` to restore lint suppression of historical content (~210 transient
          errors surfaced by the move before the config update landed). Repo-internal config —
          not shipped to adopters.
        - `system/scripts/validate-links.sh:131` archive-skip pattern updated in both copies
          (`.arc/` + package source) — `*/reference/archive/*|reference/archive/*` →
          `*/completed/*|completed/*`. Same job as the lint-config ignore (suppress
          link-validation on R42 read-only historical content); same co-dependency on the dir move
          (pre-commit hook blocks the commit without it; ~50 pre-existing broken links surfaced
          in historical content before the script update landed). Coupled integration test
          (`__tests__/integration/validate-links.test.ts:257–264`) updated to assert against
          `completed/` fixture path to match the new pattern.
        - T1 lint + pre-commit hook clean post-edit (0 errors across 287 files; link validation
          passes).

    - `[x]` **6.9.b Sweep inbound references (archive → completed paths)**
        - **Directory-concept path updates (15 files)** — `archive/` → `completed/` per R62:
          `archive-work-unit.md` (verb stays; sweep path tokens in step prose + 5 `git mv` template
          lines + body), `integrate-work-unit.md` (lines 174, 203), `strategy-work-organization.md`
          (lines 312, 321, 327, 402), `strategy-package-project-sync.md` (scope clause + Configurable
          file enumeration), `post-work-unit-archive.md` extension contract surface,
          `.arc/user/README.md` + package mirror (tracked-layout list), `docs/work-planning.md:126`
          (pipeline narrative), `.arc/backlog/BACKLOG-INBOX.md:63` (captured lifecycle-link-reanchor
          item), `plan-release-lifecycle.md:59` (aggregation read-path),
          `plan-arc-modes.md:3221+3224` (Category B post-init artifacts walk),
          `notes-docs-content-sweep.md:280+350` (personal-workspace recommendation),
          `adr-012:316` (current-state recommendation only; line 267 implementation-plan narrative
          preserved). All edits two-copy where applicable.
        - **WU-artifact-pointer reshapes (3 files)** — per DEV-RULES.ARC § `.arc/` artifact references
          (backticked-filename-only; drop path + Markdown links):
          `plan-post-release-methodology.md:12` (inbound `prd-work-status-restructure.md` ref),
          `plan-interlock-release-refinement.md:59` (release-wrappers WU pointers),
          `plan-arc-modes.md` (body refs at lines 2634, 4456-7, 4463; orphaned link defs at 5722-5723
          dropped).
        - **Carve-outs honored:** ROADMAP.md `Archive:` deep-link refs left R41-shape per task
          sequencing note (upcoming wholesale overhaul retires them entirely; mid-cycling = wasted
          churn); WOR PRD / tasks / notes excluded per task sequencing; ADR-019 + ADR-012
          decision-narrative refs preserved (record-not-living-doc discipline); `analysis-*.md`
          historical analysis preserved (already stale on R41 dimension; not a sweep target);
          `docs/reference/` docs-site paths different concern; `archive.cadence` config key,
          `archive-work-unit.md` filename, `post-work-unit-archive` extension key — verb stays
          per R62.
        - **Deferred / out-of-scope (intentional):** `init-recipe.json:9` +
          `classification.ts:78` deferred to 6.9.g (recipe gating reclassification);
          `manifest.json` auto-regen via `arc update`; `meta-work-organization-reform.md:19` Next
          Task pointer updates at next handoff per DEV-RULES § Meta-file timing.
        - **Two-copy discipline preserved.** All workflows + strategies + extensions + user-README
          edits applied to both `.arc/` and `packages/arc-framework/arc/` mirrors;
          `diff` byte-equality verified post-edit on each pair.

    - `[x]` **6.9.c Verify inbound references swept (post-6.9.b)**
        - Verification performed inline at 6.9.b completion: final grep across `*.md`, `*.ts`,
          `*.sh`, `*.json` surfaces returned only intentionally-out-of-scope hits
          (init-recipe.json + classification.ts:78 deferred to 6.9.g; manifest.json auto-regen;
          meta-file Next Task pointer at handoff per Meta-file timing; WOR PRD/tasks/notes;
          ADR-019 + ADR-012:267 historical decision narrative; analysis-modes-contributor-
          lifecycle-stress-test.md historical analysis; ROADMAP carve-out; `docs/reference/`
          docs-site paths).
        - T1 lint clean (0 / 287 files); `validate-links.sh` exit 0; two-copy mirror-pair
          byte-equality verified post-edit on workflows + extensions + strategies + user-README.

    - `[x]` **6.9.d Update hooks / scripts if needed**
        - Verification only — no edits needed at this step. `validate-links.sh` archive-skip pattern
          and `.markdownlint-cli2.jsonc` ignore landed in 6.9.a (pre-commit gate co-dependency). Final
          scan across both copies of `system/githooks/` (commit-msg, pre-commit, README) and
          `system/scripts/` (arc-lib.sh, run-shellcheck.sh, validate-config.sh, validate-links.sh,
          verify-integrity.sh, README) returns zero stale `reference/archive` / `.arc/archive` refs.
        - `manifest.json` + `pristine.json` regenerate via `arc update`; no manual edits.

    - `[x]` **6.9.e Reshape historical content under `completed/` to R41 layout (drop category subdir; add NN where absent)**
        - _Goal:_ Apply R41 directory shape uniformly across all historical content under `completed/`.
          The `.arc/` root promotion (6.9.a) made the pre-WOR categorical heterogeneity (some quarters
          with `feature/`/`technical/`/`incidental/` subdirs; partial NN coverage) visible enough to
          motivate normalization. File contents preserved; only directory structure changes.

        - **Target shape (per amended R41):** `completed/<dated>/{NN}_{wu-name}/` — NN as 2-digit
          completion-order prefix within the dated subdir.

        - **PRD amendments precede this execution** (landed in the planning-capture commit
          that inserted this subtask):
            - R41 path template updated to `completed/<dated>/{NN}_{wu-name}/` with explicit NN
              preservation clause + rationale.
            - R42 rewritten to codify the reshape: "directory layout reshaped to R41 at 6.9.e;
              file contents preserved as-is; no retroactive content migration; NN reconstructed
              from git history where absent in pre-WOR layout."

        - **Heterogeneity inventory + reshape plan:**
            - `2025-q4/feature/` — 1 WU (`enhance-docs-content-p1`), no NN, no per-WU subdir.
              Files live directly in `feature/`. Need to: create per-WU subdir, assign NN by
              completion order, `git mv` files into the new subdir.
            - `2025-q4/incidental/` — 3 tasks-only items (`tasks-chore-sync-cinexplorer-2025-10-17.md`,
              `tasks-chore-sync-cinexplorer-2025-10-24.md`, `tasks-incidental-terminology-refactoring.md`),
              no per-WU subdirs. Each gets its own `{NN}_{name}/` subdir at the quarter root.
            - `2026-q1/` — 7 technical WUs with NN already, under `technical/` category subdir.
              `git mv 2026-q1/technical/* 2026-q1/` to drop the category layer. Atomic roll-up
              `completed-atomic-2026-q1.md` stays at quarterly root (no WU, no NN).
            - `2026-q2/` — 8 technical WUs + 1 feature WU, all with NN, under category subdirs.
              `git mv 2026-q2/{feature,technical}/* 2026-q2/` to drop category layers.

        - **NN reconstruction for pre-NN content (2025-q4):**
            - For each WU/incidental lacking NN: `git log --follow --diff-filter=A --format=%aI
              <primary-task-list-path>` returns the first-add commit timestamp. Rank chronologically
              within the quarter, assign NN starting from 01. 2025-q4 total: 1 feature + 3
              incidentals = 4 NN slots.

        - **Boundaries (do NOT touch):**
            - File contents — no renames inside subdirs. `status-*.md` stays `status-*.md`;
              `completion-*.md` stays `completion-*.md`; no field backfill on historical meta files.
            - Atomic roll-up `completed-atomic-2026-q1.md` — not a WU, no NN, stays at quarterly root.
            - Lint/validate-links configs — already exclude `.arc/completed/**`; no edit needed.

        - **Verification:**
            - `ls .arc/completed/<quarter>/` shows numbered WU subdirs in completion order; no
              category subdirs remain.
            - `git status --short` shows only `R` (rename) entries — no add/delete pairs, no modify.
            - T1 lint + `validate-links.sh` pre-commit gates pass (configs unchanged; surface
              skipped under `.arc/completed/**`).

        - **Sequencing:** runs after 6.9.a/b/c/d; precedes 6.9.f (README rewrite reflects
          post-reshape state). Independent of 6.9.g (recipe gating).

        - **Outcome:** 72 file renames executed across 3 dated subdirs. 2026-q1 + 2026-q2
          dropped category subdirs in place (existing NN preserved). 2025-q4 required NN
          reconstruction for 4 items: cinexplorer-10-17 → NN 01, cinexplorer-10-24 → NN 02
          (dates from filenames), terminology-refactoring → NN 03 (mid-Q4 framework work,
          no precise date), enhance-docs-content-p1 → NN 04 (`**Completed:** 2025-12-26`
          per tasks-list metadata). All file contents preserved; only directory structure
          changed (verified via `git status --porcelain` — 72 `R` entries, 0 add/delete/
          modify). Atomic roll-up `completed-atomic-2026-q1.md` stays at quarterly root
          (no WU, no NN). T1 lint + validate-links pre-commit gates clean post-reshape
          (configs already exclude `.arc/completed/**`).

    - `[x]` **6.9.f Rewrite `completed/README.md` content for post-WOR shape**
        - README rewritten in both copies (`.arc/completed/README.md` +
          `packages/arc-framework/arc/completed/README.md`; byte-identical post-edit). 123 lines →
          58 lines.
        - Pre-WOR shape claims retired: quarterly + category subdirs (`feature/`/`technical/`/
          `incidental/`); `completion-{name}.md` as separate artifact; PROJECT-STATUS reference;
          incidental-category framing; "completion ceremony overhead" and "global sequence number"
          explainers.
        - Post-WOR shape codified: `completed/<YYYY-q*>/{NN}_{wu-name}/` layout (matches amended R41
          and 6.9.e-reshaped reality); meta-file as durable record with archive-phase sections
          (Release Notes + Completion Notes) per R30; per-tier companion presence (atomic-tier:
          meta plus optional atomic; quick-tier: plus tasks; standard-tier: plus prd plus tasks
          plus optional notes/atomic); archival-workflow refs point to `integrate-work-unit.md`
          plus `archive-work-unit.md` with `archive.cadence` mode hint.
        - Adopter-facing language preserved: no transitional framing, no internal-roadmap
          forward-pointers, no R-ID citations (per DEV-RULES.PROJECT § Audience Boundaries).

    - `[x]` **6.9.g Reclassify `completed/README.md` in `init-recipe.json` (core → arc-in-git conditional)**
        - **Gating change, not path replacement:** today `reference/archive/README.md` sits in
          `packages/arc-framework/init-recipe.json` core `include_files` (unconditional — every project
          seeds it regardless of `pm.mode`). R62 restricts `completed/` to arc-in-git mode — same rule
          that gates `backlog/` today. Move the entry (post-rename path: `completed/README.md`) from the
          core list into the `pm.mode == arc-in-git` conditional block alongside
          `backlog/ROADMAP.template.md` et al.
        - **Coupled CLI surface:** `packages/arc-framework/src/lib/classification.ts` carries the path
          string in its `CONFIGURABLE_FILES` set (line ~78). Token update only: `"reference/archive/README.md"`
          → `"completed/README.md"`. **Classification stays Configurable; layer flip is automatic** —
          `fileLayer()` reads from the `arcInGitFiles` set populated at `src/commands/init.ts:147–151`
          from the recipe's `pm.mode == arc-in-git` conditional block, so once 6.9.g's recipe edit moves
          the entry into that block, the layer returns `"arc-in-git"` without any change to layer logic.
        - **Test impact:** `__tests__/integration/init.test.ts` + `__tests__/e2e/init.e2e.test.ts` — flip
          seed-assertion expectations: default-mode init should NOT seed `completed/`; arc-in-git mode
          should. Symmetric with existing `backlog/` arc-in-git-conditional assertions — add explicit
          **positive coverage** that `completed/README.md` IS in the install output under arc-in-git
          (mirrors the `backlog/ROADMAP.md` positive assertion already present), not just the negative
          (absent under default mode).
        - **Universal-mechanism boundary preserved:** `archive-work-unit.md` workflow + `post-work-unit-archive.md`
          extension stay in the core seed list — only the _destination directory_ becomes mode-gated, not
          the archive mechanism itself. Same shape as today's backlog (universal `init-work-unit.md`
          mechanism + conditional `backlog/` artifacts).
        - **Sequencing:** runs after 6.9.a (`git mv` establishes the on-disk path); independent of
          6.9.b/c/d/e (path-string + dir-shape changes; distinct mechanical concern from block
          reclassification). Final subtask of 6.9 — its verification confirms recipe layer
          assignment is correct.

        - **Outcome:** `init-recipe.json` — `reference/archive/README.md` removed from core
          `include_files`; `completed/README.md` added to the `pm.mode == arc-in-git` conditional
          block alongside `backlog/ROADMAP.template.md` et al. `classification.ts:78` path string
          updated `"reference/archive/README.md"` → `"completed/README.md"` in
          `CONFIGURABLE_FILES`; classification stays Configurable, layer flip automatic via
          recipe-driven `arcInGitFiles` at `init.ts:147-151`. No test edits needed — existing
          init tests don't reference the archive/completed README path. T1 lint clean (0 / 287),
          typecheck clean, vitest 1844/1844 passing.

### `[ ]` **6.10 Supplemental collapse: `reference/research/` + `reference/analysis/` → `reference/supplemental/` (R62)**

- _Goal:_ Collapse `reference/research/` and `reference/analysis/` under `reference/supplemental/{research,analysis}/`
  per R62. Mental model alignment with `system/workflows/arc/supplemental/`. Nested subdirectories preserved (research
  vs. analysis remain categorically distinguishable).

    - _Approach:_ Create `reference/supplemental/` parent dir (both copies — `.arc/` + package source); `git mv`
      research and analysis under it. Each subtask spans both copies — the parallel-copy invariant matches the 6.9.a
      precedent for the archive→completed promotion. Package source carries `research/` and `analysis/` as README-only
      adopter-facing classification surfaces (byte-identical with `.arc/` copies).

    - _Sequencing:_ 6.10.a (mkdir, both copies) → 6.10.b (research mv, both copies) → 6.10.c (analysis mv, both
      copies) → 6.10.d (sweep) → 6.10.f (verify). 6.10.e deferred — `system/workflows/arc/supplemental/` (R62's
      mental-model parallel) ships with no parent README; consistency favors none here.

    - `[x]` **6.10.a Create `reference/supplemental/` parent (both copies)**
        - Both parent dirs created (`.arc/reference/supplemental` + `packages/arc-framework/arc/reference/supplemental`).
          Empty dirs are not git-tracked standalone — content (and this checkbox) lands with the 6.10.b research move.
          Package source confirmed to carry `research/README.md` and `analysis/README.md` as adopter-facing
          classification stubs shipped via `arc update`.

    - `[x]` **6.10.b Execute research directory move (both copies)**
        - `.arc/` copy (README + 22 research docs) and package source (README only) both `git mv`'d under
          `supplemental/research/`. All tracked as renames; content preserved. Paired in one commit with the 6.10.a
          mkdir checkbox (6.9.a precedent for paired moves).

    - `[x]` **6.10.c Execute analysis directory move (both copies)**
        - `.arc/` copy (README + 7 analysis docs) and package source (README only) both `git mv`'d under
          `supplemental/analysis/`. All renames; content preserved. Both `research/` and `analysis/` now live under
          `reference/supplemental/`; old `reference/{research,analysis}/` roots gone in both copies.
        - Move depth (+1 level) broke one outbound reference-style link in `analysis-workflow-clarity-audit.md`
          (`[arc-ext-post-context-load]` → `system/extensions/`); bumped `../../` → `../../../`. Pre-commit
          validate-links caught it — sole escaping link across both moved trees (other `../` hits are prose/code).

    - `[ ]` **6.10.d Sweep inbound references (supplemental collapse)**
        - Grep patterns: `reference/research`, `reference/analysis`, `\.arc/reference/research`,
          `\.arc/reference/analysis`, `[research]:` and `[analysis]:` reference-link definitions, hardcoded research /
          analysis paths in strategies / templates / backlog plans.
        - Update to `reference/supplemental/research/` and `reference/supplemental/analysis/` respectively. Surface:
          strategies (`strategy-work-organization.md`, `strategy-work-planning.md`, `strategy-package-project-sync.md`,
          others as discovered), templates (`template-completion-doc.md` — retiring per R51, but sweep cleanly before
          retirement), backlog plans (`plan-arc-modes.md`, `plan-docs-content-sweep.md`, `plan-wu5-public-release.md`,
          `plan-post-release-methodology.md`), ADRs (`adr-012` and any others), READMEs.
        - **Exclusions:**
            - Content INSIDE `supplemental/` (both copies) — the INBOUND sweep skips these docs' own bodies. Two
              sub-cases: (a) absolute self-paths (`.arc/reference/research|analysis`) — none exist, verified;
              (b) outbound relative links escaping the moved subtree — depth-adjusted at move time (6.10.c handled
              the one such link), NOT here. Sibling cross-refs within `supplemental/` (research↔analysis) survive
              the move unchanged (both subdirs moved together).
            - `.arc/completed/**` and `packages/arc-framework/arc/completed/` — historical content is read-only per
              R41/R42 and the WOR-wide convention (Phase 7.7.f filters `archive / completed / adr- paths` identically).
              `validate-links.sh` already skips `*/completed/*|completed/*` per 6.9.a; lint-config matches. ~22 inbound
              references across 12 files under `completed/` are preserved as-is (factual record of work done with old
              paths).
        - **Sequencing:** Runs after 6.10.b / 6.10.c (`git mv`) — directories must exist at new paths
          before sweep can verify. 6.10.f verifies after this completes.

    - `[~]` **6.10.e Author `supplemental/README.md`** — _Deferred (superseded by design decision)._
        - Parallel `system/workflows/arc/supplemental/` (R62's mental-model anchor) ships with no parent README; the
          `reference/` root itself also has no top-level README. Convention for grouping directories leans toward
          "no parent README, navigate by contents." Existing per-subdir READMEs (`research/README.md`,
          `analysis/README.md`) carry classification + naming + relationship guidance. R62 vocabulary framing routes
          to `strategy-file-classification.md` if codification beyond the per-subdir READMEs is needed downstream.

    - `[ ]` **6.10.f Verify inbound references swept (post-6.10.d)**
        - After 6.10.d completes, grep across the documentation surface for `reference/research`, `reference/analysis`,
          `\.arc/reference/research`, `\.arc/reference/analysis` — should return empty after exclusions: WOR PRD /
          task list / notes / status files (this WU's own content), `.arc/completed/**` and
          `packages/arc-framework/arc/completed/` (historical, read-only per the 6.10.d exclusion above), and content
          inside `supplemental/` itself (per 6.10.d exclusion).

### `[ ]` **6.11 System/reference re-tier: `constitution/` → `system/rules/` + `briefs/` → `reference/briefs/`**

- _Goal:_ Reclassify content based on a sharper organizing axis: `system/` holds prescriptive/operational
  machinery (workflows, methods, extensions, hooks, rules, config); `reference/` holds consultative look-up
  material (briefs, strategies, ADRs, PROJECT-PRD, TECHNICAL-OVERVIEW, QUICK-REFERENCE, templates). Under that
  criterion: dev-rules move INTO `system/` (prescriptive — they govern behavior every session); briefs move OUT
  to `reference/` (orientation/look-up — they describe what's true, not what to do). Dir rename from
  `constitution/` to `rules/` accompanies the move (the "constitution" label made sense when the dir housed
  PROJECT-PRD and TECHNICAL-OVERVIEW; now it's just rules). Load cadence (every-session vs on-demand) is NOT the
  organizing axis — QUICK-REFERENCE is loaded every session but reference-shaped.

    - _Approach:_ `git mv` both directories at both copies (`.arc/` + `packages/arc-framework/arc/`). Codify the
      split criterion in `strategy-file-classification.md` before the moves so the new organizing principle is
      documented as the change lands. Sweep ~100 references to `constitution/` and a smaller surface for
      `briefs/`.

    - _Sequencing:_ 6.11.a (criterion codification) → 6.11.b + 6.11.c (moves, parallel) → 6.11.d (sweep) →
      6.11.e (verify). README rewrites bundle with their respective moves.

    - `[ ]` **6.11.a Codify split criterion in `strategy-file-classification.md`**
        - Add new section: "Directory placement — system/ vs reference/, and intra-system tiering."
        - Two axes covered:
            1. Top-level: `system/` (prescriptive/operational) vs `reference/` (consultative/look-up).
            2. Intra-system: user-facing (overrides, extensions, additions) vs `.internals/` (CLI-managed,
               framework-internal; detailed nesting lands in Phase 6.12).
        - Justifies both 6.11's moves (constitution → system; briefs → reference) and 6.12's nesting. Single
          codification section serves both phases — no separate 6.12.a codification subtask needed.

    - `[ ]` **6.11.b Execute `constitution/` → `system/rules/` move + README rewrite**
        - `git mv .arc/reference/constitution .arc/system/rules`.
        - `git mv packages/arc-framework/arc/reference/constitution packages/arc-framework/arc/system/rules`.
        - Rewrite README at the new `system/rules/README.md` location: explain `rules/` purpose under the new
          criterion; drop the "Domain-Scoped Rules" section entirely. The forward-compat content there
          (describing `DEV-RULES.{DOMAIN}.md` pattern) will be reintroduced correctly by the
          `rules-restructure` backlog WU with the `DOMAIN-RULES.*` pattern; leaking the in-flight scope into
          the adopter surface violates DEV-RULES.PROJECT § Audience Boundaries.

    - `[ ]` **6.11.c Execute `system/briefs/` → `reference/briefs/` move**
        - `git mv .arc/system/briefs .arc/reference/briefs`.
        - `git mv packages/arc-framework/arc/system/briefs packages/arc-framework/arc/reference/briefs`.
        - Verify `briefs/README.md` content doesn't imply system/ placement — minor touch if existing text
          frames briefs as system-tier; reframe as orientation/reference material under the new criterion.

    - `[ ]` **6.11.d Sweep inbound references (constitution + briefs paths)**
        - Grep patterns: `reference/constitution`, `\.arc/reference/constitution`, `system/briefs`,
          `\.arc/system/briefs`, `[constitution]:` / `[briefs]:` reference-link definitions, hardcoded paths
          across workflows / strategies / READMEs / package source. Inventory: ~100 references to
          `constitution/`, smaller surface for `briefs/`.
        - Update to `system/rules/` and `reference/briefs/` respectively. Surfaces include: session-init
          workflow doc-load list (item 3), `session-init.contributor.md` variant, methods (`commit-format`,
          `commit-footer`, `quality-gate-commands`), most strategies (cross-reference one or both via
          reference-style links), DEV-RULES files themselves (cross-references between ARC and PROJECT
          variants), AGENT-BRIEF cross-references, package source mirror, READMEs.
        - **Exclusion:** content INSIDE `rules/` and `briefs/` — the moved files retain their own
          cross-references at their new paths; sweep targets only references TO the directories.

    - `[ ]` **6.11.e Verify inbound references swept (post-6.11.d)**
        - Grep across documentation surface for `reference/constitution`, `\.arc/reference/constitution`,
          `system/briefs`, `\.arc/system/briefs` — should return empty (excluding WOR's own PRD / task list /
          notes which legitimately discuss the move).

- _Outcome:_ `system/` becomes the home for all prescriptive/operational machinery; `reference/` becomes the
  home for all consultative material. Criterion codified in `strategy-file-classification.md` as the
  load-bearing organizing principle for future placement decisions. Backlog WU (`rules-restructure`) starts
  from this substrate to introduce the `DEV-RULES.*` (always-loaded) / `DOMAIN-RULES.*` (on-demand) filename
  split and the auto-loading wiring mechanism.

### `[ ]` **6.12 Intra-system internals nesting: `.internal/` + `githooks/` + `scripts/` + `skills/` → `system/.internals/`**

- _Goal:_ Separate user-facing customization surfaces (`arc-config.yml`, `extensions/`, `methods/`, `rules/`,
  `workflows/`) from framework-internal machinery (`.internal/manifest.json`, `githooks/`, `scripts/`,
  `skills/`) within `system/`. A developer walking into `system/` to override a method shouldn't have to
  filter past 3-4 dirs of framework plumbing they don't edit. Single hidden parent (`.internals/`) signals
  "framework-managed; don't touch" while keeping content discoverable for the workflows that consume it
  (notably `add-agent` reads `skills/` for SKILL.md content during harness-dir bootstrapping).

    - _Approach:_ Create `system/.internals/` parent at both copies; `git mv` each internals dir under it.
      The criterion for this nesting is codified in 6.11.a (intra-system axis) — no separate codification
      subtask needed here.

    - _Sequencing:_ 6.12.a (parent) → 6.12.b-e (moves, parallel after parent exists) → 6.12.f (sweep) →
      6.12.g (verify).

    - `[ ]` **6.12.a Create `system/.internals/` parent**
        - `mkdir .arc/system/.internals`.
        - `mkdir packages/arc-framework/arc/system/.internals`.

    - `[ ]` **6.12.b Move `.internal/manifest.json` → `.internals/manifest.json`**
        - `git mv .arc/system/.internal/manifest.json .arc/system/.internals/manifest.json`.
        - `git mv packages/arc-framework/arc/system/.internal/manifest.json
          packages/arc-framework/arc/system/.internals/manifest.json`.
        - Remove now-empty `.internal/` dirs at both copies post-move.
        - Update manifest validation / regeneration logic in `packages/arc-framework/src/` to read from the
          new path. Net effect: `.internal/manifest.json` → `.internals/manifest.json` (manifest.json
          promotes one level; `.internal/` dir retires; `.internals/` becomes the new grouping bucket).

    - `[ ]` **6.12.c Move `githooks/` → `.internals/githooks/`**
        - `git mv .arc/system/githooks .arc/system/.internals/githooks`.
        - `git mv packages/arc-framework/arc/system/githooks
          packages/arc-framework/arc/system/.internals/githooks`.
        - Sweep: hook-manager integration docs (Husky / Lefthook / pre-commit) in `githooks/README.md`, CLI
          install logic (`arc init` / `arc join` set `core.hooksPath` and modify hook-manager configs — all
          path-write sites need updating), manual-setup instructions in READMEs.
        - Self-hosted update: re-set `git config core.hooksPath .arc/system/.internals/githooks` on this
          repo after the move (one-time local op, not committed). Smoke-test commit confirms hooks fire from
          the new path (6.12.g).

    - `[ ]` **6.12.d Move `scripts/` → `.internals/scripts/`**
        - `git mv .arc/system/scripts .arc/system/.internals/scripts`.
        - `git mv packages/arc-framework/arc/system/scripts
          packages/arc-framework/arc/system/.internals/scripts`.
        - Sweep: `arc-verify` skill calls `verify-integrity.sh`; CLI calls `validate-config.sh`; `arc-lib.sh`
          is sourced from other scripts; READMEs reference paths. Update all callers across CLI source +
          shell scripts.

    - `[ ]` **6.12.e Move `skills/` → `.internals/skills/`**
        - `git mv .arc/system/skills .arc/system/.internals/skills`.
        - `git mv packages/arc-framework/arc/system/skills packages/arc-framework/arc/system/.internals/skills`.
        - Sweep: `add-agent` workflow (canonical-source path for harness-dir regeneration), Package-Project
          Sync pairing logic (skill-file drift check), harness-regeneration source path in `arc init` /
          `arc update` (CLI reads from package source for adopters; self-host path differs).
        - **Verification step (critical):** manually walk through `add-agent` workflow mentally after the
          path sweep to confirm path resolution; dynamic-path construction in the workflow may not be caught
          by literal grep.

    - `[ ]` **6.12.f Sweep inbound references (internals nesting paths)**
        - Grep patterns: `system/\.internal/`, `\.arc/system/\.internal/`, `system/githooks`,
          `\.arc/system/githooks`, `system/scripts`, `\.arc/system/scripts`, `system/skills`,
          `\.arc/system/skills`, `[githooks]:` / `[scripts]:` / `[skills]:` reference-link definitions.
        - Update to `system/.internals/{githooks,scripts,skills}/` and `system/.internals/manifest.json`
          respectively. Surfaces include: workflows, strategies, READMEs, CLI source code, hook-manager
          integration docs, package source mirror. Completion records (read-only historical) excluded.
        - **Exclusion:** content INSIDE the moved dirs — same as 6.11.d, sweep only inbound refs.

    - `[ ]` **6.12.g Verify inbound references swept + tooling smoke-test (post-6.12.f)**
        - Grep across documentation surface for the old paths (`system/githooks`, `system/scripts`,
          `system/skills`, `system/.internal/`) — should return empty (excluding WOR's own PRD / task list /
          notes).
        - Run `arc verify` end-to-end to confirm `verify-integrity.sh` and `validate-config.sh` resolve at
          their new paths.
        - Smoke-test commit on this repo to confirm hooks fire from the new path (`commit-msg` + `pre-commit`
          both invoked correctly under the updated `core.hooksPath`).

- _Outcome:_ `system/` cleanly separates user-facing customization surfaces (top-level children) from
  framework-internal machinery (`.internals/` namespace). Developer mental burden when navigating `system/`
  drops; the new structure auto-documents what's editable vs. CLI-managed via the dotfile convention. Skills
  mirror retained (not removed) — `add-agent` workflow consumes it, justifying the `.internals/skills/`
  placement as the canonical source.

### `[ ]` **6.13 Create `plan-arc-in-git-as-default.md` (R64)**

- _Goal:_ Create the exploratory `plan-*` doc capturing the "arc-in-git as default; modes scale around it" thesis per
  R64. Lands in `backlog/feature/` (legacy layout); graduates to `backlog/provisional/arc-in-git-as-default/` once Task
  6.4 completes the backlog restructure.

    - _Context:_ Captures a strategic deliberation surfaced during WOR scope discussion. Not committed work — explicit
      "exploratory" state in header. Implementation scope is conditional on thesis acceptance.

    - _Companion read at execution:_ Skim `plan-arc-modes.md` (header / TOC, not full body) to ground the implication
      inventory and confirm the doc reshapes (rather than duplicates) plan-arc-modes content.

    - `[ ]` **6.13.a Author `plan-arc-in-git-as-default.md`**
        - Header carries explicit exploratory framing: "**State:** Exploratory / Not yet committed — thesis-stage, not
          work-stage. This plan describes a deliberation to evaluate, not work to execute. Implementation sections are
          conditional on thesis acceptance."

    - `[ ]` **6.13.b Author Thesis section**
        - Single paragraph stating the thesis: arc-in-git as default; modes scale rather than swap shapes. ARC remains
          agnostic / generalizable rather than competing with external trackers; backlog can complement Jira / Linear
          rather than replace or be replaced by them.

    - `[ ]` **6.13.c Author Rationale section**
        - Research findings on out-of-band team coordination (teams resolve concurrency via Slack / meetings, not
          tooling); smaller WUs + ceremony-boundary updates as the actual decoupling mechanism for backlog drift; ARC's
          "scale up / down rather than swap shapes" framing. Reference WOR's own reshape of capture surfaces (R20's
          ceremony-only writes) as substrate for this thesis.

    - `[ ]` **6.13.d Author Implication Inventory section**
        - Per-mode implications:
            - `pm.mode: external` — semantic shift from "no backlog" to "backlog complements external tracker"
            - `pm.mode: none` — semantic shift; what survives, what doesn't
            - `pm.mode: lite` — interaction with the question; whether Lite keeps a minimal backlog or remains
              backlog-free
            - `strategy-planning-module` — reshape implications (currently scoped to arc-in-git specifically)
            - `plan-arc-modes` — consume / restructure implications (its mode framing may change)
            - `plan-arc-backend` — interaction with the thesis (backend may be less necessary if the concurrency
              problem is reframed)
            - `archive.preserve` opt-out — config-axis implication (mode-adjacent, orthogonal to default-mode
              question). Toggle where archive workflows delete WU artifacts at ceremony fire instead of moving
              to `completed/`; git history as durable record. Removes `completed/` from the project layout when
              off. Could exist regardless of which mode is default, but surfaces the same "what does the mode
              materialize on disk" question the thesis interrogates — natural co-inventory.
        - _Source:_ pull the USER-INBOX universality question (drain-target gap under `pm.mode: none`;
          behavior under `pm.mode: lite`) from `notes-work-organization-reform.md` § Open Design Questions
          into this section as a worked example for the `pm.mode: none` and `pm.mode: lite` bullets.
          Captured during WOR execution Task 5.6.e sanity-check; resolved as "PRD-consistent, defer to
          this plan and to `plan-arc-modes` Lite design pass." `archive.preserve` opt-out bullet captured
          during WOR Task 6.9 pre-execution review (gating change discussion) — included pre-authoring so
          the thesis-stage plan inventories it alongside the per-mode implications.

    - `[ ]` **6.13.e Author Decision Gate section**
        - Explicit gates: what deciding requires (e.g., evaluation of `plan-arc-modes`' current direction; verification
          that smaller WU pattern holds in practice; team-coordination research validation; concrete user feedback).
        - Frame: "this decision is not made by this plan; this plan organizes the inputs needed to make it."

    - `[ ]` **6.13.f Author Cross-References section**
        - Backlog plan-\* docs touched if thesis accepted: `plan-arc-modes` (independent consumer); `plan-arc-backend`
          (related); WOR (compatible with thesis but doesn't depend on it). Forward-link to ROADMAP / BACKLOG-INBOX as
          relevant.

    - `[ ]` **6.13.g ROADMAP / BACKLOG-INBOX entry decision**
        - Exploratory state should NOT appear in ROADMAP (which renders committed work per R37). Default: skip both
          ROADMAP and BACKLOG-INBOX inclusion — the file's exploratory header carries its own state signal. Revisit if
          the thesis matures and warrants pipeline tracking.

### `[x]` **6.14 Patch `init-work-unit.md` for backlog-meta graduation**

- _Goal:_ Update `init-work-unit.md` Steps 3-4 to handle the post-6.4 shape where backlog WUs carry `meta-{name}.md`
  (always) alongside any plan-doc + companions. Pre-6.4 Step 3 moved only the plan-doc and Step 4 always created the
  meta-file from template — under post-6.4 layout, that orphans the backlog meta-file and nuks its backfilled fields
  (`Origin`, `Owner`, `Depends On`, `Cohort`) at activation. Patch closes the broken-by-construction case for graduating
  backlog WUs to active.

    - `[x]` **6.14.a Update Step 3 to graduate the full backlog subdir**
        - Step 3 renamed to "Graduate Backlog Subdir to Active." `git mv` block now covers `meta-{name}.md`
          (always present), `plan-{name}.md` and `notes-{name}.md` (when present), and other companions; trailing
          `rmdir .arc/backlog/{state}/{name}` removes the now-empty subdir. Body language updated to reflect the
          per-WU subdir model and note that backfilled metadata survives via Step 4's Path A reconcile.

    - `[x]` **6.14.b Update Step 4 to two-path (reconcile vs. create-from-template)**
        - Step 4 now branches: Path A reconciles `Branch` / `Spec` / `Next Action` on a graduated meta-file while
          preserving `Owner` / `Origin` / `Depends On` / `Cohort` and all other backfilled fields; Path B creates
          from `template-meta.md` per pre-6.14 logic for fresh WUs. CAUTION block clarifies staging shape per path
          (bundled file moves + reconcile under A; dedicated meta commit under B).

    - `[x]` **6.14.c Add Non-Goals entry to PRD covering downstream scope**
        - Added bullet to `prd-work-organization-reform.md` § Non-Goals: "Stub-creation workflow, park/resume
          workflows, lightweight planning-entry surface — arc-plan Conductor." Notes WOR's structural shape vs.
          operating workflows split; references Phase 6.14 as the transitional-window patch and conductor
          (`plan-arc-plan-conductor.md` § 20) for full coverage.

- _Outcome:_ `init-work-unit.md` now correctly graduates backlog stubs to active without nuking backfilled fields;
  the metadata that Task 6.4.c carefully captures survives activation. Scope boundary explicitly drawn: WOR ships the
  graduate-from-backlog path; new-stub creation, park (Planning → backlog), and resume (backlog → Planning, new
  worktree) defer to arc-plan Conductor. Cross-cutting downstream-plan updates: § 20 (Park and resume lifecycle) added
  to `plan-arc-plan-conductor.md` with `park-work-unit.md` + `resume-work-unit.md` workflows added to its Proposed ARC
  Changes + Initial Scope Estimate; `plan-worktree-foundation.md` § Activation Audit gains an entry instructing a
  WORKING-MEMORY note for vanilla-git multi-WU integration discipline (removal trigger: CWC integrates).

## **Phase 7:** Spec form scaling and artifact rename

_Purpose:_ Execute the R66-R68 rename block — file-class renames (`prd-*` → `spec-*`, `plan-*` → `draft-*`), meta-file
field renames (`**Spec:**` → `**Design:**`, `**Task List:**` → `**Blueprint:**`), workflow rename
(`1_create-prd.md` → `1_create-spec.md`), template renames (`template-plan.md` → `template-draft.md`; `template-prd.md`
preserved), strategy-doc updates, validator + hook updates, and rename-specific cross-reference sweep. Companion to
Phase 6.7 (which sweeps Phases 1-6 patterns); Phase 7 sweeps the rename patterns introduced by R66-R68.

_Design decisions:_ Phase 7 follows Phase 6 because some Phase 6 tasks (notably 6.4's backlog reorg) operate on
pre-rename file names; running renames first would entangle 6.4 with new naming. Two-step approach: 6.4 demotes
`prd-arcd-*` → `plan-arcd-*` (as currently authored); 7.2 then renames `plan-*` → `draft-*` (catches the demotions
plus all other `plan-*` files). Phase 6.7 cross-ref sweep runs before Phase 7; Phase 7 includes its own narrower
sweep (Task 7.7) for rename-introduced patterns.

### `[ ]` **7.1 Rename `prd-*` → `spec-*` (file class + workflow)**

- _Goal:_ Per PRD R66, WU spec artifacts adopt `spec-{name}.md` filename prefix; spec-creation workflow renames.
  `template-prd.md` preserved (heaviest variant); lighter variants deferred to conductor WU.

    - `[ ]` **7.1.a Rename active `prd-work-organization-reform.md` → `spec-work-organization-reform.md`**
        - `git mv .arc/active/prd-work-organization-reform.md .arc/active/spec-work-organization-reform.md`.
        - Update active `meta-work-organization-reform.md` `**Spec:**` field value to `spec-work-organization-reform.md`
          (will become `**Design:**` field value at 7.3.b).

    - `[ ]` **7.1.b Rename backlog `prd-*` files → `spec-*`**
        - `git mv` on the backlog-stage PRDs that didn't demote at 6.4. Inventory expected: zero (6.4.b demotes both
          `prd-arcd-rebrand.md` and `prd-arcd-docs-site.md` to `plan-arcd-*` form before Phase 7 fires).
        - Verify: `find .arc/backlog -name 'prd-*' -type f` returns empty post-task.

    - `[ ]` **7.1.c Rename workflow `1_create-prd.md` → `1_create-spec.md` (both copies)**
        - `git mv .arc/system/workflows/arc/1_create-prd.md .arc/system/workflows/arc/1_create-spec.md`.
        - `git mv packages/arc-framework/arc/system/workflows/arc/1_create-prd.md
          packages/arc-framework/arc/system/workflows/arc/1_create-spec.md`.
        - Workflow body sweep: internal references to "PRD" stay where contextually appropriate (PRD is one template
          variant); references to `prd-*` filename pattern update to `spec-*`; references to `template-prd.md` stay
          (preserved per R66).

    - `[ ]` **7.1.d Rename template-prd inbound references — verify no false rewrites**
        - `template-prd.md` preserves its filename. Sweep confirms no `template-prd` references were rewritten to
          `template-spec` by mistake during the file-class rename. Quick grep check.

### `[ ]` **7.2 Rename `plan-*` → `draft-*` (file class + template)**

- _Goal:_ Per PRD R67, pre-spec exploration artifacts adopt `draft-{name}.md` filename prefix; `template-plan.md`
  renames to `template-draft.md`. The `arc-plan` skill name preserved.

    - `[ ]` **7.2.a Rename backlog `plan-*` files → `draft-*`**
        - `git mv` across all `backlog/{planned,provisional}/<wu-name>/plan-*.md` → `backlog/.../draft-*.md`. Inventory:
          ~25-27 files (post-6.4 demotions: includes `plan-arcd-rebrand.md` + `plan-arcd-docs-site.md` / renamed
          `plan-docs-site-refresh.md`).
        - Active `plan-*` inventory: zero (WOR's own plan retired pre-PRD per R51; no other active plan-* files).

    - `[ ]` **7.2.b Rename `template-plan.md` → `template-draft.md` (both copies)**
        - `git mv .arc/reference/templates/template-plan.md .arc/reference/templates/template-draft.md`.
        - `git mv packages/arc-framework/arc/reference/templates/template-plan.md
          packages/arc-framework/arc/reference/templates/template-draft.md`.
        - Template body: update H1 from `# Plan: ...` to `# Draft: ...` (or equivalent — verify current H1 shape before
          editing).
        - Inbound references swept at 7.7.

### `[ ]` **7.3 Meta-file field rename: `**Spec:**` → `**Design:**`, `**Task List:**` → `**Blueprint:**`**

- _Goal:_ Per PRD R68, meta-file field labels shift from artifact-type naming to role naming. Carries
  design-before-implementation principle via implicit label reinforcement.

    - `[ ]` **7.3.a Update `template-meta.md` field labels + comment block (both copies)**
        - Replace `**Spec:**` with `**Design:**` and `**Task List:**` with `**Blueprint:**` in template field bullets.
        - Update template comment block: chain-of-authority order changes from
          `Origin → Spec → Task List → PR URL` to `Origin → Design → Blueprint → PR URL`.
        - Add explicit framing line on the design-before-implementation principle: "`**Design:**` captures intent;
          `**Blueprint:**` decomposes execution; design precedes execution."
        - Update value-set documentation in comments: `**Design:**` accepts `draft-{name}.md` (Planning) and
          `spec-{name}.md` (Active+); `**Blueprint:**` accepts `tasks-{name}.md` (Active+).
        - Both copies (package source + `.arc/`) byte-identical post-edit.

    - `[ ]` **7.3.b Update active meta-file (`meta-work-organization-reform.md`) field labels**
        - Replace `**Spec:**` line with `**Design:**` (value reflects post-7.1.a rename: `spec-work-organization-reform.md`).
        - Replace `**Task List:**` line with `**Blueprint:**` (value unchanged: `tasks-work-organization-reform.md`).

    - `[ ]` **7.3.c Update `tasks-work-organization-reform.md` header field**
        - Header line `**Spec:** spec-work-organization-reform.md` becomes `**Design:** spec-work-organization-reform.md`.
        - (Field was renamed from `**PRD:**` to `**Spec:**` in 6.2.h; this is the second step to the terminal `**Design:**`.)

    - `[ ]` **7.3.d Backlog meta-file field labels**
        - For each `backlog/{planned,provisional}/<wu-name>/meta-<wu-name>.md` created at 6.4.d: replace `**Spec:**` →
          `**Design:**` and `**Task List:**` → `**Blueprint:**`. Field values may be `[none]` (Planning state, no
          spec/blueprint yet) or `draft-{name}.md` (post-7.2.a rename).

### `[ ]` **7.4 Validator + hook updates for new field + file patterns**

- _Goal:_ The validator script and pre-commit hook recognize the renamed field labels and file-class patterns. Without
  this, ceremony commits emitted by Phase 7 reference renamed surfaces but hook checks fail against old names.

    - `[ ]` **7.4.a Update `validate-meta-spec.ts` for `**Design:**` field name**
        - Search for field-name string literals (`'Spec'`, `'**Spec:**'`, `META_FIELD_LINE` regex anchors) in
          `src/scripts/validate-meta-spec.ts`; replace with `'Design'` equivalents. Verify diagnostic-message labels
          update to "Meta-file `**Design:**` field ..." form.
        - Update spec-filename pattern (`/spec-[^/]+\.md/` or similar) — accepts both `spec-*` (Active+) and `draft-*`
          (Planning) per R66/R67/R68 phase-value-set.
        - Tests: update fixture meta-files to use renamed field labels; add positive-case tests for `**Design:**
          draft-*.md` (Planning) and `**Design:** spec-*.md` (Active+).
        - Smoke test against `meta-work-organization-reform.md` post-7.3.b (passes, exit 0).

    - `[ ]` **7.4.b Update pre-commit hook (both copies) for `**Design:**` field label**
        - `.arc/system/githooks/pre-commit` + `packages/arc-framework/arc/system/githooks/pre-commit`:
          CHECK 16 label flipped to "Meta-file `**Design:**` ..."; script-invocation pattern unchanged (still calls
          `validate-meta-spec.ts`); shell-variable and diagnostic-message renames as needed.

    - `[ ]` **7.4.c Update commit-msg hook footer regex if it references field names**
        - Verify: `commit-msg` hook's footer-token regex references file-class patterns (`meta-`, `tasks-`, `prd-`,
          `plan-`)? If yes, update `prd-` → `spec-` and `plan-` → `draft-` in the regex. Smoke test.

### `[ ]` **7.5 Strategy doc updates (load-bearing for adopter clarity + principle codification)**

- _Goal:_ Update the strategy docs that authoritatively describe the WU artifact pipeline. Principle codification
  (per R68) lands in DEV-RULES.ARC and strategy-work-planning.md.

    - `[ ]` **7.5.a `strategy-work-planning.md` updates**
        - Pipeline diagram (`Idea → plan-*.md → PRD → Task list`) updates to
          `Idea → draft-*.md → spec-*.md → Blueprint (tasks-*.md)`.
        - § Plan Documents renames to § Draft Documents (or equivalent); body references `plan-*` → `draft-*`;
          `plan-{descriptor}.md` → `draft-{descriptor}.md`.
        - § PRD Conventions renames to § Spec Conventions; body references `prd-*` → `spec-*`; `PRD` retains where
          contextually appropriate (PRD is one template variant under `spec-*`); H1 form-signal convention noted
          (`# PRD: ...` vs lighter variants).
        - Add explicit principle statement: "Design precedes implementation. The spec doc (`spec-*`) defines intent;
          the task list (`tasks-*`) decomposes execution; the code realizes intent. Design happens upfront in the
          spec, not during implementation."

    - `[ ]` **7.5.b `strategy-file-classification.md` prefix table update**
        - Prefix table updates: `plan-` → `draft-` ("Work draft (pre-spec)"); `prd-` → `spec-` ("Work unit spec —
          PRD-shape by default; lighter variants per template choice").
        - Add brief sub-note: "Filename `spec-*` is uniform; spec form (PRD / brief / etc.) varies by template
          choice + H1 signal."

    - `[ ]` **7.5.c `DEV-RULES.ARC` § Task Execution — codify design-before-implementation principle**
        - Add a named principle (around line ~144 area, near "One task at a time"): "**Design-before-implementation
          (spec-directed work).** ARC's spec-directed posture: design decisions are made upfront in the spec
          (`spec-*.md`), not during implementation. The task list (`tasks-*.md`) decomposes the spec's design into
          actionable steps; the code realizes the design. When design questions surface during implementation, route
          them back to the spec for resolution — don't accumulate design debt in code or task notes."
        - Field-label reinforcement: cross-reference R68's `**Design:**` / `**Blueprint:**` labels as structural
          carriers of this principle.

### `[ ]` **7.6 Companion docs migration: `notes-*` co-location with renamed WU**

- _Goal:_ Companion `notes-*.md` files share the WU's slug — no rename needed (the prefix `notes-` stays). Verification
  only: confirm companion files weren't accidentally caught by 7.1/7.2 patterns. Quick filesystem walk.

    - `[ ]` **7.6.a Verify companion files (`notes-*`, `atomic-*`, `analysis-*`, `research-*`) untouched**
        - `find .arc -name 'notes-*' -o -name 'atomic-*' -o -name 'analysis-*' -o -name 'research-*'` returns expected
          inventory unchanged from pre-Phase-7 state. Companion file prefixes are stable across the rename block.

### `[ ]` **7.7 Cross-reference sweep for rename-introduced patterns**

- _Goal:_ Narrow sweep targeting only the rename-introduced patterns; Phase 6.7 already swept Phases 1-6 patterns
  (status→meta, branch-prefix retirement, etc.). Phase 7.7 catches `prd-` / `plan-` / `template-plan` / `1_create-prd`
  / `**Spec:**` / `**Task List:**` references in workflows / strategies / methods / templates / rules / briefs /
  test fixtures / CLI source that survived Phase 7's targeted updates.

    - `[ ]` **7.7.a Grep + update inbound references — workflow files**
        - Patterns: `prd-` filename refs (not `template-prd`, which preserves); `plan-` filename refs (not the
          historical `plan/` branch-prefix references which are commit-msg domain); `1_create-prd` workflow-name refs;
          `**Spec:**` field refs; `**Task List:**` field refs.
        - Surfaces: `.arc/system/workflows/arc/**/*.md` + `packages/arc-framework/arc/system/workflows/arc/**/*.md`.
        - Update in-place; both copies stay byte-identical.

    - `[ ]` **7.7.b Grep + update inbound references — strategies + constitution + briefs**
        - Surfaces: `.arc/reference/strategies/**/*.md`, `.arc/reference/constitution/*.md`,
          `.arc/system/briefs/*.md`, and their package-source mirrors.
        - Same pattern set as 7.7.a. Particular attention to `strategy-work-organization.md`,
          `strategy-configurability-architecture.md`, `strategy-task-list-formatting.md`.

    - `[ ]` **7.7.c Grep + update inbound references — methods + extensions**
        - Surfaces: `.arc/system/methods/*.md`, `.arc/system/extensions/*.md`, and their package-source mirrors.

    - `[ ]` **7.7.d Grep + update inbound references — templates + READMEs**
        - Surfaces: `.arc/reference/templates/*.md` (excluding `template-prd.md` content which stays), `.arc/README.md`,
          `.arc/reference/README.md` etc.

    - `[ ]` **7.7.e Grep + update — CLI source + tests**
        - Surfaces: `packages/arc-framework/src/**/*.ts` + `packages/arc-framework/__tests__/**/*.ts`.
        - Hardcoded file-class patterns, fixture filenames, mock data. Lint + typecheck + test pass post-update.

    - `[ ]` **7.7.f Final grep verification**
        - Final sweep — `prd-[a-z]` pattern across `.arc/`, `packages/arc-framework/arc/`,
          `packages/arc-framework/src/` (`.md` + `.ts` includes) returns empty or only intentional pre-rename
          historical references in archived material. Filter out `template-prd` (preserved per R66) and
          archive / completed / adr- paths (historical, read-only).
        - Same sweep for `plan-[a-z]` pattern — excluding `plan/` branch prefix (commit-msg domain),
          `template-plan` (renamed under 7.2.b so should be empty post-rename), and `arc-plan` skill name (preserved).
        - Same sweep for `**Spec:**` and `**Task List:**` field references in non-historical content.

## **Phase 8:** Verification

_Purpose:_ Tier-3 quality gates, success-criteria walkthrough, per-worktree isolation acceptance test, integration
readiness assessment.

### `[ ]` **8.1 Complete verification** — load and follow [`verify-work-unit.md`][verify-work-unit]

- _Goal:_ All Success Criteria below resolve to `[x]` or `[~]` (with annotations); Tier-3 quality gates pass
  (`npm run -s lint:md`, `npm run lint:ts`, `npm run typecheck`, `npm test`, `npm run build`); per-worktree isolation
  acceptance test passes; ready-for-integration flag set.
    - `[ ]` **8.1.a Per-worktree isolation acceptance test (explicit)**
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
- `[ ]` Three-layer scope convention codified per Design CLEAN — `commit-format.md` § Scope documents subject
  scope as locus, footer parenthetical as lifecycle action, subject body as specific work; `(arc)` reserved for
  cross-cutting framework + ARC lifecycle ceremony invocations; no mechanical scope-denylist
- `[ ]` Ceremony commits across WU lifecycle workflows use `chore(arc): <action>` pattern (handoff / activate /
  integrate / archive / deactivate) — verified by grep returning no `chore(status):` or `chore(meta):`
  references in adopter-facing surfaces
- `[ ]` Handoff commits carry informative subject (`chore(arc): handoff — <position>`) and structured body
  (`Last Completed` + `Next Task` field-delta lines) per `session-handoff.md` § Comprehensive Handoff Format
  step 3
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
  the new template shape; CLI `classification.ts` hardcoded reference updated (Task 5.4.f); cross-reference sweep clean
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
- `[ ]` Spec form scaling rename complete per R66 — `prd-*` file class retired in favor of `spec-*` (active + backlog);
  spec-creation workflow renamed `1_create-prd.md` → `1_create-spec.md` (both copies); `template-prd.md` preserved as
  heaviest variant; lighter variants explicitly deferred to conductor WU scope; spec form variation routes through
  template choice + H1 signal (not filename)
- `[ ]` Pre-spec exploration rename complete per R67 — `plan-*` file class retired in favor of `draft-*` (active +
  backlog); `template-plan.md` renamed to `template-draft.md` (both copies); `arc-plan` skill name preserved
- `[ ]` Meta-file field rename complete per R68 — `**Spec:**` field renamed to `**Design:**` and `**Task List:**` field
  renamed to `**Blueprint:**` across template-meta.md, in-flight meta files, `tasks-*` header fields, validator script,
  pre-commit hook; chain-of-authority order on meta now reads `Origin → Design → Blueprint → PR URL`
- `[ ]` Design-before-implementation principle codified per R68 — DEV-RULES.ARC § Task Execution carries the explicit
  principle statement; strategy-work-planning.md carries the principle as a pipeline invariant; template-meta.md comment
  block frames the field-label semantic; cross-reference between R68's field labels and the principle is explicit
- `[ ]` All quality gates pass (`npm run -s lint:md`, `npm run lint:ts`, `npm run typecheck`, `npm test`,
  `npm run build`)
- `[ ]` Ready for integration

---

[verify-work-unit]: ../system/workflows/arc/work-unit-lifecycle/verify-work-unit.md
