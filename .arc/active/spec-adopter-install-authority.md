# Spec (`detailed` · `RFC`): adopter-install-authority

- **Origin:** [internal] — a corpus review found shipped ARC files absent from the installation recipe with no failing
  check; a fresh-install rehearsal (CineXplorer, run `2026-10-23T083226`) then failed its first commit on 28 links to 10
  files the package ships but never installs.

- **Purpose:** One data table gives every file under the package's `arc/` tree exactly one install claim — a class and
  an optional condition — and a commit-gate check proves the installed result is closed under its own links for every
  supported configuration. A claim that gives ARC more ownership of a file it already installed never takes over a copy
  the project edited.

---

## Introduction / Context

### The install set today

`arc init` installs a project's `.arc/` from the package's `arc/` tree. `arc update` re-resolves the set, diffs it
against the tracked manifest (`.arc/system/.internal/manifest.json`), and applies the difference; `arc reconfigure` does
the same after an install answer changes. Each installed file has one of three classes
(`strategy-file-classification.md`): **Framework** files are overwritten on update; **Configurable** files are three-way
merged against the baseline the last install wrote to the gitignored pristine store (`pristine.json`); **Scaffolded**
files are written once and then belong to the project.

What installs, and as what, comes from hand-kept lists:

- `include_files` and `conditions` in `packages/arc-framework/init-recipe.json` — a base list of 144 template paths and
  three conditional arms keyed `pm.mode == external`, `pm.mode == arc-in-git`, and `team.mode == true` — resolved by
  `resolveFileList` (`lib/classification.ts`) for `arc init`, `arc update`, `arc reconfigure`, and this repository's
  self-hosting Markdown authority (`loadMarkdownAuthorityContext`, `lib/markdown/authority.ts`);
- `SCAFFOLDED_FILES` and `CONFIGURABLE_FILES` (`lib/classification.ts`), read by `classifyFile`, which defaults every
  other path to Framework;
- `CANONICAL_SKILLS` (`lib/skills/resolution.ts`), the skills `generateSkills` copies into each harness's skill
  directory;
- `strategy_expected` in `verify-integrity.sh`, which re-implements the team-mode and arc-in-git arms in bash for
  projects without a manifest;
- `EXECUTABLE_GITHOOKS` (`lib/install-permissions.ts`), the hooks that install executable.

Three more copies repeat parts of them by hand: the counts and lists in `strategy-package-project-sync.md` § File
Inventory, pinned by assertions in `framework-sync.test.ts`; the skills README's "Default skill set"; and the
`format:tables` check's `inputs` in this repository's `.arc/system/arc-checks.yml`, which name each non-Framework
Markdown copy one by one.

### What is wrong

- **Fourteen package files carry no disposition:** the `park-work-unit`, `promote-work-unit`, and `reopen-work-unit`
  workflows, `in-flight-scope-check.md`, `setup-release-wrapper.md`, the `assess-parallel-fit` and `branch-format`
  methods, `template-workflow.md`, `template-cohort.md`, the templates README, the `arc-errand`, `arc-housekeep`, and
  `arc-inbox` skill sources, and `run-shellcheck.sh`. All fourteen are byte-identical to their `.arc/` copies, so this
  repository's own checks pass. Thirteen are installable content; `run-shellcheck.sh` is a build script the package's
  `lint:sh` runs.
- **Membership and class drift separately.** Both unclaimed methods declare `override-active` in their frontmatter, so
  projects may override them. Added to `include_files` alone, `classifyFile` would install them as Framework, and the
  next update would overwrite a project's populated override.
- **Skills are incoherent.** The installed copies under `.arc/system/.internal/skills/` cover 11 of 14 skills, nothing
  in `src/` reads them, and their README calls that directory the source of truth. `generateSkills` writes each
  `SKILL.md` unchanged into `<harness>/skills/<name>/`, so seven relative reference definitions in `arc-task-audit`,
  `arc-design-audit`, and `arc-amend-design`, written to resolve from `.arc/system/.internal/skills/<name>/`, point at
  nothing in every harness copy.
- **Conditional files are linked from content that always installs.** `strategy-team-coordination.md` (team mode only)
  is linked from `strategy-concurrent-work`, `strategy-work-organization`, `session-init`, and `session-handoff`, and
  from both other conditional files; `strategy-planning-module.md` (arc-in-git only) from `strategy-work-planning` and
  `strategy-work-organization`. Each link breaks in the configurations that omit its target. The third conditional file,
  `03_configure-external-integration.md`, is already closed: its only link and reference definition sit inside the
  matching `<!-- arc:if pm.mode == external -->` block in `02_define-project.template.md`. The rehearsal's first commit
  failed on 28 such links to 10 files.
- **A reclassification can discard project content.** `buildChangePlan` (`lib/manifest/plan.ts`) reports a class change
  and then routes the file by its new class. Under Framework, `applyChangePlan` (`lib/manifest/apply.ts`) overwrites it,
  discarding a Scaffolded file's content or a Configurable file's override. Under Configurable, a formerly Scaffolded
  file has no stored baseline, so its first merge keeps the project's content (`mergeFileContents` returns the current
  side when base and update match) and every later update merges upstream changes into a file the project owns. Only a
  comment above `SCAFFOLDED_FILES` warns against it.
- **Nothing verifies an installed result.** `init.test.ts` runs real installs — the default configuration with one test
  per named file, all six `pm.mode` × `team.mode` combinations asserting only that retired files stay out, three
  arc-in-git installs, and one manifest-against-disk check — but none compares an installed tree with what should
  install, and none audits its links. Every check that would notice drift runs against this repository's own `.arc/`,
  where all files exist.

### When it is needed

Needed by the first migration of an adopting project, CineXplorer, onto a prerelease. That migration runs right after
the storage cutover lands (§ 1.3), and implementation of this design starts the day the cutover lands.

### Practice elsewhere

Debian claims files per binary package in `debian/<pkg>.install`, globs allowed, and `dh_missing --fail-missing` (the
default from debhelper compat 13) fails a build on any staged file no package claims. dpkg conffiles and rpm `%config`
carry a file's class on its claim, set at author time. `check-manifest` exists because hand-written `MANIFEST.in` lists
drift. The common shape is broad candidates, claims, and a fail-closed audit of unclaimed files. Template projects built
on Copier or cookiecutter commonly test real generated output across a few configurations, as cookiecutter-django
documents, and no template tool checks dangling references between generated files, so the closure check here is
engineering rather than an established standard.

## Goals

1. **One authority.** Every file under the package's `arc/` tree has exactly one effective install claim — a class and
   an optional condition — in one data table that every consumer reads.
2. **Closed installs.** In every supported configuration, every link in installed Markdown resolves to an installed file
   and anchor, or to a directory holding an installed file, and every full reference has a definition — apart from
   reference templates, whose links are written for where a project copies them.
3. **Fail closed at commit, with the fix in the message.** An unclaimed file, a claim matching nothing, an ambiguous
   claim, a class contradicting a file's own override contract, or a broken installed link fails a commit-gate check
   whose output names the remedy.
4. **No silent takeover.** A claim giving ARC more ownership of a file it already installed never takes over a copy the
   project edited.
5. **Cost.** The integration tier gets faster; the commit gate gains one check that runs only when its inputs change, at
   about one configuration's audit.
6. **Fewer hand lists.** The class lists, the skill list, the executable-hook list, and the bash re-implementation of
   conditions retire; the derived copies that remain are checked.

## Non-Goals

_Editable in place until activation, then frozen; changes after that append: `Amended YYYY-MM-DD — <delta> — <prompt>`_

- **Update behavior otherwise unchanged.** Framework overwrite, the pristine store and its baselines, and the
  Configurable three-way merge stay as they are, except for the one case § 8.3 changes: a reclaimed file verified
  unedited takes the new version outright.
- **No install migrations.** Config-key migrations are not added, and no reclassification takes over a file the project
  edited; a held file is reported with a migration remedy instead.
- **No new update or init guards.** Refusing `arc update` on a dirty tree, refusing it when a Configurable baseline is
  missing, refusing `arc init` over existing files at install paths, and stopping an `arc update` addition from writing
  over a file already at its path are out of scope.
- **Projected-root entries are not removed here.** The storage cutover removes them (§ 1.3); this design only refuses
  new ones.
- **No self-hosting freshness work** beyond keeping this change's own claims consistent with this repository's manifest.
- **No publishing changes,** such as a `prepack` step.
- **The managed `.gitignore` entry lists stay as they are.**
- **Per-identity files take no claim.** The files setup writes from the package's `templates/user/`
  (`CROSS_WU_INSTANCE_FILES`, `lib/setup.ts`) are not project install content.
- **No not-installed ledger and no resolved-install-set preview command.**
- **No general self-hosting projection command.** Only Framework Markdown gains a writer for a new file's `.arc/` copy
  (§ 7.2).
- **The shell link validator does not run in tests;** projects keep it as their hook.

## Proposed Design

### 1. Boundary, order, and expected contracts

#### 1.1 One work unit, one delivery

One concern — what reaches a project, from one authority, verified — across install-set resolution, classification,
skills, the checks, and the reclassification guard. Skills share the seam: their generation reads the same package tree
and answers the same "what ships" question. No part is independently landable on `main` ahead of the authority, so the
change lands as one delivery and uses ordinary review chunking.

#### 1.2 Order

Implementation starts when the storage cutover lands and designs against the post-cutover tree. Nothing here is built
first in a form the cutover deletes.

#### 1.3 Expected contract: the storage cutover

The storage cutover is a separate change that moves planning state out of tracked files. This design relies on one part
of it: once it lands, no install entry writes into a projected lifecycle root (`PROJECTED_LIFECYCLE_ROOTS` in
`lib/layout/projected-roots.ts`: `.arc/active`, `.arc/backlog`, `.arc/completed`). `backlog/ROADMAP.template.md`,
`backlog/ATOMIC-INBOX.template.md`, and `completed/README.md` leave the arc-in-git arm of `init-recipe.json`,
`SCAFFOLDED_FILES`, `CONFIGURABLE_FILES`, this repository's `manifest.json`, and `verify-integrity.sh`, and leave
`arc/`.

Availability: implementation does not start until the cutover lands. If one of those files remains under `arc/`, the
coverage check refuses it as unclaimed or as targeting a projected root (§ 4), and finishing this change means moving it
out of `arc/`.

### 2. The claims table

#### 2.1 Shape

`packages/arc-framework/init-recipe.json` keeps its name and location and becomes the claims table: `prompts` as today,
and a list of claims replacing `include_files` and `conditions`. A claim has a target — one literal template path, or
one glob over template paths, relative to `arc/` — a class (`Framework`, `Configurable`, or `Scaffolded`), and an
optional condition (§ 2.4). A directory whose files share one class takes one glob, and its exceptions take literal
claims, so a new file under a claimed directory is claimed the moment it exists. In a glob, `*` matches any run of
characters within one path segment except a leading `.`; every other character is literal, and there is no `**`.

#### 2.2 Schema

One Zod schema registered in the CLI's schema kernel (`lib/kernel/schema/`) parses the table, replacing the hand-written
`validateRecipe` (`lib/template/recipe.ts`). Every consumer reads the parsed form.

#### 2.3 Resolution

Resolution is a pure function of the parsed table, a listing of the package's `arc/` tree, and an install configuration
(the answers map `buildConfigMap` produces). For each listed file it selects the deciding claim: a literal claim
outranks every glob; otherwise the one glob that matches decides; two or more matching globs leave the file ambiguous. A
file whose deciding claim has a condition that does not hold does not install. The result lists each installed file's
template path, output path (`resolveTemplateOutputPath`), and class. It also reports, for every listed file, the class
of its deciding claim whether or not that claim's condition holds; the Markdown authority reads that class for package
sources outside the install set, where today it falls back to `classifyFile`.

Resolution replaces `resolveFileList` and `classifyFile`. `arc init`, `arc update`, `arc reconfigure`, `arc join`,
`buildManifestFiles`, `buildChangePlan`, skill generation and removal (§ 2.8), and the Markdown authority read it.

At runtime the listing is a walk of the installed package's `arc/` directory, which the package publishes whole (`files`
in its `package.json`). A listed file no claim matches does not install; an ambiguous file makes the command refuse with
the package defect named. The coverage check (§ 4) and the closure check (§ 5) read the tracked listing instead — the
Git index the gate supplies (§ 6.1), which is what a commit records — and the coverage check keeps unclaimed files,
ambiguous files, and duplicate claims out of what a clean checkout publishes.

#### 2.4 Conditions

Claim conditions use the `arc:if` predicate grammar — a config key, `==` or `!=`, and a value — through one evaluator
that `renderConditionals` (`lib/template/render.ts`) and resolution share. Today `renderConditionals` parses `==` and
`!=` itself while `evaluateCondition` (`lib/template/recipe.ts`) accepts `==` only; `evaluateCondition`'s parser
retires.

#### 2.5 The initial claim set

- Every file `include_files` and the conditional arms claim today keeps its class: Scaffolded for
  `reference/PROJECT-PRD.template.md` and `reference/TECHNICAL-OVERVIEW.template.md`, Configurable for the files
  `CONFIGURABLE_FILES` lists, Framework otherwise.
- The thirteen unclaimed installable files gain claims: `assess-parallel-fit` and `branch-format` Configurable, as is
  every method but the methods README; the other eleven Framework.
- `strategy-team-coordination.md` and `strategy-planning-module.md` install in every configuration, and the
  `team.mode == true` arm is removed (Alternatives & Rationale).
- With the cutover's removals (§ 1.3) and the planning-module move, one conditional claim remains:
  `system/workflows/arc/initial-setup/03_configure-external-integration.md` under `pm.mode == external`.
- `run-shellcheck.sh` moves to `packages/arc-framework/scripts/run-shellcheck.sh`, outside `arc/` and outside the
  published `files`. Its `.arc/` copy is deleted, and both `lint:sh` in the package's `package.json` and the `lint:sh`
  check's declared `inputs` in `arc-checks.yml` point at the new path.

#### 2.6 The manifest's `layer` field retires

`layer` derives only from the arc-in-git arm (`fileLayer`), and its only behavioral reader rebuilds that same set inside
`applyChangePlan`. With the arm empty, `layer` leaves `FileEntry` (`lib/types.ts`), the plan types, the `arcInGitFiles`
parameter of `buildChangePlan` and `applyChangePlan`, `fileLayer`, `validateManifest` (`lib/manifest/store.ts`), and the
tests that assert it. `validateManifest` checks only the fields it knows, so a manifest written before this change still
validates and its leftover `layer` values are ignored.

#### 2.7 Install mode derives from path

`isExecutableInstallPath` (`lib/install-permissions.ts`) marks every file under `system/.internal/githooks/` except its
`README.md` executable, beside its existing `.sh` rule, and `EXECUTABLE_GITHOOKS` retires. Without this, a hook added
under a glob claim would install without the executable bit, and Git skips a non-executable hook while printing only a
hint.

#### 2.8 Skills

One glob claims every `system/.internal/skills/*/SKILL.md` as Framework with no condition, so every skill source
installs under `.arc/system/.internal/skills/` in every configuration. The skill set is that claimed set, read from the
table without an install configuration. `CANONICAL_SKILLS` retires, and each of its readers reads the claimed skills
instead: `generateSkills` in `arc init`, `arc update`, `arc reconfigure`, and `arc join`, and `removeArcSkills`, which
`arc join` calls to find the ARC-owned harness skill directories it removes. The skills README's opening paragraph says
harness copies generate from the package's skill sources and stops calling the installed directory the source of truth;
its "Default skill set" list stays and is checked (§ 4).

Skill sources carry no relative link target, because harness copies are written unchanged into another directory. They
name `.arc/` paths from the repository root in code spans, as the other skills already do, and the seven relative
reference definitions are rewritten that way; the closure check enforces it (§ 5.3). With that rule, the `tools` answer
never changes what the closure check must cover.

### 3. Conditional files and shipped text

#### 3.1 The closure rule

A link from installed content, apart from reference templates (`template-*`), resolves to an installed file, or to a
directory holding one, in every supported configuration. The closure check (§ 5) gates it; § 2.5 makes the current
content satisfy it.

#### 3.2 `verify-integrity.sh`

With no conditional strategy left, `verify-integrity.sh` expects every strategy `STRATEGY-INDEX.md` indexes:
`strategy_expected`, its "excluded by install mode" branch, and the manifest read that feeds it are deleted, and no
install-condition logic remains in bash.

#### 3.3 Shipped text

- `STRATEGY-INDEX.md` loses the legend sentence saying marked strategies are present only when their mode is on, and the
  `(arc-in-git)` and `(team mode)` markers on its two entries. The planning-module entry's firing condition gains its
  mode: work under `pm.mode: arc-in-git`, or deciding whether to adopt it. The team-coordination entry's condition
  already scopes it (across developers, in a shared repository).
- The same markers beside links in `strategy-work-planning.md` and `strategy-work-organization.md` go.
- `strategy-configurability-architecture.md`'s reconfigure list says `pm.mode` adds or removes arc-in-git strategies and
  `team.mode` adds or removes team-coordination content in rendered templates. Both lines change to what each mode does
  after this change: `pm.mode` adds or removes the external-integration setup step, and `team.mode` installs the same
  file set in every configuration while setting `team.mode` in `arc-config.yml`, and `user.notes_push` to `prompt` when
  on and to its default when off (`buildConfigKeyOverrides`, `lib/config/index.ts`). `team.mode` also keeps its runtime
  consumers (status views, the stale-worktree sweep, in-flight filtering).
- The PRD and technical-overview templates' header comments "(per `classification.ts`)",
  `strategy-file-classification.md`'s pointer to a complete file inventory with layer annotations in a project strategy,
  and `DEV-RULES.PROJECT.md` § Package-Project Sync's file-inventory pointer name the claims table or the self-hosting
  manifest instead.
- `strategy-package-project-sync.md` § File Inventory's hand counts and lists give way to the self-hosting manifest,
  already named there as the reviewable inventory.

### 4. The coverage check

A pure function over the tracked listing of the package's `arc/` tree, the parsed claims table, method frontmatter, and
the skills README. It fails on:

1. a tracked file no claim matches;
2. a file that two or more globs match with no literal claim;
3. two claims with the same target, literal or glob;
4. a claim that matches no file, which also catches a literal path with no source before an install trips on it;
5. a method, other than the methods README, whose frontmatter disagrees with its claim: the `override-active` key is
   present exactly when the method is claimed Configurable. A method carrying the key under another class is the
   destructive disagreement, since `applyChangePlan` would overwrite the project's override; a method claimed
   Configurable without the key fails too, so renaming or replacing the key fails every Configurable method rather than
   leaving this check passing vacuously. The method frontmatter schema (`parseMethodFrontmatter`, run by the pre-commit
   `frontmatter-schema` check) requires the key on every method today, so every method is claimed Configurable; this
   rule admits a Framework method once that schema accepts one without the key. A Configurable file that is not a
   method, such as `arc-config.yml`, has no override contract and is unchecked. Only frontmatter is read, never body
   text;
6. a claim whose output path is in a projected lifecycle root (`isProjectedPath`);
7. a skill claim — any claim matching a `system/.internal/skills/*/SKILL.md` file — that carries a condition (§ 2.8);
8. a skills README "Default skill set" that differs from the claimed skills.

It fails from its first landing, with no warn phase. Each failure carries its remedy (§ 9).

### 5. The closure check

#### 5.1 Configurations

The configurations are derived from the claims table's conditions and the package's `arc:if` predicates: the cross
product, over every config key either one references, of that key's values. A prompt sets the key its `config_key`
names; a `select` prompt's values are its declared `options`, and a `confirm` prompt's are `true` and `false`. A
referenced key that no `select` or `confirm` prompt sets fails the check, including `tools`, which `buildConfigMap` sets
by joining a multi-select prompt's choices, so it has no declared set of values. A claim condition or `arc:if` predicate
whose value is not one of its key's values fails too: an `==` test on it never holds, and a `!=` test always does. After
§ 2.5 only `pm.mode` is referenced, so the configurations are `none`, `arc-in-git`, and `external`. Answers outside the
matrix take fixed values: a fixed `project_name`, and `tools`, which changes nothing under `.arc/`.

#### 5.2 Rendering and audit

For each configuration the check resolves the install set (§ 2.3) from the tracked listing, renders each Markdown output
in memory through the installer's own functions (`renderTokens`, `renderConditionals`, `resolveTemplateOutputPath`) —
never a copy of them — and audits links with `auditLinks` (`src/scripts/audit-links.ts`) over injected in-memory I/O,
which reports a path as a directory when an installed output lies beneath it, as `checkTarget` accepts a directory
target. The audited set is every installed Markdown output except those whose names start with `template-`: reference
templates whose links are written relative to where a project copies them, the outputs the shipped hook
(`validate-links.sh`) and `selectLinkAuditFiles` also skip. A `.template.md` source renders to an output without that
suffix and is audited.

#### 5.3 Rules

`auditLinks` already checks each link, image, and definition target and its anchor over a Markdown parse. The check must
also refuse what the shipped hook refuses, at least for every failure rendering can introduce, and the two disagree. The
hook extracts links from sanitized source text with regular expressions, so it treats a link inside an HTML comment, a
`~~~` fence, an indented code block, a fence nested in a list, or escaped brackets as a link where the parser sees text;
and the parser splits a full reference whose link text carries inline markup across several nodes. The closure check
therefore runs a pass of its own beside `auditLinks`, outside it, so the repository link audit keeps its behavior:

- **Hook-pattern pass.** Over each audited output's source text, sanitized as the hook sanitizes (`validate-links.sh`:
  fenced blocks opened by three backticks at column 0 dropped, single-backtick code spans masked), the pass extracts
  inline links `[text](target)`, definitions `[label]: target`, and full references `[text][label]` with the hook's
  patterns. It refuses a relative target that resolves to no installed file and to no directory that holds one — the
  hook's existence test (`-e`) accepts either — and a full reference whose label has no definition in the file, matched
  case-insensitively as the hook matches it.
- **Relative target in a skill.** Any relative target in an installed `system/.internal/skills/*/SKILL.md`, whether the
  Markdown parse finds it as a link, image, or definition or the hook-pattern pass extracts it, except a target that is
  only a `#fragment` (§ 2.8). The hook's patterns match one line at a time and miss link text that wraps a line or holds
  brackets, so neither source alone covers every target.

#### 5.4 Cost

Parsing dominates the audit, about 10 ms per Markdown file with mdast and GFM. Three changes to `auditLinks` keep the
matrix near one configuration's cost, and the repository link audit (`lint:arc:links`), which uses the same function,
gains them too:

- `auditLinks` accepts a parse cache keyed by content and shared across calls, so each distinct rendered file parses
  once across the matrix. Only files with `arc:if` blocks render differently by configuration:
  `02_define-project.template.md` and `session-init.template.md` today.
- One parse per file serves both its links and its heading anchors, where `headingAnchors` parses each link target again
  today.
- A file containing none of `](`, `]:`, or `][` skips the link parse. Every relative link, definition, and full
  reference the hook checks contains one of them, and an autolink needs a URL scheme.

Measured before these changes, one configuration's audit takes about 1.3 s, about 1.7 s as a cold process. From measured
parse costs, the last two changes save roughly a third of that.

### 6. Placement and test changes

#### 6.1 One declared check at the commit gate

The coverage and closure checks run as one declared check of their own in `arc-checks.yml` at the commit gate. It
declares `reads_index: true`, as `lint:md` and `lint:md:underwrap` do, so it runs against the index its gate supplies —
the commit's index at the commit gate, the checked tree's at the push and merge gates — and it reads both the file
listing and every file's content (the claims table, method frontmatter, the skills README, and the Markdown it renders)
from that index, never from the working tree. Its inputs are the package `arc/` tree, `init-recipe.json`, and the CLI's
source (`packages/arc-framework/src/**`), since the check runs resolution, rendering, layout, configuration, schema, and
audit code from across it; `lint:arc:triggers` declares CLI source the same way. It therefore also runs on commits that
change CLI source, which already run heavier checks. The integration tier is the wrong home: `test:integration` runs at
the merge gate and holds the shared test slot for minutes. Both are this repository's checks and do not ship; a
project's own guard stays its hook over what it received.

#### 6.2 `init.test.ts`

- The "fresh membership across recipe arms" block iterates the closure check's derived configurations — three today,
  where it runs six — and each install asserts two things: the installed tree, as `listFiles` lists it without per-user
  directories and install state, equals the resolved set; and each installed Markdown output is byte-identical to the
  closure check's render of it from the same answers the install used. Together these carry the closure result to what
  `arc init` writes, at the cost of a comparison rather than a second audit.
- The default-configuration block's per-file "installs X" tests retire. Its per-user seed test gains the byte-for-byte
  comparison against the internal templates that the arc-in-git block's seed test makes, and the arc-in-git seed test
  retires: `runPostInitSetup` writes those files the same way under every `pm.mode`.
- The team-mode block, which asserts configuration values, stays. In the arc-in-git block, the `pm.mode` configuration
  assertion stays, the `ROADMAP.md` assertion leaves with the cutover's removal of that file, and the whole-tree
  assertion subsumes the no-completed-atomic test.

#### 6.3 `framework-sync.test.ts`

- The alignment test, which requires this repository's manifest to list exactly the resolved set, stays strict and
  prints the manifest entry a missing file needs.
- The recipe-membership assertions in the per-file shipping tests retire; their pristine-content and trigger-row
  assertions stay.
- The assertions pinning § File Inventory's counts retire.
- A new assertion checks the `format:tables` inputs: they select every `.arc/` copy with a package counterpart that
  `routeMarkdownFormatting` (`lib/markdown/authority.ts`) routes `format-direct`, and every literal `.arc/` entry in
  them is such a copy. A failure prints the line to add or remove. The inputs gain the four methods they miss:
  `disposition-report` and `pull-request-format`, installed today, and `assess-parallel-fit` and `branch-format`,
  claimed by § 2.5.

#### 6.4 Release time

CineXplorer's install rehearsal stays the end-to-end run of the shipped hook over a real install.

### 7. Self-hosting

#### 7.1 A claim lands with its copy

A new claim lands with its `.arc/` copy and its entry in this repository's `manifest.json` in the same change. Two
commit-gate sites enforce it and stay strict: the Markdown authority (`createMarkdownAuthority`), which refuses to load
while a selected source lacks its copy (`markdown.output-missing`), and the alignment test (§ 6.3).
`check-package-sync.sh` is unchanged; it checks edit direction and blind copies, not presence.

#### 7.2 Pending Framework Markdown

Loaded by `render:framework` (`prepareFrameworkProjection`), the authority records a selected Framework Markdown source
with no copy as pending instead of refusing, and `render:framework` writes its copy. Every other consumer,
`format:tables` among them, keeps the refusal and names the remedy for the file's kind:
`render:framework <package-source.md>` for Framework Markdown, and a copy placed by hand for any other class or file
type.

### 8. The reclassification guard

#### 8.1 Rule

When a claim gives ARC more ownership of an installed file than its recorded class — Scaffolded to Configurable or
Framework, or Configurable to Framework — the file keeps its recorded class unless its current bytes hash to its
recorded `pristine_hash` (`FileEntry`), the hash of what was last installed, which the tracked manifest carries in every
checkout. The comparison hashes the current copy with CRLF line endings normalized to LF, since the recorded hash covers
the LF render, so a checkout that converts line endings does not hold an unedited file. An entry with no `pristine_hash`
is held: `arc init` hashes every class (`buildManifestFiles`), but the updater writes Scaffolded entries without one
(`buildEntry` in `applyChangePlan`).

#### 8.2 Mechanics

- `arc update` and `arc reconfigure` hash the current copy of each file whose claim raises ownership and pass those
  hashes to `buildChangePlan`, which stays pure.
- `buildChangePlan` plans a held file under its recorded class: merged as Configurable, or carried forward as
  Scaffolded.
- `applyChangePlan` records the class the plan used. Today `buildEntry` re-derives it from the claim through
  `classifyFile`, which would release the hold at the next update.
- A held Configurable merge refreshes `pristine_hash` to the version just installed, as every Configurable merge does; a
  conflicted merge keeps the old entry, as today.

#### 8.3 Unedited files

A file whose bytes match takes its claimed class and the new version outright, since nothing remains to preserve: the
new render is written and its hash recorded, and under a Configurable claim the new render also becomes the file's
baseline in the pristine store. A merge would not do that for a Scaffolded file claimed Configurable — with no stored
baseline, `mergeFileContents` keeps the old bytes, and the manifest would record a hash that no longer describes the
disk. So a method ARC makes Framework still reaches every project that never changed it, apart from a file an update
without the pristine store left with a stale hash (Cross-cutting Considerations, Trust and safety), which is held and
reported.

#### 8.4 Report and scope

The update and reconfigure reports name each held file with its recorded and claimed classes and say that taking it over
needs a migration. The guard covers `arc update` and `arc reconfigure`, which both plan through `buildChangePlan`; a
fresh `arc init` has no stored manifest and installs by its claims. The comment above `SCAFFOLDED_FILES` retires with
the list.

### 9. Diagnostics

Every failure names the offending file and what fixes it:

- an unclaimed file: add a claim, or move the file out of `arc/`;
- a claim that matches nothing: remove it, or point it at a source;
- an ambiguously matched file: give it a literal claim;
- two claims with the same target: merge them into one;
- a method carrying `override-active` under another class: claim it Configurable;
- a method claimed Configurable without `override-active`: declare the key, or claim the method otherwise;
- a claim into a projected root: target a path outside `.arc/active`, `.arc/backlog`, and `.arc/completed`, or drop the
  claim;
- a conditioned skill claim: drop the condition;
- a skills README mismatch: add or remove the printed skill line;
- a referenced key no `select` or `confirm` prompt sets: condition on a key one does, or add such a prompt;
- a condition value its key never takes: use one of the key's values, or drop the condition;
- a broken link: fix the link, or claim its target;
- an undefined reference: add the definition, or keep the usage inside the same `arc:if` block as its definition;
- a relative target in a skill: name the `.arc/` path from the repository root in a code span;
- a missing manifest entry: add the printed entry;
- a `format:tables` inputs mismatch: add or remove the printed line.

## Alternatives & Rationale

- **Install whatever sits in `arc/`.** Reverses the leak direction — a stray file ships to every project — and leaves
  class nowhere to live.
- **Keep the hand list and add an omission check.** Catches omissions but keeps membership and class in separate lists
  that can disagree, and a new file still needs edits in several places. Claims by glob cover a new file at creation and
  put class on the claim, as dpkg conffiles and rpm `%config` do.
- **A per-file class field in frontmatter.** The tree's shell scripts, YAML, and JSON carry no frontmatter, and a
  per-file field spreads one authority across the tree (`strategy-knowledge-evolution.md`, Principle 4).
- **A typed module instead of a data file.** Another version's dispositions must stay readable — rebuilding a merge
  baseline from a pinned version, or comparing install sets across versions — and reading data from a package is safe
  where importing another version's compiled code is not. The table is declarative, and the coverage check catches a
  malformed claim at commit.
- **Special-case the one remaining condition.** Conditions stay generic predicates over install answers, so a new
  `pm.mode` value or a future condition changes the table's data, not the resolver.
- **A not-installed ledger, as `debian/not-installed`.** Once the build script leaves, `arc/` holds only installable
  content, so a ledger would have no members. A file that must not install lives outside `arc/`.
- **A warn phase before failing.** ARC is pre-public and the gap is a shipped defect; the check fails from its first
  landing.
- **Keep the two strategies conditional and guard their links.** Every link from always-installed content would need an
  `arc:if` guard. A strategy a solo project never reads costs it nothing; team mode configures conventions, not
  installed content; and installing the planning-module strategy changes which documents are available, not which system
  owns backlog placement, priority, or status. Relevance moves into each entry's firing condition, where an agent
  decides whether to load it.
- **Relax the authority's copy-presence refusal everywhere.** It is the only guard that a Markdown source's copy exists;
  admitting pending sources only where a writer exists keeps it.
- **Run the shell validator in tests.** It takes about 11 s over an install-sized set and 6–7 s per install. Projects
  keep it as their hook, and the release rehearsal runs it.
- **An `auditLinks` pass in each real install.** About 1.3 s each; comparing installed bytes with the closure render
  carries the same result for the cost of a comparison.
- **A fixed configuration list.** It would silently skip a new `pm.mode` value or a future `arc:if team.mode` block.
- **Drop GFM parsing, persist a parse cache across runs, or fold the check into `test:arc-contracts`.** GFM-less parsing
  changes the shared auditor's grammar — a footnote definition would read as a link definition — to save about 0.4 s. A
  persistent cache adds a store and invalidation to save about 1 s. `test:arc-contracts` runs on every commit, while the
  declared check runs only when its inputs change.
- **Always hold a raised file, or never hold one.** Always holding stops a method ARC makes Framework from reaching
  projects that never changed it; never holding discards their edits. A hash comparison against the tracked manifest
  tells the two apart in every checkout, with no machine-local state, apart from a file an update without the pristine
  store left with a stale hash, which is held although nobody edited it — the safe direction.

## Cross-cutting Considerations

- **Trust and safety.** Both checks are repository-local and read only package source. What changes for projects is
  corrected content, two strategies in every configuration, hooks executable by path, harness skill copies without dead
  links, and the guard. The guard compares against the tracked manifest, so it holds in worktrees, clones, and other
  machines, where the gitignored pristine store may be absent. Where an earlier update ran without that store, a
  Configurable merge kept the project's bytes but recorded the new render's hash (`applyChangePlan`), so a later
  takeover holds that file although nobody edited it — the safe direction: the file is reported, never overwritten.
- **Performance.** The integration tier gets faster: about eleven fewer real installs at about 110–135 ms each — six
  per-file tests in the default block, two arc-in-git tests, and three of the six recipe arms — and only byte
  comparisons added. The commit gate gains one check that runs only when its inputs change — the package `arc/` tree,
  the claims table, or CLI source — about 1.7 s as a cold process today and about 1.3 s once the § 5.4 changes land. The
  repository link audit gets faster too.
- **Testing.**
    - Unit: the schema; resolution precedence, ambiguity, and conditions; the shared evaluator's `==` and `!=`; each
      coverage refusal with its remedy text; configuration derivation over `select`, `confirm`, a multi-select key, an
      unprompted key, and a condition value its key never takes; the hook-pattern pass; the `auditLinks` cost changes;
      the executable-path rule; the guard in plan and apply.
    - The hook-pattern cases include a broken link inside an HTML comment, a `~~~` fence, an indented code block, a
      fence nested in a list, and escaped brackets; an undefined reference left by an `arc:if` block, including one
      whose link text carries inline markup; a link to an installed directory, which passes both this pass and
      `auditLinks`; and a relative target in a skill found by each source.
    - The `auditLinks` cases include the skip test, cache sharing across calls, and one parse serving anchors.
    - The guard cases include each raise direction, an edited file held across two consecutive updates, an unedited file
      taking the new version with a matching hash, a held entry with no hash, a conflicted merge, and `arc reconfigure`.
    - Integration: the § 6.2 changes.
    - Each refusal is tested both refusing and succeeding once its remedy is applied (`DEV-RULES.PROJECT.md` §
      Engineering Standards, recovery-complete refusals).
- **Migration and rollout.** ARC is pre-public, so the recipe format, classification module, and manifest change in
  place with no compatibility reader (`DEV-RULES.PROJECT.md` § Engineering Standards). Projects updating across this
  change see the two strategies arrive, the arc-in-git and team-mode arms vanish, and any held file reported. The change
  lands after the storage cutover and before CineXplorer's migration onto a prerelease.
- **User-facing impact.** A fresh install passes its first commit's link check in every `pm.mode`; harness skill copies
  stop carrying dead links; update reports name held files.

## Success Criteria

1. The coverage check passes on the package with every file under `arc/` claimed, and tests show it fails, naming the
   remedy, on each refusal in § 4.
2. The closure check passes with zero diagnostics for every derived configuration, and tests show it fails on a broken
   link, on an undefined reference left by an `arc:if` block, including one whose link text carries inline markup, on a
   broken link the hook extracts but the parser treats as text, such as one inside an HTML comment, on a relative target
   in a skill source, on a referenced key no `select` or `confirm` prompt sets, and on a condition value its key never
   takes.
3. At completion, a fresh install for each `pm.mode` value passes the shipped hook's link check (`validate-links.sh`)
   over its rendered tree, run once as completion evidence.
4. Each derived-configuration install in `init.test.ts` asserts whole-tree equality and Markdown byte identity with the
   closure render, and the block runs three installs where it ran six.
5. `include_files`, `SCAFFOLDED_FILES`, `CONFIGURABLE_FILES`, `CANONICAL_SKILLS`, `EXECUTABLE_GITHOOKS`,
   `strategy_expected`, `validateRecipe`, `evaluateCondition`'s parser, `fileLayer`, and the manifest's `layer` field no
   longer exist; one parsed claims table feeds `arc init`, `arc update`, `arc reconfigure`, `arc join`, skill generation
   and removal, and the Markdown authority.
6. Guard tests show, for each raise direction, that an edited file keeps its recorded class across two consecutive
   updates and is reported; that an unedited file takes its claimed class and the new bytes, with `pristine_hash`
   matching the disk; that an entry with no hash is held; and that `arc reconfigure` behaves the same.
7. A hook added under `system/.internal/githooks/` installs executable without being listed anywhere.
8. No skill source carries a relative link target, and every link in a harness skill copy resolves.
9. The shipped-text changes in § 2.8 and § 3.3 are made, and `verify-integrity.sh` contains no install-condition logic.
10. Self-hosting: a new Framework Markdown source commits once `render:framework` has written its copy and the printed
    manifest entry is added; a new file of any other kind is refused with the hand-placed-copy remedy; the alignment
    test prints a missing manifest entry; the `format:tables` assertion passes with the four methods added.
11. The commit-gate check declares the inputs in § 6.1 and is selected only when one of them changes; run as a cold
    process over all derived configurations, it costs about one configuration's audit.
12. `run-shellcheck.sh` lives at `packages/arc-framework/scripts/run-shellcheck.sh`, its `.arc/` copy is gone, and
    `lint:sh` passes from the new path.

## Open Questions

None open for design. Claim field names, the parse cache's interface, and how tests are organized across files are
implementation detail.
