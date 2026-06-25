# Task List: Out-of-WU Session Entry

- **Design:** `spec-out-of-wu-entry.md`

---

## **Phase 1:** Arm-orthogonal dispatch leaf in `session-init`

_Purpose:_ Make explicit out-of-WU intent route regardless of active-WU state — the core of the WU. Realign
`session-init`'s Step 2 entry dispatch so a signal leaf outranks the implicit resume/orient/cold-start dispatch,
preserves the active checkout, and routes to the signal's locus. This phase delivers `--errand` and `--housekeep`
end-to-end (their loci ship today) and documents `--plan`'s routing half (its locus completes in Phase 2).

_Design decisions:_ One arm-orthogonal leaf, not two per-arm branches — context-independence is structural
(Decisions 1–2). The spine reuses the shipped `resolveWriteContext` primitive, so `branch.protection` respect and
worktree-shape-agnosticism are inherited, not re-implemented. The leaf and spine are authored as cohesive,
extractable blocks so a later `composable-workflows` fragment is a clean lift — the seam is recorded in the notes,
never marked in the shipped workflow (internal WU names stay out of adopter-facing text). Coverage: 1.1 →
Decisions 1, 2, 5 (routing), 9; 1.2 → Decision 3; 1.3 → Decisions 6, 7; 1.4 → Decision 8. `session-init.md` is
adopter-facing — every edit lands in both `.arc/system/workflows/arc/session-lifecycle/session-init.md` and the
`packages/arc-framework/arc/...` mirror (package-source-first per `strategy-package-project-sync.md`). Full
rationale: `notes-out-of-wu-entry.md` § Design spine + per-signal locus.

### `[x]` **1.1 Insert the signal leaf and shared spine into Step 2 dispatch**

- _Goal:_ An explicit-intent signal routes to its locus on any arm — outranking and replacing the
  resume/orient/cold-start resolution — through one shared spine, with the active WU's checkout preserved.

    - `[x]` **1.1.a Add the signal-leaf precedence check ahead of the arm dispatch**
        - New `### Signal-leaf dispatch (precedence)` subsection placed after the branch-gone precondition and
          ahead of `### Entry dispatch`: signal present → run the spine; absent → fall through to the existing
          arm resolution unchanged. Reconciled the old `--errand` intro paragraph to point at the leaf (the arms
          below are now the signal-absent path); states that the spine's relocate + universal-only load supersede
          the sync-pull of the current branch and the full context-load on the signal path.

    - `[x]` **1.1.b Define the shared spine**
        - Authored as one cohesive single-entry/single-exit block — parse signal → displacement guard → relocate
          via `resolveWriteContext` (full → short-lived branch off base; partial → direct base commit) → load
          universal context only → run the locus workflow. States that relocation is uniform (the primitive
          resolves `branch.base` from config, so the primary worktree need not be on `main`).

    - `[x]` **1.1.c Add the per-signal locus routing table**
        - Locus table: `--errand` → `run-errand` Launch; `--housekeep` → `drain-inbox` (drain scope kept
          extensible, user inbox the default); `--plan <stub>` → `draft-design` loop. Design posture (Decision 9)
          woven as a closing note — arm only the declared goal, surface no unrequested routes, don't nag about
          the active WU. Added `drain-inbox` / `draft-design` reference-link definitions.

- _Outcome:_ The arm-orthogonal leaf landed in both copies (`session-init.md` + the package `.template.md`
  mirror — byte-identical in this region; only the Step 5 `arc:if` blocks differ).

### `[x]` **1.2 Two-gate confirmation and locus-scoped acknowledgment**

- _Goal:_ The leaf confirms along two distinct axes — sufficiency before acting, displacement before
  relocating — and closes on a locus-scoped acknowledgment rather than the full work-unit orientation.

    - `[x]` **1.2.a Document the sufficiency / elicitation gate**
        - Folded into spine step 1 (Parse): `--housekeep` always sufficient; bare `--errand` / `--plan` elicit
          first (prompt for the concern / adopt a flagged `§ Errand` capture / disambiguate the stub) before
          relocating; never silently launches.

    - `[x]` **1.2.b Document the displacement / precedence gate**
        - Folded into spine step 2 (Displacement guard): active WU / dirty checkout → confirm once before
          relocating; nothing checked out → proceed silently.

    - `[x]` **1.2.c Replace the Step-6 orientation with a locus-scoped acknowledgment**
        - Spine step 5 routes the close through "signal-leaf mode"; the Step 5 / Step 6 errand-mode gates are
          generalized to "Signal-leaf / errand mode" (any arm) — orient on the locus, not the WU.

- _Outcome:_ The sufficiency and displacement gates and the locus-scoped close fold into the spine (steps 1, 2,
  5); Step 5 (freshness / next-work skip) and Step 6 (orientation framing) cover the signal leaf on any arm, not
  just the Orient `--errand` path.

### `[x]` **1.3 Retire "signal not consumed"; support bare `--errand`; read errand identity from the record**

- _Goal:_ The Resume arm carries an actual route for an explicit signal (not a discard), a bare `--errand` is
  explicitly supported, and any errand identity the route needs comes from the record.

    - `[x]` **1.3.a Rewrite the "Errand signal not consumed (non-Orient arms)" block**
        - Block removed entirely — the signal is consumed by the leaf on any arm, and the Entry-dispatch intro
          already points there ("an explicit-intent signal … is handled by Signal-leaf dispatch above"). No
          trailing caveat needed.

    - `[x]` **1.3.b Support a bare `--errand` (absent seed)**
        - Covered by spine step 1 (bare `--errand` elicits first) + step 4 (universal-only load) — no separate
          cold-entry prose. (The `arc-session` skill half is Task 3.1.)

    - `[x]` **1.3.c State that errand identity is record-owned**
        - Satisfied structurally: the resume slug is the probe field `errandState.value.resume.slug` (Step 1),
          so the agent never parses the `chore/` prefix. No added prose; Decision 7 stays recorded in the spec.

### `[x]` **1.4 Pre-focus a positional backlog-WU arg on the Orient arm**

- _Goal:_ A positional arg naming a backlog WU lets the Orient/discovery arm pre-focus that WU and offer to
  init it — confirm-only, never auto-init.

- _Outcome:_ The Discovery arm and Step 5 now pre-focus a positional seed naming a backlog WU with a
  confirm-only init offer (match stays agent-interpreted, no probe wiring); the "Seed not consumed" note is
  narrowed to the Resume / Errand-resume / Materialize arms so it no longer claims discovery ignores the arg.

## **Phase 2:** `--plan` locus — in-place backlog grooming

_Purpose:_ Complete the `--plan` signal: enter `draft-design`'s content loop against a `backlog/` stub's draft
(`planned` or `provisional`) **in place** — no graduation to `active/`, no `plan/` branch, no false `parked`
state. Pairs the CLI draft-discovery change with the two `draft-design` workflow edits the signal's locus needs.

_Design decisions:_ Editing a backlog stub's draft is a content mutation, not a lifecycle transition (the state
resolver reads directory + meta `State`, neither of which changes; both backlog state-dirs sit outside the
`OCCUPYING` capacity set, so grooming stays out of parallel-capacity math for free) — so no state-machine change.
Committable context comes from the spine's relocate-to-grooming-branch, not `arc plan check`; the `draft-design`
gate-skip is the interim "approach A" of `composable-workflows`' fragment-skip (seam recorded in the notes, not
marked in the shipped `draft-design.md`). Continuity is the "3c" model (pause = commit + push; resume via
`--plan X`; the tracked draft is the continuity artifact — no marker, no SESSION-NOTES analog). Coverage: 2.1 +
2.2 → Decision 4. The `draft-design.md` edit is two-copy (mirror to `packages/arc-framework/arc/...`); the CLI
change (Task 2.1) is `src/`-only, not mirrored. Full rationale: `notes-out-of-wu-entry.md` § Design spine +
per-signal locus (`--plan` subsections).

### `[ ]` **2.1 Add a backlog-stub resolver backing draft-presence and `--plan` sufficiency**

- _Goal:_ A minimal reusable resolver locates a backlog stub by slug — its dir, state-dir, and draft path — so
  draft-presence and `--plan`'s sufficiency / disambiguation run as deterministic code, not agent-globbing of
  nested backlog dirs.

- _Context:_ `resolveDraftPresent` (`handlers/plan.ts`) currently does a single `stat` on the flat
  `.arc/active/draft-{slug}.md`. Backlog stubs are nested at variable depth —
  `backlog/{state}/[{cohort}/[{subcohort}/]]{name}/draft-{name}.md` — so a slug → stub lookup is a depth-aware
  walk across both state-dirs. A small resolver (rather than a bare draft-presence boolean) gives `--plan`'s
  sufficiency gate a real primitive instead of agent-globbing; `--plan` calls it directly, independent of
  `arc plan check`.

- _Rationale:_ A resolver earns adoption at deterministic call sites (code → code), not at agent discretion —
  so it's built for the two code consumers here, kept backlog-stub-scoped (not a general `slug → artifact`
  subsystem, not lifecycle state). `composable-workflows`' canonical resolver later absorbs and extends it;
  see `notes-out-of-wu-entry.md` § Forward-compat seams.

- _Strategies:_ strategy-testing-methodology.md, strategy-package-project-sync.md

    - `[ ]` **2.1.a Build the backlog-stub resolver**
        - `resolveBacklogStub(cwd, slug)` → `{ dir, stateDir, metaPath, draftPath | null } | null`, walking
          `backlog/{planned,provisional}/` at nested WU-dir depth; a stub-listing form for bare-`--plan`
          disambiguation. Co-locate with the existing backlog-walk pattern (`collectMetaFiles`,
          `lib/status/ready-mine-source.ts`).

        - Build `test-first` (one behavior at a time):
            - Resolves a `backlog/planned/{name}/` stub (dir + draft path).
            - Resolves a `backlog/provisional/{name}/` stub.
            - Resolves a cohort-nested stub (`backlog/planned/{cohort}/{name}/`).
            - Returns `draftPath: null` for a stub dir with no `draft-{name}.md`.
            - Returns `null` when no stub matches the slug in either state-dir.
            - Lists multiple matching stubs for disambiguation.

    - `[ ]` **2.1.b Back draft-presence and `--plan` sufficiency with the resolver**
        - Route `resolveDraftPresent` (or its `handlePlanCheck` caller) through the resolver so
          `arc plan check --name <stub>` sees a backlog stub's draft; keep the `active/` draft path working
          (regression). The `--plan` sufficiency gate (Task 1.2.a) consumes the same resolver.

### `[ ]` **2.2 Add the `--plan` entry-gate-skip and groom-and-stop exit to `draft-design`**

- _Goal:_ `draft-design` enters its content loop for a `--plan` grooming session past the planning-entry gate,
  and exits via an explicit groom-and-stop outcome that captures without advancing the stage.

- _Context:_ The `## Planning-entry gate` (`arc plan check`, `draft-design.md` line ~26) would `redirect` on a
  grooming branch; the spine already established committability, so the gate is skipped for this locus.
  `draft-design`'s advance is already conditional (line ~172: advance only when crossing into create-spec) —
  groom-and-stop is a third, _named_ outcome alongside forward-advance and the re-entry back-edge, so a session
  doesn't read "didn't advance" as an incomplete forward path.

    - `[ ]` **2.2.a Entry-gate-skip for the `--plan` grooming locus**
        - Document that a `--plan` grooming entry bypasses the planning-entry gate (committability was
          established by the spine's relocate). Scope the skip to the grooming-entry path — the entry signals the
          grooming context to `draft-design`, so the gate still fires on every normal draft-design entry (not a
          blanket gate removal). Structure the skip as a discrete block so a later fragment-skip is a clean
          replacement; the "approach A" seam is recorded in the notes, not marked in the shipped workflow.

    - `[ ]` **2.2.b Named groom-and-stop exit**
        - Add the groom-and-stop outcome: capture to the grooming branch, **do not advance** the stage pointer,
          the stub stays in its backlog state, resume via `--plan X`. State the "3c" continuity model (pause =
          commit + push; the tracked draft is the continuity artifact; no marker, no new durable state; the
          grooming branch stays out of occupancy math and is swept by the existing in-flight-chore sweep).

## **Phase 3:** Skill-surface alignment

_Purpose:_ Bring the skill docs into agreement with the new dispatch behavior so an invoking developer sees the
signals the workflow now honors.

_Design decisions:_ Skill behavior is the workflow's; the skill doc only describes the invocation surface.
Coverage: 3.1 → Decisions 5, 6 (surface) + `--plan`. The `arc-inbox` skill needs no change — grounding found its
`arc-session --errand` route reference already consistent with arm-orthogonal entry, and capture-identity
(`_Slug:_` → title) is out of scope per spec § No-gos (`operational-state-docs`'). Skill SKILL.md files are
two-copy (canonical in
`.arc/system/.internal/skills/` and `packages/arc-framework/arc/system/.internal/skills/`); the gitignored
harness copies under `.claude/skills/` may need a manual drift-sync (per `DEV-RULES.PROJECT` § Package-Project
Sync). Full rationale: `notes-out-of-wu-entry.md` § Layer map.

### `[ ]` **3.1 Document `--housekeep`, `--plan <stub>`, and bare `--errand` in the `arc-session` skill**

- _Goal:_ The `arc-session` skill surface advertises the three populated signals and states that a bare
  `--errand` (no slug/description) is supported.

    - `[ ]` **3.1.a Add `--housekeep`**
        - Document the flag as the direct, minimal-load drain entry (relocate to base write context → run
          `drain-inbox`), symmetric with `--errand`; the warm `arc-housekeep` skill remains the execution path
          it reaches.

    - `[ ]` **3.1.b Add `--plan <stub>`**
        - Document in-place grooming of a `backlog/` stub's draft (`planned` or `provisional`), resumable via
          `--plan X` across sessions.

    - `[ ]` **3.1.c Fix the bare-`--errand` wording**
        - State that absent-seed is explicitly supported (→ elicit the concern, or adopt a flagged
          `USER-INBOX § Errand` capture), matching the `session-init` wording from Task 1.3.b.

## **Phase 4:** Verification

### `[ ]` **4.1 Complete verification** — load and follow `verify-work-unit.md`

---

## Success Criteria

- `[ ]` An explicit `--errand` / `--housekeep` / `--plan` signal on a Resume arm (active WU, primary worktree,
  WU branch) routes through the override leaf and is not discarded; the "Errand signal not consumed (non-Orient
  arms)" rule is retired and replaced by an actual Resume-arm route.
- `[ ]` Relocation preserves the active WU's checkout (the resumed branch is never clobbered) and goes through
  `resolveWriteContext` per `branch.protection` (full → short-lived branch off base; partial → direct base).
- `[ ]` The displacement gate fires confirm-once when an active checkout / dirty tree is present, and proceeds
  silently when nothing is checked out.
- `[ ]` A bare `--errand` is accepted (no arg required) and primes cold-entry loading universal context only
  (SESSION-NOTES, active task list, and `process-task-loop` skipped); the `arc-session` skill and `session-init`
  wording agree that absent-seed is supported.
- `[ ]` `--housekeep` relocates to the base write context and runs `drain-inbox` without loading WU-execution
  docs; its scope is a parameter defaulting to the user inbox.
- `[ ]` `--plan <stub>` enters `draft-design`'s content loop against a `backlog/` stub (`planned` or
  `provisional`) in place: the stub's `State` stays unchanged, the groom-and-stop exit does not advance the
  stage, and the session resumes via `--plan X` across sessions with the draft as the continuity artifact.
- `[ ]` A linked-worktree `--errand` relocates to the primary's base and runs the errand rather than falling
  through to discovery.
- `[ ]` Errand identity is read from the record (`readErrandSlugByBranch`); no code path parses the `chore/`
  prefix.
- `[ ]` `resolveDraftPresent` finds a backlog stub's draft under both `planned` and `provisional`.
- `[ ]` All quality gates pass (tests, linting, type checking).
- `[ ]` Ready for integration.
