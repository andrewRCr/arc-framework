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

### `[x]` **1.2 Prepare the CI user and the unattended-restart path**

- _Goal:_ The mini boots without operator action into a non-admin CI user that can run Lima and accepts key-only
  SSH from the workstation, while the primary user's account and files stay unreachable.

    - `[x]` **1.2.a Confirm the host prerequisites**
        - macOS 15.6.1 (build 24G90), 93 GiB free of 228 GiB, and FileVault already off. Free disk is below the
          plan's rough estimate but well clear of the 60 GB image budget. Recorded in the ledger.

    - `[x]` **1.2.b Create the CI user**
        - Standard account created, first login completed with iCloud, Siri, and analytics declined. Home
          directories defaulted to `drwxr-x---` group `staff`, a group every ordinary account joins, so the CI
          user could read the admin home until it was tightened to `700`. Mounted external volumes defaulted to
          ignore-ownership, discarding their on-disk modes; ownership was enabled and each root set to `700`.
          Both cross-account reads are now refused.

    - `[x]` **1.2.c Turn FileVault off and wait for decryption to finish**
        - `fdesetup status` reported `FileVault is Off.` before any change, so no decryption wait applied and the
          automatic-login option was already available.

    - `[x]` **1.2.d Set automatic login to the CI user and keep the machine awake**
        - Automatic login set to the CI user; automatic sleep disabled and wake for network access enabled.
          Automatic restart after a power failure was enabled as well, since the goal is a host that returns
          without operator action and a power interruption is the restart nobody attends.

    - `[x]` **1.2.e Enable Remote Login for the CI user only**
        - Remote Login restricted to the CI user, with full disk access for remote users left off. A dedicated
          key proves a passwordless session from WSL; password and keyboard-interactive authentication are then
          disabled through an `sshd_config.d` drop-in and the key path re-proven against the restarted listener.
          The host and account reach the agent session only as a `~/.ssh/config` alias. The mini was moved to
          wired Ethernet on a fixed address, which also removes Wi-Fi variance from the Phase 4 timings.

    - `[x]` **1.2.f Install Homebrew and Lima from the admin account**
        - Homebrew and Lima installed from the admin account; `limactl 2.2.0` runs over SSH as the CI user by
          absolute path, since the Homebrew prefix is not on that account's `PATH`. Later phases and the launch
          agent use the same absolute form.

- _Outcome:_ The mini now boots unattended into a non-admin account reachable only by key, with the admin account
  and the external volumes closed to it. Two of those closures were not in the plan: macOS's default home and
  external-volume permissions both read as restrictive while granting access through group membership and
  ignore-ownership respectively, so the mode bits alone would have certified an isolation the host did not have.

### `[x]` **1.3 Author the Lima recipe and the launch agent**

- _Goal:_ A fresh instance boots from the recipe alone, with no host mounts, no guest port forwards, and every
  runner prerequisite installed by the recipe's provisioning, and a macOS restart brings it back with no operator
  action.

    - `[x]` **1.3.a Write `scripts/local-ci/arc-ci.yaml`**
        - `vmType: vz`, `arch: aarch64`, 8 vCPU, 8 GiB, 60 GiB disk, `mounts: []`, and a `portForwards` rule
          ignoring the full guest port range. The image is the Ubuntu 26.04 LTS arm64 server cloud image pinned to
          a dated release directory and its SHA-256, rather than the moving `release` pointer.
        - System-mode provisioning installs the tool set, creates the `arc-runner` account and the mode `0750`
          application directories, and writes the persistent size-bounded journald configuration. The bundled
          container runtime is disabled: jobs bring their own toolchains, so it is only weight against the disk
          budget and the rebuild time Task 1.4.c measures. `sysstat` is enabled with 60-day retention, since
          Ubuntu ships it installed but collecting nothing.

    - `[x]` **1.3.b Write the launch agent `scripts/local-ci/com.arc.local-ci.plist`**
        - `RunAtLoad` invoking `limactl start arc-ci` by absolute path, with stdout and stderr under the CI user's
          `~/Library/Logs/`, and an explicit `PATH` because launchd supplies one that excludes the Homebrew prefix.
          The file is a template carrying a `__CI_HOME__` placeholder: launchd performs no variable expansion and
          requires absolute log paths, so a literal agent would have to commit the account's home directory to a
          tracked file. `start.sh` renders it at install time.

    - `[x]` **1.3.c First boot and isolation check**
        - The instance built from the recipe in about three minutes and reports 8 vCPU, 7 GiB usable, 55 G free,
          no swap device, and no host mount. Outbound HTTPS and DNS work; nothing inbound reaches it.
        - The listener check was run as a before/after difference across a guest stop and start rather than the
          single snapshot the plan assumed. The host runs a full desktop session whose widgets and Continuity
          services cycle wildcard UDP sockets continuously, so an unbaselined reading cannot attribute them. The
          guest adds exactly three sockets, all loopback.

- _Outcome:_ A guest now exists that is reproducible from two tracked files and reaches nothing on the host. The
  isolation evidence is stronger than the planned check would have produced: the plan's TCP-only snapshot would
  have shown wildcard listeners belonging to unrelated host services and had no baseline to clear them against,
  while a UDP path Lima does open would not have appeared at all. Both the recipe and its provisioning script are
  statically validated, the latter extracted back out of the YAML block where indentation errors hide.

### `[x]` **1.4 Add the start, status, and rebuild helpers**

- _Goal:_ The operator runs the VM with three commands, each covered by `lint:sh`, and a rebuild is proven to be a
  fresh instance from the recipe.

    - `[x]` **1.4.a Write `start.sh`, `status.sh`, and `rebuild.sh` under `scripts/local-ci/`**
        - `start.sh` is idempotent across all three states — already running, existing but stopped, absent — and
          installs the login agent only when it is missing, rendering the plist's home-directory placeholder from
          the environment so the account name stays a local input. `status.sh` reports the instance, the guest's
          load and memory, and each runner service, and exits cleanly with a note when the guest is down, since
          that is the state it is most often asked about. `rebuild.sh` requires `--yes`, rejects unrecognized
          arguments rather than ignoring them, and refuses while a job is in progress.
        - The in-progress check matches `[R]unner\.Worker` rather than the plain pattern. Written literally, the
          pattern appears in the command line of the shell that runs the check, so `pgrep -f` matches its own
          invocation and the guard fires on every run — as useless as one that never fires.

    - `[x]` **1.4.b Extend the `lint:sh` glob**
        - Added `../../scripts/local-ci/*.sh` to the `lint:sh` script and ran it green. The existing
          `../../scripts/*.sh` entry does not reach a subdirectory.

    - `[x]` **1.4.c Prove the helpers**
        - `status.sh` and both of `rebuild.sh`'s refusal paths were exercised from the workstation over SSH, and a
          full `rebuild.sh --yes` ran to completion; the `status` output and the completion timestamp are in the
          ledger. The replacement instance came up fully provisioned with a two-minute uptime, which is what
          distinguishes a rebuild from a restart.
        - The job-in-progress refusal is not yet provable — no runner exists to hold a job until Phase 3. Only the
          argument handling is verified so far; the guard itself is worth exercising once Task 3.1 lands.

- _Outcome:_ The trial is now operable from three commands, and the guest is reproducible from the recipe on
  demand rather than only at first build. The login agent is installed, so the unattended-restart path Task 4.2
  measures is in place rather than merely designed.

## **Phase 2:** Anchor gate

_Purpose:_ Test the transplanted speed estimate inside the guest before any runner registration or CI change exists
(the spec's phase 1; the spec's phases 2 to 4 are Phases 3 and 4 here, with its conditional phase 3 as Task 3.3). A
median at
or below 120 s continues the trial; anything above it, or any OOM or swap growth, closes the work unit as no-go: the
recommendation and no-go closeout in Phase 4 still run, and every other later task is marked superseded.

### `[x]` **2.1 Stage the repository and build `dist` inside the guest**

- _Goal:_ The guest holds a disposable checkout of current `main` with `dist` built, using an arm64 Node 24 installed
  in the guest, without any credential entering the guest.

    - A `git archive` of `main` at `143aaba08` was piped from the workstation into `tar -x` inside the guest over
      the existing SSH path, rather than staged as a file and copied in. Same result with one fewer artifact: no
      repository tarball is ever written to the host's disk, which is closer to the scope contract's "no
      development checkout on the host" than staging a copy there would be. No clone credential exists or is
      needed.
    - Node v24.20.0 for arm64 installed from the official tarball, verified against its published SHA-256 before
      extraction. Node 24 is what the workflow resolves to today — the E2E jobs request `lts/*` and the classify
      job pins `24` — so the guest matches CI rather than merely matching the plan's wording. `npm ci` and the
      package build both succeeded.

### `[x]` **2.2 Run the warmups and the measured repetitions**

- _Goal:_ At least ten clean measurements of the anchor under the workflow's exact invocation, with memory and swap
  sampled across each run.

    - Three warmups discarded, then ten measured runs at the workflow's exact invocation. The measurement runs from
      `scripts/local-ci/anchor-bench.sh` rather than an ad-hoc loop: Task 3.2 reuses this invocation and sampler for
      the concurrency checks, and a guest rebuild would erase instrumentation that lived only in the guest. One
      code path is what makes those later figures comparable to these.
    - Wall time from `/usr/bin/time`, with a background sampler recording peak memory and swap per run, and
      `journalctl -k` checked for OOM across the series. All ten runs and every table entry are in the ledger.
    - Integrity check beyond the plan: a separately captured run confirms 77 tests in 1 file passing. Wall time
      only measures the gate if the work under it is the work CI does, and `--passWithNoTests=false` alone would
      not have caught a partially-executing suite.

### `[x]` **2.3 Decide the gate**

- _Goal:_ The trial continues only on evidence, and a no-go is recorded as a complete outcome rather than a stall.

    - Median 56.38 s against the 120 s threshold, p95 56.53 s, no OOM events, and no swap growth possible in a
      guest with no swap device. The gate passes and the trial continues to Phase 3.
    - The no-go branch is not entered, so no task is marked superseded.

- _Outcome:_ The transplanted speed estimate holds and then some — the anchor runs at 47 percent of the gate
  threshold, and faster than the 80 s the same anchor takes unpinned on the workstation. The series is unusually
  tight (0.27 s across thirteen runs including warmups), which is what a guest with dedicated cores, no competing
  load, and no network in the measured path should look like. This settles per-job speed only: Phase 4's decision
  is a ratio over full workflow runs, where the serial head and the slot count, not per-job speed, set wall time.

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
