/** Receipt fields, list-local identities, and the independent writer boundary. */
import { describe, expect, it } from "vitest";
import { createReferenceFixture } from "../../../../helpers/store/reference-fixture.js";
import { success } from "../../../../helpers/store/suite-tools.js";
import { parseRoutingReceipt, writeRoutingReceipt } from "../../../../../src/lib/store/kinds/routing-receipt.js";
import { KIND_MECHANISMS } from "../../../../../src/lib/store/registry.js";

const receipt = { entryId: "12345678", source: { list: "personal", identity: "test-user", section: "Work Unit" }, destination: { list: "example", section: "Inbound" }, time: "2026-01-01T12:00:00Z" };
describe("routing receipts", () => {
  it("round-trips and rejects malformed provenance", () => {
    expect(parseRoutingReceipt(writeRoutingReceipt(receipt))).toEqual({ success: true, data: receipt });
    expect(parseRoutingReceipt(JSON.stringify({ ...receipt, entryId: "wrong" })).success).toBe(false);
  });
  it("keeps two receipts for two moves of the same entry", async () => {
    const fixture = createReferenceFixture(undefined, { "personal/routing-receipt": { parser: parseRoutingReceipt } });
    for (const suffix of ["one", "two"]) success(await fixture.store.write({ action: "put", reference: fixture.reference("personal/routing-receipt", suffix), content: writeRoutingReceipt(receipt), expected: null, provenance: { verb: "route", lifecycleAction: "route" } }));
    const listed = success(await fixture.store.list({ family: "personal", kind: "personal/routing-receipt" }));
    expect(listed.status).toBe("complete");
    if (listed.status === "complete") expect(listed.records).toHaveLength(2);
  });
  it.each(["route", "errand-open", "errand-link", "errand-abandon"])("admits moving writer %s", async (verb) => {
    const fixture = createReferenceFixture(undefined, { "personal/routing-receipt": { parser: parseRoutingReceipt } });
    const result = await fixture.store.write({ action: "put", reference: fixture.reference("personal/routing-receipt"), content: writeRoutingReceipt(receipt), expected: null, provenance: { verb, lifecycleAction: verb } });
    expect(result.status).toBe("ok");
  });
  it("refuses an unlisted receipt writer and keeps conflict writers unchanged", async () => {
    const fixture = createReferenceFixture(undefined, { "personal/routing-receipt": { parser: parseRoutingReceipt } });
    expect((await fixture.store.write({ action: "put", reference: fixture.reference("personal/routing-receipt"), content: writeRoutingReceipt(receipt), expected: null, provenance: { verb: "start", lifecycleAction: "start" } })).status).toBe("refused");
    expect(KIND_MECHANISMS["personal/conflict-record"].writerVerbs).toEqual(["merge", "sync", "route", "resolve"]);
  });
});
