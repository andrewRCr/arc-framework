# Architecture Decision Records (ADR) Methodology

**Version:** 1.1 | **Updated:** 2025-10-30

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
7. [Relationship to Strategy Documents](#relationship-to-strategy-documents)

---

## What Are ADRs

**Architecture Decision Record (ADR)** is a lightweight document that captures a significant architectural decision
along with its context and consequences.

**Core Principle:** Capture not just *what* was decided, but *why* it was decided and *what happens* as a result.

**Key Characteristics:**

- **Immutable:** Once accepted, an ADR is never edited - new ADRs supersede old ones if decisions change
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

- External API limitations (e.g., "TMDB list endpoints don't support filtering")
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

Every ADR follows this four-section structure:

### 1. Title

**Format:** `ADR-NNN: [Present-Tense Imperative Title]`

**Guidelines:**

- Use present tense imperative mood: "Use X", "Choose Y", "Implement Z"
- Describe the decision itself, not the problem
- Keep concise (under 10 words ideal)

**Examples:**

- ✅ `ADR-001: Use TMDB Discover Endpoint for Filtering`
- ✅ `ADR-002: Store JWT Tokens in HTTP-Only Cookies`
- ❌ `ADR-001: TMDB Filtering Problem` (describes problem, not decision)

### 2. Status

**Format:** Single line indicating current state

**Valid States:**

- `Proposed` - Decision under consideration, not yet implemented
- `Accepted` - Decision approved and implemented (or ready to implement)
- `Deprecated` - Decision no longer valid but not replaced
- `Superseded by ADR-XXX` - Decision replaced by a new ADR

**Note:** Once status is `Accepted`, the ADR should never be edited except to change status.

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

**Example ADR** (see adr-001-use-tmdb-discover-endpoint.md for complete structure)

---

## Naming Conventions

**File Naming Pattern:** `adr-NNN-short-title.md`

**Components:**

- `adr-` - Prefix for fuzzy finding and explicit type marking
- `NNN` - Three-digit sequential number (001, 002, 003, ...)
- `short-title` - Lowercase words separated by dashes

**Examples:**

- `adr-001-use-tmdb-discover-endpoint.md`
- `adr-002-jwt-cookie-authentication.md`
- `adr-003-client-side-filtering-for-data-quality.md`

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
4. ADR is now immutable - no further edits except status changes

### Deprecated

**When:** Decision no longer valid but hasn't been replaced

**Process:**

1. Update Status to Deprecated with brief explanation
2. Do NOT delete the ADR - historical record is valuable

**Example:**

```markdown
## Status

Deprecated - TMDB added filtering support to list endpoints as of API v4 (2026-03-15)
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

Use this template when creating new ADRs. Copy from `.arc/reference/adr/adr-template.md`.

```markdown
# ADR-NNN: [Short Title in Present Tense Imperative]

## Status

[Proposed | Accepted | Deprecated | Superseded by ADR-XXX]

## Context

Describe the forces at play (technical, business, project constraints) that are probably in tension.
This section should be neutral - just the facts about the problem space.

What is the issue that we're seeing that is motivating this decision or change?

If applicable, mention alternatives that were considered:

- **Option A**: Description and key characteristics
- **Option B**: Description and key characteristics
- **Option C (chosen)**: Description and key characteristics

## Decision

State the decision in full sentences, with active voice.
"We will ..."

Be specific about:

- What is being done
- Who/what is affected
- When this takes effect (if relevant)

This section should be short and definitive.

## Consequences

What becomes easier or more difficult as a result of this decision?
List both positive and negative consequences honestly.

### Positive

- List what improves
- Think about maintainability, clarity, performance, testability
- Consider impact on developers, users, operations

### Negative

- List what becomes harder or what we're giving up
- Be honest about trade-offs
- Consider long-term implications
- Mention increased complexity if relevant

### Risks (optional)

- List any concerns or risks that need monitoring
- Mention follow-up work if required
- Note dependencies on external factors
```

---

## Relationship to Strategy Documents

**Strategy Documents** (`.arc/reference/strategies/strategy-*.md`):

- Synthesized approaches to problem domains
- "How we think about X" (testing, type safety, API integration)
- Extracted from multiple experiences and decisions
- Updated as understanding evolves

**ADRs** (`.arc/reference/adr/adr-*.md`):

- Specific decisions made at a point in time
- "What we chose for X situation"
- Immutable once accepted
- Raw material that can inform strategies

**Relationship:**

- Multiple related ADRs may reveal patterns worth extracting into a strategy
- Strategy documents often reference ADRs as examples
- Writing ADRs helps identify when a strategy is needed

**Example Pattern:**

1. Write ADR-001 (TMDB discover endpoint), ADR-007 (Rate limiting), ADR-012 (Cache invalidation)
2. Notice pattern: "We keep making decisions about external API integration"
3. Extract: `strategy-api-integration.md` synthesizing principles across multiple ADRs
4. Strategy references specific ADRs as case studies

---
