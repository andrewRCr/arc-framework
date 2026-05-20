# Plan: ARCd Rebrand

**Purpose:** Establish ARCd as the public product and implementation brand while preserving ARC as the methodology
and daily workflow vocabulary, with ARCd Framework covering project-as-a-whole surfaces. Asymmetric three-tier —
methodology stays ARC; implementation becomes ARCd; the containing thing reads as ARCd Framework.

- **State:** Provisional — drafted as a PRD pre-WOR, demoted to plan-doc form during WOR Phase 6.4 backlog
  migration on 2026-05-19. Portfolio-piece reframe (2026-05-03) weakened the original drivers; routing override at
  6.4.b places this in `backlog/provisional/` pending scope refresh before re-graduation.
- **Created:** 2026-04-14 (initial PRD); demoted to plan-doc 2026-05-19 (WOR PRD R51).
- **Origin:** Internal.

---

## Problem / Motivation

The framework needs a distinctive public identity before going public. The candidate namespace — `arc.dev`,
`arcframework.dev`, `arcframework.org`, and adjacent "arc" brands — is crowded with unrelated AI/dev tooling, and
the methodology name doesn't differentiate strongly in search. Shipped `.arc/` documents now contain external
links; pointing those at a personal GitHub Pages URL undermines their authority.

Under the portfolio-piece reframe (project's primary audience is employer evaluation, not product launch for
adopter acquisition), the rebrand's original drivers weaken substantially. Namespace disambiguation and brand
differentiation in crowded AI tooling space matter for product marketing; matter much less for evaluating
engineering work. "arc" reads as personal-brand authenticity (initials carryover from `arc-portfolio`) rather than
generic naming; a polished product brand on a portfolio piece can read as founder-cosplay rather than engineering
rigor.

The work merit holds independent of marketing motivation. The intellectual-clarity case for the asymmetric tier
(cleanly separating methodology from implementation, avoiding collision with the existing Kotlin "arc framework"
in the AI space) survives the reframe. The rebrand isn't pre-1.0 critical; it sits provisional until adoption
posture clarifies.

A separately-captured *methodology-positioning phrase* concern lives in `plan-docs-content-sweep.md` (item #9).
The load-bearing identity work is public-facing copy, not naming.

---

## Working Direction (settled context)

### Three-tier asymmetric brand model

- **ARC** = methodology and daily workflow vocabulary. Principles, daily practice, skills, `.arc/` workspace,
  `arc-methods.md`, `arc-extensions.md`, `.ARC.md` file suffixes, `arc.*` git config keys, `refs/notes/arc/user/`
  namespace. Reads as personal/team workflow language.
- **ARCd** = implementation and public product. CLI, binary, package, domain, `ARCd-config.yml`, docs-site
  branding, README hero, release language, anything that runs or installs. Reads as the deployed product.
- **ARCd Framework** = project-as-a-whole. The repository, public prose referring to methodology and
  implementation together. Reads as the containing thing.

The asymmetry is a feature: daily workflow surfaces keep their natural ARC shape; the public brand gets the short,
ownable ARCd form. Brand alternatives surveyed during 2026-05-03 exploratory session; none justified the rebrand
cost over the existing direction.

### What's already happened

Several originally-scoped items have been absorbed by intervening WUs:

- `arc status` → `arc health` shipped via Session-Init Optimization. The remaining work narrows to `arc health` →
  `arcd health` as part of the global binary sweep — no dedicated subtask needed.
- `pm.mode: arc-in-git` → `pm.layer: arc-pm` config rename was design-shifted by intervening planning work (Agile
  WU Lifecycle and adjacent plans). Verify the rename still applies in the same shape at refresh time.
- Other implementation-ready elements (file lists, schema-version specifics) need re-derivation against the
  post-WOR package source.

### Refresh-before-activation checklist

- Confirm `arc status` → `arc health` already absorbed; sweep narrows to `arc health` → `arcd health`.
- Verify `pm.layer: arc-pm` config rename against current shape; planning module may have evolved further.
- Verify `team.mode` → `team.enabled` rename against current config shape.
- Re-derive files-touched lists — package source surface area has shifted with intervening WUs.
- Re-verify npm publish-version specifics, schema-version-bump details.
- Re-confirm portfolio-piece reframe still applies. If adoption posture changes, the rebrand's commitment level
  changes.

The intent layer (three-tier model, content-sweep guardrails A-F, ordering constraint, zero-adoption assumption,
session-boundary mandatory stops) is durable and survives the demotion as-is — re-graduation preserves it.

---

## Scope Sketch (provisional)

Three structural rename layers, a content sweep across both copies, four session-boundary stops, and self-hosted
migration. Not committed — awaits refresh before re-graduation to PRD form.

### Layer 1 — Structural renames

- npm package `@arc-framework/cli` → `@arcd/cli`; binary `arc` → `arcd`.
- Package directory `packages/arc-framework/` → `packages/arcd/`. Template source becomes `packages/arcd/arc/`.
- Installed config file `arc-config.yml` → `ARCd-config.yml`.
- Config key renames: `pm.mode` → `pm.layer` (value `arc-in-git` → `arc-pm`); `team.mode` → `team.enabled`.
- Code-level identifier renames matching the above: `InstallConfig.pm_mode` → `pm_layer`,
  `ARC_IN_GIT_CONDITION` → `ARC_PM_CONDITION`, related token/condition keys in `buildConfigMap` / `buildTokenMap`
  / `buildConfigKeyOverrides`.
- Schema version bump in `packages/arcd/src/lib/manifest/store.ts` — no automatic migration function
  (zero-adoption assumption; no installs to migrate).

### Layer 2 — CLI command surface cleanup

- `arc health` → `arcd health` (rides the global `arc` → `arcd` binary sweep; no dedicated subtask).
- Add explicit `arcd version` subcommand alongside the existing `--version` flag. Idiomatic across developer
  tooling (`git version`, `docker version`, `kubectl version`); improves discoverability for users who guess
  `<tool> version` before `<tool> --version`.

### Layer 3 — Repository rename

- GitHub repo `andrewRCr/arc-framework` → `andrewRCr/ARCd-framework` via the GitHub UI. Mandatory session-boundary
  stop — pre-rename work completes and merges first; the rename happens manually between sessions; post-rename
  work picks up after.
- Update hardcoded references to `andrewRCr/arc-framework` in docs, scripts, READMEs, framework files (content
  sweep handles inline).
- Verify CI passes on the renamed repository before downstream work resumes.

### Layer 4 — Content sweep (unified)

Apply the three-tier naming architecture consistently across all `.arc/` documents, `packages/arcd/arc/` template
source, root-level docs (README, `contributing.md`), and any other prose surface. Sweep
`pm.mode: arc-in-git` / `(arc-in-git only)` notation to `pm.layer: arc-pm` / `(arc-pm only)` form. Use
forward-looking `docs.arcd.dev` URLs (the `docs-site-refresh` WU brings up the subdomain; brief broken-link window
is acceptable pre-public). Do not retain old `arc-framework.github.io` URLs as a transitional measure.

### Layer 5 — npm deprecation hygiene

- Publish one final `@arc-framework/cli@0.1.1` whose README points at `@arcd/cli` and whose `package.json`
  description carries a deprecation notice.
- Run `npm deprecate "@arc-framework/cli@*" "Package renamed to @arcd/cli — see github.com/andrewRCr/ARCd-framework"`
  to apply the wildcard deprecation flag.
- Zero-adoption assumption drives passive deprecation: no managed migration, no adopter communication, no
  version-bridging shims.

### Layer 6 — Self-hosted migration

Manually sync this repository's `.arc/` directory from the rebranded `packages/arcd/arc/` template source as a
one-time atomic commit. Bypass `arc update`'s three-way merge — would need simultaneous key-and-value renames for
`pm.mode: arc-in-git` → `pm.layer: arc-pm`, which serves no real adopter. Mandatory session-boundary stop; runs
last, after every other rename has landed and the package source is fully rebranded.

### Layer 7 — Canonical README relationship explanation

Author a one-or-two-sentence canonical block on the README hero explaining the ARC / ARCd / ARCd Framework
relationship. Adapted variants for the docs-site landing page, getting-started, FAQ, and `the-framework.md` follow
during the content sweep; the docs-site landing page itself is a `docs-site-refresh` WU deliverable. The README
canonical wording is the anchor commitment for this layer.

---

## Content sweep discipline (preserved guardrails)

The content sweep is the largest single task and the highest risk for introducing inconsistency. Six guardrails
for ambiguous cases:

### A. Common-noun "framework" vs. brand "ARCd Framework"

"The ARC framework for session handoff" (lowercase `framework`, common noun, ≈ "scaffolding") is legitimate and
distinct from "ARCd Framework" (capitalized brand, project-as-a-whole tier). Preserve common-noun usages.
Heuristic: if substituting "scaffolding" or "model" for "framework" still reads, it is the common noun — leave
it alone.

### B. "ARC session" / "ARC workspace" / "ARC project" stay ARC

Sessions are methodology constructs governed by methodology principles. Agent's session-init and session-handoff
output (for example, `ARC session initialized`) correctly uses ARC. Same reasoning applies to "ARC workspace"
(the `.arc/` directory is the methodology's workspace) and "ARC project" (a project following the ARC
methodology). Do not rewrite these to ARCd.

### C. "ARCd installation" vs. "ARC install" is context-sensitive

Use **ARCd installation** when emphasizing the deployed artifact or product presence ("verify your ARCd
installation," "ARCd installation verified"). Use **ARC install** when emphasizing methodology adoption ("adopting
ARC in a new project," "ARC's install footprint is `.arc/`"). Both are valid; do not mechanically rewrite one to
the other during the sweep.

### D. CLI output chrome is ARCd; methodology-teaching output is ARC

Startup banners, version output, `arcd health` diagnostic summaries, and success / error messages emitted by the
`arcd` binary are product chrome → ARCd tier. Output that teaches or enforces methodology conventions (pre-commit
hook messages about task numbering, contributor protected paths, commit format) stays ARC. Heuristic: "Is the
CLI introducing itself (→ ARCd) or introducing ARC (→ ARC)?"

### E. AGENT-BRIEF content drift sweep target

`AGENT-BRIEF.ARC.md` currently contains "The ARC Framework implements this methodology as markdown documents and
git hooks..." — project-as-a-whole tier, should become "The ARCd Framework implements...". The file's `.ARC.md`
suffix stays (tier marker); only internal prose sweeps. Both `AGENT-BRIEF.ARC.md` and `AGENT-BRIEF.PROJECT.md`
need a careful read-through for tier-correct prose.

### F. Git hook messages — methodology enforcement stays ARC; install / product state messages are ARCd

A hook enforcing commit format or task numbering says "ARC." A hook checking `ARCd-config.yml` presence or
framework-file sync says "ARCd." Most existing hooks are methodology enforcement; the framework-file-sync warning
is the notable ARCd-tier case.

---

## Technical Considerations

### Session-boundary mandatory stops

Four operations cannot cross session boundaries without breaking in-flight work or confusing review. Each becomes
an explicit stop in the eventual task list with a clean commit before the stop:

1. **GitHub repository rename.** The local clone's `origin` URL becomes stale the moment the rename executes on
   GitHub; any in-flight fetch / push / PR-creation operation breaks. Flow: complete pre-rename work → merge the
   rebrand PR → session handoff → manual GitHub UI rename → new session resumes with
   `git remote set-url origin git@github.com:andrewRCr/ARCd-framework.git`, stale reference cleanup, CI
   verification, and GitHub Pages wiring check.
2. **`@arcd/cli` npm publish.** External side-effect, irreversible version publish. Separate commit covering
   publish-time `package.json` / `publishConfig` changes; clean commit boundary before the publish command runs.
3. **`@arc-framework/cli@0.1.1` deprecation publish.** Sequenced after `@arcd/cli` is live and has been
   smoke-tested from a clean install. Separate commit, separate publish step, then the `npm deprecate` wildcard
   flag.
4. **Self-hosted `.arc/` migration.** Runs last, after every other rename has landed and the package source is
   fully rebranded. Atomic commit touching only the `.arc/` directory (plus updated manifest). Separate session
   recommended to ensure the rebranded package source is stable before the self-migration consumes it.

### Schema version bump

The manifest schema version in `packages/arcd/src/lib/manifest/store.ts` would bump to reflect the rebrand-era
schema. Increment `MANIFEST_SCHEMA_VERSION`, register the new version in the migration map **without** an
automatic migration function. A v0 → v1 migration already exists for pre-schema manifests; the new version has no
migration path because no pre-rebrand installs exist to migrate. Adopters installing post-rebrand start fresh at
the new version. If real adopters later need pre-rebrand compatibility, the migration can be added retroactively.

### Zero-adoption assumption

The rebrand assumes zero external adoption of `@arc-framework/cli@0.1.0`. This drives several scope decisions: no
managed migration, no adopter communication, no upgrade path, no scrubbing of deprecated artifacts. If the
assumption is wrong (a real downstream user exists), the worst case is that user sees a deprecation warning on
`npm install` and follows the redirect to `@arcd/cli`. Passive deprecation serves this case adequately without
requiring any active work.

### Two-copy discipline for framework files

This repository has two copies of ARC framework content: authoritative package source at `packages/arcd/arc/`
(after the package rename) and installed instance at `.arc/`. Methodology edits go through the package source and
sync to `.arc/` via `arc update`. The content sweep must update both copies in the same commit wherever a
framework file is affected. The pre-commit hook warning for unsynced framework files must not be disabled
throughout the sweep.

### Ordering constraint — structural renames before content sweep

The content sweep operates on filenames and in-file prose. Running it before the structural renames (package
directory, config file, command files) would require re-sweeping after the renames land. Order: structural
renames first (atomic commits each), then unified content sweep as a single coherent commit, then npm publishes,
then repo rename, then self-hosted migration. Eventual task list at PRD-graduation reflects this ordering.

---

## Indicative completion signals (provisional)

Not commitment criteria — signals worth checking at PRD-graduation, when the scope is locked in:

- **npm distribution:** `@arcd/cli` installable from a clean machine via `npm install -g @arcd/cli`.
  `@arc-framework/cli@0.1.1` published with deprecation notice in its README and `package.json` description.
  `npm deprecate` applied to wildcard `@arc-framework/cli@*`.
- **Binary + subcommands:** `arcd --version`, `arcd version`, `arcd init`, `arcd join`, `arcd update`,
  `arcd health`, `arcd sync`, `arcd user save|load|push|pull`, `arcd log --atomic` all work. Old `arc status`
  command returns Commander's default unknown-command handling.
- **Repository rename:** GitHub repo is `andrewRCr/ARCd-framework`; CI passes on renamed repo; local clone's
  `origin` URL points at new name; zero stale references to `andrewRCr/arc-framework` in tracked files.
- **Config file + schema:** installed config is `ARCd-config.yml` using `pm.layer: arc-pm` and
  `team.enabled: false`/`true`; manifest schema version bumped; self-hosted install works end-to-end (`arcd
  health` reads renamed config; git hooks parse renamed keys; no runtime errors).
- **Content sweep:** zero references to `arc-framework` brand, `@arc-framework/cli`, "ARC Framework" (capitalized
  brand phrase) in tracked files, except (a) `packages/arcd/changelog/` historical entries, (b) the deprecated
  package's final README and description, (c) intentional document-history rows recording the rename. Zero
  `arc-in-git` config values, zero `pm.mode` / `team.mode` config keys in active content. "ARCd Framework"
  appears in prose where project-as-a-whole framing applies. Three-tier naming model documented in at least one
  place in installed framework content. `docs/**` excepted (the `docs-site-refresh` WU deletes `docs/` as part of
  its content port; brand sweep happens inline during port to avoid double-work).
- **Quality gates:** full Tier 3 clean (`lint:md`, `lint:ts`, `lint:sh`, `typecheck`, `typecheck:test`, `test`,
  `build`).
- **Two-copy discipline:** `.arc/` and `packages/arcd/arc/` in sync at final commit (no framework-file-sync
  warnings from the pre-commit hook).
- **Downstream unblock:** Operating Modes WU and `docs-site-refresh` WU operate on post-rebrand namespace
  without residual rename churn.

---

## Out of Scope (preserved exclusions)

- **Docs-site migration.** Starlight scaffold, content port, landing page authoring, Cloudflare Pages deploy, DNS
  cutover, mkdocs toolchain removal — `docs-site-refresh` WU scope. This work would only use forward-looking
  `docs.arcd.dev` URLs in the content sweep; it does not stand up the subdomain.
- **Adopter upgrade path.** No three-way merge migration for `pm.mode: arc-in-git` → `pm.layer: arc-pm`. No
  managed migration tooling, no version-bridging shims. Pre-rebrand adopters (none) are not served.
- **Adopter communication.** No changelog for the rename, no release notes, no blog post, no social announcement.
  Deprecated package gets passive npm `deprecate` flag and a README pointer; that's the entirety of outbound
  communication. Scope is pre-public hygiene, not a managed rebrand event.
- **Scrubbing npm history.** Deprecated `@arc-framework/cli@0.1.0` and `@0.1.1` versions stay published
  indefinitely. npm discourages unpublishing; pre-public framing makes scrubbing unnecessary.
- **Git notes namespace migration.** `refs/notes/arc/user/` stays. Per-methodology session-state mechanism; no
  rename needed.
- **File suffix migration.** `.ARC.md` stays as methodology-tier marker on DEV-RULES.ARC.md, AGENT-BRIEF.ARC.md,
  etc. Suffix capitalization already matches brand conventions; only internal prose sweeps.
- **Skill name migration.** `arc-resume`, `arc-commit`, `arc-handoff`, `arc-verify`, `arc-plan`, `arc-task-audit`,
  `arc-task-review` stay as-is. Skills are daily workflow triggers; read as "do this the ARC way"; benefit from
  simplicity over display-brand fidelity.
- **Repository organization move.** The repo stays under the personal profile (`andrewRCr/ARCd-framework`), not
  the `arcd-framework` GitHub org. The org exists for brand protection only.
- **Camelcase or lowercase repo name variants.** `ARCdFramework` and `arcd-framework` (lowercase) rejected. See
  the notes companion for rationale.

---

## Open Questions

### At refresh / re-graduation

- **Has portfolio-piece reframe shifted?** If adoption posture is now different, the rebrand's commitment level
  may change. Verify before re-graduating.
- **Exact published `@arcd/cli` version number.** Publish `@arcd/cli@0.1.0` (same version, new package identity —
  cleanest match to intent) or `@arcd/cli@0.1.1` (distinct publish event; bumps past now-deprecated
  `@arc-framework/cli@0.1.1`)? Lean: `0.1.0`. Decide at publish step.
- **Historical changelog entries.** Existing entries in `packages/arc-framework/changelog/` describe pre-rebrand
  shipments. Leave as-is (historical accuracy), or sweep brand references inside historical entries
  (consistency)? Lean: leave as-is. Historical accuracy wins over retroactive rebranding.
- **Canonical README relationship wording.** Exact phrasing is an authoring call during the sweep itself.

No blockers identified beyond the refresh trigger.

---

## Sequencing

**Provisional.** Pending portfolio-piece scope refresh. Original sequencing placed this between WOR ship and the
parallelism trio; under provisional routing at 6.4.b, sequencing decision defers until re-graduation.

If re-graduated:

- **Upstream:** Work Organization Reform (settled meta-file shape and lifecycle convention; no rename churn
  during rebrand sweep). Session-Init Optimization, Session-Operational Flow, User Sync UX Polish, Interlock
  Release Wrappers — shipped predecessor work whose terminology surfaces would all absorb in the rebrand pass.
- **Downstream:** Docs Site Refresh (consumes post-rebrand vocabulary in landing-page authoring, template port).
  Operating Modes (consumes post-rebrand namespace; mode-specific documentation references). Any post-rebrand WU.

---

## Document History

| Date       | Change                                                                                   |
| ---------- | ---------------------------------------------------------------------------------------- |
| 2026-04-14 | Initial draft (as PRD)                                                                   |
| 2026-05-03 | Demoted from active execution-ready to stale-spec form per portfolio-piece reframe       |
| 2026-05-19 | Demoted from PRD to plan-doc during WOR Phase 6.4 backlog migration; provisional routing |
