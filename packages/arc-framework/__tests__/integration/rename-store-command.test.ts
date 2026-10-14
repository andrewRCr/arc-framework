/** Record rename composes the production marker, worktree and command adapters. */
import { afterEach, expect, it } from "vitest";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createTempRepoCore, removeGitBackedDirs } from "../helpers/temp-repo.js";
import { makeGitExec } from "../helpers/integration.js";
import { createLifecycleHarness, lifecycleSuccess } from "../helpers/store/lifecycle-harness.js";
import { createUserIOContext } from "../../src/lib/io-context.js";
import { runRenameCommand } from "../../src/commands/rename.js";
import { storeRenameAdapters } from "../../src/commands/rename-store.js";
import { createInRepoRenameRetirementContext } from "../../src/lib/work-unit/direct-retirement-driver.js";
import { readWorktreeMarker, writeWorktreeOwnershipMarker, resolveWorktreeMarkerPath } from "../../src/lib/git/worktree-marker.js";
const roots: string[] = [];
afterEach(async () => { await removeGitBackedDirs(roots.splice(0)); });
async function fixture(spawned: boolean) {
  const root = await createTempRepoCore({ prefix: "arc-rename-store-", identity: "test-user" }); roots.push(root);
  const exec = makeGitExec(root); await exec("git", ["branch", "-M", "main"]); await exec("git", ["commit", "--allow-empty", "-m", "base"]);
  const checkout = spawned ? `${root}.source` : root, target = spawned ? `${root}.target` : root;
  if (spawned) await exec("git", ["worktree", "add", "-b", "feat/source", checkout]);
  else await exec("git", ["switch", "-c", "feat/source"]);
  await writeWorktreeOwnershipMarker(checkout, { createdByArc: true, createdFor: { kind: "work-unit", name: "source" }, spawningIdentity: "test-user" });
  const h = createLifecycleHarness(); const primary = await h.seedMeta("source", {}, undefined,
    { branches: [{ repository: "repo", ref: "feat/source", linkedAs: "created", excluded: [] }] });
  const io = createUserIOContext(); io.exec = exec; io.execInput = undefined;
  const command = { ...h, cwd: root, identity: "test-user", baseBranch: "main", io, projectId: async () => "repo",
    retirement: createInRepoRenameRetirementContext({ cwd: root, exec, readBlob: async () => { throw new Error("No tracked retirement applies"); } }),
    transitionWriter: { record: async () => { throw new Error("No lineage applies"); }, rollback: async () => { throw new Error("No lineage applies"); } } };
  return { ...h, primary, root, checkout, target, exec, command };
}
it("renames from the bound command without legacy stdin expansion, moves a spawned holder and leaves tracked HEAD unchanged", async () => {
  const f = await fixture(true), commands: string[][] = [];
  f.command.io.exec = async (command, args, options) => { commands.push(args); return f.exec(command, args, options); };
  const head = (await f.exec("git", ["rev-parse", "HEAD"])).stdout;
  expect(await runRenameCommand(f.command, { sourceSlug: "source", targetSlug: "target" })).toMatchObject({ status: "renamed", recordBatch: "applied", checkout: { kind: "renamed", checkoutPath: f.target } });
  expect(lifecycleSuccess(await f.store.read({ reference: f.primary.reference })).reference.owner.name).toBe("target");
  expect(await readWorktreeMarker(f.target)).toMatchObject({ kind: "present", marker: { wuName: "target" } });
  expect((await f.exec("git", ["rev-parse", "HEAD"])).stdout).toBe(head);
  expect(commands).toContainEqual(["worktree", "move", "-f", "-f", f.checkout, f.target]);
});
it("keeps the primary holder in place and its rollback restores the exact prior marker bytes", async () => {
  const f = await fixture(false), markerPath = resolveWorktreeMarkerPath(f.checkout);
  const marker = await readWorktreeMarker(f.checkout); if (marker.kind !== "present") throw new Error("Missing marker");
  // Deliberately retain a noncanonical byte generation, which a semantic reverse alone loses.
  const original = Buffer.from(`${JSON.stringify(marker.marker)}\n`); await writeFile(markerPath, original);
  const receipt = await storeRenameAdapters(f.command).renameCheckout?.({ checkoutPath: f.checkout, sourceSlug: "source", targetSlug: "target" });
  if (receipt === undefined) throw new Error("No checkout adapter");
  expect(await readWorktreeMarker(f.checkout)).toMatchObject({ kind: "present", marker: { wuName: "target" } });
  await receipt.rollback(); expect(await readFile(markerPath)).toEqual(original);
});
it.each([false, true])("leaves legacy workspace files and notes untouched with destination present: %s", async (destinationPresent) => {
  const f = await fixture(false);
  const source = join(f.root, ".arc", "user", "test-user", "source");
  const target = join(f.root, ".arc", "user", "test-user", "target");
  await mkdir(source, { recursive: true }); await writeFile(join(source, "SESSION-NOTES.md"), "# Source notes\n");
  if (destinationPresent) {
    await mkdir(target, { recursive: true }); await writeFile(join(target, "SESSION-NOTES.md"), "# Target notes\n");
  }
  const notes = (await f.exec("git", ["for-each-ref", "--format=%(refname) %(objectname)", "refs/notes/"])).stdout;
  expect(await runRenameCommand(f.command, { sourceSlug: "source", targetSlug: "target" }))
    .toMatchObject({ status: "renamed", recordBatch: "applied" });
  expect(lifecycleSuccess(await f.store.read({ reference: f.primary.reference })).reference.owner.name).toBe("target");
  expect(await readFile(join(source, "SESSION-NOTES.md"), "utf8")).toBe("# Source notes\n");
  if (destinationPresent) expect(await readFile(join(target, "SESSION-NOTES.md"), "utf8")).toBe("# Target notes\n");
  else await expect(readFile(join(target, "SESSION-NOTES.md"))).rejects.toMatchObject({ code: "ENOENT" });
  expect((await f.exec("git", ["for-each-ref", "--format=%(refname) %(objectname)", "refs/notes/"])).stdout).toBe(notes);
});
it("preserves a marker changed between compensation's check and the inverse transaction snapshot", async () => {
  const f = await fixture(false), path = resolveWorktreeMarkerPath(f.checkout);
  let race = false, concurrent: Buffer | undefined;
  f.command.io.exec = async (command, args, options) => {
    if (race && args[0] === "worktree" && args[1] === "list") {
      race = false;
      const marker = await readWorktreeMarker(f.checkout); if (marker.kind !== "present") throw new Error("Missing marker");
      concurrent = Buffer.from(`${JSON.stringify({ ...marker.marker, spawningIdentity: "another-user" })}\n`); await writeFile(path, concurrent);
    }
    return f.exec(command, args, options);
  };
  const receipt = await storeRenameAdapters(f.command).renameCheckout?.({ checkoutPath: f.checkout, sourceSlug: "source", targetSlug: "target" });
  if (receipt === undefined) throw new Error("No checkout adapter"); race = true;
  await expect(receipt.rollback()).rejects.toThrow("rollback");
  expect(await readFile(path)).toEqual(concurrent);
  expect(await readWorktreeMarker(f.checkout)).toMatchObject({ kind: "present", marker: { wuName: "target", spawningIdentity: "another-user" } });
});
