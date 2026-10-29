/** Legacy root session notes stay disk-only while workspace notes retain their folding rules. */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { importFixture, saveImportPersonal } from "../helpers/store/import-fixture.js";
import { success } from "../helpers/store/suite-tools.js";
import { createRefStore, RecordReferenceSchema } from "../../src/lib/store/index.js";

const content = "# Session Notes\n\nLegacy continuity belongs in scratch.\n";
const target = RecordReferenceSchema.parse({ kind: "personal/document", owner: { type: "person", name: "andrew" }, key: "scratch/legacy-root/SESSION-NOTES.md" });

describe.each(["default", "separate"] as const)("legacy root session import in %s", layout => {
  it("retains agreeing root copies excluded by real save/load and refuses disagreement until every copy is reconciled", async () => {
    const h = await importFixture(layout);
    const other = join(h.root, "registered-copy");
    await h.git("git", ["worktree", "add", "--detach", other, "HEAD"]);
    for (const root of [h.root, other]) {
      await mkdir(join(root, ".arc/user/andrew"), { recursive: true });
      await writeFile(join(root, ".arc/user/andrew/SESSION-NOTES.md"), content);
      await writeFile(join(root, ".arc/user/andrew/memo.md"), "Saveable personal prose.\n");
      await saveImportPersonal(root);
    }
    expect(await h.migrate(true)).toMatchObject({ status: "ok", result: {
      differingNotes: expect.arrayContaining([{ person: "andrew", path: "SESSION-NOTES.md", kind: "disk-only" }]),
      notices: expect.not.arrayContaining([expect.objectContaining({ condition: expect.stringContaining("Personal file andrew/SESSION-NOTES.md differs") })]),
    } });
    await writeFile(join(other, ".arc/user/andrew/SESSION-NOTES.md"), `${content}\nDifferent copy.\n`);
    expect(await h.migrate(true)).toMatchObject({ status: "ok", result: {
      differingNotes: expect.arrayContaining([{ person: "andrew", path: "SESSION-NOTES.md", kind: "differs" }]),
      notices: expect.arrayContaining([expect.objectContaining({
        condition: expect.stringContaining("Personal file andrew/SESSION-NOTES.md differs"),
        remedy: { text: expect.stringContaining("Reconcile every disk copy") },
      })]),
    } });
    expect(await h.migrate()).toMatchObject({ status: "refused", refusal: { code: "import-refused" } });
    expect((await h.git("git", ["for-each-ref", "--format=%(refname)", "refs/arc/"])).stdout).toBe("");
    await writeFile(join(other, ".arc/user/andrew/SESSION-NOTES.md"), content);
    const landed = await h.migrate();
    expect(landed.status, JSON.stringify(landed)).toBe("ok");
    expect(success(await createRefStore(h.ports).read({ reference: target })).content).toBe(content);
  }, 60_000);

  it("refuses a differing destination, coalesces repaired copies, and preserves the valid scratch session role", async () => {
    const h = await importFixture(layout);
    const root = join(h.root, ".arc/user/andrew");
    await mkdir(join(root, "scratch/legacy-root"), { recursive: true });
    await writeFile(join(root, "SESSION-NOTES.md"), content);
    await writeFile(join(root, "scratch/legacy-root/SESSION-NOTES.md"), "Existing scratch content differs.\n");
    expect(await h.migrate(true)).toMatchObject({ status: "ok", result: {
      refused: expect.arrayContaining([expect.objectContaining({ reference: target, rule: "key" })]),
      notices: expect.arrayContaining([expect.objectContaining({
        condition: expect.stringContaining("differ at the same destination"),
        remedy: { text: expect.stringContaining("reconcile both files") },
      })]),
    } });
    expect(await h.migrate()).toMatchObject({ status: "refused", refusal: { code: "import-refused" } });
    expect((await h.git("git", ["for-each-ref", "--format=%(refname)", "refs/arc/"])).stdout).toBe("");
    await writeFile(join(root, "scratch/legacy-root/SESSION-NOTES.md"), content);
    expect(await h.migrate()).toMatchObject({ status: "ok" });
    const store = createRefStore(h.ports);
    const listed = success(await store.list({ family: "personal", kind: "personal/document" }));
    expect(listed.status).toBe("complete");
    if (listed.status === "complete") expect(listed.records.filter(record => record.reference.key === target.key)).toHaveLength(1);
    expect(success(await store.read({ reference: target })).content).toBe(content);
    const session = RecordReferenceSchema.parse({ kind: "personal/session-context", owner: target.owner, key: "scratch" });
    const sessionContent = "# Session Notes\n\nA valid interim scratch workspace session.\n";
    expect(await store.write({ action: "put", reference: session, expected: null, content: sessionContent,
      provenance: { verb: "save", lifecycleAction: "save" } })).toMatchObject({ status: "ok" });
    expect(success(await store.read({ reference: session })).content).toBe(sessionContent);
    expect(success(await store.read({ reference: target })).content).toBe(content);
  }, 60_000);
});
