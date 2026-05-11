# Completion: Release Wrappers — Adopter Ergonomics

- **Started**: 2026-05-09
- **Completed**: 2026-05-11
- **Branch**: technical/release-wrappers-ergonomics
- **Pull Request**: <https://github.com/andrewRCr/arc-framework/pull/32>

- **Context**: Follow-on work for interlock release wrappers, focused on adopter setup,
  posture visibility, and workflow routing ergonomics.

## Summary

This work unit turns the release-wrapper foundation into an adopter-usable workflow. It adds setup
commands, marker storage, posture reporting, structured workflow routing, documentation surfaces,
and empirical verification across the reference harnesses.

The work also collapses release-wrapper opt-in and interlock cadence settings to per-developer
configuration, matching the trust model's per-machine reality and avoiding project-level autonomy
defaults.

## Key Deliverables

- _Setup command surface_ — Added `arc release setup` subcommands for pattern printing, verification,
  install, and uninstall, backed by per-developer marker storage.

- _Posture reporting_ — Extended `arc release status` with harness setup state, active value layers,
  opt-in/interlock provenance, and resolved route classes.

- _Structured routing_ — Added the `releaseRouting` session-envelope slot and codified workflow
  class-tag routing so task commits, workflow commits, and workflow pushes consult one resolved
  decision surface.

- _Adopter documentation_ — Added the release-wrapper setup workflow, strategy documentation, initial
  setup integration, and cross-references across ARC's workflow and strategy surfaces.

- _Per-developer configuration model_ — Removed the collapsed yaml fallback for release opt-in and
  interlock cadence settings, renamed the opt-in key to `arc.releaseOptedIn`, and documented
  per-developer configuration discovery.

- _Wrapper arg-grammar forgiveness_ — `arc release push` accepts positional `<remote> <branch>`
  pairs and `-u <remote> <branch>` triples, validating against the wrapper's fixed target
  (`origin <current-branch>`); matching pairs are stripped, mismatches refuse with code 15.
  Value-taking push flags (`-o` / `--push-option`) consume their value token so it isn't misread
  as the start of a positional pair. Lets workflow prose share one invocation shape across
  `wrapper` and `raw` routing.

## Implementation Highlights

- _Workflow-as-contract setup_ — The setup workflow carries the harness-agnostic contract while
  reference implementations document Claude Code and Codex details. The CLI stays focused on
  validation, status, marker state, and pattern rendering rather than owning every harness write
  format.

- _Routing through resolved state_ — Workflows and skills no longer re-derive wrapper eligibility.
  The CLI resolves routing from opt-in and interlock values once and exposes the class-specific
  result in session envelopes.

- _Scope correction during execution_ — Mid-WU analysis showed project-level release opt-in and
  interlock defaults were the wrong abstraction for personal trust and autonomy settings. Phase 6.R
  captured the design history, amended ADR-017, and reworked code and docs to the per-developer
  model.

- _Empirical matcher verification_ — Claude Code project-scoped default-mode tests confirmed the
  allowlist behavior. Codex verification confirmed canonical wrapper patterns still match and
  showed that previously documented fall-through shell shapes now match after matcher unwrapping
  widened.

## Verification

- _Quality gates:_ Markdown lint, TypeScript lint, shell lint, typecheck, full Vitest suite, and
  tsup build all passed during the verification phase.

- _Success criteria:_ 12 of 14 met cleanly. Two were met with documented deviations: the maintainer
  empirical install path ran in bypass mode with default-prompt behavior covered through tests and
  indirect validation, and Codex matcher fall-through behavior changed in a friction-reducing way
  while preserving the wrapper validation and audit property.

## Follow-Up Work

- _opencode reference implementation_ — Promote opencode from agent-adaptive-with-caveats to a
  reference implementation once upstream permission parsing and validation behavior can support the
  setup contract reliably.

- _Potential ADR-017 follow-up_ — The optional Tier 2 ADR amendment was superseded for this WU;
  operational expansions are already covered by the shipped strategy and workflow docs.
