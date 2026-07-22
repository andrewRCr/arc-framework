# Draft: wu-rename — a sanctioned rename transition for work units

- **Origin:** [internal] — extracted from `cohortless-decomposition`'s area 5 (slug rename transition) on
  2026-07-21, pulled forward so the program's two recorded retitles stop waiting on the full machinery WU.
  Founding input: the `USER-INBOX § Work Unit` capture "Weigh the rename transition's tier scope toward
  active, not backlog-only" (2026-07-21), adopted here and integrated below.
- **Purpose:** Give work-unit renames a sanctioned, gate-accepted transition that delivers **name coherence
  across the surfaces the developer actually sees** — shell prompt, worktree paths, branch names — not just
  artifact internals. One verb (`arc rename`) producing one rename receipt the retirement gate accepts, plus a
  relocation sweep covering artifacts, references, branch, worktree directory, and user-notes subdir. First
  use: execute the two pending retitles (`pr-decomposition` → `review-chunking`,
  `cohortless-decomposition` → `decomposition-machinery`).
- **Groomed 2026-07-21 (first active planning pass).** Seeded at extraction by the founding capture plus the
  same-day viability read; the open calls are now closed — coupling audit run, remote-rename behavior verified
  against host documentation, ordering lean and scope confirms recorded below.

---

## Grooming status (continuity)

> _Updated each `--plan wu-rename` pass — see `draft-design` § Re-synthesize. This is the resume anchor._

- **Readiness:** `formalization-ready` — direction, scope boundary, and every formerly-open call are settled
  (assessed 2026-07-21: success signal stateable, no inbound buffer, no open design decisions).
- **Adversarial pass:** 1 of 1 (`Light` cap), 2026-07-21 — converged with folds: one major confirmed and
  folded (the self-rename locus direction), one major refuted at source (the remote-rename verification
  stands), two minors folded (guard-trip semantics; the teardown mid-window edge).
- **Resolved (at extraction, 2026-07-21):**
    - **Identity relocation is in scope, not a follow-up.** The motivating cost is wrong names on visible
      tooling surfaces (shell prompt, worktree directory, `git branch`, the session-header branch line). An
      artifact-only rename fixes the surfaces ARC renders and leaves every surface the developer visually
      parses wrong — and newly _mixed_ (slug says one name, branch and path say another). Done means the
      prompt reads the new name.
    - **Separability makes phasing safe, not identity relocation skippable.** The meta indirects through its
      `Branch:` field; resolution runs meta → branch (`wu-resolution.ts` derives from the meta path); the
      occupancy guard derives state from the meta's `(phase, location)` — never `git branch` inference — and
      matches its target by slug, branch only as the lite-layout fallback (`lifecycle-guards.ts`).
      Slug/branch divergence is therefore a representable intermediate state — the license for phased
      delivery inside the unit, never for stopping at phase 1.
    - **Demand skews active-tier and scales with the decomposition program.** A name is discovered wrong once
      design has matured enough to understand the work — while the unit is active. Extraction cuts strand
      origin slugs on active units by construction, and `decomposition-doctrine` exists to make cuts more
      frequent. Backlog-only coverage misses the highest-demand case (full argument inherited from the
      founding capture).
    - **Local identity mechanics are cheap.** `git branch -m` for the local ref; `git worktree move` is a
      supported operation and the probe/roster read worktree state live from git, so no ARC surface holds a
      stale path. Notes _content_ is SHA-keyed and survives branch renames untouched; the path-keyed
      user-notes subdir must move in the same sweep — SESSION-NOTES path derivation comes from the meta
      filename, so deferring the subdir move orphans per-WU notes and breaks handoff continuity. (One
      exception surfaced later: moving the worktree a session stands in is not cheap — the self-rename
      direction below owns it.)
    - **Remote is push-new + delete-old behind a no-open-PR guard.** Git has no remote rename. Both live
      first-use cases are pre-PR `plan/` branches, so the guard covers v1 honestly. On other machines the
      deleted old name lands in session-init's existing branch-gone recovery — lean on it; build no new
      reconciliation machinery.
- **Resolved (first planning pass, 2026-07-21):**
    - **No PR-preserving remote rename exists — the guard is the design, not v1 debt.** Verified against GitHub's
      branch-rename documentation: "If the renamed branch is the head branch of an open pull request, this pull
      request is closed." Only _base_ references retarget, a WU branch is always its PR's _head_, and PR head
      refs are not editable post-creation — so the host API closes the PR exactly as raw push-new + delete-old
      does, and no API path preserves it. The no-open-PR guard is permanent; the remote leg stays host-agnostic
      raw git (push-new + delete-old) with no `gh` dependency — consistent with ARC's platform-agnostic posture
      (GitHub is the default host, never a hard coupling). The guard itself detects an open PR host-agnostically
      by keying on ARC's own tracked state (the meta's `PR URL:` field), not a host API query. Trip behavior:
      an open PR refuses the entire rename — never a partial rename beside a live PR. Accepted residual: a PR
      opened out-of-band (absent from the meta) is invisible to the guard and would be closed by delete-old.
      Citation: GitHub Docs, "Renaming a branch," § About renaming branches (verified 2026-07-21, three
      independent fetches). The follow-up route is dropped.
    - **Coupling audit run — phased separability validated.** Every branch→slug derivation routes through one
      normalization nexus, `branchToWorkUnitSlug` (`completed-index.ts`); full inventory of it and the two
      independent couplings: cold-start name derivation (creation-time only), per-WU notes-sync fallback (fires
      only when no meta resolves), orphan-branch sweep (a second existing cleanup surface for a deleted old
      name), in-flight/STATUS.USER derivation (live during divergence — cosmetic mixed-name display, the very
      cost phase 2 removes), teardown branch matching (one real mid-window edge — below), session-type
      branch-pattern fallback (degraded path only), and worktree location (creation-time by documented design;
      live location reads from `git worktree list`). One correctness edge survives: teardown resolves the WU
      branch by slug projection (by design — the meta `Branch:` is `[none]` post-archive), so tearing down a
      phase-1-renamed WU mid-window reports the branch already reaped and orphans branch + worktree.
      Mitigation: the first-use retitles run both phases in one invocation (no cross-time window), and the
      spec records the edge for the general case. Every other site is fallback-, creation-time-, or
      display-only.
    - **Sweep ordering lean.** Artifacts + receipt commit first (atomic, gate-validated), then local branch
      rename, user-notes subdir move + save, remote (push-new + delete-old), and the worktree move as the
      final leg — every step check-then-do so a re-run after a partial failure converges, and everything
      durable completes before the one physically disruptive step. Fine detail crystallizes at spec.
    - **Self-rename is first-class, composed from shipped locus patterns** (surfaced by the 2026-07-21
      adversarial pass). The verb will usually run from inside the worktree it moves — the problem class
      teardown already treats as first-class (`isSelfTeardown`, the `chdir` process-locus seam, the
      run-from-outside husk fallback). Direction: detect self-rename (process locus inside the moving
      worktree); after the move, hop the locus (`chdir`) and close with a relocation handoff naming the new
      path (the fresh-session shape `--start` and teardown already use); where moving a cwd-occupied
      directory fails (Windows), degrade gracefully — every other leg is already durable, so surface the move
      as a follow-up run from outside. Occupancy guard input: `session-locus-model`'s lease model when
      shipped; best-effort dirty/live checks before then.
    - **Base-side stub handled by deferral.** The sweep never writes to the base; the old-slug copy on `main`
      reconciles at the ordinary integration merge (mechanism recorded at area 2 below).
    - **Errand rename confirmed out of scope.** Errand identity is branch + errand record — no meta, no
      lifecycle artifacts, no CHECK 20 exposure — so a rename needs none of this unit's machinery; nothing
      falls out free.
    - **Storage-evolution self-check: composes.** Forward-compat pass against `strategy-storage-evolution.md`:
      the meta→branch indirection this design strengthens is Principle 5 (WU identity decoupled from branch
      identity) directly; the rename receipt is a storage-agnostic slug-keyed record (Principle 2 / ADR-022);
      no new config axes. Impl guidance: route the artifact leg through the layout/path-resolution layer so
      the sweep lifts to the materialized tier unchanged.
- **Open:** [none]

## Problem / Motivation

No sanctioned rename transition exists at any lifecycle tier. Pre-commit CHECK 20 reads a disappearing
lifecycle-meta slug as a retirement requiring a finalized receipt, and the only receipt-producing transitions
(`decompose`, `abandon`, `park-planning`) are semantically wrong for a rename — so a wanted retitle is
structurally refused.
Two are blocked today, both recorded in their drafts' headers: `pr-decomposition` → `review-chunking` (the
2026-07-21 cohort-fit cut left the origin slug on the half that emits exactly one PR, inverting its meaning)
and `cohortless-decomposition` → `decomposition-machinery` (the 2026-07-19 consolidation widened its scope
past the original cohort-less-split concern). The cost is paid every session on the surfaces the developer
sees most — prompt, paths, roster — and it compounds: the decomposition program is designed to make cuts more
frequent, and every extraction cut risks stranding another origin slug on an active unit.

## Proposed direction — four deliverable areas

1. **Rename receipt kind + gate acceptance** — extend the retirement-receipt transition vocabulary
   (`abandon` | `decompose` | `park-planning`) with a `rename` kind binding old and new slugs; teach CHECK 20
   to accept a finalized rename receipt whose patch covers the disappearing slug. Extension of a shipped
   model, not a new one.
2. **Artifact and reference sweep** — meta/draft/spec/tasks filenames and slug fields, cross-references in
   sibling planning artifacts, ROADMAP regeneration in the same commit, and the base-side stub case (origin
   artifacts still on `main` while the WU is active in a worktree) — handled by deferral: the rename lands
   wholly on the WU branch, and the base's old-slug copy reconciles at the ordinary integration merge. That is
   the same window graduation already creates, and CHECK 20's merge exemption (result state inherited exactly
   from a parent) composes with it — no base-side write, no new machinery.
3. **Identity relocation** — local branch (`git branch -m`), worktree directory (`git worktree move`),
   user-notes subdir (move + save), remote ref (push-new + delete-old behind the no-open-PR guard), with the
   ordering/resume lean and the self-rename locus handoff recorded in Grooming status (fine detail at spec).
4. **First-use execution** — run the two pending retitles as the acceptance proof. Self-proving, the same
   posture the origin's area 5 recorded.

Deferred edges (documented, not scope): multi-machine reconciliation beyond what branch-gone recovery and the
orphan-branch sweep already provide. (A PR-preserving remote rename is not deferred — the host offers none;
see Grooming status.)

## Coordination

- `cohortless-decomposition` — the origin: its draft still lists area 5 and its header records the
  `decomposition-machinery` retitle intent. The held draft stays untouched for now; re-point area 5 to this
  WU at that unit's own first-use ceremony (base merge + retitle), which consumes the verb anyway.
- `pr-decomposition` — first-use target; time its retitle so it does not collide with the fast-laned
  grooming/spec-settle ceremonies it is running.
- `wu-lifecycle-state-model` — owns husk/terminal-state and transition vocabulary; this WU extends the
  shipped receipt transitions and mints no parallel state names (inherited from the origin's coordination).
- `retirement-record-relocation` — owns the retirement-record store location; read the store through its
  path, coordinate on the path rather than only transition semantics.
- `session-locus-model` — two-way seam, soft (no `Depends On` edge): its per-checkout locus records are
  rename-affected (the record ID digests the checkout path; the role subject carries the slug — both stale
  under the sweep), and its promotion choreography, occupancy/lease model, and process-locus hop are the
  shipped patterns the identity leg composes with (`spec-session-locus-model.md`). At spec, read its
  shipped-or-settled model; whichever unit lands first, the other absorbs the seam (its reconciliation
  already tolerates stale records).

## Unknowns and Assumptions

- **Class expectation: Light — watch the ratchet.** The receipt kind, gate acceptance, and sweep compose from
  shipped machinery (retirement-receipt codec, CHECK 20 validator, git-native operations). The
  identity-relocation orchestration (ordering, guards, resume) is the ratchet risk toward Heavy; resolve via
  `classify-work-unit` at spec. If it ratchets, the unit contends for the design slot rather than riding as a
  Light orthogonal — re-read scheduling then rather than pre-deciding. The 2026-07-21 coupling audit sized the
  orchestration surface small — one normalization nexus, a handful of degraded-path or creation-time call
  sites — supporting `Light`.
- **Cross-machine posture is lean-on-existing.** Branch-gone recovery and the materializable-candidate
  surfaces already cover the other-machine story for a deleted old branch name; assume no new machinery.
- **The retirement-record store stays where it is today.** If `retirement-record-relocation` moves it first,
  this WU consumes the new path; no ordering dependency either way.

## Scope Estimate

**Small–Medium.** One verb, one receipt kind, gate acceptance, and a bounded relocation sweep, package-synced,
with unit coverage on the receipt/gate path and an end-to-end on the sweep. Phased delivery inside the unit:
receipt/gate + artifact sweep first (unblocks the refused commits), identity relocation second (delivers the
motivation). The unit is not done at phase 1.

---
