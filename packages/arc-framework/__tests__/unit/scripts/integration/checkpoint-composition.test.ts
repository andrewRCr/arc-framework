import { describe, expect, it } from "vitest";

import {
  checkpointBaseIsAccepted,
  createCheckpointCandidateContext,
} from "../../../../src/scripts/integration/checkpoint-composition.js";

const oid = (character: string): string => character.repeat(40);

describe("integration checkpoint composition", () => {
  it("shares one managed Candidate record across classification and downstream projection", async () => {
    let reads = 0;
    const record = { attestation: { candidateId: "candidate" } } as never;
    const context = createCheckpointCandidateContext({
      readRecord: async () => {
        reads += 1;
        return { record, version: "version-1" };
      },
      readVersion: async () => "version-1",
      project: async ({ baseRevision }) => ({
        effective: {
          state: "unavailable",
          candidateId: "candidate",
          reason: "target-unavailable",
          detail: baseRevision,
        } as never,
        currentness: { state: "unavailable", reason: "target-unavailable", detail: baseRevision } as never,
      }),
    });

    const managed = await context.readRecord("example");
    const effective = await context.readEffective("example", oid("a"));

    expect(managed.version).toBe("version-1");
    expect(effective?.recordVersion).toBe(managed.version);
    expect(reads).toBe(1);
  });

  it("projects distinct authoritative Candidate bases independently", async () => {
    const projectedBases: string[] = [];
    const context = createCheckpointCandidateContext({
      readRecord: async () => ({
        record: { attestation: { candidateId: "candidate" } } as never,
        version: "version-1",
      }),
      readVersion: async () => "version-1",
      project: async ({ baseRevision }) => {
        projectedBases.push(baseRevision);
        return {
          effective: {
            state: "unavailable",
            candidateId: "candidate",
            reason: "target-unavailable",
            detail: baseRevision,
          } as never,
          currentness: { state: "unavailable", reason: "target-unavailable", detail: baseRevision } as never,
        };
      },
    });

    const first = await context.readEffective("example", oid("a"));
    const second = await context.readEffective("example", oid("b"));

    expect(first?.effective).toMatchObject({ detail: oid("a") });
    expect(second?.effective).toMatchObject({ detail: oid("b") });
    expect(projectedBases).toEqual([oid("a"), oid("b")]);
  });

  it("accepts the configured base and a validated delivery-member predecessor", () => {
    expect(checkpointBaseIsAccepted({
      candidateBaseRef: "main",
      configuredBaseRef: "main",
      acceptableDeliveryBaseRefs: [],
    })).toBe(true);
    expect(checkpointBaseIsAccepted({
      candidateBaseRef: "delivery/example/member-1",
      configuredBaseRef: "main",
      acceptableDeliveryBaseRefs: ["delivery/example/member-1"],
    })).toBe(true);
  });

  it("rejects a base that neither authority admitted", () => {
    expect(checkpointBaseIsAccepted({
      candidateBaseRef: "unrelated",
      configuredBaseRef: "main",
      acceptableDeliveryBaseRefs: ["delivery/example/member-1"],
    })).toBe(false);
  });
});
