import { describe, expect, it, vi } from "vitest";

import {
  classifyDeliveryReviewFixStagedRecords,
  deliveryReviewFixRecordDigest,
  reconstructDeliveryReviewFixExpectedRecords,
  settleDeliveryReviewFixRecordEffects,
} from "../../../src/lib/delivery/review-fix-record-effects.js";
import { carryDeliveryReviewFixPublicBoundary } from "../../../src/lib/delivery/review-fix.js";
import { projectDeliveryPublicReviewContinuation } from
  "../../../src/lib/delivery/public-review-continuation.js";
import { canonicalDigest, canonicalize } from "../../../src/lib/kernel/index.js";
import {
  createCandidateAttestation,
  createCandidateSubjectSnapshot,
  type CandidateManagedRecordV1,
} from "../../../src/lib/work-unit/candidate-attestation.js";
import {
  projectCorrectiveDeliveryReviewBoundary,
  projectPublicationBoundary,
} from "../../../src/scripts/review-gate/policy/integration-boundary-locus.js";
import { deliveryStackPlanFixture } from "../../fixtures/delivery-plan.js";
import { deliveryStateFixture } from "../../fixtures/delivery-state.js";

const workUnitId = "example-work-unit";
const candidatePath = `.arc/system/.internal/candidates/${workUnitId}.json`;
const boundaryPath = `.arc/system/.internal/candidates/${workUnitId}.boundary.json`;
const matchingWorkingRecords = {
  workingRecordMatchesStaged: vi.fn().mockResolvedValue(true),
};

describe("delivery review-fix record effects", () => {
  it("reconstructs only the exact semantic boundary carry", () => {
    const plan = deliveryStackPlanFixture();
    const initial = deliveryStateFixture(plan);
    const state = {
      ...initial,
      members: initial.members.map((member, index) => ({
        ...member,
        changeRequest: { providerId: "github", changeRequestId: String(400 + index) },
      })),
    };
    const beforeContinuation = projectDeliveryPublicReviewContinuation({ plan, state, stateRevision: 9 });
    if (beforeContinuation.status !== "projected") throw new Error("fixture continuation must project");
    const subject = createCandidateSubjectSnapshot([{
      path: "feature.ts",
      digest: canonicalDigest({ content: "candidate" }),
      mode: "100644",
      treatment: "reviewable",
    }]);
    const candidate: CandidateManagedRecordV1 = {
      schemaVersion: 1,
      semanticsVersion: "candidate-attestation/v1",
      attestation: createCandidateAttestation({
        workUnit: plan.workUnitId,
        subject,
        baseRevision: "a".repeat(40),
        attestedBy: "reviewer",
        attestedAt: "2026-09-03T12:00:00.000Z",
        verificationEvidenceRef: "verification://candidate",
      }),
      subject,
      transitions: [],
      lineageAttestations: [],
    };
    const reservation = {
      schemaVersion: 1 as const,
      semanticsVersion: "standard-review-reservation/v1" as const,
      reservationId: `sha256:${"b".repeat(64)}`,
      sources: ["codex-pr"],
      target: {
        kind: "delivery" as const,
        repository: "owner/repo",
        workUnitId: plan.workUnitId,
        planId: plan.planId,
      },
      obligation: {
        obligation: "required" as const,
        reasons: ["sensitive-change-set"],
        rubricVersion: "standard-review/v1",
        rubricDigest: `sha256:${"c".repeat(64)}`,
        retrigger: "full-final" as const,
        count: 1,
      },
    };
    const publication = projectPublicationBoundary({
      workUnit: plan.workUnitId,
      branch: "feat/example",
      candidateId: candidate.attestation.candidateId,
      candidateSubjectDigest: candidate.subject.subjectDigest,
      reservation,
      changeRequest: null,
    });
    const beforeBoundary = projectCorrectiveDeliveryReviewBoundary({
      workUnit: plan.workUnitId,
      candidateId: candidate.attestation.candidateId,
      candidateSubjectDigest: candidate.subject.subjectDigest,
      supersedesCandidateId: null,
      sourceBoundary: publication,
      deliveryContinuation: beforeContinuation.continuation,
    });
    const carried = carryDeliveryReviewFixPublicBoundary({
      plan,
      state: { revision: 10, value: state },
      boundary: beforeBoundary,
      candidateId: candidate.attestation.candidateId,
      sourceCandidateSubjectDigest: candidate.subject.subjectDigest,
      candidateSubjectDigest: candidate.subject.subjectDigest,
    });
    if (carried.status !== "carried") throw new Error("fixture boundary must carry");
    const candidateContent = canonicalize(candidate);
    const boundaryContent = canonicalize(carried.boundary);
    const reconstruct = (currentBoundary: typeof carried.boundary) => (
      reconstructDeliveryReviewFixExpectedRecords({
        recordClass: "boundary-projection",
        plan,
        state: { revision: 10, value: state },
        beforeCandidate: candidate,
        currentCandidate: candidate,
        beforeBoundary,
        currentBoundary,
        candidateRecord: { path: candidatePath, content: candidateContent },
        boundaryRecord: { path: boundaryPath, content: boundaryContent },
      })
    );

    expect(reconstruct(carried.boundary)).toEqual([{
      path: boundaryPath,
      digest: deliveryReviewFixRecordDigest(boundaryContent),
    }]);
    expect(reconstruct({
      ...carried.boundary,
      candidateSubjectDigest: `sha256:${"d".repeat(64)}`,
    })).toBeNull();
  });

  it("isolates exact machine-owned record paths from staged content", () => {
    expect(classifyDeliveryReviewFixStagedRecords({
      workUnitId,
      paths: [boundaryPath, candidatePath],
    })).toEqual({
      status: "ready",
      recordClass: "candidate-boundary-projection",
      paths: [boundaryPath, candidatePath],
    });
    expect(classifyDeliveryReviewFixStagedRecords({
      workUnitId,
      paths: [candidatePath, "src/content.ts"],
    })).toEqual({
      status: "ready",
      recordClass: "review-applicability-selection",
      paths: [candidatePath],
    });
    expect(classifyDeliveryReviewFixStagedRecords({
      workUnitId,
      paths: ["src/content.ts"],
    })).toEqual({
      status: "idle",
    });
  });

  it("commits and pushes one exact record batch with ordered disclosure", async () => {
    const commit = vi.fn().mockResolvedValue({ status: "committed", head: "3".repeat(40) });
    const push = vi.fn().mockResolvedValue({ status: "pushed" });
    const readRemoteHead = vi.fn()
      .mockResolvedValueOnce("2".repeat(40))
      .mockResolvedValueOnce("3".repeat(40));

    await expect(settleDeliveryReviewFixRecordEffects({
      workUnitId,
      context: ".arc/active/meta-example-work-unit.md (review correction)",
      expectedRecords: [
        { path: boundaryPath, digest: "sha256:boundary" },
        { path: candidatePath, digest: "sha256:candidate" },
      ],
      ports: {
        ...matchingWorkingRecords,
        listStagedPaths: vi.fn().mockResolvedValue([boundaryPath, candidatePath]),
        readStagedRecordDigest: vi.fn(async (path) =>
          path === boundaryPath ? "sha256:boundary" : "sha256:candidate"),
        readRecoverableCommit: vi.fn().mockResolvedValue({ status: "none" }),
        readCommittedRecordDigest: vi.fn(async (_head, path) =>
          path === boundaryPath ? "sha256:boundary" : "sha256:candidate"),
        readCurrentBranch: vi.fn().mockResolvedValue("feat/example"),
        readRemoteHead,
        commit,
        push,
      },
    })).resolves.toEqual({
      status: "settled",
      effects: [
        { kind: "commit", recordClass: "candidate-boundary-projection", head: "3".repeat(40) },
        {
          kind: "push",
          ref: "refs/heads/feat/example",
          beforeHead: "2".repeat(40),
          afterHead: "3".repeat(40),
        },
      ],
    });
    expect(commit).toHaveBeenCalledWith(expect.objectContaining({
      paths: [boundaryPath, candidatePath],
      message: expect.stringContaining("Context: .arc/active/meta-example-work-unit.md (review correction)"),
    }));
    expect(push).toHaveBeenCalledWith({ branch: "feat/example" });
  });

  it("replays the push for one exact record-only commit left ahead of the remote", async () => {
    const head = "3".repeat(40);
    const beforeHead = "2".repeat(40);
    const push = vi.fn().mockResolvedValue({ status: "pushed" });
    const commit = vi.fn();

    await expect(settleDeliveryReviewFixRecordEffects({
      workUnitId,
      context: "meta-example-work-unit.md (integration)",
      expectedRecords: [
        { path: boundaryPath, digest: "sha256:boundary" },
        { path: candidatePath, digest: "sha256:candidate" },
      ],
      ports: {
        ...matchingWorkingRecords,
        listStagedPaths: vi.fn().mockResolvedValue([]),
        readStagedRecordDigest: vi.fn(),
        readRecoverableCommit: vi.fn().mockResolvedValue({
          status: "recoverable",
          recordClass: "candidate-boundary-projection",
          paths: [boundaryPath, candidatePath],
          branch: "feat/example",
          head,
          beforeHead,
        }),
        readCommittedRecordDigest: vi.fn(async (_head, path) =>
          path === boundaryPath ? "sha256:boundary" : "sha256:candidate"),
        readCurrentBranch: vi.fn(),
        readRemoteHead: vi.fn().mockResolvedValue(head),
        commit,
        push,
      },
    })).resolves.toEqual({
      status: "settled",
      effects: [
        {
          kind: "commit",
          recordClass: "candidate-boundary-projection",
          head,
          replayed: true,
        },
        {
          kind: "push",
          ref: "refs/heads/feat/example",
          beforeHead,
          afterHead: head,
        },
      ],
    });
    expect(commit).not.toHaveBeenCalled();
    expect(push).toHaveBeenCalledWith({ branch: "feat/example" });
  });

  it("does not recover a record commit without an exact expectation", async () => {
    const readRecoverableCommit = vi.fn().mockResolvedValue({
      status: "recoverable",
      recordClass: "boundary-projection",
      paths: [boundaryPath],
      branch: "feat/example",
      head: "3".repeat(40),
      beforeHead: "2".repeat(40),
    });

    await expect(settleDeliveryReviewFixRecordEffects({
      workUnitId,
      context: "meta-example-work-unit.md (integration)",
      expectedRecords: [],
      ports: {
        ...matchingWorkingRecords,
        listStagedPaths: vi.fn().mockResolvedValue([]),
        readStagedRecordDigest: vi.fn(),
        readRecoverableCommit,
        readCommittedRecordDigest: vi.fn(),
        readCurrentBranch: vi.fn(),
        readRemoteHead: vi.fn(),
        commit: vi.fn(),
        push: vi.fn(),
      },
    })).resolves.toEqual({ status: "idle", effects: [] });
    expect(readRecoverableCommit).not.toHaveBeenCalled();
  });

  it("refuses a missing or byte-mismatched expected committed record", async () => {
    const commonPorts = {
      ...matchingWorkingRecords,
      listStagedPaths: vi.fn().mockResolvedValue([]),
      readStagedRecordDigest: vi.fn(),
      readCurrentBranch: vi.fn(),
      readRemoteHead: vi.fn(),
      commit: vi.fn(),
      push: vi.fn(),
    };

    await expect(settleDeliveryReviewFixRecordEffects({
      workUnitId,
      context: "meta-example-work-unit.md (integration)",
      expectedRecords: [{ path: boundaryPath, digest: "sha256:expected" }],
      ports: {
        ...commonPorts,
        readRecoverableCommit: vi.fn().mockResolvedValue({ status: "none" }),
        readCommittedRecordDigest: vi.fn(),
      },
    })).resolves.toEqual({
      status: "refused",
      reason: "record-effect-expected-records-missing",
      paths: [boundaryPath],
    });

    await expect(settleDeliveryReviewFixRecordEffects({
      workUnitId,
      context: "meta-example-work-unit.md (integration)",
      expectedRecords: [{ path: boundaryPath, digest: "sha256:expected" }],
      ports: {
        ...commonPorts,
        readRecoverableCommit: vi.fn().mockResolvedValue({
          status: "recoverable",
          recordClass: "boundary-projection",
          paths: [boundaryPath],
          branch: "feat/example",
          head: "3".repeat(40),
          beforeHead: "2".repeat(40),
        }),
        readCommittedRecordDigest: vi.fn().mockResolvedValue("sha256:other"),
      },
    })).resolves.toEqual({
      status: "refused",
      reason: "record-effect-content-mismatch",
      paths: [boundaryPath],
    });
  });

  it("refuses authoritative staged residue that the correction invocation did not produce", async () => {
    const commit = vi.fn();

    await expect(settleDeliveryReviewFixRecordEffects({
      workUnitId,
      context: "meta-example-work-unit.md (integration)",
      expectedRecords: [],
      ports: {
        ...matchingWorkingRecords,
        listStagedPaths: vi.fn().mockResolvedValue([candidatePath]),
        readStagedRecordDigest: vi.fn().mockResolvedValue("sha256:unrelated"),
        readRecoverableCommit: vi.fn(),
        readCommittedRecordDigest: vi.fn(),
        readCurrentBranch: vi.fn(),
        readRemoteHead: vi.fn(),
        commit,
        push: vi.fn(),
      },
    })).resolves.toEqual({
      status: "refused",
      reason: "record-effect-unexpected-staged-records",
      paths: [candidatePath],
    });
    expect(commit).not.toHaveBeenCalled();
  });

  it("refuses an expected record path whose staged bytes no longer match the invocation", async () => {
    await expect(settleDeliveryReviewFixRecordEffects({
      workUnitId,
      context: "meta-example-work-unit.md (integration)",
      expectedRecords: [{ path: candidatePath, digest: "sha256:expected" }],
      ports: {
        ...matchingWorkingRecords,
        listStagedPaths: vi.fn().mockResolvedValue([candidatePath]),
        readStagedRecordDigest: vi.fn().mockResolvedValue("sha256:other"),
        readRecoverableCommit: vi.fn(),
        readCommittedRecordDigest: vi.fn(),
        readCurrentBranch: vi.fn(),
        readRemoteHead: vi.fn(),
        commit: vi.fn(),
        push: vi.fn(),
      },
    })).resolves.toEqual({
      status: "refused",
      reason: "record-effect-content-mismatch",
      paths: [candidatePath],
    });
  });

  it("refuses a managed record whose worktree bytes differ from the validated index", async () => {
    const commit = vi.fn();

    await expect(settleDeliveryReviewFixRecordEffects({
      workUnitId,
      context: "meta-example-work-unit.md (integration)",
      expectedRecords: [{ path: candidatePath, digest: "sha256:expected" }],
      ports: {
        listStagedPaths: vi.fn().mockResolvedValue([candidatePath]),
        readStagedRecordDigest: vi.fn().mockResolvedValue("sha256:expected"),
        workingRecordMatchesStaged: vi.fn().mockResolvedValue(false),
        readRecoverableCommit: vi.fn(),
        readCommittedRecordDigest: vi.fn(),
        readCurrentBranch: vi.fn(),
        readRemoteHead: vi.fn(),
        commit,
        push: vi.fn(),
      },
    })).resolves.toEqual({
      status: "refused",
      reason: "record-effect-worktree-mismatch",
      paths: [candidatePath],
    });
    expect(commit).not.toHaveBeenCalled();
  });

  it("refuses a newly committed record whose bytes do not match before pushing", async () => {
    const push = vi.fn();

    await expect(settleDeliveryReviewFixRecordEffects({
      workUnitId,
      context: "meta-example-work-unit.md (integration)",
      expectedRecords: [{ path: candidatePath, digest: "sha256:expected" }],
      ports: {
        ...matchingWorkingRecords,
        listStagedPaths: vi.fn().mockResolvedValue([candidatePath]),
        readStagedRecordDigest: vi.fn().mockResolvedValue("sha256:expected"),
        readRecoverableCommit: vi.fn(),
        readCommittedRecordDigest: vi.fn().mockResolvedValue("sha256:other"),
        readCurrentBranch: vi.fn(),
        readRemoteHead: vi.fn(),
        commit: vi.fn().mockResolvedValue({ status: "committed", head: "3".repeat(40) }),
        push,
      },
    })).resolves.toEqual({
      status: "refused",
      reason: "record-effect-committed-content-mismatch",
      paths: [candidatePath],
    });
    expect(push).not.toHaveBeenCalled();
  });
});
