/** Ref conformance over real state refs, items 1–6: records, conflicts, stale bases, batches, and freshness. */
import { registerStoreConformanceSuite } from "../helpers/store/conformance-suite.js";
import { refRegistration } from "../helpers/store/ref-fixture.js";
registerStoreConformanceSuite("ref storage", refRegistration, { range: "records" });
