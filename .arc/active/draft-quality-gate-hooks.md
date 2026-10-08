# Draft: Quality Gates and Hook Integration

- **Origin:** [internal]
- **Purpose:** Replace ARC's fixed, prose-resolved quality-gate tiers with declared checks that one CLI verb selects,
  runs, and reuses — keyed to repository events rather than to ARC's approval machinery — so a project's checks run
  where industry practice runs them, once per tree, from hooks, workflow steps, and CI alike.

---

## Status

- **Readiness:** formalization-ready — every settle-able decision is settled and the success signal is stated.
- **Resolved:** the four design commitments; the gate model and its vocabulary; the check declaration; the gate verb;
  selection and reuse; the verb's requests, presets, execution, outcomes, and output; fire sites (no per-task gate);
  fix handling; the human skip; the ratchet boundary; this repository as first consumer in-WU; the storage boundary
  and its seven forward-compatibility seams; the tier names' full retirement; the buffer triage.
- **Open:** none.
- **Next:** the capture commit, which also retitles the meta to match this draft and advances to `create-spec`.
  Route-outs execute at that close (§ Buffer triage and § Coordination).

## Problem / Motivation

ARC defines three quality-gate tiers by _when in the workflow_ they run — Tier 1 per task, Tier 2 per coherent unit,
Tier 3 per phase or pre-PR — and leaves each project to write the commands for each tier as prose. Four defects follow.

**1. Gates re-run over unchanged trees.** Nothing records which checks passed on which tree, so every fire site runs
its block again. Measured at `c009ab198` across the framework workflows:

- the last subtask of a parent runs Tier 1 and then Tier 2 back to back (`process-task-loop`), and Tier 1's
  file-scoped checks are strict subsets of Tier 2's;
- the last Tier 2 is followed by `verify-work-unit`'s Tier 3, which adds only `build`; `self-review` running Tier 3
  immediately before `verify-work-unit` repeats it again with no change between;
- a `prepare-work-unit` review fix runs Tier 1, then the commit hook, then convergence over the same tree;
- a delivery member's last task runs Tier 2 and `deliver-stack` runs the complete Tier 2 again per member checkout;
- the tier definitions disagree on when Tier 3 fires — `strategy-quality-gates.md` and `QUICK-REFERENCE.md` place it
  per phase or pre-PR, while `process-task-loop` never fires it — so the phase template plus the mandatory verification
  task runs it twice.

The one exact-tree reuse that exists is narrow: delivery review-fix verification admits Tier 1 reuse under
`tier1ReuseCriteria` (`review-fix-verification.ts`) with `provenance: "exact-tree-reuse"`
(`review-fix-continuation.ts`). The unchanged-tree rule itself lives only in this repository's project rules; no
framework workflow, method, or strategy carries it, and `verify-work-unit`, `prepare-work-unit`, `integrate-work-unit`,
and `run-errand` say to rerun.

**2. A fixed block fires at a fixed cadence.** The per-task gate was introduced as fail-fast backpressure: catch a
defect while it is cheap, before later work builds on it. The intent is sound, but the mechanism assumes the worst —
a blocking block of mixed-cost checks after every increment. Industry practice has no milestone cadence: fast, scoped
checks at commit; broader checks at push; the full suite in CI; editor diagnostics as the continuous layer.
Agent practice converges on "verify before declaring done" with targeted checks, a heavier check at the stop
boundary, and CI as the backstop; no source shows agents need a tighter cadence than humans, only a different
feedback channel (`research-local-check-cadence.md`). Measured at 2026-07-25, the documented Tier 1 cost ~47s and ran
three full-project scans on changes that often could not reach them (64 of 200 sampled commits were Markdown-only);
targeting the same coverage brought it to ~1s.

The tiers also collapse two kinds of check into one bar. A per-task check is _feedback_ ("did I break what I just
wrote?"); a pre-merge check is _enforcement_ ("this may not merge broken"). With no distinct job, Tier 2 drifted to the
enforcement end and became Tier 3 minus `build`.

**3. Gate composition is prose the agent must rediscover.** The Tier 2 set is a fenced bash block in
`QUICK-REFERENCE.md`, reached through `quality-gate-commands`, a method that is an explicit passthrough. No CLI reads
either surface: `arc check` has only the `commit-msg` subcommand (`handlers/check/commit-msg.ts`). Every ceremony
that says "run the gates" spends agent attention working out which commands those are; relevance rules ask the agent
to compare `git diff --name-only` against a table; and nothing reports what actually ran. Separately enumerated local
and CI sets drift — local Tier 3 reported green while CI rejected `lint:arc:section-refs`, which the local set omitted.

**4. Projects get no hook support for their own checks.** ARC's shipped pre-commit hook runs structural checks only
(20 `CHECK[...]` blocks in `githooks/pre-commit`); its pre-push hook only warns before a force-push
(`githooks/pre-push`, advisory, always exits 0). A project that wants its linters or tests at commit or push wires its
own hook — this repository chains `lint:md:staged`, `check-package-sync.sh`, and `check-ts-quality.sh` after ARC's
hook in `.husky/pre-commit`, and `check-ts-quality.sh` runs whole-program `typecheck` and `typecheck:test` on every
staged TypeScript change, a third run after the tiers already ran them.

This matters now: ARC is pre-1.0 and this surface is central; agents commit at every review increment, so redundant
runs compound; and CI already reuses a verified tree (`classify-change.sh` skips the heavy suite when its
rebase-stable code-tree hash matches a tree whose `HEAVY_CHECK_NAMES` all passed) while local runs have nothing
equivalent.

## Design commitments

Four constraints bound every decision below.

1. **Event-anchored, interlock-independent.** Gates are deadlines named by repository events — commit, push, merge —
   which happen however approval is configured. Gate semantics never read interlock state, no gate configuration names
   an interlock, and the verb is a leaf any caller may invoke: a workflow step, a hook, CI, or a future ratchet layer
   that decides _when_ steps fire. The shared names (`commit-`, `push-`) are the same git events, not a coupling; the
   release wrapper is at most one caller. What an event enforces is never such a layer's to relax: a gate's deadline
   protects the integrity of a check (DEV-RULES.ARC § Rule Authority). A ratchet may relax only the feedback runs before
   it — the done boundary and segment verifiers — by choosing a lighter request preset (D3).
2. **Industry idiom first.** Where practice is near-universal, follow it; where it splits, make it configuration with
   a stated default; diverge for agents only where the research names a real divergence. Grounding:
   `research-local-check-cadence.md`.
3. **Project-agnostic.** Every element must serve a project in any language. This repository is the first consumer:
   it _configures_ the design to prove each configurable element, and never _extends_ it. A need of this repository
   that the configuration cannot express is a design signal — generalize it only if another stack would plausibly
   need it; otherwise this repository wraps it in its own script.
4. **Procedure and knowledge north stars.** Structure is typed configuration the CLI validates; the CLI computes
   selection and reuse; workflow prose names the verb and never the commands; failure output carries the remedy.
   No new command-reference document, no growth of always-loaded rules, and no prose that evaluates state
   (`strategy-procedure-evolution.md`, `strategy-knowledge-evolution.md`).

## Direction

### D1 — Gate model and vocabulary

Tier 1/2/3 retires entirely as vocabulary (settled 2026-07-25 against measured evidence; the rename lands inside the
mechanics work, since rewriting fire sites to the verb rewrites the very lines that name the tiers). Four concepts, two
of them vocabulary:

- **Quality gate** — a deadline named by the event a check must pass before: the commit, push, and merge gates,
  declared as `commit`, `push`, and `merge`. "Must have passed before commit / push / merge." Each name is the event,
  never an ARC lifecycle stage, so no gate reads as the twin of an interlock. "Quality" stays part of the term: bare
  "gate" already names ARC's approval gates, entry and exit gates, the review gate, and the host-side auto-merge gate
  (`setup-merge-gate.md`), so prose says "commit gate" or "push gate", and "merge quality gate" wherever the host's
  merge controls are also in view. Self-enforcing in a way an ordinal is not: a commit gate costing 47s is visibly
  wrong.
- **Kind** — `enforcement` (must pass by its gate; blocks there) versus `feedback` (informative before the gate).
  Kind is derived, never declared: a check is enforcement at its own gate's deadline and feedback at any earlier fire
  site, and the verb labels each result accordingly. Kind is what lets a test-first sequence carry an intentionally
  failing test across increments while the push gate still holds.
- **Cost** — measured data the verb records with each run, never declared.
- **Selection** — a mechanical rule (D4), never vocabulary.

Zero tolerance holds per gate at its deadline: every check assigned to a gate passes before that event. This
repository's project rule ("all quality checks must pass before any commit") changes accordingly — Owner decision,
2026-10-07, on the direction the 2026-07-25 grooming recommended.

Define **quality gate** once, in the briefs' vocabulary, with kind as a clause of that entry rather than a second term.
It replaces the Class entry's "Distinct from the quality-gate `Tier 1/2/3`" and the briefs' pointer to
`quality-gate-commands`, so the always-loaded set barely grows. Word it to agree with the shipped rule-authority
reading (DEV-RULES.ARC § Rule Authority): an enforcement result protects the integrity of a check, so a red gate is
never the agent's to set aside. A feedback result binds nothing until its gate, but a red one is still reported red and
handled under § Quality gate failure; a failure carried on purpose — a test-first test written to fail — is named as
such in the completion report, where the approval gate accepts it.

**From tiers to gates.** The tiers named when a check ran and the gates name what it must pass before, so the mapping
goes by fire site, not one to one:

- Tier 1 after a task, an errand pass, or an approved review fix in `run-errand` → the `done` preset (D6);
- Tier 3 over `self-review`'s approved fixes → the `done` preset over those fixes;
- Tier 1 over a fix in a correction path of `prepare-work-unit` or `integrate-work-unit`, including an applied
  `arc wu reconcile` correction → the commit gate over that fix;
- Tier 1 over the new head a base merge commits → the `new-head` preset from the pre-merge head (D6);
- convergence verification → the scope its action names, forced: `focused` → the push gate over the branch's change
  from its merge base; `full` (stored as `verificationKind: "tier-3"`) → the merge quality gate (D6);
- Tier 1 bound to a delivery review fix's `verification.target` (`deliver-stack`) → the commit gate over that target's
  whole tree, forced; delivery's own `tier1ReuseCriteria` arm keeps deciding whether to run at all, so the verb's
  record never becomes delivery's evidence (D5);
- Tier 2 at a coherent unit → the `segment-close` preset, where the plan declares a segment verifier (D6);
- Tier 2 per delivery member (`deliver-stack`) → the push gate over the member's whole tree;
- any other check run after a change in a workflow step, named by tier or by a pointer to the command list —
  `process-task-loop`'s item-2 triggers and pre-report checklist, `integrate-external-content`'s Tier 1,
  `clean-work-unit`'s Markdown lint — → the `done` preset;
- Tier 3 before the pull request → the merge quality gate, in `verify-work-unit` and CI.

The names retire from shipped prose (19 files under `packages/arc-framework/arc/` today), the briefs and rules, and
emitted text such as the convergence remedy "Run Tier 3, then replace the carried evidence placeholder and attest."
(`integration-boundary-locus.ts`); older boundary records persist that text as `interactionText` and keep it until
regenerated, as the pre-release posture allows. The sweep goes by sense, not by word: five more shipped files use "tier"
only for unrelated scales — ADR amendments, parallel-fit reads, launch checks, release-wrapper setup, and the
configurability tiers in `arc-config.yml` — and keep it; `strategy-configurability-architecture.md` and
`strategy-session-operations.md` use both senses (configurability and context-loading tiers), and only their
quality-gate passages change. The same search reaches prose that uses "tier" in the gate sense without the numbered
names — `02_define-project.template.md`'s "What are the quality gate commands at each tier?", which D2's bootstrap
replaces, or `strategy-integration.md`'s "which quality-gate tier applies" — rather than this count. Code identifiers
are renamed too, mechanically: type and schema names, variables, and delivery's stored fields — `tier1Required`,
`tier1ReuseCriteria`, and `ReviewFixTier1VerificationSchema` across `delivery-execution.ts` and seven `lib/delivery/`
files. Nothing writes or reads those fields while delivery is paused, so the Owner waived the storage boundary's
no-record-shape-change rule for them (2026-10-07); the spec confirms no live delivery record exists before renaming. One
value keeps its spelling: `verificationKind: "tier-3"` in the review gate's stored integration boundary record
(`RunConvergenceVerificationActionSchema`), along with its echo in `arc attest`'s output (`attest.ts`) so the concept
has one spelling. Renaming it would change a live record's shape, so a record an older build wrote would stop parsing in
any worktree that writes it before merging base. It routes to `storage-seam` as a hold, renamed when that work's
review-and-evidence partition reshapes the record.

### D2 — The check declaration

A project declares each check once, by id — two checks may share a command — in typed configuration the CLI validates.
The shape follows every major hook tool (pre-commit.com `stages:` / `files:` / `pass_filenames`; lefthook `glob` /
`run`; Turborepo `inputs`):

- **id** and **command** — an argument list run without a shell, as pre-commit.com and lint-staged do by default, so
  appended paths are never re-parsed by a shell and the command behaves the same on Windows; a check that needs shell
  features opts into one or calls a script;
- **gates** — which deadlines it belongs to; a check in no gate stays runnable by id (pre-commit.com's `manual`
  stage);
- **inputs** — globs its result depends on; default the whole tree, so an undeclared input can only cost a run, never
  yield a false reuse; narrowing is the project's opt-in. Optional runtime inputs name commands whose output joins the
  key (Nx's `{ "runtime": "node --version" }`), for state no tracked file records — a tool version, an install. A check
  may opt out of widening (D4), so only its own inputs select it — lint-staged's and pre-commit.com's behavior for every
  task, as Nx lets a target's inputs leave out its shared global inputs;
- **mode** — `files` (receives the changed or staged paths among its inputs) or `project` (runs whole-project). Either
  way a check learns which paths changed only from the verb — the paths it receives, or being selected at all. A `files`
  check reads what a path held before the change only at the request's base, which the verb exports to it with the
  checked tree, as pre-commit.com exports `PRE_COMMIT_FROM_REF` and `PRE_COMMIT_TO_REF` to a run over a ref range; a
  `project` check has no change to read against. The base is `HEAD` only for a change against it — at the commit hook,
  in the `done` composition, and in a staged, changed, or path-list request (D3, D4); a range request names its base; at
  `new-head`, at a push tip, and in a whole-tree run `HEAD` is the checked tree itself, so no check assumes it. A
  whole-tree request's base is the branch's merge base with the base branch. Where the change is one merge's — while it
  concludes, or over a range from its first parent to the merge, as at `new-head` — the base is that first parent, and
  the verb also exports the merged-in parent, the second, so a check can tell what the change inherited from what it
  authored, as Git's `MERGE_HEAD` lets one today; a range over several commits, a merge among them, gets the base alone,
  as pre-commit.com's push range does. Where no base resolves (D4), none is exported, and what a check that needs one
  does then is its own call, as whether zero cases pass is (D3);
- **root** — the working directory, with `files` paths passed relative to it (lefthook's `root`); this repository's
  root `lint:ts:file` does that translation by hand today;
- **fixes** — whether it may rewrite files, where fixes apply (D7);
- **CI-only** — gate and preset requests run it only in CI, for a check that needs CI's infrastructure or is too slow
  for local runs (pre-commit.ci's `ci: skip` is the mirror image): they select it only when the request carries the CI
  input (D3), which the CI job passes, so no provider convention is assumed and a local request that passes it runs
  more, never less. Elsewhere it is `not selected` with that reason, so an attestation names what it does not cover. A
  request for it by id runs it anywhere, and the dry run lists it either way (D3);
- **shards** — a count and the argument that selects one shard (`--shard={index}/{count}`, as Jest, Vitest, and
  Playwright accept); CI runs one job per shard (D9), and local runs stay unsharded;
- **cache** — on by default; off for a check whose result depends on something no input can name, such as remote
  state (Turborepo's and Nx's `cache: false`).

Global inputs that invalidate every check (lockfiles, tool configuration, the declaration itself, and any runtime
inputs) are declared once. By default they also stand in for tool and installed-dependency versions, as Turborepo's and
Nx's lockfile hashing does. The accepted residual is a run against an install the lockfile no longer describes — after a
base merge changes the lockfile, before a reinstall — recorded under the new lockfile's key and reused after it; a
project closes it by declaring a global runtime input that fingerprints the install (D11).

The declaration's type joins the production schema registry (`createProductionSchemaRegistry()` in
`production-schema-registry.ts`, from which `build-schema.ts` writes the shipped schema bundle), so the CLI validates
the file against one type. Editor completion and validation in that file, as Turborepo and lefthook offer, come from
`schema-introspection-layer`'s editor publication: the declaration's type opts in through that work's marker on its
registry metadata (`KernelSchemaMeta`), and an editor resolves the generated, self-contained JSON Schema document
through a reference in the file: a `$schema` value, which the type therefore admits as a top-level key, or a YAML
language-server modeline. The bootstrap below writes that reference through that work's shared reference function, never
a fixed path.

The declaration lives in a dedicated file beside `arc-config.yml`: the project authors it, with no ARC defaults, while
ARC renders `arc-config.yml` from its own template (`renderConfigOverrides` in `template/render.ts`), and a dedicated
file is the hook tools' idiom (lefthook's `lefthook.yml`, pre-commit.com's `.pre-commit-config.yaml`). Whether it later
folds into a typed project configuration is `config-storage-architecture`'s call. ARC's configuration layer resolves
only dotted keys today (`resolve-override.ts`), so reading a structured file through it — wherever the install profile
keeps it (§ Forward compatibility with the store, seam 4) — is new scope here, coordinated with
`config-storage-architecture`, and built as that layer's general typed-file read rather than one specific to the
declaration, which `arc-config.yml`'s CLI reader can move onto. The read parses the file with a standard YAML or JSON
parser and validates typed values against the declaration's type — numbers, booleans, and lists stay typed, unlike the
strings `parseArcConfig` returns (`RawArcConfigSchema`) — so the type describes the file as an editor's parser reads it
and never flags a valid one. ARC ships no stack defaults. Initial setup's bootstrap proposes declarations from what the
project already has — its gate commands, populated `post-task-quality` and `post-unit-quality` actions, and any
`quality-gate-commands` override — and `arc update` runs the same bootstrap whenever it keeps a retired surface with
content for review (`keptForReview` in `manifest/apply.ts`), so retiring those surfaces (D10) loses nothing silently for
a new or an existing install, and under the pre-release posture no migration reader stays behind. Common-stack examples
(JS/TS, Rust, Go, Python) route to the docs site through a `notes-docs-content-sweep.md` capture at draft close.

### D3 — One gate verb

One CLI verb — gate requests added to the existing `arc check`, which today carries only `commit-msg` — resolves a
request, selects (D4), reuses (D5), runs what remains, and reports. Every caller uses it: workflow steps, ARC's hooks,
CI, and any harness edit hook.

- **Requests.** Hooks use event forms — the commit event, and the push event reading the pushed refs (D8). Every other
  caller names a gate with a scope — staged, changed, the range from a base it names, all, or an explicit path list for
  harness edit hooks and targeted mid-task checks; one check by id, over any of those scopes (all by default); or a
  named preset composing gates for a fire site (`done`, `segment-close`, and `new-head`, D6), so the composition lives
  in the CLI rather than workflow prose. A CI input marks a request as CI's: it adds the CI-only checks to what the
  request selects (D2) and applies no fixes (D7). A gate request takes no skip or relaxation argument; presets are what
  a future ratchet chooses between. A force flag re-runs without reuse (Turborepo's `--force`); attestation fire sites
  always use it (D6).
- **Dry run.** Reports what would run, what is reused, and why anything is unselected, with each check's last measured
  cost, without running anything (Turborepo's `--dry`) — so an agent with a hard tool timeout sees a long gate coming
  and runs it in the background. Its JSON form carries every check in the gate, CI-only and fix-capable ones flagged,
  with each check's resolved invocations — working directory, argument batches, and one invocation per shard for a
  sharded check — and the base and checked tree the verb would export, with the merged-in parent where the change is a
  merge (D2), for CI (D9).
- **Execution.** Fix-capable checks run first (as fixers or as checks, D7), one at a time in declared order, so a
  formatter finishes before a linter reads its files; the rest run in parallel, with a switch to run serially (practice
  splits: pre-commit.com runs in order; lint-staged and Turborepo run in parallel). Every selected check runs and every
  failure is reported — pre-commit.com's default; the verb has no fail-fast mode — so one run gives an agent every
  failure. `files` checks receive only paths that exist (a deletion selects checks but is never passed as an argument,
  lint-staged's default filter), batched under the platform's argument-length limit as pre-commit.com and lint-staged
  both do.
- **Outcomes.** ARC sees how a command ran, never why it failed, so the exit status is the whole contract with a check;
  whether "ran zero cases" passes stays the command's own job. Per check: `passed`; `failed` (it started, then exited
  non-zero or was killed — the project's check speaking, even when a hang or crash in the change caused it);
  `couldn't run` (it never started: missing, not executable, or a spawn error — DEV-RULES.ARC's "the gate never ran");
  `reused`; `not selected`, with the reason; `skipped` on a person's request (D8). Per request: `invalid` (the
  declaration fails its schema, naming the field), `refused` (an ARC-detected condition, D8), or `none declared` for the
  gate. A check passes only as `passed` or `reused`. A request exits 0 when every selected check passed, was reused, or
  was skipped by a person, or when nothing is declared; `skipped` and `none declared` stay labelled in the report and in
  the precomposed verification line, which never calls them passed. It exits 1 when a check failed, and 2 when a check
  could not run or the request was invalid or refused — ESLint's convention, where 2 means the run itself failed. There
  is no timeout field: the dry run is how a long gate is foreseen.
- **Output.** Terse and failures-first, with JSON for machine callers. A passing check is one line; a failing one shows
  a bounded tail of its output and the path to its full log; files a fix rewrote are listed, so an agent re-reads them
  before editing; a run that read worktree content other than its checked tree says so (D5). Each result carries its
  § Quality gate failure class — `couldn't run` is "the gate never ran", a fixer's failure is "deterministic
  same-concern", any other failure is report-and-ask — and the CLI precomposes the completion report's verification line
  from them.
- **Remedies.** An ARC refusal is recovery-complete (DEV-RULES.PROJECT § Engineering Standards): it reports the observed
  condition, names a remedy that never discards work, and keeps the success path reachable on retry. A check's own
  failure has no ARC-composable fix; its remedy is the check's output, the command to rerun it by id over the failed
  run's scope and base — never with the CI input — and, for a `fixes` check, that same rerun, which applies its fixes
  (D7).

### D4 — Selection

A check is selected when its declared inputs changed in the request's own change: for the commit gate, the staged change
against `HEAD` (while a merge concludes, only what the merge itself produced, D8); at the done boundary, the worktree as
it would be staged against `HEAD`; for the push gate, the pushed range — for a ref new to the remote, from its merge
base with the base branch — and at `segment-close` the range the next push will carry (D6); for `new-head`, the change
from the head it names. Merge quality gate requests run every check by default (a CI-only one only in a CI request, D2):
they are the authority's run and the attestation's, so they take no selection unless a caller opts in
(`verify-work-unit` never does). Selection widens to every check that has not opted out (D2) when a global input
changed, a changed path matches no check's inputs, or the base cannot be resolved (shallow clone, missing ref) — Nx and
Turborepo fail closed the same way.

Selection trusts that unchanged inputs were already checked — what was committed passed its gate, and what came from
the base passed the base branch's checks. That is the idiom's trust too: lint-staged runs a task only when a staged
file matches its glob. It holds because local runs are a convenience layer and CI is the authority, which is why CI
does not select by default (§ Open items).

The package-mirror case (a one-sided edit to a mirrored file pair) is expressed through inputs, not special
machinery: a check whose correctness spans both copies declares both.

### D5 — Reuse

The verb keeps a machine-local record of passes in each worktree's own Git directory (for a linked worktree, under
`.git/worktrees/<name>/`), as Turborepo and Nx keep their caches inside the checkout; machine-local state stays local
through the storage cutover. Worktrees do not share it: each has its own installed dependencies, which a lockfile digest
cannot vouch for across checkouts — this repository's `lint:md:staged` checks exactly that drift
(`loadIndexedMarkdownDependencies` in `indexed-dependencies.ts`, against `markdownRuntimeVersions()`). Key: check id, a
digest of the check's declaration, and a digest of its inputs' content in the checked tree — per check, since the inputs
already exist for selection — plus the output of any runtime inputs and, for a `files` check, its change: each changed
path among its inputs with what it held at the base and, for a merge, at the merged-in parent (D2). Only passes are
recorded: a failure, a check that could not run, a skipped check, and a check with `cache` off always run again; a hit
replays the stored summary. A fault reading or writing the record degrades to a run, never to a pass or a refusal. The
record is an execution shortcut, never evidence: no attestation, Candidate, or merge check reads it.

The checked tree is the content the event will carry: at the commit hook, the index (`git write-tree`); at a workflow
step, the worktree as `git add -A` would stage it — tracked changes plus untracked files Git's exclude rules admit; at
the push hook, the checked-out branch's pushed tip (D8). Every run sees a Git index equal to its checked tree (Git's
`GIT_INDEX_FILE`) — at the commit hook, the index Git hands the hook, which `git commit -a` and a path-limited commit
already make a temporary one; elsewhere, a temporary one built from the checked tree once fixers finish — so a check
that reads the index, such as a staged-files linter, reads what the event will carry. The index's content is what this
guarantees, not its diff against `HEAD`, which is empty wherever the checked tree is `HEAD` itself; a check learns its
change from the verb and the request's base (D2). A pass is recorded only when the check could have read nothing else; a
fixer's pass is recorded under the content it produced, which, being idempotent, it would pass unchanged (D7). When the
worktree differs from the checked tree inside a check's inputs — unstaged edits or untracked files at the commit hook, a
worktree ahead of the pushed tip at push — the check still runs, in either mode, since a `files` check may read past its
arguments (an import graph, a type-aware program); it reads the worktree, the residual lint-staged accepts, but its
result is labelled with that difference and not recorded, so reuse never vouches for content a run did not see. So a
step's run and the hook's run over the same content produce the same key, and the second is free. The release wrapper
already rejects a bad message before Git runs any hook; on the raw `git commit` path, where the content gate runs before
the message check, a message-only retry now reuses the content result, because the key is the tree, not the message.

### D6 — Fire sites

No per-task gate. The fail-fast intent is served at the points where it pays:

- **Done boundary** — a review increment's completion in `process-task-loop`, an errand pass or approved review fix in
  `run-errand`, `self-review`'s approved fixes, and the other workflow-step runs D1 maps to it: request the `done`
  preset — the commit gate plus the push gate's `files` checks over the change (for example, related tests via
  `vitest related` or `jest --findRelatedTests`). The commit set's failures block the commit; the push gate's subset is
  feedback in the completion report. This composition is the framework default, not a project knob. The request runs
  once the increment's tracked edits are final — until the storage flip, that includes the task list's `[x]` and
  completion note, which ride the commit — so the checked tree is the committed tree. Fixes apply here, before review
  (D7).
- **Segment verifier** — a `slice` or `replication` segment's closing verifier makes `segment-close` its done-boundary
  request, at the same point and over the same checked tree: the `done` composition plus the push gate over the range
  the next push will carry, from the branch's upstream (or its merge base while unpublished) to the tree the increment's
  commit will carry, so the push hook after that commit reuses it. The plan declares where broader verification pays
  off, replacing the "coherent unit" judgment Tier 2 rested on. A red result holds the segment open and goes through
  § Quality gate failure: it is a gate failure, not evidence against the design, which only the verifier's scenario
  tests (a failed scenario still goes to `amend-design`). The CLI already parses each segment's mode
  (`TaskListSegmentMode` in `segmentation.ts`), so the task cursor names the preset for the closing task and the
  workflow step dispatches on it rather than evaluating the mode; the verb itself knows nothing of segments. A `layer`
  segment needs nothing extra.
- **New head** — when a base merge commits a new head (`arc base merge`'s `merged / run-quality-gates` result, in
  `run-errand` and the correction paths), request the `new-head` preset from the pre-merge head: the commit and push
  gates over the change from the head it names, the state no earlier run saw.
- **Commit and push hooks** — run their gates; normally a reuse.
- **Work-unit verification** — `verify-work-unit` runs the merge quality gate over the whole tree with force, so
  attested evidence never rests on a replayed result. Convergence verification before an attestation runs the scope its
  action names, also forced: `full` runs the merge quality gate, and `focused` the push gate over the branch's change
  from its merge base, which the verb resolves itself, so the CLI keeps choosing the scope and the action needs no new
  field. With the fire sites above, this carries DEV-RULES.PROJECT's re-run rule: after a base merge (`new-head`, or,
  for a merge concluded by hand, the commit gate over what it produced and then the push gate), after a review fix (the
  done boundary, the commit gate in a correction path, or delivery's review-fix verification), and at the first
  composed-work attestation.
- **CI** — runs the merge quality gate over the whole tree as the authority (D9).
- **Held correction and delivery steps** — the gate steps in `prepare-work-unit`, `integrate-work-unit`, and
  `deliver-stack` become one-line requests by D1's translation, with no change to the machinery around them
  (§ Storage boundary).

Push cadence stays neutral: gates are deadlines, so a project that pushes once a session and one that pushes hourly
get the same guarantees. The done-boundary push subset is what gives regular test feedback between pushes.

### D7 — Fixes and restaging

Fix-capable checks run at the done boundary with fixes applied to the worktree before review, so reviewed content is
committed content and the hook usually finds nothing to fix. For commits made outside a workflow step, hook-time
behavior is configuration — `restage` or `fail` — because practice splits (lint-staged and lefthook `stage_fixed`
restage; pre-commit.com and Overcommit fail). Default `restage`, following lefthook's rule: fail the hook if the restage
itself fails, so unfixed content never commits silently. A restage must not re-trigger the gate or loop. This absorbs
the add → format → re-stage loop: `format:tables` refuses untracked paths (`validateExplicitMarkdownPaths` in
`selection.ts`), then the index / worktree drift guard in `worktree-index-drift.ts` fails. `format:tables` admits the
untracked paths Git's exclude rules allow, through the worktree view `selection.ts` already offers
(`enumerateTrackedMarkdownPaths`' `worktree` source), so a new artifact formats at the done boundary like any other.

Fixes apply only where content is still being formed: at the done boundary (including `segment-close`), in a request for
one check by id or over an explicit path list — a harness edit hook running a formatter after each edit — unless it
carries the CI input, and at the commit hook. Every other request — a gate request over a staged, changed, range, or
`all` scope, the push hook, the merge quality gate in `verify-work-unit`, convergence verification, and every request
carrying the CI input (D3) — runs a fix-capable check as a check: if it rewrites any file it is `failed`, as
pre-commit.com fails a hook that modified files, and the rewrite stays in the worktree for the next commit. Fixers are
assumed idempotent, as every hook tool assumes; the checked tree is computed after they finish, so a fixer's pass is
recorded under the content it produced, and the commit carrying that content reuses it.

### D8 — Hooks

ARC's shipped pre-commit hook runs its structural checks, then dispatches the commit gate through the verb; the shipped
pre-push hook keeps its force-push advisory and dispatches the push gate. Both stay on the existing `hooks.pre_commit` /
`hooks.pre_push` keys; gate dispatch is on when the project declares checks for that gate and off otherwise. Push
dispatch gates code refs only (§ Forward compatibility with the store, seam 2), and of those only the checked-out
branch, checked at its pushed tip (D5). A ref deletion carries nothing to check, as the shipped `pre-push` already skips
it. Any other pushed ref — a review projection, a delivery member published from one checkout, a branch pushed by name —
has no worktree here to run in, so its checks are reported `not selected` with that reason rather than refused; its own
checkout's gates and CI cover it. Hook-manager integration keeps its shape (ADR-014: husky, lefthook, pre-commit.com, or
a direct `.git/hooks/` install), but its generated pre-push entries gain what the push event needs to see the pushed
refs (`integrateLefthook` and `ARC_PRE_PUSH_HOOK` in `hook-integration.ts`): lefthook's `use_stdin: true`, and
pre-commit.com's `always_run: true`. pre-commit.com's hook reads Git's ref lines itself and passes on only the first it
does not skip (a deletion, or a ref carrying nothing the remote lacks) as `PRE_COMMIT_LOCAL_BRANCH`,
`PRE_COMMIT_FROM_REF`, and `PRE_COMMIT_TO_REF` — without the last two when that ref's whole history is new to the
remote, where the event resolves the branch's tip itself (`_pre_push_ns`). Only `arc init` and `arc join` write these
entries today (`configureGitIntegration`), and both leave an existing entry alone, so `arc update` upgrades an existing
`arc-pre-push` entry in place, as `integrateLefthook` already upgrades its older commit-msg entry. The upgrade arrives
in the same update as the gate dispatch, and an entry it cannot upgrade, it reports. A push with no ref lines carries
nothing — Git runs `pre-push` even then — and checks nothing, as the shipped `pre-push` already treats it.
pre-commit.com's own limits are residuals CI covers: a push naming several refs shows the event only one, so when that
is not the checked-out branch its push gate does not run locally; and it runs ref-scoped pre-push hooks with unstaged
changes set aside in a patch (`staged_files_only`), so under it the push gate runs inside the window ARC's commit gate
avoids (below). Hooks remain bypassable by design; CI is the authority, and ARC's `--no-verify` prohibition stays agent
discipline.

A person may skip named checks for one run through an environment variable (`ARC_SKIP=<id>,<id>`), as pre-commit.com's
`SKIP` and lefthook's `LEFTHOOK_EXCLUDE` allow — namespaced so it never collides with pre-commit.com's own `SKIP` in a
project running both. A skipped check is reported as skipped, never as passed, and never recorded; ARC's structural
checks are not declared checks and cannot be skipped this way. It is narrower than `--no-verify`, which drops the
structural checks too, so without it the routine human bypass would be the wider one. Only the hooks' event request
forms (D3) honor it; every other request runs every selected check, so a variable a person's shell carries never reaches
an attestation run through an agent. Agents never set it: the `--no-verify` invariant in DEV-RULES.ARC extends to it
(D10).

Most tools read the worktree, not the index, so a commit hook over partially staged content can certify bytes that will
not be committed. pre-commit.com hides unstaged changes by writing them to a patch file and checking out the index
(`git checkout -- .`); lint-staged also pushes a backup onto the stash stack, which is shared across the worktrees ARC
runs concurrently. Both rewrite the worktree mid-hook and depend on process cleanup to restore it — and an agent harness
that kills a hook at its tool timeout skips that cleanup, stranding the hidden changes. Instead the commit gate refuses
only where those bytes would be certified as the file itself: when a staged path inside a selected check's inputs also
carries unstaged edits — a partially staged file, the same scope as today's Markdown drift guard
(`findStagedMarkdownWorktreeDrift`). The remedy names the paths and never discards work: stage the whole file, or, for a
person splitting hunks on purpose, skip the named checks for that commit (`ARC_SKIP`). Other unstaged and untracked
files never refuse — committing one task's files while another's stay unstaged is routine (DEV-RULES.ARC § Atomicity) —
and D5's labelled, unrecorded run covers what they leave a check reading.

While a merge is being concluded (`MERGE_HEAD` set, which the shipped `commit-msg` already exempts), the commit gate's
change is what the merge itself produced, as pre-commit.com scopes it then (`get_conflicted_files`): the paths Git lists
as conflicted in `MERGE_MSG`, plus every path whose staged content matches neither parent — the base and the merged-in
parent the verb exports (D2) — which takes in edits made while resolving. Selection and widening then apply as at any
commit. ARC's own merge conclusion — the ROADMAP-conflict remedy commit in `mergeAppendOnly` (`merge-composition.ts`),
made only when no other path stays in conflict — commits with `--no-verify`, so it runs as ARC's clean merge does: Git
runs `pre-merge-commit` there rather than `pre-commit`, ARC ships no `pre-merge-commit`, and ARC's `commit-msg` already
passes a merge. Neither the commit gate nor ARC's structural checks run on that commit, as on the clean path. It writes
only ROADMAP, derived from the merged metas, and both paths return `merged / run-quality-gates`, so `new-head` verifies
them alike rather than a red aborting the remedy as `regenerable-refused`. The flag is ARC's own merge mechanics,
Owner-approved as product behavior: DEV-RULES.ARC's `--no-verify` invariant governs agents' commits and stands, and no
signal an agent could set is added. It lasts until the storage flip removes ROADMAP as a stored file, and the remedy
with it (the ROADMAP row of the register in `cohort-state-storage.md`).

### D9 — CI parity by construction

CI runs the same declaration through the same verb, so a check cannot be local-only or CI-only by omission — CI-only is
a declared, labelled property (D2) — the local-green / CI-red class closes structurally rather than through a parity
test. CI needs ARC's CLI for that only once: a setup job runs the dry run, whose JSON (D3) lists every check in the
merge quality gate with its resolved invocations — working directory and argument batches. Later jobs run those
invocations natively — exporting the base and checked tree it lists, and failing a fix-capable check that leaves the
tree changed (`git diff --exit-code`), as the verb would (D7) — so the project's language needs nothing else, or fan
them out as a job matrix (GitHub Actions' `fromJSON`) with one job and one status per check, or per shard of a sharded
check. A job that runs the verb itself passes the CI input, so its requests select the CI-only checks (D3). The list
carries every check in the gate, not a selection, so every job exists on every run. A project that opts into
base-relative selection lets each job skip itself on the selection, with a roll-up job as the one required status — as
this repository's `ci.yml` does with `classify-change.sh` and its `ci-ok` roll-up, required through its `merge-ok`
alias.

### D10 — Knowledge placement

- **Quality gate** enters the briefs' vocabulary as one entry, with kind as its clause (D1).
- `quality-gate-commands` retires or becomes a pointer to the declaration.
- `QUICK-REFERENCE.md` § Quality Gate Commands gives way to verb help and emitted remedies.
- `strategy-quality-gates.md` shrinks to what an operator needs that the verb cannot say; its tier, escalation, and
  checkpoint-placement content is replaced by D1 and D6. Its STRATEGY-INDEX entry is rewritten as a directive firing
  condition, and DEV-RULES.ARC's line loading it "for quality gate tier definitions" goes.
- The `post-task-quality` and `post-unit-quality` extensions retire. Each exists to add a project's own checks after
  the Tier 1 or Tier 2 run (`process-task-loop`, and `run-errand` for the first); a check is now a declaration entry,
  which the verb selects, reuses, and runs from hooks and CI alike, so a second place to add one would recreate
  defect 3's drift. Initial setup's bootstrap, and `arc update` for an existing install, carry a project's populated
  actions into its declaration (D2).
- DEV-RULES.ARC's `--no-verify` invariant extends to `ARC_SKIP` (D8), and its integration-candidate clause that a
  reconciled head "passes Tier 1" names the `new-head` preset.
- This repository's DEV-RULES.PROJECT § Selecting what to run shrinks to its zero-tolerance policy once the verb
  computes selection and reuse; its re-run rule moves into D6's fire sites, and its CI-only E2E rule into the
  declaration (D11).

Every retired or renamed surface's sites come from a search at spec time, not from an enumeration here. The search
reaches the install registries (`init-recipe.json`, checked in both directions, and the configurable-file list in
`classification.ts`), shipped strategies that use a retired surface as an example, the extension-point validators' doc
comments, and their tests, so content is relocated rather than silently deleted for every project.

### D11 — This repository as first consumer

The final work moves this repository's existing checks into declarations, proving each configurable element:

- the `.husky/pre-commit` chain becomes declared checks dispatched by ARC's hook, each trading its own
  `git diff --cached` selection for declared inputs (D2): `lint:md:staged` as a `project` check certifying the index,
  whose inputs cover what triggers it today — non-excluded Markdown, the Markdown configuration, and its checker's
  runtime files and dependencies (`isMarkdownGateTriggerPath` and `MARKDOWN_GATE_INPUT_PATHS` in `staged-gate.ts`);
  `check-package-sync.sh` as a `files` check whose blind-copy test reads each path's prior content at the exported base
  and, as its `MERGE_HEAD` exemption does today, passes content equal to the merged-in parent, which the change
  inherited; and `check-ts-quality.sh` retiring into its parts — `lint:ts:file` as a `files` check with `root`, and
  `typecheck` and `typecheck:test` as `project` checks over the TypeScript inputs;
- the QUICK-REFERENCE gate blocks and the DEV-RULES.PROJECT relevance table become inputs and gate assignments;
- the package-mirror coupling becomes declared inputs (D4);
- `format:tables` and the Markdown drift guard exercise D7, including a new, untracked artifact;
- `lint:ts:file`'s repository-to-package path translation becomes the check's `root` (D2);
- `lint:sh` runs a system-installed `shellcheck` with no version file (`run-shellcheck.sh` resolves it from the system
  `PATH`), so its version becomes a runtime input (D2);
- `lint:md:staged` checks the installed Markdown dependencies against the lockfile — state outside its files — so the
  repository declares a global runtime input that fingerprints its npm install (`node_modules/.package-lock.json`,
  npm's record of what is installed); no reuse outlives a reinstall, and none skips that check after a lockfile change
  (D2);
- `test:changed` selects its own change through `vitest --changed=main` (`local-vitest-runner.ts`); as a `files` check
  it receives the verb's changed paths instead;
- E2E and portability are declared CI-only, and integration and E2E sharded, as the project rule ("E2E is enforced by
  the heavy CI lane before merge") and `ci.yml` have them today (D2); E2E's per-shard anchor plus remainder (`ci.yml`'s
  E2E matrix) moves into a script that takes the shard argument, since one count and one argument cannot express it. The
  rule's local half ("run it locally only when E2E files changed or when explicitly requested") becomes a request by id
  and a second check sharing its command, with only the E2E inputs and opted out of widening, in the push gate;
- CI invokes the verb (D9), after `test-suite-reliability` lands its CI layout changes.

Checks this repository does not yet have are distinct concerns and route out (§ Buffer triage). One element has no
case here: no check of this repository reads remote state, so `cache` off is proven by tests alone.

## Success signal

- A commit made right after a done-boundary run, with nothing else changed, executes no check: the hook reports every
  selected check `reused`.
- A Markdown-only change runs no code check, and the report names each unselected check with its reason.
- No check is enumerated outside the declaration: the `.husky/pre-commit` chain, the QUICK-REFERENCE gate blocks, and
  CI's check list are gone or derived, so removing a check from the declaration removes it everywhere.
- No framework workflow names a tier or a command list; each gate step is one `arc check` request.
- Every ARC refusal has a test of the refusal and of the successful retry after its remedy.
- A measured before-and-after of this repository's per-increment check time, against the ~47s documented for Tier 1.

## Alternatives

**Tier vocabulary** — settled 2026-07-25. _Gate-only_ (deadline names) loses the feedback / enforcement distinction;
_cost-class as the second axis_ codifies the axis that empirically collapsed (Tier 3 exceeds Tier 2 by `build`
alone, ~5%); _status-quo cleanup_ keeps the ordinal that let Tier 1 run full-project scans undetected. Chosen: gate ×
kind, with cost as measured data and selection as a rule (D1).

**Where gate composition lives:**

- _Stage metadata in the `quality-gate-commands` method, read by hooks_ — puts structure in Markdown for shell to
  parse. Rejected.
- _One method per stage_ — more files, the same prose-as-structure defect. Rejected.
- _Consume the project's hook-manager configuration_ (`.pre-commit-config.yaml`, `lefthook.yml`) — ties ARC to one
  manager's schema and still leaves workflow steps and CI without a resolver. Rejected; a declared check's command may
  invoke a hook manager or task runner.
- _Typed ARC declaration resolved by the verb_ — chosen (D2, D3).

**Where reuse comes from:**

- _Adopt a task runner (Nx, Turborepo, Bazel)_ — stack-specific. Rejected as framework substrate; a project with one
  declares checks that call it, and its own cache composes underneath.
- _No reuse; rely on selection alone_ — selection cannot dedupe two fire sites over the same tree. Rejected.
- _Tree-keyed pass record in the verb_ — chosen (D5), following `git test` and git-branchless.

**Per-task cadence:**

- _Keep a blocking per-task block_ — overcorrected, with no evidence it is needed.
- _Feedback only at edit time through harness hooks_ — harness-specific, and leaves no done-boundary check.
- _Done-boundary run of the upcoming gate plus the push subset_ — chosen (D6).

**Pre-push enablement** — _smart default_ (on when push gate checks are declared), _always opt-in_, or _always on_.
Chosen: the smart default under the existing `hooks.pre_push` key (D8).

**Hook-time restage** — configurable, default `restage` (D7).

**Human per-check skip** — _none_, leaving `--no-verify` as the only bypass, or _a namespaced skip variable_. Chosen:
the variable (D8); pre-commit.com and lefthook both offer one, and its absence widens the bypass people use.

## Open items

None open. Settled 2026-10-07 on the stated leans: the verb extends `arc check` (D3); the done-boundary composition is
the framework default (D6); CI runs the verb or the commands it lists (D9); reuse keys per check (D5); the declaration
has its own schema-validated file (D2); lockfiles and tool configuration stand in for tool versions (D2); the
gate-coverage audit routes out (§ Buffer triage). A later review the same day added the verb's requests, presets,
execution, outcomes, output, and dry run (D3); argument-list commands, `root`, `cache`, and runtime inputs (D2); the
human skip (D8); the CI job matrix (D9); the ratchet boundary (commitment 1); the tier names' full retirement (D1); and,
at the readiness pass, retiring the `post-task-quality` and `post-unit-quality` extensions (D10). The first adversarial
pass settled the partially-staged refusal (D8), the checked content at each event and the per-worktree record (D5), the
request exit composition (D3), the `segment-close` scope and the `new-head` preset (D4, D6), forced attestation runs and
whole-tree merge quality gates (D6), the tier-to-gate translation and its held-site edits (D1, § Storage boundary), and
the quality-gate term (D1). The second pass settled the index each run sees (D5), fixer behavior by fire site (D7),
CI-only and sharded checks (D2, D9), hook-manager ref forwarding and merge-conclusion scope (D8), and the update-time
bootstrap (D2); its fix-check rounds settled how a check learns its change and the base it reads (D2, D5), the merge
conclusion's scope and ARC's own merge conclusion (D8), the update-time hook-entry upgrade (D8), CI-only selection and
the CI input (D2, D3), the by-id and path-list fix sites (D7), fix-capable checks in native CI jobs (D9), the merged-in
parent (D2, D5, D11), request scopes and their bases (D2, D3), the widening opt-out (D2, D4, D11), and the remedy
commit's mechanics (D8).

**Last-known-good base** (settled the same day). Locally, the merge base may itself be unverified; CI learns verified
trees from the host's checks API (`classify-change.sh`), which a stack-agnostic verb cannot assume. No stronger
anchor is built locally: selection relative to each event's own change (D4) matches the idiom, the reuse record
covers repeat runs, and CI remains the authority. CI runs the merge quality gate over the whole tree by default and may
opt into base-relative selection only where the host's required checks vouch for the base.

## Storage boundary

The scope edge against the `state-storage` program (register in `cohort-state-storage.md`):

- **Survives:** the verb, the declaration, selection, and the machine-local reuse record (machine-local state stays
  local), provided results remain an execution shortcut and the Candidate's verification evidence stays a free
  string; local / CI parity from one declaration; the routine gate steps in `process-task-loop`, `verify-work-unit`,
  `run-errand`, and `self-review` (the cutover rewrites those files' commit steps, so the cost is merge conflicts
  only); code checks at commit.
- **Touch lightly:** the gate steps in the correction paths of `integrate-work-unit` and `prepare-work-unit`, and in
  `deliver-stack` (seam and held delivery territory), change only by D1's translation — one line each naming the
  request, with no change to the machinery around them, so the cost is merge conflicts. The Owner approved this
  narrowing of the boundary on 2026-10-07, since leaving tier names and command lists there would break the full
  retirement. ARC's ROADMAP remedy commit in `mergeAppendOnly` changes too, committing with `--no-verify` so it runs as
  the clean merge does, until the flip removes it (D8; Owner-approved the same day).
- **Out:** any new Markdown gate over `.arc/` state (projected state drops out of lint); hook checks over planning
  artifacts; a pre-handoff hook and notes-consistency check. The register row naming this work unit (commit-time
  checks over artifacts that will no longer be committed, and a git-notes check) is discharged by dropping both.

### Forward compatibility with the store

Only the contract has shipped, but `spec-storage-contract.md` already specifies the parts this design meets: the ref
layout (D10), sync and push (D12), task close (D16), branchless planning (D17), and ghost mode with the surface
boundary (D19). The design holds no state family — it touches tracked code and project machinery, a machine-local
cache, hooks, and configuration — so it builds on today's substrate and carries through the flip without rework,
provided seven seams hold:

1. **Gates check tracked content only.** Operational state and authored design are validated by their record kinds at
   write, never by a gate, and no check reads state through Git. Selection and reuse keys follow Git's exclude rules,
   so the projection — excluded per clone — never enters them.
2. **The push gate gates code refs only.** State refs ride a code push in one `--atomic` push, or push alone at
   `arc sync`; the pre-push hook sees both. Gate dispatch skips `refs/arc/*`, a push carrying only state refs runs no
   gate, and the force-push advisory skips them too, since state history follows its own policy.
3. **A failed push gate reads as a code-leg failure.** The contract's push loop already pushes the state leg alone
   when the code leg cannot; the failure must surface to it as that case (a hold for `storage-seam`).
4. **The declaration resolves through ARC's configuration layer** (new scope, D2), wherever the install profile keeps it
   — tracked under the standard profile, the per-machine tier under ghost — never by a fixed tracked path, and its
   digest is of resolved content. Ghost's named cost applies as the contract states it: one copy of the gate commands
   for every branch, with no per-branch override built until a long-lived branch with different tooling hits it.
5. **The reuse record is a disposable cache.** Its own directory in each worktree's Git directory, never under
   `.git/arc/store/`; keyed by content, never by commit, so it survives history rewrite; never stored, synced, or
   projected. It is machine-local by the contract's invariant, but outside the paths the register's `.git/arc/` row and
   the contract's machine-local set name, so it joins that set (a hold for `storage-seam`). Entries are
   content-addressed and write-once with atomic create, so concurrent sessions in one worktree never conflict.
6. **Output honors the surface boundary.** What the verb prints where people read without ARC — CI logs, check and
   status text — names the project's checks and results, with no ARC vocabulary.
7. **Fire sites name the verb, not commit mechanics.** The cutover rewrites those workflows' commit steps, so the cost
   stays merge conflicts. Branchless planning takes no commits, so planning fires no gate. Before the flip, the task
   list's completion edits ride the commit, so the done boundary runs after them (D6); after it, task close runs after
   the increment's commit, so the done boundary stays before that.

## Scope boundary (Won't Do)

- Knowledge-base content checks (cross-references, anchors, forbidden patterns) — `knowledge-lint`'s charter. The
  verb dispatches `arc lint` like any declared check.
- Changing the shipped hook script format or the hook-manager integration's shape (ADR-014); its generated pre-push
  entries gain only ref forwarding, which `arc update` applies to existing entries (D8).
- Rewriting or consolidating the 20 structural CHECKs.
- Tech-stack defaults or lint-tool opinions in shipped content.
- A local hook for the merge quality gate — CI and review own it.
- Harness-specific edit-hook wiring. Any harness hook can call the verb; examples go to the docs site.
- A warm-watcher feedback layer (`tsc --watch`, `test:watch` kept running across a session) — out of scope, not
  rejected; it carries its own lifecycle, staleness, and portability problems and becomes its own work unit if pursued.
- Push cadence and interlock or ratchet policy — they decide when steps fire; this work defines what a fire runs.
- New checks for this repository (they route out).

## Coordination

- **`markdown-formatting`** (shipped) — owns `lint:md:staged` and MD060 table alignment, and handed commit-time
  auto-fix plus restage back here: D7 takes it.
- **`test-suite-reliability`** (active) — changes CI sharding, `classify-change.sh`'s heavy-check list, and test
  budgets. This work's CI edits (D9, D11) wait for it to land; it makes each run cheaper, this makes there be fewer.
- **`knowledge-lint`** (planned) — receives the two citation and anchor checks from the buffer.
- **`inbound-routing-method`** (planning) — this triage is the first live test of its routing rule; what was hard to
  place goes to it as evidence.
- **`storage-seam`** / **`storage-cutover`** — the storage-tied buffer entries go to them as holds, with three more for
  `storage-seam`: a failed push gate must read to the push loop as a code-leg failure (seam 3); the per-worktree reuse
  record joins the machine-local set (seam 5); and the stored `verificationKind: "tier-3"` value renames when its
  review-and-evidence partition reshapes that record (D1).
- **`config-storage-architecture`** (planned) — owns where configuration lives, including ghost's per-machine tier; the
  declaration's home and the structured-file read follow it (D2, seam 4). It also takes, from
  `schema-introspection-layer`, the question of `arc-config.yml`'s string-only reading — `parseArcConfig` in the CLI,
  and the shell reads through `arc_config_get` that each hook's enable check, all of `pre-push`, and `pre-commit`
  outside `arc-in-git` still make — whose CLI side can move onto D2's typed read.
- **`schema-introspection-layer`** (planning) — builds editor publication: one self-contained JSON Schema per opted-in
  registered type, generated into the installed `.arc/system/.internal/schemas/`; this work's declaration is its named
  consumer, and its bootstrap writes the file's reference through that work's shared reference function
  (`draft-schema-introspection-layer.md`).

## Boundary fit

Stays one work unit. The four surfaces — declaration, verb, selection, and reuse; hook dispatch; fire-site and
knowledge consolidation; first-consumer adoption — are one design, and each depends on the first. They are review
chunks within one singleton landing, not deliverables: until the storage program completes, the work unit lands
single-branch with chunked review through the current landing bridge and carries no delivery plan — by Owner
direction (2026-10-07), following the landing rule the storage program sets for its own members
(`cohort-state-storage.md` § Soft coordination) — optionally projecting its chunks as stacked draft pull requests for
review. The fire-site rewrite is what makes the vocabulary rename nearly free, so the earlier hooks-versus-vocabulary
split would edit the same lines twice.

## Scope estimate

`Heavy`, larger than the earlier "days to a week":

- declaration, schema, validation, and the structured-file read through the configuration layer: 2–3 days;
- the verb — selection, reuse record, the per-run index, runner (ordering, parallelism, batching, fixer modes),
  outcomes, output, dry run, remedies: 5–7 days;
- hook dispatch, both copies, and hook-manager paths, including the update-time entry upgrade: 1–2 days;
- fire-site consolidation, the presets, and the vocabulary sweep (19 shipped files name the tiers today): 2–3 days;
- knowledge placement and the recipe check: about 1 day;
- the bootstrap, at initial setup and on update: 1–2 days;
- first-consumer adoption and CI parity: 1–2 days.

The mechanics slice (declaration through hooks) is roughly 8–12 days; whether it takes an implementation slot beside
the storage program's Stage 2 is decided at activation.

## Buffer triage

The 30 routed-in entries were triaged on 2026-10-07 against `c009ab198`, each verdict spot-checked against the tree.
Full entry text is in this draft at `7ea9addfa`. Route-outs execute at draft close as `USER-INBOX` captures through
`arc-inbox`, each with `WU_Target` and `_Shapes:_`; no sibling artifact is edited from this branch.

**Folded into the body (6):**

- _Give ceremonies a CLI-resolved gate invocation_ → D3.
- _Keep local Tier 3 commands in parity with required CI gates_ → D9.
- _Close the two-copy sync blind spot in gate selection_ → D4 and D11.
- _Reassess message-only content-gate caching_ → D5.
- _Close the add → format → re-stage loop_ (with the auto-fix residual of _Markdown-formatting enforcement_) → D7.
- _Reconcile ownership after repository Markdown enforcement ships_ → § Coordination and D7.

**Dismissed — resolved elsewhere (5):**

- _Distinguish raw Git rename/copy statuses_ — fixed by `fcd311a85`. Residual: no test pins the exemption (Errand).
- _The worktree Markdown gate cannot see untracked files_ — fixed by `df272224c`.
- _Pre-commit hook runs no markdownlint_ — `markdown-formatting` put `lint:md:staged` in `.husky/pre-commit`.
- _Markdown-formatting enforcement_ — MD060 table alignment runs in `lint:md`; emoji was a non-goal there.
- _Prevent unrelated large blobs from crashing pre-commit validators_ — `872b1e8e0` deleted the validator. Residual:
  `validate-meta-spec.ts`, `remedy-roadmap-conflict.ts`, and `assert-roadmap-regenerated.ts` use a local 32 MiB
  limit instead of `MAX_GIT_OUTPUT_BYTES` (Errand).

**Storage-tied — hold for the storage owners (5):**

- _Lock a completed task's identifier_ — task lists become store records.
- _Guard or migrate dev-repo-only `npx tsx` hook delegations_ — most of those checks retire at cutover.
- _Validate commit-message ranges in CI_ — the footer grammar changes under `ghost-mode`.
- _Config-gated TTY-confirm escalation for the force-push advisory_ — `history-policy`.
- _Flat `active/` layout is unguarded_ — the projection supersedes the layout; likely dismissed there.

**Another work unit's charter (7):**

- _Add a checker that resolves Markdown `§` citations_ and _Resolve cross-file Markdown anchors_ → `knowledge-lint`.
- _E2E-coverage and seam-assertion guards for destructive lifecycle verbs_ → the testing domain;
  `testing-guidance-apparatus` has shipped, so it needs a new home (Work Unit capture).
- The four test-cost entries (pre-change baseline, warm-run practice, machine-readable result, hosted CI fallback
  budget) → Errands or a `test-suite-reliability` follow-up; the hosted-fallback entry's named target does not exist.

**Errand-shaped (7):** fail closed on an unprovisioned hooks path in hand-made worktrees; false green on an excluded
lint path; runtime examples versus meta-project references in code; integrity verification for mode-scoped installs;
an exported-surface TSDoc lint rule; an actionlint gate; whether cognitive complexity replaces the cyclomatic limit.
The changed-file Markdown under-wrap detector prototype (calibration data at `7ea9addfa`) joins them as a new check.

**Removed from this scope at consolidation (1):** the gate-coverage audit (`arc check-gates`, comparing detected
ecosystem scripts with configured gates; full text at `7ea9addfa`) → a provisional follow-on stub. Parity by
construction (D9) removes the local / CI drift its four recurrences were; what remains is a check neither runs.
