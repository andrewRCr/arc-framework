# Scenario: Native-Labeled Unsupported Producer Finding

- Activity: local producer response proposal over one exact durable finding.
- Native finding label: `N-7`.
- Capture ordinal: `1`.
- Source locus: `src/index.ts:7`.
- Source evidence: `review:finding-1`.
- Reviewer judgment: `major` — the branch at the cited locus allegedly enters a failing execution path.
- ARC source check: `source:src/index.ts:7` shows the branch is unreachable, so no execution failure occurs and the
  finding is `not-supported` with `verifiedSeverity: null`.
- Proposed disposition: `reject`, record-only.
- Proposed verification: `full`.
- Open question: should the reviewer clarify the cited execution path?

The real response-command proposal run returned this report, and approval plus approved replay returned the same
report bytes:

```text
Verification: full

Finding F1: The reviewer alleges this branch enters a failing path, but source verification shows it is unreachable, so no execution failure occurs. · Locus: src/index\.ts:7
Source: N\-7 · source #1 · review:finding\-1
Assessment: NOT SUPPORTED · no ARC severity (ARC) · major (reviewer)
Recommendation: REJECT [record-only] — Reject the finding without changing code.
Open questions: Should the reviewer clarify the cited execution path?
```

Assess this as a proposed complete-set approval surface. Do not invent operator approval.
