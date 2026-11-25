/** Composite status exposes a dark projection slot without consulting its index. */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import { cleanupTempDir, createTempRepo, runArc } from "./helpers.js";

it("includes the disabled projection slot in whole composite JSON without changing its index", async () => {
  const checkout = await createTempRepo("arc-projection-status-");
  try {
    await mkdir(join(checkout, ".arc"));
    await mkdir(join(checkout, ".git", "arc-projection"));
    const index = join(checkout, ".git", "arc-projection", "index");
    await writeFile(index, "unreadable projection index");
    const result = await runArc(["status", "--json"], checkout);
    expect(result.exitCode, JSON.stringify(result)).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ mode: "full", projection: { ok: true, value: { kind: "disabled" } } });
    expect(await readFile(index, "utf8")).toBe("unreadable projection index");
  } finally { await cleanupTempDir(checkout); }
});
