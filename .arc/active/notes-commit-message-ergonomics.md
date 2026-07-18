# Notes: commit-message-ergonomics

## Contents

- Files map — concrete touch list for task generation
- Commit-history scan — evidence grounding the wrapping scope boundary
- Alternatives considered — resolved forks and lesser transport options

## Files map

Implementation surface (paths under `packages/arc-framework/src/`):

- `handlers/release/commit-cli.ts` — route the `prepare-commit-msg` presence check through the manager
  abstraction instead of the raw `hasPrepareCommitMsgHook` git-path probe.
- `lib/hook-manager.ts` / `lib/hook-integration.ts` — add the `hasEffectiveHook(name)` helper (detection sibling)
  and the per-manager effective-hook rules.
- `lib/release/commit-message-assembly.ts` — extend `assembleCommitMessageParagraphs` with the greedy wrap
  (paragraphs + flat list items, hanging-indent continuation, structured-rare preserved), width-parameterized.
- `handlers/release/commit-message-preflight.ts` — thread the wrap width from the prepared commit-check policy
  (`bodyMaxLineLength`, already in scope via `prepareCommitCheckContext` before assembly) into the assembly call,
  and mark the `messages` transport for snapshot routing when wrapping mutated the bytes.
- `handlers/release/commit.ts` — route the wrapped `messages` transport through the snapshot branch (today gated
  to `file` only): snapshot via `createMessageSnapshot`, then a dedicated argv transform that strips every
  `-m`/`--message` operand and appends `-F <snapshot>`. Note `rewriteCommitFileSource` only substitutes an
  existing `-F` operand's value and is not reusable as-is for a `-m` argv.
- `lib/release/commit-message-remedy.ts` — extend `renderCommitMessageRemedy` for the byte-preserved (`-F`/stdin)
  reject path: persist wrap-corrected bytes to the wrapper-owned retry file (`persistMessageRetry`) and guide an
  `arc release commit -F <file>` resubmission.
- Commit-message diagnostics + E2E/regression coverage — including a Husky-managed self-hosting regression
  proving invalid deterministic input refuses at preflight before the staged-content gate runs.
- `arc-commit` guidance — remove the instruction to hand-wrap commit bodies (now deterministic in the CLI).

## Commit-history scan

Evidence behind the D4 scope boundary (wrap flat lists + paragraphs; preserve structured-rare verbatim). Scan of
4,291 non-merge commit bodies in this repo:

- **Block-kind frequency:** flat unordered lists 60.5% (first-class), nested lists 0.7%, tables 1.0%, fenced code
  0%.
- **Overflow source (lines past the 100-column limit):** list items dominate at 44 lines across 29 commits, more
  than plain prose at 13 lines / 13 commits; tables never overflow.
- **Caveat:** the absolute overflow rate (0.9% of commits) is understated — this history was authored under
  manual-wrapping discipline, so the trustworthy signal is the *distribution* across block kinds, not the rate.

Conclusion: list-item wrapping is core (not an edge case); preserve-verbatim for the structured-and-rare kinds is
safe because any uncommon structured overflow surfaces as an ordinary validation message, never silent
corruption.

## Alternatives considered

Resolved design forks (chosen position → in the spec Decisions):

- **Formatting placement** — agent-side (`arc-commit` guidance) vs. CLI assembly vs. auto-fix artifact. Chose CLI
  assembly; a pure auto-fix/retry artifact is retained only for the byte-preserved `-F` reject path.
- **`-m` wrapping default** — default-on with `--no-wrap` vs. opt-in flag. Chose default-on (ARC already owns
  `-m` bytes; opt-in would leave the agent to remember a flag).
- **Reflow scope** — plain paragraphs only vs. paragraphs-and-flat-lists vs. full structured reflow. Chose
  paragraphs plus flat-list wrapping with structured-rare preserved.
- **Hook detection** — Husky-only special-case vs. manager-agnostic reuse. Chose manager-agnostic reuse of
  `detectHookManager` (adopter-general; future-proofs against any manager that later shims universally).
- **Getting wrapped bytes to Git** — snapshot `-F` vs. rebuilt single `-m` with embedded newlines vs. stdin
  `-F -`. Chose the snapshot `-F` path (makes validated-equals-committed structural). The latter two are recorded
  lesser alternatives, not preferred.
