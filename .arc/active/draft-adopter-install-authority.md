# Draft: Adopter Install Authority

- **Origin:** [internal] — corpus review found shipped ARC files absent from the installation recipe with no failing
  check; the CineXplorer install rehearsal (run `2026-10-23T083226`) then failed a fresh install's first commit on 28
  links to 10 files the package ships but never installs.
- **Purpose:** Give every file under the package's `arc/` tree exactly one effective install claim — a class and a
  condition — from one authority, and prove the installed result is closed under its own references for every supported
  configuration, cheaply enough to run on every change.
- **Success signal:** the coverage check passes with every file under the package's `arc/` tree claimed, and a fresh
  install under each `pm.mode` passes its own first-commit link check, which the rehearsal's install failed on 28
  links; the integration tier gets faster, and the commit gate's one new check, run only when its inputs change,
  costs about one configuration's audit.
- **Readiness:** formalization-ready — direction settled with the Owner 2026-10-23.

---

## Problem

`init-recipe.json` is the effective authority for what reaches a project, but it is a hand-maintained list
independent of the package tree. Four more hand-kept surfaces describe the same set, and a fifth carries one install
attribute:

- `include_files` and `conditions` in `init-recipe.json`, resolved by `resolveFileList`
  (`lib/classification.ts`) for `arc init`, `arc update`, `arc reconfigure`, and the self-hosting Markdown authority
  (`loadMarkdownAuthorityContext`, `lib/markdown/authority.ts`);
- `SCAFFOLDED_FILES` and `CONFIGURABLE_FILES` (`lib/classification.ts`), read by `classifyFile`, which defaults every
  other path to Framework;
- `CANONICAL_SKILLS` (`lib/skills/resolution.ts`), which `generateSkills` reads from the package's
  `system/.internal/skills/`;
- `strategy_expected` in `verify-integrity.sh`, which re-implements the recipe's team-mode and arc-in-git conditions in
  bash for projects without a manifest;
- `EXECUTABLE_GITHOOKS` (`lib/install-permissions.ts`), naming the hooks that install executable.

Three derived copies repeat them by hand: the counts and lists in `strategy-package-project-sync.md` § File Inventory
(test-enforced in `framework-sync.test.ts`); the skills README's "Default skill set"; and this repository's
`format:tables` inputs (`.arc/system/arc-checks.yml`), which name each non-Framework Markdown copy one by one and have
already drifted: they miss the installed Configurable `disposition-report` and `pull-request-format` methods, and will
miss `assess-parallel-fit` and `branch-format` once D1 claims them.

Nothing ties these together, and every check that would notice drift runs against this repository's own `.arc/`,
where all files exist. The current gap, re-derived 2026-10-23 against `main`:

- **Fourteen package files carry no disposition:** the `park-`, `promote-`, and `reopen-work-unit` workflows,
  `in-flight-scope-check.md`, `setup-release-wrapper.md`, the `assess-parallel-fit` and `branch-format` methods,
  `template-workflow.md`, `template-cohort.md`, the templates README, the `arc-errand`, `arc-housekeep`, and
  `arc-inbox` internal skill copies, and `run-shellcheck.sh`, a package build script `package.json` runs. All fourteen
  are byte-identical to their `.arc/` copies: thirteen need only a disposition, and the build script, which is not
  installable content, moves out of `arc/` (D1).
- **Classification moves in lockstep with membership and nothing enforces it.** Both orphan methods carry
  `override-active: false`; added to the recipe alone, `classifyFile` would install them as Framework, which
  `applyChangePlan` overwrites wholesale, discarding project overrides.
- **Skills are incoherent.** Harness copies are generated from the package, so `.claude/skills/arc-errand` installs,
  but the installed `.arc/system/.internal/skills/` copies cover 11 of 14, nothing in `src/` reads them, and their
  README calls that directory the source of truth.
- **Two of the three conditional files are linked from content that always installs.**
  `strategy-team-coordination.md` (team mode only) from `strategy-concurrent-work`, `strategy-work-organization`,
  `session-init`, and `session-handoff`, and from both other conditional files; `strategy-planning-module.md`
  (arc-in-git only) from `strategy-work-planning` and `strategy-work-organization`. Each is a broken link in the
  configurations that omit its target. The third, `03_configure-external-integration.md`, is already closed: its only
  link and reference definition sit inside the matching `arc:if pm.mode == external` block in
  `02_define-project.template.md`.
- **A reclassification can discard project content, guarded only by a comment.** `buildChangePlan` reports a class
  change and then routes the file by its new claim: a Scaffolded or Configurable file claimed Framework is
  overwritten and loses the project's edits, and a Scaffolded file claimed Configurable starts taking upstream merges
  into content the project owns. Only the comment above `SCAFFOLDED_FILES` warns against reclaiming a Scaffolded
  path (D8).
- **Nothing verifies an installed result.** `init.test.ts` runs real installs: the default configuration, with one
  test per named file and the pull-request method's links; all six `pm.mode` × `team.mode` combinations ("fresh
  membership across recipe arms"), asserting only that retired files stay out; three `pm.mode=arc-in-git` installs
  asserting its backlog and per-user files; and one check that the manifest matches the disk. None compares an
  installed tree with what should install, and none audits its links.

## Research grounding

Medium research, 2026-10-23: three parallel facets, unverified synthesis. Load-bearing claims are primary-sourced;
the rest are context only.

- **Primary-sourced — inventory authority.** Debian claims files per binary package in `debian/<pkg>.install` (globs
  allowed), lists deliberately uninstalled files in `debian/not-installed`, and `dh_missing --fail-missing` (the
  default from debhelper compat 13) fails the build on any staged file no package claims. `check-manifest` exists
  because hand-written `MANIFEST.in` lists drift; npm `files` and Cargo `include`/`exclude` derive broadly with
  `npm pack --dry-run` and `cargo package --list` as previews. The dominant idiom is broad candidates, claims, and a
  fail-closed audit for unclaimed files — neither a pure hand list nor implicit install-everything.
- **Primary-sourced — file class.** dpkg conffiles and rpm `%config` / `%config(noreplace)` carry the class on the
  claim itself, set at author time; no ecosystem keeps a class list apart from the install rule. Neither merges
  content; ARC's three-way merge exceeds them.
- **Primary-sourced — removals.** dpkg keeps a dropped conffile until a maintainer script removes it explicitly
  (`dpkg-maintscript-helper rm_conffile`); ARC already matches, keeping an orphaned Configurable file for review and
  leaving Scaffolded files alone (`applyChangePlan`).
- **Primary-sourced — update tools.** Copier and cruft rebuild the merge base from the pinned old version and stored
  answers; projen deletes stale generated files through a manifest, as ARC does for Framework files; Copier and
  cruft refuse a dirty tree, and `ng update` refuses one unless given `--allow-dirty`.
- **Engineering, not idiom — installed-result checks.** The cheap check computes each configuration's install set as
  data and asserts every extracted link resolves inside it. Parsing dominates its cost, about 1.3 s per configuration
  measured here; it runs on each change to its inputs, with real installs kept to a few configurations
  (cookiecutter-django's documented split). No template tool tests dangling references; the closure check is sound
  engineering, not an established standard.
- **Secondary only, not relied on:** rpmbuild's unpackaged-files check, `.dpkg-dist` behavior, and whether Copier
  deletes upstream-removed or condition-flipped files.

## Decisions

### D1. One claims table is the install authority

Every file under the package's `arc/` tree resolves to exactly one effective rule `{glob, class, condition}`. The
table replaces `include_files`, `SCAFFOLDED_FILES`, and `CONFIGURABLE_FILES`; class sits on the claim, so membership
and class cannot drift apart. The coverage check fails on a file no rule claims, a file whose claim is ambiguous, a
rule that matches nothing (which also catches a listed path with no source before an install trips on it), and a file
that declares an override contract under a claim other than Configurable. It fails from the first landing, with no
warn phase: ARC is pre-public, and the gap it closes is the shipped defect.

- _Why claims, not derivation alone:_ installing whatever sits in the package tree reverses the leak direction (a
  stray file ships everywhere) and gives class nowhere to live; a hand list is the drift this unit exists to remove.
  Claims by glob keep new files under a claimed path covered at creation.
- _A claimed file before the self-hosting install catches up:_ glob claims make a new package file a member at
  creation, so its `.arc/` copy and its entry in this repository's `manifest.json` land in the same change. Two
  commit-gate sites enforce that and stay strict. The self-hosting Markdown authority (`createMarkdownAuthority`,
  `lib/markdown/authority.ts`) refuses to load while any selected source lacks its copy (`markdown.output-missing`),
  and `format:tables` and `render:framework` both load it. `framework-sync.test.ts`, under `test:arc-contracts`,
  requires the manifest to list exactly the resolved set and checks each Framework entry's copy.
  `check-package-sync.sh` checks edit direction and blind copies, not presence. Each refusal names the remedy for the
  file's kind: the authority admits pending sources only for `render:framework`, which writes a Framework Markdown
  copy; every other class or file type keeps today's path, a project copy placed by hand; and the contract check's
  failure prints the missing manifest entry (D4's diagnostics rule). One command that projects a new file of any
  class, manifest entry included, is `package-project-development-sync`'s projection core, not this unit's.
- _No not-installed ledger (divergence from `debian/not-installed`):_ `arc/` has one purpose, the installable tree,
  and once `run-shellcheck.sh` moves out — to a package path outside `arc/`, with its `.arc/` copy deleted and both
  `lint:sh` (`package.json`) and that check's declared inputs (`arc-checks.yml`) repointed — no file in it should stay
  uninstalled, so a ledger would be a concept with no members. A file that must not install lives outside `arc/`.
  Re-check against the post-flip tree at implementation; a real member there reopens this.
- _A data file, evolved in place:_ `init-recipe.json` becomes the claims table and keeps its name, parsed by one Zod
  schema in the CLI's schema kernel that replaces the hand-written `validateRecipe` (`lib/template/recipe.ts`); every
  consumer reads that parsed form. A typed module was weighed and declined: a version's dispositions must stay
  readable by other versions — `framework-core-from-package`'s baseline rebuild and any old-versus-new install-set
  comparison read another version's table, and reading data out of a package is safe where importing another
  version's compiled code is not. The table is declarative, and the coverage check catches a malformed claim at
  commit, which covers most of what compile-time checking would add.
- _One class authority, checked against the files' own contracts:_ a method declares its overridability in its own
  frontmatter: every method but the README carries `override-active`, and every installed one is Configurable (the
  two uninstalled ones, which gain claims here, carry it too). `composable-workflows` plans an
  `override-policy: overridable | fixed` field and `customization-arch-realign` plans `active`, `override-mode`, and
  `core`. The table stays the only class authority; the coverage check refuses the destructive disagreement, an
  overridable file claimed Framework, whose project override `applyChangePlan` would overwrite. The converse is
  legitimate — `arc-config.yml`, `DEV-RULES.PROJECT.md`, and `STRATEGY-INDEX.md` are Configurable with no override
  contract — so it is not checked.
- _Install mode derives from path:_ every file under `system/.internal/githooks/` except its README installs
  executable, beside the existing `.sh` rule (`isExecutableInstallPath`, `lib/install-permissions.ts`), replacing
  `EXECUTABLE_GITHOOKS`. A hook added under a glob claim would otherwise install without the executable bit, and Git
  skips a non-executable hook and commits anyway, printing only a hint. No claim field carries it.
- _Precedence:_ a literal path outranks a glob, and two globs matching one file is an ambiguity the coverage check
  refuses. That covers exceptions such as `system/methods/README.md`, Framework inside the Configurable methods glob.
- _Conditions after the flip:_ with D2, one conditional file remains, `03_configure-external-integration.md` under
  `pm.mode == external`, and the condition mechanism stays generic data. Claim conditions take the `arc:if` predicate
  grammar through one shared evaluator: today `renderConditionals` (`lib/template/render.ts`) parses `==` and `!=`
  itself while `evaluateCondition` (`lib/template/recipe.ts`) accepts `==` only, two grammars over the same install
  answers. The manifest's per-file `layer` derives only from the arc-in-git arm (`fileLayer`), and its only
  behavioral reader rebuilds that same set (`applyChangePlan`); with the arm empty, the field retires from
  `FileEntry`, the plan types, `validateManifest` (`lib/manifest/store.ts`), and the tests that assert it.
- _Check-doc fit:_ one source the CLI computes from (Procedure Principles 1 and 4); class in a central table rather
  than a per-file field (Knowledge Principle 4), which the tree forces anyway, since its shell scripts, YAML, and JSON
  carry no frontmatter; install-time `arc:if` is the binding time `composable-workflows` keeps for variation that
  depends only on configuration; conditions stay generic predicates over install answers, so the
  `pm.mode` direction under `external-pm-composition` changes data, not mechanism (PM composition, Interim
  Boundaries).

### D2. Closure under references is the rule for conditional files

The closure check (D4) makes "a link from installed content resolves to an installed file" a gated invariant for every
configuration, whatever repair each case takes. `strategy-team-coordination.md` installs unconditionally and the
team-mode condition is dropped: a strategy a solo project never reads costs nothing, the conditional arm buys no
benefit, and team mode configures conventions rather than installed content (Storage Principle 7).
`strategy-planning-module.md` likewise installs unconditionally. That changes document availability, not a PM fact:
no answer to the PM composition check-doc's questions moves, since which system owns backlog placement, priority,
or status is untouched. With no conditional strategy left, `verify-integrity.sh` expects every indexed strategy:
`strategy_expected`, its "excluded by install mode" branch, and the manifest read that feeds it are deleted, and no
condition logic stays in bash.

Shipped text that describes the conditional installs changes with them:

- The `(arc-in-git)` and `(team mode)` presence markers go — `STRATEGY-INDEX.md`'s legend saying marked strategies
  are "only present when" their mode is on, the two marked entries, and the markers beside links in
  `strategy-work-planning` and `strategy-work-organization`. The team-coordination entry's firing condition already
  scopes it (across developers, in a shared repository). The planning-module entry's — backlog structure, routing
  deferred work, PM mode fit — fits every `pm.mode`, so its trigger gains the mode: work under `pm.mode: arc-in-git`,
  or deciding whether to adopt it. Relevance then sits in the firing condition, where Knowledge Principle 2 puts it;
  relabeling the markers would keep an annotation scheme `knowledge-architecture` would have to undo.
- `strategy-configurability-architecture.md`'s reconfigure list says `pm.mode` adds or removes arc-in-git strategies
  and `team.mode` adds or removes team coordination content in rendered templates. No `arc:if team.mode` block exists,
  and after D2 neither mode installs a strategy, so both lines say what each mode installs. `team.mode` keeps its
  runtime consumers — status views, the stale-worktree sweep, in-flight filtering — so no configuration key goes
  dead.

### D3. Skills join the same authority

All canonical skill sources are claimed by one glob and install as Framework, so every internal copy installs. The
skill list derives from the claimed set rather than `CANONICAL_SKILLS`. The skills README keeps its described list,
and the coverage check confirms it names exactly the claimed skills: checked, not generated. Its opening paragraph
stops calling the installed directory the source of truth: harness copies generate from the package's skill sources
(`generateSkills`).

`generateSkills` writes each `SKILL.md` unchanged into `<harness>/skills/<name>/`, so a relative link that resolves from
`.arc/system/.internal/skills/<name>/` breaks in every harness copy, as seven do today in `arc-task-audit`,
`arc-design-audit`, and `arc-amend-design`. Skill sources therefore carry no relative links and name `.arc/` paths from
the repository root in code spans, as the other skills already do; the closure check, which already parses each
installed skill, refuses any relative target in one — an inline link, an image, or a reference definition — except one
that is only a `#fragment`, and those seven are rewritten. With that rule, the `tools` prompt never changes what the
closure check must cover.

### D4. Two pure checks, placed for cost

- **Coverage check** — package `arc/` tree against the claims table: pure data over a file listing, plus the contracts
  files declare for themselves — method frontmatter (D1) and the skills README's list (D3).
- **Closure check** — for each supported configuration: resolve the install set, render each Markdown output in memory
  through the installer's own pipeline (`renderConditionals`, `renderTokens`), and audit links through the existing
  auditor (`auditLinks`, which takes injected I/O). It must call the installer's functions, never a copy. It must also
  refuse what the shipped hook refuses (`validate-links.sh`), at least for every failure rendering can introduce. One
  such failure, a reference used without a definition left behind by an `arc:if` block, is invisible to `auditLinks`,
  since an undefined reference parses as plain text, so `auditLinks` gains that rule. It matches the hook's usage
  pattern over the file's source text, never one text node at a time, because the parser splits a reference whose link
  text carries inline markup across several nodes. Running the shell validator itself over an install-sized set measured
  about 11 s, so it stays the projects' hook. The configurations derive from the recipe: the cross product of each
  prompt's declared options for every key a claim condition or an `arc:if` predicate references, where a yes/no prompt
  enumerates true and false, and a referenced key with no prompt fails the check. Once D2 drops team mode's file arm,
  only `pm.mode` is referenced (`<!-- arc:if pm.mode ... -->`), so today that is its three values. Parsing dominates the
  cost — about 10 ms per Markdown file, since `auditLinks` parses with mdast and GFM — so the check parses each distinct
  rendered file once across the matrix, through a parse cache keyed by content that `auditLinks` accepts and shares
  across calls. Only files with `arc:if` blocks render differently by configuration, two package files today, so the
  whole matrix costs about one configuration's audit, measured at about 1.3 s. Two more changes to `auditLinks` cut that
  further, and its repository audit gains them too: one parse per file serves both its links and its heading anchors
  (`headingAnchors` parses each link target again today), and a file with none of `](`, `]:`, or `][` skips the link
  parse, since every relative link, definition, and reference usage the hook checks contains one, and autolinks need a
  URL scheme. Estimated from one configuration's measured parse costs, the two save roughly a third of the audit.
- **Audience:** both are this repository's checks, not shipped to projects — the coverage check reads the package source
  and `auditLinks` lives in `src/scripts/`. A project's own guard is its hook link check over what it received.
- **Placement:** both run as one declared check of their own at the commit gate, whose inputs are the package `arc/`
  tree, the claims table, the resolver and render sources, and `src/scripts/audit-links.ts`. The integration tier is the
  wrong home: `test:integration` runs at the merge gate and holds the shared test slot for minutes. The audit skips
  installed outputs whose names start with `template-` — reference templates whose links are written relative to where a
  project copies them, the skip the shipped hook (`validate-links.sh`) and `selectLinkAuditFiles` both make. A
  `.template.md` source renders to an output without that suffix (`resolveTemplateOutputPath`) and is audited.
- **Real install:** no new install matrix. `init.test.ts`'s existing per-configuration installs ("fresh membership
  across recipe arms") each gain a whole-tree assertion — the installed tree, as `listFiles` lists it without per-user
  directories and install state, equals the computed set — and assert every installed Markdown output byte-identical to
  the closure check's render of it from the install's own answers. That carries the closure result, and with it the
  success signal per `pm.mode` as far as `auditLinks` matches the hook, over to what `arc init` writes, for the cost of
  a comparison rather than a second audit at about 1.3 s apiece. CineXplorer's rehearsal runs the hook itself, since
  running the shell validator in each install would cost about 6–7 s apiece. After D2 team mode no longer changes what
  installs, so those installs drop from six to the closure check's derived configurations, three today — fewer real
  installs than today. The default-configuration block's per-file "installs X" tests retire; the team-mode block, which
  asserts configuration values, stays. Of the `pm.mode=arc-in-git` block's three tests, the first asserts `ROADMAP.md`,
  a projected-root entry the flip removes and `storage-cutover`'s to drop, and the `pm.mode` value in `arc-config.yml`,
  a configuration check that stays as the team-mode block's do. The per-user seed test checks each seeded file
  byte-for-byte against its template, which the default block's seed test does not; seeding does not depend on `pm.mode`
  (`runPostInitSetup` writes those files from `CROSS_WU_INSTANCE_FILES`, not the recipe), so that check moves into the
  default block's test. That mode's whole-tree assertion subsumes its no-completed-atomic check. The general check also
  retires the recipe-membership assertions in `framework-sync.test.ts`'s per-file shipping tests; their pristine-content
  and trigger-row assertions are not membership and stay. The in-memory closure check keeps its own job, commit-time
  feedback on any package or claims change. Net wall clock: the integration tier gets faster, with three fewer real
  installs and only byte comparisons added; the commit gate gains the closure check, which runs only when its inputs
  change, at about one configuration's audit plus process start: about 1.7 s measured before the `auditLinks` changes,
  about 1.3 s after them by estimate. CineXplorer's install rehearsal stays the release-time end-to-end run.
- **Derived copies retire or are checked:** the hand counts and lists in `strategy-package-project-sync.md` § File
  Inventory give way to the self-hosting manifest, already named there as the reviewable inventory, and the test
  assertions that pin those counts go with them. Text naming the retired authorities changes with them: the PRD and
  technical-overview templates' header comments "(per `classification.ts`)", `strategy-file-classification.md`'s pointer
  to a "complete file inventory with layer annotations" in a project strategy, and `DEV-RULES.PROJECT` § Package-Project
  Sync's file-inventory pointer. The `format:tables` inputs stay, since a check declaration is static:
  `framework-sync.test.ts` asserts that they select every `.arc/` copy with a package counterpart that the Markdown
  authority formats directly (`routeMarkdownFormatting`'s `format-direct` route), and that each literal `.arc/` entry is
  such a copy; a failure prints the line to add or remove.
- **Diagnostics carry the remedy:** each failure names the offending file and what fixes it — add a claim, or move
  the file out of `arc/`; fix the link, or claim its target — so the check's output is the fix (Knowledge Principle
  7). The self-hosting alignment test in `framework-sync.test.ts` follows the same rule: its failure prints the
  `manifest.json` entry a new claim needs. No preview command: a resolved-install-set listing (the
  `npm pack --dry-run` analogue) waits for a consumer that needs it.

### D5. Scope line with `framework-core-from-package`

This unit owns what both the current copy-install and the later package materialization consume: the disposition
authority (what ships, its class, its condition), the coverage check, and the closure check.
`framework-core-from-package` owns Framework overwrite, the pristine store, and the Configurable merge model; the
dispositions this unit derives become the set it materializes. The reclassification guard (D8) is this unit's: it
protects the class this unit's table assigns, and it changes overwrite and merge behavior in one case only: a
reclaimed file the check verifies unedited takes the new version outright.

### D6. Sequencing and the cutover

`storage-cutover` edits the same `init-recipe.json`, `SCAFFOLDED_FILES`, `manifest.json`, and `verify-integrity.sh`
entries to stop installing into projected roots. Planning completes through the task list before the flip;
implementation starts the day the flip lands and designs against the post-flip shape, so the ROADMAP and ATOMIC-INBOX
templates and `completed/README.md` are not this unit's to move. One invariant test persists as the regression guard:
no claim targets a projected root (`isProjectedPath`, `lib/layout/projected-roots.ts`). The draft's capture commit
sets the meta's `Depends On` to `storage-cutover`; for an active unit the edge is displayed, not enforced, so this
decision is what holds implementation to the flip. **Needed by:** CineXplorer's migration onto a prerelease, which
waits on this unit and runs right after the flip.

### D7. Boundary: stays one work unit

One concern — what reaches a project, from one authority, verified — across install-set resolution, classification,
skills, and the checks. Skills share the seam rather than standing apart: their generation reads the same package tree
and the same "what ships" question. The installer and updater flaws found beside it route to their own homes (below)
instead of widening this unit, except the reclassification guard (D8), which the routing test keeps here. No separable
deliverable is independently landable on `main` ahead of the authority.

### D8. A reclassification never discards project content

`buildChangePlan` (`lib/manifest/plan.ts`) reports a classification change and then routes the file by its new claim.
Under a Framework claim `applyChangePlan` overwrites it wholesale, discarding a Scaffolded file's content or a
Configurable file's populated override. Under a Configurable claim a Scaffolded file has no stored baseline, so its
first merge keeps the project's content (`mergeFileContents` returns the current side when base and update match), and
every later update merges upstream changes into a file the project owns. Only the comment above `SCAFFOLDED_FILES`
warns against reclaiming a Scaffolded path; it retires with the class lists when D1 transcribes them into one table,
where a reclassification is a one-line edit.

The planner enforces one rule where the operation runs. When a new claim gives ARC more ownership of a file than its
recorded class — Scaffolded to Configurable or Framework, Configurable to Framework — the file keeps its recorded
class unless its current bytes still match its recorded `pristine_hash`, the hash of what was last installed
(`FileEntry`, `lib/types.ts`), which the tracked manifest holds in every checkout. An entry with no hash is held:
`arc init` hashes every class (`buildManifestFiles`), but the updater writes Scaffolded entries without one
(`buildEntry`, `lib/manifest/apply.ts`).

Three changes carry the rule across updates. `buildChangePlan` stays pure and gains one input: the current copy's hash
for each file whose claim raises ownership, which `arc update` and `arc reconfigure` compute before planning. A held
file is planned under its recorded class — merged as Configurable, or carried forward as Scaffolded. And
`applyChangePlan` records the class the plan used, where today `buildEntry` re-derives it from the claim through
`classifyFile`, which would release the hold at the next update. A held Configurable merge refreshes `pristine_hash`
to the version just installed, so the check always compares against the latest install.

The update report names each held file and says that taking it over needs a migration. An unedited file reclassifies as
claimed and takes the new version outright: its bytes are verified as the last install, so nothing remains to preserve,
and a method made fixed still reaches projects that never changed it. Writing the new version rather than merging
matters for a Scaffolded file claimed Configurable: with no stored baseline, `mergeFileContents` would keep the old
bytes, and the manifest would record a hash that no longer describes the disk. The rule covers `arc update` and
`arc reconfigure`, which both plan through `buildChangePlan`; a fresh `arc init` has no stored manifest and installs by
its claims. A deliberate takeover of an edited file is an install migration, routed to `config-migration-registry`
(draft-close coordination). The routing test keeps the guard here: `composable-workflows` can make methods fixed after
CineXplorer's migration and before `framework-core-from-package`, which waits on the cutover, lands.

## Routing record

Routing test (Owner, 2026-10-23): an item CineXplorer's install or ordinary use would hit before its receiver can land
stays here or ships as a bounded interim; otherwise it routes. Each route below is recorded at its home.

| Finding                                                                      | Home                                                              |
| ---------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Six hand lists; fourteen unclaimed files; class lockstep; skills; closure    | This unit (D1–D4)                                                 |
| No installed-result verification                                             | This unit (D4)                                                    |
| `run-shellcheck.sh` inside the shipped tree                                  | This unit: move it out of `arc/`                                  |
| Configurable merge baseline is machine-local (`pristine.json` is gitignored) | Interim refusal Errand; redesign in `framework-core-from-package` |
| `arc update` has no dirty-tree guard                                         | Errand (`USER-INBOX § Errand`), before CineXplorer's first update |
| Inline config migrations in `update.ts`                                      | `config-migration-registry`, raised to P1 (PR #1104)              |
| `arc init` writes over existing files at install paths                       | Errand (`USER-INBOX § Errand`); not a migration prerequisite      |
| A reclassification can discard project content                               | This unit (D8); deliberate takeovers, `config-migration-registry` |

## Constraints

- **Pre-public:** the recipe format, classification module, and manifest may change in place, with no compatibility
  reader (`DEV-RULES.PROJECT` § Engineering Standards).
- **Ownership semantics hold:** Scaffolded, Configurable, and Framework behavior under `buildChangePlan` and
  `applyChangePlan` is unchanged, except that a reclassification giving ARC more ownership never takes over a file
  the project edited: the planner takes the current copy's hash, `applyChangePlan` records the class the plan used
  rather than re-deriving it from the claim, and a reclaimed file the check verifies unedited takes the new version
  outright (D8).
- **Self-hosting lands with the change:** each new claim lands with its `.arc/` copy and its entry in this
  repository's `manifest.json` (D1). Self-host manifest freshness stays `self-hosting-manifest-freshness`'s; this unit
  only keeps its own additions consistent.
- **Performance:** no unnecessary growth in suite wall clock: the integration tier gets faster, and the commit gate's
  one new check runs only when its inputs change, at about one configuration's audit (D4).
- **Cutover:** no claim into a projected root; nothing that the flip deletes is reworked first (D6).

## Scope boundary (Won't Do)

- Framework overwrite, the pristine store, and the Configurable merge model — `framework-core-from-package`.
- Config-key migrations, and the install migration a deliberate takeover of an edited file needs —
  `config-migration-registry`.
- The dirty-tree guard, the missing-baseline refusal, and init's overwrite guard — their Errands.
- Removing the projected-root entries — `storage-cutover`; this unit only guards against new ones.
- Self-hosting manifest and pristine freshness — `self-hosting-manifest-freshness`.
- Publishing hygiene (`prepack` so `npm publish` cannot ship a stale `dist/`) — the prerelease item on the
  CineXplorer migration prep list.
- Consolidating the managed `.gitignore` entry lists — already held in `framework-core-from-package`.
- The per-identity files setup writes from the package's `templates/user/` (`CROSS_WU_INSTANCE_FILES`,
  `lib/setup.ts`), which are not the project install.

## Draft-close coordination

Captured as pre-routed `USER-INBOX § Work Unit` entries, 2026-10-23; the next drain re-gates them:

- **`package-project-development-sync`** — glob claims select a new file at creation; `render:framework` writes a
  pending Framework Markdown copy, while every other class keeps a hand-placed copy (D1). Its entry on the renderer's
  refusal to project an unregistered Framework source should stop meeting the forced case for Framework Markdown, and
  its projection core becomes the general remedy for a new file of any class.
- **`storage-cutover`** — remove the projected-root install entries outright at the flip rather than relocating
  them within `arc/`, and leave the recipe's structure for this unit's rebuild (D1, D2, D6).
- **`config-migration-registry`** — a deliberate takeover of a file the project edited, a Scaffolded file reclaimed or
  a Configurable file made Framework, is an install migration (D8): a second install-migration case beside
  `bootstrapRetiredChecks` for its open question of whether install migrations share the registry.
- **`composable-workflows`** and **`customization-arch-realign`** — the claims table is the install-class authority,
  so the method frontmatter axes each plans (`override-policy`; `active`, `override-mode`, `core`) do not become a
  second one: a fixed method lands with its own Framework claim and without its override contract, since the
  coverage check refuses an overridable file claimed Framework (D1), and D8 holds it in any project that edited its
  override.

## Continuity

- **Resolved:** D1–D8, the routing record, and draft-close coordination; checked against the procedure and knowledge
  check-docs, `knowledge-architecture`, `composable-workflows`, and the `configuration` cohort. Class confirmed
  `Heavy` (derivation: alternatives over the authority model; composed from packaging idiom, so not `Novel`). The
  design-proportionality pass over D1–D4 dropped one speculative mechanism, the not-installed ledger (D1).
- **Open:** none at design level; implementation details belong to the spec.
- **Next:** `create-spec`. The capture commit also sets the meta's `Depends On` to `storage-cutover` (D6).

## Inbound dispositions

| Entry                                                                     | Outcome | Folded into                         |
| ------------------------------------------------------------------------- | ------- | ----------------------------------- |
| Give every shipped-but-uninstalled file a recipe disposition              | fold    | Problem; D1; D4                     |
| Derive the shipped-file list so the recipe cannot omit a shippable file   | fold    | D1 (claims by glob)                 |
| Design inputs: packaging idiom, cutover compatibility, rehearsal evidence | fold    | Research grounding; D5; D6; Problem |
