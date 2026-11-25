/** Separate-layout ref conformance, items 7–15, part 2 of 4: versions, listings, formats, history, lookup, and refusals. */
import { registerStoreConformanceSuite } from "../helpers/store/conformance-suite.js";
import { separateRefRegistration } from "../helpers/store/ref-fixture.js";
registerStoreConformanceSuite("separate ref storage", separateRefRegistration, { range: "reads-2" });
