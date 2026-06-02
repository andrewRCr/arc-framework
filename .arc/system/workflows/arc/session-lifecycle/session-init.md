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
| `worktree`                  | Worktree sync state vs. `origin/<current-branch>` (`value.state`: clean / local-ahead / remote-ahead / diverged / no-upstream / detached-head / no-remote / branch-gone / remote-unavailable / skipped; `value.ahead` and `value.behind` populated for healthy states). Carries `value.recommendedAction` / `value.recommendedPromptText` mirroring the user slot. Also carries `value.identity` (`kind`: `primary` or `linked`, plus `path` when linked) — the physical worktree the session occupies, surfaced in orientation only when `linked`                                        |
| `dirty`                     | Working-tree state from `git status --porcelain` (`value.state`: clean / dirty; `value.fileCount`). Folded into the user/worktree `recommendedPromptText` so Step 2 doesn't re-probe                                                                                                                                                                                                                                                                                                                                                                                                      |
| `extensions`                | `value.active`: the **active-extensions list** — consulted by fire-point directives in downstream workflows                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `config`                    | `value.settings`: session-relevant settings (`session.remote_sync`, `session.init_pull.worktree`, `session.init_pull.notes`, `session.init_load.notes`, `branch.protection`, `pm.mode`, `commit.format`, `commit.context_footer`, `commit.interlock`, `push.interlock`)                                                                                                                                                                                                                                                                                                                   |
| `active`                    | Active meta file resolution (`value.resolution`: single / multiple / none; `value.path`, `value.candidates`, `value.layout`)                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `domainRules`               | `value.rules`: `{path, domain, purpose}` tuples from `DEV-RULES.{DOMAIN}.md` files; `value.warnings`: frontmatter parse diagnostics                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `recommendedCombinedPrompt` | Top-level. Composed combined-prompt text when both `worktree` and `user` resolve to `recommendedAction === "prompt"`; `null` otherwise                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `recovery`                  | Pre-computed branch-gone recovery resolution; present only on the `branch-gone` arm, and only when `roster` resolved (it consumes the roster to assemble candidates). `value.kind`: `resolved` (one high-confidence candidate), `surface` (multiple — operator chooses), or `main-fallback` (none — offer `main`). Candidates carry `branch`, optional `worktreePath`, and `proposedAction` (`switch` / `removable` / `external`). Acted on by Step 2's branch-gone recovery precondition (Step 6 narrates declines)                                                                      |
| `sweep`                     | Pre-computed stale-worktree sweep; present only in the primary (main) worktree, and only when `roster` resolved. `value.worktrees`: lingering worktrees whose WU has shipped (against `completed/`), each with `worktreePath`, `branch`, and a marker-gated `decision` (`removable`; `blocked` with `reason` `uncommitted` or `unmerged`; or `external`). Surfaced in Step 6; never auto-removed                                                                                                                                                                                          |
| `retiredSubdirs`            | Pre-computed retired-subdir detection. `value.candidates`: retired-WU user subdirs lingering under `user/{identity}/` — shipped and absent from the recent-notes window. Present whenever identity resolved; omitted only when identity is absent. Read-only surface (Step 6) — the reconcile (removal with a `.internal/` backup) runs at `arc user load` / `pull`, not at init                                                                                                                                                                                                          |
| `errandSweep`               | Pre-computed reminder sweep. `value.stale`: `_Remind:_`-flagged `§ Atomic` `USER-INBOX` entries pending past `inbox.remind_after_days` (default 1), each with `slug`, `created`, and `ageDays`. Present whenever identity resolved (the inbox is identity-scoped — not worktree-gated, unlike `sweep`); omitted only when identity is absent. Read-only advisory surfaced in Step 6 as a once-per-calendar-day batched nudge — drain via housekeep; never auto-removed                                                                                                                    |
| `errandState`               | Pre-computed errand-state probe. `value.resume`: current-branch resume signal (`resumable`, `slug`) on meta-less `chore/` branches. `value.inFlight.errands`: Orient-only advisory over local/remote `chore/` branches (`in-progress` / `awaiting-merge` / `merged-cleanup` / `stale`). `value.materializable.candidates`: remote-only `chore/` branches with no local worktree and no backing meta. `value.nudge`: once-per-calendar-day marker state (`shouldNudge`, `markerPath`, `today`) shared by reminder and stale-errand surfaces. Present if worktree + active probes resolved. |
| `materializableWorkUnits`   | Pre-computed materialize-candidate set. `value.candidates`: the operator's remote-only in-flight work units (branch + committed meta on the remote, no local worktree), each `{name, branch}` — the discovery surface the Materialize arm offers for cross-machine pickup. Present ONLY on the no-active-WU arm (`active.resolution === "none"`), where the oracle's network slice fires; the resume path omits it (zero oracle cost). An empty list means the oracle ran and found none (or the remote was unreachable)                                                                  |
| `inboxState`                | Pre-computed inbox-state probe. `value.routableCount`: count of routable (well-formed) `USER-INBOX` entries; `value.housekeepNeeded`: true when that count > 0. Present whenever identity resolved (the source is identity-scoped); omitted only when identity is absent. Read by the Orient arm's housekeep intent (Step 2) and surfaced as the Step 6 soft-offer                                                                                                                                                                                                                        |

**Raw notes-ref topology on `user.value.refState?`**: The notes spine's 5-state `value.state` enum encodes
pull-direction dispatch and collapses `same` and `local-ahead` into `clean` (both mean "no pull needed"). The
parallel `value.refState?` field preserves raw topology (`same` / `local-ahead` / `remote-ahead` / `diverged` /
`remote-unavailable`; omitted only when `state == "disabled"`). Step 6 reads it inside the `clean` arm to
distinguish the collapsed cases for orientation surfacing.

**Interlock-mode keys on `config.value.settings.{commit.interlock, push.interlock}`**: Both are
git-config-resolved from `arc.commitInterlock` / `arc.pushInterlock` (with documented defaults when
unset) rather than yaml-sourced. Load-bearing for prompt-prefix composition at any commit or push
fire site — see DEV-RULES.ARC § Implied-approval scope for the prefix mapping.

Carry `config` values forward as behavioral awareness. Do not surface configuration in orientation — defaults
and overrides reach the user at the consuming operation.

**Identity absent** (`identity.identity === null`): Skip all user workspace access — SESSION-NOTES,
WORKING-MEMORY, USER-INBOX, and git notes all depend on identity for path resolution. Surface a
warning in orientation. Sessions without identity cannot perform handoff.

**Role is `contributor`**: After Step 3 items 1–6, switch to [`session-init.contributor.md`][session-init-contributor]
for item 7+, Step 5 skip, and Step 6 contributor orientation. Step 4 and Step 7 apply universally.

**Probe failure fallback**: If the composite call fails, fall back to direct commands:
`git config arc.identity` / `arc.role`, `grep -l "^active: true" .arc/system/extensions/*.md`, and a scan
of the role-resolved active root — `.arc/active/**/meta-*.md` for maintainer / null role,
`.arc/user/{identity}/active/meta-*.md` (flat) for contributor with identity resolved. Skip Step 2 (no
user-sync state available) and note the degradation in orientation.

## 2. Dispatch & Conditional Sync

From the resolved probe (Step 1), realign git state if needed, select the **entry mode**, and — for the arm
that continues into context-load — run the conditional sync pulls. Three parts in order: a branch-gone
precondition, the entry dispatch, then the sync channels.

### Branch-gone recovery (precondition)

When `worktree.value.state == "branch-gone"`, align git state *before* anything reads against the working
branch. The upstream was deleted (the branch shipped elsewhere), so the notes pull here and Step 3's
context-load would otherwise surface metas and companion files that don't exist on the recovered branch.
The `recovery` slot carries pre-computed candidates (no scanning across turns); render them as a single
recovery prompt, branched on `recovery.value.kind`:

- `resolved` — offer the one candidate directly; or, when its `proposedAction` is `removable`, offer to
  remove the shipped worktree and archive its meta instead of switching (`external` candidates are surfaced,
  not acted on).
- `surface` — list each candidate's `branch` + `proposedAction` for the operator to choose, never guessing.
- `main-fallback` — offer `main`.

```text
**Branch gone:** `{branch}`'s upstream was deleted on `origin`. Recover onto `{candidate.branch}`?
(surface → list candidates, ask which; main-fallback → switch to `main`?)
```

On a switch, fetch the target first when it is a remote branch not yet checked out locally, then **re-run the
Step 1 probe** so the entry dispatch below and Step 3 read against the recovered branch — the re-probed
`worktree.value.state` is no longer `branch-gone`. If recovery is declined or deferred, skip the dispatch and
channels below and carry the still-gone state to Step 6's branch-gone arm. Every other state proceeds to the
entry dispatch below.

### Entry dispatch

Select the entry mode from `active.value.resolution` and `worktree.value` (the probe pre-resolves both — do
not run your own fetch / `git worktree list` / meta reads):

An **entry seed** may accompany the invocation — an optional spec pointer or description provided at session
entry (it reaches this workflow as context, not via the probe). It feeds **cold-start** only; on every other
arm it is surfaced, not acted on.

An **`--errand` signal** may also accompany the invocation — an explicit token, orthogonal to the positional
entry seed (so it never collides with cold-start's spec input). It feeds the **Orient** arm only, switching that
arm from between-WU discovery to **errand mode** (the cold-Errand path); on every other arm it is surfaced, not
acted on.

- **Errand-resume** — `errandState.value.resume.resumable === true`. The current branch is a meta-less
  `chore/<slug>` errand, not a work unit. Continue to the sync channels below, then load universal context and
  [run-errand][run-errand] in resume mode; never route this arm through `sessionType` or `process-task-loop`.
- **Resume** — `active.resolution` is `single` or `multiple`. An active work unit is present; continue to the
  sync channels below, then Step 3.
- **Orient** — `active.resolution` is `none` and the worktree is not bare (e.g. the primary worktree between
  units). Discovery and errand are the dispatch intents, disambiguated by the explicit `--errand` signal (never
  "any arg" — the positional seed stays orthogonal); housekeep overlays either as a soft-offer when the inbox
  holds routable captures:
    - **Discovery** (default — bare `arc-session`, or with a positional seed): continue as resume; Step 5's
      next-work discovery orients and awaits direction. If `errandState` carries flagged captures, in-flight
      `chore/` branches, or materializable remote errands — or `materializableWorkUnits` carries remote-only
      WU candidates — surface them in Step 6 as available routes.
    - **Errand** (`--errand <blurb|slug>` present, primary worktree): enter **errand mode** — see
      [Errand cold-entry](#errand-cold-entry-orient-arm) below. If `--errand` arrives in a non-primary worktree,
      surface that an Errand runs from the primary worktree and fall through to discovery.
    - **Housekeep** (`inboxState.value.housekeepNeeded`, primary worktree): when `USER-INBOX` holds routable
      captures, carry the housekeep intent — surfaced as a soft-offer in Step 6's orientation, never a hard
      dispatch. It overlays the discovery arm (housekeep, then discover) rather than replacing it; the developer
      drains via the [arc-housekeep skill][arc-housekeep-skill]. Soft-encourage, never hard-block.
- **Cold-start** — `active.resolution` is `none` and the worktree is bare: a branch checked out for new work
  with no work unit (typically a linked worktree, `worktree.value.identity.kind` of `linked`). Offer to
  scaffold — never auto-scaffold. Before scaffolding, run the [in-flight scope check][in-flight-scope-check] —
  an advisory pass over in-flight work units that surfaces scope overlap and never gates. When an entry seed is
  present, run `arc start --here --from <seed>`; otherwise run bare `arc start --here`. Either scaffolds a
  Planning meta and seeded SESSION-NOTES into the current worktree, with an advisory ownership marker since ARC
  didn't create it. Show the seed's resolved disposition
  in the offer so the user confirms the reading, not just the act — the command reads an issue ref as `Origin`,
  an ARC spec artifact (`draft-` / `spec-`) as `Design`, and passes anything else (a file/URL or free-text
  blurb) through for you to interpret. On accept, run the command, **re-run the Step 1 probe**, and proceed as
  **Resume**. On decline, fall through to **Orient**.
- **Materialize** — the probe surfaces a remote-only work unit (`materializableWorkUnits.value.candidates`
  non-empty) or a remote-only errand (`errandState.value.materializable.candidates` includes a `chore/<slug>`
  branch with no local worktree and no backing meta). Surface the candidates and ask which to materialize when
  more than one is present; never guess — the candidate list *is* the correctness mechanism (you pick a real
  in-flight entry, so a phantom / typo'd name is impossible). For a work unit: `git worktree add <path>
  origin/<branch>` at the path resolved from `worktree.location_template` (`{repo}` → repo name, `{branch}` →
  branch with `/` slugged to `-`), then `arc user pull` to load its notes; **re-run the Step 1 probe** and
  proceed as **Resume**. For an errand: `git worktree add <path> origin/<branch>`, **re-run the Step 1 probe**,
  and proceed as **Errand-resume**. The candidate surface already excludes any entry checked out locally (the
  oracle's `remoteOnly` filter); as a backstop, git refuses a double checkout, so an already-materialized branch
  resolves to its existing worktree rather than erroring into a second one.

**Cold-start** and **Materialize** are the only arms peeled off before context-load — each mints or fetches
state, then re-runs the probe and re-enters as **Resume** or **Errand-resume**. **Resume**, **Errand-resume**,
and **Orient** continue straight to the channels below.

**Seed not consumed (non-cold-start arms).** Per the entry-seed rule above, only cold-start acts on a seed.
When one was supplied but the resolved arm is anything else, surface a one-line note in orientation (Step 6):
the seed was not consumed; starting fresh work from it means spawning or checking out a new worktree and
re-entering there.

**Errand signal not consumed (non-Orient arms).** `--errand` feeds only the Orient arm's errand mode. On a
Resume arm (an active WU session), out-of-WU work that surfaces mid-session follows
[DEV-RULES.ARC § Discovered Work Routing][dev-rules-routing] — capture it to `USER-INBOX` via the
[arc-inbox skill][arc-inbox-skill] to drain later, or run it as its own errand from the primary worktree via a
fresh `arc-session --errand`; surface that pointer in orientation. On cold-start or materialize, note the signal
was not consumed.

### Conditional sync pulls (resume / orient arm)

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

### Errand cold-entry (Orient arm)

Reached from the Orient arm when `--errand` is present in the primary worktree — a maintenance Errand arising
with no originating session (the cold case). `arc-session` stays the one universal door; this is its no-WU path
acting on the second intent. Errand mode loads **universal context only**, then classifies and sets up the
Errand in place — no cross-worktree hop, since the primary worktree is where an Errand executes.

1. **Sync, then load universal context only.** Run the conditional sync pulls above, then Step 3 items 1–6 and
   WORKING-MEMORY (item 8.2) — the universal surfaces. **Skip every WU-artifact read:** SESSION-NOTES (item 8.1),
   the active task list (item 9), and the lifecycle workflow (item 10) — there is no work unit to orient against.
2. **Skip Step 5 (Assess Readiness).** No handoff baseline exists to freshness-check, and the setup below
   replaces next-work-unit discovery (that is the *discovery* intent, not the Errand one).
3. **Classify, gate, execute.** Follow the [run-errand workflow][run-errand] in Launch mode. The errand seed
   comes from the `--errand` blurb/slug when present; when it names a flagged `USER-INBOX § Atomic` capture,
   adopt that capture as the originating entry. Launch classifies errand-vs-Work-Unit (with the stop-and-route
   exit when the work is really a Work Unit), runs the advisory `arc errand check` overlap, and resolves the
   base + relocates by cutting the `chore/<slug>` branch off `branch.base` (default `main`) in this worktree;
   its Execute phase runs the Errand as a normal review increment.
4. **Orient on the Errand.** Frame the Step 6 summary on the Errand — its goal, the `chore/<slug>` branch, and
   any coordination caveat — rather than on a work unit, then continue into the Errand as the session's work.

## 3. Load Context Documents

**Reading rule**: Read every document in the list below in full EXCEPT QUICK-REFERENCE (item 6 —
section-level partial read) and the active task list (item 9 — strategic partial read).

**Partial-read structural mapping**: When a partial read needs section offsets, issue ONE grep for the
section delimiter and compute Read offsets locally — never per-section greps. Skip the grep entirely
when a stable file convention places the section at a known location.

**Parallelism (prescriptive)**: Issue items 1–6, 8 (personal session context — both SESSION-NOTES
and WORKING-MEMORY), and — when `active.resolution === "single"` — the active meta file as Reads
in a single tool-message. Items 9–10 follow after the meta file resolves; they may parallel each
other. Don't serialize when the platform supports parallel reads.

The document set below is the [session-state method][arc-methods-session] default. If your project overrides
session-state, follow the override instead.

**Errand-resume mode** (`errandState.value.resume.resumable === true`): load universal context only — items
1–6 and WORKING-MEMORY (item 8.2). Skip active meta, SESSION-NOTES, active task list, and the
`sessionType`-selected lifecycle workflow; instead load [run-errand][run-errand] in resume mode.

**Project identity and agent context:**

1. `.arc/reference/briefs/AGENT-BRIEF.ARC.md` — ARC framework orientation
2. `.arc/reference/briefs/AGENT-BRIEF.PROJECT.md` — project overview, tech stack, collaboration context

**Constitutional and process context:**

3. `.arc/system/rules/DEV-RULES.ARC.md`
4. `.arc/system/rules/DEV-RULES.PROJECT.md`
    - Domain rules: the probe's `domainRules` field lists `{path, domain, purpose}` tuples for any
      `DEV-RULES.{DOMAIN}.md` files with the domain-rules frontmatter. Load on-demand when a task
      touches the relevant domain, not at init time.
5. `.arc/reference/strategies/STRATEGY-INDEX.md`
6. `.arc/reference/QUICK-REFERENCE.md` — **section-level partial read**: `## Environment & Path Context`
    only (subsumes `### Runtime Environment`). File convention: this is the first section. Read
    directly with `limit: ~35`. Apply structural mapping (delimiter `^##` line prefix) only if the
    convention has been broken.

**Active work context:**

7. **Active meta file** — resolve from `active.value` and read the file in full (small by
   convention; no partial-read offset needed):
    - `resolution: "single"`: path is `active.value.path`
    - `resolution: "none"`: no active work unit. Skip items 9–10; Step 5 handles next-work discovery
    - `resolution: "multiple"` (full mode only): apply disambiguation after SESSION-NOTES loads (item 8) —
      precedence:
        1. SESSION-NOTES `**Working On:**` value matches a candidate filename
        2. Candidate `**Branch:**` matches the current git branch
        3. Candidate `**State:** Active`
        4. Prompt the user with each candidate shown as:

            ```text
              [N] <filename> · <branch>
                  Next Task: <truncated Next Task>
                  State:    <State value>
            ```

            Include an abort option (`[q]`). If the user aborts, surface the candidate list and halt
            session-init.
    - **Task reference format**: `**Next Task:**` uses triple-anchor format —
      `Task 5.5 — Implement validation (line ~1903)`. All three anchors should be present; any two are
      sufficient for reliable lookup.

8. **Personal session context** — read both per-WU and cross-WU surfaces. Uses `{identity}` from
   Step 1. Read directly (no `test -f` precheck — Read tool handles missing files gracefully).

    1. `.arc/user/{identity}/<wu-name>/SESSION-NOTES.md` — per-WU session context. Derive
       `<wu-name>` from the active meta filename (basename of `active.value.path`, strip `meta-`
       prefix and `.md` suffix). When `active.resolution === "none"` or `"multiple"` (pre-
       disambiguation), no WU is anchored — skip the SESSION-NOTES read.
        - Personal working context from prior session: approach, decisions, things tried, known
          risks.
        - **If absent or stale**: Try `arc user load` (walks ancestors for
          `refs/notes/arc/user/{identity}`). If no notes either, fall back to
          `git log --oneline -10`. Tracked state + git history is sufficient.

    2. `.arc/user/{identity}/WORKING-MEMORY.md` — cross-WU persistent context. Entries each carry
       a `_Remove when:_` trigger; treat them as active constraints for this session until their
       trigger condition is met.
        - **If absent**: no persistent context yet — common for fresh repos or sessions before
          any entry has been added.

    - **Load errors** (both files): See [SESSION-NOTES Load Error Recovery][session-ops-load-errors]
      for diagnostic commands per error class.

> **Person-to-person handoff:** If bootstrapping from another developer's handoff, fetch their git notes
> namespace (`refs/notes/arc/user/{their-identity}`). See [Team Coordination Strategy][team-coordination]
> § Person-to-Person Task Handoff for the incoming bootstrap protocol.

**Resolve session type** — after the parallel batch and item 8 resolve, settle the session type that gates
items 9–10. The probe envelope carries `active.value.sessionType` ∈
`{"planning", "execution", "integration", null}` inferred from the resolved meta file's `**State:**`
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

    **Skip if** `sessionType === "planning"` (primary gate) or the active meta file is not resolved or
    shows `**Task List:** [none]` (defense-in-depth shape checks — redundant under inference but kept as
    direct checks).

    - Path: `dirname(active.value.path) + '/' + <Task List value>` — the `**Task List:**` field
      carries the bare filename (`tasks-[name].md`); the directory is the meta file's directory
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

    - `errandState.value.resume.resumable === true` → `.arc/system/workflows/arc/supplemental/run-errand.md`
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

**Errand mode** (Orient arm reached via `--errand`, or Errand-resume via `errandState`): skip this entire step —
there is no work-unit handoff baseline to freshness-check, and errand setup/resume replaces next-work discovery.
See [Errand cold-entry](#errand-cold-entry-orient-arm).

### Freshness check

**Skip if** SESSION-NOTES `Commit at Handoff` hash matches current HEAD — documents are current.

Otherwise, or if no handoff hash exists (first session, crash, fresh clone without notes):

```bash
# Current HEAD
git log -1 --format=%h

# Commits since handoff (skip if no handoff hash — no baseline)
git log --oneline <handoff-hash>..HEAD

# Active meta file freshness (skip if no meta file resolved)
git log -1 --format=%h -- <meta-file-path>
# Differing from HEAD means the meta file hasn't been updated across recent commits
```

A gap doesn't mean state is wrong — it means verify more carefully before trusting session documents. **Only
mention gaps in orientation if they exist.** A clean check produces no output.

If the freshness gap suggests an interrupted session, run the crash-recovery routine
([process-task-loop § Crash Recovery][process-task-loop]).

### Next work unit discovery

**Skip if** an active meta file was resolved AND (`sessionType === "planning"` OR `**Task List:**` is not
`[none]`) — discovery only applies between work units. A planning session is an active WU even with no task
list yet; the meta file's Next Action carries direction.

When no active meta file was resolved, or the resolved file shows `**Task List:** [none]` outside a
planning session, assess readiness for the next unit:

1. Read `.arc/backlog/ROADMAP.md` — identify the next queued or suggested item
2. Check `.arc/backlog/` for existing artifacts (PRDs, `draft-*` docs) matching that item
3. Report what exists and its readiness state in orientation
4. Propose next steps; ask for confirmation before proceeding

> **Full protection (`branch.protection: full`):** Planning work requires a branch. When the user confirms
> next steps, run [init-work-unit][init-work-unit] before creating draft documents or PRDs.
> Under partial protection (the default), proceed directly to [1_create-spec.md][create-spec] — no planning
> branch needed.

## 6. Confirm Orientation

Produce the orientation summary.

**Errand mode** (Orient arm via `--errand`, or Errand-resume via `errandState`): frame the summary on the
Errand — its goal, the `chore/<slug>` branch, and any coordination caveat — instead of work-unit state; the
active-work-state shape below does not apply. See [Errand cold-entry](#errand-cold-entry-orient-arm).

**Output format:**

**ARC session initialized** · `{branch-name}` · {clean | uncommitted changes}

When `worktree.value.identity.kind === "linked"`, insert `` · `worktree: {identity.path}` `` into the header
after the branch — naming the non-primary worktree the session occupies. Omit entirely in the primary worktree.

**Active work state:**

- **Last completed**: One line. Task ID + title + commit state.
- **Current task**: One line. Task ID + title, or `none` between work units.
- **Blockers**: `none` or freeform — mismatch detail and blocker context unbounded.

**Next action:** One line on-task-list (meta file pointer). Unbounded when off-task-list — carries work
no other tracked source documents.

Awaiting direction — proceed to Next Action?

**Include only if actionable**: freshness gaps, missing identity, environment issues, sync states other than
`clean` (worktree or notes), an unconsumed entry seed (non-cold-start entry), probe-failure fallback.

**Anti-pattern:** Restating the Next Task's full description from the task list. The task list carries the
detail; orientation needs only the pointer. Reserve unbounded prose for off-task-list scenarios where no
tracked source documents the work.

**Conditional top-level sections** — prepend above `**Active work state:**` when applicable:

- `worktree.value.state == "diverged"`:

  ```text
  **Reconcile required:** `{branch}` diverged from `origin/{branch}` ({ahead} ahead, {behind} behind).
  Manual rebase or merge needed before pushing. Carried forward — commit/push requests will be flagged.
  ```

- `worktree.value.state == "branch-gone"` — recovery (Step 2's branch-gone precondition) was declined or
  deferred, so the upstream is still gone at orientation time. Surface it and await direction; do not re-render
  the cascade here.

  ```text
  **Branch gone:** `{branch}`'s upstream was deleted on `origin`; recovery was not completed. Re-run
  branch-gone recovery or pick a branch manually before sync, commit, or push.
  ```

- `worktree.value.state == "local-ahead"`:

  ```text
  **Local-ahead:** {ahead} unpushed commit(s) on `{branch}`.
  ```

- `user.value.state == "clean"` AND `user.value.refState == "local-ahead"`:

  ```text
  **Local-ahead notes:** local user-notes ref is ahead of remote. Push (or `arc sync`) when ready; non-blocking.
  ```

- `worktree.value.state == "no-upstream"`:

  ```text
  **New branch:** `{branch}` has no upstream — will be set on first push.
  ```

- `worktree.value.state == "detached-head"`:

  ```text
  **Detached HEAD:** check out a branch before push/sync.
  ```

- `worktree.value.state == "no-remote"`:

  ```text
  **No remote:** `origin` not configured. Set up a remote before push/sync.
  ```

- `dirty.value.state == "dirty"`:

  ```text
  **Uncommitted changes:** {fileCount} file(s) dirty in working tree.
  ```

- `sweep.value.worktrees` non-empty (primary worktree only): worktrees for shipped work units linger.
  Surface each with its `decision.action` — `removable` (ARC-marked, clean, merged) offers an
  interlock-gated `git worktree remove {worktreePath}`; `blocked` shows the blocking state
  (`uncommitted` / `unmerged`) and never auto-removes (no `--force`); `external` (no ARC marker) is
  externally-managed — leave removal to the operator. Removal runs from the current (primary) worktree.

  ```text
  **Stale worktrees:** {N} worktree(s) for shipped work units linger:
  - `{branch}` — clean & merged → remove? `git worktree remove {worktreePath}`
  - `{branch}` — {uncommitted | unmerged}; surfaced, not removed
  - `{branch}` — externally-managed (no ARC marker); remove manually if desired
  ```

- `retiredSubdirs.value.candidates` non-empty: retired-WU user subdirs linger locally (shipped and absent
  from the recent-notes window). They reconcile automatically — removed, with a `.internal/` backup — on the
  next `arc user load` / `pull`; surface as a heads-up, no action needed at init.

  ```text
  **Retired subdirs:** {N} shipped-WU user subdir(s) linger; reconciled (with `.internal/` backup) on next
  `arc user load` / `pull`:
  - `{candidate}`
  ```

- `errandSweep.value.stale` non-empty AND `errandState.value.nudge.shouldNudge`: `_Remind:_`-flagged `§ Atomic`
  `USER-INBOX` captures pending past `inbox.remind_after_days` (default 1) — the retired errand queue's "here are
  your committed follow-ups" discoverability, now an inbox filter. Surface them as one batched line for the
  operator to drain via housekeep; advisory only, never auto-removed. After surfacing, write
  `errandState.value.nudge.today` to `errandState.value.nudge.markerPath` (create the parent directory if needed)
  so the nudge batches to once per calendar day.

  ```text
  **Reminder:** {N} flagged capture(s) pending past the reminder threshold — drain via `arc-housekeep`:
  - `{slug}` — created {created} ({ageDays}d ago)
  ```

- `errandState.value.inFlight.errands` non-empty (Orient arm — no active WU): local or remote `chore/` errands
  are in flight. Surface them as available routes; never auto-check out, merge, or delete. Suppress stale entries
  unless `errandState.value.nudge.shouldNudge` is true; when surfaced, update the same nudge marker described
  above.

  ```text
  **Errands in flight:** {N} `chore/` branch(es) detected:
  - `{branch}` — {in-progress | awaiting-merge | merged-cleanup | stale} ({ageDays}d)
  ```

- `errandState.value.materializable.candidates` non-empty (Orient arm — no active WU): remote-only errand
  branches can be materialized for cross-machine resume. Surface as a route; on selection, follow Step 2's
  Materialize arm.

  ```text
  **Materializable errands:** {N} remote `chore/` branch(es) available:
  - `{branch}` — materialize and resume?
  ```

- `materializableWorkUnits.value.candidates` non-empty (Orient arm — no active WU): remote-only owned work units
  can be materialized onto this machine for cross-machine pickup. Surface as a route; on selection, follow Step 2's
  Materialize arm. The candidate list is the correctness mechanism — selecting a real in-flight WU makes a
  phantom / typo'd name impossible.

  ```text
  **Materializable work units:** {N} remote WU(s) available:
  - `{name}` (`{branch}`) — materialize and resume?
  ```

- `inboxState.value.housekeepNeeded` (Orient arm — no active WU): `USER-INBOX` holds routable captures. Soft-offer
  the between-WU drain; never hard-block. A Resume session (active WU) carries the probe but does not surface this
  — housekeep drains from a base-branch context, not mid-WU.

  ```text
  **Housekeep:** no active WU; `USER-INBOX` has {inboxState.value.routableCount} pending capture(s) — housekeep?
  ```

**Never include**: configuration overrides, active-extensions list (any state), defaults active, freshness
clean, environment checks passed.

## 7. Handle Context Mismatches

If documented state doesn't match reality during initialization, resolve along the axis the mismatch belongs
to. A mismatch answers one of two distinct questions, each with its own authoritative source — don't apply one
axis's authority to the other's question.

**Axis 1 — Truth of work state** ("was this actually committed?"). Git is authoritative: commits, file
contents on disk, `git status`. The task list, the active meta file, and personal session context
(SESSION-NOTES, WORKING-MEMORY) are *claims* about work state — verify them against git, which wins on conflict.

**Axis 2 — Which work am I picking up** (the roster question). Identity-filtered metas + the worktree list are
authoritative — the same authority the Step-2 branch-gone recovery uses to pick a target. Personal notes are
deliberately absent from this axis: they answer the *context* question (how the work was approached), not the
*roster* question (which WU / branch / task this session resumes).

**Acting on a mismatch.** Auto-recover when one axis's authority resolves it cleanly; stop and ask when it
stays ambiguous.

**Auto-recover with notice** — the authoritative source is unambiguous; proceed with ground truth and report
the discrepancy in orientation. Report format: "Active meta file said X. Git/task list show Y. Proceeding
with Y."

- *Axis 1:* active meta file says "Task 3.3 in progress" but the task list shows 3.3 `[x]` and git log confirms
  the commit → proceed with Task 3.4 as current.
- *Axis 1:* `worktree.value.state == "diverged"` while session docs reflect clean state → git is ground truth.
  Surface as `Reconcile required:` (Step 6) and carry forward. Non-blocking; do not auto-reconcile.

**Stop and ask** — multiple plausible explanations, or same-tier sources within an axis disagree. Report each
source's view with specific details and wait for explicit direction before any corrective action.

- *Axis 1:* git shows uncommitted changes to files not mentioned in any session doc — could be co-development,
  a partial task, or an interrupted session.
- *Axis 2:* the active meta file references a task that doesn't exist in the task list — renumbered, removed,
  or the meta file points to the wrong task list.

---

[init-work-unit]: ../work-unit-lifecycle/planning/init-work-unit.md
[in-flight-scope-check]: ../work-unit-lifecycle/in-flight-scope-check.md
[run-errand]: ../supplemental/run-errand.md
[arc-inbox-skill]: ../../../.internal/skills/arc-inbox/SKILL.md
[arc-housekeep-skill]: ../../../.internal/skills/arc-housekeep/SKILL.md
[dev-rules-routing]: ../../../rules/DEV-RULES.ARC.md#discovered-work-routing
[create-spec]: ../1_create-spec.md
[arc-methods-session]: ../../../methods/session-state.md
[arc-ext-post-context-load]: ../../../extensions/post-context-load.md
[team-coordination]: ../../../../reference/strategies/arc/strategy-team-coordination.md
[session-ops-load-errors]: ../../../../reference/strategies/arc/strategy-session-operations.md#session-notes-load-error-recovery
[session-init-contributor]: session-init.contributor.md
[process-task-loop]: ../3_process-task-loop.md
