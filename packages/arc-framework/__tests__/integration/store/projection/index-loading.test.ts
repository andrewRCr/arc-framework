/** Command entry leaves settled archive partitions cold and contains corruption discovered at command end. */
import { access, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { startProjection, endProjection } from "../../../../src/lib/store/projection/engine.js";
import { readProjectionIndex, writeProjectionIndex } from "../../../../src/lib/store/projection/index-file.js";
import { projectionProcessState } from "../../../../src/lib/store/projection/process-state.js";
import { createEngineFixture } from "../../../helpers/store/projection/engine-fixture.js";
import { removeGitBackedDirs } from "../../../helpers/temp-repo.js";

const directories: string[] = [];
afterEach(async () => { await removeGitBackedDirs(directories.splice(0)); });

it("starts without loading a settled quarter holding sixty thousand entries", async () => {
  const h = await createEngineFixture(directories);
  const quarter = ".arc/completed/2026-q4";
  const entries = { ...h.index.entries, ...Object.fromEntries(Array.from({ length: 60_000 }, (_, i) =>
    [`${quarter}/${i}/notes.md`, { ...h.entry, changed: true }])) };
  await writeProjectionIndex(h.location, { ...h.index, entries });
  const header = JSON.parse(await readFile(join(h.location.stateDir, "index"), "utf8")) as {
    groups: Record<string, { name: string; unsettled: boolean }>;
  };
  const archive = header.groups[quarter]!;
  expect(archive.unsettled).toBe(false);
  // A cold partition's bytes are not consulted, even to decode or verify their content address.
  await writeFile(join(h.location.stateDir, archive.name), "unvisited archive bytes");
  expect(await startProjection({ store: h.store, checkout: h.checkout })).toMatchObject({ kind: "ready" });
  await endProjection({ store: h.store, checkout: h.checkout });
  expect(await readFile(join(h.location.stateDir, archive.name), "utf8")).toBe("unvisited archive bytes");
});

it("invalidates a late mismatch in the command's own root while retaining the header and reporting its partition", async () => {
  const h = await createEngineFixture(directories);
  expect(await startProjection({ store: h.store, checkout: h.checkout })).toMatchObject({ kind: "ready" });
  const headerPath = join(h.location.stateDir, "index"), headerBytes = await readFile(headerPath, "utf8");
  const header = JSON.parse(headerBytes) as { groups: Record<string, { name: string }> };
  const name = header.groups[".arc/user/andrew"]!.name;
  await writeFile(join(h.location.stateDir, name), "changed after the command's start");
  await endProjection({ store: h.store, checkout: h.checkout });
  expect(projectionProcessState().diagnostics).toEqual(expect.arrayContaining([
    expect.objectContaining({ path: h.checkout, mark: expect.objectContaining({ reason: expect.stringContaining(name) }) }),
  ]));
  await expect(access(join(h.location.stateDir, name))).rejects.toMatchObject({ code: "ENOENT" });
  expect(await readFile(headerPath, "utf8")).toBe(headerBytes);
  expect(await readProjectionIndex(h.location, true)).toEqual({ kind: "unusable", cause: "unreadable" });
});
