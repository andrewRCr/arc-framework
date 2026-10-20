# Draft: CLI Output Contract

- **Origin:** [internal] — minted at the 2026-09-30 housekeep drain from two `USER-INBOX` captures made during the
  CLI-convention discussion closing the `inbox-refusal-field-naming` Errand (2026-09-18), "Make machine-mode failures
  machine-readable" and "Replace the `--json` boolean with a declared output mode". Both were returned from
  `draft-cli-substrate-complete-migration.md`'s inbound buffer on 2026-09-28 as a new CLI output contract, orthogonal
  to that work unit's mechanical adoption and to the storage program.
- **Purpose:** Give ARC's CLI one declared output contract: a command in machine mode succeeds and fails in a
  machine-readable shape, and each command's output mode is announced rather than inferred.
- **Planning posture:** `P2`; `Class: Heavy` (§ Planning record). Design runs now, as an exception to
  `RELEASE-GATES` § Intents' "Everything else waits"; when and how implementation lands is a later decision. No other
  work unit claims the concern (`refusal-contract-and-floor` is a delivery-gate chunk directory, not a work unit).

## Planning Continuity

- **Readiness:** `maturing`. The CLI-only half of the contract is settled (§ Direction): result shape, streams and
  exit codes, output mode, and stability. The Owner-facing half is a co-design seam with `composable-workflows`,
  held for after the cutover, and the three inbound entries are not yet integrated.
- **Resolved:** § Direction; depth, `Class`, and the boundary in § Planning record.
- **Success signal (candidate, 2026-10-20):** under `--json`, every command's refusal and error paths emit exactly
  one registered JSON document on stdout, with the exit code following `status` — a CLI-level test drives each
  family's refusal and parses stdout as one document; `AGENTS.md`'s rebuild rule names `dev` / `build-stale` rather
  than a sentence; and a cross-model eval shows a literal relayer passing the `report` through without echoing the
  rest. The last clause waits on the co-design seam.
- **Open — the co-design seam with `composable-workflows` (and `loadset-composition` for always-loaded placement):**
    - **The `report` and `offer` schemas**, including the enforced-or-anticipated property (§ Direction, Result
      shape), against D3's own open per-step argument schemas.
    - **The content rule** — what the `report` may carry and which disclosures must still reach the Owner.
      `strategy-procedure-evolution` § 6 homes the precomposition rule; its content is this work unit's.
    - **Where the relay rule lives** — workflow dispatch lines now, D3's `render` semantics later
      (`strategy-knowledge-evolution` § 1 and § 10).
    - **Gates whose facts span several commands** — the Errand integration interlock (inbound "Cut restated
      procedure…", _Candidate_), against D3's `gate` and `review-request-contracts`' derivation rule.
- **Open — at resume:** whether the envelope carries a version marker, and how it relates to results'
  `schemaVersion` fields, once the post-seam reconciliation `RELEASE-GATES` § Stance waits on has run (§ Direction,
  Stability).
- **Next:**
    1. Capture the draft at `maturing` through draft-design's capture ceremony.
    2. Pause in place, waiting on `storage-cutover` — operating order, not a `Depends On` edge.
       `composable-workflows`' design may start any time and waits only by choice; this resumes beside it.
    3. At the pause, update `RELEASE-GATES`: this work unit, `composable-workflows`, and `loadset-composition` are
       co-designed after the cutover, the Owner's leading candidate for the highest-priority set beside the resuming
       review and delivery streams; their order is decided then. Capture the shared seam for `composable-workflows`
       (`USER-INBOX § Work Unit`, `_Shapes:_` D3's `render` and `offer` step arguments) as co-design at resume, not
       types to adopt.
    4. At resume, co-design the seam, settle the version marker, and integrate the three inbound entries at the
       ready-making Owner's pass; they stay held through the pause.

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
  structured action-required result when confirmation is needed. See its [review
  modes](https://docs.coderabbit.ai/cli#review-modes) and [consent
  behavior](https://docs.coderabbit.ai/cli#usage-based-reviews-and-consent) for the concrete precedent.

- _Scope:_ An open design question for `cli-output-contract`, not a commitment to add a flag. Preserve human UX/DX;
  a runtime preset does not itself require separate agent help, a caller-based command partition, or changes in
  the `cli-help-discovery` work unit.

- _Captured during:_ `cli-help-discovery` draft-design, shared human/agent ergonomics discussion, 2026-10-03.

### `[ ]` **Separate what a command's output says to the Owner from what is record or agent-only**

- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: cli-output-contract`), housekeep drain (2026-10-13).

- _Shapes:_ § Concern 2 (the output conventions), and the inbound entry "Assess an explicit agent invocation preset
  for the CLI output contract".

- _Observation:_ literal models (GPT, Grok) relay command results verbatim, pasting dense JSON or check listings into
  the conversation; even in human mode, `arc check increment` lists every not-selected check and then repeats them in
  a summary line. ARC already separates the Owner-facing part in places — `recommendedPromptText`,
  `dispositionReportText`, `locusGuidance` ("render verbatim") — but ad hoc, with no common rule, so each agent must
  judge what to say and literal ones say everything.

- _Approach:_ make audience separation part of the output contract: each result carries one precomposed Owner-facing
  field (empty when there is nothing to say), and labels everything else as agent continuation or record; workflows
  then dispatch "relay the report verbatim; never echo the rest". Keep human-mode output to what needs attention —
  failures and decisions first, clean results collapsed to a count. `autonomy-levels` applies this to its own
  boundary results (§ What a stop hands the Owner); this entry is the general contract.

- _Captured during:_ `autonomy-levels` grooming (2026-10-13), from the Owner's cross-model observation.

- _Drain note:_ this widens § Purpose from machine-readable shape and announced mode to audience;
  `draft-autonomy-levels.md` defers the general output contract here. The `arc check` human-output duplication split
  off as an Errand at the drain.

### `[ ]` **Cut restated procedure from session output; keep state, next step, and recommendations**

- _Routed from:_ `documentation-surface-routing`'s inbound buffer, re-triaged by Errand `session-output-rehome`
  (2026-10-20); first routed there from `USER-INBOX § Work Unit` at the 2026-10-03 housekeep drain.

- _Shapes:_ § Purpose's audience widening from the entry above — what the Owner-facing field carries, and what an
  agent may say beside it.

- _Observation:_ ARC workflows and CLI-composed texts have the agent restate policy to the Owner at nearly every
  gate: "approval is not merge authority", "this does not establish convergence", "a disposition approval grants no
  next pass", residual-race disclaimers, "completed responses are not re-approved at this gate". Useful on someone's
  first day, noise ever after. It buries the state and the decision the Owner needs and lengthens every gate. This
  session's integration interlock, review-stop offer, and disposition reports were each mostly restated policy.

- _Principle (Owner, 2026-10-01):_ session output earns its lines by anchoring current state, naming what is next,
  or carrying a decision with the agent's recommendation. Restating ARC policy to the user does none of these.
  Every decision point comes with a recommendation.

- _Approach:_ a pass over the user-facing texts — workflow interlock and offer text (integration interlock,
  Owner-directed review stop, commit gates) and CLI-composed texts (`dispositionReportText`,
  `provisionalPassAssessment`, `recommendedPromptText`) — separating what the agent must do or check (stays in the
  workflow) from what it must say (cut to state, next step, decision, recommendation). The mirror of
  `agent-context-optimization`'s reading test: every line the agent says should change what the Owner knows or
  decides. Decide per item whether a disclosure must reach the Owner or only the agent; some, like checks bound to
  the approved head, may need to stay.

- _Captured during:_ Errand `review-evidence-record`, 2026-10-01.

- _Progress (2026-10-20):_ the `dispositionReportText` slice landed with Errand `disposition-report-trim`. The report
  now carries the lane position and grade counts, exception-only status lines, a Trend only from the second look,
  Decisions for real choices, and one CLI-composed approval question naming what approval releases; the advisory
  disclaimers and provisional and converged markers are gone. Still open: interlock and offer text,
  `recommendedPromptText`, and `provisionalPassAssessment.summaryText`.

- _Candidate (2026-10-20, Errand `integration-friction-evidence`):_ the Errand integration interlock is the next slice
  of the same shape. `run-errand`'s interlock lists everything the agent must state, restated policy included, and
  nearly every fact is deterministic: head, lane, merge method, each lane's review state, required checks, host
  review, and base movement with its overlap. A CLI-composed report could carry only those, conditional blocks
  only when they apply, and one closing question naming what approval releases:

  ```text
  **PR #1069 → main** · eb0dec8 · reviewed lane · merge
  - Review: frontline clean (CodeRabbit) · standard clean (Codex, pass 1 of 2)
  - Checks: ci-ok pending
  - Base: moved to 0bcdbd8 (#1068), no overlapping paths

  Approve: wait for checks → merge eb0dec8?   Redirect: release only
  ```

  Two constraints shape it. `review-request-contracts` defers any surface over `errandMergeRequest` until its
  redundant fields are derived. And the report's facts come from several commands, so one field per result cannot
  carry it: one command has to gather them, as the work-unit integration checkpoint already does. A preview mode of
  `arc errand merge` that derives the whole request would meet both. The Owner-directed review-stop offer is the third
  surface this entry names and could ride with it.

---

## Concern 1 — machine-mode failures are prose

- _Observation:_ a command in machine mode still fails in prose. `runDevBuildGuard` (`lib/dev-check.ts`), run from
  the `preAction` hook in `cli.ts`, composes the self-hosting stale-build refusal from a fully typed verdict —
  `basis`, `distAge`, `newestSrc`, `srcAge`, `qualificationReason` — flattens it into an English sentence, writes it
  to stderr, and exits 1 **regardless of `--json`**. Observed live 2026-09-18: `npx arc recover audit --json` returned
  prose, not JSON. `integrateCmd.action` in `cli.ts` (bare `arc integrate`) has the same shape. The typed vocabulary
  already exists — `lib/**` carries 406 `code: "..."` literals (2026-10-20) — it simply does not survive the CLI exit.
- _Why it costs:_ the repository's own governing instruction string-matches an English sentence because no code is
  exposed. `AGENTS.md`'s self-hosting recovery rule identifies the refusal by its prose — "the complete self-hosting
  stale-build refusal (`error: arc dev build is stale (...)`, refusal against stale `dist`, and the
  `npm run build:fast` remedy)" — to authorize a single rebuild-and-retry. Reword that sentence and the rule silently
  stops matching. A stable `code` would let the same instruction be exact instead of literary.
- _Pattern, not an instance:_ the same defect shape as the `effectiveCoverage` finding — ground truth parsed, then
  discarded at the boundary. Scope the general question (does any `--json` command emit JSON when it fails?) rather
  than repairing the one site.
- _Bounding:_ the stale-build guard is dev-only and does not ship, so that particular instance is not
  adopter-facing. The contract question is. Do not justify the work on the dev-only site alone.
- _Where failures go today (measured 2026-10-20):_ the one CLI-wide boundary is the `program.parseAsync().catch`
  handler at the end of `cli.ts`. A `CommanderError` keeps its exit code; anything else prints
  `formatUnexpectedError` to stderr and exits 1, so an uncaught throw under `--json` emits no JSON. Below it, each
  family shapes its own refusal, and most of them already write it to stdout:
    - `{ ok: false, error: { kind, message } }` per session-init slot (`Probe`, `commands/status/types.ts`);
    - `state: "refused"` with `reason`, a string `remedy`, `retryCommand`, and `recommendedPromptText`
      (`buildErrandNextResult`);
    - `state: "blocked"` with a typed `SpineRemedy` from the integration checkpoint;
    - `{ schemaVersion, error: { kind: "usage", code, message } }` for `arc check` parse failures
      (`throwCheckParserResult`).

  The review family's stable code `arc.review.unsupportedJsonOption` never reaches stdout:
  `rejectUnsupportedReviewJson` raises it through Commander's `command.error`, which prints prose to stderr.
- _Exit codes are per family:_ 0 and 1 almost everywhere; 2 for `arc check` usage (`throwCheckParserResult`) and
  `config validate` errors; 10–17 for release-wrapper refusals (`lib/release/types.ts`); 64 (`EX_USAGE`) for invalid
  input in the integration, base, review, and user handlers. A parsed `blocked` checkpoint result exits 0 —
  `handleIntegrationCheckpoint` sets no exit code for it — while its own input and operation refusals exit 64 and 1.
- _Machine-mode stdout is not clean (verified 2026-10-20):_ clack's `log` writes to `process.stdout` by default
  (probed against `@clack/prompts` 1.5.1), and `requireArcProjectRoot` (`handlers/shared.ts`, 52 callers) calls
  `p.log.error` unconditionally. Any `--json` command that reaches it puts a clack-formatted line on stdout ahead of
  whatever JSON follows. `p.log.error` has 106 call sites.

## Concern 2 — the `--json` boolean hides two output conventions

- _Observation:_ ARC carries two output conventions — human-default with a `--json` opt-in, and always
  machine-readable — and membership is announced nowhere. It is discoverable only by reading `machineReadable:` in
  `cli.ts`. Retiring the no-op flags removed a misleading signal; it did not make the families legible.
- _Measured 2026-10-20, after the inert-flag retirements:_
    - 51 visible `--json` options, and 51 `machineReadable: (opts) => opts.json === true` predicates;
    - 65 always machine-readable commands with no visible flag — 62 `() => true`, 3 `true`;
    - one command deciding by `isDecomposeMachineReadableInvocation`;
    - 44 of the 161 `withInteractionContext` wrappers declaring no `machineReadable` at all;
    - 21 hidden `--json` options in the `review` family, kept only to refuse the flag
      (`rejectUnsupportedReviewOutputJson`).

  The eight required-flag `--json` sites measured on 2026-09-18 are gone.
- _Classify by what the handler does, not by the policy:_ the predicate and the rendering are separate.
  `resolveInteractionContext` uses `machineReadable` only to forbid prompts, presenters, and ambient stdin; handlers
  choose JSON by re-reading `opts.json` themselves. `arc locus release` declares no `machineReadable`, yet
  `handleLocusRelease` emits JSON when the parent `arc locus --json` is passed, because it reads `locus.opts()` —
  invisible to any `machineReadable` audit. The 2026-09-18 pass found four declaration shapes, two indistinguishable
  by grep, which is why the original scoping pass mis-derived its own count. Any `--output` design has to classify by
  _what the handler does_, not by the interaction policy.

## Direction (settled 2026-10-20)

> _Decisions taken with the Owner on 2026-10-20 over the evidence in Concerns 1 and 2, § Prior art and idiom, and
> § Forward compatibility. The Owner-facing part is settled as direction only; its schemas are the co-design seam
> named in § Planning Continuity._

### Result shape

- **One result is one command's result.** Composite output is `composable-workflows` D3's to assemble (§ Forward
  compatibility), and the probe envelopes — `arc status --session-init`, `--recover`, and `--session-handoff` — stay
  out of this contract's sweep, because D3 and the seam rebuild them.
- **Shared kernel primitives and one emitter.** The generic shape lifts out of `lib/store/refusal.ts` into
  `lib/kernel/`, beside `ArcError`, `toArcError`, and the schema registry behind `arc schema`:
    - one `Remedy` (`text`, optional `argv`), replacing today's three remedy shapes;
    - a `Refusal` carrying `code`, `class` (`recoverable` or `terminal`), `condition`, `remedy`, and per-code
      details, each family closing its own code union;
    - a command result that is `ok` with its `result`, `refused` with its `refusal`, or `error` for an unexpected
      throw adapted through `toArcError`.

  The store's closed refusal union becomes one instance, its semantics unchanged. Handlers return a result, and one
  CLI-boundary emitter writes it — one JSON document in machine mode, human rendering otherwise — and sets the exit
  code from `status`, replacing the handler-local writes. The emitter is what makes the stream and exit-code rules
  hold structurally: every defect in Concern 1 comes from each handler emitting for itself. A recoverable refusal
  covers the "action required" case, with whatever it evaluated (a head, say) in its details. Lifting the store's
  refusal module lands after the cutover; the seam members edit beside it until then.
- **A negative answer is `ok`.** `refused` means the command could not do what was asked. A readiness check
  answering `blocked` succeeded, so domain states (`blocked`, `review-required`, `approval-required`, …) stay inside
  `result`.
- **Codes are a `domain` and a kebab `code`**, AIP-193's `(domain, reason)` pair. The `code` is unique within its
  family and the `domain` names the family — `dev` / `build-stale`, `store` / `not-found` — so the store's
  discriminants stay as they are, and an instruction that must name one refusal exactly names the pair: `AGENTS.md`'s
  rebuild rule becomes "on `dev` / `build-stale`, run its remedy once and retry". Legacy UPPER_SNAKE codes
  (`NOT_IN_ARC_PROJECT`) and dotted ones (`arc.review.unsupportedJsonOption`, `schema.registry.*`) rename in place.
- **The Owner-facing part is a `report` and an optional `offer`.** The `report` is precomposed and lifts to D3's
  `render`; the `offer` lifts to D3's `offer`. The recommendation is the agent's own, beside them: the CLI
  precomposes state and the choice set, never a judgment-dependent verdict (`strategy-procedure-evolution` § 1).
- **An `offer`'s choices are anticipated routes, not a whitelist.** They spare the agent re-deriving the common case;
  when it sees a better option it may recommend outside them, labeled as off the offered set, with its reason. What
  the CLI enforces — an interlock's valid transitions, a refusal's preconditions — the agent cannot execute around,
  but it may still propose an alternative for the Owner to take as a redirect. So an `offer` states whether its
  choices are enforced or anticipated, the separation `strategy-procedure-evolution` § 6 already asks for between
  enforced bounds and advisory considerations. This refines that strategy's § 1 ("emits and enforces a closed set"):
  anticipation is not prohibition. Record the refinement there at the spec or a grooming pass.

### Streams and exit codes

- **Stream rule.** In machine mode stdout carries exactly one JSON document per invocation — success, refusal, or
  error — and stderr may carry human diagnostics outside the contract. Human-mode output is presentation and stays
  where it is; moving it between streams is not this work unit's. The Errand "Keep clack log output off stdout when
  a command emits JSON" fixes the live leak.
- **Exit codes: 0, 1, 2, with no exceptions.** 0 for `ok`, negative answers included; 1 for `refused` or `error`,
  which `status` and `class` tell apart; 2 for an invalid invocation — options Commander cannot parse, or a request
  that fails its schema — replacing today's 64 and Commander's 1 there. The release wrappers fold in: their
  identifiers (`destructive-flag`, `branch-protection-violation`, …) become refusal codes, matching git, which exits
  1 on refusal, and the wrapper strategy's documented codes change in place under the pre-public-release posture.

### Output mode

- **One global `--output <human|json>`, with `--json` its shorthand**, inherited like `--no-input`. Each command
  declares the modes it supports and its default, `--help` prints both, and an explicitly requested unsupported mode
  is a usage refusal (exit 2), never ignored. `--json` is a deliberate short form in gh's and npm's spelling, not a
  compatibility alias; it retires the review family's hidden refusal options.
- **Declared once: `ARC_OUTPUT`.** Precedence is the flag, then `ARC_OUTPUT`, then the command's default, with no
  config-file layer: the mode belongs to the caller, not the project, so project config would hand JSON to its humans
  too. The environment value is a preference: a command that cannot honor it falls back to its default rather than
  refusing. JSON implies no prompts, as `machineReadable` does today; no prompts does not imply JSON; neither grants
  consent.
- **Agents declare explicitly; ARC does not detect them.** ARC's opt-in harness recipes — the ones
  `01_verify-and-configure` already merges into `.claude/settings.json` and `.codex/` — set `ARC_OUTPUT=json` in the
  harness's own environment configuration. Detecting `CLAUDECODE` or `AI_AGENT` stays out: the idiom is contested,
  `AI_AGENT` is an open proposal, and detection misreads a human typing in an agent's terminal. Revisit detection as
  a default-only hint if the recipe route proves insufficient.
- **No `--agent` preset.** `ARC_OUTPUT=json` or `--json` already gives no prompts, presentation fit for captured
  output, and structured stop results through recoverable refusals and offers; a preset would be a third spelling of
  the same choice. This settles the inbound "agent invocation preset" question; the entry's disposition records it at
  the ready-making pass.
- **TTY state selects presentation, never structure.** clig.dev endorses TTY detection for presentation (color,
  pager, progress) and warns against it for structure. `resolveInteractionContext` gates _interaction_ on TTY and CI
  (`promptOutputIsTTY` → `interaction: forbidden`) while leaving output shape alone, which is right under an agent
  harness where stdout TTY state is unreliable; the declared mode keeps that boundary deliberately.
- **Consequence carried to the sweep.** Once agent sessions get JSON everywhere, every workflow's command call relays
  the `report` rather than reading human output — the output-mode sweep plus the relay-rule co-design, already the
  last slice. Once `report` exists, a JSON-only command could gain a human mode by printing it.

### Stability

- **The contract is the registered machine-mode result.** Each command's result schema — the envelope and its
  payload — registers in the kernel registry and is discoverable through `arc schema list` and `arc schema get`; the
  shared emitter takes a registered schema, so registration cannot be skipped. The `(domain, code)` pairs and the
  structure of a remedy's `argv` are contract; renaming a code is breaking.
- **Outside the contract:** human-mode output, stderr diagnostics, and the wording of `condition`, `message`, and
  `report` — relayed or read, never parsed.
- **Evolution without a versioning model.** Consumers ignore unknown fields, stated from day one, so additions never
  break them. Before the public release every contract stays `strict-current` and changes in place; at release the
  public result contracts move to the registry's existing `backward-compatible` posture (`MigrationPosture`; all 163
  registered contracts read `strict-current` on 2026-10-20). Whether the envelope carries a version marker waits for
  the post-seam reconciliation `RELEASE-GATES` § Stance names.

## Prior art and idiom (surveyed 2026-09-18 and 2026-10-20)

> _An output-mode survey (2026-09-18) and two external passes on failure shape and audience separation
> (2026-10-20). `[unverified]` marks a claim a pass stated from memory or a secondary source; no direction below
> leans on one._

### Settled — align with it

- **One output flag with enumerated values and a per-command default** (surveyed 2026-09-18). kubectl
  `-o json|yaml|wide|name`, aws `--output json|table|text|yaml`, docker and podman `--format`, gh `--json <fields>`.
  It turns "two conventions" into "one convention with different defaults": the flag is never inert, `--help` prints
  the default, and family membership is announced for free. The closest structural precedent is git's
  porcelain/plumbing split, whose lesson is that the taxonomy is _documented_ — `git help -a` groups the families and
  states which output is stable. Reference canon: clig.dev (§ Output, § Arguments and flags) and Heroku's 12 Factor
  CLI Apps.
- **A stable machine code beside a message no client parses.** RFC 9457 makes `type` the primary identifier and says
  consumers "SHOULD NOT parse the detail member". Google AIP-193 pairs a stable `ErrorInfo.reason` (UPPER_SNAKE,
  unique per `domain`) with a developer-facing `message`, and puts dynamic values in `metadata` "so machine clients
  don't have to parse messages". The Kubernetes `Status` object carries a machine `reason` beside a human `message`.
  ARC's typed `code` literals are the `reason`; `AGENTS.md`'s string-matched stale-build sentence is the
  anti-pattern these specifications name. Per-occurrence values belong in fields, not only in prose.
- **Unknown fields are ignored; changes are additive.** RFC 9457 (clients MUST ignore unknown extension members),
  git `--porcelain=v2` ("Parsers should ignore headers they don't recognize"), and terraform's JSON formats (minor
  versions additive, consumers ignore unknown properties) agree. A version marker can arrive later without breaking a
  consumer told from day one to ignore unknown fields, which fits `RELEASE-GATES` § Stance's no-versioning-yet line.
- **The machine mode is the contract; human output may change.** clig.dev and gcloud both put the contract behind
  the explicit mode, and gcloud states its stderr text "may change from release to release".
- **Precedence runs flag, environment, project config, user config** (clig.dev); aws resolves `--output` →
  `AWS_DEFAULT_OUTPUT` → config file.
- **Suppressing prompts never grants consent.** Claude Code's `-p` denies unapproved calls, Codex `exec` defaults to a
  read-only sandbox, CodeRabbit's agent mode "never waits for or assumes confirmation", and clig.dev keeps
  `--no-input` distinct from `--force` and `--confirm`. ARC already holds this line: `--no-input` versus the
  interlocks.
- **Data on stdout, diagnostics on stderr.** clig.dev: "Anything that is machine readable should also go to stdout";
  "Log messages, errors, and so on should all be sent to stderr".

### Split — the contract has to choose

- **Where a machine-mode failure goes.** Big-vendor CLIs print prose to stderr and promise JSON only on success
  (gcloud and gh; aws, az, and kubectl `[unverified]`); gcloud says "the only reliable error indicator is the exit
  status". Terraform `-json`, cargo `--message-format=json`, and CodeRabbit `--agent` put typed failures in the stdout
  stream instead. ARC's own refusal families already take the second line (Concern 1), so one JSON document on stdout
  in machine mode would confirm house practice rather than import it.
- **Exit codes.** gh keeps a few (0; 1; 2 cancelled; 4 authentication required). Pulumi recently adopted a typed table
  of about ten classes. `sysexits.h` (64–78) calls its own interface deprecated and non-portable. Terraform's
  `plan -detailed-exitcode` encodes a result state (2 = changes present). The common practical line is a few codes,
  with the fine class in the structured code.
- **Auto-detecting an agent.** Vercel turns its non-interactive mode on when it detects an agent; CodeRabbit only
  suggests `--agent`; Speakeasy's agent-CLI guidance wants the mode explicitly requested. `CLAUDECODE=1` is documented
  for Claude Code subprocesses; `AI_AGENT` is an emerging convention still open in agents.md issue #136. The common
  compromise: detection may pick a default, an explicit setting always wins, and detection never implies consent.

### Thin — ARC's own design

- **One precomposed field an intermediary agent relays verbatim.** No direct precedent. Every surveyed human-message
  field is for display by a client UI or for debugging, and each specification tells programs not to parse it — but
  an LLM agent is the one consumer that reads prose, so the relay rule has to live in ARC's instructions, as
  `strategy-procedure-evolution` § 6 and the session-init "render verbatim" slots already place it. The nearest
  analogues:
    - terraform `-json`'s `@message`, "a human-readable summary", shown at least for unknown message types;
    - AIP-193's split between a developer-facing `message` and a user-facing `LocalizedMessage` carrying a call to
      action: two prose audiences beside one machine `reason`, the shape the audience entry describes;
    - MCP's `annotations.audience` (`user` / `assistant`) on tool-result content — advisory in the specification
      and weakly honored by clients `[unverified]`. MCP's advice that a structured result also return its
      serialized JSON as text is the exact relay failure this work unit removes.
- **A recoverable stop as a result status.** Emerging, with no shared schema: CodeRabbit's `action_required` result
  (`status: "awaiting_confirmation"`, the exact re-run command, consent bound to a head commit), MCP's 2026-07-28
  `resultType: "input_required"`, and Vercel's `action_required` codes `[unverified]`. `DEV-RULES.PROJECT`
  § Recovery-complete refusals already requires the distinction; the shape is open.
- **Agent presets.** Agent CLIs bundle no prompts, JSON on stdout, progress on stderr, and fail-fast "needs X"
  results behind a flag — Claude Code `--output-format`, Codex `exec --json`, Gemini CLI `--output-format json`,
  CodeRabbit `--agent` — and keep consent a separate control in each. Guidance on agent-to-human relay is
  essentially absent: Anthropic's "Writing tools for agents" covers concise responses and actionable errors, not a
  human-facing field.

**Sources:** <https://www.rfc-editor.org/rfc/rfc9457.html> · <https://google.aip.dev/193> ·
<https://kubernetes.io/docs/reference/kubernetes-api/common-definitions/status/> · <https://clig.dev/> ·
<https://docs.cloud.google.com/sdk/gcloud/reference/topic/command-conventions> ·
<https://cli.github.com/manual/gh_help_exit-codes> · <https://www.pulumi.com/docs/iac/cli/exit-codes/> ·
<https://developer.hashicorp.com/terraform/internals/machine-readable-ui> ·
<https://developer.hashicorp.com/terraform/internals/json-format> ·
<https://doc.rust-lang.org/cargo/reference/external-tools.html> · <https://git-scm.com/docs/git-status> ·
<https://docs.coderabbit.ai/cli> · <https://modelcontextprotocol.io/specification/latest/server/tools> ·
<https://code.claude.com/docs/en/headless> · <https://github.com/agentsmd/agents.md/issues/136> ·
<https://www.anthropic.com/engineering/writing-tools-for-agents>

## Forward compatibility (checked 2026-10-20)

- **`composable-workflows` D3 owns composite output.** After the cutover, session-init, recovery, and handoff become a
  compiled agenda (`RELEASE-GATES` § After the cutover, with `loadset-composition`): an ordered list of typed steps
  whose Owner-facing kinds are `render` (a precomposed state surface), `note` (an advisory), `offer` (precomposed
  text plus a flat, closed set of choices, each carrying at most one step such as `exec`), and `gate` (interlock type
  and prompt). Thought-state sections compose agent-side, and the CLI never injects content. Composite results are
  the compiler's to assemble, not one result's. This contract owes per-command results whose Owner-facing part lifts
  into those steps without translation, defined once in the shared schema kernel. The session-init probe envelope is
  being replaced — by D3, and for the slots the seam rebuilds, by the seam — so it is no model for this contract.
- **`strategy-procedure-evolution`:**
    - § 1's judgment clause: where a decision needs judgment, the CLI emits the closed set of allowed actions and the
      facts it can compute, the agent recommends, and the Owner decides; a judgment-dependent recommendation never
      becomes a computed verdict. So the precomposed text carries state and the choice set, while the recommendation
      the Owner's principle requires at every decision point is the agent's own, beside it. That bounds what an agent
      may say beside the report.
    - § 4 and the one-schema-kernel rule: result types derive from the CLI's Zod base and register for `arc schema`,
      so "what is stable" can mean "what is registered", with no hand-written schema document.
    - § 5: whether literal models relay faithfully is a judgment-layer property that only evals verify
      (`workflow-eval-harness`); § 6 already records the cross-model question as unvalidated.
    - § 7: the field names are load-bearing vocabulary, defined once.
- **`strategy-knowledge-evolution`:**
    - § 7, emitted remedies over loaded documents: a failure carrying its `code` and a remedy argv lets `AGENTS.md`'s
      self-hosting recovery rule key on the code instead of a sentence, and shrinks it.
    - § 1 and § 10: the relay rule ("relay the report; never echo the rest") must not grow the always-loaded set
      casually. Its candidate homes are the dispatch line at each consuming workflow now and D3's `render` step
      semantics later; placing any of it in always-loaded content reads `analysis-load-set-scoping` first.
    - § 9: audience-tagging is the projection model's own direction, and the audience split is consistent with it.

## Audience fields today (inventory 2026-10-20)

- **No shared emit path.** Handlers write their own output: 63 `process.stdout.write(JSON.stringify(…))` sites across
  30 source files, handler-local emit and format helpers, and clack (re-exported from `lib/terminal.ts`) for human
  text.
- **At least nine names for "text to relay":** `recommendedPromptText` (session-init channels and the Errand verbs;
  32 files), `recommendedActionText` (delivery, `arc attest`, the checkpoint payload, review chunking; 27 files),
  `interactionText` (the review gate; 22 files), `dispositionReportText`, `mergeabilityGuidance`,
  `deliveryPosition`'s `line`, bare `guidance` (base-branch sync, pushability), `remedy.text`, and `locusGuidance`'s
  strings. "Command to run" has its own spread: `remedy.argv`, `retryCommand` (a string), `recommendedCommand`, and
  session-init `actions[].argv`. Three remedy shapes compete: `RemedySchema` (`argv` optional, `lib/store/refusal.ts`),
  `SpineRemedySchema` (`argv` required, plus `invariant`), and a bare string (`buildErrandNextResult`).
- **Two composers already apply the exception-filtered shape, one only halfway.** `composeCheckpointInterlockSurface`
  collapses its nine machine signals to one line when clean and lists only the unclean ones, but its fixed decision
  statement still carries three restated-policy lines — host policy controls base currency, required checks are
  head-bound, base movement during the merge window is a residual race — the disclosures the content rule has to
  decide. `renderDispositionReport` with `reportCloser` (PR #1069) shows non-zero grade counts, exception-only status
  lines, Decisions only when real, and one composed `Approve: … ?` naming what approval releases.
- **The rule's home exists; the contract does not.** `strategy-procedure-evolution` § 6: "Anything rendered verbatim
  to the user — offers, advisories, prompts — is precomposed by the CLI (the `recommended*Text` pattern), not
  templated in prose." Session-init's probe-envelope reference documents the convention slot by slot. Nothing defines
  the field names, what an empty value means, or how a failure is shaped across commands.

## Planning record

- **Depth and Class (draft-design entry, 2026-10-20).** Depth `high`: an evolving multi-concern draft with a real
  contract to author. `Class: Heavy` confirmed: derivation fires (a contract with alternatives and tradeoffs to work
  out), and scale fires (classifying each command's output mode by what its handler does, across 167 actions). Not
  `Novel`: the audience split composes ARC's own precedents — the work-unit checkpoint's precomposed interlock surface
  (`integration-boundary-accuracy` B5), the disposition report (PR #1069), `autonomy-levels`' report / continuation /
  record split, and `strategy-procedure-evolution` § 6 — even where outside idiom is thin.
- **Boundary: stays one WU (2026-10-20).** Failure shape, output mode, the audience field, and its content rule are
  one contract: a slot without its content rule, or an envelope without the audience split, each leaves today's ad
  hoc state. Delivery is single-branch with chunked review, the landing shape every work unit takes while stacked
  delivery stays paused. The natural slices — the failure envelope, the audience field and its composers, and the
  output-mode sweep last, after the storage members' CLI churn — become task-plan segments and review chunks, not
  deliverables. Pulling one slice forward as an Errand, as `disposition-report-trim` did, is a decision taken at that
  time, not authored delivery state.
