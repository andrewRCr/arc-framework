# Spec (`outline`): slug-state-oracle-alignment

- **Origin:** [internal]

- **Purpose:** Make slug/state projection honest across concurrent and prospective state: give the slug-state
  query/dispatch surfaces in-flight-sibling truth, fix the foreign-write advisory reading base divergence as
  authored overlap, make staged lifecycle transitions win for their own branch, and surface branch/record
  residue instead of silently misclassifying it. Lands on `main` before `finalize-parallelism` wave 2.

---

## Problem / Context

Four confirmed defects, one state-layer family: the state layer reports false facts about what is in flight
under parallelism — the family the parallelism GA gate certifies.

1. **Slug-state surfaces are checkout-local.** `arc status <slug>` and `arc start` dispatch resolve from a pure
   walk of the current checkout's lifecycle directories (`buildLifecycleIndex`,
   `lib/work-unit/lifecycle-index.ts` / `lifecycle-query.ts`). Under single-branch-per-WU, a sibling's
   activation exists only on its own branch until merge, so every other checkout reports the stale
   pre-graduation state — observed live: integration-ready wave-1 probes reading
   `planned · Planning · occupied: false` while `arc status --project` in the same checkout rendered both
   `Active`. The sharp edge is `arc start` dispatch: `planned` routes to the graduate arm, so a live sibling's
   slug can silently mint a second branch — the one-to-many branch⇄WU condition `project-state-integrity`
   named as the root disease. Dep-edge reads (`discharge-dep-edges`, `ready-mine`) inherit the same stale
   answer conservatively (under-report readiness, never over-report).

2. **Foreign-write advisory reads divergence as authored overlap.** The pre-commit advisory
   (`check-foreign-writes` → `detectForeignArtifactOverlap`, `lib/git/foreign-artifact-detection.ts`) surfaced
   divergence-shaped lists in both directions (behind-base 2026-07-09 cascade; forward at FP's `4c05c455`).
   The committed probe is already coded three-dot with frozen SHAs, so the defect enters through what feeds the
   primitive — candidate branch/SHA pairs, stale refs, the `baseSha` fallback, the uncommitted-status probe, or
   local-base-ref staleness (`baseSha` resolves the local base ref, not `origin/<base>`). Reproduce-first: the
   producing path is traced from live reproduction, then fixed there.

3. **Prospective lifecycle renders lose to the checked-out branch's pre-commit tip.** Archive-time ROADMAP
   regeneration composes staged-index records with the local-ref in-flight oracle; during the archive commit
   the index carries the prospective `Shipped` record while the branch ref still points at the `Integrating`
   tree. The at-ref candidate wins, so the shipped WU's row cannot drop in its own archival commit and the
   pre-commit guard rejects the correct render. Confirmed at four archivals: `project-state-integrity`,
   `burn-in-probe-a`, `notes-export-state-coherence`, and `notes-export-replay-ordering` (row carried into a
   sibling's 2026-07-13 base-merge regen).

4. **Residue is silently dropped or misreported as remote-only.** `classifyInput` drops a no-record + no-meta
   branch, so merged Errand heads with closed records vanish from every session-init cleanup surface (ten such
   remote branches observed). Separately, `remoteOnly` keys only on worktree presence: a local branch with no
   current worktree — the live `plan/slug-state-oracle-alignment` case — is advertised as a cross-machine
   materialization candidate even though the branch is already local.

## Decisions

1. **Truth source: in-flight oracle overlay, not roster-only.** `worktree-roster` covers only checked-out local
   siblings; the in-flight oracle (`deriveInFlight`, `lib/git/in-flight-derivation.ts`) covers strictly more at
   a proven cost profile (`localOnly`: ~4 fixed git calls + 2–3 per in-flight WU, no network; live adds one
   bounded membership read, ~0.45 s measured / 5 s cap). Coverage boundary, source-verified: the candidate set
   is local remote-tracking refs ∩ live membership — live mode prunes, never expands — so a never-fetched
   sibling branch is invisible even with a reachable oracle. The start-dispatch path therefore wires live-only
   candidate expansion: branches in live membership but absent locally get a bounded `fetchRefBounded` + meta
   classification before either minting arm may fire. The status query does not expand (it defaults `localOnly`);
   its never-fetched blindness is an accepted residual. Grounding update (2026-07-13): `resolveInFlightBranchSet`
   now returns `liveRefs` + `reachable` with proof-aware, completeness-keyed degradation
   (`lib/git/remote-ref-reader.ts`), so the expansion's `liveRefs − local` input already ships.

2. **Composition point: one shared composed-index helper.** A single resolver (working name
   `resolveComposedLifecycleIndex`) builds the tree index, derives oracle candidates, merges via the existing
   `mergeProjectReadinessRecords` precedence, and returns a plain `LifecycleIndex` through
   `buildLifecycleIndexFromRecords` — plus the derivation's quality facts (oracle warnings and any
   degraded/unknown-state entries, which both existing merge stages silently drop from the index itself), so
   dispatch can read Decision 3's indeterminacy signals alongside the index. Consumers opt in by swapping
   index construction — `resolveSlugQuery`, `isOccupied`, and `resolveStartDispatch` run unchanged over
   composed truth. `buildLifecycleIndex` itself stays pure and checkout-local (the `arc-backend` locality
   commitment).

3. **Per-consumer posture.**
    - `arc status <slug>`: composed index in `localOnly` mode by default; live upgrade via a new positive
      `--fetch` flag. This deliberately inverts the view modes' default (`--project` is live unless
      `--local` / `--no-fetch`): the slug query is a hot-path interactive primitive that must not expose every
      call to a network timeout, while the destructive edge — `start` — is live by default instead. The
      asymmetry is a recorded conscious call. Degraded oracle input renders with the existing
      warn-and-degrade pattern, never blocks.
    - `arc start` dispatch: live oracle. "Possibly stale" keys on oracle quality, not reachability alone —
      **both minting arms** (graduate on a `planned` read *and* create-new on a `nonexistent` read; a live
      sibling started fresh elsewhere reads `nonexistent` from every other checkout, so the channels are
      symmetric) treat the target as indeterminate when any of: the oracle is unreachable; the derivation
      emits an `oracle-degraded` warning or a degraded/unknown-state entry naming the target slug; or a
      live-only expansion fetch for a candidate ref fails. Indeterminate → confirm interactively (reusing
      `skipConfirm` / `confirmStep`); under `--yes` / non-TTY, refuse rather than auto-confirm. A
      dropped/degraded target entry surfaces as indeterminate, never reads as absent. The refuse arms and
      `resume` / `--here` cold-start (an explicit user override) keep their current routing.
    - The worktree-occupancy guard (`lifecycle-guards.ts`) keeps its current-checkout scope — composed dispatch
      upstream gains the sibling sight; the guard stays the last-line local check.

4. **`occupied` contract: state-derived over the composed index.** `isOccupied` keeps its
   `state ∈ {planning, active, integrating}` predicate, now truthful because the index it reads is composed.
   The rendered query output may be enriched with the sibling worktree path when the roster knows it —
   display, not contract.

5. **Dep-edge reads: split by read/write consequence.** `buildReadyMineSlice` (read-only render) may take the
   composed-`localOnly` index if it falls out free from the shared helper; otherwise defer. `dischargeDepEdges`
   stays tree-only in this WU — it one-shot rewrites the tracked `Depends On` bullet, and a stale-forward
   oracle answer (an unfetched tip still reading `Integrating` after a sibling reopened) would over-discharge.
   Giving discharge composed truth needs its own freshness posture; consciously out of scope.

6. **Prospective state overrides only its own checked-out branch candidate.** The composed-index input model
   accepts a staged lifecycle record as the current branch's authoritative candidate during transition
   rendering. "Its own candidate" covers both of the branch's ref forms — the worktree-sourced local head
   *and* its remote-tracking twin (`origin/<branch>`), which the candidate dedupe would otherwise let win at
   the same pre-commit tip; "sibling" means other branches, whose local/remote refs keep normal oracle
   precedence. `completed/` is never globally ranked above active candidates — a global rule would hide
   genuine live branches. The pre-commit hook and the CLI remediation render from this same prospective
   source.

7. **Residue is classified explicitly; `remoteOnly` means absent locally.** No-record/no-meta branches and
   branch-less Errand records produce visible residue/warning entries with branch-derived identity where
   available. `remoteOnly` requires absence of both a local worktree and a local branch; a local unoccupied
   branch is a distinct state and never enters the cross-machine materialize candidate set. Degraded-but-visible
   behavior is preserved when remote or record reads fail.

## Scope boundary (No-gos)

- No change to `buildLifecycleIndex`'s purity or locality — composition happens above it.
- No park-record or backward-transition redesign, and no activation-rename hygiene (stale upstream / shadow
  `plan/` ref) — both `wu-lifecycle-state-model`'s, per the standing capture routing.
- No render/columns work on ROADMAP / STATUS surfaces — `roadmap-tooling`'s.
- No composed-truth discharge: `dischargeDepEdges` keeps today's conservative tree-only read (Decision 5).
- No live-expansion on the slug query: `localOnly` blindness to never-fetched siblings is accepted (Decision 1).

## Consequences & Risks

- The slug query stays fast and offline-safe by default; the cost is that a truly never-fetched sibling stays
  invisible to `arc status <slug>` until any fetch lands the ref. Accepted and recorded.
- `arc start` gains one bounded network read, and a degraded oracle refuses under `--yes` / non-TTY — fail-safe
  over fail-convenient for the two dispatch arms that can mint a wrong branch (graduate and create-new).
- The `--fetch` vs `--local` flag asymmetry across surfaces may read inconsistent; it is a deliberate
  per-surface risk posture, documented at the flag.
- Problem 2 is reproduce-first: the producing path is not pre-committed, so the fix lands wherever the trace
  leads among the enumerated candidate channels. Bounded by regression coverage over both observed directions.
- The prospective-source rule is an explicit input-model extension; scoping it to the checked-out branch only
  avoids the hide-live-branches failure a global precedence flip would cause.

## Success Criteria

1. From a checkout other than the WU's own, `arc status <live-sibling-slug>` reports the sibling's in-flight
   state and `occupied: true` (no false `planned`), in `localOnly` mode via local remote-tracking refs.
2. `arc start <live-sibling-slug>` never silently mints a second branch through either arm — graduating a
   stale stub (`planned` read) or creating fresh (`nonexistent` read): with a reachable healthy oracle the
   refuse arms fire; on any indeterminate signal it confirms interactively and refuses under `--yes` / non-TTY.
3. A live-only (never-fetched) candidate is expanded on the start-dispatch path — bounded fetch + meta
   classification — before either minting arm may fire; a failed expansion fetch yields indeterminate, not
   absent.
4. The foreign-write advisory no longer emits divergence-shaped lists in either observed direction: the forward
   case (`4c05c455`) and an induced behind-base case (local base held behind while a sibling merges fresher
   base) are reproduced pre-fix, pass post-fix, and are locked by regressions.
5. An archival commit's fresh render drops the archived WU's own In Flight row; the pre-commit assert accepts
   it; hook and CLI remediation produce byte-identical output; sibling rows are unaffected; activation and
   integration transitions are covered by the same regressions.
6. Merged no-record/no-meta branches surface as classified residue instead of disappearing; a local branch with
   no worktree never appears in the materializable candidate set.
7. `resolveSlugQuery`, `isOccupied`, and `resolveStartDispatch` consume the composed index without interface
   changes — composition is a construction-site swap.

## Open items

- Which producing path feeds Problem 2's divergence-shaped lists — settled by the reproduce-first trace, not
  pre-committed here.
- Final name of the shared composed-index helper (`resolveComposedLifecycleIndex` is the working name).
- Whether `buildReadyMineSlice` adopts the composed index in this WU — only if it falls out free from the
  shared helper (Decision 5).
