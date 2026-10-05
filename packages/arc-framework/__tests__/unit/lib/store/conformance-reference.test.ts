/** The same sixteen-item contract suite used by every backend, over the whole memory namespace. */

import { registerStoreConformanceSuite } from "../../../helpers/store/conformance-suite.js";
import { referenceRegistration } from "../../../helpers/store/reference-fixture.js";

registerStoreConformanceSuite("reference backend", referenceRegistration);
