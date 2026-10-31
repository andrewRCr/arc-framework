/** The ignore files a guard pass rests on, recorded in the index and compared by the racy rule, over real files. */
import { lstat, mkdir, mkdtemp, rm, symlink, unlink, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SlugSchema } from "../../../../src/lib/kernel/index.js";
import { gitBlobId } from "../../../../src/lib/store/projection/blob-id.js";
import { PROJECTION_REFERENCE, readReference } from "../../../../src/lib/store/projection/change-detection.js";
import { compareIgnoreFiles, snapshotIgnoreFiles } from "../../../../src/lib/store/projection/ignore-snapshot.js";
import { commitProjectionIndex } from "../../../../src/lib/store/projection/index-file.js";
import type { FileStat, ProjectionIndex } from "../../../../src/lib/store/projection/index-schema.js";
import type { ProjectionLocation } from "../../../../src/lib/store/projection/location.js";

const T = new Date("2026-10-31T12:00:00.000Z");
const LATER = new Date(T.getTime() + 1_000);

let checkout: string;
let location: ProjectionLocation;
let gitignore: string;
let exclude: string;
beforeEach(async () => {
  checkout = await mkdtemp(join(tmpdir(), "arc-projection-ignore-"));
  const gitDir = join(checkout, ".git");
  location = { gitDir, commonDir: gitDir, primary: true, stateDir: join(gitDir, "arc-projection") };
  await mkdir(location.stateDir, { recursive: true });
  gitignore = join(checkout, ".gitignore");
  exclude = join(gitDir, "info", "exclude");
});
afterEach(async () => { await rm(checkout, { recursive: true, force: true }); });

const EMPTY_INDEX: ProjectionIndex = {
  format: 1, state: null,
  projectedUnder: { view: { mode: "mine", pins: [] }, identity: SlugSchema.parse("andrew"), claim: null, layoutActive: "nested" },
  withheldCopies: [], tripwires: {}, ignoreFiles: null, entries: {},
};

async function statOf(target: string): Promise<FileStat> {
  const s = await lstat(target, { bigint: true });
  return { type: "file", size: s.size, mtimeNs: s.mtimeNs, ino: s.ino };
}

async function writeAt(target: string, content: string, at: Date): Promise<void> {
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, content);
  await utimes(target, at, at);
}

/** Record a guard pass's snapshot in the index, its reference pinned to `referenceAt`. */
async function passed(referenceAt: Date): Promise<ProjectionIndex> {
  const ignoreFiles = await snapshotIgnoreFiles([gitignore, exclude], "sha1");
  const index = await commitProjectionIndex({
    location, checkout, index: { ...EMPTY_INDEX, ignoreFiles }, recorded: { entries: new Set(), ignoreFiles: true },
  });
  await utimes(join(checkout, PROJECTION_REFERENCE), referenceAt, referenceAt);
  return index;
}

const compared = async (index: ProjectionIndex): Promise<"changed" | "unchanged"> =>
  compareIgnoreFiles(index.ignoreFiles, await readReference(checkout), "sha1");

describe("the ignore-file snapshot", () => {
  it("records an absent ignore file as absent, and reads unchanged until one is created, edited, or deleted", async () => {
    await writeAt(gitignore, ".arc/user/*/\n", T);
    const index = await passed(LATER);
    expect(index.ignoreFiles).toEqual([
      { path: gitignore, stat: await statOf(gitignore), blob: gitBlobId(".arc/user/*/\n", "sha1") },
      { path: exclude, stat: null, blob: null },
    ]);
    expect(await compared(index)).toBe("unchanged");
    expect(await compareIgnoreFiles(null, await readReference(checkout), "sha1")).toBe("changed");

    await writeAt(exclude, ".arc/backlog/\n", T);
    expect(await compared(index)).toBe("changed");
    const created = await passed(LATER);
    await writeAt(gitignore, "!.arc/user/*/\n", T);
    expect(await compared(created)).toBe("changed");
    const edited = await passed(LATER);
    await unlink(exclude);
    expect(await compared(edited)).toBe("changed");
  });

  it.each([
    ["edited at the same size", "#arc/user/*/\n"],
    ["truncated to empty", ""],
  ])("reads an ignore file %s in the guard's tick as changed after a later index write", async (_case, save) => {
    await writeAt(gitignore, ".arc/user/*/\n", T);
    const index = await passed(T);
    await writeAt(gitignore, save, T);
    const later = await commitProjectionIndex({
      location, checkout, index, recorded: { entries: new Set(), ignoreFiles: false },
    });
    expect(await readReference(checkout)).toBeGreaterThan(BigInt(T.getTime()) * 1_000_000n);
    expect(await compared(later)).toBe("changed");
  });

  it("reads an ignore file through a symbolic link, as Git does, and a link that loops as absent", async () => {
    const target = join(checkout, "dotfiles", "gitignore");
    await writeAt(target, ".arc/user/*/\n", T);
    await symlink(target, gitignore);
    await mkdir(dirname(exclude), { recursive: true });
    await symlink(exclude, exclude);
    const index = await passed(LATER);
    expect(index.ignoreFiles).toEqual([
      { path: gitignore, stat: await statOf(target), blob: gitBlobId(".arc/user/*/\n", "sha1") },
      { path: exclude, stat: null, blob: null },
    ]);
    await writeAt(target, "!.arc/user/*/\n", T);
    expect(await compared(index)).toBe("changed");
  });
});
