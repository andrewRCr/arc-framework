---
purpose: Install or verify the opt-in ARC merge guard on a GitHub repository without replacing existing protection.
audience: collaborative (human and agent)
---

# Workflow: Set Up ARC Clearance

Use this optional GitHub path only when the project wants `arc-cleared` to be a required merge context. It is
default off. Prerequisites are full branch protection, an ARC installation manifest, an authenticated `gh`, and
repository administration access for automated host setup.

Every run must detect current state before mutation: the installed workflow, the `arc-clearance` environment, its
deployment policy and secrets, and the default branch's required contexts. A second run confirms matching state and
changes nothing.

## 1. Confirm the installed framework version

Read `.arc/system/.internal/manifest.json` and compare its `framework_version` with `arc --version`. Both must be
the same exact SemVer value. Stop on a missing, malformed, or mismatched value; do not render a workflow with the
executing CLI's version or a movable package tag.

```bash
manifest_version="$(jq -er .framework_version .arc/system/.internal/manifest.json)"
cli_version="$(arc --version)"
test "$manifest_version" = "$cli_version"
```

The manifest version is the sole replacement for `{{ARC_FRAMEWORK_VERSION}}`.

## 2. Render or reconcile the workflow

Render the [clearance template][clearance-template] to
`.github/workflows/arc-clearance.yml`, replacing every `{{ARC_FRAMEWORK_VERSION}}` token with the validated
manifest version. Reject a version outside strict SemVer syntax before substitution. After rendering, require
exactly two literal `@arc-framework/cli@<manifest-version>` package specs and no unresolved token. Confirm the
rendered workflow retains both fixed writers: `pull_request` planning classification and `repository_dispatch`
reviewed-head validation.

Detect the target first:

- Missing: create it from the rendered candidate.
- Byte-identical: report it already installed.
- Different: show the diff and reconcile only after the user approves the workflow change; never overwrite
  unrelated edits silently.

The workflow is safe to commit before host configuration. It cannot satisfy a required context until the
environment and branch-protection steps below are completed.

## 3. Require both writers on the default branch

Resolve the repository and default branch with `gh repo view`. **Confirm the workflow is present on the default
branch, not only in the working branch, and that its live content retains both event types** · `[invariant]`:

```bash
gh api "repos/{owner}/{repo}/contents/.github/workflows/arc-clearance.yml?ref={default-branch}"
```

If it is absent or either writer is missing, stop before changing required checks. Commit and merge the workflow
through the repository's normal path, then rerun this workflow. A workflow-only partial setup is harmless.

## 4. Provision or verify the environment

Detect `repos/{owner}/{repo}/environments/arc-clearance` first. The required state is:

- no required `reviewers`;
- no environment secrets (`total_count` from the environment-secrets listing is zero);
- `protected_branches: false` and `custom_branch_policies: true`;
- exactly one deployment branch policy naming the default branch.

Create or update only the `arc-clearance` environment when state differs. Preserve unrelated environments and
repository settings. The environment is secretless; do not add credentials or reviewers.

If `gh` reports missing admin access, use the guided-manual fallback: Settings → Environments → New environment
`arc-clearance`; leave required reviewers empty, allow only the default branch, and add no secrets. **Re-run the
detection queries afterward and stop until they confirm the required state** · `[invariant]`.

## 5. Add the required context

Reconfirm that both workflow writers are present on the live default branch and the environment matches Step 4.
Only then read the current required contexts and add `arc-cleared` without replacing `ci-ok`, `merge-ok`,
CODEOWNERS review, or any other requirement:

```bash
gh api "repos/{owner}/{repo}/branches/{default-branch}/protection/required_status_checks/contexts"
echo '["arc-cleared"]' | gh api --method POST \
  "repos/{owner}/{repo}/branches/{default-branch}/protection/required_status_checks/contexts" --input -
```

If `arc-cleared` is already present, do not post it again. Never use a whole-rule protection update for this
setup. Missing admin uses the guided-manual fallback: add only `arc-cleared` in the base-branch rule's required
status checks, preserving every existing check and review requirement.

Required-context-without-workflow is invalid. If final settlement finds that state, restore the prerequisite
first; do not report setup complete.

## 6. Verify

Repeat the detection reads for both workflow writers, environment, deployment policy, secrets, and required
contexts. Report which parts were already correct and which changed. The guard is ready only when the rendered
workflow and both writers exist on the default branch, the secretless environment is constrained to that branch,
and `arc-cleared` is additive in branch protection.

## 7. Optionally unown decomposition receipts

Clearance setup is complete without an ownership change. The decomposition-receipt namespace remains owned unless
the project separately chooses to admit exact canonical receipts to the planning lane.

Only after Step 6 is green, ask whether to apply that exception. On explicit approval, run the guarded command with
the repository, default branch, required context, and the repository's existing CODEOWNERS location:

```bash
arc review planning-lane-ownership {owner}/{repo} {default-branch} arc-cleared {ownership-file} --apply
```

The command independently reads branch protection, active rules, and merge-queue configuration. It edits only when
`arc-cleared` is required, base currency is enforced, every surface is readable, and the ownership file has a safe
trailing unowned block. An absent guard, refused read, or unsafe ordering leaves the file unchanged. This step does
not create a host rule, enable a merge queue, or enable auto-merge; establish those policies separately.

---

[clearance-template]: ../../../../reference/templates/arc/merge-gate/arc-clearance.yml
