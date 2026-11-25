/** Shared assertions against real Git and the public repository store factory. */
import { registerStoreConformanceSuite } from "../helpers/store/conformance-suite.js";
import { inRepoRegistration } from "../helpers/store/in-repo-fixture.js";
registerStoreConformanceSuite("in-repo storage", inRepoRegistration);
