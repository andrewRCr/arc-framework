# Draft: Task-List Conventions

- **Origin:** [internal] — three concerns routed from `USER-INBOX` at the work-routing-discipline housekeep
  drain (2026-06-01), each surfaced live during task generation / task-list audits.
- **Purpose:** Resolve a cluster of task-list-formatting + task-generation gaps that share edit surfaces
  (`strategy-task-list-formatting.md`, `template-tasks.md`, `2_generate-tasks.md`, `3_process-task-loop.md`):
  the Strategies-line consumption contract, descriptor-block blank-line discipline, requirement-anchor
  traceability, and the Pass-3 interlock stop language.

---

## Scope (routed captures — iterate into a plan)

### Codify or deprecate the task-list Strategies line (+ make the root descriptor block loose)

Two coupled task-list-formatting gaps (surfaced re-auditing `worktree-foundation`):

- **Descriptor-block blank lines (decided: loose).** The root descriptor block (`_Goal:_` + peer descriptors +
  any `**Strategies:**` line) renders tight even when bullets are multi-line, which is hard to parse in raw.
  Desired state: loose-list — a blank line between every descriptor bullet when any is multi-line. The strategy
  doc is ambiguous (§ Goal/Note Lines "block" framing vs. § Blank-Line Discipline loose-list rule); resolve in
  favour of loose and codify in `strategy-task-list-formatting.md` + `template-tasks.md`. Not Tier-1-lint caught
  — a pre-save-checklist convention.
- **The Strategies line — refine + codify, or deprecate.** As-is it is "sometimes value-add, likely more noise
  than signal": authored by `2_generate-tasks.md` Step 2.2 but with **no consumer** — `3_process-task-loop.md`
  never tells the executor to read it, and it is absent from the strategy doc's descriptor taxonomy and the
  template. If it can be signal, find that and codify; if it leans noise, kill it. The call hinges on a
  **consumption contract** (e.g. process-task-loop "read a task's Strategies entries before impl if not already
  in context this session") as much as the inclusion threshold, and on **heaviness** (strategies are large docs;
  prefer **section-anchor targets** over whole-doc refs if kept). Step 2.2's threshold is self-tensioned ("use
  when not obvious from the title" vs. "save a STRATEGY-INDEX scan") — resolve the tiebreak.
- **Files (all two-copy):** `strategy-task-list-formatting.md`, `template-tasks.md`, `2_generate-tasks.md`
  (Step 2.2), `3_process-task-loop.md` (the missing consumption contract). `worktree-foundation`'s task list is
  the symptom (tight descriptor blocks + `strategy-work-organization` in 9 of 13 Strategies lines) — reflow /
  trim it as dogfooding when this lands, not before.

### Codify a requirement-anchor field (R-ID traceability), or confirm anchors are Pass-1-only

`2_generate-tasks.md` Pass 1 has parent skeletons "cite R-ID anchors (which PRD requirements each parent
satisfies)," but never codifies whether those anchors persist into the final list or what field carries them.
Generating `tasks-work-routing-discipline.md` exposed the gap — filled it by inventing a non-codified
`_Satisfies:_` descriptor (absent from `strategy-task-list-formatting.md` § Goal/Note Lines' taxonomy), then
removed it. Decide: (a) codify a sanctioned requirement-anchor field in `strategy-task-list-formatting.md` +
`template-tasks.md` + the Pass 4 checklist (traceability genuinely helps the verification phase's
criteria→requirement mapping), or (b) state explicitly that R-anchors are a Pass-1 decomposition device that
does not persist past Pass 2.

### Strengthen `2_generate-tasks.md` Pass 3 interlock language (unconditional stop + sanctioned waiver)

The Step 3.2 `workflow-interlock` ("stop and await direction before editing") is per-phase, but its wording lets
an agent rationalize skipping the stop when a phase's findings are all "carry as context" (no masked decision).
Hit live generating `tasks-work-routing-discipline.md`: honored the stop for Phase 1, then collapsed
audit+surface+edit into single turns for later phases on the reasoning "no decision needs surfacing." The stop is
also the user's pacing/absorption/redirect point (the human can't hold as much in context and needs the beat to
weigh in), not only a decision gate. Two fixes: (1) state the stop is unconditional — fires every
non-verification phase regardless of finding severity; the agent may not collapse 3.2 into 3.3 on a "no decision
needed" judgment; (2) add a sanctioned batch-waiver so the **user** can authorize "audit the rest without
stopping." Possibly generalize in DEV-RULES.ARC: always-stop interlocks are user-waivable only, never
agent-waivable. Touches `2_generate-tasks.md` (+ maybe DEV-RULES.ARC) — two-copy.

---

## Scope Estimate

Small–medium; doc + workflow edits across `strategy-task-list-formatting.md`, `template-tasks.md`,
`2_generate-tasks.md`, `3_process-task-loop.md` (two-copy sync). Carries two design forks (Strategies-line
keep-vs-kill + consumption contract; requirement-anchor codify-vs-confirm-Pass-1-only) to resolve in plan
iteration before tasks generate.
