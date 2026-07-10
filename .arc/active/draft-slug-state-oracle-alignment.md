# Draft: Slug-State Oracle Alignment

- **Origin:** USER-INBOX capture drained at stub creation (2026-07-09); surfaced during `finalize-parallelism`
  Task 3.1.c observer resume — the probes' `planned/unoccupied` misreport investigation. Full mechanism and
  source anchors: `notes-finalize-parallelism.md` § Dogfood finding (2026-07-09): slug-state surfaces are
  checkout-local.
- **Purpose:** Make slug/state projection honest across concurrent and prospective state: give the slug-state
  query/dispatch surfaces in-flight-sibling truth, fix the foreign-write advisory reading base divergence as
  authored overlap, make staged lifecycle transitions win for their own branch, and surface branch/record residue
  instead of silently misclassifying it. All are "the state layer reports false facts about what is in flight
  under parallelism" — the family the parallelism GA gate certifies. Lands on `main` before
  `finalize-parallelism` wave 2; FP merges it in.

---

## Problem

Four confirmed defects, one state-layer family:

### 1. Slug-state surfaces are checkout-local — blind to in-flight siblings

`arc status <slug>` and `arc start` dispatch resolve from `buildLifecycleIndex`
(`lib/work-unit/lifecycle-index.ts` / `lifecycle-query.ts`) — a pure walk of the *current checkout's* four
lifecycle directories, deliberately no git or network on the path. Under single-branch-per-WU, a sibling WU's
activation (`backlog/planned/ → active/` move + `State` flip) exists only on its own branch until merge, so
every other checkout still carries the pre-graduation stub and the local index faithfully — but falsely —
reports `planned`. `occupied` derives from the same state enum (`isOccupied`, `lifecycle-resolver.ts`), not a
`git worktree list` check, so it inherits the stale answer even though the local-sibling case is answerable
correctly via `worktree-roster.ts`.

`project-state-integrity` fixed the *view path* (`deriveInFlight` → `mergeProjectReadinessRecords`,
`lib/status/project-view.ts`) — `arc status --project` renders in-flight siblings truthfully. But its spec kept
the lifecycle index as the "shared slug→identity substrate" and the slug-query *surface* appeared in neither
its Goals nor Non-Goals; the gap fell through the seam. The oracle sees the truth; the slug query never
consults the oracle. Observed live: both wave-1 probes integration-ready, yet `arc status burn-in-probe-a`/`-b`
from FP's worktree reported `planned · Planning · occupied: false` while `arc status --project` in the same
checkout rendered both `Active`.

**Blast radius** (consumers of the checkout-local resolver, from source):

1. **Agent doctrine points at the blind surface.** DEV-RULES.ARC § Verify before assuming names
   `arc status <slug>` as *the* lifecycle resolver, and session-init's `--start` focused-recon arm resolves
   Tier-1 dependency edges through it. Any agent operating outside a WU's own worktree inherits the false facts.
2. **`arc start` dispatch — the sharp edge.** `resolveStartDispatch` (`commands/start.ts`) routes `planned` →
   **graduate**: from `main`, `arc start <live-sibling-slug>` graduates the stale stub and silently mints a
   second branch for a WU already live in a sibling worktree. The refuse arms (`planning`/`active`/
   `integrating`) cannot fire, and the foot-gun guards (`lifecycle-guards.ts`) check only the current
   checkout's `active/`. A silent double-launch recreates exactly the one-to-many branch⇄WU condition the
   `project-state-integrity` spec named as the root disease.
3. **Dep-edge reads.** `discharge-dep-edges` (satisfied at `landed ∨ integrating`) and `ready-mine`
   (deps-shipped filter) read stale for edges onto in-flight siblings — an `integrating` dep reads `planned`.
   Conservative-wrong (under-reports readiness, never over-reports); lower severity, same root.
4. **`occupied` reporting.** No code consumer beyond the query surface today, but agents read it; a
   false-negative occupancy invites exactly the double-launch in (2).

### 2. Foreign-write advisory reads divergence as authored overlap

The pre-commit advisory (`check-foreign-writes` → `detectForeignArtifactOverlap`,
`lib/git/foreign-artifact-detection.ts`) surfaced divergence-shaped lists — files the other branch has simply
never seen flagged as "also touched." Deterministically reproduced in **both** directions: behind-base (probes
lagging `main` flagged ~20 backlog drafts they never authored, 2026-07-09 cascade) and forward (FP's
own-artifact commit `4c05c455` flagged FP-side files as probe overlaps). Distinct from the 2026-07-06
phantom-meta roster misfire (fixed by `project-state-integrity`).

**Grounding correction (2026-07-09 code read):** the committed probe is *already coded three-dot* —
`git diff ${baseSha}...${candidateSha} --name-only -- <targetPaths>` with SHAs frozen up-front
(`committedMatches`, `foreign-artifact-detection.ts` ~242–268). So the defect is not a naive diff-base literal;
the divergence-shaped output must enter through what *feeds* the primitive — candidate branch/SHA pairs from the
in-flight roster snapshot, stale remote-tracking or shadow refs resolved as candidates, the `baseSha` fallback,
the uncommitted-status probe, or **local-base-ref staleness**: `baseSha` resolves the *local* base ref
(`check-foreign-writes.ts` passes `branch.base`, not `origin/<base>`), so when local `main` lags origin and a
candidate has merged the fresher base, merge-base falls at the old fork point and the three-dot diff lists every
base-side change the candidate merged — a divergence-shaped list from a correctly-coded three-dot primitive, and
consistent with "went clean once the probes were current." This half is **reproduce-first**: reproduce at
`4c05c455` (forward) and against a deliberately behind-base branch (cell 3.2.e's induction — the stale-local-base
channel is cheap to induce: hold local `main` behind while a sibling merges `origin/main`), trace the actual list
to its producing path, then fix that path. Regression coverage for both observed directions.

### 3. Prospective lifecycle renders lose to the checked-out branch's pre-commit tip

Archive-time ROADMAP regeneration composes staged-index records with the local-ref in-flight oracle. During the
archive commit, the index already carries the WU's prospective `Shipped` record while the checked-out branch ref
still points to its pre-commit `Integrating` tree. The at-ref active candidate wins, so the pre-commit guard
rejects the correct render and its prescribed local CLI remediation reproduces the stale row. Confirmed during
the archive commits for `project-state-integrity`, `burn-in-probe-a`, and `notes-export-state-coherence`.

The composed oracle needs a prospective-source rule: for the checked-out branch only, staged lifecycle state is
the branch's authoritative candidate during a transition; sibling local/remote refs remain ordinary oracle input.
The CLI remediation and hook must render from the same source, with regressions covering archive removal,
sibling visibility, byte parity, and activation/integration.

### 4. Residue is silently dropped or misreported as remote-only

`classifyInput` silently drops a no-record + no-meta branch. Merged Errand heads whose records were already
closed therefore disappear from every session-init cleanup surface; ten such remote branches were observed live.
Branch-less stale Errand records likewise have no residue surface.

Separately, `remoteOnly` keys only on worktree presence. A local branch with no current worktree — the live
`plan/slug-state-oracle-alignment` case — is advertised as a cross-machine materialization candidate even though
the branch is already local. The classifier must distinguish local parked/unoccupied state from genuine
remote-only state and emit a warning or residue classification instead of silently dropping unknown topology.

## Design decisions (leanings — settle at review)

**D1 — Truth source for the overlay: in-flight oracle, not roster-only.** `worktree-roster` (one local
`git worktree list --porcelain` + meta reads) covers only *checked-out local siblings*; a live branch whose
worktree was removed stays invisible, and `start` would still double-launch it. The in-flight oracle
(`deriveInFlight`, `lib/git/in-flight-derivation.ts`) covers strictly more at a proven cost profile: `localOnly`
mode is ~4 fixed git calls + 2–3 per in-flight WU, **no network**; live mode adds a single `git ls-remote`
bounded by a timeout (~0.45 s measured, 5 s cap). Lean: oracle overlay, with `localOnly` defaulting per
consumer (D3).

**Coverage boundary (adversarial pass, source-verified):** the oracle's candidate set is *local remote-tracking
refs ∩ live membership* (`resolveInFlightBranchSetFromLocalRefs`, `remote-ref-reader.ts`) — live mode **prunes,
never expands**, so a sibling branch this machine has *never fetched* (the cross-machine mint) is invisible even
with a reachable oracle. `fetchRefBounded` exists for exactly this and is currently unwired. Settled: the
**start-dispatch path wires live-only candidate expansion** — branches in live membership but absent locally
(`liveRefs − local`) get a bounded `fetchRefBounded` + meta classification before the graduate arm may fire; the
status query does **not** expand (it defaults `localOnly` anyway) and its never-fetched blindness is an accepted
residual, recorded here.

**D2 — Composition point: one shared composed-index helper, not per-consumer merges.** The pieces already
exist: `mergeProjectReadinessRecords` (slug-grouped precedence, at-ref active metas win) and
`buildLifecycleIndexFromRecords` (index from pre-resolved records). Lean: a `resolveComposedLifecycleIndex`
(name TBD) that builds the tree index, derives oracle candidates, merges, and returns a plain `LifecycleIndex` —
so `resolveSlugQuery`, `isOccupied`, and `resolveStartDispatch` run **unchanged** over composed truth, and
`buildLifecycleIndex` stays pure (the `arc-backend` locality commitment). Consumers opt in by swapping index
construction, not by learning new APIs.

**D3 — Per-consumer posture.**

- `arc status <slug>`: composed index in `localOnly` mode by default; live upgrade via a new positive `--fetch`
  flag on the slug query. This **deliberately inverts** the view modes' default (`--project` is live unless
  `--local`/`--no-fetch`): the slug query is a hot-path interactive primitive (agent loops, session-init Tier-1
  recon) that must not expose every call to a network timeout, while the destructive edge — `start` — is live by
  default instead. Asymmetry recorded here as a conscious call. On degraded oracle input, render with the
  existing degraded-warning pattern — warn-and-degrade, never block.
- `arc start` dispatch: **live** oracle (one bounded network read is cheap insurance against minting a second
  branch), with the D1 live-only candidate expansion wired on this path. "Possibly stale" is keyed on **oracle
  quality, not reachability alone** (adversarial pass, source-verified: a failed/malformed sibling meta read
  yields an unknown-state entry that `inFlightEntryToCandidate` silently drops while the oracle reports
  reachable). The graduate arm treats the target as indeterminate — never silently graduates — when *any* of:
  the oracle is unreachable; the derivation emits an `oracle-degraded` warning or degraded/unknown-state entry
  naming the target slug; or a live-only expansion fetch for a candidate ref fails. Indeterminate → confirm
  interactively (reuse `skipConfirm` / `confirmStep`, `handlers/start.ts`); under `--yes` / non-TTY, **refuse**
  rather than auto-confirm (fail safe beats fail convenient). For dispatch, a dropped/degraded target entry must
  surface as indeterminate, not read as absent.
- The worktree-occupancy guard (`lifecycle-guards.ts`) keeps its current-checkout scope — the composed dispatch
  upstream is what gains sibling sight; the guard stays the last-line local check.

**D4 — `occupied` contract: state-derived over the composed index.** `isOccupied` stays
`state ∈ {planning, active, integrating}` — unchanged predicate, now truthful because the index it reads is
composed. No re-keying to roster-derived; optionally enrich the *rendered* query output with the sibling
worktree path when the roster knows it (display, not contract).

**D5 — Dep-edge reads: split by read/write.** Both consumers take a pre-built index, so composition is a
construction-site swap at their sources — but they differ in consequence class:

- `buildReadyMineSlice` (read-only render; gates on `shipped`, which the in-flight view doesn't change
  materially) may take the composed-`localOnly` index if it falls out free from D2; otherwise defer.
- `dischargeDepEdges` **stays tree-only in this WU** (conscious acceptance of today's conservative-wrong read).
  It is the one consumer where a stale oracle answer causes a wrong *write*, not a wrong render: it one-shot
  rewrites the tracked `Depends On` bullet at `landed ∨ integrating`, and meta state is read at the **local**
  remote-tracking ref even in live mode — an unfetched tip still saying `Integrating` after a sibling ran
  `arc reopen` reads stale-*forward* and would over-discharge. Giving discharge composed truth needs its own
  freshness posture (clean, reachable, warning-free derivation covering the edge's slug, or an explicit fetch)
  — out of scope here; re-evaluate when a consumer actually needs earlier `integrating` sight.

**D6 — Prospective state overrides only its own checked-out branch candidate.** Extend the composed-index input
model so a staged lifecycle record substitutes for the current branch's at-ref record during transition
rendering. Do not globally rank `completed/` above active candidates: sibling refs still need normal oracle
precedence, and a global rule would hide genuine live branches. The hook and CLI writer share this explicit
prospective mode rather than reconstructing different trees.

**D7 — Classify residue explicitly; `remoteOnly` means absent locally.** No-record/no-meta branches and
branch-less Errand records produce visible residue/warning entries with branch-derived identity where available.
`remoteOnly` requires absence of both a local worktree *and* a local branch; a local unoccupied branch is a
distinct state and must not enter the cross-machine materialize candidate set. Preserve degraded-but-visible
behavior when remote or record reads fail.

## Non-goals

- No change to `buildLifecycleIndex`'s purity or locality (the `arc-backend` commitment) — composition happens
  above it.
- No park-record or backward-transition redesign, and no activation-rename hygiene (stale upstream / shadow
  `plan/` ref) — both are `wu-lifecycle-state-model`'s, per the standing capture routing.
- No render/columns work on ROADMAP / STATUS surfaces — `roadmap-tooling`'s.

## Constraints

- **Sequencing:** land on `main` **before FP wave 2** — the waves *consume* these surfaces (every wave session
  resolves lifecycle states, gates dependencies, and launches WUs through them). FP merges the fix in; wave-1
  cell 3.2.e and wave 2 verify both halves under live concurrency.
- **Launch mode:** code WU — run `--here` in the primary worktree per the standing spawned-code-WU caveat
  (wave 2 is what blesses spawned code worktrees).
- **Class:** Light — needs a brief spec (design decisions above), not an errand; no novel derivation.

---
