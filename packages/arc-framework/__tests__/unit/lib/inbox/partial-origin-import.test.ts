/** Pre-import partial bindings survive ID stamping without admitting changed captures. */
import { expect, it } from "vitest";
import { createInboxHarness } from "../../../helpers/inbox-harness.js";
import { seed, success } from "../../../helpers/store/suite-tools.js";
import { settleStorePartialCapture } from "../../../../src/handlers/errand-entry-storage.js";
import { inboxEntrySourceDigest } from "../../../../src/lib/user-sync/inbox-writer.js";
import { listInbox } from "../../../../src/lib/inbox/listing.js";

const original = "## Errand\n\n### **Concern**\n- _Created:_ `2026-01-01`\n\n<!-- Example identity:\n- _Id:_ `deadbeef`\n-->\nOriginal capture\n";
const bindings = ["\n", "\r\n"].flatMap(newline => [
  { title: "Concern", legacyTitle: "Concern" },
  { title: "Outer **inner** tail", legacyTitle: "Outer" },
].map(binding => ({ newline, ...binding })));

it.each(bindings)("settles unchanged imported $title through its original binding with $newline endings", async ({ newline, title, legacyTitle }) => {
  const h = createInboxHarness(), beforeImport = original.replace("**Concern**", `**${title}**`).replaceAll("\n", newline);
  const digest = inboxEntrySourceDigest(beforeImport, legacyTitle);
  await seed(h.fixture, h.fixture.reference("personal/inbox"), beforeImport);
  expect(await listInbox({ list: "personal" }, h.context)).toMatchObject({ entries: [{ title }] });
  const result = await settleStorePartialCapture({ originEntry: legacyTitle, originEntrySourceDigest: digest, parentCheckoutPath: null }, h.context);
  expect(result).toMatchObject({ outcome: { kind: "applied" }, disposition: "removed" });
  expect(await listInbox({ list: "personal" }, h.context)).toMatchObject({ entries: [] });
});

it.each(bindings)("retains imported $title whose prose changed with $newline endings", async ({ newline, title, legacyTitle }) => {
  const h = createInboxHarness(), beforeImport = original.replace("**Concern**", `**${title}**`).replaceAll("\n", newline);
  const digest = inboxEntrySourceDigest(beforeImport, legacyTitle);
  const imported = await seed(h.fixture, h.fixture.reference("personal/inbox"), beforeImport);
  success(await h.context.store.write({ action: "put", reference: imported.reference, expected: imported.version,
    content: imported.content.replace("Original capture", "Edited capture"), provenance: { verb: "edit", lifecycleAction: "edit" } }));
  expect(await settleStorePartialCapture({ originEntry: legacyTitle, originEntrySourceDigest: digest, parentCheckoutPath: null }, h.context))
    .toMatchObject({ disposition: "retained" });
  expect(await listInbox({ list: "personal" }, h.context)).toMatchObject({ entries: [{ raw: expect.stringContaining("Edited capture") }] });
});

it.each(bindings)("keeps the original digest for $title with a legacy ID and $newline endings", async ({ newline, title, legacyTitle }) => {
  const h = createInboxHarness(), beforeImport = original.replace("**Concern**", `**${title}**`)
    .replace("- _Created:_ `2026-01-01`", "- _Created:_ `2026-01-01`\n- _Id:_ `12345678`").replaceAll("\n", newline);
  const digest = inboxEntrySourceDigest(beforeImport, legacyTitle);
  await seed(h.fixture, h.fixture.reference("personal/inbox"), beforeImport);
  expect(await settleStorePartialCapture({ originEntry: legacyTitle, originEntrySourceDigest: digest, parentCheckoutPath: null }, h.context))
    .toMatchObject({ disposition: "removed" });
  expect(await listInbox({ list: "personal" }, h.context)).toMatchObject({ entries: [] });
});

it.each(["\n", "\r\n"])("retains ambiguous historical titles without removing either current identity with %j endings", async (newline) => {
  const h = createInboxHarness(), beforeImport = original.replace("**Concern**", "**Outer **inner** tail**").replaceAll("\n", newline);
  const digest = inboxEntrySourceDigest(beforeImport, "Outer");
  const saved = await seed(h.fixture, h.fixture.reference("personal/inbox"), beforeImport);
  success(await h.context.store.write({ action: "put", reference: saved.reference, expected: saved.version,
    content: `${saved.content}${newline}### **Outer **other** ending**${newline}- _Id:_ \`12345678\`${newline}${newline}Other concern${newline}`,
    provenance: { verb: "edit", lifecycleAction: "edit" } }));
  const before = success(await h.context.store.version());
  expect(await settleStorePartialCapture({ originEntry: "Outer", originEntrySourceDigest: digest, parentCheckoutPath: null }, h.context))
    .toMatchObject({ disposition: "retained" });
  expect(success(await h.context.store.version())).toBe(before);
  expect(await listInbox({ list: "personal" }, h.context)).toMatchObject({ entries: [{ title: "Outer **inner** tail" }, { title: "Outer **other** ending" }] });
});
