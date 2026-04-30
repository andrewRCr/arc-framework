# Completion: Interlock Foundation

- **Started**: 2026-04-29
- **Completed**: 2026-04-30
- **Branch**: `technical/interlock-foundation`
- **Pull Request**: _(added after `gh pr create` in integrate-work-unit Step 7)_

- **Context**: Constitutional foundation for ARC's interlock model — five downstream plans
  (`plan-user-sync-ux`, `plan-quality-gate-hooks`, `plan-worktree-foundation`,
  `plan-concurrent-work-conventions`, `plan-agile-wu-lifecycle`) were blocked on a stable frame
  for session-operational flow. ADR-016 ratified the model; this WU lands the methodology surface.

## Summary

Establishes ARC's interlock model end-to-end — vocabulary rename, DEV-RULES holistic redraft,
strategy-doc cascade, configuration axis (`session.autonomy`), composite handoff probe,
planning-session active surface, structured task-completion prompts as base behavior, status-file
timing rule, and rollback protocol. Auto-commit and auto-push behavior are sibling-WU territory
(`session-operational-flow`); this WU ships the frame they consume. Validation runs in a
post-integration window (between WU-A integration and WU-B activation) per `notes-interlock-foundation.md`.

## Key Deliverables

- _Constitutional frame_ — DEV-RULES.ARC redrafted under the at-session-relevance filter:
  interlock vocabulary woven into existing rule sections (`task-interlock`, `commit-interlock`,
  `push-interlock`, `integration-interlock`); two new invariants (integration-interlock,
  cascade-undo); commit/push triggering reframed around configurable autonomy; status-file timing
  rule replaces the prior "Work status accuracy" provision. Strategy cascade applied to
  `strategy-team-coordination`, `strategy-session-operations` (now the conceptual interlock-model
  home), and `strategy-configurability-architecture`.

- _Configuration axis_ — `arc-config.yml` ships `session.autonomy: manual-commit | auto-commit |
  auto-push` (default `manual-commit`) with per-developer override via `git config arc.autonomy`.
  `lib/autonomy-policy.ts` mirrors `lib/sync-policy.ts` shape; resolved value surfaces on the
  session-init probe as `config.value.autonomy: { value, source }`.

- _Composite handoff probe_ — `arc status --session-handoff --json` returns a self-contained
  envelope. New `lib/git/dirty-state.ts` and `lib/git/head-hash.ts` resolvers; reuses
  session-init's slot machinery for worktree, user, autonomy, syncPush, and active. `arc-handoff`
  reads from this envelope rather than chaining ad-hoc git commands.

- _Planning-session active surface_ — `template-status.md` adds `Spec` (polymorphic pointer),
  `Sibling Work Unit(s)`, and `State: Planning` value. `activate-planning-branch.md` creates the
  status file at planning activation; `activate-work-unit.md` Step 4 is idempotent (transitions
  existing or creates from template); `integrate-planning-branch.md` handles disposition
  (graduated retains, shelved removes). Probe `sessionType` inference reads `State: Planning` as
  primary signal with branch-pattern fallback for orphans.

- _Status-file timing rule_ — `3_process-task-loop.md` no longer touches the status file at task
  completion. Lifecycle workflows stage status updates with their ceremony commits per the
  staging-as-test rule (status rides with concurrent ceremony content; dedicated `chore(status):`
  only when status is the entire staged change). `prepare-commits.md` and `arc-commit/SKILL.md`
  aligned. `session-handoff.md` restructured around the composite probe with the push-ordering
  invariant (worktree before notes) formalized. Hook cascade closed: pre-commit CHECK 10 and
  commit-msg Rule 7 (the prior "advance status at commit time" enforcement) retired in
  pre-merge sweep; volatility-vs-derived-state rationale captured inline in
  `strategy-session-operations.md` § Status-File Timing with deeper alternative-analysis staged
  for docs-site sweep (`notes-docs-content-sweep.md` Entry 71).

- _Structured task-completion prompts_ — base behavior across all autonomy modes. Default
  `Proceed to Task X.Y?` (manual-commit), boundary-aware variants at phase/WU end, plus
  P1.b QG-failure variant `Quality gates failed: <details>. Investigate? (y / iterate)`. Prefix
  reads `session.autonomy` for forward-compat with auto-commit modes shipping in the sibling WU.

- _Validation surface_ — pre-commit CHECK 16 (`validate-status-spec.ts`) enforces the pinned
  `Spec` shapes (empty / `[none]` / bare-basename `.md` / `https?://`) on staged active status
  files. Validation-window plan and in-flight observation log captured in
  `notes-interlock-foundation.md`.

## Implementation Highlights

- _DEV-RULES at-session-relevance filter_ — Every byte in DEV-RULES.ARC has cumulative
  context-budget cost across all sessions, agents, and adopters. The redraft passed all content
  through "is this a rule the agent must respect at session-time?" before keeping it. Conceptual
  model, configurability architecture, and design rationale relocated to strategy docs
  (load-on-demand) and ADR-016 (internal). No new top-level § Autonomy Stack section.

- _Agent-consumed vs CLI-consumed override split_ — `session.autonomy` surfaces as a separate
  top-level probe field with provenance (`{ value, source }`); the bulk `settings` map stays raw
  yaml. Agent renders the structured prompt and needs the resolved value at session-init.
  CLI-consumed overrides (`user.sync_push` and future siblings) resolve at action time inside CLI
  code paths. Per-key classification, not a broader pattern shift.

- _Composite probe machinery reuse_ — `--session-handoff` is a new mode passing a different
  field-set to the same composite logic in `handlers/status.ts`. Six spec'd slots plus `identity`
  (for session-init shape consistency) and `head` (folded in via atomic task to avoid a separate
  `git rev-parse` call from the workflow). Self-contained envelope matters because `arc-handoff`
  is skill-invoked — skills load fresh; the workflow shouldn't depend on session-init context
  still being intact.

- _Resolver consolidation deferred_ — `lib/autonomy-policy.ts` lands as a literal parallel of
  `lib/sync-policy.ts`. Generic `resolveGitConfigOverride<T>` waits for the third concrete toggle
  in [plan-user-sync-ux][plan-sync] (worktree push); designing the abstraction against three real
  shapes is cheaper than two-and-refactor.

- _Staging-as-test commit shape rule_ — Replaced the prior "always dedicated `chore(status):`"
  framing. Status rides with concurrent ceremony content (file moves, completion doc, PRD save,
  archival) when other content is staged; dedicated commit only when status is the entire staged
  change. The staging area is the test. Cuts one commit per ceremony for adopter friction
  reduction, especially under manual-commit autonomy.

- _Status file as unified WU pointer artifact_ — `Sibling Work Unit(s)` lives on the status file
  rather than the PRD. The status file is read at every session-init via `## Active Work` for
  orientation and persists into archive under
  [plan-completion-status-consolidation][plan-csc] as the WU's terminal record. Pointer artifacts
  carry pointer state; requirements artifacts carry requirements.

- _Push-ordering invariant_ — Worktree-push lands before notes-push when both fire at handoff.
  Notes attach to commits that must already exist on origin; reverse ordering produces the
  `user.sync_push: always` incoherence the sync-UX plan exists to fix. Documented in
  `strategy-session-operations.md` and enforced by workflow ordering, not config.

- _PRD Open Questions resolved_ — (1) Validation window length: 3 sessions (Phase 5.3,
  `notes-interlock-foundation.md`). (2) Probe envelope shape: 8 slots final (6 spec'd + `identity` +
  `head`); deviation captured against the original 6-slot spec. (3) QG-failure prompt phrasing:
  `Quality gates failed: <details>. Investigate? (y / iterate)` shipped (Phase 4.1.c).
  (4) Enum verbosity: verbose form (`manual-commit | auto-commit | auto-push`) shipped; switch to
  terse form deferred unless dogfooding surfaces a clear win.

## Verification

- _Quality gates:_ Tier 3 clean — markdown lint, TypeScript + shell lint, typecheck (source +
  test), unit + e2e test suites, build — all passed.

- _Success criteria:_ 19 of 26 met. Two with deviation notes — composite probe envelope returns
  8 slots not the spec'd 6 (added `identity` for session-init shape consistency and `head` from
  atomic task folding rev-parse into the probe); 1 self-host status file migrated in place, not
  the spec'd "two existing in-flight" (only one extant at migration time). Seven marked `[~]`
  deferred to the post-integration validation window per Phase 5.3 design — they gate WU-B
  activation, not WU-A archive.

## Follow-Up Work

- _Validation window (post-integration)_ — Three self-host sessions exercising the new frame
  between WU-A integration and WU-B activation, per `notes-interlock-foundation.md`. The seven
  `[~]` success criteria reach `[x]` as their dominant paths fire in practice. Adjustments
  surfaced during the window route per § Failure-Mode Handling in the notes file.

- _Sibling WU `session-operational-flow`_ — Auto-commit and auto-push behavior implementations
  consume this frame. The configuration axis ships here; what `auto-commit` actually does when
  configured is sibling-WU work.

- _Resolver consolidation (`resolveGitConfigOverride<T>`)_ — Deferred to
  [plan-user-sync-ux][plan-sync] when the third concrete toggle (worktree push) lands.

- _Secondary-machine harness sync for arc-\* SKILL.md_ — Two cumulative changes (Task 5.4
  arc-handoff thin-dispatch; atomic-task description-tightening across all 8 skills) need
  hand-syncing to the secondary machine's `.claude/skills/` and `.codex/skills/` mirrors.
  Tracked in SESSION-NOTES persistent context.

- _arc-setup harness-menu visibility_ — Atomic task surfaced that `arc-setup` doesn't appear in
  the Claude Code skill menu while other arc-\* skills do. Likely tied to
  `disable-model-invocation: true` in its frontmatter; investigation deferred.

---

[plan-sync]: ../../backlog/technical/plan-user-sync-ux.md
[plan-csc]: ../../backlog/technical/plan-completion-status-consolidation.md
