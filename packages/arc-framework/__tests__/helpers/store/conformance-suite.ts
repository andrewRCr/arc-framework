/** Single backend-neutral registration of all seventeen storage contract conformance items. */

import { describe, it } from "vitest";
import { FAMILY_IDS, KIND_REGISTRY, type KindId } from "../../../src/lib/store/index.js";
import type { ConformanceRegistration, ConformanceRun, FixtureDeclarations, SuiteItem } from "./fixture-contract.js";
import { refusalRecoveryTable } from "./recovery.js";
import {
  caseSkip, createAssertionCoverage, emptyItemExclusions, unservedFamilyExclusions, validateUsedAssertionExclusions,
  type AssertionCoverage, type CaseSelection, type SuiteContext,
} from "./suite-tools.js";
import { registerCapabilityAssertions, registerDurabilityAssertions, registerRecordAssertions, registerVersionConflictAssertions } from "./suite-records.js";
import { registerBatchAssertions, registerFreshnessAssertions, registerHistoryAssertions, registerStateAssertions } from "./suite-versions.js";
import { registerMergeAssertions } from "./suite-merges.js";
import { registerFormatAssertions, registerListingAssertions } from "./suite-listings.js";
import { registerLookupAssertions } from "./suite-lookup.js";
import { registerCoverageAssertions, registerCrossSubstrateAssertions, registerRecoveryAssertions } from "./suite-recovery.js";
import { registerWriteCheckAssertions } from "./suite-write-checks.js";
import { registerSyncAssertions } from "./suite-sync.js";

/** Every contract item has one registration body, so the item map cannot silently omit one. */
export const conformanceItems: Record<SuiteItem, { name: string; register(context: SuiteContext): void }> = {
  1: { name: "records, references, placements and links", register: registerRecordAssertions },
  2: { name: "version conflicts", register: registerVersionConflictAssertions },
  3: { name: "stale bases and stored conflicts", register: registerMergeAssertions },
  4: { name: "atomic batches", register: registerBatchAssertions },
  5: { name: "cross-substrate batch refusal", register: registerCrossSubstrateAssertions },
  6: { name: "record-bound freshness", register: registerFreshnessAssertions },
  7: { name: "state versions and changes", register: registerStateAssertions },
  8: { name: "saved-state coverage refusal", register: registerCoverageAssertions },
  9: { name: "listing completeness", register: registerListingAssertions },
  10: { name: "format versions", register: registerFormatAssertions },
  11: { name: "history provenance", register: registerHistoryAssertions },
  12: { name: "logical and code lookup", register: registerLookupAssertions },
  13: { name: "immediate durability", register: registerDurabilityAssertions },
  14: { name: "recovery-complete refusals", register: registerRecoveryAssertions },
  15: { name: "capability report", register: registerCapabilityAssertions },
  16: { name: "sync outcomes and reconciliation", register: registerSyncAssertions },
  17: { name: "registered write checks", register: registerWriteCheckAssertions },
};

const SUITE_ITEMS = Object.keys(conformanceItems).map(Number) as SuiteItem[];

/** Register one describe per numbered item and named tests/skips from the fixture declarations.
 * Every file registers the whole registration, so its declarations are checked against every case it holds; a run
 * selects which of those cases this file runs.
 * @param name - Backend name used in the test runner output.
 * @param registration - Static exclusions and a fresh isolated fixture factory.
 * @param run - One declared item range or the declared per-change subset; absent, every case.
 * @returns Nothing after every applicable assertion is registered.
 */
export function registerStoreConformanceSuite(name: string, registration: ConformanceRegistration, run?: ConformanceRun): void {
  validateConformanceRegistration(registration);
  const coverage = createAssertionCoverage();
  const selection = runSelection(registration, run);
  const unserved = unservedFamilyExclusions(registration);
  if (unserved.length > 0 && selection.reportsUnserved) describe(`${name} — unserved families`, () => {
    for (const { family, reason } of unserved) it.skip(`${family}: every item — ${reason}`, () => {});
  });
  for (const item of SUITE_ITEMS) {
    const context: SuiteContext = { item, registration, coverage, selects: selection.selects };
    if (selection.runsItem(item)) describe(`${name} — item ${item}: ${conformanceItems[item].name}`, () => registerItem(context));
    else registerItem(context);
  }
  it(`${name} — declaration inventory`, () => { validateConformanceInventory(registration, coverage); });
}

function registerItem(context: SuiteContext): void {
  conformanceItems[context.item].register(context);
  for (const { family, reason } of emptyItemExclusions(context)) {
    caseSkip(context, `${family}: item ${context.item}`, `${family}: item ${context.item} — ${reason}`);
  }
}

/** Collect every case a registration holds, as each of its files does, without registering any test.
 * @param registration - Static declarations; no fixture is opened.
 * @returns The whole registration's assertions, used exclusions, and case IDs.
 */
export function collectConformanceCoverage(registration: ConformanceRegistration): AssertionCoverage {
  const coverage = createAssertionCoverage();
  for (const item of SUITE_ITEMS) registerItem({ item, registration, coverage, selects: () => false });
  return coverage;
}

/** Refuse declared exclusions and per-change cases that name no case of the whole registration.
 * @param registration - Declared exclusions and runs.
 * @param coverage - The whole registration's inventory.
 */
export function validateConformanceInventory(registration: ConformanceRegistration, coverage: AssertionCoverage): void {
  validateUsedAssertionExclusions(registration, coverage);
  validateDeclaredSubset(registration, coverage);
}

function runSelection(registration: ConformanceRegistration, run: ConformanceRun | undefined):
  { selects: CaseSelection; runsItem(item: SuiteItem): boolean; reportsUnserved: boolean } {
  if (run === undefined) return { selects: () => true, runsItem: () => true, reportsUnserved: true };
  if (run === "subset") {
    const subset = registration.runs?.subset ?? declarationError("the run selects a per-change subset the registration does not declare");
    return { selects: (item, id) => subset[item]?.includes(id) ?? false, runsItem: (item) => (subset[item]?.length ?? 0) > 0, reportsUnserved: false };
  }
  const range = registration.runs?.ranges?.[run.range] ?? declarationError(`the run selects undeclared item range ${run.range}`);
  const runsItem = (item: SuiteItem) => item >= range[0] && item <= range[1];
  return { selects: (item) => runsItem(item), runsItem, reportsUnserved: range[0] === 1 };
}

function validateDeclaredSubset(registration: ConformanceRegistration, coverage: AssertionCoverage): void {
  const unknown = Object.entries(registration.runs?.subset ?? {}).flatMap(([item, ids]) =>
    (ids ?? []).filter((id) => !coverage.cases.get(Number(item) as SuiteItem)?.has(id)).map((id) => `item ${item}: ${id}`));
  if (unknown.length) declarationError(`the per-change subset names unregistered cases ${unknown.join("; ")}`);
}


/** Reject declarations that would silently narrow or mislabel conformance coverage.
 * @param registration - Backend declarations and its isolated fixture factory.
 * @returns Nothing when all coverage declarations are internally consistent.
 */
export function validateConformanceRegistration(registration: ConformanceRegistration): void {
  const declarations = registration.declarations;
  validateNames(declarations.families,"families",new Set(FAMILY_IDS),false);
  validateUnservedFamilies(declarations);
  validateNames(declarations.syncFamilies,"syncFamilies",new Set(declarations.families));
  validateNames(declarations.identitySyncFamilies,"identitySyncFamilies",new Set(declarations.syncFamilies));
  validateNames(declarations.substrates,"substrates",undefined,false);
  for (const field of ["mergesConcurrentWrites","runsWriteChecks","stateOffBranch","liveListingStateVersion"] as const) {
    if (typeof declarations[field] !== "boolean") declarationError(`${field} must declare a boolean`);
  }
  validateEntryShapes(registration);
  validateFamilyExclusions(registration);
  validateRefusalAndContentExclusions(registration);
  validateItemRanges(registration);
}

function validateItemRanges(registration: ConformanceRegistration): void {
  const ranges = Object.entries(registration.runs?.ranges ?? {});
  if (ranges.length === 0) return;
  const covered = ranges.flatMap(([key, [first, last]]) => {
    if (!SUITE_ITEMS.includes(first) || !SUITE_ITEMS.includes(last) || first > last) declarationError(`item range ${key} is not a range of suite items`);
    return SUITE_ITEMS.filter((item) => item >= first && item <= last);
  });
  if (covered.length !== SUITE_ITEMS.length || new Set(covered).size !== SUITE_ITEMS.length) {
    declarationError("the item ranges must cover every suite item exactly once");
  }
}


function declarationError(condition: string): never {
  throw new Error(`Invalid conformance registration: ${condition}`);
}

function declarationEntries(value: unknown,label: string): [string,unknown][] {
  if (typeof value !== "object" || value === null || Array.isArray(value)) declarationError(`${label} must be a declaration map`);
  return Object.entries(value);
}

function requireReason(value: unknown,label: string): void {
  if (typeof value !== "string" || value.trim().length === 0) declarationError(`${label} needs a nonempty exclusion reason`);
}

function validateUnservedFamilies(declarations: FixtureDeclarations): void {
  const known = new Set<string>(FAMILY_IDS);
  const served = new Set<string>(declarations.families);
  for (const [family,reason] of declarationEntries(declarations.unservedFamilies,"unservedFamilies")) {
    if (!known.has(family)) declarationError(`unservedFamilies names unknown family ${family}`);
    if (served.has(family)) declarationError(`unservedFamilies names served family ${family}`);
    requireReason(reason,`unserved family ${family}`);
  }
  const omitted = FAMILY_IDS.filter((family)=>!served.has(family) && !Object.hasOwn(declarations.unservedFamilies,family));
  if (omitted.length > 0) declarationError(`unserved families ${omitted.join(", ")} need a declared reason`);
}

function validateFamilyExclusions(registration: ConformanceRegistration): void {
  for (const [family,exclusions] of declarationEntries(registration.declarations.familyExclusions,"familyExclusions")) {
    if (!registration.declarations.families.some((served)=>served === family)) declarationError(`exclusions name unserved family ${family}`);
    for (const [category,reasons] of declarationEntries(exclusions,`exclusions for ${family}`)) {
      if (category !== "items" && category !== "assertions") declarationError(`unknown exclusion category ${category}`);
      for (const [name,reason] of declarationEntries(reasons,`${family} ${category}`)) {
        if (category === "items" && !Object.hasOwn(conformanceItems,name)) declarationError(`unknown suite item ${name}`);
        if (name.trim().length === 0) declarationError(`empty ${category} exclusion name`);
        requireReason(reason,`${family} ${category} ${name}`);
      }
    }
  }
}

function validateRefusalAndContentExclusions(registration: ConformanceRegistration): void {
  const refusals = new Set<string>(Object.values(refusalRecoveryTable).flatMap((cases)=>cases.map((scenario)=>scenario.id)));
  for (const [name,reason] of declarationEntries(registration.declarations.refusalExclusions,"refusalExclusions")) {
    if (!refusals.has(name)) declarationError(`unknown refusal case ${name}`);
    requireReason(reason,`refusal ${name}`);
  }
  for (const [kind,reason] of declarationEntries(registration.declarations.rejectingContentUnavailable,"rejectingContentUnavailable")) {
    if (!Object.hasOwn(KIND_REGISTRY,kind)) declarationError(`unknown kind ${kind}`);
    if (!registration.declarations.families.includes(KIND_REGISTRY[kind as KindId].family)) declarationError(`content exclusion names an unserved kind ${kind}`);
    requireReason(reason,`content ${kind}`);
  }
}


function validateNames(value: unknown,label: string,allowed?: ReadonlySet<string>,mayBeEmpty = true): void {
  if (!Array.isArray(value) || (!mayBeEmpty && value.length === 0)
    || value.some((name: unknown)=>typeof name !== "string" || name.trim().length === 0 || (allowed !== undefined && !allowed.has(name)))
    || new Set(value).size !== value.length) declarationError(`${label} must be a distinct subset of known nonempty names`);
}

function validateEntryShapes(registration: ConformanceRegistration): void {
  for (const [kind,shape] of declarationEntries(registration.declarations.entryShapes,"entryShapes")) {
    if (!Object.hasOwn(KIND_REGISTRY,kind)) declarationError(`unknown entry kind ${kind}`);
    const definition = KIND_REGISTRY[kind as KindId];
    if (!registration.declarations.families.includes(definition.family) || definition.merge !== "entry") {
      declarationError(`entry shape requires a served entry kind: ${kind}`);
    }
    const config = Object.fromEntries(declarationEntries(shape,`entry shape ${kind}`));
    if (config.shape !== "heading" && config.shape !== "field-header") declarationError(`unknown entry shape ${kind}`);
    validateNames(config.sections,`entry sections ${kind}`,undefined,false);
  }
}
