/** Latest-home selection is scoped by list and ordered across both receipt refs by time. */
import { expect, it } from "vitest";
import { createReferenceFixture } from "../../../helpers/store/reference-fixture.js";
import { success } from "../../../helpers/store/suite-tools.js";
import { latestRoutingReceipt } from "../../../../src/lib/inbox/receipts.js";
import { writeRoutingReceipt } from "../../../../src/lib/store/kinds/routing-receipt.js";

it("chooses the latest relevant receipt across both refs by instant, not iteration order or date", async () => {
  const f = createReferenceFixture();
  const receipts = [
    { kind: "personal/routing-receipt" as const, time: "2026-01-01T12:00:00+01:00", source: { list: "personal", identity: "test-user" }, destination: { list: "old-home" } },
    { kind: "project-inbox/routing-receipt" as const, time: "2026-01-01T11:30:00Z", source: { list: "personal", identity: "test-user" }, destination: { list: "new-home" } },
    { kind: "project-inbox/routing-receipt" as const, time: "2026-01-02T12:00:00Z", source: { list: "other-home" }, destination: { list: "unrelated" } },
  ];
  for (const [index, item] of receipts.entries()) {
    const { kind, ...receipt } = item;
    success(await f.store.write({ action: "put", reference: f.reference(kind, String(index)), expected: null,
      content: writeRoutingReceipt({ ...receipt, entryId: "12345678" }), provenance: { verb: "route", lifecycleAction: "route" } }));
  }
  const result = await latestRoutingReceipt("12345678", { list: "personal", identity: "test-user" }, { store: f.store, identity: "test-user", now: () => new Date() });
  expect(result).toMatchObject({ status: "ok", result: { destination: { list: "new-home" } } });
});
