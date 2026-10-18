/** Store cold starts anchor existing checkouts without moving code history. */
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it, onTestFinished, vi } from "vitest";
import { createTempRepo, cleanupTempDir, makeGitExec } from "../helpers/integration.js";
import { createLifecycleHarness, lifecycleSuccess } from "../helpers/store/lifecycle-harness.js";
import type { Store } from "../../src/lib/store/contract.js";
import { dispatchRegisteredCli } from "../helpers/registered-cli.js";
const binding = vi.hoisted(() => ({ store: null as Store | null }));
vi.mock("../../src/lib/store/create.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../src/lib/store/create.js")>();
  return { ...original, createStore: (...args: Parameters<typeof original.createStore>) => binding.store ?? original.createStore(...args) };
});
import { runColdStart } from "../../src/commands/start.js";
import { createUserIOContext } from "../../src/lib/io-context.js";
import { createLocusPorts } from "../../src/lib/locus/lifecycle-ports.js";
import { RecordReferenceSchema, OwnerIdentitySchema, recordReferences } from "../../src/lib/store/identity.js";
import { resolveArcPath } from "../../src/lib/layout/index.js";
import { readWorktreeMarker, readWorktreeMarkerGeneration, resolveWorktreeMarkerPath, writeWorktreeMarker } from "../../src/lib/git/worktree-marker.js";

async function fixture() {
  const cwd = await createTempRepo();
  onTestFinished(async () => cleanupTempDir(cwd));
  const exec = makeGitExec(cwd);
  await exec("git", ["branch", "-M", "main"]);
  await mkdir(join(cwd, ".arc", "system"), { recursive: true });
  await writeFile(join(cwd, ".arc", "system", "arc-config.yml"), "branch.base: main\nbranch.protection: full\n");
  await exec("git", ["add", ".arc"]);
  await exec("git", ["commit", "-m", "Project configuration"]);
  const before = (await exec("git", ["rev-parse", "HEAD"])).stdout;
  const h = createLifecycleHarness();
  const ctx = { io: { ...createUserIOContext(), exec }, store: h.store, locusPorts: createLocusPorts({ cwd, exec, store: h.store }), internalTemplateDir: "/templates" };
  const params = { worktreePath: cwd, branch: "main", identity: "andrew", name: "demo" };
  return { ...h, cwd, exec, before, ctx, params };
}

it("writes the anchored marker and one Planning record on a protected base with HEAD unmoved", async () => {
  const h = await fixture();
  expect(await runColdStart(h.ctx, h.params)).toMatchObject({ ok: true, value: { wuName: "demo", worktreePath: h.cwd } });
  expect((await h.exec("git", ["rev-parse", "HEAD"])).stdout).toBe(h.before);
  expect((await h.exec("git", ["branch", "--show-current"])).stdout).toBe("main");
  expect((await h.exec("git", ["branch", "--list", "plan/*"])).stdout).toBe("");
  expect(await readWorktreeMarker(h.cwd)).toMatchObject({ kind: "present", marker: { spawnedByArc: false, createdFor: { kind: "work-unit", name: "demo" } } });
  const list = lifecycleSuccess(await h.store.list({ family: "work-item", kind: "work-item/meta" }));
  expect(list).toMatchObject({ status: "complete", records: [{ placement: { kind: "active" }, fields: { state: "Planning", branch: null, owner: "andrew" } }] });
  expect(await stat(join(h.cwd, ".arc", "active")).catch(() => null)).toBeNull();
  expect(await stat(join(h.cwd, ".arc", "user")).catch(() => null)).toBeNull();
  const exclude = await readFile(join(h.cwd, ".git", "info", "exclude"), "utf8");
  expect(exclude).toContain("worktree-marker.json");
  expect(exclude).toContain(resolveArcPath({ kind: "editor-document-root" }));
}, 30_000);

it("leaves no record or marker when editor-document preparation fails", async () => {
  const h = await fixture();
  expect(await runColdStart({ ...h.ctx, writeEditorDocuments: async () => ({ ok: false, target: "documents", detail: "Editor write failed" }) }, h.params))
    .toMatchObject({ ok: false, reason: expect.stringContaining("Editor write failed") });
  expect(lifecycleSuccess(await h.store.list({ family: "work-item", kind: "work-item/meta" }))).toMatchObject({ status: "absent" });
  expect(await readWorktreeMarker(h.cwd)).toEqual({ kind: "absent" });
  expect((await h.exec("git", ["rev-parse", "HEAD"])).stdout).toBe(h.before);
}, 30_000);

async function invokeStart(h: Awaited<ReturnType<typeof fixture>>, name: string | undefined,
  options: import("../../src/handlers/start.js").StartOptions = {}) {
  const originalCwd = process.cwd(), originalExitCode = process.exitCode;
  await h.exec("git", ["config", "arc.identity", "andrew"]);
  try {
    process.exitCode = undefined;
    process.chdir(h.cwd);
    binding.store = h.store;
    await dispatchRegisteredCli(["--no-input", "start", ...(name === undefined ? [] : [name]), "--here", "--new", "--yes",
      ...(options.class === undefined ? [] : ["--class", options.class])]);
    return process.exitCode;
  } finally { binding.store = null; process.chdir(originalCwd); process.exitCode = originalExitCode; }
}

it("retains malformed-marker repair guidance and permits a cold start after repair", async () => {
  const h = await fixture(), markerPath = resolveWorktreeMarkerPath(h.cwd);
  await mkdir(join(markerPath, ".."), { recursive: true });
  await writeFile(markerPath, "{");
  const marker = await readWorktreeMarker(h.cwd);
  if (marker.kind !== "malformed") throw new Error("Expected malformed marker fixture");
  const before = lifecycleSuccess(await h.store.version());
  let output = "";
  const stdout = vi.spyOn(process.stdout, "write").mockImplementation(chunk => { output += String(chunk); return true; });
  try { expect(await invokeStart(h, "demo")).toBe(1); } finally { stdout.mockRestore(); }
  expect(output).toContain(markerPath); expect(output).toContain(marker.message);
  expect(output).toMatch(/inspect.*repair.*marker.*retry/isu);
  expect(await readFile(markerPath, "utf8")).toBe("{");
  expect(lifecycleSuccess(await h.store.version())).toBe(before);
  expect((await h.exec("git", ["rev-parse", "HEAD"])).stdout).toBe(h.before);
  await rm(markerPath);
  expect(await invokeStart(h, "demo")).toBeUndefined();
  expect(await readWorktreeMarker(h.cwd)).toMatchObject({ kind: "present", marker: { createdFor: { name: "demo" } } });
}, 30_000);

it("reaches the production cold-start slot with automatic locus ports and refuses a held explicit name", async () => {
  const h = await fixture();
  await h.seedMeta("held", { state: "Planning", owner: "andrew", currentWorkflow: "draft-design" }, { kind: "active" });
  const before = lifecycleSuccess(await h.store.list({ family: "work-item", kind: "work-item/meta" }));
  expect(await invokeStart(h, "held")).toBe(1);
  expect(await readWorktreeMarker(h.cwd)).toEqual({ kind: "absent" });
  expect(lifecycleSuccess(await h.store.list({ family: "work-item", kind: "work-item/meta" }))).toEqual(before);
  expect(await invokeStart(h, "fresh")).toBeUndefined();
  expect(await readWorktreeMarker(h.cwd)).toMatchObject({ kind: "present", marker: { createdFor: { kind: "work-unit", name: "fresh" } } });
  expect((await h.exec("git", ["branch", "--show-current"])).stdout).toBe("main");
}, 30_000);

it("refuses --class before admitting a named create-new cold start", async () => {
  const h = await fixture();
  expect(await invokeStart(h, "fresh", { class: "Light" })).toBe(1);
  expect(await readWorktreeMarker(h.cwd)).toEqual({ kind: "absent" });
  expect(lifecycleSuccess(await h.store.list({ family: "work-item", kind: "work-item/meta" }))).toMatchObject({ status: "absent" });
}, 30_000);

it("runs a named cold start on detached HEAD and refuses a nameless detached start before writing", async () => {
  const h = await fixture();
  await h.exec("git", ["switch", "--detach"]);
  expect(await invokeStart(h, undefined)).toBe(1);
  expect(await readWorktreeMarker(h.cwd)).toEqual({ kind: "absent" });
  expect(await invokeStart(h, "detached")).toBeUndefined();
  expect(await readWorktreeMarker(h.cwd)).toMatchObject({ kind: "present", marker: { createdFor: { kind: "work-unit", name: "detached" } } });
  expect((await h.exec("git", ["rev-parse", "HEAD"])).stdout).toBe(h.before);
  expect(await h.exec("git", ["symbolic-ref", "--quiet", "HEAD"]).catch(() => null)).toBeNull();
}, 30_000);

it("replaces a crashed anchored marker at its observed generation", async () => {
  const h = await fixture();
  await writeWorktreeMarker(h.cwd, { spawnedByArc: false, createdFor: { kind: "work-unit", name: "crashed" },
    spawningIdentity: "andrew", createdAt: new Date(0).toISOString() });
  expect(await runColdStart(h.ctx, h.params)).toMatchObject({ ok: true });
  expect(await readWorktreeMarker(h.cwd)).toMatchObject({ kind: "present", marker: { createdFor: { kind: "work-unit", name: "demo" } } });
  expect((await h.exec("git", ["rev-parse", "HEAD"])).stdout).toBe(h.before);
}, 30_000);

it("keeps a crashed marker when the complete inventory cannot be read", async () => {
  const h = await fixture();
  await writeWorktreeMarker(h.cwd, { spawnedByArc: false, createdFor: { kind: "work-unit", name: "crashed" },
    spawningIdentity: "andrew", createdAt: new Date(0).toISOString() });
  const before = await readWorktreeMarkerGeneration(h.cwd);
  const list = h.store.list.bind(h.store);
  const spy = vi.spyOn(h.store, "list").mockImplementation(input => {
    if (input.filter?.heldHere) return list(input);
    throw new Error("Complete inventory is unavailable");
  });
  try {
    expect(await runColdStart(h.ctx, h.params)).toMatchObject({ ok: false, reason: expect.stringContaining("Complete inventory is unavailable") });
    expect(await readWorktreeMarkerGeneration(h.cwd)).toEqual(before);
  } finally { spy.mockRestore(); }
}, 30_000);

it("removes only its written marker when scaffold fails and retains the storage error", async () => {
  const h = await fixture();
  const spy = vi.spyOn(h.store, "batch").mockImplementationOnce(async () => { throw new Error("Operational write unavailable"); });
  try {
    expect(await runColdStart(h.ctx, h.params)).toMatchObject({ ok: false, reason: expect.stringContaining("Operational write unavailable") });
    expect(await readWorktreeMarker(h.cwd)).toEqual({ kind: "absent" });
    expect(lifecycleSuccess(await h.store.list({ family: "work-item", kind: "work-item/meta" }))).toMatchObject({ status: "absent" });
    expect((await h.exec("git", ["rev-parse", "HEAD"])).stdout).toBe(h.before);
  } finally { spy.mockRestore(); }
}, 30_000);

it("rolls back a derived-name collision and then accepts another explicit name", async () => {
  const h = await fixture();
  await h.exec("git", ["switch", "-c", "feat/held"]);
  await h.seedMeta("held", { state: "Planning", owner: "andrew", currentWorkflow: "draft-design" });
  expect(await runColdStart(h.ctx, { ...h.params, branch: "feat/held", name: undefined }))
    .toMatchObject({ ok: false, reason: expect.stringMatching(/held.*arc start <name> --new --here.*arc status held/u) });
  expect(await readWorktreeMarker(h.cwd)).toEqual({ kind: "absent" });
  expect(await runColdStart(h.ctx, { ...h.params, branch: "feat/held", name: "fresh" })).toMatchObject({ ok: true });
}, 30_000);

it("refuses another checkout's marker through production ports before writing", async () => {
  const h = await fixture();
  const holder = join(h.cwd, "held-checkout");
  await h.exec("git", ["worktree", "add", "--detach", holder, "main"]);
  await writeWorktreeMarker(holder, { spawnedByArc: false, createdFor: { kind: "work-unit", name: "fresh" },
    spawningIdentity: "andrew", createdAt: new Date(0).toISOString() });
  let output = "";
  const stdout = vi.spyOn(process.stdout, "write").mockImplementation(chunk => { output += String(chunk); return true; });
  try { expect(await invokeStart(h, "fresh")).toBe(1); } finally { stdout.mockRestore(); }
  expect(output).toContain(holder);
  expect(output).toContain("arc locus release fresh");
  expect(await readWorktreeMarker(h.cwd)).toEqual({ kind: "absent" });
  expect(lifecycleSuccess(await h.store.list({ family: "work-item", kind: "work-item/meta" }))).toMatchObject({ status: "absent" });
}, 30_000);

it("refuses a former slug and an Errand slug before the named cold-start slot", async () => {
  const h = await fixture();
  const old = await h.seedMeta("former", { state: "Planning", owner: "andrew", currentWorkflow: "draft-design" });
  const renamed = RecordReferenceSchema.parse({ ...old.reference, owner: { ...old.reference.owner, name: "current" } });
  lifecycleSuccess(await h.store.write({ action: "put", reference: renamed, expected: old.version,
    content: old.content.replaceAll("former", "current"), placement: { kind: "active" }, provenance: { verb: "rename", lifecycleAction: "transition" } }));
  await h.seed(recordReferences["work-item/record"](OwnerIdentitySchema.parse({ type: "work-item", name: "errand" })), "{}", { kind: "active" });
  const snapshot = lifecycleSuccess(await h.store.version());
  let output = "";
  const stdout = vi.spyOn(process.stdout, "write").mockImplementation(chunk => { output += String(chunk); return true; });
  try {
    expect(await invokeStart(h, "former")).toBe(1);
    expect(await invokeStart(h, "errand")).toBe(1);
  } finally { stdout.mockRestore(); }
  expect(output).toContain("current is already started");
  expect(output).toMatch(/Errand/iu);
  expect(await h.store.version()).toEqual({ status: "ok", result: snapshot });
  expect(await readWorktreeMarker(h.cwd)).toEqual({ kind: "absent" });
}, 30_000);
