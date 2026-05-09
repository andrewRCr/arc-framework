# Research: Concurrent Work at the Mechanism Layer

**Purpose:** Evaluate source-control patterns for managing parallel in-flight branches, with focus on
branching strategies, conflict detection, and scope-declaration mechanisms. Assess whether ARC's emerging
approach (worktree-by-default, overlap detection between WUs) aligns with idiomatic industry practice.

**Date:** 2026-05-08

**Scope:** Trunk-based development, GitFlow variants, stacked PRs, monorepo tooling, merge queues, CODEOWNERS,
pre-merge conflict detection, git worktree usage, solo-developer patterns.

---

## 1. Patterns Surveyed

### Branching Strategies at Scale

| Strategy                          | Adoption                                      | Mechanism                                                               | Concurrency Model                                           | Conflict Handling                                               |
| --------------------------------- | --------------------------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------- | --------------------------------------------------------------- |
| **Trunk-Based Development (TBD)** | High (DORA recommendation)                    | Short-lived feature branches (1-2 days), frequent merge to main         | Continuous; feature flags decouple deploy from release      | CI/CD simulates merge; flags prevent breaking user exposure     |
| **GitHub Flow**                   | High (GitHub native, simplicity)              | One main + feature branches; PR-driven integration                      | Linear; one feature per branch until merge                  | Pre-merge CI; merge queue testing (GitHub 2026 native)          |
| **GitFlow**                       | Medium (declining, complex projects)          | main + develop + release/hotfix branches; feature branches from develop | Parallel features on develop; structured release boundaries | Manual merge management; release branches as integration buffer |
| **Stacked PRs**                   | Low-medium (Graphite/ghstack adoption; niche) | Linear dependency chain; parent-child branch relationships              | Controlled; strict ordering enforced by tooling             | Cascading rebases; tooling prevents out-of-order merges         |

**Key Finding:** Trunk-based development is now considered best practice for modern CI/CD
([Atlassian][tbd-atlas], [DORA][dora-tbd]). GitFlow is falling from favor in high-velocity teams. GitHub Flow
(TBD variant) dominates small-to-medium teams. Stacked PRs are specialized tooling for high-cadence shops
(Meta, Graphite clients).

### Conflict Detection & Avoidance Mechanisms

#### Pre-Merge Simulation

**Mechanism:** CI/CD pipelines test proposed merges against actual target state before commit.

- **GitHub native (2026):** Merge queue creates temporary test branches including PR + latest main, runs full
  suite before landing ([Mergify docs][mergify-merge-queue], [InfoQ 2026][infoq-stacked-prs])
- **Mergify:** Same model; adds parallel scopes (frontend PR doesn't wait behind backend migration), batched
  CI runs ([Mergify origin story][mergify-origin])
- **Bors/Homu (historical):** Predecessors to modern merge queues; prevent merge skew ([Bors docs][bors-docs])
- **Local pre-merge:** `git merge-tree` (non-destructive), `git merge --no-commit --no-ff` show conflicts
  before committing ([Atlassian merge conflicts][atlassian-merge])

**Trade-off:** Merge queues add CI latency (minutes to test before landing) but guarantee main branch
stability. Essential at scale; optional for solo/small teams.

#### Dependency-Aware Tooling

**Monorepo scope detection (Nx, Turborepo):**

- **Nx:** Project graph + `nx affected` command; precise "which projects does this change impact" detection.
  Skips 70-80% of CI work in 20-app monorepo when single library changes ([Nx docs][nx-vs-turborepo],
  [PkgPulse 2026][pkgpulse-turborepo])
- **Turborepo:** Hash-based approach; simpler but less precise at scale; good for smaller monorepos
  ([Turborepo docs][turborepo-hashbased])
- **Bazel:** Build-graph-based; similar precision to Nx ([monorepo.tools][monorepo-tools])

**Scope enforcement (Nx, ESLint):**

- **Enforce-module-boundaries rule:** Projects tagged; rules define allowed dependencies (e.g., "domain X
  cannot depend on internal-api Y") ([Nx module boundaries][nx-boundaries])
- **Dependency Cruiser:** Framework-agnostic; validates dependency rules, detects circular dependencies
  ([Tweag 2025][tweag-dependency])

**Critical observation:** Monorepo tooling surfaces _what changes affect_ via graph queries; none explicitly
flag "overlap with in-flight branch X."

#### CODEOWNERS as Scope Signal

**Mechanism:** File-path → team/person mapping; branch protection rules can enforce code-owner approval before
merge.

- **Scope declaration:** `CODEOWNERS` file defines file-path→owner; GitHub shows owners before PR ([GitHub
  CODEOWNERS][github-codeowners])
- **Branch protection:** "Require review from Code Owners" enforcement rule ([Arnica
  guide][arnica-codeowners])
- **Limitations:** Signals ownership/review requirement; does NOT flag overlapping in-flight work across
  branches

**Critical observation:** CODEOWNERS is _prescriptive (who must review)_, not _predictive (what will
conflict)_.

### Git Worktree Usage in Practice

#### Industry Adoption

- **Common use cases:** Hotfix context-switching, parallel testing, code review isolation, AI agent workspaces
  ([Medium guides][medium-worktree1], [Medium AI agents][medium-worktree-ai])
- **Organizational practice:** Developers create `.../project.worktrees/` directory with per-branch
  subdirectories; naming conventions help track tasks ([Dev Community][dev-worktree-boss])
- **Performance advantage:** Shared object store (no duplication of 50GB history per clone); each worktree
  adds 2-5GB for working files ([Dev Community practical][dev-worktree-practical])
- **Adoption level:** IDIOMATIC for fast-paced startups + enterprises; standard for monorepos; still opt-in
  (not mandatory) in most workflows

**Critical finding (contradicts 2026-04-28 external research):** Worktrees are increasingly common and
_expected_ in monorepo / multi-agent scenarios, but remain _opt-in_ as a general practice. ARC's
"worktree-by-default" is **forward-looking but not yet idiomatic.**

### Stacked PRs: Dependency-Chain Management

#### Tooling Ecosystem

**Graphite, ghstack, Git Town, Sapling, spr:** All manage parent-child branch relationships and cascading
rebases.

- **Dependency tracking:** Graphite's `gt log short` visualizes stack; GitHub's 2026 native ghstack includes
  server-side stack map in PR UI ([Graphite stacked diffs][graphite-stacked], [InfoQ 2026][infoq-stacked-prs])
- **Cascading rebases:** When parent rebases, child automatically rebased; one-click rebase-all (Graphite
  guides)
- **Review model:** Each PR in stack reviews only _its delta_ from parent, not cumulative code ([Awesome Code
  Reviews][awesome-stacked])
- **Adoption:** Niche; specialized for high-cadence teams (Google, Meta); rare in typical projects

**Critical observation:** Stacked PRs manage _linear_ dependencies (A → B → C); does NOT address _parallel_ WU
overlap (A ∩ B = shared files, unordered).

### Merge Queues and Concurrency

#### GitHub Merge Queue (2026 Native)

- **Mechanism:** Temporary test branches (PR + latest main + queued PRs) tested before any landing ([Mergify
  FAQ][mergify-faq])
- **Parallelization:** Mergify supports scope-based parallel queues; GitHub native does not ([Mergify
  parallel][mergify-parallel])
- **Conflict avoidance:** Tests against _actual merge state_, not branch tip; prevents semantic merge
  conflicts

**Implication for ARC:** Merge queues assume main-branch convergence point. They reduce conflict frequency but
do NOT predict overlap between work units before they're code-ready.

### Draft PR Conventions & WIP Signaling

**Idiomatic practice:**

- **Native Draft status:** GitHub/GitLab `Draft` flag (preferred); no additional setup ([Medium branch
  naming][medium-branch-naming])
- **Title conventions:** `[WIP]`, `Draft:`, `IN PROGRESS:` prefixes (when native Draft unavailable) ([Medium
  naming][medium-branch-naming])
- **Semantics:** Signals "not ready for review"; prevents accidental merge; no formal mechanism

**Observation:** Draft status is _advisory_, not _structural_. It doesn't prevent work on same files; it just
signals "don't review yet."

### Solo Developer Patterns (3-5 In-Flight Branches)

**Observed practices:**

- **Git Flow adapted for solo:** Develop branch as integration point; feature branches short-lived and
  carefully merged ([Bedroom Coder][bedroom-coder])
- **Trunk-based solo:** Very short branches (hours to 1-2 days); feature flags for incomplete work ([Mikkel
  Paulson][mikkel-paulson])
- **Branch discipline:** Small, focused branches reduce merge conflicts; good habits include deleting merged
  branches ([Swarthmore ITS][swarthmore-git])
- **No explicit overlap detection:** Solo developers manage 3-5 branches by _mental model_; conflicts
  discovered at merge time, not predicted before

**Observation:** Solo developers do NOT use proactive overlap detection. They rely on branch discipline (small
scope) + merge-time conflict resolution.

---

## 2. Vocabulary: Idiomatic Terminology

At the mechanism layer, teams use these terms consistently:

| Term                                | Meaning                                                              | Example Context                                               |
| ----------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------- |
| **In-flight branch**                | Unmerged branch with work in progress                                | "We have 3 in-flight branches for the payment module"         |
| **WIP (Work In Progress)**          | Advisory marker; signals "not review-ready"                          | `[WIP] Add payment webhook handler`                           |
| **Draft PR**                        | GitHub/GitLab native status; blocks accidental merge                 | GitHub Draft status on PR (no merge button)                   |
| **Feature branch**                  | Bounded unit of work; merges to main/develop                         | `feature/add-oauth-provider`                                  |
| **Short-lived / long-lived**        | TBD: ≤2 days; GitFlow: ≤1 week typical; stacked PRs: ≤1 day per PR   | "Keep feature branches short-lived to minimize drift"         |
| **Stacked (stack, parent/child)**   | Linear dependency; child depends on parent; rebased as unit          | "Graphite's stack visualization shows the parent-child chain" |
| **Affected scope / affected graph** | Monorepo term; which projects/files downstream of change             | "The change affects 3 projects; run affected tests only"      |
| **Scope**                           | Set of files/modules touched by a branch                             | "This branch's scope overlaps with #843; watch for conflicts" |
| **Main branch / trunk / develop**   | Integration point; source of truth for tests/release                 | TBD: main; GitFlow: develop; monorepo: main or main + develop |
| **Merge conflict**                  | Textual overlap when combining branches                              | Discovered at merge time; git shows conflict markers          |
| **Semantic merge conflict**         | No textual overlap, but combined changes break tests                 | Merge queues specifically target this failure mode            |
| **Rebase**                          | Reorder commits onto new base; integrates upstream changes           | `git rebase main`; stacked tools do this automatically        |
| **Code ownership / CODEOWNERS**     | File-path → team; signals who reviews; not predictive of conflict    | GitHub CODEOWNERS file; branch protection enforces            |
| **Merge queue**                     | CI-backed queue; tests PRs against actual merge state before landing | Mergify, Bors, GitHub native (2026)                           |

**Consensus observation:** No single term for "overlap between in-flight branches." Teams use "scope overlap,"
"concurrent changes," or "potential conflict" informally. No idiomatic abbreviation.

---

## 3. Idiomatic vs. Anti-Pattern

### What's Considered Good Practice

**Idiomatic at scale (DORA/DevOps consensus):**

1. **Trunk-based development:** Main branch always deployable; feature flags decouple deploy from release.
   Short-lived branches (1-2 days); high integration frequency ([DORA TBD][dora-tbd], [Atlassian
   TBD][tbd-atlas])

2. **Small, focused PRs:** 200-400 LOC target; vertical slicing (feature-complete per layer); not horizontal
   (layer-by-layer splits). Reviewable in 30-60 minutes (PR sizing research)

3. **Feature flags for incomplete work:** Enable selective activation/deactivation; isolate interactions;
   decouple deploy from release ([Atlassian TBD][tbd-atlas])

4. **Merge queues for main-branch stability:** Test against actual merge state; prevent semantic merge
   conflicts at scale ([Mergify docs][mergify-merge-queue], [GitHub docs][github-merge-queue])

5. **CODEOWNERS for ownership clarity:** Signal who reviews; enforce via branch protection. For scope
   detection. ([GitHub CODEOWNERS][github-codeowners])

6. **Git worktrees for context-switching:** Avoid stash/unstash overhead; parallel testing + hotfixes without
   disruption ([Medium guides][medium-worktree1])

7. **Named branches with consistent prefixes:** `feature/`, `bugfix/`, `hotfix/`, `refactor/`; optional ticket
   number; lowercase, hyphen-separated ([Medium naming][medium-branch-naming], [Graphite
   conventions][graphite-naming])

8. **Draft PR status for work-in-progress signaling:** Native GitHub/GitLab flag (preferred); title prefixes
   as fallback. Advisory only; no structural enforcement. ([GitHub draft docs][github-draft])

### Known Anti-Patterns

1. **Horizontal slicing (layer-by-layer PRs):** Database PR → API PR → Frontend PR. Each PR meaningless
   without next. Violates vertical-slice principle. (PR sizing research)

2. **Long-lived feature branches (>1 week):** Drift from main; merge conflicts compound; integration pain
   grows. TBD targets ≤2 days. ([Atlassian TBD][tbd-atlas])

3. **Merging without integration testing:** Passing tests on PR ≠ passing tests on merged main (semantic merge
   conflicts). Merge queues address this. ([Mergify docs][mergify-merge-queue])

4. **Stashing/unstashing for context-switching:** Cognitive overhead; easy to lose work; git worktrees are
   better. ([DEV Community][dev-worktree-practical])

5. **No scope declaration:** Files changed hard to discover; code owners unclear; overlap invisible until
   merge. CODEOWNERS + documented scope helps. ([GitHub CODEOWNERS][github-codeowners])

---

## 4. Mapping vs. ARC

### Direct Alignment

**✓ Branch-per-worktree model:** ARC's "one WU = one branch + one worktree" maps to TBD + worktree idioms.
Well-supported by industry tooling and practice.

**✓ Status files as scope declaration:** ARC's tracked status file (describing branch, scope, state) parallels
CODEOWNERS + merge-queue metadata in function (scope visibility). Lighter-weight than CODEOWNERS; fully
declarative.

**✓ WU as vertical slice:** ARC PRD structure (phases, tasks, acceptance criteria) naturally yields vertical
slices. Aligns with empirical PRD sizing best practices.

**✓ Worktrees for parallel WUs:** Git worktrees' shared object store + isolated working trees match ARC's
spawn operation. Addresses context-switching overhead.

### Adaptations Needed

**? Overlap detection timing:** Current research shows overlap is _discovered at merge time_, not predicted
before. ARC is considering _preventive detection_ at WU-creation time. This requires:

- **Scope scanning:** Status files (or branch metadata) must be machine-readable; ARC already plans this (WU
  status shape includes file scope)
- **Diff prediction:** Parse PRD/scope against in-flight branches' committed scope; highlight overlap; warn
  (not block)
- **Open question:** Should overlap detection be mandatory (block WU creation) or advisory (warn in plan
  phase)? Industry practice: advisory. See counter-norm flags below.

**? Stacked-PR dependency tracking:** If ARC spawns sequential WUs (A → B → C), consider whether stacked-PR
tools' parent-child visualization would help. Current ARC plan: Related WUs section in PRD (documentation);
not tool-enforced. This is lighter than stacked-PR tooling but less automated.

### Direct Contradictions

None identified. ARC's shape is compatible with TBD + GitHub Flow + worktree idioms. Counter-norms (below) are
intentional departures, not contradictions.

---

## 5. Counter-Norm Flags: Where ARC Departs from Idiomatic Practice

### MAJOR

1. **Worktree-by-default (not opt-in):** ARC plans worktree for all non-trivial WUs. Industry practice:
   worktrees are common but remain opt-in. Most developers choose worktrees for hotfixes/parallel testing; ARC
   mandates for all multi-phase work.
    - **Rationale:** Addresses session-context isolation for AI agents; justified for ARC's use case
      (multi-agent parallel work)
    - **Risk:** Friction for developers used to single worktree; disk overhead if not managed (mitigated by
      shared object store)
    - **Mitigation:** Document worktree discipline; provide tooling to list/clean dangling worktrees

2. **Overlap detection between in-flight WUs:** ARC is considering whether to flag scope overlap _before_ WU
   creation. Industry practice: overlap discovered at merge time, never proactively detected.
    - **Rationale:** Multi-agent parallel work benefits from early warning; reduces surprise merge conflicts
    - **Risk:** False positives (overlap detected but not problematic); false negatives (hidden conflict);
      requires robust scope-parsing
    - **Status:** Open design question; this research suggests **advisory (warn) not mandatory (block)**. See
      recommendation below.

### MODERATE

3. **Status-file-as-scope-tracker:** ARC's WU status file describes scope (files touched, modules affected).
   Industry uses CODEOWNERS (ownership signal) + merge-queue metadata (test results). ARC's status file is
   more lightweight but requires custom parsing.
    - **Rationale:** Fits ARC's doc-first, configurable-conventions style; no new infrastructure
    - **Risk:** Parser complexity if scope rules become rich; documentation burden if format drifts
    - **Mitigation:** Lock scope format in schema; version it explicitly

4. **Planned dependency model (Related WUs section):** ARC plans explicit cross-linking in PRDs (Related WUs
   section). Stacked-PR tools do this with rebasing; GitHub sub-issues do it with native hierarchy. ARC's
   approach is purely documentary.
    - **Rationale:** Lightweight; no tooling; works in vanilla git + markdown
    - **Risk:** No automatic enforcement (unlike stacked PRs or sub-issues); requires discipline
    - **Mitigation:** Automate validation in pre-commit/merge hooks (e.g., warn if Related WU is missing for
      sequential work)

### MINOR

5. **Manual worktree cleanup:** ARC worktrees are per-session; cleanup is explicit (via `ExitWorktree` or
   `git worktree remove`). Some tools (GitHub Copilot Workspace) auto-clean ephemeral worktrees.
    - **Risk:** Disk accumulation if cleanup is forgotten
    - **Mitigation:** Session hygiene tools; periodic cleanup warnings; documentation

6. **No native merge queue (yet):** ARC assumes GitHub / standard PR flow. Merge queues (Mergify, GitHub 2026
   native) are optional; ARC does not mandate.
    - **Rationale:** Merge queues add latency; not essential for small teams; easy to adopt later
    - **Risk:** Semantic merge conflicts at scale (if many WUs in-flight)
    - **Mitigation:** Document merge-queue as scaling pattern; provide integration guide

---

## 6. Is Overlap Detection Idiomatic?

**Hypothesis (from brief):** Overlap detection between in-flight branches is mostly NOT idiomatic; most teams
discover overlap at merge-conflict time.

**Verification:** ✓ **CONFIRMED**

Evidence:

1. **Merge queues test against merge state, not branches:** They catch _actual_ merge conflicts, not
   _predicted_ ones. Testing is downstream of creation. ([Mergify docs][mergify-merge-queue])

2. **Monorepo tooling surfaces "affected" graph, not "overlaps with in-flight":** Nx can tell you "this change
   affects 3 projects" but NOT "this change overlaps with branch X's scope." That would require
   branch-listing + diff-against-all-in-flight. No tool does this. ([Nx docs][nx-vs-turborepo])

3. **CODEOWNERS is prescriptive, not predictive:** Ownership signal for review, not conflict warning. ([GitHub
   CODEOWNERS][github-codeowners])

4. **Solo developers manage 3-5 branches by mental model:** Essays on solo workflows never mention proactive
   overlap detection. Overlap is resolved at merge time. ([Bedroom Coder][bedroom-coder], [Mikkel
   Paulson][mikkel-paulson])

5. **Draft PR + WIP signals are advisory, not structural:** They don't prevent work; they just signal "in
   progress." No pre-merge overlap blocking. ([GitHub draft docs][github-draft])

6. **No documented tools for "find conflicts with in-flight branches":** GitHub, GitKraken, VS Code,
   merge-queue tools all check for conflicts _at merge time_, not before. Simulated merge (`git merge-tree`)
   exists but requires user initiation. ([Atlassian merge][atlassian-merge], [GitKraken conflict
   prevention][gitkraken-conflicts])

**Conclusion:** Overlap detection is **NOT idiomatic**. It's a novel ARC contribution. If implemented, keep it
**advisory** (warn user) rather than **prescriptive** (block WU creation). Teams at scale tolerate merge
conflicts as part of workflow (merge queues + rebasing + fixes). Early detection would require significant
scope-parsing infrastructure.

---

## 7. Is Worktree-by-Default Idiomatic?

**Hypothesis (from 2026-04-28 research):** Worktrees are typically opt-in, not mandatory.

**Verification:** ✓ **CONFIRMED** (with caveat)

Evidence:

1. **Worktrees are opt-in in Git:** No default; user creates explicitly (`git worktree add`). ([Git
   docs][git-worktree-docs])

2. **Industry practice: selective use:** Developers use worktrees for _specific scenarios_ (hotfixes, parallel
   testing, code review). Most daily work uses single worktree. ([Medium guides][medium-worktree1], [Dev
   Community][dev-worktree-practical])

3. **Monorepos are the exception:** Monorepo teams (Google, Meta, Nx users) expect worktrees as standard
   practice. Shared object store makes them cost-effective. ([Medium AI agents][medium-worktree-ai])

4. **AI agents + parallel work favor worktrees:** OpenAI Codex, Claude Code, and multi-agent systems benefit
   from isolated worktrees per agent. ([Medium AI agents][medium-worktree-ai])

**Conclusion:** Worktrees are **idiomatic for monorepos and multi-agent systems**, but **NOT idiomatic as
mandatory default for all work units**. ARC's "worktree-by-default for non-trivial WUs" is:

- **Justified for ARC's use case** (AI agent per WU; shared codebase; multi-session continuity)
- **Forward-looking** (aligns with emerging multi-agent + monorepo practices)
- **Not yet standard practice** for individual developers or small teams

**Mitigation:** Document the intentionality; make worktree creation explicit and discoverable (not silent);
provide cleanup tooling.

---

## 8. Scope Declaration Conventions

**Existing approaches:**

1. **CODEOWNERS:** File-path → owner; enforced via branch protection. Signals ownership; not scope. ([GitHub
   CODEOWNERS][github-codeowners])

2. **Monorepo project tags + rules:** `sourceTag` / `onlyDependOnLibsWithTags` in Nx; defines scope
   constraints. Visible via `nx dep-graph`. ([Nx boundaries][nx-boundaries])

3. **Merge-queue metadata:** Test results show what was affected; visible post-merge. Not pre-merge
   prediction. ([Mergify docs][mergify-merge-queue])

4. **Documentation (RFCs, PRDs, commit messages):** Natural-language scope description; not machine-scannable;
   used by teams at scale. ([TensorFlow RFC process][tensorflow-rfc])

5. **ARC's status-file approach:** Machine-readable WU status (scope: files, modules, areas touched);
   declarative. Novel; not yet industry-standard.

**Observation:** No uniform mechanism across industry. Most teams combine CODEOWNERS (ownership) +
documentation (scope narrative) + merge-time conflict detection (reality check).

**ARC's contribution:** Status-file scope + Related WUs section = explicit, machine-scannable,
documentation-first. Lighter than sub-issues; more structured than free-form PRDs.

---

## Synthesis & Recommendations

ARC's emerging mechanism-layer design is **compatible with modern source-control practice** with two
intentional deviations:

1. **Worktree-by-default:** Not yet idiomatic for solo developers, but well-justified for multi-agent +
   monorepo scenarios. ARC should document this intentionality and ensure tooling makes worktree lifecycle
   transparent.

2. **Overlap detection (if pursued):** Industry does NOT do this; overlap is discovered at merge time. If ARC
   implements pre-merge overlap detection, **keep it advisory (warn, don't block)**. Require robust
   scope-parsing and be transparent about false-positive / false-negative rates. Consider deferring to Phase 2
   (post-MVP) if it adds significant implementation cost.

**Three key takeaways for ARC's direction:**

- **Embrace TBD + GitHub Flow conventions:** Short-lived branches, PR-driven integration, feature flags for
  incomplete work. ARC's branch-per-WU model aligns naturally.

- **Status-file scope as lightweight CODEOWNERS alternative:** Document scope explicitly in WU status; use it
  for Related WUs cross-linking. Machine-scannable; no new infrastructure. Validation can be deferred to
  pre-commit hooks.

- **Worktrees as intentional design choice, not accidental:** Clearly signal "worktree-by-default for WUs" as
  a departure from solo-developer norms, justified by multi-agent isolation. Provide cleanup + discovery
  tooling. Document trade-offs (disk, complexity) openly.

**For the open question on overlap detection:** Recommend starting with _advisory overlap detection_ (scan
in-flight branches' scope; warn if overlap detected; let user decide). Implement as opt-in / informational
flag in WU-creation phase. Defer mandatory enforcement until empirical data shows false-positive rate is
acceptable.

---

## Sources

### Trunk-Based Development & Branching Strategies

- [Atlassian — Trunk-based Development][tbd-atlas]
- [DORA — Trunk-based development capability][dora-tbd]
- [GitHub Docs — GitHub Flow][github-flow]
- [Nvie — A Successful Git Branching Model (GitFlow)][gitflow-original]
- [AWS Prescriptive Guidance — GitFlow branching strategy][aws-gitflow]

### Stacked PRs & Dependency Tracking

- [Graphite — Stacked Diffs Guide][graphite-stacked]
- [Awesome Code Reviews — Stacked PRs][awesome-stacked]
- [GitHub / gh-stack — GitHub Stacked PRs][ghstack-repo]
- [InfoQ — GitHub Stacked PRs 2026][infoq-stacked-prs]
- [Mr. Latte — Microsoft Study on Large PRs & GitHub's 2024 Fix][mr-latte-stacked]

### Git Worktrees

- [Git — git-worktree documentation][git-worktree-docs]
- [Dev Community — Practical Guide to Git Worktree][dev-worktree-practical]
- [Medium — Mastering Git Worktree (by Mayuresh K)][medium-worktree1]
- [Medium — Ultimate Guide to Git Worktrees: From Daily Dev to AI Agents][medium-worktree-ai]
- [DEV Community — Git Worktree Like a Boss][dev-worktree-boss]

### Monorepo Tooling & Scope Detection

- [Nx — Nx vs Turborepo comparison][nx-vs-turborepo]
- [PkgPulse — Turborepo vs Nx 2026][pkgpulse-turborepo]
- [monorepo.tools — Monorepo landscape][monorepo-tools]
- [Nx — Enforce Module Boundaries][nx-boundaries]
- [Tweag — Managing Dependency Graph (2025)][tweag-dependency]

### Merge Queues & Conflict Avoidance

- [Mergify — Merge Queue docs][mergify-merge-queue]
- [Mergify — Origin Story of Merge Queues][mergify-origin]
- [Mergify — FAQ on Merge Queues][mergify-faq]
- [Mergify — Parallel Queues][mergify-parallel]
- [Bors — Strict Mode for Continuous Testing][bors-docs]
- [GitHub — Merge Queue (native, 2026)][github-merge-queue]

### CODEOWNERS & Scope Signaling

- [GitHub Docs — About Code Owners][github-codeowners]
- [Arnica — GitHub CODEOWNERS Developer's Guide][arnica-codeowners]
- [GitLab — Code Owners][gitlab-codeowners]

### Draft PRs & WIP Conventions

- [GitHub Docs — Draft Pull Requests][github-draft]
- [Medium — Best Practices for Git Branch Naming Conventions][medium-branch-naming]
- [Medium — Naming Conventions for Git Branches (Abhay Amin)][medium-naming-amin]
- [Graphite — Git Branch Naming Conventions][graphite-naming]

### Pre-Merge Conflict Detection

- [Atlassian — How to Resolve Merge Conflicts][atlassian-merge]
- [GitKraken — Merge Conflict Resolution Tool][gitkraken-conflicts]
- [Code Maven — Git: Check for Conflicts Before Merge][codemaven-merge]
- [ArXiv — Predicting Merge Conflicts in Collaborative Software Development][arxiv-merge-conflicts]

### Solo Developer Workflows

- [The Bedroom Coder — Git Workflows for Solo Developers][bedroom-coder]
- [Mikkel Paulson — Git is my buddy: Effective Git as a solo developer][mikkel-paulson]
- [Swarthmore ITS — Utilizing Git for Solo Development][swarthmore-git]

### PR Sizing & Empirical Best Practices

- [ARC Research — PR Sizing and Work Unit Boundary Estimation][arc-pr-sizing]

### Code Reviews at Scale

- [Google — Modern Code Review (Sadowski et al.)][google-sadowski]
- [TensorFlow — RFC Process][tensorflow-rfc]

---

[tbd-atlas]: https://www.atlassian.com/continuous-delivery/continuous-integration/trunk-based-development
[dora-tbd]: https://dora.dev/capabilities/trunk-based-development/
[github-flow]: https://docs.github.com/en/get-started/using-github/github-flow
[gitflow-original]: https://nvie.com/posts/a-successful-git-branching-model/
[aws-gitflow]: https://docs.aws.amazon.com/prescriptive-guidance/latest/choosing-git-branch-approach/gitflow-branching-strategy.html
[graphite-stacked]: https://graphite.com/guides/stacked-diffs
[awesome-stacked]: https://www.awesomecodereviews.com/best-practices/stacked-prs/
[ghstack-repo]: https://github.com/github/gh-stack
[infoq-stacked-prs]: https://www.infoq.com/news/2026/04/github-stacked-prs/
[mr-latte-stacked]: https://www.mrlatte.net/en/stories/2026/04/14/github-stacked-prs/
[git-worktree-docs]: https://git-scm.com/docs/git-worktree
[dev-worktree-practical]: https://dev.to/yankee/practical-guide-to-git-worktree-58o0
[medium-worktree1]: https://mskadu.medium.com/mastering-git-worktree-a-developers-guide-to-multiple-working-directories-c30f834f79a5
[medium-worktree-ai]: https://medium.com/@pererikbergman/the-ultimate-guide-to-git-worktrees-from-daily-dev-to-ai-agents-2b39e63a359d
[dev-worktree-boss]: https://dev.to/metal3d/git-worktree-like-a-boss-2j1b
[nx-vs-turborepo]: https://nx.dev/docs/guides/adopting-nx/nx-vs-turborepo
[pkgpulse-turborepo]: https://www.pkgpulse.com/guides/turborepo-vs-nx-monorepo-2026
[monorepo-tools]: https://monorepo.tools/
[nx-boundaries]: https://nx.dev/docs/concepts/decisions/dependency-management
[tweag-dependency]: https://www.tweag.io/blog/2025-09-18-managing-dependency-graph/
[mergify-merge-queue]: https://mergify.com/merge-queue
[mergify-origin]: https://mergify.com/blog/the-origin-story-of-merge-queues/
[mergify-faq]: https://articles.mergify.com/github-pull-request-merge-queue-faq/
[mergify-parallel]: https://articles.mergify.com/merge-queue-github/
[bors-docs]: https://bors.tech/
[github-merge-queue]: https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-pull-requests-in-your-repository/managing-a-merge-queue
[github-codeowners]: https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-code-owners
[arnica-codeowners]: https://www.arnica.io/blog/what-every-developer-should-know-about-github-codeowners
[gitlab-codeowners]: https://docs.gitlab.com/user/project/codeowners/
[github-draft]: https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/proposing-changes-to-your-work-with-pull-requests/about-pull-requests#draft-pull-requests
[medium-branch-naming]: https://medium.com/@abhay.pixolo/naming-conventions-for-git-branches-a-cheatsheet-8549feca2534
[medium-naming-amin]: https://medium.com/@regondaakhil/best-practices-for-git-branch-naming-conventions-and-pr-creation-on-github-14a451d345dc
[graphite-naming]: https://graphite.com/guides/git-branch-naming-conventions
[atlassian-merge]: https://www.atlassian.com/git/tutorials/using-branches/merge-conflicts
[gitkraken-conflicts]: https://www.gitkraken.com/features/merge-conflict-resolution-tool
[codemaven-merge]: https://code-maven.com/git-check-for-conflicts-before-merge
[arxiv-merge-conflicts]: https://arxiv.org/pdf/1907.06274
[bedroom-coder]: https://www.thebedroomcoder.co.uk/posts/git-workflows-for-solo-developers
[mikkel-paulson]: https://mikkel.ca/blog/git-is-my-buddy-effective-git-as-a-solo-developer/
[swarthmore-git]: https://blogs.swarthmore.edu/its/2019/06/17/utilizing-git-for-solo-development/
[arc-pr-sizing]: research-pr-sizing-and-wu-boundary-estimation.md
[google-sadowski]: https://storage.googleapis.com/gweb-research2023-media/pubtools/4476.pdf
[tensorflow-rfc]: https://www.tensorflow.org/community/contribute/rfc_process
[turborepo-hashbased]: https://turbo.build/repo/docs
