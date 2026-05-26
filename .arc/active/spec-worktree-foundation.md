# PRD: Worktree Foundation

- **Origin:** [internal]

- **Purpose:** Land the worktree-mechanics layer for parallel and mobile work — the WU entry primitives
  (spawn, cold-start) and the `arc-session` entry skill, the in-session `arc-shift`, worktree-aware
  session-init with branch-gone recovery, and cross-WU file sync — as mechanism only; usage conventions
  land downstream.

---

## Introduction

ARC has no awareness of git worktrees. The framework operates correctly inside one — most behavior
generalizes naturally via branch-based disambiguation — but nothing surfaces worktree context, and several
mechanisms silently assume one-working-tree-per-repo: session-init reports a branch but never which physical
worktree it is in; gitignored personal state (`SESSION-NOTES`) and cross-WU files diverge per worktree;
the activate / integrate / deactivate ceremonies make no provision for worktree creation or removal; and no
strategy doc describes how worktrees fit ARC's work-unit model.

The cost is concrete. ROADMAP advertises "parallelizable" sibling WUs, but ARC ships no parallelism
infrastructure for solo work — team mode is today the only path to genuine concurrency. A real recovery gap
surfaced during this cohort's own planning: a planning branch integrated on machine A left machine B opening
on a now-pruned local branch, where session-init reported `remote-unavailable / failureReason: error` —
masking a clean upstream prune as a network failure, with no signal that recovery was needed or what shape it
should take.

**Why now.** Work Organization Reform (shipped) delivered the per-worktree isolation substrate —
single-branch-per-WU lifecycle, location-by-state meta convention, the cross-worktree roster cascade. That
substrate is the hard prerequisite worktree mechanics were implicitly assuming but not delivering. With it
in place, Worktree Foundation makes per-WU-per-worktree isolation a first-class capability and unblocks the
rest of the agile-parallelism cohort (In-Flight Awareness, Agile WU Lifecycle, Concurrent Work Conventions),
each of which consumes Foundation's mechanics from a clean substrate.

This is the worktree-**mechanics** layer only. The awareness layer (the in-flight oracle, `STATUS.USER`
view, `Priority` field, and materialize) split out to In-Flight Awareness on 2026-05-24; usage conventions
(when to parallelize, focus roles, async-merge audit) belong to Concurrent Work Conventions; the tier model
and `arc start` belong to Agile WU Lifecycle.

## Goals

- Make per-WU-per-worktree isolation a first-class, mechanism-level capability for solo work — not a
  team-mode-only affordance.
- Give a session a coherent set of entry primitives (spawn a new WU's worktree; cold-start a WU inside an
  existing worktree; shift the current session to another in-flight worktree) behind two user-facing verbs
  plus the shift, all built on WOR's isolation substrate.
- Make session-init worktree-aware and turn the silent `remote-unavailable` branch-gone failure into a
  recoverable, candidate-bearing state with a single-turn recovery prompt.
- Resolve cross-WU file divergence across concurrent worktrees with path-driven sync that needs no allowlist
  or in-band class declaration.
- Compose cleanly with externally-created worktrees (manual `git worktree add` or an external
  worktree-management tool) without orchestrating, relocating, or refusing them.
- Keep the common path — resume an existing local WU — no slower: heavy capabilities fire only in their
  triggering branch, and every dispatch datum is pre-resolved in the single session-init probe pass.
- Leave the framework self-consistent at ship: retire what the worktree model and the Errand class obsolete
  (the `atomic-*` companion, the pause-pointer mechanic) and fix shipped-doc drift the cohort's resolved
  decisions create.

## Use Cases / System Scenarios

The entry operations form a 2×2 over *does a local worktree exist?* × *does the WU (branch + meta) already
exist?*. Foundation implements three of the four cells; **materialize** (existing remote WU, not checked out
here) is In-Flight Awareness's:

|                           | **WU exists** (branch + meta) | **WU is new** (nothing yet)         |
| ------------------------- | ----------------------------- | ----------------------------------- |
| **Local worktree exists** | resume — `arc-session`        | cold-start — scaffold meta in place |
| **No local worktree**     | materialize                   | spawn — create worktree + scaffold  |

Representative scenarios the mechanics must serve:

1. **Resume (clean).** Operator runs `arc-session` in an existing WU worktree; session-init detects the
   local meta, orients, and reaches the next action with **zero** prompts.
2. **Spawn a parallel WU.** From an existing session, the operator spawns a new WU; ARC creates its branch,
   worktree, meta, and empty SESSION-NOTES, reports the new path, and returns the originating session to its
   own context — no stash-switch, no disruption to in-flight state.
3. **Cold-start in a tool-spawned worktree.** Operator lands in a bare worktree created by an external tool
   (no meta); `arc-session` detects "no WU here" and offers to scaffold a meta in place from a supplied spec
   input (file / URL / issue / name + description) — **one** prompt.
4. **Branch-gone recovery.** Machine B opens on a branch whose upstream was pruned after integration on
   machine A; session-init surfaces a dedicated `branch-gone` state with pre-computed recovery candidates and
   resolves in **one** prompt.
5. **In-session shift.** Mid-task, the operator needs a short detour into another in-flight worktree without
   losing accumulated agent context; `/arc-shift` repoints the session to a chosen existing worktree.
6. **Cross-machine resume of notes.** A WU worked on machine A resumes on machine B with the correct
   per-WU SESSION-NOTES restored, and without older WUs' notes or retired-WU subdirs bleeding in.
7. **Atomic / Errand work.** A quick standalone fix runs from the main worktree on a short-lived branch off
   `main`, ships via the lighter gate, and tears down — never pausing or disrupting an in-flight WU's
   worktree.

## Requirements

Priorities: **P0** required for completeness; **P1** important, deferrable under pressure; **P2** valuable if
it falls out cheaply.

### A. Worktree-aware session-init and branch-gone recovery

- **R1 [P0]** — Session-init detects worktree context via `git rev-parse` and surfaces it in orientation
  when the session is in a non-primary worktree (e.g. `worktree: ../arc-wu-b`). Cheap, always on.
- **R2 [P0]** — Introduce `branch-gone` as a distinct `worktree.value.state`, split from
  `remote-unavailable`. It **classifies the failure of the bounded `git fetch origin <branch>` the probe
  already runs**: when the upstream branch is deleted, that fetch fails ("couldn't find remote ref", exit 128),
  and `boundedFetch` surfaces that failure kind (rather than discarding it) and classifies it as `branch-gone`,
  distinct from timeout / network / auth `error`. No added fetch — detection rides the existing one.
- **R3 [P0]** — On `branch-gone`, run a resolution cascade: `git worktree list` (other active worktrees) →
  per-worktree meta reads via WOR's cross-worktree roster cascade (active WU branches by `**Branch:**`,
  identity-filtered by `(@identity)` in team mode) → recently-active remote branches within an internal recency
  window (a fixed Foundation default; the configurable `coord.recency_days` key is Coord Probe's to add, not
  Foundation's) → coord-probe (when available) → fall back to `main` with explicit confirmation.
  Per-worktree action varies (stranded in main / admin worktree → propose switch; stranded in a WU worktree
  whose branch merged externally → propose worktree removal + meta archival, gating offer-to-execute vs.
  advisory via the R29 marker contract). **Detect-stop-prompt is the
  default for ambiguity:** when no high-confidence single signal emerges, stop and surface candidates rather
  than guess.
- **R4 [P0]** — Under `branch-gone`, align git state (fetch → resolve target via cascade → switch) **before**
  the steps that read against the working branch — the personal-notes pull and the context-load. Because the
  switch changes the checked-out branch, recovery runs as an early gating action right after detection
  (re-probing afterward so the sync and load steps see the recovered branch), not as a late orientation render.
  Notes or metas/companions read against the deleted branch surface work that does not exist on the recovered
  branch.
- **R5 [P0]** — Refactor session-init Step 7's single trust hierarchy (git > task list > status > notes)
  into two axes: *truth of work state* (git authoritative — narrowed to "was this actually committed?") and
  *which work am I picking up* (identity-filtered metas + worktree list authoritative). Redistribute the
  existing mismatch examples to the appropriate axis. Notes stay deliberately absent from the branch-gone
  cascade — they answer the context question, not the roster question.
- **R6 [P0]** — The probe pre-computes an identity-filtered in-flight roster (via WOR's cross-worktree meta
  cascade) in one local pass, fired only in the branch-gone / no-WU branch. It feeds R3's cascade and R5's
  dual-axis split.
- **R7 [P0]** — Forward compatibility: the branch-gone cascade ships value pre-worktree-adoption. With one
  worktree it trivializes (`git worktree list` → one entry; identity filter → one match; notes-pull
  confirms). Shipping is not gated on worktree adoption — today's single-WU multi-machine recovery is the
  simplest instance of the same mechanism.

### B. Entry-point primitives and the `arc-session` skill

- **R8 [P0]** — **Spawn.** A one-shot operation, invoked from an existing session, that creates a new WU's
  branch, worktree, meta file, and empty SESSION-NOTES (optionally seeded with a one-line breadcrumb to the
  spawning context), reports the new worktree path, and returns to the originating session's context. Built
  as a **thin wrapper over `init-work-unit`'s worktree-creating mode** (`git worktree add <templated-path>
  -b plan/{name}` replacing the in-place `git checkout -b`). Ships **tier-agnostic** (always a worktree +
  Planning-state meta); accepts a forward-compat `--tier` / `--type` it does **not** yet branch on (AWL's
  seam). **Never fires under auto-cascade** — always an explicit user act.
- **R9 [P0]** — **Cold-start.** Scaffold a meta in an existing worktree that has none (manually `git worktree
  add`-ed, or spawned by an external tool). Takes any spec input — file pointer, URL, issue link, existing
  plan-doc, or a name plus brief description — and honors WOR's Origin ⊥ Design orthogonality (external
  references → `**Origin:**`; ARC-owned artifacts → `**Design:**`). Honors R23/R24 conventions when ARC
  creates state (warn-only on external mismatch). Implemented as a **shared CLI-level scaffolding primitive**
  invoked from both `arc-session` (discovery, on finding a bare worktree) and `arc start` (deliberate
  create-in-place), so each surface stays thin.
- **R10 [P0]** — **`arc-session` skill** (rename from `arc-resume`). The session-*entry* surface: it
  inspects worktree state and **dispatches** — *resume* (local meta present) or *cold-start* (bare worktree,
  offered, never auto-scaffolded). The *materialize* dispatch branch is In-Flight Awareness's, but the
  dispatch seam must exist here. Arg-free / discovery-led by default; one sanctioned optional arg
  `/arc-session <pointer-or-blurb>` may pre-seed cold-start, confirmed before use.
- **R11 [P0]** — **Activation-time concurrency check (degrading advisory stub).** Before creating a worktree,
  the spawning (or cold-starting) session reads in-flight WUs via `git worktree list` plus identity-filtered
  meta reads and assesses scope overlap with general agent judgment over `**Purpose:**` / spec text. It
  surfaces concerns ("WU-X is in flight in `../arc-wu-x` and touches the same module — parallel, or sequence
  after it integrates?") but **does not gate**. No probe tooling, no `**Touches:**` field. Degrades to no-op
  when nothing else is in flight. Foundation ships only this stub; In-Flight Awareness upgrades it to the
  oracle-backed version. Fires identically from spawn and cold-start.
- **R12 [P0]** — **Errand cheap-branch path.** Document the Errand-class path: an Errand (per ADR-021) has no
  meta and never touches the spawn primitive — it launches from the **main worktree** (the atomic launchpad)
  on a short-lived branch off `main`, ships via the lighter gate, and tears down. Foundation's deliverable is
  *documenting that path* and ratifying ADR-021's cheap-branch floor — not building an "Errand mode" on
  spawn. The launch ergonomics (the `errand-launch` primitive, the Errand decision matrix, the advisory
  foreign-artifact gate) are **Errand Enablement's** (sequenced WF → Errand Enablement → IFA), not
  Foundation's.

### C. In-session shift (`arc-shift`)

- **R13 [P0]** — **`/arc-shift` skill** — a thin skill that repoints the current session to another
  **existing** in-flight worktree, preserving the agent's accumulated context. **Narrow scope:** the one
  irreducible use is interactive cross-worktree *investigation* — operating in another worktree's runnable
  environment while reasoning with the current session's live, expensive-to-reconstruct context. It is
  **not** the general sidequest tool — discovered side work is an Errand (`errand-launch`, owned by Errand
  Enablement); a discrete question about another worktree is answered by reading its files or seeding an
  exploration session; creating a worktree for a new WU is spawn (R8). Target selection is discovery-led
  (pick from `git worktree list`), with an optional arg per the args posture.
- **R14 [P0]** — **Uncommitted-work handling at the shift.** Before switching, detect uncommitted changes and
  offer commit (recommended) / stash / leave-as-is; the operator chooses.
- **R15 [P2]** — **Resume-staleness advisory.** Arriving in a long-idle worktree surfaces a dismissible
  "assumptions may be stale — re-read the spec" nudge past a fixed threshold.

### D. Cross-WU file sync

Layers mechanism over WOR's `user/` structure (per-WU class at `user/{identity}/<wu-name>/**`; cross-WU class
flat at `user/{identity}/**`; `user/{identity}/.internal/**` never synced).

- **R16 [P0]** — **Path-driven dispatch.** `arc user save/load` infers sync class from path structure. No
  allowlist file, no in-band class declaration — path is the convention.
- **R17 [P0]** — **Per-WU subdir load.** Restore from the most recent reachable note containing the current
  WU's subdir; older notes' subdirs for different WU names skip. Resolves the spawn → first-load overwrite
  case (a fresh worktree's load does not pick up the prior WU's SESSION-NOTES from main's ancestor walk).
- **R18 [P0]** — **Cross-WU file merge.** Read the N most-recent notes ref-wide and merge file contents via
  value-level list-union of each file's entries, deduped by per-file entry identity: `WORKING-MEMORY` by its
  bold-field entry header (`**...:**`) under `## Memories`; `USER-INBOX` by list-item lead-in within each
  `## Atomic` / `## Backlog` section (section boundaries preserved).
- **R19 [P0]** — **Tombstones for cross-WU deletions.** Entry removal writes a `## Removed: {name}` marker
  with timestamp; merge respects the most recent tombstone over earlier inclusion. GC = a **generous fixed
  TTL filtered at merge time** (default ~90 days from the marker timestamp): tombstones past the window stop
  propagating and drop. The contract is the *mechanism* (time-based TTL, filter-at-merge), not the constant.
  No user-facing "sync within N days" guarantee — the failure mode (re-deleting a note, not data loss) keeps
  the TTL an internal cleanup detail.
- **R20 [P0]** — **Concurrent push reconcile** on `refs/notes/arc/user/{identity}`. When parallel worktrees
  push and the second hits non-fast-forward, reconcile via `git notes merge` (cat_sort_uniq default); surface
  to the user when the conflict is non-trivial.
- **R21 [P0]** — **Retired-subdir reconciliation.** `arc user load` / `pull` / session-init reconciles
  retired-WU subdirs that linger after a WU shipped on another machine: local subdir present + absent from
  recent notes + WU shipped → offer or auto-close with `.internal/` backup (or a session-init stale-subdir
  sweep).
- **R22 [P0]** — **Orphan-warning T2 (subdir-grouped retirement messaging).** When orphans cluster under a
  path prefix entirely absent from the incoming manifest (the routine post-integration case), replace N
  warnings with one informational line plus a cleanup hint. The underlying preserve-to-`.internal/` behavior
  is unchanged — only surfacing changes.
- **R23 [P1]** — **Orphan-warning T1 (content-equivalence rename detection).** When a local orphan's content
  matches a different name in the incoming manifest, surface as "Looks like rename X → Y" rather than generic
  "not in saved manifest."
- **R24 [P0]** — **Coherence-WU forward-compat seams (concrete).** Item D touches `.internal/.sync-state.json`
  and establishes the per-WU sync class. Leave a *concrete* seam so `cross-machine-sync-coherence`'s remote
  partial-push marker and T3 drift-detection layer on without a rewrite — **leave the seam, do not build the
  marker**: (i) **bump** the `.sync-state.json` schema `version` field (the existing field, `3` → `4`); (ii) keep its shape
  **worktree-aware** — do not bake in a single (main-worktree) HEAD assumption, since Foundation makes
  concurrent worktrees real and partial-push state is per-worktree; (iii) reserve extension points for a
  `priorFileList` (T3's drift signal, routed downstream) and remote-marker provenance, without implementing
  either. Record that concurrent-worktree notes-push *widens* the partial-push surface — so the downstream WU
  is genuinely necessary, not merely inherited. **Sequencing:** `cross-machine-sync-coherence` is planned
  after Foundation and therefore designs-for-worktrees from the start; its draft predates WOR R65 and this WU
  and gets a worktree-aware refresh at its own promotion. Foundation is not blocked on it.

### E. Worktree conventions

- **R25 [P0]** — **Worktree branch posture**, delivered by **extending the existing `branch-format` method** —
  which already owns the branch type-set (core execution types + `plan/<name>`) and the method-override
  machinery — rather than adding a parallel method or config key. A WU branch is a WU branch regardless of
  worktree, so there is no separate worktree naming convention: state the worktree posture in `branch-format`'s
  default — the existing convention governs ARC-created worktree branches — plus an **advisory
  warn-on-external-mismatch**: when ARC creates branches the convention applies; when branches arrive externally
  it warns on mismatch, never refusing or relocating.
- **R26 [P0]** — **Worktree location template** (`worktree.location_template`) — a **config key**, not a method.
  The value is consumed by code (the path-resolution helper at worktree-creation time), so it belongs with ARC's
  other code-consumed config values (cf. `hooks.test_patterns`), not in `system/methods/`, which house
  agent-read activities. Default = `../{repo}.{branch}` (flat sibling-parent; slashes → `-`). Supporting
  documentation — semantics and override examples (in-repo `.worktrees/{branch}`, centralized, home-rooted) —
  ships inline with the key. When ARC creates worktrees the template resolves; when worktrees are external, ARC
  reads location from `git worktree list` — no enforcement, no relocation. The **path is a creation-time
  artifact, decoupled from branch renames** — an Active→Planning demotion leaves the path as-is.
- **R27 [P0]** — Schema placement uses flat dotted keys per current arc-config convention; a later
  flat-vs-nested evaluation may relocate them. Provisional flat-dotted form for this WU.

### F. Lifecycle ceremonies, documentation, and retirements

- **R28 [P0]** — **Lifecycle workflow updates.** `init-work-unit` gains a worktree-creating mode (the concrete
  content of R8's "thin wrapper"; in-place mode survives for the single-worktree / atomic-launchpad case).
  `integrate-work-unit` adds a post-merge worktree-removal step (R29). `deactivate-work-unit` Case A-delete
  runs `git worktree remove` **before** `git branch -D`; Case A return-to-Planning leaves the decoupled path
  in place. `activate-work-unit` is largely unaffected (branch rename runs inside the WU's worktree; `arc
  user open` reappears defensively). `session-handoff` needs **no structural change** (delegates push/sync to
  `arc sync`, which owns worktree + notes coherence); optional symmetry touch: surface worktree context in
  the Confirm-Handoff summary.
- **R29 [P0]** — **Worktree-ownership marker — a machine-local, never-synced contract.** When **ARC creates or
  scaffolds a worktree** — spawn, cold-start (when ARC scaffolds), and **materialize** (owned by In-Flight
  Awareness, which inherits this contract) — ARC writes a small gitignored, identity-agnostic marker at
  `.arc/system/.internal/worktree-marker.json` (`{ spawnedByArc, wuName, spawningIdentity, createdAt }`;
  `.gitignore` entry mirrors the existing `.arc/system/.internal/pristine.json` line — that dir already hosts
  gitignored machine-local runtime state and carries the "ARC internals, don't touch" signal). The marker is
  **machine-local and must never be synced** (gitignored is the enforcement — never added to notes or
  tracked); that no-shared-state property is what makes cross-machine cleanup coherent without reconciliation.
  It is **self-cleaning** — it lives inside the worktree, so `git worktree remove` (and `rm -rf` + prune)
  delete it; it shares the worktree's lifetime exactly and so cannot orphan or go stale-and-misleading (it
  states a permanent fact, stable across an Active→Planning branch rename).
    - **One gating rule, consulted at every cleanup site** — `integrate-work-unit`, the branch-gone cascade
      (R3), and the stale-worktree sweep (R34): **marker present + worktree clean + branch merged** →
      interlock-gated offer to `git worktree remove`; **present + uncommitted/unpushed** → never auto-remove,
      surface the dirty state (no `--force` without explicit instruction); **no marker** → advisory only
      ("looks externally-managed; your tool likely handles cleanup, or `git worktree remove <path>`
      manually"). Absence ⇒ external ⇒ advise is the safe default. The clean-+-merged guard is mandatory.
    - **Per-machine cleanup model.** Each machine cleans only its own worktrees, deciding from its local
      marker. The spawning machine cleans at integrate (if it integrates) or at branch-gone / the sweep (if
      another machine integrated); a worktree materialized on a second machine carries its own marker and is
      cleaned there. No marker ever crosses machines, and none is reconciled.
- **R30 [P0]** — **Pause-pointer neutralization** in `manage-incidental-work.md`. WOR retired the
  pause-pointer fields (`Interrupts:` / `Paused At:` / `Paused To:` / `Spawned:`) from `template-meta.md`,
  but left this workflow built on them. Worktree isolation *obsoletes the workflow's premise* — an interrupt
  spins up a WU in its own worktree, or launches an Errand from the main worktree, rather than pausing the
  parent (interim mechanism = the Errand cheap-branch path, R12; the launch ergonomics are Errand
  Enablement's). Foundation's bounded responsibility: neutralize the obsolete
  pause-pointer mechanic so the workflow no longer contradicts the template. The deeper reshape (whether a
  standalone workflow is the right shape; work-class single-source consolidation) belongs to the
  agent-context-optimization cohort, not here.
- **R31 [P0]** — **Main-on-main pattern documentation.** Document ARC's stance (strategy doc + workflow
  guidance): the main worktree stays on `main` as a stable reference and serves as the launchpad for admin
  operations (planning, sweep ceremonies, global edits) and atomic / Errand launches on short-lived branches.
  No separate dedicated administrative worktree. Composes with externally-spawned worktrees (the tool's main
  workspace IS ARC's main worktree).
- **R32 [P0]** — **Retire the `atomic-*` companion file type.** With the Errand class and worktree-isolated
  WU spin-up, the per-WU atomic holding area's role evaporates. Retire the type and reroute its capture: fold
  into the commit / add a task / spin an Errand / `USER-INBOX.md § Atomic`. The shared `ATOMIC-INBOX.md`
  surface and the atomic *character* are unaffected — only the per-WU companion file type retires. Sweep
  references across DEV-RULES.ARC § Leave it cleaner, `strategy-task-list-formatting.md` § Atomic Companion
  File, the `commit-footer` method, templates, and workflow mentions.
- **R33 [P0]** — **Shipped-doc drift-fix.** Remove the cut shift-state-machine rows (`Paused` /
  `Waiting-For`, labeled "future arc-shift") from `strategy-work-organization.md` and reconcile its state
  table with `template-meta.md`'s 4-state machine. Reconcile `deactivate-work-unit.md`'s Case Matrix
  "arc-shift (future)" reference (it points at the *cut* state machine, not the surviving `arc-shift`).
  Reconcile § ROADMAP: **step 4 redefines In Flight as location-based** (a WU in `active/**` is in flight;
  Ready/Blocked scope to `backlog/planned/**`) and corrects the `active/ ⟹ State: Active` activation framing
  to `active/ ⟹ in flight`. The regen fire-point shifts earlier (a WU enters In Flight on landing in
  `active/**`, not at activation).
- **R34 [P0]** — **Stale-worktree sweep at session-init (anchored at the main worktree).** To guarantee no
  *permanent* orphaned worktree, session-init in the **main worktree** cross-references `git worktree list`
  against main's `completed/` (a local, network-light check: a worktree whose WU has shipped) and surfaces any
  lingering WU worktree for cleanup, gated by the R29 marker contract. Anchoring the sweep at main keeps the
  **resume-a-WU common path cheap** (no sibling scan there); under the main-on-main pattern (R31) a main
  session recurs often enough to bound the lingering window. This is the third cleanup trigger beyond integrate
  (R28/R29) and reopen-driven branch-gone (R3) — it closes the spawn-on-A / integrate-on-B /
  never-reopen-A's-worktree gap. Worktrees are only ever *surfaced* for cleanup, never auto-removed without the
  marker-gated clean-+-merged guard.

## Non-Goals

- **Awareness layer** — the in-flight oracle, `STATUS.USER` view + render standard, `Priority` field, and
  materialize (the 4th entry-point quadrant) are In-Flight Awareness's. Foundation ships only the *degrading
  advisory stub* (R11) of the activation-time concurrency check; the oracle-backed version is downstream.
- **Tier model and `arc start` command** — Agile WU Lifecycle's. Foundation's spawn is tier-agnostic and
  accepts but does not branch on `--tier`.
- **Usage conventions** — when to parallelize, focus roles (primary / companion / awaiting / parked),
  async-merge integration audit, `strategy-concurrent-work.md`, and the concurrency *gate doctrine* are
  Concurrent Work Conventions's. Foundation ships mechanism; it explicitly does **not** bless undisciplined
  concurrent agent sessions (documentation states that two simultaneous agent sessions in different worktrees
  violate co-development bandwidth).
- **Generic worktree-wrapper CLI** (`arc worktree create/remove`) — no generic git-worktree reimplementation.
  Worktree create/teardown is owned by WU-level verbs (spawn, cold-start, materialize), which call
  `git worktree add` under the hood; R29's removal is a lifecycle-ceremony action, not a generic wrapper.
- **`/arc-status` skill** — cut. The project-wide in-flight view is the derived ROADMAP; the user-scoped
  cross-WU view is In-Flight Awareness's dashboard.
- **Plug-in hooks for external worktree-management tools**, and **worktree-aware lifecycle hooks**
  (`post-shift-pause` etc.) — deferred. ARC operates as a discipline layer in any worktree regardless of who
  created it; it does not orchestrate the creating tool. R9's cold-start is the tool-agnostic integration
  surface.
- **No `arc update`-injected harness-file changes** (CLAUDE.md / AGENTS.md). Cold-start discoverability is
  handled user-side by ARC strategy docs and agent-side within ARC's own session-init reads (the docs-site
  treatment is the dedicated docs WU's, per below).
- **Docs-site content (`docs/`) — out of scope WU-wide.** A dedicated docs WU (planned far out, once the
  backlog is closer to cleared and ARC is more stable, to avoid interim churn) does the large docs-site sweep.
  This WU edits **ARC docs** (strategies, workflows, methods, rules, briefs under `.arc/**`, which ship via the
  package) but never the published docs site. Applies to every requirement — notably R32's `atomic-*`
  retirement sweep, whose success-criterion already scopes to rules / strategies / methods / templates /
  workflows.
- **The deeper `manage-incidental-work.md` reshape** and work-class single-source consolidation —
  agent-context-optimization cohort. Foundation does only the surgical premise-neutralization (R30).
- **T3 sync-state drift-detection** — routes to `cross-machine-sync-coherence`. Foundation ships T1 + T2
  (R22/R23) and leaves the `.sync-state.json` schema seam (R24).

## Technical Considerations

- **Hard upstream: Work Organization Reform (shipped).** Foundation assumes WOR's per-worktree isolation
  foundation — single-branch-per-WU lifecycle, sweep-as-you-go integration, location-by-state meta
  convention, and the cross-worktree roster cascade. Without it, worktrees inherit stale Planning-state metas
  from main and isolation breaks structurally. R3/R6 consume WOR's roster cascade; R8 composes with its
  single-branch-per-WU model; R16–R21 layer on WOR R65's `user/` structure.
- **The session-init probe is the latency *and* turn-count budget.** Every datum a dispatch decision needs is
  pre-resolved in one CLI pass, so `arc-session` reaches the right prompt — or none — in a single turn. The
  anti-pattern is the skill running its own `fetch` / `worktree list` / meta-reads across turns before
  presenting options. Hard constraint: the common path (resume an existing local WU) must not get slower —
  heavy capabilities (roster pre-compute, branch-gone cascade) fire only in their triggering branch. Probe
  deltas: worktree identity (cheap, always on); `branch-gone` as a distinct state (rides the existing fetch);
  pre-computed roster (branch-gone / no-WU branch only); pre-computed branch-gone recovery cascade (branch-gone
  branch only). The handoff probe needs no structural change. The
  stale-worktree sweep (R34) is anchored at the main-worktree session-init for the same reason — the
  resume-a-WU path never scans siblings.
- **Layering model.** Foundation's entry shape sits on top of two layers ARC does not own. The **tool layer**
  (when present) owns worktree creation (branch, location, naming); ARC defers and works against whatever
  worktree it is handed — composability is one-way. The **harness layer** owns skill discovery within the
  worktree (skills are harness-scoped, read from the working tree regardless of who created it). The **ARC
  layer** owns the discipline above both (meta lifecycle, state machine, interlocks, sweep-as-you-go) —
  uniform in every worktree.
- **Structural vs. advisory.** Structural (uniform regardless of worktree origin): single-branch-per-WU,
  location-by-state, per-worktree isolation, state machine, capture pipeline, integration ceremony. Advisory
  (configurable defaults, soft-warned when violated): worktree branch posture (R25), worktree location
  template (R26). Adopters using an external tool get the full structural discipline; the advisory
  conventions become recommendations they apply via their tool's UX.
- **Dual-axis recovery model.** Session-init implicitly answers two questions with different authoritative
  sources: *roster* ("which WUs are mine in flight?" — identity-filtered metas + worktree list) and *context*
  ("what was I doing in WU X?" — SESSION-NOTES, resolved per-worktree via that worktree's HEAD ancestry).
  R5's Step-7 split and R3's notes-absent cascade both follow from keeping these axes separate.
- **Migration targets (not design-coupling).** Hand-rolled `git worktree list --porcelain` parsers, the
  branch-gone evidence discriminated union, the cold-start spec-input parser, and cross-WU note payload
  validation are migration targets for CLI Substrate Adoption's later zod/execa sweep — written plainly now.
- **Downstream consumers.** In-Flight Awareness (hard downstream — builds on these mechanics + `arc-session`
  dispatch); arc-plan Conductor and Agile WU Lifecycle (wire their entry verbs to spawn); Coord Probe (one
  signal source in R3's cascade, loosely coupled with a hand-rolled fallback); Concurrent Work Conventions
  (consumes the mechanism layer wholesale).

## Success Criteria

Validated explicitly at work-unit completion:

- **Prompt-flow turn budget met** for each scenario: resume-clean → **0** prompts; resume-needs-sync → 1;
  cold-start (bare worktree) → 1; branch-gone → 1 *with pre-computed candidates*. (Materialize → 1 is
  In-Flight Awareness's to validate.) Probe pre-computation is the mechanism that hits these.
- **Branch-gone is no longer reported as `remote-unavailable`** for a cleanly-pruned upstream; the
  motivating recovery scenario resolves through the cascade with candidate surfacing, not manual git
  archaeology.
- **Common-path latency unchanged** — resume of a local WU adds no fetch/scan beyond today's probe; the
  roster pre-compute and cascade demonstrably fire only in their triggering branch.
- **Spawn returns to origin** — after spawning, the originating session is unchanged and on its own
  branch/worktree; the new worktree exists at the templated path with branch + meta + empty SESSION-NOTES.
- **Cross-WU sync correctness** — a spawn → first-load does not import the prior WU's SESSION-NOTES; cross-WU
  USER-INBOX / WORKING-MEMORY entries merge by entry identity (header / list-item lead-in) with tombstones
  honored; concurrent worktree pushes reconcile without data loss; retired-WU subdirs reconcile rather than
  linger.
- **External-worktree composability** — ARC reads location from `git worktree list` and never relocates or
  refuses an externally-created worktree; branch-naming mismatch is a warning, not a block.
- **No permanent orphaned worktrees or markers** — a marker cannot outlive its worktree (coupled lifetime);
  every lingering worktree for a shipped WU is surfaced for cleanup at the next main-worktree session-init
  (R34) or on reopen (R3). Verified against a spawn-on-A / integrate-on-B / resume-on-A trace.
- **Framework self-consistency at ship** — no dangling `atomic-*` companion references remain across rules /
  strategies / methods / templates / workflows / briefs; `strategy-work-organization.md` and § ROADMAP carry no cut
  shift-state-machine rows and use the location-based In-Flight definition; `manage-incidental-work.md` no
  longer instructs setting retired pause-pointer fields.
- **Worktree conventions are genuinely customizable** — the worktree branch posture overrides via the
  `branch-format` method (agent-read), and `worktree.location_template` resolves its default and accepts
  overrides as a config value (code-read).

## Design Decisions

Settled during planning; final implementation details ratified when the relevant task is built.

### Resolved at task generation

- **`cross-machine-sync-coherence` seam examined alongside Item D.** Foundation owes that WU the
  `.sync-state.json` schema seam (R24) and *enlarges* the partial-push surface; its plan predates WOR R65 and
  this WU and gets a worktree-aware refresh at its own promotion. R24 leaves the versioned, worktree-aware seam;
  `notes-{name}.md` records the partial-push-surface widening. Sequencing awareness only — not a Foundation
  blocker.
- **Cross-WU sync code layout + load model (Item D — ratified at Phase 3 kickoff, cross-checked against the
  downstream drafts).** New sync code lands in `lib/user-sync/*` (`classifier`, `notes-ref`, `parser`,
  `merge`, `types`), not inlined into `save-load.ts` — preempting `user-sync-module-split`'s consolidation and
  giving `cli-substrate-adoption` a clean schema co-location; parsers/readers return discriminated outcomes
  (no throw on expected failure) so the zod / `Result` migration is a later wrap, not a rewrite. Load is a
  **two-read model** — per-WU files from the one note containing the current WU's subdir, cross-WU files
  merged across the N most-recent ref-wide notes — both encapsulated inside `runUserLoad` / `arc user pull`.
  **No-resolvable-WU → per-WU no-op:** fresh spawn, load on `main`, and `errand-enablement` sessions on non-WU
  branches all resolve to "no current-WU subdir," so per-WU load no-ops while cross-WU still loads (the
  current-WU input is optional throughout). N is a named constant so `cross-machine-sync-coherence` can bump
  it; R24's `.sync-state.json` seam stays version-stable so that WU can populate the reserved `priorFileList`
  and remote-marker fields without a re-bump.
- **Worktree branch posture (R25).** A WU branch is a WU branch regardless of worktree, so there is no separate
  worktree naming convention: state the posture in `branch-format`'s default (extend the method) rather than add
  a parallel method or config key — `branch-format` already owns the type-set and override machinery.
- **Worktree location template (R26) is config, not a method.** Refined at execution kickoff: the template value
  is consumed by code (the resolution helper), so it is a config key (`worktree.location_template`) alongside
  ARC's other code-consumed values, not a `system/methods/` file — methods house agent-read activities, and a
  "documentation-only method" is a category error. Supporting docs ship inline with the key for now. The
  holistic method-vs-config boundary routes to `customization-arch-realign` (with this as the worked example);
  the inline-vs-reference doc-home decision routes to `config-storage-architecture` § comment-density. The
  branch posture (R25) stays a `branch-format` method extension — it is an agent-read convention.
- **Spawn's home (R8).** Spawn and cold-start share one CLI-level scaffolding primitive, parameterized by
  worktree-target mode (create-new vs. use-existing) — spawn creates the worktree (via `init-work-unit`'s mode),
  cold-start enters an existing one; invoked from the `arc-session` skill, not a standalone CLI command.

### Decided during planning (final details ratified at implementation)

- **Cold-start spec-input model** — interactive prompt vs. the optional `/arc-session <pointer>` seed.
  *Decided: interactive default, seed optional.*
- **`arc-shift` target selection** — discovery-led pick from `git worktree list` vs. a required arg.
  *Decided: discovery-led default, optional arg (mirrors the general args posture).*
- **Cold-start marker semantics for tool-made worktrees** — when cold-start scaffolds into a worktree ARC did
  not create (external tool / manual `git worktree add`), does ARC write an ownership marker (→
  offer-to-execute removal) or stay advisory (the tool owns cleanup)? Affects only the offer-vs-advise boundary
  (the R34 sweep surfaces it either way). *Decided: write the marker only when ARC creates the worktree;
  advisory for tool-made ones.*
- **Cold-start as a shared CLI-level scaffolding primitive** — confirm the primitive's home so both
  `arc-session` and the downstream `arc start` stay thin (R9). *Decided: yes, CLI-level.*
