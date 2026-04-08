# Strategy: Quality Gates

> **Guide and rationale:** [Quality Gates](https://andrewrcr.github.io/arc-framework/reference/quality-gates/)
> on the docs site covers the tiered system overview, escalation reasoning, and common pitfalls.

Operational specification for quality gate execution during development. Defines the tiered
checkpoint system, integration checkpoint identification, and task list integration patterns.

**Scope:** General ARC methodology. Project-specific test commands, tooling, and
component-to-test mappings belong in project documentation (QUICK-REFERENCE, testing
methodology strategy).

---

## Contents

- [Tiered Quality Gate System](#tiered-quality-gate-system) — what to run at each stage
- [Task List Integration](#task-list-integration) — checkpoint placement in task lists
- [When to Escalate Tiers](#when-to-escalate-tiers) — triggers for running more than the minimum
- [Relationship to Other Documentation](#relationship-to-other-documentation) — cross-references

---

## Tiered Quality Gate System

### Tier 1: Fast Incremental (Per-Task)

**When:** After completing any task (each checkbox), before marking it complete.

**What:**

- Type checking on modified files/directories
- Linting on modified files (with auto-fix)
- Format checking on modified files
- Related unit tests (tests for the code you changed)

**Time budget:** Seconds to ~1 minute

**Guidance:**

- Always run before marking a task complete
- Use targeted commands (specific files/directories), not full-project scans
- Fix issues immediately while context is fresh

---

### Tier 2: Integration Checkpoint (Coherent Unit Completion)

**When:**

- After completing a coherent unit of work — typically when all subtasks of a parent task are
  done, or when a standalone task (no subtasks) touches integration-relevant code
- When you've touched code that existing integration/E2E tests exercise
- Before moving from one major area of the codebase to another

**What:**

- Everything in Tier 1 (full project scope)
- Targeted E2E/integration tests for affected areas (when parent task touched E2E-tested code)
- Build verification

**Time budget:** 1-5 minutes

**Identifying integration checkpoints:**

1. **Component scope:** Did the completed work modify code that integration or E2E tests
   exercise? (e.g., request handlers, UI components, API endpoints, data pipelines)
2. **Behavior changes:** Did it change how something works (not just how it looks)?
3. **Cross-cutting changes:** Did it modify shared infrastructure (middleware, shared utilities,
   configuration, dependency injection)?
4. **If no integration/E2E relevance:** Skip targeted tests but still run full-project Tier 1
   checks + build.

**Running targeted integration/E2E tests:**

Don't run the full suite at Tier 2 — that's Tier 3. Instead:

- Run specific test files that cover the area you modified
- Run tests tagged for the feature area (if using a tag system)
- Use a minimal configuration for speed (full matrix is Tier 3)

Example patterns (project-specific commands vary):

```bash
# Run tests for a specific area
pytest tests/integration/test_auth_flow.py
npm run test:e2e -- e2e/tests/checkout.spec.ts

# Run tests matching a tag/grep pattern
pytest -m "payments" tests/integration/
npm run test:e2e -- --grep "@navigation"
```

---

### Tier 3: Full Suite (Per-Phase / Pre-PR)

**When:**

- After completing a phase (all tasks in the phase done)
- Before creating a pull request
- Final quality gate before merge

**What:**

- Full type checking (entire project)
- Full linting (entire project)
- Full format checking
- Full unit test suite
- Full integration/E2E test suite (all configurations)
- Build verification
- Markdown linting (for documentation changes)

**Time budget:** 5-15+ minutes (acceptable because it's infrequent)

**Guidance:**

- Never skip or partially run Tier 3
- If Tier 3 fails, fix before proceeding (see Quality gate failure in
  [DEV-RULES.ARC][dev-rules-arc])

**Commits and quality gates:** Tiers are milestone-driven, not commit-driven. Work committed
through the task loop inherits the gates already run at each milestone. For work outside the
task loop (incidental fixes, atomic tasks), run at least Tier 1 before committing.

---

## Task List Integration

When generating task lists, include appropriate quality gate checkpoints:

**Task level (implicit):**
Every task (each checkbox) implicitly includes Tier 1 checks before completion. No need to
list explicitly unless emphasizing a specific check.

**Coherent unit completion (implicit):**
Tier 2 checks run when you complete a coherent unit of work — all subtasks of a parent done,
or a standalone task that touches integration-tested code. This is documented in
[3_process-task-loop][process-task-loop].

**Phase level (explicit when relevant):**
Include explicit E2E/integration checkpoint tasks when a phase modifies E2E-tested code:

```markdown
### **Phase 3:** API Endpoint Changes

- [ ] **3.1 Modify authentication endpoint**
    - [implementation details]

- [ ] **3.2 Update rate limiting middleware**
    - [implementation details]

- [ ] **3.3 Run integration checkpoint**
    - Run auth integration tests: `pytest tests/integration/test_auth.py`
    - Fix any failures before proceeding to Phase 4
```

**Final phase (explicit):**
Task lists typically include a final "Testing & Quality" phase for Tier 3:

```markdown
### **Phase N:** Testing & Quality Gates

- [ ] **N.1 Run full test suite**
- [ ] **N.2 Run full integration/E2E suite**
- [ ] **N.3 Run all quality gates**
```

---

## When to Escalate Tiers

**Escalate from Tier 1 to Tier 2 when:**

- You're unsure if your changes affect E2E-tested behavior
- You've made changes across multiple components
- You're about to context-switch to a different area

**Escalate from Tier 2 to Tier 3 when:**

- You've completed a significant body of work spanning multiple tasks
- You're about to take a break or end a session
- You want high confidence before a major context switch

---

## Relationship to Other Documentation

- **[DEV-RULES.PROJECT][dev-rules-project]:** Defines the "zero tolerance" policy and lists
  required quality gates. References this strategy for tier guidance.
- **[3_process-task-loop][process-task-loop]:** Defines when quality gates run in the task
  execution workflow. References this strategy for what to run at each stage.
- **[2_generate-tasks][generate-tasks]:** Guidance on including quality checkpoint tasks in
  task lists. References this strategy for checkpoint placement.
- **QUICK-REFERENCE:** Project-specific commands for each tier. The authoritative source for
  "how to run" each check.
- **Project testing methodology:** Project-specific guidance on which test files cover which
  components, tag systems, and targeted test patterns.

---

[dev-rules-arc]: ../../constitution/DEV-RULES.ARC.md
[dev-rules-project]: ../../constitution/DEV-RULES.PROJECT.md
[process-task-loop]: ../../../system/workflows/arc/3_process-task-loop.md
[generate-tasks]: ../../../system/workflows/arc/2_generate-tasks.md
