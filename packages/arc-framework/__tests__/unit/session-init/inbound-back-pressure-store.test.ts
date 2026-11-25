/** The session slot consumes the inbound kind's shared pending figures. */
import { expect, it } from "vitest";
import { recordReferences } from "../../../src/lib/store/identity.js";
import { runInboundBackPressure, InboundBackPressureResultSchema } from "../../../src/lib/session-init/inbound-back-pressure.js";
import { createLifecycleHarness } from "../../helpers/store/lifecycle-harness.js";

const now = new Date("2026-10-16T12:00:00.000Z");
it.each([
  { dates: ["2026-10-16", "2026-10-16"], countThreshold: 1, ageThresholdDays: 30, oldestAgeDays: 0, tripped: true },
  { dates: ["2026-09-01"], countThreshold: 10, ageThresholdDays: 30, oldestAgeDays: 45, tripped: true },
  { dates: ["2026-10-15"], countThreshold: 10, ageThresholdDays: 30, oldestAgeDays: 1, tripped: false },
])("reports exact figures and threshold action for %j", async input => {
  const h = createLifecycleHarness();
  const meta = await h.seedMeta("demo", { owner: "andrew" });
  await h.seed(recordReferences["work-item/inbound"](meta.reference.owner), `# Inbound\n\n## Inbound\n\n${input.dates.map((date, index) => `### **Capture ${index}**\n\n- _Created:_ \`${date}\`\n\nBody\n`).join("\n")}`);
  const result = await runInboundBackPressure({ store: h.store, workUnit: "demo", now,
    countThreshold: input.countThreshold, ageThresholdDays: input.ageThresholdDays });
  expect(result).toMatchObject({ pendingCount: input.dates.length, countThreshold: input.countThreshold, ageThresholdDays: input.ageThresholdDays });
  expect(result?.oldestAgeDays).toBe(input.oldestAgeDays);
  if (input.tripped) expect(result?.actions).toEqual([{ text: expect.stringMatching(/andrew.*arc inbox demo/u) }]);
  else expect(result?.actions).toBeUndefined();
  expect(InboundBackPressureResultSchema.parse(result)).toEqual(result);
});

it("reports zero pending figures when the work unit has no inbound record", async () => {
  const h = createLifecycleHarness();
  await h.seedMeta("demo", { owner: "andrew" });
  expect(await runInboundBackPressure({ store: h.store, workUnit: "demo", countThreshold: 10, ageThresholdDays: 30, now }))
    .toEqual({ pendingCount: 0, oldestAgeDays: null, countThreshold: 10, ageThresholdDays: 30 });
});
