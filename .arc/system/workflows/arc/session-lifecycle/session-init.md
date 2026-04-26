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

**When to use**: User-triggered at the start of every session (resuming features, starting new work, handling
incidental tasks, etc.). The agent does not initiate this workflow on its own.

**Session lifecycle assumption**: ARC sessions are bounded — they begin with this initialization workflow and
end with an explicit handoff (see `session-handoff.md`). If an agent's context fills mid-session, the correct
response is to complete the current work item and hand off, not to compact or summarize prior context.

**Design context**: Structured document loading for agents with ephemeral context. Override the default set
via the [session-state method][arc-methods-session].

## Steps

### 1. Verify Environment

```bash
pwd
# Expected: /home/andrew/dev/arc-framework (repo root)
```

### 2. Probe ARC Domain

Run the composite probe:

```bash
arc status --session-init --json
```

Non-destructive. Returns a single JSON envelope the agent consumes:

| Field         | Contents                                                                                                                                                                                                                                                 |
|---------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `identity`    | `{identity, role}` — either may be `null`                                                                                                                                                                                                                |
| `user`        | Remote notes state (`value.state`: clean / remote-ahead / conflict / disabled / remote-unavailable). May carry a worktree-context qualifier in `value.detailLines` (e.g., comparison-vs-current-HEAD note when the worktree is behind origin)            |
| `worktree`    | Worktree sync state vs. `origin/<current-branch>` (`value.state`: clean / local-ahead / remote-ahead / diverged / no-upstream / detached-head / no-remote / remote-unavailable / skipped; `value.ahead` and `value.behind` populated for healthy states) |
| `extensions`  | `value.active`: the **active-extensions list** — consulted by fire-point directives in downstream workflows                                                                                                                                              |
| `config`      | `value.settings`: session-relevant settings (`session.remote_sync`, `session.init_pull.worktree`, `session.init_pull.notes`, `branch.protection`, `pm.mode`, `commit.format`, `commit.context_footer`)                                                   |
| `active`      | Active status file resolution (`value.resolution`: single / multiple / none; `value.path`, `value.candidates`, `value.layout`)                                                                                                                           |
| `domainRules` | `value.rules`: `{path, domain, purpose}` tuples from `DEV-RULES.{DOMAIN}.md` files; `value.warnings`: frontmatter parse diagnostics                                                                                                                      |

Carry `config` values forward as behavioral awareness. Do not surface configuration in orientation — defaults
and overrides reach the user at the consuming operation.

**Identity absent** (`identity.identity === null`): Skip all user workspace access — SESSION-NOTES,
ATOMIC-INBOX, and git notes all depend on identity for path resolution. Surface a warning in orientation.
Sessions without identity cannot perform handoff.

**Role is `contributor`**: Follow the **Contributor Session Path** below — skip items 7, 9–10 in Step 4, skip
Step 6, and use the contributor orientation format in Step 7.

**Probe failure fallback**: If the composite call fails, fall back to direct commands:
`git config arc.identity` / `arc.role`, `grep -l "^active: true" .arc/system/extensions/*.md`, and a scan
of `.arc/active/**/status-*.md`. Skip Step 3 (no user-sync state available) and note the degradation in
orientation.

### 3. Conditional Sync Pulls

Two channels may need attention: worktree (`worktree.value`) and personal notes (`user.value`).

**Dirty-tree precheck.** Before any pull prompt, check `git status --porcelain`. If non-empty, the prompt
must warn: "working tree dirty — stash or commit before accepting". No auto-stash; user resolves manually.

**Worktree channel** — keyed on `worktree.value.state` and `config.value.settings["session.init_pull.worktree"]`:

- `remote-ahead`: `prompt` mode → ask before pulling. On accept, run `git pull --ff-only` and re-probe the
  envelope. `manual` mode → surface in orientation; do not prompt.
- `diverged`: Non-blocking. Surface in Step 7 as `Reconcile required:`; carry forward.
- `local-ahead`: Single informational line in Step 7. No prompt.
- `clean`, `no-upstream`, `detached-head`, `no-remote`, `skipped`: No action.
- `remote-unavailable`: Note in orientation. Continue session-init.

**Notes channel** — keyed on `user.value.state` and `config.value.settings["session.init_pull.notes"]`:

- `remote-ahead` or `conflict`: `prompt` mode → ask before running `arc user pull`. `always` mode → pull
  without prompting. `manual` mode → surface in orientation; do not prompt. **Pull before Step 4** —
  SESSION-NOTES reads below would be stale otherwise.
- `clean`, `disabled`: No action.
- `remote-unavailable`: Note the degraded state. If the remote is unreachable, continue with local tracked
  state or retry once reachable. If reachable but full comparison is blocked in this environment, continue
  with local tracked state or retry where `git fetch` / remote-ref writes are allowed.

**Combined prompt.** When both channels need a prompt under `prompt` mode, issue one combined prompt instead
of two. Name each channel with its counts (worktree: `value.ahead` / `value.behind`; notes: from `user.value`
when present), include the dirty-tree warning when applicable, and offer per-channel choices (pull both /
worktree only / notes only / skip). Worktree pulls first; after acceptance, re-probe notes and pull if still
ahead.

The agent owns the prompt — do not defer it to the CLI. If `identity.identity === null`, the notes channel
has no path; skip notes regardless of state. Worktree channel still applies.

### 4. Load Context Documents

**Reading rule**: Read every document in the list below in full EXCEPT QUICK-REFERENCE (item 6 —
section-level partial read) and the active task list (item 9 — strategic partial read).

**Parallelism**: Framework docs (items 1–6), SESSION-NOTES (item 8), and — when `active.resolution === "single"` —
the active status file can load in parallel. Task list (item 9) and task execution workflow (item 10) wait
for the status file to resolve. Sequential execution is fine if your platform doesn't support parallel reads.

The document set below is the [session-state method][arc-methods-session] default. If your project overrides
session-state, follow the override instead.

**Project identity and agent context:**

1. `.arc/system/agent/AGENT-BRIEFING.ARC.md` — ARC framework orientation
2. `.arc/system/agent/AGENT-BRIEFING.PROJECT.md` — project overview, tech stack, collaboration context

**Constitutional and process context:**

3. `.arc/reference/constitution/DEV-RULES.ARC.md`
4. `.arc/reference/constitution/DEV-RULES.PROJECT.md`
    - Domain rules: the probe's `domainRules` field lists `{path, domain, purpose}` tuples for any
      `DEV-RULES.{DOMAIN}.md` files with the domain-rules frontmatter. Load on-demand when a task
      touches the relevant domain, not at init time.
5. `.arc/reference/strategies/STRATEGY-INDEX.md`
6. `.arc/reference/QUICK-REFERENCE.md` — **section-level partial read**: `## Environment & Path Context`
    only (subsumes `### Runtime Environment`)

**Active work context:**

7. **Active status file** — resolve from `active.value` and partial-read the `## Active Work`
   section (heading line through the last `**Field:**` line):
    - `resolution: "single"`: path is `active.value.path`
    - `resolution: "none"`: no active work unit. Skip items 9–10; Step 6 handles next-work discovery
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
    - **Read scope:** `## Active Work` carries the load-bearing fields (State, Branch, Task List,
      Next Task, Last Completed, Blockers, Next Action) plus optional fields when present (Interrupts,
      Paused At, Paused To, Superseded By). The "About this file" blockquote and any other surrounding
      content are not read at init. **Contract boundary:** any content an agent needs at session-init
      must live inside `## Active Work`.
    - **Task reference format**: `**Next Task:**` uses triple-anchor format —
      `Task 5.5 — Implement validation (line ~1903)`. All three anchors should be present; any two are
      sufficient for reliable lookup.

8. `.arc/user/{identity}/SESSION-NOTES.md` — **read if exists**. Uses `{identity}` from Step 2
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

9. **Active task list** — **strategic partial read**. Reference material too large to internalize upfront;
    read other sections on-demand during work.

    **Skip if** the active status file is not resolved or shows `**Task List:** [none]`.

    - Path from the active status file (e.g., `.arc/active/feature/tasks-[name].md`)
    - **Always read** — three sections, nothing else:
        1. **Header** — bullet list above the first `### **Phase` heading
        2. **Current phase preamble** — derive the phase identifier from the current task identifier by
           stripping the leaf segment (`5.3` → Phase `5`, `3.R.e` → Phase `3.R`); locate the heading with
           `^### \*\*Phase {id}:\*\*`. **Preamble boundary contract:** read from the heading line through
           the line immediately before the first `- [ ]` / `- [x]` bullet under the phase. Multi-paragraph
           framing (Purpose, Design decisions, Rationale per the codified shape) is included; task entries
           themselves are not
        3. **Current task section** — resolved via graduated lookup below
    - **Graduated lookup** using the triple-anchor reference from `**Next Task:**`:
        1. Jump to the line hint (`line ~N`) — if the task number matches there, done
        2. Search for the task number (e.g., `**4.2`) if the line hint is stale
        3. Search for the title fragment if the task was renumbered
        4. If none resolve, report the mismatch (Step 8)
    - **Companion file awareness**: From `active.value.companions` — note their existence so
      references during execution resolve immediately. **Do not read these at init**

10. **Task execution workflow** `.arc/system/workflows/arc/3_process-task-loop.md` — **read in full**.

    **Skip if** the active status file is not resolved or shows `**Task List:** [none]`. Load later if the
    session pivots to task execution.

> **Contributor Session Path**
>
> When `arc.role = contributor`, the session loads a reduced document set. Items 1–6 are universal — load them
> normally. Then:
>
> - **Load** `.arc/system/agent/AGENT-BRIEFING.CONTRIBUTOR.md`
> - **Load** `.arc/user/{identity}/SESSION-NOTES.md` if identity resolved and the file exists
> - **Check** `.arc/user/{identity}/status-contributor.md` if identity resolved — optional local planning
>   state; note in orientation if present
> - **Skip** items 7, 9–10
> - **Skip** Step 6 (next-work discovery — maintainer concern)
> - **Proceed to** Step 5 (extensions) → Step 7 with contributor orientation format:
>
> **Contributor orientation format:**
>
> **ARC session initialized** · `{branch-name}` · contributor · {clean | uncommitted changes}
>
> **Context:** Contributor session — working on project code, not managing ARC planning artifacts.
>
> **Next action:** Ready for work. Use `Context: contribution (...)` commit footer.
>
> Include status-contributor.md state if present and any blockers or configuration issues detected.
> Otherwise keep it minimal.

### 5. Post-Context-Load Extensions · `#post-context-load`

If `post-context-load` appears in the active-extensions list (from Step 2), load and execute its
[`.actions`][arc-ext-post-context-load]. Otherwise, skip.

### 6. Assess Readiness

**Skip entirely** when `identity.role === "contributor"` — freshness and work-unit discovery are maintainer
concerns. Proceed directly to Step 7.

#### Freshness check

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

#### Next work unit discovery

**Skip if** an active status file was resolved and its `**Task List:**` is not `[none]` — discovery only
applies between work units.

When no active status file was resolved, or the resolved file shows `**Task List:** [none]`, assess readiness
for the next unit:

1. Read ROADMAP.md — identify the next queued or suggested item
2. Check the backlog directory for existing artifacts (PRDs, `plan-*` docs) matching that item
3. Report what exists and its readiness state in orientation
4. Propose next steps; ask for confirmation before proceeding

> **Full protection (`branch.protection: full`):** Planning work requires a branch. When the user confirms
> next steps, run [activate-planning-branch][activate-planning-branch] before creating plan documents or PRDs.
> Under partial protection (the default), proceed directly to [1_create-prd.md][create-prd] — no planning
> branch needed.

### 7. Confirm Orientation

Produce the orientation summary — the user's first view of session state. Keep it focused on what matters.

**Output format:**

**ARC session initialized** · `{branch-name}` · {clean | uncommitted changes}

**Active work state:**

- **Last completed**: What was finished and its current state (committed, uncommitted, etc.)
- **Current task**: Task being worked on per the active status file (or "none" between work units)
- **Blockers**: Any blockers or mismatches detected during initialization, or "none"

**Next action:** What comes next per the active status file (or discovery result when between work units)

Awaiting direction — proceed to Next Action?

**Include only if actionable**: freshness gaps, missing identity, environment issues, sync states other than
`clean` (worktree or notes), probe-failure fallback.

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

### 8. If Context Seems Mismatched

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
- SESSION-NOTES describes uncommitted work but `git status` is clean and git log shows it committed → proceed
  with committed state
- `worktree.value.state == "diverged"` while session docs reflect clean state → git is ground truth.
  Surface as `Reconcile required:` (Step 7) and carry forward. Non-blocking; do not auto-reconcile.

**Tier 2 — Stop and ask:**

When the mismatch is ambiguous — multiple plausible explanations, or sources at the same trust tier disagree.

1. **Stop immediately** — do not proceed with work
2. **Report the mismatch** with specific details from each source
3. **Ask for guidance**; wait for explicit direction before taking any corrective action

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
