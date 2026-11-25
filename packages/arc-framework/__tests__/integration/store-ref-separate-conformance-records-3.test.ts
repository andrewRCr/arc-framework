/** Separate-layout ref conformance, items 1–6, part 3 of 4: records, conflicts, stale bases, batches, and freshness. */
import { registerStoreConformanceSuite } from "../helpers/store/conformance-suite.js";
import { separateRefRegistration } from "../helpers/store/ref-fixture.js";
registerStoreConformanceSuite("separate ref storage", separateRefRegistration, { range: "records-3" });
