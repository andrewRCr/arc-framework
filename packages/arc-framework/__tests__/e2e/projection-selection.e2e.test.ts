/** The installed CLI exposes selection without touching projection state before the storage flip. */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import { cleanupTempDir, createTempRepo, runArc } from "./helpers.js";

it("prints empty text and JSON selections over the in-repo backend and advertises both options", async () => {
  const checkout = await createTempRepo("arc-projection-selection-");
  try {
    await mkdir(join(checkout, ".arc"));
    await mkdir(join(checkout, ".git", "arc-projection"));
    const index = join(checkout, ".git", "arc-projection", "index");
    await writeFile(index, "unreadable projection index");
    for (const changed of [[], ["--changed"]]) {
      expect(await runArc(["selection", ...changed], checkout)).toMatchObject({ exitCode: 0, stdout: "" });
      const json = await runArc(["selection", ...changed, "--json"], checkout);
      expect(json.exitCode).toBe(0);
      expect(JSON.parse(json.stdout)).toEqual({ paths: [] });
    }
    expect(await readFile(index, "utf8")).toBe("unreadable projection index");
    expect((await runArc(["--help"], checkout)).stdout).toMatch(/^\s+selection\s+/mu);
    const help = (await runArc(["selection", "--help"], checkout)).stdout;
    expect(help).toContain("--changed"); expect(help).toContain("--json");
  } finally { await cleanupTempDir(checkout); }
});

it("refuses the bypass before the in-repo backend's empty result and succeeds when removed", async () => {
  const checkout = await createTempRepo("arc-selection-bypass-");
  try {
    for (const args of [["selection", "--skip-projection", "--json"], ["--skip-projection", "selection", "--json"]]) {
      const skipped = await runArc(args, checkout);
      expect(skipped.exitCode).toBe(1);
      expect(JSON.parse(skipped.stdout)).toMatchObject({ status: "refused", refusal: {
        condition: expect.stringContaining("--skip-projection"), remedy: { text: expect.stringContaining("without --skip-projection") },
      } });
    }
    expect(await runArc(["selection", "--json"], checkout)).toMatchObject({ exitCode: 0, stdout: '{"paths":[]}\n' });
  } finally { await cleanupTempDir(checkout); }
});
