import { execFile } from "node:child_process";
import { access, mkdir, mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { promisify } from "node:util";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

const run = promisify(execFile);
const root = resolve(import.meta.dirname, "../../../..");

describe("review-gate package boundary", () => {
  it("ships extension shells without repository controller implementation", async () => {
    const packageState = await mkdtemp(join(tmpdir(), "arc-review-package-state-"));
    const isolatedHome = join(packageState, "home");
    const isolatedCache = join(packageState, "npm-cache");
    await mkdir(isolatedHome);
    try {
      const { stdout } = await run(
        "npm",
        ["pack", "--dry-run", "--json", "--workspace", "@arc-framework/cli"],
        {
          cwd: root,
          maxBuffer: 10 * 1024 * 1024,
          timeout: 30_000,
          env: { ...process.env, HOME: isolatedHome, npm_config_cache: isolatedCache },
        },
      );
      const packs = JSON.parse(stdout) as Array<{ files: Array<{ path: string }> }>;
      const paths = packs[0]?.files.map(({ path }) => path) ?? [];
      expect(paths).toContain("arc/system/extensions/pre-pr-open.md");
      expect(paths).toContain("arc/system/extensions/post-pr-open.md");
      expect(paths).toContain("arc/system/workflows/arc/supplemental/run-errand.md");
      expect(paths.some((path) => path.includes("src/scripts/review-gate"))).toBe(false);
      expect(paths.some((path) => path.startsWith(".github/"))).toBe(false);
      expect(paths.some((path) => path.includes("coordinate-pr-review"))).toBe(false);
      await expect(access(join(isolatedHome, ".npm"))).rejects.toMatchObject({ code: "ENOENT" });
      await expect(access(isolatedCache)).resolves.toBeUndefined();
    } finally {
      await rm(packageState, { recursive: true, force: true });
    }
  });

  it("keeps project and packaged extension seams inactive", async () => {
    const [projectPostOpen, projectPreMerge, packagePostOpen, packagePreMerge] = await Promise.all([
      readFile(resolve(root, ".arc/system/extensions/post-pr-open.md"), "utf8"),
      readFile(resolve(root, ".arc/system/extensions/pre-merge.md"), "utf8"),
      readFile(resolve(root, "packages/arc-framework/arc/system/extensions/post-pr-open.md"), "utf8"),
      readFile(resolve(root, "packages/arc-framework/arc/system/extensions/pre-merge.md"), "utf8"),
    ]);
    expect(projectPostOpen).toContain("active: false");
    expect(projectPreMerge).toContain("active: false");
    expect(projectPostOpen).not.toMatch(/coordinate-pr-review|controller/iu);
    expect(projectPreMerge).not.toMatch(/coordinate-pr-review|controller/iu);
    expect(packagePostOpen).toContain("[No extension configured]");
    expect(packagePreMerge).toContain("[No extension configured]");
  });

  it("adds no production dependency, CLI command, or provider registry", async () => {
    const [manifestText, rootManifestText, tsup] = await Promise.all([
      readFile(resolve(root, "packages/arc-framework/package.json"), "utf8"),
      readFile(resolve(root, "package.json"), "utf8"),
      readFile(resolve(root, "packages/arc-framework/tsup.config.ts"), "utf8"),
    ]);
    const manifest = JSON.parse(manifestText) as {
      dependencies: Record<string, string>;
      scripts: Record<string, string>;
    };
    const rootManifest = JSON.parse(rootManifestText) as { scripts: Record<string, string> };
    const cli = await readFile(resolve(root, "packages/arc-framework/src/cli.ts"), "utf8");
    expect(Object.keys(manifest.dependencies).sort()).toEqual([
      "@clack/prompts",
      "commander",
      "execa",
      "js-yaml",
      "neverthrow",
      "semver",
      "string-width",
      "which-command",
      "zod",
    ]);
    expect(cli).not.toMatch(/review-gate|coderabbit|provider-registry/iu);
    expect(tsup).toContain('entry: ["src/cli.ts"]');
    expect(Object.keys(manifest.scripts).some((name) => name.startsWith("review-gate:"))).toBe(false);
    expect(Object.keys(rootManifest.scripts).some((name) => name.startsWith("review-gate:"))).toBe(false);
    expect(Object.values(manifest.scripts).some((script) => script.includes("src/scripts/review-gate"))).toBe(false);
    expect(Object.values(rootManifest.scripts).some((script) => script.includes("src/scripts/review-gate"))).toBe(false);
  });

  it("has no private review-gate launchers", async () => {
    const launcherRoot = resolve(root, "packages/arc-framework/src/scripts/review-gate");
    const launchers = (await readdir(launcherRoot)).filter((name) => /^run-.*\.ts$/u.test(name)).sort();
    expect(launchers).toEqual([]);
  });
});
