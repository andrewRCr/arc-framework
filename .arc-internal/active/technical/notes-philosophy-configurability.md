# Notes: Core Philosophy & Configurability Architecture

**Purpose:** Working notes for WU1. Phases 1-3 notes were removed after absorption into
ADR-001/ADR-002. Phases 4-5 notes removed after absorption into ADR-003 through ADR-006.
One active section remains as input for Phase 6.

**PRD:** `prd-philosophy-configurability.md`
**ADRs:** `adr-001-define-core-identity-and-principle-method-boundary.md`,
`adr-002-session-model-and-agent-compatibility.md`,
`adr-003-design-configuration-and-extension-point-system.md`,
`adr-004-define-progressive-adoption-tiers.md`,
`adr-005-design-external-tool-platform-compatibility.md`,
`adr-006-establish-development-methodology-compatibility.md`

---

## Practical Benefits for Strategy Document (Requirement 10)

**Purpose:** Supporting arguments that strengthen the case for ARC's co-development model.
These are practical validations of what the three pillars predict — better suited to the
philosophy strategy document than the ADR itself.

**Rework reduction through early detection:** Catching issues at the review increment level
is dramatically cheaper than catching them after a large autonomous work block. The industry
is discovering that "agent produces PR, human reviews" leads to significant rework — the
review surface area is too large, issues compound, and often it's easier to redo than to fix.
ARC's model is essentially continuous integration of human judgment, preventing compound errors
from accumulating. Increased review increment frequency saves significant time on work-unit-level
review time and effort.

**Developer experience and engagement:** A documented burnout pattern is emerging where
developers feel reduced to rubber-stamp reviewers of AI output. They lose engagement, lose
context on their own codebase, and review quality degrades because disengaged review is
ineffective review. ARC's co-development model keeps the developer actively contributing and
learning — sustainable in a way that "review-only" is not.

**Maintainability and codebase familiarity:** Co-development means the developer was there
every step of the way during implementation. In days, weeks, or months when maintenance needs
arise, the developer has a feel for how the implementation works because they participated in
building it — not just reviewed the output. This allows leveraging AI speed without the codebase
becoming a black box. Delegation-based approaches risk producing code that no human deeply
understands, creating maintenance debt that compounds over time.

---
