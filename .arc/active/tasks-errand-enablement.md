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

### `[ ]` **3.1 Deterministic foreign-artifact detection (feeds the advisory gate)**

- _Goal:_ Given an errand's target path(s) and the originating WU, detect which _other_ in-flight WUs touch the
  target — a deterministic check over the local identity-filtered roster + per-worktree git state — returning the
  overlap facts the skill turns into an advisory caveat. Never blocks.

- _Context:_ Extends the R11 in-flight posture (advisory, never gates) but goes deterministic where its spawn-time
  precedent can't: an errand has a concrete target path, so overlap is a git-checkable fact rather than a
  spec-vs-spec judgment. The roster (`runWorktreeRoster` / `filterRosterByIdentity`, no remote fetch) supplies the
  in-flight set; the per-path overlap diff is net-new on top of it. The judgment residual (bias-to-surface on
  unstated scope, word the caveat) lives in the skill (Task 3.3).

- _Detection boundary:_
    - **"modifies"** = committed branch divergence (`git diff <base>...<branch> -- <path>`) **or** uncommitted
      edits in that WU's worktree touching the target — both count.
    - **"in-flight"** = a roster entry with a resolved meta in a live state (Active / Integrating); meta-less
      admin/main checkouts and shipped entries don't count.
    - **base branch** resolves from `branch.base` (default `main`) — never hardcoded.
    - **self-excluded:** the originating WU's own branch/worktree is never reported (own-scope is self-contained,
      not a foreign overlap) — hence the originating WU is an input, not derived.
    - **target match** is path-prefix, so a directory target matches any file beneath it; the target may be a set.

- **Strategies:** strategy-testing-methodology.md

    - Build `test-first` (one behavior at a time):

        - a target modified on another in-flight WU's branch (committed, vs. base) is reported as an overlap
        - a target with uncommitted edits in another in-flight WU's worktree is reported as an overlap
        - the originating WU's own overlap is excluded (not reported)
        - a target no other in-flight WU touches reports no overlap
        - meta-less / shipped roster entries are not treated as in-flight
        - base resolves from `branch.base`; detection uses the local roster + per-worktree git state (no fetch)
        - detection returns facts only — it never blocks (the gate stays advisory)

### `[ ]` **3.2 `arc errand` CLI helper — resolve primary worktree, compose + write entry, return**

- _Goal:_ One CLI invocation — `arc errand` — from any WU session resolves the primary worktree, composes a
  forward-pointing queue entry (goal / pointers / `chore/<slug>` / `created` / an optional caveat handed in by the
  skill), direct-writes it into that worktree's `ERRANDS.md`, and returns — creating no branch and no commit.

- _Approach:_ Mirror the `start.ts` shape (thin handler → testable orchestrator in `src/commands/`). Direct-write
  the entry into the _primary_ worktree's `ERRANDS.md` (under `## Queue`) for same-machine handoff — the roster
  carries no primary marker today, so flag the primary entry (the first `git worktree list` stanza / the
  `--git-common-dir` parent) as part of this task. Cross-machine convergence rides notes-sync, and the slug-keyed
  entry-merge (Task 2.2) makes the later note-merge idempotent — no double-add, no new dedupe logic here.

- _Note:_ Command spelling `arc errand` is a sibling entry verb to `arc start` (AWL coordination). Classification
  and the advisory assessment are the skill's job (Task 3.3); the helper only resolves/composes/writes and records
  a caveat — and a branch-safe slug — it is handed.

- **Strategies:** strategy-testing-methodology.md

    - Build `test-first` (one behavior at a time):

        - resolves the primary worktree from the roster, not the current linked worktree
        - composes a queue entry from goal / pointers / `chore/<slug>` / `created` / optional caveat
        - writes the entry and creates no branch and no commit (zero git mutation)
        - the originating worktree's branch and working tree are untouched
        - records a caveat passed in — it does not compute the advisory assessment
        - a re-written entry with the same slug is idempotent under the later note-merge (no double-add)

### `[ ]` **3.3 `arc-errand` skill (thin skill over the helper)**

- _Goal:_ Invoking the `arc-errand` skill from a WU session drives the flow end-to-end — classify against the
  matrix, run the advisory assessment (call Task 3.1 detection, apply bias-to-surface judgment, word any caveat),
  then invoke `arc errand` (Task 3.2) passing the caveat — and return to the WU.

- _Context:_ Mirrors the `arc-commit` skill shape — the skill owns a short linear flow (classify → assess → invoke
  the CLI) with no backing workflow, since there's no multi-arm branching or cross-lifecycle reuse to house in
  one. (The genuinely workflow-shaped slices live in their own workflows: cold-errand entry extends
  `session-init.md` in Phase 4; merge-gate setup is `setup-merge-gate.md` in Phase 5.) The skill is where the
  advisory _judgment_ lives (detection is deterministic in Task 3.1; the helper only records), collapsing
  Task 3.1's overlap facts into the single `_Caveat:_` string Task 3.2 records. References § Errand decision
  matrix (Phase 1) for classification. `arc-errand` is the ratified skill name (the working label "errand-launch"
  is retired).

- _Note:_ Self-hosting skill-file drift — hand-sync the harness copy (`.claude/skills/`) from canonical per
  DEV-RULES.PROJECT § Package-Project Sync.

- **Strategies:** strategy-package-project-sync.md

    - `[ ]` **3.3.a Author `SKILL.md`** at the canonical locations (package source + `.arc/system/.internal/skills/arc-errand/`)

    - `[ ]` **3.3.b Wire the skill flow** — classify (§ Errand decision matrix) → advisory assessment (Task 3.1
      detection + caveat judgment) → `arc errand` invocation (Task 3.2) with the caveat

## **Phase 4:** Cold-errand entry (session-init Orient arm)

_Purpose:_ Close the cold-errand gap — make session-init's no-WU Orient arm Errand-aware via the explicit
`arc-session --errand` signal, keeping `arc-session` the one universal door.

### `[ ]` **4.1 Errand-aware Orient arm + the `--errand` signal**

- _Goal:_ `arc-session --errand` on a no-WU primary worktree enters errand mode — orient with universal content
  only (no WU-artifact reads), then classify + run the Phase 3 detection gate and set up the errand in place;
  bare `arc-session` stays frictionless between-WU discovery.

- _Context:_ Fills the Worktree Foundation seam (the no-WU leaf + optional-arg threading). `--errand` is an
  explicit token orthogonal to the positional entry-seed, so it doesn't collide with cold-start's spec-input arg;
  `arc-session <seed>` in the Orient arm keeps its current "not consumed / surface" behavior.

- _Note:_ Cold path executes immediately by default — already in the primary worktree, the leaf can cut the
  `chore` branch and do the errand; the queue entry is optional (it earns its keep only for deferral /
  cross-machine). Reuses the Phase 3 detection gate (Task 3.1) and classification.

- **Strategies:** strategy-session-operations.md, strategy-workflow-authoring.md

    - `[ ]` **4.1.a Make the Orient arm consume the `--errand` signal in `session-init.md`** (+ package mirror) —
      dispatch the no-WU leaf into errand mode on the explicit token; leave bare-`arc-session` discovery and the
      positional seed unchanged

    - `[ ]` **4.1.b Orient in errand mode + set up locally** — universal content only (no WU-artifact reads), then
      classify + run the Phase 3 gate and execute immediately or queue (queue optional)

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

### `[ ]` **5.1 Adopter-facing doctrine + GitHub reference recipe (templates)**

- _Goal:_ Projects get host-agnostic classification doctrine (planning/backlog grooming auto-merges;
  constitutional docs — rules, ADRs, strategies — stay reviewed) plus a concrete GitHub recipe: a conditional
  `merge-ok` status-job template and a static planning-paths CODEOWNERS skeleton.

- _Context:_ `merge-ok` is a conditional **status job**, deliberately not CI `paths-ignore` (which leaves required
  jobs Pending and blocks branch protection). ARC owns the classification + a recommended recipe, not enforcement.

- **Strategies:** strategy-package-project-sync.md

    - `[ ]` **5.1.a Author the auto-merge doctrine** as a new subsection by § Branch Protection Modes in
      `strategy-work-organization.md` (both copies) — which path classes auto-merge vs. stay reviewed,
      host-agnostic framing; CWC later extends it

    - `[ ]` **5.1.b Add the recipe templates** under `templates/arc/merge-gate/` (both copies; first non-md
      templates in the tree, so include a short README) — a `merge-ok` status-job template + a planning-paths
      CODEOWNERS skeleton

        - GitHub-flavored, with a host-agnostic doctrine note; host coverage (GitHub-only vs. adaptation notes for
          other hosts) is an Open Question to ground

### `[ ]` **5.2 Guided `setup-merge-gate` workflow + protection-mode-aware offer in `01_verify-and-configure.md`**

- _Goal:_ A standalone, runnable-anytime `setup-merge-gate` workflow walks the user through the recipe — drop in
  the `merge-ok` job + CODEOWNERS, require the `merge-ok` check in branch protection, enable native auto-merge —
  idempotent and honest that it is GitHub-flavored; it is offered (full-protection only) from
  `01_verify-and-configure.md`.

- _Context:_ Standalone so it runs post-init or later. The offer is protection-mode-aware — surfaced only under
  `branch.protection: full` (under partial protection an Errand is a direct commit with no merge-wait).

- _Approach:_ The workflow drives the GitHub-side settings with `gh` where exposed (`gh api` for the
  branch-protection required-check, `gh repo edit --enable-auto-merge`) and falls back to guiding the user where
  host access isn't available; host-agnostic doctrine for non-GitHub hosts.

- **Strategies:** strategy-workflow-authoring.md

    - `[ ]` **5.2.a Author the standalone `setup-merge-gate` workflow** — idempotent (detect-if-present, safe to
      re-run), GitHub-flavored via `gh` with a manual-adaptation note for other hosts; places CODEOWNERS at
      `.github/CODEOWNERS` by default, detecting an existing file and deferring to the user for root / `docs/`

    - `[ ]` **5.2.b Add the protection-mode-aware offer** to `01_verify-and-configure.md` (full protection only),
      pointing to the standalone workflow

### `[ ]` **5.3 Repo-local dogfooding instance (run Task 5.2's workflow) + TECHNICAL-OVERVIEW § 3 update**

- _Goal:_ This repo's own `merge-ok` lane is live — `.github/workflows/merge-ok.yml` + `.github/CODEOWNERS` +
  branch-protection required-check + native auto-merge — produced by running the `setup-merge-gate` workflow
  against this repo, and TECHNICAL-OVERVIEW § 3 documents the new host config.

- _Context:_ Not shipped (every repo owns its `.github/`); running the Task 5.2 workflow here both lands the live
  instance and validates the workflow end-to-end (runnability + idempotency). CODEOWNERS keeps constitutional
  docs in the reviewed lane.

- _Note:_ The workflow is agent-led; branch-protection + auto-merge enablement go through `gh` where it drives
  the GitHub settings, and surface as guided steps where the maintainer must apply them.

    - `[ ]` **5.3.a Dogfood — run `setup-merge-gate` against this repo**, landing the `merge-ok` job +
      `.github/CODEOWNERS` (co-located with the existing `.github/workflows/`), wiring the required-check, and
      enabling auto-merge; confirm idempotency on a second run

    - `[ ]` **5.3.b Update TECHNICAL-OVERVIEW § 3 Infrastructure** to document the new host config (additive to the
      existing GitHub Actions CI)

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
