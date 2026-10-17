/** Shared assertions over a real bare reftable store beside the code repository. */
import { registerStoreConformanceSuite } from "../helpers/store/conformance-suite.js";
import { separateRefRegistration } from "../helpers/store/ref-fixture.js";
registerStoreConformanceSuite("separate ref storage", separateRefRegistration);
