/** Operational sync bindings preserve results and named-history pull semantics. */
import { expect, it } from "vitest";
import { createStoreSyncPort } from "../../../../src/lib/store/operational-sync.js";

it("defaults to no effect and preserves a bound implementation's results", async () => {
  const inert = createStoreSyncPort();
  expect(await inert.pull()).toEqual({ status: "no-remote" });
  expect(await inert.maintain()).toEqual({ measurements: null });
  expect(inert.historyRefs({ code: "anything" })).toEqual([]);
  const port = createStoreSyncPort({
    pull: async refs => ({ status: refs?.includes("refs/arc/history/a") === true ? "pulled" : "noop" }),
    maintain: async () => ({ measurements: [{ ref: "refs/arc/aliases", commits: 2, diskBytes: 42 }] }),
  });
  expect(await port.pull(["refs/arc/history/a"])).toEqual({ status: "pulled" });
  expect(await port.pull()).toEqual({ status: "noop" });
  expect(await port.maintain()).toEqual({ measurements: [{ ref: "refs/arc/aliases", commits: 2, diskBytes: 42 }] });
  expect(port.historyRefs({ code: "state-unresolvable", historyRefs: ["refs/arc/history/a"] })).toEqual(["refs/arc/history/a"]);
});
