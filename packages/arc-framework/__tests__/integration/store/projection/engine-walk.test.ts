/** Command-wide discovery across projected roots, excluding machine-local state and links. */
import { mkdir, readFile, rename, symlink, writeFile } from "node:fs/promises";
import { lstatSync, readdirSync, rmdirSync, unlinkSync } from "node:fs";
import { walkProjectionRoots } from "../../../../src/lib/store/projection/engine-walk.js";
import { readRemovalProjectionRoots } from "../../../../src/lib/store/projection/removal-files.js";
import { dirname, join, sep } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { startProjection } from "../../../../src/lib/store/projection/engine.js";
import { renderStampedFile } from "../../../../src/lib/store/projection/stamp.js";
import { configureEngineCheckout, createEngineFixture } from "../../../helpers/store/projection/engine-fixture.js";
import { seedProjection } from "../../../helpers/store/projection/seeded-projection.js";
import { seed, success } from "../../../helpers/store/suite-tools.js";
import { removeGitBackedDirs } from "../../../helpers/temp-repo.js";
import { projectionProcessState } from "../../../../src/lib/store/projection/process-state.js";
import { makeMetaFixture } from "../../../helpers/meta-fixture.js";
import { recordReferences } from "../../../../src/lib/store/identity.js";
import { ArchiveQuarterSchema } from "../../../../src/lib/kernel/index.js";
import { META_REGISTRATION } from "../../../../src/lib/store/kinds/meta/registration.js";

const directories: string[] = [];
afterEach(async () => { await removeGitBackedDirs(directories.splice(0)); });

describe("the command's projected-root walk", () => {
  it("uses typed folder entries without per-entry stats and yields between folders", async () => {
    const h = await createEngineFixture(directories);
    const root = ".arc/backlog", folder = join(h.checkout, root);
    await mkdir(join(folder, "a/deep"), { recursive: true });
    await writeFile(join(folder, "a/one.md"), "one\n");
    await writeFile(join(folder, "a/deep/two.md"), "two\n");
    await symlink(join(h.checkout, ".arc/user/andrew/scratch"), join(folder, "link"), "junction");
    let lstatCalls = 0, first = true, yielded = false, laterFolderYielded = false;
    const fs = {
      lstat: (path: string) => { lstatCalls++; return lstatSync(path); },
      readdir: (path: string) => {
        if (first) { first = false; setImmediate(() => { yielded = true; }); }
        else laterFolderYielded ||= yielded;
        return readdirSync(path, { withFileTypes: true });
      },
    };
    const result = await walkProjectionRoots(h.checkout, [root], fs);
    expect({ result, lstatCalls }).toEqual({ result: {
      files: [`${root}/a/deep/two.md`, `${root}/a/one.md`], links: [`${root}/link`],
    }, lstatCalls: 0 });
    expect(laterFolderYielded).toBe(true);
  });

  it("keeps a folder's other files when one entry vanishes while an untyped read types it", async () => {
    const h = await createEngineFixture(directories);
    const root = ".arc/backlog", folder = join(h.checkout, root);
    await mkdir(join(folder, "a"), { recursive: true });
    await writeFile(join(folder, "a/kept.md"), "kept\n");
    await writeFile(join(folder, "a/vanishing.md"), "renamed away by an editor\n");
    let typed = 0;
    const result = await walkProjectionRoots(h.checkout, [root], { readdir: (path: string) => {
      if (path === join(folder, "a") && typed++ === 0) {
        unlinkSync(join(folder, "a/vanishing.md"));
        throw Object.assign(new Error("lstat of an untyped entry failed"), { code: "ENOENT" });
      }
      return readdirSync(path, { withFileTypes: true });
    } });
    expect(result).toEqual({ files: [`${root}/a/kept.md`], links: [] });
    expect(await walkProjectionRoots(h.checkout, [`${root}/missing`])).toEqual({ files: [], links: [] });
  });

  it("keeps every other identity's personal tree in a removal's roots when one identity folder vanishes", async () => {
    const h = await createEngineFixture(directories);
    const personal = join(h.checkout, ".arc/user");
    await mkdir(join(personal, "other/scratch"), { recursive: true });
    await mkdir(join(personal, "leaving"), { recursive: true });
    let typed = 0;
    const roots = await readRemovalProjectionRoots(h.checkout, [".arc/active"], { walkFs: { readdir: (path: string) => {
      if (path === personal && typed++ === 0) {
        rmdirSync(join(personal, "leaving"));
        throw Object.assign(new Error("lstat of an untyped entry failed"), { code: "ENOENT" });
      }
      return readdirSync(path, { withFileTypes: true });
    } } });
    expect([...roots].sort()).toEqual([".arc/active", ".arc/user/andrew", ".arc/user/other"]);
  });

  it("surfaces a folder observation failure and takes in the edit after a repaired retry", async () => {
    const h = await createEngineFixture(directories);
    await mkdir(join(h.checkout, ".arc/backlog"), { recursive: true });
    await h.edit("An edit survives a failed folder read.\n");
    const native = h.ports(), failure = Object.assign(new Error("directory denied"), { code: "EACCES" });
    await expect(startProjection({ store: h.store, checkout: h.checkout, ports: () => ({ ...native,
      walkFs: { readdir: path => {
        if (path === join(h.checkout, ".arc/backlog")) throw failure;
        return readdirSync(path, { withFileTypes: true });
      } },
    }) })).rejects.toBe(failure);
    expect((await h.stored()).content).toBe(h.record.content);
    expect(await startProjection({ store: h.store, checkout: h.checkout })).toMatchObject({ kind: "ready" });
    expect((await h.stored()).content).toBe("An edit survives a failed folder read.\n");
  });

  it("finds edited files across active, backlog, and personal roots while leaving completed files unsent", async () => {
    const h = await createEngineFixture(directories, { registryOverrides: { "work-item/meta": { parser: META_REGISTRATION.parser } } });
    const active = await seed(h, h.reference("work-item/meta", "active"), makeMetaFixture("work-item-active", {
      state: "Active", owner: "andrew", workClass: "Light", priority: "P1", currentWorkflow: "process-task-loop" }));
    const backlog = await seed(h, h.reference("work-item/meta", "backlog"), makeMetaFixture("work-item-backlog", {
      state: "Planning", owner: "andrew", workClass: "Light", priority: "P1", currentWorkflow: "draft-design" }),
    { kind: "backlog", commitment: "planned" });
    const completed = await seed(h, h.reference("work-item/meta", "completed"), makeMetaFixture("work-item-completed", {
      state: "Shipped", owner: "andrew", workClass: "Light", priority: "P1", currentWorkflow: null }),
    { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") });
    const paths = [".arc/active/in-flight/work-item-active/notes-work-item-active.md",
      ".arc/backlog/planned/work-item-backlog/notes-work-item-backlog.md", ".arc/user/andrew/scratch/three.md",
      ".arc/completed/2026-q4/01_work-item-completed/notes-work-item-completed.md"];
    const personal = { ...h.reference("personal/document"), key: "scratch/three.md" };
    const references = [recordReferences["work-item/notes"](active.reference.owner), recordReferences["work-item/notes"](backlog.reference.owner),
      personal, recordReferences["work-item/notes"](completed.reference.owner)];
    const records = await Promise.all(references.map((reference, i) => seed(h, reference, `original ${i}\n`)));
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

  it("retains an ownerless backlog file and adopts after it moves to an eligible path, without walking private roots", async () => {
    const h = await createEngineFixture(directories);
    const paths = [".arc/backlog/planned/new.md", ".arc/user/andrew/.internal/secret.md",
      ".arc/user/andrew/work/.internal/secret.md", ".arc/completed/new.md"];
    for (const path of paths) {
      await mkdir(dirname(join(h.checkout, path)), { recursive: true });
      await writeFile(join(h.checkout, path), "new file\n");
    }
    await symlink(join(h.checkout, ".arc/user/andrew/.internal"), join(h.checkout, ".arc/backlog/internal-link"), "dir");
    const native = h.ports();
    const result = await startProjection({ store: h.store, checkout: h.checkout, ports: () => ({ ...native,
      walkFs: { readdir: path => {
        if (path.split(sep).includes(".internal")) throw new Error("Private folders must not be probed by discovery");
        return readdirSync(path, { withFileTypes: true });
      } },
    }) });
    expect(result).toMatchObject({ kind: "ready", discovered: [paths[0]] });
    expect((await h.disk()).entries[paths[0]!]).toMatchObject({ kind: "ownerless", refused: { remedy: { text: expect.any(String) } } });
    expect(Object.keys((await h.disk()).entries).sort()).toEqual([h.path, paths[0]!].sort());
    const repaired = ".arc/user/andrew/scratch/new.md";
    await mkdir(dirname(join(h.checkout, repaired)), { recursive: true });
    await rename(join(h.checkout, paths[0]!), join(h.checkout, repaired));
    await startProjection({ store: h.store, checkout: h.checkout });
    const index = await h.disk(), adopted = index.entries[repaired];
    expect(index.entries[paths[0]!]).toBeUndefined();
    if (adopted?.kind !== "record") throw new Error("The repaired personal path did not adopt");
    expect(success(await h.store.read({ reference: adopted.reference })).content).toBe("new file\n");
  });

  it("ignores editor side files before inspecting a dangling Emacs lock entry", async () => {
    const h = await createEngineFixture(directories);
    const folder = join(h.checkout, ".arc/active/current"), lock = join(folder, ".#note.md");
    await mkdir(folder, { recursive: true });
    await symlink(join(h.checkout, "missing-editor-buffer"), lock);
    await writeFile(join(folder, ".note.md.swp"), "Vim swap");
    await writeFile(join(folder, "note.md.tmp.123.abcd"), "editor temporary content");
    const before = success(await h.store.version()), native = h.ports();
    expect(await startProjection({ store: h.store, checkout: h.checkout, ports: () => ({ ...native,
      walkFs: { readdir: path => {
        return readdirSync(path, { withFileTypes: true }).map(entry => ({ name: entry.name,
          isDirectory: () => {
            if (join(path, entry.name) === lock) throw new Error("An editor lock must be excluded before type inspection");
            return entry.isDirectory();
          }, isFile: () => entry.isFile(), isSymbolicLink: () => entry.isSymbolicLink() }));
      } },
    }) })).toMatchObject({ kind: "ready", discovered: [] });
    expect(success(await h.store.version())).toBe(before);
    expect(Object.keys((await h.disk()).entries)).toEqual([h.path]);
    expect(projectionProcessState().diagnostics).toEqual([]);
  });

  it("leaves legacy ROADMAP and identity status files neither adopted nor refused", async () => {
    const h = await createEngineFixture(directories);
    const files = [".arc/backlog/ROADMAP.md", ".arc/user/andrew/STATUS.USER.md"];
    for (const path of files) {
      await mkdir(dirname(join(h.checkout, path)), { recursive: true });
      await writeFile(join(h.checkout, path), "legacy derived view\n");
    }
    const before = success(await h.store.version());
    expect(await startProjection({ store: h.store, checkout: h.checkout })).toMatchObject({ kind: "ready", discovered: [] });
    expect(success(await h.store.version())).toBe(before);
    expect(Object.keys((await h.disk()).entries)).toEqual([h.path]);
    expect(projectionProcessState().diagnostics).toEqual([]);
    for (const path of files) expect(await readFile(join(h.checkout, path), "utf8")).toBe("legacy derived view\n");
  });
});
