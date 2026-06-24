# Notes: single-owner-wu-model

> Implementation notes, technical context, and design rationale for the single-owner-wu-model WU.
> Cross-referenced from task bodies in `tasks-single-owner-wu-model.md`. Line anchors are as of task
> generation — re-grep if drift is suspected.

## `strategy-team-coordination.md` survivor map

Section-by-section keep / remove / reframe disposition for the Phase 1 gutting. The doc survives as a
cross-person-only coordination doc; the within-WU multi-developer apparatus is removed.

**Header / intro (1–25)** — _Reframe._ "Operational specification for multi-developer ARC projects" → cross-person
coordination for team mode, where parallelism is multiple single-owner WUs across identities (worktrees), not
multiple developers on one WU. Keep the validation-scope note (21–25, "deliberate starting point, not a settled
standard").

**Contents (29–37)** — _Reframe._ Entry 2 "Task Ownership — `(@name)` convention" → "Ownership — meta `**Owner:**`
field"; drop entry 5 "Team Branching Patterns"; keep entries 6/7 (Merge Conflict Expectations residual, External
Tracker).

**Workflow Adaptations table (41–66)** — _Reframe._ Drop the "One task at a time / concurrent pairs OK" row and the
"Task ownership / `(@name)` markers" row. In the "Key distinction" paragraph (58–66), drop "each developer resolves
their personal next task by scanning `(@name)` markers"; the meta is WU-level state owned by the single owner.

**§ Task Ownership (70–105)** — _Reframe → § Ownership._ Replace The `(@name)` Convention / Scope / Identity /
Reassignment with: the meta `**Owner:**` field is the single source of assignment truth; non-owner contribution via
PR review (first-class), pairing (one driver, `Co-authored-by:` for credit), and handoff (sequential reassignment).
Expand "Directly Responsible Individual (DRI)" at first contact. Point to the shipped self/foreign asymmetry in
`strategy-concurrent-work.md` rather than restating it.

**§ Person-to-Person Task Handoff (107–178)** — _Keep, reframe._ Drop the `(@name)` reassignment at the
minimum-viable-handoff note (117), Outgoing #1 (123), and Incoming #2 (157) → meta `**Owner:**`-field reassignment.
Keep the git-notes bootstrap and Async Conventions.

**§ Interlock-Release Coordination (181–226)** — _Keep residual, remove apparatus._ Remove the "Task ownership
before approval" block (187–191) and the "Concurrent pairs should pull before starting or committing…" sentence
(202–204). Keep: Manual commit mode (193–197); the commit-on-task-approval visibility framing (199–204 minus that
sentence); **Push remains separate** (206–211 — this is the cross-dev commit-visibility note Decision 4 keeps);
Release-wrapper opt-in is per-developer (213–218); Asymmetric setup is expected (220–226).

**§ Team Branching Patterns (230–284)** — _Remove wholesale._ All four patterns (Shared Integration Branch,
Personal Sub-Branches, Stacked PRs per Developer, Direct Shared Branch) are within-WU multi-dev. Also remove the
`Branch(es):` flat-multi-branch header-field note (236–240). The cross-WU branching model lives in
`strategy-work-organization.md` + `strategy-concurrent-work.md`.

**§ Merge Conflict Expectations (285–359)** — _Within/cross split._

- Task Lists Are Shared Files (287–305) → _remove_ (communal within-WU task-list premise dies under single-owner).
- Session State Merge Behavior (307–325) → _keep_ the cross-WU fact "parallel WUs on independent branches never
  collide at the meta-file layer" (313–315); _remove_ the within-WU team-sub-branch coordination (316–322).
- Concurrent Sessions (327–358) → _remove_ "Within-WU team sub-branches" (343–358); reduce "Parallel work units on
  independent branches" (333–341) to a thin cross-identity pointer (mechanics already defer to Concurrent Work).
- Cross-WU Planning Dependencies (360–382) → _keep_ (genuine cross-person/cross-WU coordination).
- Configuration Notes (384–389) → _keep_ (`user.notes_push` team default).

**§ External Tracker Integration (393–427)** — _Keep, minus `(@name)`._ Reframe the assignment-table cell (402,
"Optional `(@name)` for convenience"); reconcile the no-extension-points-for-assignment note (420–421); remove
§ When `(@name)` Markers Are Optional (423–427).

**§ Related Documentation (431–437)** — _Keep._ Links are cross-doc (none point to removed in-doc sections).

**Out of scope (flag for the sweep):** the docs-site guide link (3–5) points to a published team-coordination page
that still describes the removed branching patterns. Docs-site regeneration is owned elsewhere; the sweep notes the
drift rather than editing it here.

## Mode-agnostic decoupling (forward-compat)

Grounded in ADR-020 (scale by depth/footprint, not by swapping shapes; `team.mode → team.enabled` as a toggle) and
`strategy-storage-evolution.md` P6/P7/P9 (workflow logic stays mode-agnostic; team-mode is the multi-writer config
the backend ultimately subsumes). Shipped `strategy-concurrent-work.md` (349–359) already treats team mode (the
cross-person _social_ axis) and concurrent-work (the multi-WU _mechanics_ axis) as orthogonal, with the single-owner
model operative regardless of either.

**Decoupling rule for this WU's edits:**

- **Universal statements drop the team-mode conditional — don't reframe it.** § Task interlock (DEV-RULES.ARC and
  the `process-task-loop` mirror) becomes "the interlock applies per work unit (one owner)" with **no** "in team
  mode, per developer-agent pair" qualifier. Cross-person parallelism = multiple WUs (covered by team-coordination).
- **The cross-person social layer stays team-gated.** `strategy-team-coordination.md` survives as a whole-doc
  `team.mode`-activated doc — the legitimate residual. Do not de-gate it.
- **Defer the `team.mode → team.enabled` rename.** Owned by arc-modes (in-flight; "owns finalizing the
  disposition"). Do not introduce `team.enabled` in these edits — reference the shipped key (`team.mode`) only where
  a config reference is unavoidable, and prefer removing the reference. No forward-pointer to an unlanded rename
  (same discipline as the `ROADMAP → STATUS` note).

---
