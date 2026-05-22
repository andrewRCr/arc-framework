# Draft: Workflow Template Loads (`arc.templates` Frontmatter)

## Context

Workflows declare method and extension dependencies in frontmatter (`arc.methods`,
`arc.extensions`); session-init's load machinery honors those declarations and loads
the content before the workflow body executes. Templates — codified content shapes used
during artifact authoring — don't have an analogous frontmatter category. They're
referenced inline via markdown links, with no load guarantee.

This plan captures the idea of introducing `arc.templates` as a third frontmatter
category alongside methods and extensions, opt-in per workflow.

## Motivating Slip

During release-wrappers-foundation integration prep on 2026-05-09, an initial PR-body
draft slipped past `template-pull-request.md`'s structure and anti-patterns. The agent
followed `integrate-work-unit.md` Step 7's literal instructions ("Use `completion-{name}.md`
as PR description template — copy/adapt sections for the PR body") and missed that
`template-pull-request.md` carries the canonical body shape with anti-patterns the
completion doc doesn't mirror. Body-prose tightening landed in the same WU's pre-merge
review to close the immediate gap; this plan captures the structural alternative.

## Design Sketch

Workflows that author or substantially edit an artifact governed by a template declare
the dependency in frontmatter:

```yaml
arc:
  methods: [diff-review, review-triage]
  extensions: [pre-merge-review]
  templates: [template-pull-request]
```

Session-init's workflow-loading machinery loads declared templates before workflow body
execution — same pattern as methods/extensions.

**Opt-in per workflow.** Not every template reference triggers a load. Three roles surface:

1. **Author-from** — workflow's job is to draft an artifact whose shape is governed by
   the template. Load matters. (`integrate-work-unit` → `template-pull-request`;
   `2_generate-tasks` → `template-tasks`; `1_create-prd` → `template-prd`.)
2. **Edit-conformant-to** — workflow modifies an existing artifact and the template
   carries canonical shape rules. Load matters here too, less often the source of slips.
3. **See-also pointers** — `for examples, see ...` Doesn't need loading.

Only roles 1 and 2 declare. Role 3 stays inline-only.

## Graduation Trigger

Introduce when one of the following holds:

1. **2-3 more independent slip-throughs** surface — pattern justifies the framework-level
   fix.
2. **A new authoring workflow lands** — at point of authoring, the new pattern naturally
   uses the new field rather than another body-prose directive.
3. **A maintenance pass** surfaces 2+ existing workflows where body-prose load directives
   feel awkward in aggregate.

Today (2026-05-09): only one demonstrable slip; body-prose tightening closes it cheaply.
Premature to introduce schema expansion for one site.

## Scope (When Triggered)

- Schema update in `strategy-workflow-authoring.md` — new frontmatter field, opt-in
  semantics.
- Session-init / workflow-loading machinery: parse `arc.templates`, load declared template
  content before workflow body executes (mirror methods/extensions load shape).
- Audit authoring workflows; add declarations where load-bearing.
- Remove body-prose load directives from workflows that gain frontmatter declarations.

Estimate: small WU — cross-cutting but bounded.

## Out of Scope

- Templates that aren't load-bearing (skeleton-only, peripheral references) — stay
  inline-only.
- Restructuring template content — separate concern.
- Cross-template consistency audit — separate concern.

## Forward Pointer

When triggers fire, this plan moves to `1_create-prd.md` for formalization.
