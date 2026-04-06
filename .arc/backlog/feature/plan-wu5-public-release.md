# Plan: Public Release (WU5)

**Purpose:** Make ARC Framework publicly available and adoptable — docs site with content, polished
README, public repo, community infrastructure, and release automation.

**Status:** Stub (content deferred from WU4; flesh out after beta testing)
**Created:** 2026-03-21
**Origin:** Split from original `plan-wu4-public-release.md` when WU4 scope narrowed to beta readiness

---

## Scope

WU5 takes the beta-tested, contributor-ready framework (WU4 output) and makes it public. This is
primarily a content and infrastructure work unit — the framework, CLI, and contributor mechanics are
done. WU5 writes the docs, sets up the community, and ships.

**Inputs from beta testing** will shape content priorities — which docs are most needed, what questions
adopters ask, where the CLI experience has friction.

**What WU5 produces:**

- Docs site methodology content (MkDocs Material + GitHub Pages operational content built in WU4)
- Full README rewrite (adoption-focused)
- Repo made public (clean initial commit from post-WU4 state — pre-public history stays private)
- Community infrastructure (issue templates, code of conduct, PR template, GitHub Discussions evaluation)
- Release automation (tag → build → npm publish → GitHub Release)
- npm 1.0.0 stable release

---

## Deferred Content from Original WU4 Plan

The following sections from the original plan contain substantial thinking worth preserving. Review and
adapt during WU5 planning — details may need updating after beta testing experience.

### Docs Site Content

- Conceptual orientation ("How ARC Works") — sessions, task-driven workflow, strategies, quality gates
- Philosophy deep-dives — why task-driven, why sessions, why agent-agnostic, why markdown-only
- Fully-formed examples — DEV-RULES.PROJECT for Django, React, data pipeline, CLI tool
- Tutorials and walkthroughs — first ARC session, creating task lists, setting up quality gates
- Comparison and positioning — ARC vs CLAUDE.md, vs Cursor rules, vs Skills, vs other frameworks
- Skills positioning — skills as trigger mechanism, content internal to ARC (review latest thinking)
- Nested agent files positioning — centralized vs proximity-based guidance
- Auto-compact/context-summarization recommendation for onboarding content

### README Rewrite

- Value proposition, philosophy summary, "is this for me?", quick start, docs site links
- Starting point: `arc-portfolio` repo's `projects.ts` framework description
- Positioning constraint: "here's our approach and why" — not "the only approach"

### Community Infrastructure

- Issue templates (bug report, feature request, question)
- Code of conduct (Contributor Covenant)
- PR template (context, change type, checklist)
- GitHub Discussions evaluation

### Release Automation

- npm trusted publishing (OIDC)
- Release workflow: tag push → build → npm publish → GitHub Release

### Positioning Guidance

Applies to all public content. ARC's approach is opinionated — public materials should acknowledge the
spectrum of AI collaboration patterns and be explicit about tradeoffs. "Here's our approach and why" —
not "the only approach."

---

## Pre-Public Extraction Candidates

Content in `.arc/reference/research/` that has value as personal/developer reference but
doesn't belong in the public repo. Extract to a private archive before the clean initial commit.

**Fully absorbed into strategies/ADRs** (citation-level detail only — strategies are authoritative):

- `research-attention-single-tasking.md` → strategy-core-philosophy (P2)
- `research-context-degradation.md` → strategy-session-management
- `research-context-loading.md` → strategy-context-loading
- `research-instruction-reliability.md` → strategy-context-loading
- `research-planning-lifecycle.md` → strategy-work-planning
- `research-session-lifecycle.md` → strategy-session-management

**Broad reference** (not tied to a single strategy — competitive/ecosystem surveys):

- `research-dev-methodology.md` → methodology inventory
- `research-dev-methodology-integration-mapping.md` → integration point mapping

**Still informing active work** (keep until their domains stabilize):

- `research-agent-landscape.md` → competitive landscape, ADR-005
- `research-agent-hooks-landscape.md` → hook ecosystem, WU4 scope
- `research-context-visibility-platforms.md` → platform-specific data
- `research-landscape-analysis-2026-02.md` → competitive snapshot

**Analysis docs** (`reference/analysis/`) — same treatment: extract before going public.

---

## Open Questions (Carried Forward)

- **GitHub Discussions:** Evaluate need based on beta testing experience
- **Docs site versioning:** Start unversioned, add versioning later
- **Comparison page scope:** Minimal version (ARC vs CLAUDE.md) may suffice for launch
- **Going public mechanism:** ADR-014 establishes single-repo with ownership convention (no mirror).
  Decide: fresh repo with squashed initial commit from clean state, or make the existing repo public
  (exposes full git history including messy exploration). Leaning toward fresh initial commit.

---

## Related Documents

- `plan-wu4-beta-readiness.md` — immediate predecessor; produces the inputs WU5 consumes
- `ADR-014` — contributor role model (implemented in WU4, informs community infrastructure)
- `prd-cli-implementation.md` — CLI that WU5 publishes at 1.0.0
- `ROADMAP.md` — Phase D placement
