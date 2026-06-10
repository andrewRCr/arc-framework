---
name: branch-format
description: Branch name format — type prefix, separator, naming convention
related:
  - commit-format
override-active: false
---

# Method: branch-format

> - **Workflow:** [activate-work-unit.md][activate-work-unit]
> - **When:** Agent creates a new branch (planning life-phase or execution-phase)
>
> - **Contract:** Branches follow a consistent type-prefixed naming convention enabling visual
>   scannability across many branches in a project.
> - **Related:** [commit-format](commit-format.md) — branch typing and commit typing compose
>   independently; the branch's type prefix doesn't constrain which commit types appear within
>   the WU.

## branch-format.override

[No override configured]

## branch-format.default

[Conventional Branch][cb-spec]-style type prefix, hyphenated kebab-case branch name.

```text
<type>/<branch-name>
```

**Types:** `feat` `fix` `chore` `refactor` `hotfix`

**Per-type semantic:**

- `feat/<name>` — new feature or capability
- `fix/<name>` — bug fix or regression repair
- `chore/<name>` — non-functional housekeeping (dependency bumps, build config, documentation
  maintenance — bundles `docs/`, `perf/`, `style/` per Conventional Branch convention)
- `refactor/<name>` — internal restructuring with no behavior change (kept separate from
  `chore/`: planned refactors are typically multi-commit WUs with their own design space,
  distinct from one-off maintenance)
- `hotfix/<name>` — urgent production-bypass fix; typically atomic in character, light-ceremony

**Planning life-phase prefix:** `plan/<branch-name>` — used during the planning life-phase of a
WU (discovery, draft-doc iteration, spec authoring, task generation). Rotates to one of the type
prefixes above at activation. See `strategy-work-organization.md` § Branching for the rotation
mechanics.

The `plan/` prefix is invariant — it carries semantic coupling to ARC's `State: Planning`
state-machine value and session-init's branch-pattern fallback. The type set above is the
overridable surface; the planning prefix is not.

**Branch name conventions:**

- Lowercase, hyphen-separated (kebab-case)
- Short and descriptive — name the WU, not the task
- No trailing slashes; no characters beyond `[a-z0-9-]`

**Worktree branch posture:** A work unit's branch is the same branch regardless of which worktree checks it
out, so worktrees introduce no new naming surface — the type set, the `plan/` prefix, and the override
mechanism below govern ARC-created branches in linked worktrees exactly as in the primary checkout. A branch
that arrives in a worktree ARC did not create is advisory only: ARC warns when its name does not match this
convention but never refuses or relocates it, so ARC composes with externally-created branches rather than
rejecting them.

**Relationship to Conventional Branch.** ARC's default set is *inspired by* Conventional Branch
but doesn't strictly match its recommended set. CB's recommended set is
`feature|feat | bugfix|fix | chore | hotfix | release`. ARC:

- Adopts `feat`, `fix`, `chore`, `hotfix` (4 of 5).
- Extends with `refactor` (treats planned refactor as distinct from chore — multi-commit
  internal restructuring deserves its own type space).
- Drops `release` — ARC's release-lifecycle model is unspecified at this point in the
  methodology's evolution; projects that maintain release branches today can add `release/`
  via override below.
- Bundles `docs`, `perf`, `style` under `chore` per CB convention. Projects that prefer
  Angular-style commit-type granularity at the branch level can extend via override.

For ARC's commit-side type set, see [`commit-format`](commit-format.md).

### Override mechanism

Projects override the default type set by populating `branch-format.override` above with a
custom type list and per-type semantic. Common overrides:

- **Add `release/`** for projects with formal release-branch workflows.
- **Add `docs/`, `perf/`, `style/`** for projects that prefer Angular Conventional Commits
  granularity at the branch level.
- **Prune** to a smaller set (e.g., `feat | fix | chore`) for simpler workflows.

When override is populated, agent reads override content as authoritative and ignores the
default. The override section's structure mirrors the default's: type list, per-type semantic,
naming conventions.

---

[cb-spec]: https://conventional-branch.github.io/
[activate-work-unit]: ../workflows/arc/work-unit-lifecycle/activate-work-unit.md
