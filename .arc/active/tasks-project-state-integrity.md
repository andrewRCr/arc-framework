# Task List: Project State Integrity

- **Design:** `spec-project-state-integrity.md`

---

## **Phase 1:** Roster identity re-key and input union

_Purpose:_ Rebuild the in-flight derivation's identity model so the roster is keyed on WU identity read from
content (meta presence at a ref; life-phase from the meta record's `State` field), sees the full input set
(remote-tracking refs ∪ local branches with worktrees), dedupes branch candidates per WU with provenance, and
degrades loudly through a warnings channel. Delivers the deterministic roster every consumer inherits.

_Design decisions:_ Identity is content, never branch-name semantics — the branch is location only. The result
contract is fixed here by Task 1.1.a — `{ entries, warnings, reachable }` with per-entry provenance — and
Phase 2's agreed snapshot (Task 2.1) is its one sanctioned extension, so the mutation-window and
consumer-split work lands on a known shape. Roster membership derives from active-meta presence
at a ref, never from a State-value predicate; `State` rides as validated data and each consumer applies its own
filter. Parked is the one scheduling-axis overlay: entries matching the injected parked-slug set (the checkout's
backlog records read through the existing lifecycle classifier — the single `(Active, planned)` read) carry a
`parked` classification, and axis-aware consumers filter on it. This is the WLSM-compatible cut
(`draft-wu-lifecycle-state-model.md`): post-reform, grooming stops
carrying `active/` metas, so Planning entries thin out of the roster with no oracle change — while the
spawn-then-plan escape hatch (a Planning meta in a real worktree) stays correctly visible. Compile-level
consumer adaptation rides each contract-changing task (typecheck stays green per commit); Task 1.5.a is the
per-consumer behavioral audit and warnings pass-through, not the compile fix-up.

### `[x]` **1.1 Content-derived WU identity in the derivation**

- _Goal:_ A branch is a WU iff it carries a meta, and its life-phase is the meta record's `State` — branch
  naming supplies no identity and no phase.

    - `[x]` **1.1.a Result shape and mark taxonomy**
        - `deriveInFlight` now returns `{ entries, warnings, reachable }`, with exported entry-mark,
          warning, and parked-scheduling contract types. `reachable` flows from the existing branch-set
          callers as a first-class fact, warning rendering is stable and structured, and parked entries classify
          via `parkedSlugs` without degradation marks.

    - `[x]` **1.1.b Meta enumeration at a ref**
        - Added `listMetaPathsAtRef`, which enumerates flat `.arc/active/meta-*.md` paths through
          `git ls-tree -r --name-only` and distinguishes empty active dirs from enumeration failure via an
          explicit `ok` bit. The derivation now consumes this primitive instead of synthesizing
          `meta-<branch-leaf>.md`.

    - `[x]` **1.1.c Content-keyed classification**
        - `classifyBranch` now keys WU identity from enumerated meta filenames, reads lifecycle state from
          the meta `State` field, excludes the configured base branch, treats mismatched `Branch` fields as
          stale-location candidates, and emits marked/warned entries for missing `Branch` or unrecognized
          `State`. Multi-meta refs resolve by `Branch` match with stale-shadow warnings.

    - `[x]` **1.1.d Errand identity unchanged**
        - Errand record identity still wins before meta enumeration, including nature-typed branches and a
          branch that also carries a meta; record removal still falls through to the meta-backed WU path.

- _Outcome:_ In-flight derivation no longer mints WU identity or lifecycle phase from branch names: it
  enumerates active metas at each ref, keys entries from meta filenames, reads `State` / `Branch` from content,
  excludes base-branch residue, and surfaces structured warnings/marks for stale or degraded meta facts while
  preserving errand-record identity.

### `[x]` **1.2 Input union: remote-tracking refs plus local worktree branches**

- _Goal:_ An unpushed in-flight WU — a local worktree branch with no remote ref — is visible to the oracle.

- _Outcome:_ `deriveInFlight` now owns input acquisition, unions live/pruned remote refs with local worktree
  branches, reads local-only metas from the local branch ref, and lets the worktree candidate win when the same
  branch appears in both sources. The active/status/materialize/user-view wrappers inject `branch.base` and the
  checkout's lifecycle-derived parked-slug set, so normal oracle consumers inherit local-only and parked facts.

### `[x]` **1.3 Candidate dedupe with provenance**

- _Goal:_ One roster entry per WU no matter how many branches carry it; shadowed or stale candidates surface
  as warnings, never as entries.

    - `[x]` **1.3.a Precedence dedupe**
        - The derivation now groups work-unit candidates by meta slug, selects local worktree content before
          live remote refs before unverified tracking refs, and attaches source/relation/selected provenance to
          the surviving entry. Stale-location candidates cannot win over a location-consistent candidate, and
          shadowed candidates emit structured warnings.

    - `[x]` **1.3.b Offline collapse**
        - Added a named lifecycle State order beside `validateState` and use it only after ancestry cannot
          choose between unverified tracking refs. Offline duplicates collapse by ancestry, then State, newest
          commit, and lexicographic branch name, with the survivor marked and warned as location-ambiguous.

- _Outcome:_ In-flight WU identity is now unique per content-derived slug even when multiple refs carry the
  same meta. The roster preserves the whole candidate set as provenance, warns on every shadowed/stale duplicate,
  and degrades offline duplicate picks through an explicit `location-ambiguous` mark instead of emitting
  competing entries.

### `[x]` **1.4 Warnings channel and loud degradation**

- _Goal:_ Degraded inputs produce marked entries and warnings — never shape-identical healthy-looking facts.

- _Outcome:_ Added a result-bearing worktree branch-map lookup so the oracle can distinguish a successful empty
  roster from a failed `git worktree list`. Worktree-list failures now emit `worktree-list-failed` and mark every
  returned entry degraded, while unreadable or malformed at-ref metas produce degraded WU entries keyed by the
  meta filename with structured warnings instead of disappearing.

### `[x]` **1.5 Consumer adaptation to the re-keyed roster shape**

- _Goal:_ Every oracle consumer compiles against the widened result and passes warnings through, and the
  user view's redundant local-merge seam retires onto the union.

    - `[x]` **1.5.a Per-consumer state-handling audit and warnings pass-through**
        - Materialize surfaces now drop parked, Shipped, and marked WUs; status views render parked as
          `Parked`; active/user/session-init/materialize/errand-check consumers carry oracle warnings through
          their existing structured or string warning channels, while compile-only consumers stay type-clean.

    - `[x]` **1.5.b Retire the user view's parallel local-merge seam**
        - `STATUS.USER` now consumes the unified in-flight oracle directly: local worktree branches enter via
          the derivation union, renamed stale twins collapse to one WU row, and `Integrating` / `unknown`
          states survive projection without the old branch-keyed local override.

- _Outcome:_ Consumer surfaces now honor the widened oracle state/mark contract, and the `STATUS.USER`
  assembler no longer reads or merges a separate worktree roster slice.

## **Phase 2:** Mutation-window discipline and overlap hardening

_Purpose:_ Layer the double-read snapshot discipline over the rebuilt derivation and its fire-time probes, fix
the overlap detector's self-exclusion, and split degraded-state behavior by consumer (advisory hook
skips-with-note; roster and live views tolerate-with-provenance). Ends silent assertion over mid-transition
reads.

### `[x]` **2.1 Double-read snapshot agreement in the derivation**

- _Goal:_ An open mutation window is detected and marked — the derivation never asserts confidently over a
  mid-transition read.

- The ref reader now returns SHA-bearing local snapshots, and the production derivation path double-reads the
  local ref/worktree inputs into a carried `{ refs, worktrees }` snapshot. Key-set changes mark the whole result
  `indeterminate`; same-key ref-tip or worktree-path changes mark the affected entries; meta read failures retry
  once before degrading. Session-init now runs the dead-ref prune before the oracle so it cannot self-trip the
  double-read.

### `[x]` **2.2 Identity-keyed self-exclusion in overlap detection**

- _Goal:_ A WU never reports overlap with itself — including via its own stale duplicate refs — inside or
  outside ceremony windows.

- _Outcome:_ Overlap candidates now carry the roster's content-derived WU name. The detector resolves the
  originating name from the matching worktree entry, excludes every candidate with that name before
  worktree/meta fallback checks, and emits an advisory note when only the fallback path is available; hook and
  errand tests cover stale self-shadows, ceremony-window self-exclusion, fallback notes, and genuine foreign
  overlaps.

### `[x]` **2.3 Fire-time probe snapshot discipline**

- _Goal:_ Overlap probes read immutable or agreement-checked inputs — a sibling ceremony mid-commit cannot
  flip a probe result undetected.

- _Outcome:_ Committed probes now resolve the base ref once and diff pinned SHAs, reusing candidate SHAs from
  the derivation snapshot when available. Sibling-worktree status probes double-read and produce
  `indeterminate` probe records on disagreement instead of overlaps, while agreeing probes still report the
  same matched paths.

### `[x]` **2.4 Per-consumer degraded-state split**

- _Goal:_ Indeterminate state degrades per consumer — the advisory hook skips-with-note; roster and live
  views tolerate-with-provenance.

- _Outcome:_ The overlap detector now preserves entry marks/scheduling, skips indeterminate and
  location-ambiguous candidates with advisory notes, ignores parked candidates, and reports indeterminate probes
  as caveats instead of overlaps. CHECK 19's hook copy now frames stdout neutrally, and `arc errand check`
  renders caveat lines interactively while preserving skipped-entry mark fields in `--json`.

## **Phase 3:** Concurrency repro harness

_Purpose:_ The falsifiable acceptance for the oracle work: a harness racing derivation against a scripted
`arc start` reshuffle, asserting stable warning-marked output; pins the wave-1 phantom-overlap mechanism and
fixture-izes the standing live repro topology.

### `[x]` **3.1 Scripted-reshuffle harness fixture**

- _Goal:_ The churn topologies the oracle must stay stable under — including the standing stale-`plan/`
  repro — exist as deterministic integration fixtures.

    - `[x]` **3.1.a Reshuffle fixture infrastructure**
        - Added an integration helper that builds a bare-origin plus same-machine sibling-worktree topology,
          exposes `makeGitExec`-bound executors, and scripts git-level worktree spawn, local branch rename,
          remote delete/recreate, and push steps.
        - The helper's exec wrapper can fire a scripted step at a selected git-call boundary; the smoke
          integration case proves a boundary-fired worktree spawn trips the derivation's indeterminate
          snapshot warning.

    - `[x]` **3.1.b Standing-repro topology fixture**
        - Added a fixture-backed stale-`plan/` topology with a checked-out renamed `chore/` worktree. The
          integration assertion verifies the oracle reports the local worktree entry and materialize sees no
          remote-only candidate for the stale branch.

- _Outcome:_ The live repro topology is now reproducible in temp git fixtures, and the notes file releases the
  preserved `plan/burn-in-probe-a` branch from its special "do not prune" hold.

### `[x]` **3.2 Pin the wave-1 phantom-overlap mechanism**

- _Goal:_ The wave-1 phantom-overlap mechanism is identified and pinned by a regression case, not guessed.

- The notes file now records the failure-vector inventory and pinned mechanism: a stale remote `plan/` twin
  plus invisible unpushed local rename could evade self-exclusion during ceremony windows and surface the
  originating meta diff as a foreign overlap.
- Added an integration regression that routes the fixture-backed topology through `detectForeignArtifactOverlap`
  with originating metadata unavailable and asserts no overlap, skipped entry, or indeterminate probe.

### `[x]` **3.3 Determinism acceptance assertions**

- _Goal:_ Derivation racing the scripted reshuffle yields stable, warning-marked output — the WU's
  determinism acceptance (SC 1).

- Added deterministic integration assertions for calm local worktree reads, remote-ref key churn, worktree
  key churn, and offline duplicate-ref collapse under a changed ref tip. Churned reads now assert stable
  first-snapshot entries plus explicit indeterminate/location-ambiguous marks, never late phantom entries.
- The acceptance harness exposed a raw local-ref comparison gap in online derivation: a late remote-tracking ref
  pruned by the first live-membership read was silently ignored. The derivation now compares raw local ref
  snapshots in addition to the selected branch/worktree snapshot, with a unit regression pinning that behavior.

## **Phase 4:** Pure composer and lifecycle-backed dependency resolution

_Purpose:_ Rework the readiness composer into a pure function over an injected slug-keyed record set
(active-meta-at-a-known-ref > backlog stub > completed index) with an injectable sink; move dependency
satisfaction onto the lifecycle index (dangling edges warn); add the readiness-provider socket with the
deps-only provider; retire the title read-back.

_Note:_ Run the full-depth `task-audit` over this phase at implementation entry. Generation may sit several
sessions behind this phase's start, and the composer's cross-cutting contracts — identity scope, the record
union, the lifecycle classification and its two consumers (`project-view`, `ready-mine-source`) — are dense
seams; reground them against the codebase as it exists then.

### `[x]` **4.1 Composer input model: injected slug-keyed record union**

- _Goal:_ The composer is a pure function over resolved records — no disk scans, no raw markdown globs, no
  assumption that readiness is a field parsed out of `meta-*`.

    - `[x]` **4.1.a Record-set type and precedence merge**
        - Added the exported project-readiness candidate/record/source types and a slug-keyed merge with
          deterministic precedence: active meta > planned stub > provisional stub > completed record.
          Merged records preserve all source provenance and keep project scope identity-unfiltered.
        - Parking is now an explicit scheduling overlay on merged records: a planned `Active` pointer keeps a
          slug out of In Flight while active-meta fields still supply row values.

    - `[x]` **4.1.b Composer purification**
        - `composeProjectReadinessView` now renders from injected records only. The disk scan and current H1
          read moved into `resolveProjectReadinessViewInput`, and both ROADMAP regen call sites resolve input
          before invoking the pure composer.
        - Existing project-view tests now exercise the resolver separately from the injected-record composer.

- _Outcome:_ The project readiness composer is filesystem-free over a resolved record set while the tree-backed
  resolver preserves today's render behavior for lifecycle ceremony callers.

### `[x]` **4.2 Dependency resolution via the lifecycle primitive**

- _Goal:_ Dependency satisfaction classifies through the lifecycle index — a dangling edge warns instead of
  silently reading as satisfied.

- _Outcome:_ Dependency satisfaction now flows through a lifecycle index built from resolved project records:
  completed records satisfy, pending / parked / at-ref active records block, and dangling targets warn in the
  rendered project view instead of silently reading ready. The user ready slice uses the same lifecycle predicates
  over its local disk-built index, so typo edges no longer qualify as Ready there either.

### `[x]` **4.3 Readiness-provider socket with deps-only provider**

- _Goal:_ Readiness arrives through a provider interface computed independently of dependency satisfaction —
  WLSM's coming axis lands as a new provider, with no composer-logic change.

- _Outcome:_ The project-readiness composer now accepts a batch readiness provider (`records` in, per-slug verdicts
  out), exposes dependency satisfaction and readiness as separate result facts, and keeps the default deps-only
  provider behavior-identical to the prior collapse. Tier membership now composes both facts without storing any
  new `State` value.

### `[x]` **4.4 Retire the title read-back**

- _Goal:_ No consumer reads `ROADMAP.md` back as data (terminal-render invariant).

- _Outcome:_ `resolveProjectReadinessViewInput` now resolves the project-readiness title from the supplied render
  input or the renderer default only. The former H1 preservation path no longer reads `ROADMAP.md`; remaining
  source references are writes, staging paths, or templates.

## **Phase 5:** Two render surfaces

_Purpose:_ Wire the composer into its two consumers: the tracked `ROADMAP.md` render (tree plus local refs,
gaining the in-flight supersede tier, stamped with rendered-against SHA and scope) at the existing ceremony
triggers, and the live network-verified CLI view computed fresh per call.

_Note:_ Run the full-depth `task-audit` over this phase at implementation entry — reground the two-surface
wiring (both regen call sites, the status-handler mode dispatch, the identity-unfiltered project scope)
against the codebase as it exists then; Phase 4's landed shapes are this phase's inputs.

### `[x]` **5.1 Tracked render: local-refs input and in-flight supersede tier**

- _Goal:_ A `main`-checkout render is checkout-deterministic over tree plus local refs and shows in-flight
  WUs as in flight — no false `Ready` facts from stale backlog stubs (SC 2).

    - _Outcome:_ The project-readiness resolver now merges tree records with the oracle's local-only slice,
      adapting valid work-unit entries into active candidates, preserving parked scheduling, and surfacing
      oracle degradation warnings. ROADMAP regen call sites now feed parked slugs and configured base branch,
      and the shared render stamp records the source scope plus the live `arc status --project` pointer.

### `[x]` **5.2 Live view CLI surface**

- _Goal:_ Live truth on demand — the network-verified, oracle-composed project view computed fresh per call,
  never committed.

    - _Outcome:_ `arc status --project` now joins the mutually-exclusive status modes and renders the shared
      project-readiness composer from the identity-unfiltered live oracle by default. `--local` / `--no-fetch`
      force the local-ref path, unreachable remotes emit an inline refs-only warning, and integration coverage
      proves a `main` checkout sees an active meta that exists only on a pushed branch ref.

### `[x]` **5.3 Regen-trigger verification and `renderedRef` consolidation**

- _Goal:_ Ceremony regen fires the new render unchanged — same-commit, deterministic per checkout, with no
  per-site render plumbing left behind.

    - _Outcome:_ Project-readiness stamps now resolve through the shared composer module, so lifecycle,
      start-ceremony, and live status renders share one short-HEAD fallback and stamp shape. Park@Active
      integration coverage now compares the lifecycle-regenerated `ROADMAP.md` byte-for-byte with a direct
      resolver+composer render of the same checkout.

## **Phase 6:** Regenerate-wins pre-commit assert

_Purpose:_ Enforce the never-hand-merged conflict rule: when `ROADMAP.md` is staged, re-render from sources and
exact-compare; reject on mismatch or surviving conflict markers, with the compare degrading to warn-and-allow on
an indeterminate snapshot (the conflict-marker reject stays unconditional).

### `[x]` **6.1 The assert: re-render exact-compare and conflict-marker scan**

- _Goal:_ A staged `ROADMAP.md` that hand-diverges from a source re-render — or carries conflict markers — is
  rejected before commit; a mismatch on an indeterminate snapshot degrades to warn-and-allow.

- _Outcome:_ Added the ROADMAP regeneration assert core, including conflict-marker precedence, exact
  staged-vs-rendered comparison, indeterminate warn-and-allow behavior, and an index-backed project-view
  filesystem so dirty worktree meta files cannot affect the verdict. The project-view resolver now carries the
  oracle's indeterminate signal for hook consumers.

### `[x]` **6.2 Hook wiring and hook-level tests**

- _Goal:_ The assert runs as a blockable pre-commit check scoped to staged `ROADMAP.md` changes, wired like
  the existing staged-path checks.

- _Outcome:_ Added the blockable `assert-roadmap-regenerated.ts` pre-commit entry point and wired it into both
  pre-commit hook copies as the new CHECK 19. The shell contract now rejects determinate mismatch/markers,
  warns on indeterminate mismatch, passes silently on clean staged content, and documents that GitHub-side
  conflict resolution is outside the local-hook boundary.

## **Phase 7:** Verification

### `[ ]` **7.1 Complete verification** — load and follow `verify-work-unit.md`

---

## Success Criteria

- `[ ]` The concurrency harness passes: derivation racing a scripted `arc start` reshuffle produces stable,
  warning-marked output
- `[ ]` Both standing false facts resolve: a stale `plan/<name>` ref mints no phantom remote-only WU, and an
  unpushed in-flight worktree is visible to the oracle
- `[ ]` A `main`-checkout render shows in-flight WUs as in flight (supersede tier) and parked WUs as parked
  (per-axis precedence), asserting no false `Ready` facts from stale backlog stubs
- `[ ]` Dangling dependency edges surface through the warnings channel instead of rendering satisfied
- `[ ]` A manufactured `ROADMAP.md` conflict resolves by re-render; the pre-commit assert rejects a staged
  hand-edit and surviving conflict markers
- `[ ]` No consumer reads `ROADMAP.md` back as data
- `[ ]` All quality gates pass (tests, linting, type checking)
- `[ ]` Ready for integration
