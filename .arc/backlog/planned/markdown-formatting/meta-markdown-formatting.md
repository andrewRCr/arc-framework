# Metadata: Markdown Formatting Hygiene

- **State:** Planning
- **Owner:** andrew
- **Branch:** [none]

- **Origin:** [internal]
- **Design:** `draft-markdown-formatting.md`

- **Depends On:** [none] (coordinates with quality-gate-hooks for enforcement — soft, downstream)
- **Cohort:** [none]
- **Priority:** P3

- **Task List:** [none]
- **Last Completed:** [none]
- **Next Task:** [none]
- **Blockers:** [none]

- **Next Action:** Promote to spec. Make this repo's markdown formatting deterministic + convention-enforced:
  adopt `markdown-table-formatter` (table-only, verified) with a **source/instance-aware** `format:tables`
  scope (format `packages/arc-framework/arc/` source for framework files + sync to `.arc/`; format
  instance-only `.arc/` + `docs/` + root directly — the format scope deliberately differs from `lint:md`'s
  instance scope); one-time table sweep; emphasis convention (MD049 underscore + MD050 asterisk + `--fix`
  sweep over ~127 files); emoji removal + ban rule; discoverability doc in the internal QUICK-REFERENCE.
  Enforcement (CI gate + pre-commit auto-fix) is routed to `quality-gate-hooks`. **All findings verified —
  see `draft-markdown-formatting.md` § Verified findings; do not re-derive.**
