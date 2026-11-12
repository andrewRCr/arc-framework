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
it("legacy reconcile reads and writes the selected Store instead of different caller filesystem bytes", async () => {
  const { mkdir, writeFile } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const { writeTransitionRecord } = await import("../../src/lib/work-unit/transition-record-store.js");
  const { LineageRecordSchema } = await import("../../src/lib/store/kinds/lineage/index.js");
  const { handleUserReconcileReferences } = await import("../../src/handlers/user.js");
  const h = await personalFixture();
  await mkdir(join(h.root, ".arc/system"), { recursive: true });
  await writeFile(join(h.root, ".arc/system/arc-config.yml"), "branch.base: main\nbranch.protection: partial\n");
  await writeTransitionRecord(h.root, LineageRecordSchema.parse({ schemaVersion: 2, origin: { name: "former" }, kind: "rename", successors: [{ name: "current" }], incoming: [] }));
  await h.exec("git", ["add", ".arc/system"]); await h.exec("git", ["commit", "-m", "Record rename authority"]);
  await h.plant("USER-INBOX.md", "# Caller filesystem inbox\n");
  await h.plant("WORKING-MEMORY.md", "# Caller filesystem memory\n");
  await h.exec("git", ["checkout", "-b", "feat/dependent"]);
  await h.plant("dependent/SESSION-NOTES.md", "# Caller filesystem session context\n");
  let selectedInbox = "# Inbox\n\n## Work Unit\n\n### **Keep target**\n\n- _WU_Target:_ `former`\n";
  const memoryBytes = "# Memory\n\nThe former workflow remains useful prose.\n";
  const sessionBytes = "# Session context\n\nThe former note stays advisory.\n";
  const read = h.ports.fs.readFile, write = h.ports.fs.writeFile;
  h.ports.fs.readFile = path => path === h.path("USER-INBOX.md") ? Promise.resolve(selectedInbox)
    : path === h.path("WORKING-MEMORY.md") ? Promise.resolve(memoryBytes)
    : path === h.path("dependent/SESSION-NOTES.md") ? Promise.resolve(sessionBytes) : read(path);
  h.ports.fs.writeFile = (path, value) => { if (path === h.path("USER-INBOX.md")) { selectedInbox = value; return Promise.resolve(); } return write(path, value); };
  const storeWrite = h.store.write.bind(h.store);
  let competing = true;
  vi.spyOn(h.store, "write").mockImplementation(async input => {
    if (input.action !== "put") throw new Error("Expected a managed inbox put");
    if (competing) {
      competing = false;
      lifecycleSuccess(await storeWrite({ ...input,
        content: selectedInbox + "\n### **Concurrent target**\n\n- _WU_Target:_ `former`\n" }));
    }
    return storeWrite(input);
  });
  const originalCwd = process.cwd(), originalExit = process.exitCode;
  let output = "";
  const out = vi.spyOn(process.stdout, "write").mockImplementation(chunk => { output += String(chunk); return true; });
  try {
    process.chdir(h.root); process.exitCode = undefined;
    await handleUserReconcileReferences({ apply: true, json: true }, undefined, h.store);
    expect(selectedInbox).toContain("_WU_Target:_ `current`");
    expect(selectedInbox).toContain("### **Concurrent target**\n\n- _WU_Target:_ `current`");
    expect(JSON.parse(output)).toMatchObject({ status: "applied", plan: { advisories: expect.arrayContaining([expect.objectContaining({ subject: "former", path: ".arc/user/andrew/WORKING-MEMORY.md" }),
      expect.objectContaining({ subject: "former", path: join(h.root, ".arc/user/andrew/dependent/SESSION-NOTES.md") })]) } });
    expect(lifecycleSuccess(await h.store.read({ reference: memory })).content).toBe(memoryBytes);
    expect(lifecycleSuccess(await h.store.read({ reference: personalReference("personal/session-context", "dependent") })).content).toBe(sessionBytes);
    expect(process.exitCode).toBeUndefined();
  } finally { out.mockRestore(); process.chdir(originalCwd); process.exitCode = originalExit; }
}, 30_000);
