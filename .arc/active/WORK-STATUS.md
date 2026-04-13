# Work Status

> **About this file:** Tracked project pointer — committed alongside task list updates in the
> same atomic operation. Lightweight factual state so anyone on this branch can see where work
> stands at a glance.
>
> **Companion:** `user/{identity}/SESSION-NOTES.md` (gitignored) carries personal session
> context — what was tried, decisions made, debugging insights. Together they implement P5
> (Context Preservation). See `session-handoff.md` for the full update protocol.
>
> **Customization:** The session state mechanism is overridable — see `arc-methods.md` §
> session-state.

## Active Work

**Branch**: `technical/plan-operating-modes`
**Task List**: [none]
**Next Task**: —
**Last Completed**: **Audit A L2 and M4 resolved.** One-commit consolidation-pass closure on
`plan-arc-modes.md`. L2 landed as a Local-mode scope paragraph in § Shift lifecycle (detail
design) § Uncommitted work handling clarifying that `git stash` covers only tracked project-repo
files and that untracked `.arc/` edits structurally ride **leave as-is** regardless of which
option the user chooses for tracked code — they remain in the working tree and are captured by
the next `arcd backing sync` at session handoff. Placed at the shift-workflow semantics layer
rather than § Mode 2 § What Changes vs. Tracked Full because the clarification is about
shift-workflow behavior, not a Mode-2 feature change. M4 landed as a new **Enforcement**
subsection under § Single-Active-Unit Invariant specifying (a) enforcement locus at the
activation workflow (`activate-work-unit.md`), which scans `active/` task list `Status` headers
before proceeding — not any specific CLI command, so every invocation surface inherits the check
uniformly; (b) error message naming the active WU and pointing at `/arc-shift` (conversationally
invoked skill) as the primary recovery via `shift-with-activation` dispatch; (c) fallback
recovery via manual pause-then-activate for users who prefer explicit sequencing. Explicitly
generalized the check to tracked Full, closing the mode-scope ambiguity that the section's
§ Mode 2 placement created. Sequencing Plan updated: L2 and M4 promoted to their own rows; only
M5 remains from Audit A before Audit B can begin.

**Key design corrections during the pass:**

+ **L2 placement decision** — chose § Shift lifecycle (detail design) § Uncommitted work
  handling over the handoff's proposed § Mode 2 § What Changes vs. Tracked Full. The
  clarification is about shift-workflow semantics across modes, not a Mode-2 feature change:
  the underlying decision is unchanged; Local just has a wider scope of "uncommitted work"
  that includes untracked `.arc/` state.
+ **M4 enforcement locus** — named the activation workflow rather than "the CLI" per
  user-confirmed framing. The workflow is the behavioral contract; the CLI is just an
  invocation surface. Every entrypoint that reaches activation (CLI, skill, direct workflow
  execution) inherits the check uniformly.
+ **M4 recovery path corrected** — handoff proposed a two-step manual path
  (`arc-shift {wu} --pause --reason "{r}"` then re-run activation). Corrected to invoke
  `/arc-shift` as a conversationally-invoked skill (per L3559, L3853 — `/arc-shift` is a
  thin skill backed by `shift-work-unit.md`, not a CLI command with flags) and use the
  `shift-with-activation` dispatch that already exists in the workflow design (L3753). The
  shift-with-activation transition handles pause + activation in one coordinated walk, which
  is cleaner UX than a two-step manual path. The manual pause-then-activate remains available
  as a fallback for users who prefer explicit sequencing.
+ **M4 scope generalization** — added explicit "same check applies to tracked Full" sentence
  closing the mode-scope ambiguity created by § Single-Active-Unit Invariant's placement under
  § Mode 2. The invariant and enforcement are mode-universal; shift lifecycle is the mechanism
  that makes the constraint livable, and both modes share the same enforcement locus.

**Still open from Audit A:** M5 (Research Findings section has no Local entries) — can be
partially filled by transcribing this session's two prior-handoff-noted external research passes
(editor `@`-mention precedent survey from H3 walk scenario 7; CLI state-directory idiomatic
practice survey from H3 walk scenario 10) into new § Research Findings subsections, plus a brief
note on `.git/info/exclude` clone-reset behavior if not already covered. After M5 drains, Audit
A section deletes entirely (only the Findings blocks with Resolved status remain as
audit-tracking artifacts), and Audit B (content drift sweep) becomes the final pre-PRD pass.

**Blockers**: [none]

**Next Action**: **M5 consolidation** — transcribe H3 walk's editor `@`-mention precedent
survey and CLI state-directory idiomatic practice survey into new § Research Findings
subsections (the tool list + findings + sources format used by existing subsections fits
cleanly). Also verify whether the existing `.git/info/exclude` re-clone behavior claim is
already covered; if not, add a brief note. Scope: two new subsections (~30-50 lines each)
plus possible third mini-note. Substantive content transcription, not fresh design work.
After M5 drains, Audit A § Working deletes entirely and Audit B (content drift sweep) begins
as the final pre-PRD pass — do NOT start Audit B early, its scope depends on M5's final shape.

Plan doc size: 5921 → 5967 lines (+46 net this commit). Markdown lint clean.

---

**Last Updated**: 2026-04-13 (Audit A L2 and M4 resolved in one commit; M5 remains before Audit B)
