import { access } from "node:fs/promises";
import { join } from "node:path";

import { z } from "zod";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  RepositoryDeliveryPlanStore,
  RepositoryDeliveryStateStore,
} from "../../src/lib/delivery/local-stores.js";
import {
  GitDeliveryRenameTransitionSource,
  resolveExistingDeliveryPlan,
} from "../../src/lib/delivery/plan-resolution.js";
import type { DeliveryPlanPayloadCodec } from "../../src/lib/delivery/ports.js";
import {
  DeliveryStateV1Schema,
  type DeliveryStateV1,
} from "../../src/lib/delivery/schema.js";
import { RepositoryGitCommonStatePublisher } from "../../src/lib/git-common-state.js";
import { canonicalDigest, canonicalize } from "../../src/lib/kernel/index.js";
import { createRawGitExec } from "../../src/lib/io-context.js";
import {
  TRANSITION_RECORD_NAMESPACE,
} from "../../src/lib/work-unit/transition-record-store.js";
import type { TransitionRecord } from "../../src/lib/work-unit/transition-record.js";
import {
  cleanupTempDir,
  createTempRepo,
  execFileAsync,
  makeCommit,
  makeGitExec,
  mkdir,
  rm,
  writeFile,
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

function state(input: {
  readonly planId: string;
  readonly workUnitId: string;
  readonly head: string;
  readonly ref: string;
  readonly label: string;
}): DeliveryStateV1 {
  const deliverableId = canonicalDigest({ deliverable: input.label });
  return DeliveryStateV1Schema.parse({
    schemaVersion: 1,
    semanticsVersion: "delivery-state/v1",
    planId: input.planId,
    workUnitId: input.workUnitId,
    boundPlan: { planRevision: 1, planDigest: canonicalDigest({ plan: input.planId }) },
    target: null,
    members: [{
      deliverableId,
      ref: input.ref,
      changeRequest: null,
      coordinates: { base: input.head, head: input.head, tree: input.head },
    }],
    activeOperation: null,
    pendingReviewFixVerification: null,
  });
}

function renameTransition(subject: string, targetSlug: string): TransitionRecord {
  return {
    schemaVersion: 1,
    origin: subject,
    kind: "rename",
    successors: [targetSlug],
    edges: [],
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

  function stateStore(cwd: string): RepositoryDeliveryStateStore {
    return new RepositoryDeliveryStateStore(
      new RepositoryGitCommonStatePublisher(makeGitExec(cwd), cwd),
    );
  }

  function planStore(cwd: string): RepositoryDeliveryPlanStore<LinkedPlan> {
    return new RepositoryDeliveryPlanStore(
      new RepositoryGitCommonStatePublisher(makeGitExec(cwd), cwd),
      planCodec,
    );
  }

  async function publishState(value: DeliveryStateV1): Promise<void> {
    const result = await stateStore(primary).publish(value.planId, value, 0);
    if (result.status === "refused") throw new Error(`state publication refused: ${result.reason}`);
  }

  async function publishPlan(value: LinkedPlan): Promise<void> {
    const result = await planStore(primary).publishCurrent(value.planId, value, null);
    if (result.status === "refused") throw new Error(`plan publication refused: ${result.reason}`);
  }

  async function publishTransitions(records: readonly TransitionRecord[], message: string): Promise<void> {
    const directory = join(primary, TRANSITION_RECORD_NAMESPACE);
    await mkdir(directory, { recursive: true });
    for (const [index, record] of records.entries()) {
      await writeFile(join(directory, `${record.origin}-${index}.json`), canonicalize(record), "utf8");
    }
    await execFileAsync("git", ["add", "--", TRANSITION_RECORD_NAMESPACE], { cwd: primary });
    await makeCommit(primary, message);
  }

  it("resolves exact head and opaque authoritative ref selectors through Git-common storage", async () => {
    const value = state({
      planId: FIRST_PLAN_ID,
      workUnitId: "owning-unit",
      head: memberHead,
      ref: "opaque-member-binding",
      label: "member-one",
    });
    await publishState(value);
    const store = stateStore(member);
    const expected = {
      status: "ok",
      value: {
        planId: FIRST_PLAN_ID,
        deliverableId: value.members[0]!.deliverableId,
        workUnitId: "owning-unit",
        state: value,
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
    await publishState(state({
      planId: FIRST_PLAN_ID,
      workUnitId: "first-unit",
      head: memberHead,
      ref: "first-binding",
      label: "first",
    }));
    await publishState(state({
      planId: SECOND_PLAN_ID,
      workUnitId: "second-unit",
      head: memberHead,
      ref: "second-binding",
      label: "second",
    }));
    const store = stateStore(member);

    await expect(store.resolveMember({ selector: { kind: "head", objectId: memberHead } }))
      .resolves.toEqual({ status: "refused", reason: "ambiguous-match" });
    await expect(store.resolveMember({ selector: { kind: "head", objectId: "f".repeat(40) } }))
      .resolves.toEqual({ status: "ok", value: null });
  });

  it("adopts a plan through reachable rename evidence and refuses unestablished reachability", async () => {
    const stored = plan(FIRST_PLAN_ID, "old-unit");
    await publishPlan(stored);
    await publishTransitions([renameTransition("old-unit", "current-unit")], "record rename");
    const store = planStore(member);
    const transitionSource = new GitDeliveryRenameTransitionSource(createRawGitExec(member));

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
    await publishTransitions([
      renameTransition("unit-a", "unit-b"),
      renameTransition("unit-b", "unit-a"),
    ], "record cycle");
    const store = planStore(member);
    const transitionSource = new GitDeliveryRenameTransitionSource(createRawGitExec(member));
    const input = {
      planStore: store,
      currentWorkUnitId: "current-unit",
      planWorkUnitId: (value: LinkedPlan) => value.workUnitId,
      authority: { status: "established", ref: "refs/heads/main" } as const,
      transitionSource,
    };

    await expect(resolveExistingDeliveryPlan(input)).resolves.toEqual({ status: "no-match" });

    await publishPlan(plan(SECOND_PLAN_ID, "ambiguous-unit"));
    await publishTransitions([
      renameTransition("ambiguous-unit", "current-unit"),
      renameTransition("ambiguous-unit", "other-unit"),
    ], "record ambiguity");
    await expect(resolveExistingDeliveryPlan(input))
      .resolves.toEqual({ status: "indeterminate", reason: "ambiguous-subject" });
  });
});
