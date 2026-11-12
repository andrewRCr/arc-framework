/** File-boundary failures and concurrent mutations refuse owned source capture. */
import { afterEach, expect, it } from "vitest";
import { access, chmod, mkdir, mkdtemp, readFile, realpath, rename, rm, symlink, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { freezeSourcePresentation, type FrozenSourcePresentation } from "../../../../../src/lib/checks/runner/source-presentation.js";
import { nodeSourcePresentationIO, type SourcePresentationIO } from "../../../../../src/lib/checks/runner/source-io.js";
import type { EnvironmentInputFile } from "../../../../../src/lib/checks/environment-file.js";

const directories: string[] = [];
afterEach(async () => { await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true }))); });
const coordinates = { tree: "a".repeat(40), merged: [] };

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "arc-source-files-unit-"));
  directories.push(root);
  const source = join(root, "source.txt");
  const bytes = Buffer.alloc(128 * 1024, 65);
  await writeFile(source, bytes);
  await chmod(source, 0o755);
  const owned: string[] = [];
  const io: SourcePresentationIO = { ...nodeSourcePresentationIO, files: { ...nodeSourcePresentationIO.files,
    createDirectory: async () => {
      const directory = await nodeSourcePresentationIO.files.createDirectory();
      directories.push(directory); owned.push(directory); return directory;
    },
  } };
  return { root, source, bytes, io, owned };
}

it.each(["during read", "after closing the input"])("refuses source replacement %s and closes its input", async when => {
  const { root, source, bytes, io, owned } = await fixture();
  let opened: EnvironmentInputFile | undefined;
  let changed = false;
  const mutate = async () => {
    if (changed) return;
    changed = true;
    if (when === "after closing the input") await rename(source, join(root, "original.txt"));
    await writeFile(source, Buffer.alloc(bytes.length, 66));
    // Rapid same-size writes can share one filesystem timestamp tick; make the observed mutation deterministic.
    const mutationTime = new Date("2000-01-01T00:00:00.000Z");
    await utimes(source, mutationTime, mutationTime);
  };
  io.files.openInput = async path => {
    const input = await nodeSourcePresentationIO.files.openInput(path);
    opened = input;
    return { stat: () => input.stat(), read: async buffer => {
      const count = await input.read(buffer);
      if (when === "during read") await mutate();
      return count;
    }, close: async () => { await input.close(); if (when === "after closing the input") await mutate(); } };
  };
  let unexpected: FrozenSourcePresentation | undefined;
  try {
    await expect(freezeSourcePresentation(root, Buffer.from("source.txt\0"), coordinates, io)
      .then(value => { unexpected = value; return value; })).rejects.toThrow(/repair.*retry.*local/iu);
    expect(owned).toHaveLength(1);
    for (const directory of owned) await expect(access(directory)).rejects.toMatchObject({ code: "ENOENT" });
    expect(await readFile(source)).toEqual(Buffer.alloc(bytes.length, 66));
    expect(opened).toBeDefined();
    await expect(opened!.stat()).rejects.toMatchObject({ code: "EBADF" });
  } finally { await unexpected?.remove(); }
});

it.each(["input read", "permission copy", "descriptor write"])("cleans its own resources after %s fails and permits a repaired retry", async fault => {
  const { root, source, bytes, io, owned } = await fixture();
  if (fault === "input read") io.files.openInput = async path => {
    const input = await nodeSourcePresentationIO.files.openInput(path);
    return { stat: () => input.stat(), read: async () => { throw new Error("input unavailable"); }, close: () => input.close() };
  };
  else if (fault === "permission copy") io.chmod = async () => { throw new Error("mode unavailable"); };
  else io.writeManifest = async () => { throw new Error("descriptor unavailable"); };
  await expect(freezeSourcePresentation(root, Buffer.from("source.txt\0"), coordinates, io)).rejects.toThrow(/repair.*retry.*local/iu);
  expect(owned).toHaveLength(1);
  for (const directory of owned) await expect(access(directory)).rejects.toMatchObject({ code: "ENOENT" });
  expect(await readFile(source)).toEqual(bytes);
  const retry = await freezeSourcePresentation(root, Buffer.from("source.txt\0"), coordinates);
  try { expect(await readFile(join(retry.root, "source.txt"))).toEqual(bytes); } finally { await retry.remove(); }
});

it("refuses a directory entry instead of capturing its contents", async () => {
  const { root, io, owned } = await fixture();
  await mkdir(join(root, "directory"));
  await expect(freezeSourcePresentation(root, Buffer.from("directory\0"), coordinates, io)).rejects.toThrow(/repair.*retry.*local/iu);
  for (const directory of owned) await expect(access(directory)).rejects.toMatchObject({ code: "ENOENT" });
});

it("refuses a copied permission change instead of certifying a different mode", async () => {
  const { root, io, owned } = await fixture();
  io.chmod = async (path, mode) => {
    await nodeSourcePresentationIO.chmod(path, mode);
    await nodeSourcePresentationIO.chmod(path, mode & ~0o222);
  };
  let unexpected: FrozenSourcePresentation | undefined;
  try {
    await expect(freezeSourcePresentation(root, Buffer.from("source.txt\0"), coordinates, io)
      .then(value => { unexpected = value; return value; })).rejects.toThrow(/permissions.*preserv.*repair.*retry.*local/iu);
    for (const directory of owned) await expect(access(directory)).rejects.toMatchObject({ code: "ENOENT" });
  } finally { await unexpected?.remove(); }
});

it("refuses a parent directory link that changed to a sibling input boundary", async () => {
  const { root, io } = await fixture();
  const outside = await mkdtemp(join(tmpdir(), "arc-source-external-unit-"));
  directories.push(outside);
  await writeFile(join(outside, "external.txt"), "external source");
  await symlink(outside, join(root, "parent"), "dir");
  let unexpected: FrozenSourcePresentation | undefined;
  try {
    await expect(freezeSourcePresentation(root, Buffer.from("parent/external.txt\0"), coordinates, io)
      .then(value => { unexpected = value; return value; })).rejects.toThrow(/parent is not a contained directory.*repair.*retry.*local.*explicit/iu);
    expect(await readFile(join(outside, "external.txt"), "utf8")).toBe("external source");
  } finally { await unexpected?.remove(); }
  await rm(join(root, "parent"));
  await mkdir(join(root, "parent"));
  await writeFile(join(root, "parent", "external.txt"), "repaired source");
  const repaired = await freezeSourcePresentation(root, Buffer.from("parent/external.txt\0"), coordinates, io);
  try { expect(await readFile(join(repaired.root, "parent", "external.txt"), "utf8")).toBe("repaired source"); }
  finally { await repaired.remove(); }
});

it("names a selected entry the worktree lacks and captures it once present", async () => {
  const { root, io } = await fixture();
  await expect(freezeSourcePresentation(root, Buffer.from("source.txt\0sparse/omitted.txt\0"), coordinates, io))
    .rejects.toThrow(/selected source entry is absent, as outside a sparse checkout.*retry.*local/iu);
  await mkdir(join(root, "sparse"));
  await writeFile(join(root, "sparse", "omitted.txt"), "present");
  const repaired = await freezeSourcePresentation(root, Buffer.from("source.txt\0sparse/omitted.txt\0"), coordinates, io);
  try { expect(await readFile(join(repaired.root, "sparse", "omitted.txt"), "utf8")).toBe("present"); }
  finally { await repaired.remove(); }
});

it("validates each parent once per pass and refuses one that leaves the source by the closing recheck", async () => {
  const { root, io } = await fixture();
  await mkdir(join(root, "dir"));
  await Promise.all(["a.txt", "b.txt"].map(name => writeFile(join(root, "dir", name), name)));
  const outside = await realpath(await mkdtemp(join(tmpdir(), "arc-source-escape-unit-")));
  directories.push(outside);
  let resolutions = 0;
  let escape = false;
  io.realpath = async path => {
    if (path !== join(root, "dir")) return nodeSourcePresentationIO.realpath(path);
    resolutions++;
    return escape && resolutions > 1 ? outside : nodeSourcePresentationIO.realpath(path);
  };
  const listing = Buffer.from("dir/a.txt\0dir/b.txt\0");
  const captured = await freezeSourcePresentation(root, listing, coordinates, io);
  await captured.remove();
  expect(resolutions).toBe(2);
  resolutions = 0;
  escape = true;
  await expect(freezeSourcePresentation(root, listing, coordinates, io))
    .rejects.toThrow(/parent is not a contained directory.*retry.*local/iu);
  expect(resolutions).toBe(2);
});

it.each(["EACCES", "ENOENT"])("reports unavailable source storage (%s) as a filesystem failure with repair and retry guidance", async code => {
  const { root, io, owned } = await fixture();
  const createDirectory = io.files.createDirectory;
  io.files.createDirectory = async () => { throw Object.assign(new Error("storage unavailable"), { code }); };
  const refused = freezeSourcePresentation(root, Buffer.from("source.txt\0"), coordinates, io);
  await expect(refused).rejects.toThrow(/source filesystem operation failed.*repair.*retry.*local/iu);
  await expect(refused).rejects.not.toThrow(/absent/iu);
  expect(owned).toEqual([]);
  io.files.createDirectory = createDirectory;
  const retry = await freezeSourcePresentation(root, Buffer.from("source.txt\0"), coordinates, io);
  try { expect(await readFile(join(retry.root, "source.txt"))).toEqual(Buffer.alloc(128 * 1024, 65)); }
  finally { await retry.remove(); }
});
