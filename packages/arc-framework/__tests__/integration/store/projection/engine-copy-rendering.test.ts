/** Durable marker provenance survives stopped commands and sweep recovery. */
import { access, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createMarkerFixture } from "../../../helpers/store/projection/marker-fixture.js";
import { renderStampedFile } from "../../../../src/lib/store/projection/stamp.js";
import { projectionProcessState } from "../../../../src/lib/store/projection/process-state.js";
import { createCopyRenderingFixture } from "../../../helpers/store/projection/copy-rendering-fixture.js";
import { initializeEngineCheckout } from "../../../helpers/store/projection/engine-fixture.js";
import { removeGitBackedDirs } from "../../../helpers/temp-repo.js";
import { startProjection, endProjection } from "../../../../src/lib/store/projection/engine.js";
import { createProjectionEnginePorts } from "../../../../src/lib/store/projection/engine-ports.js";
import { readProjectionIndex } from "../../../../src/lib/store/projection/index-file.js";

const directories: string[] = [];
afterEach(async () => { await removeGitBackedDirs(directories.splice(0)); });

describe("durable aside marker recovery", () => {
  it.each([false, true])("restores an old copy's marker mapping after a stopped command, path absent %s", async absent => {
    const h = await createCopyRenderingFixture();
    directories.push(h.checkout);
    await initializeEngineCheckout(h.checkout);
    const content = h.content.replace("stored side", "resolution in progress") + "independent note\n";
    await h.copyText(content);
    if (absent) await rm(join(h.checkout, h.path));
    const native = createProjectionEnginePorts(h.checkout);
    let command = 0;
    const input = { store: h.store, checkout: h.checkout, ports: () => ({ ...native,
      writer: async () => ({ pid: process.pid, processScope: h.context.writer.processScope, processInstance: `new-command-${++command}` }),
    }) };
    await startProjection(input);
    expect(await h.file()).toBe(h.text(content));
    const disk = await readProjectionIndex(h.location, true);
    if (disk.kind !== "index") throw new Error("index missing after sweep");
    expect(disk.index.entries[h.path]).toMatchObject({ markers: h.original.markers, notices: [], unshown: [],
      pending: true, refused: { reason: expect.stringContaining("resolution-in-progress") } });
    await h.edit("resolved side\nindependent note\n");
    await startProjection(input);
    await endProjection(input);
    expect(await h.store.read({ reference: h.entry.reference })).toMatchObject({ status: "ok", result: {
      content: "resolved side\nindependent note\n", conflicts: [],
    } });
  });

  it.each(["linked", "published", "unlinked"] as const)("recovers the old marker mapping when ownership is lost after return is %s", async stop => {
    const h = await createMarkerFixture({ path: ".arc/user/andrew/scratch/document.md" });
    directories.push(h.checkout);
    await initializeEngineCheckout(h.checkout);
    await h.edit(h.content + "independent note\n");
    let armed = false;
    let command = 0;
    let copyPath = "";
    const native = createProjectionEnginePorts(h.checkout);
    const input = { store: h.store, checkout: h.checkout, ports: () => ({ ...native,
      writer: async () => ({ ...await native.writer(), processInstance: `command-${++command}` }),
      lock: { scheduleEvery: () => () => undefined, readFile: async (path: string) => {
        if (armed && (await h.file().catch(() => "")).includes("resolution in progress")) {
          const alias = await access(copyPath).then(() => true, () => false);
          const disk = await readProjectionIndex(h.location, true);
          const entry = disk.kind === "index" ? disk.index.entries[h.path] : undefined;
          const published = entry?.kind === "record" && entry.markers !== null;
          const reached = stop === "linked" ? !published && alias : stop === "published" ? published && alias : !alias;
          if (reached) {
            armed = false;
            throw Object.assign(new Error(`ownership confirmation unavailable after ${stop}`), { code: "EACCES" });
          }
        }
        return readFile(path, "utf8");
      } },
    }) };
    await startProjection(input);
    const disk = await readProjectionIndex(h.location, true);
    const entry = disk.kind === "index" ? disk.index.entries[h.path] : undefined;
    if (entry?.kind !== "record" || entry.copies[0] === undefined) throw new Error("missing displaced marker file");
    const copy = entry.copies[0].name;
    copyPath = join(h.checkout, copy);
    const late = renderStampedFile({ content: h.content.replace("stored side", "resolution in progress") + "independent note\n", stamp: h.entry.base.blob });
    await writeFile(join(h.checkout, copy), late);
    armed = true;
    await endProjection(input);
    expect(projectionProcessState().diagnostics.some(diagnostic => diagnostic.mark.reason.includes("end skipped: lost"))).toBe(true);
    expect(await h.file()).toBe(late);
    if (stop !== "unlinked") await access(copyPath);
    await startProjection(input);
    expect(await h.file()).toBe(late);
    expect(await h.store.read({ reference: h.entry.reference })).toMatchObject({ status: "ok", result: {
      content: "stored side\nindependent note\n", conflicts: h.record.conflicts,
    } });
    await expect(access(join(h.checkout, copy))).rejects.toMatchObject({ code: "ENOENT" });
  });

});
