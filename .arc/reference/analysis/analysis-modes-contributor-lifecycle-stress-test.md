# Analysis: Contributor Lifecycle Stress Test (Operating Modes Pre-PRD)

> **Purpose:** Stress-test `ADR-014`'s latent contributor planning capability against the Operating
> Modes WU's design questions (shift lifecycle, multi-WU registry, Local mode composition),
> identify gaps between `ADR-014`'s stated intent and current implementation, and classify those
> gaps by implementation cost to inform a bake-in-at-launch vs. defer decision.
>
> **Status:** Pre-PRD analysis for the Operating Modes WU. Generated during a follow-up session
> to the solo-dev blind spot audit (`analysis-modes-solo-dev-blind-spot-audit.md`) on 2026-04-09.
> Input material for the Operating Modes PRD; not a formal design specification.
>
> **Companion documents:**
>
> - `analysis-modes-solo-dev-blind-spot-audit.md` — the preceding audit this session built on.
>   Clarification #5 in that doc was revised during this session to match the corrected framing
>   below.
> - `plan-arc-modes.md` — the Operating Modes plan doc. Gaps identified here feed into its PRD.
> - `adr-014-support-contributor-role-for-open-source.md` — the ADR that committed to contributors
>   running their own full ARC pipeline in `user/{identity}/`. Rediscovered during this session.
> - `adr-012-adopt-unified-user-directory-model.md` — the unified user directory ADR, amended
>   during this session to formalize the mirror-structure principle.

## Background

The follow-up session was convened to walk the registry scenario battery from the solo-dev audit
against the three options (A, B, C) and resolve the central multi-WU state location question.
Before starting the walk, a tangential question was raised: what happens when a contributor to an
ARC-using upstream project wants to use ARC for their own contribution work? The original audit's
clarification #5 had framed contributors as "external actors who do not interact with WU state,"
and a quick sanity check on that framing revealed it was materially wrong.

**Rediscovery:** `ADR-014` § Contributor planning (Accepted, implemented in commit `d81a62a` on
2026-03-25) already committed ARC to supporting contributors running the **full planning pipeline
— sessions, task lists, WORK-STATUS, shift, handoffs — scoped entirely to `.arc/user/{identity}/`**.
The boundary is ownership of *tracked* state, not the presence of WU concepts. The implementation
commit shipped the lightweight contributor path (hooks, session-init branching, reduced briefing,
optional WORK-STATUS read); the full-lifecycle workflows were scoped as latent capability per
`ADR-014` § Risks (the lightweight path was named the expected common case).

The implication for the Operating Modes WU: shift lifecycle, multi-WU registry, and Local mode
all intersect with this latent capability, and half-finishing the contributor planning path was
fine in 2026-03 but becomes load-bearing once those features exist. The WU inherits both the
opportunity to finish `ADR-014`'s capability and the obligation to ensure Operating Modes features
compose cleanly with contributor state that already lives in `user/{identity}/` by design.

**External validation:** A research pass (conducted during this session) confirmed the
read-upstream, write-personal-gitignored-subtree pattern is architecturally unsurprising in the
wider tooling ecosystem — Husky, Claude Code, and Cursor instantiate the same split with no
idiomatic friction. The OSS pollution line is about *tracked upstream config*, not gitignored
personal state. `ADR-014`'s model is on the safe side of that line.

## Scope

**In scope for this document:**

- Walking 7 stress-test scenarios against `ADR-014`'s contributor planning capability
- Identifying gaps between `ADR-014`'s stated intent and current implementation
- Cost-classifying gaps (trivial / small / medium / large / structural)
- Proposing a launch-vs-defer split for the Operating Modes WU
- Formalizing the mirror-structure principle for personal workspace organization
- Narrowing the registry walk option set (Option A ruled out, B and C remain)

**Out of scope for this document:**

- Contributor archival workflow (resolved: lightweight-by-design, no framework work needed)
- Local mode × ARC-upstream collision (resolved: contributor mode is the answer in that context)
- Maintainer-side multi-WU registry decision (still open — feeds back to the audit's § Open Design
  Space as a narrower B-vs-C walk)
- Detail design of shift, registry, or Local mode workflows
- Implementation of the identified gaps (that belongs in the Operating Modes WU task list)

## Corrected Framing (Clarification #5 Revised)

The solo-dev audit's clarification #5 originally stated: *"Contributors do not interact with WU
state. The role boundary is firm: contributors are external — they fix issues, submit PRs, use
the Context: contribution footer. They do not manage WUs, do not see WORK-STATUS.md in their
session-init, do not need to know what's paused."*

**Revised form (2026-04-09):** The boundary is **ownership of tracked state**, not the presence
of WU concepts. Per `ADR-014` § Contributor planning:

- Contributors **do not** touch upstream's tracked planning artifacts (`active/`, `backlog/`,
  project `WORK-STATUS.md`). Pre-commit hooks warn on staged files in protected paths; session-init
  skips loading upstream WU state.
- Contributors **can** run ARC's full planning pipeline — sessions, task lists, shift, handoffs —
  scoped entirely to `.arc/user/{identity}/`.
- Session-init in contributor mode already checks for `user/{identity}/WORK-STATUS.md` and loads
  it if present. The infrastructure to *read* contributor planning state exists; the workflows
  to *write* a full lifecycle into that tree are partially unimplemented.

The original clarification's conclusion — "contributors do not interact with WU state at all" —
was load-bearing for several audit framings (notably the "M3 dissolves" finding). Those framings
now need revisiting. This document is the formal record of the revision; the audit doc's
clarification #5 section was updated in place with a revision-history preamble.

## Stress Test Scenarios

Seven scenarios organized into three categories: (1) `ADR-014` implementation gaps against the
contributor lifecycle as designed, (2) Operating Modes WU intersections with the contributor
path, and (3) transitions and edges. The walks probe both "does this work?" and "what's the cost
of closing the gap?"

### Category 1: `ADR-014` Implementation Gaps

#### S1. Multi-week feature contribution with full planning

**Setup:** Contributor forks an ARC-using project, picks up a multi-week issue, wants the full
ARC pipeline — plan doc → PRD → task list → task execution loop → session handoffs across
multiple sessions → final PR against upstream.

**What works cleanly:**

- Session init and handoff are already role-aware for SESSION-NOTES and contributor WORK-STATUS
  (session-init.md § Contributor Session Path; session-handoff.md § 29–38)
- Process-task-loop workflow paths are mostly parameterized — task list path is a workflow input,
  not hardcoded. Atomic companion file path is derived from the task list directory
- Atomic inbox (`user/{identity}/ATOMIC-INBOX.md`) is already role-aware
- Commit discipline — `Context: contribution (...)` footer shipped in 2026-03 and validated
  universally by the commit-msg hook
- Quality gates — inherited from upstream's DEV-RULES.PROJECT; apply in full to contributor work
- Hooks — role-aware protected-path warning already shipped

**What breaks or is undefined:**

- **Plan doc and PRD location:** Resolved via the Thread A framing (see § Resolved Framings
  below). Plans and PRDs live in `user/{identity}/active/`, same as other non-arc-in-git modes.
  No new planning subdirectory needed.
- **`1_create-prd.md` and `2_generate-tasks.md`:** Both branch on `pm.mode` but not on `arc.role`.
  Adding a role branch follows the exact same pattern as the existing `pm.mode` conditional.
  ~20 lines total across both workflows.
- **`activate-work-unit.md`:** Most complex of the gaps. Hardcodes `.arc/backlog/{category}/` and
  `.arc/active/{category}/` paths, updates `.arc/active/WORK-STATUS.md`, updates PROJECT-STATUS
  and ROADMAP for arc-in-git. For contributors: no backlog→active move (files are born in
  `user/{identity}/active/`), no PROJECT-STATUS/ROADMAP updates, WORK-STATUS path substitution
  to user directory. Needs entry-level role check plus conditional skips for Steps 1, 3, and 6.
  ~40–60 lines.
- **`integrate-work-unit.md`:** Partially role-aware via session-handoff's WORK-STATUS skip, but
  doesn't explicitly handle contributor file paths or Step 6c skip. Needs role check + path
  substitution. ~20–30 lines.

**Gap classification:**

- G1 — Contributor planning tree layout: **Resolved** (see § Resolved Framings). Plans in
  `active/`, no new subdir.
- G2 — `create-prd` and `generate-tasks` role awareness: **Small** (~20 lines)
- G3 — `activate-work-unit` role awareness: **Medium** (~40–60 lines)
- G5 — `integrate-work-unit` role awareness: **Small** (~20–30 lines)
- G11 — `process-task-loop` role awareness: **Trivial** (already mostly parameterized)
- G13 — `session-handoff` clarify contributor WORK-STATUS path: **Trivial** (one doc edit)

#### S2. Contributor archives a completed WU

**Setup:** Contributor has finished their contribution. PR is merged upstream. They want to clean
up their local state.

**Walk:** `archive-work-unit.md` moves files from `.arc/active/{category}/` to
`.arc/reference/archive/{quarter}/{category}/{NN}_{name}/`. Neither source nor destination applies
to contributors — contributor files are in `user/{identity}/active/`, and the archive destination
is a maintainer-managed tracked tree with global quarter-based numbering that assumes project
scope.

**Resolution (see § Resolved Framings, Thread B):** Non-arc-in-git modes — including contributor,
Lite, Local solo — don't need a formal archive workflow. Archive's value proposition
(historical reference, cross-WU dependency tracking) collapses at non-arc-in-git scales:

- The developer has `git log` with `Context:` footers as historical reference
- Solo / contributor / Lite work rarely has cross-WU dependencies
- Contributor one-shots end at PR merge; there is nothing to reference historically

**Lightweight path (framework default):** When a WU completes, the user deletes
`user/{identity}/active/{tasks,plan,prd,notes}-*.md` or leaves them. WORK-STATUS resets to "no
active work." That's it. No ceremony.

**Escape hatch (via mirror-structure):** A user who wants archival for their own reasons mirrors
ARC's archive structure under their user directory —
`user/{identity}/reference/archive/{quarter}/{category}/{NN}_{name}/` — and moves files manually.
ARC doesn't enforce or validate; the convention is for the user's consistency, not framework
functionality.

**Gap classification:**

- G4 — Contributor archival workflow: **No-op — current behavior is correct**. Documentation
  only (explain the lightweight path in the contributor briefing). Cost: **Trivial**.
- G12 — `clean-work-unit.md` contributor archive detection: **Dropped**. No framework archival
  means no detection needed.

#### S3. Contributor uses `1_create-prd.md`

**Setup:** Contributor wants to write a PRD for their contribution.

**Walk:** PRD content (problem, goals, constraints, scope, non-goals, success metrics) is
domain-neutral — the same template applies whether the author is a maintainer or contributor.
The only gap is path resolution: where does the PRD file live? For contributors, it lives in
`user/{identity}/active/prd-<name>.md` per `ADR-014`'s sketch (adapted to include the `prd-`
file) and the mirror-structure principle. The workflow itself needs the same role branch as
`2_generate-tasks.md` (G2).

**Gap classification:** Subsumed by G2 (same code change).

### Category 2: Operating Modes WU Intersections

#### S4. Shift lifecycle for contributors ★

**Setup:** Contributor starts feature-A, hits a code review wait, wants to start feature-B while
feature-A is paused. Same cognitive multi-stream pattern the audit's Finding A addresses, but
applied to contributor state.

**Walk:** Shift does not yet exist as a workflow — it is being designed in the Operating Modes
WU (see `plan-arc-modes.md` § Shift Lifecycle). The question is whether shift should be
role-aware from day one.

Per the corrected clarification #5, contributors have their own WU state in `user/{identity}/`.
Shift operates on WU state (pause, resume, re-activate). For contributors, shift resolves paths
against the user directory instead of the project tree. Every other aspect — pause timestamp,
reason, status header, WIP nudge, resume flow — is file-local and identical in both trees.

**Key insight:** Making shift role-aware at design time is **effectively free**. Retrofitting it
later would be medium-cost at minimum. Designing it in now is the clearly correct move.

**Gap classification:**

- G7 — Shift workflow role-aware from day one: **Free** at design time; **Medium** if retrofit.
  Strong bake-in argument.

#### S5. Multi-WU registry for contributors ★

**Setup:** Contributor has two in-flight WUs plus one paused WU in their own state tree. The
audit's § Open Design Space asks where multi-WU state lives. Walking this for contributors pre-
answers part of that question.

**Walk through the three options:**

- **Option A (In-Flight inside WORK-STATUS):** Contributors have their own WORK-STATUS at
  `user/{identity}/WORK-STATUS.md`. Maintainers have `.arc/active/WORK-STATUS.md`. Two separate
  In-Flight registries that **do not join**. When a maintainer also serves as contributor to
  their own project (not hypothetical — it's a common solo-ARC usage pattern), they end up with
  dual registries that require manual reconciliation. When a developer transitions roles, state
  is stranded in one file while the session loads the other.
- **Option B (per-dev in `user/{identity}/`):** Contributors already write registry state there
  by design. Maintainers under Option B also write multi-WU state to their own
  `user/{identity}/` directory. **Shape symmetry: same mechanism, same file pattern, same code
  path for both roles.** The maintainer's tracked `WORK-STATUS.md` stays the branch-status
  pointer; the multi-WU registry lives in per-dev state for every role.
- **Option C (artifact-first via `clean-work-unit` header fields):** Works identically for both
  roles because it's derived from task list headers, wherever they live. Role-agnostic by design.
  No role-specific registry file needed.

**Findings:**

- **Option A is ruled out.** Creates dual unbridgeable registries. The shape doesn't compose
  with `ADR-014`'s committed per-dev contributor state.
- **Option B gains shape symmetry as a real positive.** Both roles use the same mechanism.
- **Option C remains role-agnostic by design**, no change needed to accommodate contributors.

**Registry walk scope narrows:** The main walk the follow-up (post-this-doc) session needs to
run is **B vs C**, with the audit's original scenario battery. Option A scenarios can be skipped.
This simplifies the walk and makes the B-vs-C comparison cleaner.

**Gap classification:** Not a gap per se — a constraint on the registry decision. The contributor
lens rules out A and strengthens both B and C, leaving the main walk to decide between them on
other criteria (cross-branch visibility, derivation simplicity, etc.).

#### S6. Local mode × contributor mode composition ★

**Setup:** A developer clones an ARC-using project and wants a personal ARC experience for their
contribution work. Should they use `arc join --contributor` (contributor mode) or
`arc init --local` (Local mode)? Do the two compose?

**Walk:** Both modes are answers to "I want ARC in a repository where I don't own the tracked
state." They achieve this through different mechanisms:

| Mechanism             | Local mode                               | Contributor mode                             |
|-----------------------|------------------------------------------|----------------------------------------------|
| State location        | `.arc/` in working tree                  | `user/{identity}/` inside upstream's `.arc/` |
| Exclusion mechanism   | `.git/info/exclude` or `.gitignore` line | Already gitignored (upstream's gitignore)    |
| Backing store         | `~/.arc-state/{project-id}.git`          | Git notes via existing portability layer     |
| Reads upstream ARC    | No (upstream has no ARC)                 | Yes (constitution, strategies, briefings)    |
| Context footer format | Freeform                                 | `Context: contribution (...)`                |
| Applies when          | Upstream is NOT an ARC project           | Upstream IS an ARC project                   |

**Finding:** Local mode and contributor mode are **alternatives, not compositions**. They are
selected by upstream context, not stacked. In an ARC-using upstream, contributor mode subsumes
Local mode's value proposition because the personal planning tree (`user/{identity}/`) is already
gitignored by upstream's own `.gitignore`, and the framework read contract is already role-aware.

This **simplifies the mode combinations matrix** in `plan-arc-modes.md`. The (Lite, Full) ×
(tracked, local) grid should carry a note: when upstream ships ARC, "local" is not the right
axis — contributor mode is. Local mode remains the answer for non-ARC upstreams.

**Case C revisited:** The earlier session's "Case C" (contributor wants Local mode in an ARC-
upstream repo to bring their own rules) remains explicitly ruled out. External research confirmed
nested-install patterns are non-idiomatic; the contributor-accepts-upstream-rules path (contributor
mode) is idiomatic and supported.

**Gap classification:**

- G9 — Mode selection documentation in `plan-arc-modes.md`: **Trivial** (docs only)

### Category 3: Transitions and Edges

#### S7. Contributor → maintainer transition mid-work

**Setup:** A contributor has been working on a feature for two weeks using their own planning
state in `user/{identity}/active/`. The project maintainer invites them to become a maintainer.
They set `git config arc.role = maintainer`. What happens?

**Walk:** Next session-init loads the maintainer document set — project WORK-STATUS, task list,
backlog. Their personal `user/{identity}/WORK-STATUS.md` is no longer in the maintainer load
path. In-progress state in `user/{identity}/active/` is still on disk but invisible to the
session's orientation.

**Options:**

1. **Transition at boundaries only** — document that role changes must happen between WUs, not
   during them. The contributor finishes current work as a contributor, then promotes.
2. **Migration workflow** — move `user/{identity}/active/` content into project `active/`.
   Complex, may conflict with existing project state. Hard to get right.
3. **Hybrid session-init** — load both trees during a transition period. Confusing, ambiguous
   ownership.

**Honest answer:** Option 1. Transitions happen at WU boundaries by convention; no migration
path is needed. Document the constraint in the contributor briefing and leave it.

**Gap classification:**

- G10 — Role transition boundary documentation: **Trivial** (one paragraph in the contributor
  briefing)

## Consolidated Gap Table

| #   | Gap                                                     | Source | Cost            | Launch?  | Rationale                                                                                     |
|-----|---------------------------------------------------------|--------|-----------------|----------|-----------------------------------------------------------------------------------------------|
| G1  | Contributor planning tree layout                        | S1     | —               | Resolved | Thread A: plans in `active/`, same as other non-arc-in-git modes; no new subdir               |
| G2  | `1_create-prd.md` + `2_generate-tasks.md` role branch   | S1/S3  | Small (~20 LOC) | Launch   | Same pattern as existing `pm.mode` branching                                                  |
| G3  | `activate-work-unit.md` role-aware skips + path sub     | S1     | Medium (~40–60) | Launch   | Well-bounded; follows existing `pm.mode` pattern                                              |
| G4  | Contributor archival workflow                           | S2     | Trivial (docs)  | Launch   | Thread B: non-arc-in-git archive is lightweight-by-design; document the lightweight path only |
| G5  | `integrate-work-unit.md` role-aware skip + path sub     | S1     | Small (~20–30)  | Launch   | ~70% done via session-handoff coverage; finish the path substitution                          |
| G7  | Shift workflow role-aware from day one                  | S4     | Free @ design   | Launch   | Shift is being designed now; retrofit cost is medium                                          |
| G8  | Registry choice must compose with contributor state     | S5     | Constraint      | Applies  | Rules out Option A; narrows main walk to B vs C                                               |
| G9  | Mode selection docs (Local vs contributor alternatives) | S6     | Trivial (docs)  | Launch   | Clarify in `plan-arc-modes.md` mode combinations section                                      |
| G10 | Role transition boundary documentation                  | S7     | Trivial (docs)  | Launch   | One paragraph in contributor briefing                                                         |
| G11 | `3_process-task-loop.md` role awareness                 | S1     | Trivial         | Launch   | Already mostly parameterized                                                                  |
| G12 | `clean-work-unit.md` contributor archive detection      | S1     | —               | Dropped  | No framework archival for contributors; nothing to detect                                     |
| G13 | `session-handoff.md` clarify contributor WORK-STATUS    | S1     | Trivial (docs)  | Launch   | Already 70% done; one clarifying edit                                                         |
| G14 | Contributor briefing full lifecycle + mirror-structure  | Cross  | Trivial (docs)  | Launch   | Current briefing under-documents `ADR-014`'s capability; this session's principal doc update  |

**Launch totals:**

- Code changes: **~90–130 lines** across 6 workflows (Explore's conservative estimate, Archive
  dropped from code scope)
- Documentation changes: ~5 small edits across briefing, session-handoff, plan-arc-modes, and
  ADR-012 amendment
- Shift design-time additions: role-aware path resolution baked into the shift workflow as it's
  designed — no retrofit, no separate work
- Estimated effort: **2–3 hours of focused work**, spread across the Operating Modes WU's
  implementation tasks

**Deferred to follow-up WU:**

- Nothing from this stress test. The archive gap (G4) was resolved as "no work needed" rather
  than deferred; the mirror-structure principle provides the escape hatch for users who want
  archival anyway.

## Resolved Framings

This session produced five load-bearing resolutions that change how the Operating Modes WU
should be shaped. They are captured here as the permanent record.

### Thread A: Plan docs are transient

Plan docs are subsumed by PRDs at PRD-creation. Their lifetime is bounded by a single planning
effort. Material that doesn't belong in the PRD but is useful during implementation goes to
`notes-*.md` during the transition (handled by existing workflows).

**Contributor implication:** Plans live in `user/{identity}/active/plan-*.md`, same shape as
Lite, Local solo, and `pm.mode: none/external`. No new `planning/` subdirectory is needed. The
"multiple concurrent plan docs" case is an arc-in-git benefit; non-arc-in-git modes are
lightweight-by-design.

**Escape hatch:** The mirror-structure principle lets a user voluntarily add
`active/planning/` as a local convention if clutter bothers them. ARC does not enforce, validate,
or care about user-added subdirectories beyond the framework read contract.

### Thread B: Contributor archival is lightweight-by-design

Archive serves two purposes in arc-in-git maintainer mode: historical reference and cross-WU
dependency tracking. For non-arc-in-git modes, both collapse — `git log` with `Context:` footers
is sufficient history, and these modes rarely have cross-WU dependencies worth tracking formally.

**Framework default:** When a WU completes in contributor / Lite / Local solo mode, the user
deletes or leaves `active/*` entries. WORK-STATUS resets. No ceremony.

**Escape hatch:** Users who want archival mirror ARC's archive structure under their user
directory (`user/{identity}/reference/archive/`) manually. The framework provides the convention;
users decide adoption depth.

### Thread C: The mirror-structure principle

`.arc/user/{identity}/` is a personal workspace with a defined framework read contract. The
framework reads from specific paths; everything else under the user directory is the developer's
to organize freely. ARC *recommends* mirroring the framework's structure (`active/`, `reference/`,
etc.) for consistency with the user's mental model but does not *enforce* — the framework cannot
validate a gitignored personal directory anyway, and making this honest is more useful than
pretending otherwise.

**Framework read contract (the defined paths):**

- `SESSION-NOTES.md` — session context (loaded at init, written at handoff)
- `WORK-STATUS.md` — personal work state (loaded at init if present, optional)
- `ATOMIC-INBOX.md` — personal capture queue (arc-in-git only)
- `active/tasks-*.md` — task lists (loaded at init when running a full planning pipeline)

**User-managed (freeform under mirror-structure recommendation):**

- Personal scratch notes, investigation logs, reference links
- Archived WUs the user voluntarily preserves
- Personal strategies or conventions
- Any directory structure the user wants, beyond the framework read contract

**Guardrails:**

- Don't place files at paths the framework manages in a way that shadows them
- Don't expect ARC to load arbitrary files added to the workspace
- Don't introduce hooks, workflows, or session-init-loaded content under `user/{identity}/`
  (those live in `system/` and cannot be overridden personally)

This principle is captured as an amendment to `ADR-012` (2026-04-09) and expanded in the
contributor briefing.

### Thread D: Local mode and contributor mode are alternatives, not compositions

Both are answers to "ARC in a repository where I don't own the tracked state," selected by
upstream context:

- Upstream is NOT an ARC project → **Local mode**
- Upstream IS an ARC project → **contributor mode** (subsumes Local mode's value proposition via
  `user/{identity}/`)

Case C (Local mode over ARC upstream, nested installs, different rules) remains ruled out — both
non-idiomatic per external research and unnecessary because the two idiomatic paths cover the
motivating use cases.

**Mode combinations matrix implication:** `plan-arc-modes.md`'s (Lite, Full) × (tracked, local)
grid needs a note that "local" is upstream-context-dependent and does not compose with contributor
mode.

### Thread E: Option A is ruled out from the registry walk

The contributor lens rules out Option A (In-Flight inside `WORK-STATUS.md`) because it creates
dual unbridgeable registries when a single developer operates under both roles (common in
solo-ARC self-contribution patterns). The audit's § Open Design Space has been updated to mark
Option A as ruled out. The main registry walk runs B vs C only.

## Implications

### For the Registry Walk

- Walk **B and C** only (Option A eliminated)
- Apply the audit's original scenario battery unchanged; the contributor constraint does not
  change the scenarios themselves, only the option set
- **Option B gains shape symmetry** — same mechanism serves both roles
- **Option C remains role-agnostic by design** — derived from artifacts, no role-specific code
- The B-vs-C decision turns on the audit's existing criteria (merge safety, mode uniformity,
  scope respect, reuse, discoverability, team aggregate, cognitive model) plus one new criterion:
  **cross-role shape symmetry** (B's strength) **vs. derivation simplicity** (C's strength)
- The audit's current lean toward C (possibly composed with a lightweight B summary for
  cross-branch visibility) remains viable under the narrowed walk

### For the Operating Modes WU Scope

The WU should absorb these items into its scope beyond what `plan-arc-modes.md` currently
captures:

1. **Contributor lifecycle gap closure** — G2, G3, G5, G11, G13, G14 (implementation tasks)
2. **Mirror-structure principle documentation** — ADR-012 amendment (done this session),
   contributor briefing expansion (done this session), `plan-arc-modes.md` note (done this
   session)
3. **Shift workflow role-aware from day one** — G7 (design constraint; no separate task)
4. **Mode combinations matrix clarification** — G9 (documentation task in the Operating Modes WU)
5. **Registry walk narrowed scope** — G8 (constraint applied at PRD phase)

### For Future Work (Not Operating Modes WU)

None from this stress test. The archive question was resolved without deferral; no follow-up WU
candidates were generated.

## Open Questions

- **B1 vs B2 vs B3 sub-question (Option B placement):** If the main registry walk lands on Option
  B, the audit's existing sub-question about where exactly in `user/{identity}/` the registry
  lives (inside SESSION-NOTES, as Persistent Context, or as a dedicated file) remains. Not
  affected by this stress test.
- **Cross-branch paused visibility in tracked Full:** The audit flagged this as a gap in Option
  C. Not affected by this stress test, but the B-vs-C walk must confirm whether contributors
  face an analogous problem (they don't — per-dev state is single-writer by design).
- **Contributor hook manager interaction:** `ADR-014` mentioned hook manager integration
  (husky, lefthook, pre-commit). This stress test assumed the ARC hook script is running; if a
  contributor's project uses a different hook manager, the composition story is in `ADR-014` but
  wasn't walked here. Low priority — hooks are outside the contributor-planning lifecycle.

## Recommended Next Steps

1. **Commit this document** alongside the audit doc correction and the ADR-012 amendment. All
   three are a coherent documentation update capturing this session's synthesis.
2. **Handoff** the current session. The next session picks up the narrowed registry walk.
3. **Registry walk (next session)** — walk the audit's scenario battery against Options B and C
   only. Output is a B-vs-C decision with rationale.
4. **PRD creation** (after the registry walk) — Operating Modes WU enters formal PRD phase with
   all pre-PRD questions resolved.
5. **Operating Modes WU task list** absorbs the gap closure items (G2, G3, G5, G11, G13, G14)
   as concrete implementation tasks alongside the mode-specific work (Lite, Local, shift).

## Confidence Notes

**High confidence:**

- `ADR-014` rediscovery (direct reading of the ADR and implementation commit)
- Workflow cost estimates (sourced from a targeted Explore scan of the actual workflow files,
  not speculation)
- Option A ruled out (the dual-registry problem is structural, not a preference)
- Mirror-structure principle derivation (follows cleanly from `ADR-012`'s existing framing)
- Shift-at-design-time insight (timing fact, not a judgment call)
- Local vs contributor mode as alternatives (both modes' purposes become clear when compared
  directly)

**Medium confidence:**

- G3 cost estimate (Explore said "Medium"; workflow interactions could surprise at implementation
  time)
- Whether contributor full-lifecycle adoption will be common or rare (`ADR-014` § Risks expects
  rare; this document's framing makes it more accessible, which could shift the distribution)

**Working intuition, not firm:**

- The specific recommendation that G4 (contributor archive) is lightweight-by-design rather than
  deferred. Based on "archive's value collapses at non-arc-in-git scales" logic, which is
  plausible but not rigorously tested against usage patterns. If the intuition is wrong, G4
  becomes a follow-up WU candidate rather than a no-op; the stress-test walk should re-check
  during the Operating Modes WU implementation phase.

**What this document deliberately did NOT do:**

- Decide the B-vs-C registry question (left for the follow-up session with a narrower walk)
- Specify implementation details for the role-aware workflow changes (belongs in the Operating
  Modes WU task list)
- Audit the shift workflow's design itself (shift detail design is in `plan-arc-modes.md` and
  was not re-audited here — only the role-awareness constraint was added)
- Exhaustively walk every contributor scenario imaginable (7 scenarios were chosen to probe the
  specific gaps and intersections; others exist but add diminishing returns)

---
