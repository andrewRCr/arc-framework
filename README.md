# ARC Development System

## Agentic Recursive Coordination

**Structured, hands-on framework for coordinated AI-human development.**

**ARC** stands for **Agentic Recursive Coordination**:

- **Agentic**: Designed for AI agent collaboration (alongside human teams)
- **Recursive**: Self-improving system that can be applied at multiple scales and used to develop itself
- **Coordination**: Shared foundation ensuring both humans and AI work from common understanding and processes

The ARC system provides a documentation-only, reusable framework that enables precise, directed collaboration between developers and AI agents. Built around **spec-driven development** principles and as an antithesis to "vibe coding" approaches, it emphasizes structured task breakdown, constant human oversight, and shared understanding between all team members—both human and AI.

## Philosophy: Spec-Driven, Directed Coordination

- **Spec-driven development**: Work flows from clear specifications (PRDs) through structured task hierarchies
- **Hands-on oversight**: AI agents operate under direct developer supervision
- **Task-level autonomy**: AI autonomous action limited to individual sub-tasks within approved lists
- **Explicit authorization**: Multi-task operations require explicit human approval
- **Dual audience**: Documentation serves both human team members and AI agents equally
- **Common foundation**: Shared processes, templates, and understanding across all participants
- **Proven approach**: Successfully validated in real-world projects (CineXplorer)

The entire system lives under `/_docs` so you can copy that folder into a project as-is.

Quick start:

1) Copy `_docs` into your project
2) Instantiate templates from `/_docs/templates` and replace tokens like `{{PROJECT_NAME}}`
3) Optionally apply a profile from `/_docs/profiles`

See `ADOPTION.md` for detailed steps and `SYSTEM-VERSION.md` for versioning.

## Production usage example

- CineXplorer: This system is used in the CineXplorer project. Review that project’s `_docs` for a real-world application of these workflows. If you have a local checkout: `C:\dev\CineXplorer\_docs`. A public repo link can be added here when available.

## Related

- Start with `_docs/README.example.md` in this repo to explore the structure in-place.
- Workflows live in `_docs/workflows` and templates in `_docs/templates`.
- Optional stack overlays are in `_docs/profiles/`.
