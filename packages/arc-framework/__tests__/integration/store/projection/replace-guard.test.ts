/** The replace guard over a seeded projection: an edit found at the re-check is taken in before the file is replaced. */
import { readFile, stat as fsStat, utimes, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createReferenceFixture } from "../../../helpers/store/reference-fixture.js";
import { seedProjection } from "../../../helpers/store/projection/seeded-projection.js";
import { removeGitBackedDirs } from "../../../helpers/temp-repo.js";
import type { Store } from "../../../../src/lib/store/contract.js";
import type { RecordVersion } from "../../../../src/lib/store/identity.js";
import { gitBlobId } from "../../../../src/lib/store/projection/blob-id.js";
import { readReference, readStat } from "../../../../src/lib/store/projection/change-detection.js";
import { guardReplacement, type ReplaceGuardInput } from "../../../../src/lib/store/projection/replace-guard.js";
import { parseStampedFile, renderStampedFile } from "../../../../src/lib/store/projection/stamp.js";
import { stageRecordFile } from "../../../../src/lib/store/projection/staging.js";
import type { TakeInPort, TakeInRequest } from "../../../../src/lib/store/projection/take-in-port.js";
import { StoreRefusalSchema } from "../../../../src/lib/store/refusal.js";

const directories: string[] = [];
afterEach(async () => { await removeGitBackedDirs(directories.splice(0)); });

const PATH = ".arc/backlog/planned/one/cohort-one.md";
const WRITER = { pid: process.pid, processInstance: "guard-test", processScope: "pid:[guard-test]" };
const PROVENANCE = { verb: "save", lifecycleAction: "save" } as const;

/** A projected Markdown file, its record's version staged for it, and a guard over both. */
async function projected(content = "# Cohort: one\n\nBody.\n", path = PATH) {
  const fixture = createReferenceFixture();
  const reference = fixture.reference("cohort/document", "one");
  const put = await fixture.store.write({ action: "put", reference, content, expected: null, provenance: PROVENANCE });
  if (put.status !== "ok") throw new Error("the fixture write was refused");
  const seeded = await seedProjection({ store: fixture.store, files: [{ reference, path }] });
  directories.push(seeded.checkout);
  const entry = seeded.index.entries[path];
  if (entry?.kind !== "record") throw new Error("expected the file's record entry");
  const file = join(seeded.checkout, path);
  const stage = async (): Promise<ReplaceGuardInput["staged"]> => {
    const read = await fixture.store.read({ reference });
    if (read.status !== "ok") throw new Error("the fixture read was refused");
    return stageRecordFile({ checkout: seeded.checkout, path, record: read.result, replacing: entry.base.blob, writer: WRITER, format: "sha1" });
  };
  const staged = await stage();
  const guard = async (takeIn: TakeInPort, overrides: Partial<ReplaceGuardInput> = {}) => guardReplacement({
    checkout: seeded.checkout, path, entry, staged, reference: await readReference(seeded.checkout), format: "sha1",
    store: fixture.store, writer: WRITER, takeIn, ...overrides,
  });
  /** Save content to the file under the stamp it was laid with, as an editor would. */
  const save = (body: string) => writeFile(file, renderStampedFile({ content: body, stamp: entry.base.blob }));
  return { fixture, reference, seeded, entry, file, staged, guard, save };
}

/** A take-in that lands what the file holds in the store, as write-back would, answering what it read. */
function landing(store: ReturnType<typeof createReferenceFixture>["store"], expected: () => RecordVersion): TakeInPort {
  return async (request) => {
    const path = join(request.checkout, request.path);
    const text = await readFile(path, "utf8");
    const written = await store.write({
      action: "put", reference: request.entry.reference, content: parseStampedFile(text).content, expected: expected(),
      provenance: PROVENANCE,
    });
    if (written.status !== "ok") throw new Error("the landing write was refused");
    const stat = await readStat(path);
    if (stat === null) throw new Error("the file is gone");
    return { answer: "taken-in", entry: request.entry, read: { stat, blob: gitBlobId(text, "sha1") } };
  };
}

/** A take-in that defers every edit, so a file that reaches it stays in place. */
const deferring: TakeInPort = async (request) => ({ answer: "deferred", entry: request.entry });

describe("the replace guard", () => {
  it("takes in a file edited since its entry, then replaces it with the record's current version", async () => {
    const { fixture, reference, entry, guard, save, seeded, staged } = await projected();
    await save("# Cohort: one\n\nBody, edited.\n");
    const result = await guard(landing(fixture.store, () => entry.base.version));
    expect(await readStat(join(seeded.checkout, staged.location))).toBeNull();
    const current = await fixture.store.read({ reference });
    if (current.status !== "ok") throw new Error("the fixture read was refused");
    expect(current.result.content).toBe("# Cohort: one\n\nBody, edited.\n");
    expect(result).toMatchObject({ kind: "replace", staged: { base: { version: current.result.version } } });
    if (result.kind !== "replace") throw new Error("expected a replacement");
    expect(await readFile(join(seeded.checkout, result.staged.location), "utf8")).toBe(renderStampedFile({
      content: current.result.content, stamp: gitBlobId(current.result.content, "sha1"),
    }));
  });

  it("marks a file still changing after three passes pending, its edit kept in place", async () => {
    const { fixture, reference, entry, guard, save, file } = await projected();
    await save("# Cohort: one\n\nEdit 1.\n");
    let versions = entry.base.version;
    let edits = 1;
    const land = landing(fixture.store, () => versions);
    const result = await guard(async (request) => {
      const landed = await land(request);
      const current = await fixture.store.read({ reference });
      if (current.status !== "ok") throw new Error("the fixture read was refused");
      versions = current.result.version;
      edits += 1;
      await save(`# Cohort: one\n\nEdit ${edits}.\n`);
      return landed;
    });
    expect(result).toMatchObject({ kind: "unreplaced", cause: "unsettled", entry: { pending: true } });
    const stored = await fixture.store.read({ reference });
    expect(stored.status === "ok" && stored.result.content).toBe("# Cohort: one\n\nEdit 3.\n");
    expect(parseStampedFile(await readFile(file, "utf8")).content).toBe("# Cohort: one\n\nEdit 4.\n");
  });

  it("replaces the file write-back just sent, re-checked against what it read, without a take-in", async () => {
    const { guard, save, file } = await projected();
    await save("# Cohort: one\n\nBody, sent.\n");
    const stat = await readStat(file);
    if (stat === null) throw new Error("the file is gone");
    const blob = gitBlobId(await readFile(file), "sha1");
    const result = await guard(deferring, { baseline: { stat, blob } });
    expect(result).toMatchObject({ kind: "replace", moving: blob });
  });

  it("replaces a file whose stat moved but whose content did not, its stat re-recorded", async () => {
    const { guard, file, entry } = await projected();
    const later = new Date(Date.now() + 5_000);
    await utimes(file, later, later);
    const stat = await readStat(file);
    expect(stat?.mtimeNs).not.toBe(entry.stat?.mtimeNs);
    expect(await guard(deferring)).toMatchObject({ kind: "replace", entry: { stat }, moving: entry.written });
  });

  it("leaves a file unreplaced and pending, its edit in place, where the take-in defers, leaves pending, or refuses it", async () => {
    const { guard, save, file } = await projected();
    await save("# Cohort: one\n\nBody, held.\n");
    const held = await readFile(file, "utf8");
    const mark = { reason: "malformed-entry", remedy: { text: "Repair the malformed entry, then save again." } };
    for (const answer of ["deferred", "pending", "clashed"] as const) {
      expect(await guard(async (request) => ({ answer, entry: request.entry })))
        .toMatchObject({ kind: "unreplaced", cause: answer, entry: { pending: true, refused: null } });
    }
    for (const answer of ["refused", "unparseable"] as const) {
      expect(await guard(async (request) => ({ answer, entry: request.entry, mark })))
        .toMatchObject({ kind: "unreplaced", cause: answer, entry: { pending: true, refused: mark } });
    }
    expect(await readFile(file, "utf8")).toBe(held);
  });

  it("replaces a file the take-in finds no edit in, an emptied one among them, its stat re-recorded as its baseline", async () => {
    const { guard, file, entry } = await projected();
    await writeFile(file, "");
    const stat = await readStat(file);
    expect(await guard(async (request) => ({ answer: "no-edit", entry: request.entry })))
      .toMatchObject({ kind: "replace", entry: { stat, pending: false }, moving: entry.written });
  });

  it("leaves a file pending where the store refuses the refresh's read of the record's current version", async () => {
    const { fixture, entry, guard, save } = await projected();
    await save("# Cohort: one\n\nBody, edited.\n");
    let gone = false;
    const refusal = StoreRefusalSchema.parse({
      code: "not-found", class: "recoverable", reference: entry.reference, condition: "The record is no longer stored.",
      remedy: { text: "Run the command again to refresh the projection." },
    });
    const store = new Proxy(fixture.store, {
      get(target, key) {
        const value: unknown = Reflect.get(target, key, target);
        if (key === "read") return (input: Parameters<Store["read"]>[0]) => (gone ? Promise.resolve({ status: "refused", refusal }) : target.read(input));
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    const land = landing(fixture.store, () => entry.base.version);
    const result = await guard(async (request) => { const landed = await land(request); gone = true; return landed; }, { store });
    expect(result).toEqual({ kind: "unreplaced", cause: "refresh-refused", refusal, entry: expect.objectContaining({ pending: true }) });
  });

  it("hands the take-in the base each file carries: a Markdown file's own stamp, a stampless file's entry version", async () => {
    const markdown = await projected();
    const older = gitBlobId("# Cohort: one\n\nAn older body.\n", "sha1");
    await writeFile(markdown.file, renderStampedFile({ content: "# Cohort: one\n\nA stale save.\n", stamp: older }));
    const text = await projected("plain: text\n", ".arc/user/andrew/scratch/two.txt");
    await writeFile(text.file, "plain: edited\n");
    const bases: TakeInRequest["base"][] = [];
    const recording: TakeInPort = async (request) => { bases.push(request.base); return deferring(request); };
    await markdown.guard(recording);
    await text.guard(recording);
    expect(bases).toEqual([{ kind: "stamp", stamp: older }, { kind: "blob", blob: text.entry.base.blob }]);
  });

  it("restages a protected file read-only after taking its edit in", async () => {
    const { fixture, entry, guard, save, seeded } = await projected();
    await save("# Cohort: one\n\nBody, edited.\n");
    const result = await guard(landing(fixture.store, () => entry.base.version), { entry: { ...entry, protected: true } });
    if (result.kind !== "replace") throw new Error("expected a replacement");
    expect((await fsStat(join(seeded.checkout, result.staged.location))).mode & 0o777).toBe(0o444);
  });
});
