import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { RepositoryDeliveryPlanStore, RepositoryDeliveryStateStore } from
  "../../src/lib/delivery/local-stores.js";
import { DeliveryPlanV1Codec } from "../../src/lib/delivery/plan.js";
import { RepositoryGitCommonStatePublisher } from "../../src/lib/git-common-state.js";
import { createReviewTarget } from "../../src/scripts/review-gate/core/gate-contract-v2.js";
import { DeliveryBindingLookup } from "../../src/scripts/review-gate/core/delivery-binding-lookup.js";
import { deliveryPlanFixture } from "../fixtures/delivery-plan.js";
import { deliveryStateFixture } from "../fixtures/delivery-state.js";
import { cleanupTempDir, createTempRepo, makeGitExec } from "../helpers/integration.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map(cleanupTempDir));
});

function target() {
  return createReviewTarget({
    schemaVersion: 2,
    semanticsVersion: "review-gate/v2",
    kind: "change-set",
    repositoryId: "repository",
    baseRef: "main",
    diffBaseSha: "a".repeat(40),
    diffBaseTree: "b".repeat(40),
    headSha: "c".repeat(40),
    headTree: "d".repeat(40),
  });
}

function repositoryLookup(cwd: string) {
  const publisher = new RepositoryGitCommonStatePublisher(makeGitExec(cwd), cwd);
  const plans = new RepositoryDeliveryPlanStore(publisher, DeliveryPlanV1Codec);
  const states = new RepositoryDeliveryStateStore(publisher);
  return {
    plans,
    states,
    lookup: new DeliveryBindingLookup({
      enumeratePlans: () => plans.enumerateCurrent(),
      readState: (planId) => states.read(planId),
      resolveMember: (input) => states.resolveMember(input),
    }),
  };
}

describe("repository delivery binding lookup", () => {
  it("resolves a coherent terminal change-set through Git-common plan and state stores", async () => {
    const cwd = await createTempRepo("arc-review-delivery-binding-");
    roots.push(cwd);
    const { plans, states, lookup } = repositoryLookup(cwd);
    const plan = deliveryPlanFixture();
    const state = deliveryStateFixture(plan);
    expect(await plans.publishCurrent(plan.planId, plan, null)).toMatchObject({ status: "ok" });
    expect(await states.publish(plan.planId, state, 0)).toMatchObject({ status: "ok" });

    await expect(lookup.resolve({ target: target(), workUnitId: plan.workUnitId }))
      .resolves.toEqual({ status: "bound", planId: plan.planId });
  });

  it("contains namespace corruption and publisher failure as unavailable evidence", async () => {
    const corruptRoot = await createTempRepo("arc-review-delivery-binding-corrupt-");
    roots.push(corruptRoot);
    const corrupt = repositoryLookup(corruptRoot);
    const plan = deliveryPlanFixture();
    expect(await corrupt.plans.publishCurrent(plan.planId, plan, null)).toMatchObject({ status: "ok" });
    await mkdir(join(corruptRoot, ".git", "arc", "delivery", "plans", "unexpected-directory"), {
      recursive: true,
    });
    await expect(corrupt.lookup.resolve({ target: target(), workUnitId: plan.workUnitId }))
      .resolves.toEqual({ status: "unavailable", reason: "namespace-corrupt" });

    const missingRoot = join(corruptRoot, "not-a-repository");
    await mkdir(missingRoot);
    const missing = repositoryLookup(missingRoot);
    await expect(missing.lookup.resolve({ target: target(), workUnitId: plan.workUnitId }))
      .resolves.toMatchObject({ status: "unavailable" });
  });
});
