# Metadata: Planning-Pipeline Readiness

| **State**     | **Owner** | **Branch**                         | **Class** | **Priority** |
|---------------|-----------|------------------------------------|-----------|--------------|
| `Integrating` | `andrew`  | `feat/planning-pipeline-readiness` | `Heavy`   | `P2`         |

- **Cohort:** `lifecycle-state-machine`
- **Depends On:** [none]

- **Origin:** [internal]
- **Design:** `spec-planning-pipeline-readiness.md`
- **Task List:** `tasks-planning-pipeline-readiness.md`

- **Last Completed:** Phase 6 (Verification) complete — Task 6.1: full Tier 3 suite passed (md/TS/shell lint,
  typecheck, 2954 tests, build); all 10 spec success criteria met across § A/B/C; meta pre-aligned for integration.
- **Next Task:** [none] — task list complete; ready for integration
- **Blockers:** [none]

- **Next Action:** integrate-work-unit Step 1 — verify completion

---

## Release Notes Entry

The planning pipeline now records its progression through a code-owned stage pointer instead of free-form
prose, spec finalization separates spec review from the proceed-to-finalize approval, and a session resuming
mid-planning resolves the active sub-stage deterministically.

### Added

- A shared draft-readiness assessment (`assess-draft-readiness`) for deciding when a draft is ready to
  formalize into a spec — one judgment, consumed by both the drafting and spec-authoring stages.
- A `Current Workflow` meta field recording the active planning sub-stage, carried in the meta template.
- `arc set-stage` and `arc repoint-design` commands for advancing the planning-stage and design pointers.

### Changed

- Spec finalization splits its single approval into two gates: spec review / iteration, then
  proceed-to-finalize. Advisory either-or prompts now state a recommendation rather than a bare choice.
- Session start resolves the active planning sub-stage from the recorded stage pointer instead of inferring
  it from prose; a meta without the field defaults to the entry stage with no artifact scan.
- Work-unit init no longer pre-judges planning readiness at scaffold time — the consuming session assesses
  readiness against the actual draft.

## Completion Notes

Cut the planning-pipeline readiness/stage-pointer spine as one coherent iteration rather than patching four
interacting defects in isolation: a duplicated readiness judgment, `init-work-unit`'s mechanical readiness
pre-judgment, `create-spec`'s collapsed Finalize gate, and session-init's lossy `Next Action` prose-parse for
the planning sub-stage.

**Shipped.** The shared `assess-draft-readiness` method (one formalization-ready judgment, consumed by both
`draft-design` and `create-spec`); the `create-spec` Finalize split into review-then-proceed gates plus a
general advisory-recommendation norm in DEV-RULES.ARC; and the stage-pointer mechanics — the code-owned
`Current Workflow` encoding field with an encoding-consistency validator, the `set-stage` write primitive
(finalization-advance + entry-correction shapes), and an event-driven `Design` repoint (`draft → spec` at
create-spec finalization, not by artifact presence-scan). session-init now resolves the planning sub-stage
from `Current Workflow`, defaulting a fieldless meta to `draft-design` with no artifact scan; `init-work-unit`
writes `Current Workflow` at scaffold and drops the `Next Action` workflow pointer.

**Scope deviations.** The planning-iteration *content* concerns (inbound-buffer-drain ceremony, depth-aware
navigation, oversized-increment audit) split to `planning-iteration-mechanics`, and the cold-start-init
cleanup to `cold-start-init-polish` — keeping this WU on the readiness/stage-pointer spine.

**Cohort.** Member of `lifecycle-state-machine`; the stage-pointer mechanics extend
`lifecycle-transition-core`'s executor encoding pattern (the `Branch`-field write is the worked precedent) and
consume `lifecycle-state-resolver`'s state model — both shipped, so the live `Depends On` gates were
discharged.

**Review.** Local diff-review plus one CodeRabbit pre-PR pass (2 fixes) and one PR pass (4 fix-now + 3
nitpicks addressed, 1 major deferred). Deferred: wrapping all post-side-effect meta field-writes in the
executor's encoding-failure surface — pre-existing and architecture-wide (the established branch-field write
shares the exposure), captured to `lifecycle-mechanics-tail`. Verification: full Tier 3 suite green (md / TS /
shell lint, typecheck, 2959 tests, build); all 10 spec success criteria met.
