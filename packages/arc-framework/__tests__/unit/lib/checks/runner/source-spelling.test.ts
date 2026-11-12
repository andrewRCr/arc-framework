/** Stored filesystem spellings remain distinct from canonical code-catalog paths. */
import { afterEach, expect, it } from "vitest";
import { link, mkdtemp, readdir, readFile, rename, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { freezeSourcePresentation, type FrozenSourcePresentation } from "../../../../../src/lib/checks/runner/source-presentation.js";
import { nodeSourcePresentationIO } from "../../../../../src/lib/checks/runner/source-io.js";

const directories: string[] = [];
afterEach(async () => { await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true }))); });
const coordinates = { tree: "a".repeat(40), merged: [] };

async function fixture(code: string, spelling: string) {
  const root = await mkdtemp(join(tmpdir(), "arc-source-spelling-"));
  directories.push(root);
  const source = join(root, spelling);
  const catalogPath = join(root, code);
  await writeFile(source, "literal presentation\n");
  const map = (path: string) => path === catalogPath ? source : path;
  const io = { ...nodeSourcePresentationIO,
    lstat: (path: string) => nodeSourcePresentationIO.lstat(map(path)),
    files: { ...nodeSourcePresentationIO.files,
      openInput: (path: string) => nodeSourcePresentationIO.files.openInput(map(path)),
      createDirectory: async () => {
        const directory = await nodeSourcePresentationIO.files.createDirectory();
        directories.push(directory); return directory;
      },
    },
  };
  return { root, source, io };
}

it.each([{ code: "SOURCE.TXT", spelling: "source.txt" }, { code: "é.txt", spelling: "e\u0301.txt" }])(
  "retains stored spelling $spelling when the catalog names an alias $code", async ({ code, spelling }) => {
    const { root, io } = await fixture(code, spelling);
    const frozen = await freezeSourcePresentation(root, Buffer.from(`${code}\0`), coordinates, io);
    try {
      expect(await readdir(frozen.root)).toEqual([spelling]);
      expect(frozen.manifest.entries[0]?.path).toBe(spelling);
      expect(frozen.codePaths.get(code)).toBe(spelling);
      expect(await readFile(join(frozen.root, spelling), "utf8")).toBe("literal presentation\n");
    } finally { await frozen.remove(); }
  });

it("refuses ambiguous identity spellings and permits retry after removing the ambiguity", async () => {
  const { root, source, io } = await fixture("SOURCE.TXT", "source.txt");
  const duplicate = join(root, "duplicate.txt");
  await link(source, duplicate);
  let unexpected: FrozenSourcePresentation | undefined;
  try {
    await expect(freezeSourcePresentation(root, Buffer.from("SOURCE.TXT\0"), coordinates, io)
      .then(value => { unexpected = value; return value; })).rejects.toThrow(/ambiguous.*repair.*retry.*local/iu);
  } finally { await unexpected?.remove(); }
  await unlink(duplicate);
  const retry = await freezeSourcePresentation(root, Buffer.from("SOURCE.TXT\0"), coordinates, io);
  try { expect(await readdir(retry.root)).toEqual(["source.txt"]); } finally { await retry.remove(); }
});

it("retains one physical entry when distinct catalog paths name that same stored entry", async () => {
  const { root, io } = await fixture("SOURCE.TXT", "source.txt");
  const frozen = await freezeSourcePresentation(root, Buffer.from("SOURCE.TXT\0source.txt\0"), coordinates, io);
  try {
    expect(await readdir(frozen.root)).toEqual(["source.txt"]);
    expect(frozen.manifest.entries).toHaveLength(1);
    expect([...frozen.codePaths]).toEqual([["SOURCE.TXT", "source.txt"], ["source.txt", "source.txt"]]);
  } finally { await frozen.remove(); }
});

it("refuses a catalog alias that changes identity during capture", async () => {
  const { root, io } = await fixture("SOURCE.TXT", "source.txt");
  const other = join(root, "other.txt");
  await writeFile(other, "other physical input\n");
  const originalStat = io.lstat;
  const originalOpen = io.files.openInput;
  let changed = false;
  io.lstat = path => changed && path === join(root, "SOURCE.TXT") ? nodeSourcePresentationIO.lstat(other) : originalStat(path);
  io.files.openInput = async path => {
    const input = await originalOpen(path);
    return { stat: () => input.stat(), read: (buffer: Buffer) => input.read(buffer),
      close: async () => { await input.close(); changed = true; } };
  };
  let unexpected: FrozenSourcePresentation | undefined;
  try {
    await expect(freezeSourcePresentation(root, Buffer.from("SOURCE.TXT\0"), coordinates, io)
      .then(value => { unexpected = value; return value; })).rejects.toThrow(/alias.*changed.*repair.*retry.*local/iu);
  } finally { await unexpected?.remove(); }
});

it("refuses a catalog alias whose stored name is Git administration", async () => {
  const { root, io } = await fixture("GIT~1", ".git");
  let unexpected: FrozenSourcePresentation | undefined;
  try {
    await expect(freezeSourcePresentation(root, Buffer.from("GIT~1\0"), coordinates, io)
      .then(value => { unexpected = value; return value; })).rejects.toThrow(/spelling.*not.*representable.*repair.*retry.*local/iu);
  } finally { await unexpected?.remove(); }
});

it("refuses a changed stored filename even when pathname metadata is cached", async () => {
  const { root, source, io } = await fixture("SOURCE.TXT", "source.txt");
  const before = await io.lstat(source);
  const originalStat = io.lstat;
  const originalOpen = io.files.openInput;
  let renamed = false;
  io.lstat = path => renamed && (path === source || path === join(root, "SOURCE.TXT"))
    ? Promise.resolve(before) : originalStat(path);
  io.files.openInput = async path => {
    const input = await originalOpen(path);
    return { stat: () => input.stat(), read: (buffer: Buffer) => input.read(buffer), close: async () => {
      await input.close();
      await rename(source, join(root, "temporary-spelling"));
      await rename(join(root, "temporary-spelling"), join(root, "Source.txt"));
      renamed = true;
    } };
  };
  let unexpected: FrozenSourcePresentation | undefined;
  try {
    await expect(freezeSourcePresentation(root, Buffer.from("SOURCE.TXT\0"), coordinates, io)
      .then(value => { unexpected = value; return value; })).rejects.toThrow(/spelling.*changed.*repair.*retry.*local/iu);
  } finally { await unexpected?.remove(); }
});
