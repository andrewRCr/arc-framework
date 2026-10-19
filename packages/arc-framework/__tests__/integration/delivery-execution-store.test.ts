/** Public delivery execution preserves a supplied operational backend. */
import { expect, it } from "vitest";
import { positionFixture } from "../helpers/delivery-position-suite.js";
import { runHandlerAt } from "../helpers/handler.js";
import { makeInteractionContext } from "../helpers/interaction-context.js";
import { createLifecycleHarness } from "../helpers/store/lifecycle-harness.js";
import { handleDeliveryExecution } from "../../src/handlers/delivery-execution.js";

it("preserves a Store refusal during reconciliation and re-enters its ordinary absence route after repair", async () => {
  const fixture = await positionFixture("registered-current");
  const harness = createLifecycleHarness();
  const meta = await harness.seedMeta(fixture.plan.workUnitId);
  const read = () => runHandlerAt(fixture.repository, () => handleDeliveryExecution(
    "reconcile", { input: "-" }, makeInteractionContext({ noInput: true, machineReadable: true }),
    { readText: async () => fixture.request }, { store: harness.store, workItem: meta.reference.owner },
  ), { env: fixture.env });
  harness.store.state.corrupt = true;
  const refused = await read();
  expect(JSON.parse(refused.stdout), refused.stdout).toMatchObject({ status: "refused", reason: "terminal-rebind-unavailable" });
  harness.store.state.corrupt = false;
  const repaired = await read();
  expect(JSON.parse(repaired.stdout), repaired.stdout).toMatchObject({ status: "blocked", reason: "observation-unavailable" });
}, 30_000);
