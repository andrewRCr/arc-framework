/** Link boundaries refuse escapes and unrepresentable presentations with concrete retry routes. */
import { afterEach, expect, it } from "vitest";
import { access, mkdir, mkdtemp, readFile, rm, symlink, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { freezeSourcePresentation } from "../../../../../src/lib/checks/runner/source-presentation.js";
import { nodeSourcePresentationIO, type SourcePresentationIO } from "../../../../../src/lib/checks/runner/source-io.js";
import { verifySourceLink } from "../../../../../src/lib/checks/runner/source-link.js";

const directories: string[] = [];
afterEach(async () => { await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true }))); });
const coordinates = { tree: "a".repeat(40), merged: [] };
async function fixture() {
  const parent = await mkdtemp(join(tmpdir(), "arc-source-link-unit-"));
  directories.push(parent);
  const root = join(parent, "root");
  const outside = join(parent, "outside");
  await mkdir(root); await mkdir(outside);
  await writeFile(join(outside, "data.txt"), "external bytes");
  await writeFile(join(root, "target.txt"), "contained bytes");
  const owned: string[] = [];
  const io: SourcePresentationIO = { ...nodeSourcePresentationIO, files: { ...nodeSourcePresentationIO.files,
    createDirectory: async () => {
      const directory = await nodeSourcePresentationIO.files.createDirectory();
      directories.push(directory); owned.push(directory); return directory;
    },
  } };
  return { root, outside, owned, io };
}

it.each(["relative escape", "absolute target", "linked dangling prefix", "linked parent traversal"])(
  "refuses %s without capturing sibling inputs and permits a contained retry", async kind => {
    const { root, outside, io, owned } = await fixture();
    await symlink("../outside", join(root, "bridge"), "dir");
    const target = kind === "relative escape" ? "../outside/data.txt" : kind === "absolute target"
      ? join(outside, "data.txt") : kind === "linked dangling prefix" ? "bridge/missing.txt" : "bridge/../target.txt";
    await symlink(target, join(root, "link"), "file");
    await expect(freezeSourcePresentation(root, Buffer.from("link\0"), coordinates, io))
      .rejects.toThrow(/(?:link.*escape|absolute.*link).*repair.*retry.*local.*explicit/iu);
    for (const directory of owned) await expect(access(directory)).rejects.toMatchObject({ code: "ENOENT" });
    expect(await readFile(join(outside, "data.txt"), "utf8")).toBe("external bytes");
    await unlink(join(root, "link"));
    await symlink("target.txt", join(root, "link"), "file");
    const retry = await freezeSourcePresentation(root, Buffer.from("link\0target.txt\0"), coordinates);
    try { expect(await readFile(join(retry.root, "link"), "utf8")).toBe("contained bytes"); } finally { await retry.remove(); }
  });

it.each([".git/config", "nested/../.GIT/HEAD"])("refuses link %s into replaced repository administration", async target => {
  const { root, io, owned } = await fixture();
  await mkdir(join(root, ".git")); await writeFile(join(root, ".git", "config"), "[core]\n");
  await mkdir(join(root, "nested"));
  await symlink(target, join(root, "link"), "file");
  await expect(freezeSourcePresentation(root, Buffer.from("link\0"), coordinates, io))
    .rejects.toThrow(/link.*repository administration.*repair.*retry.*local.*explicit/iu);
  for (const directory of owned) await expect(access(directory)).rejects.toMatchObject({ code: "ENOENT" });
});

it("refuses an unresolved Windows link type with a concrete local remedy", async () => {
  const { root, io, owned } = await fixture();
  await symlink("missing", join(root, "link"), "file");
  io.platform = "win32";
  await expect(freezeSourcePresentation(root, Buffer.from("link\0"), coordinates, io))
    .rejects.toThrow(/Windows.*type.*repair.*retry.*local/iu);
  for (const directory of owned) await expect(access(directory)).rejects.toMatchObject({ code: "ENOENT" });
});

it.each(["changed source link", "replaced copied link", "invalid UTF-8 target"])("refuses %s with a concrete repair route", async kind => {
  const { root, io, owned } = await fixture();
  const source = join(root, "link");
  await symlink("target.txt", source, "file");
  if (kind === "invalid UTF-8 target") io.readlink = async path => path === source ? Buffer.from([255])
    : nodeSourcePresentationIO.readlink(path);
  else io.symlink = async (target, destination, type) => {
    await nodeSourcePresentationIO.symlink(target, destination, type);
    if (kind === "changed source link") { await unlink(source); await symlink("other.txt", source, "file"); }
    else { await unlink(destination); await writeFile(destination, target); }
  };
  await expect(freezeSourcePresentation(root, Buffer.from("link\0"), coordinates, io))
    .rejects.toThrow(/(?:link.*(?:changed|preserv)|UTF-8).*repair.*retry.*local/iu);
  for (const directory of owned) await expect(access(directory)).rejects.toMatchObject({ code: "ENOENT" });
});

it("refuses raw Windows target spelling drift even when both spellings match the manifest", async () => {
  const { root, io } = await fixture();
  const source = join(root, "link");
  await symlink("./target.txt", source, "file");
  io.platform = "win32";
  let reads = 0;
  io.readlink = async path => {
    const bytes = await nodeSourcePresentationIO.readlink(path);
    if (path !== source || ++reads !== 2) return bytes;
    const target = Buffer.from(bytes).toString("utf8");
    return Buffer.from(target.includes("\\") ? target.replaceAll("\\", "/") : target.replaceAll("/", "\\"));
  };
  await expect(verifySourceLink(io, root, source, { path: "link", kind: "symlink", target: "./target.txt" }))
    .rejects.toThrow("Source link changed during verification");
});

function boundFilesystem(io: SourcePresentationIO): void {
  const original = io.lstat;
  let operations = 0;
  io.lstat = async path => {
    if (++operations > 1000) throw new Error("test filesystem operation budget exhausted");
    return original(path);
  };
}

it("retains a closed relative link cycle where its literal type is representable", async () => {
  const { root, io } = await fixture();
  await symlink("second", join(root, "first"), "file");
  await symlink("first", join(root, "second"), "file");
  boundFilesystem(io);
  if (io.platform === "win32") {
    await expect(freezeSourcePresentation(root, Buffer.from("first\0second\0"), coordinates, io)).rejects.toThrow(/Windows.*type.*retry.*local/iu);
    return;
  }
  const frozen = await freezeSourcePresentation(root, Buffer.from("first\0second\0"), coordinates, io);
  try {
    expect(frozen.manifest.entries).toEqual([{ path: "first", kind: "symlink", target: "second" },
      { path: "second", kind: "symlink", target: "first" }]);
    await expect(readFile(join(frozen.root, "first"))).rejects.toMatchObject({ code: "ELOOP" });
  } finally { await frozen.remove(); }
});

it("refuses nonconverging link expansion within a bounded capture", async () => {
  const { root, io, owned } = await fixture();
  await symlink("link/child", join(root, "link"), "file");
  boundFilesystem(io);
  await expect(freezeSourcePresentation(root, Buffer.from("link\0"), coordinates, io))
    .rejects.toThrow(/link chain.*bounded.*repair.*retry.*local/iu);
  for (const directory of owned) await expect(access(directory)).rejects.toMatchObject({ code: "ENOENT" });
});
