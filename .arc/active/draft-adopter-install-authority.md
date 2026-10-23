# Draft: Adopter Install Authority

- **Origin:** [internal] — corpus review found shipped ARC files absent from the installation recipe with no failing
  check; the CineXplorer install rehearsal (run `2026-10-23T083226`) then failed a fresh install's first commit on 28
  links to 10 files the package ships but never installs.
- **Purpose:** Give every file the package ships exactly one effective install claim — a class and a condition —
  from one authority, and prove the installed result is closed under its own references for every supported
  configuration, cheaply enough to run on every change.
- **Readiness:** maturing — direction settled with the Owner 2026-10-23; the open items are detail design.

---

## Problem

`init-recipe.json` is the effective authority for what reaches a project, but it is a hand-maintained list
independent of the package tree, and four more hand-kept surfaces describe the same set:

- `include_files` and `conditions` in `init-recipe.json`, resolved by `resolveFileList`
  (`lib/classification.ts`) for `arc init`, `arc update`, `arc reconfigure`, and the self-hosting Markdown authority
  (`loadMarkdownAuthorityContext`, `lib/markdown/authority.ts`);
- `SCAFFOLDED_FILES` and `CONFIGURABLE_FILES` (`lib/classification.ts`), read by `classifyFile`, which defaults every
  other path to Framework;
- `CANONICAL_SKILLS` (`lib/skills/resolution.ts`), which `generateSkills` reads from the package's
  `system/.internal/skills/`;
- `strategy_expected` in `verify-integrity.sh`, which re-implements the recipe's team-mode and arc-in-git conditions in
  bash for projects without a manifest.

Two derived copies repeat them by hand: the counts and lists in `strategy-package-project-sync.md` § File Inventory
(test-enforced in `framework-sync.test.ts`), and the skills README's "Default skill set".

Nothing ties these together, and every check that would notice drift runs against this repository's own `.arc/`,
where all files exist. The current gap, re-derived 2026-10-23 against `main`:

- **Fourteen package files carry no disposition:** the `park-`, `promote-`, and `reopen-work-unit` workflows,
  `in-flight-scope-check.md`, `setup-release-wrapper.md`, the `assess-parallel-fit` and `branch-format` methods,
  `template-workflow.md`, `template-cohort.md`, the templates README, the `arc-errand`, `arc-housekeep`, and
  `arc-inbox` internal skill copies, and `run-shellcheck.sh`, a package build script `package.json` runs. All but the
  last are byte-identical across both copies, so the fix is dispositions only.
- **Classification moves in lockstep with membership and nothing enforces it.** Both orphan methods carry
  `override-active: false`; added to the recipe alone, `classifyFile` would install them as Framework, which
  `applyChangePlan` overwrites wholesale, discarding project overrides.
- **Skills are incoherent.** Harness copies are generated from the package, so `.claude/skills/arc-errand` installs,
  but the installed `.arc/system/.internal/skills/` copies cover 11 of 14, nothing in `src/` reads them, and their
  README calls that directory the source of truth.
- **Every conditional file is linked from content that always installs.** `strategy-team-coordination.md` (team mode
  only) from `strategy-concurrent-work`, `strategy-work-organization`, `session-init`, and `session-handoff`;
  `strategy-planning-module.md` (arc-in-git only) from `strategy-work-planning` and `strategy-work-organization`;
  `03_configure-external-integration.md` (external only) from a reference definition in `02_define-project`. Each is
  a broken link in the configurations that omit its target.
- **Nothing verifies an installed result.** `init.test.ts` runs a real `runInit` (pm.mode `none`) and asserts a few
  named files and the pull-request method's links, one test per file shipped; no test checks every installed
  reference, and no configuration but the default is installed at all.

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
  answers; projen deletes stale generated files through a manifest, as ARC does for Framework files; Copier advises
  and cruft enforces a clean tree, and `ng update` blocks a dirty one by default.
- **Engineering, not idiom — installed-result checks.** The cheap check computes each configuration's install set as
  data and asserts every extracted link resolves inside it: milliseconds per configuration, so the whole matrix runs
  per change, with real installs kept to a few configurations (cookiecutter-django's documented split). No template
  tool tests dangling references; the closure check is sound engineering, not an established standard.
- **Secondary only, not relied on:** rpmbuild's unpackaged-files check, `.dpkg-dist` behavior, and whether Copier
  deletes upstream-removed or condition-flipped files.

## Decisions

### D1. One claims table is the install authority

Every file under the package's `arc/` tree resolves to exactly one effective rule `{glob, class, condition}`. The
table replaces `include_files`, `SCAFFOLDED_FILES`, and `CONFIGURABLE_FILES`; class sits on the claim, so membership
and class cannot drift apart. The coverage check fails on a file no rule claims, a file whose claim is ambiguous, and
a rule that matches nothing (which also catches a listed path with no source before an install trips on it). It
fails from the first landing, with no warn phase: ARC is pre-public, and the gap it closes is the shipped defect.

- _Why claims, not derivation alone:_ installing whatever sits in the package tree reverses the leak direction (a
  stray file ships everywhere) and gives class nowhere to live; a hand list is the drift this unit exists to remove.
  Claims by glob keep new files under a claimed path covered at creation.
- _No not-installed ledger (divergence from `debian/not-installed`):_ `arc/` has one purpose, the installable tree,
  and once `run-shellcheck.sh` moves out no file in it should stay uninstalled, so a ledger would be a concept with
  no members. A file that must not install lives outside `arc/`. Re-check against the post-flip tree at
  implementation; a real member there reopens this.
- _Check-doc fit:_ one source the CLI computes from (Procedure Principles 1 and 4); class in a central table rather
  than a per-file field (Knowledge Principle 4); conditions stay generic predicates over install answers, so the
  `pm.mode` direction under `external-pm-composition` changes data, not mechanism (PM composition, Interim
  Boundaries).

### D2. Closure under references is the rule for conditional files

The closure check (D4) makes "a link from installed content resolves to an installed file" a gated invariant for every
configuration, whatever repair each case takes. `strategy-team-coordination.md` installs unconditionally and the
team-mode condition is dropped: a strategy a solo project never reads costs nothing, the conditional arm buys no
benefit, and team mode configures conventions rather than installed content (Storage Principle 7). The
`verify-integrity.sh` special case goes with it.

### D3. Skills join the same authority

All canonical skill sources are claimed by one glob and install as Framework, so every internal copy installs. The
skill list derives from the claimed set rather than `CANONICAL_SKILLS`.

### D4. Two pure checks, placed for cost

- **Coverage check** — package `arc/` tree against the claims table: pure data over a file listing.
- **Closure check** — for each supported configuration: resolve the install set, render each Markdown output in
  memory through the installer's own pipeline (`renderConditionals`, `renderTokens`), and audit links through the
  existing auditor (`auditLinks`, which takes injected I/O). It must call the installer's functions, never a copy.
  The package's templates condition only on `pm.mode` (`<!-- arc:if pm.mode ... -->`), so once D2 drops team mode's
  file arm the matrix is the three `pm.mode` values.
- **Audience:** both are this repository's declared checks, not shipped to projects — the coverage check reads the
  package source and `auditLinks` lives in `src/scripts/`. A project's own guard is its hook link check over what it
  received.
- **Placement:** one declared check of its own whose inputs are the package `arc/` tree, the claims table, and the
  resolver and render sources — not the integration tier, which holds the shared test slot for minutes and does not
  list the recipe among its inputs.
- **Real install:** no new install matrix. The existing real install in `init.test.ts` gains a whole-tree assertion
  (installed tree equals the computed set) and a full link audit over its output, replacing its per-file "installs
  X" tests. The general check also retires the recipe-membership assertions in `framework-sync.test.ts`'s per-file
  shipping tests; their pristine-content, trigger-row, and inventory-count assertions are not membership and stay or
  move with Open 5. Expected net wall clock: neutral or lower. CineXplorer's install rehearsal stays the release-time
  end-to-end run.

### D5. Scope line with `framework-core-from-package`

This unit owns what both the current copy-install and the later package materialization consume: the disposition
authority (what ships, its class, its condition), the coverage check, and the closure check.
`framework-core-from-package` owns Framework overwrite, the pristine store, and the Configurable merge model; the
dispositions this unit derives become the set it materializes.

### D6. Sequencing and the cutover

`storage-cutover` edits the same `init-recipe.json`, `SCAFFOLDED_FILES`, `manifest.json`, and `verify-integrity.sh`
entries to stop installing into projected roots. Planning completes through the task list before the flip;
implementation starts the day the flip lands and designs against the post-flip shape, so the ROADMAP and ATOMIC-INBOX
templates and `completed/README.md` are not this unit's to move. One invariant test persists as the regression guard:
no claim targets a projected root (`isProjectedPath`, `lib/layout/projected-roots.ts`). **Needed by:** CineXplorer's
migration onto a prerelease, which waits on this unit and runs right after the flip.

### D7. Boundary: stays one work unit

One concern — what reaches a project, from one authority, verified — across install-set resolution, classification,
skills, and the checks. Skills share the seam rather than standing apart: their generation reads the same package tree
and the same "what ships" question. The installer and updater flaws found beside it route to their own homes (below)
instead of widening this unit. No separable deliverable is independently landable on `main` ahead of the authority.

## Routing record

Routing test (Owner, 2026-10-23): an item CineXplorer's install or ordinary use would hit before its receiver can land
stays here or ships as a bounded interim; otherwise it routes. Each route below is recorded at its home.

| Finding                                                                      | Home                                                              |
| ---------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Five hand lists; fourteen unclaimed files; class lockstep; skills; closure   | This unit (D1–D4)                                                 |
| No installed-result verification                                             | This unit (D4)                                                    |
| `run-shellcheck.sh` inside the shipped tree                                  | This unit: move it out of `arc/`                                  |
| Configurable merge baseline is machine-local (`pristine.json` is gitignored) | Interim refusal Errand; redesign in `framework-core-from-package` |
| `arc update` has no dirty-tree guard                                         | Errand (`USER-INBOX § Errand`), before CineXplorer's first update |
| Inline config migrations in `update.ts`                                      | `config-migration-registry`, raised to P1 (PR #1104)              |
| `arc init` writes over existing files at install paths                       | Errand (`USER-INBOX § Errand`); not a migration prerequisite      |

## Constraints

- **Pre-public:** the recipe format, classification module, and manifest may change in place, with no compatibility
  reader (`DEV-RULES.PROJECT` § Engineering Standards).
- **Ownership semantics hold:** Scaffolded, Configurable, and Framework behavior under `buildChangePlan` and
  `applyChangePlan` is unchanged. Reclaiming a Scaffolded path as managed overwrites project content with no baseline
  (the constraint on `SCAFFOLDED_FILES`), so the table may not move a path out of Scaffolded without a migration.
- **Self-hosting lands with the change:** every new claim moves this repository's `manifest.json`, the
  `framework-sync.test.ts` alignment test, and the package-sync inventory together. Self-host manifest freshness
  stays `self-hosting-manifest-freshness`'s; this unit only keeps its own additions consistent.
- **Performance:** no net growth in suite wall clock; the new checks are pure and in-memory (D4).
- **Cutover:** no claim into a projected root; nothing that the flip deletes is reworked first (D6).

## Scope boundary (Won't Do)

- Framework overwrite, the pristine store, and the Configurable merge model — `framework-core-from-package`.
- Config-key migrations — `config-migration-registry`.
- The dirty-tree guard, the missing-baseline refusal, and init's overwrite guard — their Errands.
- Removing the projected-root entries — `storage-cutover`; this unit only guards against new ones.
- Self-hosting manifest and pristine freshness — `self-hosting-manifest-freshness`.
- Publishing hygiene (`prepack` so `npm publish` cannot ship a stale `dist/`) — the prerelease item on the
  CineXplorer migration prep list.
- Consolidating the managed `.gitignore` entry lists — already held in `framework-core-from-package`.

## Open

1. **Table home and schema.** Evolve `init-recipe.json` in place into the claims table, or move it into a typed module
   under the CLI's schema kernel; either way every consumer reads one parsed form. Lean: evolve in place, validated by
   a Zod schema.
2. **Claim precedence.** Exceptions inside a glob need a rule: `system/methods/README.md` is Framework while its
   siblings are Configurable. A literal path outranking a glob, explicit negation inside the glob (as npm and Cargo
   allow), or ordered first-match. Lean: a literal path outranks a glob, and two matching globs are an ambiguity the
   coverage check refuses.
3. **The other two conditional arms.** `strategy-planning-module.md` could install unconditionally like team
   coordination, or its referrers could be conditioned; the Planning Module boundary sits with
   `external-pm-composition`, so check the PM check-doc's questions before choosing. The external-setup reference
   definition in `02_define-project.template.md` can move inside its `arc:if` block.
4. **`verify-integrity.sh` without a manifest.** Read installed membership from the manifest only, or ask the CLI;
   either way no condition logic stays in bash.
5. **Derived copies.** Drop the hand counts from `strategy-package-project-sync.md` in favor of the manifest, and
   decide whether the skills README's list is checked against the claimed set or reduced to prose.
6. **A preview listing.** Whether a resolved-install-set listing (the `npm pack --dry-run` analogue) earns a command,
   or the checks' diagnostics suffice. Lean: diagnostics suffice until a consumer asks.
7. **Neighbor coordination at draft close.** `package-project-development-sync` holds the renderer's refusal to
   project an unregistered Framework source; glob claims cover a new file at creation, which may dissolve that entry.
   `storage-cutover` receives the post-flip assumption in D6.

## Continuity

- **Resolved:** D1–D7 and the routing record; Class confirmed `Heavy` (derivation: alternatives over the authority
  model; composed from packaging idiom, so not `Novel`). The closure matrix is the three `pm.mode` values (D4). The
  design-proportionality pass over D1–D4 found one speculative mechanism, the not-installed ledger, now dropped (D1).
- **Open:** the seven items above.
- **Next:** settle Open 1–3 with the Owner, re-run design proportionality over the settled direction at loop exit,
  then readiness and the draft-capture review.

## Inbound dispositions

| Entry                                                                     | Outcome | Folded into                         |
| ------------------------------------------------------------------------- | ------- | ----------------------------------- |
| Give every shipped-but-uninstalled file a recipe disposition              | fold    | Problem; D1; D4                     |
| Derive the shipped-file list so the recipe cannot omit a shippable file   | fold    | D1 (claims by glob)                 |
| Design inputs: packaging idiom, cutover compatibility, rehearsal evidence | fold    | Research grounding; D5; D6; Problem |
