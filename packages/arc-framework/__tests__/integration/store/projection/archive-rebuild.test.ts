/** Forced edits and lost-index rebuilds preserve archive corrections and their repair route. */
import { chmod, lstat, readFile, rm, utimes, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { Command } from "commander";
import { createAdoptionFixture } from "../../../helpers/store/projection/adoption-fixture.js";
import { openArchivedProjectionFile } from "../../../helpers/store/projection/open-file.js";
import { createRefusingStore } from "../../../helpers/store/projection/refusing-store.js";
import { removeGitBackedDirs } from "../../../helpers/temp-repo.js";
import { seed, success, update } from "../../../helpers/store/suite-tools.js";
import { ArchiveQuarterSchema } from "../../../../src/lib/kernel/index.js";
import { startProjection, endProjection } from "../../../../src/lib/store/projection/engine.js";
import { projectionProcessState } from "../../../../src/lib/store/projection/process-state.js";
import { readProjectionIndex } from "../../../../src/lib/store/projection/index-file.js";
import { renderStampedFile } from "../../../../src/lib/store/projection/stamp.js";
import { registerProjectionHooks } from "../../../../src/lib/store/projection/command-hooks.js";
import { handleSave } from "../../../../src/handlers/save.js";
import { recordReferences } from "../../../../src/lib/store/identity.js";
const directories: string[] = [];
afterEach(async () => { await removeGitBackedDirs(directories.splice(0)); });
async function fixture(owner = "andrew") {
  const h = await createAdoptionFixture({ owner, placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") } });
  directories.push(h.f.root);
  const path = Object.keys(h.projected.index.entries)[0]!;
  return { ...h, path, store: h.f.store, checkout: h.f.root };
}
async function entry(h: Awaited<ReturnType<typeof fixture>>) {
  const disk = await readProjectionIndex(h.projected.location, true, { groups: "all" });
  if (disk.kind !== "index") throw new Error("Missing archive index");
  return disk.index.entries[h.path];
}
async function save(h: Awaited<ReturnType<typeof fixture>>) {
  const program = new Command("arc").exitOverride(), exit = process.exitCode;
  const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  program.command("save").option("--json").action(async options => { await handleSave(options, h.store); });
  registerProjectionHooks(program, { input: () => ({ store: h.store, checkout: h.checkout }), writeError: () => undefined });
  try { await program.parseAsync(["save", "--json"], { from: "user" }); }
  finally { stdout.mockRestore(); process.exitCode = exit; }
}
it.each(["andrew", "bob"])("takes in or refuses a forced archive edit at refresh under owner %s", async owner => {
  const h = await fixture(owner), file = join(h.checkout, h.path), original = await entry(h);
  if (original?.kind !== "record") throw new Error("Missing archive record");
  const local = renderStampedFile({ content: h.primary.content + "\nA forced correction.\n", stamp: original.base.blob });
  await chmod(file, 0o644); await writeFile(file, local);
  const remote = h.primary.content.replace("- **Next Action:** —", "- **Next Action:** A stored change.");
  success(await h.store.write(update(h.f, h.primary, remote)));
  await startProjection(h); await endProjection(h);
  const current = success(await h.store.read({ reference: h.primary.reference }));
  if (owner === "andrew") {
    expect(current.content).toContain("A forced correction.");
    expect(current.content).toContain("A stored change.");
    expect((await lstat(file)).mode & 0o222).toBe(0);
  } else {
    expect(current.content).toBe(remote);
    expect(await readFile(file, "utf8")).toBe(local);
    expect(projectionProcessState().diagnostics.some(each => each.path === h.path && /bob/u.test(each.mark.remedy.text))).toBe(true);
  }
});
it.each([true, false])("rebuilds a lost opened index with whole evidence=%s and preserves the edit's opening remedy", async whole => {
  const h = await fixture(), file = join(h.checkout, h.path), original = await entry(h);
  if (original?.kind !== "record") throw new Error("Missing archive record");
  await openArchivedProjectionFile(h, h.path);
  const content = h.primary.content + "\nCorrection across lost index.\n";
  const bytes = renderStampedFile({ content, stamp: original.base.blob });
  await writeFile(file, bytes);
  await rm(join(h.projected.location.stateDir, "index"));
  const fault = createRefusingStore(h.store);
  if (!whole) fault.refuse("list", { code: "namespace-corrupt", class: "terminal", namespace: "archive",
    condition: "Archive inventory cannot be read.", remedy: { text: "Restore the archive inventory." } });
  await startProjection({ ...h, store: fault.store }); await endProjection({ ...h, store: fault.store });
  expect(await entry(h)).toMatchObject({ withheld: true, refused: { remedy: { text: expect.stringContaining(`arc edit ${h.path}`) } } });
  expect(await readFile(file, "utf8")).toBe(bytes);
  expect(await entry(h)).not.toHaveProperty("opened");
  if (!whole) {
    fault.refuse("list", null);
    await startProjection(h); await endProjection(h);
    expect(await entry(h)).toMatchObject({ kind: "record", withheld: true, refused: { remedy: { text: expect.stringContaining(`arc edit ${h.path}`) } } });
  }
  await rm(file);
  await startProjection(h); await endProjection(h);
  await openArchivedProjectionFile(h, h.path);
  const rebuilt = await entry(h);
  if (rebuilt?.kind !== "record") throw new Error("Missing restored record");
  await writeFile(file, renderStampedFile({ content, stamp: rebuilt.base.blob }));
  await save(h);
  expect(success(await h.store.read({ reference: h.primary.reference })).content).toBe(content);
  expect(await entry(h)).not.toHaveProperty("opened");
  expect((await lstat(file)).mode & 0o222).toBe(0);
});
it("rebuilds an unedited opened archive file closed and read-only after its index is lost", async () => {
  const h = await fixture();
  await openArchivedProjectionFile(h, h.path);
  await rm(join(h.projected.location.stateDir, "index"));
  await startProjection(h); await endProjection(h);
  expect(await entry(h)).toMatchObject({ kind: "record", withheld: false });
  expect(await entry(h)).not.toHaveProperty("opened");
  expect((await lstat(join(h.checkout, h.path))).mode & 0o222).toBe(0);
});

it("rebuilds an unchanged empty archive text companion closed after index loss", async () => {
  const h = await fixture(), path = `${h.folder}/empty.txt`, file = join(h.checkout, path);
  const reference = recordReferences["work-item/companion"](h.primary.reference.owner, "empty.txt");
  const stored = await seed(h.f, reference, "");
  await startProjection(h); await endProjection(h);
  await utimes(file, new Date(0), new Date(0));
  await openArchivedProjectionFile(h, path);
  await rm(join(h.projected.location.stateDir, "index"));
  await startProjection(h); await endProjection(h);
  const rebuilt = await entry({ ...h, path });
  expect(rebuilt).toMatchObject({ withheld: false });
  expect(rebuilt).not.toHaveProperty("opened");
  expect((await lstat(file)).mode & 0o222).toBe(0);
  expect(await readFile(file, "utf8")).toBe("");
  expect(success(await h.store.read({ reference }))).toMatchObject({ content: "", version: stored.version });
});
