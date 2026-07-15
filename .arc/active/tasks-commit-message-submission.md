# Task List: commit-message-submission

- **Design:** `spec-commit-message-submission.md`

---

## **Phase 1:** Canonical validator and parity corpus

_Purpose:_ Establish the typed commit-message engine and prove its behavior against the Bash implementation before any
consumer changes validation authority.

### `[x]` **1.1 Define validator contracts and repository-state seams**

- _Goal:_ Every validation surface can consume one stable result model and the same injected configuration and
  repository facts without importing process or filesystem state into grammar logic.
- **Additional Context:** `strategy-package-project-sync.md` § Framework files and § Configurable file sync.

    - `[x]` **1.1.a Pin the public validation contracts**
        - Added the public `commit-check` contract boundary with stable finding codes, typed locations and details,
          three-valued validated outcomes, exemption outcomes, normalized policy, and injected repository-state seams;
          parser and policy implementation details remain private.

    - `[x]` **1.1.b Resolve the eight validator configuration keys**
        - Made the shared parser first-definition-wins, including bare- and quoted-empty masking, then added exact
          eight-key default resolution and active enum/numeric domain validation with configuration-located findings;
          shell/TypeScript parity and existing non-duplicate callers are covered by unit and integration tests.

    - `[x]` **1.1.c Implement the artifact-existence resolver seam**
        - Added the injected filesystem resolver with family-specific active/backlog/completed searches, recursive
          design/meta discovery, early found semantics, and distinct inspected-empty versus unavailable results.

    - `[x]` **1.1.d Assemble the shared exemption and advisory context**
        - Added one normalized configuration/repository context and preparation gate shared by every consumer: merge
          and disabled exemptions short-circuit policy work, invalid active modes return typed findings, and role
          normalization retains contributor advisory input while defaulting other cases to maintainer.

    - `[x]` **1.1.e Align integrity validation and inline configuration guidance**
        - Aligned both integrity scripts with the TypeScript numeric domains while leaving pattern compilation
          canonical to TypeScript, and updated the configurable comments through targeted package/project edits to
          document ECMAScript source and numeric bounds without disturbing self-hosted overrides.

- _Outcome:_ All consumers now share stable contracts, exact configuration semantics, exemption ordering, and one
  repository-resolution seam; integrity checks and author-facing configuration guidance enforce the same input domain.

### `[x]` **1.2 Implement validator behavior and diagnostics**

- _Goal:_ One pure TypeScript path accepts, warns, or rejects the exact message bytes according to the complete current
  policy while returning focused, machine-stable diagnostics.

    - `[x]` **1.2.a Parse the message and its final trailer block**
        - Added a policy-free parser for arbitrary Conventional Commit syntax, physical/body lines, and final Git
          trailer blocks with continuation folding and last-`Context` selection; integration cases match
          `git interpret-trailers --parse` for boundaries, folding, and ordering.

    - `[x]` **1.2.b Apply subject and body policy**
        - Added conventional/custom/any policy with distinct stable subject failures, dependency-free Unicode-mode
          ECMAScript patterns and POSIX migration diagnostics, code-point length limits, Bash-compatible raw-line body
          measurement, and line-located dotted-phase failures.

    - `[x]` **1.2.c Apply footer and repository-state policy**
        - Added final-trailer validation for required/recommended/custom/disabled modes, the complete task/design/meta/
          standalone/integration/contribution grammar, async artifact warnings that distinguish absence from
          unavailability, contributor advisories, and the canonical three-valued validation entry point.

    - `[x]` **1.2.d Render shared human diagnostics**
        - Added one deterministic human formatter with distinct line/message/config locations, counts and limit detail,
          applicable footer suggestions, escaped/truncated previews, skipped/pass/warning/failure summaries, and
          immutable handling of the machine payload.

- _Outcome:_ One canonical async validator now parses before policing, preserves three-valued warning semantics, and
  returns stable findings plus terminal-safe diagnostics across subject, raw-body, footer, configuration, and
  repository-state policy.

### `[x]` **1.3 Build the three-valued differential fixture corpus**

- _Goal:_ The TypeScript port cannot silently change accepted, rejected, warning, configuration, or diagnostic behavior
  before the Bash implementation is retired.

    - `[x]` **1.3.a Define reusable commit-message fixtures**
        - Added a byte-valued shared corpus declaring config, repository facts, three-valued expectations, and required
          finding codes across duplicates, partial roots, trailer semantics, astral lengths, and exactly the five
          enumerated post-flip divergence classes.

    - `[x]` **1.3.b Run both implementations over the corpus**
        - Added durable TypeScript and temporary Bash differential integration runners over the same materialized bytes,
          config, artifact roots, and role facts; verdicts agree exactly except where each enumerated divergence records
          its pre-flip Bash result.

    - `[x]` **1.3.c Fold existing hook cases into the durable suite**
        - Folded the Bash-only footer smoke matrix into the canonical footer-policy suite, including every retired
          negative form, while retaining the real-repository merge exemption and installed-hook assertions for their
          unique process-boundary evidence.

- _Outcome:_ The parity record is explicit and executable: one durable acceptance corpus owns canonical findings,
  while a temporary differential runner proves pre-flip Bash agreement modulo the five named migration decisions.

## **Phase 2:** Public check surface and hook cutover

_Purpose:_ Expose the canonical validator through an adopter-safe CLI primitive, then reduce the installed hook to a
gating and delegation shim only after parity is demonstrated.

### `[x]` **2.1 Add the `arc check commit-msg` command surface**

- _Goal:_ Users, hooks, and future automation can validate a file or stdin through one stable command with typed exit
  and JSON contracts.

    - `[x]` **2.1.a Implement file and stdin validation orchestration**
        - Added byte-preserving file/stdin orchestration, fatal built-in decoding, a shared default repository adapter,
          and typed usage, infrastructure, and validation exit results.

    - `[x]` **2.1.b Register the top-level `check` namespace**
        - Exported and wired `arc check commit-msg <file | -> [--json]` with command-local argument and repository-root
          handling, typed exit `2` setup failures, and process exit assignment isolated in the Commander adapter.

    - `[x]` **2.1.c Stabilize human and JSON output**
        - Added a pure output renderer that reuses shared human diagnostics and emits one schema-versioned stdout
          envelope for every JSON result or error path, with typed contract tests for all verdicts and failures.

- _Outcome:_ The public check command now preserves source bytes through decoding, shares canonical repository and
  validation state, and exposes deterministic human, JSON, and exit-code contracts from both file and stdin inputs.

### `[x]` **2.2 Replace the Bash validator with the local-first hook shim**

- _Goal:_ Installed repositories retain cheap exemptions and fail-closed enforcement while all commit-message grammar is
  delegated to the versioned CLI.
- **Additional Context:** `strategy-package-project-sync.md` § Framework files (must match between copies).

    - `[x]` **2.2.a Lock shim behavior before removing Bash grammar**
        - Added shell-facing integration coverage for exemptions, local-first and global resolution, delegated exit
          codes, and actionable fail-closed remediation under a controlled execution path.

    - `[x]` **2.2.b Implement the gating and delegation shim**
        - Replaced the Bash grammar with configuration and merge gates, repository-local/global CLI resolution, exact
          `check commit-msg` delegation, and fail-closed remediation while forwarding delegated status unchanged.

    - `[x]` **2.2.c Synchronize the shipped and self-hosted hook copies**
        - Kept the package-authoritative and self-hosted hooks byte-identical as regular source files, centralized
          executable installation policy across init and update, and covered installed integrity recognition.

    - `[x]` **2.2.d Preserve the minimal first-release shim contract**
        - Covered matched and verb-missing CLIs, preserving the latter's unknown-command failure without negotiation or
          compatibility machinery; the settled portable shim remains shellcheck-clean.

    - `[x]` **2.2.e Preserve message-path arguments through hook managers**
        - Quoted Husky and Lefthook message placeholders, retained pre-commit's argv-based adapter, and covered fresh,
          unrelated-content-preserving, spaced-path, and idempotent generation without legacy rewrites.

- _Outcome:_ Commit-message enforcement now gates cheaply in shell and delegates all active validation to the
  repository-pinned or global CLI, while installation and hook-manager boundaries preserve executable and pathname
  semantics without retaining a second grammar.

### `[x]` **2.3 Prove hook exemptions, delegation, and fail-closed behavior**

- _Goal:_ Real temporary repositories demonstrate that the thin installed hook is a defense-in-depth consumer rather
  than a second implementation or a weaker enforcement path.

    - `[x]` **2.3.a Exercise hook gating in real repositories**
        - Rebuilt E2E coverage around executable installed hooks and actual Git commits/merges, proving Node-free
          exemptions and delegated accept/reject output; Git normalizes any hook rejection to its own exit `1`, while
          exact delegated statuses remain covered at the installed executable seam.

    - `[x]` **2.3.b Exercise CLI resolution and remediation paths**
        - Proved local precedence, controlled global fallback, and fail-closed remediation without machine-global
          dependencies, plus one-argument message delivery through direct and managed hooks under spaced paths.

    - `[x]` **2.3.c Complete the parity flip**
        - Retired the temporary Bash differential runner after its pre-flip green baseline, kept the TypeScript corpus
          as the durable acceptance suite, and confirmed the installed shim contains no grammar or artifact search.

- _Outcome:_ Installed-hook E2E now proves exemptions, local/global resolution, fail-closed remediation, delegated
  output, and spaced-path safety through real Git and managed-hook shapes, with one TypeScript grammar authority.

## **Phase 3:** Wrapper preflight and retry transport

_Purpose:_ Assemble deterministic message forms byte-exactly, validate them before Git starts, and preserve approved
message bytes when the subsequent Git invocation fails.

### `[x]` **3.1 Classify and assemble commit-message input forms**

- _Goal:_ The wrapper either reconstructs the exact bytes received by `commit-msg`, refuses the non-interactive editor
  trap, or passes through without guessing.

    - `[x]` **3.1.a Implement the closed message-source classifier**
        - Added a dependency-free short-option walker and closed classifier for assembled message/file sources,
          Git-owned grammar, message modifiers, and TTY-sensitive editor paths; real-Git probes anchor explicit-source
          conflicts while leaving ambiguous or invalid forms to Git.

    - `[x]` **3.1.b Assemble repeated message paragraphs**
        - Added a pure UTF-8 paragraph assembler matching Git's `whitespace` cleanup for empty edges, CRLF, trailing
          whitespace, and collapsed blank lines; non-UTF-8 or replacement-bearing message argv now demotes while raw
          file sources remain eligible.

    - `[x]` **3.1.c Assemble file-backed messages**
        - Added single-read file/stdin capture with owned raw bytes, byte-level Git cleanup that retains non-UTF-8
          content, and bounded typed input failures; later caller mutation cannot alter either validation bytes or the
          authoritative transport snapshot.

    - `[x]` **3.1.d Ground byte-exactness against Git**
        - Added a real-Git hook-capture matrix proving byte parity for repeated/clustered message argv, raw file/stdin,
          cleanup, quoting-sensitive content, and option terminators, plus Git-oracle controls for demotion and editor
          boundaries.

- _Outcome:_ Deterministic argv/file/stdin forms now converge on the exact bytes Git exposes to `commit-msg`; ambiguous,
  modified, encoding-unsafe, and editor-bound forms remain explicitly demoted or refused without guessed parsing.

### `[x]` **3.2 Integrate preflight into the release-commit cascade**

- _Goal:_ Deterministic invalid messages stop after release authorization but before `spawnGit`, with the same findings
  the installed hook would emit and a distinct audited refusal.

    - `[x]` **3.2.a Cut the release audit schema to v2 and extend it for preflight**
        - Cut all release/sync audit writers and validation to v2, added refusal `16` and typed preflight outcomes, and
          reused the classifier walker for commit-only redaction across separated, attached, clustered, ambiguous,
          operand-bound, and post-terminator argv without a legacy-version compatibility arm.

    - `[x]` **3.2.b Run classification and validation before `spawnGit`**
        - Added production in-process preflight after authorization, composing deterministic assembly/capture with the
          canonical byte validator; validation and input failures audit once as code `16`, pass/warnings spawn once,
          pass-through skips source reads, and destructive/authorization refusals retain precedence.

    - `[x]` **3.2.c Hand-captured message sources to Git without a second read**
        - Threaded owned transport bytes through preflight: file sources become mode-`0600` snapshots beneath the
          absolute worktree Git directory with shape-preserving argv rewrite and finally cleanup, while `-F -` pipes
          captured stdin; setup failures refuse before Git and cleanup failures remain diagnostic-only.

    - `[x]` **3.2.d Preserve hook exemption parity**
        - Preflight now consumes the standalone check path's shared repository context and demotes canonical exemption
          outcomes; an injected Git-path/executable probe also demotes runnable `prepare-commit-msg` hooks before source
          capture, preserving disabled, merge, and mutation-hook parity.

    - `[x]` **3.2.e Surface the safe resubmission shape on preflight failure**
        - Appended retry guidance after the canonical findings and refusal using prepared `-F <file>` for every harness;
          the corrected message is not yet available to verify a heredoc delimiter. Exact-output tests pin the validator
          message as the unchanged prefix.

- _Outcome:_ Authorized deterministic messages now validate once before Git and retain one captured transport through
  execution; failures audit distinctly and return harness-safe retry guidance, while exemptions and mutating hooks
  continue through the installed Git path without duplicated policy authority.

### `[x]` **3.3 Persist and surface the worktree-local retry message**

- _Goal:_ Any resolved non-zero Git result after successful assembled preflight leaves the already-approved message
  available for an exact retry without exposing stale Git-managed content.

    - `[x]` **3.3.a Resolve and write the retry destination**
        - Retained canonical approved bytes through preflight and atomically replaced one mode-`0600` latest-retry file
          beneath `git rev-parse --absolute-git-dir` after resolved non-zero Git outcomes; primary/linked isolation and
          replacement use real Git/filesystem coverage, while persistence failures remain warnings that preserve Git's
          exit code and pass-through/refusal paths never write.

    - `[x]` **3.3.b Render and verify the reuse path**
        - Added expansion-safe shell quoting and emitted `arc release commit -F <path>` only after successful retry
          persistence; real-shell and two-run wrapper coverage replays exact bytes from a linked-worktree path with
          spaces/metacharacters, then removes only the unchanged wrapper-owned source after successful consumption.
          Unrelated, replaced, failed, and `COMMIT_EDITMSG` paths remain ineligible for cleanup or reuse guidance.

- _Outcome:_ Every resolved Git failure after assembled preflight now retains the approved bytes in its worktree-local
  Git directory and returns an executable exact-retry command; consuming that wrapper-owned retry successfully clears
  it without turning unrelated or concurrently replaced message files into stale reusable state.

### `[x]` **3.4 Exercise transport and failure ordering end to end**

- _Goal:_ The wrapper's observable behavior proves early deterministic refusal, ordinary Git defense in depth, and exact
  message reuse across real process boundaries.

    - `[x]` **3.4.a Complete the release-commit unit matrix**
        - Completed production-preflight coverage across assembled, modifier/encoding/grammar/Git-managed pass-through,
          non-TTY refusal and TTY demotion, disabled/merge/prepare-hook exemptions, and canonical diagnostics; release
          cascade tests now pin combined short-option redaction for ordinary refusals, preflight failures, successful
          commits, and non-zero Git audit outcomes without changing refusal precedence.

    - `[x]` **3.4.b Prove preflight precedes staged-content hooks**
        - Added built-CLI temporary-repository coverage with sentinel hooks: invalid deterministic input exits `16`
          without `pre-commit`, valid input records Git's `pre-commit` → `commit-msg` order, and executable
          `prepare-commit-msg` demotes preflight so its repairs can commit while its invalidations are rejected by the
          installed canonical `commit-msg` backstop.

    - `[x]` **3.4.c Prove byte preservation and retry**
        - Extended built-CLI coverage with interpolation-sensitive quoted-heredoc and file sources: a post-preflight
          hook failure leaves hook/retry bytes identical to submitted input, the emitted command replays the same bytes
          and removes the retry file, and an obstructed retry destination preserves Git's exit without an unusable
          command. File runs mutate the caller source during `pre-commit` yet consume the captured snapshot, retain the
          caller stdin pipe, and clean transient snapshots after both success and failure.

- _Outcome:_ Release-commit now has process-boundary proof that deterministic failures precede staged-content work,
  Git-managed mutation remains defense-in-depth, captured sources cannot drift between validation and Git, and every
  approved non-zero outcome is either exactly retryable or reports persistence failure without masking Git.

## **Phase 4:** Documentation and first-release acceptance

_Purpose:_ Make the shell-safe transport discoverable at every authoring surface and close the package/project and
cross-surface first-release checks without leaking transport mechanics into workflow fire-points.

### `[x]` **4.1 Publish the canonical transport and retry guidance**

- _Goal:_ Commit authors encounter one shell-safe multiline submission contract, its matcher-compatible alternative, and
  the exact post-failure reuse path wherever durable commit guidance is loaded.
- **Additional Context:** `strategy-package-project-sync.md` § Configurable file sync — never `cp`.

    - `[x]` **4.1.a Make `commit-format` the transport authority**
        - Added synchronized package/self-hosted guidance making quoted-heredoc `-F -` with a verified non-colliding
          delimiter authoritative for multiline wrapper and raw routes, with direct prepared-file argv for matchers that
          cannot verify redirection. The method now defines repeated `-m` as separate paragraphs and scopes deterministic
          preflight, atomic latest-retry replacement/command rendering, and successful exact-consumption cleanup to the
          release wrapper.

    - `[x]` **4.1.b Correct the quick-reference invocation**
        - Replaced the package-template and self-hosted single-`-m` example independently with quoted-heredoc `-F -`
          using a verified non-colliding delimiter, linked the transport authority, added runnable standalone file/stdin
          check examples, and corrected the refusal range to codes `10–16` with all seven implemented identifiers while
          preserving project-only content.

    - `[x]` **4.1.c Align footer guidance with trailer semantics**
        - Added one synchronized author-facing clarification to `commit-footer`: `Context:` belongs in the final Git
          trailer block and the last occurrence governs when that block contains more than one, without exposing parser
          mechanics or changing the existing grammar catalog.

    - `[x]` **4.1.d Align hook operator guidance with the shim**
        - Updated both Framework hook guides with the shim's local-first CLI resolution, standalone checker command,
          enabled-validation fail-closed behavior, and ECMAScript configuration contract. Commit-message grammar now
          routes through `arc-config.yml`; direct script customization is limited to shell-owned checks.

    - `[x]` **4.1.e Verify the documentation copies and audience boundary**
        - Confirmed byte-identical package/self-hosted Framework methods and hook guidance; the configurable quick-reference
          release sections differ only in their established project link style. All changed documentation passes Markdown
          lint, and shipped additions contain no internal work-unit references or implementation-only migration framing.

### `[x]` **4.2 Reconcile setup guidance and inherited commit flows**

- _Goal:_ Harness setup examples permit the canonical transport where their matcher can express it, while existing
  commit workflows inherit the guidance without duplicating or contradicting it.
- **Additional Context:** `strategy-interlock-release-wrappers.md` § Per-Harness Reference Implementations.

    - `[x]` **4.2.a Update release-wrapper setup examples**
        - Updated the synchronized setup workflow and release-wrapper strategy with capability-based transport selection:
          heredocs require matcher proof, while Codex uses direct prepared-file argv verified by
          `codex execpolicy check`. Push examples now use canonical argument-free `arc release push`.

    - `[x]` **4.2.b Verify inherited `arc-commit` and preparation flows**
        - Confirmed `arc-commit` explicitly loads both commit methods and `prepare-commits` declares them in workflow
          frontmatter. Both package/self-hosted pairs are synchronized and contain no direct commit invocation that
          bypasses the transport authority, so no guidance edit was required.

    - `[x]` **4.2.c Preserve content-only workflow fire-points**
        - Updated both Framework authoring strategies so routed command selection loads transport from `commit-format`
          while fire-points retain only class tags and message bodies. A package/self-hosted workflow search found no
          embedded commit transport outside the dedicated setup workflow, so no fire-point required editing.

### `[x]` **4.3 Amend the accepted release-wrapper trust record**

- _Goal:_ The accepted trust decision remains a truthful architectural reference after commit-message preflight expands
  the wrapper's validation, refusal, and audit surfaces.
- **Additional Context:** `strategy-adr-methodology.md` § Amending Accepted ADRs.

    - Appended a dated Tier 2 amendment to ADR 017 without rewriting its accepted record. It captures zero-candidate
      acceptance versus multi-candidate refusal, codes `10–16`, message preflight and its audited outcome, the clean v2
      cutover, and the wrapper's unchanged unconditional trust boundary without citing movable work-unit artifacts.

### `[x]` **4.4 Certify the first release across all consumers**

- _Goal:_ The settled repository ships one validator, one durable corpus, synchronized hook and guidance copies, and no
  temporary migration machinery or conflicting invocation examples.

    - `[x]` **4.4.a Retire differential-only machinery after parity**
        - Confirmed the pre-flip green record precedes removal of the Bash differential runner, while the three-valued
          corpus and its five intentional cutover annotations remain under the durable TypeScript acceptance suite.
          Shell is delegation-only and wrapper preflight imports the canonical check path; no second grammar remains.

    - `[x]` **4.4.b Run the cross-consumer acceptance matrix**
        - Added built-CLI E2E coverage that drives the shared valid, warning, and invalid fixtures through standalone
          machine/human output, the real installed hook, and release-wrapper preflight; the durable corpus runner covers
          the library path. Finding codes and diagnostics match exactly, with only the wrapper refusal/remedy appended.

    - `[x]` **4.4.c Close first-release and synchronization checks**
        - Certified byte-identical regular hook sources, executable installed-hook behavior through real Git, exact
          Framework mirrors, targeted configurable-doc differences, and built CLI help. Shipped guidance contains no
          stale multiline `-m`, Bash grammar, refusal-range, or standalone-check documentation gaps.

## **Phase 5:** Verification

### `[x]` **5.1 Complete verification** — load and follow `verify-work-unit.md`

- _Quality gates:_ TypeScript lint, shellcheck, source and test typechecks, 445 Vitest files (5,572 passed and 1
  skipped), build, and 451-file Markdown lint all passed.
- _Success criteria:_ All 11 task-list criteria and all 11 upstream design criteria are met; fresh adversarial
  findings were resolved and rechecked against source.

---

## Success Criteria

- `[x]` Invalid deterministic wrapper messages fail before Git and staged-content hooks start, with a typed refusal and
  v2 preflight audit outcome; every release audit writer emits the settled v2 schema, and no separate, attached, or
  combined short-option message payload enters a release-commit audit entry.

- `[x]` Quoted-heredoc `-F -` and file-backed `-F <file>` submissions preserve the exact bytes validated by preflight;
  file mutation after capture cannot change Git's input, transient snapshots are removed, and file-backed Git retains
  inherited stdin.

- `[x]` The shared corpus proves accept, reject, and pass-with-warning parity modulo only the recorded trailer,
  regex-dialect, and invalid-active-config divergences, and remains the acceptance suite after cutover.

- `[x]` Diagnostics identify offending message lines, bounded values, safe previews, and focused legal footer
  suggestions.

- `[x]` Ordinary commits retain `pre-commit` then `commit-msg` defense in depth; disabled and merge-exempt hooks no-op,
  and enabled validation fails closed when no CLI is resolvable.

- `[x]` `arc check commit-msg` supports files and stdin with stable exit codes and a versioned `--json` envelope.

- `[x]` Any resolved non-zero Git result after successful assembled preflight leaves a restrictively written reusable
  message under the absolute worktree git directory, and successful consumption removes it; no path points callers to
  `.git/COMMIT_EDITMSG`.

- `[x]` All eight validator configuration keys preserve Bash defaults and configuration-reading semantics, including
  bare-empty-first and quoted-empty-first duplicates; custom patterns honor the documented regex-dialect cutover,
  invalid active domains fail with configuration-located findings, and unavailable artifact resolution degrades to a
  non-blocking warning.

- `[x]` Durable commit guidance is route-aware; hook and setup docs describe the shim and verified matcher boundaries;
  config integrity and inline comments match runtime domains; `QUICK-REFERENCE` documents `arc check commit-msg` plus
  refusal codes `10–16`; workflow fire-points remain content-only, and accepted `ADR-017` carries a dated append-only
  amendment for the expanded trust surface and clean v2 audit cutover.

- `[x]` All quality gates pass (tests, linting, type checking, build, and shellcheck).

- `[x]` Ready for integration.
