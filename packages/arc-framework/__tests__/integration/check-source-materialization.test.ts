/** Selected Git code is materialized with caller-side attributes before freezing. */
import { afterEach, expect, it } from "vitest";
import { join, relative } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { chmod, copyFile, lstat, mkdtemp, readFile, readlink, symlink, writeFile } from "node:fs/promises";
import { createTempRepoCore, removeGitBackedDirs } from "../helpers/temp-repo.js";
import { createExecaGitExec, createExecaRawGitExec } from "../../src/lib/git/process-executor.js";
import { resolveCheckRequest } from "../../src/lib/checks/resolve-request.js";
import { acquireSourceBoundary } from "../../src/lib/checks/runner/source-boundary.js";
import { nodeSourcePresentationIO } from "../../src/lib/checks/runner/source-io.js";
import { freezeSelectedSource } from "../../src/lib/checks/runner/source-materialize.js";
import { verifySourcePresentation } from "../../src/lib/checks/runner/source-verify.js";

const git = createExecaGitExec();
const io = { git, gitRaw: createExecaRawGitExec(), source: nodeSourcePresentationIO };
const repositories: string[] = [];
afterEach(async () => { await removeGitBackedDirs(repositories.splice(0)); });

it("freezes actual worktree bytes without checking them out again", async () => {
  const root = await createTempRepoCore({ prefix: "arc-source-worktree-view-" });
  repositories.push(root);
  await writeFile(join(root, ".gitattributes"), "*.txt text eol=lf\n");
  await writeFile(join(root, "code.txt"), "actual\r\n");
  const request = await resolveCheckRequest(git, root, { form: { kind: "run", ids: ["check"] } });
  if (request.status !== "resolved") throw new Error(request.message);
  const boundary = await acquireSourceBoundary(io, root, request.request);
  try {
    const frozen = await freezeSelectedSource(io, root, request.request, boundary);
    try {
      expect(await readFile(join(frozen.root, "code.txt"), "utf8")).toBe("actual\r\n");
      expect(await readFile(join(root, "code.txt"), "utf8")).toBe("actual\r\n");
    } finally { await frozen.remove(); }
  } finally { await boundary.remove(); }
});

it.each(["index", "commit"] as const)("freezes %s bytes with selected EOL attributes despite conflicting live files", async basis => {
  const root = await createTempRepoCore({ prefix: "arc-source-selected-view-" });
  repositories.push(root);
  await writeFile(join(root, ".gitattributes"), "*.txt text eol=crlf\n");
  await writeFile(join(root, "code.txt"), "base\n");
  await git("git", ["add", "-A"], { cwd: root });
  await git("git", ["commit", "-m", "base"], { cwd: root });
  const tip = (await git("git", ["rev-parse", "HEAD"], { cwd: root })).stdout;
  await writeFile(join(root, "code.txt"), "staged\n");
  await git("git", ["add", "code.txt"], { cwd: root });
  await writeFile(join(root, ".gitattributes"), "*.txt text eol=lf\n");
  await writeFile(join(root, "code.txt"), "later worktree\n");
  const index = await readFile(join(root, ".git", "index"));
  const result = await resolveCheckRequest(git, root, basis === "index" ? { form: { kind: "pre-commit" } }
    : { form: { kind: "pre-push", ref: "refs/heads/topic", old: tip, tip } });
  if (result.status !== "resolved") throw new Error(result.message);
  const boundary = await acquireSourceBoundary(io, root, result.request);
  try {
    const frozen = await freezeSelectedSource(io, root, result.request, boundary);
    try {
      expect(await readFile(join(frozen.root, "code.txt"), "utf8")).toBe(basis === "index" ? "staged\r\n" : "base\r\n");
      expect(await readFile(join(frozen.root, ".gitattributes"), "utf8")).toBe("*.txt text eol=crlf\n");
      expect(await verifySourcePresentation({ root: frozen.root, manifest: frozen.manifestPath,
        digest: frozen.digest, coordinates: frozen.manifest.coordinates })).toEqual(frozen.manifest);
      expect(await readFile(join(root, "code.txt"), "utf8")).toBe("later worktree\n");
      expect(await readFile(join(root, ".git", "index"))).toEqual(index);
    } finally { await frozen.remove(); }
  } finally { await boundary.remove(); }
});

it("refuses a missing required smudge tool and freezes caller-relative filter output after repair", async () => {
  const root = await createTempRepoCore({ prefix: "arc-source-required-filter-" });
  repositories.push(root);
  await writeFile(join(root, ".gitattributes"), "asset.bin filter=fixture\n");
  await writeFile(join(root, "asset.bin"), "canonical\n");
  await git("git", ["config", "filter.fixture.clean", "cat"], { cwd: root });
  await git("git", ["config", "filter.fixture.smudge", "arc-missing-source-filter-tool"], { cwd: root });
  await git("git", ["config", "filter.fixture.required", "true"], { cwd: root });
  await git("git", ["add", "-A"], { cwd: root });
  await git("git", ["commit", "-m", "filtered source"], { cwd: root });
  await writeFile(join(root, "asset.bin"), "later original\n");
  const request = await resolveCheckRequest(git, root, { form: { kind: "pre-commit" } });
  if (request.status !== "resolved") throw new Error(request.message);
  const boundary = await acquireSourceBoundary(io, root, request.request);
  const owned: string[] = [];
  const observed = { ...io, source: { ...io.source, files: { ...io.source.files, createDirectory: async () => {
    const directory = await io.source.files.createDirectory(); owned.push(directory); return directory;
  } } } };
  try {
    await expect(freezeSelectedSource(observed, root, request.request, boundary))
      .rejects.toThrow(/selected.*filter.*repair.*retry.*local/iu);
    for (const directory of owned) await expect(lstat(directory)).rejects.toMatchObject({ code: "ENOENT" });
    await writeFile(join(root, ".git", "smudge.cjs"),
      'const fs = require("node:fs"); process.stdout.write(Buffer.concat([Buffer.from("materialized:"), fs.readFileSync(0)]));\n');
    await git("git", ["config", "filter.fixture.smudge", "node .git/smudge.cjs"], { cwd: root });
    const frozen = await freezeSelectedSource(observed, root, request.request, boundary);
    try {
      expect(await readFile(join(frozen.root, "asset.bin"), "utf8")).toBe("materialized:canonical\n");
      expect(await readFile(join(root, "asset.bin"), "utf8")).toBe("later original\n");
    } finally { await frozen.remove(); }
    for (const directory of owned) await expect(lstat(directory)).rejects.toMatchObject({ code: "ENOENT" });
  } finally { await boundary.remove(); }
});

it("refuses flattened selected links and preserves links and executable modes after repair", async () => {
  const root = await createTempRepoCore({ prefix: "arc-source-selected-links-" });
  repositories.push(root);
  await writeFile(join(root, "script"), "#!/bin/sh\nexit 0\n");
  await symlink("script", join(root, "link"), "file");
  await git("git", ["add", "-A"], { cwd: root });
  await git("git", ["update-index", "--chmod=+x", "script"], { cwd: root });
  await git("git", ["commit", "-m", "linked executable"], { cwd: root });
  await git("git", ["config", "core.symlinks", "false"], { cwd: root });
  const request = await resolveCheckRequest(git, root, { form: { kind: "pre-commit" } });
  if (request.status !== "resolved") throw new Error(request.message);
  const boundary = await acquireSourceBoundary(io, root, request.request);
  try {
    await expect(freezeSelectedSource(io, root, request.request, boundary).then(async value => {
      await value.remove(); return value;
    }))
      .rejects.toThrow(/selected.*link.*repair.*retry.*local/iu);
    await git("git", ["config", "core.symlinks", "true"], { cwd: root });
    const frozen = await freezeSelectedSource(io, root, request.request, boundary);
    try {
      expect((await lstat(join(frozen.root, "link"))).isSymbolicLink()).toBe(true);
      expect(await readlink(join(frozen.root, "link"))).toBe("script");
      expect((await lstat(join(frozen.root, "script"))).mode & 0o100).toBe(0o100);
    } finally { await frozen.remove(); }
    // Git sets execute bits through the caller's umask; only the owner bit marks an executable entry.
    const umask = process.umask(0o077);
    try {
      const restricted = await freezeSelectedSource(io, root, request.request, boundary);
      try { expect((await lstat(join(restricted.root, "script"))).mode & 0o777).toBe(0o700); }
      finally { await restricted.remove(); }
    } finally { process.umask(umask); }
  } finally { await boundary.remove(); }
});

it("keeps the specific presentation refusal through selected-source capture", async () => {
  const root = await createTempRepoCore({ prefix: "arc-source-selected-escape-" });
  const outside = await mkdtemp(join(tmpdir(), "arc-source-selected-outside-"));
  repositories.push(root, outside);
  await writeFile(join(outside, "data.txt"), "sibling input\n");
  await symlink(relative(root, join(outside, "data.txt")), join(root, "link"), "file");
  const request = await resolveCheckRequest(git, root, { form: { kind: "run", ids: ["check"] } });
  if (request.status !== "resolved") throw new Error(request.message);
  const boundary = await acquireSourceBoundary(io, root, request.request);
  try {
    await expect(freezeSelectedSource(io, root, request.request, boundary)).rejects.toThrow(/^Cannot freeze source presentation: Source link escapes captured root\./u);
  } finally { await boundary.remove(); }
});

it("freezes real Git LFS content from the caller's local object store", async context => {
  const root = await createTempRepoCore({ prefix: "arc-source-lfs-view-" });
  repositories.push(root);
  let executable = "git-lfs";
  try { await git("git", ["lfs", "version"], { cwd: root }); }
  catch {
    const architecture = process.arch === "x64" ? "amd64" : process.arch;
    const portable = fileURLToPath(new URL(`../../../../.check-test-tools/linux-${architecture}/git-lfs`, import.meta.url));
    if (process.platform !== "linux" || !(await lstat(portable).catch(() => undefined))?.isFile()) {
      context.skip(true, "Native Git LFS is unavailable; real LFS presentation is not qualified here");
      return;
    }
    // The test controller may use a noexec temporary filesystem for repositories.
    const tools = await mkdtemp("/tmp/arc-source-lfs-tool-");
    repositories.push(tools);
    executable = join(tools, "git-lfs");
    await copyFile(portable, executable);
    await chmod(executable, 0o755);
    await git(executable, ["version"], { cwd: root });
  }
  const command = `'${executable.replaceAll("'", "'\\''")}'`;
  await git("git", ["config", "filter.lfs.process", `${command} filter-process`], { cwd: root });
  await git("git", ["config", "filter.lfs.required", "true"], { cwd: root });
  await writeFile(join(root, ".gitattributes"), "asset.bin filter=lfs -text\n");
  const content = Buffer.from([0, 255, 13, 10, 1, 2, 3, 4]);
  await writeFile(join(root, "asset.bin"), content);
  await git("git", ["add", "-A"], { cwd: root });
  await git("git", ["commit", "-m", "LFS source"], { cwd: root });
  expect((await git("git", ["show", "HEAD:asset.bin"], { cwd: root })).stdout).toMatch(/^version https:\/\/git-lfs.github.com\/spec\/v1\n/u);
  await writeFile(join(root, "asset.bin"), "later live content\n");
  const request = await resolveCheckRequest(git, root, { form: { kind: "pre-commit" } });
  if (request.status !== "resolved") throw new Error(request.message);
  const boundary = await acquireSourceBoundary(io, root, request.request);
  try {
    const frozen = await freezeSelectedSource(io, root, request.request, boundary);
    try {
      expect(await readFile(join(frozen.root, "asset.bin"))).toEqual(content);
      await writeFile(join(root, "asset.bin"), "another live edit\n");
      expect(await verifySourcePresentation({ root: frozen.root, manifest: frozen.manifestPath,
        digest: frozen.digest, coordinates: frozen.manifest.coordinates })).toEqual(frozen.manifest);
    } finally { await frozen.remove(); }
  } finally { await boundary.remove(); }
});
