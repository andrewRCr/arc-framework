/** Frozen source verification retains identity after transport and dependency preparation. */
import { afterEach, expect, it } from "vitest";
import { chmod, cp, lstat, mkdir, mkdtemp, readFile, readlink, rm, symlink, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { freezeSourcePresentation } from "../../../../../src/lib/checks/runner/source-presentation.js";
import { verifySourcePresentation } from "../../../../../src/lib/checks/runner/source-verify.js";

const directories: string[] = [];
afterEach(async () => { await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true }))); });

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "arc-source-verify-"));
  directories.push(root);
  await writeFile(join(root, "source.txt"), Buffer.from([0, 255, 13, 10]));
  await symlink("source.txt", join(root, "link"), "file");
  const frozen = await freezeSourcePresentation(root, Buffer.from("link\0source.txt\0"), { tree: "a".repeat(40),
    head: "b".repeat(40), base: "c".repeat(40), merged: ["d".repeat(40), "e".repeat(40)] });
  return { original: root, frozen, source: { root: frozen.root, manifest: frozen.manifestPath, digest: frozen.digest,
    coordinates: frozen.manifest.coordinates } };
}

it("verifies captured files and literal links after original edits and independent relocation", async () => {
  const { original, frozen, source } = await fixture();
  try {
    await writeFile(join(original, "source.txt"), "later original content\n");
    expect(await verifySourcePresentation(source)).toEqual(frozen.manifest);
    const relocated = await mkdtemp(join(tmpdir(), "arc-source-relocated-"));
    directories.push(relocated);
    const root = join(relocated, "root");
    const manifest = join(relocated, "manifest.json");
    await cp(frozen.root, root, { recursive: true, verbatimSymlinks: true });
    await cp(frozen.manifestPath, manifest);
    await frozen.remove();
    expect(await verifySourcePresentation({ ...source, root, manifest })).toEqual(frozen.manifest);
    expect(await readFile(join(root, "source.txt"))).toEqual(Buffer.from([0, 255, 13, 10]));
  } finally { await frozen.remove(); }
});

it("permits generated dependency files outside the captured entry set", async () => {
  const { frozen, source } = await fixture();
  try {
    await mkdir(join(frozen.root, "node_modules"));
    await writeFile(join(frozen.root, "node_modules", "generated.js"), "dependency output\n");
    expect(await verifySourcePresentation(source)).toEqual(frozen.manifest);
  } finally { await frozen.remove(); }
});

it.each(["bytes", "size", "permissions", "file kind", "link target"])("refuses changed %s and verifies after repair", async fault => {
  const { frozen, source } = await fixture();
  const path = join(frozen.root, "source.txt");
  const link = join(frozen.root, "link");
  const bytes = Buffer.from([0, 255, 13, 10]);
  const file = frozen.manifest.entries.find(entry => entry.path === "source.txt");
  if (file?.kind !== "file") throw new Error("Expected captured file");
  try {
    if (fault === "bytes") await writeFile(path, Buffer.from([1, 254, 13, 10]));
    else if (fault === "size") await writeFile(path, "changed size");
    else if (fault === "permissions") await chmod(path, file.mode & ~0o222);
    else {
      await writeFile(join(frozen.root, "other.txt"), bytes);
      await unlink(fault === "file kind" ? path : link);
      await symlink("other.txt", fault === "file kind" ? path : link, "file");
    }
    await expect(verifySourcePresentation(source)).rejects.toThrow(/source.*(?:match|changed).*repair.*retry/iu);
    if (fault === "file kind") {
      expect((await lstat(path)).isSymbolicLink()).toBe(true);
      await unlink(path); await writeFile(path, bytes);
    } else if (fault === "link target") {
      expect(await readlink(link)).toBe("other.txt");
      await unlink(link); await symlink("source.txt", link, "file");
    }
    await chmod(path, file.mode);
    await writeFile(path, bytes);
    expect(await verifySourcePresentation(source)).toEqual(frozen.manifest);
  } finally {
    await chmod(path, file.mode).catch(() => undefined);
    await frozen.remove();
  }
});

it.each(["digest", "tree", "head", "base", "merged order"])("refuses mismatched requested %s and permits the original descriptor", async fault => {
  const { frozen, source } = await fixture();
  const changed = fault === "digest" ? { ...source, digest: `sha256:${"0".repeat(64)}` as const }
    : { ...source, coordinates: { ...source.coordinates,
      ...(fault === "merged order" ? { merged: [...source.coordinates.merged].reverse() } : { [fault]: "f".repeat(40) }),
    } };
  try {
    await expect(verifySourcePresentation(changed)).rejects.toThrow(/source.*(?:digest|coordinates).*match.*repair.*retry/iu);
    expect(await verifySourcePresentation(source)).toEqual(frozen.manifest);
  } finally { await frozen.remove(); }
});

it.each(["malformed JSON", "invalid UTF-8", "duplicate entry", "noncanonical encoding"])("refuses %s and verifies the restored manifest", async fault => {
  const { frozen, source } = await fixture();
  const original = await readFile(frozen.manifestPath);
  try {
    if (fault === "malformed JSON") await writeFile(frozen.manifestPath, "{");
    else if (fault === "invalid UTF-8") await writeFile(frozen.manifestPath, Buffer.from([255]));
    else if (fault === "noncanonical encoding") await writeFile(frozen.manifestPath, JSON.stringify(frozen.manifest, null, 2));
    else {
      const first = frozen.manifest.entries[0];
      if (first === undefined) throw new Error("Expected captured entries");
      await writeFile(frozen.manifestPath, JSON.stringify({ ...frozen.manifest, entries: [first, ...frozen.manifest.entries] }));
    }
    await expect(verifySourcePresentation(source)).rejects.toThrow(/(?:manifest|UTF-8).*repair.*retry/iu);
    await writeFile(frozen.manifestPath, original);
    expect(await verifySourcePresentation(source)).toEqual(frozen.manifest);
  } finally { await frozen.remove(); }
});

it.each([false, true])("refuses a descriptor inside source paths, directory link=%s", async linked => {
  const { frozen, source } = await fixture();
  const inside = join(frozen.root, "descriptor.json");
  const directoryLink = join(dirname(frozen.manifestPath), "descriptor-link");
  const alias = join(directoryLink, "descriptor.json");
  try {
    await cp(frozen.manifestPath, inside);
    if (linked) await symlink(frozen.root, directoryLink, "dir");
    await expect(verifySourcePresentation({ ...source, manifest: linked ? alias : inside }))
      .rejects.toThrow(/manifest.*outside.*repair.*retry/iu);
    await unlink(inside);
    expect(await verifySourcePresentation(source)).toEqual(frozen.manifest);
  } finally { await frozen.remove(); }
});
