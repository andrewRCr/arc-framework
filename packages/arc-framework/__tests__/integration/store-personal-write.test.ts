/** Public-store mutation differentials and serialized compare-and-swap behavior. */
import { readFile, access } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { personalFixture, personalReference, personalDigest, inboxBytes, personalProvenance } from "../helpers/store/personal-fixture.js";
import { success } from "../helpers/store/suite-tools.js";
import { removeInboxEntry } from "../../src/lib/user-sync/inbox-writer.js";
import { runUserOpen } from "../../src/commands/user/open.js";
import { makeUserIO } from "../helpers/integration.js";
import { acquireAdvisoryLock, releaseAdvisoryLock } from "../../src/lib/advisory-lock.js";
import { StateVersionSchema } from "../../src/lib/store/identity.js";

describe("personal writes", () => {
  it("writes the existing inbox transform's exact bytes and returns their new digest", async () => {
    const h = await personalFixture();
    await h.plant("USER-INBOX.md", inboxBytes);
    const reference = personalReference("personal/inbox");
    const next = removeInboxEntry(inboxBytes, "First capture");
    expect(next.removed).toBe(true);
    const result = success(await h.store.write({ action: "put", reference, expected: personalDigest(inboxBytes),
      content: next.content, provenance: personalProvenance }));
    expect(await readFile(h.path("USER-INBOX.md"), "utf8")).toBe(next.content);
    expect(result.version).toBe(personalDigest(next.content));
  });

  it("stores the same session-notes seed the existing workspace producer leaves", async () => {
    const h = await personalFixture();
    const seed = "# Session Notes\r\n\r\n**Working On:** meta-example.md\r\n\r\n";
    await runUserOpen({ cwd: h.root, io: makeUserIO(h.root), identity: "andrew", wuName: "producer",
      internalTemplateDir: "unused", sessionNotesSeed: seed });
    const existing = await readFile(h.path("producer/SESSION-NOTES.md"), "utf8");
    const reference = personalReference("personal/session-context", "example");
    const result = success(await h.store.write({ action: "put", reference, expected: null, content: existing, provenance: personalProvenance }));
    expect(await readFile(h.path("example/SESSION-NOTES.md"), "utf8")).toBe(existing);
    expect(result.version).toBe(personalDigest(existing));
  });

  it("refuses stale digests and succeeds after re-reading and re-applying", async () => {
    const h = await personalFixture();
    await h.plant("USER-INBOX.md", inboxBytes);
    const reference = personalReference("personal/inbox");
    const mutation = { action: "put" as const, reference, expected: personalDigest("stale"), content: "new bytes", provenance: personalProvenance };
    expect(await h.store.write(mutation)).toMatchObject({ status: "refused", refusal: { code: "version-conflict", records: [reference] } });
    expect(await readFile(h.path("USER-INBOX.md"), "utf8")).toBe(inboxBytes);
    const current = success(await h.store.read({ reference }));
    success(await h.store.write({ ...mutation, expected: current.version }));
    expect(await readFile(h.path("USER-INBOX.md"), "utf8")).toBe("new bytes");
  });

  it("serializes racing whole-file writers so exactly one stale generation wins", async () => {
    const h = await personalFixture();
    await h.plant("USER-INBOX.md", inboxBytes);
    const reference = personalReference("personal/inbox");
    const results = await Promise.all(["left", "right"].map((content) => h.store.write({ action: "put", reference,
      expected: personalDigest(inboxBytes), content, provenance: personalProvenance })));
    expect(results.filter((result) => result.status === "ok")).toHaveLength(1);
    expect(results.filter((result) => result.status === "refused")).toEqual([
      expect.objectContaining({ refusal: expect.objectContaining({ code: "version-conflict", records: [reference] }) }),
    ]);
    const current = success(await h.store.read({ reference }));
    expect(["left", "right"]).toContain(current.content);
    success(await h.store.write({ action: "put", reference, expected: current.version, content: "retry", provenance: personalProvenance }));
  });

  it("removes the current file under the actual notes lock", async () => {
    const h = await personalFixture();
    await h.plant("example/SESSION-NOTES.md", "notes");
    const reference = personalReference("personal/session-context", "example");
    const unlink = h.ports.fs.unlink;
    let observedLock = false;
    h.ports.fs.unlink = async (path) => { await access(h.lockPath); observedLock = true; await unlink(path); };
    expect(success(await h.store.write({ action: "remove", reference, expected: personalDigest("notes"), provenance: personalProvenance })).version).toBeUndefined();
    expect(observedLock).toBe(true);
    await expect(readFile(h.path("example/SESSION-NOTES.md"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("refuses an actual held notes lock and writes after the holder releases", async () => {
    const h = await personalFixture();
    const reference = personalReference("personal/inbox");
    const mutation = { action: "put" as const, reference, expected: null, content: inboxBytes, provenance: personalProvenance };
    const held = await acquireAdvisoryLock(h.lockPath);
    try {
      expect(await h.store.write(mutation)).toMatchObject({ status: "refused", refusal: { code: "lock-held", class: "recoverable", lock: h.lockPath } });
    } finally { await releaseAdvisoryLock(held); }
    success(await h.store.write(mutation));
  });

  it("keeps arbitrary content validation with the caller", async () => {
    const h = await personalFixture();
    const reference = personalReference("personal/inbox");
    const invalid = "This is not an inbox accepted by its entry parser\n";
    success(await h.store.write({ action: "put", reference, expected: null, content: invalid, provenance: personalProvenance }));
    expect(success(await h.store.read({ reference })).content).toBe(invalid);
  });

  it("refuses personal history terminally and saved-state reads recoverably", async () => {
    const h = await personalFixture();
    await h.plant("USER-INBOX.md", inboxBytes);
    const reference = personalReference("personal/inbox");
    expect(await h.store.history({ reference })).toMatchObject({ status: "refused", refusal: { code: "unsupported", class: "terminal", case: "personal-history" } });
    expect(await h.store.read({ reference, asOf: StateVersionSchema.parse("saved-state") })).toMatchObject({ status: "refused", refusal: { code: "unsupported", class: "recoverable", case: "uncovered-state-version" } });
  });
});
