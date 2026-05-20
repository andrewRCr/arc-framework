# Backlog Inbox

> _Project-shared queue of multi-step entries awaiting plan-doc maturation. Live capture in
> `user/{identity}/USER-INBOX.md` § Backlog drains here at WU ceremonies; entries graduate to a per-WU subdir
> under `backlog/{planned,provisional}/<wu-name>/` when scope and plan emerge. See
> `strategy-planning-module.md` § Inbox Family._

## Inbox

### `[ ]` **Pi Harness Support**

- _Observation:_ Pi is an open-source TypeScript agent harness in the Claude Code / Codex CLI category.
  Categorically orthogonal to ARC (Pi is a runtime agent harness; ARC is a process harness in `.arc/`), so
  coexistence already works today via agent-agnostic defaults. Explicit support is ergonomic glue, not
  architectural change.

- _Proposed action:_ `PI.ARC.md` harness file (sibling to `WARP.ARC.md`, distinct from model-identity files
  like `CLAUDE.ARC.md`); skill packaging at Pi's discovery location (`~/.pi/agent/skills/` or `.pi/skills/`)
  with any format adaptation; `arc init --tools pi` / `arc join --tools pi` CLI recognition; verify
  instruction-file discovery (Pi concatenates `AGENTS.md` / `CLAUDE.md` from global+parent+CWD — likely no
  shim needed, confirm in practice).

- _Out of scope:_ MCP (Pi excludes by design), permission-model guidance (orthogonal to ARC, user
  responsibility).

- _Scope:_ S–M (CLI recognition + skill packaging + harness-file authoring).

- _Branch:_ Own branch when promoted. Pursue when a real Pi user asks or a neighboring WU (arcd-rebrand,
  arc-modes) makes the extension cheap. No plan doc until we commit.

- _Captured during:_ WOR Task 6.3.b drain (2026-05-19).

### `[ ]` **Post-Integration Extension Fire Point**

- _Observation:_ ARC's interlock model terminates at integration-interlock — merge requires explicit human
  approval, but downstream production deployment is out of scope. Teams that want ARC-style governance over
  deploy approvals (configurable autonomy, structured-prompt approvals, audit-trail consistency with the rest
  of the session lifecycle) currently have no discoverable hook.

- _Proposed action:_ New `post-integration` (or `post-merge`) extension fire point — opt-in per project,
  declarative `.actions`, no scope creep into deploy-system specifics. Define fire-point semantics (merge
  commit vs. PR merge event vs. manual post-merge invocation); reference pattern for wiring deploy approvals
  via the structured-prompt model; decide whether `deploy-interlock` belongs in the autonomy vocabulary
  (likely not — it implies ARC owns the deploy-floor decision; extensions are the loose coupling that keeps
  ARC out of deploy-system specifics).

- _Out of scope:_ Deploy-system specifics (Spinnaker, ArgoCD, GitHub Actions, etc.), observability contracts,
  rollback semantics — adopters wire their own.

- _Scope-creep risk:_ Data migrations, schema rollouts, feature-flag toggles all want similar hooks. Design
  should treat this as one of several possible `post-*` extension points, not a unique deploy-specific
  addition. Drawing the line on what gets a dedicated fire-point vs. what adopters compose from generic
  `post-integration` is the design call.

- _Branch:_ Own branch when promoted. Pursue when a real adopter asks or auto-modes WU dogfooding shows
  demand. No plan doc until pursued.

- _Captured during:_ WOR Task 6.3.b drain (2026-05-19).

### `[ ]` **Lifecycle-aware link reanchoring for movable ARC artifacts**

- _Observation:_ In `pm.mode: arc-in-git`, lifecycle workflows move PRDs, task lists, atomic companions, plan
  docs, and archives between `backlog/`, `active/`, and `reference/archive/`. Markdown links inside moved
  files can go stale because relative paths are anchored to the source file's old directory. The pre-commit
  link validator catches the failure, but recovery is manual and interrupts activation/archive flow.

- _Proposed action:_ Combined helper + lifecycle CLI improvement — (1) constrained link-reanchor helper
  accepting explicit move pairs (or reading from staged `git mv` state), parsing Markdown links/reference
  definitions and rewriting only targets that resolve to moved ARC artifacts; (2) integrate into future
  lifecycle CLI commands for activation/archive so `npx arc` performs `git mv`, status/PM updates, and link
  reanchoring as one operation.

- _Notes:_ Keep structural, not a broad grep/replace. Helper should support `--check` and `--write`, preserve
  filename-only references, and remain scoped to arc-in-git lifecycle moves. Complements rather than replaces
  the markdown link validator guardrail.

- _Scope:_ M (helper + tests); L if bundled with full activation/archive CLI commands.

- _Branch:_ Own branch when promoted.

- _Captured during:_ WOR Task 6.3.b drain (2026-05-19).

### `[ ]` **Enhanced link validation — reference-style compliance + hook hardening**

- _Observation:_ Two related gaps surfaced when Marksman LSP integration revealed mixed link styles and stale
  cross-file references the existing `validate-links.sh` pre-commit hook didn't catch. (a) DEV-RULES.PROJECT
  § Documentation Standards prefers reference-style for cross-file links, but the codebase is mixed today.
  (b) The hook validates only staged files — when a file is moved/renamed (e.g., archival operations), broken
  outgoing links from un-staged files go undetected. A real example surfaced as a stale
  `prd-work-status-restructure.md` reference long after archival.

- _Proposed action (two lobes; can split into separate WUs if sizing demands):_
    1. **Reference-style compliance sweep** (one-time content fix) — audit `.arc/` and the
       `packages/arc-framework/arc/` mirror; convert inline `[text](../path/to/file.md)` cross-file links to
       reference-style with `---` + link block at EOF. Same-directory or one-level-up targets may stay inline
       per the rule.
    2. **Hook hardening** (recurring guard) on `validate-links.sh` — `npm run lint:links` whole-tree scan
       wired into Tier 3 + CI; expanded candidate set when commits delete/rename `.md` files (closes the
       "moved file, broken link elsewhere" gap); optional anchor validation for `file.md#section` targets;
       optional cleanups (case-sensitive reference-usage matching, duplicate `[same-key]:` definition
       detection).

- _Notes:_ Lobe 1 is a clean atomic-tier item. Lobe 2 splits into additive subtasks. Original CI-only framing
  expanded here because the local pre-commit hook is the better place for fast feedback; CI wiring becomes a
  natural follow-on once the local command exists.

- _Scope:_ M overall (S for hook hardening; S–M for the sweep depending on link volume).

- _Branch:_ Own branch when promoted.

- _Captured during:_ WOR Task 6.3.b drain (2026-05-19).

### `[ ]` **Standalone Binary Distribution (non-npm install channels)**

- _Observation:_ ARC CLI requires Node.js via npm, which limits reach to environments without Node installed.
  Not beta-blocking (npm was good enough for Claude Code's first years across all project types), but worth
  addressing as adoption grows beyond JS/TS-primary shops.

- _Research findings:_ Polyglot dev tools (lefthook, mise, just, gh) that succeed cross-ecosystem ship
  standalone binaries. TypeScript CLIs can produce these via `bun compile` or `vercel/pkg`. Distribution
  channels in order of reach: GitHub releases + curl install script, then Homebrew formula, then system
  package managers (apt, winget, scoop).

- _Proposed action:_ Investigate `bun compile` to produce single-file executables from the TypeScript CLI.
  Ship via GitHub releases with an install script. Consider a `.arc-version` file convention (like
  `.tool-versions` for mise/asdf) for team version pinning.

- _Precedent:_ Claude Code followed this exact trajectory — npm-only initially, added brew/curl/winget/irm
  later as adoption broadened.

- _Scope:_ M–L (build pipeline + cross-platform testing + install script + docs).

- _Branch:_ Own branch when promoted.

- _Captured during:_ WOR Task 6.3.b drain (2026-05-19).

### `[ ]` **CLI test coverage gaps (post-WU3 hardening cluster)**

- _Observation:_ Lower-priority test gaps identified during WU3 integration code review. None are blocking;
  all are hardening for edge cases unlikely to surface in normal use. Partial current coverage as of
  2026-05-19 (verified via codebase grep): `checkLatestVersion`, `render`, `io-context` have some tests;
  many cases below show no test.

- _Proposed action (verify each is still a gap before pursuing):_
    - **Template rendering** — unbalanced `arc:if`/`arc:endif` (stack underflow recovery), deeply nested
      conditionals, tokens containing regex metacharacters.
    - **Filesystem edges** — symlinks in `.arc/` (circular, external targets), `readdir()` / `readFile()`
      race conditions in status/diff, very large `.arc/` directories (1000+ files) performance.
    - **Network error simulation** — `checkLatestVersion` with timeout, invalid JSON, partial response.
    - **Concurrent operations** — parallel `init` + `update`, multiple developers syncing simultaneously.
    - **CLI entry-point wiring** — `writeGitNote` stdin write failures (process closes stdin early),
      `readGitNote` with corrupt refs or missing commits, spinner lifecycle edge cases (exception during
      `spinner.start` / `spinner.stop`).

- _Notes:_ Each item is small (single unit test or pair) but the cluster is unified by "post-WU3 hardening."
  Bundle as one WU rather than ~12 atomic items. Some may be stale (verify against current codebase at PRD
  time); some may have landed via incidental work since capture.

- _Scope:_ S–M total; individual items are S.

- _Branch:_ Own branch when promoted.

- _Captured during:_ WOR Task 6.3.b drain (2026-05-19).

### `[ ]` **Versioned config-key migration registry for `arc update`**

- _Observation:_ As ARC evolves, config schema changes (key renames, value enum shifts) need to migrate
  adopter `arc-config.yml` files during `arc update`. Today there's no infrastructure for chained or
  version-gated migrations — each rename inlines its own one-shot migrator directly in `update.ts`. With a
  single migration on the books (`user-sync-ux` Phase 3.2.b handles `user.sync_push` → `user.notes_push` plus
  `session.push_interlock: on-handoff` → `on-sync`), inline is fine. A second concurrent migration would
  start duplicating dispatch logic and version-gating concerns across one-shot functions.

- _Proposed action:_ Versioned migrator registry in `update.ts`. Each migration:
  `{ fromFrameworkVersion, migrate(yamlContent: string): string }`. `update` runs applicable migrations
  (selected by stored `manifest.framework_version` vs. current) before three-way merging the template against
  migrated yaml. New migrations register; old ones stay registered indefinitely (idempotent on
  already-migrated content).

- _Notes:_ Deliberately deferred from `user-sync-ux` Phase 3 in favor of the inline one-shot pattern.
  Reasoning: pre-1.0 framework with no shipped adopters means the registry's interface shape can only be
  validated against actual demand from a second migration. Building the registry on the first migration
  locks in interface assumptions that may not survive the second concrete use case.

- _Trigger:_ When a second config-key rename surfaces — likely candidates: interlock-release-wrappers WU
  (wrapper config keys), future planning-module work (PM keys), ARCd Rebrand (surface-wide renames). WU
  scope: "build the registry AND register both existing migrations" so two concrete cases inform the
  interface design. Refactoring the inline `migrateUserSyncPush` into the registry's first registered
  migration is mechanical.

- _Scope:_ S–M (registry + dispatch + version-gating tests + author doc; includes registering both existing
  migrations as the first concrete users).

- _Branch:_ Own branch when promoted.

- _Captured during:_ WOR Task 6.3.b drain (2026-05-19).

### `[ ]` **Compatibility testing across agent platforms**

- _Observation:_ ARC claims agent-agnosticism but isn't tested across platforms. WU1 ADR-003 assesses
  agent-agnosticism; this would be the validation layer.

- _Proposed action:_ Cross-platform compatibility matrix testing across the Claude / Codex / Gemini / Warp
  family (and others as the ecosystem evolves). Validate that ARC behavior is consistent — session-init,
  handoff, workflow execution, skill invocation — across harnesses.

- _Priority:_ Post-1.0.

- _Branch:_ Own branch when promoted.

- _Captured during:_ WOR Task 6.3.b drain (2026-05-19).

---
