/** Pre-import partial bindings survive ID stamping without admitting changed captures. */
import { expect, it } from "vitest";
import { createInboxHarness } from "../../../helpers/inbox-harness.js";
import { seed, success } from "../../../helpers/store/suite-tools.js";
import { settleStorePartialCapture } from "../../../../src/handlers/errand-entry-storage.js";
import { inboxEntrySourceDigest } from "../../../../src/lib/user-sync/inbox-writer.js";
import { listInbox } from "../../../../src/lib/inbox/listing.js";

const original = "## Errand\n\n### **Concern**\n- _Created:_ `2026-01-01`\n\n<!-- Example identity:\n- _Id:_ `deadbeef`\n-->\nOriginal capture\n";

it.each(["\n", "\r\n"])("settles an unchanged imported capture through the default adapter (newline=%j)", async newline => {
  const h = createInboxHarness(), beforeImport = original.replaceAll("\n", newline);
  const digest = inboxEntrySourceDigest(beforeImport, "Concern");
  await seed(h.fixture, h.fixture.reference("personal/inbox"), beforeImport);
  const result = await settleStorePartialCapture({ originEntry: "Concern", originEntrySourceDigest: digest, parentCheckoutPath: null }, h.context);
  expect(result).toMatchObject({ outcome: { kind: "applied" }, disposition: "removed" });
  expect(await listInbox({ list: "personal" }, h.context)).toMatchObject({ entries: [] });
});

it.each(["\n", "\r\n"])("retains an imported capture whose prose changed (newline=%j)", async newline => {
  const h = createInboxHarness(), beforeImport = original.replaceAll("\n", newline);
  const digest = inboxEntrySourceDigest(beforeImport, "Concern");
  const imported = await seed(h.fixture, h.fixture.reference("personal/inbox"), beforeImport);
  success(await h.context.store.write({ action: "put", reference: imported.reference, expected: imported.version,
    content: imported.content.replace("Original capture", "Edited capture"), provenance: { verb: "edit", lifecycleAction: "edit" } }));
  expect(await settleStorePartialCapture({ originEntry: "Concern", originEntrySourceDigest: digest, parentCheckoutPath: null }, h.context))
    .toMatchObject({ disposition: "retained" });
  expect(await listInbox({ list: "personal" }, h.context)).toMatchObject({ entries: [{ raw: expect.stringContaining("Edited capture") }] });
});

it("keeps the original digest form when a legacy capture already contained an ID", async () => {
  const h = createInboxHarness(), beforeImport = original.replace("- _Created:_ `2026-01-01`", "- _Created:_ `2026-01-01`\n- _Id:_ `12345678`");
  const digest = inboxEntrySourceDigest(beforeImport, "Concern");
  await seed(h.fixture, h.fixture.reference("personal/inbox"), beforeImport);
  expect(await settleStorePartialCapture({ originEntry: "Concern", originEntrySourceDigest: digest, parentCheckoutPath: null }, h.context))
    .toMatchObject({ disposition: "removed" });
  expect(await listInbox({ list: "personal" }, h.context)).toMatchObject({ entries: [] });
});
