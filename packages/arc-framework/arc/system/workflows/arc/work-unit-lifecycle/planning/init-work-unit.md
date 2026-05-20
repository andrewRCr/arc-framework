---
purpose: Initialize a work unit on a `plan/<name>` branch with a meta file populated from `template-meta.md`.
audience: agent
arc:
  methods:
    - branch-format
  extensions:
    - pre-push-review
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

Verify `{base-branch}` is at parity with `origin/{base-branch}` after pull
(`git rev-list --count {base-branch}..origin/{base-branch}` returns `0`). Non-zero indicates the pull
didn't reach parity — typically a network glitch or a fetch-then-rebase scenario; investigate before
creating the planning branch. This guard matters most on cross-machine resume, where local
`{base-branch}` may be arbitrarily behind `origin/{base-branch}` from integration work that landed
on a sibling clone.

### 2) Create Planning Branch

```bash
git checkout -b plan/{name}
```

Use the planning life-phase prefix per [`branch-format`][branch-format] method.

Open the per-WU user workspace subdir (creates `user/{identity}/{name}/` and seeds
SESSION-NOTES.md from template; defensive prompt fires if a stale subdir from a prior WU
exists):

```bash
arc user open {name}
```

### 3) Graduate Backlog Subdir to Active · `arc-in-git` only

> **Skip this step** if `pm.mode` is `none` or `external`. Skip also if no backlog subdir exists
> at `backlog/{planned,provisional}/{name}/`.

When resuming from a backlog stub, graduate the per-WU subdir contents into the active workspace.
Under the per-WU subdir model, every backlog WU carries `meta-{name}.md` (always) plus any
plan-doc and companions:

```bash
git mv .arc/backlog/{state}/{name}/meta-{name}.md .arc/active/
git mv .arc/backlog/{state}/{name}/plan-{name}.md .arc/active/   # when present
git mv .arc/backlog/{state}/{name}/notes-{name}.md .arc/active/  # when present
# Move other companions present in the subdir
rmdir .arc/backlog/{state}/{name}
```

The meta-file carries the intentional metadata backfilled at backlog-stub creation (`Origin`,
`Owner`, `Depends On`, `Cohort`); Step 4's Path A reconciles `Branch` and `Spec` without
overwriting these fields.

See [Work Planning Strategy][work-planning] for the plan-doc lifecycle.

### 4) Create or Reconcile Meta File

Two paths depending on Step 3's outcome:

**Path A — Graduated from backlog** (`active/meta-{name}.md` exists from Step 3):

Reconcile the existing meta-file to reflect the now-active planning state:

1. **Branch** → current planning branch (e.g., `plan/{name}`)
2. **Spec** → backticked `plan-{name}.md` filename when one exists; otherwise leave as-is
3. **Next Action** → freeform planning-session prompt

**Preserve** `Owner`, `Origin`, `Depends On`, `Cohort`, `State: Planning`, and all other
backfilled fields. The backlog stub's intentional metadata survives graduation.

**Path B — Fresh WU** (no backlog meta-file):

Create `.arc/active/meta-{name}.md` from `template-meta.md`. Replace the H1 title
(`# Metadata: {wu-name}`) with the actual work unit name, then apply these substitutions and overrides:

1. **State** → `Planning`
2. **Owner** → substitute the `{arc.identity}` placeholder with the resolved `arc.identity` value
3. **Branch** → current planning branch (e.g., `plan/{name}`)
4. **Spec** → backticked `plan-{name}.md` filename when one exists; otherwise `[none]`
5. **Next Action** → freeform planning-session prompt (e.g., "Run `1_create-prd.md`" or "Continue
   `plan-*` exploration")

Remaining fields take their `template-meta.md` defaults.

**Idempotent.** If a meta file already exists on the branch (e.g., resuming a partial init from a
prior session, not from backlog graduation), do not recreate it. Reconcile **Branch** and **Spec**
as in Path A; preserve other field values.

> [!CAUTION]
> `commit-interlock` release — commit as `workflowCommit`. Under Path A, stage the backlog-subdir
> file moves (meta + plan-doc + companions) together with the meta-file reconcile edits as a
> bundled init commit. Under Path B, stage the new meta file as a dedicated init commit. Subject
> per [`commit-format`][commit-format]; meta-file commit shape per [DEV-RULES.ARC][dev-rules-arc]
> § Commit Discipline.

### 5) Push Planning Branch

Set upstream for the planning branch.

- **Extensions** · `#pre-push-review`: If `pre-push-review` appears in the active-extensions list
  (established at session init), load and execute its `.actions` before the push. Halt-on-fail surfaces
  an actionable message; user fix-and-retries or explicit-invoke bypasses. Otherwise, skip.

> [!CAUTION]
> `push-interlock` release — `workflowPush`: `-u origin plan/{name}`.

### 6) Proceed to Next Step

- If the work needs synthesis exploration first: create `plan-*.md` documents (see [Work Planning
  Strategy][work-planning] for conventions)
- If ready for requirements: proceed to [1_create-prd][create-prd]

---

[create-prd]: ../../1_create-prd.md
[commit-format]: ../../../../methods/commit-format.md
[branch-format]: ../../../../methods/branch-format.md
[dev-rules-arc]: ../../../../../reference/constitution/DEV-RULES.ARC.md
[work-org-protection]: ../../../../../reference/strategies/arc/strategy-work-organization.md#branch-protection-modes
[work-planning]: ../../../../../reference/strategies/arc/strategy-work-planning.md
