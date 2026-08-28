import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import type { MetaRecord } from "../../src/lib/active/meta-reader.js";
import { MetaRecordSchema } from "../../src/lib/active/meta-schema.js";
import { RepositoryDeliveryStateStore } from "../../src/lib/delivery/local-stores.js";
import {
  DeliveryStateV1Schema,
  type DeliveryStateV1,
} from "../../src/lib/delivery/schema.js";
import { createExecaGitExec } from "../../src/lib/git/process-executor.js";
import { RepositoryGitCommonStatePublisher } from "../../src/lib/git-common-state.js";
import { canonicalDigest, SlugSchema } from "../../src/lib/kernel/index.js";

const PLAN_ID = "8ddfd842-4c92-4ccb-9958-ae47b43e2c44";
const WORK_UNIT = SlugSchema.parse("review-surface-binding");
const OWNER = "andrew";
const EVALUATOR = "fresh-reviewer";
const REPOSITORY_ID = "12345678-1234-1234-1234-123456789abc";
const REPOSITORY = "owner/repository";

const exec = createExecaGitExec();
const roots: string[] = [];

const meta: MetaRecord = MetaRecordSchema.parse({
  state: "Active",
  owner: OWNER,
  branch: "feature",
  workClass: "Heavy",
  priority: "P1",
  cohort: null,
  dependsOn: [],
  origin: "internal",
  design: [`spec-${WORK_UNIT}.md`],
  taskList: `tasks-${WORK_UNIT}.md`,
  reviewRubric: null,
  promotionReceipt: null,
  candidateId: null,
  currentWorkflow: null,
  lastCompleted: null,
  nextTask: null,
  blockers: null,
  nextAction: null,
  prUrl: null,
  completed: null,
});

// The originating locus resolves to its work unit. Pinned here because the reader
// takes the active ARC identity from ambient Git config, which no temporary
// repository owns; everything below it — the delivery read, the derivation, and
// the adapters that join them — runs for real.
vi.mock("../../src/scripts/review-gate/hosts/local/live-context.js", () => ({
  readLocalReviewLiveContext: async () => ({
    meta,
    context: {
      activeIdentity: OWNER,
      workUnit: { identity: WORK_UNIT, owner: OWNER },
      errand: null,
    },
  }),
}));

const { createLocalPrepareDependencies } = await import(
  "../../src/scripts/review-gate/runtime/local-prepare-composition.js"
);
const { createLocalAttestDependencies } = await import(
  "../../src/scripts/review-gate/runtime/local-attest-composition.js"
);

afterEach(async () => {
  await Promise.all(roots.splice(0).map(async (root) => rm(root, { recursive: true, force: true })));
});

async function git(cwd: string, ...args: string[]): Promise<string> {
  return (await exec("git", args, { cwd })).stdout.trim();
}

interface Stack {
  root: string;
  predecessorSha: string;
  memberSha: string;
  successorSha: string;
  deliverableId: string;
}

function deliverableId(index: number): string {
  return canonicalDigest({ member: index, planId: PLAN_ID });
}

function state(stack: Omit<Stack, "deliverableId">, memberTree: string): DeliveryStateV1 {
  return DeliveryStateV1Schema.parse({
    schemaVersion: 1,
    semanticsVersion: "delivery-state/v1",
    planId: PLAN_ID,
    workUnitId: WORK_UNIT,
    boundPlan: { planRevision: 1, planDigest: canonicalDigest({ planId: PLAN_ID, revision: 1 }) },
    target: null,
    members: [
      {
        deliverableId: deliverableId(0),
        ref: "opaque-member-0",
        changeRequest: null,
        coordinates: {
          base: stack.predecessorSha,
          head: stack.memberSha,
          tree: memberTree,
        },
      },
      {
        deliverableId: deliverableId(1),
        ref: "opaque-member-1",
        changeRequest: null,
        coordinates: {
          base: stack.memberSha,
          head: stack.successorSha,
          tree: memberTree,
        },
      },
    ],
    activeOperation: null,
    pendingReviewFixVerification: null,
  });
}

/**
 * An originating locus mid-stack: two members landed, a successor written on top, and
 * an uncommitted edit — the state that is normal while member work continues.
 */
async function boundStack(): Promise<Stack> {
  const root = await mkdtemp(join(tmpdir(), "arc-local-member-binding-"));
  roots.push(root);
  await git(root, "init", "-b", "main");
  await git(root, "config", "user.name", "ARC Test");
  await git(root, "config", "user.email", "arc@example.test");
  await writeFile(join(root, "tracked.txt"), "initial\n", "utf8");
  await git(root, "add", "tracked.txt");
  await git(root, "commit", "-m", "initial");

  await git(root, "switch", "-c", "feature");
  await writeFile(join(root, "tracked.txt"), "predecessor\n", "utf8");
  await git(root, "commit", "-am", "predecessor");
  const predecessorSha = await git(root, "rev-parse", "HEAD");
  await writeFile(join(root, "tracked.txt"), "member\n", "utf8");
  await git(root, "commit", "-am", "member");
  const memberSha = await git(root, "rev-parse", "HEAD");
  await writeFile(join(root, "tracked.txt"), "successor\n", "utf8");
  await git(root, "commit", "-am", "successor");
  const successorSha = await git(root, "rev-parse", "HEAD");
  await writeFile(join(root, "tracked.txt"), "uncommitted\n", "utf8");

  const stack = { root, predecessorSha, memberSha, successorSha };
  const store = new RepositoryDeliveryStateStore(
    new RepositoryGitCommonStatePublisher(exec, root),
  );
  const memberTree = await git(root, "rev-parse", `${memberSha}^{tree}`);
  const published = await store.publish(PLAN_ID, state(stack, memberTree), 0);
  expect(published.status).toBe("ok");

  return { ...stack, deliverableId: deliverableId(0) };
}

describe("local review delivery binding at its composition root", () => {
  it("carries a selector through preparation to the repository's own delivery state", async () => {
    const stack = await boundStack();
    const prepare = createLocalPrepareDependencies({ exec, cwd: stack.root });

    const resolved = await prepare.resolveAuthority(EVALUATOR, stack.memberSha);

    // An unbound lookup fails closed as `delivery-state-unavailable`, so a member
    // vehicle here is only reachable when the adapter both forwards the selector
    // and injects the repository-bound port.
    expect(resolved).toMatchObject({
      authority: {
        vehicle: { kind: "delivery-member", identity: stack.deliverableId },
        authorIdentity: OWNER,
        evaluatorIdentity: EVALUATOR,
      },
      member: { base: stack.predecessorSha, head: stack.memberSha },
    });
  });

  it("routes the resolved coordinates into a member target rather than the checkout's", async () => {
    const stack = await boundStack();
    const prepare = createLocalPrepareDependencies({ exec, cwd: stack.root });
    const { member } = await prepare.resolveAuthority(EVALUATOR, stack.memberSha);

    const target = await prepare.deriveTarget(REPOSITORY_ID, member ?? undefined);

    expect(target).toMatchObject({
      kind: "delivery-member",
      baseRef: "main",
      diffBaseSha: stack.predecessorSha,
      headSha: stack.memberSha,
    });
  });

  it("re-derives the same member vehicle at attestation from the head alone", async () => {
    const stack = await boundStack();
    const attest = createLocalAttestDependencies({ exec, cwd: stack.root });

    // Attestation reads the selector back from its persisted target, so this is
    // the head a member operation would supply. Dropping the forward yields a
    // work-unit vehicle, which the command's own comparison then refuses.
    await expect(attest.resolveAuthority(EVALUATOR, stack.memberSha)).resolves.toMatchObject({
      vehicle: { kind: "delivery-member", identity: stack.deliverableId },
    });
    await expect(attest.resolveAuthority(EVALUATOR)).resolves.toMatchObject({
      vehicle: { kind: "work-unit", identity: WORK_UNIT },
    });
  });

  it("refuses the plan's final member and a member of no plan at this locus", async () => {
    const stack = await boundStack();
    const prepare = createLocalPrepareDependencies({ exec, cwd: stack.root });

    await expect(prepare.resolveAuthority(EVALUATOR, stack.successorSha))
      .rejects.toMatchObject({ reason: "delivery-member-terminal" });
    await expect(prepare.resolveAuthority(EVALUATOR, "f".repeat(40)))
      .rejects.toMatchObject({ reason: "delivery-member-unbound" });
  });

  it("authenticates the final member only through its exact driver admission", async () => {
    const stack = await boundStack();
    const vehicle = {
      kind: "delivery-member" as const,
      planId: PLAN_ID,
      deliverableId: deliverableId(1),
      workUnitId: WORK_UNIT,
      head: stack.successorSha,
    };
    const dependencies = createLocalPrepareDependencies({ exec, cwd: stack.root });

    await expect(dependencies.resolveAuthority(
      EVALUATOR,
      stack.successorSha,
      {
        schemaVersion: 1,
        sourceId: "delegated-agent",
        statusTarget: {
          repository: REPOSITORY,
          headRef: "feature",
          headSha: stack.successorSha,
        },
        target: {
          repository: REPOSITORY,
          pullRequest: 42,
          headSha: stack.successorSha,
        },
        vehicle,
        pass: 1,
      },
    )).resolves.toMatchObject({
      authority: { vehicle: { kind: "delivery-member", identity: vehicle.deliverableId } },
      member: { base: stack.memberSha, head: stack.successorSha },
    });
  });

  it("leaves the no-selector path reading the checkout, dirt and all", async () => {
    const stack = await boundStack();
    const prepare = createLocalPrepareDependencies({ exec, cwd: stack.root });

    await expect(prepare.resolveAuthority(EVALUATOR)).resolves.toEqual({
      authority: expect.objectContaining({
        vehicle: { kind: "work-unit", identity: WORK_UNIT },
      }),
      member: null,
    });
    // The originating locus is dirty, which is what an ordinary derivation refuses —
    // and what a forgotten selector therefore runs into rather than silently
    // reviewing the work-unit branch in the member's place.
    await expect(prepare.deriveTarget(REPOSITORY_ID))
      .rejects.toMatchObject({ code: "invalid-input", reason: "dirty-worktree" });
  });
});
