/** Change detection by Git's racy rule, over real files. */
import { lstat, mkdir, mkdtemp, readFile, rename, rm, symlink, unlink, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { gitBlobId } from "../../../../src/lib/store/projection/blob-id.js";
import {
  checkChange, PROJECTION_REFERENCE, readReference, type ChangeCheck,
} from "../../../../src/lib/store/projection/change-detection.js";

let checkout: string;
let path: string;
beforeEach(async () => {
  checkout = await mkdtemp(join(tmpdir(), "arc-projection-change-"));
  path = join(checkout, ".arc", "active", "meta-alpha.md");
  await mkdir(dirname(path), { recursive: true });
});
afterEach(async () => { await rm(checkout, { recursive: true, force: true }); });

const T = new Date("2026-10-31T12:00:00.000Z");
const reads: string[] = [];
const recordingRead = async (target: string): Promise<Uint8Array> => { reads.push(target); return readFile(target); };

async function statOf(target: string): Promise<NonNullable<ChangeCheck["recorded"]>> {
  const s = await lstat(target, { bigint: true });
  return { type: "file", size: s.size, mtimeNs: s.mtimeNs, ino: s.ino };
}

/** Write the file at time `at`, record its entry, and write the reference at `referenceAt`. */
async function recorded(content: string, at: Date, referenceAt: Date): Promise<ChangeCheck> {
  await writeFile(path, content);
  await utimes(path, at, at);
  const reference = join(checkout, PROJECTION_REFERENCE);
  await mkdir(dirname(reference), { recursive: true });
  await writeFile(reference, "");
  await utimes(reference, referenceAt, referenceAt);
  return {
    path, recorded: await statOf(path), written: gitBlobId(content, "sha1"),
    reference: (await lstat(reference, { bigint: true })).mtimeNs, format: "sha1",
  };
}

describe("change detection", () => {
  it("finds a same-size rewrite within one modification-time tick by the hash", async () => {
    const check = await recorded("version one\n", T, T);
    await writeFile(path, "version two\n");
    await utimes(path, T, T);
    expect(await checkChange(check, recordingRead))
      .toMatchObject({ status: "changed", blob: gitBlobId("version two\n", "sha1") });
  });

  it("reads a symbolic link replacing a projected file as absent, never hashing it or reading its target",
    async () => {
    const check = await recorded("version one\n", T, new Date(T.getTime() + 1_000));
    const target = join(checkout, "elsewhere.md");
    await writeFile(target, "version one\n");
    await unlink(path);
    await symlink(target, path);
    reads.length = 0;
    expect(await checkChange(check, recordingRead)).toEqual({ status: "absent" });
    expect(reads).toEqual([]);
  });

  it("finds a replacement keeping the size and an older modification time through its changed file identity", async () => {
    const check = await recorded("version one\n", T, new Date(T.getTime() + 1_000));
    const copy = join(checkout, "copy.md");
    await writeFile(copy, "version two\n");
    await utimes(copy, T, T);
    await rename(copy, path);
    expect(await checkChange(check, recordingRead)).toMatchObject({ status: "changed" });
  });

  it("hashes every entry while the reference is missing", async () => {
    const check = await recorded("version one\n", T, new Date(T.getTime() + 1_000));
    expect(await readReference(checkout)).toBe(check.reference);
    await rm(join(checkout, PROJECTION_REFERENCE));
    const reference = await readReference(checkout);
    expect(reference).toBeNull();
    reads.length = 0;
    expect(await checkChange({ ...check, reference }, recordingRead)).toMatchObject({ status: "hashed-clean" });
    expect(reads).toEqual([path]);
  });
});
