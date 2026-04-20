# Methods & Extensions

Methods and extensions are ARC's two mechanisms for changing *behavior* rather than *values*.
Where [configuration](configuration.md) toggles enforcement via `arc-config.yml`, methods replace
how ARC does something and extensions add new steps to existing workflows.

Both live in the same directory (`system/workflows/`) and follow the same ownership model:
ARC provides the structure; your team fills in the content.

## Method Overrides

**File:** `arc-methods.md` in `.arc/system/workflows/`

Replace *how* ARC does something while preserving *what* it accomplishes. Each method defines a
contract (the invariant that both default and override must satisfy) and a default implementation.
Your team supplies an alternative that satisfies the same contract.

### How overrides work

To override a method, replace `[No override configured]` in its `.override` section with your
team's implementation. The agent checks `.override` first; if populated, it follows the override
and skips `.default`.

```markdown
### commit-format.override

Jira-prefixed format: `[PROJECT-123] type: description`

Subject line must start with a Jira ticket in brackets, followed by a
type keyword and colon. Body follows the same conventions as the default.

**Types:** `feat`, `fix`, `docs`, `refactor`, `test`, `chore`
```

The contract is preserved (commits follow a consistent, communicative format) while the
implementation changes to match your team's tooling.

??? info "Contracts are advisory"

    Contracts are not mechanically enforced — ARC trusts the team to ensure their override
    meets the contract. This is a deliberate design choice: mechanical enforcement of prose
    contracts would require a complexity layer that provides little value for teams already
    making conscious customization decisions.

### Available methods

| Method                  | What it controls                                                    |
| ----------------------- | ------------------------------------------------------------------- |
| `commit-format`         | Commit message structure (type, scope, body)                        |
| `commit-context-format` | Context footer patterns linking commits to tasks                    |
| `issue-triage`          | Severity thresholds for fix-vs-defer decisions on discovered issues |
| `test-first`            | Decision tree for when to write tests before implementation         |
| `session-state`         | How session state is read and written at boundaries                 |
| `diff-review`           | Aggregate diff review activity (used at pre-merge and composable)   |
| `review-triage`         | Classifying and acting on review findings                           |
| `quality-gate-commands` | Project-specific quality gate command definitions                   |

### On-demand loading

Method content loads on-demand when the agent reaches the relevant workflow step, not at session
start. During initialization, the agent scans `arc-methods.md` for override *presence* — which
methods have active overrides — without reading the full content. This keeps initialization fast
and context focused.

When a workflow references a method, the agent follows the link, reads the corresponding section,
and acts on whatever it finds — override content or default.

### Hook interaction

For methods with mechanical enforcement (commit format, context footer), hooks read configuration
from `arc-config.yml`. The `custom` config value bridges "I want enforcement" and "I want
*different* enforcement":

| Setting value  | Hook behavior                                                |
| -------------- | ------------------------------------------------------------ |
| `conventional` | Validates against ARC's built-in conventional commit pattern |
| `custom`       | Validates against the team's `commit.custom_pattern` regex   |
| `any`          | Skips format validation entirely                             |

For behavioral methods (session state, issue-triage, test-first) that do not have hook
enforcement, the override is purely agent-level: the agent reads and follows the override.

### Method dependencies

Some methods are coupled — overriding one without updating its related method may produce
inconsistent behavior:

| Method                  | Related Methods         | Coupling                        |
| ----------------------- | ----------------------- | ------------------------------- |
| `commit-format`         | `commit-context-format` | Both govern the commit message  |
| `commit-context-format` | `commit-format`         | Both govern the commit message  |
| `diff-review`           | `review-triage`         | Uses review-triage for findings |

All other methods are independent.

## Extension Points

**File:** `arc-extensions.md` in `.arc/system/workflows/`

Inject additional steps at specific locations in ARC workflows without replacing existing steps.
Extensions add behavior on top of ARC's defaults.

### How extensions work

To extend, replace `[No extension configured]` in the `.steps` section with your steps:

```markdown
### post-task-quality.steps

Run Snyk security scan on modified files:

1. `npx snyk test --file=package.json` — check for known vulnerabilities
2. If new vulnerabilities found, report in task completion summary
3. Critical/high severity → fail the quality check (block task completion)
4. Medium/low → note in completion summary, continue
```

Each preset section includes which workflow it extends, when it fires, and what the contract
allows. The agent encounters the reference in a workflow, follows the link to
`arc-extensions.md`, reads the section, executes any steps found (or skips if placeholder),
and returns to the workflow.

### Available extension points

| Extension                 | When it fires                                     |
| ------------------------- | ------------------------------------------------- |
| `post-task-quality`       | After Tier 1 checks, before marking task complete |
| `post-unit-quality`       | After Tier 2 checks at coherent unit completion   |
| `post-task-completion`    | After task marked complete, before reporting      |
| `post-context-load`       | After standard document loading at session start  |
| `pre-stage-review`        | After staging changes, before creating a commit   |
| `pre-merge-review`        | After pre-merge review, before push and PR        |
| `post-work-unit-activate` | After a work unit moves from backlog to active    |
| `post-work-unit-archive`  | After a work unit is archived                     |

### Preset vs. custom

**Preset (convention):** ARC defines these at specific, tested locations in workflow docs.
They have defined contracts and corresponding sections in `arc-extensions.md`. This is the
expected customization path.

**Custom (escape hatch):** Teams may add their own extension points elsewhere in workflow docs.
ARC does not block this, but custom points are outside the framework's design envelope —
framework updates may conflict, and the team is responsible for maintaining them.

## What About Templates?

ARC's document templates (PRD, task list, plan) define the structure that workflows depend on.
The task execution loop expects checkboxes, phase headers, and specific metadata fields. The
PRD workflow expects certain sections for requirements capture. Templates are **Framework
files** — they ship with ARC and are replaced on update.

To use ARC is to use its artifact structure. The templates define the shape; you fill them in
with your project's content.

## Which Mechanism Do I Use?

- If the customization changes a **value** that affects existing behavior →
  **[config](configuration.md)**
- If it adds **new steps** at a workflow point → **extension**
- If it **replaces** how ARC does something with how the team does it → **method override**
- If it fills in **project-specific content** in an existing ARC file → **project-level file
  edit** (DEV-RULES.PROJECT, QUICK-REFERENCE, agent briefings)
- If it adds **domain-specific guidance** for your project → **project strategy**
- If it adds **project-specific procedures** not covered by ARC → **project workflow**
- If it extends **project standards** for a specific domain → **domain-specific dev-rules**
