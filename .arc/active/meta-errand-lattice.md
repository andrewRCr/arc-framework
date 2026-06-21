# Metadata: errand-lattice

| **State**     | **Owner** | **Branch**            | **Class** | **Priority** |
| ------------- | --------- | --------------------- | --------- | ------------ |
| `Integrating` | `andrew`  | `feat/errand-lattice` | `Heavy`   | `P1`         |

- **Cohort:** `lifecycle-state-machine`
- **Depends On:** [none]

- **Origin:** [internal]
- **Design:** `spec-errand-lattice.md`
- **Task List:** `tasks-errand-lattice.md`

- **Current Workflow:** [none]
- **Last Completed:** Task 7.1 — verification (Phase 7); all 9 success criteria met
- **Next Task:** [none]
- **Blockers:** [none]

- **Next Action:** open the PR

- **PR URL:** [none]
- **Completed:** [none]

---

## Release Notes Entry

Errands become a first-class lifecycle alongside work units: the errand-vs-work-unit decision is re-based onto
spec-worthiness (does the work need a design recorded?), errand identity moves from the branch name into a synced
per-user record, and a thin `arc errand` verb surface replaces the previously hand-run mechanics.

### Added

- `arc errand open <slug>` — mint an errand's identity record, cut a nature-typed branch (`fix` / `chore` /
  `refactor` / `hotfix`) as its projection, and occupy it.
- `arc errand close <slug>` — reap the errand branch (containment-checked, never a force delete), remove the
  record, and drop the slug-matched `USER-INBOX` capture.
- `arc errand promote <slug>` — cross an errand into a work unit: rename the branch (preserving commits), mint
  the backing meta at the stage the crossed floor dictates, regenerate the readiness view, and retire the record.
- `arc errand retire <slug>` — retire a promoted errand's record while its renamed branch survives.
- A synced per-user errand identity record, so an errand's identity (and an inbox-originated errand's
  back-pointer) survives independently of its branch.

### Changed

- The errand-vs-work-unit boundary is defined on **spec-worthiness** — the same two intrinsic axes that set a
  work unit's weight — so a self-evident single-concern sweep is an errand however many commits it spans, while
  work needing a recorded design or a durable cross-session plan is a work unit.
- Errand identity resolves from its record rather than its branch name, so `fix/`- and `refactor/`-prefixed
  branches are recognized as errands, not only `chore/`.
- Personal capture sections are relabeled **Errand** / **Work Unit** and key on spec-worthiness.

### Removed

- Branch-name parsing as the errand identity oracle.

## Completion Notes

Modeled the errand lifecycle as a distinct lattice adjacent to the work-unit lattice — one concept whose
mechanism scales with `branch.protection` — and cascaded that model across every surface a session consults
during classification, capture, routing, and execution.

**Shipped.** The character gate is re-based from increment-count onto spec-worthiness (the two intrinsic axes
that drive `Class`), making the errand the shared sub-floor of one spectrum. The full-protection errand gains a
record-owned identity — an orphan state-ref (`refs/arc/user/{identity}/errands`) holding per-slug record blobs,
synced through the existing user-state machinery with per-slug union-merge and same-slug-collision reject — so
the branch becomes a projection and the branch-name identity parse retires (session-init probes read the record;
`fix/` / `refactor/` branches resolve as errands). A thin `arc errand open` / `close` / `promote` / `retire`
surface composes the upstream transition mechanics rather than rebuilding them. The crossing edges (inbox →
errand, errand → work unit) re-base onto the new gate and resolve identity from the record; cut→occupy is
codified as a consumer invariant. The personal `USER-INBOX` surface lands the gate (sections relabeled, coupled
readers / writers / probes updated in lockstep). ADR-027 captures the refined model; ADR-021 gains a
forward-pointer amendment.

**Deviations.** ADR-027 is accepted at this integration (per its plan, the integrate ceremony does not
auto-advance ADR status). Verification caught one relabel-cascade residue (a stale `§ Atomic` config comment).
Review hardened three spots — a path-separator guard on promotion names, SHA-256 tree-entry parsing, and
record-contract enforcement on deserialize — and deferred one same-machine `update-ref` compare-and-swap gap to
a single-machine follow-up (the cross-machine conflict path is the designed mechanism and ships here).
