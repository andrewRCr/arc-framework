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
- **The editor path** — interactive `git commit` / editor-driven wrapper invocations are untouched.

## Proposed Design

### Validator module (TypeScript-canonical)

A new lib-layer module — `packages/arc-framework/src/lib/commit-check/` — implements the commit-message grammar
once, per the package's standard architecture (pure logic; process and filesystem dependencies injected).

**Parse, then police.** The parser represents the full Conventional Commits shape — optional scope, `!` breaking
marker, arbitrary types, subject/body/trailer structure. ARC's current strictness applies as a policy layer over
the parse: mandatory scope, the enforced type set (`feat fix chore docs refactor test perf revert`), subject
length bounds, footer requirement and grammar, body caps, dotted-phase rejection. Migration parity is therefore
a policy configuration; later grammar-policy evolution lands as policy/config edits, never a parser rewrite.

**Result typing.** Machine-stable findings, each carrying a stable code, severity (`error` / `warning`),
message-line number, and detail (actual/max lengths, truncated preview, suggestions). Overall verdict is
three-valued — `pass` / `pass-with-warnings` / `fail` — matching the hook's existing accept /
pass-with-warning / reject behavior (artifact-not-found and contributor advisories, and the `recommended`-mode
footer downgrade, are warnings; everything else that fires is an error).

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

Config-read parity — including empty-value-means-default and quote-stripping semantics from `arc-lib.sh` — is
part of the port, verified by the fixture corpus.

**Injected repo-state layer.** Everything repo-state-dependent sits behind one injected interface:

- **Artifact-existence resolver** — resolves `tasks-*` / `draft-*` / `spec-*` / `meta-*` references against
  the hook's per-type search sets, not one uniform directory set: `tasks-*` against `active/` only;
  `draft-*` / `spec-*` against `active/` plus `backlog/` (recursive); `meta-*` against `active/` plus
  `completed/` (recursive). Implemented on the filesystem today; the single seam the backing-store
  substrate later replaces. Returns `found` / `not-found` / `unresolvable` (substrate unavailable — CI
  checkouts, partial materialization). Policy maps `not-found` to today's advisory warning and `unresolvable`
  to **skip-with-note** (a pass-with-warning noting the check could not run) — an unavailable substrate never
  blocks a commit.
- **Exemption model** — the `hooks.commit_msg` enable flag, merge-in-progress (`MERGE_HEAD`), and advisory role
  context (`arc.role`, driving the contributor footer advisory). Preflight and shim read the same model, so
  preflight skips exactly where the hook exempts — a merge-resolution commit is never stricter under the
  wrapper than under raw git.

**`Context:` is formally a git trailer.** The parser reads and validates the footer per git trailer semantics —
final block, `Key: value`, last occurrence wins — preserving interop with `git interpret-trailers`. This is a
deliberate tightening over today's hook (which greps `^Context:` anywhere and validates the first match),
recorded in the migration corpus's divergence list with its intended post-flip behavior.

### Public verb: `arc check commit-msg`

The delegation surface is a real CLI primitive, not hook-private plumbing:

```text
arc check commit-msg <file | ->   [--json]
```

Validates a message from a file (or stdin via `-`) without committing. Exit codes are stable and typed: `0`
pass (including pass-with-warnings), `1` validation failure, `2` usage or infrastructure error (unreadable
file, malformed invocation). Default output is the human diagnostic form; `--json` emits a versioned envelope
of the machine-stable findings, consistent with the CLI's existing JSON-envelope idiom.

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

### Wrapper preflight and transport contract

The wrapper preflights **in-process** — a library call against the validator module, no subprocess — after the
interlock-validation cascade and before `spawnGit`. Preflight requires assembling the exact message
byte-for-byte, which narrows the wrapper's argv-opaque contract:

- **Recognized (assembled) forms**: repeated `-m` (paragraphs joined per git's semantics), `-F <file>`, and
  `-F -` (the wrapper buffers stdin for that form instead of inheriting it) — recognized **only when no other
  message-affecting flag accompanies them**. A modifier git folds into the message the hook sees — `--trailer`,
  `-s`/`--signoff`, `--edit`, a forwarded `--cleanup`, a non-default `commit.cleanup` — produces bytes the
  assembler cannot replicate (verified live for `--trailer`/`--signoff`), so it demotes the invocation to
  pass-through. Demotion is always to pass-through, never to refusal — the wrapper is never stricter here.
- **Byte-exact means the bytes the hook receives**, not raw argv: the assembler replicates git's message
  assembly and default `whitespace` cleanup (trailing-whitespace strip, blank-line collapse) so preflight
  validates what `commit-msg` will actually see.
- **Pass-through forms**: anything the wrapper cannot assemble byte-exactly — `-t`, `-c`/`-C` and other
  template/reuse flags, the editor path (no `-m`/`-F`, stdin stays inherited), and any modifier-demoted form
  above — skips preflight and proceeds to the ordinary hook path. Never guessed at. (`--amend` never reaches
  form classification: it stays unconditionally refused by the wrapper's unchanged destructive-flag cascade —
  amends route through raw git.)
- **Early refusal**: the invocation is editor-bound (git would launch an editor — no message source, or
  `--edit`, `-c`, `-t`) while stdin is not a TTY — the agent-invocation editor trap. Preflight refuses
  immediately, showing the canonical shape, rather than letting git fail into a missing-editor path.
  Editor-free reuse forms (`-C`) remain ordinary pass-through.
- **Classification precedence (closed rule)**: destructive-flag refusal → assembled → early refusal →
  pass-through, evaluated in that order. An editor-bound invocation under non-TTY stdin is refused even though
  its flag also appears in the pass-through enumeration; with a TTY it passes through. Nothing outside these
  four outcomes exists, so the classifier never guesses.

**Recorded scope of "never stricter than raw git."** The invariant is exemption parity: preflight skips exactly
where the hook exempts. Two deliberate exceptions are accepted: the early editor-trap refusal above refuses an
invocation raw git could complete under a non-interactive `GIT_EDITOR` (accepted ergonomics — the canonical
shapes make intent explicit); and preflight validates even where the hook file is not wired (broken or partial
hook installation) — the `hooks.commit_msg` enable flag, not hook-file presence, is the intent signal for
disabling validation. A repo-local `prepare-commit-msg` hook may still mutate the message between preflight and
`commit-msg`; the installed hook remains the backstop on that path.

**Canonical shapes.** Exact message-file/stdin transport is the canonical wrapper path — `-F -` with a quoted
heredoc as the primary documented shape. Where a harness allowlist matcher has a word-only grammar that cannot
absorb redirection shapes (the Codex matcher boundary recorded in the release-wrapper strategy), the canonical
degrades to `-F <file>`: write the message file, then a plain positional invocation — same wrapper path,
matcher-safe.

**Preflight failure semantics.** A preflight validation failure exits before `spawnGit` with a dedicated
refusal-family exit code (next free code in the wrapper's existing family) and writes an audit entry with a
distinct outcome kind. Diagnostics are the validator's — identical to what the hook would have printed — with
one wrapper-surface addition: the failure output ends with the safe invocation shape (quoted-heredoc `-F -`, or
the matcher-degraded `-F <file>` where that applies), so the transport remedy is visible at the point of
failure, not only in the durable `commit-format` guidance.

### Retry without recomposition

A commit that fails *after* a passing preflight (staged-content gates) must not force message recomposition.
The wrapper already holds the assembled bytes at preflight; on a post-preflight failure it persists them to a
wrapper-owned message file under the worktree's git dir (resolved via `git rev-parse --git-dir`, so linked
worktrees each get their own), and names that path in the failure output as the reuse path
(`arc release commit -F <path>`). `.git/COMMIT_EDITMSG` is never named for this: git writes it only after
`pre-commit` passes, so on a content-gate failure it still holds the *prior* commit's message — a stale-reuse
trap.

### Diagnostics — implemented once, shared everywhere

Every offending line reports its message-line number, actual/max lengths where applicable, and a safely
truncated preview. Deterministic footer errors suggest the closest legal forms rather than dumping the complete
grammar. Both the wrapper preflight and the hook shim emit the same output because they run the same module.
No silent wrapping or rewriting of author prose — the validator reports; the author decides.

### Migration by differential fixture testing

The Bash rules port against a shared fixture corpus under the package's test tree:

- **Three-valued** — accept, reject, and pass-with-warning fixtures — so warning semantics cannot silently
  harden into errors at the flip.
- **Parity modulo an enumerated divergence list** — where the design deliberately tightens the Bash hook's
  mechanical looseness (trailer position / last-occurrence strictness), the corpus encodes the divergence with
  its intended post-flip behavior: a recorded tightening at cutover, not silent drift.
- **Differential during development** — both implementations run against the corpus (the Bash hook via a test
  harness invoking the hook script; the TS module via unit tests) until they agree modulo the divergence list.
  The hook flips to the shim **only at parity**.
- **Durable after the flip** — the corpus survives as the single acceptance suite, covering grammar, limits,
  configuration parity, and diagnostics, so behavior cannot drift while only one implementation remains.

### Documentation cascade

Transport is documented once; the cascade when it ships:

- **`commit-format` method** — the durable home for submission guidance: the canonical quoted-heredoc `-F -`
  shape, the matcher-degraded `-F <file>` shape and when it applies, and the retry path.
- **Release-wrapper setup doc** — its invocation examples show single-line `-m`, contradicting every multi-line
  template the workflows emit. Updated as a matcher-compatibility edit (per-harness guidance for
  word-only-grammar matchers), not an examples-only touch.
- **`QUICK-REFERENCE`** — update its own `arc release commit -m` invocation example to the canonical shape, plus
  a pointer to the `commit-format` guidance.
- **`commit-footer` method** — verify against the trailer tightening; expected to need at most a one-line note.
- **`arc-commit` / `prepare-commits`** — inherit through their method load; verify at execution, likely no edit.

**Fire-point invariance.** Workflow commit fire-points stay content-only — message template plus class tag,
transport delegated — so no lifecycle-workflow edits ship with this WU.

### Version-skew posture

Validation behavior is versioned with the installed CLI. The shim↔CLI contract is deliberately minimal — pass a
file path, interpret an exit code — and the shim carries no grammar, so a version-skewed pair degrades to the
older CLI's validation behavior rather than to breakage, for any CLI version carrying the `check` verb;
`arc update` regenerates hooks alongside the CLI, restoring the matched pair. One boundary case is accepted and
recorded rather than mechanized: a resolved CLI predating the verb entirely fails the delegation closed with
the CLI's own unknown-command error (not the shim's remediation text) — reachable only when the repo pins a CLI
older than the install that wrote the shim, a repo-visible mismatch whose fix is updating the pin. No
additional skew mechanism is built.

## Alternatives & Rationale

- **Bash-canonical (extend the current hook; wrapper shells out to it).** Rejected: suggestion-quality
  diagnostics in Bash do not scale; the 409 untested lines are the existing liability; a bash-from-Node leg is
  the weakest cross-platform link; and it contradicts the project's own stated hook philosophy.
- **Two maintained implementations (TS preflight + Bash hook).** Rejected: grammar drift between surfaces is
  the exact disease; the differential corpus exists to end dual implementations, not institutionalize them.
- **Subprocess preflight (wrapper spawns `arc check`).** Rejected: the wrapper and validator share a package,
  so in-process is free — no startup cost, no output re-parsing, typed results.
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

- **Testing.** Unit: parser, policy layer, assembler (paragraph joining, cleanup replication), diagnostics.
  Integration: the differential corpus run (both implementations pre-flip), config-read parity, resolver
  degradation cases. E2E: wrapper preflight flow (fail-before-`pre-commit` observable), shim delegation and
  fail-closed path in a temp repo. The shim stays shellcheck-clean under the existing `lint:sh` gate.
- **Performance.** Preflight is in-process — negligible. The shim adds one Node boot to every `commit-msg` run
  (order ~100ms) where the Bash hook was subprocess-free; accepted as the price of a single tested
  implementation, and offset in practice by preflight eliminating repeated `pre-commit` runs on message
  retries.
- **Security / trust.** No new privileges; fail-closed applies to enabled validation only; the wrapper's
  destructive-flag refusals and audit logging are unchanged (preflight adds an outcome kind, removes nothing).
  The persisted retry file lives under `.git/`, untracked and worktree-local.
- **Cross-platform.** The shim runs under Git-for-Windows `sh` on Windows; both resolution legs
  (`node_modules/.bin/arc`, `command -v arc`) are sh-compatible npm shims. The wrapper's transport path avoids any
  bash-from-Node leg by construction.
- **Rollout.** Adopters receive shim + CLI together via `arc update` hook regeneration (version-skew posture
  above). Self-hosting follows the two-copy discipline: package source is authoritative; `.arc/` instance
  syncs in the same change. The flip lands only at demonstrated corpus parity within this WU.

## Success Criteria

1. An invalid deterministic message submitted through the wrapper fails **before** `spawnGit`: no `pre-commit`
   output appears, the exit code is the preflight refusal code, and an audit entry with the preflight outcome
   kind is written.
2. A multiline message submitted via the canonical quoted-heredoc `-F -` shape (and via `-F <file>`) reaches
   the hook byte-identical to the assembled preflight input — newlines preserved, no interpolation.
3. The fixture corpus passes three-valued (accept / reject / pass-with-warning) against both implementations
   pre-flip, modulo only the enumerated divergence list; post-flip it passes against the single TS
   implementation and runs in the standard test suite.
4. Diagnostics for a failing message name the offending message-line numbers with actual/max values and a
   truncated preview; an invalid footer's output suggests the closest legal forms, not the full grammar dump.
5. Valid commits still run `pre-commit` then `commit-msg`; a disabled hook and a merge-exempt commit no-op in
   the shim without Node; with the CLI unresolvable, the shim fails closed with the remediation text.
6. `arc check commit-msg` validates a message from file and stdin standalone with the documented exit-code
   typing and a `--json` envelope of machine-stable findings.
7. A post-preflight content-gate failure leaves a wrapper-owned message file whose path is named in the failure
   output, and retrying with `-F <that path>` reproduces the message byte-exactly; `.git/COMMIT_EDITMSG` is
   never referenced.
8. All eight config keys are honored with defaults and semantics identical to the Bash hook (corpus-verified),
   and the resolver's `unresolvable` state produces a pass-with-note, never a block.

## Open Questions

None blocking — all settle-able design is settled above. Remaining latitude (module file layout, exact
remediation and suggestion wording, JSON envelope field names, corpus file format) is ordinary implementation
detail within the decided design.
