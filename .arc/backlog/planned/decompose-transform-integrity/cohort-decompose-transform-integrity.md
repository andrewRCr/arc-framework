# Cohort: `decompose-transform-integrity`

> _Identity and coordination record for this cohort. Membership is **derived** from each member's `Cohort`
> field — recorded here only as shared coordination, never as a roster or status table._

**Purpose:** Preserve one durable mental and delivery anchor for the program split from
`decompose-transform-integrity`. The shipped origin owns the trustworthy v3 retirement core; direct members
deliver independently safe extensions, while `decompose-core-hardening` coordinates post-ship safety,
operability, performance, and authoring gaps exposed by real cuts.

---

## Coordination

The shipped core and each remaining member's spec and meta are the planning authorities for this program.
Transform receipts govern individual cuts; they do not replace cohort coordination or member lifecycle state.

### Sequencing

```text
decompose-transform-integrity (shipped core)
├── decompose-base-mobility ──────────── shipped
├── decompose-planning-lane ──────────── shipped
├── decompose-transition-record ──────── shipped; replaced the receipt spine
├── decompose-extraction ─────────────── re-validate against the lean core, then proceed
└── decompose-core-hardening ─────────── conservation/authoring spine + scaling measurement
```

The core, base mobility, planning-lane admission, and the transition record have all shipped. The record replaced
the sealed receipt with a lean record carrying the authored dependency-edge intent and retired the apparatus that
accumulated around the heavier shape.

The members formerly held on that replacement were dispositioned at the 2026-08-11 residuals consolidation per
the dispositions recorded at the 2026-08-05 re-groom (see § Retired members below and the matching records in
`cohort-decompose-core-hardening.md`). What remains: `decompose-extraction` re-validates its spec against the
surviving core surfaces rather than re-deriving (it never consumed receipt authority), and
`decompose-core-hardening` carries two members — the widened conservation/authoring spine and a merged
measure-first scaling stub. `decomposition-doctrine` remains outside the cohort and resumes now that the
machinery's shape is settled.

Current readiness is derived from member metas and `Depends On`, not from this orientation view.

### Shared contracts

- `decompose-transform-integrity` owns the closed v3 cut-map, preparation, receipt, validator, exact-base
  retirement, topology, planning-profile, finalization, publication, overlay, exact-base integration anchor, and
  workflow contracts consumed by every member.
- `decompose-base-mobility` owns movement of a canonical finalized candidate across base advancement and extends
  the shared integration anchor to a descendant current base.
- `decompose-extraction` reuses the core inventory, allocation, profile, topology, and exact-base result substrate
  without importing retirement evidence. Its surviving origin remains the durable anchor and it creates no
  extraction receipt.
- `decompose-planning-lane` grants an optional host-side exception for one canonical decomposition receipt. The
  exception is a passthrough to the ordinary planning classifier whenever no receipt is present, so it becomes
  unnecessary once the record no longer displaces a decomposition out of that classifier.
- `decompose-transition-record` owns the durable record of what became of a retired origin: transition kind,
  successors, and the authored disposition of each incoming dependency edge. It is the sole authority every
  consumer of retirement history reads, and it holds no transaction, preparation, or sealing evidence.
- `decompose-core-hardening` consumes the same shipped core and closes real-cut gaps without folding optional
  performance or authoring changes back into the core's already-landed authority spine.

### Soft coordination

The receipt-backed launch handoff stores logical anchor identity, exact publication entries, and the distribution
interlock's typed initial-continuation disposition. Member metas remain authoritative for current membership,
dependencies, priority, workflow, and lifecycle state; launch and status surfaces recompute ready and blocked
frontiers from the landed base.

Extraction intentionally has no retirement receipt. Its separate member must retain that conservative boundary
and must not fabricate publication evidence merely to automate launch.

### Closeout criteria

The cohort closes when every direct member and every `decompose-core-hardening` member has either shipped or been
retired against a recorded disposition, ordinary installs still default to reviewed decomposition, and the
transform presents an origin-addressable anchor for every completed cut without a scheduler or status record.
Retirement is an ordinary closing disposition for a member whose motivating states the transition record removed;
it is recorded in the member's meta at closeout, never inferred from inactivity.

### Hardening-admission boundary

A design, task, audit, or code-review finding against any member is blocking when it demonstrates at least one of:

1. violation of an explicit goal or invariant;
2. a concrete failure reachable in a supported decomposition lifecycle;
3. violation of an existing repository, Git, host, review, storage, or ARC authority contract; or
4. loss, corruption, unsafe ambiguity, or unrecoverable mutation of in-scope planning content.

"More robust," "more general," and additional observations of an already-known event are not sufficient on their
own. A proposal that adds a durable record, identity, ledger, state machine, recovery branch, or new authority is
a scope change: it may be accepted through a design amendment, but it is never silently promoted into a required
fix. Member specs restate this boundary and recalibrate their recorded size estimates at spec close and again at
task-generation close — the transform grew to several times its recorded estimate by absorbing individually
plausible hardening, and the estimate checkpoints are what make that drift visible while it is still cheap.

## Members

### `decompose-base-mobility`

_Exposes:_ append-only committed-unlanded base advancement, descendant-base landing, and descendant-current-base
extension of the shared integration anchor — including the landing relations for a candidate that has absorbed the
base or landed over a descendant base, and authorized advancing-shape arms on the finalized-record commit gate and
the projection regeneration assert. These extensions name states only this member can produce, so no existing
verdict moves. Named for advancement rather than refresh: the core owns an
uncommitted same-base receipt refresh, and the two stay distinguishable at the command surface and in every
refusal code.

_Consumes:_ canonical v3 evidence, transition patch, validation verdicts, and typed recovery actions from
`decompose-transform-integrity`.

### `decompose-extraction`

_Exposes:_ additive-first extraction and independently retryable byte-preserving source finish.

_Consumes:_ the core inventory, allocation, profile, topology, result-planning, and workflow contracts without
retirement receipt authority.

### `decompose-planning-lane`

_Exposes:_ an explicitly installed, exact-head `arc-cleared` planning-lane exception for one canonical
decomposition receipt.

_Consumes:_ core v3 validation and base-mobility exact-ref/descendant-base proof.

### `decompose-transition-record`

_Exposes:_ the lean transition record — origin, transition kind, successors, and the authored disposition of each
incoming dependency edge, keyed by dependent slug. It carries the one fact about a decomposition that git cannot
reconstruct, and retires the sealed receipt spine, its record validator, the transient claim and candidate-discard
machinery, the launch-readiness and publication cluster, and the planning-lane exception.

_Consumes:_ the core cut map's authored allocation and incoming-edge dispositions. It takes no preparation,
sealing, or transaction authority, and converts the existing receipts rather than clearing them — their authored
dispositions are past human decisions and are not regenerable.

## Retired members

Recorded dispositions per the closeout criteria — each member retired against evidence, not inactivity, at the
2026-08-11 residuals consolidation:

- **`decompose-candidate-abandon`** — retired, fully satisfied by the shipped transition record. Its Success
  Criterion 8 required every stranded candidate state be destroyable after the cut; the four recorded discard
  refusal codes (`candidate-cleanup-failed`, `candidate-not-exact`, `candidate-index-changed`,
  `candidate-path-set-changed`) are absent from source, and `--discard` itself retired with the exactness gates
  that produced them. One operational caveat rides in `decompose-scaling`: if the execute half re-measures above
  common command timeouts, revisit whether interrupted-execute recovery is genuinely covered.
- **`decompose-durable-consumers`** — retired. The transition record's spec declared the deferral to its bounded
  receipt enumeration void (records are a flat directory of small JSON files; a linear read is acceptable at
  present scale). Its two surviving errand-sized behaviors — terminal-decomposition narrative silence and
  absent/equal/strict-ancestor remote source-ref teardown — were routed to errand captures rather than carried as
  a work unit.

---
