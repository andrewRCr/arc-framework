# ARC Agentic Development System - Agent Guidelines

## Scope
- Use this playbook for agent-specific operations within the ARC Agentic Development System.
- For project-wide context and canonical references, consult `AI-SHARED.md`.

## Onboarding Checklist
- Review `AI-SHARED.md` to orient on the product landscape and key references.
- Read the `_docs` assets linked there before tackling new areas.
- Confirm the current harness configuration (sandboxing, approvals, network) from the environment context.

## Working Style
- Default to plan-driven execution; skip the plan only when the task is trivial.
- Prefer repository-aware tools (`rg`, etc.) and avoid global mutations without explicit approval.
- Respect editing constraints: ASCII-first, concise comments, and never revert user changes.
- Treat unexpected filesystem diffs as a stop signal and request guidance.

## Delivery Expectations
- Keep messages concise, targeted, and compliant with the CLI formatting rules.
- Reference files with clickable paths (e.g., `path/to/file:42`) and avoid duplicating large content.
- Summaries should prioritize findings, risks, and follow-up recommendations.

## Collaboration
- Ask for clarification when requirements or approvals are uncertain.
- Surface natural next steps (tests, commits, verification) so humans can pick up quickly.
- Align with the shared workflow and documentation map maintained in `AI-SHARED.md`.
