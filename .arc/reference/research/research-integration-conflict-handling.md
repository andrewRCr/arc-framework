# Research: Integration-Time Conflict Handling for Parallel Work Units

**Purpose:** Synthesize best-practice patterns for managing merge conflicts and integration workflows when
concurrent branches touch overlapping code. Focus on rebase strategies, merge ordering, worktree-specific
gotchas, and the decision rubric for when to abandon parallelism.

**Date:** 2026-05-08

**Audience:** Teams (especially AI-assisted teams) running parallel work units, each on its own branch + git
worktree. Assumes technical competence but not deep expertise in modern parallel-work patterns.

**Scope:** Rebase strategies (periodic vs. end-of-flight), merge ordering, merge queues, worktree integration
workflows, conflict prediction tooling, real-team patterns (Linux kernel, monorepo shops, multi-agent
systems), and decision rubrics for resolving integration conflicts.

---

## 1. Patterns Surveyed

### Rebase Strategies for In-Flight Branches

#### Periodic Rebase (Merge-from-Main During Flight)

**Mechanism:** While a feature branch is in development, periodically merge (or rebase) the latest main into
the branch to stay synchronized with upstream changes.

**Implementation variants:**

1. **Merge main into branch:** `git merge origin/main`. Creates a merge commit in branch history; preserves
   branch timeline; clutters history with integration commits. ([Atlassian — Merging vs.
   Rebasing][atlassian-merge-rebase])

2. **Rebase branch onto main:** `git rebase origin/main`. Replays branch commits on top of latest main;
   maintains linear history; rewrites branch history (risky if branch is public). ([Git SCM — Git Branching
   Rebasing][git-scm-rebase])

3. **Rebase with `--onto` (targeted rebase):** Advanced technique for replaying only specific commits; useful
   when branch has accumulated merge commits that should be cleaned. ([Git SCM docs][git-scm-onto])

**Conflict handling during periodic rebase:**

- **Manual conflict resolution:** Developer resolves conflicts at each rebase; time-consuming with long-lived
  branches or frequent upstreams.
- **`git rerere` (reuse recorded resolution):** Git remembers conflict resolutions; automatically applies same
  resolution when identical conflict pattern reappears. Extremely useful when rebasing repeatedly against
  changing upstream. Enable with `git config --global rerere.enabled true`. ([This Dot Labs — Mastering Git
  Rerere][thisdot-rerere], [Atlassian — Resolving conflicts with git-rerere][atlassian-rerere])

**Trade-offs:**

| Strategy                                    | Pros                                        | Cons                                                                       | When to Use                                                  |
| ------------------------------------------- | ------------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------ |
| **Periodic merge**                          | Preserves history; easy for shared branches | Clutters branch history; harder to review WU's actual changes              | Collaborative branches where history matters                 |
| **Periodic rebase**                         | Clean linear history; easy to review        | Rewrites history; risky on shared branch; dev must resolve conflicts often | Private feature branches; single-developer WUs               |
| **Periodic rebase + rerere**                | Clean history + conflict automation         | Requires rerere config; still requires conflict resolution the first time  | Long-lived branches (>1 week) with frequent upstream changes |
| **No periodic rebase (rebase at end only)** | No integration overhead; clean history      | Risk of surprise conflicts at merge time; delayed detection                | Short-lived branches (<2 days) or low-conflict areas         |

**Idiomatic practice:** Trunk-based development (TBD) teams prefer **end-of-flight rebase only**, keeping
branches short-lived (1-2 days). Longer branches (week+) benefit from **periodic rebases + rerere**.
([Atlassian — Trunk-based Development][atlassian-tbd], [DORA — Trunk-based Development][dora-tbd])

#### Last-Mile Rebase Before Merge

**Mechanism:** No periodic rebase during flight; rebase branch onto latest main immediately before creating PR
or merging.

**Advantages:**

- Single conflict-resolution pass; no repetition
- Keeps branch history private (no merge commits from main)
- Simple narrative: "develop feature, rebase once, merge"

**Disadvantages:**

- High risk of surprise conflicts if main diverged significantly
- Developer context-switches into conflict resolution at critical moment (during code review or merge)

**Idiomatic pattern:** TBD teams and teams using GitHub Flow (short-lived branches) use this pattern
exclusively. Merge queues automate the rebase behind the scenes, testing against actual merge state.

#### GitHub "Update Branch" Button

**GitHub behavior:**

- Shows "Update branch" button when PR's base branch (usually main) has advanced beyond PR's branch.
- Default behavior: **merges** main into PR's branch (creates merge commit).
- Does NOT rebase by default; team must choose "Squash and merge" or manually rebase.

**Limitation:** No repository-level setting (as of Feb 2025) to change default from merge to rebase. Teams
wanting rebase-first must use manual rebasing or third-party tools. ([GitHub Community — Update branch with
rebase setting][github-update-branch-issue])

**GitLab alternative (more sophisticated):**

- "Enable automatic rebase prior to merge" in Merge Requests settings.
- `/rebase` quick action in MR to trigger rebase without CI/CD re-run.
- Option to "Rebase without pipeline" for faster feedback.

**Implication for ARC:** If using GitHub, document that "Update branch" defaults to merge; team should prefer
manual `git rebase` or consider GitLab for automated rebase workflows.

### Merge Ordering and Concurrent Work Units

#### First-In Wins vs. Explicit Serialization

**Scenario:** Two WUs (A and B) are ready to merge and touch overlapping code. How to integrate?

**Option 1: First-In Wins (Concurrent Merge)**

- Merge both PRs in rapid sequence (or use merge queue to test both together).
- Second merge likely encounters conflicts; resolver must integrate both changes.
- Works well if conflicts are localized and resolvable without semantic issues.

**Option 2: Explicit Serialization**

- Merge A first; wait for tests to pass and main to update.
- Rebase B onto updated main; resolve conflicts.
- Merge B; tests pass on updated main.
- Guarantees each merge is tested against known-good state; slower integration but lower risk.

**Decision rubric** (from Mergify and industrial practice):

1. **If WUs are independent (no shared logic/data structures):** Concurrent merge is safe; merge queue handles
   simulation.
2. **If WUs modify same functions/modules:** Explicit serialization preferred. Merge WU with largest scope
   first; rebase dependent WUs onto updated main.
3. **If WUs have implicit ordering (e.g., API contract → implementation):** Rebase dependent WU onto first
   WU's branch before both merge (creates temporary dependency chain). ([Mergify — How to Handle Dependencies
   Between PRs][mergify-pr-deps])

#### Merge Ordering with Dependent WUs

**Pattern: Rebase Second Branch onto First**

If WU-B depends on WU-A (e.g., A adds an API, B uses it), don't merge both to main independently:

1. Merge WU-A to main.
2. Rebase WU-B onto updated main (or onto WU-A if still in-flight).
3. Merge WU-B.

**Stacked PR tooling (Graphite, ghstack, Git Town):**

These tools automate parent-child rebasing. When parent rebases, child automatically rebases; single-click
rebase-all. Niche adoption (Meta, Google, Graphite users) but increasingly common in high-cadence shops.
([Graphite — How to Merge a Stack of Pull Requests][graphite-merge-stack]; InfoQ — GitHub Stacked PRs
2026)

**ARC's approach (planned):** No automatic stacked-PR tooling (yet); instead, explicit "Related WUs"
cross-linking in PRD + manual rebase discipline. Lighter than stacked PR tools; requires more discipline.

#### Merge Queues: Conflict Avoidance at Scale

**Mechanism:** CI/CD system that queues PRs, tests each PR + main + all prior queued PRs in a temporary test
branch before landing any.

**Conflict prevention:**

- Tests against _actual merge state_, not branch tip.
- Detects semantic merge conflicts (combined changes break tests).
- Prevents merge skew (main might have changed between PR test and merge).

**Tools:** Mergify (third-party, more features), GitHub merge queue (native, 2026), Bors (historical
predecessor).

**Parallelization:**

- **GitHub native (2026):** Linear queue; one PR tested + merged at a time.
- **Mergify:** Supports scope-based parallel queues (frontend PR doesn't wait behind database migration);
  frontend tests run in parallel with backend tests.

**Trade-off:** Adds CI latency (minutes to test before merge) but guarantees main stability. Essential for
high-volume teams; optional for small teams. ([Mergify — Merge Queue][mergify-merge-queue], [GitHub — Merge
Queue docs][github-merge-queue-docs])

**Critical observation:** Merge queues assume a _single integration point (main)_. They don't predict overlap
between WUs before they're ready to merge; they catch conflicts when merging.

### Merge and Branch Protection Metadata

#### PR Labels for Merge Ordering

**Idiomatic pattern (informal but widespread):**

Add labels to PRs/MRs to communicate merge intent:

- `merges-after:#123` (wait for PR #123 to land first)
- `blocking:#456` (holds up PR #456; don't merge until #456 is ready)
- `depends-on:#789` (requires #789 to land first)

**Limitation:** Labels are advisory, not enforced. Team must manually check before merging. ([Mergify — How to
Handle Dependencies Between PRs][mergify-pr-deps])

**Better:** Mergify's `Depends-On` header in PR body:

```
Depends-On: #123
```

Mergify waits to merge until all dependencies merged. ([Mergify docs][mergify-pr-deps])

#### CODEOWNERS for Overlap Signal

**Mechanism:** File-path → owner mapping (GitHub `CODEOWNERS` file). Can enforce "code owner approval
required" via branch protection.

**Overlap detection:** Not directly. CODEOWNERS signals _who reviews_ and _who owns_ files, not _what will
conflict_. Team must manually inspect CODEOWNERS to anticipate overlap. (GitHub — About Code
Owners)

---

## 2. Worktree-Specific Integration Gotchas

### Shared Git Database, Per-Worktree HEAD

**Critical:** All worktrees share the same `.git` object database (commits, refs), but each worktree has its
own `HEAD` and working tree. When branch-A is checked out in worktree-1 and branch-B is checked out in
worktree-2, branch-A is "owned by" worktree-1 and cannot be simultaneously checked out elsewhere. ([Git —
git-worktree docs][git-worktree-docs])

**Implication:** Do not attempt to check out the same branch in two worktrees. Git enforces this with an
error:

```
fatal: 'branch-X' is already checked out at '/path/to/worktree-1'
```

### Merging: Which Worktree?

**Question:** If WU-A's branch is in worktree-1 and WU-B's branch is in worktree-2, where should the merge
happen?

**Answer:** Perform the merge from the worktree of the _target_ (usually main). Mechanics:

1. Switch to main worktree (or create a temporary worktree on main).
2. Merge WU-A's branch into main: `git merge feature/WU-A`.
3. Tests pass; main is updated.
4. Worktree-1 (WU-A) is now stale; switch to main in worktree-1, then run `git pull` to sync.
5. Worktree-2 (WU-B) can now rebase onto updated main: in worktree-2, run `git rebase origin/main`.

**Or, safer:** Use a dedicated merge worktree:

```bash
git worktree add .worktrees/merge --track origin/main
cd .worktrees/merge
git merge feature/WU-A
git merge feature/WU-B  # if independent
# Or rebase WU-B: git rebase origin/main, return to WU-B worktree, rebase again
```

After merge, clean up: `git worktree remove .worktrees/merge`.

### Stale Worktree References After Upstream Merge

**Scenario:** Worktree-1 is on `feature/WU-A`. Main is merged in another worktree. Worktree-1's view of main
hasn't changed.

**Result:** `git log --oneline origin/main` in worktree-1 may show stale history until you run
`git fetch origin` (or let Git's auto-fetch run).

**Mitigation:**

- Always `git fetch origin` after merging upstream changes (or enable `fetch.prune` to auto-clean deleted
  branches).
- Use a dedicated main worktree that always stays on `origin/main` for reference.

### Detached HEAD Risk

**When it happens:**

- Manually deleting a worktree directory (instead of `git worktree remove`) leaves stale references.
- Checking out a commit hash instead of a branch in a worktree leaves that worktree in detached HEAD state.
- Merging or rebasing in a worktree can temporarily leave it detached.

**Recovery:**

- List all worktrees: `git worktree list`. Output shows "detached HEAD" if applicable.
- Clean stale worktree references: `git worktree prune --dry-run` (check), then `git worktree prune` (clean).
- Recover from accidental detached HEAD: `git branch new-branch HEAD` to create a branch from current commit,
  then `git checkout new-branch`.

**ARC mitigation:** Always use `git worktree remove` or ExitWorktree API; never manually delete worktree
directories.

### Cross-Worktree State After Rebase

**Scenario:** Worktree-1 is on `feature/WU-A`. You rebase it in worktree-1: `git rebase origin/main`. Commits
are rewritten.

**In other worktrees:**

- If they reference `feature/WU-A`, their local branch ref is stale.
- `git log origin/feature/WU-A` still shows old history until `git fetch origin`.
- If a worktree _was_ on `feature/WU-A`, it's now in detached HEAD (branch was rewritten).

**Implication:** After rebasing a branch in one worktree, other worktrees should run `git fetch --all` to
sync. (They should do this routinely anyway.)

### "Update All Worktrees from Main" Workflow

**Pattern for team using worktree-per-WU:**

After a batch of merges, run a sync-all script:

```bash
# From main worktree
git fetch origin
git pull origin main

# In each WU worktree
cd .worktrees/WU-A
git fetch origin
git rebase origin/main  # or git merge origin/main

cd .worktrees/WU-B
git fetch origin
git rebase origin/main
```

**Or, via script:**

```bash
for wt in $(git worktree list --porcelain | grep '^worktree' | cut -d' ' -f2); do
  cd "$wt"
  git fetch origin
  git rebase origin/main 2>&1 | grep -E "^(First|Rebasing|fast-forward|CONFLICT)" || echo "$wt already up-to-date"
done
```

**ARC opportunity:** Provide a helper command (e.g., `npx arc sync-all-worktrees`) to automate this.

---

## 3. Conflict Prediction and Pre-Merge Detection

### Tools and Capabilities

#### GitHub PR Conflict Detector

**What it does:** GitHub Action that scans all open PRs, detects overlapping file + line-number changes,
alerts authors of potential conflicts.

**Mechanics:**

- Lists all open PRs.
- For each pair, compares diff line numbers.
- Flags PRs that touch the same file within N lines of each other.
- Filters out same-author conflicts (not real conflicts).

**Limitations:**

- Detects _textual_ overlap; misses semantic conflicts (both PRs compile individually but break when
  combined).
- Requires manual GitHub Action setup; not GitHub-native (yet).

**Verdict:** Useful for spotting obvious overlaps; false negatives on semantic conflicts. ([GitHub Community —
PR Conflict Detector][github-pr-conflict-detector])

#### MergeBetter (Commercial)

**What it does:** Proactive conflict detection on every push/PR open/sync. Diff analysis for overlapping
changes.

**Claims:** Instant analysis; 95%+ accuracy for textual conflicts.

**Trade-off:** Proprietary SaaS; costs money; not open-source.

**Verdict:** Strong for teams that can afford it; unsettled for small teams. ([MergeBetter][mergebetter])

#### GitKraken Desktop

**Conflict scanning:** Scans branches; flags overlapping file changes; visual merge conflict resolution.

**Verdict:** Good UX; niche adoption; not part of core Git workflow.

### Limitations of Conflict Prediction

**Fundamental issue:** Idiomatic industry practice is to detect conflicts _at merge time_, not before.
Reasons:

1. **False positives:** Two PRs touch the same file but different functions; no conflict risk. Prediction
   tools flag anyway.
2. **False negatives:** No textual overlap, but semantic conflict (both compile separately, fail tests
   together). Prediction misses these.
3. **Overhead:** Scanning all in-flight branch pairs is O(n²); scales poorly at high concurrency.

**Conclusion from research:** Overlap prediction is **NOT idiomatic**. Industry relies on merge queues (test
actual merge) + short-lived branches (reduce concurrency) + developer discipline.

**If ARC implements overlap detection:** Keep it **advisory** (warn user, don't block WU creation). Caveat
that false-positive rate is non-zero.

---

## 4. Real-Team Patterns

### Linux Kernel Patch Series Ordering

**Process:**

- Developers create **patch series** (ordered list of patches that build a feature).
- Each patch in series must yield a working kernel; partial application is common (git bisect).
- Patch series labeled `[PATCH nn/mm]` where nn is ordinal, mm is total count.
- Subsystem maintainers review series, pull into their branch, then Linus (chief maintainer) pulls from
  subsystem maintainers.

**Merge window:** ~2 weeks; ~1,000 changes/day merge into mainline.

**Ordering discipline:**

- Foundation patches first (e.g., API additions).
- Dependent patches follow (e.g., API users).
- Explicit ordering enforced by human review, not tooling.

**Implication for ARC:** Patch-series discipline (each patch yields working state) is a **best practice**
worth borrowing. Ensures bisectability and graceful degradation if a patch is reverted. ([Linux Kernel —
Submitting Patches][linux-submitting-patches], [Linux Kernel — How development works][linux-kernel-process])

### Google & Facebook Monorepo Practices

**Google:** Massive trunk-based development (TBD) + Blaze (internal Bazel). All code in single monorepo;
developers commit to main branch directly (or via pre-submit CI).

**Facebook (Meta):** Similar: TBD + Buck (internal build system). Emphasis on developer velocity and short
feedback loops.

**Scaling mechanism:** Not stacked PRs, but **strong CI/CD + short commits**. Every commit tested; broken main
rolled back quickly. ([Dan Luu — Advantages of Monorepos][danluu-monorepo], [Google Monorepo
patterns][google-monorepo])

**Implication for ARC:** TBD + short-lived branches + strong CI is the proven pattern at scale. Stacked PRs
and complex merge tools are niche optimizations, not prerequisites.

### Multi-Agent Coding Systems

**Emerging pattern (2026):** OpenAI Codex, Claude Code, and agent orchestration platforms increasingly use
**git worktrees + sequential merge** for safe parallel coding.

**Coordination strategies:**

1. **Spec-driven decomposition:** Break task into independent subtasks; assign each agent one subtask; merge
   sequentially. ([MindStudio — Parallel Agentic Development][mindstudio-parallel])

2. **Role splits:** Different agents for different roles (spec writer, implementer, reviewer). Reduces
   conflict surface.

3. **Sequential merging:** Agent A completes WU-A, merges to main. Agent B (on WU-B) rebases onto updated
   main; resolves any new conflicts; continues work. ([Augment Code — Multi-Agent
   Coding][augment-multi-agent])

**Conflict reality:**

- Uncoordinated parallel agents cause high merge conflict rates (research finding: AgenticFlict dataset).
- Coordination overhead (shared task list, lock files, explicit depends-on declarations) pays off.

**Implication for ARC:** Multi-agent systems benefit from explicit coordination (task decomposition +
sequential merge + status visibility). Aligns with ARC's planned "Related WUs" + "status file" model.

---

## 5. Decision Rubrics

### When to Rebase Periodically vs. Only at End

**Choose periodic rebase if:**

- Branch lifetime > 5 days.
- Main branch is very active (>5 commits/day).
- Historical rerere cost is low (same conflicts repeating).

**Choose end-of-flight rebase if:**

- Branch lifetime ≤ 2 days (TBD target).
- Main branch is stable (<2 commits/day).
- Conflict risk is low (disjoint file scopes).

**Mechanism:** Enable `git rerere` if doing periodic rebases; without it, conflict resolution becomes
repetitive. ([This Dot Labs — Mastering Git Rerere][thisdot-rerere])

### When to Merge vs. Rebase onto Another Branch

**Merge WU-A into WU-B (creating temporary dependency) when:**

- WU-B depends on WU-A's functionality.
- Dependency is temporary (WU-A will merge to main soon).
- You want to preserve WU-B's branch history.

**Rebase WU-B onto WU-A's branch (creating implicit order) when:**

- WU-B builds on top of WU-A's changes.
- WU-A branch is stable; WU-B is ready to review.
- You want clean linear history before both merge to main.

**Rebase both onto main (independent merge) when:**

- WU-A and WU-B are independent; no dependency.
- Both are ready; conflicts (if any) are localized.
- Use merge queue to test both together.

### When to Merge First WU and Rebase Second vs. Concurrent Merge

**Merge first WU, rebase second if:**

- Conflict cost is high (many overlapping files).
- Second WU's team is available to rebase immediately.
- Merge order matters (foundational vs. dependent).

**Concurrent merge (both) if:**

- Conflict risk is low (disjoint file scopes).
- Merge queue available (tests both together).
- Both teams prefer to move forward independently.

**Heuristic from practice:** If overlap is "high" (same module, many shared functions), serialize (merge +
rebase). If overlap is "low" (different modules, rare shared code), merge concurrently. ([Mergify — How to
Handle Dependencies Between PRs][mergify-pr-deps], [Graphite — Understanding merge conflicts during pull
requests][graphite-conflicts])

### When to Abandon Parallelism and Redo as Unified WU

**Abandonment signal:**

- Conflict resolution takes longer than the parallelism saved.
- Two WUs are so intertwined that serialization becomes the bottleneck.
- Repeated rebases introduce bugs (semantic drift).

**Heuristic:**

- If resolving conflicts takes >30% of time saved by parallel work, redo as unified WU.
- If rebase count exceeds 3 (due to upstream churn), merge one WU into the other's branch, redo as unified WU.

**Example:** WU-A (5 hours) and WU-B (5 hours) are parallelized. Conflict resolution takes 2 hours; rebasing
takes another 1 hour. Parallelism saved 1 hour. Not worth it; redo as unified 10-hour WU.

**Mechanism:** Abort one branch; merge other into main; create new unified branch from main; re-implement
feature as single coherent WU.

**From practice:** Merge one branch early; drop the other; redo together. Feels like a setback but often saves
time vs. protracted conflict resolution. ([Mergify — Avoid Merge Conflicts][mergify-avoid])

---

## 6. Vocabulary: Integration-Specific Terms

| Term                               | Meaning                                                   | Example                                              |
| ---------------------------------- | --------------------------------------------------------- | ---------------------------------------------------- |
| **Rebase**                         | Replay commits onto new base; rewrites history            | `git rebase origin/main`                             |
| **Merge**                          | Combine branches; creates merge commit                    | `git merge feature-branch`                           |
| **Rerere**                         | "Reuse recorded resolution"; Git remembers conflict fixes | `git config --global rerere.enabled true`            |
| **Periodic rebase**                | Rebase branch during flight, not just at end              | Rebase weekly; reduces end-of-flight surprise        |
| **Last-mile rebase**               | Rebase only immediately before merge                      | TBD pattern; no periodic rebase                      |
| **Merge queue**                    | CI system that queues PRs, tests all together             | Mergify, GitHub native (2026)                        |
| **Conflict prediction**            | Tools that flag overlapping file changes before merge     | MergeBetter, PR Conflict Detector                    |
| **Semantic merge conflict**        | No textual overlap, but combined changes break tests      | Both PRs pass individually; fail when merged         |
| **Stacked PR / PR stack**          | Linear dependency chain of PRs (parent → child)           | Graphite, ghstack                                    |
| **Merge ordering / serialization** | Deciding which WU merges first                            | "Merge API contract first, then implementation"      |
| **Worktree**                       | Separate working directory for same repo; isolated HEAD   | `.worktrees/feature-A` and `.worktrees/feature-B`    |
| **Detached HEAD**                  | Worktree on a commit hash, not a branch                   | Result of merge or stale branch ref                  |
| **Worktree prune**                 | Clean up stale worktree references                        | `git worktree prune` after manual deletion           |
| **Fast-forward merge**             | Merge without merge commit (linear history)               | Main moved, feature didn't; merge fast-forwards main |
| **Merge commit**                   | Explicit commit with two parents; marks integration point | `git merge --no-ff` forces merge commit              |

---

## 7. Idiomatic vs. Anti-Pattern

### Idiomatic Patterns

1. **Short-lived branches (≤2 days):** TBD / GitHub Flow standard. Reduces drift; integration is easy.

2. **End-of-flight rebase only:** No periodic rebase; merge onto main immediately before PR. Minimal conflict
   overhead. ([Atlassian — Trunk-based Development][atlassian-tbd])

3. **Merge queues for main-branch stability:** Test against actual merge state; prevent semantic merge
   conflicts. Standard at scale. ([Mergify — Merge Queue][mergify-merge-queue])

4. **Sequential merge of dependent WUs:** If WU-B depends on WU-A, merge A first, rebase B onto updated main.
   Avoids merge skew.

5. **Explicit merge-order communication:** Use PR labels (`merges-after:#123`) or Mergify's `Depends-On`
   header. Prevents accidental out-of-order merges. ([Mergify — How to Handle Dependencies Between
   PRs][mergify-pr-deps])

6. **Rerere for periodic rebases:** If rebasing frequently, enable rerere. Automates repeated conflict
   resolutions. ([This Dot Labs — Mastering Git Rerere][thisdot-rerere])

7. **Feature flags for incomplete work:** Deploy early; toggle on/off independently. Decouples deploy from
   release; enables easy rollback.

8. **Domain-based WU decomposition:** Split work by feature/module boundary, not by file layer. Reduces merge
   conflicts in multi-agent systems. ([Augment Code — Multi-Agent Coding][augment-multi-agent])

### Anti-Patterns

1. **Long-lived branches (>1 week):** Drift from main accelerates; conflicts compound. Violates TBD principle.
   ([Atlassian — Trunk-based Development][atlassian-tbd])

2. **Uncoordinated parallel branches:** Multiple teams merging without merge order; conflicts surprise
   everyone. ([Mergify — Avoid Merge Conflicts][mergify-avoid])

3. **Merging without merge-queue testing:** Branch passes tests; main doesn't. Semantic merge conflicts slip
   through. ([Mergify — Merge Queue][mergify-merge-queue])

4. **Stashing for context-switching (instead of worktrees):** Cognitive overhead; easy to lose work. Worktrees
   are faster and safer. ([Dev Community — Practical Guide to Git Worktree][dev-worktree-practical])

5. **Rewriting shared branches:** Rebasing a branch that others are using; creates history divergence. Never
   rebase public branches. ([Git SCM — Git Branching Rebasing][git-scm-rebase])

6. **Horizontal slicing (layer-by-layer PRs):** Database PR → API PR → Frontend PR. Each PR meaningless
   without next. ([ARC Research — PR Sizing and WU Boundary Estimation][arc-pr-sizing])

---

## 8. What `strategy-concurrent-work.md` Should Cover

Proposed structure and depth for ARC's integration strategy document:

### Section 1: Overview & Philosophy (300 words)

- ARC uses TBD + worktree-per-WU model.
- Parallel WUs reduce latency; integration conflicts are the price.
- This guide helps teams manage the trade-off: when to parallelize, how to integrate safely, when to
  serialize.
- Assume short-lived branches (≤2 days) and small focused PRs.

### Section 2: Branching & Rebase Discipline (600 words)

**Subsections:**

- **When to rebase (and when not to):** Periodic vs. end-of-flight rubric. Code snippets for both.
- **Merging vs. rebasing:** Trade-offs table; when to use each.
- **Handling conflicts during rebase:** Manual resolution + `git rerere` config + example.
- **"Update branch" workflows:** GitHub behavior (defaults to merge); GitLab alternatives. Recommendation:
  prefer manual rebase for control.

**Concrete guidance:**

```bash
# Periodic rebase (long-lived branch)
git fetch origin
git rebase -i origin/main  # interactive; optional squashing
# Resolve conflicts; git rerere helps if repeated

# End-of-flight rebase (TBD)
git fetch origin
git rebase origin/main    # once, immediately before PR/merge
git push -f origin feature/my-wu  # force-push after rebase
```

### Section 3: Merge Ordering (500 words)

**Subsections:**

- **Independent WUs:** Can merge concurrently; use merge queue to test.
- **Dependent WUs:** Decide merge order; first WU's branch should be stable.
- **Communicating merge order:** Explicit labels (`merges-after:#123`); Mergify's `Depends-On`.
- **When to merge vs. rebase onto sibling branch:** Decision flowchart.

**Decision flowchart example:**

```
Does WU-B depend on WU-A?
  Yes → Is WU-A stable/ready?
    Yes → Merge A, rebase B onto updated main
    No → Merge A's branch into B (temporary), keep B in draft
  No → Can both merge concurrently?
    Yes → Use merge queue; test both together
    No → Serialize; merge first, rebase second
```

### Section 4: Worktree Integration Workflows (600 words)

**Subsections:**

- **Spawning worktree per WU:** ARC's `npx arc spawn` command. One worktree = one WU.
- **Which worktree for merge?** Merge from main (or dedicated merge) worktree. Show two patterns: (a) merge in
  main, sync others; (b) dedicated merge worktree, clean up after.
- **Syncing all worktrees after merge:** Script or command to `git fetch && git rebase origin/main` in all WU
  worktrees.
- **Stale references & detached HEAD:** How they happen; recovery steps.
- **Cleanup:** Always `git worktree remove`, never `rm -rf`. Run `git worktree prune --dry-run` periodically.

**Concrete workflow:**

```bash
# Merge WU-A
cd .worktrees/main
git merge feature/WU-A
git push origin main

# Sync other worktrees
cd .worktrees/WU-B
git fetch origin
git rebase origin/main  # Resolve any new conflicts

cd .worktrees/WU-C
git fetch origin
git rebase origin/main

# Cleanup merge worktree
cd ../..
git worktree remove .worktrees/merge
```

### Section 5: Conflict Prediction & Early Warning (400 words)

**Subsections:**

- **What tooling can detect:** Textual overlap (same file, overlapping lines).
- **What tooling misses:** Semantic conflicts (no overlap, but behavior clash).
- **Tools surveyed:** PR Conflict Detector (open-source), MergeBetter (SaaS), GitKraken (desktop).
- **Recommendation:** Don't rely on prediction; instead rely on short branches + merge queue testing.
- **When to enable overlap detection:** Optional; useful for >5 concurrent WUs.

### Section 6: Decision Rubrics (500 words)

- **When to parallelize vs. serialize** (heuristic: benefit must exceed conflict cost).
- **When to abandon parallelism and redo as unified WU** (conflict cost exceeds benefit; redoes are sometimes
  faster).
- **How to choose merge order** (foundational first; dependencies second; test each merge independently).
- **Example scenarios:** 2 independent WUs, 2 dependent WUs, 3 overlapping WUs.

### Section 7: Real-Team Patterns & Case Studies (400 words)

- **Linux kernel patch series:** Ordered patches; each must yield working state. Discipline > tooling.
- **Google/Facebook monorepo:** TBD + strong CI. Short commits; fast rollback on failure.
- **Multi-agent systems:** Sequential merge + explicit task decomposition. Reduce conflict surface.

### Section 8: Troubleshooting (400 words)

- **Merge conflict: same file, different changes.** Walkthrough manual resolution.
- **Merge conflict: one branch deleted, other modified.** Git's behavior; how to resolve.
- **Semantic merge conflict (no textual conflict, but tests fail).** Requires code review; merge queue catches
  these.
- **Worktree in detached HEAD.** Diagnosis + recovery.
- **Stale branch refs across worktrees.** When it happens; how to clean up.

### Total Target Length

~3,500–4,000 words; concrete, actionable, with code examples and decision flowcharts.

---

## Synthesis & Key Takeaways

**Conflict handling in parallel WUs is an operational discipline, not a solved problem.** Industry best
practice (TBD + short branches + merge queues) reduces conflict frequency but does not eliminate it. Teams
manage by (1) keeping branches short-lived, (2) communicating merge order explicitly, (3) testing against
actual merge state, and (4) serializing when conflicts are costly.

**For ARC specifically:**

1. **Embrace TBD:** Short-lived branches (≤2 days), end-of-flight rebase, no periodic rebase overhead.
   Conflicts are rare if branches are small.

2. **Explicit merge ordering:** Use "Related WUs" section in PRD + optional PR labels/Mergify `Depends-On` to
   communicate dependencies. No automatic enforcement; relies on discipline.

3. **Worktree discipline:** Always use `git worktree remove` (never `rm -rf`). Provide helper command to sync
   all worktrees after merge. Document the one-branch-per-worktree rule clearly.

4. **Sequential merge for dependent WUs:** If WU-B depends on WU-A, merge A → update main → rebase B → merge
   B. Avoids merge skew; each merge is tested against known-good state.

5. **Conflict prediction is optional:** Tools like PR Conflict Detector are useful for >5 concurrent WUs;
   don't mandate. Focus on short branches + merge queue testing instead.

6. **Adopt rerere for periodic rebases (if used):** If team chooses periodic rebase, enable `git rerere`
   globally. Automates repetitive conflict resolution.

7. **Sequential merge for multi-agent systems:** Especially important for AI agents. Decompose by
   feature/domain boundary; merge sequentially; keep conflict surface small.

---

## Sources

### Rebase Strategies & Merge Mechanics

- [Atlassian — Merging vs. Rebasing][atlassian-merge-rebase]
- [Git SCM — Git Branching Rebasing][git-scm-rebase]
- [Git SCM — git-rebase docs][git-scm-rebase-docs]
- [Git SCM — git-rebase --onto][git-scm-onto]
- [DEV Community — Git Branching Strategies: Rebasing vs Merging][dev-branching-strategies]
- [DataCamp — Git Merge vs Git Rebase][datacamp-rebase-merge]

### Git Rerere (Conflict Memory)

- [This Dot Labs — Mastering Git Rerere][thisdot-rerere]
- [Git SCM — Git Tools Rerere][git-scm-rerere]
- [Atlassian — Resolving conflicts with git-rerere][atlassian-rerere]
- [Git SCM — git-rerere docs][git-scm-rerere-docs]

### GitHub & GitLab Update Branch Workflows

- [GitHub Community — Update branch with rebase setting discussion][github-update-branch-issue]
- [GitLab Docs — Rebase and resolve merge conflicts][gitlab-rebase-docs]
- [GitLab Docs — Merge request methods][gitlab-merge-methods]

### Merge Ordering & Dependencies

- [Mergify — How to Handle Dependencies Between PRs][mergify-pr-deps]
- [Graphite — How to Merge a Stack of Pull Requests][graphite-merge-stack]
- [Nutrient — How to handle stacked PRs on GitHub][nutrient-stacked-prs]
- [Graphite — Understanding merge conflicts during pull requests][graphite-conflicts]
- [GitLab Docs — Merge request dependencies][gitlab-mr-dependencies]

### Merge Queues

- [Mergify — Merge Queue][mergify-merge-queue]
- [GitHub — Merge Queue docs][github-merge-queue-docs]
- [Mergify — Parallel Queues for Merge Queue][mergify-parallel-queues]

### Git Worktrees & Multi-Worktree Integration

- [Git SCM — git-worktree docs][git-worktree-docs]
- [DataCamp — Git Worktree Tutorial][datacamp-worktree-tutorial]
- [Dev Community — Practical Guide to Git Worktree][dev-worktree-practical]
- [Medium — Using Git Worktrees for Multiple Working Directories][medium-worktree-concurrent]
- [Ken Muse — Using Git Worktrees for Concurrent Development][kenmuse-worktrees]

### Conflict Prediction Tooling

- [GitHub Community — PR Conflict Detector project][github-pr-conflict-detector]
- [MergeBetter][mergebetter]
- [ArXiv — AgenticFlict: Merge Conflicts in AI Coding Agent PRs][arxiv-agentiflict]

### Trunk-Based Development & Best Practices

- [Atlassian — Trunk-based Development][atlassian-tbd]
- [DORA — Trunk-based Development capability][dora-tbd]
- [Mergify — Avoid Merge Conflicts: Best Practices][mergify-avoid]

### Linux Kernel Patch Series & Maintenance

- [Linux Kernel — Submitting patches][linux-submitting-patches]
- [Linux Kernel — How the development process works][linux-kernel-process]
- [Linux Kernel — Applying Patches][linux-applying-patches]

### Monorepo Patterns (Google, Facebook)

- [Dan Luu — Advantages of Monorepos][danluu-monorepo]
- [How Google Does Monorepo][google-monorepo]
- [monorepo.tools — Monorepo landscape][monorepo-tools]

### Multi-Agent Systems & Parallel Coding

- [MindStudio — Parallel Agentic Development][mindstudio-parallel]
- [Augment Code — Multi-Agent AI System for Code Development][augment-multi-agent]
- [Steve Kinney — Using Git Worktrees for Parallel AI Development][steve-kinney-worktrees]
- [Addison Osmani — The Code Agent Orchestra][addyosmani-agent-orchestra]

### ARC Prior Research

- [ARC Research — PR Sizing and Work Unit Boundary Estimation][arc-pr-sizing]
- [ARC Research — Concurrent Work at the Mechanism Layer][arc-mechanism-layer]

---

[atlassian-merge-rebase]: https://www.atlassian.com/git/tutorials/merging-vs-rebasing
[git-scm-rebase]: https://git-scm.com/book/en/v2/Git-Branching-Rebasing
[git-scm-rebase-docs]: https://git-scm.com/docs/git-rebase
[git-scm-onto]: https://git-scm.com/docs/git-rebase#Documentation/git-rebase.txt---onto
[dev-branching-strategies]: https://dev.to/vaib/git-branching-strategies-a-deep-dive-into-rebasing-vs-merging-when-to-use-what-14ja
[datacamp-rebase-merge]: https://www.datacamp.com/blog/git-merge-vs-git-rebase
[thisdot-rerere]: https://www.thisdot.co/blog/mastering-git-rerere-solving-repetitive-merge-conflicts-with-ease
[git-scm-rerere]: https://git-scm.com/book/en/v2/Git-Tools-Rerere
[atlassian-rerere]: https://www.atlassian.com/blog/bitbucket/resolving-conflicts-with-git-rerere
[git-scm-rerere-docs]: https://git-scm.com/docs/git-rerere
[github-update-branch-issue]: https://github.com/orgs/community/discussions/3245
[gitlab-rebase-docs]: https://docs.gitlab.com/topics/git/git_rebase/
[gitlab-merge-methods]: https://docs.gitlab.com/user/project/merge_requests/methods/
[mergify-pr-deps]: https://articles.mergify.com/how-to-handle-dependencies-between-prs/
[graphite-merge-stack]: https://graphite.com/guides/how-to-merge-a-stack-of-pull-requests-github
[nutrient-stacked-prs]: https://www.nutrient.io/blog/how-to-handle-stacked-prs-on-github/
[graphite-conflicts]: https://graphite.com/guides/understanding-merge-conflicts-prs
[gitlab-mr-dependencies]: https://docs.gitlab.com/user/project/merge_requests/dependencies/
[mergify-merge-queue]: https://mergify.com/merge-queue
[github-merge-queue-docs]: https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-pull-requests-in-your-repository/managing-a-merge-queue
[mergify-parallel-queues]: https://articles.mergify.com/merge-queue-github/
[git-worktree-docs]: https://git-scm.com/docs/git-worktree
[datacamp-worktree-tutorial]: https://www.datacamp.com/tutorial/git-worktree-tutorial
[dev-worktree-practical]: https://dev.to/yankee/practical-guide-to-git-worktree-58o0
[medium-worktree-concurrent]: https://www.kenmuse.com/blog/using-git-worktrees-for-concurrent-development/
[kenmuse-worktrees]: https://www.kenmuse.com/blog/using-git-worktrees-for-concurrent-development/
[github-pr-conflict-detector]: https://github.com/github-community-projects/pr-conflict-detector
[mergebetter]: https://mergebetter.com/
[arxiv-agentiflict]: https://arxiv.org/html/2604.03551
[atlassian-tbd]: https://www.atlassian.com/continuous-delivery/continuous-integration/trunk-based-development
[dora-tbd]: https://dora.dev/capabilities/trunk-based-development/
[mergify-avoid]: https://articles.mergify.com/avoid-merge-conflicts/
[linux-submitting-patches]: https://www.kernel.org/doc/html/v4.17/process/submitting-patches.html
[linux-kernel-process]: https://docs.kernel.org/process/2.Process.html
[linux-applying-patches]: https://docs.kernel.org/process/applying-patches.html
[danluu-monorepo]: https://danluu.com/monorepo/
[google-monorepo]: https://qeunit.com/blog/how-google-does-monorepo/
[monorepo-tools]: https://monorepo.tools/
[mindstudio-parallel]: https://www.mindstudio.ai/blog/parallel-agentic-development-claude-code-worktrees
[augment-multi-agent]: https://www.augmentcode.com/guides/multi-agent-ai-system-code-development
[steve-kinney-worktrees]: https://stevekinney.com/courses/ai-development/git-worktrees
[addyosmani-agent-orchestra]: https://addyosmani.com/blog/code-agent-orchestra/
[arc-pr-sizing]: /home/andrew/dev/arc-framework/.arc/reference/research/research-pr-sizing-and-wu-boundary-estimation.md
[arc-mechanism-layer]: /home/andrew/dev/arc-framework/.arc/reference/research/research-concurrent-work-mechanism-layer.md
