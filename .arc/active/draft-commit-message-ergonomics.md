# Draft: Commit Message Ergonomics

- **Origin:** routed from `USER-INBOX § Work Unit` at housekeep drain (2026-07-16); captured during
  `husk-lifecycle-drivers` Phase 2 deferred review, after two overlong deterministic commit bodies bypassed wrapper
  preflight and were rejected only by `commit-msg`.
- **Purpose:** Harden the release-wrapper commit preflight against a confirmed effective-hook detection defect, and
  give machine-authored commit messages deterministic body wrapping — so structured input stops bouncing off
  `commit-msg` after the full pre-commit gate has already run.

---

## Problem / Motivation

Two related ergonomics concerns for machine-authored commits, both surfaced by the same failure: an overlong
deterministic body ran the entire pre-commit gate before `commit-msg` rejected it.

**Confirmed preflight defect.** The release wrapper skips its own commit-message preflight when a
`prepare-commit-msg` hook is present, on the sound theory that such a hook may rewrite the message and preflighting
the pre-hook bytes would be unreliable. But the presence check (`hasPrepareCommitMsgHook` in `commit-cli.ts`) runs a
raw `git rev-parse --git-path hooks/prepare-commit-msg` and tests the resolved path for executability. That is
correct only for raw `.git/hooks`. Every hook *manager* interposes a dispatcher the raw check can't see through —
under Husky (`core.hooksPath = .husky/_`) the path resolves to `.husky/_/prepare-commit-msg`, a dispatcher shim
that is present and executable for **every** hook name regardless of whether a real hook is defined. The effective
repo hook `.husky/prepare-commit-msg` is absent, so the probe false-positives, preflight is skipped, and an invalid
message sails through to the full gate.

Note ARC itself never installs a `prepare-commit-msg` hook (`hook-integration.ts` only ever wires `pre-commit`,
`commit-msg`, `pre-push`). The probe exists purely to detect an *external*, team-added mutating hook — so the fix is
about asking the question correctly, not about ARC's own hooks.

**Formatting gap.** `assembleCommitMessageParagraphs` joins `-m` values with `\n\n` and applies Git's cleanup, but
never wraps long lines. One `-m` body becomes one unwrapped paragraph, so a machine author must count characters
and hand-reflow — the friction that produced the rejected messages — even though ARC already owns and normalizes
these bytes.

The two concerns reinforce each other: deterministic wrapping makes the common bad-message case (an overlong body)
valid *at assembly time*, before Git runs, which drains most of the pressure off the preflight-skip path. That path
then only has to be correct for the residual — a body still invalid after wrapping for some other reason, or
byte-preserved `-F`/stdin input.

## Approach / Design

### Effective-hook detection (concern #1)

Route the presence check through ARC's existing hook-manager abstraction rather than a raw git-path probe. Reuse
`detectHookManager` (already detects Husky / Lefthook / pre-commit in priority order), then ask each manager for an
*effective* `prepare-commit-msg` hook by its own convention:

| Manager     | Effective hook exists when…                                        |
|-------------|--------------------------------------------------------------------|
| Husky       | `.husky/prepare-commit-msg` exists (not just the `_/` dispatcher)  |
| Lefthook    | a `prepare-commit-msg:` section with commands is in `lefthook.yml` |
| pre-commit  | a hook with `stages: [prepare-commit-msg]` is in the config        |
| raw/unknown | the git-path hook exists and is executable (the current check)     |

The raw/unknown branch keeps today's behavior — correct for genuinely-raw `.git/hooks`. Note the residual: an
*unknown* manager that also redirects `core.hooksPath` to a dispatcher directory (a custom hooksPath, or a manager
ARC doesn't detect) falls into this branch and retains the same false-positive skip. The blast radius is bounded —
a false-positive only *skips* preflight; `commit-msg` still catches the bad message — so this degrades safely rather
than breaking, but it isn't universal correctness. Add a `hasEffectiveHook(name)` detection helper as a sibling to
the integration module (detection vs. integration are natural neighbors, and the helper generalizes to any "does an
effective X hook exist" question). Add a Husky-managed self-hosting regression proving invalid deterministic input
refuses at preflight, before the staged-content gate runs.

The per-manager rows are the *direction*, not the finished probe: pre-commit especially is not a single-key lookup
(stage activation interacts with `default_stages` and `default_install_hook_types`), so the exact effective-hook
rule per manager settles at create-spec. This is adopter-general by construction — nothing in it is specific to this
repo, which is merely the Husky *instance* of a general defect; the manager set is exactly the one ARC already
commits to.

### Deterministic body wrapping (concern #2)

Wrap in the CLI assembly path (extending `assembleCommitMessageParagraphs`), not in agent-side guidance — deterministic
formatting belongs in the CLI, and an agent-side reflow would just re-create the line-counting burden.

**Wrapped bytes must be the *committed* bytes, not just the validated ones.** Today the `messages` transport commits
the raw `-m` argv (`commit.ts` reassigns the spawn args only for the `file` and `stdin` transports); preflight
validation over `assembleCommitMessageParagraphs` output is representative *only because* that assembly currently
mirrors Git's own `-m` handling. Wrapping deliberately breaks that mirror — Git does not reflow `-m` — so wrapping the
validated bytes alone would let preflight approve a wrapped message that Git then commits unwrapped, reproducing the
exact `commit-msg` rejection this WU targets. The fix: when wrapping applies, the `messages` transport commits the
assembled+wrapped bytes via the snapshot `-F` path the `file` transport already uses (`createMessageSnapshot` +
`rewriteCommitFileSource`), turning the fragile "assembly happens to mirror Git" coupling into a robust
**validated-bytes-are-the-committed-bytes by construction** invariant. (Lesser alternatives — rebuild a single `-m`
with embedded newlines, or route through stdin `-F -` — are recorded but not preferred.)

Wrapping behavior:

- **Wrap to `hooks.body_max_line_length`, read from the same config `commit-msg` validates against** — so wrap-target
  and reject-target can never drift (a team that sets the body max to 80 gets 80-column wrapping for free). The
  subject is never wrapped.
- **Wrap plain paragraphs and flat list items**, with hanging-indent continuation for wrapped list items. Idempotent:
  join a paragraph's existing internal line breaks and re-wrap, so any input line-breaking normalizes to canonical
  output.
- **Preserve verbatim:** subject line, trailers (`Context:` and other footer lines), URLs and unbreakable tokens,
  tables, nested lists, and code blocks (fenced or indented). Detected and passed through unwrapped.
- **Default-on for `-m`, with a `--no-wrap` escape hatch.** ARC already transforms `-m` bytes, so wrapping continues
  that contract; the escape hatch covers the rare case where an author needs exact bytes.
- **`-F`/stdin stay byte-preserving.** No implicit mutation of file-backed input. When preflight rejects a
  byte-preserved source, emit a corrected-artifact retry (extending `renderCommitMessageRemedy`) guiding an
  `arc release commit -F <file>` resubmission.

**Scope boundary grounded in the history.** A scan of 4,291 non-merge commit bodies in this repo: flat unordered
lists appear in 60.5% (a first-class citizen), but nested lists (0.7%), tables (1.0%), and fenced code (0%) are
rare-to-absent. Of lines that actually overflow the 100-column limit, list items are the dominant source (44 lines /
29 commits) — more than plain prose (13 / 13) — while tables never overflow. So list-item *wrapping* is core, not an
edge case, and preserve-verbatim for the structured-and-rare kinds is safe: if some uncommon structured line does
overflow, it surfaces as an ordinary validation message, never silent corruption. (The absolute overflow rate,
0.9% of commits, is understated — this history was authored under manual-wrapping discipline; the trustworthy
signal is the distribution, not the rate.)

## Alternatives

- **Formatting placement — agent-side (`arc-commit` guidance) vs. CLI vs. auto-fix artifact.** Chose CLI assembly:
  agent-side reflow re-creates the manual burden and violates the deterministic-logic-compiles-into-the-CLI north
  star; a pure auto-fix/retry artifact is retained only for the byte-preserved `-F` reject path, where mutation
  isn't allowed.
- **`-m` wrapping default-on vs. opt-in flag.** Chose default-on with `--no-wrap`, since ARC already owns `-m`
  bytes and default-on is what removes the friction; opt-in would leave the agent to remember a flag.
- **Reflow scope — plain paragraphs only vs. + list wrapping vs. full structured reflow.** Chose plain paragraphs +
  flat-list-item wrapping with structured-rare preserved verbatim; the commit-history data made list wrapping core
  and full structured reflow (nested lists, tables) unnecessary.
- **Hook detection — Husky-only special-case vs. manager-agnostic reuse.** Chose reuse of `detectHookManager` so the
  fix serves adopters on any supported manager, not just this repo.
- **Getting wrapped bytes to Git — snapshot `-F` vs. rebuilt `-m` vs. stdin.** Chose committing the assembled bytes
  through the snapshot `-F` path the `file` transport already uses; it reuses existing machinery and makes
  validated-equals-committed a structural invariant rather than a coincidence of assembly mirroring Git.

## Unknowns and Assumptions

- **Wrap idempotency / hanging-indent mechanics.** Assumed textbook (greedy wrap, hanging indent to the marker
  width). If execution shows genuine subtlety here, the `draft-design` re-entry valve ratchets `Class` and re-enters
  at a higher depth — not anticipated from the current read.
- **Per-manager effective-hook probes.** Assumes the effective-hook conventions above are stable for the manager
  versions ARC targets; the raw/unknown fallback bounds the blast radius if a manager convention shifts.
- **Config source for wrap width.** Assumes `hooks.body_max_line_length` is reachable from the assembly path at the
  point wrapping runs; verify the wiring during create-spec.

## Scope Estimate

Small (days). One bounded formatter module + a hook-detection helper routed through existing abstractions, plus
regression coverage. `Class: Light` — the design is determinate once the block set is settled (done here), composed
from a well-known algorithm over a small surface. No cross-WU dependencies.

## Files

`handlers/release/commit-cli.ts` (route detection through the abstraction), `lib/hook-manager.ts` /
`lib/hook-integration.ts` (add `hasEffectiveHook`), `lib/release/commit-message-assembly.ts` (wrapping),
`handlers/release/commit.ts` (commit the wrapped bytes via the snapshot `-F` path for the `messages` transport),
`lib/release/commit-message-remedy.ts` (byte-preserved retry), commit-message diagnostics and E2E/regression
coverage, plus a note in the `arc-commit` guidance to stop instructing manual wrapping.

---

## Continuity

- **Readiness:** formalization-ready — direction and every settle-able decision settled; one adversarial pass folded
  (a confirmed transport-forwarding blocker + two wording/scoping minors). Open items are detail-design for
  create-spec.
- **Resolved:** both concerns framed; effective-hook fix via `detectHookManager` reuse + `hasEffectiveHook`; reflow
  placement (CLI), default (`-m` on + `--no-wrap`, `-F` byte-preserving), block set (paragraphs + flat list items
  wrapped; structured-rare preserved), width-from-config coupling; wrapped bytes committed via snapshot `-F`
  (validated-equals-committed by construction); `Class: Light`; stays one WU.
- **Open (for create-spec):** exact per-manager effective-hook probes (esp. pre-commit stage activation); wrap-width
  config wiring at the assembly point; exact hanging-indent/greedy-wrap mechanics; corrected-artifact retry shape
  for `-F`.
- **Next:** capture (persist `Class: Light`, repoint `Design`, advance stage to create-spec).
