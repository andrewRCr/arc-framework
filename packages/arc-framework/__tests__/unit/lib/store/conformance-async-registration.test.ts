/** Shared assertions await fixture construction before observing its public contract. */
import { describe } from "vitest";
import { createReferenceFixture, referenceDeclarations } from "../../../helpers/store/reference-fixture.js";
import { registerLookupAssertions } from "../../../helpers/store/suite-lookup.js";
import { registerMergeAssertions } from "../../../helpers/store/suite-merges.js";
import { registerCapabilityAssertions } from "../../../helpers/store/suite-records.js";

describe("asynchronous conformance registration", () => {
  registerCapabilityAssertions({ item: 15, registration: {
    declarations: referenceDeclarations,
    async create() { await Promise.resolve(); return createReferenceFixture(); },
  } });
});

// A subset fixture must never open an unrelated hardcoded family assertion.
describe("served-family subset with asynchronous creation", () => {
  registerLookupAssertions({ item: 12, registration: {
    declarations: { ...referenceDeclarations, families: ["cohort"] },
    create() { throw new Error("No work-item, lineage, or claim assertion belongs to this subset"); },
  } });
});

describe("entry persistence independent of stale-base merging", () => {
  registerMergeAssertions({ item: 3, registration: {
    declarations: { ...referenceDeclarations, families: ["project-inbox"], mergesConcurrentWrites: false },
    create: createReferenceFixture,
  } });
});
