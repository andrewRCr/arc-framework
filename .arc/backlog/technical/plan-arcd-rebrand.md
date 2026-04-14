# Plan: ARCd Rebrand

**Purpose:** Establish ARCd as the public product brand while preserving ARC as the methodology
and day-to-day workflow vocabulary where that remains the clearest fit. This document captures the
problem, alternatives considered, the chosen naming boundary, and the implementation scope.

**Status:** Draft (direction settled; scope expanded 2026-04-09, 2026-04-11, and 2026-04-14
to absorb related config cleanup from Operating Modes WU, capture three-tier naming rationale,
resolve decisions previously flagged as open, and add npm deprecation, self-migration, and
docs-site dimensions)
**Created:** 2026-04-07
**Last reviewed:** 2026-04-14
**Origin:** Adding docs site links to shipped `.arc/` documents exposed a branding problem: the
ideal domain (`arc.dev`) and obvious alternatives (`arcframework.dev`) are unavailable or occupied
by adjacent software/AI projects. That forced a re-examination of whether "ARC Framework" can work
as the public-facing identity.

**Upstream dependency:** Methodology Maturation (`prd-methodology-maturation.md`) should complete
first. The current work unit is actively editing many of the same docs surfaces the rebrand would
touch; interleaving a rename would create unnecessary churn.

**Downstream impact:** Operating Modes, WU5 (Public Release), and dogfooding all benefit from
settled naming before they begin. If the rebrand proceeds, it should land before the repo goes
public.

**Scope expansion (2026-04-09, 2026-04-11):** During Operating Modes design, four items surfaced
that compose naturally with the rebrand's existing content-sweep work and are being absorbed here:

1. **`pm.mode: arc-in-git` → `pm.mode: arc-pm` value rename.** The existing value names a tracking
   mechanism (git tracking) rather than a semantic (ARC's built-in PM). Local mode exposes the
   conflict: `.arc/` can exist in Local mode without being tracked, yet the developer may still
   want ARC's PM artifacts. Renaming to `arc-pm` (ARC project management / ARC planning module)
   names the semantic, not the mechanism.
2. **Unified content sweep.** Sweeping the `arc-in-git` → `arc-pm` references in one pass with the
   ARCd/ARC language audit avoids a second editorial churn event. Both sweeps touch the same files
   and same phrasing surfaces.
3. **CLI command surface cleanup.** Rename `arc status` → `arcd health` (the command checks
   framework installation health, not work state — the current name is a naming collision with the
   planned `/arc-status` skill for mid-session work orientation in Operating Modes WU). Add an
   explicit `arcd version` subcommand alongside the existing `--version` flag for discoverability.
   See Implementation Scope § CLI command surface (absorbed from Operating Modes WU) below.
4. **(Added 2026-04-11)** **`pm.mode` → `pm.layer` and `team.mode` → `team.enabled` key renames.**
   Surfaced during Finding #16 (Full → Lite downgrade) resolution in the Operating Modes WU. That
   work promotes "mode" to a load-bearing top-level term at the installation level
   (`install_config.install_type` = Lite/Full, with Local/Tracked as a future orthogonal axis),
   colliding with the pre-existing `pm.mode` and `team.mode` keys that sit at different semantic
   levels. Renaming `pm.mode` → `pm.layer` (matches existing "Planning Module" vocabulary in
   `strategy-planning-module.md`; differentiates layer-within-ARC from ARC-wide shape) and
   `team.mode` → `team.enabled` (natural noun for a boolean config key; drops "mode" entirely)
   frees the top-level namespace of `ARCd-config.yml`. Absorbing these here keeps the Modes WU
   focused on modes-specific design rather than acquiring a cross-cutting namespace sweep as a
   prerequisite. The rebrand is already renaming keys on the same file in the same editorial
   pass, so the marginal cost is small. See Implementation Scope item 6 below for details.

Extracting these from Operating Modes leaves that WU focused on its core concerns (shift lifecycle,
Lite, Local, mode-aware content updates) and gives the rebrand WU a modest scope increment that
stays within its "small-to-medium" estimate. See
[`plan-arc-modes.md`](../feature/plan-arc-modes.md) — Configurability Architecture Cleanup section
and the Resolved Decisions row for the 2026-04-11 key-rename absorption.

---

## Problem Statement

The project needs a distinctive public identity and a credible custom domain for its docs site.
Shipped `.arc/` documents now contain external links, and pointing those to a personal GitHub Pages
URL undermines their authority.

The obvious domains are taken:

- **arc.dev** — remote talent marketplace (Y Combinator backed, well-funded, established)
- **arcframework.dev** — Kotlin AI agent tooling ("Eclipse LMOS Arc"), actively maintained and
  software-adjacent
- **arcframework.org** — unrelated therapeutic framework occupying the namespace

The broader "ARC Framework" namespace is also crowded:

- `arc.codes` and other software-adjacent "arc" brands
- Multiple GitHub projects using "arc" in AI/dev-tool contexts
- Search results where "arc framework" is generic enough to be noisy and hard to own

This creates two linked problems:

1. **Brand ownership:** "ARC Framework" is elegant but difficult to own in public search and
   naming space.
2. **Product memorability:** Even if the methodology is strong, a public-facing name that collides
   with adjacent AI/dev tooling makes propagation harder.

---

## Design Goals

Any naming approach should optimize for the following:

- **Distinctive public identity** — searchable, ownable, domain-friendly
- **Conceptual clarity** — the relationship between the methodology and its implementation should
  make sense, not feel patched together
- **Daily usability** — common workflows should read naturally in paths, commands, and prose
- **Bounded migration cost** — changes should be mechanical and best done before public release
- **Consistency with confidence** — a few intentional asymmetries are acceptable; accidental-looking
  inconsistency is not

---

## Alternatives Considered

### Option A: Keep ARC naming, use alternate domain

Use `arc-framework.dev` (available, mirrors the current package/repo naming). No rebrand.

**Strengths:**

- Zero rename effort
- Preserves the elegance of "ARC"
- `arc-framework.dev` is clear and functional

**Weaknesses:**

- Ongoing namespace noise in search and public discussion
- Hyphenated domain is serviceable, not strong
- "ARC Framework" remains difficult to own as a public brand

**Assessment:** Viable fallback. Strongest continuity, weakest distinctiveness.

### Option B: Full rename to an unrelated new name

Explored extensively. Candidates included Alloy, Anvil, Anneal, Amalgam, Aegis, Arbor, Anode, and
many others. Short, evocative English words in the relevant semantic territory were either claimed,
conflicted, or ended up needing a structurally similar fallback such as `[name]-framework.dev`.

**Assessment:** Exhausted. No candidate was strong enough to justify the cost, and the domain
outcome did not improve enough to matter.

### Option C: Full unified rename to ARCd

Rename everything: methodology, implementation, directory, skills, config, file suffixes, git
config keys, refs, hooks, and package. The entire system becomes ARCd / `arcd`.

**Strengths:**

- Complete namespace ownership
- Clean short domain: `arcd.dev`
- One name everywhere
- No ambiguity about what the product is called

**Weaknesses:**

- Forces lower-case `arcd` across many daily technical surfaces (`.arcd/`, `arcd init`,
  `arcd-config.yml`, etc.)
- Sacrifices the elegance and conceptual readability of ARC in day-to-day workflow language
- Treats all internal methodology surfaces as product branding, even where that is not the most
  natural interpretation

**Assessment:** Valid and internally consistent. Rejected because the cost is not only mechanical;
it also permanently replaces many high-frequency, natural ARC-shaped interactions with a lower-case
technical form that is less appealing.

### Option D: Split architecture — ARC internally, ARCd publicly

Preserve ARC where it is the clearest methodology/workflow vocabulary; adopt ARCd where strong
public product identity matters.

This option originally appeared in two rough forms:

- **Light split:** ARC methodology / ARCd tool, with nearly all installed surfaces staying ARC
- **Heavy split:** a more visible implementation seam inside the installed system

The current direction is a refined version of the second form: **public ARCd brand, ARC workflow
substrate, with one deliberate internal implementation seam.**

**Assessment:** Best balance of distinctiveness, elegance, and daily usability. Selected direction.

---

## Decision

Adopt a **split naming architecture**:

- **ARCd** is the public product and implementation brand
- **ARC** remains the methodology and primary day-to-day workflow vocabulary
- **`ARCd-config.yml`** is the explicit internal seam that signals the installed implementation
  without forcing a full lower-case `arcd` migration across all operational surfaces

This is intentionally asymmetric. The asymmetry is a feature, not a compromise artifact.

The guiding principle is:

- Use **ARC** where the name reads as "the ARC way of working"
- Use **ARCd** where the name reads as "the public implementation/product"

That yields a system that is publicly distinctive without flattening the methodology into product
branding everywhere.

---

## Naming Architecture

### ARC vs ARCd

**ARC** is the methodology and workflow vocabulary.

- The principles, philosophy, and way of working
- The everyday "ARC-shaped" interactions inside a project
- The natural term in prose for practices, conventions, and workflows

**ARCd** is the public product and reference implementation brand.

- The docs site, domain, package, and public branding surfaces
- The install/update entry points
- The implementation identity that should be memorable and searchable in the wider world

This is not a strict product-vs-idea split in every filename. It is a naming boundary chosen by
surface semantics:

- **Methodology/workflow surface** → ARC
- **Implementation/public product surface** → ARCd

A third tier — **ARCd Framework** — covers project-as-a-whole surfaces (the repository, public
prose references to the whole project). See § Project-as-a-whole: ARCd Framework below.

### Project-as-a-whole: ARCd Framework

A third tier sits above ARC and ARCd when referring to the *whole project* — methodology,
implementation, docs, reference material, and everything in this repository taken together.
That tier uses **ARCd Framework** (or `ARCd-framework` in typographic contexts).

The three tiers resolve cleanly by asking what each surface represents:

- **Methodology** → ARC — principles, workflow vocabulary, daily practice
- **Implementation** → ARCd / `arcd` — CLI binary, package, public domain, anything that runs
  or installs
- **Project-as-a-whole** → ARCd Framework / `ARCd-framework` — containers that hold both
  methodology and implementation

**The repo is project-tier, not implementation-tier.** It contains `.arc/` (methodology),
`packages/arc-framework/` (implementation), ADRs, strategies, and the roadmap — the full
project surface, not just the implementation. `arcd.dev` and `@arcd/cli` can use the short
brand because they live in *containered* contexts (a TLD, a scope prefix) that supply
semantic lift. Repo names propagate to bare-word contexts (diff stats, cross-repo links,
page titles) where that lift isn't there, and bare `ARCd` doesn't yet have enough standalone
brand strength to carry those contexts unaided. The extra `-framework` does real
disambiguation work without undermining the short-brand surfaces.

**Why not `ARCdFramework` (camelcase) or `arcd-framework` (lowercase)?** Hyphenation is
GitHub-conventional and preserves the visual product-name boundary (`ARCd` + `framework`),
whereas camelcase blurs it into one compound word that reads as "ARCDf Ramework" on first
parse. Lowercase `arcd-framework` drops the brand capitalization from the URL itself, which
matters more for a repo name than for a domain because URLs with repo names propagate to
prose references where capitalization cues meaning. `ARCd-framework` keeps brand
capitalization without breaking readability.

See Usage Conventions below for the at-a-glance summary of what goes where.

### What stays ARC

These remain ARC because they read naturally as methodology or workflow vocabulary:

- **Directory:** `.arc/`
- **Workflow skills:** `arc-resume`, `arc-commit`, `arc-handoff`, etc.
- **Methods:** `arc-methods.md`
- **Extensions:** `arc-extensions.md`
- **File suffixes:** `.ARC.md`
- **Git config:** `arc.identity`, `arc.role`, `arc.sync_push`
- **Git notes namespace:** `refs/notes/arc/user/`
- **Methodology references in prose:** "ARC's principles", "the ARC workflow", "the ARC way"

### What becomes ARCd

These become ARCd because they are implementation or public product identity surfaces:

- **Domain:** `arcd.dev`
- **npm scope and package:** `@arcd/cli`
- **CLI binary:** `arcd`
- **Docs site / README / release language:** ARCd
- **Project configuration file:** `ARCd-config.yml`

(The GitHub repository name is project-tier, not implementation-tier — see § Project-as-a-whole
above.)

### Why config is ARCd while methods/extensions remain ARC

This is the key asymmetry and must remain intentional.

- **`ARCd-config.yml`** configures the installed implementation. It is the project's control
  surface for how ARCd is set up and behaves in a repository.
- **`arc-methods.md`** defines ARC's overridable behavioral defaults. The file answers "how does
  ARC do this by default?" not "how is the product configured?"
- **`arc-extensions.md`** defines extension points in ARC workflows. It answers "where can ARC
  workflow behavior be extended?" The added behavior may be anything; the extension point itself is
  part of ARC's workflow model.

The result is asymmetric but coherent:

- **Configure ARCd** in `ARCd-config.yml`
- **Override ARC methods** in `arc-methods.md`
- **Extend ARC workflows** in `arc-extensions.md`

### Skills stay ARC

Skill names remain `arc-*`.

Rationale:

- They read naturally as "do this the ARC way"
- They are daily workflow triggers, not product-branding moments
- Lower-case command-like surfaces benefit from simplicity over display-brand fidelity
- Mixed-case forms such as `ARCd-commit` are possible but visually clunkier and less natural in use

---

## Usage Conventions

**Methodology tier (ARC):**

- **Methodology prose and principles:** ARC — most natural conceptual language
- **Daily workflow skills:** `arc-*` — "do this the ARC way" reads cleanly
- **Installed workspace directory:** `.arc/` — ARC workspace model remains intact
- **Workflow customization:** `arc-methods.md`, `arc-extensions.md` — ARC behavioral model, not
  product veneer

**Implementation tier (ARCd / `arcd`):**

- **Domain:** `arcd.dev`
- **npm scope and package:** `@arcd/cli`
- **CLI binary:** `arcd`
- **Docs-site and README branding:** ARCd
- **Project configuration file:** `ARCd-config.yml` — explicit implementation seam

**Project-as-a-whole tier (ARCd Framework / `ARCd-framework`):**

- **GitHub repository:** `andrewRCr/ARCd-framework`
- **Public prose references to the whole project:** "ARCd Framework" (when the phrase names
  the containing thing — methodology + implementation together — rather than the brand)

**Editorial rule:** Three tiers. Use **ARC** when referring to the methodology, principles,
workflow, or daily practice. Use **ARCd** when referring to the CLI, package, domain, or
anything that runs or installs. Use **ARCd Framework** when referring to the whole project as
a containing thing. Do not force one tier's form into contexts where another reads more
naturally.

---

## Why This Direction Wins

### It solves the real branding problem

The strongest argument for change is not acronym completion or wordplay. It is that "ARC
Framework" is weak as a public brand because the namespace is crowded and adjacent to other AI/dev
tooling. ARCd solves that cleanly.

### It preserves the strongest part of ARC

ARC is elegant and reads naturally in workflow language:

- `.arc/`
- `arc-resume`
- `arc-commit`
- "the ARC way"

Those are unusually strong, and a full rename would replace them with lower-case technical forms
that are more mechanically consistent but less appealing in daily use.

### It keeps ARCd present inside the installation

The risk of a split architecture is that ARCd becomes a thin public wrapper and disappears after
installation. `ARCd-config.yml` prevents that. It gives the implementation brand one deliberate,
meaningful anchor inside the installed system without renaming everything.

### It is explainable in one sentence

> ARCd is the public reference implementation and product brand; ARC is the methodology and
> workflow vocabulary it installs into a project.

If the naming line cannot be explained simply, it is too messy. This one can.

---

## Secured Namespaces

Claimed during planning (2026-04-07):

- [x] `arcd.dev` — domain purchased
- [x] `@arcd` — npm org created
- [x] `arcd-framework` — GitHub org created (display name: ARCd)
- [ ] GitHub `arcd` username — blocked by dormant account (created 2016, no visible activity)
- [x] X/Twitter — `@ARCdFramework` claimed (`@arcd` taken)
- [x] Bluesky — `@arcdframework.bsky.social` claimed (`@arcd` taken)

---

## Implementation Scope

### Public/product-facing changes

1. **CLI package rename**
    - `@arc-framework/cli` → `@arcd/cli`
    - Binary name `arc` → `arcd`
    - **Version:** stay on the current v0.1.x line under the new name; no increment on the
      rename itself. Version continuity from the deprecated package is not meaningful (zero
      adoption, internal dev moment), and preserving the v0.2.x jump for the Operating Modes
      WU's post-rebrand completion gives that work a cleaner version boundary

2. **Docs site and public brand**
    - Configure `arcd.dev`
    - Rebrand site title, README hero, release language, and public-facing docs to ARCd
    - Explain the relationship between ARCd and ARC clearly in onboarding/getting-started

3. **Repository / org / links**
    - Rename `andrewRCr/arc-framework` → `andrewRCr/ARCd-framework` on GitHub
    - Update hardcoded repository URLs in docs, scripts, README, and framework files
      referencing the old name
    - Verify CI continues to run post-rename; verify GitHub Pages custom-domain wiring (see
      § 11 docs-site dimension)
    - **Blast radius is small.** Repo is private with no contributors — no external git
      remotes to update outside this developer's local clone, no contributor-facing
      communication, no broken links in third-party documentation
    - **Session-boundary execution.** The GitHub rename cannot be performed mid-session —
      the local working tree's origin URL becomes stale the moment the rename happens on
      GitHub, and in-flight operations break. The task list must mark the rename as an
      explicit mandatory stop: complete pre-rename code/doc work → merge PR → session
      handoff → manual GitHub UI rename → new session resumes with `git remote set-url
      origin`, stale reference cleanup, CI verification, and Pages wiring verification
    - Use ARCd consistently as the public-facing name across renamed surfaces

4. **npm transition and deprecation**
    - `@arc-framework/cli` has a published v0.1.0 (pre-public internal dev — zero adoption
      assumed). npm's 72-hour unpublish window has long since passed, so deprecation plus a
      redirect release is the only hygienic path
    - **Deprecation sequence:**
        1. Publish `@arcd/cli` as the renamed package (version per § 1 above)
        2. Publish one final `@arc-framework/cli` version whose README points at `@arcd/cli`
           and whose `package.json` description carries a deprecation notice
        3. Run `npm deprecate "@arc-framework/cli@*" "Package renamed to @arcd/cli — see
           github.com/andrewRCr/ARCd-framework"`
        4. Leave the deprecated package in place indefinitely. npm explicitly discourages
           unpublishing, and the pre-public zero-adoption framing makes scrubbing unnecessary
    - **Scope framing.** The old package is pre-public internal dev. No adopter communication,
      no changelog, no release notes — the deprecation path is pure hygiene for any stray
      stumbler, not a managed migration

### Installed-system naming changes

5. **Config seam**
    - Rename `arc-config.yml` → `ARCd-config.yml`
    - Update references, scripts, docs, hooks, and CLI behavior accordingly

6. **`pm.mode` and `team.mode` schema renames (absorbed from Operating Modes WU)**
    - **Value rename (pm.mode, 2026-04-09):** `pm.mode: arc-in-git` → `pm.mode: arc-pm` within
      the config schema. The existing value names a tracking mechanism rather than a semantic.
      `arc-pm` (ARC project management / ARC planning module) names the semantic. Distinctive in
      doc notation — "(arc-pm only)" is unambiguous, where "(arc only)" would be confused with
      the framework name. Runner-up `builtin` considered but loses the explicit ARC linkage.
    - **Key rename, pm (added 2026-04-11):** `pm.mode` → `pm.layer`. The Operating Modes WU
      promotes "mode" to a load-bearing top-level term at the installation level (stored in
      `install_config.install_type`, with Local/Tracked as a future orthogonal axis). That
      creates a semantic-level collision with `pm.mode`, which sits at a different level
      (PM-layer-within-ARC, not ARC-wide shape). `pm.layer` matches the existing "Planning
      Module" vocabulary in `strategy-planning-module.md` and differentiates layer-within-ARC
      from ARC-wide shape. Reads naturally: `pm.layer: arc-pm`, `pm.layer: external`,
      `pm.layer: none`.
    - **Key rename, team (added 2026-04-11):** `team.mode: bool` → `team.enabled: bool`.
      `enabled` is the natural noun for a boolean config key; drops the "mode" word entirely.
      Minimal cognitive delta — "team enabled: true" reads equivalently to "team mode: true".
    - **Runner-up namings rejected:** `pm.option` (low-information), `pm.provider`
      (tool-flavored for a methodology config), `pm.backend` (too tech), `pm.system` (risks its
      own collision), `collaboration: solo | team` (changes the observable shape from bool to
      enum without a driver).
    - **Combined motivation for absorbing here:** All three renames touch the same keys in the
      same config file and are already in scope for this WU's content sweep and schema
      evolution. Doing them together avoids a second editorial churn event. Three-way merge
      handles existing installs via `arc update`. The schema version bump is already required
      for the value rename; the key renames are marginal additions to the bump.
    - **Files touched (indicative):** `packages/arc-framework/arc/system/arc-config.template.yml`
      (or equivalent post-rebrand path), `packages/arc-framework/init-recipe.json` (prompt
      `config_key` entries), `packages/arc-framework/src/lib/config.ts`
      (`buildConfigMap` / `buildTokenMap` / `buildConfigKeyOverrides`),
      `packages/arc-framework/src/lib/types.ts` (`InstallConfig` field names —
      `pm_mode` → `pm_layer`, `team_mode` → `team_enabled`),
      `packages/arc-framework/src/lib/constants.ts` (`ARC_IN_GIT_CONDITION` and any condition
      keys referencing the old key name), githooks shell scripts that parse config by key,
      and the sweep of all `.arc/` reference/strategy/workflow docs that name the keys in prose.

7. **CLI command surface cleanup (absorbed from Operating Modes WU)**
    - **Rename `arc status` → `arcd health`.** The current command checks installed framework
      health (is the install up to date, are there local modifications, should you run `arc
      update`), not work state. The name collides with the planned `/arc-status` skill for
      mid-session work orientation (see `plan-arc-modes.md` § Shift Lifecycle → Skill Shape).
      Renaming the CLI command to `arcd health` names its actual function (diagnostic check on
      the install) and frees the `arc-status` name for the skill, which uses it more naturally.
    - **Add explicit `arcd version` subcommand.** `arcd --version` already works via Commander's
      built-in `.version()` wiring, but an explicit subcommand is idiomatic across developer
      tooling (git, docker, kubectl) and improves discoverability for users who guess `tool
      version` before `tool --version`. Trivial addition (~5 lines in `cli.ts`).
    - **Files touched:** `packages/arc-framework/src/cli.ts`, `src/handlers/lifecycle.ts`,
      `src/commands/status.ts` (rename to `health.ts`), related tests, `QUICK-REFERENCE.md`,
      any docs that reference `arc status` as a command.
    - **Three-way merge consideration:** `arc status` is a CLI invocation, not a config value.
      No migration machinery needed — users either type the new command or get a "command not
      found" and check docs. The rebrand already breaks `arc` → `arcd` muscle memory, so this
      rename adds zero incremental user cost within the same migration moment.

### Installed-system naming that remains unchanged

8. **Keep ARC workflow substrate**
    - `.arc/`
    - `arc-methods.md`
    - `arc-extensions.md`
    - `.ARC.md`
    - `arc-*` skills
    - `arc.*` git config keys
    - `refs/notes/arc/user/`

### Content cleanup

9. **Unified public/internal language audit (expanded)**
    - Update docs so public/product references say ARCd where appropriate
    - Keep methodology/workflow references as ARC where that reads more naturally
    - Remove wording that implies an accidental or inconsistent split
    - Apply three-tier naming (ARC / ARCd / ARCd Framework) consistently — see § Naming
      Architecture for the tier rules
    - **Absorbed from Operating Modes WU:** sweep all existing references to `arc-in-git`,
      `(arc-in-git only)`, and similar notations, replacing with `arc-pm` / `(arc-pm only)` as
      appropriate. Single editorial pass covering ARCd/ARC/ARCd-Framework language AND
      pm.mode references.

### Migration strategy

10. **Self-hosted `.arc/` migration**
    - **Context.** This repository is the only existing ARCd installation (self-hosting
      during framework development). No other installs exist anywhere.
    - **Approach: manual one-time sync from package source.** After the package source
      rename lands (`packages/arc-framework/arc/` → `packages/arcd-framework/arc/` or
      equivalent path, fully rebranded), sync the installed `.arc/` directly from the
      package source as a one-time operation. Do not route the self-migration through
      `arc update`'s three-way merge.
    - **Why bypass three-way merge.** The three-way merge machinery in `arc update` would
      need to learn simultaneous key-and-value renames (`pm.mode: arc-in-git` →
      `pm.layer: arc-pm`) to handle this transition. Teaching it is out of scope for this
      WU — the only installation is self-hosted and can be migrated by hand. The three-way
      merge enhancement is a separately scheduled improvement if and when real adopters
      need an upgrade path
    - **Explicit no-upgrade-path position.** First post-rebrand adopters install fresh from
      `@arcd/cli`. There is no supported upgrade from `@arc-framework/cli` v0.1.x. Given
      zero adoption of the deprecated package this is costless and avoids polluting the
      rebrand WU with migration machinery that nothing real would use

### Docs site dimension (evaluation pending pre-PRD)

11. **Custom-domain migration, landing page, SSG evaluation, and feature enhancements**
    - **Custom-domain migration** (non-negotiable). `arcd.dev` → GitHub Pages CNAME wiring,
      docs-site `site_url` update, any absolute-URL references in content swept. Currently
      the docs site publishes to a GitHub Pages URL; migration to the purchased custom
      domain is overdue
    - **Landing page** (non-negotiable). Polished but simple, distinct from the docs index.
      `arcd.dev/` lands on a product page that introduces ARCd Framework and routes
      visitors to docs, repo, and getting-started. `arcd.dev/docs/` (or equivalent path)
      houses the existing docs content
    - **SSG evaluation** (to resolve on this planning branch, pre-PRD). Evaluate
      alternatives to mkdocs-material — candidates include mintlify, astro/starlight,
      docusaurus, and any other well-maintained options that surface during research.
      Output: a decision on whether to migrate away from mkdocs-material or stay, with
      concrete rationale
    - **Feature enhancements** (depends on SSG outcome). Whatever the chosen SSG supports
      and serves the docs — search improvements, versioned docs, social cards, analytics,
      redirects, etc. Scope: "evaluate available features on the chosen SSG and land
      meaningful improvements" as a bounded task, not an open-ended shopping list
    - **Open WU-shape question.** Whether this dimension fits inside one WU with the core
      rename or warrants a separate `prd-arcd-docs-site.md` sequenced immediately after
      depends on the SSG evaluation outcome. If we stay on mkdocs-material the docs-site
      work is small enough to fit in one WU. If we migrate to another SSG the scope grows
      enough to warrant a planned split — one plan → two PRDs → two WUs per
      `strategy-work-planning.md`. Decision deferred until the evaluation completes

---

## Resolved Decisions

These were Open Questions in earlier drafts; all are now decided (2026-04-14).

1. **License: Apache 2.0.** Already adopted in-repo (`/LICENSE`) — predates this plan doc.
   The open question was stale; no action needed beyond removing it from this document.

2. **Repository name: `andrewRCr/ARCd-framework`.** Stays under the personal profile (no
   migration to the `arcd-framework` GitHub org, which was created for brand protection but
   is not hosting the repo). The name is project-tier per § Naming Architecture →
   Project-as-a-whole — `ARCd-framework` over bare `ARCd` because repo names propagate to
   bare-word contexts where the short brand doesn't yet have enough standalone strength, and
   the hyphenated form is more readable than `ARCdFramework` while preserving the brand
   capitalization that `arcd-framework` would drop.

3. **Relationship explanation: canonical wording + surface-adapted variants.** Not strictly
   a single sentence — the concept needs to appear on the docs-site landing page, README
   hero, getting-started, FAQ, and `the-framework.md`, each with different constraints.
   PRD-phase content deliverable: author the canonical wording once (probably rooted on the
   docs-site landing page under § 11), then adapt for each target surface. Treat as authoring
   work, not a blocking open question.

---

## Timing

**After Methodology Maturation (✓ complete), before Operating Modes / public release.**

Methodology Maturation shipped via PR #16 (2026-04-14). The rebrand is the immediate next
WU on the roadmap, sequenced ahead of Expanded Planning Path and Operating Modes so the
namespace and config-seam work lands before downstream work units touch the same files.

This is best done before public release:

- Lower migration and redirect cost
- Cleaner public launch story
- Fewer downstream docs and compatibility burdens

**Estimated scope:** Medium work unit at minimum, with potential to grow depending on the
pre-PRD docs-site SSG evaluation outcome.

- **Core rebrand (§§ 1–10)** is bounded and medium-sized: public-facing renames, config-seam
  migration, pm.mode/team.mode schema renames, CLI command surface cleanup, unified content
  sweep, npm deprecation, repo rename with session-boundary handling, and self-hosted
  one-time migration.
- **Docs site dimension (§ 11)** sizing depends on the SSG decision. Staying on
  mkdocs-material keeps this WU in medium territory and suggests a single WU. Migrating to
  a different SSG grows scope enough to warrant splitting into a planned follow-up WU
  (`prd-arcd-docs-site.md`) sequenced immediately after the core rebrand.

Final sizing and WU-split decision resolve after the docs-site SSG evaluation completes on
this planning branch, pre-PRD.
