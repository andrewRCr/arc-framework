# Draft: Lifecycle Mechanics Tail

- **Origin:** [internal] — `lifecycle-state-machine` cohort **companion** (minted 2026-06-17 at a housekeep drain).
  Owns the deterministic-CLI-mechanic tail the cohort's first migration step (`lifecycle-transition-core`, B1)
  deliberately stopped short of: the second increment toward the north star where deterministic transition
  mechanics live in the CLI and workflows shrink to the judgment that decides whether/when to fire them.
- **Cohort:** `lifecycle-state-machine` (companion — see § Positioning).
- **Purpose:** Give the deterministic lifecycle mechanics still hand-run in workflow markdown — the post-merge
  teardown tail, the archive finalize-fact write — a single CLI-owned home, and consolidate the cross-cohort
  fragments where the same mechanics were captured against adjacent owners. An **audit is planning step one**: the
  surface is discovery-shaped, so the WU's true scope (and whether it decomposes) resolves from the audit, not from
  a guessed task list.

> Shared context — the north star (mechanics → CLI, judgment → workflow), the `(phase, location)` model, the
> mutator bundle, and the consistency-on-exit standard — lives in `cohort-lifecycle-state-machine.md`. This draft
> carries only what this companion owns.

---

## The audit (planning step one — not a task)

Before any task decomposition, sweep the **errand + WU lifecycle** for deterministic, no-judgment mechanics still
executed by hand in workflow markdown (the carry-and-skip prose, the "do this by hand" tails), and produce the
inventory that scopes this WU. The audit is the design front-end; it runs at planning, feeds `create-spec`, and
may split this WU if the surface is large. It must **reconcile**, not duplicate — every candidate is checked
against the already-captured fragments below before it becomes net-new scope.

Audit output per candidate: *the mechanic · where it lives today (workflow + step) · is it genuinely judgment-free ·
does an existing capture already own it (→ consolidate / repoint) · migrate-now / leave-downstream / reject.*

**Audit seed (live dogfood, 2026-06-17).** Grooming around *this* WU surfaced two instances directly, both of the
same deterministic-placement/teardown-mechanic class.

**(1) `arc stub` has no `--cohort` affordance**, so placing the new member into the `lifecycle-state-machine`
cohort took a hand-run dir move (`backlog/planned/<name>/` → `backlog/planned/<cohort>/<name>/`) plus a manual
`Cohort:` field write — a deterministic placement op the CLI could own (`arc stub --cohort <slug>` placing the dir
and writing the field, with the same collision/validation guards the stub contract already runs). The friction is
**not** markdown-tail this time but a missing CLI affordance on a shipped verb, so the audit routes it rather than
pre-claiming it: own here, or repoint to the `stub`-primitive owner (`lifecycle-transition-core`'s stub contract,
with `planning-pipeline-readiness` as the planning-entry-mechanics neighbor).

**(2) The graduate/relocate mutator leaves an empty cohort subdir behind**: when a member graduates from
`backlog/planned/<cohort>/<wu>/` to the flat `active/`, the now-emptied `<wu>/` subdir lingers under the cohort
dir — the relocate leg should `rmdir` the emptied parent. Surfaced graduating `planning-pipeline-readiness` (left
an empty `backlog/planned/lifecycle-state-machine/planning-pipeline-readiness/`). Impact is local-cosmetic only
(git doesn't track empty dirs, so it self-heals on clone), but it is the same class as (1) — a deterministic,
no-judgment placement/teardown mechanic. Both recorded as the audit's first concrete data points.

## Audit inventory (complete)

First collaborative pass (2026-06-18) plus a systematic re-audit the same day — the full lifecycle + adjacent
workflow corpus swept by parallel readers (`work-unit-lifecycle/**`, the planning + task pipeline, errand +
session + supplemental), each classifying judgment-vs-deterministic and reconciling against this inventory, then a
forward-compat check (OSD / arc-backend / principle-anchored-core). This is the scope spine `create-spec`
formalizes — refine, don't re-derive, at spec time.

**Scope thesis (the in/out boundary).** This WU owns the *judgment-free deterministic-mechanic* migration on the
lifecycle/transition CLI surface — and only that. A mechanic whose firing needs a human/agent decision stays in
its workflow; a gap that is really a *different domain* (a render engine, a prompting substrate, commit grammar)
stays with its owner. That boundary is the coherence guarantee, not an arbitrary cut.

### In scope — migrate / extract here

The judgment-free deterministic mechanics this WU factors to the CLI — *mechanic — where it lives today →
disposition.* (The 2026-06-18 re-audit added the `arc integrate`, inbox-line-removal, planning-field-write, and
errand-branch-cut entries and corrected the teardown row.)

- **Post-merge teardown verb** (seed #1) — branch reap (merged-safe) + presence-guarded `git worktree remove`,
  worktree-kind dispatched, **plus the `git fetch --prune` stale-tracking-ref leg**. Hand-run today in **three**
  sites: `integrate-work-unit` Step 13, the `session-handoff` finalize pass, and `decompose-work-unit`'s park-exit
  (force `-D` variant). → Migrate — the core verb.
- **Errand teardown leg** (`arc errand close`) — shares the legs above. → Extract: **one verb, owned here** (this
  WU is `P1`, lands first; `errand-lattice` consumes the shared leg, the close *decision* stays with it).
- **`arc integrate` command** — the `Active → Integrating` State flip + ROADMAP regen, hand-edited today. The
  `integrate` edge is in the transition table and the executor can fire it (it is literally `reopen`'s inverse,
  which *is* a shipped command) — only the command binding is missing. → Migrate. **Naming constraint:** it marks
  *phase entry*, not the merge (the integration-interlock owns the merge) — surface it phase-explicitly or
  workflow-invoked, name settled with `idiomatic-alignment` (§ Forward-compat / Coordination).
- **Meta-shape cluster** (seed #3) — graduate forward-reconcile against `META_FIELDS` (warn-and-backfill) + retire
  `template-meta.md` as a second scaffold source. → Migrate.
- **Planning-stage meta-field writes** — `Class`, `Task List`, and the terminal `Next Action` strings, hand-written
  at create-spec / generate-tasks / verify-work-unit finalize. PPR (shipped) wrote the *pointer* fields
  (`Current Workflow` / `Design` / the begin-sentinel) but left these as hand-fills. `Task List` is a pure
  filename derivation (clean migrate); `Class` + the fixed `Next Action` strings are deterministic-once-decided on
  PPR's stage-pointer surface — claim here as the tail-cleanup of what PPR left (§ Coordination: PPR).
- **`arc archive --pr-url --completed`** (seed #2) — write the finalize **facts** (PR-URL, Completed) + forward-field
  reconcile. → Migrate (seed) + extract the finalize-write half from `interlock-release-refinement` (its
  approval-collapse stays). The facts are meta *fields*, not a free-floating block (§ Forward-compat).
- **USER-INBOX slug-matched line removal** — drop the originating inbox entry on errand completion (hand-run in
  `run-errand` Complete, `drain-inbox`, the `session-handoff` finalize pass; readers exist, no writer). → Migrate —
  write-side complement to the errand-close leg. Idempotent / targeted / title-keyed→`_Slug:_` (§ Forward-compat).
- **Errand `chore/<slug>` branch-cut at Launch** — create-side counterpart to the errand-close leg (hand-run in
  `run-errand` Launch, `session-init` errand cold-entry, `drain-inbox`). → Migrate, owned here for symmetry with the
  close leg. The slug is the logical identity, `chore/<slug>` the projection (§ Forward-compat; errand-identity
  record routed to `errand-lattice`).
- **Relocate leg `rmdir`s the emptied cohort parent subdir** — on the graduate-to-`active/` leg specifically
  (`promote` / `resume` already prune their own; this is the relocate-mutator gap). → Migrate — small.
- **`arc stub --cohort <slug>`** — place dir + write `Cohort` field under the stub-contract guards. → Migrate, or
  repoint to the stub-contract owner.
- **`arc start --here` auto-cut/offer `plan/<name>` on a protected base** instead of refusing (cold-start
  fresh/no-draft path; `cold-start-init-polish` facet 2). → Migrate — J, verified live 2026-06-18.

**Executor-hardening rider.** Guard the post-side-effect meta writes — `applyBranchField` /
`applyCurrentWorkflowField` / `applySoftFields` **and** the step 8.5 `stageMeta` — in the encoding-failure
surface; today they run after side-effects fire, outside the `try/catch`, so a throw escapes as an unhandled
error after a partial transition. **Settled:** report a **distinct status** from the pre-side-effect
`encoding-failed` — the recovery differs (pre = nothing fired, retry the whole transition; post = side-effects
landed, forward-only finish-the-write), so a shared status would erase exactly the distinction a recovery handler
needs; the distinct status carries the applied-side-effect context. Not a markdown-mechanic migration —
executor-infra robustness on the surface the teardown verb extends. The status name + payload shape is
`create-spec` detail.

**J verified live (2026-06-18).** `runColdStart` (`start.ts`) refuses on a protected base under
`branch.protection: full` ("cannot cold-start onto protected base … switch to a feature branch") with no
auto-cut or offer of `plan/<name>` — a deliberate guard mirroring the release-wrapper protected-base rule, not a
bug. J upgrades that bare refuse-with-direction into the guided auto-cut/offer the hand `git checkout -b`
workaround stood in for. Confirmed against current code; the candidate stands (did not drop out at verification).

### Out of scope — leave with owner

- **ROADMAP hand-render** on every lifecycle state change → `roadmap-tooling`. Extracting it = building a renderer
  (a different foundational domain, cf. OSD); this surface only emits the derived-state predicates + Parked bucket
  RT consumes.
- **decompose batch member-stub cohort-scaffold** (Step 4: scaffold N member dirs + inherit `Origin` / set
  `Design` + `State` / dual-place `Cohort`) → `decompose-matrix` (owns the decompose verb). Keep only the *single*
  `arc stub --cohort` here; the batch-into-cohort-tree is its surface.
- **activate / deactivate remote-branch rename legs** (`git push -u` + `git push origin --delete`; the local
  `git branch -m` is shipped) → push-policy seam (`push-interlock` / `cli-substrate-adoption`). Pushing from inside
  the executor crosses push-policy; defer the ownership call.
- **Promote-errand branch rename** (`git branch -m`) → `init-work-unit` / `errand-lattice` edge (tangled with
  promotion judgment; low payoff).
- **deactivate Case C inverse-meta-write** → rare / low-payoff; the executor refuses the merged-on-base case by
  locus, not because the mechanic differs. Leave unless it falls out free with the rename legs.
- **decompose cohort-doc generation** (mint / backfill `cohort-*.md`) → judgment-laden (carries coordination
  content); the structural invariant ("every grouping dir carries a doc") is already commit-guarded by shipped
  `validate-cohort-consistency`. Only generation remains, and it is judgment.
- **atomic-inbox completion-order reorder** → `shared-inbox-housekeep` (routed via `arc-inbox` 2026-06-18) — a
  deterministic sort, but inbox/housekeep domain, not the lifecycle/transition surface.
- **Workspace seed + `arc user open` non-TTY hang** → `cli-substrate-adoption` (the prompting substrate).
- **`out-of-wu-entry` (entire)** → self (`agile-parallelism`) — entry-dispatch is judgment; its relocation is
  shipped `run-errand`.
- **`cold-start-init-polish` facets 1 / 3 / 4 / entrypoint** → self — commit grammar / init-routing / classify; a
  UX + grammar + judgment cluster kept whole.
- *Also examined & rejected* (judgment / commit-grammar / no host verb): `mkdir -p .arc/active/` (none/external
  authoring path — arc-in-git already `ensureDir`s on relocate/stub); `_Hold:_` / `_Created:_` retain field-write
  (trivial, gated behind a never-agent-suggested escape-hatch); errand handoff checkpoint commit (staging judgment +
  commit grammar); `clean-work-unit` temporal-noise strip (content judgment).

### Coordination seams (pointers, not scope)

- **`errand-lattice`** — consumes the teardown leg + the errand `chore/` branch-cut (the "one verb / one cut",
  owned here). Build anticipating `arc errand close` as a caller. The **errand-identity** question (errands
  record-less today; identity branch-parsed) is routed to its inbox 2026-06-18 — not ours to build.
- **`planning-pipeline-readiness` (shipped)** — the `Class` / `Task List` / terminal-`Next Action` writes sit on
  its stage-pointer surface; this WU cleans up what PPR shipped-but-left (same tail pattern as
  `async-merge-lifecycle`). Confirm the here-vs-PPR cut at create-spec.
- **`composable-workflows`** — owns the "shared block → CLI surface vs. markdown fragment" framing, but its fragment
  model is markdown-only; the teardown *verb* is code-tier (the right form). **Supersede its parked teardown
  "Option 1b" inbox item** when the verb lands, so the two don't double-claim.
- **`scalable-core`** — owns an `archive.preserve` / `completed/`-decouple seam on the *same* `archive-work-unit.md`;
  coordinate the archive finalize-fact work so they don't collide on that file.
- **`decompose-matrix`** — owns the decompose verb + the batch member-stub scaffold; the single `arc stub --cohort`
  is here, the batch is its.
- **`idiomatic-alignment`** — owns verb naming; the `arc integrate` command name (must not imply merge) + the final
  verb register coordinate with it.
- **`interlock-release-refinement`** — the archive finalize-write half is pulled here; its approval-collapse stays.
- **`roadmap-tooling`** — receives the derived-state predicates / Parked bucket this surface emits.
- **`coord-probe`** — its stale-local-branch reaper coordinates with the teardown surface (consumer edge, not owner).
- **`out-of-wu-entry` / `cold-start-init-polish`** — share `run-errand`'s relocation / the fixed `arc start`
  behavior; no gate (this WU is `P1`, lands first; facet 2 pulled here, the rest stays).

### Forward-compat constraints (design-toward)

From the 2026-06-18 forward-compat check (OSD / ADR-022; storage-evolution / arc-backend; principle-anchored-core).
No mechanic is superseded or descoped — these are *how-to-build* constraints so the v1 re-homes onto the future
substrate without reshape.

- **Q1 teardown gate — validated.** Gating on arc-state (`completed/`-presence) + push-state is the *exact*
  storage-agnostic pattern the model prescribes; git-reachability-inference is its named anti-pattern. push-state is
  a data-loss safety check on git refs, distinct from lifecycle-state resolution (the only thing barred from git).
- **Write through the field/record seam.** Every meta / inbox state-write (the `integrate` flip, archive facts, meta
  backfill, planning fields, inbox-line removal, the guarded executor writes) goes through the field-model write path
  (`META_FIELDS` / `renderMetaFile` for meta; a targeted inbox-write for USER-INBOX) — never raw whole-file
  string-poking or blind clobber. This is the lift-without-reshape contract (OSD) and leaves the seam where
  version-checked writes slot in later (arc-backend Principle 3).
- **New `META_FIELDS` stay storage-agnostic** — no per-artifact tracking booleans, no "lives in the tracked tree"
  assumption baked into a field (ADR-022 Principles 2 & 8).
- **Archive finalize = fields, not a block** — model PR-URL / Completed as `META_FIELDS` entries (not in the set
  yet), not a free-floating appended prose block (ADR-022 §4: "no separate completion or status document — that
  content is `meta-*` fields").
- **USER-INBOX removal** — idempotent (no-op-when-absent), *targeted* (a whole-file rewrite would not map to the
  future inbox-as-event-log drain *event*), title-keyed in v1 forward-compat to OSD's `_Slug:_` (OSD owns the
  `_Slug:_` field; "slug-matched" is the intent, the interim match key is the entry title).
- **Errand identity** — the slug is the logical identity, `chore/<slug>` the projection; the cut consumes the slug
  and never recovers identity by parsing the branch. The durable errand-identity record is `errand-lattice`'s.

### Class / decompose read

Still **one `Heavy` WU.** The re-audit + forward-compat check grew the surface (the `arc integrate`, inbox-line,
planning-field, and errand-cut entries) but kept it one mechanic class on one surface (the executor / mutator / verb
surface), so it stays cohesive — a decompose would fragment it. The teardown-verb de-dup with `errand-lattice` — the
one thing that could have forced a coordination split — is settled (**one verb, owned here**). It is now a *fuller*
Heavy: the phase count (teardown / archive-finalize / meta-shape / `arc integrate` / planning-field-writes /
errand-create-leg) is climbing — keep it honest at `create-spec`, but no decompose trigger.

## Seed deliverables (the known mechanics)

These are the confirmed seed; the audit confirms scope around them.

1. **Post-merge teardown CLI verb.** The integration tail's deterministic post-merge cleanup — reap the merged
   branch + remove the worktree, worktree-kind dispatched, presence-guarded — currently hand-run in **three** sites:
   `integrate-work-unit.md` Step 13, the `session-handoff.md` finalize pass, and `decompose-work-unit.md`'s
   park-exit (force `-D`). Factor it to a CLI surface reusing `lifecycle-transition-core`'s executor
   `reconcile-worktree:teardown` leg, a **new merged-safe branch-delete variant** (distinct from the force
   `reconcile-branch:delete` (`-D`) that park/abandon use), and the **`git fetch --prune` stale-tracking-ref leg**.
   The shipped source is `async-merge-lifecycle`'s inline `integrate-work-unit.md` Step 13 (+ `decompose`'s
   park-exit block); the verb preserves its eager/lazy timing but **hardens the safety gate** — the shipped
   `git branch -d` reachability check false-negatives under squash/rebase merges, so the variant gates on
   arc-state + push-state (merge-strategy-independent) rather than reachability (§ Open questions). **Boundary
   (settled in
   `lifecycle-transition-core`):** preserve no physical teardown in `arc archive` — archive stays the mergeable
   sweep riding the ship PR; teardown is non-mergeable (deleting the branch closes the open PR) and runs **after**
   merge.
2. **Archive finalize-fact flags.** `arc archive` already owns the final archive meta mutation (state flip, branch
   clear, soft-field reset, relocation), but the PR-URL / Completed block + forward-field reconciliation that
   `template-meta.md` mandates post-integration is still hand-run. Teach `arc archive` to accept the remaining
   final-form facts as inputs — `--pr-url <url>` and `--completed <YYYY-MM-DD>` (default today, overrideable for
   resume/backfill) — and write them as meta **fields** (not a free-floating block — § Forward-compat) plus the
   forward-field reconcile. Keep it platform-light and explicit first (`--pr-url` optional → omit / placeholder +
   warn when absent, so backfill and offline work); GitHub inference layers on later from the integration ceremony.
   Coordinate the shared `archive-work-unit.md` surface with `scalable-core`'s `archive.preserve` work.
3. **Meta-shape mechanics cluster.** Two complementary deterministic gaps on the meta-shape surface (plus the
   executor-hardening rider above):
   - **Forward-reconcile a graduated meta against the code field model.** Graduating a stub minted before a field
     was added leaves the `active/` meta missing it (hit live at this WU's own init — the `Current Workflow`
     field, hand-added during the Path A reconcile). Teach the graduate transition to reconcile the relocated meta
     against `META_FIELDS`, backfilling any missing field with its **transition-appropriate** value (e.g. `Current
     Workflow` on a planning-entry graduate is `draft-design`, which `applyCurrentWorkflowField` already knows —
     not the template's `[none]`). **Settled posture: warn-and-backfill** — emit a one-line "backfilled N
     field(s)" notice; silently migrating a tracked doc's shape should be visible in ceremony output. (Not
     silent-backfill; not a meta-shape lint, which coordinates with `quality-gate-hooks` and is heavier than this
     WU needs.)
   - **Retire `template-meta.md` as a scaffold source.** The markdown `template-meta.md` and the code renderer
     (`renderMetaFile` over `META_FIELDS`) are a dual source of truth for meta shape that drifts (hit live: the
     template lacked the `Current Workflow` bullet `META_FIELDS` carries). The CLI already scaffolds every
     fresh-WU entry through `renderMetaFile`; route `init-work-unit` Path B and the Promote-Errand meta creation
     through it too, then delete `template-meta.md` (both copies). OSD-aligned — a managed doc's shape lives in
     code.
   - The two are complementary: retirement stops *newly minted* stubs from drifting; forward-reconcile heals
     *already-existing* metas at the graduate edge. Both sit on `lifecycle-transition-core`'s executor surface this
     WU already extends.

## Success signal

The work succeeds when each inventoried mechanic is invoked from one CLI-owned home rather than hand-run in
workflow markdown: the post-merge teardown fires via a single verb from both `integrate` and `decompose` (with a
merge-strategy-independent safety gate); `arc archive --pr-url --completed` writes the finalize block + forward
reconcile in one call (no hand-added block — the recurring live pain); a graduated meta carries every
`META_FIELDS` field with no hand-fill; and `template-meta.md` is gone. Falsifiable check: run each lifecycle
ceremony end to end and confirm no "set by hand" / "hand-add" / carry-and-skip teardown tail remains in its
markdown.

## Cross-cohort reconciliation map

These fragments captured the same mechanics against adjacent owners. They are **pointers** this companion
consolidates against during the audit — leave them in place until the audit repoints them; do not duplicate.

- `composable-workflows` (draft, post-merge-teardown entry) — owns the "is this shared block a CLI surface or a
  markdown fragment?" framing (its Option 1b). The **mechanic** is this companion's; the **fragment/visibility
  model** stays `composable-workflows`. Repoint its entry to here for the CLI-surface half.
- `interlock-release-refinement` (draft, archival-ceremony entry) — its archive-finalize facet ("append PR URL +
  Completed, reconcile forward-fields") is the **archive finalize-fact** mechanic above; the approval-collapse and
  ceremony judgment-side step stay there. Repoint the finalize-write half here.
- `errand-lattice` (draft, `arc errand close` "Complete teardown") — **real de-dup risk:** errand-close and
  WU-post-merge-teardown likely share the `reconcile-worktree:teardown` + merged-safe `branch -d` legs but differ
  in judgment shell. The audit must settle **one verb vs. two** with these owners before either builds.
- `coord-probe` (draft) — its stale-local-branch reaper coordinates with the post-merge teardown surface; a
  consumer/coordination edge, not an owner. Surface the seam, don't absorb it.
- `async-merge-lifecycle` (**shipped** — `completed/2026-q2/22_async-merge-lifecycle`) — settled the teardown
  **timing** (eager-in-ceremony + lazy sweep/finalize backstop) and authored it inline in `integrate-work-unit.md`
  Step 13 + the same-session finalize pass, symmetric across both worktree arms, deliberately choosing inline-now
  over the `composable-workflows` hoist. This WU factors that shipped inline teardown (plus `decompose`'s park-exit
  block) into the CLI verb — preserving the timing, hardening the safety model (§ Open questions). The earlier
  "`concurrent-work-conventions` carries the open timing question" framing was stale state-blind prose: that
  question shipped.

## Positioning — companion, not a closeout-gating member

By the cohort's consistency-on-exit standard these mechanics are **un-enhanced / further-migration** (the substrate
does the transition correctly today; this adds a CLI nicety), the category that standard explicitly leaves out of
`lifecycle-closeout` — the `graduation-cleanup` precedent (a named cohort-adjacent companion that stays downstream).
So `lifecycle-closeout` does **not** depend on this WU; the cohort's closeout criteria are unaffected by it.
Sequences independently as a fast-follow off `lifecycle-transition-core` (shipped), parallel-able with the cohort's
other tail members.

## Remaining for create-spec (detail-level)

The audit is complete and the forward-compat check is done; what remains is create-spec-grade detail, not open
fundamentals. (The teardown *safety model* — arc-state authority + push-state safety, **not** reachability — is
**settled** and forward-compat-validated, see § Forward-compat. `Class` / decompose is **settled**: one `Heavy` WU.
One verb vs. two is **settled**: one verb, owned here. The squash/rebase gap that motivated the safety-model fix:
the shipped inline `git branch -d` false-negatives under squash/rebase, so the in-place branch lingers with no
backstop — the arc-state + push-state gate corrects it, backward-compatibly.)

- **Push-state safety-check shape** — the exact durability check the teardown gate runs (the model is settled).
- **Executor-hardening distinct-status name + payload** (the *distinct-status* call itself is settled).
- **Archive-finalize GitHub-inference locus** — integration ceremony vs. verb (verb stays platform-light; `--pr-url`
  optional when absent).
- **`arc integrate` command name** — coordinate with `idiomatic-alignment`; must not imply performing the merge.
- **`Class` / `Task List` / `Next Action` ownership** — confirm claim-here vs. a `planning-pipeline-readiness`
  follow-on.
- **decompose batch-scaffold** — generalize `arc stub --cohort` to a batch vs. leave it to `decompose-matrix`'s verb.

## Dependencies

- **Cohort-internal:** `Depends On: lifecycle-transition-core` — extends its executor / mutator bundle (the
  teardown legs, the archive verb). Resolver model assumed available.
- **Coordination (not blockers):** `composable-workflows` (teardown Option-1b supersede), `errand-lattice` (verb
  de-dup + errand-identity question, routed), `planning-pipeline-readiness` (shipped — planning-field-write surface),
  `scalable-core` (`archive.preserve` collision on `archive-work-unit.md`), `decompose-matrix` (batch scaffold),
  `idiomatic-alignment` (verb naming), `interlock-release-refinement` (archive-finalize ceremony half),
  `coord-probe` (reaper seam).
- **Shipped source (not a blocker):** `async-merge-lifecycle` — its inline `integrate-work-unit.md` Step 13
  teardown is the migration source this verb factors to the CLI (timing preserved, safety model hardened).
- **Downstream:** none — this is a tail companion; nothing depends on it (notably **not** `lifecycle-closeout`).

## Continuity

- **Readiness:** maturing → near formalization-ready. The audit is complete (full corpus swept + reconciled), the
  inbound buffer is drained, the forward-compat check is done (no scope change; design-toward constraints recorded),
  and the open design calls are settled to leans with only create-spec detail remaining.
- **Next:** re-run `assess-draft-readiness`; on ready, `create-spec`. No decompose — one `Heavy` WU.

---
