# Task List: self-hosted-ci

- **Design:** `spec-self-hosted-ci.md`

---

## **Phase 1:** Hosted-first CI routing and runner-neutral check contracts

_Purpose:_ Land the repository changes while execution still defaults to GitHub-hosted Linux, preserving the
current job graph and trust-domain boundaries before any runner is allowed to receive work.

_Design decisions:_ All nine Linux jobs share one fail-safe variable expression. The Linux portability leg loses
its single-value matrix so its static `(linux)` identity no longer implies a particular executor.

### `[x]` **1.1 Route every Linux CI job through the fail-safe repository variable**

- _Goal:_ The complete Linux CI graph selects its runner from `ARC_CI_LINUX_RUNNER`, defaults safely to
  `ubuntu-latest`, and leaves every hosted-only trust domain and graph dependency intact.

    - `[x]` **1.1.a Parameterize the nine Linux jobs in `.github/workflows/ci.yml`**
        - Routed `classify`, `setup`, `lint-typecheck`, `unit`, `integration`, `e2e`, `portability`, `ci_ok`, and
          `merge-ok` through `ARC_CI_LINUX_RUNNER` with an unset-or-empty `ubuntu-latest` fallback.

    - `[x]` **1.1.b Preserve the explicitly hosted workflow surfaces**
        - Kept `portability-cross-platform`, `docs.yml`, and every `review-gate*` workflow on their explicit
          GitHub-hosted routes while the Linux expression fails safely to `ubuntu-latest`.

    - `[x]` **1.1.c Lock the routing boundary into workflow contract coverage**
        - Added parsed-workflow coverage for all nine variable-routed jobs and every hosted-only workflow job;
          retained the parse-all-workflows and pinned-action contracts.

### `[x]` **1.2 Make the Linux portability check identity executor-neutral across every coupled contract**

- _Goal:_ The portability check reports the stable name `Portability (concurrency guards) (linux)` and the
  verified-tree classifier requires that exact identity regardless of which Linux runner executes it.

    - `[x]` **1.2.a Replace the single-value portability matrix with a static Linux job**
        - Removed the single-value matrix, named the static job `Portability (concurrency guards) (linux)`, and
          left the E2E shard and hosted Windows/macOS matrices unchanged.

    - `[x]` **1.2.b Synchronize the verified-tree check-name source and fixture**
        - Synchronized the executor-neutral identity across `HEAVY_CHECK_NAMES` and its `HEAVY_CHECKS` fixture;
          existing absent, pending, and failed-check coverage remains intact.

    - `[x]` **1.2.c Update and run the coupled offline regression coverage**
        - Replaced the single-value-matrix assertion with static-identity and hosted-boundary coverage; the
          classifier unit tests, workflow integration and YAML parsing coverage, and `shellcheck` pass.

## **Phase 2:** Disposable runner operations and fail-closed readiness

_Purpose:_ Establish the reviewable operating contract, select and acquire a provider within the settled envelope,
build the deliberately small two-slot host from user-held access, then pass the repository trust gate before either
runner receives its repository label or registration.

_Design decisions:_ `.github/self-hosted-ci.md` is the durable operator runbook. Sanitized selection, cutover,
drill, and canary evidence stays in `notes-self-hosted-ci.md`, keeping history out of the living procedure. Access
coordinates and full principal rosters remain user-held or transient; credentials and short-lived tokens are never
recorded.

### `[x]` **2.1 Check in the disposable self-hosted runner runbook and evidence contract**

- _Goal:_ A trusted operator can build, operate, recover, and destroy the runner host from checked-in guidance,
  while every acceptance claim has a defined non-secret evidence field.

    - `[x]` **2.1.a Define operator inputs, invariants, and secret boundaries**
        - Added the supported host, toolchain, two-service, label, no-backup, user-held input, and sanitized evidence
          contracts to `.github/self-hosted-ci.md`.

    - `[x]` **2.1.b Document reproducible host and runner-service procedures**
        - Documented host hardening, prerequisite verification, two isolated application directories, post-audit
          service registration, bounded persistent logs, local sampling/export, health checks, and safe cleanup.

    - `[x]` **2.1.c Document cutover, fallback, incident, maintenance, rebuild, and decommission procedures**
        - Added the exact operational sections with the fail-closed access audit, route changes, qualification and
          fallback, maintenance/reboot handling, rebuild-first incidents, and hosted-first public transition.

    - `[x]` **2.1.d Add the work-unit evidence template**
        - Added the sanitized selection, trust, readiness, qualification, drill, canary, cost, and final-posture
          evidence fields to `notes-self-hosted-ci.md`, with the prohibited-data boundary stated explicitly.

### `[ ]` **2.2 Select and acquire a VPS provider and SKU within the operating envelope**

- _Goal:_ A paid, user-owned VPS allocation is ready for bootstrap with current provider terms verified against
  the design's resource, cost, support, and operational constraints.
- _Note:_ Provider signup, identity checks, MFA, billing, and purchase are user-owned external actions. Research
  may recommend a choice, but no purchase or recurring spend is authorized until the user explicitly approves it.

    - `[ ]` **2.2.a Research current provider and runner-support facts**
        - Compare current authoritative provider offerings for x64 Linux, roughly 4 vCPU / 8 GB RAM, SSD, suitable
          region, outbound HTTPS, administrative access, adequate transfer, and a monthly price no higher than
          $15; confirm the selected OS against current GitHub Actions runner support.
        - Surface material tradeoffs such as shared-vs-dedicated CPU, disk, egress, provisioning availability,
          cancellation terms, available host metrics and retention, and operational burden; do not assume provider
          charts expose guest memory or hard-code stale catalog facts into the runbook.

    - `[ ]` **2.2.b Select the provider, SKU, region, and access posture**
        - Recommend the smallest qualifying option with rationale and obtain explicit approval for the provider,
          recurring cost, region, supported OS, backup-disabled posture, administrative-access shape, and the
          provider-chart availability plus the required local-sampling evidence posture.
        - Record the approved non-secret selection and rationale in `notes-self-hosted-ci.md` § Cutover evidence.

    - `[ ]` **2.2.c Acquire the allocation and make user-held access available**
        - The user creates or uses the provider account, enables MFA, supplies payment, completes any provider
          verification, purchases the approved allocation, and adds the intended SSH public key.
        - Consume access through the user's local SSH configuration and agent/key path without copying those
          coordinates into tracked files. Record only the approved provider, SKU, region, recurring price, and a
          non-sensitive allocation reference when one is useful.

### `[ ]` **2.3 Provision and harden the two-slot VPS without registering or routing CI jobs**

- _Goal:_ One minimal, hardened host has the prerequisite toolchain and two prepared runner directories, but no
  repository runner registration or label exists before the access-control audit passes.
- **Additional Context:** `.github/self-hosted-ci.md` § Host provisioning.

    - `[ ]` **2.3.a Establish the disposable host baseline**
        - Apply OS updates; restrict inbound traffic to administrative access; enable unattended security updates;
          configure restart/reboot handling and persistent size-bounded service logs; create the unprivileged runner
          user; and keep development checkouts, personal notes, PATs, deploy keys, unrelated services, Docker, and
          private-network access off the host.

    - `[ ]` **2.3.b Install and verify the workflow prerequisite toolchain**
        - Install `git`, `gh`, `jq`, `shellcheck`, a POSIX shell, coreutils, and the supported Node prerequisites;
          capture versions and prove each executable is available to the runner service user.
        - Install and enable a lightweight local sampler such as `sysstat` for CPU, memory, load, and disk history;
          verify timestamps, sampling cadence, retention, storage cap, and protected export without introducing a
          third-party monitoring service.

    - `[ ]` **2.3.c Prepare two isolated runner application directories**
        - Download and verify the supported runner application into separate directories owned by the unprivileged
          service user; stage unique intended runner names and `arc-ci-linux` as transient operator inputs.
        - Do not request a registration token, run repository configuration, install a runner service, or assign
          the repository label during this task.

    - `[ ]` **2.3.d Confirm provisioning left both trust gates closed**
        - Leave `ARC_CI_LINUX_RUNNER` absent/empty, confirm the repository has no new runner registrations, and
          record only the sanitized host/tool and telemetry/log-retention baseline in the evidence section.

### `[ ]` **2.4 Pass the access-control gate, register both runners, and prove readiness**

- _Goal:_ The repository label and two runner services exist only after every executable pull-request principal is
  explicitly trusted, then both slots prove the host, label, service, and prerequisite contract before cutover.
- **Additional Context:** `.github/self-hosted-ci.md` § Runner registration and § Cutover and health checks.

    - `[ ]` **2.4.a Audit every executable pull-request principal**
        - Inspect repository collaborators, pending invitations, private forks, installed apps/bots, automation
          that can originate pull requests, and Actions fork settings using current GitHub state.
        - Inspect identities transiently; record category counts, the explicit trust result, and only exceptions
          needed to explain a blocker. Any unknown or untrusted principal stops before token issuance, registration,
          label assignment, or cutover.

    - `[ ]` **2.4.b Register two isolated runner services after the audit passes**
        - Obtain short-lived GitHub registration tokens only at the point of use, configure the prepared directories
          with unique runner names and `arc-ci-linux`, and do not persist or log the tokens.
        - Install and start both services with automatic runner updates and service-manager restart behavior.

    - `[ ]` **2.4.c Validate both slots and record the cutover go/no-go decision**
        - Confirm both unique runner names are online/idle with `self-hosted`, Linux, x64, and `arc-ci-linux`
          labels; verify service restart state, directories, disk headroom, update posture, tools, live telemetry,
          persistent logs, and projected retention through both canary floors and the posture decision.
        - Complete the sanitized precondition and health fields in `notes-self-hosted-ci.md`; surface any failed
          item as a blocker rather than setting the route variable speculatively.

## **Phase 3:** Cutover qualification, fallback, and rebuild drills

_Purpose:_ Exercise the real runner and repository-variable seams in bounded drills before the long canary, proving
job placement, verified-tree reuse, hosted recovery, and disposability rather than inferring them from green CI.

_Design decisions:_ Trial routing begins only after Phase 2 is green. Hosted fallback stays selected during any
runner teardown or rebuild, and destructive external steps retain their own explicit approval gate.

### `[ ]` **3.1 Cut over the Linux job graph and prove hosted cross-platform isolation**

- _Goal:_ A real heavy CI run places every Linux job on the two repository runners, keeps Windows/macOS and
  privileged workflows hosted, and preserves a green `merge-ok` graph without hosted Linux runner charges.
- **Additional Context:** `.github/self-hosted-ci.md` § Cutover and health checks.

    - `[ ]` **3.1.a Select the self-hosted route**
        - Reconfirm Task 2.4 evidence, set repository Actions variable `ARC_CI_LINUX_RUNNER=arc-ci-linux`, and
          trigger a comparable heavy pull-request run without changing the workflow file.
        - The current `.github/workflows/ci.yml` / `scripts/classify-change.sh` diff selects
          `portability-cross-platform`; if later branch shape no longer does, dispatch `ci.yml` on this branch as
          a separate hosted Windows/macOS placement proof while retaining the PR run for `ci_ok` / `merge-ok`.

    - `[ ]` **3.1.b Verify job placement and graph identity**
        - Confirm `classify`, `setup`, `lint-typecheck`, `unit`, `integration`, all E2E shards, `portability`,
          `ci_ok`, and `merge-ok` report the expected self-hosted runner names/label.
        - Confirm `portability-cross-platform` remains on Windows/macOS hosted runners and no `review-gate*` or
          `docs.yml` job has entered the self-hosted trust domain.

    - `[ ]` **3.1.c Record the first-cutover result**
        - Capture run links/ids, runner assignments, results, `merge-ok` elapsed time, queue behavior, and Actions
          usage evidence; distinguish normal hosted cross-platform minutes from Linux fallback minutes.

### `[ ]` **3.2 Prove runner-neutral check identity and verified-tree reuse on self-hosted execution**

- _Goal:_ The executor-neutral portability name participates in a real green heavy-check set, and a known-verified
  code tree subsequently resolves `weight=light reason=verified` from the self-hosted classifier.

    - `[ ]` **3.2.a Verify the live heavy-check identity set**
        - Confirm check runs expose unchanged lint/typecheck, unit, integration, and E2E shard names plus exactly
          `Portability (concurrency guards) (linux)`; confirm `merge-ok` remains the required compatibility check.

    - `[ ]` **3.2.b Exercise the verified-tree lookback**
        - After a self-hosted heavy run succeeds, use the next natural docs-only task-list/evidence commit that
          preserves the code tree and prove the classifier emits `weight=light` and `reason=verified` rather than
          silently rerunning heavy; do not create meaningless file churn solely to trigger CI.
        - Inspect the classifier log to prove the live `gh api` seam worked; a green run alone is insufficient.

    - `[ ]` **3.2.c Verify prerequisite failure modes remain diagnosable**
        - Confirm `jq` supports the `ci_ok` roll-up and the runner service user can invoke `gh`; record the positive
          evidence that rules out a missing-tool false signal during canary tuning.

### `[ ]` **3.3 Drill hosted fallback and a timed disposable-runner rebuild**

- _Goal:_ Hosted execution is restored in under five minutes and the complete two-service runner host is rebuilt
  from the runbook within two hours without a machine backup.
- **Additional Context:** `.github/self-hosted-ci.md` § Hosted fallback, § Rebuild, and § Deregistration.

    - `[ ]` **3.3.a Time the no-edit hosted fallback**
        - Set `ARC_CI_LINUX_RUNNER` to `ubuntu-latest` or clear it, cancel any queued self-hosted run, re-run, and
          confirm the Linux graph starts on hosted runners within five minutes.
        - Record the start/end timestamps, variable action, cancelled run, replacement run, and placement result.

    - `[ ]` **3.3.b Approve and execute the destructive rebuild drill**
        - Surface the exact deregistration, VPS destruction, replacement, and rollback plan; obtain explicit user
          approval before removing runners or destroying the paid host.
        - With hosted fallback active, start the timer, deregister both services, destroy/recreate or fully replace
          the VPS, and rebuild the hardened host, toolchain, and two application directories only from
          `.github/self-hosted-ci.md` using no machine backup. Stop before registration or label assignment.

    - `[ ]` **3.3.c Re-run the trust gate, register, requalify, and restore trial routing**
        - Re-run the full executable-principal checklist before requesting tokens or assigning `arc-ci-linux`; only
          on a green result, register/install/start both services and stop the rebuild timer when both are healthy.
        - Run prerequisite/service/telemetry health checks and a heavy self-hosted qualification; restore
          `ARC_CI_LINUX_RUNNER=arc-ci-linux` only after they pass. Record total rebuild time, deviations, sanitized
          runner status, telemetry/log coverage, and any runbook fixes.

## **Phase 4:** Measured canary and operating-posture decision

_Purpose:_ Run the unchanged graph long enough to measure its real cost, latency, and reliability on two slots,
then respond to the observed failure mode rather than pre-provisioning speculative capacity.

_Design decisions:_ A comparable sample is a non-deferred, heavy, reviewed pull-request run that completes the full
Linux graph. One workflow run id is one sample across all attempts. Measure `merge-ok` latency from initial run
creation to final check completion and compute nearest-rank p95 over the qualifying sample; retain every otherwise-
eligible failure or cancellation in the reliability ledger. Runner assignments prove execution placement, while
repository/SKU billing data is aggregate corroboration rather than per-workflow attribution.

### `[ ]` **4.1 Complete the seven-day, twenty-run canary and calculate its acceptance measures**

- _Goal:_ A reviewable sample proves or falsifies the two-slot host against cost, latency, flake, and availability
  targets without mixing fallback runs or non-comparable light lanes into the result.

    - `[ ]` **4.1.a Establish the canary ledger and collection contract**
        - Create one row per pull-request workflow run id in `notes-self-hosted-ci.md` § Cutover evidence, including
          head SHA, attempts, full-Linux-graph eligibility, cross-platform-target status, initial creation time,
          final `merge-ok` completion, conclusion, retries, and any failure or cancellation classification.
        - For every Linux job and attempt, collect the Actions jobs API's `created_at`, `started_at`, `completed_at`,
          runner name, and labels. Define queue delay as job-ready `created_at` to `started_at` and running duration
          as `started_at` to `completed_at`; preserve per-job values rather than a single run-level queue estimate.
        - Record repository/SKU billing data separately as an aggregate cross-check. Use runner names and labels as
          the primary zero-hosted-Linux proof, and identify hosted-fallback runs and other hosted Linux workflows so
          their repository-level minutes are not attributed to normal `ci.yml` execution.
        - Before the first sample, prove host sampling and service/restart logs have current timestamps and projected
          retention through both sample floors and the decision. Check coverage during the canary; extend retention
          or export full logs to a protected user-held location before rotation, tracking only sanitized summaries.

    - `[ ]` **4.1.b Satisfy both sample floors**
        - Maintain the ledger for every otherwise-eligible run, including failed, retried, cancelled, and superseded
          runs; only a run whose final attempt completes the full heavy graph and `merge-ok` counts toward the
          latency sample, but runner-caused failures or retries remain part of the reliability outcome.
        - Continue under one unchanged runner configuration until at least seven elapsed days and twenty qualifying
          heavy pull-request runs are captured; if seven days yields fewer runs, keep the task open until the run
          floor is met.
        - If any collaborator, pending invitation, private fork, installed app/bot, pull-request automation, or
          Actions fork setting changes, select hosted fallback and re-run the complete trust checklist before
          resuming the canary.

    - `[ ]` **4.1.c Calculate and classify the canary outcome**
        - Treat all attempts for one workflow run id as one sample, sort initial-creation-to-final-`merge-ok`
          durations, and use nearest-rank `ceil(0.95 × N)` for p95; require p95 under ten minutes, no runner-caused
          flake, and no unexplained offline stall.
        - Classify as runner-caused any host, service, toolchain, or workspace-residue condition that causes a
          failure, retry, cancellation, or anomalous queue. Keep planned fallback and superseded-run cancellation
          separate, and record the evidence used to resolve every suspected event.
        - Correlate queue and running durations with provider CPU/memory charts, runner service logs, and host
          restart history; review service-log coverage for the full canary before distinguishing slot contention
          from per-job starvation or an unexplained outage.
        - Compare aggregate Actions usage with the hosted baseline and confirm every normal `ci.yml` Linux job used
          the expected self-hosted runner; report unrelated hosted Linux and fallback usage separately.

### `[ ]` **4.2 Resolve the canary result with at most one evidence-driven correction**

- _Goal:_ A passing canary advances unchanged, while a failed canary receives the response matched to its measured
  cause without speculative expansion or an indefinite tuning loop.

    - `[ ]` **4.2.a Choose the response from measured evidence**
        - If the initial configuration passes every target, record that no tuning is required and proceed directly
          to the permanent-posture decision.
        - Queue depth calls for another runner service plus proportional host capacity; per-job starvation calls
          for a resize; runner unreliability calls for rebuild/remediation; an uneconomic or unresolved failure
          calls for hosted fallback.
        - Surface the evidence, recommendation, changed recurring cost, and operational impact for explicit user
          approval before modifying the paid service or runner count or performing any runner deregistration,
          destructive remediation, or host destruction/replacement.

    - `[ ]` **4.2.b Apply at most one approved tuning pass**
        - Select and verify hosted fallback before changing infrastructure. Preserve the job graph, apply only the
          approved correction, update the runbook/evidence for the final slot/resource shape, and retain the
          original sample as diagnostic evidence.
        - Repeat the timed no-backup rebuild for the complete final shape, stopping before registration; re-run the
          executable-principal checklist, register all accepted runner services only on a green trust result, and
          complete service/tool/telemetry health plus heavy self-hosted qualification before restoring trial
          routing.
        - Any approved host-size, runner-count, rebuild, or remediation change starts a new final-configuration
          canary. Repeat both the seven-day and twenty-qualifying-run floors without another material change before
          accepting that configuration.

    - `[ ]` **4.2.c Stop tuning if the target remains unacceptable**
        - Restore `ubuntu-latest` fallback, verify hosted execution, and record why permanent self-hosting was
          rejected rather than broadening scope into autoscaling or a platform project.

### `[ ]` **4.3 Settle the permanent routing posture and maintenance baseline from canary evidence**

- _Goal:_ Repository state, runner lifecycle, monthly ownership, and the evidence record all agree on one explicit
  accepted posture: permanent self-hosted Linux or verified hosted fallback.

    - `[ ]` **4.3.a Decide the permanent route against the success criteria**
        - Accept `arc-ci-linux` only when cost, p95, reliability, fallback, rebuild, trust, and verified-tree proofs
          all hold; otherwise keep `ubuntu-latest` selected.
        - Re-run the complete executable-principal checklist, read back `ARC_CI_LINUX_RUNNER`, and verify the
          expected runner services are online/idle before recording the final posture.

    - `[ ]` **4.3.b Establish the ongoing maintenance baseline**
        - Record the monthly runner/update/log/disk check, reboot handling, access-change recheck, responsible
          operator, and the rebuild/fallback threshold.

    - `[ ]` **4.3.c Close unused external infrastructure deliberately**
        - If hosted fallback is permanent, surface and obtain approval for runner deregistration and VPS
          cancellation/destruction; verify no runner identity or paid allocation remains accidentally active.

## **Phase 5:** Operational and architectural closeout

_Purpose:_ Reconcile the durable operating guidance with what the drills and canary proved, then align the project's
architecture source of truth with the accepted operating posture.

### `[ ]` **5.1 Reconcile the operations runbook with canary and rebuild findings**

- _Goal:_ The checked-in runbook accurately operates an accepted self-hosted route or preserves a dormant,
  requalification-required procedure after decommission, without historical drill narration, stale commands,
  hidden prerequisites, or provider credentials.
- **Additional Context:** `.github/self-hosted-ci.md` § Host provisioning, § Runner registration, § Cutover and
  health checks, § Hosted fallback, § Rebuild, and § Deregistration.

    - Preserve the runbook's exact required headings while updating supported OS, package commands, runner/service
      paths, health probes, telemetry/log retention and protected export, cleanup loci, fallback, timed rebuild,
      monthly maintenance, incident response, and decommission steps to match what actually worked.
    - If permanent self-hosting was accepted, state its active maintenance and fallback contract. If hosted fallback
      was accepted, keep the procedure dormant and require fresh provisioning, trust, registration, and
      qualification before the route variable may select `arc-ci-linux` again.
    - Keep provider selection history and canary measurements in `notes-self-hosted-ci.md`; keep the runbook
      forward-looking and safe for a future rebuild.
    - Re-run every affected non-destructive command and read-only health probe, then run scoped markdown lint; do
      not repeat destructive infrastructure operations merely to validate wording.

### `[ ]` **5.2 Reconcile the accepted Linux CI target in `.arc/reference/TECHNICAL-OVERVIEW.md`**

- _Goal:_ The infrastructure source of truth accurately states the live Linux runner target, bounded concurrency,
  hosted portability/review boundaries, and variable-controlled fallback after the canary settles.
- **Additional Context:** `.arc/reference/TECHNICAL-OVERVIEW.md` § Update Discipline and § 3 Infrastructure.

    - Edit only the project-owned rendered document, never the package's technical-overview template.
    - If permanent self-hosting was accepted, make the dedicated event-driven § 3 Infrastructure edit and state the
      architecture and rationale without work-unit, task, spec, or canary-process references; run scoped markdown
      lint on the result.
    - If permanent hosted fallback was accepted, verify the overview makes no self-hosted claim and leave it
      unchanged. Record the settled decision in `notes-self-hosted-ci.md`, and surface every affected success
      criterion for evidence-based `[~]` or `[ ]` disposition during verification rather than singling out one.

## **Phase 6:** Verification

_Purpose:_ Verify the settled implementation and operational evidence against the full design and project gates.

### `[ ]` **6.1 Complete verification** — load and follow `verify-work-unit.md`

- _Goal:_ The repository changes, external runner state, cutover evidence, canary decision, durable documentation,
  and every success criterion withstand the work-unit verification workflow.

---

## Success Criteria

- `[ ]` All nine normal Linux CI jobs use the fail-safe runner variable and execute on the accepted self-hosted
  route, while Windows/macOS portability plus docs and review-gate workflows remain GitHub-hosted.
- `[ ]` A comparable heavy run records zero billed hosted Linux job-minutes outside an explicitly identified
  fallback drill.
- `[ ]` The canary includes at least seven elapsed days and twenty comparable heavy runs, with p95 `merge-ok`
  latency below ten minutes and no runner-caused flake or unexplained offline stall.
- `[ ]` The variable-only fallback drill restores hosted Linux execution in under five minutes.
- `[ ]` A no-backup rebuild from `.github/self-hosted-ci.md` restores every accepted runner service within two
  hours.
- `[ ]` The live portability check is named `Portability (concurrency guards) (linux)`, matches the classifier,
  and a known-verified tree produces `weight=light reason=verified` on self-hosted execution.
- `[ ]` `TECHNICAL-OVERVIEW.md` § 3 records the accepted self-hosted Linux execution target at permanent cutover.
- `[ ]` All quality gates pass (tests, linting, type checking, build, workflow parsing, and shell linting).
- `[ ]` Ready for integration.
