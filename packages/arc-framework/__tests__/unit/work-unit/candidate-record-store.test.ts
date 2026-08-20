/** Unit coverage for Candidate record persistence. */

import { describe, expect, it } from "vitest";

import { canonicalDigest } from "../../../src/lib/canonical/canonical-json.js";
import {
  createCandidateAttestation,
  createCandidateLineageAttestation,
  createCandidateSubjectSnapshot,
  type CandidateManagedRecordV1,
} from "../../../src/lib/work-unit/candidate-attestation.js";
import {
  readCandidateRecord,
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
    responses: [],
    lineageAttestations: [],
  };
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
    const changed = {
      ...record(),
      lineageAttestations: [createCandidateLineageAttestation({
        candidateId: record().attestation.candidateId,
        target: { revision: "b".repeat(40), subject: record().subject },
        attestedBy: "andrew",
        attestedAt: "2026-08-12T15:00:00.000Z",
        verificationEvidenceRef: "tasks-example.md#verification-2",
      })],
    };
    await writeCandidateRecord("/repo", "example", changed, observed.version, fs);

    await expect(writeCandidateRecord("/repo", "example", record(), observed.version, fs))
      .rejects.toBeInstanceOf(CandidateRecordVersionConflictError);
  });
});
