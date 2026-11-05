/** Hand edits pass through preparation and the store without taking over the caller's projection state. */
import { mkdir, mkdtemp, readFile, rm, symlink, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createReferenceFixture } from "../../../helpers/store/reference-fixture.js";
import { makeMetaFixture } from "../../../helpers/meta-fixture.js";
import type { KindId } from "../../../../src/lib/store/catalog.js";
import { META_REGISTRATION } from "../../../../src/lib/store/kinds/meta/registration.js";
import { ENTRY_CONFIGS } from "../../../../src/lib/store/kinds/entry-configs.js";
import { ArchiveQuarterSchema, SlugSchema } from "../../../../src/lib/kernel/index.js";
import { gitBlobId } from "../../../../src/lib/store/projection/blob-id.js";
import type { ProjectionIndex, RecordEntry } from "../../../../src/lib/store/projection/index-schema.js";
import { commitProjectionIndex, readProjectionIndex, writeProjectionIndex } from "../../../../src/lib/store/projection/index-file.js";
import { checkChange, PROJECTION_REFERENCE, readReference, readStat, recordCleanStat, writeReference } from "../../../../src/lib/store/projection/change-detection.js";
import type { ProjectionLocation } from "../../../../src/lib/store/projection/location.js";
import { renderStampedFile } from "../../../../src/lib/store/projection/stamp.js";
import { createWriteBackPort, prepareWriteBack } from "../../../../src/lib/store/projection/write-back.js";
import { MutationSchema } from "../../../../src/lib/store/write.js";
import { nameAsideFile } from "../../../../src/lib/store/projection/aside.js";
import { settleAsideCopy } from "../../../../src/lib/store/projection/aside-copies.js";

const writer = { pid: process.pid, processInstance: "write-back-test", processScope: "unit" };

let checkout: string;
let location: ProjectionLocation;
beforeEach(async () => {
  checkout = await mkdtemp(join(tmpdir(), "arc-write-back-"));
  const gitDir = join(checkout, ".git");
  location = { gitDir, commonDir: gitDir, primary: true, stateDir: join(gitDir, "arc-projection") };
  await mkdir(location.stateDir, { recursive: true });
});
afterEach(async () => { vi.restoreAllMocks(); await rm(checkout, { recursive: true, force: true }); });

function indexFor(path: string, entry: RecordEntry): ProjectionIndex {
  return { format: 1, state: null, withheldCopies: [], tripwires: {}, ignoreFiles: null, ignoreGuard: null,
    projectedUnder: { view: { mode: "mine", pins: [] }, identity: SlugSchema.parse("andrew"), claim: null, layoutActive: "nested" },
    entries: { [path]: entry } };
}

async function proseFile(kind: KindId = "personal/document", fixture = createReferenceFixture(), content = "opening\nbase\nclosing\n") {
  const reference = fixture.reference(kind);
  const seeded = await fixture.store.write({ action: "put", reference, content, expected: null,
    ...(kind === "work-item/meta" ? { placement: { kind: "completed" as const, quarter: ArchiveQuarterSchema.parse("2026-q4") } } : {}),
    provenance: { verb: "seed", lifecycleAction: "seed" } });
  if (seeded.status !== "ok" || seeded.result.version === undefined) throw new Error("seed refused");
  const base = { blob: gitBlobId(content, "sha1"), version: seeded.result.version };
  const entry: RecordEntry = {
    kind: "record", reference, stat: null, written: gitBlobId(renderStampedFile({ content, stamp: base.blob }), "sha1"),
    base, markers: null, notices: [], unshown: [], protected: false, changed: false, pending: false, withheld: false,
    refused: null, persisted: null, inProgress: null, copies: [],
  };
  const path = `.arc/${kind.replaceAll("/", "-")}.md`;
  const edit = renderStampedFile({ content: "opening\nedited\nclosing\n", stamp: base.blob });
  await mkdir(dirname(join(checkout, path)), { recursive: true });
  await writeFile(join(checkout, path), edit);
  const request = { checkout, path, copy: null, entry, base: { kind: "stamp" as const, stamp: base.blob } };
  return { fixture, request, edit };
}

describe("sending a projected edit", () => {
  it("lands edited prose once against its base without replacing the file", async () => {
    const { fixture, request, edit } = await proseFile();
    const port = createWriteBackPort({ store: fixture.store, location, format: "sha1", actor: "test-user@fixture-machine" });
    const result = await port(request);
    expect(result.answer).toBe("taken-in");
    const read = await fixture.store.read({ reference: request.entry.reference });
    expect(read.status === "ok" ? read.result.content : read).toBe("opening\nedited\nclosing\n");
    const history = await fixture.store.history({ reference: request.entry.reference });
    expect(history.status === "ok" ? history.result : history).toMatchObject([
      { content: "opening\nedited\nclosing\n", provenance: { verb: "write-back", lifecycleAction: "edit" } },
      { version: request.entry.base.version },
    ]);
    expect(await readFile(join(checkout, request.path), "utf8")).toBe(edit);
    if (result.answer === "taken-in") expect(result.read.blob).toBe(gitBlobId(edit, "sha1"));
  });

  it("keeps a parser-refused edit, lets another file land, and accepts the repaired edit", async () => {
    const { fixture, request: other } = await proseFile();
    const { request } = await proseFile("cohort/document", fixture);
    const broken = renderStampedFile({ content: "**Parent:** invalid parent\n", stamp: request.entry.base.blob });
    await writeFile(join(checkout, request.path), broken);
    const port = createWriteBackPort({ store: fixture.store, location, format: "sha1", actor: "test-user@fixture-machine" });
    const result = await port(request);
    expect(result).toMatchObject({ answer: "unparseable", entry: { refused: { reason: expect.stringContaining("Parent") } } });
    expect(await readFile(join(checkout, request.path), "utf8")).toBe(broken);
    expect(await port(other)).toMatchObject({ answer: "taken-in" });
    const prior = await fixture.store.read({ reference: request.entry.reference });
    expect(prior.status === "ok" ? prior.result.version : prior).toBe(request.entry.base.version);
    await writeFile(join(checkout, request.path), renderStampedFile({ content: "**Parent:** [none]\n", stamp: request.entry.base.blob }));
    expect(await port(request)).toMatchObject({ answer: "taken-in" });
    const read = await fixture.store.read({ reference: request.entry.reference });
    expect(read.status === "ok" ? read.result.content : read).toBe("**Parent:** [none]\n");
  });

  it("carries a primary's current placement without its assigned archive sequence", async () => {
    const fixture = createReferenceFixture(undefined, { "work-item/meta": { parser: META_REGISTRATION.parser ?? null } });
    const content = makeMetaFixture("alpha", { state: "Shipped" });
    const { request } = await proseFile("work-item/meta", fixture, content);
    await writeFile(join(checkout, request.path), renderStampedFile({ content: `${content}\nA hand edit.\n`, stamp: request.entry.base.blob }));
    const context = { store: fixture.store, location, format: "sha1" as const, actor: "test-user@fixture-machine" };
    const prepared = await prepareWriteBack(context, request);
    expect(prepared.kind).toBe("ready");
    if (prepared.kind !== "ready") throw new Error("preparation held");
    expect(prepared.write).toMatchObject({ expected: request.entry.base.version, placement: { kind: "completed", quarter: "2026-q4" } });
    expect(prepared.write.action === "put" ? prepared.write.placement : undefined).not.toHaveProperty("sequence");
    expect(MutationSchema.safeParse(prepared.write.action === "put" ? {
      action: prepared.write.action, reference: prepared.write.reference, content: prepared.write.content,
      expected: prepared.write.expected, placement: prepared.write.placement,
    } : prepared.write).success).toBe(true);
    expect(await createWriteBackPort(context)(request)).toMatchObject({ answer: "taken-in" });
    const read = await fixture.store.read({ reference: request.entry.reference });
    expect(read.status === "ok" ? read.result : read).toMatchObject({
      content: `${content}\nA hand edit.\n`, placement: { kind: "completed", quarter: "2026-q4", sequence: expect.any(String) },
    });
  });

  it("persists only other-copy marks before a send, even if the writer stops after landing", async () => {
    const { fixture, request } = await proseFile();
    const otherName = nameAsideFile({ path: request.path, base: request.entry.base.blob, writer, role: "aside" });
    const takenName = nameAsideFile({ path: request.path, base: request.entry.base.blob, writer, role: "aside" });
    const entry = { ...request.entry, copies: [
      { name: otherName, moving: request.entry.written, linked: null, writeBackSent: false, landed: null, rendering: { markers: null, notices: [] } },
      { name: takenName, moving: request.entry.written, linked: null, writeBackSent: false, landed: null, rendering: { markers: null, notices: [] } },
    ] };
    const index = indexFor(request.path, entry);
    await writeProjectionIndex(location, index);
    await writeReference(checkout);
    const reference = await readReference(checkout);
    await mkdir(dirname(join(checkout, takenName)), { recursive: true });
    await writeFile(join(checkout, takenName), renderStampedFile({ content: "saved aside\n", stamp: entry.base.blob }));
    const write = fixture.store.write.bind(fixture.store);
    vi.spyOn(fixture.store, "write").mockImplementationOnce(async (input) => {
      const result = await write(input);
      if (result.status !== "ok") throw new Error("write did not land");
      throw new Error("stopped after landing");
    });
    const port = createWriteBackPort({ store: fixture.store, location, format: "sha1", actor: "test-user@fixture-machine" });
    await expect(port({ ...request, entry, copy: takenName })).rejects.toThrow("stopped after landing");
    const marked = { ...entry, copies: entry.copies.map(copy => ({ ...copy, writeBackSent: copy.name === otherName })) };
    expect(await readProjectionIndex(location, true)).toEqual({ kind: "index", index: indexFor(request.path, marked) });
    expect(await readReference(checkout)).toBe(reference);
    const read = await fixture.store.read({ reference: entry.reference });
    expect(read.status === "ok" ? read.result.content : read).toBe("saved aside\n");
    expect(await port({ ...request, entry: marked })).toMatchObject({ answer: "taken-in", entry: { copies: [
      { name: otherName, writeBackSent: true }, { name: takenName, writeBackSent: true },
    ] } });
    await writeFile(join(checkout, otherName), renderStampedFile({ content: "retained edit\n", stamp: entry.base.blob }));
    await rm(join(checkout, request.path));
    const copy = marked.copies[0];
    if (copy === undefined) throw new Error("missing other copy");
    expect(await settleAsideCopy({ checkout, path: request.path, entry: marked, copy, format: "sha1", takeIn: port, writer }))
      .toMatchObject({ kind: "moved-on", copy: otherName });
    expect(await readFile(join(checkout, otherName), "utf8")).toContain("retained edit");
    expect(await readStat(join(checkout, request.path))).toBeNull();
  });

  it("still detects a same-tick save after a pre-send mark and a later observed-stat publication", async () => {
    const { fixture, request } = await proseFile();
    const entry = { ...request.entry, copies: [
      { name: nameAsideFile({ path: request.path, base: request.entry.base.blob, writer, role: "aside" }),
        moving: request.entry.written, linked: null, writeBackSent: false, landed: null, rendering: { markers: null, notices: [] } },
    ] };
    const observedPath = join(checkout, "observed.txt");
    const tick = new Date("2026-11-01T12:00:00.000Z");
    await writeFile(observedPath, "before\n");
    await utimes(observedPath, tick, tick);
    const stat = await readStat(observedPath);
    const observed = { ...request.entry, written: gitBlobId("before\n", "sha1"), stat };
    const index = { ...indexFor(request.path, entry), entries: { [request.path]: entry, "observed.txt": observed } };
    await writeProjectionIndex(location, index);
    await writeReference(checkout);
    await utimes(join(checkout, PROJECTION_REFERENCE), tick, tick);
    const clean = await checkChange({ path: observedPath, recorded: stat, written: observed.written,
      reference: await readReference(checkout), format: "sha1" });
    if (clean.status !== "hashed-clean") throw new Error("expected an observed clean hash within the reference tick");
    await writeFile(observedPath, "edited\n");
    await utimes(observedPath, tick, tick);
    expect(await createWriteBackPort({ store: fixture.store, location, format: "sha1", actor: "test-user@fixture-machine" })({ ...request, entry }))
      .toMatchObject({ answer: "taken-in" });
    const disk = await readProjectionIndex(location, true);
    if (disk.kind !== "index") throw new Error("index unavailable");
    const published = await commitProjectionIndex({ location, checkout, index: recordCleanStat(disk.index, "observed.txt", clean.stat) });
    expect(await checkChange({ path: observedPath, recorded: published.entries["observed.txt"]?.stat ?? null,
      written: observed.written, reference: await readReference(checkout), format: "sha1" })).toMatchObject({ status: "changed" });
  });

  it("reports a symbolic link without following it and accepts a regular-file repair", async () => {
    const { fixture, request, edit } = await proseFile();
    const target = join(checkout, "target.md");
    await writeFile(target, "target's private content\n");
    await rm(join(checkout, request.path));
    await symlink(target, join(checkout, request.path));
    const reports: unknown[] = [];
    const port = createWriteBackPort({ store: fixture.store, location, format: "sha1", actor: "test-user@fixture-machine", report: report => reports.push(report) });
    expect(await port(request)).toMatchObject({ answer: "no-edit" });
    expect(reports).toMatchObject([{ path: request.path, mark: { reason: "not-a-file" } }]);
    expect(await readFile(target, "utf8")).toBe("target's private content\n");
    const before = await fixture.store.read({ reference: request.entry.reference });
    expect(before.status === "ok" ? before.result.version : before).toBe(request.entry.base.version);
    await rm(join(checkout, request.path));
    await writeFile(join(checkout, request.path), edit);
    expect(await port(request)).toMatchObject({ answer: "taken-in" });
  });

  it("prepares the write without changing the store, file, index, or reference", async () => {
    const { fixture, request, edit } = await proseFile();
    const index = indexFor(request.path, request.entry);
    await writeProjectionIndex(location, index);
    await writeReference(checkout);
    const state = await fixture.store.version();
    const reference = await readReference(checkout);
    expect(await prepareWriteBack({ store: fixture.store, location, format: "sha1", actor: "test-user@fixture-machine" }, request))
      .toMatchObject({ kind: "ready", write: { expected: request.entry.base.version, content: "opening\nedited\nclosing\n" } });
    expect(await fixture.store.version()).toEqual(state);
    expect(await readFile(join(checkout, request.path), "utf8")).toBe(edit);
    expect(await readProjectionIndex(location, true)).toEqual({ kind: "index", index });
    expect(await readReference(checkout)).toBe(reference);
  });

  it("keeps an Errand description's existing entry IDs through a hand edit", async () => {
    const fixture = createReferenceFixture({ "work-item/description": ENTRY_CONFIGS["work-item/description"] });
    const primary = fixture.reference("work-item/record");
    const seeded = await fixture.store.write({ action: "put", reference: primary, content: fixture.content(primary),
      expected: null, placement: { kind: "active" }, provenance: { verb: "errand-open", lifecycleAction: "create" } });
    if (seeded.status !== "ok") throw new Error("primary seed refused");
    const content = "# Errand\n\n## Description\n\n### [ ] **Fix**\n\n- _Id:_ `12345678`\n\nThe concern.\n";
    const { request } = await proseFile("work-item/description", fixture, content);
    const edited = content.replace("The concern.", "The edited concern.");
    await writeFile(join(checkout, request.path), renderStampedFile({ content: edited, stamp: request.entry.base.blob }));
    expect(await createWriteBackPort({ store: fixture.store, location, format: "sha1", actor: "test-user@fixture-machine" })(request)).toMatchObject({ answer: "taken-in" });
    const read = await fixture.store.read({ reference: request.entry.reference });
    expect(read.status === "ok" ? read.result.content : read).toBe(edited);
  });
});
