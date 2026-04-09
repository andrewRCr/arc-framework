# Plan: ARCd Rebrand

**Purpose:** Establish ARCd as the public product brand while preserving ARC as the methodology
and day-to-day workflow vocabulary where that remains the clearest fit. This document captures the
problem, alternatives considered, the chosen naming boundary, and the implementation scope.

**Status:** Draft (direction settled; scope expanded 2026-04-09 to absorb related config cleanup
from Operating Modes WU)
**Created:** 2026-04-07
**Last reviewed:** 2026-04-09
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

**Scope expansion (2026-04-09):** During Operating Modes design, three items surfaced that compose
naturally with the rebrand's existing content-sweep work and are being absorbed here:

1. **`pm.mode: arc-in-git` → `pm.mode: arc-pm` rename.** The existing value names a tracking
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

Extracting these from Operating Modes leaves that WU focused on its core concerns (shift lifecycle,
Lite, Local, mode-aware content updates) and gives the rebrand WU a modest scope increment that
stays within its "small-to-medium" estimate. See
[`plan-arc-modes.md`](../feature/plan-arc-modes.md) — Configurability Architecture Cleanup section.

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

- The docs site, domain, package, org/repo branding, and public recommendation surface
- The install/update entry points
- The implementation identity that should be memorable and searchable in the wider world

This is not a strict product-vs-idea split in every filename. It is a naming boundary chosen by
surface semantics:

- **Methodology/workflow surface** → ARC
- **Implementation/public product surface** → ARCd

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

These become ARCd because they are public product or implementation identity surfaces:

- **Domain:** `arcd.dev`
- **npm scope and package:** `@arcd/cli`
- **CLI binary:** `arcd`
- **GitHub org / public branding:** ARCd
- **Docs site / README / release language:** ARCd
- **Project configuration file:** `ARCd-config.yml`

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

- **Domain, npm, CLI, GitHub, docs brand:** ARCd / `arcd` — public product identity
- **Methodology prose and principles:** ARC — most natural conceptual language
- **Daily workflow skills:** `arc-*` — "do this the ARC way" reads cleanly
- **Installed workspace directory:** `.arc/` — ARC workspace model remains intact
- **Project configuration:** `ARCd-config.yml` — explicit implementation seam
- **Workflow customization:** `arc-methods.md`, `arc-extensions.md` — ARC behavioral model, not
  product veneer

**Editorial rule:** When referring to the public project, site, package, CLI, or implementation,
use ARCd / `arcd`. When referring to the methodology, principles, workflow, or daily practice, use
ARC. Do not force one name into contexts where the other reads more naturally.

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

2. **Docs site and public brand**
    - Configure `arcd.dev`
    - Rebrand site title, README hero, release language, and public-facing docs to ARCd
    - Explain the relationship between ARCd and ARC clearly in onboarding/getting-started

3. **Repository / org / links**
    - Rename repo and update links as needed
    - Use ARCd consistently as the public-facing name

4. **npm transition**
    - If `@arc-framework/cli` has published versions, deprecate cleanly toward `@arcd/cli`

### Installed-system naming changes

5. **Config seam**
    - Rename `arc-config.yml` → `ARCd-config.yml`
    - Update references, scripts, docs, hooks, and CLI behavior accordingly

6. **`pm.mode` value rename (absorbed from Operating Modes WU)**
    - Rename `pm.mode: arc-in-git` → `pm.mode: arc-pm` within the config schema
    - Reason: the existing value names a tracking mechanism rather than a semantic. `arc-pm`
      (ARC project management / ARC planning module) names the semantic. Distinctive in doc
      notation — "(arc-pm only)" is unambiguous, where "(arc only)" would be confused with the
      framework name
    - Three-way merge handles existing installs via `arc update`
    - Runner-up `builtin` considered but loses the explicit ARC linkage

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
    - **Absorbed from Operating Modes WU:** sweep all existing references to `arc-in-git`,
      `(arc-in-git only)`, and similar notations, replacing with `arc-pm` / `(arc-pm only)` as
      appropriate. Single editorial pass covering ARCd/ARC language AND pm.mode references.

---

## Open Questions

These do not block the naming direction, but should be resolved before implementation:

1. **License decision**
    - Formalize the license for the open-source implementation (MIT vs Apache 2.0)

2. **Repository naming**
    - Final public repo shape under the org/personal namespace

3. **Public explanation wording**
    - Finalize the one-sentence relationship explanation for homepage, README, and onboarding

---

## Timing

**After Methodology Maturation, before Operating Modes / public release.**

The current work unit is actively editing many of the same docs and framework surfaces the rebrand
would touch. Complete that work first, then execute the rename on a cleaner baseline.

This is best done before public release:

- Lower migration and redirect cost
- Cleaner public launch story
- Fewer downstream docs and compatibility burdens

**Estimated scope:** Small-to-medium work unit. The split architecture avoids a full lower-case
`arcd` rename of the installed methodology substrate while still requiring a meaningful public
rebrand and a bounded internal config-seam migration.
