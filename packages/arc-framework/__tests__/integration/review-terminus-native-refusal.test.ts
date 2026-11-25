/** Completed native ownership preserves fallback failures and permits identical acceptance after repair. */
import { expect, it } from "vitest";
import { createNativeCompletedTerminusFixture } from "../helpers/store/native-terminus-refusal.js";
import { refuseNativeRecordRead } from "../helpers/store/native-record-fault.js";
import { recordReferences } from "../../src/lib/store/identity.js";

it("preserves the completed-owner boundary refusal and records the same terminus after repair", async () => {
  const h = await createNativeCompletedTerminusFixture();
  const fault = await refuseNativeRecordRead(h.reference.store,
    recordReferences["review/integration-boundary"](h.primary.reference.owner), 2);
  const run = () => h.accept(fault.store);
  const { runDerivedLocusStateProbe } = await import("../../src/handlers/derived-locus-state-probe.js");
  const frame = await runDerivedLocusStateProbe({ ...h.native, cwd: h.cwd, identity: "andrew", baseBranch: "main" });
  expect(frame.entering, JSON.stringify(frame)).toMatchObject({ kind: "selected", row: { kind: "work-unit", lifecycleLocation: "completed" } });
  const refused = await run();
  expect(refused.result, JSON.stringify({ output: refused.output, trace: fault.trace })).toMatchObject({
    error: { code: "store-refused" }, refusal: fault.refusal });
  expect(fault.injected()).toBe(1);
  fault.repair();
  const repaired = await run();
  expect(repaired.exits, repaired.output).toEqual([]);
  expect(repaired.result, repaired.output).toMatchObject({ state: "recorded", nextAction: "continue",
    record: { vehicle: h.request.offer.vehicle, terminus: { acceptedBy: "andrew", completedPasses: 1 } } });
}, 60_000);
