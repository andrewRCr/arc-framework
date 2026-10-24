/** Ranked lookup ties prescribe repairs by holder kind and ranking tier. */
import { expect, it } from "vitest";
import { clashRepair } from "../../../../src/lib/store/clash-repair.js";
import { OwnerIdentitySchema, recordReferences } from "../../../../src/lib/store/identity.js";
const uidA = "11111111-1111-4111-8111-111111111111", uidB = "22222222-2222-4222-8222-222222222222";
const uidC = "33333333-3333-4333-8333-333333333333";
function holder(kind: "work-item/meta" | "work-item/record" | "cohort/document", name: string, uid: string) {
  return recordReferences[kind](OwnerIdentitySchema.parse({ type: kind === "cohort/document" ? "cohort" : "work-item", name, uid }));
}
it("prefers renaming the cohort in a current-name clash", () => {
  const repair = clashRepair([holder("work-item/meta", "shared", uidA), holder("work-item/record", "shared", uidC), holder("cohort/document", "shared", uidB)], { liveness: "live", name: "current" });
  expect(repair.text).toContain(`arc rename ${uidB} <new-slug>`);
  expect(repair.text).toContain("cohort");
  expect(repair.text).not.toContain("arc errand close");
  expect(repair.argv).toEqual(["arc", "status", "--json"]);
});
it("closes the Errand by UID when no cohort holder is present", () => {
  const repair = clashRepair([holder("work-item/meta", "shared", uidA), holder("work-item/record", "shared", uidB)], { liveness: "live", name: "current" });
  expect(repair.text).toContain(`arc errand close ${uidB}`);
  expect(repair.argv).toEqual(["arc", "errand", "close", uidB]);
});
it("names either work unit's rename when both hold the current name", () => {
  const repair = clashRepair([holder("work-item/meta", "shared", uidA), holder("work-item/meta", "shared", uidB)], { liveness: "live", name: "current" });
  expect(repair.text).toContain(`arc rename ${uidA} <new-slug>`);
  expect(repair.text).toContain(`arc rename ${uidB} <new-slug>`);
  expect(repair.argv).toEqual(["arc", "status", "--json"]);
});
it("names each current name for a live former-name tie", () => {
  const repair = clashRepair([holder("work-item/meta", "alpha", uidA), holder("work-item/meta", "beta", uidB)], { liveness: "live", name: "former" });
  expect(repair.text).toContain("alpha"); expect(repair.text).toContain("beta");
  expect(repair.text).not.toMatch(/rename|close/iu);
  expect(repair.argv).toEqual(["arc", "status", "--json"]);
});
it("prints completed holders' UIDs without a lifecycle move", () => {
  const repair = clashRepair([holder("work-item/record", "shared", uidA), holder("work-item/record", "shared", uidB)], { liveness: "completed", name: "current" });
  expect(repair.text).toContain(uidA); expect(repair.text).toContain(uidB);
  expect(repair.text).not.toMatch(/arc rename|arc errand close/iu);
  expect(repair.argv).toEqual(["arc", "status", "--json"]);
});
