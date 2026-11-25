/** A discovered adoption rechecks ancestor links before reading the authored bytes. */
import { expect, it } from "vitest";
import { mkdir, readFile, rename, rm, symlink, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { createAdoptionFixture } from "../helpers/store/projection/adoption-fixture.js";
import { overrideEngineStore } from "../helpers/store/projection/engine-fixture.js";
import { success } from "../helpers/store/suite-tools.js";
import { startProjection } from "../../src/lib/store/projection/engine.js";
import { projectionProcessState } from "../../src/lib/store/projection/process-state.js";
import { RecordReferenceSchema } from "../../src/lib/store/identity.js";

for (const layout of ["default", "separate"] as const) {
  it(`leaves a newly linked ancestor unread and adopts the original file after repair: ${layout}`, async () => {
    const { f, primary, folder } = await createAdoptionFixture({ placement: { kind: "active" }, ownLayout: "nested", layout });
    const path = `${folder}/research-alpha.md`, absolute = join(f.root, path), authored = "Inside authored bytes.\n";
    await writeFile(absolute, authored);
    const privateFolder = join(f.root, "private-target"), backup = join(f.root, "original-folder");
    await mkdir(privateFolder);
    const privateFile = join(privateFolder, basename(path)), secret = "Private bytes behind the link.\n";
    await writeFile(privateFile, secret);
    let replaced = false;
    const store = overrideEngineStore(f.store, { read: async input => {
      const read = await f.store.read(input);
      if (!replaced && input.reference.kind === "work-item/meta" && projectionProcessState().roots.get(f.root)?.discovered.includes(path)) {
        replaced = true;
        await rename(join(f.root, folder), backup);
        await symlink(privateFolder, join(f.root, folder), "junction");
      }
      return read;
    } });
    await startProjection({ store, checkout: f.root });
    expect(replaced).toBe(true);
    const reference = RecordReferenceSchema.parse({ kind: "work-item/companion", owner: primary.reference.owner, key: "research" });
    expect(await f.store.read({ reference })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
    expect(await readFile(privateFile, "utf8")).toBe(secret);
    await rm(join(f.root, folder));
    await rename(backup, join(f.root, folder));
    expect(await readFile(absolute, "utf8")).toBe(authored);
    await startProjection({ store: f.store, checkout: f.root });
    expect(success(await f.store.read({ reference })).content).toBe(authored);
    expect(success(await f.store.history({ reference })).every(entry => entry.content !== secret)).toBe(true);
  });
}
