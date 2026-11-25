/** Direct registrars use named selection without opening excluded fixtures. */
import { afterAll, describe, expect, it } from "vitest";
import type { ConformanceRegistration } from "../../../helpers/store/fixture-contract.js";
import { createReferenceFixture, referenceDeclarations } from "../../../helpers/store/reference-fixture.js";
import { validateConformanceRegistration } from "../../../helpers/store/conformance-suite.js";
import { registerCoverageAssertions, registerCrossSubstrateAssertions, registerRecoveryAssertions } from "../../../helpers/store/suite-recovery.js";
import { refusalRecoveryTable } from "../../../helpers/store/recovery.js";
import { createAssertionCoverage, emptyItemExclusions, validateUsedAssertionExclusions } from "../../../helpers/store/suite-tools.js";

const names = ["atomic-cross-substrate-batch", "uncovered-record-state-version"] as const;
const availableRecoveryCases = Object.values(refusalRecoveryTable).flat()
  .filter((scenario) => !referenceDeclarations.refusalExclusions[scenario.id]).length;

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

describe("all families exclude recovery", () => {
  const coverage = createAssertionCoverage();
  const registration: ConformanceRegistration = { declarations: { ...referenceDeclarations,
    familyExclusions: Object.fromEntries(referenceDeclarations.families.map((family) => [family, { items: { 14: "No recovery fixture" } }])),
  }, create() { throw new Error("Excluded recovery must never open a fixture"); } };
  registerRecoveryAssertions({ item: 14, registration, coverage });
  it("retains reasoned recovery assertion coverage for each excluded family", () => {
    for (const family of referenceDeclarations.families) {
      expect(coverage.registered.get(14)?.get(family)?.has("lock-held")).toBe(true);
    }
    validateUsedAssertionExclusions(registration, coverage);
  });
});

for (const exclusion of ["whole-family", "named-scenario"] as const) describe(`partial recovery exclusion: ${exclusion}`, () => {
  let opened = 0;
  const coverage = createAssertionCoverage();
  const registration: ConformanceRegistration = { declarations: { ...referenceDeclarations,
    familyExclusions: exclusion === "whole-family" ? { "work-item": { items: { 14: "Recovery covered by other served families" } } }
      : Object.fromEntries(referenceDeclarations.families.map((family) => [family, { assertions: { "lock-held": "No lock contention fixture" } }])),
  }, create() { opened++; return createReferenceFixture(); } };
  registerRecoveryAssertions({ item: 14, registration, coverage });
  afterAll(() => { expect(opened).toBe(availableRecoveryCases - (exclusion === "named-scenario" ? 1 : 0)); });
  it("accounts for declared recovery exclusions", () => {
    validateConformanceRegistration(registration);
    validateUsedAssertionExclusions(registration, coverage);
    expect(coverage.used.size).toBe(exclusion === "named-scenario" ? referenceDeclarations.families.length : 0);
  });
});
