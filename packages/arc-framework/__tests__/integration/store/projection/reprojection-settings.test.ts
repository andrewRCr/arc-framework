/** Commands reproject fresh settings while preserving files outside the current identity's authority. */
import { access, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { createAdoptionFixture } from "../../../helpers/store/projection/adoption-fixture.js";
import { removeGitBackedDirs } from "../../../helpers/temp-repo.js";
import { seed, success } from "../../../helpers/store/suite-tools.js";
import { OwnerIdentitySchema, recordReferences } from "../../../../src/lib/store/identity.js";
import { startProjection, endProjection } from "../../../../src/lib/store/projection/engine.js";
import { readProjectionIndex } from "../../../../src/lib/store/projection/index-file.js";
import { projectionSelectionResult } from "../../../../src/lib/store/projection/selection.js";
import { renderStampedFile } from "../../../../src/lib/store/projection/stamp.js";

const directories: string[] = [];
afterEach(async () => { await removeGitBackedDirs(directories.splice(0)); });

it("preserves the previous identity's personal files and entries, then walks them when the identity returns", async () => {
  const h = await createAdoptionFixture({ placement: { kind: "active" }, ownLayout: "nested" }); directories.push(h.f.root);
  const andrew = await seed(h.f, recordReferences["personal/working-memory"](OwnerIdentitySchema.parse({ type: "person", name: "andrew" })), "Andrew's notes.\n");
  h.f.identity("bob");
  const bob = await seed(h.f, recordReferences["personal/working-memory"](OwnerIdentitySchema.parse({ type: "person", name: "bob" })), "Bob's notes.\n");
  h.f.identity("andrew");
  await rm(join(h.projected.location.stateDir, "index"));
  const command = { store: h.f.store, checkout: h.f.root };
  expect(await startProjection(command)).toMatchObject({ kind: "ready" }); await endProjection(command);
  const disk = async () => {
    const read = await readProjectionIndex(h.projected.location, true, { groups: "all" });
    if (read.kind !== "index") throw new Error("Missing settings index");
    return read.index;
  };
  const andrewPath = ".arc/user/andrew/WORKING-MEMORY.md", bobPath = ".arc/user/bob/WORKING-MEMORY.md";
  const entry = (await disk()).entries[andrewPath];
  if (entry?.kind !== "record") throw new Error("Missing personal entry");
  const edited = renderStampedFile({ content: "Andrew's unsaved edit.\n", stamp: entry.base.blob });
  await writeFile(join(h.f.root, andrewPath), edited);
  await h.f.ports.exec("git", ["config", "arc.identity", "bob"], { cwd: h.f.root }); h.f.identity("bob");
  expect(await startProjection(command)).toMatchObject({ kind: "ready" });
  expect(await readFile(join(h.f.root, bobPath), "utf8")).toContain(bob.content);
  expect(await readFile(join(h.f.root, andrewPath), "utf8")).toBe(edited);
  expect((await disk()).entries[andrewPath]).toEqual(entry);
  expect(await projectionSelectionResult(h.f.store, h.f.root)).toMatchObject({ status: "ok", result: { paths: [bobPath] } });
  await endProjection(command);
  await h.f.ports.exec("git", ["config", "arc.identity", "andrew"], { cwd: h.f.root }); h.f.identity("andrew");
  expect(success(await h.f.store.read({ reference: andrew.reference })).content).toBe(andrew.content);
  expect(await startProjection(command)).toMatchObject({ kind: "ready" });
  expect(success(await h.f.store.read({ reference: andrew.reference })).content).toBe("Andrew's unsaved edit.\n");
  const selection = await projectionSelectionResult(h.f.store, h.f.root);
  if (selection.status !== "ok") throw new Error(selection.refusal.condition);
  expect(selection.result.paths).toContain(andrewPath); expect(selection.result.paths).not.toContain(bobPath);
  await endProjection(command);
});

it("moves current files to the flat layout and keeps the claim's scratch folder", async () => {
  const h = await createAdoptionFixture({ placement: { kind: "active" }, ownLayout: "nested" }); directories.push(h.f.root);
  const command = { store: h.f.store, checkout: h.f.root };
  expect(await startProjection(command)).toMatchObject({ kind: "ready" }); await endProjection(command);
  const version = success(await h.f.store.version());
  await writeFile(join(h.f.root, ".arc/system/arc-config.yml"), "layout.active: flat\n");
  expect(await startProjection(command)).toMatchObject({ kind: "ready" });
  expect(await readFile(join(h.f.root, ".arc/active/meta-alpha.md"), "utf8")).toContain(h.primary.content);
  await expect(access(join(h.f.root, ".arc/active/current/meta-alpha.md"))).rejects.toMatchObject({ code: "ENOENT" });
  await expect(access(join(h.f.root, ".arc/user/andrew/scratch/work-unit/alpha"))).resolves.toBeUndefined();
  const disk = await readProjectionIndex(h.projected.location, true, { groups: "all" });
  if (disk.kind !== "index") throw new Error("Missing flat-layout index");
  expect(disk.index.projectedUnder).toMatchObject({ claim: "alpha", layoutActive: "flat" });
  expect(disk.index.entries[".arc/active/meta-alpha.md"]).toMatchObject({ reference: h.primary.reference });
  expect(success(await h.f.store.version())).toBe(version);
  await endProjection(command);
});
