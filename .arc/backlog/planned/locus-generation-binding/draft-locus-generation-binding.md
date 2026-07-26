# Draft: locus-generation-binding — one exact generation capability through every locus mutation

- **Origin:** [internal] — carved from `session-locus-model` on 2026-07-24 during its chunked-review finding
  triage. The reviewing hierarchy returned 66 deduplicated findings against that branch; 59 stayed in scope as
  its Phase 7.E remediation, and the six below were carved because they are one design question plus the test
  substrate needed to prove it, not a fix list. The full disposition and its rationale are recorded in
  `notes-session-locus-model.md` § Chunked-review finding triage.
- **Purpose:** Settle **what exact generation capability a locus mutator carries, and where it is revalidated**,
  then apply that contract uniformly across attach, provisioning, promotion, and marker authority. Today each
  mutation site validates its selected generation at _selection_ and re-proves some subset of it under the lock
  that authorizes the mutation — so a record, lease, parent, or marker that is replaced in the window between
  those two points can be mutated by a caller that never observed it. The contract is the deliverable; the
  per-site corrections fall out of it.
- **Second half — the proof substrate.** The carved coverage item is a **failure-injection and replay matrix**:
  inject a failure after every externally visible lifecycle mutation and replay each resulting post-image. No
  such harness exists in the tree. It is what makes the contract falsifiable rather than asserted, and it is
  reusable well beyond this unit.
- **Seeded by carve, not groomed.** The material below is the triage record, not an authored design. It needs a
  `--plan locus-generation-binding` pass before formalization.

---

## Grooming status (continuity)

> _Updated each `--plan locus-generation-binding` pass — see `draft-design` § Re-synthesize. This is the resume
> anchor._

- **Readiness:** `rough` — the defect set is exact and source-verified, but no contract has been authored. The
  open forks below are genuine design questions.
- **Blocked until the `session-locus-model` delivery stack integrates.** Every locus in the carved set is code
  that work introduces; there is nothing to edit until it reaches mainline. This is a sequencing fact, not a soft
  preference. The origin decomposed on 2026-07-25 into `session-locus-model` → `errand-transient-lifecycle` →
  `claimed-sweep-verbs`, and the dependency is on the last of them: five carried items name base-deliverable
  modules, while the failure-injection substrate names the groom and housekeep drivers that ship last. Scoping
  this unit to the base alone would split the substrate item and re-carve a carve.

## The carried defect set

Six items as reported by the chunked review against `session-locus-model` at `0c5dd045a`. **These are advisory
and unverified at this tier** — the originating triage spot-checked the packet's calibration on two unrelated
findings and adjudicated the in-scope set, but did not independently re-derive each carved item from source.
Grooming verifies every one against source before it becomes scope. Loci must likewise be re-resolved after that
unit integrates and its own Phase 7.E remediation lands, since several of these files change there.

- **Attach replaces a live lease using stale liveness evidence.** Attach reads the current record under lock but
  validates only the record ID, then passes the _pre-lock_ row's lease state into lease attachment. A lease that
  went dead → live before lock acquisition receives the old generation's dead classification, so attach can
  replace a live lease it never proved dead. `locus/command-runtime.ts`, `locus/mutation.ts`. (Reported twice —
  once per leaf, once at the root-A seam — and deduplicated.)
- **Spawned provisioning does not revalidate checkout head under the record lock.** The initial scan records the
  roster head; locked revalidation checks path, branch, detached state, and topology, but not the current head.
  The receipt can therefore attest to a stale checkout generation, and retained-branch pinning can be defeated.
  `locus/provisioning.ts`, `locus/provisioning-runtime.ts`.
- **Transient provisioning drops the selected parent generation.** Warm parent selection returns only a checkout
  path. Provisioning revalidates target topology and primary safety, then mints the child against that path
  without ever receiving the parent's record, role, or lease generation to revalidate. Concurrent parent removal
  or re-role leaves a child whose parent and session-home paths no longer name the selected authority.
  `errand/open.ts`, `locus/provisioning-types.ts`, `locus/provisioning.ts`.
- **Promotion's locked revalidation accepts a replacement lease and reports the stale ID.** Target and parent
  revalidation require the same process anchor but not the observed lease ID, and the receipt is built from the
  stale pre-lock row while the current parent lease may already be released. Same-process release-and-reattach
  can therefore authorize mutation of a new lease generation and report the old one.
  `errand/promote-runtime.ts`.
- **Marker exact-generation replacement and removal are TOCTOU.** Replacement rechecks bytes before a later
  rename; removal compares before a later unlink. Another writer can install a new generation in the gap, so
  concurrent provisioning or promotion can overwrite or delete marker authority it never observed.
  `git/worktree-marker.ts`.
- **No failure-injection coverage across destructive lifecycle boundaries.** Owned tests exercise mark-execute
  and pure helpers but never drive groom or housekeep open/close/settle across occupancy removal, ref deletion,
  and identity publication — so stranded-generation paths survive a green suite. This is the substrate item; the
  originating unit kept targeted per-path coverage for the fixes it landed and carved only the systematic matrix.

## Recorded risk this carve accepts

`session-locus-model` ships with known race windows between concurrent sessions on the same machine: a stolen
lease, a receipt attesting a stale checkout generation, a child bound to a superseded parent, a promotion receipt
naming a released lease, and a lost marker generation. Every carved item's consequence is a _wrong or stale
authority binding_ — the originating unit kept in scope every member whose consequence was destroyed or stranded
work, including abandon losing its generation before destructive dispatch, partial settlement mutating another
session's capture, leave mutating a checkout ahead of its locked proof, promotion retiring the wrong identity,
and inbox adoption losing its source digest. This is a stated position, not an oversight.

## Open forks for grooming

- **What is the capability?** An opaque token minted at selection and redeemed under lock; the exact record
  bytes carried forward and compared; or a re-read-and-compare discipline at each lock site. These differ in
  cost, in how much they constrain the driver interfaces, and in whether a caller can forge one.
- **Where does revalidation belong?** Inside each mutator, or hoisted into a shared lock-acquisition wrapper
  that refuses before any driver runs. The second is more uniform but assumes every mutation is expressible
  through one entry shape.
- **Marker atomicity.** Serialize every marker writer under one shared lock, or replace compare-then-rename with
  a genuinely atomic generation primitive. The second removes the class of defect rather than narrowing it.
- **Cross-record ordering.** Parent-and-child revalidation needs two records held at once; deterministic
  record-ID ordering already exists for the rename rekey and is the obvious candidate to generalize.
- **Substrate scope.** Whether the failure-injection matrix is a test helper, a fault-injecting IO seam, or a
  driver-level harness — and whether it should cover the work-unit lifecycle too, not just transient operations.
- **Does this subsume anything already shipped?** The stale-lock break protocol and the staged provisioning
  receipts were both deliberate keeps in the originating unit's right-sizing audit. Grooming should check
  whether the contract makes either redundant rather than layering on top.

---
