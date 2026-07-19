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

One pull-request workflow run id is one ledger row across every attempt. A qualifying latency sample is reviewed,
non-deferred, heavy, self-hosted, and completes the full Linux graph plus `merge-ok`; excluded runs remain in the
reliability ledger. Elapsed time is initial run creation through the final attempt's `merge-ok` completion. Linux
placement is proved from the Actions jobs API's runner names and labels, not billing attribution.

| Run id                                                                             | Head        | Attempts | Cross-platform target | Full Linux graph | Created (UTC)       | Final `merge-ok` (UTC) | Elapsed | Placement                                     | Eligible | Result / classification                                              |
|------------------------------------------------------------------------------------|-------------|----------|-----------------------|------------------|---------------------|------------------------|---------|-----------------------------------------------|----------|----------------------------------------------------------------------|
| [29705044064](https://github.com/andrewRCr/arc-framework/actions/runs/29705044064) | `8745d41e4` | 1        | yes                   | yes              | 2026-07-19 21:49:27 | 2026-07-19 21:53:28    | 4m01s   | 11 self-hosted Linux; 0 hosted Linux          | yes      | success                                                              |
| [29705207328](https://github.com/andrewRCr/arc-framework/actions/runs/29705207328) | `0d3736066` | 1        | yes                   | no               | 2026-07-19 21:55:05 | 2026-07-19 21:56:44    | 1m39s   | 4 self-hosted Linux; 0 hosted Linux           | no       | success; verified-tree light lane                                    |
| [29705287961](https://github.com/andrewRCr/arc-framework/actions/runs/29705287961) | `c2666d3b2` | 2        | yes                   | no               | 2026-07-19 21:57:57 | 2026-07-19 22:00:52    | 2m55s   | attempt 1 self-hosted; attempt 2 hosted Linux | no       | planned fallback: cancelled first attempt, hosted light rerun passed |
| [29706274349](https://github.com/andrewRCr/arc-framework/actions/runs/29706274349) | `0889fa255` | 1        | yes                   | yes              | 2026-07-19 22:30:35 | 2026-07-19 22:33:48    | 3m13s   | 0 self-hosted Linux; 11 hosted Linux          | no       | success; planned hosted rebuild window                               |
| [29706622340](https://github.com/andrewRCr/arc-framework/actions/runs/29706622340) | `e183ddd8e` | 1        | yes                   | yes              | 2026-07-19 22:42:11 | 2026-07-19 22:46:09    | 3m58s   | 11 self-hosted Linux; 0 hosted Linux          | yes      | success                                                              |

#### Per-attempt Linux job ledger

All timestamp triples below are the Actions jobs API `created_at` / `started_at` / `completed_at` values on
2026-07-19 UTC. `Q/R` is queue delay / running duration in seconds. Skipped jobs retain their API time triple but
have no runner and no meaningful derived duration.

| Run / attempt   | Job                                      | Created / started / completed (UTC) | Q/R (s) | Runner           | Label           | Result    |
|-----------------|------------------------------------------|-------------------------------------|---------|------------------|-----------------|-----------|
| 29705044064 / 1 | Classify lane & weight                   | 21:49:27 / 21:49:29 / 21:49:43      | 2/14    | `arc-ci-linux-1` | `arc-ci-linux`  | success   |
| 29705044064 / 1 | Shared setup                             | 21:49:44 / 21:49:46 / 21:50:05      | 2/19    | `arc-ci-linux-2` | `arc-ci-linux`  | success   |
| 29705044064 / 1 | Lint & Typecheck                         | 21:50:05 / 21:50:07 / 21:51:40      | 2/93    | `arc-ci-linux-2` | `arc-ci-linux`  | success   |
| 29705044064 / 1 | Portability (concurrency guards) (linux) | 21:50:05 / 21:50:07 / 21:50:27      | 2/20    | `arc-ci-linux-1` | `arc-ci-linux`  | success   |
| 29705044064 / 1 | Unit Tests                               | 21:50:05 / 21:51:20 / 21:51:49      | 75/29   | `arc-ci-linux-1` | `arc-ci-linux`  | success   |
| 29705044064 / 1 | Integration Tests                        | 21:50:05 / 21:51:41 / 21:53:08      | 96/87   | `arc-ci-linux-2` | `arc-ci-linux`  | success   |
| 29705044064 / 1 | E2E Tests (1)                            | 21:50:05 / 21:50:28 / 21:51:19      | 23/51   | `arc-ci-linux-1` | `arc-ci-linux`  | success   |
| 29705044064 / 1 | E2E Tests (2)                            | 21:50:05 / 21:51:50 / 21:52:34      | 105/44  | `arc-ci-linux-1` | `arc-ci-linux`  | success   |
| 29705044064 / 1 | E2E Tests (3)                            | 21:50:05 / 21:52:36 / 21:53:20      | 151/44  | `arc-ci-linux-1` | `arc-ci-linux`  | success   |
| 29705044064 / 1 | ci-ok                                    | 21:53:20 / 21:53:22 / 21:53:24      | 2/2     | `arc-ci-linux-1` | `arc-ci-linux`  | success   |
| 29705044064 / 1 | merge-ok                                 | 21:53:24 / 21:53:26 / 21:53:28      | 2/2     | `arc-ci-linux-2` | `arc-ci-linux`  | success   |
| 29705207328 / 1 | Classify lane & weight                   | 21:55:05 / 21:55:07 / 21:55:13      | 2/6     | `arc-ci-linux-1` | `arc-ci-linux`  | success   |
| 29705207328 / 1 | Lint & Typecheck                         | 21:55:14 / 21:55:15 / 21:55:32      | 1/17    | `arc-ci-linux-2` | `arc-ci-linux`  | success   |
| 29705207328 / 1 | Shared setup                             | 21:55:14 / 21:55:14 / 21:55:13      | —       | —                | `arc-ci-linux`  | skipped   |
| 29705207328 / 1 | Portability (concurrency guards) (linux) | 21:55:14 / 21:55:14 / 21:55:14      | —       | —                | `arc-ci-linux`  | skipped   |
| 29705207328 / 1 | Unit Tests                               | 21:55:14 / 21:55:14 / 21:55:14      | —       | —                | `arc-ci-linux`  | skipped   |
| 29705207328 / 1 | Integration Tests                        | 21:55:14 / 21:55:14 / 21:55:14      | —       | —                | `arc-ci-linux`  | skipped   |
| 29705207328 / 1 | E2E Tests                                | 21:55:14 / 21:55:14 / 21:55:14      | —       | —                | `arc-ci-linux`  | skipped   |
| 29705207328 / 1 | ci-ok                                    | 21:56:36 / 21:56:37 / 21:56:40      | 1/3     | `arc-ci-linux-1` | `arc-ci-linux`  | success   |
| 29705207328 / 1 | merge-ok                                 | 21:56:40 / 21:56:42 / 21:56:44      | 2/2     | `arc-ci-linux-2` | `arc-ci-linux`  | success   |
| 29705287961 / 1 | Classify lane & weight                   | 21:57:58 / 21:58:00 / 21:58:06      | 2/6     | `arc-ci-linux-1` | `arc-ci-linux`  | success   |
| 29705287961 / 1 | Lint & Typecheck                         | 21:58:07 / 21:58:09 / 21:58:17      | 2/8     | `arc-ci-linux-2` | `arc-ci-linux`  | cancelled |
| 29705287961 / 1 | Shared setup                             | 21:58:07 / 21:58:07 / 21:58:07      | —       | —                | `arc-ci-linux`  | skipped   |
| 29705287961 / 1 | Portability (concurrency guards) (linux) | 21:58:07 / 21:58:07 / 21:58:07      | —       | —                | `arc-ci-linux`  | skipped   |
| 29705287961 / 1 | Unit Tests                               | 21:58:07 / 21:58:07 / 21:58:07      | —       | —                | `arc-ci-linux`  | skipped   |
| 29705287961 / 1 | Integration Tests                        | 21:58:07 / 21:58:07 / 21:58:07      | —       | —                | `arc-ci-linux`  | skipped   |
| 29705287961 / 1 | E2E Tests                                | 21:58:07 / 21:58:07 / 21:58:07      | —       | —                | `arc-ci-linux`  | skipped   |
| 29705287961 / 1 | ci-ok                                    | 21:58:22 / 21:58:22 / 21:58:21      | —       | —                | `arc-ci-linux`  | cancelled |
| 29705287961 / 1 | merge-ok                                 | 21:58:21 / 21:58:23 / 21:58:25      | 2/2     | `arc-ci-linux-1` | `arc-ci-linux`  | failure   |
| 29705287961 / 2 | Classify lane & weight                   | 21:58:29 / 21:58:32 / 21:58:45      | 3/13    | hosted           | `ubuntu-latest` | success   |
| 29705287961 / 2 | Lint & Typecheck                         | 21:58:46 / 21:58:49 / 21:59:13      | 3/24    | hosted           | `ubuntu-latest` | success   |
| 29705287961 / 2 | Shared setup                             | 21:58:46 / 21:58:46 / 21:58:46      | —       | —                | `ubuntu-latest` | skipped   |
| 29705287961 / 2 | Portability (concurrency guards) (linux) | 21:58:46 / 21:58:46 / 21:58:46      | —       | —                | `ubuntu-latest` | skipped   |
| 29705287961 / 2 | Unit Tests                               | 21:58:46 / 21:58:46 / 21:58:46      | —       | —                | `ubuntu-latest` | skipped   |
| 29705287961 / 2 | Integration Tests                        | 21:58:46 / 21:58:46 / 21:58:46      | —       | —                | `ubuntu-latest` | skipped   |
| 29705287961 / 2 | E2E Tests                                | 21:58:46 / 21:58:46 / 21:58:46      | —       | —                | `ubuntu-latest` | skipped   |
| 29705287961 / 2 | ci-ok                                    | 22:00:39 / 22:00:42 / 22:00:45      | 3/3     | hosted           | `ubuntu-latest` | success   |
| 29705287961 / 2 | merge-ok                                 | 22:00:46 / 22:00:49 / 22:00:52      | 3/3     | hosted           | `ubuntu-latest` | success   |
| 29706274349 / 1 | Classify lane & weight                   | 22:30:36 / 22:30:40 / 22:30:58      | 4/18    | hosted           | `ubuntu-latest` | success   |
| 29706274349 / 1 | Shared setup                             | 22:30:58 / 22:31:02 / 22:31:22      | 4/20    | hosted           | `ubuntu-latest` | success   |
| 29706274349 / 1 | Lint & Typecheck                         | 22:31:22 / 22:31:25 / 22:32:48      | 3/83    | hosted           | `ubuntu-latest` | success   |
| 29706274349 / 1 | Portability (concurrency guards) (linux) | 22:31:22 / 22:31:25 / 22:31:50      | 3/25    | hosted           | `ubuntu-latest` | success   |
| 29706274349 / 1 | Unit Tests                               | 22:31:22 / 22:31:25 / 22:32:03      | 3/38    | hosted           | `ubuntu-latest` | success   |
| 29706274349 / 1 | Integration Tests                        | 22:31:22 / 22:31:26 / 22:33:36      | 4/130   | hosted           | `ubuntu-latest` | success   |
| 29706274349 / 1 | E2E Tests (1)                            | 22:31:22 / 22:31:26 / 22:32:48      | 4/82    | hosted           | `ubuntu-latest` | success   |
| 29706274349 / 1 | E2E Tests (2)                            | 22:31:22 / 22:31:25 / 22:32:22      | 3/57    | hosted           | `ubuntu-latest` | success   |
| 29706274349 / 1 | E2E Tests (3)                            | 22:31:22 / 22:31:25 / 22:32:30      | 3/65    | hosted           | `ubuntu-latest` | success   |
| 29706274349 / 1 | ci-ok                                    | 22:33:36 / 22:33:39 / 22:33:43      | 3/4     | hosted           | `ubuntu-latest` | success   |
| 29706274349 / 1 | merge-ok                                 | 22:33:43 / 22:33:46 / 22:33:48      | 3/2     | hosted           | `ubuntu-latest` | success   |
| 29706622340 / 1 | Classify lane & weight                   | 22:42:12 / 22:42:13 / 22:42:32      | 1/19    | `arc-ci-linux-1` | `arc-ci-linux`  | success   |
| 29706622340 / 1 | Shared setup                             | 22:42:32 / 22:42:34 / 22:42:50      | 2/16    | `arc-ci-linux-2` | `arc-ci-linux`  | success   |
| 29706622340 / 1 | Lint & Typecheck                         | 22:42:50 / 22:44:25 / 22:46:00      | 95/95   | `arc-ci-linux-1` | `arc-ci-linux`  | success   |
| 29706622340 / 1 | Portability (concurrency guards) (linux) | 22:42:50 / 22:42:52 / 22:43:10      | 2/18    | `arc-ci-linux-2` | `arc-ci-linux`  | success   |
| 29706622340 / 1 | Unit Tests                               | 22:42:50 / 22:43:44 / 22:44:23      | 54/39   | `arc-ci-linux-1` | `arc-ci-linux`  | success   |
| 29706622340 / 1 | Integration Tests                        | 22:42:50 / 22:43:12 / 22:44:30      | 22/78   | `arc-ci-linux-2` | `arc-ci-linux`  | success   |
| 29706622340 / 1 | E2E Tests (1)                            | 22:42:50 / 22:42:52 / 22:43:43      | 2/51    | `arc-ci-linux-1` | `arc-ci-linux`  | success   |
| 29706622340 / 1 | E2E Tests (2)                            | 22:42:50 / 22:44:32 / 22:45:08      | 102/36  | `arc-ci-linux-2` | `arc-ci-linux`  | success   |
| 29706622340 / 1 | E2E Tests (3)                            | 22:42:50 / 22:45:10 / 22:45:51      | 140/41  | `arc-ci-linux-2` | `arc-ci-linux`  | success   |
| 29706622340 / 1 | ci-ok                                    | 22:46:00 / 22:46:02 / 22:46:04      | 2/2     | `arc-ci-linux-1` | `arc-ci-linux`  | success   |
| 29706622340 / 1 | merge-ok                                 | 22:46:05 / 22:46:06 / 22:46:09      | 1/3     | `arc-ci-linux-1` | `arc-ci-linux`  | success   |

#### Cost and retention baseline

- **Actions usage baseline (2026-07-19 23:02Z):** the user billing API's July aggregate for this repository reports
  3,327.667 Linux minutes ($19.966 gross / $9.208 net), 256 Windows minutes ($2.560 / $0.780), and 128 macOS
  three-core minutes ($7.936 / $2.506). This is an aggregate checkpoint, not per-run attribution; the ledger above
  separately identifies the planned hosted fallback and hosted-heavy rebuild run.
- **Provider baseline:** OVHcloud US VPS-2 2027 remains $10 per month; no paid backup, snapshot, resize, or additional
  runner allocation was added.
- **Telemetry/log baseline:** fresh `sysstat` data was collected at 23:00Z on a five-minute cadence with 60-day
  history, seven-day compression, and mode `0640`; one exact May pre-allocation image sample was removed so it cannot
  contaminate the canary. Persistent runner journals remain bounded to 60 days / 1 GB (24 MB at baseline), and the
  protected pre-rebuild journal/telemetry export bridges the intentionally destroyed first host instance.

- **Canary window / qualifying sample count:** opened 2026-07-19 21:49:27Z; 2/20 qualifying heavy PR runs; elapsed
  floor 0/7 days; earliest possible close 2026-07-26 21:49:27Z if the run floor is also met
- **`merge-ok` p95:** provisional 4m01s at N=2 (nearest-rank position 2); not an acceptance result before both floors
- **Runner-caused flakes:** 0 provisional; the cancelled fallback attempt is planned recovery evidence, not a flake
- **Unexplained offline stalls:** 0 provisional
- **Telemetry/log coverage through decision:** current with 60-day projected retention; recheck during collection
- **Self-hosted and fallback Actions cost evidence:** aggregate baseline recorded above; final delta pending
- **Provider cost evidence:** $10 monthly baseline recorded; final billed cross-check pending

### Final posture

- **Decision / timestamp:** [pending]
- **Accepted route:** [pending]
- **Measured rationale:** [pending]
- **Open exception or follow-up:** [pending]
