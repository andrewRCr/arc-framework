/** Registered public readers combine Store lifecycle truth with actual local checkout evidence. */
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it, onTestFinished, vi } from "vitest";
import type { Store } from "../../src/lib/store/contract.js";
import { OwnerIdentitySchema, recordReferences, sameReference } from "../../src/lib/store/identity.js";
import { ensureWorktreeMarkerIgnored, nodeWorktreeMarkerIgnoreFs, writeWorktreeMarker } from "../../src/lib/git/worktree-marker.js";
import { createTempRepo, cleanupTempDir, makeGitExec } from "../helpers/integration.js";
import { createLifecycleHarness, lifecycleSuccess } from "../helpers/store/lifecycle-harness.js";
import { dispatchRegisteredCli } from "../helpers/registered-cli.js";
const binding = vi.hoisted(() => ({ store: null as Store | null }));
vi.mock("../../src/lib/store/create.js", async importOriginal => {
  const original = await importOriginal<typeof import("../../src/lib/store/create.js")>();
  return { ...original, createStore: (...args: Parameters<typeof original.createStore>) => binding.store ?? original.createStore(...args) };
});
async function fixture() {
  const cwd = await createTempRepo(); onTestFinished(() => cleanupTempDir(cwd));
  const exec = makeGitExec(cwd), h = createLifecycleHarness(), project = randomUUID();
  await exec("git", ["config", "arc.identity", "test-user"]);
  await mkdir(join(cwd, ".arc/system"), { recursive: true });
  await writeFile(join(cwd, ".arc/system/arc-config.yml"), "branch.base: main\nbranch.protection: full\nteam.mode: false\nsession.remote_sync: disabled\n");
  await exec("git", ["add", ".arc/system/arc-config.yml"]);
  await exec("git", ["commit", "-m", "Initialize reader fixture"]);
  await h.seed(recordReferences["project-registry/identity"](OwnerIdentitySchema.parse({ type: "project", name: "reader-project", uid: project })), "{}");
  await h.seedMeta("planning-unit", { state: "Planning", currentWorkflow: "draft-design" });
  const paused = await h.seedMeta("paused-unit", { dependsOn: ["planning-unit"], design: ["spec-paused-unit.md"] }, { kind: "active" },
    { branches: [{ repository: project, ref: "feat/paused-unit", linkedAs: "created", excluded: [] }] });
  lifecycleSuccess(await h.store.write({ action: "put", reference: paused.reference, expected: paused.version,
    content: `${paused.content}\n## Pause\n\n- **Paused By:** \`test-user\`\n- **Since:** \`2026-10-15T00:00:00Z\`\n- **Reason:** Waiting for review\n`,
    placement: { kind: "active" }, links: paused.links, provenance: { verb: "pause", lifecycleAction: "update" } }));
  await h.seed(recordReferences["work-item/spec"](paused.reference.owner), "# Specification: paused-unit\n\n**Purpose:** Read records reliably. More detail follows.\n");
  await exec("git", ["branch", "feat/paused-unit"]);
  const holder = join(cwd, ".arc-checkouts", "anchored-holder");
  await exec("git", ["worktree", "add", "--detach", holder, "main"]);
  await ensureWorktreeMarkerIgnored(holder, exec, nodeWorktreeMarkerIgnoreFs);
  await writeWorktreeMarker(holder, { spawnedByArc: false, spawningIdentity: "test-user", createdAt: "2026-10-15T00:00:00Z",
    createdFor: { kind: "work-unit", name: "paused-unit" } });
  return { ...h, cwd, exec, holder };
}
async function invoke(h: Awaited<ReturnType<typeof fixture>>, argv: readonly string[]) {
  const previousCwd = process.cwd(), previousExit = process.exitCode;
  let output = "";
  const out = vi.spyOn(process.stdout, "write").mockImplementation(chunk => { output += String(chunk); return true; });
  try {
    binding.store = h.store; process.chdir(h.cwd); process.exitCode = undefined;
    await dispatchRegisteredCli(["--no-input", ...argv]);
    expect(process.exitCode, output).toBeUndefined();
    return JSON.parse(output);
  } finally { binding.store = null; out.mockRestore(); process.chdir(previousCwd); process.exitCode = previousExit; }
}
it("active in-flight lists branchless Planning and paused work through its default binding without a code remote", async () => {
  const h = await fixture();
  expect((await h.exec("git", ["remote"])).stdout.trim()).toBe("");
  const result = await invoke(h, ["active", "in-flight", "--json"]);
  expect(result).toMatchObject({ remoteEvidence: "not-applicable", candidateExpansion: { status: "not-requested", pendingBranchCount: 0 } });
  expect(result.entries).toEqual(expect.arrayContaining([
    expect.objectContaining({ kind: "work-unit", name: "planning-unit", state: "Planning", remoteOnly: false }),
    expect.objectContaining({ kind: "work-unit", name: "paused-unit", state: "Active", branch: "feat/paused-unit", scheduling: "paused", worktreePath: h.holder }),
  ]));
  const planning = result.entries.find((entry: { name?: string }) => entry.name === "planning-unit");
  expect(planning).not.toHaveProperty("branch");
}, 30_000);
it("status uses the default anchored-holder lookup and retains lifecycle details beside an unrelated malformed meta warning", async () => {
  const h = await fixture();
  const expected = { slug: "paused-unit", state: "active", owner: "test-user", purpose: "Read records reliably.",
    occupied: true, shipped: false, dependsOn: [{ slug: "planning-unit", landed: false }], integrationBoundary: null, worktreePath: h.holder };
  expect(await invoke(h, ["status", "paused-unit", "--json"])).toMatchObject(expected);
  const broken = await h.seedMeta("broken-unit");
  const stored = [...h.store.state.records.values()].find(record => sameReference(record.reference, broken.reference));
  if (stored === undefined) throw new Error("Missing checked corruption basis");
  stored.content = "Malformed metadata bytes";
  const degraded = await invoke(h, ["status", "paused-unit", "--json"]);
  expect(degraded).toMatchObject({ ...expected, warnings: expect.arrayContaining([expect.stringContaining("broken-unit")]) });
}, 30_000);
