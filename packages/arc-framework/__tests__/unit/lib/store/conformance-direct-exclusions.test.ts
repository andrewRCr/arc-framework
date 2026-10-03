/** Direct registrars use named selection without opening excluded fixtures. */
import { afterAll, describe, expect, it } from "vitest";
import type { ConformanceRegistration } from "../../../helpers/store/fixture-contract.js";
import { createReferenceFixture, referenceDeclarations } from "../../../helpers/store/reference-fixture.js";
import { validateConformanceRegistration } from "../../../helpers/store/conformance-suite.js";
import { registerCoverageAssertions, registerCrossSubstrateAssertions } from "../../../helpers/store/suite-recovery.js";
import { createAssertionCoverage, emptyItemExclusions, validateUsedAssertionExclusions } from "../../../helpers/store/suite-tools.js";

const names = ["atomic-cross-substrate-batch", "uncovered-record-state-version"] as const;

describe("named direct conformance exclusions", () => {
  let opened = 0;
  const coverage = createAssertionCoverage();
  const registration: ConformanceRegistration = {
    declarations: { ...referenceDeclarations, familyExclusions: { ...referenceDeclarations.familyExclusions, "work-item": { assertions: Object.fromEntries(names.map((name) => [name, "Named fixture limitation"])) } } },
    create() { opened++; throw new Error("A named excluded callback must never open its fixture"); },
  };
  registerCrossSubstrateAssertions({ item: 5, registration, coverage });
  registerCoverageAssertions({ item: 8, registration, coverage });
  afterAll(() => { expect(opened).toBe(0); });
  it("accounts for both selected assertion exclusions", () => {
    validateConformanceRegistration(registration);
    validateUsedAssertionExclusions(registration, coverage);
    expect(coverage.used).toEqual(new Set(names.map((name) => `work-item:${name}`)));
    expect(emptyItemExclusions({ item: 5, registration, coverage })).toEqual([]);
  });
});

describe("whole-item direct exclusions", () => {
  const coverage = createAssertionCoverage();
  const registration: ConformanceRegistration = { declarations: referenceDeclarations,
    create() { throw new Error("A whole-item excluded callback must never open its fixture"); } };
  registerCrossSubstrateAssertions({ item: 5, registration, coverage });
  registerCoverageAssertions({ item: 8, registration, coverage });
  it("records direct assertions without inventing unused named exclusions", () => {
    validateConformanceRegistration(registration);
    validateUsedAssertionExclusions(registration, coverage);
    expect(coverage.registered.get(5)?.get("work-item")).toEqual(new Set([names[0]]));
    expect(coverage.registered.get(8)?.get("work-item")).toEqual(new Set([names[1]]));
    expect(coverage.used.size).toBe(0);
  });
});

describe("active direct conformance assertions", () => {
  let opened = 0, repaired = 0;
  const registration: ConformanceRegistration = { declarations: { ...referenceDeclarations, familyExclusions: {} },
    create() {
      opened++;
      const fixture = createReferenceFixture();
      let ready = false;
      fixture.produce = async (id) => ({ run: async () => ready ? { status: "ok", result: null } : { status: "refused", refusal: {
        code: "unsupported", case: id === "unsupported:cross-substrate-batch" ? "cross-substrate-batch" : "uncovered-state-version", class: "recoverable",
        condition: "Fixture capability is unavailable", remedy: { text: "Restore capability and retry" },
      } } });
      fixture.repair = async () => { ready = true; repaired++; };
      return fixture;
    } };
  registerCrossSubstrateAssertions({ item: 5, registration });
  registerCoverageAssertions({ item: 8, registration });
  afterAll(() => { expect(opened).toBe(referenceDeclarations.families.length * 2); expect(repaired).toBe(opened); });
});
