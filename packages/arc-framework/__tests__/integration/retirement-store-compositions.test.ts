/** Registered lifecycle commands preserve projected edits through their production compositions. */
import { afterEach, expect, it, vi } from "vitest";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Store } from "../../src/lib/store/contract.js";
import { RecordReferenceSchema } from "../../src/lib/store/identity.js";
import { projectedRetirement, retirementFixtureRoots as roots } from "../helpers/store/projection-retirement.js";
import { cleanupTempDir } from "../helpers/integration.js";
import { dispatchRegisteredCli } from "../helpers/registered-cli.js";
import { readWorktreeMarker, writeWorktreeMarker, ensureWorktreeMarkerIgnored, nodeWorktreeMarkerIgnoreFs } from "../../src/lib/git/worktree-marker.js";
import { lifecycleSuccess } from "../helpers/store/lifecycle-harness.js";
import { recordReferences } from "../../src/lib/store/identity.js";
import { renderMetaFile } from "../../src/lib/store/kinds/meta/writers.js";
import { recordPut } from "../../src/lib/store/lifecycle-write.js";
import { CutMapMachineSchema } from "../../src/lib/decompose/cut-map-machine.js";
import { completeCutMapFixture } from "../fixtures/decompose-v4.js";
import { DecomposeFinishAppliedSchema, DecomposeRetirementPreviewSchema } from "../../src/lib/decompose/finish-report.js";

import { seedProjection } from "../helpers/store/projection/seeded-projection.js";
import { SlugSchema } from "../../src/lib/kernel/index.js";
import { renderStampedFile } from "../../src/lib/store/projection/stamp.js";

const binding = vi.hoisted(() => ({ store: null as Store | null }));
vi.mock("../../src/lib/store/create.js", async importOriginal => {
  const original = await importOriginal<typeof import("../../src/lib/store/create.js")>();
  return { ...original, createStore: (...args: Parameters<typeof original.createStore>) =>
    binding.store ?? original.createStore(...args) };
});
afterEach(async () => { binding.store = null; for (const root of roots.splice(0)) await cleanupTempDir(root); });
const repository = "34567890-1234-4234-8234-123456789abc";

async function fixture(ended = true, primary = false) {
  const h = await projectedRetirement("Original prose.\n", "md", { ended, repository });
  await h.seed(RecordReferenceSchema.parse({ kind: "project-registry/identity", owner: { type: "project", name: "project", uid: repository } }),
    JSON.stringify({ projectId: repository }));
  await mkdir(join(h.root, ".arc/system"), { recursive: true });
  await writeFile(join(h.root, ".arc/system/arc-config.yml"), "branch.base: main\nbranch.protection: partial\nsession.remote_sync: disabled\n");
  await h.exec("git", ["add", ".arc/system/arc-config.yml"]);
  await h.exec("git", ["commit", "-m", "Configure lifecycle commands"]);
  let checkout = h.checkout;
  if (primary) {
    await h.exec("git", ["worktree", "remove", checkout]);
    checkout = h.root;
    await ensureWorktreeMarkerIgnored(checkout, h.exec, nodeWorktreeMarkerIgnoreFs);
    await writeWorktreeMarker(checkout, { ...h.marker, spawnedByArc: false });
    await seedProjection({ checkout, store: h.store, identity: SlugSchema.parse("test-user"),
      files: [{ path: h.path, reference: h.record.reference }] });
  }
  const held = join(checkout, ".arc/user/blair/scratch/held.md"), authored = "An edit belonging to the previous identity.\n";
  await mkdir(join(checkout, ".arc/user/blair/scratch"), { recursive: true });
  await writeFile(held, authored);
  await writeFile(join(checkout, h.path), renderStampedFile({ content: "A current identity's saved edit.\n", stamp: h.entry.base.blob }));
  return { ...h, checkout, held, authored };
}

async function invoke(h: Awaited<ReturnType<typeof fixture>>, argv: readonly string[]) {
  const cwd = process.cwd(), exit = process.exitCode;
  let output = "";
  const capture = (chunk: string | Uint8Array) => { output += String(chunk); return true; };
  const stdout = vi.spyOn(process.stdout, "write").mockImplementation(capture);
  const stderr = vi.spyOn(process.stderr, "write").mockImplementation(capture);
  try {
    binding.store = h.store; process.chdir(h.root); process.exitCode = undefined;
    await dispatchRegisteredCli(["--no-input", "--skip-projection", ...argv]);
    return { output, exitCode: process.exitCode ?? 0 };
  } finally { binding.store = null; stdout.mockRestore(); stderr.mockRestore(); process.chdir(cwd); process.exitCode = exit; }
}

it("retains an operand teardown's checkout and refused edit, then persists and removes after repair", async () => {
  const h = await fixture();
  const marker = await readWorktreeMarker(h.checkout);
  const refused = await invoke(h, ["teardown", "demo"]);
  expect(refused, refused.output).toMatchObject({ exitCode: 1, output: expect.stringContaining("blair") });
  expect(await readFile(h.held, "utf8")).toBe(h.authored);
  expect(await readWorktreeMarker(h.checkout)).toEqual(marker);
  expect((await h.exec("git", ["worktree", "list", "--porcelain"])).stdout).toContain(h.checkout);
  await rm(h.held);
  const repaired = await invoke(h, ["teardown", "demo"]);
  expect(repaired, repaired.output).toMatchObject({ exitCode: 0 });
  expect((await h.exec("git", ["worktree", "list", "--porcelain"])).stdout).not.toContain(h.checkout);
  expect(lifecycleSuccess(await h.store.read({ reference: h.record.reference })).content).toBe("A current identity's saved edit.\n");
}, 30_000);

it("retains a branch teardown's indexed checkout and refused edit, then removes after repair", async () => {
  const h = await fixture();
  await h.exec("git", ["switch", "-c", "chore/cleanup", "main"], { cwd: h.checkout });
  await writeWorktreeMarker(h.checkout, { spawnedByArc: true, createdFor: { kind: "branch", ref: "chore/cleanup" },
    spawningIdentity: "test-user", createdAt: new Date(0).toISOString() });
  const refused = await invoke(h, ["teardown", "--branch", "chore/cleanup"]);
  expect(refused, refused.output).toMatchObject({ exitCode: 1, output: expect.stringContaining("blair") });
  expect(await readFile(h.held, "utf8")).toBe(h.authored);
  expect((await h.exec("git", ["worktree", "list", "--porcelain"])).stdout).toContain(h.checkout);
  await rm(h.held);
  const repaired = await invoke(h, ["teardown", "--branch", "chore/cleanup"]);
  expect(repaired, repaired.output).toMatchObject({ exitCode: 0 });
  expect((await h.exec("git", ["worktree", "list", "--porcelain"])).stdout).not.toContain(h.checkout);
  expect(lifecycleSuccess(await h.store.read({ reference: h.record.reference })).content).toBe("A current identity's saved edit.\n");
}, 30_000);

it("retains a Store abandonment's primary, claim, and refused edit, then abandons after repair", async () => {
  const h = await fixture(false), marker = await readWorktreeMarker(h.checkout);
  const refused = await invoke(h, ["abandon", "demo", "--yes"]);
  expect(refused, refused.output).toMatchObject({ exitCode: 1, output: expect.stringContaining("blair") });
  expect(await readFile(h.held, "utf8")).toBe(h.authored);
  expect(await readWorktreeMarker(h.checkout)).toEqual(marker);
  expect(await h.store.read({ reference: h.meta.reference })).toMatchObject({ status: "ok", result: { version: h.meta.version } });
  await rm(h.held);
  const repaired = await invoke(h, ["abandon", "demo", "--yes"]);
  expect(repaired, repaired.output).toMatchObject({ exitCode: 0 });
  expect(await h.store.read({ reference: h.meta.reference })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
  expect((await h.exec("git", ["worktree", "list", "--porcelain"])).stdout).not.toContain(h.checkout);
  expect(lifecycleSuccess(await h.store.read({ reference: h.record.reference })).content).toBe("A current identity's saved edit.\n");
}, 30_000);

it.each([false, true])("retains a Store decomposition's origin and refused edit, then finishes after repair, primary=%s", async isPrimary => {
  const h = await fixture(false, isPrimary), marker = await readWorktreeMarker(h.checkout);
  if (isPrimary) await writeFile(join(h.root, "personal.txt"), "Retained personal content.");
  lifecycleSuccess(await h.store.write({ ...recordPut(h.meta, { content: renderMetaFile("demo", { state: "Planning",
    owner: "test-user", workClass: "Light", currentWorkflow: "draft-design", design: ["draft-demo.md"] }) }),
    provenance: { verb: "seed-lifecycle", lifecycleAction: "edit" } }));
  await h.seed(recordReferences["work-item/draft"](h.meta.reference.owner), "# Demo\n\n## Scope\n\nPreserve the owned work.\n");
  const preflight = await invoke(h, ["decompose", "demo", "--preflight"]);
  expect(preflight, preflight.output).toMatchObject({ exitCode: 0 });
  const starter = JSON.parse(preflight.output) as { machine: unknown };
  const map = completeCutMapFixture(CutMapMachineSchema.parse(starter.machine));
  await writeFile(join(h.root, "cut.json"), JSON.stringify(map));
  const additive = await invoke(h, ["decompose", "demo", "--execute", "cut.json"]);
  expect(additive, additive.output).toMatchObject({ exitCode: 0 });
  const primary = lifecycleSuccess(await h.store.read({ reference: h.meta.reference }));
  const refused = await invoke(h, ["decompose", "demo", "--finish"]);
  expect(refused, refused.output).toMatchObject({ exitCode: 1, output: expect.stringContaining("blair") });
  expect(await readFile(h.held, "utf8")).toBe(h.authored);
  expect(await readWorktreeMarker(h.checkout)).toEqual(marker);
  expect(await h.store.read({ reference: primary.reference })).toEqual({ status: "ok", result: primary });
  await rm(h.held);
  const repaired = await invoke(h, ["decompose", "demo", "--finish"]);
  expect(repaired, repaired.output).toMatchObject({ exitCode: 0 });
  const preview = DecomposeRetirementPreviewSchema.parse(JSON.parse(repaired.output));
  const applied = await invoke(h, ["decompose", "demo", "--finish", "--apply", preview.applyAuthority]);
  expect(applied, applied.output).toMatchObject({ exitCode: 0 });
  expect(DecomposeFinishAppliedSchema.parse(JSON.parse(applied.output)).continuation).toBeUndefined();
  expect(await h.store.read({ reference: primary.reference })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
  if (isPrimary) {
    expect(await readFile(join(h.root, "personal.txt"), "utf8")).toBe("Retained personal content.");
    expect(await readWorktreeMarker(h.checkout)).toEqual({ kind: "absent" });
    expect((await h.exec("git", ["worktree", "list", "--porcelain"])).stdout).toContain(h.checkout);
  } else expect((await h.exec("git", ["worktree", "list", "--porcelain"])).stdout).not.toContain(h.checkout);
  expect(lifecycleSuccess(await h.store.read({ reference: h.record.reference })).content).toBe("A current identity's saved edit.\n");
}, 30_000);
