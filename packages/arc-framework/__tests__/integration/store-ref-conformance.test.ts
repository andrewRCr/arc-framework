/** Shared assertions against real state refs through the public store factory. */
import { registerStoreConformanceSuite } from "../helpers/store/conformance-suite.js";
import { refRegistration } from "../helpers/store/ref-fixture.js";
registerStoreConformanceSuite("ref storage", refRegistration);
