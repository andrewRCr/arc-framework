---
purpose: Establish AI context at session start — environment, project context, and behavioral guidance.
audience: agent
arc:
  methods:
    - session-state
  extensions:
    - post-context-load
---

# Workflow: Session Initialization

**Output discipline:** Between tool calls and the final structured summary, generate text only for (a)
problems, blockers, or detected mismatches; (b) judgment calls the user couldn't infer from the tool
stream; (c) flow-control pivots the user needs to track. Pure narration of tool calls, workflow branches,
or "now reading X" is omitted. Scope-limited override of any harness-default narration cadence for the
duration of this workflow.

## 1. Resolve Session Context

Verify environment and probe ARC state in a single Bash chain — both non-destructive reads:

```bash
pwd && arc status --session-init --json
```

`pwd` should be the current repository root — the directory containing `.arc/`.
The probe returns a single JSON envelope the agent consumes:

| Field                       | Contents                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
|-----------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------                                                                                                                                                                                                                                      |
| `identity`                  | `{identity, role}` — either may be `null`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `user`                      | Remote notes state (`value.state`: clean / remote-ahead / conflict / disabled / remote-unavailable). Carries `value.recommendedAction` ∈ `{pull, prompt, surface, skip}` and `value.recommendedPromptText` (composed channel-named offer text; empty string when not prompting) for Step 2's per-channel pull dispatch. The clean arm also carries `value.loadNeeded?: boolean` — `true` when refs match but disk lags behind the latest local note (cross-machine resume gap), feeding Step 2's notes-load dispatch; omitted on every non-clean spine state                              |
| `worktree`                  | Worktree sync state vs. `origin/<current-branch>` (`value.state`: clean / local-ahead / remote-ahead / diverged / no-upstream / detached-head / no-remote / remote-unavailable / skipped; `value.ahead` and `value.behind` populated for healthy states). Carries `value.recommendedAction` / `value.recommendedPromptText` mirroring the user slot                                                                                                                                                                                                                                       |
| `dirty`                     | Working-tree state from `git status --porcelain` (`value.state`: clean / dirty; `value.fileCount`). Folded into the user/worktree `recommendedPromptText` so Step 2 doesn't re-probe                                                                                                                                                                                                                                                                                                                                                                                                      |
| `extensions`                | `value.active`: the **active-extensions list** — consulted by fire-point directives in downstream workflows                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `config`                    | `value.settings`: session-relevant settings (`session.remote_sync`, `session.init_pull.worktree`, `session.init_pull.notes`, `session.init_load.notes`, `branch.protection`, `pm.mode`, `commit.format`, `commit.context_footer`)                                                                                                                                                                                                                                                                                                                                                         |
| `active`                    | Active status file resolution (`value.resolution`: single / multiple / none; `value.path`, `value.candidates`, `value.layout`)                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `domainRules`               | `value.rules`: `{path, domain, purpose}` tuples from `DEV-RULES.{DOMAIN}.md` files; `value.warnings`: frontmatter parse diagnostics                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `recommendedCombinedPrompt` | Top-level. Composed combined-prompt text when both `worktree` and `user` resolve to `recommendedAction === "prompt"`; `null` otherwise                                                                                                                                                                                                                                                                                                                                                                                                                                                    |

Carry `config` values forward as behavioral awareness. Do not surface configuration in orientation — defaults
and overrides reach the user at the consuming operation.

**Identity absent** (`identity.identity === null`): Skip all user workspace access — SESSION-NOTES,
ATOMIC-INBOX, and git notes all depend on identity for path resolution. Surface a warning in orientation.
Sessions without identity cannot perform handoff.

**Role is `contributor`**: After Step 3 items 1–6, switch to [`session-init.contributor.md`][session-init-contributor]
for item 7+, Step 5 skip, and Step 6 contributor orientation. Step 4 and Step 7 apply universally.

**Probe failure fallback**: If the composite call fails, fall back to direct commands:
`git config arc.identity` / `arc.role`, `grep -l "^active: true" .arc/system/extensions/*.md`, and a scan
of the role-resolved active root — `.arc/active/**/status-*.md` for maintainer / null role,
`.arc/user/{identity}/active/status-*.md` (flat) for contributor with identity resolved. Skip Step 2 (no
user-sync state available) and note the degradation in orientation.

## 2. Conditional Sync Pulls

Two channels: worktree (`worktree.value`) and personal notes (`user.value`). Both expose
`recommendedAction` and `recommendedPromptText` derived from current state × `session.init_pull.*` config
× dirty-tree state. The envelope's top-level `recommendedCombinedPrompt` carries the combined-prompt
offer text when both pull channels resolve to `prompt`. The personal notes channel additionally
carries `loadNeeded?: boolean` for the cross-machine resume gap; the notes-load dispatch fires
alongside the pull dispatch on the clean arm.

**Per-channel rule.** For each channel, dispatch on `recommendedAction`:

- `pull` — fire the channel's pull immediately (`git pull --ff-only` for worktree; `arc user pull` for
  notes). Skip post-pull re-probe on success — clean post-state is implied by a clean pull.
- `prompt` — ask using `recommendedPromptText` (channel-named, count-included, dirty-tree-aware). On
  accept, run the channel's pull. The agent owns the prompt — do not defer it to the CLI.
- `surface` — carry the channel's state into Step 6's orientation (e.g., `Reconcile required:` for
  worktree-diverged, informational line for local-ahead, degraded-state note for remote-unavailable).
  No prompt, no pull.
- `skip` — no action.

**Notes-load dispatch.** Independent of the pull dispatch, when `user.value.loadNeeded === true` (refs
match but disk lags behind the latest local note — typical when a worktree pull silently advanced the
user-notes ref on this machine), dispatch on `session.init_load.notes`:

- `always` — fire `arc user load` immediately, **except** when `dirty.value.state === "dirty"`. Under
  a dirty tree, `always` degrades to `prompt` with a "stash or commit local edits before loading"
  warning prepended to the offer text. The pre-load backup that ships with `arc user load` is the
  safety net for the auto-action case.
- `prompt` — ask before running `arc user load`. Channel-named, dirty-tree-aware offer text mirrors
  the pull-prompt convention. The agent owns the prompt.
- `manual` — surface in Step 6 orientation only (informational line; no prompt, no run).

`loadNeeded` absent or `false` → no action regardless of config. Notes-pull and notes-load are
mutually exclusive on the notes channel (pull fires when `refState ∈ {remote-ahead, conflict}`; load
fires when `refState === "same"`), so they never co-occur there.

**Combined prompt.** When more than one acceptance prompt would fire simultaneously, issue a single
combined prompt with per-channel choices instead of multiple per-channel prompts. The envelope
pre-composes `recommendedCombinedPrompt` for the two-pull case (worktree-pull + notes-pull) — issue
that text directly, offer choices `pull both / worktree only / notes only / skip`, and on
combined-accept run `git pull --ff-only && arc user pull` as a single Bash call. For other
multi-channel combos (e.g., worktree-pull + notes-load) compose the offer text locally with the
analogous per-channel choices and run the corresponding sequenced commands. Skip post-pull re-probe
on combined-accept; on partial pulls or single-channel accept where downstream state ambiguity
matters, re-probe to confirm.

**Notes operation ordering.** When the notes pull or notes load fires, it must complete before Step 3
— SESSION-NOTES reads below would be stale otherwise.

**Identity absent.** When `identity.identity === null`, the notes slot resolves to
`recommendedAction: "skip"` with no `loadNeeded` field, so notes-pull and notes-load both skip.
Worktree channel still applies.

## 3. Load Context Documents

**Reading rule**: Read every document in the list below in full EXCEPT QUICK-REFERENCE (item 6 —
section-level partial read) and the active task list (item 9 — strategic partial read).

**Partial-read structural mapping**: When a partial read needs section offsets, issue ONE grep for the
section delimiter and compute Read offsets locally — never per-section greps. Skip the grep entirely
when a stable file convention places the section at a known location.

**Parallelism (prescriptive)**: Issue items 1–6, 8 (SESSION-NOTES), and — when
`active.resolution === "single"` — the active status file as Reads in a single tool-message. Items 9–10
follow after the status file resolves; they may parallel each other. Don't serialize when the platform
supports parallel reads.

The document set below is the [session-state method][arc-methods-session] default. If your project overrides
session-state, follow the override instead.

**Project identity and agent context:**

1. `.arc/system/briefs/AGENT-BRIEF.ARC.md` — ARC framework orientation
2. `.arc/system/briefs/AGENT-BRIEF.PROJECT.md` — project overview, tech stack, collaboration context

**Constitutional and process context:**

3. `.arc/reference/constitution/DEV-RULES.ARC.md`
4. `.arc/reference/constitution/DEV-RULES.PROJECT.md`
    - Domain rules: the probe's `domainRules` field lists `{path, domain, purpose}` tuples for any
      `DEV-RULES.{DOMAIN}.md` files with the domain-rules frontmatter. Load on-demand when a task
      touches the relevant domain, not at init time.
5. `.arc/reference/strategies/STRATEGY-INDEX.md`
6. `.arc/reference/QUICK-REFERENCE.md` — **section-level partial read**: `## Environment & Path Context`
    only (subsumes `### Runtime Environment`). File convention: this is the first section. Read
    directly with `limit: ~35`. Apply structural mapping (delimiter `^##` line prefix) only if the
    convention has been broken.

**Active work context:**

7. **Active status file** — resolve from `active.value` and partial-read the `## Work Unit Metadata`
   section (heading line through the last `**Field:**` line):
    - `resolution: "single"`: path is `active.value.path`
    - `resolution: "none"`: no active work unit. Skip items 9–10; Step 5 handles next-work discovery
    - `resolution: "multiple"` (full mode only): apply disambiguation after SESSION-NOTES loads (item 8) —
      precedence:
        1. SESSION-NOTES `**Working On:**` value matches a candidate filename
        2. Candidate `**Branch:**` matches the current git branch
        3. Candidate `**State:** In Progress`
        4. Prompt the user with each candidate shown as:

            ```text
              [N] <filename> · <branch>
                  Next Task: <truncated Next Task>
                  State:    <State value>
            ```

            Include an abort option (`[q]`). If the user aborts, surface the candidate list and halt
            session-init.
    - **Read scope:** `## Work Unit Metadata` carries the load-bearing fields (State, Branch, Task List,
      Next Task, Last Completed, Blockers, Next Action) plus optional fields when present (Integration,
      Interrupts, Paused At, Paused To, Superseded By). The "About this file" blockquote and any other surrounding
      content are not read at init. **Contract boundary:** any content an agent needs at session-init
      must live inside `## Work Unit Metadata`.
    - **Task reference format**: `**Next Task:**` uses triple-anchor format —
      `Task 5.5 — Implement validation (line ~1903)`. All three anchors should be present; any two are
      sufficient for reliable lookup.

<!-- arc:if team.mode == true -->
**Team mode — resolve personal next task** (after loading the task list): The active status file shows
work-unit state (one "Next Task"). In team mode, your personal task may differ. Scan the task list for
`(@name)` markers matching your `{identity}`:

1. Find incomplete tasks (`[ ]`) with your `(@identity)` marker — first match wins and overrides the active
   status file `**Next Task:**` for your orientation
2. If no `(@name)` markers exist, fall back to the active status file `**Next Task:**`
3. If markers exist but none match your identity, note this in orientation — you may need to claim a task

See [Team Coordination Strategy][team-coordination] § Task Ownership for the `(@name)` convention.
<!-- arc:endif -->

8. `.arc/user/{identity}/SESSION-NOTES.md` — **Read directly** (no `test -f` precheck — Read tool handles
   missing files gracefully). Uses `{identity}` from Step 1
    - Personal working context from prior session: approach, decisions, things tried, known risks
    - **Persistent context**: The `## Persistent Context` section carries entries that survive across handoffs
      (each has an explicit removal trigger). Treat these as active constraints for this session
    - **If absent or stale**: Try `arc user load` (walks ancestors for `refs/notes/arc/user/{identity}`). If no
      notes either, fall back to `git log --oneline -10`. Tracked state + git history is sufficient
    - **Load errors:** See [SESSION-NOTES Load Error Recovery][session-ops-load-errors] for diagnostic
      commands per error class

> **Person-to-person handoff:** If bootstrapping from another developer's handoff, fetch their git notes
> namespace (`refs/notes/arc/user/{their-identity}`). See [Team Coordination Strategy][team-coordination]
> § Person-to-Person Task Handoff for the incoming bootstrap protocol.

**Resolve session type** — after the parallel batch and item 8 resolve, settle the session type that gates
items 9–10. The probe envelope carries `active.value.sessionType` ∈
`{"planning", "execution", "integration", null}` inferred from the resolved status file's `**State:**`
(primary, case-exact `Planning`) with branch-pattern fallback (`{category}/plan-{name}`) when State is
unset/empty or no candidate is resolved. `null` covers two distinct cases:

- **Multiple-candidate defer:** `resolution === "multiple"` — recompute from the chosen candidate's fields
  after disambiguation.
- **Orphan:** `resolution === "none"` (or empty State) and the current branch does not match the
  planning-branch pattern. No active work, no planning signal — surface in orientation; skip item 10.

SESSION-NOTES `**Session Type:**`, when present and matching `planning | execution | integration`
(case-insensitive), supersedes the envelope value for this session. Invalid override → ignore + emit a
warning in orientation.

9. **Active task list** — **strategic partial read**. Reference material too large to internalize upfront;
    read other sections on-demand during work.

    **Skip if** `sessionType === "planning"` (primary gate) or the active status file is not resolved or
    shows `**Task List:** [none]` (defense-in-depth shape checks — redundant under inference but kept as
    direct checks).

    - Path: `dirname(active.value.path) + '/' + <Task List value>` — the `**Task List:**` field
      carries the bare filename (`tasks-[name].md`); the directory is the status file's directory
      (co-located by convention). Path-form values (legacy) work too, used as-is.
    - **Always read** — three sections, nothing else:
        1. **Header** — bullet list above the first `## **Phase` heading
        2. **Current phase preamble** — derive the phase identifier from the current task identifier by
           stripping the leaf segment (`5.3` → Phase `5`, `3.R.e` → Phase `3.R`); locate the heading with
           `^## \*\*Phase {id}:\*\*`. **Preamble boundary contract:** read from the heading line through
           the line immediately before the first `- [ ]` / `- [x]` bullet under the phase. Multi-paragraph
           framing (Purpose, Design decisions, Rationale per the codified shape) is included; task entries
           themselves are not
        3. **Current task section** — resolved via graduated lookup below
    - **Graduated lookup** using the triple-anchor reference from `**Next Task:**`:
        1. Jump to the line hint (`line ~N`) — if the task number matches there, done
        2. Search for the task number (e.g., `**4.2`) if the line hint is stale
        3. Search for the title fragment if the task was renumbered
        4. If none resolve, report the mismatch (Step 7)
    - **Structural mapping**: Apply the Step 3 prelude rule with delimiter `^## \*\*Phase` (or
      equivalent phase-heading marker) — one grep returns all phase positions, sufficient to compute
      Read offsets for header (above first phase), current phase preamble, and current task section.
    - **Companion file awareness**: From `active.value.companions` — note their existence so
      references during execution resolve immediately. **Do not read these at init**

10. **Lifecycle workflow** — **read in full**, branched on `sessionType`:

    - `execution` → `.arc/system/workflows/arc/3_process-task-loop.md`
    - `integration` → `.arc/system/workflows/arc/work-unit-lifecycle/integrate-work-unit.md`
    - `planning` → none today (forward-compatible with `refine-plan-loop.md` if the Expanded Planning
       Path WU lands)
    - `null` — two paths:
        - **Multiple-candidate defer:** skip lifecycle workflow load until disambiguation completes;
          recompute `sessionType` from the chosen candidate and load the matching workflow then.
        - **Orphan** (`resolution === "none"` + non-matching branch, or single candidate with empty
          State + non-matching branch): skip lifecycle workflow load; surface the orphan state in
          orientation. Step 5's next-work-unit discovery handles direction-finding.

    Load later if the session pivots to a different lifecycle phase.

## 4. Post-Context-Load Extensions · `#post-context-load`

If `post-context-load` appears in the active-extensions list (from Step 1), load and execute its
[`.actions`][arc-ext-post-context-load]. Otherwise, skip.

## 5. Assess Readiness

### Freshness check

**Skip if** SESSION-NOTES `Commit at Handoff` hash matches current HEAD — documents are current.

Otherwise, or if no handoff hash exists (first session, crash, fresh clone without notes):

```bash
# Current HEAD
git log -1 --format=%h

# Commits since handoff (skip if no handoff hash — no baseline)
git log --oneline <handoff-hash>..HEAD

# Active status file freshness (skip if no status file resolved)
git log -1 --format=%h -- <status-file-path>
# Differing from HEAD means the status file hasn't been updated across recent commits
```

A gap doesn't mean state is wrong — it means verify more carefully before trusting session documents. **Only
mention gaps in orientation if they exist.** A clean check produces no output.

If the freshness gap suggests an interrupted session, run the crash-recovery routine
([process-task-loop § Crash Recovery][process-task-loop]).

<!-- arc:if team.mode == true -->
**Concurrent activity:** In team mode, freshness gaps may also indicate concurrent developer activity rather
than stale session state. If the active status file was updated by a different author since your last
session, note this in orientation — another developer may be actively working on the same branch.
<!-- arc:endif -->

### Next work unit discovery

**Skip if** an active status file was resolved AND (`sessionType === "planning"` OR `**Task List:**` is not
`[none]`) — discovery only applies between work units. A planning session is an active WU even with no task
list yet; the status file's Next Action carries direction.

When no active status file was resolved, or the resolved file shows `**Task List:** [none]` outside a
planning session, assess readiness for the next unit:

<!-- arc:if pm.mode == arc-in-git -->
1. Read `.arc/backlog/ROADMAP.md` — identify the next queued or suggested item
2. Check `.arc/backlog/` for existing artifacts (PRDs, `plan-*` docs) matching that item
3. Report what exists and its readiness state in orientation
4. Propose next steps; ask for confirmation before proceeding
<!-- arc:endif -->

<!-- arc:if pm.mode != arc-in-git -->
1. Check `.arc/active/` for existing planning artifacts (PRDs, `plan-*` docs, task lists)
2. If artifacts exist, report readiness state (draft PRD → needs refinement; complete PRD → ready for task
   generation; task list present → ready for activation) and propose next steps
3. If no artifacts exist, the next action is to create a PRD when ready → [1_create-prd.md][create-prd]
<!-- arc:endif -->

> **Full protection (`branch.protection: full`):** Planning work requires a branch. When the user confirms
> next steps, run [activate-planning-branch][activate-planning-branch] before creating plan documents or PRDs.
> Under partial protection (the default), proceed directly to [1_create-prd.md][create-prd] — no planning
> branch needed.

## 6. Confirm Orientation

Produce the orientation summary.

**Output format:**

**ARC session initialized** · `{branch-name}` · {clean | uncommitted changes}

**Active work state:**

- **Last completed**: One line. Task ID + title + commit state.
- **Current task**: One line. Task ID + title, or `none` between work units.
- **Blockers**: `none` or freeform — mismatch detail and blocker context unbounded.

**Next action:** One line on-task-list (status file pointer). Unbounded when off-task-list — carries work
no other tracked source documents.

Awaiting direction — proceed to Next Action?

**Include only if actionable**: freshness gaps, missing identity, environment issues, sync states other than
`clean` (worktree or notes), probe-failure fallback.

**Anti-pattern:** Restating the Next Task's full description from the task list. The task list carries the
detail; orientation needs only the pointer. Reserve unbounded prose for off-task-list scenarios where no
tracked source documents the work.

**Conditional top-level sections** — prepend above `**Active work state:**` when applicable:

- `worktree.value.state == "diverged"`:

  ```text
  **Reconcile required:** `{branch}` diverged from `origin/{branch}` ({ahead} ahead, {behind} behind).
  Manual rebase or merge needed before pushing. Carried forward — commit/push requests will be flagged.
  ```

- `worktree.value.state == "local-ahead"`:

  ```text
  **Local-ahead:** {ahead} unpushed commit(s) on `{branch}`.
  ```

**Never include**: configuration overrides, active-extensions list (any state), defaults active, freshness
clean, environment checks passed.

## 7. Handle Context Mismatches

If documented state doesn't match reality during initialization, use the trust hierarchy.

**Trust hierarchy** (highest to lowest):

1. **Git state** — `git status`, `git log`, file contents on disk
2. **Task list** — checkbox state, task descriptions
3. **Active status file** — tracked project pointer
4. **SESSION-NOTES.md** — personal session context (gitignored, most volatile)

**Tier 1 — Auto-recover with notice:**

When higher-trust sources agree and a lower-trust source is the outlier, proceed with the ground truth and
report the discrepancy in orientation.

Report format: "Active status file said X. Git/task list show Y. Proceeding with Y."

Examples:

- Active status file says "Task 3.3 in progress" but task list shows 3.3 marked `[x]` and git log confirms the
  commit → proceed with Task 3.4 as current
- `worktree.value.state == "diverged"` while session docs reflect clean state → git is ground truth.
  Surface as `Reconcile required:` (Step 6) and carry forward. Non-blocking; do not auto-reconcile.

**Tier 2 — Stop and ask:**

When the mismatch is ambiguous — multiple plausible explanations, or sources at the same trust tier disagree —
stop, report each source's view with specific details, and wait for explicit direction before any corrective
action.

Examples:

- Git shows uncommitted changes to files not mentioned in any session doc — could be co-development, a
  partial task, or an interrupted session
- The active status file references a task that doesn't exist in the task list — renumbered, removed, or the
  status file points to the wrong task list

---

[activate-planning-branch]: ../work-unit-lifecycle/planning/activate-planning-branch.md
[create-prd]: ../1_create-prd.md
[arc-methods-session]: ../../../methods/session-state.md
[arc-ext-post-context-load]: ../../../extensions/post-context-load.md
[team-coordination]: ../../../../reference/strategies/arc/strategy-team-coordination.md
[session-ops-load-errors]: ../../../../reference/strategies/arc/strategy-session-operations.md#session-notes-load-error-recovery
[session-init-contributor]: session-init.contributor.md
[process-task-loop]: ../3_process-task-loop.md
