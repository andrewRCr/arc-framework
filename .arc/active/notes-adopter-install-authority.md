# Notes: adopter-install-authority

## Contents

- [Research grounding](#research-grounding)
- [Check-doc fit](#check-doc-fit)
- [Neighboring flaws and their homes](#neighboring-flaws-and-their-homes)
- [Coordination with other work units](#coordination-with-other-work-units)
- [Implementation reminders](#implementation-reminders)

---

## Research grounding

Medium research, 2026-10-23: three parallel facets, unverified synthesis. Load-bearing claims are primary-sourced; the
rest are context only.

- **Inventory authority (primary-sourced).** Debian claims files per binary package in `debian/<pkg>.install` (globs
  allowed), lists deliberately uninstalled files in `debian/not-installed`, and `dh_missing --fail-missing` (the default
  from debhelper compat 13) fails the build on any staged file no package claims. `check-manifest` exists because
  hand-written `MANIFEST.in` lists drift; npm `files` and Cargo `include`/`exclude` derive broadly, with
  `npm pack --dry-run` and `cargo package --list` as previews. The dominant idiom is broad candidates, claims, and a
  fail-closed audit for unclaimed files.
- **File class (primary-sourced).** dpkg conffiles and rpm `%config` / `%config(noreplace)` carry the class on the claim,
  set at author time; no ecosystem keeps a class list apart from the install rule. Neither merges content.
- **Removals (primary-sourced).** dpkg keeps a dropped conffile until a maintainer script removes it
  (`dpkg-maintscript-helper rm_conffile`); ARC already keeps an orphaned Configurable file for review and leaves
  Scaffolded files alone (`applyChangePlan`).
- **Update tools (primary-sourced).** Copier and cruft rebuild the merge base from the pinned old version and stored
  answers; projen deletes stale generated files through a manifest, as ARC does for Framework files; Copier and cruft
  refuse a dirty tree, and `ng update` refuses one unless given `--allow-dirty`.
- **Installed-result checks (engineering, not idiom).** Template projects test real generated output across a few
  configurations (cookiecutter-django's documented split); no template tool checks dangling references between
  generated files.
- **Secondary only, not relied on:** rpmbuild's unpackaged-files check, `.dpkg-dist` behavior, and whether Copier deletes
  upstream-removed or condition-flipped files.

## Check-doc fit

- **Procedure evolution, Principles 1 and 4:** one source the CLI computes from.
- **Knowledge evolution, Principle 4:** class in a central table rather than a per-file field; Principle 2: relevance
  of the two newly unconditional strategies sits in their `STRATEGY-INDEX` firing conditions, so `knowledge-architecture`
  has no presence-marker scheme to undo; Principle 7: diagnostics carry the remedy.
- **Storage evolution, Principle 7:** team mode configures conventions, not installed content.
- **PM composition, Interim Boundaries:** installing the planning-module strategy changes document availability only;
  conditions stay generic predicates over install answers, so a `pm.mode` change under `external-pm-composition`
  changes data, not mechanism.
- **`composable-workflows`:** install-time `arc:if` remains the binding time for variation that depends only on
  configuration.

## Neighboring flaws and their homes

Routing test (2026-10-23): an item CineXplorer's install or ordinary use would hit before its receiver can land stays
here or ships as a bounded interim; otherwise it routes.

| Flaw                                                                         | Home                                                              |
| ---------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Configurable merge baseline is machine-local (`pristine.json` is gitignored) | Interim refusal Errand; redesign in `framework-core-from-package` |
| `arc update` has no dirty-tree guard                                         | Errand, before CineXplorer's first update                         |
| Inline config migrations in `update.ts`                                      | `config-migration-registry` (P1)                                  |
| `arc init` and `arc update` additions write over existing files              | Errand; not a migration prerequisite                              |
| Deliberate takeover of a file the project edited                             | `config-migration-registry` (install migration)                   |
| Self-hosting manifest and pristine freshness                                 | `self-hosting-manifest-freshness`                                 |
| `prepack` so `npm publish` cannot ship a stale `dist/`                       | CineXplorer migration prep list (prerelease item)                 |
| Managed `.gitignore` entry-list consolidation                                | `framework-core-from-package`                                     |

The reclassification guard stays in this unit because `composable-workflows` can make methods fixed after CineXplorer's
migration and before `framework-core-from-package`, which waits on the cutover, lands.

## Coordination with other work units

Pre-routed as `USER-INBOX § Work Unit` captures on 2026-10-23; each target's next drain re-gates its entry.

- **`package-project-development-sync`:** `render:framework` writes a pending Framework Markdown copy, while other
  classes keep a hand-placed copy; its projection core becomes the general remedy for a new file of any class.
- **`storage-cutover`:** remove the projected-root install entries outright rather than relocating them within `arc/`,
  and leave the recipe's structure for this unit's rebuild.
- **`config-migration-registry`:** a deliberate takeover of an edited file is a second install-migration case beside
  `bootstrapRetiredChecks`.
- **`composable-workflows` and `customization-arch-realign`:** the claims table stays the only install-class authority;
  a fixed method lands with its own Framework claim and without its override contract, which also needs the method
  frontmatter schema (`parseMethodFrontmatter`) to stop requiring `override-active`.

## Implementation reminders

- Re-derive the fourteen unclaimed files and the claim set against the post-cutover tree before building; counts in
  the spec were taken against `main` on 2026-10-23.
- A file found under `arc/` after the cutover that must not install is a reason to move it out, not to add a
  not-installed ledger; a real case of one reopens that alternative.
- Probe scripts from the planning reviews (closure timing, hook-versus-parser link cases, the no-pristine-store merge)
  lived in a session scratchpad and are not retained; rebuild them from the spec's Testing cases.
