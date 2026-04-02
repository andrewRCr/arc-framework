# Philosophy

Every developer who's worked with an AI coding agent has experienced the gap between what's possible
and what's reliable. Agents can generate impressive code, but the output quality varies — sometimes
subtly, sometimes dramatically — based on how the work is structured. Left to run autonomously, they
produce work that requires extensive review. Micromanaged with constant prompting, they lose the
speed advantage that made them attractive.

ARC is built on a specific premise: that focused, iterative collaboration between a human and an
agent (what we call *co-development*) produces better work than either full delegation or ad-hoc
prompting, for the kinds of work where quality, judgment, and maintainability matter.

This premise has real costs. ARC is slower than fully autonomous approaches, requires active
developer engagement, and adds structure that pays off proportional to project complexity. These are
deliberate design choices. This page covers the reasoning behind them.

In practice: you and your agent work through tasks one at a time, each small enough to review
meaningfully. You're present during execution — steering, correcting, contributing alongside the
agent. Sessions are bounded and intentional, with structured handoffs that preserve context for the
next session. Quality gates verify work at every level. The reasoning for each of these choices
follows — if you'd rather start with the practical mechanics, see
[How ARC Works](how-arc-works.md).

## Three Observations

ARC's design responds to three observations. None are novel — they're well-established in cognitive
science, software practice, and the emerging experience of AI-assisted development. ARC's
contribution is taking them seriously as design constraints rather than treating them as problems to
work around.

### Human attention is single-threaded

Human attention for novel knowledge work is single-threaded. This is one of the most replicated
findings in cognitive psychology, supported by over 70 years of research from Broadbent's filter
model (1958) through Pashler's dual-task interference work (1994) to contemporary studies.

The numbers are concrete: task-switching costs up to 40% of productive time
([Rubinstein, Meyer & Evans, 2001][task-switching]). Recovery from interruptions averages 23
minutes for knowledge workers ([Mark, Gudith & Klocke, 2008][interruption-general]) and 10–15
minutes for software engineering specifically
([Lestan, Leventis & Ivanovic, 2024][interruption-recovery]).

ARC's sequential execution model, bounded sessions, and single-task focus are environmental
structure that works with the attention constraint rather than against it — the same way air traffic
control uses radar, separation standards, and checklists to manage inherent attention limits through
intelligent task ordering.

### Software is for humans

Software is overwhelmingly produced for human consumption. Deep human involvement during development
is quality input, not just quality control. Developers bring perspective, taste, and judgment about
what feels right that an agent modeling human needs cannot replicate.

Fully delegated development optimizes for an abstraction of human needs. Co-development keeps a
human with lived experience of the problem domain actively shaping the implementation. The practical
effect: developers who participate in building the implementation maintain familiarity with how it
works. When maintenance needs arise, they have context because they were there, not because they
reviewed a PR.

### Collaboration improves with frequency

Human and agent bring fundamentally different capabilities. Humans: perspective, institutional
context, judgment, lived experience. Agents: breadth of knowledge, speed, tooling, pattern
recognition. Neither is sufficient alone. The output is more robust than either achieves
independently.

That robustness scales with interaction frequency. Each exchange is an opportunity for both parties
to contribute what they're best at. Lengthen the interval between interactions and you underutilize
both: the agent gets fewer course corrections, the human gets fewer chances to leverage the agent's
capabilities.

The industry's emerging experience with "agent produces PR, human reviews" workflows bears this out.
The review surface area is too large, issues compound, and rework costs often exceed the time saved
by delegation. Code review research shows defect detection drops from 70–90% to roughly 30% as
review size grows. ARC's task-level granularity is a direct response.

There's a second, more practical dimension: developer attention. Short execution cycles keep the
developer close enough to the work to review *in flight*. ARC's task generation sizes work to a few
files and a few minutes of agent execution, so you're watching implementation unfold, catching issues
as they emerge, contributing context while it's fresh. Lengthen the cycle and that proximity breaks
down. You context-switch to something else, come back to a batch of completed work, and review
becomes reconstruction rather than participation. The mandatory stop between tasks isn't overhead;
it's the mechanism that keeps review from degrading into rubber-stamping.

## The Operating Premise

The industry's default framing treats human single-threaded attention as a bottleneck, something to
minimize, parallelize around, or eliminate. ARC's position: human attention being single-threaded is
a design constraint worth respecting. It forces focus, ensures quality input at every step, and
produces work that reflects genuine judgment.

## Principles

ARC has 11 non-negotiable principles that define its identity. An adoption that doesn't honor all of
them is not meaningfully using ARC. Under each principle, configurable conventions implement it in
practice — conventions are strong defaults your team can change without changing what ARC is.

### Core commitments

**P1. Spec-driven development.** Development begins from written specifications that establish
intent, scope, and success criteria before implementation. Planning leads execution, not the reverse.
The specific document hierarchy (PRDs, task lists) and templates are conventions.

**P2. Human-agent co-development.** Humans and agents collaborate through tight, iterative feedback
loops. Review happens during work, not after it. The human directs; the agent executes within bounded
scope, reports back, and the cycle repeats. This is ARC's most distinctive characteristic: the human
is a co-developer, not merely a reviewer.

**P3. Focused, sequential execution.** Focused work produces better results for most application
domains. One primary line of work at a time, with the sustained focus that makes co-development
effective. Team-level parallelism (different branches) and supplementary agents (bounded research,
exploration) are compatible; developer attention stays single-threaded.

### Operational discipline

**P4. Quality gate enforcement.** Automated quality verification is required before work is
considered complete. Quality gates are the feedback mechanism that makes directed collaboration
reliable. The specific gates, tools, and strictness levels are conventions.

**P5. Context preservation.** Work context must be recoverable across session boundaries through
structured, human-controlled, and transparent mechanisms. Without this, each session starts from
scratch and the collaboration loop breaks.

**P6. Traceability through version control.** Changes link back to the intent that motivated them.
Git serves as the canonical record. Commit format, context footers, and branch naming are
conventions; traceability itself is not.

**P7. Granular task tracking.** Work is decomposed into explicit, trackable increments before
execution. Progress is visible and verifiable. The tracking mechanism (markdown checkboxes,
external trackers) is convention; the decomposition requirement is not.

### Design commitments

**P8. Agent-agnostic design.** ARC's methodology is defined independently of any specific AI tool.
Core workflows use agent-neutral terms, with agent-specific guidance isolated to dedicated files.

**P9. Dual-audience documentation.** All project artifacts are structured for both human
comprehension and AI agent consumption. Documentation that only works for one audience misses the
purpose of a human-AI collaboration framework.

**P10. Recursive improvement.** The framework and the projects that use it improve through documented
feedback loops. Patterns are codified from experience; decisions are captured; future work builds on
prior context rather than starting fresh.

**P11. Shared-context co-development.** Developer and agent operate in shared context with mutual
visibility. If the agent works in an opaque sandbox and the developer only sees output,
collaboration is replaced by review.

## Principles vs. Conventions

ARC uses a three-tier flexibility model:

1. **Principle (tier 1)** — Non-negotiable. Defines ARC's identity. Removing it means you're not
   using ARC.
2. **Convention (tier 2)** — Configurable with a sensible default. Changing it keeps ARC intact.
3. **Escape hatch (tier 3)** — Something ARC doesn't formally support but doesn't block.

The test: "If an adopter changed or removed this, would they still be meaningfully using ARC?"
Yes → convention. No → principle.

Examples: conventional commit format is a convention (any communicative format maintains
traceability). Quality gate enforcement is a principle (removing verification entirely is outside
ARC). Squash merging is an escape hatch (ARC accommodates it but sacrifices granular commit
history).

The [configuration mechanisms](reference/configuration.md) — config values, method overrides, and
extension points — operate on conventions, never principles.

## Why Bounded Sessions

ARC treats sessions as bounded, intentional periods of work, not open-ended conversations that run
until interrupted. This isn't an arbitrary constraint. Three forces converge on the same design.

### Agent context quality degrades with length

LLM output quality drops as context accumulates within a session. The key findings:

- **Effective capacity is well below advertised limits.** Multiple studies converge on 60–70% of the
  advertised context window as the performance-reliable range
  ([Hsieh et al., COLM 2024][ruler]).
- **Complex tasks degrade faster than simple retrieval.** Needle-in-a-haystack retrieval holds up at
  long contexts, but multi-hop reasoning, code generation, and agentic workflows — the work that
  dominates development sessions — degrade sharply. Agentic success rates drop from 40–50% to under
  10% in long-context scenarios ([Wang et al., 2025][web-agents]).
- **Position effects matter.** Information in the middle of long contexts suffers significant
  performance loss — the "lost in the middle" phenomenon
  ([Liu et al., TACL 2024][lost-middle]). As sessions accumulate history, earlier decisions drift
  toward weaker retrieval positions.

This isn't a temporary limitation. The evidence spans multiple model families, architectures, and
context window sizes. Larger windows shift where degradation begins; they don't eliminate it
([Agarwal et al., EMNLP 2025][ctx-length-hurts]).

### Human attention follows the same pattern

ARC's [co-development model](#core-commitments) requires sustained human attention — you're a
co-developer, not a passive observer. Task-switching costs up to 40% of productive time
([Rubinstein, Meyer & Evans, 2001][task-switching]), and interruption recovery takes 10–15 minutes
for software engineering work ([Lestan, Leventis & Ivanovic, 2024][interruption-recovery]). Marathon
sessions degrade human judgment the same way they degrade agent context, just through a different
mechanism.

### Session boundaries enforce methodology discipline

The establish-execute-capture rhythm is what makes context recoverable. Each session starts with
deliberate context loading and ends with intentional state preservation. Without explicit boundaries,
knowledge accumulates implicitly and is lost when the conversation ends.

For practical session duration guidance, see
[How ARC Works § When to End a Session](how-arc-works.md#when-to-end-a-session).

## Where ARC Fits

ARC governs the execution pair — how a developer and agent work through implementation together. It
operates below and alongside team coordination methodologies.

| Level              | Governs                                  | Examples                     |
| ------------------ | ---------------------------------------- | ---------------------------- |
| Portfolio/program  | Strategic direction, resource allocation | SAFe, OKRs                   |
| Team coordination  | What to build, when, by whom             | Scrum sprints, Kanban boards |
| **Execution pair** | **How a developer and agent implement**  | **ARC**                      |

Scrum answers "what does the team commit to this sprint?" ARC answers "how does this developer-agent
pair work through this task effectively?" These are complementary, not competing.

### Agent compatibility

ARC is designed for conversational agents where developer and agent share context in real time:

- **CLI agents** (Claude Code, Codex CLI, Gemini CLI, Aider) — primary design target. ARC's session
  model maps directly to the conversation lifecycle.
- **IDE agents** (Cursor, Windsurf, GitHub Copilot agent mode, Cline) — compatible. IDE persistence
  may lighten session ceremonies, but the methodology applies.
- **Cloud/async agents** (Jules, Codex cloud, Devin) — off-label. ARC can function at the
  boundaries (planning as specification, quality gates as verification), but the core
  co-development value is absent during execution.

---

[ruler]: https://arxiv.org/abs/2404.06654
[web-agents]: https://arxiv.org/abs/2512.04307
[lost-middle]: https://arxiv.org/abs/2307.03172
[ctx-length-hurts]: https://arxiv.org/abs/2510.05381
[task-switching]: https://doi.org/10.1037/0096-3445.130.4.621
[interruption-general]: https://doi.org/10.1145/985692.985715
[interruption-recovery]: https://doi.org/10.1145/3613904.3642861
