# Draft: Worktree Foundation

**Purpose:** Land the worktree-mechanics layer for parallel and mobile work — the WU entry primitives
(spawn / cold-start) and the `arc-session` skill, the in-session `arc-shift`, worktree-aware
session-init including branch-gone detection, and cross-WU file sync. Mechanism only; conventions land
in `draft-concurrent-work-conventions.md`. **The awareness layer — the in-flight oracle, `STATUS.USER`
view, `Priority` field, and materialize — split out to In-Flight Awareness
(`draft-in-flight-awareness.md`) on 2026-05-24 (the 2-way Foundation | Awareness split).**

- **State:** Draft — pre-spec exploration captured during agile/mobility expansion discussion 2026-04-28.
  Split from former Work-Unit Mobility WU; the conventions layer became Concurrent Work Conventions and
  the agile-lifecycle layer became Agile WU Lifecycle. Updated 2026-05-08 to consume per-worktree
  isolation foundation from new upstream Work Organization Reform WU — see § Dependencies.

- **Created:** 2026-04-28

- **Origin:** Originally Phases 1–2 of the Work-Unit Mobility plan. Split out during the
  agile/mobility design discussion to ship mechanism earlier and let downstream WUs (User Sync UX
  Polish, Coord Probe, Agile WU Lifecycle) consume worktree mechanics from a clean substrate. Resolves
  the long-standing concern that ROADMAP claims "parallelizable" downstream WUs without ARC actually
  having parallelism infrastructure — Worktree Foundation makes parallelism real.

  **2026-05-08 update:** Pre-spec sanity-check on the parallelism trio surfaced that per-worktree
  isolation requires a meta-file location and lifecycle reform that this WU was implicitly
  assuming but not delivering. That foundation was carved out into Work Organization
  Reform, which now sits upstream of this WU. Concrete consequence: scope item 4's
  branch-gone resolution cascade consumes WOR's roster-cascade implementation; scope item 8's
  main-on-main pattern composes with WOR's single-branch-per-WU model; the per-worktree isolation
  goals throughout this WU are delivered structurally by WOR rather than enforced through
  worktree-specific mechanism here.

---

## Problem / Motivation

ARC has no awareness of git worktrees. The framework works correctly inside a worktree (most
behavior generalizes naturally via branch-based disambiguation), but nothing surfaces worktree
context, and several mechanisms silently assume one-working-tree-per-repo:

- `session-init` orientation reports current branch but never identifies which physical worktree the
  session is in
- `SESSION-NOTES.md` is gitignored — each worktree holds its own physical copy for the same identity,
  violating the "one identity = one workspace" assumption in [strategy-team-coordination.md][team-coord]
- Cross-WU files like `ATOMIC-INBOX.md` get divergent per-worktree views via the per-commit notes-save
  model
- `activate-work-unit.md` and `integrate-work-unit.md` make no provision for worktree creation or
  removal
- No strategy doc describes how worktrees fit ARC's work-unit model

A concrete instance surfaced 2026-04-29 during this plan's pre-spec evolution. Planning branch
`technical/plan-session-operational-flow` was integrated on machine A; a successor WU
(`technical/interlock-foundation`) started there. On machine B, session-init opened on the now-deleted local
planning branch and reported `worktree: remote-unavailable / failureReason: error` — masking that upstream had
been pruned cleanly. Manual recovery (fetch --prune → checkout main → fast-forward → checkout WU branch →
notes-pull) was straightforward, but the workflow gave no signal that recovery was needed or what shape it should
take. The cascade specified in scope item 4 resolves this as the simplest pre-worktree single-WU instance of the
multi-WU branch-gone problem.

Without this WU shipping, ROADMAP's "parallelizable" sibling claims are aspirational for solo work and
team mode is the only path to actual concurrency. Worktree Foundation makes per-WU-per-worktree
isolation a first-class capability.

The shift lifecycle (`draft-arc-modes.md` § Shift Lifecycle, ~478 lines) was designed as mode-universal
infrastructure that arc-modes calls into. Extracting it is the natural form of what the architecture
already anticipates (`draft-arc-modes.md` L4378-4387: *"This is why shift lives in its own
cross-cutting section rather than inside the Local mode treatment. It's universal."*).

---

## Scope

### In scope

1. **Shift reconciliation — see `cohort-agile-parallelism.md`.** The shift lifecycle was extracted
   from `draft-arc-modes.md` (Phase 1) and then evaluated against the cohort model. Conclusion: the
   shift *state* machine (`Paused` / `Waiting-For`) is obsolete — superseded by WOR's `Integrating`
   state and worktree-as-parking isolation — and `/arc-status` is cut. "Shift lifecycle" as a distinct
   concept dissolves; WF's surviving shift-related deliverables are the worktree transition primitives
   (items 2, 3, 11) and worktree-aware session-init (item 4). The cohort transition-shape contract in
   `cohort-agile-parallelism.md` is the governing record.

2. **In-session worktree shift (`arc-shift`).** A thin skill (provisional — a quick-trigger /
   canonical entrypoint over a workflow, the `arc-handoff` / `arc-commit` pattern) that repoints the
   current session to another **existing** in-flight worktree, preserving the agent's accumulated
   context. This is the niche case for a short detour where a fresh parallel session would lose that
   context. Creating a worktree for a new WU is spawn (item 3), not the shift; the dominant multi-WU
   pattern is parallel sessions (`cd <worktree> && arc-session`) per Session-Operational Flow's
   concurrency model.
    - **Naming (settled 2026-05-23):** `/arc-shift`. "shift" once named the now-cut state machine, but
      that machine was never shipped to adopters, so there is no live mental model to import — the only
      cleanup is purging its `Paused` / `Waiting-For` references (Scope Estimate phase 8), after which
      "shift" carries a single meaning: moving the session laterally to another worktree.
    - **Uncommitted work at the shift** (survivor folded from the extracted design): before switching,
      detect uncommitted changes and offer commit (recommended) / stash / leave-as-is; the operator
      chooses. In Local mode, untracked `.arc/` edits follow leave-as-is structurally.
    - **Resume-staleness advisory** (survivor): arriving in a long-idle worktree surfaces a dismissible
      "assumptions may be stale — re-read the spec" nudge past a fixed threshold.

3. **Spawn — create a new WU's infrastructure (tier-agnostic at WF).** Spawn is the one-shot operation,
   invoked from an existing session, that creates a new WU's branch, worktree, meta file, and empty
   SESSION-NOTES (optionally seeded with a one-line breadcrumb to the spawning context), then reports the
   new worktree path and returns to the originating session's context. It is the create-side primitive
   that AWL's `arc start` and arc-plan Conductor's entry verb both delegate to (consumers, not the
   inverse). See Design Decisions § Entry-point model for how spawn / cold-start / materialize relate.

   **Tier-agnostic at WF (the seam for AWL).** Spawn ships tier-agnostic: it always creates a worktree
   and a Planning-state meta, built as a **thin wrapper over `init-work-unit`** so AWL's life-phase
   parameter (`Planning` vs `Active` → branch-prefix follows) flows through later without reshaping the
   primitive. At WF-ship there is no `**Tier:**` field (AWL introduces it) and `init-work-unit` is
   planning-only, so every spawned WU pays today's full Planning→Active ceremony — WF adds worktree
   isolation and one-command ergonomics, not ceremony reduction. The tier-conditional behavior
   (atomic → no worktree; quick / standard → worktree) is **AWL's** to layer on; WF accepts a
   forward-compat `--tier` / `--type` it does not yet branch on.

   **Errand / atomic work does not spawn.** An Errand (ADR-021) has no meta and never enters lifecycle,
   so it never touches the spawn primitive — it launches from the **main worktree** (the atomic
   launchpad, item 8) on a branch off `main`, ships via the lighter gate, and tears down. "Launches from
   the current worktree" means the main launchpad, **not** an active WU's worktree: PR cleanliness is a
   function of branch topology (the Errand commit lands off `main`, never on the WU's branch), and
   running it from the main worktree (or a throwaway worktree off `main`) — never a stash-switch inside
   an active WU's worktree — is what avoids disrupting in-progress WU state.

   **Activation-time concurrency check (advisory; Foundation ships the degrading stub).** Before creating
   the worktree, the spawning session reads in-flight WUs (`git worktree list` plus — once In-Flight
   Awareness lands — the oracle's identity-filtered, refs + PRs view) and assesses scope overlap with the
   new WU per Concurrent Work Conventions's strategy-doc heuristics — agent-led, judgment-based, advisory.
   Surfaces concerns before spawn (e.g., "WU-X is in flight in `../arc-wu-x` and touches the same module —
   parallel, or sequence after it integrates?"); does not gate. No probe tooling, no `**Touches:**` field.
   Forward-compat: degrades to no-op when nothing else is in flight. **Foundation ships only this degrading
   stub** — `git worktree list` + general agent judgment over `**Purpose:**` / spec text; In-Flight
   Awareness upgrades it to the oracle-backed version. The check shape is stable; CWC calibrates what counts
   as overlap. The same check fires from the cold-start (item 11) entry point, and (in In-Flight Awareness)
   from materialize.

   **Auto-mode boundary:** spawn never fires under auto-cascade. Always an explicit user act.

4. **Worktree awareness in session-init, including branch-gone detection.** Small
   additions, not architectural:
    - Session-init detects worktree context via `git rev-parse --git-dir` and surfaces it in
      orientation when non-primary (`worktree: ../arc-wu-b`)
    - **Branch-gone detection at session-init.** When fetch reveals current branch's upstream is
      `gone` (post-prune; today reported as `remote-unavailable / failureReason: error`), surface as a
      dedicated `branch-gone` worktree state with a tailored prompt instead of conflating with
      genuine network failures. Resolution cascade consumes Work Organization Reform's
      cross-worktree roster-cascade implementation: `git worktree list` (other active worktrees) →
      per-worktree meta-file reads via the WOR cascade (active WU branches via `**Branch:**`
      field, filtered by `(@identity)` ownership when team mode; cross-branch read replaces the
      single-`active/`-directory listing assumption) → recently-active remote branches
      (post-fetch, within `coord.recency_days`) → coord-probe (per `draft-coord-probe.md`) → fall
      back to `main` with explicit confirmation. Per-worktree action varies: stranded in main / administrative
      worktree → propose switch to next admin or feature branch; stranded in WU worktree whose branch
      was merged externally → propose worktree removal + meta-file archival cleanup.
      **Detect-stop-prompt as default for ambiguity:** when no high-confidence single signal emerges,
      session-init stops and surfaces candidates rather than guessing.
    - **Notes-pull ordering rule under branch-gone.** When `branch-gone` fires, align git state (fetch, resolve
      target branch via cascade, switch) **before** running `arc user pull`. Notes describe context that requires
      aligned git refs — pulling against a stale branch yields correct content referencing surfaces (meta files,
      atomic companion files) that don't exist on the current branch. The ordering reverses session-init's standard
      Step 2 → Step 3 sequence for this specific state.
    - **Trust-hierarchy axis split in [session-init.md][session-init] Step 7.** Refactor the existing single
      hierarchy (git > task list > status > notes) into two axes per § Roster vs context: (a) *truth of work
      state* — git authoritative (current hierarchy, narrowed to this question); (b) *which work am I picking up* —
      identity-filtered meta files + worktree list authoritative (new axis). Mismatch examples in Step 7
      redistribute to the appropriate axis.
    - **Forward compatibility with pre-worktree single-WU world.** The branch-gone cascade ships value before
      worktrees are in widespread use. Pre-worktree, the cascade trivializes — `git worktree list` returns one
      entry, identity-filter on meta files yields one match, notes-pull confirms. Shipping isn't gated on
      worktree adoption; today's single-WU multi-machine recovery is the simplest instance of the same mechanism.

5. **`/arc-status` skill — cut.** Dropped per `cohort-agile-parallelism.md`: the project-wide
   in-flight view is the derived ROADMAP, and session-scoped orientation is something operators already
   hold. The genuinely-distinct value (a user-scoped, cross-WU view of in-flight WUs, including those
   with no open session) is captured as the **user-scoped in-flight dashboard** candidate in the
   contract — a derived view, not this ephemeral skill. (Aside: `arc status` is now the session-init
   composite probe, not a name the rebrand would free — the old framing assumed otherwise.)

6. **Cross-WU sync mechanism implementation.** `arc user save/load` ships path-driven sync
   dispatch over the structural foundation delivered by Work Organization Reform (WOR R65). The
   structure WOR ships:

    - `user/{identity}/<wu-name>/**` — per-WU class (SESSION-NOTES, contributor-role
      `meta-<wu-name>.md` when applicable). Each worktree's `user/{identity}/` filesystem
      contains exactly one WU subdir (the active WU's).
    - `user/{identity}/**` flat at root — cross-WU class (USER-INBOX, WORKING-MEMORY).
    - `user/{identity}/.internal/**` — per-machine, never synced (existing convention).

   Mechanism this WU delivers:

    - **Path-driven dispatch.** `arc user save/load` infers sync class from path structure. No
      allowlist file, no in-band class declaration — path is the convention. Resolves the prior
      open question on file class declaration.
    - **Per-WU subdir load.** Restore from the most recent reachable note containing the current
      WU's subdir; older notes' subdirs for different WU names skip. Resolves the spawn →
      first-load overwrite case: a fresh worktree's load doesn't pick up the prior WU's
      SESSION-NOTES from main's ancestor walk because the WU subdirs don't match.
    - **Cross-WU file merge.** Read N most-recent notes ref-wide; merge file contents via
      value-level list-union of H3-headed entries (matching the codified shape for both
      USER-INBOX and WORKING-MEMORY). Dedupe by entry identity (heading).
    - **Tombstones for cross-WU deletions.** Entry removal writes a `## Removed: {name}` marker
      with timestamp; merge respects the most recent tombstone over earlier inclusion. **GC = a
      generous fixed TTL, filtered at merge time (resolved 2026-05-24, external-research-backed):**
      tombstones older than the window (default ~90 days, measured from the marker's timestamp) stop
      propagating and drop. The resurrection hazard (an offline replica re-adding a deleted entry) is
      the failure to prevent, but its severity is low for ARC — re-deleting a note, not data loss — so
      a generous window is conservatively safe and, since tombstones are tiny, free. The decision is
      the *mechanism* (time-based TTL filter-at-merge, from tombstone creation), not the constant.
      Consensus-based GC (needs a bounded/known replica set — ARC has neither) and causal-stability GC
      (the list-union model is not a causal DAG) were evaluated and rejected as ill-fit; Merkle
      anti-entropy is over-engineering over git notes. No user-facing "sync within N days" contract —
      the mild failure mode keeps the TTL an internal cleanup detail.
    - **Concurrent push reconcile on `refs/notes/arc/user/{identity}`.** When parallel worktrees
      push and the second hits non-fast-forward, reconcile via `git notes merge` (cat_sort_uniq
      default); surface conflict to user when non-trivial.
    - **Retired-subdir reconciliation.** `arc user close <wu>` removes `user/{id}/<wu>/` at WU
      retirement, but the trigger is machine-local: a sibling clone that synced the subdir before
      retirement has no trigger to close it, so a stale `user/{id}/<retired-wu>/SESSION-NOTES.md`
      lingers (observed 2026-05-23 after a WU integrated on one machine, then main pull / prune /
      checkout on another). Close it here, where the per-WU subdir load logic already lives:
      `arc user load` / `pull` / session-init reconciles retired subdirs (local subdir present +
      absent from recent notes + WU shipped → offer or auto-close with `.internal/` backup), or a
      session-init stale-subdir sweep. Composes with the orphan-warning T2 (subdir-grouped retirement
      messaging) in Pressure Points. (Pulled from USER-INBOX 2026-05-23 — the retirement-reconciliation
      half of this WU's per-WU subdir sync; the mechanism is item 6's load logic, not the partial-push
      trust signal that stays with `cross-machine-sync-coherence`.)

   WOR ships the structural foundation (file relocations, strategy + workflow updates, in-flight
   migration); this WU layers mechanism on top of resolved structure. No allowlist file, no
   frontmatter convention — the path-class invariant is established by WOR and consumed here.

7. **Pause-pointer fields retired by WOR — but `manage-incidental-work.md` is stranded on them
   (corrected 2026-05-24).** WOR's incidental-model reform retired `Interrupts:` / `Paused At:` /
   `Paused To:` / `Spawned:` from `template-meta.md` (which now documents them as retired), and the
   strict 4-state machine (`Planning | Active | Integrating | Shipped`) has no `Paused` state to
   migrate them into. The original "migrate pointers to shift state" plan is moot. **But the residual
   was assumed to be a no-op confirmation and isn't:** the `manage-incidental-work.md` supplemental
   workflow is still built end-to-end on the retired pause-pointer model — it instructs setting
   `Interrupts:` / `Paused At:` / `Paused To:` that the template now calls retired. WOR retired the
   fields but left this workflow stranded.

   **WF's bounded responsibility — surgical interim correctness, not a redesign.** WF *obsoletes the
   workflow's premise*: under worktree isolation an interrupt spins up an atomic-tier WU / Errand in
   its own worktree rather than pausing the parent (interim mechanism = WF's Errand cheap-branch path,
   main launchpad off `main`; upgrades to `arc start --tier atomic` once AWL ships). So WF neutralizes
   the obsolete pause-pointer mechanic so the workflow no longer contradicts the template. WF does
   **not** own the deeper reshape — *whether a standalone workflow is even the right shape* (vs.
   always-loaded DEV-RULES routing + a design-time strategy) and the work-class / granularity
   single-source-of-truth consolidation. That reshape belongs to the **agent-context-optimization
   cohort**: `documentation-surface-routing` owns the routing single-home, and `instruction-optimization`
   already targets this file (it flags the atomic-vs-task-list duplication and the Pause/Resume protocol
   as a PRD-time ownership decision); WF's premise-obsoletion is captured there to sharpen that call.
   Pairs with the incidental-concept retirement in `draft-agile-wu-lifecycle.md` (item 9).

8. **Main-on-main pattern (no separate admin worktree).** External research (2026-04-28) confirms mature
   git-using projects don't maintain a separate dedicated administrative worktree — main itself serves the
   role. Document this as ARC's stance: the main worktree stays on `main` as a stable reference and serves as
   the launchpad for admin operations (planning sessions, sweep ceremonies, occasional global edits). Admin
   work under `branch.protection: full` runs in short-lived branches from main worktree. Forward-references
   tier-aware archive ceremony from `draft-agile-wu-lifecycle.md` which inherits this convention.

   **Atomic-tier launchpad role.** Under Work Organization Reform's single-branch-per-WU
   model, atomic WUs still get their own branch (one branch per WU, all tiers) but no dedicated
   worktree. The main worktree serves as the atomic launchpad: spin atomic from main worktree on a
   short-lived branch, ship via PR, return — without disrupting any in-flight WU's worktree state.
   This composes cleanly with the main-on-main pattern: main worktree handles admin ops + atomic
   launches; WU worktrees stay dedicated to their respective WUs.

   **Composition with externally-spawned worktrees.** When an external worktree-management tool
   spawns worktrees, the tool typically still occupies the main checkout as its "main workspace"
   (consistent across every surveyed tool — see External Research Citations). The main-on-main
   pattern still applies — the tool's main workspace IS ARC's main worktree, used for admin ops
   and atomic-launchpad work; tool-spawned worktrees serve as WU worktrees per item 11's
   cold-start primitive.

9. **arc-modes cross-reference sweep — Phase 1 done; residual captured.** The shift sections moved out
   of `draft-arc-modes.md`, with its TOC + a removal-site forward-pointer + the orphaned-reference
   cleanup landed in Phase 1. The remaining sweep (Lite cut, post-WOR de-stale, residual shift-ref
   conversion) is captured on the arc-modes WU's own meta `**Next Action:**` and runs at its activation.

10. **Worktree conventions — branch-naming method and location template.** Two configurable
    conventions ship as substrate for items 2 and 11, both implemented as methods under
    `system/methods/` with the full method-override machinery from
    `strategy-configurability-architecture.md`:

    - **Branch-naming method** (`branch.naming_convention`). Default = Conventional Branch
      alignment per WOR's settled type-set — core 6 execution types plus `plan/<name>` for
      planning state. The method defers the type-set to WOR's resolution rather than hardcoding;
      WF references whatever WOR ships. Override surface mirrors `commit.format` for adopters
      with house conventions (Jira-prefixed, ticket-numbered, etc.). When ARC creates branches
      (`arc start` / spawn, item 11's cold-start primitive), the configured
      convention applies. When branches arrive externally (manual `git worktree add`, external
      worktree-management tools), the convention is advisory — item 11's bootstrap surfaces a
      warning if the branch doesn't match, never refuses or relocates.

    - **Worktree location template** (`worktree.location_template`). Default =
      `../{repo}.{branch}` — flat sibling-parent layout, no nesting. Slashes in branch names
      replace with `-` for the directory segment (`feat/cool-thing` → `<repo>.feat-cool-thing`).
      Override examples documented for common alternatives: Worktrunk-style `~/{repo}.{branch}`,
      in-repo `.worktrees/{branch}`, centralized `~/dev/worktrees/{repo}/{branch}`. When ARC
      creates worktrees, the template resolves. When worktrees are created externally, ARC reads
      location from `git worktree list` — no enforcement, no relocation.

    - **Schema placement** uses flat dotted keys (`branch.naming_convention`,
      `worktree.location_template`) per current arc-config convention. Eventual flat-vs-nested
      schema evaluation may relocate these keys; this WU uses provisional flat-dotted form.

11. **Cold-start — scaffold a WU inside an existing worktree.** The create-in-place mechanic (Design
    Decisions § Entry-point model): bootstrapping a WU inside any existing worktree that has no meta —
    manually `git worktree add`-ed, or spawned by an external worktree-management tool (Conductor,
    emdash, Maestro, Zed, Warp, Worktrunk, Super, Superset, T3code, Soloterm, Nora — see External
    Research Citations):

    - Takes any spec input — file pointer, URL, issue link, existing ARC plan-doc, or just a
      name plus brief description — and scaffolds a meta-* file in the current worktree. Honors
      WOR's Origin ⊥ Design orthogonality: external references populate `**Origin:**`; ARC-owned
      artifacts populate `**Design:**`.

    - **Reached from both entry verbs.** `arc-session` invokes it when it finds a bare worktree with no
      meta; `arc start` invokes it to create a WU in a worktree that already exists (vs spawn, which
      makes the worktree). Either way it scaffolds the meta and bootstrap is uniform downstream. (When
      ARC spawned the worktree *and* scaffolded the meta, the fresh session simply *resumes* via
      `arc-session` — not cold-start.)

    - Fires the activation-time concurrency check (item 3, advisory) from this entry point as
      well as from spawn. Same check, same heuristics — the cold-start path reads in-flight WUs
      via `git worktree list` plus identity-filtered meta-file reads, surfaces the same
      advisory regardless of which entry point invoked it.

    - Honors item 10's conventions when ARC creates state (warns when an externally-named branch
      doesn't match the configured branch-naming convention; reads worktree location from
      `git worktree list` rather than enforcing the location template).

    - **Surface:** a dispatch branch of the `arc-session` skill (Design Decisions § Entry-point
      model) — when no active WU is found in the worktree, `arc-session` offers cold-start.
      Cold-start is the meta-scaffolding *mechanic*, not a separate command: it is reachable from
      `arc-session` (bare worktree) and from `arc start` (deliberate create-in-place).

    - **Discoverability** has two surfaces with different audiences (see Pressure Points §
      "Discoverability of the cold-start primitive"). User-side handled by strategy docs + docs
      site; agent-side handled within ARC's own session-init reads (`AGENT-BRIEF.ARC.md`,
      `arc-session` skill content). No CLAUDE.md / AGENTS.md modification — ARC concerns stay
      within ARC's namespace.

> **Items 12–13 split out to In-Flight Awareness (`draft-in-flight-awareness.md`), 2026-05-24.** The
> awareness subsystem — **materialize** (discovery-led pickup of a remote WU, the 4th entry-point
> quadrant), the in-flight **oracle**, the **`STATUS.USER`** view + render standard, and the **`Priority`**
> field — lifted whole into its own WU (the 2-way Foundation | Awareness split). The **oracle-backed**
> activation-time concurrency check went with them; this WU (Foundation) ships only the *degrading
> advisory stub* of that check (see item 3). The entry-point 2×2's *materialize* quadrant is implemented
> there; Foundation implements resume / cold-start / spawn. See `cohort-agile-parallelism.md`.

14. **Retire the `atomic-*` companion file in light of the Errand class.** The `atomic-{name}.md`
    companion was a per-WU holding area for atomic items noticed mid-WU. With the Errand class (cheap
    standalone work) and worktree-isolated WU spin-up, that holding role evaporates — so WF retires the
    `atomic-*` file type rather than carrying it forward. Resolves AWL's open question (its scope item 8,
    "retire or repurpose") in the **retire** direction; AWL item 8 points here. Captured at WF because
    the Errand mechanism WF's spec ratifies is what obsoletes the companion, and WF is already in the
    capture-pipeline plumbing (item 6).

    - **Capture reroute (what replaces it).** In-WU atomic work routes by intent: fold into the commit
      (doing it now), add a task to the task list (part of this WU's plan), spin an Errand (standalone
      or cross-cutting), or `user/{identity}/USER-INBOX.md` § Atomic (not-yet-actionable). The shared
      `ATOMIC-INBOX.md` surface and the `atomic` *character* are unaffected — only the per-WU
      `atomic-*` companion file type retires.
    - **Sweep scope.** Retire references across DEV-RULES.ARC § Leave it cleaner (capture-routing
      table), `strategy-task-list-formatting.md` § Atomic Companion File, the `commit-footer` method
      (the `atomic-[name].md` context anchor), templates, and workflow mentions. Mechanical but broad.

### Out of scope

- **Focus-role model** (primary/companion/awaiting-external/parked) — landed by
  `draft-concurrent-work-conventions.md`.
- **Async-merge integration-surface audit** — landed by `draft-concurrent-work-conventions.md`.
- **`strategy-concurrent-work.md`** — landed by `draft-concurrent-work-conventions.md` (depends on
  mechanism + agile lifecycle landing first).
- **Tier model and `arc start` command** — landed by `draft-agile-wu-lifecycle.md`.
- **Generic worktree-wrapper CLI (`arc worktree create/remove`).** No generic git-worktree wrapper —
  ARC does not reimplement git. Worktree creation / teardown is owned by **WU-level verbs** (spawn,
  cold-start, materialize — Design Decisions § Entry-point model), which invoke `git worktree add` under
  the hood; cross-site consistency comes from item 10's conventions. Worktree cleanup after merge is
  documented in `integrate-work-unit.md` as an advisory step, not automated.
- **Hooks at shift transitions (`post-shift-pause` etc.).** Hook symmetry deferred to a later
  hooks-completeness pass. No clear current need; hooks can be added later without breaking
  integrations.
- **Blessing concurrent agent sessions.** Framework won't block two simultaneous agent sessions in
  different worktrees, but documentation is explicit: this violates P2 (co-development bandwidth).
  This WU ships the mechanism; the conventions on usage pattern land in
  `draft-concurrent-work-conventions.md`.
- **Plug-in hooks for external worktree-management tools.** ARC does not attempt to integrate with
  specific tools' extension surfaces. Only Worktrunk documents hooks (`pre-start`, `post-start`,
  `pre-merge`, `post-merge`); the remaining surveyed tools expose no extension points. ARC operates
  as a discipline layer in any worktree regardless of who created it — it does not attempt to
  orchestrate the tool that created the worktree. Item 11's cold-start primitive is the integration
  surface, intentionally tool-agnostic.

---

## Design Decisions

### Mechanism vs conventions split

Originally the Work-Unit Mobility plan bundled mechanism (worktrees, shift) with conventions (focus
roles, blessed pairings, async-merge audit). Splitting them lets mechanism ship earlier — adopters get
practical worktree fluency without waiting for the conventions design to settle. Conventions follow
once mechanism is in flight and patterns are observable.

### Sibling, not downstream, of User Sync UX Polish

Originally Mobility was sequenced after User Sync UX Polish ("clean sync state machine before
worktree axis joins it"). The split allows Worktree Foundation to ship in parallel — the sync UX
work is ergonomic, not correctness-critical for worktree mechanics. SESSION-NOTES per-worktree
handling is the main interaction surface; if Worktree Foundation lands first, User Sync UX Polish
incorporates worktree-aware semantics; if User Sync UX Polish lands first, Worktree Foundation
retrofits cleanly. Either order works.

### Worktree-by-default at quick/standard tier — conscious departure from sequential-by-default norm

External research (2026-04-28) confirms that mature git practice treats worktrees as opt-in
when concurrent work is genuinely needed, not as the default isolation mechanism. ARC's choice to
default to worktree-on-spawn for quick/standard tier (atomic stays in current worktree) is a
conscious departure motivated by:

- **Frictionless parallelism later.** Worktree-by-default means switching to parallel work doesn't
  require migrating from a single-worktree setup. The cost paid upfront is small; the cost avoided
  later is real.
- **Main worktree stays clean.** Reserving the main worktree for admin operations (per scope item 8)
  requires WU work to live elsewhere — worktrees are the natural answer.
- **Tier calibration mitigates the cost.** Atomic-tier work (the high-volume case for "I just want
  to fix this quickly") stays in the current worktree, so the worktree-by-default isn't actually
  default for trivial work.

Risks worth conscious management (per research):

- **Worktree accumulation.** Cleanup must be guaranteed and visible. Spawn-time + integration-time
  cleanup advisories and (eventually) automated stale-worktree detection at session-init are the
  mitigations.
- **"Which worktree am I in" confusion.** CLI/IDE surfacing must keep active worktree prominent —
  session-init orientation already includes worktree context per scope item 4.
- **IDE/LSP coordination across worktrees.** Largely outside our control; document the constraint
  (one worktree per IDE window).

### Roster vs context: dual-axis recovery model

Session-init implicitly answers two questions, not one — and they have different authoritative sources:

- **Roster** — *"Which WUs are mine in flight right now?"* Authoritative source: identity-filtered active status
  files (via the `**Branch:**` field, with `(@identity)` ownership filtering in team mode). Multi-valued in the
  multi-WU / multi-worktree world; collapses to a single entry pre-worktree.
- **Context** — *"What was I doing in WU X last session?"* Authoritative source: SESSION-NOTES, resolved
  per-worktree via that worktree's HEAD ancestry (notes are commit-anchored).

Notes are deliberately absent from the branch-gone resolution cascade (scope item 4) because notes answer the
context question, not the roster question. Reaching across all branches' notes refs to find a dev's recent
activity is a much heavier scan than reading meta files filtered by identity. Keeping the two axes separate
clarifies why the cascade is shaped the way it is.

Consequence for [session-init.md][session-init] Step 7's trust hierarchy: the existing single hierarchy
(git > task list > status > notes) conflates the two axes — git is authoritative for *truth of work state* (was
task 3.3 actually committed?) but the hierarchy says nothing about *which work am I picking up*, where status
files + identity ownership are authoritative. Spec work splits Step 7 into two axes (scope item 4 sub-bullet).

### Entry-point model — the 2×2, and the discipline-layer model

The operations for getting into a WU form a 2×2 over *does a local worktree exist?* × *does the WU
(branch + meta) already exist?*. The full 2×2 is the cohort-shared contract
(`cohort-agile-parallelism.md`); Foundation implements **resume / cold-start / spawn**, while the fourth
cell — **materialize**, an existing remote WU not checked out here — is **In-Flight Awareness**'s
(discovery-led off the oracle):

|                           | **WU exists** (branch + meta)        | **WU is new** (nothing yet)         |
| ------------------------- | ------------------------------------ | ----------------------------------- |
| **Local worktree exists** | resume — `arc-session`               | cold-start — scaffold meta in place |
| **No local worktree**     | **materialize** — check out + orient | spawn — create worktree + scaffold  |

These collapse to **two user-facing verbs plus the shift**:

- **Create a new WU** → `arc start` (AWL's verb — a CLI command with structured flags, e.g. `--tier`;
  delegates to WF's **spawn** primitive). Its two mechanics are *spawn* (ARC makes the worktree) and
  *cold-start* (you are already in a bare tool / manual worktree). Cold-start is thus a **shared
  mechanic**, reached from both `arc start` (deliberate create-in-place) and `arc-session` (discovery, on
  finding a bare worktree) — best implemented as a CLI-level scaffolding primitive both surfaces invoke, so
  each stays thin (spec detail). `arc start` stays a flat command, not an `arc wu` namespace: no second
  `arc wu` member materialized, since the user-scoped in-flight view is `arc user …` (In-Flight Awareness),
  not `arc wu list`.
- **Enter a WU** → the **`arc-session`** skill — the session-*entry* surface. It does not presume
  resumption; it **dispatches on detected worktree state**: *resume* (a local meta is present),
  *materialize* (no local worktree but the WU exists on the remote — the discovery offer, In-Flight
  Awareness), or *cold-start* (a bare worktree with no meta — the scaffolding offer, item 11). Two of the
  three branches
  are resumption (resume = local; materialize = cross-machine resume of existing work); cold-start is not.
  "Continue" is not a separate verb; it is resume.
- **Shift** the current session to another existing worktree → **`arc-shift`** (item 2).

So **spawn, cold-start, materialize, and "continue" are internal vocabulary, not user-facing commands** —
the surface is `arc start` + `arc-session` + `arc-shift` (+ `arc-handoff` to close). Both entry verbs are
universally available without a config flag: adopters who exclusively use an external worktree tool never
invoke `arc start`'s worktree-creating path; adopters who never use one always do. The paths converge once
the worktree exists with a scaffolded meta-* file; bootstrap is uniform downstream.

**Layering — what each layer owns.** This shape sits on top of two layers ARC does not own:

- **Tool layer** (when present): owns worktree creation — which branch, what location, what naming.
  ARC defers; items 2 and 11 work against whatever worktree the tool produced. Composability is
  one-way: the tool doesn't know about ARC; ARC works in any worktree the tool hands it. ARC does
  not orchestrate the tool (per Out of scope: plug-in hooks).
- **Harness layer** (Claude Code, Codex, Cursor, etc.): owns skill discovery within the worktree.
  Skills are harness-scoped, not tool-scoped — the harness reads `.claude/skills/` (or the harness
  equivalent) from the working tree, regardless of who created that working tree. This makes ARC's
  skills available in any worktree without harness-level configuration.
- **ARC layer**: owns the discipline above both — meta-* file lifecycle, state machine, planning
  artifacts, interlocks, sweep-as-you-go integration. Structural and non-negotiable; works the same
  in every worktree.

**Structural vs. advisory.** A useful split for what ARC enforces vs. recommends:

- **Structural** (uniform regardless of worktree origin): single-branch-per-WU, location-by-state,
  per-worktree isolation, state machine, capture pipeline, integration ceremony.
- **Advisory** (configurable defaults, soft-warned when violated): branch-naming convention
  (item 10), worktree location template (item 10). When ARC creates worktrees, conventions apply
  automatically; when external tools create worktrees, ARC warns on mismatch but does not refuse
  or relocate.

Adopters composing ARC with an external worktree-management tool get the full structural discipline;
the advisory conventions become recommendations the adopter applies via their tool's UX (most
surveyed tools accept user-provided branch names per § External Research Citations).

### Entry-surface naming, args posture, and open spec details (2026-05-24 planning round)

**Why `arc-session`, not `arc-resume`.** The skill spans more than resumption — its cold-start branch
(landing in a bare tool-spawned worktree and scaffolding a meta in place) is *creation*, not resumption —
so `arc-resume` is a misnomer. `arc-session` names it correctly: the session-entry surface that inspects
the worktree and dispatches. The rename's correctness is **coupled to cold-start staying in the skill**: if
cold-start were `arc start`-only, the skill would be resume + materialize (both "pick up existing work")
and `arc-resume` would still fit. Cold-start is *not* split into its own skill, on a discoverability
argument — an operator landing in a bare worktree (often via an external tool) should run one entry surface
that detects "no meta here" and offers to scaffold, rather than pre-classifying which command to invoke
when they have the least information. The deliberate *create* intent keeps its own front door
(`arc start`); `arc-session`'s bare-worktree branch is the discovery safety net, and it *offers* cold-start
(detect-stop-prompt), never auto-scaffolds.

**Command vs. skill.** CLI commands (`arc start`, `arc user …`, `arc sync`, `arc status`) are ARC's
harness-agnostic substrate — invoked by skills/workflows *and* directly by power-users in skill-less
harnesses. Skills (`arc-session`, `arc-shift`, `arc-handoff`) are the harness-optimized human entry.
spawn / cold-start / materialize / "continue" are internal mechanics, surfaced *through* the command/skill
layer.

**Args posture.** Skills are arg-free / discovery-led by default; any skill arg is *optional* and
NL-/typo-safe with the agent confirming ambiguity — never a required structured arg. Commands embrace
structured flags (`arc start --tier …`). One sanctioned optional skill arg: `/arc-session <pointer-or-blurb>`
may pre-seed cold-start (file / URL / issue / name+line), confirmed before use; absent or ambiguous, the
skill just asks.

**Open spec details (arg-free by design; ratify at spec):** (1) cold-start spec-input — interactive vs. the
optional seed above (lean interactive); (2) `arc-shift` target — discovery-led pick from `git worktree
list` vs. an arg (lean discovery, mirroring materialize); (3) cold-start as a shared CLI-level scaffolding
primitive both `arc start` and `arc-session` invoke.

### Session-init probe deltas and the turn-count budget (2026-05-24 planning round)

**Governing principle.** The session-init probe (`arc status --session-init`) is the latency budget *and*
the turn-count budget: every datum a dispatch decision needs is pre-resolved in one CLI pass, so
`arc-session` reaches the right prompt — or no prompt — in a single turn. The anti-pattern is `arc-session`
running its own `git fetch` / `worktree list` / meta-reads / PR calls across multiple turns before it can
present options. Hard constraint: **the common path (resume an existing local WU) must not get slower** —
heavy capabilities fire only in their triggering branch.

**Init-probe deltas:**

- **Worktree identity** in `worktree.value` (path, primary vs. non-primary) — cheap, always on (item 4).
- **`branch-gone`** as a distinct `worktree.value.state`, split from `remote-unavailable` (item 4).
- **Pre-computed roster** — identity-filtered in-flight WUs via WOR's cross-worktree meta cascade; feeds the
  branch-gone resolution cascade and the Step 7 dual-axis split. One local pass; fires in the
  branch-gone / no-WU branch.
- **Gated oracle + `STATUS.USER` regen — now In-Flight Awareness.** The materialize-discovery oracle
  (fires only when `active.resolution === "none"`) and the ceremony-triggered `STATUS.USER` render (oracle
  network slice gated to a subset of triggers, not every init) moved to In-Flight Awareness with the rest
  of the awareness layer. The probe is the shared surface both WUs extend; the gating *principle* (the
  common resume path pays zero oracle cost) is the governing constraint for both. Detail in
  `draft-in-flight-awareness.md` § Oracle gating + `STATUS.USER` regeneration.

**Impl fact (resolved 2026-05-24):** the probe *already* runs a bounded `git fetch origin <branch>`
(`lib/git/worktree-sync.ts`), so **branch-gone detection rides free** — it reinterprets the existing
fetch's outcome (upstream `gone`) rather than adding a fetch. (The eager-vs-lazy in-flight-view regen
fact moved to In-Flight Awareness with the oracle.)

**Handoff probe is light.** `session-handoff` needs no structural change — it delegates push/sync to
`arc sync` (so item 6's concurrent-push reconcile lands in the CLI), and the in-flight view has no handoff
regen-trigger. Only candidate change: surface worktree context in the Confirm-Handoff summary.

**Prompt-flow DX targets (spec-time).** Pin a scenario → target-turns table the probe must make achievable:
resume-clean → 0 prompts; resume-needs-sync → 1; cold-start (bare worktree) → 1; branch-gone → 1 *with
pre-computed candidates*; materialize → 1. Probe pre-computation is the mechanism that hits these.

### Lifecycle workflow impact (lifecycle round, 2026-05-23)

A systematic pass over the lifecycle workflows confirmed how the entry-point and worktree work touches
them. The *design* impact is captured here; the workflow rewrites are execution-time.

- **`init-work-unit`** gains a **worktree-creating mode**: Step 2's `git checkout -b plan/{name}`
  (which switches the current tree) becomes `git worktree add <templated-path> -b plan/{name}` when
  invoked via spawn, leaving the originating session in place and reporting the path. This is the
  concrete content of "spawn = thin wrapper over `init-work-unit`" (item 3) — the wrapper supplies
  worktree creation, init supplies branch + meta + push. The in-place mode survives for the
  single-worktree / atomic-launchpad case. (`init` itself stays planning-welded; the life-phase
  generalization is AWL's seam.)
- **`activate-work-unit`** is largely unaffected: the branch rename runs inside the WU's worktree and
  the worktree path stays (per the lifecycle-ceremony resolution in Open Questions); `arc user open`
  reappears defensively (benign idempotence, not a leak).
- **`integrate-work-unit`** adds a post-merge worktree-removal advisory after `arc user close`. Detail:
  a worktree cannot remove itself, so it is removed from another worktree (main) — which composes with
  the batched-archive note (archive runs in main, so the WU worktree is removable immediately
  post-merge). Origin-agnostic phrasing per Pressure Points § Cleanup ownership.
- **`deactivate-work-unit`** Case A-delete runs `git worktree remove <path>` **before** `git branch -D`
  (git refuses to delete a branch checked out in a worktree). Its Case Matrix's "Case B → `arc-shift`
  (future)" reference points at the *cut* state machine, not the surviving `arc-shift` — reconcile it in
  the phase-8 shift-state purge.
- **`session-handoff`** needs **no structural change**: it delegates push / sync to `arc sync`, whose
  matrix owns worktree + notes coherence and partial-push recovery — so item 6's concurrent-push
  reconcile lands in the CLI, not the workflow. It already uses per-WU SESSION-NOTES subdirs and works
  in any worktree. (Optional symmetry touch: surface worktree context in the Confirm Handoff summary, as
  session-init's orientation does.) The in-flight view needs no handoff regen-trigger — it regenerates
  on read at the next orient.
- **`session-init`** is the heavy touch and is already scoped: worktree detection + branch-gone
  (item 4), `arc-session` rename, Step 7 dual-axis split (Foundation), plus materialize discovery +
  in-flight-view regen-at-orient (In-Flight Awareness, layered on the same shared probe).
- **`archive-work-unit`** is worktree-neutral / low-risk — its sweep already lands on the WU branch
  before merge; not separately examined.

---

## Dependencies and Sequencing

### Upstream

- **Session-Init Optimization** (shipped): clean session-init substrate to extend.
- **Session-Operational Flow** (shipped): consumes the parallel-session
  concurrency model framing (Phase 1) for the spawn / resume entry-point semantics; consumes the metadata-state
  foundation (Phase 7) indirectly via `draft-agile-wu-lifecycle.md` for tier-aware archive ceremony
  forward-references. Surface-conflict avoidance on session-init workflow edits also applies.
- **Work Organization Reform** (shipped): delivers the per-worktree isolation foundation
  (single-branch-per-WU lifecycle, sweep-as-you-go integration, meta-file location-by-state
  convention, cross-worktree roster cascade). This WU's worktree-mechanism work assumes the
  isolation foundation; without WOR, worktrees inherit stale Planning-state meta files from main
  and isolation breaks structurally. Hard upstream dependency.

### Sibling (parallelizable)

[none active — User Sync UX Polish shipped before this WU activates]

### Downstream

- **In-Flight Awareness** (`draft-in-flight-awareness.md`): the awareness layer split out of this WU
  (2026-05-24) — the in-flight oracle, `STATUS.USER` view, `Priority` field, and materialize. Hard
  downstream: it builds on Foundation's worktree mechanics, cross-WU sync, and `arc-session` dispatch.
  Consumers needing the oracle / in-flight view (Concurrent Work Conventions's concurrency gate,
  roadmap-tooling, Coord Probe's PR-signal role) depend on **In-Flight Awareness**, not this WU.
- **arc-plan Conductor** (`draft-arc-plan-conductor.md`): canonical planning entry verb delegates to
  this WU's spawn primitive (consumer, not design-coupled). Sequencing inversion 2026-05-20:
  Conductor previously held the spawn invocation contract; spawn now ships here as a standalone
  callable primitive and Conductor wires its entry verb to it.
- **CLI Substrate Adoption** (`draft-cli-substrate-adoption.md`): this WU's hand-rolled
  `git worktree list --porcelain` parsers (3 sites), branch-gone cascade evidence discriminated
  union, cold-start spec input parser, and cross-WU note payload validation become migration
  targets for CSA's broader zod/execa sweep. Migration targets, not consumer-design-coupled.
- **Coord Probe** (`draft-coord-probe.md`): this WU's branch-gone cascade invokes coord-probe as one
  signal source. Loose coupling — cascade ships with hand-rolled fallback (meta-file walk +
  remote-recency only), coord-probe wires in later when it lands.
- **Agile WU Lifecycle** (`draft-agile-wu-lifecycle.md`): consumes clean activate/integrate workflows
  post-pointer-field retirement; the tier model's `arc start` command operates on the worktree-aware
  activation substrate.
- **Concurrent Work Conventions** (`draft-concurrent-work-conventions.md`): consumes the mechanism layer
  entirely; its concurrency *gate* consumes In-Flight Awareness's oracle (not this WU's directly).
- **ARC Operating Modes (Local mode):** the shift lifecycle dissolved (see
  `cohort-agile-parallelism.md`); no longer a prerequisite handoff. Any residual shift-*state*
  semantics, if needed, are a Local-mode concern (single working tree, no worktree-as-parking), not a
  WF deliverable.

### Recommended sequencing

Session-Operational Flow → Interlock Release Wrappers (WU1 + WU2) → Work Organization Reform →
**Worktree Foundation** → **In-Flight Awareness** (‖ arc-plan Conductor / CLI Substrate Adoption /
Coord Probe — these need only Foundation; pick parallel pairs at activation time per file-scope disjoint
and cognitive-load match; CWC + roadmap-tooling additionally need In-Flight Awareness) →
Agile WU Lifecycle → Concurrent Work Conventions.

---

## Pressure Points and Risks

### SESSION-NOTES divergence per worktree (resolved upstream by WOR R65)

The earlier framing of this as an open spec question is resolved upstream by Work Organization Reform's
user/ directory structural reform (R65). SESSION-NOTES lives at
`user/{identity}/<wu-name>/SESSION-NOTES.md` — explicit WU-scoping at the path level. Concurrent
worktrees have non-colliding paths; the WU-subdir-aware load logic (scope item 6) skips older notes'
subdirs that don't match the current WU. The cross-WU persistent-context tension (a cross-WU section
embedded in a per-WU file) is resolved by extracting it to a separate
`user/{identity}/WORKING-MEMORY.md` in the cross-WU class.

This WU's responsibility: implement the mechanism (scope item 6). The structural reform — file
relocations, strategy + workflow updates, in-flight migration — ships in WOR; mechanism layers on top
of resolved structure.

### Inbox sync semantics

Cross-WU file merge in `arc user load` introduces per-file sync behavior (WU-scoped vs cross-WU).
Requires either a convention for declaring which files are which, or a hardcoded allowlist. Small
design decision but real — affects future files in the `user/{identity}/` directory.

### Orphan-warning signal-to-noise under routine retirement

Today's `runUserLoad` orphan path in `commands/user/save-load.ts` preserves any local file absent
from the incoming manifest to `.internal/<backup>.json` and emits a `Local file "X" not in saved
manifest` warning. Behavior is correct (never silently destroy local content); messaging treats
every orphan as equally unexpected. Under R65 + scope item 6's per-WU subdir load, routine WU
integration retirement on one machine surfaces as N orphan warnings on every other machine still
carrying the retired subdir from a prior sync. With concurrent worktrees (this WU introduces them)
this becomes the routine cross-machine case rather than the exception; today's flat-warning shape
creates alert fatigue. Surfaced concretely during WOR Task 6.3.a (per-user `ATOMIC-INBOX.md` →
`USER-INBOX.md` rename) — the same pattern at file scale.

Tiered improvements available (spec-time scope decision; the underlying preserve-to-`.internal/`
behavior is correct and stays unchanged across all tiers — only surfacing changes):

- **T1 — Content-equivalence rename detection.** When a local orphan's content matches a different
  name in the incoming manifest, surface as "Looks like rename X → Y" rather than generic
  "not in saved manifest." Single-file case; matches the 6.3.a pattern.
- **T2 — Subdir-grouped retirement messaging.** When orphans cluster under a path prefix absent
  from the manifest's directory structure entirely (the routine R65 case post-integration), one
  informational line plus cleanup hint (`rm -rf .arc/user/{id}/<wu>/`) replaces N warnings.
  Highest signal-to-noise win for WF-driven cases.
- **T3 — Sync-state-aware drift detection.** Extend `.internal/.sync-state.json` with the prior
  file-list so the warning can distinguish "intentional retirement at source" (file was in the last
  sync's manifest, now absent) from "real local drift, possibly unsaved work" (file appeared after
  last sync). Only the latter warrants alarm; the former is informational at most.

**Scope resolved (2026-05-24): WF ships T1 + T2; T3 routes to `cross-machine-sync-coherence`.** T3
extends `.internal/.sync-state.json` — the same file and the same "is my local sync-state coherent with
reality / detect drift" question that the coherence WU's § Scope of the Concern already claims as its
broader-scope surface. WF establishes the `.sync-state.json` schema seam (already owed to that WU — see
§ Cross-machine resume seam); the coherence WU layers T3's drift-detection on top. T1 (content-equivalence
rename) + T2 (subdir-grouped retirement messaging) stay in WF as the highest-signal WF-driven wins.

Composes with scope item 6's path-driven class dispatch — class awareness ("per-WU subdir retired"
vs "cross-WU file changed") informs which tier applies and what cleanup hint to suggest.

### Cross-machine resume seam (what the cohort closes, what it owes the coherence WU)

Resuming a WU created today on machine A from machine B decomposes into **discovery** (B learns the WU
exists), **materialization** (B gets a local worktree), **notes** (B gets the right SESSION-NOTES), and
**coherence** (B can trust the handoff landed). The agile-parallelism cohort closes the first three, now
split across two WUs: discovery via the oracle / in-flight view and materialization are **In-Flight
Awareness**'s (the oracle reads remote-only in-flight WUs off refs via `git show`, no checkout; materialize
checks out + orients); **notes** is **this WU**'s (item 6's per-WU subdir load). **Coherence is neither's**
— a silent partial push (branch pushed, notes push failed) leaves B reading stale notes, and that trust
signal is `cross-machine-sync-coherence`'s charter (downstream, depends on both).

WF owes that WU two forward-compat seams, to leave deliberately rather than incidentally:

- **Schema seam.** Item 6 touches `.internal/.sync-state.json` and establishes the per-WU sync class;
  design both so the coherence WU's remote-marker layers on without a rewrite — leave the seam, do not
  design the marker.
- **Surface-area note.** Item 6's concurrent-worktree notes-push *widens* the partial-push surface
  (multiple worktrees may push the notes ref), so WF does not merely inherit the coherence gap — it
  enlarges it, which is why the downstream WU is genuinely necessary. Examine the two plans together
  before either advances to spec; `draft-cross-machine-sync-coherence.md` predates WOR R65 and this WU
  and needs a worktree-aware refresh.

### Cleanup ownership for externally-spawned worktrees

When ARC spawns a worktree (item 3), `integrate-work-unit.md` surfaces an advisory cleanup step
(worktree removal recommendation post-merge). When an external worktree-management tool spawns the
worktree, cleanup is the tool's responsibility — most tools surveyed handle it (Worktrunk's
`wt remove` with safety gates; emdash's stale-detection auto-cleanup at session start; Conductor's
archive pattern), but some defer to the user entirely.

**Resolved (2026-05-24): a self-cleaning, worktree-local ownership marker gates an *executable* cleanup
— not just an advisory.** At spawn (and cold-start when ARC scaffolds), ARC writes a small gitignored,
identity-agnostic marker into the worktree (e.g. `.arc/.worktree-marker.json`:
`{ spawnedByArc, wuName, spawningIdentity, createdAt }`). It is **self-cleaning** — it lives in the
worktree's tree, so `git worktree remove` deletes it; it cannot go stale. That matters because this WU is
already fighting stale-state reconciliation in several places (orphan warnings, retired-subdir,
branch-gone) and must not add a reconciled registry. A central registry in main (staleness + concurrency)
and git's per-worktree config (`extensions.worktreeConfig` is an invasive repo-global migration in an
adopter's repo) were both rejected for that reason; location-template inference is too fuzzy (the path is
deliberately incidental). At `integrate-work-unit` (run from main — a worktree cannot remove itself), the
marker flips *advise* into *offer-to-execute*: **marker present + worktree clean** → interlock-gated
offer to `git worktree remove`; **marker present + uncommitted/unpushed** → never auto-remove, surface the
dirty state (no `--force` without explicit instruction); **no marker** → advisory only ("looks
externally-managed; your tool likely handles cleanup, or `git worktree remove <path>` manually"). Absence
⇒ external ⇒ advise is the safe default — ARC auto-acts only where it is certain it owns the worktree. The
clean-+-merged safety guard is mandatory regardless of placement; the marker is purely the ownership
signal. **Note:** this upgrades the draft's earlier "cleanup is advisory, not automated" stance to
interlock-gated execution — a deliberate change (a lifecycle-ceremony action, not the rejected generic
`arc worktree` wrapper). Remaining spec detail: the exact filename + `.gitignore` entry.

### Discoverability of the cold-start primitive

Item 11's cold-start primitive is the entry point for tool-spawned worktrees, but adopters need to
know to invoke it. Two surfaces with different audiences:

- **User-side** — strategy docs + docs site cover "in any worktree, invoke the cold-start primitive
  to start your ARC session." Covers adopters new to ARC and adopters new to a project. Not an
  ARC-mechanism concern; documentation handles it.
- **Agent-side** — once the user invokes `/arc-session` (or equivalent), the agent needs to know
  the cold-start branch is an option when no active WU is found in the worktree. Lives within ARC's
  own session-init reads (`AGENT-BRIEF.ARC.md`, `arc-session` skill content). ARC concerns stay
  within ARC's namespace.

No `arc update`-injected modifications to harness files (CLAUDE.md / AGENTS.md). The skill-discovery
surface (harness reading `.claude/skills/` etc.) provides the underlying primitive availability;
ARC's session-init reads explain when to use it.

---

## Open Questions

### In-flight definition — resolved (location-based, shared predicate)

**Resolved 2026-05-24.** In-flight is defined by **location, not the `State` enum**: a WU in `active/**` is
in flight; a stub in `backlog/planned/**` is not. `State: Planning` is overloaded — worn by both an
actively-planned WU (in `active/`, on a live `plan/` branch) and a parked backlog stub (`Branch: [none]`) —
so the predicate cannot key on `State` alone. Under WOR's location-by-state + single-branch-per-WU model,
`active/` only ever holds `{Planning, Active, Integrating}` (Shipped WUs leave for `completed/`), so **In
Flight = lives in `active/**`** ≡ `State ∈ {Planning, Active, Integrating}` *with the location guard*. The
oracle's remote view maps 1:1: **In Flight = an unmerged WU branch exists on the remote** (`plan/` or a
type-prefix; backlog stubs carry no branch, so the oracle never sees them). The local `active/**` walk and
the remote-ref scan yield the same in-flight set (modulo sync lag) — a consistency invariant the spec states.

This corrects the original framing (`In Flight = State: Active | Integrating`), which rendered an
actively-planned WU as **Ready** — indistinguishable from a never-started stub — and, via the same
predicate, omitted it from `STATUS.USER`, gutting the worklist (a worklist must show what you are working
*now*, including planning).

**Sub-questions resolved:**

- **Shared predicate** across project and user views — `STATUS.USER` stays a *filtered mode* of the one
  source (in-flight rows where `Owner = me`), not a second generator.
- **Single In-Flight bucket + a per-row `State` annotation** (not sub-tiers). `State` now varies meaningfully
  within In-Flight (Planning = plan mutating → CWC's concurrency gate; Active = executing), so it renders as
  a column on In-Flight rows in both views — omitted on Ready/Blocked, where it is constant (see In-Flight
  Awareness's render standard).

**Execution consequence (phase 8 shipped-doc drift-fix — now a *semantic* change, not a relabel):**

- § ROADMAP **step 4** redefines In Flight as location-based and scopes Ready/Blocked to
  `backlog/planned/**`; the `active/ ⟹ State: Active` activation framing (contradicted by the lived
  full-protection model — a `Planning` WU lives in `active/`) is corrected to `active/ ⟹ in flight`.
- **Regen fire-point shifts earlier.** A WU enters In Flight when it lands in `active/**` (born there, or
  graduated `backlog → active` at planning-kickoff) — *not* at activation, which becomes a `State`-annotation
  change within In-Flight. The kickoff path needs a regen trigger; partly wired in `init-work-unit` (WOR),
  partly deferred to arc-plan Conductor — interim is hand-regen under the existing manual-discipline category.
- The § Work Unit State enum table still lists the pre-WOR `In Progress` (→ `Active`) alongside the cut
  `Paused` / `Waiting-For` rows already targeted by phase 8; reconcile all three against `template-meta.md`'s
  4-state machine in one pass.

### Worktree lifecycle ceremony — resolved (one spec detail remains)

**Resolved:** worktree creation lives in the WU verbs (spawn / `arc start`, cold-start, materialize),
removal-after-merge is an advisory step in `integrate-work-unit.md`, and stale-worktree detection (branch
merged, worktree lingers) is a session-init surface. No `arc worktree` CLI. The **worktree path is a
creation-time artifact, decoupled from branch renames** — `worktree.location_template` (item 10) governs
*creation only*; an Active→Planning demotion (`feat/x` → `plan/x`) leaves the worktree path as-is rather
than chasing the branch name. Lowest-mechanism answer, matches how git treats the path (incidental), and
composes with externally-created worktrees (which ARC never relocates).

**Spec detail:** deactivate-work-unit's worktree-cleanup addendum — Case A-delete removes the worktree
before `git branch -D`; Case A (return to Planning) leaves the decoupled path in place (no rename, no
respawn).

### Worktree detection depth — retired

Answered by scope decisions made since it was written: floor = session-init detection + branch-gone
(item 4); config-awareness = item 10's two methods; CLI subcommand = cut (Out of scope); worktree-aware
hooks = deferred to a hooks-completeness pass. No live decision remains.

### Errand cheap-branch seam + the concurrency oracle — resolved

Worktree Foundation is the mechanism behind the Errand work class (ADR-021). Both seams resolve:

- **Cheap-branch floor = the floor (build nothing Errand-specific).** An Errand has no meta by
  definition, so it never touches the spawn primitive. It rides bare git — `git worktree add` (or the
  main launchpad) + a `chore/`-type branch off `main`, the lighter merge gate, teardown. WF's deliverable
  here is *documenting that path*, not a spawn "Errand mode."
- **Oracle = build the data-primitive, defer the dashboards and policies.** The in-flight detection
  primitive (remote refs + open PRs, path / content-based; refs-only when no coord adapter) is built by
  **In-Flight Awareness** (split out of this WU 2026-05-24), which consumes it for the advisory concurrency
  check; the *rendered view* defers to `roadmap-tooling` and the *gate doctrine* to Concurrent Work
  Conventions. Since ADR-021 is Proposed and ratifies at the cohort PRDs, the **cheap-branch floor ratifies
  in this WU's (Foundation's) spec and the oracle in In-Flight Awareness's** — each should state which
  ADR-021 claims it validates so the promotion path is trackable. See `cohort-agile-parallelism.md`.

### Cross-WU ephemeral-context model: scope tier + tombstone GC — resolved (2026-05-24, post-research)

External research (idiomatic deletion-propagation / GC + ephemeral-context governance) plus a planning
round settled two coupled questions:

- **No project-scoped *ephemeral* tier.** Item 6's cross-WU sync stays user-scoped only; the path-class
  taxonomy needs no project-scope class (no seam). Research confirmed the pattern across multi-agent
  frameworks, engineering teams, and local-first tools: "shared ephemeral" reliably collapses into
  ceremony (review it → people stop using it for transient content; don't → the team stops trusting it),
  so a low-ceremony shared tier is a known trap. It is also principle-aligned — a surface loaded at
  everyone's session-init spends everyone's attention budget without consent, which the
  attention-as-design-primitive thesis exists to protect. Duplicating broadly-applicable interim notes
  across individuals is the accepted, cheap cost.
- **Tombstone GC** = generous fixed TTL filtered at merge (see item 6) — the GC half of the same
  ephemeral-context design area.

**Sharpening routed out of WF (not WF scope).** The research's own taxonomy implies our *current*
WORKING-MEMORY entries are largely *project interim-doctrine* ("use X until WU-Y ships") miscategorized as
personal scaffolding — that class arguably belongs in a tracked, reviewed, **init-loaded** surface with
explicit removal triggers (for ARC the init-loaded home is a demarcated interim section of
`AGENT-BRIEF.PROJECT` / `DEV-RULES.PROJECT`, *not* a generic CONTRIBUTING the agent never reads), while
only truly-personal scaffolding stays user-scoped. Near-moot solo, real in team mode; it is a
content-surface-routing question, routed to `documentation-surface-routing`. **Design constraint carried
with it:** any removal-trigger-bearing surface needs a *paired evaluation cadence* or it rots — for a
tracked interim surface that cadence is a review-time discipline, distinct from the user-scoped
handoff / probe sweep (see `handoff-optimization` item 3).

---

## Scope Estimate

**Medium.** The shift-state machine and `/arc-status` are cut, and the awareness layer (oracle + view +
`Priority` + materialize) split out to In-Flight Awareness (2026-05-24), leaving this WU at its mechanics
core. Worktree-aware session-init, the cross-WU sync mechanism, the spawn / cold-start primitives, and the
thin in-session shift are the real implementation work.

Phases (provisional):

1. **Worktree-awareness phase** — session-init worktree detection + branch-gone cascade,
   `integrate-work-unit.md` cleanup advisory.
2. **Entry-point phase** — tier-agnostic spawn (the worktree-creating mode of `init-work-unit`),
   cold-start (incl. named-branch-no-meta recognition), materialize (discovery-led pick-up of a remote
   WU), the activation-time concurrency check, auto-mode boundary.
3. **In-session shift phase** — the thin `arc-shift` skill, uncommitted-work handling,
   resume-staleness advisory.
4. **Main-on-main pattern documentation** — strategy doc + workflow guidance. Lightweight; mostly prose.
5. **Cross-WU sync phase** — `arc user save/load` path-driven dispatch, per-WU subdir load, cross-WU
   merge, tombstones, concurrent-push reconcile, retired-subdir reconciliation.
6. **[moved to In-Flight Awareness]** — the oracle + `STATUS.USER` view + `Priority` + materialize phase
   split out (2026-05-24). Foundation retains only the degrading advisory stub of the activation-time
   concurrency check (phase 2).
7. **Worktree conventions** — branch-naming method + location template (substrate for phases 2-3).
8. **Retirements + shipped-doc drift-fix** — retire the `atomic-*` companion file type and reroute its
   capture path (item 14); remove the cut shift-state-machine rows (`Paused` / `Waiting-For`, labeled
   "future arc-shift") from `strategy-work-organization.md` and reconcile its state table with
   `template-meta.md`; reconcile `deactivate-work-unit.md`'s Case Matrix "arc-shift (future)" reference.
   Also reconcile § ROADMAP's In-Flight definition (step 4) and its `active/ ⟹ Active` activation framing
   per the resolved in-flight-definition open question (see § Open Questions).
   Frees "shift" for `arc-shift` (item 2).
9. **Documentation / tests / examples** — standard closing phase.

Phases 1-2 relatively independent; phase 3 builds on phase 2; phases 4-8 independent.

---

## External Research Citations

Sources informing WF's design. Interim retention — spec graduation trims to load-bearing references.

### Worktree-management tool landscape (2024-2026)

- `research-worktree-tool-convergence.md` — convergence pass across 11 agentic worktree-management
  tools surveyed 2026-05-12 (Cluster 1: Zed, Warp, Worktrunk; Cluster 2: Conductor, emdash, Maestro;
  Cluster 3: Super, Superset, T3code, Soloterm, Nora). Substantive findings shaping WF: only
  Worktrunk exposes extension hooks (§ 4.3), so ARC's cold-start primitive must work without per-tool
  integration; every tool invented its own spec-input mechanism (§ 3.7), so ARC's Origin ⊥ Spec
  orthogonality is the natural answer; tools converge on user-provided branch naming with no
  Conventional Branch enforcement (§ 4.1); tools diverge fully on worktree location with no field
  default to align with (§ 4.2); 8 of 9 dedicated tools use native git worktrees on local filesystem
  with no virtualization (§ 3.1, § 3.6), so ARC's reads work uniformly. Per-tool reports and source
  URLs captured in the research doc.

### Worktree-by-default vs sequential-by-default (existing reference)

The 2026-04-28 external research on mature git practice (cited in Design Decisions §
"Worktree-by-default at quick/standard tier") established the baseline ARC's default diverges from.
Specific URLs captured in the design-decisions section above.

---

[team-coord]: ../reference/strategies/arc/strategy-team-coordination.md
[session-init]: ../system/workflows/arc/session-lifecycle/session-init.md
