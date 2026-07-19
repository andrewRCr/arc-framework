# Draft: Self-hosted CI

- **Origin:** Post-remediation GitHub Actions billing review, with the retained self-hosted-runner capture and the
  deferred test-job consolidation re-weigh as inbound evidence.
- **Purpose:** Move the private repository's Linux CI load onto a small, deliberately boring VPS so Actions cost no
  longer scales with development volume, without turning CI infrastructure into a second project to operate.

---

## Problem / Motivation

The content-aware CI work and PR #281 remediation improved which jobs run, but did not materially change the
per-heavy-run billing shape. A representative heavy run before and after the remediation billed the same 14 Linux
job-minutes because short jobs still round independently. The opt-in `ci-defer-heavy` label has not been used in the
post-landing PR sample, so it is not changing the normal run rate.

The residual has crossed the retained escape hatch's adoption threshold:

- June 2026 recorded $19.152 gross Actions usage and $1.152 net paid usage for this repository.
- July 1-19 recorded $28.938 gross and $10.988 net by the latest billing sample.
- July 18, the first full day after PR #281, still recorded 230 Linux, 7 macOS, and 14 Windows minutes: $1.954 net.
- July 19's partial sample had already recorded another 158 Linux minutes and $0.948 net.

Going public would eliminate standard hosted-runner charges, but it is a release decision with independent privacy
and security gates. In particular, identity-global notes must leave the code repository's origin, the
`pull_request_target` workflows need a public-fork threat audit, and the full history needs a secret scan. CI cost
does not justify pulling that decision forward.

The near-term answer should therefore make the Linux CI data plane cheap while preserving GitHub-hosted macOS and
Windows coverage and an immediate hosted fallback.

## Success Signals

1. Normal `ci.yml` Linux jobs report self-hosted execution and incur no Actions runner charges; macOS and Windows
   portability jobs remain hosted.
2. A comparable heavy PR run drops from about 14 billed Linux job-minutes to zero, excluding an explicitly invoked
   hosted-fallback run.
3. The canary runs for at least seven days and 20 comparable heavy-PR runs, has no runner-caused flakes or unexplained
   offline stalls, and reaches `merge-ok` within 10 minutes at p95. If seven days does not produce the sample floor,
   the canary continues until it does.
4. Switching one repository variable to `ubuntu-latest`, then re-running the workflow, restores the hosted path in
   under five minutes without a workflow edit.
5. The runner can be rebuilt from the checked-in runbook in at most two hours, with no machine backup required.

## Proposed Design

### Deliberately small operating model

Provision one dedicated x64 Linux VPS, initially sized at roughly 4 vCPU, 8 GB RAM, and enough SSD for two runner
workspaces and logs. Cap the target price at $15/month; provider choice is interchangeable and can remain an
execution-time procurement decision. Resize only if canary measurements miss the latency target.

Run two separately registered GitHub Actions runner services on the host. One registered runner accepts one job at a
time, so two services preserve useful concurrency without recreating GitHub's full hosted fan-out or requiring an
autoscaler. Both services carry one repository-specific custom label such as `arc-ci-linux`.

The host is CI-only: no development checkout, personal notes, PATs, deploy keys, unrelated services, or access to
private infrastructure. Jobs run as an unprivileged service user. The machine needs outbound HTTPS and
administrative access only; it does not expose an application port. Enable unattended OS security updates, retain the
runner application's default automatic updates, and use the service manager's restart behavior.

This is intentionally a persistent runner. The accepted trust boundary is narrow: the repository is private, the
current author set is trusted, and `ci.yml` grants no repository write beyond its existing job-scoped artifact
permissions. The host necessarily stores its runner identity and temporarily handles source, job tokens, and build
outputs; those are sensitive but revocable, not durable development credentials. Suspected compromise triggers hosted
fallback, runner removal in GitHub, review or revocation of affected credentials, and VPS destruction and rebuild. A
public-repository flip or an expansion to untrusted contributors invalidates the acceptance and requires routing back
to hosted runners and deregistering the VPS runners before the transition.

Make that trust boundary a cutover precondition rather than an inference from current authorship. Before assigning the
self-hosted label, audit repository collaborators and pending invitations, private forks, installed apps and bots,
automation that can originate pull requests, and Actions fork settings. Enable the runners only when every principal
able to submit executable `pull_request` code is explicitly trusted; otherwise stay hosted. Record the result in the
cutover evidence and repeat the audit whenever repository access changes.

### Workflow routing and fallback

Route every Linux job in `ci.yml` through a repository variable such as `ARC_CI_LINUX_RUNNER`. Its normal value is
the custom self-hosted label; its fallback value is `ubuntu-latest`. The workflow expression defaults an unset or
empty variable to `ubuntu-latest`, so initial setup and accidental deletion fail toward hosted execution rather than an
unmatchable queue. The fallback procedure is: change the variable, cancel any queued run, and re-run it. Do not make
successful self-hosted execution a branch-protection assumption; `merge-ok` remains the required check regardless of
which runner label produced it.

Keep check identity independent of runner identity. Replace the Linux portability job's single-value
`ubuntu-latest` matrix with a non-matrix job named `Portability (concurrency guards) (linux)`, and route its `runs-on`
through the same repository variable. Update the classifier's exact heavy-check name and its unit fixture in the same
change. Hosted fallback then changes the executor without changing the check name or silently defeating verified-tree
reuse.

Keep the following work on GitHub-hosted infrastructure:

- macOS and Windows portability jobs;
- the review-gate workflow family, especially privileged `pull_request_target` execution;
- documentation deployment and other low-volume workflows during the first cutover.

This boundary concentrates the saving on the recurring test workload and avoids broadening the persistent runner's
trust surface merely to remove a few low-volume minutes.

### Preserve the job graph first

Keep the current classifier, shared setup, lint/typecheck, unit, integration, E2E shards, Linux portability, and
roll-up jobs intact for the initial canary. Two runner services will execute the existing fan-out in bounded waves.
This gives a comparable performance baseline and avoids combining a runner migration with a test-topology rewrite.

The deferred consolidation idea is therefore absorbed but not assumed to be beneficial. After the canary, compare
the current two-runner graph with a focused consolidated trial only if runner contention or repeated setup prevents
the latency target. Self-hosting removes per-job minute rounding, so consolidation must now earn its way through
measured latency or reliability rather than billing arithmetic.

### Rebuild and maintenance contract

Check in a concise runbook covering the supported OS, package prerequisites, separate runner directories, labels,
service installation, the access-control precondition, repository-variable cutover, health checks, log locations,
cleanup, fallback, credential-aware incident response, rebuild, and decommissioning. Do not build Kubernetes,
autoscaling, custom runner images, or a general infrastructure platform.

Operational checks stay modest:

- automatic runner updates remain enabled; verify runner status and update logs monthly;
- unattended OS security updates run automatically, with a planned reboot when required;
- inspect disk use and prune obsolete runner diagnostics or workspaces during the monthly check;
- treat compromise or unexplained residue as a rebuild, not a forensic repair;
- before any public flip, select `ubuntu-latest`, verify a hosted run, deregister both runners, and destroy the VPS.

## Alternatives

- **Flip the repository public now:** Best long-term cost shape and no runner maintenance, but rejected as a CI-cost
  shortcut. It exposes code, history, logs, and forks and is blocked on storage separation and security gates already
  owned by `public-repo-flip`.
- **Keep optimizing hosted CI only:** Lower operational burden, but the measured post-remediation residual shows that
  content classification and shared setup do not decouple cost from active development volume.
- **Use the local WSL development machine:** Cheap, but rejected because sleep, connectivity, and competing session
  load turn CI availability into a workstation concern.
- **Use ephemeral autoscaling runners or Kubernetes:** Stronger isolation and elastic capacity, but rejected for this
  trust model and volume. Provisioning, image updates, log forwarding, and scale-controller maintenance would make the
  solution a burden.
- **Use one persistent runner service:** Simpler, but likely serializes the current heavy graph enough to miss the
  latency target. Two services on one host are the smallest useful concurrency step.

## Effort and Burden

The runner registration itself is roughly a 30-minute operation. A reliable cutover is larger:

| Work | Active effort |
| ------ | --------------- |
| VPS provisioning, hardening, packages, and two runner services | 1-2 hours |
| Workflow label variable, fallback path, and focused verification | 3-5 hours |
| Runbook, monitoring baseline, and decommission contract | 1-2 hours |
| Canary review and one tuning pass | About 1 hour active over 7+ elapsed days and at least 20 heavy runs |

Budget 6-10 hands-on hours, or one to two focused working days for the complete ARC work unit. Normal maintenance
should average 15-30 minutes per month. Allow an occasional one-to-two-hour reboot, runner repair, or disposable VPS
rebuild; if that becomes common, the canary has failed and the design should fall back to hosted runners.

## Unknowns and Assumptions

- The VPS provider and exact SKU are not design commitments; choose a reputable x64 offering that meets the resource
  and price envelope, then resize from observed p95 latency and memory pressure.
- The persistent-runner acceptance depends on the repository remaining private and the cutover audit confirming that
  workflow-trigger authority is limited to explicitly trusted humans and automation. Access changes re-fire that
  audit; the public-repo work unit must treat runner decommissioning as a prerequisite.
- Two concurrent jobs on 4 vCPU / 8 GB are expected to meet the target, but this is the canary's main falsifiable
  assumption. The first response is a VPS resize; job consolidation is considered only with measured evidence.
- The current job topology does not require Docker or access to private network services. Either need would reopen the
  hardening design rather than being added casually.

## Scope Estimate

Medium implementation surface and a short operational canary: one Heavy work unit, not a cohort. The work spans one
coupled deliverable — provision the replaceable runner, route the Linux CI jobs, prove fallback and latency, and
document operation. Public visibility remains in `public-repo-flip`; ARC-wide merge serialization remains in
`integration-lane`.

## Planning State

- **Readiness:** Formalization-ready. The in-context readiness check and Heavy-class adversarial pass converged; both
  confirmed findings are folded and no blocker or major remains open.
- **Resolved:** self-host rather than pull the public flip forward; one dedicated persistent VPS; two runner services;
  fail-safe repository-variable fallback; stable runner-neutral check identity; a fail-closed access-control cutover
  audit; hosted cross-platform and privileged workflows; preserve the job graph through the canary; no autoscaling or
  Kubernetes.
- **Open:** No fundamental design decision. Provider selection and any evidence-driven resize are implementation
  details inside the recorded envelope.
- **Next:** Review and approve draft capture, then continue to spec formalization.
