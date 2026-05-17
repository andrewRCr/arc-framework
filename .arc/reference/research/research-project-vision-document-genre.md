# Research: Project-Scope Vision Document Genre Landscape

## Executive Summary

The "project vision wired to ongoing ceremony" role is **closest to the Agile product vision statement genre**
with strong structural parallels to **PMI project charters** (for minimal viable form) and **principles
documents** (like Google "10 Things" and Amazon Leadership Principles for the guidance layer). The core
tension is between the PMI/PRINCE2 "authorization-focused charter" (written once, rarely updated) and the
Agile "vision as living artifact" (collaboratively owned, evolving at business events). For ARC's use
case—small-to-large projects needing ceremony alignment without up-front vacuity—the optimal shape
combines: **(1) minimal Mission/Scope/Principles scaffold;** **(2) optional depth for elaborate
cases;** **(3) named, not numbered, principles with soft limit of 5-7;** **(4) explicit "Update Discipline"
section tracking when and why the document changes.** Anti-goals should be folded into the Scope section
(per PMI convention), not standalone, to avoid scope-creep inflation.

---

## 1. Genre Landscape and Fitness Analysis

### 1.1 PMI Project Charter

**Purpose**: Authorization document issued by executive sponsor; defines problem, scope, high-level
requirements, success criteria, and constraints. Typically 1-5 pages, completed in hours before team
assembly.

**Strengths**:

- Minimal viable form still provides alignment value (problem statement alone is substantial)
- Clear scope boundaries (in scope / out of scope) prevent ambiguity
- Backward-compatible with scaling: "if you don't know yet, charter the discovery phase"
- Explicit stakeholder authority clarifies decision rights
- Directly tied to execution: project manager gates all work against the charter

**Weaknesses**:

- Optimization for initial authorization, not ongoing alignment
- Limited emphasis on *values* or *principles*
- Typically written top-down, not collaboratively
- No explicit evolution/update discipline—assumes stable scope
- "Anti-goals" are implicit in scope boundary, not articulated
- No genre support for "ceremony-wired" alignment checks

**Verdict**: Core scaffold is sound; lacks vision-guide properties.

---

### 1.2 PRINCE2 Project Mandate

**Purpose**: Pre-project document (even pre-charter) articulating business case, objectives, outcomes, and
constraints. Refined through "Starting Up a Project" process before detailed initiation.

**Strengths**:

- Explicit focus on "why" (business case, outcomes, benefits)
- Assumes iterative refinement: mandate → brief → initiation docs
- Manages "don't know yet" by separating mandate (rough outline) from brief (refined detail)
- Clear articulation of assumptions and constraints

**Weaknesses**:

- Still authorization-focused, not principle-guided
- Less scalable to solo/small projects (heavyweight governance)
- Refinement path (mandate→brief→PID) is bureaucratic for ARC's lightweight culture
- No explicit principles/values layer

**Verdict**: Strong on iterative refinement; too governance-heavy for ARC's scale range.

---

### 1.3 Agile Product Vision Statement

**Purpose**: Concise narrative (1-3 sentences or structured template) capturing target customer, problem
solved, and differentiation. Collaboratively constructed; used to filter requirements and maintain focus.

**Key Templates**:

- **Geoffrey Moore elevator pitch**: "[Product] is for [target customer] who [need]. [Product] [key
differentiator]. Unlike [competitor], [unique value]."
- **Hypothesis statement**: "We believe by doing [action] for [customer], we'll [outcome]."

**Strengths**:

- Lightweight, scalable from 1 sentence to 1 page
- Collaboratively built (vs. top-down charter)
- Actively used in ceremony (backlog grooming, feature filtering)
- Clear "don't know yet" handling: incomplete vision is acceptable if core customer intent is stated
- Explicitly referenced in practice ("Does this feature align with our vision?")

**Weaknesses**:

- Too narrative; not structured enough for project-scope PRD
- No explicit scope boundaries or "out of scope"
- Lacks decision-authority clarity
- Principles layer is absent
- Hard to update formally without ceremony

**Verdict**: Strong on ceremony wiring and scalability; needs structure for project-scope formality.

---

### 1.4 Lean Canvas / Business Model Canvas

**Purpose**: Single-page visual framework for startup business model; nine sections covering problem,
solution, metrics, unfair advantage, and cost structure.

**Strengths**:

- Single-page constraint forces prioritization
- Handles "don't know yet" gracefully (blank cells are signals, not failures)
- Explicitly includes both positive (solution, metrics) and negative (cost structure, unfair advantage)
- Visual layout aids memory and reference
- Lean Canvas (Ash Maurya variant) emphasizes risk and metrics over features

**Weaknesses**:

- Business-model focused, not suitable as PRD
- Customer segments / channels / revenue streams are orthogonal to engineering project scope
- No governance or principles layer
- Designed for startup ideation, not ongoing team alignment
- Assumes monetization context

**Verdict**: Strong model for startup vision; not applicable to ARC (covers wrong scope).

---

### 1.5 README as Vision (Open Source Pattern)

**Purpose**: Project README serves as entry point and implicit vision; governance docs (CONTRIBUTING,
Governance.md) link from it. Vision is implicit in project description.

**Strengths**:

- Single source of truth; visible to every user/contributor
- Minimal overhead: even a bulleted list is valuable
- Forces clarity for external audience
- Discovery-friendly (indexed, shared widely)

**Weaknesses**:

- Vision is implicit, not explicit; hard to cite for alignment
- No formal ceremony support or update discipline
- Works for small projects; doesn't scale to structured organizational context
- No principles or decision framework

**Verdict**: Useful pattern for small OSS projects; insufficient for ARC's ceremony and alignment needs.

---

### 1.6 Manifestos (Agile, Unix, etc.)

**Examples**: Agile Manifesto (4 values + 12 principles), Zen of Python (19 principles), Unix Philosophy
(McIlroy 4, Gancarz 9, Raymond expanded variants).

**Common Patterns**:

- Values stated as contrasts: "A over B, but not neglecting B"
- Principles often numbered; sometimes named (Agile: values + numbered principles; Zen: numbered with
pithy names; Unix: named principles, multiple variants)
- Emphasis on *how we think*, not *what we build*
- Stable over time (Agile Manifesto unchanged since 2001; Zen of Python frozen with intentional gap)

**Strengths**:

- High cultural impact when cited regularly
- Numbered + named identifiers are memorable
- Community consensus builds over time
- Scalable: a few core principles with commentary

**Weaknesses**:

- Optimized for *methodology* or *code philosophy*, not *project scope*
- Anti-goal: avoid designing a "manifesto culture" for every project
- No built-in ceremony integration
- No explicit scope or authorization layer

**Verdict**: Useful model for principles design; not suitable as standalone project PRD.

---

### 1.7 Principles Documents (Amazon, Google, Anthropic)

#### Amazon Leadership Principles

**Format**: 16 named principles (expanded from 14 in 2021-22). Identified by **name only** (e.g.,
"Customer Obsession," "Think Big"). No numbers, no codes.

**Citation Pattern**: Employees and interviewers cite by name: "That's a great example of
*Customer Obsession*" or "Let's check this against *Ownership*." Behavioral interview system is built
around the principles.

**Evolution**: Principles are *not* frozen. Amazon CEO Andy Jassy stated: "People change, competitive
dynamics change, products change, technology changes. The leadership principles are something you have
to constantly work at." Expansion from 14 to 16 was announced and absorbed into hiring/decision culture
with minimal friction.

**Integration**: Deeply wired into hiring, promotion, and decision-making at scale. Principles are
cited in code reviews, architectural discussions, and daily standups.

**Strengths**:

- Named identifiers are more memorable than numbers
- Explicit evolution culture: principles can grow with org
- Robust to renumbering (since there are no numbers)
- Stable set (16 is reachable for recall)

**Weaknesses**:

- No scope/authorization layer (purely normative)
- Designed for 500K+ employee org; overkill for tiny projects
- No methodology for "don't know yet"
- Requires executive sponsorship and hiring-system integration

**Verdict**: Excellent model for principles design; needs supplementation with scope/charter.

#### Google "10 Things We Know to Be True"

**Format**: 10 numbered principles with short names/taglines.

1. Focus on the user and all else will follow.
2. It's best to do one thing really, really well.
3. Fast is better than slow.
[etc.]

**Citation Pattern**: Referenced by number + title: "Principle 3 is 'Fast is better than slow'" or
colloquially "Principle 10: Great just isn't good enough."

**Evolution**: Document was written early in Google's life; has been "revisited from time to time" but
remains substantially unchanged. The framing is pragmatic, not dogmatic: "We have revisited this list
from time to time to see if it still holds true."

**Strengths**:

- Numbered + named: flexible citation (by number for brevity, by title for context)
- 10 principles is a reachable cognitive load
- Pragmatic tone ("revisited from time to time") allows evolution without ceremony
- Memorable, quotable phrasing

**Weaknesses**:

- Organized by number, not category; no inherent grouping
- "10" is somewhat arbitrary (why not 9 or 12?)
- No explicit evolution policy
- No scope or authorization layer

**Verdict**: Strong reference for principles design; number + name identifier pattern is practical.

#### Anthropic Constitutional AI

**Format**: Approximately 50+ principles organized into 6 thematic groups (UN Declaration-based,
Apple-inspired, non-Western perspectives, DeepMind-inspired, Anthropic research sets). Principles are
**not numbered or individually named**; stated as comparative choices ("Choose the response that...").

**Citation Pattern**: Principles are referenced by source group or approximation: "the UN
Declaration-based principle about brotherhood" or "one of the DeepMind-inspired safety rules." No
single-digit or name-based citation.

**Integration**: Used operationally to generate training signal for Claude's behavior, not for human
decision-making alignment.

**Strengths**:

- Thematic grouping aids understanding
- Source attribution provides legitimacy
- Scalable to many principles without cognitive overload (because grouped)
- Explicit diversity of values (non-Western, etc.)

**Weaknesses**:

- No citation mechanism suitable for human reference ("Which principle should we apply here?")
- Not designed for human ceremony or alignment check
- 50+ principles is too many to internalize
- No evolution policy stated

**Verdict**: Useful for diversity and source attribution; too large and unfocused for project-scope
principles.

---

### 1.8 OSS Governance / RFC-Based Constitutions

**Examples**: Rust RFC process, Linux kernel governance, OpenTitan RFC process.

**Common Pattern**:

- **Rust**: RFC process for substantial changes; core team makes final decision; leadership council
delegates to teams. Governance documented in RFC 1068 and linked from project page.
- **Linux**: Benevolent dictator (Linus Torvalds) with delegated authority to subsystem maintainers.
Governance implicit in kernel development process docs.
- **OpenTitan**: RFC process gates technical decisions; advisory board + TSC handles strategic.

**Strengths**:

- RFC process creates ceremony for major decisions
- Separates governance (who decides?) from vision/principles (why?)
- Scalable from solo-maintainer to council model
- Explicit decision authority

**Weaknesses**:

- RFC is for *change proposals*, not *project vision*
- Governance layer is separate from vision/mission
- No single "north-star" document; vision is implicit in project charter + governance
- Constitutional approach is heavyweight for small projects

**Verdict**: Strong for decision-process governance; does not replace project vision document.

---

## 2. Comparative Strengths and Gaps

| **Dimension** | **PMI Charter** | **Agile Vision** | **Principles Doc** | **Manifesto** |
| --- | --- | --- | --- | --- |
| Minimal viable form | ✓ (problem statement) | ✓ (1-3 sentences) | ✗ | ✗ |
| Scales to elaborate | ✓ | ✓ | ✓ | ✗ (fixed set) |
| Handles "don't know yet" | ✓ (charter the discovery) | ✓ (incomplete OK) | ✗ | ✗ |
| Wired to ceremony | ~ (gate control) | ✓ (active ref.) | ✓ (hiring/decisions) | ~ (cultural) |
| Scope boundaries | ✓ (in/out) | ~ (implicit) | ✗ | ✗ |
| Decision guidance | ~ (what, not why) | ✓ (why) | ✓ (why) | ✓ (why) |
| Explicit update discipline | ✗ | ✗ | ~ (Amazon: yes, informal) | ✗ |
| Principles identifier (named vs. #) | N/A | N/A | **Both** (Amazon, Google) | **#** (Agile, Zen) |
| Suitable for project-scope PRD | ✓ | ✗ (product-level) | ✗ (standalone) | ✗ |

---

## 3. Principles Design: Naming, Count, and Stability

### 3.1 Identifier Patterns

**Named-only** (Amazon): Memorable, avoids renumbering friction, cited colloquially. Downside: harder
to reference in formal docs ("See Principle #3" is clearer than "see the Ownership principle").

**Numbered-only** (Agile Manifesto, Zen of Python): Compact, formal, but awkward to renumber. Zen of
Python intentionally left slot 20 blank—a statement of "sparse is better than dense."

**Both** (Google "10 Things," many product vision templates): Flexible citation. Numbered for brevity,
named for context. Lowers cognitive load: "Remember Principle 3? 'Fast is better than slow.'"

**Grouped** (Anthropic Constitutional AI): Thematic groups substitute for numbering. Works for 50+
principles; unworkable for 5-10 (overhead).

**Verdict**: **Named + lightly numbered** is the practical sweet spot. Users can cite by name ("let's
check against Speed") or shorthand ("#2") in contexts where numbers are embedded in stable infrastructure
(e.g., training materials, internal wikis).

### 3.2 Principles Count

**Observed ranges**:

- **Unix Philosophy**: McIlroy (4), Gancarz (9), Raymond (17 rules grouped into larger categories)
- **Agile Manifesto**: 4 values + 12 principles
- **Amazon**: 16 Leadership Principles
- **Google**: 10 Things
- **Zen of Python**: 19 (intentional: packed, hard to recall all, but first 7-8 are canonical)
- **Anthropic Constitution**: 50+ (grouped by source; no expectation of human recall)

**Cognitive Load Research**: Working memory can sustain 5-9 items without external aids. Beyond 9, grouping
(categories, thematic buckets) is required.

**Industry Practice**: 5-7 principles is a *soft* sweet spot for projects/teams needing to internalize
and cite them conversationally. 10-12 works if the list is stable, well-named, and supported by
reference materials. 16+ requires strong organizational infrastructure (hiring system, internal wiki,
leadership coaching).

**Verdict**: **Recommend 5-7 core principles for ARC**. Soft limit: don't force projects into "exactly
6" but signal that more than 10 requires justification. Grouping (e.g., "delivery principles," "team
principles") is optional but helpful at 8+.

### 3.3 Stability and Evolution

**Amazon Model**: Explicit evolution culture. Expansion from 14 to 16 was announced; absorbed into hiring
without major ceremony. CEO stated principles are "not etched in stone" and require continuous work.

**Google Model**: Pragmatic evolution. Phrase is "revisited from time to time;" document is stable but
not immutable. No formal evolution policy.

**Agile Manifesto Model**: Frozen. Unchanged since 2001. Forking is discouraged; disputes are addressed
via interpretation (e.g., "Agile has been co-opted" debates), not revision.

**Zen of Python Model**: Intentionally incomplete (slot 20 left blank). Symbolic of philosophy (sparse
is better than dense). New principles can be proposed but face high bar.

**Verdict**: **Evolution policy should be explicitly stated and event-driven, not cadence-driven:**

- Changes triggered by: major release, scope shift, governance change, explicit team consensus
- Change mechanism: new version date-stamped, old version archived (not destroyed)
- Communication: principle additions/removals should be called out explicitly in release notes or team
updates

---

## 4. Scalability Patterns: Minimal to Elaborate

### 4.1 Minimal Viable Form

**What's the smallest project vision document that still provides ceremony alignment value?**

**Evidence**:

- PMI research: problem statement alone "answers one question: why does this project exist?" and is
"the single most important paragraph."
- Agile practice: vision statement of 1-3 sentences is sufficient to filter requirements.
- Open source pattern: even a bulleted list in README is better than nothing.
- Product vision empirical: teams often use vision templates to "pull honest thinking out of everyone's
heads and get it all on the table so you can understand where you agree."

**Minimum Viable Template** (fits on 1 screen):

```
# Project Vision

## Problem
[1-2 sentences: what is the problem this project solves?]

## Scope (In / Out)
**In**: [bulleted list of what we will do]
**Out**: [bulleted list of what we explicitly will NOT do]

## Key Principle(s)
[1-3 named principles that will guide decisions]
```

**Alignment Value**: This minimal form supports PRD ceremony checks: "Does this proposed feature fall in
our stated scope?" and "Does this decision align with Principle X?"

**Scalability Path**: Minimal form can be filled in collaboratively at project init; sections can be
elaborated over time (add "Mission," add "Design Tradeoffs," add more principles).

### 4.2 Elaborate Form

For projects with rich up-front vision (e.g., multi-year, multi-team, significant stakeholder diversity):

```
# Project Vision

## Mission
[Long form: purpose, vision, intended impact]

## Problem Statement
[Context, opportunity, business/user need]

## Scope
**In**: [detailed list of domains/areas we own]
**Out**: [explicit non-goals; what we are *not* doing]

## Principles
[5-7 named principles with 1-2 sentence explanations each]

## Design Tradeoffs
[Key decision: we chose A over B because...]
[Key decision: we chose X over Y because...]

## Success Criteria
[How do we know we've succeeded?]

## Update Discipline
[When and why we update this document]
```

### 4.3 "Don't Know Yet" Handling

**Problem**: Projects starting with uncertainty (requirements unclear, scope evolving, team uncertain)
will have vacuous filled-in templates if forced to provide complete answers.

**Evidence**:

- PMI guidance: "It's very likely that you will only have access to limited information. Don't worry if
you don't yet have all the information."
- PMI pattern: "If you don't know yet, charter the discovery phase" (charter the effort to clarify, not
the full project).

**Best Practice Pattern**:

1. **Required fields** (minimum viable): Problem, Scope (in/out), 1-2 Core Principles
2. **Optional fields** (elaborate): Mission, Design Tradeoffs, Success Criteria, Detailed Principles
3. **Explicit staging**: Version 0.1 (minimal, discovery-phase charter); Version 1.0 (refined after
discovery)
4. **Blanks are OK**: "TBD" or "Unclear; see discovery plan" are valid entries, not failures

**Anti-pattern**: Vacuous defaults ("Our mission is to build great software," "We value quality").
Instead, signal uncertainty: "Mission TBD pending customer research" or leave field blank.

---

## 5. Wiring to Ongoing Execution: Ceremony and Alignment

### 5.1 Real-World Citation Patterns

**Amazon Leadership Principles**: Cited explicitly in code reviews, architectural reviews, hiring
interviews, and promotion committees. Embedded in templates, checklists, and training. High bar to cite
a principle without substantiation.

**Google "10 Things"**: Cited in product strategy docs, OKR-setting, and public materials (e.g.,
privacy policy roots itself in "Focus on the user"). Less daily citation in engineering.

**Agile Manifesto**: Cited by value-statement name ("Individuals and interactions") in sprint
retrospectives and process disputes. Used as a reference to resolve methodology disagreements.

**PRD to Execution**: Research shows projects with clearly articulated vision have 2.5x higher success
rates (PMI Pulse of the Profession). However, 28% of projects fail due to inadequate vision,
suggesting that *articulation alone* is insufficient; vision must be actively referenced.

### 5.2 Ceremony Integration Patterns

**Ideal wiring** (from research and case studies):

1. **Project Initialization Ceremony**: Collaboratively build/refine vision document with core team +
sponsors. Agree on problem, scope, 2-3 core principles.

2. **PRD Review Gate**: At each major work-unit PRD, align to project vision: "Does this feature fall in
scope? Which principle(s) does it serve?"

3. **Architectural Review**: For significant decisions, reference principle: "This design choice
prioritizes Principle X (speed) over Y (compatibility)."

4. **Retrospectives / Milestones**: At periodic intervals (release, quarter, major pivot), review vision
against reality: "Did we stick to scope? Did our principles hold up?"

5. **Governance Events**: Scope creep, stakeholder conflict, or priority disputes are escalated to
"Does this align with our project vision and principles?"

**Anti-pattern**: Vision document written at init, filed away, never referenced except in onboarding.

### 5.3 Update Discipline

**Key Finding**: Vision documents that lack explicit update policy tend to languish. Those with
event-driven update triggers get used.

**Recommended Update Discipline Section**:

```
## Update Discipline

**This document is updated when:**
- Major scope shift (new problem domain added, significant out-of-scope exclusion)
- Release milestone or major version boundary
- Governance change (new principal sponsor, team restructure)
- Team consensus surfaces misalignment (principle not working, scope boundary unclear)

**This document is NOT updated for:**
- Per-feature decisions (those go in feature PRDs, not project vision)
- Team member changes
- Seasonal/cadence reviews (vision is intentionally stable between events)

**Update process:**
- Version number incremented (e.g., v1.0 → v1.1 for minor clarifications; v1.0 → v2.0 for scope
changes)
- Old version archived for reference
- Update reason documented in commit message or change notes
```

---

## 6. Anti-Goals Genre: Is It Needed?

**Question**: Should "Anti-Goals" be a top-level section?

**Evidence**:

**Pro-Anti-Goals-Section**:

- Explicit boundary-setting is psychologically powerful (teams remember what they're *not* doing)
- Prevents scope creep by forcing articulation of exclusions upfront
- Useful in stakeholder alignment: "We will *not* do X, so please stop asking"

**Anti-Anti-Goals-Section**:

- PMI convention: out-of-scope items are folded into "Scope" with explicit in/out boundary
- PRINCE2 convention: constraints and assumptions surface exclusions without need for separate section
- Agile practice: scope boundary is implicit in user stories + acceptance criteria
- Risk: adding "anti-goals" creates a junk drawer ("things we might do but decided not to")

**Real-world practice**: Most charters handle this with a "Scope / Out of Scope" duality, not separate
anti-goals section. Explicit out-of-scope list is more actionable than a separate "anti-goals" section.

**Verdict**: **Fold anti-goals into the "Scope" section as "Out of Scope" list.** Make it a peer to
"In Scope," not a separate section. This keeps the document compact and follows established conventions.

---

## 7. Recommended Template Shape for ARC

### 7.1 Top-Level Structure

```
# [Project Name] Vision

## Problem
[1-3 sentences: what problem does this project address?
Who is affected? Why does it matter?]

## Scope
### In Scope
[Bulleted or narrative: what domains/capabilities/responsibility does this project own?]

### Out of Scope
[Explicit non-goals: what are we explicitly NOT doing, even if requested?]

## Core Principles
[3-5 named principles. Format: "**Principle Name**: [1-2 sentence explanation of how we apply it.]"]

## [Optional: Design Tradeoffs]
[Format: "We chose A over B because..."]

## [Optional: Success Criteria]
[How will we know we've succeeded?]

## [Optional: Mission / Vision Statement]
[Longer-form purpose and intended impact]

## Update Discipline
[When and why this document changes]

---

Last updated: [DATE] | Version: [VERSION] | [Link to change log or archived versions if applicable]
```

### 7.2 Section Guidance

**Problem**: Actionable, specific. Not "improve development velocity" but "reduce time-to-deploy for
feature teams from 4 weeks to 1 week to enable rapid experimentation."

**Scope (In/Out)**: Clear ownership boundaries. In scope: "API design, client libraries." Out of scope:
"DevOps infrastructure, CI/CD."

**Core Principles**: Named, not numbered. Quotable. Relevant to decision-making. Examples:

- "Speed over comprehensive documentation—we unblock with 80% info"
- "User feedback drives design—we ship, observe, iterate"
- "Maintainability is non-negotiable—no technical debt trades"

**Design Tradeoffs**: *Optional*. Useful for projects that have already made significant architectural
decisions. Format: "We chose [choice] over [alternative] because [reason], accepting [tradeoff]."

**Update Discipline**: *Required*, not optional. Explicit policy prevents document rot.

### 7.3 Minimum Viable Version (for tiny projects)

```
# [Project] Vision

## Problem
[1-2 sentences]

## Scope (In/Out)
[Bulleted]

## Key Principle
[1-3 named principles or a single organizing principle]

## When We Update This
[Simple statement: "When scope or core principle changes"]
```

This fits on one page (with generous whitespace) and takes 30 minutes to collaboratively draft.

---

## 8. Principles-Section Design Guidance

### 8.1 Identifier Convention

**Recommendation**: **Named principles with optional lightweight numbering in stable, fixed
infrastructure.**

**Pattern**: Use names as primary identifier. If document is embedded in a system where users might cite
by number (e.g., internal wiki, training module), add numbers in that system, but don't publish numbers
in the primary source document. This avoids renumbering pain if principles are added/removed.

**Example**:

```
## Core Principles

- **Speed**: We prioritize getting feedback quickly over comprehensive planning.
- **Maintenance**: Code clarity and test coverage are non-negotiable.
- **User Feedback**: Customer data and usage patterns drive prioritization.
```

Citation in PRD or code review: "This aligns with *Speed*" or "we need to check *Maintenance*."

### 8.2 Count Recommendation

**Soft guidance:**

- **Minimum**: 1 principle (viable but thin)
- **Target**: 3-5 principles (memorable, substantive guidance)
- **Maximum sustainable**: 7-10 (without grouping)
- **Above 10**: Add thematic grouping (e.g., "Delivery Principles," "Team Principles") to reduce
cognitive load

**Arbitrariness is OK**: "Why 5?" is fine to answer with "Our team can reliably recall and cite 5.
More than 7 and people stop remembering them."

### 8.3 Stability and Evolution Rules

**Principle: Stability with intentional evolution.**

- **Principles are not frozen** but are not arbitrarily updated
- **Addition trigger**: New principle is added when team discovers a recurring decision conflict not well
addressed by existing principles
- **Removal trigger**: Principle is removed if it's repeatedly cited but never actually followed, or
explicitly superseded
- **Renaming trigger**: Principle is renamed if the name becomes misleading due to scope/context change
- **Version tracking**: Treat principle changes as version bumps (v1.0 → v2.0 for significant change; v1.0
→ v1.1 for clarification)

---

## 9. Open Questions Requiring Human Judgment

Before ARC finalizes the template, address these:

1. **Minimum field requirements**: Should "Problem" and "Scope" be mandatory, or can projects start with
just "Principle"? (Recommendation: require at least Problem + Scope + 1 Principle, but allow
others to be TBD.)

2. **Principle authorship**: Should principles be prescribed by ARC (templates like "Speed, Maintainability,
Feedback") or fully generative (teams write their own from scratch)? (Recommendation: provide examples
and a process template, not prescriptive list.)

3. **Update ceremony**: When should projects review and potentially update their vision? Event-driven
only, or periodic check-in? (Recommendation: pure event-driven; avoid "annual review" cadence.)

4. **Scope depth**: For tiny projects, how detailed should in/out scope be? Single bullet points, or
narrative? (Recommendation: flexible; let projects choose; show both patterns in guidance.)

5. **Integration with ARC other layers**: How does this vision document relate to ARC constitution doc
and strategy docs? Clear separation or intentional overlap? (Recommendation: vision is *project-specific
direction*; constitution is *how ARC development works across all projects*; strategy is *longer-term
codified guidance*. Vision is the only one that changes per-project.)

---

## 10. Recommendations Summary

### 10.1 Recommended Template Shape

**See Section 7.1** for full structure. Minimal version:

- **Problem**: Specific, actionable
- **Scope (In/Out)**: Clear boundaries, no separate anti-goals section
- **Core Principles**: 3-7 named, not numbered
- **Update Discipline**: Explicit event-driven update policy

Optional elaboration:

- **Design Tradeoffs**: For projects with major architectural decisions
- **Success Criteria**: For projects with clear success definition
- **Mission / Vision**: For projects needing longer-form purpose statement

### 10.2 Minimum Viable Form

One-page document (with whitespace):

```
## Problem
[2 sentences]

## Scope (In/Out)
- **In**: [2-3 bullets]
- **Out**: [2-3 bullets]

## Key Principles
[1-3 named principles with 1-sentence explanation each]

## Update Trigger
[One sentence: "We update this when scope or principle changes"]
```

Time to fill: 30 minutes collaborative draft.

**Alignment value**: Sufficient to gate PRD questions ("In or out of scope?") and principle checks
("Which principle does this serve?").

### 10.3 Principles-Section Design

- **Identifier**: Named, not numbered (avoids renumbering friction)
- **Count**: 3-5 core, soft cap at 7-10 without grouping
- **Evolution**: Explicit, event-driven update policy; not cadence-driven
- **Stability**: Resist churn but allow principled change (principle not working, scope/context changed)

### 10.4 Open Questions for Team Decision

1. Are principle templates suggested, or fully generative?
2. Is "Problem" mandatory, or can projects start with "Scope + Principle" if problem is self-evident?
3. Should old versions of the vision document be archived in .arc/, or just version-tracked in the
project repo?
4. How does vision-document evolution map to release versioning or commit messages?

---

## Sources

- [PMI Project Management Institute - Project Charter Template][pmi-charter]
- [PRINCE2 Project Mandate Documentation][prince2-mandate]
- [Agile Product Vision Statement Guide - Scrum Alliance][agile-vision]
- [Lean Canvas by Ash Maurya][lean-canvas]
- [Open Source Project Governance - GitHub Open Source Guides][oss-governance]
- [RFC Process - Rust Programming Language][rust-rfc]
- [Rust RFC 1068 - Rust Governance][rust-governance]
- [Linux Kernel Governance][linux-governance]
- [Google "10 Things We Know to Be True"][google-10things]
- [Amazon Leadership Principles - About Amazon][amazon-principles]
- [Zen of Python - PEP 20][zen-python]
- [Unix Philosophy - Wikipedia][unix-philosophy]
- [Agile Manifesto - agilemanifesto.org][agile-manifesto]
- [Constitutional AI - Anthropic][constitutional-ai]
- [Mozilla Firefox Vision Statement][firefox-vision]
- [Mozilla Manifesto and Governance][mozilla-manifesto]
- [Product Vision and Strategy Alignment][vision-alignment]
- [Project Vision Statement Adoption Barriers - PMI][vision-adoption]
- [Cognitive Load Theory - The Decision Lab][cognitive-load]

[pmi-charter]: https://www.pmi.org/learning/library/project-charter-template-improving-planning-process-1986
[prince2-mandate]: https://www.projex.com/prince2-project-mandate-what-is-it-exactly/
[agile-vision]: https://resources.scrumalliance.org/Article/write-product-vision-statement
[lean-canvas]: https://bmtoolbox.net/tools/lean-canvas/
[oss-governance]: https://opensource.guide/leadership-and-governance/
[rust-rfc]: https://rust-lang.org/governance/
[rust-governance]: https://rust-lang.github.io/rfcs/1068-rust-governance.html
[linux-governance]: https://docs.kernel.org/process/index.html
[google-10things]: https://about.google/company-info/philosophy/
[amazon-principles]: https://www.aboutamazon.com/about-us/leadership-principles
[zen-python]: https://peps.python.org/pep-0020/
[unix-philosophy]: https://en.wikipedia.org/wiki/Unix_philosophy
[agile-manifesto]: https://agilemanifesto.org/
[constitutional-ai]: https://www.anthropic.com/research/constitutional-ai-harmlessness-from-ai-feedback
[firefox-vision]: https://wiki.mozilla.org/Firefox/VisionStatement
[mozilla-manifesto]: https://www.mozilla.org/en-US/about/manifesto/details/
[vision-alignment]: https://planetganges.com/strategic-alignment-framework-vision-execution/
[vision-adoption]: https://www.pmi.org/learning/library/projects-supporting-vision-statement-5832
[cognitive-load]: https://thedecisionlab.com/reference-guide/psychology/cognitive-load-theory
