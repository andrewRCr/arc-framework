# Status: Session-Init Optimization

> **About this file:** Per-WU state pointer — committed alongside task list updates
> in the same atomic operation. Lightweight factual state so anyone on this branch
> can see where work stands at a glance.
>
> **Companion:** `user/{identity}/SESSION-NOTES.md` (gitignored) carries personal
> session context. Together they implement P5 (Context Preservation). See
> `session-handoff.md` for the update protocol.

## Active Work

- **State:** In Progress
- **Branch:** technical/session-init-optimization
- **Task List:** `.arc/active/technical/tasks-session-init-optimization.md`
- **Next Task:** Task 3.R.a — CLI rename + test coverage (line ~1201)
- **Last Completed:** Task 3.12 — Phase 3 close, Tier 3 quality gates. All Tier 3 gates
  green: markdown lint 195/195 files clean; `lint:ts` / `lint:sh` / `typecheck` /
  `typecheck:test` all clean; `npm test` 752 tests pass (707 unit+integration + 45 E2E);
  build succeeds (cli.js 129.30 KB + declarations); framework-sync integration test passes
  standalone. Hook false-positive surface check verified path gating both directions —
  negative set (tsconfig.json, .gitignore, src/*.ts, package.json) produces empty candidate
  lists for CHECK 12/13/14 (all short-circuit without invoking validators); positive mirror
  set correctly targets methods/extensions/agent frontmatter (CHECK 12), all markdown
  (CHECK 13), and package-source non-README methods/extensions only (CHECK 14 — `.arc/` and
  README excluded as designed). Full-tree link-scan invariant confirms steady state: 6 hits,
  all in `.arc/backlog/feature/**` cross-WU bucket (`plan-arc-modes.md`,
  `plan-expanded-planning-path.md`, `plan-post-release-methodology.md`,
  `plan-work-unit-mobility.md`). Zero live-ref, zero template false-positive, zero archive
  false-positive post-3.11. Phase 3 closes implicitly — 3.1–3.13 all `[x]` (3.13 landed
  out-of-order as CHECK 14 follow-on from 3.7). Ready to gate Phase 4. Previous:
  `b6e2649` Task 3.11 — validate-links template/archive skips + stale refs.
- **Blockers:** [none]
- **Next Action:** Begin Phase 3.R with Task 3.R.a — CLI rename + test coverage. Rename
  `arc user pull` → `arc user fetch` (preserving current fetch-only semantic); introduce new
  `arc user pull` = fetch + load (matches `git pull` muscle memory); rewrite `arc sync` as
  bidirectional smart porcelain with the `(local-ref vs remote-ref) × (disk vs local-ref)`
  2×2 direction matrix, direction-banner before acting, and conflict prompt; drop `arc sync
  --load`. Update `cli.ts`, `handlers/user.ts`, `handlers/sync.ts`, `commands/user.ts`, plus
  `__tests__/unit/sync.test.ts` and `__tests__/unit/user-handlers.test.ts` including new tests
  for the sync direction matrix. Phase 3.R inserted pre-execution this session as a
  phase-level R follow-on to Phase 3: CLI vocabulary rename + `arc user status` + multi-snapshot
  backup hardening + session-init remote-sync integration (absorbs Phase 5.0 with
  unbounded-ancestor-check and actionable depth-guidance additions). See latest commit for
  full 3.R plan.
