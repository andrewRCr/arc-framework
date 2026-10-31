/** Lazy native port construction and cancellation without repository access. */

import { expect, it } from "vitest";
import { createDefaultRefStorePorts } from "../../../../src/lib/store/default-ports.js";

it("constructs ports before the checkout or configuration is available", () => {
  expect(() => createDefaultRefStorePorts({ checkoutRoot: "/unmaterialized-store-checkout",
    exec: async () => { throw new Error("No Git command is available"); },
    backingRepository: () => { throw new Error("Configuration is unavailable"); },
  })).not.toThrow();
});

it("settles both retry waits and deadline bounds when their signal is already ended", async () => {
  const ports = createDefaultRefStorePorts({ checkoutRoot: "/unmaterialized-store-checkout", backingRepository: async () => null });
  const stopped = new AbortController(); stopped.abort();
  await expect(Promise.all([ports.sleep.wait(120_000, stopped.signal), ports.sleep.bound(120_000, stopped.signal)]))
    .resolves.toEqual([undefined, undefined]);
});
