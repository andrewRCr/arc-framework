/** Archive discovery retries and link observation after sync restoration. */
import { lstat, mkdir, readFile, rename, rm, symlink, writeFile } from "node:fs/promises";
import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { archiveRetirementFixture } from "../../../helpers/store/projection/archive-retirement.js";
import { projectionCommand } from "../../../helpers/store/projection/command.js";
import { seed, success } from "../../../helpers/store/suite-tools.js";
import { recordReferences } from "../../../../src/lib/store/identity.js";
import { nameAsideFile } from "../../../../src/lib/store/projection/aside.js";
import { gitBlobId } from "../../../../src/lib/store/projection/blob-id.js";
import { startProjection, endProjection } from "../../../../src/lib/store/projection/engine.js";
import { createProjectionEnginePorts } from "../../../../src/lib/store/projection/engine-ports.js";
import { PROJECTION_INDEX_FILE, writeProjectionIndex } from "../../../../src/lib/store/projection/index-file.js";
import { refreshMaterializationLinks } from "../../../../src/lib/store/projection/materialization-selection.js";
import { projectionProcessState } from "../../../../src/lib/store/projection/process-state.js";

const binding = vi.hoisted(() => ({ deniedLinkProbe: null as string | null }));
vi.mock("node:fs/promises", async original => {
  const actual = await original<typeof import("node:fs/promises")>();
  const lstat = (async (...args: Parameters<typeof actual.lstat>) => {
    if (binding.deniedLinkProbe !== null && args[0] === binding.deniedLinkProbe) {
      binding.deniedLinkProbe = null;
      throw Object.assign(new Error("Archive destination access refused"), { code: "EACCES" });
    }
    return actual.lstat(...args);
  }) as typeof actual.lstat;
  return { ...actual, lstat, default: { ...actual, lstat } };
});
afterEach(() => { binding.deniedLinkProbe = null; });

it.each([["nested", false], ["link", true], ["absent", false]] as const)(
  "finishes owed archive enumeration after a %s boundary (damaged partition=%s)", async (boundary, damaged) => {
  const h = await archiveRetirementFixture(), { location } = await h.disk();
  const scope = `${h.folder}/owed`, folder = join(h.checkout, scope), path = `${scope}/unindexed.md`;
  const saved = join(h.checkout, "owed-outside-archive");
  await mkdir(folder);
  await writeFile(join(h.checkout, path), "An unindexed edit in the owed directory.\n");
  const headerPath = join(location.stateDir, PROJECTION_INDEX_FILE);
  await rm(headerPath);
  let phase: "deny" | "opaque" | "repaired" = "deny";
  const checkListing = (absolute: string) => {
    if (absolute === folder && phase === "deny") throw Object.assign(new Error("Cannot enumerate"), { code: "EACCES" });
    if (absolute === folder && phase === "opaque") throw new Error("Enumerated a foreign archive subtree");
  };
  const input = { ...h.input, ports: () => ({ ...createProjectionEnginePorts(h.checkout), walkFs: {
    readdir: (absolute: string) => {
      checkListing(absolute);
      return readdirSync(absolute, { withFileTypes: true });
    },
    readdirNames: (absolute: string) => { checkListing(absolute); return readdirSync(absolute); },
  } }) };
  expect((await projectionCommand(input, ["status"])).diagnostics).toContain("EACCES");
  expect((await h.disk()).index).toMatchObject({ archiveDiscoveryPending: [scope], state: null });
  await rename(folder, saved);
  if (boundary === "nested") await mkdir(join(folder, ".git"), { recursive: true });
  if (boundary === "link") await symlink(saved, folder, "junction");
  if (damaged) await removeArchivePartition(headerPath, location.stateDir);
  phase = "opaque";
  const retry = await projectionCommand(input, ["status"]);
  expect(retry.result).toMatchObject({ kind: "ready" });
  const pending = (await h.disk()).index;
  if (boundary === "absent") {
    expect(pending.archiveDiscoveryPending).toBeUndefined();
    expect(pending.state).toBe(success(await h.store.version()));
    return;
  }
  expect(pending).toMatchObject({ archiveDiscoveryPending: [scope], state: null });
  expect(pending.entries[path]).toBeUndefined();
  await rm(folder, { recursive: true });
  await rename(saved, folder);
  phase = "repaired";
  expect((await projectionCommand(input, ["status"])).diagnostics).toContain(`${path}: withheld`);
  const after = (await h.disk()).index;
  expect(after.entries[path]).toMatchObject({ kind: "ownerless", withheld: true });
  expect(after.archiveDiscoveryPending).toBeUndefined();
  expect(after.state).toBe(success(await h.store.version()));
}, 30_000);

it("discharges an owed path proved to be a file when its leaf is now a link", async () => {
  const h = await archiveRetirementFixture(), { location, index } = await h.disk();
  const file = join(h.checkout, h.path), saved = join(h.checkout, "prior-archive-file.md");
  await rename(file, saved);
  await symlink(saved, file, "file");
  await writeProjectionIndex(location, { ...index, archiveDiscoveryPending: [h.path], state: null });
  await projectionCommand(h.input, ["status"]);
  expect((await h.disk()).index.archiveDiscoveryPending).toBeUndefined();
  expect((await lstat(file)).isSymbolicLink()).toBe(true);
}, 30_000);

async function removeArchivePartition(headerPath: string, stateDir: string): Promise<void> {
  const header = JSON.parse(await readFile(headerPath, "utf8")) as { groups: Record<string, { name: string }> };
  const archive = Object.entries(header.groups).find(([key]) => key.startsWith(".arc/completed/"));
  if (archive === undefined) throw new Error("Missing archive partition");
  await rm(join(stateDir, archive[1].name));
}

it.each([false, true])("transfers a missing returned alias to an owed path (damaged partition=%s)", async damaged => {
  const h = await archiveRetirementFixture(), { location, index } = await h.disk();
  const folder = `${h.folder}/returned`, path = `${folder}/unindexed.md`;
  const destination = join(h.checkout, path), boundary = join(h.checkout, folder, ".git");
  const content = "An edit returned before its inventory was published.\n";
  await mkdir(boundary, { recursive: true });
  await writeFile(destination, content);
  const writer = await createProjectionEnginePorts(h.checkout).writer();
  const copy = nameAsideFile({ path, base: gitBlobId("Original.\n", "sha1"), writer, role: "aside" });
  await writeProjectionIndex(location, { ...index, archiveRecoveryCopies: [copy], state: null });
  if (damaged) await removeArchivePartition(join(location.stateDir, PROJECTION_INDEX_FILE), location.stateDir);
  await projectionCommand(h.input, ["status"]);
  const held = (await h.disk()).index;
  expect(held.archiveRecoveryCopies).toBeUndefined();
  expect(held.archiveDiscoveryPending).toEqual([path]);
  expect(held.state).toBeNull();
  expect(held.entries[path]).toBeUndefined();
  await rm(boundary, { recursive: true });
  expect((await projectionCommand(h.input, ["status"])).diagnostics).toContain(`${path}: withheld`);
  expect((await h.disk()).index.entries[path]).toMatchObject({ kind: "ownerless", withheld: true });
  expect(await readFile(destination, "utf8")).toBe(content);
}, 30_000);

it("keeps a walked edit in rebuild discovery after a denied redundant aside is later discarded", async () => {
  const h = await archiveRetirementFixture(), { location } = await h.disk();
  const path = `${h.folder}/present-unindexed.md`, file = join(h.checkout, path);
  const content = "The live unindexed edit.\n", redundant = "An unchanged aside for that destination.\n";
  await writeFile(file, content);
  const writer = { ...await createProjectionEnginePorts(h.checkout).writer(), processInstance: "exited-redundant-writer" };
  const copy = nameAsideFile({ path, writer, role: "aside", base: gitBlobId(redundant, "sha1") });
  const aside = join(h.checkout, copy);
  await mkdir(dirname(aside), { recursive: true });
  await writeFile(aside, redundant);
  await rm(join(location.stateDir, PROJECTION_INDEX_FILE));
  // Typed listing sees the file. The sweep's own destination probe is the first denied operation.
  binding.deniedLinkProbe = file;
  expect((await projectionCommand(h.input, ["status"])).diagnostics).toContain("EACCES");
  const pending = (await h.disk()).index;
  expect(pending.archiveDiscoveryPending).toEqual([path]);
  expect(pending.archiveRecoveryCopies).toEqual([copy]);
  expect(pending.state).toBeNull();
  const next = await projectionCommand(h.input, ["status"]);
  const repaired = (await h.disk()).index;
  expect(next.diagnostics).toContain(`${path}: withheld`);
  expect(repaired.entries[path]).toMatchObject({ kind: "ownerless", withheld: true });
  expect(repaired.archiveDiscoveryPending).toBeUndefined();
  expect(repaired.archiveRecoveryCopies).toBeUndefined();
  expect(repaired.state).toBe(success(await h.store.version()));
  await expect(lstat(aside)).rejects.toMatchObject({ code: "ENOENT" });
  expect(await readFile(file, "utf8")).toBe(content);
});

it("publishes the accessible link recheck when another restored archive leaf loses access", async () => {
  const h = await archiveRetirementFixture();
  const sibling = `${h.folder}/z-restored.md`;
  const companion = recordReferences["work-item/companion"](h.primary.reference.owner, "z-restored.md");
  await seed(h.f, companion, "Another restored file.\n");
  expect(await startProjection(h.input)).toMatchObject({ kind: "ready" });
  const root = projectionProcessState().roots.get(h.checkout);
  if (root === undefined) throw new Error("Missing the sync root");
  const repaired = new Set([h.path, sibling]);
  root.blockedByLink = path => repaired.has(path) ? path : null;
  binding.deniedLinkProbe = join(h.checkout, sibling);
  await refreshMaterializationLinks(root, repaired);
  expect(root.blockedByLink(h.path)).toBeNull();
  expect(root.blockedByLink(sibling)).toBe(sibling);
  expect(root.archiveDiscoveryHolds?.get(sibling)?.reason).toContain("EACCES");
  await endProjection(h.input);
});
