/** Real code and state awaiting publication at one bare receiver. */

import { refSyncFixture } from "./ref-sync.js";
import { plantRef } from "./ref-plant.js";
import { success } from "./suite-tools.js";
import { RecordReferenceSchema } from "../../../src/lib/store/index.js";

export const carriedDocument = RecordReferenceSchema.parse({ kind: "personal/document", key: "carried.md", owner: { type: "person", name: "andrew" } });
export const carryProvenance = { verb: "edit", lifecycleAction: "save" };
export const carriedBranch = "refs/heads/carried";

export async function refCarryFixture(layout: "default" | "separate") {
  const h = await refSyncFixture(layout);
  const parent = (await h.a.exec("git", ["rev-parse", "HEAD"])).stdout.trim();
  const code = await plantRef(h.a.root, carriedBranch, [{ path: "carried.txt", content: "Carried code.\n" }], { parents: [parent] });
  success(await h.a.store.write({ action: "put", reference: carriedDocument, expected: null, content: "Carried state.\n", provenance: carryProvenance }));
  return { ...h, code };
}
