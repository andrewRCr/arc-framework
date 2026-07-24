# Metadata: cli-command-inputs

| **State** | **Owner** | **Branch** | **Class** | **Priority** |
| --------- | --------- | ---------- | --------- | ------------ |
| `Shipped` | `andrew`  | [none]     | `Heavy`   | `P2`         |

- **Cohort:** `cli-substrate-adoption`
- **Depends On:** [none]

- **Origin:** [internal]
- **Design:** `spec-cli-command-inputs.md`
- **Task List:** `tasks-cli-command-inputs.md`

- **Current Workflow:** [none]
- **Last Completed:** Base reconciled with `main`; command-input coverage extended over the newly landed commands
- **Next Task:** [none]
- **Blockers:** [none]

- **Next Action:** [none]

- **PR URL:** <https://github.com/andrewRCr/arc-framework/pull/347>
- **Completed:** 2026-07-24

---

## Release Notes Entry

ARC CLI input handling now follows one validated contract across interactive, CI, non-TTY, and machine-readable
invocations. Required data and protected authority stay explicit, while automation fails deterministically instead
of prompting, opening an interactive subprocess, or inferring consent.

### Added

- A global `--no-input` mode and typed, command-owned input validation across canonical command paths.
- A mechanically checked inventory linking operands, options, prompts, explicit stdin, machine-output modes, and
  interaction-capable subprocesses to their policy owners.

### Changed

- CI, non-TTY, and machine-readable execution disable interaction without granting affirmative authority; safe
  defaults, protected confirmations, and required evidence remain distinct.
- Commander arguments and prompted values parse through the same schemas, with aggregated missing-input guidance
  before dependent mutations.

### Fixed

- Pager, editor, Git, and external-process boundaries suppress ambient interaction when input is forbidden while
  preserving explicitly selected stdin payloads.
- Lifecycle, release, synchronization, and user-state commands no longer cross their mutation boundaries with
  unresolved, invalid, cancelled, or unauthorized input.

**Breaking Changes:** CLI automation that relied on CI or non-TTY execution as implicit confirmation must now pass
the command-local authority, evidence, or required-value flags named by the refusal.

## Completion Notes

The delivered command-input substrate combines an adapter-resolved interaction and confirmation context, typed
acquisition outcomes, command-owned Zod schemas, and an AST-to-declaration inventory that fails closed when a source
site or policy owner drifts. Canonical command families now validate input before dependent effects, preserve safe
defaults and explicit stdin, and keep prompt availability independent from affirmative authority.

Implementation remained within the RFC boundaries: lifecycle, synchronization, installation, release, and trust
policy stay with their existing owners; opaque Git argument arrays remain passthrough; and consumer-facing schema
publication remains separate. Base reconciliation extended the completed inventory across newly landed rename and
review commands without expanding the work unit into their domain policy.

Verification passed Markdown, TypeScript, and shell linting; source and test typechecking; the production build; and
the full repository test suite. Hosted review identified three subprocess-policy propagation gaps across release
push and the review-provider boundary; all were source-verified, corrected with focused regressions, and resolved on
the pull request.
