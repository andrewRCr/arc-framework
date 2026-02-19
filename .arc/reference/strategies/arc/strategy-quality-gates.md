# Strategy: Quality Gates

**Purpose:** Define the philosophy and methodology for quality gate execution during development. This strategy
establishes a tiered approach that balances thoroughness with development velocity.

**Scope:** General ARC methodology. Project-specific test commands, tooling, and component-to-test mappings
belong in project documentation (QUICK-REFERENCE, testing methodology strategy).

---

## Core Philosophy

Quality gates exist to catch problems early, when context is fresh and fixes are cheap. However, running
all checks after every change is wasteful - different checks have different costs and different value at
different stages of work.

**The goal:** Run *just enough* validation at each stage to catch likely problems, reserving comprehensive
checks for key milestones.

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

**Purpose:** Catch syntax errors, type mismatches, and broken unit-level behavior immediately. Fast feedback
loop keeps you in flow.

**Guidance:**

- Always run before marking a task complete
- Use targeted commands (specific files/directories), not full-project scans
- Fix issues immediately while context is fresh

---

### Tier 2: Integration Checkpoint (Coherent Unit Completion)

**When:**

- After completing a coherent unit of work — typically when all subtasks of a parent task are done,
  or when a standalone task (no subtasks) touches integration-relevant code
- When you've touched code that existing integration/E2E tests exercise
- Before moving from one major area of the codebase to another

**What:**

- Everything in Tier 1 (full project scope)
- Targeted E2E/integration tests for affected areas (when parent task touched E2E-tested code)
- Build verification

**Time budget:** 1-5 minutes

**Purpose:** Catch integration breakage at meaningful boundaries while context is still fresh. A coherent
unit of work — whether a parent task with all subtasks complete or a standalone task — represents a natural
checkpoint for broader validation.

**Guidance for identifying integration checkpoints:**

1. **Component scope:** Did the completed work modify code that integration or E2E tests exercise?
   (e.g., request handlers, UI components, API endpoints, data pipelines)

2. **Behavior changes:** Did it change how something works (not just how it looks)? Behavioral changes
   are more likely to break integration assertions.

3. **Cross-cutting changes:** Did it modify shared infrastructure (middleware, shared utilities,
   configuration, dependency injection)? These have wider blast radius.

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

**Purpose:** Comprehensive validation at major milestones. Phases represent significant bodies of work where
cross-cutting issues are most likely to surface. This is the "zero tolerance" gate — everything must pass
with no exceptions.

**Guidance:**

- Never skip or partially run Tier 3
- If Tier 3 fails, fix before proceeding (see Quality Gate Failure Protocol in DEVELOPMENT-RULES)
- Tier 3 failures after proper Tier 1/2 execution should be rare

**Commits and quality gates:** Tiers are milestone-driven, not commit-driven. Work committed through the
task loop inherits the gates already run at each milestone. For work outside the task loop (incidental
fixes, atomic tasks), run at least Tier 1 before committing.

---

## Task List Integration

When generating task lists, include appropriate quality gate checkpoints:

**Task level (implicit):**
Every task (each checkbox) implicitly includes Tier 1 checks before completion. No need to list
explicitly unless emphasizing a specific check.

**Coherent unit completion (implicit):**
Tier 2 checks run when you complete a coherent unit of work — all subtasks of a parent done, or a
standalone task that touches integration-tested code. This is documented in 3_process-task-loop.md.

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
- Your "gut feeling" says something might be broken

**Escalate from Tier 2 to Tier 3 when:**

- You've completed a significant body of work spanning multiple tasks
- You're about to take a break or end a session
- You want high confidence before a major context switch

**The cost of under-testing:** Discovering breakage later, with stale context, requiring time to reconstruct
what you changed and why.

**The cost of over-testing:** Slower development velocity, running checks that rarely catch anything.

**When in doubt:** Err toward running more checks. A few extra minutes of testing is cheaper than an hour
of debugging with forgotten context.

---

## Anti-Patterns

**❌ Skipping Tier 2 entirely:**
"I'll just run everything at the end." This leads to the painful scenario of many failures discovered
at once, each requiring context reconstruction.

**❌ Running full E2E at Tier 2:**
Running the complete integration/E2E suite (all configurations, all tests) after every task is
wasteful. Targeted tests provide the integration confidence you need in a fraction of the time.

**❌ Skipping Tier 1 to "save time":**
Tier 1 is seconds. Skipping it means type errors and lint violations accumulate, making Tier 3 cleanup
painful.

**❌ Treating Tier 3 as optional:**
"Tests were passing at Tier 2, so Tier 3 will be fine." Tier 3 catches cross-cutting issues that targeted
tests miss. It's mandatory, not optional.

---

## Relationship to Other Documentation

- **DEVELOPMENT-RULES:** Defines the "zero tolerance" policy and lists required quality gates.
  References this strategy for tier guidance.

- **3_process-task-loop:** Defines when quality gates run in the task execution workflow. References
  this strategy for what to run at each stage.

- **2_generate-tasks:** Guidance on including quality checkpoint tasks in task lists. References this
  strategy for checkpoint placement.

- **QUICK-REFERENCE:** Project-specific commands for each tier. The authoritative source for "how to run"
  each check.

- **Project testing methodology:** Project-specific guidance on which test files cover which components,
  tag systems, and targeted test patterns.
