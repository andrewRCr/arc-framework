/** Lifecycle composition retains an already bound project-identity reader. */
import { expect, it } from "vitest";
import { createLifecycleHarness } from "../../helpers/store/lifecycle-harness.js";
import { createUserIOContext } from "../../../src/lib/io-context.js";
import { buildExecutor } from "../../../src/handlers/lifecycle-shared.js";

it("uses the caller's project identity with its supplied operational Store", async () => {
  const { store } = createLifecycleHarness();
  const projectId = "123e4567-e89b-42d3-a456-426614174099";
  const { executor } = await buildExecutor({ cwd: "/unavailable", io: createUserIOContext(), identity: "andrew",
    store, projectId: async () => projectId });
  if (executor.projectId === undefined) throw new Error("Expected the bound project-identity reader");
  expect(await executor.projectId()).toBe(projectId);
});
