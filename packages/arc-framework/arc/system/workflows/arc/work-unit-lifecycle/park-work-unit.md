---
purpose: Pause a started work unit in place — record why and what it waits on, keeping its checkout and branch.
audience: agent
---

# Workflow: Pause Work Unit

Step a started work unit aside without abandoning it. `arc pause` writes a pause section into the work unit's meta —
who paused it and since when, the reason, what it waits on, resume notes, and whether others may take it over — and
changes neither its `State` nor its placement, so the unit stays in flight with its checkout and branch as they are.
[`arc resume`][resume] clears the pause.

**When to use:** A started unit must step aside without being abandoned — a deliberate, resumable pause. Choosing a
pause over [`abandon`][deactivate] _is_ the resume commitment. A paused unit shows with its reason in `arc status`'s
Paused tier, and a verb that advances its work — activation, deactivation, publication, a stage change, a task close —
refuses until it resumes.

---

## Steps

### 1) Gate

From `**State:**` (`arc view meta`):

- `Planning` or `Active` → pause.
- `Integrating` → **stop.** Withdraw the open PR via `arc reopen` first, then pause.
- A stub is not in flight and never pauses: work it with `arc start {name}` instead.

### 2) Judgment — the reason and what it waits on

Compose the **`--reason`** — required on a first pause, never fabricated — from the actual cause for stepping aside
(blocked dependency, priority pivot, awaiting a decision). Name what resumption waits on: a work unit by slug
(`--waits-on <slug>`), or a note (`--waits-on-note <text>`). Add `--resume-notes <text>` for whoever picks the unit up,
and `--open` when someone else may take it over. Confirm this is a resumable pause, not a teardown — if the unit will
not be resumed, the transition is [`abandon`][deactivate].

### 3) Run `arc pause`

```bash
arc pause {name} --reason "<why this unit is pausing>" --waits-on <slug>
```

`{name}` defaults to this checkout's unit. The verb writes the pause in one write; nothing is staged, committed, or
pushed. It reports work no one else can reach — the work branch's unpushed commits and uncommitted changes in this
checkout — without refusing: push the branch when another person or machine should be able to pick the unit up. On a
paused unit the same verb updates the fields it is given and keeps the rest; `--no-waits-on` and `--no-resume-notes`
clear those fields, and `--no-open` closes it to takers.

### 4) Free the checkout (optional)

The checkout stays held for the unit. To free it, run `arc locus release` from it, which removes a spawned checkout once
its removal check passes, or releases an anchored one; `arc materialize {name}` gives the unit a checkout again later.

---

## Next step

Resume later with `arc resume {name}` — the [`resume-work-unit`][resume] workflow, the inverse — which clears the
pause.

## Related workflows

- [`resume-work-unit`][resume] — the inverse; clears this pause.
- [`deactivate-work-unit`][deactivate] — the destructive sibling (`abandon`); a pause is the resumable alternative.
- [`decompose-work-unit`][decompose] — planning-source transform sibling; unlike a pause, it retires the supported
  origin into authored destinations.
- [`integrate-work-unit`][integrate] — the code-shipping lifecycle exit; contrast with this resumable pause.

---

[resume]: resume-work-unit.md
[decompose]: decompose-work-unit.md
[deactivate]: deactivate-work-unit.md
[integrate]: integrate-work-unit.md
