# ARC Agentic Development Framework

[![CI](https://github.com/andrewRCr/arc-agentic-dev-framework/actions/workflows/ci.yml/badge.svg)](https://github.com/andrewRCr/arc-agentic-dev-framework/actions/workflows/ci.yml)

Structured playbook for coordinating AI agents and human developers on spec-driven software work.

## Who This Helps

- Teams adopting supervised AI agents to accelerate delivery without losing control.
- Solo builders who want a repeatable workflow for planning, delegating, and validating AI-assisted work.
- Contributors evaluating the documentation toolkit before pulling it into an existing repo.

## What You Get

- Opinionated documentation suite under `_docs/` covering product vision, workflows, and task orchestration.
- Persistent project memory built from dual-audience references—standards, architecture notes, status, and task history—
  so humans and agents operate with the same context.
- Session handoff workflosw centered on `_docs/CURRENT-SESSION.md`, letting you checkpoint decisions, summarize
  progress, and give the next agent (or yourself) a fast sync-up.
- Reference patterns (`_docs/reference/`), decision journals (`_docs/notes/`), and an archive of completed feature docs
  (`_docs/archive/`) that together show how short-term work hardens into long-term knowledge.
- Templates (`templates/`) and profiles (`profiles/`) you can customize to match your stack while staying inside a
  consistent operating model.

## How It Works

1. Align on the product direction via `_docs/META-PRD.md` and the other high-level references.
2. Run `_docs/workflows/1-create-prd.md` to draft a focused sub-PRD for the feature at hand.
3. Capture evolving designs and tradeoffs in `_docs/notes/` while the feature is active.
4. Store the approved sub-PRD in `_docs/sub-prds/` for traceability.
5. Use `_docs/workflows/2-generate-tasks.md` to expand the sub-PRD into actionable tasks and track them in `_docs/tasks/`.
6. Track active execution in `_docs/CURRENT-SESSION.md`, updating the session log, outstanding context, and handoff notes.
7. Follow `_docs/workflows/3-process-tasks.md` to run the work loop, capturing outcomes that feed decisions,
   reference patterns, and future automation.

## Project Memory & Continuity

- `_docs/PROJECT-STATUS.md` keeps long-lived progress, risks, and upcoming milestones visible to the whole team.
- `_docs/tasks/`, `_docs/sub-prds/`, and `_docs/CURRENT-SESSION.md` document what was planned, what’s in flight, and what
  just happened—allowing AI agents to rehydrate context without huge prompts.
- `_docs/notes/` records feature-level decisions and research while they are still fluid; once they stabilize, move the
  distilled guidance into `_docs/reference/` as an enduring pattern or standard.
- `_docs/archive/` preserves completed sub-PRDs, task lists, and session artifacts so you can audit past cycles or
  resurrect features with full provenance.
- Because these artifacts are written for humans and machines alike, they double as onboarding references, QA checkpoints,
  and a living archive of decisions.

## Workflow Playbook

- `_docs/workflows/1-create-prd.md` — Generate focused sub-PRDs from the top-level product direction.
- `_docs/workflows/2-generate-tasks.md` — Turn an approved sub-PRD into a reviewed, agent-ready task list.
- `_docs/workflows/3-process-tasks.md` — Run the execution loop with checkpoints for human oversight and validation.
- `_docs/workflows/session-handoff.md` — Package current context, decisions, and next steps for the next session or agent.
- `_docs/workflows/agent-pr-review.md` — Guide AI-assisted pull request reviews with explicit approval stages.
- `_docs/workflows/atomic-commit.md` — Enforce minimal, well-scoped commits for clearer history and automated checks.
- `_docs/workflows/archive-completed.md` — Capture finished work into `_docs/archive/` so long-term memory stays fresh.

## Adapts As You Grow

The framework is intentionally malleable: customize templates, extend workflows, or introduce new profiles as your
project evolves. Every iteration improves the documentation and the guardrails that guide the next round of
development—an explicit nod to the “recursive” pillar baked into the name.

## Getting Started

1. Copy the `_docs/` folder into your target repository.
2. Bring along `templates/` if you plan to instantiate the ready-made document templates.
3. Optionally copy `profiles/` to apply a curated overlay that matches your stack.
4. Read `ADOPTION.md` for a deeper rollout playbook and `SYSTEM-VERSION.md` to track updates.

## Repository Map

- `_docs/META-PRD.md` — product vision and success criteria.
- `_docs/PROJECT-STATUS.md` — progress tracker for current initiatives.
- `_docs/TECHNICAL-ARCHITECTURE.md` — reference architecture and implementation patterns.
- `_docs/CURRENT-SESSION.md` — active session log and handoff instructions.
- `_docs/sub-prds/` — approved feature specifications.
- `_docs/tasks/` — task checklists derived from sub-PRDs.
- `_docs/notes/` — temporal decision logs and research notes.
- `_docs/reference/` — established standards, patterns, and reusable guidance.
- `_docs/archive/` — completed feature docs and session history.
- `_docs/workflows/` — step-by-step operating procedures for planning and execution.

### Optional Directories

- `templates/` — reusable specs, checklists, and communication artifacts.
- `profiles/` — optional overlays for specific stacks or org needs.

## ARC Pillars (Why the Name)

- **Agentic** — optimized for collaborating with AI agents alongside human teammates.
- **Recursive** — workflows designed to feed back into themselves, enabling continuous refinement of both process and documentation.
- **Coordination** — shared language, documents, and checkpoints so everyone operates from the same playbook.

## Production Usage

- CineXplorer currently runs on this framework; its `_docs/` directory demonstrates the system in a live codebase.
  A public reference will be linked once available.

## Related Assets

- `_docs/README.example.md` for an in-repo tour.
- `templates/` to spin up new artifacts quickly.
- `profiles/` to tailor the framework to your stack.
