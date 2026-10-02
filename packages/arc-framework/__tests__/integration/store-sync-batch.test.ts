/** Refuse a complete cross-home mutation before touching any actual substrate. */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { syncFixture, syncInbox, syncErrand, syncPut, syncProvenance, syncNotesRef, syncErrandRef } from "../helpers/store/sync-fixture.js";
import { success } from "../helpers/store/suite-tools.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { OwnerIdentitySchema, recordReferences } from "../../src/lib/store/identity.js";

describe("Store cross-substrate batch", () => {
  it("refuses tracked, personal and identity writes whole, then admits their sequenced retries", async () => {
    const h = await syncFixture();
    await h.a.inbox("Existing personal bytes\n");
    success(await h.a.store.sync());
    success(await h.a.store.write(syncPut()));
    const notesBefore = (await h.a.exec("git", ["rev-parse", syncNotesRef])).stdout;
    const identityBefore = (await h.a.exec("git", ["rev-parse", syncErrandRef])).stdout;
    const indexBefore = (await h.a.exec("git", ["write-tree"])).stdout;
    const personal = success(await h.a.store.read({ reference: syncInbox }));
    const identity = success(await h.a.store.read({ reference: syncErrand }));
    const tracked = recordReferences["work-item/meta"](OwnerIdentitySchema.parse({ type: "work-item", name: "example" }));
    const errand = { action: "put" as const, reference: syncErrand, expected: identity.version,
      content: syncPut("changed identity").content, placement: { kind: "active" as const } };
    const writes = [
      { action: "put" as const, reference: tracked, expected: null, content: makeMetaFixture("example"), placement: { kind: "active" as const } },
      { action: "put" as const, reference: syncInbox, expected: personal.version, content: "Changed personal bytes\n" },
      errand,
    ];
    const result = await h.a.store.batch({ writes, provenance: syncProvenance });
    expect(result).toMatchObject({ status: "refused", refusal: { code: "unsupported", class: "recoverable", case: "cross-substrate-batch" } });
    if (result.status === "refused") expect(result.refusal.remedy.text).toMatch(/split|sequence/iu);
    await expect(readFile(join(h.cloneA, ".arc/active/meta-example.md"))).rejects.toMatchObject({ code: "ENOENT" });
    expect(await readFile(join(h.cloneA, ".arc/user/andrew/USER-INBOX.md"), "utf8")).toBe(personal.content);
    expect((await h.a.exec("git", ["rev-parse", syncNotesRef])).stdout).toBe(notesBefore);
    expect((await h.a.exec("git", ["rev-parse", syncErrandRef])).stdout).toBe(identityBefore);
    expect((await h.a.exec("git", ["write-tree"])).stdout).toBe(indexBefore);
    for (const write of writes) success(await h.a.store.write({ ...write, provenance: syncProvenance }));
    expect(success(await h.a.store.read({ reference: tracked })).content).toBe(makeMetaFixture("example"));
    expect(success(await h.a.store.read({ reference: syncInbox })).content).toBe("Changed personal bytes\n");
    expect(success(await h.a.store.read({ reference: syncErrand })).content).toBe(errand.content);
  });
});
