/** Single backend-neutral registration of all sixteen storage contract conformance items. */

import { describe, it } from "vitest";
import { FAMILY_IDS, KIND_REGISTRY, type KindId } from "../../../src/lib/store/index.js";
import type { ConformanceRegistration, SuiteItem } from "./fixture-contract.js";
import { refusalRecoveryTable } from "./recovery.js";
import { createAssertionCoverage, emptyItemExclusions, validateUsedAssertionExclusions, type SuiteContext } from "./suite-tools.js";
import { registerCapabilityAssertions, registerDurabilityAssertions, registerRecordAssertions, registerVersionConflictAssertions } from "./suite-records.js";
import { registerBatchAssertions, registerFreshnessAssertions, registerHistoryAssertions, registerStateAssertions } from "./suite-versions.js";
import { registerMergeAssertions } from "./suite-merges.js";
import { registerFormatAssertions, registerListingAssertions } from "./suite-listings.js";
import { registerLookupAssertions } from "./suite-lookup.js";
import { registerCoverageAssertions, registerCrossSubstrateAssertions, registerRecoveryAssertions } from "./suite-recovery.js";
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
};

/** Register one describe per numbered item and named tests/skips from the fixture declarations.
 * @param name - Backend name used in the test runner output.
 * @param registration - Static exclusions and a fresh isolated fixture factory.
 * @returns Nothing after every applicable assertion is registered.
 */
export function registerStoreConformanceSuite(name: string, registration: ConformanceRegistration): void {
  validateConformanceRegistration(registration);
  const coverage = createAssertionCoverage();
  for (const [number, item] of Object.entries(conformanceItems)) {
    const context = { item: Number(number) as SuiteItem, registration, coverage };
    describe(`${name} — item ${number}: ${item.name}`, () => {
      item.register(context);
      for (const { family, reason } of emptyItemExclusions(context)) it.skip(`${family}: item ${number} — ${reason}`, () => {});
    });
  }
  describe(`${name} — declaration inventory`, () => { validateUsedAssertionExclusions(registration, coverage); });
}


/** Reject declarations that would silently narrow or mislabel conformance coverage.
 * @param registration - Backend declarations and its isolated fixture factory.
 * @returns Nothing when all coverage declarations are internally consistent.
 */
export function validateConformanceRegistration(registration: ConformanceRegistration): void {
  const declarations = registration.declarations;
  validateNames(declarations.families,"families",new Set(FAMILY_IDS),false);
  validateNames(declarations.syncFamilies,"syncFamilies",new Set(declarations.families));
  validateNames(declarations.identitySyncFamilies,"identitySyncFamilies",new Set(declarations.syncFamilies));
  validateNames(declarations.substrates,"substrates",undefined,false);
  for (const field of ["mergesConcurrentWrites","stateOffBranch","liveListingStateVersion"] as const) {
    if (typeof declarations[field] !== "boolean") declarationError(`${field} must declare a boolean`);
  }
  validateEntryShapes(registration);
  validateFamilyExclusions(registration);
  validateRefusalAndContentExclusions(registration);
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
