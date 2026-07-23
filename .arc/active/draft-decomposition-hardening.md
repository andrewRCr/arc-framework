# Draft: decomposition-hardening — harden the shared WU lifecycle-transform substrate for the parallel era

- **Origin:** [internal] — routed from `USER-INBOX § Work Unit` at the housekeep drain (2026-07-07); captured
  during `roadmap-tooling` grooming, 2026-07-06. Scope widened past the original cohort-less-split concern by the
  2026-07-19 consolidation (three transform-hardening captures folded in), then **widened again 2026-07-23** from
  "harden `decompose`" to "harden the shared lifecycle-transform **substrate**" once the audit found the same
  parallel-era failure classes across `decompose`, `rename`, `abandon`, and `park`. Renamed
  `cohortless-decomposition` → `decomposition-hardening` (2026-07-23) via the shipped `wu-rename` verb.
  **Intended rename:** `lifecycle-transform-hardening` (reflects the widened substrate scope; cosmetic, mechanical
  move deferred — the originally-wanted `decomposition-machinery` is owned by a completed WU).
- **Purpose:** Make ARC's shared **lifecycle-transform substrate** — the machinery `decompose`, `rename`,
  `abandon`, and `park` all run over (retirement authority + receipts, the `reconcile-roadmap` side-effect, the
  lifecycle executor + index, the husk/teardown terminal) — correct under parallel multi-worktree operation. The
  substrate was designed in a pre-parallel ARC; every parallel-era assumption in it has now failed live, surfaced
  independently by two different verbs (`decompose`'s `cli-substrate-adoption` incident, `wu-rename`'s shipped
  residue). Harden it once, in the shared code, before `decomposition-doctrine` leans on decomposition more heavily
  and before more verbs re-discover the same gaps.

---

## Problem / Motivation

`decompose` / `rename` / `abandon` / `park` are not four independent verbs — they are **identity/retirement
transforms over one shared substrate**. That substrate was authored for a single-worktree, single-active-WU,
cohort-always ARC, and under multi-worktree operation its assumptions fail the same way regardless of which verb
trips them. Two verbs have already surfaced the same failure classes from opposite directions:

- **`decompose`** — the first live cohort decomposition (`cli-substrate-adoption`, 2026-07-18) could not execute
  the documented base-run contract (stopped `conservation-unproven`), missed a live cross-worktree dependent
  (`session-locus-model`, on another linked worktree) in its cut map, and ended with no owned terminal — the
  successor member (`cli-schema-kernel`) was launched by hand a session later. Adjacent: the cohort-always outcome
  forces a vacuous cohort node onto flat-sibling splits (`roadmap-tooling`, whose `assess-cohort-fit` verdict was
  "two flat siblings + one dependency edge, not a cohort" — a shape the primitive cannot express).
- **`wu-rename`** (shipped) — its first live spawned-worktree rename left post-ship residue captured to
  `USER-INBOX`: a **phantom ROADMAP row** (regen read a live/remote-ref oracle before the old branch was gone), an
  **incomplete reference sweep** (structured refs only; prose slug mentions left stale in sibling drafts), and an
  **occupied-worktree move that isn't husk-consistent** (POSIX slips the self-move guard).

These are the _same_ failure classes. `decompose` is more exposed on the ROADMAP-oracle one, not less: it defers
the origin branch reap to a post-merge `arc teardown --force`, so `origin/plan/<slug>` persists across the whole
transform + merge. With `decomposition-doctrine` set to make decomposition more frequent and parallelism GA making
every transform concurrent, the substrate must become boring, correct machinery — fixed once, not re-patched per
verb as each rediscovers the gap.

## The shared transform substrate — the unifying frame

The transforms share: **retirement authority + content-addressed receipts** (`.arc/.internal/retirement-receipts/`,
`wx`-exclusive — already concurrency-safe by construction), the **`reconcile-roadmap` side-effect**, the
**lifecycle executor + `lifecycle-index`**, and the **husk/`teardown` terminal**. The parallel-era assumptions live
in that shared code, so each verb inherits the same latent bugs:

| Failure class                                                                              | decompose                 | rename                                 | abandon / park            |
| ------------------------------------------------------------------------------------------ | ------------------------- | -------------------------------------- | ------------------------- |
| **Checkout-local view** (`buildLifecycleIndex(cwd)` / in-checkout sweep)                   | source + edges blind      | ref-sweep blind                        | retire-only               |
| **ROADMAP-regen oracle timing** (regen sees `origin/plan/<slug>` pre-delete → phantom row) | latent, **more exposed**  | ✅ **confirmed live**                  | share `reconcile-roadmap` |
| **Reference-sweep completeness** (mentions of a gone slug dangle)                          | `Depends On`-only         | ✅ **confirmed incomplete**            | n/a                       |
| **Non-self-healing residue** (terminal leaves orphaned branch/worktree/subdir)             | manual `teardown --force` | dir-name lags identity                 | share deferred teardown   |
| **Husk-consistency of worktree ops**                                                       | bespoke terminal          | ✅ **confirmed gap** (POSIX self-move) | park re-cuts on resume    |

**Root cause, stated once:** the transforms read a single **checkout-local** `lifecycle-index` (source units,
incoming and outgoing edges all come from one `cwd`-scoped scan), regenerate **shared artifacts** (ROADMAP) from
**live/remote oracles** rather than the staged tree, and leave **residue that does not self-heal** (the husk
self-healing sweep is stamp-gated, and only `teardown` stamps). The conservation gate then proves completeness
_against the run checkout only_ — internally consistent, silently partial across worktrees.

## Proposed direction — four substrate areas

Recast from the earlier five decompose-only areas. The old area 5 (slug rename) is **dropped** — superseded by the
shipped `wu-rename`; its post-ship residue is not follow-up errandry but _the same substrate concern_, now folded
into areas 3–4 as the rename facet. Areas 2 and 3 of the old set consolidate into area 1 (one root: the
checkout-local view).

1. **Authoritative cross-worktree inventory + receipt-driven edge reconcile** (consolidates old areas 2 + 3;
   write-side design settled 2026-07-23). Two halves — read and write.

   **Read.** Resolve the transform's source-unit and dependency-edge inventories against the **composed
   lifecycle-index** (`resolveComposedLifecycleIndex` — the project-readiness composition over the shared tree plus
   in-flight WUs across local and remote refs), _not_ the checkout-local `buildLifecycleIndex(cwd)`. The abstraction
   already exists and already sees the cross-worktree dependents `arc decompose` misses today — it is the index
   `arc status --project` uses — so the transform simply switches inventory source. This satisfies the storage
   check-doc directly (resolve against the WU-record abstraction, not a git-worktree enumeration the backend
   dissolves). **Degraded read:** the composed index is `unreachable`-degradable (remote read failed → local/tree
   truth only); record reachability in the receipt and **proceed conserving-against-the-reachable-set** rather than
   hard-refusing. Completeness is not forfeited: the receipt records the origin's retirement + replacement set
   (consultable by _any_ dependent), and the write-side reconcile is **dependent-pull** (below) — each dependent
   repoints against the receipt keyed on _its own_ `Depends On` edge when next touched, so a dependent invisible to a
   degraded origin read is never silently dropped; it self-reconciles or surfaces on its own next touch. The
   finalization compare-and-set is a **match / no-regression guard over the enumerated set** — it refuses if the
   prepared repoints don't hold, or if a now-reachable read enlarges the inventory — not the completeness mechanism
   for un-enumerated remote dependents. So a transient network failure never bricks the transform _and_ never
   silently drops a dependent.

   **Write — a receipt-driven `Depends On` reconcile side-effect.** The hard constraint is branch isolation _plus
   review-atomicity_: the transform must not commit to a dependent's branch — both because it isn't the transform's
   to write and because such a commit would land outside that branch's own review increment. So:
     - **Shared-visible dependents** (meta on the shared base / run checkout) repoint in-transform, inside the
       decompose commit — today's Leg 3, unchanged.
     - **Branch-private dependents** (meta only on another branch): the transform **records the repoint mapping in
       the retirement receipt** (already carried as `incomingEdges.replacementTargets`) and does **not** touch their
       branch. Each dependent's edges then **auto-reconcile against the receipt** — a **dependent-pull** reconcile
       that reads the dependent's _own_ `Depends On` and repoints each edge whose target carries a retirement
       receipt, generalizing the existing auto-discharge side-effect (`discharge-dep-edges`, which already rewrites a
       WU's own `Depends On` unprompted at activation). That precedent supplies the own-edge _rewrite_; the
       **receipt-discovery read** it needs — a subject-keyed "does this edge-target carry a retirement receipt?"
       lookup, since the lifecycle index resolves a retired origin only to `nonexistent` — is **new machinery**, its
       access-path kept abstract (storage check-doc Principle 2) and its concrete shape (receipt-dir enumerate /
       maintained subject index / decompose-time push) coordinated with `retirement-record-relocation`. It
       **applies and commits only at the write ceremonies that
       touch the branch — `activate` / `resume` / `integrate`** — landing the meta rewrite in that ceremony's commit
       (a dedicated `chore(arc):` write when it is the only change). **`session-init` is a detect-and-surface point,
       not a silent-apply one:** a non-committing recon stage, it flags a pending reconcile (or conflict) for the
       developer and defers the apply to the next write ceremony, never leaving an uncommitted meta edit to ride an
       unrelated increment. (This defer is scoped to the **tracked, committed** `Depends On` edge, whose write must
       ride a review increment; **gitignored per-developer user state** — area 4's `WU_Target` reconcile — carries no
       commit and no increment, so it auto-applies at `session-init` without atomicity concern.) Owned-and-clean
       reconciles are invisible at the apply ceremony; a genuine **conflict**
       (the edge changed incompatibly, or an un-enumerated dependent whose target member is ambiguous) surfaces as a
       version-checked reconcile.

   One mechanism, three apply ceremonies (`activate` / `resume` / `integrate`) plus the `session-init` detect point;
   `integrate` is the **fail-closed** one — a dependent whose receipt-recorded repoint cannot complete (target member
   gone, or a real conflict) fails its own integration rather than merging a dangling edge. This absorbs three earlier
   candidates (record-and-defer, the owned-dep convenience, a dangling-dep merge-gate) into one reconcile fired at
   multiple triggers: no nudge-to-authorize, no bolt-on gate.
   **Enforcement locus (settled 2026-07-23):** the fail-closed leg lands _here_, not in `review-gate-right-sizing`'s
   merge-guard — the integrate workflow's existing integration-interlock refuses to compose the candidate when an
   incoming edge cannot reconcile, the established integration path failing closed rather than a competing gate.
   RGRS's readiness check is a deliberately **closed request union** (`work-unit` / `errand`) that reads only the
   integrating WU's own products and is explicitly _not a generalized readiness engine_, so a cross-receipt edge
   reconcile has no socket there and would violate that containment. Any later host-side defense-in-depth rides
   RGRS's existing `coherent project-readiness view` readiness product, never a new merge-guard sub-criterion.
   **Decompose-time advisory:** the composed index already carries each dependent's `InFlightState`, so a dependent
   that is _mid-integration_ with a live edge to the retiring origin is surfaced at the Step-5 interlock for the human
   to coordinate — the transform does not silently proceed against it. (`Depends On` is a shrinking live-blocker list,
   so a still-present edge to a `Planning` origin is a real blocker, not stale lineage.) The reconcile's incoming-edge
   disposition set generalizes across the retirement verbs — `replace` (decompose → delivering members) and
   **`abandoned`** (abandon → drop + surface, no replacement) — so `abandon` joins the same mechanism instead of
   leaving dependents dangling with no record, as it does today.

   **Backend-forward.** The receipt + reconcile _is_ what a version-checked store write becomes: today it applies in
   the dependent's own git flow; under the materialized backing store it is the store's version-checked write applied
   at sync. The same receipt and mapping carry over — no lock-in (storage check-doc Principle 3).

2. **Cohort-less split shape** (old area 1). A first-class flat-sibling outcome — N siblings joined only by a
   dependency edge, no cohort node — across the three surfaces: an `assess-cohort-fit` verdict for it, a
   `decompose-work-unit` arm that skips cohort-mint, and a schema change. **Schema shape settled 2026-07-23:** a
   **new `parentPosition` value** (the cohort-_placement_ axis gains a no-cohort value) — **not** a new `shape`
   (the orthogonal origin-disposition axis: a cohortless split can be symmetric _or_ extraction) and **not** a
   boolean (the checkdoc anti-pattern). It omits `cohort` and places siblings flat rather than under a cohort dir,
   disambiguating today's overloaded "cohort omitted" case (which currently means only at-cap → existing parent).
   Today `parseCutMap` _requires_ `cohort` for every non-`at-cap` position and `scaffoldCohortMembers` always nests
   under a cohort dir — so the shape is inexpressible. Value name (`cohortless` / `flat`) is spec polish. Live
   instance: `roadmap-tooling`'s verdict. Adjacent rail to `cohort-cut-coherence` (what a cohort absorbs on exit) —
   coordinate, don't fold.

3. **Husk-consistent, self-healing transform terminal** (old area 4, widened). Make the transform's residue
   self-heal via the _same_ stamped-husk sweep the shipped-WU terminal uses, rather than a manual cleanup the human
   must remember. Concretely: the terminal **stamps a husk** (like `teardown`'s self-teardown defer) so
   `stale-worktree-sweep` reaps it at session-init; the verb emits **one CLI-owned lifecycle-complete result**
   covering branch/worktree teardown and user-workspace close; ready zero-dependency members are derived from the
   cut graph as a CLI slot, with a spawn-anchored launch **remedy** on a unique head (candidates surfaced, never
   auto-started) — not workflow prose orchestrating the sequence. **Rename facet:** the identity rename runs in
   place from any locus (branch / artifacts / remote / notes / marker — locus-safe); only the cosmetic worktree
   directory move defers — **unconditionally**, hoisted to an always-defer precondition (today the move defers only on
   an OS-reported occupied-dir lock, so on POSIX a self-move slips through, relocates the live worktree, and strands
   the running session; the fix mirrors `teardown`'s categorical refusal to operate on the worktree you're standing
   in) — stamped for a **new self-healing sweep surface** ("worktree path lags renamed identity →
   `git worktree move` from outside") that **reuses the shipped `stale-worktree-sweep` / husk-stamp mechanics** as an
   _operational stamped marker_ (a derived projection), **not** a new lifecycle-state term — so it consumes no
   unsettled `wu-lifecycle-state-model` vocabulary, and `rename` stays invokable from the to-be-renamed worktree,
   never primary-only. (Sweep surface settled 2026-07-23; exact marker name/shape is spec-polish, patterned on the
   existing husk stamp.) (Boundary question: the harness skills-dir registration going stale on rename is an
   adjacent harness-integration residue, likely not ARC-substrate scope — flag, don't silently absorb.)

4. **Shared-artifact regen & reference conservation** (promotes the ROADMAP-timing gap + the reference-sweep
   policy; reference policy settled 2026-07-23). Two halves.

   **Regen timing.** Render the in-transform ROADMAP from the **staged tracked-index projection** (deterministic, no
   dependency on remote-ref timing), fixing `wu-rename`'s confirmed phantom-row _and_ `decompose`'s more-exposed
   latent one in the shared `reconcile-roadmap` path.

   **Reference conservation.** The machine-vs-author boundary is drawn at **mechanical 1:1-rewritability**, and it
   falls differently per verb (`rename` is 1:1 old→new; `decompose` is 1:N-then-gone — an origin reference has no
   single target). By reference kind:
     - **Structured, unambiguous target** (`Depends On`, backticked artifact filenames, cohort headings):
       machine-swept for `rename` (extend the existing sweep); for `decompose`, `Depends On` rides area 1's receipt
       reconcile.
     - **Self-title H1 across every WU artifact + `--plan` anchor** (the WU's own identity): machine-swept for
       `rename` symmetrically over _all_ `*-{wu-slug}` artifacts — the meta's `# Metadata:` is already rewritten;
       extend it to `# Draft:` / `# Spec:` / `# Tasks:` / `# Notes:` / `# Research:` (any `# <Kind>: <slug>`) plus the
       `--plan <slug>` resume-anchor, so structural identity is fully reconciled and no artifact lands self-titled with
       the old slug (closes the capture-706 gap); N/A for `decompose` (origin artifacts removed).
     - **Backticked ref to a gone origin artifact** (`decompose`): machine-detected as dangling but **surfaced**, not
       auto-retargeted — no single member to point at.
     - **Prose / narrative slug mention** (both verbs): **surfaced, never auto-rewritten** (ambiguous target +
       false-positive risk on common-word slugs) — an advisory reconcile, not today's silent-stale.

   This reuses area 1's receipt + surface machinery, split by mode: mechanical refs reconcile automatically, judgment
   refs surface for the author. The reconcile spans **three loci**, one mechanism throughout — (1) tracked lifecycle
   tiers (`active/`, `backlog/planned|provisional/`), swept in-transform (the existing principled file scope); (2)
   other WU branches, recorded in the receipt and reconciled in that WU's own flow; (3) **user state** — `USER-INBOX`
   / `WORKING-MEMORY` / `SESSION-NOTES` carry _live, load-bearing_ cross-WU coordination (`WU_Target:` captures,
   ordering obligations) that does **not** regen, so it reconciles at the per-developer `session-init` locus (the
   transform cannot sweep gitignored, per-machine state — the same locus wall, one level out): structured `WU_Target`
   auto-reconciles in the owner's session-init under `rename` (surfaces under `decompose`), prose mentions surface.
   **Genuinely out of scope:** `completed/` (inert history) and adopter-facing `system/`/`reference/` (WU slugs must
   not appear there per Documentation Boundaries); `STATUS.USER` / `ROADMAP` stay out only because they regen.

**Cross-cutting — cohort-fit re-gate at spec (not now).** Held honestly against our own rails: `assess-cohort-fit`
is maturity-gated, and this widened design is still forming, so the cuts are not yet real → **iterate as one unit**.
Re-run `assess-cohort-fit` at create-spec once the substrate design is stable; if the areas prove orthogonal, this
WU decomposes via its own hardened machinery (a clean dogfood). Either way the review-size concern is covered
(`review-chunking` ships first — a large single WU reviews in chunks; a split delivers small members).

## Forward-compat constraints (from the three evolution check-docs)

Recorded as binding design constraints — the check-docs adjudicated the open forks and all push the fixes _into the
shared CLI substrate_ (per-verb prose patches would violate them, independently confirming the widening):

- **Storage-evolution** — resolve inventories against the WU-record _abstraction_ (Principle 1/5), never a
  git-worktree/ref-enumeration mechanism the backend target dissolves; cross-WU repoint is a version-checked write
  (Principle 3). Keep the retirement-record store access-path abstract (Principle 2) — coordinate its location with
  `retirement-record-relocation`.
- **Procedure-evolution** — the terminal, successor derivation, and dispatch are **CLI-computed** (Principle 1),
  emitted verbatim text is precomposed CLI-side (Principle 6), new arms land as **typed cut-map fields**, not prose
  conditionals (Principle 2); workflow prose invokes verbs, never narrates mechanics (Principle 3).
- **Knowledge-evolution** — the substrate is now a genuine multi-consumer fan-in (four verbs), so consolidating its
  shared vocabulary/guidance is on-model, not premature (Principle 6); the one new load-bearing term (flat-sibling)
  is defined once here, while area 3's rename sweep uses an **operational marker** (a derived projection) rather than
  minting terminal vocabulary — coordinating with `wu-lifecycle-state-model`, which may re-vocabulary that marker
  later without schema churn (Principle 7).

## Coordination

- `wu-lifecycle-state-model` — owns husk/terminal-state and transition vocabulary, **currently unsettled** (a
  `planned` inbound buffer; its own draft leaves the shipped pending-teardown terminal condition open between a
  named state, an annotation, or a derived projection). Area 3 therefore uses an **operational stamped marker** (a
  derived projection reusing the shipped husk-stamp sweep), minting no lifecycle-state term; `wu-lifecycle-state-model`
  may later re-vocabulary that marker into a named terminal state **without schema churn** — a right its own draft
  reserves. areas 3–4 consume its names where they exist, never mint parallels.
- `retirement-record-relocation` — owns the retirement-record store location; areas 1/3 read that store —
  coordinate on the path, including area 1's new subject-keyed **receipt-discovery read** (does a dependent's
  edge-target carry a receipt — which the content-addressed store does not answer today), not just transition
  semantics.
- `lifecycle-transition-core` — owns the `discharge-dep-edges` reconcile side-effect area 1's edge-reconcile
  generalizes; extend it (auto-discharge + receipt-driven repoint as one `Depends On` reconcile), never mint a
  parallel mechanism.
- `review-gate-right-sizing` — owns the merge-guard tier. **Boundary settled 2026-07-23:** area 1's `integrate`-time
  fail-closed reconcile lands _here_ (enforced at the integrate workflow's integration-interlock), **not** in RGRS's
  guard — its readiness check is a deliberately closed `work-unit` / `errand` request union that reads only the
  integrating WU's own products and is not a generalized readiness engine, so the cross-receipt reconcile has no
  socket there and RGRS's union stays closed. Any later host-side backstop rides RGRS's existing `coherent
  project-readiness view` product, never a new `arc-cleared` sub-criterion. This _is_ the alignment the
  working-memory colliding-gate caution asks for — no competing gate, and no wiring against the not-yet-operational
  controller.
- **`wu-rename` follow-up captures are co-owned here, not separate errandry** — `USER-INBOX` items "phantom ROADMAP
  row + prose-scope sweep" (area 4), "occupied-worktree move husk-consistent" (area 3), and "self-title rewrite
  across all WU artifacts" (area 4) are the same substrate concern; adopt them as this WU's evidence rather than
  fixing them per-verb.
- `decomposition-doctrine` — the demand driver (more cuts, earlier); soft precedence pairing, no hard edge.
- `pr-decomposition` — orthogonal axis (review-surface carving vs. concern splitting); keep the cut-map and chunk
  vocabularies distinct.
- **`assess-cohort-fit` has four pending editors** — this WU (cohort-less verdict), `decomposition-doctrine`
  (discriminator rebalance), `cohort-cut-coherence` (consistency-on-exit rail), and `pr-decomposition`
  (delivery-framing pass). Sequence the method edits at each WU's grooming close so one surface doesn't churn four
  ways.
- **Integration order** — `review-chunking` ships before this WU integrates (the `session-locus-model` ordering
  obligation resolves independently); a large candidate here reviews via `review-chunking`.

## Unknowns, open forks, and Class

- **Class: Heavy** (re-confirm at spec). The widening did _not_ ratchet to Novel — nearly everything is composition
  of existing ARC patterns, and the check-docs supply the models (staged-index render, version-checked writes, husk
  reuse, the `lifecycle-index` abstraction). High-end Heavy: broad surface, multi-verb blast radius, real forks.
- **Integrate-time fail-closed ownership** (area 1) — **settled 2026-07-23**: the `integrate`-time fail-closed
  reconcile lands _here_, enforced at the integrate workflow's integration-interlock, not in `review-gate-right-sizing`'s
  merge-guard (its readiness check is a closed `work-unit` / `errand` union, not a generalized engine — no socket for a
  cross-receipt reconcile; any later host-side backstop rides RGRS's existing readiness-view-coherence product). The
  degraded-read + trigger mechanics are pinned too: the reconcile is **dependent-pull** (each dependent repoints
  against the receipt by its own `Depends On` edge), so a degraded origin read never silently drops a dependent — it
  self-reconciles or surfaces on its next touch; the finalize CAS is a match / no-regression guard over the enumerated
  set; and `session-init` detects-and-surfaces while `activate` / `resume` / `integrate` apply-and-commit.
- **Flat-sibling schema shape** (area 2) — **settled**: a new `parentPosition` value (cohort-placement axis), not a
  new `shape` (origin-disposition axis) and not a boolean. Value name is spec polish.
- **Reference-conservation policy** (area 4) — **settled** (the 1:1-rewritability boundary; machine-sweep /
  detect-surface / surface by reference kind; three reconcile loci incl. per-developer user state). Residual is
  spec-time tuning: the prose-mention surface's false-positive scoping, and the `WU_Target` auto-reconcile's config
  gate.
- **Rename worktree-move sweep surface** (area 3) — **settled 2026-07-23**: a new session-init sweep surface reusing
  the shipped `stale-worktree-sweep` / husk-stamp mechanics as an **operational stamped marker** (a derived
  projection), minting no `wu-lifecycle-state-model` vocabulary; that WU may re-vocabulary it later without schema
  churn. Residual is spec-polish — the exact marker name/shape, patterned on the existing husk stamp.
- **abandon / park delta** — **settled**: `park` inherits for free (shares `reconcile-roadmap` + deferred teardown;
  slug persists → no incoming-edge concern). `abandon` does **not** — it does zero incoming-edge handling today, so a
  dependent of an abandoned WU dangles silently; bring it onto area 1's reconcile with the no-replacement `abandoned`
  disposition (drop + surface).
- **Rename-tier scope** — the active-WU identity rename (branch + worktree identity) vs. backlog-tier; area 3's
  in-place + deferred-move model is the leaning answer.

## Coverage audit status

The audit (2026-07-23) promoted the substrate findings above from incident-shaped captures to a mapped root cause,
so the deliverable set is no longer one-run-shaped. Residual: the parent-position arms (`in-cohort` → sub-cohort,
`at-cap` → lateral fan-out) and the non-symmetric transform shapes (`extraction` incl. extraction-from-Active,
`backlog-stub-source`, `heterogeneous-home`) have still never been _run_ under parallelism — but they read the same
checkout-local index and shared `reconcile-roadmap` path, so the root-cause fixes cover them structurally. A
confirmation pass over those cells stays a spec-time item, not an open unknown.

## Scope Estimate

**Large.** One coherent substrate (the shared transform machinery + its receipts) spanning schema, verbs, workflow
arms, session-init sweep surfaces, and linked-worktree tests, package-synced, with a multi-verb blast radius. The
areas are separable in delivery order but share the substrate core; worth its own `assess-cohort-fit` read at spec
time (above).
