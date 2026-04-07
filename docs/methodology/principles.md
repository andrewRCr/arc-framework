# The 11 Principles

ARC's 11 principles define its identity. They are non-negotiable — an adoption that doesn't honor
all of them is not meaningfully using ARC. Under each principle, configurable conventions implement
the principle in practice. Conventions are strong defaults; changing them doesn't change what ARC
is. See [Principles vs. Conventions](rationale.md#principles-vs-conventions) for the distinction.

Principles are numbered P1–P11 for stable reference. The grouping reflects how they relate to each
other, not a hierarchy of importance.

## Core commitments

These define ARC's distinctive approach to development.

### P1 — Development from written specifications

Development begins from explicit, written specifications that establish intent, scope, and success
criteria before implementation. Planning leads execution at every level, not the reverse.

Not every action requires formal specification. Quick fixes with clear scope can rely on
well-crafted commits as the record. ARC provides methods for specification; teams decide how
strictly to apply them based on context.

??? info "Why this principle?"

    Remove this and the methodology collapses into ad-hoc AI prompting with organized folders.
    The specification is what makes work directed rather than reactive. Decomposition may be
    refined iteratively, but it always precedes the work it governs.

*Conventions:* The specific document hierarchy (PRDs, task lists), file naming and locations,
template formats, and the constitutional document set.

### P2 — Human-agent co-development

Humans and AI agents collaborate through tight, iterative feedback loops. Review happens during
work, not after it. The human directs; the agent executes within bounded scope, reports back, and
the cycle repeats.

This is ARC's most distinctive characteristic — not review-at-merge-time, but continuous iterative
refinement. The human is a co-developer, not merely a reviewer. Even when the developer isn't
directly editing code, they contribute context, judgment, and course correction at every review
increment. The human takes professional ownership of the work: their name is in the commit author
field, and they bear responsibility for the output.

The bounded chunk of autonomous execution between human review points — the *review increment* —
must be kept small enough to maintain this collaboration. Per-task or per-task-grouping is the
right range: small enough for meaningful feedback, large enough for productive autonomous
execution. Per-edit review destroys momentum; per-phase review loses the methodology's value.

??? info "Why this principle?"

    Remove co-development and ARC becomes a delegation framework with planning overhead. The
    tight feedback loop is what produces better outcomes than either full delegation or ad-hoc
    prompting — it's the mechanism through which human judgment and agent capabilities actually
    combine, not just alternate.

*Conventions:* The task list system provides the default review boundary structure. The specific
tracking mechanism, completion protocol steps, review granularity, and deferred review scope are
configurable.

### P3 — Focused, sequential execution

ARC is built around focused, sequential work. The vast majority of development should follow this
pattern, and the framework is designed on the basis that focused work produces better results than
the alternative for most application domains.

This does not mean all parallelism is prohibited. Multiple work units active on different branches
(team-level parallelism) is fine. Sequential agent handoffs (one agent for design, another for
implementation) are compatible. Supplementary agents for bounded, well-defined tasks — research
gathering, codebase exploration, targeted analysis — are a natural part of the workflow; the
developer remains the continuity thread, directing the primary work while incorporating
supplementary results. What P3 addresses is the developer's own attention: one primary line of
work at a time, with the sustained focus that makes co-development effective.

??? info "Why this principle?"

    The [philosophical foundation](rationale.md#three-observations) explains the reasoning in
    detail. In brief: the cognitive evidence supports sequential focus for novel knowledge work,
    the human involvement that co-development requires is single-threaded by nature, and
    interaction frequency between developer and agent benefits from sustained attention.

*Conventions:* The enforcement mechanism (one checkbox plus mandatory stop after each task) is
covered under P2's review increment. P3 provides the justification for keeping review increments
small and sequential.

## Operational discipline

These make the core commitments reliable in practice.

### P4 — Quality gate enforcement

Automated quality verification is a required step before work is considered complete. Quality is
verified, not assumed.

Quality gates are the feedback mechanism that makes directed collaboration reliable. Without
automated verification, the agent can declare "done" with no check, and errors compound across
review increments. The principle is about the existence of automated verification — not the
specific gates, tools, or strictness level.

??? info "Why this principle?"

    Remove quality gates and the co-development loop has no verification step. The human's
    review at each increment catches design and intent issues, but automated verification catches
    the mechanical issues (lint failures, type errors, test regressions) that compound silently.
    Together they form a complete feedback system.

*Conventions:* Zero-tolerance policy, specific tier definitions (Tier 1/2/3), specific tools, when
each tier runs, and the verification phase structure. The "leave it cleaner" rule (issues found in
files being modified must be addressed) is convention; the requirement to capture discovered work
rather than ignore it is closer to methodology. Issue triage (fix-vs-defer decision tree) is a
configurable method.

### P5 — Context preservation

Work context must be recoverable across work boundaries through structured, human-controlled, and
transparent mechanisms. Knowledge gained during work — decisions, state, rationale — must not be
lost when a session ends.

The mechanism must be structured (consistent format), human-controlled (the human decides what's
preserved and can edit it), transparent (visible and debuggable), and predictable (reliable
recovery, not dependent on ambient tool features).

Context preservation is also proactive. Agent output quality degrades measurably as context
accumulates within a session. Active context quality management during work (monitoring
utilization, recognizing degradation) is part of this principle, not just recovery at session
boundaries.

??? info "Why this principle?"

    Without context preservation, each session starts from scratch and the collaboration loop
    breaks entirely. Sessions — bounded, intentional periods of agent-assisted work — are the
    natural container: they bound degradation by providing reset points, enforce methodology
    discipline through the establish-execute-capture rhythm, and create natural review and commit
    points.

    Sources of truth having a defined priority ordering is methodology (without it, conflicting
    state is unresolvable). The specific ordering (git > task list > WORK-STATUS >
    SESSION-NOTES) and artifact set are convention.

*Conventions:* WORK-STATUS.md + SESSION-NOTES.md, session initialization and handoff ceremonies,
specific context quality thresholds, what triggers session end, the context loading tier model,
and the trust hierarchy for conflict resolution. Alternative mechanisms that satisfy the
structured/human-controlled/transparent/predictable criteria are valid.

### P6 — Traceability through version control

Work is traceable — changes link back to the intent that motivated them. Git serves as the
canonical record of what was done, when, and why.

Git is assumed as the VCS. This is pragmatic: git is universal across all agent tools surveyed
and effectively synonymous with version control in current practice. The deeper principle is
traceability itself — the ability to follow the thread from any change back to the decision that
motivated it.

Teams using different merge strategies satisfy this principle differently. With merge or rebase
commits, traceability lives in individual commit messages. With squash merges, traceability shifts
to PR descriptions. Either way, the thread from change to intent must be followable.

??? info "Why this principle?"

    Traceability is what makes the planning investment (P1) pay off beyond the immediate work.
    Without it, specifications exist but the connection between "why we decided this" and "what
    we actually built" is lost. Future maintenance, onboarding, and decision review all depend
    on being able to follow the thread.

*Conventions:* Conventional commit format, context footer format, atomic commit granularity,
branch naming conventions, platform-specific tooling (GitHub CLI, PR workflows).

### P7 — Granular task tracking

Work is decomposed into explicit, trackable increments before execution. Progress is visible and
verifiable — not implicit in code changes or assumed from activity.

Task tracking is the operational bridge between written specifications (P1) and the co-development
loop (P2). Specifications define intent; tracking makes that intent executable and reviewable at
the right granularity.

??? info "Why this principle?"

    Tracking granularity should roughly match review increment granularity — this connection
    ensures the methodology's components reinforce each other. Without explicit tracking,
    progress becomes subjective ("I think we're about 60% done") rather than observable
    ("4 of 7 tasks complete, all passing quality gates").

*Conventions:* Markdown checkboxes in task list files, task list naming and formatting, specific
granularity guidelines, and work categories. Teams using external trackers (Jira, Linear, GitHub
Issues) or different categorization schemes can satisfy the principle through those tools.

## Design commitments

These govern how ARC itself is built and how it relates to the tools and teams that use it.

### P8 — Agent-agnostic design

ARC's methodology is defined independently of any specific AI tool. The framework's value is the
methodology, not coupling to one AI product.

Agent lock-in would be a design failure. Core workflows are written in agent-neutral terms, with
agent-specific guidance isolated to dedicated files. Agent-agnostic does not mean universally
compatible — some agent types are philosophically misaligned with ARC's co-development model.
The goal is clarity about which assumptions are load-bearing and where the methodology applies,
not universal compatibility.

??? info "Why this principle?"

    The AI tooling landscape is evolving rapidly. A methodology that requires a specific vendor
    or product would need to be abandoned when that tool changes or a better alternative
    emerges. Agent-agnostic design means the methodology investment is durable regardless of
    which tools a team uses.

*Conventions:* The hub-spoke file architecture — shared entry points (AGENT-BRIEFING.ARC.md,
AGENT-BRIEFING.PROJECT.md) with agent-specific supplements (CLAUDE.ARC.md, GEMINI.ARC.md). The
specific file naming, workflow abstractions, and what lives in shared docs versus agent-specific
files are all convention.

### P9 — Dual-audience documentation

All project artifacts are structured for both human comprehension and AI agent consumption.
Documentation that only works for one audience misses the purpose of a framework designed for
human-AI collaboration.

The dual-audience principle drives template structure, formatting choices, and content organization
throughout the framework.

??? info "Why this principle?"

    In a co-development workflow, both the human and the agent need to read and act on the same
    documents. Documentation optimized only for humans (prose-heavy, implicit structure) is hard
    for agents to parse reliably. Documentation optimized only for agents (structured data,
    minimal context) is hard for humans to review and maintain. The dual-audience requirement
    forces a middle ground that serves both.

*Conventions:* Specific formatting rules, template layouts, collaborative voice in documentation,
reference-style links.

### P10 — Codified improvement

The framework and the projects that use it improve through documented feedback loops. Patterns are
codified from experience; decisions are captured; future work builds on prior context rather than
starting fresh.

??? info "Why this principle?"

    Without knowledge evolution, ARC is a static project management template. The feedback
    loop — decisions documented, patterns extracted, future work informed by prior cycles — is
    what makes it a living methodology. This applies at two levels: projects accumulate
    institutional knowledge across sessions, and the framework itself improves through the same
    mechanism (ARC is developed using ARC).

*Conventions:* The specific evolution path (working notes → strategy documents → constitutional
docs), archival processes, where patterns live.

### P11 — Shared-context co-development

Developer and agent operate in shared context with mutual visibility. The developer can see what
the agent is doing, intervene at any point, and contribute directly to the same work artifacts.

??? info "Why this principle?"

    This is what enables the tight interaction loop (P2) and the complementary strengths
    dynamic. If the agent works in an opaque sandbox and the developer only sees output,
    collaboration is replaced by review. Shared context means both parties have access to the
    same state during work — not just at commit time.

*Conventions:* Local CLI with filesystem access is ARC's primary design target. The specific
mechanism (terminal, editor, remote session) is convention; the shared context and mutual
visibility requirement is not.
