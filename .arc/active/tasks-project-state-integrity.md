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

### `[ ]` **3.2 Pin the wave-1 phantom-overlap mechanism**

- _Goal:_ The wave-1 phantom-overlap mechanism is identified and pinned by a regression case, not guessed.
- _Note:_ If the pinned mechanism implicates a vector the Phase 1–2 design doesn't address, it routes
  through spec-propagation (or the re-entry valve for genuinely new design) — never a patch local to the
  harness.
- **Additional Context:** `notes-project-state-integrity.md` § Live repro evidence

    - Author the failure-vector inventory in `notes-project-state-integrity.md` first — enumerating the
      spec's § A mutation classes (ref churn, worktree churn, sibling mid-commit writes, stale refs,
      unpushed branches) crossed with Task 3.1.a's reshuffle-step catalog — then drive harness permutations
      over it until the phantom overlap reproduces; document the pinned mechanism there; land the
      reproducing topology as a named regression assertion.

### `[ ]` **3.3 Determinism acceptance assertions**

- _Goal:_ Derivation racing the scripted reshuffle yields stable, warning-marked output — the WU's
  determinism acceptance (SC 1).

    - Deterministic interleaving acceptance: the exec-wrapper injection point (Task 3.1.a) fires each
      reshuffle step at a chosen git-call boundary — including exactly between a double-read's two reads —
      so every mutation window is reproducible by construction; assert the entry set stays stable or
      degrades to marked-indeterminate — never a phantom entry, never a silent flip.
    - Assert warning-marked degradation shapes match the Phase 1/2 contract per churn step, and quiescent
      derivations between churn steps come back clean (stable means clean when calm, marked when churning).
    - Include an offline (`localOnly`) churn permutation exercising the content-dedupe collapse under
      mutation.
    - An optional wall-clock stress loop may ride as non-gating; the interleaving assertions are the
      acceptance.

## **Phase 4:** Pure composer and lifecycle-backed dependency resolution

_Purpose:_ Rework the readiness composer into a pure function over an injected slug-keyed record set
(active-meta-at-a-known-ref > backlog stub > completed index) with an injectable sink; move dependency
satisfaction onto the lifecycle index (dangling edges warn); add the readiness-provider socket with the
deps-only provider; retire the title read-back.

_Note:_ Run the full-depth `task-audit` over this phase at implementation entry. Generation may sit several
sessions behind this phase's start, and the composer's cross-cutting contracts — identity scope, the record
union, the lifecycle classification and its two consumers (`project-view`, `ready-mine-source`) — are dense
seams; reground them against the codebase as it exists then.

### `[ ]` **4.1 Composer input model: injected slug-keyed record union**

- _Goal:_ The composer is a pure function over resolved records — no disk scans, no raw markdown globs, no
  assumption that readiness is a field parsed out of `meta-*`.

    - `[ ]` **4.1.a Record-set type and precedence merge**
        - Slug-keyed union type with source precedence active-meta-at-a-known-ref > backlog stub > completed
          index; each record carries its source provenance (feeds the supersede tier and dep resolution).
        - The union's oracle slice is identity-unfiltered (spec § B): project surfaces render every owner's
          in-flight WUs — `keepForIdentity` scoping stays a user-view concern, never applied in the
          record-set assembly.
        - Precedence is per-axis for parked slugs (spec § B): a backlog record deriving `parked` (via the
          same canonical `(phase, location)` map) is authoritative for scheduling-tier membership — the
          In Flight supersede applies only to non-parked slugs — while the at-ref active meta still supplies
          the union record's row fields when present.
        - One unified record shape reconciles the composer's current row fields (slug, location, state,
          owner, priority, dependsOn, cohort) with the oracle's in-flight facts — oracle entries project
          into it, so a superseded stub's In Flight row renders owner / priority / cohort from the at-ref
          meta.
        - Build `test-first` (one behavior at a time):
            - An at-ref active meta supersedes the same slug's backlog stub
            - A superseded slug's record carries the at-ref meta's fields, not the stub's
            - A backlog-only slug resolves from its stub
            - A parked slug (pointer record + at-ref `Active` meta) resolves to the Parked tier, never
              In Flight, with row fields from the at-ref meta
            - In team mode, another identity's at-ref active meta still enters the union and supersedes its
              stub (no identity filter on project surfaces)
            - Precedence is total and deterministic for any source combination

    - `[ ]` **4.1.b Composer purification**
        - `composeProjectReadinessView` (`src/lib/status/project-view.ts`) takes the injected record set;
          `loadProjectMetas` / `collectMetaFiles` move out to a resolver layer that assembles the set; the
          write sink stays injected (`readiness-regen` seam).
        - Green-commit staging: this task's resolver reproduces today's tree-only inputs
          (behavior-identical render); the local-refs slice and supersede tier arrive in Task 5.1. The
          `resolveTitle` read-back relocates into the resolver here (so the compose path is fs-free) and is
          deleted by Task 4.4.
        - Both regen call sites (`src/lib/work-unit/executor-context.ts` ~263, `src/handlers/start.ts`
          ~579) adapt mechanically to the new signature here; Task 5.3 verifies the enriched flow.
        - Existing `project-view` unit tests move onto injected records (no fs seam in the compose path).

### `[ ]` **4.2 Dependency resolution via the lifecycle primitive**

- _Goal:_ Dependency satisfaction classifies through the lifecycle index — a dangling edge warns instead of
  silently reading as satisfied.

- **Additional Context:** `notes-project-state-integrity.md` § Implementation loci (filesystem-free index
  construction)

    - Build the index from the same injected slug-keyed union — including active-metas-at-known-refs and
      the completed records — never a fresh disk scan. `buildLifecycleIndexFromMetas`
      (`src/lib/work-unit/lifecycle-index.ts` ~231) takes raw `{ path, content }`, which the union's
      resolved records don't carry: add a record-fed builder beside it that constructs entries from
      resolved fields (slug, state, location, dependsOn, cohort) through the same canonical
      `(phase, location)` map — records never re-carry raw meta text. Completed metas must ride the union:
      an index fed only active + backlog would classify every shipped dep `nonexistent` and warn falsely.
    - Classification through the canonical predicates (`resolveSlugQuery`,
      `src/lib/work-unit/lifecycle-query.ts`; `deriveState` / `isShipped`,
      `src/lib/work-unit/lifecycle-resolver.ts`): `nonexistent` → dangling (composer warnings channel),
      `shipped` → satisfied, pending → blocks. The pending-set-absence rule in `project-view.ts`
      (`pendingNames`) is retired.
    - Composer gains a warnings output rendered into the view header and the live view — no standalone
      `--check` command. Composer warnings (dep-edge domain) are a distinct list from the oracle's
      derivation warnings; the render layer merges the two.
    - The composer elevates the derivation's sole-stale-location provenance codes against the same index:
      quiet when the slug resolves `shipped`, a visible warning otherwise — a live WU with a drifted
      `Branch` field must not silently read `Ready` on `main`.
    - The same predicates retire the second pending-set-absence copy: `src/lib/status/ready-mine-source.ts`
      (`pendingNames` over `PIPELINE_ROOTS`) resolves dep satisfaction by pipeline absence for the user
      view's Ready slice. Its dep read moves onto the lifecycle classification (`nonexistent` / dangling
      does not satisfy; `shipped` satisfies; pending blocks); the slice's index may stay disk-built (a
      local, always-available surface), but classification goes through the same canonical predicates. New
      dangling-edge chrome in `STATUS.USER` stays `roadmap-tooling`'s.
    - Build `test-first` (one behavior at a time):
        - A typo'd / renamed dep target warns as dangling and does not satisfy
        - A dep on a completed WU resolves satisfied from the union's completed records
        - A sole-stale-location provenance code stays quiet for a shipped slug and warns for an unshipped one
        - A pending dep blocks
        - A dep on a parked WU blocks (parked classifies pending, never satisfied)
        - On a `main`-checkout record set, an in-flight WU's dep edge classifies pending via its at-ref
          active meta even absent its backlog stub
        - The ready slice no longer renders a WU Ready on a typo'd dep edge (pipeline absence stops
          satisfying)

### `[ ]` **4.3 Readiness-provider socket with deps-only provider**

- _Goal:_ Readiness arrives through a provider interface computed independently of dependency satisfaction —
  WLSM's coming axis lands as a new provider, with no composer-logic change.

    - Provider interface + the deps-only implementation (returns dependency-satisfaction); the composer
      computes dependency-satisfaction and readiness independently and hands both to the render layer
      (decomposed tier predicate); today's render collapses them to deps-only.
    - Provider contract: the record set in, per-slug readiness verdicts out — the batch shape a future
      attestation-backed provider needs.
    - Stored-`State` enum untouched; derived displays stay projection-time compositions
      (resolve-don't-store).
    - Build `test-first` (one behavior at a time):
        - Composer output carries deps-satisfaction and readiness as independent facts
        - Swapping the provider changes readiness without touching dep resolution
        - Default render is behavior-identical to deps-only collapse

### `[ ]` **4.4 Retire the title read-back**

- _Goal:_ No consumer reads `ROADMAP.md` back as data (terminal-render invariant).

    - The render layer supplies the title (constant / config); delete `resolveTitle`'s H1 read-back
      (`project-view.ts` ~159–168) — the only `ROADMAP.md` data read-back in `src/`.

## **Phase 5:** Two render surfaces

_Purpose:_ Wire the composer into its two consumers: the tracked `ROADMAP.md` render (tree plus local refs,
gaining the in-flight supersede tier, stamped with rendered-against SHA and scope) at the existing ceremony
triggers, and the live network-verified CLI view computed fresh per call.

_Note:_ Run the full-depth `task-audit` over this phase at implementation entry — reground the two-surface
wiring (both regen call sites, the status-handler mode dispatch, the identity-unfiltered project scope)
against the codebase as it exists then; Phase 4's landed shapes are this phase's inputs.

### `[ ]` **5.1 Tracked render: local-refs input and in-flight supersede tier**

- _Goal:_ A `main`-checkout render is checkout-deterministic over tree plus local refs and shows in-flight
  WUs as in flight — no false `Ready` facts from stale backlog stubs (SC 2).

    - Record-set assembly for the tracked surface: tree scan plus local refs carrying active metas
      (worktrees + remote-tracking refs; local data, no network) through the oracle's local slice — the
      resolver from Task 4.1.b, extended here.
    - The In Flight tier populates from at-ref active metas on any checkout; superseded stubs leave `Ready`.
    - Header stamp: the existing `renderedRef` param extends with scope, where scope names the source set
      fed to the render ("tree + local refs"), plus the pointer at the live view; the committed artifact
      reads as scoped truth (a cache by construction).
    - Determinism: byte-stability rides the render core's total sort (`compareStatusRows`,
      `src/lib/status/render.ts` — priority, cohort, wu-name), so the union needs deterministic membership,
      not pre-sorted order.
    - Build `test-first` (one behavior at a time):
        - A `main`-checkout record set renders in-flight WUs In Flight, not Ready
        - A checkout carrying a park pointer record renders that WU Parked, never In Flight
        - Same checkout, same refs → byte-identical render (determinism)
        - A degraded oracle slice renders with its degradation qualifier — never a silently healthy-looking
          tree-only render
        - Header carries the rendered-against stamp, scope, and live-view pointer

### `[ ]` **5.2 Live view CLI surface**

- _Goal:_ Live truth on demand — the network-verified, oracle-composed project view computed fresh per call,
  never committed.

    - `arc status --project`: joins the mutually-exclusive mode dispatch in `src/handlers/status.ts`
      (alongside `<slug>` / `--session-init` / `--user`), mirroring `--user`'s mode-dispatch wiring only —
      the project view consumes the identity-unfiltered slice, unlike `--user`'s identity-scoped one;
      renders composer warnings (dangling edges, degraded marks) inline.
    - Network by default; the oracle's `reachable: false` degrades to a noted refs-only view, matching
      `runActiveInFlight`'s existing contract.
    - Integration test: live view reflects a ref-only change with no commit — the consumption-relocation
      property.

### `[ ]` **5.3 Regen-trigger verification and `renderedRef` consolidation**

- _Goal:_ Ceremony regen fires the new render unchanged — same-commit, deterministic per checkout, with no
  per-site render plumbing left behind.

    - Both regen call sites — the lifecycle side-effect binding (`src/lib/work-unit/executor-context.ts`
      ~263, via `reconcileRoadmap`) and the start ceremony's `refreshRoadmapForStartCeremony`
      (`src/handlers/start.ts` ~579, which bypasses `reconcileRoadmap`) — consume the shared resolver; Task
      4.1.b already adapted them mechanically, so this task verifies the enriched record set flows to both
      and removes any residual inline fs seams.
    - Consolidate the two divergent rendered-ref computations (`renderedRef()` in `executor-context`,
      `startRenderedRef` in `start.ts`) into the resolver's stamp.
    - Integration coverage at one lifecycle-transition edge: the regenerated file matches a direct
      resolver+composer render of the same checkout.

## **Phase 6:** Regenerate-wins pre-commit assert

_Purpose:_ Enforce the never-hand-merged conflict rule: when `ROADMAP.md` is staged, re-render from sources and
exact-compare; reject on mismatch or surviving conflict markers, with the compare degrading to warn-and-allow on
an indeterminate snapshot (the conflict-marker reject stays unconditional).

### `[ ]` **6.1 The assert: re-render exact-compare and conflict-marker scan**

- _Goal:_ A staged `ROADMAP.md` that hand-diverges from a source re-render — or carries conflict markers — is
  rejected before commit; a mismatch on an indeterminate snapshot degrades to warn-and-allow.

- **Additional Context:** `notes-project-state-integrity.md` § Rationale detail (hook assert vs merge driver)

    - Pure check core: staged content + re-render result (with its determinacy marks) → verdict:
      reject-mismatch / reject-markers / warn-and-allow / pass.
    - Both compare sides are index-pinned: the staged blob (`git show :.arc/backlog/ROADMAP.md`) on one
      side, and a re-render whose tree-side inputs read from the staged index (`git show :<path>` per meta /
      backlog source) on the other — the assert certifies the commit being made, so neither a dirty worktree
      ROADMAP nor an unstaged dirty meta may flip the verdict. Local-refs inputs are index-independent and
      read as usual.
    - The conflict-marker reject is unconditional (static scan of staged content — hand-merge evidence
      regardless of roster state); the exact-compare consumes the determinacy marks of the hook's own fresh
      re-render run (its resolver's double-read) and degrades to warn-and-allow with a re-run instruction
      when that snapshot is indeterminate.
    - Reject messages carry the re-render instruction (regenerate-wins corrects any slip-through at the next
      determinate regen).
    - Build `test-first` (one behavior at a time):
        - Staged hand-edit vs determinate re-render → reject with re-render instruction
        - Surviving conflict markers → reject, even on an indeterminate snapshot
        - Indeterminate-snapshot mismatch → warn-and-allow with re-run instruction
        - An unstaged dirty meta does not affect the verdict (index-side re-render)
        - Byte-identical staged content → pass

### `[ ]` **6.2 Hook wiring and hook-level tests**

- _Goal:_ The assert runs as a blockable pre-commit check scoped to staged `ROADMAP.md` changes, wired like
  the existing staged-path checks.

    - Script entry under `src/scripts/` following the blockable `validate-cohort-consistency.ts` pattern
      (CHECK 18's error-increment wrapper), not the advisory fail-open shape; fires only when `ROADMAP.md`
      is staged.
    - Three-way shell contract: exit nonzero → error (reject); exit 0 with output → warning
      (warn-and-allow); exit 0 silent → pass.
    - New numbered check in the shipped pre-commit chain, complementary to CHECK 17 (which stays as the
      render-fields-changed-without-regen nudge; instruction texts agree on the same re-render command);
      document the GitHub-side merge bound (no local hook fires there; conflict resolution falls to a local
      commit, where it does).
    - Two-copy discipline: hook edits land in the package source
      (`packages/arc-framework/arc/system/.internal/githooks/pre-commit`) and sync to the `.arc/` copy.
    - Hook-level tests under `__tests__/unit/scripts/`: staged-mismatch rejection, conflict-marker
      rejection, clean pass-through, indeterminate degrade (spec § Testing).

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
