# The ARC Methodology

ARC is a methodology for human-AI collaboration during software development. This page describes
what ARC asks of you, independent of the ARC Framework's specific tooling, file structures, and
configuration.

## The Core Commitments

ARC takes specific stances on how developers and AI agents should work together. These aren't
general good practices; they're positions that much of the industry is actively moving in the
opposite direction on. Each one is a commitment you'd be making.

### Co-development, not delegation

A developer and an AI agent work through implementation together. Not "agent builds, human
reviews." Not "human prompts, agent executes, repeat ad-hoc." The human is present during
implementation: steering, contributing context, catching issues as they emerge, noticing the
cross-cutting connections that only surface when you're engaged with the work as it unfolds.

This rests on a specific belief: human involvement during implementation is irreplaceable quality
input, not just quality control. Software is built for human use, and agents have never used
software. They optimize for an abstraction of human needs. A developer with lived experience of
the problem domain, actively shaping the implementation, produces fundamentally different work
than an agent working from a specification alone. The architectural insights, the "this feels
wrong" moments, the recognition that a current approach mirrors a pattern elsewhere in the
system: these require presence during execution, not review after the fact.

There is also a practical cost to delegation. Developers who co-develop maintain familiarity with
how their code works. When maintenance needs arise weeks or months later, they have context
because they were there. Delegation-based approaches risk producing code that no human deeply
understands, creating maintenance debt that accumulates quietly.

The counter-position is clear: the industry is converging on delegation as the default workflow.
ARC argues this is wrong for most work where quality, judgment, and maintainability matter.

### Interaction frequency matters

Collaboration quality scales with the frequency of exchange between developer and agent. Each
interaction is an opportunity for both parties to contribute what they're good at: the human
brings perspective, judgment, institutional context, and lived experience; the agent brings
speed, breadth of knowledge, and pattern recognition. Lengthen the interval between exchanges
and you underutilize both.

ARC formalizes this as the *review increment*: a bounded chunk of agent execution, scoped to a
few files and a few minutes of work, with human review before the next begins. This is the
fundamental unit of collaboration.

The granularity is deliberate. Catching issues at the task level, while context is fresh and
scope is small, is dramatically cheaper than catching them in a large completed batch. Code
review research confirms this: defect detection drops sharply as review size grows. And there is
a second dimension: short execution cycles keep the developer close enough to the work to review
in flight. Lengthen the cycle and that proximity breaks down. You context-switch to something
else, come back to a batch of completed work, and review becomes reconstruction rather than
participation.

A pattern engineers are increasingly recognizing: when developers are reduced to reviewing AI
output rather than participating in its creation, they lose context on their own codebase.
Disengaged review is ineffective review. The review increment is the mechanism that prevents this
degradation.

### Sequential focus is a design constraint, not a bottleneck

The industry's default framing treats the limits of human attention as a problem to solve
around: parallelize the agents, let the developer supervise multiple streams. ARC takes the
opposite position.

Human attention for novel knowledge work is single-threaded. The cognitive science on this is
extensive, well-replicated, and not controversial (see
[Philosophy](rationale.md#human-attention-is-single-threaded) for the evidence base). ARC
treats this as a design constraint worth respecting rather than a limitation to engineer around.
Sequential focus forces quality input at every step and keeps the developer genuinely engaged
rather than superficially monitoring. The result is work that reflects real judgment, not the
output of a process optimized to minimize human involvement.

You can run supplementary tasks in parallel: research, exploration, bounded analysis. But your
primary attention stays on one line of work. Throughput is not the only measure of effective
development, and for most work it is not the most important one.

### Bounded sessions, not open-ended conversations

Work happens in bounded, intentional sessions with explicit start and end states. This is
methodology, not convenience.

Both human and agent context degrade over time, through different mechanisms but with the same
effect. Agent output quality drops measurably as context accumulates within a session; the
research evidence on this is clear across model families and architectures. Human attention and
judgment follow the same pattern through fatigue and accumulated cognitive load. Structured
resets at natural boundaries maintain quality that marathon sessions quietly erode.

Session boundaries also enforce the discipline that makes the other commitments work: deliberate
context loading at the start, focused execution in the middle, intentional state capture at the
end. Without explicit boundaries, knowledge accumulates implicitly and is lost when the
conversation ends.

## Supporting Disciplines

The commitments above define what makes ARC distinctive. They're supported by practices that are
individually standard but serve specific roles in the methodology.

**Written specifications before implementation.** Plan the work explicitly: what you're building,
why, and what done looks like. Decompose into increments before executing. In a landscape where
AI makes it tempting to skip planning and just prompt, this is a deliberate counter-choice. The
specification isn't a formality; it's shared context that makes the co-development loop
productive from the first increment.

**Automated verification at each increment.** Quality gates run after every review increment.
This serves co-development directly: verification handles mechanical correctness so that human
review focuses on judgment, design, and intent. Without it, the developer spends review time
catching lint errors instead of noticing that the approach is wrong.

**Traceability through version control.** Every change links back to the intent that motivated
it. This is standard engineering practice, but it compounds with bounded sessions and review
increments: when work is done in small traced steps with preserved context, the full thread from
decision to implementation to outcome stays recoverable.

**Codified improvement.** Patterns that emerge during work get captured. Decisions get documented.
Future work builds on prior context rather than rediscovering it. Without this, a methodology
is a static template. With it, the methodology and the project improve through the same
feedback loop.

## Shared Context as Prerequisite

One requirement cuts across all of the above: the developer and agent must operate in shared
context with mutual visibility. The developer can see what the agent is doing, intervene at any
point, and contribute directly to the same work artifacts.

This is what makes co-development possible. If the agent works in an opaque environment and the
developer only sees finished output, collaboration is structurally replaced by review, regardless
of intent. Shared context doesn't prescribe a specific tool (terminal, editor, remote session),
but it does draw a hard line: workflows where the agent executes in isolation and delivers
results are outside the methodology, even if they use every other ARC practice.

What makes it ARC is the combination: co-development as the primary mode, interaction frequency
as a deliberate design variable, sequential focus as a respected constraint, and bounded sessions
as a structural practice. The supporting disciplines are how the commitments work. The specific
tools are how the disciplines get enforced.

For the reasoning behind these commitments, see [Philosophy](rationale.md). For how the ARC
Framework implements them, see [How ARC Works](../the-framework.md).
