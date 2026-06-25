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

### `[ ]` **1.1 Insert the signal leaf and shared spine into Step 2 dispatch**

- _Goal:_ An explicit-intent signal routes to its locus on any arm — outranking and replacing the
  resume/orient/cold-start resolution — through one shared spine, with the active WU's checkout preserved.

- _Approach:_ The leaf is dispatch-precedence: signal present → run the spine before resolving the implicit
  arm; signal absent → today's arm dispatch is untouched. The spine is uniform across all three signals;
  signals differ only in locus workflow, what they edit, and their sufficiency rule.

    - `[ ]` **1.1.a Add the signal-leaf precedence check ahead of the arm dispatch**
        - Place the check after the branch-gone precondition (git state must be sane first) but ahead of the arm
          resolution: signal present → spine; absent → fall through to the existing Errand-resume / Resume /
          Orient / Cold-start / Materialize resolution unchanged.
        - The spine's relocate + universal-context load supersedes the resume/orient sync-pull-of-current-branch
          and full context-load on the signal path — generalizing how errand cold-entry already loads
          universal-only, now fired on any arm.

    - `[ ]` **1.1.b Define the shared spine**
        - The five-step spine: parse signal → displacement guard (active checkout? → confirm-once) → relocate
          via `resolveWriteContext` (full → short-lived branch off base; partial → direct base commit) → load
          universal context only → run the locus workflow.
        - State that relocation is uniform (the `resolveWriteContext` primitive resolves `branch.base` from
          config, so the primary worktree need not be on `main`), not a per-signal property.
        - Author the spine as one cohesive, single-entry/single-exit block — a clean lift for later fragment
          extraction, not interleaved into the dispatch prose.

    - `[ ]` **1.1.c Add the per-signal locus routing table**
        - `--errand` → `run-errand` Launch (edits the errand's target paths). `--housekeep` → `drain-inbox`
          (edits inbox → authoritative homes; leave the drain _scope_ extensible — don't hardwire
          `USER-INBOX`-only — with the user inbox as the default behavior; the `user|shared` dual-mode is
          `shared-inbox-housekeep`'s, no build here). `--plan <stub>` → `draft-design` content loop (edits the
          backlog stub's `draft-*`).
        - _Note:_ Design posture (Decision 9) is woven here — the leaf arms only the declared goal and loads
          only what it needs; it surfaces no unrequested routes and does not nag about the active WU.

### `[ ]` **1.2 Two-gate confirmation and locus-scoped acknowledgment**

- _Goal:_ The leaf confirms along two distinct axes — sufficiency before acting, displacement before
  relocating — and closes on a locus-scoped acknowledgment rather than the full work-unit orientation.

- _Context:_ The two gates are orthogonal: sufficiency is signal-specific (does the signal carry enough to
  act?), displacement is uniform (is an active checkout / dirty tree present?). Errand cold-entry already
  replaces Step 6's WU orientation with a locus acknowledgment — this generalizes that to the leaf.

    - `[ ]` **1.2.a Document the sufficiency / elicitation gate**
        - `--housekeep` → always sufficient (the inbox is the input). Bare `--errand` / bare `--plan` →
          elicit first (or adopt a flagged `§ Errand` capture / disambiguate a stub) before relocating — a
          bare signal asks, it does not silently launch.
        - `--plan` stub existence / disambiguation resolves through the Task 2.1 backlog-stub resolver
          (deterministic), not agent globbing.

    - `[ ]` **1.2.b Document the displacement / precedence gate**
        - Active WU or dirty checkout present → confirm-once-then-relocate (one visible beat before leaving a
          resumed WU). Nothing checked out → proceed silently. Identical across the three signals.

    - `[ ]` **1.2.c Replace the Step-6 orientation with a locus-scoped acknowledgment**
        - On the leaf, frame the close on the locus (the errand / drain / grooming target), not the WU —
          mirroring the existing Errand cold-entry behavior; thread the leaf through the Step 5 / Step 6
          errand-mode references so the new arm is covered.

### `[ ]` **1.3 Retire "signal not consumed"; support bare `--errand`; read errand identity from the record**

- _Goal:_ The Resume arm carries an actual route for an explicit signal (not a discard), a bare `--errand` is
  explicitly supported, and any errand identity the route needs comes from the record.

- _Context:_ Today's "Errand signal not consumed (non-Orient arms)" block discards the signal with circular
  advice (re-invoke from the primary worktree → lands on the same Resume arm → discarded again). That block is
  the bug this WU fixes.

    - `[ ]` **1.3.a Rewrite the "Errand signal not consumed (non-Orient arms)" block**
        - Replace the discard + circular advice with a pointer into the signal leaf — the Resume arm now
          routes the signal through the spine instead of surfacing-and-dropping it.

    - `[ ]` **1.3.b Support a bare `--errand` (absent seed)**
        - `session-init` wording states a bare `--errand` primes cold-entry loading universal context only
          (SESSION-NOTES, the active task list, and `process-task-loop` skipped) → elicit the concern or adopt
          a flagged `USER-INBOX § Errand` capture. (The `arc-session` skill half is Task 3.1.)

    - `[ ]` **1.3.c State that errand identity is record-owned**
        - Any errand identity is read from the record via `readErrandSlugByBranch` (`lib/errand/record.ts`),
          never a `chore/`-prefix branch parse (retired upstream). The `--plan` grooming locus needs no errand
          identity at all.

### `[ ]` **1.4 Pre-focus a positional backlog-WU arg on the Orient arm**

- _Goal:_ A positional arg naming a backlog WU lets the Orient/discovery arm pre-focus that WU and offer to
  init it — confirm-only, never auto-init.

- _Approach:_ Extend the existing entry-seed mechanism to the discovery arm: the named WU is surfaced as the
  pre-focused candidate with an init offer; today's "surfaced, not acted on" becomes "pre-focused, confirm to
  act." Update the "Seed not consumed" note so it no longer claims the discovery arm ignores the arg.

- _Note:_ The Orient-arm pre-focus may reference the Task 2.1 backlog-stub resolver opportunistically, but its
  runtime stays agent-interpreted (no probe wiring) — a resolver pays off at deterministic call sites, not agent
  discretion, and Decision 8 is the parenthetical ergonomic. Keep it light; don't expand scope to thread the
  positional arg through the probe.

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
