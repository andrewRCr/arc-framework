/** Unit coverage for Candidate attestation and lineage currentness. */

import { describe, expect, it } from "vitest";

import { canonicalDigest } from "../../../src/lib/canonical/canonical-json.js";
import {
  CandidateManagedRecordV1Schema,
  createCandidateAttestation,
  createCandidateReviewResponseEvidence,
  createCandidateSubjectSnapshot,
  parseCandidateManagedRecord,
  projectCandidateCurrentness,
  serializeCandidateManagedRecord,
} from "../../../src/lib/work-unit/candidate-attestation.js";

const SHA_A = "a".repeat(40);
const SHA_B = "b".repeat(40);
const SHA_C = "c".repeat(40);

function snapshot(sourceDigest = canonicalDigest({ source: "one" })) {
  return createCandidateSubjectSnapshot([
    { path: "packages/arc-framework/src/example.ts", digest: sourceDigest, treatment: "reviewable" },
    { path: ".arc/active/meta-example.md", digest: canonicalDigest({ handoff: 1 }), treatment: "operational" },
    { path: ".arc/system/.internal/candidates/example.json", digest: canonicalDigest({ candidate: 1 }), treatment: "candidate-projection" },
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
  it("excludes operational and Candidate-projection writes from the subject digest", () => {
    const initial = snapshot();
    const churned = createCandidateSubjectSnapshot([
      { ...initial.entries.find(({ treatment }) => treatment === "reviewable")! },
      { path: ".arc/active/meta-example.md", digest: canonicalDigest({ handoff: 2 }), treatment: "operational" },
      { path: ".arc/system/.internal/candidates/example.json", digest: canonicalDigest({ candidate: 2 }), treatment: "candidate-projection" },
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
      responses: [],
    }).success).toBe(true);
  });

  it("round-trips the managed record canonically and rejects unknown fields", () => {
    const record = {
      schemaVersion: 1 as const,
      semanticsVersion: "candidate-attestation/v1" as const,
      attestation: attestation(),
      subject: snapshot(),
      responses: [],
    };

    expect(parseCandidateManagedRecord(serializeCandidateManagedRecord(record))).toEqual(record);
    expect(parseCandidateManagedRecord(JSON.stringify({ ...record, stale: true }))).toBeNull();
  });
});

describe("Candidate lineage currentness", () => {
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
        responses: [response],
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

  it("preserves Candidate across operational-only churn", () => {
    const root = attestation();
    const current = createCandidateSubjectSnapshot([
      { ...snapshot().entries.find(({ treatment }) => treatment === "reviewable")! },
      { path: ".arc/active/meta-example.md", digest: canonicalDigest({ handoff: 99 }), treatment: "operational" },
    ]);

    expect(projectCandidateCurrentness({
      record: {
        schemaVersion: 1,
        semanticsVersion: "candidate-attestation/v1",
        attestation: root,
        subject: snapshot(),
        responses: [],
      },
      current: { revision: SHA_C, subject: current },
    })).toMatchObject({ status: "current", recognizedRevision: SHA_C, convergenceVerification: "satisfied" });
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
        responses: [],
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
