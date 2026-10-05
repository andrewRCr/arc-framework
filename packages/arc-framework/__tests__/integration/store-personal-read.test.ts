/** Public-store differentials against the existing personal file readers. */
import { readFile, mkdir, writeFile, chmod } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { personalFixture, personalReference, personalDigest, inboxBytes, personalProvenance } from "../helpers/store/personal-fixture.js";
import { success } from "../helpers/store/suite-tools.js";
import { parseCrossWuEntries } from "../../src/lib/user-sync/parser.js";
import { createStore } from "../../src/lib/store/create.js";
import { createDefaultStorePorts } from "../../src/lib/store/default-ports.js";
import { makeGitExec, makeGitExecInput } from "../helpers/integration.js";
import { holdPersonalLockInProcess } from "../helpers/store/personal-lock-holder.js";
import { OwnerIdentitySchema } from "../../src/lib/store/identity.js";

describe("personal reads", () => {
  it("reads inbox bytes and entries exactly as the existing file reader", async () => {
    const h = await personalFixture();
    await h.plant("USER-INBOX.md", inboxBytes);
    const record = success(await h.store.read({ reference: personalReference("personal/inbox") }));
    const existing = await readFile(h.path("USER-INBOX.md"), "utf8");
    expect(record.content).toBe(existing);
    expect(record.version).toBe(personalDigest(existing));
    expect(parseCrossWuEntries(record.content, "user-inbox")).toEqual(parseCrossWuEntries(existing, "user-inbox"));
    expect(parseCrossWuEntries(existing, "user-inbox")).toHaveLength(2);
  });

  it("reads workspace session notes and arbitrary personal documents by their existing roots", async () => {
    const h = await personalFixture();
    await h.plant("example/SESSION-NOTES.md", "session bytes\n\n");
    await h.plant("example/research.bin", "binary extension prose\n");
    await h.plant("research.txt", "research bytes\r\n");
    expect(success(await h.store.read({ reference: personalReference("personal/session-context", "example") })).content)
      .toBe(await readFile(h.path("example/SESSION-NOTES.md"), "utf8"));
    for (const key of ["example/research.bin", "research.txt"]) {
      expect(success(await h.store.read({ reference: personalReference("personal/document", key) })).content)
        .toBe(await readFile(h.path(key), "utf8"));
    }
  });

  it("uses primary top-level files and this checkout's workspace from a linked worktree", async () => {
    const h = await personalFixture();
    await h.plant("USER-INBOX.md", inboxBytes);
    await h.plant("example/SESSION-NOTES.md", "primary notes");
    const linked = join(h.root, "linked");
    await h.exec("git", ["worktree", "add", "-b", "linked-personal", linked]);
    await mkdir(join(linked, ".arc/user/andrew/example"), { recursive: true });
    await writeFile(join(linked, ".arc/user/andrew/USER-INBOX.md"), "stale inbox");
    await writeFile(join(linked, ".arc/user/andrew/example/SESSION-NOTES.md"), "linked notes\n\n");
    const store = createStore(createDefaultStorePorts({ checkoutRoot: linked, exec: makeGitExec(linked), execInput: makeGitExecInput(linked) }));
    expect(success(await store.read({ reference: personalReference("personal/inbox") })).content).toBe(inboxBytes);
    expect(success(await store.read({ reference: personalReference("personal/session-context", "example") })).content).toBe("linked notes\n\n");
  });

  it("lists visible files without extension filtering and excludes every dot-named segment", async () => {
    const h = await personalFixture();
    const files = ["USER-INBOX.md", "WORKING-MEMORY.md", "example/SESSION-NOTES.md", "example/file.data", "research.txt", "STATUS.USER.md",
      ".cache", ".internal/state.json", "example/.internal/state.json", "example/.hidden", "example/deep/.cache/item.md"];
    for (const key of files) await h.plant(key, key);
    const listing = success(await h.store.list({ family: "personal" }));
    expect(listing.status).toBe("complete");
    if (listing.status !== "complete") return;
    expect(listing.diagnostics).toEqual([]);
    expect(listing.missed).toBe(false);
    expect(listing.records.map((record) => [record.reference.kind, record.reference.key]).sort()).toEqual([
      ["personal/inbox", undefined], ["personal/working-memory", undefined], ["personal/session-context", "example"],
      ["personal/document", "example/file.data"], ["personal/document", "research.txt"],
    ].sort());
  });

  it("reports no identity as absent or repairable and succeeds after configuring it", async () => {
    const h = await personalFixture();
    await h.plant("USER-INBOX.md", inboxBytes);
    await h.exec("git", ["config", "--unset", "arc.identity"]);
    await h.exec("git", ["config", "user.name", ""]);
    expect(success(await h.store.list({ family: "personal" }))).toEqual({ status: "absent" });
    const reference = personalReference("personal/inbox");
    for (const result of [await h.store.read({ reference }), await h.store.write({ action: "put", reference,
      expected: personalDigest(inboxBytes), content: "new content", provenance: personalProvenance })]) {
      expect(result).toMatchObject({ status: "refused", refusal: { code: "not-found", class: "recoverable" } });
      if (result.status === "refused") {
        expect(result.refusal.condition).toMatch(/no identity.*configured/iu);
        expect(result.refusal.remedy.text).toContain("arc.identity");
      }
    }
    await h.exec("git", ["config", "arc.identity", "andrew"]);
    expect(success(await h.store.read({ reference })).content).toBe(inboxBytes);
    success(await h.store.write({ action: "put", reference, expected: personalDigest(inboxBytes), content: "new content", provenance: personalProvenance }));
  });

  it("refuses a missing file with a record-specific creation remedy", async () => {
    const h = await personalFixture();
    const reference = personalReference("personal/document", "missing.md");
    expect(await h.store.read({ reference })).toMatchObject({ status: "refused", refusal: { code: "not-found", reference } });
  });

  it("reads and lists while another process holds the real notes lock", async () => {
    const h = await personalFixture();
    await h.plant("USER-INBOX.md", inboxBytes);
    const release = await holdPersonalLockInProcess(h.lockPath);
    try {
      expect(success(await h.store.read({ reference: personalReference("personal/inbox") })).content).toBe(inboxBytes);
      const listing = success(await h.store.list({ family: "personal", kind: "personal/inbox" }));
      expect(listing.status).toBe("complete");
    } finally { await release(); }
  });

  it("keeps references bound to the configured identity's namespace", async () => {
    const h = await personalFixture();
    await h.plant("USER-INBOX.md", inboxBytes);
    const other = personalReference("personal/inbox", undefined, "bravo");
    expect(await h.store.read({ reference: other })).toMatchObject({ status: "refused", refusal: { code: "not-found", reference: other } });
    expect(await h.store.write({ action: "put", reference: other, expected: null, content: "other", provenance: personalProvenance }))
      .toMatchObject({ status: "refused", refusal: { code: "not-found", reference: other } });
    expect(success(await h.store.list({ family: "personal", owner: other.owner }))).toEqual({ status: "absent" });
    expect(await readFile(h.path("USER-INBOX.md"), "utf8")).toBe(inboxBytes);
  });

  it.each(["person", "work-item", "project", "cohort"] as const)("filters the complete %s owner identity even when the name matches", async (type) => {
    const h = await personalFixture();
    await h.plant("USER-INBOX.md", inboxBytes);
    const owner = OwnerIdentitySchema.parse({ type, name: "andrew" });
    const listing = success(await h.store.list({ family: "personal", kind: "personal/inbox", owner }));
    if (type === "person") expect(listing).toMatchObject({ status: "complete", records: [{ reference: { owner }, content: inboxBytes }], missed: false });
    else expect(listing).toEqual({ status: "absent" });
    expect(await readFile(h.path("USER-INBOX.md"), "utf8")).toBe(inboxBytes);
  });

  it("preserves an unreadable file diagnostic and a wholly unreadable family outcome", async () => {
    const h = await personalFixture();
    await h.plant("USER-INBOX.md", inboxBytes);
    await chmod(h.path("USER-INBOX.md"), 0);
    try {
      expect(success(await h.store.list({ family: "personal", kind: "personal/inbox" }))).toMatchObject({
        status: "complete", records: [], missed: true, diagnostics: [{ kind: "unreadable", key: h.path("USER-INBOX.md") }],
      });
    } finally { await chmod(h.path("USER-INBOX.md"), 0o600); }
    const root = h.path("");
    await chmod(root, 0);
    try { expect(success(await h.store.list({ family: "personal" }))).toMatchObject({ status: "unreadable" }); }
    finally { await chmod(root, 0o700); }
  });

  it.each(["personal/inbox", "personal/working-memory"] as const)("reports an inaccessible identity root for %s as an unreadable family", async (kind) => {
    const h = await personalFixture();
    await h.plant(kind === "personal/inbox" ? "USER-INBOX.md" : "WORKING-MEMORY.md", "personal bytes");
    const root = h.path("");
    await chmod(root, 0);
    try { expect(success(await h.store.list({ family: "personal", kind }))).toMatchObject({ status: "unreadable" }); }
    finally { await chmod(root, 0o700); }
  });

  it("keeps machine-local paths and derived status outside personal storage", async () => {
    const h = await personalFixture();
    for (const key of [".internal/state.json", "example/.hidden", "STATUS.USER.md"]) {
      await h.plant(key, "local bytes");
      const reference = personalReference("personal/document", key);
      expect(await h.store.read({ reference })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
      expect(await h.store.write({ action: "put", reference, expected: personalDigest("local bytes"), content: "changed", provenance: personalProvenance }))
        .toMatchObject({ status: "refused", refusal: { code: "unsupported", class: "terminal", case: "unhomed-kind" } });
      expect(await readFile(h.path(key), "utf8")).toBe("local bytes");
    }
  });

  it("addresses reserved personal files by their unique role and names it in alias remedies", async () => {
    const h = await personalFixture();
    for (const [key, role] of [["USER-INBOX.md", "personal/inbox"], ["WORKING-MEMORY.md", "personal/working-memory"], ["example/SESSION-NOTES.md", "personal/session-context"]] as const) {
      await h.plant(key, "reserved bytes");
      const reference = personalReference("personal/document", key);
      const read = await h.store.read({ reference });
      expect(read).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
      if (read.status === "refused") expect(read.refusal.remedy.text).toContain(role);
      const write = await h.store.write({ action: "put", reference, expected: personalDigest("reserved bytes"), content: "changed", provenance: personalProvenance });
      expect(write).toMatchObject({ status: "refused", refusal: { code: "unsupported", case: "unhomed-kind" } });
      if (write.status === "refused") expect(write.refusal.remedy.text).toContain(role);
      expect(await readFile(h.path(key), "utf8")).toBe("reserved bytes");
    }
  });
});
