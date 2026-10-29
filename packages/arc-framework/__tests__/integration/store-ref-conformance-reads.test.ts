/** Ref conformance over real state refs, items 7–15: versions, listings, formats, history, lookup, and refusals. */
import { registerStoreConformanceSuite } from "../helpers/store/conformance-suite.js";
import { refRegistration } from "../helpers/store/ref-fixture.js";
registerStoreConformanceSuite("ref storage", refRegistration, { range: "reads" });
