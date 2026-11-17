/** Composite status reads projection metadata through the registered CLI and reference store. */
import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import type { Store } from "../../../../src/lib/store/contract.js";

const binding = vi.hoisted(() => ({ store: null as Store | null }));
vi.mock("../../../../src/lib/store/create.js", async importOriginal => {
  const original = await importOriginal<typeof import("../../../../src/lib/store/create.js")>();
  return { ...original, createStore: (...args: Parameters<typeof original.createStore>) => binding.store ?? original.createStore(...args) };
});

import { dispatchRegisteredCli } from "../../../helpers/registered-cli.js";
import { openArchivedProjectionFile } from "../../../helpers/store/projection/open-file.js";
import { createAdoptionFixture } from "../../../helpers/store/projection/adoption-fixture.js";
import { createRefusingStore } from "../../../helpers/store/projection/refusing-store.js";
import { ArchiveQuarterSchema } from "../../../../src/lib/kernel/index.js";
import { createEngineFixture } from "../../../helpers/store/projection/engine-fixture.js";
import { removeGitBackedDirs } from "../../../helpers/temp-repo.js";
import { TASK_RULE_CONTENT } from "../../../helpers/store/task-rule-input.js";
import { createKindRegistry } from "../../../../src/lib/store/registry.js";
import { PRODUCTION_REGISTRATIONS } from "../../../../src/lib/store/kinds/registrations.js";
import { writeProjectionIndex } from "../../../../src/lib/store/projection/index-file.js";
import { startProjection, endProjection } from "../../../../src/lib/store/projection/engine.js";
import { renderStampedFile } from "../../../../src/lib/store/projection/stamp.js";
import type { StatusResult } from "../../../../src/commands/status/types.js";

const directories: string[] = [];
afterEach(async () => { binding.store = null; await removeGitBackedDirs(directories.splice(0)); });

async function status(h: { store: Store; checkout: string }): Promise<StatusResult> {
  return JSON.parse(await statusText(h, true)) as StatusResult;
}

async function statusText(h: { store: Store; checkout: string }, json: boolean): Promise<string> {
  const cwd = process.cwd(), exit = process.exitCode;
  let output = "";
  const stdout = vi.spyOn(process.stdout, "write").mockImplementation(chunk => { output += String(chunk); return true; });
  const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  try {
    binding.store = h.store;
    process.chdir(h.checkout); process.exitCode = undefined;
    await dispatchRegisteredCli(["status", ...(json ? ["--json"] : [])]);
    expect(process.exitCode).toBeUndefined();
    return output;
  } finally { stdout.mockRestore(); stderr.mockRestore(); process.chdir(cwd); process.exitCode = exit; }
}

it("shows a refused edit and a withheld file, then removes the refusal after a repaired save", async () => {
  const withheld = ".arc/user/andrew/scratch/withheld.md";
  const h = await createEngineFixture(directories, { kind: "work-item/task-list", path: ".arc/active/current/tasks-work-item-one.md",
    content: TASK_RULE_CONTENT, extraPaths: [withheld],
    registryOverrides: { "work-item/task-list": createKindRegistry(PRODUCTION_REGISTRATIONS)["work-item/task-list"] } });
  const entry = h.index.entries[withheld];
  if (entry?.kind !== "record") throw new Error("Missing withheld file");
  await writeProjectionIndex(h.location, { ...h.index, entries: { ...h.index.entries, [withheld]: { ...entry, withheld: true } } });
  await h.edit(TASK_RULE_CONTENT.replace("`[ ]`", "`[x]`") + "\nIndependent note.\n");
  const first = await status(h);
  expect(first.projection).toMatchObject({ ok: true, value: { kind: "ready", files: expect.arrayContaining([
    expect.objectContaining({ path: h.path, refused: expect.objectContaining({ reason: expect.stringContaining("task-list.close") }) }),
    expect.objectContaining({ path: withheld, withheld: true }),
  ]) } });
  expect((await h.stored()).content).toBe(TASK_RULE_CONTENT);
  await h.edit(TASK_RULE_CONTENT + "\nIndependent note.\n");
  const repaired = await status(h);
  if (!repaired.projection.ok || repaired.projection.value.kind !== "ready") throw new Error("Missing projection status");
  expect(repaired.projection.value.files.some(file => file.path === h.path)).toBe(false);
  expect(repaired.projection.value.files).toContainEqual(expect.objectContaining({ path: withheld, withheld: true }));
  expect((await h.stored()).content).toContain("Independent note.");
});

it("shows an aside copy kept after its path moved on and removes it once deleted", async () => {
  const h = await createEngineFixture(directories);
  const native = h.ports();
  await h.edit("first edit\n");
  await startProjection({ store: h.store, checkout: h.checkout, ports: () => ({ ...native,
    writer: async () => ({ ...await native.writer(), processInstance: "previous-command" }) }) });
  const entry = (await h.disk()).entries[h.path];
  if (entry?.kind !== "record" || entry.copies[0] === undefined) throw new Error("Missing displaced copy");
  const copy = entry.copies[0].name;
  await writeFile(join(h.checkout, copy), renderStampedFile({ content: "late aside edit\n", stamp: h.entry.base.blob }));
  await h.edit("newer path edit\n");
  expect((await status(h)).projection).toMatchObject({ ok: true, value: { kind: "ready",
    copies: expect.arrayContaining([expect.objectContaining({ path: h.path, copy })]) } });
  expect(await readFile(join(h.checkout, copy), "utf8")).toContain("late aside edit");
  await rm(join(h.checkout, copy));
  const after = await status(h);
  if (!after.projection.ok || after.projection.value.kind !== "ready") throw new Error("Missing projection status");
  expect(after.projection.value.copies.some(held => held.copy === copy)).toBe(false);
});

it("lists an opened archived file in JSON and human status", async () => {
  const h = await createEngineFixture(directories, { kind: "work-item/notes",
    path: ".arc/completed/2026-q4/01_work-item-one/notes-work-item-one.md",
    placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") } });
  await openArchivedProjectionFile(h, h.path);
  expect((await status(h)).projection).toMatchObject({ ok: true, value: { kind: "ready", files: [
    { path: h.path, opened: true, pending: false, refused: null },
  ] } });
  expect(await statusText(h, false)).toContain(`${h.path}: opened`);
});

it("shows an opened new path with its adoption refusal and drops the refusal after repair", async () => {
  const h = await createAdoptionFixture({ placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") } });
  directories.push(h.f.root);
  const path = `${h.folder}/correction.md`, input = { store: h.f.store, checkout: h.f.root };
  await writeFile(join(h.f.root, path), "An authored archive correction.\n");
  await openArchivedProjectionFile(input, path);
  expect((await status(input)).projection).toMatchObject({ ok: true, value: { files: expect.arrayContaining([
    expect.objectContaining({ path, opened: true, ownerless: true, refused: null }),
  ]) } });
  const blocked = createRefusingStore(h.f.store);
  const mark = { code: "lock-held" as const, class: "recoverable" as const, lock: "archive",
    condition: "The archive writer is held.", remedy: { text: "Release the archive writer, then retry arc save." } };
  blocked.refuse("batch", mark);
  const selected = { ...input, store: blocked.store };
  await startProjection({ ...selected, mode: "save" }); await endProjection(selected);
  expect((await status(selected)).projection).toMatchObject({ ok: true, value: { files: expect.arrayContaining([
    expect.objectContaining({ path, opened: true, ownerless: true,
      refused: expect.objectContaining({ reason: expect.stringContaining(mark.condition), remedy: mark.remedy }) }),
  ]) } });
  const human = await statusText(selected, false);
  expect(human.replace(/[│\n]/gu, " ").replace(/\s+/gu, " ")).toContain(`${path}: ownerless, opened, refused`);
  expect(human).toContain(mark.remedy.text);
  await startProjection({ ...input, mode: "save" }); await endProjection(input);
  expect((await status(input)).projection).toMatchObject({ ok: true, value: { files: expect.arrayContaining([
    expect.objectContaining({ path, opened: true, ownerless: false, refused: null }),
  ]) } });
});
