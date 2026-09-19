import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

import { defaultMergeLockPort, handleReviewReadiness } from "../../src/handlers/review.js";
import {
  RepositoryDeliveryPlanStore,
  RepositoryDeliveryStateStore,
} from "../../src/lib/delivery/local-stores.js";
import { DeliveryPlanV1Codec } from "../../src/lib/delivery/plan.js";
import {
  DeliveryStateV1Schema,
  type DeliveryStateV1,
} from "../../src/lib/delivery/schema.js";
import { RepositoryGitCommonStatePublisher } from "../../src/lib/git-common-state.js";
import type { HostedProcessRunner } from "../../src/scripts/review-gate/hosted/gh-process.js";
import {
  MergeLockTransitionRequestSchema,
  releaseMergeLock,
  type MergeLockTransitionRequest,
} from "../../src/scripts/review-gate/merge-lock.js";
import { cleanupTempDir, createTempRepo, makeCommit, makeGitExec } from "../helpers/integration.js";
import { deliveryStackPlanFixture } from "../fixtures/delivery-plan.js";

const PLAN_ID = "8ddfd842-4c92-4ccb-9958-ae47b43e2c44";
const HEAD = "a".repeat(40);
const BASE = "c".repeat(40);
const TREE = "b".repeat(40);
const WORK_UNIT = "delivery-plan-record";
const plan = deliveryStackPlanFixture(PLAN_ID);

const execFileAsync = promisify(execFile);

async function tree(cwd: string, revision: string): Promise<string> {
  const { stdout } = await execFileAsync("git", ["rev-parse", `${revision}^{tree}`], { cwd });
  return stdout.trim();
}

async function parentOf(cwd: string, revision: string): Promise<string> {
  const { stdout } = await execFileAsync("git", ["rev-parse", `${revision}^`], { cwd });
  return stdout.trim();
}

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map(cleanupTempDir));
});

function state(
  boundHead: string = HEAD,
  boundBase: string = BASE,
  boundTree: string = TREE,
  successorHead: string = "d".repeat(40),
): DeliveryStateV1 {
  return DeliveryStateV1Schema.parse({
    schemaVersion: 1,
    semanticsVersion: "delivery-state/v1",
    planId: PLAN_ID,
    workUnitId: WORK_UNIT,
    boundPlan: { planRevision: plan.planRevision, planDigest: plan.planDigest },
    target: null,
    members: [
      {
        deliverableId: plan.members[0]!.deliverableId,
        ref: "opaque-member-0",
        changeRequest: null,
        coordinates: { base: boundBase, head: boundHead, tree: boundTree },
      },
      {
        deliverableId: plan.members[1]!.deliverableId,
        ref: "opaque-member-1",
        changeRequest: null,
        coordinates: { base: boundHead, head: successorHead, tree: TREE },
      },
    ],
    activeOperation: null,
    pendingReviewFixVerification: null,
  });
}

const DELIVERABLE_ID = plan.members[0]!.deliverableId;

/** A repository whose Git-common delivery state binds {@link HEAD} to a member. */
async function boundRepository(): Promise<string> {
  const cwd = await createTempRepo("arc-review-readiness-binding-");
  roots.push(cwd);
  const publisher = new RepositoryGitCommonStatePublisher(makeGitExec(cwd), cwd);
  const planStore = new RepositoryDeliveryPlanStore(publisher, DeliveryPlanV1Codec);
  const planPublished = await planStore.publishCurrent(PLAN_ID, plan, null);
  expect(planPublished.status).toBe("ok");
  const store = new RepositoryDeliveryStateStore(publisher);
  const published = await store.publish(PLAN_ID, state(), 0);
  expect(published.status).toBe("ok");
  return cwd;
}

/** A repository with no delivery state at all — every head resolves unbound. */
async function unboundRepository(): Promise<string> {
  const cwd = await createTempRepo("arc-review-readiness-unbound-");
  roots.push(cwd);
  return cwd;
}

function memberRequest(treeRoot: string, headSha: string = HEAD) {
  return {
    schemaVersion: 1,
    treeRoot,
    target: { repository: "owner/repo", pullRequest: 42, headSha },
    pullRequest: {
      repository: "owner/repo",
      number: 42,
      state: "open",
      headBranch: "delivery/plan/00",
      headSha,
    },
    vehicle: {
      kind: "delivery-member",
      planId: PLAN_ID,
      deliverableId: DELIVERABLE_ID,
      workUnitSlug: WORK_UNIT,
    },
  };
}

function transitionRequest(treeRoot: string): MergeLockTransitionRequest {
  return MergeLockTransitionRequestSchema.parse({
    schemaVersion: 1,
    treeRoot,
    target: { repository: "owner/repo", pullRequest: 42, headSha: HEAD },
    vehicle: {
      kind: "delivery-member",
      planId: PLAN_ID,
      deliverableId: DELIVERABLE_ID,
      workUnitSlug: WORK_UNIT,
    },
  });
}

async function runReadinessHandler(
  resolvedRoot: string,
  suppliedTreeRoot: string,
  headSha: string = HEAD,
): Promise<{ state: string; diagnostics: { code: string }[] }> {
  let written = "";
  await handleReviewReadiness("request.json", {
    resolveRoot: () => resolvedRoot,
    readText: async () => JSON.stringify(memberRequest(suppliedTreeRoot, headSha)),
    write: (text) => {
      written += text;
    },
    setExitCode: () => undefined,
  });
  return JSON.parse(written) as { state: string; diagnostics: { code: string }[] };
}

async function writeLockConfig(root: string): Promise<void> {
  await mkdir(join(root, ".arc", "system"), { recursive: true });
  await writeFile(join(root, ".arc", "system", "arc-config.yml"), "merge.lock: draft\n", "utf8");
}

function ghRunner(): HostedProcessRunner {
  return {
    run: async (args) => {
      if (args[0] === "repo") {
        return {
          stdout: JSON.stringify({
            nameWithOwner: "owner/repo",
            defaultBranchRef: { name: "main" },
          }),
          stderr: "",
        };
      }
      if (args[0] === "api") {
        return {
          stdout: JSON.stringify({
            number: 42,
            state: "open",
            draft: true,
            head: { ref: "delivery/plan/00", sha: HEAD },
            base: { repo: { full_name: "owner/repo" } },
          }),
          stderr: "",
        };
      }
      return { stdout: "", stderr: "" };
    },
  };
}

describe("readiness delivery binding at its composition roots", () => {
  it("binds the readiness handler's port to the root it resolves, not the supplied tree root", async () => {
    const bound = await boundRepository();
    const unbound = await unboundRepository();

    const resolvedFromBound = await runReadinessHandler(bound, unbound);
    const resolvedFromUnbound = await runReadinessHandler(unbound, bound);

    expect(resolvedFromBound.state).toBe("ready");
    // No plan in that repository carries the work unit, which is a different miss from a plan that
    // carries the member with no head recorded for it.
    expect(resolvedFromUnbound).toMatchObject({
      state: "invalid",
      diagnostics: [{ code: "delivery-plan-absent" }],
    });
  });

  it("authenticates a merge-lock release against the repository its port was constructed with", async () => {
    const bound = await boundRepository();
    const unbound = await unboundRepository();
    await writeLockConfig(bound);
    await writeLockConfig(unbound);
    const runner = ghRunner();

    const releasedFromBound = await releaseMergeLock(
      transitionRequest(unbound),
      defaultMergeLockPort(bound, runner),
    );
    const releasedFromUnbound = await releaseMergeLock(
      transitionRequest(bound),
      defaultMergeLockPort(unbound, runner),
    );

    expect(releasedFromBound).toMatchObject({ state: "released", nextAction: "proceed" });
    expect(releasedFromUnbound).toMatchObject({
      state: "blocked",
      payload: { reason: "readiness-failed" },
      diagnostics: expect.arrayContaining([
        expect.objectContaining({ code: "delivery-plan-absent" }),
      ]),
    });
  });

  it("leaves neither reaching path's port unbound for want of wiring", async () => {
    const bound = await boundRepository();
    await writeLockConfig(bound);

    const readiness = await runReadinessHandler(bound, bound);
    const release = await releaseMergeLock(
      transitionRequest(bound),
      defaultMergeLockPort(bound, ghRunner()),
    );

    expect(JSON.stringify(readiness)).not.toContain("delivery-state-unavailable");
    expect(JSON.stringify(release)).not.toContain("delivery-state-unavailable");
  });
});

/**
 * A repository whose delivery state binds a member to a head its branch has since advanced past
 * by a commit that changes nothing.
 */
async function staleBoundRepository(): Promise<{
  cwd: string;
  bound: string;
  advanced: string;
  successor: string;
}> {
  const cwd = await createTempRepo("arc-review-readiness-stale-");
  roots.push(cwd);
  const root = await makeCommit(cwd, "root");
  const bound = await makeCommit(cwd, "member contribution");
  const advanced = await makeCommit(cwd, "record-only advance");
  // The member above this one, at a real commit rather than a synthetic id: the advance is admitted by
  // where it sits between the two recorded heads, so a successor nothing can resolve would leave the upper
  // half of that judgement untested here.
  const successor = await makeCommit(cwd, "next member contribution");
  const publisher = new RepositoryGitCommonStatePublisher(makeGitExec(cwd), cwd);
  const planStore = new RepositoryDeliveryPlanStore(publisher, DeliveryPlanV1Codec);
  expect((await planStore.publishCurrent(PLAN_ID, plan, null)).status).toBe("ok");
  const store = new RepositoryDeliveryStateStore(publisher);
  // The advance changes nothing, and the bound tree is the evidence of that — so it has to be the real
  // one the bound commit carries, not a synthetic id no comparison could ever satisfy.
  const boundTree = await tree(cwd, bound);
  expect((await store.publish(PLAN_ID, state(bound, root, boundTree, successor), 0)).status).toBe("ok");
  return { cwd, bound, advanced, successor };
}

/** The result reduced to the fields that carry its identity. */
function outcome(result: { state: string; diagnostics: { code: string }[] }): {
  state: string;
  diagnostics: readonly string[];
} {
  return { state: result.state, diagnostics: result.diagnostics.map((entry) => entry.code) };
}

/** A repository whose plan holds the member and whose state records no head for it. */
async function plannedUnboundRepository(): Promise<string> {
  const cwd = await createTempRepo("arc-review-readiness-planned-");
  roots.push(cwd);
  const publisher = new RepositoryGitCommonStatePublisher(makeGitExec(cwd), cwd);
  const planStore = new RepositoryDeliveryPlanStore(publisher, DeliveryPlanV1Codec);
  expect((await planStore.publishCurrent(PLAN_ID, plan, null)).status).toBe("ok");
  return cwd;
}

describe("readiness against a member head that advanced under its binding", () => {
  it("admits a head that advanced under its binding, apart from one nothing binds", async () => {
    const { cwd, advanced } = await staleBoundRepository();
    const planned = await plannedUnboundRepository();

    const stale = outcome(await runReadinessHandler(cwd, cwd, advanced));
    const absent = outcome(await runReadinessHandler(planned, planned, advanced));

    // The member is still the reviewed member: its recorded head is an ancestor of the head under
    // review, so the movement is append-only and the gate below still holds the observed head exact.
    expect(stale).toEqual({ state: "ready", diagnostics: [] });
    // And the binding nothing records reports that, rather than the same word the advance used to get.
    expect(absent).toEqual({ state: "invalid", diagnostics: ["delivery-member-unbound"] });
  });

  it("reports a head its binding does not contain without claiming nothing is bound", async () => {
    const { cwd, bound } = await staleBoundRepository();
    const planned = await plannedUnboundRepository();

    // The bound head is a descendant of the root commit, so a review of the root is a head the
    // binding does not contain — neither the recorded head nor an advance past it.
    const behind = outcome(await runReadinessHandler(cwd, cwd, await parentOf(cwd, bound)));
    const absent = outcome(await runReadinessHandler(planned, planned, bound));

    expect(behind).toEqual({ state: "invalid", diagnostics: ["delivery-member-stale"] });
    expect(behind).not.toEqual(absent);
  });

  it("refuses a head that advanced as far as the member bound above it", async () => {
    const { cwd, successor } = await staleBoundRepository();

    const reached = outcome(await runReadinessHandler(cwd, cwd, successor));

    // Members stack, so the head recorded for the one above is a descendant of this one's recorded head and
    // would otherwise read as this member's own append-only advance. It is not: it is the other member's
    // head, and a review of it belongs to the other member's vehicle.
    expect(reached).toEqual({ state: "invalid", diagnostics: ["delivery-member-successor-reached"] });
  });
});
