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

### `[x]` **3.1 Register two runner services in the guest**

- _Goal:_ Two services carry `arc-ci-mini`, `self-hosted`, `Linux`, and `ARM64`, neither carries `arc-ci-linux`, and
  both return online after a guest reboot with no operator action.

- **Additional Context:** `.github/self-hosted-ci.md` § Runner registration

    - Executable-principal audit passed and is recorded in the ledger: private repository, no forks, no pending
      invitations, no deploy keys, one admin collaborator, every recent pull request authored by that account, no
      Dependabot config, and a `pull_request` trigger rather than `pull_request_target`. The one principal the
      audit could not resolve from this token — the repository's own GitHub App — was confirmed by the maintainer
      before registration rather than inferred from its name.
    - Preconditions confirmed: the routing variable is absent entirely, and neither runner name existed.
    - Runner v2.337.0 for arm64 downloaded once as the service account and verified against its published SHA-256
      before extraction into either application directory; dependencies installed; mode `0750` restored.
    - Both services registered with unique names and the `arc-ci-mini` label alone, each from a separate short-lived
      token requested at the point of use. The registration script reads its token from standard input rather than
      an argument, so no token reaches a command line, a shell history, or a transcript.
    - `Restart=always` drop-ins installed. After a deliberate guest reboot both services returned enabled, active,
      online, and idle within twenty seconds with no operator action, carrying `self-hosted`, `Linux`, `ARM64`, and
      `arc-ci-mini`, and neither carrying `arc-ci-linux`.

### `[x]` **3.2 Concurrent-anchor check for two services**

- _Goal:_ Two anchors running at once each finish within 1.25x the Phase 2 median with the guest below 7 GB at peak
  and no OOM, and the peak free memory is recorded for the third-service decision.

    - **The per-job threshold fails and is recorded as failed, not amended.** Two simultaneous anchors run 78.32 s
      each — 1.389x the anchor-gate median against a 1.25x limit. Memory passes with wide margin: 2351 MB peak of
      7912, no OOM, 3763 MB free at peak.
    - The cause is structural. The base M4 carries four performance and six efficiency cores, and this anchor drives
      about four logical CPUs, so a second concurrent run spills onto efficiency cores. No allocation change
      recovers it.
    - The failure is the phase's most useful result. It exposes that slots on one box are not independent: two slots
      deliver 1.44x the work of one and three deliver 1.57x, against 2x and 3x for independent slots. The full
      throughput curve, measured out to four slots, is in the ledger.

### `[~]` **3.3 Admit a third service on measured headroom**

- _Goal:_ A third service exists only when the two-service check left at least 2.5 GB of guest memory free at peak,
  and it passes the same concurrent check with three runs.

- _Outcome:_ Skipped on evidence the plan did not anticipate, and on a different criterion than the one written
  here. The stated memory condition **passes** — 3763 MB free at peak against a 2500 MB bar — but memory is not what
  binds. Three concurrent anchors were measured without registering a service, and the constraint is CPU: at three
  slots the anchor runs 1.90x slower, which pushes the E2E helper's fixed 10 000 ms subprocess budget past its
  limit. Two of 36 three-slot jobs failed a wall-clock assertion, while 13 solo, 8 two-slot, and 16 four-slot jobs
  passed. A third slot therefore buys 9.4 percent throughput at roughly a 5 percent per-job failure rate, and a
  runner-caused failure disqualifies go regardless of ratio. The margin also protects the rest of the suite, which
  a routed workflow runs under the same contention and which was not measured here. No third service was created,
  so nothing needs removing.

### `[x]` **3.4 Dispatch one full workflow routed to the mini**

- _Goal:_ Every executed Linux job of one dispatched full workflow reports a guest runner name and a green result,
  with routing returned to its prior state afterwards.

    - Precondition verified against `origin/main` after the external errand merged: all six `actions/cache` keys
      now carry the runner architecture. The check distinguished a partial landing from a complete one — a
      half-applied change would have given the guest a hit on an x64-built dependency tree for exactly the steps
      still unfixed.
    - Prior state recorded as **absent**, so restoring meant deleting the variable rather than resetting a value.
      Dispatched in a window with no run in flight; every executed job reported a guest runner name and success,
      and the run completed in 641 s. Routing was restored 11 minutes 43 seconds after the flip, with nothing left
      queued and both runners idle.
    - Job work totals 1054 s against 2482 s for the same job set on hosted — **2.4x faster per job**, with the four
      E2E shards between 2.4x and 2.9x. Full table in the ledger.
    - The cold-cache concern carried into this task proved unfounded, in both of its parts. The architecture-keyed
      miss is paid once by `Shared setup` rather than per job, and it cost 2 s: `npm ci` installs 322 packages in
      two seconds on this host. The run is representative, not pessimistic.

- _Outcome:_ The guest runs the repository's real workflow green, end to end, at 2.4x hosted's per-job speed. Wall
  time lands about even with hosted and roughly four times better than the remote pool, because the guest is
  bounded by its two slots while hosted is bounded by its longest job — the slot-versus-speed tradeoff the Phase 3
  throughput curve predicted, now visible on a real workflow. Against the route in daily use once hosted minutes
  are exhausted, that is a large improvement; against hosted itself it is a wash on wall time.

## **Phase 4:** Soak and decision

_Purpose:_ Compare the mini against the VPS pool head-for-head on the unchanged four-shard topology, prove the
unattended-restart path, decide go or no-go, and ship the outcome.

_Design decisions:_ Each pair is dispatched serially with a routing flip between the two runs because the workflow's
concurrency group cancels overlapping runs of one ref. Wall time is the Actions run duration from creation to
completion, so both sides exclude the pull-request-only roll-ups. The go verdict is the operator's decision on the
recorded evidence; Tasks 4.4 and 4.5 are mutually exclusive, and the one not entered is marked `[~]` with a note
naming the verdict so the cursor and the verification walk treat it as a deliberate skip.

### `[x]` **4.1 Run the paired soak**

- _Goal:_ Three to five representative heavy heads each have one full run on `arc-ci-mini` and one on `arc-ci-linux`,
  with both durations and run ids in the ledger and the median ratio computed.

    - **Guest median 560 s against 1261 s on the remote pool at the same head: ratio 0.444, inside the 0.70
      threshold by 37 percent.** Three guest runs spread 6.1 percent. Run ids, durations, cache state, and per-job
      failures are in the ledger.
    - **No runner-caused failure on the guest** across four full-suite runs including the routed dispatch — roughly
      forty jobs. That was the open question the reshaped soak was spent on, since a runner-caused failure
      disqualifies go regardless of ratio.
    - Two deviations from the planned shape, both recorded in the ledger rather than absorbed. Only one head was
      eligible: every other remote branch predates the architecture-keyed cache change, so dispatching one to the
      guest would have restored a dependency tree built for the other architecture. And after the first pair the
      remaining legs were made guest-only, because every combination of samples already fell between 0.20 and 0.52
      while a remote leg cost four times a guest leg — buying full-suite failure evidence instead of restating a
      ratio that was never close. The criterion is therefore one paired ratio, not a median of pairs.
    - The remote leg failed on `delivery-position.e2e.test.ts` with vitest test-level timeouts. All its jobs ran to
      completion, so the duration stands as a workload measurement and the failure is recorded separately.

- _Outcome:_ The paired dispatch corrected the projection this work unit had been carrying. Historical remote runs
  median around 2584 s, which implied a ratio near 0.2; measured at one head against an idle pool the remote route
  takes 1261 s, and the true ratio is 0.444. The gap was never job speed — those historical runs pack at 1.55x
  across four slots against this one's 3.27x, so they were contending for the pool, and the projection inherited
  that contention as though it were slowness. It also overturned a claim made earlier in this work unit: the remote
  route hits timeout-class failures in normal operation, so timing fragility is a property of the current default
  route rather than something the guest introduces.

### `[x]` **4.2 Restart test**

- _Goal:_ After one deliberate macOS restart the VM and every registered runner are back online with no operator
  action, recorded with timestamps.

    - **Both runners were online 195 s after the restart, with nothing touched on the host.** SSH returned at 27 s,
      the guest reported `READY` at 36 s, and runner reconnection accounted for the remaining 159 s. Full timeline
      in the ledger.
    - The recovery was verified rather than inferred: host uptime and kernel boot time confirm a real restart,
      `who` showed only the CI user's console session (so automatic login fired rather than an operator session
      persisting), and the guest reported zero minutes of uptime on a new SSH control port, confirming a fresh
      instance rather than one that survived.
    - `limactl list` reported the instance `Running` 9 s before the guest was actually `READY`, so its status
      tracks the virtual machine's process rather than guest readiness. Recorded because `status.sh` reads that
      field; the shell it runs next fails visibly, so this is a reporting nuance, not a defect.

- _Outcome:_ The unattended-restart path works end to end, and the measurement located where the time actually
  goes: host and guest are ready in 36 s, while runner reconnection takes another 159 s. Service state inside the
  guest goes `active` well before GitHub will schedule work, so local service state is the wrong readiness signal
  after a restart — the runner list is the one that matters.

### `[x]` **4.3 Write the go/no-go recommendation**

- _Goal:_ The ledger closes with a criteria table and a written verdict the operator confirms before any routing
  change.

    - Criteria table covering all six signals, each naming the evidence it rests on, with the **verdict: go**,
      confirmed by the maintainer.
    - Five criteria pass, several by wide margins. The sixth — the concurrent per-job limit — is carried into the
      table as **failed**, not rewritten to fit, so the verdict rests on a stated reading of that failure rather
      than on its absence: the limit measures the host's core layout rather than a defect, and what it was written
      to protect holds.
    - The recommendation records that the configuration being shipped is the one that was measured — two services,
      not three — and bounds the claim to the routed Linux target with the remote pool retained as fallback,
      settling nothing about the permanent architecture or the paid remote allocation.

### `[x]` **4.4 Ship the go outcome**

- _Goal:_ The repository routes Linux CI to the mini with the VPS pool left registered as fallback, and the
  operating documents describe the new runner.

    - `.github/self-hosted-ci.md`: a local arm64 runner section covering the arm64 download and label variant, the
      recipe and helpers, the distinct-label registration precondition, the two-service configuration and why a
      third is rejected, the unattended-restart behaviour including macOS updates, and the maintenance-window flip.
      The lede now names both classes and which is the normal target, the operating contract is scoped to the VPS
      class, and the hosted-fallback cancel step covers both self-hosted labels rather than one.
    - `.arc/reference/TECHNICAL-OVERVIEW.md` § 3: the fleet and the routing variable, including that an unset
      variable routes to GitHub-hosted runners.
    - Routing set to the local label with both runners online and nothing in flight; a dispatched run placed its
      jobs on guest runners, confirming the cutover rather than assuming it.
    - `npm run -s lint:md` and `npm run lint:sh` green.

### `[~]` **4.5 Ship the no-go outcome**

- _Outcome:_ Not entered. The recommendation records a go verdict, so the helpers and the shell-lint glob stay and
  routing moves to the local runner rather than reverting. This branch and Task 4.4 are mutually exclusive.

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
