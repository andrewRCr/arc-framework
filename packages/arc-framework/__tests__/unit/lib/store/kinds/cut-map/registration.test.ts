import { describe, expect, it } from "vitest";
import { createLifecycleHarness, lifecycleSuccess } from "../../../../../helpers/store/lifecycle-harness.js";
import { cutMapFixture, rebindCutFixture } from "../../../../../fixtures/decompose-v4.js";
import { recordReferences } from "../../../../../../src/lib/store/identity.js";
import { writeCutMapRecord } from "../../../../../../src/lib/store/kinds/cut-map/index.js";

async function fixture() {
  const h = createLifecycleHarness();
  const primary = await h.seedMeta("origin", { state: "Planning", currentWorkflow: "draft-design" });
  const value = cutMapFixture();
  if (primary.reference.owner.type !== "work-item" || primary.reference.owner.uid === undefined) throw new Error("Missing work-item generation");
  value.machine.origin.uid = primary.reference.owner.uid;
  rebindCutFixture(value);
  const reference = recordReferences["work-item/cut-map"](primary.reference.owner);
  return { ...h, value, reference };
}

describe("production cut map registration", () => {
  it("writes parsed fields and retains exact history after removal", async () => {
    const h = await fixture();
    const content = writeCutMapRecord(h.value);
    const written = lifecycleSuccess(await h.store.write({ action: "put", reference: h.reference, expected: null,
      content, provenance: { verb: "decompose", lifecycleAction: "additive" } }));
    const read = lifecycleSuccess(await h.store.read({ reference: written.reference }));
    expect(read).toMatchObject({ content, fields: h.value });
    const reference = read.reference;
    lifecycleSuccess(await h.store.write({ action: "remove", reference, expected: read.version,
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
