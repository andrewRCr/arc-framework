/** Windows refuses catalog separators before they can reach native path lookup. */
import { afterEach, expect, it } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { freezeSourcePresentation } from "../../../../../src/lib/checks/runner/source-presentation.js";
import { nodeSourcePresentationIO } from "../../../../../src/lib/checks/runner/source-io.js";

const directories: string[] = [];
afterEach(async () => { await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true }))); });

it.each(["directory\\file", "..\\outside", "directory\\..\\outside"])("refuses Windows catalog backslash path %s before lookup and accepts repaired spelling", async path => {
  const root = await mkdtemp(join(tmpdir(), "arc-source-platform-"));
  directories.push(root);
  const marker = join(root, "unsafe-lookup");
  const io = { ...nodeSourcePresentationIO, platform: "win32" as const,
    lstat: async (source: string) => {
      if (source.endsWith(path)) {
        await writeFile(marker, "unsafe catalog reached filesystem lookup");
        throw new Error("Unsafe catalog reached filesystem lookup");
      }
      return nodeSourcePresentationIO.lstat(source);
    },
    files: { ...nodeSourcePresentationIO.files, createDirectory: async () => {
      const directory = await nodeSourcePresentationIO.files.createDirectory();
      directories.push(directory); return directory;
    } },
  };
  const coordinates = { tree: "a".repeat(40), merged: [] };
  await expect(freezeSourcePresentation(root, Buffer.from(`${path}\0`), coordinates, io)).rejects.toThrow(/backslash.*Windows.*repair.*retry/iu);
  await expect(readFile(marker)).rejects.toMatchObject({ code: "ENOENT" });
  await writeFile(join(root, "source.txt"), "repaired source\n");
  const repaired = await freezeSourcePresentation(root, Buffer.from("source.txt\0"), coordinates, io);
  try { expect(await readFile(join(repaired.root, "source.txt"), "utf8")).toBe("repaired source\n"); }
  finally { await repaired.remove(); }
});

it.runIf(process.platform !== "win32")("preserves a POSIX backslash as a literal captured filename", async () => {
  const root = await mkdtemp(join(tmpdir(), "arc-source-platform-"));
  directories.push(root);
  const path = "literal\\name";
  await writeFile(join(root, path), "literal bytes\n");
  const source = await freezeSourcePresentation(root, Buffer.from(`${path}\0`), { tree: "a".repeat(40), merged: [] });
  try {
    expect(source.codePaths.get(path)).toBe(path);
    expect(source.manifest.entries[0]?.path).toBe(path);
    expect(await readFile(join(source.root, path), "utf8")).toBe("literal bytes\n");
  } finally { await source.remove(); }
});
