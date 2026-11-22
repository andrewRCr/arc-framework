/** Preparing an aside directory belongs to the archive move's scoped refusal boundary. */
import { expect, it, vi } from "vitest";
import { dirname, join } from "node:path";
import { chmod, readFile, writeFile } from "node:fs/promises";
import { prepareSwap, SWAP_WRITER } from "../../../helpers/store/projection/swap-fixture.js";
import { runSecondCheck } from "../../../../src/lib/store/projection/second-check.js";
import { ASIDE_FILES_ROOT } from "../../../../src/lib/store/projection/aside.js";
import { removeGitBackedDirs } from "../../../helpers/temp-repo.js";

const fault = vi.hoisted(() => ({ directory: "", hits: 0 }));
vi.mock("node:fs/promises", async original => {
  const fs = await original<typeof import("node:fs/promises")>();
  const mkdir = ((path, options) => {
    if (path === fault.directory) {
      fault.hits++;
      throw Object.assign(new Error("cannot prepare copy directory"), { code: "EACCES" });
    }
    return fs.mkdir(path, options);
  }) as typeof fs.mkdir;
  return { ...fs, mkdir, default: { ...fs, mkdir } };
});

it("keeps the original archive file if preparation for its forward capture is refused", async () => {
  const h = await prepareSwap({ path: ".arc/completed/2026-q4/01_alpha/meta-alpha.md" });
  const absolute = join(h.seeded.checkout, h.path), before = await readFile(absolute);
  const folder = join(h.seeded.checkout, ASIDE_FILES_ROOT, h.path.slice(".arc/".length));
  try {
    const hits = fault.hits;
    const result = await h.swap({ hooks: { afterRecheck: async () => { fault.directory = folder; } } });
    expect(result.unreplaced).toContain(h.path);
    expect(fault.hits).toBeGreaterThan(hits);
    expect(await readFile(absolute)).toEqual(before);
  } finally {
    fault.directory = "";
    await removeGitBackedDirs([h.seeded.checkout]);
  }
});

it("keeps the displaced edit and installed archive file if put-back preparation is refused", async () => {
  const h = await prepareSwap({ path: ".arc/completed/2026-q4/01_alpha/meta-alpha.md" });
  try {
    const batch = await h.swap();
    const [copy] = batch.copies;
    if (copy === undefined) throw new Error("The fixture did not displace a file");
    const absolute = join(h.seeded.checkout, h.path), installed = await readFile(absolute);
    const at = join(h.seeded.checkout, copy.copy), edited = "A displaced edit.\n";
    await chmod(at, 0o644);
    await writeFile(at, edited);

    const hits = fault.hits;
    const checked = await runSecondCheck({ checkout: h.seeded.checkout, location: h.seeded.location,
      index: batch.index, copies: batch.copies, format: "sha1", writer: SWAP_WRITER,
      takeIn: async request => {
        fault.directory = dirname(at);
        return { answer: "refused", entry: request.entry, mark: { reason: "held", remedy: { text: "Repair the edit." } } };
      } });
    expect(checked.blockedDestinations.has(h.path)).toBe(true);
    expect(fault.hits).toBeGreaterThan(hits);
    expect(await readFile(at, "utf8")).toBe(edited);
    expect(await readFile(absolute)).toEqual(installed);
  } finally {
    fault.directory = "";
    await removeGitBackedDirs([h.seeded.checkout]);
  }
});
