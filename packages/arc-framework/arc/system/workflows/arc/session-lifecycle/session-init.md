---
purpose: Establish session context by executing the compiled session-init agenda.
audience: agent
arc:
  methods:
    - read-load-set
    - assess-start-readiness
    - discover-next-work
    - session-state
---

# Workflow: Session Initialization

**Signature:** `arc-session [arguments]` → `arc agenda session-init --json [arguments]`.

The **agenda** is the CLI's compiled instruction list. A **step** is one instruction in that list. This workflow is
its **spine**, executing the closed step vocabulary. A **fragment** loads a named method or an owning workflow.

**Output discipline:** Between tool calls and the final orientation, generate text only for problems, blockers,
mismatches, judgment calls the user cannot infer from the tool stream, and flow-control pivots they need to track.
Omit narration of tool calls, branches, and document loading. This overrides routine narration for this workflow.

## 1. Compile the agenda

Run `arc agenda session-init --json` in the session's checkout with the skill's arguments. Build its invocation as
literal arguments: each flag is one element; the value of `--plan`, `--errand`, or `--start` extends to the next flag,
is absent when another flag follows immediately, and remains one element however many words it contains. Join the
remaining positional words into one seed. Honor the person's quoting and any `--` operand delimiter. Bind a
leading-dash option value as `--flag=value`; put a leading-dash seed after `--`. Keep `--json` before that delimiter.

Pass every argv element as one argument, including values typed by the person and branch names supplied remotely.
Never split an element or interpolate it as command text. With a shell-backed tool, quote each element and the
checkout path whole using that shell's safe quoting.

If the command fails, its JSON cannot be read, or no agenda is returned, surface the failure and stop. Diagnostics
may explain it; they do not establish a session context or authorize a fallback operation.

Carry the agenda's `residual` as context for later operations. Execute its steps in order; do not reconstruct a load
set, select another subject, re-evaluate sync policy, or infer actions from documents or Git state.

## 2. Execute the steps

Maintain the reads completed in this checkout, followed methods' reports and questions, and unoffered `exec` actions
that ran. Buffer orientation content until the terminal step; emit it once before a `gate` or an owning workflow
fragment. An agenda ending at an `exec` or an immediate offer emits no orientation; its fresh agenda will orient.

- **`read`:** Before the first read, load and follow [read-load-set][read-load-set]. Supply each step's `path`,
  `readMode`, `group`, and strategic `cursor`. Execute independent reads of the same group together. Surface and skip
  a failed read; an unlocatable strategic section is a mismatch. Apply the [session-state method][session-state]
  when interpreting session state, following its populated project override when present. The agenda still selects
  the context and workflow.
- **`exec`:** Run its `actions` in their given order, then apply `then` below. Each action's `argv` is one command,
  run in its `checkout` when present, otherwise the session's checkout. Never add a command or flag, combine actions,
  or turn advisory text into a command.
- **`offer`, `ask: "now"`:** Present `text` verbatim and the listed choices; recommend a choice with a brief reason.
  Ask and wait before continuing. Apply the selected choice below. A `bare` choice runs nothing and advances to the
  next step; every other choice follows its carried transition.
- **`offer`, `ask: "orientation"`:** Buffer the standing offer at its place among the orientation surfaces, showing
  its text, choices, and commands. Continue toward the terminal step. A person may select a standing choice in reply
  to the orientation; apply that choice then. Not picking it is the decline, without a separate question or record.
- **`fragment`, method target:** This step is the fire-point for its named declared method. Load
  `.arc/system/methods/<name>.md`, apply its default/override rule, and follow it with `args`. Carry its report and
  question into orientation; its question becomes the terminal gate's question. A method omitted as already followed
  retains its earlier report and question when the agenda's `answered` note names it.
- **`fragment`, workflow target:** Emit the buffered orientation, then load and follow the exact `target.path` with
  `args`. That workflow now owns the session; report what its entry actually establishes, never a premature success.
- **`render`:** Buffer its `text` verbatim as a conditional top-level orientation section, at the step's place.
- **`note`:** Buffer its `text` verbatim as an advisory line, at the step's place.
- **`gate`:** Emit orientation, then follow the gate rule below.

For a selected offer choice:

- **`bare`:** Continue; run nothing.
- **`actions`:** Run the choice's actions in order with the same literal-argv and checkout rules as an `exec`, then
  apply its `then`.
- **`signal`:** Recompile with its `recompile` argv as carried; do not set flags or answers independently.
- **`elicit`:** Ask for the value of its `signal`, offering `carried` as the default when present. Insert
  `--<signal>` and the literal answer before the carried argv's first `--`, or at its end if none exists. Keep the
  answer as one element. If it starts with `-`, insert one `--<signal>=<answer>` element instead. Recompile with that
  argv; make no other change.

A failed action stops the sequence. Surface its command and output and ask for direction; run no remaining action.
The person may retry it or explicitly continue past it. To continue past it, run the step's or choice's carried
recompile argv, skipping every unrun action in that sequence. Do not edit its answer or done flags. A choice whose
transition is a handoff has no carried recompile; a failed handoff leaves the session at its orientation.

## 3. Transitions and carried context

**Recompile:** For `then.kind: "recompile"`, run its exact `argv` from the session's checkout, even when an action
ran elsewhere. Start the fresh agenda at its first step. The compiler carries answers, completed executions, and
followed methods; never manufacture `--answered` or `--done` flags. Elicitation above is the only argv insertion.

Carry reads already completed for the same checkout and path only when no intervening sync could have written them.
Notes pull/load writes user documents, including SESSION-NOTES, WORKING-MEMORY, and USER-INBOX; user-reference apply
can move personal context. Worktree pulls, resets, and materialization into the session's checkout can change tracked
files. Re-read affected documents according to the fresh agenda. Carry followed methods' reports and questions.

**Handoff:** For `then.kind: "handoff"`, relay the command's own result text naming the resulting checkout and stop.
Ask the person to open a fresh session there with their harness of choice; emit no harness-specific launch command.
Do not relocate this running session by default. Explain that the person's terminal and editor remain in the current
checkout; move only on explicit informed opt-in, then run this spine afresh from the new checkout.

## 4. Emit orientation and honor the gate

Emit each buffered render, note, and standing offer once, in step order, above any composed work state. Include a
followed method's report and question, and report unoffered `exec` actions that ran. Frame the summary only by
`orientation.shape`:

- **`work-state`:** Compose **Last completed** (one line: task ID, title, commit state), **Current task** (one line:
  task ID and title, or `none` between work units), **Blockers** (`none` or the relevant detail), and **Next action**
  (one line on the task list, unbounded when off-task work has no tracked source). Use the loaded meta, task cursor,
  and SESSION-NOTES within the authority rules below. Include a cohort-coordination line only when the loaded cohort
  document bears on the current task.
- **`subject`:** Frame the summary around `orientation.subject` and its kind/key, goal, and relevant working context,
  instead of composing work-unit state.
- **`checkout`:** Emit the compiled header and checkout surfaces, with no thought-state lines or subject.
- **`none`:** Emit the render and note steps alone, without thought-state lines or a synthesized header.

Do not restate a task's full description: its task-list pointer is enough. Reserve unbounded working-context prose
for off-task-list work with no tracked source. Never include configuration overrides, defaults active, freshness
clean, or environment checks passed. Live Git facts come from the compiled text, never SESSION-NOTES prose.

After emitting the orientation, write each emitted step's `marker.value` to its exact `marker.path` when present,
creating parent directories as needed. Never write a marker before its text is shown or for a suppressed surface.

At a `gate`:

- **`proceed`:** Use a followed method's question when it supplied one; otherwise ask “Awaiting direction — proceed
  to Next Action?” Only `autoProceed: true`, with no mismatch and no blocker in the composed Blockers line, permits
  omitting that question and beginning the Next Action directly.
- **`launch`:** Present the followed method's launch question and await confirmation. Follow that method on launch.
- **`stop`:** Stop with the compiled guidance; do not advance into task work.

## 5. State authority and mismatches

SESSION-NOTES may supply roster/context anchors (`Working On`, `Session Type`, `Commit at Handoff`) and human working
context. It never selects lifecycle phase, workflow, load set, or live Git facts. WORKING-MEMORY entries bind as active
constraints until each entry's `_Remove when:_` trigger is met.

Distinguish two mismatch axes:

- **Truth of work state:** Git commits, actual file contents, and `git status` are authoritative. The task list,
  active meta, and personal notes make claims about that state; verify them against Git, which wins on conflict.
- **Which work is being picked up:** Identity-filtered metas and the worktree list are authoritative. Personal notes
  describe working context, not which work unit, branch, or task this session resumes.

When an axis's authority resolves a discrepancy unambiguously, use ground truth and report the discrepancy in
orientation: “Active meta said X. Git/task list show Y. Proceeding with Y.” If the compiled selection needs refreshing,
rerun the last agenda invocation from the same checkout; never construct another session frame yourself.
When explanations remain ambiguous or same-tier authorities disagree, report each view with specific details and
wait for explicit direction before corrective action. Unexplained dirty files may be co-development or interrupted
work; do not assume ownership. A mismatch withholds auto-proceed even when it can be recovered with notice.

If a freshness gap suggests an interrupted session, load [process-task-loop][process-task-loop] and follow its
**Crash Recovery** procedure before proceeding.

---

[read-load-set]: ../../../methods/read-load-set.md
[session-state]: ../../../methods/session-state.md
[process-task-loop]: ../process-task-loop.md
