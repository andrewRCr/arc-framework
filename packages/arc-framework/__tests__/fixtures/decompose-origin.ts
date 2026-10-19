/** Minimal production-checked Planning origin for store decomposition scenarios. */
import { createDecomposeHarness } from "../helpers/store/decompose-harness.js";
import { recordReferences } from "../../src/lib/store/identity.js";
import { decomposeContext } from "./decompose-context.js";

/** Seed one draft-profile origin, ready for read-only source derivation. */
export async function createDecomposeOriginFixture() {
  const h = createDecomposeHarness();
  const primary = await h.seedMeta("origin", { state: "Planning", currentWorkflow: null, design: ["draft-origin.md"] },
    { kind: "backlog", commitment: "planned" });
  const draft = await h.seed(recordReferences["work-item/draft"](primary.reference.owner), "# Origin\n\n## Scope\n\nOwned work.\n");
  return { ...h, primary, draft, ctx: decomposeContext(h.store) };
}
