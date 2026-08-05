# ADR-033: Retire the Locus Record Store and Derive Checkout Roles

## Status

Proposed.

The decision is made and its planning is in flight (`session-locus-operability-hardening`); promote to Accepted
when that work unit integrates. Extends [ADR-032] — which stands, and whose decision this one subsumes — and
applies [ADR-025]'s doctrine-over-mechanism posture one layer down.

## Context

`session-locus-model` gave every ARC-managed checkout a durable role record (machine-local JSON under
`.arc/user/<id>/.internal/loci/`) and every session a process-anchored lease, with record-scoped locks,
generation-CAS mutation, staged provisioning receipts, and platform process inspectors. [ADR-032] removed the
liveness premise for transients. A system-level proportionality pass (2026-08-05) then asked the question no
per-mechanism audit had asked: should the layer exist at all?

Three findings, each instrumented rather than impressionistic:

- **Rework dominated construction.** ~45k combined lines for the locus/errand machinery; 58% of all commits to
  those paths are `fix` type; fixes outnumbered feature commits 3:1 inside the delivery stack that built it;
  nineteen off-work-unit fix errands; errand identity re-modeled three times; five follow-on work items existed
  to finish or repair what shipped.
- **The record store caches a derivation the code already performs.** The attach path re-mints a missing record
  from git facts — worktree roster, the per-checkout ownership marker, the checkout's `meta-*.md`, and the v3
  errand identity ref. Teardown authorizes from the marker alone. A cache of derivable state is what drifts, and
  it drifted in the field: correct lifecycle events (ship, park) elsewhere left records reporting
  `subject-unresolved` — success rendered in the vocabulary of corruption, with no verb to clear it.
- **The guarded failure is operator-scheduled.** The substrate arbitrates contention between one operator's own
  cooperative sessions — contention the operator schedules personally, which the model's own spec scoped out
  ("concurrent duplicate opens sit outside ARC's operator scale") and which [ADR-025] already decided to govern
  by convention, not mechanism. Two sessions in one checkout is the two-editors-one-file class: worth an
  advisory, never kernel-grade mutual exclusion.

Consumer traces over the four load-bearing behaviors (session-init dispatch, errand exits, handoff, compaction
recovery) confirmed the substrate's load-bearing content is derivable, and isolated what is genuinely not.

**Alternatives considered.**

- **Harden the substrate** (contain stop scopes, attribute diagnostics, add a retired-subject state, fix the
  fail-toward-`dead` mapping). Rejected: four adversarial passes over that plan each overturned the same region,
  and every fix repaired a symptom of state that need not exist. This was the working plan before the
  system-level pass; its faults were real, but they were the substrate's, not wiring.
- **Keep the records, drop only the leases.** Rejected: the records' remaining content is a cache of marker +
  meta + identity-ref facts, and the cache's staleness — not its leases — produced the corruption-vocabulary
  failures. Deriving from the sources removes the invalidation problem instead of solving it.
- **Retire the substrate and derive roles (chosen).**

## Decision

We will retire the durable locus record store and leases entirely, and derive checkout roles at read time.

- **The checkout is the locus.** A checkout's role derives from four existing sources: the git worktree roster,
  the per-checkout ownership marker, the work-unit meta present in the checkout (with the completed index
  consulted so a shipped subject reads as retired), and the v3 errand identity ref. **Marker and meta are the
  oracle; branch is corroboration only** — deriving a role from branch shape is the anti-pattern this rule
  exists to block.
- **Every transient occupancy writes the ownership marker, the primary included.** One polarity: the free
  primary is clean + on base + marker absent. The marker carries the transient's subject and claim, the
  warm-return parent checkout path, and the partial-errand origin entry. It carries no promotion state.
  Machine-local paths live on machine-local state; the synced identity ref carries none.
- **Promotion provenance lives on the promoted WU meta.** An immutable optional `Promotion Receipt` binds the WU to
  the exact originating Errand slug and claim ID. It is committed before settlement and becomes lost-response
  replay authority after identity removal; ordinary WUs omit it.
- **No role mints a lease, and no path consults process liveness.** Occupancy questions resolve from git and
  marker facts; a claim-ending exit (close, abandon, remove) that cannot establish authority from its own
  checkout routes to subject-scoped operator confirmation. Keeping work alive proceeds; ending it confirms.
- **Containment holds by construction.** Entry, recovery, and exit read the session's own checkout's
  derivation; no repository-wide aggregation can stop them. Discovery surfaces (in-flight identities, staleness
  sweeps) stay repository-wide and advisory.
- **The retained set is deliberate:** the identity ref and its complete-basis version-checked transaction, the
  ownership markers, staged provisioning receipts, and teardown's full git-fact guard set. Each has traced
  consumers the retirement never touches.

**Decision refinement (2026-08-05):** A later promote-path consumer trace settles the promotion and parent carriers
more precisely. `Promotion Receipt` remains ARC-only execution provenance rather than an external-PM field. The
existing identity record remains until inbox settlement succeeds; its removal commits the terminal transition. A
primary transient marker is removed, while a spawned marker converts to WU ownership and preserves only spawn
provenance. Every transient occupancy, including the physical primary, writes the machine-local marker, so
`parentCheckoutPath` never enters the synced identity ref.

## Consequences

### Positive

- **Checkout faults cannot travel.** A degraded, stale, or mid-lifecycle checkout has no global record through which
  to stop unrelated work. The retained shared identity ref may still fail an identity mutation closed when its
  complete authoritative basis is malformed or conflicting.
- **Correct lifecycle completion reads as success.** No record outlives its subject, so shipping and parking
  produce no corruption diagnostics and nothing to clean by hand.
- **Sandboxed harnesses are first-class.** No path asks a question a sandboxed reader cannot answer.
- **On the order of half the subsystem deletes**, with its fix stream — the dominant cost was not the initial
  build but the repair rate the substrate sustained.

### Negative

- **No automatic detection of two sessions in one checkout**, accepted per the operator-error posture above.
- **The compaction seed loses its same-checkout session discrimination** (the lease token was its only carrier);
  harness-level session-keyed recovery markers cover the practical case.
- **Handoff and compaction recovery are redesigned, not trimmed** — their frames re-derive from checkout facts
  and the marker-carried parent link.

### Risks

- **Branch-shape creep.** The derivation must stay keyed on marker + meta; a future convenience that infers a
  role from a branch name re-acquires the pre-model failure class. The retirement work carries a mechanical
  boundary: authority-only inputs exclude branch/HEAD, a separate corroborator can only preserve or unresolve an
  already-derived subject, and invariance tests hold authority facts constant across branch/HEAD variation.
- **One CAS surface remains load-bearing.** The identity ref's transaction is now the sole multi-writer discipline;
  its refuse-on-unreadable posture must not be relaxed. A provisional `identity-conflict-recovery` stub records a
  possible lossless operator resolver, to be promoted only if practical evidence shows it earns commitment.
- **If positive liveness is ever wanted**, the portable mechanism remains the one [ADR-032] records: an advisory
  file lock held open by the session and kernel-released on exit — never a recorded PID, and never a durable
  record store. Reaching for either re-acquires every finding above.

A process lesson rides this record: the substrate grew by locally-reasonable, agent-recommended increments, each
approved without the system-level question being asked. Per-mechanism audits answered "does it earn its keep"
correctly while the layer itself did not; proportionality review must also ask "should the layer exist."

## Amending This Document

<!-- Reserved for post-implementation learnings per the three-tier amendment model
     (strategy-adr-methodology.md). Append dated annotations as `**Amendment (YYYY-MM-DD):** …`. -->

---

[ADR-025]: adr-025-concurrent-work-by-convention.md
[ADR-032]: adr-032-stop-binding-transient-roles-to-process-liveness.md
