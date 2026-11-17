/** Ordinary commands take in only explicitly opened archive files and retain correction intent. */
import { chmod, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { createAdoptionFixture } from "../../../helpers/store/projection/adoption-fixture.js";
import { openArchivedProjectionFile } from "../../../helpers/store/projection/open-file.js";
import { lackingEndedHistory } from "../../../helpers/store/ended-history.js";
import { overrideEngineStore } from "../../../helpers/store/projection/engine-fixture.js";
import { removeGitBackedDirs } from "../../../helpers/temp-repo.js";
import { success } from "../../../helpers/store/suite-tools.js";
import { ArchiveQuarterSchema } from "../../../../src/lib/kernel/index.js";
import { recordReferences } from "../../../../src/lib/store/identity.js";
import { startProjection, endProjection } from "../../../../src/lib/store/projection/engine.js";
import type { ProjectionCommandInput } from "../../../../src/lib/store/projection/engine.js";
import { readProjectionIndex } from "../../../../src/lib/store/projection/index-file.js";
import { parseStampedFile, renderStampedFile } from "../../../../src/lib/store/projection/stamp.js";
import { createProjectionReporter } from "../../../../src/lib/store/projection/report.js";

const directories: string[] = [];
afterEach(async () => { await removeGitBackedDirs(directories.splice(0)); });
async function archive() {
  const h = await createAdoptionFixture({ placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") } });
  directories.push(h.f.root);
  const path = Object.keys(h.projected.index.entries)[0]!;
  return { ...h, path, input: { store: h.f.store, checkout: h.f.root }, absolute: join(h.f.root, path) };
}
async function command(input: ProjectionCommandInput): Promise<string> {
  expect(await startProjection(input)).toMatchObject({ kind: "ready" });
  await endProjection(input);
  let output = "";
  createProjectionReporter(input.store, text => { output += text; })();
  return output;
}
async function edit(absolute: string, content: string): Promise<void> {
  const stamp = parseStampedFile(await readFile(absolute, "utf8")).stamp;
  if (stamp === null) throw new Error("No archive stamp");
  await writeFile(absolute, renderStampedFile({ content, stamp }));
}

it("takes in edits across two ordinary commands while retaining opened and writable state", async () => {
  const h = await archive();
  await openArchivedProjectionFile(h.input, h.path);
  for (const note of ["First correction.", "Second correction."]) {
    const content = `${success(await h.f.store.read({ reference: h.primary.reference })).content}\n${note}\n`;
    await edit(h.absolute, content);
    expect(await command(h.input)).toBe("");
    expect(success(await h.f.store.read({ reference: h.primary.reference })).content).toBe(content);
    expect((await stat(h.absolute)).mode & 0o200).not.toBe(0);
    expect(await readProjectionIndex(h.projected.location, true, { groups: "all" })).toMatchObject({ kind: "index", index: {
      entries: { [h.path]: { opened: true, refused: null } },
    } });
  }
});

it("adopts an opened new archive file at an ordinary command and leaves it open and writable", async () => {
  const h = await archive(), path = `${h.folder}/correction.md`, bytes = "An archived attachment.\n";
  await writeFile(join(h.f.root, path), bytes);
  await openArchivedProjectionFile(h.input, path);
  expect(await command(h.input)).toBe("");
  const reference = recordReferences["work-item/companion"](h.primary.reference.owner, "correction.md");
  expect(success(await h.f.store.read({ reference })).content).toBe(bytes);
  expect((await stat(join(h.f.root, path))).mode & 0o200).not.toBe(0);
  expect(await readProjectionIndex(h.projected.location, true, { groups: "all" })).toMatchObject({ kind: "index", index: {
    entries: { [path]: { kind: "record", opened: true, refused: null } },
  } });
});

it("keeps a missing-history edit open without pulling and lands it at explicit save", async () => {
  const h = await archive();
  await openArchivedProjectionFile(h.input, h.path);
  const content = h.primary.content + "\nCorrection awaiting history.\n";
  await edit(h.absolute, content);
  const missing = lackingEndedHistory(h.f.store, h.primary.reference.owner);
  let pulls = 0;
  const store = overrideEngineStore(missing, { pull: input => { pulls++; return missing.pull(input); } });
  const report = await command({ ...h.input, store });
  expect(report).toContain(h.path);
  expect(report).toContain("arc save");
  expect(pulls).toBe(0);
  expect(success(await h.f.store.read({ reference: h.primary.reference })).content).toBe(h.primary.content);
  expect((await stat(h.absolute)).mode & 0o200).not.toBe(0);
  expect(await command({ ...h.input, store, mode: "save" })).toBe("");
  expect(success(await h.f.store.read({ reference: h.primary.reference })).content).toBe(content);
  expect(pulls).toBe(1);
});

it("drops an absent opened new path and names how to reopen it if it returns", async () => {
  const h = await archive(), path = `${h.folder}/correction.md`;
  await writeFile(join(h.f.root, path), "Temporary correction.\n");
  await openArchivedProjectionFile(h.input, path);
  await rm(join(h.f.root, path));
  const report = await command(h.input);
  expect(report).toContain(path);
  expect(report).toContain(`arc edit ${path}`);
  const disk = await readProjectionIndex(h.projected.location, true, { groups: "all" });
  if (disk.kind !== "index") throw new Error("Missing archive index");
  expect(disk.index.entries[path]).toBeUndefined();
  await writeFile(join(h.f.root, path), "Returned correction.\n");
  await openArchivedProjectionFile(h.input, path);
  await command(h.input);
  expect(success(await h.f.store.read({ reference: recordReferences["work-item/companion"](h.primary.reference.owner, "correction.md") })).content)
    .toBe("Returned correction.\n");
});

it("leaves an unopened forced archive edit unchecked and unsent at an ordinary command", async () => {
  const h = await archive();
  await chmod(h.absolute, 0o644);
  await edit(h.absolute, h.primary.content + "\nForced correction.\n");
  const before = await readFile(h.absolute);
  const store = overrideEngineStore(h.f.store, { batch: async () => { throw new Error("An unopened archive must not be submitted"); } });
  expect(await command({ ...h.input, store })).toBe("");
  expect(await readFile(h.absolute)).toEqual(before);
  expect(success(await h.f.store.read({ reference: h.primary.reference })).content).toBe(h.primary.content);
});
