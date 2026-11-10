/** Displaced marker origins remain distinct from the current path's notice mapping. */
import { access, link, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createCopyRenderingFixture } from "../../../helpers/store/projection/copy-rendering-fixture.js";
import { commitReturnedCopies } from "../../../../src/lib/store/projection/returned-copies.js";
import { writeBackFile } from "../../../../src/lib/store/projection/read-back.js";

const fixtures: Awaited<ReturnType<typeof createCopyRenderingFixture>>[] = [];
afterEach(async () => { await Promise.all(fixtures.splice(0).map(fixture => fixture.dispose())); });
async function fixture() { const h = await createCopyRenderingFixture(); fixtures.push(h); return h; }

describe("aside-copy rendering provenance", () => {
  it("returns old markers intact and uses their restored mapping to persist the completed resolution", async () => {
    const h = await fixture();
    const content = h.content.replace("stored side", "resolution in progress") + "independent note\n";
    await h.copyText(content);
    const returned = await h.settle();
    expect(returned).toMatchObject({ kind: "returned", held: "refused", entry: {
      markers: h.original.markers, notices: [], unshown: [],
    } });
    expect(await h.file()).toBe(h.text(content));
    await access(join(h.checkout, h.copy.name));
    const published = await commitReturnedCopies({ location: h.location, checkout: h.checkout,
      index: { ...h.index, entries: { ...h.index.entries, [h.path]: returned.entry } }, returned: [{ path: h.path, copy: h.copy.name }] });
    await expect(access(join(h.checkout, h.copy.name))).rejects.toMatchObject({ code: "ENOENT" });
    const entry = published.entries[h.path];
    if (entry?.kind !== "record") throw new Error("published entry missing");
    await h.edit("resolved side\nindependent note\n");
    const sent = await writeBackFile(h.context, published, { ...h.request, entry });
    expect(sent.result.answer).toBe("taken-in");
    expect(await h.store.read({ reference: h.entry.reference })).toMatchObject({ status: "ok", result: {
      content: "resolved side\nindependent note\n", conflicts: [],
    } });
  });

  it("accepts untouched old markers without replacing the current path's notice mapping", async () => {
    const h = await fixture();
    await h.copyText(h.content + "later independent note\n");
    const settled = await h.settle();
    expect(settled).toMatchObject({ kind: "deleted", entry: { markers: null, notices: h.entry.notices, unshown: [] } });
    expect(await h.file()).toBe(h.notice);
    expect(await h.store.read({ reference: h.entry.reference })).toMatchObject({ status: "ok", result: {
      content: "stored side\nlater independent note\n", conflicts: h.record.conflicts,
    } });
    await expect(access(join(h.checkout, h.copy.name))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("keeps both mappings when a racing save wins the put-back link", async () => {
    const h = await fixture();
    const content = h.content.replace("stored side", "resolution in progress") + "independent note\n";
    await h.copyText(content);
    const settled = await h.settle({ fs: { link: async (from, path) => {
      await writeFile(path, "racing save\n");
      await link(from, path);
    } } });
    expect(settled).toMatchObject({ kind: "held-aside", entry: { markers: null, notices: h.entry.notices } });
    const original = settled.entry.copies.find(copy => copy.name === h.copy.name);
    const replacement = settled.entry.copies.find(copy => copy.name !== h.copy.name);
    expect(original?.rendering).toEqual({ markers: h.original.markers, notices: h.original.notices });
    expect(replacement?.rendering).toEqual({ markers: null, notices: h.entry.notices });
    expect(await h.copyFile()).toBe(h.text(content));
    if (replacement === undefined) throw new Error("replacement copy missing");
    expect(await readFile(join(h.checkout, replacement.name), "utf8")).toBe(h.notice);
    expect(await h.file()).toBe("racing save\n");
  });
});
