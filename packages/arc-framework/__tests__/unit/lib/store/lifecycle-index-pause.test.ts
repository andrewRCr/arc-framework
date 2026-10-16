/** Pause corruption remains visible in write-driving lifecycle inventories. */
import { expect, it } from "vitest";
import { listLifecycleIndex } from "../../../../src/lib/store/lifecycle-index.js";
import { createLifecycleHarness, lifecycleSuccess } from "../../../helpers/store/lifecycle-harness.js";
const section = "## Pause\n\n- **Paused By:** `andrew`\n- **Since:** `2026-10-13T12:00:00Z`\n- **Reason:** Waiting.\n\n";
it.each(["scalar", "structure"])("marks %s pause corruption malformed and missed", async (kind) => {
  const { store, seedMeta } = createLifecycleHarness();
  const record = await seedMeta("example");
  const malformed = kind === "scalar" ? section.replace("2026-10-13T12:00:00Z", "invalid") : section.repeat(2);
  const stored = [...store.state.records.values()][0]!;
  stored.content = record.content.replace("---\n", `${malformed}---\n`);
  const listing = lifecycleSuccess(await listLifecycleIndex(store));
  expect(listing).toMatchObject({ status: "complete", missed: true,
    diagnostics: [{ kind: "malformed", key: "work-item/meta:example", condition: expect.stringContaining("Pause") }] });
});
