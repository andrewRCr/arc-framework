/** Registered Errand exits retain projected primary edits before clearing their claims. */
import { afterEach, expect, it, vi } from "vitest";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Store } from "../../src/lib/store/contract.js";
import { OwnerIdentitySchema, recordReferences } from "../../src/lib/store/identity.js";
import { SlugSchema } from "../../src/lib/kernel/index.js";
import { createTempRepo, cleanupTempDir, makeGitExec, makeGitExecInput } from "../helpers/integration.js";
import { createLifecycleHarness, lifecycleSuccess } from "../helpers/store/lifecycle-harness.js";
import { dispatchRegisteredCli } from "../helpers/registered-cli.js";
import { seedProjection } from "../helpers/store/projection/seeded-projection.js";
import { renderStampedFile } from "../../src/lib/store/projection/stamp.js";
import { readWorktreeMarker, resolveWorktreeMarkerPath } from "../../src/lib/git/worktree-marker.js";
import { PROJECTION_INDEX_FILE } from "../../src/lib/store/projection/index-file.js";

import { closeOrdinaryErrandAtRuntime } from "../../src/lib/errand/close-runtime.js";
import { runDerivedLocusStateProbe } from "../../src/handlers/derived-locus-state-probe.js";
import { createProjectionRemovalSlots } from "../../src/lib/store/projection/removal-slots.js";

const binding = vi.hoisted(() => ({ store: null as Store | null }));
vi.mock("../../src/lib/store/create.js", async importOriginal => {
  const original = await importOriginal<typeof import("../../src/lib/store/create.js")>();
  return { ...original, createStore: (...args: Parameters<typeof original.createStore>) =>
    binding.store ?? original.createStore(...args) };
});
const roots: string[] = [];
afterEach(async () => { binding.store = null; for (const root of roots.splice(0)) await cleanupTempDir(root); });

async function fixture(protection: "full" | "partial" = "full") {
  const root = await createTempRepo(); roots.push(root);
  const exec = makeGitExec(root), h = createLifecycleHarness();
  await exec("git", ["branch", "-M", "main"]);
  await exec("git", ["config", "arc.identity", "test-user"]);
  await mkdir(join(root, ".arc/system"), { recursive: true });
  await mkdir(join(root, ".arc/user"), { recursive: true });
  await writeFile(join(root, ".arc/system/arc-config.yml"), `branch.base: main\nbranch.protection: ${protection}\nsession.remote_sync: disabled\n`);
  await writeFile(join(root, ".gitignore"), ".arc/user/*/\n");
  await writeFile(join(root, ".arc/user/.npmignore"), "*\n");
  await exec("git", ["add", "."]); await exec("git", ["commit", "-m", "Initialize Errand projection fixture"]);
  await exec("git", ["init", "--bare", join(root, ".git/origin.git")]);
  await exec("git", ["remote", "add", "origin", join(root, ".git/origin.git")]);
  await exec("git", ["push", "-u", "origin", "main"]);
  const projectId = "34567890-1234-4234-8234-123456789abc";
  await h.seed(recordReferences["project-registry/identity"](OwnerIdentitySchema.parse({ type: "project", name: "project", uid: projectId })),
    JSON.stringify({ projectId }));
  await writeFile(join(root, ".git/info/exclude"), ".arc/active/\n.arc/backlog/\n.arc/completed/\n.arc/system/.local/\n");
  const record = await h.seed(recordReferences["personal/document"](OwnerIdentitySchema.parse({ type: "person", name: "test-user" }), "scratch/primary.md"),
    "Original personal prose.\n");
  const path = ".arc/user/test-user/scratch/primary.md";
  const projection = await seedProjection({ checkout: root, store: h.store, identity: SlugSchema.parse("test-user"),
    files: [{ path, reference: record.reference }] });
  const entry = projection.index.entries[path];
  if (entry?.kind !== "record") throw new Error("No seeded primary record.");
  return { ...h, ...projection, root, exec, record, path, entry };
}

async function invoke(h: Awaited<ReturnType<typeof fixture>>, argv: readonly string[]) {
  const cwd = process.cwd(), exit = process.exitCode;
  let stdout = "", stderr = "";
  const out = vi.spyOn(process.stdout, "write").mockImplementation(chunk => { stdout += String(chunk); return true; });
  const err = vi.spyOn(process.stderr, "write").mockImplementation(chunk => { stderr += String(chunk); return true; });
  try {
    binding.store = h.store; process.chdir(h.root); process.exitCode = undefined;
    await dispatchRegisteredCli(["--no-input", "--skip-projection", ...argv]);
    return { stdout, stderr, exitCode: process.exitCode ?? 0, result: stdout.trim().startsWith("{") ? JSON.parse(stdout) as unknown : null };
  } finally { binding.store = null; out.mockRestore(); err.mockRestore(); process.chdir(cwd); process.exitCode = exit; }
}

it.each([
  { protection: "full", action: "close" },
  { protection: "full", action: "abandon" },
  { protection: "full", action: "leave" },
  { protection: "partial", action: "close" },
  { protection: "partial", action: "abandon" },
] as const)("retains a refused primary edit for $protection $action and completes after repair", async ({ protection, action }) => {
  const h = await fixture(protection);
  expect((await h.exec("git", ["status", "--porcelain"])).stdout).toBe("");
  const opened = await invoke(h, ["errand", "open", "repair", "--intent", "Retire a projected primary safely", "--json"]);
  expect(opened, JSON.stringify(opened)).toMatchObject({ exitCode: 0, result: { outcome: "applied" } });
  const marker = await readFile(resolveWorktreeMarkerPath(h.root));
  const branch = (await h.exec("git", ["branch", "--show-current"])).stdout;
  if (action === "leave") await h.exec("git", ["push", "-u", "origin", branch]);
  const held = join(h.root, ".arc/user/blair/scratch/held.md");
  await mkdir(join(h.root, ".arc/user/blair/scratch"), { recursive: true });
  await writeFile(held, "A previous identity's saved edit.\n");
  await writeFile(join(h.root, h.path), renderStampedFile({ content: "A primary edit saved before retirement.\n", stamp: h.entry.base.blob }));
  const argv = ["errand", action, "repair", ...(action === "leave" ? ["--state", "paused"] : []), "--json"];
  const refused = await invoke(h, argv);
  expect(refused, JSON.stringify(refused)).toMatchObject({ exitCode: 1, result: { outcome: "refused" } });
  expect(JSON.stringify(refused.result)).toContain("blair");
  expect(await readFile(held, "utf8")).toBe("A previous identity's saved edit.\n");
  expect(await readFile(resolveWorktreeMarkerPath(h.root))).toEqual(marker);
  expect((await h.exec("git", ["branch", "--show-current"])).stdout).toBe(branch);
  await rm(held);
  const repaired = await invoke(h, argv);
  expect(repaired, JSON.stringify(repaired)).toMatchObject({ exitCode: 0, result: { outcome: "applied" } });
  expect(await readWorktreeMarker(h.root)).toEqual({ kind: "absent" });
  expect((await h.exec("git", ["branch", "--show-current"])).stdout).toBe("main");
  expect(lifecycleSuccess(await h.store.read({ reference: h.record.reference })).content).toBe("A primary edit saved before retirement.\n");
  expect(await readFile(join(h.root, h.path), "utf8")).toContain("A primary edit saved before retirement.");
  expect(JSON.parse(await readFile(join(h.location.stateDir, PROJECTION_INDEX_FILE), "utf8"))).toMatchObject({
    format: 2, groups: { ".arc/user/test-user": { unsettled: false } },
  });
}, 60_000);

it("keeps the primary Errand claim when projection release throws and closes after repair", async () => {
  const h = await fixture();
  expect(await invoke(h, ["errand", "open", "repair", "--intent", "Retain the primary claim", "--json"]))
    .toMatchObject({ result: { outcome: "applied" } });
  const marker = await readFile(resolveWorktreeMarkerPath(h.root));
  const branch = (await h.exec("git", ["branch", "--show-current"])).stdout;
  const found = lifecycleSuccess(await h.store.lookup({ kind: "slug", slug: SlugSchema.parse("repair") }));
  const initial = lifecycleSuccess(await h.store.read({ reference: found.reference }));
  const options = {
    store: h.store, slug: "repair", base: "main", protection: "full" as const, identity: "test-user",
    exec: h.exec, execInput: makeGitExecInput(h.root),
    readFrame: () => runDerivedLocusStateProbe({ cwd: h.root, identity: "test-user", baseBranch: "main", exec: h.exec, store: h.store }),
    removeInbox: async () => ({ kind: "absent" as const, nextOffer: null }),
  };
  const slots = createProjectionRemovalSlots({ store: h.store, identity: "test-user" });
  const failed = await closeOrdinaryErrandAtRuntime({ ...options, projectionRemovalSlots: { ...slots,
    release: async () => { throw new Error("Projection release boundary failed."); },
  } });
  expect(failed).toMatchObject({ outcome: "error" });
  expect(JSON.stringify(failed)).toContain("Projection release boundary failed.");
  expect(await readFile(resolveWorktreeMarkerPath(h.root))).toEqual(marker);
  expect((await h.exec("git", ["branch", "--show-current"])).stdout).toBe(branch);
  expect(lifecycleSuccess(await h.store.read({ reference: found.reference }))).toEqual(initial);
  expect(await closeOrdinaryErrandAtRuntime({ ...options, projectionRemovalSlots: slots })).toMatchObject({ outcome: "applied" });
  expect(await readWorktreeMarker(h.root)).toEqual({ kind: "absent" });
  expect((await h.exec("git", ["branch", "--show-current"])).stdout).toBe("main");
  expect(await readFile(join(h.root, h.path), "utf8")).toContain("Original personal prose.");
}, 60_000);
