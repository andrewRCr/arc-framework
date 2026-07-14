# Draft: Commit-Message Submission

- **Origin:** `USER-INBOX § Work Unit`, housekeep drain (2026-07-13); recurring friction observed during
  `review-gate-enforcement-cutover` commit/review follow-up. Consolidates the overlapping release-wrapper
  invocation item formerly held by `draft-interlock-release-refinement.md`.
- **Purpose:** Make deterministic commit-message submission shell-safe, preflighted before expensive staged-content
  checks, diagnostically repairable, and cheap to retry without weakening Git's normal hooks.

## Problem

`arc release commit` validates release authority and then forwards arguments to `git commit`. Git runs the expensive
`pre-commit` hook before `commit-msg`, so deterministic message errors surface only after the staged-content gate;
every message-only retry repeats that cost. The agent-facing invocation is also easy to misuse: double-quoted `\n`
stays literal in Bash, while repeated `-m` values create paragraphs rather than controlled wrapped lines.

Observed failures include a literal `\n` collapsing body and footer into one long line, and an invalid footer
(`Task 2.4; code review`) eliciting the complete grammar rather than the closest legal alternatives. These failures
recur across sessions because the wrapper's submission interface does not make the safe path obvious or early.

## Proposed Direction

1. Make exact message stdin/file transport the canonical wrapper path, with a quoted-heredoc example. Preserve
   ordinary Git formatting and editor-driven/raw `git commit` paths.
2. For deterministic messages (`-m`, `-F`, or a first-class equivalent), assemble the exact message before
   `spawnGit` and run the canonical validator immediately. Only a valid message reaches `git commit`; the real
   `commit-msg` hook remains defense in depth.
3. Share one validator between wrapper preflight and the installed hook so grammar, limits, configuration, and
   diagnostics cannot drift. Do not silently wrap or rewrite author prose.
4. Report every offending line with message-line number, actual/max length, and a safely truncated preview. Suggest
   closest valid footer forms when deterministic, and preserve machine-stable result/exit typing.
5. Keep valid commits on the ordinary `pre-commit` then `commit-msg` hook path. Evaluate message-only content-gate
   caching only after preflight lands, keyed by every correctness input and failing closed.

## Acceptance Shape

- Invalid deterministic messages fail before `spawnGit` and staged-content checks.
- Shell-safe multiline input preserves bytes and newlines without interpolation.
- Wrapper preflight and the installed hook accept and reject the same fixtures.
- Diagnostics identify exact lines and actionable footer alternatives.
- Valid commits still run the ordinary hooks.
- Any retry cache cannot survive a change to staged tree, HEAD, hook/config implementation, or consumed worktree
  state.

## Boundaries and Coordination

- `interlock-release-refinement` continues to own release authority, provenance, and interlock routing; this WU owns
  commit-message transport and validation ergonomics.
- The existing `-F -` passthrough is a useful immediate mechanism, not by itself the durable fix.
- Raising the body-line cap alone is not a solution; reassess limits only after multiline input is ergonomic.
- Resolve `Class` during grooming. A direct invocation of the existing validator may keep the WU Light; a broader
  cross-language validator extraction or cache architecture may ratchet it upward.

---
