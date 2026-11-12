/** Backends that keep state on branch must not gain projection-removal dependencies. */
import { describe, expect, it } from "vitest";
import { createProjectionRemovalSlots } from "../../../../src/lib/store/projection/removal-slots.js";
import { createReferenceFixture } from "../../../helpers/store/reference-fixture.js";
import type { Store } from "../../../../src/lib/store/contract.js";

describe("projection removal capability", () => {
  it.each([null, "# not an identity"])("passes every slot without projection authority for identity %s", async identity => {
    const fixture = createReferenceFixture();
    const store: Store = new Proxy(fixture.store, { get(target, key) {
      if (key === "capabilities") return { stateOffBranch: false };
      const value: unknown = Reflect.get(target, key, target);
      return typeof value === "function" ? value.bind(target) : value;
    } });
    const slots = createProjectionRemovalSlots({ store, identity,
      mint: () => Promise.reject(new Error("An in-repo removal must not invoke the mint capability.")) });
    expect(await slots.check("/nonexistent-checkout")).toEqual({ kind: "passes" });
    expect(await slots.persist("/nonexistent-checkout")).toEqual({ kind: "persisted" });
    expect(await slots.release("/nonexistent-checkout", false)).toEqual({ kind: "released" });
  });
});
