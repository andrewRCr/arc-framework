/** Unit coverage for Candidate record persistence. */

import { describe, expect, it } from "vitest";

import { canonicalDigest } from "../../../src/lib/canonical/canonical-json.js";
import {
  CandidateManagedRecordV1Schema,
  createCandidateAttestation,
  createCandidateLineageAttestation,
  createCandidateReviewResponseEvidence,
  createCandidateSubjectSnapshot,
  type CandidateManagedRecordV1,
} from "../../../src/lib/work-unit/candidate-attestation.js";
import {
  readCandidateRecord,
  readCandidateRecordVersion,
  readCandidateRecordVersioned,
  writeCandidateRecord,
  CandidateRecordVersionConflictError,
  type CandidateRecordStoreFs,
} from "../../../src/lib/work-unit/candidate-record-store.js";

function record(): CandidateManagedRecordV1 {
  const subject = createCandidateSubjectSnapshot([
    { path: "src/example.ts", mode: "100644", digest: canonicalDigest({ source: 1 }), treatment: "reviewable" },
  ]);
  return {
    schemaVersion: 1,
    semanticsVersion: "candidate-attestation/v1",
    attestation: createCandidateAttestation({
      workUnit: "example",
      subject,
      baseRevision: "a".repeat(40),
      attestedBy: "andrew",
      attestedAt: "2026-08-12T14:00:00.000Z",
      verificationEvidenceRef: "tasks-example.md#verification",
    }),
    subject,
    transitions: [],
    lineageAttestations: [],
  };
}

function recordWithLineage(
  scope: "focused" | "full",
  verificationEvidenceRef: string,
): CandidateManagedRecordV1 {
  const base = record();
  const changedSubject = createCandidateSubjectSnapshot([
    {
      path: "src/example.ts",
      mode: "100644",
      digest: canonicalDigest({ source: 2 }),
      treatment: "reviewable",
    },
  ]);
  const response = createCandidateReviewResponseEvidence({
    candidateId: base.attestation.candidateId,
    oldTarget: { revision: base.attestation.baseRevision, subject: base.subject },
    newTarget: { revision: "b".repeat(40), subject: changedSubject },
    dispositionId: canonicalDigest({ disposition: "focused" }),
    approvedBy: "andrew",
    appliedBy: "codex",
    applicability: "focused",
    approvedVerification: "focused",
    verificationEvidenceRefs: ["review://focused"],
    implementationChanged: true,
  });
  return CandidateManagedRecordV1Schema.parse({
    ...base,
    transitions: [response],
    lineageAttestations: [createCandidateLineageAttestation({
      candidateId: base.attestation.candidateId,
      responseId: response.responseId,
      target: response.newTarget,
      attestedBy: "andrew",
      attestedAt: "2026-08-12T15:00:00.000Z",
      verificationEvidenceRef,
      scope,
    })],
  });
}

function memoryFs(): CandidateRecordStoreFs {
  const files = new Map<string, string>();
  return {
    readFile: async (path) => {
      const content = files.get(path);
      if (content !== undefined) return content;
      throw Object.assign(new Error("missing"), { code: "ENOENT" });
    },
    writeFile: async (path, content) => { files.set(path, content); },
    withLock: async (_path, action) => action(),
  };
}

describe("Candidate record store", () => {
  it("distinguishes absence from a canonical persisted record", async () => {
    const fs = memoryFs();
    expect(await readCandidateRecord("/repo", "example", fs)).toBeNull();

    const path = await writeCandidateRecord("/repo", "example", record(), null, fs);

    expect(path).toBe(".arc/system/.internal/candidates/example.json");
    expect(await readCandidateRecord("/repo", "example", fs)).toEqual(record());
  });

  it("refuses a write whose exact read version is stale", async () => {
    const fs = memoryFs();
    await writeCandidateRecord("/repo", "example", record(), null, fs);
    const observed = await readCandidateRecordVersioned("/repo", "example", fs);
    const changed = recordWithLineage("full", "tasks-example.md#verification-2");
    await writeCandidateRecord("/repo", "example", changed, observed.version, fs);

    await expect(writeCandidateRecord("/repo", "example", record(), observed.version, fs))
      .rejects.toBeInstanceOf(CandidateRecordVersionConflictError);
  });

  it("versions lineage-attestation scope and evidence through canonical record bytes", async () => {
    const fs = memoryFs();
    const versions = [];
    let priorVersion: string | null = null;
    for (const next of [
      recordWithLineage("focused", "verification://focused"),
      recordWithLineage("full", "verification://focused"),
      recordWithLineage("full", "verification://full"),
    ]) {
      await writeCandidateRecord("/repo", "example", next, priorVersion, fs);
      priorVersion = await readCandidateRecordVersion("/repo", "example", fs);
      versions.push(priorVersion);
    }

    expect(new Set(versions).size).toBe(3);
  });

  it("reads the record bytes-version without requiring a valid managed record", async () => {
    const fs = memoryFs();
    await fs.writeFile("/repo/.arc/system/.internal/candidates/example.json", "{changed");

    await expect(readCandidateRecordVersion("/repo", "example", fs))
      .resolves.toMatch(/^sha256:[0-9a-f]{64}$/u);
    await expect(readCandidateRecordVersioned("/repo", "example", fs))
      .rejects.toThrow("Candidate record is malformed");
  });
});
