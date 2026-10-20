/** Default review readers resolve adopted branches through stored work-unit links. */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it, onTestFinished } from "vitest";
import { createReviewRepositoryHarness } from "../helpers/store/review-differential.js";
import { handleReviewChunkingResolve } from "../../src/handlers/review.js";
import { RepositoryDeliveryPlanStore, RepositoryDeliveryStateStore } from "../../src/lib/delivery/local-stores.js";
import { DeliveryPlanV1Codec } from "../../src/lib/delivery/plan.js";
import { RepositoryGitCommonStatePublisher } from "../../src/lib/git-common-state.js";
import { deliveryStackPlanForWorkUnitFixture } from "../fixtures/delivery-plan.js";
import { deliveryStateFixture } from "../fixtures/delivery-state.js";

const projectId = "123e4567-e89b-42d3-a456-426614174099";

it("uses a stored adopted work unit for default chunking and leaves an unlinked branch unbound", async () => {
  const h = await createReviewRepositoryHarness();
  onTestFinished(h.cleanup);
  const { cwd, exec } = h.native;
  await h.reference.seedProject(projectId);
  await h.reference.seedMeta("example", { branch: null }, { kind: "active" }, {
    branches: [{ repository: projectId, ref: "topic/opaque", linkedAs: "adopted", excluded: [] }],
  });
  await mkdir(join(cwd, ".arc/system"), { recursive: true });
  await writeFile(join(cwd, ".arc/system/arc-config.yml"),
    "branch.base: main\nchangeset.advisory_threshold_lines: 1\nchangeset.advisory_threshold_files: 1\n");
  await exec("git", ["add", "."], { cwd });
  await exec("git", ["commit", "-m", "Configure review fixture"], { cwd });
  const base = (await exec("git", ["rev-parse", "HEAD"], { cwd })).stdout.trim();
  await exec("git", ["switch", "-c", "topic/opaque"], { cwd });
  await writeFile(join(cwd, "example.ts"), "export const example = true;\n");
  await exec("git", ["add", "example.ts"], { cwd });
  await exec("git", ["commit", "-m", "Implement example"], { cwd });
  const head = (await exec("git", ["rev-parse", "HEAD"], { cwd })).stdout.trim();
  const publisher = new RepositoryGitCommonStatePublisher(exec, cwd);
  const plans = new RepositoryDeliveryPlanStore(publisher, DeliveryPlanV1Codec);
  const states = new RepositoryDeliveryStateStore(publisher);
  const plan = deliveryStackPlanForWorkUnitFixture("example");
  expect(await plans.publishCurrent(plan.planId, plan, null)).toMatchObject({ status: "ok" });
  expect(await states.publish(plan.planId, deliveryStateFixture(plan), 0)).toMatchObject({ status: "ok" });
  const run = async () => {
    let output = "";
    await handleReviewChunkingResolve("-", { resolveRoot: () => cwd,
      readText: async () => JSON.stringify({ schemaVersion: 1,
        target: { kind: "change-set", baseRef: "main", diffBaseSha: base, headSha: head } }),
      write: value => { output += value; }, setExitCode: () => {} }, undefined, { store: h.reference.store });
    return JSON.parse(output) as unknown;
  };
  const bound = await run();
  expect(bound, JSON.stringify(bound)).toMatchObject({ state: "delivery-bound",
    payload: { planId: plan.planId, remedy: "continue-bound-delivery" } });
  await exec("git", ["switch", "-c", "topic/unlinked"], { cwd });
  const unbound = await run();
  expect(unbound, JSON.stringify(unbound)).toMatchObject({ state: "consider-chunks" });
}, 30_000);
