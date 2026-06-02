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

### `[x]` **1.4 Dead-ref prune backstop at the two sites**

- _Goal:_ Merged-and-deleted errand branches stop lingering as stale remote-tracking refs — a `git fetch
  --prune` runs at the two natural sites so the namespace stays clean and the interim sweep is correct before the
  oracle ships.
- _Outcome:_ The (B) hygiene backstop lands at both sites. The interim errand sweep no longer counts an
  out-of-session-merged errand as phantom in-flight, complementing the oracle's pruned-ref classification (A).

    - `[x]` **1.4.a Prune at `run-errand` § Complete**
        - `run-errand` § Complete (both copies) prunes the merged-and-deleted `origin/chore/<slug>` ref via a
          targeted `git fetch --prune origin` after teardown — the slug is known in-session.

    - `[x]` **1.4.b Prune backstop in the session-init errand sweep**
        - `runErrandState` runs a broad `git fetch --prune origin` on the discovery path before reading refs,
          best-effort (degrades to last-known refs when offline). Covers the async-merge case where a
          reviewed-lane errand PR auto-deletes its remote branch out-of-session. Tests assert prune-before-read
          ordering and the offline degrade.

## **Phase 2:** The `Priority` field

_Purpose:_ Introduce the per-WU `**Priority:**` input field (P1/P2/P3, `P3` default) as schema-owned structure
with a human-set value, so a multi-in-flight worklist can be triaged. Independent of the oracle; sequenced
before Phase 3 because the render standard consumes it.

_Design decisions:_ `P0` is deliberately not a level (its stop-the-world connotation misfits a standing attention
scale). Durability is the tracked field + git history — no in-file change-log array (ADR-020). Anti-inflation
(a soft cap on concurrent P1s) is documentation guidance only — never an agent-surfaced nag or render signal.

### `[x]` **2.1 Add the `Priority` field to the meta schema (`template-meta.md`, both copies)**

- _Goal:_ `**Priority:**` is a documented, `P3`-defaulted field in the meta template — project instance and
  package source — so every new WU carries it and adopters inherit it.

    - `[x]` **2.1.a Add the field + slot placement**
        - Inserted `**Priority:** P3` in the coordination block (after `Cohort`) in both copies — package
          source + `.arc/` instance edited together.

    - `[x]` **2.1.b Document semantics in the template comment block**
        - Documented the levels (P1 top focus / P2 elevated / P3 baseline), `P3` default, the no-`P0` rationale,
          and the anti-inflation-is-doc-guidance pointer in the template comment block; both copies.

### `[x]` **2.2 Document `Priority` in `strategy-work-organization.md` § Source of truth (both copies)**

- _Goal:_ § Source of truth lists `**Priority:**` alongside State / Owner / Depends On / Cohort as a field the
  in-flight views render and sort on, with the anti-inflation discipline stated as documentation guidance only.

    - `[x]` **2.2.a Add `Priority` to § Source of truth**
        - Added the `**Priority:**` bullet (P1/P2/P3, `P3` default) after `Cohort`, noting it feeds the in-flight
          views' sort and renders as a conditional column; both copies. Full sort-key/column mechanics stay with
          § Render algorithm (the render standard).

    - `[x]` **2.2.b State the anti-inflation discipline**
        - Added a `**Priority anti-inflation.**` note: a soft cap on concurrent `P1`s, documentation discipline
          only — never an ARC nag or render-time signal; both copies.

### `[x]` **2.3 Add `Priority` to the meta schema record + a `validatePriority` helper**

- _Goal:_ `Priority` is a first-class `META_FIELDS` entry (so the `renderMetaFile` / `parseMetaRecord` round-trip
  covers it) and a `validatePriority` helper narrows a raw value to the bounded `P1` / `P2` / `P3` set with a
  `P3` default — the typed input the render sort and the oracle's data shape consume.
- _Outcome:_ `{ name: "Priority", default: "P3", group: "coordination" }` is in `META_FIELDS` (after `Cohort`),
  so every render carries `**Priority:** P3` and `parseMetaRecord` recovers it raw; the existing round-trip guard,
  which iterates `META_FIELDS`, now covers it. Added the `Priority` type + `validatePriority(p): Priority` to
  `commands/active/types.ts` paralleling `validateState`, but never-failing — any unrecognized input (`null`,
  `[none]`, `P0`/`P5`, case-mismatch) resolves to the `P3` baseline rather than an `"unknown"` sentinel, so the
  sort/render always get a usable level.

## **Phase 3:** `STATUS.USER` view + render standard

_Purpose:_ Establish the user-scoped in-flight-mine view and its render standard — derivation algorithm,
per-table column sets, uniform sort key, regeneration triggers, and hand-maintenance procedure —
gitignored-local and per-machine, with the explicit `arc status --user` invocation as the active re-render path.

_Design decisions:_ `STATUS.USER` is the in-flight-mine slice of the same source as the project view — not a
second generator. This WU renders to the **terminal** via a pure render core and hand-maintains the file per the
standard; the canonical-file write + reconcile is deferred to `operational-state-docs` / roadmap-tooling, which
reuse the same render core (zero throwaway). The render core and the hand-maintenance procedure produce
byte-identical output, making the standard executable.

### `[x]` **3.1 `STATUS.USER` render standard in the strategy doc**

- _Goal:_ A strategy-doc standard defines how `STATUS.USER` (and the per-table column sets / uniform sort the
  project view shares) is derived and hand-maintained — precise enough that the code render core and a human
  produce byte-identical output.

    - `[x]` **3.1.a Per-table column sets**
        - In Flight / Ready / Blocked / `STATUS.USER`, each omitting columns constant across that table;
          `[Priority]` is a conditional column (rendered only when a row in the table carries a value).

    - `[x]` **3.1.b Uniform sort key + byte-stability contract**
        - `(priority, cohort, wu-name)`; absent priority resolves to `P3` (so an all-default render reduces to
          today's `(cohort, wu-name)`); Blocked additionally banded by dependency depth; WU-name is the
          total-order tiebreak → byte-identical output for identical inputs; tables exempt from line-length lint
          (`MD013.tables: false`, verified present in `.markdownlint-cli2.jsonc`).

    - `[x]` **3.1.c Regeneration triggers + hand-maintenance procedure**
        - Local slice (spawn / activate / integrate / shift / handoff, no network) vs cross-machine slice
          (handoff / `arc sync` / explicit `arc status --user` / no-local-WU init, bounded network read,
          degrade to last-rendered); 3-step hand-maintenance procedure deferring derivation to § Render algorithm.

- _Outcome:_ Added to `strategy-work-organization.md § ROADMAP` (both copies): a `### Render standard` subsection
  holding the shared contract (column sets + sort key + byte-stability + lint exemption) and a `### STATUS.USER
  view` subsection (the filtered view, its gitignored-local single-cache storage, triggers, and hand-maintenance).
  The contract is single-sourced — § Render algorithm's emit step now _defers_ column membership and sort to
  § Render standard rather than duplicating, so the later renderer extraction lifts mechanics out and leaves the
  contract in place. Byte-stability is scoped to the rendered slice (tables); a provenance marker — a commit hash
  for the project view, an `Updated:` timestamp for `STATUS.USER` (its inputs are remote refs + PRs, which a hash
  can't certify) — is stamped metadata outside the contract. Kept adopter-neutral (no internal-WU names /
  forward-pointers).

### `[x]` **3.2 `STATUS.USER` view file — gitignored-local, single-cache model**

- _Goal:_ The `STATUS.USER` file lives at `.arc/user/{identity}/STATUS.USER.md`, per-machine, and is itself the
  cache — no separate persisted cache — so opening it never triggers a network read and it is trustworthy because
  the last ceremony refreshed it.
- _Outcome:_ Seeded `.arc/user/andrew/STATUS.USER.md` — a hand-rendered baseline per § Render standard (one-row
  in-flight-mine slice, `in-flight-awareness`; `[Priority]` column omitted as no WU carries a value yet, the dep
  resolves to `—` by absence, matching the project In Flight row). Confirmed `.gitignore`'s `.arc/user/*/` already
  covers it (`git check-ignore` — no new ignore entry). The file header documents the single-cache invariant: the
  rendered file is the cache, file-open is the passive path (instant, no regen, no network read).

### `[x]` **3.3 `arc status --user` explicit-view command**

- _Goal:_ `arc status --user` fires the oracle, renders the in-flight-mine slice to the terminal via a pure
  render core (canonical markdown per the standard), and degrades to the last-rendered file when the remote is
  unreachable — an active re-render request, not a passive file-open.
- _Context:_ Routed through `runStatus` (not `--session-init`), so `active.resolution` gating does not apply. The
  render core is a pure `render(slice, columns, sort) → string` lib function — the forward-compat hook the file
  write + reconcile engine reuses; this WU does not write the managed-doc file or build reconcile.
- **Strategies:** strategy-testing-methodology.md

    - `[x]` **3.3.a Pure render core (oracle slice → canonical-markdown string)**
        - New `src/lib/status/render.ts`: pure `renderStatusTable(slice, columns)` over a resolved
          `StatusViewRow` model (dependency / priority resolved upstream). Emits a width-padded markdown table
          applying the `STATUS_USER_COLUMNS` set with the conditional `Priority` column (shown only when a row
          carries a value) and the uniform `(priority, cohort, wu-name)` sort. Reproduces the seeded
          `STATUS.USER` table byte-for-byte; order-independent output gives the no-spurious-diffs guarantee.
          Two render decisions: an absent-priority row renders `P3` (the resolved baseline) when the column is
          shown; an absent cohort sorts after every named cohort. Owner/Depends-on resolution from the oracle
          is wiring deferred to 3.3.b.

    - `[x]` **3.3.b `--user` flag + `runStatus` wiring + bounded network read**
        - `--user` option added to the `status` command (handler-enforced mutual exclusion with
          `--session-init` / `--session-handoff`); `runStatusUserView` composer (`src/lib/status/user-view.ts`)
          fires the oracle behind the bounded `resolveInFlightBranchSet` read, assembles the slice via
          `buildInFlightMineSlice`, and renders through the core. On an online-but-unreachable remote it degrades
          to the last-rendered `STATUS.USER.md` cache; with no cache it reports the miss. The oracle gained
          `priority` + parsed `dependsOn` (the assembler resolves deps against the in-flight set — unsatisfied =
          still in flight; solo-mode-complete, full backlog satisfaction deferred to the file-writer).

    - `[x]` **3.3.c `--local` / `--no-fetch` offline path**
        - `--local` (alias `--no-fetch`) flows `localOnly` into the composer, which skips the network read and
          renders from local remote-tracking refs — no degrade (the offline view was requested). Cannot prune
          dead refs, so a lingering merged-and-deleted branch may surface; the online path prunes correctly.

- _Outcome:_ `arc status --user` is live and renders byte-identical to the seeded `STATUS.USER` table (verified
  against the real repo, online + `--local` + `--no-fetch`). The pure render core landed as
  `renderStatusTable(slice, columns)` with the uniform sort baked in (not a passed `sort` arg). Terminal-only
  per scope: no managed-doc file write or reconcile. New `src/lib/status/` module trio (render / in-flight-mine /
  user-view); oracle and `remote-ref-reader` extended additively (the prior `listPrunedRemoteTrackingBranches`
  now delegates to the reachability-aware `resolveInFlightBranchSet`).

## **Phase 4:** Materialize quadrant

_Purpose:_ Add the fourth `arc-session` entry-point quadrant — discovery-led pickup of a remote-only in-flight WU
onto this machine — as thin orchestration over the oracle's candidate surface (`git worktree add` →
`arc user pull` → orient).

_Design decisions:_ Discovery-led, no `--materialize <name>` flag (deferred — the candidate list is the
correctness mechanism). Git refuses double-checkout, so an already-materialized branch points at the existing
worktree (free safety). The oracle slot is hand-wired here with a local gate; Phase 6 / R10 generalizes it.

### `[x]` **4.1 Materializable-WU candidate detection from the oracle**

- _Goal:_ The oracle surfaces the operator's remote-only in-flight WUs (branch + meta on the remote, no local
  worktree) as materialize candidates — the discovery surface that makes a phantom / typo'd name impossible.
- _Outcome:_ New pure `materializable-work-units.ts` (`findMaterializableWorkUnits`) filters oracle
  `InFlightEntry[]` to remote-only owned work units, returning `{ name, branch }` candidates (errands excluded).
  The identity gate mirrors the oracle's `keepForIdentity` — current-identity + unattributed survive, another
  identity drops — so it holds regardless of how the upstream oracle was configured.

### `[x]` **4.2 Wire the oracle slot into the session-init probe (gated)**

- _Goal:_ `runSessionInitStatus` surfaces materializable-WU candidates by firing the oracle network slice only
  when `active.resolution === "none"`, so the resume path pays zero oracle cost.
- _Outcome:_ New `materializableWorkUnits` slot on `SessionInitProbes` + the envelope (`SessionInitProbeResult`),
  fired in the orchestrator's second stage behind an `active.value.resolution === "none"` gate (mirrors the
  `errandState` discovery gate; `safeProbe`-wrapped, so a rejecting oracle never sinks the composite). Handler
  binds the bounded oracle pipeline (`resolveInFlightBranchSet` → `deriveInFlight` → `findMaterializableWorkUnits`,
  identity + team-mode); an unreachable remote degrades to empty candidates. Slot absent on the resume path.

### `[x]` **4.3 Session-init Materialize arm — the WU path**

- _Goal:_ The session-init Materialize arm picks up a selected remote-only WU — `git worktree add
  <templated-path> origin/<branch>` → `arc user pull` → re-probe → orient as Resume — completing a cross-machine
  pickup without a hand-rolled git incantation.

    - `[x]` **4.3.a Wire candidate selection → materialize → re-probe → Resume**
        - `session-init.md` (both copies): the Materialize arm now reads remote-only WUs from
          `materializableWorkUnits.value.candidates`, surfaces them via a Step 6 "Materializable work units" route +
          the Discovery-arm mention, and on selection runs worktree-add → `arc user pull` → re-run Step 1 → Resume.

    - `[x]` **4.3.b Templated worktree path + double-checkout safety**
        - Path resolves from `worktree.location_template` (`{repo}` / `{branch}` slugged); the candidate surface
          already excludes locally-checked-out entries (`remoteOnly`), with git's double-checkout refusal as the
          backstop (resolves to the existing worktree, never a second one).

- _Outcome:_ Filled the skeleton WU half of the Materialize arm in `session-init.md` + its package-source
  `.template.md` (mirrored, conditional blocks untouched): envelope-table row for `materializableWorkUnits`,
  candidate-driven Materialize dispatch with the templated path + double-checkout backstop, and a Step 6
  orientation surface. Doc-only — the detecting/wiring code shipped in Tasks 4.1–4.2.

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
