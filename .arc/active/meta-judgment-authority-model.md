# Metadata: judgment-authority-model

| **State** | **Owner** | **Branch**                      | **Class** | **Priority** |
| --------- | --------- | ------------------------------- | --------- | ------------ |
| `Active`  | `andrew`  | `feat/judgment-authority-model` | `Heavy`   | `P1`         |

- **Cohort:** [none]
- **Depends On:** [none]

- **Origin:** [internal]
- **Design:** `spec-judgment-authority-model.md`
- **Task List:** `tasks-judgment-authority-model.md`
- **Review Rubric:** [none]

- **Current Workflow:** [none]
- **Last Completed:** Integration ran to the merge gate, then reopened — a stop-shape gap in the shipped register
- **Next Task:** [none] — Phase 5.R not yet authored
- **Blockers:** [none]

- **Next Action:** Verify the audit findings, then author Phase 5.R and re-open the affected success criteria —
  inputs in `notes-judgment-authority-model.md` § Remedial phase

- **PR URL:** [none]
- **Completed:** [none]

## Release Notes Entry

Rules now carry a stated authority model: every rule is a default an agent may set aside by naming the fact that
discharges it, unless it is marked invariant, and an unmarked rule is classified by a reading rather than by
per-rule fiat. Silence fails safe toward invariant. The always-loaded context an agent reads at every session start
is meanwhile 13.5% shorter, with the material it no longer carries relocated to destinations that load when the
work reaches them.

### Added

- A canonical rule-authority register in the ARC development rules — the default/invariant reading, two backstop
  limbs covering integrity of a check and authorizations reserved to a person, a discharge protocol that requires
  naming the discharging fact where the developer is already reading, and an authority resolution that follows the
  governed surface's owner.
- `Default`, `Invariant`, and `Dischargeable` as defined vocabulary in the agent orientation brief.

### Changed

- Invariant markers now appear on the rule-carrying methods, strategies, workflows, and extensions that ship with
  the framework, so a reader no longer has to infer force from wording.
- The always-loaded rules files, strategy index, and orientation brief were compressed; demoted material now lives
  behind an explicit trigger at its destination rather than being read every session.
- The quality-gate method resolves to a section carrying the actual commands, in both the reference document and
  the shipped template, and the workflows that run gates reference it at their fire points.

### Fixed

- Four framework documents were present in the package tree but missing from the install recipe, so projects never
  received them; the recipe and manifest now carry them.

## Completion Notes

Delivered both halves of the RFC. The authority half adds § Rule Authority to `DEV-RULES.ARC`, generalizing a
decision ARC had already made correctly in six narrower places without ever stating it: an unmarked rule is a
default when the doubt it guards is dischargeable by the agent, and an invariant otherwise, with backstop limbs for
checks over the agent's own work and for decisions that commit a person. The limbs reach acts as well as rules,
which is what makes autonomous `WORKING-MEMORY` additions resolve to propose-don't-self-add against the primary
test's own verdict — the reserved case the spec used to test whether the backstop could overturn its own primary.
`adr-030` records the decision and its relationship to the three prior ADRs it generalizes.

The compression half took the always-loaded set from 828 to 716 non-blank lines (−13.5%), re-derived against base
rather than carried forward. No constraint left the set: every demoted line landed at a destination whose summoner
fires, is operation-anchored, and does not key on the agent estimating its own state. Task 2.1 found four of those
destinations absent from `init-recipe.json` — present in the package tree, byte-identical across both copies, and
reaching nobody — so the recipe repair is a precondition of the compression rather than an incidental fix.

The corpus-wide sweep read all four shipped regions with corpora re-derived at execution: 25 methods, 21
strategies, 36 workflows, 13 extensions. The strategy region re-derived to 21 against the spec's 20, which the
criterion's re-derive-at-execution wording anticipates.

One success criterion carries a recorded deviation. Its regression floor named `integrate-work-unit` and
`verify-work-unit` as surviving unchanged, and the quality-gate retarget subsequently edited both in both copies —
12 and 8 lines — to add a method declaration, three fire-point references, and two link definitions. The edits are
purely additive: nothing removed, nothing weakened, no bias-guard touched. The floor was written before the
retarget's fire sites were known, and the spec itself records that scoping the safety check to these two files
alone would make the criterion unfalsifiable.

Verification ran Tier 3 whole and passed: Markdown lint over 649 files, all three ARC contract checks, TypeScript
and shell lint, source and test type checks, 8,373 tests with one intentional skip, and the build. Alignment found
no conflict with `PROJECT-PRD` — the work unit derives directly from its "operational friction down, judgment
friction up" principle. The adversarial verification pass was offered at `Heavy` and declined; the routed review
lanes were skipped by owner direction while the review substrate is in flight.

---
