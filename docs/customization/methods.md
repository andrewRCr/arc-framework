# Methods & Extensions

Methods and extensions change behavior rather than configuration values. Methods define how ARC performs an
activity; extensions add project actions at named workflow boundaries.

Methods live under `.arc/system/methods/`; extensions live under `.arc/system/extensions/`. ARC supplies each
file's contract and default structure, while projects customize the designated sections.

## Method Overrides

Each method file defines a contract, a `.default` section, and a configurable `.override` section. Replace
`[No override configured]` with a project implementation that preserves the contract.

The optional `override-mode` frontmatter field controls composition when an override is populated:

- `replace` (the default) follows only the override.
- `extend` follows the default and then the override.

Contracts are advisory. Mechanical enforcement, where available, remains owned by the relevant hook or host control.

### Activity activation

Activation is separate from overriding. Only registered activity methods may declare `active`:

| Method             | Package default | Activity                                     |
| ------------------ | --------------- | -------------------------------------------- |
| `self-review`      | `true`          | Author-side aggregate diff preflight         |
| `frontline-review` | `false`         | Advisory distinct-context review before a PR |

Set `active` in the project method file to enable or disable that activity. A missing or malformed project value
emits a diagnostic and falls back to the registered package default. `override-active` and `override-mode` do not
activate an activity; they describe override content and composition.

### Notable methods

| Method                  | What it controls                                            |
| ----------------------- | ----------------------------------------------------------- |
| `commit-format`         | Commit message structure                                    |
| `commit-footer`         | Context footer patterns                                     |
| `issue-triage`          | Fix-now versus defer decisions                              |
| `test-first`            | Planning-time test sequencing                               |
| `testing-standards`     | Execution-time assertion, mocking, and isolation discipline |
| `session-state`         | Session-state behavior at boundaries                        |
| `self-review`           | Author-side aggregate diff preflight                        |
| `frontline-review`      | Advisory pre-publication review                             |
| `standard-review`       | Satisfying non-author review standard                       |
| `implementation-audit`  | Shared implementation-review rubric                         |
| `review-triage`         | Source verification and severity/disposition classification |
| `review-response`       | Bounded author-side finding response                        |
| `quality-gate-commands` | Project-specific quality gate commands                      |

### On-demand loading

Method content loads when its direct consumer reaches the relevant operation, not at session start. Workflows and
methods declare only the methods their own bodies may fire in `arc.methods`; workflow declarations root the
deduplicated transitive graph, so callers do not repeat their methods' dependencies. The agent reads each method at
its fire-point and applies its default or configured override.

### Reviewer guidance delivery

Reviewer integrations project the typed `standard-review` baseline into the reviewer's native instruction or
configuration surface. Projects may add typed rubric dimensions, but cannot replace baseline dimensions. An adapter
validates the effective exact-target content and records its guidance identity; that projection proves delivered
content, not rubric authority or merge enforcement.

### Hook interaction

Methods and configuration remain separate. For example, `commit-format` defines the convention while
`commit.format` selects hook enforcement (`conventional`, `custom`, or `any`). Behavioral methods without mechanical
enforcement remain agent-level contracts.

## Extension Points

Each extension file defines a fire point, input boundary where applicable, contract, and `.actions` section. Replace
`[No extension configured]` with project actions and set `active: true`. Session initialization records active
extensions by name; a workflow loads and executes `.actions` only at the declared fire point.

```markdown
---
name: post-task-quality
description: Additional quality checks after each task
active: true
---

## post-task-quality.actions

1. Run the project security scan.
2. Halt task completion when the scan fails.
```

### Available extension points

| Extension                      | When it fires                                           |
| ------------------------------ | ------------------------------------------------------- |
| `post-context-load`            | After standard document loading                         |
| `pre-spec-finalization-review` | Before spec finalization                                |
| `post-task-quality`            | After Tier 1 checks, before task completion             |
| `post-task-completion`         | After a task is marked complete                         |
| `post-unit-quality`            | After Tier 2 checks at a coherent-unit boundary         |
| `pre-activation`               | Before work-unit activation                             |
| `post-work-unit-activate`      | After work-unit activation                              |
| `pre-commit-review`            | After staging, before commit creation                   |
| `pre-push-review`              | Before every agent-managed workflow push                |
| `pre-pr-open`                  | Immediately before change-request creation              |
| `post-pr-open`                 | On every open change-request entry                      |
| `pre-merge`                    | After final-head settlement, before merge authorization |
| `post-work-unit-archive`       | After work-unit archival                                |

Extension guarantees are agent-layer guarantees. Direct CLI invocations and raw Git operations outside managed
workflows require hooks or host controls for structural enforcement.

### Preset versus custom

Preset extensions have shipped files, contracts, and tested workflow callsites. Custom extension points are an
escape hatch maintained by the project and may conflict with framework updates.

## Which Mechanism Do I Use?

- Change a value consumed by existing behavior: [configuration](configuration.md).
- Enable or disable a registered method activity: the method's `active` field.
- Replace how an activity is performed: a method override.
- Add actions at a named workflow boundary: an extension.
- Add project-specific procedure outside existing operations: a project workflow.
