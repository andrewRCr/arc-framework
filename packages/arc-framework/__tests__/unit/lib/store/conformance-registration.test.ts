/** Runtime validation prevents fixture declarations from silently dropping coverage. */
import { describe, expect, it } from "vitest";
import { FAMILY_IDS } from "../../../../src/lib/store/index.js";
import type { ConformanceRegistration, FixtureDeclarations } from "../../../helpers/store/fixture-contract.js";
import { registerStoreConformanceSuite, validateConformanceRegistration } from "../../../helpers/store/conformance-suite.js";
import { inRepoDeclarations } from "../../../helpers/store/in-repo-declarations.js";
import { unservedFamilyExclusions } from "../../../helpers/store/suite-tools.js";

const probeUnserved = Object.fromEntries(FAMILY_IDS.filter((family) => !["personal", "work-item"].includes(family))
  .map((family) => [family, "Outside this validation probe"]));

function registration(patch: Record<string, unknown> = {}): ConformanceRegistration {
  const declarations: FixtureDeclarations = {
    families: ["personal", "work-item"], unservedFamilies: probeUnserved, substrates: ["records", "personal"], mergesConcurrentWrites: true, runsWriteChecks: true,
    stateOffBranch: true, liveListingStateVersion: true,
    syncFamilies: ["personal", "work-item"], identitySyncFamilies: ["personal", "work-item"],
    entryShapes: {}, familyExclusions: {}, refusalExclusions: {}, rejectingContentUnavailable: {},
  };
  return { declarations: { ...declarations, ...patch }, create: () => { throw new Error("Validation must not open a backend"); } };
}

describe("conformance registration families", () => {
  it.each([
    ["absent list", undefined], ["empty list", []], ["unknown family", ["unknown-family"]],
  ])("rejects a %s instead of registering empty or unknown coverage", (_name, families) => {
    expect(() => validateConformanceRegistration(registration({ families }))).toThrow(/Invalid conformance registration:.*families/);
  });
});

function withoutCohort(): Record<string, string> {
  return Object.fromEntries(Object.entries(probeUnserved).filter(([family]) => family !== "cohort"));
}

describe("conformance registration unserved families", () => {
  it("refuses a family the fixture neither serves nor gives a reason, naming it", () => {
    const unservedFamilies = withoutCohort();
    expect(() => validateConformanceRegistration(registration({ unservedFamilies })))
      .toThrow(/Invalid conformance registration: unserved families cohort need a declared reason/);
  });

  it.each([
    ["an absent map", undefined, /unservedFamilies must be a declaration map/],
    ["a served family", { ...probeUnserved, personal: "Not served" }, /served family personal/],
    ["an unknown family", { ...probeUnserved, "unknown-family": "Not served" }, /unknown family unknown-family/],
    ["an empty reason", { ...probeUnserved, cohort: " " }, /unserved family cohort needs a nonempty exclusion reason/],
  ])("refuses %s", (_name, unservedFamilies, message) => {
    expect(() => validateConformanceRegistration(registration({ unservedFamilies }))).toThrow(message);
  });

  it("accepts an omitted family once its reason is supplied, and reports it", () => {
    const unservedFamilies = withoutCohort();
    const omitted = registration({ unservedFamilies });
    expect(() => validateConformanceRegistration(omitted)).toThrow("cohort");
    omitted.declarations.unservedFamilies.cohort = "This probe leaves cohort records out";
    expect(() => validateConformanceRegistration(omitted)).not.toThrow();
    expect(unservedFamilyExclusions(omitted)).toContainEqual({ family: "cohort", reason: "This probe leaves cohort records out" });
  });

  it("gives every family the in-repo fixture omits a reason, reported in registry order", () => {
    const inRepo: ConformanceRegistration = { declarations: inRepoDeclarations, create: () => { throw new Error("Validation must not open a backend"); } };
    expect(() => validateConformanceRegistration(inRepo)).not.toThrow();
    expect(unservedFamilyExclusions(inRepo).map(({ family }) => family))
      .toEqual(FAMILY_IDS.filter((family) => !inRepoDeclarations.families.includes(family)));
  });
});

describe("conformance registration exclusions", () => {
  it("refuses an exclusion for a family the fixture does not serve", () => {
    expect(() => validateConformanceRegistration(registration({familyExclusions:{cohort:{items:{5:"Unavailable"}}}})))
      .toThrow(/Invalid conformance registration:.*unserved/);
  });

  it.each([0,18,"bogus"])("refuses an unknown suite item %s", (item) => {
    expect(() => validateConformanceRegistration(registration({familyExclusions:{personal:{items:{[item]:"Unavailable"}}}})))
      .toThrow(/Invalid conformance registration:.*item/);
  });

  it.each([
    {familyExclusions:{personal:{items:{5:""}}}},
    {familyExclusions:{personal:{assertions:{"a named assertion":" \n\t"}}}},
    {refusalExclusions:{"lock-held":""}},
    {rejectingContentUnavailable:{"personal/document":" "}},
  ])("refuses an exclusion without a meaningful reason: %j", (declarations) => {
    expect(() => validateConformanceRegistration(registration(declarations)))
      .toThrow(/Invalid conformance registration:.*reason/);
  });
});

describe("conformance registration publishes", () => {
  it.each([
    {syncFamilies:undefined}, {syncFamilies:["unknown-family"]}, {syncFamilies:["cohort"]},
    {identitySyncFamilies:undefined}, {identitySyncFamilies:["cohort"]},
    {syncFamilies:["personal"],identitySyncFamilies:["work-item"]},
  ])("refuses absent or inconsistent publish family declarations: %j", (declarations) => {
    expect(() => validateConformanceRegistration(registration(declarations)))
      .toThrow(/Invalid conformance registration:.*Families/);
  });
});

it.each([
  {entryShapes:{"unknown/kind":{shape:"heading",sections:["Entries"]}}},
  {entryShapes:{"cohort/document":{shape:"heading",sections:["Entries"]}}},
  {entryShapes:{"personal/document":{shape:"heading",sections:["Entries"]}}},
  {entryShapes:{"personal/inbox":{shape:"unknown",sections:["Entries"]}}},
  {entryShapes:{"personal/inbox":{shape:"heading",sections:[]}}},
])("refuses entry declarations for unknown, unserved or malformed entry kinds: %j", (declarations) => {
  expect(() => validateConformanceRegistration(registration(declarations)))
    .toThrow(/Invalid conformance registration:.*entry/);
});


it("rejects invalid declarations before registering any backend tests", () => {
  expect(() => registerStoreConformanceSuite("invalid declaration probe",registration({families:[]})))
    .toThrow(/Invalid conformance registration:.*families/);
});

it("accepts served subsets, multiple publishes and project-scoped identity-dependent sync", () => {
  expect(() => validateConformanceRegistration(registration({
    familyExclusions:{personal:{items:{5:"A declared fixture limitation"},assertions:{"one named assertion":"Unavailable here"}}},
    refusalExclusions:{"lock-held":"This backend does not lock writes"},
    rejectingContentUnavailable:{"personal/document":"Prose has no rejecting parser"},
    entryShapes:{"personal/inbox":{shape:"heading",sections:["Entries"]}},
  }))).not.toThrow();
  expect(() => validateConformanceRegistration(registration({syncFamilies:[],identitySyncFamilies:[]}))).not.toThrow();
});

it("accepts an exclusion after its missing reason is supplied", () => {
  const invalid = registration({familyExclusions:{personal:{items:{5:""}}}});
  expect(() => validateConformanceRegistration(invalid)).toThrow("reason");
  invalid.declarations.familyExclusions.personal = {items:{5:"This backend has no cross-substrate batch"}};
  expect(() => validateConformanceRegistration(invalid)).not.toThrow();
});

it.each([undefined, "true", 1])("refuses a non-boolean write-check declaration: %j", (runsWriteChecks) => {
  expect(() => validateConformanceRegistration(registration({ runsWriteChecks })))
    .toThrow(/Invalid conformance registration:.*runsWriteChecks/);
});
