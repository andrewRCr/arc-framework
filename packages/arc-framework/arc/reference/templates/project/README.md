# Project-Specific Templates

Project-owned document templates — not touched by `arc update`.

## Purpose

This directory holds templates specific to your project: artifact skeletons, document scaffolds, or
boilerplate your team authors and maintains. Unlike `../arc/` templates (framework-managed and refreshed
by `arc update`), templates here are yours to create, edit, and version however your project needs.

## Examples of Project Templates

- `template-feature-spec.md` - A feature-specification skeleton for your team's format
- `template-incident-report.md` - Postmortem / incident write-up structure
- `template-rfc.md` - Internal RFC or design-proposal format

## When to Add a Project Template

Add a template when:

- A document type recurs and benefits from a consistent structure
- Contributors need a starting point to fill in rather than a blank page
- A format decision should be applied consistently across documents

## Conventions

- Name templates `template-{name}.md`, matching the framework set
- Use `{{TOKEN}}` placeholders for fields an author or generator fills in
- Keep one template per document type
