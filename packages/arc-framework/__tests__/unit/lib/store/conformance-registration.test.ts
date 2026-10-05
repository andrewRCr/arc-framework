/** Runtime validation prevents fixture declarations from silently dropping coverage. */
import { describe, expect, it } from "vitest";
import type { ConformanceRegistration, FixtureDeclarations } from "../../../helpers/store/fixture-contract.js";
import { registerStoreConformanceSuite, validateConformanceRegistration } from "../../../helpers/store/conformance-suite.js";

function registration(patch: Record<string, unknown> = {}): ConformanceRegistration {
  const declarations: FixtureDeclarations = {
    families: ["personal", "work-item"], substrates: ["records", "personal"], mergesConcurrentWrites: true,
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

describe("conformance registration exclusions", () => {
  it("refuses an exclusion for a family the fixture does not serve", () => {
    expect(() => validateConformanceRegistration(registration({familyExclusions:{cohort:{items:{5:"Unavailable"}}}})))
      .toThrow(/Invalid conformance registration:.*unserved/);
  });

  it.each([0,17,"bogus"])("refuses an unknown suite item %s", (item) => {
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
