# Strategy: ADR Methodology

## Purpose

Standards and guidance for documenting architectural decisions using Architecture Decision Records (ADRs).
This strategy ensures consistent capture of decision context, rationale, and consequences throughout
the project lifecycle.

ADRs serve as:

- Historical record of why decisions were made
- Reference for understanding system constraints
- Learning tool for new developers
- Input material for strategy documents

## Table of Contents

1. [What Are ADRs](#what-are-adrs)
2. [When to Write an ADR](#when-to-write-an-adr)
3. [ADR Format and Structure](#adr-format-and-structure)
4. [Naming Conventions](#naming-conventions)
5. [ADR Lifecycle](#adr-lifecycle)
6. [Template](#template)
7. [Amending Accepted ADRs](#amending-accepted-adrs)

---

## What Are ADRs

**Architecture Decision Record (ADR)** is a lightweight document that captures a significant architectural decision
along with its context and consequences.

**Core Principle:** Capture not just *what* was decided, but *why* it was decided and *what happens* as a result.

**Key Characteristics:**

- **Stable:** Once accepted, an ADR's decision is final — corrections and amendments are permitted but the
  decision itself changes only through [supersession](#superseded). See [Amending Accepted ADRs](#amending-accepted-adrs)
- **Sequential:** Numbered sequentially (001, 002, 003...), numbers never reused
- **Concise:** Typically 1-2 pages, focusing on decision and context, not implementation details
- **Discoverable:** Stored in version control alongside code, easily searchable

---

## When to Write an ADR

Write an ADR when a decision meets any of these criteria:

**1. Decision affects system structure or external contracts**

- Choosing between API endpoint patterns
- Selecting authentication mechanism
- Deciding on data modeling approach
- Defining integration patterns with external services

**2. Multiple alternatives were considered**

- Decision involved weighing trade-offs between options
- Example: "JWT in cookies vs localStorage vs sessions?"

**3. Decision driven by external constraint**

- External API limitations (e.g., "upstream API rate limit of 100 requests/minute")
- Regulatory requirements (e.g., GDPR data handling)
- Performance requirements (e.g., "must support 10k concurrent users")

**4. Future developers will ask "why did we do it this way?"**

- Non-obvious architectural choices
- Decisions that go against common patterns
- Workarounds for framework limitations

**5. Decision could be reversed later**

- If circumstances change, someone will need context to decide whether to reverse it

**Don't write an ADR for:**

- Tactical implementation choices (variable names, loop constructs, code organization)
- Decisions obvious from code (standard CRUD, framework conventions)
- Temporary or experimental choices

**Rule of Thumb:** If someone might want to change this decision in 6 months, they'll need context for why it was made.

---

## ADR Format and Structure

Every ADR follows this five-section structure:

### 1. Title

**Format:** `ADR-NNN: [Present-Tense Imperative Title]`

**Guidelines:**

- Use present tense imperative mood: "Use X", "Choose Y", "Implement Z"
- Describe the decision itself, not the problem
- Keep concise (under 10 words ideal)

**Examples:**

- ✅ `ADR-001: Use REST over GraphQL for Public API`
- ✅ `ADR-002: Store JWT Tokens in HTTP-Only Cookies`
- ❌ `ADR-001: API Filtering Problem` (describes problem, not decision)

### 2. Status

**Format:** Single line indicating current state

**Valid States:**

- `Proposed` - Decision under consideration, not yet implemented
- `Accepted` - Decision approved and implemented (or ready to implement)
- `Deprecated` - Decision no longer valid but not replaced
- `Superseded by ADR-XXX` - Decision replaced by a new ADR

**Note:** Once status is `Accepted`, the ADR's decision is final. Corrections and amendments are permitted
under specific rules — see [Amending Accepted ADRs](#amending-accepted-adrs).

### 3. Context

Explain the forces at play that motivated this decision.

**Include:**

- Technical constraints or limitations
- Business requirements
- External API or regulatory constraints
- Performance or scalability needs
- Alternatives that were considered

**Tone:** Neutral and factual - present the situation objectively

### 4. Decision

State clearly what was decided.

**Format:**

- Use active voice: "We will..."
- Be specific about what is being done, who/what is affected
- Short and definitive

### 5. Consequences

Document what becomes easier or harder as a result.

**Structure:**

- **Positive:** What improves (maintainability, clarity, performance)
- **Negative:** What becomes harder, trade-offs accepted
- **Risks (optional):** Concerns requiring monitoring, follow-up work

**Template:** See [template-adr.md](../../templates/template-adr.md) for the copy-ready starting point.

---

## Naming Conventions

**File Naming Pattern:** `adr-NNN-short-title.md`

**Components:**

- `adr-` - Prefix for fuzzy finding and explicit type marking
- `NNN` - Three-digit sequential number (001, 002, 003, ...)
- `short-title` - Lowercase words separated by dashes

**Examples:**

- `adr-001-use-rest-for-public-api.md`
- `adr-002-jwt-cookie-authentication.md`
- `adr-003-event-driven-notifications.md`

**Guidelines:**

- Numbers are never reused, even if an ADR is deprecated
- Numbers increment sequentially based on creation order
- Title should match (or abbreviate) the ADR's title section
- Keep title portion under 50 characters if possible

---

## ADR Lifecycle

### Proposed

**When:** ADR drafted but decision not yet finalized

**Process:**

1. Create ADR file with Status: Proposed
2. Commit to git
3. Discuss and update based on feedback
4. Update status to Accepted when finalized

### Accepted

**When:** Decision finalized and ready for (or already) implemented

**Process:**

1. Update Status from Proposed to Accepted
2. Ensure Context and Decision sections are complete
3. Commit alongside implementation (or just before starting)
4. ADR decision is now final — see [Amending Accepted ADRs](#amending-accepted-adrs) for what changes are permitted

### Deprecated

**When:** Decision no longer valid but hasn't been replaced

**Process:**

1. Update Status to Deprecated with brief explanation
2. Do NOT delete the ADR - historical record is valuable

**Example:**

```markdown
## Status

Deprecated - upstream API now supports native filtering as of v3.2 (2026-03-15)
```

### Superseded

**When:** Decision replaced by a new, different decision

**Process:**

1. Write NEW ADR documenting the new decision
2. Update old ADR status to `Superseded by ADR-XXX`
3. New ADR should reference old one in Context section

**Important:** Never delete deprecated or superseded ADRs - they document system evolution.

---

## Template

Copy from [template-adr.md](../../templates/template-adr.md) when creating new ADRs. The template includes
inline guidance for each section (Context, Decision, Consequences with Positive/Negative/Risks).

---

## Amending Accepted ADRs

An accepted ADR's **decision is final** — the Context, Decision, and original Consequences sections represent the
point-in-time record and should not be rewritten. However, strict "never touch the file" immutability creates
practical friction (typos persist, broken links accumulate, implementation learnings have nowhere to go).

ARC uses a three-tier model that preserves the spirit of immutability while accommodating real-world needs:

### Tier 1: Corrections — always permitted

Fix without ceremony. No new ADR required.

- Typos, grammar, and spelling errors
- Broken links and updated file paths
- Formatting fixes (markdown lint, whitespace)
- Correcting factual errors in metadata (dates, names)

**Rule:** The fix must not change the meaning of any section. If you're unsure whether a rewording changes
meaning, treat it as a Tier 2 amendment.

### Tier 2: Amendments — append-only with annotation

Add new information without altering what's already written. Amendments go in the Consequences section (or a
dedicated Amendments section if multiple accumulate) using a dated annotation:

```markdown
**Amendment (YYYY-MM-DD):** In practice, the batch size limit (Consequence #3) has not been
a concern — upstream API raised its limit to 500 in v4.1.
```

**What qualifies:**

- Post-implementation learnings that add context to consequences
- Clarifications prompted by questions from new team members
- Noting that a predicted risk did or did not materialize
- Cross-references to later ADRs or strategy documents

**What doesn't qualify** (use supersession instead):

- Changing the Decision section
- Rewriting Context to present a different framing
- Removing or contradicting original consequences

**Commit note:** Mention the amendment in the commit message (e.g., "amend ADR-007 with production
latency observations").

### Tier 3: Supersession — new ADR

When the decision itself changes, write a new ADR and update the original's status. This is the existing
[Superseded](#superseded) lifecycle process.

### Choosing the right tier

| Change                                      | Tier                                    |
| ------------------------------------------- | --------------------------------------- |
| Fix a typo in the Decision section          | Correction                              |
| Update a broken link to an external API doc | Correction                              |
| Note that a predicted risk didn't happen    | Amendment                               |
| Add a cross-reference to a new ADR          | Amendment                               |
| Reword the Decision for clarity             | Amendment (must not change meaning)     |
| Reverse or significantly alter the decision | Supersession                            |
| Choose a different technology than decided  | Supersession                            |

---
