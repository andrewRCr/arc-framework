# Self-hosted Linux CI operations

This runbook operates the repository's disposable Linux GitHub Actions capacity. The normal target is one
user-owned x86-64 VPS running two persistent runner services. GitHub-hosted execution remains the recovery path.

## Operating contract

- Use the approved current Ubuntu LTS on x86-64 while it remains supported by the GitHub Actions runner; the
  acquired baseline is Ubuntu 26.04 LTS. Re-check the runner support page before acquiring or rebuilding a host;
  an OS change requires a fresh qualification.
- Start with approximately 4 shared vCPU, 8 GB RAM, SSD storage, adequate outbound transfer, and a recurring price
  no higher than USD 15 per month. Buy no premium backup and create no manual snapshot. A bundled rolling backup
  retained for at most 24 hours is accepted residual exposure, never a recovery dependency: rebuild, do not restore.
- Permit inbound administrative SSH only. The runner needs outbound HTTPS to GitHub and package registries; it
  receives no private-network route and hosts no unrelated service.
- Install `git`, `gh`, `jq`, `shellcheck`, a POSIX shell, coreutils, and the dependencies reported by the current
  runner package. Workflow Node versions continue to come from `actions/setup-node`.
- Run exactly two services as the unprivileged `arc-runner` account, from separate application directories, with
  unique names and the custom repository label `arc-ci-linux`. Keep the default `self-hosted`, `Linux`, and `X64`
  labels.
- Never store a development checkout, personal notes, PAT, deploy key, provider credential, private key, payment
  detail, or unrelated workload on the host. Runner identity, transient source, job tokens, and build outputs are
  sensitive but disposable.

Provider account access, MFA, billing, administrative coordinates, SSH configuration, runner names, and
registration/removal tokens are user-held inputs. Do not paste them into tracked files, tickets, shell history, or
service logs. Record only provider/SKU/region/price, a non-sensitive allocation reference when useful, timestamps,
category counts, checklist results, exceptions, sanitized runner state, workflow run ids, and measurements.

## Host provisioning

Perform these steps through the user's local SSH configuration. Substitute transient values locally; do not save
the host endpoint, administrator identity, SSH mapping, or fingerprint in repository files.

1. Create an allocation in the approved region and SKU using the approved current Ubuntu LTS on x86-64. Select no
   premium backup or manual snapshot option; document any non-disableable rolling backup under the operating
   contract. Add the intended SSH public key through the provider when that option is available. When a provider
   firewall is available, restrict it to administrative SSH inbound plus established traffic; the host firewall
   remains mandatory. Permit outbound HTTPS and DNS.
2. Connect as the provider's administrative account, verify the expected host key through a user-held channel, and
   update the operating system. If a rebuild cannot inject the existing public key, use the provider-delivered
   temporary password once to install that key, prove a second key-authenticated session, and do not retain the
   password:

   ```sh
   sudo apt-get update
   sudo DEBIAN_FRONTEND=noninteractive apt-get -y full-upgrade
   sudo apt-get -y install unattended-upgrades ufw ca-certificates curl git gh jq shellcheck coreutils sysstat
   sudo systemctl enable --now apt-daily.timer apt-daily-upgrade.timer unattended-upgrades.service
   ```

   Set `Unattended-Upgrade::Automatic-Reboot "false";` in a dedicated file under `/etc/apt/apt.conf.d/` so reboots
   remain controlled maintenance actions.

3. Preserve the active SSH path before enabling the host firewall. Adjust the source restriction to the operator's
   stable administrative range when available; otherwise rely on key-only SSH plus the provider firewall:

   ```sh
   sudo ufw default deny incoming
   sudo ufw default allow outgoing
   sudo ufw allow OpenSSH
   sudo ufw enable
   sudo ufw status verbose
   ```

   Disable password and root SSH login after confirming a second key-authenticated session succeeds. On Ubuntu
   cloud images, place the settings in an early drop-in such as `/etc/ssh/sshd_config.d/00-arc-ci.conf`: OpenSSH
   uses the first value it encounters, so a later filename does not override `50-cloud-init.conf`. Validate with
   `sshd -t` and `sshd -T`, reload SSH, and prove a new key-only connection before closing the original session.
   Leave unattended-upgrade reboots disabled; schedule a controlled reboot when `/var/run/reboot-required` exists,
   and never reboot while a job is running.
4. Create the service identity and its two application directories:

   ```sh
   sudo adduser --disabled-password --gecos '' arc-runner
   sudo gpasswd -d arc-runner users || true
   sudo install -d -m 0750 -o arc-runner -g arc-runner /opt/actions-runner-1 /opt/actions-runner-2
   ```

5. Keep service and restart logs persistent and size-bounded. Create `/etc/systemd/journald.conf.d/arc-runner.conf`
   with the following values, then restart journald:

   ```ini
   [Journal]
   Storage=persistent
   SystemMaxUse=1G
   MaxRetentionSec=60day
   Compress=yes
   ```

6. Enable `sysstat` collection, using a five-minute cadence and at least 60 days of retention so the record spans
   the canary sample floor and operating-posture decision. Confirm `/etc/default/sysstat` has `ENABLED="true"`,
   set `HISTORY=60`, `COMPRESSAFTER=7`, and `UMASK=0027` in `/etc/sysstat/sysstat`, then enable the timers:

   ```sh
   sudo systemctl enable --now sysstat-collect.timer sysstat-summary.timer
   systemctl list-timers 'sysstat-*'
   sudo sar -u 1 3
   sudo sar -r 1 3
   sudo sar -q 1 3
   df -h
   ```

   If the distribution timer is not five minutes, override `sysstat-collect.timer` with `OnCalendar=*:00/5` and
   run `sudo systemctl daemon-reload && sudo systemctl restart sysstat-collect.timer`.
7. From the public official `actions/runner` release page, copy the current x64 Linux download URL and SHA-256
   value. As `arc-runner`, download the package once, verify its checksum before extraction, and extract the same
   verified release into each directory. Run `bin/installdependencies.sh` with administrative privileges, restore
   each application directory to mode `0750`, and remove the `arc-runner`-owned archive with administrative
   privileges when it resides in a sticky temporary directory. Stop here: do not open the repository's new-runner
   token flow, run `config.sh`, install a service, or assign `arc-ci-linux` yet.
8. Verify the service user's tool and host baseline:

   ```sh
   sudo -u arc-runner -H sh -c 'cd /opt/actions-runner-1 && for tool in git gh jq shellcheck sh curl tar; do command -v "$tool"; done'
   sudo -u arc-runner -H sh -c 'cd /opt/actions-runner-1 && git --version; gh --version; jq --version; shellcheck --version'
   systemctl is-enabled unattended-upgrades.service
   systemctl is-active sysstat-collect.timer sysstat-summary.timer
   journalctl --disk-usage
   ```

Before log rotation or destruction, export the needed journal and `sysstat` slices to a protected user-held
location. Only sanitized summaries enter tracked evidence. Never back up the machine image or runner credentials.

## Runner registration

Registration is fail-closed. First audit repository collaborators, pending invitations, private forks, installed
apps/bots, pull-request-producing automation, and Actions fork settings. Every principal able to submit executable
`pull_request` code must be explicitly trusted. An unknown or untrusted principal stops registration, label
assignment, and cutover.

After the audit passes:

1. Confirm the repository variable `ARC_CI_LINUX_RUNNER` is absent, empty, or `ubuntu-latest`, and confirm no new
   runner is registered.
2. Create unique runner names as transient operator inputs. Request a short-lived repository registration token
   only when ready to consume it. Do not echo, save, or reuse the token.
3. In each application directory, as `arc-runner`, run the current configuration command shown by GitHub, adding
   `--name <unique-name> --labels arc-ci-linux --unattended`. Do not pass `--no-default-labels`.
4. Install and start each service as root because the mode-`0750` application directories intentionally exclude
   the administrative account:

   ```sh
   sudo sh -c 'cd /opt/actions-runner-1 && ./svc.sh install arc-runner && ./svc.sh start && ./svc.sh status'
   sudo sh -c 'cd /opt/actions-runner-2 && ./svc.sh install arc-runner && ./svc.sh start && ./svc.sh status'
   ```

5. Leave automatic runner updates enabled. The generated unit may have `Restart=no`; create a systemd drop-in for
   each unit with `Restart=always` and `RestartSec=5s`, then reload systemd and restart both services. Confirm both
   units are enabled and active. Reboot once before cutover, then confirm both runners return online and idle without
   operator action.

## Cutover and health checks

Do not select the self-hosted route until all checks below pass:

- The access-control audit is current and explicitly green.
- Both unique runners are online and idle with `self-hosted`, `Linux`, `X64`, and `arc-ci-linux` labels.
- Both services survive a controlled restart and reboot; each uses its own application and `_work` directory.
- Required tools resolve for `arc-runner`; disk headroom is sufficient; unattended updates and automatic runner
  updates are enabled.
- `sysstat` samples and persistent journal entries are current, size-bounded, and projected to survive through the
  canary floor and posture decision.
- The hosted-only Windows/macOS, documentation, and review-controller workflows remain outside this trust domain.

Set the repository variable from a trusted local workstation, not from the runner host:

```sh
gh variable set ARC_CI_LINUX_RUNNER --body arc-ci-linux
```

Trigger a qualification run and inspect each Linux job's runner name and labels. Stop and return to hosted routing
for any missing tool, unexpected label, offline slot, queue stall, runner-caused failure, or evidence gap. A manual
`workflow_dispatch` forces the full heavy suite but skips the PR-only `ci-ok` and `merge-ok` jobs; use it only when
those roll-ups already pass for the exact head through the pull-request event, and record both run ids.

## Hosted fallback

From a trusted local workstation, set the explicit hosted route (or delete the variable to use the workflow's
empty-value fallback):

```sh
gh variable set ARC_CI_LINUX_RUNNER --body ubuntu-latest
```

Cancel every queued workflow attempt targeting `arc-ci-linux` and every in-progress attempt already executing on a
self-hosted runner. Confirm the Actions job list contains no queued or running job with the `arc-ci-linux` label
before rerunning; changing the variable does not migrate work that was already assigned.

Confirm the new run's Linux jobs report GitHub-hosted runner names before treating fallback as complete. Fallback
precedes runner maintenance, rebuild, incident response, decommissioning, and any public-repository transition.

For suspected compromise or unexplained residue: select hosted, remove both runners in GitHub, review or revoke
affected GitHub/provider credentials, preserve only the minimum protected diagnostic export, destroy the VPS, and
rebuild. Do not attempt an in-place forensic repair.

## Maintenance

Monthly, and after any repository-access change:

- repeat the executable-principal audit;
- confirm both runners are online, idle when unused, current, and restarting correctly;
- review unattended-update and runner-update logs and schedule any required reboot;
- inspect disk, journal, `sysstat`, workspace, and runner diagnostic retention;
- remove obsolete `_work` content and old `_diag` archives only while both services are stopped;
- confirm the hosted fallback command and protected export path remain usable.

Never clean an active workspace or rotate away evidence needed for the current canary or posture decision.

## Rebuild

1. Select and verify hosted fallback.
2. Stop and deregister both runner services, then destroy the allocation after explicit approval.
3. Provision a fresh host from **Host provisioning** without restoring a provider backup. Reuse no machine image,
   runner application directory, runner credential, workspace, or service state.
4. Re-run the access-control audit. Register only after it passes.
5. Repeat every health check and a heavy qualification run before restoring `arc-ci-linux`.

Measure rebuild time from the first provisioning action through both runners becoming qualification-ready. A
rebuild exceeding two hours, or requiring undocumented state, fails the disposability contract.

## Deregistration

1. Select `ubuntu-latest` and verify a hosted run.
2. Stop and uninstall both services with `sudo ./svc.sh uninstall`. Request short-lived removal tokens at the point
   of use, then run the current `config.sh remove` command in each directory. The runner refuses registration
   removal while its service remains installed; enter each mode-`0750` directory from inside the privileged shell.
3. Confirm the repository runner list contains neither runner and no queued job targets `arc-ci-linux`.
4. Export only the required protected logs/measurements, then destroy the VPS and any attached storage or snapshot.
5. Confirm billing has stopped and record the sanitized completion result.

Before making the repository public or admitting untrusted pull-request authors, complete Steps 1–4 first. A
public transition never shares a live persistent runner with untrusted `pull_request` code.
