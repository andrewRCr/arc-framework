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
> artifacts (upstream's status file, task list, task execution workflow). If you maintain your
> own personal status-contributor.md at `user/{identity}/status-contributor.md`, it is loaded automatically.
>
> **Handoff:** Writes SESSION-NOTES.md for personal context across sessions. Skips project-level
> active status file update (maintainer-managed). Your personal status-contributor.md is updated if you're
> running a full planning pipeline locally.

**Suggested destination:** `docs/concepts/contributor-role/` § Session Lifecycle — describes what
session-init.md and session-handoff.md do for contributors specifically (load set, skipped
artifacts, optional status-contributor.md handling).

**Stylistic integration notes:** Trimmed source replaces both paragraphs with a pointer to
session-init.md / session-handoff.md (the operational truth) plus a one-line note about optional
`status-contributor.md` loading. Extracted paragraphs duplicate behavior already documented
authoritatively in the workflow files; sweep absorption converts duplicate-restated-in-briefing
into explained-once-in-docs with cross-link to workflow files. Voice adaptation: shift
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
>   status-contributor.md       ← your personal work state
>   active/
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
> 2. Reset `user/{identity}/status-contributor.md` to "no active work"
> 3. Move on
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

---

<!-- Reference link definitions for verbatim quoted content. These mirror reference labels that
     appear in source files quoted above so MD052 stays clean in the staging file. The sweep WU
     resolves these to final docs URLs alongside [TODO-docs-site] resolution. -->

[arc-config]: ../../system/arc-config.yml
[arc-methods-dir]: ../../system/methods/README.md
[core-philosophy]: https://andrewrcr.github.io/arc-framework/philosophy/
[arc-methods-session]: ../../system/methods/session-state.md
[dev-rules-arc]: ../../reference/constitution/DEV-RULES.ARC.md
[manage-incidental]: ../../system/workflows/arc/supplemental/manage-incidental-work.md
