/** Production slot composition preserves target eligibility and command identity authority. */
import { afterEach, describe, expect, it } from "vitest";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { cleanupTempDir } from "../helpers/integration.js";
import { projectedRetirement, retirementFixtureRoots as roots } from "../helpers/store/projection-retirement.js";
import { createProjectionRemovalSlots } from "../../src/lib/store/projection/removal-slots.js";
import { resolveWorktreeMarkerPath } from "../../src/lib/git/worktree-marker.js";
import { PROJECTION_INDEX_FILE } from "../../src/lib/store/projection/index-file.js";
import { createProjectionEnginePorts } from "../../src/lib/store/projection/engine-ports.js";
import { createLifecycleHarness, lifecycleSuccess } from "../helpers/store/lifecycle-harness.js";
import { startProjection } from "../../src/lib/store/projection/engine.js";
import { mintProjectionStub } from "../../src/handlers/projection-stub.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { SlugSchema } from "../../src/lib/kernel/index.js";
import { createStoreTeardownContext } from "../../src/lib/work-unit/store-teardown-context.js";
import { createUserIOContext } from "../../src/lib/io-context.js";
import { makeGitExecInput } from "../helpers/integration.js";
import { createRefusingStore } from "../helpers/store/projection/refusing-store.js";
import { parseStampedFile } from "../../src/lib/store/projection/stamp.js";
import { readWorktreeMarker } from "../../src/lib/git/worktree-marker.js";
import { buildExecutorContext } from "../../src/lib/work-unit/executor-context.js";

afterEach(async () => { for (const root of roots.splice(0)) await cleanupTempDir(root); });

async function prospectiveMetadata(h: Awaited<ReturnType<typeof projectedRetirement>>): Promise<string> {
  const path = ".arc/backlog/planned/beta/meta-beta.md";
  const authored = makeMetaFixture("beta", { state: "Planning", owner: "test-user", workClass: "Light", priority: "P1",
    currentWorkflow: "draft-design", nextTask: "Keep this authored task." }) + "\nPreserve the authored research.\n";
  await mkdir(join(h.checkout, ".arc/backlog/planned/beta"), { recursive: true });
  await writeFile(join(h.checkout, path), authored);
  return path;
}

describe("bound projection removal slots", () => {
  it("keeps a refused edit through the production executor and removes after repair", async () => {
    const h = await projectedRetirement();
    const authored = "A save held through executor removal.\n";
    const refusing = createRefusingStore(h.store);
    refusing.refuse("batch", { code: "version-conflict", cause: "projection-admission", class: "recoverable",
      records: [h.record.reference], condition: "Content admission is held.",
      remedy: { text: "Retry executor admission after repair." } });
    const io = { ...createUserIOContext(), exec: h.exec, execInput: makeGitExecInput(h.root) };
    const executor = buildExecutorContext({ cwd: h.root, io, store: refusing.store, identity: "test-user",
      projectId: async () => "repo", teamMode: false, internalTemplateDir: "/templates" });
    const subject = h.marker.createdFor;
    if (subject === undefined) throw new Error("The retirement fixture needs its exact subject.");
    const remove = () => executor.reconcileWorkUnitWorktree({ mutation: "teardown", worktreePath: h.checkout,
      currentLocus: h.root, subject });
    await h.edit(authored);
    await expect(remove()).rejects.toThrow("Retry executor admission after repair");
    expect(parseStampedFile(await readFile(join(h.checkout, h.path), "utf8")).content).toBe(authored);
    expect(await readWorktreeMarker(h.checkout)).toMatchObject({ kind: "present", marker: { wuName: "demo" } });
    refusing.refuse("batch", null);
    expect(await remove()).toMatchObject({ mutation: "teardown", worktreePath: h.checkout });
    expect(lifecycleSuccess(await h.store.read({ reference: h.record.reference })).content).toBe(authored);
    expect((await h.exec("git", ["worktree", "list", "--porcelain"])).stdout).not.toContain(h.checkout);
  });

  it("keeps a refused edit through the production Store teardown context and removes after repair", async () => {
    const h = await projectedRetirement();
    const authored = "A save held at the Store boundary.\n";
    const refusing = createRefusingStore(h.store);
    refusing.refuse("batch", { code: "version-conflict", cause: "projection-admission", class: "recoverable",
      records: [h.record.reference], condition: "Content admission is held.",
      remedy: { text: "Retry the held content admission after repair." } });
    const io = { ...createUserIOContext(), exec: h.exec, execInput: makeGitExecInput(h.root) };
    Object.assign(h.ctx, createStoreTeardownContext({ cwd: h.root, identity: "test-user", io },
      { ...h.executor, store: refusing.store }));
    await h.edit(authored);
    expect(await h.remove()).toMatchObject({ status: "rejected", reason: expect.stringContaining("Retry the held content admission") });
    expect(parseStampedFile(await readFile(join(h.checkout, h.path), "utf8")).content).toBe(authored);
    expect(await readWorktreeMarker(h.checkout)).toMatchObject({ kind: "present", marker: { wuName: "demo" } });
    expect((await h.exec("git", ["worktree", "list", "--porcelain"])).stdout).toContain(h.checkout);
    refusing.refuse("batch", null);
    expect(await h.remove()).toMatchObject({ status: "torn-down", worktreeRemoved: h.checkout });
    expect(lifecycleSuccess(await h.store.read({ reference: h.record.reference })).content).toBe(authored);
    expect((await h.exec("git", ["worktree", "list", "--porcelain"])).stdout).not.toContain(h.checkout);
  });

  it("uses an explicit retirement minter ahead of the command's policy", async () => {
    const h = await projectedRetirement();
    expect(await startProjection({ checkout: h.root, store: h.store, skipProjection: true,
      mint: () => Promise.resolve({ kind: "refused", mark: { reason: "normal-projection-policy",
        remedy: { text: "The normal projection minter is unavailable." } } }),
    })).toMatchObject({ kind: "skipped" });
    const path = await prospectiveMetadata(h);
    const slots = createProjectionRemovalSlots({ store: h.store, identity: "test-user", mint: mintProjectionStub });
    expect(await slots.persist(h.checkout)).toEqual({ kind: "persisted" });
    const found = lifecycleSuccess(await h.store.lookup({ kind: "slug", slug: SlugSchema.parse("beta") }));
    expect(lifecycleSuccess(await h.store.read({ reference: found.reference })).content).toContain("Preserve the authored research.");
    expect(await readFile(join(h.checkout, path), "utf8")).toContain("Preserve the authored research.");
  });

  it("does not inherit a previous command's minter when the next command supplies none", async () => {
    const h = await projectedRetirement();
    expect(await startProjection({ checkout: h.root, store: h.store, skipProjection: true, mint: mintProjectionStub })).toMatchObject({ kind: "skipped" });
    expect(await startProjection({ checkout: h.root, store: h.store, skipProjection: true })).toMatchObject({ kind: "skipped" });
    const path = await prospectiveMetadata(h);
    const slots = createProjectionRemovalSlots({ store: h.store, identity: "test-user" });
    expect(await slots.persist(h.checkout)).toMatchObject({ kind: "refused", remedy: { text: expect.stringContaining("Run arc stub beta") } });
    expect(await h.store.lookup({ kind: "slug", slug: SlugSchema.parse("beta") })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
    expect(await readFile(join(h.checkout, path), "utf8")).toContain("Preserve the authored research.");
  });

  it("retains the command's minter across automatic-projection bypass and mints into the retiring Store", async () => {
    const h = await projectedRetirement();
    const command = createLifecycleHarness();
    expect(await startProjection({ checkout: h.root, store: command.store, skipProjection: true, mint: mintProjectionStub }))
      .toMatchObject({ kind: "skipped" });
    const path = await prospectiveMetadata(h);
    const slots = createProjectionRemovalSlots({ store: h.store, identity: "test-user" });
    expect(await slots.persist(h.checkout)).toEqual({ kind: "persisted" });
    const found = lifecycleSuccess(await h.store.lookup({ kind: "slug", slug: SlugSchema.parse("beta") }));
    const record = lifecycleSuccess(await h.store.read({ reference: found.reference }));
    expect(record.reference.owner).toMatchObject({ type: "work-item", name: "beta", uid: expect.any(String) });
    expect(record.content).toContain("Preserve the authored research.");
    expect(record.content).toContain("Keep this authored task.");
    expect(await command.store.lookup({ kind: "slug", slug: SlugSchema.parse("beta") })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
    expect(await readFile(join(h.checkout, path), "utf8")).toContain("Preserve the authored research.");
  });

  it.each([null, "# unavailable"])("passes an unprojected checkout before consulting command identity %s", async identity => {
    const h = await projectedRetirement();
    await rm(resolveWorktreeMarkerPath(h.checkout));
    await rm(join(h.checkout, h.path));
    await rm(join(h.location.stateDir, PROJECTION_INDEX_FILE));
    await h.exec("git", ["config", "--unset-all", "arc.identity"], { cwd: h.checkout });
    await h.exec("git", ["config", "user.name", ""], { cwd: h.checkout });
    const slots = createProjectionRemovalSlots({ store: h.store, identity });
    expect(await slots.check(h.checkout)).toEqual({ kind: "passes" });
    expect(await slots.persist(h.checkout)).toEqual({ kind: "persisted" });
    expect(await slots.release(h.checkout, false)).toEqual({ kind: "released" });
  });

  it.each([null, "# unavailable"])("keeps a configured target when command identity %s is unavailable", async identity => {
    const h = await projectedRetirement();
    await h.edit("An edit without command authority.\n");
    const slots = createProjectionRemovalSlots({ store: h.store, identity, ports: checkout => ({
      ...createProjectionEnginePorts(checkout), actor: () => Promise.reject(new Error("Unexpected actor creation.")),
    }) });
    expect(await slots.check(h.checkout)).toMatchObject({ kind: "unobservable", detail: expect.stringContaining("no resolved identity") });
    for (const result of [await slots.persist(h.checkout), await slots.release(h.checkout, false)]) {
      expect(result).toMatchObject({ kind: "refused", remedy: { text: expect.stringContaining("Run removal or release from that checkout") } });
    }
    expect(lifecycleSuccess(await h.store.read({ reference: h.record.reference })).version).toBe(h.record.version);
    expect(await readFile(join(h.checkout, h.path), "utf8")).toContain("An edit without command authority.");
  });

  it("names the target's configuration remedy before absent command authority", async () => {
    const h = await projectedRetirement();
    await h.exec("git", ["config", "--unset-all", "arc.identity"], { cwd: h.checkout });
    await h.exec("git", ["config", "user.name", ""], { cwd: h.checkout });
    const slots = createProjectionRemovalSlots({ store: h.store, identity: null });
    expect(await slots.check(h.checkout)).toMatchObject({ kind: "would-refuse", remedy: { text: expect.stringContaining("git config --local arc.identity") } });
    expect(await slots.persist(h.checkout)).toMatchObject({ kind: "refused", remedy: { text: expect.stringContaining("git config --local arc.identity") } });
    expect(await slots.release(h.checkout, false)).toMatchObject({ kind: "refused", remedy: { text: expect.stringContaining("git config --local arc.identity") } });
  });
});
