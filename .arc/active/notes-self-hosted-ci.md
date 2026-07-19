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
- **Supported OS / architecture:** Ubuntu 24.04 LTS / x86-64
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

- **Audit timestamp:** [pending]
- **Collaborators:** [pending — count / trusted result / exception only]
- **Pending invitations:** [pending — count / trusted result / exception only]
- **Private forks:** [pending — count / trusted result / exception only]
- **Installed apps and bots:** [pending — count / trusted result / exception only]
- **Pull-request-producing automation:** [pending — count / trusted result / exception only]
- **Actions fork settings:** [pending — result / exception only]
- **Gate result:** [pending]

### Host and runner readiness

- **Provisioning window:** [pending]
- **Sanitized allocation reference:** [optional]
- **OS updates / unattended updates / reboot:** [pending]
- **Inbound / outbound posture:** [pending]
- **Runner service user and directory isolation:** [pending]
- **Tool versions (`git`, `gh`, `jq`, `shellcheck`, shell/coreutils):** [pending]
- **Telemetry cadence / retention / cap / protected export:** [pending]
- **Persistent service/restart log retention / cap:** [pending]
- **Runner application version / checksum result:** [pending]
- **Runner 1 sanitized status / labels / service health:** [pending]
- **Runner 2 sanitized status / labels / service health:** [pending]
- **Disk headroom / projected retention:** [pending]
- **Pre-cutover go/no-go:** [pending]

### Qualification and drills

- **Initial self-hosted qualification run id / timestamp:** [pending]
- **Linux job placement result:** [pending]
- **Hosted-only job isolation result:** [pending]
- **Verified-tree proof run ids / classifier result:** [pending]
- **Hosted fallback run id / elapsed time / result:** [pending]
- **Rebuild window / elapsed time / result:** [pending]
- **Post-rebuild qualification run id / result:** [pending]

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
