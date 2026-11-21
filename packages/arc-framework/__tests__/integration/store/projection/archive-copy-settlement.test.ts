import { chmod, lstat, mkdir, readFile, rename, symlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { expect, it, vi } from "vitest";
import { archiveRetirementFixture } from "../../../helpers/store/projection/archive-retirement.js";
import { prepareSwap, SWAP_WRITER } from "../../../helpers/store/projection/swap-fixture.js";
import { removeGitBackedDirs } from "../../../helpers/temp-repo.js";
import { checkProjectionRemoval } from "../../../../src/lib/store/projection/removal-check.js";
import { createProjectionEnginePorts } from "../../../../src/lib/store/projection/engine-ports.js";
import { nameAsideFile } from "../../../../src/lib/store/projection/aside.js";
import { gitBlobId } from "../../../../src/lib/store/projection/blob-id.js";
import { runSecondCheck } from "../../../../src/lib/store/projection/second-check.js";

const fault = vi.hoisted(() => ({ payload: "", asideStat: false, hits: 0 }));
vi.mock("node:fs/promises", async original => {
  const fs = await original<typeof import("node:fs/promises")>();
  const reject = (path: string) => {
    fault.hits++;
    throw Object.assign(new Error("EACCES: permission denied, " + path), { code: "EACCES" });
  };
  const readFile = ((...args: Parameters<typeof fs.readFile>) =>
    args[0] === fault.payload ? reject(fault.payload) : fs.readFile(...args)) as typeof fs.readFile;
  const lstat = ((...args: Parameters<typeof fs.lstat>) =>
    fault.asideStat && typeof args[0] === "string" && args[0].endsWith(".aside")
      ? reject(args[0]) : fs.lstat(...args)) as typeof fs.lstat;
  return { ...fs, readFile, lstat, default: { ...fs, readFile, lstat } };
});

it("returns the archive access remedy from removal feasibility, persist and release for an unindexed payload", async () => {
  const h = await archiveRetirementFixture(), content = "Original.\n";
  const writer = await createProjectionEnginePorts(h.checkout).writer();
  const path = h.folder + "/unindexed.txt", copy = nameAsideFile({ path, writer, role: "aside", base: gitBlobId(content, "sha1") });
  await mkdir(dirname(join(h.checkout, copy)), { recursive: true });
  await writeFile(join(h.checkout, copy), content);
  fault.payload = join(h.checkout, copy);
  try {
    for (const disposition of ["remove", "release"] as const) {
      const check = await checkProjectionRemoval(h.checkout, h.context, disposition);
      expect.soft(check).toMatchObject({ kind: "unobservable", detail: expect.stringMatching(/repair access/i) });
      const retirement = await h.retire(disposition === "remove" ? "persist" : "release");
      expect.soft(retirement).toMatchObject({ kind: "refused", remedy: { text: expect.stringMatching(/repair access/i) } });
    }
  } finally { fault.payload = ""; }
  expect((await checkProjectionRemoval(h.checkout, h.context)).kind).toBe("passes");
});

it("retains the logical archive path if typing its original aside fails during swap rollback", async () => {
  const h = await prepareSwap({ path: ".arc/completed/2026-q4/01_alpha/meta-alpha.md" });
  const before = fault.hits;
  try {
    const result = await h.swap({ fs: { link: async () => {
      fault.asideStat = true;
      throw Object.assign(new Error("Staged source disappeared before link"), { code: "ENOENT" });
    } } });
    expect(fault.hits).toBeGreaterThan(before);
    expect(result.unreplaced).toEqual([h.path]);
    expect(result.index.entries[h.path]?.refused?.remedy.text).toMatch(/repair access/i);
  } finally { fault.asideStat = false; await removeGitBackedDirs([h.seeded.checkout]); }
});

it("second-check put-back keeps a late junction above owed work at the destination", async () => {
  const h = await prepareSwap({ path: ".arc/completed/2026-q4/01_alpha/meta-alpha.md" });
  try {
    const batch = await h.swap();
    const [copy] = batch.copies;
    if (copy === undefined) throw new Error("Expected the first swap to leave an aside copy");
    await chmod(join(h.seeded.checkout, copy.copy), 0o600);
    await writeFile(join(h.seeded.checkout, copy.copy), "Late displaced edit.\n");
    const directory = join(h.seeded.checkout, "restored-directory"), child = "child.md";
    await mkdir(directory);
    await writeFile(join(directory, child), "A different unindexed edit.\n");
    let rejected = false, moved = false;
    const mark = { reason: "waiting edit", remedy: { text: "Open the file first." } };
    const checked = await runSecondCheck({ checkout: h.seeded.checkout, location: h.seeded.location,
      index: { ...batch.index, archiveDiscoveryPending: [h.path + "/" + child], state: null }, copies: batch.copies,
      format: "sha1", writer: SWAP_WRITER, takeIn: async req => {
        rejected = true;
        return { answer: "refused", mark, entry: { ...req.entry, refused: mark } };
      }, checkpoint: async () => {
        if (!rejected || moved) return;
        moved = true;
        await rename(h.file, h.file + ".prior");
        await symlink(directory, h.file, "junction");
      } });
    expect(moved).toBe(true);
    expect((await lstat(h.file)).isSymbolicLink(), JSON.stringify(checked.settled.map(each => each.settlement.kind))).toBe(true);
    expect(await readFile(join(directory, child), "utf8")).toBe("A different unindexed edit.\n");
  } finally { await removeGitBackedDirs([h.seeded.checkout]); }
});
