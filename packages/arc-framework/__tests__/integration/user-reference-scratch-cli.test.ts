/** The registered reconcile command plans and applies checkout-local scratch under its lock. */
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it, onTestFinished, vi } from "vitest";
import type { Store } from "../../src/lib/store/contract.js";
import { RecordReferenceSchema } from "../../src/lib/store/identity.js";
import { createTempRepo, cleanupTempDir, makeGitExec } from "../helpers/integration.js";
import { createLifecycleHarness, lifecycleSuccess } from "../helpers/store/lifecycle-harness.js";
import { dispatchRegisteredCli } from "../helpers/registered-cli.js";
import { createStoreSessionProbes } from "../../src/handlers/status/store-session.js";
const binding = vi.hoisted(() => ({ store: null as Store | null }));
vi.mock("../../src/lib/store/create.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../src/lib/store/create.js")>();
  return { ...original, createStore: (...args: Parameters<typeof original.createStore>) => binding.store ?? original.createStore(...args) };
});

it("plans without writes, then replaces an empty destination from CLI-parsed --apply", async () => {
  const cwd = await createTempRepo();
  onTestFinished(() => cleanupTempDir(cwd));
  const exec = makeGitExec(cwd);
  await exec("git", ["config", "arc.identity", "andrew"]);
  await mkdir(join(cwd, ".arc/system"), { recursive: true });
  await writeFile(join(cwd, ".arc/system/arc-config.yml"), "branch.base: main\nbranch.protection: full\nsession.remote_sync: disabled\n");
  const h = createLifecycleHarness();
  const former = await h.seedMeta("former", { owner: "andrew", state: "Planning", currentWorkflow: "draft-design" });
  const reference = RecordReferenceSchema.parse({ ...former.reference, owner: { ...former.reference.owner, name: "current" } });
  lifecycleSuccess(await h.store.write({ action: "put", reference, expected: former.version,
    content: former.content.replaceAll("former", "current"), placement: { kind: "active" }, provenance: { verb: "rename", lifecycleAction: "transition" } }));
  const root = join(cwd, ".arc/user/andrew/scratch/work-unit"), from = join(root, "former"), to = join(root, "current");
  await mkdir(from, { recursive: true });
  await mkdir(to);
  await writeFile(join(from, "idea"), "Keep this personal idea");
  const originalCwd = process.cwd(), originalExit = process.exitCode;
  let output = "";
  const stdout = vi.spyOn(process.stdout, "write").mockImplementation(chunk => { output += String(chunk); return true; });
  try {
    binding.store = h.store;
    process.chdir(cwd);
    process.exitCode = undefined;
    await dispatchRegisteredCli(["--no-input", "user", "reconcile-references", "--json"]);
    expect(JSON.parse(output)).toMatchObject({ status: "pending", plan: { scratch: { moves: [{ from, to }] } },
      recommendedCommand: ["arc", "user", "reconcile-references", "--apply", "--json"] });
    expect((await readdir(root)).sort()).toEqual(["current", "former"]);
    output = "";
    await dispatchRegisteredCli(["--no-input", "user", "reconcile-references", "--apply", "--json"]);
    expect(JSON.parse(output)).toMatchObject({ status: "applied", plan: { scratch: { moves: [{ from, to }] } } });
    expect(await readFile(join(to, "idea"), "utf8")).toBe("Keep this personal idea");
    expect(await readdir(root)).toEqual(["current"]);
    expect(process.exitCode).toBeUndefined();
  } finally {
    binding.store = null;
    stdout.mockRestore();
    process.chdir(originalCwd);
    process.exitCode = originalExit;
  }
}, 30_000);

it("executes session scratch actions in the linked checkout while preserving primary scratch", async () => {
  const cwd = await createTempRepo(), linked = join(cwd, "linked");
  onTestFinished(() => cleanupTempDir(cwd));
  const exec = makeGitExec(cwd);
  await exec("git", ["config", "arc.identity", "andrew"]);
  await mkdir(join(cwd, ".arc/system"), { recursive: true });
  await writeFile(join(cwd, ".arc/system/arc-config.yml"), "branch.base: main\nbranch.protection: full\nsession.remote_sync: disabled\n");
  await exec("git", ["add", ".arc/system/arc-config.yml"]);
  await exec("git", ["commit", "-m", "Scratch configuration"]);
  await exec("git", ["worktree", "add", "-b", "feat/linked", linked]);
  const h = createLifecycleHarness(), former = await h.seedMeta("former", { owner: "andrew", state: "Planning", currentWorkflow: "draft-design" });
  const reference = RecordReferenceSchema.parse({ ...former.reference, owner: { ...former.reference.owner, name: "current" } });
  lifecycleSuccess(await h.store.write({ action: "put", reference, expected: former.version, content: former.content.replaceAll("former", "current"),
    placement: { kind: "active" }, provenance: { verb: "rename", lifecycleAction: "transition" } }));
  const scratch = (root: string, slug: string) => join(root, ".arc/user/andrew/scratch/work-unit", slug);
  for (const root of [cwd, linked]) {
    await mkdir(scratch(root, "former"), { recursive: true });
    await writeFile(join(scratch(root, "former"), "idea"), root);
  }
  const stateVersion = lifecycleSuccess(await h.store.version()), head = (await exec("git", ["rev-parse", "HEAD"])).stdout;
  const slot = await createStoreSessionProbes({ cwd: linked, store: h.store, exec: makeGitExec(linked), identity: "andrew",
    readFrame: async () => null, readSettings: async () => ({}), readUserInbox: async () => "" }).userReferenceReconcile("current");
  expect(slot).toMatchObject({ status: "pending", plan: { scratch: { moves: [{ from: scratch(linked, "former"), to: scratch(linked, "current") }] } } });
  const originalCwd = process.cwd(), originalExit = process.exitCode;
  let output = "";
  const stdout = vi.spyOn(process.stdout, "write").mockImplementation(chunk => { output += String(chunk); return true; });
  try {
    binding.store = h.store;
    for (const action of slot.actions ?? []) {
      if (action.argv === undefined) continue;
      output = ""; process.exitCode = undefined; process.chdir(action.checkout ?? cwd);
      await dispatchRegisteredCli(["--no-input", ...action.argv.slice(1)]);
      expect(process.exitCode).toBeUndefined();
    }
    expect(JSON.parse(output)).toMatchObject({ status: "applied" });
    expect(await readFile(join(scratch(linked, "current"), "idea"), "utf8")).toBe(linked);
    expect(await readdir(join(linked, ".arc/user/andrew/scratch/work-unit"))).toEqual(["current"]);
    expect(await readFile(join(scratch(cwd, "former"), "idea"), "utf8")).toBe(cwd);
    expect(await readdir(join(cwd, ".arc/user/andrew/scratch/work-unit"))).toEqual(["former"]);
    expect(lifecycleSuccess(await h.store.version())).toBe(stateVersion);
    expect((await exec("git", ["rev-parse", "HEAD"])).stdout).toBe(head);
  } finally { binding.store = null; stdout.mockRestore(); process.chdir(originalCwd); process.exitCode = originalExit; }
}, 30_000);

it("applies registered managed-target repairs to the Store while preserving session prose and code history", async () => {
  const { OwnerIdentitySchema, recordReferences } = await import("../../src/lib/store/identity.js");
  const { writeMetaSessionContext } = await import("../../src/lib/store/kinds/meta/writers.js");
  const { recordPut } = await import("../../src/lib/store/lifecycle-write.js");
  const { writeWorktreeMarker } = await import("../../src/lib/git/worktree-marker.js");
  const cwd = await createTempRepo();
  onTestFinished(() => cleanupTempDir(cwd));
  const exec = makeGitExec(cwd);
  await exec("git", ["config", "arc.identity", "andrew"]);
  await exec("git", ["commit", "--allow-empty", "-m", "Initial code"]);
  const head = (await exec("git", ["rev-parse", "HEAD"])).stdout;
  await mkdir(join(cwd, ".arc/system"), { recursive: true });
  await writeFile(join(cwd, ".arc/system/arc-config.yml"), "branch.base: main\nbranch.protection: full\nsession.remote_sync: disabled\n");
  const h = createLifecycleHarness(), former = await h.seedMeta("former");
  const reference = RecordReferenceSchema.parse({ ...former.reference, owner: { ...former.reference.owner, name: "current" } });
  lifecycleSuccess(await h.store.write({ action: "put", reference, expected: former.version,
    content: former.content.replaceAll("former", "current"), placement: { kind: "active" }, provenance: { verb: "rename", lifecycleAction: "transition" } }));
  const dependent = await h.seedMeta("dependent", { owner: "andrew", state: "Planning", currentWorkflow: "draft-design" });
  const metaContent = writeMetaSessionContext(dependent.content, "Keep former and `spec-former.md` as prose.");
  lifecycleSuccess(await h.store.write({ ...recordPut(dependent, { content: metaContent }), provenance: { verb: "handoff", lifecycleAction: "update" } }));
  await writeWorktreeMarker(cwd, { spawnedByArc: false, spawningIdentity: "andrew", createdAt: "2026-10-16T12:00:00Z", createdFor: { kind: "work-unit", name: "dependent" } });
  const owner = OwnerIdentitySchema.parse({ type: "person", name: "andrew" });
  const inbox = await h.seed(recordReferences["personal/inbox"](owner), "# Inbox\n\n## Work Unit\n\n### **Managed target**\n\n- _WU_Target:_ `former`\n- _Id:_ `12345678`\n");
  const originalCwd = process.cwd(), originalExit = process.exitCode;
  let output = "";
  const stdout = vi.spyOn(process.stdout, "write").mockImplementation(chunk => { output += String(chunk); return true; });
  try {
    binding.store = h.store;
    process.chdir(cwd);
    process.exitCode = undefined;
    await dispatchRegisteredCli(["--no-input", "user", "reconcile-references", "--apply", "--json"]);
    expect(lifecycleSuccess(await h.store.read({ reference: inbox.reference })).content).toContain("_WU_Target:_ `current`");
    expect(JSON.parse(output)).toMatchObject({ status: "applied", plan: { edits: [{ path: ".arc/user/andrew/USER-INBOX.md" }],
      advisories: [expect.objectContaining({ path: ".arc/active/meta-dependent.md", subject: "former" })] } });
    expect(lifecycleSuccess(await h.store.read({ reference: dependent.reference })).content).toBe(metaContent);
    await expect(readFile(join(cwd, ".arc/user/andrew/USER-INBOX.md"), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
    expect((await exec("git", ["rev-parse", "HEAD"])).stdout).toBe(head);
  } finally { binding.store = null; stdout.mockRestore(); process.chdir(originalCwd); process.exitCode = originalExit; }
}, 30_000);
