# Draft: Lifecycle UX Polish

- **Origin:** [internal] — assembled at the 2026-06-27 housekeep drain from a cluster of session- and
  work-unit-lifecycle rough edges that surfaced across recent WUs and errands. Kept whole as one cleanup unit
  rather than scattered back into the heavier WUs whose buffers had been collecting the lightweight routes.
- **Cohort:** [none] — companion to `cold-start-init-polish`, in the `graduation-cleanup` mold (a named cleanup
  stub, no membership gate, sequences independently). Sibling loci: `cold-start-init-polish` owns the cold-start
  WU-*init* seams; this owns the *handoff / errand / activate / session-entry* seams. If the two ever warrant a
  two-member cleanup cohort, that is a planning call, not a housekeep action.
- **Purpose:** Smooth the lifecycle's operational rough edges — handoff noise, init/notes state-honesty, errand-
  and activate-ceremony robustness, and a session-entry ergonomics signal. Each facet is determinate (the design
  is settled coming in); the WU exists to ship them as one coherent, reviewable unit rather than as scattered
  errands. Several directly reduce friction for the imminent parallel-sessions push.

- **State:** Draft — assembled 2026-06-27. `Class` [TBD]; confirm at draft-design — likely Light–Heavy (the
  workflow/doc lobe is Light; the code/script lobe carries two reviewed-lane fixes).

---

## Facets (kept whole)

Two lobes: workflow/doc edits, and code/script robustness. The doc lobe is Light; the code lobe is reviewed-lane.

### Workflow / doc lobe

1. **Remove the handoff housekeep offer entirely.** `session-handoff` offers a between-WUs housekeep drain
   (Compose-Handoff step 3, *"USER-INBOX has N pending capture(s). Run arc-housekeep before handoff sync?"*) plus
   a Confirm-Handoff `**Housekeep:**` advisory line. Both are noise at end-of-session: handoff should be a single
   turn, the offer interrupts the handoff→sync flow, and its gate is only `housekeepNeeded` (not between-WUs), so
   it can fire **mid-WU** where the drain can't even run (it needs a base-branch write context). The nudge already
   lives at the right moment — `session-init`'s Orient arm, at session *start*, low-context, base context
   available. Remove the step-3 offer, the Confirm-Handoff advisory line, and the now-dead `inboxState` row from
   `session-handoff`'s probe-consumption table. Keep the shared `arc status` `inboxState` field and the
   `session-init` Orient soft-offer untouched. *Captured during `arc-session` orient, 2026-06-27.*

2. **Mirror the notes/disk-drift surface onto the `session-handoff` probe's `user` slot.** The handoff probe's
   `user` slot reports ref-vs-remote topology only (`refState: same`), so a handoff can report notes "clean" while
   the working tree has unsaved user-notes changes (disk ahead of ref) — e.g. an inbox drain not yet saved. No
   data loss (`arc sync` runs `runUserSave` first, so the sync leg captures it) — a cosmetic observability-symmetry
   gap. `session-init` already got the parallel disk-vs-ref surface (`notesDriftSurface` / `loadNeeded`); add the
   equivalent to the handoff probe. *Captured 2026-06-26, between-WUs reflection after a housekeep drain.*

3. **`session-init` sources git facts from the probe, never from stale SESSION-NOTES prose.** Handoff can write
   git-state prose into SESSION-NOTES; the handoff push then changes the real state, leaving the prose stale, and
   a later `session-init` can echo the stale note against a live probe and contradict it. Make `session-init`
   source git facts only from the probe and never from SESSION-NOTES prose. (Optional stretch: a write-time
   backstop that derives any handoff git-state summary from a fresh probe at compose/commit time so the note stays
   honest for human readers — not core.) *Re-homed from the `handoff-optimization` inbound buffer (originally
   `USER-INBOX § Backlog`, housekeep drain 2026-06-06; captured during `class-model-foundation` Task 5.1 kickoff);
   pulled forward here because it is a determinate honesty fix adjacent to facets 1–2, not a latency/reasoning-load
   concern.*

4. **`arc-session --next` — a session-entry auto-proceed signal.** A per-invocation autonomy modifier (not a
   locus-redirect sibling of `--errand` / `--housekeep` / `--plan`): run full `session-init` but skip the
   "proceed to Next Action?" gate and begin the Next Action directly. Auto-proceed **only** when orientation would
   be the bare-clean shape — any Step 6 conditional surface (sync state, freshness gap, blockers, uncommitted
   changes) or Step 7 mismatch falls back to the normal prompt; stop-and-ask always wins. Settled in discussion:
   per-invocation only (never a config default — a standing auto-proceed would erode the review-increment
   invariant); arm-conditional (no-op on the no-WU Orient arm, where discovery is the point); scope is one step
   only (normal task-interlock resumes at the first leaf). Prefer the name `--next` over `--yes` (avoids the
   `--force`-like "yes to everything" connotation). Directly smooths actual parallel sessions, which is the
   near-term motivation. *Captured during `state-ref-write-safety` Task 4.2 handoff, 2026-06-27.*

   *Seeded extension (added during `lifecycle-ux-polish` init, 2026-06-27):* the modifier also covers the no-WU
   Orient arm **when a positional seed names a backlog WU** — `arc-session --next <slug>` auto-proceeds past
   discovery and the existing confirm-only init offer to initialize the named WU. This *sharpens* the
   arm-conditional rule rather than contradicting it: no-WU + no-seed stays a no-op (discovery is the point);
   no-WU + seed auto-inits. It also unifies with the positional seed already in `session-init` (today
   confirm-only) — `--next` + seed is simply "auto-proceed past the confirm," so a dedicated `--start <slug>` verb
   is unnecessary. **Caveat (the friction boundary):** unlike resume-arm `--next` (one cheap step — begin an
   already-scaffolded next task), seeded auto-init runs the full init ceremony — cuts a branch, commits the meta
   (`workflowCommit`), pushes (`workflowPush`), and trips the resolve-weight guard. Auto-proceed should skip only
   the *ergonomic* friction (discovery + the confirm-only offer); it must still honor init's own commit/push
   interlocks. Ergonomics improve further with inline weight resolution at init (the `arc start --class` flag,
   owned by `cli-substrate-adoption` — cross-referenced here, not held); absent it, seeded auto-init degrades
   gracefully to the confirm offer on a still-unresolved stub. *Resolved disposition, 2026-06-27: fold here as a
   facet-4 refinement; `--class` stays in `cli-substrate-adoption`.*

### Code / script lobe (reviewed lane)

5. **Harden `arc errand close` against a host-deleted branch.** Merging an errand PR with
   `gh pr merge --delete-branch` (host auto-delete-on-merge, the common flow) deletes the **local** branch too and
   breaks `arc errand close` two ways: (1) it **refuses** — the reap-safety check can't confirm via the
   now-pruned upstream and reports "not landed in `<base>`" even when the commits are provably ancestors of base
   (verified live on a real merge commit, not a squash); (2) `--force`, the documented escape, then **errors** on
   `git branch -D <branch>` (branch already gone) and leaves the record **orphaned** in
   `refs/arc/user/{id}/errands`. The orphan is inert (`session-init` `errandState` surfaces it nowhere), but the
   escape hatch being non-functional is the "shouldn't happen" part. Approach: (1) reap-safety fallback — when the
   upstream ref is pruned, confirm shipped via `git merge-base --is-ancestor <tip> <base>` (recognize merge-commit
   containment, not just upstream/cherry); (2) make the reap tolerate an already-absent branch (delete-if-exists)
   so `--force` always clears the record even with no branch to delete. Coordinate with
   `operational-state-docs`, whose records re-home subsumes the case-(1) half — this sharpens it with the
   merge-commit variant and the broken-`--force` (case 2) bug OSD does not record. *Captured during
   `reconcile-shipped-subdirs` errand integration — hit live closing the errand after a `--delete-branch` merge,
   2026-06-27.*

6. **Eliminate the `arc activate` foreign-write false-positive.** Every `arc activate` whose planning branch was
   pushed emits a spurious "Foreign-owned write" warning at the activation commit. `scripts/check-foreign-writes.ts`
   derives the in-flight set from local refs (including the still-present remote-tracking `origin/plan/<slug>`,
   deleted only at the activate ceremony's last step, *after* the commit) and self-excludes by **worktree path**,
   not WU **slug** — so the WU's own renamed-from `origin/plan/<slug>` (remote-only, no worktree, same
   `meta-<slug>.md`) trips the overlap check against its own meta. Systematic cry-wolf that desensitizes operators
   to real warnings. Approach: self-exclude in-flight entries sharing the current WU's **slug** (the renamed-from
   `plan/<slug>` is the same WU), or stop `runActiveInFlight(localOnly)` from counting a stale renamed-from
   remote-tracking ref as a distinct in-flight WU — slug is cheaply resolvable now that `lifecycle-state-resolver`
   ships. Touches `scripts/check-foreign-writes.ts` plus the shared overlap primitive
   (`detectForeignArtifactOverlap` / `projectInFlightToOverlapRoster` / `runActiveInFlight` in `lib/git`); the
   primitive is **shared** with `arc errand check` → reviewed lane. *Folds the retired `foreign-write-self-exclusion`
   standalone stub (captured during `lifecycle-closeout` activation, 2026-06-23); pulled in as a thematic sibling
   to facet 5 — both are lifecycle-ceremony git-state robustness fixes.*

## Open design questions

- **Facet 4 (`--next`):** whether it rides the `out-of-wu-entry` dispatch surface or stands alone — an
  implementation-placement call, not a behavior question (the behavior is settled above).
- **Facet 4 seeded extension:** the exact gate-interaction for seeded auto-init — confirm that auto-proceed skips
  only discovery + the confirm-only offer while init's `workflowCommit` / `workflowPush` interlocks still fire (or
  route via release opt-in, as elsewhere). The behavior principle is settled above; this is the mechanism call.
  Coordinate the inline-weight dependency with `cli-substrate-adoption`'s `arc start --class` facet.
- **Facet 6 (foreign-write):** which layer hosts the slug-keyed self-exclusion —
  `projectInFlightToOverlapRoster` vs. `detectForeignArtifactOverlap` vs. `runActiveInFlight`. Reviewed-lane;
  second-look for design hiding in the exclusion-layer call.

## Scope Estimate

Small–Medium. The workflow/doc lobe (facets 1–4) is Light — markdown edits to `session-handoff` / `session-init`
plus a CLI flag for `--next`, across the package source and the `.arc/` copy. The code/script lobe (facets 5–6)
is two reviewed-lane robustness fixes touching `arc errand close` reap logic and the shared `lib/git` overlap
primitive (+ tests). `Class` likely Light–Heavy depending on how much the `--next` flag and the overlap-layer
placement formalize; confirm at draft-design. May decompose if either reviewed-lane fix grows.

## Continuity

- **Readiness:** stub-shaped; the facet cluster and its provenance are preserved. The design questions at first
  iteration are the two implementation-placement calls above, and confirming the cluster holds as one WU.
- **Next:** activate via `init-work-unit` → iterate via `arc-plan` → `draft-design`. First move: resolve `Class`
  and confirm the lobe split; the doc-lobe facets (1–4) can land first as a clean Light increment ahead of the
  reviewed-lane lobe.

---
