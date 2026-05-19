# Plan: Docs Site Content Sweep

**Purpose:** Post-docs-site-migration WU that consolidates content updates for the public
`docs/` site — methodology model changes that accumulated since the content port, plus
content contributions staged from other WUs (e.g., operational-context extractions from
rule/workflow slim-down passes). Accumulation home for both input types between now and
WU activation.

- **State:** Capture (accumulating items; PRD-drafted closer to activation)
- **Created:** 2026-04-16
- **Origin:** The Work-Status Restructure WU shipped the per-WU status file model to `.arc/` and
  `packages/arc-framework/arc/` but did not update the adopter-facing content at `docs/`. Pre-merge review surfaced ~15
  touch points across 9 files still describing the retired singular `WORK-STATUS.md` model. That propagation was the
  first captured item; subsequent WUs now also stage content contributions here.

---

## Why a Dedicated Plan

The two adjacent docs-touching WUs don't absorb this work cleanly:

- **`prd-arcd-docs-site.md`** (mkdocs → Astro/Starlight migration) is explicitly
  *format migration, not content rewrite* (Non-Goals: "not a content-expansion pass",
  "not a content rewrite"). It carries one content-sweep hitchhiker — the rebrand
  branding sweep from `prd-arcd-rebrand.md` — because branding is mechanical
  find-replace that pairs cleanly with the per-file content port. Methodology model
  changes and content contributions (conceptual, editorial, prose-level judgment per
  touch point) don't fit that rubric.
- **`prd-arcd-rebrand.md`** excepts `docs/**` from its content sweep Success Criteria
  and routes the branding sweep through the docs-site WU's content port. Scope stays
  on branding — not a general content-refresh vehicle.

The concern is also inherently ongoing: framework updates between now and docs-site
activation will generate additional drift, and slim-down WUs will stage content
contributions over time. A dedicated catch-all means both input types get tracked at
capture time rather than being rediscovered during an eventual sweep.

## Timing

**Activates after `prd-arcd-docs-site.md` merges.** Running before the Starlight
structure lands would burn effort on mkdocs prose that gets transformed (or deleted)
during the content port.

**Before public release.** The sweep must land before `plan-wu5-public-release.md`
activates — external readers arriving at a fresh docs site should not read a
methodology description that no longer matches the shipped framework, and staged
content contributions should be integrated so slimmed `.arc/` files' link placeholders
resolve cleanly.

## Items to Sweep

Two input types feed this sweep:

- **Drift items** — methodology changes in `.arc/` that left user-facing `docs/` prose
  stale. Each entry captures touch points in existing `docs/` files to update.
- **Content contributions** — staged content from other WUs (typically slim-down passes
  that extract non-operational prose from in-repo files for docs/ absorption). Each
  entry points at a staging notes file produced by the source WU.

### Drift Items

#### 1. Per-WU status file model (from Work-Status Restructure WU, 2026-04-16)

**What changed:** Singular tracked `.arc/active/WORK-STATUS.md` retired. Per-WU
`status-{name}.md` files in `active/{category}/` carry project state; file is
deleted (not reset) at archive. `**State:**` field (on status file) is the
lifecycle marker; `**Status:**` header retired from task list template. SESSION-NOTES
gains `**Working On:**` field.

**Edit type:** Conceptual rewrite. Prose-level editorial judgment per touch point.
Not a mechanical find-replace — readers arriving fresh need explanations that hold
together without seeing the old model.

**Known touch points** (non-exhaustive, from pre-merge review 2026-04-16):

- `docs/getting-started.md:101,109`
- `docs/the-framework.md:60,127,140,143,148,176`
- `docs/contributing.md:24`
- `docs/methodology/principles.md:144,147`
- `docs/reference/sessions.md:92`
- `docs/reference/glossary.md:26,60`
- `docs/reference/skills.md:38,50`
- `docs/reference/team-coordination.md:23,44,120,136`
- `docs/reference/updating.md:63`

**Nuance:** Public-facing prose should explain *why* the per-WU model (disentangles
project pointer from session pointer; eliminates parallel-WU concurrency flaw;
cleans up under full protection) without assuming prior knowledge of the retired
model. Archive under `docs/reference/archive/` or similar if a historical note
helps; otherwise don't.

#### 2. Session portability / probe vocabulary realignment (from Session-Init Optimization WU, 2026-04-22)

**What changed:** Phase 3.R changed the public-facing session portability model and supporting terminology:
`arc sync --load` was retired in favor of the `arc user fetch` / `pull` split and direction-aware `arc sync`,
bootstrap guidance shifted away from implicit overwrite flows, `disk ahead` was renamed to `local unsaved`,
`conflict` was canonicalized over `divergence`, merge recovery now uses the explicit
"Merge: rebase my save onto remote, then push" label, and the shipped probe surface includes
`arc extensions status`, `arc active status`, and composite `arc status --session-init --json`
(`arc methods status` was explored and then dropped, so docs should not describe it as live).

**Edit type:** Mixed conceptual + mechanical sweep. Some touch points are direct stale command replacements, but
the portability model and bootstrap wording need reader-first prose rather than literal command swaps.

**Known touch points** (captured during 3.R pre-implementation audit, 2026-04-22):

- `docs/the-framework.md:186`
- `docs/reference/team-coordination.md:133`
- `docs/index.md:57-59,79`
- `docs/faq.md:121`

**Repo scan confirmation (2026-04-22):** A direct `rg` sweep of `docs/**` for stale portability
commands and vocabulary found exactly these four public-doc touch points. No additional
`arc sync --load`, `arc user pull --identity`, or probe-surface drift was present outside this
set at scan time.

**Nuance:** Keep this sweep aligned to shipped CLI behavior, not intermediate task-list intent. In particular:
do not document `arc methods status` as available, and preserve the docs-site plan boundary by updating these
public-doc touch points here rather than folding them back into Session-Init Optimization execution.

#### 4. Agent-file surface removal + `system/briefs/` rename (from Session-Init Optimization WU, 2026-04-23)

**What changed:** Phase 4/5 retired the `{AGENT}.ARC.md` surface entirely (seven per-agent files
— `CLAUDE`, `CODEX`, `COPILOT`, `CURSOR`, `GEMINI`, `WARP`, `WINDSURF` — plus `template-agent.md`
for post-init creation). Containing directory renamed `system/agent/` → `system/briefs/`; file-level
rename `AGENT-BRIEFING.*.md` → `AGENT-BRIEF.*.md` for all three retained briefings (ARC, PROJECT,
CONTRIBUTOR). Session-init Step 4 item 3 removed. `arc init` no longer scaffolds per-agent files;
`add-agent` workflow pivoted or collapsed. Rationale (full decision record in
`tasks-session-init-optimization.md` Task 5.5): pressure-test found no valid ARC-exclusive use case
for the surface — harness-level files (`CLAUDE.md`, `AGENTS.md`, etc.) dominate on load order
(pre-session-init) and always-in-context, with no ARC-specific capability lost; empty set for
"ARC-aware agent-specific guidance that can't live in the harness file" is real across months of
self-hosting evidence.

**Edit type:** Mixed conceptual rewrite + mechanical replacement. Mechanical: path/filename sweeps
(`system/agent/` → `system/briefs/`, `AGENT-BRIEFING` → `AGENT-BRIEF`). Conceptual: retirement of
the dual-hub + tool-files architecture narrative; introduction of harness-level files as the
ARC-external surface for agent-specific operational guidance (currently not covered anywhere in
framework docs).

**Known touch points** (to be enumerated at sweep time — scan `docs/**` for):

- References to `{AGENT}.ARC.md`, `CLAUDE.ARC.md`, `CODEX.ARC.md`, etc. (any per-agent filename)
- References to `system/agent/` as a directory path
- Descriptions of the "dual-hub + tool-files pattern" (likely on reference / architecture pages)
- Descriptions of `arc init` scaffolding agent-specific files
- `add-agent` workflow mentions (if the workflow itself is retired or collapsed)
- References to `AGENT-BRIEFING.{ARC,PROJECT,CONTRIBUTOR}.md` filenames

**New concept to introduce:** Harness-level agent files (`CLAUDE.md`, `AGENTS.md`, `.gemini/GEMINI.md`,
etc.) as a legitimate **pre-session-init surface** for agent-specific operational guidance —
distinct loading layer from ARC's session-init, outside ARC's methodology, but a valid and sometimes
necessary tool. Currently unmentioned in framework docs. Should land as a short section or callout,
likely in a "sessions" or "agents" reference page, explaining the layering:

- **Harness layer (outside ARC):** Harness-level files (`CLAUDE.md`, `AGENTS.md`, etc.) — loaded by
  the agent harness before any ARC interaction. Agent-specific, project-root-scoped, outside ARC's
  two-copy sync. Appropriate home for: harness auto-approve quirks, sandbox escalation patterns,
  project-specific invocation guidance (e.g., "use `npx arc`" in self-hosting setups), tool-use
  preferences tied to the harness rather than ARC workflows, project env bootstrap or toolchain
  prerequisites (e.g., "run `docker compose up` before the session") — any pre-session operational
  guidance unrelated to ARC methodology.
- **ARC layer (session-init):** `system/briefs/AGENT-BRIEF.{ARC,PROJECT,CONTRIBUTOR}.md` — loaded
  via session-init skill (`arc-resume`, `$arc-resume`, or equivalent per harness). Methodology-scoped
  orientation for the agent working within ARC.

**Nuance:** Conceptual rewrite needs to handle readers arriving fresh who never saw the old pattern.
Don't frame as "we used to have per-tool files, we removed them" (reader-hostile per DEV-RULES.ARC §
Write for the reader). Frame as "agents get ARC-methodology context from briefs; agent-specific
operational quirks belong in the harness-level file." The retired architecture doesn't need mention
unless a migration-guidance page is added for existing adopters (likely scoped to release notes, not
docs site). Keep framing honest about the two layers being architecturally distinct (ARC doesn't
manage the harness file; the harness doesn't know about ARC).

#### 6. DEV-RULES domain-rules pattern (from Session-Init Optimization WU, 2026-04-24)

**What changed:** DEV-RULES domain-rules pattern shipped — frontmatter convention
(`domain`, `purpose`) on `DEV-RULES.{DOMAIN}.md` files in `reference/constitution/`,
enumerated by the `arc status --session-init --json` probe's `domainRules` slot so agents
discover domain rules at session-init and load on-demand. Reserved filenames
(`DEV-RULES.ARC.md`, `DEV-RULES.PROJECT.md`) carry no frontmatter and are skipped. An
adopter-facing `template-dev-rules.md` scaffold ships in `reference/templates/` with the
filename/`domain:` case contract documented inline.

**Edit type:** Additive concept introduction (not drift-fix). The public surface gains a
new adopter-visible concept (domain-rules files, the frontmatter convention, the template
scaffold); no existing content describes a retired model.

**Known touch points** (to be enumerated at sweep time — scan `docs/**` for):

- DEV-RULES loading discussion (how agents load constitutional rules at session-init)
- Adopter-facing customization paths (where project-type-specific rules fit within the
  DEV-RULES.ARC / DEV-RULES.PROJECT / DEV-RULES.{DOMAIN} layering)
- References to the `reference/constitution/` directory shape

**Nuance:** Agent-internal surface — the `domainRules` probe slot is consumed during
session-init by the agent, not an adopter CLI command. Positioning in docs-site prose
should reflect that: describe it as "how ARC tells the agent which domain rules exist"
rather than a user-facing enumeration command. The case contract (uppercase filename,
lowercase `domain:`, exact match after lowercasing the fragment) is a mechanical
requirement (probe + pre-commit hook enforce it) and should be framed as such — not as
style convention.

#### 8. Autonomy Stack — interlock model (from Interlock Foundation WU, 2026-04-29)

**What changed:** ADR-016 establishes the interlock model — four interlocks (task → commit → push
→ integrate; invariant endpoints, configurable middles via `session.autonomy`). DEV-RULES.ARC
weaves the vocabulary and new invariants (integration-interlock, cascade-undo) into existing rule
sections; the conceptual model home is `strategy-session-operations.md`. Structured
task-completion prompt and push-ordering enforcement live in workflow files
(`3_process-task-loop.md`, `session-handoff.md`).

**Edit type:** Additive concept introduction (not drift-fix). The public surface gains a new
adopter-visible conceptual model (interlock model, autonomy stack, configurable middle interlocks)
and supporting vocabulary (task-interlock, commit-interlock, push-interlock,
integration-interlock). Existing methodology prose absorbs the new vocabulary without describing
a retired model.

**Known touch points** (to be enumerated at sweep time — scan `docs/**` for):

- Session lifecycle / autonomy mode discussion
- Commit and push authority descriptions ("when does ARC commit?")
- Handoff ceremony framing
- Methodology principle pages touching agent-initiated actions

**Nuance:** No extraction scoped at source — sweep WU resolves placement and content at sweep
time. Authoritative sources: ADR-016, `strategy-session-operations.md` (post-Task 1.3.b
expansion), `arc-config.yml` (post-Phase 2 `session.autonomy` schema), `3_process-task-loop.md`
(post-Phase 4.1.b prompt format spec), `session-handoff.md` (post-Phase 4.2.c push-ordering
enforcement), DEV-RULES.ARC (post-Task 1.2 weave). Don't pre-author docs prose against
intermediate task-list intent — wait until sources are at their final post-WU shape.

#### 10. Work Organization Reform (from WOR, 2026-05-13)

**What changed:** Broad methodology shift across WU lifecycle, file shapes, commit conventions,
and capture pipeline. Retires several models adopters may have read about and replaces them with
new conventions; introduces several new concepts that aren't currently covered in adopter prose.

**Edit type:** Mixed — substantial conceptual rewrite (the retired models — multi-branch WUs,
status-file shape, integrate-planning-branch flow, prior State values — were load-bearing in
prior docs prose) plus mechanical updates (filename references, vocabulary alignment).

**Major change areas to sweep** (non-exhaustive, areas to scan at sweep time):

- **Single-branch-per-WU model** — `plan/<name>` rotation to `<type>/<name>` at activation;
  replaces multi-branch / `[PLAN]:` PR pattern. `rotate-branch.md` workflow retired entirely.
- **Meta file (`meta-{name}.md`) shape** — replaces `status-{name}.md`; H1 + blank-line-grouped
  field blocks; new fields (`Origin`, `Cohort`, `Depends On`, `Owner`); per-worktree isolation
  invariant.
- **4-state enum** (`Planning | Active | Integrating | Shipped`) — replaces previous State
  values (`Draft`, `In Progress`, `Complete` with `Integration:` field).
- **Footer convention propagation** — method renamed `commit-context-format` → `commit-footer`;
  new parenthetical matrix (chain naming Origin → Spec → Tasks → Atomic; `standalone` anchor
  for off-WU work; `(incidental during X)` form; `(maintenance)` and `(deactivation)` on
  meta-*; etc.).
- **Capture pipeline restructure** — `USER-INBOX.md` (replaces `ATOMIC-INBOX.md`),
  `BACKLOG-INBOX.md` (merges `BACKLOG-FEATURE` + `BACKLOG-TECHNICAL`), `backlog/ATOMIC-INBOX.md`.
- **Backlog directory layout** — `backlog/{planned,provisional}/<wu-name>/` per-WU subdirs;
  `backlog/feature/` and `backlog/technical/` retired.
- **Release Notes Entry + Completion Notes** — meta file's archive-phase H2s; replaces
  `completion-{name}.md` distinct artifact (`template-completion-doc.md` retired).
- **Conventional Branch alignment + commit type-set tightening** — 8-type CC set
  (`feat | fix | chore | docs | refactor | test | perf | revert`); `arc` scope refused;
  `feature/` / `technical/` / `incidental/` branch prefixes retired.
- **META-PRD redesign** — Mission + numbered principles + anti-goals + problem + design
  tradeoffs shape; new template `template-meta-prd.md`.
- **ROADMAP as rendered view** — generated from meta-file state; codified algorithm.
- **Retired surfaces (filename / pattern level):** `PROJECT-STATUS.md`,
  `integrate-planning-branch.md`, `activate-planning-branch.md` (renamed `init-work-unit.md`),
  `rotate-branch.md`, `status-*.md` filename pattern, `completion-*.md` filename pattern,
  `template-completion-doc.md`, `[PLAN]:` PR-prefix pattern, `commit-context-format.md` method
  filename.

**Nuance:** WOR is a large convention shift. Sweep should focus on conceptual model description
first (how WUs flow through their lifecycle now under single-branch + 4-state + meta-* + sweep
cadences), then mechanical updates (filename references, vocab alignment). Per existing
drift-item nuance pattern, frame for readers arriving fresh — don't describe the retired model
unless the retirement is itself the relevant detail. **Authoritative sources at sweep time:**
PRD + companion ADR shipped with WOR (ADR lands in `.arc/reference/adr/`); post-WOR shape of
strategies (`strategy-work-organization.md`, `strategy-task-list-formatting.md`,
`strategy-configurability-architecture.md`); post-WOR template set (`template-meta.md`,
`template-meta-prd.md`, `template-tasks.md`, `template-prd.md`, `template-plan.md`).

### Content Contributions

#### 3. Operational-context extractions (from Session-Init Optimization WU, pending)

**What changed:** Content audit of session-init always-loaded docs + high-frequency
workflows identified non-operational rationale/background/examples for absorption
into `docs/` site. Source WU slims in-repo files and stages extracted prose for
absorption here.

**Input type:** Content contribution (new prose to absorb), not drift-fix.

**Staging reference:** `notes-docs-content-sweep.md` in `backlog/technical/`,
populated when Session-Init Optimization WU activates. Structured as content blocks
per extraction — each captures source-file + section anchor, extracted content,
suggested destination in docs/ IA, stylistic integration notes.

**Link placeholders:** The source WU leaves `[TODO-docs-site]` reference-style link
placeholders in slimmed `.arc/` files pointing at eventual `docs/` destinations.
This sweep's execution must resolve all placeholders to final docs URLs. Greppable
pattern (`grep -r "TODO-docs-site"`) enables completion verification.

**Nuance:** Advisory destinations in the staging file are the source WU's best guess;
final IA placement is editorial judgment at sweep time. Extracted prose came from
dual-audience `.arc/` files and may need rephrasing for docs-only audience. Keep
phrasing honest to the Starlight structure this sweep targets.

#### 5. Agent-native positioning for value-prop copy (framing note, 2026-04-23)

**Input type:** Framing note — conceptual positioning insight for docs-site value-prop
copy. Not staged prose extraction, not drift-fix. Captured here because it emerged
from framework work (Session-Init Optimization side discussion) and current `docs/`
and README copy lead with workflow mechanics rather than the load-bearing design bet.

**The framing:** ARC's in-repo planning model (PRDs, task lists, status files, session
notes, ADRs as markdown artifacts in the repo) makes project state part of the agent's
context window natively — no MCP server, no API fetch, no auth round-trip. For every
agent interaction that touches planning state, this is zero-overhead. Externalizing
the planning surface to Jira / Linear / GitHub Issues pushes the agent through
`fetch → parse → reason → write-back` cycles per task, adding tokens, latency, and
a failure mode per interaction. File-based tracking makes the planning surface *free*
for the agent.

**Supporting points (not all need foregrounding in every surface):**

- **Commit-time atomicity:** status file advances in the same commit as the code it
  describes. External trackers can only sync post-hoc, introducing drift windows.
- **Time-travel coherence:** checkout any past commit → task list, notes, and code
  all match that moment. Reconstructing equivalent state from tracker history APIs
  is lossy and slow.
- **Fork/clone portability:** external contributors see planning context without
  requiring tracker access.
- **Offline tolerance** (airplanes, SSH-only servers).
- **Established precedent:** the in-repo planning pattern is now mainstream for
  technical work (Rust RFCs, Kubernetes KEPs, ADR-tools, Dendron, the broader
  docs-as-code tradition). ARC's contribution is workflow discipline + agent-
  optimized structure, not inventing the category.

**Suggested destinations:**

- Landing page hero / subhead copy — the load-bearing design bet
- Dedicated "Why ARC" section if one emerges in the Starlight IA
- README first-screen framing (pair with existing positioning)
- Methodology-intro copy, light touch — methodology docs should lead with mechanics,
  not sell the bet

**Keep visible alongside the framing:** `pm.mode: external` exists as an adoption
escape hatch for teams with heavy stakeholder-facing PM load — those adopters keep
ARC's workflow discipline while routing tracking externally. Framing the in-repo bet
without also surfacing the escape hatch misrepresents the framework's flexibility.

**Nuance — don't over-claim:** The bet's correctness depends on agents remaining
primary development partners and MCP/API integration economics staying
non-trivially worse than file access. Both are currently true in 2026; both may
shift. Frame as a deliberate design choice grounded in current agent-collaboration
economics, not a universal truth.

#### 7. Session-init dual-channel pull config (from Session-Init Optimization WU, 2026-04-25)

**What changed:** Session-init's pull-decision surface gained a second channel — worktree sync
vs. `origin/<current-branch>` — alongside the existing notes channel. Two new config keys:
`session.init_pull.worktree` (modes: `prompt` / `manual`) and `session.init_pull.notes` (modes:
`prompt` / `manual` / `always`). The composite envelope (`arc status --session-init --json`) now
emits both channels as peer slots; `arc user status` and `arc sync` carry a worktree-drift
qualifier when the comparison's verdict applies only to reachable ancestors.

**Input type:** Content contribution — release-notes-style writeup of new config surface, since
this project doesn't ship release notes in-repo. The docs site is the public-facing surface for
"what's new in this version" copy.

**Suggested destinations:**

- Configuration reference page — new `session.init_pull.*` rows alongside the existing
  `session.remote_sync` entry
- Session lifecycle page — note the dual-channel pull behavior, the combined-prompt UX, and the
  dirty-tree precheck
- Migration / changelog page (if one exists in the Starlight IA) — config-key additions, no
  breaking changes (defaults are safe; opt-outs via `manual`)

**Authoritative sources:**

- ADR-012 amendment (2026-04-25) — distinguishes worktree from notes channel; mode semantics;
  rationale for rejecting `always` on the worktree channel
- `arc-config.yml` inline comments — terse per-key explanation with cross-reference to
  `session-init.md`
- `session-init.md` § Conditional Sync Pulls — combined-prompt logic, dirty-tree precheck,
  worktree-first ordering, post-pull re-probe
- `arc user status` CLI help — the worktree-drift qualifier is named in the command description;
  `--offline` skips both probes

**Nuance:** No migration required for adopters — defaults preserve prior behavior (notes-only
prompting); worktree probe is additive. `always` mode rejected for worktree per ADR-012
amendment rationale (auto-pulling tracked working-tree state silently is too invasive even on
clean trees).

#### 9. Methodology-identity differentiation in public-facing copy (framing note, 2026-05-03)

**Input type:** Framing note — directional guidance for public-facing onboarding copy.
Captured during a 2026-05-03 rebrand-exploration session that concluded ARC's distinctive
identity is under-emphasized in current onboarding relative to its load-bearing role.

**The framing:** Current docs (README, getting-started, the-framework, methodology landing)
cover the right concepts — co-development, bounded sessions, sequential focus,
attention-as-design-constraint, the harness model — but present them as a list of design
commitments rather than as ARC's load-bearing identity. The reframe surfaces **task-cadence
discipline** (the task-interlock as the fundamental review increment; controlled-burst
execution; "human cognitive attention as a feature, not a bottleneck") as the leading
concept; the rest reads as supporting structure.

**Candidate positioning phrases** (test against actual hero copy at execution time, don't
lock in at planning time):

- *task-cadence development*
- *controlled-burst co-development*
- *deliberate AI development*
- *bounded human-AI co-development*

**Suggested approach:** lean *into* the differentiation, don't rewrite away from current
framing. The existing material is correct; the goal is to make the load-bearing
differentiator the leading concept upfront so newcomers grasp what makes ARC distinct in
the agentic-tooling landscape *before* working through the supporting structure.

**Suggested destinations:**

- README hero
- Landing-page hero / subhead (Starlight IA)
- `methodology/index.md` and `the-framework.md` opening paragraphs
- Onboarding surfaces where ARC's stance vs. autonomous-agent / PR-review workflows
  benefits from explicit framing

**Pairs with item #5** (agent-native positioning) — both sharpen the value prop, hit
different facets of "why this design."

**Nuance — don't over-claim:** frame as *deliberate design stance* grounded in current
agent-collaboration evidence (cognitive-load research, code-review-size studies cited in
`methodology/rationale.md`), not as universal truth. Same principle as item #5's
non-over-claim guidance.

## Adding Items

**Drift items** — when a methodology change lands in `.arc/` or
`packages/arc-framework/arc/` that affects user-facing conceptual content (not
branding, not file names, not formatting — actual model/behavior descriptions
adopters rely on):

1. Confirm the change doesn't fit `prd-arcd-rebrand.md` scope (branding only) or
   `prd-arcd-docs-site.md` scope (format migration only)
2. Add a new numbered item under § Drift Items with the template shape: what
   changed / edit type / touch points / nuance

**Content contributions** — when a WU slims in-repo content and stages extracted prose
for docs absorption:

1. Source WU produces a staging notes file (`notes-docs-content-sweep.md`) in
   `backlog/technical/` during its execution, structured per the Content Contributions
   entry shape
2. Add a numbered item under § Content Contributions here, pointing at the staging
   file and capturing high-level context (what changed / input type / staging
   reference / link placeholders / nuance)

The plan remains in capture state until either (a) `prd-arcd-docs-site.md` is near
activation and items have accumulated enough to PRD this WU, or (b) an individual
item is urgent enough to run as an atomic task list before the consolidated sweep.

## Scope Boundaries

**In scope:**

- Conceptual/model changes in `.arc/` that affect user-facing prose in `docs/` (drift)
- Content contributions staged from other WUs for docs/ absorption
- Editorial judgment to keep public copy coherent for readers arriving fresh
- Historical notes where helpful; deletion where not
- Resolving `[TODO-docs-site]` link placeholders left by source WUs

**Out of scope:**

- Brand identity changes (→ `prd-arcd-rebrand.md` / `prd-arcd-docs-site.md` § Req 12)
- File-format migration (→ `prd-arcd-docs-site.md`)
- New docs pages or structural reorganization of the docs tree (explicitly Non-Goal
  in the migration PRD; if needed, scope separately)
- Internal `.arc/` file drift (→ framework-sync integration test catches this)
- In-repo slim-down work itself (source WUs do this; this sweep only absorbs)

## Dependencies

- **Upstream:** `prd-arcd-docs-site.md` (format migration must land first so sweep
  targets the Starlight structure)
- **Downstream:** `plan-wu5-public-release.md` (public release prereq)
- **Feeds this plan:** `prd-session-init-optimization.md` (produces content
  contributions via `notes-docs-content-sweep.md` staging file)
- **Does not block:** `plan-arcd-rebrand.md`, `plan-arc-plan-conductor.md`,
  `plan-arc-modes.md`

## References

- `prd-arcd-docs-site.md` § Non-Goals (content rewrite out of scope)
- `prd-arcd-docs-site.md` Req 12 (rebrand branding sweep piggyback pattern)
- `prd-arcd-rebrand.md` § docs/ exception
- Pre-merge review for `technical/work-status-restructure` (2026-04-16) — original
  surfacing of the per-WU status file docs drift
- `prd-session-init-optimization.md` § Requirements P1.1–P1.3 (operational-context audit
  producing content contributions staged here)

---

## Backlog Inbox Absorption (2026-05-19, WOR Task 6.3.b)

*Entries folded from retired `backlog/feature/BACKLOG-FEATURE.md` during WOR Task 6.3.b
inbox-drain to the four-surface model. Domain overlap with this plan flagged; integration
into plan body deferred to a focused iteration session.*

### Strategy Documents on Docs Site

Consider hosting ARC strategy documents on the docs site as deep-dive wiki entries.
Currently, docs reference pages point to in-repo `.arc/reference/strategies/` files that
pre-installation readers can't access. Options: mirror selected strategies to the docs
site with a sync workflow to prevent drift, rewrite some as standalone deep-dive pages
with a different audience framing (strategies are currently written "to ourselves"), or
update internal references to external links with the docs site as sole source of truth.
Some strategies may need reframing if they shift from internal reference to public
documentation. Closer to 1.0 than public beta scope.

### Post-1.0 Content Ideas

- Integration examples for common tech stacks (React, Django, data pipelines, etc.)
- Tutorial content and walkthrough materials beyond WU4 launch set
- Example project showcasing ARC adoption from scratch

These overlap with WU5 docs site scope but may exceed what ships at 1.0 launch.
