---
name: quality-gate-commands
description: Project-defined quality gate commands — Tier 1, 2, 3
has-override: false
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

---

[process-task-loop]: ../workflows/arc/3_process-task-loop.md
[dev-rules-project]: ../../reference/constitution/DEV-RULES.PROJECT.md
