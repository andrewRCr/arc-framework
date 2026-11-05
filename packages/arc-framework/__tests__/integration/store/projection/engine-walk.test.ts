/** Command-wide discovery across projected roots, excluding machine-local state and links. */
import { mkdir, symlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { startProjection } from "../../../../src/lib/store/projection/engine.js";
import { renderStampedFile } from "../../../../src/lib/store/projection/stamp.js";
import { configureEngineCheckout, createEngineFixture } from "../../../helpers/store/projection/engine-fixture.js";
import { seedProjection } from "../../../helpers/store/projection/seeded-projection.js";
import { seed, success } from "../../../helpers/store/suite-tools.js";
import { removeGitBackedDirs } from "../../../helpers/temp-repo.js";

const directories: string[] = [];
afterEach(async () => { await removeGitBackedDirs(directories.splice(0)); });

describe("the command's projected-root walk", () => {
  it("finds edited files across active, backlog, and personal roots while leaving completed files unsent", async () => {
    const h = await createEngineFixture(directories);
    const paths = [".arc/active/one.md", ".arc/backlog/planned/deep/two.md", ".arc/user/andrew/three.md", ".arc/completed/2026-q4/four.md"];
    const records = await Promise.all(paths.map((_path, i) => seed(h, h.reference("personal/document", `record-${i}`), `original ${i}\n`)));
    const files = records.map((record, i) => ({ path: paths[i]!, reference: record.reference }));
    const projection = await seedProjection({ store: h.store, files });
    directories.push(projection.checkout);
    await configureEngineCheckout(projection.checkout);
    for (const [i, path] of paths.entries()) {
      const entry = projection.index.entries[path];
      if (entry?.kind !== "record") throw new Error("missing seeded entry");
      await writeFile(join(projection.checkout, path), renderStampedFile({ content: `edited ${i}\n`, stamp: entry.base.blob }));
    }
    await startProjection({ store: h.store, checkout: projection.checkout });
    for (const [i, record] of records.entries()) {
      expect(success(await h.store.read({ reference: record.reference })).content).toBe(i === 3 ? `original ${i}\n` : `edited ${i}\n`);
    }
  });

  it("returns new backlog files unsent and skips internal folders, completed roots, and symbolic links", async () => {
    const h = await createEngineFixture(directories);
    const paths = [".arc/backlog/planned/new.md", ".arc/user/andrew/.internal/secret.md",
      ".arc/user/andrew/work/.internal/secret.md", ".arc/completed/new.md"];
    for (const path of paths) {
      await mkdir(dirname(join(h.checkout, path)), { recursive: true });
      await writeFile(join(h.checkout, path), "new file\n");
    }
    await symlink(join(h.checkout, ".arc/user/andrew/.internal"), join(h.checkout, ".arc/backlog/internal-link"), "dir");
    const result = await startProjection({ store: h.store, checkout: h.checkout });
    expect(result).toMatchObject({ kind: "ready", discovered: [paths[0]] });
    expect(Object.keys((await h.disk()).entries)).toEqual([h.path]);
  });
});
