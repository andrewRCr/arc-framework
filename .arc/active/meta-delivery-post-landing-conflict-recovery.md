# Metadata: delivery-post-landing-conflict-recovery

| **State**     | **Owner** | **Branch**                                     | **Class** | **Priority** |
| ------------- | --------- | ---------------------------------------------- | --------- | ------------ |
| `Integrating` | `andrew`  | `feat/delivery-post-landing-conflict-recovery` | `Heavy`   | `P1`         |

- **Cohort:** [none]
- **Depends On:** [none]

- **Origin:** [internal]
- **Design:** `spec-delivery-post-landing-conflict-recovery.md`
- **Task List:** `tasks-delivery-post-landing-conflict-recovery.md`
- **Review Rubric:** [none]
- **Candidate:** `sha256:c0431c7098306fa8a3a91c70b0a8614288079eadee370f3d0177a5827de87605`

- **Current Workflow:** `integrate-work-unit`
- **Last Completed:** Task 8.1 — Complete verification
- **Next Task:** [none]
- **Blockers:** [none]

- **Next Action:** Resume publication at the idempotent push, then resolve or open the change request.

- **PR URL:** [none]
- **Completed:** [none]

## Release Notes Entry

Movement that happens after a stacked change lands no longer strands it. A landed member whose branch has
advanced, a history with more than one merge base, and a conflict the operator has already resolved by hand each
now reach a typed answer that names the act which clears it, instead of an equality check that reports nothing or
a refusal that repeats itself unchanged.

### Added

- `arc delivery native land-release` declines one settled native landing: it restores by lease every ref the
  settlement moved, publishes the reservation as released at the exact revision, and names what it restored and
  what it left standing. A failed lease reports the observed head and leaves the reservation held, so the decline
  stays retryable.
- Native land-status discloses the complete member-suffix conflict set rather than a single path, and a
  resubmitted resolution bound to that set settles the suffix.

### Changed

- Review readiness distinguishes a record whose head advanced, rewound, or diverged from a member with no binding
  at all, and returns a remedy for each instead of one indistinguishable refusal.
- A base comparison now resolves the single base it can be proved from. Histories with two equally good ancestors
  or none at all are refused by name and carried as such through drift, applicability, and review status, rather
  than resolved by an arbitrary pick.
- Closeout of a delivery terminal reports the specific condition that left it unsettled, each naming an act that
  can clear it, in place of a single word reachable fourteen ways.

### Fixed

- A change-request head that has advanced as far as a head bound above its member is no longer admitted under
  that earlier member's review vehicle.
- Replaying a pinned contribution onto a landed predecessor no longer returns the same conflict refusal after the
  operator resolves it: the resolution is an input to the composition that answers it.
- A base that is ambiguous, unrelated, or unreadable reaches the integration checkpoint with a route that clears
  it rather than a rerun of the reader that reported it.

## Completion Notes

Delivered three independently traced defects behind one recovery story: an ancestry term for readers that
previously compared a bound head for equality, a single resolved base at every reader this work unit converts,
and a post-land suffix settlement that reads the operator's resolution before composing the refusal that judges
it. The native landing lifecycle gained its missing decline arm, with ref restoration under a lease and a
retryable failure path, and the shipped stack workflow was corrected where verification falsified its prose.

Two scope boundaries are recorded exclusions rather than unmet goals. The one-vocabulary and cardinality goals are
bounded by the traced conversion set: readers left in place keep their existing typed reasons, and five surviving
silent base picks are enumerated in `notes-delivery-post-landing-conflict-recovery.md`. The ancestry relation
ships as extraction, not invention — four sites elsewhere already derive it by hand and none were converted here.

Verification closed with 15 success criteria met and none superseded or unresolved. Four adversarial passes ran at
that boundary; the last widened past the criteria slice to the accreted union of the preceding amendments and its
five findings landed as two corrective parents. Three criteria did not hold when verification began and were
carried to holding by design amendments rather than marked through. Tier 3 is green over the final tree:
markdown, the three ARC contract checks, both lint lanes, both type checks, `test:full` at 12,579 passed and 1
skipped, and build.

The standard review lane closed on an explicit Owner acceptance, not a clean pass. A complete chunked review over
the whole change set and a whole-target scoped pass over its fix delta both settled with every finding verified at
source — 18 fixed and 7 deferred with approval, then 4 more fixed. The corrections answering that second pass were
themselves never read by a non-author evaluator; they are the accepted risk, and they changed a shared member
binding contract consumed across the review gate. Full verification at that head is what stands behind the
acceptance.

---
