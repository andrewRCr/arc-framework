---
name: quality-gate-commands
description: Project-defined quality gate commands — Tier 1, 2, 3
override-active: false
---

# Method: quality-gate-commands

> - **Workflow:** [process-task-loop.md][process-task-loop]
> - **When:** Agent runs quality gates (Tier 1, Tier 2, or Tier 3)
>
> - **Contract:** Project-defined quality gate commands. Must return zero exit code on pass, non-zero on
>   failure.

## quality-gate-commands.override

[No override configured]

## quality-gate-commands.default

Commands specified in [DEV-RULES.PROJECT][dev-rules-project] § Quality Gates. This is a passthrough by
design — no universal default command set exists across projects. The method exists so the process-task-loop
references quality gates uniformly through the method layer, and teams with non-standard setups
(environment-specific commands, conditional logic) have a clean override path.

**`Class`-invariant.** The gate command set does not scale with a work unit's `Class` — the same gates run
from a `light` work unit to a `novel` one. `Class` scales design-authoring ceremony (how much spec and
planning the work warrants), never the engineering bar. See [DEV-RULES.ARC][dev-rules-arc] § Scaled Process,
Invariant Discipline.

---

[process-task-loop]: ../workflows/arc/process-task-loop.md
[dev-rules-project]: ../../system/rules/DEV-RULES.PROJECT.md
[dev-rules-arc]: ../../system/rules/DEV-RULES.ARC.md
