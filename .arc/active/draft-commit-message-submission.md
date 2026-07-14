# Draft: Commit-Message Submission

- **Origin:** `USER-INBOX § Work Unit`, housekeep drain (2026-07-13); recurring friction observed during
  `review-gate-enforcement-cutover` commit/review follow-up. Consolidates the overlapping release-wrapper
  invocation item formerly held by `draft-interlock-release-refinement.md`.
- **Purpose:** Make deterministic commit-message submission shell-safe, preflighted before expensive staged-content
  checks, diagnostically repairable, and cheap to retry without weakening Git's normal hooks.
- **Readiness:** formalization-ready — architecture settled at the 2026-07-14 grooming pass; adversarial loop
  converged same day (two passes, all findings folded); remaining open items are spec-time detail, not direction.

## Problem

`arc release commit` validates release authority and then forwards arguments to `git commit`. Git runs the expensive
`pre-commit` hook before `commit-msg`, so deterministic message errors surface only after the staged-content gate;
every message-only retry repeats that cost. The agent-facing invocation is also easy to misuse: double-quoted `\n`
stays literal in Bash, while repeated `-m` values create paragraphs rather than controlled wrapped lines.

Observed failures include a literal `\n` collapsing body and footer into one long line, and an invalid footer
(`Task 2.4; code review`) eliciting the complete grammar rather than the closest legal alternatives. These failures
recur across sessions because the wrapper's submission interface does not make the safe path obvious or early.

### Grounded architecture facts (2026-07-14)

- All commit-message validation lives in the installed `commit-msg` git hook — ~409 lines of pure Bash
  (`grep -E`/`sed`/`awk`), config-driven: subject format and length, the full `Context:` footer grammar
  (including filesystem existence checks against `.arc/active|backlog|completed`), body line caps, and the
  dotted-phase rejection. No TypeScript validator exists anywhere in the CLI.
- The wrapper is argv-opaque: after the interlock cascade it forwards the whole argv verbatim to `git commit`
  (only destructive flags are inspected). stdin is inherited so the editor path works; `-F -` has no special
  handling and the wrapper never sees the message bytes.
- The project's own pre-commit hook already states the target philosophy — "schema logic lives in TypeScript
  where it is unit-tested; this hook is a thin invoker" — but its existing TS delegations use `npx tsx` against
  dev-repo source paths, a shape that cannot work in adopter repos (see Boundaries: the remediation routes to
  `quality-gate-hooks`; this WU establishes the adopter-safe pattern).

## Settled Direction (grooming, 2026-07-14)

1. **TypeScript-canonical validator.** The commit-message grammar is implemented once, as an exported,
   unit-tested TS module in the CLI package. The wrapper preflights **in-process** — a library call, no
   subprocess — and the installed `commit-msg` hook becomes a thin shim delegating to the installed `arc` CLI.
   Rationale: ecosystem idiom (the commitlint shape — JS validation, thin hook shim), consistency with the
   project's own stated hook philosophy, cross-platform strength (no bash-from-Node leg for the wrapper), and
   diagnostics maintainability (suggestion logic in Bash does not scale). This is realized cross-language design
   authoring: `Class` ratchets `Light → Heavy` (write lands at the draft-capture ceremony).
2. **Adopter-safe delegation shape, designed to generalize.** The hook shim invokes a real installed-CLI
   subcommand — never `npx`, `tsx`, or package-source paths. The subcommand surface is named so future hook
   checks can adopt the same pattern (exact namespace settled at spec time). Node/CLI resolution failure at hook
   runtime **fails closed** with actionable remediation text (the known PATH failure contexts: GUI git clients,
   IDE-integrated commits, version-manager shims in non-interactive shells). Fail-closed applies to *enabled*
   validation only, and the exemption-evaluation boundary is settled as: **gating early-exits evaluate
   shell-side in the shim** — the `hooks.commit_msg` enable flag and the `MERGE_HEAD` merge exemption, both
   one-line checks needing no Node — so a disabled hook or an exempt merge commit stays a working no-op even
   when CLI resolution is broken; **the module's injected repo-state layer carries the same full model**
   (enable flag, `MERGE_HEAD`, plus the advisory-only `arc.role` context), so the in-process preflight skips
   exactly where the hook exempts or is disabled. Never-stricter-than-raw-git holds at both entry surfaces.
3. **Migration by differential fixture testing.** The Bash rules port against a shared fixture corpus; both
   implementations run against it during development, and the hook flips to the shim only at parity. Two
   qualifications make "parity" well-defined: the corpus is **three-valued** — accept, reject, and
   pass-with-warning (the `recommended`-mode downgrade, artifact-not-found and contributor advisories) — so
   warning semantics cannot silently harden into errors at the flip; and parity is defined **modulo an
   enumerated divergence list** — where the settled design deliberately tightens the Bash hook's mechanical
   looseness (trailer position/last-occurrence strictness vs today's grep-anywhere-first-match; see item 10),
   the corpus encodes the divergence with its intended post-flip behavior, a recorded tightening at cutover
   rather than silent drift. The corpus survives as the durable shared acceptance suite — grammar, limits,
   configuration, and diagnostics cannot drift because only one implementation remains. Config-read parity
   (the `hooks.*` keys the Bash hook reads via `arc-lib.sh`) is part of the port, not an afterthought.
4. **Transport contract for deterministic messages.** Preflight requires assembling the exact message
   byte-for-byte before `spawnGit`, which narrows the wrapper's argv-opaque contract: recognize repeated `-m`,
   `-F <file>`, and `-F -` (buffering stdin for that form instead of inheriting it). The editor path (no
   `-m`/`-F`) is untouched — stdin stays inherited. Forms the wrapper cannot assemble byte-exactly (`-t`, `-c`,
   template/reuse flags) pass through to the ordinary hook path rather than being guessed at. "Byte-exact" means
   the bytes the hook receives, not raw argv: the assembler replicates git's message assembly and cleanup
   semantics (repeated-`-m` paragraph joining; the default `whitespace` cleanup — trailing-whitespace strip,
   blank-line collapse) so preflight validates what `commit-msg` will actually see; a forwarded `--cleanup` or
   non-default `commit.cleanup` is treated as a form we don't assemble and passes through to the ordinary hook
   path. Exact message-file/stdin transport is the canonical wrapper path — `-F -` with a quoted heredoc as the
   primary documented shape — **with a recorded harness-matcher constraint**: allowlist matchers with a
   word-only grammar (the Codex matcher boundary in the release-wrapper setup doc) may not absorb redirection
   shapes, so where that applies the canonical degrades to `-F <file>` (write the message file, then a plain
   positional invocation — same wrapper path, matcher-safe). The setup doc's cascade edit (item 13) is
   therefore a matcher-compatibility update, not an examples-only touch; per-harness guidance is spec-time
   detail. Ordinary Git formatting and editor-driven/raw `git commit` remain intact. One early-refusal case: no
   message channel supplied and stdin not a TTY (the agent-invocation editor trap) — preflight refuses
   immediately, showing the canonical shape, rather than letting git fail into a missing-editor path.
5. **Diagnostics implemented once, shared everywhere.** Every offending line reports message-line number,
   actual/max length, and a safely truncated preview; deterministic footer errors suggest the closest legal
   forms. Machine-stable result/exit typing preserved. Both the wrapper preflight and the hook shim emit the
   same output because they run the same module. No silent wrapping or rewriting of author prose.
6. **Guidance at point of failure, durable home in the method.** Preflight failure output itself shows the safe
   invocation shape (quoted heredoc / `-F -`); the durable guidance lands in the `commit-format` method, with a
   QUICK-REFERENCE pointer considered at spec time.
7. **Ordinary hook path unweakened.** Valid commits still run `pre-commit` then `commit-msg` as today; the real
   `commit-msg` hook (now a shim to the same validator) remains defense in depth behind the preflight.
8. **Parse, then police.** The validator separates parser from policy: the parser represents the full
   Conventional Commits shape (optional scope, `!` breaking marker, arbitrary types), and ARC's current
   strictness (mandatory scope, the enforced type set, footer requirement) applies as a policy layer over the
   parse. Migration parity is therefore a policy configuration; later grammar-policy evolution (owned by
   `naming-conventions` — CC-spec conformance, scope vocabulary) lands as policy/config edits, never a parser
   rewrite.
9. **Layer purity with an injectable repo-state layer.** The grammar core is pure (message string in, result
   out — no process or filesystem access); everything repo-state-dependent sits behind one injected layer: the
   artifact-existence resolver (against `active/backlog/completed`, implemented today on the filesystem) **and
   the validation exemptions the hook honors today** — merge-in-progress (`MERGE_HEAD`) and role context
   (`arc.role`). Preflight and shim read the same exemption model, so preflight skips exactly where the hook
   exempts — a merge-resolution commit is never stricter under the wrapper than under raw git. Two
   forward-compat consequences: CI-side range validation becomes a thin consumer of the same module
   (`quality-gate-hooks` seam), and the resolver is the single seam the materialized backing-store substrate
   replaces (`strategy-storage-evolution.md` / `arc-backend`) — no "PM artifacts are files tracked in the code
   repo" assumption spread through validation logic.
10. **`Context:` is formally a git trailer.** The parser reads and validates the footer per git trailer
    semantics (final block, `Key: value`), preserving interop with `git interpret-trailers` and trailer-aware
    tooling — not a grep-able string that happens to sit last. This is a deliberate tightening over today's
    hook (which greps `^Context:` anywhere and validates the first match), recorded in the migration corpus's
    divergence list per item 3.
11. **The hook shim is also the standalone validate verb.** The delegation subcommand validates a message from
    file/stdin without committing — one public primitive serving the installed hook, ad-hoc composition checks,
    and (later) the CI range gate as thin consumers. Designed as a real CLI surface, not hook-private plumbing.
12. **Retry without recomposition.** A commit that fails *after* a passing preflight (staged-content gates) must
    not force message recomposition: the wrapper already holds the assembled bytes at preflight and persists
    them itself on a post-preflight failure — a wrapper-owned message file, named in the failure output as the
    reuse path. (`.git/COMMIT_EDITMSG` must never be named for this: git writes it only after `pre-commit`
    passes, so on a content-gate failure it still holds the *prior* commit's message — a stale-reuse trap.)
    Cheap retry is this WU's purpose — this closes the loop for content-failure retries, not just
    message-failure ones.
13. **Fire-point invariance (consuming-surface cascade).** Workflow commit fire-points stay content-only —
    message template plus class tag, transport delegated — which is the correct separation and means no
    lifecycle-workflow edits ship with this WU. Transport is documented once; the cascade when it ships:
    the `commit-format` method (durable home, per item 6), the release-wrapper setup doc's invocation examples
    (today the sole shell-transport examples anywhere, and they show single-line `-m` — contradicting every
    multi-line template the workflows emit), and a QUICK-REFERENCE pointer. `arc-commit` / `prepare-commits`
    inherit through their method load (verify at execution; likely no edit).

## Open (spec-time detail)

- Subcommand naming/namespace for the hook delegation surface.
- Windows/PATH resolution strategy specifics for the hook shim, and the remediation text. The strategy must
  also satisfy the self-hosting/workspace-install context (no global `arc`, `npx` banned by item 2 — a
  workspace-local `node_modules/.bin` fallback is compatible with the rationale).
- Version-skew posture: globally installed CLI vs repo expectations (mitigated by `arc update` regenerating
  hooks; needs one settled statement, not new mechanism).
- Resolver degradation posture: what the footer's existence layer does when the substrate can't resolve
  (CI checkouts, partial materialization) — skip-with-note vs fail-closed, decided at the policy layer.
- Message-only content-gate caching: explicitly deferred until after preflight lands; if pursued, keyed by every
  correctness input (staged tree, HEAD, hook/config implementation, consumed worktree state) and failing closed.

## Acceptance Shape

- Invalid deterministic messages fail before `spawnGit` and staged-content checks.
- Shell-safe multiline input preserves bytes and newlines without interpolation.
- Wrapper preflight and the installed hook agree on the same three-valued fixture corpus — accept, reject,
  pass-with-warning (single implementation; differential parity demonstrated during migration, modulo the
  recorded divergence list).
- Diagnostics identify exact lines and actionable footer alternatives.
- Valid commits still run the ordinary hooks; hook-runtime resolution failure fails closed with remediation.
- Any retry cache cannot survive a change to staged tree, HEAD, hook/config implementation, or consumed worktree
  state.

## Boundaries and Coordination

- `interlock-release-refinement` continues to own release authority, provenance, and interlock routing; this WU owns
  commit-message transport and validation ergonomics.
- `quality-gate-hooks` owns remediation of the existing pre-commit `npx tsx` source-path delegations (latent
  adopter misfire, surfaced during this grooming and routed there); this WU ships the adopter-safe hook→CLI
  delegation pattern those checks later migrate onto, and changes no pre-commit check itself.
- `naming-conventions` owns grammar-policy evolution — CC-spec conformance (optional scope, the `!` breaking
  marker, type-set extension) and scope vocabulary (capture routed 2026-07-14, joining its existing
  commit-discipline items); this WU ships behavior parity with those policies representable in the parser.
- `quality-gate-hooks` additionally gets the CI-side commit-range validation gate (capture routed 2026-07-14);
  this WU keeps the validator core pure so that gate is a thin consumer, and wires no CI step itself.
- `arc-backend` owns `Context:`-footer validity semantics under the materialized backing-store model — resolver
  target substrate, unresolvable-state posture, and footer-name exposure in code-repo history under the
  `storage.track_design_docs` privacy knob (capture routed 2026-07-14); this WU confines existence-checking
  behind the injectable resolver so that swap is one seam.
- The existing `-F -` passthrough is a useful immediate mechanism, not by itself the durable fix.
- Raising the body-line cap alone is not a solution; reassess limits only after multiline input is ergonomic.
- `Class` resolved `Heavy` at the 2026-07-14 grooming (TS-canonical validator is realized design authoring per
  the ratchet); the meta write lands with the draft-capture ceremony commit.

---
