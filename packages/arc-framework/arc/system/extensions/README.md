# Extensions

Per-file extension points for ARC workflows. Each extension defines a contract (when it fires and what it can
do) and an `active` gate — workflows check the gate at the fire point and skip invocation if `false`.

**How extensions work:** Each preset extension defines a contract and starts empty (`active: false`). To add
behavior, populate the extension's `.actions` section with your team's actions and set `active: true`.
Session-init enumerates files where `active: true` into the active-extensions list; fire-point directives
consult the list by name and execute `.actions` for listed extensions, skipping the rest. Extensions add
behavior to workflows; they do not replace existing steps.

**Loading model:** Session-init runs a single `grep -l "^active: true" .arc/system/extensions/*.md` to produce
the **active-extensions list** — the set of extensions with populated `.actions` in the current install.
Fire-point directives in workflows consult the list by name and skip invocation for extensions not on it.
Extension bodies load only when a fire-point executes an active extension's `.actions`. Workflow documents
declare extension dependencies in frontmatter (`arc.extensions`) — see
[Workflow Authoring Strategy][workflow-authoring] and
[Session Operations Strategy § Method and Extension Loading][session-ops-methods].

**Classification:** Configurable — preserved through three-way merge during framework updates. For the full
configurability model, see [Configurability Architecture Strategy][config-arch].

## Index

- [post-context-load](post-context-load.md) — additional context loading at session start
- [pre-spec-finalization-review](pre-spec-finalization-review.md) — team review ceremony at the spec-finalization
  gate, on top of the spec-review self-review
- [post-task-quality](post-task-quality.md) — additional checks after each task
- [post-task-completion](post-task-completion.md) — additional actions after task marked complete
- [post-unit-quality](post-unit-quality.md) — additional checks at coherent unit boundaries
- [pre-activation](pre-activation.md) — verification gate before WU activation
- [post-work-unit-activate](post-work-unit-activate.md) — actions after work unit activation
- [pre-commit-review](pre-commit-review.md) — agent-layer review before commit, complementary to git hooks
- [pre-push-review](pre-push-review.md) — verification at any push routed through the push wrapper
- [pre-pr-open](pre-pr-open.md) — retry-safe actions immediately before change-request creation
- [post-pr-open](post-pr-open.md) — idempotent actions on every open change-request entry
- [pre-merge](pre-merge.md) — final-state checks after review-response, before merge
- [post-work-unit-archive](post-work-unit-archive.md) — actions after work unit archival

## Extension Points

Sorted by workflow lifecycle order — when each extension fires across a session. Alphabetical ordering doesn't
answer the question "when should my extension fire?"; lifecycle ordering does.

| Extension                    | Workflow                         | Fires                           | Purpose                                   |
|------------------------------|----------------------------------|---------------------------------|-------------------------------------------|
| post-context-load            | session-init                     | Step 2 → orientation            | Load additional context at session start  |
| pre-spec-finalization-review | create-spec                      | spec-review → finalization stop | Team review ceremony at spec finalization |
| post-task-quality            | process-task-loop                | Tier 1 pass → mark `[x]`        | Supplement Tier 1 after each task         |
| post-task-completion         | process-task-loop                | Mark `[x]` → report             | External tracker sync / notifications     |
| post-unit-quality            | process-task-loop                | Tier 2 at unit boundary         | Supplement Tier 2 at unit boundaries      |
| pre-activation               | activate-work-unit               | Pre-condition gate → state-flip | Verify plan-quality before activation     |
| post-work-unit-activate      | activate-work-unit               | After core activation           | PM layer interface after activation       |
| pre-commit-review            | arc-commit / prepare-commits     | Staging → commit                | Agent-layer review before commit          |
| pre-push-review              | push wrapper                     | Push wrapper invocation         | Per-push checks (reserved-for-future)     |
| pre-pr-open                  | integrate-work-unit / run-errand | pushed head → create request    | Retry-safe creation actions               |
| post-pr-open                 | integrate-work-unit / run-errand | open request → review cycle     | Idempotent open-request actions           |
| pre-merge                    | integrate-work-unit              | review-response → merge         | Final-state checks before merge action    |
| post-work-unit-archive       | archive-work-unit                | After core archival             | PM layer interface after archival         |

---

[workflow-authoring]: ../../reference/strategies/arc/strategy-workflow-authoring.md
[session-ops-methods]: ../../reference/strategies/arc/strategy-session-operations.md#method-and-extension-loading
[config-arch]: ../../reference/strategies/arc/strategy-configurability-architecture.md
