# Quality Gates

Quality gates are automated verification checkpoints that run at defined moments during
development. The [principle](../philosophy.md#operational-discipline) is that quality is
verified, not assumed (P4). The specific gates, tools, and strictness levels are project-defined
conventions. ARC provides the checkpoint structure; you provide the commands.

This page covers the tiered system at guide level. For tier boundaries, escalation guidance, and
task list integration patterns, see `strategy-quality-gates.md` in your
`.arc/reference/strategies/` directory.

## The Three-Tier System

Different checks have different costs and different value at different stages of work. Running
everything after every change is wasteful; running nothing until the end is risky. ARC's tiered
approach runs just enough validation at each stage to catch likely problems.

### Tier 1: Per-Task

**When:** After completing any task, before marking it complete.

**What:** Incremental checks on modified files only: type checking, linting, format checking,
and related unit tests. Fast feedback on the work just done.

**Time budget:** Seconds to ~1 minute.

This is the bread and butter of quality enforcement. Every task goes through Tier 1 before the
agent marks it complete and reports to you. Issues are caught while context is fresh and fixes
are cheap.

### Tier 2: Coherent Unit

**When:** After completing a logical group of related tasks, typically when all subtasks of a
parent task are done, or when a standalone task touches cross-cutting code (shared services,
middleware, configuration).

**What:** Everything in Tier 1 at full project scope, plus targeted integration or E2E tests
for affected areas and build verification. Not the full test suite. Targeted tests that cover
the area you modified.

**Time budget:** 1–5 minutes.

Tier 2 catches integration breakage at natural boundaries. A parent task with three subtasks
gets Tier 1 after each subtask and Tier 2 when the parent is complete. The distinction matters:
Tier 1 checks individual files, Tier 2 checks that the pieces work together.

### Tier 3: Per-Phase / Pre-PR

**When:** After completing a phase (all tasks in the phase done), before creating a pull
request, or as the final quality gate before merge.

**What:** Full type checking, full linting, full test suite (unit, integration, E2E), build
verification, and documentation checks — everything, at full scope, with no shortcuts.

**Time budget:** 5–15+ minutes (acceptable because it's infrequent).

This is the zero-tolerance gate. Everything must pass. Tier 3 failures after proper Tier 1/2
execution should be rare — they catch cross-cutting issues that targeted checks miss.

## Defining Your Gates

Quality gate commands are project-specific, defined in your `DEV-RULES.PROJECT.md` and
`QUICK-REFERENCE.md`. ARC doesn't know what "lint" or "test" means for your stack. During
[initial setup](../getting-started.md#initial-setup), you define these commands as part of your
project's development rules.

A typical project might define:

| Tier   | Commands                                                        |
| ------ | --------------------------------------------------------------- |
| Tier 1 | `npm run lint -- path/to/file.ts`, `npm run test:unit`          |
| Tier 2 | `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`|
| Tier 3 | All Tier 2 commands + `npm run test:e2e` + full build           |

The `quality-gate-commands` method in `arc-methods.md` provides an override path for teams with
non-standard setups (environment-specific commands, conditional logic).

## When to Escalate

Quality verification itself is mandatory: every task goes through at least Tier 1 before
completion (P4). What's flexible is *when to run a higher tier* than the minimum required at
that checkpoint. The tiers define when checks *automatically* run; escalation is about choosing
to run more than the minimum when the situation warrants it:

- **Tier 1 → Tier 2:** You've touched code that integration tests exercise, made changes across
  multiple components, or you're about to context-switch to a different area of the codebase.
- **Tier 2 → Tier 3:** You've completed a significant body of work, you're about to end a
  session, or you want high confidence before a major context switch.

The cost of under-testing is discovering breakage later with stale context. The cost of
over-testing is slower velocity for checks that rarely catch anything. When in doubt, err toward
running more checks — a few extra minutes is cheaper than an hour of debugging.

## Task List Integration

Quality gate checkpoints integrate naturally into task lists:

- **Tier 1** is implicit; every task includes it before completion. No need to list explicitly.
- **Tier 2** runs automatically when the agent completes a coherent unit (all subtasks of a
  parent done).
- **Tier 3** is typically an explicit task in a final verification phase:

```markdown
### **Phase N:** Verification

- [ ] **N.1 Run full quality gates**
    - Full lint, type check, test suite, build verification
    - Fix any failures before proceeding
```

Phase-level checkpoints can also be explicit when a phase modifies code that integration tests
exercise — a "run integration checkpoint" task at the end of the phase.
