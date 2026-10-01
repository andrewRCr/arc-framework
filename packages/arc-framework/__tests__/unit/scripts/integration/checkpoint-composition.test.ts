import { describe, expect, it, vi } from "vitest";

import type { GitExec } from "../../../../src/lib/git/exec.js";
import { CanonicalDigestSchema } from "../../../../src/lib/kernel/index.js";

import {
  checkpointBaseIsAccepted,
  createCheckpointCandidateContext,
  readSingletonCheckpointDischarge,
} from "../../../../src/scripts/integration/checkpoint-composition.js";

const oid = (character: string): string => character.repeat(40);
const RECORD_VERSION = CanonicalDigestSchema.parse(`sha256:${"1".repeat(64)}`);

describe("integration checkpoint composition", () => {
  it("shares one managed Candidate record across classification and downstream projection", async () => {
    let reads = 0;
    const record = { attestation: { candidateId: "candidate" } } as never;
    const context = createCheckpointCandidateContext({
      readRecord: async () => {
        reads += 1;
        return { record, version: RECORD_VERSION };
      },
      readVersion: async () => RECORD_VERSION,
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

    expect(managed.version).toBe(RECORD_VERSION);
    expect(effective?.recordVersion).toBe(managed.version);
    expect(reads).toBe(1);
  });

  it("projects distinct authoritative Candidate bases independently", async () => {
    const projectedBases: string[] = [];
    const context = createCheckpointCandidateContext({
      readRecord: async () => ({
        record: { attestation: { candidateId: "candidate" } } as never,
        version: RECORD_VERSION,
      }),
      readVersion: async () => RECORD_VERSION,
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

  it("reads a post-fix singleton review from the target's observed diff base", async () => {
    const reviewedBase = oid("2");
    const currentBase = oid("3");
    const head = oid("4");
    const exec: GitExec = vi.fn(async (_cmd, args) => {
      expect(args).toEqual(["merge-base", "--all", head, currentBase]);
      return { stdout: `${reviewedBase}\n` };
    });
    const readDischarge = vi.fn(async () => ({
      discharged: false,
      detail: "Earlier review requires applicability.",
      nextSource: null,
    }));

    await expect(readSingletonCheckpointDischarge({
      cwd: "/repo",
      exec,
      baseBranch: "main",
      baseRevision: currentBase,
      approvedHead: head,
      discharge: {
        reservation: {} as never,
        approvedHead: head,
        changeRequest: { repository: "owner/repository", pullRequest: 41 },
        candidate: { attestation: { baseRevision: oid("1") } } as never,
      },
      readDischarge,
    })).resolves.toMatchObject({ discharged: false });
    expect(readDischarge).toHaveBeenCalledWith(expect.objectContaining({
      baseRevision: reviewedBase,
      approvedHead: head,
    }));
  });
});
