import { describe, expect, it } from "vitest";

import { canonicalDigest } from "../../../../../../src/lib/kernel/index.js";
import {
  ApprovedDispositionRecordSchema,
} from "../../../../../../src/scripts/review-gate/core/advisory-records.js";
import {
  approveDispositionState,
  createDispositionSet,
  proposeDispositionSet,
} from "../../../../../../src/scripts/review-gate/core/dispositions.js";
import {
  consumeFixAuthorization,
  createFixAuthorization,
} from "../../../../../../src/scripts/review-gate/core/fix-authorization.js";
import {
  createReviewTarget,
} from "../../../../../../src/scripts/review-gate/core/gate-contract-v2.js";
import {
  LocalApprovedDispositionRecordStore,
} from "../../../../../../src/scripts/review-gate/hosts/local/disposition-record-store.js";
import type {
  GitCommonStatePublisher,
} from "../../../../../../src/lib/git-common-state.js";
import {
  RepositoryLocalReviewSourceStore,
} from "../../../../../../src/scripts/review-gate/hosts/local/source-store.js";

function publisher(raw: string): GitCommonStatePublisher {
  return {
    list: async () => [],
    snapshot: async () => [],
    read: async () => raw,
    update: async (_namespace, _recordName, update) => (await update(raw)).result,
  };
}

function mutablePublisher(initial: string): GitCommonStatePublisher {
  let raw: string | null = initial;
  return {
    list: async () => [],
    snapshot: async () => [],
    read: async () => raw,
    update: async (_namespace, _recordName, update) => {
      const action = await update(raw);
      if (action.kind === "write") raw = action.content;
      if (action.kind === "delete") raw = null;
      return action.result;
    },
  };
}

function errandDispositionRecords() {
  const oldTarget = createReviewTarget({
    schemaVersion: 2,
    semanticsVersion: "review-gate/v2",
    kind: "change-set",
    repositoryId: "repo-1",
    baseRef: "main",
    diffBaseSha: "a".repeat(40),
    diffBaseTree: "b".repeat(40),
    headSha: "c".repeat(40),
    headTree: "d".repeat(40),
  });
  const newTarget = createReviewTarget({
    schemaVersion: 2,
    semanticsVersion: "review-gate/v2",
    kind: "change-set",
    repositoryId: "repo-1",
    baseRef: "main",
    diffBaseSha: "a".repeat(40),
    diffBaseTree: "b".repeat(40),
    headSha: "e".repeat(40),
    headTree: "f".repeat(40),
  });
  const approvedDisposition = approveDispositionState({
    proposed: proposeDispositionSet(createDispositionSet({
      schemaVersion: 2,
      semanticsVersion: "review-gate/v2",
      targetId: oldTarget.targetId,
      producerId: "operation-1",
      resultDigest: canonicalDigest({ result: "operation-1" }),
      policyVersion: canonicalDigest({ policy: "review" }),
      rubricVersion: "standard-review/v1",
      rubricDigest: canonicalDigest({ rubric: "standard" }),
      proposedBy: "agent-1",
      proposedVerification: "full",
      findings: [{
        findingId: "finding-1",
        sourceIdentity: "delegated-agent",
        locus: "src/review.ts:42",
        sourceVerification: "verified",
        verificationRefs: ["review:finding-1"],
        reportedSeverity: "major",
        verifiedSeverity: "major",
        disposition: "fix",
        gating: "blocking",
        rationale: "The source confirms the issue.",
        recommendation: "Apply the fix.",
        openQuestions: [],
      }],
    })),
    approvedBy: "maintainer-1",
    approvedAt: "2026-07-23T15:00:00Z",
  });
  const fixAuthorization = createFixAuthorization({
    dispositionState: approvedDisposition,
    oldTarget,
  });
  const initial = ApprovedDispositionRecordSchema.parse({
    schemaVersion: 1,
    semanticsVersion: "review-advisory/v1",
    repositoryId: "repo-1",
    operationId: "operation-1",
    candidate: null,
    errand: {
      key: "repair-review-state",
      claimId: "claim-1",
      branch: "chore/repair-review-state",
    },
    deliveryMember: null,
    source: {
      kind: "attested-local",
      receiptRef: "receipt:1",
      localSourceRef: "source:1",
    },
    approvedDisposition,
    fixAuthorization,
    errandFixResponse: null,
    deliveryMemberFixResponse: null,
  });
  const advanced = ApprovedDispositionRecordSchema.parse({
    ...initial,
    errandFixResponse: {
      oldTarget,
      newTarget,
      applicability: "focused",
      fixConsumption: consumeFixAuthorization({
        authorization: fixAuthorization,
        oldTarget,
        newTarget,
        appliedBy: "agent-1",
        consumedAt: "2026-07-23T16:00:00Z",
        verificationRefs: ["verification://focused-fix"],
        priorConsumptions: [],
      }),
      hostedTarget: null,
    },
  });
  return { initial, advanced };
}

function deliveryDispositionRecords() {
  const oldTarget = createReviewTarget({
    schemaVersion: 2,
    semanticsVersion: "review-gate/v2",
    kind: "delivery-member",
    repositoryId: "repo-1",
    baseRef: "main",
    diffBaseSha: "a".repeat(40),
    diffBaseTree: "b".repeat(40),
    headSha: "c".repeat(40),
    headTree: "d".repeat(40),
  });
  const newTarget = createReviewTarget({
    schemaVersion: 2,
    semanticsVersion: "review-gate/v2",
    kind: "delivery-member",
    repositoryId: "repo-1",
    baseRef: "main",
    diffBaseSha: "a".repeat(40),
    diffBaseTree: "b".repeat(40),
    headSha: "e".repeat(40),
    headTree: "f".repeat(40),
  });
  const approvedDisposition = approveDispositionState({
    proposed: proposeDispositionSet(createDispositionSet({
      schemaVersion: 2,
      semanticsVersion: "review-gate/v2",
      targetId: oldTarget.targetId,
      producerId: "operation-1",
      resultDigest: canonicalDigest({ result: "operation-1" }),
      policyVersion: canonicalDigest({ policy: "review" }),
      rubricVersion: "standard-review/v1",
      rubricDigest: canonicalDigest({ rubric: "standard" }),
      proposedBy: "agent-1",
      proposedVerification: "full",
      findings: [{
        findingId: "finding-1",
        sourceIdentity: "coderabbit-pr",
        locus: "src/review.ts:42",
        sourceVerification: "verified",
        verificationRefs: ["review:finding-1"],
        reportedSeverity: "major",
        verifiedSeverity: "major",
        disposition: "fix",
        gating: "blocking",
        rationale: "The source confirms the issue.",
        recommendation: "Apply the fix.",
        openQuestions: [],
      }],
    })),
    approvedBy: "maintainer-1",
    approvedAt: "2026-07-23T15:00:00Z",
  });
  const fixAuthorization = createFixAuthorization({ dispositionState: approvedDisposition, oldTarget });
  const deliveryMember = {
    kind: "delivery-member" as const,
    planId: "123e4567-e89b-42d3-a456-426614174000",
    deliverableId: canonicalDigest({ deliverable: "member-1" }),
    workUnitId: "delivery-example",
    head: oldTarget.headSha,
  };
  const initial = ApprovedDispositionRecordSchema.parse({
    schemaVersion: 1,
    semanticsVersion: "review-advisory/v1",
    repositoryId: "repo-1",
    operationId: "operation-1",
    candidate: null,
    errand: null,
    deliveryMember,
    source: {
      kind: "hosted",
      attemptRef: "arc-review-source:v1:hosted:lane-progress%2F1:hosted%2F1",
      hostedResultId: canonicalDigest({ result: "operation-1" }),
    },
    approvedDisposition,
    fixAuthorization,
    errandFixResponse: null,
    deliveryMemberFixResponse: null,
  });
  const advanced = ApprovedDispositionRecordSchema.parse({
    ...initial,
    deliveryMemberFixResponse: {
      oldTarget,
      newTarget,
      applicability: "focused",
      fixConsumption: consumeFixAuthorization({
        authorization: fixAuthorization,
        oldTarget,
        newTarget,
        appliedBy: "agent-1",
        consumedAt: "2026-07-23T16:00:00Z",
        verificationRefs: ["verification://focused-fix"],
        priorConsumptions: [],
      }),
      hostedTarget: { repository: "owner/repo", pullRequest: 42, headSha: deliveryMember.head },
      hostedFixTarget: {
        repository: "owner/repo",
        pullRequest: 42,
        headSha: newTarget.headSha,
      },
    },
  });
  return { initial, advanced };
}

describe("local review record stores", () => {
  it.each([
    ["source", () => new RepositoryLocalReviewSourceStore(publisher("{")).readSource("source.json")],
    ["disposition", () => new LocalApprovedDispositionRecordStore(publisher("{"))
      .readDispositionRecord("operation-1")],
  ])("classifies malformed durable %s records as corrupt state", async (_kind, read) => {
    await expect(read()).rejects.toMatchObject({ code: "corrupt-state" });
  });

  it("accepts only the monotonic verified-response advance for an Errand disposition", async () => {
    const { initial, advanced } = errandDispositionRecords();
    const store = new LocalApprovedDispositionRecordStore(
      mutablePublisher(`${JSON.stringify(initial)}\n`),
    );

    await expect(store.appendDispositionRecord(advanced)).resolves.toMatchObject({
      dispositionRecordRef: expect.stringContaining("disposition-"),
    });
    await expect(store.readDispositionRecord(advanced.operationId)).resolves.toEqual(advanced);
    await expect(store.appendDispositionRecord(advanced)).resolves.toBeDefined();
    await expect(store.appendDispositionRecord({
      ...advanced,
      errandFixResponse: advanced.errandFixResponse === null
        ? null
        : { ...advanced.errandFixResponse, applicability: "full" },
    })).rejects.toMatchObject({ code: "corrupt-state", reason: "local-disposition-conflict" });
  });

  it("accepts only the monotonic verified-response advance for a delivery-member disposition", async () => {
    const { initial, advanced } = deliveryDispositionRecords();
    const store = new LocalApprovedDispositionRecordStore(
      mutablePublisher(`${JSON.stringify(initial)}\n`),
    );

    await expect(store.appendDispositionRecord(advanced)).resolves.toMatchObject({
      dispositionRecordRef: expect.stringContaining("disposition-"),
    });
    await expect(store.readDispositionRecord(advanced.operationId)).resolves.toEqual(advanced);
    await expect(store.appendDispositionRecord(advanced)).resolves.toBeDefined();
    await expect(store.appendDispositionRecord({
      ...advanced,
      deliveryMemberFixResponse: advanced.deliveryMemberFixResponse === null
        ? null
        : { ...advanced.deliveryMemberFixResponse, applicability: "full" },
    })).rejects.toMatchObject({ code: "corrupt-state", reason: "local-disposition-conflict" });
  });

  it("binds an unowned attested-local disposition to one exact delivery member", async () => {
    const { initial } = deliveryDispositionRecords();
    const bound = ApprovedDispositionRecordSchema.parse({
      ...initial,
      source: {
        kind: "attested-local",
        receiptRef: "receipt:1",
        localSourceRef: "source:1",
      },
    });
    const unowned = ApprovedDispositionRecordSchema.parse({ ...bound, deliveryMember: null });
    const store = new LocalApprovedDispositionRecordStore(
      mutablePublisher(`${JSON.stringify(unowned)}\n`),
    );

    await expect(store.appendDispositionRecord(bound)).resolves.toMatchObject({
      dispositionRecordRef: expect.stringContaining("disposition-"),
    });
    await expect(store.readDispositionRecord(bound.operationId)).resolves.toEqual(bound);
    await expect(store.appendDispositionRecord({
      ...bound,
      deliveryMember: bound.deliveryMember === null
        ? null
        : { ...bound.deliveryMember, deliverableId: canonicalDigest({ deliverable: "other" }) },
    })).rejects.toMatchObject({ code: "corrupt-state", reason: "local-disposition-conflict" });
  });
});
