# Strategy: Workflow Authoring

Conventions for authoring ARC workflow files — frontmatter schema, declaration rules, body conventions.

**Scope:**

- Framework workflows (`system/workflows/arc/`) — authored by framework contributors
- Project workflows (`system/workflows/project/`) — authored by adopters

For canonical structure, see [`template-workflow.md`][template-workflow].

---

## Contents

- [Frontmatter Schema](#frontmatter-schema) — fields, namespaces, enforcement
- [Author-side Declaration Rule](#author-side-declaration-rule) — trigger contract
- [Body Conventions](#body-conventions) — structure, links, interlock markers

---

## Frontmatter Schema

Workflow documents declare their metadata — and, when applicable, their method and extension dependencies —
through YAML frontmatter at the top of the file. The frontmatter is the structural trigger contract: declarations
under the `arc:` namespace are mechanically enforced; top-level fields are editorial.

```yaml
---
purpose: <one-sentence description of what this workflow does>
audience: agent                  # agent | collaborative (human and agent) | human
arc:                              # omit if this workflow loads no methods/extensions
  methods:
    - <method-name>
  extensions:
    - <extension-name>
---
```

**Top-level fields** (editorial — readable by humans and machines, not mechanically enforced):

- `purpose` — single-sentence workflow purpose; use a YAML block scalar (`purpose: |`) for multi-line text
- `audience` — one of:
    - `agent` — agent-executed; the developer observes and approves at checkpoints
    - `collaborative (human and agent)` — developer and agent work through the workflow together
    - `human` — reference material for developers; not loaded by agents during session lifecycle

**`arc:` namespace** (protected — mechanically enforced by CI):

- `arc.methods` — array of method names the workflow loads
- `arc.extensions` — array of extension names the workflow checks
- Names match the file basename in `system/methods/` / `system/extensions/`.

---

## Author-side Declaration Rule

When a workflow loads a method or extension, declare it in the workflow's frontmatter `arc.methods` or
`arc.extensions` array. The declaration is the load contract — agents load declared dependencies when they
read the workflow; body-level prose references (in-step markdown links, "see X" pointers) remain for reader
navigation but do not constitute the trigger.

**Enforcement.** Pre-commit hooks validate schema shape and verify declared names resolve to real
methods/extensions — both corpora. The corpus-wide coverage audit (every registered method and extension is
declared by at least one workflow) runs in the framework repo's CI only; project workflows opt into whatever
subset they need and carry no coverage requirement.

---

## Body Conventions

- `# Workflow: [Title]` — required H1
- Body structure is author's choice. Use whatever pattern fits the workflow — numbered `## Steps`, named phases
  (`## Task Implementation`, `## Verification Phase`), or prose sections. Workflows vary; no single structure
  fits all.
- One frontmatter block at the top. Do not duplicate `**Audience:**` or `**Purpose:**` callouts in the body.
- Reference-style links collected at the file end — one `---` separator, then link definitions.

### Interlock markers

Workflows that gate progress at a control point — agent stops to surface state and await direction —
mark the gate with a callout block. The callout makes the stop point scannable in the rendered doc and
gives the agent a recognizable trigger to fire on.

**Types:** Three always-stop (`task-`, `workflow-`, `integration-`) and two configurable (`commit-`,
`push-`, governed by `session.{commit,push}_interlock`). See [DEV-RULES.ARC][dev-rules-arc] § Commit
Discipline for behavioral rules and [AGENT-BRIEF.ARC][agent-brief-arc] § Vocabulary for the interlock
concept.

**Canonical shape:**

```markdown
> [!IMPORTANT]
> `{type}-interlock`: Stop {trigger}. Surface {what}; await direction before {next-action}.
```

**Phrasing structure:**

- **Trigger** — when the stop fires (`after X is committed`, `before creating the PR`).
- **Surface** — what the agent presents at the stop (typically the state of the gated artifact).
- **Next-action** — what proceeds on approval (the destructive cascade or downstream workflow boundary
  the marker gates).

**Placement:** At the START of the gated step or section. The agent reads the marker and stops before
executing the gated work — for step-level gates, immediately under the step heading; for cascade
boundaries (e.g., a destructive sub-step sequence), at the entry point of the cascade.

---

[template-workflow]: ../../templates/template-workflow.md
[dev-rules-arc]: ../../constitution/DEV-RULES.ARC.md
[agent-brief-arc]: ../../../system/briefs/AGENT-BRIEF.ARC.md
