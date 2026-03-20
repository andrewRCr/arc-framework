# Notes: WU4 Repo Structure and Separation Strategy

**Date:** 2026-03-20
**Context:** Discovered during CodeRabbit Pass 1 review of WU3 (CLI implementation). 40+ review
findings exposed the `.arc/` ↔ `.arc-internal/` cross-reference problem at scale — wrong location
comments, template filename mismatches, duplicate scripts with subtle differences, hook path variants.
This note captures the revised thinking on repo structure that supersedes parts of
`plan-wu4-public-release.md` § Deliverable 1 (Repository Structure).

**Status:** Needs integration into WU4 plan before PRD creation.

---

## Problem Statement

The current dev repo has `.arc/` serving two roles simultaneously:

1. **Template source** — canonical files the CLI packages and distributes to adopters (with
   `{{TOKEN}}` placeholders, `.template.md` suffixes, conditional blocks)
2. **Implicit reference installation** — the "real" ARC files that `.arc-internal/` leans on for
   shared workflows, strategies, and scripts

`.arc-internal/` is a partial, lightweight ARC installation that cross-references `.arc/` for anything
it doesn't override. This creates persistent drift: hooks with path variants, scripts with wrong
location comments, workflows referencing template filenames, and constant review noise on the
boundary between the two directories.

## Revised Approach: True Self-Hosting

### Three distinct concerns, three distinct locations

**1. Templates (CLI source of truth for distribution)**

Location: `packages/arc-framework/templates/` (inside the CLI package source)

These are the canonical `.template.md` files with placeholders, conditional blocks, and template
suffixes. The CLI packages from here during `npm run build`. This is what adopters receive when
they run `arc init`.

Currently these live in `.arc/` at the repo root, which conflates "template source" with
"installed directory." Moving them into the CLI package makes the relationship explicit: templates
are a build input, not an installation.

**2. Real ARC installation (framework development workspace)**

Location: `.arc/` (repo root — a real `arc init` output)

The dev repo runs a genuine ARC installation — the output of `arc init` run against the templates.
Contains filled-in values (no placeholders), real project content in DEV-RULES.PROJECT,
QUICK-REFERENCE, etc. Framework development follows ARC methodology using these real files.

`.arc-internal/` is deleted entirely. Everything it contained either:

- Was a near-duplicate of `.arc/` with minor differences → use the real installation
- Was framework-dev-specific content (active work, backlog, session notes) → moves into the real
  `.arc/` installation, which is the correct location for project-specific content

This is true self-hosting: using `arc init` and `arc update` on your own repo. Template bugs
surface immediately because you're the first consumer. The hook differences (dual-path search,
different CHECK numbers) dissolve because only one `.arc/` directory exists.

**3. Public repo (clean source distribution for contributors)**

Location: `arc-framework` GitHub repo (public, read-only mirror)

Contains only what contributors need:

```
packages/arc-framework/
  src/                    ← CLI source
  templates/              ← canonical ARC templates (browsable, source of truth)
    reference/
    system/
    active/
  __tests__/
README.md                 ← value prop + link to docs site
.github/                  ← CI, issue templates, contributing guide
LICENSE
```

No `.arc/` directory. The public repo is not an ARC installation — it's a source distribution.
Templates are browsable enough for contributors (most strategy docs and constitutional files have
zero placeholders; only project-specific files like `AGENT-BRIEFING.PROJECT.template.md` have
`{{TOKEN}}`).

### Browsability for adopters: docs site, not repo

The existing WU4 plan correctly identifies the docs site (MkDocs Material + GitHub Pages) as the
external documentation layer. The revised approach makes this the **primary** browsing experience
for adopters evaluating ARC:

- Rendered examples showing what `.arc/` looks like post-init for different project types (Django,
  React, CLI tool, data pipeline)
- Philosophy pages, walkthroughs, "how it works"
- A "what you get" reference page showing `arc init --yes` output — possibly auto-generated as
  part of the release process
- Comparison and positioning content

The public repo serves **contributors**. The docs site serves **browsers/evaluators**. Trying to
make the repo serve both (by including a reference installation) creates confusion — adopters
would see project-specific files filled in for "ARC Framework" and think that's what their
installation should look like, or would encounter internal development artifacts.

### Sync mechanism

Same as the existing WU4 plan: release tag on dev repo → GitHub Action extracts publishable
content → pushes to public repo → publishes to npm.

The extraction filter:

- **Include:** `packages/arc-framework/`, README, LICENSE, community files, `.github/`
- **Exclude:** `.arc/` (dev installation), root workspace config, any development-only artifacts

### What happens to adopter PRs

PRs filed against the public repo target templates (`packages/arc-framework/templates/`) or CLI
source (`packages/arc-framework/src/`). Accepted changes are applied to the dev repo and sync
outward on the next release. This is the same unidirectional flow described in the existing plan.

## What This Supersedes in plan-wu4-public-release.md

**§ Deliverable 1 (Repository Structure):**

- The "publish mirror" concept and sync mechanism remain valid
- The public repo content changes: no `.arc/` reference installation, templates live inside the
  CLI package rather than at repo root
- The dev repo structure changes: `.arc-internal/` → deleted, `.arc/` → real installation,
  templates → `packages/arc-framework/templates/`

**§ Deliverable 2 (External Documentation Site):**

- Elevated importance: the docs site becomes the primary browsing/evaluation experience, not a
  supplement to repo browsing
- "Fully-formed examples" (already planned) become essential rather than nice-to-have — they
  replace the "browse the repo to understand ARC" path

**§ Deliverable 3 (README Rewrite):**

- README points to docs site for the "understand ARC" experience rather than expecting adopters
  to browse `.arc/` in the repo
- Quick start remains: `npx @arc-framework/cli init`

**§ Parallelism Opportunities:**

- Template relocation (`.arc/` → `packages/arc-framework/templates/`) can happen early, possibly
  as the first WU4 task, since it's a structural prerequisite for everything else
- The `.arc-internal/` → `.arc/` migration (running `arc init` on the dev repo) depends on the
  CLI being functional, which it is after WU3

## Migration Sequence (Rough)

1. Move `.arc/` template files → `packages/arc-framework/templates/`
2. Update CLI build script to copy from `templates/` instead of `../../.arc/`
3. Run `arc init` on the dev repo (creates a real `.arc/` from templates)
4. Migrate `.arc-internal/` active work, backlog, and session state into `.arc/`
5. Delete `.arc-internal/`
6. Update git hooks path, CI config, session-init workflow references
7. Verify the dev repo works end-to-end with the new structure
8. Set up public repo + sync automation
9. Docs site content (rendered examples, walkthroughs, philosophy)
10. README rewrite, community infrastructure
11. Release automation (tag → build → npm publish → sync → GitHub Release)

## Open Questions

- **Template browsability:** Are templates with `{{TOKEN}}` placeholders and `.template.md`
  suffixes acceptable for the public repo's contributor audience? Or should the release sync
  process render a "reference" copy alongside the templates? (Leaning toward: templates are fine
  for contributors; the docs site handles the rendered experience.)
- **Dev repo rename timing:** `arc-agentic-dev-framework` → `arc-framework-dev` — do this before
  or after the migration? Before is cleaner (fewer redirects to update) but either works.
- **Backlog/active work in `.arc/`:** After migration, the dev repo's `.arc/active/` and
  `.arc/backlog/` contain internal planning. The sync filter excludes these from the public repo.
  But should these directories be gitignored in the dev repo too? Probably not — they're tracked
  project state. The sync filter is sufficient.
