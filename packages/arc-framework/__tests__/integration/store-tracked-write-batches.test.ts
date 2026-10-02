/** All-or-nothing tracked writes preserve captured bytes through application and restoration failures. */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { trackedWriteFixture, trackedDigest } from "../helpers/store/tracked-write-fixture.js";
import { ArcError } from "../../src/lib/kernel/errors.js";
import { RecordVersionSchema } from "../../src/lib/store/identity.js";
import { success } from "../helpers/store/suite-tools.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";

const provenance = { verb: "start", lifecycleAction: "start" };
async function setup() {
  const h = await trackedWriteFixture();
  await mkdir(join(h.root, ".arc/active"), { recursive: true });
  const records = ["one", "two", "three"].map((name) => ({ reference: h.reference("work-item/meta", name),
    path: join(h.root, `.arc/active/meta-${name}.md`), content: `old ${name}` }));
  for (const record of records) await writeFile(record.path, record.content);
  const writes = records.map((record) => ({ action: "put" as const, reference: record.reference,
    content: `new ${record.reference.owner.name}`, expected: trackedDigest(record.content), placement: { kind: "active" as const } }));
  return { ...h, records, writes };
}

describe("tracked write batches", () => {
  it("refuses distinct logical references sharing a physical target before applying any write", async () => {
    const h = await setup();
    for (const name of ["example", "part-example"]) {
      await writeFile(join(h.root, `.arc/active/meta-${name}.md`), makeMetaFixture(name));
    }
    const path = join(h.root, ".arc/active/research-part-example.md");
    await writeFile(path, "original companion\n");
    const first = h.reference("work-item/companion", "example", "research-part");
    const second = h.reference("work-item/companion", "part-example", "research");
    const put = (reference: typeof first, content: string) => ({ action: "put" as const, reference,
      content, expected: trackedDigest("original companion\n") });
    expect(await h.store.batch({ writes: [h.writes[0]!, put(first, "first\n"), put(second, "second\n")], provenance }))
      .toMatchObject({ status: "refused", refusal: { code: "ambiguous-match", class: "recoverable",
        candidates: [first, second], condition: expect.stringContaining("research-part-example.md"),
        remedy: { text: expect.stringContaining("one reference") } } });
    expect(await readFile(path, "utf8")).toBe("original companion\n");
    expect(await readFile(h.records[0]!.path, "utf8")).toBe(h.records[0]!.content);
    success(await h.store.batch({ writes: [h.writes[0]!, put(first, "selected\n")], provenance }));
    expect(await readFile(path, "utf8")).toBe("selected\n");
    expect(await readFile(h.records[0]!.path, "utf8")).toBe(h.writes[0]!.content);
  });

  it("names every stale record before applying any valid write", async () => {
    const h = await setup();
    for (const record of h.records.slice(0, 2)) await writeFile(record.path, `changed ${record.reference.owner.name}`);
    expect(await h.store.batch({ writes: h.writes, provenance })).toMatchObject({ status: "refused", refusal: {
      code: "version-conflict", records: h.records.slice(0, 2).map((record) => record.reference),
    } });
    expect(await readFile(h.records[2]!.path, "utf8")).toBe(h.records[2]!.content);
  });

  it("restores a removed record, an already-written record and a failing write that changed bytes before rejecting", async () => {
    const h = await setup();
    const originalWrite = h.ports.fs.writeFile;
    h.ports.fs.writeFile = async (path, content) => {
      await originalWrite(path, content);
      if (path === h.records[2]!.path && content.startsWith("new")) throw new Error("Injected write failure after replacement");
    };
    const writes = [{ action: "remove" as const, reference: h.records[0]!.reference, expected: h.writes[0]!.expected }, ...h.writes.slice(1)];
    await expect(h.store.batch({ writes, provenance })).rejects.toBeInstanceOf(ArcError);
    for (const record of h.records) expect(await readFile(record.path, "utf8")).toBe(record.content);
  });

  it("reports each file left changed with manual git-diff repair when restoring it fails", async () => {
    const h = await setup();
    const originalWrite = h.ports.fs.writeFile;
    h.ports.fs.writeFile = async (path, content) => {
      if (path === h.records[0]!.path && content.startsWith("old")) throw new Error("Injected restore failure");
      if (path === h.records[1]!.path && content.startsWith("new")) throw new Error("Injected write failure");
      await originalWrite(path, content);
    };
    let failure: unknown;
    try { await h.store.batch({ writes: h.writes, provenance }); } catch (error) { failure = error; }
    expect(failure).toBeInstanceOf(ArcError);
    expect(failure).toMatchObject({ code: "store.restore-failed", message: expect.stringContaining(".arc/active/meta-one.md") });
    expect((failure as Error).message).toMatch(/git diff.*restore.*hand/iu);
    expect((failure as Error).message).not.toContain("meta-two.md");
    expect(await readFile(h.records[0]!.path, "utf8")).toBe("new one");
    expect(await readFile(h.records[1]!.path, "utf8")).toBe("old two");
  });

  it("names every changed or unreadable target when separate restorations fail", async () => {
    const h = await setup();
    const write = h.ports.fs.writeFile;
    const read = h.ports.fs.readFile;
    let restoring = false;
    h.ports.fs.writeFile = async (path, bytes) => {
      if (restoring && path === h.records[0]!.path) throw new Error("First restoration failed");
      await write(path, bytes);
      if (path === h.records[2]!.path && bytes.startsWith("new")) { restoring = true; throw new Error("Replacement then failure"); }
    };
    h.ports.fs.readFile = async (path) => {
      if (restoring && path === h.records[1]!.path) throw new Error("Second target is unreadable");
      return read(path);
    };
    let failure: unknown;
    try { await h.store.batch({ writes: h.writes, provenance }); } catch (error) { failure = error; }
    expect(failure).toMatchObject({ code: "store.restore-failed", message: expect.stringContaining("meta-one.md") });
    expect((failure as Error).message).toContain("meta-two.md");
    expect((failure as Error).message).not.toContain("meta-three.md");
    expect((failure as Error).message).toMatch(/git diff.*restore.*hand/iu);
    expect(await readFile(h.records[0]!.path, "utf8")).toBe("new one");
    expect(await readFile(h.records[1]!.path, "utf8")).toBe("new two");
    expect(await readFile(h.records[2]!.path, "utf8")).toBe("old three");
  });

  it("validates every canonical input before checking versions or changing a preceding record", async () => {
    const h = await setup();
    const reference = h.reference("review/candidate");
    const invalid = { action: "put" as const, reference, content: "not JSON", expected: RecordVersionSchema.parse("stale") };
    expect(await h.store.batch({ writes: [...h.writes, invalid], provenance })).toMatchObject({ status: "refused",
      refusal: { code: "record-malformed", reference, rule: expect.stringContaining("JSON") } });
    for (const record of h.records) expect(await readFile(record.path, "utf8")).toBe(record.content);
  });
});
