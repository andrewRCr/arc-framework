# ARC Framework

_Disciplined collaboration over automation._

ARC is a methodology for human-AI co-development, implemented as structured
markdown documents and a CLI with no runtime dependencies beyond Git. It works with any
AI coding agent and any tech stack.

Much of the current industry momentum trends toward greater agent autonomy and delegation,
with less human involvement per unit of output. ARC makes a different bet: that deliberately
coupling human judgment with agent capability produces better outcomes, and that the
developer's sustained attention is a feature, not a bottleneck. The cognitive science and
emerging AI research support this, and ARC is a system built around that premise: structured
workflows, shared context, and bounded execution designed to keep human judgment continuously
in the loop.

## Overview

The documents that make up ARC aren't static context files. They're mechanical: workflows
branch on configuration values, methods define overridable contracts at trigger points,
extension points inject custom behavior at workflow boundaries, and git hooks enforce
conventions deterministically at commit time. A CLI manages the full lifecycle:
initialization, onboarding, framework updates via three-way merge, and session state
portability through git notes. Guidance is embedded where it's needed, and conventions
are enforced where they matter.

- **Shared context with tiered delivery.** Constitutional documents (project goals,
  architecture, development rules, strategies) give human and agent the same
  understanding. Not everything loads at once: foundational context loads at session
  start, procedural workflows load on-demand when triggered, and reference material
  loads strategically as work touches specific domains.
- **Session lifecycle.** Structured initialization and handoff workflows preserve working
  state, decisions, and next actions across context boundaries. Designed around research
  showing LLM performance degrades significantly as context accumulates; focused sessions
  produce better work than marathon ones.
- **Single-threaded task execution with co-development.** Each task is a bounded review
  increment, small enough to review meaningfully, large enough for productive execution.
  The human is in the work during execution: watching, steering, course-correcting, and
  writing code alongside the agent rather than reviewing a finished batch after the fact.
  Code review research shows defect detection drops from 70–90% to ~30% as review size
  grows. ARC's granularity is a direct response.
- **A planning pipeline.** PRDs, task generation, and structured execution workflows are
  part of the core methodology. An optional project management layer adds backlogs,
  roadmap, and status tracking in-repo alongside your code, or you can integrate with
  external trackers instead.
- **Configurability architecture.** ARC's principles define its identity and aren't
  negotiable, but most of how those principles are implemented is. Commit format, quality
  gate commands, triage thresholds, review methods, session state mechanics are all
  configurable conventions with strong defaults your team replaces when they don't fit.
  Override a method, populate an extension point, adjust a config value. The framework
  adapts without losing coherence.

The result is a single system that unifies planning, execution, and knowledge preservation,
stack-agnostic, agent-agnostic, and designed to adapt and evolve alongside your project.

## Design Tradeoffs

ARC optimizes for quality and maintainability over raw throughput. It's slower than fully
autonomous approaches, requires active developer engagement, and adds structure that pays
off proportional to project complexity, not over a weekend prototype. These are deliberate
design choices, not limitations.
[More on the philosophy and evidence&nbsp;→](https://arc-framework.github.io/arc-framework/philosophy/)

## Getting Started

```bash
npx @arc-framework/cli init
```

See the [Getting Started guide](https://arc-framework.github.io/arc-framework/getting-started/)
for a first session walkthrough.

## Documentation

[ARC Framework Documentation](https://arc-framework.github.io/arc-framework/) — philosophy,
getting started, sessions, work planning, configuration.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

Apache License 2.0 — see [LICENSE](LICENSE).
