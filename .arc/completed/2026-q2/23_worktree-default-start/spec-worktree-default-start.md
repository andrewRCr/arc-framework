# Spec (`outline`): worktree-default-start

- **Origin:** [internal] — the start-time spawn/steering surfaces carved off `async-merge-lifecycle` at its
  create-spec (at-cap lateral extraction). That origin owns the async-merge *completion* tail; this member owns
  making worktree-based parallelism the lived default when work *starts*.

- **Purpose:** Make worktree-spawning parallelism the default for new work units under full protection, not a
  manual opt-in — by wiring the unwired create-new `arc start` mode, flipping new-WU dispatch to
  worktree-by-default, and adding two start-time session-init steering surfaces (plate-balance awareness and
  cohort-doc discovery) so the resulting parallelism actually coordinates.

---

## Problem / Context

ARC has shipped nearly every parallelism *mechanic* — the worktree model, the `spawnWorktree` primitive, location
templating, In-Flight Awareness, the `Class` contract — yet starting a work unit is still **in-place by default**.
Two gaps keep parallelism a manual act rather than the lived default:

- The worktree-*spawning* `arc start` verb is unwired. `arc start --here` (cold-start into an existing worktree)
  ships, but plain `arc start <name>` is rejected outright — the `spawnWorktree` primitive exists with no CLI
  caller.
- New-WU dispatch never defaults to a spawned worktree. `init-work-unit` documents both modes (in-place /
  worktree-creating) but leaves them caller-selected with no default, so `init` keeps creating WUs in-place
  unless manually steered.

The start-time coordination surfaces that make concurrent streams safe — plate-balance awareness and cohort-doc
discovery — are also absent from session-init, so even once worktrees spawn by default, the parallel streams have
nothing steering them to coordinate. This work closes the gap on the **start** side of the WU lifecycle,
orthogonal to `async-merge-lifecycle`'s **completion** side (a different dependency root: this consumes the
shipped `spawnWorktree` primitive, not the notes-merge engine).

## Decision(s)

1. **Wire the create-new `arc start` worktree-spawning mode.** Plain `arc start <name>` (non-`--here`) will
   resolve location / base / repo from config and call the shipped `spawnWorktree` primitive to create an
   isolated worktree on a new branch, with test coverage for the handler branch. We will also drop the now-moot
   `--tier` flag reference from `start.ts`'s module doc — `class-model-foundation` retired the
   `atomic` / `quick` / `standard` tier model in favor of `Class`, which resolves during planning, not via a CLI
   flag.

2. **The worktree-or-not decision is mechanical, not `Class`-keyed.** It keys on **branch-protection mode ×
   worktree-spawn availability** only, identical to the relocation `run-errand` Launch already performs — never
   on `Class` or planning depth. Worktree isolation is agent-safety, which is weight-independent (errands get
   ephemeral worktrees too). The conductor's stale "atomic skips / light optional / heavy-novel always" framing
   is wrong on every axis and plays no role here (its worktree-orchestration section is OBE).

3. **Worktree-creating is the default under full protection.** When branch-protection is `full` and spawning is
   available, new-WU dispatch defaults to spawning an isolated worktree; when spawning is unavailable it falls
   back to cutting the branch in the primary worktree's base checkout; under partial protection no branch is cut
   (direct base commit). This is the WU analogue of `run-errand` Launch, authored into `init-work-unit`'s
   Execution Modes so every WU-creating caller (`decompose-work-unit`, `graduate-work-unit`, session-init
   dispatch) inherits the default rather than re-authoring it. The `--here` cold-start path remains available as
   the explicit in-place override.

4. **Plate-balance awareness is a single advisory line at session-init.** Session-init's next-work discovery will
   surface one conditional advisory line accounting for in-flight `Class` composition — when a `Heavy` / `Novel`
   stream is already open, it surfaces the parallelism caveat (the `Class` model's "roughly one genuinely-novel
   stream" balance rule). It consumes the existing `classComposition()` tally and the in-flight oracle data
   already gathered at session-init. **Awareness-only, never paternalistic** — it surfaces once and never
   suppresses, reorders, gates, or re-nags. It consumes the plate-balance doctrine; it does not define it.

5. **Cohort-doc discovery is a conditional session-init read.** When the active meta carries a `Cohort` value,
   session-init's context-load will read the coordinating `cohort-*.md` and surface its awareness, paired with a
   short `AGENT-BRIEF.ARC` note documenting the surface. Agent awareness of the coordinating cohort doc is
   load-bearing for cross-member coordination to land; session-init does not read it today.

## Scope boundary (No-gos)

- **No end-to-end verification of worktree-default across concurrent WUs.** This lands the mechanical default-flip
  (protection × spawn-availability). Verifying worktree-default behaves correctly across genuinely-concurrent
  streams belongs to the downstream `finalize-parallelism` closeout audit, not here.
- **No (re)definition of the plate-balance doctrine or the `Class` contract.** Both are consumed, not authored:
  the balance rule and coordination doctrine are `concurrent-work-doctrine`'s; the `Class` model ships. This adds
  only the advisory surface that reads them.
- **No `--tier` flag grammar.** The tier model is retired; only the stale doc reference is removed — no flag is
  implemented or re-introduced.
- **No async-merge / completion-side work.** That is `async-merge-lifecycle`'s; the two members parallelize on
  disjoint dependency roots.
- **No new subdir-removal plumbing.** `arc user close` already ships and is out of scope.

## Consequences & Risks

- **Isolation becomes the lived default under full protection.** New WUs spawn an isolated worktree by default,
  so agent-safe parallelism is what happens without a manual act. Cost: a worktree per WU (disk + cleanup) — but
  the worktree model and the stale-worktree sweep already ship, so the lifecycle cost is already absorbed.
- **Mechanical keying means even `Light` WUs spawn worktrees.** Accepted deliberately — isolation is
  weight-independent and consistent with how errands already get ephemeral worktrees. Not treated as a cost to
  optimize away.
- **The default-flip changes `init` behavior.** A session that wanted in-place creation must now opt in via
  `--here`. Mitigation: the override is a single documented flag, the new default is protection-keyed (only
  `full`), and partial protection is unaffected.
- **Two added conditional reads at session-init.** Minor init cost, each gated — the cohort read only when the
  meta carries a `Cohort`, the plate-balance line only when a `Heavy` / `Novel` stream is in flight.

## Success Criteria

- `arc start <name>` (bare, non-`--here`) under full protection spawns a worktree on a new branch via
  `spawnWorktree`, resolving location / base / repo from config — it no longer errors with the `--here` pointer.
- New-WU dispatch defaults to worktree-creating under full protection when spawning is available; falls back to a
  branch in the primary's base checkout when spawning is unavailable; cuts no branch under partial protection
  (direct base commit) — mirroring `run-errand` Launch.
- The moot `--tier` reference is gone from `start.ts`'s module doc.
- Session-init surfaces exactly one plate-balance advisory line when a `Heavy` / `Novel` stream is in flight, is
  silent otherwise, and never reorders or gates the suggestion set.
- Session-init reads and surfaces the active WU's `cohort-*.md` when the meta carries a `Cohort`; `AGENT-BRIEF.ARC`
  documents the cohort-doc awareness surface.
- The new create-new handler branch carries test coverage.

## Open items

- **Exact wording and placement** of the plate-balance advisory line and the cohort-doc surfacing within
  session-init's orientation output — phrasing detail, settled against the surrounding orientation format at
  implementation time.
