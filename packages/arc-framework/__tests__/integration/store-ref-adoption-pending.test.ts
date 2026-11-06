/** Accepted adoption stays pending while an editor keeps saving through guarded read-back. */
import { afterEach, expect, it } from "vitest";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createAdoptionFixture } from "../helpers/store/projection/adoption-fixture.js";
import { overrideEngineStore } from "../helpers/store/projection/engine-fixture.js";
import { success } from "../helpers/store/suite-tools.js";
import { recordReferences } from "../../src/lib/store/identity.js";
import { startProjection } from "../../src/lib/store/projection/engine.js";
import { beginProjectionCommand, projectionProcessState } from "../../src/lib/store/projection/process-state.js";
import { gitBlobId } from "../../src/lib/store/projection/blob-id.js";
import { renderStampedFile, parseStampedFile } from "../../src/lib/store/projection/stamp.js";
import { readProjectionIndex } from "../../src/lib/store/projection/index-file.js";

afterEach(() => { beginProjectionCommand(); });

it("retains an accepted creation and its latest unsent bytes, then completes read-back after saving stops", async () => {
  const { f, primary, folder, projected } = await createAdoptionFixture();
  const path = `${folder}/note.md`, absolute = join(f.root, path);
  let revision = 1, saving = true;
  await writeFile(absolute, `edit ${revision}\n`);
  const reference = recordReferences["work-item/companion"](primary.reference.owner, "note.md");
  const store = overrideEngineStore(f.store, { write: async input => {
    const result = await f.store.write(input);
    if (saving && result.status === "ok" && input.action === "put") await writeFile(absolute, renderStampedFile({
      content: `edit ${++revision}\n`, stamp: gitBlobId(input.content, "sha1"),
    }));
    return result;
  } });
  await startProjection({ store, checkout: f.root });
  expect(success(await f.store.read({ reference })).content).toBe("edit 4\n");
  expect(parseStampedFile(await readFile(absolute, "utf8")).content).toBe("edit 5\n");
  const held = await readProjectionIndex(projected.location, true);
  if (held.kind !== "index") throw new Error("Missing pending index");
  expect(held.index.entries[path]).toMatchObject({ kind: "record", reference, pending: true, adoption: { kind: "read-back" } });
  expect(projectionProcessState().roots.get(f.root)?.unsent.has(path)).toBe(true);
  expect(projectionProcessState().diagnostics).toEqual(expect.arrayContaining([
    expect.objectContaining({ path, mark: expect.objectContaining({ reason: expect.stringContaining("unsettled") }) }),
  ]));
  saving = false;
  await startProjection({ store, checkout: f.root });
  expect(success(await f.store.read({ reference })).content).toBe("edit 5\n");
  expect(parseStampedFile(await readFile(absolute, "utf8")).content).toBe("edit 5\n");
  const repaired = await readProjectionIndex(projected.location, true);
  if (repaired.kind !== "index") throw new Error("Missing repaired index");
  expect(repaired.index.entries[path]).toMatchObject({ kind: "record", reference, pending: false });
  expect(repaired.index.entries[path]).not.toHaveProperty("adoption");
  expect(projectionProcessState().roots.get(f.root)?.unsent.has(path)).toBe(false);
});
