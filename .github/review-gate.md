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
export EVIDENCE_MANIFEST='.arc/reference/supplemental/research/research-review-gate-cutover-evidence.md'
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

Receipt schema v1 is immutable. Schema v2 extends an existing ledger only as
`v1* → schema-upgrade(v2) → v2*`; the upgrade names the v1 tip/new semantics and requires every legacy effect terminal.
Every v1 `terminal-failure` is effect-ambiguous and needs separate durable terminal/cancellation proof. If proof is
impossible, close the PR without merging and replace it with a new v2-ledger PR.
Historical v1 evidence remains audit-readable but cannot satisfy v2 policy. Any malformed old record still degrades
the ledger, and the monotonic anchor/version chain never resets.

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
transport actor, timestamps, and terminal evidence. A queued/running request freezes the head until a terminal
provider result or explicit supersession.

A confirmed pending trigger or acknowledged/queued/running request is an active flight and freezes the head until a
terminal provider result. Terminal findings remain blocking but permit repair: DEFER/REJECT settles on the same head;
FIX records `begin-fix` plus carried finding ids and authorizes exactly one push to a new head, where reconciliation
consumes the authorization and retains the finding lifecycle tail. A non-terminal flight requires explicit
abandon/supersede/restart before any head change.

An actor-executable adapter returns a canonical `needs-user-trigger` action containing request key, full head,
generation, exact command, and required GitHub actor id. Self-hosting hosted Codex resolves the PR author's immutable
id. The coordinator reads the action through the typed `next-action` launcher and consumes it through
`perform-action`, which revalidates state and actor, posts once, adopts only an exact ambiguous post, dispatches
reconciliation, and returns its event id. The controller independently re-queries and binds that id.

Provider output has no controller request id, so every request uses a PR-wide exclusive trigger window. Before
admission, prove automatic/unowned paths disabled and scan all PR command comments plus label timeline events. Record
event id, actor, digest, time, and canonical head observed at the event. The owned comment must remain present,
unedited, and exact through terminal acceptance. Route comment creation/edit/deletion and label/unlabel; deletion
records a bounded default-branch event tombstone before canonical state disappears. Any unowned/mutated/deleted
trigger contaminates across head pushes until provider-specific terminal/cancellation proof. Head equality and time
alone do not establish causation.

The local change-request watcher observes the aggregate App projection at low frequency and returns only typed state
changes. It never parses provider prose. Exempt PRs await exact-head `ci-ok`; reviewed PRs await the aggregate
projection, whose semantics include CI, review request, provider evidence, finding settlement, waiver, fallback, and
timeout.

Adapter semantic parsers are versioned and fail closed. Hosted Codex clean requires a pinned, unedited App/bot issue
comment with anchored `Codex Review:`, the exact `Didn't find any major issues.` clause, and one reviewed-commit SHA
marker that resolves uniquely to the frozen full head. Unknown grammar remains pending. Findings require the standard
review's full `commit_id`; connected-account failure maps to unavailable only under the correlation and live-
qualification contract below.

Hosted Codex rubric transport is versioned top-level `AGENTS.md` Review guidelines plus the owned trigger comment,
which names `independent-analysis/v1` and repeats its five focus dimensions. Resolve the effective guidance digest for
every changed path and reject missing/conflicting nested guidance. Codex is satisfying only after controlled probes
exercise every dimension under that digest and trigger; ledger metadata alone is insufficient.

Connected-account failure is eligible for terminal mapping only when its versioned anchored text/link comes from the
pinned Codex App/bot, is the earliest qualifying response created after the recorded trigger comment and before the
next generation, and the head remained frozen with no competing trigger in the window. Bind the trigger actor/comment
id in the request ledger. The App-authored probe proves parser grammar only because that actor is inadmissible.
Self-hosting keeps this capability parser-only/non-terminal unless an admissible, intentionally unconnected actor
live-proves the complete production path; stale, unrelated, changed, or contaminated prose stays unknown.

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
| Codex user trigger                | Developer trigger qualifies; App failure is parser-only unless admissible actor proves it   |
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
| Ledger upgrade                    | v1 history extends once into v2; legacy active/ambiguous effects reject upgrade             |
| Repair authority                  | Actions source plus exclusive status-writer call graph and exact run are proven             |

Formal self-hosting Code Owner enforcement stays disabled. Reusable team setup/doctor verification belongs in the
downstream GitHub adapter. Provider satisfaction and conversation settlement are separate capabilities: a provider
may qualify while declaring coordinator-owned thread settlement. A CodeRabbit native approval without a controller
reservation and substantive full-head evidence is non-satisfying; `request_changes_workflow` can approve after thread
resolution even when no qualifying CodeRabbit review occurred. If CodeRabbit becomes satisfying, the same reviewed
enablement commit must author the provider instructions implementing `independent-analysis/v1` and update
`rubric_version`.

Coordinator FIX closure requires an authorized `begin-fix`, one carried-finding head push, exact-head CI, a
qualifying follow-up full-head review, and an authorized `fixed` receipt linking the original finding, fix head,
verification, follow-up evidence, and direct reply before thread resolution. The reply never claims the provider
verified the individual fix. DEFER/REJECT requires its authorized rationale/direct-reply receipt; provider closure
requires the qualified source identity. Bare resolution and broad host-actor membership are non-satisfying.

WU 1's one implementation delivery PR ships this machinery with project hooks inactive, legacy CI `merge-ok`
required, and `archive.cadence: manual`. After merge, manually run the complete matrix through the shipped default-
branch workflow while WU 1 remains `Integrating`. On failure, restore/disable to the safe checkpoint and route a
separate repair Errand/work unit; never amend the acceptance record with unshipped code.

When the baseline matrix proves hosted capabilities, open a qualification-activation housekeeping PR containing only
the policy/manifest patch produced by the activation compiler. Validate that PR's diff against the same typed baseline
result; any manual field/path, omission, stale input, identity/version drift, or checkpoint mismatch is a stop. Do not
archive or restore cadence. After it merges, rerun the complete matrix through the enabled default-branch policy. Only
that second pass may prove the satisfying aggregate path.

On final success, open the acceptance-closeout housekeeping PR and run the private root
`review-gate:closeout` script with `$IMPLEMENTATION_PR_URL`. It validates `CutoverAcceptanceProof` against the live
default branch, activated policy/version digests, complete matrix, enforcement boundary, and private checkpoint
hashes before writing `$EVIDENCE_MANIFEST`, marking WU 1's Post-Merge Acceptance Gates, or invoking archive. The
archive verb independently refuses an incomplete acceptance-gate section, and pre-commit rejects marked/archived
gates without a matching sanitized proof. Restore `archive.cadence: with-integration` in that PR. After it merges,
run `npx arc user close review-gate-enforcement-cutover` and `npx arc teardown review-gate-enforcement-cutover`.
These are qualification/archive housekeeping PRs, not additional implementation deliveries. WU 2 cannot begin until
the closeout merges and the retained workspace/branch tail is fully retired.

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

The emergency workflow has no ARC App credential. GitHub delivers its typed `review-gate-repair`
`repository_dispatch` only to default-branch workflow code; the developer credential that sends the event never enters
Actions. The read-only validation job proves the live environment, immutable workflow SHA, complete permission/call
graph, exact PR head, and bounded `independent-analysis/v1` attestation. The protected writer alone receives
`statuses: write`, executes no repository code, and writes constant context `review-repair-ok` as Actions App id
`15368`.

### Compare the repair environment

Use the authenticated developer token only in the local setup process. Compare first; `--apply` is a separate,
explicit mutation. Apply refuses to touch an environment containing any secret.

```bash
export GITHUB_REPOSITORY="$REPO"
GITHUB_TOKEN="$(gh auth token)" npm run review-gate:repair-environment

# Only after the comparison stopped on an expected missing or policy-drift state:
GITHUB_TOKEN="$(gh auth token)" npm run review-gate:repair-environment -- --apply
GITHUB_TOKEN="$(gh auth token)" npm run review-gate:repair-environment
```

The final comparison must report `status: ready` and the live default branch. Independently retain the environment
response, custom deployment-branch policies, and environment-secret names in the private incident directory. Require
exactly one `branch` policy naming the live default branch and an empty secret-name array. Stop on any extra policy,
secret, environment consumer, workflow writer, or repository Actions default other than read-only.

### Outage add-before-remove

Set incident-local values without placing the attestation on a command line:

```bash
export INCIDENT_ID='<non-secret-incident-id>'
export REPAIR_PR='<pull-request-number>'
export REPAIR_HEAD="$(pr_head "$REPAIR_PR")"
export REPAIR_ATTESTATION='<private-path-to-bounded-attestation.json>'
export REPAIR_DIR="$CHECKPOINT_ROOT/outages/$INCIDENT_ID"
mkdir -p "$REPAIR_DIR" && chmod 700 "$REPAIR_DIR"
```

1. Freeze merges operationally. Snapshot classic protection, the full `main-protection` ruleset, current required
   contexts and source ids, project action activation, both protected environments, App state, default-branch SHA, PR
   head, and incident id. Compare the snapshot with the reviewed expected checkpoint. Require a non-empty currently
   green authority set; never remove a requirement during this step.
2. Prove source-pinned CI on `$REPAIR_HEAD` and retain its run/source identity. If the repair changes any file that
   produces `ci-ok`, its own CI result is inadmissible: retain separate exact-head evidence from an unchanged producer
   and an independent reviewer. Both are required; a self-produced `ci-ok` is never proof of its own producer change.
3. Validate a clean bounded attestation from a maintainer-attested qualified agent or authenticated non-author human.
   If project coordination cannot reach the controller, the reviewed repair PR sets both `post-pr-open` and
   `pre-merge` inactive together. Never retry an effect-ambiguous dead action.
4. Re-run the environment comparison. The workflow then audits repository default permissions, all checked-in
   workflows/jobs, the sole environment consumer/writer, immutable default-branch SHA, and protected authority paths.
   Dispatch the typed event with the attestation streamed from its private file:

   ```bash
   dispatch_started="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
   jq -n --argjson pull_request "$REPAIR_PR" --rawfile payload "$REPAIR_ATTESTATION" \
     '{event_type:"review-gate-repair",client_payload:{pull_request:$pull_request,payload:$payload}}' |
     gh api --method POST "repos/$REPO/dispatches" --input -
   ```

5. Identify exactly one `review-gate-repair.yml` `repository_dispatch` run created after `$dispatch_started`. Require
   its actor to match the dispatcher, its head SHA to equal the current default-branch SHA, and its conclusion to be
   success. Re-query the PR head and the `review-repair-ok` commit status. Require exact `$REPAIR_HEAD`, state success,
   Actions source id `15368`, and a target linking the run id, workflow path/SHA, PR, and head. Stop on ambiguity.
6. Read the current required-check array from both enforcement layers and prove they are equal and still contain the
   unavailable App context. Form an augmented non-empty array by adding
   `{context:"review-repair-ok",app_id:15368}`. Call `set_checks` once, then prove both layers and the exact repair PR
   head green. Snapshot and compare this augmented checkpoint before removing anything.
7. Only after the augmented checkpoint passes, form the next non-empty array by removing the unavailable App context,
   call `set_checks`, and prove both enforcement layers again. Merge the reviewed repair PR normally through branch
   protection. Retain the attestation identity, workflow run, status, before/augmented/after enforcement snapshots,
   and file hashes; never retain tokens, raw secrets, or the attestation body in sanitized evidence.

### Restoration add-before-remove

Restore the App in non-required shadow first. Open and coordinate a reviewed reactivation PR, then prove later
sessions load both project actions. Freeze merges and compare the live outage checkpoint before each mutation.

1. Produce the restored App context on the exact reactivation head and prove its configured App source id, successful
   conclusion, external identity, default-branch controller run, and live PR head.
2. While `review-repair-ok` remains required and green, add the restored App context to both enforcement layers. Prove
   and snapshot the augmented non-empty set.
3. Only after that proof, remove `review-repair-ok` from both layers. Prove the restored App context remains required
   and green, resume the normal shadow → dual → final sequence, and unfreeze merges.

### Shadow rehearsal and retained evidence

The checked-in `.github/review-gate-repair-rehearsal.json` records the non-mutating contract rehearsal and contains no
live claims. Its executable test fixes the safe ordering before hosted rehearsal is possible.

After this workflow reaches the default branch and before final cutover, rehearse with the App projection still
non-required and legacy CI still required. Use a disposable PR and sanitized attestation, execute environment compare,
dispatch, run/status proof, add `review-repair-ok` beside the existing required CI floor, prove the augmented set, then
remove only `review-repair-ok` and prove the original set is restored. Do not remove or replace the existing authority
during rehearsal.

Retain private raw responses under `$REPAIR_DIR/raw` with mode `0700`/`0600`. Retain a sanitized rehearsal record with
only repository id, default-branch/workflow SHA, disposable PR/head, run id/attempt, context/source id, ordered
checkpoint hashes, timestamps, and pass/fail outcomes. Hash the sanitized record into `$EVIDENCE_MANIFEST`. Delete
credential-bearing command captures and attestation bodies after their hashes and identities are recorded.

An empty requirement set, admin bypass, direct-base repair, removal-first mutation, controller-manufactured substitute
review, changed emergency authority/permission graph, alternate status writer, ambiguous run, or CI-producer self-proof
is prohibited. Stop at the last proven checkpoint on any mismatch.
