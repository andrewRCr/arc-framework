# Agent Bootstrap

In this self-hosting repository, invoke ARC CLI commands as `npx arc ...`, not `arc ...`.

**Scope:** development-time invocation only. The rule applies to commands you run in
this repo (sessions, scripts, manual probes — including session lifecycle calls such
as `arc status --session-init --json`). It does **not** apply to content under
`packages/arc-framework/arc/**` or `.arc/**` (workflows, strategies, briefs,
templates) — that content ships to adopters who install the CLI globally and invoke
it as bare `arc ...`.

## Review guidelines

Apply rubric `independent-analysis/v1` to the complete requested commit. Review the change independently across:

- intent and scope;
- correctness and failure behavior;
- trust boundaries and compatibility;
- verification quality and missing cases;
- coherence and maintainability.

Report every actionable finding at a stable code locus. Return a clean result only after all five dimensions have
been considered for the full diff.
