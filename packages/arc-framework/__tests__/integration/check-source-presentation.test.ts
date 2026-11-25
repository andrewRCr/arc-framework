/** Raw source freezing through real Git selection and filesystem presentation. */
import { afterEach, expect, it } from "vitest";
import { chmod, lstat, mkdir, mkdtemp, readFile, readlink, rm, stat, symlink, unlink, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { createTempRepoCore, removeGitBackedDirs } from "../helpers/temp-repo.js";
import { createExecaGitExec, createExecaRawGitExec } from "../../src/lib/git/process-executor.js";
import { resolveCheckRequest } from "../../src/lib/checks/resolve-request.js";
import { acquireSourceBoundary } from "../../src/lib/checks/runner/source-boundary.js";
import { freezeSourcePresentation } from "../../src/lib/checks/runner/source-presentation.js";
import { verifySourcePresentation } from "../../src/lib/checks/runner/source-verify.js";

const git = createExecaGitExec();
const io = { git, gitRaw: createExecaRawGitExec() };
const repositories: string[] = [];
afterEach(async () => { await removeGitBackedDirs(repositories.splice(0)); });

it("verifies a real selected capture, refuses altered artifact bytes and continues after repair", async () => {
  const root = await createTempRepoCore({ prefix: "arc-source-verification-" });
  repositories.push(root);
  const content = Buffer.from([0, 255, 13, 10]);
  await writeFile(join(root, "source.bin"), content);
  await git("git", ["add", "source.bin"], { cwd: root });
  await git("git", ["commit", "-m", "source"], { cwd: root });
  const request = await resolveCheckRequest(git, root, { form: { kind: "run", ids: ["check"] } });
  if (request.status !== "resolved") throw new Error(request.message);
  const boundary = await acquireSourceBoundary(io, root, request.request);
  try {
    const frozen = await freezeSourcePresentation(root, boundary.pathListing, boundary.coordinates);
    const source = { root: frozen.root, manifest: frozen.manifestPath, digest: frozen.digest,
      coordinates: frozen.manifest.coordinates };
    try {
      await boundary.recheck();
      await writeFile(join(root, "source.bin"), "later original bytes\n");
      expect(await verifySourcePresentation(source)).toEqual(frozen.manifest);
      await writeFile(join(frozen.root, "source.bin"), Buffer.from([1, 254, 13, 10]));
      await expect(verifySourcePresentation(source)).rejects.toThrow(/bytes.*match.*repair.*retry/iu);
      expect(await readFile(join(frozen.root, "source.bin"))).toEqual(Buffer.from([1, 254, 13, 10]));
      await writeFile(join(frozen.root, "source.bin"), content);
      expect(await verifySourcePresentation(source)).toEqual(frozen.manifest);
    } finally { await frozen.remove(); }
  } finally { await boundary.remove(); }
});

it("freezes dirty and admitted untracked raw bytes and executable modes while excluding deletions and ignored files", async () => {
  const root = await createTempRepoCore({ prefix: "arc-source-presentation-" });
  repositories.push(root);
  await writeFile(join(root, ".gitignore"), "ignored.txt\n");
  await writeFile(join(root, "source.txt"), "base\n");
  await writeFile(join(root, "deleted.txt"), "deleted\n");
  await git("git", ["add", "-A"], { cwd: root });
  await git("git", ["commit", "-m", "source"], { cwd: root });
  const dirty = Buffer.from([0, 255, 13, 10, 195, 169]);
  await writeFile(join(root, "source.txt"), dirty);
  await writeFile(join(root, "script"), "#!/bin/sh\nprintf captured\n");
  await chmod(join(root, "script"), 0o755);
  const scriptMode = (await stat(join(root, "script"))).mode & 0o7777;
  await writeFile(join(root, "ignored.txt"), "private ignored bytes\n");
  await rm(join(root, "deleted.txt"));
  const request = await resolveCheckRequest(git, root, { form: { kind: "run", ids: ["check"] } });
  if (request.status !== "resolved") throw new Error(request.message);
  const boundary = await acquireSourceBoundary(io, root, request.request);
  try {
    const frozen = await freezeSourcePresentation(root, boundary.pathListing, boundary.coordinates);
    try {
      await boundary.recheck();
      expect(await readFile(join(frozen.root, "source.txt"))).toEqual(dirty);
      expect((await stat(join(frozen.root, "script"))).mode & 0o7777).toBe(scriptMode);
      expect(frozen.manifest.entries.map(entry => entry.path)).toEqual([".gitignore", "script", "source.txt"]);
      expect(frozen.manifest.entries.find(entry => entry.path === "source.txt")).toMatchObject({ kind: "file",
        bytes: dirty.length, digest: `sha256:${createHash("sha256").update(dirty).digest("hex")}` });
      expect(dirname(frozen.manifestPath)).not.toBe(frozen.root);
      expect(relative(frozen.root, frozen.manifestPath)).toMatch(/^\.\./u);
      expect(JSON.parse(await readFile(frozen.manifestPath, "utf8"))).toEqual(frozen.manifest);
      await writeFile(join(root, "source.txt"), "later original edit\n");
      expect(await readFile(join(frozen.root, "source.txt"))).toEqual(dirty);
    } finally { await frozen.remove(); }
  } finally { await boundary.remove(); }
});

it("preserves literal contained file and directory relative links", async () => {
  const root = await createTempRepoCore({ prefix: "arc-source-links-" });
  repositories.push(root);
  await mkdir(join(root, "nested"));
  await writeFile(join(root, "target.txt"), "captured target\n");
  await symlink("target.txt", join(root, "file-link"), "file");
  await symlink("../target.txt", join(root, "nested", "parent-link"), "file");
  await symlink("nested", join(root, "directory-link"), "dir");
  const request = await resolveCheckRequest(git, root, { form: { kind: "run", ids: ["check"] } });
  if (request.status !== "resolved") throw new Error(request.message);
  const boundary = await acquireSourceBoundary(io, root, request.request);
  try {
    const frozen = await freezeSourcePresentation(root, boundary.pathListing, boundary.coordinates);
    try {
      await boundary.recheck();
      expect(frozen.manifest.entries.filter(entry => entry.kind === "symlink")).toEqual([
        { path: "directory-link", kind: "symlink", target: "nested" },
        { path: "file-link", kind: "symlink", target: "target.txt" },
        { path: "nested/parent-link", kind: "symlink", target: "../target.txt" },
      ]);
      expect((await lstat(join(frozen.root, "directory-link"))).isSymbolicLink()).toBe(true);
      expect(await readFile(join(frozen.root, "file-link"), "utf8")).toBe("captured target\n");
      expect(await readFile(join(frozen.root, "nested", "parent-link"), "utf8")).toBe("captured target\n");
    } finally { await frozen.remove(); }
  } finally { await boundary.remove(); }
});

it("preserves a contained dangling relative link where its type is representable", async () => {
  const root = await createTempRepoCore({ prefix: "arc-source-dangling-link-" });
  repositories.push(root);
  await symlink("missing/target.txt", join(root, "link"), "file");
  const request = await resolveCheckRequest(git, root, { form: { kind: "run", ids: ["check"] } });
  if (request.status !== "resolved") throw new Error(request.message);
  const boundary = await acquireSourceBoundary(io, root, request.request);
  try {
    if (process.platform === "win32") {
      await expect(freezeSourcePresentation(root, boundary.pathListing, boundary.coordinates)).rejects.toThrow(/Windows.*type.*retry.*local/iu);
      return;
    }
    const frozen = await freezeSourcePresentation(root, boundary.pathListing, boundary.coordinates);
    try {
      expect(frozen.manifest.entries).toEqual([{ path: "link", kind: "symlink", target: "missing/target.txt" }]);
      expect(await readlink(join(frozen.root, "link"))).toBe("missing/target.txt");
      await expect(readFile(join(frozen.root, "link"))).rejects.toMatchObject({ code: "ENOENT" });
    } finally { await frozen.remove(); }
  } finally { await boundary.remove(); }
});

it("refuses a selected escaping link and captures successfully after repairing its target", async () => {
  const root = await createTempRepoCore({ prefix: "arc-source-escape-" });
  const outside = await mkdtemp(join(tmpdir(), "arc-source-sibling-"));
  repositories.push(root, outside);
  await writeFile(join(outside, "data.txt"), "sibling input\n");
  await symlink(relative(root, join(outside, "data.txt")), join(root, "link"), "file");
  const request = await resolveCheckRequest(git, root, { form: { kind: "run", ids: ["check"] } });
  if (request.status !== "resolved") throw new Error(request.message);
  const boundary = await acquireSourceBoundary(io, root, request.request);
  try {
    await expect(freezeSourcePresentation(root, boundary.pathListing, boundary.coordinates)).rejects.toThrow(/link.*escape.*repair.*retry.*local/iu);
    expect(await readFile(join(outside, "data.txt"), "utf8")).toBe("sibling input\n");
  } finally { await boundary.remove(); }
  await unlink(join(root, "link"));
  await writeFile(join(root, "target.txt"), "contained source\n");
  await symlink("target.txt", join(root, "link"), "file");
  const repaired = await resolveCheckRequest(git, root, { form: { kind: "run", ids: ["check"] } });
  if (repaired.status !== "resolved") throw new Error(repaired.message);
  const fresh = await acquireSourceBoundary(io, root, repaired.request);
  try {
    const frozen = await freezeSourcePresentation(root, fresh.pathListing, fresh.coordinates);
    try {
      await fresh.recheck();
      expect(await readFile(join(frozen.root, "link"), "utf8")).toBe("contained source\n");
    } finally { await frozen.remove(); }
  } finally { await fresh.remove(); }
});
