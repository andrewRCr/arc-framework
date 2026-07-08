# Draft: Project State Integrity

- **State:** Draft — **formalization-ready** (2026-07-08 grooming: WLSM contract settled, oracle-determinism and
  projection design notes authored, inbound buffer drained). Extracted from the `roadmap-tooling` decomposition
  (2026-07-06; `assess-cohort-fit` verdict: two flat siblings + one dependency edge).
- **Origin:** [internal] — the FP-critical state-integrity slice of `roadmap-tooling`, split out so
  `finalize-parallelism` can unblock on it **alone** (dependency granularity is WU-level; the render-standard +
  rename work stays with a rescoped `roadmap-tooling`, which depends on this WU).
- **Purpose:** Deliver the trustworthy, contention-free project / in-flight state layer ARC's parallelism relies
  on — a roster/oracle that reports true facts under concurrent worktree churn, and a project readiness view that
  resolves by re-render from the meta source of truth rather than by shared-mutable hand-edit.

---

## Problem / Motivation

`finalize-parallelism`'s wave-1 burn-in surfaced the in-flight state layer reporting **false facts**, and the
shared readiness file as a contention hazard under parallelism. Both are hard dependencies of FP's remaining
waves, which must consume a trustworthy state layer rather than characterize a broken one — more urgent than, and
orthogonal to, the render-standard reconciliation + `STATUS.PROJECT` rename the rescoped `roadmap-tooling`
carries. Dependency granularity is WU-level: for FP to unblock on the state-integrity slice alone, that slice
must be its own WU.

- **Roster/oracle non-determinism.** The pre-commit foreign-write advisory (`check-foreign-writes` →
  `detectForeignArtifactOverlap`) reported non-existent cross-WU meta overlaps — `chore/burn-in-probe-b also
  touches meta-finalize-parallelism.md` (and symmetrically at probe-b's activation) — verified false: the probe
  worktrees track only their own artifacts, cut cleanly from `main`, and the detector's own committed-diff +
  uncommitted-status probes return empty. The overlap primitive is sound; the fault is the in-flight **roster
  derivation** (`runActiveInFlight`) feeding it stale/wrong refs during concurrent worktree churn (clustered
  around `arc start --here` reshuffling worktree/branch state), non-deterministic.
- **Shared-mutable contention.** `ROADMAP.md` is a single shared file every WU regenerates and commits (FP and
  probe-b both diff-touch it) — a shared-mutable contention hazard (FP matrix cell 3.2.c). Advisory-only today,
  but state-reporting that lies is a GA blocker for parallelism.

## Scope

- **(A) Oracle/roster determinism.** Harden the in-flight roster derivation (`runActiveInFlight`) so overlap /
  foreign-write reporting is correct and deterministic under concurrent worktree churn — eliminating the
  phantom-overlap false positive FP hit.
- **(B1) Regenerate-wins derived projection.** Resolve `ROADMAP` / `STATUS.PROJECT` as a purely-derived
  projection that resolves by **re-render from the meta source of truth** (regenerate-wins), ending the
  shared-mutable hand-edit contention — rather than a single file every WU rewrites. This is the projection
  **engine**; the render *standard* it applies (columns, tiers, overflow, naming) is the rescoped
  `roadmap-tooling`'s. Base: adopt the landed `composeProjectReadinessView` (`lib/status/project-view.ts`, FP
  Task 2.4.a — confirmed on `main` 2026-07-08) as the engine substrate; verified identical across `main`, FP's
  branch, and this branch (2026-07-08 adversarial pass), so no copy reconciliation is needed.
- **Dangling-dependency-edge validation.** Dependency satisfaction resolves today by **pending-set absence**
  (`project-view.ts` line ~236): a typo'd or renamed dep target is absent from the scanned
  active/planned/provisional set and is therefore silently treated as satisfied, so a WU can render Ready on an
  unresolvable edge (currently inert — zero dangling edges on `main`, verified). **Reuse the existing lifecycle
  primitive** — `buildLifecycleIndex` + `resolveSlugQuery` (`lib/work-unit/lifecycle-query.ts`, surfaced by `arc
  status <slug>`), which already classifies a slug as `nonexistent` / `shipped` / active-planned-provisional. Wire
  the composer's dep resolution to it: `nonexistent` → dangling (warn), `shipped` → satisfied, pending → blocks.
  No bespoke `completed/` scan. Surfacing mode (settled 2026-07-08): the composer's warnings channel, rendered
  into the view header and the live view — no standalone `--check` here; corpus-wide gate validation of dep
  edges is `corpus-conformance-gate`'s (OSD cohort) — coordinate, don't double-build.

Deliverables stay **model-agnostic to WLSM's coming readiness axis** (see Coordination) — do not hard-bake
"`State` is the sole readiness signal."

## Design Notes — Oracle Determinism (investigation, 2026-07-08)

**Root framing: branch⇄WU non-bijection.** The in-flight derivation (`deriveInFlight`) classifies each
remote-tracking branch independently and mints WU identity per-branch (the name after the type prefix). But the
domain's unit is the WU, and branch⇄WU is not a bijection: a stale ref (a spawn-era `plan/<name>` surviving a
local `plan/ → <type>/` rename, or an undeleted remote after re-launch) makes it one-to-many, and an unpushed
local branch makes it one-to-zero. Every consumer — the foreign-write overlap detector, the materialize surface,
ROADMAP's In Flight tier — inherits the resulting false facts.

**Live evidence (2026-07-08, this repo, deterministic).** `plan/burn-in-probe-a` lingers on `origin` while the
WU's real branch `chore/burn-in-probe-a` is checked out locally and absent from the remote. The oracle's input is
remote-tracking refs only, so it (a) reports `burn-in-probe-a` as a remote-only materialize candidate and (b)
cannot see the WU's actual local in-flight worktree at all — two standing false facts from one WU, no concurrency
required. The wave-1 phantom-overlap was the transient face of the same family.

**Failure-vector inventory** (each a design obligation, not just a bug):

1. **Input set too narrow** — derivation walks `refs/remotes/origin/*` only; an in-flight WU on a not-yet-pushed
   local branch is invisible (roster false-negative).
2. **Stale refs classify as WUs** — every surviving ref for a renamed/re-launched WU derives its own entry
   (duplicates; remote-only phantoms). The hook's `localOnly` mode never prunes, so commit-time detection runs on
   the stalest view.
3. **Silent degradation to wrong shapes** — `resolveWorktreePathsByBranch` failure returns an empty map, turning
   every entry `remoteOnly` with no warning; an unreachable-prune degrade is similarly shape-preserving. Degraded
   facts must be *marked*, never silently identical to healthy ones.
4. **Self-exclusion is path-string equality** — the overlap detector excludes the originating WU by worktree-path
   and meta-path equality; `originatingMetaPath` is `undefined` exactly in ceremony windows (mid-graduation, when
   `resolveActiveWu` cannot resolve), so a WU's own stale duplicate ref reads as foreign precisely during
   activation churn.
5. **No input snapshot** — refs, the worktree list, and per-branch meta reads interleave with concurrent branch /
   worktree mutation (`arc start` reshuffles); the derivation can observe a mid-transition mixture.
6. **Probes read shared mutable state at fire time** — committed diffs key on the local base ref; the uncommitted
   probe runs `git status` inside sibling worktrees mid-ceremony. Both can report transient truths that are
   unreproducible minutes later (the wave-1 signature: detector re-run returns empty).

**Design direction (settled 2026-07-08):**

- **Re-key derivation on WU identity — and derive identity from content, never branch-name semantics.** Today the
  WU name is parsed *from* the branch name (the segment after the type prefix) and life-phase is proxied off the
  `plan/` prefix — both anti-patterns per `strategy-storage-evolution` Principle 5, and both guaranteed churn
  under WLSM's branch-model reshaping (born-typed activation branches). Instead: enumerate the metas a ref
  actually carries (`ls-tree <ref> .arc/active/`) so identity = the meta present, and read life-phase from the
  meta record's `State` field — the exact field the WLSM contract holds stable. The branch is *location*
  (where to find and diff content), never identity or phase. Then dedupe branch candidates per WU with a
  precedence rule — local worktree checkout > live remote branch > stale tracking ref — emitting one entry per
  WU carrying its branch-set provenance, with shadowed/stale candidates surfaced as warnings (feeds the sweep
  surfaces rather than the roster). Corollary: WLSM may reshape branch naming and the `plan/` rename model
  freely without breaking the state layer — recorded as part of the contract capture.
- **Broaden the input union.** Remote-tracking refs ∪ local branches with worktrees (the roster's own ground
  truth), so an unpushed in-flight WU is seen; the existing lifecycle identity layer (`buildLifecycleIndex` /
  `resolveSlugQuery`) should be the shared slug→identity substrate, not a second parallel one.
- **Loud degradation.** Every degrade (worktree-list failure, unreachable prune, unreadable meta) lands in the
  warnings channel and marks affected entries; consumers can then qualify (the hook stays advisory but says
  "derived degraded") instead of asserting false facts confidently.
- **Identity-keyed self-exclusion.** The overlap detector excludes by WU name, not path equality — immune to
  ceremony windows and to the WU's own stale duplicate refs.
- **Ceremony-window discipline (settled 2026-07-08; detection predicate added post-adversarial-pass) + repro
  harness.** Detection: **double-read snapshot agreement** — the derivation reads its mutable input set (the ref
  listing and the worktree list) twice and requires agreement; disagreement means a mutation window is open, and
  the affected entries (or, on a whole-set mismatch, the derivation result) are marked indeterminate. Per-entry
  meta reads retry once against the agreed snapshot; a read that still fails marks that entry. Chosen over a
  ceremony-marker protocol because it is self-contained (no cross-cutting writes into every ceremony),
  mutation-source-agnostic (human git churn counts, not just arc ceremonies), and free of the stale-marker
  liveness failure mode a crashed ceremony would leave behind; anomaly-inference alone was rejected as missing
  single-candidate mixtures. The response then splits by consumer: the **commit-time advisory hook
  skips-with-note** on indeterminate state (an advisory must not assert over a mid-transition read — a silent
  false positive is exactly the wave-1 failure), while the **roster / live views tolerate-with-provenance** (the
  entry surfaces, marked indeterminate in the warnings channel). The falsifiable acceptance for (A): a
  concurrency test that runs derivation while a scripted `arc start` reshuffle mutates branches/worktrees,
  asserting stable, warning-marked output — the exact wave-1 mechanism gets pinned during that harness work, not
  guessed now.

## Design Notes — Regenerate-Wins Projection (B1, 2026-07-08)

**Grounding facts (verified live).** Graduation is branch-local: an in-flight WU's pre-graduation stub survives
in `backlog/planned/` **on `main`** until its branch merges — so main's render asserts false `Ready` facts for
every in-flight WU (`burn-in-probe-a`/`-b` and FP's stubs, confirmed on `main` today) and its In Flight tier is
structurally empty. Subtly, those stale stubs are currently *load-bearing*: they are what keeps dependencies on
in-flight WUs reading as pending (`project-view.ts` resolves by pending-set absence), so pruning them without
superseding truth would make dep-resolution worse. And the ceremony-commit regen renders *checkout-relative*
truth into a shared tracked file — a tracked derived file whose inputs span branches is **unmergeable by
construction**, which is the FP 3.2.c contention hazard in one sentence.

**Stance (settled): checkout-deterministic tracked render + live read-time view.** Three candidates considered:

- **Chosen:** the committed `ROADMAP` renders from the tree **plus local refs** (worktrees and remote-tracking
  refs carrying active metas — local data, no network), gaining an in-flight supersede tier; the
  network-verified, oracle-composed view is a **read-time CLI surface**, computed fresh, never committed.
- **Rejected — committing the fully oracle-composed view:** renders become network/ref-state-dependent
  (non-reproducible), and every sibling's progress churns every branch's copy — maximal contention.
- **Out of scope — untracking/materializing the file:** the B2 / `parallel-surface-access` / arc-backend tier,
  deliberately not built here.

**Composer input model.** A slug-keyed union with precedence — active-meta-at-a-known-ref > backlog stub >
completed index — realizing the records-open input commitment (§ Coordination). Dependency resolution moves off
pending-set absence onto `buildLifecycleIndex` / `resolveSlugQuery`: `nonexistent` → dangling (warn), `shipped` →
satisfied, pending → blocks — closing the dangling-edge hole and the stale-stub luck-dependency in one move. The
readiness-provider socket (deps-only implementation) and the decomposed tier predicate hang off this composer.

**Write model.** The tracked render stays at today's same-commit ceremony triggers, now deterministic per
checkout, stamped with rendered-against SHA + scope. Conflict rule: **regenerate-wins** — `ROADMAP` is never
hand-merged; any conflict resolves by re-render from sources, enforced as convention plus a hook assert (a git
merge driver cannot ship purely via the repo). Assert shape (settled 2026-07-08): **pre-commit** — when
`ROADMAP.md` is staged, re-render from sources and compare; a mismatch or surviving conflict markers reject the
commit with a re-render instruction (blockable, unlike the advisory foreign-write hook: a hand-edit to a derived
file is wrong by definition, and the compare is exact because the render is checkout-deterministic). Bound: a
GitHub-side PR merge fires no local hook, but a `ROADMAP` conflict there falls to local conflict resolution,
where the hook fires. The committed artifact is scoped truth — a cache by construction — with the header
pointing at the live view.

**Interim truth model ("always up to date, true everywhere").** Not achievable for a *committed tracked file* —
structurally: file content is pinned per commit, truth moves without commits in your checkout, and only sync
distributes commits. The interim answer relocates *consumption*, not the file: the oracle-composed read-time
surface is live truth on demand, everywhere. An always-fresh *passively-opened file* in every worktree is
materialize-on-demand — `parallel-surface-access`'s scope, backend-gated; this WU's pure composer makes that
slice a thin sink when PSA carves it (its recorded promote-trigger).

**Forward-compat (storage-evolution self-check, run 2026-07-08).** (1) The composer is a pure function over an
injected slug-keyed record set — under the backend the source resolution swaps to the backing store and the
supersession tier *dissolves* (graduation stops being branch-local; one record per WU), scaffolding that
dissolves rather than reshapes. (2) The sink swaps tracked-commit → materialized-write with the render layer
unchanged (ADR-022 §8's "derived → tracked + regeneratable" interim). (3) Enforced invariant: **the rendered
file is terminal — no consumer reads `ROADMAP.md` back as data** (resolve-don't-store). Known violation to
retire: `resolveTitle` (`project-view.ts`) reads the existing `ROADMAP` H1 back for title preservation —
presentation-only, but a read-back precedent; move the title to config or the render standard.

## Dependencies and Sequencing

- **Upstream:** none — this WU is the base of the render chain. (Work Organization Reform, which established the
  meta-file source of truth and the derived-view algorithm, is shipped.)
- **Downstream:** the rescoped `roadmap-tooling` depends on this WU (render standard + rename atop the trustworthy
  projection engine); `finalize-parallelism` depends on this WU (its burn-in waves need the trustworthy state
  layer) — FP's edge repoints here from `roadmap-tooling` post-decompose.
- **CLI Substrate Adoption** — provides the zod meta-frontmatter schema the roster/projection would parse
  against; preferred to sequence after CSA so parsing is typed, but not a hard gate (a hand-rolled parser is
  viable if landing the state layer earlier is favored — and FP needs this WU now).

## Coordination

- **OSD / ADR-022 (`managed-record-substrate`, render-before-renderer).** `ROADMAP` / `STATUS.PROJECT` is a
  *derived* managed operational-state document (ADR-022): a rendered projection over the meta records. This WU's
  regenerate-wins engine is a render-before-renderer first instance; the general record / reconcile engine later
  absorbs it. Coordinate the engine boundary with `managed-record-substrate` — the keystone member of the OSD
  cohort (cut-map settled 2026-07-02; the `operational-state-docs` parent retires into it) — but do **not** gate
  on it (it is `cli-substrate-adoption`-gated, and FP needs this WU now). This WU's derived record stays
  **storage-agnostic** so it lifts to the arc-backend tier unchanged (the **B2** materialize-on-demand north
  star — always-fresh access to common hub surfaces under parallelism — is *not* built here; it routes to
  `parallel-surface-access` / arc-backend).
- **WLSM readiness-axis contract (settled 2026-07-08, grooming entry).** `wu-lifecycle-state-model` will split
  planning-completeness (impl-ready attestation) from scheduling (`State`), adding a readiness axis distinct from
  today's dependency-satisfaction "Ready." Three interface commitments keep this WU open to that axis without
  building any of it:
    1. **Readiness-provider socket; deps-only behind it.** The composer takes readiness from a provider interface,
       and the only implementation this WU ships returns dependency-satisfaction. WLSM's attested signal is
       event-shaped / baseline-stamped / multi-actor and may not live in the repo tree at all (backend event-log
       shape), so the composer's inputs are **resolved records** (the roster oracle + the meta record model) —
       never raw markdown globs, and never an assumption that readiness is a field parsed out of `meta-*`.
    2. **Stored-`State` enum stable; overlays derived.** The roster classifies on today's `State` values plus
       directory position as ground truth; derived displays (e.g. `Ready (stale, re-verify)`) are projection-time
       compositions, never stored (resolve-don't-store). The reciprocal commitment — WLSM mints no new stored
       `State` values and re-keys no meanings; readiness lands as an orthogonal signal — is captured to
       `USER-INBOX` under `WU_Target: wu-lifecycle-state-model`.
    3. **Tier predicate decomposed.** The composer computes dependency-satisfaction and readiness independently
       and hands both to the render layer; today's render collapses them to deps-only. Whether readiness renders
       as tier membership or a column is `roadmap-tooling`'s render-standard call — deliberately not decided here.
       WLSM's landing is then additive: a new provider plus a render-standard decision elsewhere, with no
       composer-logic change. A blocker for neither this WU nor `roadmap-tooling`.
- **`STATUS.USER` seam (2026-07-08).** The user-scope view is architecturally ahead of `ROADMAP`: gitignored +
  derived + composed-fresh-per-call (`arc status --user`), so it is exempt from the tracked-file contention
  problem. Its live half exists; the deferred file-writer half (structured writer, chrome, trigger wiring,
  offline cache merge — plus backlog-aware dep resolution in the dep column) is the rescoped `roadmap-tooling`'s
  ("STATUS.USER writer parity"), atop this WU's hardened oracle — the view consumes `deriveInFlight`, so (A)'s
  determinism work rehabilitates its trustworthiness directly. Interim consumption model: two live views (user
  scope exists; project scope is B1's) over one oracle; passive-file freshness stays the PSA thin sink.
- **`parallel-surface-access` seam (provisional).** PSA owns always-fresh *passive-file* access to hub surfaces
  (materialize-on-demand + the hub-window DX), backend-gated per its own drain note. This WU ships the pieces its
  "independent interim slice" promote-trigger would consume: the pure composer (injected sources, injectable
  sink) and the live read-time view. Seam captured to PSA via `USER-INBOX` (`WU_Target: parallel-surface-access`);
  nothing here gates on PSA.
- **Cross-branch edge / regen-from-incomplete-tree limitation (resolved by the B1 stance).** Active-WU metas live
  on their own branches, not on `main` (`.arc/active/` is empty on `main`), so a single-tree render can neither
  observe in-flight WUs nor re-point an incoming `Depends On` edge living on another branch (why the
  `roadmap-tooling` decomposition had to hand-render ROADMAP and defer FP's edge repoint). Resolution: the
  composer's slug-keyed union reads active metas at *known local refs* (tracked render) and the full oracle (live
  view) — see § Design Notes — Regenerate-Wins Projection.

## Success Signal

Three concrete, falsifiable outcomes:

1. **Oracle determinism under churn:** the (A) concurrency harness — derivation racing a scripted `arc start`
   reshuffle — produces stable, warning-marked output; and the two standing live false facts resolve (a stale
   `plan/<name>` ref no longer mints a phantom remote-only WU; an unpushed in-flight worktree is visible).
2. **No false `Ready` facts:** a `main`-checkout render shows in-flight WUs as in flight (superseding their stale
   backlog stubs) and flags dangling dependency edges instead of rendering them satisfied.
3. **Contention ends:** `ROADMAP` is never hand-merged — a manufactured conflict resolves by re-render
   (regenerate-wins), asserted by hook.

## Scope Estimate

Heavy — a state-layer correctness concern (oracle determinism + a regenerate-wins projection model + dangling-edge
validation) that a correct design must author before execution, spanning `lib/status/**`, `lib/work-unit/**`, and
the roster oracle. FP's hard blocker.
