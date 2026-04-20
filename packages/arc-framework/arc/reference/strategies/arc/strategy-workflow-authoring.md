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
- [Body Conventions](#body-conventions) — structure, links

---

## Frontmatter Schema

Workflow documents declare their metadata — and, when applicable, their method and extension dependencies —
through YAML frontmatter at the top of the file. The frontmatter is the structural trigger contract: declarations
under the `arc:` namespace are mechanically enforced; top-level fields are editorial.

```yaml
---
purpose: <one-sentence description of what this workflow does>
audience: agent                  # agent | dual
arc:                              # omit if this workflow loads no methods/extensions
  methods:
    - <method-name>
  extensions:
    - <extension-name>
---
```

**Top-level fields** (editorial — readable by humans and machines, not mechanically enforced):

- `purpose` — single-sentence workflow purpose; use a YAML block scalar (`purpose: |`) for multi-line text
- `audience` — `agent` (agent-executed) or `dual` (workflow also has substantial human-facing content)

**`arc:` namespace** (protected — mechanically enforced by CI):

- `arc.methods` — array of method names the workflow loads
- `arc.extensions` — array of extension names the workflow checks
- Names match the method or extension `## section-name` heading in `arc-methods.md` / `arc-extensions.md`. When
  methods and extensions migrate to per-file directories, names continue to match the file basename.

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

---

[template-workflow]: ../../templates/template-workflow.md
