/** Unindexed checkout retirement preserves personal bytes without consulting another checkout. */
import { lstat, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { fixture, retirementFixtureRoots } from "../../../helpers/store/projection-retirement.js";
import { cleanupTempDir } from "../../../helpers/integration.js";
import { writeWorktreeMarker } from "../../../../src/lib/git/worktree-marker.js";
import { createProjectionEnginePorts } from "../../../../src/lib/store/projection/engine-ports.js";
import { overrideEngineStore } from "../../../helpers/store/projection/engine-fixture.js";
import { removeWorktreeCheckout, releaseWorktreeCheckout } from "../../../../src/lib/git/worktree-removal.js";
import { createProjectionRemovalSlots } from "../../../../src/lib/store/projection/removal-slots.js";

afterEach(async () => { for (const root of retirementFixtureRoots.splice(0)) await cleanupTempDir(root); });

async function unindexed() {
  const h = await fixture();
  const checkout = join(h.root, "checkout-residual");
  await h.exec("git", ["worktree", "add", "--detach", checkout, h.baseOid]);
  await writeWorktreeMarker(checkout, { spawnedByArc: true, createdFor: { kind: "branch", ref: "chore/residual" },
    spawningIdentity: "test-user", createdAt: "2026-11-12T00:00:00Z" });
  const personal = join(checkout, ".arc/user/someone-else");
  await mkdir(personal, { recursive: true });
  const slots = createProjectionRemovalSlots({ store: h.store, identity: null });
  return { ...h, checkout, personal, slots };
}

it("refuses a personal file arriving between feasibility and persistence", async () => {
  const h = await unindexed();
  expect(await h.slots.check(h.checkout)).toEqual({ kind: "passes" });
  await writeFile(join(h.personal, "late.md"), "Late saved personal bytes.\n");
  expect(await h.slots.persist(h.checkout)).toMatchObject({ kind: "refused", remedy: {
    text: expect.stringContaining(".arc/user/someone-else/late.md") } });
  expect(await readFile(join(h.personal, "late.md"), "utf8")).toBe("Late saved personal bytes.\n");
});

it("releases an unindexed checkout while retaining its personal files", async () => {
  const h = await unindexed();
  await writeFile(join(h.personal, "retained.md"), "Retain this checkout and its bytes.\n");
  expect(await h.slots.check(h.checkout)).toMatchObject({ kind: "would-refuse" });
  expect(await releaseWorktreeCheckout({ exec: h.exec, checkoutPath: h.checkout, primaryWorktreePath: h.root,
    slots: h.slots })).toEqual({ kind: "released" });
  expect(await readFile(join(h.personal, "retained.md"), "utf8")).toBe("Retain this checkout and its bytes.\n");
});

it("keeps failed personal observations distinct at both retirement boundaries and permits repair", async () => {
  const h = await unindexed();
  let denied = true;
  const slots = createProjectionRemovalSlots({ store: h.store, identity: null, residualFs: { lstat,
    readdir: path => denied ? Promise.reject(new Error(`Cannot enumerate ${path}`)) : readdir(path) } });
  expect(await slots.check(h.checkout)).toMatchObject({ kind: "unobservable", detail: expect.stringContaining("Cannot enumerate") });
  expect(await slots.persist(h.checkout)).toMatchObject({ kind: "refused", remedy: { text: expect.stringContaining("Cannot enumerate") } });
  denied = false;
  expect(await slots.check(h.checkout)).toEqual({ kind: "passes" });
  expect(await slots.persist(h.checkout)).toEqual({ kind: "persisted" });
});

it("keeps empty and machine-local retirement identity-free without reading target configuration", async () => {
  const h = await unindexed(), ports = createProjectionEnginePorts(h.checkout);
  const slots = createProjectionRemovalSlots({ store: h.store, identity: null, ports: () => ({ ...ports,
    exec: (command, args, options) => {
      if (args[0] === "config") throw new Error("Target configuration is unavailable");
      return ports.exec(command, args, options);
    } }) });
  for (const name of ["empty", "machine-local"]) {
    if (name === "machine-local") {
      await mkdir(join(h.personal, ".internal")); await writeFile(join(h.personal, ".internal/state"), "Local state.\n");
    }
    expect(await slots.check(h.checkout)).toEqual({ kind: "passes" });
    expect(await slots.persist(h.checkout)).toEqual({ kind: "persisted" });
    expect(await slots.release(h.checkout, false)).toEqual({ kind: "released" });
  }
});

it("keeps disabled capability outside residual scanning", async () => {
  const h = await unindexed();
  const unexpected = async (): Promise<never> => { throw new Error("Unexpected residual scan"); };
  const disabled = createProjectionRemovalSlots({ store: overrideEngineStore(h.store, { capabilities: { stateOffBranch: false } }),
    identity: null, residualFs: { readdir: unexpected, lstat: unexpected } });
  await writeFile(join(h.personal, "retained.md"), "Legacy personal file.\n");
  expect(await disabled.check(h.checkout)).toEqual({ kind: "passes" });
  expect(await disabled.persist(h.checkout)).toEqual({ kind: "persisted" });
  expect(await disabled.release(h.checkout, false)).toEqual({ kind: "released" });
});

it("prunes a missing folder without invoking projection checks or persistence", async () => {
  const h = await unindexed();
  const unexpected = async (): Promise<never> => { throw new Error("Unexpected projection observation"); };
  await rm(h.checkout, { recursive: true });
  expect(await removeWorktreeCheckout({ exec: h.exec, checkoutPath: h.checkout, primaryWorktreePath: h.root,
    slots: { check: unexpected, persist: unexpected, release: unexpected } })).toEqual({ kind: "pruned" });
});
