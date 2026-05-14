---
purpose: Classify externally-sourced content and wire it into the ARC system.
audience: collaborative (human and agent)
---

# Workflow: Integrate External Content

**When to use**: When you have external content to integrate — a file already dropped into the repo, an
external file to import, or even just a link or concept to evaluate. Common sources: community-shared ARC
content, [Agent Skills](https://agentskills.io) you want wired into ARC, workflows or strategies adapted
from other projects.

---

## Step 1: Identify the Content

Determine what you're working with:

- **File in repo** — content already placed in the project (e.g., dropped into `strategies/project/`)
- **External file** — a file to import (shared by someone, downloaded, etc.)
- **Link or concept** — a description, documentation page, or idea to evaluate

For external files, read the content first. For links or concepts, gather enough context to classify.

## Step 2: Classify the Content

Determine what kind of ARC integration this content needs. Ask these questions in order — the first
match wins:

**Does it replace an existing ARC default behavior?**

Examples: a custom commit format, a different session state mechanism, a team-specific review process
that replaces the default pre-merge review, a Skill that provides a better task completion workflow.

→ **Method override.** Proceed to [Step 3a](#step-3a-wire-as-method-override).

**Does it add behavior at an existing ARC hook point?**

Examples: additional quality checks after each task, a code review tool integration that runs during
pre-merge review, post-activation setup steps, a Skill that adds checks at a workflow extension point.

→ **Arc extension.** Proceed to [Step 3b](#step-3b-wire-as-arc-extension).

**Is it standalone domain guidance that agents should consult?**

Examples: a testing methodology from another project, a community-shared authentication strategy,
API design patterns, a Skill that provides domain-specific guidance agents should load before
implementing in that domain.

→ **Strategy.** Proceed to [Step 3c](#step-3c-add-as-strategy).

**Is it a standalone procedure agents should follow on demand?**

Examples: a deployment workflow, a community-shared database migration procedure, a Skill that
defines a multi-step operational process.

→ **Workflow.** Proceed to [Step 3d](#step-3d-add-as-workflow).

**None of the above?**

The content may not need ARC integration. It can live as a standalone reference document, a Skill
without ARC wiring, or project documentation outside `.arc/`. Not everything needs to be wired into
the system.

## Step 3a: Wire as Method Override

1. Identify which method in [`system/methods/`][arc-methods] this content replaces
   (e.g., `commit-format`, `diff-review`, `session-state`)
2. Read the method's **contract** — your override should satisfy the same invariant
3. Adapt the content to fit the override format:
    - Populate the `## {method-name}.override` section with the new implementation
    - Toggle `override-active: true` in the method's frontmatter
    - The agent will follow the override instead of the `.default` section
4. Check related methods in [`system/methods/`][arc-methods] — if the method has dependencies,
   review those for consistency
5. If the source content is a Skill or external file, keep the original as a reference alongside
   the override (e.g., in a project docs directory) or note its provenance in a comment

## Step 3b: Wire as ARC Extension

1. Identify which extension point in [`system/extensions/`][arc-extensions] this content augments
   (e.g., `post-task-quality`, `pre-merge-review`, `post-context-load`)
2. Read the extension's **contract** — your actions must satisfy the stated constraints
3. Adapt the content to fit the extension format:
    - Replace `[No extension configured]` in the `## {extension-name}.actions` section
    - Toggle `active: true` in the extension's frontmatter
    - Write clear actions the agent can follow
4. Extensions *add to* existing workflow behavior — they don't replace it. If the content needs
   to replace behavior, it's a method override (Step 3a), not an extension

## Step 3c: Add as Strategy

1. Place the file in `strategies/project/` (or a subdirectory like `strategies/project/style/`)
2. Follow the `strategy-` prefix convention: `strategy-{domain}.md`
3. Add an entry to [STRATEGY-INDEX.md][strategy-index] under **Project Strategies** with a
   one-line description and "Consult when:" trigger
4. If the content came from an external source, adapt it to your project's context — generic
   community guidance may need project-specific examples or adjusted recommendations

## Step 3d: Add as Workflow

1. Place the file in an appropriate project workflow location
2. Use a descriptive verb-noun filename (e.g., `deploy-staging.md`, `migrate-database.md`)
3. Add cross-references from relevant documents so agents can discover it:
    - If it relates to a specific phase of work, reference it from the relevant workflow
    - If it's general-purpose, consider adding it to QUICK-REFERENCE or a project README
4. Follow the standard workflow format: Audience, Purpose, When to use, then Steps

## Step 4: Verify Integration

1. Run Tier 1 quality gate on all modified files
2. Verify the integration works:
    - For method overrides: confirm the agent follows the override during the relevant workflow
    - For extensions: confirm the extension fires at the right hook point
    - For strategies: confirm the agent finds and consults it via STRATEGY-INDEX
    - For workflows: confirm the agent can reach it via cross-references

> [!IMPORTANT]
> `workflow-interlock`: Stop after verification. Surface modified files, quality results, and behavior
> changes; await direction before committing.

3. Commit the changes (`workflowCommit`)

---

[arc-methods]: ../../../methods/README.md
[arc-extensions]: ../../../extensions/README.md
[strategy-index]: ../../../../reference/strategies/STRATEGY-INDEX.md
