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

---

<!-- Reference link definitions for verbatim quoted content. These mirror reference labels that
     appear in source files quoted above so MD052 stays clean in the staging file. The sweep WU
     resolves these to final docs URLs alongside [TODO-docs-site] resolution. -->

[arc-config]: ../../system/arc-config.yml
[arc-methods-dir]: ../../system/methods/README.md
[core-philosophy]: https://andrewrcr.github.io/arc-framework/philosophy/
