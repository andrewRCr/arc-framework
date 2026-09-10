/** Unit coverage for Candidate attestation and lineage currentness. */

import { describe, expect, it } from "vitest";

import { canonicalDigest } from "../../../src/lib/canonical/canonical-json.js";
import {
  CandidateManagedRecordV1Schema,
  createCandidateAttestation,
  createCandidateLineageAttestation,
  createCandidateReviewResponseEvidence,
  createCandidateSubjectSnapshot,
  createCandidateVerificationResponseEvidence,
  parseCandidateManagedRecord,
  projectCandidateCurrentness,
  serializeCandidateManagedRecord,
} from "../../../src/lib/work-unit/candidate-attestation.js";

const SHA_A = "a".repeat(40);
const SHA_B = "b".repeat(40);
const SHA_C = "c".repeat(40);
const SHA_D = "d".repeat(40);

function snapshot(sourceDigest = canonicalDigest({ source: "one" })) {
  return createCandidateSubjectSnapshot([
    { path: "packages/arc-framework/src/example.ts", mode: "100644", digest: sourceDigest, treatment: "reviewable" },
    { path: ".arc/active/meta-example.md", mode: "100644", digest: canonicalDigest({ handoff: 1 }), treatment: "evidence-neutral" },
    { path: ".arc/system/.internal/candidates/example.json", mode: "100644", digest: canonicalDigest({ candidate: 1 }), treatment: "evidence-neutral" },
  ]);
}

function attestation() {
  return createCandidateAttestation({
    workUnit: "example",
    subject: snapshot(),
    baseRevision: SHA_A,
    attestedBy: "andrew",
    attestedAt: "2026-08-12T12:00:00.000Z",
    verificationEvidenceRef: "verification://example/initial",
  });
}

describe("Candidate attestation", () => {
  it("rejects repository paths whose Unicode spelling is not NFC-normalized", () => {
    expect(() => createCandidateSubjectSnapshot([{
      path: "packages/cafe\u0301.ts",
      mode: "100644",
      digest: canonicalDigest({ source: "decomposed" }),
      treatment: "reviewable",
    }])).toThrow(/NFC-normalized/u);

    expect(createCandidateSubjectSnapshot([{
      path: "packages/caf\u00e9.ts",
      mode: "100644",
      digest: canonicalDigest({ source: "composed" }),
      treatment: "reviewable",
    }]).entries[0]?.path).toBe("packages/caf\u00e9.ts");
  });

  it("excludes evidence-neutral writes from the subject digest", () => {
    const initial = snapshot();
    const churned = createCandidateSubjectSnapshot([
      { ...initial.entries.find(({ treatment }) => treatment === "reviewable")! },
      { path: ".arc/active/meta-example.md", mode: "100644", digest: canonicalDigest({ handoff: 2 }), treatment: "evidence-neutral" },
      { path: ".arc/system/.internal/candidates/example.json", mode: "100644", digest: canonicalDigest({ candidate: 2 }), treatment: "evidence-neutral" },
    ]);

    expect(churned.subjectDigest).toBe(initial.subjectDigest);
    expect(snapshot(canonicalDigest({ source: "two" })).subjectDigest).not.toBe(initial.subjectDigest);
  });

  it("derives a stable Candidate identity from the attested evidence", () => {
    const first = attestation();
    const second = attestation();

    expect(first).toEqual(second);
    expect(first.candidateId).toMatch(/^sha256:[0-9a-f]{64}$/u);
    expect(CandidateManagedRecordV1Schema.safeParse({
      schemaVersion: 1,
      semanticsVersion: "candidate-attestation/v1",
      attestation: first,
      subject: snapshot(),
      transitions: [],
      lineageAttestations: [],
    }).success).toBe(true);
  });

  it("binds the superseded Candidate into the identity of the root that replaces it", () => {
    const superseded = attestation();
    const replacement = createCandidateAttestation({
      workUnit: "example",
      subject: snapshot(),
      baseRevision: SHA_A,
      attestedBy: "andrew",
      attestedAt: "2026-08-12T12:00:00.000Z",
      verificationEvidenceRef: "verification://example/initial",
      supersedes: superseded.candidateId,
    });

    expect(replacement.supersedes).toBe(superseded.candidateId);
    expect(replacement.candidateId).not.toBe(superseded.candidateId);
    expect(superseded.supersedes).toBeUndefined();
  });

  it("round-trips the managed record canonically and rejects unknown fields", () => {
    const record = {
      schemaVersion: 1 as const,
      semanticsVersion: "candidate-attestation/v1" as const,
      attestation: attestation(),
      subject: snapshot(),
      transitions: [],
      lineageAttestations: [],
    };

    expect(parseCandidateManagedRecord(serializeCandidateManagedRecord(record))).toEqual(record);
    expect(parseCandidateManagedRecord(JSON.stringify({ ...record, stale: true }))).toBeNull();
  });

  it("rejects internally inconsistent attestation and response evidence", () => {
    const root = attestation();
    const changed = snapshot(canonicalDigest({ source: "review-fix" }));
    const response = createCandidateReviewResponseEvidence({
      candidateId: root.candidateId,
      oldTarget: { revision: SHA_A, subject: snapshot() },
      newTarget: { revision: SHA_B, subject: changed },
      dispositionId: canonicalDigest({ dispositions: 1 }),
      approvedBy: "andrew",
      appliedBy: "codex",
      applicability: "focused",
      verificationEvidenceRefs: ["test://candidate/focused"],
      implementationChanged: true,
    });
    const record = {
      schemaVersion: 1 as const,
      semanticsVersion: "candidate-attestation/v1" as const,
      attestation: root,
      subject: snapshot(),
      transitions: [response],
      lineageAttestations: [],
    };

    expect(CandidateManagedRecordV1Schema.safeParse({
      ...record,
      attestation: { ...root, candidateId: canonicalDigest({ forged: "candidate" }) },
    }).success).toBe(false);
    expect(CandidateManagedRecordV1Schema.safeParse({
      ...record,
      transitions: [{ ...response, responseId: canonicalDigest({ forged: "response" }) }],
    }).success).toBe(false);
    expect(CandidateManagedRecordV1Schema.safeParse({
      ...record,
      transitions: [{ ...response, implementationChanged: false }],
    }).success).toBe(false);
    const inconsistentSubject = {
      ...changed,
      subjectDigest: canonicalDigest({ inconsistent: "subject" }),
    };
    const inconsistentResponse = createCandidateReviewResponseEvidence({
      candidateId: root.candidateId,
      oldTarget: { revision: SHA_A, subject: snapshot() },
      newTarget: { revision: SHA_B, subject: inconsistentSubject },
      dispositionId: canonicalDigest({ dispositions: 1 }),
      approvedBy: "andrew",
      appliedBy: "codex",
      applicability: "focused",
      verificationEvidenceRefs: ["test://candidate/focused"],
      implementationChanged: true,
    });
    expect(CandidateManagedRecordV1Schema.safeParse({
      ...record,
      transitions: [inconsistentResponse],
    }).success).toBe(false);
  });

  it("round-trips an optional approved verification scope and binds it to response identity", () => {
    const root = attestation();
    const common = {
      candidateId: root.candidateId,
      oldTarget: { revision: SHA_A, subject: snapshot() },
      newTarget: { revision: SHA_B, subject: snapshot(canonicalDigest({ source: "review-fix" })) },
      dispositionId: canonicalDigest({ dispositions: "scoped" }),
      approvedBy: "andrew",
      appliedBy: "codex",
      applicability: "focused" as const,
      verificationEvidenceRefs: ["test://candidate/scoped"],
      implementationChanged: true,
    };
    const omitted = createCandidateReviewResponseEvidence(common);
    const scoped = (["targeted", "focused", "full"] as const).map((approvedVerification) =>
      createCandidateReviewResponseEvidence({ ...common, approvedVerification }));

    expect(omitted).not.toHaveProperty("approvedVerification");
    expect(new Set([omitted.responseId, ...scoped.map(({ responseId }) => responseId)]).size).toBe(4);
    expect(scoped.map(({ approvedVerification }) => approvedVerification)).toEqual([
      "targeted",
      "focused",
      "full",
    ]);
    for (const transition of scoped) {
      const record = CandidateManagedRecordV1Schema.parse({
        schemaVersion: 1,
        semanticsVersion: "candidate-attestation/v1",
        attestation: root,
        subject: snapshot(),
        transitions: [transition],
        lineageAttestations: [],
      });
      expect(parseCandidateManagedRecord(serializeCandidateManagedRecord(record))).toEqual(record);
    }
    expect(CandidateManagedRecordV1Schema.safeParse({
      schemaVersion: 1,
      semanticsVersion: "candidate-attestation/v1",
      attestation: root,
      subject: snapshot(),
      transitions: [omitted],
      lineageAttestations: [],
    }).success).toBe(true);
    expect(() => createCandidateReviewResponseEvidence({
      ...common,
      approvedVerification: "broad" as never,
    })).toThrow();
  });

  it("retains convergence attestations for every recognized lineage subject", () => {
    const root = attestation();
    const firstSubject = snapshot(canonicalDigest({ source: "first-review-fix" }));
    const secondSubject = snapshot(canonicalDigest({ source: "second-review-fix" }));
    const firstResponse = createCandidateReviewResponseEvidence({
      candidateId: root.candidateId,
      oldTarget: { revision: SHA_A, subject: snapshot() },
      newTarget: { revision: SHA_B, subject: firstSubject },
      dispositionId: canonicalDigest({ dispositions: 1 }),
      approvedBy: "andrew",
      appliedBy: "codex",
      applicability: "focused",
      verificationEvidenceRefs: ["test://candidate/first-fix"],
      implementationChanged: true,
    });
    const secondResponse = createCandidateReviewResponseEvidence({
      candidateId: root.candidateId,
      oldTarget: firstResponse.newTarget,
      newTarget: { revision: SHA_C, subject: secondSubject },
      dispositionId: canonicalDigest({ dispositions: 2 }),
      approvedBy: "andrew",
      appliedBy: "codex",
      applicability: "focused",
      verificationEvidenceRefs: ["test://candidate/second-fix"],
      implementationChanged: true,
    });
    const convergence = [firstResponse, secondResponse].map((response, index) =>
      createCandidateLineageAttestation({
        candidateId: root.candidateId,
        target: index === 0
          ? {
              revision: response.newTarget.revision,
              subject: createCandidateSubjectSnapshot(response.newTarget.subject.entries.map((entry) =>
                entry.treatment === "reviewable"
                  ? entry
                  : { ...entry, digest: canonicalDigest({ operationalAdvance: entry.path }) })),
            }
          : response.newTarget,
        attestedBy: "andrew",
        attestedAt: `2026-08-12T1${index + 3}:00:00.000Z`,
        verificationEvidenceRef: `verification://example/converged-${index + 1}`,
        scope: "full",
      }));

    expect(convergence[0]?.target.subject).not.toEqual(firstResponse.newTarget.subject);
    expect(convergence[0]?.target.subject.subjectDigest).toBe(firstResponse.newTarget.subject.subjectDigest);

    expect(CandidateManagedRecordV1Schema.safeParse({
      schemaVersion: 1,
      semanticsVersion: "candidate-attestation/v1",
      attestation: root,
      subject: snapshot(),
      transitions: [firstResponse, secondResponse],
      lineageAttestations: convergence,
    }).success).toBe(true);
  });
});

describe("Candidate lineage currentness", () => {
  it("stores either review-applicability choice without changing the durable Candidate target", () => {
    const root = attestation();
    const selector = {
      schemaVersion: 1,
      repositoryId: "repository-1",
      repository: "owner/repository",
      pullRequest: 42,
      lane: "standard",
      sourceId: "codex-pr",
      priorAttemptId: "attempt-prior",
      priorHead: SHA_A,
      currentHead: SHA_B,
      priorBase: SHA_C,
      currentBase: SHA_D,
    };
    for (const choice of ["covered", "review-required"] as const) {
      const record = CandidateManagedRecordV1Schema.parse({
        schemaVersion: 1,
        semanticsVersion: "candidate-attestation/v1",
        attestation: root,
        subject: snapshot(),
        transitions: [{
          transitionKind: "review-applicability-selection",
          schemaVersion: 1,
          semanticsVersion: "candidate-attestation/v1",
          candidateId: root.candidateId,
          selector,
          projectionDigest: canonicalDigest({ projection: "review" }),
          residualDigest: canonicalDigest({ residual: "review" }),
          selectedBy: "andrew",
          selectedAt: "2026-08-23T12:00:00.000Z",
          choice,
        }],
        lineageAttestations: [],
      });

      expect(projectCandidateCurrentness({
        record,
        current: { revision: SHA_A, subject: snapshot() },
      })).toMatchObject({ status: "current", recognizedRevision: SHA_A });
    }
  });

  it("advances the durable baseline through an exact covered applicability selection", () => {
    const root = attestation();
    const carried = snapshot(canonicalDigest({ source: "covered-base-carry" }));

    const parsed = CandidateManagedRecordV1Schema.safeParse({
      schemaVersion: 1,
      semanticsVersion: "candidate-attestation/v1",
      attestation: root,
      subject: snapshot(),
      transitions: [{
        transitionKind: "applicability-selection",
        schemaVersion: 1,
        semanticsVersion: "candidate-attestation/v1",
        candidateId: root.candidateId,
        priorTarget: { revision: SHA_A, subject: snapshot() },
        currentTarget: { revision: SHA_B, subject: carried },
        projectionDigest: canonicalDigest({ projection: "covered" }),
        residualDigest: canonicalDigest({ residual: "covered" }),
        selectedBy: "andrew",
        choice: "covered",
      }],
      lineageAttestations: [],
    });

    expect(parsed.success).toBe(true);
    if (!parsed.success) throw new Error("expected a valid Candidate transition record");
    expect(projectCandidateCurrentness({
      record: parsed.data,
      current: { revision: SHA_B, subject: carried },
    })).toMatchObject({
      status: "current",
      recognizedRevision: SHA_B,
      convergenceVerification: "satisfied",
    });
  });

  it("requires completed targeted evidence in the targeted applicability transition", () => {
    const root = attestation();
    const common = {
      transitionKind: "applicability-selection",
      schemaVersion: 1,
      semanticsVersion: "candidate-attestation/v1",
      candidateId: root.candidateId,
      priorTarget: { revision: SHA_A, subject: snapshot() },
      currentTarget: { revision: SHA_B, subject: snapshot(canonicalDigest({ source: "targeted" })) },
      projectionDigest: canonicalDigest({ projection: "targeted" }),
      residualDigest: canonicalDigest({ residual: "targeted" }),
      selectedBy: "andrew",
      choice: "targeted-check",
    };
    const record = {
      schemaVersion: 1,
      semanticsVersion: "candidate-attestation/v1",
      attestation: root,
      subject: snapshot(),
      lineageAttestations: [],
    };

    expect(CandidateManagedRecordV1Schema.safeParse({ ...record, transitions: [common] }).success).toBe(false);
    expect(CandidateManagedRecordV1Schema.safeParse({
      ...record,
      transitions: [{ ...common, targetedEvidenceRef: "verification://targeted-carry" }],
    }).success).toBe(true);
  });

  it("records changed without advancing the durable Candidate target", () => {
    const root = attestation();
    const changed = snapshot(canonicalDigest({ source: "selected-changed" }));
    const record = CandidateManagedRecordV1Schema.parse({
      schemaVersion: 1,
      semanticsVersion: "candidate-attestation/v1",
      attestation: root,
      subject: snapshot(),
      transitions: [{
        transitionKind: "applicability-selection",
        schemaVersion: 1,
        semanticsVersion: "candidate-attestation/v1",
        candidateId: root.candidateId,
        priorTarget: { revision: SHA_A, subject: snapshot() },
        currentTarget: { revision: SHA_B, subject: changed },
        projectionDigest: canonicalDigest({ projection: "changed" }),
        residualDigest: canonicalDigest({ residual: "changed" }),
        selectedBy: "andrew",
        choice: "changed",
      }],
      lineageAttestations: [],
    });

    expect(projectCandidateCurrentness({
      record,
      current: { revision: SHA_B, subject: changed },
    })).toMatchObject({ status: "blocked", recognizedRevision: SHA_A, currentRevision: SHA_B });
  });

  it("replays a response after an ephemeral carry and a later applicability selection", () => {
    const root = attestation();
    const carried = snapshot(canonicalDigest({ source: "machine-carried" }));
    const reviewed = snapshot(canonicalDigest({ source: "reviewed-fix" }));
    const final = snapshot(canonicalDigest({ source: "later-selection" }));
    const response = createCandidateReviewResponseEvidence({
      candidateId: root.candidateId,
      oldTarget: { revision: SHA_B, subject: carried },
      newTarget: { revision: SHA_C, subject: reviewed },
      dispositionId: canonicalDigest({ dispositions: "after-machine-carry" }),
      approvedBy: "andrew",
      appliedBy: "codex",
      applicability: "focused",
      verificationEvidenceRefs: ["verification://reviewed-fix"],
      implementationChanged: true,
    });
    const record = CandidateManagedRecordV1Schema.parse({
      schemaVersion: 1,
      semanticsVersion: "candidate-attestation/v1",
      attestation: root,
      subject: snapshot(),
      transitions: [response, {
        transitionKind: "applicability-selection",
        schemaVersion: 1,
        semanticsVersion: "candidate-attestation/v1",
        candidateId: root.candidateId,
        priorTarget: { revision: SHA_C, subject: reviewed },
        currentTarget: { revision: SHA_D, subject: final },
        projectionDigest: canonicalDigest({ projection: "after-response" }),
        residualDigest: canonicalDigest({ residual: "after-response" }),
        selectedBy: "andrew",
        choice: "covered",
      }],
      lineageAttestations: [],
    });

    expect(projectCandidateCurrentness({
      record,
      current: { revision: SHA_D, subject: final },
    })).toMatchObject({
      status: "current",
      recognizedRevision: SHA_D,
      implementationChanged: true,
      convergenceVerification: "pending",
    });
  });

  it("records focused and full verification distinctly over one recognized lineage head", () => {
    const root = attestation();
    const target = { revision: SHA_B, subject: snapshot(canonicalDigest({ source: "review-fix" })) };

    for (const scope of ["focused", "full"] as const) {
      expect(createCandidateLineageAttestation({
        candidateId: root.candidateId,
        target,
        attestedBy: "andrew",
        attestedAt: "2026-08-12T13:00:00.000Z",
        verificationEvidenceRef: "verification://example/converged",
        scope,
      })).toEqual({
        schemaVersion: 1,
        semanticsVersion: "candidate-attestation/v1",
        candidateId: root.candidateId,
        target,
        attestedBy: "andrew",
        attestedAt: "2026-08-12T13:00:00.000Z",
        verificationEvidenceRef: "verification://example/converged",
        scope,
      });
    }
    expect(() => createCandidateLineageAttestation({
      candidateId: root.candidateId,
      target,
      attestedBy: "andrew",
      attestedAt: "2026-08-12T13:00:00.000Z",
      verificationEvidenceRef: "verification://example/converged",
    } as never)).toThrow();
  });

  it("rejects lineage attestations narrower than the approved scope at their subject", () => {
    const root = attestation();
    const changed = snapshot(canonicalDigest({ source: "review-fix" }));
    const response = createCandidateReviewResponseEvidence({
      candidateId: root.candidateId,
      oldTarget: { revision: SHA_A, subject: snapshot() },
      newTarget: { revision: SHA_B, subject: changed },
      dispositionId: canonicalDigest({ dispositions: "approved-full" }),
      approvedBy: "andrew",
      appliedBy: "codex",
      applicability: "full",
      approvedVerification: "full",
      verificationEvidenceRefs: ["test://candidate/full"],
      implementationChanged: true,
    });
    const makeRecord = (scope: "focused" | "full") => ({
      schemaVersion: 1 as const,
      semanticsVersion: "candidate-attestation/v1" as const,
      attestation: root,
      subject: snapshot(),
      transitions: [response],
      lineageAttestations: [createCandidateLineageAttestation({
        candidateId: root.candidateId,
        target: response.newTarget,
        attestedBy: "andrew",
        attestedAt: "2026-08-12T13:00:00.000Z",
        verificationEvidenceRef: `verification://example/${scope}`,
        scope,
      })],
    });

    expect(CandidateManagedRecordV1Schema.safeParse(makeRecord("focused")).success).toBe(false);
    expect(CandidateManagedRecordV1Schema.safeParse(makeRecord("full")).success).toBe(true);

    const focusedResponse = createCandidateReviewResponseEvidence({
      ...response,
      approvedVerification: "focused",
      dispositionId: canonicalDigest({ dispositions: "approved-focused" }),
    });
    expect(CandidateManagedRecordV1Schema.safeParse({
      ...makeRecord("full"),
      transitions: [focusedResponse],
      lineageAttestations: [{ ...makeRecord("full").lineageAttestations[0]!, target: focusedResponse.newTarget }],
    }).success).toBe(true);
  });

  it("advances through an approved review response and retains verification applicability", () => {
    const root = attestation();
    const changed = snapshot(canonicalDigest({ source: "review-fix" }));
    const response = createCandidateReviewResponseEvidence({
      candidateId: root.candidateId,
      oldTarget: { revision: SHA_A, subject: snapshot() },
      newTarget: { revision: SHA_B, subject: changed },
      dispositionId: canonicalDigest({ dispositions: 1 }),
      approvedBy: "andrew",
      appliedBy: "codex",
      applicability: "focused",
      verificationEvidenceRefs: ["test://candidate/focused"],
      implementationChanged: true,
    });
    const current = projectCandidateCurrentness({
      record: {
        schemaVersion: 1,
        semanticsVersion: "candidate-attestation/v1",
        attestation: root,
        subject: snapshot(),
        transitions: [response],
        lineageAttestations: [],
      },
      current: { revision: SHA_B, subject: changed },
    });

    expect(current).toMatchObject({
      status: "current",
      candidateId: root.candidateId,
      recognizedRevision: SHA_B,
      implementationChanged: true,
      convergenceVerification: "pending",
    });
    expect(response).toMatchObject({ applicability: "focused", verificationEvidenceRefs: ["test://candidate/focused"] });
  });

  it("advances through a scoped verification response without reopening convergence", () => {
    const root = attestation();
    const changed = snapshot(canonicalDigest({ source: "delivery-review-fix" }));
    const response = createCandidateVerificationResponseEvidence({
      candidateId: root.candidateId,
      oldTarget: { revision: SHA_A, subject: snapshot() },
      newTarget: { revision: SHA_B, subject: changed },
      authorityRef: canonicalDigest({ continuation: "delivery-review-fix" }),
      verifiedBy: "andrew",
      verifiedAt: "2026-08-31T12:00:00.000Z",
      applicability: "focused",
      verificationEvidenceRefs: [
        "criteria://delivery/member-1",
        "gates://tier-1/current-top",
      ],
      implementationChanged: true,
    });
    const record = CandidateManagedRecordV1Schema.parse({
      schemaVersion: 1,
      semanticsVersion: "candidate-attestation/v1",
      attestation: root,
      subject: snapshot(),
      transitions: [response],
      lineageAttestations: [],
    });

    expect(response).toMatchObject({
      transitionKind: "verification-response",
      authorityRef: canonicalDigest({ continuation: "delivery-review-fix" }),
      applicability: "focused",
    });
    expect(projectCandidateCurrentness({
      record,
      current: { revision: SHA_B, subject: changed },
    })).toMatchObject({
      status: "current",
      recognizedRevision: SHA_B,
      implementationChanged: true,
      convergenceVerification: "satisfied",
    });
  });

  it("preserves Candidate across operational-only churn", () => {
    const root = attestation();
    const current = createCandidateSubjectSnapshot([
      { ...snapshot().entries.find(({ treatment }) => treatment === "reviewable")! },
      { path: ".arc/active/meta-example.md", mode: "100644", digest: canonicalDigest({ handoff: 99 }), treatment: "evidence-neutral" },
    ]);

    expect(projectCandidateCurrentness({
      record: {
        schemaVersion: 1,
        semanticsVersion: "candidate-attestation/v1",
        attestation: root,
        subject: snapshot(),
        transitions: [],
        lineageAttestations: [],
      },
      current: { revision: SHA_C, subject: current },
    })).toMatchObject({ status: "current", recognizedRevision: SHA_C, convergenceVerification: "satisfied" });
  });

  it("lets an exact response target bridge an unrecorded operational-only revision", () => {
    const root = attestation();
    const changed = snapshot(canonicalDigest({ source: "review-fix-after-handoff" }));
    const response = createCandidateReviewResponseEvidence({
      candidateId: root.candidateId,
      oldTarget: { revision: SHA_B, subject: snapshot() },
      newTarget: { revision: SHA_C, subject: changed },
      dispositionId: canonicalDigest({ dispositions: 2 }),
      approvedBy: "andrew",
      appliedBy: "codex",
      applicability: "targeted",
      verificationEvidenceRefs: ["test://candidate/targeted"],
      implementationChanged: true,
    });

    expect(projectCandidateCurrentness({
      record: {
        schemaVersion: 1,
        semanticsVersion: "candidate-attestation/v1",
        attestation: root,
        subject: snapshot(),
        transitions: [response],
        lineageAttestations: [],
      },
      current: { revision: SHA_C, subject: changed },
    })).toMatchObject({
      status: "current",
      recognizedRevision: SHA_C,
      convergenceVerification: "pending",
    });
  });

  it("blocks an unexplained reviewable delta with its exact path delta and one recovery action", () => {
    const root = attestation();
    const changed = snapshot(canonicalDigest({ source: "unexplained" }));

    expect(projectCandidateCurrentness({
      record: {
        schemaVersion: 1,
        semanticsVersion: "candidate-attestation/v1",
        attestation: root,
        subject: snapshot(),
        transitions: [],
        lineageAttestations: [],
      },
      current: { revision: SHA_B, subject: changed },
    })).toEqual({
      status: "blocked",
      candidateId: root.candidateId,
      recognizedRevision: SHA_A,
      currentRevision: SHA_B,
      delta: {
        added: [],
        removed: [],
        changed: ["packages/arc-framework/src/example.ts"],
      },
      nextAction: "Run full work-unit verification to establish a new Candidate lineage root.",
    });
  });
});
