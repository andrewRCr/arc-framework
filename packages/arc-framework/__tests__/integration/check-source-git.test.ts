/** Relocated source Git metadata resolves code without original repository administration. */
import { afterEach, expect, it } from "vitest";
import { cp, lstat, mkdir, mkdtemp, readFile, readdir, symlink, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { createTempRepoCore, removeGitBackedDir, removeGitBackedDirs } from "../helpers/temp-repo.js";
import { createExecaGitExec, createExecaRawGitExec } from "../../src/lib/git/process-executor.js";
import { resolveCheckRequest } from "../../src/lib/checks/resolve-request.js";
import { acquireSourceBoundary } from "../../src/lib/checks/runner/source-boundary.js";
import { freezeSelectedSource } from "../../src/lib/checks/runner/source-materialize.js";
import { addSourceGitMetadata } from "../../src/lib/checks/runner/source-git.js";
import { nodeSourcePresentationIO } from "../../src/lib/checks/runner/source-io.js";
import { verifySourcePresentation } from "../../src/lib/checks/runner/source-verify.js";
import { readCheckHead } from "../../src/lib/checks/head.js";

const git = createExecaGitExec();
const io = { git, gitRaw: createExecaRawGitExec(), source: nodeSourcePresentationIO };
const directories: string[] = [];
afterEach(async () => { await removeGitBackedDirs(directories.splice(0)); });

async function commit(root: string, name: string): Promise<string> {
  await git("git", ["add", "-A"], { cwd: root });
  await git("git", ["commit", "-m", name], { cwd: root });
  return (await git("git", ["rev-parse", "HEAD"], { cwd: root })).stdout;
}

const LINK_CAPTURE_TIMEOUT = 60_000;
const sourceModes = ["worktree", "index", "commit"] as const;
const linkSpellings = ["flat", "forward-slash", "backslash"] as const;

it.each(sourceModes.flatMap(basis => linkSpellings.map(spelling => ({ basis, spelling }))))(
  "preserves $basis symlink targets written with $spelling", async ({ basis, spelling }) => {
    const root = await createTempRepoCore({ prefix: "arc-source-link-target-" });
    directories.push(root);
    await git("git", ["config", "core.symlinks", "true"], { cwd: root });
    const target = spelling === "flat" ? "target" : ["nested", "target"].join(spelling === "backslash" ? "\\" : "/");
    await mkdir(join(root, "nested"));
    await writeFile(join(root, target), "captured target");
    await symlink(target, join(root, "link"), "file");
    expect((await lstat(join(root, "link"))).isSymbolicLink()).toBe(true);
    const tip = await commit(root, "link qualification");
    await git("git", ["update-ref", "refs/heads/topic", tip], { cwd: root });
    const mode = Buffer.from((await io.gitRaw(["ls-files", "--stage", "-z", "--", "link"], { cwd: root })).stdout).toString("utf8");
    expect(mode).toMatch(/^120000 [0-9a-f]+ 0\tlink\0$/u);
    const gitTarget = Buffer.from((await io.gitRaw(["show", basis === "index" ? ":link" : tip + ":link"], { cwd: root })).stdout).toString("utf8");
    const result = await resolveCheckRequest(git, root, basis === "worktree" ? { form: { kind: "run", ids: ["check"] } }
      : basis === "index" ? { form: { kind: "pre-commit" } }
      : { form: { kind: "pre-push", ref: "refs/heads/topic", old: tip, tip } });
    if (result.status !== "resolved") throw new Error(result.message);
    const boundary = await acquireSourceBoundary(io, root, result.request);
    try {
      const frozen = await freezeSelectedSource(io, root, result.request, boundary);
      try {
        const entry = frozen.manifest.entries.find(candidate => candidate.path === "link");
        expect(entry).toEqual({ path: "link", kind: "symlink", target: gitTarget });
        const source = { root: frozen.root, manifest: frozen.manifestPath,
          digest: frozen.digest, coordinates: frozen.manifest.coordinates };
        expect(await verifySourcePresentation(source)).toEqual(frozen.manifest);
        expect(await readFile(join(frozen.root, "link"), "utf8")).toBe("captured target");
        if (spelling === "forward-slash") {
          await addSourceGitMetadata(io, root, frozen);
          const example: unknown = await import(fileURLToPath(new URL("../../examples/check-runner/local-inputs.mjs", import.meta.url)));
          if (typeof example !== "object" || example === null || !("verifyInputs" in example) || typeof example.verifyInputs !== "function") {
            throw new Error("Independent runner example verifier is unavailable");
          }
          await example.verifyInputs({ source, environment: {} });
        }
      } finally { await frozen.remove(); }
    } finally { await boundary.remove(); }
  }, LINK_CAPTURE_TIMEOUT,
);

it("retains HEAD, checked tree, base, merge and code history after original removal, excluding private administration", async () => {
  const root = await createTempRepoCore({ prefix: "arc-source-git-closure-" });
  directories.push(root);
  await writeFile(join(root, "ancestor.txt"), "ancestor\n");
  const ancestor = await commit(root, "ancestor");
  await git("git", ["switch", "-c", "topic"], { cwd: root });
  await writeFile(join(root, "merged.txt"), "merged\n");
  const merged = await commit(root, "topic");
  await git("git", ["switch", "main"], { cwd: root });
  await writeFile(join(root, "head.txt"), "head\n");
  const head = await commit(root, "head");
  await git("git", ["merge", "--no-commit", "--no-ff", "topic"], { cwd: root });
  await git("git", ["config", "credential.helper", "private-caller-helper"], { cwd: root });
  await writeFile(join(root, ".git", "hooks", "pre-commit"), "private caller hook\n");
  const privateObject = Buffer.from((await io.gitRaw(["hash-object", "-w", "--stdin"], {
    cwd: root, input: Buffer.from("private note and store content\n"),
  })).stdout).toString().trim();
  await git("git", ["update-ref", "refs/notes/private", privateObject], { cwd: root });
  await git("git", ["update-ref", "refs/arc/private", privateObject], { cwd: root });
  await git("git", ["repack", "-a", "-d"], { cwd: root });
  const request = await resolveCheckRequest(git, root, { form: { kind: "pre-commit" } });
  if (request.status !== "resolved") throw new Error(request.message);
  const boundary = await acquireSourceBoundary(io, root, request.request);
  try {
    const frozen = await freezeSelectedSource(io, root, request.request, boundary);
    try {
      expect(frozen.manifest.coordinates).toMatchObject({ head, base: head, merged: [merged] });
      await addSourceGitMetadata(io, root, frozen);
      await boundary.recheck();
      const relocated = await mkdtemp(join(tmpdir(), "arc-source-git-relocated-"));
      directories.push(relocated);
      const destination = join(relocated, "root");
      const manifest = join(relocated, "manifest.json");
      await cp(frozen.root, destination, { recursive: true, verbatimSymlinks: true });
      await cp(frozen.manifestPath, manifest);
      await boundary.remove();
      await removeGitBackedDir(root);
      await frozen.remove();
      const coordinates = frozen.manifest.coordinates;
      expect((await lstat(join(destination, ".git"))).isDirectory()).toBe(true);
      expect((await git("git", ["rev-parse", "HEAD"], { cwd: destination })).stdout).toBe(head);
      expect((await git("git", ["write-tree"], { cwd: destination })).stdout).toBe(coordinates.tree);
      for (const oid of [head, ancestor, merged, coordinates.tree]) {
        await expect(git("git", ["cat-file", "-e", oid], { cwd: destination })).resolves.toMatchObject({ stdout: "" });
      }
      expect((await git("git", ["log", "--format=%H", head], { cwd: destination })).stdout.split("\n")).toEqual([head, ancestor]);
      expect((await git("git", ["show", `${merged}:merged.txt`], { cwd: destination })).stdout).toBe("merged");
      expect((await git("git", ["for-each-ref", "--format=%(refname)"], { cwd: destination })).stdout).toBe("");
      await expect(git("git", ["cat-file", "-e", privateObject], { cwd: destination })).rejects.toThrow();
      await expect(lstat(join(destination, ".git", "objects", "info", "alternates"))).rejects.toMatchObject({ code: "ENOENT" });
      await expect(lstat(join(destination, ".git", "hooks", "pre-commit"))).rejects.toMatchObject({ code: "ENOENT" });
      expect(await readFile(join(destination, ".git", "config"), "utf8")).not.toMatch(/private-caller-helper|credential/iu);
      expect(await verifySourcePresentation({ root: destination, manifest, digest: frozen.digest, coordinates })).toEqual(frozen.manifest);
    } finally { await frozen.remove(); }
  } finally { await boundary.remove(); }
});

it.skipIf(process.platform !== "linux")("captures independent Git across filesystems without changing caller objects or index", async context => {
  const root = await createTempRepoCore({ prefix: "arc-source-git-cross-fs-" });
  directories.push(root);
  const device = (await lstat(root)).dev;
  const candidates = await Promise.all(["/dev/shm", "/tmp"].map(async directory => {
    const info = await lstat(directory).catch(() => undefined);
    return info?.isDirectory() && info.dev !== device ? directory : undefined;
  }));
  const captureBase = candidates.find(directory => directory !== undefined);
  if (captureBase === undefined) {
    context.skip(true, "Independent writable filesystem is unavailable for real cross-device Git capture");
    return;
  }
  const crossIO: typeof io = { ...io, source: { ...io.source, files: { ...io.source.files,
    createDirectory: () => mkdtemp(join(captureBase, "arc-source-git-cross-fs-capture-")),
  } } };
  await writeFile(join(root, "history.txt"), "historical only\n");
  const ancestor = await commit(root, "ancestor");
  await unlink(join(root, "history.txt"));
  await writeFile(join(root, "data.bin"), "committed bytes\n");
  const head = await commit(root, "head");
  const binary = Buffer.from([0, 255, 13, 10, 65]);
  await writeFile(join(root, "data.bin"), binary);
  const request = await resolveCheckRequest(git, root, { form: { kind: "run", ids: ["check"] } });
  if (request.status !== "resolved") throw new Error(request.message);
  const boundary = await acquireSourceBoundary(io, root, request.request);
  try {
    const frozen = await freezeSelectedSource(crossIO, root, request.request, boundary);
    try {
      expect((await lstat(frozen.root)).dev).not.toBe(device);
      const callerHead = await readFile(join(root, ".git", "HEAD"));
      const callerIndex = await readFile(join(root, ".git", "index"));
      const callerObjects = (await readdir(join(root, ".git", "objects"), { recursive: true })).sort();
      const callerStatus = await io.gitRaw(["status", "--porcelain=v1", "-z"], { cwd: root });
      await addSourceGitMetadata(crossIO, root, frozen);
      await boundary.recheck();
      expect(await readFile(join(root, ".git", "HEAD"))).toEqual(callerHead);
      expect(await readFile(join(root, ".git", "index"))).toEqual(callerIndex);
      expect((await readdir(join(root, ".git", "objects"), { recursive: true })).sort()).toEqual(callerObjects);
      expect((await io.gitRaw(["status", "--porcelain=v1", "-z"], { cwd: root })).stdout).toEqual(callerStatus.stdout);
      expect(await readFile(join(root, "data.bin"))).toEqual(binary);
      await boundary.remove();
      await removeGitBackedDir(root);
      expect((await git("git", ["rev-parse", "HEAD"], { cwd: frozen.root })).stdout).toBe(head);
      expect((await git("git", ["log", "--format=%H"], { cwd: frozen.root })).stdout.split("\n")).toEqual([head, ancestor]);
      expect((await git("git", ["show", `${ancestor}:history.txt`], { cwd: frozen.root })).stdout).toBe("historical only");
      expect(Buffer.from((await io.gitRaw(["show", `${frozen.manifest.coordinates.tree}:data.bin`], { cwd: frozen.root })).stdout)).toEqual(binary);
      await git("git", ["fsck", "--connectivity-only", "--no-reflogs", "--no-dangling"], { cwd: frozen.root });
      await expect(lstat(join(frozen.root, ".git", "objects", "info", "alternates"))).rejects.toMatchObject({ code: "ENOENT" });
      await expect(lstat(join(frozen.root, ".git", "pack-transfer"))).rejects.toMatchObject({ code: "ENOENT" });
    } finally { await frozen.remove(); }
  } finally { await boundary.remove(); }
});

it("refuses incomplete shallow history, cleans new administration and succeeds after repair", async () => {
  const root = await createTempRepoCore({ prefix: "arc-source-git-incomplete-" });
  directories.push(root);
  await writeFile(join(root, "code.txt"), "ancestor\n");
  const ancestor = await commit(root, "ancestor");
  await writeFile(join(root, "code.txt"), "head\n");
  const head = await commit(root, "head");
  const shallow = join(root, ".git", "shallow");
  await writeFile(shallow, `${head}\n`);
  const request = await resolveCheckRequest(git, root, { form: { kind: "run", ids: ["check"] } });
  if (request.status !== "resolved") throw new Error(request.message);
  const boundary = await acquireSourceBoundary(io, root, request.request);
  try {
    const frozen = await freezeSelectedSource(io, root, request.request, boundary);
    try {
      await expect(addSourceGitMetadata(io, root, frozen)).rejects.toThrow(/required.*objects.*repair.*retry.*local/iu);
      await expect(lstat(join(frozen.root, ".git"))).rejects.toMatchObject({ code: "ENOENT" });
      expect(await readFile(join(frozen.root, "code.txt"), "utf8")).toBe("head\n");
      await unlink(shallow);
      await addSourceGitMetadata(io, root, frozen);
      expect((await git("git", ["log", "--format=%H"], { cwd: frozen.root })).stdout.split("\n")).toEqual([head, ancestor]);
    } finally { await frozen.remove(); }
  } finally { await boundary.remove(); }
});

it("names unsupported object formats and constructs successfully after the reported format is repaired", async () => {
  const root = await createTempRepoCore({ prefix: "arc-source-git-unsupported-" });
  directories.push(root);
  await writeFile(join(root, "code.txt"), "code\n");
  await commit(root, "code");
  const request = await resolveCheckRequest(git, root, { form: { kind: "run", ids: ["check"] } });
  if (request.status !== "resolved") throw new Error(request.message);
  const boundary = await acquireSourceBoundary(io, root, request.request);
  try {
    const frozen = await freezeSelectedSource(io, root, request.request, boundary);
    try {
      const unsupported: typeof io = { ...io, git: async (command, args, options) =>
        args[0] === "rev-parse" && args[1] === "--show-object-format=storage"
          ? { stdout: "unsupported-format" } : git(command, args, options) };
      await expect(addSourceGitMetadata(unsupported, root, frozen)).rejects.toThrow(/object format.*unsupported.*supported.*repair.*retry.*local/iu);
      await expect(lstat(join(frozen.root, ".git"))).rejects.toMatchObject({ code: "ENOENT" });
      await addSourceGitMetadata(io, root, frozen);
      expect((await git("git", ["write-tree"], { cwd: frozen.root })).stdout).toBe(frozen.manifest.coordinates.tree);
    } finally { await frozen.remove(); }
  } finally { await boundary.remove(); }
});

it.skipIf(process.platform === "win32")("does not invoke a caller-selected reference hook while constructing owned metadata", async () => {
  const root = await createTempRepoCore({ prefix: "arc-source-git-hooks-" });
  directories.push(root);
  await writeFile(join(root, "code.txt"), "code\n");
  const head = await commit(root, "code");
  // A Node executable invoked as a reference hook rejects Git's phase argument as a missing script.
  await symlink(process.execPath, join(root, ".git", "hooks", "reference-transaction"));
  const request = await resolveCheckRequest(git, root, { form: { kind: "run", ids: ["check"] } });
  if (request.status !== "resolved") throw new Error(request.message);
  const boundary = await acquireSourceBoundary(io, root, request.request);
  try {
    const frozen = await freezeSelectedSource(io, root, request.request, boundary);
    try {
      const host: typeof io = { ...io, git: (command, args, options) =>
        git(command, ["-c", `core.hooksPath=${join(root, ".git", "hooks")}`, ...args], options) };
      await addSourceGitMetadata(host, root, frozen);
      expect(await readCheckHead(git, frozen.root)).toEqual({ status: "known", commit: head });
      expect(await readFile(join(frozen.root, "code.txt"), "utf8")).toBe("code\n");
    } finally { await frozen.remove(); }
  } finally { await boundary.remove(); }
});

it.each([
  { format: "sha1", kind: "linked" }, { format: "sha256", kind: "linked" },
  { format: "sha1", kind: "unborn" }, { format: "sha256", kind: "unborn" },
] as const)("retains $format coordinates from a $kind caller after its administration disappears", async ({ format, kind }) => {
  const original = await createTempRepoCore({ prefix: "arc-source-git-format-", objectFormat: format });
  directories.push(original);
  await writeFile(join(original, "code.txt"), "captured\n");
  let root = original;
  let head: string | undefined;
  let linkedParent: string | undefined;
  if (kind === "linked") {
    head = await commit(original, "code");
    linkedParent = await mkdtemp(join(tmpdir(), "arc-source-git-linked-"));
    directories.push(linkedParent);
    root = join(linkedParent, "checkout");
    await git("git", ["worktree", "add", "--detach", root, head], { cwd: original });
    expect((await lstat(join(root, ".git"))).isFile()).toBe(true);
  }
  const request = await resolveCheckRequest(git, root, { form: { kind: "run", ids: ["check"] } });
  if (request.status !== "resolved") throw new Error(request.message);
  const boundary = await acquireSourceBoundary(io, root, request.request);
  try {
    const frozen = await freezeSelectedSource(io, root, request.request, boundary);
    try {
      expect(frozen.manifest.coordinates.tree).toHaveLength(format === "sha1" ? 40 : 64);
      await addSourceGitMetadata(io, root, frozen);
      await boundary.recheck();
      await boundary.remove();
      await removeGitBackedDir(original);
      if (linkedParent !== undefined) await removeGitBackedDir(linkedParent);
      expect((await git("git", ["rev-parse", "--show-object-format=storage"], { cwd: frozen.root })).stdout).toBe(format);
      expect(await readCheckHead(git, frozen.root)).toEqual(head === undefined ? { status: "unborn" } : { status: "known", commit: head });
      expect((await git("git", ["write-tree"], { cwd: frozen.root })).stdout).toBe(frozen.manifest.coordinates.tree);
      expect(await readFile(join(frozen.root, "code.txt"), "utf8")).toBe("captured\n");
    } finally { await frozen.remove(); }
  } finally { await boundary.remove(); }
});
