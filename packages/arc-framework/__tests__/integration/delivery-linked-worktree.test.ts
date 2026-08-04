import { access } from "node:fs/promises";
import { join } from "node:path";

import { z } from "zod";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { receiptId } from "../../src/lib/canonical/receipt-id.js";
import {
  DeliveryAssignmentsV1Codec,
  type DeliveryAssignmentsV1,
} from "../../src/lib/delivery/assignment.js";
import { deriveMemberAssuranceSubjectId } from "../../src/lib/delivery/identity.js";
import {
  RepositoryDeliveryAssignmentStore,
  RepositoryDeliveryPlanStore,
} from "../../src/lib/delivery/local-stores.js";
import {
  GitDeliveryRenameTransitionSource,
  resolveExistingDeliveryPlan,
} from "../../src/lib/delivery/plan-resolution.js";
import type { DeliveryPlanPayloadCodec } from "../../src/lib/delivery/ports.js";
import { RepositoryGitCommonStatePublisher } from "../../src/lib/git-common-state.js";
import { canonicalDigest, canonicalize } from "../../src/lib/kernel/index.js";
import type { RetirementReceipt } from "../../src/lib/work-unit/retirement-authority.js";
import {
  RETIREMENT_RECORD_NAMESPACE,
  writeRetirementRecord,
} from "../../src/lib/work-unit/retirement-record-store.js";
import {
  cleanupTempDir,
  createTempRepo,
  execFileAsync,
  makeCommit,
  makeGitExec,
  rm,
} from "../helpers/integration.js";

const FIRST_PLAN_ID = "8ddfd842-4c92-4ccb-9958-ae47b43e2c44";
const SECOND_PLAN_ID = "f7f35d3f-8d46-4443-b36b-c4e7d463d5b8";

const LinkedPlanSchema = z.strictObject({
  planId: z.uuid(),
  workUnitId: z.string().min(1),
  planDigest: z.string().regex(/^sha256:[0-9a-f]{64}$/u),
});
type LinkedPlan = z.infer<typeof LinkedPlanSchema>;

const planCodec: DeliveryPlanPayloadCodec<LinkedPlan> = {
  decode: (value) => {
    const parsed = LinkedPlanSchema.safeParse(value);
    return parsed.success
      ? { status: "decoded", value: parsed.data }
      : { status: "refused" };
  },
  planId: (value) => value.planId,
  digest: (value) => canonicalDigest({ planId: value.planId, workUnitId: value.workUnitId }),
  isValidSuccessor: () => true,
};

function plan(planId: string, workUnitId: string): LinkedPlan {
  return {
    planId,
    workUnitId,
    planDigest: canonicalDigest({ planId, workUnitId }),
  };
}

function assignment(input: {
  readonly planId: string;
  readonly workUnitId: string;
  readonly head: string;
  readonly ref: string;
  readonly label: string;
}): DeliveryAssignmentsV1 {
  const deliverableId = canonicalDigest({ deliverable: input.label });
  const assuranceSubjectId = deriveMemberAssuranceSubjectId(input.planId, deliverableId);
  const decoded = DeliveryAssignmentsV1Codec.decode({
    schemaVersion: 1,
    semanticsVersion: "delivery-assignments/v1",
    planId: input.planId,
    workUnitId: input.workUnitId,
    host: { adapterId: "git", providerBinding: {} },
    terminalTarget: { sourceRef: "owning-unit", destinationRef: "main" },
    members: [{
      deliverableId,
      assuranceSubjectId,
      ref: input.ref,
      assignedHeadObjectId: input.head,
      changeRequestHandles: [],
      materializationGeneration: 1,
      reviewRouting: { routeId: "standard", binding: {} },
    }],
    generationHighWater: [{ assuranceSubjectId, generation: 1 }],
  });
  if (decoded.status === "refused") throw new Error("invalid linked-worktree assignment fixture");
  return decoded.value;
}

function renameReceipt(subject: string, targetSlug: string, marker: string): RetirementReceipt {
  const typedSubject = { kind: "work-unit", name: subject } as const;
  const source = {
    branch: `feat/${subject}-${marker}`,
    head: marker.repeat(40),
    artifactDigest: canonicalDigest({ source: subject, marker }),
  };
  return {
    schemaVersion: 1,
    receiptId: receiptId({
      schemaVersion: 1,
      subject: typedSubject,
      transition: "rename",
      sourceBranch: source.branch,
      sourceHead: source.head,
    }),
    subject: typedSubject,
    transition: "rename",
    source,
    transitionPatchDigest: canonicalDigest({ patch: subject, marker }),
    retiringProjection: { kind: "direct-transition" },
    authorization: "identity-renamed",
    result: {
      kind: "rename",
      targetSlug,
      artifactDigest: canonicalDigest({ target: targetSlug }),
    },
  };
}

describe("delivery records from an artifact-free linked worktree", () => {
  let primary: string;
  let member: string;
  let memberHead: string;

  beforeEach(async () => {
    primary = await createTempRepo("arc-delivery-linked-");
    await makeCommit(primary, "initial");
    member = `${primary}-member`;
    await execFileAsync("git", ["worktree", "add", "-b", "member", member, "HEAD"], { cwd: primary });
    memberHead = (await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: member })).stdout.trim();
  });

  afterEach(async () => {
    try {
      await execFileAsync("git", ["worktree", "remove", "--force", member], { cwd: primary });
    } catch {
      await rm(member, { recursive: true, force: true });
    }
    await cleanupTempDir(primary);
  });

  function assignmentStore(cwd: string): RepositoryDeliveryAssignmentStore {
    return new RepositoryDeliveryAssignmentStore(
      new RepositoryGitCommonStatePublisher(makeGitExec(cwd), cwd),
    );
  }

  function planStore(cwd: string): RepositoryDeliveryPlanStore<LinkedPlan> {
    return new RepositoryDeliveryPlanStore(
      new RepositoryGitCommonStatePublisher(makeGitExec(cwd), cwd),
      planCodec,
    );
  }

  async function publishAssignment(value: DeliveryAssignmentsV1): Promise<void> {
    const result = await assignmentStore(primary).publish(value.planId, value, 0);
    if (result.status === "refused") throw new Error(`assignment publication refused: ${result.reason}`);
  }

  async function publishPlan(value: LinkedPlan): Promise<void> {
    const result = await planStore(primary).publishCurrent(value.planId, value, null);
    if (result.status === "refused") throw new Error(`plan publication refused: ${result.reason}`);
  }

  async function publishReceipts(receipts: readonly RetirementReceipt[], message: string): Promise<void> {
    for (const receipt of receipts) {
      await writeRetirementRecord(primary, receipt.receiptId, canonicalize(receipt));
    }
    await execFileAsync("git", ["add", "--", RETIREMENT_RECORD_NAMESPACE], { cwd: primary });
    await makeCommit(primary, message);
  }

  it("resolves exact head and opaque authoritative ref selectors through Git-common storage", async () => {
    const value = assignment({
      planId: FIRST_PLAN_ID,
      workUnitId: "owning-unit",
      head: memberHead,
      ref: "opaque-member-binding",
      label: "member-one",
    });
    await publishAssignment(value);
    const store = assignmentStore(member);
    const expected = {
      status: "ok",
      value: {
        planId: FIRST_PLAN_ID,
        deliverableId: value.members[0]!.deliverableId,
        workUnitId: "owning-unit",
        assignment: value,
      },
    };

    await expect(store.resolveMember({ selector: { kind: "head", objectId: memberHead } }))
      .resolves.toEqual(expected);
    await expect(store.resolveMember({
      selector: {
        kind: "ref",
        ref: "opaque-member-binding",
        observedHeadObjectId: memberHead,
      },
    })).resolves.toEqual(expected);
    await expect(access(join(member, ".arc", "active"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("preserves ambiguous and unmatched selector results from the sibling checkout", async () => {
    await publishAssignment(assignment({
      planId: FIRST_PLAN_ID,
      workUnitId: "first-unit",
      head: memberHead,
      ref: "first-binding",
      label: "first",
    }));
    await publishAssignment(assignment({
      planId: SECOND_PLAN_ID,
      workUnitId: "second-unit",
      head: memberHead,
      ref: "second-binding",
      label: "second",
    }));
    const store = assignmentStore(member);

    await expect(store.resolveMember({ selector: { kind: "head", objectId: memberHead } }))
      .resolves.toEqual({ status: "refused", reason: "ambiguous-match" });
    await expect(store.resolveMember({ selector: { kind: "head", objectId: "f".repeat(40) } }))
      .resolves.toEqual({ status: "ok", value: null });
  });

  it("adopts a plan through reachable rename evidence and refuses unestablished reachability", async () => {
    const stored = plan(FIRST_PLAN_ID, "old-unit");
    await publishPlan(stored);
    await publishReceipts([renameReceipt("old-unit", "current-unit", "a")], "record rename");
    const store = planStore(member);
    const transitionSource = new GitDeliveryRenameTransitionSource(makeGitExec(member));

    await expect(resolveExistingDeliveryPlan({
      planStore: store,
      currentWorkUnitId: "current-unit",
      planWorkUnitId: (value) => value.workUnitId,
      authority: { status: "established", ref: "refs/heads/main" },
      transitionSource,
    })).resolves.toEqual({ status: "match", plan: stored });
    await expect(resolveExistingDeliveryPlan({
      planStore: store,
      currentWorkUnitId: "current-unit",
      planWorkUnitId: (value) => value.workUnitId,
      authority: { status: "unestablished" },
      transitionSource,
    })).resolves.toEqual({ status: "indeterminate", reason: "reachability-unestablished" });
  });

  it("distinguishes cyclic rename history from an ambiguous subject", async () => {
    await publishPlan(plan(FIRST_PLAN_ID, "unit-a"));
    await publishReceipts([
      renameReceipt("unit-a", "unit-b", "a"),
      renameReceipt("unit-b", "unit-a", "b"),
    ], "record cycle");
    const store = planStore(member);
    const transitionSource = new GitDeliveryRenameTransitionSource(makeGitExec(member));
    const input = {
      planStore: store,
      currentWorkUnitId: "current-unit",
      planWorkUnitId: (value: LinkedPlan) => value.workUnitId,
      authority: { status: "established", ref: "refs/heads/main" } as const,
      transitionSource,
    };

    await expect(resolveExistingDeliveryPlan(input)).resolves.toEqual({ status: "no-match" });

    await publishPlan(plan(SECOND_PLAN_ID, "ambiguous-unit"));
    await publishReceipts([
      renameReceipt("ambiguous-unit", "current-unit", "c"),
      renameReceipt("ambiguous-unit", "other-unit", "d"),
    ], "record ambiguity");
    await expect(resolveExistingDeliveryPlan(input))
      .resolves.toEqual({ status: "indeterminate", reason: "ambiguous-subject" });
  });
});
