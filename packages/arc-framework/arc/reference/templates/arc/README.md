# ARC Document Templates

Framework-managed, copy-ready document templates used during work — refreshed by `arc update`.
Project-owned templates live in `../project/` (never touched by `arc update`).

## Contents

- `work-unit/` — work-unit artifact templates: `template-meta.md`, `template-draft.md`,
  `template-tasks.md`, `template-cohort.md`, `template-pull-request.md`, and the `spec/` form family
  (`template-spec-brief.md`, `template-spec-outline.md`, `template-spec-detailed-prd.md`,
  `template-spec-detailed-rfc.md` — the form is signalled by the H1, not the filename).
- `template-adr.md` — Architecture Decision Record skeleton.
- `template-workflow.md` — workflow-authoring skeleton.
- `template-dev-rules.md` — domain DEV-RULES scaffold (optional starter).
- `template-contributing.md` — CONTRIBUTING.md starter (optional starter).
- `merge-gate/` — GitHub-flavored auto-merge-lane recipe: a `CODEOWNERS` skeleton plus a `merge-ok` gate
  snippet to merge into your CI workflow (see its README).

## Placeholder convention

Templates mark fill-in points with three distinct syntaxes — see
[strategy-file-classification.md][file-classification] § Template placeholders for the canonical
definition:

- `{slot}` — author-substitution slot (single brace). Short name slots use a `{kebab-token}`;
  longer slots carry the authoring instruction as prose or an enum inside the braces.
- `{{TOKEN}}` — render-engine token (double brace). The CLI substitutes it programmatically at
  `arc init` / `arc user open` time.
- `[lowercase-sentinel]` — literal empty-value marker (`[none]`, `[internal]`). It stays in the
  file to signal "intentionally empty / not applicable."

Markdown links (`[text][ref]`, `[text](url)`) keep their brackets — they are link syntax, not slots.

---

[file-classification]: ../../strategies/arc/strategy-file-classification.md
