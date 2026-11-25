/** Native response re-observation preserves a refused private member selection and resumes after repair. */
import { expect, it } from "vitest";
import { createNativePrivateMemberFixture } from "../helpers/store/native-delivery-refusal.js";
import { refuseNativeRecordRead } from "../helpers/store/native-record-fault.js";
import { createRespondDependencies } from "../../src/scripts/review-gate/runtime/respond-composition.js";

it("raises the pinned private member's native owner refusal whole and confirms its exact target after repair", async () => {
  const h = await createNativePrivateMemberFixture();
  const fault = await refuseNativeRecordRead(h.reference.store, h.primary.reference);
  const dependencies = createRespondDependencies({ ...h.invocation, store: fault.store });
  const run = () => dependencies.confirmPinnedDeliveryMemberTarget(h.result);
  await expect(run()).rejects.toMatchObject({ name: "StoreRefusalError", offBranch: true, refusal: fault.refusal });
  expect(fault.injected()).toBe(1);
  fault.repair();
  expect(await run()).toEqual(h.selected.target);
}, 60_000);
