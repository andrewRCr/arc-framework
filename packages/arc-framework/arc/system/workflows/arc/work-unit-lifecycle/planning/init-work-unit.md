---
purpose: Initialize a work unit on a `plan/<name>` branch with a meta file populated from `template-meta.md`.
audience: agent
arc:
  methods:
    - branch-format
---

# Workflow: Initialize Work Unit

Creates a work unit on a `plan/<name>` planning branch with a `meta-{name}.md` file in `active/` populated
from `template-meta.md`.

**When to use:** Starting a new work unit. See [Branch Protection Modes][work-org-protection] for when this
is mandatory vs the default path.

**What comes after:**

```text
plan-* exploration (optional, when scope warrants synthesis)
    ↓
1_create-prd                — requirements
    ↓
2_generate-tasks            — task list
    ↓
activate-work-unit          — Planning → Active; branch plan/<name> → <type>/<name>
    ↓
integrate-work-unit         — PR, review, merge to main
```

---

## Steps

### 1) Ensure Clean Base Branch

```bash
git switch {base-branch}
git pull origin {base-branch}
```

Verify the working tree is clean (`git status`). If there are uncommitted changes from a prior session,
resolve them before proceeding.

### 2) Create Planning Branch

```bash
git checkout -b plan/{name}
```

Use the planning life-phase prefix per [`branch-format`][branch-format] method.

### 3) Move Plan-Doc to Active · `arc-in-git` only

> **Skip this step** if `pm.mode` is `none` or `external`. Skip also if no plan-doc exists in
> `backlog/{planned,provisional}/{name}/`.

If resuming from a backlog stub, move the plan-doc and any companions (`prd-{name}.md`, `notes-{name}.md`)
into the active workspace:

```bash
git mv .arc/backlog/{state}/{name}/plan-{name}.md .arc/active/
```

See [Work Planning Strategy][work-planning] for the plan-doc lifecycle.

### 4) Create Meta File

Create `.arc/active/meta-{name}.md` from `template-meta.md`. Replace the H1 title
(`# Metadata: {wu-name}`) with the actual work unit name, then apply these substitutions and overrides:

1. **State** → `Planning`
2. **Owner** → substitute the `{arc.identity}` placeholder with the resolved `arc.identity` value
3. **Branch** → current planning branch (e.g., `plan/{name}`)
4. **Spec** → backticked `plan-{name}.md` filename when one exists; otherwise `[none]`
5. **Next Action** → freeform planning-session prompt (e.g., "Run `1_create-prd.md`" or "Continue
   `plan-*` exploration")

Remaining fields take their `template-meta.md` defaults.

**Idempotent create + reconcile.** If a meta file already exists on this branch (e.g., resuming a partial
init), do not recreate it. Reconcile **Branch** and **Spec** to reflect the current branch name and
plan-doc filename; preserve other field values as-is.

> [!CAUTION]
> `commit-interlock` release — commit as `workflowCommit`. Stage the plan-doc move (when present)
> with the meta file as a bundled init commit; otherwise dedicated. Subject per
> [`commit-format`][commit-format]; meta-file commit shape per [DEV-RULES.ARC][dev-rules-arc]
> § Commit Discipline.

### 5) Push Planning Branch

Set upstream for the planning branch.

> [!CAUTION]
> `push-interlock` release — `workflowPush`: `-u origin plan/{name}`.

### 6) Proceed to Next Step

+ If the work needs synthesis exploration first: create `plan-*.md` documents (see [Work Planning
  Strategy][work-planning] for conventions)
+ If ready for requirements: proceed to [1_create-prd][create-prd]

---

[create-prd]: ../../1_create-prd.md
[commit-format]: ../../../../methods/commit-format.md
[branch-format]: ../../../../methods/branch-format.md
[dev-rules-arc]: ../../../../../reference/constitution/DEV-RULES.ARC.md
[work-org-protection]: ../../../../../reference/strategies/arc/strategy-work-organization.md#branch-protection-modes
[work-planning]: ../../../../../reference/strategies/arc/strategy-work-planning.md
