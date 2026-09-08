# Exercise: Consume a Contradicted `withstood` Claim

Act as the primary at the post-pass comparison boundary owned by the shipped `validate-criteria` method. This is not a
new review pass: consume the already-returned fresh-pass report and decide what may be relayed or treated as evidence.

## Required reads

- `packages/arc-framework/arc/system/methods/adversarial-review.md`
- `packages/arc-framework/arc/system/methods/validate-criteria.md`
- `.arc/reference/briefs/AGENT-BRIEF.ARC.md`
- `.arc/reference/briefs/AGENT-BRIEF.PROJECT.md`
- `packages/arc-framework/__tests__/fixtures/adversarial-review/contradicted-withstood/source.ts`
- `packages/arc-framework/__tests__/fixtures/adversarial-review/contradicted-withstood/artifact.md`
- `packages/arc-framework/__tests__/fixtures/adversarial-review/contradicted-withstood/review-report.md`

Do not read `expected.md`, the active work-unit spec, task list, notes, or prior conversation. Inspect the source fixture
directly before deciding whether the supplied `withstood` entry may be relayed, credited as correctness, or used as
clearance. Do not edit files or invent provider, receipt, attestation, disposition, or convergence authority.

Return four concise fields:

```text
Source check: <what source establishes>
Withstood disposition: <relay, qualify, or reject, with reason>
Authority: <what the supplied report does and does not establish>
Recommended next step: <bounded action>
```

---
