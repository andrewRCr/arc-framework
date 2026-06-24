# Metadata: lifecycle-closeout

| **State** | **Owner** | **Branch** | **Class** | **Priority** |
| --------- | --------- | ---------- | --------- | ------------ |
| `Shipped` | `andrew`  | [none]     | `Heavy`   | `P1`         |

- **Cohort:** `lifecycle-state-machine`
- **Depends On:** [none]

- **Origin:** [internal]
- **Design:** `spec-lifecycle-closeout.md`
- **Task List:** `tasks-lifecycle-closeout.md`

- **Current Workflow:** [none]
- **Last Completed:** Task 6.1 — consistency audit verified; all phases complete (Tier 3 green, 12/12 criteria met)
- **Next Task:** [none]
- **Blockers:** [none]

- **Next Action:** [none]

- **PR URL:** <https://github.com/andrewRCr/arc-framework/pull/129>
- **Completed:** 2026-06-23

---

## Release Notes Entry

Completes the work-unit lifecycle as a coherent state machine: the CLI and workflow docs now describe one
shipped verb set and state model end to end, several half-built lifecycle edges are finished, and a consistency
audit certifies the corpus matches the shipped behavior.

### Added

- `arc errand open --from-inbox <entry-title>` adopts a `USER-INBOX` capture as an errand's origin; the capture
  is dropped automatically when the errand closes.
- A `reopen` ceremony to withdraw a work unit from review (`Integrating → Active`) — the inverse of integration.
- `arc status <slug>` is surfaced in the command reference, with a rule to resolve a work unit's lifecycle state
  by slug rather than inferring it from directory or branch.
- The work-unit state model is documented as two orthogonal axes (phase × location), with a `Parked` readiness
  bucket in the roadmap view.

### Changed

- The lifecycle verb register is renamed `graduate`/`graduation` → `promote` (with its `demote` inverse) across
  the documentation; the "readiness ladder" concept is unchanged.

### Removed

- The standalone `arc errand cut` command — `arc errand open` composes the cut-and-occupy step.

### Fixed

- `reopen` now refuses when a PR's merge state can't be confirmed, rather than proceeding on an unverifiable
  state and stranding a half-completed withdrawal.
- Adopting an inbox capture into an errand now reliably drops that capture when the errand closes (the drain was
  previously inert).
- Nested-parent cohort documents now archive correctly when their last member ships.

## Completion Notes

This work unit is the global-consistency tail of the lifecycle state-machine cohort. Where each prior member
shipped under a local-consistency rule — no code whose own docs lag — this one owns the cross-cutting
propagation and the final audit that the shipped substrate matches the model end to end.

**Design intent → shipped.** Three pillars, all delivered:

- _Documentation sweep_ — the `graduate → promote`/`demote` verb-register rename across every live durable
  surface (workflows, methods, strategies, skills, both copies), preserving the deliberately-reserved "readiness
  ladder" concept; the `reopen` ceremony authored as integration's inverse; the `(phase, location)` state model,
  derived-state vocabulary, and `Parked` render bucket added to the work-organization strategy; the `arc status`
  resolver surfaced to agents; ceremony commit-footers folded to validator-accepted values; the orphaned
  `arc errand cut` command removed.
- _Wiring completions_ — the errand inbox-drain provenance producer leg (the consumer shipped earlier but no code
  set the back-pointer, so the drain was universally dead); the resolver-driven entry-mode dispatch in
  integration; and the nested-parent `{NN}b` archival cascade.
- _Certifying audit_ — the completion-time pass asserting no documented-but-unbuilt transition, no half-migrated
  mechanic, and no retired-verb description survive across both copies.

**Key deviations / supersessions from plan.** The plan was sharpened by a discovery audit run to closure at spec
time rather than during execution: one presumed code item (the `abandon` out-of-band teardown) was found already
shipped and reclassified to verify-only; the resolver-rewiring set collapsed to a single genuine inconsistency
(integration's hand-read of meta state); and two new edges (the nested archival cascade, adjacent-strategy verb
residue) were folded in. During pre-merge review, the `reopen` `pr-unmerged` guard's fail-open-on-unverifiable
default was found to be an unexamined implementation artifact rather than a deliberate choice, and was corrected
to fail closed — refuse unless positively unmerged — aligning it with the other guards' safe-default posture. Two
forward-compat observations surfaced in review were routed to the inbox for later drain rather than absorbed here.

**Verification.** All Tier 3 quality gates pass (markdown lint, type-check, 3236 tests, build); the 12 success
criteria are met; cross-copy mirror parity holds.

---
