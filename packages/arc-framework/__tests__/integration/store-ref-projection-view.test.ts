/** Explicit view status selects native active generations while ordinary command entry avoids inventory work. */
import { afterEach, expect, it, vi } from "vitest";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createAdoptionFixture } from "../helpers/store/projection/adoption-fixture.js";
import { seed, success } from "../helpers/store/suite-tools.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { RecordReferenceSchema } from "../../src/lib/store/identity.js";
import { endProjection, startProjection } from "../../src/lib/store/projection/engine.js";
import { beginProjectionCommand } from "../../src/lib/store/projection/process-state.js";
import { buildProjectionStatusSummary, readProjectionStatus } from "../../src/lib/store/projection/status.js";
import { readProjectionViewStatus } from "../../src/lib/store/projection/view-status.js";
import { PROJECTION_INDEX_FILE, readProjectionIndex, writeProjectionIndex } from "../../src/lib/store/projection/index-file.js";
import { capturedEntries } from "../helpers/store/ref-fixture-plant.js";
import { plantRef } from "../helpers/store/ref-plant.js";
import { expandStoredPath } from "../../src/lib/store/stored-path.js";
import { resolveWorktreeMarkerPath } from "../../src/lib/git/worktree-marker.js";

afterEach(() => { beginProjectionCommand(); });

it("names a missing pin from the command's one configuration observation and accepts its correction on the next command", async () => {
  const { f, projected } = await createAdoptionFixture({ placement: { kind: "active" }, ownLayout: "nested" });
  const other = await seed(f, RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name: "beta" } }),
    makeMetaFixture("beta", { owner: "bob", state: "Active", workClass: "Light", priority: "P1", currentWorkflow: "process-task-loop" }),
    { kind: "active" });
  await f.ports.exec("git", ["config", "arc.inflightView", "all"], { cwd: f.root });
  await f.ports.exec("git", ["config", "arc.inflightPin", "missing"], { cwd: f.root });
  expect(await startProjection({ store: f.store, checkout: f.root })).toMatchObject({ kind: "ready" });
  await endProjection({ store: f.store, checkout: f.root });
  const noInventory = vi.spyOn(f.store, "list").mockImplementation(() => Promise.reject(new Error("Unchanged entry must not enumerate the view")));
  try { expect(await startProjection({ store: f.store, checkout: f.root })).toMatchObject({ kind: "ready" }); }
  finally { noInventory.mockRestore(); }
  const view = () => readProjectionViewStatus({ store: f.store, checkout: f.root,
    exec: async () => { throw new Error("Status must reuse the command's Git configuration observation"); } });
  const indexPath = join(projected.location.stateDir, PROJECTION_INDEX_FILE), bytes = await readFile(indexPath, "utf8");
  const before = success(await f.store.version());
  const status = await readProjectionStatus({ store: f.store, checkout: f.root, location: projected.location, view });
  expect(status).toMatchObject({ kind: "ready", view: { mode: "all", pins: ["missing"], diagnostics: [{
    reason: expect.stringContaining('arc.inflightPin "missing"'), remedy: { text: expect.stringContaining("active work item") },
  }] } });
  expect(buildProjectionStatusSummary(status)).toContain('arc.inflightPin "missing"');
  expect(success(await f.store.version())).toBe(before);
  expect(await readFile(indexPath, "utf8")).toBe(bytes);
  const disk = await readProjectionIndex(projected.location, true, { groups: "all" });
  if (disk.kind !== "index") throw new Error("Missing native projection index");
  expect(disk.index.projectedUnder.view).toEqual({ mode: "all", pins: ["missing"] });
  await f.ports.exec("git", ["config", "--replace-all", "arc.inflightPin", other.reference.owner.name], { cwd: f.root });
  await startProjection({ store: f.store, checkout: f.root });
  expect(await readProjectionStatus({ store: f.store, checkout: f.root, location: projected.location, view }))
    .toMatchObject({ kind: "ready", view: { mode: "all", pins: ["beta"], diagnostics: [] } });
});

it("keeps a damaged native inventory distinct from a missing pin and selects it after forward repair", async () => {
  const { f, registry, projected } = await createAdoptionFixture({ placement: { kind: "active" }, ownLayout: "nested" });
  const other = await seed(f, RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name: "beta" } }),
    makeMetaFixture("beta", { owner: "bob", state: "Active", workClass: "Light", priority: "P1", currentWorkflow: "process-task-loop" }),
    { kind: "active" });
  await f.ports.exec("git", ["config", "arc.inflightView", "all"], { cwd: f.root });
  await f.ports.exec("git", ["config", "arc.inflightPin", "beta"], { cwd: f.root });
  await startProjection({ store: f.store, checkout: f.root });
  const readStatus = () => readProjectionStatus({ store: f.store, checkout: f.root, location: projected.location,
    view: () => readProjectionViewStatus({ store: f.store, checkout: f.root, exec: f.ports.exec }) });
  const home = expandStoredPath(other.reference, { registry }), intact = await capturedEntries(f, home.ref);
  const tip = new TextDecoder().decode((await f.ports.rawExec([...f.gitDir ? [`--git-dir=${f.gitDir}`] : [], "rev-parse", home.ref],
    { objectAccess: "local-only" })).stdout).trim();
  const damaged = await plantRef(f.root, home.ref, intact.map(entry => entry.path === home.metadataPath
    ? { path: entry.path, content: "broken metadata" } : entry), { parents: [tip], gitDir: f.gitDir });
  try {
    const before = success(await f.store.version()), status = await readStatus();
    expect(status).toMatchObject({ kind: "ready", view: { mode: "all", pins: ["beta"], diagnostics: expect.arrayContaining([
      expect.objectContaining({ reason: expect.stringMatching(/metadata|namespace/iu), remedy: { text: expect.any(String) } }),
    ]) } });
    expect(buildProjectionStatusSummary(status)).not.toContain("names no in-flight work item");
    expect(success(await f.store.version())).toBe(before);
  } finally { await plantRef(f.root, home.ref, intact, { parents: [damaged.tip], gitDir: f.gitDir }); }
  expect(await readStatus()).toMatchObject({ kind: "ready", view: { mode: "all", pins: ["beta"], diagnostics: [] } });
});

it("keeps an unknown setting visible without a usable identity or index and resumes after both are repaired", async () => {
  const { f, projected } = await createAdoptionFixture({ placement: { kind: "active" }, ownLayout: "nested" });
  await f.ports.exec("git", ["config", "arc.identity", "Not A Slug"], { cwd: f.root });
  await f.ports.exec("git", ["config", "arc.inflightView", "unknown"], { cwd: f.root });
  await f.ports.exec("git", ["config", "arc.inflightPin", "alpha"], { cwd: f.root });
  const indexPath = join(projected.location.stateDir, PROJECTION_INDEX_FILE);
  await writeFile(indexPath, "not JSON");
  const readStatus = () => readProjectionStatus({ store: f.store, checkout: f.root, location: projected.location,
    view: () => readProjectionViewStatus({ store: f.store, checkout: f.root,
      exec: async () => { throw new Error("A skipped start must retain its configuration observation"); } }) });
  const noInventory = vi.spyOn(f.store, "list").mockImplementation(() => Promise.reject(new Error("An invalid identity cannot select a view")));
  try {
    expect(await startProjection({ store: f.store, checkout: f.root })).toMatchObject({ kind: "skipped", skip: { reason: "no-identity" } });
    const status = await readStatus();
    expect(status).toMatchObject({ kind: "unusable", view: { mode: "mine", diagnostics: expect.arrayContaining([
      expect.objectContaining({ reason: expect.stringContaining('arc.inflightView value "unknown"') }),
      expect.objectContaining({ reason: expect.stringContaining("invalid identity") }),
    ]) } });
    expect(buildProjectionStatusSummary(status)).toContain("Projection index is unreadable");
    expect(buildProjectionStatusSummary(status)).not.toContain("names no in-flight work item");
    expect(await readFile(indexPath, "utf8")).toBe("not JSON");
  } finally { noInventory.mockRestore(); }
  await f.ports.exec("git", ["config", "arc.identity", "andrew"], { cwd: f.root });
  await f.ports.exec("git", ["config", "arc.inflightView", "all"], { cwd: f.root });
  await writeProjectionIndex(projected.location, projected.index);
  await startProjection({ store: f.store, checkout: f.root });
  expect(await readStatus()).toMatchObject({ kind: "ready", view: { mode: "all", pins: ["alpha"], diagnostics: [] } });
});

it("reports a malformed checkout claim instead of treating it as absent and selects after marker repair", async () => {
  const { f, projected } = await createAdoptionFixture({ placement: { kind: "active" }, ownLayout: "nested" });
  await f.ports.exec("git", ["config", "arc.inflightView", "all"], { cwd: f.root });
  const path = resolveWorktreeMarkerPath(f.root), original = await readFile(path, "utf8");
  await writeFile(path, "not JSON");
  beginProjectionCommand();
  const readStatus = () => readProjectionStatus({ store: f.store, checkout: f.root, location: projected.location,
    view: () => readProjectionViewStatus({ store: f.store, checkout: f.root, exec: f.ports.exec }) });
  try {
    expect(await readStatus()).toMatchObject({ kind: "ready", view: { mode: "all", diagnostics: [
      expect.objectContaining({ reason: expect.stringMatching(/marker/iu), remedy: { text: expect.stringContaining("Repair") } }),
    ] } });
  } finally { await writeFile(path, original); }
  expect(await readStatus()).toMatchObject({ kind: "ready", view: { mode: "all", diagnostics: [] } });
});
