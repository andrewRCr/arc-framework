/** Shared assertions against real Git and the public repository store factory. */
import { registerStoreConformanceSuite } from "../helpers/store/conformance-suite.js";
import { inRepoRegistration } from "../helpers/store/in-repo-fixture.js";
import { useInRepoStoreForEach } from "../helpers/in-repo-store-override.js";

// The in-repo implementation's sync saves through Git notes, which refuse unless the in-repo store is selected.
useInRepoStoreForEach();
registerStoreConformanceSuite("in-repo storage", inRepoRegistration);
