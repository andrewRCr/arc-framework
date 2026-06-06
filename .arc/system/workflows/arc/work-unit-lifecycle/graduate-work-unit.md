---
purpose: Graduate a work unit from backlog/provisional/ to backlog/planned/, forcing a resolved Class.
audience: agent
arc:
  methods:
    - classify-work-unit
---

# Workflow: Graduate Work Unit

Promotes a work unit one rung up the readiness ladder — a `git mv` from `backlog/provisional/<name>/` to
`backlog/planned/<name>/`, forcing a resolved `Class` via the [`classify-work-unit`][classify-work-unit]
method, then re-rendering the readiness views. A flat backlog-internal move: no branch, no worktree, none of
the `active/`-graduation machinery — that belongs to [`init-work-unit`][init-work-unit].

**When to use:** A provisional work unit has firmed up into a startable candidate — its thesis is one the
project commits to, and it is ready to appear on the ready list a start decision is read from. Promotion to
`planned/` is the forcing point for `Class` (see the readiness rule below).

**Readiness ladder:** `provisional → planned → active`. This workflow covers the `provisional → planned`
rung; [`init-work-unit`][init-work-unit] covers `planned → active`. "Graduation" names this
readiness-ladder promotion — and only it.

**Readiness rule (enforced here):** a `backlog/planned/` work unit carries a resolved `**Class:**`
(`Light` / `Heavy` / `Novel`); `[TBD]` is legal only in `backlog/provisional/`. Planned-entry is the forcing point
because the start decision — read off the ready list — precedes activation, and that decision needs the
weight signal. This workflow states the *lifecycle constraint*; the triage that resolves the value lives in
the [`classify-work-unit`][classify-work-unit] method (its single DRY home), loaded per the frontmatter
declaration.

> [!NOTE]
> **arc-in-git only.** This workflow operates on the `backlog/` pipeline, which exists only under
> `pm.mode: arc-in-git`. Under `none` or `external` there is no provisional/planned ladder to graduate within.

---

## Steps

### 1) Pre-condition gate

Verify the graduation context is well-formed:

- The work unit lives under `.arc/backlog/provisional/{name}/` (cohort-wrapped:
  `.arc/backlog/provisional/{cohort}/{name}/`), with `meta-{name}.md` present.
- `pm.mode` is `arc-in-git`.

If the work unit is already under `backlog/planned/`, it has already graduated — stop. If it lives in
`active/` or `completed/`, graduation does not apply.

### 2) Move provisional → planned

```bash
git mv .arc/backlog/provisional/{name}/ .arc/backlog/planned/{name}/
```

When the work unit is cohort-nested, move `.arc/backlog/provisional/{cohort}/{name}/` to
`.arc/backlog/planned/{cohort}/{name}/`, creating the planned-side cohort directory first
(`mkdir -p`) when this is its first graduated member. Remove an emptied
`provisional/{cohort}/` directory only when no other provisional members remain.

### 3) Force the Class estimate · `classify-work-unit`

Load the [`classify-work-unit`][classify-work-unit] method and apply it as a **confirm-or-ratchet** over the
work unit's `**Class:**` field:

- A `[TBD]` value is resolved to `Light` / `Heavy` / `Novel` against the boundary tests — a best estimate when
  planning has not yet substantiated a floor.
- An existing estimate is confirmed, or ratcheted per the method's estimate-vs-realized rule.

A graduated work unit never leaves `planned/` carrying `[TBD]`. Edit `meta-{name}.md`'s `**Class:**` to the
resolved value and stage it together with the Step 2 move.

> [!CAUTION]
> `commit-interlock` release — commit as `workflowCommit`:

```text
chore(arc): graduate {name} to planned

- Move backlog/provisional/{name}/ → backlog/planned/{name}/
- Resolve Class: {prior} → {resolved}

Context: meta-{name}.md (graduation)
```

### 4) Regen readiness views · `arc-in-git` only

Re-render the readiness views so the graduated work unit appears as startable:

- **ROADMAP** — re-render per [Work Organization Strategy § ROADMAP][work-org-roadmap]; the work unit joins
  the **Ready** tier (or **Blocked**, when it carries unsatisfied dependencies).
- **STATUS.USER** — refresh per [§ STATUS.USER][work-org-statususer] for the owning identity; the work unit
  enters the ready slice. STATUS.USER is a gitignored per-machine cache — regenerate it locally; it is not
  part of the commit.

Default: dedicated `chore(arc):` commit for the ROADMAP re-render. It may ride the graduation commit (Step 3)
only when the render delta is trivial — see [DEV-RULES.ARC § Atomicity][dev-rules-atomicity].

> [!CAUTION]
> `commit-interlock` release — commit as `workflowCommit`:

```text
chore(arc): refresh roadmap for {name} graduation

- Re-render ROADMAP after {name} enters Ready

Context: meta-{name}.md (graduation)
```

---

## Next Step

The work unit is now a startable candidate on the ready list. When work begins, proceed to
[`init-work-unit`][init-work-unit] — the next rung (`planned → active`), which creates the planning branch and
graduates the subdir into `active/`.

## Related Workflows

- [`init-work-unit`][init-work-unit] — succeeding ceremony; promotes a planned work unit to active.
- [`activate-work-unit`][activate-work-unit] — flips `Planning → Active` once the spec and task list exist.

---

[classify-work-unit]: ../../../methods/classify-work-unit.md
[init-work-unit]: planning/init-work-unit.md
[activate-work-unit]: activate-work-unit.md
[work-org-roadmap]: ../../../../reference/strategies/arc/strategy-work-organization.md#roadmap
[work-org-statususer]: ../../../../reference/strategies/arc/strategy-work-organization.md#statususer-view
[dev-rules-atomicity]: ../../../../system/rules/DEV-RULES.ARC.md#atomicity
