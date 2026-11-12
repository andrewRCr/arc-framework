# Metadata: judgment-authority-model

| **State** | **Owner** | **Branch** | **Class** | **Priority** |
| --------- | --------- | ---------- | --------- | ------------ |
| `Shipped` | `andrew`  | [none]     | `Heavy`   | `P1`         |

- **Cohort:** [none]
- **Depends On:** [none]

- **Origin:** [internal]
- **Design:** `spec-judgment-authority-model.md`
- **Task List:** `tasks-judgment-authority-model.md`
- **Review Rubric:** [none]

- **Current Workflow:** [none]
- **Last Completed:** Task 6.1 — verification: Tier 3 run whole, all thirteen success criteria disposed, and five
  adversarial-pass findings verified and applied
- **Next Task:** [none]
- **Blockers:** [none]

- **Next Action:** [none]

- **PR URL:** <https://github.com/andrewRCr/arc-framework/pull/398>
- **Completed:** 2026-07-30

## Release Notes Entry

Rules now carry a stated authority model on two axes — whether a rule binds, and what binding looks like when it
does. Every rule is a default an agent may set aside by naming the fact that discharges it, unless it is marked
invariant, and an unmarked rule is classified by a reading rather than by per-rule fiat. Silence fails safe toward
invariant. On the second axis, emphatic wording alone never classifies a rule, and a stop whose only defensible
answer is "yes" is discharged rather than spent — bounded by reversibility, so acts that cannot be undone or
unspent still stop. The always-loaded context an agent reads at every session start is meanwhile 12.6% shorter,
with the material it no longer carries relocated to destinations that load when the work reaches them.

### Added

- A canonical rule-authority register in the ARC development rules — the default/invariant reading, backstop limbs
  covering integrity of a check, authorizations reserved to a person, and pre-commitment text; a discharge protocol
  that requires naming the discharging fact where the developer is already reading; and an authority resolution
  that follows the governed surface's owner.
- Two clauses covering the shape a binding rule takes: emphasis is not a classification marker, and a default whose
  stop has one defensible answer is discharged on reversibility rather than on the agent's own reading that the
  answer is obvious. Always-stop interlocks are excluded by construction.
- `Default`, `Invariant`, and `Dischargeable` as defined vocabulary in the agent orientation brief.

### Changed

- Invariant markers now appear on the rule-carrying methods, strategies, workflows, and extensions that ship with
  the framework, so a reader no longer has to infer force from wording.
- Session entry, post-compaction recovery, the work-unit lifecycle ceremonies, and the planning stages now stop
  only where the deciding fact is not the agent's to establish, and degrade with a surfaced diagnostic everywhere
  else. Mandatory stops and interlocks are unchanged.
- The always-loaded rules files, strategy index, and orientation brief were compressed; demoted material now lives
  behind an explicit trigger at its destination rather than being read every session.
- The quality-gate method resolves to a section carrying the actual commands, in both the reference document and
  the shipped template, and the workflows that run gates reference it at their fire points.
- The project rules template's architecture-decision section is now a pointer to the strategy carrying the
  criteria, matching the shape the reference instance already used.

### Fixed

- Four framework documents were present in the package tree but missing from the install recipe, so projects never
  received them; the recipe and manifest now carry them.

## Completion Notes

Delivered three halves — the RFC's two, plus a remedial third the work unit's own integration surfaced.

The **authority** half adds § Rule Authority to `DEV-RULES.ARC`, generalizing a decision ARC had already made
correctly in six narrower places without ever stating it: an unmarked rule is a default when the doubt it guards is
dischargeable by the agent, and an invariant otherwise, with backstop limbs for checks over the agent's own work
and for decisions that commit a person. The limbs reach acts as well as rules, which is what makes autonomous
`WORKING-MEMORY` additions resolve to propose-don't-self-add against the primary test's own verdict — the reserved
case the spec used to test whether the backstop could overturn its own primary. `adr-030` records the decision and
its relationship to the three prior ADRs it generalizes.

The **compression** half took the always-loaded set from 828 to 724 non-blank lines (−104, −12.6%), re-derived
against base at Task 5.R.e rather than carried forward. No constraint left the set: every demoted line landed at a
destination whose summoner fires, is operation-anchored, and does not key on the agent estimating its own state.
Task 2.1 found four of those destinations absent from `init-recipe.json` — present in the package tree,
byte-identical across both copies, and reaching nobody — so the recipe repair is a precondition of the compression
rather than an incidental fix.

The **stop-shape** half (Phase 5.R) is the second axis, added after two live failures showed that deriving whether
a rule binds says nothing about what binding looks like. Two clauses entered § Rule Authority — emphasis is not a
classifier, and a default whose stop has one defensible answer is discharged on **reversibility**, never on the
agent's own reading that the answer is obvious. Clause B's closing sentence is the interlock firewall: without it,
"reversible in one turn" would reach the task-interlock, since a commit is reversible. Twenty stop proposals came
out of five delegated read-only regional passes; sixteen were narrowed and four rejected, and verification against
source is what rejected them — two because they re-opened decisions Phase 4 had already settled the other way. That
is the reusable evidence: an audit handed a work unit's output but not its record produces re-openings shaped
exactly like findings, and only verification against the record separates them, which is why that pass does not
delegate. The phase also closed Phase 5's two parked template-only rows — the shipped project-rules template's ADR
section became the instance's pointer shape (85 → 71 nb), verified by reading the destination strategy rather than
inferring redundancy from the pointer's wording, and § File Organization is a recorded keep.

The corpus-wide sweep read all four shipped regions with corpora re-derived at execution: 25 methods, 21
strategies, 36 workflows, 13 extensions. The strategy region re-derived to 21 against the spec's 20, which the
criterion's re-derive-at-execution wording anticipates.

**Deviations — three, each recorded against its criterion.** The regression floor named `integrate-work-unit` and
`verify-work-unit` as surviving unchanged, and was breached twice. Additively, by the quality-gate retarget: 12 and
8 lines across both copies adding a method declaration, three fire-point references, and two link definitions —
nothing removed, nothing weakened, no bias-guard touched. Substantively, by Phase 5.R's narrowing of Step 13's
analyzer/host stop to a conflicting path set that is not wholly regenerable — an approved change to the floor
rather than a breach found after the fact, and what the floor protected still holds, since the append-only merge
keeps its own conflict stop and remains the authoritative test. The floor was written before either edit's sites
were known, and the spec itself records that scoping the safety check to these two files alone would make the
criterion unfalsifiable. Third: seven Phase 5.R files were authored in the instance and mirrored to the package
rather than the reverse. The end state is byte-identical and both copies were staged together, so the hazard the
direction rule guards — a forgotten package copy — did not occur; the authoring order still departed from the rule.

**Verification.** Tier 3 ran whole at Task 6.1 and passed: Markdown lint, all three ARC contract checks, TypeScript
and shell lint, source and test type checks, 8,393 tests with one intentional skip across 648 files, and the build.
One adversarial verify pass ran at the verification boundary with markings withheld: five findings, all five
verified against source, confirmed, and applied. The two `major` ones were spec-artifact integrity rather than
implementation — § Rule Authority had drifted three paragraphs from the spec's normative D1 block with no amendment
recorded, which the spec's own text calls a spec amendment rather than an authoring choice. It was amended forward,
and the stop-shape criterion the task list had been carrying alone became the spec's fourth. The pass also reverted
an `[invariant]` marker on § Sub-agent scope, a section the spec's Non-Goals reserve untouched. Alignment found no
conflict with `PROJECT-PRD` — the work unit derives directly from its "operational friction down, judgment friction
up" principle. Tier 3 re-ran whole at integration after merging the base, which the base merge made necessary:
8,600 tests with one intentional skip across 667 files, and every other gate green. The routed review lanes were
skipped by owner direction while the review substrate is in flight.

---
