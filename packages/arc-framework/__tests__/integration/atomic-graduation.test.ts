import { execFile } from "node:child_process";
import { chmod, mkdir, readFile, rename, rm, rmdir, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

import { renderMetaFile } from "../../src/lib/active/meta-reader.js";
import { parseMetaRecord } from "../../src/lib/active/meta-reader.js";
import { digestBytes } from "../../src/lib/canonical/canonical-json.js";
import { createExecaGitExec } from "../../src/lib/git/process-executor.js";
import type { GitExec } from "../../src/lib/git/exec.js";
import { resolveWorktreeMarkerPath } from "../../src/lib/git/worktree-marker.js";
import { scanRegisteredWorktrees } from "../../src/lib/git/worktree-roster.js";
import { deriveLocusRecordId } from "../../src/lib/locus/path-identity.js";
import { locusRecordPath as resolveRecordPath, resolveLocusRoot } from "../../src/lib/locus/root.js";
import {
  nodeReconcileWorkUnitWorktreeFs,
  provisionSpawnedWorktree,
} from "../../src/lib/work-unit/mutators/reconcile-work-unit-worktree.js";
import {
  atomicGraduate,
} from "../../src/lib/work-unit/atomic-graduation.js";
import {
  prepareValidatedGraduationTransaction,
  type GraduationStoredArtifact,
} from "../../src/lib/work-unit/validated-graduation-transaction.js";
import { cleanupTempDir, createTempRepo } from "../helpers/integration.js";

const execFileAsync = promisify(execFile);

async function locusRecordPath(exec: GitExec, checkout: string): Promise<string> {
  const root = await resolveLocusRoot({
    identity: "andrew",
    scan: () => scanRegisteredWorktrees(exec),
  });
  if (!root.ok) throw new Error(root.message);
  const identity = deriveLocusRecordId(checkout, process.platform === "win32" ? "windows" : "posix");
  return resolveRecordPath(root, identity.digest);
}

async function createInPlaceFixture(): Promise<{
  repo: string;
  exec: GitExec;
  transaction: Extract<
    ReturnType<typeof prepareValidatedGraduationTransaction>,
    { status: "ready" }
  >["transaction"];
  sourceDirectory: string;
  targetDirectory: string;
  indexTree: string;
}> {
  const repo = await createTempRepo("arc-atomic-graduate-failure-");
  const sourceDirectory = ".arc/backlog/planned/widget";
  const targetDirectory = ".arc/active";
  await mkdir(join(repo, sourceDirectory), { recursive: true });
  const metaContent = renderMetaFile("widget", {
    state: "Planning",
    owner: "andrew",
    workClass: "Heavy",
    design: ["draft-widget.md"],
    currentWorkflow: "create-spec",
  });
  await writeFile(join(repo, sourceDirectory, "meta-widget.md"), metaContent);
  await writeFile(join(repo, sourceDirectory, "draft-widget.md"), "# Draft\n");
  await chmod(join(repo, sourceDirectory, "draft-widget.md"), 0o755);
  await execFileAsync("git", ["add", "-A"], { cwd: repo });
  await execFileAsync("git", ["-c", "core.hooksPath=/dev/null", "commit", "-m", "stub"], { cwd: repo });
  const processExec = createExecaGitExec();
  const exec: GitExec = (command, args, options) => processExec(command, args, {
    ...options,
    cwd: options?.cwd ?? repo,
  });
  const { stdout: head } = await exec("git", ["rev-parse", "HEAD"]);
  const { stdout: tree } = await exec("git", ["write-tree"]);
  const artifacts: GraduationStoredArtifact[] = [];
  for (const basename of ["draft-widget.md", "meta-widget.md"]) {
    const sourcePath = `${sourceDirectory}/${basename}`;
    const { stdout: entry } = await exec("git", ["ls-files", "--stage", "--", sourcePath]);
    const match = /^(100644|100755) ([0-9a-f]{40,64}) 0\t/u.exec(entry);
    if (match?.[1] === undefined || match[2] === undefined) throw new Error("fixture index entry missing");
    const bytes = new Uint8Array(await readFile(join(repo, sourcePath)));
    artifacts.push({
      basename,
      sourcePath,
      targetPath: `${targetDirectory}/${basename}`,
      objectKind: "blob",
      mode: match[1] === "100755" ? "100755" : "100644",
      oid: match[2],
      contentDigest: digestBytes(bytes),
      bytes,
    });
  }
  const prepared = prepareValidatedGraduationTransaction({
    slug: "widget",
    location: "planned",
    sourceDirectory,
    targetDirectory,
    artifacts,
    destinations: artifacts.map(({ targetPath }) => ({ path: targetPath, state: { kind: "absent" } })),
    anchor: null,
    classResolution: { kind: "preserved", value: "Heavy" },
    occupation: {
      mode: "in-place",
      baseHead: head.trim(),
      branch: { kind: "absent", ref: "refs/heads/plan/widget" },
      worktree: { kind: "current", path: repo, head: head.trim(), branch: "main" },
      indexTree: tree.trim(),
      operation: { kind: "in-place", branch: "plan/widget", worktreePath: repo },
    },
  });
  if (prepared.status !== "ready") throw new Error(`fixture transaction refused: ${prepared.reason}`);
  return {
    repo,
    exec,
    transaction: prepared.transaction,
    sourceDirectory,
    targetDirectory,
    indexTree: tree.trim(),
  };
}

describe("atomicGraduate", () => {
  const cleanup: string[] = [];

  afterEach(async () => {
    await Promise.all(cleanup.splice(0).map((path) => cleanupTempDir(path)));
  });

  it("graduates in place through exact files and one installed index", async () => {
    const repo = await createTempRepo("arc-atomic-graduate-");
    cleanup.push(repo);
    const sourceDirectory = ".arc/backlog/planned/widget";
    const targetDirectory = ".arc/active";
    await mkdir(join(repo, sourceDirectory), { recursive: true });
    const metaContent = renderMetaFile("widget", {
      state: "Planning",
      owner: "andrew",
      workClass: "Heavy",
      design: ["draft-widget.md"],
      currentWorkflow: "create-spec",
    });
    await writeFile(join(repo, sourceDirectory, "meta-widget.md"), metaContent);
    await writeFile(join(repo, sourceDirectory, "draft-widget.md"), "# Draft\n");
    await chmod(join(repo, sourceDirectory, "draft-widget.md"), 0o755);
    await execFileAsync("git", ["add", "-A"], { cwd: repo });
    await execFileAsync("git", ["-c", "core.hooksPath=/dev/null", "commit", "-m", "stub"], { cwd: repo });
    const processExec = createExecaGitExec();
    const exec: GitExec = (command, args, options) => processExec(command, args, {
      ...options,
      cwd: options?.cwd ?? repo,
    });
    const { stdout: head } = await exec("git", ["rev-parse", "HEAD"]);
    const { stdout: tree } = await exec("git", ["write-tree"]);
    const artifacts: GraduationStoredArtifact[] = [];
    for (const basename of ["draft-widget.md", "meta-widget.md"]) {
      const sourcePath = `${sourceDirectory}/${basename}`;
      const { stdout: entry } = await exec("git", ["ls-files", "--stage", "--", sourcePath]);
      const match = /^(100644|100755) ([0-9a-f]{40,64}) 0\t/u.exec(entry);
      if (match?.[1] === undefined || match[2] === undefined) throw new Error("fixture index entry missing");
      const bytes = new Uint8Array(await readFile(join(repo, sourcePath)));
      artifacts.push({
        basename,
        sourcePath,
        targetPath: `${targetDirectory}/${basename}`,
        objectKind: "blob",
        mode: match[1] === "100755" ? "100755" : "100644",
        oid: match[2],
        contentDigest: digestBytes(bytes),
        bytes,
      });
    }
    const prepared = prepareValidatedGraduationTransaction({
      slug: "widget",
      location: "planned",
      sourceDirectory,
      targetDirectory,
      artifacts,
      destinations: artifacts.map(({ targetPath }) => ({ path: targetPath, state: { kind: "absent" } })),
      anchor: null,
      classResolution: { kind: "preserved", value: "Heavy" },
      occupation: {
        mode: "in-place",
        baseHead: head.trim(),
        branch: { kind: "absent", ref: "refs/heads/plan/widget" },
        worktree: { kind: "current", path: repo, head: head.trim(), branch: "main" },
        indexTree: tree.trim(),
        operation: { kind: "in-place", branch: "plan/widget", worktreePath: repo },
      },
    });
    if (prepared.status !== "ready") throw new Error(`fixture transaction refused: ${prepared.reason}`);

    const result = await atomicGraduate(prepared.transaction, {
      cwd: repo,
      exec,
      fs: { chmod, mkdir, readFile, rename, rm, rmdir, stat, writeFile },
    });

    if (result.status !== "applied") throw new Error(JSON.stringify(result));
    await expect(readFile(join(repo, targetDirectory, "draft-widget.md"), "utf8")).resolves.toBe("# Draft\n");
    await expect(readFile(join(repo, sourceDirectory, "draft-widget.md"), "utf8")).rejects.toMatchObject({
      code: "ENOENT",
    });
    const { stdout: branch } = await exec("git", ["branch", "--show-current"]);
    expect(branch.trim()).toBe("plan/widget");
    const { stdout: staged } = await exec("git", ["diff", "--cached", "--name-status"]);
    expect(staged).toContain(`${"R"}${100}\t${sourceDirectory}/draft-widget.md\t${targetDirectory}/draft-widget.md`);
    await expect(readFile(await locusRecordPath(exec, repo))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("graduates into a spawned worktree with exact meta authority and ownership", async () => {
    const repo = await createTempRepo("arc-atomic-graduate-spawn-");
    const worktreePath = `${repo}-widget`;
    cleanup.push(repo, worktreePath);
    const sourceDirectory = ".arc/backlog/planned/widget";
    const targetDirectory = ".arc/active";
    await mkdir(join(repo, sourceDirectory), { recursive: true });
    const metaContent = renderMetaFile("widget", {
      state: "Planning",
      owner: "andrew",
      workClass: "Heavy",
      design: ["draft-widget.md"],
      currentWorkflow: "create-spec",
    });
    await writeFile(join(repo, sourceDirectory, "meta-widget.md"), metaContent);
    await writeFile(join(repo, sourceDirectory, "draft-widget.md"), "# Draft\n");
    await chmod(join(repo, sourceDirectory, "draft-widget.md"), 0o755);
    await execFileAsync("git", ["add", "-A"], { cwd: repo });
    await execFileAsync("git", ["-c", "core.hooksPath=/dev/null", "commit", "-m", "stub"], { cwd: repo });
    const processExec = createExecaGitExec();
    const exec: GitExec = (command, args, options) => processExec(command, args, {
      ...options,
      cwd: options?.cwd ?? repo,
    });
    const { stdout: head } = await exec("git", ["rev-parse", "HEAD"]);
    const { stdout: tree } = await exec("git", ["write-tree"]);
    const artifacts: GraduationStoredArtifact[] = [];
    for (const basename of ["draft-widget.md", "meta-widget.md"]) {
      const sourcePath = `${sourceDirectory}/${basename}`;
      const { stdout: entry } = await exec("git", ["ls-files", "--stage", "--", sourcePath]);
      const match = /^(100644|100755) ([0-9a-f]{40,64}) 0\t/u.exec(entry);
      if (match?.[1] === undefined || match[2] === undefined) throw new Error("fixture index entry missing");
      const bytes = new Uint8Array(await readFile(join(repo, sourcePath)));
      artifacts.push({
        basename,
        sourcePath,
        targetPath: `${targetDirectory}/${basename}`,
        objectKind: "blob",
        mode: match[1] === "100755" ? "100755" : "100644",
        oid: match[2],
        contentDigest: digestBytes(bytes),
        bytes,
      });
    }
    const prepared = prepareValidatedGraduationTransaction({
      slug: "widget",
      location: "planned",
      sourceDirectory,
      targetDirectory,
      artifacts,
      destinations: artifacts.map(({ targetPath }) => ({ path: targetPath, state: { kind: "absent" } })),
      anchor: null,
      classResolution: { kind: "preserved", value: "Heavy" },
      occupation: {
        mode: "spawned",
        baseHead: head.trim(),
        branch: { kind: "absent", ref: "refs/heads/plan/widget" },
        worktree: { kind: "absent", path: worktreePath },
        indexTree: tree.trim(),
        operation: {
          kind: "spawned",
          branch: "plan/widget",
          base: head.trim(),
          worktreePath,
          locationTemplate: `${repo}-{name}`,
          repo: "repo",
          wuName: "widget",
          spawningIdentity: "andrew",
        },
      },
    });
    if (prepared.status !== "ready") throw new Error(`fixture transaction refused: ${prepared.reason}`);

    const result = await atomicGraduate(prepared.transaction, {
      cwd: repo,
      exec,
      fs: { chmod, mkdir, readFile, rename, rm, rmdir, stat, writeFile },
      provisionSpawnedWorktree: (op) => provisionSpawnedWorktree(
        { exec, chdir: () => undefined, fs: nodeReconcileWorkUnitWorktreeFs },
        op,
      ),
    });

    if (result.status !== "applied") throw new Error(JSON.stringify(result));
    expect(result.worktreePath).toBe(worktreePath);
    expect(result.postCreateNotice).toMatch(/worktree\.post_create/u);
    const meta = parseMetaRecord(await readFile(join(worktreePath, targetDirectory, "meta-widget.md"), "utf8"));
    expect(meta.design).toEqual(["draft-widget.md"]);
    expect(meta.taskList).toBeNull();
    expect(meta.currentWorkflow).toBe("create-spec");
    await expect(readFile(resolveWorktreeMarkerPath(worktreePath), "utf8")).resolves.toContain("\"wuName\": \"widget\"");
    const { stdout: staged } = await exec("git", ["diff", "--cached", "--name-status"], { cwd: worktreePath });
    expect(staged).toContain(`${"R"}${100}\t${sourceDirectory}/draft-widget.md\t${targetDirectory}/draft-widget.md`);
    await expect(readFile(await locusRecordPath(exec, worktreePath))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it.each(["branch", "first-move", "second-move", "meta-write", "index-stage"] as const)(
    "restores exact in-place preimages when %s application fails",
    async (boundary) => {
      const fixture = await createInPlaceFixture();
      cleanup.push(fixture.repo);
      let renameCalls = 0;
      const exec: GitExec = async (command, args, options) => {
        if (boundary === "branch" && args[0] === "checkout" && args[1] === "-b") {
          throw new Error("injected branch failure");
        }
        if (boundary === "index-stage" && args[0] === "add" && options?.indexFile !== undefined) {
          throw new Error("injected index staging failure");
        }
        return fixture.exec(command, args, options);
      };
      const injectedWriteFile: typeof writeFile = async (path, data, options) => {
        if (boundary === "meta-write" && String(path).endsWith("/.arc/active/meta-widget.md")) {
          throw new Error("injected meta write failure");
        }
        return writeFile(path, data, options);
      };
      const result = await atomicGraduate(fixture.transaction, {
        cwd: fixture.repo,
        exec,
        fs: {
          chmod,
          mkdir,
          readFile,
          rename: async (from, to) => {
            renameCalls += 1;
            if ((boundary === "first-move" && renameCalls === 1)
              || (boundary === "second-move" && renameCalls === 2)) {
              throw new Error(`injected ${boundary} failure`);
            }
            await rename(from, to);
          },
          rm,
          rmdir,
          stat,
          writeFile: injectedWriteFile,
        },
      });

      expect(result.status).toBe("rejected");
      await expect(readFile(join(fixture.repo, fixture.sourceDirectory, "draft-widget.md"), "utf8"))
        .resolves.toBe("# Draft\n");
      expect((await stat(join(fixture.repo, fixture.sourceDirectory, "draft-widget.md"))).mode & 0o111)
        .not.toBe(0);
      await expect(readFile(join(fixture.repo, fixture.targetDirectory, "draft-widget.md")))
        .rejects.toMatchObject({ code: "ENOENT" });
      const { stdout: branch } = await fixture.exec("git", ["branch", "--show-current"]);
      expect(branch.trim()).toBe("main");
      const { stdout: created } = await fixture.exec(
        "git",
        ["for-each-ref", "--format=%(refname)", "refs/heads/plan/widget"],
      );
      expect(created).toBe("");
      const { stdout: tree } = await fixture.exec("git", ["write-tree"]);
      expect(tree.trim()).toBe(fixture.indexTree);
      await expect(readFile(await locusRecordPath(fixture.exec, fixture.repo)))
        .rejects.toMatchObject({ code: "ENOENT" });
    },
  );

  it("returns exact non-authoritative residue when rollback cannot remove the created branch", async () => {
    const fixture = await createInPlaceFixture();
    cleanup.push(fixture.repo);
    const exec: GitExec = async (command, args, options) => {
      if (args[0] === "add" && options?.indexFile !== undefined) throw new Error("injected staging failure");
      if (args[0] === "update-ref" && args[1] === "-d") throw new Error("injected rollback failure");
      return fixture.exec(command, args, options);
    };
    const result = await atomicGraduate(fixture.transaction, {
      cwd: fixture.repo,
      exec,
      fs: { chmod, mkdir, readFile, rename, rm, rmdir, stat, writeFile },
    });

    expect(result).toMatchObject({
      status: "graduation-recovery-required",
      residue: {
        slug: "widget",
        branch: "plan/widget",
        mode: "in-place",
        failures: expect.arrayContaining([
          expect.objectContaining({ stage: "branch", locus: "refs/heads/plan/widget" }),
        ]),
      },
    });
  });

  it.each(["worktree-add", "spawn-provision"] as const)(
    "removes spawned occupation when %s fails",
    async (boundary) => {
      const fixture = await createInPlaceFixture();
      const worktreePath = `${fixture.repo}-widget`;
      cleanup.push(fixture.repo, worktreePath);
      fixture.transaction.occupation = {
        mode: "spawned",
        baseHead: fixture.transaction.occupation.baseHead,
        branch: fixture.transaction.occupation.branch,
        worktree: { kind: "absent", path: worktreePath },
        indexTree: fixture.transaction.occupation.indexTree,
        operation: {
          kind: "spawned",
          branch: "plan/widget",
          base: fixture.transaction.occupation.baseHead,
          worktreePath,
          locationTemplate: `${fixture.repo}-{name}`,
          repo: "repo",
          wuName: "widget",
          spawningIdentity: "andrew",
        },
      };
      const exec: GitExec = async (command, args, options) => {
        if (boundary === "worktree-add" && args[0] === "worktree" && args[1] === "add") {
          throw new Error("injected worktree add failure");
        }
        return fixture.exec(command, args, options);
      };
      const result = await atomicGraduate(fixture.transaction, {
        cwd: fixture.repo,
        exec,
        fs: { chmod, mkdir, readFile, rename, rm, rmdir, stat, writeFile },
        provisionSpawnedWorktree: async () => {
          if (boundary === "spawn-provision") throw new Error("injected marker failure");
          return null;
        },
      });

      expect(result.status).toBe("rejected");
      await expect(stat(worktreePath)).rejects.toMatchObject({ code: "ENOENT" });
      const { stdout: created } = await fixture.exec(
        "git",
        ["for-each-ref", "--format=%(refname)", "refs/heads/plan/widget"],
      );
      expect(created).toBe("");
    },
  );

  it("refuses source snapshot drift without occupying or moving another artifact set", async () => {
    const fixture = await createInPlaceFixture();
    cleanup.push(fixture.repo);
    await writeFile(join(fixture.repo, fixture.sourceDirectory, "draft-widget.md"), "# changed\n");

    const result = await atomicGraduate(fixture.transaction, {
      cwd: fixture.repo,
      exec: fixture.exec,
      fs: { chmod, mkdir, readFile, rename, rm, rmdir, stat, writeFile },
    });

    expect(result).toMatchObject({ status: "rejected", reason: expect.stringContaining("source preimage changed") });
    const { stdout: branch } = await fixture.exec("git", ["branch", "--show-current"]);
    expect(branch.trim()).toBe("main");
    await expect(readFile(join(fixture.repo, fixture.targetDirectory, "draft-widget.md")))
      .rejects.toMatchObject({ code: "ENOENT" });
  });

  it("removes decomposition provenance while preserving Design and unset task authority on disk", async () => {
    const fixture = await createInPlaceFixture();
    cleanup.push(fixture.repo);
    const receiptId = `sha256:${"c".repeat(64)}`;
    const metaPath = join(fixture.repo, fixture.sourceDirectory, "meta-widget.md");
    const markedMeta = (await readFile(metaPath, "utf8")).replace(
      "- **Review Rubric:** [none]\n",
      `- **Review Rubric:** [none]\n- **Decomposition Receipt:** ${receiptId}\n`,
    );
    await writeFile(metaPath, markedMeta);
    await fixture.exec("git", ["add", "--", `${fixture.sourceDirectory}/meta-widget.md`]);
    await fixture.exec(
      "git",
      ["-c", "core.hooksPath=/dev/null", "commit", "-m", "mark decomposition source"],
    );
    const [{ stdout: head }, { stdout: tree }, { stdout: entry }] = await Promise.all([
      fixture.exec("git", ["rev-parse", "HEAD"]),
      fixture.exec("git", ["write-tree"]),
      fixture.exec("git", ["ls-files", "--stage", "--", `${fixture.sourceDirectory}/meta-widget.md`]),
    ]);
    const match = /^(100644|100755) ([0-9a-f]{40,64}) 0\t/u.exec(entry);
    if (match?.[1] === undefined || match[2] === undefined) throw new Error("marked meta index entry missing");
    const sourceMeta = fixture.transaction.source.artifacts.find(({ basename }) => basename === "meta-widget.md");
    if (sourceMeta === undefined) throw new Error("source meta transaction entry missing");
    sourceMeta.bytes = new TextEncoder().encode(markedMeta);
    sourceMeta.contentDigest = digestBytes(sourceMeta.bytes);
    sourceMeta.mode = match[1] === "100755" ? "100755" : "100644";
    sourceMeta.oid = match[2];
    fixture.transaction.policy.provenance = "decomposition";
    fixture.transaction.policy.decompositionReceiptRemoved = true;
    fixture.transaction.occupation.baseHead = head.trim();
    fixture.transaction.occupation.indexTree = tree.trim();
    if (fixture.transaction.occupation.worktree.kind !== "current") throw new Error("fixture mode");
    fixture.transaction.occupation.worktree.head = head.trim();

    const result = await atomicGraduate(fixture.transaction, {
      cwd: fixture.repo,
      exec: fixture.exec,
      fs: { chmod, mkdir, readFile, rename, rm, rmdir, stat, writeFile },
    });

    if (result.status !== "applied") throw new Error(JSON.stringify(result));
    const metaContent = await readFile(
      join(fixture.repo, fixture.targetDirectory, "meta-widget.md"),
      "utf8",
    );
    const meta = parseMetaRecord(metaContent);
    expect(metaContent).not.toContain("Decomposition Receipt");
    expect(meta.design).toEqual(["draft-widget.md"]);
    expect(meta.taskList).toBeNull();
  });
});
