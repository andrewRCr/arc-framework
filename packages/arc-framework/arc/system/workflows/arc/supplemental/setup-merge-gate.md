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

## Step 1: Drop in the merge-ok workflow

**Detect-if-present:** if `.github/workflows/merge-ok.yml` already exists, do NOT overwrite — diff it against
the template and reconcile with the user. Otherwise copy it in:

```bash
mkdir -p .github/workflows
cp .arc/reference/templates/arc/merge-gate/merge-ok.yml .github/workflows/merge-ok.yml
```

Then adapt the copy to the repo:

- Set `on.pull_request.branches` to the base branch.
- Replace the `quality` placeholder with the repo's real build/lint/test — or, if CI already lives in another
  workflow, move the `classify` + `merge-ok` jobs into that workflow and list every heavy job in
  `merge-ok.needs` (`needs` reaches only jobs in the same workflow).
- Confirm the lane classifier matches the project's layout (the default matches ARC's
  `draft-/tasks-/meta-/notes-/cohort-*` prefixes under `active/` and `backlog/`).

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
match the project's paths.

## Step 3: Require the merge-ok check in branch protection

`merge-ok` must be the required status check on the base branch — NOT the heavy CI jobs directly (a
path-filtered required check stalls at *Pending* and blocks the merge). Idempotent: read the current required
checks first, add `merge-ok` only if absent.

```bash
# read current required contexts (404 = no protection rule yet — see fallback)
gh api "repos/{owner}/{repo}/branches/{branch}/protection/required_status_checks/contexts"

# add merge-ok without replacing the rest of the rule
echo '["merge-ok"]' | gh api --method POST \
  "repos/{owner}/{repo}/branches/{branch}/protection/required_status_checks/contexts" --input -
```

Also ensure **Require review from Code Owners** is enabled on the rule, so reviewed-lane paths demand owner
approval (the UI toggle is the simplest reliable route; `gh api --method PATCH .../protection` works for those
who script it).

**Guided-manual fallback** (no admin, or no protection rule exists yet): Settings → Branches → the base-branch
rule → require the `merge-ok` status check and enable "Require review from Code Owners". Create the rule first
if none exists.

## Step 4: Enable native auto-merge

```bash
gh repo view --json autoMergeAllowed --jq .autoMergeAllowed   # detect (true = already on)
gh repo edit --enable-auto-merge                              # enable if false
```

**Guided-manual fallback:** Settings → General → Pull Requests → "Allow auto-merge".

With auto-merge on, a planning-only PR merges itself once `merge-ok` is green and no owner review is required; a
reviewed-lane PR additionally waits on owner approval. Auto-merge is armed per PR (`gh pr merge --auto` or the
PR UI) once these conditions are in place.

## Step 5: Verify

Summarize what landed: the `merge-ok` workflow, the CODEOWNERS location + reviewers, the required check, and the
auto-merge setting. To confirm end-to-end, open a planning-only PR (touch a `draft-*` / `meta-*` only) and
confirm `merge-ok` reports and the PR is auto-merge-eligible with no required review; a PR touching a
constitutional path (a rule, ADR, or strategy) should require owner review.

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
