/** Native reserved hosted review resumes preserve typed Store diagnostics and retry after repair. */
import { expect, it } from "vitest";
import { createNativeReservedHostedFixture } from "../helpers/store/native-hosted-refusal.js";
import { refuseNativeRecordRead } from "../helpers/store/native-record-fault.js";
import { recordReferences } from "../../src/lib/store/identity.js";

it("raises the reserved resume's boundary refusal whole and requests the same admission after repair", async () => {
  const h = await createNativeReservedHostedFixture();
  const fault = await refuseNativeRecordRead(h.reference.store,
    recordReferences["review/integration-boundary"](h.primary.reference.owner));
  const run = () => h.submit(fault.store);
  const refused = await run();
  expect(refused.result, refused.output).toMatchObject({ error: { code: "store-refused" }, refusal: fault.refusal,
    remedy: { text: expect.stringContaining(fault.refusal.remedy.text) } });
  expect(fault.injected()).toBe(1);
  fault.repair();
  const repaired = await run();
  expect(repaired.exits, repaired.output).toEqual([]);
  expect(repaired.result, repaired.output).toMatchObject({ state: "requested", nextAction: "await",
    handle: { admission: { admissionId: h.admitted.admission.admissionId }, target: h.request.target } });
}, 60_000);
