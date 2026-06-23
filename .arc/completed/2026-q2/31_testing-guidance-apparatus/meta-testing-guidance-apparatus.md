# Metadata: testing-guidance-apparatus

| **State** | **Owner** | **Branch** | **Class** | **Priority** |
| --------- | --------- | ---------- | --------- | ------------ |
| `Shipped` | `andrew`  | [none]     | `Light`   | `P2`         |

- **Cohort:** [none]
- **Depends On:** [none]

- **Origin:** [internal]
- **Design:** `spec-testing-guidance-apparatus.md`
- **Task List:** `tasks-testing-guidance-apparatus.md`

- **Current Workflow:** [none]
- **Last Completed:** Task 5.1 — Complete verification (Phase 5)
- **Next Task:** [none]
- **Blockers:** [none]

- **Next Action:** [none]

- **PR URL:** <https://github.com/andrewRCr/arc-framework/pull/124>
- **Completed:** 2026-06-22

---

## Release Notes Entry

Testing guidance gains an execution-time home and an additive override mode: an operational testing standard now
loads exactly when a task writes tests, and a project can layer stack-specific rules on top of the shipped
default instead of replacing it wholesale.

### Added

- `testing-standards` method — execution-time testing discipline (assertion, mocking, and isolation rules),
  declared in the task-execution loop and self-gating so it stays inert on tasks that write no tests. Ships an
  opinionated, overridable universal default.
- Additive method overrides — methods accept an optional `override-mode: replace | extend` field, so a project
  override can append to the shipped default rather than replace it wholesale (absent ⇒ `replace`, preserving
  prior behavior). Validated by the method-frontmatter parser.

### Changed

- The task-execution loop applies testing discipline on every task that writes or modifies tests, via a new
  per-task gate — previously this fired only on test-first tasks, so test-after work went uncovered.
- `test-first` is now planning-only: its decision tree shapes task generation, while the red-green-refactor
  execution discipline moves to `testing-standards`.
- The task-list test-first marker is documented as a method-gated sequencing record decoupled from the method
  name, so a project that overrides the sequencing policy changes what gets marked.

## Completion Notes

Rationalized the testing apparatus so the operational standard is actually read at the moment tests are written:
split the canonical strategy into thin, execution-loaded methods with non-overlapping charters, and added the
additive method-override capability that split required.

**Shipped.** A new execution-time `testing-standards` method (both copies) carries the operational discipline —
a universal, opinionated default plus an `extend` project override instantiating it for the TypeScript/Vitest
stack (boundary list, Vitest mock mechanics, the CLI handler-seam + destructive-verb real-CLI-E2E discipline
authored from the originating defect). The task-execution loop now carries two per-task gates: the existing
marker-keyed red-green-refactor gate (repointed off `test-first`) and a new test-touch gate that fires on every
test-touching task regardless of marker — the gap that let the originating defect through. `test-first` resplit
to planning-only (decision tree declared at task generation; RGR ceded to `testing-standards`; dropped from the
execution loop's frontmatter). The override capability ships as a minimal optional `override-mode: replace |
extend` field with enum validation in the method-frontmatter parser and unit tests; the symmetric,
present-everywhere treatment is intentionally deferred. Surrounding realignment: the methodology strategy
rechartered as the deep-dive (cedes operational rules by reference, drops the duplicated decision tree and RGR
loop), the marker convention reframed as method-gated and keyword-decoupled, and the project testing rule kept a
thin pointer. Coordination notes were routed to five sibling work units' inbound buffers.

**Deviations.** Two, both anticipated. The marker reframe touched only `strategy-task-list-formatting`;
`template-tasks` needed no edit, as it already delegates marker patterns to the strategy by reference. And S6's
original verify-then-decide hedge on consumer tolerance for the new frontmatter field resolved at spec time to
the tolerated-field case, so the work rode here as planned with no separate mechanism work unit. No supersessions.

**Verification + review.** Tier 3 gates green; all 12 success criteria met (one with the `template-tasks`
deviation note above). Both originating-defect antidotes — "don't assert on spy / call args as the outcome" and
"keep mocked boundaries faithful" — ship verbatim in the universal default. Pre-PR review (local diff-review +
CodeRabbit) returned no findings.

---
