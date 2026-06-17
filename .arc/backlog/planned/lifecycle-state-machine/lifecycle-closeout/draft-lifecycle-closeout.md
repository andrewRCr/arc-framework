# Draft: Lifecycle Closeout

- **Origin:** [internal] — `lifecycle-state-machine` cohort member (decomposed 2026-06-14). The
  global-consistency tail: runs only once the four prior members have landed their code + local docs.
- **Cohort:** `lifecycle-state-machine`
- **Purpose:** Leave the corpus **consistent**, not merely functional-in-parts — the cross-cutting documentation
  propagation (verb renames, vocabulary, lifecycle-workflow rewrites) concentrated into one auditable final member,
  plus the final consistency audit that certifies the shipped substrate matches the model. The realization of the
  cohort's consistency-on-exit standard.

> Shared context — the consistency-on-exit standard, the closeout criteria, and the shared model the sweep
> documents — lives in `cohort-lifecycle-state-machine.md`.

---

## Inbound Buffer — Pending Integration

> *Routed-in concerns pending holistic integration into the body at this WU's next planning iteration*
> *(`drain-inbox § 5`); each carries its origin. Integrate — or consciously reject — at iteration.*

### `[ ]` **Own the lifecycle verb/term-register check (re-homed from `idiomatic-alignment`)**

- *Routed from:* `USER-INBOX § Backlog` — consolidates three captures (`Active`-phase-vs-`active`-location
  collision; `graduate → promote` verb-vs-concept; "register check has no real owner"), housekeep drain
  (2026-06-17); captured during `lifecycle-transition-core` Tasks 6.4 / task-gen (2026-06-14 → 06-16).
- *Concern:* the cohort doc, this draft, and inbox entries all routed verb / term-register work to
  `idiomatic-alignment`, but that WU's draft is about knowledge-format norms and **explicitly excludes** "renaming
  ARC's internal vocabulary" (§ Scope boundary) — so the register check was **ownerless**. It lands here because
  closeout already owns the cross-cutting verb sweep + final consistency audit. Three sub-items:
    - **Verb naming** — `start` / `park` / `promote` / `demote` / `reopen` / `abandon` register coherence.
    - **`graduate → promote` verb-vs-concept** — the verb shipped as `promote` (+ `demote`), and there is **no
      `graduate` verb** in the transition table, but "graduation" / "the readiness ladder" also names a *concept* in
      `strategy-work-planning` (×7), `strategy-planning-module` (×5), `strategy-work-organization` (×11). At
      create-spec, **settle explicitly whether "graduation" survives as the ladder concept or is fully replaced**
      *before* the sweep, so it isn't a blanket find-replace that silently kills the concept.
    - **`Active` phase vs `active` location collision** — the phase value `Active` (`WorkUnitState`) and the
      location `active/` reuse one word for two axes (maturity vs. engagement); sharpest in the parked case
      (`State: Active` while in `backlog/planned/`). A cascade (enum + dirs shipped), not a local rename.
- *Also:* correct the phantom `idiomatic-alignment` references in the cohort doc + this draft, and confirm this
  re-home (alt: a dedicated register WU — decided *here* at drain, 2026-06-17).

### `[ ]` **Reconcile the "no meta-less draft" position across all public-facing surfaces**

- *Routed from:* `USER-INBOX § Backlog` (`WU_Target: lifecycle-closeout`), housekeep drain (2026-06-17); captured
  during `lifecycle-transition-core` (2026-06-15).
- *Mandate:* audit & reconcile the "no meta-less draft" position across **all** public-facing surfaces — shipped
  docs, strategies, templates, lifecycle / planning workflows, code comments — so ARC holds one consistent position.
  Rides closeout's existing cross-cutting doc sweep + final consistency audit, not a separate hand-pass.
- *Known starting hit:* `draft-design.md` (the "under partial protection… no meta file may exist yet" clause)
  directly contradicts the position and must be revised. Not exhaustive — the audit is the discovery mechanism.
- *Boundary:* governs **drafts / WU artifacts**, not **errands** (legitimately meta-less `chore/<slug>`;
  `errand-lattice` owns that contrast) — don't over-correct errand-no-meta language while fixing draft-no-meta.
- *Position to enforce* ("Branchless ≠ recordless", authored into `spec-lifecycle-transition-core.md` §12): a draft
  is always meta-bearing — accompanied by a meta from inception (a provisional / planned stub or an active Planning
  WU), never free-floating. Protection mode shapes only the ship layer (branch / PR), never the record; partial
  skips the branch, never the meta. A recordless artifact has no derivable lifecycle state.

### `[ ]` **Author a standalone `reopen-work-unit.md` ceremony + audit ceremony-corpus coherence**

- *Routed from:* `USER-INBOX § Backlog` (`WU_Target: lifecycle-closeout`), housekeep drain (2026-06-17); captured
  during `lifecycle-transition-core` Task 6.7.c (2026-06-16).
- *Concern:* `reopen` ships a verb (`Integrating → Active`, withdraw the PR) but has **no judgment-half ceremony
  workflow**; every other lifecycle verb has one. A verb↔ceremony coverage gap — but the verb is shipped + tested,
  so only the ceremony prose is missing (closeout's doc-consistency tail).
- *Proposed:* author a thin standalone `reopen-work-unit.md` (its own file — `reopen` is the inverse of
  `integrate-work-unit.md`, **not** a path inside `activate-work-unit.md`; own-file precedent is
  `deactivate-work-unit.md`). Drives `arc reopen [--keep-pr]`; judgment = the withdraw-vs-stay-integrating call; the
  verb owns the `set-phase`-only flip + PR close / draft.
- *Broader mandate:* while there, audit the whole ceremony corpus for coherence — verb↔ceremony coverage (any other
  shipped verb missing a ceremony, or a ceremony naming a retired / renamed verb), inverse-pair symmetry, and
  cross-reference integrity. Rides closeout's cross-cutting doc sweep + final consistency audit.

---

## Problem / Motivation

This cohort renames and reshapes verbs (`graduate → promote` + `demote`, `abandon` split out of `deactivate`,
`reopen` added, `start` becomes a full dispatch) and migrates transition mechanics to the CLI. The per-member
rule is **local consistency** — no member ships code whose own doc lags. But the *cross-cutting* sweep — the verb
renames propagated across every load-bearing doc, the lifecycle-workflow rewrites, the protection-mode ship-layer
documentation — is **global consistency**, and concentrating it in one final auditable member (rather than
scattering it) is how the cohort avoids shipping a half-migrated core whose authoritative definitions still
describe the old machine.

The rule: per-member docs update *with* their code (local); this member does the cross-cutting sweep + audit
(global). A pattern ARC has used before (the closeout doc-cascade member).

## Resolved model

### The cross-cutting documentation sweep

Propagate the cohort's verb/model changes across the durable surfaces no single member owns end-to-end:

- **`strategy-work-organization`** — the verb set, the `(phase, location)` model, the derived-state vocabulary
  (incl. the Parked render bucket), the `stub` required-fields *policy* (the contract is built in
  `lifecycle-transition-core`; the policy statement lands here), the protection-mode ship-layer framing.
- **The lifecycle workflows** — `init-work-unit`, `activate-work-unit`, `deactivate-work-unit`,
  `decompose-work-unit`, `integrate-work-unit`, `archive-work-unit`, `run-errand` — rewritten to the renamed verbs
  and the thinner judgment-only shells the CLI migration leaves (the workflow-shell boundary; coordinates with
  `composable-workflows`).
- **`DEV-RULES.ARC` / `AGENT-BRIEF.ARC`** — the verb vocabulary and any lifecycle-state language. (The errand /
  Atomic vocabulary entries are `errand-lattice`'s cascade; this member sweeps the WU-lifecycle verbs and
  reconciles the two so the combined vocabulary is coherent.)
- **Protection-mode shaping documentation** — the ship-layer property (mode shapes how a transition's commit
  lands, not the mutator bundle), the partial-relaxes-two-surfaces rule, the degrade-unknown-to-partial floor.

### The final consistency audit

The certifying pass: assert the shipped substrate matches the model — no documented-but-unbuilt transition, no
half-migrated mechanic, no doc describing the old verb set. The B1 code transition table (built in
`lifecycle-transition-core`) is the audit's mechanical instrument for the totality + encoding-consistency
invariants; this member runs the corpus-level static audit on top and is the gate the cohort's closeout criteria
key on.

## Open questions (→ create-spec)

- The exact surface inventory of the sweep (which workflow files, which strategy sections) — firms once the prior
  members' specs settle what actually changed.
- How much of the workflow-shell rewrite is this member's vs. deferred to `composable-workflows` (the markdown-tier
  fragment-cut owner) — a boundary to settle at this member's spec.
- Whether the final audit is a one-time manual pass or leaves a standing mechanical check (candidate: a structural
  guard asserting docs match the transition table).

## Dependencies

- **Cohort-internal:** `Depends On: lifecycle-state-resolver`, `lifecycle-transition-core`, `decompose-matrix`,
  `errand-lattice` — the tail; it sweeps what they shipped.
- **Forward-compat:** `composable-workflows` (the workflow-shell rewrite coordinates with its fragment-cut);
  `idiomatic-alignment` (the final verb-register check).
- **Downstream:** `finalize-parallelism` carries a `Depends On: lifecycle-closeout` edge — the lifecycle is coherent
  for its end-to-end trace once this member's audit is green.

## Continuity

- **Readiness:** formalization-ready in shape; the surface inventory is deliberately deferred to create-spec
  (it depends on what the prior members actually change), which is correct for a closeout member, not an open
  fundamental.
- **Next:** activate via `init-work-unit` Path A once the four prior members ship → `create-spec`.

---
