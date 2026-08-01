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

## 3. Require both producer assets on the default branch

Resolve the repository and default branch with `gh repo view`. **Confirm the workflow and delegated live-pair
comparator are present on the default branch, not only in the working branch; require the workflow's live content
to retain both event types and the comparator to match the installed framework copy** · `[invariant]`:

```bash
gh api "repos/{owner}/{repo}/contents/.github/workflows/arc-clearance.yml?ref={default-branch}"
gh api "repos/{owner}/{repo}/contents/.arc/system/.internal/scripts/confirm-live-change-pair.sh?ref={default-branch}"
```

If either asset is absent, the comparator differs, or either writer is missing, stop before changing required
checks. Commit and merge the canonical producer assets through the repository's normal path, then rerun this
workflow. A producer-only partial setup is harmless.

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

Repeat the detection reads for both producer assets and workflow writers, environment, deployment policy, secrets,
and required contexts. Report which parts were already correct and which changed. The guard is ready only when the
rendered workflow, canonical comparator, and both writers exist on the default branch, the secretless environment
is constrained to that branch, and `arc-cleared` is additive in branch protection.
Clearance setup does not change CODEOWNERS; the decomposition-receipt namespace remains owned.

---

[clearance-template]: ../../../../reference/templates/arc/merge-gate/arc-clearance.yml
