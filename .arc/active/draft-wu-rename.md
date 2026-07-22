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
- **Seeded by extraction, not groomed.** The direction below is settled by the founding capture plus the
  2026-07-21 viability read; it needs a `--plan wu-rename` pass to close the open calls before spec.

---

## Grooming status (continuity)

> _Updated each `--plan wu-rename` pass — see `draft-design` § Re-synthesize. This is the resume anchor._

- **Readiness:** `rough-plus` — direction and scope boundary are settled; the open items below are bounded
  design calls, not direction forks.
- **Resolved (at extraction, 2026-07-21):**
    - **Identity relocation is in scope, not a follow-up.** The motivating cost is wrong names on visible
      tooling surfaces (shell prompt, worktree directory, `git branch`, the session-header branch line). An
      artifact-only rename fixes the surfaces ARC renders and leaves every surface the developer visually
      parses wrong — and newly _mixed_ (slug says one name, branch and path say another). Done means the
      prompt reads the new name.
    - **Separability makes phasing safe, not identity relocation skippable.** The meta indirects through its
      `Branch:` field; resolution runs meta → branch (`wu-resolution.ts` derives from the meta path);
      occupancy keys on branch backing rather than slug (`lifecycle-guards.ts`). Slug/branch divergence is
      therefore a representable intermediate state — the license for phased delivery inside the unit, never
      for stopping at phase 1.
    - **Demand skews active-tier and scales with the decomposition program.** A name is discovered wrong once
      design has matured enough to understand the work — while the unit is active. Extraction cuts strand
      origin slugs on active units by construction, and `decomposition-doctrine` exists to make cuts more
      frequent. Backlog-only coverage misses the highest-demand case (full argument inherited from the
      founding capture).
    - **Local identity mechanics are cheap.** `git branch -m` for the local ref; `git worktree move` is a
      supported operation and the probe/roster read worktree state live from git, so no ARC surface holds a
      stale path. Notes _content_ is SHA-keyed and survives branch renames untouched; the path-keyed
      user-notes subdir must move in the same sweep — SESSION-NOTES path derivation comes from the meta
      filename, so deferring the subdir move orphans per-WU notes and breaks handoff continuity.
    - **Remote is push-new + delete-old behind a no-open-PR guard.** Git has no remote rename. Both live
      first-use cases are pre-PR `plan/` branches, so the guard covers v1 honestly. On other machines the
      deleted old name lands in session-init's existing branch-gone recovery — lean on it; build no new
      reconciliation machinery.
- **Open (developer calls, settle at grooming/spec):**
    - **PR-preserving remote rename** — the host branch-rename API (`gh`) retargets open PRs, where raw
      push+delete closes them. Lean: include it if it shakes out small — ship a finished feature rather than
      documented debt — else keep the no-open-PR guard and route the API path to a follow-up. Decide at spec
      once the verb's shape is concrete, not before.
    - **Second slug↔branch coupling audit** — known coupling: session-init infers session type from the
      branch pattern as a _fallback_ when meta `State` is unset (degraded path only). Pre-spec recon: sweep
      for any other place a slug is derived from a branch name (or vice versa) before committing to the
      phased-separability design.
    - **Sweep ordering and resume** — which steps are idempotent, what order survives interruption
      (artifacts → local identity → remote?), and what a re-run picks up cleanly after a partial failure.
    - **Errand rename** — out of scope unless it falls out free; this unit covers work-unit identity only.

## Problem / Motivation

No sanctioned rename transition exists at any lifecycle tier. Pre-commit CHECK 20 reads a disappearing
lifecycle-meta slug as a retirement requiring a finalized receipt, and the only receipt-producing transitions
(`decompose`, `abandon`) are semantically wrong for a rename — so a wanted retitle is structurally refused.
Two are blocked today, both recorded in their drafts' headers: `pr-decomposition` → `review-chunking` (the
2026-07-21 cohort-fit cut left the origin slug on the half that emits exactly one PR, inverting its meaning)
and `cohortless-decomposition` → `decomposition-machinery` (the 2026-07-19 consolidation widened its scope
past the original cohort-less-split concern). The cost is paid every session on the surfaces the developer
sees most — prompt, paths, roster — and it compounds: the decomposition program is designed to make cuts more
frequent, and every extraction cut risks stranding another origin slug on an active unit.

## Proposed direction — four deliverable areas

1. **Rename receipt kind + gate acceptance** — extend the retirement-receipt transition vocabulary
   (`abandon` | `decompose`) with a `rename` kind binding old and new slugs; teach CHECK 20 to accept a
   finalized rename receipt whose patch covers the disappearing slug. Extension of a shipped model, not a new
   one.
2. **Artifact and reference sweep** — meta/draft/spec/tasks filenames and slug fields, cross-references in
   sibling planning artifacts, ROADMAP regeneration in the same commit, and the base-side stub case (origin
   artifacts still on `main` while the WU is active in a worktree).
3. **Identity relocation** — local branch (`git branch -m`), worktree directory (`git worktree move`),
   user-notes subdir (move + save), remote ref (push-new + delete-old behind the no-open-PR guard), with the
   ordering/resume design from the open call above.
4. **First-use execution** — run the two pending retitles as the acceptance proof. Self-proving, the same
   posture the origin's area 5 recorded.

Deferred edges (documented, not scope): PR-preserving remote rename via the host API **pending the open call
above**; multi-machine reconciliation beyond what branch-gone recovery already provides.

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

## Unknowns and Assumptions

- **Class expectation: Light — watch the ratchet.** The receipt kind, gate acceptance, and sweep compose from
  shipped machinery (retirement-receipt codec, CHECK 20 validator, git-native operations). The
  identity-relocation orchestration (ordering, guards, resume) is the ratchet risk toward Heavy; resolve via
  `classify-work-unit` at spec. If it ratchets, the unit contends for the design slot rather than riding as a
  Light orthogonal — re-read scheduling then rather than pre-deciding.
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
