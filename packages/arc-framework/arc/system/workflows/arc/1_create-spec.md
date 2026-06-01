---
purpose: Guide creation of work-level PRDs defining scope and requirements for planned work.
audience: collaborative (human and agent)
---

# Workflow: Create PRD

ARC distinguishes feature and technical work — see [Work Organization Strategy][work-org] for the
decision tree.

**Note**: This workflow covers work-level PRDs, not the project-wide PROJECT-PRD. For constitutional
documents, use [02_define-project.md](initial-setup/02_define-project.md).

---

## Process

**Branch context:** Under full protection (`branch.protection: full`), PRD creation happens on a
planning branch — verify you're on one before proceeding (created via
[init-work-unit][init-work-unit]). Under partial protection (the default), PRDs may be created
directly on the base branch.

### Step 1: Check for Existing Planning Artifacts

Check if a `draft-*.md` document exists for this work. Plan documents capture resolved decisions,
alternatives considered, and approach direction before requirements crystallize into a PRD. See
[Work Planning Strategy][work-planning] for `draft-*` conventions and the discovery checklist.

Where to look depends on your project's PM mode ([`arc-config.yml`][arc-config] → `pm.mode`):

- **arc-in-git**: `.arc/backlog/{provisional,planned}/<wu-name>/` — plans live in the backlog as part of
  the planning pipeline and graduate to PRDs when ready
- **none / external**: `.arc/active/` — plans are co-located with the PRDs they feed
  into (no backlog directory)

**If a plan exists**: Read it as your primary context. It may reference supplemental `notes-*.md`
files with additional detail — read those too. If the draft carries an `## Inbound Buffer — Pending
Integration` section, **integrate those routed notes into the draft body first** (or consciously reject
each) — the buffer is a transit zone that must drain before the plan feeds the PRD, never carried forward
as-is. Before proceeding, assess PRD-readiness: check for
unresolved design decisions, open unknowns marked for future resolution, or missing concrete details
that the PRD would need to specify. If the plan isn't ready, surface the gaps and resolve them (or
return to plan refinement) before investing in PRD writing. Treat the plan as authoritative upstream
exploration state — focus discovery (Step 3) on remaining gaps and ambiguities rather than broad
rediscovery.

**If no plan exists**: Proceed directly to discovery.

### Step 2: Determine Work Category

Classify as **feature** (adds user-visible capability from the product vision) or **technical**
(infrastructure, architecture, or internal improvement). This determines save location (Step 6).

### Step 3: Conduct Discovery

Ask clarifying questions to establish the "what" and "why." The "how" comes during task generation
and implementation. See the [discovery checklist][discovery-checklist] for comprehensive coverage.

**With a plan**: Ask targeted questions only — fill gaps, validate assumptions, and resolve open
items that block formalization.

**Without a plan**: Work through the [discovery checklist][discovery-checklist] in full to
establish scope.

For interactive sessions, provide numbered options to keep responses quick.

### Step 4: PROJECT-PRD alignment check

Evaluate the PRD's scope (crystallized in Step 3) against PROJECT-PRD's Principles and Out of Scope —
the principle catalog is the project's vision contract.

**Halt-and-ask conditions:**

- PRD scope conflicts with a named PROJECT-PRD principle
- PRD introduces scope that PROJECT-PRD lists as Out of Scope

On either of the above, halt and surface the specific conflict — user direction needed before save.

**On pass — cite the principle by name.** Not "checked, passes" — "checked against the
*Configurability* principle — passes". Substantive citation keeps the alignment check load-bearing
rather than ornamental.

### Step 5: TECHNICAL-OVERVIEW alignment check (conditional)

Fires only when the PRD touches technical surfaces — tech stack, architecture, runtime,
dependencies, or infrastructure. Independent of Step 4: PROJECT-PRD covers problem / scope /
principles; TECHNICAL-OVERVIEW covers technical surfaces. A single PRD may trigger both, one, or
neither.

**Halt-and-ask condition:** PRD introduces tech (component, framework, dependency, infrastructure
choice) not in TECHNICAL-OVERVIEW. On detection, halt and surface the drift — user direction needed
before save.

The companion downstream condition ("TECHNICAL-OVERVIEW edited since PRD approved") fires at
[`activate-work-unit.md`][activate-work-unit] and [`integrate-work-unit.md`][integrate-work-unit],
not here — at create-PRD time the PRD hasn't been approved yet.

**On pass — cite the section by name.** Not "checked, passes" — "checked against § 2 Architecture
Components — passes". Section-based citation reflects TECHNICAL-OVERVIEW's structure (parallel to
Step 4's named-principle citation).

### Step 6: Write and Save PRD

Generate the PRD using [template-prd.md][template-prd]. The template includes section guidance,
dependency tracking, and priority levels. Adapt emphasis based on work type — not every section
carries equal weight for every PRD.

**Naming:** The `{{WORK_NAME}}` descriptor in the PRD filename becomes the work unit's identifier
across all artifacts — task list (`tasks-{{WORK_NAME}}.md`), notes (`notes-{{WORK_NAME}}.md`),
completion record, and branch name. Choose a concise, descriptive slug (e.g., `api-modernization`,
`cli-implementation`). Avoid abbreviations that only make sense in context or overly long
compound names.

**Save location** depends on your project's PM mode ([`arc-config.yml`][arc-config] → `pm.mode`):

- **arc-in-git**: `.arc/backlog/{provisional,planned}/{{WORK_NAME}}/spec-{{WORK_NAME}}.md` — PRDs start
  in backlog and graduate to `active/` during [activation][activate-work-unit]
- **none / external**: `.arc/active/spec-{{WORK_NAME}}.md` — PRDs save directly to
  active (no backlog directory). Create the directory first if it doesn't exist:
  `mkdir -p .arc/active/`

### Step 7: Retire Draft Documents

> [!IMPORTANT]
> `workflow-interlock`: Stop after the PRD is saved. Surface the PRD location for review; await
> approval before proceeding to plan retirement + meta update + commit.

If a `draft-*.md` document fed into this PRD, retire it now. Plan documents are ephemeral — they
serve exploration and are deleted once the PRD captures the conclusions (see
[Work Planning Strategy][work-planning] § Draft Documents).

1. **Audit for reference content**: Scan the plan for implementation detail, design rationale, or
   context that the PRD doesn't capture but would be valuable during task generation or execution.
   Migrate this to a `notes-*.md` file alongside the PRD (same directory). Keep the notes file
   header minimal (title + contents only) — no purpose block, no provenance to the plan, no commit
   metadata. See [DEV-RULES.ARC][dev-rules-arc] § Documentation Boundaries.
2. **Delete the plan**: `git rm` the `draft-*.md` file (and any supplemental files that fed into it,
   unless they have independent archival value — e.g., research files may belong in
   `reference/supplemental/research/`).
3. **Update planning-state meta file** (when present): If
   `.arc/active/meta-{name}.md` exists with `**State:** Planning` (planning-branch
   sessions), advance its `**Next Action:**` to reflect the post-PRD step (e.g., "Run
   `2_generate-tasks.md`"). Skip otherwise (no meta file exists pre-init under non-planning-branch
   flows).

After substeps 1-3, stage all edits — PRD save (Step 6), any promotion-write inbox deletion (Step
6, arc-in-git), plan deletion + `notes-*` migration, meta update.

> [!CAUTION]
> `commit-interlock` release — commit as `workflowCommit`. Subject `chore(arc): create spec-{name}`;
> body itemizes the bundled changes per [DEV-RULES.ARC][dev-rules-arc] § Commit format and
> § Meta-file commit shape.

---

## Next Step

Run [2_generate-tasks.md](2_generate-tasks.md) when ready — it consumes this PRD as input.

---

[work-org]: ../../../reference/strategies/arc/strategy-work-organization.md
[work-planning]: ../../../reference/strategies/arc/strategy-work-planning.md
[discovery-checklist]: ../../../reference/strategies/arc/strategy-work-planning.md#discovery-checklist
[template-prd]: ../../../reference/templates/arc/work-unit/spec/template-prd.md
[activate-work-unit]: work-unit-lifecycle/activate-work-unit.md
[integrate-work-unit]: work-unit-lifecycle/integrate-work-unit.md
[init-work-unit]: work-unit-lifecycle/planning/init-work-unit.md
[arc-config]: ../../arc-config.yml
[dev-rules-arc]: ../../../system/rules/DEV-RULES.ARC.md
