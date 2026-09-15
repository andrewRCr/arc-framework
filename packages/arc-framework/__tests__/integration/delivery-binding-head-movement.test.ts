import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

import { closeoutCompletedDelivery } from "../../src/lib/delivery/closeout.js";
import {
  RepositoryDeliveryPlanStore,
  RepositoryDeliveryStateStore,
} from "../../src/lib/delivery/local-stores.js";
import { DeliveryPlanV1Codec } from "../../src/lib/delivery/plan.js";
import { DeliveryStateV1Schema, type DeliveryStateV1 } from "../../src/lib/delivery/schema.js";
import { RepositoryGitCommonStatePublisher } from "../../src/lib/git-common-state.js";
import { cleanupTempDir, createTempRepo, makeCommit, makeGitExec } from "../helpers/integration.js";
import { expectPinnedObservation } from "../helpers/pinned-observation.js";
import { deliveryStackPlanFixture } from "../fixtures/delivery-plan.js";

const execFileAsync = promisify(execFile);

const PLAN_ID = "8ddfd842-4c92-4ccb-9958-ae47b43e2c44";
const WORK_UNIT = "delivery-plan-record";
const REPOSITORY = "owner/repo";
const TERMINAL_BRANCH = "feat/delivery-plan-record";
const plan = deliveryStackPlanFixture(PLAN_ID);

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map(cleanupTempDir));
});

/** A terminal member bound to one exact head, over a repository that has since advanced past it. */
interface BoundTerminal {
  readonly cwd: string;
  readonly gitCommonDir: string;
  readonly bound: string;
  readonly advanced: string;
}

async function tree(cwd: string, revision: string): Promise<string> {
  const { stdout } = await execFileAsync("git", ["rev-parse", `${revision}^{tree}`], { cwd });
  return stdout.trim();
}

function state(base: string, boundHead: string, boundTree: string): DeliveryStateV1 {
  return DeliveryStateV1Schema.parse({
    schemaVersion: 1,
    semanticsVersion: "delivery-state/v1",
    planId: PLAN_ID,
    workUnitId: WORK_UNIT,
    boundPlan: { planRevision: plan.planRevision, planDigest: plan.planDigest },
    target: { ref: "refs/heads/main", coordinates: null },
    members: [
      {
        deliverableId: plan.members[0]!.deliverableId,
        ref: `refs/heads/delivery/${WORK_UNIT}/00`,
        changeRequest: { providerId: "github", changeRequestId: "619" },
        coordinates: { base, head: base, tree: boundTree },
      },
      {
        deliverableId: plan.members[1]!.deliverableId,
        ref: `refs/heads/${TERMINAL_BRANCH}`,
        changeRequest: { providerId: "github", changeRequestId: "620" },
        coordinates: { base, head: boundHead, tree: boundTree },
      },
    ],
    activeOperation: null,
    pendingReviewFixVerification: null,
  });
}

/** Publish a plan and a state whose terminal member binds the commit before the current head. */
async function boundTerminal(): Promise<BoundTerminal> {
  const cwd = await createTempRepo("arc-delivery-binding-head-");
  roots.push(cwd);
  const base = await makeCommit(cwd, "root");
  const bound = await makeCommit(cwd, "terminal contribution");
  const advanced = await makeCommit(cwd, "archival record write");
  const publisher = new RepositoryGitCommonStatePublisher(makeGitExec(cwd), cwd);
  const planStore = new RepositoryDeliveryPlanStore(publisher, DeliveryPlanV1Codec);
  expect((await planStore.publishCurrent(PLAN_ID, plan, null)).status).toBe("ok");
  const stateStore = new RepositoryDeliveryStateStore(publisher);
  const published = await stateStore.publish(PLAN_ID, state(base, bound, await tree(cwd, bound)), 0);
  expect(published.status).toBe("ok");
  const { stdout } = await execFileAsync("git", ["rev-parse", "--absolute-git-dir"], { cwd });
  return { cwd, gitCommonDir: stdout.trim(), bound, advanced };
}

/** Close out the published delivery against a host reporting the terminal merged at `mergedHead`. */
async function closeoutAgainstMergedHead(
  fixture: BoundTerminal,
  mergedHead: string,
): Promise<{ status: string; reason?: string }> {
  const publisher = new RepositoryGitCommonStatePublisher(makeGitExec(fixture.cwd), fixture.cwd);
  const unreached = (label: string) => async () => {
    throw new Error(`${label} must not be reached while the terminal is unverified`);
  };
  const result = await closeoutCompletedDelivery(
    { workUnitId: WORK_UNIT, repository: REPOSITORY, remote: "origin" },
    {
      planStore: new RepositoryDeliveryPlanStore(publisher, DeliveryPlanV1Codec),
      stateStore: new RepositoryDeliveryStateStore(publisher),
      gitCommonDir: fixture.gitCommonDir,
      renameAuthority: { status: "established", ref: "refs/heads/main" },
      renameTransitionSource: { enumerate: async () => ({ status: "ok", value: [] }) },
      residue: {
        observeRefreshCandidates: async () => ({ status: "observed", candidates: [] }),
        observeCandidate: async () => ({ status: "absent" }),
        observeGate: async () => ({ status: "absent" }),
        deleteCandidate: unreached("candidate deletion"),
        deleteRefreshCandidate: unreached("refresh-candidate deletion"),
        removeGate: unreached("gate removal"),
        deleteLocalMember: async () => ({ status: "deleted" }),
        deleteRemoteMember: async () => ({ status: "deleted" }),
      },
      retirement: {
        observeLocalRef: async () => ({ status: "absent" }),
        observeRemoteRef: async () => ({ status: "absent" }),
        readTerminalRequest: async () => ({
          status: "observed",
          request: {
            binding: { providerId: "github", changeRequestId: "620" },
            repository: REPOSITORY,
            headRepository: REPOSITORY,
            headRef: TERMINAL_BRANCH,
            headSha: mergedHead,
            baseRef: "main",
            state: "merged",
            draft: false,
          },
        }),
      },
    },
  );
  return result.status === "blocked"
    ? { status: result.status, reason: result.reason }
    : { status: result.status };
}

describe("delivery closeout against a terminal head that advanced under its binding", () => {
  it("settles a terminal the host merged at the exact head it binds", async () => {
    const fixture = await boundTerminal();

    expect(await closeoutAgainstMergedHead(fixture, fixture.bound)).toEqual({ status: "closed-out" });
  });

  it("retires a terminal the host merged at a descendant of the head it binds", async () => {
    const fixture = await boundTerminal();

    expectPinnedObservation(await closeoutAgainstMergedHead(fixture, fixture.advanced), {
      behavior:
        "A terminal whose branch advanced past its bound head and then merged is the same landed " +
        "contribution, so closeout should retire it rather than report the terminal unsettled.",
      observed: { status: "blocked", reason: "terminal-unsettled" },
      target: { status: "closed-out" },
    });
  });
});
