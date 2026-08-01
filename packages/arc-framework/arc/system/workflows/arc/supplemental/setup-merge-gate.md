---
purpose: Set up the planning-path auto-merge lane on a GitHub repo — drop in the merge-ok status job and a planning-paths CODEOWNERS, require the merge-ok check in branch protection, and enable native auto-merge. Idempotent and GitHub-flavored.
audience: collaborative (human and agent)
---

# Workflow: Set Up the Auto-Merge Gate

**When to use:**

- Standalone — run anytime to add (or re-verify) the auto-merge lane on a repo under full branch protection.
- Onboarding — offered from `01_verify-and-configure.md` § Optional, surfaced only under `branch.protection: full`.

The lane lets planning/backlog grooming PRs merge unattended while constitutional docs and code stay reviewed.
See [strategy-work-organization § Auto-Merge Lane][doctrine] for the doctrine and
[`reference/templates/arc/merge-gate/`][templates] for the recipe this workflow applies.

**GitHub-flavored.** The doctrine is host-agnostic, but this workflow drives GitHub via `gh`. On other hosts,
apply the three conditions by hand — see [§ Other Hosts](#other-hosts).

**Idempotent.** Every step detects current state first and is safe to re-run; a second run confirms rather than
duplicates.

---

## Prerequisites

1. **Full branch protection.** This lane is meaningful only under `branch.protection: full`. Under partial
   protection a planning-path Errand is already a direct base-branch commit with no merge-wait, so the lane buys
   nothing. Confirm via `branch.protection` in `arc-config.yml`. If partial, stop and explain the lane is a
   no-op here (the doctrine still informs which paths a team chooses to review).

2. **GitHub host, `gh` authenticated, admin rights.** Branch-protection and repo settings require admin.

   ```bash
   gh auth status
   gh repo view --json nameWithOwner,viewerPermission
   ```

   If the host is not GitHub, jump to [§ Other Hosts](#other-hosts). If `gh` lacks admin, the settings steps
   (3–4) drop to their guided-manual fallback.

3. **Exact installed framework version.** Read `framework_version` from
   `.arc/system/.internal/manifest.json`, require strict SemVer, and confirm it matches `arc --version`. Use that
   exact value for `<installed-arc-version>` in the classifier snippet.

## Step 1: Add the merge-ok gate to your CI workflow

The gate is a snippet, not a drop-in file — `needs:` reaches only jobs in the same workflow, so it must live
alongside the required CI jobs it rolls up. Take the `classify` + `merge-ok` jobs from
[`templates/arc/merge-gate/README.md`][templates] § The merge-ok gate and merge them in, branching on the
repo's CI layout:

- **Single CI workflow:** paste the two jobs into it; add `needs: classify` and
  `if: ${{ needs.classify.outputs.lane == 'reviewed' }}` to each heavy job; list classify + every heavy job in
  `merge-ok.needs`.
- **CI split across workflow files** (e.g. `lint.yml` / `test.yml`): add `on: workflow_call` to each CI
  workflow and a thin parent that `uses:` them and hosts `classify` + `merge-ok`; mark only the parent's
  `merge-ok` required. (Advanced fallback: a `workflow_run` aggregator — see the README.)

Then confirm the pinned classifier matches the project's layout. The default consumes Git's raw change record and
accepts regular-file content changes only: direct ARC planning artifacts under `active/`, one- or two-coordinate
artifacts under `backlog/planned/` and `backlog/provisional/`, plus the exact generated
`.arc/backlog/ROADMAP.md`. Rename/copy endpoints and type/mode changes remain reviewed. Set the workflow's
`pull_request` trigger to the base branch.

**Detect-if-present:** if a `merge-ok` job already exists, do NOT duplicate — diff against the snippet and
reconcile with the user.

## Step 2: Drop in CODEOWNERS

Default target: `.github/CODEOWNERS` (co-located with the workflow; idiomatic when `.github/` exists, less root
clutter).

**Detect-if-present:** check the three locations GitHub honors — `.github/`, repo root, and `docs/`. If a
CODEOWNERS already exists, do NOT clobber: surface it and defer to the user — merge the reviewed-lane and
unowned blocks into the existing file, keeping its location. Otherwise copy the skeleton in:

```bash
cp .arc/reference/templates/arc/merge-gate/CODEOWNERS .github/CODEOWNERS
```

Then replace `@your-org/reviewers` with the real reviewer(s), and confirm the constitutional and unowned blocks
match the project's paths. CODEOWNERS supplies path ownership only. ARC-managed PR workflows run the canonical
classifier over the exact base/head before arming auto-merge; only literal `planning` is eligible. Without
`arc-cleared`, that classifier gate plus the integration interlock is procedural enforcement. When `arc-cleared`
is required through the independent clearance setup, its planning writer makes the same decision structural at
the host.

The shipped skeleton deliberately keeps decomposition receipts owned. To unown that namespace, first complete the
independent clearance setup and enforce base currency, then use its guarded planning-lane ownership command. Do not
add the exception while copying or reconciling the skeleton; this auto-merge setup remains valid without it.

## Step 3: Require the merge-ok check in branch protection

`merge-ok` must be the required status check on the base branch — NOT the heavy CI jobs directly (a
path-filtered required check stalls at _Pending_ and blocks the merge). Idempotent: read the current required
checks first, add `merge-ok` only if absent.

```bash
# read current required contexts (404 = no protection rule yet — see fallback)
gh api "repos/{owner}/{repo}/branches/{branch}/protection/required_status_checks/contexts"

# add merge-ok without replacing the rest of the rule
echo '["merge-ok"]' | gh api --method POST \
  "repos/{owner}/{repo}/branches/{branch}/protection/required_status_checks/contexts" --input -
```

**Reviewed-lane review — team vs. solo:**

- **Team:** enable **Require review from Code Owners** on the rule, so reviewed-lane paths demand owner approval
  (the UI toggle is the simplest reliable route; `gh api --method PATCH .../protection` also works).
- **Solo:** do NOT enable code-owner review — a sole maintainer can't approve their own PR, so it would block
  every reviewed-lane PR. Require only the `merge-ok` check plus pull requests, and enforce the reviewed lane by
  not arming auto-merge on those PRs (a deliberate manual merge). A code-review bot (CodeRabbit, etc.) is a
  useful advisory reviewer there — keep its check non-required so it doesn't gate the auto-merge lane.

**Guided-manual fallback** (no admin, or no protection rule exists yet): Settings → Branches → the base-branch
rule → require the `merge-ok` status check (and, for a team, "Require review from Code Owners"). Create the rule
first if none exists.

## Step 4: Enable native auto-merge

```bash
gh repo view --json autoMergeAllowed --jq .autoMergeAllowed   # detect (true = already on)
gh repo edit --enable-auto-merge                              # enable if false
```

**Guided-manual fallback:** Settings → General → Pull Requests → "Allow auto-merge".

With auto-merge on, an armed planning-only PR merges itself once `merge-ok` is green and no owner review is
required; a reviewed-lane PR additionally waits on owner approval. Auto-merge is armed per PR
(`gh pr merge --auto` or the PR UI) once these conditions are in place. The repository setting alone never
authorizes arming: immediately before ARC arms a PR, rerun
`arc review planning-lane <base-sha> <head-sha>` and require literal `planning`. `reviewed`, command failure, or
malformed output must not arm auto-merge.

## Step 5: Verify

Summarize what landed: the `merge-ok` gate in the CI workflow, the CODEOWNERS location + reviewers, the
required check, and the auto-merge setting. To confirm end-to-end, open a planning-only PR (touch only a supported
planning artifact) and confirm `merge-ok` reports and the PR is auto-merge-eligible with no required review; a PR
touching a constitutional path (a rule, ADR, or strategy) should require owner review. **Also verify a mode-only
change or malformed planning-looking filename classifies `reviewed` and is not armed** · `[invariant]`. If
`arc-cleared` is independently installed and required, confirm that reviewed head remains structurally locked as
well.

A second run of this workflow detects each piece already in place and confirms rather than duplicating.

## Other Hosts

The doctrine is host-agnostic; only this recipe is GitHub-specific. On another host, apply the same three
conditions with that host's primitives:

1. a stable required check present on every PR (the `merge-ok` job — adapt the CI syntax);
2. owner review required for reviewed-lane paths only (the host's code-owners equivalent);
3. native auto-merge (the host's merge-when-ready setting).

See [strategy-work-organization § Auto-Merge Lane][doctrine] for the host-agnostic framing.

## Next Step

- **Standalone:** open a test PR per [§ Step 5](#step-5-verify) to confirm the lane.
- **Invoked from `01_verify-and-configure.md`:** return to that workflow's next section.

---

[doctrine]: ../../../../reference/strategies/arc/strategy-work-organization.md#auto-merge-lane
[templates]: ../../../../reference/templates/arc/merge-gate/README.md
