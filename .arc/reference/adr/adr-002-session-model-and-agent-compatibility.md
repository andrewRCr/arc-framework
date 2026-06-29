# ADR-002: Establish Session Model and Agent Compatibility Envelope

## Status

Accepted

## Context

ADR-001 established ARC's core identity through 11 principles and 19 conventions. Three principles are directly relevant
to this decision:

- **P5 (Context Preservation):** Work context must be recoverable across work boundaries through structured,
  human-controlled, and transparent mechanisms.
- **P8 (Agent-Agnostic Design):** ARC's methodology is defined independently of any specific AI tool.
- **P11 (Shared-Context Co-Development):** Developer and agent operate in shared context with mutual visibility.

ADR-001 classified session ceremonies (CURRENT-SESSION.md, init/handoff protocols) as convention and drew a compatibility
envelope around CLI and IDE agents, with async delegation agents outside. But two questions remained open:

1. **What is a "session" in ARC?** ADR-001 uses the term throughout ("when a session ends") without defining it. ARC's
   current documentation assumes the CLI model: a conversation from launch to exit, bounded by context window limits. But
   sessions mean different things across the agent spectrum — a conversation thread in IDE agents, a task execution in
   cloud agents, something blurry in agents with persistent memory. Is "session" a CLI artifact or a first-class concept?

2. **Which workflow assumptions are load-bearing?** ARC's current workflows embed specific assumptions shaped by the
   Claude Code development experience: conversational interaction, context window loading ceremonies, turn-based
   execution, terminal-based co-development, local filesystem access, slash command invocation, and a deferred review
   protocol. Which of these are fundamental to the methodology and which are incidental to the tool that happened to be
   used during development?

**Evidence base:**

Phase 1 research provides the empirical grounding for both questions:

- **Context degradation research** (28 sources: 12 peer-reviewed papers, 6 vendor sources, 10 practitioner reports):
  Performance degrades 13.9%–85% as context fills, even with perfect retrieval. Effective capacity is 60–70% of
  advertised limits. The 75–80% utilization threshold is well-supported for general agentic work, with 60–70%
  recommended for complex reasoning tasks. A counterintuitive finding directly relevant to session design: shorter
  windows with good compression outperform massive windows with naive accumulation.

- **Agent landscape research** (17 tools across 4 categories): Session models range from conversation-persistent (Claude
  Code, Cline) to task-driven (Jules, Codex cloud, Warp Oz) to long-lived (Devin, OpenHands) to persistent-memory
  (Augment Code). Only Augment Code has documented cross-session memory. Git is universal as the handoff mechanism.
  CLI/terminal agents are where sustained, methodology-driven development workflows are most developed.

**Practical validation context:** ARC has been validated exclusively with CLI conversational agents (Claude Code, Codex
CLI, Gemini CLI). IDE and cloud agent compatibility is reasoned from research and design analysis, not direct experience.

## Decision

### Part 1: Session as First-Class Concept

We will establish "session" as a first-class concept in ARC at the principle level — not merely a technical necessity
forced by context window limits, but the temporal container for focused work.

**Definition:** A session is a bounded, intentional period of agent-assisted work with explicit start and end states.
Work is organized into sessions; each session has context establishment at its beginning, focused execution in its
middle, and state capture at its end.

**Why sessions matter:**

1. **Agent performance degrades within sessions — this is the primary evidence-based driver.** The context degradation
   research is unambiguous: agent output quality deteriorates measurably as context accumulates, well before the
   advertised window fills. Effective capacity is 60–70% of advertised limits. Complex reasoning tasks — which is what
   ARC work is — degrade faster than simple retrieval. This is not "running out of tokens"; it is gradual performance
   erosion where the agent loses track of detail, produces less precise output, and becomes less reliable at exactly the
   tasks that matter most. Sessions bound this degradation by providing natural reset points. The research finding that
   shorter windows with good compression outperform massive windows with naive accumulation directly supports the
   session-bounded model.

2. **Sessions enforce methodology discipline.** The rhythm of establish context → execute within scope → capture state
   reinforces P1 (spec-directed work), P7 (granular tracking), and P2 (tight feedback loop). Without session boundaries,
   work drifts toward open-ended accumulation — which is exactly the pattern the degradation research warns produces
   worse outcomes.

3. **Well-scoped sessions benefit human focus.** Bounded work periods help the developer stay engaged and sharp —
   sustained attention on a single work stream is easier to maintain when the session has clear scope and an endpoint.
   This is a supporting benefit, not the primary driver, but it reinforces the session concept from the human side.

4. **Sessions create natural review and commit points.** They force the question: "Is this work done? Is it committed?
   What's the state?" Session boundaries are a forcing function for traceability (P6) and context preservation (P5).
   Without them, the answer to "what's the current state?" tends toward "in progress, kind of."

**What varies (convention):** Why the session ends (context limits, natural work boundary, human schedule, task
completion), how long it lasts (governed by context quality guidance, human attention, and work scope), and what
ceremonies bookend it (init/handoff protocols, adapted to agent type).

**What doesn't vary (principle):** Work happens in bounded, intentional periods. Sessions have explicit start and end
states. The session concept reinforces the convergence of P2 (co-development), P3 (focused execution), and P5 (context
preservation) in practice.

### Part 2: Context Quality Management (P5 Expansion)

We will expand P5 (Context Preservation) to explicitly include active context quality management within sessions, not
just recovery at boundaries.

P5 as established in ADR-001 focuses on recoverability: "knowledge must not be lost when a session ends." The context
degradation evidence demonstrates that quality management *during* work is equally important:

- Performance degrades gradually, not catastrophically — work quality erodes before an obvious failure point
- Complex reasoning tasks (which ARC work is) degrade faster than simple retrieval
- The degradation directly undermines P2 (co-development quality depends on agent context quality) and P4 (quality gates
  are unreliable when the agent executing them has degraded context)

**Expanded P5 scope:** Context must be recoverable across sessions (existing) AND context quality must be actively
managed within sessions (new). The principle is that context preservation is proactive — it includes monitoring and
managing quality during work, not just capturing state at boundaries.

**Convention-level specifics:** Utilization thresholds (75–80% for general work, 60–70% for complex reasoning), specific
monitoring protocols, what triggers compaction or session end, and agent-specific threshold calibration (e.g., Claude
Code's 140K/150K checkpoints) remain convention. The principle is "actively manage context quality"; the specific
numbers and mechanisms are configurable.

### Part 3: Workflow Assumption Classification

We will classify ARC's current workflow assumptions as follows. Each traces to a load-bearing principle already
established in ADR-001, but the specific mechanism in every case is incidental to the Claude Code experience.

| Assumption                  | Classification     | Load-bearing principle  | Mechanism varies by...                         |
| --------------------------- | ------------------ | ----------------------- | ---------------------------------------------- |
| Conversational interaction  | Incidental         | P2 (iterative feedback) | CLI conversation vs. IDE chat vs. plan-approve |
| Context window loading      | Incidental         | P5 (context preserved)  | File reads vs. indexing vs. persistent memory  |
| Turn-based execution        | Incidental         | P2 (review increments)  | Per-tool approval vs. per-plan vs. per-task    |
| Terminal co-development     | Incidental         | P11 (shared context)    | Terminal vs. editor vs. web UI                 |
| Local filesystem access     | Mostly incidental  | P11 + P5 (shared state) | Local files vs. cloned repo vs. editor API     |
| Slash commands / invocation | Incidental         | Reusable workflows      | Commands vs. palette vs. natural language      |
| Deferred review protocol    | Convention (of P2) | P2 (review flexibility) | Explicit protocol vs. inherent in agent model  |

**Local filesystem access — the nuance:** ARC's session model (CURRENT-SESSION.md as a file both human and agent
read/edit in real time) depends on filesystem co-location. CLI and IDE agents share this natively. Cloud agents with
their own repo clone share it only at the git level — during execution, it's not a real-time shared artifact. This is
another expression of P11's compatibility envelope: shared-context co-development requires shared artifacts during work,
not just at commit time.

**What's actually load-bearing (the principles behind all assumptions):**

1. Agent has project context before working (P5) — *how* it acquires context varies
2. Agent and human share context with mutual visibility (P11) — the *medium* varies
3. Review happens at meaningful increment boundaries (P2) — the *interaction model* varies
4. Agent can read and modify work artifacts (task lists, docs, code) — the *access mechanism* varies
5. Human can intervene during work, not just at completion (P2 + P11) — the *intervention mechanism* varies
6. Predefined workflows exist and are triggerable — the *invocation mechanism* varies

### Part 4: Agent Compatibility Spectrum

We will establish a three-tier compatibility model that is honest about where ARC fits best.

**Tier 1 — Primary design target: CLI conversational agents**

Claude Code, Codex CLI, Gemini CLI, Aider. This is where ARC has been validated and where it shines. The session model
maps directly to the conversation lifecycle. Context loading, review increments, co-development, and workflow invocation
all work as designed. ARC's documentation and ceremonies are written with this model in mind.

**Tier 2 — Compatible: IDE conversational agents**

Cursor, Windsurf, GitHub Copilot (agent mode), Antigravity, Cline, Roo Code. These satisfy P11 (shared context through
the editor) and P2 (iterative feedback through conversation threads). The session concept applies — bounded work periods
with context management — but ceremonies may be lighter (IDE provides some context persistence, project indexing reduces
loading ceremony). Roughly equivalent to CLI agents for ARC's methodology, with ceremony adaptation.

**Tier 3 — Off-label: Cloud and async delegation agents**

Jules, Codex cloud, Warp Oz, Devin, SWE-Agent, OpenHands, Copilot Workspace. ARC can function at the boundaries:
planning output serves as a dispatch specification (P1), and quality gates plus traceability (P4, P6) serve as a
rigorous integration mechanism. This is the "bookend pattern" acknowledged in ADR-001 — ARC for planning and
integration, with the execution phase operating under the agent's own model.

But the core value proposition — iterative co-development with frequent micro review and human input (P2, P3, P11) — is
absent during the execution phase. The tight feedback loop, the complementary strengths amplified by interaction
frequency, the human as co-developer rather than reviewer — these are lost when execution is delegated to an opaque
sandbox.

**This is not a prohibition.** There are legitimate use cases for delegation: bounded deterministic work (batch
migrations, boilerplate, CI/CD automation), triage and exploration (ARC's own research sub-agent uses this pattern), and
parallel execution on truly independent, well-specified tasks. ARC doesn't claim these agents have no value.

**But it is an explicit exception, not the expected norm.** ARC assumes delegation-based execution is an occasional
complement for bounded work, not typical core workflow. Teams that primarily use cloud/async agents for execution are
operating outside ARC's design center — the methodology's most distinctive value doesn't apply to the execution phase.
ARC's principles still govern the planning and integration phases, but the framework doesn't provide methodology
guidance for the delegated execution itself.

### Part 5: Agent-Specific File Architecture

We will confirm the hub-spoke pattern established in the current agent directory structure:

- **AGENTS.md** is the entry point for all agents — project context, collaboration principles, critical path
  information. This is the only file every agent reads.
- **Agent-specific files** (CLAUDE.md, GEMINI.md, etc.) supplement with guidance that is truly unique to that agent and
  only that agent — context window thresholds, tool-specific capabilities, interaction quirks. Everything that applies
  to all agents belongs in shared docs (DEVELOPMENT-RULES, QUICK-REFERENCE, strategy documents, workflows).
- **Session-init loads files in order** — shared context first (AGENTS.md), then agent-specific. This controlled loading
  is the mechanism; tools don't need to live at their native lookup locations.

This pattern is sound and well-designed. The principle (P8, agent-agnostic) is served by keeping methodology in shared
docs and isolating truly agent-specific content. No structural changes needed — WU2 should refine content, not
architecture.

**Minor maintenance note:** WARP.md contains Docker-focused workflow references from an earlier project state that no
longer apply. Flag for WU2 cleanup.

## Consequences

### Positive

- **Session has clear meaning across agents.** "Bounded, intentional work period" is agent-agnostic and meaningful
  whether you're using Claude Code (conversation lifecycle), Cursor (IDE thread), or even Jules (task execution).
  The concept reinforces focused work regardless of what forces the boundary.
- **Genuine agent-agnosticism confirmed.** All seven workflow assumptions are incidental — every one traces to a
  load-bearing principle that's already agent-neutral. ARC's methodology is portable at the principle level; only
  ceremonies need adaptation. This is a strength: the framework is genuinely about the methodology, not the tool.
- **Honest design target.** Rather than claiming broad compatibility and underdelivering, ARC is explicit about where it
  fits best (CLI/IDE conversational agents) and where it doesn't (async delegation). Better to be excellent for a clear
  subset than mediocre across all. Adopters can make informed choices.
- **Off-label framing resolves the delegation tension.** Instead of an awkward binary (supported/unsupported), the
  three-tier model acknowledges legitimate delegation use cases while being clear that ARC's distinctive value doesn't
  apply there. The bookend pattern has a name and a place.
- **P5 expansion is evidence-based.** Active context quality management is grounded in empirical research, not
  assertion. The expansion is modest (adds "during sessions" to existing "across sessions") but fills a real gap.
- **WU2 has clear scope.** Session docs reframed as default CLI method, ceremony weight made configurable, workflow
  assumptions expressed as principles (what) not mechanisms (how), agent file content refined.

### Negative

- **CLI focus may limit perception.** Being explicit about the primary design target could be read as "ARC only works
  with Claude Code" — which is not the intent. Tier 2 (IDE agents) is genuinely compatible. Framing must be careful.
- **Off-label framing requires tone discipline.** The line between "honest about limitations" and "dismissive of other
  tools" is narrow. The ADR's position is that delegation has value for bounded work — not that it's inferior. Tone in
  downstream docs (philosophy strategy, README, adoption guides) must follow this framing consistently.
- **"Session" adds terminology.** ARC already has "work unit" and "review increment." Adding "session" as a defined
  concept increases the vocabulary. However, sessions are intuitive and already used informally — formalizing the
  definition clarifies rather than complicates.

### Risks

- **Tier 2 is not yet validated.** IDE agent compatibility is reasoned from research, not direct experience. Pre-release
  IDE validation is planned before 1.0, but as of this decision the analysis is design-level, not empirical. Friction
  points not anticipated here may surface during that validation or through early adopter feedback.
- **Off-label boundary is fuzzy.** Some agents blur the line between Tier 2 and Tier 3. Cursor's background agents
  run autonomously on separate branches (Tier 3 behavior) while the foreground agent is conversational (Tier 2).
  The tier applies to the *usage pattern*, not the tool — but this distinction may confuse adopters.
- **Context quality thresholds will evolve.** The 75–80% recommendation is current best evidence, but model
  architectures improve. Convention-level classification means thresholds can update without ADR revision, but the
  guidance must be presented as current evidence rather than permanent truth.

**Amendment (2026-06-29):** Compaction recovery evolves this ADR's session model without superseding it. ARC now
treats harness compaction as a recoverable discontinuity: the harness may rewrite the conversation, but ARC owns
the deterministic recovery path for its procedural/semantic context. The earlier "disable auto-compaction where
possible" posture assumed a capability current primary harnesses no longer reliably expose, so compaction is no
longer framed as a black box to avoid.

Bounded sessions remain load-bearing, but for scope, review, and attention discipline rather than as the sole
correctness mechanism for preserving context under pressure. Recovery makes longer sessions viable when pressure
arrives between natural boundaries; it does not make them the default recommendation. Natural session boundaries
still earn a handoff because they create a clean episodic baseline for the next mode of work.

The recovered procedural floor is intentionally the same one a fresh `clear` + `session-init` load resolves from
tracked state: briefs, rules, working memory, active metadata, task-list slice, lifecycle workflow, and declared
methods/extensions. The difference is episodic. Handoff + `clear` + re-init carries a curated-minimal episodic
baseline, while compaction carries the harness's opaque summary of the prior stretch. That residue is
mode-relative: useful continuity within a mode, but noise at a mode transition. "Clean baseline" therefore means
clean episodic baseline, not lighter procedural load; the reset comes from the fresh load after `clear`, while
handoff supplies the durable capture before that reset.

---

Context: tasks-philosophy-configurability.md (Tasks 3.1, 3.2)
