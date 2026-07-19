# Spec (`detailed` · `RFC`): self-hosted-ci

- **Origin:** [internal] — post-remediation GitHub Actions billing review, folding the retained self-hosted-runner
  capture and the deferred test-job consolidation re-weigh as inbound evidence.

- **Purpose:** Move the private repository's Linux CI execution onto one small, deliberately boring VPS so Actions
  cost stops scaling with development volume — without turning CI into a second system to operate, and while
  preserving hosted macOS/Windows coverage and an immediate hosted fallback.

---

## Introduction / Context

The content-aware classifier and the PR #281 remediation improved *which* jobs run but did not change the
per-heavy-run billing shape. Short jobs still round independently to a one-minute floor, so a representative heavy
run bills the same ~14 Linux job-minutes before and after. The opt-in `ci-defer-heavy` label has not been used in
the post-landing PR sample, so it is not changing the normal run rate.

The residual has crossed the retained escape hatch's adoption threshold:

- June 2026: $19.152 gross / $1.152 net paid Actions usage for this repository.
- July 1–19: $28.938 gross / $10.988 net by the latest sample.
- July 18 (first full day after PR #281): 230 Linux, 7 macOS, 14 Windows minutes — $1.954 net.
- July 19 partial sample: another 158 Linux minutes, $0.948 net.

Going public would eliminate standard hosted-runner charges, but that is a separate release decision with
independent privacy and security gates (identity-global notes must leave the code repository's origin, the
`pull_request_target` workflows need a public-fork threat audit, and the full history needs a secret scan). CI
cost does not justify pulling that decision forward. The near-term answer is therefore to make the Linux CI data
plane cheap while preserving GitHub-hosted macOS/Windows coverage and an immediate hosted fallback.

## Goals

- Linux CI legs execute on self-hosted infrastructure and incur no hosted Actions runner charges under normal
  operation.
- Hosted macOS/Windows portability coverage is preserved on GitHub-hosted infrastructure.
- Hosted execution is recoverable in minutes, without a workflow edit, whenever self-hosted execution is
  unavailable or degraded.
- Check identity — specifically the leg check-name the verified-tree classifier keys on — is independent of which
  runner executed a job (the required `merge-ok` check name is already runner-invariant).
- The runner is reproducible from a checked-in runbook and disposable: no machine backup, rebuild over repair.
- The trust boundary is explicit and fail-closed: self-hosted execution is enabled only when every principal able
  to submit executable pull-request code is trusted.

## Non-Goals

- Flipping the repository public — owned by `public-repo-flip`, blocked on storage separation and security gates.
- ARC-wide merge serialization — owned by `integration-lane`.
- Moving privileged `pull_request_target` review-gate workflows or the hosted cross-platform jobs to self-hosted.
- Autoscaling, ephemeral runners, Kubernetes, custom runner images, or any general infrastructure platform.
- A test-topology rewrite (job-graph consolidation) — considered only post-canary, on measured evidence.

## Proposed Design

### Operating model — one host, two runner slots

Provision one dedicated x64 Linux VPS, initially sized at roughly 4 vCPU / 8 GB RAM with SSD for two runner
workspaces and logs, price-capped at $15/month. Provider and exact SKU are an execution-time procurement detail,
resized only if canary measurements miss the latency target. Run two separately registered GitHub Actions runner
services on the host: each registered runner accepts one job at a time, so two services provide the smallest
useful concurrency step without recreating GitHub's hosted fan-out or requiring an autoscaler. Both services carry
one repository-specific label, `arc-ci-linux`.

The host is CI-only: no development checkout, personal notes, PATs, deploy keys, unrelated services, or access to
private infrastructure. Jobs run as an unprivileged service user. The machine needs outbound HTTPS and
administrative access only; it exposes no inbound application port. Unattended OS security updates are enabled, the
runner application's default automatic updates are retained, and the service manager's restart behavior is used.
The runner is persistent (not ephemeral) by deliberate choice — see Alternatives.

This minimal hardening is sufficient only because the current job topology needs neither Docker nor access to
private network services; either need would reopen the hardening design rather than being added casually. The host
must also carry the small tool set the hosted images provide implicitly — `git`, the GitHub CLI (`gh`), `jq`,
`shellcheck`, and a POSIX shell with coreutils — because the workflow shells out to them directly (notably the
classifier's `gh api` verified-tree lookback, the roll-up's `jq`, and the shell-lint leg's system `shellcheck`).
These are load-bearing VPS prerequisites, not conveniences; § Cross-cutting/Testing records the failure modes when
they are absent.

The host also retains lightweight local CPU, memory, load, and disk samples plus runner-service and restart logs
from before cutover through the permanent-posture decision. Provider charts may complement this record but are not
assumed to expose guest-memory data or sufficient history. Collection stays local and size-bounded, with protected
user-held export before rotation or destructive rebuild when needed; only sanitized summaries and incident evidence
enter tracked notes. This is diagnostic coverage for the bounded canary, not a general monitoring platform.

### Workflow routing and fail-safe fallback

Route every Linux job in `.github/workflows/ci.yml` through a repository Actions variable, `ARC_CI_LINUX_RUNNER`:

```yaml
runs-on: ${{ vars.ARC_CI_LINUX_RUNNER || 'ubuntu-latest' }}
```

Its normal value is the custom self-hosted label (`arc-ci-linux`); an unset or empty variable defaults to
`ubuntu-latest`, so initial setup and accidental deletion fail *toward* hosted execution rather than an
unmatchable queue. The fallback procedure is: set the variable to `ubuntu-latest` (or clear it), cancel any queued
run, and re-run — restoring the hosted path in under five minutes with no workflow edit.

Nine jobs route through the variable: `classify`, `setup`, `lint-typecheck`, `unit`, `integration`, `e2e` (shard
matrix), `portability`, `ci_ok`, and `merge-ok`. Successful self-hosted execution is not a branch-protection
assumption — `merge-ok` remains the required check regardless of which runner label produced it.

The following stay on GitHub-hosted infrastructure: `portability-cross-platform` (Windows/macOS), the
`review-gate*` workflow family (especially privileged `pull_request_target` execution), and `docs.yml` through the
first cutover. This concentrates the saving on the recurring test workload and avoids broadening the persistent
runner's trust surface to remove a few low-volume minutes.

This routing creates one accepted coupling: `classify` also runs on the monthly cross-platform `schedule` cron,
and `portability-cross-platform` depends on it (`needs: classify`), so scheduled macOS/Windows coverage is now
tied to VPS uptime — an offline host at cron time skips that month's unattended run. `workflow_dispatch` re-runs it
on demand and a down host is already a monitored rebuild condition, so the exposure is a delayed monthly
safety-net run, not lost required coverage. Keeping `classify` self-hosted is deliberate: it is a per-PR job whose
hosted minutes would otherwise erode the zero-billed-minutes goal.

### Runner-neutral check identity

Today the `portability` job is a single-value matrix (`os: [ubuntu-latest]`), so its check renders
`Portability (concurrency guards) (ubuntu-latest)` — GitHub appends the matrix *value* as the suffix. That exact
string is one of the seven `HEAVY_CHECK_NAMES` entries in `scripts/classify-change.sh`, the byte-identical source
of truth for the verified-tree lookback that lets an already-verified code tree skip the heavy suite. The suffix
follows the matrix value, not `runs-on`, so the check name is already runner-invariant: routing only `runs-on`
through the variable would leave the name — and the classifier — untouched.

The remaining problem is *honesty*, not correctness. Once the job runs on the VPS, a check named `(ubuntu-latest)`
misrepresents its executor, and this WU's goal is a check identity independent of the runner. So the leg is
converted to an executor-neutral name in one change:

- Replace the single-value matrix with a non-matrix job statically named `Portability (concurrency guards)
  (linux)`, with `runs-on` through the variable.
- Update the matching `HEAVY_CHECK_NAMES` entry in `scripts/classify-change.sh` to the new static name.
- Update the corresponding unit fixture in `packages/arc-framework/__tests__/unit/classify-change.test.ts`.

This is a deliberate naming choice: keeping the single-value matrix would achieve the cost goal with zero edits but
leave the misleading suffix in place. The classifier and fixture edits are the accepted price of an honest name,
and the coupling they touch already binds all seven `HEAVY_CHECK_NAMES` entries to their `ci.yml` job names — no
new class of drift. The rename cannot wedge merges: `merge-ok` is the sole required branch-protection check and
its name does not change. The E2E shard checks (`E2E Tests (1..3)`) key on the shard matrix, not `runs-on`, so
they are unaffected — the change touches exactly one check name.

### Preserve the job graph through the canary

Keep the current classifier, shared setup, lint/typecheck, unit, integration, E2E shards, Linux portability, and
roll-up jobs intact for the initial canary; the two runner slots execute the existing fan-out in bounded waves.
This gives a comparable performance baseline and avoids combining a runner migration with a test-topology rewrite.

The deferred consolidation idea is absorbed but not assumed beneficial. Self-hosting removes per-job minute
rounding, so consolidation must now earn its way through measured latency or reliability rather than billing
arithmetic — evaluated after the canary, and only if runner contention or repeated setup prevents the latency
target.

### Fail-closed access-control cutover precondition

The persistent-runner acceptance is a *cutover precondition*, not an inference from current authorship. Before
assigning the `arc-ci-linux` label, run a one-time checklist and record the result in the cutover evidence:

- repository collaborators and pending invitations;
- private forks;
- installed apps and bots;
- automation that can originate pull requests;
- Actions fork settings.

Enable the runners only when every principal able to submit executable `pull_request` code is explicitly trusted;
otherwise stay hosted. Re-run the checklist whenever repository access changes. (Rationale in Cross-cutting §
Security.)

### Rebuild and maintenance contract

Check in a concise runbook covering: supported OS, package prerequisites, separate runner directories, the label,
service installation, the access-control precondition, the repository-variable cutover, health checks, log
locations and retention, lightweight resource sampling, cleanup, fallback, credential-aware incident response,
rebuild, and decommissioning. Explicitly out of scope for the runbook: Kubernetes, autoscaling, custom runner
images, and any general infrastructure platform.

Operational cadence stays modest:

- runner automatic updates remain enabled; verify runner status and update logs monthly;
- unattended OS security updates run automatically, with a planned reboot when required;
- inspect disk use and prune obsolete runner diagnostics or workspaces during the monthly check;
- treat compromise or unexplained residue as a rebuild, not a forensic repair;
- before any public flip, select `ubuntu-latest`, verify a hosted run, deregister every runner, and destroy the VPS.

## Alternatives & Rationale

- **Flip the repository public now.** Best long-term cost shape and no runner maintenance, but rejected as a
  CI-cost shortcut: it exposes code, history, logs, and forks, and is blocked on storage separation and security
  gates already owned by `public-repo-flip`.
- **Keep optimizing hosted CI only.** Lowest operational burden, but the measured post-remediation residual shows
  that content classification and shared setup do not decouple cost from active development volume.
- **Use the local WSL development machine as a runner.** Cheap, but rejected because sleep, connectivity, and
  competing session load turn CI availability into a workstation concern.
- **Ephemeral autoscaling runners or Kubernetes.** Stronger isolation and elastic capacity, but rejected for this
  trust model and volume: provisioning, image updates, log forwarding, and scale-controller maintenance would make
  the solution a second project to operate.
- **One persistent runner service.** Simpler, but likely serializes the heavy graph enough to miss the latency
  target. Two services on one host are the smallest useful concurrency step.
- **Ephemeral rather than persistent runner.** Rejected at this volume: the accepted trust boundary is narrow (a
  private repository, a trusted author set, and a `ci.yml` that grants no repository write beyond its job-scoped
  artifact permissions), so ephemeral isolation's provisioning cost is not warranted. The host stores its runner
  identity and transiently handles source, job tokens, and build outputs — sensitive but revocable, not durable
  development credentials.

## Cross-cutting Considerations

### Security / trust boundary

The accepted trust boundary is narrow and explicit. The host necessarily stores its runner identity and
temporarily handles source, job tokens, and build outputs; those are sensitive but revocable, not durable
development credentials. A persistent self-hosted runner executing `pull_request` code is the canonical exposure,
which is why the cutover precondition is fail-closed and re-fired on any access change rather than inferred from
current authorship.

Incident response is credential-aware and rebuild-first: suspected compromise triggers hosted fallback, runner
removal in GitHub, review or revocation of affected credentials, and VPS destruction and rebuild. A
public-repository flip or an expansion to untrusted contributors invalidates the acceptance and requires routing
back to hosted runners and deregistering the VPS runners before the transition — a stated prerequisite the
`public-repo-flip` work unit must honor.

### Performance / concurrency capacity

The host's total capacity is **two concurrent jobs across all runs and all PRs** — the deliberate cost/latency
trade. Two consequences follow, and this is the design's primary risk:

- **Intra-run.** A heavy PR fans out into ~7 parallelizable legs (`lint-typecheck`, `unit`, `integration`,
  `e2e`×3, `portability`) behind shared setup. On hosted runners these run near-simultaneously; on two slots they
  run two-at-a-time (~4 waves), so even a single PR's wall-clock rises. The `p95 < 10 min` success criterion is
  the falsifiable check that it stays acceptable.
- **Cross-PR.** The `ci.yml` concurrency group (`workflow-event-ref`, `cancel-in-progress`) cancels superseded
  runs only within the same branch ref, so distinct PRs run concurrently and contend for the same two slots. N
  in-flight heavy PRs queue against 2 slots; latency degrades roughly with N. The degradation mode is queueing
  (latency), not failure — jobs wait rather than erroring.
- **Existing load cap.** The classifier's light lane already bounds contention: docs-only and verified-tree PRs
  skip the heavy suite, so most runs are two or three short jobs, not a seven-leg fan-out. The contention case is
  specifically multiple simultaneous heavy code PRs, which is rare on this solo, low-volume repository — expected
  exposure is low and bounded.
- **Pressure valve.** When a collision makes latency unacceptable, the fail-safe variable bursts back to hosted in
  under five minutes.
- **Scaling levers, on evidence only.** Two distinct failure modes take two different responses: *queue depth*
  (jobs waiting for a free slot) is relieved only by **more runner services plus a proportionally larger host** —
  adding vCPU without adding services does not add slots; *per-job starvation* (a running leg short on CPU or
  memory) is relieved by a **resize**. Per-job Actions timestamps and the retained host/service record distinguish
  those causes. Neither correction is provisioned up front: starting at the two-slot floor and scaling on the
  measured failure mode is the proportionate choice, and speculative headroom for rare cross-PR collisions would
  be over-provisioning.

### Testing

- The renamed portability check requires updating `HEAVY_CHECK_NAMES` and its unit fixture in the same change; the
  existing classifier unit suite guards the check-name contract.
- The canary is the acceptance test: measured `merge-ok` p95, and flake / offline-stall observation across the
  sample floor.
- **Verified-tree reuse must be confirmed to fire on self-hosted**, not merely that runs go green. The classifier's
  lookback shells `gh api` and swallows failure (`2>/dev/null … || true`), so a missing `gh` or token on the host
  reads as "not verified" and silently forces every code PR heavy — inflating the very two-slot contention the
  canary measures and misdirecting its tuning toward a resize when the real cause is an absent binary. Cutover
  therefore includes a positive check that a known-verified tree classifies `reason=verified` on the self-hosted
  runner; a missing `jq` instead hard-fails the roll-up (loud, self-evident).
- A fallback drill (flip the variable to `ubuntu-latest`, confirm a hosted run) validates the recovery path before
  it is relied on.

### Migration / rollout

- The change lands hosted-first: the variable is set to the self-hosted label only after the access-control
  precondition passes and the runner is confirmed healthy. Until then the fail-safe default keeps execution hosted.
- The canary runs the real job graph; unacceptable latency or reliability routes to burst-to-hosted, then a tuning
  pass (resize or add a service), then a permanent hosted fallback if the target cannot be met economically.
- **TECHNICAL-OVERVIEW update is an in-scope deliverable.** § 3 Infrastructure (CI/CD) records the self-hosted
  Linux execution target only at permanent cutover after canary acceptance, riding TECHNICAL-OVERVIEW's
  infrastructure-shift update discipline as a dedicated edit with rationale. The bounded trial is qualification,
  not a durable architecture claim; permanent hosted fallback leaves the existing overview unchanged.
- Decommission is a documented sequence: select hosted, verify a hosted run, deregister every runner, destroy the
  VPS.

## Success Criteria

1. Normal `ci.yml` Linux jobs report self-hosted execution and incur no Actions runner charges; macOS and Windows
   portability jobs remain hosted.
2. A comparable heavy PR run drops from about 14 billed Linux job-minutes to zero, excluding an explicitly invoked
   hosted-fallback run.
3. The canary runs for at least seven days and 20 comparable heavy-PR runs, with no runner-caused flakes or
   unexplained offline stalls, and reaches `merge-ok` within 10 minutes at p95. If seven days does not produce the
   sample floor, the canary continues until it does.
4. Switching `ARC_CI_LINUX_RUNNER` to `ubuntu-latest` and re-running restores the hosted path in under five
   minutes without a workflow edit.
5. The runner can be rebuilt from the checked-in runbook in at most two hours, with no machine backup required.
6. After the check-identity change, the portability check name `Portability (concurrency guards) (linux)` matches
   its `HEAVY_CHECK_NAMES` entry (alongside the unchanged lint/typecheck, unit, integration, and E2E-shard names),
   and a known-verified tree classifies `reason=verified` when built on the self-hosted runner — so verified-tree
   reuse survives the executor change in fact, not just in name.
7. TECHNICAL-OVERVIEW § 3 records the accepted self-hosted Linux execution target at permanent cutover.

## Open Questions

- Provider and exact SKU selection, and any evidence-driven resize — implementation detail inside the recorded
  resource and price envelope, not a design blocker.
- Whether two slots meet the p95 target under this repository's real concurrency — the canary's primary falsifiable
  assumption. The first response is to add a runner service or resize; a permanent hosted fallback follows if the
  target cannot be met economically. This is resolved by measurement during the work, not deferred design debt.
