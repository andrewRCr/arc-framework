# Scenario: Native-Labeled Unsupported Producer Finding

- Activity: local producer response proposal over one exact durable finding.
- Native finding label: `N-7`.
- Capture ordinal: `1`.
- Source locus: `src/index.ts:7`.
- Source evidence: `review:finding-1`.
- Reviewer judgment: `major` — the branch at the cited locus allegedly enters a failing execution path.
- Authored title and issue: "Failing path at the cited branch"; the reviewer alleges the branch at this locus enters
  a failing execution path.
- ARC source check: `source:src/index.ts:7` shows the branch is unreachable, so no execution failure occurs and the
  finding is `not-supported` with `verifiedSeverity: null`.
- Proposed disposition: `reject`, record-only.
- Proposed verification: `full`.
- Rubric anchor: `none — the cited branch is unreachable`.
- Open question: should the reviewer clarify the cited execution path?
- Successor recommendation: do not request another standard pass from this unsupported finding; request a named next
  pass only if it identifies a new expected signal worth the reviewer cost.

The first response-command invocation carried `proposal.severityGatingPolicy: { minorGating: "record-only" }`.
The command used it to derive the canonical finding's `gating: "record-only"`; the input-only policy object is not
repeated in the returned `payload.proposal`.

The command is at `state: awaiting-approval`, `nextAction: obtain-approval`, with operation ID
`review-operation-1`. Its `payload.proposal` is the following complete typed proposal for this fixture. The
`dispositionSetId` is computed from these exact fields, including the one canonical finding and `full` verification:

```json
{
  "schemaVersion": 2,
  "semanticsVersion": "review-gate/v2",
  "state": "proposed",
  "dispositionSet": {
    "schemaVersion": 2,
    "semanticsVersion": "review-gate/v2",
    "targetId": "sha256:42c74bbddbfc8b3c55de5fb86ecf2de6dc77555383f228c80223adfa08e4f3af",
    "producerId": "producer-1",
    "resultDigest": "sha256:f3505308b472f6bc9fd5053d3c5e90579f10e812f8ed697fedbcc257921b94f9",
    "policyVersion": "sha256:9ec3d4ffa9e7b313578a25b17dc8f3e3fa7a3744c701e323e25465fff1ae0b24",
    "rubricVersion": "standard-review/v1",
    "rubricDigest": "sha256:23f5952367a60e397acddeb314eb7c51469ef3278c879747413442e02e471e47",
    "proposedBy": "arc-cli/0.1.0",
    "proposedVerification": "full",
    "findings": [
      {
        "findingId": "finding-1",
        "sourceIdentity": "reviewer-1",
        "locus": "src/index.ts:7",
        "verificationRefs": ["source:src/index.ts:7"],
        "reportedSeverity": "major",
        "sourceVerification": "not-supported",
        "verifiedSeverity": null,
        "disposition": "reject",
        "gating": "record-only",
        "title": "Failing path at the cited branch",
        "issue": "The reviewer alleges the branch at this locus enters a failing execution path.",
        "rationale": "The reviewer alleges this branch enters a failing path, but source verification shows it is unreachable, so no execution failure occurs.",
        "recommendation": "Reject the finding without changing code.",
        "openQuestions": ["Should the reviewer clarify the cited execution path?"]
      }
    ],
    "dispositionSetId": "sha256:80e5fe487bfd357a881e97997f39b369c3f95c00d0dcf3bedbeb9fc6c90b7568"
  }
}
```

The command's `payload.dispositionReportText` is exactly these bytes:

```text
**Standard complete pass 1 of 2** · 1 not supported

### F1 — Failing path at the cited branch

— · Not supported · reviewer graded 🟠 major · REJECT · none — the cited branch is unreachable

**Finding:** The reviewer alleges the branch at this locus enters a failing execution path.

**Action:** Reject the finding without changing code.

**Detail:** The reviewer alleges this branch enters a failing path, but source verification shows it is unreachable, so no execution failure occurs.

---

**Decisions**
- Next: Do not request another standard pass from this unsupported finding; request a named next pass only if it identifies a new expected signal worth the reviewer cost.
- F1: Should the reviewer clarify the cited execution path?

Approve: 1 reject?
```

Its `payload.dispositionEvidenceText`, held back from the report and shown when the approver asks, is exactly:

```text
**Evidence**
- F1 · src/index.ts:7 · N-7 · source #1 · review:finding-1 · verified at source:src/index.ts:7
```

The same command payload supplies this provisional pass line:

```text
Standard complete pass 1 of 2. No confirmed findings.
```

Assess the combined report, typed proposal, and pass line as the proposed complete-set approval surface. Do not invent
operator approval.
