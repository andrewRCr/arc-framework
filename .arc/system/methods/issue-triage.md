---
name: issue-triage
description: Severity-based triage for pre-existing issues encountered in files being modified
override-active: false
---

# Method: issue-triage

> - **Workflow:** [process-task-loop.md][process-task-loop]
> - **When:** Pre-existing issues encountered in files being modified (the "leave it cleaner" rule in
>   [DEV-RULES.ARC][dev-rules-arc])
>
> - **Contract:** Given an issue found in a file you are modifying, return a decision: fix inline or defer.
>   Deferred issues route per the capture guidance in [DEV-RULES.ARC § Leave it cleaner][dev-rules-arc] —
>   never to completion notes or session notes.

## issue-triage.override

[No override configured]

## issue-triage.default

Severity-based triage.

**Assess severity and decide:**

- **Minor** (< 5 minutes): Fix immediately without asking
- **Moderate** (5–15 minutes): Fix immediately, document in commit message
- **Major** (> 15 minutes): Ask user for direction — fix now or defer

**Context-switching cost:** Time thresholds assume in-context work — the issue is in code you're
already reading. When an issue requires switching to a different domain or unfamiliar code, the
effective cost is higher than the raw fix time. Assess severity based on total attention cost, not
just fix duration. An issue in a completely different module is effectively major regardless of fix
time — surface it to the user rather than context-switching away from the current task.

**If fixing:** Note in commit message ("Also fixed X pre-existing issues").

**If deferring:** Route per [DEV-RULES.ARC][dev-rules-arc] § Leave it cleaner — the routing table determines
destination based on scope and PM mode. Never defer to completion notes or session notes.

---

[process-task-loop]: ../workflows/arc/3_process-task-loop.md
[dev-rules-arc]: ../../reference/constitution/DEV-RULES.ARC.md
