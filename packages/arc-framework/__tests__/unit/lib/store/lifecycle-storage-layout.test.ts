import { makeHuskStamp } from "../../../helpers/worktree-husk-fixture.js";
/** Checkout-rooted lifecycle paths use each store's capability and that checkout's claim. */
import { mkdtemp, rm, writeFile, unlink, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { afterEach, expect, it } from "vitest";
import { writeWorktreeMarker, readWorktreeMarkerGeneration, resolveWorktreeMarkerPath, createWorktreeMarkerGeneration,
  replaceWorktreeMarkerGeneration, restoreWorktreeMarkerGeneration, removeWorktreeMarkerGeneration,
  writeWorktreeOwnershipMarker, stampWorktreeHusk, removePrimaryTransientOccupancy,
  type WorktreeMarker } from "../../../../src/lib/git/worktree-marker.js";
import { createDefaultStorePorts, createDefaultRefStorePorts } from "../../../../src/lib/store/default-ports.js";
import { createRefStore, createStore, createReadSourceStore } from "../../../../src/lib/store/create.js";
import { readCheckoutLayoutContext } from "../../../../src/lib/store/checkout-layout.js";
import { workItemArtifactPath } from "../../../../src/lib/store/lifecycle-storage.js";
import { beginProjectionCommand } from "../../../../src/lib/store/projection/process-state.js";
import { startProjection } from "../../../../src/lib/store/projection/engine.js";
import { WorkUnitReadPlacementSchema } from "../../../../src/lib/store/placement.js";

const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); beginProjectionCommand(); });
function claimMarker(claim: string): WorktreeMarker {
  return { spawnedByArc: true, wuName: claim, createdFor: { kind: "work-unit", name: claim, uid: randomUUID() },
    spawningIdentity: "andrew", createdAt: "2026-11-05T00:00:00Z" };
}
async function checkout(claim: string, compose = true) {
  const root = await mkdtemp(join(tmpdir(), "arc-lifecycle-layout-")); roots.push(root);
  await writeWorktreeMarker(root, claimMarker(claim));
  if (compose) createRefStore(createDefaultRefStorePorts({ checkoutRoot: root, backingRepository: async () => null }));
  return root;
}

it.each([
  { slug: "alpha", expected: ".arc/active/current/meta-alpha.md" },
  { slug: "beta", expected: ".arc/active/in-flight/beta/meta-beta.md" },
])("resolves $slug through the store composed for that checkout", async ({ slug, expected }) => {
  const root = await checkout("alpha");
  expect(await workItemArtifactPath(root, slug, "meta", { kind: "active" }, null)).toBe(expected);
});

it("reads the checkout's effective flat layout from its project configuration", async () => {
  const root = await checkout("alpha");
  await writeFile(join(root, ".arc", "system", "arc-config.yml"), "layout.active: flat\n");
  expect(await workItemArtifactPath(root, "alpha", "meta", { kind: "active" }, null)).toBe(".arc/active/meta-alpha.md");
  expect(await workItemArtifactPath(root, "beta", "meta", { kind: "active" }, null)).toBe(".arc/active/in-flight/beta/meta-beta.md");
});

it.each([false, true])("keeps the engine's %s capability over a store composed later in the command", async stateOffBranch => {
  const root = await checkout("alpha"), ports = createDefaultRefStorePorts({ checkoutRoot: root, backingRepository: async () => null });
  const selected = stateOffBranch ? createRefStore(ports) : createStore(createDefaultStorePorts({ checkoutRoot: root }));
  const start = await startProjection({ store: selected, checkout: root });
  expect(start.kind).toBe(stateOffBranch ? "skipped" : "disabled");
  if (stateOffBranch) createStore(createDefaultStorePorts({ checkoutRoot: root })); else createRefStore(ports);
  expect(await workItemArtifactPath(root, "alpha", "meta", { kind: "active" }, null))
    .toBe(stateOffBranch ? ".arc/active/current/meta-alpha.md" : ".arc/active/meta-alpha.md");
});

it.each([false, true])("expires the engine's %s override while retaining the latest composition for the next command", async stateOffBranch => {
  const root = await checkout("alpha"), ports = createDefaultRefStorePorts({ checkoutRoot: root, backingRepository: async () => null });
  const selected = stateOffBranch ? createRefStore(ports) : createStore(createDefaultStorePorts({ checkoutRoot: root }));
  await startProjection({ store: selected, checkout: root });
  if (stateOffBranch) createStore(createDefaultStorePorts({ checkoutRoot: root })); else createRefStore(ports);
  beginProjectionCommand();
  expect(await workItemArtifactPath(root, "alpha", "meta", { kind: "active" }, null))
    .toBe(stateOffBranch ? ".arc/active/meta-alpha.md" : ".arc/active/current/meta-alpha.md");
});

it("keeps one effective layout per root until the next command rereads it", async () => {
  const root = await checkout("alpha");
  expect(await workItemArtifactPath(root, "alpha", "meta", { kind: "active" }, null)).toBe(".arc/active/current/meta-alpha.md");
  await writeFile(join(root, ".arc", "system", "arc-config.yml"), "layout.active: flat\n");
  expect(await workItemArtifactPath(root, "alpha", "meta", { kind: "active" }, null)).toBe(".arc/active/current/meta-alpha.md");
  beginProjectionCommand();
  expect(await workItemArtifactPath(root, "alpha", "meta", { kind: "active" }, null)).toBe(".arc/active/meta-alpha.md");
});

it("rereads the own claim after a marker is written in place during the command", async () => {
  const root = await checkout("alpha");
  expect(await workItemArtifactPath(root, "alpha", "meta", { kind: "active" }, null)).toBe(".arc/active/current/meta-alpha.md");
  await writeWorktreeMarker(root, claimMarker("beta"));
  expect(await workItemArtifactPath(root, "beta", "meta", { kind: "active" }, null)).toBe(".arc/active/current/meta-beta.md");
  expect(await workItemArtifactPath(root, "alpha", "meta", { kind: "active" }, null)).toBe(".arc/active/in-flight/alpha/meta-alpha.md");
});

it.each(["exclusive-create", "replace", "restore", "remove"] as const)("invalidates the cached claim after a successful marker %s", async action => {
  const root = await checkout("alpha");
  const alpha = await readWorktreeMarkerGeneration(root);
  if (alpha.kind !== "present") throw new Error("Expected the fixture's alpha marker");
  await writeWorktreeMarker(root, claimMarker("beta"));
  const beta = await readWorktreeMarkerGeneration(root);
  if (beta.kind !== "present") throw new Error("Expected the fixture's beta marker");
  await writeWorktreeMarker(root, alpha.marker);
  const current = await readWorktreeMarkerGeneration(root);
  if (current.kind !== "present") throw new Error("Expected the restored fixture marker");
  expect(await workItemArtifactPath(root, "alpha", "meta", { kind: "active" }, null)).toBe(".arc/active/current/meta-alpha.md");
  if (action === "exclusive-create") {
    await unlink(resolveWorktreeMarkerPath(root));
    expect((await createWorktreeMarkerGeneration(root, beta.marker)).kind).toBe("created");
  } else if (action === "replace") expect((await replaceWorktreeMarkerGeneration(root, current.bytes, beta.marker)).kind).toBe("replaced");
  else if (action === "restore") expect((await restoreWorktreeMarkerGeneration(root, current.bytes, beta.bytes)).kind).toBe("replaced");
  else expect((await removeWorktreeMarkerGeneration(root, current.bytes)).kind).toBe("removed");
  const slug = action === "remove" ? "alpha" : "beta";
  expect(await workItemArtifactPath(root, slug, "meta", { kind: "active" }, null))
    .toBe(action === "remove" ? ".arc/active/in-flight/alpha/meta-alpha.md" : ".arc/active/current/meta-beta.md");
});

it.each(["ownership", "husk", "primary-release"] as const)("updates path answers after the delegating %s writer", async action => {
  const root = await checkout("alpha");
  const subject = { kind: "errand", slug: "alpha", claimId: "a".repeat(32) } as const;
  if (action === "primary-release") await writeWorktreeMarker(root, { spawnedByArc: false, createdFor: subject,
    provisioning: "ready", spawningIdentity: "andrew", createdAt: "2026-11-05T00:00:00Z" });
  expect(await workItemArtifactPath(root, "alpha", "meta", { kind: "active" }, null)).toBe(".arc/active/current/meta-alpha.md");
  if (action === "ownership") await writeWorktreeOwnershipMarker(root, {
    createdByArc: true, createdFor: { kind: "work-unit", name: "beta", uid: randomUUID() }, spawningIdentity: "andrew" });
  else if (action === "husk") expect((await stampWorktreeHusk(root, makeHuskStamp({
    sha: "a".repeat(40), at: "2026-11-05T00:00:00Z", subject: { kind: "work-unit", name: "alpha" }, branch: "feat/alpha",
  }))).kind).toBe("stamped");
  else expect((await removePrimaryTransientOccupancy(root, subject)).kind).toBe("removed");
  const slug = action === "ownership" ? "beta" : "alpha";
  expect(await workItemArtifactPath(root, slug, "meta", { kind: "active" }, null))
    .toBe(action === "ownership" ? ".arc/active/current/meta-beta.md" : ".arc/active/in-flight/alpha/meta-alpha.md");
});

it("rereads layout facts when composition changes the root's effective backend", async () => {
  const root = await checkout("alpha"), ports = createDefaultRefStorePorts({ checkoutRoot: root, backingRepository: async () => null });
  expect(await workItemArtifactPath(root, "alpha", "meta", { kind: "active" }, null)).toBe(".arc/active/current/meta-alpha.md");
  createStore(createDefaultStorePorts({ checkoutRoot: root }));
  expect(await workItemArtifactPath(root, "alpha", "meta", { kind: "active" }, null)).toBe(".arc/active/meta-alpha.md");
  await writeFile(join(root, ".arc", "system", "arc-config.yml"), "layout.active: flat\n");
  createRefStore(ports);
  expect(await workItemArtifactPath(root, "alpha", "meta", { kind: "active" }, null)).toBe(".arc/active/meta-alpha.md");
});

it.each(["unrecorded", "in-repo", "read-source"] as const)("keeps %s path resolution independent of marker and config files", async mode => {
  const root = await checkout("alpha", false), ports = createDefaultRefStorePorts({ checkoutRoot: root, backingRepository: async () => null });
  if (mode !== "unrecorded") createStore(createDefaultStorePorts({ checkoutRoot: root }));
  if (mode === "read-source") createReadSourceStore(ports, "upstream");
  await writeFile(resolveWorktreeMarkerPath(root), "not marker JSON");
  await writeFile(join(root, ".arc", "system", "arc-config.yml"), "branch.protection: invalid\n");
  expect(await workItemArtifactPath(root, "alpha", "meta", { kind: "active" }, null)).toBe(".arc/active/meta-alpha.md");
});

it.each([
  { placement: { kind: "backlog", commitment: "planned" }, cohort: "tools", expected: ".arc/backlog/planned/tools/alpha/meta-alpha.md" },
  { placement: { kind: "completed", quarter: "2026-q4", sequence: "03" }, cohort: null, expected: ".arc/completed/2026-q4/03_alpha/meta-alpha.md" },
])("resolves $placement.kind without reading checkout claim or configuration", async ({ placement, cohort, expected }) => {
  const root = await checkout("alpha");
  await writeFile(resolveWorktreeMarkerPath(root), "not marker JSON");
  await writeFile(join(root, ".arc", "system", "arc-config.yml"), "branch.protection: invalid\n");
  expect(await workItemArtifactPath(root, "alpha", "meta", WorkUnitReadPlacementSchema.parse(placement), cohort)).toBe(expected);
});

it("keeps two checkout roots' cached claims separate within one process", async () => {
  const alpha = await checkout("alpha"), beta = await checkout("beta");
  expect(await workItemArtifactPath(alpha, "alpha", "meta", { kind: "active" }, null)).toBe(".arc/active/current/meta-alpha.md");
  expect(await workItemArtifactPath(beta, "beta", "meta", { kind: "active" }, null)).toBe(".arc/active/current/meta-beta.md");
  expect(await workItemArtifactPath(alpha, "beta", "meta", { kind: "active" }, null)).toBe(".arc/active/in-flight/beta/meta-beta.md");
});

it("replaces cached coordinates with a fresh read at a projection lease boundary", async () => {
  const root = await checkout("alpha");
  expect(await workItemArtifactPath(root, "alpha", "meta", { kind: "active" }, null)).toBe(".arc/active/current/meta-alpha.md");
  // An external process does not send this process's marker notification.
  await writeFile(resolveWorktreeMarkerPath(root), JSON.stringify(claimMarker("beta")));
  expect(await readCheckoutLayoutContext(root, { fresh: true })).toEqual({ claim: "beta", layoutActive: "nested" });
  expect(await workItemArtifactPath(root, "beta", "meta", { kind: "active" }, null)).toBe(".arc/active/current/meta-beta.md");
});

it.each(["malformed", "manual-only"] as const)("refuses a %s marker and succeeds after its claim is repaired", async condition => {
  const root = await checkout("alpha");
  if (condition === "malformed") await writeFile(resolveWorktreeMarkerPath(root), "not JSON");
  else await writeWorktreeMarker(root, { spawnedByArc: true, createdFor: { kind: "errand", slug: "alpha", claimId: "a".repeat(32) }, provisioning: "future", spawningIdentity: "andrew", createdAt: "2026-11-05T00:00:00Z" });
  await expect(workItemArtifactPath(root, "alpha", "meta", { kind: "active" }, null)).rejects.toMatchObject({
    code: "store.layout-marker-invalid", message: expect.stringMatching(/repair.*retry/iu),
  });
  await writeWorktreeMarker(root, claimMarker("alpha"));
  expect(await workItemArtifactPath(root, "alpha", "meta", { kind: "active" }, null)).toBe(".arc/active/current/meta-alpha.md");
});

it("reports unreadable configuration with a remedy and succeeds after repair", async () => {
  const root = await checkout("alpha"), config = join(root, ".arc", "system", "arc-config.yml");
  await mkdir(config);
  await expect(workItemArtifactPath(root, "alpha", "meta", { kind: "active" }, null)).rejects.toMatchObject({
    code: "store.layout-config-invalid", message: expect.stringMatching(/readable.*retry/iu),
  });
  await rm(config, { recursive: true });
  await writeFile(config, "layout.active: flat\n");
  expect(await workItemArtifactPath(root, "alpha", "meta", { kind: "active" }, null)).toBe(".arc/active/meta-alpha.md");
});

it("reports unreadable marker bytes with a remedy and succeeds after repair", async () => {
  const root = await checkout("alpha"), marker = resolveWorktreeMarkerPath(root);
  await unlink(marker); await mkdir(marker);
  await expect(workItemArtifactPath(root, "alpha", "meta", { kind: "active" }, null)).rejects.toMatchObject({
    code: "store.layout-marker-unreadable", message: expect.stringMatching(/marker.*repair.*retry/iu),
  });
  await rm(marker, { recursive: true });
  await writeWorktreeMarker(root, claimMarker("alpha"));
  expect(await workItemArtifactPath(root, "alpha", "meta", { kind: "active" }, null)).toBe(".arc/active/current/meta-alpha.md");
});
