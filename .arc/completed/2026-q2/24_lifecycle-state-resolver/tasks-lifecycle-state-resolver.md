# Task List: lifecycle-state-resolver

- **Design:** `spec-lifecycle-state-resolver.md`

---

## **Phase 1:** State-space model & the lifecycle-complete index

_Purpose:_ Establish the read-side substrate every projection and every cohort member builds on — the
`(phase, location)` two-axis state-space types, the location-first deterministic resolution rules, and the
build-once in-memory index that scans the markdown work surfaces. Nothing here infers from git.

_Design decisions:_ One index per invocation (no cache), built from a single scan over the lifecycle
directories; injectable-fs `lib` module following the `completed-index.ts` / `cohort-doc.ts` idiom; meta fields
read via the existing `meta-reader.ts` parser, never re-parsed.

### `[x]` **1.1 `(phase, location)` state-space types & resolution rules**

- _Goal:_ A work unit's lifecycle position is a single orthogonal `(phase, location)` pair resolved
  deterministically from location + meta fields — replacing reads of the overloaded `**State:**` field, with no
  git inference on the resolution path.

    - `[x]` **1.1.a Define the `Phase`, `Location`, and position types**
        - `Phase` aliases `WorkUnitState` (imported from `src/commands/active/types.ts`); `Location` is
          `"provisional" | "planned" | "active" | "completed"`; `LifecyclePosition = { phase; location }` is the
          source-of-truth pair — and the logical-record shape a later record substrate persists.

    - `[x]` **1.1.b Implement location-first resolution rules**
        - `locationFromPath` reads location from the containing tier (segment-matched, robust to relative and
          absolute paths); `resolveLifecyclePosition` pairs it with the phase from `validateState`, returning
          `null` for an unknown tier or a non-codified `**State:**`. Directory wins the location axis (never
          inferred from meta State); both are pure synchronous functions — no fs/git on the resolution path.
        - **Strategies:** strategy-testing-methodology.md

- _Outcome:_ New `src/lib/work-unit/lifecycle-state.ts` establishes the two-axis state space and the location-first
  resolver every cohort member builds on; tests cover the tier map, the planned-stub-vs-graduated phase split, the
  directory-wins lag tiebreak, and the unresolvable (unknown-tier / non-codified-State) cases.

### `[x]` **1.2 Lifecycle-complete index scan (`slug → { phase, location, cohort, path }`)**

- _Goal:_ One in-memory index, built once per invocation from a single scan across `backlog/provisional/`,
  `backlog/planned/`, `active/`, and `completed/`, mapping each work-unit slug to its phase, location, cohort,
  and path — the shared substrate both projections read.

    - `[x]` **1.2.a Injectable-fs interface & module skeleton**
        - `LifecycleIndexFs` exposes a Dirent-returning `readdir` (file-type detection for the recursive walk)
          plus `readFile`; `BuildLifecycleIndexOptions` carries `{ cwd, fs }`. New module
          `src/lib/work-unit/lifecycle-index.ts`, following the injectable-fs idiom of `completed-index.ts`.

    - `[x]` **1.2.b Per-tier directory walk**
        - `active/` enumerated flat (non-recursive); `backlog/planned/`, `backlog/provisional/`, and `completed/`
          walked recursively. Only `meta-*.md` files are collected, so `cohort-*.md` closeout dirs fall away by
          filename match rather than archive-dir-prefix detection.

    - `[x]` **1.2.c Meta-field read into index entries**
        - Phase + location resolve through `resolveLifecyclePosition`; cohort via `metaCohortField` (`[none]` /
          absent → `null`); slug and cwd-relative `path` from the `meta-<slug>.md` filename. The meta is parsed
          once per file via `parseMetaRecord`.

    - `[x]` **1.2.d Build-once & resilience**
        - One scan per call returns a fresh `Map` (no persisted cache); a missing tier contributes nothing, and
          an unreadable, malformed, or non-codified-`State` meta is skipped — never fatal.

- _Outcome:_ `lifecycle-index.ts` builds the lifecycle-complete `slug → { phase, location, cohort, path }` index
  in a single injectable-fs scan — composing Task 1.1's resolver for `(phase, location)` and reusing
  `parseMetaRecord` / `metaCohortField`. The one built `Map` is the shared substrate both Phase 2/3 projections
  read; the per-tier walk, field reads, and the missing-dir / unreadable / malformed skip paths are covered by
  tests.

---

## **Phase 2:** Projection A — the slug→state resolver

_Purpose:_ Expose the layered slug→state surface consumers switch on — the `(phase, location)` pair primitive,
the derived 8-value state enum, and the curated `occupied?` / `shipped?` predicates — all pure functions of the
pair read from the Phase 1 index.

_Design decisions:_ The pair primitive is the source of truth (the arc-backend-safe logical-record shape); the
enum and predicates derive from it. The predicate set is deliberately curated to the guard call-sites, not
one-per-state.

### `[x]` **2.1 Pair primitive & derived state enum**

- _Goal:_ A slug resolves to its `(phase, location)` pair (the primitive return) and to the derived state enum
  consumers switch on, correct across the full matrix.

    - `[x]` **2.1.a Pair-primitive resolution from the index**
        - `resolveSlugPosition(index, slug)` returns the entry's `LifecyclePosition`, or `null` for the absent
          case (slug in no tier).

    - `[x]` **2.1.b Derived state enum & derivation map**
        - `deriveState` maps the eight canonical `(phase, location)` combinations to the `LifecycleState` enum
          (`nonexistent` / `provisional` / `planned` / `planning` / `active` / `integrating` / `parked` /
          `shipped`); every residual lag combo falls to a deterministic location-dominant value (e.g.
          `(Integrating, completed)` → `shipped`, `(Shipped, active)` → `active`). `resolveSlugState` composes
          the lookup with the derivation.
        - **Strategies:** strategy-testing-methodology.md

- _Outcome:_ New `src/lib/work-unit/lifecycle-resolver.ts` exposes Projection A — the `(phase, location)` pair
  primitive and the derived slug→state enum, a total function over the matrix with directory-dominant resolution
  of the residual lag combos. The pair is the arc-backend-safe primitive; the enum is the single switch value
  `start` dispatch and the status surfaces consume.

### `[x]` **2.2 Curated predicate sugar (`occupied?` / `shipped?`)**

- _Goal:_ Two booleans read directly off the pair for the guard call-sites that prefer a boolean to a switch —
  nothing more.

    - `[x]` **2.2.a `occupied?` — slug live on a branch / worktree**
        - `isOccupied(index, slug)` is true for `planning` / `active` / `integrating`, false for every other
          derived state — the worktree-occupancy guard's boolean.

    - `[x]` **2.2.b `shipped?` — landed for dep-discharge & completion checks**
        - `isShipped(index, slug)` is true only for `shipped`; `integrating` (PR open, unmerged) reads false —
          a fact, not a forecast. Pure-local: no git / network on the predicate path.

- _Outcome:_ `isOccupied` / `isShipped` added to `lifecycle-resolver.ts` — the curated, pure-local predicate
  pair over the derived state (no mechanical per-state set, no materialize predicate). Both compose
  `resolveSlugState`, so the no-git-inference guard holds at the surface.

---

## **Phase 3:** Projection B — cohort-membership resolver & archival-trigger

_Purpose:_ Resolve cohort membership across all lifecycle states from the same index (distinguishing a graduated
member from a removed one — the false-orphan kill) and detect the archival trigger. Reconcile with the existing
lifecycle-complete membership walk in `validate-cohort-consistency.ts` so there is one membership source.

_Design decisions:_ Membership keys on each meta's `**Cohort:**` field (position-independent), matching the
existing `buildLiveCohortContext` semantics; the archival-trigger is a pure query over membership — detection
only, since the `archive` fire-point is `lifecycle-transition-core`'s.

### `[x]` **3.1 Lifecycle-complete cohort-membership resolver**

- _Goal:_ Given a cohort path, return the set of member work units whose `**Cohort:**` field resolves to it,
  across every lifecycle state — so a graduated member (now in `active/`) is distinguished from a removed one.

    - `[x]` **3.1.a Membership projection over the index**
        - `resolveCohortMembers` / `buildCohortMembership` in `lifecycle-membership.ts` key on each index entry's
          `**Cohort:**` field: members spread across `planned/`, `active/`, and `completed/` all resolve to the
          cohort; a nested path matches the field value, not the filed directory; a non-member is excluded.

    - `[x]` **3.1.b False-orphan regression fixture (graduated vs. removed)**
        - A graduated member (field intact, now in `active/`) resolves as a member; a removed member (no meta
          anywhere) is simply absent from the set — the membership-level guarantee the validator's false-orphan
          check rests on.

- _Outcome:_ Projection B lands as a pure projection over the Phase 1 index, sibling to the slug→state resolver.
  `buildCohortMembership` emits the exact `Map<cohort, Set<slug>>` shape (`liveMembersByDir`) that Task 3.3 routes
  `validate-cohort-consistency.ts` onto — one membership source, no second tree scan.

### `[x]` **3.2 Archival-trigger detection predicate**

- _Goal:_ A predicate reports "last member has shipped" iff no cohort member remains outside `completed/` —
  detection only; the sweeping `archive` fire-point lives in `lifecycle-transition-core`.
- _Outcome:_ `isArchivalTriggered` in `lifecycle-membership.ts` — true iff a non-empty cohort has every member
  under `completed/` (location-dominant; an empty membership set is false). Shares the `cohortMembers` filter with
  `resolveCohortMembers`.

### `[x]` **3.3 Reconcile with existing cohort-consistency membership**

- _Goal:_ One membership source of truth — `validate-cohort-consistency.ts`'s lifecycle-complete walk consumes
  the resolver index rather than duplicating the scan, so membership semantics cannot drift between the two.

    - `[x]` **3.3.a Route the validator's membership through the resolver**
        - `buildLiveCohortContext` now derives `liveMembersByDir` from `buildCohortMembership` over a new sync,
          fs-free `buildLifecycleIndexFromMetas` (resolver) — the sync-capable entry that keeps the pre-commit
          script synchronous and single-walk. Existing validator cases (drift, missing doc, orphan, graduated
          member) and the end-to-end `npx tsx` run still pass; a malformed meta degrades to best-effort, where the
          old field-only path could throw (`entryFromMeta`'s parse guard now drops it).

- _Outcome:_ Membership is now the lifecycle index's cohort projection in both the resolver and the
  cohort-consistency validator — one source, no parallel scan. Extracted a pure `entryFromMeta` core shared by the
  async disk walk and the sync files-in builder. Index-sourced membership requires a resolvable `**State:**`, so
  the integration fixtures gained that field (real metas always carry it).

---

## **Phase 4:** Consumer reads & queryable surface

_Purpose:_ Land the dependency-state read that closes the state-blind dep-edge hazard, and make the resolved
predicates reachable from a probe / status query surface — not buried in a render path.

_Design decisions:_ The dep-state read is a slug→state query that falls out of `shipped?`; the queryable-surface
shape (a dedicated probe vs. extending an existing status command) is an implementation detail settled in this
phase against the current status surface — either satisfies the queryable constraint.

### `[x]` **4.1 Dep-state read (read half of dep-edge discharge)**

- _Goal:_ "Is dependency `X` landed?" is answered via the `shipped?` slug→state query over a work unit's
  `**Depends On:**` edges, closing the state-blind dependency-edge read hazard.

- _Outcome:_ `resolveDepStates(index, slug)` in `lifecycle-deps.ts` returns per-edge `{ slug, landed }` over a
  WU's `**Depends On:**` edges, with `landed` composed from `isShipped` (an `integrating` dependency reads
  not-landed). Edges are sourced from the index: `LifecycleIndexEntry` gained a `dependsOn: string[]` field
  parsed once in the single scan (same projection pattern as `cohort`), so the read is a pure slug-keyed
  projection a status surface can query without re-reading metas. Read half only — the write (edge rewrite in
  `activate`) and the integration-vs-merge readiness policy stay `lifecycle-transition-core`'s.

### `[x]` **4.2 Queryable probe / status surface exposure**

- _Goal:_ The resolved state and predicates are reachable from a probe / status query surface so a slug's
  lifecycle state can be queried, keeping the `lib` pure and the wiring at the command layer.

    - `[x]` **4.2.a Wire the resolver into the status / probe surface**
        - `arc status --lifecycle <slug>` builds the lifecycle index from disk (real `node:fs/promises`,
          `requireArcProjectRoot`-resolved `cwd`) and calls the pure resolver; the `lib` stays fs-free. New
          mode folded into the handler's mutual-exclusion guard alongside the other modes.

    - `[x]` **4.2.b JSON output shape for a slug→state query**
        - `resolveSlugQuery` (`lifecycle-query.ts`) aggregates the `(phase, location)` pair, derived enum,
          curated predicates (`occupied` / `shipped`), and the dep-edge states into one flat, totalized
          `--json` record (absent slug → `nonexistent` / `null` / `[]`, never an error). A compact text
          render backs the non-`--json` path.

- _Outcome:_ The read-side surface is reachable as a subject-keyed query. Placed as a `status` **mode** rather
  than a new `lifecycle` command group: the verb namespace (`start` / `park` / …) is owned downstream by
  `lifecycle-transition-core` + `idiomatic-alignment`, so minting it here would pre-empt their design. The
  durable artifact is the pure `resolveSlugQuery` aggregator; the CLI entry is a thin, relocatable shell that
  can move beside the lifecycle write verbs when they land (JSON shape unchanged). Per the testing methodology,
  `resolveSlugQuery` is unit-covered and the command wiring is verified by live dogfooding.

---

## **Phase 5:** Verification

### `[x]` **5.1 Complete verification** — load and follow [`verify-work-unit.md`][verify-work-unit]

- _Goal:_ The work unit is validated against full quality gates and spec success criteria before integration.
- _Quality gates:_ `npm run -s lint:md`, `npm run lint:ts`, `npm run lint:sh`, `npm run typecheck:all`,
  `npm run build`, and `npm test` passed; the full test run reported 2569 standard tests passed with 1 skipped,
  plus 70 E2E tests passed.
- _Success criteria:_ 9 criteria met; none superseded or open.

---

## Success Criteria

- `[x]` Resolver returns the correct `(phase, location)` pair and derived enum for every state — including
  parked@Active, park@Planning→`planned`, `nonexistent` (abandoned and never-existed), and the
  directory-trails-meta lag tiebreak — with no `git branch` / `git log` call on the resolution path.
- `[x]` Membership resolver distinguishes a graduated member from a removed one over a mixed-state cohort (the
  false-orphan regression fixture passes).
- `[x]` Archival-trigger predicate reports "last member" iff no member remains outside `completed/`.
- `[x]` Dep-state read answers "is `X` landed?" via slug→state, with no state-blind edge read.
- `[x]` Exactly one index is built per invocation and both projections read it; no persisted cache.
- `[x]` Module is pure `lib` with injectable dependencies; exposed predicate set limited to `occupied?` /
  `shipped?` (both pure-local — no network read).
- `[x]` Resolved predicates are reachable from a probe / status query surface, not render-only.
- `[x]` All quality gates pass (tests, linting, type checking)
- `[x]` Ready for integration

[verify-work-unit]: ../system/workflows/arc/work-unit-lifecycle/verify-work-unit.md
