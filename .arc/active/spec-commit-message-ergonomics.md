# Spec (`outline`): commit-message-ergonomics

- **Origin:** [internal]

- **Purpose:** Harden the release-wrapper commit preflight against a confirmed effective-hook detection defect,
  and give machine-authored commit messages deterministic body wrapping — so structured input stops bouncing off
  `commit-msg` after the full pre-commit gate has already run.

---

## Problem / Context

Two related ergonomics concerns for machine-authored commits, both surfaced by the same failure: an overlong
deterministic body ran the entire pre-commit gate before `commit-msg` rejected it.

**Confirmed preflight defect.** The release wrapper skips its own commit-message preflight when a
`prepare-commit-msg` hook is present — a sound guard, since such a hook may rewrite the message and preflighting
the pre-hook bytes would be unreliable. But the presence check (`hasPrepareCommitMsgHook`) runs a raw
`git rev-parse --git-path hooks/prepare-commit-msg` and tests the resolved path for executability. That is
correct only for raw `.git/hooks`. Every hook *manager* interposes a dispatcher the raw check can't see through:
under Husky (`core.hooksPath = .husky/_`) the path resolves to `.husky/_/prepare-commit-msg`, a dispatcher shim
present and executable for **every** hook name regardless of whether a real hook is defined. The effective repo
hook `.husky/prepare-commit-msg` is absent, so the probe false-positives, preflight is skipped, and an invalid
message sails through to the full gate. ARC itself never installs a `prepare-commit-msg` hook — the probe exists
purely to detect an *external*, team-added mutating hook, so the fix is about asking the question correctly.

**Formatting gap.** `assembleCommitMessageParagraphs` joins `-m` values with `\n\n` and applies Git's cleanup
but never wraps long lines. One `-m` body becomes one unwrapped paragraph, so a machine author must count
characters and hand-reflow — the friction that produced the rejected messages — even though ARC already owns and
normalizes these bytes.

The two concerns reinforce each other: deterministic wrapping makes the common bad-message case (an overlong
body) valid *at assembly time*, before Git runs, draining most of the pressure off the preflight-skip path,
which then only has to be correct for the residual (a body still invalid after wrapping, or byte-preserved
`-F`/stdin input).

## Decision(s)

**D1 — Effective-hook detection via the manager abstraction.** We will replace the raw git-path probe in
`hasPrepareCommitMsgHook` with a manager-aware effective-hook check routed through the existing
`detectHookManager`, exposed as a reusable `hasEffectiveHook(name)` helper sibling to the hook-detection module
(detection and integration are natural neighbors, and the helper generalizes to any "does an effective X hook
exist" question). The per-manager effective-hook rule:

| Manager     | Effective hook exists when…                                                                                                              |
|-------------|------------------------------------------------------------------------------------------------------------------------------------------|
| Husky       | `.husky/<name>` exists (not just the `_/` dispatcher shim)                                                                               |
| Lefthook    | `lefthook.yml` / `.yaml` carries a `<name>:` section with commands                                                                       |
| pre-commit  | `.pre-commit-config.yaml` declares `<name>`-stage activation (a hook `stages` entry, or `default_install_hook_types` including `<name>`) |
| raw/unknown | the git-path hook exists and is executable (today's check, unchanged)                                                                    |

The `raw/unknown` branch preserves today's behavior — correct for genuinely-raw `.git/hooks`. For **pre-commit**,
because a false-positive only *skips* preflight (`commit-msg` remains the backstop), an ambiguous config-visible
signal resolves toward "present" (a safe skip) rather than risking a false-negative. This is adopter-general by
construction: nothing in it is repo-specific — this repo is merely the Husky instance of a general defect, and
the manager set is exactly the one ARC already commits to.

**D2 — Deterministic body wrapping in the CLI assembly path.** We will wrap in `assembleCommitMessageParagraphs`
(extending it), not in agent-side guidance — deterministic formatting belongs in the CLI, and an agent-side
reflow would just re-create the line-counting burden. Default-on for `-m`, with a `--no-wrap` escape hatch for
the rare case an author needs exact bytes. The subject line is never wrapped.

**D3 — Wrap width from `hooks.body_max_line_length`.** We will read the wrap width from the same commit-check
config the `commit-msg` validator consumes (`hooks.body_max_line_length`, default 100), threaded to the assembly
step in the preflight path — so wrap-target and reject-target share one source and can never drift (a team that
sets the body max to 80 gets 80-column wrapping for free).

**D4 — Block set: wrap plain paragraphs + flat list items; preserve structured-rare verbatim.** We will wrap
plain paragraphs and flat list items, with hanging-indent continuation for wrapped list items. Idempotent: join
a paragraph's existing internal line breaks and re-wrap, so any input line-breaking normalizes to canonical
output. Greedy word-wrap; an unbreakable token (URL, long identifier) longer than the width stays on its own
line rather than being force-split. **Preserved verbatim:** subject line, footer/trailer lines (`Context:` and
others), URLs and unbreakable tokens, tables, nested lists, and code blocks (fenced or indented). This is
grounded in a scan of 4,291 non-merge commit bodies in this repo: flat unordered lists appear in 60.5% and are
the dominant overflow source, while nested lists (0.7%), tables (1.0%), and fenced code (0%) are rare-to-absent —
so list-item wrapping is core, and preserve-verbatim for the structured-and-rare kinds is safe.

**D5 — Wrapped bytes are the committed bytes (snapshot `-F`).** When wrapping mutates the `messages`-transport
bytes, we will commit the assembled+wrapped bytes through a message snapshot rather than the raw `-m` argv. Git
does not reflow `-m`, so committing the raw argv after validating wrapped bytes would let preflight approve a
wrapped message that Git then commits unwrapped — reproducing the exact `commit-msg` rejection this WU targets.
Concretely: snapshot the wrapped bytes with `createMessageSnapshot` (the mechanism the `file` transport already
uses), then hand them to Git via `-F <snapshot>`. The `file` transport's existing `rewriteCommitFileSource` only
*substitutes* an existing `-F` operand's value and cannot be reused as-is for a `-m` argv, so the `messages` path
needs a small dedicated argv transform — strip every `-m`/`--message` operand and append `-F <snapshot>` — plus
routing the wrapped `messages` transport through the snapshot branch in `commit.ts` (today gated to the `file`
transport only). This turns the fragile "assembly happens to mirror Git" coupling into a structural
**validated-bytes-are-the-committed-bytes** invariant.

**D6 — `-F`/stdin stay byte-preserving; corrected-artifact retry.** We will not implicitly mutate file-backed or
stdin input. When preflight rejects a byte-preserved source for an over-width body, we will extend
`renderCommitMessageRemedy` to persist the wrap-corrected bytes to the wrapper-owned retry file (reusing the
existing `persistMessageRetry` machinery) and guide an `arc release commit -F <file>` resubmission — a one-step
corrected retry that never mutates the original source.

## Scope boundary (No-gos)

- **No full structured reflow.** Nested lists, tables, and fenced/indented code are preserved verbatim, never
  reflowed. If an uncommon structured line does overflow, it surfaces as an ordinary validation message, never
  silent corruption.
- **No wrapping of subject or footer/trailer lines.**
- **No implicit mutation of `-F`/stdin input** — the byte-preserving contract holds; corrected content is
  offered as a retry artifact, not applied in place.
- **Not fixing the unknown-manager residual.** An *unknown* manager that redirects `core.hooksPath` to a
  dispatcher directory (a custom hooksPath, or a manager ARC doesn't detect) falls into the `raw/unknown` branch
  and retains the same false-positive skip. Bounded and safe (`commit-msg` still catches) — out of scope here.
- **Not changing ARC's own hook wiring.** ARC installs only `pre-commit`, `commit-msg`, `pre-push`; the probe
  only ever detects an *external* mutating hook.
- **No agent-side reflow guidance.** The `arc-commit` guidance change is limited to *removing* the manual-wrapping
  instruction.

## Consequences & Risks

- **Drains the preflight-skip path.** Wrapping makes the common overlong-body case valid at assembly time, so the
  skip path only has to be correct for the residual (still-invalid-after-wrap, or byte-preserved input).
- **Wrap/reject coupling.** Tying the wrap width to `hooks.body_max_line_length` means a team retuning the max
  gets matching wrapping automatically — no second knob to keep in sync.
- **pre-commit conservative skip (accepted).** The presence-biased pre-commit rule may occasionally
  false-positive-skip preflight; `commit-msg` remains the backstop, so this degrades safely.
- **Rare structured overflow (accepted).** A nested list / table line that overflows is caught as a validation
  message rather than wrapped — a safe failure, consistent with the history distribution.
- **`body_max_lines` interaction (accepted).** Wrapping increases physical line count, so a body already near
  the `hooks.body_max_lines` limit (default 100) with overlong lines could cross it once wrapped. This surfaces
  as an ordinary `commit-msg` line-count refusal at validation — a safe failure, never silent corruption — so
  the common single-paragraph overlong body (SC2) wraps and passes, while this edge is caught, not miscommitted.
- **Unknown-manager residual (accepted).** Bounded false-positive skip for custom-`hooksPath` unknown managers,
  as noted in No-gos.

## Success Criteria

1. A Husky-managed self-hosting regression proves invalid deterministic `-m` input **refuses at preflight**
   (message-preflight refusal) *before* the staged-content gate runs — the dispatcher-shim false-positive is gone.
2. An overlong single-`-m` body is wrapped to `hooks.body_max_line_length` at assembly and passes `commit-msg`
   without any hand-reflow.
3. For a wrapped `messages` commit, the **committed** body bytes equal the **validated** (wrapped) bytes —
   verified by inspecting the resulting commit, not just preflight.
4. Flat list items wrap with hanging-indent continuation; nested lists, tables, fenced code, URLs, the subject,
   and footer lines pass through unwrapped.
5. Wrapping is idempotent — re-wrapping already-wrapped output is a no-op.
6. `--no-wrap` disables wrapping for `-m`; `-F`/stdin are never mutated; a rejected byte-preserved over-width
   source yields a corrected-artifact `-F` retry.
7. The effective-hook check resolves correctly per manager: Husky real hook vs. bare dispatcher shim, a Lefthook
   `prepare-commit-msg:` section, pre-commit stage activation, and the raw `.git/hooks` fallback.

## Open items

- **Exact pre-commit config parsing** for `<name>`-stage activation (`default_stages` /
  `default_install_hook_types` interaction). The decision is settled (presence-biased, per D1); the precise YAML
  read finalizes during implementation.
- **Wrap-width threading point.** The *source* is fixed (`hooks.body_max_line_length`); the exact resolution
  point — expose it on the preflight repository vs. resolve the commit-check config once and share it with the
  assembly step — is an implementation detail.
- **Hanging-indent column derivation** for ordered vs. unordered list markers (textbook greedy wrap + hang to the
  marker content column; confirm against real list items).
