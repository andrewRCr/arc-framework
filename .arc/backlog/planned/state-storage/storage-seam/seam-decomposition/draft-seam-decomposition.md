# Draft: Seam Decomposition

- **Origin:** [internal] — the `storage-seam` cut (2026-10-09); stage 2 of the storage program.
- **Purpose:** Route decomposition through the storage contract, so a cut becomes one multi-record `batch`, the
  `chore/decompose-<origin>` staging branch retires at the flip, and the decomposition modules become pure planning over
  snapshots read at pinned versions.

---

## Continuity

- **Readiness:** maturing. The cut carried this member's section of `storage-seam`'s draft over unchanged, from a draft
  the readiness check found formalization-ready for the cut (2026-10-09); what stays open is this member's own detail
  design.
- **Next:** draft-design, at its turn in the seam's design order (`cohort-storage-seam.md` § Coordination): re-verify
  its consumer-map rows against the current code and settle what the store version of a cut holds.

**Reading this draft.** `cohort-storage-seam.md` holds the seam's coordination, its scope boundary, and how the
register's keys are cited. A `§ Shared decisions` item lives in its owner's draft: items 1–8 and 11 in
`draft-seam-record-kinds.md`, item 9 in `draft-seam-locus.md`, and items 10 and 12 in `draft-seam-lifecycle.md`.
`§ Record kinds`, `§ Lifecycle`, `§ Decomposition`, `§ Delivery and review records`, `§ Locus`, and
`§ Status and roadmap` name the member sections of `draft-seam-record-kinds.md`, `draft-seam-lifecycle.md`,
`draft-seam-decomposition.md`, `draft-seam-delivery-review.md`, `draft-seam-locus.md`, and
`draft-seam-status-roadmap.md`. `D` and `A` numbers are `spec-storage-contract.md`'s decisions and amendments.

## Members

### Decomposition

- **Key 49.** A cut becomes one multi-record `batch` (D3), and the `chore/decompose-<origin>` staging branch with its
  append-only advance over base retires at the flip. Until then the staging branch stays the in-repo arm: decomposition
  branches stay valid write contexts (D4), and the in-repo implementation retires at the cutover (D8, key 51). Re-scope
  the `decompose-core-hardening` subcohort (`decompose-scaling`) against that end state, and coordinate with
  `decomposition-doctrine`, still in planning. The Git modules become pure planning over supplied snapshots of the meta,
  task list, prose, and any cohort document the plan selects, with adapters that acquire them at pinned versions and
  apply the prepared batch (§ Shared decisions, item 12); code trees and ancestry stay Git facts.
- **Its ROADMAP arms (key 18).** The decomposition modules' ROADMAP handling stops on the capability at the flip, in one
  change: the plan's exclusive `roadmap` mutation role (`decompose-v3-plan.ts`), ROADMAP among the planned
  `expectedPaths` (`decompose-v3-repository-plan.ts`) and base advancement's tolerance for it
  (`git-decompose-transition-base-advancement.ts`), and the `roadmap-missing` and `roadmap-current-render` refusals
  (`git-decompose-v3-destination-validation.ts`). Nothing persisted or in flight binds ROADMAP — it reaches only the
  in-process plan identity — so removing it invalidates no record. The planner, pre-commit assertion, and conflict
  remedy render from different input contracts, and the planner stamps the result base's head
  (`git-decompose-v3-repository-plan.ts`) where the assertion and remedy stamp `HEAD` (`project-view.ts`); both dissolve
  with the stored projection rather than being unified first.
- **Inputs from the decomposition rehearsal (2026-10-05).** A five-member retirement rehearsed in an isolated clone of
  `main` at `5f97ed297` did not complete as `decompose-work-unit.md` writes it. Its Git-machinery defects are held
  unfixed, since the flip deletes that machinery, and the cut runs by a recorded workaround procedure, whose
  rehearsal kit sits beside it (`RELEASE-GATES.md` § Decomposition until the cutover, in the Owner's personal
  directory). What the member settles for the store version:
    - **Who owns which bytes.** Base advancement requires every planned path to equal the composed after-state
      (`exactTransitionTree`, `git-decompose-transition-base-advancement.ts`), yet the workflow authors destinations
      over those scaffolds. Say which bytes the batch composes and which the author writes, and whether authoring lands
      in the batch or after it.
    - **The record carries the whole redistribution.** The transition record lists only incoming-edge dispositions
      (`decompose-transition-record.ts` builds its edges from `incomingEdges`), so it cannot reconstruct the origin's
      outgoing prerequisites moving to its members. The lineage record carries both.
    - **Checks to carry if their code survives:** a non-canonical completed map refuses as `completed-map` with a
      reauthor remedy (`decompose-v3-execution-preflight.ts`); and a scaffold is retitled only when its first line holds
      the origin slug (`retitleScaffold`). The topology identity check, which rejects `**Parent:** [none]` on a
      top-level cohort and a backticked parent on a subcohort, shapes the repository's cohort documents use
      (`structurallyMatches`, `decompose-v3-topology.ts`), moves onto the parsed `Parent` with record kinds' cohort
      parser, so both shapes pass (§ Shared decisions, item 7).
    - **The workflow's end state** for the flip's rewrite: the planning profile follows the origin's `Design` pointer,
      not the artifacts present (`inferPlanningProfile`); the finish step serves extraction only; a retirement's commit
      footer has no origin artifact left to name; the frontier reads from `arc status --project` or a slug; where each
      mode runs goes unstated, the cut map's JSON shapes now being published (`arc schema get decompose-cut-map`); and
      under a draft profile the member specification review has nothing to review.
    - **A cut's cost stays flat as branches and work units grow.** Today each plan build re-reads every local branch's
      metas one blob at a time, two `git` processes apiece (`readGitV3DecomposeTreeSnapshot`,
      `git-decompose-v3-preflight.ts`; `readGitBlobEntry`, `lib/io-context.ts`), and execute builds the plan about four
      times (`revalidateCommandMap` and `revalidateOperationPlan`, `git-decompose-v3-operation.ts`). `storage-seam`'s
      own cut, over 14 local branches, took about 25 seconds to preflight and 5 minutes 50 seconds to execute
      (2026-10-09), and refused an edit outside the origin only at execute's plan build, nearly two minutes in
      (`retirement:source-private-modified`). The store version reads only the records a cut touches, once, at pinned
      versions, re-checks them by version rather than by re-reading, and refuses at preflight what it can.
- **Edges:** on record kinds, whose meta, lineage, and cohort writers its cut uses, and which moves its two `Parent`
  checks and scaffold onto the parsed field. Coordinate with status on ROADMAP.

---
