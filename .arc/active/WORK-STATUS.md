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
**Last Completed**: **Audit A fully drained — completed 2026-04-13.** Two-commit consolidation
pass closed the remaining M4 + M5 + L2 items on `plan-arc-modes.md`, following this session's
earlier H3 resolution (commits `1485800`, `39195b1`, `9dfdba9`, `8a61fd1`, `1d33cdc`). All Audit
A findings (H1, H2, H3, H3-N1 through H3-N7, M1, M2, M3, M4, M5, L1, L2, L3, L4) are now
Resolved with pointers into their durable structural sections.

**This session's consolidation pass (two commits):**

+ **Commit 1** (`5d63071`) — `docs(arc): close Audit A L2 and M4 consolidation items`. L2 landed
  as a Local-mode scope paragraph in § Shift lifecycle (detail design) § Uncommitted work
  handling clarifying `git stash` covers only tracked project-repo files and untracked `.arc/`
  edits structurally ride leave-as-is regardless of the option chosen for tracked code. M4
  landed as a new Enforcement subsection under § Single-Active-Unit Invariant specifying the
  activation-workflow locus (scans task list `Status` headers), error shape pointing at
  `/arc-shift` for `shift-with-activation` recovery, and explicit generalization to tracked
  Full. Placement-decision rationale: shift-workflow semantics layer for L2 (not § Mode 2) since
  the decision is unchanged and only the scope of "uncommitted work" widens in Local; activation
  workflow layer for M4 (not "the CLI") since every invocation surface inherits the check. The
  handoff-suggested recovery path was corrected from a two-step manual pause-then-activate to
  `/arc-shift` conversational invocation via `shift-with-activation` dispatch, because
  `/arc-shift` is a thin skill (L3559, L3853), not a CLI with flags.
+ **Commit 2** (this commit) — `docs(arc): close Audit A M5 research consolidation`. Three new
  subsections added to § Research Findings transcribing the H3 walk's research evidence base:
  (1) **Editor `@`-mention precedent for gitignored personal tooling** — the
  Cursor/SpecStory/Aider/Continue/Zed/VS Code/JetBrains/Dendron/Obsidian survey confirming
  gitignored-picker cost as intrinsic tradeoff, Zed's `file_scan_inclusions` as sole clean
  mitigation, VS Code issues #103570 and #43505 closed without resolution; (2) **CLI
  state-directory idiomatic practice** — the 14-tool survey validating `chmod 700` on creation,
  documentation-only remote privacy, and tool-category-dependent at-rest encryption (note-taking
  tools delegate to disk layer, credential tools encrypt by default); (3) **`.git/info/exclude`
  behavior on re-clone** — short factual entry confirming no native git mechanism preserves
  per-repo excludes across clones, framing re-clone as a routine recovery event. The L2942
  "industry norms for `.gitignore` placement" back-reference was rephrased inline rather than
  written as a fourth subsection — that claim is conventional git guidance, not
  research-surfacing content. § Sources updated with Lite/Local groupings (2026-04-01 vs
  2026-04-13 research dates).

**Plan doc growth:** 5921 → 6046 lines across the two commits (+125 net). Session-wide growth
(including earlier H3 work): 5314 → 6046 lines (+732 net). Markdown lint clean on every commit.

**Audit A is now fully drained.** § Audit A § Working section's purpose is complete — all
findings have Resolved status lines with pointers into durable structural sections. The only
pre-PRD work remaining is Audit B.

**Blockers**: [none]

**Next Action**: **Audit B — Content drift sweep** (final pre-PRD pass). Fresh session
recommended — Audit B is a full plan-doc read pass, and starting with clean context maximizes
coverage quality. Scope: full plan-doc read for (a) terminology inconsistencies (notably
`pm.mode` vs `pm.layer` — some pre-existing text still uses the old key name, flagged in last
session's handoff); (b) cross-reference rot (section references pointing at renamed or moved
content); (c) outdated line-number pointers that drifted during H1-H3 resolution and this
consolidation pass; (d) any other drift that accumulated across the resolution sessions.
Estimated: one moderate session. After Audit B completes, the plan doc is ready for PRD
authoring.

---

**Last Updated**: 2026-04-13 (Audit A fully drained — M4, M5, L2 resolved in two commits this
consolidation pass; Audit B is the sole remaining pre-PRD pass)
