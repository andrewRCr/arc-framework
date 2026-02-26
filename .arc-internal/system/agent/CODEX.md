# CODEX.md

Guidance for Codex CLI when working in the ARC framework repository. Shared rules and project
context live in:

- [AGENTS](AGENTS.md)
- [DEVELOPMENT-RULES][dev-rules] v0.3.0-dev (hash: 8c5f2a91)
- [QUICK-REFERENCE][quick-ref] v0.3.0-dev
- [Process Task Loop][process-task-loop]

## Codex-Specific Notes

- **Command-first verification:** Before assuming repository state, confirm with shell commands
  (`git status`, `git diff --stat`, targeted file reads).
- **Search tools:** Prefer `rg`/`rg --files` for file and text discovery before broader scans.
- **Edit style:** Prefer precise, minimal patches. Use `apply_patch` for focused single-file edits
  and direct shell writes for larger multi-file text replacements.
- **Commit safety:** After staging and before commit, run `git --no-pager diff --cached --stat`
  to verify the staged set is atomic and intentional.
- **Quality gates:** For markdown checks, prefer pinned tooling (`npm run -s lint:md`) rather than
  network-dependent ad hoc `npx` calls.
- **Session docs discipline:** Do not edit `CURRENT-SESSION.md` unless user asks. When asked to
  hand off, update it with concrete commit-level progress and immediate next action.
- **Escalation expectation:** Some commands need permission or unrestricted execution
  (for example `npm install`). If a required command fails under sandbox constraints, re-run with
  escalation request.

---

[dev-rules]: ../../reference/constitution/DEVELOPMENT-RULES.md
[quick-ref]: ../../reference/QUICK-REFERENCE.md
[process-task-loop]: ../../../.arc/system/workflows/arc/3_process-task-loop.md
