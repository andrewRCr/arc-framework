# Agent Bootstrap

In this self-hosting repository, invoke ARC CLI commands as `npx arc ...`, not `arc ...`.

**Scope:** development-time invocation only. The rule applies to commands you run in
this repo (sessions, scripts, manual probes — including session lifecycle calls such
as `arc status --session-init --json`). It does **not** apply to content under
`packages/arc-framework/arc/**` or `.arc/**` (workflows, strategies, briefs,
templates) — that content ships to adopters who install the CLI globally and invoke
it as bare `arc ...`.

## Review guidelines

> _These guidelines govern **requested hosted code reviews** via the review gate (for example, a hosted Codex
> PR review requested with `@codex review`). They are **not** standing instructions for development sessions —
> do not apply this during ordinary work; apply only when performing an explicitly requested, hosted PR review._

<!-- arc:review-guidance:start -->
Rubric: `standard-review/v1` / `sha256:cea850203b3e821cc9f81563b30d01c91a2cc85832fd2edff8b4a1da7dae6295`

### Coverage and evaluator boundary

- Review the complete exact requested change set, not a sample or only the latest fix.
- Bind the review to the exact requested target.
- Use a non-author evaluator working from source and governing project context.
- Do not provide author conclusions, preferred fixes, self-verification claims, or suspected weak spots.

### Rubric dimensions

- Coherence and maintainability — Check whether the change remains understandable, cohesive, and maintainable.
- Correctness and failure behavior — Check normal behavior, boundary cases, and explicit failure handling.
- Intent and scope — Check that the complete change serves its stated intent without unrelated scope.
- Trust boundaries and compatibility — Check authority boundaries, unsafe inputs, and compatibility obligations.
- Verification quality and missing cases — Check that verification proves the behavior and covers material missing cases.
- Repository contract coherence — Check repository-specific instructions, package boundaries, and self-hosting contracts.

### Finding requirements

- Actionable materiality — State the material impact and an actionable correction boundary.
- Rubric failure explanation — Explain which rubric dimension fails and why.
- Source-grounded evidence — Ground the finding in the reviewed source rather than speculation.
- Stable locus — Name a stable code or document locus for the finding.

### Clean-result rule

- Return clean only after the complete requested change set and every rubric dimension were considered.
- Unavailable, partial, ambiguous, or failed review is never clean.
<!-- arc:review-guidance:end -->
