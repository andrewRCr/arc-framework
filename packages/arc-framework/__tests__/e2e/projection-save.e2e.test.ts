/** The installed CLI explains the supported save route before projection storage is enabled. */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import { cleanupTempDir, createTempRepo, runArc } from "./helpers.js";

it.each([{ args: [] }, { args: ["--resolve", "personal/person/andrew/one"] }])("refuses unsupported projection save with $args as whole JSON", async ({ args }) => {
  const checkout = await createTempRepo("arc-projection-save-");
  try {
    await mkdir(join(checkout, ".arc"));
    await mkdir(join(checkout, ".git", "arc-projection"));
    const index = join(checkout, ".git", "arc-projection", "index");
    await writeFile(index, "unreadable projection index");
    const result = await runArc(["save", ...args, "--json"], checkout);
    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stdout)).toMatchObject({ status: "refused", refusal: { code: "unsupported",
      remedy: { text: expect.stringContaining("arc user save"), argv: ["arc", "user", "save"] } } });
    expect(await readFile(index, "utf8")).toBe("unreadable projection index");
    expect((await runArc(["--help"], checkout)).stdout).toMatch(/^\s+save\s+/mu);
    expect((await runArc(["save", "--help"], checkout)).stdout).toContain("--resolve <conflict>");
  } finally { await cleanupTempDir(checkout); }
});
