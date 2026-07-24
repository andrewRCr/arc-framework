# Solution Proportionality Notes

## Behavioral acceptance cases

These cases apply `assess-design-proportionality` to existing planning evidence. They are read-only design
judgments, not runtime evaluation state.

### Review-surface binding before and after reduction

**Problem:** Provide exact-target local review, durable authoritative dispositions, and advisory frontline
execution without claiming host authority or local-operator tamper resistance.

**Pre-revision candidate — `revise`:** The earlier twelve-verb design carried four material findings:

- `disproportionate-rigor` at durable fix carry: a fix ledger, fix-phase verbs, and mid-fix recovery protected a
  retryable operation whose credible alternative is re-reviewing the new head.
- `unsupported-machinery` at local anti-tamper: sealed snapshots, durable run-binding lineage, and un-resettable
  pass counts addressed a trust boundary the problem explicitly leaves to hosted import.
- `unsupported-machinery` at the public command surface: fix-phase operations created solution-owned states
  beyond the local review, response/reduction, and frontline behaviors the problem requires.
- `disproportionate-rigor` at evidence persistence: evidence-grade storage for advisory records exceeded their
  authority; idempotent replay and re-run-as-recovery preserve the required behavior.

**Reduced candidate — `proportionate`:** The seven-verb design keeps exact identities, fail-closed parsing,
reachability-pinned source materialization, and evidence-grade disposition storage, but re-reviews fixes at their
new heads, treats local anti-tamper as a non-goal, and gives advisory records idempotent recovery. Every retained
mechanism traces to exact-target correctness or the authority of evidence consumed downstream. Evidence:
`draft-review-surface-binding.md` § Grooming status, § Proportionality posture, § Approved dispositions and the
fix path, and § Scope boundaries and downstream fit.

### Session locus before right-sizing remediation

**Problem:** Preserve session identity, safe transient cleanup, recoverable provisioning, and reliable destructive
teardown in a single-operator, machine-local domain.

**Pre-7.R candidate — `revise`:** Maximum exactness on routine operator paths produced material
`disproportionate-rigor` findings: a hard harness-capability refusal where an advisory suffices; host-proven
requested-work for non-destructive re-entry where an open change request plus warning preserves behavior; plan
digests, dispatch identities, and persisted lanes where re-confirmation is cheap; and cross-machine winner
arbitration where same-key or overlapping-member conflicts are sufficient. The revised candidate concentrates
full exactness on destructive paths while retaining the internal record locks, staged provisioning, transaction
core, process-token liveness, and teardown linearization whose failures can corrupt identity or delete live state.
Evidence: `notes-session-locus-model.md` § Right-sizing audit and `tasks-session-locus-model.md` Phase 7.R.

### Consequence-justified complex candidate

**Candidate — `proportionate`:** A design uses typed envelopes, fail-closed parsing, exact identities,
reachability-pinned immutable review input, append-only version-checked authoritative dispositions, and atomic
record replacement with scoped locking for destructive cleanup. The mechanisms jointly prevent reviewing the
wrong target, accepting malformed control input, mutating satisfying evidence, or deleting state still owned by a
live session. Those are concrete correctness, trust, compatibility, and data-loss consequences, so the result is
unchanged whether the project is new or mature and whether the team has one member or many.

### Smaller candidate below the adequacy floor

**Candidate — `revise`:** Replace exact review identities and pinned immutable input with the current mutable
checkout plus prose-carried target selection. Finding: `adequacy-regression` at review target acquisition. The
smaller design can evaluate a different head than the requested target and makes malformed or ambiguous target
input non-failing, losing the stated exact-target and fail-closed behavior. Its lower mechanism count therefore
does not make it a credible alternative.
