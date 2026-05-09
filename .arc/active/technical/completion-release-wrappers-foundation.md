# Completion: Release Wrappers — Foundation

- **Started**: 2026-05-08
- **Completed**: 2026-05-09
- **Branch**: `technical/release-wrappers-foundation`
- **Pull Request**: {pending until archival}

- **Context**: First of two work units carved from `plan-release-wrappers.md` during planning
  (foundation here, ergonomics in sibling `plan-release-wrappers-ergonomics.md`). Delivers the
  mechanical foundation hand-configured early adopters can use end-to-end; WU2 lands the setup
  helper, status integration, and workflow-driven invocation preference on top.

## Summary

Delivers the mechanical foundation for `arc release commit` and `arc release push` — release-wrapper
commands that enforce ARC interlock state at the CLI boundary, with a shared validation library, a
JSONL audit log covering both wrappers and `arc sync` retrofits, an opt-in state surface
(`arc release opt-in` / `opt-out` / `status`), and full release-mode key resolution in the
session-init envelope. ADR-017 formalizes the trust-model trade-off (defense-in-depth at harness vs.
ARC layer); ADR-018 formalizes the trigger-set interlock authorization model (`manual < on-{primary}
< on-workflow` permissiveness ladder, scope-coverage authorization rule, prompt-vs-bypass UX
framing). Documentation updates land package-source-first across DEV-RULES.ARC, AGENT-BRIEF.ARC,
QUICK-REFERENCE, and three on-demand strategies.

## Key Deliverables

- _Release-wrapper commands_ — `arc release commit` and `arc release push` wrap `git commit` /
  `git push` with mechanical interlock validation, refusal taxonomy (codes 10–14), and audit-log
  emission on every invocation. Bubble git output verbatim; refusals exit before invoking git.

- _Validation library (`src/lib/release/`)_ — five modules (interlock-validation, destructive-flags,
  wu-resolution, audit-log, types) shared by both wrappers and consumed by `handlers/sync.ts` for
  the audit retrofit. `formatRefusal()` provides single-source-of-truth refusal-message format.

- _Audit log_ — append-only JSONL at `.arc/user/{identity}/.internal/.audit-log.jsonl`. v1
  schema with discriminated `command` field (`release-commit` / `release-push` / `sync`),
  per-command `outcome.kind` shape, sanitized argv (commit-message bodies redacted), resolved
  interlock provenance, and active-WU pointer. jq-parseable, grep-friendly.

- _Opt-in state surface_ — three sub-commands (`arc release opt-in` / `opt-out` / `status`)
  record/report the per-developer `arc.release.enabled` git-config flag. Symmetric opt-in/opt-out
  (opt-out writes explicit `"false"` rather than unsetting), so per-developer override holds
  against yaml-set `release.enabled: true`.

- _Session-init envelope expansion_ — `config.value.settings` carries resolved values for the full
  release-mode key surface (`commit_interlock`, `push_interlock`, `sync_interlock`, `notes_push`,
  `release.enabled`), eliminating latent yaml-only / handler-resolved inconsistency. Three-tier
  resolution (yaml → git-config → default) consistent across all five keys.

- _Sync audit-log retrofit_ — `arc sync` joins the audit-log umbrella. Every executed sync run
  records one entry; refused-cell paths map onto the wrapper refusal taxonomy (`blocked-*` cells
  → code 14); per-leg state compresses into a grep-friendly `action:result[:detail]` token. Sync's
  process exit code is unchanged for backwards compat; only the audit-entry shape joins.

- _ADR-017 (trust model)_ — defense-in-depth at harness vs. ARC layer; six R12 content sections
  mapped onto the standard ADR template; sync-as-precedent framing; bypass universality clause for
  future ARC commands invoking git internally.

- _ADR-018 (interlock authorization)_ — trigger-set permissiveness ladder, scope-coverage
  authorization rule (`permission ∩ scope ≠ ∅ → authorize, else refuse(11)`), prompt-vs-bypass UX
  framing, two-layered trust model (mechanical wrapper / agent judgment).

- _Documentation surface_ — DEV-RULES.ARC § Commit Discipline (release-wrapper invocation bullet
  with on-workflow + harness-bypass framing); AGENT-BRIEF.ARC § How ARC Works (release wrappers as
  canonical commit/push shape under workflow guidance when active); QUICK-REFERENCE § ARC CLI
  Commands (new Release Wrappers subsection covering all five commands); three on-demand strategy
  updates (configurability-architecture, session-operations, team-coordination) for the
  `on-workflow` interlock-value extension and release-wrapper layer.

## Implementation Highlights

- _Schema-violation vs. I/O-failure asymmetry_ — audit-log writer splits failure modes by error
  class. Schema violations throw (programmer errors should be loud at test time, structurally
  hard to hit under correct types). I/O failures return result envelopes (audit logging is sidecar
  to release wrappers and `arc sync`; an audit-write failure should not propagate up and mask a
  successful commit/push).

- _Hand-rolled schema validation_ — chose against zod/valibot/ajv because audit entries are
  constructed in-process by typed handler code against the `AuditEntry` discriminated union;
  compile-time checks cover most surface, runtime validation is defensive. Validator uses
  exhaustive switches with `: never` defaults on every discriminator (catches taxonomy drift in
  `types.ts`); round-trip test catches validator drift. Revisit triggers documented (schema v2,
  external JSONL consumers, third runtime-validation site).

- _Pre-commit CHECK 9 tiering_ — Phase 6 sweep strengthened the meta-reference regex with tiered
  patterns: strict tier (`PRD R[0-9]+`, `[RB][0-9]+`, plus `§` followed by a literal space)
  applies to all staged code including tests; broad tier (`Task X.Y`, `Phase N`, `.arc/`,
  movable-artifact cross-references) skips test files via the existing `hooks.test_patterns`,
  preserving parser-test fixture data. Closed the gap that let pre-existing R-codes and `§`
  citations ship in earlier WUs.

- _Refusal short-circuit ordering_ — cheapest checks fire first to minimize I/O on common refusal
  paths. Code 12 (argv-time, no I/O) → code 10 (fs probe) → code 13 (git + config read) → code 14
  (push only — pushability matrix) → code 11 (full config resolve). First-match wins.

- _CLI rename mid-WU (Task 6.2.0)_ — surfaced during Phase 6 doc-writing that the original
  `arc release record-enabled` / `record-disabled` verbs underdelivered on the per-developer-override
  scope, and that `record-disabled` actually unset the local git-config key (breaking symmetric
  override against yaml-set `release.enabled: true`). Renamed to `opt-in` / `opt-out` with
  symmetric `"false"` write semantics. Discovered-during-execution refinement; matched the PRD
  and ADR-017's canonical "opt-in" vocabulary.

- _PRD Open Questions resolved_ — R15 refusal-message harmonization closed by 1.5's upfront
  `formatRefusal()` helper stubbing per F2-E (Task 6.3 audit confirmed no drift, marked `[~]`
  superseded). Opt-in signal source held at per-developer git-config; revisit deferred to WU2 if
  setup-helper finds reason to record state elsewhere. Documentation terminology locked at WU1
  per the PRD's discipline note.

## Verification

- _Quality gates:_ markdown lint, TypeScript lint, shell lint, typecheck, vitest unit /
  integration / e2e, tsup build — all passed.

- _Success criteria:_ 11 of 11 dispositioned — 9 `[x]` Met, 2 `[~]` Superseded with bypass-mode
  deviation note. Empirical criteria 5/6 (`arc release commit --version` runs no-prompt under
  installed allowlist; env-prefix fall-through prompts in Codex) couldn't run meaningfully against
  the maintainer's `bypassPermissions` Claude Code session — the matcher-observation methodology
  assumes a prompting-default harness. Deferred to WU2's setup-helper testing path against fresh /
  default-mode harnesses; canonical capture in `plan-release-wrappers-ergonomics.md` § Harness
  Permission Mode.

## Follow-Up Work

- _Empirical harness-allowlist verification (deferred from criteria 5/6)_ — runs as part of WU2's
  setup-helper test surface, which exercises mode-aware allowlist install and observes prompt
  behavior under default-mode harnesses. Codex-side matcher boundary already documented from
  codex-cli 0.128.0 verification on 2026-05-07 (`plan-release-wrappers-ergonomics.md`
  § Per-Harness Viability).

- _ADR-017 amendment (optional, Tier 2)_ — dated annotation in Consequences capturing the
  harness-mode dimension surfaced during Phase 7 verification. Optional; deferred until WU2
  integration if it surfaces broader insights worth bundling.

- _Atomic-inbox capture (watch-and-wait)_ — prefix-selection checklist tightening for
  `process-task-loop.md`'s pre-report checklist. First observed occurrence; defer implementation
  until recurrence confirms recurring drift rather than one-off attention lapse.
