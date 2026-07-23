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
   hard-refusing — the finalization compare-and-set re-checks at finalize, so a transient network failure never
   bricks the transform.

   **Write — a receipt-driven `Depends On` reconcile side-effect.** The hard constraint is branch isolation _plus
   review-atomicity_: the transform must not commit to a dependent's branch — both because it isn't the transform's
   to write and because such a commit would land outside that branch's own review increment. So:
     - **Shared-visible dependents** (meta on the shared base / run checkout) repoint in-transform, inside the
       decompose commit — today's Leg 3, unchanged.
     - **Branch-private dependents** (meta only on another branch): the transform **records the repoint mapping in
       the retirement receipt** (already carried as `incomingEdges.replacementTargets`) and does **not** touch their
       branch. Each dependent's edges then **auto-reconcile against the receipt** the next time any ARC operation
       touches its branch — `session-init` on that worktree, `activate`, `resume`, `integrate` — silently and
       without authorization, generalizing the existing auto-discharge side-effect (`discharge-dep-edges`, which
       already rewrites `Depends On` unprompted at activation). Owned-and-clean reconciles are invisible; a genuine
       **conflict** (the edge changed incompatibly) surfaces as a version-checked reconcile.

   One mechanism, three trigger points; `integrate` is the **fail-closed** one — a dependent whose receipt-recorded
   repoint cannot complete (target member gone, or a real conflict) fails its own integration rather than merging a
   dangling edge. This absorbs three earlier candidates (record-and-defer, the owned-dep convenience, a dangling-dep
   merge-gate) into one reconcile fired at multiple triggers: no nudge-to-authorize, no bolt-on gate.
   **Decompose-time advisory:** the composed index already carries each dependent's `InFlightState`, so a dependent
   that is _mid-integration_ with a live edge to the retiring origin is surfaced at the Step-5 interlock for the human
   to coordinate — the transform does not silently proceed against it. (`Depends On` is a shrinking live-blocker list,
   so a still-present edge to a `Planning` origin is a real blocker, not stale lineage.)

   **Backend-forward.** The receipt + reconcile _is_ what a version-checked store write becomes: today it applies in
   the dependent's own git flow; under the materialized backing store it is the store's version-checked write applied
   at sync. The same receipt and mapping carry over — no lock-in (storage check-doc Principle 3).

2. **Cohort-less split shape** (old area 1). A first-class flat-sibling outcome — N siblings joined only by a
   dependency edge, no cohort node — across the three surfaces: an `assess-cohort-fit` verdict for it, a
   `decompose-work-unit` arm that skips cohort-mint, and a **new typed cut-map field** (a `parentPosition` /
   `shape` value) that lets `cohort` be omitted and places siblings flat rather than under a cohort dir. Today
   `parseCutMap` _requires_ `cohort` for every non-`at-cap` position and `scaffoldCohortMembers` always nests under
   a cohort dir — so the shape is inexpressible. Live instance: `roadmap-tooling`'s verdict. Adjacent rail to
   `cohort-cut-coherence` (what a cohort absorbs on exit) — coordinate, don't fold.

3. **Husk-consistent, self-healing transform terminal** (old area 4, widened). Make the transform's residue
   self-heal via the _same_ stamped-husk sweep the shipped-WU terminal uses, rather than a manual cleanup the human
   must remember. Concretely: the terminal **stamps a husk** (like `teardown`'s self-teardown defer) so
   `stale-worktree-sweep` reaps it at session-init; the verb emits **one CLI-owned lifecycle-complete result**
   covering branch/worktree teardown and user-workspace close; ready zero-dependency members are derived from the
   cut graph as a CLI slot, with a spawn-anchored launch **remedy** on a unique head (candidates surfaced, never
   auto-started) — not workflow prose orchestrating the sequence. **Rename facet:** the identity rename runs in
   place from any locus (branch / artifacts / remote / notes / marker — locus-safe); only the cosmetic worktree
   directory move defers, stamped for a **new self-healing sweep surface** ("worktree path lags renamed identity →
   `git worktree move` from outside"), mirroring the husk nudge — so `rename` stays invokable from the to-be-renamed
   worktree, never primary-only. (Boundary question: the harness skills-dir registration going stale on rename is an
   adjacent harness-integration residue, likely not ARC-substrate scope — flag, don't silently absorb.)

4. **Shared-artifact regen & reference conservation** (promotes the ROADMAP-timing gap + the reference-sweep
   policy). Render the in-transform ROADMAP from the **staged tracked-index projection** (deterministic, no
   dependency on remote-ref timing), fixing `wu-rename`'s confirmed phantom-row _and_ `decompose`'s more-exposed
   latent one in the shared `reconcile-roadmap` path. Settle the **reference-conservation policy** once for both the
   retired-slug (`decompose`) and renamed-slug (`rename`) cases: which references the transform owns (backticked
   artifact refs, `Depends On`, cohort headings) vs. author-owned prose / self-titles, and whether the boundary is
   swept or documented as a known drain-time reconcile.

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
  shared vocabulary/guidance is on-model, not premature (Principle 6); new load-bearing terms (flat-sibling; the
  terminal vocabulary) are defined once and coordinate with `wu-lifecycle-state-model` (Principle 7).

## Coordination

- `wu-lifecycle-state-model` — owns husk/terminal-state and transition vocabulary; areas 3–4 consume its names,
  never mint parallels.
- `retirement-record-relocation` — owns the retirement-record store location; areas 1/3 read that store —
  coordinate on the path, not just transition semantics.
- `lifecycle-transition-core` — owns the `discharge-dep-edges` reconcile side-effect area 1's edge-reconcile
  generalizes; extend it (auto-discharge + receipt-driven repoint as one `Depends On` reconcile), never mint a
  parallel mechanism.
- `review-gate-right-sizing` — owns the merge-guard tier; area 1's `integrate`-time fail-closed reconcile coordinates
  there rather than building a competing gate (the working-memory colliding-gate caution: the review-gate controller
  is not operational, so do not wire against it — align on the merge-guard validation tier instead).
- **`wu-rename` follow-up captures are co-owned here, not separate errandry** — `USER-INBOX` items "phantom ROADMAP
  row + prose-scope sweep" (area 4), "occupied-worktree move husk-consistent" (area 3), and "self-title rewrite to
  draft/research artifacts" (area 4) are the same substrate concern; adopt them as this WU's evidence rather than
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
- **Integrate-time fail-closed ownership** (area 1) — the write-side is **settled** (the receipt-driven reconcile
  side-effect above); its `session-init` / `activate` trigger points are this WU's, but whether the `integrate`-time
  fail-closed reconcile lands here or in the merge-guard tier (`review-gate-right-sizing`) is the one remaining
  Area-1 fork — settle at spec. Degraded-read policy leans settled (record reachability + proceed; the CAS re-checks
  at finalize).
- **Flat-sibling verdict/schema shape** (area 2) — new `parentPosition` value vs. new `shape`; settle at spec.
- **Reference-conservation scope** (area 4) — the sweep-vs-document policy fork, shared with `rename`.
- **Rename worktree-move sweep surface** (area 3) — the exact new session-init sweep kind and its stamp/marker.
- **abandon / park delta** — do they need explicit changes or inherit for free from the shared-substrate fixes?
  Verify at spec; both share retirement authority + deferred teardown + `reconcile-roadmap`.
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
