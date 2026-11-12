/** Native incremental-coverage scope refuses its own failed outcome read and resumes after repair. */
import { expect, it } from "vitest";
import { createNativeIncrementalCoverageFixture } from "../helpers/store/native-coverage-refusal.js";
import { refuseNativeListing } from "../helpers/store/native-record-fault.js";

it("preserves the incremental scope outcome refusal and recomputes coverage after repair", async () => {
  const h = await createNativeIncrementalCoverageFixture();
  const fault = await refuseNativeListing(h.reference.store, { family: "review", kind: "review/outcome", owner: h.reviewOwner }, 12);
  const run = () => h.read(fault.store);
  // Earlier reads derive pass facts and policy; the twelfth reads the scope's own producer.
  await expect(run()).rejects.toMatchObject({ refusal: fault.refusal });
  expect(fault.injected()).toBe(1);
  fault.repair();
  await expect(run()).resolves.toMatchObject({ discharged: false, terminalPolicyState: "coverage-required" });
}, 60_000);
