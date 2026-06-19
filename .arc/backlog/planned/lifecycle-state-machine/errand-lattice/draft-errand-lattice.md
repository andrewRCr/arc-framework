# Draft: Errand Lattice

- **Origin:** [internal] — `lifecycle-state-machine` cohort member (decomposed 2026-06-14). **Absorbs the retired
  `maintenance-errand-class`** (its errand-vs-WU character gate, the "relocates-never-authors" invariant, and its
  vocabulary/definition cascade were folded into the origin lifecycle draft this member carries forward).
- **Cohort:** `lifecycle-state-machine`
- **Purpose:** Model the errand lifecycle as a **distinct lattice adjacent to** the `(phase, location)` WU
  lattice, name its crossing edges, redefine the errand-vs-WU gate from *increment-count* to **character**, and
  cascade that definition across the load-bearing docs — so a gapless lifecycle machine has a real entry predicate
  where multi-step single-concern maintenance currently falls through.

> Shared context — the WU lattice, the crossing-edge firing points (`lifecycle-transition-core` owns them), and
> the cohort-level coordination — lives in `cohort-lifecycle-state-machine.md`.

---

## Inbound Buffer — Pending Integration

> *Routed-in concerns pending holistic integration into the body at this WU's next planning iteration*
> *(`drain-inbox § 5`); each carries its origin. Integrate — or consciously reject — at iteration.*

### `[ ]` **Evaluate a thin `arc errand` verb surface (open/close + crossing edges)**

- *Routed from:* `USER-INBOX § Backlog` (`WU_Target: errand-lattice`), housekeep drain (2026-06-17); captured
  during `lifecycle-transition-core` close-out (2026-06-17).
- *Concern:* after `lifecycle-transition-core`, the WU lattice has a full CLI verb set while errands have only
  `arc errand check`. The errand mechanics (`run-errand` Launch / Complete) are hand-run markdown — cut
  `chore/<slug>` off base (+ optional ephemeral worktree), on complete reap branch / worktree + prune + drop the
  slug-matched inbox entry — exactly the "markdown ceremony restating mechanics" the cohort retires for WUs. Live
  drift: the release wrapper refuses errands (`no-active-wu`) so commits / pushes hand-fell-back to raw git.
- *Proposed:* a **thin** surface — `arc errand open` (Launch locus setup) + `arc errand close` (Complete teardown),
  plus the crossing edges this WU already scopes (inbox→errand, errand→WU promotion). Scoped **smaller** than the WU
  verbs: errands carry no meta record / no `(phase, location)` / no relocation (state derived from branch + PR), so
  no record-mutation or git-mv staging surface — the relocate+rewrite staging bug can't exist here. Resolve errand
  state from branch + PR, never a stored record.
- *Coordination:* the wrapper's no-active-WU acceptance (errand commits / pushes) is **extracted as its own
  standalone work unit** (carved out of `interlock-release-refinement` entry #1, 2026-06-17) — recurring friction
  worth fixing ahead of this WU rather than gating on it. `errand-lattice` assumes that fix has shipped; **no
  `Depends On` edge.** The coupled facets (archival-ceremony tooling, errand approval-collapse) stay in
  `interlock-release-refinement`.
- *Scope guard:* keep this scoped to the errand lattice — do **not** generalize into a "supporting lifecycles"
  catch-all (cohort-doc lifecycle and inbox / housekeep already have owners).

### `[ ]` **Errand identity should be record-owned, not branch-prefix-derived (arc-backend forward-compat)**

- *Routed from:* `USER-INBOX § Backlog` (`WU_Target: errand-lattice`), housekeep drain (2026-06-19); captured
  during `lifecycle-mechanics-tail` forward-compat check (2026-06-18) against storage-evolution / arc-backend.
- *Concern:* errands are intentionally record-less today — identity + state derive from the `chore/<slug>` branch
  (+ PR), and `errandSlugOf` (`lib/session-init/errand-branch.ts`) recovers the slug by parsing the branch prefix.
  The arc-backend / storage-evolution direction (Principle 5) names "inferring WU state from branch existence" as
  an anti-pattern: logical identity should be a record/field with the branch a projection, so a branchless errand
  record can exist in a multi-developer backend.
- *Scope:* errand-lattice owns the errand-lifecycle model, so it should reckon with whether errands need a logical
  identity record (slug owned in a record; `chore/<slug>` derived from it) rather than the branch being the
  identity oracle. Not a v1 blocker — `lifecycle-mechanics-tail`'s errand branch-cut consumes the slug as a logical
  input and treats `chore/<slug>` as the projection, so it stays forward-compatible — but the durable
  errand-identity model is this WU's call.
- *Optional cheap adjacent:* an `Arc-Maintenance:` commit trailer for reliable chore-filtering (`draft-arc-backend`
  § Decoupling (d)).

### `[ ]` **Codify cut/occupy consumer contract — `arc errand cut` creates, callers occupy (audit drain-inbox § 5)**

- *Routed from:* errand-lattice owns the errand-launch contract; surfaced live during a housekeep drain
  (2026-06-19) when `arc errand cut drain-inbox` left the session on `main` and the routing writes landed there
  until the release wrapper's branch-protection refusal caught it.
- *Concern:* `arc errand cut` is **creation-only by design** — it cuts `chore/<slug>` off the base and stops; the
  lib (`errand-branch-cut.ts`) and handler (`errand.ts`) both state that occupying the branch (an ephemeral
  worktree under full protection, or an in-place switch otherwise) is "the caller's protection-mode dispatch."
  That split is sound: the CLI can't pick worktree-vs-switch unilaterally (it depends on protection mode + worktree
  availability). `run-errand` § Launch step 3 honors the contract — it inlines "**Then occupy it:** spawn an
  ephemeral worktree … otherwise switch to it." But `drain-inbox` § 5 full-protection inlines only the `arc errand
  cut` command and *references* the occupy step ("see run-errand § Launch step 3") rather than stating it, so a
  linear reader cuts and proceeds to write without ever leaving the launch branch — the failure mode hit here.
- *Scope:* errand-lattice owns the errand-launch lifecycle, so the durable fix is to **codify the cut→occupy
  pairing as an explicit consumer invariant** (cut creates; every consumer workflow must immediately occupy per
  protection mode) and **audit consumers for inline conformance** — `drain-inbox` § 5 is the known under-spec
  (inline the "then occupy" clause, mirroring run-errand § Launch step 3); also check session-init's errand
  cold-entry. No CLI change — `arc errand cut`'s creation-only behavior is correct as-is.
- *Note:* per WORKING-MEMORY, code WUs can't use spawned worktrees yet (gitignored `node_modules`), so the
  in-place switch is the uniform safe occupy default until `finalize-parallelism` ships; a doc-grooming drain like
  this one is worktree-safe but follows the same in-place default.

---

## Problem / Motivation

Errands cross the WU lattice unmodeled, and the gate that admits them is wrong. The old implicit gate
(`atomic → errand`, `multi-step → WU`) leaves **multi-step single-concern maintenance homeless** — one logical
concern, several increments, no design to author: a decomposition, a housekeep drain that fans out, a doc-grooming
sweep, a ROADMAP re-render cascade. Forced into the WU wrapper each gets an empty `spec` + a `tasks` list that just
restates the inbox; forced into the atomic-errand wrapper it doesn't fit (not one increment). So it's hand-rolled
off-script every time. That hole sits exactly where the lattice's **entry predicate** belongs — a gapless model
needs the character gate.

## Resolved model

### The errand lattice (distinct, adjacent)

An errand has **no meta, no phase, no commitment-location**; its state is **derived from its `chore/<slug>` branch
and PR** (the shape session-init's `errandState` already computes): `in-progress` / `awaiting-merge` /
`merged-cleanup` / `stale`, plus `materializable` (remote-only, no local worktree). Under partial protection there
is no branch — the errand is a direct base commit and its lifecycle collapses to commit-then-done.

### Crossing edges (the borders the gapless machine must name)

- **inbox → errand** (`drain-inbox` execution transition): a committed atomic in `USER-INBOX` enters the errand
  `Launch → Execute → Integrate` lifecycle. Capture *holds*; the errand *is* its execution.
- **errand → WU promotion** (`init-work-unit` Promote Errand path): a `chore/<slug>` that crosses the WU threshold
  renames to `<type>/<name>`, mints a meta (`scaffold`), and enters the WU lattice at `Active` (commits already
  exist; no activation ceremony). The reverse is never modeled — a WU never demotes to an errand.
- **errand → completed/abandoned**: an errand ships (merge / direct base commit) or is dropped; neither writes a
  `completed/` archive (no meta to sweep) — the record is its branch + PR + merged commit.

The crossing edges fire the character gate at their judgment points; the firing points themselves live in
`lifecycle-transition-core`.

### The errand-vs-WU character gate

The gate is **character**, two paired questions:

1. **Does the work author/settle design, or relocate already-settled design?** A `spec` earns its keep only when
   there is design to *settle*; a `tasks` list only when there is settled design to *decompose into ordered steps*.
   Pure relocation/maintenance has neither.
2. **Does it write durable surfaces** (code, rules, strategies, methods, workflows) **or only movable planning
   artifacts** (drafts, metas, stubs, buffers, ROADMAP, inbox)?

**Author-no-design + touch-only-movable ⇒ errand-class even when multi-increment.** Size / increment-count is not
the gate. This pairs with the `Atomic` (capture-character) vs `Errand` (execution-wrapper) vocabulary split.

### The invariant that keeps it honest

A maintenance errand **relocates / grooms; it never authors at the home.** A destination needing real authoring is
routed *as* a future increment (a new stub, an inbound-buffer note, a spawned atomic errand), so the errand stays
errand-class even when one destination is a durable surface. (Live confirmation: the 2026-06-12 conductor
decomposition routed PR-sized boundary estimation *out* as its own atomic errand rather than editing a strategy
inline.) The errand envelope already has the right shape (chore-branch isolation, no `meta`/`spec`/`tasks`, derived
state) — the change is to the **gate's definition**, not a new wrapper.

### The cascade (this member's durable-surface deliverable)

The gate **design** is owned here; its prose cascade across the load-bearing definitions is this member's
deliverable (absorbed from `maintenance-errand-class` under the consistency-on-exit standard — leaving it deferred
would ship a lifecycle whose authoritative definitions still describe the old count-based gate):

- **`strategy-work-organization` § Errand Work Class** — restate the gate as character (author-vs-relocate +
  movable-vs-durable), not increment-count; name the multi-increment maintenance shape.
- **`DEV-RULES.ARC` "Atomic" vocabulary** — stop implying *errand ⇒ one increment*; settle whether "Atomic" stays
  the capture-character word while "Errand" (the execution wrapper) widens to admit multi-increment maintenance.
- **`AGENT-BRIEF.ARC`** — the Errand / Atomic vocabulary entries follow.
- **`run-errand` lifecycle** — admit a multi-increment single-concern maintenance errand (gated in chunks, one PR),
  not only the atomic one-increment shape.

## Open questions (→ create-spec)

- The vocabulary split (Atomic = capture character vs. Errand = execution wrapper) — does widening "Errand" muddy
  the `ATOMIC-INBOX` (atomic-only) semantics? Likely not (multi-step work never lives in the atomic inbox), but
  confirm.
- Whether the multi-increment maintenance shape earns a distinct *name* in the vocabulary, or is just "an errand
  that spans increments."

## Dependencies

- **Cohort-internal:** `Depends On: lifecycle-transition-core` (the crossing-edge firing points — errand→WU
  promotion's `scaffold`/mint, inbox→errand — live there).
- **Coordination seam with `decompose-matrix`:** that member's backlog-stub-source / heterogeneous-home arms *are*
  errand-class decomposition; whether `decompose` runs as a multi-increment errand keys on this gate.
- **Relationship to `drain-inbox`:** already multi-increment and spec-less — this redefinition legitimizes the
  shape it already has rather than treating it as a special case.

## Continuity

- **Readiness:** formalization-ready. The gate (two paired questions), the invariant, the lattice, and the cascade
  targets are settled; the vocabulary-boundary open questions are create-spec detail.
- **Next:** activate via `init-work-unit` Path A once `lifecycle-transition-core` ships → `create-spec`.

---
