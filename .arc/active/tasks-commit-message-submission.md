# Task List: commit-message-submission

- **Design:** `spec-commit-message-submission.md`

---

## **Phase 1:** Canonical validator and parity corpus

_Purpose:_ Establish the typed commit-message engine and prove its behavior against the Bash implementation before any
consumer changes validation authority.

### `[ ]` **1.1 Define validator contracts and repository-state seams**

- _Goal:_ Every validation surface can consume one stable result model and the same injected configuration and
  repository facts without importing process or filesystem state into grammar logic.
- **Additional Context:** `strategy-package-project-sync.md` § Framework files and § Configurable file sync.

    - `[x]` **1.1.a Pin the public validation contracts**
        - Added the public `commit-check` contract boundary with stable finding codes, typed locations and details,
          three-valued validated outcomes, exemption outcomes, normalized policy, and injected repository-state seams;
          parser and policy implementation details remain private.

    - `[ ]` **1.1.b Resolve the eight validator configuration keys**
        - Correct `parseArcConfig()` to match `arc_config_get`'s first-definition-wins behavior, then read
          `arc-config.yml` through that shared parser. Claim each key at its first physical definition before value
          normalization: absent and bare empty values use the documented defaults, while quoted empty values strip to
          explicit empty strings; either first definition masks every later duplicate.
        - Define active-policy domain validation for exact documented enum values, unsigned base-10 safe integers,
          `hooks.subject_max_length >= 10`, and both body maxima `>= 1`. Return typed, configuration-located failures
          rather than reproducing shell case fallthrough or arithmetic coercion.
        - Audit existing `parseArcConfig()` callers and retain their behavior for non-duplicate input while the shared
          duplicate-key contract changes.
        - Build `test-first` (one behavior at a time):
            - All eight explicit values reach the policy unchanged.
            - Missing and bare empty values select the Bash defaults.
            - Single- and double-quoted values normalize identically to `arc_config_get`.
            - Duplicate keys select the first definition in both the shell and TypeScript readers.
            - A bare-empty first definition selects the default and masks a later non-empty duplicate; single- and
              double-quoted empty first definitions normalize to explicit empty strings and also mask later values.
            - Quoted numeric limits retain their configured values and compare correctly after normalization.
            - Unknown enums, signed or non-decimal numbers, unsafe integers, and below-minimum limits fail with stable
              configuration findings on active validation paths.

    - `[ ]` **1.1.c Implement the artifact-existence resolver seam**
        - Keep filesystem access behind an injected resolver that applies the distinct search sets for `tasks-*`,
          `draft-*` / `spec-*`, and `meta-*` references.
        - Build `test-first` (one behavior at a time):
            - Each artifact family searches only its allowed active, backlog, or completed roots.
            - Nested backlog and completed artifacts resolve while a misplaced artifact does not.
            - A match in any allowed root returns `found`, even if a later root is unavailable.
            - `not-found` requires every family root to be inspected successfully; unavailable or partially
              materialized roots otherwise return `unresolvable`.
            - An absent family directory under an available `.arc` layout behaves as an inspected empty root.

    - `[ ]` **1.1.d Assemble the shared exemption and advisory context**
        - Supply `hooks.commit_msg`, `MERGE_HEAD`, and `arc.role` through one injected context used by both the hook
          adapter and wrapper preflight.
        - Build `test-first` (one behavior at a time):
            - Disabled validation and merge-in-progress contexts return typed `skipped` outcomes before grammar
              evaluation.
            - Disabled and merge-exempt outcomes short-circuit before unrelated policy-domain failures; an active
              unknown `hooks.commit_msg` value fails at its configuration location.
            - Missing role resolves to the maintainer default.
            - Contributor role remains advisory input rather than a grammar fork.

    - `[ ]` **1.1.e Align integrity validation and inline configuration guidance**
        - Update both Framework copies of `validate-config.sh` to enforce the canonical unsigned-safe-integer domains
          and per-key minima; retain the canonical TypeScript validator as the only custom-pattern compiler.
        - Update the package and self-hosted configurable `arc-config.yml` sections through targeted edits so custom
          patterns are documented as ECMAScript source without delimiters or flags and all three numeric bounds are
          explicit, preserving project-specific values and unrelated overrides.
        - Build `test-first` (one behavior at a time):
            - The shell integrity check accepts each boundary value and rejects signs, non-decimal forms, unsafe
              integers, and values below the per-key minimum with the same key-specific domain as TypeScript.
            - Custom-pattern presence checks remain intact without evaluating the pattern through `grep -E` or another
              second grammar implementation.
            - Framework script copies remain byte-identical; configurable config diffs contain only the intended
              framework-comment changes.

### `[ ]` **1.2 Implement validator behavior and diagnostics**

- _Goal:_ One pure TypeScript path accepts, warns, or rejects the exact message bytes according to the complete current
  policy while returning focused, machine-stable diagnostics.

    - `[ ]` **1.2.a Parse the message and its final trailer block**
        - Represent Conventional Commit subject parts, body lines, and git-style trailers without enforcing ARC policy
          in the parser.
        - Build `test-first` (one behavior at a time):
            - Optional scope, arbitrary type, and the breaking `!` marker parse as syntax.
            - The final `Key: value` block is separated from body prose.
            - Continuation lines fold into their preceding trailer value.
            - Repeated `Context:` trailers select the last occurrence.
            - A `Context:`-shaped body line outside the final trailer block is not treated as the footer.
            - Integration cases agree with `git interpret-trailers --parse` for final-block boundaries, continuation
              folding, and repeated-trailer order before policy selects the last `Context:` value.

    - `[ ]` **1.2.b Apply subject and body policy**
        - Enforce conventional, custom, and any-format modes; the current type set and required scope; subject bounds;
          body line limits; and dotted-phase rejection as policy over the parsed message.
        - Preserve the Bash body-limit measurement domain independently of parsed body/trailer structure: omit physical
          lines 1 and 2, include every line from line 3 onward including trailers, count only non-empty lines for the
          total, and apply the per-line cap throughout that region.
        - Compile custom patterns as dependency-free ECMAScript `RegExp` source in Unicode mode: subject patterns test
          the subject and context patterns test each logical message line, with anchors supplied by the configured
          source when desired.
        - Build `test-first` (one behavior at a time):
            - Valid conventional subjects pass and each current format failure receives its own stable code.
            - Custom patterns distinguish empty, invalid, matching, and non-matching cases without adding an npm
              dependency.
            - POSIX-only bracket, collating, and equivalence classes receive a configuration-located migration
              diagnostic instead of silent reinterpretation.
            - `commit.format: any` disables subject-format and subject-length opinions only.
            - Subject and body limits count Unicode code points, including astral characters, rather than UTF-16 code
              units.
            - Body count includes non-empty trailer lines but not blank lines; line 2 remains unmeasured even when it is
              non-empty, and an overlong trailer receives the same line-located failure as body prose.
            - Body count, body line length, and `Phase X.Y` failures cite their offending lines and limits.

    - `[ ]` **1.2.c Apply footer and repository-state policy**
        - Port every accepted `Context:` family, task-reference form, configured footer mode, artifact advisory, and
          contributor advisory without broadening grammar policy.
        - Build `test-first` (one behavior at a time):
            - Required, recommended, custom, and disabled modes preserve reject-versus-warning behavior.
            - Every task, planning, lifecycle, standalone, integration, and contribution form matches the current
              policy.
            - `not-found` warns and `unresolvable` emits a distinct skip-with-note warning.
            - Contributor role warns for a valid non-contribution footer without rejecting it.

    - `[ ]` **1.2.d Render shared human diagnostics**
        - Format findings once for both CLI and wrapper output, with typed locations, actual/max values, safely
          truncated previews, summary counts, and the nearest legal footer forms.
        - Build `test-first` (one behavior at a time):
            - Error-only, warning-only, and mixed results render deterministically.
            - Message-line, whole-message, and configuration findings render without fake or ambiguous line numbers.
            - Invalid footer output suggests only applicable legal families rather than the complete grammar.
            - Long or control-bearing source lines cannot escape or flood the diagnostic preview.
            - Human formatting does not alter the machine-stable finding payload.

### `[ ]` **1.3 Build the three-valued differential fixture corpus**

- _Goal:_ The TypeScript port cannot silently change accepted, rejected, warning, configuration, or diagnostic behavior
  before the Bash implementation is retired.

    - `[ ]` **1.3.a Define reusable commit-message fixtures**
        - Create a corpus under `packages/arc-framework/__tests__/fixtures/commit-msg/` whose cases declare message
          bytes, configuration, repository facts, expected verdict, and required finding codes.
        - Mark trailer-position, continuation-folding, last-occurrence, explicit POSIX-ERE-to-ECMAScript dialect, and
          invalid-active-config hardening cases as the only intentional post-flip divergences.
        - Cover duplicate config keys, partial resolver roots, trailer continuations, and astral Unicode lengths in the
          parity and migration matrices.

    - `[ ]` **1.3.b Run both implementations over the corpus**
        - Add a differential integration harness that invokes the current Bash hook and the TypeScript validator against
          the same accept, reject, and pass-with-warning fixtures.
        - Normalize only presentation details needed for comparison; require verdict and warning/error semantics to
          agree modulo the enumerated divergence markers.

    - `[ ]` **1.3.c Fold existing hook cases into the durable suite**
        - Migrate the footer matrix and merge-exemption coverage from the existing commit-message integration and E2E
          tests where the corpus can own them without losing real-git assertions.
        - Keep the corpus runnable against the TypeScript implementation after cutover; remove no unique regression
          case.

## **Phase 2:** Public check surface and hook cutover

_Purpose:_ Expose the canonical validator through an adopter-safe CLI primitive, then reduce the installed hook to a
gating and delegation shim only after parity is demonstrated.

### `[ ]` **2.1 Add the `arc check commit-msg` command surface**

- _Goal:_ Users, hooks, and future automation can validate a file or stdin through one stable command with typed exit
  and JSON contracts.

    - `[ ]` **2.1.a Implement file and stdin validation orchestration**
        - Add a check handler that reads one file path or `-` as raw bytes, resolves Git's `i18n.commitEncoding` with
          the `utf-8` default, decodes through built-in fatal `TextDecoder`, constructs the default repository adapter,
          and invokes the canonical validator while retaining source bytes outside the grammar layer.
        - Keep validation failures distinct from usage and infrastructure failures; unsupported encoding labels,
          malformed byte sequences, unreadable files, and failed repository setup are infrastructure exit `2`.
        - Build `test-first` (one behavior at a time):
            - Readable file and stdin inputs preserve bytes and return the validator result.
            - UTF-8 and a supported non-UTF-8 `i18n.commitEncoding` decode without an npm dependency.
            - Unsupported encoding labels and malformed byte sequences exit `2` without invoking validation.
            - Validation failure exits `1`; pass and pass-with-warnings exit `0`.
            - Missing input, unreadable files, and failed repository setup exit `2` with actionable diagnostics.

    - `[ ]` **2.1.b Register the top-level `check` namespace**
        - Add the public command export and `cli.ts` wiring for `arc check commit-msg <file | -> [--json]` without
          colliding with the existing lifecycle-specific `check` verbs.
        - Give this command a local Commander / repository-root error adapter so missing arguments and setup failures
          map to exit `2` rather than Commander's or the global boundary's exit `1`; do not reuse
          `requireArcProjectRoot()` on the JSON path.
        - Keep process exit assignment in the adapter and validation / formatting in testable library or handler
          functions.

    - `[ ]` **2.1.c Stabilize human and JSON output**
        - Emit the shared human diagnostic by default and exactly one versioned JSON envelope under `--json`:
          `{ schemaVersion, result }` for `skipped` / `validated`, or `{ schemaVersion, error }` for typed usage and
          infrastructure failures; keep stdout machine-clean on every JSON path.
        - Build `test-first` (one behavior at a time):
            - Pass, warning, validation-failure, disabled / merge-skipped, usage-failure, and infrastructure-failure
              envelopes retain stable discriminators and documented exit codes.
            - Human output matches the formatter consumed by wrapper preflight.
            - JSON output remains parseable when findings contain previews or suggestions.

### `[ ]` **2.2 Replace the Bash validator with the local-first hook shim**

- _Goal:_ Installed repositories retain cheap exemptions and fail-closed enforcement while all commit-message grammar is
  delegated to the versioned CLI.
- **Additional Context:** `strategy-package-project-sync.md` § Framework files (must match between copies).

    - `[ ]` **2.2.a Lock shim behavior before removing Bash grammar**
        - Add shell-facing tests for disabled validation, `MERGE_HEAD`, local and global CLI resolution, delegated exit
          codes, and the no-CLI remediation path while the existing hook remains available to the differential harness.
        - Build `test-first` (one behavior at a time):
            - Disabled and merge-exempt invocations exit `0` without resolving Node or the CLI.
            - The repository-local `node_modules/.bin/arc` wins over a global `arc`.
            - The global path is used only when the local executable is unavailable.
            - Enabled validation with neither path exits non-zero and names GUI, IDE, and version-manager remediation.

    - `[ ]` **2.2.b Implement the gating and delegation shim**
        - Retain only `arc-lib.sh` configuration lookup, the merge probe, local-first executable resolution, and
          `arc check commit-msg "$1"` delegation; forward the child exit code unchanged.
        - Ensure the shim contains no subject, body, footer, artifact, or diagnostic grammar.

    - `[ ]` **2.2.c Synchronize the shipped and self-hosted hook copies**
        - Edit `packages/arc-framework/arc/system/.internal/githooks/commit-msg` as the authoritative Framework file and
          apply the matching change to `.arc/system/.internal/githooks/commit-msg`.
        - Verify the tracked source copies are byte-identical regular files; verify `arc init` / update installation
          applies executable mode and the installed integrity check recognizes the resulting hook.

    - `[ ]` **2.2.d Preserve the minimal first-release shim contract**
        - Cover the matched CLI and a resolved CLI without the verb; accept the latter's unknown-command failure without
          adding shim-side version negotiation or legacy-pair compatibility machinery.
        - Run `shellcheck` over the settled shim and retain Git-for-Windows-compatible `sh` constructs.

    - `[ ]` **2.2.e Preserve message-path arguments through hook managers**
        - Make Husky's generated commit-message line forward `"$1"`, and audit the Lefthook / pre-commit adapters so
          each supported manager passes the message pathname as one argument without changing unrelated integration
          behavior. Build no legacy-line rewrite path before first public release.
        - Cover fresh generation, repository and message paths containing spaces, preservation of unrelated hook
          content, and idempotent regeneration for each touched adapter.

### `[ ]` **2.3 Prove hook exemptions, delegation, and fail-closed behavior**

- _Goal:_ Real temporary repositories demonstrate that the thin installed hook is a defense-in-depth consumer rather
  than a second implementation or a weaker enforcement path.

    - `[ ]` **2.3.a Exercise hook gating in real repositories**
        - Extend the commit-message E2E suite through actual `git commit` invocations with `core.hooksPath` pointed at
          an installed executable hook; do not present direct `bash <source-hook>` execution as installed-hook evidence.
        - Cover disabled validation and a real `MERGE_HEAD` without placing Node or `arc` on the execution path; assert
          ordinary commits invoke the delegated validator and retain its exit status and output.

    - `[ ]` **2.3.b Exercise CLI resolution and remediation paths**
        - Use controlled PATH and repository-local executables to prove local precedence, global fallback, and
          fail-closed remediation without depending on the developer machine's global installation.
        - Run an installed-hook case from a repository path containing spaces and prove the message path reaches the
          fake or real CLI as one argument through the direct and hook-manager invocation shapes.

    - `[ ]` **2.3.c Complete the parity flip**
        - Require the differential corpus to be green before deleting the Bash grammar, then rerun the durable corpus
          and hook E2E coverage against the TypeScript implementation only.
        - Confirm no grammar regex or artifact search remains in the shell hook after cutover.

## **Phase 3:** Wrapper preflight and retry transport

_Purpose:_ Assemble deterministic message forms byte-exactly, validate them before Git starts, and preserve approved
message bytes when the subsequent Git invocation fails.

### `[ ]` **3.1 Classify and assemble commit-message input forms**

- _Goal:_ The wrapper either reconstructs the exact bytes received by `commit-msg`, refuses the non-interactive editor
  trap, or passes through without guessing.

    - `[ ]` **3.1.a Implement the closed message-source classifier**
        - Implement a dependency-free, table-driven short-option walker shared with release-commit audit redaction.
          Model operand-free, required-operand, and ambiguous / optional-operand members far enough to recognize
          message sources, message modifiers, and editor behavior; stop a cluster when an operand-taking member is
          reached and leave unsupported grammar to Git.
        - Classify recognized `-m` / `--message` and `-F` / `--file` forms, including unambiguous Git-style clusters,
          message-affecting modifiers, editor-bound invocations, reuse/template flags, and the no-message editor path
          with explicit assembled, refused, or pass-through results.
        - Build `test-first` (one behavior at a time):
            - Separated and attached short/long message flags normalize without losing order.
            - Common combined forms such as `-am <message>`, `-am<message>`, and `-qam<message>` identify the same
              message source Git consumes; known message modifiers inside a cluster demote or refuse normally.
            - An earlier operand-taking member prevents an `m` in its payload from becoming a message flag; unknown or
              ambiguous cluster grammar passes through without reinterpretation.
            - `--` ends option parsing; later flag-looking tokens stay pathspecs.
            - Mixed `-m` / `-F`, repeated `-F`, missing operands, and unrecognized or negated source forms pass through
              for Git to diagnose rather than being reinterpreted.
            - `--trailer`, signoff, edit, cleanup overrides, and non-default `commit.cleanup` demote to pass-through.
            - Non-TTY editor-bound forms refuse while the same forms pass through under a TTY, accounting for an
              explicit message source rather than inferring behavior from a flag name alone.
            - `-C` and plain `--fixup=<commit>` stay editor-free pass-through; `--fixup=amend:` /
              `--fixup=reword:` and source-free `--squash` are editor-bound; `--amend` remains owned by the
              destructive-flag gate.

    - `[ ]` **3.1.b Assemble repeated message paragraphs**
        - Reproduce Git's repeated `-m` paragraph joining and default `whitespace` cleanup, including blank-line
          collapse and trailing-whitespace removal, in a pure assembler. Assemble only when the resolved encoding
          canonicalizes to UTF-8 and no message value contains `U+FFFD`; otherwise classify `-m` as pass-through.
        - Build `test-first` (one behavior at a time):
            - Single and repeated message values produce the bytes observed by `commit-msg`.
            - Empty paragraphs, CRLF input, trailing whitespace, and multiple blank lines match Git's cleanup behavior.
            - Literal backslashes and shell metacharacters remain data.
            - Non-UTF-8 encoding and replacement-bearing argv demote without adding an encoder dependency.

    - `[ ]` **3.1.c Assemble file-backed messages**
        - Read `-F <file>` byte-for-byte and accept buffered stdin for `-F -`; classify unreadable files and stdin
          failures as preflight input errors before Git starts. Retain file/stdin as the canonical non-UTF-8 path.
        - Carry the captured raw file bytes as the authoritative source for a later transient snapshot; never rely on
          reopening the caller path after validation.
        - Build `test-first` (one behavior at a time):
            - File and stdin sources undergo the same cleanup contract as Git.
            - A message containing no terminal newline and one containing multiple terminal newlines match Git's result.
            - Unreadable sources fail with bounded diagnostics and never spawn Git.
            - Mutating or replacing the caller file after capture cannot change the assembled source bytes.

    - `[ ]` **3.1.d Ground byte-exactness against Git**
        - Add a real-git integration matrix that captures the message reaching `commit-msg` for every assembled form and
          compares it with the TypeScript assembler output.
        - Include repeated `-m`, separated and attached combined short options, file, stdin, cleanup, quoting-sensitive
          content, option terminators, ambiguous source grammar, editor-bound fixup/squash variants, and modifier- or
          encoding-demoted controls.

### `[ ]` **3.2 Integrate preflight into the release-commit cascade**

- _Goal:_ Deterministic invalid messages stop after release authorization but before `spawnGit`, with the same findings
  the installed hook would emit and a distinct audited refusal.

    - `[ ]` **3.2.a Cut the release audit schema to v2 and extend it for preflight**
        - Add refusal code `16` with identifier `commit-message-preflight-failed`; move every release-commit,
          release-push, and sync audit writer plus the runtime validator to the settled `schemaVersion: 2` shape, adding
          `{ kind: "preflight-failed", reason: "validation" | "input" }` for release-commit while keeping existing
          refusal code meanings stable.
        - Treat this as a clean pre-public cutover: retain no v1 writer/reader union, mixed-version compatibility path,
          or audit-file migration.
        - Reuse the classifier's short-option walker for release-commit argv sanitization. Preserve option shape and
          the `--` boundary while redacting separated, attached, and clustered `-m` payloads; conservatively redact a
          plausible payload in unsupported pre-terminator grammar rather than risk storing message content. Leave
          non-commit command argv behavior unchanged.
        - Build `test-first` (one behavior at a time):
            - The new refusal maps one-to-one to its stable identifier.
            - Every command's new entries carry version `2`; version `1` and unknown versions fail runtime validation.
            - Both preflight reasons validate only for `release-commit`, require decision `refused` plus code `16`,
              carry sanitized argv, and never store message content.
            - Proceeded, hook-failed, authorization-refused, and preflight-refused release-commit entries redact
              separate, attached, and combined message forms, including `-am secret` → `-am <redacted>` and
              `-qamsecret` → `-qam<redacted>`; tokens after `--` remain pathspecs, and operand payloads belonging to an
              earlier short option are not mistaken for messages.
            - Existing commit, push, sync, hook-failed, and refusal outcomes retain their v2 command restrictions.

    - `[ ]` **3.2.b Run classification and validation before `spawnGit`**
        - After the existing interlock-validation cascade, assemble recognized forms and invoke the canonical validator;
          leave pass-through forms on the existing wrapped-Git path.
        - Build `test-first` (one behavior at a time):
            - Invalid assembled input writes one refusal audit entry and never calls `spawnGit`.
            - Unreadable files, stdin failures, and unsupported or malformed assembled encodings write one input-reason
              audit entry and never call `spawnGit`.
            - Pass and pass-with-warnings reach `spawnGit` exactly once.
            - Pass-through forms skip preflight and retain ordinary hook enforcement.
            - Destructive flags still win before message classification, and authorization refusals still win before
              message validation.

    - `[ ]` **3.2.c Hand captured message sources to Git without a second read**
        - Buffer caller stdin only for assembled `-F -`; preserve inherited stdin for `-m`, file-backed, editor, and
          pass-through invocations.
        - After file-backed preflight passes, create a unique transient snapshot under the absolute worktree git
          directory from the captured raw bytes with mode `0600` where supported, rewrite only the spawned file
          operand, and remove the snapshot after the process settles.
        - Treat snapshot creation or write failure as input-reason code `16`; surface cleanup failure without masking
          Git's result. Thread bytes and the git-dir/snapshot adapters through the CLI boundary without coupling the
          pure release handler to Node streams or subprocess creation.
        - Build `test-first` (one behavior at a time):
            - File-backed Git receives only the rewritten snapshot operand while audit sanitization retains caller argv.
            - Replacing the caller file after capture cannot alter Git's bytes; the snapshot is removed after success,
              non-zero exit, or spawn failure.
            - File-backed forms retain inherited stdin, buffered stdin forms receive the captured bytes and close, and
              all pass-through forms preserve the existing process contract.
            - Snapshot setup fails before Git; cleanup failure is diagnostic only and never changes Git's exit code.

    - `[ ]` **3.2.d Preserve hook exemption parity**
        - Thread the same enabled, merge, role, configuration, and artifact-resolution context into preflight that the
          standalone check path uses.
        - Resolve Git's active `prepare-commit-msg` hook path behind an injected adapter and demote runnable-hook
          invocations to pass-through, since the hook may repair or invalidate the message before `commit-msg`.
        - Prove disabled, merge-exempt, and prepare-hook invocations skip preflight rather than becoming stricter under
          the wrapper.

    - `[ ]` **3.2.e Surface the safe resubmission shape on preflight failure**
        - Append the quoted-heredoc `-F -` remedy to wrapper-surface diagnostics, using the plain `-F <file>` form where
          the resident harness matcher cannot allow redirection syntax.
        - Keep validator findings byte-for-byte identical across wrapper and `arc check`; the transport remedy is the
          only wrapper-specific addition.

### `[ ]` **3.3 Persist and surface the worktree-local retry message**

- _Goal:_ Any resolved non-zero Git result after successful assembled preflight leaves the already-approved message
  available for an exact retry without exposing stale Git-managed content.

    - `[ ]` **3.3.a Resolve and write the retry destination**
        - Resolve the active worktree git directory with `git rev-parse --absolute-git-dir` and atomically replace one
          wrapper-owned latest-retry file only after assembled preflight passed and Git returned non-zero.
        - Build `test-first` (one behavior at a time):
            - Primary and linked worktrees write beneath their own git directories.
            - The file uses mode `0600` where supported; a later qualifying failure atomically replaces its bytes.
            - A write failure is surfaced without masking Git's original exit code or printing an unusable reuse
              command.
            - Pass-through and preflight-failure paths do not persist guessed or rejected bytes.

    - `[ ]` **3.3.b Render and verify the reuse path**
        - Render `arc release commit -F <path>` with a tested host-shell-quoted absolute path and prove it reproduces
          the original message through a second wrapper invocation, including repository paths containing spaces and
          shell metacharacters.
        - Remove the latest-retry file after a successful wrapper invocation consumes that exact path; retain it across
          unrelated outcomes until successful consumption or replacement.
        - Assert no code path or diagnostic offers `.git/COMMIT_EDITMSG` as the retry source.

### `[ ]` **3.4 Exercise transport and failure ordering end to end**

- _Goal:_ The wrapper's observable behavior proves early deterministic refusal, ordinary Git defense in depth, and exact
  message reuse across real process boundaries.

    - `[ ]` **3.4.a Complete the release-commit unit matrix**
        - Cover every assembled, pass-through, and editor-refusal class; modifier demotions; TTY state; exemption
          parity; refusal ordering; combined short-option classification and redaction across every audit outcome; and
          diagnostic rendering in the release handler tests.

    - `[ ]` **3.4.b Prove preflight precedes staged-content hooks**
        - In a temporary repository, install sentinel `pre-commit`, `prepare-commit-msg`, and `commit-msg` hooks and
          show an invalid assembled message emits no `pre-commit` evidence while a valid one retains Git's normal hook
          order.
        - Prove an active `prepare-commit-msg` hook demotes to pass-through: an invalid message repaired by the hook can
          commit, while a passing message invalidated by the hook is rejected by the installed `commit-msg` backstop.

    - `[ ]` **3.4.c Prove byte preservation and retry**
        - Exercise quoted-heredoc stdin and file transport with interpolation-sensitive content, force a post-preflight
          non-zero Git result, and retry from the emitted worktree-local path.
        - Assert the preflight input, hook-observed message, persisted retry bytes, and retried message are identical;
          successful consumption removes the retry file while Git's original non-zero exit remains authoritative if
          persistence itself fails.
        - Pause after wrapper capture, replace the original `-F <file>` contents, and prove Git still consumes the
          captured snapshot, inherits caller stdin, and leaves no transient snapshot after either success or failure.

## **Phase 4:** Documentation and first-release acceptance

_Purpose:_ Make the shell-safe transport discoverable at every authoring surface and close the package/project and
cross-surface first-release checks without leaking transport mechanics into workflow fire-points.

### `[ ]` **4.1 Publish the canonical transport and retry guidance**

- _Goal:_ Commit authors encounter one shell-safe multiline submission contract, its matcher-compatible alternative, and
  the exact post-failure reuse path wherever durable commit guidance is loaded.
- **Additional Context:** `strategy-package-project-sync.md` § Configurable file sync — never `cp`.

    - `[ ]` **4.1.a Make `commit-format` the transport authority**
        - Document quoted-heredoc `-F -` as the primary multiline transport and plain `-F <file>` for harness matchers
          that cannot verify redirection under both routed prefixes: `arc release commit` for wrapper routes and
          `git commit` for raw routes.
        - Explain repeated `-m` paragraph semantics; label preflight, latest-retry reuse, replacement, and successful
          cleanup as wrapper-only behavior.
        - Apply targeted edits to the package source and self-hosted configurable copies without overwriting project
          overrides.

    - `[ ]` **4.1.b Correct the quick-reference invocation**
        - Replace the single-line-biased release-commit example in `QUICK-REFERENCE` with the safe shape and point to
          `commit-format` for the full contract.
        - Document `arc check commit-msg <file | -> [--json]` and replace the stale `10–14` / `no-active-wu` refusal
          summary with codes `10–16` and their implemented identifiers.
        - Update the package template and self-hosted instance separately, preserving project-specific content.

    - `[ ]` **4.1.c Align footer guidance with trailer semantics**
        - Verify `commit-footer` already describes a final `Context:` trailer; add only the minimal clarification needed
          for final-block and last-occurrence behavior.
        - Keep footer grammar guidance focused on author-visible policy rather than parser internals.

    - `[ ]` **4.1.d Align hook operator guidance with the shim**
        - Update both Framework copies of `system/.internal/githooks/README.md` to describe local-first CLI resolution,
          `arc check commit-msg`, enabled-validation fail-closed behavior, and ECMAScript custom-pattern source.
        - Remove instructions to extend commit-message grammar in the shell hook or its retired `grep -E` rules; retain
          direct script-customization guidance only for checks that remain shell-owned.

    - `[ ]` **4.1.e Verify the documentation copies and audience boundary**
        - Compare package and self-hosted framework sections, confirm only intended configurable differences remain, and
          run Markdown lint over every changed documentation file.
        - Ensure shipped guidance contains no internal work-unit references or implementation-only migration framing.

### `[ ]` **4.2 Reconcile setup guidance and inherited commit flows**

- _Goal:_ Harness setup examples permit the canonical transport where their matcher can express it, while existing
  commit workflows inherit the guidance without duplicating or contradicting it.
- **Additional Context:** `strategy-interlock-release-wrappers.md` § Per-Harness Reference Implementations.

    - `[ ]` **4.2.a Update release-wrapper setup examples**
        - State a capability-based matcher rule in the setup workflow and release-wrapper strategy: use heredoc only
          where the resident matcher verifies redirection; otherwise use direct prepared-file argv.
        - Document direct `arc release commit -F <file>` plus `codex execpolicy check` as the verified Codex path. Do
          not claim a shell-wrapped heredoc matches the `arc release commit` prefix rule.
        - Normalize push examples to canonical argument-free `arc release push`.
        - Update authoritative package files first and keep their self-hosted Framework copies synchronized.

    - `[ ]` **4.2.b Verify inherited `arc-commit` and preparation flows**
        - Confirm `arc-commit` and `prepare-commits` load the updated commit methods and contain no direct `-m` guidance
          that bypasses the transport authority; edit only an actual contradiction.

    - `[ ]` **4.2.c Preserve content-only workflow fire-points**
        - Search workflow commit fire-points for transport instructions and confirm they still supply only the message
          body and class tag.
        - Update both Framework copies of `strategy-workflow-authoring.md` so the agent selects the routed command and
          loads transport from `commit-format`, removing its direct `git commit -m` recommendation.
        - Keep shell invocation mechanics out of lifecycle and task-processing workflow prose; edit no fire-point unless
          the search finds an actual contradiction.

### `[ ]` **4.3 Amend the accepted release-wrapper trust record**

- _Goal:_ The accepted trust decision remains a truthful architectural reference after commit-message preflight expands
  the wrapper's validation, refusal, and audit surfaces.
- **Additional Context:** `strategy-adr-methodology.md` § Amending Accepted ADRs.

    - Append a dated Tier 2 amendment to `adr-017-release-wrapper-trust-model.md`; do not rewrite its point-in-time
      Context, Decision, or original Consequences.
    - Record the current no-WU ambiguity behavior, refusal family through code `16`, message-preflight trust check, and
      `{ kind: "preflight-failed", reason: "validation" | "input" }` audit outcome. Record the new outcome as the
      forcing function for the clean v2 cutover anticipated by the original schema-lock risk, while affirming that the
      wrapper remains the unconditional trust boundary when invoked.
    - Verify the amendment does not cite movable work-unit artifacts and passes Markdown lint.

### `[ ]` **4.4 Certify the first release across all consumers**

- _Goal:_ The settled repository ships one validator, one durable corpus, synchronized hook and guidance copies, and no
  temporary migration machinery or conflicting invocation examples.

    - `[ ]` **4.4.a Retire differential-only machinery after parity**
        - Remove the temporary Bash-side runner only after the pre-flip parity record is green; retain the shared corpus
          as the TypeScript acceptance suite.
        - Confirm the final tree has no second grammar implementation hidden in tests, shell, or wrapper code.

    - `[ ]` **4.4.b Run the cross-consumer acceptance matrix**
        - Exercise the same valid, warning, and invalid fixtures through the library, `arc check commit-msg`, installed
          hook, and release-wrapper preflight.
        - Compare finding codes and human diagnostics, allowing only the wrapper's appended safe-transport remedy.

    - `[ ]` **4.4.c Close first-release and synchronization checks**
        - Verify package/self-hosted hook identity as byte-identical regular source files, installed-hook executability
          through a real Git invocation, configurable-doc targeted diffs, and CLI build output.
        - Confirm no stale `arc release commit -m` multiline example, Bash commit-message grammar instruction, or
          undocumented public check/refusal surface remains.
        - Run the relevant unit, integration, E2E, shellcheck, Markdown, typecheck, and build gates before entering the
          dedicated work-unit verification phase.

## **Phase 5:** Verification

### `[ ]` **5.1 Complete verification** — load and follow `verify-work-unit.md`

---

## Success Criteria

- `[ ]` Invalid deterministic wrapper messages fail before Git and staged-content hooks start, with a typed refusal and
  v2 preflight audit outcome; every release audit writer emits the settled v2 schema, and no separate, attached, or
  combined short-option message payload enters a release-commit audit entry.

- `[ ]` Quoted-heredoc `-F -` and file-backed `-F <file>` submissions preserve the exact bytes validated by preflight;
  file mutation after capture cannot change Git's input, transient snapshots are removed, and file-backed Git retains
  inherited stdin.

- `[ ]` The shared corpus proves accept, reject, and pass-with-warning parity modulo only the recorded trailer,
  regex-dialect, and invalid-active-config divergences, and remains the acceptance suite after cutover.

- `[ ]` Diagnostics identify offending message lines, bounded values, safe previews, and focused legal footer
  suggestions.

- `[ ]` Ordinary commits retain `pre-commit` then `commit-msg` defense in depth; disabled and merge-exempt hooks no-op,
  and enabled validation fails closed when no CLI is resolvable.

- `[ ]` `arc check commit-msg` supports files and stdin with stable exit codes and a versioned `--json` envelope.

- `[ ]` Any resolved non-zero Git result after successful assembled preflight leaves a restrictively written reusable
  message under the absolute worktree git directory, and successful consumption removes it; no path points callers to
  `.git/COMMIT_EDITMSG`.

- `[ ]` All eight validator configuration keys preserve Bash defaults and configuration-reading semantics, including
  bare-empty-first and quoted-empty-first duplicates; custom patterns honor the documented regex-dialect cutover,
  invalid active domains fail with configuration-located findings, and unavailable artifact resolution degrades to a
  non-blocking warning.

- `[ ]` Durable commit guidance is route-aware; hook and setup docs describe the shim and verified matcher boundaries;
  config integrity and inline comments match runtime domains; `QUICK-REFERENCE` documents `arc check commit-msg` plus
  refusal codes `10–16`; workflow fire-points remain content-only, and accepted `ADR-017` carries a dated append-only
  amendment for the expanded trust surface and clean v2 audit cutover.

- `[ ]` All quality gates pass (tests, linting, type checking, build, and shellcheck).

- `[ ]` Ready for integration.
