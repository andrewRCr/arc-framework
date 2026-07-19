# Notes: self-hosted-ci

## Contents

- Effort and burden estimate (task-generation sizing reference)
- Cutover evidence

---

## Effort and burden estimate

Runner registration itself is roughly a 30-minute operation; a reliable cutover is larger:

- VPS provisioning, hardening, packages, and two runner services — 1–2 hours
- Workflow label variable, fallback path, and focused verification — 3–5 hours
- Runbook, monitoring baseline, and decommission contract — 1–2 hours
- Canary review and one tuning pass — ~1 hour active over 7+ elapsed days and ≥20 heavy runs

Budget 6–10 hands-on hours (one to two focused working days) for the complete work unit. Normal maintenance should
average 15–30 minutes per month. Allow an occasional one-to-two-hour reboot, runner repair, or disposable VPS
rebuild; if that becomes common, the canary has failed and the design should fall back to hosted runners.

## Cutover evidence

Record only sanitized operational evidence. Never include an endpoint, administrator identity, SSH mapping or
fingerprint, full principal roster, secret, registration/removal token, private key material, payment detail, or
provider credential.

### Selection

- **Provider / SKU / region:** OVHcloud US / VPS-2 2027 / US East — Vint Hill, Virginia
- **Recurring price / billing basis:** $10 per month with a one-month commitment
- **Supported OS / architecture:** Ubuntu 26.04 LTS / x86-64
- **CPU / RAM / disk / transfer:** 4 vCore / 8 GB RAM / 75 GB NVMe / unlimited traffic at 1 Gbps
- **Shared or dedicated CPU:** allocated virtual cores on shared physical infrastructure
- **Backup posture:** no premium backup or manual snapshots; bundled rolling 24-hour system-disk backup is accepted
  residual exposure, never a recovery dependency
- **Provider metrics and retention:** CPU, RAM, and network monitoring available; no published retention guarantee
- **Local sampling posture:** five-minute `sysstat` cadence with at least 60 days' retention is authoritative
- **Selection rationale and accepted tradeoffs:** Smallest qualifying US-billed option, with an in-place resize path
  if canary evidence shows running-job starvation. Shared infrastructure, the 99.9% SLA, 75 GB disk, and the bundled
  24-hour backup are accepted for the bounded canary; hosted fallback remains the pressure valve. Rebuild is the
  recovery path; an exceptional restore forces runner-credential rotation, a renewed access audit, and full health
  qualification.
- **Approved:** 2026-07-19 — revised provider, backup exception, configuration, region, access, evidence posture,
  and spend approved
- **Acquired:** 2026-07-19 — allocation available; provider-account MFA and user-held SSH-key access confirmed

### Access-control precondition

- **Audit timestamp:** 2026-07-19; repeated immediately before post-rebuild registration with no principal or policy
  change
- **Collaborators:** 1; explicitly trusted; no exception
- **Pending invitations:** 0
- **Private forks:** 0
- **Installed apps and bots:** 3 installed apps with repository access; all explicitly trusted
- **Pull-request-producing automation:** no repository workflow originates pull requests; all three app-backed
  automation principals were conservatively treated as capable of influencing executable code and explicitly trusted
- **Actions fork settings:** private-fork workflows disabled; write-token and secret forwarding disabled
- **Gate result:** Pass — every current principal able to submit or influence executable pull-request code is
  explicitly trusted; repeat immediately after any access or automation change

### Host and runner readiness

- **Provisioning window:** 2026-07-19
- **Sanitized allocation reference:** [optional]
- **OS updates / unattended updates / reboot:** Ubuntu 26.04 LTS fully upgraded; kernel 7.0.0-28 active after a
  controlled reboot; no pending updates or reboot; unattended updates and both APT timers enabled; unattended
  reboots disabled for controlled maintenance
- **Inbound / outbound posture:** host firewall active with default-deny inbound and SSH as the only public listener;
  key-only administrative login enforced, root login disabled, unrestricted outbound retained for GitHub and
  package access, and no private-network access configured
- **Runner service user and directory isolation:** unprivileged `arc-runner` has no supplementary groups; two
  separately owned application directories use mode `0750`; no development checkout, unrelated service, Docker,
  runner registration artifact, or runner service exists
- **Tool versions (`git`, `gh`, `jq`, `shellcheck`, shell/coreutils):** Git 2.53.0; GitHub CLI 2.46.0; jq 1.8.1;
  ShellCheck 0.11.0; `/bin/sh` resolves to dash; Ubuntu's uutils coreutils 0.8.0; all required executables resolve
  for `arc-runner`
- **Telemetry cadence / retention / cap / protected export:** `sysstat` active at five-minute cadence with 60-day
  history, compression after seven days, mode `0640` records, and retention-bounded storage; CPU, memory, load, and
  disk samples verified; the bounded pre-rebuild journal and `sysstat` export is retained only in the protected
  user-held workstation path with mode-`0600` files and contains no credentials or machine image
- **Persistent service/restart log retention / cap:** persistent compressed journal active with 60-day retention
  and a 1-GB cap; current disk use 16 MB
- **Runner application version / checksum result:** official Linux x64 runner 2.335.1 installed in both slots after
  its published SHA-256 matched; dependencies installed; two unique intended names remain transient operator inputs,
  with label `arc-ci-linux` reserved for post-audit registration
- **Runner 1 sanitized status / labels / service health:** online and idle with `self-hosted`, `Linux`, `X64`, and
  `arc-ci-linux`; enabled `arc-runner` service uses slot 1, automatic runner updates, and a five-second always-restart
  policy; survived controlled service restart and host reboot
- **Runner 2 sanitized status / labels / service health:** online and idle with `self-hosted`, `Linux`, `X64`, and
  `arc-ci-linux`; enabled `arc-runner` service uses slot 2, automatic runner updates, and a five-second always-restart
  policy; survived controlled service restart and host reboot
- **Disk headroom / projected retention:** 68 GB free of 72 GB (94% free); bounded journal and `sysstat` retention
  fit comfortably through the canary and posture decision
- **Pre-cutover go/no-go:** Go for the controlled qualification cutover; the access gate and both slot health checks
  pass, while `ARC_CI_LINUX_RUNNER` remains absent until the explicit Phase 3 routing action

### Qualification and drills

- **Initial self-hosted qualification run id / timestamp:**
  [29705044064](https://github.com/andrewRCr/arc-framework/actions/runs/29705044064) — 2026-07-19 21:49:27Z;
  pull request #305 at head `8745d41e4`; success
- **Linux job placement result:** all 11 Linux jobs ran on the two expected `arc-ci-linux` runners, including
  classifier, setup, lint/typecheck, unit, integration, all three E2E shards, Linux portability, `ci-ok`, and
  `merge-ok`; both roll-ups passed
- **Hosted-only job isolation result:** the targeted Windows and macOS portability jobs ran on GitHub-hosted
  runners; no documentation or review-gate workflow ran for the qualification head
- **Verified-tree proof run ids / classifier result:**
  [29705207328](https://github.com/andrewRCr/arc-framework/actions/runs/29705207328) — the first-cutover evidence
  commit preserved the code tree; the live classifier API lookback emitted `weight=light reason=verified`, and the
  light roll-up passed
- **Hosted fallback run id / elapsed time / result:**
  [29705287961](https://github.com/andrewRCr/arc-framework/actions/runs/29705287961) — changed the route to
  `ubuntu-latest` at 21:58:13Z, cancelled self-hosted attempt 1, and reran as attempt 2; the first hosted Linux job
  started after 25 seconds, every executed Linux job used a GitHub-hosted Ubuntu runner, and the replacement passed
- **Pre-registration rebuild result:** timer started at 22:06:51Z; both services and repository registrations were
  removed before a full Ubuntu 26.04 reinstall of the existing allocation. The host was rebuilt without a machine
  backup to a green hardened, credential-free two-directory baseline while hosted routing remained selected.
- **Rebuild deviations and runbook fixes:** the provider rebuild flow offered no existing-key injection, so the
  provider-delivered temporary password bootstrapped the existing key before password SSH was disabled; service
  uninstall must precede `config.sh remove`; mode-`0750` service commands must enter the directory inside the
  privileged shell; the service-owned archive in sticky temporary storage requires privileged removal; and manual
  full-suite dispatch skips the PR-only roll-ups, so exact-head PR evidence must accompany it.
- **Rebuild window / elapsed time / result:** 22:06:51Z–22:29:58Z; 23m07s from teardown start through both rebuilt
  services returning online and idle after a controlled reboot; pass against the two-hour limit
- **Exact-head hosted roll-up run id / result:**
  [29706274349](https://github.com/andrewRCr/arc-framework/actions/runs/29706274349) — the published rebuild-evidence
  head passed the heavy pull-request graph, including `ci-ok` and `merge-ok`, while fallback remained selected
- **Post-rebuild qualification run id / result:**
  [29706382714](https://github.com/andrewRCr/arc-framework/actions/runs/29706382714) — exact head `0889fa255`; manual
  full-suite dispatch passed in 3m51s with nine executed Linux jobs on the two rebuilt runners, zero hosted Linux
  jobs, and the Windows/macOS portability legs hosted; the event-contract-skipped PR roll-ups are covered by the
  immediately preceding exact-head pull-request run

- **First-cutover elapsed / queue result:** `merge-ok` completed 4m01s after run creation; the largest Linux queue
  delay was 2m31s for E2E shard 3 while the two slots were occupied; no offline stall or runner-caused failure
- **First-cutover Actions placement evidence:** 11 self-hosted Linux jobs and two expected hosted cross-platform
  jobs; zero hosted Linux jobs in the qualification workflow
- **Prerequisite diagnostic evidence:** the service account invokes GitHub CLI 2.46.0 and jq 1.8.1; an independent
  jq roll-up expression passed, the live `ci-ok` job passed on the runner, the classifier completed its authenticated
  API lookback, and both runner journals recorded zero warnings through the two proof runs

### Canary samples

| Run id | Timestamp | Comparable heavy | `merge-ok` duration | Queue / CPU / memory / disk note | Failure classification |
| ------ | --------- | ---------------- | ------------------- | -------------------------------- | ---------------------- |
| [pending] | [pending] | [pending] | [pending] | [pending] | [pending] |

- **Canary window / qualifying sample count:** [pending]
- **`merge-ok` p95:** [pending]
- **Runner-caused flakes:** [pending]
- **Unexplained offline stalls:** [pending]
- **Telemetry/log coverage through decision:** [pending]
- **Self-hosted and fallback Actions cost evidence:** [pending]
- **Provider cost evidence:** [pending]

### Final posture

- **Decision / timestamp:** [pending]
- **Accepted route:** [pending]
- **Measured rationale:** [pending]
- **Open exception or follow-up:** [pending]
