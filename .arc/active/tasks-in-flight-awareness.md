# Task List: in-flight-awareness

- **Design:** `spec-in-flight-awareness.md`

---

## **Phase 1:** The in-flight oracle + dead-ref hygiene

_Purpose:_ Build the purely-derived in-flight oracle — the safety primitive every downstream consumer reads
(view render, activation check, future concurrency gate) — and the ref-hygiene backstop that keeps its
derivation correct regardless of on-disk cruft. Pure `src/lib/` logic with injectable Git/host deps; no checkout.

_Design decisions:_ Reuse the established primitives — `GitExec`, `extractField` / `META_FIELDS`,
`filterRosterByIdentity`, and the no-checkout `recent-remote-branches` reader pattern — rather than new
machinery. Correctness (A) lives in the oracle's pruned-ref classification; hygiene (B) is the `git fetch
--prune` backstop, kept together here as the single "ref-derivation correctness" story.

### `[x]` **1.1 Remote-ref reader — live membership + bounded meta fetch (no checkout)**

- _Goal:_ The oracle reads WU metas off remote refs with no checkout, composing live `git ls-remote` membership
  with a bounded fetch of candidate refs so it can read the meta of a WU in flight only on another machine, and
  derives over a pruned view (local remote-tracking refs intersected with live membership) so a deleted upstream
  never surfaces.
- _Outcome:_ `src/lib/git/remote-ref-reader.ts` ships four composable injectable-`GitExec` primitives —
  `listLiveRemoteBranches` (ls-remote membership), `listPrunedRemoteTrackingBranches` (local refs ∩ live, dead
  refs excluded), `fetchRefBounded` (bounded candidate fetch → `FETCH_HEAD`), and `readMetaAtRef`
  (`git show <ref>:<path>` → content | null) — leaving branch→meta orchestration to derivation (1.2). Network
  reads share one abort-signal timeout helper; degrade is per-read — membership → empty, fetch → false, but the
  pruned view falls back to the **last-known local refs** (not empty) when membership is unreachable, so an
  offline session keeps a view. Barrel-exported via `git/index.ts`.

### `[x]` **1.2 In-flight derivation — WUs + errands, State, identity filter**

- _Goal:_ Given the pruned remote-ref set, the oracle returns the identity's in-flight work units and errands
  with resolved State, distinguishing WUs (path/content-parsed metas) from errands (`chore/<slug>` branches that
  map to no WU).
- _Outcome:_ `src/lib/git/in-flight-derivation.ts` ships `deriveInFlight`, returning an `InFlightEntry[]`
  discriminated union (`work-unit` | `errand`). Each pruned branch is classified by reading its candidate meta
  off `origin/<branch>` with no checkout (`readMetaAtRef`): a present meta is a WU, a `chore/<slug>` branch with
  no meta is an errand — content-driven, never branch-name → WU. State is the prefix proxy (`plan/` → Planning,
  any other type-prefix → Active); Owner/Cohort come from `parseMetaRecord`; the identity filter mirrors
  `filterRosterByIdentity` (team-mode owner match, unattributed pass-through). Worktree paths resolve live via a
  new `resolveWorktreePathsByBranch` helper (added to `worktree-roster.ts`, reusing its porcelain parser); a WU
  with no local worktree is flagged `remoteOnly` — the materialize-candidate signal Phase 4 consumes.

### `[x]` **1.3 PR-source seam, degrading to refs-only**

- _Goal:_ The oracle's PR signal arrives through a seam that degrades to refs-only when no coordination adapter
  is present, so the oracle is fully functional without `gh`.
- _Outcome:_ `deriveInFlight` gained an optional `prSource` adapter —
  `PrSource = (branches) => Promise<Map<branch, OpenPrSignal>>` — defining the contract without a `gh`
  integration (coord-probe's deliverable). Absent adapter → refs-only; present → kept (identity-filtered)
  entries whose branch carries an open PR get an optional `pr` field; a rejecting/timing-out adapter is caught
  and degrades to refs-only, never propagating the throw. Enrichment queries only the kept branches, so other
  owners' WUs cost no PR lookup.

### `[ ]` **1.4 Dead-ref prune backstop at the two sites**

- _Goal:_ Merged-and-deleted errand branches stop lingering as stale remote-tracking refs — a `git fetch
  --prune` runs at the two natural sites so the namespace stays clean and the interim sweep is correct before the
  oracle ships.
- _Context:_ Correctness (A) already lives in the oracle's pruned-ref classification (1.1); this is the (B)
  hygiene backstop. Both, per the spec — (A) without (B) accumulates cruft; (B) without (A) is racy.

    - `[ ]` **1.4.a Prune at `run-errand` § Complete**
        - Targeted — the in-session merge knows the slug; add the prune to the Complete teardown alongside the
          existing branch/worktree removal.

    - `[ ]` **1.4.b Prune backstop in the session-init errand sweep**
        - Broad `git fetch --prune` backstop for the async-merge case (reviewed-lane errand PRs that auto-delete
          the remote branch out-of-session); wire into the errand-state / staleness-sweep path.

## **Phase 2:** The `Priority` field

_Purpose:_ Introduce the per-WU `**Priority:**` input field (P1/P2/P3, `P3` default) as schema-owned structure
with a human-set value, so a multi-in-flight worklist can be triaged. Independent of the oracle; sequenced
before Phase 3 because the render standard consumes it.

_Design decisions:_ `P0` is deliberately not a level (its stop-the-world connotation misfits a standing attention
scale). Durability is the tracked field + git history — no in-file change-log array (ADR-020). Anti-inflation
(a soft cap on concurrent P1s) is documentation guidance only — never an agent-surfaced nag or render signal.

### `[ ]` **2.1 Add the `Priority` field to the meta schema (`template-meta.md`, both copies)**

- _Goal:_ `**Priority:**` is a documented, `P3`-defaulted field in the meta template — project instance and
  package source — so every new WU carries it and adopters inherit it.
- _Context:_ Schema-owned structure (name, valid values, default — not adopter-customizable) with a human-set
  value, per ADR-022.
- **Strategies:** strategy-package-project-sync.md

    - `[ ]` **2.1.a Add the field + slot placement**
        - Insert `**Priority:** P3` in the coordination block (after `Cohort`) in both copies; edit package
          source + `.arc/` instance together, never `cp`.

    - `[ ]` **2.1.b Document semantics in the template comment block**
        - Levels (P1 top focus / P2 elevated / P3 baseline), `P3` default, the no-`P0` rationale, and the
          anti-inflation-is-doc-guidance pointer; both copies.

### `[ ]` **2.2 Document `Priority` in `strategy-work-organization.md` § Source of truth (both copies)**

- _Goal:_ § Source of truth lists `**Priority:**` alongside State / Owner / Depends On / Cohort as a field the
  in-flight views render and sort on, with the anti-inflation discipline stated as documentation guidance only.
- **Strategies:** strategy-work-organization.md, strategy-package-project-sync.md

    - `[ ]` **2.2.a Add `Priority` to § Source of truth**
        - Field entry + its role in the render sort key; both copies.

    - `[ ]` **2.2.b State the anti-inflation discipline**
        - Soft cap on concurrent P1s as doc-only guidance; explicitly not a nag or render-time signal; both copies.

### `[ ]` **2.3 Add `Priority` to the meta schema record + a `validatePriority` helper**

- _Goal:_ `Priority` is a first-class `META_FIELDS` entry (so the `renderMetaFile` / `parseMetaRecord` round-trip
  covers it) and a `validatePriority` helper narrows a raw value to the bounded `P1` / `P2` / `P3` set with a
  `P3` default — the typed input the render sort and the oracle's data shape consume.
- _Approach:_ Add `{ name: "Priority", default: "P3", group: "coordination" }` to `META_FIELDS`; keep
  `parseMetaRecord` returning the raw value; add `validatePriority(raw): Priority` paralleling `validateState`
  in `active/types.ts`. The shared field set keeps render and parse symmetric.

    - Build `test-first` (one behavior at a time):
        - `validatePriority` narrows `P1` / `P2` / `P3` to themselves
        - `validatePriority` resolves a missing / `[none]` / out-of-range value (`P0`, `P5`) to `P3` with no throw
        - The `renderMetaFile` / `parseMetaRecord` round-trip covers the new `Priority` field (round-trip guard
          stays green)

## **Phase 3:** `STATUS.USER` view + render standard

_Purpose:_ Establish the user-scoped in-flight-mine view and its render standard — derivation algorithm,
per-table column sets, uniform sort key, regeneration triggers, and hand-maintenance procedure —
gitignored-local and per-machine, with the explicit `arc status --user` invocation as the active re-render path.

_Design decisions:_ `STATUS.USER` is the in-flight-mine slice of the same source as the project view — not a
second generator. This WU renders to the **terminal** via a pure render core and hand-maintains the file per the
standard; the canonical-file write + reconcile is deferred to `operational-state-docs` / roadmap-tooling, which
reuse the same render core (zero throwaway). The render core and the hand-maintenance procedure produce
byte-identical output, making the standard executable.

### `[ ]` **3.1 `STATUS.USER` render standard in the strategy doc**

- _Goal:_ A strategy-doc standard defines how `STATUS.USER` (and the per-table column sets / uniform sort the
  project view shares) is derived and hand-maintained — precise enough that the code render core and a human
  produce byte-identical output.
- _Context:_ Filtered mode of the same source as the project view; establishes the standard
  roadmap-tooling / `operational-state-docs` later mechanize.
- _Note:_ Executor-only context — keep § ROADMAP adopter-neutral (no internal-WU forward-pointers). roadmap-tooling
  later slims the render mechanics into its renderer spec, so add only the durable contract (column sets, sort key,
  triggers) here, not a step-by-step the renderer will own.
- **Strategies:** strategy-work-organization.md, strategy-package-project-sync.md

    - `[ ]` **3.1.a Per-table column sets**
        - In Flight / Ready / Blocked / `STATUS.USER`, each omitting columns constant across that table;
          `[Priority]` rendered only when the field is present.

    - `[ ]` **3.1.b Uniform sort key + byte-stability contract**
        - `(priority, cohort, wu-name)`; absent priority resolves to `P3`; Blocked additionally banded by
          dependency depth; identical inputs → byte-identical output; tables exempt from line-length lint
          (`MD013.tables: false`).

    - `[ ]` **3.1.c Regeneration triggers + hand-maintenance procedure**
        - Local-slice ceremonies (spawn / activate / integrate / shift / handoff) vs cross-machine-slice subset
          (handoff / `arc sync` / explicit view / no-local-WU init); the step-by-step hand-maintenance procedure.

### `[ ]` **3.2 `STATUS.USER` view file — gitignored-local, single-cache model**

- _Goal:_ The `STATUS.USER` file lives at `.arc/user/{identity}/STATUS.USER.md`, per-machine, and is itself the
  cache — no separate persisted cache — so opening it never triggers a network read and it is trustworthy because
  the last ceremony refreshed it.
- _Approach:_ The existing `.arc/user/*/` gitignore pattern already covers it (sibling to `WORKING-MEMORY.md` /
  `USER-INBOX.md`) — no new ignore entry needed; seed an initial hand-rendered baseline per 3.1.

    - File at `.arc/user/{identity}/STATUS.USER.md` (auto-gitignored by `.arc/user/*/`); initial hand-rendered
      baseline
    - Single-cache invariant documented: the rendered file is the cache; file-open is the passive path (instant,
      no regen)

### `[ ]` **3.3 `arc status --user` explicit-view command**

- _Goal:_ `arc status --user` fires the oracle, renders the in-flight-mine slice to the terminal via a pure
  render core (canonical markdown per the standard), and degrades to the last-rendered file when the remote is
  unreachable — an active re-render request, not a passive file-open.
- _Context:_ Routed through `runStatus` (not `--session-init`), so `active.resolution` gating does not apply. The
  render core is a pure `render(slice, columns, sort) → string` lib function — the forward-compat hook the file
  write + reconcile engine reuses; this WU does not write the managed-doc file or build reconcile.
- **Strategies:** strategy-testing-methodology.md

    - `[ ]` **3.3.a Pure render core (oracle slice → canonical-markdown string)**
        - Build `test-first` (one behavior at a time):
            - Renders the in-flight-mine slice to a canonical-markdown string for a given oracle result + Priority
            - Produces byte-identical output for identical inputs (no spurious diffs)
            - Applies the per-table column sets and uniform sort key from the standard (3.1)

    - `[ ]` **3.3.b `--user` flag + `runStatus` wiring + bounded network read**
        - Add the `--user` option in `cli.ts`; wire the oracle into `runStatus` behind a bounded timeout;
          print-then-degrade to the last-rendered file on miss/offline.

    - `[ ]` **3.3.c `--local` / `--no-fetch` offline path**
        - Skip the network read; render from local refs only for a fast offline view.

## **Phase 4:** Materialize quadrant

_Purpose:_ Add the fourth `arc-session` entry-point quadrant — discovery-led pickup of a remote-only in-flight WU
onto this machine — as thin orchestration over the oracle's candidate surface (`git worktree add` →
`arc user pull` → orient).

_Design decisions:_ Discovery-led, no `--materialize <name>` flag (deferred — the candidate list is the
correctness mechanism). Git refuses double-checkout, so an already-materialized branch points at the existing
worktree (free safety). The oracle slot is hand-wired here with a local gate; Phase 6 / R10 generalizes it.

### `[ ]` **4.1 Materializable-WU candidate detection from the oracle**

- _Goal:_ The oracle surfaces the operator's remote-only in-flight WUs (branch + meta on the remote, no local
  worktree) as materialize candidates — the discovery surface that makes a phantom / typo'd name impossible.
- _Approach:_ Filter oracle output by remote-only + owned, paralleling `materializable-errands.ts`'s candidate
  shape.

    - Build `test-first` (one behavior at a time):
        - Selects a remote-only owned in-flight WU as a candidate
        - Excludes a WU already checked out locally (a local worktree exists → free double-checkout safety)
        - Excludes another identity's remote-only WU

### `[ ]` **4.2 Wire the oracle slot into the session-init probe (gated)**

- _Goal:_ `runSessionInitStatus` surfaces materializable-WU candidates by firing the oracle network slice only
  when `active.resolution === "none"`, so the resume path pays zero oracle cost.
- _Context:_ Hand-coded gate here, mirroring today's `errandState` gate; Phase 6 / R10 generalizes the
  affordance. Preserves the `safeProbe` envelope contract and per-slot result shape.

    - Build `test-first` (one behavior at a time):
        - Fires the oracle slot when `active.resolution === "none"`
        - Skips it — no network read — when an active WU resolves
        - Surfaces remote-only WU candidates in the envelope; empty list when none

### `[ ]` **4.3 Session-init Materialize arm — the WU path**

- _Goal:_ The session-init Materialize arm picks up a selected remote-only WU — `git worktree add
  <templated-path> origin/<branch>` → `arc user pull` → re-probe → orient as Resume — completing a cross-machine
  pickup without a hand-rolled git incantation.
- _Note:_ Reuse Worktree Foundation's worktree location template (`resolveWorktreeLocation`); `arc user pull` is
  the black-box notes load. The WU arm exists in skeleton in `session-init.md`; this fills the candidate
  surfacing + path template.

    - `[ ]` **4.3.a Wire candidate selection → materialize → re-probe → Resume**
        - In `session-init.md`: surface oracle WU candidates on the no-local-WU arm; on selection run the
          worktree-add → `arc user pull` → re-run Step 1 probe → proceed as Resume.

    - `[ ]` **4.3.b Templated worktree path + double-checkout safety**
        - Confirm the path shape + collision handling against the WF template; surface that an already-checked-out
          branch points at the existing worktree rather than erroring.

## **Phase 5:** Oracle-backed concurrency check

_Purpose:_ Upgrade the activation-time concurrency check and the errand-launch foreign-artifact gate from
degrading advisory stubs to the oracle-backed version — identity-filtered refs + PRs, consumed from spawn /
cold-start / materialize / errand-launch — still advisory, never a gate.

_Design decisions:_ The oracle's in-flight-errand detection absorbs work-routing-discipline's interim
errand-state probe + sweep. The gate doctrine (when/how the oracle gates) stays Concurrent Work Conventions's;
here every consumer remains advisory.

### `[ ]` **5.1 Swap the concurrency check data source to the oracle**

- _Goal:_ `in-flight-scope-check.md` consumes the oracle (identity-filtered refs + PRs) instead of the local-only
  `arc active roster`, so the check sees cross-worktree and cross-machine in-flight WUs — still advisory.
- _Context:_ Consumed from spawn / cold-start / materialize; absorbs the interim errand-state probe + in-flight
  errand sweep into the oracle.
- _Note:_ `in-flight-scope-check.md` already treats its data source as opaque (its Assess step reads each WU's
  scope from the meta `**Design:**` field); the oracle already reads metas, so carry `Design` in its output
  rather than re-reading.

    - `[ ]` **5.1.a Repoint the scope-check data source (roster → oracle)**
        - Update `in-flight-scope-check.md`'s Gather step and any backing command to read the oracle; keep the
          degrade-to-silent on empty.

    - `[ ]` **5.1.b Fold the interim errand-state probe / sweep into the oracle-backed check**
        - Route the in-flight-errand signal through the oracle so the activation check and the errand surfaces
          share one source.

### `[ ]` **5.2 Oracle-back the errand-launch foreign-artifact gate**

- _Goal:_ `arc errand check` / `run-errand` § Launch derives overlap from the oracle, so the errand-launch
  foreign-artifact gate is oracle-backed and advisory across worktrees / machines.
- _Approach:_ Repoint `handlers/errand.ts`'s `detectForeignArtifactOverlap` source to the oracle.
- _Note:_ `detectForeignArtifactOverlap` (`lib/git/index.ts`) consumes a `roster: { entries, warnings }` shape;
  expose an oracle projection in that shape so the overlap core stays intact rather than refactoring its contract.

    - Build `test-first` (one behavior at a time):
        - Surfaces an overlapping in-flight WU from oracle data for a target path set
        - Produces no output when no overlap (silent advisory)
        - Degrades to refs-only overlap when no PR adapter is present

## **Phase 6:** Session-probe orchestration seam

_Purpose:_ Evolve the status orchestrator into a gated-slot affordance — expensive slots fire only under their
condition — and de-duplicate the per-entry-point slot lists, preserving the `safeProbe` envelope contract and
per-slot result shape.

_Design decisions:_ Earn generality from the two real instances (Worktree Foundation's roster slot + this WU's
oracle slot); no pre-building for coord-probe's future third instance. Sequenced last (P2) because it
generalizes the firing discipline the earlier consumer phases hand-wire.

### `[ ]` **6.1 Gated-slot affordance over the orchestrator**

- _Goal:_ The orchestrator expresses expensive slots as gated slots that fire only under their condition — the
  oracle network slice gated on `active.resolution === "none"` — generalized from the roster + oracle instances,
  preserving the `safeProbe` "envelope never rejects" contract.
- _Context:_ Evolves the firing discipline, not the slot contract; per-slot result shape is unchanged.
- **Strategies:** strategy-testing-methodology.md

    - Build `test-first` (one behavior at a time):
        - A gated slot fires when its condition holds and is omitted — no probe call — otherwise
        - The roster slot and the oracle slot both express through the same affordance
        - The envelope still never rejects (a throwing slot resolves to an error slot, not a rejection)
        - Per-slot result shape matches today's hand-coded gates

### `[ ]` **6.2 De-duplicate the per-entry-point slot lists**

- _Goal:_ The slots hand-re-declared across `runStatus` / `runSessionInitStatus` / `runSessionHandoffStatus`
  (user / worktree / dirty / active / releaseRouting) are declared once and composed, so the three entry points
  share one slot source.

    - Build `test-first` (one behavior at a time):
        - The three entry points compose from a single shared slot declaration
        - Each entry point's envelope shape is unchanged (regression-guarded)

## **Phase 7:** Verification

### `[ ]` **7.1 Complete verification** — load and follow [`verify-work-unit.md`][verify-work-unit]

---

## Success Criteria

- `[ ]` Oracle derives correctly and is dead-ref-robust: returns the identity's in-flight WUs with State via
  `git show` with no checkout; a merged-and-deleted errand branch does not appear (classification over a pruned
  ref view).
- `[ ]` Resume path pays zero oracle cost: with an active local WU resolved, session-init fires no oracle network
  read; the network slice fires only on the named triggers, each bounded and degrading to the last-rendered file.
- `[ ]` `STATUS.USER` renders to standard and is byte-stable: the in-flight-mine slice renders with the per-table
  column sets + uniform sort key; identical inputs produce byte-identical output; `arc status --user` renders in
  the terminal via the pure core; opening the file does not regenerate it.
- `[ ]` `Priority` field is live and conflict-free: `**Priority:**` is in `template-meta.md` and
  `strategy-work-organization.md`, defaults to `P3`, drives the render sort, and is a per-WU tracked edit with no
  shared-ordering doc.
- `[ ]` Materialize completes a cross-machine pickup: from a no-local-WU session the oracle surfaces a
  remote-only owned WU and `arc-session` materializes the selected one; an already-materialized branch points at
  the existing worktree rather than erroring.
- `[ ]` Activation concurrency check is oracle-backed and advisory: spawn / cold-start / materialize /
  errand-launch consult the oracle-backed check; it surfaces overlap and never blocks.
- `[ ]` Orchestration seam gates expensive slots: the orchestrator fires the oracle slot only under its
  condition, de-duplicates the per-entry-point slot lists, and preserves the `safeProbe` envelope contract.
- `[ ]` All quality gates pass (tests, linting, type checking)
- `[ ]` Ready for integration

[verify-work-unit]: ../system/workflows/arc/work-unit-lifecycle/verify-work-unit.md
