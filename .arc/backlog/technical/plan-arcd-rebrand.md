# Plan: ARCd Rebrand

**Purpose:** Rebrand the framework implementation from "ARC Framework" to "ARCd" — establishing a
distinctive, searchable product identity while preserving "ARC" as the methodology name. Captures
rationale from the naming/domain exploration and defines the actionable work.

**Status:** Draft (decision pending — strong candidate, not yet committed)
**Created:** 2026-04-07
**Origin:** Adding docs site links to shipped `.arc/` documents revealed that the ideal domain (arc.dev)
and obvious alternatives (arcframework.dev) are taken by adjacent software/AI projects. Exploration of
the naming landscape surfaced ARCd as a viable rebrand that solves distinctiveness and domain concerns
with bounded cost.

**Upstream dependency:** Methodology Maturation (`prd-methodology-maturation.md`) — should complete first.
The current work unit is actively editing docs and shipped files; interleaving a rename would create
unnecessary churn.

**Downstream impact:** Operating Modes, WU5 (Public Release), Dogfooding — all benefit from settled
naming before they begin. The rebrand should land before the repo goes public.

---

## Problem Statement

The framework needs a custom domain for its docs site. Shipped `.arc/` documents now contain external
links, and pointing these to a personal GitHub Pages URL (andrewrcr.github.io/arc-framework) undermines
the content's authority.

The obvious domains are taken:

- **arc.dev** — remote talent marketplace (Y Combinator backed, $7.5M funded, ~90 employees). Permanent.
- **arcframework.dev** — Kotlin AI agent tooling (Eclipse LMOS Arc, Deutsche Telekom / Eclipse Foundation).
  Actively maintained, domain-adjacent.
- **arcframework.org** — therapeutic framework. Unrelated but occupies the namespace.

"ARC Framework" also faces broader namespace congestion: arc.codes (AWS infrastructure), multiple GitHub
projects using "arc" in AI/dev tool contexts, and a generally crowded search landscape for "arc framework"
in software. No single competitor dominates, but the cumulative noise makes search discoverability
unreliable.

## Options Evaluated

### Option A: Keep ARC naming, use alternate domain

Use `arc-framework.dev` (available, mirrors npm package name). No rename needed.

**Strengths:**

- Zero effort — nothing changes
- Preserves the elegant "ARC" name and all existing work
- `arc-framework.dev` is explicit and functional

**Weaknesses:**

- Permanent namespace noise in search results (arc.dev, arcframework.dev, Eclipse Arc, arc.codes)
- Hyphenated domain is functional but not ideal
- "ARC Framework" will never own its search results

**Assessment:** Strong fallback. Remains viable if the rebrand doesn't proceed.

### Option B: Full rename to a new name

Explored extensively. Candidates evaluated: Alloy, Anvil, Anneal, Amalgam, Aegis, Arbor, Anode, and
~15 others. Every short, evocative English word starting with 'a' in relevant semantic territory has
either a claimed `.dev` domain or significant namespace conflicts. The fundamental problem: any word
good enough to be a great name is good enough that someone has already claimed it.

**Assessment:** Exhausted. No candidate was compelling enough to justify the full rename cost, and the
domain situation doesn't meaningfully improve — you end up at `[name]-framework.dev` regardless,
which is structurally equivalent to Option A.

### Option C: ARCd (selected direction)

Rebrand the product to "ARCd" (pronounced "arced"). Keep "ARC" as the methodology name. The product
implements the methodology — ARCd is ARC, applied.

**Strengths:**

- **Total namespace ownership.** "ARCd" returns nothing software-related. Complete search dominance
  from day one.
- **Clean short domain.** `arcd.dev` — four characters, no hyphens. Available and purchased.
- **Preserved meaning.** The arc shape metaphor survives. The acronym is more complete: **A**gentic
  **R**eciprocal **C**o-**d**evelopment. The "arced" reading works conceptually — the work has arced
  through the loop.
- **Minimal rename scope.** The methodology layer (`.arc/` directory, `.ARC.` file namespace,
  `arc-config.yml`, git config) stays unchanged. Only the product-facing surfaces change.
- **OSS clarity.** ARCd (the tool) is open source. ARC (the methodology) is authored intellectual
  property, freely available but not "open source" in the software sense. Clean contribution model:
  PRs improve the tool, methodology evolves through authorship.
- **Distinctiveness.** Nothing else uses "ARCd" in any context. No collision with adjacent projects,
  no disambiguation needed.

**Weaknesses:**

- **Elegance loss.** "ARC" is cleaner — three letters, one syllable, a real word. "ARCd" is four
  letters, arguably two syllables, and requires the 'd' to be explained.
- **Pronunciation ambiguity.** "Arced" is the intended reading, but some will say "A-R-C-D." Common
  for dev tools (nginx, kubectl, PostgreSQL) but permanent friction.
- **Prose styling tax.** "ARCd" in running text requires a consistency rule. Canonical form: ARCD in
  all-caps contexts, ARCd in brand/display contexts. Lowercase `arcd` in all technical contexts
  (domain, CLI, npm, directory references in prose).

## Naming Architecture

### The ARC / ARCd relationship

**ARC** is the methodology — the 11 principles, the philosophy, the way of working. It's an idea.
Freely available to read and follow, like Scrum or Agile. Soft ownership through authorship.

**ARCd** is the product — the CLI, the installed framework, the templates, workflows, and directory
structure. Open source (to be licensed MIT or Apache). Hard ownership through code.

This is not two parallel brands. ARCd is the brand; ARC is the natural shorthand. The relationship
is self-evident (ARCd contains ARC) and resolved with one sentence in onboarding:

> _ARCd implements the ARC methodology for human-AI co-development._

### Usage convention

| Context                                | Name          | Rationale                             |
| -------------------------------------- | ------------- | ------------------------------------- |
| Domain, npm, CLI command, GitHub       | `arcd`        | Technical identifier, searchable      |
| README title, website hero, logo       | ARCd          | The brand                             |
| Philosophy docs, principles discussion | ARC           | "ARC's 11 principles" reads naturally |
| Referring to the tool, package, or CLI | ARCd / `arcd` | The product                           |
| Casual recommendation                  | Either        | Relationship is obvious               |

**Editorial rule:** When referring to the tool/package/CLI, use ARCd (or `arcd`). When discussing
methodology concepts, ARC is natural. Don't use them interchangeably — be consistent about which
you mean.

### What stays as "ARC"

The methodology layer is ARC and retains ARC naming:

- **Directory:** `.arc/` — the ARC methodology's workspace in a project
- **File namespace:** `.ARC.` in filenames (`CLAUDE.ARC.md`, `DEV-RULES.ARC.md`)
- **Config:** `arc-config.yml`, `arc-methods.md`, `arc-extensions.md`
- **Git config:** `arc.identity`, `arc.role`, `arc.sync_push`
- **Methodology references in prose:** "ARC's design," "the ARC methodology," "ARC principles"

### What becomes "ARCd"

The product layer is ARCd:

- **Domain:** `arcd.dev`
- **npm scope and package:** `@arcd/cli`
- **CLI binary:** `arcd` (`arcd init`, `arcd update`, `arcd sync`)
- **GitHub org:** arcd-framework (display: ARCd) — `arcd` username unavailable (dormant account)
- **Brand in docs, README, marketing:** ARCd
- **Repository name:** TBD (likely `arcd` under personal GitHub, or `arcd-framework` org)

## Secured Namespaces

Claimed during planning (2026-04-07):

- [x] `arcd.dev` — domain purchased
- [x] `@arcd` — npm org created
- [x] `arcd-framework` — GitHub org created (display name: ARCd)
- [ ] GitHub `arcd` username — blocked by dormant account (created 2016, zero activity). File
      name squatting claim as low-priority.
- [x] X/Twitter — `@ARCdFramework` claimed (`@arcd` taken)
- [x] Bluesky — `@arcdframework.bsky.social` claimed (`@arcd` taken)

## Work Items

### Pre-implementation (do before starting)

1. **Final go/no-go decision.** Revisit after Methodology Maturation completes. Confirm the
   rationale still holds and no new information has surfaced.
2. **Check remaining namespaces.** Social handles, any other platforms where `arcd` should be claimed.
3. **License decision.** Choose license for ARCd (MIT vs Apache 2.0) — may be a separate concern
   but the rebrand is a natural point to formalize.

### Implementation

Scope is bounded — the methodology layer (`.arc/`, `.ARC.` files, config naming) is unchanged.
Only product-facing surfaces need updating.

4. **CLI package rename.** `@arc-framework/cli` → `@arcd/cli`. Binary name `arc` → `arcd`.
   Update `package.json` name, bin field, and all internal references to the command name.
5. **CLI internal references.** Update any hardcoded references to "ARC Framework" in CLI output
   (help text, init prompts, version display, error messages). Reference the methodology as "ARC"
   and the tool as "ARCd" consistently.
6. **Docs site domain.** Configure `arcd.dev` CNAME pointing to GitHub Pages. Update `mkdocs.yml`
   site name and any absolute URLs.
7. **Docs site content.** Update product references from "ARC Framework" to "ARCd" across all docs
   pages. Methodology references ("ARC's principles," "the ARC methodology") stay. Add the
   relationship explanation to the landing page and getting-started.
8. **Repository README.** Rebrand hero section. Update install commands, badges, and links.
   The "Agentic Reciprocal Co-Development" tagline now explicitly sources the name.
9. **Shipped `.arc/` documents.** Update references to the tool/CLI/package in framework files
   that ship to adopters (agent briefings, workflows, quick reference, README files within `.arc/`).
   Methodology references stay as ARC.
10. **npm deprecation.** If `@arc-framework/cli` has any published versions, publish a final version
    pointing to `@arcd/cli` and deprecate.
11. **GitHub repository.** Rename repo and/or transfer to org. Update all links. GitHub handles
    redirects from the old URL.

### Post-implementation

12. **Roadmap and backlog update.** Update ROADMAP.md and backlog references from "ARC Framework"
    to "ARCd" where referring to the product.
13. **Dormant GitHub username claim.** File request through GitHub's name squatting policy.
    Low priority — `arcd-framework` org is functional.
14. **Social handles.** Claim `arcd` on relevant platforms.

## Timing

**After Methodology Maturation, before Operating Modes.** The current work unit edits many of the
same docs surfaces the rebrand would touch. Complete it first, then rebrand on a clean baseline.
The rebrand should land before the repo goes public (WU5) — renaming a public repo has higher cost
and leaves redirect artifacts.

**Estimated scope:** Small-to-medium work unit. The methodology layer is untouched, so the rename
is limited to product-facing surfaces: CLI package, docs site, README, and shipped doc references.
No directory restructuring, no file renames, no config schema changes.

---

**Last reviewed:** 2026-04-07
