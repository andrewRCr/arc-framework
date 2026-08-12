import { access, chmod, mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  RepositoryDeliveryPlanStore,
  RepositoryDeliveryStateStore,
} from "../../src/lib/delivery/local-stores.js";
import { DeliveryPlanV1Codec } from "../../src/lib/delivery/plan.js";
import type { GitExec } from "../../src/lib/git/exec.js";
import { RepositoryGitCommonStatePublisher } from "../../src/lib/git-common-state.js";
import { readDeliveryPositionView } from "../../src/lib/session-init/delivery-position.js";
import { deliveryStackPlanFixture } from "../fixtures/delivery-plan.js";
import { deliveryStateFixture } from "../fixtures/delivery-state.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map(async (root) => rm(root, { recursive: true, force: true })));
});

async function stores() {
  const root = await mkdtemp(join(tmpdir(), "arc-session-delivery-readonly-"));
  roots.push(root);
  const commonDir = join(root, "common.git");
  await mkdir(commonDir, { recursive: true });
  const exec: GitExec = async () => ({ stdout: `${commonDir}\n` });
  const publisher = new RepositoryGitCommonStatePublisher(exec, root);
  return {
    commonDir,
    plans: new RepositoryDeliveryPlanStore(publisher, DeliveryPlanV1Codec),
    states: new RepositoryDeliveryStateStore(publisher),
  };
}

describe("session-init delivery position — read-only Git common state", () => {
  it.skipIf(process.platform === "win32")(
    "leaves an absent delivery namespace unmaterialized",
    async () => {
      const records = await stores();
      await chmod(records.commonDir, 0o500);
      try {
        await expect(readDeliveryPositionView("delivery-plan-record", {
          plans: { enumerateCurrentReadOnly: () => records.plans.enumerateCurrentReadOnly() },
          states: records.states,
          observe: async () => { throw new Error("authoritative absence must not observe"); },
        })).resolves.toEqual({ status: "ok", value: null });
        await expect(access(join(records.commonDir, "arc"))).rejects.toMatchObject({ code: "ENOENT" });
      } finally {
        await chmod(records.commonDir, 0o700);
      }
    },
  );

  it.skipIf(process.platform === "win32")(
    "reads a bound plan and state without acquiring the publication lock",
    async () => {
      const records = await stores();
      const plan = deliveryStackPlanFixture();
      const state = deliveryStateFixture(plan);
      await records.plans.publishCurrent(plan.planId, plan, null);
      await records.states.publish(plan.planId, state, 0);
      const planDirectory = join(records.commonDir, "arc", "delivery", "plans");
      const stateDirectory = join(records.commonDir, "arc", "delivery", "state");
      await Promise.all([chmod(planDirectory, 0o500), chmod(stateDirectory, 0o500)]);
      try {
        await expect(readDeliveryPositionView(plan.workUnitId, {
          plans: { enumerateCurrentReadOnly: () => records.plans.enumerateCurrentReadOnly() },
          states: records.states,
          observe: async () => ({
            status: "observed",
            facts: { target: state.target, members: state.members, landedDeliverableIds: [] },
            operationObservation: null,
          }),
        })).resolves.toMatchObject({
          status: "ok",
          value: { planId: plan.planId, landedCount: 0, totalCount: 2 },
        });
        expect(await readdir(planDirectory)).toEqual([`${plan.planId}.json`]);
      } finally {
        await Promise.all([chmod(planDirectory, 0o700), chmod(stateDirectory, 0o700)]);
      }
    },
  );
});
