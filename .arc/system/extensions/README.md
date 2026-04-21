# Extensions

Per-file extension points for ARC workflows. Each extension defines a contract (when it fires and what it can
do) and an `active` gate — workflows check the gate at the fire point and skip invocation if `false`.

**How extensions work:** Each preset extension defines a contract and starts empty (`active: false`). To add
behavior, populate the extension's `.actions` section with your team's actions and set `active: true`. The
workflow reads `active` at the fire point — if `true`, it executes the actions; if `false`, it skips and
continues. Extensions add behavior to workflows; they do not replace existing steps.

**Loading model:** Extensions are architecturally on-demand — workflows check the relevant extension at the fire
point, not at session initialization. Workflow documents declare extension dependencies in frontmatter
(`arc.extensions`) — see [Workflow Authoring Strategy][workflow-authoring] and
[Session Operations Strategy § Method and Extension Loading][session-ops-methods].

**Classification:** Configurable — preserved through three-way merge during framework updates. For the full
configurability model, see [Configurability Architecture Strategy][config-arch].

## Index

- [post-task-quality](post-task-quality.md) — additional checks after each task
- [post-unit-quality](post-unit-quality.md) — additional checks at coherent unit boundaries
- [post-task-completion](post-task-completion.md) — additional actions after task marked complete
- [post-context-load](post-context-load.md) — additional context loading at session start
- [pre-stage-review](pre-stage-review.md) — additional staging verification before commit
- [pre-merge-review](pre-merge-review.md) — structured review ceremony before merge
- [post-work-unit-activate](post-work-unit-activate.md) — actions after work unit activation
- [post-work-unit-archive](post-work-unit-archive.md) — actions after work unit archival

## Extension Points

Sorted by workflow lifecycle order — when each extension fires across a session. Alphabetical ordering doesn't
answer the adopter question "when should my extension fire?"; lifecycle ordering does.

| Extension               | Workflow            | Fires                    | Purpose                                  |
|-------------------------|---------------------|--------------------------|------------------------------------------|
| post-context-load       | session-init        | Step 2 → orientation     | Load additional context at session start |
| post-task-quality       | process-task-loop   | Tier 1 pass → mark `[x]` | Supplement Tier 1 after each task        |
| post-task-completion    | process-task-loop   | Mark `[x]` → report      | External tracker sync / notifications    |
| post-unit-quality       | process-task-loop   | Tier 2 at unit boundary  | Supplement Tier 2 at unit boundaries     |
| pre-stage-review        | prepare-commits     | Staging → commit         | Verify staged content before commit      |
| pre-merge-review        | integrate-work-unit | diff-review → push/PR    | Ceremony on top of diff-review method    |
| post-work-unit-activate | activate-work-unit  | After core activation    | PM layer interface after activation      |
| post-work-unit-archive  | archive-work-unit   | After core archival      | PM layer interface after archival        |

---

[workflow-authoring]: ../../reference/strategies/arc/strategy-workflow-authoring.md
[session-ops-methods]: ../../reference/strategies/arc/strategy-session-operations.md#method-and-extension-loading
[config-arch]: ../../reference/strategies/arc/strategy-configurability-architecture.md
