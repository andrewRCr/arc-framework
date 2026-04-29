# Research: Work-Unit Grouping Patterns

**Purpose:** Evidence base for assessing whether ARC should adopt first-class notation for
linked work-unit halves — two independently PR-reviewable WUs that constitute a single logical
deliverable (e.g., `interlock-foundation` + `session-operational-flow`).

**Research scope:** Agile hierarchy patterns (themes, initiatives, epics, capabilities), VCS-native
linking (stacked PRs, feature-branch hierarchies, branch naming), metadata/linking conventions
(GitHub sub-issues, cross-references, RFC+impl pairs), and tooling ecosystems.

**Date:** 2026-04-28

---

## Patterns Surveyed

| Pattern | Domain | Primary Use | Mechanism |
| ------- | ------ | ----------- | --------- |
| **Epics + Initiatives** | Agile hierarchy | Multi-sprint feature grouping | Issue tracker, 2–3 level nesting |
| **SAFe Capabilities** | Portfolio scaling | Organizational alignment (4 levels) | PI-based cadence, formal hierarchy |
| **Themes** | Strategic labeling | Cross-team goal alignment | Lightweight labels/grouping, no structure |
| **Stacked PRs** | VCS-native linking | Linear code review chains | Tool-specific (Graphite, Gerrit) + rebasing discipline |
| **Feature-branch hierarchy** | Git strategy | Sub-feature parallel work | Parent branch as integration point |
| **RFC + impl pair** | Documentation-first | Design-then-code separation | Two sequential artifacts (RFC → PRs) |
| **GitHub sub-issues** | GitHub-native | Task decomposition | First-class parent-child hierarchy (GA 2024) |
| **Naming conventions** | Lightweight | Branch/PR organization | Prefixes/suffixes (`-p1`, `-part1`, `:2`) |
| **Release trains** | SAFe/schedule | Multi-team cadence alignment | 8–12 week PI container for multiple teams |
| **Spikes** | Agile exploration | Investigation precedes stories | Time-boxed story, feeds downstream work |

---

## Fit Assessment for ARC's Grain

ARC is branch-mapped, doc-first, configurable-conventions, and lightweight. The test: does a
pattern add value without process formality?

### What Does NOT Fit

**Epics / Initiatives / SAFe Capabilities:** All assume issue-tracker-as-primary-graph. ARC is
PRD + branch + status-file; issues are optional (GitHub Projects integration is a future
strategy, not current). The tracker hierarchy would duplicate or override ARC's existing PRD
relationships and WU status files. Cost (tracker-native tooling, per-issue setup) exceeds
benefit for the grain. Verdict: **Over-formalization.** Epics work well in Jira/Asana; they
collide with ARC's doc-centric model.

**Release Trains:** Designed for multi-team cadence synchronization. ARC explicitly excludes team
coordination methodology (see META-PRD § Out-of-Scope). Single-developer + agent or small teams
don't need 8–12 week PI containers. Verdict: **Wrong scope.** Applicable only when scaling beyond
ARC's design envelope.

**Stacked PRs (Graphite/Gerrit):** Powerful for code-review chains but require dedicated
tooling + CI integration. ARC's GitHub-native default assumes standard PR flow. Manual stacking
rebasing violates the sequential-focus principle (context thrashing). Verdict: **Tooling debt
exceeds benefit.** Good fit for high-velocity shops; wrong fit for the collaboration-first grain.

### What Partially Fits

**Feature-branch hierarchy (Git native):** Parent branch as integration point, child branches
branch from parent. No dedicated tooling; works in vanilla Git. Trade-off: requires discipline
(manual merge management, rebasing coordination). For ARC's case (two linearly-related WUs), the
benefit is low — no parallel sub-work — but the cost is real (extra merge ceremony). Verdict:
**Applicability is narrow.** Fits multi-threaded epics; doesn't buy much for sequential splits.

**GitHub Sub-Issues:** First-class hierarchy; lightweight metadata; works in GitHub. Trade-off:
requires issues as tracking medium, not optional. ARC could adopt this but would need convention
for PR-issue linkage and visibility rules (which sub-issues represent WUs vs tasks?). Verdict:
**Viable if issue-tracker adoption happens.** Out of scope for current doc-first model.

**RFC + Impl Pair:** Two sequential, linked artifacts (RFC document → implementation PRs).
Semantic clarity is high — RFC is explicitly design, PRs are explicitly code. Trade-off: adds
governance step and artifact overhead. Relevant for framework (where ADRs are decision docs), not
typical feature work. Verdict: **Niche applicability.** Fits methodology documentation; doesn't
generalize to feature WUs.

### What Does Fit

**Spikes + Follow-up Stories:** Exploration task precedes implementation task; lightweight
dependency. Used across industry; minimal tooling (naming convention + doc link). Maps well to
ARC: a spike WU (research/investigation plan) can cross-reference its implementation WU (standard
PRD) in a section like § Investigation Prerequisites or § Spike Dependencies. Verdict: **Low
friction; natural fit.** Already present informally in ARC; could be formalized.

**Naming Conventions (Prefixes/Suffixes):** Branch names like `session-ops-part1` /
`session-ops-part2` or `interlock-foundation` / `interlock-integration` signal relationship at
a glance. No tooling cost; works in vanilla Git. Trade-off: convention discipline and
documentation clarity. Verdict: **Minimal friction; good ergonomics.** Human-readable and
compatible with ARC's lightweight style.

**Cross-linking in Documentation:** PRD header section (e.g., § Related WUs) with bullet links
to sibling PRDs and branch names, mirrors current ARC pattern (plans link to ADRs, PRDs link to
research docs). No new mechanism; extends existing practice. Verdict: **Lightweight; already
compatible.** Costs only documentation clarity.

---

## Industry State

No dominant pattern emerged. Stacked PRs are most mature but tooling-dependent. Agile hierarchies
(epics, initiatives) assume issue-tracker primacy. GitHub sub-issues are new (GA 2024) but still
optional. Most teams use lightweight conventions (naming, documentation) plus tracker linking
where a tracker exists. The space is genuinely unsettled — no standard answer.

---

## Recommendation

**Adopt lightweight cross-linking convention for related WUs; punt dedicated notation.**

ARC should formalize a documentation-based convention for WU groups without introducing
first-class grouping construct. Rationale:

1. **Simplicity:** No new abstractions, no tooling, no process overhead. Fits ARC's grain
   (branch-mapped, configurable-conventions, doc-first).

2. **Flexibility:** Accommodates both sequential splits (A→B) and parallel work (parent epic with
   child WUs) under the same convention. Spikes + follow-ups. Investigation + implementation.
   Carveouts. All express as cross-linked WUs.

3. **Compatibility:** Layerable on top of GitHub, Gitea, Gitlab without custom integration. Works
   in ARC-in-git (zero infrastructure) and issue-tracker scenarios (future).

**Adoption shape:**

Add § Related WUs section to PRD template (between § Concurrency Model and § Scope or as
subsection of § Context). Template:

```
## Related WUs

**Upstream / Prerequisite WUs:**
- `prd-{upstream-name}.md` — brief rationale why this WU depends on it

**Downstream / Follow-on WUs:**
- `prd-{downstream-name}.md` — brief rationale why downstream work depends on outputs

**Sibling / Parallel WUs (same logical whole):**
- `prd-{sibling-name}.md` on branch `technical/{sibling-branch}` — shared context: both
  halves of the {concept-name} execution
```

Wire into planning PRD generation (populate automatically from upstream plan) and add to
QUICK-REFERENCE as optional convention (omit if WU is independent).

**Example (current case):**

`prd-session-operational-flow.md` § Related WUs:

```
**Upstream / Prerequisite WUs:**
- `prd-interlock-foundation.md` — establishes ADR-016 gate model and constitutional amendments;
  this WU implements core behavioral modes downstream of that frame

**Sibling / Parallel WUs (same logical whole):**
- `prd-interlock-foundation.md` on branch `technical/interlock-foundation` — both halves of
  the session-operational-flow constitutional and behavioral execution
```

Result: Cross-linkage is explicit, machine-scannable in PRD header, human-readable, adds zero
tooling cost, and requires only documentation discipline.

---

## Rationale for Rejection of Alternatives

**Why not GitHub sub-issues?** Requires issue-tracker adoption and adds hierarchy to two
separate systems (git branch naming + issue structure). Introduces coordination cost. Deferred
until issue-tracker strategy is decided.

**Why not stacked PRs?** Tooling cost, context-thrashing risk, and incompatibility with ARC's
sequential-focus model for human review. Applicable only in high-velocity, deterministic code
flows.

**Why not branch hierarchy (parent-branch pattern)?** Low benefit for sequential splits; adds
merge ceremony without corresponding win. Better as local practice for multi-threaded epics, not
a framework convention.

**Why not naming suffixes (e.g., `-p1`/`-p2`)?** Works but inferior to explicit documentation.
Requires external knowledge to decode; documentation section is more discoverable and flexible.

## Sources

**Agile hierarchy patterns:**

- [Atlassian — epics][agile-epics]
- [Atlassian — themes, epics, stories][agile-themes-epics]
- [SAFe capabilities][safe-capabilities]
- [SAFe hierarchy explained][safe-hierarchy]

**VCS-native linking:**

- [Graphite — stacked diffs guide][stacked-diffs-guide]
- [Awesome Code Reviews — stacked PRs][stacked-prs-complete]
- [Pragmatic Engineer — stacked diffs][pragmatic-stacked-diffs]
- [Driessen — gitflow original post][gitflow]
- [Atlassian — feature branch workflow][feature-branch-workflow]
- [DEV — feature-branch-hierarchy practical guide][feature-branch-hierarchy]

**RFC + impl pattern:**

- [TensorFlow RFC process][rfc-process]
- [Team guide to RFCs (Medium)][rfc-guide]
- [Fuchsia RFC best practices][rfc-best-practices]

**GitHub sub-issues:**

- [GitHub — adding sub-issues][github-sub-issues]
- [GitHub — parent/sub-issue progress fields][github-sub-issues-progress]
- [GitHub blog — sub-issues GA announcement][github-sub-issues-announce]

**Spikes:**

- [Plane — what is a spike][spike-definition]
- [The Knowledge Academy — spikes in Scrum][spike-scrum]
- [Wrike — spike story in agile][spike-wrike]

**Release trains and naming conventions:**

- [Parallel — what is an Agile release train][release-train]
- [Agile Seekers — release trains continuous delivery][release-train-continuous]
- [Graphite — git branch naming conventions][branch-naming-conventions]
- [Medium — branch naming cheatsheet][branch-naming-medium]
- [Pullpanda — branch naming best practices][branch-naming-pullpanda]
- [Medium — monorepo naming conventions][monorepo-naming]
- [Monorepo tools landscape][monorepo-tools]
- [GitHub linking practices][github-linking]

---

[agile-epics]: https://www.atlassian.com/agile/project-management/epics
[agile-themes-epics]: https://www.atlassian.com/agile/project-management/epics-stories-themes
[safe-capabilities]: https://agility-at-scale.com/safe/lpm/epics/
[safe-hierarchy]: https://www.enov8.com/blog/the-hierarchy-of-safe-scaled-agile-framework-explained/
[stacked-diffs-guide]: https://graphite.com/guides/stacked-diffs
[stacked-prs-complete]: https://www.awesomecodereviews.com/best-practices/stacked-prs/
[pragmatic-stacked-diffs]: https://newsletter.pragmaticengineer.com/p/stacked-diffs
[gitflow]: https://nvie.com/posts/a-successful-git-branching-model/
[feature-branch-workflow]: https://www.atlassian.com/git/tutorials/comparing-workflows/feature-branch-workflow
[feature-branch-hierarchy]: https://dev.to/edriso/our-git-branching-development-workflow-a-practical-guide-37nd
[rfc-process]: https://www.tensorflow.org/community/contribute/rfc_process
[rfc-guide]: https://medium.com/juans-and-zeroes/a-thorough-team-guide-to-rfcs-8aa14f8e757c
[rfc-best-practices]: https://fuchsia.dev/fuchsia-src/contribute/governance/rfcs/best_practices
[github-sub-issues]: https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/adding-sub-issues
[github-sub-issues-progress]: https://docs.github.com/en/issues/planning-and-tracking-with-projects/understanding-fields/about-parent-issue-and-sub-issue-progress-fields
[github-sub-issues-announce]: https://github.blog/engineering/architecture-optimization/introducing-sub-issues-enhancing-issue-management-on-github/
[spike-definition]: https://plane.so/blog/what-is-a-spike-in-agile-definition-types-and-examples
[spike-scrum]: https://www.theknowledgeacademy.com/blog/what-is-spike-in-scrum/
[spike-wrike]: https://www.wrike.com/agile-guide/faq/what-is-a-spike-story-in-agile/
[release-train]: https://www.parallelhq.com/blog/what-agile-release-train
[release-train-continuous]: https://agileseekers.com/blog/how-release-trains-enable-continuous-delivery-in-safe-environments/
[branch-naming-conventions]: https://graphite.com/guides/git-branch-naming-conventions
[branch-naming-medium]: https://medium.com/@abhay.pixolo/naming-conventions-for-git-branches-a-cheatsheet-8549feca2534
[branch-naming-pullpanda]: https://pullpanda.io/blog/git-branch-naming-conventions-best-practices
[monorepo-naming]: https://medium.com/disdj/monorepo-scripts-strategies-naming-conventions-691c64b51acb
[monorepo-tools]: https://monorepo.tools/
[github-linking]: https://www.brazenbraden.com/posts/github_process/
