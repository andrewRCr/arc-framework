# Research: Planning Document Lifecycle and Pre-Requirements Practices

**Purpose:** Evidence base for Task 3.2 — codifying ARC's planning pipeline convention,
creating a PRD template, and evaluating discovery step improvements (Gap 11).

**Research scope:** Pre-requirements planning artifacts in software methodology, progressive
elaboration patterns, design doc and RFC processes, discovery and scoping techniques, PRD
template practices, and the codification spectrum (when structure helps vs. hurts).

**ARC-anchored framing:** ARC's current lifecycle shape (backlog → plan-\* → PRD → tasks)
is assumed to be right-sized. Research looks for proven improvements _within_ each stage,
not additional stages or ceremony.

**Date:** 2026-02-26

---

## Executive Summary

The research converges on a consistent finding: successful planning methodologies apply
**increasing structure as fidelity increases**, with exploratory phases deliberately kept
lighter than execution phases. The pre-requirements space (ARC's plan-\* docs) benefits
most from _input quality guardrails_ (discovery checklists, required problem framing) rather
than _output templates_ (mandatory sections, structural requirements).

**Key findings:**

- Major tech companies (Google, Amazon, Stripe) and open-source projects (Rust, Ember)
  all use pre-requirements artifacts — but structure varies dramatically by phase
- The strongest evidence favors codifying **what questions to ask** over **what format to
  write in** — discovery quality predicts downstream quality more than document structure
- Progressive elaboration is well-established: artifacts should match their fidelity stage,
  and premature formalization actively harms exploration
- PRD templates have shifted toward shorter, problem-focused formats — ARC's 9-section
  template is well-aligned with modern practice
- The codification spectrum has a clear pattern: light structure for exploration, medium
  for decisions, heavy for execution — and the value curve flattens quickly in the
  exploratory phase
- Shape Up's "pitch" concept is the closest analogue to ARC's plan-\* docs: concrete
  enough to direct work, abstract enough to preserve solution space

---

## 1. Pre-Requirements Artifacts: Industry Patterns

### 1.1 Design Docs as Standard Pre-Implementation Practice

Design documents are the dominant pre-requirements artifact at major tech companies.
They serve dual purposes: **alignment through discussion** and **permanent rationale
record**.

**Google** uses design docs as standard practice before implementation. Typical sections:
Overview, Motivation, Goals/Non-Goals, Alternatives Considered, Detailed Design,
Security/Privacy Considerations. The review process ranges from lightweight (comment
threads) to heavyweight (formal review meetings), scaled to the change's impact.

Sources: [Design Docs at Google][google-design-docs],
[Writing Technical Design Docs, Revisited][tech-design-docs]

**Amazon** has a well-documented "document culture" where meetings start with reading a
document. Documents are treated as living artifacts that evolve as understanding matures —
not frozen specifications. PRDs serve as "guardrails and accumulated knowledge."

Source: [The Document Culture of Amazon][amazon-docs]

**Industry-wide pattern** (Bitrise, BrowserStack, Hudl, and others): lightweight
implementation plans or design proposals before medium-to-large projects, focused on
dependencies, cost implications, and high-level approach — not detailed specifications.

Sources: [Pragmatic Engineer: RFCs and Design Docs][pe-rfcs-design],
[Pragmatic Engineer: RFC and Design Doc Examples][pe-rfc-examples]

**Confidence:** Well-established across multiple organizations. The specific formats vary
but the pattern — structured pre-implementation document — is universal at scale.

### 1.2 RFC Processes: Lightweight Pre-Decision Artifacts

RFC (Request for Comments) processes originated in standards bodies (IETF) and have been
widely adopted by open-source language communities as a mechanism for proposing and vetting
technical decisions before implementation.

**Rust's RFC refinement (2016)** is particularly instructive. The original process was
perceived as too heavy, so it was refined to be "more accessible and more scalable" by:

- Enabling lightweight early feedback on **motivation** before requiring a full design
- Introducing Final Comment Period (FCP) as a clear decision point — triggered when
  "enough tradeoffs have been discussed that the subteam is in a position to make a
  decision," not when all uncertainty is eliminated
- Accepting that many RFCs are closed or postponed, and that's normal

Source: [Refining Rust's RFCs][rust-refine], [The Rust RFC Book][rust-rfc-book]

**Common RFC graduation path:**

1. RFC created with problem statement and proposed solution
2. Discussion period (weeks): alternatives explored, trade-offs surfaced
3. Final Comment Period: announced when reviewers are ready to decide
4. Disposition: merge (approved), close (rejected), or postpone
5. Implementation tracked separately

**Key insight:** RFCs are explicitly about _whether_ and _how_, not _what the user needs_.
They're a decision process with async discussion, distinct from requirements gathering.

**Confidence:** Well-established in open-source; adopted by some companies. The pattern
is proven for architectural decisions but heavier than needed for routine feature planning
in small teams.

### 1.3 Development Methodology Approaches

**Shape Up (Basecamp)** provides the closest analogue to ARC's plan-\* docs. The "shaping"
phase produces a **pitch** — not a detailed spec:

- Summarizes problem, constraints, and solution at rough level
- Identifies "rabbit holes" (risks) and limitations explicitly
- Concrete enough to give direction, abstract enough to let teams solve it
- Deliberately avoids premature detailed design that constrains solution space

The pitch is the gate between exploration and commitment. Work doesn't get "bet on" (their
term for scheduling) until a pitch is shaped well enough to de-risk without over-specifying.

Sources: [Shape Up: Introduction and Principles][shapeup],
[7 Lessons from Trialling Shape Up][shapeup-lessons]

**Agile/Scrum** handles the exploration-to-commitment transition through sprint planning and
backlog refinement, but provides less guidance on pre-sprint exploration artifacts. The gap
ARC is addressing (formalizing pre-requirements exploration) is one that Agile frameworks
tend to leave to team practice.

**Confidence:** Shape Up is a single-company methodology with growing adoption. Its shaping
concept is well-documented and conceptually proven, though less battle-tested than
Google-style design docs.

---

## 2. Progressive Elaboration and Fidelity Stages

### 2.1 The Fidelity Spectrum

Progressive elaboration (a foundational PMBOK concept) is the practice of increasing detail
as understanding deepens. Artifacts naturally evolve through fidelity levels:

| Fidelity Stage | Artifact Type    | Detail Level                     | ARC Analogue  |
| -------------- | ---------------- | -------------------------------- | ------------- |
| Napkin sketch  | Backlog item     | Problem + rough scope            | Backlog entry |
| Working draft  | Plan/design doc  | Exploration, alternatives, risks | plan-\* doc   |
| Specification  | PRD/requirements | Structured, acceptance criteria  | PRD           |
| Implementation | Task breakdown   | Step-by-step, quality gates      | Task list     |

**Key principle:** Each stage's documentation should match its fidelity level. Requiring
PRD-level structure in a plan-\* doc is premature formalization; leaving a PRD at plan-\*
fidelity is under-specification.

Sources: [Progressive Elaboration in Project Management][prog-elab-info],
[Progressive Elaboration (NTask)][prog-elab-ntask]

### 2.2 What to Capture Early vs. Defer

**Capture early (high signal, low cost):**

- Problem statement and motivation ("why this, why now")
- Alternative approaches considered (even briefly)
- Key unknowns and assumptions
- Dependencies on other work
- Rough scope (T-shirt size)

**Defer until PRD (premature at plan stage):**

- Detailed acceptance criteria
- Exhaustive edge cases
- Implementation approach specifics
- Non-functional requirements beyond known constraints
- Success metrics (need scope clarity first)

**Confidence:** Well-established in project management literature; confirmed in software
planning practices.

### 2.3 Graduation Criteria: When a Plan Is "Ready"

The research converges on **readiness signals** rather than formal approval gates:

**From RFC practice:** Ready when "enough tradeoffs have been discussed that [reviewers are]
in a position to make a decision" — not when all uncertainty is eliminated.

**From design doc practice:** Ready when alternatives are explored and trade-offs justified,
key assumptions documented, dependencies identified, stakeholder concerns addressed.

**What does NOT signal readiness:**

- Approval by a single authority (should involve discussion)
- Exhaustive detail ("just barely good enough" is the target)
- Zero open questions (unknowns should be identified, not hidden)

**Confidence:** Well-established in RFC/design doc communities. Less formally documented
for pre-PRD artifacts specifically, but the principle is consistent.

### 2.4 Many-to-One Patterns

Multiple exploration artifacts can feed a single PRD. The plan-\* → PRD relationship is
inherently many-to-one: separate research tracks, design explorations, and spike results
converge into one specification. This is normal and expected — the PRD synthesizes; it
doesn't replace the exploration that preceded it.

---

## 3. Discovery and Scoping Techniques

### 3.1 Structured Discovery: The Strongest Lever

The research strongly suggests that **discovery quality is the highest-impact variable** in
planning effectiveness. Better questions early produce better specifications downstream.

**Core technique: open-ended discovery questions.** Avoiding yes/no answers and probing
for context, constraints, and assumptions. The best insights come from follow-up questions,
not initial responses.

Sources: [Open-Ended Questions: The Key to Discovery][open-ended-qs],
[30 Essential Product Discovery Questions][discovery-qs-30]

**Critical discovery questions (adapted for software planning):**

- What problem are we actually solving? (not "what feature do we need?")
- Why is this important to solve now? What's the cost of not doing it?
- Who benefits and how?
- What's the minimum viable version?
- What could cause this to fail?
- What are we explicitly not doing?
- What assumptions are we making?

Sources: [Requirements Gathering Guide][reqs-gathering],
[Discovery Sessions Explained][discovery-sessions],
[10 Questions for Requirements Gathering][sherwen-10-qs]

### 3.2 Pre-Mortem Analysis

**Technique:** Imagine the project has failed. Each participant generates reasons why it
failed. Consolidate into risk mitigations.

**Evidence:** Research from Wharton/University of Colorado indicates pre-mortems increase
ability to predict future outcomes by approximately 30%. The mechanism: it breaks groupthink
by making it safe to voice concerns, and surfaces risks that optimism bias hides.

Sources: [Pre-mortem (Wikipedia)][premortem-wiki],
[How a Premortem Analysis Derisks a Project][premortem-zeitspace],
[Proactive Planning for Contextual Fit (PMC)][premortem-pmc]

**Confidence:** Well-established technique with research backing. Overhead is modest (1-2
hours for a team session) but may be disproportionate for small/solo work. More valuable
for technically risky or architecturally significant work.

### 3.3 AI-Specific Discovery Patterns

AI agents face a specific risk in discovery: rushing to generate output without sufficient
exploration. Teams using AI for requirements analysis report better outcomes when the AI is
explicitly prompted to:

- Ask clarifying questions before drafting
- Identify gaps and inconsistencies in stated requirements
- Probe assumptions and trade-offs
- Suggest risks (mini pre-mortem)

Sources: [Using AI for Requirements Analysis (ThoughtWorks)][tw-ai-reqs],
[AI in Requirements Gathering][ai-reqs-gathering]

**Confidence:** Emerging practice. ThoughtWorks case study is a single source but aligns
with broader patterns in prompt engineering. The directional finding (AI benefits from
explicit discovery prompts) is well-supported.

**ARC relevance:** High. ARC's create-prd workflow has a discovery step (Step 3) that
currently provides question categories but no structured discovery protocol. The agent
risk of shallow scoping is exactly the gap this research addresses.

---

## 4. PRD Template Practices

### 4.1 Modern PRD Evolution

PRD practice has shifted significantly in recent years:

- **Shorter and more focused** — away from exhaustive specification toward problem
  clarification and shared understanding
- **Problem-first framing** — emphasis on "why" over "what," with explicit "why now"
- **Structured as narrative** — readable like a blog post, not a dense requirements matrix
- **Agile-compatible** — focused on direction and constraints, not frozen specifications

Sources: [Product Requirements Documents: A Modern Guide][modern-prd-guide],
[PRD Document Template in 2025][prd-2025],
[How to Write a PRD (Perforce)][perforce-prd],
[Product Requirements Document (Atlassian)][atlassian-prd]

### 4.2 Effective Section Patterns

Modern PRD templates converge on similar sections, with emphasis varying by work type:

1. **Problem & Purpose** — what and why, including "why now"
2. **Users/Personas and Use Cases** — grounded in research/data, not assumptions
3. **Goals and Non-Goals** — explicit scope boundary
4. **Requirements** — often prioritized (P0/P1/P2 or MoSCoW)
5. **Design Approach** — key decisions, not exhaustive design
6. **Success Criteria** — measurable, not aspirational
7. **Assumptions and Dependencies** — validated vs. risky
8. **Open Questions** — distinguished by resolution timing

### 4.3 Anti-Patterns

**"Kitchen sink" PRDs** — trying to be both requirements and implementation spec.
Requirements should define _what_ and _why_; implementation details belong in task
planning and design docs.

**Frozen specifications** — treating the PRD as immutable once written. Modern practice
treats PRDs as living documents with controlled change processes.

**Generic user stories** — "As a user, I want..." without grounding in actual user
research or specific data.

**Confidence:** Well-established consensus across product management sources (2024-2025).

### 4.4 ARC's Current PRD Template Assessment

ARC's 9-section template (Introduction, Goals, User Stories/Use Cases, Requirements,
Non-Goals, Technical Considerations, Design Considerations, Success Criteria, Open
Questions) is well-aligned with modern practice. The sections map cleanly to the
consensus pattern above.

**Potential improvements suggested by research:**

- **Introduction**: Add explicit "why now" framing alongside problem statement
- **Requirements**: Consider explicit P0/P1/P2 prioritization (currently implicit)
- **Success Criteria**: Strengthen measurability guidance
- **Assumptions**: Not currently a named section — could be valuable to surface and
  distinguish validated vs. risky assumptions
- **Open Questions**: Distinguish "resolve before starting" vs. "will emerge during work"

These are marginal improvements, not structural gaps. The template is sound.

---

## 5. The Codification Spectrum: When Structure Helps vs. Hurts

### 5.1 The Core Tension

The research reveals a consistent pattern across methodologies: **the value of
codification follows a curve that flattens quickly in exploratory phases and steepens
in execution phases**.

**Structure helps when:**

- Preventing miscommunication and scope creep
- Ensuring critical questions get asked (not skipped)
- Coordinating across team members or time (handoffs)
- Onboarding newcomers to a process
- Capturing decisions and rationale for future reference

**Structure hurts when:**

- Over-codifying exploration (template fatigue, constrains creative thinking)
- Freezing decisions too early (locks in assumptions before validation)
- Introducing bureaucratic gates (turns iterative work into waterfall)
- Requiring detailed specs before understanding is mature

### 5.2 The Tiered Approach

Multiple sources converge on adaptive rigor matched to change magnitude:

- **Lightweight** for small, bounded changes — minimal ceremony
- **Standard** for medium, team-scoped changes — documented approach
- **Heavyweight** for large, cross-team, or architecturally significant work — full
  process with alternatives and review

This prevents "template fatigue" (over-documenting trivial changes) and "process gaps"
(under-documenting complex ones).

Sources: [Pragmatic Engineer: RFCs and Design Docs][pe-rfcs-design],
[Refining Rust's RFCs][rust-refine]

**Confidence:** Emerging consensus, explicitly documented in multiple sources. The
principle is well-established even where the specific tiers vary.

### 5.3 What's Worth Codifying at Each Stage

**Definitely codify (high value, low overhead):**

- Naming conventions for planning artifacts
- Required problem/motivation framing (even a paragraph)
- Discovery checklist (critical questions that must be asked)
- Readiness signals for stage transitions
- Ephemeral nature and archival expectations

**Potentially codify (medium value, depends on context):**

- Light template with guiding questions (available, not mandatory)
- Alternatives-explored requirement
- Assumption documentation
- Pre-mortem for complex/risky work

**Leave freeform (structure adds cost without proportional value):**

- Exploration narrative and working notes
- Sketches, diagrams, rough ideas
- Dead ends and rejected approaches (mention briefly, don't archive separately)
- Discussion threads and iteration history

**Avoid codifying (high cost, low or negative value):**

- Formal approval gates for exploration artifacts
- Detailed acceptance criteria at plan stage
- Mandatory templates that constrain freeform thinking
- Implementation task breakdowns before requirements crystallize

### 5.4 Documentation-Driven Development Insight

The "just barely good enough" (JBGE) principle from documentation-driven development:
documentation at each stage should match the stage's fidelity level. Working documents
(plans, sketches, notes) are intentionally ephemeral and low-fidelity. Permanent records
(PRDs, design docs) should be high-fidelity and discoverable.

**Implication for plan-\* docs:** They're working documents. The point is to explore, not
to produce a final artifact. Graduation to PRD = formalization. It's expected and healthy
for plan-\* docs to be archived or discarded once the PRD exists — they've served their
purpose.

Sources: [Documentation-Driven Development (gist)][ddd-gist],
[What's Documentation-Driven Development?][ddd-medium]

---

## 6. Implications for ARC

### 6.1 What the Findings Suggest About Plan-\* Docs

**The plan-\* phase maps to the "working draft" fidelity stage.** It sits between backlog
items (problem identified) and PRDs (requirements crystallized). The research supports
codifying _just enough_ to ensure quality exploration without constraining freeform thinking.

**Highest-value codification opportunities:**

1. **Formal documentation of what already exists tacitly** — plan-\* docs are ephemeral
   working documents, they capture exploration that feeds PRDs, they can be archived after
   PRD creation, they have a many-to-one relationship with PRDs
2. **Discovery checklist** — 5-7 critical questions that must be addressed before a plan
   is "ready." This is the single highest-impact intervention the research supports
3. **Readiness signals** — lightweight criteria for when exploration has matured enough to
   crystallize into a PRD (not a gate, but guidance)
4. **Naming convention** — `plan-[descriptor].md` with category conveyed by directory
   placement (already the implicit pattern)

**Lower-priority but potentially valuable:**

5. **Optional guiding structure** — not a mandatory template, but "if you want structure,
   here are useful sections: Problem, Motivation, Alternatives, Unknowns"
6. **Alternatives-explored expectation** — even brief documentation of what else was
   considered prevents premature lock-in

### 6.2 What to Leave Freeform

- The exploration narrative itself — plan-\* docs should remain temporal scratchpads
- Internal organization and section ordering
- Level of detail (some plans need deep research; others are a page)
- Whether to create a plan-\* at all (small work may go straight to PRD)

### 6.3 PRD Template Observations

ARC's current template is well-aligned with modern practice. Marginal improvements:

- Explicit "why now" in Introduction
- P0/P1/P2 prioritization option for Requirements
- Assumptions section (or fold into Technical Considerations)
- Open Questions triage (pre-start vs. during-execution)

### 6.4 Discovery Step Observations

The create-prd workflow's Step 3 (Conduct Discovery) provides question categories but no
structured protocol. The research suggests the highest-impact improvement is a **discovery
checklist** — critical questions that must be addressed regardless of whether a plan-\*
exists. This is especially relevant for AI agents, who benefit from explicit prompts to
ask questions before generating.

### 6.5 The Codification Level Question

The research suggests ARC's plan-\* phase should land at the **"light structure" end** of
the spectrum — closer to "documented conventions with optional guidance" than "workflow
with templates and quality gates." The value is in:

- Making tacit knowledge explicit (so it survives contributor changes)
- Ensuring discovery quality (so PRDs start from solid foundations)
- Defining the lifecycle clearly (so plan docs don't accumulate as zombie artifacts)

The value is _not_ in:

- Imposing structure on exploration (which the research consistently warns against)
- Creating approval gates (which add ceremony without proportional value at this stage)
- Matching the rigor of task execution (which would over-formalize an inherently
  exploratory phase)

---

## Source Index

<!-- Industry design docs and RFC processes -->

[google-design-docs]: https://www.industrialempathy.com/posts/design-docs-at-google/
[tech-design-docs]: https://medium.com/machine-words/writing-technical-design-docs-revisited-850d36570ec
[amazon-docs]: https://justingarrison.com/blog/2021-03-15-the-document-culture-of-amazon/
[pe-rfcs-design]: https://newsletter.pragmaticengineer.com/p/rfcs-and-design-docs
[pe-rfc-examples]: https://newsletter.pragmaticengineer.com/p/software-engineering-rfc-and-design

<!-- RFC processes -->

[rust-rfc-book]: https://rust-lang.github.io/rfcs/
[rust-refine]: https://aturon.github.io/blog/2016/07/05/rfc-refinement/

<!-- Shape Up and methodologies -->

[shapeup]: https://basecamp.com/shapeup/
[shapeup-lessons]: https://www.mindtheproduct.com/7-lessons-from-trialling-basecamps-shape-up-methodology/

<!-- Progressive elaboration -->

[prog-elab-info]: https://project-management.info/progressive-elaboration-in-project-management/
[prog-elab-ntask]: https://www.ntaskmanager.com/blog/progressive-elaboration-in-project-management/

<!-- Discovery and scoping -->

[open-ended-qs]: https://salesplaybookb2b.com/open-ended-questions-the-key-to-discovery/
[discovery-qs-30]: https://usersnap.com/blog/product-discovery-questions/
[reqs-gathering]: https://nmgtechnologies.com/blog/requirement-gathering-solve-biggest-problems-consulting/
[discovery-sessions]: https://syndicode.com/blog/discovery-session-for-the-new-project-step-by-step/
[sherwen-10-qs]: https://www.sherwen.com/insights/10-questions-you-must-ask-during-requirements-gathering

<!-- Pre-mortem -->

[premortem-wiki]: https://en.wikipedia.org/wiki/Pre-mortem
[premortem-zeitspace]: https://www.zeitspace.com/blog/how-a-premortem-analysis-derisks-a-project-helping-your-team-succeed/
[premortem-pmc]: https://pmc.ncbi.nlm.nih.gov/articles/PMC12330140/

<!-- AI and requirements -->

[tw-ai-reqs]: https://www.thoughtworks.com/en-us/insights/blog/generative-ai/using-ai-requirements-analysis-case-study
[ai-reqs-gathering]: https://copilot4devops.com/ai-in-requirements-gathering-and-documentation/

<!-- PRD practices -->

[modern-prd-guide]: https://www.news.aakashg.com/p/product-requirements-documents-prds
[prd-2025]: https://www.kuse.ai/blog/insight/prd-document-template-in-2025-how-to-write-effective-product-requirements
[perforce-prd]: https://www.perforce.com/blog/alm/how-write-product-requirements-document-prd
[atlassian-prd]: https://www.atlassian.com/agile/product-management/requirements

<!-- Documentation-driven development -->

[ddd-gist]: https://gist.github.com/zsup/9434452
[ddd-medium]: https://buildwithandrew.medium.com/whats-documentation-driven-development-4b007f4de6a1
