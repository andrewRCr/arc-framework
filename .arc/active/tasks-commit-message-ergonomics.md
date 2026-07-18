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

### `[ ]` **1.1 Extend `assembleCommitMessageParagraphs` with width-parameterized wrapping**

- _Goal:_ Assembled `-m` bytes are greedily wrapped to a caller-supplied width across the wrap-eligible block
  kinds, with structured-and-rare kinds passed through untouched and re-wrapping a no-op.

- _Approach:_ Factor the wrap as a pure helper over already-cleaned message bytes (post-`cleanupCommitMessageBytes`):
  classify the cleaned lines into blocks and wrap only the eligible ones, width-parameterized.
  `assembleCommitMessageParagraphs` calls the helper after its join + cleanup (adding a width parameter); the
  byte-preserving `-F`/stdin reject path (Task 4.1) reuses the **same helper** on its captured cleaned bytes, so
  one wrap implementation serves both the `-m` assembly path and the reject path. Leave the internal
  block-classification structure to implementation.

    - **Additional Context:** `notes-commit-message-ergonomics.md` § Commit-history scan (block-kind
      distribution grounding the wrap-vs-preserve boundary)

    Build `test-first` (one behavior at a time):

    - A plain paragraph longer than the width wraps greedily at word boundaries
    - A paragraph carrying existing internal line breaks joins first, then re-wraps (input line-breaking
      normalizes to canonical output)
    - A flat unordered list item wraps with hanging-indent continuation aligned to the marker's content column
    - A flat ordered list item wraps with hanging-indent continuation aligned to its marker's content column
    - An unbreakable token (URL, long identifier) longer than the width stays on its own line, never force-split
    - The subject (first line) is never wrapped, regardless of length
    - Footer/trailer lines (`Context:` and other trailers) pass through verbatim
    - A fenced code block passes through verbatim
    - An indented code block passes through verbatim
    - Table rows pass through verbatim
    - Nested (indented) list items pass through verbatim
    - Re-wrapping already-wrapped output is a no-op (idempotent)
    - A non-default width (e.g. 80) wraps eligible blocks at that width

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

### `[ ]` **2.1 Thread wrap width and `--no-wrap` into the assembly path**

- _Goal:_ `-m` bodies assemble wrapped to `hooks.body_max_line_length` (default 100) by default; `--no-wrap`
  disables wrapping for `-m`; the `messages` transport is marked for snapshot routing only when wrapping
  actually changed the bytes.

- _Context:_ `--no-wrap` is a wrapper-level flag, not a `git commit` option — the closed message-input
  classifier treats an unknown flag as unsupported grammar and passes the whole invocation through to raw Git.
  So it is stripped at the `arc release commit` boundary, before classification and before the wrapped
  `git commit`, and threaded through as a boolean.

    - Strip `--no-wrap` from the argv in `handleReleaseCommit` (`commit-cli.ts`) before it reaches
      `runReleaseCommit`, and thread a `wrap` boolean (default on) into the preflight closure
    - In `createCommitMessagePreflight`, read the width from `preparedContext` only on the `ready` branch
      (`preparedContext.policy.bodyMaxLineLength`) and pass it into `assembleCommitMessageParagraphs` for the
      `messages` source when `wrap` is on; assemble unwrapped when `wrap` is off or the context is not `ready`
      (e.g. an invalid-policy outcome that falls through to the validator)
    - Mark the passed `messages` transport as snapshot-routed when the wrapped bytes differ from the raw joined
      bytes; leave it a plain raw-argv commit when wrapping was a no-op or disabled

### `[ ]` **2.2 Route the wrapped `messages` transport through a message snapshot**

- _Goal:_ For a `messages` commit whose bytes were wrapped, the committed body bytes equal the validated
  (wrapped) bytes — verified by inspecting the resulting commit, not just preflight.

- _Context:_ `rewriteCommitFileSource` only substitutes an existing `-F` operand's value, so it cannot be reused
  as-is for a `-m` argv — the `messages` path needs its own dedicated argv transform.

    - Extend the `messages` transport variant so the approved wrapped bytes reach `runReleaseCommit` (carry the
      snapshot bytes on the transport, or a mutated marker consumed alongside the existing `preflight.messageBytes`)

    - Add the `messages` snapshot branch in `runReleaseCommit` beside the existing `file` branch:
      `createMessageSnapshot` on the wrapped bytes, rewrite the argv via the new transform, and clean the
      snapshot up in the existing `finally`

    - `[ ]` **2.2.a Add the strip-`-m`/append-`-F` argv transform**

        - _Approach:_ Reuse `walkCommitShortOption` to locate message operands across attached, separated, long,
          and clustered forms, mirroring how `rewriteCommitFileSource` walks the `-F` operand.

        Build `test-first` (one behavior at a time):

        - Strips a single `-m <value>` operand pair and appends `-F <snapshot>`
        - Strips multiple `-m` operands (all message values removed)
        - Strips the `--message <value>` and `--message=<value>` long forms
        - Strips a clustered `-m` member from a short-option cluster (`-am <msg>` → `-a`), preserving the sibling
          flags
        - Preserves the order and content of non-message arguments
        - Leaves an argv with no `-m`/`--message` operands otherwise unchanged apart from the appended `-F`

    - `[ ]` **2.2.b Wire the transform + snapshot into `runReleaseCommit`**
        - Route only the snapshot-marked `messages` transport through the new branch; an unwrapped (no-op)
          `messages` commit keeps its raw `-m` argv
        - Cover end-to-end that a wrapped `messages` commit's committed bytes equal the validated bytes (SC3)

## **Phase 3:** Effective-hook detection via the manager abstraction

_Purpose:_ Replace the raw git-path `prepare-commit-msg` probe with a manager-aware effective-hook check, so the
preflight skip-guard reflects the effective repo hook rather than a hook manager's universal dispatcher shim —
the confirmed Husky false-positive that let invalid deterministic input reach the full gate.

_Design decisions:_ D1 (route through the existing `detectHookManager`; expose a reusable `hasEffectiveHook(name)`
sibling to the hook-detection module; per-manager rules per the spec table; the `raw/unknown` branch preserves
today's executable-git-path check; the pre-commit rule resolves an ambiguous config-visible signal toward
"present", since a false-positive only _skips_ preflight and `commit-msg` remains the backstop).

### `[ ]` **3.1 Add `hasEffectiveHook(name)` with per-manager effective-hook rules**

- _Goal:_ `hasEffectiveHook(name)` answers "does an effective `<name>` hook exist" correctly for each detected
  manager and for the raw fallback — distinguishing a real hook from a bare dispatcher shim.

- _Note:_ The precise pre-commit YAML read (`<name>`-stage activation via a hook `stages` entry vs.
  `default_install_hook_types`, and the `default_stages` interaction) finalizes during implementation; the
  decision itself is settled (presence-biased). See `spec-commit-message-ergonomics.md` § Open items.

    Build `test-first` (one behavior at a time):

    - Husky: `.husky/<name>` present resolves true
    - Husky: only the `_/<name>` dispatcher shim present (no `.husky/<name>`) resolves false
    - Lefthook: a `<name>:` section with commands in `lefthook.yml` / `.yaml` resolves true
    - Lefthook: no `<name>:` section resolves false
    - pre-commit: `.pre-commit-config.yaml` declaring `<name>`-stage activation resolves true
    - pre-commit: an ambiguous config-visible signal resolves true (presence-biased)
    - pre-commit: no `<name>` signal resolves false
    - raw/unknown (no manager detected): an executable `.git/hooks/<name>` resolves true, absent/non-executable
      resolves false (today's behavior, unchanged)

### `[ ]` **3.2 Route `hasPrepareCommitMsgHook` through `hasEffectiveHook`**

- _Goal:_ The release preflight skip-guard reflects the effective repo hook, so invalid deterministic `-m` input
  refuses at preflight — before the staged-content gate runs — under a hook manager that shims universally.

    - Replace the raw `rev-parse --path-format=absolute --git-path hooks/prepare-commit-msg` probe body in
      `commit-cli.ts` with `hasEffectiveHook("prepare-commit-msg")`
    - Add a Husky-managed self-hosting regression proving invalid deterministic input refuses at preflight
      before the staged-content gate runs — the dispatcher-shim false-positive is gone (SC1)

## **Phase 4:** Byte-preserved retry and commit-format guidance

_Purpose:_ For `-F`/stdin input, keep the byte-preserving contract while offering a corrected `-F` retry artifact
on an over-width reject; and scope the manual-wrap guidance in `commit-format.md` now that `-m` bodies wrap
deterministically.

_Design decisions:_ D6 (never implicitly mutate file-backed or stdin input; on an over-width byte-preserved
reject, persist the wrap-corrected bytes to the wrapper-owned retry file via the existing `persistMessageRetry`
machinery and guide an `arc release commit -F <file>` resubmission — a one-step corrected retry that never
touches the original source). The persist and the retry guidance are orchestrator-side; the refusal result
carries the corrected bytes so the pure remedy renderer stays IO-free.

### `[ ]` **4.1 Persist wrap-corrected bytes and guide a `-F` retry on byte-preserved rejects**

- _Goal:_ A rejected over-width `-F`/stdin body yields a corrected-artifact `-F` retry; the original source is
  never mutated.

- _Context:_ This is the reject branch, distinct from the `messages` auto-wrap path — `-F`/stdin stay
  byte-preserving; the correction is offered as a retry artifact, not applied in place. Preflight computes the
  wrap-corrected bytes (it holds the width and classification context) and carries them on the refusal; the
  orchestrator persists and guides. The pure remedy renderer does no IO.

    - Gate the corrected-artifact offer to a failure that wrapping actually resolves: wrap the captured cleaned
      bytes via the Phase 1 helper and offer the retry only when the wrapped bytes re-validate. A failure
      wrapping won't fix — an unbreakable-token overflow (preserved verbatim under D4) or a mixed failure with a
      non-width problem — falls back to the generic `renderCommitMessageRemedy`
    - Carry the wrap-corrected bytes on the refusal result so the orchestrator can act on them
    - In `runReleaseCommit`, persist those bytes via the existing `persistMessageRetry` machinery and guide the
      `-F` retry naming the persisted artifact, reusing the `renderCommitMessageRetryCommand` shaping so this
      retry surface matches the post-spawn-failure one rather than growing a divergent path
    - Cover that a byte-preserved source is never mutated and that the persisted retry artifact re-validates (not
      merely that it carries corrected bytes)

### `[ ]` **4.2 Scope the manual-wrap guidance in `commit-format.md` to byte-preserved paths**

- _Goal:_ Commit-format guidance no longer asks authors to hand-wrap `-m` bodies (now wrapped deterministically
  by the release wrapper), while the wrapping guidance still governs `-F`/stdin/raw commits, which stay
  byte-preserving.

- _Context:_ The manual-wrap instruction lives in `commit-format.md` § Body ("Wrap at ~72 chars per line"), not
  the `arc-commit` skill. `commit-format.md` is a Framework file that ships — phrase the change adopter-general
  (the wrapper wraps `-m` bodies), not self-hosting-specific.

    - In `commit-format.md` § Body, note that `-m` bodies are wrapped deterministically by the release wrapper
      to the configured `hooks.body_max_line_length` (default 100 — not the ~72 aesthetic, which stays a
      hand-authoring nicety for the byte-preserved and raw paths, where the width/limit guidance is retained)
    - Apply via the package source (`packages/arc-framework/arc/system/methods/commit-format.md`) and sync to the
      `.arc/` copy per the two-copy discipline

## **Phase 5:** Verification

### `[ ]` **5.1 Complete verification** — load and follow `verify-work-unit.md`

---

## Success Criteria

- `[ ]` A Husky-managed self-hosting regression proves invalid deterministic `-m` input refuses at preflight
  (message-preflight refusal) before the staged-content gate runs — the dispatcher-shim false-positive is gone
- `[ ]` An overlong single-`-m` body wraps to `hooks.body_max_line_length` at assembly and passes `commit-msg`
  without any hand-reflow
- `[ ]` For a wrapped `messages` commit, the committed body bytes equal the validated (wrapped) bytes — verified
  by inspecting the resulting commit
- `[ ]` Flat list items wrap with hanging-indent continuation; nested lists, tables, fenced code, URLs, the
  subject, and footer lines pass through unwrapped
- `[ ]` Wrapping is idempotent — re-wrapping already-wrapped output is a no-op
- `[ ]` `--no-wrap` disables wrapping for `-m`; `-F`/stdin are never mutated; a rejected byte-preserved
  over-width source yields a corrected-artifact `-F` retry
- `[ ]` The effective-hook check resolves correctly per manager: Husky real hook vs. bare dispatcher shim, a
  Lefthook `prepare-commit-msg:` section, pre-commit stage activation, and the raw `.git/hooks` fallback
- `[ ]` All quality gates pass (tests, linting, type checking)
- `[ ]` Ready for integration
