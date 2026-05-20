# Notes: Docs Content Sweep

**Purpose:** Staging file for content extracted from `.arc/` source files during operational-context audits.
Populated by source WUs (initial population: Session-Init Optimization, Phase 4); consumed by the
docs-content-sweep WU when `plan-docs-content-sweep.md` graduates to a PRD.

**Why a staging file:** Extractions land here as structured entries — verbatim prose plus traceability
metadata — so the sweep WU has reviewable content to absorb rather than reconstructing context from
in-repo diffs months later. Each entry is self-contained: source path, line range, the extracted prose,
advisory destination, and stylistic integration notes.

**Lifecycle:**

- **Populate:** Source WU audit subtasks add entries below the § Entries heading using the locked
  template. Append-only — preserve entry order and never reuse numbers; reviewer cross-references rely
  on stable numbering.
- **Source-side placeholder:** Each extraction leaves a `[TODO-docs-site]` reference-style link
  placeholder in the source file at the extraction site (see § Source-Side Placeholder Convention).
- **Sweep:** The docs-content-sweep WU absorbs entries into `docs/` IA, resolves all `[TODO-docs-site]`
  placeholders to final docs URLs, and archives this file when the sweep completes.

**Intended lifespan:** Until docs-content-sweep WU archives.

---

## Entry Template

Locked shape for every entry under § Entries. Mirrors the structure described in
`plan-docs-content-sweep.md` § Content Contributions.

```markdown
## Entry N — <source-basename> § <section-anchor>

**Source:** <repo-root-relative path> (lines X–Y)

**Content:**

> <verbatim prose, multi-line blockquote>

**Suggested destination:** <docs/ IA path, or "open — editorial at sweep time">

**Stylistic integration notes:** <rephrasing needs, audience shift from dual-audience `.arc/` prose to
docs-only readership, anchor IDs that must be retained for inbound link stability>
```

**Field notes:**

- **Heading:** `<source-basename>` is the file name with extension (e.g., `DEV-RULES.ARC.md`);
  `<section-anchor>` is the markdownlint slug of the source heading the extraction came from
  (e.g., `commit-discipline`). Numbering (`Entry N`) is global across this file, not per source —
  increment monotonically.
- **Source path:** repo-root-relative (e.g., `.arc/reference/constitution/DEV-RULES.ARC.md`); line range
  references the pre-trim line numbers so reviewers can compare against `git show` at the extraction
  commit. If the extraction spans non-contiguous regions of the source, file separate entries — one
  entry per contiguous extraction.
- **Content blockquote:** verbatim prose; preserve markdown formatting (lists, emphasis, code spans,
  nested fences via indentation). The blockquote is the absorption payload — the sweep WU adapts it,
  not invents from it.
- **Suggested destination:** advisory only; final IA placement is editorial at sweep time. Use the
  literal string `open — editorial at sweep time` when no specific destination is obvious.
- **Stylistic integration notes:** flag dual-audience phrasing that needs adaptation, anchor IDs that
  inbound links depend on, and any cross-references that move with the content.

## Source-Side Placeholder Convention

Every extraction leaves a `[TODO-docs-site]` reference-style link placeholder in the trimmed source
file at the extraction site. The placeholder gives readers an inline pointer for the absent material
and gives the sweep WU a single greppable anchor for every absorption point.

**Syntax:**

```markdown
See [extracted topic name][TODO-docs-site] for detailed background.
```

The link text is descriptive prose chosen by the extracting author; the reference label is always the
literal string `TODO-docs-site` (no numeric suffixes, no per-entry variants — uniqueness across the
file isn't needed because the sweep resolves them globally).

**Placement:** at the extraction site in the trimmed source — typically the sentence or paragraph that
previously introduced the now-extracted material. The placeholder doesn't replace structural elements
(headings, list scaffolding); it's an inline pointer woven into the trimmed prose.

**Definition:** add a single stub definition at the bottom of each source file that contains one or
more placeholders, alongside other reference-link definitions:

```markdown
[TODO-docs-site]: # "Placeholder pending docs-content-sweep — see notes-docs-content-sweep.md"
```

The `#` URL is a no-op anchor; the title attribute flags the reference as TBD on hover. One stub per
file serves all `[TODO-docs-site]` references within that file (DRY — multiple inline references resolve
to the same stub). The stub satisfies MD052 so the source WU's zero-tolerance markdown-lint gate stays
green during audit work, while preserving the placeholder-as-signal intent: readers see a link, hover
surfaces "pending", grep finds every absorption point, and the sweep WU has a clear write target (the
stub definition itself) when rewriting to the final docs URL.

**Completion semantics:** the docs-content-sweep WU resolves every `[TODO-docs-site]` reference to its
final docs URL by rewriting the stub definition in each file (inline references inherit automatically
because they share the label). Verification: `grep -rn "TODO-docs-site" .arc/
packages/arc-framework/arc/` returns zero matches when the sweep completes — both inline references
and stub definitions disappear in the same pass.

**Why the convention lives here, not in `plan-docs-content-sweep.md`:** the convention has two halves.
The sweep-side half (resolution semantics, IA placement) lives with the sweep workflow in
`plan-docs-content-sweep.md` § Content Contributions. The source-side half (syntax, placement, when
to leave one) lives with the staging file source authors populate — this file. Each half lives next
to the work it governs.

---

## Entries

<!-- Populated by source WU audit subtasks. Append-only; preserve numbering. -->

## Entry 1 — AGENT-BRIEFING.ARC.md § Introduction + How ARC Works

**Source:** `.arc/system/agent/AGENT-BRIEFING.ARC.md` (lines 3-29)

**Content:**

> ARC is a development methodology for human-AI collaboration. It structures how a developer
> and an AI agent work together — planning, executing, verifying, and preserving context across
> work sessions. The ARC Framework implements this methodology as markdown documents and git
> hooks that work with any agent platform.
>
> ## How ARC Works
>
> **Session lifecycle:** Sessions are bounded — each starts with initialization and ends with
> handoff. The user invokes these as skills (e.g., `/arc-resume`, `/arc-handoff`). Initialization
> loads project context from a defined document set; handoff preserves working context for the
> next session. Session state splits between the active WU's `status-{name}.md`
> (tracked, per-WU in `active/{category}/`) and SESSION-NOTES.md (personal, gitignored in
> `user/{identity}/`, portable via git notes).
>
> **Work pipeline:** Planned work follows a structured pipeline — PRD, task generation, task
> execution loop. Each task is a bounded review increment: the agent completes one, reports, and
> waits for approval before proceeding.
>
> **Methods and extensions:** ARC ships strong defaults for key behaviors (commit format,
> issue-triage, test-first, quality gate commands). Teams can override any method by populating
> its `.override` section under `system/methods/` without modifying framework files. Extensions
> under `system/extensions/` inject custom steps at defined workflow boundaries.
>
> **Quality gates:** Every task must pass quality checks before completion. Gate commands are
> project-specific — defined in DEV-RULES.PROJECT and referenced via the quality-gate-commands
> method.

**Suggested destination:** `docs/concepts/arc-overview/` — covers what-ARC-is intro plus the four
core concept areas (session lifecycle, work pipeline, configurability, quality gates) as one
unified "What is ARC" page. Could split into subpages per concept if IA prefers.

**Stylistic integration notes:** Trimmed source retains operational facts (skill names, state file
paths, pipeline phase names, `system/methods/` and `system/extensions/` paths, DEV-RULES pointers).
Extracted prose covers: the "structures how a developer and an AI agent work together" framing,
bounded-sessions model, document-set loading, working-context preservation, git-notes portability,
"one task = one review increment" rationale (also lives in DEV-RULES.ARC § Task Execution — sweep
can de-duplicate), `.override` mechanism for method customization, extension injection at workflow
boundaries, "every task must pass quality checks" reminder. Quality gates content largely duplicates
DEV-RULES.PROJECT § Quality Gates — sweep may collapse. Adapt from agent-briefing voice to
reader-facing prose; drop "ARC ships strong defaults" adopter framing. **Skill-syntax
generalization:** the verbatim above shows the original `/arc-resume` / `/arc-handoff` slash form
(Claude Code-specific). Trimmed source drops the slash to bare `arc-resume` / `arc-handoff` skill
names; docs absorption should preserve the generalization (Codex uses `$arc-resume`, other agents
may differ — name the skill, not the invocation syntax). Slash-form references remain in many
other framework docs/workflows; broader sweep tracked in `atomic-session-init-optimization.md`.
**Source has no inline `[TODO-docs-site]` placeholders:** second-pass agent-audience trim removed
the three `see [X][TODO-docs-site] for ...` pointers (intro / Session lifecycle / Methods and
extensions) plus the footer "add-agent.md" pointer because the briefing is strictly agent-targeted
— agents don't follow runtime links to docs, and the file has no human-reader role analogous to
the contributor briefing. Sweep WU finds the extraction via this entry's Source range (lines 3-29);
in-source placeholders are supererogatory for files with pure agent audience. Convention from
Task 4.1 still applies for dual-audience source files (e.g., AGENT-BRIEFING.CONTRIBUTOR.md retains
its placeholders).

## Entry 2 — AGENT-BRIEFING.CONTRIBUTOR.md § Boundaries — explanatory paragraph

**Source:** `.arc/system/agent/AGENT-BRIEFING.CONTRIBUTOR.md` (lines 20-24)

**Content:**

> **The boundary is ownership of tracked state, not the presence of WU concepts.** You may freely
> run ARC's full planning pipeline (sessions, task lists, status files, shift, handoffs) scoped to
> your personal workspace at `.arc/user/{identity}/`. Upstream's tracked `.arc/` tree provides the
> constitution, strategies, agent briefings, and workflows you need — you read them, you don't
> write to them.

**Suggested destination:** `docs/concepts/contributor-role/` § Boundaries — same docs section
that absorbs the operational Boundaries rules; this paragraph adds conceptual framing for why the
boundary is shaped the way it is.

**Stylistic integration notes:** Operational facts (`.arc/active/`/`.arc/backlog/` write
restriction, pre-commit hook warning, quality gates apply in full) stay in trimmed source.
Extracted paragraph elaborates the "ownership of tracked state" mental model and the read-vs-write
split for upstream's `.arc/` tree. Voice adaptation: shift second-person ("You may freely run")
to docs-narrative third-person ("Contributors run the pipeline scoped to their personal workspace").

## Entry 3 — AGENT-BRIEFING.CONTRIBUTOR.md § Commit Convention

**Source:** `.arc/system/agent/AGENT-BRIEFING.CONTRIBUTOR.md` (lines 30-45)

**Content:**

> ## Commit Convention
>
> Use the `Context: contribution (...)` footer with a freeform description of the change:
>
> ```text
> feat(auth): add password reset endpoint
>
> - Implements POST /api/auth/reset
> - Sends reset email via SendGrid integration
>
> Context: contribution (implement password reset per issue #42)
> ```
>
> The parenthetical is freeform — describe what the contribution addresses. The commit format
> (subject line) follows the same rules as maintainer commits (conventional commits by default,
> per [arc-config.yml][arc-config]).

**Suggested destination:** `docs/concepts/contributor-role/` § Commit Convention or
`docs/reference/contributor-commits/` — keep the worked example for readers; the briefing version
trims to a one-liner spec + pointer to the docs example.

**Stylistic integration notes:** Operational essentials (`Context: contribution (...)` footer +
freeform parenthetical + arc-config.yml pointer) stay in trimmed source. Extracted material is
the worked-example commit block — example aids readers more than agent operation. Sweep absorption
can augment with one or two additional examples (simple bug fix, multi-file refactor) to round
out the page.

## Entry 4 — AGENT-BRIEFING.CONTRIBUTOR.md § Session Workflow

**Source:** `.arc/system/agent/AGENT-BRIEFING.CONTRIBUTOR.md` (lines 47-56)

**Content:**

> ## Session Workflow
>
> **Initialization:** Loads project identity (AGENT-BRIEFING.ARC, AGENT-BRIEFING.PROJECT),
> constitutional context (DEV-RULES, QUICK-REFERENCE), and this briefing. Skips maintainer
> artifacts (upstream's status file, task list, task execution workflow). If you maintain personal
> active state under `user/{identity}/active/` (mirroring maintainer structure: `status-<name>.md`
> per in-flight contribution plus optional companion files), it is loaded automatically.
>
> **Handoff:** Writes SESSION-NOTES.md for personal context across sessions. Skips project-level
> active status file update (maintainer-managed). Your personal `active/status-<name>.md` is
> updated at handoff if you're running a full planning pipeline locally.

**Suggested destination:** `docs/concepts/contributor-role/` § Session Lifecycle — describes what
session-init.md and session-handoff.md do for contributors specifically (load set, skipped
artifacts, optional personal active-state handling).

**Stylistic integration notes:** Trimmed source replaces both paragraphs with a pointer to
session-init.md / session-handoff.md (the operational truth) plus a one-line note about optional
personal `active/status-<name>.md` loading. Extracted paragraphs duplicate behavior already
documented authoritatively in the workflow files; sweep absorption converts duplicate-restated-in-
briefing into explained-once-in-docs with cross-link to workflow files. Voice adaptation: shift
second-person ("you maintain") to third-person reader-facing prose where appropriate.

## Entry 5 — AGENT-BRIEFING.CONTRIBUTOR.md § Personal Workspace — concept + recommendation prose

**Source:** `.arc/system/agent/AGENT-BRIEFING.CONTRIBUTOR.md` (lines 60-62, 71-75, 77-84) —
three non-contiguous extractions within the Personal Workspace section, consolidated as one
thematic unit ("what the personal workspace is and how to organize it").

**Content:**

> Your `.arc/user/{identity}/` directory is a personal workspace. ARC manages reads from a defined
> set of paths inside it; everything else is yours to organize freely.
>
> **User-managed content** (freeform, any structure you want):
>
> Personal scratch notes, investigation logs, reference links, archived completed work, mirrored
> strategies, personal conventions — anything else you want to put in your workspace. ARC does not
> load, validate, or manage this content.
>
> ### Recommended convention: mirror ARC's structure
>
> If you add to your workspace beyond the framework-managed paths, follow ARC's tracked directory
> layout (`active/`, `reference/`, `reference/archive/`, etc.). This keeps your mental model
> consistent with the framework and makes graduation from informal personal use to the full
> planning pipeline natural. The recommendation is for your consistency — not for framework
> functionality. ARC cannot enforce the structure of a gitignored personal directory, and making
> that honest is more useful than pretending otherwise.

**Suggested destination:** `docs/concepts/contributor-role/` § Personal Workspace, or as a
standalone `docs/concepts/personal-workspace/` page. Pairs naturally with the Framework Read
Contract list — docs page can present "what ARC manages" alongside "what you organize freely" plus
the mirror-structure recommendation.

**Stylistic integration notes:** Operational portions (Framework-managed reads list, Guardrails
subsection) stay in trimmed source — they're the operational core needed at session load.
Extracted prose is the conceptual model of the personal workspace plus the mirror-structure
recommendation. Sweep absorption can present this as a coherent "what is the personal workspace"
page; the mirror-structure rationale ("ARC cannot enforce... making that honest is more useful
than pretending otherwise") is meta-philosophy worth keeping in docs voice. Voice adaptation:
shift second-person ("Your `.arc/user/{identity}/` directory") to third-person framing for docs.

## Entry 6 — AGENT-BRIEFING.CONTRIBUTOR.md § Running a Full Planning Pipeline Locally

**Source:** `.arc/system/agent/AGENT-BRIEFING.CONTRIBUTOR.md` (lines 93-148)

**Content:**

> ## Running a Full Planning Pipeline Locally
>
> For substantial contributions — multi-week features, multi-session work, anything that benefits
> from explicit planning — you can use ARC's full planning pipeline scoped entirely to
> `user/{identity}/`. This uses the same workflows as maintainers; they resolve paths based on
> your `arc.role` setting.
>
> ### Layout (applying the mirror-structure recommendation)
>
> ```text
> .arc/user/{identity}/
>   SESSION-NOTES.md            ← session context (handled automatically by session workflows)
>   active/
>     status-<name>.md          ← your personal work state
>     plan-<name>.md            ← plan doc (transient; subsumed by PRD at PRD-creation)
>     prd-<name>.md             ← PRD (after plan doc is promoted)
>     tasks-<name>.md           ← task list
>     notes-<name>.md           ← residual non-PRD material carried forward from planning
>     atomic-<name>.md          ← atomic companion file (optional)
> ```
>
> ### Same workflows, same ceremony as maintainers
>
> Plan docs are transient and get subsumed by PRD creation — residual material moves into the
> notes file. The PRD, task-list generation, task execution loop, session handoffs, and shift
> lifecycle all operate against your personal tree when your role is contributor. Quality gates
> apply in full — the same standards as maintainer work.
>
> ### Multiple concurrent plan docs
>
> If you are exploring several contribution ideas at once, all of the plan docs live alongside
> each other in `active/`. Concurrent planning at scale is arc-in-git's value proposition
> (dedicated `backlog/` for staging); contributor mode and other non-arc-in-git modes are
> lightweight-by-design. If flat `active/` becomes cluttered for you personally, nothing stops you
> from adding `active/planning/` as a personal convention — the framework doesn't care.
>
> ### Completion and archival
>
> When your contribution is finished and the PR is merged, there is no formal archive ceremony.
> The lightweight path:
>
> 1. Delete `user/{identity}/active/` entries for the completed work, or leave them
> 2. Move on
>
> If you want historical reference for your own completed work, mirror ARC's archive structure
> inside your workspace (`user/{identity}/reference/archive/<quarter>/<category>/`). This is a
> personal choice, not a framework requirement. `git log` with your `Context: contribution (...)`
> footers is a sufficient historical record for most contributors.
>
> ### Role transitions
>
> If you become a project maintainer, change your role between work units, not during them. Set
> `git config arc.role = maintainer` after completing your current contribution; ARC does not
> migrate in-progress contributor state into tracked project state. Finish what you're working on
> as a contributor, then promote.

**Suggested destination:** `docs/concepts/contributor-role/` § Personal Planning Pipeline, or
standalone `docs/guides/contributor-planning-pipeline/` page. Has its own section structure
(Layout, Same workflows, Multiple concurrent plan docs, Completion and archival, Role transitions)
that translates directly to docs.

**Stylistic integration notes:** Trimmed source replaces the entire section with a one-paragraph
pointer to docs (with `[TODO-docs-site]` placeholder). Operational essentials retained inline:
the bare fact that the pipeline option exists. All other content (when to use, layout, ceremony,
archival, role transitions) extracts cleanly. The Layout code block is the most operationally
useful chunk for active pipeline users — give it prominence in the docs page. Role transitions
guidance ("change your role between work units, not during them") is rarely-but-critically
applicable behavioral guidance; flag in the docs page header. Voice adaptation: second-person
reader address works well in docs as-is for a "guide" page; convert to third-person if presenting
as conceptual reference.

## Entry 7 — DEV-RULES.ARC.md § Sub-agent scope — first paragraph

**Source:** `.arc/reference/constitution/DEV-RULES.ARC.md` (lines 103-108, pre-trim)

**Content:**

> Many agent platforms support sub-agents — supplementary processes that run alongside the primary
> agent. Sub-agents are valuable for bounded, well-defined work that doesn't need to be in the
> primary context: parallel investigation, external research, token-heavy analysis that feeds
> results back for synthesis. The developer remains the continuity thread, directing the primary
> work while incorporating supplementary results.

**Suggested destination:** `docs/concepts/sub-agents/` or `docs/concepts/agent-collaboration/` §
When Sub-Agents Are Appropriate — complement to the operational rule ("task-list work stays in
primary agent") retained in DEV-RULES.ARC § Sub-agent scope. Docs page covers positive case (when
to use sub-agents); constitution covers the bounding rule (when not to).

**Stylistic integration notes:** Trimmed source retains the operational rule + inline
`[TODO-docs-site]` pointer. Extracted paragraph is methodology explanation — what sub-agents
are, what work they suit, why the developer remains continuity thread. Voice adaptation: shift
from rule-framing to explainer tone suitable for the docs audience. Agents know what sub-agents
are from their system prompt, so the "many agent platforms support sub-agents" framing is for
adopters reading the concept page fresh.

## Entry 8 — DEV-RULES.ARC.md § Context quality — session-length rationale

**Source:** `.arc/reference/constitution/DEV-RULES.ARC.md` (lines 213-216, pre-trim)

**Content:**

> Context quality degrades over session length — not just as windows fill, but as accumulated
> context pushes early guidance toward weaker retrieval positions. Focused sessions that reset
> at natural boundaries maintain higher quality than marathon sessions that technically fit in
> the window.

**Suggested destination:** `docs/concepts/session-operations/` § Session Length and Quality, or
as supporting prose on the Session Operations Strategy's public-facing docs equivalent. The
rationale explains *why* ARC prefers shorter sessions — "weaker retrieval positions" is the
evidence-based framing that differentiates this from a purely stylistic preference.

**Stylistic integration notes:** Trimmed source retains the operational rule ("Prefer shorter,
focused sessions that reset at natural boundaries") and a pointer. Extracted paragraph is the
evidence base. If the Session Operations Strategy already carries equivalent content, the sweep
may de-duplicate rather than absorb; otherwise it's standalone docs content. Voice adaptation:
unchanged (already reader-facing).

## Entry 9 — DEV-RULES.ARC.md § Write for the reader — overflow examples

**Source:** `.arc/reference/constitution/DEV-RULES.ARC.md` (lines 332-339, pre-trim) — four of
six original examples; two retained inline as canonical illustrations.

**Content:**

> - "Removed the FooBar handler" as a code comment (reader doesn't know FooBar)
> - Explaining why an item is absent from a list (reader only sees the list as it is)
> - "Plan doc retired with this PRD commit" in a notes file header — reader doesn't need the
>   workflow context; the file's existence and contents are self-explanatory
> - "Purpose: detailed rationale carved out to keep the PRD crisp" in a notes file header —
>   frames the file narrowly as author-side bookkeeping instead of the living scratchpad it is

**Suggested destination:** `docs/concepts/documentation-style/` § Reader-Hostile Patterns, or
paired with the retained principle statement on the same docs page. Docs page can carry the full
catalog of examples (retained 2 + extracted 4) without the size pressure of the constitution.

**Stylistic integration notes:** Trimmed source retains the principle + two canonical examples
(code comment "Previously this section covered X" + PR description "Next action after merge:
invoke activate-work-unit.md") + `[TODO-docs-site]` pointer to "more reader-hostile patterns."
Four extracted examples expand the catalog: code-comment variant, list-absence variant, two
notes-file header variants. The notes-file examples are particularly useful because that
context (living scratchpad vs author bookkeeping) is specific to ARC-style workflows and
worth preserving in adopter-facing docs. Voice adaptation: unchanged.

## Entry 10 — DEV-RULES.ARC.md § Preamble — P1-P11 framing + rule→principle mapping table

**Source:** `.arc/reference/constitution/DEV-RULES.ARC.md` (lines 9-17, pre-trim — preamble
paragraph) plus rule-heading annotations removed throughout the file (17 sites).

**Content:**

> Every rule traces to one of ARC's 11 principles (P1–P11). Rules marked `[configurable]` point
> to a specific override mechanism in [`arc-config.yml`][arc-config] or a file in
> [`system/methods/`][arc-methods-dir] — ARC ships a default, your team can replace it. All other
> rules are followed as stated.
>
> For the full principle definitions, see the [Philosophy][core-philosophy] docs.

Rule → Principle mapping (constructed from `· PN` annotations stripped during audit):

| Rule                                 | Principles |
|--------------------------------------|------------|
| Commit control                       | P2, P6     |
| Commit format                        | P6         |
| Atomicity                            | P6         |
| One task at a time                   | P2, P7     |
| Sub-agent scope                      | P2, P3     |
| Task granularity                     | P7         |
| Quality gate failure                 | P4         |
| Leave it cleaner                     | P4         |
| Test-first assessment                | P4         |
| Session state control                | P2, P5     |
| Context quality                      | P5         |
| Verify before assuming               | P2         |
| Consult strategy guidance            | P10        |
| Method and extension loading         | P5         |
| No meta-project references in code   | P9         |
| Task references in `.arc/` docs      | P9         |
| Write for the reader, not the author | P9         |

**Suggested destination:** `docs/reference/rule-principle-mapping/` or
`docs/methodology/principles/` § Rule Mapping — a dedicated mapping page shown alongside
principle definitions. Page shows the table with each rule as a link to its DEV-RULES.ARC anchor
and each principle linking to the Philosophy page principle section. Readers arriving from
either direction (rule or principle) can trace to the other.

**Stylistic integration notes:** Trimmed constitution no longer carries `· PN` annotations at
rule headings or the P1-P11 preamble paragraph — constitution focuses on operational rules for
the agent; the philosophical grounding lives in docs. Mapping preserves traceability without
inline restatement. The `[core-philosophy]` link was removed from DEV-RULES.ARC's link
definitions since no inline reference remained; docs page absorbs as the canonical philosophy
pointer. Configurability annotation (`· [configurable]`) retained in constitution — that's
operationally meaningful (signals override mechanism exists) rather than philosophical
traceability. Voice adaptation: mapping table is reference material; surrounding docs prose
should frame it as "these rules are grounded in ARC's principles" — the coherence signal the
adopter needs, without restating the rules themselves.

## Entry 11 — session-init.md § Design context — P5 framing + persistent-memory nuance

**Source:** `.arc/system/workflows/arc/session-lifecycle/session-init.md` (lines 20-23, pre-trim)

**Content:**

> **Design context**: Sessions implement P5 (Context Preservation) — structured document loading
> for agents with ephemeral context. Agents with persistent memory may need lighter ceremonies;
> the principle (work context must be recoverable) still applies. The session state mechanism is
> overridable via the [session-state method][arc-methods-session].

**Suggested destination:** `docs/methodology/session-model/` § Design Context or
`docs/methodology/principles/p5-context-preservation/` — framing content about why ARC treats
session-init as a structured-load moment. Pairs naturally with Entry 10's rule → principle
mapping (P5 anchor).

**Stylistic integration notes:** The trimmed workflow retains a single-sentence design context
pointing at the session-state method (the override mechanism — operationally relevant). The
absorbed content is principle-grounding rationale that serves readers learning the methodology
rather than agents executing session-init. "Agents with persistent memory may need lighter
ceremonies" is worth retaining in the docs absorption — signals ARC doesn't assume a single
agent architecture. `[arc-methods-session]` link anchor is retained in the source and resolves
to `system/methods/session-state.md`; docs absorption can reference the equivalent docs page.

## Entry 12 — session-init.md § Next work unit discovery — planning readiness enumeration

**Source:** `.arc/system/workflows/arc/session-lifecycle/session-init.md` (lines 255-259, pre-trim
— closing paragraph of § Next work unit discovery); template counterpart at
`packages/arc-framework/arc/system/workflows/arc/session-lifecycle/session-init.template.md`
(lines 278-280, pre-trim) within the `<!-- arc:if pm.mode == arc-in-git -->` branch.

**Content:**

> Planning readiness varies: a completed PRD may be ready for task generation, a draft PRD may
> need refinement, a `plan-*` doc may need development before a PRD can be created, a roadmap
> entry may have no artifacts yet, or there may be no roadmap entry at all. The agent discovers
> and reports — the user decides how to proceed.

**Suggested destination:** `docs/guides/session-init/` § Between Work Units or
`docs/methodology/planning-pipeline/` § Discovery — adopter-facing content about what to expect
when session-init runs without an active work unit. The enumeration is a useful orientation for
adopters new to the planning pipeline; it exhausts the readiness states agents may report.

**Stylistic integration notes:** Trimmed workflow retains the 4-step discovery protocol
(ROADMAP → backlog artifacts → report → propose) but no longer enumerates readiness
permutations — those are non-operational for agent execution and belong alongside
`plan-arc-modes.md` / planning-pipeline docs. Re-frame the "agent discovers / user decides"
closing for the docs audience as a principle statement rather than a behavioral restatement.

## Entry 13 — session-init.md § Context-mismatch examples — dropped illustrations

**Source:** `.arc/system/workflows/arc/session-lifecycle/session-init.md` — Tier 1 examples 3-4
(lines 315-319 pre-trim) and Tier 2 example 3 (lines 335-336 pre-trim) from § If Context Seems
Mismatched.

**Content:**

> **Tier 1 — Auto-recover with notice (dropped examples):**
>
> - Active status file says "Last Completed: Task 3.2" but task list shows 3.3 also marked
>   `[x]` → proceed with 3.3 as last completed
> - (Team mode) Active status file shows "Next Task: 3.4" but task list shows 3.4 marked `[x]`
>   by a teammate's commit → another developer completed it; proceed with 3.5 as current
>
> **Tier 2 — Stop and ask (dropped example):**
>
> - Task list shows Task 3.3 incomplete but git log has a commit referencing Task 3.3 —
>   conflicting signals at the same trust tier

**Suggested destination:** `docs/guides/session-init/` § Recognizing Context Mismatches or
`docs/reference/mismatch-patterns/` — pedagogical pattern-recognition material. Full set of
examples (retained + dropped) makes a more thorough adopter-facing page than the trimmed
workflow's 2-per-tier retention.

**Stylistic integration notes:** Trimmed workflow retains 2 canonical examples per tier — the
patterns most worth recognizing at first read. Dropped examples add coverage (Last-Completed
lag, team-mode teammate, same-tier conflict) useful in a reference page but redundant when
loaded into agent context every session. Team-mode example is currently gated by team.mode
conditional in the template; docs absorption can present it uniformly since team mode is
well-documented elsewhere on the docs site.

## Entry 14 — 3_process-task-loop.md § Task Implementation — Co-development awareness rationale

**Source:** `.arc/system/workflows/arc/3_process-task-loop.md` (lines 31-33, pre-trim)

**Content:**

> This is a normal part of the ARC workflow: single-threaded, small-scope tasks keep the
> developer close enough to the work to contribute directly.

**Suggested destination:** `docs/methodology/co-development/` § Why Single-Threaded Tasks — or
folded into `docs/philosophy/` § Human-AI Collaboration as a framing clause.

**Stylistic integration notes:** Trimmed workflow retains the operational directive ("Treat
parallel changes as expected context... flag if conflicting") and drops the why-clause. The
why connects ARC's task-granularity choice to the co-development loop — conceptual framing for
adopters reading about ARC's philosophy, not operational for agents who already execute one
task at a time.

## Entry 15 — 3_process-task-loop.md § Completion protocol — Atomicity check common-splits examples

**Source:** `.arc/system/workflows/arc/3_process-task-loop.md` (lines 174-176, pre-trim)

**Content:**

> Common splits to watch for: task work vs. unrelated tooling/config fixes, code changes vs.
> task list tracking updates (when they can stand alone), multiple completed tasks that
> touched independent areas. When in doubt, smaller commits are better — split and ask.

**Suggested destination:** `docs/methodology/commit-discipline/` § Atomicity — worked examples
of common split-worthy combinations. Natural pair with the granularity guidance extracted in
Entry 19.

**Stylistic integration notes:** Trimmed workflow retains the imperative ("Do all changes
serve one logical concern? When in doubt, split and ask.") and points to
[DEV-RULES.ARC][dev-rules-arc] § Commit Discipline. The dropped enumeration is
pattern-recognition material — recognizing these three common combinations is adopter-level
guidance that doesn't need re-reading every task. Pairs with the [Commit Discipline][dev-rules-arc]
full atomicity treatment.

## Entry 16 — 3_process-task-loop.md § Incidental Work Management — Quick Decision Guide criteria

**Source:** `.arc/system/workflows/arc/3_process-task-loop.md` (lines 200-211, pre-trim)

**Content:**

> **Suggest incidental task list when:**
>
> - ✅ Multiple distinct phases with different goals (not just sequential steps)
> - ✅ Scope likely to expand via discovery (investigation-heavy)
> - ✅ Estimated 2+ hours OR requires research → design → implement cycle
>
> **Suggest keeping as atomic task (or fixing inline) when:**
>
> - ❌ Single coherent concern, even if complex (multiple files, 30-90 min)
> - ❌ Sequential steps all serving one goal
> - ❌ Scope is known/bounded after initial analysis

**Suggested destination:** `docs/methodology/incidental-work/` § When to Escalate to a Task
List — pedagogical decision aid for adopters reading about how ARC routes incidental work.

**Stylistic integration notes:** Trimmed workflow keeps the key distinction ("Sequential steps
toward one goal = atomic. Distinct phases with different objectives = task list.") plus a
pointer to [manage-incidental-work.md][manage-incidental]. The ✅/❌ criteria enumeration is
valuable when learning the distinction; redundant when re-scanning the workflow every session.
Consider retaining the visual ✅/❌ convention on the docs page — it reads well in a reference
context even when it's noise in agent context.

## Entry 17 — 3_process-task-loop.md § Task List Maintenance — TodoWrite rationale

**Source:** `.arc/system/workflows/arc/3_process-task-loop.md` (lines 248-250, pre-trim)

**Content:**

> Ephemeral task tracking tools (e.g., Claude Code's TodoWrite) help organize work within a
> session but are **not a substitute for task list markdown updates**. The task list file is
> the permanent record committed to git — always update it before reporting completion.

**Suggested destination:** `docs/methodology/task-lists/` § Session Tools vs. Task List Files —
discipline note for adopters whose harness surfaces ephemeral todo tools (Claude Code,
Cursor, etc.).

**Stylistic integration notes:** Trimmed workflow compresses to the imperative ("Ephemeral
task tracking tools are not a substitute for task list markdown updates. Always update the
task list file before reporting completion."). Dropped content is rationale explaining why
(session vs. permanent, git as record-of-truth) — valuable conceptual framing for adopters new
to the distinction; conceptually obvious to an agent already operating in ARC's model. Naming
a specific tool (Claude Code's TodoWrite) is useful in docs context as a concrete example but
creates harness-coupling in the workflow; the docs page can name multiple.

## Entry 18 — prepare-commits.md § Atomicity Guide — Shared-Docs Commit Pattern scenario framing

**Source:** `.arc/system/workflows/arc/supplemental/prepare-commits.md` (lines 56-59, pre-trim)

**Content:**

> When a WU completes multiple **independent** code tasks that all touch one shared
> documentation file (a cross-cutting strategy doc, README, or similar), committing each
> task's doc nibble inline creates tangled history in the shared file.

**Suggested destination:** `docs/methodology/commit-discipline/` § Shared-Docs Commit Pattern —
scenario framing for the pattern's motivation.

**Stylistic integration notes:** Trimmed workflow compresses to the operational rule ("When
multiple **independent** code tasks all edit one shared documentation file, defer shared-doc
updates to a final `docs(...): update [doc] for Tasks X.Y-X.Z` commit after the code
commits.") and retains the Applies / Does NOT apply bullets (operational boundary). Dropped
scenario description establishes *why* — useful for an adopter learning the pattern, redundant
for an agent applying it.

## Entry 19 — prepare-commits.md § Complex Analysis Path — Granularity guidance expansions

**Source:** `.arc/system/workflows/arc/supplemental/prepare-commits.md` (lines 123-138, pre-trim;
non-contiguous — the expansion clauses within the four rule bullets, not the rule leads themselves)

**Content:**

> - **One problem solved per commit — scope, not volume, as the sizing metric.** A refactor
>   touching ten files is one commit if it serves one intent. Multiple tasks completed together
>   that share a cohesive lens (same audit pass, same file surface, one reviewer story) are one
>   commit, not several — the unit is the concern, not the task ID.
> - **Split when the description needs multiple sentences explaining different problems.** If you
>   can't summarize the change in one focused sentence, the commit carries multiple concerns and
>   they should separate.
> - **Reversibility as the guard.** If reverting one change would force reverting others, they
>   belong together. If they fail or succeed independently, they split. This catches the genuine
>   split-is-worth-it cases — independent rationale, experimental vs stable, cross-cutting
>   refactor vs feature — without defaulting to task-ID bookkeeping.
> - **Tracking docs ride with content commits.** Task list checkboxes and active status file
>   updates are derived state — they belong with the commit that produced the content change, not
>   a separate meta-commit. Dangling tracking commits create churn without adding signal.

**Suggested destination:** `docs/methodology/commit-discipline/` § Granularity — worked
examples and reasoning behind each sizing heuristic. Natural pair with Entry 15's common-splits
examples.

**Stylistic integration notes:** Trimmed workflow keeps the four rule leads (scope-not-volume,
split-on-multi-sentence-summary, reversibility, tracking-rides-with-content) and the
intermingled-code pragmatic exception; it drops the expansion clauses that illustrate each
rule. The reversibility bullet retains its first two sentences (operational) and drops the
third (rationale naming the categories of genuine splits). The tracking-docs bullet retains
through "not a separate meta-commit" (the operational directive) and drops the final
"dangling tracking commits create churn" sentence (pure rationale). Worth preserving as a
docs page because the worked examples make the sizing rules memorable — a reader who has
internalized "scope not volume" via the refactor-ten-files example applies it more
consistently than one who has only the abstract rule.

## Entry 20 — integrate-work-unit.md § Appendix Handling Partially Superseded Work — Key principle closer

**Source:** `.arc/system/workflows/arc/work-unit-lifecycle/integrate-work-unit.md` (lines
342-344, pre-trim)

**Content:**

> **Key principle:** The `[~]` marker + decision point note creates a clear audit trail showing
> intentional architectural pivot, not abandoned work. Header metadata (State, Superseded By)
> lives in the status file and completion doc — not on the task list header.

**Suggested destination:** `docs/methodology/work-organization/` § Handling Supersession — or
folded into `docs/reference/task-states/` § The `[~]` Marker as a conceptual framing note.

**Stylistic integration notes:** Trimmed workflow retains the five-element appendix with code
templates (operational when the scenario applies) and drops this closing "Key principle"
summary — the first sentence restates what elements #4 (decision point marker) and #5 (`[~]`
marker) already establish; the second sentence duplicates the operational boundary already
stated in elements #1 (status file) and #2 (completion doc). The value of the closer is
conceptual framing — the audit-trail-vs-abandoned-work distinction is the essential motivation
for the supersession protocol. Worth preserving on a docs page where the appendix is absorbed
as its own section, framing *why* the protocol matters to a reader encountering it for the
first time. Less useful re-loaded every WU for agents who have already internalized the
convention.

## Entry 21 — session-handoff.md § Design context — ephemeral-context framing + persistent-memory nuance

**Source:** `.arc/system/workflows/arc/session-lifecycle/session-handoff.md` (lines 13-16, pre-trim);
template counterpart at
`packages/arc-framework/arc/system/workflows/arc/session-lifecycle/session-handoff.template.md` (same
line range — no template-only delta in this region).

**Content:**

> **Design context**: This workflow is optimized for agents with ephemeral context — capturing state that
> would otherwise be lost when the session ends. Agents with persistent memory may need lighter handoff
> ceremonies; the principle (state must be recoverable by a new session) still applies. The session state
> mechanism is overridable via the [session-state method][arc-methods-session].

**Suggested destination:** `docs/methodology/session-model/` § Design Context or `docs/methodology/handoff/`
— framing content about why handoff exists as a structured ritual. Pairs naturally with Entry 11
(session-init Design context); both carry the ephemeral-context / persistent-memory reasoning from the
bookend workflows. Docs absorption should consolidate into a single Design-context narrative rather
than treating each workflow independently.

**Stylistic integration notes:** Trimmed workflow retains a single-line design context pointing at the
session-state method (override mechanism — operationally relevant). Absorbed content is
principle-grounding rationale for readers learning the methodology rather than agents executing handoff.
"Agents with persistent memory may need lighter handoff ceremonies" mirrors Entry 11's session-init nuance
— signals ARC doesn't assume a single agent architecture and that handoff ceremony is proportional to
context volatility. `[arc-methods-session]` link anchor is retained in the source and resolves to
`system/methods/session-state.md`; docs absorption can reference the equivalent docs page.

## Entry 22 — session-handoff.md § Save to Git Notes — Error handling rationale

**Source:** `.arc/system/workflows/arc/session-lifecycle/session-handoff.md` (lines 425-439, pre-trim);
template counterpart at
`packages/arc-framework/arc/system/workflows/arc/session-lifecycle/session-handoff.template.md` (same
line range — no template-only delta in this region).

**Content:**

> **Error handling:** The CLI surfaces sync errors interactively — follow its guidance:
>
> - **Push rejected (non-fast-forward):** Local and remote notes conflict (both moved since
>   common ancestor). The CLI offers force-push (overwrite remote with local) or
>   `"Merge: rebase my save onto remote, then push"` (fetch remote, re-save local state on
>   top, then push). Choose force-push when your local state is authoritative; choose merge
>   when both sides have real content. This commonly happens when the same developer works
>   from two machines without syncing, or in team mode when two developers share an identity
>   by mistake.
> - **Missing remote:** No `origin` configured. Session state is saved locally via `arc user
>   save` — push is a convenience for portability. The local save still happened; push later
>   when a remote is available.
> - **Pull warning (local changes):** When pulling would overwrite unsaved local notes, the CLI
>   confirms before proceeding. The pre-load backup (`.pre-load-backup.json`) preserves the
>   prior state if needed.

**Suggested destination:** `docs/guides/session-handoff/` § Error Handling or `docs/reference/arc-sync/`
§ Troubleshooting — adopter-facing diagnostic content. The root-cause teaching (two-machine sync drift;
team-mode identity-sharing mistake) is especially worth preserving for adopters — it turns an opaque
error into a recognizable operational pattern.

**Stylistic integration notes:** Trimmed workflow retains a compact recognition list (one line per error
class) pointing back to the CLI's interactive guidance. Absorbed content carries the resolution-choice
reasoning (force-push-when-authoritative vs merge-when-both-sides-have-content), the
`.pre-load-backup.json` safety-net detail, and the root-cause patterns that reveal *why* these errors
occur. Docs audience can support the longer treatment without inflating per-session load cost. Preamble
sentence ("The CLI surfaces sync errors interactively — follow its guidance") remains in the source, so
docs absorption can open directly with the case-by-case content.

## Entry 23 — strategy-task-list-formatting.md § Task List Headers — Incidental worked example

**Source:** `.arc/reference/strategies/arc/strategy-task-list-formatting.md` (lines 151-181,
pre-trim); template counterpart at
`packages/arc-framework/arc/reference/strategies/arc/strategy-task-list-formatting.md` (same
line range — no template-only delta in this region).

**Content:**

> **Example:**
>
> ```markdown
> # Incidental: CLI Output Encoding on Windows
>
> **Branch(es):** `incidental/cli-output-encoding`
> **Base Branch:** `feature/multi-format-export`
>
> ## Context
>
> **Discovered:** Manual testing during Phase 3.6 (CSV export implementation)
>
> **Problem:** CLI output garbles non-ASCII characters on Windows terminals.
>
> **Why Now:** Blocks manual testing confidence and affects newly implemented export features.
>
> ## Scope
>
> ### Will Do
>
> - Fix encoding for all output formats (table, CSV, JSON)
> - Add comprehensive encoding tests
>
> ### Won't Do
>
> - Performance optimization (separate enhancement)
>
> ---
>
> ## Tasks
> ```

**Suggested destination:** `docs/guides/incidental-work/` § Anatomy of an Incidental Task List
or `docs/reference/task-lists/` § Incidental Example — adopter-facing concrete illustration of
the incidental header in practice. Pairs naturally with the incidental skeleton in
`template-tasks.md` (docs absorption can show the skeleton → fully populated example
progression).

**Stylistic integration notes:** Trimmed strategy doc retains the incidental variant rules
(title prefix, Base Branch semantics, Context subfields, lifecycle-state delegation) but drops
the full worked example — the skeleton in `template-tasks.md` shows structure, the rules
describe semantics, and the worked example's adopter-facing value is better served on a docs
page than inside an agent-loaded strategy. `feature/multi-format-export` is the fictional
parent branch — docs absorption can either keep it as an illustrative name or substitute a more
generic placeholder.

## Entry 24 — strategy-task-list-formatting.md § Indentation Rules — visual hierarchy + worked example

**Source:** `.arc/reference/strategies/arc/strategy-task-list-formatting.md` (lines 390-440,
pre-trim); template counterpart at the same line range.

**Content:**

> **Standard:** 4 spaces per hierarchy level
>
> ```text
> Phase Header (## **Phase X:**)
> ↓
> Phase-level notes (0 spaces) **Purpose:** Optional context
> ↓
> Parent Task (0 spaces) - [ ] **X.Y Description**
>     ↓
>     Goal/Note Line (4 spaces) **Goal:** Clarification
>     ↓
>     Numbered Subtask (4 spaces) - [ ] **X.Y.Z Description** (bold if details follow)
>         ↓
>         Detail Bullet (8 spaces) - Implementation detail
>             ↓
>             Sub-bullet (12 spaces) - Nested detail
> ```
>
> **Visual example:**
>
> ```markdown
> ## **Phase 1:** Backend Implementation
>
> **Purpose:** Establish data models with test-first approach.
>
> - [ ] **1.1 `User` model (`models.py`)**
>
>     **Goal:** Validated user model with email and username constraints.
>
>     - [ ] **1.1.a Field validation**
>         - Fields: `username`, `email`, `password_hash`
>         - Add `clean()` method for validation
>
>         Build `test-first` (one behavior at a time):
>         - Email format validation
>         - Username uniqueness constraint
>
>     - [ ] **1.1.b Password hashing**
>
>         Build `test-first` (one behavior at a time):
>         - Password stored as hash, not plaintext
>         - Hash verification succeeds with correct password
>
> - [ ] **1.2 `Profile` model (`models.py`)**
>
>     Build `test-first` (one behavior at a time):
>     - Foreign key to `User`
>     - Cascade delete when `User` removed
> ```

**Suggested destination:** `docs/reference/task-lists/` § Indentation and Hierarchy or
`docs/guides/task-generation/` § Formatting Patterns — adopter-facing pattern-recognition
material. The arrow-tree visualization and the fully populated worked example together make a
strong pedagogical unit; consolidating in a docs page serves the learning audience while the
trimmed strategy retains the operational one-line rule for agents.

**Stylistic integration notes:** Trimmed strategy doc retains "4 spaces per hierarchy level —
phase header → parent task (0) → goal/note or subtask (4) → detail bullet (8) → sub-bullet
(12)" as a one-line rule. Absorbed content is the visual ASCII tree and the fully annotated
worked example — adopter-facing and operationally redundant once the rule is internalized.
Docs absorption should preserve both the tree diagram and the example; the two together
disambiguate the indentation cascade better than either alone.

## Entry 25 — strategy-task-list-formatting.md § Verification Phase — rationale paragraphs

**Source:** `.arc/reference/strategies/arc/strategy-task-list-formatting.md` (lines 551-566,
pre-trim); template counterpart at the same line range.

**Content:**

> **Why a single task:** Verification is one review increment — three read-only validation
> activities that produce a single coherent outcome. Breaking them into separate tasks created
> self-contained descriptions that agents could execute without loading the workflow, causing
> protocol details (immutable criteria text, three-state model) to be missed. A thin pointer
> forces the workflow load.
>
> **Completion notes as record:** The workflow instructs the agent to include completion notes
> covering what was verified. This makes the archived task list self-documenting — a reader
> sees the verification outcome without needing to find the workflow.
>
> For task completion more broadly, completion notes are the per-task historical record for the
> work unit, not a duplicate of the original plan plus a second layer of outcomes. Prefer rewriting
> task text into the final outcome shape: what was delivered, what key decision mattered, and what
> deviation from plan is important to preserve. Use commit history for the stepwise path of atomic
> changes; use task completion notes for the resolved outcome of the task. Keep both only when the
> abandoned path is itself important historical context.

**Suggested destination:** `docs/methodology/verification/` § Why a Thin Pointer or
`docs/methodology/task-completion/` § Completion Notes as Historical Record — design-philosophy
content explaining the single-task-pointer decision and the completion-notes-as-outcome-shape
rule. Both paragraphs belong to a larger narrative about why ARC treats verification as a
workflow-loaded ritual and why completion notes should rewrite rather than append.

**Stylistic integration notes:** Trimmed strategy doc retains the operational specification
(skeleton + include reference-link definition at task list end) but drops the design-rationale
paragraphs. Docs absorption can expand these into a page on ARC's verification philosophy —
why a single pointer task, why completion notes matter for archive readability, and how task
completion notes relate to commit history. The "For task completion more broadly" framing
generalizes the principle from verification-phase completion to all task completion; this
generalization is worth preserving in docs absorption.

## Entry 26 — strategy-task-list-formatting.md § Success Criteria Section — worked example with three-state annotations

**Source:** `.arc/reference/strategies/arc/strategy-task-list-formatting.md` (lines 686-703,
pre-trim); template counterpart at the same line range.

**Content:**

> **Example:**
>
> ```markdown
> ## Success Criteria
>
> - [x] Required-field validation reports all missing fields with paths
> - [x] Type-mismatch validation reports expected vs actual types
> - [x] Multiple errors collected and reported in single pass
> - [x] `getting-started.md` exists with adoption story and "what to customize" guidance
>     - **Deviation:** Content redirected to external docs site (MkDocs Material +
>       GitHub Pages). In-repo file is a lightweight pointer, not the full adoption
>       story originally planned. Decided during Task 5.1.
> - [~] Widget supports offline mode
>     - **Superseded:** Descoped to Phase D after discovering API dependency requires
>       always-online for initial sync. See `plan-public-release.md`.
> - [x] All quality gates pass (tests, linting, type checking — 0 violations)
> - [x] Ready to resume interrupted work at Task 3.3
> ```

**Suggested destination:** `docs/reference/success-criteria/` § Example or
`docs/guides/verification/` § Success Criteria in Practice — concrete demonstration of the
three-state model with both **Deviation** and **Superseded** annotations. Most pedagogical
artifact in the strategy doc; docs audience benefits more than per-session-load agents.

**Stylistic integration notes:** Trimmed strategy doc retains the three-state marker table and
the immutability / "All quality gates pass" / "Ready for {archival | merge}" rules but drops
the worked example. The example demonstrates the annotations in realistic form (both a
Deviation for an altered-but-met criterion and a Superseded for a dropped one); docs absorption
should retain both annotation types with their respective notes. `getting-started.md` and
`plan-public-release.md` are fictional references — docs absorption can keep them as
illustrative filenames or substitute project-neutral placeholders.

## Entry 27 — strategy-task-list-formatting.md § Atomic Companion File — Purpose prose + sample contents

**Source:** `.arc/reference/strategies/arc/strategy-task-list-formatting.md` (lines 572-603,
pre-trim); template counterpart at the same line range.

**Content:**

> **Created alongside every task list.** A standalone file (`atomic-{name}.md`) in the same directory
> as `tasks-{name}.md`. Empty by default — populated during execution as off-plan work is discovered.
>
> **Purpose:** Tracks indivisible one-off tasks you elect to do in parallel to the planned work —
> discovered during execution, not required for the work unit's success criteria. Unlike the phased
> task list, these tasks have no position in the dependency sequence and are accessed at
> unpredictable times throughout execution.
>
> **Companion file format:**
>
> ```markdown
> # Atomic Tasks — {Work Unit Name}
>
> **Purpose:** Tracking of indivisible one-off tasks you elect to do in parallel to the
> planned work — discovered during execution, not required for the work unit's success
> criteria. Flat checkbox list, no numbering hierarchy.
>
> **Ordering:** Incomplete tasks (`[ ]`) stay at the top. Completed tasks (`[x]`) sink
> below them in completion order (oldest completed first). See process-task-loop §
> Atomic Task Completion for the full protocol.
>
> > Multi-step work required for the WU belongs in the task list as a new phase.
> > For multi-step work outside the WU's concern, see `manage-incidental-work.md`.
>
> ---
>
> - [ ] Clarify error message in config loader (noticed during Task 5.3, deferred)
>
> - [x] Fixed broken cross-reference in session-init.md (discovered during Task 3.2)
> - [x] Updated .gitignore for new build artifacts (discovered during Task 4.1)
>
> ---
> ```

**Suggested destination:** `docs/methodology/atomic-work/` § The Companion File or
`docs/reference/atomic-tasks/` § Overview — conceptual framing for why atomic tasks exist as a
separate surface and how the companion file differs from the phased task list. The Purpose
paragraph captures the "no position in the dependency sequence, accessed at unpredictable
times" framing that distinguishes atomic from planned work.

**Stylistic integration notes:** Trimmed strategy doc retains the scope guards (size,
relationship to WU, timing), ordering rule, naming convention, and lifecycle rules (don't
delete empty, archive vs delete) but drops the Purpose prose and the fully-populated sample
file. The sample file is now in `template-tasks.md`, so the content is preserved — docs
absorption can either reference that template or reproduce the sample inline depending on
page layout. The Purpose paragraph is the piece worth preserving on its own: it answers "why
is atomic a separate file, not just inline in the task list?"

## Entry 28 — 1_create-prd.md § Preamble — feature/technical work-type taxonomy

**Source:** `.arc/system/workflows/arc/1_create-prd.md` (lines 8-14, pre-trim); package-source
copy at `packages/arc-framework/arc/system/workflows/arc/1_create-prd.md` same line range —
straight two-copy file, no template-only delta.

**Content:**

> ARC distinguishes two work types:
>
> - **Feature** — User-facing capabilities
> - **Technical** — Infrastructure, architecture, or process improvements
>
> See [Work Organization Strategy][work-org] for the complete
> decision tree.

**Suggested destination:** `docs/methodology/work-types/` § Feature vs Technical or
`docs/reference/work-categories/` § Overview — adopter-facing introductory framing of the
two-work-type taxonomy. Pairs naturally with the Work Organization Strategy's decision tree;
docs absorption can show the taxonomy-definition → decision-tree progression.

**Stylistic integration notes:** Trimmed workflow retains a one-line pointer ("ARC distinguishes
feature and technical work — see [Work Organization Strategy][work-org] for the decision tree")
in the preamble; the definitional content moves to Step 2 inline ("Classify as **feature** (adds
user-visible capability from the product vision) or **technical** (infrastructure, architecture,
or internal improvement)"). The two-bullet taxonomy extracted here is pedagogical framing that
doesn't need to appear twice in an operational workflow. Docs absorption audience is adopters
learning the methodology rather than agents executing PRD creation.

## Entry 29 — 1_create-prd.md § Step 3 Conduct Discovery — "Without a plan" discovery bullets

**Source:** `.arc/system/workflows/arc/1_create-prd.md` (lines 72-78, pre-trim); package-source
copy at `packages/arc-framework/arc/system/workflows/arc/1_create-prd.md` same line range —
straight two-copy file, no template-only delta.

**Content:**

> **Without a plan**: Ask broader questions to establish scope:
>
> - **Problem/Goal**: What problem does this solve? What does success look like?
> - **Scope**: What's in scope? What's explicitly out?
> - **Requirements**: What must the solution do? What constraints exist?
> - **Technical context**: Dependencies, integration points, migration concerns
> - **Unknowns**: What needs investigation before implementation?

**Suggested destination:** `docs/guides/prd-creation/` § Discovery Without a Plan or
`docs/reference/planning-pipeline/` § Discovery Checklist — adopter-facing elaboration of the
discovery areas. Pairs with `strategy-work-planning.md § Discovery Checklist` (the authoritative
source the trimmed workflow now points at); docs absorption can either treat this as a
simplified preview of the full checklist or fold it into the checklist page itself as an
at-a-glance summary.

**Stylistic integration notes:** Trimmed workflow retains a one-line pointer to the discovery
checklist ("**Without a plan**: Work through the [discovery checklist][discovery-checklist] in
full to establish scope") and drops the inline enumeration. The five bullets duplicated content
already owned by `strategy-work-planning.md § Discovery Checklist` (the authoritative source) —
two-copy redundancy in the agent-loaded surface. Docs audience can support the preview
treatment without forcing agents to re-read the same material in two loaded docs.

## Entry 30 — 1_create-prd.md § Step 5 Retire Plan Documents — "Framing the notes file" guidance

**Source:** `.arc/system/workflows/arc/1_create-prd.md` (lines 112-119, pre-trim); package-source
copy at `packages/arc-framework/arc/system/workflows/arc/1_create-prd.md` same line range —
straight two-copy file, no template-only delta.

**Content:**

> **Framing the notes file:** The `notes-*.md` file is a living scratchpad for the work unit —
> not a closed archive of plan-extracted material. Place carved sections near the top with clear
> headings, but do not frame the file header as being "only" plan-extracted content. Leave the
> structure open for sections added during task execution (working notes, discovered context,
> implementation scratch). Keep the file header minimal: title plus contents. No purpose block
> describing how the file will be consumed, no provenance lines citing the plan doc, no
> "retired with this commit" metadata, no explanations of the file's relationship to specific
> commits. Write for the reader, not the author (see [DEV-RULES.ARC][dev-rules-arc]
> § Documentation Boundaries).

**Suggested destination:** `docs/methodology/planning-pipeline/` § Plan → PRD Transition or
`docs/guides/notes-files/` § Framing a Living Scratchpad — adopter-facing rationale for the
"living scratchpad" framing and the anti-patterns it names (purpose blocks, provenance lines,
commit metadata). The concrete anti-patterns (authored for the author, not the reader) are
worth preserving as examples of the broader DEV-RULES.ARC § Documentation Boundaries rule in
action — docs absorption can either consolidate with Entry 9 (DEV-RULES.ARC § Write for the
reader overflow examples) or treat this as a planning-pipeline-specific illustration.

**Stylistic integration notes:** Trimmed workflow retains a compact operational constraint
("Keep the notes file header minimal (title + contents only) — no purpose block, no provenance
to the plan, no commit metadata. See [DEV-RULES.ARC][dev-rules-arc] § Documentation
Boundaries.") inside the Step 5 procedural list. Absorbed content carries the "living
scratchpad" framing, the "leave the structure open for sections added during task execution"
rationale, and the specific anti-patterns enumerated (purpose block, provenance lines,
"retired with this commit" metadata). The anti-pattern list is the piece most worth
preserving on its own: it answers "which specific habits does this rule name?"

## Entry 31 — 2_generate-tasks.md § Task List Format — Header code block + path-update note

**Source:** `.arc/system/workflows/arc/2_generate-tasks.md` (lines 127-141, pre-trim);
package-source copy at
`packages/arc-framework/arc/system/workflows/arc/2_generate-tasks.template.md` (lines 136-150,
pre-trim — 9-line offset from .arc/ due to the team.mode conditional block in Step 3; the Task
List Format region itself has no template-only delta).

**Content:**

> ### Header
>
> ```markdown
> # Task List: [Work Name]
>
> - **PRD:** `.arc/[location]/[category]/prd-[name].md`
> - **Branch(es):** `feature/[name]` or `technical/[name]` (comma-separated if multiple)
> - **Base Branch:** base branch per `arc-config.yml` (typically `main`)
> ```
>
> The PRD path should reflect the PRD's current location (matching the task list's save location).
> In arc-in-git mode, [activation][activate-work-unit] updates both paths when documents move to
> `active/`.

**Suggested destination:** `docs/reference/task-lists/` § Header Format or folded into the
`template-tasks.md` docs equivalent — adopter-facing header-field reference. The skeleton
content is now canonically owned by `template-tasks.md` (extracted in Task 4.4.a); the
path-update-during-activation sentence is workflow-level nuance rather than template content —
docs absorption should keep the skeleton near `template-tasks.md` and the path-update nuance
near activation-flow content.

**Stylistic integration notes:** Trimmed workflow collapses `## Task List Format` to a
two-pointer structure: one line to `template-tasks.md` for the skeleton, one line to
`strategy-task-list-formatting.md` for the rules. The path-update sentence stays in the
workflow (operational: it tells the author when paths shift, and the PM-mode-specific
activation mechanics are workflow concerns). Previous `### Header` / `### Body` subsection
structure is gone — both subsections were shallow pointers; the flat collapse matches the
extraction's scope and removes the two-hop lookup (workflow → strategy → template). For docs
absorption, the header skeleton is the piece worth preserving, since `template-tasks.md`'s
docs equivalent will likely reproduce it verbatim.

## Entry 32 — activate-work-unit.md § Prerequisites — "How artifacts reach the base branch" blockquote

**Source:** `.arc/system/workflows/arc/work-unit-lifecycle/activate-work-unit.md` (lines 46-53,
pre-trim); package-source copy at
`packages/arc-framework/arc/system/workflows/arc/work-unit-lifecycle/activate-work-unit.md` same
line range — straight two-copy file, no template-only delta.

**Content:**

> **How artifacts reach the base branch** depends on `branch.protection`:
>
> - **Full protection:** Planning branch PR merged
>   (`integrate-planning-branch` — workflow retired with WOR's single-branch-per-WU model)
> - **Partial protection:** Planning branch PR merged, or committed directly to base branch
>   (documented exception for solo developers — see
>   [Branch Protection Modes][work-org-protection])

**Suggested destination:** `docs/methodology/branch-protection/` § Planning Artifacts Routing or
folded into `docs/reference/work-organization/` § Branch Protection Modes — adopter-facing
protection-mode-specific walkthrough of how planning artifacts land on the base branch. Pairs
with the full "Branch Protection Modes" strategy section which docs absorption likely carries
forward from `strategy-work-organization.md`.

**Stylistic integration notes:** Trimmed workflow deletes the blockquote outright — the three-
option Prerequisites bullet list immediately above ("Planning artifacts are on the base branch —
arrived via one of: Planning branch PR / Batch branch PR / Direct commit (partial protection,
documented exception)") already encodes the same routing, mode-agnostic. The blockquote
reorganized the same information under a full-vs-partial lens; redundant for an agent executing
activation, pedagogical for a reader learning protection-mode semantics. Link definitions
`[integrate-planning-branch]` and `[work-org-protection]` were removed from the file's link block
as orphans after the extraction. Docs absorption should preserve the two sub-bullets with the
mode labels retained — the protection-mode framing is the piece worth carrying into docs.

## Entry 33 — activate-work-unit.md § Step 4 Create Status File — pre-activation PRD metadata SSOT rationale

**Source:** `.arc/system/workflows/arc/work-unit-lifecycle/activate-work-unit.md` (lines
122-125, pre-trim); package-source copy same line range — straight two-copy file.

**Content:**

> These fields serve pre-activation staleness/dependency tracking only — once the status file is
> created, its `**State:**` field is the sole source of truth for WU lifecycle, and git history
> tracks post-activation edits.

**Suggested destination:** `docs/methodology/work-state/` § Status File as Single Source of
Truth or folded into `docs/reference/templates/template-prd/` § Pre-Activation vs Post-Activation
Metadata — adopter-facing explanation of *why* the three PRD header fields retire at activation.
Natural pair with any docs page covering the `status-{name}.md` role in the lifecycle.

**Stylistic integration notes:** Trimmed workflow keeps the imperative directive ("Remove
`**State:**`, `**Related Work:**`, and `**Updated:**` lines from the PRD header") and the
retention clause ("The PRD retains only `**Type:**` going forward"). Dropped sentence is SSOT
rationale — explains why those three fields are obsolete post-activation, not what to do. An
agent executing activation just needs the remove/retain directives; an adopter learning the
methodology benefits from knowing the status-file-as-SSOT principle that drives the cleanup.

## Entry 34 — archive-work-unit.md § Route Reference Files — file-category example enumerations

**Source:** `.arc/system/workflows/arc/work-unit-lifecycle/archive-work-unit.md` (lines 77-94,
pre-trim); package-source copy same line range — straight two-copy file.

**Content:**

> Before archiving, assess whether any work artifacts have reference value beyond this work
> unit — investigation notes, benchmark data, design explorations, dependency maps. These files
> lose discoverability once buried in the archive directory.
>
> **Files with lasting value** (move to reference — never duplicate):
>
> - `research-*` files — standalone reference docs by convention. Always route to
>   `.arc/reference/research/`. Research content embedded in `notes-*` files is different — it's
>   tightly coupled to the work unit and archives normally.
> - Reusable procedures (rollback plans, migration guides)
> - Architecture diagrams, benchmark data, dependency maps, audits
>
> **Files without lasting value** (archive only):
>
> - Task-specific working notes, debugging logs
> - Intermediate drafts superseded by final deliverables
> - Scratchpad files used only during implementation

**Suggested destination:** `docs/methodology/archival/` § Reference vs Archive Routing or
`docs/guides/work-unit-archival/` § What Has Lasting Value — adopter-facing pattern-recognition
guide for deciding which artifacts survive the archive boundary. Natural pair with a docs
explanation of the `.arc/reference/research/` vs `.arc/reference/analysis/` distinction.

**Stylistic integration notes:** Trimmed workflow keeps the operational core — the Decision
question, the `research-*` convention rule (hoisted into its own prose paragraph since the
convention is operationally essential), and the Yes/No Routing block with destinations. Dropped
content is the "with lasting value" / "without lasting value" example enumerations plus the
"files lose discoverability" framing sentence. The examples are pedagogical — they teach
pattern recognition (reusable procedures, benchmarks, diagrams are lasting; scratchpads,
intermediate drafts aren't). Agents executing archival can apply the Yes/No decision using the
question alone; adopters learning the methodology benefit from the worked categories. Docs
absorption should preserve the two bulleted example lists — they're the piece that makes the
"lasting value" criterion concrete.

## Entry 35 — archive-work-unit.md § Archive Structure — example tree + sequence-numbering paragraph

**Source:** `.arc/system/workflows/arc/work-unit-lifecycle/archive-work-unit.md` (lines
226-250, pre-trim — the bullet-point expansion of path-pattern segments, the example directory
tree, and the sequence-numbering-rule paragraph); package-source copy same line range — straight
two-copy file.

**Content:**

> - `{quarter}`: `2025-q4`, `2025-q3`, etc.
> - `{category}`: `feature/`, `technical/`, or `incidental/`
> - `{NN}`: Global sequence number (01-99), assigned by completion order across ALL categories
> - `{name}`: Work unit name (matching task list name)
>
> **Example structure:**
>
> ```text
> 2025-q4/
> ├── technical/
> │   ├── 01_database-migration/
> │   ├── 02_ci-pipeline-overhaul/
> │   ├── 03_logging-standardization/
> │   └── 10_config-refactor/
> ├── incidental/
> │   ├── 04_fix-auth-edge-cases/
> │   ├── 05_lint-config-cleanup/
> │   └── ...
> └── feature/
>     └── 06_user-notifications/
> ```
>
> **Sequence numbering:** Numbers are global across all categories, assigned in completion order
> (not start order). Gaps within a category reflect interleaved work in other categories. Reset
> to 01 each quarter.

**Suggested destination:** `docs/reference/archive-structure/` § Path Pattern and Numbering or
folded into `docs/methodology/archival/` § Archive Layout — adopter-facing reference material
showing what a mature archive directory looks like and how the global-sequence numbering reads
across categories. The example tree is the piece that makes the "gaps reflect interleaved work"
rule visible.

**Stylistic integration notes:** Trimmed workflow collapses the § Archive Structure block to a
single paragraph: path pattern + segment definitions inline + sequence rule + categorization
pointer. Dropped content is the per-segment bullet expansion (redundant with the inline
definitions), the full example tree, and the detailed sequence-numbering paragraph (the
essential "global across categories, zero-padded, reset quarterly" facts are inline in the new
paragraph). Pattern is surface-reduction to a minimal operational reference — an agent archiving
one WU needs the path pattern and sequence rule; an adopter learning the archival model
benefits from seeing how the structure reads across a quarter. Docs absorption should preserve
the example tree — it's the most memorable piece.

## Entry 36 — archive-work-unit.md § Common Pitfalls

**Source:** `.arc/system/workflows/arc/work-unit-lifecycle/archive-work-unit.md` (lines
257-262, pre-trim — the entire § Common Pitfalls section body); package-source copy same line
range — straight two-copy file.

**Content:**

> - Use `mv` instead of `git mv` → Loses file history
> - Archive before merge → Run [integrate-work-unit][integrate-work-unit] first
> - Archive before all branches merged → Multi-branch work units archive once after final merge
> - Skip status file deletion → dangling state file in `active/` confuses next session-init

**Suggested destination:** `docs/methodology/archival/` § Common Pitfalls or folded into a
docs-wide § Anti-Patterns reference collecting pitfalls from multiple workflows. Adopter-facing
anti-pattern reference — names the specific failure modes people hit during archival.

**Stylistic integration notes:** Trimmed workflow deletes the § Common Pitfalls section and its
enclosing `---` separators outright. The step-level instructions already encode the correct
behavior for each pitfall — Step 3 uses `git mv`, the prerequisite at file top requires
`integrate-work-unit` completion, Step 4 `git rm`s the status file, the multi-branch verification
callout covers the "archive once" rule. Pattern is the same as Entry 16 / Entry 17: anti-pattern
enumerations are reference-guide material, not workflow-execution material. Docs absorption
should preserve the `→` arrow format — it reads well as a diagnostic "you hit this, here's
what's wrong" reference.

## Entry 37 — clean-work-unit.md § Mode 1 Mid-Work Cleanup — "What happens" ✅/❌ enumeration

**Source:** `.arc/system/workflows/arc/work-unit-lifecycle/clean-work-unit.md` (lines 28-36,
pre-trim — the "What happens:" block under Mode 1); package-source copy same line range —
straight two-copy file.

**Content:**

> **What happens:**
>
> - ✅ Fix stale task number references from restructuring
> - ✅ Reorder content to match current task numbering (both task file and notes file)
> - ✅ Clean up task file (migrate verbose blocks to notes file)
> - ✅ Add migrated content to notes file
> - ❌ **DO NOT clean up notes file itself** (it's not loaded every session)
> - ❌ **DO NOT prepare notes file for archival** (work is still in progress)

**Suggested destination:** `docs/methodology/cleanup/` § Mid-Work Mode or folded into a
docs-facing Mode 1 vs Mode 2 comparison table. Adopter-facing pedagogical scan — "here's what
Mode 1 does and doesn't touch" at a glance.

**Stylistic integration notes:** Trimmed workflow keeps the Mode 1 heading, Goal, and Use-when
bullets; drops the ✅/❌ enumeration. The step-level instructions (Steps 1-4, 6-7 per the
heading parenthetical) spell out exactly which actions happen in Mode 1 — the ✅/❌ list is a
recap of the step-level content for at-a-glance consumption. Agents executing Mode 1 cleanup
read the full steps; a reader scanning to decide which mode applies benefits from the
bulleted contrast. Pairs naturally with Entry 38 (Mode 2 equivalent) in the docs absorption —
the two should land adjacent so the mode distinction is scannable.

## Entry 38 — clean-work-unit.md § Mode 2 Archival Preparation — "What happens" ✅/❌ enumeration

**Source:** `.arc/system/workflows/arc/work-unit-lifecycle/clean-work-unit.md` (lines 52-58,
pre-trim — the "What happens:" block under Mode 2); package-source copy same line range —
straight two-copy file.

**Content:**

> **What happens:**
>
> - ✅ Remove temporal noise from task file (grep-based, not content judgment)
> - ✅ Evaluate notes file (keep for archival or delete if scratchpad)
> - ✅ **If keeping notes:** Clean up notes file (TOC, headers, remove temporal markers)
> - ✅ Collect completion doc data during cleanup (for large files)
> - ✅ Prepare files for archival

**Suggested destination:** `docs/methodology/cleanup/` § Archival Mode — paired with Entry 37's
Mode 1 equivalent. The two entries together deliver the scannable Mode 1 vs Mode 2 distinction
that drives mode selection.

**Stylistic integration notes:** Trimmed workflow keeps the Mode 2 heading, Goal, Use-when
bullets, and Timing note; drops the ✅/❌ enumeration. Same lens as Entry 37 — the bulleted
list recaps step-level content (Steps 1-7 including Step 5, per the heading parenthetical) for
scan consumption. Agents executing Mode 2 read the full steps. Note: Mode 2 uses only ✅
markers (all five actions happen), unlike Mode 1's mixed ✅/❌ — the mode-2 list is purely
enumerative while mode-1 uses the ❌ markers to name explicit boundaries ("DO NOT clean up
notes file itself"). Docs absorption should preserve both lists' exact marker patterns — the
contrast between "here's what Mode 1 does NOT do" and "here's what Mode 2 does" is pedagogically
meaningful.

## Entry 39 — clean-work-unit.md § Output

**Source:** `.arc/system/workflows/arc/work-unit-lifecycle/clean-work-unit.md` (lines 345-357,
pre-trim — the entire § Output section); package-source copy same line range — straight
two-copy file.

**Content:**

> ## Output
>
> **Three-tier system:**
>
> - **Completion doc** (`completion-{name}.md`): Executive summary — "What was achieved?"
> - **Task file** (`tasks-{name}.md`): Detailed sub-task record — "What was done?" (can be
>   500-3000+ lines)
> - **Notes file** (`notes-{name}.md`, if kept): Deep-dive reference — "How/why decisions,
>   investigation journeys"
>
> **Task file target:** Historical record with inline outcomes preserved. No temporal noise, no
> completion summary (that's the completion doc's job).
>
> **Notes file target (if kept):** Table of contents, clean headers, rich historical detail
> organized by topic. Find any specific decision or detail in <1 minute.

**Suggested destination:** `docs/methodology/work-artifacts/` § Three-Tier System or folded into
`docs/reference/file-roles/` § Task List / Notes / Completion Doc Boundaries — adopter-facing
conceptual framing of how the three artifact types divide the "what was done" reporting
surface. Natural pair with `template-completion-doc.md`, `template-tasks.md`, and any docs
guidance on notes-file framing (see Entry 30).

**Stylistic integration notes:** Trimmed workflow deletes the § Output section wholesale.
Content is conceptual recap — it describes the three file roles after the step-by-step
instructions have already told the agent what to produce in each. Agents executing cleanup
don't need the framing; adopters learning the methodology benefit from the executive-summary
/ detailed-record / deep-dive-reference triad. The "task file: 500-3000+ lines" detail and the
"find in <1 minute" notes-file target are the specific calibrations docs absorption should
preserve — they quantify what the file roles look like in practice.

## Entry 40 — clean-work-unit.md § Common Pitfalls

**Source:** `.arc/system/workflows/arc/work-unit-lifecycle/clean-work-unit.md` (lines 359-370,
pre-trim — the entire § Common Pitfalls section body); package-source copy same line range —
straight two-copy file.

**Content:**

> ❌ **Modifying task descriptions** — task lines are historical records, keep them verbatim
> ❌ **Ignoring stale references** — after restructuring, "(Task 7)" might now mean Task 8
> ❌ **Cleaning notes file mid-work** — notes cleanup is Mode 2 only, not Mode 1
> ❌ **Leaving forward pointers in archived files** — remove pointers to archived task lists
> ❌ **Removing backward pointers** — keep pointers to active task lists where work resumes
> ❌ **Keeping completion summary in task file** — goes in separate `completion-{name}.md`
> ❌ **Leaving temporal markers** — "Pending approval", "To be filled" confuses future readers
> ❌ **Skipping TOC for archival** — large notes file without navigation is unusable
> ❌ **Deleting instead of migrating** — lost context can't be recovered
> ❌ **Over-editing notes** — don't remove the exploration journey, that's valuable context

**Suggested destination:** `docs/methodology/cleanup/` § Common Pitfalls or folded into a
docs-wide § Anti-Patterns reference collecting pitfalls from multiple workflows. Natural pair
with Entry 36 (archive-work-unit.md's Common Pitfalls).

**Stylistic integration notes:** Trimmed workflow deletes the § Common Pitfalls section
wholesale. Same lens as Entries 16-17, 36: anti-pattern enumerations are reference-guide
material, not workflow-execution material. The step-level instructions already encode correct
behavior for each pitfall — "never modify task descriptions" is in Step 2's historical-records
callout, "notes cleanup is Mode 2 only" is in the mode definitions and Step 4's append-only
directive, etc. Docs absorption should preserve the `❌` marker and the `term — explanation`
format — it's a scannable reference layout. Consider consolidating with Entry 36 into a single
"Work Unit Archival / Cleanup Anti-Patterns" docs page; the two cover the same lifecycle phase
and share the same adopter audience.

## Entry 41 — clean-work-unit.md § Step 2 Inventory Open Work — stale-reference BEFORE/AFTER example

**Source:** `.arc/system/workflows/arc/work-unit-lifecycle/clean-work-unit.md` (lines 141-145,
pre-trim — the code fence illustrating stale task-reference updating); package-source copy same
line range — straight two-copy file.

**Content:**

> ```markdown
> <!-- Example: After inserting Task 7a-7c, old reference needs updating -->
> <!-- BEFORE --> **Manual E2E Validation** (Task 7) - Critical Path Only:
> <!-- AFTER -->  **Manual E2E Validation** (Task 8) - Critical Path Only:
> ```

**Suggested destination:** `docs/methodology/cleanup/` § Fixing Stale References — worked
example illustrating the renumbering-aware cleanup pass. Natural pair with the strategy-doc or
docs page covering task renumbering.

**Stylistic integration notes:** Trimmed workflow keeps the operational directive ("Search for
patterns like `(Task N)`, `Task N:`, `Tasks N-M` in task descriptions and completion notes;
verify each reference points to the correct current task") and drops the BEFORE/AFTER example.
Same lens as Entries 16, 17, 23-27: worked examples are pedagogical — they make the pattern
concrete for a learning reader but don't drive execution for an agent applying the search-and-
verify procedure. Docs absorption should preserve the HTML-comment BEFORE/AFTER annotation
style — it's a distinctive, easy-to-scan format for illustrating text transformations.

## Entry 42 — clean-work-unit.md § Step 3 Mode 1 — KEEP/MIGRATE BEFORE/AFTER example

**Source:** `.arc/system/workflows/arc/work-unit-lifecycle/clean-work-unit.md` (lines 164-176,
pre-trim — the code fence illustrating KEEP vs MIGRATE classification for task-line content);
package-source copy same line range — straight two-copy file.

**Content:**

> ```markdown
> <!-- KEEP: relevant to remaining Tasks 7-9 -->
> - [x] 6.5 Implement auth fallback
>     **IMPORTANT for Tasks 7-9:** All endpoints must check secondary auth after primary.
>     Authentication order: Primary → API Key → Session.
>
> <!-- MIGRATE: historical, no future dependencies -->
> - [x] 3.4 Debug token issue - RESOLVED
>     **Root Cause:** Header missing in form.submit() due to browser security
>     **Solution:** Switched to fetch() API with explicit headers
>     **Investigation:** Tried 5 different approaches... [15 lines]
>     → Migrate to notes file under "Token Issue Investigation (Task 3.4)"
> ```

**Suggested destination:** `docs/methodology/cleanup/` § KEEP vs MIGRATE Decision — worked
example making the "relevant to remaining tasks" vs "historical, no future dependencies"
distinction concrete. Natural pair with Entry 37 (Mode 1 ✅/❌) which introduces the migrate-
verbose-blocks-to-notes action that this example illustrates.

**Stylistic integration notes:** Trimmed workflow keeps the Decision criteria (YES→Keep,
NO→Migrate), the "What stays" / "What migrates" bullet lists, and drops the BEFORE/AFTER code
fence. Same pedagogy-vs-execution split as Entry 41 — the bullet lists encode the rule, the
code fence illustrates it. Docs absorption should preserve the HTML-comment KEEP/MIGRATE
annotation, the two realistic task-line shapes (with auth-fallback importance note and debug
journey), and the trailing migration directive (`→ Migrate to notes file under "..."`) — the
full shape of the annotation is what teaches the pattern.

## Entry 43 — clean-work-unit.md § Step 5a Consolidate and Deduplicate — BEFORE/AFTER example

**Source:** `.arc/system/workflows/arc/work-unit-lifecycle/clean-work-unit.md` (lines 272-289,
pre-trim — the code fence illustrating notes-file consolidation before vs after); package-source
copy same line range — straight two-copy file.

**Content:**

> ```markdown
> <!-- BEFORE: Same compatibility info repeated across 3 task sections -->
> ## Task 4.1: Auth Library Migration Research
> [300 lines about library compatibility]
>
> ## Task 4.3: Auth Library Implementation
> [50 lines repeating same compatibility info] + [200 lines implementation]
>
> <!-- AFTER: Consolidated under topic, cross-referenced -->
> ## Auth Library Migration (Tasks 4.1-4.8)
>
> ### Compatibility Research (Task 4.1)
> [300 lines - kept as comprehensive reference]
>
> ### Implementation (Task 4.3)
> [200 lines implementation - kept]
> See "Compatibility Research" above for library evaluation.
> ```

**Suggested destination:** `docs/methodology/cleanup/` § Notes File Consolidation or
`docs/guides/notes-files/` § Archival Deduplication — worked example showing the per-task
fragmentation → per-topic consolidation transformation. Natural pair with Entry 30 (notes-file
framing as living scratchpad).

**Stylistic integration notes:** Trimmed workflow keeps the operational directive
("Consolidate and deduplicate") plus the three-step process (identify duplicates, keep most
complete version, bias toward preservation) and drops the BEFORE/AFTER code fence. Same lens
as Entries 41-42. The [300 lines]/[50 lines]/[200 lines] line-count placeholders are a
distinctive docs-hostile style choice — they communicate "this is schematic, not literal" to a
reader scanning for the pattern. Docs absorption should preserve the placeholder convention —
it's the feature that lets the example communicate scale without committing to fictional
content.

## Entry 44 — deactivate-work-unit.md § Preamble — Design principle callout

**Source:** `.arc/system/workflows/arc/work-unit-lifecycle/deactivate-work-unit.md` (lines
12-15, pre-trim — the full Design principle blockquote); package-source copy same line range —
straight two-copy file.

**Content:**

> **Design principle:** *Deactivation means undo-activation of a work unit that didn't
> meaningfully start.* If work has happened, the correct operation is pause (`arc-shift`,
> future), completion ([`integrate-work-unit.md`][integrate]), or abandonment
> (`clean-work-unit.md` — workflow retired pre-WOR) — not deactivation.

**Suggested destination:** `docs/methodology/work-unit-lifecycle/` § Deactivation vs Pause vs
Integration vs Abandonment — adopter-facing conceptual framing of deactivation's scope relative
to sibling lifecycle operations. Natural pair with the Case Matrix (still inline in the
workflow) since the Case Matrix operationalizes this principle.

**Stylistic integration notes:** Trimmed workflow deletes the callout outright — the Case
Matrix + Prerequisites make the operational boundary concrete (Case A is the only workflow-
applicable case; Cases B/C/D route to other workflows explicitly named in the matrix and § When
NOT to Deactivate). The callout is a conceptual lens on the same information, not a procedural
gate. Docs absorption should preserve the italics on "*Deactivation means undo-activation of a
work unit that didn't meaningfully start.*" — the emphasis signals this is the definitional
clause. The three sibling-operation references (pause / completion / abandonment) map onto the
same three workflows the Case Matrix routes to, so docs absorption can cross-reference or
consolidate.

## Entry 45 — deactivate-work-unit.md § Case Matrix — "Only Case A is genuine deactivation" rationale

**Source:** `.arc/system/workflows/arc/work-unit-lifecycle/deactivate-work-unit.md` (lines
34-36, pre-trim — the paragraph following the Case Matrix table); package-source copy same
line range — straight two-copy file.

**Content:**

> Only Case A is genuine deactivation — the implementation branch is the entire surface area of
> the activation, so deleting it undoes the activation by construction. The other three have
> work or merged state that moves them out of deactivation semantics into pause, integration, or
> archival lifecycles.

**Suggested destination:** `docs/methodology/work-unit-lifecycle/` § Deactivation Scope —
pairs with Entry 44 (Design principle). Adopter-facing rationale connecting the Case Matrix's
routing to the underlying "branch = activation surface area" invariant.

**Stylistic integration notes:** Trimmed workflow keeps the Case Matrix table and drops the
rationale paragraph that follows. Agents executing deactivation apply the Case Matrix directly
("is your WU Case A/B/C/D?"); adopters learning the model benefit from knowing *why* the
matrix routes that way. The key insight worth preserving in docs is the invariant — "the
implementation branch is the entire surface area of the activation, so deleting it undoes the
activation by construction" — which is the structural property that makes Case A tractable and
Cases B/C/D intractable via deactivation. Docs absorption could consolidate this with Entry 44
into a single § Deactivation Scope page covering both the conceptual framing and the
matrix-rationale.

## Entry 46 — deactivate-work-unit.md § Case B — "Why this isn't deactivation" rationale

**Source:** `.arc/system/workflows/arc/work-unit-lifecycle/deactivate-work-unit.md` (lines
209-211, pre-trim — the paragraph under the "Case B — Not merged, some work executed → Pause"
heading, immediately before the shift-model descriptive paragraph); package-source copy same
line range — straight two-copy file.

**Content:**

> **Why this isn't deactivation:** Branch deletion discards in-flight task work; preservation
> via state-field flip (pause) is the shift lifecycle's job, not deactivation's.

**Suggested destination:** `docs/methodology/work-unit-lifecycle/` § Case B: Pause Pattern or
consolidated with Entries 47-48 into a single § When Not to Deactivate reference covering all
three "Why this isn't..." rationales. Adopter-facing clarification of the deactivation/pause
boundary.

**Stylistic integration notes:** Trimmed workflow keeps the Case B heading, the shift-model
descriptive paragraph ("A WU with partial task work that the developer wants to park is
`arc-shift` pause territory. Shift uses a metadata-in-place pattern..."), and the Status
callout about `arc-shift` being future. Drops only the "Why this isn't deactivation" opener.
Same lens as Entry 44/45: rationale for why routing happens belongs in docs; the routing itself
(Case B → `arc-shift`) is operational and stays. The three Case B/C/D entries (46, 47, 48)
should land together in docs — they form a coherent reference on why the Case Matrix routes
away from deactivation in the three non-Case-A cells.

## Entry 47 — deactivate-work-unit.md § Case C — "Why this isn't Case A" rationale

**Source:** `.arc/system/workflows/arc/work-unit-lifecycle/deactivate-work-unit.md` (lines
224-225, pre-trim — the paragraph under the "Case C — Merged to base branch, no work executed
→ Reversal PR (edge case)" heading, immediately before the "**Procedure (rare):**" block);
package-source copy same line range — straight two-copy file.

**Content:**

> **Why this isn't Case A:** Activation's changes are already on the base branch as committed
> history, so branch deletion alone can't restore pre-activation state.

**Suggested destination:** `docs/methodology/work-unit-lifecycle/` § Case C: Reversal PR —
paired with Entries 46 and 48.

**Stylistic integration notes:** Trimmed workflow keeps the Case C heading, the "**Procedure
(rare):**" block (the three-step reversal-PR procedure), and the closing "No separate workflow
ships for Case C" sentence. Drops only the "Why this isn't Case A" opener. The rationale here
is subtly different from Case B's — Case C is structurally impossible-via-deactivation (the
Case-A surface area was already merged), whereas Case B is semantically-wrong-via-deactivation
(the work exists and shouldn't be discarded). Docs absorption should keep both phrasings
distinct; the "committed history means branch deletion doesn't restore state" insight is
Case-C-specific and worth preserving verbatim.

## Entry 48 — deactivate-work-unit.md § Case D — "Why this isn't deactivation" rationale

**Source:** `.arc/system/workflows/arc/work-unit-lifecycle/deactivate-work-unit.md` (lines
242-243, pre-trim — the paragraph under the "Case D — Merged to base branch, some work
executed → Integrate or Clean" heading, immediately before the two-bullet routing block);
package-source copy same line range — straight two-copy file.

**Content:**

> **Why this isn't deactivation:** Reversing merged history is the opposite of undo-activation;
> the honest path is either finishing the WU or archiving it with abandoned status.

**Suggested destination:** `docs/methodology/work-unit-lifecycle/` § Case D: Integrate or
Abandon — paired with Entries 46 and 47.

**Stylistic integration notes:** Trimmed workflow keeps the Case D heading and the two-bullet
routing block ("Complete and ship the WU" → integrate, "Abandon remaining work" → clean).
Drops the "Why this isn't deactivation" opener. Case D's rationale is the most strongly-worded
of the three: "reversing merged history is the opposite of undo-activation" frames the
attempted operation as categorically wrong, not merely routed-elsewhere. The "honest path"
phrasing carries editorial weight — it names finishing or explicitly abandoning as the morally
correct alternative to reverting merged work. Docs absorption should preserve the phrasing
verbatim; these entries (46, 47, 48) together form a pattern where each Case's routing
rationale is calibrated to its specific failure mode.

## Entry 49 — rotate-branch.md § Preamble — Rotate/Integrate/Archive three-operation framing

**Source:** `.arc/system/workflows/arc/work-unit-lifecycle/rotate-branch.md` (lines 8-11,
pre-trim — the framing paragraph preceding "When to use"); package-source copy same line
range — straight two-copy file.

**Content:**

> Multi-branch work units go through three operations: **Rotate → Integrate → Archive**. This
> workflow covers Rotate — the intermediate merge. A branch's scope of work is done, but the
> overall task list has more work remaining on a subsequent branch.

**Suggested destination:** `docs/methodology/work-unit-lifecycle/` § Multi-Branch Work Units —
adopter-facing conceptual framing of the three-operation pipeline (Rotate / Integrate /
Archive). Natural pair with the workflow selection matrix and the `strategy-work-organization.md`
task-lists-and-branches model.

**Stylistic integration notes:** Trimmed workflow deletes the paragraph outright — the When
to use / When NOT to use blocks already carry the decision gate (tasks on this branch complete
and more tasks remain → rotate; all tasks complete → integrate-work-unit). The Rotate →
Integrate → Archive
triad names the operations sequentially, which is pedagogical for a reader learning the
methodology but redundant for an agent picking a workflow by trigger conditions. Docs
absorption should preserve the **Rotate → Integrate → Archive** arrow sequence — it reads as
a memorable mnemonic for the three-operation lifecycle.

## Entry 50 — rotate-branch.md § Scenarios — multi-branch pattern enumeration

**Source:** `.arc/system/workflows/arc/work-unit-lifecycle/rotate-branch.md` (lines 19-28,
pre-trim — the entire § Scenarios section); package-source copy same line range — straight
two-copy file.

**Content:**

> ## Scenarios
>
> This workflow applies to any multi-branch pattern:
>
> - **Stacked PRs** — A large task list split across 2-3 branches for smaller, reviewable pull requests
> - **Phased delivery** — Sequential branches delivering different phases of the same task list to the
>   base branch
> - **Team sub-branches** — A developer merging their personal branch into a shared integration branch
>
> See [Work Organization Strategy § Task Lists and Branches][work-org-branches] for the complete
> many-to-one relationship model.

**Suggested destination:** `docs/methodology/work-unit-lifecycle/` § Multi-Branch Patterns —
adopter-facing scenario taxonomy. Pairs with Entry 49 (three-operation framing) and the
`strategy-work-organization.md` many-to-one task-lists-and-branches model already referenced
in the quoted block. Useful as a scannable decision aid for teams deciding whether to split
work across branches.

**Stylistic integration notes:** Trimmed workflow deletes the section wholesale, including the
`[work-org-branches]` link definition (orphan after removal). The three scenarios are
mutually non-exclusive (a stacked PR may also be a phased delivery, a team sub-branch may be
part of a stacked PR), and the workflow steps below apply identically regardless of which
pattern triggered the rotation — the enumeration is pedagogical scaffolding, not a
dispatch table. Agents executing rotation don't need the taxonomy to follow the steps. Docs
absorption should preserve the three named patterns with their definitions — they're common
multi-branch modes teams adopt.

## Entry 51 — rotate-branch.md § Step 2 Prepare for Merge — squash merge consequence explanation

**Source:** `.arc/system/workflows/arc/work-unit-lifecycle/rotate-branch.md` (lines 66-72,
pre-trim — the full `> If merge.strategy: squash:` blockquote); package-source copy same line
range — straight two-copy file. **Partial extract** — the trimmed workflow retains the
consequence signal + operational recommendation.

**Content (full pre-trim blockquote):**

> **If `merge.strategy: squash`:** Squash-merging an intermediate branch collapses its commits into a
> single commit on the base. Any downstream branches that still reference the original commits will face
> conflict-heavy rebases — Git cannot reconcile the squashed commit with the originals. For multi-branch
> work, consider using regular merge for intermediate PRs even when squash is the project default, or
> plan for the manual rebase cost on downstream branches. See [Configurability Architecture §
> Merge Strategy][config-merge] for behavioral implications of each strategy.

**Retained in trimmed workflow:**

> **If `merge.strategy: squash`:** Squash on an intermediate branch breaks downstream rebases —
> consider regular merge for multi-branch work even when squash is the project default. See
> [Configurability Architecture § Merge Strategy][config-merge].

**Extracted (removed from workflow):** The mechanistic expansion of *why* squash breaks
rebases ("collapses its commits into a single commit on the base. Any downstream branches
that still reference the original commits will face conflict-heavy rebases — Git cannot
reconcile the squashed commit with the originals") and the alternative framing ("plan for the
manual rebase cost on downstream branches").

**Suggested destination:** `docs/reference/git-operations/` § Squash Merge Behavior or
`docs/methodology/branch-management/` § Merge Strategy Tradeoffs — adopter-facing explanation
of why squash breaks downstream rebases, with the git mechanic (single-commit collapse → lost
commit identity → rebase cannot reconcile) spelled out.

**Stylistic integration notes:** The consequence signal ("breaks downstream rebases") is the
operationally necessary piece — it justifies the non-default recommendation (regular merge)
strongly enough that an agent reading the trimmed workflow understands why. The mechanistic
explanation is reference-guide content: a reader who *wants* to understand git's behavior
under squash benefits from it, but an agent executing rotation only needs the consequence +
recommendation. Partial-extract pattern — distinct from wholesale extraction (e.g., Entries
36, 40 Common Pitfalls). Docs absorption should treat the full blockquote as a single teaching
unit; merging with `strategy-configurability-architecture.md` § Merge Strategy content is a
natural consolidation path.

## Entry 52 — rotate-branch.md § Step 5 Update Tracking — "Rotation split across sessions" blockquote

**Source:** `.arc/system/workflows/arc/work-unit-lifecycle/rotate-branch.md` (lines 128-133,
pre-trim — the blockquote following the Step 5 checklist); package-source copy same line
range — straight two-copy file.

**Content:**

> **Rotation split across sessions:** When an external action (npm publish, platform repo rename,
> manual smoke test) splits a rotation across sessions, the status file on the rotation branch
> carries state across the gap. The next session's session-init resolves the active status file
> by `**Branch:**` match — no special handling needed beyond the normal session-handoff /
> session-init cycle.

**Suggested destination:** `docs/methodology/sessions/` § Session Boundaries During Multi-Step
Operations or `docs/reference/session-state/` § Cross-Session Continuity — adopter-facing
reassurance that the normal session-init / session-handoff cycle handles cross-session
multi-step workflow gaps without special handling. Natural pair with session-operations
strategy content.

**Stylistic integration notes:** Trimmed workflow deletes the blockquote outright —
session-init and session-handoff are already the default session-boundary mechanics, and
their workflows handle status-file resolution and SESSION-NOTES continuity generically. The
blockquote is reassurance that "no special rotation-specific handling is needed" rather than
a procedural gate. Agents executing rotation don't need this clarification to proceed; an
adopter learning the methodology benefits from seeing the cross-session case called out
explicitly. The three named external-action examples (npm publish, repo rename, smoke test)
are concrete triggers worth preserving — they show this isn't a hypothetical case.

## Entry 53 — rotate-branch.md § Common Pitfalls

**Source:** `.arc/system/workflows/arc/work-unit-lifecycle/rotate-branch.md` (lines 137-146,
pre-trim — the entire § Common Pitfalls section body); package-source copy same line range —
straight two-copy file.

**Content:**

> - **Squash-merging intermediate branches** — Breaks downstream branch rebases. See merge strategy
>   note in step 2.
> - **Archiving too early** — Rotation is not archival. Archive only when **all** tasks in the task list
>   are complete. See [integrate-work-unit][integrate-work-unit].
> - **Forgetting `Branch(es)` field update** — Stale tracking makes session initialization harder for
>   the next session or collaborator.
> - **Not rebasing downstream branches** — After merging to the base branch, existing downstream branches
>   still reference old commits. Rebase them onto the updated base to avoid orphaned history.

**Suggested destination:** `docs/methodology/work-unit-lifecycle/` § Common Pitfalls or folded
into a docs-wide § Anti-Patterns reference collecting pitfalls from multiple workflows.
Natural pair with Entries 36 (archive-work-unit) and 40 (clean-work-unit) Common Pitfalls —
the three cover distinct lifecycle phases with overlapping adopter audience.

**Stylistic integration notes:** Trimmed workflow deletes the section wholesale. Same lens as
Entries 16, 36, 40: anti-pattern enumerations are reference-guide material, not
workflow-execution material. The step-level instructions already encode correct behavior for
each pitfall — Step 1 readiness checklist enforces "tasks on this branch complete but NOT all
tasks", Step 2 merge strategy blockquote warns against squash, Step 2/5 explicitly require
`Branch(es)` field update, Step 4 covers downstream rebase via `--force-with-lease`. Docs
absorption should preserve the `term — explanation` format and consolidate with Entry 36's
archive-work-unit pitfalls and Entry 40's clean-work-unit pitfalls into a single "Work Unit
Lifecycle Anti-Patterns" docs page.

## Entry 54 — activate-planning-branch.md § Preamble — "lighter, because..." rationale tail

**Source:** `.arc/system/workflows/arc/work-unit-lifecycle/planning/activate-planning-branch.md`
(line 11, pre-trim — the trailing "— lighter, because..." clause of the preamble paragraph);
package-source copy same line — straight two-copy file.

**Content (pre-trim preamble):**

> Creates a planning branch for delivering planning artifacts (and optionally archival of a prior work unit)
> to the base branch. This is the planning-side counterpart to [activate-work-unit][activate-work-unit] —
> lighter, because planning branches carry artifacts rather than implementation.

**Extracted (removed from workflow):** The "— lighter, because planning branches carry
artifacts rather than implementation." fragment.

**Suggested destination:** `docs/methodology/work-unit-lifecycle/` § Planning vs Implementation
Branches — adopter-facing conceptual framing of why planning-branch workflows are lighter than
their implementation counterparts. Pairs with Entry 57 (integrate-planning-branch's parallel
rationale tail).

**Stylistic integration notes:** Trimmed workflow keeps the counterpart reference to
`activate-work-unit.md` but drops the "— lighter, because..." rationale tail. The adjacency
between `activate-planning-branch.md` and `activate-work-unit.md` is operational (the
counterpart link lets an agent find the parallel implementation-side workflow); the
"because..." framing is pedagogical. Docs absorption should consolidate with Entry 57 into a
single explanation of the planning/implementation distinction — the two preambles use
near-identical phrasing for parallel reasons.

## Entry 55 — activate-planning-branch.md § Step 3 Create Planning Branch — "Name mismatch" rationale

**Source:** `.arc/system/workflows/arc/work-unit-lifecycle/planning/activate-planning-branch.md`
(lines 74-79, pre-trim — the third Naming conventions bullet); package-source copy same line
range — straight two-copy file.

**Content (pre-trim bullet):**

> - Name mismatch between planning branch and final work unit is normal — scope may shift
>   during planning review. If the shift is significant (e.g., one work unit becomes two, or
>   the scope changes entirely), rename the branch to match: `git branch -m {old} {new}` and
>   update the remote. Planning branches are short-lived and pre-merge, so renaming is low-risk

**Retained in trimmed workflow:**

> - **If scope shifts significantly during planning:** `git branch -m {old} {new}` and update the remote

**Extracted (removed from workflow):** The reassurance framing ("Name mismatch... is normal —
scope may shift during planning review", "Planning branches are short-lived and pre-merge, so
renaming is low-risk") and the concrete scope-shift examples ("one work unit becomes two, or
the scope changes entirely").

**Suggested destination:** `docs/methodology/planning/` § Naming and Scope Evolution or folded
into an adopter-facing walkthrough of how planning branches accommodate mid-planning scope
changes. The "short-lived and pre-merge, so renaming is low-risk" reassurance is worth
preserving — it signals to cautious adopters that branch renames at this stage are not the
destructive operations they might be elsewhere.

**Stylistic integration notes:** Partial-extract pattern. The `git branch -m {old} {new}`
mechanic is operational; the rest is reassurance + examples. Retained bullet uses an imperative
conditional header to replace the declarative reassurance-led form. Docs absorption should
preserve the "scope may shift during planning review" framing — it positions the rename as an
expected outcome of the planning process, not error correction.

## Entry 56 — activate-planning-branch.md § Common Pitfalls

**Source:** `.arc/system/workflows/arc/work-unit-lifecycle/planning/activate-planning-branch.md`
(lines 97-105, pre-trim — the entire § Common Pitfalls section body); package-source copy
same line range — straight two-copy file.

**Content:**

> - **Forgetting to pull before branching** — The planning branch should fork from the latest base
>   branch, especially after a PR merge. Stale base means the planning branch diverges unnecessarily.
> - **Skipping implementation branch cleanup** — Stale local branches accumulate and create confusion
>   during future session-init (agent sees branches that no longer exist on remote).
> - **Creating a planning branch when not needed** — Under partially protected mode (solo), planning
>   artifacts can go directly to the base branch. Don't add process overhead that your protection
>   mode doesn't require.

**Suggested destination:** `docs/methodology/work-unit-lifecycle/` § Common Pitfalls or folded
into a docs-wide § Anti-Patterns reference alongside Entries 36, 40, 53. The third pitfall
(unnecessary planning branch under partial protection) is a notable protection-mode-specific
callout and could alternatively live under `docs/reference/protection-modes/` § Full vs
Partial — Operational Differences.

**Stylistic integration notes:** Trimmed workflow deletes the section wholesale. Step 1
already covers "Ensure Clean Base Branch" with `git pull origin {base-branch}`, Step 2 covers
prior implementation branch cleanup, and the preamble's Protection mode context paragraph
covers the partial-protection direct-commit exception. Each pitfall restates an operational
directive as an anti-pattern. Docs absorption should consolidate with Entries 53, 59 into a
work-unit lifecycle anti-patterns reference.

## Entry 57 — integrate-planning-branch.md § Preamble — "because planning branches carry artifacts" rationale tail

**Source:** `.arc/system/workflows/arc/work-unit-lifecycle/planning/integrate-planning-branch.md`
(lines 11-12, pre-trim — the trailing "because planning branches carry artifacts, not
implementation." clause); package-source copy same line range — straight two-copy file.

**Content (pre-trim preamble):**

> Planning branches deliver planning artifacts (PRDs, task lists) and optionally archival of a prior work unit
> to the base branch via PR. This is intentionally lighter than [integrate-work-unit][integrate-work-unit] —
> no completion doc, no pre-merge review, no task verification — because planning branches carry artifacts,
> not implementation.

**Extracted (removed from workflow):** The "— because planning branches carry artifacts, not
implementation." rationale clause.

**Suggested destination:** `docs/methodology/work-unit-lifecycle/` § Planning vs Implementation
Branches — natural pair with Entry 54 (the parallel rationale from
`activate-planning-branch.md`). Both preambles use near-identical "because planning branches
carry artifacts rather than implementation" phrasing to justify lighter workflows.

**Stylistic integration notes:** Trimmed workflow retains the "Lighter than
[integrate-work-unit]" adjective and the operational delta list ("no completion doc, no
pre-merge review, no task verification") — both are signal for agents selecting the correct
workflow and for adopters scanning the difference between implementation and planning
integration. Drops the "because..." explanation. Docs absorption should merge Entries 54 and
57 into a single explanation of why planning-branch workflows are lighter; the duplication
across the two preambles is deliberate reinforcement that simplifies when consolidated.

## Entry 58 — integrate-planning-branch.md § Step 2 Push and Create PR — "Scope of the PR body" expansion

**Source:** `.arc/system/workflows/arc/work-unit-lifecycle/planning/integrate-planning-branch.md`
(lines 86-90, pre-trim — the "Scope of the PR body" paragraph following the PR description
guidance); package-source copy same line range — straight two-copy file.

**Content (pre-trim):**

> **Scope of the PR body:** Describe what this PR delivers, not what happens next. Workflow
> continuity (post-merge activation, session boundaries, "next action after merge" style
> sections) belongs in SESSION-NOTES, not the PR body. The reader is reviewing a change set —
> keep the body scoped to what they need to evaluate it. See [DEV-RULES.ARC][dev-rules-arc]
> § Write for the reader.

**Retained in trimmed workflow:**

> **PR body scope:** Describe what the PR delivers, not post-merge workflow continuity (see
> [DEV-RULES.ARC][dev-rules-arc] § Write for the reader).

**Extracted (removed from workflow):** The expansion listing specific examples of post-merge
workflow continuity ("post-merge activation, session boundaries, 'next action after merge'
style sections"), the "belongs in SESSION-NOTES" specific routing pointer, and the
reader-framing sentence ("The reader is reviewing a change set — keep the body scoped to what
they need to evaluate it").

**Suggested destination:** Fold into `docs/reference/writing-guidelines/` § Write for the
Reader as additional examples of reader-hostile patterns, or into `docs/methodology/prs/` §
PR Body Scope as a concrete walkthrough. The canonical rule lives in DEV-RULES.ARC § Write
for the reader — this paragraph is a PR-body-specific application of the rule, with the
"next action after merge" pattern being a particularly common violation.

**Stylistic integration notes:** Trimmed workflow retains the operational rule (describe
what's delivered, not continuity) + the DEV-RULES.ARC reference. Drops the enumeration of
specific violation examples and the routing pointer (SESSION-NOTES vs PR body). Partial
extract — retained form is ~40% of original length. The extracted examples are actionable
diagnostic material ("post-merge activation, session boundaries, 'next action after merge'
style sections" as concrete violations) better suited to a reference guide than an inline
workflow callout.

## Entry 59 — integrate-planning-branch.md § Common Pitfalls

**Source:** `.arc/system/workflows/arc/work-unit-lifecycle/planning/integrate-planning-branch.md`
(lines 130-139, pre-trim — the entire § Common Pitfalls section body); package-source copy
same line range — straight two-copy file.

**Content:**

> - **PM updates for the new WU on the planning branch** — Activation-triggered updates (ROADMAP marking
>   new WU in-progress, PROJECT-STATUS updates) belong in [activate-work-unit][activate-work-unit], not
>   here. Only archival-triggered updates (marking the completed WU) belong on batch branches.
> - **Moving files from backlog to active** (arc-in-git) — That's
>   [activate-work-unit][activate-work-unit] Step 3. Planning branches deliver to `backlog/`;
>   activation moves to `active/`.
> - **Skipping quality gates** — Planning artifacts are documentation — markdown linting still applies.
> - **Forgetting branch cleanup** — Delete the planning branch after merge to keep branches tidy.

**Suggested destination:** `docs/methodology/work-unit-lifecycle/` § Common Pitfalls alongside
Entries 36, 40, 53, 56. The first two pitfalls (PM updates, backlog→active movement) duplicate
the § Scope Boundaries ✅/❌ list retained in the trimmed workflow — docs absorption should
consolidate these with the scope-boundaries content into one "What belongs on a planning
branch" reference page rather than carrying both forms forward.

**Stylistic integration notes:** Trimmed workflow deletes the section wholesale. Of the four
pitfalls: two (PM updates, backlog→active movement) duplicate the § Scope Boundaries block
immediately above; one (skipping quality gates) restates Step 1's readiness checklist; one
(branch cleanup) restates Step 4's cleanup commands. The Common Pitfalls form is
rationale-led — each bullet names an anti-pattern then explains the correct behavior. The
Scope Boundaries form is operationally-led — it lists what belongs / doesn't belong without
anti-pattern framing. Retaining Scope Boundaries (decision documented in this task's
pre-implementation discussion) and dropping Common Pitfalls preserves the actionable form
while eliminating rationale duplication.

## Entry 60 — manage-incidental-work.md § Overview — reactive/proactive framing

**Source:** `.arc/system/workflows/arc/supplemental/manage-incidental-work.md` (lines 14-22,
pre-trim — the entire § Overview section including enclosing `---` separators); package-source
copy same line range — straight two-copy file.

**Content:**

> ## Overview
>
> Incidental work is **reactive** (discovered during implementation) vs **proactive** (planned work with PRDs).
> This workflow covers what makes incidental work unique—execution follows standard task loop,
> archival follows standard archive workflow.

**Suggested destination:** `docs/methodology/incidental-work/` § What Is Incidental Work —
adopter-facing conceptual framing distinguishing incidental from proactive planned work.
Natural pair with a broader "kinds of work" overview alongside feature/technical/incidental
categorization.

**Stylistic integration notes:** Trimmed workflow deletes the section wholesale. The
reactive-vs-proactive distinction is useful pedagogy for adopters learning what incidental
work is; for an agent executing the workflow, the `purpose:` frontmatter + "When to use"
trigger already scope the decision. The second sentence ("execution follows standard task
loop, archival follows standard archive workflow") duplicates the § Execution, Completion, and
Archival section at the file's bottom, which carries the same pointers operationally. Docs
absorption should preserve the reactive/proactive framing — it's the cleanest one-line
distinction between this workflow's scope and the main PRD→tasks planning pipeline.

## Entry 61 — manage-incidental-work.md § When to Create > Key Distinction — example paragraphs

**Source:** `.arc/system/workflows/arc/supplemental/manage-incidental-work.md` (lines 33-37,
pre-trim — the two `Example:` paragraphs under "### The Key Distinction"); package-source copy
same line range — straight two-copy file.

**Content:**

> Example: "Clean up auth tech debt" with 5 ordered steps touching 7 files is **one coherent
> concern** - stays atomic.
>
> Example: "Investigate performance issue" requiring profiling → analysis → design →
> implementation is **multiple phases** - needs task list.

**Suggested destination:** `docs/methodology/incidental-work/` § Atomic vs Task List —
adopter-facing pedagogical examples illustrating the "sequential steps toward one goal" vs
"distinct phases with different objectives" distinction. Pairs naturally with the ✅/❌ bullet
lists retained in the trimmed workflow.

**Stylistic integration notes:** Trimmed workflow keeps the "sequential steps → atomic /
distinct phases → task list" bullet pair that opens "### The Key Distinction" and the full
✅/❌ decision-tree bullets below. Drops the two paragraph-length examples that illustrate
each side. Agents facing the decision have the ✅/❌ criteria; adopters learning to recognize
the pattern benefit from worked examples. The "auth tech debt / 5 ordered steps" and
"performance issue / profiling → analysis → design → implementation" examples are deliberately
contrasting — same-domain cleanup work stays atomic, cross-domain investigation-led work
escalates to task list.

## Entry 62 — manage-incidental-work.md § When to Create > Why This Matters — rationale paragraph

**Source:** `.arc/system/workflows/arc/supplemental/manage-incidental-work.md` (lines 53-57,
pre-trim — the "### Why This Matters" subsection opener paragraph); package-source copy same
line range — straight two-copy file.

**Content:**

> ### Why This Matters
>
> Task lists add overhead: file creation, phase structure, branch lifecycle, archival process. This
> overhead pays off when work genuinely has distinct phases that benefit from independent tracking.
> It's wasted ceremony for focused refactors that happen to touch multiple files.

**Suggested destination:** `docs/methodology/incidental-work/` § Why the Distinction Matters —
adopter-facing rationale for the atomic-vs-task-list gate. Useful alongside Entry 61's
examples and the retained ✅/❌ criteria. Names the specific overhead types (file, phase,
branch lifecycle, archival) so adopters evaluating a borderline case can weigh them
concretely.

**Stylistic integration notes:** Trimmed workflow keeps the "Session duration is not a factor"
paragraph (it's a decision-gate anti-pattern, not rationale) but drops this paragraph, which
justifies *why* the decision criteria exist. For an agent executing the workflow, the ✅/❌
criteria are the operational gate — the justification doesn't change how the decision is
made. Docs absorption should preserve the "wasted ceremony for focused refactors that happen
to touch multiple files" phrasing — it names the specific failure mode the distinction
prevents.

## Entry 63 — manage-incidental-work.md § Step 1 Create Task File — filename examples

**Source:** `.arc/system/workflows/arc/supplemental/manage-incidental-work.md` (lines 72-78,
pre-trim — the three `tasks-*.md` filename examples following the Naming line); package-source
copy same line range — straight two-copy file. **Partial extract** — the trimmed workflow
retains a single inline example.

**Content (pre-trim):**

> Examples:
>
> - `tasks-filter-integration-testing.md`
> - `tasks-api-type-safety.md`
> - `tasks-security-updates.md`

**Retained in trimmed workflow:**

> **Naming**: `tasks-{brief-descriptive-slug}.md` (no `incidental-` prefix — directory name
> provides that context; e.g., `tasks-auth-error-handling.md`)

**Extracted (removed from workflow):** The three-example `Examples:` bulleted list. A single
inline example (`tasks-auth-error-handling.md`) replaces it in-place, keeping one concrete
pattern instance.

**Suggested destination:** `docs/methodology/incidental-work/` § Naming Conventions or folded
into an adopter-facing walkthrough of naming patterns across work categories. The three named
examples (filter-integration-testing, api-type-safety, security-updates) cover distinct
incidental-work shapes — test infrastructure, API quality, security — which makes them a
useful breadth sample for docs absorption.

**Stylistic integration notes:** Partial-extract pattern (same shape as Task 4.5.c Entries 51,
55, 58). The `tasks-auth-error-handling.md` inline example retained in the trimmed form
matches the concrete example used in the Track-Creation-with-Commit commit-message template
below (which references "auth-error-handling" as the slug) — a single consistent example
thread runs through the workflow now rather than three disconnected ones. Docs absorption can
restore the breadth by presenting multiple named examples side by side.

## Entry 64 — manage-incidental-work.md § Step 2 Track Creation with Commit — concrete commit example

**Source:** `.arc/system/workflows/arc/supplemental/manage-incidental-work.md` (lines 114-123,
pre-trim — the `**Example**:` code fence block following the generic commit-message template);
package-source copy same line range — straight two-copy file.

**Content:**

> **Example**:
>
> ```
> docs(api-modernization): create auth-error-handling incidental task list
>
> Triggered by Task 3.2 investigation revealing unhandled edge cases in token refresh.
> Pausing API modernization to address authentication error handling.
>
> Related to: .arc/active/technical/tasks-api-modernization.md
> ```

**Suggested destination:** `docs/methodology/incidental-work/` § Commit Message for Task List
Creation or folded into an adopter-facing walkthrough showing generic template → concrete
example side-by-side. The generic "Commit message format" template retained in the workflow
carries the operational structure; this concrete example shows what a filled-in version looks
like.

**Stylistic integration notes:** Trimmed workflow keeps the generic "Commit message format"
code fence (with `{placeholders}`) but drops the filled-in `Example:` that follows it. Agents
executing the Step 2 instruction have the template with placeholders clearly marked
(`{current-branch}`, `{brief-slug}`, `{discovery context}`, etc.); the concrete example is
pedagogical scaffolding that helps adopters see what the filled form looks like in practice.
The "api-modernization / auth-error-handling / Task 3.2 / token refresh" specifics are a
coherent worked example across scope (api-modernization), interrupt (auth-error-handling),
and trigger (Task 3.2 investigation) — worth preserving as a single illustrative instance in
docs.

## Entry 65 — manage-incidental-work.md § Git Branch for Incidental Work — reassurance line

**Source:** `.arc/system/workflows/arc/supplemental/manage-incidental-work.md` (line 141,
pre-trim — the reassurance sentence following the full-protection exception block);
package-source copy same line — straight two-copy file.

**Content:**

> This is normal under full protection. Not every branch is a work unit.

**Suggested destination:** `docs/reference/branch-protection/` § Branches vs Work Units or
folded into a broader "kinds of branches" reference alongside work-unit branches, planning
branches, and incidental branches. The "not every branch is a work unit" framing is useful
for adopters who may conflate "branch exists" with "formal work unit exists" — a common
mental-model trap under full protection.

**Stylistic integration notes:** Trimmed workflow drops the reassurance line but retains the
full-protection exception block that establishes *when* a branch-without-a-work-unit is
appropriate (atomic task under full protection, unrelated to current scope). For an agent
executing the workflow, the exception block's operational sequence (create branch → commit →
PR → merge → delete, no archival) is sufficient; the reassurance is adopter-psychology
framing. The two-sentence form ("This is normal... Not every branch is a work unit.") is
compact enough that docs absorption can carry it forward verbatim.

## Entry 66 — maintain-project-docs.md § Document Hierarchy — session-init loading model recap

**Source:** `.arc/system/workflows/arc/supplemental/maintain-project-docs.md` (lines 126-148,
pre-trim — the entire § Document Hierarchy section with its three subsections); package-source
copy same line range — straight two-copy file.

**Content:**

> ## Document Hierarchy
>
> ### Always Read (Session Init)
>
> - `AGENT-BRIEFING.ARC.md` + `AGENT-BRIEFING.PROJECT.md` - ARC orientation and project context
> - Active status file (`active/{category}/status-{name}.md`) - Active work state
> - `SESSION-NOTES.md` - Personal session context (if exists)
> - `DEV-RULES.ARC.md` - Framework development methodology (commit, verification, session/task rules)
> - `DEV-RULES.PROJECT.md` - Quality gates and project-specific rules
> - `3_process-task-loop.md` - Task execution workflow
> - `QUICK-REFERENCE.md` - Commands and environment
>
> ### Read On-Demand
>
> - `prepare-commits.md` - When committing complex or accumulated changes
> - `manage-incidental-work.md` - When handling discovered issues
> - `session-handoff.md` - When ending sessions
> - `maintain-project-docs.md` (this file) - When updating documentation
>
> ### Meta-Documentation (Not for AI Session Init)
>
> - This file (`maintain-project-docs.md`)
> - Any future documentation about documentation

**Suggested destination:** This content is obsolete, not absorption-ready. The authoritative
session-init loading model lives in `.arc/system/workflows/arc/session-lifecycle/session-init.md`
(Step 4 "Load Context Documents") and is overridable via the [session-state method][arc-methods-session].
This trimmed-out hierarchy is a stale-by-design shadow copy — docs absorption should link to
the session-init workflow's canonical list rather than carrying this content forward. Retain
for historical reference during the sweep; mark for discard once the final docs site resolves
the loading model.

**Stylistic integration notes:** Trimmed workflow deletes the section wholesale. Rationale:
`maintain-project-docs.md` is about doc maintenance; the session-init loading model is a
different concern that happens to inform one kind of doc maintenance (deciding whether new
content belongs in session-init reading). That awareness stays via the "Adding New Content"
subsection of § Common Maintenance Tasks earlier in the file, which asks "Is this needed for
EVERY session, or just specific work types?" — the operationally relevant question without
the full taxonomy. Docs absorption should treat this as a duplication-of-canonical-content
entry (like Entry 32's activate-work-unit "How artifacts reach the base branch" blockquote
that duplicated routing information) rather than net-new content to preserve. **Deviation
from standard destination framing** — flagged explicitly because the content is known-stale
rather than docs-absorption-ready.

## Entry 67 — maintain-project-docs.md § Maintenance Best Practices > Single Source of Truth — example

**Source:** `.arc/system/workflows/arc/supplemental/maintain-project-docs.md` (lines 60-61,
pre-trim — the `Example:` paragraph following the SSOT bullet list); package-source copy same
line range — straight two-copy file.

**Content:**

> **Example**: Task completion protocol belongs in `3_process-task-loop.md`.
> Other documents should reference it, not duplicate it.

**Suggested destination:** `docs/methodology/documentation/` § Single Source of Truth —
adopter-facing illustration of the SSOT principle with a specific example (task completion
protocol's canonical location). Natural pair with broader SSOT guidance in docs.

**Stylistic integration notes:** Trimmed workflow keeps the three SSOT bullets (each concept
one authoritative location, reference-don't-duplicate, contradictions-from-multiple-variations)
but drops the illustrative example. Agents reading the principle have the rule; adopters
internalizing the principle benefit from seeing what it looks like in practice. The
"task completion protocol belongs in `3_process-task-loop.md`" callout is also a useful
cross-file pointer in its own right — docs absorption can preserve the example as both SSOT
illustration and an authoritative-location directory entry.

## Entry 68 — integrate-external-content.md § Preamble — Skills context blockquote

**Source:** `.arc/system/workflows/arc/supplemental/integrate-external-content.md` (lines
13-18, pre-trim — the `**Skills context:**` paragraph following the "When to use" block);
package-source copy same line range — straight two-copy file.

**Content:**

> **Skills context:** [Agent Skills](https://agentskills.io) are an open standard for giving agents
> procedural knowledge — supported across Claude Code, Cursor, Gemini CLI, VS Code Copilot, and many other
> tools. Skills work as standalone capabilities without ARC integration. This workflow is for when you want a
> Skill's behavior wired *into* ARC — as a method override, an extension hook, or a referenced strategy — so
> it participates in ARC's session lifecycle, quality gates, or workflow chain rather than existing as a peer
> document outside the system.

**Suggested destination:** `docs/reference/agent-skills/` § Skills and ARC Integration or
folded into a broader ecosystem/interop reference discussing how ARC relates to adjacent open
standards (Agent Skills, MCP, tool-specific conventions). The "Skills work as standalone
capabilities without ARC integration" framing is important for adopters choosing between
plain-Skill and wired-into-ARC options.

**Stylistic integration notes:** Trimmed workflow retains the preamble's "When to use" line
mentioning Skills as one content source (the operational trigger), but drops the
pedagogical expansion on what Agent Skills are and how they relate to ARC. For an agent
executing the workflow, the classification tree in Step 2 handles Skill-sourced content
identically to non-Skill content — the Skills-specific framing doesn't change the routing.
Adopters evaluating whether to wire a Skill into ARC vs. leave it standalone benefit from the
context this blockquote provides. Docs absorption should preserve the supported-tool
enumeration (Claude Code, Cursor, Gemini CLI, VS Code Copilot) — it signals Skills'
cross-agent portability.

## Entry 69 — strategy-session-operations.md § Push-Timing Reasoning — stakes & race-surface rationale

**Source:** `.arc/reference/strategies/arc/strategy-session-operations.md` (line 433, the
`[push-timing background][TODO-docs-site]` placeholder under § Interlock Model § Push-Timing
Reasoning); package-source copy same line. Full rationale authored during Task 1.3.b drafting but
not landed in source per operational-sufficiency cuts — the strategy retains only the operationally-
useful corollary (worktree-then-notes ordering); the supporting design rationale lives here.

**Content:**

> **Why per-commit auto-push is rejected.** Two arguments beyond the pairing constraint shape this
> decision:
>
> - **Stakes asymmetry.** Push is external-visible and less reversible than local commit. Local
>   commits can be amended, squashed, or reset before they leave the developer's machine; pushed
>   commits are observable to collaborators and CI, and retraction requires force-push (which
>   carries its own concurrency hazards). Concentrating push into deliberate ceremony reduces
>   accidental cascade surface — a single stray approval can't propagate work to origin.
> - **Concurrent-session safety.** Under parallel sessions (multiple worktrees, multiple machines,
>   or both), multiple sessions writing to the shared `refs/notes/arc/user/{identity}` ref near-
>   simultaneously creates ref-update races. Handoff-only push concentrates writes into deliberate
>   single events bounded by the user's invocation cadence; per-commit auto-push would compound
>   race surface linearly with commit cadence — a developer making ten commits in a session under
>   `auto-push` would multiply the race window by ten.

**Suggested destination:** docs site — Sessions & Context § Push timing, alongside operational
push-at-handoff guidance. Adopter-facing rephrase frames as forward-looking guidance ("how
push-at-handoff protects you in concurrent-session setups") rather than internal design-decision
narrative.

**Stylistic integration notes:** Strategy doc retains the operationally-useful pairing constraint
(worktree-first-then-notes, notes attach to commits) inline; this entry holds the deeper "why" that
adopters reading docs will want when evaluating their own autonomy configuration. Docs-site output
must not reference ADRs (internal-only; adopters do not have them). Keep the concurrent-session
example concrete (the "ten commits multiplies race window by ten" framing) — it's the kind of
operational concretion that converts an abstract argument into a decision aid.

## Entry 70 — strategy-session-operations.md § Status-File Timing — reviewer & auto-commit benefits

**Source:** `.arc/reference/strategies/arc/strategy-session-operations.md` (line 467, the
`[status-file timing background][TODO-docs-site]` placeholder under § Status-File Timing);
package-source copy same line. Full rationale authored during Task 1.3.b drafting but not landed
in source per operational-sufficiency cuts — the strategy retains the rule, the why-bound-to-
ceremony framing, and the dedicated handoff commit tradeoff; the additional benefits captured
here are adopter-interest "why" rather than behavior-shaping.

**Content:**

> **Commit-history readability.** Code commits and status commits serve different review needs.
> Bundling them — the prior model — meant every code review pass had to mentally filter out
> status-pointer churn to evaluate the actual code change, and every status-pointer review had to
> reconstruct timing by stitching together field deltas across many bundled commits. Separating
> them lets each kind of commit stand alone: a `chore(status): handoff …` commit is read once at
> the session boundary and ignored during code review; code commits stay focused on what they
> changed.
>
> **Auto-commit safety.** Under `auto-commit` mode, the agent's auto-fire scope is bounded to
> code-only — the agent never has to maintain status-file consistency mid-stream while also
> producing atomic code commits. The two responsibilities split cleanly: auto-fire produces code
> commits at task boundaries; the explicit handoff invocation produces the status commit. This
> separation removes a category of subtle atomicity errors (auto-commits that bundle code with
> stale or partial status updates) without requiring the auto-commit logic to understand
> status-file shape.

**Suggested destination:** docs site — Sessions & Context § Status-file timing or § Auto-commit
modes, alongside guidance on what commit history will look like under each autonomy configuration.
Adopters choosing between manual and auto modes need to anticipate what their PR history will
contain.

**Stylistic integration notes:** Strategy doc retains the operationally-useful tradeoff framing
(dedicated `chore(status): handoff …` commit appears in history) so adopters know what to expect
in concrete terms. This entry expands the *why* behind that shape — the reviewer-facing argument
and the auto-commit-safety argument both motivate the timing rule but don't change agent behavior
once configured. Docs-site output must not reference ADRs (internal-only; adopters do not have
them). Keep the framing concrete (what reviewers see, what auto-commit needs to worry about) —
abstract "separation of concerns" prose loses adopters; specific consequences land.

## Entry 71 — strategy-session-operations.md § Status-File Timing — task-list bundling rationale

**Source:** `.arc/reference/strategies/arc/strategy-session-operations.md` (around line 538, the
`[task-list timing background][TODO-docs-site]` placeholder appearing alongside the existing
`[status-file timing background][TODO-docs-site]` link in § Status-File Timing); package-source copy
same line. The strategy doc carries the volatility-vs-derived-state distinction inline as the
operationally-useful framing; the deeper "what alternatives would cost" rationale lives here for
adopters evaluating their own commit-shape conventions.

**Content:**

> **Why bundle task-list `[x]` flips with code, when status updates are separated.** A natural
> question for adopters reading the two rules side-by-side: both are markdown updates that
> accompany code work, why do they have opposite commit-shape conventions? The answer comes from
> what happens under each alternative.
>
> **If task-list flips were deferred to handoff (the tempting symmetry):**
>
> - **Cross-session staleness.** A session that completes Tasks 4.1–4.3 but ends without handoff
>   leaves the committed task list showing those tasks as `[ ]`. The next session's session-init
>   reads the task list to find Next Task and resolves wrong. Recovery requires either reading
>   commit messages to reconstruct what's actually done, or treating task-list state in git as
>   advisory rather than authoritative — both options erode the task list's role as the work-unit
>   pointer.
>
> - **Crash and interrupt fragility.** If a session dies mid-stream (machine crash, network drop,
>   accidental terminal close), the deferred-flip model means the git record lags reality. The
>   bundled-flip model gives crash-safe recovery: the last committed state always reflects work
>   actually done.
>
> - **Reviewability loss.** With bundled flips, a reviewer reads a commit subject like
>   `feat(arc): close 4.1 — code-only task commits + structured prompt`, sees the `[x] **4.1**`
>   flip in the same commit's diff, and has full traceability with no cross-reference. Move the
>   flip to a later "docs(arc): mark Tasks 4.1–4.3 complete" commit and the reviewer must
>   cross-reference task IDs across commits to answer "what task did this code commit complete?"
>   The task-list-rides-with-code rule preserves the at-a-glance linkage.
>
> - **Rebase / cherry-pick friction.** Picking a code commit means picking a change whose task-list
>   record is in a different commit. Reverts and bisects become tangled across artificial commit
>   boundaries.
>
> **What's different about status-file fields.** Status-file pointers (`Next Task`, `Last
> Completed`, `Next Action`) are *volatile* — value at time T is stale by T+10min as the session
> advances. The next consumer of the field is session-init, which only needs the value at the
> session boundary. Mid-session updates rewrite state that's about to change again; deferring to
> ceremony boundaries discards no information. Task-list `[x]` flips are *terminal*: the
> completion event won't reverse, and a future reader benefits from seeing the flip at the boundary
> that produced it.
>
> **The principle.** Volatile pointer state separates from content commits because separation
> discards no information. Terminal derived state bundles with content commits because separation
> would lose information (the linkage between content and its completion record).

**Suggested destination:** docs site — Sessions & Context § Status-file timing or a sibling
§ Commit-shape conventions. Adopters coming from other workflows (Jira-driven, design-doc-first,
no-in-repo-tracking) will read the side-by-side rules and want the rationale before adopting the
ARC convention. Pair this with Entry 70's reviewer / auto-commit framing under the same section.

**Stylistic integration notes:** Strategy doc retains the inline volatility-vs-derived-state
framing (operationally sufficient — adopters know which rule applies and the basic why); this
entry holds the alternative-analysis depth that adopters with skeptical priors will want. Docs-site
output must not reference ADRs. Keep the alternative-analysis framing concrete (specific failure
modes under deferred flips) rather than abstract — concrete consequences land where principle prose
slides off.

---

<!-- Reference link definitions for verbatim quoted content. These mirror reference labels that
     appear in source files quoted above so MD052 stays clean in the staging file. The sweep WU
     resolves these to final docs URLs alongside [TODO-docs-site] resolution. -->

[arc-config]: ../../../../system/arc-config.yml
[arc-methods-dir]: ../../../../system/methods/README.md
[core-philosophy]: https://andrewrcr.github.io/arc-framework/philosophy/
[arc-methods-session]: ../../../../system/methods/session-state.md
[dev-rules-arc]: ../../../../reference/constitution/DEV-RULES.ARC.md
[manage-incidental]: ../../../../system/workflows/arc/supplemental/manage-incidental-work.md
[work-org]: ../../../../reference/strategies/arc/strategy-work-organization.md
[work-org-branches]: ../../../../reference/strategies/arc/strategy-work-organization.md#task-lists-and-branches
[discovery-checklist]: ../../../../reference/strategies/arc/strategy-work-planning.md#discovery-checklist
[activate-work-unit]: ../../../../system/workflows/arc/work-unit-lifecycle/activate-work-unit.md
[work-org-protection]: ../../../../reference/strategies/arc/strategy-work-organization.md#branch-protection-modes
[integrate-work-unit]: ../../../../system/workflows/arc/work-unit-lifecycle/integrate-work-unit.md
[integrate]: ../../../../system/workflows/arc/work-unit-lifecycle/integrate-work-unit.md
[config-merge]: ../../../../reference/strategies/arc/strategy-configurability-architecture.md
