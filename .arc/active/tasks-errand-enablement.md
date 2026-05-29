# Task List: Errand Enablement

- **Design:** `spec-errand-enablement.md`

---

## **Phase 1:** Errand routing doctrine — decision matrix + commitment boundary

_Purpose:_ Establish the conceptual spine the rest of the WU references — the Errand decision matrix and the
commitment-based capture boundary — in adopter-facing doctrine surfaces, before any code reads against them.

_Design decisions:_

- Both edited files (`strategy-work-organization.md`, `DEV-RULES.ARC.md`) are Framework files under the two-copy
  architecture — edit package source (`packages/arc-framework/arc/...`) and sync to `.arc/`; never `cp`.

- Adopter-facing register throughout (neutral framing, no internal-roadmap forward-pointers); the cohort
  path-taxonomy table is retired to an in-session-fork _summary_ while the full matrix lives in the strategy doc.

- Terminology: "base branch" / "primary worktree" — never bare "main" (cohort-wide doc sweep is CWC's, not this WU's).

### `[x]` **1.1 Author the Errand decision matrix in `strategy-work-organization.md` § Errand Work Class**

- _Goal:_ § Errand Work Class carries a complete, self-contained decision matrix (create/maintain ×
  self-contained/cross-cutting × in-flight routing) that outlives the ephemeral cohort doc and gives CWC a clean
  extension seam.

    - `[x]` **1.1.a Add the decision-matrix subsection to § Errand Work Class**

        - Replaced § Threshold with § Decision matrix: a 2×2 (create/maintain × self-contained/cross-cutting)
          whose maintain × cross-cutting cell carries the in-flight advisory-gate routing. Folded the threshold
          test + create/maintain prose in without duplication, cross-referenced the commitment boundary
          (DEV-RULES.ARC § Leave it cleaner), and shifted the section's "main worktree" → "primary worktree".
          Authored in package source, synced identically to `.arc/`.

    - `[x]` **1.1.b Add a defer-to-matrix pointer to the cohort path-taxonomy table**

        - Added a pointer-only note at the in-session-fork table naming § Errand Work Class as the full-matrix
          home; table rows and the `errand-launch` label left untouched (single internal-dev copy, no sync).

- _Outcome:_ The three surfaces cohere with no duplicated matrix — the strategy doc is the durable home, the
  cohort table defers to it, and the two axes are split as distinct decisions: create/maintain selects WU vs.
  Errand; self-contained/cross-cutting selects how an Errand routes once it is one.

### `[x]` **1.2 Re-cut the DEV-RULES.ARC § "Leave it cleaner" routing table on the commitment axis**

- _Goal:_ The "Leave it cleaner" routing table is keyed on commitment ("Am I committing to do this myself,
  soon?") primary × character (atomic vs. multi-step) secondary, so every discovered item has one obvious home:
  committed+atomic → errand (or fold into the commit); committed+multi-step → task structure / WU; not-committed
  → `USER-INBOX` (§ Atomic / § Backlog by character).

    - `[x]` **1.2.a Re-cut the routing table on commitment (primary) × character (secondary)** (both copies of
      `DEV-RULES.ARC.md`)

    - `[x]` **1.2.b Wire the boundary↔matrix sequencing** — the boundary table is the precondition (is this an
      errand at all?), the § Errand Work Class matrix is the path-selector (how to route it once committed);
      cross-reference both directions so they read as one sequenced model

- _Outcome:_ § Leave it cleaner now routes on commitment (primary) × character (secondary); the old
  during-WU-vs-later framing is retired, inline-fix kept as an issue-triage sub-case, and other-mode capture
  folded into prose. With 1.1's matrix→boundary link, the new boundary→matrix link (and a `[work-org]`
  reference) close the sequenced model — boundary as precondition (errand-at-all?), matrix as path-selector
  (how to route once committed).

## **Phase 2:** Errand queue substrate (`ERRANDS.md`) + cross-WU convergence

_Purpose:_ Ship the user-scoped errand queue as an interim markdown-canonical surface that converges via the
existing cross-WU notes entry-merge, with a staleness advisory so the queue cannot silently rot.

_Design decisions:_

- Interim markdown-canonical, mirroring `USER-INBOX` ("agent-maintained with merge"); the structured-record/CLI
  substrate is `operational-state-docs`' later migration — do not build ahead of it.

- A flat file at `user/{identity}/ERRANDS.md` auto-classifies as cross-WU; load/save/push/pull need no change —
  the new work is the `errands` parser shape + template/seeding + the sweep.

- Staleness threshold lands in `arc-config.yml` today (config-storage-architecture's per-user `config.user.yml`
  substrate is unbuilt); register the per-user migration as coordination input. Conceptually a per-user
  preference, given errands are per-user.

### `[x]` **2.1 Define the `ERRANDS.md` template, entry schema, and seeding**

- _Goal:_ A fresh install seeds `user/{identity}/ERRANDS.md` — h1 "Errand Queue", an italic `>`-callout preamble,
  a single `## Queue` section, and a `---` EOF marker (mirroring the sibling user-scoped surfaces). Entries use the
  **managed-entry grammar** (the task-list parent-task shape minus numbered IDs): an `###` heading carrying a
  `[ ]` checkbox and a bold `<slug>` whose text is the dedup/tombstone key and the `chore/<slug>` branch name —
  bold, not backticked (the heading is a structural key slot; backticks are reserved for the slug in prose) —
  followed by Goal-first
  italic-descriptor bullets: `_Goal:_` then `_Pointers:_` · optional `_Caveat:_` · `_Branch:_` · `_Created:_` (the
  staleness age source) — prose fields first, the short key/value fields (Branch, Created) closing the group. No
  `State` field (State means lifecycle means WU). The `[ ]` checkbox is holding-ground —
  never checked in place; entries drain by removal on ship.

- **Strategies:** strategy-package-project-sync.md

    - `[x]` **2.1.a Author the `ERRANDS.md` template** — authored `packages/arc-framework/templates/user/ERRANDS.md`:
      h1 "Errand Queue" + italic `>`-callout preamble (drain-by-removal + staleness, pointing at
      `strategy-work-organization.md` § Errand Work Class) + empty `## Queue` + `---` EOF. The managed-entry
      grammar lives in a `<!-- -->` shape comment — backtick-wrapped `` `[ ]` `` checkbox + bold `<slug>`,
      bullets `_Goal:_` / `_Pointers:_` / optional `_Caveat:_` / `_Branch:_` / `_Created:_` (prose fields, then the
      short key/value fields close the group); no `State` field, no standing skills/quality-gate fields.
      Package-only infra (read at runtime via the internal
      templates dir) — no `.arc/` two-copy counterpart.

    - `[x]` **2.1.b Seed `ERRANDS.md` at install** — added `ERRANDS.md` to the per-user seeding loops in both
      `runPostInitSetup()` (`arc init` / `arc join`) and `runUserAdd()` (`arc user add`), keeping the cross-WU
      file set coherent across every entry path.

        - Coverage across all three paths: unit (`init`/`join` stubs), integration (byte-for-byte seed), and e2e
          (fresh install + team-member add both seed `ERRANDS.md`)

- _Outcome:_ The literal task named only `runPostInitSetup()`, but `arc user add` seeds the same per-user set via a
  parallel `runUserAdd()` loop; wiring `ERRANDS.md` into both (plus their JSDoc) avoids a latent gap where
  team-member directories would lack an errand queue. The `## Queue` H2 + H3 bold-slug identity are the hooks the
  cross-WU entry-merge keys on next (Task 2.2); the `_Created:_` date is the staleness sweep's age source (Task 2.3).

### `[x]` **2.2 Register the `errands` cross-WU shape in the notes entry-merge**

- _Goal:_ `ERRANDS.md` entries converge across worktrees and machines through the existing entry-merge —
  per-entry list-union with deletion tombstones — with no change to the load/save/push/pull orchestrators.

- **Strategies:** strategy-testing-methodology.md

- _Outcome:_ Three edit points in `lib/user-sync/`: `errands` registered in `shapeForFile`, added to the
  `CrossWuShape` union, and `parseCrossWuEntries` extended from a ternary to a 3-way for a new `parseErrands`
  (keyed on the H3 bold slug under `## Queue`, optional checkbox before the bold; emits `(section, key, raw)`
  like its siblings). It is the first notes-layer parser for the H3 grammar — modeled on `parseWorkingMemory`'s
  boundary-flush, not copied from the flat-bullet inbox parser. The classifier and the shape-driven merge were
  untouched as predicted, so list-union, divergent most-recent-wins, and tombstone suppress/GC came for free
  (proven by `mergeCrossWuFile` tests over a recency-ordered note window — which _is_ the cross-worktree
  convergence case). The full save → push → pull round-trip stays generically covered for cross-WU files in
  the e2e portability test (transport is shape-agnostic); no `ERRANDS`-specific CLI e2e was added, since it
  would re-prove transport rather than convergence.

### `[x]` **2.3 Staleness sweep advisory (sibling of the stale-worktree sweep)**

- _Goal:_ Errand-queue entries older than a configurable threshold (default 3 days) surface an advisory in
  session-init orientation — execute, or demote to the inbox — so the queue can't silently rot.

- **Strategies:** strategy-testing-methodology.md

    - `[x]` **2.3.a Compute the staleness sweep** — added `lib/session-init/errand-staleness-sweep.ts`: a pure
      `runErrandStalenessSweep` that reuses the `errands` parser and ages each entry's `_Created:_` against the
      threshold (entries strictly older are flagged; undated/unparseable entries skip). Registered
      `errands.staleness_days` (default `3`) across `ConfigSettings` + reader defaults + both `arc-config.yml`
      copies + `validate-config.sh` known-keys, and wired an identity-gated `errandSweep` slot onto the
      session-init probe envelope — a sibling of `retiredSubdirs` (eager, identity-gated), not worktree-gated.
      The `ConfigSettings` addition rippled into eight test fixtures (`typecheck:test` gate); all updated.

    - `[x]` **2.3.b Surface the advisory in `session-init.md` Step 6 orientation** (+ package mirror) — added a
      `**Stale errands:**` execute-or-demote block to Step 6's conditional sections (keyed on
      `errandSweep.value.stale`) and an `errandSweep` row to the Step 1 envelope table, in both the rendered
      `session-init.md` and its `session-init.template.md` source.

- _Outcome:_ The errand queue now self-polices: entries pending past `errands.staleness_days` surface a
  session-init advisory to execute or demote, so the queue can't silently rot. The sweep is a role-sibling of the
  stale-worktree sweep (envelope slot → Step 6 line) sharing no mechanics — it reuses the `errands` parser and
  ages `_Created:_`, identity-gated rather than worktree-gated.

## **Phase 3:** `arc-errand` primitive + advisory foreign-artifact gate

_Purpose:_ Ship the single-invocation Errand launch — a thin skill over a small CLI helper — that classifies,
runs the advisory gate, writes a queue entry, and returns to the originating session with zero git mutation.

_Design decisions:_

- Mirrors the `spawn` / `cold-start` shared-primitive shape: thin skill → CLI handler → testable orchestrator.
  CLI command is `arc errand` — a sibling entry verb to `arc start` (per AWL coordination).

- Determinism boundary: foreign-artifact overlap is a deterministic _detection_ (Task 3.1: target path ×
  in-flight worktree git-state); the advisory _judgment_ (bias-to-surface, word the caveat) lives in the skill
  (Task 3.3); the CLI helper (Task 3.2) only _records_ a caveat it is handed. Judgment is reserved to the one step
  that genuinely needs it — unlike the spawn-time scope check, the errand's concrete target path makes overlap a
  git-checkable fact rather than a spec-vs-spec judgment.

- Zero-git-mutation prep: the helper creates only the queue entry (no branch, no commit); the `chore/<slug>`
  branch is cut lazily by the errand session at execution, so an abandoned errand leaves only a sweepable entry.

### `[x]` **3.1 Deterministic foreign-artifact detection (feeds the advisory gate)**

- _Goal:_ Given an errand's target path(s) and the originating WU, detect which _other_ in-flight WUs touch the
  target — a deterministic check over the local identity-filtered roster + per-worktree git state — returning the
  overlap facts the skill turns into an advisory caveat. Never blocks.

- **Strategies:** strategy-testing-methodology.md

- _Outcome:_ Added `lib/git/foreign-artifact-detection.ts` — `detectForeignArtifactOverlap` unions committed
  divergence (`git diff <base>...<branch>`) with uncommitted edits (`git status --porcelain` run in the foreign
  worktree), prefix-matches the target path(s), excludes the originating worktree, and returns facts only (never
  blocks; collects every overlap). Refined the pinned in-flight rule: not "Active / Integrating" but **meta-bearing
  AND not `Shipped`** — Planning and Integrating branches also merge to base and can plant a cross-branch conflict,
  so narrowing would miss real overlaps; only `Shipped` (already merged) and meta-less admin/main checkouts are
  excluded. Exported via the git barrel for Tasks 3.2/3.3.

### `[x]` **3.2 `arc errand` CLI helper — resolve primary worktree, compose + write entry, return**

- _Goal:_ One CLI invocation — `arc errand` — from any WU session resolves the primary worktree, composes a
  forward-pointing queue entry (goal / pointers / `chore/<slug>` / `created` / an optional caveat handed in by the
  skill), direct-writes it into that worktree's `ERRANDS.md`, and returns — creating no branch and no commit.

- **Strategies:** strategy-testing-methodology.md

- _Outcome:_ Added `runErrand` (`src/commands/errand.ts`): resolves the primary worktree, composes the
  managed-entry grammar (Goal-first; `_Caveat:_` only when handed one), inserts under `## Queue` before the `---`
  EOF, and direct-writes via injected IO — no branch, no commit; refuses a non-branch-safe slug. Closed the
  primary-resolution gap with `resolvePrimaryWorktreePath` (first `git worktree list` stanza) in
  `worktree-roster.ts`, barrel-exported. Wired a thin `handlers/errand.ts` + the `arc errand` registration (sibling
  of `start`), supplying identity + today's date. Covered by resolver + orchestrator units and an e2e proving the
  real path resolution and the zero-git-mutation contract (no `chore/*` branch cut).

### `[x]` **3.3 `arc-errand` skill (thin skill over the helper)**

- _Goal:_ Invoking the `arc-errand` skill from a WU session drives the flow end-to-end — classify against the
  matrix, run the advisory assessment (call Task 3.1 detection, apply bias-to-surface judgment, word any caveat),
  then invoke `arc errand` (Task 3.2) passing the caveat — and return to the WU.

- **Strategies:** strategy-package-project-sync.md

    - `[x]` **3.3.a Author `SKILL.md`** — authored the adopter-facing skill (thin numbered flow, no meta-refs) at
      both canonical copies (package source + `.arc/system/.internal/skills/arc-errand/`) and hand-synced the
      gitignored harness copy (`.claude/skills/`); all three byte-identical.

    - `[x]` **3.3.b Wire the skill flow** — classify (§ Errand decision matrix) → `arc errand check --json`
      (overlap facts) → bias-to-surface caveat judgment → `arc errand queue ... --caveat` → return.

- _Outcome:_ Authored the thin `arc-errand` skill (classify → check → judge → queue). Wiring it surfaced a missing
  seam: a markdown skill can't call the detection library directly, so `arc errand` was promoted from a flat verb
  to a noun with `check` (read — exposes `detectForeignArtifactOverlap` as JSON facts, the seam the skill calls)
  and `queue` (the renamed write from Task 3.2). The check/queue split preserves the detect → judge → record
  separation, mirrors `arc active status`/`roster`, and disambiguates the CLI from the `arc-errand` skill name
  (bare `arc errand` now prints usage); recorded in spec § Technical Considerations.

## **Phase 4:** Cold-errand entry (session-init Orient arm)

_Purpose:_ Close the cold-errand gap — make session-init's no-WU Orient arm Errand-aware via the explicit
`arc-session --errand` signal, keeping `arc-session` the one universal door.

### `[x]` **4.1 Errand-aware Orient arm + the `--errand` signal**

- _Goal:_ `arc-session --errand` on a no-WU primary worktree enters errand mode — orient with universal content
  only (no WU-artifact reads), then classify + run the Phase 3 detection gate and set up the errand in place;
  bare `arc-session` stays frictionless between-WU discovery.

- **Strategies:** strategy-session-operations.md, strategy-workflow-authoring.md

    - `[x]` **4.1.a Make the Orient arm consume the `--errand` signal in `session-init.md`** (+ package mirror) —
      Orient arm now forks on the explicit `--errand` token into a Discovery/Errand pair; the positional entry
      seed stays orthogonal, and non-Orient arms surface "not consumed" (Resume points at the arc-errand skill).
      Edited `session-init.template.md` + the rendered `.arc/` copy; the arc-session skill advertises the flag.

    - `[x]` **4.1.b Orient in errand mode + set up locally** — added the "Errand cold-entry (Orient arm)"
      subsection: universal context only (items 1–6 + WORKING-MEMORY; WU-artifact reads 8.1/9/10 and Step 5
      skipped), then classify + `arc errand check`, then execute immediately on a `chore/<slug>` branch off
      `branch.base` (queue optional). Step 5 and Step 6 carry errand-mode guards.

- _Outcome:_ One door preserved — `arc-session`'s no-WU Orient arm gained the second intent via an explicit
  flag, not arg-overloading. The cold path diverges from in-session `arc-errand` on the tail only (execute-now
  vs. queue-and-return), reusing the skill's classify + Phase 3 `check` halves. Skill copies and both workflow
  copies (template + rendered) kept in sync.

## **Phase 5:** Planning-path auto-merge lane (merge-gate minimal slice)

_Purpose:_ Remove the merge-wait that makes each planning-path Errand a manual branch+PR+merge under full
protection — ship the doctrine + reference recipe, a guided setup workflow with a protection-aware offer, and a
repo-local dogfooding instance.

_Design decisions:_

- Minimal slice only: a conditional `merge-ok` status job (NOT CI `paths-ignore`, which leaves required jobs
  Pending and blocks branch protection) + a static planning-paths CODEOWNERS. Path-graded doctrine, phase-2
  CODEOWNERS-from-`**Owner:**`, and ordering stay in CWC.

- Audience split: doctrine + recipe/templates + the `setup-merge-gate` workflow are adopter-facing; the repo's
  own `.github/` instance (Task 5.3) is internal-dev and not shipped.

- The dogfooding instance (Task 5.3) is produced by _running the Task 5.2 workflow against this repo_ — the
  recipe-application logic lives once in the workflow; 5.3 exercises it.

- CODEOWNERS defaults to `.github/CODEOWNERS` (co-located with `.github/workflows/`, idiomatic when `.github/`
  exists, less root clutter); the setup workflow detects an existing file and defers to the user for root /
  `docs/`. A setup-time choice, not an arc-config key — ARC never reads CODEOWNERS at runtime (GitHub resolves it),
  so a key would be inert.

### `[x]` **5.1 Adopter-facing doctrine + GitHub reference recipe (templates)**

- _Goal:_ Projects get host-agnostic classification doctrine (planning/backlog grooming auto-merges;
  constitutional docs — rules, ADRs, strategies — stay reviewed) plus a concrete GitHub recipe: a conditional
  `merge-ok` status-job template and a static planning-paths CODEOWNERS skeleton.

- **Strategies:** strategy-package-project-sync.md

    - `[x]` **5.1.a Author the auto-merge doctrine** — new `## Auto-Merge Lane` section between § Branch
      Protection Modes and § Errand Work Class in `strategy-work-organization.md` (both copies): the two-lane
      path classification (auto vs. reviewed) and the host-agnostic three-condition mechanism (stable required
      check, owner-review on reviewed paths only, native auto-merge), with the status-job-not-`paths-ignore`
      rationale. Contents entry + `[merge-gate-templates]` reference link added.

    - `[x]` **5.1.b Add the recipe templates** under `templates/arc/merge-gate/` (both copies) — `merge-ok.yml`
      (lane-classify job + heavy jobs + an `if: !cancelled()` roll-up gate, dependency-free git-diff path
      classification), a `CODEOWNERS` skeleton (catch-all owner + trailing unowned prefix-scoped block,
      last-match-wins), and a README; parent `templates/arc/README.md` index updated. First non-md templates in
      the tree.

- _Outcome:_ Two design calls settled. (1) Host-coverage open question → GitHub-flavored recipe + host-agnostic
  doctrine note, no per-host recipes (beyond the minimal slice). (2) Auto-merge boundary classifies by artifact
  **prefix** (`draft-/tasks-/meta-/notes-/cohort-*` under `active/` or `backlog/`), not by directory — so
  derived / shared surfaces (`ROADMAP`, the backlog inboxes) stay reviewed while per-WU/per-cohort grooming
  auto-merges; `cohort-*` rides the auto-merge lane on the content-review axis (its concurrent multi-owner
  edits are an orthogonal axis, deferred to CWC's all-owner gate). CODEOWNERS naturally enforces "lanes never
  split a PR" (any owned changed path → whole PR reviewed).

### `[x]` **5.2 Guided `setup-merge-gate` workflow + protection-mode-aware offer in `01_verify-and-configure.md`**

- _Goal:_ A standalone, runnable-anytime `setup-merge-gate` workflow walks the user through the recipe — drop in
  the `merge-ok` job + CODEOWNERS, require the `merge-ok` check in branch protection, enable native auto-merge —
  idempotent and honest that it is GitHub-flavored; it is offered (full-protection only) from
  `01_verify-and-configure.md`.

- **Strategies:** strategy-workflow-authoring.md

    - `[x]` **5.2.a Author the standalone `setup-merge-gate` workflow** (`supplemental/`, both copies) —
      Prerequisites (full-protection + `gh`/admin gate) then five idempotent steps (drop in `merge-ok.yml`,
      drop in CODEOWNERS, require the `merge-ok` check via `gh api` contexts endpoint, `gh repo edit
      --enable-auto-merge`, verify) plus an § Other Hosts manual-adaptation note. Copies the recipe from
      `templates/arc/merge-gate/`; CODEOWNERS defaults to `.github/CODEOWNERS`, detect-if-present defers to the
      user for `.github/` / root / `docs/`; every GitHub-settings step carries a guided-manual fallback. Agent-led
      (no companion CLI), unlike `setup-release-wrapper`.

    - `[x]` **5.2.b Add the protection-mode-aware offer** — new "Optional: Set Up the Auto-Merge Gate" section in
      `01_verify-and-configure.md` Path 1 (both copies), explicitly gated to `branch.protection: full` with the
      partial-protection skip rationale; set-up-now / defer / skip options point at the standalone workflow.

- _Outcome:_ The merge-gate recipe (Task 5.1) now has a runnable applicator: 5.1 = doctrine + templates, 5.2 =
  the workflow that lands them on a live GitHub repo. The offer lives in Path 1 only (repo-level, fresh-install
  concern; joiners run the standalone workflow). Task 5.3 dogfoods by running this workflow against this repo.

### `[x]` **5.3 Repo-local dogfooding instance (run Task 5.2's workflow) + TECHNICAL-OVERVIEW § 3 update**

- _Goal:_ This repo's own `merge-ok` lane is live — `.github/workflows/merge-ok.yml` + `.github/CODEOWNERS` +
  branch-protection required-check + native auto-merge — produced by running the `setup-merge-gate` workflow
  against this repo, and TECHNICAL-OVERVIEW § 3 documents the new host config.

    - `[x]` **5.3.a Dogfood — ran `setup-merge-gate` against this repo**: integrated `classify` + `merge-ok`
      into `ci.yml` (lane-gating `quality` + `full-suite`) rather than a standalone `merge-ok.yml` — `needs` is
      intra-workflow, so the gate must co-locate with the jobs it rolls up; added `.github/CODEOWNERS`
      (`@andrewRCr` owner, planning prefixes unowned); created `main` branch protection requiring the `merge-ok`
      check (require-PR, no code-owner review, `enforce_admins: true`) and enabled native auto-merge — all via `gh`.

    - `[x]` **5.3.b Updated TECHNICAL-OVERVIEW § 3** with a Merge-gating bullet (additive to the existing CI
      entry) documenting the lane, the required check, CODEOWNERS, and auto-merge.

- _Outcome:_ Dogfooding against a real `ci.yml` drove the WU's biggest design corrections — the
  standalone-`merge-ok.yml` footgun (reshaped to a README snippet), the multi-workflow-CI path, and the solo
  code-owner-review wall (Option A: require `merge-ok` + PR, no code-owner review, reviewed lane enforced by not
  arming auto-merge). The live instance therefore diverges from the Goal's idealized
  `.github/workflows/merge-ok.yml`: the gate lives in `ci.yml` (cross-workflow `needs` constraint). Spec R9 and
  the success criteria are realigned to the integrated-gate framing.

## **Phase 6:** Verification

### `[ ]` **6.1 Complete verification** — load and follow [`verify-work-unit.md`][verify-work-unit]

---

## Success Criteria

- `[ ]` `arc-errand` launches an Errand from a WU session in one invocation: writes a queue entry, runs the
  advisory gate, returns to the originating context without creating a branch/commit or touching the WU's worktree.

- `[ ]` The errand queue (`ERRANDS.md`) converges across worktrees and machines, drains by execution, and
  surfaces a staleness advisory when entries linger.

- `[ ]` The Errand decision matrix is complete in `strategy-work-organization.md` § Errand Work Class, and the
  DEV-RULES.ARC § "Leave it cleaner" routing table is re-cut on the commitment axis.

- `[ ]` The advisory gate records a coordinate/sequence caveat for a foreign in-flight artifact and does not hard-block.

- `[ ]` `arc-session` on a no-WU primary-worktree tree orients in an Errand-aware mode, disambiguating via an
  explicit signal.

- `[ ]` Under full protection, a planning/backlog-only PR auto-merges via `merge-ok`; a constitutional-doc PR
  requires review via CODEOWNERS. The `setup-merge-gate` workflow runs end-to-end, is idempotent, and is offered
  (protection-mode-aware) from `01_verify-and-configure.md`.

- `[ ]` This repo's own `merge-ok` lane is live (dogfooding), and TECHNICAL-OVERVIEW § 3 documents it.

- `[ ]` Terminology is base-branch / primary-worktree throughout; the `errand-launch` label is retired to `arc-errand`.

- `[ ]` All quality gates pass (tests, linting, type checking)

- `[ ]` Ready for integration

[verify-work-unit]: ../system/workflows/arc/work-unit-lifecycle/verify-work-unit.md
