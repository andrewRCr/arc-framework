/** Observe fixture writes before the ref backend resolves missing owner UIDs. */
import { expect, vi } from "vitest";
import * as storeFactories from "../../../src/lib/store/create.js";
import type { BatchInput } from "../../../src/lib/store/write.js";

/** Run a fixture's identity seed and verify it supplies the project ID in its put reference. */
export async function assertProjectIdentitySeed(seed: () => Promise<string>): Promise<string> {
  const { createRefStore } = storeFactories;
  const writes: BatchInput["writes"][number][] = [];
  const spy = vi.spyOn(storeFactories, "createRefStore").mockImplementation(ports => {
    const store = createRefStore(ports);
    return {
      ...store,
      batch: input => {
        writes.push(...input.writes.filter(write => write.reference.kind === "project-registry/identity"));
        return store.batch(input);
      },
    };
  });
  try {
    const projectId = await seed();
    expect(writes).toMatchObject([{
      action: "put",
      reference: { kind: "project-registry/identity", owner: { type: "project", name: "project", uid: projectId } },
      content: JSON.stringify({ projectId }),
    }]);
    return projectId;
  } finally {
    spy.mockRestore();
  }
}
