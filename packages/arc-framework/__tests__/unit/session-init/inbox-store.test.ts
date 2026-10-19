/** Session inbox consumers use kind fields over one selected-store read. */
import { expect, it, vi } from "vitest";
import { readUserInboxFromStore } from "../../../src/handlers/status/session-context.js";
import { runInboxState } from "../../../src/lib/session-init/inbox-state.js";
import { extractReminderEntries } from "../../../src/lib/session-init/inbox-reminders.js";
import { OwnerIdentitySchema, recordReferences } from "../../../src/lib/store/identity.js";
import { createLifecycleHarness } from "../../helpers/store/lifecycle-harness.js";

const content = `# Personal Inbox\n\n## Errand\n\n### **Open**\n\n- _Id:_ \`11111111\`\n- _Created:_ \`2026-10-01\`\n- _Remind:_ \`true\`\n\nBody\n\n### **Queued**\n\n- _Id:_ \`22222222\`\n- _Created:_ \`2026-10-02\`\n\nBody\n\n### **Held**\n\n- _Id:_ \`33333333\`\n- _Created:_ \`2026-10-03\`\n- _Hold:_ \`true\`\n\nBody\n\n## Work Unit\n\n### **Proposal**\n\n- _Id:_ \`44444444\`\n- _Created:_ \`2026-10-04\`\n\nBody\n`;
it("reads the selected identity's store inbox and counts queued IDs apart from routable captures", async () => {
  const h = createLifecycleHarness();
  await h.seed(recordReferences["personal/inbox"](OwnerIdentitySchema.parse({ type: "person", name: "andrew" })), content);
  const read = await readUserInboxFromStore(h.store, "andrew");
  expect(runInboxState({ content: read, queuedEntryIds: new Set(["22222222"]) })).toMatchObject({ routableCount: 2, executeBoundCount: 1, housekeepNeeded: true });
  expect(extractReminderEntries({ content: read })).toEqual({ entries: [{ key: "Open", created: "2026-10-01" }, { key: "Held", created: "2026-10-03" }] });
});
it("returns an empty inbox only on a missing personal record", async () => {
  const h = createLifecycleHarness();
  expect(await readUserInboxFromStore(h.store, "andrew")).toBe("");
});
it("an empty queue ignores old execute-bound marks while legacy reads keep them", () => {
  const marked = content.replace("### **Open**\n\n", "### **Open**\n\n- _Disposition:_ `execute-bound`\n");
  expect(runInboxState({ content: marked })).toMatchObject({ routableCount: 2, executeBoundCount: 1 });
  expect(runInboxState({ content: marked, queuedEntryIds: new Set() })).toMatchObject({ routableCount: 3, executeBoundCount: 0 });
});

it("does not turn an operational inbox failure into an empty list", async () => {
  const h = createLifecycleHarness();
  const read = vi.spyOn(h.store, "read").mockRejectedValue(new Error("Personal record cannot be read"));
  try { await expect(readUserInboxFromStore(h.store, "andrew")).rejects.toThrow("Personal record cannot be read"); }
  finally { read.mockRestore(); }
});

it("reports derived survivors with their homes and a text inspection action", () => {
  const survivors = [{ id: "11111111", title: "Open", home: { list: "target" } }];
  const result = runInboxState({ content, queuedEntryIds: new Set<string>(), survivors });
  expect(result).toMatchObject({ survivors, actions: expect.arrayContaining([{ text: "arc inbox personal" }]) });
});
