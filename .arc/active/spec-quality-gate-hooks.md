# Spec (`detailed` · `RFC`): quality-gate-hooks

- **Origin:** [internal]

- **Purpose:** Replace ARC's fixed, prose-resolved Tier 1/2/3 quality gates with checks a project declares once and one
  CLI verb selects, runs, and reuses per tree. Gates are keyed to the commit, push, and merge events rather than to
  ARC's approval machinery, so hooks and workflow steps run the same checks, each once per tree, and a CI wired to the
  declaration runs them too.

---

## Introduction / Context

ARC defines three quality-gate tiers by when in the workflow they run: Tier 1 per task, Tier 2 per coherent unit,
Tier 3 per phase or before the pull request. Each project writes the commands for each tier as prose in
`QUICK-REFERENCE.md` § Quality Gate Commands, reached through the `quality-gate-commands` method, which is an explicit
passthrough. Four defects follow.

**1. Gates re-run over unchanged trees.** Nothing records which checks passed on which tree, so every fire site runs
its block again. Measured across the framework workflows at `c009ab198`:

- the last subtask of a parent runs Tier 1 and then Tier 2 back to back (`process-task-loop`), and Tier 1's
  file-scoped checks are strict subsets of Tier 2's;
- the last Tier 2 is followed by `verify-work-unit`'s Tier 3, which adds only `build`, and `self-review` running Tier 3
  immediately before `verify-work-unit` repeats it with no change between;
- a `prepare-work-unit` review fix runs Tier 1, then the commit hook, then convergence verification over the same tree;
- a delivery member's last task runs Tier 2, and `deliver-stack` runs the complete Tier 2 again per member checkout;
- the tier definitions disagree on when Tier 3 fires: `strategy-quality-gates.md` and `QUICK-REFERENCE.md` place it per
  phase or pre-PR while `process-task-loop` never fires it, so the phase template plus the mandatory verification task
  runs it twice.

The one exact-tree reuse that exists is narrow: delivery review-fix verification admits Tier 1 reuse under
`tier1ReuseCriteria` (`review-fix-verification.ts`), recorded with `provenance: "exact-tree-reuse"`
(`review-fix-continuation.ts`). The rule against re-running a green tier over an unchanged tree lives only in this
repository's `DEV-RULES.PROJECT` § Selecting what to run; `verify-work-unit`, `prepare-work-unit`,
`integrate-work-unit`, and `run-errand` say to rerun.

**2. A fixed block fires at a fixed cadence.** The per-task gate exists as fail-fast backpressure: catch a defect while
it is cheap, before later work builds on it. The intent is sound, but the mechanism assumes the worst: a blocking block
of mixed-cost checks after every increment. Industry practice has no milestone cadence. It runs fast, scoped checks at
commit, broader checks at push, and the full suite in CI, with editor diagnostics as the continuous layer. Agent
practice converges on "verify before declaring done" with targeted checks, a heavier check at the stop boundary, and CI
as the backstop. No source shows agents need a tighter cadence than humans, only a different feedback channel
(`research-local-check-cadence.md`). Measured at 2026-07-25, before `046272788` targeted it, this repository's
documented Tier 1 cost ~47s and ran three full-project scans on changes that often could not reach them (64 of 200
sampled commits were Markdown-only); targeting the same coverage brought it to ~1s.

The tiers also collapse two kinds of check into one bar. A per-task check is _feedback_ ("did I break what I just
wrote?"); a pre-merge check is _enforcement_ ("this may not merge broken"). With no distinct job, Tier 2 drifted to the
enforcement end and became Tier 3 minus `build`.

**3. Gate composition is prose the agent must rediscover.** The Tier 2 set is a fenced bash block in
`QUICK-REFERENCE.md`. No CLI reads either surface: `arc check` has only the `commit-msg` subcommand (`checkCmd` in
`cli.ts`, `handlers/check/commit-msg.ts`). Every ceremony that says "run the gates" spends agent attention working out
which commands those are, relevance rules ask the agent to compare `git diff --name-only` against a table, and nothing
reports what actually ran. Separately enumerated local and CI sets drift: local Tier 3 reported green while CI rejected
`lint:arc:section-refs`, which the local set omitted.

**4. Projects get no hook support for their own checks.** ARC's shipped pre-commit hook runs structural checks only (19
`CHECK[...]` blocks in `githooks/pre-commit`). Its pre-push hook only warns before a force-push (`githooks/pre-push`,
advisory, always exits 0). A project that wants its linters or tests at commit or push wires its own hook. This
repository chains `lint:md:staged`, `check-package-sync.sh`, and `check-ts-quality.sh` after ARC's hook in
`.husky/pre-commit`, and `check-ts-quality.sh` runs whole-program `typecheck` and `typecheck:test` on every staged
TypeScript change, a third run after the tiers already ran them.

This matters now. ARC is pre-1.0 and this surface is central. Agents commit at every review increment, so redundant
runs compound. CI already reuses a verified tree (`classify-change.sh` skips the heavy suite when its rebase-stable
code-tree hash matches a tree whose `HEAVY_CHECK_NAMES` all passed), while local runs have nothing equivalent.

## Goals

1. **One declaration.** A project declares each check once. ARC's hooks and workflow steps run checks from it, and a
   project's CI can derive its checks from it (D9), so nothing ARC ships keeps a second check list.
2. **Once per tree.** A check that passed over some content is not re-executed over the same content at a later fire
   site in the same worktree. Attestation runs are the exception and always execute.
3. **Run what the change reaches.** A request runs only the checks whose declared inputs its change touched, and falls
   back to every check when that cannot be decided.
4. **Event deadlines.** Gates are named by the repository event they must pass before (commit, push, merge) and never
   read interlock or approval configuration.
5. **Hook support for project checks.** ARC's shipped pre-commit and pre-push hooks run the project's declared checks
   for those events, under every supported hook-manager integration.
6. **Workflows name the verb.** No shipped workflow, method, strategy, brief, or rule names a tier or a command list.
   Each gate step is one `arc check` request whose output carries the remedy.
7. **Stack-agnostic.** Every element serves a project in any language, and ARC ships no stack defaults.
8. **Nothing lost on retirement.** Retiring the tier surfaces carries a project's existing gate commands into a
   proposed declaration, at initial setup and on update.

## Non-Goals

_Frozen at activation; changes after that append: `Amended YYYY-MM-DD — <delta> — <prompt>`_

- Knowledge-base content checks (cross-references, anchors, forbidden patterns). A project's content checker is a
  declared check like any other.
- Changing the shipped hook script format or the hook-manager integration's shape (ADR-014). The generated entries and
  configuration gain only what each event's dispatch needs (D8).
- Rewriting or consolidating the 19 structural `CHECK[...]` blocks.
- Tech-stack defaults or lint-tool opinions in shipped content.
- A shipped CI workflow or recipe. A project's CI consumes the dry-run list or the verb (D9); examples belong to the
  documentation site.
- The documentation site's gate prose and its demos (`docs/`). The site is brought current in one later pass, not with
  each change.
- A local hook for the merge quality gate; CI and review own it.
- Harness-specific edit-hook wiring. Any harness hook can call the verb.
- A warm-watcher feedback layer (`tsc --watch`, a test watcher kept running across a session). It is out of scope, not
  rejected: it carries its own lifecycle, staleness, and portability problems.
- Push cadence, interlock policy, or a ratchet over when steps fire. Those decide when a step fires; this design defines
  what a fire runs.
- New checks for this repository.
- Gate checks over ARC operational or planning state: no new Markdown gate over `.arc/` state, no hook check over
  planning artifacts, no pre-handoff hook, and no notes-consistency check.
- Any change to the machinery around the gate steps in `prepare-work-unit`, `integrate-work-unit`, and `deliver-stack`
  beyond the one-line request each step names (D6).
- A locally built "last known good" base anchor (§ Alternatives & Rationale).
- Renaming the stored `verificationKind: "tier-3"` value (D1).

## Proposed Design

### Constraints

Four constraints bound every decision below.

1. **Event-anchored, interlock-independent.** Gates are deadlines named by repository events, which happen however
   approval is configured. Gate semantics never read interlock state, no gate configuration names an interlock, and
   the verb is a leaf any caller may invoke: a workflow step, a hook, CI, or a future layer that decides _when_ steps
   fire. The shared names (`commit-`, `push-`) are the same Git events, not a coupling; the release wrapper is at most
   one caller. What an event enforces is never such a layer's to relax: a gate's deadline protects the integrity of a
   check (`DEV-RULES.ARC` § Rule Authority). Such a layer may relax only the feedback runs before the deadline, by
   choosing a lighter preset (D3).
2. **Industry idiom first.** Where practice is near-universal, follow it. Where it splits, make it configuration with a
   stated default. Diverge for agents only where the research names a real divergence.
3. **Project-agnostic.** Every element must serve a project in any language. This repository is the first consumer: it
   _configures_ the design to prove each configurable element and never _extends_ it. A need of this repository that the
   configuration cannot express is generalized only if another stack would plausibly need it; otherwise this repository
   wraps it in its own script.
4. **Typed structure, CLI-computed state.** Structure is typed configuration the CLI validates. The CLI computes
   selection and reuse. Workflow prose names the verb and never the commands, and failure output carries the remedy.
   No new command-reference document is added, always-loaded rules do not grow, and no prose evaluates state.

### D1 — Gate model and vocabulary

Tier 1/2/3 retires entirely as vocabulary. Four concepts replace it, two of them vocabulary.

- **Quality gate.** A deadline named by the event a check must pass before. There are three: the commit gate, the push
  gate, and the merge quality gate, declared as `commit`, `push`, and `merge`. Each name is the event, never an ARC
  lifecycle stage, so no gate reads as the twin of an interlock. "Quality" stays part of the term because bare "gate"
  already names ARC's approval gates, entry and exit gates, the review gate, and the host-side auto-merge gate
  (`setup-merge-gate.md`). Prose says "commit gate" or "push gate", and "merge quality gate" wherever the host's merge
  controls are also in view. Deadline names are self-correcting in a way an ordinal is not: a commit gate costing 47s
  is visibly wrong.
- **Kind.** `enforcement` (must pass by the deadline and blocks there) versus `feedback` (informative before it). Kind
  is derived, never declared. Every gate, hook, and preset request has a deadline gate: the named gate for a gate
  request or hook event, the commit gate for the `increment` preset, and the push gate for `segment` and `new-head`
  (D3). A request by id has none. A result is `enforcement` when the request's deadline gate includes the check and
  `feedback` otherwise, and the verb labels each result. Kind is what lets a test-first sequence carry an intentionally
  failing test across increments while the push gate still holds.
- **Cost.** Measured data the verb records with each run, never declared.
- **Selection.** A mechanical rule (D4), never vocabulary.

**Membership is cumulative.** Each check declares at most one `gate`: the earliest event it must pass before. Every
later gate includes it:

| Declared `gate` | Commit gate | Push gate | Merge quality gate |
| --------------- | ----------- | --------- | ------------------ |
| `commit`        | yes         | yes       | yes                |
| `push`          | no          | yes       | yes                |
| `merge`         | no          | no        | yes                |
| absent          | no          | no        | no                 |

A check with no `gate` is in no gate and runs only when requested by id, like pre-commit.com's `manual` stage.
Cumulative membership makes "must have passed before push" include everything that must have passed before commit, so
no declaration can put a check in an earlier gate while leaving it out of a later one.

**Zero tolerance holds per gate at its deadline:** every check in a gate passes before that event. This repository's
project rule ("all quality checks must pass before any commit") changes to that, and so does the shipped
`DEV-RULES.PROJECT` template's, which keeps its `[invariant]` marker, now per gate.

**Vocabulary entry.** Define **quality gate** once, in `AGENT-BRIEF.ARC.md`'s vocabulary, with kind as a clause of that
entry rather than a second term. It replaces the `Class` entry's "Distinct from the quality-gate `Tier 1/2/3`" and the
brief's **Quality gates** paragraph pointing to `quality-gate-commands`, so the always-loaded set barely grows. Word it
to agree with `DEV-RULES.ARC` § Rule Authority. An enforcement result protects the integrity of a check, so a red gate
is never the agent's to set aside. A feedback result binds nothing until its gate, but a red one is still reported red
and handled under `DEV-RULES.ARC` § Quality gate failure. A failure carried on purpose, such as a test-first test
written to fail, is named as such in the completion report, where the approval gate accepts it.

**Retiring the names.** The tier names leave shipped prose, the briefs and rules, emitted text, and code identifiers
(inventory in D10). Emitted text includes the convergence remedy "Run Tier 3, then replace the carried evidence
placeholder and attest." (`integration-boundary-locus.ts`). Older boundary records persist that text as
`interactionText` and keep it until regenerated, which the pre-release compatibility posture allows. Code identifiers
are renamed mechanically: type and schema names, variables, and delivery's stored fields (`tier1Required`,
`tier1ReuseCriteria`, `ReviewFixTier1VerificationSchema`, and `tier1` across `delivery-execution.ts` and seven
`lib/delivery/` files). Nothing writes or reads those stored fields while delivery execution is paused. Before renaming
them, implementation confirms that no delivery record exists in the Git directory's `arc/delivery`,
`arc/delivery-gates`, or `arc/delivery-resolutions` (none held a file at `6521bcb4c`); if one exists, it stops for
direction.

One stored value keeps its spelling: `verificationKind: "tier-3"` in the review gate's stored integration boundary
record (`RunConvergenceVerificationActionSchema` in `integration-boundary-locus.ts`), together with its echo in
`arc attest`'s output (`attest.ts`), so the concept keeps one spelling. Renaming it would change a live record's shape:
a record an older build wrote would stop parsing in any worktree that writes it before merging base. It is renamed when
that record's shape next changes for another reason.

### D2 — The check declaration

A project declares each check once, by id, in a dedicated YAML file the CLI validates. Two checks may share a command.
The shape follows the major hook tools (pre-commit.com's `stages`, `files`, and `pass_filenames`; lefthook's `glob` and
`run`; Turborepo's `inputs`).

**File.** `.arc/system/arc-checks.yml`, beside `arc-config.yml`. The project authors it, with no ARC defaults. ARC
renders `arc-config.yml` from its own template (`renderConfigOverrides` in `template/render.ts`), and a dedicated file
is the hook tools' idiom (lefthook's `lefthook.yml`, pre-commit.com's `.pre-commit-config.yaml`). No template installs
it, so it is not in the install manifest. `arc update` never writes it once it exists, and `arc health` lists it as a
project-added file (`?`, `health.ts`). Keys are snake_case, as in `arc-config.yml`. An illustrative declaration for a
JavaScript project:

```yaml
global_inputs:
  - package-lock.json
global_runtime_inputs:
  - [node, --version]
commit_fixes: restage
checks:
  format:
    command: [npx, prettier, --write]
    gate: commit
    mode: files
    inputs: ["**/*.js", "**/*.ts", "**/*.md"]
    fixes: true
  lint:
    command: [npx, eslint]
    gate: commit
    mode: files
    inputs: ["src/**/*.ts", "eslint.config.js"]
  test-related:
    command: [npx, vitest, related, --run]
    gate: push
    mode: files
    inputs: ["src/**", "test/**"]
    shards: { count: 4, argument: "--shard={index}/{count}" }
```

**Top-level fields.**

| Field                   | Type                   | Default   | Meaning                                           |
| ----------------------- | ---------------------- | --------- | ------------------------------------------------- |
| `checks`                | map of id to check     | required  | The declared checks, in declared order (D3).      |
| `global_inputs`         | list of globs          | none      | Paths whose change selects every widening check.  |
| `global_runtime_inputs` | list of argument lists | none      | Commands whose output joins every reuse key.      |
| `commit_fixes`          | `restage` or `fail`    | `restage` | The commit hook's handling of fixes (D7).         |
| `$schema`               | string                 | none      | An editor's schema reference; the CLI ignores it. |

**Per-check fields.**

| Field            | Type                    | Default         | Meaning                                         |
| ---------------- | ----------------------- | --------------- | ----------------------------------------------- |
| `command`        | argument list or string | required        | What runs.                                      |
| `shell`          | boolean                 | `false`         | Run a string `command` through a shell.         |
| `gate`           | `commit`/`push`/`merge` | none            | The earliest gate including the check (D1).     |
| `mode`           | `files` or `project`    | `project`       | Whether the check receives paths.               |
| `inputs`         | list of globs           | the whole tree  | Paths the result depends on.                    |
| `runtime_inputs` | list of argument lists  | none            | Commands whose output joins its reuse key.      |
| `widen`          | boolean                 | `true`          | Whether widening (D4) selects the check.        |
| `root`           | directory               | repository root | Working directory for the check and its paths.  |
| `fixes`          | boolean                 | `false`         | Whether the check may rewrite files (D7).       |
| `ci_only`        | boolean                 | `false`         | Only `--ci` gate and preset requests select it. |
| `shards`         | `count` and `argument`  | none            | How CI splits the check into jobs (D9).         |
| `cache`          | boolean                 | `true`          | Whether a pass may be recorded and reused (D5). |
| `reads_index`    | boolean                 | `false`         | Whether the check sees an index (D5).           |

Field semantics:

- **Ids** are the map keys. Each starts with a lowercase letter and continues with lowercase letters, digits, `-`, `_`,
  `.`, or `:`, so an id is never integer-like (which would reorder the map) and never contains the comma or whitespace
  that separate ids on the command line and in `ARC_SKIP` (D8). The YAML parser already rejects a duplicate key.
- **`command`** is an argument list run without a shell, as pre-commit.com and lint-staged do by default. Appended paths
  are never re-parsed by a shell, and the command behaves the same on Windows. A check that needs shell features sets
  `shell: true` and gives `command` as one string, which runs through the platform shell (`/bin/sh` on POSIX systems,
  `cmd.exe` on Windows). A shell check receives no paths, so `shell: true` requires `mode: project`; a `files` check
  that needs shell features calls a script.
- **`inputs`** are glob patterns relative to the repository root, which the verb evaluates as Git pathspecs with Git's
  `glob` magic: `*` matches within one path segment, and `**` crosses directories in Git's forms `**/`, `/**`, and
  `/**/`. A leading `!` excludes: the verb passes such a pattern with Git's pathspec `exclude` magic, since Git reads a
  bare `!` literally. The verb's own matching clears Git's pathspec variables (`GIT_LITERAL_PATHSPECS` and its
  siblings), so a caller's environment never changes what matches. The default is the whole tree, so an undeclared
  input can only cost a run, never yield a false reuse; narrowing is the project's opt-in.
- **`runtime_inputs`** name state no tracked file records, such as a tool version or an install (Nx's
  `{ "runtime": "node --version" }`). Each is an argument list run without a shell from the check's `root`, and its
  standard output joins the key. A runtime input that cannot start or exits non-zero leaves the key incomplete, so the
  check runs and its result is not recorded (D5). `global_runtime_inputs` run from the repository root.
- **`widen: false`** means only the check's own inputs select it, as lint-staged and pre-commit.com behave for every
  task and as Nx lets a target leave out its shared global inputs.
- **`mode`.** A `files` check receives the changed paths among its inputs. Under a request with no change (`--all`,
  which `gate merge` and `run` use by default), it receives every path among its inputs in the checked tree, as
  pre-commit.com's `--all-files` passes every file, with the merge base as its base (D4). When widening selects it (D4),
  it receives the same set over the request's own base. A `project` check runs whole-project. Either way, a check learns
  which paths changed only from the verb: the paths it receives, or being selected at all.
- **Base export.** A `files` check reads what a path held before the change only at the request's base, which the verb
  exports to it beside the checked tree: `ARC_CHECK_BASE` (a commit id) and `ARC_CHECK_TREE` (the checked tree's object
  id, or for a fix-capable check the tree at its turn, D7), as pre-commit.com exports `PRE_COMMIT_FROM_REF` and
  `PRE_COMMIT_TO_REF` to a run over a ref range. A `project` check has no change to read against and receives none of
  these, so its key carries no change (D5). Where the change is one merge's, either while it concludes or over a range
  from its first parent to the merge, the base is the first parent. The verb then also exports the merged-in parents,
  those after the first, as `ARC_CHECK_MERGED` (commit ids, space-separated), so a `files` check can tell what a merge
  brought in from what the change authored over it, as Git's `MERGE_HEAD` allows today. Any other range keeps its own
  base, and `ARC_CHECK_MERGED` lists the parents after the first of each merge on its first-parent line
  (`git rev-list --first-parent --merges`), the line on which a merge's own range is that merge alone. A push that
  carries a base merge after other commits therefore still shows what that merge brought in, and merges inside the
  merged-in history add nothing. pre-commit.com's push run marks its range by its two ends alone (`PRE_COMMIT_FROM_REF`
  and `PRE_COMMIT_TO_REF`). Content a merge brings in passed its own gates where it was committed (D4), whether from the
  base or from a side branch. A request with no change (`--all`, which `gate merge` and an unscoped `run` use) exports
  no merged-in parent, so a CI run over GitHub's merge of a pull request into the base never exempts the pull request's
  own content as brought in. Where no base resolves (D4), none is exported, and what a check that needs one does then is
  its own call. Which base each request exports is in D4's table.
- **`root`** is the working directory. `files` paths are passed relative to it, as lefthook's `root` does; this
  repository's root `lint:ts:file` does that translation by hand today.
- **`ci_only`** marks a check that needs CI's infrastructure or is too slow for local runs (pre-commit.ci's `ci: skip`
  is the mirror image). Gate and preset requests select it only when the request carries `--ci` (D3), which the CI job
  passes, so no provider convention is assumed, and a local request that passes `--ci` runs more, never less. Otherwise
  it is `not selected` with that reason, so a report names what it does not cover. A request for it by id runs it
  anywhere, and the dry run lists it either way.
- **`shards`** gives a count and the argument that selects one shard, with `{index}` (counting from 1) and `{count}`
  placeholders, as Jest, Vitest, and Playwright accept `--shard=1/4`. The argument must contain `{index}`. CI runs one
  job per shard (D9); the verb runs the check unsharded.
- **`cache: false`** is for a check whose result depends on something its inputs do not name: remote state, which no
  input can name (Turborepo's and Nx's `cache: false`), or source a check's narrowed inputs leave out because they also
  select it.
- **`reads_index: true`** is for a check that reads the Git index, such as a staged-files linter: the verb points
  `GIT_INDEX_FILE` at an index equal to the checked tree (D5). Every other check runs without `GIT_INDEX_FILE`, so Git
  gives it the repository's own index, which can differ from the checked tree. A check that reads the index without
  declaring the field can then pass on content the event does not carry and be reused, as a check that depends on an
  environment variable it does not name can (D5).

**Global inputs.** Global inputs, such as lockfiles and tool configuration, select every widening check (D4) and join
every check's reuse key (D5). The declaration file selects as a global input does, so adding or editing a check widens
selection. In keys it is not a global input: it enters each check's key as that check's resolved entry, and also as an
ordinary input wherever a check's own inputs match it, such as a check left on the whole-tree default. Reuse therefore
keeps free every unchanged check whose inputs do not match the file. By default the global inputs also stand in for tool
and installed-dependency versions, as Turborepo's and Nx's lockfile hashing does. The accepted residual is a run against
an install the lockfile no longer describes: after a base merge changes the lockfile and before a reinstall, a run is
recorded under the new lockfile's key and reused after it. A project closes that residual by declaring a global runtime
input that fingerprints the install (D11).

**Type and validation.** The declaration's type joins the production schema registry under the id `check-declaration`
(`createProductionSchemaRegistry()` in `production-schema-registry.ts`), so the CLI validates the file against one type.
The type describes the file as a standard YAML or JSON parser yields it: numbers, booleans, and lists stay typed, unlike
the strings `parseArcConfig` returns (`RawArcConfigSchema`). The CLI rejects unknown keys everywhere in the file, so the
type uses `z.strictObject` at the top level, in each check, and in `shards`, because an ordinary object projects as open
on the input side. It admits the top-level `$schema` string. Cross-field rules are refinements the CLI applies and no
schema document carries. Each of these is invalid: `shell: true` with `mode: files`; `shell: true` with an argument-list
`command`; a string `command` without `shell: true`; and a shard argument without `{index}`. The result runs one way: an
editor validating against a projection of this type never flags a file the CLI accepts, and flags unknown keys exactly
where the CLI does, but it may accept a file the CLI refuses on a refinement. A refusal names the field (D3's
`invalid`).

**Reading through the configuration layer.** ARC's configuration layer resolves only dotted keys today
(`resolve-override.ts`). This design adds the layer's general typed-file read: locate a structured file through the
layer, parse it with `js-yaml` (already a dependency, which also parses JSON), validate it against a registered type,
and return typed values. It is built general so `arc-config.yml`'s CLI reader can later move onto it; moving that reader
is not in scope. Today the layer locates the declaration at its tracked path; where another install profile keeps it is
the layer's concern (D12, invariant 4).

**Editor completion.** Editor completion and validation in the file, as Turborepo and lefthook offer, come from the
CLI's editor documents:

- a registered type opts in through `authored: "editor-document"` on its registry metadata (`KernelSchemaMeta` in
  `kernel/schema/registry.ts`); the registration is the only declaration, and the document projects the input side, so
  a defaulted field stays optional;
- `writeEditorDocuments` (`schema-command/editor-documents.ts`) writes one self-contained document per opted-in type,
  with `$defs` only, no external `$ref`, and `$id` `urn:arc:schema:<id>`, at
  `.arc/system/.internal/schemas/<id>.schema.json`, per checkout, excluded from Git and never tracked. `arc schema
  install` refreshes them, and the commands that provision a checkout, `arc init` and `arc update` among them, write
  them (`writeEditorDocumentsOrThrow`);
- `editorDocumentReference` composes a file's reference to that document: a YAML language-server modeline for a YAML
  file, a `$schema` value for a JSON one.

This work sets the marker on `check-declaration`'s registration, the first production type to carry it, so every
checkout ARC provisions holds the declaration type's document. `editorDocumentReference` is the reference's only
authority: the update and reconfigure bootstrap writes the declaration's reference through it, and the initial-setup
step's declaration opens with a reference line that a contract test holds equal to that function's result for the
declaration's path. This work covers the generated document for the declaration type end to end.

**Bootstrap.** ARC ships no stack defaults, so a declaration starts from what the project already has.

- **Initial setup.** The agent-run `02_define-project` step authors the declaration with the person, replacing its
  question "What are the quality gate commands at each tier?". The declaration opens with its editor reference
  (above), and the step validates the result with `arc check gate merge --dry-run`.
- **Update and reconfigure.** When the change plan built for `arc update` or `arc reconfigure` (`buildChangePlan`)
  removes a retired surface (`quality-gate-commands.md`, `post-task-quality.md`, or `post-unit-quality.md`), the command
  runs the bootstrap over these sources as they stood before it wrote anything. Update keeps a Configurable removal for
  review (`keptForReview` in `manifest/apply.ts`). Reconfigure by default keeps it on disk but untracked, and deletes it
  when the person chooses (`resolveRemovalsNonInteractive`, `applyRemovalDecisions`). Either way, only the command that
  retires a surface sees it:
    - the fenced `bash` and `sh` blocks under `QUICK-REFERENCE.md` § Quality Gate Commands' tier headings;
    - the `quality-gate-commands` method's override section, when its override is active;
    - the `post-task-quality` and `post-unit-quality` extensions' `.actions` sections, when populated.
- **Proposal (A1).** Each complete executable fenced shell block becomes one proposed check, with its full text
  retained as a `shell: true` command. Continuations, comments, indentation, and shell state remain in the same command;
  extraction adds no shell flags. Pure comments and template placeholders produce no check. Incomplete fences and blocks
  mixing executable content with template placeholders are reported for manual authoring, rather than split into
  fragments. Its `gate` is left unset, with a comment naming the gate its source maps to: Tier 1 or `post-task-quality`
  maps to `commit`, Tier 2 or `post-unit-quality` to `push`, and Tier 3 to `merge`. A comment also names the source.
  Identical complete commands found at several tiers are proposed once, mapped to the earliest gate.
- **Writes.** The bootstrap writes `.arc/system/arc-checks.yml` only when no declaration exists. Either way, it reports
  every extracted command with its source and every source it could not extract (an action written as prose), for a
  person to carry by hand.
- **No silent activation.** Every proposed check has no gate, so no hook dispatches it and no gate request selects it
  until a person assigns its gate.

Common-stack declaration examples (JS/TS, Rust, Go, Python) belong to the documentation site, not shipped content.

### D3 — One gate verb

Gate requests extend the existing `arc check`, which today carries only `commit-msg`. The verb resolves a request,
selects (D4), reuses (D5), runs what remains, and reports. Every caller uses it: workflow steps, ARC's hooks, any
harness edit hook, and a CI wired to the declaration (D9).

**Forms.**

| Form                                | Caller and meaning                                                 |
| ----------------------------------- | ------------------------------------------------------------------ |
| `arc check pre-commit`              | ARC's pre-commit hook: the commit event (D8).                      |
| `arc check pre-push <remote> <url>` | ARC's pre-push hook: the push event, reading Git's ref lines (D8). |
| `arc check gate <gate> [scope]`     | A named gate (`commit`, `push`, or `merge`) over a scope.          |
| `arc check run <id...> [scope]`     | Named checks by id over a scope.                                   |
| `arc check increment`               | The increment-boundary preset (D6).                                |
| `arc check segment`                 | The segment-verifier preset (D6).                                  |
| `arc check new-head --from <ref>`   | The preset after a base merge commits a new head (D6).             |

The hook forms are named for the Git hook that calls them, as `commit-msg` is. Every form takes `--dry-run`, `--json`,
`--force`, and `--serial`; every form but the hook forms takes `--ci`.

**Scopes** apply to `gate` and `run`, and are mutually exclusive:

- `--staged`: the index's change against `HEAD`, with the index as the checked tree, as at the commit hook;
- `--changed`: the change against `HEAD` of the worktree as `git add -A` would stage it;
- `--range [base]`: the change from `base` to the worktree as `git add -A` would stage it; with no value, `base` is the
  merge base with the base branch;
- `--all`: every check in the request over the worktree as `git add -A` would stage it, without selection;
- `--paths <paths...>`: the named repository-relative paths, taken as the change against `HEAD`.

With no scope, `gate merge` and `run` use `--all`, and `gate commit` and `gate push` use `--changed`. The base branch is
the configured `branch.base`, read through its remote-tracking ref when one exists (for the pushed remote at the push
hook, the base branch's own upstream elsewhere) and the local branch otherwise. A merge base with it resolves only
when exactly one exists.

**Presets** compose gates for a fire site, so the composition lives in the CLI rather than workflow prose:

- `increment`: the commit gate, plus the `files` checks declared `gate: push`, over `--changed`. Its deadline is the
  commit gate, so those `push` checks report as feedback.
- `segment`: the push gate over the range from the branch's upstream, or from its merge base with the base branch
  while unpublished, to the worktree as `git add -A` would stage it. It runs everything `increment` runs. Its deadline
  is the push gate.
- `new-head --from <ref>`: the push gate over the range from `<ref>` to the checked tree. Its deadline is the push gate.

A request takes no skip or relaxation argument; presets are what a future layer deciding when steps fire chooses
between. `--force` re-runs without reuse and still records passes, as Turborepo's `--force` does; attestation fire sites
always pass it (D6). `--ci` marks a request as CI's: it adds the CI-only checks to what the request selects (D2) and
applies no fixes (D7). The CLI never infers it from an environment variable. `run` runs the named checks regardless of
their gate, and a `project` check whether or not its inputs changed; the scope gives `files` checks their paths and
base, and a named `files` check that would receive no path is `not selected` (Execution).

**Dry run.** `--dry-run` reports what would run, what is reused, and why anything is unselected, with each check's last
measured cost, without running any check (Turborepo's `--dry`); it runs runtime inputs, since a key needs their output
(D5). It forecasts every key over the tree as it stands, as though no fixer rewrites a file, so a rewrite in the real
run can turn a forecast reuse into a run. An agent with a hard tool timeout sees a long gate coming and runs it in the
background. Its JSON form carries every check in the request's gates, with CI-only and fix-capable checks flagged, and
each check's resolved invocations: working directory, relative to the repository root, and argument batches, and for a
sharded check, per shard, those batches with the shard argument appended to each, which is one invocation for a
`project` check. It also carries the base, the checked tree, and, where the change carries merges, the merged-in parents
that the verb would export to `files` checks (D2), for CI (D9).

**Execution.**

- Fix-capable checks run first, as fixers or as checks (D7), one at a time in declared order, so a formatter finishes
  before a linter reads its files. The rest run in parallel, bounded by the machine's available parallelism, and
  `--serial` runs them one at a time (practice splits: pre-commit.com runs in order; lint-staged and Turborepo run in
  parallel).
- Every selected check runs and every failure is reported, pre-commit.com's default. The verb has no fail-fast mode, so
  one run gives an agent every failure.
- `files` checks receive only paths that exist in the checked tree. A deletion can select checks but is never passed as
  an argument, lint-staged's default filter. A `files` check left with no path to receive is `not selected` with that
  reason under every request, as pre-commit.com skips a hook with no files to check (`get_staged_files` drops deletions,
  and `_run_single_hook` reports "(no files to check)"); a deletion still selects `project` checks and can widen
  selection (D4). Paths are batched under the platform's argument-length limit, as pre-commit.com and lint-staged both
  do, and a check passes only when every batch passes.

**Outcomes.** ARC sees how a command ran, never why it failed, so the exit status is the whole contract with a check;
whether "ran zero cases" passes stays the command's own job. Per check:

- `passed`;
- `failed`: it started, then exited non-zero or was killed, or it rewrote a file where D7 makes a rewrite a failure.
  This is the project's check speaking, even when a hang or crash in the change caused it;
- `couldn't run`: it never started (missing, not executable, or a spawn error), so it is neither a pass nor the check's
  own failure;
- `reused` (D5);
- `not selected`, with the reason;
- `skipped`, on a person's request (D8).

Per request: `invalid` (the declaration fails its type or a refinement, naming the field), `refused` (an ARC-detected
condition: D8's, a `run` id the declaration does not declare, or an explicitly named ref, `--range <base>` or
`new-head --from`, that does not resolve), or `none declared` for the requested gate. A base the verb resolves itself
and cannot is never refused; selection widens instead (D4). A check passes only as `passed` or `reused`. A request exits
0 when every selected check passed, was reused, or was skipped by a person, or when nothing is declared; `skipped` and
`none declared` stay labelled in the report and in the precomposed verification line, which never calls them passed. It
exits 1 when a check failed, whatever its kind, and 2 when a check could not run, the request was invalid or refused,
or the command line itself is malformed: any parse error, such as an unknown option or gate, a missing or extra operand,
two scopes, or `--ci` on a hook form. That is ESLint's convention, where 2 means the run itself failed. There is no
timeout field: the dry run is how a long gate is foreseen.

**Output.** Terse and failures-first. A passing check is one line. A failing one shows a bounded tail of its output and
the path to its full log. Files a fix rewrote are listed, so an agent re-reads them before editing. A run that read
worktree content other than its checked tree says so (D5). Each result carries its kind and outcome, and a fix-capable
check's failure says whether it rewrote files. The CLI assigns no `DEV-RULES.ARC` § Quality gate failure class, since
whether a failure is mechanical and inside the approved change is not the CLI's to know; the agent classifies it. The
CLI precomposes the completion report's verification line from the outcomes. `--json` emits a versioned envelope
carrying `schemaVersion` and either `result` or `error`, as `arc check commit-msg` does
(`CheckCommitMessageResultEnvelope` in `commit-msg-output.ts`).

**Remedies.** An ARC refusal is recovery-complete (`DEV-RULES.PROJECT` § Engineering Standards). It reports the observed
condition, names a remedy that never discards work, and keeps the success path reachable on retry. A check's own failure
has no ARC-composable fix. Its remedy is the check's output plus the command that reruns it by id over the failed run's
scope and base, never with `--ci`. For a `fixes` check, that same rerun applies its fixes (D7). A `files` check that
widening selected is the exception, since a request by id never widens (D4), and over `--all`, where it would receive
every path, its base is the merge base and its checked tree the staged worktree. Its remedy is the failed request,
retried as it was made, `--ci` included, or for a hook the commit or push the hook guards. The retry re-derives the
widening and resolves the base and merged-in parents again, which are the failed run's unless a ref has since moved, so
the check again receives every path among its inputs over them, in the request's own checked tree, and applies fixes
where the failed run did. Unless the request was forced, reuse keeps its other recorded passes free (D5).

### D4 — Selection

Gate and preset requests select; a `run` request runs the checks it names (D3). A check is selected when its declared
inputs changed in the request's own change:

| Request                      | Change                                        | Base (D2)      | Checked tree (D5)   |
| ---------------------------- | --------------------------------------------- | -------------- | ------------------- |
| `pre-commit`, `--staged`     | the index against `HEAD` (D8 in a merge)      | `HEAD`         | the index           |
| `increment`, `--changed`     | the staged worktree against `HEAD`            | `HEAD`         | the staged worktree |
| `--paths`                    | the named paths                               | `HEAD`         | the staged worktree |
| `--range [base]`, `new-head` | from the base to the checked tree             | the base       | the staged worktree |
| `segment`                    | from the upstream (or merge base) to the tree | its start      | the staged worktree |
| `pre-push`                   | the pushed range (below)                      | its start      | the pushed tip      |
| `gate merge`, `--all`, `run` | none: every check in the request runs         | the merge base | the staged worktree |

A scoped `run` takes its scope's row; unscoped, it runs over `--all`. At the push hook, the pushed range runs from the
remote's old tip to the pushed tip. For a ref new to the remote, it runs from the pushed tip's merge base with the base
branch. "The staged worktree" is the worktree as `git add -A` would stage it: tracked changes plus untracked files Git's
exclude rules admit.

Merge quality gate requests run every check by default, a CI-only one only with `--ci`. They are the authority's run and
the attestation's, so they take no selection unless a caller passes a narrower scope; `verify-work-unit` never does.
Where a request has no change, a `files` check receives every path among its inputs in the checked tree (D2).

Selection widens to every check that has not opted out (`widen: false`) when:

- a global input changed;
- the declaration file changed (D2);
- a changed path matches no check's inputs;
- the base cannot be resolved (a shallow clone, a missing ref, more than one merge base, or no common ancestor).

Nx and Turborepo fall back to running everything the same way, so a `files` check that widening selects receives every
path among its inputs in the checked tree, as under a request with no change (D2).

Selection trusts that unchanged inputs were already checked: what was committed passed its gate, and what came from the
base passed the base branch's checks. That is the idiom's trust too, since lint-staged runs a task only when a staged
file matches its glob. It holds because local runs are a convenience layer and CI is the authority, which is why CI
does not select by default (D9).

The package-mirror case, a one-sided edit to a mirrored file pair, is expressed through inputs rather than special
machinery: a check whose correctness spans both copies declares both.

### D5 — Reuse

**Record.** The verb keeps a machine-local record of passes in each worktree's own Git directory, in an `arc-checks/`
directory: `.git/arc-checks/` for the main worktree and `.git/worktrees/<name>/arc-checks/` for a linked one, never
under `.git/arc/`. Turborepo and Nx likewise keep their caches inside the checkout. Worktrees do not share the record:
each has its own installed dependencies, which a lockfile digest cannot vouch for across checkouts. This repository's
`lint:md:staged` checks exactly that drift (`loadIndexedMarkdownDependencies` in `indexed-dependencies.ts`, against
`markdownRuntimeVersions()`). The same directory keeps each check's last measured cost and latest log; all of it is
disposable.

**Key.** Per check: its id; a digest of its resolved declaration entry; a digest of the global inputs' content and the
global runtime inputs' output; a digest of its own inputs' content in the checked tree, or for a fix-capable check in
the tree at its turn (D7); and its runtime inputs' output. A `files` check's key also takes its received argument
paths (D2), separately from historical content (A2). At the base and each exported merged-in parent, it includes every
path matching its own or global inputs, with mode and blob identity; absent received paths remain explicit. Own and
global patterns match independently, so exclusions in one cannot erase the other's inputs. Historical content outside
these declared sets does not affect the key; commit identity alone does not affect it. An unavailable historical read
disables reuse. Environment variables are not in the key; a check that depends on one names it as a runtime input.

**What is recorded.** Only passes. A failure, a check that could not run, a skipped check, and a check with
`cache: false` always run again. A hit replays the stored summary. A fault reading or writing the record degrades to a
run, never to a pass or a refusal. Entries are content-addressed and written once with an atomic create, so concurrent
sessions in one worktree never conflict.

**Never evidence.** The record is an execution shortcut. No attestation, Candidate, or merge check reads it, and the
Candidate's verification evidence stays a free string.

**Checked tree.** The checked tree is the content the event will carry:

- at the commit hook and in a `--staged` request, the index (`git write-tree`);
- at every other request, the worktree as `git add -A` would stage it: tracked changes plus untracked
  files Git's exclude rules admit;
- at the push hook, the checked-out branch's pushed tip (D8).

**Git environment.** Every check runs with Git's repository-local variables removed: `GIT_INDEX_FILE`, `GIT_DIR`,
`GIT_WORK_TREE`, and the rest of the set ARC already strips from its own Git calls (`GIT_REPOSITORY_LOCAL_ENVIRONMENT`
in `process-executor.ts`). Git exports them to hooks, and a check that runs Git in another repository, such as a test
suite building fixture repositories, would otherwise act on this repository's index. A check runs from its `root` inside
the repository, so Git finds the repository without them.

**Index view.** A check declaring `reads_index: true` (D2) sees a Git index equal to its checked tree, through
`GIT_INDEX_FILE`. At the commit hook, this is the index Git hands the hook, already equal to the checked tree, or at a
fix-capable check's turn to the tree at that turn (D7): the repository's own index, under its lock (`index.lock`) for
`git commit -a`, or a temporary one for a path-limited commit. Elsewhere it is a temporary index the verb builds from
the checked tree once fixers finish, or for a fix-capable check from the tree at its turn, only when a selected check
declares the field, kept in the record's directory and removed after the run; one stranded by a killed run is
disposable. Such a check, a staged-files linter for one, reads the index through that variable, as Git's own commands
do, and therefore reads what the event will carry. The index's content is what this guarantees, not its diff against
`HEAD`, which is empty wherever the checked tree is `HEAD` itself; a check learns its change from the verb and, for a
`files` check, the request's base (D2).

**Worktree divergence.** A pass is recorded only when the check could have read nothing else. A fixer's pass is
recorded under the content it produced, which, being idempotent, it would pass unchanged (D7). The worktree can differ
from the checked tree inside a check's inputs: unstaged edits or untracked files at the commit hook, or a worktree ahead
of the pushed tip at push. The check then still runs, in either mode, since a `files` check may read past its arguments
(an import graph, a type-aware program). It reads the worktree, the residual lint-staged accepts, but its result is
labelled with that difference and not recorded, so reuse never vouches for content a run did not see.

So a workflow step's run and the hook's run over the same content produce the same key, and the second is free. The
release wrapper already rejects a bad message before Git runs any hook. On the raw `git commit` path, where the content
gate runs before the message check, a message-only retry reuses the content result, because the key is the tree, not
the message.

### D6 — Fire sites

No per-task gate. The fail-fast intent is served at the points where it pays.

- **Increment boundary.** A review increment's completion in `process-task-loop`, an errand pass or approved review fix
  in `run-errand`, `self-review`'s approved fixes, and the other workflow-step runs mapped below request
  `arc check increment`. The commit gate's failures block the commit; the `files` checks declared `gate: push` (for
  example, related tests through `vitest related` or `jest --findRelatedTests`) are feedback in the completion report.
  A related-tests check there runs, at the increment and at push, the tests the import graph reaches from the change,
  and, receiving every path, the whole suite at the merge quality gate, which catches what the graph misses: the split
  local hooks and CI commonly make. A project whose changes often reach its tests through inputs no import graph shows,
  as when tests assert shipped documents, keeps a whole-suite check at the push gate instead, and requests the
  related-tests check by id at the increment boundary with no gate (D11). The preset's composition is the framework
  default, not a project knob. The request runs once the increment's tracked edits are final; while task lists are
  tracked files, that includes the task list's `[x]` and completion note, which ride the commit, so the checked tree is
  the committed tree. Fixes apply here, before review (D7).
- **Segment verifier.** A segment's closing verifier, the task carrying the segment-verifier role suffix, requests
  `arc check segment` in place of `increment`, at the same point and over the same checked tree, so the push hook after
  that increment's commit reuses it. The plan declares where broader verification pays off, replacing the "coherent
  unit" judgment Tier 2 rested on: a `slice` or `replication` segment closes on a verifier unless the plan has one
  segment, and a `layer` segment needs none but may carry one. A red result holds the segment open and goes through
  `DEV-RULES.ARC` § Quality gate failure: it is a gate failure, not evidence against the design, which only the
  verifier's scenario tests (a failed scenario still goes to `amend-design`). The workflow step keys on the task in
  hand, as `process-task-loop`'s verifier-scenario step already does, so no workflow prose evaluates a segment's mode,
  and the verb itself knows nothing of segments.
- **New head.** When a base merge commits a new head (`arc base merge`'s `merged / run-quality-gates` result, in
  `run-errand` and the correction paths), request `arc check new-head --from <pre-merge head>`: the state no earlier run
  saw.
- **Commit and push hooks.** They run their gates (D8). At the commit hook, every selected check is normally a reuse of
  the increment boundary's run. At the push hook, a check reuses only a run with its key: a `project` check that an
  earlier request ran over the pushed tip's content, or a `files` check whose run covered the pushed range, which
  `segment` provides. Other selected checks run over the pushed range.
- **Work-unit verification.** `verify-work-unit` runs `arc check gate merge --force`, so attested evidence never rests
  on a replayed result. Convergence verification before an attestation runs the scope its action names, also forced:
  `full` runs the merge quality gate, and `focused` runs the push gate over the branch's change from its merge base,
  which the verb resolves itself, so the CLI keeps choosing the scope and the action needs no new field.
- **CI.** CI runs the merge quality gate over the whole tree as the authority (D9).
- **Correction and delivery steps.** The gate steps in `prepare-work-unit`, `integrate-work-unit`, and `deliver-stack`
  each become one line naming the request below, with no change to the machinery around them.

With these fire sites, the verb carries the re-run rule this repository states in `DEV-RULES.PROJECT`: re-run after a
base merge (`new-head`, or for a merge concluded by hand, the commit hook's merge scope and then the push gate), after
a review fix (the increment boundary, the commit gate in a correction path, or delivery's review-fix verification), and
at the first composed-work attestation (forced).

**Translation.** The tiers named when a check ran and the gates name what it must pass before, so the mapping goes by
fire site, not one to one:

| Fire site today                                                   | Request                                      |
| ----------------------------------------------------------------- | -------------------------------------------- |
| Tier 1 after a task, an errand pass, or a `run-errand` review fix | `arc check increment`                        |
| Tier 3 over `self-review`'s approved fixes                        | `arc check increment`                        |
| `process-task-loop`'s item-2 triggers and pre-report checklist    | `arc check increment`                        |
| `integrate-external-content`'s Tier 1                             | `arc check increment`                        |
| `clean-work-unit`'s Markdown lint                                 | `arc check increment`                        |
| `integrate-work-unit`'s completion-content commit                 | `arc check increment`                        |
| Tier 2 at a coherent unit                                         | `arc check segment`, where a plan says so    |
| Tier 1 over a correction-path fix                                 | `arc check gate commit`                      |
| Tier 1 over an applied `arc wu reconcile` correction              | `arc check gate commit`                      |
| Tier 1 over the new head a base merge commits                     | `arc check new-head --from <pre-merge head>` |
| Convergence verification, `focused`                               | `arc check gate push --range --force`        |
| Convergence verification, `full` (`verificationKind: "tier-3"`)   | `arc check gate merge --force`               |
| Tier 1 on a delivery review fix's `verification.target`           | `arc check gate commit --all --force`        |
| Tier 2 per delivery member                                        | `arc check gate push --all`                  |
| `review-response`'s `ready-to-fix` verification                   | its caller's review-fix request above        |
| Tier 3 before the pull request (`verify-work-unit`)               | `arc check gate merge --force`               |
| CI                                                                | the merge quality gate (D9)                  |

A correction-path fix is one made in `prepare-work-unit` or `integrate-work-unit`. The two delivery rows come from
`deliver-stack` and run in the review fix target's or the member's own checkout. Delivery's own `tier1ReuseCriteria`
arm keeps deciding whether its review-fix verification runs at all, so the verb's record never becomes delivery's
evidence.

Push cadence stays neutral. Gates are deadlines, so a project that pushes once a session and one that pushes hourly get
the same guarantees, and the increment boundary's push subset, or a request by id beside it (D11), is what gives regular
test feedback between pushes.

### D7 — Fixes and restaging

**Where fixes apply.** Only where content is still being formed:

- the `increment` and `segment` presets;
- a `run` request, or any `--paths` request, without `--ci` (a harness edit hook running a formatter after each edit);
- the commit hook.

Fix-capable checks run there as fixers, with fixes applied to the worktree, so at the increment boundary reviewed
content is committed content and the hook usually finds nothing to fix. Every other request runs a fix-capable check as
a check: a `gate` request over any other scope, the push hook, `new-head`, the merge quality gate in `verify-work-unit`,
convergence verification, and every request carrying `--ci`. If it rewrites any file it is `failed`, as pre-commit.com
fails a hook that modified files, and the rewrite stays in the worktree for the next commit.

**At the commit hook.** Behavior is the declaration's `commit_fixes`, because practice splits: lint-staged and
lefthook's `stage_fixed` restage, while pre-commit.com and Overcommit fail.

- `restage` (default) stages each fixer's rewrites of the paths the commit carries into the index Git hands the hook
  right after it runs, before its record and the next fix-capable check's turn, so its pass keys on the content it
  produced and a later fixer looks up over the earlier fixers' output (Fixer assumptions), then computes the checked
  tree. Following lefthook's rule, the hook fails if the restage itself fails, so unfixed content never commits
  silently. Staging inside the hook commits nothing, so it never re-triggers the gate, and each fixer runs once. The
  partially-staged refusal (D8) guarantees that every staged path in a selected check's inputs matches the worktree, so
  a restage never pulls unstaged hunks into the commit. Under pre-commit.com or lefthook, which hide unstaged edits from
  that refusal, `restage` acts as `fail` (D8). It also acts as `fail` when the index Git hands the hook is a temporary
  one, as for a path-limited commit (`git commit <paths>`): Git has already written those paths' unfixed content to the
  repository's own index, whose lock it holds, so a fix restaged only into the temporary index would leave the
  repository's index behind the commit. A plain `git commit` hands the hook the repository's own index, and
  `git commit -a` that index's lock (`index.lock`); restaging holds in both.
- `fail` fails the hook when a fixer rewrote a file: that fixer is `failed` and records no pass, and the rewrite stays
  in the worktree for the person to stage.

**Fixer assumptions.** Fixers are assumed idempotent, as every hook tool assumes. Fix-capable checks run in declared
order (D3), and each keys on its inputs' content in the tree at its own turn: it looks up a pass over the tree as it
stands before it runs, after the fixers before it, and records a pass under the tree as it stands right after it runs,
the content it produced. A pass therefore never vouches for content its run did not see, even when a later fixer
rewrites one of its inputs. Once the rewrites are staged, the commit's tree before fixers is that content, so the commit
reuses each fixer's pass unless a later fixer rewrote one of its inputs. The checked tree, which keys every other check,
is computed after fixers finish. Selection and each `files` check's paths come from the change as it stood before
fixers ran, so a fixer's rewrite outside that change selects nothing more in the run; a later request carrying the
rewrite selects the checks it reaches.

### D8 — Hooks

**Dispatch.** ARC's shipped pre-commit hook runs its structural checks, then dispatches `arc check pre-commit`. The
shipped pre-push hook reads Git's ref lines from standard input once, runs its force-push advisory over them, then
passes the same lines to `arc check pre-push "$1" "$2"`. The advisory never blocks, and the verb's exit status is the
hook's. Both hooks stay on the existing `hooks.pre_commit` and `hooks.pre_push` keys: disabled, the hook does nothing;
enabled, it dispatches, and a gate with no declared checks reports `none declared` and exits 0.

**CLI resolution** follows `githooks/commit-msg`: the repository-local `node_modules/.bin/arc`, then a global `arc`.
The pre-push hook first excludes a known empty, state-only, or deletion-only event, including the equivalent
pre-commit.com environment. For any remaining event, when neither CLI resolves, the hook fails with the same installation
guidance `commit-msg` prints if `.arc/system/arc-checks.yml` exists, and exits 0 otherwise. The presence test is only this
fallback; when the CLI resolves, it locates the declaration through the configuration layer (D2). Under an install
profile that keeps the declaration elsewhere, an unresolvable CLI skips dispatch, a residual CI covers.

**Push scope.**

- Push dispatch gates code refs only and skips every ref under `refs/arc/*` (D12, invariant 2).
- Of the code refs, only the checked-out branch's (`refs/heads/<current branch>`) is checked, at its pushed tip (D5).
  A failure names that ref (D12, invariant 3).
- A ref deletion carries nothing to check, as the shipped `pre-push` already treats it.
- Any other pushed ref (a review projection, a delivery member published from one checkout, a branch pushed by name)
  has no worktree here to run in. Its checks are reported `not selected` with that reason rather than refused; its own
  checkout's gates and CI cover it.
- A push with no ref lines carries nothing, though Git runs `pre-push` even then, and checks nothing.

**Hook-manager integration** keeps its shape (ADR-014): husky, lefthook, pre-commit.com, or, with no hook manager, ARC's
own hooks directory through `core.hooksPath` (`configureGitIntegration` in `setup.ts`). Its generated entries and
configuration gain only what each event's dispatch needs (`integrateLefthook`, `integratePreCommit`, and the
`ARC_PRE_COMMIT_HOOK`, `ARC_COMMIT_MSG_HOOK`, and `ARC_PRE_PUSH_HOOK` entries in `hook-integration.ts`):

- lefthook's pre-push entry gains `use_stdin: true`, so the hook sees the pushed refs;
- pre-commit.com's `arc-pre-commit` entry gains `pass_filenames: false`, `require_serial: true`, and `always_run: true`.
  Today it passes the staged files (`files: "."`), so pre-commit.com splits them across parallel invocations of ARC's
  hook, and skips the hook on a commit that only deletes files, since its staged-file list leaves deletions out. With
  the three fields, ARC's hook runs once per commit, deletions included;
- pre-commit.com's `arc-pre-push` entry gains `always_run: true`, since its `files: "^$"` otherwise matches nothing;
- pre-commit.com's `arc-commit-msg` entry drops `files: "^$"`. The filter rejects the message file pre-commit.com would
  pass, so it skips the entry on every commit and ARC's commit-message check never runs there; without it, the entry
  receives `.git/COMMIT_EDITMSG`, as ARC's hook expects;
- the generated pre-commit.com configuration lists `commit-msg` and `pre-push` in `default_install_hook_types`, beside
  `pre-commit` and any type already listed, since `pre-commit install` installs only the listed hook types. Writing the
  list tells the person to re-run `pre-commit install`.

Only `arc init` and `arc join` write these entries today (`configureGitIntegration`), and both leave an existing entry
alone. So `arc update` upgrades an existing generated entry in place, in the same update that brings gate dispatch, as
`integrateLefthook` already upgrades its older commit-msg entry. It recognizes ARC's entries by their ids at the current
hook path. It rewrites a configuration only when an entry changes, through the same parse-and-dump round-trip init
uses, which drops the file's comments, so its summary names each file it rewrote. An entry it cannot upgrade, or a
configuration it cannot parse, it reports.

Under pre-commit.com:

- Its own pre-push hook reads Git's ref lines itself and passes on only the first it does not skip (a deletion, or a ref
  carrying nothing the remote lacks) as `PRE_COMMIT_LOCAL_BRANCH`, `PRE_COMMIT_FROM_REF`, and `PRE_COMMIT_TO_REF`, with
  the remote as `PRE_COMMIT_REMOTE_NAME` and `PRE_COMMIT_REMOTE_URL`; the hook's own arguments arrive empty.
  `arc check pre-push` reads ref lines from standard input when present and otherwise from those variables, and takes
  the remote from them when its arguments are empty. The pushed range then starts at `PRE_COMMIT_FROM_REF` as given.
  pre-commit.com omits `PRE_COMMIT_FROM_REF` and `PRE_COMMIT_TO_REF` when that ref's whole history is new to the remote;
  the verb then resolves that ref's tip itself and starts the range by D4's rule for a ref new to the remote.
- A push naming several refs shows the event only one, a residual of pre-commit.com's own: when that is not the
  checked-out branch, its push gate does not run locally; CI covers it.
- pre-commit.com sets unstaged changes aside in a patch (`staged_files_only`) before it runs a commit's hooks or a
  push's, except for a push whose whole history is new to the remote, which it runs over all files. ARC's hooks run
  inside that window, where the partially-staged refusal (below) sees no unstaged edits. There `commit_fixes: restage`
  acts as `fail`, detected by the `PRE_COMMIT` variable pre-commit.com sets for its hooks. A restaged fix would sit in
  the index pre-commit.com's rollback restores from (`git checkout -- .`), so a fix overlapping the set-aside changes
  would leave them only in its patch file. A fix left in the worktree is what that rollback discards on a conflict,
  restoring the set-aside changes, as pre-commit.com does for its own fixers.

Under lefthook, a pre-commit hook run with partially staged files sets those files' unstaged changes aside first,
keeping a "lefthook auto backup" stash on the shared stack, and restores them afterwards, unless lefthook runs with
`--no-stage-fixed` (`withHiddenUnstagedChanges` in lefthook's `guard.go`). ARC's hook runs inside that window too, where
the partially-staged refusal (below) sees no unstaged edits. When the set-aside changes no longer apply, lefthook fails
the hook, rebuilds the worktree from the index (`git checkout .`), and re-applies everything it set aside. A restaged
fix would sit in the index that rollback restores from, so, as under pre-commit.com, `commit_fixes: restage` acts as
`fail`. Before v2.1.16, lefthook can lose unrelated unstaged changes on that conflict whatever ARC does: its rollback
reverts every unstaged change but re-applies only the partially staged files' (`RevertAllUnstagedChanges`, then
`RestoreUnstagedChanges`, at v2.1.15), which lefthook `#1483` fixed. Before v2.2.1, its patch files sit under
`git rev-parse --git-path info` (`unstagedDiffPath` at v2.2.0), which linked worktrees share, so concurrent partially
staged commits in two of them can overwrite each other's; v2.2.1 gives each worktree its own (`buildPatchPath`,
`#1582`). Through v2.2.1, its restore (`restoreUnstagedChanges` in lefthook's `repo.go` at v2.2.1) applies the patch
files and then drops every "lefthook auto backup" stash, another worktree's included (`DropStash`; `dropUnstagedStash`
before v2.1.17), so that costs the other worktree only the backup it would recover from by hand. lefthook exports no
variable marking its hooks or that flag, so the verb detects lefthook from the hook manager ARC integrates into
(`detectHookManager` in `hook-manager.ts`) and treats every lefthook commit hook as inside that window. pre-commit.com's
window and lefthook's are each the hook manager's own, outside what ARC's hook controls.

Hooks remain bypassable by design. CI is the authority, and ARC's `--no-verify` prohibition stays agent discipline.

**Human skip.** A person may skip named checks for one run through `ARC_SKIP=<id>,<id>`, as pre-commit.com's `SKIP` and
lefthook's `LEFTHOOK_EXCLUDE` allow. It is namespaced so it never collides with pre-commit.com's own `SKIP` in a project
running both. A skipped check is reported as skipped, never as passed, and never recorded. An id the declaration does
not declare is reported and ignored, so a mistyped id skips nothing. ARC's structural checks are not declared checks and
cannot be skipped this way. It is narrower than `--no-verify`, which drops the structural checks too, so without it the
routine human bypass would be the wider one. Only the hook forms honor it; every other request runs every selected
check, so a variable a person's shell carries never reaches an attestation run through an agent. Agents never set it:
`DEV-RULES.ARC`'s `--no-verify` invariant extends to it (D10).

**Partially staged content.** Most tools read the worktree, not the index, so a commit hook over partially staged
content can certify bytes that will not be committed. pre-commit.com hides unstaged changes by writing them to a patch
file and checking out the index (`git checkout -- .`); lint-staged, and lefthook for partially staged files, also push a
backup onto the stash stack, which is shared across the worktrees ARC runs concurrently. Each rewrites the worktree
mid-hook and depends on process cleanup to restore it, and an agent harness that kills a hook at its tool timeout skips
that cleanup, stranding the hidden changes. Instead, the commit gate is `refused` only where those bytes would be
certified as the file itself: when a staged path inside a selected check's inputs also carries unstaged edits. That is a
partially staged file, the same scope as today's Markdown drift guard (`findStagedMarkdownWorktreeDrift` in
`worktree-index-drift.ts`). The remedy names the paths and never discards work: stage the whole file, or, for a person
splitting hunks on purpose, skip the named checks for that commit with `ARC_SKIP`, after which their inputs no longer
refuse. Other unstaged and untracked files never refuse, since committing one task's files while another's stay unstaged
is routine (`DEV-RULES.ARC` § Atomicity). D5's labelled, unrecorded run covers what they leave a check reading. Under
pre-commit.com and lefthook, which hide unstaged changes themselves, the refusal sees none (above).

**Merge conclusion.** While a merge is being concluded (`MERGE_HEAD` set, which the shipped `commit-msg` already
exempts), the commit gate's change is what the merge itself produced, as pre-commit.com scopes it then
(`get_conflicted_files`). That is the paths Git lists as conflicted in `MERGE_MSG`, plus every path whose staged content
matches no parent (the base or a merged-in parent the verb exports, D2), which takes in edits made while resolving.
Selection and widening then apply as at any commit.

**ARC's own merge conclusion.** ARC's ROADMAP-conflict remedy commit in `mergeAppendOnly` (`merge-composition.ts`), made
only when no other path stays in conflict, commits today with `git commit --no-edit`, so the pre-commit hook's
structural checks run on it. It changes to `--no-verify`, so it runs as ARC's clean merge does: Git runs
`pre-merge-commit` on a clean merge rather than `pre-commit`, ARC ships no `pre-merge-commit`, and ARC's `commit-msg`
already passes a merge, so neither the commit gate nor ARC's structural checks run on either path. The structural checks
the remedy commit drops are the ones a clean merge already never runs. The remedy commit writes only ROADMAP, derived
from the merged metas, and both paths return `merged / run-quality-gates`, so `new-head` verifies them alike, rather
than a red gate aborting the remedy as `regenerable-refused`. The flag is ARC's own merge mechanics, not an agent's
commit: `DEV-RULES.ARC`'s `--no-verify` invariant governs agents' commits and stands, and no signal an agent could set
is added. It lasts while ROADMAP is a stored file.

### D9 — CI parity by construction

A CI wired to the declaration runs it through the same verb, so a check cannot be local-only or CI-only by omission;
CI-only is a declared, labelled property (D2). ARC ships no CI workflow: a project wires its CI from the dry-run list or
the verb, and this repository's CI is the first consumer (D11). The local-green, CI-red class closes structurally rather
than through a parity test.

- **One CLI call.** A setup job runs `arc check gate merge --ci --dry-run --json`, whose output (D3) lists every check
  in the merge quality gate with its resolved invocations: working directory, relative to the repository root, and
  argument batches. CI checkouts are commonly shallow and carry no local base branch, so the setup job's checkout
  fetches the history and base branch through which the merge base resolves (D3); without them the list carries no base.
- **Native jobs.** Later jobs run those invocations natively, exporting to `files` checks the base, the checked tree,
  and any merged-in parents the list carries, and fail a fix-capable check that leaves the tree changed
  (`git diff --exit-code`), as the verb would (D7). A job may add its CI's own plumbing around an invocation:
  environment, steps before and after it, and reporting arguments appended to it, such as a reporter or a report file.
  The project's language therefore needs nothing else. Jobs may fan out as a matrix (GitHub Actions' `fromJSON`), with
  one job and one status per check, or per shard of a sharded check.
- **Verb jobs.** A job that runs the verb itself passes `--ci`, so its requests select the CI-only checks.
- **Every job, every run.** The list carries every check in the gate, not a selection, so every job exists on every run.
  A project that opts into base-relative selection lets each job skip itself on the selection, with a roll-up job behind
  the one required status, as this repository's `ci.yml` does with `classify-change.sh`: its `ci-ok` roll-up gathers
  every job, and `merge-ok`, the status `main` requires, mirrors it. A CI may also keep its own run conditions, such as
  which runs, lanes, or runners a job takes, as plumbing outside the declaration, on the jobs and steps that a map keyed
  by check id places each check on (D11).

CI may opt into base-relative selection only where the host's required checks vouch for the base.

### D10 — Knowledge placement and retirement

- **Quality gate** enters `AGENT-BRIEF.ARC.md`'s vocabulary as one entry, with kind as its clause (D1).
- **`quality-gate-commands` retires.** It is Configurable, so `arc update` keeps a project's copy for review, and the
  command that retires it runs the bootstrap (D2). No pointer method remains.
- **`QUICK-REFERENCE.md` § Quality Gate Commands** leaves the template. Verb help and emitted remedies replace it.
- **`strategy-quality-gates.md`** shrinks to what an operator needs that the verb cannot say. D1 and D6 replace its
  tier, escalation, and checkpoint-placement content. Its `STRATEGY-INDEX.md` entry is rewritten as a directive firing
  condition, and `DEV-RULES.ARC`'s line loading it "for quality gate tier definitions" goes.
- **`post-task-quality` and `post-unit-quality` retire.** Each exists to add a project's own checks after the Tier 1 or
  Tier 2 run (`process-task-loop`, and `run-errand` for the first). A check is now a declaration entry, which the verb
  selects, reuses, and runs from hooks, workflow steps, and a CI wired to the declaration alike, so a second place to
  add one would recreate defect 3's drift. The bootstrap carries a project's populated actions into its declaration
  (D2).
- **`DEV-RULES.ARC`.** Its `--no-verify` invariant extends to `ARC_SKIP` (D8), and its integration-candidate clause
  that a reconciled head "passes Tier 1" names the `new-head` preset.
- **`TECHNICAL-OVERVIEW.md`.** § 2 Customization Surfaces gains the check declaration as a fourth mechanism, its
  methods bullet drops "quality gate commands", and its extensions bullet drops the unit hook point. § 4 Quality Gates
  replaces "Tiered approach" with the gate model.
- **This repository's `DEV-RULES.PROJECT.md`.** § Quality Gates' tiered line and § Selecting what to run shrink to the
  zero-tolerance policy per gate, once the verb computes selection and reuse. The re-run rule moves into D6's fire
  sites, and the CI-only E2E rule into the declaration, the section keeping only the increment-boundary request by id of
  its local E2E check and `test:changed` (D11). Its `strategy-testing-methodology.md` § Integration with Quality Gates
  is rewritten to the gate model with it, and so is the root `CONTRIBUTING.md`'s rule that every check passes before any
  commit.
- **Hook prose.** The shipped hooks README (`githooks/README.md`) and `arc-config.yml`'s `hooks.pre_push`
  comment say the pre-push hook never blocks and that the key toggles only the force-push advisory. Both are rewritten
  for gate dispatch: the hook's exit status is the push gate's, and the key turns off both (D8). The README's pre-commit
  section, which lists what blocks a commit, gains the commit gate's declared checks and the missing-CLI failure, and
  its `hooks.pre_commit` row says a disabled hook dispatches no gate (D8).

**Site inventory.** Implementation re-runs this search before editing and treats a difference as new sites. At
`6521bcb4c`, the tier names appear in 24 shipped files under `packages/arc-framework/arc/`, by sense:

- **Gate sense (19), rewritten:** `QUICK-REFERENCE.template.md`, `AGENT-BRIEF.ARC.md`,
  `strategy-configurability-architecture.md` (its gate row only), `strategy-quality-gates.md`,
  `strategy-session-operations.md` (its gate passages only), `extensions/README.md`, `post-task-quality.md`,
  `post-unit-quality.md`, `quality-gate-commands.md`, `self-review.md`, `DEV-RULES.ARC.md`,
  `process-task-loop.template.md`, `deliver-stack.md`, `integrate-external-content.md`, `run-errand.md`,
  `integrate-work-unit.md`, `prepare-work-unit.md`, `verify-work-unit.md`, and the package's `DEV-RULES.PROJECT.md`.
- **Unrelated sense (5), kept:** `strategy-adr-methodology.md` (ADR amendments), `assess-parallel-fit.md`,
  `session-init.template.md` (launch tiers), `setup-release-wrapper.md`, and `arc-config.yml` (configurability tiers).

`strategy-configurability-architecture.md` and `strategy-session-operations.md` also use "tier" for configurability and
context-loading tiers, which stay. The sweep goes by sense, not by word, so it also reaches gate-sense prose without the
numbered names: `02_define-project.template.md`'s tier question (replaced by D2's bootstrap), the package
`DEV-RULES.PROJECT.md`'s zero-tolerance rule and `02_define-project.template.md`'s Step 5 question ("What quality checks
must pass before every commit?"), both restated per gate (D1),
`strategy-integration.md`'s "which quality-gate tier applies", `strategy-file-classification.md`'s "quality gate
commands" as an example of Configurable content, `DEV-RULES.ARC.md`'s opening line placing gate commands in
`DEV-RULES.PROJECT`, `amend-design.md`'s "names no tiers", `integrate-external-content.md`'s "additional quality
checks after each task" as an extension example, and `review-response.md`'s "run the affected quality gates" (D6).
Eight integration tests carry gate-sense wording from the workflows rewritten here, six as assertions and two in doc
comments, and change with them: `delivery-workflow`, `evidence-applicability-doctrine`, `prepublication-workflow`,
`review-gate-workflows`, `pr-open-extensions`, `delivery-rebuild-base-movement`, `integration-reconcile-workflow`, and
`delivery-window-base-movement`.

References to each retired surface, which are relocated rather than silently deleted:

- **`quality-gate-commands`:** `AGENT-BRIEF.ARC.md`, `STRATEGY-INDEX.md`, `strategy-session-operations.md`,
  `process-task-loop.template.md`, `integrate-work-unit.md`, `prepare-work-unit.md`, `verify-work-unit.md`;
  `init-recipe.json` and `CONFIGURABLE_FILES` in `classification.ts`; the `init.e2e`, `init`,
  `prepublication-workflow`, and `update` tests.
- **`strategy-quality-gates`:** `QUICK-REFERENCE.template.md`, `STRATEGY-INDEX.md`,
  `strategy-configurability-architecture.md`, `strategy-integration.md`, `DEV-RULES.ARC.md`, `DEV-RULES.PROJECT.md`,
  `generate-tasks.template.md`, `verify-work-unit.md`, `init-recipe.json`.
- **`post-task-quality`:** `strategy-configurability-architecture.md`, `strategy-session-operations.md`,
  `extensions/README.md`, `01_verify-and-configure.md`, `process-task-loop.template.md`,
  `integrate-external-content.md`, `run-errand.md`; `init-recipe.json` and `classification.ts`; the extension-point
  scanners and validators (`point-scanner.ts`, `frontmatter/extension.ts`, `validate-extension-points.ts`) and their
  doc comments; the `init.e2e`, `extensions`, `init` (integration and unit), `status`, `update`, `extensions-format`,
  `orphan-detector`, `point-scanner`, `frontmatter/extension`, `validate-extension-points`, `validate-frontmatter`, and
  `validate-package-neutrality` tests.
- **`post-unit-quality`:** `extensions/README.md`, `process-task-loop.template.md`; `init-recipe.json` and
  `classification.ts`; the `init.e2e`, `extensions`, `init`, `update`, and `point-scanner` tests.
- **"Quality Gate Commands":** `QUICK-REFERENCE.template.md`, `template-contributing.md`, `quality-gate-commands.md`,
  `DEV-RULES.PROJECT.md`, `clean-work-unit.md`.

`init-recipe.json` is checked in both directions: every retired file loses its disposition, and every surviving file
keeps one. This repository's `strategy-package-project-sync.md` lists the three retired Configurable files and states
the Configurable and installed-file counts that `framework-sync.test.ts` asserts from the recipe, so its list and counts
change with the retirement. Code identifiers and emitted text are in D1: `tier1Required` (11 sites),
`tier1ReuseCriteria` (4), `ReviewFixTier1VerificationSchema` (2), and `tier1`, across `delivery-execution.ts` and
`lib/delivery/`'s `eligibility.ts`, `entry-inspection.ts`, `landing.ts`, `review-fix-continuation.ts`,
`review-fix-verification.ts`, `review-fix.ts`, and `suffix-rematerialization.ts`; the emitted "Tier 1 checks" in
`entry-inspection.ts`; the comment in `eligibility.ts`; and the convergence remedy in `integration-boundary-locus.ts`.

### D11 — This repository as first consumer

The final work moves this repository's existing checks into `.arc/system/arc-checks.yml`, proving each configurable
element:

- The `.husky/pre-commit` chain becomes declared checks dispatched by ARC's hook, each trading its own
  `git diff --cached` selection for declared inputs:
    - `lint:md:staged` becomes a `project` check declaring `reads_index: true`, certifying the index, whose inputs cover
      what triggers it today: non-excluded Markdown, the Markdown configuration, its checker's runtime files and
      dependencies (`isMarkdownGateTriggerPath` and `MARKDOWN_GATE_INPUT_PATHS` in `staged-gate.ts`), and the import
      closure of those runtime files, which the script adds to its trigger (`resolveIndexedMarkdownCheckerPaths`). A
      glob cannot follow imports, so the closure is declared as the package's sources (`packages/arc-framework/src/**`);
    - `check-package-sync.sh` becomes a `files` check declaring `reads_index: true`, since it reads each path's content
      from the index (`git show ":<path>"`). Its blind-copy test reads each path's prior content at the exported base,
      counts no override that a merged-in parent's two copies no longer differ on, and, as its `MERGE_HEAD` exemption
      does today, passes content equal to a merged-in parent's, which a merge brought in, whether its change is one
      merge or a range that carries one (D2). An identical edit of both copies after a base merge dropped their override
      therefore passes, as it passes at its own commit. Where a merged-in parent's two copies no longer differ, a range
      run cannot see whether the merge itself kept the override, since D2 exports no merge's own copies, so it also
      passes a blind copy made after a merge that kept it, which the commit gate fails at that copy's own commit. Where
      no base is exported (D2), it fails, naming the missing base, since a pass would claim a blind-copy test it never
      ran; in CI, the setup job, whose dry run resolves that base (D9), and the job running this check each fetch the
      history it needs, as checkouts there are shallow by default;
    - `check-ts-quality.sh` retires into its parts: `lint:ts:file` as a `files` check with `root`, and `typecheck` and
      `typecheck:test` as `project` checks over the TypeScript inputs.
- `lint:md` declares `reads_index: true` too, for its drift guard (`findStagedMarkdownWorktreeDrift` in
  `worktree-index-drift.ts`), which then compares the checked tree, not the repository's own index, with the worktree.
  It and `lint:md:staged` read the index only through ARC's Git executors, which drop an inherited `GIT_INDEX_FILE` from
  any call given a working directory (`environmentForGitCwd` in `process-executor.ts`). Both pass the inherited value as
  the executor's `indexFile` option instead, which the raw object reader behind `readGitBlobEntry`
  (`createExecaRawGitExec`) gains, so each reads the index the verb points it at.
- The QUICK-REFERENCE gate blocks and the `DEV-RULES.PROJECT` relevance table become inputs and gate assignments.
- The package-mirror coupling becomes declared inputs (D4).
- `format:tables` and the Markdown drift guard exercise D7, including a new, untracked artifact. `format:tables` today
  refuses untracked paths (`validateExplicitMarkdownPaths` in `selection.ts`), after which the index-to-worktree drift
  guard in `worktree-index-drift.ts` fails. It admits the untracked paths Git's exclude rules allow, through the
  worktree view `selection.ts` already offers (`enumerateTrackedMarkdownPaths`' `worktree` source), so a new artifact
  formats at the increment boundary like any other.
- `lint:ts:file`'s repository-to-package path translation becomes the check's `root`.
- `lint:sh` runs a system-installed `shellcheck` with no version file (`run-shellcheck.sh` resolves it from the system
  `PATH`), so its version becomes a runtime input.
- `lint:md:staged` checks the installed Markdown dependencies against the lockfile, state outside its files, so the
  repository declares a global runtime input that fingerprints its npm install (`node_modules/.package-lock.json`,
  npm's record of what is installed). No reuse outlives a reinstall, and none skips that check after a lockfile change.
- Tests read and assert the ARC Markdown this repository ships and runs (`packages/arc-framework/arc/**`,
  `.arc/system/**`, and `.arc/reference/**`), so the relevance table's Markdown-only row does not carry over to them.
  The unit and integration test checks sit at the push gate with the default whole-tree inputs less the planning state
  no test reads from the repository (`.arc/active/**`, `.arc/backlog/**`, and `.arc/completed/**`); the one test that
  decomposes an archived work unit reads a checked-in copy of it among its fixtures. A change to the shipped Markdown
  therefore selects them, and a test that comes to read another location is covered without a declaration edit.
  `test:arc-contracts`, a commit-gate check, declares that same Markdown among its inputs, so a change there runs its
  suites at each increment boundary.
- `test:changed` selects its own change through `vitest --changed=main` (`local-vitest-runner.ts`); as a `files` check
  it receives the verb's changed paths instead. Its inputs are the TypeScript it finds tests for by import, since a
  Markdown path reaches no test that way and an empty selection fails it. It declares no `gate`: the unit test checks
  enforce at push, and a push-gate `files` check joins the merge gate, where it would receive every path and rerun the
  whole unit suite beside them. It is requested by id at each increment boundary with the local E2E check (below), so
  its result is feedback and a test-first sequence's failing test never blocks a commit (D1).
- E2E and portability are declared CI-only, as the project rule ("E2E is enforced by the heavy CI lane before merge")
  has them. Unit, integration, and E2E tests are sharded as the prerequisite CI layout shards them, each with a count
  and the one argument `--shard={index}/{count}`. Each shard job's CI plumbing stays outside the declaration (D9): the
  duration-file environment, the artifact steps, the integration and E2E jobs' build preflight and `ARC_E2E_SKIP_BUILD`,
  and the unit shard jobs' appended reporter and report-file arguments, which their report upload requires. The rule's
  local half ("run it locally only when E2E files changed or when explicitly requested") becomes a second check: a
  `files` check with no `gate`, so no gate, preset, or attestation runs it (D1), whose inputs are the whole E2E test
  tree, support files included. Its command is a repository script that runs the whole suite whatever paths it receives
  (Constraint 3). `DEV-RULES.PROJECT.md` keeps the rule's local half as one request (D10): at each increment boundary,
  beside `arc check increment`, whose composition it leaves unchanged (D6), the check is requested by id over
  `--changed`, in the same request as `test:changed`. It then runs the suite when the increment adds or modifies an E2E
  file and is `not selected` otherwise (D3); a change that only deletes E2E files is left to CI. Its result is feedback,
  since a request by id has no deadline (D1), and CI enforces E2E. Requested with no scope (`--all`), it runs the suite
  whenever someone asks. It declares `cache: false`, since the inputs that select it leave out the source the suite
  tests.
- CI invokes the verb (D9), over the CI layout on the base branch (§ Prerequisites). The documentation workflow
  (`docs.yml`) builds and deploys the site after a merge to the base and gates nothing, so it stays outside the
  declaration.
- This repository's CI keeps its run conditions as CI plumbing outside the declaration (D9): `classify-change.sh`'s
  light and heavy weight, under which `test:arc-contracts` runs on light runs only and the code checks on heavy runs
  only; the condition running integration, E2E, and portability on reviewed-lane pull requests only; the scheduled and
  dispatched runs and the jobs each takes; the duplicate-push skip; and the cross-platform portability pair's Windows
  and macOS runners. The setup job runs on every run the duplicate-push skip leaves, light runs included, since every
  job's list comes from its dry run, and uploads the list as an artifact that every job running a check downloads, since
  a job output is capped at 1 MB. The workflow keeps its jobs and steps as literal declarations, as today: each job's
  runner, dependencies, and shard matrix, and each step's run condition, environment, and appended arguments, stay in
  the workflow's own expressions, and each job running a check also depends on the setup job, whose artifact it reads.
  The `build` check runs in a job of its own, under the condition the setup job carries today (heavy, dispatched, and
  scheduled runs); that job uploads the check's output, and the jobs that read it depend on that job. Which step runs a
  check is keyed by check id in one map: per id, the steps that run it, each named by its job and step id. What differs
  by check, among those conditions and in each job's plumbing (the shard jobs' above, or `typecheck:test`'s heap
  headroom through `NODE_OPTIONS`), sits on the step the map names for it. `test:portability` therefore maps to the
  Linux portability job's step and to the cross-platform pair's, and `test:portability:macos` to the pair's macOS-only
  step. A mapped step runs, through one repository script, the entries of the dry-run list that the map assigns to it,
  one shard's where its job has a shard matrix, resolving each working directory against its own checkout, since the
  list comes from the setup job's runner. A check the map does not name runs at a default step in the job that runs on
  every push and pull-request run the duplicate-push skip leaves, light and heavy alike, so a new check is never skipped
  by omission and needs no workflow edit, and a removed check leaves CI with the list. The setup job fails when the map
  names an id its dry run does not list or a step the workflow does not declare, or when a sharded check's job has a
  shard matrix other than its declared count, and a contract test runs the same checks so that a stale map also fails
  locally.
- `classify-change.sh`'s `HEAVY_CHECK_NAMES` names every job a heavy pull-request run in the reviewed lane runs, one per
  job or shard leg, and the setup job, whose pass a lookback match needs. Its names are the workflow's job names, which
  no declaration change touches, and it stays a list kept in the script, since its classify job runs before setup and
  without the CLI. The contract test that holds it equal to the workflow's heavy-conditioned jobs and their matrix legs
  (`workflowHeavyCheckNames` in `classify-change.test.ts`) keeps holding it, counting the setup job, which now runs on
  every run. The declaration joins this repository's code surface and code-tree identity (`CODE_SURFACE_GLOBS` in
  `change-facts.ts`; `GENUINE_DOCS_GLOBS` classifies it as documentation today), so editing it runs the heavy jobs. A
  lookback match needs a heavy run that passed on the same code tree, setup included, so the verified-tree lookback
  reads only a list that was checked and can neither skip a new job nor wait on a removed one.

This repository's declaration keeps `commit_fixes: restage`, no check declares `shell: true`, and no check opts out of
widening, so `commit_fixes: fail`, `shell: true`, and `widen: false` are proven by tests alone.

### D12 — Invariants toward state storage

ARC's planned state storage moves operational and planning state out of tracked branch files into same-repository
`refs/arc/*` refs, with a gitignored projection at the familiar `.arc/` paths as the working copy. This design holds no
state family: it touches tracked code and project machinery, a machine-local cache, hooks, and configuration. It builds
on today's substrate and carries through that move without rework, provided these invariants hold.

1. **Gates check repository content only.** A gate's subject is tracked content plus untracked files Git's exclude rules
   admit. Operational and planning state are validated by their own record kinds when written, never by a gate, and no
   check reads ARC state through Git. Selection and reuse keys follow Git's exclude rules, so the projection, excluded
   per clone, never enters them.
2. **The push gate dispatches code refs only.** State refs may ride a code push in one `--atomic` push or push alone.
   The pre-push hook sees both kinds: gate dispatch skips `refs/arc/*`, a push carrying only state refs runs no gate,
   and the force-push advisory skips state refs too, since state history follows its own policy.
3. **A failed push gate is attributable to its code ref.** The hook's failure output names the code ref it gated, so a
   caller pushing state refs alongside code can tell a code-ref failure apart and push the state refs alone.
4. **The declaration resolves through ARC's configuration layer**, never by a fixed tracked path in the CLI, and its
   digest is of resolved content. The hook's presence fallback (D8) is the one fixed-path read. Under a per-machine
   install profile, one copy of the declaration serves every branch; no per-branch override is built until a
   long-lived branch with different tooling needs one.
5. **The reuse record is a disposable cache.** It has its own directory in each worktree's Git directory, never under
   `.git/arc/`. It is keyed by content, never by commit, so it survives history rewrite, and it is never stored,
   synced, or projected.
6. **Output honors the surface boundary.** What the verb prints where people read without ARC, such as CI logs and
   check or status text, names the project's checks and results, with no ARC vocabulary.
7. **Fire sites name the verb, not commit mechanics.** A planning flow that takes no commits fires no gate. While task
   lists are tracked files, their completion edits ride the commit, so the increment boundary runs after them; once task
   close runs after the increment's commit, the increment boundary still runs before that commit.

### Prerequisites

- **Editor-document publication** (D2), on the base branch: the registry marker, the generated documents
  (`writeEditorDocuments`, refreshed by `arc schema install`), and the shared reference function
  (`editorDocumentReference`).
- **CI layout**, made separately from this work and on the base branch at `e9ce523a3`: unit tests in 2 balanced shards
  and integration and E2E tests in 4 each, every shard job selected by one `--shard=<index>/<count>` argument; a
  test-duration file and artifact steps around each shard job, a build preflight before each integration and E2E shard,
  and reporter and report-file arguments on the unit shard jobs; and `classify-change.sh`'s `HEAVY_CHECK_NAMES` naming
  every shard job. D11's CI bullets are grounded in that layout; if it changes before this work's CI edits (D9, D11)
  start, they are re-grounded against it first.
- **No live delivery record** (D1): confirmed before renaming delivery's stored fields.
- The configuration layer's typed-file read is this work's own scope (D2), not a prerequisite.

## Alternatives & Rationale

**Tier vocabulary.**

- _Gate-only deadline names_ lose the feedback and enforcement distinction.
- _Cost class as the second axis_ codifies the axis that empirically collapsed: Tier 3 exceeds Tier 2 by `build`
  alone, about 5%.
- _Status-quo cleanup_ keeps the ordinal that let Tier 1 run full-project scans undetected.
- Chosen: gate × kind, with cost as measured data and selection as a rule (D1).

**Gate membership.** An explicit list per check (pre-commit.com's `stages:`) lets a check sit in the commit gate but
not the push gate, a state with no meaning, since a push carries commits that had to pass it. Cumulative membership from
one earliest `gate` removes those combinations and the repetition (D1).

**Where gate composition lives.**

- _Stage metadata in the `quality-gate-commands` method, read by hooks,_ puts structure in Markdown for shell to parse.
- _One method per stage_ adds files with the same prose-as-structure defect.
- _Consuming the project's hook-manager configuration_ (`.pre-commit-config.yaml`, `lefthook.yml`) ties ARC to one
  manager's schema and still leaves workflow steps and CI without a resolver. A declared check's command may invoke a
  hook manager or task runner instead.
- _Keys in `arc-config.yml`_ would put project-authored structure into a file ARC renders from its own template and
  reads as strings.
- Chosen: a typed, project-authored declaration file resolved by the verb (D2, D3).

**`quality-gate-commands` as a pointer.** A pointer method to the declaration would be a passthrough with nothing to
override, the same indirection defect 3 names. It retires, and the bootstrap carries its override (D10, D2).

**Bootstrap gate assignment.** Writing proposed checks with their tier-mapped gate set would activate hook dispatch on
update, running commands a person never reviewed as declarations. Proposals stay gate-unset, with the mapping as a
comment (D2).

**Where reuse comes from.**

- _Adopting a task runner (Nx, Turborepo, Bazel)_ is stack-specific. A project with one declares checks that call it,
  and its own cache composes underneath.
- _No reuse, selection alone,_ cannot dedupe two fire sites over the same tree.
- Chosen: a tree-keyed pass record in the verb (D5), following `git test` and git-branchless.

**Per-task cadence.**

- _A blocking per-task block_ is overcorrected, with no evidence it is needed.
- _Feedback only at edit time through harness hooks_ is harness-specific and leaves no increment-boundary check.
- Chosen: an increment-boundary run of the upcoming gate plus the push subset (D6).

**Pre-push enablement.** A smart default (on when push gate checks are declared), always opt-in, or always on. Chosen:
the smart default under the existing `hooks.pre_push` key (D8).

**Hook-time restage.** Configurable, default `restage` (D7), because practice splits evenly and lefthook's rule closes
the silent-commit risk.

**Partially staged content.** Hiding unstaged changes, as pre-commit.com, lint-staged, and lefthook do, rewrites the
worktree mid-hook and strands changes when a harness kills the hook. Refusing only the partially staged files in a
selected check's inputs certifies no wrong bytes and rewrites nothing (D8).

**Human per-check skip.** None, leaving `--no-verify` as the only bypass, or a namespaced skip variable. Chosen: the
variable (D8). pre-commit.com and lefthook both offer one, and its absence widens the bypass people use.

**Hook fallback when the CLI is unresolvable.** Always failing would break commits in a project that never declared a
check, and always skipping would silently drop declared gates. Failing only when the declaration file exists (D8)
follows `commit-msg`'s fail-when-enabled rule.

**Last-known-good base.** Locally, the merge base may itself be unverified. CI learns verified trees from the host's
checks API (`classify-change.sh`), which a stack-agnostic verb cannot assume. No stronger anchor is built locally:
selection relative to each event's own change (D4) matches the idiom, the reuse record covers repeat runs, and CI
remains the authority. CI runs the merge quality gate over the whole tree by default (D9).

## Cross-cutting Considerations

- **Compatibility and user impact.** A project with no declaration sees no behavior change beyond a CLI start in the
  pre-commit and pre-push hooks (the commit-msg hook already pays one per commit). A project with gate commands in the
  retired surfaces gets a gate-unset proposal on update and assigns gates when ready. Existing generated hook-manager
  entries are upgraded by `arc update`. Under the pre-release compatibility posture, no migration reader stays behind:
  the bootstrap carries content, older boundary records keep their persisted remedy text until regenerated, and
  delivery's stored field renames apply only once no record exists.
- **Performance.** A repeat run over the same content costs a key computation per check. A first run costs what the
  checks cost, and parallel execution bounds wall time. The dry run lets a caller foresee a long gate. Hashing inputs
  goes through Git's object database, which already holds tracked content.
- **Safety.** The verb never stashes, never checks out over the worktree, and never rewrites it except through a
  fix-capable check's own edits, which land in the worktree wherever it runs (D7). A killed run leaves at most a
  disposable temporary index in the record's directory. Faults in the record degrade to a run.
- **Trust boundaries.** Declared commands run with the invoking user's privileges, as any hook tool's do. The
  declaration is tracked content reviewed like code, so a change that edits it to run a different command in CI is the
  same trust surface as editing a package script. `ARC_SKIP` reaches only the hook forms, and `--ci` is never inferred
  from the environment, so neither an inherited variable nor a CI provider convention can narrow an attestation run.
- **Portability.** Argument-list commands run without a shell on every platform; `shell: true` uses the platform
  shell. Paths are passed as Git reports them, relative to `root`. Batching follows the platform's argument-length
  limit. Hook scripts stay POSIX shell, as today.
- **Verification.** Unit tests cover selection, widening, keys, outcomes, exit codes, the refinements, the checks' Git
  environment, and bootstrap extraction. Integration tests cover the hook forms under husky, lefthook, pre-commit.com,
  and no hook manager, including stdin and pre-commit.com variable forwarding, one dispatch per commit under
  pre-commit.com, a check that runs Git in another repository from the commit hook, restage and fail, `restage` acting
  as `fail` under pre-commit.com and lefthook (a provisioned v2.2.1 or later) with set-aside changes restored and for a
  path-limited commit, the partially-staged refusal, and merge conclusion. Every ARC refusal has a test of the refusal
  and of the successful retry after its remedy. E2E tests cover `arc update`'s bootstrap and hook-entry upgrade over an
  install carrying the retired surfaces, and the editor document for the declaration type. A contract test holds the
  initial-setup step's editor reference equal to the shared function's result.
- **Rollout.** Mechanics (declaration, verb, hooks) land before the fire-site and knowledge rewrite, which lands before
  first-consumer adoption and CI. CI changes wait on their prerequisite.
- **Boundary and landing.** `assess-boundary-fit` selects _stays one WU_. The four surfaces (declaration, verb,
  selection, and reuse; hook dispatch; fire-site and knowledge consolidation; first-consumer adoption) are one design,
  and each depends on the first. They are review chunks within one singleton landing, not deliverables: the work lands
  single-branch with chunked review and carries no delivery plan while delivery execution is paused, optionally
  projecting its chunks as stacked draft pull requests for review. The fire-site rewrite is what makes the vocabulary
  rename nearly free, so splitting hooks from vocabulary would edit the same lines twice.
- **Weight.** `Heavy`: high derivation, composed from existing patterns rather than invented. Estimated 13–20 days:
  declaration, type, and the configuration layer's typed read 2–3; the verb 5–7; hook dispatch and hook-manager paths
  1–2; fire sites, presets, and the vocabulary sweep 2–3; knowledge placement and the recipe check about 1; the
  bootstrap 1–2; first-consumer adoption and CI 1–2.

## Success Criteria

- **SC1 — Reuse.** A commit made right after `arc check increment`, with nothing else changed, executes no check: the
  hook reports every selected check `reused`, except a fixer whose inputs a later fixer rewrote (D7). A forced request
  executes every selected check.
- **SC2 — Selection.** A change outside a check's inputs does not select it, and the report names each unselected check
  with its reason. In this repository (D11), a change only to planning-state Markdown runs no code check, and a change
  to Markdown its tests read selects the unit and integration test checks. A global input change, a declaration change,
  a changed path no check's inputs match, and an unresolvable base each select every check with `widen: true`, a
  `files` check among them receiving every path among its inputs and, when it fails, naming the failed request's retry
  as its remedy; a `widen: false` check is selected only by its own inputs. Without widening, a `files` check whose
  only changed inputs are deletions is `not selected`.
- **SC3 — One definition.** No check list exists outside the declaration: the `.husky/pre-commit` chain, the
  QUICK-REFERENCE gate blocks, and CI's check list are gone or derived, and `classify-change.sh`'s heavy-job names list
  the workflow's jobs, not its checks. CI plumbing names check ids only to place each check on the steps that run it
  (D11). Removing a check from the declaration removes it from hooks, workflow steps, and CI; while the map still names
  it, the setup job fails until the map is updated.
- **SC4 — Workflows name the verb.** A search over D10's inventory finds the tier names only in their unrelated senses
  and in the stored `verificationKind: "tier-3"` value with its `arc attest` echo, and each gate step in a shipped
  workflow is one `arc check` request.
- **SC5 — Membership and kind.** A `commit` check runs in commit, push, and merge requests, a `push` check in push and
  merge requests, and a gate-less check only by id. In `increment`, a failing `files` check declared `gate: push` is
  labelled feedback and a failing `commit` check enforcement. `segment` runs over the range from the upstream, or from
  the merge base while unpublished, with the push gate as its deadline. A request's selection and outcomes are identical
  under every commit and push interlock setting.
- **SC6 — Outcomes and exits.** Each outcome is produced and exits as specified (0, 1, 2). `skipped` and `none declared`
  are never reported as passed in the report or the verification line. `ARC_SKIP` is honored only by the hook forms, an
  id the declaration does not declare is reported and ignored, and a skipped check is never recorded.
- **SC7 — Refusals.** Every ARC refusal (an invalid declaration, partially staged content, an unresolvable CLI with a
  declaration present, an undeclared `run` id, an unresolvable named ref) has a test of the refusal and of the
  successful retry after its remedy.
- **SC8 — Hooks.** Under husky, lefthook, pre-commit.com, and no hook manager (`core.hooksPath`), each installed as a
  person installs it (plain `pre-commit install` under pre-commit.com), the commit and push gates dispatch once per
  event, a deletion-only commit included, and ARC's commit-message check receives the message. The push gate skips
  `refs/arc/*` and deletions and reports other refs `not selected`; the force-push advisory skips state refs, and a
  push-gate failure names the code ref it gated. `arc update` upgrades an existing generated entry and reports one it
  cannot.
- **SC9 — Fixes.** Increment-boundary fixes apply before review. At the commit hook, `restage` stages a fixer's rewrites
  and `fail` fails with the rewrite left in the worktree; under pre-commit.com and lefthook, and for a path-limited
  commit, `restage` acts as `fail`, and a fix overlapping set-aside changes leaves them restored under pre-commit.com
  and lefthook v2.2.1 or later. Every request that runs fixers as checks fails one that rewrites a file. A new,
  untracked Markdown artifact formats at the increment boundary.
- **SC10 — Merge conclusion.** During a merge conclusion, the commit gate selects only conflicted paths and paths
  matching no parent. ARC's ROADMAP remedy commit runs no gate, and `new-head` verifies its result. A `files` check
  receives the merged-in parents of the merges on its range's first-parent line, and only those, over a merge's own
  range and over every longer range that carries one: the push hook's, `segment`'s, `new-head`'s, and `--range`'s;
  a request with no change exports none. Over each range, `check-package-sync` passes a converged copy such a merge
  brought in and an identical edit of both copies made after it.
- **SC11 — Attestation.** `verify-work-unit` and both convergence scopes execute every selected check, never a reuse.
  No attestation, Candidate, or merge check reads the reuse record.
- **SC12 — Bootstrap.** Over an install carrying populated retired surfaces, `arc update` writes a gate-unset proposal
  naming each source when no declaration exists, writes nothing when one exists, and reports every extracted and
  unextractable source either way. No gate activates. Initial setup's step authors a declaration that the dry run
  validates.
- **SC13 — CI parity.** This repository's CI runs the merge quality gate from the declaration through the dry run's list
  or the verb. A CI-only check is `not selected` locally with that reason and runs in CI.
- **SC14 — Editor document.** The generated document for `check-declaration` accepts this repository's declaration and
  flags an unknown key wherever the CLI rejects one.
- **SC15 — Storage invariants.** The reuse record lives outside `.git/arc/`, a fault reading or writing it degrades to a
  run, and CI-facing output carries no ARC vocabulary.
- **SC16 — Stack neutrality.** Shipped content (templates, workflows, and the install recipe) installs no declared
  check and names no stack tool as a default.
- **SC17 — Measured effect.** This repository's per-increment check time, the per-task gate plus the commit hook, is
  measured over one sample of commits when implementation starts, and the increment boundary plus the commit hook over
  the same sample once it lands; both are recorded with their method in `notes-quality-gate-hooks.md`.
- **SC18 — Git environment.** A declared check that creates and commits in a fixture repository passes under the commit
  hook and under every request form. Only a `reads_index` check receives `GIT_INDEX_FILE`, pointing at an index equal to
  its checked tree, and this repository's index readers (D11) read that index at the commit hook, including under
  `git commit -a`, and at the increment boundary.

- **SC19 — Shell extraction (A1).** Bootstrap preserves complete shell-block text and state in one inactive proposal,
  or reports unsafe/incomplete material for manual authoring.
- **SC20 — Historical reuse (A2).** A `files` check cannot reuse a pass when declared historical input content changes,
  even if checked bytes and received paths are equal; changes outside declared inputs alone do not invalidate its key.

## Open Questions

No settle-able design decision remains. Module layout, the record's file format, the failure-tail length, bootstrap id
derivation, and argument-batch sizing are implementation details bounded by the contracts above.

## Amendments

- **A1** — 2026-10-10 — design: preserve shell blocks. _Supersedes:_ D2 Bootstrap, Proposal paragraph.
  _Trigger:_ STANDARD-PASS-1-F06 review. _Work:_ review-fix. _Revalidated:_ review-fix.
- **A2** — 2026-10-10 — design: bind historical inputs. _Supersedes:_ D5 Key, historical-content sentences.
  _Trigger:_ STANDARD-PASS-1-F09 review. _Work:_ review-fix. _Revalidated:_ review-fix.

---
