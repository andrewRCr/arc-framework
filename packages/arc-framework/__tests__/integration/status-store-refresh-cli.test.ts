/** Registered session status waits for the operational pull before selecting its frame. */
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it, onTestFinished, vi } from "vitest";
import type { Store } from "../../src/lib/store/contract.js";
import type { StoreSyncPort } from "../../src/lib/store/operational-sync.js";
import { createStoreSyncPort } from "../../src/lib/store/operational-sync.js";
import { OwnerIdentitySchema, recordReferences } from "../../src/lib/store/identity.js";
import { writeMetaOwner } from "../../src/lib/store/kinds/meta/writers.js";
import { SlugSchema } from "../../src/lib/kernel/index.js";
import { ensureWorktreeMarkerIgnored, nodeWorktreeMarkerIgnoreFs, writeWorktreeMarker } from "../../src/lib/git/worktree-marker.js";
import { createTempRepo, cleanupTempDir, makeGitExec } from "../helpers/integration.js";
import { createLifecycleHarness, lifecycleSuccess } from "../helpers/store/lifecycle-harness.js";
import { dispatchRegisteredCli } from "../helpers/registered-cli.js";

const binding = vi.hoisted(() => ({ store: null as Store | null, sync: null as StoreSyncPort | null }));
vi.mock("../../src/handlers/status/session-context.js", async importOriginal => {
  const original = await importOriginal<typeof import("../../src/handlers/status/session-context.js")>();
  return { ...original, createSessionStatusContext: (...args: Parameters<typeof original.createSessionStatusContext>) =>
    original.createSessionStatusContext(args[0], args[1], args[2], args[3], args[4], binding.store === null ? args[5]
      : { store: binding.store, ...(binding.sync === null ? {} : { sync: binding.sync }) }) };
});

async function fixture(remoteSync = "enabled") {
  const cwd = await createTempRepo(); onTestFinished(() => cleanupTempDir(cwd));
  const exec = makeGitExec(cwd), h = createLifecycleHarness(), project = randomUUID();
  await exec("git", ["config", "arc.identity", "alice"]);
  await mkdir(join(cwd, ".arc/system"), { recursive: true });
  await writeFile(join(cwd, ".arc/system/arc-config.yml"), `branch.base: main\nsession.remote_sync: ${remoteSync}\n`);
  await exec("git", ["add", "."]); await exec("git", ["commit", "-m", "Initialize status fixture"]);
  await exec("git", ["remote", "add", "origin", cwd]); await exec("git", ["fetch", "origin"]);
  await exec("git", ["checkout", "-b", "feat/demo"]);
  await h.seed(recordReferences["project-registry/identity"](OwnerIdentitySchema.parse({ type: "project", name: "status-project", uid: project })), "{}");
  const meta = await h.seedMeta("demo", { state: "Planning", currentWorkflow: "draft-design", owner: "alice" }, { kind: "active" },
    { branches: [{ repository: project, ref: "feat/demo", linkedAs: "adopted", excluded: [] }] });
  await ensureWorktreeMarkerIgnored(cwd, exec, nodeWorktreeMarkerIgnoreFs);
  await writeWorktreeMarker(cwd, { spawnedByArc: false, spawningIdentity: "alice", createdAt: new Date(0).toISOString(), createdFor: { kind: "work-unit", name: "demo" } });
  return { ...h, cwd, meta };
}

async function session(h: Awaited<ReturnType<typeof fixture>>, sync: StoreSyncPort) {
  const cwd = process.cwd(), exit = process.exitCode;
  let output = "";
  const out = vi.spyOn(process.stdout, "write").mockImplementation(chunk => { output += String(chunk); return true; });
  try {
    binding.store = h.store; binding.sync = sync; process.chdir(h.cwd); process.exitCode = undefined;
    await dispatchRegisteredCli(["--no-input", "status", "--session-init", "--json"]);
    expect(process.exitCode, output).toBeUndefined();
    return JSON.parse(output);
  } finally { binding.store = null; binding.sync = null; out.mockRestore(); process.chdir(cwd); process.exitCode = exit; }
}

it("returns the refreshed owner when base-distance work runs during a delayed pull", async () => {
  const h = await fixture();
  let pulls = 0;
  const result = await session(h, createStoreSyncPort({ pull: async () => {
    if (++pulls > 1) throw new Error("The invocation attempted a second pull");
    await new Promise(resolve => setTimeout(resolve, 2500));
    lifecycleSuccess(await h.store.write({ action: "put", reference: h.meta.reference, expected: h.meta.version,
      content: writeMetaOwner(h.meta.content, SlugSchema.parse("bob")), placement: h.meta.placement, links: h.meta.links,
      provenance: { verb: "pull", lifecycleAction: "pull" } }));
    return { status: "pulled" };
  } }));
  expect(result.user).toMatchObject({ ok: true, value: { status: "pulled" } });
  expect(result.derivedLocusState).toMatchObject({ ok: true, value: { active: { context: { owner: "bob" } } } });
  expect(result.active).toMatchObject({ ok: true, value: { resolution: "single" } });
}, 30_000);

it("keeps a failed pull in the user slot while deriving the local frame", async () => {
  const h = await fixture();
  const result = await session(h, createStoreSyncPort({ pull: async () => { throw new Error("State pull failed"); } }));
  expect(result.user).toMatchObject({ ok: false, error: { message: "State pull failed" } });
  expect(result.derivedLocusState).toMatchObject({ ok: true, value: { active: { context: { owner: "alice" } } } });
  expect(result.active).toMatchObject({ ok: true, value: { resolution: "single" } });
}, 30_000);

it("does not pull when session remote synchronization is disabled", async () => {
  const h = await fixture("disabled");
  const result = await session(h, createStoreSyncPort({ pull: async () => { throw new Error("Disabled synchronization was invoked"); } }));
  expect(result.user).toEqual({ ok: true, value: null });
  expect(result.derivedLocusState).toMatchObject({ ok: true, value: { active: { context: { owner: "alice" } } } });
}, 30_000);
