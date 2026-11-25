/** Literal and conventional root companions adopt and reproject without aliasing. */
import { afterEach, expect, it } from "vitest";
import { readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createAdoptionFixture } from "../helpers/store/projection/adoption-fixture.js";
import { seedProjection } from "../helpers/store/projection/seeded-projection.js";
import { startProjection } from "../../src/lib/store/projection/engine.js";
import { beginProjectionCommand } from "../../src/lib/store/projection/process-state.js";
import { recordReferences } from "../../src/lib/store/identity.js";
import { identifyArcFileAddress, resolveArcPath } from "../../src/lib/layout/index.js";
import { readProjectionIndex } from "../../src/lib/store/projection/index-file.js";
import { SlugSchema } from "../../src/lib/kernel/index.js";
import { success } from "../helpers/store/suite-tools.js";

afterEach(() => { beginProjectionCommand(); });

it.each(["default", "separate"] as const)("adopts both root filenames and reprojects their reopened records in %s", async layout => {
  const { f, primary, folder, projected } = await createAdoptionFixture({ layout });
  const pairs = [["./readme", "readme", "Literal root prose\n"], ["readme", "readme-alpha.md", "Named prose\n"]] as const;
  for (const [, filename, content] of pairs) await writeFile(join(f.root, folder, filename), content);
  await startProjection({ store: f.store, checkout: f.root });
  const disk = await readProjectionIndex(projected.location, true, { groups: "all" });
  if (disk.kind !== "index") throw new Error("Missing adopted index");
  const reopened = f.reopen();
  const files = pairs.map(([key, filename]) => ({ reference: recordReferences["work-item/companion"](primary.reference.owner, key),
    path: `${folder}/${filename}` }));
  for (const [key, filename, content] of pairs) {
    const reference = recordReferences["work-item/companion"](primary.reference.owner, key);
    expect(success(await reopened.read({ reference })).content).toBe(content);
    expect(disk.index.entries[`${folder}/${filename}`]).toMatchObject({ kind: "record", reference });
  }
  const reprojection = await seedProjection({ store: reopened, files });
  try {
    for (const [key, filename, content] of pairs) {
      const path = resolveArcPath({ kind: "work-unit-companion", slug: SlugSchema.parse("alpha"),
        placement: { kind: "backlog", commitment: "planned", cohort: [] }, key });
      expect(path).toBe(`${folder}/${filename}`);
      expect(identifyArcFileAddress(path, { workItem: { kind: "work-unit-container", slug: SlugSchema.parse("alpha"),
        placement: { kind: "backlog", commitment: "planned", cohort: [] } } })).toMatchObject({ key });
      expect(await readFile(join(reprojection.checkout, path), "utf8")).toContain(content);
    }
  } finally {
    const { rm } = await import("node:fs/promises");
    await rm(reprojection.checkout, { recursive: true, force: true });
  }
});


it.each(["default", "separate"] as const)("preserves the reserved flat filename and adopts after renaming in %s", async layout => {
  const { f, primary, folder, projected } = await createAdoptionFixture({ layout, placement: { kind: "active" }, ownLayout: "flat" });
  const path = `${folder}/in-flight`, content = "Authored literal prose awaiting a usable filename.\n";
  await writeFile(join(f.root, path), content);
  await startProjection({ store: f.store, checkout: f.root });
  const reserved = recordReferences["work-item/companion"](primary.reference.owner, "./in-flight");
  expect(await f.store.read({ reference: reserved })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
  expect(await readFile(join(f.root, path), "utf8")).toBe(content);
  const disk = await readProjectionIndex(projected.location, true, { groups: "all" });
  if (disk.kind !== "index") throw new Error("Missing projection index");
  expect(disk.index.entries[path]?.kind).not.toBe("record");
  const repaired = `${folder}/in-flight-alpha.md`;
  await rename(join(f.root, path), join(f.root, repaired));
  await startProjection({ store: f.store, checkout: f.root });
  expect(success(await f.store.read({ reference: recordReferences["work-item/companion"](primary.reference.owner, "in-flight") })).content)
    .toBe(content);
  expect(await readFile(join(f.root, repaired), "utf8")).toContain(content);
});
