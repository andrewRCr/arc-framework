# Spec (`detailed` · `RFC`): Project State Integrity

- **Origin:** [internal] — the state-integrity slice of the `roadmap-tooling` decomposition (2026-07-06), split
  out so `finalize-parallelism` can unblock on it alone.

- **Purpose:** Deliver the trustworthy, contention-free project / in-flight state layer ARC's parallelism relies
  on — a roster/oracle that reports true facts under concurrent worktree churn, and a project readiness view
  that resolves by re-render from the meta source of truth rather than by shared-mutable hand-edit.

---

## Introduction / Context

`finalize-parallelism`'s wave-1 burn-in surfaced the in-flight state layer reporting **false facts**, and the
shared readiness file as a contention hazard under parallelism. Both are hard dependencies of FP's remaining
waves, which must consume a trustworthy state layer rather than characterize a broken one.

**Roster/oracle non-determinism.** The pre-commit foreign-write advisory (`check-foreign-writes` →
`detectForeignArtifactOverlap`) reported non-existent cross-WU meta overlaps — verified false: the probe
worktrees track only their own artifacts, and the detector's own committed-diff and uncommitted-status probes
return empty on re-run. The overlap primitive is sound; the fault is the in-flight **roster derivation**
(`runActiveInFlight` / `deriveInFlight`) feeding it stale or wrong refs during concurrent worktree churn.

The root framing: **branch⇄WU non-bijection.** The derivation classifies each remote-tracking branch
independently and mints WU identity from the branch name (the segment after the type prefix), proxying
life-phase off the `plan/` prefix. But the domain's unit is the WU, and branch⇄WU is not a bijection: a stale
ref (a spawn-era `plan/<name>` surviving a local `plan/ → <type>/` rename, or an undeleted remote after
re-launch) makes it one-to-many, and an unpushed local branch makes it one-to-zero. Every consumer — the
foreign-write overlap detector, the materialize surface, the readiness view's In Flight tier — inherits the
resulting false facts. Standing live evidence (2026-07-08, deterministic, no concurrency required):
`plan/burn-in-probe-a` lingers on `origin` while the WU's real branch `chore/burn-in-probe-a` is checked out
locally and absent from the remote — the oracle reports a phantom remote-only materialize candidate and cannot
see the WU's actual in-flight worktree at all.

**Shared-mutable contention.** `ROADMAP.md` is a single shared tracked file every WU regenerates and commits.
Graduation is branch-local, so an in-flight WU's pre-graduation stub survives in `backlog/planned/` on `main`
until its branch merges — `main`'s render asserts false `Ready` facts for every in-flight WU and its In Flight
tier is structurally empty. Those stale stubs are currently *load-bearing*: pending-set absence is what keeps
dependencies on in-flight WUs reading as pending, so pruning them without superseding truth would make dep
resolution worse. And the ceremony-commit regen renders *checkout-relative* truth into a shared tracked file —
a tracked derived file whose inputs span branches is **unmergeable by construction**.

**Dangling dependency edges.** Dependency satisfaction resolves today by pending-set absence
(`lib/status/project-view.ts`): a typo'd or renamed dep target is absent from the scanned set and silently
treated as satisfied, so a WU can render `Ready` on an unresolvable edge (currently inert — zero dangling edges
on `main`, verified).

## Goals

1. **Deterministic roster.** In-flight roster derivation reports correct, stable facts under concurrent
   worktree churn — no phantom overlaps, no phantom remote-only WUs, no invisible unpushed in-flight WUs.
2. **True readiness facts.** A `main`-checkout render shows in-flight WUs as in flight (superseding their stale
   backlog stubs) and flags dangling dependency edges instead of rendering them satisfied.
3. **Contention ends.** The readiness view is a purely-derived projection: never hand-merged, any conflict
   resolves by re-render from sources (regenerate-wins), asserted by hook.
4. **Forward-compatible seams, nothing built ahead.** The design stays model-agnostic to WLSM's coming
   readiness axis and storage-agnostic for the arc-backend tier — via interface commitments, not speculative
   construction.

## Non-Goals

- **The render standard** — columns, tiers, overflow, naming, and the `ROADMAP → STATUS.PROJECT` rename — is
  the rescoped `roadmap-tooling`'s (it depends on this WU). This WU ships the projection **engine**.
- **`STATUS.USER` writer parity** (structured writer, chrome, trigger wiring, offline cache merge) — also
  `roadmap-tooling`'s, atop this WU's hardened oracle.
- **Always-fresh passive-file access** (materialize-on-demand, hub-window DX) — `parallel-surface-access` /
  arc-backend tier. Untracking or materializing `ROADMAP.md` is deliberately not built here.
- **WLSM's readiness signal** — no attestation model, no new stored `State` values; only the provider socket
  (deps-only implementation) ships here.
- **Corpus-wide gate validation of dependency edges** — `corpus-conformance-gate`'s (OSD cohort); this WU
  surfaces dangling edges through the composer's warnings channel only.

## Proposed Design

### A. Oracle / roster determinism

Harden `deriveInFlight` and its consumers so the roster is keyed on WU identity, sees the full input set,
degrades loudly, and detects mutation windows instead of asserting over them.

**Identity model — content, never branch-name semantics.** WU identity derives from the metas a ref actually
carries (`ls-tree <ref> .arc/active/`): identity = the meta present; life-phase = the meta record's `State`
field (the exact field the WLSM contract holds stable). The branch is *location* — where to find and diff
content — never identity or phase. No name parsing off branch prefixes, no `plan/`-prefix phase proxy.
Corollary: WLSM may reshape branch naming and the `plan/` rename model freely without breaking the state layer.
Errand entries — meta-less by design — keep their existing identity source, the errand-record index
(`errandSlugByBranch`, the errand-identity oracle): identity = the record's slug, and errand branch candidates
ride the same dedupe/provenance machinery keyed on it.

**Input union.** The derivation walks remote-tracking refs ∪ local branches with worktrees (the roster's own
ground truth), so an unpushed in-flight WU is visible. The existing lifecycle identity layer
(`buildLifecycleIndex` / `resolveSlugQuery` — `lib/work-unit/lifecycle-index.ts` /
`lifecycle-query.ts`) is the shared slug→identity substrate — no second parallel one.

**Candidate dedupe with provenance.** Branch candidates dedupe per WU under a precedence rule — local worktree
checkout > live remote branch > stale tracking ref — emitting one roster entry per WU carrying its branch-set
provenance. Shadowed/stale candidates surface as warnings (feeding the sweep surfaces), never as roster
entries. Offline, the lower two tiers collapse: without a fresh remote prune (the commit-time hook is
`localOnly`; the tracked render reads local data only), live-vs-stale is unknowable, so multiple tracking refs
carrying the same WU with no local worktree dedupe by content — the candidate whose meta `State` is furthest
along, then the newest commit — never by branch-name semantics. Such an entry keeps its full branch-set
provenance and is marked location-ambiguous in the warnings channel; the advisory hook treats
location-ambiguous entries as indeterminate (skips-with-note, below).

**Loud degradation.** Every degrade — worktree-list failure, unreachable prune, unreadable meta — lands in the
warnings channel and marks affected entries. Degraded facts are *marked*, never shape-identical to healthy
ones; consumers qualify ("derived degraded") instead of asserting false facts confidently.

**Identity-keyed self-exclusion.** The overlap detector excludes the originating WU by WU name, not
worktree-path/meta-path equality — immune to ceremony windows (where `originatingMetaPath` is `undefined`) and
to the WU's own stale duplicate refs.

**Mutation-window discipline — double-read snapshot agreement.** The derivation reads its mutable input set
(the ref listing and the worktree list) twice and requires agreement; disagreement means a mutation window is
open, and the affected entries (or, on a whole-set mismatch, the derivation result) are marked indeterminate.
Per-entry meta reads retry once against the agreed snapshot; a read that still fails marks that entry. The
response splits by consumer:

- the **commit-time advisory hook skips-with-note** on indeterminate state — an advisory must not assert over a
  mid-transition read; a silent false positive is exactly the wave-1 failure;
- the **roster / live views tolerate-with-provenance** — the entry surfaces, marked indeterminate in the
  warnings channel.

**Fire-time probe inputs — the same discipline, second input class.** The overlap probes read mutable state
the ref/worktree double-read cannot see: a sibling ceremony mid-commit changes neither the ref listing nor the
worktree list. The snapshot discipline extends to them. The committed-diff probe resolves the base and
candidate refs to SHAs once, within the agreed snapshot, and diffs SHA-to-SHA — an immutable, reproducible
input. The uncommitted-status probe — a live read inside a sibling worktree by construction — double-reads and
requires agreement; disagreement marks that entry's probe result indeterminate, and the hook skips-with-note
for it. Residual, consciously accepted: the commit-time hook is offline (`localOnly` never prunes), so a stale
local base ref can over-approximate the committed diff — bounded because the consumer is advisory,
skips-with-note on indeterminacy, and nothing `Ready`-blocking consumes it.

**Concurrency repro harness.** The falsifiable acceptance for (A): a concurrency test that runs derivation
while a scripted `arc start` reshuffle mutates branches/worktrees, asserting stable, warning-marked output. The
exact wave-1 mechanism gets pinned during that harness work.

### B. Regenerate-wins readiness projection

**Engine substrate.** Adopt the landed `composeProjectReadinessView` (`lib/status/project-view.ts`) — verified
identical across `main`, FP's branch, and this branch (2026-07-08), so no copy reconciliation is needed.

**Composer input model.** A slug-keyed union with precedence — active-meta-at-a-known-ref > backlog stub >
completed index. The composer is a **pure function over an injected slug-keyed record set** with an injectable
sink: inputs are *resolved records* (the roster oracle + the meta record model), never raw markdown globs, and
never an assumption that readiness is a field parsed out of `meta-*`.

**Dependency resolution — lifecycle primitive, not pending-set absence.** Dep satisfaction moves onto
`buildLifecycleIndex` / `resolveSlugQuery`: `nonexistent` → dangling (warn), `shipped` → satisfied, pending →
blocks. This closes the dangling-edge hole and the stale-stub luck-dependency in one move. No bespoke
`completed/` scan. Dangling edges surface through the composer's warnings channel, rendered into the view
header and the live view — no standalone `--check` command. The index backing this resolution is constructed
from the composer's injected record set — the filesystem-free construction (`buildLifecycleIndexFromMetas`)
fed by the same slug-keyed union, including active-metas-at-known-refs — never a fresh disk scan. On a `main`
checkout an in-flight WU therefore classifies as pending via its at-ref active meta even absent its backlog
stub; that, not the stubs, is what carries dep truth once this lands.

**Readiness-provider socket; deps-only behind it.** The composer takes readiness from a provider interface;
the only implementation this WU ships returns dependency-satisfaction. The composer computes
dependency-satisfaction and readiness **independently** and hands both to the render layer (the decomposed tier
predicate); today's render collapses them to deps-only. Whether readiness later renders as tier membership or a
column is `roadmap-tooling`'s render-standard call. Stored-`State` enum stays stable; derived displays are
projection-time compositions, never stored (resolve-don't-store).

**Two surfaces, one composer.**

- **Tracked render (committed `ROADMAP.md`):** renders from the tree **plus local refs** — worktrees and
  remote-tracking refs carrying active metas; local data, no network — gaining an in-flight supersede tier, so
  a `main` checkout stops asserting false `Ready` facts. Checkout-deterministic and reproducible, stamped with
  rendered-against SHA + scope; the header points at the live view. The committed artifact is scoped truth — a
  cache by construction.
- **Live view (read-time CLI surface):** the network-verified, oracle-composed view, computed fresh per call,
  never committed. Live truth on demand, everywhere — consumption relocates to this surface; the tracked file's
  per-commit staleness stops mattering.

**Write model + hook assert.** The tracked render stays at today's same-commit ceremony triggers, now
deterministic per checkout. Conflict rule: **regenerate-wins** — `ROADMAP.md` is never hand-merged; any
conflict resolves by re-render from sources, enforced as convention plus a **pre-commit assert**: when
`ROADMAP.md` is staged, re-render from sources and compare; a mismatch or surviving conflict markers reject the
commit with a re-render instruction. Blockable (unlike the advisory foreign-write hook): a hand-edit to a
derived file is wrong by definition, and the compare is exact because the render is checkout-deterministic —
on a determinate snapshot. The assert is a third oracle consumer under the mutation-window split, and its two
reject triggers degrade differently: the conflict-marker reject is unconditional (a static scan of staged
content — hand-merge evidence regardless of what the roster reads), while the exact-compare, when the
re-render's double-read trips (or entries arrive indeterminate-marked), must not blockably reject off a
mid-transition read — it degrades to warn-and-allow with a re-run instruction; regenerate-wins corrects any
slip-through at the next determinate regen. Bound: a GitHub-side PR merge fires no local hook, but a
`ROADMAP.md` conflict there falls to local conflict resolution, where the hook fires.

**Terminal-render invariant.** The rendered file is terminal — **no consumer reads `ROADMAP.md` back as
data** (resolve-don't-store). The one existing violation, `resolveTitle`'s H1 read-back for title preservation,
is retired: the render layer supplies the title itself (constant/config); where the title ultimately lives is
`roadmap-tooling`'s render-standard call.

## Alternatives & Rationale

**Mutation-window detection — double-read snapshot agreement over the alternatives.** A ceremony-marker
protocol (ceremonies write "in transition" markers the derivation checks) was rejected: it requires
cross-cutting writes into every ceremony, misses non-arc mutation sources (human git churn counts), and carries
a stale-marker liveness failure mode when a ceremony crashes. Anomaly-inference alone (deriving, then
sanity-checking the output shape) was rejected as missing single-candidate mixtures. Double-read agreement is
self-contained, mutation-source-agnostic, and has no liveness dependency.

**Committed view composition — checkout-deterministic over fully-oracle-composed.** Committing the
network-verified oracle-composed view was rejected: renders become network/ref-state-dependent
(non-reproducible), and every sibling's progress churns every branch's copy — maximal contention, the exact
hazard this WU ends. Untracking/materializing the file is the deferred `parallel-surface-access` / arc-backend
tier — this WU's pure composer deliberately makes that later slice thin, but does not build it.

**Dependency resolution — lifecycle primitive over a bespoke scan.** `buildLifecycleIndex` /
`resolveSlugQuery` already classifies a slug as `nonexistent` / `shipped` / pending and backs `arc status
<slug>`; wiring the composer to it reuses the single identity substrate rather than minting a second
`completed/`-scanning path that would drift from it.

**Interim truth model — relocate consumption, not the file.** "Always up to date, true everywhere" is
structurally unachievable for a committed tracked file: content is pinned per commit, truth moves without
commits, and only sync distributes commits. The answer is the live read-time surface; an always-fresh
*passively-opened file* in every worktree is materialize-on-demand — out of scope here.

## Cross-cutting Considerations

**Coordination seams** (captures routed at planning close; recorded here as the planning record):

- **WLSM readiness-axis contract** (settled 2026-07-08): the three interface commitments — readiness-provider
  socket with deps-only behind it; stored-`State` enum stable with overlays derived; tier predicate decomposed
  — keep this WU open to WLSM's axis without building any of it. The reciprocal commitment (WLSM mints no new
  stored `State` values; readiness lands as an orthogonal signal) is captured to `USER-INBOX` under
  `WU_Target: wu-lifecycle-state-model`. WLSM's landing is additive: a new provider plus a render-standard
  decision elsewhere, with no composer-logic change.
- **OSD / ADR-022 (`managed-record-substrate`).** The readiness view is a *derived* managed operational-state
  document; this WU's regenerate-wins engine is a render-before-renderer first instance the general
  record/reconcile engine later absorbs. Coordinate the engine boundary; do **not** gate on it.
- **`STATUS.USER` seam.** The user-scope view consumes `deriveInFlight`, so (A)'s determinism work
  rehabilitates its trustworthiness directly. Interim consumption model: two live views over one oracle.
- **`parallel-surface-access` seam.** This WU ships the pieces PSA's interim-slice promote-trigger would
  consume (pure composer, live view); seam captured to `USER-INBOX` (`WU_Target: parallel-surface-access`).
  Nothing here gates on PSA.
- **Sequencing.** Upstream: none — this WU is the base of the render chain. Downstream: `roadmap-tooling` and
  `finalize-parallelism` both depend on this WU. `cli-substrate-adoption` would provide the zod
  meta-frontmatter schema — preferred sequencing, not a hard gate (a hand-rolled parser is viable, and FP needs
  this WU now).

**Testing.** The (A) concurrency harness is the determinism acceptance (derivation racing a scripted
`arc start` reshuffle). The pre-commit assert gets hook-level tests (staged-mismatch rejection, conflict-marker
rejection, clean pass-through). Composer work follows the standard unit tier (pure function over injected
records); consumer-split behavior (skip-with-note vs tolerate-with-provenance) is asserted per consumer.

**Migration / rollout.** The in-flight supersede tier changes `ROADMAP.md` content on every branch's next
regen — expected churn, absorbed by regenerate-wins. The pre-commit assert is a new blockable check scoped to
staged `ROADMAP.md` changes only; its bound (GitHub-side merges) is documented above. Stale backlog stubs stop
being load-bearing once dep resolution moves to the lifecycle primitive; no stub pruning ships here.

**Performance.** The tracked render reads local data only (tree + local refs, no network); the double-read
snapshot adds one cheap re-list of refs and worktrees per derivation. The live view pays the oracle's existing
network cost, on demand only.

## Success Criteria

1. **Oracle determinism under churn:** the (A) concurrency harness — derivation racing a scripted `arc start`
   reshuffle — produces stable, warning-marked output; and the two standing live false facts resolve (a stale
   `plan/<name>` ref no longer mints a phantom remote-only WU; an unpushed in-flight worktree is visible).
2. **No false `Ready` facts:** a `main`-checkout render shows in-flight WUs as in flight (superseding their
   stale backlog stubs) and flags dangling dependency edges instead of rendering them satisfied.
3. **Contention ends:** `ROADMAP.md` is never hand-merged — a manufactured conflict resolves by re-render
   (regenerate-wins), asserted by the pre-commit hook.

## Open Questions

- **The exact wave-1 phantom-overlap mechanism** is pinned during the (A) harness work, not guessed now — an
  implementation-time investigation inside a settled design (the failure-vector inventory bounds it), not
  deferred design.
