# ARC Framework Project Status

Project state and record — what's been accomplished, what's actively in progress, and
what's next. This is the document to share when someone asks "where does the project
stand?" For planning and reasoning (sequencing strategy, dependency analysis, scoping
decisions), see [ROADMAP.md][roadmap].

## Status Snapshot

Current state at a glance. Updated when work is activated, completed, or archived.

**Last Completed:**

- Interlock Release Wrappers — Ergonomics (WU2, technical) — Adopter ergonomics layer atop the
  WU1 mechanical foundation: `arc release setup` subcommand tree (verify / install / uninstall /
  print-patterns) with per-developer marker storage, `arc release status` posture reporting with
  route-class resolution, structured `releaseRouting` session-init envelope slot, workflow class-tag
  routing (`taskCommit` / `workflowCommit` / `workflowPush`) consulted at fire-sites, per-developer
  configuration collapse (interlocks + opt-in moved to git-config-only, renamed to
  `arc.releaseOptedIn`), adopter setup workflow + strategy doc + initial-setup integration, and
  wrapper arg-grammar forgiveness for positional `<remote> <branch>` pairs / `-u` triples /
  value-taking push flags (`-o`, `--push-option`).
    - Archive: `archive/2026-q2/technical/09_release-wrappers-ergonomics/`

**Currently Active:**

- Work Organization Reform (technical) — Planning. Constitutional reform of WU lifecycle:
  single-branch-per-WU model (planning branch IS WU branch through entire lifecycle), Conventional
  Branch alignment (retire `feature/`/`technical/` prefixes for `feat/`/`fix/`/`chore/`/etc.),
  sweep-as-you-go integration foundation, status-file location-by-state convention, optional
  group dirs in `backlog/` for codified multi-WU groups. Delivers per-worktree isolation as a
  structural precondition for Worktree Foundation. Spec:
  `active/technical/plan-work-organization-reform.md`; branch:
  `technical/plan-work-organization-reform`.

**Next Priority:**

- After Work Organization Reform: Worktree Foundation — Mechanism layer for parallel and mobile
  work; extracts shift lifecycle (mode-universal infrastructure), adds worktree-aware shift,
  gives session-init worktree context awareness including branch-gone detection. Plan:
  `backlog/technical/plan-worktree-foundation.md`.
- Then: Parallelism trio downstream of Worktree Foundation — Agile WU Lifecycle, then Concurrent
  Work Conventions; Coord Probe and arc-plan Conductor parallelizable.
- Then: Per-Developer Configuration Storage Architecture — three-tier storage model (global
  `~/.arc/config.yml` for identity; in-repo gitignored per-user file synced via user-notes for
  interlocks/opt-in; per-machine `.local/` for install markers + audit log). Plan:
  `backlog/technical/plan-config-storage-architecture.md`.
- Then: ARCd Rebrand — Public product brand split (ARCd for product, ARC for methodology) with
  absorbed config-key renames and CLI command cleanup.
- Then: ARC Operating Modes (ARC Lite + local/untracked).

## Completed Major Work

### Interlock Release Wrappers — Ergonomics (May 2026)

Adopter ergonomics layer atop the WU1 mechanical foundation. Turns the wrappers into a
usable-by-default surface: setup commands, harness allowlist contracts, posture reporting,
structured workflow routing, and a per-developer configuration model that matches the
wrappers' per-machine trust reality.

- `arc release setup` subcommand tree (`verify` / `install` / `uninstall` / `print-patterns`)
  backed by per-developer marker storage at `.arc/user/{identity}/.internal/release-setup.json`;
  workflow-as-contract pattern keeps the CLI focused on validation/status while reference
  harness implementations (Claude Code, Codex CLI) carry the per-harness write details
- `arc release status` extended with harness setup state, active value layers, opt-in/interlock
  provenance, and resolved route classes; surfaces the wrapper-vs-raw decision per fire-site
- `releaseRouting` session-init envelope slot carrying `{taskCommit, workflowCommit,
  workflowPush}` route classes + provenance; workflows and skills consult one resolved
  decision surface instead of re-deriving wrapper eligibility per fire-site
- Workflow class-tag routing rule codified in DEV-RULES.ARC: backtick-wrapped class tags
  (`` `taskCommit` ``, `` `workflowCommit` ``, `` `workflowPush` ``) at fire-sites resolve to
  `wrapper` vs `raw` via the envelope; off-workflow commits stay raw `git` regardless of opt-in
- Per-developer configuration collapse (Phase 6.R mid-WU scope correction): four formerly
  dual-scope keys (`commit.commit_interlock`, `commit.push_interlock`, `session.sync_interlock`,
  `release.enabled`) moved to git-config-only storage; opt-in key renamed to `arc.releaseOptedIn`;
  ADR-017 amended to reflect the per-developer trust-model alignment
- Adopter documentation: `setup-release-wrapper.md` workflow (harness-agnostic contract with
  Claude Code + Codex reference implementations inline), `strategy-interlock-release-wrappers.md`,
  initial-setup workflow integration, cross-references across ARC's workflow and strategy surfaces
- Wrapper arg-grammar forgiveness: `arc release push` accepts positional `<remote> <branch>`
  pairs and `-u <remote> <branch>` triples, validating against the wrapper's fixed
  `origin <current-branch>` target (matching pairs stripped, mismatches refuse with code 15);
  value-taking flags (`-o`, `--push-option`) consume their value token so it isn't misread as
  the start of a positional pair. Lets workflow prose share one invocation shape across
  `wrapper` and `raw` routing
- Empirical matcher verification: Claude Code project-scoped default-mode tests confirmed
  allowlist behavior; Codex verification confirmed canonical wrapper patterns still match and
  that previously-documented fall-through shell shapes now match after matcher unwrapping widened

### Interlock Release Wrappers — Foundation (May 2026)

Mechanical foundation for `arc release commit` and `arc release push` — interlock-validating
wrappers around `git commit` / `git push`, JSONL audit log shared with `arc sync`, opt-in
state surface, and full release-mode key resolution in the session-init envelope.

- `arc release commit` and `arc release push` wrap `git commit` / `git push` with mechanical
  interlock validation, refusal taxonomy (codes 10–14), and audit-log emission per invocation
- Validation library `src/lib/release/` (interlock-validation, destructive-flags,
  wu-resolution, audit-log, types) shared by both wrappers and consumed by `handlers/sync.ts`
  for the audit retrofit; `formatRefusal()` as single-source-of-truth refusal-message format
- Append-only JSONL audit log at `.arc/user/{identity}/.internal/.audit-log.jsonl` — v1 schema
  with discriminated `command` field (`release-commit` / `release-push` / `sync`),
  per-command `outcome.kind`, sanitized argv (commit-message bodies redacted), resolved
  interlock provenance, active-WU pointer; jq-parseable, grep-friendly
- Opt-in state surface: `arc release opt-in` / `opt-out` / `status` record/report the
  per-developer `arc.releaseEnabled` git-config flag with symmetric write semantics — opt-out
  writes explicit `"false"` rather than unsetting, so per-developer override holds against
  yaml-set `release.enabled: true`
- Session-init envelope expanded with full release-mode key surface (`commit_interlock`,
  `push_interlock`, `sync_interlock`, `notes_push`, `release.enabled`); three-tier resolution
  (yaml → git-config → default) consistent across all five keys
- Sync audit-log retrofit: `arc sync` joins the audit-log umbrella; refused-cell paths map
  onto the wrapper refusal taxonomy; per-leg state compresses into `action:result[:detail]`
  tokens
- ADR-017 (release-wrapper trust model — defense-in-depth at harness vs. ARC layer;
  sync-as-precedent framing; bypass-universality clause) and ADR-018 (trigger-set interlock
  authorization — `manual < on-{primary} < on-workflow` permissiveness ladder, scope-coverage
  authorization rule, prompt-vs-bypass UX framing)
- Pre-commit CHECK 9 strengthened with tiered meta-reference patterns: strict tier
  (`PRD R[0-9]+`, `[RB][0-9]+`, plus `§` followed by a literal space) applies to all staged
  code including tests; broad tier skips test files via `hooks.test_patterns`

### User Sync UX Polish (May 2026)

State-machine unification, hardened paired-push contract, vocabulary alignment, and
envelope-driven workflow rendering for the user-notes sync surface.

- Shared `UserSyncSpine` (`clean | remote-ahead | conflict | disabled | remote-unavailable`)
  consumed by full status, session-init, and `inspectUserSyncState`; disk staleness, saved
  age, note-history distance, and partial-push recovery layer as detail axes
- Notes-ref-history walk: `arc user load` / `arc user pull` discover the newest readable
  note by walking `refs/notes/arc/user/{identity}` history, preserving notes attached to
  commits no longer reachable from HEAD's first-parent walk
- Verified-save postcondition: `runUserSave` reads back the just-written note and
  hash-compares against the just-serialized manifest before `.sync-state.json` advances
- `arc sync` orchestrator dispatches the 6-cell matrix (worktree × notes); `arc user sync`
  preserved as the notes-only direction-aware command. Paired-push saves before either leg,
  refuses on `force-push-required` advisory, and surfaces partial-push failures with
  itemized output and idempotent recovery
- `arc sync --json` envelope: single JSON object on stdout across all return paths;
  `interlockState` carries resolved policy with provenance; stdout purity guarded by the
  `SyncOutput` boundary wrapper
- Config-key vocabulary alignment: `user.sync_push` → `user.notes_push`;
  `push_interlock: on-handoff` → `on-sync`; `session.sync_interlock` added with
  `manual | on-handoff`; `arc update` migrates legacy values in place
- Per-developer interlock overrides (`arc.commitInterlock`, `arc.pushInterlock`,
  `arc.syncInterlock`, `arc.notesPush`) plumb through `resolved-settings.ts` with
  `{value, source}` provenance
- Pre-composed envelope strings (`recommendedAction`, `recommendedPromptText`,
  `recommendedCombinedPrompt`, `recommendedSummaryLine`, `restateCandidates`) so workflow
  prose renders verbatim instead of branching
- Library seams for the next WU's wrapper commands: `lib/git/push-worktree.ts`,
  `lib/git/pushability.ts`, `commands/user/paired-push.ts`, `lib/sync-output.ts`

### Interlock Foundation (April 2026)

Constitutional frame for ARC's interlock model — vocabulary, configuration axis, probe
surface, structured prompts, and timing rules — that downstream session-operational
plans build on.

- DEV-RULES.ARC redrafted under at-session-relevance filter; interlock vocabulary woven
  into existing rule sections; new invariants (integration-interlock, cascade-undo);
  commit/push triggering reframed around configurable autonomy
- `session.autonomy: manual-commit | auto-commit | auto-push` configuration axis
  (`arc-config.yml` + per-developer `git config arc.autonomy` override); resolver
  surfaces on session-init probe with provenance
- Composite handoff probe (`arc status --session-handoff --json`) — self-contained
  envelope (8 slots) so `arc-handoff` is fresh-load safe; new `lib/git/dirty-state.ts`
  and `lib/git/head-hash.ts` resolvers
- Planning-session active surface — `template-status.md` adds Spec, Sibling Work
  Unit(s), and `State: Planning`; `activate-planning-branch.md` creates status file at
  planning activation; probe `sessionType` inference reads `Planning` as primary signal
- Status-file timing rule — task completion no longer touches the status file; lifecycle
  workflows stage status updates with their ceremony commits per the staging-as-test rule
- Structured task-completion prompts as base behavior across all autonomy modes; prefix
  reads `session.autonomy` for forward-compat with auto-commit modes
- Pre-commit CHECK 16 (`validate-status-spec.ts`) enforces pinned Spec shapes on staged
  active status files

### Session-Init Optimization (April 2026)

Reduced session-init token cost from ~75–80k baseline toward a ≤60k orientation target,
with constitutional and CI machinery in place to prevent drift recurrence.

- Per-file methods/extensions architecture (`system/methods/*.md`, `system/extensions/*.md`)
  replacing the legacy aggregate files; method bodies load on workflow trigger, extensions
  enumerated once at session-init
- Workflow YAML frontmatter trigger contract (`arc.methods`, `arc.extensions`); constitutional
  rule pair anchors compliance (DEV-RULES.ARC § Verification + strategy-workflow-authoring
  § Author-side Declaration Rule); pre-commit + CI enforcement (CHECK 11/13/15, lint:arc:*)
- Probe-side `sessionType` inference computed from tracked status fields (`planning |
  execution | integration | null`) drives conditional item-9 / item-10 loadsets in
  session-init.md; SESSION-NOTES `**Session Type:**` is opt-in personal-layer override
- Partial-read narrowing: QUICK-REFERENCE scoped to Environment & Path Context; status file
  to `## Work Unit Metadata`; task list strategic partial read with triple-anchor task references
- Worktree-sync completion in composite probe; research-validated rejection of an `always`
  worktree-pull mode
- Operational-context audit (Tier 1–3) across constitution, briefs, strategies, workflows;
  template extractions (template-tasks.md); ADR-013 Tier 2 amendment

### Work-Status Restructure (April 2026)

Replaced singular `active/WORK-STATUS.md` with per-WU `active/{category}/status-{name}.md` files,
disentangling the project pointer from the session pointer.

- ADR-007 Tier 2 Amendment: per-WU project pointer distinct from per-developer session state
- New `template-status.md` with `**State:**` as the load-bearing lifecycle marker
- New `deactivate-work-unit.md` workflow (Case A primary; B/C/D via routing pointers)
- Nine workflow files updated for per-WU status discovery, travel across rotating branches, archive deletion
- SESSION-NOTES `**Working On:**` field with four-marker vocabulary
- Meta-circular dogfood: Phase 3 live migration of this WU's own state onto the new model
- Six atomic tasks alongside planned work (husky pre-commit fix, CI framework-sync drift check, etc.)

### Methodology Maturation (April 2026)

Settled methodology/implementation boundary, content architecture, and update behavior.

- Standalone methodology summary with 10 grey area resolutions (methodology vs convention)
- CLI update fix: Framework files wholesale-replaced, eliminating merge conflicts
- Strategy docs split: ~5,350 → ~2,970 local / ~2,380 docs site. 13 strategies consolidated to 9
- Two new skills: arc-task-review (post-task structured review), arc-plan (collaborative exploration)
- Package-project sync safeguard: dependency map, pre-commit hook, DEV-RULES.PROJECT guard
- Docs site restructured: Methodology/Framework/Customization nav split

### Beta Readiness (April 2026)

Prepared the framework for multi-week beta testing on an external project.

- Migrated dev repo from ad-hoc `.arc/` to a real `arc init` installation
- Contributor role support: ADR-014, AGENT-BRIEF.CONTRIBUTOR, role-aware hooks and session-init
- Docs site skeleton: MkDocs Material + GitHub Pages, navigation structure, CI deployment
- npm beta publish: `@arc-framework/cli@0.1.0-beta`, granular token auth
- Public-facing scaffolding: repo rename, README rewrite, license, branding (ARC tagline)

### CLI Implementation Beta (March 2026)

Built the `@arc-framework/cli` npm package (`0.x` beta).

- TypeScript CLI with Commander: `init`, `update`, `status`, `diff`, `user`, `log` commands
- Interactive init via @clack/prompts: project config, tool selection, PM mode, team mode
- Three-way merge update system with pristine store and manifest tracking
- Agent tooling generation: skills and config files for Claude, Codex, Gemini, Copilot, etc.
- 358+ tests across unit, integration, and E2E tiers

### Core Philosophy & Configurability Architecture (February 2026)

Resolved all foundational 1.0 design decisions.

- 6 ADRs (ADR-001 through ADR-006) covering principles, configurability, file taxonomy
- Core philosophy strategy: 11 principles (P1-P11), philosophical foundation, positioning
- Configurability architecture strategy: 19 conventions, 3 customization mechanisms
- 5 research files (agent landscape, context degradation, methodology)
- Constitutional doc refresh: META-PRD rewrite, AGENT-BRIEF.PROJECT.md update

### Structural Readiness Pass (February 2026)

Restructured the framework for distribution readiness.

- Directory restructuring: `reference/` split into `reference/` + `system/`
- File naming: 16 `.example.md` → `.template.md`
- DEVELOPMENT-RULES separation: methodology extracted to strategy doc (template -68%)
- New strategies: file-classification, backlog-organization, team-coordination
- Configurable branching model: `arc-config.yml`, planning branches, three protection modes
- Team mode structure: `team/` directory, `(@name)` ownership, external tracker integration

### Content Refinement Pass (February 2026)

Systematic content quality improvement across all template files.

- 37 files reviewed and improved for agnosticism and template quality
- Streamlined heavyweight docs: atomic-commit (-70%), maintain-task-notes (-58%)
- Co-development guidance, deferred review protocol, layered commit architecture

### Dual-Maintenance Sync (February 2026)

Accumulated improvements from arc-portfolio project development.

- Tiered quality gates strategy (Tier 1/2/3 system)
- Letter numbering standardization at third level (X.Y.a)
- Expanded commit format skill and githook validation
- New workflows: activate-work-unit, PRD header metadata

### CineXplorer Sync (December 2025)

Synced 2+ months of refinements from CineXplorer project usage.

- Infrastructure, workflows, agent files, constitution, and strategies aligned
- Multi-agent support added (.claude, .codex, .gemini directories)

### Foundation (October 2024)

Initial framework structure and infrastructure.

- Repository migration from Windows to WSL
- Template-first constitutional documents (META-PRD, AGENTS, DEV-RULES, etc.)
- Terminology refactoring (Sub-PRD → PRD)
- Framework development infrastructure: markdown linting, CI, atomic commits, session management

## Project Health Indicators

- **Quality**: 100% markdown linting compliance, clean git history
- **Maturity**: Battle-tested through multi-project usage (CineXplorer, arc-portfolio)
- **Documentation**: Comprehensive templates with inline guidance
- **Self-Hosting**: Framework successfully develops itself using ARC methodology

---

[roadmap]: ../backlog/ROADMAP.md
