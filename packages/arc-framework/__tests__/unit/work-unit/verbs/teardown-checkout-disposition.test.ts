/** Folderless retirement and dormant anchored-checkout decisions. */
import { afterEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runTeardown, type TeardownContext } from "../../../../src/lib/work-unit/verbs/teardown.js";
import { nodeReconcileWorkUnitWorktreeFs } from "../../../../src/lib/work-unit/mutators/reconcile-work-unit-worktree.js";
import { passingProjectionRemovalSlots } from "../../../../src/lib/git/worktree-removal.js";
import { resolveWorktreeMarkerPath } from "../../../../src/lib/git/worktree-marker.js";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

async function harness(mode: "shipped" | "abandoned", options: { anchored?: boolean; missing?: boolean; dirty?: boolean; primaryHeld?: boolean } = {}) {
  const primary = await mkdtemp(join(tmpdir(), "arc-checkout-disposition-")); roots.push(primary);
  const checkout = options.primaryHeld ? primary : join(primary, "linked-demo");
  if (!options.missing) {
    await mkdir(join(checkout, ".arc/system/.internal"), { recursive: true });
    await writeFile(resolveWorktreeMarkerPath(checkout), "original marker\n");
    if (options.dirty) await writeFile(join(checkout, "changed-file"), "keep changes\n");
  }
  const meta = ["# Metadata: demo", "", "| **State** | **Owner** | **Branch** | **Class** | **Priority** |", "| --- | --- | --- | --- | --- |", `| ${mode === "shipped" ? "Shipped" : "Active"} | andrew | feat/demo | Novel | P1 |`, "", "---", ""].join("\n");
  const metaDir = mode === "shipped" ? ".arc/completed/2026-q4/01_demo" : ".arc/active";
  await mkdir(join(primary, metaDir), { recursive: true });
  if (mode === "shipped") await writeFile(join(primary, metaDir, "meta-demo.md"), meta);
  let registered = true; let branchPresent = true; let markerReleased = false;
  const marker = { spawnedByArc: options.anchored !== true, wuName: "demo", spawningIdentity: "andrew", createdAt: "2026-01-01T00:00:00.000Z" };
  const ctx: TeardownContext = {
    cwd: primary,
    indexFs: { readdir: (path) => readdir(path, { withFileTypes: true }), readFile: (path) => readFile(path, "utf8") },
    exec: async (_cmd, args) => {
      if (args[0] === "worktree" && args[1] === "list") return { stdout: `worktree ${primary}\0HEAD abc\0branch refs/heads/${options.primaryHeld ? "feat/demo" : "main"}\0\0${registered && !options.primaryHeld ? `worktree ${checkout}\0HEAD abc\0branch refs/heads/feat/demo\0\0` : ""}` };
      if (args[0] === "status") return { stdout: options.dirty ? " M changed-file\n" : "" };
      if (args[0] === "for-each-ref") return { stdout: branchPresent ? "feat/demo\n" : "" };
      if (args[0] === "worktree" && args[1] === "remove") { registered = false; return { stdout: "" }; }
      if (args[0] === "branch" || args[0] === "update-ref") branchPresent = false;
      if (args[0] === "show-ref" && !branchPresent) throw Error("branch absent");
      if (args[0] === "rev-parse") return { stdout: "abc\n" };
      if (args[0] === "ls-tree") return { stdout: mode === "shipped" ? `${metaDir}/meta-demo.md\0` : "" };
      if (args[0] === "show") return { stdout: meta };
      return { stdout: "" };
    },
    chdir: () => { throw Error("outside checkout must not hop"); },
    serializeWorktreeOperation: async (_path, operation) => operation(),
    worktreeFs: { ...nodeReconcileWorkUnitWorktreeFs, removeFile: async (path) => { await rm(path); markerReleased = true; } },
    readMarker: async () => options.missing ? { kind: "absent" } : { kind: "present", marker },
    readBlob: async () => new TextEncoder().encode(meta),
    authority: {
      authorize: async (request) => ({ status: "authorized", authorization: "discard-confirmed", authorityVersion: "fixture", evidence: { kind: "git-transition", transition: "abandon", resultDigest: `sha256:${"0".repeat(64)}` }, refs: { localOid: request.head, remote: null } }),
      revalidate: async () => ({ status: "valid" }),
    },
  };
  return { ctx, checkout, state: () => ({ registered, branchPresent, markerReleased }) };
}

describe("teardown checkout disposition", () => {
  it.each(["shipped", "abandoned"] as const)("releases a dirty anchored checkout in %s mode while keeping its branch", async (mode) => {
    const h = await harness(mode, { anchored: true, dirty: true });
    const result = await runTeardown(h.ctx, { name: "demo", base: "main", mode });
    expect(result).toMatchObject({ status: "torn-down", worktreeRemoved: null, branchDeleted: false });
    expect(h.state()).toEqual({ registered: true, branchPresent: true, markerReleased: true });
    expect((await stat(h.checkout)).isDirectory()).toBe(true);
    expect(await readFile(join(h.checkout, "changed-file"), "utf8")).toBe("keep changes\n");
  });
  it("leaves the marker intact when the projection release refuses", async () => {
    const h = await harness("shipped", { anchored: true, dirty: true });
    h.ctx.projectionRemovalSlots = { ...passingProjectionRemovalSlots, release: async () => ({ kind: "refused", remedy: { text: "resolve projection conflict" } }) };
    expect(await runTeardown(h.ctx, { name: "demo", base: "main" })).toMatchObject({ status: "rejected", reason: "resolve projection conflict" });
    expect(await readFile(resolveWorktreeMarkerPath(h.checkout), "utf8")).toBe("original marker\n");
    expect(h.state()).toEqual({ registered: true, branchPresent: true, markerReleased: false });
  });
  it("keeps an authorized primary branch when its projection release refuses", async () => {
    const h = await harness("abandoned", { primaryHeld: true });
    h.ctx.projectionRemovalSlots = { ...passingProjectionRemovalSlots, release: async () => ({ kind: "refused", remedy: { text: "resolve projection conflict" } }) };
    expect(await runTeardown(h.ctx, { name: "demo", base: "main", mode: "abandoned" })).toMatchObject({ status: "torn-down", branchDeleted: false, notices: expect.arrayContaining([expect.stringContaining("resolve projection conflict")]) });
    expect(h.state()).toEqual({ registered: true, branchPresent: true, markerReleased: false });
  });
  it("prunes a missing abandoned checkout directly without stamping a husk", async () => {
    const h = await harness("abandoned", { missing: true });
    expect(await runTeardown(h.ctx, { name: "demo", base: "main", mode: "abandoned" })).toMatchObject({ status: "torn-down", worktreeRemoved: h.checkout, husk: null });
    expect(h.state()).toEqual({ registered: false, branchPresent: false, markerReleased: false });
  });
});
