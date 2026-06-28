# Task List: lifecycle-ux-polish

- **Design:** `spec-lifecycle-ux-polish.md`

---

## **Phase 1:** Documentation & workflow polish

_Purpose:_ Land the markdown-only lifecycle polish — handoff-noise removal, the `session-init`
state-honesty directive, the `arc-session --next` / `--start` entry shortcuts, and always-loaded commit-path
awareness. The doc lobe is facets 1, 3, 4, and 7; it carries no code and no tests, so it can land ahead of
the code lobe on its own.

_Design decisions:_ Every edit here applies to **both** copies — the authoritative package source
(`packages/arc-framework/arc/...`, `.template.md` suffix on the workflow files) and the `.arc/` instance —
per two-copy sync discipline. Facets 1/3/4 edit workflow + skill surfaces; facet 7 edits adopter-facing
governance docs, so it observes the audience boundaries (no transitional framing, no internal-roadmap
pointers).

### `[x]` **1.1 Remove the handoff housekeep offer**

- _Goal:_ `session-handoff` runs as a single turn with no housekeep prompt anywhere, and no `inboxState`
  consumption remains in its probe wiring.

- _Outcome:_ Removed the handoff-side housekeep prompt and all `inboxState` consumption from both
  `session-handoff` copies; the between-WUs path now routes durable context, refreshes the probe, syncs, and
  confirms without a housekeep branch. The `session-init` Orient soft-offer remains the housekeep nudge.

### `[x]` **1.2 Source git facts in `session-init` from the probe only**

- _Goal:_ A `session-init` after a state-changing handoff push reports git facts from the live probe and
  never echoes a contradicting stale SESSION-NOTES git-state line.

- _Outcome:_ Added a SESSION-NOTES authority boundary to both `session-init` copies: SESSION-NOTES may supply
  context anchors, `Session Type`, and `Commit at Handoff`, but live git facts come from the probe and freshness
  check. Step 5 now treats the handoff hash as a baseline only, and Step 6 renders git state from probe slots.

### `[x]` **1.3 Add the `arc-session --next` / `--start` entry shortcuts**

- _Goal:_ `arc-session --next` begins the first Next Action without the "proceed?" prompt when orientation
  resolves bare-clean; `arc-session --start <wu-slug>` starts a named backlog WU from the no-active-WU Orient
  arm without the discovery and confirm-only init prompt; both fall back to the normal prompt or guard surface on
  any conditional surface or mismatch.

    - `[x]` **1.3.a Document `--next` in the `arc-session` skill**
        - Added the mirrored `SKILL.md` paragraph describing `--next` as a per-invocation auto-proceed
          modifier for an active WU's Next Action: it never relocates the checkout, never starts new work, is
          not a configuration default, and falls back to normal orientation when the resolved arm cannot skip
          the final proceed prompt.

    - `[x]` **1.3.b Document `--start <wu-slug>` in the `arc-session` skill**
        - Added the mirrored `SKILL.md` paragraph describing `--start <wu-slug>` as a no-active-WU shortcut to
          the existing start transition: it bypasses discovery and init confirmation prompts for a named backlog WU,
          but still honors sync, dirty-tree, freshness, mismatch, interlock, and `Class`-guard surfaces.

    - `[x]` **1.3.c Wire the entry-shortcut semantics into `session-init`**
        - Updated both `session-init` copies to keep the shortcuts out of the signal-leaf relocation spine,
          resolve `--start <wu-slug>` before the unseeded discovery pass as a pending no-active-WU Orient target,
          and fire either shortcut only at the bare-clean terminal gate when no conditional orientation surfaces,
          freshness gaps, blockers, or mismatches remain.

- _Outcome:_ The entry shortcuts now have separate lifecycle nouns across skill and workflow docs:
  `--next` begins an active WU's Next Action only, while `--start <wu-slug>` reaches the existing
  `arc start` and `init-work-unit` transition from the no-active-WU Orient arm without bypassing guards or
  interlocks.

### `[ ]` **1.4 Add always-loaded commit-path awareness**

- _Goal:_ A workflow commit can fire the release wrapper and compose a conformant message without re-probing
  `--help` or reconstructing the format from recent `git log`.

- _Rationale:_ Pointer + directive only — never a copy of the overridable format/footer content, so DRY and
  the override model both hold (spec No-go: no embedded commit-format skeleton). The methods stay the single
  source of truth; the hook stays the hard enforcement backstop.

- **Strategies:** strategy-package-project-sync.md

    - `[ ]` **1.4.a Document the wrapper interface in `AGENT-BRIEF.ARC` § Release wrappers**
        - State, leanly, what a caller needs to fire the wrappers without a `--help` probe (both copies):
          after the interlock-validation cascade, `arc release commit` takes the same message/flags as
          `git commit`, and `arc release push` supplies the `origin <current-branch>` target itself (no
          target argument) and refuses destructive flags. Operational context only — the section is
          always-loaded, so keep it tight; don't turn it into internals documentation.

    - `[ ]` **1.4.b Sharpen the commit directive in `DEV-RULES.ARC` § Commit Discipline**
        - Sharpen the existing § Commit format subsection (it already points at the methods) with a behavioral
          directive (both copies): before composing any commit message, load the `commit-format` /
          `commit-footer` methods — do not reconstruct the format from recent `git log` (it shows surface
          shape, not the hook-enforced rules). Pointer + directive only; no format content copied out of the
          methods.
        - _Note:_ These docs are adopter-facing (ship via package source) — keep the prose audience-clean
          (no transitional or internal-roadmap framing) and lean (always-loaded surface).

## **Phase 2:** Code lobe

_Purpose:_ Land the three TypeScript robustness/observability fixes — the `session-handoff` probe drift
surface (facet 2), `arc errand close` reap hardening (facet 5), and the `arc activate` foreign-write
false-positive elimination (facet 6). Each is an independent change with its own tests; facet 6 carries the
widest blast radius because its overlap primitive is shared by two consumers.

_Design decisions:_ The drift-computation logic facet 2 needs (`resolveCleanArmNotesVerdict`,
`computeSessionInitNotesDrift`) is already pure and reusable — facet 2 is orchestration plumbing + a type
change, not new drift logic. Facet 6 self-excludes at the detection core (`detectForeignArtifactOverlap`
already owns self-exclusion), keeping the oracle a general projection (spec Open item — facet 6 exclusion
layer). Repro/test context: `notes-lifecycle-ux-polish.md` §§ Facet 5, Facet 6.

### `[ ]` **2.1 Surface notes/disk-drift on the `session-handoff` probe's `user` slot**

- _Goal:_ The `session-handoff` probe's `user` slot surfaces a disk-ahead-of-ref drift, at parity with
  `session-init`'s `notesDriftSurface` / `loadNeeded`.

- _Context:_ The handoff `user` slot reports ref-vs-remote topology only, so a handoff can report notes
  "clean" while the working tree has unsaved user-notes edits. Observability-symmetry fix, not data-loss —
  `arc sync` already runs `runUserSave` first.

- **Strategies:** strategy-testing-methodology.md, strategy-package-project-sync.md

    - `[ ]` **2.1.a Enrich the handoff `user` slot in the status probe**
        - Widen `SessionHandoffResult.user` in `commands/status/types.ts` to the enriched shape carrying
          optional `loadNeeded` / `notesDriftSurface` — reuse `SessionInitUserValue` (or extract a shared
          type), not a new handoff-specific shape.
        - In `runSessionHandoffStatus` (`commands/status/run.ts`), call `resolveCleanArmNotesVerdict` over the
          raw `notesDrift` and enrich the handoff `user` slot — the same post-probe step session-init applies
          (`run.ts` ~403-419). Reuse the pure verdict resolver; add no new drift logic.
        - _Note:_ between-WUs handoff has no active WU, so `activeWuName` is null and the safe-auto-load
          sub-case (a missing active-WU `SESSION-NOTES`) can't apply — drift then surfaces as advisory, which
          is the correct handoff behavior.
        - Build `test-first` (one behavior at a time):
            - Handoff `user` slot carries `loadNeeded` when the disk is behind the notes ref (clean arm).
            - Handoff `user` slot carries `notesDriftSurface` when disk-vs-ref direction is `mixed` / `missing`.
            - Handoff `user` slot stays clean (neither field) when there is no disk-vs-ref drift.

    - `[ ]` **2.1.b Surface the drift in the `session-handoff` workflow**
        - Add the disk-drift advisory to `session-handoff.md` (both copies) where the `user` slot is consumed,
          mirroring `session-init`'s drift surfacing so a handoff reports an unsaved-edits drift.

### `[ ]` **2.2 Harden `arc errand close` against a host-deleted branch**

- _Goal:_ `arc errand close --force` succeeds after a `gh pr merge --delete-branch` merge — the reap clears the
  record even when the local branch is already gone (no orphan in `refs/arc/user/{id}/errands`) — and the
  non-`--force` refusal names `--force` as the escape.

- _Context:_ Host-auto-delete prunes the local branch; `closeErrand` then runs `git branch -D` unconditionally
  and throws before `removeErrandRecord`, so even `--force` (which only bypasses the safety check) orphans the
  record. _Notes:_ See `notes-lifecycle-ux-polish.md` § Facet 5.

- _Approach:_ No reap-safety auto-fallback is added — the base-containment check already in place
  (`isLandedInBase`, `git cherry`) covers a branch-present pruned-upstream merge, and once `--delete-branch`
  removes the local branch there is no ref or stored SHA to check, so `--force` is the right gate. Auto-confirm
  without `--force` (persisting a tip SHA) is routed to `operational-state-docs`.

- **Strategies:** strategy-testing-methodology.md

    - In `closeErrand` (`lib/errand/close.ts`), make the reap delete-if-exists: delete the local branch only
      when it exists, so `--force` always reaches `removeErrandRecord` and clears the record.
    - When the branch ref is absent on the non-`--force` path, surface a refusal that names `--force` as the
      escape (in `closeErrand` / its handler), rather than the generic "not landed in base" message.
    - Build `test-first` (one behavior at a time):
        - `--force` with no local branch present clears the record (no `git branch -D` error, no orphan).
        - A normal close with the branch present still reaps the branch, then removes the record.
        - The non-`--force` refusal on an absent branch names `--force` (actionable message).

### `[ ]` **2.3 Eliminate the `arc activate` foreign-write false-positive**

- _Goal:_ `arc activate` on a pushed planning branch emits no spurious "Foreign-owned write" warning, with
  `arc errand check`'s overlap detection unchanged.

- _Context:_ The renamed-from `origin/plan/<slug>` remote-tracking ref is still live at the activation commit
  (deleted only at the ceremony's last step), so the oracle counts it as a distinct in-flight entry pointing
  at the WU's own `meta-<slug>.md`, and the worktree-path self-exclusion misses it (remote-only, no worktree).
  _Notes:_ See `notes-lifecycle-ux-polish.md` § Facet 6 for the repro and both-consumer test setup.

- _Approach:_ Self-exclude at the detection core on the originating meta path (spec Open item — facet 6
  exclusion layer, leans the detection core). `detectForeignArtifactOverlap` already owns self-exclusion, so
  the meta-path predicate co-locates there; the oracle stays a general projection.

- **Strategies:** strategy-testing-methodology.md

    - `[ ]` **2.3.a Add meta-path self-exclusion to `detectForeignArtifactOverlap`**
        - Add an optional `originatingMetaPath` to `ForeignArtifactDetectionOptions`
          (`lib/git/foreign-artifact-detection.ts`); exclude a candidate whose `metaFilePath` equals it,
          alongside the existing `worktreePath !== originatingWorktreePath` match. The projection hardcodes
          `metaFilePath` as `.arc/active/meta-<name>.md`, so the caller constructs the same shape and the two
          match by string equality. Optional, so the `arc errand check` consumer (passes none) is unchanged.
        - Build `test-first` (one behavior at a time):
            - A remote-only candidate whose `metaFilePath` equals `originatingMetaPath` is excluded (the
              activate case — the renamed-from `origin/plan/<slug>` projecting to the WU's own meta).
            - The existing worktree-path self-exclusion is unchanged (no `originatingMetaPath` passed).
            - A genuine foreign overlap on another WU's meta is still reported.

    - `[ ]` **2.3.b Resolve and thread the originating meta from the foreign-write check**
        - In `check-foreign-writes.ts`, resolve the current WU's meta path via the active-WU resolver
          (`resolveActiveWu` in `lib/release/wu-resolution.ts`, already used by `arc release commit`, or the
          active meta-reader) and thread it as `originatingMetaPath` into `detectForeignArtifactOverlap`,
          symmetric with the `currentWorktreePath` it already resolves.
        - Build `test-first` (one behavior at a time):
            - An activation commit on a pushed planning branch (matching `origin/plan/<slug>` ref live) emits
              no foreign-write warning.
            - `arc errand check` passes no `originatingMetaPath` (errands carry no meta) and is unaffected —
              it still self-excludes by worktree path and reports genuine overlaps.

## **Phase 3:** Verification

### `[ ]` **3.1 Complete verification** — load and follow `verify-work-unit.md`

---

## Success Criteria

- `[ ]` `session-handoff` runs as a single turn with no housekeep offer or `**Housekeep:**` advisory line,
  and its probe-consumption table carries no `inboxState` row.
- `[ ]` The `session-handoff` probe's `user` slot surfaces a disk-ahead-of-ref drift (parity with
  `session-init`'s `notesDriftSurface` / `loadNeeded`).
- `[ ]` A `session-init` after a state-changing handoff push reports git facts from the live probe and never
  echoes a contradicting stale SESSION-NOTES git-state line.
- `[ ]` `arc-session --next` on a clean Resume arm begins the active WU's Next Action without the proceed
  prompt; any orientation conditional surface falls back to the prompt; bare `--next` on the no-WU arm is a
  no-op.
- `[ ]` `arc-session --start <wu-slug>` on a clean no-active-WU Orient arm starts the named backlog WU past
  discovery and the confirm-only init offer while init's commit/push interlocks and `Class` guard still fire.
- `[ ]` `arc errand close --force` succeeds after a `gh pr merge --delete-branch` merge — the delete-if-exists
  reap clears the record even when the local branch is already gone (no orphan in
  `refs/arc/user/{id}/errands`), and the non-`--force` refusal names `--force` as the escape.
- `[ ]` `arc activate` on a pushed planning branch emits no spurious "Foreign-owned write" warning, and
  `arc errand check`'s overlap detection is unchanged (tests cover both consumers).
- `[ ]` `AGENT-BRIEF.ARC` § Release wrappers states the wrapper-to-`git` interface (lean operational context,
  not internals), and `DEV-RULES.ARC` § Commit Discipline carries an explicit load-the-methods /
  don't-reconstruct-from-`git log` directive — with no format/footer content copied out of the methods.
- `[ ]` All quality gates pass (tests, linting, type checking)
- `[ ]` Ready for integration

---
