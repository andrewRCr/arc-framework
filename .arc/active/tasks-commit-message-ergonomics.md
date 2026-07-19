# Task List: commit-message-ergonomics

- **Design:** `spec-commit-message-ergonomics.md`

---

## **Phase 1:** Deterministic body-wrapping engine

_Purpose:_ Extend `assembleCommitMessageParagraphs` into a width-parameterized greedy wrapper over the block set
the commit-history scan justifies — a pure function, so machine-authored `-m` bodies become valid at assembly
time before Git ever runs. Kept pure and unused-in-path here; Phase 2 wires it into the real commit path.

_Design decisions:_ D2 (wrap in CLI assembly, never agent-side guidance) and D4 (block set — wrap plain
paragraphs and flat list items with hanging-indent continuation; preserve subject, footer/trailer lines, URLs
and unbreakable tokens, tables, nested lists, and code verbatim; greedy word-wrap; idempotent). The
paragraphs-plus-flat-lists scope is grounded in the repo history distribution — see `notes-commit-message-ergonomics.md`
§ Commit-history scan.

### `[x]` **1.1 Extend `assembleCommitMessageParagraphs` with width-parameterized wrapping**

- _Goal:_ Assembled `-m` bytes are greedily wrapped to a caller-supplied width across the wrap-eligible block
  kinds, with structured-and-rare kinds passed through untouched and re-wrapping a no-op.

- _Outcome:_ Added exported pure `wrapCommitMessageBody(cleaned, width)` in `commit-message-assembly.ts` —
  classifies cleaned lines into subject / plain-paragraph / flat-list-item (hanging-indent continuation) /
  preserved-verbatim (trailers, fenced + indented code, table rows, nested lists) and greedy-wraps only the
  eligible kinds, never force-splitting an over-width token. Idempotence holds even for a ≥4-wide ordered marker
  because continuation lines are re-attributed to their item before the indented-code test.
  `assembleCommitMessageParagraphs` gains an optional `width` (omitted ⇒ prior bytes exactly). Kept pure and out
  of the live path; the `-F`/stdin reject path (Task 4.1) reuses the same helper.

## **Phase 2:** Wire wrapping through the commit path (width, `--no-wrap`, validated-bytes transport)

_Purpose:_ Turn wrapping on in the real `-m` path and make the committed bytes equal the validated bytes. These
two changes are one increment on purpose: enabling wrap in the `messages` transport while Git still commits the
raw `-m` argv would let preflight approve a wrapped body that Git then commits unwrapped — reproducing the exact
`commit-msg` rejection this work targets. So width-threading (D3) and snapshot routing (D5) land together.

_Design decisions:_ D3 (wrap width from `hooks.body_max_line_length`, read off the prepared commit-check context's
`bodyMaxLineLength` already resolved before assembly, so wrap-target and reject-target share one source), D5
(snapshot the wrapped `messages` bytes and hand them to Git via `-F`, since Git never reflows `-m`), and the
`--no-wrap` escape hatch. Touch list: `commit-message-preflight.ts`, `commit.ts`, and the argv transform — see
`notes-commit-message-ergonomics.md` § Files map.

### `[x]` **2.1 Thread wrap width and `--no-wrap` into the assembly path**

- _Goal:_ `-m` bodies assemble wrapped to `hooks.body_max_line_length` (default 100) by default; `--no-wrap`
  disables wrapping for `-m`; the `messages` transport is marked for snapshot routing only when wrapping
  actually changed the bytes.

- _Outcome:_ `handleReleaseCommit` (`commit-cli.ts`) strips a bare `--no-wrap` token (honoring the `--`
  terminator) and threads a `wrap` boolean into `createCommitMessagePreflight`; the stripped argv reaches both
  `runReleaseCommit` and the wrapped `git commit`. The preflight reads the width from
  `preparedContext.policy.bodyMaxLineLength` on the `ready` branch only, wraps the `messages` body when `wrap`
  is on, and marks the transport `snapshotRouted` only when wrapping changed the bytes — an unwrapped no-op,
  `--no-wrap`, or a non-`ready` (invalid-policy) context stays a plain raw-`-m` commit.

### `[x]` **2.2 Route the wrapped `messages` transport through a message snapshot**

- _Goal:_ For a `messages` commit whose bytes were wrapped, the committed body bytes equal the validated
  (wrapped) bytes — verified by inspecting the resulting commit, not just preflight.

    - `[x]` **2.2.a Add the strip-`-m`/append-`-F` argv transform**
        - _Outcome:_ Added pure `rewriteCommitMessagesToFile(args, path)` in `commit-message-source.ts`,
          reusing `walkCommitShortOption`: strips separated, attached, long (`--message`/`--message=`), and
          clustered (`-am` → `-a`) message operands, and appends `-F <path>`.

    - `[x]` **2.2.b Wire the transform + snapshot into `runReleaseCommit`**
        - _Outcome:_ Extended the `messages` transport with `snapshotRouted?: boolean`; `runReleaseCommit`
          snapshots `preflight.messageBytes` and rewrites the argv via the new transform (reusing the existing
          snapshot `finally` cleanup) only for a marked transport — an unwrapped `messages` commit keeps its raw
          `-m` argv. SC3 covered end-to-end (a real commit's `%B` equals the wrapped bytes; the same body under
          `--no-wrap` refuses at preflight).

- _Outcome:_ A wrapped `-m` body is what Git commits: the validated wrapped bytes reach Git via a snapshot
  `-F`, closing the gap where preflight could approve a wrapped body Git then committed unwrapped. The one
  branch left unit-untested — a non-`ready` invalid-policy context reaching the messages branch — is
  unobservable at the preflight boundary (the validator re-derives the same invalid outcome, so the result is
  always `refused`, never `passed`); the source branch is present and exercised indirectly.

## **Phase 3:** Effective-hook detection via the manager abstraction

_Purpose:_ Replace the raw git-path `prepare-commit-msg` probe with a manager-aware effective-hook check, so the
preflight skip-guard reflects the effective repo hook rather than a hook manager's universal dispatcher shim —
the confirmed Husky false-positive that let invalid deterministic input reach the full gate.

_Design decisions:_ D1 (route through the existing `detectHookManager`; expose a reusable `hasEffectiveHook(name)`
sibling to the hook-detection module; per-manager rules per the spec table; the `raw/unknown` branch preserves
today's executable-git-path check; the pre-commit rule resolves an ambiguous config-visible signal toward
"present", since a false-positive only _skips_ preflight and `commit-msg` remains the backstop).

### `[x]` **3.1 Add `hasEffectiveHook(name)` with per-manager effective-hook rules**

- _Goal:_ `hasEffectiveHook(name)` answers "does an effective `<name>` hook exist" correctly for each detected
  manager and for the raw fallback — distinguishing a real hook from a bare dispatcher shim.

- _Outcome:_ Added the reusable manager-aware probe in `hook-manager.ts`: Husky checks only its public hook,
  Lefthook requires commands under the named section, pre-commit recognizes explicit hook stages and default
  install types while presence-biasing `default_stages`, and raw repositories retain the executable Git-hook rule.

### `[x]` **3.2 Route `hasPrepareCommitMsgHook` through `hasEffectiveHook`**

- _Goal:_ The release preflight skip-guard reflects the effective repo hook, so invalid deterministic `-m` input
  refuses at preflight — before the staged-content gate runs — under a hook manager that shims universally.

- _Outcome:_ `commit-cli.ts` now delegates the skip guard to the manager-aware probe. A built-CLI Husky regression
  configures the universal dispatcher shims without a public `prepare-commit-msg` hook and proves invalid input
  refuses at message preflight before any Git hook runs.

## **Phase 4:** Byte-preserved retry and commit-format guidance

_Purpose:_ For `-F`/stdin input, keep the byte-preserving contract while offering a corrected `-F` retry artifact
on an over-width reject; and scope the manual-wrap guidance in `commit-format.md` now that `-m` bodies wrap
deterministically.

_Design decisions:_ D6 (never implicitly mutate file-backed or stdin input; on an over-width byte-preserved
reject, persist the wrap-corrected bytes to the wrapper-owned retry file via the existing `persistMessageRetry`
machinery and guide an `arc release commit -F <file>` resubmission — a one-step corrected retry that never
touches the original source). The persist and the retry guidance are orchestrator-side; the refusal result
carries the corrected bytes so the pure remedy renderer stays IO-free.

### `[x]` **4.1 Persist wrap-corrected bytes and guide a `-F` retry on byte-preserved rejects**

- _Goal:_ A rejected over-width `-F`/stdin body yields a corrected-artifact `-F` retry; the original source is
  never mutated.

- _Outcome:_ Preflight now carries wrap-corrected bytes only when the corrected message re-validates; mixed and
  unbreakable failures keep the generic remedy. The orchestrator persists qualifying bytes through the existing
  retry store and emits its shell-safe `-F` command. Built-CLI coverage proves the original file remains unchanged
  while the persisted artifact validates, commits, and cleans up on retry.

### `[x]` **4.2 Scope the manual-wrap guidance in `commit-format.md` to byte-preserved paths**

- _Goal:_ Commit-format guidance no longer asks authors to hand-wrap `-m` bodies (now wrapped deterministically
  by the release wrapper), while the wrapping guidance still governs `-F`/stdin/raw commits, which stay
  byte-preserving.

- _Outcome:_ `commit-format.md` now makes deterministic wrapper reflow explicit for `-m`, while retaining the
  ~72-character hand-authoring target and configured hard limits for byte-preserved `-F` / stdin and raw commits.
  The package source and self-hosted instance remain synchronized.

## **Phase 5:** Verification

### `[x]` **5.1 Complete verification** — load and follow `verify-work-unit.md`

- _Quality gates:_ Markdown, TypeScript, and shell lint; source and test typechecks; 6,326 passing tests with one
  skip; and the production build all passed after the verification fixes.
- _Success criteria:_ All 9 met. The fresh adversarial pass found nested-list flattening and post-terminator
  snapshot routing gaps; both were fixed with regression coverage before the clean Tier 3 rerun.

---

## Success Criteria

- `[x]` A Husky-managed self-hosting regression proves invalid deterministic `-m` input refuses at preflight
  (message-preflight refusal) before the staged-content gate runs — the dispatcher-shim false-positive is gone
- `[x]` An overlong single-`-m` body wraps to `hooks.body_max_line_length` at assembly and passes `commit-msg`
  without any hand-reflow
- `[x]` For a wrapped `messages` commit, the committed body bytes equal the validated (wrapped) bytes — verified
  by inspecting the resulting commit
- `[x]` Flat list items wrap with hanging-indent continuation; nested lists, tables, fenced code, URLs, the
  subject, and footer lines pass through unwrapped
- `[x]` Wrapping is idempotent — re-wrapping already-wrapped output is a no-op
- `[x]` `--no-wrap` disables wrapping for `-m`; `-F`/stdin are never mutated; a rejected byte-preserved
  over-width source yields a corrected-artifact `-F` retry
- `[x]` The effective-hook check resolves correctly per manager: Husky real hook vs. bare dispatcher shim, a
  Lefthook `prepare-commit-msg:` section, pre-commit stage activation, and the raw `.git/hooks` fallback
- `[x]` All quality gates pass (tests, linting, type checking)
- `[x]` Ready for integration
