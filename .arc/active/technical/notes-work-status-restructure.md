# Notes: Work-Status Restructure

**Status:** Complete
**Completed:** 2026-04-16

## Contents

- [Historical context](#historical-context) — ADR-007 conflation analysis
- [Alternatives considered](#alternatives-considered) — six options, rejection rationale
- [Resolved decisions (2026-04-14 iteration)](#resolved-decisions-2026-04-14-iteration)
- [Consequences surfaced during execution](#consequences-surfaced-during-execution)
  — merge=ours retirement, CHECK 10 rewrite
- [Stress-test battery](#stress-test-battery) — 8 scenarios for Phase 3 validation
- [Harmony with shift lifecycle](#harmony-with-shift-lifecycle) — Phase 5 walk source
- [Deactivation reshape under arc-shift alignment](#deactivation-reshape-under-arc-shift-alignment)
- [Conceptual three-surface split](#conceptual-three-surface-split) — rationale for
  the project/session/execution separation
- [Deferred-to-implementation detail](#deferred-to-implementation-detail) — context
  behind PRD § Open Questions

---

## Historical context

An explore-agent search of ADRs, strategies, and git history surfaced the following
during 2026-04-14 iteration:

- **ADR-007 (session state portability and team transfer, Feb 2026)** is the most
  directly overlapping decision. It established WORK-STATUS as branch-scoped
  (singular, tracked) with the constraint *"session state identity is per-developer,
  not per-branch or per-work-unit."* This constraint was about *who owns the
  context* (per-developer session notes, portable via git notes), **not** about how
  the project pointer scopes.
- **No ADR, strategy, or design note explicitly considered per-WU or per-branch
  alternatives** for WORK-STATUS. The singular pattern was assumed from the start.
- **Team concurrency was considered** in `strategy-team-coordination.md` §
  Concurrent Sessions, but only as "concurrent sessions on the same branch" with a
  last-committer-wins mitigation. That addresses the wrong scenario: the
  parallel-branch parallel-WU case is never named.
- **Two distinct concepts were conflated**: *personal session context* (correctly
  per-developer via SESSION-NOTES and git notes) vs. *project state pointer*
  (incorrectly frozen at singular branch scope instead of per-WU scope).

**Read:** Not a deliberate rejection of alternatives — a design oversight shaped by
solo-dev experience, where the singular pattern is indistinguishable from correct.
The team-concurrency doc addressed the wrong scenario and created an illusion that
concurrency was handled. The gap passed conceptual muster multiple times because the
framing "WORK-STATUS is branch-scoped" sounded like "scales with branches" when it
actually meant "fits on one branch at a time."

**Amendment framing (for Phase 1 ADR-007 work):** The amendment refines, it does not
supersede. ADR-007's actual decision (per-developer session state portability via
git notes) is correct and unchanged. The singular WORK-STATUS pattern was a
pre-existing assumption carried along without examination. The Tier 2 Amendment
disentangles the two conflated concepts without contradicting the original decision.

---

## Alternatives considered

Six options evaluated during 2026-04-14 iteration. Rejection rationale preserved
here so future work doesn't re-derive.

**A. Keep singular, add auto-reset on merge/archive.** Half-fix. Addresses staleness
but not concurrency. Parallel-WU merge conflict remains. **Rejected.**

**B. Per-developer work-status in `user/{identity}/`.** Conflates with SESSION-NOTES's
role (personal context). Loses the "shared read" property (anyone on the branch sees
the same state). **Rejected.**

**C. Eliminate WORK-STATUS entirely, rely on task list.** Task list doesn't carry
branch, blockers, or next-action. Loses explicit state that session-init depends on
for orientation. **Rejected.**

**D. Per-branch file (not per-WU).** Handles team sub-branches at file level.
Complicates naming (branch-slug is ugly), introduces discovery cases the common path
doesn't need. Team sub-branches within one WU are a legitimate coordination concern,
not a structural flaw — the within-WU shared state represents real coordination that
devs need to resolve manually anyway. **Rejected** in favor of per-WU with a
`Branch:` field.

**E. Inserted Phase 0 in the rebrand WU.** Fold this restructure into the ARCd
Rebrand WU as a Phase 0. Thematically pollutes the rebrand WU (two independent
structural themes in one PR chain). Doesn't give the restructure proper planning
treatment (PRD, considered alternatives, ADR amendment). **Rejected.**

**F. Stacked incidental WU under rebrand.** Treat as incidental work on a stacked
branch off `technical/arcd-rebrand`. Entangles two independent WUs. Since rebrand
hasn't executed any tasks, there's no work on the rebrand branch to preserve — the
stacked-branch justification doesn't apply. **Rejected** in favor of clean
deactivation.

---

## Resolved decisions (2026-04-14 iteration)

All six open questions from the initial draft resolved during the 2026-04-14
follow-up session. Summary pointers (do NOT re-derive during implementation):

1. **Migration sequencing** → late-phase (Phase 3 of this WU's execution), with
   throwaway early-phase tests only if specific Phase 2 tasks require the new path
   to validate scan behavior. Late-phase keeps the WU on the old path until one
   deliberate cutover, avoiding half-converted-system cognitive load.

2. **ADR-007 amendment format** → Tier 2 Amendment per `strategy-adr-methodology.md`,
   in a new `## Amendments` section at the bottom of ADR-007. No modification to
   Decision / Context / Consequences sections. Mention amendment in commit message.
   Rationale: see [Historical context](#historical-context) above.

3. **Team-coordination strategy rewrite** → narrow rewrite (Option A),
   shipping-clean. Two axes addressed explicitly:
   - *Parallel work units on independent branches*: isolated by per-WU status files
     — no coordination at the status-file layer.
   - *Within-work-unit team sub-branches*: shared state on one `status-{name}.md`,
     coordinated via `(@name)` markers / last-committer-wins (existing convention,
     now correctly scoped).

   No references to the old singular-file model — strategy docs at `strategies/arc/`
   ship to adopters who see the doc fresh with no "before" to contextualize.
   Historical context lives in the commit message and ADR-007 amendment, not in the
   strategy doc.

4. **Naming** → settled before session (`status-{name}.md` Full / `status.md` Lite).
   Semantic collision with task list `Status:` header resolved via field-level
   rename (`**State:**` enum field inside `status-*.md`) + task list header removal.
   Naming rationale: single-word prefix aligns with existing convention
   (`prd-`, `tasks-`, `notes-`, `atomic-`). Collision with the `arc-status` skill is
   nominal only — different namespace (skill/command name vs. file prefix), same
   precedent as `tasks-*.md` not colliding with the `arc-task-audit` skill.
   Directory context (sibling files in the WU's active directory) makes
   `status-{name}.md` unambiguous.

5. **Deactivation workflow priority** → Case A primary + routing pointers. See
   [Deactivation reshape](#deactivation-reshape-under-arc-shift-alignment) below.

6. **Session-init discovery precedence** → SESSION-NOTES `**Working On:**` field as
   primary signal, `Branch:` field match as fallback, `State: In Progress` filter as
   tiebreaker, prompt as last resort.

   **Why SESSION-NOTES is the primary signal, despite being the lowest-trust source
   in the conflict-resolution hierarchy:** the trust hierarchy ranks sources for
   *conflict resolution* ("when two sources disagree, which one wins"). For
   *disambiguation* ("which of these candidates is the one I'm working on right
   now?"), SESSION-NOTES has the opposite property — it's the most recently written
   document in the system by construction (handoff writes it at T=N, init reads it
   at T=N+1), and it explicitly captures the developer's current-session intent.
   It's the single surface in ARC that answers "which WU are you on?" without
   requiring cross-referencing tracked state.

   Trust hierarchy still applies on conflict: if SESSION-NOTES says
   `Working On: X` but tracked state unambiguously shows `Y`, proceed with `Y` and
   report the discrepancy per `session-init.md` § 7 protocol.

---

## Consequences surfaced during execution

Two downstream decisions surfaced during Phase 1 Task 1.3 execution (2026-04-15) and
deserve durable capture so future editors and adopters don't have to re-derive them
from commit history. Both are direct consequences of the project-pointer restructure;
neither was anticipated during the 2026-04-14 planning iteration.

### Retirement of the `.gitattributes` `merge=ours` rule

**Prior state.** Root `.gitattributes` carried the rule
`.arc/active/WORK-STATUS.md merge=ours`. Under the singular-file model, every branch
had some form of WORK-STATUS.md. Branch-to-base merges that touched the file on both
sides would conflict, with the semantically correct resolution being "target (base)
branch wins" — an "the integration owner reconciles afterward" pattern.
`merge=ours` automated that silently.

**Case analysis under the new per-WU model.** Walking through every case where two
sides could both have a modified version of the same status file:

1. **Parallel WUs on independent branches** (common case): Different files entirely.
   Branch A carries `status-work-status-restructure.md`; Branch B carries
   `status-rebrand.md`. Zero file-level overlap. `merge=ours` has nothing to do here
   — it literally never fires.

2. **Feature branch → main**: The status file only exists on the WU's branch during
   the WU's active lifetime. Either main never held the file (created on branch by
   `activate-work-unit.md`) or main lost it at archive time (`git rm` in
   `archive-work-unit.md`). Either way, main's version and the branch's version are
   not both extant-and-modified at merge time. `merge=ours` doesn't fire here.

3. **Within-WU team sub-branches sharing one `status-{name}.md`** (Alice's sub-branch
   merges to the integration branch after Bob already merged changes that touched
   the status file): This is the one case where both sides have a modified version
   of the same file. This is what `merge=ours` was designed for.

**Evaluation of case 3.** Under existing `merge=ours` the integration branch's
version wins silently and Alice's edits are lost. The rationale was "integration
owner reconciles afterward" — correctness-by-compensation reliant on the human
remembering a post-merge manual step. Under normal merge (no rule), if Alice and Bob
touched different fields the merge is clean; if they touched the same field (e.g.,
both advanced `**Next Task:**`) git reports a conflict and manual resolution is
required.

The new model's status files are small (7 fields) and field-level overlap between
concurrent developers is rare. Clean auto-merge is the common case. When there IS a
genuine conflict, it reflects real coordination disagreement that should be visible
— and the existing `(@name)` marker discipline plus last-committer-wins convention
(documented in `strategy-team-coordination.md` § Concurrent Sessions) already names
the coordination layer. Visible merge conflicts are a better signal than silent
data loss.

**Platform note** (previously documented in the retired § Session State Merge
Behavior subsection of `strategy-team-coordination.md`): custom merge drivers
including `merge=ours` do NOT run during server-side PR merges on GitHub, GitLab, or
Bitbucket. The rule was already half-effective — only local `git merge` operations
benefited. Retiring it loses only the local-merge behavior, not any CI behavior.

**Decision.** Retire the rule entirely. Do not repath to
`.arc/active/**/status-*.md`. Reasoning: the silent-discard behavior is a footgun
under the new model (case 3 is the only live case and it's better served by visible
conflict resolution), and cases 1 and 2 make the rule irrelevant in the common
path. Retiring is simpler than preserving a rule whose behavior we don't actually
want.

**What this does NOT mean for adopters.** Teams operating in heavy within-WU
sub-branch coordination patterns who hit frequent status-file conflicts can add a
2-line local `.gitattributes` rule themselves — `.gitattributes` is standard git,
not ARC-specific, and the pattern is trivial. The framework ships no opt-in
guidance because:

- Pre-emptive opt-in documentation recommends a behavior (silent discard) that we
  just argued is incorrect for the model.
- No current friction data justifies pre-emptive guidance.
- Every "optional knob mentioned in case someone wants it" adds maintenance burden
  and cognitive load at adoption time.
- If real friction materializes via an adopter issue, guidance can be added then
  with actual evidence.

Strategy docs (`strategy-team-coordination.md`, `strategy-work-organization.md`)
ship forward-clean with no mention of the rule past or future. Historical record
lives here and in ADR-007's 2026-04-15 amendment (implicitly, via the existing
cross-reference from the amendment to this notes file).

### Rewrite (not retirement) of pre-commit hook CHECK 10

**Prior state.** The pre-commit hook's CHECK 10 scanned staged files for task list
completions and warned (soft, non-blocking) if `.arc/active/WORK-STATUS.md` was not
also staged. The path was hard-coded. Intent: catch the "forgot to update the
project pointer alongside task list updates" case per the `DEV-RULES.ARC.md` §
Commit Discipline "Work status accuracy" rule.

**Options considered during Task 1.3 scope expansion:**

- **(i) Retire the check entirely.** Rely on session-handoff as the sole accuracy
  mechanism per `session-handoff.md` § Verify Work Status Accuracy.
- **(ii) Rewrite to derive the sibling status file** from each staged task list's
  directory (`active/{category}/tasks-{name}.md` → sibling
  `active/{category}/status-{name}.md`).

**Decision.** Rewrite (option ii). Reasoning:

- The rule being enforced ("stage the status file alongside task list updates") is
  load-bearing under the new model just as it was under the old. The restructure
  moves the project pointer per-WU but doesn't weaken the update discipline.
- Under the new structure, derivation is *simpler* than the old hard-coded path —
  task list and status file are guaranteed siblings in the same
  `active/{category}/` directory, so the derivation is a trivial shell transformation.
- Commit-time feedback is immediate. Handoff-time feedback is deferred by hours or
  days. The commit-time feedback loop catches drift when it's cheap to fix; handoff
  as the only mechanism is a regression.
- The check is already soft (warning, not block). There's no friction cost when the
  derivation is wrong (e.g., atomic-only commits correctly bypass the check because
  the regex targets `tasks-*.md`, not `atomic-*.md`).

**Scope improvements made during the rewrite** (low cost, higher value than a
straight path substitution):

- **Scope to `active/` only.** Backlog task list edits should not trigger the check
  (implicit in the old model since the old path was fixed to `.arc/active/`).
  Making this explicit in the regex prevents false positives on backlog edits.
- **Atomic companion file edits exempt automatically.** The regex targets
  `tasks-*.md`, so `atomic-{name}.md` edits don't match the trigger condition.
  Context footer semantics already exempt atomic commits from the project-pointer
  update rule.
- **Contributor-skip preserved.** Unchanged behavior via
  `hooks.contributor_protected_paths` — project-level status file updates are a
  maintainer concern.

**Validation strategy.** Task 1.7.c smoke-tests the rewritten hook against current
staged changes (no status file exists yet; hook should not false-positive). Full
end-to-end validation happens at Phase 3 cutover (Task 3.1) when the new status
file first exists and CHECK 10 becomes exercisable against real live state.

### Why these decisions live here and not in an ADR amendment

ADR-007's 2026-04-15 amendment already documents the project-pointer restructure
and cross-references this notes file for full analysis. Both of the decisions above
are direct mechanical consequences of the restructure decision — they don't
introduce new architectural commitments, they just record how the restructure
touches adjacent machinery. The ADR amendment convention is append-only (per
`strategy-adr-methodology.md` Tier 2 convention), and re-amending a committed
amendment for a clear downstream consequence is ADR thrashing. The existing
amendment's cross-reference to this notes file implicitly covers the consequence
analysis — a reader following the ADR → notes file trail sees both the
architectural decision and its downstream consequences in the right places.

Forward-clean strategy docs (`strategy-team-coordination.md`,
`strategy-work-organization.md`) ship without any mention of the retired
`merge=ours` rule, past or future. Adopters see the current model with no "before"
framing to contextualize.

---

## Stress-test battery

Eight scenarios for Phase 3 live-migration validation and Phase 7 pre-merge review.
No unbroken stress tests surfaced during 2026-04-14 discussion; if review surfaces
additional edge cases, update the matrix before merge.

1. **Parallel WUs, different devs, independent branches** → different files, no
   conflict ✓
2. **One WU, team sub-branches (shared coordination)** → single WU file with
   `Branch:` field; within-WU collisions represent legitimate coordination, not
   structural flaw ✓
3. **Rotating branches (rebrand's phased delivery)** → sequential, file travels
   through merges ✓
4. **Fresh clone mid-WU** → session-init scans `active/`, matches current branch,
   loads correct file ✓
5. **Delayed archive (stale file lingers on main)** → new WU branch disambiguates
   via `Branch:` match; stale file is noise, not breakage. Integrity check warns on
   mismatch with ROADMAP ✓
6. **Planning cycles** → no status file exists (no WU yet); SESSION-NOTES +
   plan/PRD existence carries state. Planning-cycle chain confusion resolved ✓
7. **Atomic commits to main under partial protection** → no status file on main to
   update, no conflict ✓
8. **Branch rename/rebase** → `Branch:` field goes stale; fallback to "single file
   in `active/`" still works ✓

---

## Harmony with shift lifecycle

Source material for the Phase 5 cross-reference section in `plan-arc-modes.md`.
The shift-lifecycle design in plan-arc-modes defines cross-cutting pause / resume /
rotate semantics via the `arc-shift` skill and `shift-work-unit.md` workflow. That
design's core premise: **metadata-in-place, not file relocation**. A paused WU stays
where it is; its state header flips; session-init reads it.

The restructure is strongly aligned with this premise:

**Per-WU file harmonizes with metadata-in-place.** A paused WU's `status-{name}.md`
stays in `active/{category}/` alongside its task list. The `State:` field flips to
`Paused (date) — reason`. No rename, no relocation.

**Source-of-truth simplifies.** plan-arc-modes originally chose task list headers
as the sole source of truth *because no per-WU WORK-STATUS file existed* — task
list headers were the only per-WU surface. The restructure changes that premise by
introducing `status-{name}.md` as an explicit per-WU surface. Under the new premise,
the `**State:**` field lives in `status-{name}.md` and the task list header is
removed. Pure Option C's concerns (no registry, no cache, no session-init noise)
remain fully satisfied — the status file is per-WU and single-slot, not a cross-WU
registry, and session-init still reads one file per WU.

**Ownership of terminal transition unchanged.** `integrate-work-unit.md` via
`clean-work-unit.md` still owns the `State: Complete` write, it just writes to the
status file instead of the task list header. `arc-shift` still never writes
`State: Complete` — mid-flight transitions only.

**Vocabulary unchanged.** plan-arc-modes' shift vocabulary
(`Paused (date) — reason`, `Waiting-For {category} (date) — reason`) is preserved
verbatim — only the host field changes from task list `**Status:**` header to
status file `**State:**` field. Mechanical find-and-replace in plan-arc-modes'
shift-lifecycle section during this WU's Phase 5.

**Scenario battery re-validation.** plan-arc-modes' 9-scenario battery was
evaluated under task-list-header-as-home. Under status-file-as-home, each scenario's
answer stays identical or simplifies — status files are per-WU, tracked, travel
with branches (plan-arc-modes Scenarios 3/4/5), disambiguated by current branch
field (Scenario 1), pause-timestamp read natively from `State:` field (Scenario 8).
Full re-validation walk deferred to Phase 5 drafting; no case identified that
breaks.

---

## Deactivation reshape under arc-shift alignment

The original deactivation protocol sketch (four-cell case matrix) predated the
arc-shift analysis. Under alignment with plan-arc-modes:

|                        | No task work executed                                                                                                                                                              | Some task work executed                                                                                                                                        |
|------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Not merged to main** | **Case A (primary)**: delete branch, git handles revert automatically. Main is already in pre-activation state. Trivial. *The only genuine deactivation case.*                     | **Case B → future `arc-shift`**: not deactivation. A WU with partial work that the developer wants to park uses metadata-in-place pause (`State:` field flip). |
| **Merged to main**     | **Case C (noted edge case)**: deactivation PR with inverse changes — move files back to backlog, reset status/roadmap/task-list — under full protection, requires own branch + PR. | **Case D → integrate or clean-work-unit**: not deactivation. Either complete-and-integrate the WU, or archive-with-abandoned-status via `clean-work-unit.md`.  |

**Case B reframe.** Originally sketched as "preserve via rename to
`archive/{category}/{name}-parked-YYYY-MM-DD`". This is **file relocation**, which
contradicts arc-shift's metadata-in-place design. Reframed: Case B is not
deactivation at all — it's `arc-shift` pause territory (future workflow). A WU with
partial work that the developer wants to park stays in place, its `State:` field
flips to `Paused`, and `arc-shift` handles resume.

**Case A** (no work, not merged) — remains the only genuine deactivation case. The
WU never entered the shift lifecycle; there is nothing to preserve and no meaningful
history to pause. Activation-undo is the correct operation.

**Case C** (merged, no work) — rare edge case. Retained as noted in the sketch.

**Case D** (merged, some work) — strengthened framing: this is either
integrate-to-Complete or `clean-work-unit.md` archive-with-abandoned-status. Not
deactivation.

**Updated design principle** (headline for `deactivate-work-unit.md`): *deactivation
means "undo activation of a WU that didn't meaningfully start."* If work has
happened, the correct operation is pause (`arc-shift`), completion
(`integrate-work-unit`), or abandonment (`clean-work-unit`) — not deactivation.

Case A is the only procedure this WU ships in full. Case C is included as a noted
edge case since it's genuinely activation-undo (just with added branch/PR ceremony
under full protection). Cases B and D route to other workflows, with short
explanatory blocks documenting the routing decision.

---

## Conceptual three-surface split

The restructure clarifies a split that the current singular-WORK-STATUS model
muddles. Each surface carries a different kind of state:

| Surface            | Role            | Scope                                     |
|--------------------|-----------------|-------------------------------------------|
| `status-{name}.md` | Project pointer | Per-WU, tracked, shared across developers |
| SESSION-NOTES.md   | Session pointer | Per-developer, ephemeral, portable        |
| `tasks-{name}.md`  | Execution plan  | Per-WU, tracked, shared                   |

The previous model conflated "project pointer" and "session pointer" into one
tracked singular file. Under this restructure:

- **Project pointer** = `status-{name}.md`. Answers "what's the state of this WU?"
  — any developer on the branch sees the same answer. Branch-scoped, co-located with
  the WU's other files.
- **Session pointer** = SESSION-NOTES `**Working On:**` field. Answers "what's this
  developer currently doing right now?" — personal, cross-WU, written at handoff
  and read at init. Different concern, different layer.
- **Execution plan** = task list. Answers "what are the tasks and which are done?"
  — unchanged in role, but the existing WU-lifecycle `**Status:**` header is removed
  (relocates to status file `**State:**` field).

These are three different questions, and it's right for them to live in three
different places. The singular-WORK-STATUS model forced the first two into one file,
which is why it required lossy compromises at parallel-WU integration and
stale-state edge cases.

---

## Deferred-to-implementation detail

Context behind PRD § Open Questions. Direction is settled for each; exact shape
pinned during the relevant phase.

**Q1 — SESSION-NOTES `**Working On:**` value format.** Direction: filename when
applicable, defined markers for edge cases. Constraint: markers must be lightweight,
consistent, unambiguous — not freeform prose. Candidate marker shapes:

- `[none]` — no active work
- `[planning: {category}/{name}]` — in a planning cycle, no WU yet
- `[between work units]` — between activation and archive of adjacent WUs
- `status-{name}.md` — normal case, file reference

Final decision codified in three surfaces that must agree: (a) `session-handoff.md`
write instruction, (b) `session-init.md` read/interpret logic, (c) SESSION-NOTES
template comment block.

**Q2 — Ambiguous-discovery prompt format.** When session-init's discovery precedence
falls through to the prompt step, what does the prompt look like? Options to
consider during Phase 2 `session-init.md` work:

- List candidates with one-line summaries (Branch, Next Task) for quick selection
- Sort by last-modified status file
- Fallback if user dismisses the prompt (abort vs. default to most-recently-modified)

**Q3 — ADR-007 amendment prose.** Drafted during Phase 1. PRD captures intent
("amend ADR-007 to clarify the conflation and reference the new model"); actual
prose is a Phase 1 task deliverable. Historical context material above feeds
directly into the amendment body.

**Q4 — `strategy-team-coordination.md` § Concurrent Sessions rewrite prose.** Same
pattern as Q3 — direction settled (narrow, two-axis, shipping-clean), prose drafted
during Phase 1. Reference [Resolved decisions](#resolved-decisions-2026-04-14-iteration)
§ 3 for the two axes.

**Q5 — Cross-reference section in `plan-arc-modes.md`.** Structure known (harmony
documentation, Pure Option C re-validation, Finding #4 carve-out reference). Prose
drafted during Phase 5. [Harmony with shift lifecycle](#harmony-with-shift-lifecycle)
above is the direct source material — Phase 5 work is primarily translation of that
section into plan-arc-modes' voice + the Finding #4 carve-out update.
