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

### `[x]` **1.4 Add always-loaded commit-path awareness**

- _Goal:_ A workflow commit can fire the release wrapper and compose a conformant message without re-probing
  `--help` or reconstructing the format from recent `git log`.

    - `[x]` **1.4.a Document the wrapper interface in `AGENT-BRIEF.ARC` § Release wrappers**
        - Added the mirrored always-loaded wrapper call-shape: after interlock validation,
          `arc release commit` mirrors `git commit` message/flag handling, while `arc release push` supplies
          `origin <current-branch>` itself, takes no target argument, and refuses destructive flags.

    - `[x]` **1.4.b Sharpen the commit directive in `DEV-RULES.ARC` § Commit Discipline**
        - Added the mirrored commit-format directive: load the `commit-format` and `commit-footer` methods before
          composing any commit message, and do not reconstruct the format from recent `git log` examples.

- _Outcome:_ The always-loaded commit-path guidance now gives agents the wrapper interface and method-load
  directive needed at workflow commit fire-sites, while leaving the configurable format/footer content in the
  methods as the single source of truth.

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

### `[x]` **2.1 Surface notes/disk-drift on the `session-handoff` probe's `user` slot**

- _Goal:_ The `session-handoff` probe's `user` slot surfaces a disk-ahead-of-ref drift, at parity with
  `session-init`'s `notesDriftSurface` / `loadNeeded`.

    - `[x]` **2.1.a Enrich the handoff `user` slot in the status probe**
        - `SessionHandoffResult.user` now uses a shared session-user value shape that carries finalized
          `loadNeeded` / `notesDriftSurface` without introducing a handoff-specific type.
        - `runSessionHandoffStatus` resolves raw clean-arm `notesDrift` with `activeWuName: null`, reusing
          `resolveCleanArmNotesVerdict` to set `loadNeeded` for `behind` and advisory surfaces for
          `mixed` / `missing`.
        - Added handoff orchestration coverage for behind, mixed/missing, and no-drift cases in
          `__tests__/unit/status/run.test.ts`.

    - `[x]` **2.1.b Surface the drift in the `session-handoff` workflow**
        - Both `session-handoff` copies now document the clean-arm `loadNeeded` / `notesDriftSurface` user-slot
          signals and render unresolved `notesDriftSurface` in Confirm Handoff with the session-init advisory
          wording, suppressing it when sync already saved or pushed the notes leg.

- _Outcome:_ The handoff status probe and workflow now share session-init's notes/disk drift surface: the probe
  finalizes `loadNeeded` / `notesDriftSurface`, and Confirm Handoff reports unresolved advisory drift without
  duplicating successfully synced notes.

### `[x]` **2.2 Harden `arc errand close` against a host-deleted branch**

- _Goal:_ `arc errand close --force` succeeds after a `gh pr merge --delete-branch` merge — the reap clears the
  record even when the local branch is already gone (no orphan in `refs/arc/user/{id}/errands`) — and the
  non-`--force` refusal names `--force` as the escape.

- _Outcome:_ `closeErrand` now checks whether the local branch still exists before reaping: `--force` closes and
  removes the record when the branch is already gone, while the non-`--force` path keeps the record and names the
  `--force` escape. Integration and e2e coverage exercise already-gone branches, normal branch reaping, and the
  actionable refusal.

### `[x]` **2.3 Eliminate the `arc activate` foreign-write false-positive**

- _Goal:_ `arc activate` on a pushed planning branch emits no spurious "Foreign-owned write" warning, with
  `arc errand check`'s overlap detection unchanged.

    - `[x]` **2.3.a Add meta-path self-exclusion to `detectForeignArtifactOverlap`**
        - `ForeignArtifactDetectionOptions` now accepts optional `originatingMetaPath`, and
          `detectForeignArtifactOverlap` excludes candidates whose `metaFilePath` matches it alongside the
          existing worktree-path self-exclusion.
        - Unit coverage now proves remote-only same-meta candidates are skipped before git diffing, existing
          worktree self-exclusion still needs no meta path, and genuine foreign meta overlaps still report.

    - `[x]` **2.3.b Resolve and thread the originating meta from the foreign-write check**
        - `check-foreign-writes.ts` now resolves the active WU via `resolveActiveWu`, threads the resolved meta
          path into `detectStagedForeignWrites`, and forwards it to `detectForeignArtifactOverlap`.
        - Unit coverage now proves the foreign-write path suppresses same-meta remote-only activation refs,
          resolves the active meta path from disk, and still reports genuine overlaps when no originating meta
          path is supplied.

- _Outcome:_ The foreign-write hook now self-excludes both the committing worktree and the committing WU's meta
  path, eliminating the pushed-planning-branch activation false-positive while preserving the shared overlap
  detector's behavior for errand-style consumers that pass no meta path.

## **Phase 3:** Verification

### `[x]` **3.1 Complete verification** — load and follow `verify-work-unit.md`

- _Quality gates:_ Tier 3 clean — `npm run -s lint:md`, `npm run lint:ts`, `npm run lint:sh`,
  `npm run typecheck`, `npm run typecheck:test`, full `npm test` (3510 passed, 1 skipped), and
  `npm run build` all passed.

- _Success criteria:_ 10 criteria checked: 10 met, 0 superseded, 0 unmet. Verification confirmed the 8 PRD
  criteria plus the standard quality-gates and ready-for-integration criteria.

---

## Success Criteria

- `[x]` `session-handoff` runs as a single turn with no housekeep offer or `**Housekeep:**` advisory line,
  and its probe-consumption table carries no `inboxState` row.
- `[x]` The `session-handoff` probe's `user` slot surfaces a disk-ahead-of-ref drift (parity with
  `session-init`'s `notesDriftSurface` / `loadNeeded`).
- `[x]` A `session-init` after a state-changing handoff push reports git facts from the live probe and never
  echoes a contradicting stale SESSION-NOTES git-state line.
- `[x]` `arc-session --next` on a clean Resume arm begins the active WU's Next Action without the proceed
  prompt; any orientation conditional surface falls back to the prompt; bare `--next` on the no-WU arm is a
  no-op.
- `[x]` `arc-session --start <wu-slug>` on a clean no-active-WU Orient arm starts the named backlog WU past
  discovery and the confirm-only init offer while init's commit/push interlocks and `Class` guard still fire.
- `[x]` `arc errand close --force` succeeds after a `gh pr merge --delete-branch` merge — the delete-if-exists
  reap clears the record even when the local branch is already gone (no orphan in
  `refs/arc/user/{id}/errands`), and the non-`--force` refusal names `--force` as the escape.
- `[x]` `arc activate` on a pushed planning branch emits no spurious "Foreign-owned write" warning, and
  `arc errand check`'s overlap detection is unchanged (tests cover both consumers).
- `[x]` `AGENT-BRIEF.ARC` § Release wrappers states the wrapper-to-`git` interface (lean operational context,
  not internals), and `DEV-RULES.ARC` § Commit Discipline carries an explicit load-the-methods /
  don't-reconstruct-from-`git log` directive — with no format/footer content copied out of the methods.
- `[x]` All quality gates pass (tests, linting, type checking)
- `[x]` Ready for integration

---
