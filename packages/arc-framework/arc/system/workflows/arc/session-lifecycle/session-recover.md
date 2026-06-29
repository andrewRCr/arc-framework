---
purpose: Restore ARC operating context after harness compaction from the latest compaction seed.
audience: agent
arc:
  methods:
    - session-state
  extensions:
    - post-context-load
---

# Workflow: Session Recovery

Use this workflow only after a harness compaction event, or from the manual `arc-recover`
fallback when a developer notices compaction erased ARC operating context. Recovery rehydrates
the context-load layer from live state plus the latest compaction seed. It does not reconstruct
the just-before-compaction action; the harness compaction summary owns that volatile current
leaf. Recovery does not run session-init, sync, pull, discover next work, relocate, commit,
push, or prompt on a clean path.

## 1. Run The Deterministic Recovery Audit

Run the recovery audit:

```bash
arc recover audit --json
```

Require `mode: "recover-audit"`. If the command fails or the report is malformed, stop and
surface that recovery cannot establish live state; the fallback is a normal `arc-session` re-init.
Do not manually reconstruct a seed from the harness summary.

Treat active-meta progress fields as soft orientation after compaction, not recovery authority:
`Next Task`, `Next Action`, `Last Completed`, `Current Workflow`, and `Blockers` may be stale.
Use them only as context after the deterministic recovery checks and harness summary are aligned.

## 2. Interpret The Verdict

If `verdict.status === "stop"`, inspect `verdict.stopReasons`:

- For any reason other than `planning-workflow-uncertain`, stop and surface the structured reason
  details. The CLI has already checked seed presence/schema, identity, fresh recovery state,
  load-set drift, dirty path-set drift, and execution task-cursor drift.
- If `planning-workflow-uncertain` is the only reason, continue only when the harness compaction
  summary names a planning workflow/stage that can be verified against the recovered load set and
  artifacts. If the summary is missing, vague, or contradictory, stop for direction. Do not fall
  back to active-meta `Current Workflow`.

If `verdict.status === "ready"`, continue without prompting.

Use the **fresh** report surfaces for context loading:

- `report.recover.loadSet.value` is the canonical context-load plan. The seed's embedded load set
  is only the audit baseline.
- For execution sessions, require `report.verdict.taskCursor.match === true` and use
  `report.verdict.taskCursor.actual.cursor` as the verified task-list anchor. If it is absent,
  malformed, or not `status: "found"`, stop; do not fall back to active-meta `Next Task`.
  A task-cursor mismatch is an unconditional stop: the harness summary can explain the volatile
  current leaf, but it does not override durable task-list drift.
- For planning sessions, use the harness-summary workflow/stage only after the verification above.

Do not stop solely because the seed is old or `HEAD` moved. The recovery audit's structured
verdict is the authority; mention seed age or head movement only as supporting detail when another
stop condition already fired.

## 3. Rehydrate The Load Set

Load `report.recover.loadSet.value.entries`; the manifest order is the context order, not a
serial-read requirement. Issue independent reads in a single tool message when the platform
supports parallel reads. Never wait on one document before issuing the next unless locating a
slice genuinely depends on the earlier read. Never load from the seed's paths. The harness
summary is authoritative for the volatile work-in-progress locus, but not for ARC operating
context; verify it against the recovered files when it names a task.

Apply each entry's `readMode`:

- `full` - read the whole file.
- `partial-section` - read only the named heading section.
- `partial-strategic` - read the active task-list header, current phase preamble, and current
  task section. Use the verified `taskCursor.section` and `taskCursor.leaf` anchors from the
  audit report. If the report lacks a verified anchor, stop. Do not fall back to the active
  meta file's `**Next Task:**`. Slice the task list as follows:
    1. Header — read the content above the first `## **Phase` heading.
    2. Current phase preamble — derive the phase id from `taskCursor.section.id` by stripping
       the leaf segment (`5.3` -> `5`, `3.R.e` -> `3.R`), then read from
       `## **Phase {id}:**` through the line before the first checkbox under that phase.
    3. Current task section — start at `taskCursor.section.lineHint`, falling back to the
       section id and title only if the hint is stale, and read through the line before the
       next parent task or phase heading. The `taskCursor.leaf` identifies the executable
       checkbox inside that section.

  If offsets are needed, build one structural map from phase/task headings rather than repeated
  ad hoc searches. Stop if any required slice cannot be located.

Preserve the manifest order when reconciling loaded content and deciding what procedural
context applies, even when the reads complete out of order.

The load set already includes the session-type lifecycle workflow when the recovered state has
one. If no lifecycle workflow is present for an execution, planning, or integration resume, stop
and surface the missing workflow pointer. For planning recovery, do not treat `Current Workflow`
as authoritative by itself; if the stage is unclear from deterministic state plus the harness
summary, stop for direction.

## 4. Post-Context-Load Extensions · `#post-context-load`

If `post-context-load` appears in `extensions.value.active`, load and execute its `.actions`
after the recovery load set has been read. Otherwise skip.

## 5. Resume

Before resuming work, apply this precedence rule internally: the recovered ARC operating context
is authoritative for ARC procedure and state; the harness summary is authoritative only for the
volatile in-progress locus. Do not paste recovered files or print precedence language to the
developer. If a user-visible recovery note is useful, keep it to one terse status line:

```text
ARC post-compaction session recovery complete.
```

Resume from the harness-summary locus, bounded by the recovered ARC context, without a routine
prompt:

- `execution` - continue the summarized current task through `process-task-loop.md`.
- `planning` - continue the recovered planning workflow when the stage is verified; otherwise stop.
- `integration` - continue `integrate-work-unit.md`.

Recovery restores the init-time load set plus the state-selected lifecycle workflow only.
On-demand context loaded mid-task before compaction is not restored here; reload it through its
normal trigger if the resumed work needs it again.
