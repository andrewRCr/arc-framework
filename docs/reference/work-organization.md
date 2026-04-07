# Work Organization

ARC organizes development work by **type** (what kind of work) and **planning status** (planned
vs discovered), not by size or complexity. This eliminates subjective sizing debates and routes
each kind of work through the appropriate process — planned
[work units](glossary.md#work-unit) get the full pipeline, discovered work gets a lighter
workflow tuned for its reactive, cascading nature.

For a narrative introduction to the categories, lifecycle, and planning module, see
[Work Planning](../work-planning.md#work-organization). This page covers the decision guidance,
rationale, and common pitfalls. For the full operational specification (directory layout, branch
lifecycle, archive structure), see `strategy-work-organization.md` in your
`.arc/reference/strategies/` directory.

## Categorizing Work

Two questions determine where work goes:

**Step 1 — "Was this planned in advance?"**

- **No** (discovered during development) → `incidental/`
- **Yes** (has a PRD or formal planning) → continue to Step 2

**Step 2 — "Does this add user-visible capability from product vision?"**

- **Yes** → `feature/`
- **No** → `technical/`

Planned vs discovered is Step 1 because different workflows apply: planned work gets PRDs and
dedicated branches; incidental work doesn't.

| Scenario                              | Planned? | User-visible? | Category                      |
| ------------------------------------- | -------- | ------------- | ----------------------------- |
| User authentication system            | Yes      | Yes           | `feature/user-authentication` |
| CI pipeline improvements              | Yes      | No            | `technical/ci-pipeline`       |
| Type errors found during feature work | No       | —             | `incidental/tasks-chore-*.md` |
| Bug found while testing               | No       | —             | `incidental/tasks-fix-*.md`   |

### Edge cases

**UX and polish improvements:** Planned and substantial → `technical/`. Discovered and small →
`incidental/`.

**Refactoring:** Large, planned refactoring → `technical/`. Discovered during feature work →
`incidental/`.

**Documentation:** Planned documentation project → `technical/` (or `feature/` if user-facing
like a public guide). Quick doc updates → `incidental/`.

**Production issues:** Critical (user-impacting) → `incidental/` with a dedicated branch
regardless of size. Non-critical → capture in backlog for triage; may become planned work later.

??? info "Why type-based, not size-based?"

    Size-based categories ("epic", "small feature", "task") create ambiguity: is a CI pipeline
    overhaul an "epic" or a "large task"? The distinction matters because it determines which
    workflow applies — and size-based names make that workflow selection subjective.

    The planned/unplanned distinction as the primary axis draws on
    [The Phoenix Project](https://itrevolution.com/product/the-phoenix-project/)'s identification
    of this as the fundamental organizational split (Business Projects vs Unplanned Work).
    Technical work as a first-class category follows
    [SAFe's Enabler concept](https://scaledagileframework.com/enablers/) — infrastructure work
    deserves intentional planning, not backlog-afterthought status. The stacked branch model for
    incidental work builds on the stacked development pattern used at companies like Meta and
    Google and supported by tools like [Graphite](https://graphite.dev/) and
    [gh-stack](https://github.com/timothyandrew/gh-stack), adapted here for discovered work
    rather than planned decomposition.

    These are complementary to — not competing with — Conventional Commits. Commit types
    (`feat`, `fix`, `refactor`) describe *what changed*; ARC's branch categories describe
    *why it was planned and when it was discovered*.

## Incidental Work

Most discovered issues — a type error, a missing test, a documentation gap — are handled as
inline fixes or [atomic tasks](../work-planning.md#atomic-tasks) without leaving the current
branch. These are incidental _work_, not incidental [work units](glossary.md#work-unit).

An incidental work unit is something bigger: a multi-phase blocker discovered mid-implementation
that needs its own task list, branch, and review cycle. A dependency you didn't know existed, a
foundational issue that must be resolved before the current work can continue. Incidental work
units get task lists but not PRDs — requirements emerge during execution, not upfront.

What makes incidental work units distinct from planned ones is that they're **discovery-driven**
(can't plan what you haven't found yet), **cascading** (fixing A reveals B reveals C), and
**interleaved** (the parent work pauses until the incidental work resolves). These properties
make lightweight stacked branching essential — the incidental branch preserves the parent-child
causality and enables independent review.

### Branching model

Every incidental work unit gets its own branch, always stacked on the branch where the work was
discovered — not on the base branch. This preserves causality: work discovered _during_ parent
work depends on parent context.

```text
main
└── technical/service-modernization
    └── incidental/filter-testing         ← discovered during parent work
        └── incidental/pagination-fixes   ← discovered during filter testing
```

Complete deepest child first, merge up to parent. Each branch gets its own task list, review
cycle, and archive entry. Stacking also applies to planned work — a task list may span multiple
stacked branches for smaller, reviewable PRs.

## Branch Protection

ARC offers two branch protection modes, configured via `branch.protection` in `arc-config.yml`.
Both require branches for planned work; they differ on everything else.

| Factor             | `partial` (default)             | `full`                      |
| ------------------ | ------------------------------- | --------------------------- |
| Planned work       | Branches required               | Branches required           |
| Atomic/maintenance | Commit directly to base         | Micro-branches required     |
| Review culture     | Selective — PR substantive work | All changes reviewed        |
| Overhead           | Moderate                        | Higher (every change = PR)  |
| Best for           | Solo / small teams              | CI/CD pipelines, compliance |

**Start with `partial`** unless you have branch protection rules enabled or compliance
requirements. Move to `full` when the overhead is justified by your team's review needs.

Under `full` protection, lifecycle transitions (archival, planning, activation) that can't go
directly to the base branch are naturally **batched**: a single planning branch carries archival
of the completed work unit alongside planning artifacts for the next one, merged via one PR.

For the full settings table, see [Configuration § Branch Model](../customization/configuration.md#branch-model).

## Common Mistakes

**Categorizing by size, not type.** Directories like `epic/` or `small-features/` mix up what
determines the workflow. A CI pipeline overhaul and a user authentication system might be the
same "size" but need fundamentally different documentation and stakeholder communication. Use
`feature/`, `technical/`, `incidental/`.

**Branching every incidental discovery.** Creating a branch for every discovered issue (typo fix,
missing test, config correction) adds overhead without value. Stay on the current branch for small
work. Commit with conventional prefixes and task references for traceability. Branch only when the
[criteria above](#branching-model) are met.

**Over-processing incidental work.** Incidental work gets task lists, not PRDs. Notes files are
optional, reserved for complex discoveries. If you're writing a PRD for a discovered bug fix,
the work is either planned (and belongs in `feature/` or `technical/`) or over-documented.

**Skipping task references in commits.** Commits without context references lose traceability.
ARC's `Context:` footer connects every commit to its work context — the agent handles this via
`arc-commit`, but manual commits should follow the same convention.
