# Plan: Public Release (WU4)

**Purpose:** Make ARC Framework publicly available and adoptable — clean public repo,
external documentation site, polished README, and community infrastructure.

**Status:** Draft
**Created:** 2026-02-22

---

## Scope

WU4 is the final work unit of the 1.0 release sequence. It takes a methodology-complete,
configurable, distributable framework (outputs of WU1–WU3) and makes it public-facing:
structurally clean repositories, meaningful external documentation, and the community
scaffolding needed to receive contributions responsibly.

**This work unit is primarily execution.** The major decisions (philosophy articulation,
configurability architecture, tier definitions, CLI tooling) are resolved upstream. WU4
consumes those decisions as inputs to write good documentation and set up the right
infrastructure.

**What WU4 produces:**

- Public repository, set up and populated
- External documentation site (MkDocs Material + GitHub Pages), live with content
- Rewritten README, adoption-focused
- Community infrastructure (issue templates, contribution guidelines, code of conduct, PR template)
- npm package published at 1.0.0

---

## Inputs

**From WU1 (Core Philosophy & Configurability Architecture):**

- Core philosophy document — the non-negotiables and why (direct source for docs site
  philosophy content and README positioning)
- Configurability architecture — tier definitions, config schema, extension point conventions
  (informs docs site "how it works" content and comparison material)
- ADR outputs — positions on session model, agent-agnosticism, merge strategy support,
  progressive adoption tiers (all inform adoption documentation)

**From WU2 (Methodology Completion):**

- Final, validated framework files — what actually ships (defines the docs site's accurate
  "here's what you get" content)
- Progressive adoption tiers as implemented (Basic vs. Full — WU4 docs must match actual
  behavior, not design intent)

**From WU3 (CLI & Distribution):**

- Functional `arc init` and `arc update` (public repo can only go live when distribution
  works)
- npm package name and published version (README install instructions depend on this)
- Interactive init options as implemented (docs site onboarding content must reflect actual
  init experience)
- Init output messaging (which references the docs site — WU4 provides the URL)

**From existing planning material:**

- `plan-public-release.md` — repository structure decisions, docs site tooling decision,
  README refresh context, philosophy/positioning guidance, community infrastructure list
- `plan-distribution-and-update-system.md` — auto-compact recommendation for init/onboarding
  docs (see below)

---

## Deliverables

### 1. Repository Split

Two repositories replace the current single development repository:

**Development repo (private):**

- Rename `arc-agentic-dev-framework` → `arc-framework-dev`
- Retains the full `.arc-internal/` workspace, development history, all planning artifacts
- Ongoing framework development happens here using ARC methodology on itself

**Public repo (public):**

- Name TBD — `arc-framework` is the current candidate
- Contains: framework source files, CLI source, npm package config, user-facing documentation
- Does not contain: `.arc-internal/` content, development planning artifacts, internal history
- This is what users see, fork, and submit issues against

**Migration process:** Deferred until WU3 is complete (CLI must be functional before
the public repo has anything useful to contain). Public repo setup can begin in parallel
with late-stage WU3 work — repository scaffolding, community infrastructure, and initial
README can be prepared before the framework files are migrated.

### 2. External Documentation Site

**Tooling:** MkDocs Material + GitHub Pages.

Rationale (already decided): Markdown-native, minimal configuration, professional defaults
(built-in search, navigation, dark mode, responsive layout), GitHub Action deploys on push,
versioned docs, free hosting. Setup effort is low — `mkdocs.yml`, a directory of `.md`
files, and one Action. The work is content, not infrastructure.

**Content scope:**

- **Conceptual orientation ("How ARC Works")** — Sessions and their role, task-driven
  workflow, strategies and quality gates, the agent collaboration model. The mental model
  a new adopter needs before opening the repo.

- **Philosophy deep-dives** — Why task-driven? Why sessions? Why agent-agnostic? Why
  markdown-only? The reasoning behind ARC's choices, in enough depth to let adopters
  decide if those choices fit their context. Written as "here's our approach and why" —
  not as prescriptive truth (see Positioning Guidance below).

- **Fully-formed examples** — What DEVELOPMENT-RULES looks like for a Django project,
  a React app, a data pipeline. Constitutional doc examples that show adopters the target
  state, not just the template. (These are the "filled-in examples" long deferred from the
  `.template.md` naming work — they belong on the docs site, not in the repo.)

- **Tutorials and walkthroughs** — First ARC session walkthrough, creating your first task
  list, setting up quality gates for your stack. Guided, linear, goal-oriented.

- **Comparison and positioning** — ARC vs just using CLAUDE.md, vs Cursor rules, vs Skills
  (SKILL.md), vs other frameworks. Helps with the "is this for me?" decision. Should be
  honest about tradeoffs and use cases where ARC is a poor fit.

  The Skills comparison deserves specific attention — it's the most likely "why not just
  use skills?" question from adopters. Key framing: skills optimize for agent-only
  consumption and token economy (split files, imperative instructions); ARC strategies
  optimize for dual-audience use (human onboarding + agent guidance in one document).
  Skills are portable but self-contained — no consistency guarantees across a project's
  guidance. ARC strategies are integrated — they cross-reference each other, building
  predictable behavior. Neither is wrong; they solve different problems. ARC provides a
  path for both: bring skills in via the integrate-skill workflow, or use them standalone
  alongside ARC (tier 3 coexistence). Source analysis: `notes-philosophy-configurability.md`
  (Skills and ARC section) and plan-wu2 Cluster N.

  **Note:** The Skills positioning has evolved since this was written — thinking has moved
  toward skills as ARC's likely trigger mechanism (replacing slash commands) with content
  still internal to ARC. Review latest captured thinking before authoring this section.

  A related "why not just..." question: **nested agent files throughout the codebase**
  (e.g., `frontend/claude.md`, `api/agents.md`). This is a common and effective pattern —
  proximity-based auto-loading gives Tier 1 reliability scoped to a domain. ARC's position:
  we favor centralized guidance inside `.arc/` with explicit triggers (Tier 2a) because
  (a) centralized content is discoverable and auditable, (b) cross-document consistency
  is maintainable, (c) the approach is platform-independent (not all agents support
  proximity-based loading). Nested agent files are acknowledged as a complementary
  technique — not in conflict with ARC, but outside its consistency guarantees. Source
  analysis: `notes-foundational-gap-closure.md` § Evaluation: Context Loading Design and
  `research-instruction-reliability.md` (mechanism reliability spectrum).

**Relationship to the repo:**

- Repo README: value proposition + link to docs site for everything deeper
- `.arc/README.md`: operational directory overview (stays in-repo, unchanged)
- No in-repo getting-started or orientation doc — the docs site is the orientation layer
- CLI `init` output: references the docs site URL for post-install orientation

**Note on onboarding content:** Docs site tutorials and the CLI init output should both
include a recommendation to disable auto-compact/context-summarization in AI tools
(e.g., Claude Code's auto-compact setting). ARC sessions depend on constitutional context
loaded at session-init — automatic compaction degrades that context silently. Sessions are
designed to end with explicit handoff, not context loss.

### 3. README Rewrite

The current README is outdated: emojis, references to old structure, developer-focused.
It needs a wholesale rewrite before any public exposure.

**Target:** A README that serves an adopter evaluating the framework, not a developer
already inside the codebase.

**Structure:**

- Value proposition (what problem does ARC solve, in plain terms)
- Philosophy summary (the core commitments — task-driven, human-in-the-loop,
  spec-before-code, session-based context — with "here's why" framing)
- "Is this for me?" — honest characterization of who benefits and who might not
- Quick start (install command via npm, link to docs site for the full walkthrough)
- Links to docs site for depth, to `.arc/README.md` for directory structure

**Starting point:** The `arc-portfolio` repo has substantial framework description in
`projects.ts` — written from a portfolio angle but provides good content foundation.
Needs reframing from "what I built" to "here's how to use it."

**Positioning constraint:** Apply the same "here's our approach and why" principle as the
docs site. The README should not position ARC as the exclusively correct way to work with
AI agents. (See Positioning Guidance below.)

### 4. Community Infrastructure

Pre-release setup for the public repo — standard GitHub community health files:

- **Issue templates** — Bug report, feature request, question (three templates)
- **Contribution guidelines** — How to submit issues, how to propose changes, what kinds
  of contributions are welcome at this stage
- **Code of conduct** — Standard (Contributor Covenant is the default choice)
- **PR template** — Context, change type, checklist
- **GitHub Discussions** — Optional; evaluate need at release time. May be valuable for
  "how do I adapt ARC to my team's workflow" conversations that don't fit issue format.

### 5. npm Publish

- Publish the npm package at 1.0.0 (coordination with WU3 on package name and scope)
- GitHub Release with release notes
- Confirm install command works cleanly in a fresh environment

---

## Positioning Guidance

This applies to all WU4 content: README, docs site philosophy pages, comparison material.

ARC's single-threaded, human-in-the-loop approach is opinionated. Public materials should
not position it as the exclusively correct way to work with AI agents. Delegated and
multi-agent workflows have legitimate uses depending on work type and quality/maintainability
standards.

**Principle:** "Here's our approach and why" — not "the only approach."

In practice: acknowledge the spectrum of AI collaboration patterns, position ARC's choices
within it, and be explicit about the tradeoffs ARC makes. Adopters who understand the
reasoning can make an informed choice — and those for whom ARC is a poor fit will learn
that before wasting time on adoption.

---

## Parallelism Opportunities

WU4 has hard dependencies on WU3 for the public repo migration and npm publish, but
significant content work can begin earlier:

**Can start after WU1+WU2 complete (does not require WU3):**

- Docs site infrastructure setup (mkdocs.yml, GitHub Action, GitHub Pages configuration)
- Docs site content authoring — philosophy pages and conceptual orientation depend on WU1
  ADR outputs; example content depends on WU2 final framework files
- README first draft — depends on WU1 (philosophy) and WU2 (final structure), not CLI

**Requires WU3 complete:**

- Public repo migration (framework files, CLI source)
- npm publish
- CLI-specific docs (install command, init walkthrough, auto-compact recommendation context)
- Final README (install instructions depend on npm package name)

**Can start at any time (no upstream dependencies):**

- Community infrastructure files (issue templates, code of conduct, contribution guidelines,
  PR template) — these don't depend on framework content
- Public repo scaffolding (create repository, configure settings, add community files)

---

## Dependencies

**Upstream (blockers):**

- WU1 complete — philosophy and configurability decisions required for docs site philosophy
  content, README positioning, and accurate "is this for me?" framing
- WU2 complete — final framework files required for accurate docs site content and examples;
  tier definitions must be implemented before docs describe them
- WU3 complete — functional CLI required before public repo migration, npm publish, and
  install-path docs

**Downstream:** None — WU4 is the final work unit.

**Cross-cutting:**

- npm package name (decided during WU3) affects README install instructions and docs site
  quick start
- Public repo name (TBD — `arc-framework` is current candidate) affects all URLs and
  GitHub Pages domain

---

## Open Questions

**Public repo name:** `arc-framework` is the current candidate. Confirm availability on
npm and GitHub before WU3 publishes. Decision should happen during WU3 so the package name
and repo name align.

**GitHub Discussions:** Evaluate at release time whether to enable. The question is whether
"how do I adapt this to my workflow?" conversations have a better home in Discussions vs.
issues. No strong opinion until there's an actual community to serve.

**Docs site versioning:** MkDocs Material supports versioned docs. Decide whether to
publish a versioned site at 1.0.0 or start with a single "latest" version. Simpler to
start unversioned and add versioning later.

**Comparison page scope:** The "ARC vs. alternatives" content is valuable but can be
time-consuming to get right. Decide whether this ships at launch or as a follow-on.
A minimal version (ARC vs. just CLAUDE.md) is probably sufficient for launch.

---

## Exclusions

- No methodology changes — that is WU2 scope
- No CLI changes — that is WU3 scope
- No back-porting decisions from WU1 — design is WU1's output, not WU4's
- No external tool integrations (Jira, Linear, etc.) — lower priority, future work
- No compatibility testing infrastructure — lower priority, future work
- No multi-agent or delegated workflow support — future scope

---

## Related Documents

- `plan-public-release.md` — source material this plan absorbs and supersedes for 1.0
  planning purposes
- `plan-distribution-and-update-system.md` — WU3 plan; auto-compact note originates here
- `plan-wu1-philosophy-configurability.md` — WU1 plan; ADR outputs are WU4 inputs
- `ROADMAP.md` — Phase D placement and dependency overview
