/** Shared assertions against real Git and the public tracked store factory. */
import { registerStoreConformanceSuite } from "../helpers/store/conformance-suite.js";
import { inRepoRegistration } from "../helpers/store/in-repo-fixture.js";
registerStoreConformanceSuite("tracked in-repo storage", inRepoRegistration);
