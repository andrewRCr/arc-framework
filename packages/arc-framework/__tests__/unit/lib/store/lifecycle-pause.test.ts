/** Advancing work observes every present pause through the logical record. */
import { expect, it } from "vitest";
import { checkAdvancingPause } from "../../../../src/lib/store/lifecycle-pause.js";
import { checkMetaDurableFields } from "../../../../src/lib/store/kinds/meta/shape-rules.js";
import { metaRuleInput, META_RULE_CONTENT } from "../../../helpers/store/meta-rule-input.js";
import { createLifecycleHarness } from "../../../helpers/store/lifecycle-harness.js";
const pause = "## Pause\n\n- **Paused By:** `andrew`\n- **Since:** `2026-10-13T12:00:00Z`\n- **Reason:** Waiting.\n\n";
it("admits unpaused work and carries store lookup refusals", async () => {
  const { store, seedMeta } = createLifecycleHarness();
  await seedMeta("example");
  expect(await checkAdvancingPause(store, "example")).toEqual({ status: "clear" });
  expect(await checkAdvancingPause(store, "missing")).toMatchObject({ status: "rejected", refusal: { code: "not-found" } });
});
it.each(["valid", "scalar", "structure"])("refuses %s present pause and names resume", async (kind) => {
  const { store, seedMeta } = createLifecycleHarness();
  const record = await seedMeta("example");
  const section = kind === "scalar" ? pause.replace("2026-10-13T12:00:00Z", "invalid") : kind === "structure" ? pause.repeat(2) : pause;
  [...store.state.records.values()][0]!.content = record.content.replace("---\n", `${section}---\n`);
  expect(await checkAdvancingPause(store, "example")).toMatchObject({ status: "rejected", reason: expect.stringContaining("arc resume example") });
});
it("refuses unchanged structural pause corruption but permits a verb's whole-section repair", () => {
  const malformed = META_RULE_CONTENT.replace("---\n", `${pause.repeat(2)}---\n`);
  expect(checkMetaDurableFields(metaRuleInput(malformed, malformed, { kind: "verb", verb: "set-class" })))
    .toMatchObject([{ rule: "meta.durable-fields", condition: expect.stringContaining("Pause") }]);
  expect(checkMetaDurableFields(metaRuleInput(META_RULE_CONTENT, malformed, { kind: "verb", verb: "resume" }))).toEqual([]);
});
