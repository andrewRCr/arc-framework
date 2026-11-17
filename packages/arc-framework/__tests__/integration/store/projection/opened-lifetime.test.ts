/** Opened state follows an archived record through adoption and path changes. */
import { stat, writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { createAdoptionFixture } from "../../../helpers/store/projection/adoption-fixture.js";
import { seed, success, update, fixtureRenameProvenance } from "../../../helpers/store/suite-tools.js";
import { removeGitBackedDirs } from "../../../helpers/temp-repo.js";
import { ArchiveQuarterSchema } from "../../../../src/lib/kernel/index.js";
import { recordReferences, RecordReferenceSchema } from "../../../../src/lib/store/identity.js";
import { startProjection, endProjection } from "../../../../src/lib/store/projection/engine.js";
import { createProjectionEnginePorts } from "../../../../src/lib/store/projection/engine-ports.js";
import { writeProjectionIndex, readProjectionIndex } from "../../../../src/lib/store/projection/index-file.js";

const directories: string[] = [];
afterEach(async () => { await removeGitBackedDirs(directories.splice(0)); });

it.each(["new", "existing", "refused"] as const)("keeps opened state on a %s archived adoption", async kind => {
  const h = await createAdoptionFixture({ placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") } });
  directories.push(h.f.root);
  const path = `${h.folder}/correction.txt`, content = "A correction.\n";
  const reference = recordReferences["work-item/companion"](h.primary.reference.owner, "correction.txt");
  if (kind === "existing") await seed(h.f, reference, content);
  const selected = kind === "refused" ? ".arc/completed/2026-q4/unknown.txt" : path;
  await writeFile(join(h.f.root, selected), content);
  await writeProjectionIndex(h.projected.location, { ...h.projected.index, entries: {
    ...h.projected.index.entries, [selected]: { kind: "ownerless", stat: null, opened: true },
  } });
  await startProjection({ store: h.f.store, checkout: h.f.root });
  const disk = await readProjectionIndex(h.projected.location, true, { groups: "all" });
  if (disk.kind !== "index") throw new Error("Missing adoption index");
  expect(disk.index.entries[selected]).toMatchObject({ kind: kind === "refused" ? "ownerless" : "record", opened: true });
  if (kind === "refused") expect(disk.index.entries[selected]?.refused).toEqual(expect.any(Object));
  else {
    expect(success(await h.f.store.read({ reference })).content).toContain("A correction.");
  }
  expect(await readFile(join(h.f.root, selected), "utf8")).toContain("A correction.");
  await endProjection({ store: h.f.store, checkout: h.f.root });
});

it("moves an opened archived metadata file with no changed mark to its renamed path", async () => {
  const h = await createAdoptionFixture({ placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") } });
  directories.push(h.f.root);
  const path = Object.keys(h.projected.index.entries)[0]!;
  const entry = h.projected.index.entries[path];
  if (entry?.kind !== "record") throw new Error("Missing archived metadata");
  await writeProjectionIndex(h.projected.location, { ...h.projected.index, entries: {
    [path]: { ...entry, changed: false, opened: true },
  } });
  const renamed = RecordReferenceSchema.parse({ ...h.primary.reference, owner: { ...h.primary.reference.owner, name: "beta" } });
  success(await h.f.store.write({ ...update(h.f, h.primary, h.primary.content.replaceAll("alpha", "beta")), reference: renamed,
    provenance: fixtureRenameProvenance }));
  await startProjection({ store: h.f.store, checkout: h.f.root });
  await endProjection({ store: h.f.store, checkout: h.f.root });
  const disk = await readProjectionIndex(h.projected.location, true, { groups: "all" });
  if (disk.kind !== "index") throw new Error("Missing renamed index");
  const destination = path.replaceAll("alpha", "beta");
  expect(disk.index.entries[destination]).toMatchObject({ reference: renamed, opened: true });
  expect(disk.index.entries[path]).toBeUndefined();
  expect((await stat(join(h.f.root, destination))).mode & 0o200).not.toBe(0);
  expect(await readFile(join(h.f.root, destination), "utf8")).toContain("beta");
});

it.each(["md", "txt"])("lays an opened new %s adoption read-back read-only inside save", async extension => {
  const h = await createAdoptionFixture({ placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") } });
  directories.push(h.f.root);
  const path = `${h.folder}/correction.${extension}`;
  await writeFile(join(h.f.root, path), "An adopted correction.\n");
  await writeProjectionIndex(h.projected.location, { ...h.projected.index, entries: {
    ...h.projected.index.entries, [path]: { kind: "ownerless", stat: null, opened: true },
  } });
  let observed = false;
  await startProjection({ store: h.f.store, checkout: h.f.root, mode: "save", ports: () => ({
    ...createProjectionEnginePorts(h.f.root), hooks: { afterFirstCheck: async laid => {
      if (laid !== path) return;
      expect((await stat(join(h.f.root, path))).mode & 0o200).toBe(0);
      expect(await readFile(join(h.f.root, path), "utf8")).toContain("An adopted correction.");
      observed = true;
    } },
  }) });
  expect(observed).toBe(true);
  await endProjection({ store: h.f.store, checkout: h.f.root });
});
