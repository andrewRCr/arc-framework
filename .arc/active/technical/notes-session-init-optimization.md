# Notes: Session-Init Optimization

## Contents

- [Alternatives Considered](#alternatives-considered)
- [Compliance-Reliability Grounding](#compliance-reliability-grounding)
- [Phase Sequencing Rationale](#phase-sequencing-rationale)
- [Risks and Mitigations](#risks-and-mitigations)
- [Research References](#research-references)
- [Phase 1 Trigger Coverage Audit](#phase-1-trigger-coverage-audit)
- [Phase 1 Classification (Task 1.1.b)](#phase-1-classification-task-11b)
- [Phase 2 Decisions](#phase-2-decisions)
- [Phase 3.R Second-Pass Decisions](#phase-3r-second-pass-decisions)
- [Phase 4 Audit Methodology](#phase-4-audit-methodology)
- [Phase 5.0 Worktree-Sync Research](#phase-50-worktree-sync-research-external-research-2026-04-23)

---

## Alternatives Considered

Five alternatives evaluated during exploration; the selected approach (E) is the four-strategy coordinated plan now
captured in the PRD requirements.

**A. Status quo (belt-and-suspenders front-load).** Keep current loadset. Rejected — current cost (~75–80k at
orientation completion) is high enough that adopters may abandon the framework rather than internalize the orientation
ceremony. Reliability argument is weaker than it appears; most loaded content is rationale, not operational.

**B. Sibling defaults files for arc-config / methods / extensions.** Split each into user-values + framework-defaults
sibling files. Rejected — research found no AI-dev tool uses sibling `.defaults` files; production patterns are either
hard-coded defaults (Biome/Vite/Prettier) or rich inline comments in a single file (TypeScript). Splitting
methods/extensions damages authoring UX (two-file lookup for overrides).

**C. Grep-filter reads on single arc-config.yml.** Keep the file intact, extract key-value pairs via grep at init.
Rejected — research found this pattern is novel in AI-dev tools (Cursor, Aider, Claude Code, Continue all read config
files in full) and carries documented drift risks (silent filter misalignment as format evolves).

**D. Pure JIT via imperative prose triggers.** Remove front-load entirely; rely on in-workflow prose to trigger loads.
Rejected as sole mechanism — research documented reliability problems in mid-task / full-window / edge-case contexts.
The core insight (ARC already ships explicit workflow references) is preserved via the thin-index + explicit-reference
hybrid: the index provides compliance awareness, the explicit references drive loads.

**E. Four-strategy coordinated approach (selected).** Per-file methods/extensions + operational-context audit + anchored
partial-reads + session-type conditional loading. Each strategy targets a distinct content shape; none depends on novel
patterns; all have production precedent. Captures architectural, content, and conditional savings that compound.

---

## Compliance-Reliability Grounding

Research identified production tools' trigger-reliability problems as specific to _conversational-intent-matching_
(agent decides whether skill X applies based on user utterance). ARC's triggers are _explicit named references_ inside
workflow prose ("follow the commit-format method") — structurally closer to link resolution than intent classification,
and empirically reliable in current ARC use.

Methods rely purely on the constitutional rule (DEV-RULES.ARC § Method and extension loading) plus reliable
workflow-declared triggers — no init-time enumeration. Extensions add minimal init-time work: a single
`grep -l "^active: true"` produces the active-extensions list consulted by fire-point directives, avoiding repeated
placeholder reads at fire time. ARC's value remains the explicit workflow model; methods and extensions remain
framework-fixed (adopter-dropped files would be orphaned without corresponding workflow references).

**Constitutional rule framing — absolute, no hedges.** Compliance-reliability research (AGENTIF instruction-following
benchmarks, constitutional-rule audits, motivated-reasoning studies) found conditional hedges on compliance rules create
rationalization surfaces — the agent self-grants the condition and skips the load. Positive absolutes measurably
outperform conditionals. Meta-constraint confusion between a hedged constitutional rule and an unhedged in-workflow
reminder compounds the effect. In-workflow references must use semantically aligned framing (absolute, not hedged).
Misalignment between constitutional and inline venues degrades compliance more than either framing alone.

**Baseline scope of the reliability claim.** Near-zero failure rate holds for Claude/Codex-class agents with focused,
well-specified workflows; degrades in long sessions, nested conditionals, and on weaker procedural-adherence models.
ARC's focused-session discipline already mitigates the primary degradation vector.

---

## Phase Sequencing Rationale

Why the phases land in this order:

- **Trigger contract before front-load removal.** If a method or extension lacks a reliable workflow trigger,
  removing its front-load guarantees a load failure at first reference. Phase 1 establishes the contract end-to-end
  (frontmatter schema + author-side declaration rule + workflow migration + CI enforcement) so the structural
  guarantee holds before Phase 3 retires the always-loaded bodies.
- **Constitutional rules with or before removal.** The rule pair anchors compliance durably across sessions. The
  author-side declaration rule lands in Phase 1.2 alongside the schema; the agent-side compliance rule lands in
  Phase 2.1. Both before Phase 3's removal, so loading behavior is governed before always-loaded bodies retire.
- **Methods/extensions restructure before content audit.** The restructure moves method and extension bodies out of the
  always-loaded set; the audit then applies to remaining always-loaded content. Ordering the opposite way audits content
  that's about to be removed entirely — wasted effort.
- **Content audit before session-init restructure.** The session-init workflow's own restructure depends on knowing
  which files ended up slim and which retained full load. Restructuring first would commit to a batch structure that
  then doesn't match the audit outcomes.

---

## Risks and Mitigations

1. **Audit quality risk.** Over-aggressive extraction could lose operational content. _Mitigation:_ retention heuristic
   (flow / counterintuitive / confusing-if-absent), spot-check verification during Phase 8, case-by-case judgment
   throughout Phase 4.

2. **Compliance risk from front-load removal.** Even with thin index + explicit references, behavior shift may expose
   edge cases. _Mitigation:_ constitutional rule (Phase 2) lands before removals (Phase 3–4); trigger completeness audit
   (Phase 1) catches gaps; Phase 8 verification measures correctness.

3. **Per-file restructure cross-reference drift.** Many workflows reference methods and extensions by anchor. Moving to
   file-paths requires updates across the codebase. _Mitigation:_ automated grep-and-replace pass; pre-commit D7a
   link-resolution check; Phase 3 explicitly scoped to include all cross-reference updates.

4. **Docs-content-sweep coordination lag.** Staging file produces docs-content-sweep inputs, but docs-content-sweep
   activates only after docs-site migration merges. Extracted content may sit for weeks before integration.
   _Mitigation:_ staging file is self-contained and durable; link placeholders in slimmed files are greppable so
   integration completeness is verifiable at docs-content-sweep time.

5. **Measurement target may not hit.** Success criteria project ~25% observation reduction; actual may differ. Low-end
   modeling is tight against the threshold. _Mitigation:_ measurement is a reporting metric, not a gate beyond the ≥25%
   threshold; P1.14 (DEV-RULES section-level partial-reading) adds margin; if delta is materially short (>30% below),
   Phase 8 surfaces the gap for analysis rather than blocking archival.

6. **DEV-RULES partial-read reliability.** Shifting rule sections to conditional-load creates a class of failure where
   an agent executes a session without a governing rule it should have loaded. _Mitigation:_ per-rule reliability gate —
   conditional-load only when trigger is clearly detectable at session-init; otherwise default to up-front load.
   Safety-floor is always "up-front load remains correct."

---

## Research References

Thirteen external research investigations conducted in two passes during plan refinement.

### Plan development pass (nine investigations)

- **Config file design idioms** — ESLint, Prettier, TypeScript, Biome, Vite. Outcome: ruled out sibling defaults file
  and grep-filter reads; both are novel/risky.
- **Agent context-loading patterns** — Cursor, Claude Code, Aider, MCP. Outcome: thin index + explicit references is the
  production pattern; pure JIT via intent matching is unreliable.
- **Prompt caching impact on context organization** — stability of front-loaded content vs. frequent reshuffles.
- **Grep-filter read pattern prior art** — ruled out as novel across evaluated AI-dev tools.
- **Hybrid index+body pattern mechanics** — Cursor rules, Claude Code skills, MCP progressive disclosure. Outcome:
  per-file frontmatter with aggregated index.
- **Token reduction angles beyond architecture** — content compression, link-not-inline, session-type loading.
- **Hidden/internal directory conventions** — ruled against `.internal/` for human-readable content.
- **Reference-by-link audit heuristics** — Mintlify, `/llms.txt`, agent-doc anti-patterns. Outcome: concrete retention
  heuristics (flow / counterintuitive / confusing-if-absent).
- **Session-type conditional loading patterns** — Cursor modes, Aider architect. Outcome: explicit signal via
  `Working On:` field prefix with auto-inference.

### Compliance-reliability validation pass (four investigations)

- **Procedural instruction-following reliability in long-horizon agent tasks** — IFEval, AGENTIF, agent drift,
  model-specific adherence. Outcome: near-zero failure rate holds for focused workflows on capable models.
- **Structural phrasing patterns for embedded procedural instructions** — declarative vs. imperative, positive vs.
  negative framing, hedge effects, XML-tag attention boundaries. Outcome: declarative framing preferred where natural;
  hedges eliminated; XML tags reserved for shape boundaries (D7b).
- **Thin front-loaded index vs. pure JIT compliance** — Claude Skills, Cursor Rules, MCP, RAG-MCP ablation findings.
  Outcome: thin index + explicit references beats pure JIT in reliability and beats heavy front-load in token cost.
- **Constitutional rules vs. in-workflow inline reminders** — system-prompt decay, meta-constraint confusion, venue
  alignment requirements. Outcome: both venues matter; semantic alignment (absolute framing in both) is a compliance
  multiplier.

### Related strategies and ADRs

- `strategy-session-operations.md` — context loading tiers
- `strategy-configurability-architecture.md` — override mechanisms
- `strategy-package-project-sync.md` — two-copy discipline
- `strategy-task-list-formatting.md` — in scope for P1.4 restructure
- ADR-013 (method loading model) — Tier 2 amendment in scope; reflects constitutional rule addition and per-file
  restructure

### Consumer WU

- `plan-docs-content-sweep.md` absorbs Phase 4 extractions via `notes-docs-content-sweep.md` staging file

---

## Phase 1 Trigger Coverage Audit

**Purpose:** Raw catalog — every current reference to each method/extension within the in-scope reference universe.
Classification (reliable / hedged / unreachable) per the 1.1.b rubric happens next.

**In-scope paths:**

- `system/workflows/**/*.md` (includes `arc-methods.md`, `arc-extensions.md`, `arc/**`, `project/**`, `supplemental/**`)
- `reference/constitution/*.md`
- `reference/strategies/**/*.md`
- `system/agent/*.md`

**Excluded** (per task spec): `reference/adr/*.md`, `reference/archive/**`. **Also excluded** (out of reference-source
scope): `active/`, `backlog/`, `reference/analysis/`, `reference/TECHNICAL-OVERVIEW.md`, `system/skills/`.

**Reading conventions:**

- _Self_ = the method/extension's own definition lines in `arc-methods.md` or `arc-extensions.md` (TOC,
  Related-methods/interactions table, heading, `.override` / `.default` / `.steps` sub-headings). Not a trigger by
  itself; listed once per entry for completeness.
- Each external reference is one candidate trigger. Annotations capture surface kind (link / prose / ref-def /
  example-marker) so 1.1.b can apply the rubric without re-reading each file.

### Methods

#### commit-format

Self: `system/workflows/arc-methods.md:24, 42–43, 53, 61, 65, 97`.

External references:

- `reference/constitution/DEV-RULES.ARC.md:65` — anchor `#commit-format` in Commit format § ("format specification... in
  `arc-methods.md`")
- `reference/constitution/DEV-RULES.ARC.md:348` — prose bullet "method dependencies block triggers loading of
  commit-format and commit-context-format" in § When to Load Additional Guidance
- `system/workflows/arc/supplemental/prepare-commits.md:6` — inline link in Purpose prose ("the [commit-format] and
  [commit-context-format] methods... are sufficient")
- `system/workflows/arc/supplemental/prepare-commits.md:14` — method dependency bullet link
- `system/workflows/arc/supplemental/prepare-commits.md:38` — in-step link ("Commit using the [commit-format] and
  [commit-context-format] methods")
- `system/workflows/arc/supplemental/prepare-commits.md:128` — in-step link (grouped commits scenario)
- `system/workflows/arc/supplemental/prepare-commits.md:156` — reference-def
- `system/workflows/arc/supplemental/integrate-external-content.md:76` — prose example ("e.g., `commit-format`,
  `pre-merge-review`, `session-state`")
- `reference/strategies/arc/strategy-session-operations.md:161` — method classification table row
- `reference/strategies/arc/strategy-configurability-architecture.md:318` — in-step link inside Example Override
  walkthrough

#### commit-context-format

Self: `system/workflows/arc-methods.md:25, 42–43, 59, 81, 90, 99, 103`.

External references:

- `reference/constitution/DEV-RULES.ARC.md:65` — anchor `#commit-context-format` (same line as commit-format)
- `reference/constitution/DEV-RULES.ARC.md:348` — prose bullet (same line as commit-format)
- `system/workflows/arc/supplemental/prepare-commits.md:7` — prose mention ("the [commit-format] and
  [commit-context-format] methods plus git hook validation are sufficient")
- `system/workflows/arc/supplemental/prepare-commits.md:15` — method dependency bullet link
- `system/workflows/arc/supplemental/prepare-commits.md:38` — in-step link
- `system/workflows/arc/supplemental/prepare-commits.md:129` — in-step link
- `system/workflows/arc/supplemental/prepare-commits.md:157` — reference-def
- `system/workflows/arc/work-unit-lifecycle/integrate-work-unit.md:148` — prose pointer "see `arc-methods.md` §
  commit-context-format" for `(code review)` footer
- `system/workflows/arc/initial-setup/01_verify-and-configure.md:109` — prose mention in override walkthrough example
  ("overrides `commit-context-format` to reference tickets instead of task lists")
- `reference/strategies/arc/strategy-session-operations.md:162` — method classification table row
- `reference/strategies/arc/strategy-configurability-architecture.md:319` — continuation of line 318's in-step link

#### issue-triage

Self: `system/workflows/arc-methods.md:26, 44, 153, 162, 166`.

External references:

- `system/agent/AGENT-BRIEFING.ARC.md:22` — prose ("issue-triage, test-first, quality gate commands")
- `reference/constitution/DEV-RULES.ARC.md:140` — in-rule link ("Assess severity via the
  \[`issue-triage`\]\[arc-methods\] method in `arc-methods.md`")
- `reference/constitution/DEV-RULES.ARC.md:345` — prose in § When to Load Additional Guidance ("method dependencies
  block triggers loading of issue-triage, quality-gate-commands, and (conditionally) test-first")
- `system/workflows/arc/session-lifecycle/session-init.md:247` — prose inside Item 11 body describing what the
  task-execution workflow contains ("method dependency triggers (issue-triage, quality-gate-commands, test-first)")
- `system/workflows/arc/3_process-task-loop.md:16` — method dependency bullet link
- `system/workflows/arc/3_process-task-loop.md:56` — in-step link ("follow the [issue-triage method] for severity
  assessment and fix-vs-defer decisions")
- `system/workflows/arc/3_process-task-loop.md:262` — reference-def
- `reference/strategies/arc/strategy-task-list-formatting.md:617` — in-prose link in § Atomic Companion
- `reference/strategies/arc/strategy-task-list-formatting.md:707` — reference-def
- `reference/strategies/arc/strategy-session-operations.md:158` — method classification table row
- `reference/strategies/arc/strategy-configurability-architecture.md:333` — prose ("For behavioral methods (session
  state, issue-triage, test-first) that do not have mechanical hook enforcement...")

#### test-first

Self: `system/workflows/arc-methods.md:27, 45, 189, 195, 199, 203, 219, 228, 229` (includes body-internal marker
mentions in the method's own default text).

External references — method links:

- `system/workflows/arc/2_generate-tasks.md:68` — in-step link ("When the [test-first method] applies...")
- `system/workflows/arc/2_generate-tasks.md:152` — reference-def
- `system/workflows/arc/3_process-task-loop.md:18` — method dependency bullet link (conditional annotation: "only when
  task has `Build \`test-first\`` marker")
- `system/workflows/arc/3_process-task-loop.md:38` — in-step link ("(per the [test-first method])")
- `system/workflows/arc/3_process-task-loop.md:261` — reference-def
- `reference/constitution/DEV-RULES.ARC.md:175` — anchor `#test-first` in § Test-first assessment
- `reference/constitution/DEV-RULES.ARC.md:180` — anchor `#test-first` in parenthetical cross-reference
- `reference/strategies/arc/strategy-task-list-formatting.md:476` — in-prose link ("**Applies when:** The [test-first
  method] assessment says test-first for this work")
- `reference/strategies/arc/strategy-task-list-formatting.md:708` — reference-def

External references — prose / marker / informational:

- `system/agent/AGENT-BRIEFING.ARC.md:22` — prose ("issue-triage, test-first, quality gate commands")
- `system/workflows/arc/2_generate-tasks.md:6, 48, 70, 126` — prose references to test-first ordering / grouping /
  marker usage
- `system/workflows/arc/3_process-task-loop.md:37` — in-prose marker mention inside the Test-first execution heading
  bullet
- `system/workflows/arc/session-lifecycle/session-init.md:248` — continuation of 247 prose inside Item 11 body
- `reference/constitution/DEV-RULES.ARC.md:24` — TOC bullet ("leave-it-cleaner, test-first")
- `reference/constitution/DEV-RULES.ARC.md:172, 174` — prose in § Test-first assessment ("ARC ships a decision tree...
  default to test-first")
- `reference/constitution/DEV-RULES.ARC.md:345` — prose in § When to Load Additional Guidance (conditionally)
- `system/workflows/arc/supplemental/manage-incidental-work.md:90` — prose "apply test-first from strategy"
- `reference/strategies/arc/strategy-task-list-formatting.md` at lines 22, 41, 239, 249, 255, 351, 356, 409, 419, 425,
  431, 477, 494, 500, 510, 521 — mix of TOC entry (22), Quick Format Checklist marker reference (41), prose describing
  when/how to use the marker (239, 409, 477, 510, 521), and example task bodies showing the
  `Build \`test-first\` (one behavior at a time):` marker syntax (249, 255, 351, 356, 419, 425, 431, 494, 500). These
  are marker-usage instances, not method links
- `reference/strategies/arc/strategy-session-operations.md:160` — method classification table row
- `reference/strategies/arc/strategy-configurability-architecture.md:333` — prose (shared line with issue-triage)

#### session-state

Self: `system/workflows/arc-methods.md:28, 48, 235, 242, 246`.

External references:

- `system/workflows/arc/session-lifecycle/session-init.md:18` — in-prose link inside § design-context preamble ("The
  session state mechanism is overridable via [`arc-methods.md` § session-state]")
- `system/workflows/arc/session-lifecycle/session-init.md:57` — in-prose link inside Step 2 preamble ("The document set
  below is the [session-state method] default. If your project overrides session-state, follow the override instead.")
- `system/workflows/arc/session-lifecycle/session-init.md:58` — continuation of 57
- `system/workflows/arc/session-lifecycle/session-init.md:435` — reference-def
- `system/workflows/arc/session-lifecycle/session-handoff.md:13` — in-prose link (§ design-context preamble, same
  pattern as session-init:18)
- `system/workflows/arc/session-lifecycle/session-handoff.md:19` — method dependency bullet link
- `system/workflows/arc/session-lifecycle/session-handoff.md:44` — in-prose link ("[session-state method] default — if
  your project overrides session-state, follow the override instead")
- `system/workflows/arc/session-lifecycle/session-handoff.md:467` — reference-def
- `system/workflows/arc/supplemental/integrate-external-content.md:76` — prose example
- `reference/strategies/arc/strategy-session-operations.md:22` — anchor `#session-state-portability` (unrelated section
  name — false match; recorded for transparency)
- `reference/strategies/arc/strategy-session-operations.md:165` — method classification table row

#### pre-merge-review (method)

Self: `system/workflows/arc-methods.md:29, 46, 260, 270, 274, 306`.

External references:

- `system/workflows/arc/work-unit-lifecycle/integrate-work-unit.md:33` — method dependency bullet link
- `system/workflows/arc/work-unit-lifecycle/integrate-work-unit.md:182` — section heading
  `### 6) Pre-Merge Review · \`#pre-merge-review\``
- `system/workflows/arc/work-unit-lifecycle/integrate-work-unit.md:186` — in-step link ("Execute the [pre-merge-review
  method]")
- `system/workflows/arc/work-unit-lifecycle/integrate-work-unit.md:349` — reference-def
- `system/workflows/arc-methods.md:394` — reference-def to extension (inside arc-methods.md itself, cross-pointing to
  extension)
- `system/workflows/project/agent-pre-merge-review.md:6, 7, 232` — project workflow that populates the extension;
  file-path uses same base name but is extension-related (see extension section)
- `system/workflows/arc/supplemental/integrate-external-content.md:76` — prose example
- `reference/strategies/arc/strategy-session-operations.md:61` — prose ("arc-extensions steps (post-task-quality,
  pre-merge-review, etc.)") — ambiguous between method/extension; recorded here and under extension
- `reference/strategies/arc/strategy-session-operations.md:163` — method classification table row
- `reference/strategies/arc/strategy-session-operations.md:171` — prose ("the integrate-work-unit workflow checks
  `pre-merge-review` before merging") — ambiguous between method/extension setting

#### review-triage

Self: `system/workflows/arc-methods.md:30, 46, 47, 268, 302, 310, 318, 322`.

External references:

- `system/workflows/arc-extensions.md:113` — in-prose link inside pre-merge-review extension contract ("use the
  [review-triage method] for classification")
- `system/workflows/arc-extensions.md:121` — in-step link
- `system/workflows/arc-extensions.md:171` — reference-def
- `system/workflows/project/agent-pre-merge-review.md:8` — in-prose link ("[review-triage method]... which governs
  finding classification")
- `system/workflows/project/agent-pre-merge-review.md:36` — in-step link ("Work through findings sequentially using the
  [review-triage method]")
- `system/workflows/project/agent-pre-merge-review.md:44` — prose ("message per the review-triage method's documentation
  format")
- `system/workflows/project/agent-pre-merge-review.md:78` — in-step link
- `system/workflows/project/agent-pre-merge-review.md:92` — prose ("Document dispositions per the [review-triage
  method]")
- `system/workflows/project/agent-pre-merge-review.md:231` — reference-def
- `system/workflows/arc/work-unit-lifecycle/integrate-work-unit.md:34` — method dependency bullet link
- `system/workflows/arc/work-unit-lifecycle/integrate-work-unit.md:187` — in-step link (pre-merge-review step, finding
  classification)
- `system/workflows/arc/work-unit-lifecycle/integrate-work-unit.md:235` — in-step link (PR/review-comment workflow)
- `system/workflows/arc/work-unit-lifecycle/integrate-work-unit.md:348` — reference-def
- `reference/strategies/arc/strategy-session-operations.md:164` — method classification table row

#### quality-gate-commands

Self: `system/workflows/arc-methods.md:31, 49, 368, 374, 378`.

External references:

- `system/agent/AGENT-BRIEFING.ARC.md:27` — prose ("defined in DEV-RULES.PROJECT and referenced via the
  quality-gate-commands method")
- `reference/constitution/DEV-RULES.ARC.md:345` — prose in § When to Load Additional Guidance (shared line with
  issue-triage)
- `system/workflows/arc/session-lifecycle/session-init.md:247` — prose in Item 11 body (shared line with issue-triage)
- `system/workflows/arc/3_process-task-loop.md:17` — method dependency bullet link
- `system/workflows/arc/3_process-task-loop.md:62` — in-step link ("using the [quality-gate-commands method]")
- `system/workflows/arc/3_process-task-loop.md:63` — prose continuation ("Tier 1 (per-task): quality-gate-commands on
  modified files only...")
- `system/workflows/arc/3_process-task-loop.md:139` — in-step link (Tier 2)
- `system/workflows/arc/3_process-task-loop.md:152` — prose in pre-report checklist ("per quality-gate-commands method")
- `system/workflows/arc/3_process-task-loop.md:263` — reference-def
- `reference/strategies/arc/strategy-session-operations.md:159` — method classification table row

### Extensions

#### post-task-quality

Self: `system/workflows/arc-extensions.md:19, 30, 39`.

External references:

- `system/workflows/arc/3_process-task-loop.md:69` — in-step link wrapped in the structural "If [post-task-quality
  extensions] are configured, execute them before proceeding" pattern
- `system/workflows/arc/3_process-task-loop.md:70` — continuation referencing § anchor
- `system/workflows/arc/3_process-task-loop.md:257` — reference-def
- `system/workflows/arc/supplemental/integrate-external-content.md:89` — prose example
- `reference/strategies/arc/strategy-session-operations.md:61` — prose ("arc-extensions steps (post-task-quality,
  pre-merge-review, etc.)")
- `reference/strategies/arc/strategy-session-operations.md:170` — prose ("The process-task-loop checks
  `post-task-quality` after task completion")
- `reference/strategies/arc/strategy-configurability-architecture.md:276` — in-prose link in adopter walkthrough
  ("**Extensions** · `#post-task-quality`: If [post-task-quality extensions]...")

#### post-unit-quality

Self: `system/workflows/arc-extensions.md:20, 45, 53`.

External references:

- `system/workflows/arc/3_process-task-loop.md:140` — in-step link wrapped in the structural "If... configured, execute
  them" pattern
- `system/workflows/arc/3_process-task-loop.md:141` — continuation referencing § anchor
- `system/workflows/arc/3_process-task-loop.md:259` — reference-def

No strategy-file references.

#### post-task-completion

Self: `system/workflows/arc-extensions.md:21, 59, 68`.

External references:

- `system/workflows/arc/3_process-task-loop.md:84` — in-step link wrapped in the structural "If... configured, execute
  them now" pattern
- `system/workflows/arc/3_process-task-loop.md:87` — continuation prose with link to § anchor
- `system/workflows/arc/3_process-task-loop.md:258` — reference-def
- `reference/strategies/arc/strategy-team-coordination.md:328` — prose in § External Tracker Integration
  ("`post-task-completion` — fires after a task is marked `[x]`. Use to sync task status...")
- `reference/strategies/arc/strategy-configurability-architecture.md:92` — table cell ("Extension — add tracker sync via
  post-task-completion")

#### post-context-load

Self: `system/workflows/arc-extensions.md:22, 74, 82`.

External references:

- `system/workflows/arc/session-lifecycle/session-init.md:254` — section heading
  `### 3. Post-Context-Load Extensions · \`#post-context-load\``
- `system/workflows/arc/session-lifecycle/session-init.md:256` — in-step link ("If the `post-context-load` section in
  [`arc-extensions.md`] has steps...")
- `system/workflows/arc/session-lifecycle/session-init.md:260` — "See: [`arc-extensions.md` § post-context-load]"
  continuation
- `system/workflows/arc/session-lifecycle/session-init.md:436` — reference-def
- `system/workflows/arc/supplemental/integrate-external-content.md:89` — prose example

No strategy-file references.

#### pre-stage-review

Self: `system/workflows/arc-extensions.md:23, 88, 95`.

External references:

- `system/workflows/arc/supplemental/prepare-commits.md:34` — in-step link inside the structural "Pre-stage review
  extensions · `#pre-stage-review`: If [pre-stage-review extensions] are configured..." pattern
- `system/workflows/arc/supplemental/prepare-commits.md:154` — reference-def

No strategy-file references.

#### pre-merge-review (extension)

Self: `system/workflows/arc-extensions.md:24, 101, 103, 106, 116`.

External references:

- `system/workflows/arc/work-unit-lifecycle/integrate-work-unit.md:188` — in-step link inside the structural "If
  [pre-merge-review extensions] are configured, execute them" pattern (immediately after the pre-merge-review method
  step at :186)
- `system/workflows/arc/work-unit-lifecycle/integrate-work-unit.md:350` — reference-def
- `system/workflows/arc-extensions.md:172` — reference-def inside arc-extensions.md (cross-ref between method ↔
  extension)
- `system/workflows/project/agent-pre-merge-review.md:6, 7, 232` — project workflow file that populates this extension
  point ("populates the `pre-merge-review` extension point")
- `system/workflows/arc/supplemental/integrate-external-content.md:89` — prose example
- `reference/strategies/arc/strategy-session-operations.md:61` — prose (shared line with post-task-quality, ambiguous
  method/extension)

(Lines 163, 171 in strategy-session-operations.md attribute to the method side; :61 is the only extension-side strategy
prose.)

#### post-work-unit-activate

Self: `system/workflows/arc-extensions.md:25, 134, 144`.

External references:

- `system/workflows/arc/work-unit-lifecycle/activate-work-unit.md:151` — section heading
  `### Step 6: Post-Activation Extensions · \`#post-work-unit-activate\``
- `system/workflows/arc/work-unit-lifecycle/activate-work-unit.md:153` — in-step link inside the structural "If
  [post-work-unit-activate extensions] are configured, execute them now" pattern
- `system/workflows/arc/work-unit-lifecycle/activate-work-unit.md:155` — "See: [`arc-extensions.md` §
  post-work-unit-activate]" continuation
- `system/workflows/arc/work-unit-lifecycle/activate-work-unit.md:183` — in-step reminder link ("If
  [post-work-unit-activate extensions] produced additional changes, stage...")
- `system/workflows/arc/work-unit-lifecycle/activate-work-unit.md:226` — reference-def
- `reference/strategies/arc/strategy-team-coordination.md:330` — prose in § External Tracker Integration

#### post-work-unit-archive

Self: `system/workflows/arc-extensions.md:26, 150, 160`.

External references:

- `system/workflows/arc/work-unit-lifecycle/archive-work-unit.md:163` — section heading
  `### 6) Post-Archival Extensions · \`#post-work-unit-archive\``
- `system/workflows/arc/work-unit-lifecycle/archive-work-unit.md:165` — in-step link inside the structural "If...
  configured, execute them now" pattern
- `system/workflows/arc/work-unit-lifecycle/archive-work-unit.md:167` — "See:" continuation
- `system/workflows/arc/work-unit-lifecycle/archive-work-unit.md:177` — in-step reminder link
- `system/workflows/arc/work-unit-lifecycle/archive-work-unit.md:269` — reference-def
- `system/workflows/arc/work-unit-lifecycle/planning/integrate-planning-branch.md:42` — prose ("via
  [post-work-unit-archive extensions]")
- `system/workflows/arc/work-unit-lifecycle/planning/integrate-planning-branch.md:147` — reference-def
- `reference/strategies/arc/strategy-team-coordination.md:332` — prose in § External Tracker Integration

### Observations flagged for 1.1.b

- **post-unit-quality, post-context-load, pre-stage-review** have no strategy or constitution references at all — only
  their single workflow trigger point plus self-definition. 1.1.b's reliable-trigger test is the main signal here; if
  any fails, the extension has exactly one or zero reliable triggers.
- **strategy-session-operations.md:61** bundles `post-task-quality, pre-merge-review, etc.` as a prose illustration, not
  a trigger. Listed under both extensions for completeness but should classify the same way (informational, not a
  trigger).
- **strategy-session-operations.md:22** (session-state) is a false match on the section-heading anchor
  `#session-state-portability` — flagged so 1.1.b drops it.
- **agent-pre-merge-review.md** (project workflow) is the downstream consumer of `pre-merge-review` extension. Its own
  references to `review-triage` are the primary triggers for that method during the extension's execution.
- **Strategy classification tables** (`strategy-session-operations.md:158–165`) are method-catalog rows documenting
  trigger workflows, not triggers themselves. Expect 1.1.b to classify them as informational.
- **DEV-RULES.ARC.md:345–348** is the § When to Load Additional Guidance summary bullet — references methods by name
  inside prose describing where the method-dependencies blocks live. Informational, not a trigger.

---

## Phase 1 Classification (Task 1.1.b)

**Rubric applied:**

- **Reliable (method):** positioned at an action step in a reachable workflow, with declarative/imperative framing (no
  `if applicable`, `unless already loaded`, `when relevant`), and using markdown-link form (reference-style or inline)
  pointing at the method.
- **Reliable (extension):** action step plus markdown-link form. The `If [X extensions] are configured, execute them`
  wrapper is _structurally valid_ (not hedged) — extensions are conditional by mechanism.
- **Hedged:** otherwise-reliable shape with a weakener phrase.
- **Unreachable:** action step in a workflow that cannot be reached from session-init or process-task-loop (i.e., orphan
  workflow).
- **Informational:** not a trigger. TOC/index entries, Related-methods and classification tables, section headings,
  reference-definitions, self definition headings, `See: …` pointers, and prose mentions that describe behavior without
  directing a load. Also: references in non-workflow files (`reference/constitution/`, `reference/strategies/`,
  `system/agent/`) by strict reading of the "reachable workflow" criterion.
- **File-level general mentions** (DEV-RULES referencing `arc-methods.md` as a concept without anchor) — per task spec,
  not flagged in Phase 1; left for Phase 3.6 to resolve against the new `system/methods/` directory structure.

**Method-dependencies blocks** (e.g., `3_process-task-loop.md:16–18`, `prepare-commits.md:14–15`,
`integrate-work-unit.md:33–34`, `session-handoff.md:19`) are classified as **reliable**. The block preamble ("load on
first reference") is an imperative directive; each bullet is a targeted markdown-link that satisfies all three criteria.

### Methods — classification summary

| Method                    | Reliable triggers (count) | Hedged | Unreachable | Verdict |
| ------------------------- | ------------------------- | ------ | ----------- | ------- |
| commit-format             | 3                         | 0      | 0           | PASS    |
| commit-context-format     | 3                         | 0      | 0           | PASS    |
| issue-triage              | 2                         | 0      | 0           | PASS    |
| test-first                | 3                         | 0      | 0           | PASS    |
| session-state             | 3                         | 0      | 0           | PASS    |
| pre-merge-review (method) | 2                         | 0      | 0           | PASS    |
| review-triage             | 7                         | 0      | 0           | PASS    |
| quality-gate-commands     | 3                         | 0      | 0           | PASS    |

**Reliable-trigger locations by method:**

- **commit-format:** `prepare-commits.md:14` (method-dep bullet), `prepare-commits.md:38` (in-step link),
  `prepare-commits.md:128` (in-step link).
- **commit-context-format:** `prepare-commits.md:15` (method-dep bullet), `prepare-commits.md:38` (in-step link),
  `prepare-commits.md:129` (in-step link).
- **issue-triage:** `3_process-task-loop.md:16` (method-dep bullet), `3_process-task-loop.md:56` (in-step link).
- **test-first:** `2_generate-tasks.md:68` (in-step link), `3_process-task-loop.md:18` (method-dep bullet —
  conditional-annotation "only when task has marker" is structural scope, not a load hedge), `3_process-task-loop.md:38`
  (in-step link).
- **session-state:** `session-init.md:57` (Step 2 preamble directive — "the document set below is the [session-state
  method] default. If your project overrides session-state, follow the override instead"), `session-handoff.md:19`
  (method-dep bullet), `session-handoff.md:44` (same preamble pattern).
- **pre-merge-review (method):** `integrate-work-unit.md:33` (method-dep bullet), `integrate-work-unit.md:186` (in-step
  "Execute the [pre-merge-review method]").
- **review-triage:** `arc-extensions.md:113`, `:121` (in-contract steps inside `pre-merge-review` extension),
  `system/workflows/project/agent-pre-merge-review.md:36, :78, :92` (in-step directives inside project review workflow),
  `integrate-work-unit.md:34` (method-dep bullet), `integrate-work-unit.md:187, :235` (in-step links).
- **quality-gate-commands:** `3_process-task-loop.md:17` (method-dep bullet), `3_process-task-loop.md:62` (Tier 1
  in-step link), `3_process-task-loop.md:139` (Tier 2 in-step link).

### Extensions — classification summary

| Extension                    | Reliable triggers (count) | Hedged | Unreachable | Verdict |
| ---------------------------- | ------------------------- | ------ | ----------- | ------- |
| post-task-quality            | 1                         | 0      | 0           | PASS    |
| post-unit-quality            | 1                         | 0      | 0           | PASS    |
| post-task-completion         | 1                         | 0      | 0           | PASS    |
| post-context-load            | 1                         | 0      | 0           | PASS    |
| pre-stage-review             | 1                         | 0      | 0           | PASS    |
| pre-merge-review (extension) | 1                         | 0      | 0           | PASS    |
| post-work-unit-activate      | 1                         | 0      | 0           | PASS    |
| post-work-unit-archive       | 1                         | 0      | 0           | PASS    |

**Reliable-trigger locations by extension** (all are the structural "If [X extensions] are configured, execute them"
wrapper at the firing workflow):

- **post-task-quality:** `3_process-task-loop.md:69`.
- **post-unit-quality:** `3_process-task-loop.md:140`.
- **post-task-completion:** `3_process-task-loop.md:84`.
- **post-context-load:** `session-init.md:256`.
- **pre-stage-review:** `prepare-commits.md:34`.
- **pre-merge-review (extension):** `integrate-work-unit.md:188`.
- **post-work-unit-activate:** `activate-work-unit.md:153`.
- **post-work-unit-archive:** `archive-work-unit.md:165`.

### Overall verdict

**All 16 methods/extensions have ≥1 reliable trigger. No flags. Task 1.1.c has no coverage gaps to fix.**

Methods carry redundancy (2–7 reliable triggers each) — typical pattern is method-dependencies manifest + in-step
link(s). Extensions carry exactly one reliable trigger each, which matches their single firing-workflow design; the
structural wrapper at the firing site is the load point and additional wrappers would be noise.

### Judgment calls recorded

These are the non-obvious classifications. None changes any verdict; all flagged here so Phase 3.6 / CI-audit design
can revisit if the rubric is tightened later.

1. **Session-init/handoff Step-preamble directives** (`session-init.md:57`, `session-handoff.md:44`) — classified as
   reliable. The preamble asserts "X is the method default. If your project overrides, follow the override instead." The
   imperative is conditional on override presence, but the load itself (to check override) is unconditional. An
   alternative strict reading could classify these as hedged on the word "if", but the if-override conditional is
   mechanism-structural, not a load hedge.

2. **Method-dependencies blocks as a class** — each bullet is classified reliable even though the block is metadata
   rather than a procedural step. Rationale: the block preamble ("load on first reference") is the imperative; the
   bullets are the targets. This doubles coverage with the in-step links but robustness is desirable here.

3. **Constitutional directives in DEV-RULES** (e.g., `DEV-RULES.ARC:140` "Assess severity via the
   \[`issue-triage`\]\[arc-methods\] method") — classified informational under strict workflow scope, even though they
   contain imperative-plus-markdown-link shape. DEV-RULES loads at session init and its rules govern behavior, so
   practically these do trigger loads; the classification reflects the rubric's "reachable workflow" scope, not
   effectiveness.

4. **Non-link prose pointers** (e.g., `integrate-work-unit.md:148` "see `arc-methods.md` § commit-context-format") —
   informational. Fails the markdown-link-form criterion. Phase 3.6 may relink these as part of the `system/methods/`
   path-encoded conformance sweep.

5. **Strategy classification tables** (`strategy-session-operations.md:158–165`) — informational. They document where
   triggers live rather than firing them.

6. **`strategy-session-operations.md:22`** (session-state catalog entry) — dropped from the classification as a false
   regex match on the anchor `#session-state-portability`.

7. **Agent-pre-merge-review overview prose** (`agent-pre-merge-review.md:6–7` for `pre-merge-review` extension; `:8` for
   `review-triage` method) — informational. Markdown-link form is present but the sentences are preamble describing what
   the workflow does, not action steps. The in-step directives at `:36`, `:78`, `:92` cover the reliable-trigger role
   for `review-triage`.

8. **Session-init Item-11 prose** (`session-init.md:247–248`) — informational. The sentence describes what the
   task-execution workflow contains; the actual triggers live inside that workflow.

9. **Extension late-step reminders** (`activate-work-unit.md:183`, `archive-work-unit.md:177`) — informational. They
   reference the extension conditionally based on whether it already ran earlier in the workflow, not as a load trigger.

### Downstream implications

- **Task 1.1.c (fix coverage gaps):** no gaps to fix. Proceed directly to Task 1.2 once 1.1 is closed.
- **Phase 3.6 (cross-reference sweep):** the informational-tier references (constitution, strategies, agent) will need
  per-path relinking to the new `system/methods/` and `system/extensions/` directories. The `integrate-work-unit.md:148`
  plain-prose pointer and the `strategy-configurability-architecture.md:318–319` example-walkthrough links are the ones
  most likely to need tightening.
- **CI audit (now Task 1.5 after Phase 1 restructure):** reads YAML frontmatter only — no prose-grep, no anchor
  disambiguation. Enumerates entities from per-file filenames (`system/methods/*.md`, `system/extensions/*.md`; excludes
  `README.md`) after Phase 1 Task 1.4 establishes the per-file structure, and builds coverage from each workflow's
  `arc.methods` / `arc.extensions` frontmatter arrays. Pass-condition is still ≥1 reliable trigger per method/extension;
  reliability is now guaranteed structurally by the frontmatter contract rather than the prose-reliability classification
  from Task 1.1.b. Method and extension coverage maps are tracked independently (defensive invariant — the historical
  `pre-merge-review` name collision is resolved by renaming the method to `diff-review` in Task 1.4.a, but the
  independent-maps invariant stays in place against future collisions).

## Phase 2 Decisions

### Task 2.2 — AGENT-BRIEFING.ARC cross-reference: no edit

**Decision:** Do not add a cross-reference to the new "Method and extension loading" rule in
`AGENT-BRIEFING.ARC.md`. The rule lives only in DEV-RULES.ARC § Verification and Discovery.

**Rationale:**

- **Separation of concerns.** AGENT-BRIEFING.ARC currently holds framework orientation (how ARC
  works) — not behavioral rules. DEV-RULES is the authoritative home for behavioral rules. Adding
  one cross-reference invites future bloat (why not the other verification rules too?) and erodes
  the separation that makes both docs legible.
- **Position doesn't change compliance.** Both files are in session-init Batch 1, read before
  the task list and workflows. Earlier position in AGENT-BRIEFING would surface the rule
  marginally sooner in context, but the rule's trigger fires during task execution ("when a
  workflow step references X"), not at init-read. Agents store at init; they act at execution.
  Marginal primacy gain is not worth duplication cost.
- **Single source of truth.** Two T1 homes carry drift risk. Colocating the rule with its
  peers in DEV-RULES § Verification and Discovery ("Verify before assuming", "Consult strategy
  guidance") provides structural context — the rule is read alongside adjacent verification
  behaviors, which is more valuable than isolated earlier surfacing.

**Implementing agent perspective (recorded during implementation):** From an init-reader
standpoint, the DEV-RULES subsection is sufficient. The rule is concrete and actionable at
workflow-step execution; there's no operational benefit to seeing it twice at init.

---

## Phase 3.R Second-Pass Decisions

### Task 3.R.k — Command surface cleanup + probe-pattern extension (pre-implementation audit)

**Origin:** Pre-implementation audit of 3.R.k surfaced five design decisions that the original
task shape masked. Resolved in a series of iterations with the user; final shape captured here
for the implementing session.

**Wire format — hybrid `--session-init` + `--json`.**

The 3.R.e.1 precedent (`arc user status --session-init`) emitted human-readable Clack only. The
harness parsed rendered markdown. That's fragile at scale and asymmetric once multiple probes
exist. Resolved: `--session-init` is a scope flag, `--json` is a format flag, both orthogonal
and composable. Default (no-flag) = Clack. The session-init harness calls
`arc status --session-init --json` for a typed wire contract. `arc user status` retrofit to
accept `--json` in the same pass so no first-mover is grandfathered.

**Dropped: `arc methods status` probe.**

The original 3.R.k.b was "enumerate methods with `override-active: true`." Session-init does
not inspect method override state at init time — methods load at workflow trigger, not at init.
The proposed 3.R.k.d session-init integration step had no "init-time method-inspection
language" to replace. Consumer-less probe; dropped. If a future consumer emerges, add then.

**Shared lib for extensions scan.**

`arc extensions status --all` and Task 4.6 (D7b pre-commit hook) would each implement the
same scan: find extension-point references (` · `#name` `) in workflow files and
cross-reference against the extensions directory. Resolved: shared lib
`src/lib/extensions/{point-scanner,orphan-detector}.ts`. 3.R.k.b ships the lib; 4.6 consumes.
Detector takes an explicit file list — probe scans all workflows, hook scans staged only.

**Composite `arc status` command.**

Two probes + the user-status retrofit = three potential orchestration calls at session-init.
Discussed: speed savings are near-zero (process-startup parallelizes at OS level), but the UX
win for a human watching session-init execute is real — one tool call in the trace vs. three.
Forward compat is also real — future probes slot into the composite without session-init
workflow prose changes. Resolved: ship the composite at `arc status`, which requires renaming
the existing `arc status` (install health) to `arc health` (3.R.k.a).

**Rename hosting — SIO not Rebrand.**

The `arc status` → `arc health` rename was originally scoped in the ARCd Rebrand WU (Task 1.5)
as "absorbed Operating Modes CLI command cleanup." The rename's motivation is `/arc-status`
skill collision plus semantic hygiene — both session-init/orientation concerns, not binary
rebrand concerns. With SIO already touching the CLI status-command surface for the probe work,
co-located edits are cheaper than two-step rename coordination. Resolved: transplant subtasks
1.5.a, .b, .c, .e, .f to SIO as 3.R.k.a. Task 1.5.d (`arcd version` subcommand) stays in the
rebrand WU as rebrand-era idiom alignment. Rebrand's follow-on `arc health` → `arcd health`
rename is absorbed into its global `arc` → `arcd` binary sweep with no dedicated subtask.

**`arc active` naming.**

Considered: `arc work-units`, `arc wu`, or unification under an `arc inspect` umbrella. Kept
`arc active` because `.arc/active/` houses WUs as bundles of co-named files (prd/notes/atomic/
tasks/status), and `arc active status` = "for each in-flight WU, show its state marker"
parallels `arc user status` (sync state of the user bundle). Directory and command agree on
scope; no rename cost.

**`arc active status` full-mode output contract — `**State:**` field verbatim.**

Future `/arc-status` skill (see `plan-arc-modes.md`) needs paused/waiting-for visibility. If
`arc active status` in full mode filtered to in-progress WUs, the skill would duplicate the
scan. Resolved: full mode returns all WUs with the `**State:**` field value populated verbatim
(In Progress / Paused / Waiting-For / etc.); consumers filter client-side. `--session-init`
mode keeps its narrow shape for harness use.

**Composite command design.**

- Parallel invocation of three probe helpers via `Promise.all`
- Typed composite result (`StatusResult` full; `SessionInitProbeResult` scoped)
- Per-probe error isolation: one probe's failure becomes a typed error field in its slot;
  other probes unaffected; process exit code 0 (individual errors surfaced via result shape,
  not via exit — session-init decides what to do)
- Extensible slot: `arc hooks status` or any future probe drops into the Promise.all without
  session-init workflow changes. In the post-rebrand world, the composite becomes
  `arcd status` via the global binary sweep

**arc-config probe added mid-WU.**

`arc-config.yml` was not initially considered for probe treatment. Reviewing what session-init
actually consumes from the file: ~85% of the 170 lines are inline comments documenting each
setting for human editors — the agent reads key-value pairs only. Moving to a typed probe
replaces the whole-file read with ~10 JSON fields (full scope) or ~5 (session-init scope).
`hooks.*` excluded entirely since those are shell-consumed by git hooks, not by the agent.
Named `config` to pair with the directory/command naming already established (`arc user`,
`arc extensions`, `arc active`). The composite's existing identity/role slot — originally
named `config` in 3.R.k.d's spec — renames to `identity` to free the `config` slot for the
arc-config probe result. Pattern: probe module per concern, inline reads only for trivially
cheap scoped lookups (identity/role = two `git config` calls).

**Session-init ordering review (3.R.k.g).**

Surfaced while planning the arc-config probe: session-init.md Step 1.5 precedes Step 2 but
its content references "After Batch 1 resolves `{identity}`" — Batch 1 fires inside Step 2.
The workflow patches this via prose, so the reader reconstructs the real order. Separately,
the "pull before the 'Proceed to Next Action?' prompt" language allows a user pull to run
after Batch 2 has already loaded stale SESSION-NOTES — no guarantee Batch 2 sees fresh
content post-pull. 3.R.k.g runs last (after all probes + composite integration land) so the
restructure operates on the final command surface, not intermediate states. Scope is limited
to ordering; Phase 5 owns the deeper load-set restructure.

### Subtask structure (final)

- **3.R.k.a** — `arc status` → `arc health` rename (prerequisite for the composite slot)
- **3.R.k.b** — `arc extensions status` probe + shared `lib/extensions/` + `arc user status --json` retrofit
- **3.R.k.c** — `arc config status` probe
- **3.R.k.d** — `arc active status` probe
- **3.R.k.e** — composite `arc status` command
- **3.R.k.f** — session-init workflow integration + `strategy-session-operations.md` probe-pattern section
- **3.R.k.g** — session-init ordering review + workflow reorder

### Coordinated edits (2026-04-22 pre-implementation pass)

- `tasks-arcd-rebrand.md` Task 1.5 slimmed to just the `arcd version` subcommand concern; rename
  subtasks transplanted here
- `prd-arcd-rebrand.md` goals bullet + R14/R16 reframed; callout added above § CLI command
  surface cleanup
- `plan-arc-modes.md` naming note (line ~4509) + Shift Lifecycle CLI naming coordination row
  updated to reflect two-step rename path

No rebrand tasks beyond Task 1.5 needed editing — the global `arc` → `arcd` sweep naturally
covers the follow-on `arc health` → `arcd health` without special handling.

## Phase 4 Audit Methodology

Lens applied across Phase 4 audit tasks (4.2 / 4.3 / 4.5). Branches by file classification:

- **Framework files** (agent-only or dual-audience): carry the agent-audience trim lens. For
  strictly agent-loaded files, drop inline `[TODO-docs-site]` placeholders (the docs-content-sweep
  WU finds extractions via staging entry Source ranges). For dual-audience files (contributor
  briefing, DEV-RULES.ARC), keep placeholders. Full rules in Task 4.2.a outcome notes.
- **Project-level / configurable files**: three outcomes only — **drop**, **tighten-in-place**,
  or **relocate to a project-level strategy**. NO `notes-docs-content-sweep.md` staging (docs
  site serves adopters, not this repo's project specifics); NO `[TODO-docs-site]` placeholders.
  For configurable files (template-rendered), audit is two-pass: `.arc/` trim for project-specific
  content plus package template edits for framework-template quality. Full rules in Task 4.2.c /
  4.2.d outcome notes.

**Opportunistic slash-syntax cleanup:** Fix slash-form skill references (`/arc-resume`,
`/arc-handoff`) to bare skill names (`arc-resume`, `arc-handoff`) when 4.2 / 4.3 / 4.5 audits
touch a file containing them. Skill names are framework-canonical; the slash form is Claude
Code-specific (Codex uses `$`, other agents may differ — name the skill, not the invocation
syntax). The `atomic-session-init-optimization.md` entry tracks the broader sweep
(~15 references across live framework docs); opportunistic during audits, atomic cleanup pass
after Phase 4 closes catches stragglers. AGENT-BRIEFING.ARC.md (Task 4.2.a) establishes the
canonical phrasing pattern — skill name + optional "(invocation syntax is agent-specific)" hint
when first introduced in a file.

**Canonical post-trim examples** (reference these when audit decisions arise on similar files):

- `AGENT-BRIEFING.ARC.md` (Task 4.2.a, commit `c221e0b`) — agent-audience trim lens.
- `DEV-RULES.ARC.md` (Task 4.2.b, commit `3af38d5`) — surgical trim on tight baseline with
  P-annotation strip + `[configurable]` retention.
- `DEV-RULES.PROJECT.md` (Task 4.2.c, commit `a70bc48`) — project-level lens, whole-section drops
  plus relocation to project strategy.
- `QUICK-REFERENCE.md` + `.template.md` (Task 4.2.d, commit `a70bc48`) — configurable two-pass
  with template enhancement via `arc:if platform.type != github`.
- `session-init.md` + `.template.md` (Task 4.2.e, commit `39a0c72`) — configurable two-pass with
  E1 relocation to live strategy (`strategy-session-operations.md`) in lieu of docs-sweep
  staging; demonstrates "operational recovery needs runtime reach" carve-out from the default
  extraction pattern.
- `template-status.md` + `STRATEGY-INDEX.md` + `arc-config.yml` (Task 4.2.f, commit `647fcc6`) —
  project-level lens on framework-shipped cluster. STRATEGY-INDEX demonstrates Configurable
  two-pass with intentional `.arc/` § Project Strategies divergence (verified via
  `strategy-file-classification.md` — three-way-merge is the designed pattern).
  `template-status.md` demonstrates skeleton-cost multiplier (propagates into every WU status
  file × every session) justifying aggressive drop plus relocation of the State enum to
  `strategy-work-organization.md § Work Unit State`. `arc-config.yml` demonstrates
  audit-with-no-material-change outcome — comments were interface docs, not rationale bloat
  (3.R already removed load-cost pressure).

## Phase 5.0 Worktree-Sync Research (external research, 2026-04-23)

**Context:** Validated planned UX for worktree-sync detection at session-init before drafting
Task 5.0. See tasks-session-init-optimization.md § Phase 5 Task 5.0 for the implementation
scope this shaped. The original Task 5.0 scope in Phase 5 (worktree + notes) was partially
pulled forward as Phase 3.R.e (notes only) during multi-machine dogfooding; this research
grounded the revived worktree half.

### Key findings validating the plan

- **Opt-in master gate is idiomatic.** Tools that default to auto-fetch (GitHub Desktop,
  GitKraken 60s cadence) accumulate trust complaints; VS Code shipped `git.autofetch: false`
  by default after user pushback. Our `session.remote_sync: enabled` (explicit opt-in) sits
  in the trust-building regime.
- **No mainstream tool auto-pulls the checked-out branch on startup.** Fetch-only is the
  universal pattern (VS Code git extension, JetBrains IDEs, GitHub Desktop, GitKraken, Fork).
  Auto-pull exists only as third-party add-ons (e.g. curet-dev/auto-pull for VS Code), and
  even those warn on uncommitted changes. Justifies excluding `always` mode for worktree.
- **Git's native vocabulary is the lingua franca.** `clean | ahead | behind | diverged`
  from `git status` is internalized across the ecosystem. No need to invent terms.
- **Default `prompt` is the Goldilocks zone.** Tools that default to always auto-sync either
  run slow cadence (JetBrains 20min, low-friction) or accumulate complaints (GitHub Desktop
  60s). Per-session prompt matches user trust expectations without alert fatigue.
- **Combined dual-ref prompt is novel but better than sequential.** No direct analog (git
  submodules sequence but don't combine; package managers don't expose multi-ref UX), but
  research recommended combining when contextual framing is clear.

### Key findings that shaped design decisions

- **Bounded fetch timeout required.** Blocking tool startup on network I/O is universally
  reviled (GitHub Desktop and VS Code both have issue threads on this). Selected 3s default
  with `remote-unavailable` state on timeout; session-init continues rather than blocks.
- **Context-rich prompts preferred over terse.** Industry pattern: "behind by N commits"
  phrasing (GitHub Desktop) beats "Sync?" (vague). Drove the decision to surface ahead/behind
  counts per channel in the combined prompt.
- **Dirty-tree safeguard is non-negotiable.** Fast-forward pull refuses on dirty tree;
  autostash introduces its own footguns (pre-commit/pre-commit#1787: hook rewrites conflict
  with stashed changes, silent failure). Drove the no-auto-stash decision; explicit prompt
  warning when dirty.
- **Hook side effects deserve documentation.** Auto-pull can trigger post-merge hooks with
  side effects (CI webhooks, notifications, linters). Documented for the `always` mode on
  the notes channel (worktree has no `always` mode, so N/A there).
- **Force-push-with-lease footgun from auto-fetch.** VS Code issue #23951 documented that
  silent autofetch changes the local view of `refs/remotes/origin/*` without user knowledge,
  making `--force-with-lease` unsafe. Reinforced the decision to keep fetches on explicit
  session-init boundaries, not periodic background intervals.

### Sources

- VS Code `git.autofetch` disabled-by-default decision — microsoft/vscode#8469, #34684
- VS Code autofetch safety of `--force-with-lease` — microsoft/vscode#23951
- GitHub Desktop auto-fetch complaints — desktop/desktop#13070, #1128, #8167, #8401, #10687,
  #12527
- JetBrains auto-fetch default (20-minute cadence, fetch-only) — JetBrains IDE docs
- Git `pull.rebase` + `autostash` hook footguns — pre-commit/pre-commit#1787
- Package-manager analogs (lockfile staleness): Bundler transparent auto-sync, pnpm
  `--frozen-lockfile`, Cargo lockfile generation on build
- Git submodule sequencing pattern (no combined UX) — git-scm docs
- VS Code third-party auto-pull extension — curet-dev/auto-pull (warns on uncommitted
  changes)

### Anti-patterns explicitly avoided

- **Vague prompts** ("Sync?" without context) — ours show ahead/behind counts per channel
- **Prompts when no action is needed** — ours skip on `clean`, `no-upstream`, `no-remote`,
  `detached-head`
- **Silent failures** — ours surface `remote-unavailable` and `diverged` as explicit states
- **Settings that don't work** — two-copy config sync + explicit validation catch this
  (GitHub Desktop issue #12527 is the canonical failure mode)
- **Periodic background fetches** — ours run at session-init boundary only; no timer

## Phase 5 Partial-Read Design Decisions

### Task 5.1 — QUICK-REFERENCE load contract: hybrid strategy-index-style awareness

**Context:** Pre-implementation audit (`/arc-task-audit 5.1–5.5`, 2026-04-25) surfaced an unexposed
assumption in 5.1's verification step ("verify callers load on demand"): unlike methods/extensions
post-Phase 1, QUICK-REFERENCE has no structural trigger contract. Existing references are inline
prose pointers (`rotate-branch.md:42` "see QUICK-REFERENCE § Platform Commands";
`integrate-planning-branch.md:75`, `deactivate-work-unit.md:58`, `session-handoff.md:266`,
`integrate-external-content.md:106`). With no structural declaration mechanism for QUICK-REFERENCE
sections, "verify callers load on demand" reduces to confirming prose pointers exist and trusting
agents to follow them.

**Three options evaluated:**

- **(A) Structural triggers analogous to Phase 1 (`arc.references` frontmatter, CI audit, etc.).**
  Rejected as overkill. Methods/extensions earn declaration contracts because workflows must inject
  behavior at deterministic points — the agent can't substitute prose for "run the
  quality-gate-commands method." QUICK-REFERENCE is reference material consulted ad-hoc, not behavior
  driving workflow steps. Audit/enforcement infrastructure heavier than the surface it polices
  (4 deferred sections, ~5 workflow callers).
- **(B) Strategy-index-style awareness (separate index file, defer rest).** Rejected in pure form.
  STRATEGY-INDEX exists because strategies are domain bodies the agent might not know to look for.
  QUICK-REFERENCE doesn't need a separate index — workflows that need a section already name it
  inline ("see QUICK-REFERENCE § Platform Commands"). The prose pointer _is_ the index entry,
  delivered at the moment it's relevant.
- **(C) Full-load with content tightening.** Rejected. Template (`QUICK-REFERENCE.template.md`) is
  already clean and tech-stack-agnostic — verified during audit, no backwards-sync from `.arc/`
  populated content. Tightening the populated `.arc/` copy alone delivers minimal value if the
  whole thing isn't always loaded; tightening framework-wide value lives in the template, which
  is already minimal.

**Selected: hybrid favoring (B) without a separate index file.**

- Always-load: `## Environment & Path Context` only (subsumes `### Runtime Environment` H3).
  Foundational orientation: repo root, .arc/ vs. packages/ split, "all commands from repo root."
  ~30 lines, low token cost, genuinely needed every session.
- On-demand: `Command Patterns`, `Quality Gate Commands`, `ARC CLI Commands`, `npm Publishing` —
  load when workflow prose pointers fire.
- Awareness surface: one-line note in `## Environment & Path Context` listing the deferred sections
  by name. Replaces a separate index entry — agent learns "these other sections exist and load on
  demand" inside the always-loaded slice.
- No CI audit, no per-section frontmatter, no `arc.references` declaration. Verification (5.1.c)
  reduces to a concrete grep-and-promote pass on existing prose pointers.

**Implications:**

- Template structural alignment (5.1.b): awareness note added to template; Tier 2 example slot
  added to `## Quality Gate Commands` (currently asymmetric T1 + T3). Project copy syncs structure;
  populated commands stay project-specific. Post-alignment, structural shape matches across both
  copies but content depth diverges by design.
- Pre-existing edge case captured to ATOMIC-INBOX: `## Platform Commands` is conditionally rendered
  (`platform.type != github`); workflow prose pointers fire into a non-existent section for default
  GitHub adopters. Orthogonal to 5.1 scope — captured as separate triage item.
- 5.1's verification step becomes falsifiable: "every workflow-tree mention of QUICK-REFERENCE
  either inlines the relevant content or names the section to load on demand."

### Task 5.3 — Preamble boundary contract

**Context:** Original task description specified "current phase preamble" as a load target without
defining the boundary. Phase entries shaped `### **Phase N:** ...\n\n**Purpose:** ...\n\n[other
framing]\n\n- [ ] **N.M ...**` — multi-paragraph preambles common (e.g., Phase 5 has Design
decisions block + Two-copy sync convention block before tasks).

**Contract chosen:** Preamble = lines from the `### **Phase N:**` heading through the line
immediately before the first `- [ ]` or `- [x]` bullet under that phase. All multi-paragraph
framing (Purpose, Design decisions, Rationale blocks) included; task entries themselves not.
Mechanical boundary, no judgment required.

### Task 5.5 — Capture Routing candidate location

**Drift fix:** Original 5.5.a candidate list cited "DEV-RULES.ARC § Capture Routing" — that section
doesn't exist in DEV-RULES.ARC. The routing-related content lives in two places: DEV-RULES.ARC §
Leave it cleaner (canonical routing table, methodology rule); DEV-RULES.PROJECT § Capture Routing
(short pointer to the ARC table, project-specific PM-mode framing). Updated candidate list to name
DEV-RULES.ARC § Leave it cleaner (the routing table) — that's the substantive section worth
evaluating against the reliability bar. DEV-RULES.PROJECT § Capture Routing is too short to matter
and likely always-loaded by default.
