import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const run = promisify(execFile);
const root = resolve(import.meta.dirname, "../../../..");

describe("review-gate package boundary", () => {
  it("ships extension shells without repository controller implementation", async () => {
    const { stdout } = await run("npm", ["pack", "--dry-run", "--json", "--workspace", "@arc-framework/cli"], {
      cwd: root, maxBuffer: 10 * 1024 * 1024, timeout: 30_000,
    });
    const packs = JSON.parse(stdout) as Array<{ files: Array<{ path: string }> }>;
    const paths = packs[0]?.files.map(({ path }) => path) ?? [];
    expect(paths).toContain("arc/system/extensions/pre-pr-open.md");
    expect(paths).toContain("arc/system/extensions/post-pr-open.md");
    expect(paths).toContain("arc/system/workflows/arc/supplemental/run-errand.md");
    expect(paths.some((path) => path.includes("src/scripts/review-gate"))).toBe(false);
    expect(paths.some((path) => path.startsWith(".github/"))).toBe(false);
    expect(paths.some((path) => path.includes("coordinate-pr-review"))).toBe(false);
  });

  it("keeps configured project review actions inactive and outside package content", async () => {
    const [projectPostOpen, projectPreMerge, packagePostOpen, packagePreMerge] = await Promise.all([
      readFile(resolve(root, ".arc/system/extensions/post-pr-open.md"), "utf8"),
      readFile(resolve(root, ".arc/system/extensions/pre-merge.md"), "utf8"),
      readFile(resolve(root, "packages/arc-framework/arc/system/extensions/post-pr-open.md"), "utf8"),
      readFile(resolve(root, "packages/arc-framework/arc/system/extensions/pre-merge.md"), "utf8"),
    ]);
    expect(projectPostOpen).toContain("active: false");
    expect(projectPreMerge).toContain("active: false");
    expect(projectPostOpen).toContain("coordinate-pr-review.md");
    expect(projectPreMerge).toContain("coordinate-pr-review.md");
    expect(packagePostOpen).toContain("[No extension configured]");
    expect(packagePreMerge).toContain("[No extension configured]");
  });

  it("adds no production dependency, CLI command, or provider registry", async () => {
    const manifest = JSON.parse(await readFile(resolve(root, "packages/arc-framework/package.json"), "utf8")) as {
      dependencies: Record<string, string>;
    };
    const cli = await readFile(resolve(root, "packages/arc-framework/src/cli.ts"), "utf8");
    expect(Object.keys(manifest.dependencies).sort()).toEqual(["@clack/prompts", "commander", "js-yaml", "semver"]);
    expect(cli).not.toMatch(/review-gate|coderabbit|provider-registry/iu);
  });
});
