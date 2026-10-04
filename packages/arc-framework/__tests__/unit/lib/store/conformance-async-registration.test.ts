/** Shared assertions await fixture construction before observing its public contract. */
import { describe } from "vitest";
import { createReferenceFixture, referenceDeclarations } from "../../../helpers/store/reference-fixture.js";
import { registerLookupAssertions } from "../../../helpers/store/suite-lookup.js";
import { registerMergeAssertions } from "../../../helpers/store/suite-merges.js";
import { registerCapabilityAssertions } from "../../../helpers/store/suite-records.js";
import { registerFreshnessAssertions } from "../../../helpers/store/suite-versions.js";
import { familyOf } from "../../../../src/lib/store/index.js";

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

for (const family of ["cohort", "personal"] as const) describe(`${family} freshness without another served family`, () => {
  const declarations = { ...referenceDeclarations, families: [family] };
  registerFreshnessAssertions({ item: 6, registration: {
    declarations,
    create() {
      const fixture = createReferenceFixture();
      return { ...fixture, declarations, reference(kind, suffix) {
        if (familyOf(kind) !== family) throw new Error(`Unserved freshness record: ${kind}`);
        return fixture.reference(kind, suffix);
      } };
    },
  } });
});
