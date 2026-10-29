/** Ref conformance over real state refs, items 16–17: sync outcomes and registered write checks. */
import { registerStoreConformanceSuite } from "../helpers/store/conformance-suite.js";
import { refRegistration } from "../helpers/store/ref-fixture.js";
registerStoreConformanceSuite("ref storage", refRegistration, { range: "sync" });
