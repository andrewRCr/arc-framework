/** Personal callers use the selected in-repo Store while retaining legacy title writes. */
import { expect, it, vi } from "vitest";
import { runUserAdd } from "../../src/commands/user/add.js";
import { removeCurrentInboxEntry } from "../../src/commands/user/inbox-mutation.js";
import { createUserIOContext } from "../../src/lib/io-context.js";
import { personalFixture, personalReference } from "../helpers/store/personal-fixture.js";
import { lifecycleSuccess } from "../helpers/store/lifecycle-harness.js";
const inbox = personalReference("personal/inbox"), memory = personalReference("personal/working-memory");
const content = "# Inbox\n\n## Work Unit\n\n### **Remove me**\n\nA capture.\n\n### **Keep me**\n\nOther prose.\n";
it("reads and mutates the selected in-repo record when caller filesystem reads have no copy", async () => {
  const h = await personalFixture();
  await h.plant("USER-INBOX.md", content);
  const io = { ...createUserIOContext(), exec: h.exec, readFile: async () => { throw Object.assign(new Error("Caller has no workspace copy"), { code: "ENOENT" }); } };
  const result = await removeCurrentInboxEntry({ cwd: h.root, io, identity: "andrew", store: h.store, title: "Remove me" });
  expect(result).toMatchObject({ removed: true, postImage: { state: "present", content: expect.stringContaining("Keep me") } });
  expect(lifecycleSuccess(await h.store.read({ reference: inbox })).content).not.toContain("Remove me");
});
it("user add seeds the selected in-repo Store rather than the caller's direct writer", async () => {
  const h = await personalFixture();
  const io = { ...createUserIOContext(), exec: h.exec, readFile: async (path: string) => path.endsWith("WORKING-MEMORY.md") ? "# Seed memory\n" : "# Seed inbox\n",
    writeFile: async () => { throw new Error("Caller direct writes must not seed selected Store records"); } };
  await runUserAdd({ cwd: h.root, io, identity: "andrew", store: h.store, internalTemplateDir: "/templates" });
  expect(lifecycleSuccess(await h.store.read({ reference: inbox })).content).toBe("# Seed inbox\n");
  expect(lifecycleSuccess(await h.store.read({ reference: memory })).content).toBe("# Seed memory\n");
});
it("recomputes a legacy title removal after another writer advances its version", async () => {
  const h = await personalFixture(); await h.plant("USER-INBOX.md", content);
  const write = h.store.write.bind(h.store);
  let advanced = false;
  vi.spyOn(h.store, "write").mockImplementation(async input => {
    if (input.action !== "put") throw new Error("Expected an inbox put");
    if (!advanced) {
      advanced = true;
      lifecycleSuccess(await write({ ...input, content: content + "\n### **Concurrent capture**\n\nKeep this too.\n" }));
    }
    return write(input);
  });
  const result = await removeCurrentInboxEntry({ cwd: h.root, io: { ...createUserIOContext(), exec: h.exec }, identity: "andrew", store: h.store, title: "Remove me" });
  expect(result.postImage.content).toContain("Concurrent capture");
  expect(result.postImage.content).not.toContain("Remove me");
  expect(lifecycleSuccess(await h.store.read({ reference: inbox })).content).toBe(result.postImage.content);
});
it("refuses persistent version contention without dropping the capture", async () => {
  const h = await personalFixture(); await h.plant("USER-INBOX.md", content);
  vi.spyOn(h.store, "write").mockImplementation(async input => ({ status: "refused", refusal: { code: "version-conflict", class: "recoverable", records: [input.reference],
    condition: "Another writer keeps advancing this record.", remedy: { text: "Retry once the other writer finishes." } } }));
  await expect(removeCurrentInboxEntry({ cwd: h.root, io: { ...createUserIOContext(), exec: h.exec }, identity: "andrew", store: h.store, title: "Remove me" }))
    .rejects.toMatchObject({ code: "user.inbox-refused", cause: { code: "version-conflict" } });
  expect(lifecycleSuccess(await h.store.read({ reference: inbox })).content).toBe(content);
}, 10_000);
