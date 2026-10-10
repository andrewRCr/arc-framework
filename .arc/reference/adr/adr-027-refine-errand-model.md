# ADR-027: Refine the Errand Model — Spec-Worthiness Floor and Record-Owned Identity

## Status

Accepted (2026-06-21).

Authored alongside the `errand-lattice` work unit (`lifecycle-state-machine` cohort) and accepted at its
integration.

## Context

[ADR-021][adr-021] introduced the **Errand** work class — a wrapper-optional class for work that needs no meta file
or lifecycle — and set its threshold: a Work Unit is warranted when work spans **more than one review increment**,
carries design that must be authored, or must be tracked / resumed. Its 2026-05-31 amendment re-pivoted the
_realization_ (an Errand is execution-only; state derives from its branch + PR) but left the threshold and the
identity model intact.

Building the errand lifecycle as an explicit lattice — the gapless-lifecycle goal of the `lifecycle-state-machine`
cohort — surfaces two faults in that intact core:

- **The wrapper floor was read against the wrong quantity.** ADR-021's "more than one review increment → WU" is
  sound when "review increment" means an approval gate — but in practice it was read against _commit / step count_,
  so a determinate, single-concern maintenance sweep — a decomposition, a doc-grooming pass, a ROADMAP re-render
  cascade, a housekeep drain that fans out — got forced into the WU wrapper, where it earns an empty spec and a task
  list that just restates the inbox. Such a sweep is **one logical concern reviewed once** (one review increment)
  with no design to author, however many commits it lands in; counting commits mis-files it. The durable fix is to
  state the floor as **spec-worthiness** directly — which grounds _why_ one review increment suffices: the concern
  is determinate, with no design to author and no substantial grounding to navigate.
- **Errand identity is derived from the branch.** `chore/<slug>` is the identity-and-state oracle; identity is
  parsed from the branch name (`errandSlugOf`). Under partial protection there is no branch at all, and inferring
  identity from branch existence is the storage-evolution Principle-5 anti-pattern. ADR-021's re-pivot removed the
  on-branch `errand-*` file but left identity coupled to the branch.

A gapless machine needs the floor re-based off increment-count and a coherent identity model across both protection
modes. Full requirements and the worked design live in `spec-errand-lattice.md`.

## Decision

We will refine the Errand model along three axes. None reverses ADR-021's taxonomy (Errand remains a
wrapper-optional class, execution-only, tracked by git history); each corrects a basis ADR-021 left in place.

1. **Re-base the wrapper floor onto spec-worthiness — two independent floors.** The errand-vs-WU boundary is
   decided on the same two intrinsic axes that drive `Class`, **either of which alone** warrants a Work Unit:
   **derivation** (is there design to be _worked out_ — requirements or a referenced spec — however clear the
   result reads once settled?) and **scale** (does correct execution need a **durable, cross-session plan** — a
   tracked decomposition that outlives the session, validated against a spec?). An **Errand** is the **atomic work
   character** — a single, indivisible self-evident concern bounded to one session — sitting **below both** floors,
   validated by intent + diff + review; a **Work Unit** is **spec-worthy** and _composite_ (it decomposes into
   tracked work and may span sessions), clearing _either_ floor. The floors are independent: needing design is
   sufficient on its own, regardless of whether a durable record turns out strictly necessary — the act of
   _deriving_ is the signal, and ARC records it either way.

   **Review-increment count is decoupled from the gate.** An errand stays **atomic in character** throughout — the
   concern is one indivisible whole; only how that whole is _reviewed_ and _committed_ varies. It is **typically**
   one review increment, often a single commit — its prototype and common case. But a determinate single-session
   concern may be reviewed in a **bounded few in-session review passes** — the **extended errand** — without
   becoming a Work Unit: staging review for reviewer ergonomics crosses neither floor. What crosses the **scale**
   floor is needing a _durable_ plan, not needing a second pass. **Commit-count and review-pass-count both drop out
   of the gate**; concern-count stays
   (multi-concern always decomposes). The errand is the shared sub-floor of one work-sizing spectrum, not a
   cardinality gate.

   **Single-session binding is the errand's structural identity.** An errand carries no durable context machinery —
   no meta, no SESSION-NOTES, no task list — so it is bound to a single session by construction. Pause/resume is a
   thin git-state fallback (`commit WIP + push`; reconstruct from the branch diff + the originating capture), safe
   _only_ because errand work is determinate (remaining scope legible from the diff). Needing durable cross-session
   context or a tracked plan **is** the scale floor → Work Unit — which is precisely the machinery (meta +
   SESSION-NOTES + task list) durability requires. So the two floors, the single-session identity, and the
   pause-safety test are one statement seen from different sides.
2. **Model the Errand as one character with a mode-scaled mechanism.** The errand-vs-WU _character_ is universal —
   one judgment learned once. Its _mechanism_ is a projection of `branch.protection`: under **partial** protection a
   direct base commit tracked by its `standalone (...)` footer (no branch, no lifecycle); under **full** protection a
   short-lived branch + PR with a derived lifecycle. The collapse to a near-zero mechanism under partial is the
   correct treatment — no full-protection apparatus is pushed onto the partial floor for symmetry.
3. **Give the full-protection Errand a record-owned identity.** A full-protection Errand has a **logical identity
   record**, minted at launch, sitting behind the storage abstraction; the branch becomes a _projection_ of the
   record, never the identity oracle. State splits cleanly: **identity** (which errand) resolves from the record;
   **merge status** resolves from a live PR read. The record is an **orphan state-ref holding a tree of per-slug
   blobs** at `refs/arc/user/{identity}/errands` — a dedicated ref (its own type) homed under the user-scoped family
   (its own scope) — **records-only**, never filesystem-materialized, synced via the existing user-state machinery.
   Concurrent distinct-slug creation union-merges; a same-slug collision rejects under non-fast-forward. Once
   identity is a record property, errand branches become nature-typed (`fix/` / `refactor/` / `chore/`) and the
   branch-parse (`errandSlugOf`) retires.

## Alternatives and Rationale

**New ADR over amending ADR-021.** The gate re-base _alters_ ADR-021's threshold basis — a Decision-altering change
the methodology routes to a new ADR, not an append — and record-owned identity is a genuinely new architectural
decision with its own rejected alternatives. A new ADR keeps ADR-021's point-in-time taxonomy intact while capturing
the matured model, matching how this cohort minted ADR-026 rather than amending ADR-019. ADR-021 is **not
superseded** (its taxonomy stands); it receives a forward-pointer amendment.

**Record location** — three rejected:

- _On the Errand's own branch_ — designed out at ADR-021's re-pivot (execution-only, no `errand-*` file); re-couples
  identity to branch existence, the Principle-5 anti-pattern this decision removes.
- _A shared registry on `main`_ — churn and concurrency on the base branch.
- _A branch-namespace discovery hint_ — re-bends the branch-shape coupling we set out to remove, and permanently.

**Ref type — commit-attached notes vs. orphan state-ref (chosen).** Commit-attached notes tie a blob to a commit
SHA; the errand record must be commit- and branch-independent (the branch is the projection, not the anchor), so an
orphan state-ref holding a tree of per-slug blobs is the right shape, and it yields clean per-slug union/reject
semantics. Cost: ARC implements the tree-union explicitly (notes' built-in union-merge does not apply) — accepted;
the semantics are simple.

**Ref namespace — dedicated-under-user (chosen) over top-level or reuse.** A top-level `refs/arc/errands/{identity}`
is incoherent (identity-scoped but outside the user-scoped family); reusing `refs/notes/arc/user/{identity}`
co-mingles execution-intent records with personal session-notes content and mismatches the ref type.
`refs/arc/user/{identity}/errands` is dedicated _and_ homed under the user-scoped family.

## Consequences

### Positive

- A determinate maintenance sweep — even a sizable one — runs on-script as an Errand instead of being forced into an
  empty WU by its volume: one self-evident concern, reviewed once or, when large, in a bounded few in-session passes
  (the extended errand), keeping the WU namespace free of design-less entries.
- One errand concept spans both protection modes — learned once, with a mechanism that scales, rather than two
  models to reconcile.
- Errand identity is decoupled from the branch: a `fix/`- or `refactor/`-prefixed branch is unambiguously an Errand
  because the _record_ marks it, fixing the Principle-5 coupling and giving an abandoned free-description errand a
  recoverable intent record instead of an orphaned bare branch.
- The record is storage-agnostic — records-only, behind the storage abstraction — so it re-homes onto the eventual
  backend record substrate with no reshape.

### Negative

- A new synced ref (`refs/arc/user/{identity}/errands`) joins the user-notes ref, and ARC must implement its
  tree-union / reject merge explicitly rather than inheriting git-notes union.
- The errand → WU boundary carries irreducible judgment — but it is the same judgment `Class` already owns, and
  the errand → WU promotion edge, with its deterministic mechanics handled by the CLI (branch preserved, meta
  minted, record retired, routed to the right planning stage), makes a mis-call cheap to correct.
- The errand ref inherits the partial-push cross-machine visibility gap the user-notes ref already has; closing it
  is `cross-machine-sync-coherence`'s concern, not this decision's.

### Risks

- _Gate mis-application_ (a spec-worthy concern run as an Errand). Mitigation: the errand → WU promotion edge, with
  housekeep as the authoritative re-triage.
- _Same-slug cross-machine collision._ Mitigation: version-checked (non-fast-forward) reject with a surfaced
  collision, never a silent overwrite.

## Amending This Document

<!-- Reserved for post-implementation learnings per the three-tier amendment model
     (strategy-adr-methodology.md). Append dated annotations as `**Amendment (YYYY-MM-DD):** …`. -->

**Amendment (2026-10-09):** [ADR-037][adr-037] refines this decision. ADR-037 replaces the derivation test with the
record test; the two-floor structure, Errand mechanism, and record-owned identity stand.
Neither record is superseded.

---

[adr-021]: adr-021-introduce-errand-work-class.md
[adr-037]: adr-037-decide-errand-boundary-by-record-test.md
