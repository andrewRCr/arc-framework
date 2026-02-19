# Task Inbox

**Purpose:** Zero-friction capture for ideas, tasks, and work that needs processing.

**Keep this lean!** Items should not accumulate here. Process during weekly review:

- Quick actions (<5 min) → Do immediately
- Atomic tasks → Move to `active/ATOMIC-TASKS.md`
- Feature ideas → Move to `feature/BACKLOG-FEATURE.md`
- Technical ideas → Move to `technical/BACKLOG-TECHNICAL.md`
- Uncertain → Leave for next week's review

---

<!-- Capture anything here using simple bullets (no checkboxes, no numbers) -->

- **Philosophy/positioning note for public-facing materials (README, adoption docs):** ARC's
  single-threaded, human-in-the-loop approach is opinionated but shouldn't position itself as
  the exclusively correct way to work with AI agents. Delegated and multi-agent workflows have
  legitimate uses depending on work type and quality/maintainability standards. Public presentation
  should acknowledge this — "here's our approach and why, not the only approach." Avoid implying
  blanket statements about agent-assisted development. Relevant for README refresh (B.5) and any
  philosophy/about content. (Origin: 2026-02-19 planning discussion around team adaptation and
  single-threading model.)
- **CURRENT-SESSION tracking status needs documentation.** Two concerns: (1) session-init workflow
  should explicitly note that CURRENT-SESSION.md may be gitignored (it is for this project) so
  agents don't try to commit it. (2) A standardized field somewhere in core docs (QUICK-REFERENCE
  or DEVELOPMENT-RULES) should indicate the project's CURRENT-SESSION tracking policy — untracked
  (solo default), tracked (multi-machine), or per-developer (team). This becomes an init-time
  option in the CLI. Relevant for structural analysis (Cluster D placement), session-init workflow,
  and distribution plan. (Origin: 2026-02-19, agent attempted `git add` on gitignored
  CURRENT-SESSION.md.)
