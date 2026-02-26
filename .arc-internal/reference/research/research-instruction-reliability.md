# Research: Instruction Delivery Reliability

**Purpose:** Evidence base for Task 2.2 — evaluating how different instruction delivery
mechanisms affect agent compliance rates, and what determines whether an agent reliably
finds, recognizes, and follows instructions that require near-100% consistency.

**Primary question:** What are the underlying patterns that make instruction delivery
reliable or unreliable, regardless of mechanism format?

**Companion research:** [Context Loading Architecture][context-loading] covers what content
goes into the context window and how tiers are structured. [Context Degradation][context-degradation]
covers general window degradation — positioning effects, effective capacity, compaction.
This document focuses on the *reliability* of different delivery mechanisms and the
architectural ceiling on instruction compliance.

**Date:** 2026-02-26

---

## Executive Summary

Instruction delivery reliability is constrained by a fundamental model limitation: the
"curse of instructions," where compliance degrades mathematically as instruction count
increases (P(all) = P(individual)^n). This ceiling is **mechanism-independent** — whether
instructions come from system prompts, auto-loaded files, skills, or tool descriptions,
they compete for the same finite compliance capacity.

**What the evidence establishes:**

- Frontier models maintain reasonable compliance through ~50-100 simultaneous instructions;
  degradation accelerates past 150-200
- **Recognition reliability** (does the agent know an instruction exists?) varies
  dramatically by mechanism: always-present content achieves 100%, indexed/skills-based
  awareness achieves 60-75%, search-based discovery achieves 20-40%
- **Explicit triggers** ("when X, load Y") achieve 85-95% recognition — significantly
  higher than implicit awareness (60-75%) and close to always-present (100%)
- The 85% → 99% compliance gap appears to be an **architectural ceiling** of current LLM
  architectures, not a mechanism-choice problem

**Key finding for ARC:** The primary lever is not *which documents to load* but *how many
distinct instructions they collectively impose*. Reducing instruction count matters more
than reducing token count or document count. For Tier 2 content, explicit triggers
embedded in Tier 1 significantly outperform implicit index-based awareness.

---

## 1. Instruction Multiplicity: The Core Constraint

### 1.1 The "Curse of Instructions"

**Sources:** [IFScale benchmark][ifscale-reliability] (Jaroslawicz et al., 2025),
[ManyIFEval][manyifeval-reliability] (Harada et al., 2025)

The critical finding: LLM performance degrades mathematically as instruction count
increases. Total success rate approximates P(individual)^n where n = instruction count.

- Frontier models achieve only **68% accuracy at 500 instructions** (IFScale)
- At moderate densities (5-10 instructions): 44-58% success rates with chain-of-thought
- Three distinct degradation patterns across model families:
    - **Threshold decay** (reasoning models — Gemini 2.5 Pro, O3): near-perfect through
      ~150-200 instructions, then sharp collapse
    - **Linear decay** (Claude Sonnet 4, GPT-4.1): steady ~5-15% per-instruction penalty
    - **Exponential decay** (GPT-4o, Llama): early, severe deterioration

### 1.2 The 150-200 Instruction Boundary

Practitioner consensus and research converge on a practical threshold:

- Below ~150 instructions: threshold-decay models maintain near-perfect compliance
- Above ~200 instructions: all model families show converging failure patterns (selective
  bias toward earlier instructions, then random neglect)
- This limit is **mechanism-independent** — system prompt, auto-loaded files, skills
  metadata, and tool descriptions all compete for the same instruction budget

**Implication:** The relevant question for any context loading architecture is not "how
many documents?" or "how many tokens?" but "how many distinct instructions/constraints
does the agent need to follow simultaneously?"

---

## 2. Mechanism Reliability Spectrum

### 2.1 Summary Table

| Mechanism                    | Recognition | Compliance (moderate) | Compliance (high, 150+) | Context Cost | Staleness Risk |
|------------------------------|-------------|-----------------------|-------------------------|--------------|----------------|
| System prompt                | 100%        | 75-85%                | 40-50%                  | High         | Medium         |
| Auto-loaded docs (CLAUDE.md) | 100%        | 75-85%                | 40-50%                  | High         | Medium-High    |
| Tool descriptions            | 100%        | 80-90%                | 50-60%                  | Medium       | Low            |
| Explicit triggers (user/doc) | 85-95%      | 85-95%                | 50-70%                  | Low-Medium   | N/A            |
| Skills + index (implicit)    | 60-75%      | 70-80% (if recognized) | 35-45%                 | Low          | Low            |
| RAG/retrieval                | 50-70%      | 60-75%                | 30-50%                  | Variable     | High           |
| Search-based discovery       | 20-40%      | Variable              | Variable                | None         | N/A            |

### 2.2 Always-Present Mechanisms (System Prompt, Auto-Loaded Docs)

**Advantages:** No discovery or recognition failure possible. Benefits from primacy
effect (LLMs weight beginning of context more heavily).

**Disadvantages:** Instruction count directly consumes the instruction budget. Subject
to full multiplicative degradation penalty. Context rot — static instructions become
stale over long sessions.

**Evidence basis:** Primacy/recency effects confirmed in serial position research
(2024-2025). System prompt hierarchical priority documented by Anthropic.

### 2.3 Tool Descriptions

**Sources:** [Anthropic: Writing Tools for Agents][anthropic-tools]

Tool descriptions occupy an interesting middle ground: always present in agent context
(like Tier 1) but scoped specifically to tool decisions (lower instruction multiplicity
penalty than free-form rules).

- Tool description refinements alone produced measurable improvements on SWE-bench
  Verified (Anthropic engineering)
- Scoped constraints in tool descriptions may carry higher effective weight than generic
  system prompt instructions

### 2.4 Explicit Triggers

Explicit triggers ("when you encounter X, consult Y") achieve 85-95% recognition —
significantly higher than implicit awareness. The mechanism: the agent encounters a
concrete instruction in loaded context that directs it to load additional content at a
specific moment. This eliminates the "implicit reasoning" step that degrades ambient
awareness.

**Evidence basis:** Research on implicit vs. explicit requirements shows frontier models
achieve only ~48% accuracy on implicit requirements ([Implicit Intelligence study][implicit],
2026). Explicit triggers convert an implicit recognition task into an explicit instruction.

### 2.5 Skills / Indexed Awareness (Implicit)

**Sources:** [Claude Code Skills documentation][skills-docs], practitioner reporting

Skills use progressive disclosure: metadata scanned upfront, full content loaded on
demand. Recognition depends on the agent inferring "this task is relevant to that skill"
— an implicit reasoning step.

- **No algorithmic skill selection** at code level (no embeddings, no classifiers)
- **Text-based routing only** via descriptions in system prompt
- Practitioner reports: "AGENTS.md outperforms skills in our agent evals" (HN)
- Recognition reliability: 60-75% (practitioner consensus, not rigorously measured)
- Combined reliability (recognition * compliance): ~51-71%

**Structural explanation:** Skills are discovered via ambient awareness (agent must
notice relevance), while auto-loaded docs are always present (no discovery needed).
The recognition gap is the cost of progressive disclosure without explicit triggers.

---

## 3. Explicit vs. Implicit Recognition

### 3.1 The Recognition Gap

**Source:** [Implicit Intelligence: Evaluating Agents on What Users Don't Say][implicit]
(2026)

- Frontier models achieve **48.3% baseline** on implicit requirements (things the user
  expects but doesn't state)
- Explicit triggers improve recognition to 85-95%
- The gap is structural: implicit reasoning requires the model to infer relevance from
  context, while explicit triggers provide a direct instruction

### 3.2 Implications for Tiered Loading

This research directly informs the distinction between two kinds of on-demand loading:

- **Tier 2a (explicit trigger):** A Tier 1 document says "before starting task execution,
  load the process-task-loop workflow." The agent encounters this as an explicit instruction
  during a known workflow step. Recognition: 85-95%.

- **Tier 2b (indexed awareness):** The agent reads STRATEGY-INDEX during session init and
  is expected to recognize when entering a domain covered by a strategy. Recognition:
  60-75%. The agent must implicitly reason "I'm now writing an ADR, and I know there's an
  ADR strategy document I should consult."

The 15-25% gap between these mechanisms is significant when compliance needs are high.

---

## 4. The 85% → 99% Compliance Gap

### 4.1 Incremental Improvements

Several techniques close the gap partially:

- **Chain-of-thought reasoning:** +15-20% improvement (GPT-4o: 15% → 31% on 10
  instructions; Claude Sonnet 3.5: 44% → 58%)
- **Constrained decoding:** Guarantees 100% compliance for *formatting/structural*
  constraints, but cannot enforce semantic or behavioral compliance
- **Instruction decomposition** (RECAST approach): break multi-constraint instructions
  into separate verifiable sub-goals. Improvements observed but no 99%+ reported
- **Self-check blocks:** Explicitly asking the agent to verify compliance with specific
  constraints provides modest improvement

### 4.2 The Architectural Ceiling

The gap from 85% to 99% appears to be an inherent limitation of current LLM
architectures, not a mechanism-choice problem:

- Even with all techniques applied, compliance converges around 95-98% for small
  instruction sets and degrades from there as count increases
- No published technique achieves 99%+ compliance at moderate instruction density
  (50+ instructions)
- The constraint hierarchy matters: formatting (near 100% with constrained decoding) >
  tool use (85-95%) > style (60-70%) > goal prioritization (40-60%)

**Practical implication:** For instructions requiring near-100% compliance, the most
effective strategy is not mechanism optimization but **structural enforcement** — hooks,
linting, CI checks, tool schemas. Instructions degrade; constraints don't.

---

## 5. Positional Effects

**Sources:** [Primacy Effect in LLMs][primacy] (2025),
[Serial Position Effects][serial-position] (2024)

- **Primacy effect dominant:** instructions at the start receive stronger weight
- **Recency effect weaker but present:** instructions at the end receive some weight
- **Effect size:** ~10-15% compliance swing from positioning alone
- **Length dependency:** longer context shifts attention toward the beginning
- **Claude-specific:** Anthropic notes "more emphasis on user messages than system
  prompts," suggesting end-of-user-message placement may be optimal for Claude

Positioning can shift compliance by 10-15% but does **not overcome the curse of
instructions** at high densities. At saturation (150+ instructions), positional effects
become noise.

---

## 6. Multi-Turn and Context Rot

**Sources:** [Multi-turn instruction performance][multi-turn] (2025), practitioner
reports

- Instructions split across multiple turns: **39% accuracy drop** vs. consolidated
- Behavioral constraints show "prompt hardening" challenges — reinforced constraints
  erode gradually across session history regardless of initial emphasis
- Stale instructions (loaded every session but not always relevant) create "ambiguous
  authority" — the agent must distinguish current from outdated guidance

**Mitigation patterns:**

- Consolidate instructions rather than distributing them
- Prefer Tier 2a (loaded when needed) for guidance that's session-specific
- Reserve Tier 1 for rules that are genuinely always-applicable
- Structural enforcement (hooks, linting) for rules that cannot tolerate drift

---

## Evidence Quality Assessment

### Peer-Reviewed (high confidence)

- Instruction multiplicity / curse of instructions (IFScale, ManyIFEval — 2025)
- Primacy/recency effects (serial position studies — 2024-2025)
- Implicit vs. explicit reasoning (Implicit Intelligence — 2026)
- Instruction format/structure (Deconstructing Instruction-Following, RECAST — 2024-2025)

### Vendor Documentation (medium confidence)

- Anthropic tool design guidance (specific, but not quantified)
- Claude Code / Skills documentation (practical, limited quantitative data)
- AGENTS.md specification (community-driven, limited empirical validation)

### Practitioner Reporting (low-medium confidence)

- Skill recognition gaps (HN/Reddit/Medium — converging anecdotal reports)
- "AGENTS.md outperforms skills" (specific but single data point)
- CLAUDE.md best practices (emergent consensus, no rigorous measurement)

---

## Sources

### Peer-Reviewed Research

1. [How Many Instructions Can LLMs Follow at Once? (IFScale)][ifscale-reliability]
   — Jaroslawicz et al., 2025
2. [When Instructions Multiply (ManyIFEval)][manyifeval-reliability]
   — Harada et al., 2025
3. [Exploiting Primacy Effect to Improve Large Language Models][primacy]
   — 2025
4. [Serial Position Effects of Large Language Models][serial-position]
   — 2024
5. [Implicit Intelligence: Evaluating Agents on What Users Don't Say][implicit]
   — 2026
6. [Instruction-Following Evaluation for Large Language Models (IFEval)][ifeval]
   — 2023
7. [Deconstructing Instruction-Following: Granular Evaluation][deconstructing]
   — 2025
8. [RECAST: Strengthening LLMs' Complex Instruction Following][recast]
   — 2025

### Vendor Documentation

9. [Anthropic: Writing Tools for Agents][anthropic-tools]
10. [Anthropic: Claude Code Best Practices][claude-code-bp]
11. [Claude Code Skills Documentation][skills-docs]
12. [Claude Prompting Best Practices][claude-prompting]
13. [Writing a Good CLAUDE.md][good-claudemd]
14. [A Complete Guide to AGENTS.md][agents-guide]

### Practitioner and Community Sources

15. [HN: AGENTS.md vs. Skills in Agent Evals][hn-agents-skills]
16. [Multi-Turn Instruction Performance][multi-turn]
17. [Agent Skills vs. Rules vs. Commands][skills-vs-rules]

---

[context-loading]: research-context-loading.md
[context-degradation]: ../../../.arc-internal/reference/research/research-context-degradation.md
[ifscale-reliability]: https://arxiv.org/abs/2507.11538
[manyifeval-reliability]: https://arxiv.org/abs/2509.21051
[primacy]: https://arxiv.org/abs/2507.13949
[serial-position]: https://arxiv.org/abs/2406.15981
[implicit]: https://arxiv.org/abs/2602.20424
[ifeval]: https://arxiv.org/abs/2311.07911
[deconstructing]: https://arxiv.org/abs/2601.18554
[recast]: https://arxiv.org/abs/2505.19030
[anthropic-tools]: https://www.anthropic.com/engineering/writing-tools-for-agents
[claude-code-bp]: https://www.anthropic.com/engineering/claude-code-best-practices
[skills-docs]: https://code.claude.com/docs/en/skills
[claude-prompting]: https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices
[good-claudemd]: https://www.humanlayer.dev/blog/writing-a-good-claude-md
[agents-guide]: https://www.aihero.dev/a-complete-guide-to-agents-md
[hn-agents-skills]: https://news.ycombinator.com/item?id=46809708
[multi-turn]: https://www.keywordsai.co/blog/how-to-fix-it-when-llms-get-lost-in-multi-turn-conversation
[skills-vs-rules]: https://www.builder.io/blog/agent-skills-rules-commands
