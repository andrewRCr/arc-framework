# Strategy: Session Operations

> **Evidence base and rationale:** [Sessions & Context](https://andrewrcr.github.io/arc-framework/reference/sessions/)
> on the docs site covers degradation evidence, duration guidance, instruction density concepts,
> tier rationale, monitoring responsibilities, and auto-compaction reasoning.

Operational specification for context loading and session-operational flow in ARC. Covers the
tiered context model and loading mechanisms (context); the interlock model, status-file timing,
and handoff-interior toggle pattern (flow); plus context monitoring and session state portability
(operational rhythm). For session lifecycle workflows, see [session-init][session-init],
[session-handoff][session-handoff], and [session-loop][session-loop].

---

## Contents

- [Context Loading Model](#context-loading-model) — three-tier classification
- [Classification Criteria](#classification-criteria) — which tier for new content
- [Loading Mechanisms](#loading-mechanisms) — how each tier enters agent context
- [Method and Extension Loading](#method-and-extension-loading) — on-demand procedural content
- [Interlock Model](#interlock-model) — interlock stack, ceremony, configurability, approval signals
- [Failure-Mode Recovery](#failure-mode-recovery) — taxonomy and recovery paths for interlock cascades
- [Status-File Timing](#status-file-timing) — when status updates land in commit history
- [User Workspace Directory](#user-workspace-directory) — path-class layout for `user/{identity}/`
- [SESSION-NOTES](#session-notes) — personal session-context companion to the status file
- [Working Memory](#working-memory) — cross-WU persistent context with eviction triggers
- [Handoff-Interior Toggle Pattern](#handoff-interior-toggle-pattern) — config-key convention for handoff actions
- [Context Monitoring](#context-monitoring) — shared responsibility model
- [Auto-Compaction](#auto-compaction) — operational guidance
- [Session State Portability](#session-state-portability) — cross-machine and team scenarios

---

## Context Loading Model

ARC organizes agent context into three tiers based on when the content becomes relevant:

| Tier | Name           | When Loaded                          | Content Type                                              |
|------|----------------|--------------------------------------|-----------------------------------------------------------|
| T1   | Constitutional | Session initialization               | Principles, identity, constraints, navigation             |
| T2   | State          | Session initialization               | Work status, session notes, task overview                 |
| T3   | Procedural     | On-demand at workflow trigger points | Method defaults/overrides, strategies, detailed workflows |

**T1 — Constitutional.** Content that governs all agent behavior regardless of the session's
work. Always loaded at session start.

- AGENT-BRIEF.ARC.md (ARC framework orientation)
- AGENT-BRIEF.PROJECT.md (project identity and collaboration context)
- DEV-RULES — ARC and Project (quality standards, methodology rules)
- STRATEGY-INDEX — both framework and project (navigation to domain guidance)
- QUICK-REFERENCE (environment context, command patterns)
- arc-config.yml (project settings)

**T2 — State.** Content that orients the agent — where work stands, what happened last session,
what comes next. Always loaded at session start.

- status-{name}.md (per-WU tracked project pointer in active/{category}/; holds State, Branch,
  Task List, Next Task, Last Completed, Blockers, Next Action)
- SESSION-NOTES.md (personal session context from prior handoff)
- Task list overview and current task section (strategic partial read)

**T3 — Procedural.** Step-by-step guidance for specific activities that may or may not happen in
a given session. Loaded on-demand when the agent enters the relevant workflow phase.

- arc-methods defaults and overrides (decision trees, format specs, classification rubrics)
- Strategy documents (domain-specific patterns and guidance)
- Workflow documents (prepare-commits, integrate-work-unit)
- arc-extensions steps (post-task-quality, pre-merge-review, etc.)

### State-Conditional Promotion

Some T3 content becomes near-certain to be needed based on session state available at init time.
Content meeting these criteria promotes from T3 to the session-init load set:

| Content           | State Signal                                        | Promotes When             |
|-------------------|-----------------------------------------------------|---------------------------|
| process-task-loop | Status file resolved; `**Task List:**` not `[none]` | Active task work expected |

Sessions without active task lists (planning, evaluation, exploratory) don't need ~240 lines of
dense procedural content. The state signal loads it precisely when relevant.

### Probe pattern

Session-init consumes ARC state through a **composite probe** rather than orchestrating individual file reads
and subprocess calls:

- **Non-destructive** — read-only, no mutations, no user prompts
- **Harness-first** — agent-consumed via `--json`, not CLI-interactive
- **Composite-first** — `arc status --session-init --json` returns identity, user-sync, extensions, config,
  and active-status-file resolution in a single envelope. Fans out to slot probes via `Promise.all`; each slot
  wraps into a typed `Probe<T>` union so one slot's failure doesn't invalidate the others

Standalone probe commands (`arc user status`, `arc config status`, `arc extensions status`, `arc active
status`) share the same implementations and are available for debugging and CI. Session-init uses only the
composite.

The same machinery underlies the session-handoff probe (`arc status --session-handoff --json`); see
§ Handoff-Interior Toggle Pattern for the handoff envelope's role in workflow consumption.

#### Handoff envelope fields

The `arc status --session-handoff --json` envelope carries seven probe slots plus identity. Each slot
wraps in the same `Probe<T>` discriminated union as session-init; per-slot failures surface in the error
branch rather than rejecting the composite. Mirrors the session-init field table in `session-init.md`.

| Field             | Contents                                                                                                                                                                  |
|-------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `identity`        | `{identity, role}` — either may be `null`                                                                                                                                 |
| `dirty`           | Working-tree porcelain check (`value.state`: clean / dirty; `value.fileCount` carries the entry count, 0 when clean)                                                      |
| `worktree`        | Worktree sync state vs. `origin/<current-branch>` — same shape as session-init's `worktree` slot                                                                          |
| `user`            | Notes-sync state — same shape as session-init's `user` slot; identity-missing short-circuit applies when `arc.identity` is absent                                         |
| `syncInterlock`   | `{value, source}` — resolved `arc.syncInterlock`. Gates whether handoff invokes `arc sync` (`on-handoff`) or surfaces unpushed state without firing (`manual`)            |
| `active`          | Active status file resolution — same shape as session-init's `active` slot                                                                                                |
| `head`            | Current `HEAD` short-hash (`value.hash`) — anchors the `Commit at Handoff` field written by the handoff workflow                                                          |
| `pushability`     | Pushability pre-check matrix for the worktree push leg (`target: "worktree"`). Cross-reference with `worktree` for the full divergence picture                            |
| `releaseRouting`  | Resolved release-wrapper routing per class-tag (`taskCommit` / `workflowCommit` / `workflowPush` to `wrapper` or `raw`), plus `rationale` snapshot                        |

Push-interlock and notes-push policy are not surfaced as handoff envelope slots — `arc sync` owns
their resolution internally. The handoff workflow gates on `syncInterlock` (whether to invoke
`arc sync` at all); the orchestrator routes the downstream legs.

Consumer plans reference this table from their plan docs when defining handoff-time workflow behavior.

#### Extension contract

Consumer plans extending the probe envelope add a field by registering a slot. The contract:

- **Each slot is a typed `Probe<T>` union.** `ok: true` carries `value: T`; `ok: false` carries an error
  payload. One slot's failure surfaces in that slot only; sibling slots resolve independently.
- **Slot resolvers are non-destructive.** Read-only, no mutations, no user prompts. Side effects (e.g.,
  pulling notes) belong in the consuming workflow after the agent reads the probe — not inside the
  resolver.
- **Slots fan out via `Promise.all`.** The composite waits for all slots before returning the envelope;
  individual slot failures don't block the others.
- **Mode-aware field selection.** A slot may participate in `--session-init`, `--session-handoff`, both,
  or neither. The mode flag (passed to the composite) selects which slots fire; resolvers themselves
  remain mode-agnostic.

The same field-resolver machinery serves both modes. Adding a probe is structural extension — register
the slot and declare the mode(s) it serves — not session-init workflow prose changes. Workflows consume
the envelope uniformly.

---

## Classification Criteria

When adding new content to ARC — strategy docs, method overrides, extensions, workflow
guidance — classify it by asking:

**T1 — Constitutional?**

- Would violating this without knowing it cause incorrect behavior across *any* session activity?
- Is this a constraint, principle, or navigation index that applies regardless of task type?
- Would deferring this create a risk of the agent acting contrary to project standards?

**T2 — State?**

- Does the agent need this to orient itself — to know where work stands and what comes next?
- Is this anchored to the current moment (branch, task, blockers) rather than general guidance?

**T3 — Procedural?**

- Is this guidance for a specific activity that may or may not happen this session?
- Does it have a natural trigger point — a workflow step, a task marker, a domain entry?
- Could an agent work correctly without this until reaching the relevant activity?

**When uncertain, prefer T1.** The cost of loading unnecessary constitutional content is wasted
tokens; the cost of missing it is incorrect behavior.

---

## Loading Mechanisms

Each tier has established mechanisms for how content enters agent context:

### Session initialization (T1 + T2)

The [session-init workflow][session-init] prescribes upfront loading of constitutional and state
documents in a defined order. This is a bulk load — deterministic, ordered, and complete before
work begins. The load order (general → specific) ensures each document is understood in the
context of what came before.

### Workflow-embedded directives (T3)

Workflow documents contain explicit loading instructions for the methods and references they
depend on. When the agent reaches a workflow step that references a method or strategy, the
workflow tells it to load the relevant section.

Directives appear as a method dependencies block near the top of workflow documents:

> **Method dependencies (load on first reference):** [method-a], [method-b]. For each, check
> `.override` first; use `.default` if no override is configured.

This mechanism is deterministic (the workflow prescribes it), automatic (the agent follows the
workflow step by step), and scoped (only the relevant methods load, only when needed).

### Strategy-index triggers (T3)

DEV-RULES instructs agents to check the [Strategy Index][strategy-index] before working in
codified domains. The index serves as a T1 navigation layer (always loaded) that points to T3
strategy content (loaded on-demand). Each entry includes "Consult when:" triggers so agents can
determine relevance without loading the full document.

### User-invocable skills (T3)

Skills (arc-resume, arc-commit, arc-handoff) are user-initiated triggers that load thin guidance
layers and reference T3 workflows. These cover session lifecycle events where the user explicitly
initiates the activity.

---

## Method and Extension Loading

**Declaration mechanism.** Workflow frontmatter declares method and extension dependencies — see
[Workflow Authoring Strategy][workflow-authoring] for the schema. The frontmatter's `arc.methods` /
`arc.extensions` arrays are the load contract; in-step markdown links remain as reader navigation but do not
constitute the trigger.

### Per-file Frontmatter Schema

Methods and extensions live as per-file entries under `system/methods/` and `system/extensions/`, each with a
fixed YAML frontmatter block. The schema has two consumers: session-init reads the `active` field on each
`system/extensions/*.md` file via a single `grep` to produce the **active-extensions list** (see
§ Session-Init Consumption); the framework-repo CI audit reads the directories and workflow frontmatter to
enforce corpus-wide coverage. Method frontmatter is not consumed at init — method bodies always load at
workflow trigger.

**Method schema** (`system/methods/<name>.md`):

```yaml
---
name: <method-name>
description: <one-line operational purpose>
related:
  - <related-method-name>
override-active: false
---
```

**Extension schema** (`system/extensions/<name>.md`):

```yaml
---
name: <extension-name>
description: <one-line operational purpose>
related:
  - <related-extension-name>
active: false
---
```

**Field semantics:**

- `name` — method or extension name; must match the file basename (e.g., `issue-triage.md` registers
  `issue-triage`)
- `description` — one-line operational purpose. What it does, not where it fires
- `related` — array of coupled method or extension names within the same kind. Overriding one should prompt
  review of the others. Omit when empty
- `override-active` (methods only) — `true` when the file's override body is populated; `false` when the
  default is in effect. Consumed by the framework-repo CI audit, docs generation, and authoring tooling —
  not by session-init. Method bodies (both `.override` and `.default`) always load at workflow trigger, so
  init-time override-presence surfacing serves no agent decision
- `active` (extensions only) — `true` when the extension's `.actions` section is populated; `false` when the
  extension is an empty placeholder. Session-init enumerates files where `active: true` via `grep -l` to
  produce the active-extensions list (see § Session-Init Consumption). Fire-point directives consult the
  list by name and skip invocation for extensions not on it

**Why no `workflow` field:** The workflow→method/extension trigger contract lives in workflow frontmatter
(`arc.methods` / `arc.extensions`) — that's the mechanical coverage guarantee enforced by the framework-repo
CI audit. The reverse index (method→workflows) is centralized in this strategy's "Method classification by
trigger" table, which stays readable when methods fire from multiple workflows. A per-file `workflow` field
would duplicate that info, would be lossy when methods fan out (e.g., `session-state` fires at both
session-init and session-handoff), and has no mechanical consumer — so it's omitted.

### Per-file Body Conventions

Beyond the frontmatter schema, per-file method and extension documents follow a fixed body shape so reader
orientation stays consistent across files.

**H1:** `# Method: <name>` or `# Extension: <name>` — makes the kind visible at the top of the file.

**Preamble — blockquoted bullet list** immediately under the H1. Each field is a distinct bullet so prettier
and similar reflow tools don't merge them into one paragraph (the adjacent-bold-metadata gotcha codified in
commit `0870274`):

```markdown
> - **Workflow:** <primary caller link(s)>
> - **When:** <trigger condition — methods only>      OR
> - **Fires:** <precise fire moment — extensions only>
>
> - **Contract:** <invariant; load-bearing>
> - **Related:** <sibling link> — <one-clause rationale; when applicable>
```

Methods use `**When:**` (they're activity contracts that kick in during a workflow step); extensions use
`**Fires:**` (they're event handlers at a precise fire point). The distinct wording preserves the semantic
distinction between the two kinds.

The blockquote signals "this is preamble / framing" — subordinate to the structural content sections that
follow. A blank `>` line separates the trigger context (Workflow + When / Fires) from the contract content
(Contract + optional Related), for readability when Contract runs long. Multi-line field values use 2-space
continuation indent after the `>` so the wrapped text aligns with the character after the bullet marker.

**Structural sections — the content the system reads:**

- Methods: `## <name>.override` + `## <name>.default` (the override content and the default spec)
- Extensions: `## <name>.actions` (the steps to execute when `active: true`; placeholder `[No extension
  configured]` when `active: false`)

**Ref-defs:** Collected after a trailing `---` separator per [DEV-RULES.PROJECT][dev-rules-project]. Link
targets resolve via paths relative to the file's directory (`system/methods/` or `system/extensions/`).

### Session-Init Consumption

Methods and extensions have asymmetric init-time treatment.

**Methods — no init read.** Method bodies (`.override` + `.default`) always load at the workflow trigger
point declared in the calling workflow's `arc.methods` frontmatter. Session-init does not inspect
`override-active` — the agent-side compliance rule ([DEV-RULES.ARC][dev-rules-arc] § Method and extension
loading) plus reliable workflow-declared triggers make init-time override-presence surfacing unnecessary.

**Extensions — minimal init enumeration.** Session-init consumes the **active-extensions list** from the
composite `arc status --session-init --json` probe (see § Probe pattern). Internally, the probe enumerates
`system/extensions/*.md` files where frontmatter declares `active: true`:

```bash
grep -l "^active: true" .arc/system/extensions/*.md
```

The filenames returned (basenames, `.md` stripped) form the list — a named session-context artifact available
to downstream workflow steps. An empty list means no extensions are configured. Fire-point directives in the
calling workflows consult the list by name instead of re-reading the extension file at fire time. In default
installs most extensions are empty placeholders, so the single init-time enumeration avoids repeated
placeholder reads across a session.

**Related pattern — agent-file active-gate.** A similar `active` frontmatter flag applies to agent-specific
files that session-init loads unconditionally: `grep -m 1 "^active:"` retrieves the flag without reading
the body, and the body is read only when `active: true`. That pattern gates whether a single known file's
body is consumed; the active-extensions list pattern enumerates which files from a directory are active.
Both avoid unnecessary body reads at init, but they serve different decisions and are not interchangeable.

### Method Classification by Trigger

| Method                | Trigger Workflow    | Session Applicability                      |
|-----------------------|---------------------|--------------------------------------------|
| issue-triage          | process-task-loop   | Universal — every task execution session   |
| quality-gate-commands | process-task-loop   | Universal — every task execution session   |
| test-first            | process-task-loop   | Conditional — tasks with test-first marker |
| commit-format         | prepare-commits     | User-triggered commit events               |
| commit-footer         | prepare-commits     | User-triggered commit events               |
| diff-review           | integrate-work-unit | Integration phase only                     |
| review-triage         | integrate-work-unit | Integration phase only                     |
| session-state         | session-handoff     | Session end only                           |

---

## Interlock Model

These sections define ARC's session-operational flow — the interlock model, status-file timing, and
handoff-interior toggle pattern. For at-session rule statements that constrain agent behavior in this
domain, see [DEV-RULES.ARC][dev-rules-arc] § Commit Discipline and § Session Management.

### Vocabulary

An **interlock** is an active control mechanism that holds session-operational progress until released
by an approval signal — semantics drawn from safety-engineering and control-systems usage. ARC names
five: `task-interlock`, `commit-interlock`, `sync-interlock`, `push-interlock`, `integration-interlock`.

**Verb pairing.** Interlocks `release` (approval lifts the hold), `engage` (the default state — held
until released), and `hold` (a quality-gate failure or other condition reasserts the engaged state
regardless of approval).

### Linear Interlock Stack

The five interlocks attach to the operational junctions a unit of work passes through:

| Interlock                 | Configurability |
|---------------------------|-----------------|
| `task-interlock`          | Invariant       |
| `commit-interlock`        | Configurable    |
| `sync-interlock`          | Configurable    |
| `push-interlock`          | Configurable    |
| `integration-interlock`   | Invariant       |

All five interlocks are engaged by default. The configurable three release under explicit
`arc.commitInterlock`, `arc.syncInterlock`, and `arc.pushInterlock` settings; see
§ Configurability Architecture for the enums and § Handoff-Interior Toggle Pattern for how the
sync and push interlocks chain.

**Task-interlock.** Every review increment receives explicit human approval. Deferred review is a
bounded user-scoped convenience, not an autonomy mode.

**Commit-interlock.** Under `arc.commitInterlock: manual` (the default), the user explicitly
invokes commit. `on-task-approval` releases the interlock on task approval; `on-workflow` extends
release to workflow-ceremony commits as well.

**Push-interlock.** Under `arc.pushInterlock: manual` (the default), the user explicitly
invokes push. `on-sync` releases the interlock when an `arc sync` event fires — sync invocations
include handoff-driven sync (via `arc.syncInterlock: on-handoff`) and explicit mid-session
`arc sync` calls. `on-workflow` adds release on workflow-driven push events. Per-commit push
release is not offered.

**Sync-interlock.** Under `arc.syncInterlock: on-handoff` (the default), handoff invokes
`arc sync` as part of the handoff ceremony. `manual` surfaces unpushed state in the handoff
summary without firing sync. `on-workflow` adds release on workflow-driven sync triggers
(forward-compatible with upcoming worktree work units; today behaviorally equivalent to
`on-handoff`). The sync orchestrator routes worktree-push and notes-push per their own
interlock settings — see § Handoff-Interior Toggle Pattern for the cascade.

**Release-wrapper layer.** When invoked, `arc release commit` and `arc release push` provide a
CLI-boundary mechanical authorization layer over the interlock model — the wrapper validates that
configured permission overlaps the wrapper's scope, refuses with a stable exit code when not, and
writes a per-invocation audit entry. Wrapper-internal behavior runs unconditionally on invocation;
`arc.releaseOptedIn` (paired with the harness allowlist) changes harness-prompt behavior at the
calling layer, not the wrapper itself. Whether the wrapper is invoked at a given fire-site is
resolved per route class (`wrapper` vs `raw`) by the releaseRouting layer from `arc.releaseOptedIn`,
`arc.commitInterlock`, `arc.pushInterlock`, and the workflow's class-tag declaration; off-workflow
commits use raw `git` regardless of opt-in. The interlock model itself is unchanged; the wrapper
adds mechanical CLI-boundary enforcement of the same authorization rule. See
[Configurability Architecture Strategy][config-arch] § Session interlocks for the orthogonality
between interlock state (WHEN), wrapper routing (whether to engage the wrapper at a fire-site),
and wrapper-internal authorization (HOW the wrapper validates when engaged).

Static wrapper engagement is configuration-state and stays out of session-init orientation by
design — orientation surfaces actionable session-shifts, not steady configuration. Routing-shift
detection — flagging when the resolved wrapper routing has changed between sessions because
interlock keys were edited in git-config since last handoff — is the orientation-worthy
state-shift signal; the snapshot-at-handoff plus diff-at-init mechanism is specified in
`plan-handoff-optimization.md` and surfaces in orientation when that work integrates.

**Integration-interlock.** Merge to integration / main requires explicit human approval. Agents must not
infer merge approval from task approval, review completion, passing checks, or general "proceed" language.
For ARC, integration means merge-to-base; downstream production deployment is outside ARC's scope.

**Quality-gate failures hold regardless of mode.** Approval releases the work, not the gate. A failed
quality gate engages the interlock until the failure is resolved.

### Orthogonal Ceremony

Session handoff sits orthogonal to the interlock stack — always human-invoked, regardless of
interlock settings. Inside handoff, individual actions (status-file rotation, worktree push,
notes push, quality-gate finalization) follow the configurable handoff-interior toggle pattern (see
§ Handoff-Interior Toggle Pattern). Handoff is not a rung in the interlock stack; it consolidates
next-session-serving bookkeeping into a single explicit ritual.

### Configurability Architecture

The configurable interlocks use independent config axes.

**Enum values:**

- `arc.commitInterlock: manual` (default) — commit-interlock engaged by default; user explicitly
  invokes commit.
- `arc.commitInterlock: on-task-approval` — commit-interlock releases on task approval.
- `arc.commitInterlock: on-workflow` — extends `on-task-approval` with release on
  workflow-driven commit events (handoff, integration prep, planning ceremonies). See § Release
  Wrappers and Workflow-Driven Triggers above.
- `arc.pushInterlock: manual` (default) — push-interlock engaged by default; user explicitly
  invokes push.
- `arc.pushInterlock: on-sync` — push-interlock releases when an `arc sync` event fires
  (per-commit release is not offered).
- `arc.pushInterlock: on-workflow` — adds release on workflow-driven push events.
- `arc.syncInterlock: on-handoff` (default) — handoff invokes `arc sync` as part of the
  handoff ceremony.
- `arc.syncInterlock: manual` — handoff surfaces unpushed state without invoking sync;
  sync requires explicit invocation.
- `arc.syncInterlock: on-workflow` — adds release on workflow-driven sync triggers.

### Approval-Signal Architecture

Approval signals release the configurable interlocks. The signal is anchored by an agent-emitted
structured prompt — not parsed from arbitrary user prose.

**Per-interlock prompt variants:**

- `task-interlock` (`arc.commitInterlock: manual`): `Proceed to Task X.Y?`
- `task-interlock` + `commit-interlock` bundled (`on-task-approval`): `Commit and proceed to Task
  X.Y?`
- Boundary-aware variants: `Proceed to Phase N+1, Task N+1.1?` at phase boundaries; `Proceed to
  handoff?` at WU end.
- `push-interlock` mid-session: requires explicit natural-language invocation ("push this", "push to
  origin"). No structured prompt — push is intent-scoped, not boundary-anchored.

**Affirmative grammar.** First-word affirmatives (`y` / `yes` / `yeah`) release the prompted interlock.
Anything else falls to manual handling. Redirect grammar composes naturally — `y, also <X>` and
`y; <redirect>` both release the interlock and queue the redirect.

The structured prompt scopes affirmation to a specific boundary; no global parser surface is needed for
affirmative tokens in arbitrary user prose. Session-init's orientation summary uses the same shape
(`Awaiting direction — proceed to Next Action?`) — the mental model stays consistent across ARC's
session lifecycle.

### Commit-Interlock Release

Under `arc.commitInterlock: on-task-approval`, the approval signal that advances the task
also releases the commit-interlock. First-word affirmatives (`y` / `yes` / `yeah`) release the
interlock; redirect grammar is preserved (`y, also <X>` / `y; <redirect>`) and queues the
redirect after the commit path completes.

The released commit path follows [arc-commit § Step 2-6][arc-commit-skill]: assess atomicity,
load commit-format methods, stage the single logical change, verify staged diff, and commit with
the required context footer. If the Step 2 complexity criteria identify multiple concerns,
accumulated multi-session work, or ambiguous interleaving, stop at manual-with-prompt instead of
silently invoking prepare-commits. That avoids converting a task-approval signal into a broader
cascade the user did not explicitly sanction.

The `arc-commit` skill remains directly invokable under all interlock settings. It is still the
ad-hoc commit path for non-task work and the recovery path when commit-on-task-approval falls back
to manual-with-prompt.

### Contributor Commit Release Boundary

Contributor-role commit-on-task-approval stages project code and task-list documentation only.
Project-level status files stay maintainer-owned because they represent shared work-unit state
and lifecycle ceremony, not contributor-local progress. Contributor status files live under
`user/{identity}/active/`, are gitignored, and remain local session state.

The contributor handoff cadence is mode-independent: contributor status files update at handoff
regardless of `arc.commitInterlock` value (`manual`, `on-task-approval`, or `on-workflow`). This
keeps commit release focused on reviewed code changes while preserving the session-state
contract that handoff is the single update point for contributor-local active status.

### Deferred-Review × Commit-Interlock Release

Deferred review safe-accumulates by default under `arc.commitInterlock ∈ {on-task-approval,
on-workflow}`. Within a deferred range, per-task completion still updates the task list and runs
quality gates, but it does not release the commit-interlock after each task. Deferred review
exists because the user is unavailable for per-task approval; committing each task without that
approval would turn the deferral into an unreviewed commit cascade and violate the interlock
model.

Per-task commit release within a deferred range requires explicit opt-in at deferral time, using
language such as "work through 5.2-5.4 with commit on each task approval while I'm away." The
opt-in is scoped to the named deferred range only. Ambiguous phrasing falls back to safe-accumulate.

When safe-accumulated work returns for review, report the completed range as a coherent batch and
surface the accumulated diff for approval. The user then chooses the commit boundary: one batch
commit, multiple atomic commits, or iteration before committing.

### Push-Timing Reasoning

Push-on-sync fires when an `arc sync` event releases the push interlock; per-commit push release
is not offered. The constraint surfaces in operational behavior: worktree-push and notes-push pair
at the same release event, with fixed ordering (worktree first, then notes — notes attach to
commits that must already exist on origin; reverse ordering produces dangling notes references).

For deeper rationale on stakes asymmetry and concurrent-session race surface, see
[push-timing background][TODO-docs-site].

### Cascade Reversibility & Rollback

When a single approval triggers multiple operations (commit-on-task-approval; push-on-sync), the cascade
must be reversible. ARC v1 ships protocol-level support — a DEV-RULES rule (see
[DEV-RULES.ARC][dev-rules-arc] § Commit Discipline, *cascade-undo*) requiring agents to present an
undo plan and await explicit confirmation before destructive cascade reversals (resetting commits,
retracting pushes).

**Scope.** Session-local. Manual confirmation. No dedicated skill or log-file infrastructure in v1.
Agent context plus conventional-commit footers cover cascade identification — promotion to a skill
is a candidate future WU if dogfooding shows demand.

---

## Failure-Mode Recovery

Configurable interlock release creates cascades that can fail after the user has already approved
the boundary. Classify failures by the state they leave behind before choosing a recovery path:

| Mode | Category | Trigger | Recovery path |
| ---- | -------- | ------- | ------------- |
| 1 | Bad state | Pre-commit hook fails during commit-on-task-approval | Fix obvious issues; otherwise fall back to manual-with-prompt |
| 2 | Bad state | Tier 1/Tier 2 quality gate fails after an auto-released commit | Apply cascade-undo rule before destructive rollback |
| 3 | Transit | Network failure during push-on-sync | Preserve local state, surface in summary, retry when reachable |
| 4 | Transit | Partial multi-commit or multi-push cascade | Preserve landed work, surface exact partial state, retry remaining transit |
| 5 | Process | Agent/session crash mid-cascade | Run crash-recovery scan; prompt continue or rollback |

**Bad-state failures** mean ARC produced or nearly produced local history that may be wrong.
The correct response is repair when obvious, or explicit user choice before rollback/destructive
recovery. The [cascade-undo rule][dev-rules-arc] applies here.

**Transit failures** mean the local state is valid but transport did not complete. Do not roll
back correct local work just because the remote update failed. Surface the state and retry when
the remote path is available.

**Process failures** mean the agent stopped before the workflow could finish or report. Detect
what landed, compare it to the active workflow pointer, and ask whether to continue the cascade
or roll it back.

### Recovery Procedures

**Mode 1 — pre-commit hook fail during commit-on-task-approval.** Detection: `git commit` exits
non-zero while releasing the commit-interlock from process-task-loop approval. If the failure is
obvious and in-scope (formatting, lint, type error), fix and retry the same commit. If the cause
is non-obvious, staged content spans multiple concerns, or the hook failure implies a design
choice, stop and report that commit-on-task-approval fell back to manual-with-prompt. Ask whether
to investigate, revise staging, or defer the commit.

**Mode 2 — quality gate fails after an auto-released commit.** Detection: Tier 1/Tier 2 gates fail
after a commit produced by commit-on-task-approval. Do not continue to the next task. If the fix is
obvious and local, apply a follow-up fix commit under the same task context. If reverting the
auto-released commit is the proposed remedy, present a cascade-undo plan first: identify commits to
reset or revert, whether anything was pushed, and the exact recovery command shape. Await explicit
confirmation before destructive rollback.

**Mode 3 — network failure during push-on-sync.** Detection: worktree push or notes push exits
non-zero for remote/network reasons while `arc sync` is running (handoff-driven or explicit).
Keep local commits and session files intact. Surface the failure in the sync summary, including
whether the worktree push, notes push, or both failed. Retry the failed transport when
connectivity or remote permissions recover; if the remote rejected a non-fast-forward update,
switch to the handoff workflow's reconcile path.

**Mode 4 — partial multi-commit or multi-push cascade.** Detection: a cascade has multiple
transport or commit operations and only some complete. Preserve the completed operations; do not
rewrite them automatically. Inspect `git status --short`, `git log --oneline <baseline>..HEAD`,
and remote/ahead-behind state as needed to identify what landed. Report the exact partial state
and retry only the remaining transit operation unless the user chooses rollback under the
cascade-undo rule.

**Mode 5 — agent crash mid-cascade.** Detection on resume: freshness gap, dirty tree, staged
changes, or active `**Next Action:**` still pointing into a workflow boundary that may have been
interrupted. Run the crash-recovery scan:

```bash
git status --porcelain
git diff --cached --stat
git log --oneline -n 10
```

Read the active status file's `**Next Action:**` workflow-step pointer and compare it to the git
state. If the pointer, staged diff, and commit history agree on the next operation, continue from
that operation. If they disagree or the user may prefer rollback, surface the mismatch and prompt:
continue the interrupted cascade, roll back with an explicit cascade-undo plan, or stop for manual
inspection.

---

## Status-File Creation Contract

Each work unit gets exactly one status file (`active/{category}/status-{name}.md`) tracked from creation
through archival. Two convergent creation paths produce the same artifact shape; both apply idempotent
guards so re-entry is safe.

**Convergent paths:**

- **Planning activation** ([`activate-planning-branch.md`][activate-plan] Step 5) creates the file when a
  planning branch starts, with `**State:** Planning` and the plan-doc filename in `**Spec:**`.
  Idempotent: existing file → skip.
- **WU activation without planning ceremony** ([`activate-work-unit.md`][activate-wu] Step 4 creation
  path) creates the file at WU activation when no planning branch preceded (e.g., partial-protection
  direct activation), with `**State:** In Progress`. Idempotent: existing file → take the transition
  path (Planning → In Progress, populate execution fields).

**Single template, single shape.** [`template-status.md`][template-status] is the canonical source for
both paths — no planning-variant template. The `**State:**` field carries the lifecycle phase.

**Always-present fields with `[none]` markers.** All fields in the template's `## Work Unit Metadata` section
are always present; empty optional fields use the `[none]` literal. Consumers (the probe, session-init,
handoff workflow) get a uniform parse surface — no field-omission ambiguity, no per-state shape
branching.

**Filename-pointer convention.** Artifact-pointer fields (`**Task List:**`, `**Spec:**`) carry bare
filenames. Path resolution derives from `dirname(status-file)` — co-location of status, task list, and
PRD is invariant across the WU lifecycle. The probe's `deriveCompanions` consumes this directly.

**State enum.** `Planning` (planning session) and `In Progress` (executing tasks) are the documented
values; sibling work units may introduce others (e.g., `Paused`). The probe's session-type inference
treats `Planning` as case-exact (drives `sessionType: "planning"`); other values fall through to Task
List / Next Action signals — preserving behavior for parenthetical-suffix variants like `Paused
(2026-04-12)`.

**Status-field migration.** When lifecycle fields become stricter, update existing active status files directly
as part of the work unit that introduces the rule. Keep structural validation strict for new commits instead of
allowing legacy absence, and avoid one-off migration helpers until repeated project demand justifies the
maintenance surface.

**Disposition at integration.** [`integrate-planning-branch.md`][integrate-plan] Step 2 routes by
graduated / shelved: graduated leaves the file in place for `activate-work-unit` Step 4 to transition;
shelved removes the file (no WU follows; no pointer needed).

---

## Status-File Timing

Status-file updates fire only at session-handoff commits and workflow-ceremony commits (activate /
integrate / sweep / deactivate / PRD generation / planning-lifecycle ops). Task-completion code
commits never touch the status file. See [DEV-RULES.ARC][dev-rules-arc] § Commit Discipline for the
rule statement.

**Why bound to ceremony commits.** Status-file fields (Next Task, Last Completed, Next Action) are
state pointers consumed at session-init. Per-task updates produce intermediate snapshots that no
consumer reads; aligning state-change with the consumer boundary eliminates per-commit metadata churn
and removes the per-commit shape-vs-rotation judgment call.

**Tradeoff: dedicated handoff status commit.** Handoff produces a `chore(status): handoff …` commit
that's not bundled with code — a clear session-boundary marker, naturally atomic, conventional-commit-
friendly, and visible in PR history as the explicit handoff point. Workflow-ceremony commits
(activate, integrate, etc.) bundle their status updates into the ceremony commit itself.

**Contrast: task-list checkboxes ride with content commits.** Task-list `[x]` flips bundle with the
code commit that completes the task — the opposite rule from the status file (see
[DEV-RULES.ARC][dev-rules-arc] § Atomicity, [prepare-commits.md][prepare-commits] § Granularity).
The distinction is volatility versus derived state. Status-file fields are pointers whose value at
time T is stale by T+10min — deferring updates to ceremony boundaries discards no information
because the next consumer (session-init) reads only the latest pointer. Task-list `[x]` flips are
*terminal derived state*: a completion event that won't reverse, and one a future reader needs at
the boundary that produced it. Bundling them with the change that produced them keeps cross-session
recovery cheap (interrupted sessions leave the git record matching reality) and preserves the
"what task did this commit complete" linkage in `git log` view.

For deeper context on commit-history readability, commit-on-task-approval benefits, and what alternatives
to task-list bundling would cost, see [status-file timing background][TODO-docs-site] and
[task-list timing background][TODO-docs-site].

---

## User Workspace Directory

`user/{identity}/` carries per-developer session-state content. Its layout encodes semantic class
through path structure: WU-scoped content lives in a per-WU subdir; developer-scoped (cross-WU)
content lives flat at the root.

**Layout:**

```text
user/{identity}/
├── <wu-name>/                 # Per-WU subdir — WU-scoped
│   ├── SESSION-NOTES.md       # Per-WU session context
│   └── meta-<wu-name>.md      # Contributor-role meta file (when applicable)
├── USER-INBOX.md              # Cross-WU personal capture
├── WORKING-MEMORY.md          # Cross-WU persistent context
└── .internal/                 # Per-machine state (excluded from notes serialization)
```

**Path-class invariant.** Path determines sync class. Per-WU subdir contents are bounded to the
WU's lifecycle and travel with that WU's branch; cross-WU root files carry developer-scoped
context that persists across work units. The `.internal/` dotdir is per-machine and never
serialized — see § Session State Portability.

Each worktree's `user/{identity}/` filesystem holds exactly one WU subdir (its own WU's), making
worktree-correctness inspectable at a glance: `ls user/{identity}/` shows which WU this worktree
serves. Multi-worktree concurrent use produces non-colliding subdirs because worktrees are
physically separate.

---

## SESSION-NOTES

SESSION-NOTES.md is personal session context, gitignored, paired with the active WU's project
pointer — the maintainer-role `status-{name}.md` in `active/{category}/` or the contributor-role
`meta-{name}.md` in the per-WU workspace subdir. The project pointer carries the factual state
(branch, task, blockers, next action); SESSION-NOTES carries the working context the next session
needs to pick up where the last left off — approach, decisions, things tried, risks. Together
they cover the WHAT (tracked) and the HOW-it's-going (personal) of in-flight work.

**Location.** `user/{identity}/<wu-name>/SESSION-NOTES.md` — per-WU subdir under the developer's
workspace. The subdir is created at WU activation and removed when the WU integrates.

**Lifecycle.** Created at session handoff (the handoff workflow writes the file), consumed at
session-init (the init workflow reads it as T2 state). The per-WU subdir scopes the file to its
work unit — when the WU integrates, the subdir is removed along with its contents.

**Portability.** Local by default. Cross-machine and team handoff travel through git notes — see
§ Session State Portability for the operational model, config keys, and load-error recovery.

**Writing guide.** The [session-handoff workflow][session-handoff] carries detailed content
guidance for what to include vs. omit.

---

## Working Memory

WORKING-MEMORY.md carries the developer's cross-WU persistent context — constraints,
things-to-watch, pragmatic tradeoffs pending downstream work. Where SESSION-NOTES is a per-WU
snapshot (write at handoff, consume at next session-init for the same WU, discard at integration)
and USER-INBOX is a capture surface (live additions draining at ceremony boundaries),
WORKING-MEMORY persists across work units with explicit eviction triggers per entry.

**Location.** `user/{identity}/WORKING-MEMORY.md` — flat at the workspace root, cross-WU scope.

**Per-entry shape.** Each entry carries an explicit removal trigger inline:

```markdown
**Short header naming the constraint or tradeoff:**
*Remove when: [explicit trigger condition].*

Body — context, scope, what to watch for or work around.
```

Triggers are concrete observable events (a downstream WU integrates, a tool lands, a known
workaround becomes obsolete). Vague triggers (`once we figure out X`) defeat the
eviction-on-trigger discipline and let entries accumulate indefinitely.

**Lifecycle.** Written at session handoff alongside SESSION-NOTES; read at session-init as part
of T2 state load. Reviewed at each handoff — entries whose triggers have fired are removed.
Surviving entries travel with the developer's workspace across WU boundaries.

**Distinguishing the three personal surfaces:**

- **SESSION-NOTES** — per-WU snapshot. Bounded to one WU's working state.
- **USER-INBOX** — capture surface. Live writes; drains at ceremony boundaries.
- **WORKING-MEMORY** — cross-WU persistent context. Eviction-triggered.

The eviction-trigger convention is what makes WORKING-MEMORY work as persistent context without
accumulating into noise — the trigger is the commitment that keeps the file actionable.

---

## Handoff-Interior Toggle Pattern

Inside the orthogonal handoff ceremony, individual actions are configurable. The pattern: each
handoff-interior action gets a config key under its primary domain, with a standard value enum
that names its trigger event.

**Config-key convention.** Toggles live as flat keys under their primary domain — `user.notes_push`
(notes push), future `worktree.<action>`, future `handoff.<action>`. Not a nested `handoff.actions`
map. The flat-key constraint accommodates existing `arc-config.yml` parsing (githooks, line-based
shell matching require flat keys with dotted grouping); the convention also keeps each toggle
discoverable from its primary domain rather than centralized in a handoff section.

**Standard value enum.** `manual | on-X` where `X` names the operation's trigger event:

- `manual` — surface in summary; do not fire automatically. User explicitly invokes.
- `on-X` — fire automatically when the named event occurs. Each toggle's `on-X` value names its
  own trigger (e.g., `on-handoff`, `on-sync`, `on-task-approval`), so the cascade graph reads off
  config alone.

`prompt` is an opt-in third value for toggles that want review-before-fire — useful when the
operation has team-coordination consequences (e.g., team-mode `user.notes_push: prompt` asks
before pushing notes that other developers will see). Not part of the standard `manual | on-X`
shape; toggles declare `prompt` support explicitly.

**Three-layer cascade.** Handoff-interior operations chain through interlocks. Each link names
its trigger:

1. **handoff event → sync.** `arc.syncInterlock: on-handoff` releases the sync interlock
   when handoff fires. `arc sync` is the orchestrator that routes worktree-push and notes-push.
2. **sync event → push.** `arc.pushInterlock: on-sync` releases the push interlock when a
   sync event fires.
3. **sync event → notes-push.** `user.notes_push: on-sync` releases notes-push when a sync event
   fires.

Each link reads top-down: handoff may invoke sync, which may invoke push and notes-push — but
only when each interlock is configured to release on the upstream event. A `manual` setting at
any layer halts the cascade at that point; the action surfaces in the summary instead of firing.

**Authorize-by-invocation.** `arc sync` running mid-session is an explicit sync event — the user's
direct invocation authorizes the downstream cascade (push and notes-push under their `on-sync`
configurations). The trigger doesn't have to come from handoff; any sync invocation counts as a
sync event for the layers below.

**Per-developer configuration.** Session interlocks and the release-wrapper opt-in are
canonical per-developer git-config keys with no project-level counterpart —
`arc.commitInterlock`, `arc.pushInterlock`, `arc.syncInterlock`, `arc.releaseOptedIn`. The
handoff-interior `user.notes_push` toggle is dual-scope: project-level default in
`arc-config.yml`, per-developer override via `arc.notesPush`. New handoff-interior toggles
following this pattern document the override in the toggle's primary-domain section. See
[Configurability Architecture Strategy][config-arch] § Personal Configuration via Git Config
for the full key reference and defaults.

**Composite handoff probe.** `arc status --session-handoff --json` returns the handoff envelope —
dirty state, worktree state, notes-sync state, sync-interlock mode, pushability pre-check matrix,
resolved active status file, and current HEAD short-hash. The handoff workflow consumes the
envelope and gates on `syncInterlock`; the sync orchestrator owns push-interlock and notes-push
resolution internally. See § Probe pattern § Extension contract for how new toggles add slots.

**Push-ordering invariant.** When both worktree-push and notes-push fire under a sync event,
worktree-push MUST land before notes-push (see § Push-Timing Reasoning for the constraint). Not
a config; not optional. Enforced by the sync orchestrator's per-leg ordering.

**Canonical instance.** `user.notes_push: manual | on-sync` (with `prompt` as opt-in for team
mode) — see § Session State Portability for operational details. New toggles follow the
`manual | on-X` shape.

---

## Context Monitoring

Context monitoring is a shared responsibility between user and agent.

**The user is the primary monitor.** Users have persistent visibility into context usage through
platform-provided indicators — status bars, on-demand commands, threshold warnings. The user
decides when to trigger handoff based on context state, work progress, and judgment about session
quality. This is an active responsibility: check periodically, don't wait for emergencies.

**The agent is the secondary safety net.** Harness-level files (e.g., `CLAUDE.md`, `AGENTS.md`)
may define threshold-based check-in behavior — "at ~150k tokens, stop and ask." This catches
cases where the user isn't monitoring, but it's imprecise: agents assess their own token usage
approximately, and the check-in interrupts workflow. It's a fallback, not the designed mechanism.

**Monitoring thresholds:**

- General development: monitor from ~70% utilization, plan handoff by ~75-80%
- Complex reasoning: consider earlier handoffs at ~60-70%
- Light tasks: can tolerate up to ~85%
- Large windows (500K+): same proportional thresholds apply

---

## Auto-Compaction

ARC recommends disabling auto-compaction where platforms support it. This makes the user's
monitoring role explicit: the platform warns when context is filling, and the user responds
by triggering handoff.

**When you can't disable it:** Compensate with more frequent commits (reducing uncommitted work
at risk) and earlier handoffs (capturing state before compaction does). Understand your
platform's compaction behavior — when it triggers, what it preserves, how it signals — so you
can factor it into your workflow.

---

## Session State Portability

ARC's session state files — SESSION-NOTES.md and other personal workspace content in
`user/{identity}/` — are gitignored by design. This keeps personal context out of git history
but creates a portability challenge: session context doesn't travel with the branch when you
switch machines or hand off to a teammate.

### The git notes mechanism

ARC uses [git notes][git-notes] to serialize and transport personal workspace content without
polluting git history. A single notes ref — `refs/notes/arc/user/{identity}` — stores the user
directory contents as a note attached to HEAD at handoff time.

**How it works:**

- **Save** (`arc user save`): Serialize `user/{identity}/` contents to a git note on HEAD
- **Load** (`arc user load`): Restore user directory from git note (on HEAD, walking reachable
  ancestors if needed; `--max-walk <n>` bounds the search)
- **Fetch/push** (`arc user fetch` / `arc user push`): Transport notes refs to/from remote
- **Pull** (`arc user pull`): Fetch remote notes, then load them into the user directory
- **Sync** (`arc sync`): Direction-aware porcelain — save + push when local state is ahead,
  fetch + pull when remote state is ahead

Session workflows integrate these automatically: session handoff triggers save + push; session
init triggers `arc user pull` when remote notes are ahead and `arc user load` when local files
are missing or stale. Overwrite prompts default to confirm and accept `--yes` on `arc sync`,
`arc user pull`, and `arc user load`; `arc user fetch` is transport-only and non-destructive.

**Push policy** (`user.notes_push` in `arc-config.yml`):

- `on-sync` — solo default. Notes push fires when an `arc sync` event releases the toggle
  (handoff-driven sync via `arc.syncInterlock: on-handoff`, or explicit `arc sync`
  invocation).
- `prompt` — team default. Conscious choice each sync event.
- `manual` — full control. Push only when explicitly requested.

Per-developer override via `git config arc.notesPush`. `user.notes_push` is the canonical instance
of the [handoff-interior toggle pattern](#handoff-interior-toggle-pattern).

### Scope

Files at the top of `user/{identity}/` — session notes, inbox items (arc-in-git), personal
scratch notes — travel through one mechanism. New file types added to that surface are
automatically included without additional plumbing.

`user/{identity}/.internal/` is per-machine and excluded from notes serialization (the
serializer's dotfile rule covers it). It carries state that should not synchronize across
machines: the release-wrapper marker file recording installed harnesses and modes per
machine, the per-invocation audit log, sync-state tracking, and pre-load backups. Each
machine runs `arc release setup install` independently — harness allowlist install is
itself per-machine, so the marker recording it must also be per-machine. See
[Interlock Release Wrappers Strategy][interlock-release-wrappers] for the setup workflow.

### SESSION-NOTES Load Error Recovery

When `arc user load` or session-init's SESSION-NOTES load fails, recover by error class:

- **No note found** (null result): Normal on first session, re-clone without notes, or when the
  noted commit is beyond the shallow clone boundary. Proceed with tracked state.
- **Corrupt note** (JSON parse error): Run `arc user save` to overwrite, or inspect
  `git notes --ref arc/user/{identity} list` for a different ancestor.
- **Pull failure** (remote ref not found): Identity may not have pushed, or the name may be wrong.
  Verify via `git ls-remote origin 'refs/notes/arc/user/*'`.
- **Stale file warnings**: Load reports local files absent from the saved manifest. Preserved in
  `.pre-load-backup.json` — review and either re-create or discard.

---

[session-loop]: ../../../system/workflows/arc/session-lifecycle/session-loop.md
[session-init]: ../../../system/workflows/arc/session-lifecycle/session-init.md
[session-handoff]: ../../../system/workflows/arc/session-lifecycle/session-handoff.md
[activate-plan]: ../../../system/workflows/arc/work-unit-lifecycle/planning/activate-planning-branch.md
[activate-wu]: ../../../system/workflows/arc/work-unit-lifecycle/activate-work-unit.md
[integrate-plan]: ../../../system/workflows/arc/work-unit-lifecycle/planning/integrate-planning-branch.md
[template-status]: ../../templates/template-status.md
[strategy-index]: ../STRATEGY-INDEX.md
[workflow-authoring]: strategy-workflow-authoring.md
[config-arch]: strategy-configurability-architecture.md
[interlock-release-wrappers]: strategy-interlock-release-wrappers.md
[dev-rules-arc]: ../../constitution/DEV-RULES.ARC.md
[dev-rules-project]: ../../constitution/DEV-RULES.PROJECT.md
[prepare-commits]: ../../../system/workflows/arc/supplemental/prepare-commits.md
[arc-commit-skill]: ../../../system/skills/arc-commit/SKILL.md
[git-notes]: https://git-scm.com/docs/git-notes
[TODO-docs-site]: # "Placeholder pending docs-content-sweep — see notes-docs-content-sweep.md"
