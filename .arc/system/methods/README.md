# Methods

Per-file method defaults and overrides. Each method defines a contract (what must be accomplished) and a default
(how ARC does it out of the box).

**How overrides work:** To replace a default, populate the method's `.override` section with your team's
implementation. For each method, the agent checks `.override` first — if populated, follow the override and skip
`.default`. Contracts are advisory: your override should satisfy the same invariant as the default.

**Loading model:** Method defaults and overrides load on-demand at workflow trigger points, not at session
initialization. Session-init scans the `override-active` frontmatter field for override *presence* without reading
method bodies. Workflow documents declare their method dependencies in frontmatter (`arc.methods`) — see
[Workflow Authoring Strategy][workflow-authoring] and
[Session Operations Strategy § Method and Extension Loading][session-ops-methods].

**Classification:** Configurable — preserved through three-way merge during framework updates. For the full
configurability model, see [Configurability Architecture Strategy][config-arch].

## Index

- [commit-format](commit-format.md) — commit message structure, types, scope, body
- [commit-context-format](commit-context-format.md) — `Context:` footer patterns
- [issue-triage](issue-triage.md) — severity triage, fix-vs-defer decisions
- [test-first](test-first.md) — decision tree by change type
- [session-state](session-state.md) — reading and writing session state
- [diff-review](diff-review.md) — aggregate diff review activity
- [review-triage](review-triage.md) — classifying and acting on review findings
- [quality-gate-commands](quality-gate-commands.md) — project quality gate definitions

---

[workflow-authoring]: ../../reference/strategies/arc/strategy-workflow-authoring.md
[session-ops-methods]: ../../reference/strategies/arc/strategy-session-operations.md#method-and-extension-loading
[config-arch]: ../../reference/strategies/arc/strategy-configurability-architecture.md
