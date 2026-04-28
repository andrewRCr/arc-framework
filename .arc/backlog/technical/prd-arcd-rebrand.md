# PRD: ARCd Rebrand

- **Type:** Technical
- **Updated:** 2026-04-22

---

## Introduction

The ARC Framework needs a distinctive public identity before it goes public. The candidate namespace — `arc.dev`,
`arcframework.dev`, `arcframework.org`, and adjacent "arc" brands — is crowded with unrelated AI/dev tooling,
and the methodology name doesn't differentiate strongly in search. Shipped `.arc/` documents now contain external
links, and pointing those at a personal GitHub Pages URL undermines their authority.

This work establishes **ARCd** as the public product and implementation brand while preserving **ARC** as the
methodology and daily workflow vocabulary, with **ARCd Framework** covering project-as-a-whole surfaces (the
repository, public prose referring to methodology and implementation together). The split is intentionally
asymmetric: the asymmetry is a feature, not a compromise artifact, because it lets the daily workflow surfaces
keep their natural, elegant ARC shape while the public brand gets the short, ownable ARCd form for anything that
runs, installs, or represents the project externally. Full exploration history, alternatives considered, and the
"why this direction wins" argument live in `plan-arcd-rebrand.md` alongside this PRD.

**Why now:** Methodology Maturation shipped via PR #16 (2026-04-14), so the content-sweep interleave risk that
previously blocked the rebrand is gone. Downstream work units (Operating Modes, Expanded Planning Path, Public
Release) all depend on settled naming — running after them would require sweeping the same files twice. Running
before them absorbs the churn once, and the public release can ship with a coherent name from day one.

## Goals

- Establish ARCd as the public product and implementation brand via `arcd.dev`, `@arcd/cli`, the `arcd` binary,
  and branded docs/README surfaces.
- Preserve the ARC methodology identity in daily workflow surfaces — `.arc/` directory, `arc-*` skills, `.ARC.md`
  file suffixes, `arc-methods.md`, `arc-extensions.md`, `arc.*` git config keys, `refs/notes/arc/user/` namespace.
- Introduce `ARCd-config.yml` as the explicit implementation seam inside the installed system, anchoring the
  ARCd brand post-install without forcing a full lowercase migration across every operational surface.
- Absorb Operating Modes WU's config-key renames (`pm.mode` → `pm.layer`, `team.mode` → `team.enabled`, value
  `arc-in-git` → `arc-pm`) in the same editorial pass so the content sweep runs once.
- Absorb Operating Modes WU's CLI command cleanup (explicit `arcd version` subcommand; the `arc status` →
  `arc health` rename was pulled forward into the Session-Init Optimization WU — see § CLI command surface
  cleanup below. The follow-on `arc health` → `arcd health` rename is absorbed into this WU's global `arc` →
  `arcd` binary sweep, not a dedicated subtask).
- Deprecate `@arc-framework/cli` on npm hygienically without investing in a managed migration path. Zero adoption
  is assumed; passive deprecation is the entire outbound surface.
- Complete the self-hosted `.arc/` migration by hand from the rebranded package source, bypassing `arc update`'s
  three-way merge (no other installs exist to serve).
- Leave downstream work units (Operating Modes, Public Release, and the `prd-arcd-docs-site` follow-up)
  operating on the post-rebrand namespace with no residual churn.

## System Scenarios

**Scenario 1: Fresh install on a new machine after the rebrand.**

A developer runs `npm install -g @arcd/cli`, then `arcd init` in a new project. The CLI prompts them through
adoption profile selection, creates `.arc/` with `ARCd-config.yml`, installs agent briefings and framework files.
No `arc-framework` references appear in the installed output; the install feels like a native ARCd product
experience from start to finish.

**Scenario 2: Self-hosted `.arc/` migration on this repository.**

After all structural renames land in `packages/arcd/` and the framework source is fully rebranded, this
repository's own `.arc/` directory is migrated manually as a single atomic commit: `arc-config.yml` renamed to
`ARCd-config.yml`, config keys rewritten (`pm.layer: arc-pm`, `team.enabled: false`), content sweep applied,
framework-file manifest regenerated. The commit is reviewable as a coherent whole and lands as the final work of
the WU.

**Scenario 3: Stray stumbler on the deprecated npm package.**

Someone searching npm for "arc" or landing on the old `@arc-framework/cli` package page sees a deprecation notice
pointing at `@arcd/cli` and the renamed repository. Running `npm install @arc-framework/cli` still works but
emits a deprecation warning. No active communication is sent; the deprecation hygiene is passive and costless.

**Scenario 4: Repository rename on GitHub.**

The repo rename from `andrewRCr/arc-framework` to `andrewRCr/ARCd-framework` is a hard session boundary: all
pre-rename code and doc work merges into main; a separate session performs the GitHub UI rename, updates the
local remote URL, cleans up stale references, and verifies CI on the renamed repo. In-flight operations cannot
cross this boundary without breaking.

## Requirements

### P0 — Must-have

**Package and CLI rename:**

1. Rename the CLI npm package from `@arc-framework/cli` to `@arcd/cli`. Package version stays on the current
   `v0.1.x` line — no increment on the rename itself.
2. Rename the CLI binary from `arc` to `arcd`. All subcommands invoked as `arcd <command>`.
3. Publish `@arcd/cli` as the renamed package. First published version under the new name re-publishes the
   current v0.1.x number under the new scope and binary identity.
4. Publish one final `@arc-framework/cli@0.1.1` release whose README points at `@arcd/cli` and whose
   `package.json` description carries a deprecation notice.
5. After the deprecation release lands, run `npm deprecate "@arc-framework/cli@*" "Package renamed to @arcd/cli —
   see github.com/andrewRCr/ARCd-framework"` to apply the wildcard deprecation flag.
6. Rename the package directory `packages/arc-framework/` to `packages/arcd/`. The template source path becomes
   `packages/arcd/arc/` — the inner `arc/` segment preserves the methodology tier marker inside the
   implementation container.

**Config seam and schema renames:**

7. Rename the installed config file from `arc-config.yml` to `ARCd-config.yml` — the explicit implementation
   seam inside the installed system.
8. Rename config key `pm.mode` to `pm.layer`. Value `arc-in-git` renames to `arc-pm`.
9. Rename config key `team.mode` to `team.enabled`.
10. Bump the framework-file manifest schema version in `packages/arcd/src/lib/manifest/store.ts` to reflect the
    rebrand-era schema. Do **not** implement an automatic migration step for pre-rebrand installs — no such
    installs exist to migrate. Pre-rebrand adopters (none) get no upgrade path.
11. Update code-level identifiers that reference the old key/value names: `InstallConfig.pm_mode` → `pm_layer`,
    `InstallConfig.team_mode` → `team_enabled`, `ARC_IN_GIT_CONDITION` → `ARC_PM_CONDITION` in
    `lib/constants.ts`, and any related token/condition keys in `buildConfigMap` / `buildTokenMap` /
    `buildConfigKeyOverrides`.
12. Update `init-recipe.json` prompt `config_key` entries to match the new key names and values.
13. Update githooks shell scripts that parse the config file to read from `ARCd-config.yml` using the new key
    names.

**CLI command surface cleanup:**

> **Scope note (2026-04-22):** The `arc status` → `arc health` rename originally scoped here (R14 + R16) was
> pulled forward into the Session-Init Optimization WU. That WU introduced a composite `arc status` probe that
> needed the `arc status` name freed, and the rename's underlying motivation (the `/arc-status` skill collision
> plus "status-command should mean work state, not install health" semantic hygiene) belongs with session-init
> orientation work, not with the binary rebrand. As a result:
>
> - **R14 and R16 are already partially satisfied** when this WU activates. The backing file is
>   `src/commands/health.ts`; the exposed command is `arc health`.
> - **This WU's remaining R14/R16 work** reduces to sweeping `arc health` → `arcd health` as part of the
>   global `arc` → `arcd` binary rename (already covered by Phase 1/2 package-rename work; no dedicated
>   subtasks needed).
> - **R15 remains fully scoped here** (the explicit `arcd version` subcommand was not pulled forward — it's
>   rebrand-era idiom alignment).
> - **Composite `arc status` expansion slot:** SIO shipped a composite that invokes the individual probe
>   helpers via `Promise.all`. Future probes (e.g., `arc hooks status`) slot into the composite without
>   workflow-prose changes. In the post-rebrand world, this becomes `arcd status` via the global sweep —
>   no special handling required.

14. `arc status` (install health) → `arcd health`. **Pre-rebrand state:** the rename has already been
    completed in SIO (`arc status` → `arc health`). This WU's responsibility narrows to absorbing
    `arc health` → `arcd health` as part of the global `arc` → `arcd` binary sweep.
15. Add an explicit `arcd version` subcommand alongside the existing `--version` flag. Idiomatic across
    developer tooling (`git version`, `docker version`, `kubectl version`) and improves discoverability for
    users who guess `<tool> version` before `<tool> --version`.
16. Backing handler file location. **Pre-rebrand state:** `src/commands/health.ts` exists (renamed in SIO from
    `status.ts`). This WU's responsibility is the package-directory sweep (`packages/arc-framework/` →
    `packages/arcd/`), which moves the file to `packages/arcd/src/commands/health.ts` — no file-level
    rename beyond the package sweep.

**Repository rename:**

17. Rename the GitHub repository `andrewRCr/arc-framework` to `andrewRCr/ARCd-framework` via the GitHub UI.
    This is a **mandatory session-boundary stop** — pre-rename work completes and merges first; the rename
    happens manually between sessions; post-rename work (local remote URL update, stale reference cleanup, CI
    verification) happens in the resumed session.
18. Update all hardcoded references to `andrewRCr/arc-framework` in docs, scripts, READMEs, and framework files
    to point at `andrewRCr/ARCd-framework`. The content sweep handles this alongside the brand sweep.
19. Verify CI passes on the renamed repository before any downstream work resumes.

**Content sweep (unified public/internal language audit):**

20. Apply the three-tier naming architecture (ARC / ARCd / ARCd Framework) consistently across all `.arc/`
    documents, `packages/arcd/arc/` template source, root-level docs (README, `contributing.md`, etc.), and any
    other prose surface. Tier rules:

    - **ARC** = methodology and workflow vocabulary: principles, daily practice, skills, `.arc/` workspace,
      `arc-methods.md`, `arc-extensions.md`, `.ARC.md` file suffixes, `arc.*` git config keys,
      `refs/notes/arc/user/` namespace.
    - **ARCd** = implementation and public product: CLI, binary, package, domain, `ARCd-config.yml`, docs-site
      branding, README hero, release language, anything that runs or installs.
    - **ARCd Framework** = project-as-a-whole containing thing: the repository name, and public prose that
      refers to the whole project (methodology + implementation together).

21. Sweep references to the old `pm.mode: arc-in-git` / `(arc-in-git only)` notation and replace with the new
    `pm.layer: arc-pm` / `(arc-pm only)` form.
22. Use forward-looking `docs.arcd.dev` URLs in the content sweep even though the subdomain is not yet live
    (the `prd-arcd-docs-site` follow-up brings it up). A brief broken-link window is acceptable pre-public.
    Do not retain old `arc-framework.github.io` URLs as a transitional measure.

**Self-hosted migration:**

23. Manually sync this repository's `.arc/` directory from the rebranded `packages/arcd/arc/` template source as
    a one-time operation. This is a **mandatory session-boundary stop** — it runs last, after every other
    rename has landed and the package source is fully rebranded. Single atomic commit.
24. Bypass `arc update`'s three-way merge for the self-migration. Three-way merge would need to learn
    simultaneous key-and-value renames for the `pm.mode: arc-in-git` → `pm.layer: arc-pm` transition; teaching
    it is out of scope and serves no real adopter.

### P1 — Should-have

25. Capture the canonical ARC / ARCd / ARCd Framework relationship explanation on the README hero as a brief
    block (one or two sentences). Adapted variants for the docs-site landing page, getting-started, FAQ, and
    `the-framework.md` also update during the content sweep; the docs-site landing page itself is a
    `prd-arcd-docs-site` deliverable. The README canonical wording is the P1 anchor for this work unit.
26. Verify the framework-file-sync pre-commit hook continues to function across the package-directory rename.
    If the hook has hardcoded `packages/arc-framework/` paths, update them to `packages/arcd/`.

### P2 — Nice-to-have

27. Add a one-line comment block at the top of `ARCd-config.yml` identifying the file as "ARCd installation
    config — see `arc-methods.md` for behavioral overrides." Helps first-time readers navigate the tier split
    without having to read the full naming strategy.

## Non-Goals

This PRD explicitly does **not** cover:

- **Docs-site migration.** Starlight scaffold, content port, landing page authoring, Cloudflare Pages deploy,
  DNS cutover, and mkdocs toolchain removal are the `prd-arcd-docs-site` follow-up. This work unit only uses
  forward-looking `docs.arcd.dev` URLs in the content sweep; it does not stand up the subdomain.
- **Adopter upgrade path.** No three-way merge migration for `pm.mode: arc-in-git` → `pm.layer: arc-pm`. No
  managed migration tooling, no version-bridging shims. Pre-rebrand adopters (none) are not served by this work.
- **Adopter communication.** No changelog for the rename, no release notes, no blog post, no social
  announcement. The deprecated package gets a passive npm `deprecate` flag and a README pointer; that is the
  entirety of outbound communication. Scope is pre-public hygiene, not a managed rebrand event.
- **Scrubbing npm history.** The deprecated `@arc-framework/cli@0.1.0` and `@0.1.1` versions stay published
  indefinitely. npm explicitly discourages unpublishing, and the pre-public framing makes scrubbing unnecessary.
- **Git notes namespace migration.** `refs/notes/arc/user/` stays. The namespace is per ARC methodology's
  session-state mechanism (methodology tier) and needs no rename.
- **File suffix migration.** `.ARC.md` stays as the methodology-tier marker on DEV-RULES.ARC.md,
  AGENT-BRIEFING.ARC.md, and similar. The suffix's capitalization already matches brand conventions; only the
  internal prose content sweeps.
- **Skill name migration.** `arc-resume`, `arc-commit`, `arc-handoff`, `arc-verify`, `arc-plan`,
  `arc-task-audit`, and `arc-task-review` stay as-is. Skills are daily workflow triggers, read as "do this the
  ARC way," and benefit from simplicity over display-brand fidelity.
- **Repository organization move.** The repo stays under the personal profile (`andrewRCr/ARCd-framework`), not
  the `arcd-framework` GitHub org. The org exists for brand protection only.
- **Camelcase or lowercase repo name variants.** `ARCdFramework` and `arcd-framework` (lowercase) are rejected.
  See `plan-arcd-rebrand.md` § Project-as-a-whole for the rationale.

## Technical Considerations

### Session-boundary mandatory stops

Four operations cannot cross session boundaries without breaking in-flight work or confusing review. Each is an
explicit stop in the task list with a clean commit before the stop:

1. **GitHub repository rename.** The local clone's `origin` URL becomes stale the moment the rename executes on
   GitHub; any in-flight fetch / push / PR-creation operation breaks. Flow: complete all pre-rename code and
   doc work → merge the rebrand PR to main via the planning branch integration flow → session handoff →
   manual GitHub UI rename → new session resumes with
   `git remote set-url origin git@github.com:andrewRCr/ARCd-framework.git`, stale reference cleanup, CI
   verification, and GitHub Pages wiring check (existing old-docs Pages deploy may still be wired; the
   `prd-arcd-docs-site` follow-up tears it down, and this work unit only verifies it does not break CI in
   the transitional state).
2. **`@arcd/cli` npm publish.** External side-effect, irreversible version publish. Separate commit covering
   publish-time `package.json` / `publishConfig` changes, and at minimum a clean commit boundary before the
   publish command runs.
3. **`@arc-framework/cli@0.1.1` deprecation publish.** Sequenced after `@arcd/cli` is live and has been
   smoke-tested from a clean install. Separate commit, separate publish step, then the `npm deprecate`
   wildcard flag.
4. **Self-hosted `.arc/` migration.** Runs last, after every other rename has landed and the package source is
   fully rebranded. Atomic commit touching only the `.arc/` directory (plus updated manifest). Separate session
   recommended to ensure the rebranded package source is stable before the self-migration consumes it.

### Content sweep discipline

The content sweep is the largest single task and the highest risk for introducing inconsistency. Explicit
guardrails for ambiguous cases:

- **A. Common-noun "framework" vs. brand "ARCd Framework."** "The ARC framework for session handoff"
  (lowercase `framework`, common noun, ≈ "scaffolding") is legitimate and distinct from "ARCd Framework"
  (capitalized brand, project-as-a-whole tier). Preserve common-noun usages. Heuristic: if substituting
  "scaffolding" or "model" for "framework" still reads, it is the common noun — leave it alone.
- **B. "ARC session" / "ARC workspace" / "ARC project" stay ARC.** Sessions are methodology constructs
  governed by P5 (Context Preservation). The agent's session-init and session-handoff output (for example,
  `ARC session initialized`) correctly uses ARC. Same reasoning applies to "ARC workspace" (the `.arc/`
  directory is the methodology's workspace) and "ARC project" (a project following the ARC methodology). Do
  not rewrite these to ARCd.
- **C. "ARCd installation" vs. "ARC install" is context-sensitive.** Use **ARCd installation** when
  emphasizing the deployed artifact or product presence ("verify your ARCd installation," "ARCd installation
  verified"). Use **ARC install** when emphasizing methodology adoption ("adopting ARC in a new project," "ARC's
  install footprint is `.arc/`"). Both are valid; do not mechanically rewrite one to the other during the
  sweep.
- **D. CLI output chrome is ARCd; methodology-teaching output is ARC.** Startup banners, version output,
  `arcd health` diagnostic summaries, and success / error messages emitted by the `arcd` binary are product
  chrome → ARCd tier. Output that teaches or enforces methodology conventions (pre-commit hook messages about
  task numbering, contributor protected paths, commit format) stays ARC. Heuristic: "Is the CLI introducing
  itself (→ ARCd) or introducing ARC (→ ARC)?"
- **E. AGENT-BRIEFING content drift sweep target.** `AGENT-BRIEFING.ARC.md` currently contains *"The ARC
  Framework implements this methodology as markdown documents and git hooks..."* — project-as-a-whole tier,
  should become *"The ARCd Framework implements..."*. The file's `.ARC.md` suffix stays (tier marker); only
  internal prose sweeps. Both `AGENT-BRIEFING.ARC.md` and `AGENT-BRIEFING.PROJECT.md` need a careful
  read-through for tier-correct prose.
- **F. Git hook messages: methodology enforcement stays ARC; install / product state messages are ARCd.** A
  hook enforcing commit format or task numbering says "ARC." A hook checking `ARCd-config.yml` presence or
  framework-file sync says "ARCd." Most existing hooks are methodology enforcement; the framework-file-sync
  warning is the notable ARCd-tier case.

### Files touched (indicative)

Not exhaustive — the content sweep will discover additional surfaces — but these are known to require changes:

- **Package rename:** `packages/arc-framework/` → `packages/arcd/` (directory move). Root `package.json`
  workspaces pattern update.
- **Config schema (CLI source):** `packages/arcd/src/lib/types.ts` (`InstallConfig` field renames),
  `packages/arcd/src/lib/config.ts` (`buildConfigMap` / `buildTokenMap` / `buildConfigKeyOverrides`),
  `packages/arcd/src/lib/constants.ts` (`ARC_IN_GIT_CONDITION` → `ARC_PM_CONDITION`),
  `packages/arcd/src/lib/manifest/store.ts` (schema version bump),
  `packages/arcd/init-recipe.json` (prompt `config_key` entries),
  `packages/arcd/arc/system/arc-config.yml` → `packages/arcd/arc/system/ARCd-config.yml` (template source).
- **CLI command rename:** `packages/arcd/src/cli.ts` (binary name, subcommand registration),
  `packages/arcd/src/commands/status.ts` → `health.ts`, `packages/arcd/src/handlers/lifecycle.ts`, and test
  files covering `status` / `health` and `version`.
- **Githooks:** All shell scripts under `.arc/system/githooks/` and `packages/arcd/arc/system/githooks/` that
  read config keys by line-grep. Specifically: any `grep 'pm.mode'` becomes `grep 'pm.layer'`,
  `grep 'team.mode'` becomes `grep 'team.enabled'`, `grep 'arc-config.yml'` becomes `grep 'ARCd-config.yml'`.
- **`.arc/` content sweep:** `reference/constitution/`, `reference/strategies/`, `reference/templates/`,
  `system/workflows/`, `system/agent/`, `backlog/` (including this PRD and its sibling `prd-arcd-docs-site`
  when it lands), and README files throughout `.arc/`. Also `packages/arcd/arc/` template source — two-copy
  discipline requires both.
- **Strategy documents with `pm.mode` references:** `strategy-planning-module.md` (multiple),
  `strategy-configurability-architecture.md`, `strategy-file-classification.md`, `strategy-team-coordination.md`
  — all sweep targets.
- **Root-level docs:** `README.md`, `contributing.md`, `.github/` directory (issue / PR templates, workflow
  YAML), and any other repo-root references to the old brand.
- **Package README:** `packages/arcd/README.md` — CLI-facing README, ARCd branding throughout.
- **Changelog:** `packages/arcd/changelog/` — existing entries are historical and left as-is (they describe
  what was shipped at the time). New entries reference the new name.

### Schema version bump

The manifest schema version in `packages/arcd/src/lib/manifest/store.ts` bumps to reflect the rebrand-era
schema. Implementation: increment `MANIFEST_SCHEMA_VERSION`, register the new version in the migration map
**without** an automatic migration function. A v0 → v1 migration already exists for pre-schema manifests; the
new version has no migration path because no pre-rebrand installs exist to migrate. Adopters installing
post-rebrand start fresh at the new version. If real adopters later need pre-rebrand compatibility, the
migration can be added retroactively — but that work is out of scope for this work unit.

### Zero-adoption assumption

The rebrand assumes zero external adoption of `@arc-framework/cli@0.1.0`. This assumption drives several scope
decisions: no managed migration, no adopter communication, no upgrade path, no scrubbing of deprecated
artifacts. If the assumption is wrong (a real downstream user exists), the worst case is that user sees a
deprecation warning on `npm install` and follows the redirect to `@arcd/cli`. The passive deprecation path
serves this case adequately without requiring any active work.

### Two-copy discipline for framework files

This repository has two copies of ARC framework content: the authoritative package source at
`packages/arcd/arc/` (after the package rename) and the installed instance at `.arc/`. Methodology edits go
through the package source and sync to `.arc/` via `arc update`. The rebrand's content sweep must update both
copies in the same commit wherever a framework file is affected. A pre-commit hook warns when framework files
are edited in `.arc/` without the package counterpart staged — this hook's protection remains valuable
throughout the sweep and must not be disabled.

### Ordering constraint: structural renames before content sweep

The content sweep operates on filenames and in-file prose. Running it before the structural renames (package
directory, config file, command files) would require re-sweeping after the renames land. Ordering: structural
renames first (atomic commits for each), then the unified content sweep as a single coherent commit, then the
npm publishes, then the repo rename, then the self-hosted migration. Task list structure reflects this ordering.

## Success Criteria

This work is complete when **all** of the following hold:

- **npm distribution:** `@arcd/cli` is published and installable from a clean machine via
  `npm install -g @arcd/cli`. `@arc-framework/cli@0.1.1` is published with the deprecation notice in its
  README and `package.json` description. `npm deprecate` has been applied to the wildcard `@arc-framework/cli@*`.
- **Binary and subcommand surface:** The installed binary is `arcd`. `arcd --version`, `arcd version`,
  `arcd init`, `arcd join`, `arcd update`, `arcd health`, `arcd sync`, `arcd user save|load|push|pull`, and
  `arcd log --atomic` all work. The old `arc status` command no longer exists — running it returns Commander's
  default unknown-command handling.
- **Repository rename:** The GitHub repository is `andrewRCr/ARCd-framework`. CI passes on the renamed
  repository. The local clone's `origin` URL points at the new name. Stale references to
  `andrewRCr/arc-framework` in tracked files are zero (verified by grep).
- **Config file and schema:** The installed config file is `ARCd-config.yml`. It uses `pm.layer: arc-pm` and
  `team.enabled: false` (or `true`) — not the old key / value names. The manifest schema version has been
  bumped. The self-hosted install works end-to-end: `arcd health` reads the renamed config, git hooks parse the
  renamed keys, and no runtime errors surface.
- **Content sweep:**
    - **`docs/**` is excepted from all content sweep criteria below.** The `prd-arcd-docs-site` follow-up
      deletes `docs/` as part of its content port and handles the brand sweep inline during the port,
      avoiding double-work on files scheduled for deletion.
    - Zero references to the `arc-framework` brand, `@arc-framework/cli`, or "ARC Framework" (capitalized, as
      a brand phrase) in tracked files, except in (a) `packages/arcd/changelog/` historical entries, (b) the
      deprecated package's final README and description, (c) intentional references in document-history rows
      that record the rename event itself.
    - Zero references to `arc-in-git` as a config value, except in (a) migration guidance explaining the
      old-to-new rename, if any, (b) historical changelog entries.
    - Zero references to `pm.mode` or `team.mode` as config keys in active content.
    - "ARCd Framework" appears in prose where project-as-a-whole framing applies (README hero,
      `contributing.md` intro, getting-started overview). The docs-site landing page — also a tier-project
      surface — is a `prd-arcd-docs-site` deliverable.
    - The three-tier naming model is documented in at least one place in the installed framework content for
      future reference.
- **Quality gates:** `npm run -s lint:md`, `npm run lint:ts`, `npm run lint:sh`, `npm run typecheck`,
  `npm run typecheck:test`, `npm test`, and `npm run build` all pass. No markdownlint violations across the
  content sweep.
- **Two-copy discipline:** `.arc/` and `packages/arcd/arc/` remain in sync throughout. No framework-file-sync
  warnings from the pre-commit hook at the final commit.
- **Downstream unblock:** The Operating Modes WU can begin work against the post-rebrand namespace without
  additional rename churn.

## Open Questions

**Resolve during work:**

- **Exact published `@arcd/cli` version number.** The plan says "stay on the current v0.1.x line." Concrete
  options: publish `@arcd/cli@0.1.0` (same version, new package identity — cleanest match to plan intent) or
  `@arcd/cli@0.1.1` (distinct publish event, bumps past the now-deprecated `@arc-framework/cli@0.1.1`). Decide
  at the publish step. Lean: `0.1.0`.
- **Historical changelog entries.** Existing entries in `packages/arc-framework/changelog/` describe pre-rebrand
  shipments. Leave as-is (historical accuracy), or sweep the brand references inside historical entries
  (consistency)? Lean: leave as-is. Historical accuracy wins over retroactive rebranding.
- **Canonical README relationship wording.** The P1 requirement is to author a canonical one-or-two-sentence
  relationship explanation on the README hero. Exact phrasing is an authoring call during the sweep itself.

No blockers identified.

## Document History

| Date       | Change        |
| ---------- | ------------- |
| 2026-04-14 | Initial draft |
