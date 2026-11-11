/** Advisory fan-out refuses unavailable destinations and leaves each command's recovery path intact. */
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { createFanOutFixture } from "../../../helpers/store/projection/fan-out-fixture.js";
import { createRefusingStore } from "../../../helpers/store/projection/refusing-store.js";
import { removeGitBackedDirs } from "../../../helpers/temp-repo.js";
import { success } from "../../../helpers/store/suite-tools.js";
import { beginProjectionCommand, projectionProcessState } from "../../../../src/lib/store/projection/process-state.js";
import { withProjectionLock } from "../../../../src/lib/store/projection/lock.js";
import { startProjection, endProjection } from "../../../../src/lib/store/projection/engine.js";
import { createProjectionEnginePorts } from "../../../../src/lib/store/projection/engine-ports.js";
import { resolveWorktreeMarkerPath } from "../../../../src/lib/git/worktree-marker.js";
import { StoreRefusalSchema } from "../../../../src/lib/store/refusal.js";

const directories: string[] = [];
beforeEach(() => { beginProjectionCommand(); });
afterEach(async () => { beginProjectionCommand(); await removeGitBackedDirs(directories.splice(0)); });

async function write(h: Awaited<ReturnType<typeof createFanOutFixture>>, content: string) {
  const current = await h.h.stored();
  return h.store.write({ action: "put", reference: current.reference, expected: current.version, content,
    provenance: { verb: "save", lifecycleAction: "save" } });
}

it("skips a sibling held past the wait bound without failing the write, then catches up at its next command", async () => {
  const h = await createFanOutFixture(directories), before = await h.file();
  expect(await withProjectionLock(h.sibling.location, async () => {
    expect(await write(h, "Stored while another lease holds the sibling.\n")).toMatchObject({ status: "ok" });
    expect(await h.file()).toBe(before);
  })).toMatchObject({ status: "done" });
  expect(await h.h.file()).toContain("Stored while another lease holds the sibling.");
  expect(projectionProcessState().diagnostics).toEqual([expect.objectContaining({ path: h.sibling.checkout,
    mark: expect.objectContaining({ reason: expect.stringContaining("held") }) })]);
  await endProjection(h.input);
  expect(await startProjection({ store: h.h.store, checkout: h.sibling.checkout, location: h.sibling.location })).toMatchObject({ kind: "ready" });
  expect(await h.file()).toContain("Stored while another lease holds the sibling.");
});

it("reports an unreadable marker and continues the write, then refreshes after the marker is repaired", async () => {
  const h = await createFanOutFixture(directories), marker = resolveWorktreeMarkerPath(h.sibling.checkout), before = await h.file();
  await mkdir(dirname(marker), { recursive: true });
  await writeFile(marker, "{");
  expect(await write(h, "Stored despite an unreadable sibling marker.\n")).toMatchObject({ status: "ok" });
  expect(await h.file()).toBe(before);
  expect(await h.h.file()).toContain("Stored despite an unreadable sibling marker.");
  expect(projectionProcessState().diagnostics).toEqual([expect.objectContaining({ path: h.sibling.checkout,
    mark: expect.objectContaining({ reason: expect.stringContaining("marker") }) })]);
  await endProjection(h.input);
  await rm(marker);
  expect(await startProjection({ store: h.h.store, checkout: h.sibling.checkout, location: h.sibling.location })).toMatchObject({ kind: "ready" });
  expect(await h.file()).toContain("Stored despite an unreadable sibling marker.");
});

it("skips an older index format and leaves its next command to rebuild it", async () => {
  const h = await createFanOutFixture(directories), path = join(h.sibling.location.stateDir, "index"), before = await h.file();
  const header = JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
  await writeFile(path, JSON.stringify({ ...header, format: 1 }));
  expect(await write(h, "Stored after the sibling's format expired.\n")).toMatchObject({ status: "ok" });
  expect(await h.file()).toBe(before);
  expect(JSON.parse(await readFile(path, "utf8"))).toMatchObject({ format: 1 });
  await endProjection(h.input);
  expect(await startProjection({ store: h.h.store, checkout: h.sibling.checkout, location: h.sibling.location,
    ports: () => createProjectionEnginePorts(h.sibling.checkout) })).toMatchObject({ kind: "ready" });
  expect(await h.file()).toContain("Stored after the sibling's format expired.");
  expect(JSON.parse(await readFile(path, "utf8"))).toMatchObject({ format: 2 });
});

it("skips an unresolvable anchor without inventory reads, then rebuilds it at the next command", async () => {
  let source: ReturnType<typeof createRefusingStore> | undefined;
  const h = await createFanOutFixture(directories, { store: store => { source = createRefusingStore(store); return source.store; } });
  if (source === undefined) throw new Error("Missing controlled source");
  source.refuse("changes", StoreRefusalSchema.parse({ code: "state-unresolvable", class: "recoverable", historyRefs: [],
    condition: "The saved source anchor no longer resolves.", remedy: { text: "Rebuild from current state." } }));
  const before = await h.file(), lists = source.calls("list");
  expect(await write(h, "Stored beyond an expired anchor.\n")).toMatchObject({ status: "ok" });
  expect(await h.file()).toBe(before);
  expect(source.calls("list")).toBe(lists);
  await endProjection(h.input);
  expect(await startProjection({ ...h.input, store: source.store })).toMatchObject({ kind: "ready" });
  expect(await h.h.file()).toContain("Stored beyond an expired anchor.");
  expect(source.calls("list")).toBeGreaterThan(lists);
  expect(success(await h.store.version())).toBe(success(await h.h.store.version()));
});
