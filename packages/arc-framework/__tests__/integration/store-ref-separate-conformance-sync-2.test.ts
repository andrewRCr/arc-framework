/** Separate-layout ref conformance, items 16–17, part 2 of 3: sync outcomes and registered write checks. */
import { registerStoreConformanceSuite } from "../helpers/store/conformance-suite.js";
import { separateRefRegistration } from "../helpers/store/ref-fixture.js";
registerStoreConformanceSuite("separate ref storage", separateRefRegistration, { range: "sync-2" });
