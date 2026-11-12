/** Personal inbox mutations read and update only the selected Store after the flip. */
import { expect, it } from "vitest";
import { removeCurrentInboxEntry } from "../../src/commands/user/inbox-mutation.js";
import { createLifecycleHarness, lifecycleSuccess } from "../helpers/store/lifecycle-harness.js";
import { OwnerIdentitySchema, recordReferences } from "../../src/lib/store/identity.js";
import type { UserIOContext } from "../../src/commands/user/types.js";
const dependencies = { acquireLock: async () => ({ path: "/virtual-lock", pid: process.pid, token: "owned" }), releaseLock: async () => {} };
const owner = OwnerIdentitySchema.parse({ type: "person", name: "andrew" });
const reference = recordReferences["personal/inbox"](owner);
function fixture() {
  const h = createLifecycleHarness();
  const io: UserIOContext = { exec: async () => ({ stdout: "/repo/.git" }), readFile: async () => { throw Object.assign(new Error("Missing workspace copy"), { code: "ENOENT" }); },
    writeFile: async () => { throw new Error("Workspace write is forbidden"); }, mkdir: async () => {},
    readDir: async () => [], readNote: async () => null, writeNote: async () => {} };
  return { ...h, options: { cwd: "/repo", io, identity: "andrew", store: h.store } };
}
it("removes one exact capture and returns the Store's surviving post-image without a workspace inbox", async () => {
  const h = fixture();
  await h.seed(reference, "# Inbox\n\n## Work Unit\n\n### **Remove me**\n\n- _Id:_ `12345678`\n\n### **Keep me**\n\n- _Id:_ `87654321`\n");
  const result = await removeCurrentInboxEntry({ ...h.options, title: "Remove me" }, dependencies);
  expect(result).toMatchObject({ removed: true, postImage: { state: "present", content: expect.stringContaining("Keep me") } });
  expect(lifecycleSuccess(await h.store.read({ reference })).content).not.toContain("Remove me");
  expect(result.postImage.content).toBe(lifecycleSuccess(await h.store.read({ reference })).content);
});
it("reports an absent personal record without materializing a workspace copy", async () => {
  const h = fixture();
  expect(await removeCurrentInboxEntry({ ...h.options, title: "Absent" }, dependencies)).toMatchObject({ removed: false, postImage: { state: "missing" } });
  expect(await h.store.read({ reference })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
});
it("returns concurrent surviving captures from the Store's declared entry merge", async () => {
  const { vi } = await import("vitest");
  const h = fixture(), record = await h.seed(reference, "# Inbox\n\n## Work Unit\n\n### **Remove me**\n\n- _Id:_ `12345678`\n\n### **Keep me**\n\n- _Id:_ `87654321`\n");
  const write = h.store.write.bind(h.store);
  let advanced = false;
  vi.spyOn(h.store, "write").mockImplementation(async input => {
    if (input.action !== "put") throw new Error("Fixture expects a personal record put");
    if (!advanced) {
      advanced = true;
      lifecycleSuccess(await write({ ...input, expected: record.version,
        content: record.content + "\n### **Concurrent capture**\n\n- _Id:_ `abcdef12`\n" }));
    }
    return write(input);
  });
  const result = await removeCurrentInboxEntry({ ...h.options, title: "Remove me" }, dependencies);
  expect(result.postImage.content).toContain("Concurrent capture");
  expect(result.postImage.content).toContain("Keep me");
  expect(result.postImage.content).not.toContain("Remove me");
  expect(result.postImage.content).toBe(lifecycleSuccess(await h.store.read({ reference })).content);
});
