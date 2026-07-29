# Development Rules (ARC)

Behavioral rules for human-AI collaboration under the ARC methodology. These rules apply to every
ARC project regardless of technology stack.

Your project-specific standards — quality gate commands, testing requirements, architecture rules,
documentation style — live in [DEV-RULES.PROJECT][dev-rules-project]. Contributors
(`arc.role = contributor`) work within different boundaries throughout — see
[AGENT-BRIEF.CONTRIBUTOR][contributor-briefing].

> Rules marked `[configurable]` follow the project's configured override; see [Configurability
> Architecture Strategy][config-arch] for the override model. Rules marked `[invariant]` are not the
> agent's to set aside; § Rule Authority carries that reading and classifies every unmarked rule.

---

## Rule Authority

Every rule ARC states — here, in a method, in a workflow, in an extension, in a strategy — is a **default**
unless marked **invariant**.

**`[configurable]` is a different axis.** It says the _project_ may set a rule's shape; this reading says
whether the _agent_ may set it aside in the moment. Configurability is never itself a discharge.

**Reading an unmarked rule.** Ask whether you can name a fact that, if true, means the rule's concern does
not arise here.

- You can name one, and it is yours to establish or already supplied — the doubt is **dischargeable** →
  **default**. Discharge it as below.
- The fact is not yours to establish — it lives with someone else and has not been said → **invariant**.
  Ask for it; do not infer it.
- You can name nothing, or no fact you could produce would settle it → **invariant**.

**Backstop.** Regardless of the above, a rule is invariant when it protects the integrity of a check, or when
it withholds an _authorization_ rather than a _judgment_ — a decision reserved to a person because it commits
them.

**Both limbs reach acts, not only rules.** A record attesting your own work, or a decision that commits someone
else, is caught whether or not a rule addresses it. Absence of a rule is not a grant.

A rule **protects the integrity of a check** when the agent's own work is what the check examines — quality
gates, verification, review, and the commit and merge gates that admit work (illustrative, not exhaustive). An
agent is never the judge of whether a check applies to its own work; reading what a check reported, including
that it produced no result, is not that judgment.

The same limb settles **self-attestation**. Writing that a gate was met, that a human approved, or that a pass
was rigorous attests the agent's own output and discharges nothing. The claim needs a witness the agent does
not write — a check that ran, an artifact on disk, a person who spoke. Absent one, do not record it as
satisfied; say what is actually known.

**An invariant is not the agent's to discharge.** What it withholds is the authority to decide, never the
capability to act. Its holder may still make the reserved decision, and their making it is the rule working
rather than a waiver — an operator authorizing a merge _is_ the merge gate. What no amount of reaffirmation
does is move that decision to the agent.

**Discharging a default.** Name the rule and the fact that discharges it, surface it where the developer is
already reading — the gate or the completion report, never a log — leave it reversible in one turn, and
proceed. Raise it once per instance: a reaffirmation is a decision, not an invitation to re-raise.

**Whose call.** Authority resolves from the actor's role and the surface the rule governs; no rule declares its
own authority. The owner of the governed surface may discharge a default over it; a rule governing a surface
with no single owner, or governing the project's own standards, resolves to the maintainer. Where the resolved
holder is not you, propose rather than discharge.

---

## Review-Increment Invariant

Every review increment closes with a structured approval gate that precedes any commit
invocation, wrapped or raw. The release wrapper bypasses the harness's per-invocation prompt;
it does **not** bypass the user's approval gate.

The sole bounded exception assembles a provisional integration candidate after the WU's routed review obligation
is authoritatively settled. Four operations may commit and push before their structured review at the final
integration interlock:

- candidate-tail cleanup
- archive composition and closeout
- lifecycle sweep and readiness regeneration
- a typed safe base reconcile

An implementation or finding-driven fix still requires its structured approval gate before commit, and no
provisional candidate may merge without exact-head integration authorization. A pre-composition direction may
authorize autonomous advance to that final interlock, but never prospective merge authority over a head that does
not yet exist.

---

## Scaled Process, Invariant Discipline

A work unit's weight (its `Class`) scales the process around it — how much design is authored in planning, and
how much review and integration ceremony it warrants. What never scales is execution discipline: the
[review-increment invariant](#review-increment-invariant), the interlocks that gate review and merge, and the
quality gates hold identically across the whole range, from a single-concern Errand to a novel work unit.

`Class` records work-unit-scoped weight (`Light` / `Heavy` / `Novel`), distinct from **Work Character** —
whether a concern is atomic or Errand-shaped below the WU wrapper, not a fourth `Class` value.

Resolve a work unit's `Class` with the `classify-work-unit` method; the model and worked examples live in the
[Work Organization Strategy][work-org].

---

## Commit Discipline

### Commit control

**Concept.** Interlocks gate (stop, await direction). Fire sites release (execute the gated
operation). Each fire pairs with a specific interlock — `taskCommit` releases commit-interlock at
task-interlock approval; `workflowCommit` releases commit-interlock at workflow-interlock approval;
`workflowPush` releases push-interlock at workflow-interlock approval. Class tags name the fire-site
type; routing (wrapper or raw) follows § Workflow class-tag routing.

- **Commit and push triggering** · `[configurable]`: follow `arc.commitInterlock` and `arc.pushInterlock`,
  both defaulting to `manual` — explicit approval before each commit, explicit invocation for each push.
  Per-mode behavior lives in [process-task-loop][process-task-loop] and [session-handoff][session-handoff].

- **Implied-approval scope** · Approval released at a structured approval gate — surfaced changes +
  `<Prefix> <Target>?` prompt (see [process-task-loop][process-task-loop] § Completion protocol) — covers
  both work AND commit, one turn. Informal mid-discussion approval ("ok", "looks good" to a
  non-structured surface) is NOT — commit waits for a structured gate. Off-workflow / incidental
  commits use the same shape: surface what landed, end with `Commit and proceed to <next-target>?`
  (releasing interlocks) or `Proceed?` (manual). Routing follows existing rules.
    - **Prefix mapping** (read from session-init envelope `config.settings.commit.interlock`):
      `Proceed` when `manual`; `Commit and proceed` when `on-task-approval` or `on-workflow`.
      `pushInterlock` selects the analogous push prefix when a push fire is in scope.

- **Release-wrapper invocation** · `[configurable]`:
    - `arc release commit` / `arc release push` are an authorized invocation path. The wrapper validates
      interlock state and writes a per-invocation audit entry regardless of opt-in.
    - With `arc.releaseOptedIn: true` plus the corresponding harness allowlist entries, the wrapper
      additionally bypasses the per-invocation harness prompt — the canonical shape for commit/push under
      workflow guidance when active. Default: `arc.releaseOptedIn: false`.
    - Wrappers fire at codified trigger points only — `taskCommit` at task approval under release-mode
      interlocks, `workflowCommit` / `workflowPush` at workflow ceremony fire-sites. Off-workflow commits
      (manual fixups, exploratory edits, anything not emitted by a workflow) use raw `git` even when
      opt-in is on.

- **Workflow class-tag routing** · `[configurable]`:
    - Workflow fire sites may carry a backtick-wrapped class tag (`` `taskCommit` ``,
      `` `workflowCommit` ``, `` `workflowPush` ``). At fire time, look up
      `releaseRouting.value.<class>` from the session-init envelope: `wrapper` invokes
      `arc release commit` / `arc release push` (workflow supplies the message body in a `text`
      codeblock or push args inline); `raw` (default; also on probe failure, missing tag, or
      unrecognized class) invokes raw `git`.
    - Class authorization (when `wrapper` resolves): `taskCommit` requires `arc.releaseOptedIn` AND
      `arc.commitInterlock ∈ {on-task-approval, on-workflow}`; `workflowCommit` requires
      `arc.releaseOptedIn` AND `arc.commitInterlock: on-workflow`; `workflowPush` requires
      `arc.releaseOptedIn` AND `arc.pushInterlock: on-workflow`.
    - Destructive flags (`--delete`, `--force`, `--force-with-lease`) stay literal — never
      class-tagged; the wrapper refuses them by design.
    - `arc sync` handles its own internal push (single-leg sync push); sync invocations are
      captured on the audit umbrella but do not re-route through `arc release push`.

- **Never use `--no-verify`** · `[invariant]` to bypass commit hooks — hooks exist to catch errors.

- **Amend scope:** Use `git commit --amend` only for same-concern fixups to the most recent
  unpushed commit (typo, lint, missing file from the same logical change); otherwise create a
  new commit. **Never amend pushed commits without explicit user request** · `[invariant]`.

- **Rebase scope:** Never rebase or otherwise rewrite a _pushed_ branch to absorb base changes —
  rewriting published commits orphans the SHA-keyed git notes and forces a force-push. Merge the base
  in instead (append-only — see the [concurrent-work strategy][concurrent-work] § Append-only until
  integration). Rewriting _unpushed_ commits is fine.

- **Check before reverting files:** Before `git checkout -- <file>`, review `git diff <file>` —
  other tasks may have uncommitted work in the same file.

- **Cascade-undo:** Before destructive cascade operations (resetting commits, retracting pushes),
  present an undo plan (commits to reset, push-retraction status if applicable) and await explicit
  user confirmation.

- **Task list accuracy:** Before committing, verify task documentation reflects completed work
  (parent task marked `[x]` if all subtasks complete). Stage task list updates with the commit.

- **Meta-file timing:** The meta file is written **only where a workflow ceremony explicitly
  instructs the write** — at handoff and at the lifecycle and planning-stage ceremonies that emit a
  meta update. A commit's authority to touch the meta comes from the ceremony workflow it runs, not
  from an enumerated list; task-completion code commits never touch the meta file, and nothing writes
  it mid-stage.

- **Meta-file commit shape:** Meta-file edits ride with concurrent ceremony content (file
  moves, spec save, archival) — bundle into the ceremony commit. When the
  meta-file edit is the entire staged change, it lands as a dedicated `chore(arc):` commit. The
  staging area is the test: anything else staged → bundled; meta-file edit alone → dedicated.
  Never bundled with code commits (already enforced by meta-file timing above).

### Merge authority

**Merge to integration / main requires explicit approval** · `[invariant]` (the integration-interlock).
Agents must not infer merge approval from task approval, review completion, passing checks, or general
"proceed" language. Integration may happen only when the user explicitly authorizes it.

### Commit format · `[configurable]`

Commits must follow the project's configured format. See the [commit-format][arc-methods-cf] and
[commit-footer][arc-methods-ccf] methods for specifications.

Before composing any commit message, load both methods. Do not reconstruct the format from recent
`git log` entries — history shows surface examples, not the configured rules or hook-enforced footer
requirements.

### Atomicity

One logical change per commit. When multiple tasks are completed between commits, separate code
changes by task; commit shared documentation (task list updates) last.

---

## Task Execution

### Task interlock · `[invariant]`

Each checkbox in the task list is one _review increment_ — a bounded unit of autonomous execution
between human review points. The [Review-Increment Invariant](#review-increment-invariant) applies at
this default boundary: the increment closes with a structured approval gate before the agent advances or
commits, and that gate is the task-interlock — stop after reporting completion, surface verification
status, and await explicit user approval. Deferred review is a bounded convenience gated by user
approval, not an autonomy mode.

One leaf is the _default_ increment boundary, not the only legal one: when a parent's subtasks are
tightly coupled — landing as one atomic commit, or individually incoherent mid-sequence — the agent may
**propose** reviewing the parent as one increment (agent proposes, user approves; one gate, never
self-invoked). That is correct _scoping_ of the invariant, not an exception — the default stays per-leaf
and is never silently widened. Signals and procedure: [process-task-loop][process-task-loop] § Deferred
review.

A work unit's review increments all run under its single owner — cross-person parallelism is multiple work
units, not multiple developers within one. See [Team Coordination Strategy][team-coordination] for
cross-person coordination conventions.

**For the full task execution protocol** (completion steps, quality gate checkpoints, mandatory
stop, implied permission, deferred review), load the [process-task-loop workflow][process-task-loop].

### Design before implementation (spec-directed work)

ARC is spec-directed: design decisions are settled upfront in the spec (`spec-*.md`), not during
implementation. The task list (`tasks-*.md`) decomposes that design into actionable steps; the code realizes
it. The meta file's `**Design:**` field carries the pointer, making the spec the recurring, self-describing
upstream of the work.

Settle **all settle-able design up front** — best reasonable effort, never a conscious deferral — and route any
genuinely-emergent design question back to the spec rather than accumulating design debt in code or notes. This
holds identically at every `Class`: a lighter `Class` means the design was _more determinate coming in_, not
that more design may be left open. A lighter process is never license to defer design — the
implementation-detail latitude ARC already grants is unchanged.

### Sub-agent scope

**Delegation follows function, not task-list membership.** Two properties hold regardless of what
delegates: the human's formative involvement in changes, and judgment staying with the primary agent.

- **Derivation** — read-only work (search, research, review, finding-generation): freely delegable.
  Outputs are advisory until the primary verifies them against source.
- **Execution** — work that lands in the increment: stays with the primary while per-increment
  co-development is in force; delegable only under an explicit, user-approved relaxation — never
  inferred, never self-invoked.
- **Judgment** — validation against ground truth, break-out detection, gates, commits: never
  delegates, under any mode.

**Harness-conditional clause** (stated once here; callsites reference it, never restate it): use a
fresh subagent when the harness supports one — fresh context, at the primary's own capability by
default. When subagents are unavailable, skip with a note (delegated review is advisory) or run a
manual fresh-session pass; never a primary-context self-pass presented as independent.

### Review finding mutation guard

Verify every review finding against source with your own judgment; reviewer or delegated output remains advisory.
Present the complete proposed disposition set and obtain approval before applying any finding-driven fix. This
constraint applies regardless of who reviewed the change or where the findings arrived.

### Task granularity

Break down a task into subtasks if it requires:

- Multiple interdependent changes
- Complex debugging or investigation

### Quality gate failure

If quality gates fail after task completion:

- **The gate never ran** — a wrong invocation is not a gate failure. Correct it and re-run; there is nothing to
  report and nothing to decide.
- **Deterministic same-concern** — locally owned, mechanical, inside the approved change (e.g. trailing blank,
  auto-fixable lint): fix and re-run immediately; report the correction.
- **Otherwise** — report details and suspected causes; ask fix-now vs defer. Do not proceed until resolved or
  approved.

**A red gate never becomes a green report, and is never bypassed** · `[invariant]`. Reading what a gate
reported — including that it produced no result — is not that judgment.

### Test-first assessment · `[configurable]`

Before implementing any task, assess whether tests come first; the [test-first method][arc-methods-tf] decides.

---

## Discovered Work Routing

When you encounter an issue — in a file you're editing, during analysis, anywhere in the course of work —
take responsibility for it. Never silently drop an observation that should be fixed or captured.

**The core invariant.** A work unit's stub/draft is the single authoritative source for its domain concerns;
capture surfaces (`USER-INBOX`, the shared `ATOMIC-INBOX`) are transient buffers, never authoritative. **No
item with a known home may rest in a capture surface.**

### Leave it cleaner

The behavioral floor for everything below — what to do with a concern the moment it surfaces.

**Fixing it inline** (a file you're already changing, manageable scope) · `[configurable]`: assess severity
via the [issue-triage method][arc-methods-it] and fold the fix into the work in hand — but only for a
_same-concern_ cleanup (see [Anti-rider](#anti-rider)), not merely because the file is open.

**Propose placement before acting** — the agent suggests, the user decides. A deterministic same-concern
cleanup inside the change already under review discharges that: fix it and name the correction in the
completion report, rather than spending a turn to ask.

### Route by urgency × isolation

**Otherwise, route by urgency × isolation** — a coarse _inline / errand-now / inbox-defer_ call. The finer
destination (existing stub, new stub, standalone errand, flush to shared) resolves later, at drain.

| The concern is…       | Can I write its home here? | Route                                                  |
| --------------------- | -------------------------- | ------------------------------------------------------ |
| The current WU's own  | Yes — you're on its branch | Fix **inline**. Never capture.                         |
| Out-of-WU, **urgent** | No — isolation needed now  | **Errand now** — own session (`arc-session --errand`). |
| Out-of-WU, not urgent | No — defer the write       | **Capture** to `USER-INBOX` (via `arc-inbox`).         |

In-WU multi-step discovery folds into the active task list (an existing task, a new subtask, or a new task; a
whole new phase may mean it isn't this WU's — ask). Errand-vs-Work-Unit classification follows
[strategy-work-organization][work-org] § Errand Work Class.

**Express lanes, never forced.** When you already hold the commitment, you may skip the inbox and act
directly — run an errand (a self-evident concern, atomic, possibly extended) or scaffold a `backlog/` stub
(spec-worthy future work) — but never must: capture-plus-drain reaches the same place. Lack of time is never a
reason to lose a thought.

**Where captures drain.** `USER-INBOX` drains at the between-WUs `arc-housekeep` flow; the inline, holding,
and anti-rider rules hold under every PM mode.

### Holding ≠ execution

Capture _holds_; it never _executes_. Capture is inbox-only — a deferred concern lands in `USER-INBOX` (via
`arc-inbox`), never as a queued or seeded errand. **An errand _is_ its execution:** out-of-WU work runs through
the `run-errand` lifecycle on its own isolated branch — entered warm with `arc-errand` or cold with
`arc-session --errand` — never hand-rolled on your current WU branch. The isolation rule is universal — get off
the WU branch — while its _shape_ follows protection mode.

### Anti-rider

Whether a fix may ride the current change is decided by **concern-identity, not file-identity**. A
_same-concern_ micro-cleanup in a file you're already editing is always fine inline; a _distinct_ concern that
merely shares the file does not ride the current PR — errand or capture it instead. Same test for PR packaging:
distinct concerns never share a PR even on a shared file — sequence them (rebase B on A), don't merge.

### Planning artifacts aren't capture surfaces

A WU's planning artifacts — draft, spec, notes, meta, a `Coordination §` — may _cross-reference_ another WU's
concern but must never hold it as their **record-of-record** (completion and session notes record what was
done; they aren't actionable-work queues). The dual of the core invariant: no foreign work-item rests in a
planning artifact.

---

## Session Management

### Session state control

Session state uses two files with different update triggers:

- **`meta-{name}.md`** (tracked, `active/`) — the active WU's project pointer.
  Updated only at handoff commits and workflow-ceremony commits; task-completion code commits never
  touch it. Mid-session updates are churn. See § Commit Discipline for the timing rule.

- **SESSION-NOTES.md** (gitignored, `user/{identity}/`) — written only at session handoff.
  Personal working context for the next session. Per-developer directory (`user/{identity}/`);
  see [Session Operations Strategy][session-ops] § Portability for cross-machine portability
  via git notes.

The agent reports progress throughout the session; session state files capture the summary at handoff
and ceremony boundaries.

### Handoff

**Session handoff is human-invoked.** Agents do not initiate handoff — the user signals when to
hand off (typically via `arc-handoff` skill invocation); the agent then executes the handoff workflow.

### Context quality

**Never** degrade work quality or change approach due to context pressure — work at full
specification throughout the session regardless of context window size or utilization.

**Prefer handoff at natural boundaries.** This is a judgment call for scope, review, and
a clean episodic baseline, not a correctness requirement for every context-pressure event.
At a boundary, handoff captures state; the clean baseline comes from the fresh load after
`clear`. See [Session Operations Strategy][session-ops] for duration guidance.

**Between natural boundaries, compact and recover.** Context pressure alone does not force
early handoff; use harness recovery or `arc-recover` when available, otherwise hand off
and re-init. "Clean baseline" means a clean episodic baseline, not a lighter procedural load.

**Natural session boundaries:**

- **Mode transitions** — design to implementation, investigation to fix, planning to
  execution. Analysis context carried forward crowds the window without serving the new work.

- **Structural boundaries** — phase or work unit completion, clean commit points. A fresh
  session starts with focused context even when the current session has headroom. At these
  points, note the handoff opportunity if significant context has accumulated.

- **Quality signals** — output becoming less precise, early-session guidance being missed,
  re-deriving decisions already established in this session

When a boundary is reached or the user initiates handoff:

1. Complete the current work item — don't stop mid-edit
2. **Stop and ask** — summarize completed and remaining work
3. User decides: continue, commit completed work, or begin handoff

**End-of-session:** Commit complete work, leave partial work uncommitted, perform session
handoff.

---

## Verification and Discovery

### Verify before assuming

**When uncertain about implementation details, file locations, or existing content:** stop and ask.

**Never generate or assume:**

- File paths or directory structure
- What code "probably does" — read the actual implementation
- Task phase content or summaries — read the task list
- Implementation approaches without understanding requirements
- A work unit's existence, location, or lifecycle state — resolve it by slug with `arc status <slug>`, never infer
  from directory listings, branch names, or state-blind `Depends On` edges

**Clarifying questions improve outcomes.** When you mostly understand a request but see
ambiguities, edge cases, or design alternatives that need decisions — ask.

### Recommend on advisory forks

When surfacing an advisory accept/decline (or either-or) fork — not a mandatory approval gate — state the
recommended option with a one-line rationale; never a bare fork. The user still decides.

### Consult strategy guidance

Before implementing in a codified domain, follow the [STRATEGY-INDEX][strategy-index] entries that fire.

### Method and extension loading

A workflow's `arc.methods` / `arc.extensions` frontmatter is an **index of what the workflow may fire**, not a
preload list. Load a declared method or extension when the workflow reaches its fire-point — the callout, signature
block, or extension marker that invokes it — and not before. A declaration the current path never reaches is not a
reason to load it. Don't proceed from intuition at a fire-point when the declared content is one read away.

When a loaded method carries a populated `.override`, follow its `override-mode`: `replace` (the default; absent
⇒ this) supersedes `.default`, while `extend` applies `.default` first and then the override on top.

---

## Documentation Boundaries

### No meta-project references in code

Never reference planning IDs — task IDs (`Task X.Y`), phase numbers (`Phase 3`), behavior IDs
(`B5`), requirement IDs (`R12`), spec citations (`§ Goals`) — named processes, methods, or
workflows that organize the work (ARC's own — `the test-first method`,
`prepare-commits workflow` — or your project's analogues), or `.arc/` documentation paths in
code, tests, or durable documentation (strategies, methods, workflows, READMEs). Applies to
comments, docstrings (including file-level), identifiers, test names, and prose.

Meta-commentary vs. substantive reference: citations that justify the code by appeal to
process artifacts — `per the team's TDD playbook`, `implements the spec from RFC-042`,
`per the test-first method's batching-judgment clause` — are a form of documentation coupling,
binding code to a document on its own evolution schedule. Replace them with what the code
does; route process rationale to a planning artifact (specs, drafts, task lists, meta files,
ADRs, work-unit notes, commit `Context:` footers). Substantive references —
test names describing behavior, comments on non-obvious invariants — stay.

### Artifact relocatability

Movable `.arc/` artifacts — a WU's `meta-*`, `draft-*`, `spec-*`, `tasks-*`, and companions, plus `cohort-*` —
relocate between lifecycle states (`active/` ↔ `backlog/` ↔ `completed/`), and every such move is a pure `git mv`
with no content edit. That holds only if artifacts carry position-independent references — the rule below.

### `.arc/` artifact references

Movable `.arc/` artifacts — a WU's `draft-*`, `spec-*`, `tasks-*`, `meta-*`, and companions, plus `cohort-*` —
are project-internal: shipped or published content cannot reference them at all. Two rules keep internal
references stable across relocation:

- **To a movable artifact:** backticked filename only — no Markdown links, no paths — from anywhere. For tasks,
  include the task ID + task-list filename: "Task X.Y - `tasks-name.md`".
- **From a movable artifact:** no relative-path links at all, even to stable docs — a movable source's own path
  changes when it relocates, so any relative link it carries would break. Relative paths are legal only in
  non-moving docs.

Otherwise, paths serve current-location metadata, commands, and links between non-moving docs.

### Write for the reader, not the author

When removing or restructuring content, don't leave notes explaining what was removed or where
it went — future readers have no context for the old state. Document what _is_, not what _was_.
Historical context belongs in commit messages and task list completion notes, not in the living
document.

**Also applies to communication artifacts** — PR descriptions, notes files, and documentation
handoffs describe what the artifact delivers, not the author's workflow continuity. Workflow
continuity (post-merge activation, next actions, session boundaries, file-retirement metadata
tied to specific commits) belongs in the active WU's `meta-{name}.md` and SESSION-NOTES,
not in the artifact body.

**Examples of reader-hostile patterns:**

- "Previously this section covered X, which has moved to Y" (reader never saw X here)
- "Next action after merge: invoke activate-work-unit.md" in a PR description — author-side
  workflow state, not reader-relevant for reviewing the change

### Commit and PR surface language

Commit and PR prose reads as **the operation performed**, legible without ARC-specific knowledge:
backticked artifact references (`meta-*`, `draft-*`, `ROADMAP`) are fine, insider vocabulary as a
load-bearing term (a `Class` value, a named internal procedure) is not. Traceability — task IDs,
phases, lifecycle action — routes to the `Context:` footer; the prose carries the change.
Illustrative, not exhaustive.

---

## When to Load Additional Guidance

Load these documents when you reach the relevant work — not during session initialization.

- **Before starting task execution:** The [process-task-loop workflow][process-task-loop] loads
  conditionally at session-init when the active `meta-{name}.md` shows active task work (see
  session-init item 10). If it wasn't loaded at init, load it before beginning any task

- **Before complex commits:** Load the [prepare-commits workflow][prepare-commits] — multi-session
  work, interleaved concerns, atomicity analysis

- **Before work in a codified domain:** Check [STRATEGY-INDEX][strategy-index] for relevant
  strategy documents

- **Before authoring a workflow:** Consult [Workflow Authoring Strategy][workflow-authoring] —
  frontmatter schema, author-side declaration rule, body conventions

- **For method defaults and overrides:** Workflow documents include method dependencies blocks
  that trigger loading of the relevant [`system/methods/`][arc-methods-dir] files on-demand

- **For quality gate tier definitions:** Load the [Quality Gates Strategy][quality-gates] —
  Tier 1/2/3 boundaries, escalation guidance

---

[dev-rules-project]: DEV-RULES.PROJECT.md
[arc-methods-cf]: ../../system/methods/commit-format.md
[arc-methods-ccf]: ../../system/methods/commit-footer.md
[arc-methods-it]: ../../system/methods/issue-triage.md
[arc-methods-tf]: ../../system/methods/test-first.md
[arc-methods-dir]: ../../system/methods/README.md
[config-arch]: ../../reference/strategies/arc/strategy-configurability-architecture.md
[concurrent-work]: ../../reference/strategies/arc/strategy-concurrent-work.md
[work-org]: ../../reference/strategies/arc/strategy-work-organization.md
[workflow-authoring]: ../../reference/strategies/arc/strategy-workflow-authoring.md
[session-ops]: ../../reference/strategies/arc/strategy-session-operations.md
[process-task-loop]: ../../system/workflows/arc/process-task-loop.md
[prepare-commits]: ../../system/workflows/arc/supplemental/prepare-commits.md
[strategy-index]: ../../reference/strategies/STRATEGY-INDEX.md
[quality-gates]: ../../reference/strategies/arc/strategy-quality-gates.md
[contributor-briefing]: ../../reference/briefs/AGENT-BRIEF.CONTRIBUTOR.md
[team-coordination]: ../../reference/strategies/arc/strategy-team-coordination.md
[session-handoff]: ../../system/workflows/arc/session-lifecycle/session-handoff.md
