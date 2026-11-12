/** Terminal generation authority accepts authenticated former-name lookup results. */
import { expect, it } from "vitest";
import { createDecomposeHarness } from "../../../helpers/store/decompose-harness.js";
import { readTerminalWorkUnitLineage } from "../../../../src/lib/locus/store-terminal-work-unit.js";

it("reads the exact retired generation selected by a former name", async () => {
  const h = createDecomposeHarness();
  const provider = await h.seedRenamedWorkUnit("old-provider", "current-provider");
  const lineage = await h.seedRetiredWorkUnit(provider);
  expect(await readTerminalWorkUnitLineage(h.store, "old-provider")).toEqual(lineage);
});
