/** Public delivery execution preserves a supplied operational backend. */
import { expect, it } from "vitest";
import { positionFixture } from "../helpers/delivery-position-suite.js";
import { runHandlerAt } from "../helpers/handler.js";
import { makeInteractionContext } from "../helpers/interaction-context.js";
import { createReviewHarness } from "../helpers/store/review-harness.js";
import { handleDeliveryExecution } from "../../src/handlers/delivery-execution.js";

it("binds the plan's work unit, carries a Store refusal during reconciliation, and re-enters its ordinary absence route after repair", async () => {
  const fixture = await positionFixture("registered-current");
  const harness = createReviewHarness();
  await harness.seedProject("123e4567-e89b-42d3-a456-426614174099");
  await harness.seedMeta(fixture.plan.workUnitId);
  const read = () => runHandlerAt(fixture.repository, () => handleDeliveryExecution(
    "reconcile", { input: "-" }, makeInteractionContext({ noInput: true, machineReadable: true }),
    { readText: async () => fixture.request }, { store: harness.store },
  ), { env: fixture.env });
  harness.store.state.corrupt = true;
  const refused = await read();
  expect(JSON.parse(refused.stdout), refused.stdout).toMatchObject({ status: "refused", reason: "terminal-rebind-unavailable",
    recommendedActionText: expect.stringContaining("Rebuild the namespace index from a saved state.") });
  harness.store.state.corrupt = false;
  const repaired = await read();
  expect(JSON.parse(repaired.stdout), repaired.stdout).toMatchObject({ status: "blocked", reason: "observation-unavailable" });
}, 30_000);
