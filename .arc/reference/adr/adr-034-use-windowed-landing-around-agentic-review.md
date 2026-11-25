# ADR-034: Use Windowed Landing Around Agentic Review

## Status

Accepted (2026-08-24).

## Context

ARC treats agentic review as the primary review lane. Human review complements it: teams may run a separate human
lane, while a solo owner supplies triage, authority over finding dispositions, accepted risk, and the final
integration decision. Review output remains evidence for those decisions rather than autonomous merge authority.
The [Integration Strategy] carries the operating doctrine this record explains.

An ordered delivery creates a timing choice inside that posture. Independently ready members can either land as soon
as their boundary review clears or remain open until one post-publication landing window. Provider-native stacks
typically favor land-as-you-go because it pipelines human review and moves completed value to the protected base
early.

Four forces make a narrow divergence worthwhile for ARC's current operating model:

- **Amendment freedom.** Before landing, the unlanded suffix can be re-described or re-cut under the delivery plan's
  amendment rules. After a member lands, re-description is no longer safe and an ordinary adjustment becomes public
  fix-forward work.
- **Review latency.** Agent reviewers usually return in minutes rather than the days common to human-only queues, so
  early landing captures little of the pipelining payoff that motivates the industry norm.
- **Restack churn.** A predecessor rewrite can move every descendant head. Exact-head review and applicability must
  then be revisited, so landing while the suffix is still changing can multiply review work without changing the
  contribution being reviewed.
- **Native machinery maturity.** Stack registration, refresh, review applicability, and landing recovery are still
  easier to supervise as one bounded window than as a long-lived stream of partially landed state.

The considered alternative is **land as each member becomes ready**. It shortens time-to-base and follows provider
idiom, but gives up amendment freedom earlier and exposes more of the suffix to restack-driven review churn. The
chosen window retains incremental member review and checks; it batches only the merge acts.

## Decision

We will make agentic review the primary lane and land ordered delivery members in one bottom-up, post-publication
window.

1. Every member remains independently reviewable at an exact head. Agentic review runs first; human review may
   complement it as another lane or through finding triage, disposition authority, and final integration authority.
2. Member review and checks settle incrementally, but merge acts wait for the `Integrating` window. Non-terminal
   members land bottom-up, and the top work-unit change request is the ordinary terminal integration vehicle.
3. The integration interlock remains the sole merge authority. The terminal checkpoint freshly composes the
   attested union, exactly bound landed members, terminal residual, current target, and member-review conjunction.
4. Native stack registration uses the host's raw API through a typed, fail-closed adapter rather than
   silently-repairing porcelain. This is a worked instance of the same posture, not an independent architectural
   decision: exact authority surfaces are preferred where convenience commands can mutate or repair beyond the
   requested effect.

## Consequences

### Positive

- Delivery plans retain amendment and re-cut freedom until the bounded landing window.
- Fast agent-review turnaround is used without paying for a speculative merge pipeline whose latency benefit is
  small in this operating model.
- Restack and refresh movement settles before most merge acts, reducing repeated exact-head review churn.
- The terminal merge retains the ordinary work-unit interlock and change request instead of creating a separate
  delivery authority.

### Negative

- Ready non-terminal members remain unmerged longer than provider-native land-as-you-go practice would require.
- The landing window concentrates several attended merge decisions and recovery checks near the end of the work
  unit.
- Teams with slow or heavily human review lanes may receive less value from review pipelining than their provider
  could otherwise offer.
- Raw host APIs demand a narrow maintained adapter and explicit compatibility failures where porcelain might have
  repaired state automatically.

### Reopening Conditions

- Reconsider windowed timing when field use shows that late-batched hosted review repeatedly produces rework that
  boundary-time landing would have prevented.
- Reconsider terminal authorization composition when field evidence shows that residual-overlap re-verification or
  the delivery checkpoint arm dominates the window ceremony. Any remedy that carries structural equivalence into
  the attestation lineage changes authority semantics and requires an explicit amendment or superseding decision.

## Amending This Document

<!-- Reserved for post-implementation learnings per the three-tier amendment model
     (strategy-adr-methodology.md). Append dated annotations as `**Amendment (YYYY-MM-DD):** …`. -->

**Amendment (2026-09-10):** Disposition-set approval authorizes the verification scope for an approved fix; a later
lineage attestation must bind fresh evidence at least as broad as that scope before convergence advances. The
Candidate root attestation and its subject-digest applicability remain unchanged.

---

[Integration Strategy]: ../strategies/arc/strategy-integration.md
