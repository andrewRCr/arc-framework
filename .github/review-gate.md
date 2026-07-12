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
export CHECKPOINT_ROOT="$HOME/dev/arc-review-gate-checkpoints"
export EXPECTED_CHECKPOINT_DIR="$CHECKPOINT_ROOT/expected"
export EVIDENCE_MANIFEST='.arc/reference/research/review-gate-cutover-evidence.md'
export EXPECT_CLIENT_ID_BEFORE='absent' # `absent` for create, exact current value for repair
export EXPECT_APP_ID_BEFORE='absent'    # `absent` for create, exact current value for repair
set -euo pipefail
gh auth status
key_mode="$(stat -f '%Lp' "$KEY_FILE" 2>/dev/null || stat -c '%a' "$KEY_FILE")"
test -r "$KEY_FILE" && test "$key_mode" = '600'
mkdir -p "$CHECKPOINT_ROOT"
chmod 700 "$CHECKPOINT_ROOT"
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

Dispatch shadow from default-branch controller code against an open probe PR's exact head, and confirm a
non-default ref cannot enter the environment:

```bash
gh workflow run review-gate.yml --repo "$REPO" --ref "$BRANCH" -f pull_request='<pr>' -f head_sha='<40-hex-sha>'

probe_started="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
gh workflow run review-gate-attest.yml --repo "$REPO" --ref '<non-default-ref>' \
  -f pull_request='<pr>' -f payload='{}'
probe_run="$(gh run list --repo "$REPO" --workflow review-gate-attest.yml --event workflow_dispatch \
  --branch '<non-default-ref>' --limit 20 --json databaseId,createdAt |
  jq -er --arg started "$probe_started" '[.[] | select(.createdAt >= $started)] | sort_by(.createdAt) | last.databaseId')"
gh run watch "$probe_run" --repo "$REPO"
gh run view "$probe_run" --repo "$REPO" --json conclusion,jobs |
  jq -e '.conclusion == "skipped" and any(.jobs[];
    .name == "attest" and .conclusion == "skipped" and ([.steps[]?] | all(.conclusion == "skipped")))'
```

For the main dispatch, record the run's default-branch `headSha` as the controller-code identity and the probe PR's
head as the reviewed change-set identity. Prove the emitted `review-gate-shadow` check on the PR head has
`.app.id == $APP_ID`; prove a same-name `github-actions` or foreign-App check does not satisfy a source-pinned
requirement. Reject comments unless both
`performed_via_github_app.id` and the stable App-bot user id match and the receipt is unedited. Missing/unsafe
environment, secret, installation, or credentials must fail before an authoritative write. Confirm the App token sees
exactly `$REPO`, cannot write contents, and never enters git transport. For the non-default dispatch, additionally
prove that no App-authored receipt or check appeared for the submitted PR/head after `probe_started`.

### Probe installation-token format compatibility

GitHub's temporary `X-GitHub-Stateless-S2S-Token` override applies only to installation-token mint requests; the
pinned `actions/create-github-app-token` revision exposes no override input. Use a protected qualification-only direct
mint job to request `enabled` (stateless `ghs_` JWT) and `disabled` (classic opaque token), then feed each token through
the exact controller consumer on a disposable PR. Separately source-audit the pinned Action and run it normally to
prove it passes its output opaquely. Treat every token as opaque: no exact length, dot-count, prefix-validation,
regex, or storage-width assumption. Both forced forms must authenticate the same pinned App/repository. Remove the
override after proof; it is temporary migration tooling, not a production setting.

## WU 1 — Request, Await, and Provider Qualification

For every required request: durably reserve it, publish/confirm the ARC App's pending aggregate projection on the
exact head, then initiate the provider effect. Bind the request ledger to provider, PR, full head, generation,
transport actor, timestamps, and terminal evidence. A queued/running request freezes the head until terminal
settlement or explicit supersession.

An actor-executable adapter returns a canonical `needs-user-trigger` action containing request key, full head,
generation, exact command, and required GitHub actor id. The single PR coordinator acts only after observing that
pending action with a matching authenticated `gh` actor. After an ambiguous post, re-query exact actor/body comments
created after reservation before retrying. The controller binds the discovered comment id to the reservation.

Provider output has no controller request id, so every request uses an exclusive trigger window. Before admission,
prove automatic, inherited, global, keyword, and other unowned provider paths disabled. Scan the current head for
earlier unowned triggers, then bind the owned label/comment event id and actor to the reservation. Qualifying terminal
evidence must follow that event with no intervening trigger. Any direct collaborator/provider trigger contaminates the
generation: it cannot satisfy the requirement, and neither fallback nor a replacement generation may begin while its
effect could still be live. Wait for that effect to terminate, then explicitly reserve a new owned generation. Head
equality and temporal order without this exclusive window do not establish causation.

The local change-request watcher observes the aggregate App projection at low frequency and returns only typed state
changes. It never parses provider prose. Exempt PRs await exact-head `ci-ok`; reviewed PRs await the aggregate
projection, whose semantics include CI, review request, provider evidence, finding settlement, waiver, fallback, and
timeout.

Adapter semantic parsers are versioned and fail closed. Hosted Codex clean requires a pinned, unedited App/bot issue
comment with anchored `Codex Review:`, the exact `Didn't find any major issues.` clause, and one reviewed-commit SHA
marker that resolves uniquely to the frozen full head. Unknown grammar remains pending. Findings require the standard
review's full `commit_id`; connected-account failure maps to unavailable only under the correlation contract below.

Connected-account failure is terminal only when its versioned anchored text/link comes from the pinned Codex App/bot,
is the earliest qualifying response created after the recorded trigger comment and before the next generation, and
the head remained frozen with no competing trigger in the window. Bind the trigger actor/comment id in the request
ledger; stale, unrelated, changed, or contaminated prose stays unknown.

Automatic fallback is legal only after proven pre-effect rejection/capacity exhaustion or explicit terminal failure.
Record source supersession before selecting an alternate. Effect-ambiguous delivery, acknowledged silence, or
ambiguous terminal evidence never auto-replays or auto-falls-back.

The versioned policy order is `coderabbit-pr` then `codex-pr`. `unknown` capacity permits one reserved attempt for
these hosted adapters because neither exposes reliable preflight quota; explicit `exhausted` skips, while proven pre-
effect rate-limit rejection advances. CLI and qualified-human attestations require explicit repair authorization and
are never automatic fallbacks.

### Provider and evidence probe matrix

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
| Codex user trigger                | Developer-authored mention acknowledges; App-authored mention fails typed/unavailable       |
| Codex findings                    | Pinned bot/App standard review plus comments bind full requested `commit_id`                |
| Codex clean                       | Pinned, unedited App issue-comment SHA prefix resolves uniquely to the frozen full head     |
| Direct provider commands          | Contaminate the generation; wait terminal, then reserve a new owned generation              |
| Commit status                     | Exact `CodeRabbit` context wakes progress; creator/status alone is not substantive evidence |
| Coverage                          | Full starts at diff base; incremental starts at the controller-reported chain head          |
| Closure                           | Provider-owned or coordinator reply-at-locus settlement; bare resolution is rejected        |
| Capacity                          | Provenance retained; unknown/lookup failure cannot become availability                      |
| Waive/dismiss                     | Authorized, reasoned, receipt-backed, exact current policy/change set                       |
| Agent/human attestation           | Same neutral manifest; authenticated submitter distinct from reviewer claim                 |
| Reservation ambiguity             | Never replayed; remains blocking until explicitly repaired                                  |
| Scheduled repair                  | Open PR with no check/anchor is discovered and initial required request occurs once         |
| Event routing                     | Filtered CI/status/review/comment events reconcile every qualified terminal locus           |
| Candidate fan-out                 | One shared head maps to distinct repository/PR concurrency lanes                            |
| Native review                     | `REVIEW_REQUIRED`, `CHANGES_REQUESTED`, and `APPROVED` map without parsing CODEOWNERS       |
| Await wake-up                     | Proxy events wake provider closure; coordinator thread mutations dispatch exact-head repair |
| Token formats                     | Direct forced tokens pass controller; pinned Action is opaque; override is then absent      |

Formal self-hosting Code Owner enforcement stays disabled. Reusable team setup/doctor verification belongs in the
downstream GitHub adapter. Provider satisfaction and conversation settlement are separate capabilities: a provider
may qualify while declaring coordinator-owned thread settlement. A CodeRabbit native approval without a controller
reservation and substantive full-head evidence is non-satisfying; `request_changes_workflow` can approve after thread
resolution even when no qualifying CodeRabbit review occurred. If CodeRabbit becomes satisfying, the same reviewed
enablement commit must author the provider instructions implementing `independent-analysis/v1` and update
`rubric_version`.

WU 1's one PR ships this machinery with project hooks inactive and legacy CI `merge-ok` required. After merge,
manually run the complete matrix through the shipped default-branch workflow before archiving WU 1. On failure,
restore/disable to the safe checkpoint and route a separate repair Errand/work unit; do not open a second WU 1 PR.
WU 2 cannot begin until the post-merge acceptance tail passes.

## WU 2 — Normal Cutover and Rollback

Define helpers that snapshot and compare both enforcement layers, dispatch a post-mutation reconciliation, and
verify App checks on an exact probe-PR head:

```bash
classic_checks() {
  gh api "repos/$REPO/branches/$BRANCH/protection/required_status_checks" |
    jq -S '{strict,checks:(.checks | sort_by(.context))}'
}
ruleset_id() {
  gh api "repos/$REPO/rulesets" |
    jq -er '.[] | select(.name == "main-protection" and .target == "branch") | .id'
}
ruleset() { gh api "repos/$REPO/rulesets/$(ruleset_id)"; }
ruleset_checks() {
  ruleset | jq -S '
    .rules[] | select(.type == "required_status_checks") |
    {strict:.parameters.strict_required_status_checks_policy,
     checks:(.parameters.required_status_checks | sort_by(.context))}'
}
set_checks() {
  local candidate="$1"
  jq -e '
    type == "array" and length > 0 and
    all(.[]; (.context | type == "string" and length > 0) and
      (.app_id | type == "number" and (. == -1 or . > 0))) and
    ((map(.context) | unique | length) == length)
  ' <<<"$candidate" >/dev/null

  # Preserve the existing non-strict posture; strictness is outside this cutover.
  jq -n --argjson checks "$candidate" '{strict:false,checks:$checks}' |
    gh api --method PATCH "repos/$REPO/branches/$BRANCH/protection/required_status_checks" --input -

  ruleset | jq --argjson checks "$candidate" '
    .rules |= map(
      if .type == "required_status_checks" then
        .parameters.strict_required_status_checks_policy = false |
        .parameters.required_status_checks = ($checks | map({context,integration_id:.app_id}))
      else . end
    ) |
    {name,target,enforcement,bypass_actors,conditions,rules}
  ' | gh api --method PUT "repos/$REPO/rulesets/$(ruleset_id)" --input -

  verify_enforcement "$candidate"
}
verify_enforcement() {
  local expected="$1"
  classic_checks | jq -e --argjson expected "$expected" '
    .strict == false and .checks == ($expected | sort_by(.context))'
  ruleset_checks | jq -e --argjson expected "$expected" '
    .strict == false and
    .checks == ($expected | map({context,integration_id:.app_id}) | sort_by(.context))'
}
main_head() { gh api "repos/$REPO/commits/$BRANCH" --jq .sha; }
pr_head() { gh pr view "$1" --repo "$REPO" --json headRefOid --jq .headRefOid; }
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
  chmod 700 "$destination"
  classic_checks >"$destination/classic-checks.json"
  ruleset | jq -S . >"$destination/main-protection-ruleset.json"
  gh api "repos/$REPO/branches/$BRANCH/protection" | jq -S . >"$destination/classic-protection.json"
  mode >"$destination/mode.txt"
  gh api "repos/$REPO/environments/review-gate" |
    jq -S '{id,name,protection_rules,deployment_branch_policy}' >"$destination/environment.json"
  gh variable list --repo "$REPO" --json name,value |
    jq -S '[.[] | select((.name | startswith("ARC_REVIEW_GATE_")) or .name == "REVIEW_GATE_CONTEXT_MODE")]' \
    >"$destination/variables.json"
  project_actions >"$destination/actions.json"
  main_head >"$destination/main-head.txt"
  find "$destination" -type f -exec chmod 600 {} +
}
compare_checkpoint() {
  local expected="$1" actual="$2"
  diff -ru "$expected" "$actual"
}
dispatch_reconcile() {
  local pull_request="$1" head="$2" started run_id
  started="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  gh workflow run review-gate.yml --repo "$REPO" --ref "$BRANCH" \
    -f pull_request="$pull_request" -f head_sha="$head" >/dev/null
  run_id="$(gh run list --repo "$REPO" --workflow review-gate.yml --event workflow_dispatch \
    --branch "$BRANCH" --limit 20 --json databaseId,createdAt |
    jq -er --arg started "$started" '[.[] | select(.createdAt >= $started)] | sort_by(.createdAt) | last.databaseId')"
  gh run watch "$run_id" --repo "$REPO" --exit-status >&2
  gh run view "$run_id" --repo "$REPO" --json databaseId,createdAt,headSha,event,conclusion |
    jq -e --arg started "$started" '
      .event == "workflow_dispatch" and .conclusion == "success" and .createdAt >= $started |
      . + {mutationStarted:$started}'
}
verify_projection() {
  local expected_mode="$1" expected_checks="$2" pull_request="$3" expected_head="$4" proof="$5"
  local started controller_head
  test "$(mode)" = "$expected_mode"
  test "$(pr_head "$pull_request")" = "$expected_head"
  started="$(jq -er .mutationStarted <<<"$proof")"
  controller_head="$(jq -er .headSha <<<"$proof")"
  test "$controller_head" = "$(main_head)"
  gh api "repos/$REPO/commits/$expected_head/check-runs?per_page=100" |
    jq -e --argjson expected "$expected_checks" --argjson app "$APP_ID" \
      --arg started "$started" --arg pr "$pull_request" '
      all($expected[]; . as $need | any(.check_runs[];
        .name == $need.context and .conclusion == "success" and
        ($need.app_id == -1 or .app.id == $need.app_id) and
        (if $need.app_id == $app then
          .updated_at >= $started and
          (.external_id | startswith("arc-review-gate:" + $pr + ":")) and
          (.external_id | endswith(":" + $need.context))
        else true end)))
    '
}
verify_checkpoint() {
  local expected_mode="$1" expected_checks="$2" pull_request="$3" expected_head="$4" proof="$5"
  verify_enforcement "$expected_checks"
  verify_projection "$expected_mode" "$expected_checks" "$pull_request" "$expected_head" "$proof"
}
```

At every checkpoint save classic protection, the full `main-protection` ruleset, mode, App/environment state, project
extension `active:` values, and the default-branch head. Compare them with the expected before-state before running
`set_checks`. Store reviewed expected snapshots under `$CHECKPOINT_ROOT`; a missing snapshot is a stop. Before adding
a new required App context, dispatch reconciliation for an open disposable probe PR and retain its exact head plus
returned run JSON. `verify_projection` accepts App checks only when the dispatch used current default-branch code and
updated the probe head after the mutation. Add the already-green context to both enforcement layers, then
`verify_checkpoint`, `snapshot`, and `compare_checkpoint`. Hash sanitized files into `$EVIDENCE_MANIFEST`; never copy
credentials, tokens, secret values, or private-key material into it. Any command failure aborts under
`set -euo pipefail`.

Set `probe_pr` to one disposable open PR and freeze its `probe_head` throughout these steps.

1. **Non-required shadow and outage rehearsal.** Keep CI-owned `merge-ok` as the sole required machine authority. Set
   shadow mode and prove the App projection beside the already-green legacy check. Before adding shadow to
   enforcement, rehearse audited controller outage/restore while its failure cannot deadlock merges. Then add the
   restored, source-pinned `review-gate-shadow` to both enforcement layers.

   ```bash
   snapshot "$before_dir/shadow-before.actual"
   compare_checkpoint "$EXPECTED_CHECKPOINT_DIR/shadow-before" "$before_dir/shadow-before.actual"
   probe_head="$(pr_head "$probe_pr")"
   shadow_checks="$(jq -n --argjson app "$APP_ID" --argjson actions "$ACTIONS_APP_ID" \
     '[{context:"merge-ok",app_id:$actions},{context:"review-gate-shadow",app_id:$app}]')"
   gh variable set REVIEW_GATE_CONTEXT_MODE --repo "$REPO" --body shadow
   shadow_proof="$(dispatch_reconcile "$probe_pr" "$probe_head")"
   verify_projection shadow "$shadow_checks" "$probe_pr" "$probe_head" "$shadow_proof"
   set_checks "$shadow_checks"
   verify_checkpoint shadow "$shadow_checks" "$probe_pr" "$probe_head" "$shadow_proof"
   snapshot "$before_dir/shadow-after.actual"
   compare_checkpoint "$EXPECTED_CHECKPOINT_DIR/shadow-after" "$before_dir/shadow-after.actual"
   ```

2. **Remove the legacy alias from enforcement, not code.** Prove `ci-ok` plus App shadow first, then require that pair
   in both enforcement layers. Leave CI `merge-ok` emitted but unrequired until the final-gated delivery PR removes
   it from the workflow.

   ```bash
   snapshot "$before_dir/alias-before.actual"
   compare_checkpoint "$EXPECTED_CHECKPOINT_DIR/alias-before" "$before_dir/alias-before.actual"
   alias_checks="$(jq -n --argjson app "$APP_ID" --argjson actions "$ACTIONS_APP_ID" \
     '[{context:"ci-ok",app_id:$actions},{context:"review-gate-shadow",app_id:$app}]')"
   alias_proof="$(dispatch_reconcile "$probe_pr" "$probe_head")"
   verify_projection shadow "$alias_checks" "$probe_pr" "$probe_head" "$alias_proof"
   set_checks "$alias_checks"
   verify_checkpoint shadow "$alias_checks" "$probe_pr" "$probe_head" "$alias_proof"
   snapshot "$before_dir/alias-after.actual"
   compare_checkpoint "$EXPECTED_CHECKPOINT_DIR/alias-after" "$before_dir/alias-after.actual"
   ```

3. **Dual proof.** While the shadow pair remains required, set dual mode and prove both App contexts. Only then add
   App `merge-ok` to the required set.

   ```bash
   snapshot "$before_dir/dual-before.actual"
   compare_checkpoint "$EXPECTED_CHECKPOINT_DIR/dual-before" "$before_dir/dual-before.actual"
   dual_checks="$(jq -n --argjson app "$APP_ID" --argjson actions "$ACTIONS_APP_ID" \
     '[{context:"ci-ok",app_id:$actions},{context:"review-gate-shadow",app_id:$app},
       {context:"merge-ok",app_id:$app}]')"
   gh variable set REVIEW_GATE_CONTEXT_MODE --repo "$REPO" --body dual
   dual_proof="$(dispatch_reconcile "$probe_pr" "$probe_head")"
   verify_projection dual "$dual_checks" "$probe_pr" "$probe_head" "$dual_proof"
   set_checks "$dual_checks"
   verify_checkpoint dual "$dual_checks" "$probe_pr" "$probe_head" "$dual_proof"
   snapshot "$before_dir/dual-after.actual"
   compare_checkpoint "$EXPECTED_CHECKPOINT_DIR/dual-after" "$before_dir/dual-after.actual"
   ```

4. **Final.** While the dual set remains required, set final mode and prove a fresh App `merge-ok`; only then remove
   shadow from both enforcement layers.

   ```bash
   snapshot "$before_dir/final-before.actual"
   compare_checkpoint "$EXPECTED_CHECKPOINT_DIR/final-before" "$before_dir/final-before.actual"
   final_checks="$(jq -n --argjson app "$APP_ID" --argjson actions "$ACTIONS_APP_ID" \
     '[{context:"ci-ok",app_id:$actions},{context:"merge-ok",app_id:$app}]')"
   gh variable set REVIEW_GATE_CONTEXT_MODE --repo "$REPO" --body final
   final_proof="$(dispatch_reconcile "$probe_pr" "$probe_head")"
   verify_projection final "$final_checks" "$probe_pr" "$probe_head" "$final_proof"
   set_checks "$final_checks"
   verify_checkpoint final "$final_checks" "$probe_pr" "$probe_head" "$final_proof"
   snapshot "$before_dir/final-after.actual"
   compare_checkpoint "$EXPECTED_CHECKPOINT_DIR/final-after" "$before_dir/final-after.actual"
   ```

5. **One final-gated delivery PR.** Open it only after final enforcement is proven. It removes the now-unrequired CI
   alias, activates project `post-pr-open`/`pre-merge`, disables CodeRabbit's native `request_changes_workflow` so
   empty bot approvals cannot become a parallel authority, and lands the sanitized evidence/architecture closeout.
   Merge through the final App gate, then use a disposable PR to prove the post-merge default-branch controller state.

At final promotion set generic required approvals to zero: App/bot approvals can satisfy the count, so it is not a
human gate. Explicit merge authorization remains the ARC integration interlock; any future genuinely human-constrained
GitHub rule is separate governance scope. Preserve conversation-resolution enforcement independently. Retain classic
protection beside `main-protection` for this cutover and keep their settings mechanically equivalent; consolidation is
separate scope.

Activate project `post-pr-open` and `pre-merge` in the WU 2 final-gated delivery PR only after final proof. Explicitly
invoke `coordinate-pr-review.md` for that PR because its integration session may retain the pre-activation extension
snapshot; verify later sessions load both active actions normally.

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

Preinstall `.github/workflows/review-gate-repair.yml` on the default branch during WU 1 and rehearse this path before
final cutover while shadow remains non-required. Its source-pinned GitHub Actions App id is `15368`; it runs only by
`workflow_dispatch`, uses `GITHUB_TOKEN` with `statuses: write`, and has no ARC App credential. Default-branch code
validates a bounded attestation manifest following `.github/review-gate-attestation.md` against the exact repository,
PR, frozen head, rubric version, and authenticated author. It accepts only maintainer-attested agent analysis or an
authenticated non-author human review under `independent-analysis/v1`, then writes `review-repair-ok` to that exact
head. The repair PR cannot modify this workflow or its validator, and cannot use its own changed CI producer as proof.

1. Freeze merges and capture the incident id, ruleset/branch-protection JSON, mode, required checks/source ids,
   environment/App state, action activation, and exact affected head.
2. Prove independent source-pinned `ci-ok` on that exact head and validate the existing bounded attestation through
   the default-branch emergency workflow. If the repair changes the `ci-ok` producer, require a separate unchanged
   trusted workflow/reviewer proof instead of its self-produced result.
3. If project coordination cannot reach the controller, the repair PR sets project `post-pr-open` and
   `pre-merge` inactive and records the incident-scoped suspension. Do not retry dead actions.
4. Dispatch `review-gate-repair.yml` from the default branch, prove source-pinned `review-repair-ok` on the exact repair
   head, then add it to both enforcement layers while the dead App context remains required. Prove the augmented set
   before removing the unavailable App context. Merge normally through branch protection.
5. Link the validated attestation, emergency run, exact-head status, and enforcement mutations in the PR and incident;
   never fabricate an App/controller receipt.
6. Restore the App in shadow. Open a reactivation PR, explicitly invoke `coordinate-pr-review.md` for its possibly stale
   extension snapshot, and prove later sessions load the restored actions. Add and prove the restored App context before
   removing `review-repair-ok` from either enforcement layer.
7. Repeat normal shadow → dual → final promotion, verify exact-head green after each mutation, remove the emergency
   status requirement only after the App is required and green, then unfreeze merges.

An empty requirement set, admin bypass, direct-base repair, controller-manufactured substitute review, repair-PR edit
to the emergency workflow/validator, or repair PR using the CI producer it modifies as its own proof is prohibited.
