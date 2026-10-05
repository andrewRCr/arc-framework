/** Flat-layout companion admission agrees with discovery and saved changes. */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { trackedWriteFixture } from "../helpers/store/tracked-write-fixture.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { success } from "../helpers/store/suite-tools.js";
import { StateVersionSchema } from "../../src/lib/store/identity.js";

const provenance = { verb: "test", lifecycleAction: "update" };
async function fixture() {
  const h = await trackedWriteFixture();
  await mkdir(join(h.root, ".arc/active"), { recursive: true });
  for (const name of ["example", "part-example"]) await writeFile(join(h.root, `.arc/active/meta-${name}.md`), makeMetaFixture(name, { branch: "main" }));
  const commit = async (message: string) => {
    await h.exec("git", ["add", ".arc"]);
    await h.exec("git", ["commit", "-m", message]);
    return StateVersionSchema.parse((await h.exec("git", ["rev-parse", "HEAD"])).stdout.trim());
  };
  return { ...h, commit };
}
describe("companion naming admission", () => {
  it("discovers every supported written companion in reads, lists and unrestricted changes", async () => {
    const h = await fixture();
    const from = await h.commit("primaries");
    const keys = ["research", "summary", "spec-prd", "spec-rfc"];
    for (const key of keys) {
      const reference = h.reference("work-item/companion", "example", key);
      success(await h.store.write({ action: "put", reference, expected: null, content: `${key}\n`, provenance }));
      expect(success(await h.store.read({ reference })).content).toBe(`${key}\n`);
    }
    await writeFile(join(h.root, ".arc/active/research-part-example.md"), "foreign companion\n");
    const to = await h.commit("companions");
    const listing = success(await h.store.list({ family: "work-item", kind: "work-item/companion", owner: h.reference("work-item/meta").owner }));
    expect(listing).toMatchObject({ status: "complete", diagnostics: [], missed: false });
    if (listing.status !== "complete") throw new Error("Expected complete companion inventory");
    expect(listing.records.map((record) => record.reference.key).sort()).toEqual(keys.sort());
    const changed = success(await h.store.changes({ from, to }));
    expect(changed.filter((entry) => entry.reference.owner.name === "example").map((entry) => entry.reference.key).sort()).toEqual(keys.sort());
    const foreign = h.reference("work-item/companion", "part-example", "research");
    expect(success(await h.store.read({ reference: foreign })).content).toBe("foreign companion\n");
  });
  it.each(["research-part", "research2"])("refuses the unserved key %s without mutating a batch and accepts a corrected retry", async (key) => {
    const h = await fixture();
    const from = await h.commit("primaries");
    const primary = h.reference("work-item/meta");
    const before = success(await h.store.read({ reference: primary }));
    const reference = h.reference("work-item/companion", "example", key);
    const put = { action: "put" as const, reference, expected: null, content: "unserved\n" };
    const refused = { status: "refused", refusal: { code: "unsupported", case: "unhomed-kind", remedy: { text: expect.stringContaining("retry") } } };
    expect(await h.store.write({ ...put, provenance })).toMatchObject(refused);
    expect(await h.store.read({ reference })).toMatchObject(refused);
    expect(await h.store.changes({ from, to: from, references: [reference] })).toMatchObject(refused);
    expect(await h.store.batch({ writes: [{ action: "put", reference: primary, expected: before.version, content: before.content + "\nchanged", placement: { kind: "active" } }, put], provenance })).toMatchObject(refused);
    expect(success(await h.store.read({ reference: primary }))).toEqual(before);
    await expect(readFile(join(h.root, `.arc/active/${key}-example.md`))).rejects.toMatchObject({ code: "ENOENT" });
    const corrected = { ...put, reference: h.reference("work-item/companion", "example", "research") };
    success(await h.store.write({ ...corrected, provenance }));
    expect(success(await h.store.read({ reference: corrected.reference })).content).toBe(put.content);
  });
});
