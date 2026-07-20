# Metadata: self-hosted-ci

| **State**     | **Owner** | **Branch**            | **Class** | **Priority** |
| ------------- | --------- | --------------------- | --------- | ------------ |
| `Integrating` | `andrew`  | `feat/self-hosted-ci` | `Heavy`   | `P3`         |

- **Cohort:** [none]
- **Depends On:** [none]

- **Origin:** [internal]
- **Design:** `spec-self-hosted-ci.md`
- **Task List:** `tasks-self-hosted-ci.md`

- **Current Workflow:** [none]
- **Last Completed:** Task 6.1 — Complete trial-cutover verification
- **Next Task:** [none]
- **Blockers:** [none]

- **Next Action:** open the PR

- **PR URL:** [none]
- **Completed:** [none]

## Release Notes Entry

The repository's recurring Linux CI now runs through a reversible two-slot self-hosted route with an immediate
hosted fallback, preserving hosted macOS/Windows coverage and stable merge checks while reducing Actions billing.

### Added

- A checked-in disposable-runner runbook covering hardened provisioning, trust-gated registration, health checks,
  maintenance, hosted fallback, rebuild-first incident response, and decommissioning.

### Changed

- All nine Linux CI jobs select their executor through `ARC_CI_LINUX_RUNNER` and fail safely to `ubuntu-latest`;
  hosted cross-platform and privileged review workflows remain on GitHub-hosted infrastructure.
- Linux portability now reports the executor-neutral `Portability (concurrency guards) (linux)` identity used by
  verified-tree classification.

### Fixed

- Classification provisions its pinned Node runtime before computing and looking up the code-tree identity, so a
  rebuilt runner cannot silently force every code change onto the heavy lane.
- Hosted fallback drains queued and in-progress self-hosted attempts before rerunning the workflow on hosted Linux.

### Infrastructure

- Two isolated runner services on a disposable VPS completed live heavy-run placement, verified-tree reuse,
  variable-only hosted fallback, controlled reboot, and no-backup rebuild qualification.

## Completion Notes

self-hosted-ci delivers the reversible Linux CI trial needed to stop normal development volume from scaling hosted
Linux runner charges. The existing job graph and required `merge-ok` check remain intact: nine Linux jobs share one
fail-safe repository-variable route, the portability identity is executor-neutral, and macOS, Windows, docs, and
privileged review workflows retain their GitHub-hosted trust boundaries. A checked-in runbook makes the two-service
host disposable rather than backup-dependent.

The selected $10/month OVHcloud US host was hardened and registered only after the executable-principal audit
passed. Live qualification proved full heavy-graph placement on both runner slots, hosted recovery in 25 seconds,
a complete no-backup rebuild in 23m07s, service recovery across reboot, and positive post-rebuild
`weight=light reason=verified` classification. An external GitHub TLS expiry also exercised the pressure valve
without being misclassified as a host failure.

The principal scope decision was to separate proven trial delivery from longitudinal acceptance. The seven-day,
twenty-heavy-run canary, any single evidence-driven correction, the permanent routing decision, and the resulting
technical-overview reconciliation move intact to the planned Heavy `self-hosted-ci-qualification` work unit. This
change therefore makes no premature claim that self-hosting is the permanent architecture. Adversarial verification
also found that the rebuilt host lacked Node before the classifier's setup step; classification now provisions the
pinned runtime explicitly and integration coverage locks the ordering contract. Review iteration clarified readiness
evidence timing and hardened fallback to cancel already-running self-hosted work.

Verification passed the local build, Markdown and TypeScript lint/typecheck gates, and 144 focused workflow and
classifier tests. Exact-head heavy CI run 29764356926 passed the complete Linux graph, hosted Windows/macOS
portability, `ci-ok`, and `merge-ok`; CodeRabbit approved the reviewed head with every thread resolved. Seven of nine
trial criteria are met, with the two longitudinal/permanent-posture criteria explicitly superseded to the follow-up.

---
