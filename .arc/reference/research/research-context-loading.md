# Research: Context Loading Architecture

**Purpose:** Evidence base for Task 2.2 — evaluating ARC's three-tier context loading model
against empirical findings on LLM context utilization, instruction-following, and structured
context delivery (Gap 2).

**Primary question:** Does empirical evidence support ARC's three-tier model (upfront / indexed
on-demand / discoverable), or suggest a different distribution of context across tiers?

**Companion research:** [Context Degradation in Large Windows][context-degradation] covers general
context window degradation — positioning effects, effective capacity thresholds, compaction
strategies. This document focuses on the *architecture* of what goes into the context window,
not the window's general performance characteristics.

**Date:** 2026-02-25

---

## Executive Summary

The evidence supports ARC's three-tier structure as directionally sound but surfaces two risks
in the current design and one significant gap in empirical coverage.

**What the evidence validates:**

- Tiered/hierarchical context delivery outperforms monolithic delivery (convergent evidence from
  instruction hierarchy research, progressive disclosure patterns, and practitioner consensus)
- On-demand loading for domain-specific content (Tier 2) aligns with agentic RAG patterns and
  production tool design (Cursor, Claude Skills, LlamaIndex)
- Separating constraint-heavy content from informational content reduces instruction conflict —
  ARC's category separation across documents is a structural advantage over single-file approaches

**What the evidence challenges:**

1. **Instruction conflict risk in Tier 1.** The primary degradation driver is not token volume
   but instruction count and cross-category conflict density. ARC's Tier 1 mixes constraints,
   procedures, environment context, and project state — categories where inter-category conflict
   detection degrades 18% relative to intra-category (ConInstruct benchmark). The current
   8-document chain has not been audited for cross-document instruction conflicts.

2. **Procedural content vulnerability.** Detailed workflow procedures (imperative, instruction-like)
   carry significantly higher distraction risk than factual/narrative content. The full
   process-task-loop in Tier 1 may be a higher-risk inclusion than environment context or project
   state, which are narrative and less susceptible to instructional confusion.

**What the evidence cannot answer:**

- Whether ARC's specific Tier 2 mechanism ("make agent aware, load on demand") works as designed.
  No published research tests this exact pattern. The closest analogue — agentic RAG with metadata
  indexing — uses search-driven discovery rather than pre-announced awareness. ARC's approach is
  plausible but empirically unvalidated.

---

## 1. Repository-Level Context Files

### 1.1 The Gloaguen Study

**Source:** [Gloaguen et al. (2026)][gloaguen], "Evaluating AGENTS.md: Are Repository-Level
Context Files Helpful for Coding Agents?"

**Methodology:** Dual evaluation — (1) SWE-bench with auto-generated context files following
standard recommendations, and (2) a novel dataset of repositories with developer-committed
(human-authored) context files. Multiple coding agents and LLMs tested.

**Key findings:**

- Human-authored context files: **+4% average task success** (with significant model variance —
  Sonnet 4.5 showed -2%). Statistical significance uncertain.
- LLM-generated context files: **-3% average task success**, actively harmful. Inference costs
  increased by **>20%** in both conditions.
- **Behavioral mechanism:** context files increased agent exploration scope (more testing, broader
  file traversal), but this additional work was "ultimately counterproductive."
- Human-authored files were most effective when minimal and essential — unnecessary requirements
  made tasks harder.

**Limitations:** Tested only monolithic single-file context (AGENTS.md). No ablation on volume,
no category-level analysis, no test of multi-document or tiered loading, no test of on-demand
retrieval. Heavy Python bias in repositories.

**What this means for ARC:** The study tests a fundamentally different architecture (single
monolithic file) than ARC's tiered model. The finding that prescriptive, heavy context causes
unfocused exploration is a caution signal, but doesn't indict structured multi-document approaches.
The +4% / -3% results may reflect content quality more than architectural choice.

### 1.2 Practitioner Perspectives

**Source:** [Hacker News discussion][hn-thread] on Gloaguen et al.

Key themes from practitioners:

- **"Why > what"** — domain knowledge about design *decisions* outperforms procedural instruction
  that restates what the code already shows. The most effective context captures hard-won lessons
  ("we tried X and it broke"), not code summaries.
- **Nested/progressive disclosure** — multiple practitioners reported better outcomes with
  per-feature or per-subsystem context files rather than a single monolithic AGENTS.md.
- **Volume threshold** — <200 lines suggested as a practical clarity threshold per file.
- **Reactive authoring** — add guidance only after observing agent failures, not preemptively.
  Test whether revisions improve outcomes before committing them.
- **Specification over instruction** — deterministic guardrails (AST checks, pre-commit hooks)
  enforce compliance more reliably than instruction-following. Instructions degrade; constraints
  don't.

---

## 2. Instruction Volume and Conflict Thresholds

This section addresses **RQ1: Is there a point where upfront context volume degrades
instruction-following? Does ARC's ~8 document chain approach that threshold?**

### 2.1 Instruction Count Degradation

**Sources:** [IFScale benchmark][ifscale] (Jaroslawicz et al., 2025), [ManyIFEval][manyifeval]
(Harada et al., 2025)

The critical finding: **instruction count, not token count, is the primary degradation driver.**

- Best frontier models achieve only **68% accuracy at 500 instructions** (IFScale).
- GPT-4o drops from **0.94 accuracy (1 instruction) to 0.21 accuracy (10 instructions)**
  on ManyIFEval.
- Three distinct model-specific degradation patterns:
    - **Threshold decay:** near-perfect until a critical density, then sharp drop (reasoning
      models: o3, Gemini 2.5 Pro)
    - **Linear decay:** steady decline per added instruction (GPT-4.1, Claude Sonnet 4)
    - **Exponential decay:** rapid collapse (GPT-4o, Llama-4-Scout)

**Implication for ARC:** The relevant metric for Tier 1 is not "how many tokens do 8 documents
consume" but "how many distinct instructions/constraints do they collectively impose." A
Tier 1 audit should count effective instruction density, not just document count or token volume.

### 2.2 Instruction Conflict as Degradation Driver

**Source:** [ConInstruct][coninstruct] (2025) — conflict detection and resolution in instructions.

- **Intra-constraint conflicts** (within same category): 92.7% detection accuracy.
- **Inter-constraint conflicts** (between categories): 74.6% detection — **18 percentage
  point drop.**
- Only Claude 4.5 Sonnet explicitly acknowledges conflicts 45% of the time; most models
  exhibit "Conflict Unacknowledged" behavior — they silently pick one instruction over another.

**What this means for ARC:** Tier 1 combines documents from different categories (project identity,
behavioral constraints, quality rules, workflow procedures, environment context, session state).
Each category can introduce constraints that conflict with constraints in other categories.
The inter-category detection gap means these conflicts are more likely to be silently
misresolved than conflicts within a single document.

### 2.3 Effective Context Saturation

**Sources:** [Effective Context Length study][effective-length], IBM token optimization guidance,
practitioner reports.

- Practical effective context capacity: **60-70% of advertised limits.**
- Meaningful degradation begins around **8,000-16,000 tokens** despite 200K+ windows.
- Well-structured 16K-token prompt with RAG **outperformed monolithic 128K-token prompt** in
  both accuracy and relevance.
- Models demonstrate effective context length **less than 50% of training length.**

**Reinforcement from behavioral evidence:**

- Behavioral constraints show "prompt hardening" challenges — reinforced constraints erode
  gradually across session history regardless of initial emphasis.
- Prompt hardening does **not prevent** gradual erosion; accumulated context dilutes
  reinforced instructions over time.
- System prompts are best suited for "high-level context, tone, behavior guidelines,
  constraints" — not detailed task state or procedures.

---

## 3. Instruction Category Effectiveness

This section addresses **RQ2: Do different content categories show different effectiveness
profiles when loaded upfront vs. on-demand?**

### 3.1 Constraint Category Performance Hierarchy

**Source:** [WildIFEval][wildifeval] (2025) — instruction following evaluation across constraint
categories.

Performance hierarchy from easiest to hardest for LLMs to follow:

1. **Focus/emphasis constraints** (highest success) — soft, content-related guidance
2. **Include/avoid constraints** — distributed semantic space, variable but manageable
3. **Style constraints** — model-dependent variance (e.g., Qwen struggles with persona)
4. **Format constraints** — explicit structural requirements, predictable difficulty
5. **Length constraints** (lowest success) — exact counts consistently fail across models
6. **Structure constraints** — complex organizational requirements, compounds difficulties

**What this means for ARC:** Not all Tier 1 content categories are equally "expensive" to the
model's instruction-following capacity. Rules/constraints (categories 1-2 above) are relatively
well-handled. Workflow procedures that impose structural or length requirements (categories 5-6)
are harder. This suggests the cost of including a document in Tier 1 depends on its constraint
*type*, not just its length.

### 3.2 Instructional Distraction Vulnerability

**Source:** [Instructional Distractions study][distractions] (2025) — LLM performance when
instruction-like content appears in input.

Task accuracy with distracting instruction-like input:

| Task Type              | Accuracy with Distracting Input |
|------------------------|---------------------------------|
| Mathematical Reasoning | 0.738 (resistant)               |
| Code Generation        | 0.612 (moderate)                |
| Style Transfer         | 0.301 (vulnerable)              |
| Question Answering     | 0.051 (catastrophic)            |

**Key mechanism:** models follow embedded instruction-like patterns in input instead of their
actual task instructions. Procedural content (step-by-step workflows, imperative instructions)
is more "instruction-like" and thus more vulnerable to this confusion. Factual/narrative content
(environment descriptions, project state) is less susceptible.

**What this means for ARC's Tier 1 categories:**

- **(a) Constraints/rules** — moderate risk; these are true instructions but typically short and
  declarative. Performance depends on conflict density (see § 2.2).
- **(b) Environment context** — low risk; narrative, factual. QUICK-REFERENCE.md and AGENT-BRIEFING.PROJECT.md
  project overview sections are safe Tier 1 candidates.
- **(c) Workflow procedures** — **high risk**; imperative, step-by-step, instruction-like. The
  full process-task-loop is the highest-risk document in Tier 1 by this measure.
- **(d) Project state** — low risk; temporal snapshots, factual. CURRENT-SESSION.md is a safe
  Tier 1 candidate.

### 3.3 System vs. User Prompt Separation

**Sources:** [PromptLayer guidance][promptlayer], [PromptHub analysis][prompthub], vendor
documentation.

Converging guidance on content placement:

- **System prompts** are best suited for: high-level context, tone, behavior guidelines,
  operational constraints — content that persists across turns.
- **User prompts** are best suited for: specific tasks, immediate context, examples, dynamic
  content — content that changes per interaction.
- Separating the two reduces ambiguity and instruction conflict.

**Relevance:** ARC's Tier 1 documents span both categories — some are persistent constraints
(DEV-RULES.ARC, DEV-RULES.PROJECT, AGENT-BRIEFING.PROJECT.md) and some are session-specific state (CURRENT-SESSION.md, active
task context). The evidence suggests these should ideally occupy different prompt positions, though
ARC's current delivery mechanism (sequential reads into the conversation) doesn't distinguish
between system-level and session-level content.

---

## 4. Structured vs. Monolithic Context Delivery

This section addresses **RQ4: Does structured, multi-document loading perform differently than
a single monolithic context file?**

### 4.1 Instruction Hierarchy Framework

**Source:** [The Instruction Hierarchy][instruction-hierarchy] (OpenAI, ICLR 2025),
[Instructional Segment Embedding][ise] (2024).

- Models can be trained to assign different **priority levels** to instruction categories:
  system-level (highest), user-level (medium), data/third-party (lowest).
- This is not merely organizational — models with explicit hierarchy **resolve conflicts by
  priority** rather than treating all instructions equally.
- Instructional Segment Embedding (ISE) categorizes instructions by role (system=0, user=1,
  data=2), enabling hierarchical conflict resolution.
- Models with explicit hierarchy become more robust against instruction confusion from
  lower-priority content.

**What this means for ARC:** The three-tier model maps naturally to instruction hierarchy:
Tier 1 = system-level (highest priority), Tier 2 = domain-level (medium), Tier 3 = reference
(lowest). Making this priority explicit — not just implicit through loading order — could
strengthen the architecture. Currently ARC's tiers are defined by *when* content loads, not by
*priority* when conflicts arise.

### 4.2 Progressive Disclosure

**Sources:** [Progressive disclosure for AI agents][progressive-disclosure] (Feb 2026),
[Will Larson on agent architecture][larson], [Claude Skills documentation][claude-skills].

Converging practitioner pattern:

- **Progressive disclosure** delivers information incrementally, revealing deeper detail only
  when needed. Multiple independent sources (Larson, Medium 2026, Claude Skills, agentic RAG
  frameworks) converge on this as the preferred architecture.
- Claude Skills exemplifies: model receives skill summaries/metadata upfront; full skill
  content loads only when the skill is activated. Just-in-time dependency resolution triggers
  additional loads only when a primary skill is already active.
- Agents discover metadata → inspect structure → retrieve targeted sections → fall back to
  full content only when necessary.
- No downside reported in any source; clear token efficiency gains documented.

**What this means for ARC:** Tier 2 (indexed, on-demand) aligns with this pattern. The
STRATEGY-INDEX.md read during session-init functions as metadata awareness; strategy documents
load when the agent enters a relevant domain. This is a validated architecture.

### 4.3 Positional Bias Evidence

**Sources:** [Position is Power][position-power] (FAccT 2025), vendor placement guidance
(see [context degradation research][context-degradation] § 2 for full vendor analysis).

- Models exhibit **recency bias** (attention to recent tokens) and **primacy bias** (attention
  to initial tokens). Both are documented across models.
- In long prompts, attention dilutes across more tokens, weakening the influence of
  instructions in the middle.
- Instructions placed at **both beginning AND end** outperform single placement.
- Position frequency in training data: indices in early range (≤1024 of 2048 training length)
  account for **>80%** of all position indices; far-range indices (1536+) constitute **<5%**.

**What this means for ARC:** Within Tier 1, document **ordering matters**. The most critical
constraints should appear early (primacy) or late (recency) in the loading sequence. Documents
in the middle of the chain receive less attention weight. ARC's current session-init ordering
(AGENT-BRIEFING.PROJECT.md → agent-specific → DEV-RULES.ARC → DEV-RULES.PROJECT → index → quick-ref →
process-task-loop → CURRENT-SESSION → task list) places behavioral constraints early and
session state late — this is roughly aligned with the evidence, though it hasn't been
deliberately optimized for positional effects.

---

## 5. On-Demand Loading and Indexing Patterns

This section addresses **RQ3: Does making an agent *aware* that documentation exists (Tier 2)
actually result in appropriate on-demand consultation?**

### 5.1 Agentic RAG Model

**Sources:** [LlamaIndex agentic retrieval][llamaindex], [Weaviate agentic RAG][weaviate],
[NVIDIA agentic RAG comparison][nvidia-rag], [Glean agentic RAG][glean].

The agentic RAG pattern represents the production state of the art for on-demand context:

- Retrieval is an **adaptive, sequenced operation embedded in the reasoning loop** — not a
  static preprocessing step.
- Agents dynamically assess what's needed: determine which sources to query, how to refine
  context, how to sequence retrieval steps.
- At each iteration, the agent evaluates current state and decides: query retriever, invoke
  external tool, store/retrieve from working memory, or generate output.
- Selective memory loading ranks stored chunks for relevance and reintroduces only the most
  informative content.

**Key distinction from ARC's Tier 2:** Agentic RAG agents **discover what they need through
search**, not through pre-announced awareness. The agent doesn't know document X exists until
it searches and finds it. ARC's Tier 2 inverts this — the agent is told document X exists
during session-init and is expected to load it when relevant.

### 5.2 Progressive Disclosure in Practice

**Source:** [Claude Skills architecture][claude-skills], [MCP progressive disclosure][mcp-pd].

The Claude Skills model provides the closest analogue to ARC's Tier 2:

- Agent receives **skill summaries** (metadata) upfront.
- Full skill content loads only when the skill is activated by the agent's reasoning.
- Just-in-time dependency resolution: references in one skill trigger loading of related skills.
- This is metadata-awareness + on-demand loading — similar to ARC's STRATEGY-INDEX → strategy
  document pattern.

### 5.3 Gap: Awareness Without Loading

No published research directly tests the pattern "tell an agent that document X exists but
don't load it; measure whether the agent retrieves it at the right moment."

The closest evidence:

- **Claude Skills:** metadata awareness + agent-triggered loading works in practice, but within
  a purpose-built framework with explicit activation mechanisms.
- **Agentic RAG:** search-driven discovery works without pre-awareness, suggesting pre-awareness
  may not be strictly necessary.
- **Practitioner experience (ARC's own):** ARC has operated with Tier 2 indexing for multiple
  work units. Anecdotally, agents do consult strategy documents when entering relevant domains —
  but systematic measurement is absent.

**Assessment:** ARC's Tier 2 mechanism is plausible and has practitioner analogues, but lacks
direct empirical validation. The risk is not that it fails catastrophically — the risk is that
awareness erodes over long sessions (consistent with the general finding that instructions
degrade over accumulated context) and agents stop consulting Tier 2 content when they should.

---

## 6. Mid-Session Context Refresh

This section addresses **RQ5: Is there evidence for or against mid-session context re-reading?**

### 6.1 Long-Session Degradation Reports

**Sources:** Practitioner bug reports from [Claude Code][cc-23620], [Gemini CLI][gemini-5252],
[OpenAI Codex][codex-8310].

Documented failure modes in long sessions:

- **Compaction loss:** when context is automatically compressed/summarized mid-session, agents
  lose awareness of team members, can't coordinate, and fail to acknowledge capabilities they
  previously had ([Claude Code #23620][cc-23620]).
- **Task intent loss:** when a session hits usage limits and resumes, the agent frequently fails
  to continue the requested task ([OpenAI Codex #8310][codex-8310]).
- **Context staleness:** accumulated context dilutes reinforced instructions, causing gradual
  behavioral drift even without explicit compaction.

### 6.2 Prompt Caching as Stability Mechanism

**Sources:** [Prompt caching guide][prompt-caching-1], [DigitalOcean caching][prompt-caching-2],
[Paged Attention analysis][prompt-caching-3].

- Prompt caching reuses previously computed key-value tensors for identical prompt prefixes,
  skipping redundant computation.
- Vendor-native: providers cache internal state for static portions (system instructions,
  reference documents). Cache retention: 5-10 minutes default, up to 24 hours with
  extended retention.
- **Architectural implication:** place static content at the beginning of the prompt; vendors
  automatically cache these portions. Only dynamic/session-specific content at the end requires
  fresh processing each turn.

**What this means for ARC:** Tier 1 documents that are static within a session (AGENT-BRIEFING.PROJECT.md,
DEV-RULES.ARC, DEV-RULES.PROJECT) benefit from prompt caching automatically when placed
early. Explicit mid-session re-reading of these documents is unlikely to add value beyond what
caching already provides — and could consume context window budget unnecessarily.

### 6.3 Gap: Refresh Interval Evidence

No peer-reviewed research tests optimal refresh intervals or compares periodic re-prompting
against continued context accumulation.

Practitioner workarounds for drift include:

- Replace long history with a `[SESSION RECAP]` summary to reset focus.
- User-initiated `/refresh` commands to safely re-inject session context.
- Starting a new conversation entirely when drift becomes unrecoverable.

**Assessment:** ARC's existing "Core Document Reference Protocol" (re-read QUICK-REFERENCE or
DEV-RULES.PROJECT when triggered by specific conditions) is a reasonable heuristic. The evidence
neither strongly supports nor contradicts it. Prompt caching makes static-document refresh
largely redundant; the protocol's value is primarily for documents whose relevance is
*situational* (e.g., re-reading commit standards before a complex commit).

---

## Bottom Line Assessment

### Assessment Against ARC's Three-Tier Model

**Tier 1 (Upfront, mandatory read): Validated with caveats.**

The principle of loading critical constraints before work begins is sound — the cost of
discovering violated rules mid-task exceeds the cost of upfront loading. However:

- **Instruction density matters more than document count.** The relevant metric is not "8
  documents" but the collective instruction/constraint count and inter-category conflict
  potential. IFScale shows frontier models degrade significantly at high instruction counts;
  ConInstruct shows cross-category conflicts are detected 18% less reliably.
- **Not all categories carry equal cost.** Environment context and project state (narrative,
  factual) are cheap to include. Behavioral constraints are moderate. Detailed workflow
  procedures (imperative, instruction-like) are the most expensive and carry the highest
  distraction risk.
- **Ordering within Tier 1 matters.** Positional bias evidence supports placing the most
  critical constraints early and late in the loading sequence, with lower-priority informational
  content in the middle.

**Tier 2 (Indexed, on-demand): Aligned with industry patterns, empirically unvalidated.**

The strategy-index → on-demand loading pattern matches progressive disclosure (Claude Skills,
agentic RAG, practitioner consensus). No published research directly tests "pre-announced
awareness with deferred loading," but the closest analogues (metadata-first architectures)
work in production. The risk is awareness erosion over long sessions — agents may stop
consulting Tier 2 content as accumulated context dilutes the initial index awareness.

**Tier 3 (Discoverable via search): Uncontroversial.**

Search-driven discovery for low-frequency reference material is standard practice across
all agentic frameworks studied. No evidence suggests this content should be surfaced
differently.

### Evidence-Supported Design Principles

Five principles emerge from the research with sufficient evidence to guide design decisions:

1. **Audit for instruction conflict, not just volume.** Count distinct constraints across Tier 1
   documents and check for cross-category conflicts. The inter-category detection gap (18% per
   ConInstruct) means silent misresolution is the likely failure mode.

2. **Differentiate by content category.** Environment context and project state are low-cost
   Tier 1 inclusions. Behavioral constraints are moderate-cost. Detailed workflow procedures
   should be evaluated for Tier 2 demotion — brief procedural references in Tier 1 with full
   detail loaded on-demand.

3. **Optimize Tier 1 ordering for positional bias.** Place mission-critical constraints in
   primacy (early) and recency (late) positions. Place informational/contextual content in the
   middle of the loading sequence.

4. **Prefer hierarchy over flat loading.** Making priority levels explicit (not just implicit
   through load order) helps models resolve conflicts correctly. ARC's tiers currently define
   *when* content loads, not *what takes precedence* when instructions conflict.

5. **Leverage prompt caching for Tier 1 stability.** Place static Tier 1 content at the
   beginning of the prompt prefix. Vendor caching handles persistence across turns. Reserve
   explicit re-reading for situational triggers, not periodic refresh.

### Remaining Uncertainties

1. **ARC's specific Tier 2 mechanism.** No published research validates "pre-announced
   awareness with deferred loading." Practitioner analogues exist but ARC's implementation
   is novel. Empirical measurement within ARC (does the agent actually consult strategy docs
   when it should?) would be the most reliable evidence.

2. **Optimal Tier 1 composition.** The evidence provides principles (low-conflict, category-aware,
   position-optimized) but not a specific threshold for ARC's 8-document chain. Whether
   process-task-loop belongs in Tier 1 or should be demoted to Tier 2 is a design question
   that the evidence informs but doesn't resolve definitively.

3. **Cross-session coherence.** Evidence on multi-session coherence with handoff documents
   (CURRENT-SESSION.md) is emerging but not comprehensive. ARC's session handoff model is
   reasonable but unmeasured.

4. **Model-specific behavior.** Degradation patterns vary significantly by model (threshold
   decay vs. linear vs. exponential). ARC's guidance is model-agnostic; agent-specific files
   (CLAUDE.ARC.md, etc.) may need model-specific Tier 1 composition advice as evidence matures.

---

## Sources

### Peer-Reviewed Academic Research

1. [Evaluating AGENTS.md: Are Repository-Level Context Files Helpful for Coding
   Agents?][gloaguen] — Gloaguen et al., 2026
2. [How Many Instructions Can LLMs Follow at Once?][ifscale] — Jaroslawicz et al., 2025
   (IFScale benchmark)
3. [When Instructions Multiply: Measuring and Estimating LLM Capabilities of Multiple
   Instructions Following][manyifeval] — Harada et al., 2025 (ManyIFEval benchmark)
4. [WildIFEval: Instruction Following in the Wild][wildifeval] — 2025
5. [LLMs can be easily Confused by Instructional Distractions][distractions] — 2025
6. [ConInstruct: Evaluating LLMs on Conflict Detection and Resolution in
   Instructions][coninstruct] — 2025
7. [The Instruction Hierarchy: Training LLMs to Prioritize Privileged
   Instructions][instruction-hierarchy] — OpenAI, ICLR 2025
8. [Position is Power: System Prompts as a Mechanism of Bias in Large Language
   Models][position-power] — FAccT 2025
9. [Instructional Segment Embedding: Improving LLM Safety with Instruction
   Hierarchy][ise] — 2024
10. [A Multi-Dimensional Constraint Framework for Evaluating and Improving Instruction
    Following in LLMs][constraint-framework] — 2025
11. [Why Does the Effective Context Length of LLMs Fall Short?][effective-length] — 2024

### Vendor and Practitioner Guidance

12. [Progressive Disclosure: the technique that helps control context and tokens in AI
    agents][progressive-disclosure] — Feb 2026
13. [Building an internal agent: Progressive disclosure and handling large
    files][larson] — Will Larson
14. [Agent Skills — Claude API Documentation][claude-skills]
15. [Agentic Retrieval Guide: Beyond Naive RAG][llamaindex] — LlamaIndex
16. [What is Agentic RAG?][weaviate] — Weaviate
17. [Traditional RAG vs. Agentic RAG][nvidia-rag] — NVIDIA
18. [Agentic RAG explained][glean] — Glean
19. [Progressive Disclosure for Knowledge Discovery in Agentic Workflows][mcp-pd]
20. [Token optimization: The backbone of effective prompt engineering][ibm-tokens] — IBM
21. [System Prompt vs User Prompt in AI][promptlayer] — PromptLayer
22. [System Messages and User Messages in Prompt Engineering][prompthub] — PromptHub
23. [LLM Instruction Placement in Prompts][placement] — practitioner analysis

### Long-Session and Caching Evidence

24. [Prompt Caching in LLMs: Cutting Costs While Boosting Speed][prompt-caching-1]
25. [Prompt Caching Explained][prompt-caching-2] — DigitalOcean
26. [How prompt caching works][prompt-caching-3] — Paged Attention analysis
27. [How to Reset LLM Context and Refresh Prompts][refresh-guide]

### Practitioner Bug Reports (Long-Session Failures)

28. [Claude Code #23620: Agent team lost on context compaction][cc-23620]
29. [Gemini CLI #5252: User-controlled session refresh][gemini-5252]
30. [OpenAI Codex #8310: Session resume loses task intent][codex-8310]

### Community Discussion

31. [Hacker News discussion on Gloaguen et al.][hn-thread]

---

[context-degradation]: research-context-degradation.md
[gloaguen]: https://arxiv.org/abs/2602.11988
[hn-thread]: https://news.ycombinator.com/item?id=47034087
[ifscale]: https://arxiv.org/abs/2507.11538
[manyifeval]: https://arxiv.org/abs/2509.21051
[wildifeval]: https://arxiv.org/abs/2503.06573
[distractions]: https://arxiv.org/abs/2502.04362
[coninstruct]: https://arxiv.org/abs/2511.14342
[instruction-hierarchy]: https://arxiv.org/abs/2404.13208
[position-power]: https://arxiv.org/abs/2505.21091
[ise]: https://arxiv.org/abs/2410.09102
[constraint-framework]: https://arxiv.org/abs/2505.07591
[effective-length]: https://arxiv.org/abs/2410.18745
[progressive-disclosure]: https://medium.com/@martia_es/progressive-disclosure-the-technique-that-helps-control-context-and-tokens-in-ai-agents-8d6108b09289
[larson]: https://lethain.com/agents-large-files/
[claude-skills]: https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview
[llamaindex]: https://www.llamaindex.ai/blog/rag-is-dead-long-live-agentic-retrieval
[weaviate]: https://weaviate.io/blog/what-is-agentic-rag
[nvidia-rag]: https://developer.nvidia.com/blog/traditional-rag-vs-agentic-rag-why-ai-agents-need-dynamic-knowledge-to-get-smarter/
[glean]: https://www.glean.com/blog/agentic-rag-explained
[mcp-pd]: https://medium.com/@prakashkop054/s01-mcp03-progressive-disclosure-for-knowledge-discovery-in-agentic-workflows-8fc0b2840d01
[ibm-tokens]: https://developer.ibm.com/articles/awb-token-optimization-backbone-of-effective-prompt-engineering/
[promptlayer]: https://blog.promptlayer.com/system-prompt-vs-user-prompt-a-comprehensive-guide-for-ai-prompts/
[prompthub]: https://www.prompthub.us/blog/the-difference-between-system-messages-and-user-prompts-in-prompt-engineering
[placement]: https://medium.com/@lars.chr.wiik/llm-instruction-placement-in-prompts-it-matters-a-lot-3b57580756ee
[prompt-caching-1]: https://medium.com/@reddysureshcmc/prompt-caching-in-llms-cutting-costs-while-boosting-speed-7250833a1019
[prompt-caching-2]: https://digitalocean.com/community/tutorials/prompt-caching-explained
[prompt-caching-3]: https://sankalp.bearblog.dev/how-prompt-caching-works/
[refresh-guide]: https://skywork.ai/blog/how-to-reset-llm-context-refresh-prompts-guide/
[cc-23620]: https://github.com/anthropics/claude-code/issues/23620
[gemini-5252]: https://github.com/google-gemini/gemini-cli/issues/5252
[codex-8310]: https://github.com/openai/codex/issues/8310
