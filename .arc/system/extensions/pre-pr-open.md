---
name: pre-pr-open
description: Retry-safe actions immediately before opening a change request
active: true
---

# Extension: pre-pr-open

> - **Workflows:** [integrate-work-unit.md][integrate-work-unit], [run-errand.md][run-errand]
> - **Fires:** After the head is pushed and immediately before creating a change request; skipped when one is open.
>
> - **Input:** `proposedChangeRequest = { repositoryRef, baseRef, headRef, headSha }`. Callers supply these opaque
>   coordinates; host adapters validate and convert them. The extension does not infer branch or work-unit state.
>
> - **Contract:** Execute numbered actions in authored order and halt before later actions when one fails. Actions are
>   retry-safe because creation can fail after they run. The contract is platform-neutral and assumes no relationship
>   between work units and change-request cardinality.

## pre-pr-open.actions

1. **Gate on change kind.** Classify the change-request diff with the canonical classifier:

   ```bash
   git diff --name-only -z {baseRef}...{headRef} | bash scripts/classify-change.sh classify --stdin0
   ```

   `light` (docs-only) → skip the remaining actions and open the change request with no frontline review.
   `heavy` (code) → continue.

2. **Run the local CodeRabbit CLI frontline review** over the aggregate branch diff:

   ```bash
   coderabbit review --plain --base {baseRef}
   ```

   Plain output is non-interactive; use `--agent` when structured findings serve better. Pool caution: CLI
   reviews meter per developer (5/hour on Pro), so a same-hour errand sweep can brush the limit — on a
   rate-limit refusal, surface it and continue to action 3 with whatever findings exist (or none); the
   frontline never blocks change-request creation.

3. **Triage with the disposition guard.** Process findings per the `review-triage` method, with two
   requirements carried here until the shipped contract subsumes them:

   - **Verify each finding against source with your own judgment** — findings are advisory input, never
     accepted on reviewer authority (DEV-RULES.ARC § Sub-agent scope: delegated outputs are advisory until
     verified).
   - **Present the disposition report to the user for approval before applying any fixes** — per-finding
     classification (FIX NOW / MINOR FIX / DEFER / REJECT), recommendation, and open questions, so the user
     can redirect first. Never auto-accept-and-fix.

   Approved fixes land as a follow-up push before creation proceeds (this fire point runs on an
   already-pushed head; frontline-scale diffs keep that cheap).

4. **Carry the frontline result into the PR-review decision.** The external PR-review trigger stays manual:
   report the frontline outcome — clean, nits-only, or the finding summary — so the operator can skip,
   defer, or request the CodeRabbit PR review informed. A clean or nits-only frontline is the standing
   signal to not spend a metered PR review.

---

[integrate-work-unit]: ../workflows/arc/work-unit-lifecycle/integrate-work-unit.md
[run-errand]: ../workflows/arc/supplemental/run-errand.md
