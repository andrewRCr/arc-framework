# Metadata: cli-git-executor

| **State** | **Owner** | **Branch** | **Class** | **Priority** |
| --------- | --------- | ---------- | --------- | ------------ |
| `Shipped` | `andrew`  | [none]     | `Heavy`   | `P2`         |

- **Cohort:** `cli-substrate-adoption`
- **Depends On:** [none]

- **Origin:** [internal]
- **Design:** `spec-cli-git-executor.md`
- **Task List:** `tasks-cli-git-executor.md`

- **Current Workflow:** [none]
- **Last Completed:** Task 5.1 — Complete verification
- **Next Task:** [none]
- **Blockers:** [none]

- **Next Action:** [none]

- **PR URL:** <https://github.com/andrewRCr/arc-framework/pull/310>
- **Completed:** 2026-07-20

## Release Notes Entry

Git subprocess execution now uses one typed, cross-platform failure contract while preserving the CLI's established
command seams and user-visible behavior. Expected remote-ref and lease races classify centrally, cancellation and
timeout handling no longer depends on Node-specific error names, and diagnostic output remains bounded without
discarding complete captured process evidence.

### Added

- Git execution failures expose a structured `GitProcessError` taxonomy for cancellation, timeout, output limits,
  non-zero exits, spawn failures, and unexpected rejections, with stable codes and invocation metadata.
- Expected missing-remote-ref and stale-lease outcomes are available as typed discriminants derived from matching
  Git commands, exit evidence, and complete stderr.

### Changed

- Audited Git process bindings now run through execa 10 behind the existing injectable Promise interfaces,
  including captured output, stdin-fed commands, note transport, prepared ref verification, worktree pushes,
  installation diffing, and release commits.
- Compatibility classifiers consume complete typed or faithful legacy evidence while bounded display messages
  remain separate from the parsing contract.

### Fixed

- Caller-owned timeouts distinguish their own cancellation from unrelated failures, and output-limit, signal,
  spawn, prepared-transaction, and non-zero failures retain the correct typed cause and captured streams.
- Missing remote refs and stale publication leases no longer depend on consumer-specific parsing of localized or
  version-dependent Git output.

### Infrastructure

- The focused real-process executor suite now runs on Linux, Windows, and macOS, covering argument transport,
  binary and large output, stdin, cancellation, timeout, spawn, remote-ref, and lease behavior.

## Completion Notes

The CLI's audited Git subprocess layer now runs on execa 10 behind the unchanged `GitExec` and `GitExecInput`
Promise seams. One executor-owned `GitProcessError` contract preserves invocation identity, process status, complete
64 MiB-capped streams, bounded diagnostic projections, and original causes while exposing stable failure kinds and
expected remote-ref or lease outcomes. Specialized blob, note, prepared-ref, worktree-push, installation-diff, and
release-commit bindings moved onto the same substrate before the general production binding cut over.

Consumer migration remained deliberately bounded. Expected absence and stale-lease decisions now use typed
discriminants; broader compatibility classifiers read complete typed stderr or faithful legacy evidence; bounded
display messages never became a parsing ABI. The public executor interfaces, higher-level Git workflows, and
unrelated process execution stayed unchanged, while peripheral scripts, review-gate executors, and reusable raw-Git
test helpers remain assigned to the cohort's final migration sweep. Implementation settled the diagnostic limits at
4 KiB per stream projection and 1 KiB per display message without changing the 64 MiB process ceiling.

Verification and review hardened several failure boundaries beyond the initial cutover. Two adversarial passes
corrected expected-outcome precedence, proved the production stale-lease race, and retained partial output-limit
streams. Hosted review then tightened legacy cancellation compatibility, ref-verification stdin and terminal
failures, and cross-platform fixtures, including deterministic Windows spawn coverage. Append-only reconciliation
with the moving base regenerated only the derived ROADMAP projection.

The final scope aligns with the project durability, stable-boundary, and cross-platform principles and with the
documented CLI, injected-library, Vitest, and dependency architecture; the technical overview records execa as the
Git process runtime. Full local verification passed Markdown, TypeScript, and shell linting, source/test typechecks,
the build, 47 portability tests, and the full suite with 6,546 tests passing and one expected skip. Review-driven
follow-through passed 39 focused tests, and the exact-head hosted matrix finished with CodeRabbit approval, every
discussion resolved, and all unit, integration, E2E, portability, relay, `ci-ok`, and `merge-ok` checks green.

---
