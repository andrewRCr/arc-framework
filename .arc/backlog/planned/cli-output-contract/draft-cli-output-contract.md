# Draft: CLI Output Contract

- **Origin:** [internal] — minted at the 2026-09-30 housekeep drain from two `USER-INBOX` captures made during the
  CLI-convention discussion closing the `inbox-refusal-field-naming` Errand (2026-09-18), "Make machine-mode failures
  machine-readable" and "Replace the `--json` boolean with a declared output mode". Both were returned from
  `draft-cli-substrate-complete-migration.md`'s inbound buffer on 2026-09-28 as a new CLI output contract, orthogonal
  to that work unit's mechanical adoption and to the storage program.
- **Purpose:** Give ARC's CLI one declared output contract: a command in machine mode succeeds and fails in a
  machine-readable shape, and each command's output mode is announced rather than inferred.
- **Planning posture:** `P2`; `Class` settles at planning. No active work unit claims the concern
  (`refusal-contract-and-floor` is a delivery-gate chunk directory, not a work unit).

---

## Inbound Buffer — Pending Integration

> _Routed-in concerns pending integration at this work unit's next planning iteration._

### `[ ]` **Assess an explicit agent invocation preset for the CLI output contract**

- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-10-09).

- _Shapes:_ § Concern 2 — the `--json` boolean hides two output conventions: whether the declared output mode
  carries an agent invocation preset.

- _Observation:_ ARC is primarily agent-operated while human UX/DX remains a requirement. A runtime invocation
  preset could spare callers repeatedly selecting compatible output and interaction options. This is distinct
  from help grouping: an agent can invoke human-facing presentation, and humans can consume structured output.

- _Approach:_ Assess whether an explicit `--agent` preset provides enough benefit over the underlying output and
  interaction controls. Candidate semantics include noninteractive execution, a declared machine-readable output
  format, presentation suitable for captured output, and structured results when further input or authorization
  is required. Specify success and failure behavior together, keep the underlying choices independently usable,
  and preserve the distinction between suppressing prompts and granting approval.

- _Reference:_ CodeRabbit's current `--agent` mode selects NDJSON review output; headless or agent mode returns a
  structured action-required result when confirmation is needed. See its
  [review modes](https://docs.coderabbit.ai/cli#review-modes) and
  [consent behavior](https://docs.coderabbit.ai/cli#usage-based-reviews-and-consent) for the concrete precedent.

- _Scope:_ An open design question for `cli-output-contract`, not a commitment to add a flag. Preserve human UX/DX;
  a runtime preset does not itself require separate agent help, a caller-based command partition, or changes in
  the `cli-help-discovery` work unit.

- _Captured during:_ `cli-help-discovery` draft-design, shared human/agent ergonomics discussion, 2026-10-03.

---

## Concern 1 — machine-mode failures are prose

- _Observation:_ a command in machine mode still fails in prose. `cli.ts:2003` composes the self-hosting stale-build
  refusal from a fully typed verdict — `basis`, `distAge`, `newestSrc`, `srcAge` — flattens it into an English
  sentence, writes it to stderr, and exits 1 **regardless of `--json`**. Observed live 2026-09-18:
  `npx arc recover audit --json` returned prose, not JSON. `integrateCmd.action` at `cli.ts:409` has the same shape.
  The typed vocabulary already exists — `lib/**` carries 278 `code: "..."` fields — it simply does not survive the
  CLI exit.
- _Why it costs:_ the repository's own governing instruction string-matches an English sentence because no code is
  exposed. `AGENTS.md:14-17` identifies the refusal by its prose — "the complete self-hosting stale-build refusal
  (`error: arc dev build is stale (...)`, refusal against stale `dist`, and the `npm run build:fast` remedy)" — to
  authorize a single rebuild-and-retry. Reword that sentence and the rule silently stops matching. A stable `code`
  would let the same instruction be exact instead of literary.
- _Pattern, not an instance:_ the same defect shape as the `effectiveCoverage` finding — ground truth parsed, then
  discarded at the boundary. Scope the general question (does any `--json` command emit JSON when it fails?) rather
  than repairing the one site.
- _Bounding:_ the stale-build guard is dev-only and does not ship, so that particular instance is not
  adopter-facing. The contract question is. Do not justify the work on the dev-only site alone.

## Concern 2 — the `--json` boolean hides two output conventions

- _Observation:_ ARC carries two output conventions — human-default with a `--json` opt-in (**43** commands) and
  always-machine-readable (**34**, plus the ~8 required-flag sites) — and membership is announced nowhere. It is
  discoverable only by reading `machineReadable:` in `cli.ts`. Retiring the no-op flag removes a misleading signal; it
  does not make the families legible.
- _The taxonomy is four shapes, not two (measured 2026-09-18):_ `cli.ts` has **78** `--json` declarations in four
  shapes: (1) opt-in via `withInteractionContext` with `machineReadable: (opts) => opts.json === true` — genuinely
  load-bearing; (2) opt-in via a **bare `.action()`** whose handler reads `options.json` itself — `arc locus` is the
  only one, and it is invisible to any `machineReadable` audit; (3) inert with `machineReadable: () => true`; (4) inert
  with a bare action that never reads the flag. Shapes 2 and 4 are indistinguishable by grep; only the handler body
  separates them, which is why the original scoping pass mis-derived its own count. Any `--output` design has to
  classify by _what the handler does_, not by the interaction policy.
- _A fifth case:_ **8** sites declare `--json` with `.requiredOption`. A required flag is always present, so its
  predicate is constant — the flag cannot select anything. Retiring those must flip `machineReadable` to
  `() => true` at the same time, or removing the flag silently turns the command interactive.
- _Industry idiom (surveyed 2026-09-18):_ the dominant modern shape is one flag with enumerated values and a
  per-command default — kubectl `-o json|yaml|wide|name`, aws `--output json|table|text|yaml`, docker and podman
  `--format`, gh `--json <fields>`. It turns "two conventions" into "one convention with different defaults": the
  flag is never inert, `--help` prints the default, and family membership is announced for free. The closest
  structural precedent is git's porcelain/plumbing split, whose lesson is that the taxonomy is _documented_ —
  `git help -a` groups the families and states which output is stable. Reference canon: clig.dev (§ Output,
  § Arguments and flags) and Heroku's 12 Factor CLI Apps.
- _Operator declares once:_ aws resolves `--output` flag → `AWS_DEFAULT_OUTPUT` env → config file. Operator kind is
  stable for a whole session, so a harness exporting `ARC_OUTPUT=json` once would make the per-command distinction
  stop mattering. The substrate exists — `--no-input` is already a global inherited option, read via
  `optsWithGlobals` at `interaction-context.ts:143`.
- _Keep TTY detection out of structure:_ clig.dev endorses TTY detection for presentation (color, pager, progress)
  and warns against it for structure. ARC gates _interaction_ on TTY and CI while leaving output shape alone
  (`interaction-context.ts`, `promptOutputIsTTY` → `interaction: forbidden`), which is right under an agent harness
  where stdout TTY state is unreliable. Keep that boundary deliberately rather than by omission.
- _Sequencing against the `--json` retirement:_ a global output flag would re-accept `--json` on the 34 commands that
  Errand strips. Not a collision — the Errand's durable value is removing the false `machineReadable` signal plus the
  prose and tests that train the habit, not the declarations as permanent API.
- _Smaller wins, if the whole convention change is not taken:_ state the output shape in each always-JSON command's
  `.description()`, and group the two families in `--help` the way git and gh do (see `cli-help-discovery`).

## Planning note

The two concerns may land together or split at planning; both are the CLI's output contract, so settle them against
one design.
