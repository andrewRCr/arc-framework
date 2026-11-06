/** The installed CLI keeps the global bypass distinct from unsupported projection save. */
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

it.each([{ args: ["save", "--skip-projection", "--json"] }, { args: ["--skip-projection", "save", "--json"] }])(
  "names the global bypass before backend support for $args", async ({ args }) => {
    const checkout = await createTempRepo("arc-projection-skip-save-");
    try {
      await mkdir(join(checkout, ".arc"));
      await mkdir(join(checkout, ".git", "arc-projection"));
      const path = join(checkout, ".git", "arc-projection", "index");
      await writeFile(path, "unreadable projection index");
      const result = await runArc(args, checkout);
      expect(result.exitCode).toBe(1);
      expect(JSON.parse(result.stdout)).toMatchObject({ status: "refused", refusal: { code: "projection-skipped",
        condition: expect.stringContaining("--skip-projection"),
        remedy: { text: expect.stringContaining("without --skip-projection") } } });
      expect(await readFile(path, "utf8")).toBe("unreadable projection index");
    } finally { await cleanupTempDir(checkout); }
  },
);

it.each([{ args: ["--skip-projection", "config", "status", "--json"] },
  { args: ["config", "status", "--skip-projection", "--json"] }])(
  "inherits the global bypass through nested commands for $args", async ({ args }) => {
    const checkout = await createTempRepo("arc-projection-skip-global-");
    try {
      await mkdir(join(checkout, ".arc", "system"), { recursive: true });
      await writeFile(join(checkout, ".arc", "system", "arc-config.yml"), "branch.base: main\n");
      const ordinary = await runArc(["config", "status", "--json"], checkout);
      expect(ordinary.exitCode).toBe(0);
      const skipped = await runArc(args, checkout);
      expect(skipped.exitCode).toBe(0);
      expect(JSON.parse(skipped.stdout)).toEqual(JSON.parse(ordinary.stdout));
      expect((await runArc(["config", "status", "--help"], checkout)).stdout).toContain("--skip-projection");
    } finally { await cleanupTempDir(checkout); }
  },
);
