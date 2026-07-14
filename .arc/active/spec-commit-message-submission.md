# Spec (`detailed` · RFC): commit-message-submission

- **Origin:** [internal]

- **Purpose:** Make deterministic commit-message submission shell-safe, preflighted before expensive
  staged-content checks, diagnostically repairable, and cheap to retry — implemented once as a
  TypeScript-canonical validator serving the wrapper preflight, the installed `commit-msg` hook, and a
  standalone check verb, without weakening Git's normal hooks.

---

## Introduction / Context

`arc release commit` validates release authority and then forwards its arguments verbatim to `git commit`. Git
runs the expensive `pre-commit` hook before `commit-msg`, so deterministic message errors surface only after the
staged-content gate — and every message-only retry repeats that cost. The agent-facing invocation is also easy
to misuse: double-quoted `\n` stays literal in Bash, while repeated `-m` values create paragraphs rather than
controlled wrapped lines. Observed failures include a literal `\n` collapsing body and footer into one long
line, and an invalid footer eliciting the complete grammar dump rather than the closest legal alternatives.
These failures recur across sessions because the submission interface makes neither the safe path nor the early
path obvious.

Grounded architecture facts driving the design:

- All commit-message validation lives in the installed `commit-msg` git hook — ~409 lines of pure Bash
  (`grep -E` / `sed` / `awk`), config-driven: subject format and length, the full `Context:` footer grammar
  (including filesystem existence checks against `.arc/active|backlog|completed`), body line caps, and the
  dotted-phase rejection. No TypeScript validator exists anywhere in the CLI.
- The wrapper is argv-opaque: after the interlock cascade it forwards the whole argv to `git commit` (only
  destructive flags are inspected). stdin is inherited so the editor path works; `-F -` has no special handling
  and the wrapper never sees the message bytes.
- The project's own pre-commit hook already states the target philosophy — schema logic lives in TypeScript
  where it is unit-tested; the hook is a thin invoker — but its existing TS delegations use `npx tsx` against
  dev-repo source paths, a shape that cannot work in adopter repos (remediation owned by `quality-gate-hooks`;
  this WU establishes the adopter-safe pattern).

## Goals

- Deterministic message errors fail **before** `spawnGit` and the staged-content gates — a message-only retry
  never re-pays `pre-commit`.
- A shell-safe, byte-preserving transport shape is the documented canonical invocation for multiline messages.
- The commit-message grammar is implemented **once**, unit-tested, and shared by every validation surface —
  wrapper preflight, installed hook, standalone verb, and (later, out of scope) a CI range gate.
- Diagnostics identify exact offending lines and suggest the closest legal footer forms; output is identical at
  every surface.
- A commit that fails *after* a passing preflight is retryable without recomposing the message.
- The ordinary hook path is unweakened: valid commits still run `pre-commit` then `commit-msg`, and the
  installed hook remains defense in depth behind the preflight. Never stricter than raw git, as exemption
  parity — two deliberate exceptions recorded in the transport contract.

## Non-Goals

- **Grammar-policy evolution** — CC-spec conformance (optional scope, `!` marker, type-set extension) and scope
  vocabulary are `naming-conventions`' (capture routed 2026-07-14). This WU ships behavior parity with today's
  policy, representable in the parser.
- **Pre-commit check remediation** — migrating the existing `npx tsx` pre-commit delegations is
  `quality-gate-hooks`' (capture routed 2026-07-14). This WU changes no pre-commit check.
- **CI-side range validation** — a thin consumer of this module, owned by `quality-gate-hooks` (capture routed
  2026-07-14). This WU wires no CI step.
- **Backing-store existence semantics** — resolver target substrate and footer-name privacy under the
  materialized backing-store model are `arc-backend`'s (capture routed 2026-07-14). This WU confines
  existence-checking behind one injectable resolver so that swap is one seam.
- **Message-only content-gate caching** — explicitly deferred pending post-preflight field evidence; routed to
  capture 2026-07-14 with its correctness constraints recorded. Not built here.
- **Raising body-line caps** — limits are reassessed only after multiline input is ergonomic, and not by this WU.
- **Release authority, provenance, interlock routing** — unchanged; owned by `interlock-release-refinement`.
- **Interactive editor-authored message validation** — TTY-backed editor invocations stay on Git's ordinary hook
  path. The wrapper changes only the already-defined non-TTY editor trap, which receives an early ergonomic refusal.

## Proposed Design

### Validator module (TypeScript-canonical)

A new lib-layer module — `packages/arc-framework/src/lib/commit-check/` — implements the commit-message grammar
once, per the package's standard architecture (pure logic; process and filesystem dependencies injected).

**Parse, then police.** The parser represents the full Conventional Commits shape — optional scope, `!` breaking
marker, arbitrary types, subject/body/trailer structure. ARC's current strictness applies as a policy layer over
the parse: mandatory scope, the enforced type set (`feat fix chore docs refactor test perf revert`), subject
length bounds, footer requirement and grammar, body caps, dotted-phase rejection. Migration parity is therefore
a policy configuration; later grammar-policy evolution lands as policy/config edits, never a parser rewrite.

**Result typing.** Machine-stable findings each carry a stable code, severity (`error` / `warning`), structured
detail (actual/max lengths, truncated preview, suggestions), and a discriminated location: a message line, the
whole message, or a configuration key. The validated result remains three-valued — `pass` /
`pass-with-warnings` / `fail` — matching the hook's existing accept / pass-with-warning / reject behavior
(artifact-not-found and contributor advisories, and the `recommended`-mode footer downgrade, are warnings;
everything else that fires is an error). An outer outcome distinguishes `skipped` (disabled validation or a
merge exemption, with a typed reason) from `validated` (carrying the three-valued result), so exemption does not
invent a fourth verdict.

**Config surface (port parity).** The module consumes exactly the keys the Bash hook reads today, with
identical defaults, resolved from `arc-config.yml`:

| Key                          | Default        |
| ---------------------------- | -------------- |
| `hooks.commit_msg`           | `enabled`      |
| `commit.format`              | `conventional` |
| `commit.context_footer`      | `required`     |
| `commit.custom_pattern`      | (empty)        |
| `commit.context_pattern`     | (empty)        |
| `hooks.subject_max_length`   | `72`           |
| `hooks.body_max_lines`       | `100`          |
| `hooks.body_max_line_length` | `100`          |

Config-read parity — including bare-empty-value-means-default, quote stripping, and first-definition-wins semantics
from `arc-lib.sh` — is part of the port, verified by the fixture corpus. The first physical definition claims the
key before value normalization: a bare empty definition selects the default and masks later duplicates, while a
quoted empty definition is present, strips to an explicit empty string, and likewise masks later duplicates. The
shared TypeScript config parser is corrected from last-definition-wins to this first-definition-wins contract so
every validation surface resolves duplicates identically.

**Configuration domains.** After disabled and merge exemptions have short-circuited, active validation rejects
unknown enum values with configuration-located findings instead of inheriting the Bash hook's asymmetric case and
numeric-coercion behavior. `hooks.commit_msg`, `commit.format`, and `commit.context_footer` accept only their
documented values. Numeric limits must be unsigned base-10 safe integers; `hooks.subject_max_length` is at least
the fixed subject minimum of `10`, and both body maxima are at least `1`. Bare empty values still select defaults;
quoted empty values are explicit empty strings and proceed to the applicable active-domain or mode validation.
Empty custom patterns retain their existing mode-specific errors. This is an enumerated configuration-hardening
divergence: invalid active configuration fails validation consistently across the library, check verb, hook, and
wrapper rather than passing, emitting shell arithmetic noise, or coercing differently by rule.

The repository's integrity surface moves with that contract: both Framework copies of `validate-config.sh`
enforce the same numeric domains, and the package plus self-hosted configurable `arc-config.yml` comments name
the ECMAScript source and numeric bounds at the keys authors edit. The shell integrity check does not compile
custom patterns through a second regex engine; pattern syntax and migration diagnostics remain canonical in the
TypeScript validator.

**Custom-pattern dialect.** `commit.custom_pattern` and `commit.context_pattern` become ECMAScript `RegExp`
pattern source: no `/.../` delimiters or user-supplied flags, compiled with the built-in engine in Unicode mode.
The subject pattern tests the subject; the context pattern tests each logical message line without its line
terminator, preserving today's line-oriented target semantics. Matching remains unanchored unless the configured
source supplies anchors. This adds no runtime dependency and removes `grep` from pattern evaluation. The shipped
examples are in the common ERE/ECMAScript subset and remain valid; POSIX-only bracket, collating, and equivalence
classes receive a configuration-located migration diagnostic rather than being silently reinterpreted. The
dialect cutover is an enumerated migration divergence, not claimed Bash parity.

Length limits count Unicode code points, not UTF-16 code units or grapheme clusters. This makes non-BMP input
deterministic across platforms while retaining the existing shell hook's user-visible character semantics.

**Body-limit measurement domain.** Trailer parsing does not redefine the Bash policy's `body` region. For runaway
limits, physical line 1 is the subject, physical line 2 is unconditionally omitted, and every physical line from
line 3 onward remains in the measurement region, including trailers. The total limit counts non-empty lines only;
the per-line limit examines every line in the region. This raw-line policy stays separate from parsed body/trailer
structure so an overlong `Context:` line cannot become valid merely because it parsed as a trailer.

**Message encoding.** File and stdin adapters read raw bytes and resolve Git's `i18n.commitEncoding`, defaulting
to `utf-8`. They decode with the built-in `TextDecoder` in fatal mode before validation while retaining the
original bytes for transport and retry persistence. An unsupported encoding label or malformed byte sequence is
an infrastructure error, not a validation finding. This honors Git's repository-level encoding declaration
without an npm dependency and prevents silent replacement characters from changing grammar, lengths, or
diagnostics. Command-line `-m` values cross Node's Unicode-string argv boundary, which cannot preserve arbitrary
non-UTF-8 bytes and has no inverse encoder in the built-in API. The wrapper therefore assembles `-m` only when the
resolved decoder canonicalizes to `utf-8` and no value contains `U+FFFD`; other `-m` invocations pass through to
Git. File or stdin transport is the canonical path for non-UTF-8 messages. This conservative boundary retains the
dependency-free design without claiming bytes the process never received.

**Injected repo-state layer.** Everything repo-state-dependent sits behind one injected interface:

- **Artifact-existence resolver** — resolves `tasks-*` / `draft-*` / `spec-*` / `meta-*` references against
  the hook's per-type search sets, not one uniform directory set: `tasks-*` against `active/` only;
  `draft-*` / `spec-*` against `active/` plus `backlog/` (recursive); `meta-*` against `active/` plus
  `completed/` (recursive). Implemented on the filesystem today; the single seam the backing-store
  substrate later replaces. Returns `found` as soon as any allowed root matches; returns `not-found` only after
  every required root for that artifact family was inspected successfully; otherwise returns `unresolvable`
  (substrate unavailable — CI checkouts, unreadable roots, partial materialization). An absent family directory
  under an otherwise available `.arc` layout is an inspected empty root, while an unavailable `.arc` substrate
  is not. Policy maps `not-found` to today's advisory warning and `unresolvable` to **skip-with-note** (a
  pass-with-warning noting the check could not run) — an unavailable substrate never blocks a commit.
- **Exemption model** — the `hooks.commit_msg` enable flag, merge-in-progress (`MERGE_HEAD`), and advisory role
  context (`arc.role`, driving the contributor footer advisory). Preflight and shim read the same model, so
  preflight skips exactly where the hook exempts — a merge-resolution commit is never stricter under the
  wrapper than under raw git.

**`Context:` is formally a git trailer.** The parser reads and validates the footer per git trailer semantics —
final block, `Key: value`, continuation lines, last occurrence wins — preserving interop with
`git interpret-trailers`. Integration fixtures use `git interpret-trailers --parse` as the semantic oracle for
final-block boundaries, continuation folding, and repeated-trailer order; policy selects the last `Context:`
from that parsed sequence. This is a deliberate tightening over today's hook (which greps `^Context:` anywhere
and validates the first match), recorded in the migration corpus's divergence list with its intended post-flip
behavior.

### Public verb: `arc check commit-msg`

The delegation surface is a real CLI primitive, not hook-private plumbing:

```text
arc check commit-msg <file | ->   [--json]
```

Validates a message from a file (or stdin via `-`) without committing. Exit codes are stable and typed: `0`
pass (including pass-with-warnings and skipped validation), `1` validation failure, `2` usage or infrastructure
error (missing input, unreadable file, unsupported or malformed message encoding, failed repository setup).
Default output is the human diagnostic form. `--json` emits exactly one versioned envelope on stdout for every
return path: `{ schemaVersion, result }` for `skipped` or `validated` outcomes, or `{ schemaVersion, error }` for
typed usage / infrastructure errors. Commander parsing, repository-root resolution, and error rendering stay
behind this command-specific adapter so generic Clack guards or the global exit-`1` boundary cannot contaminate
the JSON or exit-`2` contract.

The `check` namespace is the generalization point: future hook checks migrating off dev-repo `npx tsx`
delegations adopt `arc check <name>` (that migration itself is `quality-gate-hooks`').

### Hook shim

At parity flip, the 409-line Bash hook is replaced by a thin shim that:

1. **Evaluates gating early-exits shell-side** — the `hooks.commit_msg` enable flag (via the existing
   `arc_config_get`) and the `MERGE_HEAD` merge exemption, both one-line checks needing no Node — so a disabled
   hook or an exempt merge commit stays a working no-op even when CLI resolution is broken.
2. **Resolves the installed CLI**: the repo-root `node_modules/.bin/arc` first (a repo-pinned dependency wins
   over any global install, so hook behavior tracks the repo's version — the local-first convention hook
   runners share; also the workspace-install / self-hosting shape), else `command -v arc` (the global-install
   shape) — never `npx`, `tsx`, or package-source paths.
3. **Delegates**: `arc check commit-msg "$1"`, forwarding the exit code verbatim.
4. **Fails closed** when neither resolution succeeds: exit non-zero with actionable remediation text naming the
   known failure contexts (GUI git clients, IDE-integrated commits, version-manager shims in non-interactive
   shells) and their fixes. Fail-closed applies to *enabled* validation only, per the shell-side early exits.

The shim carries no grammar. It lives in the existing hook slot (`system/.internal/githooks/commit-msg`, both
copies under the two-copy discipline) and is regenerated by `arc update` like any installed hook.

The two tracked source copies remain byte-identical regular files; installation is the authority that applies
executable mode to the installed hook. Hook-manager integrations must preserve the commit-message pathname as
one argument — in particular, Husky forwards `"$1"`, not unquoted `$1` — so repositories whose paths contain
spaces reach the same shim contract.

### Wrapper preflight and transport contract

The wrapper preflights **in-process** — a library call against the validator module, no subprocess — after the
interlock-validation cascade and before `spawnGit`. Preflight requires assembling the exact message
byte-for-byte, which narrows the wrapper's argv-opaque contract:

- **Recognized (assembled) forms**: one or more `-m` values (paragraphs joined per git's semantics), exactly one
  `-F <file>`, or exactly one `-F -` (the wrapper buffers stdin for that form instead of inheriting it) — recognized
  **only when no other message-affecting flag accompanies them**. Short forms may be separate, attached, or inside
  an unambiguous Git-style option cluster whose preceding members are known operand-free flags, so common forms such
  as `-am <message>`, `-am<message>`, and `-qam<message>` retain preflight. The wrapper reads a file source exactly
  once; those captured raw bytes are authoritative for both preflight and the Git invocation. `-m` additionally
  requires the UTF-8 argv
  boundary described above. A modifier git folds into the message the hook sees — `--trailer`, `-s`/`--signoff`,
  `--edit`, a forwarded `--cleanup`, a non-default `commit.cleanup`, `--fixup`, or `--squash` — produces bytes the
  assembler cannot replicate, so it demotes the invocation to pass-through. Demotion is always to pass-through,
  never to refusal — the wrapper is never stricter here.
- **Byte-exact means the bytes the hook receives**, not raw argv: the assembler replicates git's message
  assembly and default `whitespace` cleanup (trailing-whitespace strip, blank-line collapse) so preflight
  validates what `commit-msg` will actually see.
- **Pass-through forms**: anything the wrapper cannot assemble byte-exactly — `-t`, `-c`/`-C` and other
  template/reuse flags, non-UTF-8 `-m`, the editor path (no `-m`/`-F`, stdin stays inherited), an active
  `prepare-commit-msg` hook, and any modifier-demoted form above — skips preflight and proceeds to the ordinary
  hook path. Ambiguous or invalid source grammar also remains Git-owned: mixed `-m` / `-F`, repeated `-F`, missing
  operands, unrecognized or negated source forms, and clusters whose operand grammar is unknown or ambiguous pass
  through rather than being reinterpreted. The classifier honors `--`; every later token is a pathspec even when it
  resembles a message flag. (`--amend` never reaches form classification: it stays unconditionally refused by the
  wrapper's unchanged destructive-flag cascade — amends route through raw git.)
- **Early refusal**: the invocation is editor-bound (git would launch an editor — no message source, or
  `--edit`, `-c`, `-t`, editor-bound `--fixup=amend:` / `--fixup=reword:`, or `--squash` without an explicit
  message source) while stdin is not a TTY — the agent-invocation editor trap. Preflight refuses immediately,
  showing the canonical shape, rather than letting git fail into a missing-editor path. Editor-free reuse forms
  (`-C` and plain `--fixup=<commit>`) remain ordinary pass-through. A Git-oracle truth table covers these forms,
  explicit-source interactions, missing operands, and the option terminator rather than inferring editor behavior
  from a flag name alone.
- **Classification precedence (closed rule)**: destructive-flag refusal → assembled → early refusal →
  pass-through, evaluated in that order. An editor-bound invocation under non-TTY stdin is refused even though
  its flag also appears in the pass-through enumeration; with a TTY it passes through. Nothing outside these
  four outcomes exists, so the classifier never guesses.

Short-option handling uses one small table-driven lexical walker rather than a general argument-parser dependency.
It models operand-free, required-operand, and ambiguous / optional-operand members only far enough to identify
message sources, message modifiers, and editor behavior; an operand-taking member ends its cluster. Classification
passes unsupported grammar to Git. Release-commit audit sanitization reuses the same walk, honors `--`, preserves
the caller's option shape, and redacts separated, attached, and clustered `-m` payloads on every audit outcome
(`-am secret` becomes `-am <redacted>`; `-qamsecret` becomes `-qam<redacted>`). If unsupported pre-terminator
grammar could plausibly contain an embedded `-m` payload, sanitization redacts it conservatively even when Git
will later reject the invocation; message content never enters the audit log.

**File-source handoff.** A passing assembled `-F <file>` invocation never asks Git to reopen the mutable caller
path. After validation, the adapter writes the captured raw source bytes to a unique transient file under the
absolute worktree git directory, using mode `0600` where supported, rewrites only the spawned Git argv's file
operand to that snapshot, and retains inherited stdin. Git therefore performs its ordinary cleanup over the same
source bytes the assembler used, while hooks see the same stdin behavior as raw `git commit -F <file>`. The audit
entry retains sanitized caller argv, not the internal path. Snapshot creation or write failure is an input-reason
preflight refusal; the adapter removes the snapshot after the Git process settles, and a cleanup failure is visible
without masking Git's result. Buffered `-F -` continues to pipe the captured caller stdin directly. `-m` needs no
snapshot because the process already owns its immutable argv strings.

**Recorded scope of "never stricter than raw git."** The invariant is exemption parity: preflight skips exactly
where the hook exempts. Two deliberate exceptions are accepted: the early editor-trap refusal above refuses an
invocation raw git could complete under a non-interactive `GIT_EDITOR` (accepted ergonomics — the canonical
shapes make intent explicit); and preflight validates even where the hook file is not wired (broken or partial
hook installation) — the `hooks.commit_msg` enable flag, not hook-file presence, is the intent signal for
disabling validation. A repo-local `prepare-commit-msg` hook may mutate the submitted source before `commit-msg`;
because that can repair an initially invalid message as well as invalidate a passing one, the wrapper detects the
runnable hook at Git's resolved hook path and demotes the invocation to pass-through. The installed `commit-msg`
hook validates the post-mutation bytes on that path.

**Canonical shapes.** Exact message-file/stdin transport is the canonical wrapper path — `-F -` with a quoted
heredoc as the primary documented shape. Where a harness allowlist matcher cannot verify redirection syntax, the
canonical degrades to direct prepared-file argv: write the message file, then invoke `arc release commit -F
<file>` without a shell wrapper. Codex documents shell scripts containing redirection as unsplittable for inner
prefix-rule matching; the direct argv form is verified with `codex execpolicy check` rather than assumed safe
from a generic word-only grammar.

**Preflight failure semantics.** A validation or assembled-input failure exits before `spawnGit` with refusal
code `16`, identifier `commit-message-preflight-failed`, and one release-commit audit outcome shaped as
`{ kind: "preflight-failed", reason: "validation" | "input" }`. The broader reason keeps unreadable sources,
stdin failures, and unsupported or malformed encodings audited without storing message content. Validation
diagnostics are the validator's — identical to what the hook would have printed — with one wrapper-surface
addition: the failure output ends with the safe invocation shape (quoted-heredoc `-F -`, or the matcher-degraded
`-F <file>` where that applies), so the transport remedy is visible at the point of failure, not only in the
durable `commit-format` guidance.

**Audit schema cutover.** The new outcome is the forcing function anticipated by the accepted v1 schema lock.
Before the first public release, all release audit writers move together to `schemaVersion: 2`; the runtime
validator accepts only the settled v2 entry shape, with `preflight-failed` legal only for `release-commit`, code
`16`, and decision `refused`. No v1 reader, mixed-version compatibility layer, or audit-file migration is built:
there is no published consumer contract yet, and existing local development logs are not authoritative state.

### Retry without recomposition

A commit that returns non-zero *after* a passing assembled preflight must not force message recomposition. The
wrapper deliberately does not infer a hook boundary from Git's text output: every resolved non-zero Git result
after successful preflight qualifies, while pass-through and preflight-failure paths never persist guessed or
rejected bytes. The wrapper holds the assembled bytes and atomically replaces one latest-retry file under the
worktree's absolute git dir (resolved via `git rev-parse --absolute-git-dir`, so linked worktrees each get their
own). The file is created with mode `0600` where supported. Failure output names a host-shell-quoted reuse path
(`arc release commit -F <path>`); a write failure is diagnostic but never masks Git's original exit code and
never prints an unusable reuse command. A later qualifying failure replaces the file, and a successful wrapper
invocation that consumed that exact retry file removes it so the wrapper-owned path does not become the same
stale-reuse trap as `.git/COMMIT_EDITMSG`. Git writes `COMMIT_EDITMSG` only after `pre-commit` passes, so it is
never offered as a retry source.

### Diagnostics — implemented once, shared everywhere

Every line-specific finding reports its message-line number, actual/max lengths where applicable, and a safely
truncated preview. Whole-message and configuration findings name their typed location without manufacturing a
line number. Deterministic footer errors suggest the closest legal forms rather than dumping the complete
grammar. Both the wrapper preflight and the hook shim emit the same output because they run the same module. No
silent wrapping or rewriting of author prose — the validator reports; the author decides.

### Migration by differential fixture testing

The Bash rules port against a shared fixture corpus under the package's test tree:

- **Three-valued** — accept, reject, and pass-with-warning fixtures — so warning semantics cannot silently
  harden into errors at the flip.
- **Parity modulo an enumerated divergence list** — where the design deliberately tightens the Bash hook's
  mechanical looseness (trailer position, continuation folding, and last-occurrence strictness) or replaces its
  implicit POSIX ERE dialect with explicit ECMAScript pattern source, or hardens invalid active configuration
  domains, the corpus encodes the divergence with its intended post-flip behavior: a recorded cutover, not silent
  drift.
- **Differential during development** — both implementations run against the corpus (the Bash hook via a test
  harness invoking the hook script; the TS module via unit tests) until they agree modulo the divergence list.
  The hook flips to the shim **only at parity**.
- **Durable after the flip** — the corpus survives as the single acceptance suite, covering grammar, limits,
  configuration parity, encoding, and diagnostics, so behavior cannot drift while only one implementation
  remains.

### Documentation cascade

Transport is documented once; the cascade when it ships:

- **`commit-format` method** — the durable home for submission guidance. It presents the same quoted-heredoc
  `-F -` and prepared `-F <file>` transports for both routed command prefixes: `arc release commit` when the
  release route is active, raw `git commit` otherwise. Wrapper-only preflight and latest-retry behavior stay
  labeled as such.
- **Release-wrapper setup doc** — its invocation examples show single-line `-m`, contradicting every multi-line
  template the workflows emit. Updated as a capability-based matcher-compatibility edit, not an examples-only
  touch. Codex compatibility is grounded through direct prepared-file argv plus `codex execpolicy check`: its
  documented rules engine does not split shell scripts containing redirection, so a heredoc is never claimed
  prefix-rule-compatible. Other harnesses use the heredoc only after their resident matcher verifies it. Push
  examples use canonical argument-free `arc release push`.
- **Configuration authority** — update both Framework copies of `validate-config.sh` and the targeted framework
  sections in the package/self-hosted `arc-config.yml` copies so integrity validation and inline key documentation
  agree with the canonical validator without overwriting project-specific config values.
- **Git-hook operator README** — replace Bash-validator customization instructions with the shim architecture,
  local-first CLI resolution, `arc check commit-msg`, ECMAScript pattern configuration, and enabled-validation
  fail-closed behavior. Direct shell customization guidance remains only for shell-owned hooks.
- **`QUICK-REFERENCE`** — replace its `arc release commit -m` invocation with the canonical shape, document the
  standalone `arc check commit-msg <file | -> [--json]` surface, and publish the actual refusal family through
  code `16` rather than the stale `10–14` / `no-active-wu` list.
- **`commit-footer` method** — verify against the trailer tightening; expected to need at most a one-line note.
- **`arc-commit` / `prepare-commits`** — inherit through their method load; verify at execution, likely no edit.
- **Workflow-authoring strategy** — selects the routed command and delegates transport to `commit-format`; it no
  longer recommends `git commit -m`. Lifecycle and task-processing fire-points remain content-only.
- **Release-wrapper trust record** — append a dated Tier 2 amendment to accepted `ADR-017`; the wrapper remains the
  trust boundary, while the amendment records the later no-WU ambiguity behavior, refusal codes through `16`,
  commit-message preflight, the clean audit-schema-v2 cutover, and its audited outcome without rewriting the
  point-in-time decision.

**Fire-point invariance.** Workflow commit fire-points stay content-only — message template plus class tag,
transport delegated — so no lifecycle- or task-processing-workflow edits ship with this WU. The authoring
strategy changes because it defines that delegation contract rather than carrying a concrete fire-point.

### First-release skew posture

The shim and CLI establish their contract together at first public release; no legacy-pair support or migration
machinery is built. The contract stays deliberately minimal — pass a file path and interpret an exit code — and
`arc update` regenerates hooks alongside the CLI. A resolved CLI without the verb fails delegation closed with
its own unknown-command error; the shim adds no version negotiation or compatibility branch.

## Alternatives & Rationale

- **Bash-canonical (extend the current hook; wrapper shells out to it).** Rejected: suggestion-quality
  diagnostics in Bash do not scale; the 409 untested lines are the existing liability; a bash-from-Node leg is
  the weakest cross-platform link; and it contradicts the project's own stated hook philosophy.
- **Two maintained implementations (TS preflight + Bash hook).** Rejected: grammar drift between surfaces is
  the exact disease; the differential corpus exists to end dual implementations, not institutionalize them.
- **Subprocess preflight (wrapper spawns `arc check`).** Rejected: the wrapper and validator share a package,
  so in-process is free — no startup cost, no output re-parsing, typed results.
- **Preserve POSIX ERE via `grep`, a native binding, or WASM.** Rejected: a subprocess retains the platform seam
  this design removes, while native and WASM engines add install or bundle weight for trusted repository
  configuration. The built-in ECMAScript engine keeps adopter dependencies unchanged; explicit migration
  diagnostics are safer than a partial ERE-to-ECMAScript translator.
- **`npx` / `tsx` delegation in the shim.** Rejected: broken in adopter repos (dev-repo source paths, absent
  dev dependencies) — the misfire `quality-gate-hooks` is remediating elsewhere.
- **A git-config CLI-path override (e.g. `arc.cliPath`) in the shim's resolution chain.** Considered, deferred
  on field evidence: it cannot fix the dominant failure mode (`node` itself absent from PATH in GUI /
  version-manager contexts — the pinned script still dies at the `env node` lookup), it rots silently on every
  Node version bump for exactly the users who set it, and adding a key later is cheap while removing one is
  breaking. The two-step chain plus fail-closed remediation covers the real contexts.
- **Message-only content-gate caching.** Deferred (captured 2026-07-14): post-preflight, the residual win is
  confined to unpreflighted paths (editor-path, passthrough forms, raw git); a correctness-critical cache whose
  key must bound "everything `pre-commit` might read" is not justified until field evidence shows that residual
  pain.
- **Raising the body-line cap instead.** Rejected: the caps are backstops, not the friction; limits are
  reassessed only after multiline input is ergonomic.

## Cross-cutting Considerations

- **Testing.** Unit: parser, policy layer, classifier truth table, assembler (paragraph joining, cleanup
  replication), diagnostics.
  Integration: the differential corpus run (both implementations pre-flip), config-read parity, resolver
  degradation cases. E2E: wrapper preflight flow (fail-before-`pre-commit` observable), shim delegation and
  fail-closed path in a temp repo. The shim stays shellcheck-clean under the existing `lint:sh` gate.
- **Performance.** Preflight is in-process — negligible. The shim adds one Node boot to every `commit-msg` run
  (order ~100ms) where the Bash hook was subprocess-free; accepted as the price of a single tested
  implementation, and offset in practice by preflight eliminating repeated `pre-commit` runs on message
  retries.
- **Security / trust.** No new privileges; custom patterns are trusted repository configuration evaluated only
  during local commit validation, so no separate regex engine is introduced. Fail-closed applies to enabled
  validation only; the wrapper's destructive-flag refusals and audit logging are unchanged (preflight adds an
  outcome kind, removes nothing). The persisted retry file lives under the absolute worktree git dir, is
  untracked, atomically replaced with restrictive permissions where supported, and removed after successful
  consumption.
- **Cross-platform.** The shim runs under Git-for-Windows `sh` on Windows; both resolution legs
  (`node_modules/.bin/arc`, `command -v arc`) are sh-compatible npm shims. Message decoding uses Node's built-in
  `TextDecoder`; no platform codec executable or npm encoding package is introduced. The wrapper's transport
  path avoids any bash-from-Node leg by construction.
- **First release.** Shim and CLI establish the matched contract together; no compatibility migration is required.
  Self-hosting follows the two-copy discipline: package source is authoritative; the `.arc/` instance syncs in the
  same change. The flip lands only at demonstrated corpus parity within this WU.

## Success Criteria

1. An invalid deterministic message submitted through the wrapper fails **before** `spawnGit`: no `pre-commit`
   output appears, the exit code is the preflight refusal code, and an audit entry with the preflight outcome
   kind is written under the settled v2 audit schema. Every release-commit outcome redacts message payloads from
   separate, attached, and combined short-option forms.
2. A multiline message submitted via the canonical quoted-heredoc `-F -` shape (and via `-F <file>`) reaches
   the hook byte-identical to the assembled preflight input — newlines preserved, no interpolation. Mutating the
   original file after wrapper capture cannot change the committed bytes; the transient snapshot is removed after
   Git settles and file-backed invocations retain inherited stdin.
3. The fixture corpus passes three-valued (accept / reject / pass-with-warning) against both implementations
   pre-flip, modulo only the enumerated divergence list; post-flip it passes against the single TS
   implementation and runs in the standard test suite.
4. Diagnostics locate findings at the offending message line, whole message, or configuration key as
   applicable; line findings include actual/max values and a truncated preview, and an invalid footer suggests
   the closest legal forms rather than the full grammar dump.
5. Valid commits still run `pre-commit` then `commit-msg`; a disabled hook and a merge-exempt commit no-op in
   the shim without Node; with the CLI unresolvable, the shim fails closed with the remediation text.
6. `arc check commit-msg` validates a message from file and stdin standalone with the documented exit-code
   typing and one JSON envelope on every return path, including skipped validation and usage / infrastructure
   failures.
7. Any resolved non-zero Git result after successful assembled preflight leaves a restrictively written,
   worktree-local latest-retry file whose shell-quoted path is named in the failure output; retrying with
   `-F <that path>` reproduces the message byte-exactly and successful consumption removes the file.
   `.git/COMMIT_EDITMSG` is never referenced.
8. All eight config keys honor the Bash hook's defaults, quote handling, and first-definition-wins behavior,
   including bare-empty-first and quoted-empty-first duplicate definitions; custom patterns use the documented
   ECMAScript migration semantics, and the resolver's `unresolvable` state produces a pass-with-note, never a block.
   Unknown active enums and unsafe or out-of-domain numeric limits emit configuration-located failures consistently
   rather than inheriting shell coercion.
9. UTF-8 and a non-UTF-8 encoding accepted by the built-in decoder validate from both file and stdin without
   changing their source bytes; unsupported labels and malformed byte sequences exit `2` on the standalone verb
   and map to audited preflight code `16` for assembled wrapper input. Non-UTF-8 or replacement-bearing `-m`
   values pass through without an encoder dependency.
10. A real `git commit` invokes the installed executable shim through `core.hooksPath`; source-copy mode is not
    mistaken for installed mode, and a repository path containing spaces reaches the message file as one
    argument through supported hook-manager forwarding.
11. Durable commit guidance is route-aware; config integrity and inline comments match runtime domains; hook and
    setup docs describe the shim and verified matcher boundaries; `QUICK-REFERENCE` documents
    `arc check commit-msg` plus refusal codes `10–16`; workflow fire-points remain content-only, and accepted
    `ADR-017` carries a dated append-only amendment for the expanded trust surface and clean v2 audit cutover.

## Open Questions

None blocking — all settle-able design is settled above. Remaining latitude (module file layout, exact
remediation and suggestion wording, JSON envelope field names, corpus file format) is ordinary implementation
detail within the decided design.
