# Draft: Reader Surface Norms

- **Purpose:** Give the repository's reader-facing surfaces one shared principle for keeping substance apart from
  planning history, while each surface keeps its own strictness.
- **Origin:** routed from `USER-INBOX § Work Unit` at housekeep drain (2026-11-05); captured during
  `adr-accept-timing`'s draft-design (2026-11-04), as a separate planned stub rather than part of that work unit
  (Owner, 2026-11-04).

---

## Inbound Buffer — Pending Integration

> _Routed-in concerns pending holistic integration into the body at this WU's next planning iteration_
> _(`drain-inbox § 5`); each carries its origin. Integrate — or consciously reject — at iteration._

### `[ ]` **Keep machine paths out of tracked documents**

- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-11-10).

- _Shapes:_ § Problem and § Approach — the rule half; a forbidden-pattern check would be `knowledge-lint`'s.

- _Observation:_ arc-framework's tracked `.arc/` cites `~/dev/...` paths about 70 times (archived notes, eight live
  drafts and cohort documents, and a tracked Candidate record), mostly `~/dev/arc-evidence/` and `~/dev/scratch/`.
  They resolve only on this machine, and each one made later sessions treat its folder as the convention.

- _Approach:_ a rule in the shipped guidance (put the number or conclusion in the document; cite a commit, a CI run ID
  or a stored record for the raw evidence), and a check that flags a home-directory or absolute machine path in
  tracked ARC Markdown. Check `init-recipe.json` before placing the rule (`WORKING-MEMORY`). The live drafts'
  citations are folded by hand at the pre-rehearsal cleanup.

- _Captured during:_ `project-manager.ARC`'s survey of where agents write on this machine, 2026-11-10 (Owner-approved;
  `pm-briefs/machine-write-zones.md`).

---

## Problem

Five places state how a reader-facing surface stands apart from planning history, each in its own words:

- `DEV-RULES.ARC` § Documentation Boundaries covers code and durable docs ("No meta-project references in code") and
  commit prose ("Commit and PR surface language").
- `pull-request-format` covers pull-request bodies and comments, at token level, because they are published under the
  owner's name.
- `spec-review`'s Reader independence check and its Reference boundaries cover specs, at meaning level, with tracking
  fields allowed.
- `strategy-adr-methodology.md` will cover ADR bodies by naming that check and quoting three of its Reference
  boundaries sentences, a copy that names `spec-review` as its source (`adr-accept-timing`).

The shared core: the substance stands alone, and traceability lives in one designated slot per surface — commit →
`Context:` footer; spec → tracking fields; pull request → the pinned design link; ADR → Status; code → none.

## Approach

Decide merge versus index, and where the principle lives, after reading `analysis-load-set-scoping`
(`.arc/reference/supplemental/analysis/`): this is rule placement, and `DEV-RULES.ARC` is always loaded and shipped,
so a table added without trimming the surfaces grows it. Check `init-recipe.json` for every destination's ship status
before moving content. Keep each surface's strictness.

Integration tests pin `pull-request-format`'s references, among them `prepublication-workflow.test.ts` and the
review-gate workflow tests. No evals exist yet for rewritten judgment prose (`workflow-eval-harness`).

## Sequencing

P2 (Owner, 2026-11-04). Runs after `adr-accept-timing` merges, since that adds the ADR surface's copy, and before
`cutover-flip`'s implementation starts if time allows.
