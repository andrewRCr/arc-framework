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

### `[ ]` **2.2 Curated predicate sugar (`occupied?` / `shipped?`)**

- _Goal:_ Two booleans read directly off the pair for the guard call-sites that prefer a boolean to a switch —
  nothing more.
- _Rationale:_ A mechanical `isPlanned?` / `isParked?` set would duplicate the enum; materialize is not a
  predicate here (a remote-vs-local delta needs a network read this pure-local resolver does not do). Keeping the
  set pure-local is itself the no-git-inference guard holding at the surface.

    - `[ ]` **2.2.a `occupied?` — slug live on a branch / worktree**
        - Build `test-first` (one behavior at a time):
            - true for `planning` / `active` / `integrating`; false for every other derived state
            - the worktree-occupancy guard call-site reads it as a boolean

    - `[ ]` **2.2.b `shipped?` — landed for dep-discharge & completion checks**
        - _Note:_ `shipped?` is a fact (merged / in `completed/`), not a forecast — the `integrating` state
          (PR open, unmerged) reads false. "Far enough along to start a dependent" is a readiness overlay a
          consumer composes from the enum (`shipped` ∨ `integrating`), not this predicate.
        - Build `test-first` (one behavior at a time):
            - true for `shipped`; false for every other derived state (including `integrating`)
            - no git / network call on the predicate path

---

## **Phase 3:** Projection B — cohort-membership resolver & archival-trigger

_Purpose:_ Resolve cohort membership across all lifecycle states from the same index (distinguishing a graduated
member from a removed one — the false-orphan kill) and detect the archival trigger. Reconcile with the existing
lifecycle-complete membership walk in `validate-cohort-consistency.ts` so there is one membership source.

_Design decisions:_ Membership keys on each meta's `**Cohort:**` field (position-independent), matching the
existing `buildLiveCohortContext` semantics; the archival-trigger is a pure query over membership — detection
only, since the `archive` fire-point is `lifecycle-transition-core`'s.

### `[ ]` **3.1 Lifecycle-complete cohort-membership resolver**

- _Goal:_ Given a cohort path, return the set of member work units whose `**Cohort:**` field resolves to it,
  across every lifecycle state — so a graduated member (now in `active/`) is distinguished from a removed one.
- _Approach:_ Project over the same Phase 1 index (each entry carries its cohort), reproducing the
  position-independent membership semantics of `buildLiveCohortContext` (`src/scripts/validate-cohort-consistency.ts`).

    - `[ ]` **3.1.a Membership projection over the index**
        - Build `test-first` (one behavior at a time):
            - members spread across `planned/`, `active/`, and `completed/` all resolve to the cohort
            - nested-cohort paths match on the field value, not the filed directory
            - a non-member (different / absent `**Cohort:**`) is excluded

    - `[ ]` **3.1.b False-orphan regression fixture (graduated vs. removed)**
        - Build `test-first` (one behavior at a time):
            - a graduated member (field intact, now in `active/`) is a member, not an orphan
            - a removed member (no meta anywhere) is absent — the false-orphan flag does not fire
        - **Strategies:** strategy-testing-methodology.md

### `[ ]` **3.2 Archival-trigger detection predicate**

- _Goal:_ A predicate reports "last member has shipped" iff no cohort member remains outside `completed/` —
  detection only; the sweeping `archive` fire-point lives in `lifecycle-transition-core`.

    - Build `test-first` (one behavior at a time):
        - true when every member resolves under `completed/`
        - false when any member remains in `planned/` / `active/`
        - false on an empty membership set (no members → no "last member" to trip)
        - last-member-detection fixture: trips only as the final member crosses into `completed/`

### `[ ]` **3.3 Reconcile with existing cohort-consistency membership**

- _Goal:_ One membership source of truth — `validate-cohort-consistency.ts`'s lifecycle-complete walk consumes
  the resolver index rather than duplicating the scan, so membership semantics cannot drift between the two.
- _Approach:_ Migrate `buildLiveCohortContextFromDisk` onto the resolver. The seam to handle: the validator runs
  as a synchronous pre-commit script (`readdirSync` / `readFileSync`) while the resolver is async injectable-fs —
  reconcile via a sync-capable entry (or an awaited call at the script boundary), preserving the validator's
  best-effort (never-hard-gate) behavior and pre-commit performance.

    - `[ ]` **3.3.a Route the validator's membership through the resolver**
        - Build `test-first` (one behavior at a time):
            - the validator's existing cohort-consistency cases still pass against resolver-sourced membership
            - the graduated-member (no false-orphan) behavior is preserved end-to-end
            - an unreadable meta still degrades to best-effort, never a hard gate

---

## **Phase 4:** Consumer reads & queryable surface

_Purpose:_ Land the dependency-state read that closes the state-blind dep-edge hazard, and make the resolved
predicates reachable from a probe / status query surface — not buried in a render path.

_Design decisions:_ The dep-state read is a slug→state query that falls out of `shipped?`; the queryable-surface
shape (a dedicated probe vs. extending an existing status command) is an implementation detail settled in this
phase against the current status surface — either satisfies the queryable constraint.

### `[ ]` **4.1 Dep-state read (read half of dep-edge discharge)**

- _Goal:_ "Is dependency `X` landed?" is answered via the `shipped?` slug→state query over a work unit's
  `**Depends On:**` edges, closing the state-blind dependency-edge read hazard.
- _Note:_ Read half only, and `shipped` means merged — an in-flight (`integrating`) dependency reads not-landed.
  The write half (rewriting a landed edge inside `activate`'s mutator sequence) and any "may I start at the
  dependency's integration?" readiness policy are `lifecycle-transition-core`'s, out of scope here.

    - Build `test-first` (one behavior at a time):
        - an edge to a shipped dependency reads landed
        - an edge to an `integrating` (unmerged) dependency reads not-landed
        - multiple edges resolve independently

### `[ ]` **4.2 Queryable probe / status surface exposure**

- _Goal:_ The resolved state and predicates are reachable from a probe / status query surface so a slug's
  lifecycle state can be queried, keeping the `lib` pure and the wiring at the command layer.
- _Approach:_ Surface through the status probe orchestrator (`src/commands/status/run.ts`, the `safeProbe`
  fan-out) or a dedicated subcommand — chosen against the current status surface. Per the testing methodology,
  CLI wiring is test-after; cover the resolver logic it feeds, not Commander/clack wiring.

    - `[ ]` **4.2.a Wire the resolver into the status / probe surface**
        - Keep the resolver in `lib`; the command layer resolves `cwd` and binds the production fs.

    - `[ ]` **4.2.b JSON output shape for a slug→state query**
        - Return the `(phase, location)` pair, derived enum, and predicate values in a typed, `--json`-friendly
          shape consistent with the existing probe envelope.

---

## **Phase 5:** Verification

### `[ ]` **5.1 Complete verification** — load and follow [`verify-work-unit.md`][verify-work-unit]

---

## Success Criteria

- `[ ]` Resolver returns the correct `(phase, location)` pair and derived enum for every state — including
  parked@Active, park@Planning→`planned`, `nonexistent` (abandoned and never-existed), and the
  directory-trails-meta lag tiebreak — with no `git branch` / `git log` call on the resolution path.
- `[ ]` Membership resolver distinguishes a graduated member from a removed one over a mixed-state cohort (the
  false-orphan regression fixture passes).
- `[ ]` Archival-trigger predicate reports "last member" iff no member remains outside `completed/`.
- `[ ]` Dep-state read answers "is `X` landed?" via slug→state, with no state-blind edge read.
- `[ ]` Exactly one index is built per invocation and both projections read it; no persisted cache.
- `[ ]` Module is pure `lib` with injectable dependencies; exposed predicate set limited to `occupied?` /
  `shipped?` (both pure-local — no network read).
- `[ ]` Resolved predicates are reachable from a probe / status query surface, not render-only.
- `[ ]` All quality gates pass (tests, linting, type checking)
- `[ ]` Ready for integration

[verify-work-unit]: ../system/workflows/arc/work-unit-lifecycle/verify-work-unit.md
