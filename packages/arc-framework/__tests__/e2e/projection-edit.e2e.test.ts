/** Before off-branch storage, archive editing remains an ordinary tracked-file operation. */
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import { cleanupTempDir, createTempRepo, runArc } from "./helpers.js";

it("refuses edit as unsupported while leaving an archived file writable and its projection index unread", async () => {
  const checkout = await createTempRepo("arc-projection-edit-");
  try {
    const folder = join(checkout, ".arc/completed/2026-q4");
    await mkdir(folder, { recursive: true });
    const path = ".arc/completed/2026-q4/errand-example.md", file = join(checkout, path);
    await writeFile(file, "Tracked archive prose\n");
    const index = join(checkout, ".git/arc-projection/index");
    await mkdir(join(checkout, ".git/arc-projection"), { recursive: true });
    await writeFile(index, "unreadable projection index");
    const before = (await stat(file)).mode;
    const result = await runArc(["edit", path, "--json"], checkout);
    expect(result.exitCode, JSON.stringify(result)).toBe(1);
    expect(JSON.parse(result.stdout)).toMatchObject({ status: "refused", refusal: {
      code: "unsupported", remedy: { text: expect.stringContaining("in place") },
    } });
    expect((await stat(file)).mode).toBe(before);
    await writeFile(file, "An in-place tracked correction\n");
    expect(await readFile(file, "utf8")).toBe("An in-place tracked correction\n");
    expect(await readFile(index, "utf8")).toBe("unreadable projection index");
  } finally { await cleanupTempDir(checkout); }
});
