# Draft: Commit Message Ergonomics

- **Purpose:** Harden the release-wrapper commit preflight against a confirmed effective-hook detection defect, and
  settle deterministic message formatting for machine-authored commit messages so structured input stops bouncing
  off `commit-msg` after the full pre-commit gate has already run.
- **Origin:** routed from `USER-INBOX § Work Unit` at housekeep drain (2026-07-16); captured during
  `husk-lifecycle-drivers` Phase 2 deferred review, after two overlong deterministic commit bodies bypassed wrapper
  preflight and were rejected only by `commit-msg`.

---

## Problem

Two related commit-message ergonomics concerns.

**Confirmed preflight defect.** Deterministic repeated-`-m` input with an overlong body ran the full pre-commit
gate before `commit-msg` rejected it. The wrapper's `prepare-commit-msg` probe sees Husky's executable
`.husky/_/prepare-commit-msg` dispatcher and demotes preflight even though the effective repo hook
`.husky/prepare-commit-msg` is absent.

**Formatting design question.** The rejected messages exposed a gap: one `-m` value becomes one unwrapped
paragraph, leaving agents to count or manually reflow lines despite ARC already knowing the message's
subject/body/trailer structure.

## Approach

Fix effective-hook detection and add a Husky-managed self-hosting regression proving invalid deterministic input
refuses before staged-content hooks run.

In the same design, evaluate deterministic formatting for machine-authored messages: prefer an explicit formatter
or prepared-file composition path over silent mutation of arbitrary author bytes; wrap plain body paragraphs near
72 characters while preserving the subject, final trailers, lists, code/preformatted blocks, and URLs. Settle
whether this belongs in `arc-commit`, an opt-in release-wrapper flag, or an auto-fix/retry artifact emitted with
diagnostics. File-backed messages without an explicit formatting request should remain byte-preserving.

## Files

`handlers/release/commit-cli.ts`, `lib/release/commit-message-assembly.ts`, commit-message diagnostics and E2E
coverage, plus the `arc-commit` / `commit-format` guidance if formatting is agent-side.
