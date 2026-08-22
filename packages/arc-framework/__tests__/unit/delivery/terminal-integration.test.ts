import { describe, expect, it } from "vitest";

import type { DeliveryContributionEndpoints } from "../../../src/lib/delivery/contribution-proof.js";
import { composeDeliveryTerminalClaim } from "../../../src/lib/delivery/terminal-integration.js";
import {
  createCandidateAttestation,
  createCandidateSubjectSnapshot,
  projectCandidateCurrentness,
  type CandidateManagedRecordV1,
} from "../../../src/lib/work-unit/candidate-attestation.js";
import { canonicalDigest } from "../../../src/lib/kernel/index.js";
import { deliveryThreeMemberStackPlanFixture } from "../../fixtures/delivery-plan.js";
import { deliveryStateFixture } from "../../fixtures/delivery-state.js";

const CANDIDATE_HEAD = "a".repeat(40);
const CANDIDATE_TREE = "b".repeat(40);

function candidateRecord(): CandidateManagedRecordV1 {
  const subject = createCandidateSubjectSnapshot([{
    path: "feature.ts",
    digest: canonicalDigest({ content: "candidate" }),
    mode: "100644",
    treatment: "reviewable",
  }]);
  return {
    schemaVersion: 1,
    semanticsVersion: "candidate-attestation/v1",
    attestation: createCandidateAttestation({
      workUnit: "delivery-plan-record",
      subject,
      baseRevision: CANDIDATE_HEAD,
      attestedBy: "reviewer",
      attestedAt: "2026-08-21T12:00:00.000Z",
      verificationEvidenceRef: "verification://candidate",
    }),
    subject,
    responses: [],
    lineageAttestations: [],
  };
}

function fixture() {
  const plan = deliveryThreeMemberStackPlanFixture();
  const initial = deliveryStateFixture(plan);
  const state = {
    ...initial,
    members: initial.members.map((member, index) => ({
      ...member,
      changeRequest: { providerId: "github", changeRequestId: String(401 + index) },
    })),
  };
  const record = candidateRecord();
  const candidate = projectCandidateCurrentness({
    record,
    current: { revision: CANDIDATE_HEAD, subject: record.subject },
  });
  if (candidate.status !== "current") throw new Error("fixture Candidate must be current");
  const predecessor = state.members[1]!.coordinates!;
  const endpoints: DeliveryContributionEndpoints = {
    before: {
      predecessor: { head: predecessor.head, tree: predecessor.tree },
      member: { head: CANDIDATE_HEAD, tree: CANDIDATE_TREE },
    },
    after: {
      predecessor: { head: predecessor.head, tree: predecessor.tree },
      member: { head: CANDIDATE_HEAD, tree: CANDIDATE_TREE },
    },
  };
  return { plan, state, record, candidate, endpoints };
}

describe("delivery terminal integration", () => {
  it("composes the residual from the Candidate and retained non-terminal member heads", async () => {
    const f = fixture();
    const result = await composeDeliveryTerminalClaim({
      record: f.record,
      candidate: f.candidate,
      plan: f.plan,
      state: f.state,
      landings: f.state.members.slice(0, -1).map((member) => ({
        deliverableId: member.deliverableId,
        head: member.coordinates!.head,
      })),
      terminalDelta: f.endpoints.after,
      readCandidateCoordinate: async (head) => head === CANDIDATE_HEAD
        ? { head, tree: CANDIDATE_TREE }
        : null,
      proveResidual: async (endpoints) => JSON.stringify(endpoints) === JSON.stringify(f.endpoints)
        ? { status: "accepted", proof: "tree-equality" }
        : { status: "refused", reason: "contribution-endpoints-unverified" },
    });

    expect(result).toEqual({
      status: "composed",
      candidateId: f.record.attestation.candidateId,
      endpoints: f.endpoints,
      proof: { status: "accepted", proof: "tree-equality" },
    });
  });

  it("refuses when a landed member does not match its retained bound head", async () => {
    const f = fixture();
    const first = f.state.members[0]!;
    const result = await composeDeliveryTerminalClaim({
      record: f.record,
      candidate: f.candidate,
      plan: f.plan,
      state: f.state,
      landings: [
        { deliverableId: first.deliverableId, head: "f".repeat(40) },
        {
          deliverableId: f.state.members[1]!.deliverableId,
          head: f.state.members[1]!.coordinates!.head,
        },
      ],
      terminalDelta: f.endpoints.after,
      readCandidateCoordinate: async () => ({ head: CANDIDATE_HEAD, tree: CANDIDATE_TREE }),
      proveResidual: async () => ({ status: "accepted", proof: "tree-equality" }),
    });

    expect(result).toEqual({
      status: "refused",
      reason: "landed-head-mismatch",
      deliverableId: first.deliverableId,
    });
  });

  it("uses retained bindings after the landed member ref has been reaped", async () => {
    const f = fixture();
    const state = {
      ...f.state,
      members: f.state.members.map((member, index) => index === 0
        ? { ...member, ref: "refs/heads/reaped-member" }
        : member),
    };
    const result = await composeDeliveryTerminalClaim({
      record: f.record,
      candidate: f.candidate,
      plan: f.plan,
      state,
      landings: state.members.slice(0, -1).map((member) => ({
        deliverableId: member.deliverableId,
        head: member.coordinates!.head,
      })),
      terminalDelta: f.endpoints.after,
      readCandidateCoordinate: async () => ({ head: CANDIDATE_HEAD, tree: CANDIDATE_TREE }),
      proveResidual: async () => ({ status: "accepted", proof: "tree-equality" }),
    });

    expect(result.status).toBe("composed");
  });

  it("surfaces the eligibility comparator's residual refusal", async () => {
    const f = fixture();
    const result = await composeDeliveryTerminalClaim({
      record: f.record,
      candidate: f.candidate,
      plan: f.plan,
      state: f.state,
      landings: f.state.members.slice(0, -1).map((member) => ({
        deliverableId: member.deliverableId,
        head: member.coordinates!.head,
      })),
      terminalDelta: f.endpoints.after,
      readCandidateCoordinate: async () => ({ head: CANDIDATE_HEAD, tree: CANDIDATE_TREE }),
      proveResidual: async () => ({
        status: "refused",
        reason: "contribution-diverged",
        paths: ["unexpected.ts"],
      }),
    });

    expect(result).toEqual({
      status: "refused",
      reason: "residual-mismatch",
      proof: {
        status: "refused",
        reason: "contribution-diverged",
        paths: ["unexpected.ts"],
      },
    });
  });

  it("leaves the singleton checkpoint path not applicable", async () => {
    const f = fixture();
    await expect(composeDeliveryTerminalClaim({
      record: f.record,
      candidate: f.candidate,
      plan: null,
      state: null,
      landings: [],
      terminalDelta: f.endpoints.after,
      readCandidateCoordinate: async () => { throw new Error("must not read"); },
      proveResidual: async () => { throw new Error("must not prove"); },
    })).resolves.toEqual({ status: "not-applicable" });
  });
});
