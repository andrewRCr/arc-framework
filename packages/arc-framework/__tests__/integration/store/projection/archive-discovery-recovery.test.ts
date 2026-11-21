/** Archive discovery retries and link observation after sync restoration. */
import { lstat, mkdir, readFile, rm, writeFile } from "node:fs/promises";
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
import { PROJECTION_INDEX_FILE } from "../../../../src/lib/store/projection/index-file.js";
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
