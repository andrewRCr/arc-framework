# Notes: reviewed-lane-review-gate

Working notes companion to `spec-reviewed-lane-review-gate.md` and `tasks-reviewed-lane-review-gate.md`.

## Planning-terminus spikes — external-contract probes

Two bounded spikes probe external contracts the design assumes but cannot verify from documentation alone —
CodeRabbit's provider contract, and the GitHub App identity and check-pinning behavior. Both ran in a sandbox
repository in the same organization, touching nothing in this repository's tree, under the spike shape
(hypothesis / acceptance criteria / scope cap / disposition).

The spikes de-risk implementation shape only; they do not replace the post-main cutover Errand's live probes,
which re-prove every contract on this repository before enforcement.

### Spike 1 — CodeRabbit external contract

- _Hypothesis:_ CodeRabbit's current behavior satisfies the adapter contract the spec assumes: a constrainable
  resolved configuration, a workable one-shot request mechanism, machine-usable progress/result projection, and
  finding identities stable enough for closure tracking.

- _Acceptance criteria:_ each probe below answered `yes` / `no` / `unobservable`, with captured evidence
  (API payloads, comment/status snapshots) recorded under Findings; the request-mechanism selection
  (label vs explicit command) settled with a live-proven winner or an explicit "neither proven" verdict.

    1. **Resolved configuration** — with a repository `.coderabbit.yaml` matching the planned delta
       (`inheritance: true`, blanket `auto_review.enabled: false`, one positive trigger label), does
       `@coderabbitai configuration` show the effective merged config, and is it free of inherited positive
       triggers (labels, description keyword, global overrides) that would bypass controller admission?
    2. **One-shot label trigger** — does applying the trigger label start exactly one review of the current head?
       Does removal prevent later automatic reviews? Does re-application trigger again?
    3. **Explicit request commands** — do `@coderabbitai review` / `full review` trigger reliably? Does the
       incremental variant expose provable coverage bounds (from/through SHAs), or is coverage unstated?
    4. **Commit status projection** — with `commit_status` / `fail_commit_status` enabled, do pending / success /
       failure statuses appear on the head SHA? Record the exact context string and creator identity.
    5. **Finding identity** — do findings arrive as review threads/comments with immutable GitHub node ids
       attributable to the CodeRabbit App identity, distinguishable from the mutable walkthrough body?
    6. **Closure signals** — after a fix push, does CodeRabbit emit a machine-attributable confirmation on its own
       prior finding? Is a later CodeRabbit approval CodeRabbit-authored and semantically bound to mapped findings?
    7. **Request Changes** — with the setting enabled, do open findings produce native blocking review state
       (`CHANGES_REQUESTED`), and does resolution lift it?
    8. **Capacity lookup** — does the non-spending rate-limit command return identity-aligned, machine-stable
       output usable as a `provider-reported` capacity source?

- _Scope cap:_ sandbox repository (same org, inherits the org CodeRabbit install), a handful of synthetic PRs;
  one focused block (~2–4 h), extendable by one pass on explicit decision. No writes to this repository.

- _Disposition:_ throwaway — sandbox repo and scratch PRs; the learning is the artifact.

### Spike 2 — GitHub App identity and check pinning

- _Hypothesis:_ a private organization-owned GitHub App with the spec's exact permission set supports the § 8
  projection design: explicitly-scoped short-lived tokens, App-attributed comments and check runs, branch
  protection pinned to the App as required-check source, and environment-isolated key material.

- _Acceptance criteria:_ each probe below proven live in the sandbox, with evidence; deviations recorded as spec
  amendment input.

    1. **App creation** — create the App with only metadata read, checks write, issues write, pull-request read,
       and commit-status read; no webhook, no OAuth. Install on the sandbox repository only.
    2. **Token minting** — `actions/create-github-app-token` (full-SHA pinned) with explicit `permission-*`
       inputs yields a token scoped to the current repository whose permissions do not exceed the request.
    3. **App-attributed comments** — an issue comment authored with that token carries
       `performed_via_github_app.id` matching the App and a stable bot account id; verify the API exposes edit
       state sufficient for the "unedited comment" receipt validation.
    4. **App-attributed checks** — a check run created with that token reports the App as its source, distinct
       from `github-actions`.
    5. **Required-check source pinning** — branch protection / rulesets can require the check pinned to the App
       as expected source, and a same-name check emitted under the `github-actions` identity does not satisfy it.
    6. **Environment secret isolation** — an environment restricted to the default branch withholds its secret
       from a `workflow_dispatch` run on any other ref; deployment creation stays disabled for jobs.

- _Scope cap:_ sandbox repository only; one focused block (~2–4 h), extendable by one pass on explicit decision.
  Installation on this repository stays with the post-main cutover Errand.

- _Disposition:_ workflow scraps throwaway; the App itself is deliberate carry-forward — it is durable production
  configuration (the same App the cutover Errand installs here), not spike code.

### Spike 1 findings

Sandbox: `arc-review-gate-sandbox` (private, same account — inherits the account CodeRabbit install, which is in
"only select repositories" mode; the sandbox was added explicitly). Plan resolved as Pro.

1. **Resolved configuration — `yes`, with one schema correction.** `@coderabbitai configuration` (PR #1,
   response in ~30 s) returns the fully resolved config with a per-key source annotation (`defaults` vs
   `Repository YAML (base)`) — directly usable as the cutover step's no-hidden-positive-trigger verification.
   The `inheritance` key exists and defaults to `false`; `auto_review.description_keyword` exists (default
   empty). **Spec § 9 amendment:** label gating is expressed as `auto_review.enabled: true` +
   `auto_review.labels: [<label>]` (labels restrict auto review); `auto_review.enabled: false` disables the label
   path rather than composing with it. The delta's "keeps blanket `auto_review.enabled: false`" wording is
   schema-inaccurate.
2. **Label gating (negative arm) — `yes`.** An unlabeled PR under the label-gated config produces an explicit
   "Review skipped — required labels (at least one): `arc-review-gate`" status comment and no review. Positive
   arm (apply label → exactly one review) pending on PR #2.
3. **Config resolution ref — head branch, not base.** PR #1's own `.coderabbit.yaml` governed PR #1 before it
   reached `main`. Consequence for the controller: a PR can alter its own CodeRabbit behavior in-flight, so
   provider-side configuration is never a policy boundary — controller policy stays authoritative (the design
   already assumes this; now evidence). Also noted: the skip/status comment embeds a mutable "trigger review"
   checkbox affordance, and `auto_review.auto_pause_after_reviewed_commits` defaults to 5 — both irrelevant to
   admission correctness but worth knowing operationally.

4. **Label one-shot (positive arm) — `yes`.** Applying `arc-review-gate` to open PR #2 fired exactly one review
   (~90 s). CodeRabbit does **not** remove the label after reviewing — one-shot semantics are entirely controller
   discipline, as designed. With the label still applied, a later push did **not** auto re-review (8-minute
   watch, `auto_incremental_review: false`): label removal is hygiene, not load-bearing for spend control under
   this config — a crashed run that fails to remove it does not leak quota on subsequent pushes.
5. **Commit status projection — `yes`, completion-not-verdict.** Head SHA received status context `CodeRabbit`
   with `state: success`, description "Review completed" — even though the review outcome was
   `CHANGES_REQUESTED`. Confirms the status is progress evidence only, never verdict; the spec's treatment
   stands. Status payload showed `creator: null` — creator identity was not observable on this read; pin the
   authoritative identity via the review/comment author instead.
6. **Finding identity — `yes`, via bot account, not `performed_via_github_app`.** All three planted defects were
   found as separate review threads: immutable comment node ids (`PRRC_*`), thread ids (`PRRT_*`), bound to the
   review (`PRR_*`, state `CHANGES_REQUESTED`) and head commit. Review comments carry **no**
   `performed_via_github_app` — CodeRabbit authors as its Bot-type account `coderabbitai[bot]`, so provider
   evidence pins the bot's immutable numeric user id. (Our own App receipts are the `performed_via_github_app`
   path — distinct authorship shapes; spec §§ 4/8 language should not conflate them.)
7. **Request Changes — `yes`.** `request_changes_workflow: true` produced native `CHANGES_REQUESTED` review
   state and PR-level `reviewDecision: CHANGES_REQUESTED` with open findings.
8. **Command surface enumerated.** `review` (incremental) / `full review` exist as explicit request mechanisms.
   Also confirmed by name: `resolve` (bulk user-triggered thread resolution — precisely the insufficient-closure
   case) and `ignore pre-merge checks` (provider-native approval override — must never waive ARC requirements).
9. **Capacity lookup — weak contract; do not promote.** `@coderabbitai rate limit` responds in prose ("Reviews
   are available now"): no numbers, no structured payload, no identity binding. Fails the spec's promotion rule —
   adapter reports `unknown:not-observable` and relies on the single-admitted-attempt guard. Known exhaustion is
   detectable only from an actual quota-rejection response to a request.
10. **CodeRabbit CLI (v0.6.5) — attestation-path candidate, not a capacity source.** No quota/status command
    (`stats` is local history only), so no upgrade to the capacity verdict. But `review --agent` emits structured
    NDJSON (review context with branch/base, typed findings with severity/file/remediation, completion record),
    `--base` / `--base-commit` pin coverage input, and `--config` can deliver the rubric — a viable third named
    local-analysis mechanism through the generic attestation path, alongside Codex CLI and Claude Code. Gaps
    absorbed by the attestation trust model: output echoes no SHAs (submitter resolves coverage bounds) and no
    stable finding ids (submitter mints them). Live run on the same defective code found a _different_ defect
    framing than the PR review (shared-`FALLBACK` mutability vs silent-swallow) — same provider, different
    mechanism, different findings; concrete support for "alternate reviews run full coverage; findings never
    compose across sources." Quota-pool relationship between CLI and PR reviews: unverified.

11. **Clean incremental results are mutable-edit-only.** After a fix push, `@coderabbitai review` ran (ack
    comment with an invocation id, ~4 s; "does not re-review already reviewed commits" fine print) but produced
    **no review object**: its no-findings result surfaced solely as an in-place edit of the existing walkthrough
    comment ("No actionable comments…"), thread resolutions, and a `success` status on the new head — a head no
    review object exists for. A clean CodeRabbit pass therefore has no immutable, coverage-bound artifact; the
    spec's "mutable walkthrough… cannot identify a finding" understates this — for the clean case the mutable
    edit is the only textual result.
12. **Thread auto-resolution is semantically untrustworthy (closure probe: fail).** With two findings fixed and
    one deliberately unfixed, CodeRabbit resolved the **unfixed** finding (`resolvedBy: coderabbitai[bot]` —
    actor attribution works), left one **fixed** finding unresolved (merely `outdated`), and resolved the other
    fixed one. Provider-authored resolution does not semantically confirm the finding; source-confirmed closure
    cannot be derived from CodeRabbit thread state.
13. **Suppression/variance isolation test.** `full review` on the history-bearing PR ran ("Full review
    finished") yet posted nothing — while the identical commits on a fresh PR (no thread history) drew
    `CHANGES_REQUESTED` with one Major actionable finding at the very locus the history-bearing full review
    stayed silent on. Whether thread-history dedupe or run variance, the operational conclusion is the same:
    **a "no actionable comments" full review does not imply no findable defects exist**, and prior thread state
    cannot be excluded as an influence on what gets re-posted. Finding framing also drifted across runs
    (silent-swallow → fallback-mutability): semantic finding identity is unstable across reviews; chains must
    bind to posted thread evidence, never to "the defect."
14. **Native requested-changes persistence.** The original `CHANGES_REQUESTED` review survived the clean full
    review un-dismissed — CodeRabbit submitted no approval. Whether resolving every thread triggers its
    documented approve-on-resolution behavior went unprobed (scope cap); the gate does not depend on it.

**Spike 1 verdict.** All probes answered; hypothesis **partially refuted** in exactly the areas the design
fails safe on:

- **Request mechanism selection:** label = generation-zero (proven one-shot; no re-fire on push; removal is
  hygiene). `full review` = refresh invocation (reliably runs, ack + invocation id) — but only findings-bearing
  runs leave immutable evidence. Plain `review` is not a dependable mechanism under label-gated config.
- **Satisfying qualification: keep disabled**, as the spec already ships it. CodeRabbit fails two probe-gated
  capabilities: closure semantics (finding 12) and durable clean-coverage evidence (findings 11, 13). It remains
  a valuable shadow-observed findings source; clean/required proofs route through the attestation path (fresh
  Codex CLI / Claude Code / CodeRabbit CLI / qualified human) unless a later provider change re-passes the probe.
- **Spec amendments queued:** § 9 label mechanics (`auto_review.enabled: true` + `labels`, not `enabled: false`);
  § 9 explicit-command and clean-result-observability corrections; §§ 4/8 provider-identity pinning via the
  `coderabbitai[bot]` numeric user id (not `performed_via_github_app`, which is App-receipt authorship); § 10
  adds CodeRabbit CLI as a third named local-analysis mechanism; § Open Questions items now answered move to
  recorded findings (rate-limit non-promotion confirmed).

### Spike 2 findings

App `arc-review-gate-andrewrcr` (App ID `4268856`) created under the maintainer account with the spec's permission
set and installed on the sandbox only. Probe workflow: environment-gated job mints a token via
`actions/create-github-app-token` (v3.2.0, full-SHA pinned; the assumed `permission-*` inputs exist).

1. **Token minting and scope — `yes`.** The minted token's `/installation/repositories` lists exactly the sandbox;
   a contents write returns 403. Explicit `permission-*` inputs work as the spec assumes.
2. **PR ledger comments and the one-shot label need `pull-requests: write` — spec permission model corrected.**
   With `issues: write` + `pull-requests: read`, both the PR issue comment and the PR label return
   `403 Resource not accessible by integration`: GitHub routes issue-API operations on a pull request through the
   pull-requests permission. The spec's "Issues write owns PR ledger comments and the one-shot label" is wrong.
   Pending retest after the App permission change: whether `issues: write` can drop entirely (PR-write-only
   token exercising comment + label). Note `pull-requests: write` alone cannot merge (merging also needs
   `contents: write`, which the App never gets).
3. **App-attributed check runs — `yes`.** Check created with the App token reports `app.id 4268856` /
   `app.slug arc-review-gate-andrewrcr`; `external_id` round-trips.
4. **Required-check source pinning — `yes`, decisive.** Branch protection accepts
   `checks: [{context, app_id}]`. With only a same-name **successful** `github-actions` (`app.id 15368`) check on
   the PR head, merge state stays `BLOCKED`; the genuine App check on the same head flips it to `CLEAN`. Same-name
   checks from different Apps coexist, distinguished by source — the § 8 spoof-rejection premise holds at the
   branch-protection layer itself.
5. **Environment secret isolation — `yes`.** A `workflow_dispatch` from a non-default ref fails at job start
   ("Branch … is not allowed to deploy to review-gate due to environment protection rules") before any step runs;
   the secret is never exposed. **Spec § 1 reword needed:** there is no "disable deployment creation" setting —
   environment-referencing jobs always mint deployment records (the rejected attempt leaves a `waiting → failure`
   record); protection rejects the deployment rather than preventing its creation.

6. **Minimal permission set shrinks: `issues: write` drops entirely.** After the App gained
   `pull-requests: write`, a token minted with **only** `pull_requests: write` + `metadata: read` creates PR
   comments (201), adds and removes the one-shot label (200) — no issues permission involved. The corrected App
   permission set: metadata read, checks write, **pull-requests write**, commit-status read. PR write cannot
   merge (merge additionally requires contents write, which the App never holds). The App comment carries both
   identity anchors: `performed_via_github_app.id: 4268856` and stable bot user id `302312524`
   (`arc-review-gate-andrewrcr[bot]`).
7. **Comment edit-state is fully observable.** A body edit moves REST `updated_at` off `created_at` (cheap
   unedited check); GraphQL exposes `lastEditedAt`, `includesCreatedEdit`, and a `userContentEdits` trail with
   per-edit editor identity (attribution). The unedited-receipt validation is implementable as specced.

**Spike 2 verdict.** Hypothesis **confirmed** with two spec corrections. The load-bearing § 8 premise —
branch-protection required checks pinned to the App source, rejecting a same-name `github-actions` impostor —
holds at the protection layer itself (probe 4, decisive). Corrections queued: § 1/§ Security permission model
(PR ledger comments and the one-shot label ride `pull-requests: write`, not `issues: write`; issues drops from
the set) and § 1 deployment wording (environment-referencing jobs always mint deployment records — rejected
attempts leave `waiting → failure` records; no "disable deployment creation" setting exists). The App itself is
the deliberate carry-forward: production configuration, installed on the sandbox now, on this repository at the
cutover Errand.
