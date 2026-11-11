/** A source advancing after the round's version read cannot replace the base of an editor's take-in. */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { createFanOutFixture } from "../../../helpers/store/projection/fan-out-fixture.js";
import { overrideEngineStore } from "../../../helpers/store/projection/engine-fixture.js";
import { removeGitBackedDirs } from "../../../helpers/temp-repo.js";
import { success } from "../../../helpers/store/suite-tools.js";
import { beginProjectionCommand, projectionProcessState } from "../../../../src/lib/store/projection/process-state.js";
import { parseStampedFile, renderStampedFile } from "../../../../src/lib/store/projection/stamp.js";
import type { Store } from "../../../../src/lib/store/contract.js";

const directories: string[] = [];
beforeEach(() => { beginProjectionCommand(); });
afterEach(async () => { beginProjectionCommand(); await removeGitBackedDirs(directories.splice(0)); });

it.each([false, true])("retains an editor save with a late source write, related=%s", async related => {
  const base = "intro\none\nseparator\nbase\nseparator two\nclosing\n";
  let advance: (() => Promise<void>) | null = null;
  let landed: Awaited<ReturnType<Store["write"]>> | undefined;
  const h = await createFanOutFixture(directories, { content: base, store: store => overrideEngineStore(store, {
    write: async input => { landed = await store.write(input); return landed; },
    version: async () => {
      const version = await store.version(), inject = advance;
      advance = null;
      await inject?.();
      return version;
    },
  }) });
  const disk = await h.disk(), entry = disk.entries[h.h.path];
  if (entry?.kind !== "record") throw new Error("Missing editor base");
  await writeFile(join(h.sibling.checkout, h.h.path), renderStampedFile({
    content: base.replace("\nbase\n", "\nhand edit\n"), stamp: entry.base.blob }));
  advance = async () => {
    const current = await h.h.stored();
    success(await h.h.store.write(related ? { action: "put", reference: current.reference, expected: current.version,
      content: current.content.replace("\none\n", "\nlate store\n"), provenance: { verb: "save", lifecycleAction: "save" } }
      : { action: "put", reference: { ...current.reference, key: "scratch/late.md" }, expected: null,
        content: "An unrelated late write.\n", provenance: { verb: "save", lifecycleAction: "save" } }));
  };
  const current = await h.h.stored();
  const result = await h.store.write({ action: "put", reference: current.reference, expected: current.version,
    content: base.replace("closing", "verb closing"), provenance: { verb: "save", lifecycleAction: "save" } });
  expect(result).toBe(landed);
  const expected = base.replace("\nbase\n", "\nhand edit\n").replace("closing", "verb closing")
    .replace("\none\n", related ? "\nlate store\n" : "\none\n");
  expect((await h.h.stored()).content).toBe(expected);
  expect(parseStampedFile(await h.h.file()).content).toBe(expected);
  expect(parseStampedFile(await h.file()).content).toBe(expected);
  if (!related) for (const checkout of [h.h.checkout, h.sibling.checkout]) {
    expect(parseStampedFile(await readFile(join(checkout, ".arc/user/andrew/scratch/late.md"), "utf8")).content)
      .toBe("An unrelated late write.\n");
  }
  expect(projectionProcessState().diagnostics).toEqual([]);
});
