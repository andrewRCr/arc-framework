---
name: discover-next-work
description: Identify the next work candidate and frame its readiness and planning path.
arc:
  methods:
    - assess-parallel-fit
override-active: false
---

# Method: discover-next-work

> - **Workflow:** [session-init][session-init]
> - **When:** The agenda enters Orient and supplies discovery intent
>
> - **Contract:** Report candidate readiness and proposed next steps, asking before acting; overlap advice never gates.

## discover-next-work.override

[No override configured]

## discover-next-work.default

Use the supplied `pmMode`, `protection`, and optional `seed`. Carry the candidate, readiness, proposed next action and
question into orientation.

When a seed names a backlog work unit, pre-focus it as the candidate and offer to initialize it: confirmation only,
never automatic initialization. Resolve work-unit state by slug with `arc status <slug>`. Otherwise follow `pmMode`:

- **`arc-in-git`:** Render the live project view with `arc status --project` and identify the next queued or suggested
  item. Check `.arc/backlog/` for its source artifacts — PRDs, drafts and meta. Report what exists and its readiness;
  propose the next step, typically `arc start` to initialize the chosen unit or continued drafting, and ask before acting.
- **Any other mode:** Check `.arc/active/` for the candidate's artifacts. Report readiness: a draft PRD needs refinement,
  a complete PRD is ready for task generation, and a task list is ready for activation. Propose the next step; with no
  artifacts, propose [create-spec][create-spec]. Ask before acting.

With more than one candidate, load [assess-parallel-fit][assess-parallel-fit] and apply its multi-candidate selection
over the in-flight set. Surface its posture as advisory input, preserving the person's choice.

Under full protection, initialize the chosen unit through `arc start <slug>` before drafting or spec work, preserving
its interlocks. Under partial protection, proceed directly to [create-spec][create-spec] on confirmation.

---

[session-init]: ../workflows/arc/session-lifecycle/session-init.md
[create-spec]: ../workflows/arc/create-spec.md
[assess-parallel-fit]: assess-parallel-fit.md
