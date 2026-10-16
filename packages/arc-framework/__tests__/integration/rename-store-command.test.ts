/** Record rename composes the production marker, worktree and command adapters. */
import { afterEach, expect, it } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
import { runStoreRename } from "../../src/lib/work-unit/verbs/rename-store.js";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createTempRepoCore, removeGitBackedDirs } from "../helpers/temp-repo.js";
import { makeGitExec } from "../helpers/integration.js";
import { createLifecycleHarness, lifecycleSuccess } from "../helpers/store/lifecycle-harness.js";
import { createUserIOContext } from "../../src/lib/io-context.js";
import { RenameCommandInputSchema } from "../../src/handlers/lifecycle.js";
import { runRenameCommand } from "../../src/commands/rename.js";
import { makeGitProcessError } from "../helpers/git-exec-fake.js";
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

it("keeps a peer's advanced old remote head through a rename retry until the new branch preserves it", async () => {
  const f = await fixture(false); const remote = join(f.root, ".git", "remote.git");
  await f.exec("git", ["init", "--bare", remote]); await f.exec("git", ["remote", "add", "origin", remote]);
  await f.exec("git", ["push", "origin", "feat/source"]);
  let failPush = true;
  f.command.io.exec = async (command, args, options) => {
    if (failPush && args.join(" ") === "push -u origin feat/target") {
      failPush = false; throw makeGitProcessError({ command: "git", args, exitCode: 1, stderr: "temporary push failure" });
    }
    return f.exec(command, args, options);
  };
  const params = { sourceSlug: "source", targetSlug: "target" };
  expect(await runRenameCommand(f.command, params)).toMatchObject({ status: "partial" });
  const peer = join(f.root, ".git", "peer"); await f.exec("git", ["clone", "--branch", "feat/source", remote, peer]);
  const peerExec = makeGitExec(peer);
  await peerExec("git", ["config", "user.name", "Peer"]); await peerExec("git", ["config", "user.email", "peer@example.invalid"]);
  await writeFile(join(peer, "peer-work"), "preserve this peer commit\n"); await peerExec("git", ["add", "peer-work"]);
  await peerExec("git", ["commit", "-m", "peer work"]); await peerExec("git", ["push", "origin", "feat/source"]);
  const advanced = (await peerExec("git", ["rev-parse", "HEAD"])).stdout.trim();
  expect(await runRenameCommand(f.command, params)).toMatchObject({ status: "partial", reason: expect.stringMatching(/preserv|fetch|merge/iu) });
  expect((await f.exec("git", ["ls-remote", "--heads", "origin", "refs/heads/feat/source"])).stdout).toContain(advanced);
  await f.exec("git", ["fetch", "origin", "+refs/heads/feat/source:refs/remotes/origin/feat/source"]);
  await f.exec("git", ["merge", "--ff-only", "refs/remotes/origin/feat/source"]);
  expect(await runRenameCommand(f.command, params)).toMatchObject({ status: "renamed", recordBatch: "existing" });
  expect((await f.exec("git", ["ls-remote", "--heads", "origin", "refs/heads/feat/source"])).stdout).toBe("");
  expect((await f.exec("git", ["ls-remote", "--heads", "origin", "refs/heads/feat/target"])).stdout).toContain(advanced);
  expect(await readFile(join(f.root, "peer-work"), "utf8")).toBe("preserve this peer commit\n");
}, 30_000);

it.each([false, true])("defers the holder's own folder move while completing the logical rename, detached=%s", async (detached) => {
  const f = await fixture(true);
  if (detached) {
    await f.exec("git", ["switch", "--detach"], { cwd: f.checkout });
    lifecycleSuccess(await f.store.write({ action: "put", reference: f.primary.reference, expected: f.primary.version,
      content: f.primary.content, placement: { kind: "active" }, links: { branches: [] }, provenance: { verb: "unlink", lifecycleAction: "unlink" } }));
  }
  await mkdir(join(f.checkout, "inside"));
  const boundCwd = join(f.checkout, "inside");
  const command = { ...f.command, cwd: boundCwd, io: { ...f.command.io, exec: makeGitExec(boundCwd) } };
  command.io.exec = async (cmd, args, options) => {
    if (args[0] === "worktree" && args[1] === "move") throw makeGitProcessError({ command: "git", args, exitCode: 128, stderr: "Permission denied: occupied directory" });
    return f.exec(cmd, args, { cwd: boundCwd, ...options });
  };
  const result = await runRenameCommand(command, { sourceSlug: "source", targetSlug: "target" });
  expect(result).toMatchObject({ status: "renamed", checkout: { checkoutPath: f.checkout },
    worktree: { followUpNotice: expect.stringContaining("git worktree move -f -f") } });
  expect(lifecycleSuccess(await f.store.read({ reference: f.primary.reference })).reference.owner.name).toBe("target");
  expect(await readWorktreeMarker(f.checkout)).toMatchObject({ kind: "present", marker: { wuName: "target", renameMovePending: {
    from: f.checkout, to: f.target, branch: detached ? null : "feat/target",
  } } });
  await f.exec("git", ["worktree", "move", "-f", "-f", f.checkout, f.target]);
  expect(await readWorktreeMarker(f.target)).toMatchObject({ kind: "present", marker: { wuName: "target" } });
});

it.each([false, true])("rolls back only its tracking changes after record conflict, concurrent tracking=%s", async (concurrent) => {
  const f = await fixture(false);
  const key = "branch.feat/source";
  await f.exec("git", ["config", "--local", `${key}.remote`, "."]);
  await f.exec("git", ["config", "--local", "--add", `${key}.merge`, "refs/heads/main"]);
  await f.exec("git", ["config", "--local", "--add", `${key}.merge`, "refs/heads/extra"]);
  const batch = f.store.batch.bind(f.store); let once = true;
  f.store.batch = async (input) => {
    if (once) {
      once = false;
      lifecycleSuccess(await f.store.write({ action: "put", reference: f.primary.reference, expected: f.primary.version,
        placement: { kind: "active" }, content: f.primary.content, provenance: { verb: "edit", lifecycleAction: "edit" } }));
      if (concurrent) {
        await f.exec("git", ["config", "--local", "branch.feat/target.remote", "."]);
        await f.exec("git", ["config", "--local", "branch.feat/target.merge", "refs/heads/main"]);
      }
    }
    return batch(input);
  };
  const params = { sourceSlug: "source", targetSlug: "target" };
  expect(await runRenameCommand(f.command, params)).toMatchObject({ status: "rejected", refusal: { code: "version-conflict" } });
  expect(lifecycleSuccess(await f.store.read({ reference: f.primary.reference })).reference.owner.name).toBe("source");
  expect((await f.exec("git", ["symbolic-ref", "--short", "HEAD"])).stdout.trim()).toBe("feat/source");
  expect((await f.exec("git", ["config", "--local", "--get-all", `${key}.remote`])).stdout.trim()).toBe(".");
  expect((await f.exec("git", ["config", "--local", "--get-all", `${key}.merge`])).stdout.trim().split("\n"))
    .toEqual(concurrent ? ["refs/heads/main"] : ["refs/heads/main", "refs/heads/extra"]);
  expect(await runRenameCommand(f.command, params)).toMatchObject({ status: "renamed" });
  expect((await f.exec("git", ["for-each-ref", "--format=%(upstream)", "refs/heads/feat/target"])).stdout.trim()).toBe("");
}, 30_000);


it("renames the promoted work branch while retaining the holder's Errand link and remote", async () => {
  const f = await fixture(false);
  await f.exec("git", ["switch", "-c", "chore/source", "main"]);
  const before = (await f.exec("git", ["rev-parse", "chore/source"])).stdout.trim();
  const remote = join(f.root, ".git", "remote.git");
  await f.exec("git", ["init", "--bare", remote]); await f.exec("git", ["remote", "add", "origin", remote]);
  await f.exec("git", ["push", "origin", "chore/source", "feat/source"]);
  const errand = { repository: "repo", ref: "chore/source", linkedAs: "created" as const, excluded: [] };
  lifecycleSuccess(await f.store.write({ action: "put", reference: f.primary.reference, expected: f.primary.version,
    content: f.primary.content, placement: { kind: "active" }, links: { branches: [errand, ...f.primary.links!.branches!] },
    provenance: { verb: "edit", lifecycleAction: "edit" } }));
  const input = RenameCommandInputSchema.parse({ slug: "source", newSlug: "target" });
  expect(await runRenameCommand(f.command, { sourceSlug: input.slug, targetSlug: input.newSlug })).toMatchObject({ status: "renamed",
    keptBranches: ["chore/source"] });
  const current = lifecycleSuccess(await f.store.read({ reference: f.primary.reference }));
  expect(current.links?.branches).toEqual([errand, { ...f.primary.links!.branches![0], ref: "feat/target" }]);
  expect((await f.exec("git", ["rev-parse", "chore/source"])).stdout.trim()).toBe(before);
  expect((await f.exec("git", ["symbolic-ref", "--short", "HEAD"])).stdout.trim()).toBe("chore/source");
  expect((await f.exec("git", ["ls-remote", "--heads", "origin", "refs/heads/chore/source"])).stdout).toContain(before);
  expect((await f.exec("git", ["ls-remote", "--heads", "origin", "refs/heads/feat/source"])).stdout).toBe("");
  expect((await f.exec("git", ["ls-remote", "--heads", "origin", "refs/heads/feat/target"])).stdout).toContain(before);
}, 30_000);

it("reports a failed inner checkout rollback before receipt return and retries after owner repair", async () => {
  const f = await fixture(true), marker = await readFile(resolveWorktreeMarkerPath(f.checkout));
  f.command.io.exec = async (command, args, options) => {
    if (args[0] === "worktree" && args[1] === "move") {
      if (args.at(-2) === f.checkout) {
        await f.exec(command, args, options);
        throw makeGitProcessError({ command, args, exitCode: 128, stderr: "post-move failure" });
      }
      throw makeGitProcessError({ command, args, exitCode: 128, stderr: "owner must repair blocked inverse move" });
    }
    return f.exec(command, args, options);
  };
  const params = { sourceSlug: "source", targetSlug: "target" };
  const result = await runRenameCommand(f.command, params);
  expect(result).toMatchObject({ status: "rejected", recovery: { kind: "rollback",
    failures: [{ step: "checkout-rename", reason: expect.stringContaining("blocked inverse move") }],
    inspect: [["arc", "locus", "--json"], ["git", "worktree", "list", "--porcelain"]],
    repair: expect.stringMatching(/owner.*preserve/isu), retryAfterRepair: [["arc", "rename", "source", "target"]] } });
  if (result.status !== "rejected") throw new Error("Expected rejected preparation");
  expect(result.recovery?.failures[0]?.reason).toContain(f.target);
  expect(lifecycleSuccess(await f.store.read({ reference: f.primary.reference }))).toEqual(f.primary);
  expect(await readWorktreeMarker(f.target)).toMatchObject({ kind: "present", marker: { wuName: "target" } });
  await expect(readFile(resolveWorktreeMarkerPath(f.checkout))).rejects.toMatchObject({ code: "ENOENT" });
  f.command.io.exec = f.exec;
  await f.exec("git", ["worktree", "move", "-f", "-f", f.target, f.checkout]);
  await writeFile(resolveWorktreeMarkerPath(f.checkout), marker);
  expect(await runRenameCommand(f.command, params)).toMatchObject({ status: "renamed" });
  expect(lifecycleSuccess(await f.store.read({ reference: f.primary.reference })).reference.owner.name).toBe("target");
}, 30_000);

it("retains compensation before the adapter's final marker observation and preserves a concurrent generation", async () => {
  const f = await fixture(false), path = resolveWorktreeMarkerPath(f.checkout), original = await readFile(path);
  const adapter = storeRenameAdapters(f.command).renameCheckout!;
  let concurrent: Buffer | undefined;
  const result = await runStoreRename({ store: f.store, cwd: f.root, exec: f.exec, baseBranch: "main", projectId: async () => "repo",
    locusPorts: { checkMarkerExclusivity: async () => ({ kind: "clear" }), findHoldingCheckout: async () => f.checkout,
      writeAnchoredMarker: async () => ({ kind: "unadmitted" }) },
    renameCheckout: (request, onPrepared) => adapter(request, (receipt) => {
      onPrepared?.(receipt);
      const marker = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
      concurrent = Buffer.from(`${JSON.stringify({ ...marker, spawningIdentity: "another-user" })}\n`);
      writeFileSync(path, concurrent);
    }),
  }, { sourceSlug: "source", targetSlug: "target" });
  expect(result).toMatchObject({ status: "rejected", reason: expect.stringContaining("marker changed"),
    recovery: { kind: "rollback", failures: [{ step: "checkout-rename", reason: expect.stringContaining("marker changed") }],
      retryAfterRepair: [["arc", "rename", "source", "target"]] } });
  expect(await readFile(path)).toEqual(concurrent);
  expect(lifecycleSuccess(await f.store.read({ reference: f.primary.reference }))).toEqual(f.primary);
  await writeFile(path, original);
  expect(await runRenameCommand(f.command, { sourceSlug: "source", targetSlug: "target" })).toMatchObject({ status: "renamed" });
});
