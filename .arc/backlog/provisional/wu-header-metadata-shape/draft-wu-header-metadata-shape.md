# Draft: Metadata-Shape Conventions for WU Artifact Headers (frontmatter vs. bullet-bold-field)

- **Origin:** [internal] — routed from `BACKLOG-INBOX` at the work-routing-discipline retirement pass
  (2026-06-01); originally surfaced during a meta-file field audit + cross-file header-convention codification.
  Joins the `doc-conventions` cohort on promotion to `planned/` (kept standalone while provisional — cohorts are
  state-uniform); sibling in the artifact-convention family to naming-conventions / task-list-conventions.
  Distinct from `meta-file-tracking-model` (which is about *whether* meta files are tracked, not their header
  shape).
- **Purpose:** Deliberately survey WU artifact-header shape against industry idiom before any change — a
  research question with a constitutional-impact answer, not a ready plan.

---

## Observation

WU artifact headers (`meta-*`, `tasks-*`, `plan-*`, `prd-*`) use a bullet-bold-field convention
(`- **Origin:** [internal]` etc.), while system files (workflows, methods, extensions) use YAML frontmatter. The
mixed convention works but hasn't been deliberately surveyed against industry idiom.

## Question to research

For WU artifact headers, what's the best shape? Three axes:

- **Idiomaticness** — what mature docs-as-code / agentic-coding tooling converges on; static-site generators
  lean YAML frontmatter, RFCs/KEPs use mixed patterns.
- **Raw-markdown aesthetics** — bullet-bold-field renders cleanly everywhere; YAML frontmatter appears as a
  fenced metadata block.
- **Parseability** — YAML is parser-friendly + typed; bullet-bold-field needs regex + an implicit schema;
  greppability is comparable.

## Possible shapes

Status quo (bullet-bold-field for WU artifacts, YAML for system files); YAML frontmatter everywhere; hybrid
(YAML structured metadata + bullet-bold-field bodies); or something research surfaces.

## Why deferred / trigger

The current convention is locked forward; revisiting requires another cross-template + workflow sweep (every
metadata consumer). Worth doing only with deliberate research + a clear improvement target.

- **Trigger:** parsing friction during downstream tooling (renderer, programmatic field reads); a decisive
  industry shift toward YAML frontmatter for comparable work-tracking artifacts; or substantively new artifact
  classes warranting fresh metadata-shape thinking.

## Scope Estimate

Medium WU. Touches every WU artifact template, every workflow reading metadata fields (session-init most
critically), CLI parsing in `packages/arc-framework/src/lib/`, and a migration sweep for in-flight artifacts.
Constitutional impact if the shape changes — companion ADR likely.
