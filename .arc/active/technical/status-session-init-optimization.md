# Status: Session-Init Optimization

## Active Work

- **State:** In Progress
- **Branch:** technical/session-init-optimization
- **Task List:** `.arc/active/technical/tasks-session-init-optimization.md`
- **Next Task:** 5.7.f — `arc init` recipe + scaffolding update (next per
  amended execution order: 5.7.f → 5.7.a → 5.7.c → 5.7.d → 5.7.e → 5.7.g
  → 5.7.h → 5.7.i)
- **Last Completed:** Task 5.7.b — Session-init integration removal.
  Removed Step 4 item 3 (agent-specific file conditional load) from
  `session-init.md`; renumbered items 4–11 → 3–10 with all internal +
  external cross-references updated; dropped `{AGENT}.ARC.md` row from
  `AGENT-BRIEFING.ARC.md` Key Documents table; updated `DEV-RULES.ARC.md`
  "session-init item 11" → "item 10". Two-copy sync. Tier 1 lint clean.
- **Blockers:** none
- **Next Action:** Begin Task 5.7.f — primary surface is
  `packages/arc-framework/init-recipe.json`. Two recipe cleanup edits:
  drop `template-agent.md` from unconditional `include_files` (line 17);
  remove the seven per-tool conditions for `system/agent/{TOOL}.ARC.md`
  (lines 149-184). 5.7.f scope reduced — briefs-path renames migrated to
  5.7.c per pre-execution amendment.
