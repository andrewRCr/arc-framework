/** Ref conformance over real state refs, items 16–18: sync outcomes, registered write checks and pending projection views. */
import { registerStoreConformanceSuite } from "../helpers/store/conformance-suite.js";
import { refRegistration } from "../helpers/store/ref-fixture.js";
registerStoreConformanceSuite("ref storage", refRegistration, { range: "sync" });
