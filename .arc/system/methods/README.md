# Methods

Per-file method defaults and overrides. Each method defines a contract (what must be accomplished) and a default
(how ARC does it out of the box).

**How overrides work:** To replace a default, populate the method's `.override` section with your team's
implementation. For each method, the agent checks `.override` first — if populated, follow the override and skip
`.default`. Contracts are advisory: your override should satisfy the same invariant as the default.

An optional `override-mode` frontmatter field selects the disposition when `.override` is populated. `replace`
(the default; absent ⇒ this) stands alone — follow the override and skip `.default`. `extend` applies `.default`
first, then appends the override to it.

**Loading model:** Method defaults and overrides always load on-demand at workflow trigger points. Session-init
does not read methods; the `override-active` frontmatter field is consumed by the framework-repo CI audit, docs
generation, and authoring tooling, not by session-init. Workflow documents declare their method dependencies in
frontmatter (`arc.methods`) — see [Workflow Authoring Strategy][workflow-authoring] and
[Session Operations Strategy § Method and Extension Loading][session-ops-methods].

**Classification:** Configurable — preserved through three-way merge during framework updates. For the full
configurability model, see [Configurability Architecture Strategy][config-arch].

## Method Dependencies

Overriding a method without updating its related methods may produce inconsistent behavior. Check related methods
when populating any `.override` section. Methods not listed here are independent.

| Method             | Related Methods    | Coupling                        |
|--------------------|--------------------|---------------------------------|
| commit-format      | commit-footer      | Both govern the commit message  |
| commit-footer      | commit-format      | Both govern the commit message  |
| diff-review        | review-triage      | Uses review-triage for findings |
| assess-cohort-fit  | classify-work-unit | Upper/lower WU-boundary tests   |
| classify-work-unit | assess-cohort-fit  | Upper/lower WU-boundary tests   |
| testing-standards  | test-first         | Planning/execution seam split   |
| test-first         | testing-standards  | Planning/execution seam split   |

---

[workflow-authoring]: ../../reference/strategies/arc/strategy-workflow-authoring.md
[session-ops-methods]: ../../reference/strategies/arc/strategy-session-operations.md#method-and-extension-loading
[config-arch]: ../../reference/strategies/arc/strategy-configurability-architecture.md
