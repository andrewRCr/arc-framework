# Draft: Cross-WU Coordination

- **Origin:** [internal] — routed from two `USER-INBOX § Work Unit` captures at the housekeep drain (2026-06-21),
  both surfaced during errand-lattice planning (2026-06-19) after a full landscape sweep of the backlog
  cohort/lifecycle domain, the planning + validation surfaces, the shipped cohort members, and the slug→state verb.
- **Purpose:** Make **cross-WU relatedness** a coherent discipline — a WU should be planned, built, and shipped
  with the work it bears on in view: pull related work in at planning, push refinements back at iteration, validate
  alignment at exit. Complements `lifecycle-state-machine` (which made the *lifecycle* a coherent machine); this
  makes *relatedness between related WUs* a coherent one.

---

## Structural decision (settle first at planning)

This stub deliberately holds the thinking as a **single WU** for now. The proposed end-state is a **cohort**, and
that cut is recorded below so it is not lost — but minting it (cohort dir + `cohort-*.md` + member split +
relocating an existing provisional stub) is **this WU's planning work**, not a housekeep-drain action. Decide at
first iteration: mint the cohort, or keep this as one WU.

### Recorded intent — mint the `cross-wu-coordination` cohort

If the cohort cut is confirmed at planning:

- **New cohort `cross-wu-coordination`** (planned grouping). Mint the cohort dir + `cohort-cross-wu-coordination.md`
  carrying the shared coordination (the relatedness spectrum, the unified planning hook, the bidirectional
  pull/push contract, and the boundaries below).
- **Member — `cross-wu-forward-compat`** (the existing provisional stub): `git mv` it under the cohort. It keeps
  its own provisional, premise-unvetted state until its own planning vets the cut. **Open structural question to
  resolve at the cut:** commitment today is directory-keyed (`backlog/planned/` vs. `backlog/provisional/`), so a
  provisional member under a planned cohort dir has no clean expression yet — settle whether the cohort tolerates
  mixed-commitment members, or whether the relocation waits until `cross-wu-forward-compat`'s premise is vetted.
- **Member — new WU** (name TBD; the cohort-coordination backstop): the explicit/cohort-relatedness end — read the
  cohort doc during planning, write refined contracts back to it, and a minimal verify-side member-responsibility
  check at `verify-work-unit`.
- **Likely dependency edge:** the explicit/cohort member ships first (proves the hook on a known candidate set),
  then `cross-wu-forward-compat` generalizes it to discovery. Settle direction at the cohort's planning.

## The gap

ARC has no real read/write backstop ensuring a WU is planned, built, and shipped with the work it bears on in view.
Concretely for a WU that is **already a cohort member**, the cohort doc is pulled in at only two points today:
session-init surfaces it passively in orientation, and `assess-parallel-fit` Tier 3 reads it for *parallelism
overlap* at activate / in-flight-scope-check. Everywhere it matters for the member's own work it is absent:

- `draft-design` / `create-spec` / `generate-tasks` run `assess-cohort-fit`, but that only decides *whether to
  split*; it never reads an existing cohort doc to check the member's declared responsibilities / sibling scope /
  shared contracts against the design taking shape.
- `verify-work-unit` and `integrate-work-unit` have **zero** cohort awareness — a member can ship scope that
  drifted from its cohort responsibilities or broke a shared contract and nothing catches it.
- Nothing writes a refined shared-contract **back** to the cohort doc when a member's planning changes an
  assumption siblings rest on.

The one comprehensive backstop, `decompose-work-unit`'s conservation gate + cohort-consistency invariants, fires
only at decomposition (cut) time and is structural. Net: tunnel-vision at every member-lifecycle stage except
activation's parallelism check.

## The shared concern (the cohort's spine)

A WU shouldn't be planned/built/shipped in isolation from the work it bears on — **pull related work in at
planning, push refinements back at iteration, validate alignment at exit.** The two members sit at opposite ends
of a *relatedness spectrum*:

- **Explicit relatedness** (the new member): the related set is *declared* — cohort doc + `Depends On` edges. The
  candidate set is known; the hard part is the read / write-back / verify discipline. Determinate and sharp; leans
  directly on the now-shipped `arc status <slug>` (see coordination note below).
- **Discovered relatedness** (`cross-wu-forward-compat`, the existing provisional stub): the related set must be
  *found* among arbitrary planned WUs. The hard part is the cheap relevance filter ("most WUs won't relate").

They share the **same planning-coordination hook** (one insertion point at `create-spec` / `generate-tasks` /
`arc-task-audit` — not two competing ones) and the **same bidirectional pull/push verb model**. That
shared-contract-no-single-member-owns is what justifies a cohort doc over a single broadened WU. (Why not just
rename/broaden `cross-wu-forward-compat` in place: forward-compat is one *mode* of cross-WU awareness, not the
whole — the name would lie once the cohort-specific half is folded in.)

## Cheap-first slice — shipped: surface + prescribe the slug→state resolver

`lifecycle-closeout` shipped the cheap-first slice: `arc status <slug>` appears in QUICK-REFERENCE § ARC CLI
Commands and DEV-RULES.ARC § Verify before assuming now tells agents to resolve a WU's lifecycle state by slug
rather than infer from directory, branch, or state-blind `Depends On` prose. This draft's coordination design can
lean on the shipped resolver directly.

The remaining cross-WU-coordination work is the broader read/write-back/verify backstop, not command surfacing.

## Boundaries (related stubs — don't merge)

- **`cohort-cut-coherence` stays standalone** (decided, not absorbed): it is a different phase and concern —
  cut-time decomposition **quality** (when you split a WU, leave the substrate coherent; a rail in
  `assess-cohort-fit` / `strategy-work-organization`), not lifetime **coordination** between related WUs. Its
  cohort-ness is incidental; its real domain is decomposition, so its natural neighbors are `decompose-matrix` /
  `assess-cohort-fit`. Absorbing it would make this a "cohort-themed grab-bag" rather than one concern decomposed.
  Record the adjacency; don't pull it in.
- **`lifecycle-closeout`** owns the *global* cohort consistency audit (cohort-tail, cross-cutting — wrong altitude
  for a per-member verify check).
- **`operational-state-docs`** owns the cohort-membership validator + the (shipped) slug→state substrate.
- **`assess-parallel-fit`** already reads the cohort doc (precedent/sibling for a "read the cohort doc" method).
- **`planning-iteration-mechanics`** owns the Inbound-Buffer drain ceremony (tangential).

## Coordination — the slug→state verb already shipped

The "CLI verb to check shipped state by slug" idea is **done** — `lifecycle-state-resolver` shipped
(`completed/2026-q2/24_…`) and `arc status <slug>` returns the lifecycle `state` enum (incl. `shipped`),
`occupied`, and `dependsOn` edge-states (JSON-able). The new coordination-backstop member can lean on it directly
to resolve sibling/member shipped-state cheaply, rather than the manual `completed/`-presence / ROADMAP check the
standing WORKING-MEMORY dep-edge-state-blindness note prescribes (that note's full discharge is still OSD's
dep-edge lifecycle resolution; the cheap-first slice above only addresses the read).

---
