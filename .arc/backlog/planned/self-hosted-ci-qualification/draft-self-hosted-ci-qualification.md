# Draft: self-hosted-ci-qualification — permanent self-hosted CI qualification

## Scope Contract

This Heavy follow-up owns the complete qualification and permanent-posture tail transferred from
`self-hosted-ci` Tasks 4.1–5.2. Preserve these constraints when authoring its design and task list:

- Import and maintain the full run/attempt ledger from the original cutover. Apply both the seven-day and
  twenty-qualifying-heavy-run floors, nearest-rank p95 latency calculation, runner-caused reliability
  classification, placement audit, host telemetry/log correlation, and separate aggregate cost corroboration.
- Settle the permanent route from that evidence. If correction is warranted, choose it by observed failure mode,
  obtain explicit approval before paid, destructive, runner-registration, or decommissioning actions, and allow
  at most one tuning pass.
- Before restoring a materially changed self-hosted configuration, use hosted fallback, repeat the no-backup
  rebuild and executable-principal audit, register and qualify the accepted runners, and restart both sample floors
  under the unchanged final configuration. If the corrected target remains unacceptable, retain hosted execution
  and deliberately deregister runners and close the paid allocation with approval.
- Reconcile the forward-looking operations runbook, record the settled permanent architecture in
  `TECHNICAL-OVERVIEW.md` only if self-hosting is accepted, and complete full work-unit verification against the
  resulting posture.

**Forward amendment — local booster evidence (2026-09-08):** consume the bounded Hyper-V feasibility result from
`local-ci-capacity-qualification` alongside the remote-fleet ledger. This WU retains the permanent route and fleet
disposition decision; do not repeat the local canary or absorb its implementation.

---
