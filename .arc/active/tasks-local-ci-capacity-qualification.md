# Task List: local-ci-capacity-qualification

- **Design:** `spec-local-ci-capacity-qualification.md`

---

## **Phase 1:** Provision the mini and the guest

_Purpose:_ Stand up the isolated arm64 guest on the Mac mini from a checked-in recipe, make it reachable from the
workstation so the remaining phases run from an agent session, and open the measurement ledger. Nothing in this
phase registers a runner or changes CI routing.

_Design decisions:_ The operator performs the console-only steps first, from the mini's admin account; every later
task runs over key-only SSH as the CI user. The recipe, launch agent, and helpers live under `scripts/local-ci/`
from this phase on because the trial cannot be operated without them; the no-go closeout removes them. Ledger
entries record only sanitized values — never a host endpoint, username, token, or key.

### `[x]` **1.1 Open the measurement ledger**

- _Goal:_ Every later phase has a prepared home for its evidence, so results land as they are produced rather than
  being reconstructed at closeout.

- _Outcome:_ `## Measurement ledger` opens `notes-local-ci-capacity-qualification.md`, ahead of the reference
  material, with the seven subsections and the sanitization rule stated once at the top. Each table and bullet
  carries the exact signals its task collects, so a later phase fills cells rather than deciding what to record; an
  em dash marks a value not yet taken.

### `[ ]` **1.2 Prepare the CI user and the unattended-restart path**

- _Goal:_ The mini boots without operator action into a non-admin CI user that can run Lima and accepts key-only
  SSH from the workstation, while the primary user's account and files stay unreachable.

- _Approach:_ Operator-run at the mini console from the admin account. The agent supplies each step and records the
  reported result in the ledger.

    - `[ ]` **1.2.a Confirm the host prerequisites**
        - Record macOS version (13 or later is required for the Virtualization backend), free disk (the image
          budget is 60 GB against roughly 108 GB free), and FileVault state before any change.

    - `[ ]` **1.2.b Create the CI user**
        - A Standard (non-admin) account with no iCloud sign-in, no SSH keys, no GitHub CLI login, and no access
          to the admin user's home. Its name is an operator-held input and stays out of tracked files.

    - `[ ]` **1.2.c Turn FileVault off and wait for decryption to finish**
        - `fdesetup status` must report `FileVault is Off.` before continuing; a locked disk at boot defeats
          auto-login and launchd.

    - `[ ]` **1.2.d Set automatic login to the CI user and keep the machine awake**
        - Automatic login in Users & Groups (macOS refuses to enable it while FileVault is on, which is why the
          previous step precedes this one); in Energy settings prevent sleep and enable wake for network access.
          The console session belonging to the CI user is the accepted posture.

    - `[ ]` **1.2.e Enable Remote Login for the CI user only**
        - Sharing → Remote Login, access restricted to the CI user. Install the workstation's public key in that
          user's `~/.ssh/authorized_keys`, then prove a key-only session from the workstation before closing the
          console. Map the host and key in WSL's `~/.ssh/config` on the workstation (the agent session runs
          there), never in repository files.

    - `[ ]` **1.2.f Install Homebrew and Lima from the admin account**
        - `brew install lima` (Homebrew's prefix needs an admin to install; the CI user only runs `limactl`).
          Confirm `limactl --version` succeeds in an SSH session as the CI user.

### `[ ]` **1.3 Author the Lima recipe and the launch agent**

- _Goal:_ A fresh instance boots from the recipe alone, with no host mounts, no guest port forwards, and every
  runner prerequisite installed by the recipe's provisioning, and a macOS restart brings it back with no operator
  action.

- _Approach:_ Agent-authored under `scripts/local-ci/`; the operator installs the launch agent once over SSH.

    - `[ ]` **1.3.a Write `scripts/local-ci/arc-ci.yaml`**
        - `vmType: vz`, `arch: aarch64`, `cpus: 8`, `memory: 8GiB`, `disk: 60GiB`, `mounts: []`, and a
          `portForwards` rule ignoring the full guest port range. Lima's own SSH control channel on the mini's
          localhost is the one accepted listener.
        - Image: the Ubuntu 26.04 LTS arm64 server cloud image, matching the fleet's approved baseline, pinned
          by URL and digest.
        - System-mode provisioning: `git`, `gh`, `jq`, `shellcheck`, `curl`, `tar`, `sysstat`, `time` (absent
          from cloud images; Task 2.2 measures with it), the `arc-runner` account, and mode `0750` application
          directories `/opt/actions-runner-1` and `/opt/actions-runner-2` (a third is created only by Task 3.3).
          Persistent, size-bounded journald mirrors the VPS host settings.

    - `[ ]` **1.3.b Write the launch agent `scripts/local-ci/com.arc.local-ci.plist`**
        - `RunAtLoad` with `ProgramArguments` invoking `/opt/homebrew/bin/limactl start arc-ci`, stdout and stderr
          to files under the CI user's `~/Library/Logs/`. Installed with `launchctl bootstrap gui/$UID` from the
          CI user's session; the `start.sh` helper carries the install step.

    - `[ ]` **1.3.c First boot and isolation check**
        - `limactl start scripts/local-ci/arc-ci.yaml` as the CI user, then inside the guest confirm `nproc`,
          `free -g`, `df -h /`, `swapon --show` (Lima guests carry no swap by default; the ledger states the swap
          posture once here), and the absence of any mount from the host. On the mini confirm no new listener
          beyond Lima's localhost SSH port with `netstat -anv -p tcp | grep LISTEN` (the CI user has no sudo, so
          `lsof` is unavailable). Record the readings in the ledger.

### `[ ]` **1.4 Add the start, status, and rebuild helpers**

- _Goal:_ The operator runs the VM with three commands, each covered by `lint:sh`, and a rebuild is proven to be a
  fresh instance from the recipe.

    - `[ ]` **1.4.a Write `start.sh`, `status.sh`, and `rebuild.sh` under `scripts/local-ci/`**
        - `start.sh` starts the instance and installs the launch agent when absent. `status.sh` prints
          `limactl list`, guest uptime and memory, and the runner service states from
          `systemctl list-units 'actions.runner.*'` inside the guest. `rebuild.sh` stops and deletes the
          instance and creates it again from the recipe; it requires an explicit confirmation flag and refuses even
          then while `pgrep -f Runner.Worker` finds a job in progress inside the guest.

    - `[ ]` **1.4.b Extend the `lint:sh` glob**
        - Add `../../scripts/local-ci/*.sh` to the `lint:sh` script in `packages/arc-framework/package.json` and
          run `npm run lint:sh` green.

    - `[ ]` **1.4.c Prove the helpers**
        - Run `status.sh` and `rebuild.sh` once from the workstation over SSH; record one `status` output and the
          rebuild completion timestamp in the ledger.

## **Phase 2:** Anchor gate

_Purpose:_ Test the transplanted speed estimate inside the guest before any runner registration or CI change exists
(the spec's phase 1; the spec's phases 2 to 4 are Phases 3 and 4 here, with its conditional phase 3 as Task 3.3). A
median at
or below 120 s continues the trial; anything above it, or any OOM or swap growth, closes the work unit as no-go: the
recommendation and no-go closeout in Phase 4 still run, and every other later task is marked superseded.

### `[ ]` **2.1 Stage the repository and build `dist` inside the guest**

- _Goal:_ The guest holds a disposable checkout of current `main` with `dist` built, using an arm64 Node 24 installed
  in the guest, without any credential entering the guest.

    - Transfer a `git archive` of `main` from the workstation over the SSH path and `limactl copy` into the guest;
      no clone credential is needed and none is created.
    - Install Node 24 for arm64 in the guest (this phase only; runner jobs use `actions/setup-node`), then
      `npm ci` and `npm run build -w packages/arc-framework`.

### `[ ]` **2.2 Run the warmups and the measured repetitions**

- _Goal:_ At least ten clean measurements of the anchor under the workflow's exact invocation, with memory and swap
  sampled across each run.

    - Invocation, from the checkout root inside the guest:
      `VITEST_MAX_WORKERS=1 ARC_E2E_SKIP_BUILD=1 npm run test:e2e -w packages/arc-framework --
      __tests__/e2e/command-input-no-input.e2e.test.ts --passWithNoTests=false`
    - Two or three warmups discarded, then at least ten measured runs. Wall time from `/usr/bin/time -f %e`; a
      background sampler records `free -m` every 5 s so peak used memory and swap used are per-run values; after
      the series, `journalctl -k` is checked for OOM events. In a swapless guest memory pressure surfaces as OOM
      rather than swap growth, so that check is the one that carries the gate's memory condition.
    - Record every run in the ledger with median and p95.

### `[ ]` **2.3 Decide the gate**

- _Goal:_ The trial continues only on evidence, and a no-go is recorded as a complete outcome rather than a stall.

    - Continue when the median is at or below 120 s with no OOM and no swap growth across the series.
    - Otherwise record the no-go in the ledger, mark every task in Phase 3 and Tasks 4.1, 4.2, and 4.4 `[~]` with
      a one-line note naming this gate, then complete Tasks 4.3 and 4.5. The workstation fallback design is not
      entered by this work unit.

## **Phase 3:** Services and the routed workflow

_Purpose:_ Register two runner services under the distinct label, prove they run concurrently within budget, admit
a third only on measured headroom, then prove one full workflow routed to the mini.

_Design decisions:_ The cache-key change (every `node_modules` cache step on `main` keyed on `runner.arch`) is an
external precondition landing on `main` by errand; Task 3.4 verifies it is merged and does not absorb it. The
registration precondition is restated for distinct-label runners: the mini's services register while the existing
route (hosted, or `arc-ci-linux` once hosted minutes run out) stays live, and the check is that the routing variable
does not already read the label being registered.

### `[ ]` **3.1 Register two runner services in the guest**

- _Goal:_ Two services carry `arc-ci-mini`, `self-hosted`, `Linux`, and `ARM64`, neither carries `arc-ci-linux`, and
  both return online after a guest reboot with no operator action.

- **Additional Context:** `.github/self-hosted-ci.md` § Runner registration

    - Repeat the executable-principal audit; an untrusted principal stops registration.
    - Confirm `ARC_CI_LINUX_RUNNER` does not read `arc-ci-mini`, and the two runner names are absent.
    - Download the current arm64 Linux `actions/runner` release once as `arc-runner`, verify its SHA-256, extract
      into both application directories, run `bin/installdependencies.sh`, and restore mode `0750`.
    - Configure each with `--name <unique-name> --labels arc-ci-mini --unattended` using a short-lived registration
      token requested at the moment of use; install and start each as a service; add the `Restart=always` drop-in.
      Use a name scheme visibly distinct from the VPS pool's `arc-ci-linux-N` (for example `arc-ci-mini-N`) so a
      job's `runner_name` in the ledger identifies the host at a glance.
    - Reboot the guest once and record both runners online and idle with their labels, read from
      `gh api repos/{owner}/{repo}/actions/runners`, as sanitized runner state.

### `[ ]` **3.2 Concurrent-anchor check for two services**

- _Goal:_ Two anchors running at once each finish within 1.25x the Phase 2 median with the guest below 7 GB at peak
  and no OOM, and the peak free memory is recorded for the third-service decision.

    - Launch two anchor runs simultaneously from two guest shells using the Task 2.2 invocation and sampler; the
      runner services stay idle during this check.
    - Record both wall times, the ratio to the Phase 2 median, peak guest memory, peak free memory, and the OOM
      check.

### `[ ]` **3.3 Admit a third service on measured headroom**

- _Goal:_ A third service exists only when the two-service check left at least 2.5 GB of guest memory free at peak,
  and it passes the same concurrent check with three runs.

- _Note:_ When the headroom condition fails, mark this task `[~]` with a note recording the measured peak free
  memory, so the task cursor passes over it and the verification walk sees a deliberate skip rather than open work.

    - Create `/opt/actions-runner-3`, register the third service as in Task 3.1, then run three simultaneous anchors
      against the Task 3.2 thresholds and record the results.

### `[ ]` **3.4 Dispatch one full workflow routed to the mini**

- _Goal:_ Every executed Linux job of one dispatched full workflow reports a guest runner name and a green result,
  with routing returned to its prior state afterwards.

    - Precondition: `git fetch origin main` and confirm all six `actions/cache` keys in `.github/workflows/ci.yml`
      on `origin/main` include `runner.arch`. Stop if the errand has not merged.
    - Record the variable's prior state first (`gh variable list`; it is absent while hosted minutes remain and
      reads `arc-ci-linux` once they run out). In a quiet window from the workstation:
      `gh variable set ARC_CI_LINUX_RUNNER --body arc-ci-mini`, then
      `gh workflow run ci.yml --ref main` (a dispatch classifies as heavy; `ci_ok` and `merge-ok` are pull-request
      only and skip). All repository CI rides the mini for the window, so keep it short.
    - After completion, list jobs with `gh api repos/{owner}/{repo}/actions/runs/<id>/jobs` and record each Linux
      job's `runner_name` and `conclusion` plus the run duration; then restore the variable to its recorded prior
      state (`gh variable delete` when it was absent) and cancel any job still queued for `arc-ci-mini`.

## **Phase 4:** Soak and decision

_Purpose:_ Compare the mini against the VPS pool head-for-head on the unchanged four-shard topology, prove the
unattended-restart path, decide go or no-go, and ship the outcome.

_Design decisions:_ Each pair is dispatched serially with a routing flip between the two runs because the workflow's
concurrency group cancels overlapping runs of one ref. Wall time is the Actions run duration from creation to
completion, so both sides exclude the pull-request-only roll-ups. The go verdict is the operator's decision on the
recorded evidence; Tasks 4.4 and 4.5 are mutually exclusive, and the one not entered is marked `[~]` with a note
naming the verdict so the cursor and the verification walk treat it as a deliberate skip.

### `[ ]` **4.1 Run the paired soak**

- _Goal:_ Three to five representative heavy heads each have one full run on `arc-ci-mini` and one on `arc-ci-linux`,
  with both durations and run ids in the ledger and the median ratio computed.

    - Record the variable's prior state as in Task 3.4. Select the heads as live refs on origin, since
      `gh workflow run --ref` accepts a branch or tag and never a commit: `main`, this work unit's branch, and
      other open branch heads. For each: set `arc-ci-mini`, dispatch, wait for completion, set `arc-ci-linux`
      explicitly (the VPS pool is the route the mini would replace, whether or not it is live that day), dispatch,
      wait. Restore the prior state after the last pair.
    - Duration is `createdAt` to `updatedAt` from `gh run view <id> --json createdAt,updatedAt`; the runs API has
      no completion timestamp, and `updatedAt` lands within seconds of it, so the ledger states that proxy once.
      Record each run's `node_modules` cache hit or miss from its cache step: the key includes the architecture,
      so the mini's first run per lockfile hash pays a cold `npm ci` the VPS side does not. Record any
      runner-caused failure separately; it disqualifies go regardless of the ratio.
    - Compute both medians and the mini-to-VPS ratio; the go threshold is at or below 0.70.

### `[ ]` **4.2 Restart test**

- _Goal:_ After one deliberate macOS restart the VM and every registered runner are back online with no operator
  action, recorded with timestamps.

- _Approach:_ The operator issues the restart (Apple menu or the admin account) only while routing is off the mini,
  so no job lands during the reboot; everything after is observed from the workstation.

    - Record the restart timestamp, the time SSH to the CI user returns, the time `limactl list` reports the
      instance running, and the time each runner shows online in GitHub.

### `[ ]` **4.3 Write the go/no-go recommendation**

- _Goal:_ The ledger closes with a criteria table and a written verdict the operator confirms before any routing
  change.

    - Criteria: anchor median, concurrent checks, routed dispatch, soak ratio, runner-caused failures, restart
      recovery. State the verdict and the evidence each criterion rests on.

### `[ ]` **4.4 Ship the go outcome**

- _Goal:_ The repository routes Linux CI to the mini with the VPS pool left registered as fallback, and the
  operating documents describe the new runner.

    - `.github/self-hosted-ci.md`: an arm64 local-runner section covering the arm64 download and `arc-ci-mini`
      label variant, the Lima recipe and helpers under `scripts/local-ci/`, the distinct-label registration
      precondition, the fallback cancel step extended to `arc-ci-mini`, the manual flip for maintenance windows,
      and the note that macOS updates restart the VM through auto-login and launchd.
    - `.arc/reference/TECHNICAL-OVERVIEW.md` § 3 Infrastructure: record the runner fleet — the VPS pair under
      `arc-ci-linux` and the mini under `arc-ci-mini` — and the routing variable.
    - From the workstation: `gh variable set ARC_CI_LINUX_RUNNER --body arc-ci-mini`; confirm the next run's Linux
      jobs land on guest runners.
    - `npm run -s lint:md` and `npm run lint:sh` green.

### `[ ]` **4.5 Ship the no-go outcome**

- _Goal:_ The ledger and recommendation are checked in with routing unchanged and no operating artifacts left in
  the repository.

    - Remove `scripts/local-ci/` and the `lint:sh` glob extension in one commit; deregister any runner services
      registered in Phase 3 and stop the Lima instance. `ARC_CI_LINUX_RUNNER` keeps its prior state (absent, or
      `arc-ci-linux` once hosted minutes run out).

## **Phase 5:** Verification

### `[ ]` **5.1 Complete verification** — load and follow `verify-work-unit.md`

---

## Success Criteria

- `[ ]` The ledger records at least ten measured anchor repetitions with median, p95, and guest memory and swap per
  run, and the median is at or below 120 s, or the work unit closes as no-go with that ledger.
- `[ ]` Two registered services carry `arc-ci-mini`, `self-hosted`, `Linux`, and `ARM64`, and none carries
  `arc-ci-linux`.
- `[ ]` The concurrent-anchor check for two services (and three, if entered) is recorded with wall time against the
  Phase 2 median and peak guest memory.
- `[ ]` All six `node_modules` cache steps on `main` key on the runner architecture, and one dispatched full workflow
  on `arc-ci-mini` shows every executed Linux job on a guest runner name with a green result.
- `[ ]` The soak ledger holds three to five paired runs with end-to-end wall time on both routes, and the mini's
  median is at or below 70 percent of the VPS median, or the work unit closes as no-go with that ledger.
- `[ ]` The VM survived one deliberate macOS restart with all runners back online with no operator action, recorded
  with timestamps.
- `[ ]` On go: `ARC_CI_LINUX_RUNNER` reads `arc-ci-mini`; the helpers under `scripts/local-ci/` are checked in,
  covered by `lint:sh`, and the ledger records one `status` output and one `rebuild` completion timestamp from
  them; and `.github/self-hosted-ci.md` plus `TECHNICAL-OVERVIEW.md` § 3 describe the mini runner and the
  existing fleet.
- `[ ]` On either outcome: the measurement ledger and a written go/no-go recommendation are checked in.
- `[ ]` All quality gates pass (markdown lint, shell lint, ARC contract checks)
- `[ ]` Ready for integration
