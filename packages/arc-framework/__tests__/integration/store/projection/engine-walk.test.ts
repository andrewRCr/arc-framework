/** Command-wide discovery across projected roots, excluding machine-local state and links. */
import { lstat, mkdir, readFile, readdir, rename, symlink, writeFile } from "node:fs/promises";
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
      walkFs: { readdir, lstat: path => {
        if (path.split(sep).includes(".internal")) throw new Error("Private folders must not be probed by discovery");
        return lstat(path);
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

  it("ignores editor side files before statting a dangling Emacs lock", async () => {
    const h = await createEngineFixture(directories);
    const folder = join(h.checkout, ".arc/active/current"), lock = join(folder, ".#note.md");
    await mkdir(folder, { recursive: true });
    await symlink(join(h.checkout, "missing-editor-buffer"), lock);
    await writeFile(join(folder, ".note.md.swp"), "Vim swap");
    await writeFile(join(folder, "note.md.tmp.123.abcd"), "editor temporary content");
    const before = success(await h.store.version()), native = h.ports();
    expect(await startProjection({ store: h.store, checkout: h.checkout, ports: () => ({ ...native,
      walkFs: { readdir, lstat: path => {
        if (path === lock) throw new Error("An editor lock must be excluded before stat");
        return lstat(path);
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
