/** Exclusion reports follow actual registration rather than unchecked declaration names. */
import { describe, expect, it } from "vitest";
import { referenceRegistration } from "../../../helpers/store/reference-fixture.js";
import { createAssertionCoverage, recordAssertion, emptyItemExclusions, validateUsedAssertionExclusions } from "../../../helpers/store/suite-tools.js";

function probe() {
  const registration = { ...referenceRegistration, declarations: { ...referenceRegistration.declarations,
    familyExclusions: { personal: { items: { 12: "Personal files have no lookup address" }, assertions: { "actual-role": "No parser" } } } } };
  const coverage = createAssertionCoverage();
  return { registration, coverage };
}
describe("conformance exclusion inventory", () => {
  it("rejects a typo even when another assertion was registered", () => {
    const p = probe();
    recordAssertion({ ...p, item: 9 }, "personal", "actual-roel");
    expect(() => validateUsedAssertionExclusions(p.registration, p.coverage)).toThrow(/unused.*personal.*actual-role/u);
  });
  it("rejects an assertion declaration hidden by an entire item exclusion", () => {
    const p = probe();
    recordAssertion({ ...p, item: 12 }, "personal", "actual-role");
    expect(() => validateUsedAssertionExclusions(p.registration, p.coverage)).toThrow(/unused.*actual-role/u);
  });
  it("accepts an exclusion that actually selected its registered assertion", () => {
    const p = probe();
    recordAssertion({ ...p, item: 9 }, "personal", "actual-role");
    expect(() => validateUsedAssertionExclusions(p.registration, p.coverage)).not.toThrow();
  });
  it("reports a standalone excluded item without duplicating a registered family's report", () => {
    const p = probe();
    expect(emptyItemExclusions({ ...p, item: 12 })).toEqual([{ family: "personal", reason: "Personal files have no lookup address" }]);
    recordAssertion({ ...p, item: 12 }, "personal", "lookup");
    expect(emptyItemExclusions({ ...p, item: 12 })).toEqual([]);
    expect(emptyItemExclusions({ ...p, item: 11 })).toEqual([]);
  });
});
