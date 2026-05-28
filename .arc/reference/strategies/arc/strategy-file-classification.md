# Strategy: File Classification

**Purpose:** Define the canonical file classification taxonomy for all `.arc/` template files.
The CLI update system uses these classifications to determine merge strategy per file during
`arc update`.

**Scope:** Classification definitions, naming conventions, and merge strategy implications.
For the complete file inventory with layer annotations, see the project's package-project-sync
strategy. For directory structure and work organization, see
[Work Organization Strategy](strategy-work-organization.md).

---

## Taxonomy

### Framework

ARC methodology files. Do not customize directly — wholesale replaced during `arc update`.
Local modifications are overwritten; customization uses the override surfaces below.

**Examples:** Workflows, strategies, READMEs, githooks, ADR template.

**Update behavior:** Wholesale replaced. Local modifications overwritten. No conflicts possible.

**If you need to customize:** Framework files shouldn't be edited directly — changes are
overwritten on every update. See [Configurability Architecture][config-arch] §
[Which mechanism do I use?][config-arch-which] for the right customization surface (config
settings, method overrides, extensions, or Configurable files).

### Configurable

Framework structure combined with project-specific content. Contains both ARC methodology
(sections, rules, processing guidance) and user content (project stack, quality gate commands,
custom sections). Clean section-level separation in most files.

**Examples:** DEV-RULES.PROJECT, AGENT-BRIEF.PROJECT, QUICK-REFERENCE, STRATEGY-INDEX.

**Update behavior:** Three-way merge. Conflicts expected in project-specific sections — CLI
highlights for user resolution. Framework sections auto-merge cleanly when separation is
section-level.

### Scaffolded

Created once during `arc init` from template. User replaces all placeholder content with
project-specific content. Never touched by framework updates.

**Examples:** PROJECT-PRD, ROADMAP, backlog files.

**Update behavior:** Skip entirely. These are project-owned after initialization.

### Project-Owned

Created by users during project development. Not part of the `.arc/` template system.
Never included in or affected by framework updates.

**Examples:** ADRs, task lists, specs, notes files, project strategy docs, research docs.

**Update behavior:** Ignore. CLI never reads or writes these files.

---

## Naming Conventions

ARC uses consistent naming patterns across all files. Understanding these patterns helps teams name
their own artifacts and recognize what a file is from its name alone.

### ALL-CAPS vs. lowercase

**ALL-CAPS** files are organizational hubs — files you navigate *to* for project-wide context.
They're dashboards, indexes, and governance documents that serve as stable reference points.

Examples: `AGENT-BRIEF.PROJECT.md`, `QUICK-REFERENCE.md`, `DEV-RULES.ARC.md`,
`STRATEGY-INDEX.md`, `README.md`, `PROJECT-PRD.md`, `ROADMAP.md`

**Lowercase with prefix** files are instances of a pattern — files you create *from* a convention.
They're work artifacts that follow a naming template.

Examples: `spec-authentication.md`, `tasks-api-modernization.md`, `strategy-work-organization.md`

**The distinction:** ALL-CAPS signals "there's one of these per project/directory, and it's a
coordination point." Lowercase prefix signals "there can be many of these, and the prefix tells
you what kind."

### Prefix patterns

| Prefix      | What It Is               | Created By       | Example                           |
|-------------|--------------------------|------------------|-----------------------------------|
| `meta-`     | Work-unit pointer        | Agent            | `meta-api-modernization.md`       |
| `spec-`     | Work unit spec           | User/agent       | `spec-authentication.md`          |
| `tasks-`    | Task list                | User/agent       | `tasks-api-modernization.md`      |
| `draft-`    | Work draft (pre-spec)    | User/agent       | `draft-api-migration.md`          |
| `notes-`    | Work unit notes          | Agent            | `notes-api-modernization.md`      |
| `strategy-` | Strategy document        | Framework / user | `strategy-work-organization.md`   |
| `research-` | Research document        | User/agent       | `research-context-loading.md`     |
| `adr-`      | Architecture Decision    | User/agent       | `adr-001-define-core-identity.md` |
| `template-` | Copy-ready template      | Framework / user | `template-prd.md`                 |

Work unit artifacts (`meta-`, `draft-`, `spec-`, `tasks-`, `notes-`) share a slug
across files — the slug is the work unit's identity. `meta-authentication.md`,
`spec-authentication.md`, and `tasks-authentication.md` all belong to the same work unit.

The `spec-*` filename is uniform; the spec's *form* (PRD-shape by default, lighter variants per
template) varies by template choice and is signalled by the H1.

### Template suffix: `.template.md`

Files that go through the CLI render engine during `arc init` — token substitution (`{{TOKEN}}`),
conditional content (`<!-- arc:if -->`), or full placeholder replacement — use a `.template.md`
suffix. The suffix is stripped at init time: `ROADMAP.template.md` becomes `ROADMAP.md`,
`AGENT-BRIEF.PROJECT.template.md` becomes `AGENT-BRIEF.PROJECT.md`.

The suffix marks render-engine input, not classification. Both Configurable and Scaffolded files
can carry it — the common trait is that the source file contains placeholders that produce a
different output file. Configurable files that ship as functional content and are customized in
place (e.g., `DEV-RULES.PROJECT.md`, `STRATEGY-INDEX.md`, `system/methods/commit-format.md`) don't use the suffix
because no rendering transformation occurs — they're copied as-is during init and edited directly
by teams.

The `template-` *prefix* (in `reference/templates/arc/`) is different — those are copy-ready document
templates used during work (e.g., `template-prd.md` is copied when creating a new spec). They keep
the prefix in use, not just at init time.

### One-shot template uniqueness

Files rendered exactly once per project at CLI initialization or repository-join time —
produced from package-source `*.template.md` files with mustache-token replacement — do not
have a parallel `reference/templates/arc/**/template-*.md` entry. The package-source `.template`
file is the canonical template; no second template surface exists for the same file class.

**Governed files:** PROJECT-PRD, TECHNICAL-OVERVIEW, ROADMAP, BACKLOG-FEATURE,
BACKLOG-TECHNICAL, AGENT-BRIEF.PROJECT, QUICK-REFERENCE. The CLI's init / join render
pipeline is the canonical inventory.

**Distinction from agent-facing templates.** `template-*.md` files in `reference/templates/arc/`
(e.g., `template-prd.md`, `template-tasks.md`, `template-adr.md`) are copy-ready templates
for content created repeatedly during work by agents and workflows. They use the
placeholder convention (see § Template placeholders). The two surfaces address different
needs and do not duplicate — the one-shot principle does not extend to them.

**Optional starter templates.** `template-dev-rules.md` and `template-contributing.md` are a
third category: present in `reference/templates/arc/` but not in the init render list. Projects
copy or reference them as starting points for optional files; this principle does not govern
them.

### Template placeholders

`template-*.md` files mark fill-in points with three distinct syntaxes — keep them distinct
when authoring or editing a template:

- **`{slot}` — author-substitution slot.** A single-brace span the author replaces when copying
  the template. Short name slots use a kebab token (`{work-name}`, `{project-name}`,
  `{domain-title}`, `{title}`); longer slots carry the authoring instruction as prose inside the
  braces (`{One-paragraph statement of scope …}`) or an enum of choices
  (`{Proposed | Accepted | Deprecated}`). This is the dominant convention — prefer it for any
  value the author fills in.
- **`{{TOKEN}}` — render-engine token.** A double-brace mustache token the CLI substitutes
  programmatically at `arc init` / `arc user open` time (e.g. `{{short-hash}}`). Not
  author-edited; produced by the render pipeline. See § Template suffix.
- **`[lowercase-sentinel]` — literal empty-value marker.** A bracketed lowercase token that is
  itself the value, not a slot to replace: `[none]`, `[internal]`, `[standalone]`. It stays in
  the rendered file to signal "intentionally empty / not applicable."

**Not placeholders:** Markdown reference links (`[text][ref]`) and inline links (`[text](url)`)
keep their brackets — they are link syntax, not slots. The `[Title Case Phrase]` dialect (e.g.,
`[Work Name]`) is retired; convert any survivors to `{kebab-token}`.

### Workflow numbering

Core pipeline workflows are numbered to indicate execution sequence:

- `1_create-spec.md` → `2_generate-tasks.md` → `3_process-task-loop.md`

Setup workflows use zero-padded numbers: `01_verify-and-configure.md`, `02_define-project.md`,
`03_configure-external-integration.md`.

Supplemental workflows are **unnumbered** — they're invoked on demand at various points, not in a
fixed sequence. The absence of a number signals "this is called when needed, not as a pipeline
step."

### Directory naming

Lowercase, hyphenated, functional names throughout. Work units occupy directories named by
their slug: branch `feat/api-modernization` corresponds to `active/api-modernization/` and to
a slug-named directory in `backlog/` (planned or provisional) before activation and in the
completed-work location after integration. Branch type prefixes from the
[`branch-format`][branch-format-method] method (default set: `feat/`, `fix/`, `chore/`,
`refactor/`, `hotfix/`; plus `plan/` for planning-phase branches) namespace branches, not
directories. See [Work Organization Strategy](strategy-work-organization.md) § Directory
Structure for the path shape and § Branching for branch type conventions.

### Project guidance

When creating project-specific artifacts:

- **Project strategies** follow the same `strategy-` prefix: `strategy-authentication.md`
- **Project workflows** use descriptive names without numbers (unless they form a pipeline)
- **Domain-specific dev-rules** follow `DEV-RULES.{DOMAIN}.md` in ALL-CAPS: `DEV-RULES.FRONTEND.md`
- **ADRs** continue the sequential numbering: `adr-011-your-decision.md`
- **Research docs** use the `research-` prefix: `research-performance-benchmarks.md`
- **Work unit artifacts** always use the matching prefixes (`spec-`, `tasks-`, etc.) with a shared
  slug

---

## Directory placement — `system/` vs. `reference/`, and intra-`system/` tiering

Where a file *lives* is a separate axis from how it's *classified* (§ Taxonomy — merge strategy) and how
it's *named* (§ Naming Conventions — name format). Tier and directory are independent: a Configurable file
can sit under `system/` (`arc-config.yml`) or under `reference/` (`AGENT-BRIEF.PROJECT.md`). This section
governs which top-level directory a file belongs in.

### `system/` vs. `reference/`

- **`system/` holds prescriptive / operational machinery** — content the methodology *runs*: workflows,
  methods, extensions, githooks, development rules (`system/rules/`), and configuration (`arc-config.yml`).
  This content governs behavior or is consumed by the process to do work.
- **`reference/` holds consultative look-up material** — content you *consult* to orient or decide: agent
  briefs (`reference/briefs/`), strategies, ADRs, PROJECT-PRD, TECHNICAL-OVERVIEW, QUICK-REFERENCE, and
  templates. This content describes what is true, not what to do.

**The test:** does the content govern behavior or get consumed by the process (→ `system/`), or do you look
it up to orient or decide (→ `reference/`)? Development rules are prescriptive — they direct how every
session operates — so they belong under `system/`. Briefs orient an agent to the framework and project — you
read them to get situated — so they belong under `reference/`.

**Load cadence is not the axis.** QUICK-REFERENCE loads at the top of every session yet is reference-shaped:
a look-up surface, not behavior-governing machinery. Frequency of access does not determine placement;
*shape* does.

### Intra-`system/` tiering: user-facing vs. `.internal/`

Within `system/`, content splits again by ownership:

- **User-facing customization surfaces** sit at the top level of `system/` — `arc-config.yml`,
  `extensions/`, `methods/`, `rules/`, `workflows/`. These are the surfaces teams override and extend.
- **Framework-internal machinery** belongs under the hidden `system/.internal/` directory — CLI-managed
  state (`manifest.json`), githooks, scripts, and skill sources. The dotfile signals "framework-managed;
  don't edit."

A developer opening `system/` to override a method should meet the editable surfaces first, without
filtering past plumbing they never touch. `.internal/` stays singular — an adjective category label
(cf. `.config/`, `.local/`), not a count of its contents.

See § Directory naming for how a directory is *named* once its placement is settled.

---

## Related Documentation

- [Configurability Architecture Strategy][config-arch] — Customization mechanisms and project guidance
- [Work Organization Strategy](strategy-work-organization.md) — Directory structure, work categories
- [DEV-RULES.PROJECT](../../../system/rules/DEV-RULES.PROJECT.md) — Project quality standards

---

[config-arch]: strategy-configurability-architecture.md
[config-arch-which]: strategy-configurability-architecture.md#which-mechanism-do-i-use
[branch-format-method]: ../../../system/methods/branch-format.md
