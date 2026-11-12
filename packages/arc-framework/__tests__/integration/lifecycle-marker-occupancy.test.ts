/** In-place lifecycle callers preserve HEAD and state when a hidden marker role occupies the checkout. */
import { expect, it, onTestFinished, vi } from "vitest";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { Store } from "../../src/lib/store/contract.js";
import { dispatchRegisteredCli } from "../helpers/registered-cli.js";
import { OwnerIdentitySchema, recordReferences } from "../../src/lib/store/identity.js";
const binding = vi.hoisted(() => ({ store: null as Store | null }));
vi.mock("../../src/lib/store/create.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../src/lib/store/create.js")>();
  return { ...original, createStore: (...args: Parameters<typeof original.createStore>) => binding.store ?? original.createStore(...args) };
});
import { createTempRepo, cleanupTempDir, makeGitExec } from "../helpers/integration.js";
import { createLifecycleHarness, lifecycleSuccess } from "../helpers/store/lifecycle-harness.js";
import { writeWorktreeMarker } from "../../src/lib/git/worktree-marker.js";

it.each(["graduate", "materialize"] as const)("%s --here refuses a partial Errand before changing HEAD or records", async verb => {
  const cwd = await createTempRepo();
  onTestFinished(async () => cleanupTempDir(cwd));
  const exec = makeGitExec(cwd);
  await exec("git", ["branch", "-M", "main"]);
  await mkdir(join(cwd, ".arc/system"), { recursive: true });
  await writeFile(join(cwd, ".arc/system/arc-config.yml"), "branch.base: main\nbranch.protection: full\nsession.remote_sync: disabled\n");
  await exec("git", ["add", ".arc"]);
  await exec("git", ["commit", "-m", "Initial base"]);
  await exec("git", ["config", "arc.identity", "andrew"]);
  const head = (await exec("git", ["rev-parse", "HEAD"])).stdout;
  const h = createLifecycleHarness();
  const record = await h.seedMeta("demo", { state: "Planning", owner: "andrew", currentWorkflow: "draft-design" },
    verb === "graduate" ? { kind: "backlog", commitment: "planned" } : { kind: "active" });
  await h.seed(recordReferences["project-registry/identity"](OwnerIdentitySchema.parse({ type: "project", name: "test-project", uid: randomUUID() })), "{}");
  await writeWorktreeMarker(cwd, { spawnedByArc: false, createdFor: { kind: "partial-errand", slug: "errand", claimId: null },
    provisioning: "ready", spawningIdentity: "andrew", createdAt: new Date(0).toISOString() });
  const originalCwd = process.cwd(), originalExit = process.exitCode;
  let output = "";
  const error = vi.spyOn(process.stderr, "write").mockImplementation(chunk => { output += String(chunk); return true; });
  const stdout = vi.spyOn(process.stdout, "write").mockImplementation(chunk => { output += String(chunk); return true; });
  try {
    binding.store = h.store;
    process.chdir(cwd);
    process.exitCode = undefined;
    await dispatchRegisteredCli(["--no-input", ...(verb === "graduate" ? ["start", "demo", "--here", "--yes"] : ["materialize", "demo", "--here"])]);
    expect(process.exitCode).toBe(1);
    expect(output).toMatch(/finish.*promote.*abandon/iu);
  } finally {
    binding.store = null;
    error.mockRestore();
    stdout.mockRestore();
    process.chdir(originalCwd);
    process.exitCode = originalExit;
  }
  expect((await exec("git", ["rev-parse", "HEAD"])).stdout).toBe(head);
  expect(lifecycleSuccess(await h.store.read({ reference: record.reference }))).toEqual(record);
}, 30_000);
