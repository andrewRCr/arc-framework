/** Delayed filesystem reads cannot replace newer checkout layout observations. */
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { readCheckoutLayoutContext } from "../../../../src/lib/store/checkout-layout.js";
import { workItemArtifactPath } from "../../../../src/lib/store/lifecycle-storage.js";
import { createRefStore } from "../../../../src/lib/store/create.js";
import { createDefaultRefStorePorts } from "../../../../src/lib/store/default-ports.js";
import { beginProjectionCommand } from "../../../../src/lib/store/projection/process-state.js";
import { writeWorktreeMarker, resolveWorktreeMarkerPath, type WorktreeMarker } from "../../../../src/lib/git/worktree-marker.js";

const boundary = vi.hoisted(() => ({ readFile: vi.fn() }));
vi.mock("node:fs/promises", async importOriginal => ({
  ...await importOriginal<typeof import("node:fs/promises")>(), readFile: boundary.readFile,
}));
const native = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
function resetMockDefaults(): void { boundary.readFile.mockImplementation(native.readFile); }
beforeEach(() => { vi.resetAllMocks(); resetMockDefaults(); beginProjectionCommand(); });
const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); beginProjectionCommand(); });
function marker(name: string): WorktreeMarker {
  return { spawnedByArc: true, wuName: name, createdFor: { kind: "work-unit", name, uid: randomUUID() },
    spawningIdentity: "andrew", createdAt: "2026-11-05T00:00:00Z" };
}
async function checkout() {
  const root = await mkdtemp(join(tmpdir(), "arc-layout-race-")); roots.push(root);
  await writeWorktreeMarker(root, marker("alpha"));
  createRefStore(createDefaultRefStorePorts({ checkoutRoot: root, backingRepository: async () => null }));
  return root;
}
function deferred() {
  let release = (): void => { throw new Error("Deferred promise has no resolver"); };
  const promise = new Promise<void>(resolve => { release = resolve; });
  return { promise, release };
}

it("keeps a fresh lease observation when an older read succeeds later", async () => {
  const root = await checkout(), captured = deferred(), resume = deferred();
  boundary.readFile.mockImplementationOnce(async (...args: Parameters<typeof native.readFile>) => {
    const bytes = await native.readFile(...args); captured.release(); await resume.promise; return bytes;
  });
  const older = readCheckoutLayoutContext(root);
  await captured.promise;
  await writeFile(resolveWorktreeMarkerPath(root), JSON.stringify(marker("beta")));
  expect(await readCheckoutLayoutContext(root, { fresh: true })).toMatchObject({ claim: "beta" });
  resume.release();
  expect(await older).toMatchObject({ claim: "alpha" });
  expect(await workItemArtifactPath(root, "beta", "meta", { kind: "active" }, null)).toBe(".arc/active/current/meta-beta.md");
});

it("keeps a fresh lease observation when an older read rejects later", async () => {
  const root = await checkout(), captured = deferred(), resume = deferred();
  boundary.readFile.mockImplementationOnce(async () => {
    captured.release(); await resume.promise; throw Object.assign(new Error("Marker read denied"), { code: "EACCES" });
  });
  const older = readCheckoutLayoutContext(root);
  const refused = expect(older).rejects.toMatchObject({ code: "store.layout-marker-unreadable" });
  await captured.promise;
  await writeFile(resolveWorktreeMarkerPath(root), JSON.stringify(marker("beta")));
  expect(await readCheckoutLayoutContext(root, { fresh: true })).toMatchObject({ claim: "beta" });
  await writeFile(resolveWorktreeMarkerPath(root), JSON.stringify(marker("gamma")));
  resume.release(); await refused;
  expect(await workItemArtifactPath(root, "beta", "meta", { kind: "active" }, null)).toBe(".arc/active/current/meta-beta.md");
});
