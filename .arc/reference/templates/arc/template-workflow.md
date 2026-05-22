---
purpose: <one-sentence description of what this workflow does>
audience: agent                  # agent | collaborative (human and agent) | human
arc:                              # omit if this workflow loads no methods/extensions
  methods:
    - <method-name>
  extensions:
    - <extension-name>
---

<!--
Template for workflow documents.

Destinations:
- Framework: system/workflows/arc/{category}/{name}.md (framework contributors)
- Project:   system/workflows/project/{name}.md (project-authored)

Reference: strategy-workflow-authoring.md — full schema, author-side declaration rule,
           body conventions.
-->

# Workflow: [Title]

Body. Structure this however fits the workflow — numbered `## Steps`, named phases, or prose
sections as needed. In-step markdown links to methods and extensions remain for reader
navigation; the frontmatter is the load contract.

<!--
Interlock markers — for workflows that gate progress at a stop point. Drop into the step or
section that the gate governs:

    > [!IMPORTANT]
    > `{type}-interlock`: Stop {trigger}. Surface {what}; await direction before {next-action}.

See strategy-workflow-authoring.md § Interlock markers for types and placement.
-->

---

<!-- Collect reference-style link definitions here. -->
