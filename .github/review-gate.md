# Review Gate Operations

This repository opts into a private account-owned GitHub App, protected Actions environment, repository workflows,
CodeRabbit configuration, and compact App-authored audit comments. ARC/package installation creates none of this
hosted footprint. The App receives metadata read, checks write, pull-requests write, and commit-status read for this
repository only. It cannot write contents or merge. In exchange, required review is change-set-bound, authenticated,
non-substitutable, and repairable; controller outages block merges. Expected audit volume is compact and primarily
transition-driven, but comments and workflow notifications remain visible to collaborators.

Use an authenticated local `gh`; never place the App private key, installation token, or credentials in repository or
user configuration, command arguments, logs, or step summaries.

## Operator Inputs and Invariants

Set these locally and authenticate before every operation:

```bash
export REPO='andrewRCr/arc-framework'
export BRANCH='main'
export APP_ID='4268856'             # numeric evidence/check source identity
export APP_CLIENT_ID='<client-id>'  # token-minting client id; never substitute APP_ID
export ACTIONS_APP_ID='15368'        # verified GitHub Actions check source id
export KEY_FILE="$HOME/dev/arc-review-gate-andrewrcr.private-key.pem"
export EXPECT_CLIENT_ID_BEFORE='absent' # `absent` for create, exact current value for repair
export EXPECT_APP_ID_BEFORE='absent'    # `absent` for create, exact current value for repair
set -euo pipefail
gh auth status
key_mode="$(stat -f '%Lp' "$KEY_FILE" 2>/dev/null || stat -c '%a' "$KEY_FILE")"
test -r "$KEY_FILE" && test "$key_mode" = '600'
```

Every mutation below begins with an exact before-state comparison and ends with an exact-head proof. Stop on any
unexpected mode, required check/source, App/environment, action-activation, or head value. Log non-secret JSON before
and after each mutation. Resume only from the last verified checkpoint; commands are compare-and-stop or idempotent.
Never use `--admin`, direct base pushes, force pushes, or an empty required-check set.

The operational rubric is `independent-analysis/v1`:

```yaml
rubric_version: independent-analysis/v1
checks: [intent-and-scope, correctness-and-failure-behavior, trust-and-compatibility, verification, coherence]
```

A rubric change and its `rubric_version` change land in the same reviewed commit. Satisfying evidence covers the full
current change set and follows [.github/review-gate-attestation.md](review-gate-attestation.md).

Provenance: the empirical basis for these inputs — the App permission model (PR ledger comments and the one-shot
label ride `pull-requests: write`, not `issues: write`), the branch-protection check-source pinning proof, and
CodeRabbit's non-satisfying qualification — is recorded in the archived `notes-reviewed-lane-review-gate.md` spike
findings.

## Setup and Shadow Authentication

### Create or repair the protected environment

Create the default-branch-only environment before writing its secret. Environment jobs always create deployment
records; rejected refs leave failed records. Those records are inert bookkeeping, not an access path.

```bash
before_dir="$(mktemp -d)"
environment_exists=false
if gh api --include "repos/$REPO/environments/review-gate" >"$before_dir/environment.http"; then
  grep -qE '^HTTP/[^ ]+ 200' "$before_dir/environment.http"
  environment_exists=true
else
  grep -qE '^HTTP/[^ ]+ 404' "$before_dir/environment.http" || exit 1
fi
gh variable list --repo "$REPO" --json name,value >"$before_dir/variables.json"
if "$environment_exists"; then
  gh secret list --repo "$REPO" --env review-gate --json name,updatedAt >"$before_dir/secrets.json"
else
  printf '[]\n' >"$before_dir/secrets.json"
fi

# Compare snapshots with the expected create/repair checkpoint before mutation.
jq -e --arg client "$EXPECT_CLIENT_ID_BEFORE" --arg app "$EXPECT_APP_ID_BEFORE" '
  ([.[] | select(
    .name == "ARC_REVIEW_GATE_APP_CLIENT_ID" or .name == "ARC_REVIEW_GATE_APP_ID"
  )] | sort_by(.name))
  == ([
    {name: "ARC_REVIEW_GATE_APP_CLIENT_ID", value: $client},
    {name: "ARC_REVIEW_GATE_APP_ID", value: $app}
  ] | map(select(.value != "absent")) | sort_by(.name))
' "$before_dir/variables.json"

jq -n '{deployment_branch_policy:{protected_branches:true,custom_branch_policies:false}}' |
  gh api --method PUT "repos/$REPO/environments/review-gate" --input -
gh api "repos/$REPO/environments/review-gate" |
  jq -e '.deployment_branch_policy == {protected_branches:true,custom_branch_policies:false}'
gh variable set ARC_REVIEW_GATE_APP_CLIENT_ID --repo "$REPO" --body "$APP_CLIENT_ID"
gh variable set ARC_REVIEW_GATE_APP_ID --repo "$REPO" --body "$APP_ID"
gh secret set ARC_REVIEW_GATE_APP_PRIVATE_KEY --repo "$REPO" --env review-gate <"$KEY_FILE"

gh variable list --repo "$REPO" --json name,value |
  jq -e --arg client "$APP_CLIENT_ID" --arg app "$APP_ID" '
    any(.name == "ARC_REVIEW_GATE_APP_CLIENT_ID" and .value == $client) and
    any(.name == "ARC_REVIEW_GATE_APP_ID" and .value == $app)
  '
secret_after="$(gh secret list --repo "$REPO" --env review-gate --json name,updatedAt)"
jq -e 'any(.name == "ARC_REVIEW_GATE_APP_PRIVATE_KEY" and (.updatedAt | length > 0))' <<<"$secret_after"
```

GitHub never returns a secret fingerprint. The only non-secret post-write proof is updated secret metadata followed
by the App authentication probe below; both must pass. Remove `$before_dir` after the checkpoint record is stored.

The App must be installed on selected repositories with only `$REPO` selected. The workflow token request must name
the current repository and only checks write, pull-requests write, and statuses read. Rotate a key by streaming the new
protected file through `gh secret set`, then prove the same App identity before deleting the old key. An App-id change
is a prove-new-before-remove-old migration: install and authenticate the new App/source, add and prove its check, then
remove the old source.

### Run authentication probes

Dispatch shadow from main and confirm a non-default ref cannot enter the environment:

```bash
gh workflow run review-gate.yml --repo "$REPO" --ref "$BRANCH" -f pull_request='<pr>' -f head_sha='<40-hex-sha>'

probe_started="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
gh workflow run review-gate-attest.yml --repo "$REPO" --ref '<non-default-ref>' \
  -f pull_request='<pr>' -f payload='{}'
probe_run="$(gh run list --repo "$REPO" --workflow review-gate-attest.yml --event workflow_dispatch \
  --branch '<non-default-ref>' --limit 20 --json databaseId,createdAt |
  jq -er --arg started "$probe_started" '[.[] | select(.createdAt >= $started)] | sort_by(.createdAt) | last.databaseId')"
if gh run watch "$probe_run" --repo "$REPO" --exit-status; then
  echo 'non-default attestation unexpectedly succeeded' >&2
  exit 1
fi
gh run view "$probe_run" --repo "$REPO" --json conclusion,jobs |
  jq -e '.conclusion == "failure" and any(.jobs[];
    .name == "attest" and .conclusion == "failure" and ([.steps[]?] | all(.conclusion == "skipped")))'
```

For the main dispatch, prove the emitted `review-gate-shadow` check has `.app.id == $APP_ID`; prove a same-name
`github-actions` or foreign-App check does not satisfy a source-pinned requirement. Reject comments unless both
`performed_via_github_app.id` and the stable App-bot user id match and the receipt is unedited. Missing/unsafe
environment, secret, installation, or credentials must fail before an authoritative write. Confirm the App token sees
exactly `$REPO`, cannot write contents, and never enters git transport.

## Provider and Evidence Probe Matrix

Run this matrix in shadow against disposable PR heads. Record immutable API evidence and the exact head for each row.
Any unproven native/provider capability falls back to an explicit controller request or generic attestation—never
inferred satisfaction.

Baseline: the visible `CodeRabbit` commit-status check was absent when this gate was designed (the motivating
symptom) but was observed to reappear 2026-07-11. Re-probe current behavior here rather than assuming the outage
state; its presence remains progress evidence only, never verdict.

| Probe                             | Required observation                                                                        |
|-----------------------------------|---------------------------------------------------------------------------------------------|
| Exempt                            | No provider spend; truthful successful or pending shadow projection                         |
| Recommended declined/accepted     | No spend before consent; admitted request only after consent                                |
| Required clean/findings           | Reservation precedes one request; clean evidence or immutable finding ids bind full head    |
| Stale/retarget                    | Prior evidence becomes stale; current policy/change set re-queries                          |
| CodeRabbit trigger/retrigger      | Label is generation zero; controller `refresh` selects full/incremental coverage            |
| Resolved CodeRabbit configuration | No inherited label, keyword, global override, or alternate automatic path                   |
| Direct provider commands          | Cannot satisfy or waive an ARC requirement                                                  |
| Commit status                     | Exact `CodeRabbit` context wakes progress; creator/status alone is not substantive evidence |
| Coverage                          | Full starts at diff base; incremental starts at the controller-reported chain head          |
| Closure                           | Provider-confirmed or authorized dismissal receipt; bare thread resolution is rejected      |
| Capacity                          | Provenance retained; unknown/lookup failure cannot become availability                      |
| Waive/dismiss                     | Authorized, reasoned, receipt-backed, exact current policy/change set                       |
| Agent/human attestation           | Same neutral manifest; authenticated submitter distinct from reviewer claim                 |
| Reservation ambiguity             | Never replayed; remains blocking until explicitly repaired                                  |
| Scheduled repair                  | Open PR with no check/anchor is discovered and initial required request occurs once         |
| Event routing                     | CI via filtered `workflow_run`, CodeRabbit via `status`, reviews via secretless relay       |
| Candidate fan-out                 | One shared head maps to distinct repository/PR concurrency lanes                            |
| Native review                     | `REVIEW_REQUIRED`, `CHANGES_REQUESTED`, and `APPROVED` map without parsing CODEOWNERS       |

Formal self-hosting Code Owner enforcement stays disabled. Reusable team setup/doctor verification belongs in the
downstream GitHub adapter. CodeRabbit remains non-satisfying unless the live matrix proves durable clean coverage and
semantic closure authority. If those become proven, the same reviewed enablement commit must author the provider
instructions implementing `independent-analysis/v1` and update `rubric_version`.

## Normal Cutover and Rollback

Define helpers that snapshot and compare the required status checks, including App source ids:

```bash
checks() {
  gh api "repos/$REPO/branches/$BRANCH/protection/required_status_checks" |
    jq -S '{strict,contexts,checks}'
}
set_checks() {
  local candidate="$1"
  jq -e '
    type == "array" and length > 0 and
    all(.[]; (.context | type == "string" and length > 0) and
      (.app_id | type == "number" and (. == -1 or . > 0))) and
    ((map(.context) | unique | length) == length)
  ' <<<"$candidate" >/dev/null
  jq -n --argjson checks "$candidate" '{strict:true,checks:$checks}' |
    gh api --method PATCH "repos/$REPO/branches/$BRANCH/protection/required_status_checks" --input -
  checks | jq -e --argjson expected "$candidate" '.checks == $expected'
}
head_sha() { gh api "repos/$REPO/commits/$BRANCH" --jq .sha; }
mode() {
  gh variable list --repo "$REPO" --json name,value |
    jq -er '[.[] | select(.name == "REVIEW_GATE_CONTEXT_MODE")][0].value // "missing"'
}
project_actions() {
  jq -n \
    --arg post "$(sed -n 's/^active: //p' .arc/system/extensions/post-pr-open.md)" \
    --arg final "$(sed -n 's/^active: //p' .arc/system/extensions/pre-merge.md)" \
    '{post_pr_open:$post,pre_merge:$final}'
}
snapshot() {
  local destination="$1"
  mkdir -p "$destination"
  checks >"$destination/checks.json"
  mode >"$destination/mode.txt"
  gh api "repos/$REPO/environments/review-gate" |
    jq -S '{id,name,protection_rules,deployment_branch_policy}' >"$destination/environment.json"
  gh variable list --repo "$REPO" --json name,value |
    jq -S '[.[] | select((.name | startswith("ARC_REVIEW_GATE_")) or .name == "REVIEW_GATE_CONTEXT_MODE")]' \
    >"$destination/variables.json"
  project_actions >"$destination/actions.json"
  head_sha >"$destination/head.txt"
}
compare_checkpoint() {
  local expected="$1" actual="$2"
  diff -ru "$expected" "$actual"
}
verify_checkpoint() {
  local expected_head="$1" expected_mode="$2" expected_checks="$3"
  test "$(head_sha)" = "$expected_head"
  test "$(mode)" = "$expected_mode"
  checks | jq -e --argjson expected "$expected_checks" '.checks == $expected'
  gh api "repos/$REPO/commits/$expected_head/check-runs?per_page=100" |
    jq -e --argjson expected "$expected_checks" '
      all($expected[]; . as $need | any(.check_runs[];
        .name == $need.context and .conclusion == "success" and
        ($need.app_id == -1 or .app.id == $need.app_id)))
    '
}
```

At every checkpoint save `checks`, the repository variable `REVIEW_GATE_CONTEXT_MODE`, App/environment state, project
extension `active:` values, and `head_sha`. Compare them with the expected before-state before running `set_checks`.
Store reviewed expected snapshots outside the repository in `$EXPECTED_CHECKPOINT_DIR`; a missing snapshot is a stop.
After every mutation, `verify_checkpoint` proves the exact head/mode/check sources are green, then `snapshot` plus
`compare_checkpoint` proves all other state. Any command failure aborts under `set -euo pipefail`.

1. **Shadow proof.** Keep CI-owned `merge-ok` required. Set `REVIEW_GATE_CONTEXT_MODE=shadow`, add
   `review-gate-shadow` pinned to `$APP_ID`, and prove both green on the exact head before continuing.

   ```bash
   test -d "$EXPECTED_CHECKPOINT_DIR/shadow-before"
   snapshot "$before_dir/shadow-before.actual"
   compare_checkpoint "$EXPECTED_CHECKPOINT_DIR/shadow-before" "$before_dir/shadow-before.actual"
   shadow_head="$(head_sha)"
   shadow_checks="$(jq -n --argjson app "$APP_ID" --argjson actions "$ACTIONS_APP_ID" \
     '[{context:"merge-ok",app_id:$actions},{context:"review-gate-shadow",app_id:$app}]')"
   gh variable set REVIEW_GATE_CONTEXT_MODE --repo "$REPO" --body shadow
   set_checks "$shadow_checks"
   verify_checkpoint "$shadow_head" shadow "$shadow_checks"
   snapshot "$before_dir/shadow-after.actual"
   compare_checkpoint "$EXPECTED_CHECKPOINT_DIR/shadow-after" "$before_dir/shadow-after.actual"
   ```

2. **Remove the legacy alias only after the pair is green.** Require `ci-ok` plus App shadow, verify exact-head green,
   then remove CI `merge-ok` from the workflow in the reviewed cutover PR. Never let an intermediate revision omit
   today's `merge-ok` before the replacement pair is proven. Before opening the PR, snapshot/compare
   `alias-before`; after its protected merge, set the new checks, run `verify_checkpoint` on the new exact head in
   shadow mode, then snapshot/compare `alias-after`.

   ```bash
   snapshot "$before_dir/alias-before.actual"
   compare_checkpoint "$EXPECTED_CHECKPOINT_DIR/alias-before" "$before_dir/alias-before.actual"
   # Merge the reviewed alias-removal PR normally, then continue on its new main head.
   alias_head="$(head_sha)"
   alias_checks="$(jq -n --argjson app "$APP_ID" --argjson actions "$ACTIONS_APP_ID" \
     '[{context:"ci-ok",app_id:$actions},{context:"review-gate-shadow",app_id:$app}]')"
   set_checks "$alias_checks"
   verify_checkpoint "$alias_head" shadow "$alias_checks"
   snapshot "$before_dir/alias-after.actual"
   compare_checkpoint "$EXPECTED_CHECKPOINT_DIR/alias-after" "$before_dir/alias-after.actual"
   ```

3. **Qualification decision.** Enable a satisfying CodeRabbit declaration only if every live probe passed. The change
   invalidates policy identity; re-run current-head evidence. Otherwise keep CodeRabbit non-satisfying. Compare
   `qualification-before` before the reviewed policy/rubric PR and `qualification-after` after merge; verify the new
   exact head with the unchanged shadow check set before accepting the policy identity.

   ```bash
   snapshot "$before_dir/qualification-before.actual"
   compare_checkpoint "$EXPECTED_CHECKPOINT_DIR/qualification-before" "$before_dir/qualification-before.actual"
   # Merge the reviewed qualification PR normally only when every probe passed.
   qualification_head="$(head_sha)"
   verify_checkpoint "$qualification_head" shadow "$alias_checks"
   snapshot "$before_dir/qualification-after.actual"
   compare_checkpoint "$EXPECTED_CHECKPOINT_DIR/qualification-after" "$before_dir/qualification-after.actual"
   ```

4. **Dual proof.** Set mode `dual`; require `ci-ok`, App `review-gate-shadow`, and App `merge-ok`. Verify the new App
   `merge-ok` is green and source-pinned before removing shadow. Compare `dual-before`, retain its exact head, mutate
   mode/checks, run `verify_checkpoint "$dual_head" dual "$dual_checks"`, then compare `dual-after`.

   ```bash
   snapshot "$before_dir/dual-before.actual"
   compare_checkpoint "$EXPECTED_CHECKPOINT_DIR/dual-before" "$before_dir/dual-before.actual"
   dual_head="$(head_sha)"
   dual_checks="$(jq -n --argjson app "$APP_ID" --argjson actions "$ACTIONS_APP_ID" \
     '[{context:"ci-ok",app_id:$actions},{context:"review-gate-shadow",app_id:$app},
       {context:"merge-ok",app_id:$app}]')"
   gh variable set REVIEW_GATE_CONTEXT_MODE --repo "$REPO" --body dual
   set_checks "$dual_checks"
   verify_checkpoint "$dual_head" dual "$dual_checks"
   snapshot "$before_dir/dual-after.actual"
   compare_checkpoint "$EXPECTED_CHECKPOINT_DIR/dual-after" "$before_dir/dual-after.actual"
   ```

5. **Final.** Set mode `final`; require `ci-ok` and App `merge-ok`, then remove shadow only after exact-head proof.
   Compare `final-before`, retain its exact head, mutate mode/checks, run
   `verify_checkpoint "$final_head" final "$final_checks"`, then compare `final-after`. Open a narrow final-gated
   closeout PR updating `TECHNICAL-OVERVIEW.md` from delivered shadow state to current final architecture; unpause
   dependent work only after it merges.

   ```bash
   snapshot "$before_dir/final-before.actual"
   compare_checkpoint "$EXPECTED_CHECKPOINT_DIR/final-before" "$before_dir/final-before.actual"
   final_head="$(head_sha)"
   final_checks="$(jq -n --argjson app "$APP_ID" --argjson actions "$ACTIONS_APP_ID" \
     '[{context:"ci-ok",app_id:$actions},{context:"merge-ok",app_id:$app}]')"
   gh variable set REVIEW_GATE_CONTEXT_MODE --repo "$REPO" --body final
   set_checks "$final_checks"
   verify_checkpoint "$final_head" final "$final_checks"
   snapshot "$before_dir/final-after.actual"
   compare_checkpoint "$EXPECTED_CHECKPOINT_DIR/final-after" "$before_dir/final-after.actual"
   ```

Activate project `post-pr-open` and `pre-merge` in the cutover PR only after shadow proof. Explicitly invoke
`coordinate-pr-review.md` for that PR because its integration session may retain the pre-activation extension snapshot;
verify later sessions load both active actions normally.

The activation PR changes only `active: false` → `active: true` in these project Configurable files; preserve their
existing `.actions` bodies:

```text
.arc/system/extensions/post-pr-open.md
.arc/system/extensions/pre-merge.md
```

Before merging that same PR, explicitly run `coordinate-pr-review.md` against its current `openedChangeRequest` even
though the in-memory extension list may still reflect the pre-activation snapshot. A fresh session must then report
both `post-pr-open` and `pre-merge` active before the next cutover mutation.

**Normal rollback is the reverse add-before-remove sequence:** final → dual (add/prove shadow) → shadow (restore/prove
CI compatibility `merge-ok`, then remove App `merge-ok`). Retain the last proven pair on any failure. Never reuse the
same `merge-ok` name from CI and the App without an ordered source-pinned handoff.

If rollback also suspends project coordination, use a reviewed rollback PR to set both files above to `active: false`,
explicitly coordinate that PR's current head, and verify a fresh session loads neither action. Never edit one hook
without the other: snapshots treat `{post_pr_open,pre_merge}` as one cutover state.

## Audited App or Controller Outage Recovery

Rehearse this path before final cutover while shadow remains non-required.

1. Freeze merges and capture the incident id, ruleset/branch-protection JSON, mode, required checks/source ids,
   environment/App state, action activation, and exact affected head.
2. Prove independent `ci-ok` on that exact head. A repair PR touching the `ci-ok` producer cannot use its own proof;
   require an independent trusted workflow/reviewer path instead.
3. If project coordination cannot reach the controller, the repair PR sets project `post-pr-open` and
   `pre-merge` inactive and records the incident-scoped suspension. Do not retry dead actions.
4. Add and prove the substitute required check before removing the dead App context. Merge the repair normally through
   branch protection—never `--admin` or direct base push.
5. Require one fresh Codex CLI, Claude Code, CodeRabbit CLI, or qualified-human `independent-analysis/v1` review of the
   exact repair diff. Link its durable evidence in the PR and incident; do not fabricate a controller receipt.
6. Restore the App in shadow. Open a reactivation PR, explicitly invoke `coordinate-pr-review.md` for its possibly stale
   extension snapshot, and prove later sessions load the restored actions.
7. Repeat normal shadow → dual → final promotion, verify exact-head green after each mutation, then unfreeze merges.

An empty requirement set, admin bypass, direct-base repair, controller-manufactured substitute review, or repair PR
using the CI producer it modifies is prohibited.
