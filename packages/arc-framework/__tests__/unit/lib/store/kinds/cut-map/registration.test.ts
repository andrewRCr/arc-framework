import { describe, expect, it } from "vitest";
import { createDecomposePlanFixture } from "../../../../../fixtures/decompose-plan.js";
import { lifecycleSuccess } from "../../../../../helpers/store/lifecycle-harness.js";
import { observedDecomposeWrite } from "../../../../../helpers/store/decompose-batch.js";
import { recordReferences } from "../../../../../../src/lib/store/identity.js";
import { writeCutMapRecord } from "../../../../../../src/lib/store/kinds/cut-map/index.js";

async function fixture() {
  const h = await createDecomposePlanFixture();
  const reference = recordReferences["work-item/cut-map"](h.primary.reference.owner);
  return { ...h, value: h.map, reference };
}

describe("production cut map registration", () => {
  it("writes parsed fields and retains exact history after removal", async () => {
    const h = await fixture();
    const content = writeCutMapRecord(h.value);
    const written = lifecycleSuccess(await observedDecomposeWrite(h.store, { action: "put", reference: h.reference, expected: null,
      content, provenance: { verb: "decompose", lifecycleAction: "additive" } }));
    const read = lifecycleSuccess(await h.store.read({ reference: written.reference }));
    expect(read).toMatchObject({ content, fields: h.value });
    const reference = read.reference;
    lifecycleSuccess(await observedDecomposeWrite(h.store, { action: "remove", reference, expected: read.version,
      provenance: { verb: "decompose", lifecycleAction: "discard" } }));
    expect(await h.store.read({ reference })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
    expect(lifecycleSuccess(await h.store.history({ reference }))).toMatchObject([
      { reference, version: null, content: null, provenance: { verb: "decompose", lifecycleAction: "discard" } },
      { reference, version: read.version, content, provenance: { verb: "decompose", lifecycleAction: "additive" } },
    ]);
  });
  it("refuses semantically invalid map content through the registered parser", async () => {
    const h = await fixture();
    const invalid = { ...h.value, schemaVersion: 3 };
    expect(await h.store.write({ action: "put", reference: h.reference, expected: null,
      content: JSON.stringify(invalid), provenance: { verb: "decompose", lifecycleAction: "additive" } }))
      .toMatchObject({ status: "refused", refusal: { code: "record-malformed", condition: expect.stringContaining("schemaVersion") } });
  });
});
